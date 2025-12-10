// seed.js - create 3 stores, a terminal for each, and a few products
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    console.log("Seeding started...");
    await client.query('BEGIN');

    // Create 3 stores
    const stores = ['Store A', 'Store B', 'Store C'];
    const storeIds = [];
    for (const s of stores) {
      const r = await client.query(
        'INSERT INTO stores (name) VALUES ($1) RETURNING id',
        [s]
      );
      storeIds.push(r.rows[0].id);
    }

    // Create 1 terminal for each store
    for (let i = 0; i < storeIds.length; i++) {
      const sid = storeIds[i];
      await client.query(
        'INSERT INTO terminals (store_id, terminal_uuid, label) VALUES ($1, $2, $3)',
        [sid, `term-${sid}`, `Terminal-${i + 1}`]
      );
    }

    // Add sample products to Store A only
    const sampleProducts = [
      ['TOM-1KG', 'Tomato (1kg)', 'kg', 30.00, 100],
      ['POT-1KG', 'Potato (1kg)', 'kg', 25.00, 120],
      ['ONI-1KG', 'Onion (1kg)', 'kg', 40.00, 80]
    ];

    for (const p of sampleProducts) {
      await client.query(
        `INSERT INTO products (sku, name, unit, price, stock, store_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [p[0], p[1], p[2], p[3], p[4], storeIds[0]]
      );
    }

    await client.query('COMMIT');
    console.log("Seeding complete.");
    process.exit(0);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Seed error:", err);
    process.exit(1);
  } finally {
    client.release();
  }
})();
