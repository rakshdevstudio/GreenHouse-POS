// src/components/ReceiptPreview.jsx
import React from "react";
import Receipt from "./Receipt";

/**
 * Props:
 * - invoice OR lastInvoice: {
 *     invoice_no,
 *     created_at,
 *     items: [{ name, qty, rate, amount }],
 *     subtotal,
 *     tax,
 *     total,
 *     store: { name, address_lines }
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

  const handlePrint = async () => {
    if (window.electron && window.electron.print) {
      const receiptElement = document.querySelector('.receipt-preview');
      if (receiptElement) {
        // Clone to avoid modifying the visible DOM
        const clone = receiptElement.cloneNode(true);

        // Remove empty state if present, although the invoice check above handles most cases
        // but let's be safe 

        const html = clone.outerHTML;
        await window.electron.print(html);
      }
    } else {
      // Fallback for browser testing
      window.print();
    }
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

      {/* Use new Receipt component with store data from API */}
      <Receipt invoice={inv} store={inv.store} />
    </div>
  );
}