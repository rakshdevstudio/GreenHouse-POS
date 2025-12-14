// src/pages/AdminDashboard.jsx
import React, { useEffect, useState } from "react";
import api from "../lib/api";

function formatMoney(n) {
  const v = Number(n || 0);
  return `₹${v.toFixed(2)}`;
}

function todayISO() {
  // Local "today" in YYYY-MM-DD
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AdminDashboard({ onOpenStoreTab }) {
  const [stores, setStores] = useState([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [error, setError] = useState(null);

  // per-store "today" stats
  const [storeStats, setStoreStats] = useState({});
  const [loadingStats, setLoadingStats] = useState(false);

  // which store we are currently jumping into (for button disabled states)
  const [jumpingStoreId, setJumpingStoreId] = useState(null);

  async function loadStoresAndStats() {
    setLoadingStores(true);
    setLoadingStats(true);
    setError(null);

    try {
      // 1) Load all stores visible to admin
      const res = await api.getStores();
      const list = Array.isArray(res) ? res : res.stores || [];
      setStores(list);

      // 2) For each store, fetch today's daily sales report
      const dateStr = todayISO(); // YYYY-MM-DD
      const statsEntries = [];

      for (const store of list) {
        try {
          const rep = await api.adminGetDailySalesReport({
            store_id: store.id,
            date: dateStr,
          });
          statsEntries.push([store.id, rep]);
        } catch (e) {
          console.error("daily report failed for store", store.id, e);
          statsEntries.push([store.id, null]);
        }
      }

      const nextStats = {};
      for (const [storeId, rep] of statsEntries) {
        nextStats[storeId] = rep;
      }
      setStoreStats(nextStats);
    } catch (e) {
      console.error("loadStores", e);
      setError(e.message || "Failed to load stores");
    } finally {
      setLoadingStores(false);
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    loadStoresAndStats();
  }, []);

  async function handleOpenStoreTab(store, tab) {
  try {
    setJumpingStoreId(store.id);

    // 1) Create/store a store-scoped token (impersonation)
    const res = await api.adminImpersonateStore(store.id);

    // 2) Remember which store we’re looking at (optional, but useful)
    if (res && res.store_id) {
      localStorage.setItem("ADMIN_SELECTED_STORE_ID", String(res.store_id));
    }
    if (res && res.store && res.store.name) {
      localStorage.setItem("ADMIN_SELECTED_STORE_NAME", res.store.name);
    }

    // 3) Ask App.jsx (admin shell) to switch the inner view
    if (typeof onOpenStoreTab === "function") {
      // tab is "pos" | "invoices" | "reports"
      onOpenStoreTab(tab || "pos");
    }

    // ⛔ IMPORTANT: remove the full page reload.
    // We stay inside the admin shell and just swap the inner component.
    // window.location.reload();
  } catch (e) {
    console.error("impersonate error", e);
    alert(e.message || "Failed to open store");
  } finally {
    setJumpingStoreId(null);
  }
}

  return (
    <div className="pos-shell">
      {/* Header */}
      <header className="pos-header">
        <div>
          <h1 className="pos-title">Admin console</h1>
          <p className="pos-subtitle">
            Switch between stores, view today&apos;s sales, and jump into POS /
            invoices / reports for each branch.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={loadStoresAndStats}
            disabled={loadingStores || loadingStats}
          >
            {loadingStores || loadingStats ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-box" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* Today summary tiles */}
      <section style={{ marginBottom: 16 }}>
        <div className="pos-section-title" style={{ marginBottom: 8 }}>
          <div>
            <h2>Today&apos;s sales snapshot</h2>
            <p className="pos-section-sub">
              Quick view of invoices and revenue for each store today.
            </p>
          </div>
        </div>

        {!stores.length && !loadingStores ? (
          <p className="pos-empty">
            No stores found. Add stores in the backend to see summary here.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {stores.map((store) => {
              const stats = storeStats[store.id];
              const totals = stats?.totals || {};
              const invoiceCount = totals.invoice_count || 0;
              const total = totals.total || 0;
              const avg = totals.avg_invoice_value || 0;

              return (
                <div
                  key={store.id}
                  style={{
                    borderRadius: 14,
                    padding: 12,
                    background: "#f9fafb",
                    border: "1px solid rgba(226,232,240,0.9)",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#0f172a",
                      }}
                    >
                      {store.name}
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: "rgba(34,197,94,0.08)",
                        color: "#15803d",
                        fontWeight: 500,
                      }}
                    >
                      Today
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 4,
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    <span>Invoices</span>
                    <strong style={{ color: "#0f172a" }}>
                      {loadingStats && !stats ? "…" : invoiceCount}
                    </strong>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    <span>Total</span>
                    <strong style={{ color: "#16a34a" }}>
                      {loadingStats && !stats ? "…" : formatMoney(total)}
                    </strong>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "#64748b",
                    }}
                  >
                    <span>Avg bill</span>
                    <span style={{ color: "#0f172a" }}>
                      {loadingStats && !stats ? "…" : formatMoney(avg)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Store actions */}
      <div className="pos-products">
        <div className="pos-section-title" style={{ marginBottom: 8 }}>
          <div>
            <h2>Stores</h2>
            <p className="pos-section-sub">
              Jump directly into POS, invoices, or reports for each store.
            </p>
          </div>
          <div className="pos-pill">
            {stores.length
              ? `${stores.length} store${stores.length > 1 ? "s" : ""}`
              : "No stores"}
          </div>
        </div>

        {!stores.length && !loadingStores ? (
          <p className="pos-empty">
            No stores configured yet. Add stores in the database.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {stores.map((store) => (
              <div
                key={store.id}
                style={{
                  borderRadius: 14,
                  padding: 12,
                  background: "#ffffff",
                  border: "1px solid rgba(226,232,240,0.9)",
                  boxShadow: "0 4px 10px rgba(15,23,42,0.03)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#0f172a",
                      }}
                    >
                      {store.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#94a3b8",
                        marginTop: 2,
                      }}
                    >
                      ID #{store.id}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 6,
                  }}
                >
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={jumpingStoreId === store.id}
                    onClick={() => handleOpenStoreTab(store, "pos")}
                  >
                    {jumpingStoreId === store.id ? "Opening POS…" : "Open POS"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={jumpingStoreId === store.id}
                    onClick={() => handleOpenStoreTab(store, "invoices")}
                  >
                    {jumpingStoreId === store.id
                      ? "Opening invoices…"
                      : "View invoices"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={jumpingStoreId === store.id}
                    onClick={() => handleOpenStoreTab(store, "reports")}
                  >
                    {jumpingStoreId === store.id
                      ? "Opening reports…"
                      : "View reports"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}