// src/components/Receipt.jsx
import React from "react";

/**
 * Reusable Receipt Component for 80mm Thermal Printers
 * 
 * Props:
 * - invoice: {
 *     invoice_no,
 *     created_at,
 *     items: [{ name, qty, rate, amount }],
 *     subtotal,
 *     tax,
 *     total
 *   }
 * - store: {
 *     name,
 *     address_lines: []
 *   }
 */
export default function Receipt({ invoice, store }) {
    if (!invoice) {
        return (
            <div className="receipt-preview">
                <div className="receipt-empty-items">
                    No invoice data available.
                </div>
            </div>
        );
    }

    // Safely parse date
    let dt = null;
    try {
        dt = new Date(invoice.created_at);
    } catch {
        dt = null;
    }

    const dateStr = dt ? dt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
    const timeStr = dt
        ? dt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })
        : "";

    const items = invoice.items || [];
    const storeName = store?.name || "Greenhouse";
    const addressLines = store?.address_lines || [];

    return (
        <div className="receipt-preview">
            {/* Store Header */}
            <div className="receipt-store">
                <div className="receipt-store-name">{storeName}</div>

                {/* Store Address Lines */}
                {addressLines.map((line, idx) => (
                    <div key={idx} className="receipt-store-sub">
                        {line}
                    </div>
                ))}

                {/* Invoice Info */}
                <div className="receipt-store-sub">
                    Invoice: {invoice.invoice_no || invoice.id || "-"}
                </div>
                <div className="receipt-store-sub">
                    {dateStr} {timeStr && `, ${timeStr}`}
                </div>
            </div>

            <div className="receipt-divider" />

            {/* Items Table */}
            <div className="receipt-items">
                <div className="receipt-items-header">
                    <span className="r-col-name">Item</span>
                    <span className="r-col-qty">Qty</span>
                    <span className="r-col-rate">Rate</span>
                    <span className="r-col-amt">Amount</span>
                </div>

                {items.length === 0 ? (
                    <div className="receipt-empty-items">
                        No items on this invoice.
                    </div>
                ) : (
                    items.map((item) => (
                        <div
                            key={item.id || item.product_id || item.name}
                            className="receipt-item-row"
                        >
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
                    ))
                )}
            </div>

            <div className="receipt-divider" />

            {/* Totals */}
            <div className="receipt-totals">
                <div className="receipt-total-row">
                    <span>Subtotal</span>
                    <span>
                        ₹{Number(invoice.subtotal ?? invoice.total ?? 0).toFixed(2)}
                    </span>
                </div>
                <div className="receipt-total-row">
                    <span>Tax / Adjustments</span>
                    <span>₹{Number(invoice.tax ?? 0).toFixed(2)}</span>
                </div>
                <div className="receipt-total-row receipt-total-row-strong">
                    <span>Grand total</span>
                    <span>
                        ₹{Number(invoice.total ?? invoice.subtotal ?? 0).toFixed(2)}
                    </span>
                </div>
            </div>

            {/* Footer */}
            <div className="receipt-footer">
                <div>Thank you for shopping with us 🌿</div>
                <div className="receipt-footer-sub">
                    Powered by your Greenhouse POS
                </div>
            </div>
        </div>
    );
}
