// src/pages/Reports.jsx
import React, { useEffect, useState } from "react";
import api from "../lib/api";

function formatMoney(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(2)}`;
}

function monthLabel(year, month) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatPercent(v) {
  const n = Number(v || 0);
  if (!isFinite(n) || n === 0) return "0%";
  return `${n.toFixed(1)}%`;
}

export default function Reports() {
  const storeId = Number(localStorage.getItem("STORE_ID") || 1);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1–12

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [stockAlerts, setStockAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  async function loadAll() {
    if (!storeId) {
      setError("STORE_ID missing – please log in again.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rep, top, stock] = await Promise.all([
        api.getMonthlyReport({ store_id: storeId, year, month }),
        api.getTopProducts({ store_id: storeId, days: 30, limit: 10 }),
        api.getStockAlerts({ store_id: storeId, threshold: 10 }),
      ]);
      setReport(rep);
      setTopProducts(top.top_products || []);
      setStockAlerts(stock.low_stock || []);
      setLastUpdated(new Date().toISOString());
    } catch (e) {
      console.error("load reports error", e);
      setError(e.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [year, month]); // reload when month/year changes

  function changeMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setYear(y);
    setMonth(m);
  }

  const totals = report?.totals || {
    invoice_count: 0,
    subtotal: 0,
    tax: 0,
    total: 0,
    avg_invoice_value: 0,
  };

  return (
    <div className="pos-shell">
      {/* Header */}
      <header className="pos-header">
        <div>
          <h1 className="pos-title">Reports</h1>
          <p className="pos-subtitle">
            Monthly sales overview, top products and low-stock alerts for your
            store.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginRight: 12,
              fontSize: 11,
              color: "#64748b",
              flexDirection: "column",
            }}
          >
            <span>
              Store #{storeId} • <strong>{monthLabel(year, month)}</strong>
            </span>
            {lastUpdated && (
              <span style={{ opacity: 0.8 }}>
                Last updated{" "}
                {new Date(lastUpdated).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => changeMonth(-1)}
            disabled={loading}
          >
            ◀ Prev
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={loadAll}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => changeMonth(1)}
            disabled={loading}
          >
            Next ▶
          </button>
        </div>
      </header>

      {error && (
        <div className="error-box" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* Main 2-column layout for reports */}
      <div className="pos-main" style={{ marginTop: 8 }}>
        {/* Left: monthly summary + daily breakdown */}
        <section className="pos-products">
          <div className="pos-section-title">
            <div>
              <h2>Monthly summary</h2>
              <p className="pos-section-sub">
                Store #{storeId} • {monthLabel(year, month)}
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={loadAll}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div className="report-card">
              <div className="report-label">Total sales</div>
              <div className="report-value">
                {formatMoney(totals.total || 0)}
              </div>
            </div>
            <div className="report-card">
              <div className="report-label">Invoices</div>
              <div className="report-value">
                {totals.invoice_count || 0}
              </div>
             
            </div>
            <div className="report-card">
              <div className="report-label">Avg bill value</div>
              <div className="report-value">
                {formatMoney(totals.avg_invoice_value || 0)}
              </div>
            </div>
            <div className="report-card">
              <div className="report-label">Tax collected</div>
              <div className="report-value">
                {formatMoney(totals.tax || 0)}
              </div>
            </div>
          </div>

          {/* Payment mode distribution, if available */}
          {report?.by_payment_mode && report.by_payment_mode.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                >
                  Payment mix
                </h3>
                <span className="pos-section-sub">
                  Breakdown by payment mode
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {report.by_payment_mode
                  .filter((p) => (p.payment_mode || "").toUpperCase() !== "ALL")
                  .map((p) => {
                    const label = (p.payment_mode || "UNKNOWN").toUpperCase();
                    const percent =
                      totals.total > 0
                        ? (Number(p.total || 0) / Number(totals.total)) * 100
                        : 0;
                    return (
                      <div key={label} className="pos-pill">
                        {label}: {formatMoney(p.total || 0)} •{" "}
                        {formatPercent(percent)}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Daily table */}
          <div className="pos-section-title" style={{ marginTop: 4 }}>
            <h2 style={{ fontSize: 15 }}>Daily breakdown</h2>
            <p className="pos-section-sub">
              {report?.by_day?.length
                ? `${report.by_day.length} active day(s)`
                : "No invoices this month yet"}
            </p>
          </div>

          {report?.by_day?.length ? (
            <div className="invoice-list">
              <div className="invoice-header-row">
                <span>Date</span>
                <span>Invoices</span>
                <span>Total sales</span>
              </div>
              {report.by_day.map((d) => {
                const dateObj = new Date(d.date);
                const label = dateObj.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                });
                return (
                  <div key={d.date} className="invoice-card">
                    <div className="invoice-main-row" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                      <span className="invoice-id">{label}</span>
                      <span className="invoice-items">
                        {d.invoice_count} bill
                        {d.invoice_count === 1 ? "" : "s"}
                      </span>
                      <span className="invoice-total">
                        {formatMoney(d.total)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="pos-empty" style={{ marginTop: 8 }}>
              No daily data yet for this month.
            </p>
          )}
        </section>

        {/* Right: top products + stock alerts */}
        <section className="pos-cart">
          <div className="pos-section-title">
            <h2>Top products (last 30 days)</h2>
            <p className="pos-section-sub">
              Based on quantity sold • Store #{storeId}
            </p>
          </div>

          {topProducts && topProducts.length ? (
            <ul className="cart-list">
              {topProducts.map((p, idx) => (
                <li key={p.product_id} className="cart-row">
                  <div className="cart-row-main">
                    <div className="cart-row-name">
                      <span
                        style={{
                          display: "inline-flex",
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid rgba(148,163,184,0.6)",
                          fontSize: 11,
                          marginRight: 6,
                        }}
                      >
                        {idx + 1}
                      </span>
                      {p.name}
                    </div>
                    <div className="cart-row-meta">
                      Sold {Number(p.qty_sold || 0).toFixed(3)}{" "}
                      {Number(p.qty_sold || 0) === 1 ? "unit" : "units"}
                    </div>
                  </div>
                  <div className="cart-row-total">
                    {formatMoney(p.sales_amount || 0)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pos-empty">No top products yet.</p>
          )}

          <div className="pos-section-title" style={{ marginTop: 12 }}>
            <h2 style={{ fontSize: 15 }}>Low stock alerts</h2>
            <p className="pos-section-sub">
              Warning when stock ≤ 10 (configurable in backend call)
            </p>
          </div>

          {stockAlerts && stockAlerts.length ? (
            <ul className="cart-list">
              {stockAlerts.map((p) => (
                <li key={p.id} className="cart-row">
                  <div className="cart-row-main">
                    <div className="cart-row-name">{p.name}</div>
                    <div className="cart-row-meta">
                      Stock: {Number(p.stock || 0)} {p.unit || ""}
                      {Number(p.stock || 0) === 0 && " • OUT OF STOCK"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pos-empty">No low stock items 🎉</p>
          )}
        </section>
      </div>
    </div>
  );
}