// src/lib/api.js

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

/* ------------------------------------------------------------------ */
/*  Low-level fetch wrapper                                           */
/* ------------------------------------------------------------------ */
async function call(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const headers = Object.assign({}, opts.headers || {});

  // JSON header if there is a body & no explicit content-type
  if (opts.body && !(headers["Content-Type"] || headers["content-type"])) {
    headers["Content-Type"] = "application/json";
  }

  // Attach store/admin token if present
  let token;
  if (path.startsWith("/admin")) {
    // For admin endpoints, use ADMIN_TOKEN only
    token = localStorage.getItem("ADMIN_TOKEN");
  } else {
    // For normal POS/store endpoints, prefer STORE_TOKEN, fall back to ADMIN_TOKEN
    token =
      localStorage.getItem("STORE_TOKEN") ||
      localStorage.getItem("ADMIN_TOKEN");
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
    fetchOpts.body =
      typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }

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
  if (contentType.includes("application/json")) return res.json();
  return res.text();
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

  const res = await call("/auth/store-login", {
    method: "POST",
    body,
  });

  // Backend returns: { token, store_id }
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
  return call("/invoices", {
    method: "POST",
    body: payload,
  });
}

// List invoices (for history / admin) -> GET /invoices
async function getInvoices(params = {}) {
  const query = new URLSearchParams();
  if (params.store_id != null) query.set("store_id", String(params.store_id));
  if (params.date) query.set("date", params.date);
  if (params.since) query.set("since", params.since);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.items) query.set("items", "1");

  const qs = query.toString();
  const path = qs ? `/invoices?${qs}` : "/invoices";
  return call(path);
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
  return call(`/reports/daily-sales?${qs}`);
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
  return call("/health");
}

async function dbInfo() {
  return call("/db-info");
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

const api = {
  call,
  // auth
  loginStore,
  loginAdmin,
  adminLogin,
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