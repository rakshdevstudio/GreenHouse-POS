// src/pages/ProductAdmin.jsx
import React, { useEffect, useState } from "react";
import api from "../lib/api";

function formatMoney(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(2)}`;
}

export default function ProductAdmin() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // form state
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [pricePerQty, setPricePerQty] = useState("");
  const [stockKg, setStockKg] = useState("");
  const [unit, setUnit] = useState("kg"); // "kg" or "qty"

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProducts();
      // handle shapes like { products: [...] } or [...]
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res.products)
        ? res.products
        : [];
      // sort products by name ascending (case-insensitive)
      list.sort((a, b) => {
        const an = (a.name || "").toString().toLowerCase();
        const bn = (b.name || "").toString().toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return 0;
      });
      setProducts(list);
    } catch (e) {
      console.error("loadProducts error", e);
      setError(e.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPricePerKg("");
    setPricePerQty("");
    setStockKg("");
    setUnit("kg");
  }

  function startEdit(p) {
    const detectedUnit = p.unit || (p.price_per_kg ? "kg" : "qty");
    setEditingId(p.id);
    setName(p.name || "");
    setUnit(detectedUnit);

    // populate price fields based on unit / existing fields
    if (detectedUnit === "kg") {
      setPricePerKg(
        p.price_per_kg ??
          (typeof p.price === "number" ? p.price : p.price || "")
      );
      setPricePerQty(p.price_per_qty ?? "");
    } else {
      setPricePerQty(
        p.price_per_qty ??
          (typeof p.price === "number" ? p.price : p.price || "")
      );
      setPricePerKg(p.price_per_kg ?? "");
    }

    setStockKg(
      p.stock_kg ??
        (typeof p.stock === "number" ? p.stock : p.stock || "")
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setError(null);

    const nameTrimmed = name.trim();
    if (!nameTrimmed) {
      setError("Name is required");
      return;
    }

    const kgVal = pricePerKg === "" ? null : Number(pricePerKg);
    const qtyVal = pricePerQty === "" ? null : Number(pricePerQty);
    const stockNum = stockKg === "" ? null : Number(stockKg);

    const kgValid = kgVal !== null && Number.isFinite(kgVal) && kgVal > 0;
    const qtyValid = qtyVal !== null && Number.isFinite(qtyVal) && qtyVal > 0;

    // Enforce correct price based on unit
    if (unit === "kg" && !kgValid) {
      setError("For items sold by weight (kg), price per kg is required");
      return;
    }
    if (unit === "qty" && !qtyValid) {
      setError("For items sold by quantity, price per quantity is required");
      return;
    }

    if (stockKg !== "" && (!Number.isFinite(stockNum) || stockNum < 0)) {
      setError("Stock must be a non-negative number");
      return;
    }

    // decide the primary price to store in legacy `price` column
    const primaryPrice = unit === "kg" ? kgVal : qtyVal;

    const payload = {
      name: nameTrimmed,

      // newer, more descriptive fields
      price_per_kg: unit === "kg" ? kgVal : null,
      price_per_qty: unit === "qty" ? qtyVal : null,
      stock_kg: stockNum,

      // legacy fields used by existing backend insert/update logic
      price: primaryPrice,
      stock: stockNum,

      // unit semantics for POS (very important)
      unit, // "kg" or "qty"
      // for now: decimals allowed only for kg items (your requirement)
      allow_decimal_qty: unit === "kg",
    };

    // Auto-generate a SKU for new products if backend requires it
    if (!editingId) {
      payload.sku = `manual-${Date.now()}`;
    }

    setSaving(true);
    try {
      if (editingId) {
        // store-scoped update (uses store session token)
        await api.storeUpdateProduct(editingId, payload);
      } else {
        // store-scoped create
        await api.storeCreateProduct(payload);
      }
      await loadProducts();
      resetForm();
    } catch (e) {
      console.error("save product error", e);
      setError(e.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this product? This cannot be undone.")) return;
    setError(null);
    try {
      await api.storeDeleteProduct(id);
      await loadProducts();
      if (editingId === id) resetForm();
    } catch (e) {
      console.error("delete product error", e);
      setError(e.message || "Failed to delete product");
    }
  }

  // Helper to show stock with unit label
  function renderStock(p) {
    const raw =
      p.stock_kg ??
      (typeof p.stock === "number" ? p.stock : p.stock ?? "-");
    if (raw === "-" || raw === null || raw === undefined) return "-";

    const u = p.unit || "kg";
    if (u === "qty") return `${raw} pcs`;
    return `${raw} kg`;
  }

  function renderPricing(p) {
    const u = p.unit || (p.price_per_kg ? "kg" : "qty");
    if (u === "kg") {
      const val =
        p.price_per_kg ??
        (typeof p.price === "number" ? p.price : p.price || 0);
      return `${formatMoney(val)} / kg`;
    } else {
      const val =
        p.price_per_qty ??
        (typeof p.price === "number" ? p.price : p.price || 0);
      return `${formatMoney(val)} / qty`;
    }
  }

  return (
    <div className="pos-shell">
      {/* Header */}
      <header className="pos-header">
        <div>
          <h1 className="pos-title">Products</h1>
          <p className="pos-subtitle">
            Manage your catalog: add, edit or remove items used in POS billing.
            Supports both items sold by weight (kg) and by quantity (packets/pieces).
          </p>
        </div>
        <div className="pos-header-right">
          <span className="dot-online" />
          <span className="pos-header-status">
            {loading ? "Loading…" : `${products.length} in catalog`}
          </span>
        </div>
      </header>

      {error && (
        <div className="error-box" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div className="pos-main">
        {/* Left: list */}
        <section className="pos-products">
          <div className="pos-section-title">
            <div>
              <h2>Catalog</h2>
              <p className="pos-section-sub">
                Click a row to edit. Items can be sold by kg (loose) or by
                quantity (packets, pieces).
              </p>
            </div>
            <div className="pos-pill">
              {products.length ? `${products.length} product(s)` : "No products"}
            </div>
          </div>

          {!products.length && !loading ? (
            <p className="pos-empty">
              No products found yet. Use the form on the right to add one.
            </p>
          ) : (
            <div className="invoice-list">
              <div className="invoice-header-row">
                <span>Name</span>
                <span>Pricing</span>
                <span>Stock</span>
                <span>Actions</span>
              </div>
              {products.map((p) => (
                <div key={p.id} className="invoice-card">
                  <div className="invoice-main-row">
                    <span className="invoice-id">
                      {p.name || `Product #${p.id}`}
                    </span>
                    <span className="invoice-total">{renderPricing(p)}</span>
                    <span className="invoice-items">{renderStock(p)}</span>
                    <span className="invoice-paymode">
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => startEdit(p)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => handleDelete(p.id)}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: form */}
        <section className="pos-cart">
          <div className="pos-section-title">
            <div>
              <h2>{editingId ? "Edit product" : "Add product"}</h2>
              <p className="pos-section-sub">
                Choose whether the item is sold by weight (kg) or by quantity.
                Stock is optional and can be in kg or units.
              </p>
            </div>
          </div>

          <form onSubmit={handleSave}>
            {/* Name */}
            <div style={{ marginBottom: 8 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #cbd5f5",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Sold by: kg vs qty */}
            <div style={{ marginBottom: 8 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Sold by
              </label>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setUnit("kg")}
                  style={
                    unit === "kg"
                      ? {
                          borderColor: "#16a34a",
                          background: "#dcfce7",
                          fontWeight: 600,
                        }
                      : {}
                  }
                >
                  Weight (kg)
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setUnit("qty")}
                  style={
                    unit === "qty"
                      ? {
                          borderColor: "#0ea5e9",
                          background: "#e0f2fe",
                          fontWeight: 600,
                        }
                      : {}
                  }
                >
                  Quantity (packets / pieces)
                </button>
              </div>
            </div>

            {/* Price per kg */}
            <div style={{ marginBottom: 8, opacity: unit === "qty" ? 0.5 : 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Price per kg (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                disabled={unit === "qty"}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #cbd5f5",
                  fontSize: 13,
                  boxSizing: "border-box",
                  backgroundColor:
                    unit === "qty" ? "#f9fafb" : "white",
                }}
              />
            </div>

            {/* Price per quantity */}
            <div style={{ marginBottom: 8, opacity: unit === "kg" ? 0.5 : 1 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Price per quantity (₹)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={pricePerQty}
                onChange={(e) => setPricePerQty(e.target.value)}
                disabled={unit === "kg"}
                placeholder="e.g. ₹10 per packet"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #cbd5f5",
                  fontSize: 13,
                  boxSizing: "border-box",
                  backgroundColor:
                    unit === "kg" ? "#f9fafb" : "white",
                }}
              />
            </div>

            {/* Stock */}
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Stock ({unit === "qty" ? "units" : "kg"}) – optional
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={stockKg}
                onChange={(e) => setStockKg(e.target.value)}
                placeholder={
                  unit === "qty" ? "e.g. 100 (packets)" : "e.g. 125.500"
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #cbd5f5",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
              >
                {saving
                  ? editingId
                    ? "Saving…"
                    : "Adding…"
                  : editingId
                  ? "Save changes"
                  : "Add product"}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}