// src/components/Cart.jsx
import React from "react";

export default function Cart({ items = [], onInc, onDec, onRemove, onUpdateQty, onCheckout, total = 0 }) {
  return (
    <div className="cart">
      <h3>Cart</h3>
      <div className="cart-list">
        {items.length === 0 && <div className="cart-empty">Cart is empty</div>}
        {items.map(it => (
          <div key={it.product_id} className="cart-item">
            <div className="cart-item-left">
              <div className="cart-name">{it.name}</div>
              <div className="cart-rate">₹{it.rate.toFixed(2)}</div>
            </div>

            <div className="cart-item-right">
              <div className="qty-controls">
                <button onClick={() => onDec && onDec(it.product_id)}>-</button>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={it.qty}
                  onChange={e =>
                    onUpdateQty &&
                    onUpdateQty(
                      it.product_id,
                      e.target.value === '' ? '' : parseFloat(e.target.value)
                    )
                  }
                />
                <button onClick={() => onInc && onInc(it.product_id)}>+</button>
              </div>
              <div className="line-amt">₹{(it.rate * it.qty).toFixed(2)}</div>
              <button className="btn-remove" onClick={() => onRemove && onRemove(it.product_id)}>×</button>
            </div>
          </div>
        ))}
      </div>

      <div className="cart-summary">
        <div className="summary-row">
          <div>Subtotal</div>
          <div>₹{total.toFixed(2)}</div>
        </div>
        <div className="cart-actions">
          <button className="btn-checkout" onClick={onCheckout} disabled={!items.length}>Checkout</button>
        </div>
      </div>
    </div>
  );
}