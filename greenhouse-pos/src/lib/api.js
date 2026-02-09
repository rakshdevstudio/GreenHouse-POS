// src/lib/api.js

const rawBase = import.meta.env.VITE_API_BASE || "";

// Decide API base URL:
// - If VITE_API_BASE is set, use that (trim trailing slashes).
// - Otherwise, when running under Vite dev server (ports 5173/5174/5175),
//   talk to the backend on port 4000.
// - In production (Railway, etc.), default to same-origin.
let API_BASE = "";

if (rawBase && rawBase.trim() !== "") {
  API_BASE = rawBase.replace(/\/+$/, "");
} else if (typeof window !== "undefined") {
  const origin = window.location.origin;

  // If we are on Vite dev server (frontend on 5173/5174/5175),
  // assume backend is on :4000 on the same host.
  if (origin.match(/:5173$|:5174$|:5175$/)) {
    API_BASE = origin.replace(/:\d+$/, ":4000");
  } else {
    // Same-origin (Express serving React in production)
    API_BASE = origin;
  }
}

export function getApiBase() {
  return API_BASE;
}

/* ------------------------------------------------------------------ */
/*  PHASE 3: Electron Environment Detection + Offline Mode           */
/* ------------------------------------------------------------------ */

// Offline mode flag (frontend-only state)
let OFFLINE_MODE = false;

export function setOfflineMode(value) {
  OFFLINE_MODE = value;
  console.log(value ? '📴 Offline mode: ACTIVE' : '🟢 Offline mode: INACTIVE');
}

export function isOfflineMode() {
  return OFFLINE_MODE;
}

const isElectron = () => {
  return (
    typeof window !== 'undefined' &&
    window.electron &&
    typeof window.electron.login === 'function'
  );
};


/* ------------------------------------------------------------------ */
/*  Low-level fetch wrapper                                           */
/* ------------------------------------------------------------------ */
// Request dedupe + short in-memory GET cache to avoid rapid identical fetch storms
const __INFLIGHT_REQS = {}; // key -> Promise
const __GET_CACHE = {}; // key -> { ts, value }
const __GET_CACHE_TTL = 10000; // ms - short TTL to coalesce bursts

async function call(path, opts = {}) {
  // CRITICAL: Prevent failed fetches when offline in Electron
  if (isElectron() && isOfflineMode()) {
    console.warn('🚫 HTTP blocked in offline Electron mode:', path);
    // Return empty/safe defaults based on endpoint to prevent UI crashes
    if (path === '/health') return { status: 'offline' };
    if (path.includes('/products')) return [];
    if (path.includes('/invoices')) return [];
    throw new Error('Offline mode - HTTP calls disabled');
  }

  const url = `${API_BASE}${path}`;
  const headers = Object.assign({}, opts.headers || {});

  // JSON header if there is a body & no explicit content-type
  if (opts.body && !(headers["Content-Type"] || headers["content-type"])) {
    headers["Content-Type"] = "application/json";
  }

  // Attach store/admin token if present
  let token;
  if (path.startsWith("/admin")) {
    token = localStorage.getItem("ADMIN_TOKEN");
  } else {
    token = localStorage.getItem("STORE_TOKEN") || localStorage.getItem("ADMIN_TOKEN");
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const fetchOpts = {
    method: opts.method || "GET",
    headers,
    credentials: "include",
  };

  if (opts.body) {
    fetchOpts.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }

  // --- Simple GET dedupe + short cache ---
  const isGet = (!fetchOpts.method || fetchOpts.method.toUpperCase() === "GET");
  const dedupeKey = isGet ? `${fetchOpts.method || 'GET'}::${url}` : null;

  if (isGet) {
    // Return cached value if still fresh
    try {
      const cached = __GET_CACHE[dedupeKey];
      if (cached && Date.now() - cached.ts < __GET_CACHE_TTL) {
        return cached.value;
      }
    } catch (e) { /* ignore cache read errors */ }

    // If an identical request is already in flight, return its promise
    if (__INFLIGHT_REQS[dedupeKey]) {
      return __INFLIGHT_REQS[dedupeKey];
    }
  }

  // Perform fetch and wrap response handling in a promise
  const p = (async () => {
    const res = await fetch(url, fetchOpts);

    if (!res.ok) {
      let errText;
      try {
        const j = await res.json();
        errText = j.error || j.message || JSON.stringify(j);
      } catch (_) {
        try {
          errText = await res.text();
        } catch {
          errText = `status ${res.status}`;
        }
      }
      const e = new Error(errText || `HTTP ${res.status}`);
      e.status = res.status;
      throw e;
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await res.json();
      if (isGet) {
        try {
          __GET_CACHE[dedupeKey] = { ts: Date.now(), value: json };
        } catch (e) { /* noop */ }
      }
      return json;
    }

    const text = await res.text();
    if (isGet) {
      try {
        __GET_CACHE[dedupeKey] = { ts: Date.now(), value: text };
      } catch (e) { /* noop */ }
    }
    return text;
  })();

  // Track inflight for GET dedupe and clean up afterwards
  if (isGet) {
    __INFLIGHT_REQS[dedupeKey] = p;
    p.finally(() => {
      try { delete __INFLIGHT_REQS[dedupeKey]; } catch (e) { }
    });
  }

  return p;
}

/* ------------------------------------------------------------------ */
/*  Auth helpers                                                      */
/* ------------------------------------------------------------------ */

// Store login – supports both:
//   loginStore("store1", "store1pass")
//   loginStore({ username, password, terminal_uuid })
async function loginStore(arg1, arg2, arg3) {
  let body;
  if (typeof arg1 === "object" && arg1 !== null) {
    body = { ...arg1 };
  } else {
    body = {
      username: arg1,
      password: arg2,
      terminal_uuid:
        arg3 || `web-terminal-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  // 1. ELECTRON IPC PATH (Strict)
  if (isElectron()) {
    try {
      const res = await window.electron.login({
        username: body.username,
        password: body.password,
      });

      // Set offline mode flag based on response
      setOfflineMode(res.online === false);

      // Normalize response to match HTTP shape
      const normalized = {
        token: res.token,
        store_id: res.store?.id || res.store_id,
        user: res.user,
        store: res.store,
        online: res.online,
      };

      if (normalized.token) {
        localStorage.setItem("STORE_TOKEN", normalized.token);
      }
      if (normalized.store_id != null) {
        localStorage.setItem("STORE_ID", String(normalized.store_id));
      }

      console.log(res.online ? '🟢 Online login via IPC' : '📴 Offline login via cached session');
      return normalized;
    } catch (err) {
      console.error('❌ Electron login failed:', err);
      throw err;
    }
  }

  // 2. BROWSER HTTP PATH
  const res = await call("/auth/store-login", {
    method: "POST",
    body,
  });

  if (res && res.token) {
    localStorage.setItem("STORE_TOKEN", res.token);
  }
  if (res && res.store_id != null) {
    localStorage.setItem("STORE_ID", String(res.store_id));
  }

  return res;
}

// Admin login – supports:
//   loginAdmin("admin", "pass")
//   loginAdmin({ username, password })
async function loginAdmin(arg1, arg2) {
  let body;
  if (typeof arg1 === "object" && arg1 !== null) {
    body = { ...arg1 };
  } else {
    body = { username: arg1, password: arg2 };
  }

  const res = await call("/auth/admin-login", {
    method: "POST",
    body,
  });

  // Backend returns: { token, admin_id, username }
  if (res && res.token) {
    localStorage.setItem("ADMIN_TOKEN", res.token);
  }
  if (res && res.username) {
    localStorage.setItem("ADMIN_USERNAME", res.username);
  }

  return res;
}

// GET /auth/terminals?username=store1
async function listTerminals({ username }) {
  if (!username) {
    return { terminals: [] };
  }

  const qs = new URLSearchParams({ username }).toString();
  return call(`/auth/terminals?${qs}`);
}

// Backwards-compatible alias so existing code using api.adminLogin still works
async function adminLogin(arg1, arg2) {
  return loginAdmin(arg1, arg2);
}

/* ------------------------------------------------------------------ */
/*  POS / Store-side APIs                                             */
/* ------------------------------------------------------------------ */

// Simple products list for the POS.
// NOTE: POS.jsx is already doing its own offline caching using
// GH_PRODUCTS_CACHE, so here we just return what the server gives.
async function getProducts(params = {}) {
  // PHASE 3: Skip HTTP in Electron offline mode, force cache usage
  if (isElectron() && isOfflineMode()) {
    console.log('📴 Offline mode: Skipping product fetch, will use cache');
    // Throw error to trigger cache fallback in POS.jsx
    throw new Error('Offline mode - using cached products');
  }

  const query = new URLSearchParams();
  if (params.store_id != null) {
    query.set("store_id", String(params.store_id));
  }
  const qs = query.toString();
  const path = qs ? `/products?${qs}` : "/products";

  const res = await call(path);
  // backend returns { products: [...] }
  const products = Array.isArray(res)
    ? res
    : Array.isArray(res.products)
      ? res.products
      : [];
  return products;
}

// Store-side create product  -> POST /store/products
async function createStoreProduct(payload) {
  return call("/store/products", {
    method: "POST",
    body: payload,
  });
}

// Store-side update product  -> PUT /store/products/:id
async function updateStoreProduct(id, payload) {
  return call(`/store/products/${id}`, {
    method: "PUT",
    body: payload,
  });
}

// Store-side delete product  -> DELETE /store/products/:id
async function deleteStoreProduct(id) {
  return call(`/store/products/${id}`, {
    method: "DELETE",
  });
}

// Admin-side create product -> POST /products/create
async function createProduct(payload) {
  return call("/products/create", {
    method: "POST",
    body: payload,
  });
}

// Admin-side update product -> PATCH /products/:id
async function updateProduct(id, payload) {
  return call(`/products/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

// Admin-side delete product -> DELETE /products/:id
async function deleteProduct(id) {
  return call(`/products/${id}`, {
    method: "DELETE",
  });
}

// Create invoice (POS checkout) -> POST /invoices
async function createInvoice(payload) {
  // 1. ELECTRON IPC PATH (Strict)
  if (isElectron()) {
    try {
      const res = await window.electron.createInvoice(payload);

      // Handle offline response
      if (res.online === false) {
        console.log('📴 Offline invoice created:', res.localId || res.invoice?.id);

        // If main.js returned a full invoice object, use it!
        // This includes calculated totals that aren't in the payload
        if (res.invoice) {
          return {
            invoice: res.invoice,
            message: res.message || "Invoice saved locally",
          };
        }

        // Fallback (legacy logic)
        return {
          invoice: {
            id: res.localId,
            invoice_no: res.localId, // Use localId as invoice number for display
            ...payload,
            created_at: new Date().toISOString(),
            offline: true,
          },
          message: res.message || "Invoice saved locally",
        };
      }

      // Online response - already normalized by backend
      console.log('🟢 Online invoice created via IPC');
      return res;
    } catch (err) {
      console.error('❌ Electron invoice creation failed:', err);
      throw err;
    }
  }

  // 2. BROWSER HTTP PATH
  return call("/invoices", {
    method: "POST",
    body: payload,
  });
}

// List invoices (for history / admin) -> GET /invoices
async function getInvoices(params = {}) {
  let offlineInvoices = [];

  // PHASE 3: Fetch offline pending invoices from Electron storage
  if (isElectron()) {
    try {
      const pendingCallback = window.electron.getOfflineInvoices;
      if (pendingCallback) {
        const raw = await pendingCallback();
        // Map to UI schema
        offlineInvoices = raw.map((inv) => ({
          id: inv.localId,
          invoice_no: `OFFLINE (${inv.localId.split('-').pop()})`, // Shorten for display
          created_at: inv.createdAt,
          total: inv.invoice.total,
          items: inv.invoice.items || [],
          payment_mode: inv.invoice.payment_mode || 'CASH',
          status: 'offline', // Special status for UI
          item_count: (inv.invoice.items || []).length,
          offline: true,
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch offline invoices:', err);
    }
  }

  // If strictly offline mode, return only local data
  if (isElectron() && isOfflineMode()) {
    return offlineInvoices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // Online fetch
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.date) query.set("date", params.date);
  if (params.since) query.set("since", params.since);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.items) query.set("items", "1");

  const qs = query.toString();
  const path = qs ? `/invoices?${qs}` : "/invoices";

  try {
    const onlineInvoices = await call(path);

    // Merge: Offline on top (pending), followed by online
    // Deduplicate? (Offline created are distinct from online DB IDs usually)
    return [...offlineInvoices, ...(Array.isArray(onlineInvoices) ? onlineInvoices : [])];
  } catch (err) {
    // If online call fails, at least return offline ones
    if (offlineInvoices.length > 0) return offlineInvoices;
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Reports + analytics                                               */
/* ------------------------------------------------------------------ */

// GET /reports/daily-sales?store_id=1&date=YYYY-MM-DD
async function getDailySalesReport(params = {}) {
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.date) query.set("date", params.date);
  const qs = query.toString();
  return call(`/admin/reports/daily-sales?${qs}`);
}

// GET /reports/monthly?store_id=1&year=2025&month=12
async function getMonthlyReport(params = {}) {
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.year != null) query.set("year", String(params.year));
  if (params.month != null) query.set("month", String(params.month));
  const qs = query.toString();
  return call(`/reports/monthly?${qs}`);
}

// GET /reports/top-products?store_id=1&days=30&limit=10
async function getTopProducts(params = {}) {
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.days != null) query.set("days", String(params.days));
  if (params.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  return call(`/reports/top-products?${qs}`);
}

// GET /reports/stock-alerts?store_id=1&threshold=10
async function getStockAlerts(params = {}) {
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.threshold != null)
    query.set("threshold", String(params.threshold));
  const qs = query.toString();
  return call(`/reports/stock-alerts?${qs}`);
}

// Admin: GET /admin/reports/daily-sales?store_id=1&date=YYYY-MM-DD
async function adminGetDailySalesReport(params = {}) {
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.date) query.set("date", params.date);
  const qs = query.toString();
  const path = qs ? `/admin/reports/daily-sales?${qs}` : "/admin/reports/daily-sales";
  return call(path);
}

// Admin: GET /admin/reports/monthly?store_id=1&year=2025&month=12
async function adminGetMonthlyReport(params = {}) {
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.year != null) query.set("year", String(params.year));
  if (params.month != null) query.set("month", String(params.month));
  const qs = query.toString();
  const path = qs ? `/admin/reports/monthly?${qs}` : "/admin/reports/monthly";
  return call(path);
}

// Admin: GET /admin/reports/top-products?store_id=1&days=30&limit=10
async function adminGetTopProducts(params = {}) {
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.days != null) query.set("days", String(params.days));
  if (params.limit != null) query.set("limit", String(params.limit));
  const qs = query.toString();
  const path = qs ? `/admin/reports/top-products?${qs}` : "/admin/reports/top-products";
  return call(path);
}

// Admin: GET /admin/reports/stock-alerts?store_id=1&threshold=10
async function adminGetStockAlerts(params = {}) {
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.threshold != null)
    query.set("threshold", String(params.threshold));
  const qs = query.toString();
  const path = qs ? `/admin/reports/stock-alerts?${qs}` : "/admin/reports/stock-alerts";
  return call(path);
}

/* ------------------------------------------------------------------ */
/*  Admin helpers                                                     */
/* ------------------------------------------------------------------ */

// GET /admin/stores
async function getStores() {
  return call("/admin/stores");
}

// POST /admin/impersonate-store { store_id }
async function adminImpersonateStore(store_id) {
  const res = await call("/admin/impersonate-store", {
    method: "POST",
    body: { store_id },
  });

  // This returns a store-style token – store it as STORE_TOKEN
  if (res && res.token) {
    localStorage.setItem("STORE_TOKEN", res.token);
  }
  if (res && res.store_id != null) {
    localStorage.setItem("STORE_ID", String(res.store_id));
  }

  return res;
}

// POST /admin/invoices/:id/void
async function voidInvoice(id, body = {}) {
  return call(`/admin/invoices/${id}/void`, {
    method: "POST",
    body,
  });
}

async function adminVoidInvoice(id, body = {}) {
  return voidInvoice(id, body);
}

// POST /admin/maintenance/purge-invoices { days }
async function purgeOldInvoices(days) {
  return call("/admin/maintenance/purge-invoices", {
    method: "POST",
    body: { days },
  });
}

/* ------------------------------------------------------------------ */
/*  Products meta: history, changes, price updates                    */
/* ------------------------------------------------------------------ */

// GET /product-price-history?product_id=1
async function getProductPriceHistory(product_id) {
  const qs = new URLSearchParams({ product_id: String(product_id) }).toString();
  return call(`/product-price-history?${qs}`);
}

// GET /products/changes?since=ISO&store_id=...
async function getProductChanges(params = {}) {
  const query = new URLSearchParams();
  if (params.since) query.set("since", params.since);
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  const qs = query.toString();
  return call(`/products/changes?${qs}`);
}

// POST /products/update-price
async function updateProductPrice(body) {
  return call("/products/update-price", {
    method: "POST",
    body,
  });
}

// POST /products/update-prices { updates: [...] }
async function bulkUpdateProductPrices(updates) {
  return call("/products/update-prices", {
    method: "POST",
    body: { updates },
  });
}

/* ------------------------------------------------------------------ */
/*  Misc helpers                                                      */
/* ------------------------------------------------------------------ */

async function scaleMock(weight_kg) {
  return call("/scale/mock", {
    method: "POST",
    body: { weight_kg },
  });
}

async function health() {
  // PHASE 3: Skip health check in Electron offline mode
  if (isElectron() && isOfflineMode()) {
    return { status: 'offline' };
  }
  return call("/health");
}

async function dbInfo() {
  return call("/db-info");
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

const api = {
  call,
  setOfflineMode, // ✅ Added
  isOfflineMode,  // ✅ Added
  // auth
  loginStore,
  loginAdmin,
  adminLogin,
  listTerminals,   // ✅ ADD THIS LINE
  // POS / store
  getProducts,
  createStoreProduct,
  updateStoreProduct,
  deleteStoreProduct,
  // Aliases for backwards compatibility (ProductAdmin.jsx expects these)
  storeCreateProduct: createStoreProduct,
  storeUpdateProduct: updateStoreProduct,
  storeDeleteProduct: deleteStoreProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  createInvoice,
  getInvoices,
  // reports
  getDailySalesReport,
  getMonthlyReport,
  getTopProducts,
  getStockAlerts,
  adminGetDailySalesReport,
  adminGetMonthlyReport,
  adminGetTopProducts,
  adminGetStockAlerts,
  // admin
  getStores,
  adminImpersonateStore,
  voidInvoice,
  adminVoidInvoice,
  purgeOldInvoices,
  // product meta
  getProductPriceHistory,
  getProductChanges,
  updateProductPrice,
  bulkUpdateProductPrices,
  // misc
  scaleMock,
  health,
  dbInfo,
};

export default api;