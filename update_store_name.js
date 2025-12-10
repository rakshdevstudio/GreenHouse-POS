require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query("UPDATE stores SET name = 'Green House' WHERE id = 1");
    console.log("Store name updated!");
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    process.exit(0);
  }
})();
