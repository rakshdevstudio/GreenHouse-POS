// migrate.js - run once to create DB schema
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }  // Required for Railway
});

const sql = `
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS terminals (
  id SERIAL PRIMARY KEY,
  store_id INTEGER REFERENCES stores(id),
  terminal_uuid VARCHAR(100) UNIQUE NOT NULL,
  label VARCHAR(100),
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(100) UNIQUE,
  name VARCHAR(300) NOT NULL,
  unit VARCHAR(50),
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INTEGER DEFAULT 0,
  store_id INTEGER REFERENCES stores(id),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  invoice_no VARCHAR(100) UNIQUE NOT NULL,
  store_id INTEGER REFERENCES stores(id),
  terminal_id INTEGER REFERENCES terminals(id),
  total NUMERIC(12,2) NOT NULL,
  tax NUMERIC(12,2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'synced',
  idempotency_key VARCHAR(128),
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  qty INTEGER NOT NULL,
  rate NUMERIC(10,2) NOT NULL,
  amount NUMERIC(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS product_price_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  old_price NUMERIC(10,2),
  new_price NUMERIC(10,2),
  changed_by VARCHAR(100),
  changed_at TIMESTAMP DEFAULT now()
);
`;

(async () => {
  const client = await pool.connect();
  try {
    console.log('Running migrations...');
    await client.query(sql);
    console.log('Migrations complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration error', err);
    process.exit(1);
  } finally {
    client.release();
  }
})();
