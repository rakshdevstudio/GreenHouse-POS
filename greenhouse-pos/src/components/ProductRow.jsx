// src/components/ProductRow.jsx
import React from "react";

export default function ProductRow({ product, onAdd }) {
  const price = typeof product.price === "string" ? parseFloat(product.price) : product.price;
  return (
    <div className="product-tile">
      <div className="product-title">{product.name}</div>
      <div className="product-meta">
        <div className="sku">{product.sku}</div>
        <div className="price">₹{(price || 0).toFixed(2)}</div>
      </div>
      <div className="product-actions">
        <button className="btn-add" onClick={onAdd}>Add</button>
      </div>
    </div>
  );
}