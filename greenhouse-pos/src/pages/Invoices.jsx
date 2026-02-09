import React, { useEffect, useState, useRef } from "react";
import api, { getApiBase } from "../lib/api";

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  const time = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
  return `${date} • ${time}`;
}

function formatMoney(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(2)}`;
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // NEW: WS ref
  const wsRef = useRef(null);

  // NEW: currently "selected" invoice (for secret shortcut)
  const [selectedId, setSelectedId] = useState(null);
  const [voidBusyId, setVoidBusyId] = useState(null);
  const [info, setInfo] = useState(null);

  async function loadInvoices() {
    setLoading(true);
    setError(null);
    try {
      const storeId = Number(localStorage.getItem("STORE_ID") || 1);

      const res = await api.getInvoices({
        store_id: storeId,
        limit: 50,
        items: 1, // ask backend to include items
      });

      // handle different possible shapes
      let list;
      if (Array.isArray(res)) {
        list = res;
      } else if (Array.isArray(res.invoices)) {
        list = res.invoices;
      } else if (Array.isArray(res.rows)) {
        list = res.rows;
      } else {
        list = [];
      }

      setInvoices(list);
      setLastRefreshed(new Date().toISOString());

      // if current selected invoice disappears, clear selection
      if (
        selectedId &&
        !list.some((inv) => (inv.id || inv.invoice_id) === selectedId)
      ) {
        setSelectedId(null);
        setExpandedId(null);
      }
    } catch (e) {
      console.error("loadInvoices", e);
      setError(e.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // � WebSocket for live updates (Mirrors POS.jsx logic)
  useEffect(() => {
    let mounted = true;
    let reconnectTimer = null;

    async function connectWs() {
      try {
        if (!mounted) return;

        // Clean up previous
        if (wsRef.current) {
          try { wsRef.current.close(); } catch (e) { }
          wsRef.current = null;
        }

        let base = "";
        try {
          base = await getApiBase();
        } catch (err) {
          console.warn("Invoices: Failed to resolve API base for WS", err);
        }

        // Determine WS origin
        let origin = "";
        try {
          const parsed = new URL(base);
          origin = parsed.origin;
        } catch (e) {
          origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
        }

        if (!mounted) return;

        const scheme = origin.startsWith("https:") ? "wss:" : "ws:";
        const host = origin.replace(/^https?:/, "");

        const token = localStorage.getItem("STORE_TOKEN") || localStorage.getItem("ADMIN_TOKEN") || "";
        const terminalUuid = localStorage.getItem("TERMINAL_UUID") || "unknown-invoices-tab";

        const url = `${scheme}${host}/ws?terminal_uuid=${encodeURIComponent(terminalUuid)}` +
          (token ? `&token=${encodeURIComponent(token)}` : "");

        console.log("Invoices: Connecting WS...", url);
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("Invoices: WS Connected");
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (!msg) return;

            if (msg.type === "invoice_created") {
              console.log("Invoices: Received invoice_created event, refreshing...");
              loadInvoices();
            }
          } catch (err) {
            console.warn("Invoices: WS message parse error", err);
          }
        };

        ws.onclose = () => {
          console.log("Invoices: WS Closed");
          if (mounted) {
            reconnectTimer = setTimeout(connectWs, 5000); // Simple reconnect
          }
        };

        ws.onerror = (err) => {
          console.warn("Invoices: WS Error", err);
          try { ws.close(); } catch (e) { }
        };

      } catch (err) {
        console.error("Invoices: WS Setup failed", err);
        if (mounted) {
          reconnectTimer = setTimeout(connectWs, 5000);
        }
      }
    }

    connectWs();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) { }
        wsRef.current = null;
      }
    };
  }, []);

  // �🔒 Secret owner shortcut: Ctrl + Shift + Delete/Backspace => void selected invoice
  useEffect(() => {
    function handleKeyDown(e) {
      // No invoice selected: nothing to do
      if (!selectedId) return;

      // Don't trigger when typing in inputs / textareas
      const tag = e.target.tagName;
      const isTypingField =
        tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;
      if (isTypingField) return;

      const isDeleteKey =
        e.key === "Delete" || e.key === "Backspace" || e.code === "Delete";

      if (isDeleteKey && e.ctrlKey && e.shiftKey && !e.metaKey) {
        e.preventDefault();

        const inv = invoices.find(
          (i) => (i.id || i.invoice_id) === selectedId
        );
        if (!inv) return;

        const invoiceLabel = inv.invoice_no || `INV-${selectedId}`;

        const ok = window.confirm(
          `Void invoice ${invoiceLabel}?\n\nThis action is hidden and should only be used by the owner.`
        );
        if (!ok) return;

        (async () => {
          try {
            setVoidBusyId(selectedId);
            setError(null);
            setInfo(null);

            // backend: POST /admin/invoices/:id/void
            await api.adminVoidInvoice(selectedId, { reason: "owner shortcut" });

            // update local list: mark status as voided
            setInvoices((prev) =>
              prev.map((i) => {
                const pid = i.id || i.invoice_id;
                if (pid !== selectedId) return i;
                return { ...i, status: "voided" };
              })
            );

            setInfo(`Invoice ${invoiceLabel} voided.`);
          } catch (err) {
            console.error("void invoice error", err);
            setError(err.message || "Failed to void invoice");
          } finally {
            setVoidBusyId(null);
          }
        })();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, invoices]);

  return (
    <div className="pos-shell">
      {/* Header */}
      <header className="pos-header">
        <div>
          <h1 className="pos-title">Invoices</h1>
          <p className="pos-subtitle">
            View recent bills created from this terminal. Tap a row to see line
            items.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {lastRefreshed && (
            <span className="pos-subtitle">
              Last refreshed:{" "}
              {new Date(lastRefreshed).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
                timeZone: "Asia/Kolkata",
              })}
            </span>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={loadInvoices}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {/* Messages */}
      {error && (
        <div className="error-box" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}
      {info && (
        <div
          className="last-invoice"
          style={{ marginBottom: 10, background: "#ecfdf3" }}
        >
          {info}
        </div>
      )}

      <div className="pos-products invoice-panel">
        <div className="pos-section-title" style={{ marginBottom: 6 }}>
          <div>
            <h2>Recent invoices</h2>
            <p className="pos-section-sub">
              Showing latest {invoices.length || 0} invoice
              {invoices.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="pos-pill">
            {invoices.length ? "Tap to expand details" : "No invoices yet"}
          </div>
        </div>

        {!invoices.length && !loading ? (
          <p className="pos-empty">
            No invoices found. Create a bill in the POS tab and come back here.
          </p>
        ) : (
          <div className="invoice-list">
            {/* Table header (only on larger screens) */}
            <div className="invoice-header-row">
              <span>Invoice</span>
              <span>Date &amp; time</span>
              <span>Items</span>
              <span>Total</span>
              <span>Payment</span>
              <span>Status</span>
            </div>

            {invoices.map((inv) => {
              const id = inv.id || inv.invoice_id;
              const isOpen = expandedId === id;
              const items = inv.items || [];
              const itemCount = items.length || inv.item_count || "-";
              const status = (inv.status || "synced").toLowerCase();
              const payMode = (inv.payment_mode || "CASH").toUpperCase();
              const isSelected = selectedId === id;

              return (
                <div
                  key={id}
                  className={`invoice-card ${isOpen ? "invoice-card--open" : ""
                    } ${isSelected ? "invoice-card--selected" : ""}`}
                >
                  {/* Main row */}
                  <button
                    type="button"
                    className="invoice-main-row"
                    onClick={() => {
                      setExpandedId(isOpen ? null : id);
                      setSelectedId(id);
                    }}
                  >
                    <span className="invoice-id">
                      {inv.invoice_no || `INV-${id}`}
                    </span>
                    <span className="invoice-date">
                      {formatDateTime(inv.created_at)}
                    </span>
                    <span className="invoice-items">{itemCount}</span>
                    <span className="invoice-total">
                      {formatMoney(inv.total)}
                    </span>
                    <span className="invoice-paymode">{payMode}</span>
                    <span
                      className={`invoice-status invoice-status--${status}`}
                    >
                      {status}
                      {voidBusyId === id ? " (voiding…)" : ""}
                    </span>
                  </button>

                  {/* Expanded items */}
                  {isOpen && items && items.length > 0 && (
                    <div className="invoice-items-panel">
                      {items.map((it) => (
                        <div
                          key={it.id || it.product_id}
                          className="invoice-item-row"
                        >
                          <div className="invoice-item-main">
                            <div className="invoice-item-name">
                              {it.name || `Product #${it.product_id}`}
                            </div>
                            <div className="invoice-item-meta">
                              {formatMoney(it.rate)} × {it.qty}
                            </div>
                          </div>
                          <div className="invoice-item-amount">
                            {formatMoney(it.amount || it.rate * it.qty)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}