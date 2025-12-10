// index.js - Express server + Postgres pool + invoice endpoint + auth & terminal endpoints
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');
const http = require('http');

const bcrypt = require('bcryptjs');
const WebSocket = require('ws');


const app = express();

// ---- Simple scale event bus ----
const scaleEmitter = new EventEmitter();

// Optional: simple mock generator so UI can be tested without real scale.
// Enable by: MOCK_SCALE=1 in your .env or `export MOCK_SCALE=1`
if (process.env.MOCK_SCALE === '1') {
  setInterval(() => {
    const w = Number((Math.random() * 3).toFixed(3)); // 0–3 kg
    scaleEmitter.emit('weight', w);
  }, 5000);
}

// --- CORS: friendly dev defaults ---
// Allow Vite dev servers on 5173 and 5174 and also allow non-browser requests (curl, server-side).
// In production you should change this to your exact frontend origin(s).
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174'
]);

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (curl, mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed for origin ' + origin));
  },
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- Force DB session timezone for ALL queries ---
// This ensures NOW(), created_at, and updated_at are all in IST
(async () => {
  try {
    await pool.query("SET TIME ZONE 'Asia/Kolkata'");
    console.log("DB timezone set to Asia/Kolkata");
  } catch (err) {
    console.error("Failed to set DB timezone", err);
  }
})();

// ----------------- PRODUCTS: update price single -----------------
// POST /products/update-price
// Body:
// {
//   "store_id": 1,             // optional if product unique across store; recommended to avoid cross-store edits
//   "product_id": 12,          // required
//   "new_price": 30.50,        // required
//   "changed_by": "admin"      // optional (username who made change)
// }
app.post('/products/update-price', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { store_id, product_id, new_price, changed_by } = req.body;

    if (!product_id) return res.status(400).json({ error: 'product_id required' });
    if (new_price === undefined || new_price === null) return res.status(400).json({ error: 'new_price required' });

    // sanitize/parse
    const price = parseFloat(new_price);
    if (isNaN(price) || price < 0) return res.status(400).json({ error: 'new_price must be a non-negative number' });

    await client.query('BEGIN');

    // Fetch current product row (lock for update)
    // If you want store scoping, include AND store_id = $2 in the WHERE clause and adjust params.
    const productQuery = 'SELECT id, store_id, name, price FROM products WHERE id = $1 FOR UPDATE';
    const prodRes = await client.query(productQuery, [product_id]);

    if (!prodRes.rows.length) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'product not found' });
    }

    const product = prodRes.rows[0];

    // Optional: verify store_id matches (if provided)
    if (store_id && product.store_id !== store_id) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'product does not belong to provided store_id' });
    }

    const oldPrice = parseFloat(product.price || 0);

    // Update product price and updated_at
    await client.query(
      `UPDATE products SET price = $1, updated_at = now() WHERE id = $2`,
      [price, product_id]
    );

    // Insert into price history
    const histRes = await client.query(
      `INSERT INTO product_price_history (product_id, old_price, new_price, changed_by, changed_at)
       VALUES ($1,$2,$3,$4, now()) RETURNING id, product_id, old_price, new_price, changed_by, changed_at`,
      [product_id, oldPrice, price, changed_by || null]
    );

    await client.query('COMMIT');

    // Build response: updated product + history row
    const updatedProduct = {
      id: product.id,
      name: product.name,
      store_id: product.store_id,
      old_price: oldPrice,
      new_price: price,
      updated_at: new Date().toISOString()
    };

    client.release();
    return res.status(200).json({ product: updatedProduct, history: histRes.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    client.release();
    console.error('update-price error', err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
});

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Simple DB info helper (for debugging which database you're connected to)
app.get('/db-info', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT current_database() AS db, current_user AS user'
    );
    const row = r.rows[0] || {};
    const rawUrl = process.env.DATABASE_URL || '';
    // lightly masked + trimmed URL so you can confirm Neon vs Railway without exposing full creds
    let urlPrefix = rawUrl;
    if (urlPrefix.length > 90) {
      urlPrefix = urlPrefix.slice(0, 90) + '...';
    }

    return res.json({
      database: row.db || null,
      user: row.user || null,
      url_prefix: urlPrefix,
    });
  } catch (err) {
    console.error('db-info error', err);
    return res.status(500).json({ error: 'db-info failed' });
  }
});

// List all stores (for admin console)
// Admin-only: requires a valid ADMIN_TOKEN in Authorization header.
app.get('/stores', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name
         FROM stores
        ORDER BY id`
    );
    return res.json({ stores: result.rows });
  } catch (err) {
    console.error('list stores error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// Alias for admin dashboard: GET /admin/stores
// Returns the same payload as GET /stores so the frontend AdminDashboard
// can call api.getStores() which hits /admin/stores.
app.get('/admin/stores', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name
         FROM stores
        ORDER BY id`
    );
    return res.json({ stores: result.rows });
  } catch (err) {
    console.error('admin list stores error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// ---- Scale live stream (SSE) ----
app.get('/scale/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Allow frontend origin for SSE as well (in addition to global CORS middleware)
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // initial hello packet
  res.write(`data: ${JSON.stringify({ hello: true, ts: Date.now() })}\n\n`);

  const onWeight = (w) => {
    const payload = { weight_kg: w, ts: Date.now() };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  scaleEmitter.on('weight', onWeight);

  req.on('close', () => {
    scaleEmitter.off('weight', onWeight);
    res.end();
  });
});

// Debug endpoint: POST /scale/mock { "weight_kg": 1.2345 }
app.post('/scale/mock', (req, res) => {
  const w = Number(req.body.weight_kg);
  if (!Number.isFinite(w) || w <= 0) {
    return res.status(400).json({ error: 'Invalid weight_kg' });
  }
  const rounded = Number(w.toFixed(4));
  scaleEmitter.emit('weight', rounded);
  return res.json({ ok: true, weight_kg: rounded });
});

// Simple products endpoint (scoped by store session or admin)
app.get('/products', requireStoreOrAdmin, async (req, res) => {
  try {
    const session = req.auth_session;
    const isAdmin =
      session.terminal_uuid &&
      typeof session.terminal_uuid === 'string' &&
      session.terminal_uuid.startsWith('admin:');

    let storeIdFilter = null;

    if (!isAdmin) {
      // Store user → always force their own store_id
      storeIdFilter = session.store_id;
    } else if (req.query.store_id) {
      // Admin → can optionally filter by a specific store_id
      const parsed = parseInt(req.query.store_id, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        storeIdFilter = parsed;
      }
    }

    let sql = `
      SELECT id, sku, name, price, stock, store_id, unit, allow_decimal_qty
      FROM products
      WHERE deleted_at IS NULL
    `;
    const params = [];

    if (storeIdFilter) {
      sql += ` AND store_id = $1`;
      params.push(storeIdFilter);
    }

    sql += ` ORDER BY id ASC LIMIT 500`;

    const result = await pool.query(sql, params);
    return res.json({ products: result.rows });
  } catch (err) {
    console.error('products list error', err);
    return res.status(500).json({ products: [], note: 'db-error' });
  }
});

// ------------------------------------------------------------------
// Store product management (POS "Products" tab)
// These routes are for logged-in store sessions (not admin) so that
// each store can manage only its own products from the UI.
// Frontend should call /store/products... instead of /products... for writes.
// ------------------------------------------------------------------
app.post('/store/products', requireStoreOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const session = req.auth_session;
    // Only allow real store sessions (not admin) here for now
    if (!session || !session.store_id) {
      client.release();
      return res.status(403).json({ error: 'store session required' });
    }
    const storeId = session.store_id;

    // Accept multiple front-end field names and normalise:
    // - price, price_per_kg, price_per_qty
    // - stock, stock_qty
    const {
      sku,
      name,
      price,
      price_per_kg,
      price_per_qty,
      stock,
      stock_qty,
      unit,
      allow_decimal_qty,
    } = req.body;

    if (!name) {
      client.release();
      return res.status(400).json({ error: 'name required' });
    }
    if (!sku) {
      client.release();
      return res.status(400).json({ error: 'sku required' });
    }

    const rawPrice =
      price !== undefined && price !== null && price !== ''
        ? price
        : price_per_kg !== undefined && price_per_kg !== null && price_per_kg !== ''
        ? price_per_kg
        : price_per_qty !== undefined && price_per_qty !== null && price_per_qty !== ''
        ? price_per_qty
        : 0;

    const rawStock =
      stock !== undefined && stock !== null && stock !== ''
        ? stock
        : stock_qty !== undefined && stock_qty !== null && stock_qty !== ''
        ? stock_qty
        : 0;

    const parsedPrice = parseFloat(rawPrice);
    const parsedStock = parseFloat(rawStock);

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      client.release();
      return res
        .status(400)
        .json({ error: 'price must be non-negative number' });
    }
    if (isNaN(parsedStock) || parsedStock < 0) {
      client.release();
      return res
        .status(400)
        .json({ error: 'stock must be non-negative number' });
    }

    // normalise unit & allow_decimal_qty
    let finalUnit = (unit || '').toLowerCase();
    if (finalUnit !== 'qty' && finalUnit !== 'kg') {
      finalUnit = 'kg';
    }

    let finalAllowDecimal;
    if (typeof allow_decimal_qty === 'boolean') {
      finalAllowDecimal = allow_decimal_qty;
    } else if (
      typeof allow_decimal_qty === 'string' &&
      (allow_decimal_qty.toLowerCase() === 'true' ||
        allow_decimal_qty === '1')
    ) {
      finalAllowDecimal = true;
    } else if (
      typeof allow_decimal_qty === 'string' &&
      (allow_decimal_qty.toLowerCase() === 'false' ||
        allow_decimal_qty === '0')
    ) {
      finalAllowDecimal = false;
    } else {
      // default: decimals allowed for kg, not allowed for qty
      finalAllowDecimal = finalUnit === 'kg';
    }

    // ensure sku unique per store
    const exist = await client.query(
      'SELECT id FROM products WHERE sku = $1 AND store_id = $2 AND deleted_at IS NULL LIMIT 1',
      [sku, storeId]
    );
    if (exist.rows.length) {
      client.release();
      return res
        .status(409)
        .json({ error: 'product with this sku already exists for the store' });
    }

    const ins = await client.query(
      `INSERT INTO products (sku, name, price, stock, store_id, unit, allow_decimal_qty, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       RETURNING id, sku, name, price, stock, store_id, unit, allow_decimal_qty, updated_at`,
      [sku, name, parsedPrice, parsedStock, storeId, finalUnit, finalAllowDecimal]
    );

    client.release();
    return res.status(201).json({ product: ins.rows[0] });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      /* ignore */
    }
    client.release();
    console.error('store create product error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.put('/store/products/:id', requireStoreOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const session = req.auth_session;
    if (!session || !session.store_id) {
      client.release();
      return res.status(403).json({ error: 'store session required' });
    }
    const storeId = session.store_id;

    const productId = parseInt(req.params.id, 10);
    if (!productId) {
      client.release();
      return res.status(400).json({ error: 'invalid product id' });
    }

    let {
      sku,
      name,
      price,
      stock,
      price_per_kg,
      price_per_qty,
      stock_qty,
      unit,
      allow_decimal_qty,
    } = req.body;

    // Normalise alternate field names into price/stock
    if (price === undefined) {
      if (price_per_kg !== undefined) price = price_per_kg;
      else if (price_per_qty !== undefined) price = price_per_qty;
    }
    if (stock === undefined && stock_qty !== undefined) {
      stock = stock_qty;
    }

    // normalise unit & allow_decimal_qty if provided
    let finalUnit = unit;
    if (finalUnit != null) {
      finalUnit = String(finalUnit).toLowerCase();
      if (finalUnit !== 'qty' && finalUnit !== 'kg') {
        finalUnit = 'kg';
      }
    }

    let finalAllowDecimal = allow_decimal_qty;
    if (finalAllowDecimal != null) {
      if (typeof finalAllowDecimal === 'string') {
        const s = finalAllowDecimal.toLowerCase();
        if (s === 'true' || s === '1') finalAllowDecimal = true;
        else if (s === 'false' || s === '0') finalAllowDecimal = false;
      }
      if (typeof finalAllowDecimal !== 'boolean') {
        finalAllowDecimal = undefined;
      }
    }

    if (
      sku === undefined &&
      name === undefined &&
      price === undefined &&
      stock === undefined &&
      finalUnit === undefined &&
      finalAllowDecimal === undefined
    ) {
      client.release();
      return res.status(400).json({ error: 'nothing to update' });
    }

    const sets = [];
    const params = [];
    let idx = 1;

    if (sku !== undefined) {
      sets.push(`sku = $${idx++}`);
      params.push(sku);
    }
    if (name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(name);
    }
    if (price !== undefined) {
      sets.push(`price = $${idx++}`);
      params.push(parseFloat(price));
    }
    if (stock !== undefined) {
      sets.push(`stock = $${idx++}`);
      params.push(parseFloat(stock));
    }
    if (finalUnit !== undefined) {
      sets.push(`unit = $${idx++}`);
      params.push(finalUnit);
    }
    if (finalAllowDecimal !== undefined) {
      sets.push(`allow_decimal_qty = $${idx++}`);
      params.push(finalAllowDecimal);
    }

    sets.push(`updated_at = now()`);

    // Optional: if sku provided, ensure uniqueness per store
    if (sku !== undefined) {
      const conflict = await client.query(
        'SELECT id FROM products WHERE sku = $1 AND store_id = $2 AND id <> $3 AND deleted_at IS NULL LIMIT 1',
        [sku, storeId, productId]
      );
      if (conflict.rows.length) {
        client.release();
        return res
          .status(409)
          .json({ error: 'another product with this sku exists for the store' });
      }
    }

    const sql = `UPDATE products
                 SET ${sets.join(', ')}
                 WHERE id = $${idx} AND store_id = $${idx + 1} AND deleted_at IS NULL
                 RETURNING id, sku, name, price, stock, store_id, unit, allow_decimal_qty, updated_at`;
    params.push(productId, storeId);

    const r = await client.query(sql, params);
    client.release();

    if (!r.rows.length) {
      return res
        .status(404)
        .json({ error: 'product not found for this store' });
    }

    return res.json({ product: r.rows[0] });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      /* ignore */
    }
    client.release();
    console.error('store update product error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// Soft delete for store products
app.delete('/store/products/:id', requireStoreOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const session = req.auth_session;
    if (!session || !session.store_id) {
      client.release();
      return res.status(403).json({ error: 'store session required' });
    }
    const storeId = session.store_id;

    const productId = parseInt(req.params.id, 10);
    if (!productId) {
      client.release();
      return res.status(400).json({ error: 'invalid product id' });
    }

    const r = await client.query(
      `UPDATE products
       SET deleted_at = now(), updated_at = now()
       WHERE id = $1 AND store_id = $2 AND deleted_at IS NULL
       RETURNING id, sku, name, price, stock, store_id, updated_at`,
      [productId, storeId]
    );

    client.release();

    if (!r.rows.length) {
      return res
        .status(404)
        .json({ error: 'product not found or already deleted' });
    }

    return res.json({ deleted: true, product: r.rows[0] });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      /* ignore */
    }
    client.release();
    console.error('store delete product error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// POST /products/create
// Body:
// {
//   "sku": "TOM-1KG",
//   "name": "Tomato (1kg)",
//   "price": 30.00,
//   "stock": 100,
//   "store_id": 1
// }
app.post('/products/create', requireAdmin, async (req, res) => {  
    const client = await pool.connect();
  try {
    const {
      sku,
      name,
      price,
      price_per_kg,
      price_per_qty,
      stock,
      stock_qty,
      unit,
      allow_decimal_qty,
      store_id = 1,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name required' });
    if (!sku) return res.status(400).json({ error: 'sku required' });

    const rawPrice =
      price !== undefined && price !== null && price !== ''
        ? price
        : price_per_kg !== undefined && price_per_kg !== null && price_per_kg !== ''
        ? price_per_kg
        : price_per_qty !== undefined && price_per_qty !== null && price_per_qty !== ''
        ? price_per_qty
        : 0;

    const rawStock =
      stock !== undefined && stock !== null && stock !== ''
        ? stock
        : stock_qty !== undefined && stock_qty !== null && stock_qty !== ''
        ? stock_qty
        : 0;

    const parsedPrice = parseFloat(rawPrice);
    const parsedStock = parseFloat(rawStock);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: 'price must be non-negative number' });
    }
    if (isNaN(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ error: 'stock must be non-negative number' });
    }

    // normalise unit & allow_decimal_qty
    let finalUnit = (unit || '').toLowerCase();
    if (finalUnit !== 'qty' && finalUnit !== 'kg') {
      finalUnit = 'kg';
    }

    let finalAllowDecimal;
    if (typeof allow_decimal_qty === 'boolean') {
      finalAllowDecimal = allow_decimal_qty;
    } else if (
      typeof allow_decimal_qty === 'string' &&
      (allow_decimal_qty.toLowerCase() === 'true' || allow_decimal_qty === '1')
    ) {
      finalAllowDecimal = true;
    } else if (
      typeof allow_decimal_qty === 'string' &&
      (allow_decimal_qty.toLowerCase() === 'false' || allow_decimal_qty === '0')
    ) {
      finalAllowDecimal = false;
    } else {
      finalAllowDecimal = finalUnit === 'kg';
    }

    // ensure sku unique per store (optional)
    const exist = await client.query('SELECT id FROM products WHERE sku = $1 AND store_id = $2 LIMIT 1', [sku, store_id]);
    if (exist.rows.length) {
      client.release();
      return res.status(409).json({ error: 'product with this sku already exists for the store' });
    }

    const ins = await client.query(
      `INSERT INTO products (sku, name, price, stock, store_id, unit, allow_decimal_qty, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       RETURNING id, sku, name, price, stock, store_id, unit, allow_decimal_qty, updated_at`,
      [sku, name, parsedPrice, parsedStock, store_id, finalUnit, finalAllowDecimal]
    );

    client.release();
    return res.status(201).json({ product: ins.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(e){/*ignore*/}
    client.release();
    console.error('create product error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// PATCH /products/:id
// Body: any of { sku, name, price, stock, store_id }
app.patch('/products/:id', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const productId = parseInt(req.params.id, 10);
    if (!productId) return res.status(400).json({ error: 'invalid product id' });

    const { sku, name, price, stock, store_id } = req.body;
    if (sku === undefined && name === undefined && price === undefined && stock === undefined && store_id === undefined) {
      client.release();
      return res.status(400).json({ error: 'nothing to update' });
    }

    // build dynamic SET clause
    const sets = [];
    const params = [];
    let idx = 1;

    if (sku !== undefined) { sets.push(`sku = $${idx++}`); params.push(sku); }
    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
    if (price !== undefined) { sets.push(`price = $${idx++}`); params.push(parseFloat(price)); }
    if (stock !== undefined) { sets.push(`stock = $${idx++}`); params.push(parseFloat(stock)); }
    if (store_id !== undefined) { sets.push(`store_id = $${idx++}`); params.push(parseInt(store_id, 10)); }

    // always update timestamp
    sets.push(`updated_at = now()`);

    // Optional: if sku provided, ensure uniqueness per store
    if (sku !== undefined && (store_id !== undefined || true)) {
      // If store_id specified use that, else fetch current store_id
      const sId = store_id !== undefined ? parseInt(store_id,10) : null;
      if (sId === null) {
        // fetch product's current store_id
        const cur = await client.query('SELECT store_id FROM products WHERE id = $1 LIMIT 1', [productId]);
        if (!cur.rows.length) { client.release(); return res.status(404).json({ error: 'product not found' }); }
      }
      // Check SKU conflict (use provided or existing store_id)
      const checkStoreId = sId !== null ? sId : (await client.query('SELECT store_id FROM products WHERE id = $1',[productId])).rows[0].store_id;
      const conflict = await client.query('SELECT id FROM products WHERE sku = $1 AND store_id = $2 AND id <> $3 LIMIT 1', [sku, checkStoreId, productId]);
      if (conflict.rows.length) { client.release(); return res.status(409).json({ error: 'another product with this sku exists for the store' }); }
    }

    const sql = `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, sku, name, price, stock, store_id, unit, allow_decimal_qty, updated_at`;
    params.push(productId);

    const r = await client.query(sql, params);
    if (!r.rows.length) { client.release(); return res.status(404).json({ error: 'product not found' }); }

    client.release();
    return res.json({ product: r.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(e){/*ignore*/ }
    client.release();
    console.error('update product error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// DELETE /products/:id  (soft delete — sets deleted_at)
app.delete('/products/:id', requireAdmin, async (req, res) => {
      const client = await pool.connect();
  try {
    const productId = parseInt(req.params.id, 10);
    if (!productId) { client.release(); return res.status(400).json({ error: 'invalid product id' }); }

    // mark as deleted (soft delete)
    const r = await client.query(
      `UPDATE products SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id, sku, name, price, stock, store_id, updated_at`,
      [productId]
    );

    client.release();
    if (!r.rows.length) return res.status(404).json({ error: 'product not found or already deleted' });
    return res.json({ deleted: true, product: r.rows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(e){}
    client.release();
    console.error('delete product error', err);
    return res.status(500).json({ error: 'server error' });
  }
});


// ----------------- Admin login -----------------
// Admin login (simple) - uses bcryptjs hashing for verification
// Shared handler so we can support both /auth/admin-login and /admin/login
async function adminLoginHandler(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username & password required' });
  }

  const client = await pool.connect();
  try {
    // Verify credentials using pgcrypto's crypt() in the database
    const q = `
      SELECT id, username
      FROM admins
      WHERE username = $1
        AND password_hash = crypt($2, password_hash)
      LIMIT 1
    `;
    const r = await client.query(q, [username, password]);

    if (!r.rows.length) {
      client.release();
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const admin = r.rows[0];

    // create a session token in sessions table (reuse sessions table)
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(); // 7 days

    await client.query(
      `INSERT INTO sessions (store_id, token, terminal_uuid, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [null, token, `admin:${admin.id}`, expiresAt]
    );

    client.release();
    return res.json({
      token,
      admin_id: admin.id,
      username: admin.username,
    });
  } catch (err) {
    client.release();
    console.error('admin login error', err);
    return res.status(500).json({ error: 'server error' });
  }
}

// Main admin login endpoints
// Body: { "username": "admin", "password": "pass" }
app.post('/auth/admin-login', adminLoginHandler);
app.post('/admin/login', adminLoginHandler);


// ----------------- Admin helpers -----------------

// admin-only middleware: requires Authorization: Bearer <token>
// recognizes admin sessions (terminal_uuid startsWith 'admin:')
async function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });
    const token = auth.replace('Bearer ', '').trim();
    const r = await pool.query(
      `SELECT * FROM sessions WHERE token = $1 AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
      [token]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'invalid token' });
    const session = r.rows[0];
    if (!session.terminal_uuid || !session.terminal_uuid.startsWith('admin:')) {
      return res.status(403).json({ error: 'for admins only' });
    }
    req.admin_session = session;
    next();
  } catch (err) {
    console.error('requireAdmin error', err);
    return res.status(500).json({ error: 'server error' });
  }
}

// POST /admin/create  (admin-only) - create another admin user
// Body: { username, password }
app.post('/admin/create', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, password } = req.body;
    if (!username || !password) { client.release(); return res.status(400).json({ error: 'username & password required' }); }

    // insert using pgcrypt crypt()
    const q = `INSERT INTO admins (username, password_hash) VALUES ($1, crypt($2, gen_salt('bf'))) RETURNING id, username, created_at`;
    const r = await client.query(q, [username, password]);
    client.release();
    return res.status(201).json({ admin: r.rows[0] });
  } catch (err) {
    client.release();
    console.error('admin create error', err);
    if (err.code === '23505') return res.status(409).json({ error: 'username exists' });
    return res.status(500).json({ error: 'server error' });
  }
});

// GET /admin/list (admin-only) - list admins
app.get('/admin/list', requireAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, username, created_at FROM admins ORDER BY id ASC');
    return res.json({ admins: r.rows });
  } catch (err) {
    console.error('admin list error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// Admin helper: impersonate a store and create a store session token
// POST /admin/impersonate-store { store_id }
// Returns: { token, store_id, store: { id, name } }
app.post('/admin/impersonate-store', requireAdmin, async (req, res) => {
  const rawStoreId = req.body && req.body.store_id;
  const storeId = parseInt(rawStoreId, 10);
  if (!storeId) {
    return res.status(400).json({ error: 'store_id required' });
  }

  const client = await pool.connect();
  try {
    // Ensure the store exists
    const storeRes = await client.query(
      'SELECT id, name FROM stores WHERE id = $1 LIMIT 1',
      [storeId]
    );
    if (!storeRes.rows.length) {
      client.release();
      return res.status(404).json({ error: 'store not found' });
    }

    // Create a new session token that behaves like a store session
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // 24h impersonation

    const terminalUuid = `admin-impersonate-store-${storeId}`;

    await client.query(
      `INSERT INTO sessions (store_id, token, terminal_uuid, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [storeId, token, terminalUuid, expiresAt]
    );

    // Optional: register a virtual terminal so it appears in terminals table
    await client.query(
      `INSERT INTO terminals (store_id, terminal_uuid, label)
       VALUES ($1,$2,$3)
       ON CONFLICT (terminal_uuid) DO UPDATE SET label = EXCLUDED.label`,
      [storeId, terminalUuid, 'Admin POS']
    );

    client.release();

    return res.json({
      token,
      store_id: storeId,
      store: storeRes.rows[0],
    });
  } catch (err) {
    client.release();
    console.error('admin impersonate-store error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// requireStoreOrAdmin middleware
// Allows request if token belongs to an admin OR a valid store session for the requested store.
// Usage: put this middleware on POST /invoices to protect invoice creation.
async function requireStoreOrAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });
    const token = auth.replace('Bearer ', '').trim();

    const r = await pool.query(
      `SELECT * FROM sessions WHERE token = $1 AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
      [token]
    );
    if (!r.rows.length) return res.status(401).json({ error: 'invalid token' });

    const session = r.rows[0];

    // Admin sessions: terminal_uuid like 'admin:<id>' -> allow
    if (session.terminal_uuid && session.terminal_uuid.startsWith('admin:')) {
      req.auth_session = session;
      return next();
    }

    // For store sessions, ensure store_id exists in session
    // and (optionally) matches the store_id in the request body (if provided)
    if (!session.store_id) return res.status(403).json({ error: 'token not linked to a store' });

    const storeIdFromBody = req.body && req.body.store_id ? parseInt(req.body.store_id, 10) : null;
    if (storeIdFromBody && storeIdFromBody !== session.store_id) {
      return res.status(403).json({ error: 'token does not belong to the requested store' });
    }

    req.auth_session = session;
    next();
  } catch (err) {
    console.error('requireStoreOrAdmin error', err);
    return res.status(500).json({ error: 'server error' });
  }
}
  // POST /auth/store-login (store credentials -> returns session token)
  // Body: { "username":"store1", "password":"store1pass", "terminal_uuid":"term-web-01" }
app.post('/auth/store-login', async (req, res) => {
  const { username, password, terminal_uuid } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username & password required' });
  }

  const client = await pool.connect();
  try {
    // Fetch credential row by username only – no crypt() in SQL
    const q = `
      SELECT sc.store_id,
             sc.username,
             sc.password_hash
        FROM store_credentials sc
       WHERE sc.username = $1
       LIMIT 1
    `;
    const r = await client.query(q, [username]);

    if (!r.rows.length) {
      client.release();
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const row = r.rows[0];
    const store_id = row.store_id;
    const storedHash = row.password_hash || '';

    // Decide how to verify:
    // - If it looks like a bcrypt hash ($2...), use bcryptjs.
    // - Otherwise, fall back to plain-text equality.
    let ok = false;

    if (storedHash && storedHash.startsWith('$2')) {
      try {
        ok = await bcrypt.compare(password, storedHash);
      } catch (err) {
        console.error('store-login bcrypt compare failed', err);
        ok = false;
      }
    } else {
      ok = storedHash === password;
    }

    if (!ok) {
      client.release();
      return res.status(401).json({ error: 'invalid credentials' });
    }

    // create session token
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

    await client.query(
      `INSERT INTO sessions (store_id, token, terminal_uuid, expires_at)
       VALUES ($1,$2,$3,$4)`,
      [store_id, token, terminal_uuid || null, expiresAt]
    );

    // Optionally auto-register terminal if not present
    if (terminal_uuid) {
      await client.query(
        `INSERT INTO terminals (store_id, terminal_uuid, label)
         VALUES ($1,$2,$3)
         ON CONFLICT (terminal_uuid) DO UPDATE SET label = EXCLUDED.label`,
        [store_id, terminal_uuid, 'Terminal']
      );
    }

    client.release();
    return res.json({ token, store_id });
  } catch (err) {
    client.release();
    console.error('/auth/store-login error', err);
    // Return the actual error message so the frontend sees what's wrong
    return res.status(500).json({ error: err.message || 'server error' });
  }
});

// POST /terminals/register (register terminal_uuid to store)
app.post('/terminals/register', async (req, res) => {
  const { store_id, terminal_uuid, label } = req.body;
  if (!store_id || !terminal_uuid) return res.status(400).json({ error: 'store_id and terminal_uuid required' });

  const client = await pool.connect();
  try {
    const r = await client.query(
      `INSERT INTO terminals (store_id, terminal_uuid, label)
       VALUES ($1,$2,$3)
       ON CONFLICT (terminal_uuid) DO UPDATE SET label = EXCLUDED.label
       RETURNING id, store_id, terminal_uuid, label, created_at`,
      [store_id, terminal_uuid, label || null]
    );
    client.release();
    return res.json({ terminal: r.rows[0] });
  } catch (err) {
    client.release();
    console.error('terminal register error', err);
    return res.status(500).json({ error: 'server error' });
  }
});


/*
POST /invoices
Body:
{
  "store_id": 1,
  "terminal_id": 1,
  "idempotency_key": "client-uuid-123",
  "items": [
    { "product_id": 1, "qty": 2 },
    { "product_id": 2, "qty": 1 }
  ],
  "tax": 0.00,
  "payment_mode": "CASH"
}
*/

// Helper: recompute monthly summary for a given store + year + month
// from the live invoices table (excluding voided invoices).
// This keeps monthly_reports consistent when invoices are voided.
async function recalcMonthlyReportFor(storeId, year, month) {
  const client = await pool.connect();
  try {
    // Build [start, end) range in UTC
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end =
      month === 12
        ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0))
        : new Date(Date.UTC(year, month, 1, 0, 0, 0));

    const summarySql = `
      SELECT
        COUNT(*)::int AS invoice_count,
        COALESCE(SUM(total - tax),0)::numeric(12,2) AS subtotal_sales,
        COALESCE(SUM(tax),0)::numeric(12,2)         AS total_tax,
        COALESCE(SUM(total),0)::numeric(12,2)       AS total_sales
      FROM invoices
      WHERE store_id = $1
        AND status <> 'voided'
        AND created_at >= $2
        AND created_at <  $3
    `;
    const summaryRes = await client.query(summarySql, [storeId, start, end]);
    const s = summaryRes.rows[0] || {
      invoice_count: 0,
      subtotal_sales: 0,
      total_tax: 0,
      total_sales: 0,
    };

    const invoiceCount = Number(s.invoice_count || 0);
    const subtotal = Number(s.subtotal_sales || 0);
    const tax = Number(s.total_tax || 0);
    const total = Number(s.total_sales || 0);

    // Upsert into monthly_reports
    await client.query(
      `INSERT INTO monthly_reports (store_id, year, month, invoice_count, subtotal, tax, total, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
       ON CONFLICT (store_id, year, month)
       DO UPDATE SET
         invoice_count = EXCLUDED.invoice_count,
         subtotal      = EXCLUDED.subtotal,
         tax           = EXCLUDED.tax,
         total         = EXCLUDED.total,
         updated_at    = now()`,
      [storeId, year, month, invoiceCount, subtotal, tax, total]
    );

    return {
      store_id: storeId,
      year,
      month,
      invoice_count: invoiceCount,
      subtotal,
      tax,
      total,
    };
  } catch (err) {
    console.error('recalcMonthlyReportFor error', err);
    throw err;
  } finally {
    client.release();
  }
}

// POST /invoices (updated to include store name in response + monthly_reports rollup)
app.post('/invoices', requireStoreOrAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { store_id, terminal_id, idempotency_key, items, tax = 0, payment_mode = 'CASH' } = req.body;
    if (!idempotency_key) return res.status(400).json({ error: 'idempotency_key required' });
    if (!store_id || !terminal_id) return res.status(400).json({ error: 'store_id and terminal_id required' });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items required' });

    // Check idempotency
    const existing = await client.query(
      'SELECT id FROM invoices WHERE idempotency_key = $1 AND store_id = $2 LIMIT 1',
      [idempotency_key, store_id]
    );
    if (existing.rows.length) {
      const existId = existing.rows[0].id;
      const inv = await client.query(
        `SELECT i.*, s.name AS store_name
         FROM invoices i JOIN stores s ON s.id = i.store_id
         WHERE i.id = $1`,
        [existId]
      );
      const itemsRes = await client.query(
        `SELECT ii.*, p.name FROM invoice_items ii JOIN products p ON p.id = ii.product_id WHERE ii.invoice_id = $1`,
        [existId]
      );
      const invRow = inv.rows[0];
      const response = {
        note: 'idempotent',
        invoice: {
          id: invRow.id,
          invoice_no: invRow.invoice_no,
          created_at: invRow.created_at,
          store: { id: invRow.store_id, name: invRow.store_name },
          terminal_id: invRow.terminal_id,
          total: invRow.total,
          tax: invRow.tax,
          status: invRow.status,
          idempotency_key: invRow.idempotency_key,
          items: itemsRes.rows
        }
      };
      client.release();
      return res.status(200).json(response);
    }

    await client.query('BEGIN');

    // Lock product rows to prevent concurrent stock race
    const productIds = items.map(it => it.product_id);
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',');
    const productQuery = `SELECT id, name, price, stock FROM products WHERE id IN (${placeholders}) FOR UPDATE`;
    const productRes = await client.query(productQuery, productIds);

    const prodMap = {};
    for (const r of productRes.rows) prodMap[r.id] = r;

    // Validate and compute totals
    let subtotal = 0;
    const invoiceItems = [];
    for (const it of items) {
      const p = prodMap[it.product_id];
      if (!p) throw new Error(`Product ${it.product_id} not found`);

      // Allow decimal quantities (e.g. kg from weighing scale)
      const qty = Number(it.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Invalid qty');
      }

      // Treat stock as numeric as well (so it can be fractional if you use kg as stock unit)
      // NOTE: We no longer block billing when stock is low or zero.
      // Stock may go negative; this is intentional so that checkout is never blocked.

      const rate = parseFloat(p.price);
      const amount = +(rate * qty).toFixed(2);
      subtotal += amount;

      invoiceItems.push({
        product_id: it.product_id,
        qty,
        rate,
        amount,
        name: p.name
      });
    }

    const taxAmount = +parseFloat(tax || 0).toFixed(2);
    const total = +(subtotal + taxAmount).toFixed(2);
    const invoice_no = `INV-${Date.now()}`;

    // Insert invoice
    const insertInv = await client.query(
      `INSERT INTO invoices (invoice_no, store_id, terminal_id, total, tax, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, invoice_no, created_at`,
      [invoice_no, store_id, terminal_id, total, taxAmount, idempotency_key]
    );
    const invoiceId = insertInv.rows[0].id;
    const createdAt = insertInv.rows[0].created_at || new Date();

    // Insert items & decrement stock
    for (const it of invoiceItems) {
      await client.query(
        `INSERT INTO invoice_items (invoice_id, product_id, qty, rate, amount)
         VALUES ($1,$2,$3,$4,$5)`,
        [invoiceId, it.product_id, it.qty, it.rate, it.amount]
      );
      await client.query(
        `UPDATE products SET stock = stock - $1, updated_at = now() WHERE id = $2`,
        [it.qty, it.product_id]
      );
    }

    // --- NEW: roll up into monthly_reports inside the same transaction ---
    const year = createdAt.getUTCFullYear();
    const month = createdAt.getUTCMonth() + 1; // 1–12
    await client.query(
      `INSERT INTO monthly_reports (store_id, year, month, invoice_count, subtotal, tax, total, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
       ON CONFLICT (store_id, year, month)
       DO UPDATE SET
         invoice_count = monthly_reports.invoice_count + EXCLUDED.invoice_count,
         subtotal      = monthly_reports.subtotal      + EXCLUDED.subtotal,
         tax           = monthly_reports.tax           + EXCLUDED.tax,
         total         = monthly_reports.total         + EXCLUDED.total,
         updated_at    = now()`,
      [store_id, year, month, 1, +subtotal.toFixed(2), taxAmount, total]
    );

    await client.query('COMMIT');

    // fetch store name for response
    const storeRes = await client.query('SELECT id, name FROM stores WHERE id = $1 LIMIT 1', [store_id]);
    const storeRow = storeRes.rows[0] || { id: store_id, name: null };

    // Build printable payload including store name
    const payload = {
      invoice_id: invoiceId,
      invoice_no,
      store: { id: storeRow.id, name: storeRow.name },
      terminal_id,
      created_at: createdAt,
      items: invoiceItems.map(i => ({
        product_id: i.product_id,
        name: i.name,
        qty: i.qty,
        rate: i.rate,
        amount: i.amount
      })),
      subtotal: +subtotal.toFixed(2),
      tax: taxAmount,
      total,
      payment_mode
    };

    // 🔔 broadcast to all live WS clients (Invoices page, etc.)
    broadcastNewInvoice(payload);

    client.release();
    return res.status(201).json({ invoice: payload });

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(e){ }
    client.release();
    console.error('Invoice error', err.message || err);
    return res.status(500).json({ error: err.message || 'server error' });
  }
});

// Admin-only: "void" (soft cancel) an invoice and restore product stock.
// This keeps the invoice row for audit but flags it as voided so you can
// exclude it from reports if desired. Also updates monthly_reports so
// voided invoices are not counted in monthly totals.
app.post('/admin/invoices/:id/void', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (!invoiceId) {
      client.release();
      return res.status(400).json({ error: 'invalid invoice id' });
    }

    const reason =
      req.body && req.body.reason ? String(req.body.reason) : null;

    await client.query('BEGIN');

    // 1) Lock the invoice row so two admins can't void at the same time
    const invRes = await client.query(
      `SELECT id, status, store_id, created_at
         FROM invoices
        WHERE id = $1
        FOR UPDATE`,
      [invoiceId]
    );

    if (!invRes.rows.length) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'invoice not found' });
    }

    const existing = invRes.rows[0];
    if (existing.status === 'voided') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'invoice already voided' });
    }

    const storeId = existing.store_id;
    const createdAt = existing.created_at || new Date();
    const year = createdAt.getUTCFullYear();
    const month = createdAt.getUTCMonth() + 1;

    // 2) Fetch items and restore stock for each product on this invoice
    const itemsRes = await client.query(
      `SELECT product_id, qty
         FROM invoice_items
        WHERE invoice_id = $1`,
      [invoiceId]
    );

    for (const it of itemsRes.rows) {
      if (!it.product_id) continue;
      const qty = Number(it.qty);
      if (!Number.isFinite(qty) || qty === 0) continue;

      await client.query(
        `UPDATE products
            SET stock = stock + $1
          WHERE id = $2`,
        [qty, it.product_id]
      );
    }

    // 3) Mark invoice as voided
    const updRes = await client.query(
      `UPDATE invoices
          SET status = 'voided'
        WHERE id = $1
        RETURNING id, invoice_no, store_id, terminal_id, total, tax, created_at, status`,
      [invoiceId]
    );

    await client.query('COMMIT');
    client.release();

    // 4) Recalculate that store+month summary from invoices (excluding voided).
    // This uses the helper defined above. We do it *outside* the transaction
    // for simplicity; if it fails, monthly_reports might be slightly stale,
    // but invoices will still be correct.
    recalcMonthlyReportFor(storeId, year, month).catch((err) => {
      console.error('monthly_reports recompute after void failed', err);
    });

    return res.json({
      invoice: updRes.rows[0],
      note: 'invoice marked as voided and stock restored',
      reason: reason || undefined,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      /* ignore */
    }
    client.release();
    console.error('admin void invoice error', err);
    return res.status(500).json({ error: 'server error' });
  }
});


// GET invoice details (simple, scoped)
// GET /invoices
// Query params:
//   store_id=1         (optional for admin; ignored for store users)
//   date=YYYY-MM-DD    (optional, single date)
//   since=ISO_TS       (optional, ISO timestamp, returns invoices after this)
//   limit=100          (optional)
app.get('/invoices', requireStoreOrAdmin, async (req, res) => {
  try {
    const session = req.auth_session;
    const isAdmin =
      session.terminal_uuid &&
      typeof session.terminal_uuid === 'string' &&
      session.terminal_uuid.startsWith('admin:');

    // Decide which store's invoices to show
    let storeId = null;
    if (!isAdmin) {
      // Store user → always locked to own store
      storeId = session.store_id;
    } else if (req.query.store_id) {
      const parsed = parseInt(req.query.store_id, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        storeId = parsed;
      }
    }

    const date = req.query.date || null;
    const since = req.query.since || null;
    const limit = Math.min(500, parseInt(req.query.limit || '100', 10));

    let sql = `
      SELECT
        i.id,
        i.invoice_no,
        i.created_at,
        i.store_id,
        s.name AS store_name,
        i.total,
        i.tax,
        i.status
      FROM invoices i
      JOIN stores s ON s.id = i.store_id
    `;

    // Always hide voided invoices from the normal list
    const where = [`i.status <> 'voided'`];
    const params = [];

    if (storeId) {
      params.push(storeId);
      where.push(`i.store_id = $${params.length}`);
    }

    if (date) {
      params.push(date);
      where.push(`(i.created_at::date) = $${params.length}::date`);
    } else if (since) {
      params.push(since);
      where.push(`i.created_at > $${params.length}`);
    }

    if (where.length) {
      sql += ' WHERE ' + where.join(' AND ');
    }

    sql += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const r = await pool.query(sql, params);
    const invoices = r.rows;

    // optionally fetch items for each invoice (to keep payload small, only when ?items=1)
    if (req.query.items === '1' && invoices.length) {
      const invIds = invoices.map((i) => i.id);
      const placeholders = invIds.map((_, i) => `$${i + 1}`).join(',');
      const itemsQ = await pool.query(
        `SELECT ii.invoice_id, ii.product_id, ii.qty, ii.rate, ii.amount, p.name
         FROM invoice_items ii
         JOIN products p ON p.id = ii.product_id
         WHERE ii.invoice_id IN (${placeholders})
         ORDER BY ii.id ASC`,
        invIds
      );

      const itemsByInv = {};
      for (const it of itemsQ.rows) {
        if (!itemsByInv[it.invoice_id]) itemsByInv[it.invoice_id] = [];
        itemsByInv[it.invoice_id].push(it);
      }

      for (const inv of invoices) {
        inv.items = itemsByInv[inv.id] || [];
      }
    }

    return res.json({ count: invoices.length, invoices });
  } catch (err) {
    console.error('list invoices error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// GET /products/changes?since=...&store_id=...
// GET /products/changes?since=...&store_id=...
app.get('/products/changes', requireStoreOrAdmin, async (req, res) => {
  try {
    const session = req.auth_session;
    const isAdmin =
      session.terminal_uuid &&
      typeof session.terminal_uuid === 'string' &&
      session.terminal_uuid.startsWith('admin:');

    const since = req.query.since;
    if (!since) {
      return res
        .status(400)
        .json({ error: 'since query param required (ISO timestamp)' });
    }

    let storeId = null;
    if (!isAdmin) {
      storeId = session.store_id;
    } else if (req.query.store_id) {
      const parsed = parseInt(req.query.store_id, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        storeId = parsed;
      }
    }

    const q = storeId
      ? `SELECT id, sku, name, price, stock, store_id, unit, allow_decimal_qty, updated_at
         FROM products
         WHERE store_id=$1 AND updated_at > $2
         ORDER BY updated_at ASC`
      : `SELECT id, sku, name, price, stock, store_id, unit, allow_decimal_qty, updated_at
         FROM products
         WHERE updated_at > $1
         ORDER BY updated_at ASC`;

    const params = storeId ? [storeId, since] : [since];
    const r = await pool.query(q, params);
    return res.json({ since, count: r.rows.length, products: r.rows });
  } catch (err) {
    console.error('products changes error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// GET /product-price-history?product_id=1
app.get('/product-price-history', async (req, res) => {
  try {
    const productId = parseInt(req.query.product_id, 10);
    if (!productId) return res.status(400).json({ error: 'product_id required' });

    const r = await pool.query(
      `SELECT id, product_id, old_price, new_price, changed_by, changed_at
       FROM product_price_history
       WHERE product_id = $1
       ORDER BY changed_at DESC
       LIMIT 100`,
      [productId]
    );

    return res.json({ product_id: productId, history: r.rows });
  } catch (err) {
    console.error('product history error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// POST /products/update-prices (bulk)
// Body: { "updates": [ { "product_id":1, "new_price": 35.5, "changed_by":"admin" }, ... ] }
app.post('/products/update-prices', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) return res.status(400).json({ error: 'updates array required' });

    await client.query('BEGIN');

    const results = [];
    for (const u of updates) {
      const product_id = u.product_id;
      const price = parseFloat(u.new_price);
      const changed_by = u.changed_by || null;
      if (!product_id || isNaN(price) || price < 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ error: 'invalid product_id or new_price in updates' });
      }

      const prodRes = await client.query('SELECT id, name, price FROM products WHERE id = $1 FOR UPDATE', [product_id]);
      if (!prodRes.rows.length) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: `product ${product_id} not found` });
      }

      const oldPrice = parseFloat(prodRes.rows[0].price || 0);
      await client.query('UPDATE products SET price = $1, updated_at = now() WHERE id = $2', [price, product_id]);
      const hist = await client.query(
        `INSERT INTO product_price_history (product_id, old_price, new_price, changed_by, changed_at)
         VALUES ($1,$2,$3,$4, now()) RETURNING id, product_id, old_price, new_price, changed_by, changed_at`,
        [product_id, oldPrice, price, changed_by]
      );
      results.push({ product_id, name: prodRes.rows[0].name, old_price: oldPrice, new_price: price, history: hist.rows[0] });
    }

    await client.query('COMMIT');
    client.release();
    return res.json({ updated: results.length, results });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(e) {}
    client.release();
    console.error('bulk update error', err);
    return res.status(500).json({ error: 'server error' });
  }
});


// ------------------------------------------------------------
// Housekeeping: purge old invoices + items
// ------------------------------------------------------------
// Helper that removes invoices (and their invoice_items) older than N days.
// NOTE: This is a hard delete. Only use if you're okay losing old data.
async function purgeOldInvoices(maxAgeDays = 7) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find old invoice ids
    const findOld = await client.query(
      `SELECT id
         FROM invoices
        WHERE created_at < now() - ($1::int || ' days')::interval`,
      [maxAgeDays]
    );
    const ids = findOld.rows.map((r) => r.id);

    if (!ids.length) {
      await client.query('COMMIT');
      client.release();
      console.log(`[purgeOldInvoices] nothing to delete (maxAgeDays=${maxAgeDays})`);
      return { deleted_invoices: 0, deleted_items: 0 };
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

    // Delete invoice_items first due to FK
    const delItems = await client.query(
      `DELETE FROM invoice_items WHERE invoice_id IN (${placeholders})`,
      ids
    );

    // Then delete invoices
    const delInv = await client.query(
      `DELETE FROM invoices WHERE id IN (${placeholders})`,
      ids
    );

    await client.query('COMMIT');
    client.release();

    console.log(
      `[purgeOldInvoices] deleted ${delInv.rowCount} invoices and ${delItems.rowCount} items (older than ${maxAgeDays} days)`
    );

    return {
      deleted_invoices: delInv.rowCount,
      deleted_items: delItems.rowCount,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (e) {
      /* ignore */
    }
    client.release();
    console.error('purgeOldInvoices error', err);
    throw err;
  }
}

// Admin-only manual trigger:
// POST /admin/maintenance/purge-invoices  { "days": 20 }
app.post('/admin/maintenance/purge-invoices', requireAdmin, async (req, res) => {
  try {
    const rawDays = req.body && req.body.days;
    let days = parseInt(rawDays, 10);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      days = 7; // sane default (keep only last 7 days) if input missing/invalid
    }

    const result = await purgeOldInvoices(days);
    return res.json({
      ok: true,
      maxAgeDays: days,
      ...result,
    });
  } catch (err) {
    console.error('manual purge-invoices error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// Optional: automatic daily purge (runs every 24h)
// This uses the same helper, hard-coded to 7 days (keep only last 1 week of invoices).
setInterval(() => {
  purgeOldInvoices(7).catch((err) => {
    console.error('purgeOldInvoices interval error', err);
  });
}, 24 * 60 * 60 * 1000);

// GET /reports/daily-sales?store_id=1&date=YYYY-MM-DD
// For store users: store_id is taken from their session.
// For admin users: store_id must be provided in the query string.
app.get('/reports/daily-sales', requireStoreOrAdmin, async (req, res) => {
  try {
    const session = req.auth_session;
    const isAdmin =
      session.terminal_uuid &&
      typeof session.terminal_uuid === 'string' &&
      session.terminal_uuid.startsWith('admin:');

    let storeId;
    if (!isAdmin) {
      // Store user -> locked to its own store
      storeId = session.store_id;
    } else {
      // Admin must specify which store
      storeId = parseInt(req.query.store_id, 10);
      if (!storeId) {
        return res
          .status(400)
          .json({ error: 'store_id required for admin daily report' });
      }
    }

    const dateStr = req.query.date;
    if (!dateStr) {
      return res
        .status(400)
        .json({ error: 'date (YYYY-MM-DD) is required' });
    }

    // Totals for that store on that date (DB timezone already Asia/Kolkata)
    const summarySql = `
      SELECT
        COUNT(*)::int AS invoice_count,
        COALESCE(SUM(total - tax),0)::numeric(12,2) AS subtotal_sales,
        COALESCE(SUM(tax),0)::numeric(12,2)         AS total_tax,
        COALESCE(SUM(total),0)::numeric(12,2)       AS total_sales
      FROM invoices
      WHERE store_id = $1
        AND status <> 'voided'
        AND created_at::date = $2::date
    `;

    const summaryRes = await pool.query(summarySql, [storeId, dateStr]);
    const s =
      summaryRes.rows[0] || {
        invoice_count: 0,
        subtotal_sales: 0,
        total_tax: 0,
        total_sales: 0,
      };

    const invoiceCount = Number(s.invoice_count || 0);
    const subtotal = Number(s.subtotal_sales || 0);
    const tax = Number(s.total_tax || 0);
    const total = Number(s.total_sales || 0);
    const avgInvoiceValue = invoiceCount ? total / invoiceCount : 0;

    return res.json({
      store_id: storeId,
      date: dateStr,
      totals: {
        invoice_count: invoiceCount,
        subtotal,
        tax,
        total,
        avg_invoice_value: avgInvoiceValue,
      },
    });
  } catch (err) {
    console.error('daily-sales error', err);
    return res.status(500).json({ error: 'server error' });
  }
});
// --- NOTE: one-time SQL to create the monthly_reports table ---
// Run this in your database (psql / Neon SQL console):
//
// CREATE TABLE IF NOT EXISTS monthly_reports (
//   store_id      integer NOT NULL REFERENCES stores(id),
//   year          integer NOT NULL,
//   month         integer NOT NULL, -- 1-12
//   invoice_count integer NOT NULL DEFAULT 0,
//   subtotal      numeric(12,2) NOT NULL DEFAULT 0,
//   tax           numeric(12,2) NOT NULL DEFAULT 0,
//   total         numeric(12,2) NOT NULL DEFAULT 0,
//   created_at    timestamptz NOT NULL DEFAULT now(),
//   updated_at    timestamptz NOT NULL DEFAULT now(),
//   CONSTRAINT monthly_reports_store_month_unique
//     UNIQUE (store_id, year, month)
// );
//
// After creating it, the POST /invoices endpoint will start
// auto-updating per-month totals, and /reports/monthly will read
// from this table so that your monthly numbers remain correct even
// after old invoices are purged.

// GET /reports/monthly?store_id=1&year=2025&month=12
// Returns monthly summary + per-day and payment-mode breakdown.
// Totals come primarily from monthly_reports (so they survive invoice purges),
// with a fallback to live invoices if the summary row does not exist yet.
app.get('/reports/monthly', requireStoreOrAdmin, async (req, res) => {
  try {
    const session = req.auth_session;
    const isAdmin =
      session.terminal_uuid &&
      typeof session.terminal_uuid === 'string' &&
      session.terminal_uuid.startsWith('admin:');

    let storeId;
    if (!isAdmin) {
      // Store user → locked to their own store
      storeId = session.store_id;
    } else {
      storeId = parseInt(req.query.store_id, 10);
      if (!storeId) {
        return res.status(400).json({ error: 'store_id is required for admin' });
      }
    }

    const now = new Date();
    const year = req.query.year ? Number(req.query.year) : now.getFullYear();
    const month = req.query.month ? Number(req.query.month) : now.getMonth() + 1; // 1-12

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    // Build [start, end) range in UTC
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const end =
      month === 12
        ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0))
        : new Date(Date.UTC(year, month, 1, 0, 0, 0));

    // 0) Try to read pre-aggregated totals from monthly_reports
    let invoiceCount, subtotal, tax, total;
    let usedPrecomputed = false;

    try {
      const aggRes = await pool.query(
        `SELECT invoice_count, subtotal, tax, total
           FROM monthly_reports
          WHERE store_id = $1 AND year = $2 AND month = $3
          LIMIT 1`,
        [storeId, year, month]
      );
      if (aggRes.rows.length) {
        usedPrecomputed = true;
        const row = aggRes.rows[0];
        invoiceCount = Number(row.invoice_count || 0);
        subtotal = Number(row.subtotal || 0);
        tax = Number(row.tax || 0);
        total = Number(row.total || 0);
      }
    } catch (err) {
      console.error('read monthly_reports error (fallback to live invoices)', err);
    }

    // 1) If no precomputed row, compute from live invoices (for backwards compatibility)
    if (!usedPrecomputed) {
      const summarySql = `
        SELECT
          COUNT(*)::int AS invoice_count,
          COALESCE(SUM(total - tax),0)::numeric(12,2) AS subtotal_sales,
          COALESCE(SUM(tax),0)::numeric(12,2)         AS total_tax,
          COALESCE(SUM(total),0)::numeric(12,2)       AS total_sales
        FROM invoices
        WHERE store_id = $1
          AND status <> 'voided'
          AND created_at >= $2
          AND created_at <  $3
      `;
      const summaryRes = await pool.query(summarySql, [storeId, start, end]);
      const s = summaryRes.rows[0] || {
        invoice_count: 0,
        subtotal_sales: 0,
        total_tax: 0,
        total_sales: 0,
      };

      invoiceCount = Number(s.invoice_count || 0);
      subtotal = Number(s.subtotal_sales || 0);
      tax = Number(s.total_tax || 0);
      total = Number(s.total_sales || 0);
    }

    // 2) Per-day breakdown (still from invoices, so may only cover recent days
    //    if you are purging old invoices; that's OK for charts).
    const dailySql = `
      SELECT
        (created_at::date)                          AS day,
        COUNT(*)::int                               AS invoice_count,
        COALESCE(SUM(total),0)::numeric(12,2)       AS total_sales
      FROM invoices
      WHERE store_id = $1
        AND status <> 'voided'
        AND created_at >= $2
        AND created_at <  $3
      GROUP BY created_at::date
      ORDER BY created_at::date
    `;
    const dailyRes = await pool.query(dailySql, [storeId, start, end]);

    // 3) Breakdown by payment mode
    // NOTE: Your current invoices table does not store payment_mode,
    // so we aggregate everything into a single bucket labelled "ALL".
    const payModeSql = `
      SELECT
        'ALL'::text                                  AS payment_mode,
        COUNT(*)::int                                AS invoice_count,
        COALESCE(SUM(total),0)::numeric(12,2)        AS total_sales
      FROM invoices
      WHERE store_id = $1
        AND status <> 'voided'
        AND created_at >= $2
        AND created_at <  $3
    `;
    const payModeRes = await pool.query(payModeSql, [storeId, start, end]);

    const by_day = dailyRes.rows.map((r) => ({
      date: r.day, // e.g. "2025-12-01"
      invoice_count: Number(r.invoice_count || 0),
      total: Number(r.total_sales || 0),
    }));

    const by_payment_mode = payModeRes.rows.map((r) => ({
      payment_mode: r.payment_mode,
      invoice_count: Number(r.invoice_count || 0),
      total: Number(r.total_sales || 0),
    }));

    const avgInvoiceValue = invoiceCount ? total / invoiceCount : 0;

    return res.json({
      store_id: storeId,
      year,
      month,
      from: start.toISOString(),
      to: end.toISOString(),
      used_precomputed: usedPrecomputed,
      totals: {
        invoice_count: invoiceCount,
        subtotal,
        tax,
        total,
        avg_invoice_value: avgInvoiceValue,
      },
      by_day,
      by_payment_mode,
    });
  } catch (err) {
    console.error('monthly report error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// GET /reports/top-products?store_id=1&days=30&limit=10
// Returns top-selling products by quantity in the past N days
app.get('/reports/top-products', requireStoreOrAdmin, async (req, res) => {
  try {
    const session = req.auth_session;
    const isAdmin =
      session.terminal_uuid &&
      typeof session.terminal_uuid === 'string' &&
      session.terminal_uuid.startsWith('admin:');

    let storeId;
    if (!isAdmin) {
      storeId = session.store_id;
    } else {
      storeId = parseInt(req.query.store_id, 10);
      if (!storeId) {
        return res.status(400).json({ error: 'store_id required for admin' });
      }
    }

    const days = parseInt(req.query.days || '30', 10);
    const limit = parseInt(req.query.limit || '10', 10);

    const q = `SELECT p.id AS product_id, p.sku, p.name,
                      SUM(ii.qty)::numeric(12,3)    AS qty_sold,
                      SUM(ii.amount)::numeric(12,2) AS sales_amount
               FROM invoice_items ii
               JOIN invoices i ON i.id = ii.invoice_id
               JOIN products p ON p.id = ii.product_id
               WHERE i.store_id = $1
                 AND i.status <> 'voided'
                 AND i.created_at >= now() - ($2::int || ' days')::interval
                 AND p.deleted_at IS NULL
               GROUP BY p.id, p.sku, p.name
               ORDER BY qty_sold DESC
               LIMIT $3`;
    const rows = (await pool.query(q, [storeId, days, limit])).rows;
    return res.json({ store_id: storeId, days, limit, top_products: rows });
  } catch (err) {
    console.error('top-products report error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// GET /reports/stock-alerts?store_id=1&threshold=10
// Returns products with stock less than or equal to threshold
app.get('/reports/stock-alerts', requireStoreOrAdmin, async (req, res) => {
  try {
    const session = req.auth_session;
    const isAdmin =
      session.terminal_uuid &&
      typeof session.terminal_uuid === 'string' &&
      session.terminal_uuid.startsWith('admin:');

    let storeId;
    if (!isAdmin) {
      storeId = session.store_id;
    } else {
      storeId = parseInt(req.query.store_id, 10);
      if (!storeId) {
        return res.status(400).json({ error: 'store_id required for admin' });
      }
    }

    const threshold = parseInt(req.query.threshold || '10', 10);

    const q = `SELECT id, sku, name, price, stock, unit, allow_decimal_qty, updated_at
               FROM products
               WHERE store_id = $1 AND deleted_at IS NULL AND stock <= $2
               ORDER BY stock ASC`;
    const rows = (await pool.query(q, [storeId, threshold])).rows;
    return res.json({ store_id: storeId, threshold, low_stock: rows });
  } catch (err) {
    console.error('stock-alerts report error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// Create HTTP server & attach Express app
const server = http.createServer(app);

// Create WebSocket server on same port, under /ws
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('WS client connected');

  ws.on('close', () => {
    console.log('WS client disconnected');
  });
});

// Helper: broadcast new invoice event to all connected WS clients
function broadcastNewInvoice(invoice) {
  if (!invoice) return;
  const payload = JSON.stringify({
    type: 'invoice_created',
    invoice,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Simple root route so Railway / browser health checks don't 500
app.get('/', (req, res) => {
  res.send('GreenHouse POS backend is running ✅');
});

// Fallback catch‑all for any unknown GET route so hitting the bare
// Railway domain (/, /index, etc.) never returns a 404 from Express.
// All real API routes are defined above, so this only catches
// unmatched paths.
app.use((req, res, next) => {
  if (req.method === 'GET') {
    return res
      .status(200)
      .send('GreenHouse POS backend is running ✅ (fallback route)');
  }
  return res.status(404).json({ error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`API + WS listening on http://localhost:${PORT}`);
});