  // src/pages/POS.jsx
  import React, { useEffect, useState, useMemo, useRef } from "react";
  import api, { getApiBase } from "../lib/api";

  // Format invoice date/time consistently for receipt + screen
  function formatInvoiceDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);

    const dateStr = d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const timeStr = d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true, // 12-hour format like 11:56:49 PM
    });

    return `${dateStr} ${timeStr}`;
  }

  export default function POS() {
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState("");
    const [cart, setCart] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [error, setError] = useState(null);
    const [checkoutStatus, setCheckoutStatus] = useState(null);
    const [lastInvoice, setLastInvoice] = useState(null);
    const [checkingOut, setCheckingOut] = useState(false);
    
    const [manualName, setManualName] = useState("");
    const [manualPriceKg, setManualPriceKg] = useState("");
    const [manualPriceQty, setManualPriceQty] = useState("");
    const [manualStock, setManualStock] = useState("");
    const [manualSaving, setManualSaving] = useState(false);

    // Offline support: localStorage keys
      // Compute a per-store products cache key so each store has its own offline catalog
    function getOfflineProductsKey() {
      const storeId = localStorage.getItem("STORE_ID");
      const sid = storeId ? String(storeId) : "default";
      return `GH_PRODUCTS_${sid}`;
    }
    const OFFLINE_QUEUE_KEY = "GH_OFFLINE_INVOICES";

    // Discount & GST (per invoice)
    const [discountPct, setDiscountPct] = useState("");
    const [gstPct, setGstPct] = useState("0"); // e.g. 0, 5, 18

    // Weighing scale flow
    const [activeProduct, setActiveProduct] = useState(null);
    const [weightKg, setWeightKg] = useState("");
    const weightInputRef = useRef(null);
    const searchInputRef = useRef(null);
    const quickAddNameRef = useRef(null);
    const qtyInputRefs = useRef({});
    const [focusQtyForId, setFocusQtyForId] = useState(null);
    const lastInvoicePrintBtnRef = useRef(null);
  // Debug & guard: prevent overlapping product refreshes and add timestamps for tracing
  const productsRefreshInFlightRef = useRef(false);
  const productsLastFetchAtRef = useRef(0);
    useEffect(() => {
      if (activeProduct && weightInputRef.current) {
        // small timeout ensures DOM is updated before focusing
        setTimeout(() => {
          if (weightInputRef.current) {
            weightInputRef.current.focus();
            weightInputRef.current.select(); // highlight existing value if any
          }
        }, 0);
      }
    }, [activeProduct]);

    // Shared loader so we can call from mount, polling, and after checkout
    async function loadProductsFromServer() {
      // Basic guard to prevent concurrent refresh storms
      const now = Date.now();
      // Throttle: skip if last successful start was under 3s ago
      if (productsRefreshInFlightRef.current) {
        console.warn('loadProductsFromServer: skipped because a fetch is already in-flight');
        return;
      }
      if (now - productsLastFetchAtRef.current < 3000) {
        console.warn('loadProductsFromServer: skipped due to throttle, last fetch at', new Date(productsLastFetchAtRef.current).toISOString());
        return;
      }

      productsRefreshInFlightRef.current = true;
      productsLastFetchAtRef.current = now;

      setLoadingProducts(true);
      setError(null);
      console.info('loadProductsFromServer: starting fetch at', new Date(now).toISOString());
      try {
        const res = await api.getProducts();
        // backend returns { products: [...] } or [...]
        const list = Array.isArray(res) ? res : res.products || [];

        // Normalise a `price` field so POS always has a unit price to use
        const normalised = list.map((p) => {
          const rawPrice =
            p.price != null
              ? p.price
              : p.price_per_kg != null
              ? p.price_per_kg
              : p.rate != null
              ? p.rate
              : 0;

          const rawStock =
            p.stock_qty != null
              ? p.stock_qty
              : p.stock != null
              ? p.stock
              : p.qty_in_stock != null
              ? p.qty_in_stock
              : null;

          // Decide unit + whether decimals are allowed.
          // Default: assume "kg" with decimal quantity (for legacy rows).
          const unit =
            p.unit ||
            (p.allow_decimal_qty === false ? "qty" : "kg");

          const allowDecimal =
            p.allow_decimal_qty != null
              ? Boolean(p.allow_decimal_qty)
              : unit === "kg";

          return {
            ...p,
            price: Number(rawPrice) || 0,
            stock_qty:
              rawStock == null || rawStock === ""
                ? null
                : Number(rawStock),
            unit,
            allow_decimal_qty: allowDecimal,
          };
        });

        // sort products by name ascending (case-insensitive) for a consistent POS listing
        const sorted = [...normalised].sort((a, b) => {
          const an = (a.name || "").toString().toLowerCase();
          const bn = (b.name || "").toString().toLowerCase();
          if (an < bn) return -1;
          if (an > bn) return 1;
          return 0;
        });

        // Save to offline cache (per store)
        try {
          const cacheKey = getOfflineProductsKey();
          localStorage.setItem(cacheKey, JSON.stringify(sorted));
        } catch (cacheErr) {
          console.warn("products cache save failed", cacheErr);
        }

        setProducts(sorted);
        console.info('loadProductsFromServer: fetch succeeded, items=', sorted.length);
      } catch (e) {
        console.error("loadProducts", e);
        // Try to fall back to last cached catalog for offline use
        let usedCache = false;
        try {
          const cacheKey = getOfflineProductsKey();
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length) {
              setProducts(parsed);
              usedCache = true;
            }
          }
        } catch (cacheErr) {
          console.warn("products cache read failed", cacheErr);
        }
        if (usedCache) {
          setError("Showing last saved catalog (offline mode).");
        } else {
          setError(e.message || "Failed to load products");
        }
      } finally {
        productsRefreshInFlightRef.current = false;
        setLoadingProducts(false);
        console.info('loadProductsFromServer: finished at', new Date().toISOString());
      }
    }

    // Load products on first mount
    useEffect(() => {
      loadProductsFromServer();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Multi-terminal sync: prefer WebSocket for live updates, fallback to polling only if WS cannot connect
    const wsRef = useRef(null);
    const wsReconnectRef = useRef({ attempt: 0, timer: null, shouldReconnect: true });
    const lastRefreshRef = useRef(0); // debounces catalog refreshes (ms)

    useEffect(() => {
      let mounted = true;

      function scheduleReconnect() {
        if (!wsReconnectRef.current.shouldReconnect || !mounted) return;
        const a = ++wsReconnectRef.current.attempt;
        const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(a, 6)));
        wsReconnectRef.current.timer = setTimeout(() => {
          if (mounted) connectWs();
        }, delay);
      }

      function clearReconnect() {
        if (wsReconnectRef.current.timer) {
          clearTimeout(wsReconnectRef.current.timer);
          wsReconnectRef.current.timer = null;
        }
        wsReconnectRef.current.attempt = 0;
      }

      function safeRefreshCatalog() {
        // debounce rapid invoice events to at most once every 2s
        const now = Date.now();
        if (now - lastRefreshRef.current < 2000) return;
        lastRefreshRef.current = now;
        // keep it non-blocking
        loadProductsFromServer().catch((err) => {
          console.warn('catalog refresh after ws event failed', err);
        });
      }

      function connectWs() {
        try {
          // close existing ws if any (avoid duplicate sockets)
          try {
            const prev = wsRef.current;
            if (prev && prev.readyState !== WebSocket.CLOSED && prev.readyState !== WebSocket.CLOSING) {
              wsReconnectRef.current.shouldReconnect = false; // temporarily stop reconnect while swapping
              try { prev.close(); } catch (e) {}
            }
          } catch (e) { /* ignore */ }

                  const base = getApiBase(); // expected: full origin like "https://example.com" or "http://localhost:8080"
          let origin = '';
          try {
            const parsed = new URL(base);
            origin = parsed.origin; // keeps scheme+host+port
          } catch (e) {
            // fallback to current page origin
            origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
          }

          // choose proper ws scheme
          const scheme = origin.startsWith('https:') ? 'wss:' : 'ws:';
          const host = origin.replace(/^https?:/, ''); // //host[:port]

          const token = localStorage.getItem('TOKEN') || localStorage.getItem('AUTH_TOKEN') || '';
          const url = `${scheme}${host}/ws${token ? '?token=' + encodeURIComponent(token) : ''}`;

          const ws = new WebSocket(url);
          wsRef.current = ws;
          // allow reconnects by default; will be reset on unmount
          wsReconnectRef.current.shouldReconnect = true;

          ws.onopen = () => {
            console.info('POS: ws connected');
            clearReconnect();
            // reset attempt counter
            wsReconnectRef.current.attempt = 0;
          };

          ws.onmessage = (evt) => {
            console.debug('POS: ws.onmessage', evt.data);
            try {
              const msg = JSON.parse(evt.data);
              if (!msg) return;

              if (msg.type === 'invoice_created') {
                console.info('POS: ws invoice_created event', msg.invoice && msg.invoice.id);
                // update lastInvoice if payload present
                if (msg.invoice) {
                  try { setLastInvoice(msg.invoice); } catch (e) { /* ignore */ }
                }
                // debounce catalog refresh
                safeRefreshCatalog();
              }
            } catch (err) {
              console.warn('ws message parse error', err);
            }
          };

          ws.onclose = (ev) => {
            console.warn('POS: ws closed', ev && ev.code, ev && ev.reason);
            // Only schedule reconnect if we didn't intentionally close (e.g., unmount)
            if (!mounted || !wsReconnectRef.current.shouldReconnect) return;
            scheduleReconnect();
          };

          ws.onerror = (err) => {
            console.warn('POS: ws error', err && err.message);
            // close socket to trigger onclose and reconnect logic
            try { ws.close(); } catch (e) {}
          };
        } catch (err) {
          console.warn('POS: ws connect failed', err);
          scheduleReconnect();
        }
      }

      // Start WS connection
      connectWs();

      // Cleanup
      return () => {
        mounted = false;
        try { wsReconnectRef.current.shouldReconnect = false; } catch (e) {}
        try {
          if (wsRef.current) {
            try { wsRef.current.close(); } catch (e) {}
            wsRef.current = null;
          }
        } catch (e) {}
        clearReconnect();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Focus search on first load for quick keyboard billing
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, []);

    // Keyboard shortcuts: focus search, focus weight input, quick add product, quick checkout
    useEffect(() => {
      function handleKeyDown(e) {
        const tag = e.target.tagName;
        const isTypingField =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          e.target.isContentEditable;

        // "/" or Ctrl+K => focus search (even if cursor is elsewhere)
        if (
          (!isTypingField && e.key === "/") ||
          (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "k")
        ) {
          e.preventDefault();
          if (searchInputRef.current) {
            searchInputRef.current.focus();
            searchInputRef.current.select();
          }
          return;
        }

        // F2 or Ctrl+W => jump to weight input (if an item is active)
        if (
          e.key === "F2" ||
          (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "w")
        ) {
          if (activeProduct && weightInputRef.current) {
            e.preventDefault();
            weightInputRef.current.focus();
            weightInputRef.current.select();
          }
          return;
        }

        // Ctrl+N / Cmd+N => focus quick-add product name
        if (e.key.toLowerCase() === "n" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (quickAddNameRef.current) {
            quickAddNameRef.current.focus();
            quickAddNameRef.current.select();
          }
          return;
        }

        // Ctrl+Enter (or Cmd+Enter) => quick checkout (if cart not empty)
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          if (cart.length && !checkingOut) {
            e.preventDefault();
            checkout();
          }
        }
      }

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [activeProduct, cart.length, checkingOut, quickAddNameRef]);

    useEffect(() => {
      if (!focusQtyForId) return;

      const el = qtyInputRefs.current[focusQtyForId];
      if (el) {
        el.focus();
        el.select();
      }

      // reset so future clicks can trigger it again
      setFocusQtyForId(null);
    }, [focusQtyForId, cart.length]);

    // Subscribe to weighing scale stream (Electron ONLY)
    useEffect(() => {
      if (typeof window === "undefined") return;
      if (!window.scale || !window.scale.onData) {
        console.warn("POS: Electron scale bridge not available");
        return;
      }

      console.info("POS: connected to Electron scale bridge");

      window.scale.onData((raw) => {
        console.log("📟 SCALE RAW:", raw);
        if (typeof raw !== "string") return;

        // Handles Essae / RS232 formats like:
        // "ST,GS,+  0.850kg"
        // "WT:0.456"
        // "  1.234 "
        const match = raw.match(/[-+]?\d*\.\d+|\d+/);
        if (!match) return;

        const w = parseFloat(match[0]);
        if (!Number.isFinite(w) || w <= 0) return;

        // Essae veg scales → 3 decimal precision
        const formatted = w.toFixed(3);
        console.log("⚖️ Parsed weight:", formatted);

        // React-controlled update (authoritative)
        setWeightKg(formatted);
      });
    }, [activeProduct]);

    // Dev helper: allow mocking the scale from browser console
    useEffect(() => {
      if (typeof window === "undefined") return;

      // Call: window.scaleMock(0.8567)
      window.scaleMock = (w) => {
        return api.scaleMock(w).catch((err) => {
          console.error("scaleMock failed", err);
        });
      };

      // Cleanup on unmount
      return () => {
        if (window.scaleMock) {
          delete window.scaleMock;
        }
      };
    }, []);

    // ---------- Cart helpers ----------

    function addToCart(product) {
      setCart((prev) => {
        const idx = prev.findIndex((row) => row.product.id === product.id);
        if (idx === -1) {
          return [...prev, { product, qty: 1 }];
        }
        const clone = [...prev];
        clone[idx] = { ...clone[idx], qty: clone[idx].qty + 1 };
        return clone;
      });
    }

    function changeQty(productId, delta) {
      setCart((prev) => {
        const clone = prev
          .map((row) =>
            row.product.id === productId
              ? { ...row, qty: row.qty + delta }
              : row
          )
          .filter((row) => row.qty > 0);
        return clone;
      });
    }

    function handleCartQtyInput(productId, rawValue) {
      setCart((prev) =>
        prev.map((row) => {
          if (row.product.id !== productId) return row;

          // Allow the field to be temporarily empty while typing
          if (rawValue === "") {
            return { ...row, qty: "" };
          }

          let v = Number(rawValue);
          if (!Number.isFinite(v)) return row;
          if (v <= 0) v = 1;

          const qtyInt = Math.round(v);
          return { ...row, qty: qtyInt };
        })
      );
    }

    function removeFromCart(productId) {
      setCart((prev) => prev.filter((row) => row.product.id !== productId));
    }

    function clearCart() {
      setCart([]);
      setCheckoutStatus(null);
    }

    function startWeighing(product) {
      // Decide how this product should be billed.
      const unit =
        product.unit ||
        (product.allow_decimal_qty === false ? "qty" : "kg");
      const isQtyOnly = unit === "qty" && product.allow_decimal_qty === false;

      // For quantity-based items (packets, pieces) we don't need the scale;
      // just bump the cart count by 1 and focus its qty input.
      if (isQtyOnly) {
        setCart((prev) => {
          const existing = prev.find((row) => row.product.id === product.id);
          if (existing) {
            // If it's already in the cart, don't change the qty here, just focus it.
            return prev;
          }
          // Start with an empty quantity so cashier can type it.
          return [...prev, { product, qty: "" }];
        });
        setActiveProduct(null);
        setWeightKg("");
        setError(null);
        setFocusQtyForId(product.id); // tell the effect to focus this line
        return;
      }

      // For weight-based items, open the scale flow.
      setActiveProduct(product);
      setWeightKg("");
      setError(null);
    }

    function handleAddWeightedItem() {
    if (!activeProduct) {
      setError("Pick an item from the left first");
      return;
    }

    const rawKg = parseFloat(weightKg);
    if (Number.isNaN(rawKg) || rawKg <= 0) {
      setError("Enter a valid weight in kg (e.g. 0.8567)");
      return;
    }

    // ❌ no rounding – we keep the exact reading
    const kg = rawKg;

    setCart((prev) => {
      const idx = prev.findIndex((row) => row.product.id === activeProduct.id);
      if (idx === -1) {
        return [...prev, { product: activeProduct, qty: kg }];
      }
      const clone = [...prev];
      clone[idx] = { ...clone[idx], qty: clone[idx].qty + kg };
      return clone;
    });

    setWeightKg("");
    setActiveProduct(null);
    setError(null);
  }

    const totals = useMemo(() => {
      let subtotal = 0;
      for (const row of cart) {
        const price = Number(row.product.price || row.product.rate || 0); // ₹ / kg
        subtotal += price * row.qty; // qty can be 0.8567, etc.
      }

      // Parse discount and GST percentages from state
      const dPct = parseFloat(discountPct);
      const gPct = parseFloat(gstPct);

      const discountPercent = !Number.isNaN(dPct) && dPct > 0 ? dPct : 0;
      const gstPercent = !Number.isNaN(gPct) && gPct > 0 ? gPct : 0;

      const discountAmount = subtotal * (discountPercent / 100);
      const taxable = Math.max(subtotal - discountAmount, 0);

      const gstAmount = taxable * (gstPercent / 100);

      const total = taxable + gstAmount;

      // Backend only has one "tax" field, so we store
      // net adjustment = +GST - Discount so that:
      // DB total = subtotal + tax = subtotal + (gst - discount) = taxable + gst
      const backendTax = gstAmount - discountAmount;

      return {
        subtotal,
        discountAmount,
        taxable,
        gstAmount,
        total,
        discountPercent,
        gstPercent,
        backendTax,
      };
    }, [cart, discountPct, gstPct]);

    const visibleProducts = useMemo(() => {
      if (!search.trim()) return products;
      const q = search.trim().toLowerCase();
      return products.filter((p) =>
        (p.name || "").toLowerCase().includes(q)
      );
    }, [products, search]);

    async function handleAddManualProduct() {
      const name = manualName.trim();
      const priceKgStr = (manualPriceKg || "").trim();
      const priceQtyStr = (manualPriceQty || "").trim();

      if (!name) {
        setError("Please enter a product name");
        return;
      }

      // Decide which price to use
      let unitPrice = null;
      let unitMode = null; // "kg" or "qty"

      if (priceKgStr && priceQtyStr) {
        // If both are filled, prefer kg silently
        unitPrice = Number(priceKgStr);
        unitMode = "kg";
      } else if (priceKgStr) {
        unitPrice = Number(priceKgStr);
        unitMode = "kg";
      } else if (priceQtyStr) {
        unitPrice = Number(priceQtyStr);
        unitMode = "qty";
      } else {
        setError("Enter either price per kg or price per quantity");
        return;
      }

      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        setError("Please enter a valid price");
        return;
      }

      const stockRaw = manualStock.trim();

      setError(null);
      setManualSaving(true);
      try {
        const payload = {
          name,
          // Backend currently expects price_per_kg; we treat this as the generic unit price.
          price_per_kg: unitPrice,
          unit: unitMode === "kg" ? "kg" : "qty",
          allow_decimal_qty: unitMode === "kg",
          // simple auto SKU so backend is happy if it still validates sku
          sku: "QK-" + Date.now(),
        };

        if (stockRaw !== "") {
          const stockNum = parseFloat(stockRaw);
          if (!Number.isNaN(stockNum) && stockNum >= 0) {
            payload.stock_qty = stockNum;
          }
        }

              // Use store-scoped product creation so POS users (store login) can add items
  const created = await api.storeCreateProduct(payload);
        const newProduct = created.product || created;

        // Normalise price: if backend sends a non-zero price, use it; otherwise fall back to unitPrice
        const rawPrice =
          newProduct.price ?? newProduct.price_per_kg ?? newProduct.rate;
        const price =
          rawPrice != null && Number(rawPrice) > 0
            ? Number(rawPrice)
            : Number(unitPrice);

        // Normalise stock: try several possible fields; if they are invalid/null, keep it as null
        const rawStock =
          newProduct.stock_qty ??
          newProduct.stock ??
          newProduct.qty_in_stock ??
          payload.stock_qty;

        const stock_qty =
          rawStock == null || rawStock === "" || Number.isNaN(Number(rawStock))
            ? null
            : Number(rawStock);

            const withPrice = {
        ...newProduct,
        price,
        stock_qty,
        // ensure unit + allow_decimal_qty are present on the front-end copy
        unit: newProduct.unit || payload.unit || (payload.allow_decimal_qty ? "kg" : "qty"),
        allow_decimal_qty:
          newProduct.allow_decimal_qty != null
            ? Boolean(newProduct.allow_decimal_qty)
            : payload.allow_decimal_qty,
      };

        setProducts((prev) => [withPrice, ...prev]);

        // clear form
        setManualName("");
        setManualPriceKg("");
        setManualPriceQty("");
        setManualStock("");
      } catch (e) {
        console.error("quick add product", e);
        setError(e.message || "Failed to quick-add product");
      } finally {
        setManualSaving(false);
      }
    }
    // ---------- Offline invoice helpers ----------
    function readOfflineQueue() {
      try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.warn("read offline queue failed", err);
        return [];
      }
    }

    function writeOfflineQueue(queue) {
      try {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      } catch (err) {
        console.warn("write offline queue failed", err);
      }
    }

    async function syncOfflineInvoices() {
      const queue = readOfflineQueue();
      if (!queue.length) return;

      const remaining = [];
      for (const payload of queue) {
        try {
          await api.createInvoice(payload);
        } catch (err) {
          console.error("sync offline invoice failed", err);
          remaining.push(payload);
        }
      }

      writeOfflineQueue(remaining);
    }

    // Try to sync any offline invoices on mount and whenever we come back online
    useEffect(() => {
      syncOfflineInvoices();

      function handleOnline() {
        syncOfflineInvoices();
      }

      window.addEventListener("online", handleOnline);
      return () => window.removeEventListener("online", handleOnline);
    }, []);

    // ---------- Checkout ----------
    async function checkout() {
      if (!cart.length) return;

      const isOnline =
        typeof navigator !== "undefined" ? navigator.onLine : true;

      const storeId = Number(localStorage.getItem("STORE_ID") || 1);
      const terminalId = Number(localStorage.getItem("TERMINAL_ID") || 7);

      const items = [];

      for (const row of cart) {
        const rawId = row.product.id;
        const numericId =
          typeof rawId === "number" ? rawId : Number(rawId);

        // Skip manual/non-DB products
        if (!Number.isFinite(numericId)) {
          console.warn("Skipping non-DB product in invoice payload:", rawId);
          continue;
        }

        // Decide how this line should be treated
        const unit =
          row.product.unit ||
          (row.product.allow_decimal_qty === false ? "qty" : "kg");
        const isQtyOnly =
          unit === "qty" && row.product.allow_decimal_qty === false;

        let effectiveQty;

        if (isQtyOnly) {
          // For packet / pieces items, read directly from the qty input if available
          const inputEl = qtyInputRefs.current[rawId];
          const rawStr =
            inputEl && typeof inputEl.value === "string"
              ? inputEl.value
              : row.qty === "" || row.qty == null
              ? ""
              : String(row.qty);

          const parsed = parseFloat(rawStr);

          if (!Number.isFinite(parsed) || parsed <= 0) {
            setError(
              "Please enter a valid quantity (pcs) for all items before checkout."
            );
            return;
          }

          // Backend expects integer pieces for qty-only items
          effectiveQty = Math.round(parsed);
        } else {
          // Weight-based (kg) or decimal-friendly products
          const q = Number(row.qty);
          if (!Number.isFinite(q) || q <= 0) {
            setError(
              "Please enter a valid weight/quantity for all items before checkout."
            );
            return;
          }
          // Clamp to 3 decimals to be safe with DB numeric(10,3)
          effectiveQty = Number(q.toFixed(3));
        }

        items.push({
          product_id: numericId,
          qty: effectiveQty,
        });
      }

      if (!items.length) {
        setError(
          "Only manual items in cart. Please add at least one saved product to checkout."
        );
        return;
      }

      const payload = {
        store_id: storeId,
        terminal_id: terminalId,
        idempotency_key: "web-" + Date.now(),
        items,
        tax: Number(totals.backendTax.toFixed(2)),
        payment_mode: "CASH",
      };

      console.log("checkout payload", payload);

      setCheckingOut(true);
      setError(null);
      setCheckoutStatus(null);
      try {
        const res = await api.createInvoice(payload);
        const invoice = res.invoice || res;

        // After successful billing, pull fresh catalog so all terminals see updated stock
        await loadProductsFromServer();

        setLastInvoice(invoice);
        setCheckoutStatus("success");

        // 🔥 Auto-print immediately after checkout (Electron / Desktop)
        setTimeout(() => {
          try {
            if (window.electron && window.electron.print) {
              window.electron.print();
            } else {
              window.print(); // browser fallback
            }
          } catch (e) {
            console.warn("Auto print failed", e);
          }
        }, 300);

        // After success, move keyboard focus to the Print button so cashier can simply press Enter
        setTimeout(() => {
          if (lastInvoicePrintBtnRef.current) {
            lastInvoicePrintBtnRef.current.focus();
          }
        }, 0);

        clearCart();
      } catch (e) {
        console.error("checkout", e);
        const msg = (e && e.message ? e.message : "").toLowerCase();
        const looksLikeNetworkIssue =
          !isOnline ||
          msg.includes("failed to fetch") ||
          msg.includes("networkerror") ||
          msg.includes("network error");

        if (looksLikeNetworkIssue) {
          // Save this invoice locally to be synced later
          const queue = readOfflineQueue();
          queue.push(payload);
          writeOfflineQueue(queue);

          setCart([]); // clear cart but keep other state
          setCheckoutStatus("offline-queued");
          setError(
            "Network seems offline. Bill saved locally and will sync when connection is back."
          );
        } else {
          setCheckoutStatus("error");
          setError(e.message || "Checkout failed");
        }
      } finally {
        setCheckingOut(false);
      }
    }

    // ---------- Render ----------

    return (
      <div className="pos-shell">
        {/* Header */}
        <header className="pos-header">
          <div>
            <h1 className="pos-title">Point of Sale</h1>
            <p className="pos-subtitle">
              Tap an item to add to cart. Adjust quantities on the right and
              checkout in one click.
            </p>
          </div>

          <div className="pos-header-right">
            <span className="dot-online" />
            <span className="pos-header-status">
              {loadingProducts ? "Syncing catalog..." : "Catalog live"}
            </span>
          </div>
        </header>

        {/* Error bar (top-level) */}
        {error && (
          <div className="error-box" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}
            {/* Keyboard shortcuts hint */}
      <div className="pos-shortcuts">
        <div className="pos-shortcuts-title">Keyboard shortcuts</div>
        <div className="pos-shortcuts-keys">
          <div className="pos-shortcuts-item">
            <span className="pos-key-pill">/</span>
            <span className="pos-key-desc">Focus search</span>
          </div>
          <div className="pos-shortcuts-item">
            <span className="pos-key-pill">F2</span>
            <span className="pos-key-desc">Jump to weight</span>
          </div>
          <div className="pos-shortcuts-item">
            <span className="pos-key-pill">Ctrl + N</span>
            <span className="pos-key-desc">New product</span>
          </div>
          <div className="pos-shortcuts-item">
            <span className="pos-key-pill">Ctrl + Enter</span>
            <span className="pos-key-desc">Quick checkout</span>
          </div>
        </div>
      </div>
      
        {/* Main layout: products + cart */}
        <div className="pos-main">
          {/* LEFT: Products */}
          <section>
            <div className="pos-section-title">
              <div>
                <h2>Products</h2>
                <p className="pos-section-sub">
                  {loadingProducts
                    ? "Loading products…"
                    : search.trim()
                    ? `Showing ${visibleProducts.length} of ${products.length} items`
                    : `Tap to add to cart — ${products.length} items`}
                </p>
              </div>
              <div className="pos-pill">
                {products.length ? `${products.length} in catalog` : "No products"}
              </div>
            </div>

            <div className="pos-products">
    {/* Quick add product panel */}
    <div className="pos-quick-add">
      <div className="pos-quick-add-title">Quick add product</div>
      <div className="pos-quick-add-row">
        <input
          ref={quickAddNameRef}
          type="text"
          className="pos-quick-input"
          placeholder="Name (e.g. Coriander bundle)"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
        />
        <input
          type="number"
          className="pos-quick-input pos-quick-input--narrow"
          placeholder="Price per kg"
          min="0"
          step="0.01"
          value={manualPriceKg}
          onChange={(e) => setManualPriceKg(e.target.value)}
        />
        <input
          type="number"
          className="pos-quick-input pos-quick-input--narrow"
          placeholder="Price per quantity"
          min="0"
          step="0.01"
          value={manualPriceQty}
          onChange={(e) => setManualPriceQty(e.target.value)}
        />
        <input
          type="number"
          className="pos-quick-input pos-quick-input--narrow"
          placeholder="Stock (optional)"
          min="0"
          step="0.001"
          value={manualStock}
          onChange={(e) => setManualStock(e.target.value)}
        />
        <button
          type="button"
          className="btn-primary pos-quick-add-btn"
          onClick={handleAddManualProduct}
          disabled={manualSaving}
        >
          {manualSaving ? "Adding…" : "Add"}
        </button>
      </div>
      <div className="pos-quick-add-hint">
        Fill <strong>either</strong> price per kg <strong>or</strong> price per quantity.
        The product will be stored in your catalog and can be billed like any other item.
      </div>
    </div>

    {/* Search bar */}
    <div className="pos-search-row">
      <input
        ref={searchInputRef}
        type="text"
        className="pos-search-input"
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {search && (
        <button
          type="button"
          className="btn-ghost pos-search-clear"
          onClick={() => setSearch("")}
        >
          Clear
        </button>
      )}
    </div>

    {/* Scrollable product grid */}
    <div className="pos-products-scroll">
          {visibleProducts.length === 0 ? (
        <p className="pos-empty">No products match this search.</p>
      ) : (
        <div className="product-grid">
          {visibleProducts.map((p) => {
            const price = Number(
              p.price != null
                ? p.price
                : p.price_per_kg != null
                ? p.price_per_kg
                : p.rate != null
                ? p.rate
                : 0
            );

            const rawStock =
              p.stock_qty != null
                ? p.stock_qty
                : p.stock != null
                ? p.stock
                : p.qty_in_stock != null
                ? p.qty_in_stock
                : null;

            const stock =
              rawStock == null || rawStock === ""
                ? null
                : Number(rawStock);

            return (
              <button
                key={p.id}
                type="button"
                className="product-card"
                onClick={() => startWeighing(p)}
              >
                <div className="product-name">{p.name}</div>
                <div className="product-meta">
                  <span className="product-price">
                    ₹{price.toFixed(2)}
                  </span>
                  {stock != null && !Number.isNaN(stock) && (
                    <span className="product-stock">
                      In stock: {stock}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  </div>
          </section>

          {/* RIGHT: Cart */}
          <aside className="pos-cart">
            <div className="pos-section-title">
              <div>
                <h2>Cart</h2>
                <p className="pos-section-sub">
                  {cart.length
                    ? `${cart.length} line${cart.length > 1 ? "s" : ""} in cart`
                    : "Add items from the left to begin"}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={clearCart}
                disabled={!cart.length}
              >
                Clear
              </button>
            </div>

            {/* Weigh & add panel (for scale workflow) */}
            <div
              style={{
                marginBottom: 10,
                padding: 8,
                borderRadius: 10,
                background: "#eff6ff",
                border: "1px solid rgba(148,163,184,0.5)",
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Weigh &amp; add item
              </div>
              {activeProduct ? (
                <>
                  <div style={{ marginBottom: 6 }}>
                    Item: <strong>{activeProduct.name}</strong>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <input
                      ref={weightInputRef}
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Weight in kg (e.g. 0.85)"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddWeightedItem();
                        }
                      }}
                      style={{
                        flex: "0 0 150px",
                        padding: "4px 8px",
                        borderRadius: 8,
                        border: "1px solid rgba(148,163,184,0.8)",
                        fontSize: 12,
                      }}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: "6px 12px", fontSize: 12 }}
                      onClick={handleAddWeightedItem}
                    >
                      Add to cart
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={() => {
                        setActiveProduct(null);
                        setWeightKg("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  <div style={{ color: "#64748b" }}>
                    Put the item on the scale, read the weight in kg, then type it
                    here. Later the scale can fill this automatically.
                  </div>
                </>
              ) : (
                <div style={{ color: "#64748b" }}>
                  Tap a product on the left to select it for weighing.
                </div>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="pos-empty">No items in cart yet.</div>
            ) : (
              <>
                <ul className="cart-list">
                  {cart.map((row) => {
    const price = Number(
      row.product.price || row.product.rate || 0
    );
    const qtyRaw = row.qty;
    const qty = Number(qtyRaw || 0);
    const lineTotal = price * qty;

    const unit =
      row.product.unit ||
      (row.product.allow_decimal_qty === false ? "qty" : "kg");
    const isQtyOnly =
      unit === "qty" && row.product.allow_decimal_qty === false;

    const qtyDisplay = isQtyOnly
      ? (Number.isFinite(qty) && qty > 0 ? qty.toFixed(0) : "")
      : qty.toFixed(3);
    const unitLabel = isQtyOnly ? "pcs" : "kg";

    return (
      <li key={row.product.id} className="cart-row">
        <div className="cart-row-main">
          <div className="cart-row-name">
            {row.product.name}
          </div>
          <div className="cart-row-meta">
            ₹{price.toFixed(2)} × {qtyDisplay} {unitLabel}
          </div>
        </div>

        <div className="cart-row-controls">
          {isQtyOnly ? (
            <>
              <input
                ref={(el) => {
                  if (el) {
                    qtyInputRefs.current[row.product.id] = el;
                  }
                }}
                type="number"
                min="1"
                step="1"
                className="cart-qty-input"
                value={qtyRaw === "" ? "" : qty}
                onChange={(e) =>
                  handleCartQtyInput(row.product.id, e.target.value)
                }
              />
              <span className="cart-row-total">
                ₹{lineTotal.toFixed(2)}
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-qty"
                onClick={() => changeQty(row.product.id, -1)}
              >
                −
              </button>
              <span className="cart-qty">
                {qtyDisplay} {unitLabel}
              </span>
              <button
                type="button"
                className="btn-qty"
                onClick={() => changeQty(row.product.id, 1)}
              >
                +
              </button>
              <span className="cart-row-total">
                ₹{lineTotal.toFixed(2)}
              </span>
            </>
          )}

          <button
            type="button"
            className="btn-ghost btn-remove"
            onClick={() => removeFromCart(row.product.id)}
          >
            Remove
          </button>
        </div>
      </li>
    );
  })}
                </ul>

                {/* Cart summary */}
                <div className="cart-summary">
                  <div className="cart-summary-row">
                    <span>Subtotal</span>
                    <span>₹{totals.subtotal.toFixed(2)}</span>
                  </div>

                  <div className="cart-summary-row">
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      Discount
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={discountPct}
                        onChange={(e) => setDiscountPct(e.target.value)}
                        style={{
                          width: 56,
                          padding: "2px 6px",
                          borderRadius: 999,
                          border: "1px solid rgba(148,163,184,0.9)",
                          fontSize: 11,
                          textAlign: "right",
                        }}
                      />
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>%</span>
                    </span>
                    <span>-₹{totals.discountAmount.toFixed(2)}</span>
                  </div>

                  <div className="cart-summary-row">
                    <span>Taxable amount</span>
                    <span>₹{totals.taxable.toFixed(2)}</span>
                  </div>

                  <div className="cart-summary-row">
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      GST
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={gstPct}
                        onChange={(e) => setGstPct(e.target.value)}
                        style={{
                          width: 56,
                          padding: "2px 6px",
                          borderRadius: 999,
                          border: "1px solid rgba(148,163,184,0.9)",
                          fontSize: 11,
                          textAlign: "right",
                        }}
                      />
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>%</span>
                    </span>
                    <span>₹{totals.gstAmount.toFixed(2)}</span>
                  </div>

                  <div className="cart-summary-row cart-summary-row-strong">
                    <span>Total</span>
                    <span>₹{totals.total.toFixed(2)}</span>
                  </div>

                  <button
                    type="button"
                    className="btn-primary cart-checkout-btn"
                    onClick={checkout}
                    disabled={!cart.length || checkingOut}
                  >
                    {checkingOut
                      ? "Processing…"
                      : `Checkout • ₹${totals.total.toFixed(2)}`}
                  </button>
                </div>
              </>
            )}

            {/* Last invoice – print-ready mini receipt */}
  {lastInvoice && (
    <div className="receipt-panel">
      <div className="receipt-panel-header">
        <div className="receipt-panel-title">Last bill preview</div>
        <button
          type="button"
          className="btn-ghost receipt-print-btn"
          ref={lastInvoicePrintBtnRef}
          style={{ display: "none" }}
        >
          Print
        </button>
      </div>

      <div className="receipt-preview">
        {/* Store + header */}
        <div className="receipt-store">
          <div className="receipt-store-name">
            {lastInvoice.store?.name || "Green House"}
          </div>
          <div className="receipt-store-sub">
            Invoice: {lastInvoice.invoice_no || lastInvoice.id}
          </div>
          <div className="receipt-store-sub">
            Date: {formatInvoiceDateTime(lastInvoice.created_at)}
          </div>
        </div>

        <div className="receipt-divider" />

        {/* Items table */}
        <div className="receipt-items">
          <div className="receipt-items-header">
            <span className="r-col-name">Item</span>
            <span className="r-col-qty">Qty</span>
            <span className="r-col-rate">Rate</span>
            <span className="r-col-amt">Amount</span>
          </div>

          {(lastInvoice.items || []).map((item) => (
            <div key={item.id || item.product_id} className="receipt-item-row">
              <span className="r-col-name">{item.name}</span>
              <span className="r-col-qty">
                {Number(item.qty || 0).toFixed(3)}
              </span>
              <span className="r-col-rate">
                ₹{Number(item.rate || 0).toFixed(2)}
              </span>
              <span className="r-col-amt">
                ₹{Number(item.amount || 0).toFixed(2)}
              </span>
            </div>
          ))}

          {(lastInvoice.items || []).length === 0 && (
            <div className="receipt-empty-items">
              Items for this invoice are not loaded.
            </div>
          )}
        </div>

        <div className="receipt-divider" />

        {/* Totals */}
        <div className="receipt-totals">
          <div className="receipt-total-row">
            <span>Subtotal</span>
            <span>
              ₹
              {(
                Number(lastInvoice.total || 0) -
                Number(lastInvoice.tax || 0)
              ).toFixed(2)}
            </span>
          </div>
          <div className="receipt-total-row">
            <span>Tax / Adjustments</span>
            <span>₹{Number(lastInvoice.tax || 0).toFixed(2)}</span>
          </div>
          <div className="receipt-total-row receipt-total-row-strong">
            <span>Grand total</span>
            <span>₹{Number(lastInvoice.total || 0).toFixed(2)}</span>
          </div>
        </div>

        <div className="receipt-footer">
          <div>Thank you for shopping with us 🌿</div>
          <div className="receipt-footer-sub">
            Powered by your Greenhouse POS
          </div>
        </div>
      </div>
    </div>
  )}
          </aside>
        </div>
      </div>
    );
  }