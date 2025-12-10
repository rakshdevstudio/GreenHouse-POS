// src/components/ReceiptPreview.jsx
import React from "react";

/**
 * Props:
 * - invoice OR lastInvoice: {
 *     invoice_no,
 *     created_at,
 *     items: [{ name, qty, rate, amount }],
 *     subtotal,
 *     tax,
 *     total
 *   }
 */
export default function ReceiptPreview({ invoice, lastInvoice }) {
  const inv = invoice || lastInvoice;

  if (!inv) {
    return (
      <div className="receipt-panel">
        <div className="receipt-panel-header">
          <div className="receipt-panel-title">Last bill preview</div>
          <button
            type="button"
            className="btn-ghost receipt-print-btn"
            disabled
          >
            Print
          </button>
        </div>
        <div className="receipt-preview">
          <div className="receipt-empty-items">
            No bill yet. Complete a checkout to see the last receipt here.
          </div>
        </div>
      </div>
    );
  }

  // Safely parse date
  let dt = null;
  try {
    dt = new Date(inv.created_at);
  } catch {
    dt = null;
  }

  const dateStr = dt ? dt.toLocaleDateString("en-IN") : "";
  const timeStr = dt
    ? dt.toLocaleTimeString("en-IN", { hour12: false })
    : "";

  const items = inv.items || [];

  const handlePrint = () => {
    // Simple: trigger browser print. Our global @media print CSS
    // will hide the rest of the POS UI and keep only the receipt.
    window.print();
  };

  return (
    <div className="receipt-panel">
      <div className="receipt-panel-header">
        <div className="receipt-panel-title">Last bill preview</div>
        <button
          type="button"
          className="btn-ghost receipt-print-btn"
          onClick={handlePrint}
        >
          Print
        </button>
      </div>

      {/* This is exactly what we clone into the print window */}
      <div id="receipt-print-area" className="receipt-preview">
        <div className="receipt-store">
          <div className="receipt-store-name">Green House</div>
          <div className="receipt-store-sub">
            Invoice: {inv.invoice_no || "-"}
          </div>
          <div className="receipt-store-sub">
            {dateStr} {timeStr && `, ${timeStr}`}
          </div>
        </div>

        <div className="receipt-divider" />

        <div className="receipt-items">
          <div className="receipt-items-header">
            <div>Item</div>
            <div className="r-col-qty">Qty</div>
            <div className="r-col-rate">Rate</div>
            <div className="r-col-amt">Amount</div>
          </div>

          {items.length === 0 ? (
            <div className="receipt-empty-items">
              No items on this invoice.
            </div>
          ) : (
            items.map((it) => (
              <div
                key={it.id || it.product_id || it.name}
                className="receipt-item-row"
              >
                <div className="r-col-name">{it.name}</div>
                <div className="r-col-qty">
                  {Number(it.qty).toFixed(3)}
                </div>
                <div className="r-col-rate">
                  ₹{Number(it.rate).toFixed(2)}
                </div>
                <div className="r-col-amt">
                  ₹{Number(it.amount).toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="receipt-divider" />

        <div className="receipt-totals">
          <div className="receipt-total-row">
            <span>Subtotal</span>
            <span>
              ₹{Number(inv.subtotal ?? inv.total ?? 0).toFixed(2)}
            </span>
          </div>
          <div className="receipt-total-row">
            <span>Tax / Adjustments</span>
            <span>₹{Number(inv.tax ?? 0).toFixed(2)}</span>
          </div>
          <div className="receipt-total-row receipt-total-row-strong">
            <span>Grand total</span>
            <span>
              ₹{Number(inv.total ?? inv.subtotal ?? 0).toFixed(2)}
            </span>
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
  );
}