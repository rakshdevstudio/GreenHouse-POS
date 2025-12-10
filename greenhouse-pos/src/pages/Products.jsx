// src/pages/Products.jsx
import React, { useEffect, useState } from "react";
import api from "../lib/api";

function formatMoney(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(2)}`;
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // form state for create / edit
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [stockKg, setStockKg] = useState("");

  // load products from backend
  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProducts();
      const list = Array.isArray(res) ? res : Array.isArray(res.products) ? res.products : [];
      setProducts(list);
    } catch (e) {
      console.error("loadProducts", e);
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
    setStockKg("");
  }

  function startEdit(p) {
    setEditingId(p.id);
    setName(p.name || "");
    setPricePerKg(p.price_per_kg != null ? String(p.price_per_kg) : "");
    setStockKg(
      p.stock_kg != null
        ? String(
            typeof p.stock_kg === "number"
              ? p.stock_kg.toFixed(3)
              : p.stock_kg
          )
        : ""
    );
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const priceNum = Number(pricePerKg);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError("Price per kg must be a positive number");
      return;
    }

    let stockVal = null;
    if (stockKg.trim() !== "") {
      const s = parseFloat(stockKg);
      if (!Number.isFinite(s) || s < 0) {
        setError("Stock (kg) must be zero or positive");
        return;
      }
      // keep up to 3 decimals for stock
      stockVal = Number(s.toFixed(3));
    }

    const payload = {
      name: name.trim(),
      price_per_kg: priceNum,
    };

    if (stockVal != null) {
      payload.stock_kg = stockVal;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.updateProduct(editingId, payload);
        setSuccess("Product updated");
      } else {
        await api.createProduct(payload);
        setSuccess("Product created");
      }
      await loadProducts();
      resetForm();
    } catch (e) {
      console.error("save product", e);
      setError(e.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p) {
    if (!window.confirm(`Delete product "${p.name}"?`)) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await api.deleteProduct(p.id);
      setSuccess("Product deleted");
      await loadProducts();
      if (editingId === p.id) {
        resetForm();
      }
    } catch (e) {
      console.error("delete product", e);
      setError(e.message || "Failed to delete product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pos-shell">
      {/* Header */}
      <header className="pos-header">
        <div>
          <h1 className="pos-title">Products</h1>
          <p className="pos-subtitle">
            Manage your vegetable catalog – add, update price per kg and current
            stock (kg). Changes reflect instantly in the POS.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={loadProducts}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {(error || success) && (
        <div style={{ marginBottom: 10 }}>
          {error && <div className="error-box">{error}</div>}
          {success && (
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(34,197,94,0.4)",
                background: "#ecfdf5",
                fontSize: 12,
                color: "#166534",
                marginTop: error ? 6 : 0,
              }}
            >
              {success}
            </div>
          )}
        </div>
      )}

      <div className="pos-main">
        {/* Left: form for create / edit */}
        <section className="pos-products" style={{ minHeight: 0 }}>
          <div className="pos-section-title">
            <div>
              <h2>{editingId ? "Edit product" : "Add new product"}</h2>
              <p className="pos-section-sub">
                {editingId
                  ? "Update the price or stock for this item."
                  : "Create a new catalog item (used by POS)."}
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                className="btn-ghost"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#64748b",
                  marginBottom: 4,
                }}
              >
                Product name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Tomato (1kg)"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #cbd5f1",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#64748b",
                    marginBottom: 4,
                  }}
                >
                  Price per kg (₹)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={pricePerKg}
                  onChange={(e) => setPricePerKg(e.target.value)}
                  required
                  placeholder="e.g. 99.99"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #cbd5f1",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#64748b",
                    marginBottom: 4,
                  }}
                >
                  Stock (kg, optional)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  value={stockKg}
                  onChange={(e) => setStockKg(e.target.value)}
                  placeholder="e.g. 50.000"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #cbd5f1",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
              >
                {saving
                  ? editingId
                    ? "Saving…"
                    : "Creating…"
                  : editingId
                  ? "Save changes"
                  : "Add product"}
              </button>
              {!editingId && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Clear
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Right: table of products */}
        <section className="pos-cart" style={{ minHeight: 0 }}>
          <div className="pos-section-title">
            <div>
              <h2>Catalog</h2>
              <p className="pos-section-sub">
                {products.length
                  ? `You have ${products.length} product${
                      products.length === 1 ? "" : "s"
                    }`
                  : "No products yet – create one on the left."}
              </p>
            </div>
            <div className="pos-pill">
              Visible in POS
            </div>
          </div>

          {loading && !products.length ? (
            <p className="pos-empty">Loading products…</p>
          ) : !products.length ? (
            <p className="pos-empty">
              No products found. Add your first item using the form on the left.
            </p>
          ) : (
            <div
              style={{
                borderRadius: 10,
                border: "1px solid rgba(226,232,240,0.9)",
                overflow: "hidden",
                background: "#ffffff",
                maxHeight: 360,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 0.8fr",
                  gap: 8,
                  padding: "8px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#64748b",
                  background: "#f8fafc",
                  borderBottom: "1px solid rgba(226,232,240,0.9)",
                }}
              >
                <span>Name</span>
                <span>Price/kg</span>
                <span>Stock (kg)</span>
                <span>Actions</span>
              </div>

              <div
                style={{
                  overflowY: "auto",
                  padding: "4px 0",
                }}
              >
                {products.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 0.8fr",
                      gap: 8,
                      padding: "8px 10px",
                      fontSize: 13,
                      alignItems: "center",
                      borderBottom: "1px solid rgba(241,245,249,0.9)",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 500,
                          color: "#0f172a",
                          marginBottom: 2,
                        }}
                      >
                        {p.name}
                      </div>
                      {p.sku && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#94a3b8",
                          }}
                        >
                          SKU: {p.sku}
                        </div>
                      )}
                    </div>
                    <div>{formatMoney(p.price_per_kg ?? p.price)}</div>
                    <div>
                      {p.stock_kg != null
                        ? Number(p.stock_kg).toFixed(3)
                        : "—"}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ fontSize: 11, padding: "4px 8px" }}
                        onClick={() => startEdit(p)}
                        disabled={saving}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{
                          fontSize: 11,
                          padding: "4px 8px",
                          color: "#b91c1c",
                          borderColor: "rgba(248,113,113,0.7)",
                        }}
                        onClick={() => handleDelete(p)}
                        disabled={saving}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
