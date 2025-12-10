// check-db-size.js
// One-off script to check Neon / Postgres DB size and send a WhatsApp alert via Twilio
// Usage: `node check-db-size.js` (from the backend folder)

require('dotenv').config();
const { Client } = require('pg');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

// -------- Config --------

// Threshold ~0.45 GB so you get an alert *before* you hit Neon’s 0.5 GB free limit
const THRESHOLD_BYTES = 0.45 * 1024 * 1024 * 1024; // ~0.45 GB threshold (alert before 0.5 GB Neon free limit)
// simple cooldown in hours (so you don't get spammed)
const COOLDOWN_HOURS = 6;
const COOLDOWN_FILE = path.join(__dirname, '.last_db_alert');

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL missing in .env – cannot check DB size.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const res = await client.query(
      'SELECT current_database() AS db, pg_database_size(current_database()) AS bytes'
    );

    if (!res.rows.length) {
      console.error('❌ Could not read database size (no rows returned).');
      return;
    }

    const row = res.rows[0];
    const sizeBytes = Number(row.bytes);

    if (!Number.isFinite(sizeBytes)) {
      console.error('❌ Invalid size returned from pg_database_size');
      return;
    }

    const sizeMB = formatMB(sizeBytes);

    console.log(
      `Current DB (${row.db}) size: ${sizeMB} MB (threshold: ${formatMB(
        THRESHOLD_BYTES
      )} MB)`
    );

    if (sizeBytes >= THRESHOLD_BYTES) {
      console.log('⚠️ Threshold crossed, checking cooldown…');
      const canSend = await checkCooldown();
      if (canSend) {
        const ok = await sendWhatsAppAlert(sizeBytes);
        if (ok) {
          await updateCooldown();
        } else {
          console.log('❗ Skipping cooldown update because WhatsApp send failed.');
        }
      } else {
        console.log('ℹ️ Recently alerted, skipping WhatsApp alert.');
      }
    } else {
      console.log('✅ Below threshold, no alert sent.');
    }
  } catch (err) {
    console.error('check-db-size error:', err);
  } finally {
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
  }
}

// --- Cooldown helpers ---

async function checkCooldown() {
  try {
    const stat = fs.statSync(COOLDOWN_FILE);
    const last = stat.mtimeMs;
    const now = Date.now();
    const diffHours = (now - last) / (1000 * 60 * 60);
    console.log(`Last alert ${diffHours.toFixed(2)} hours ago`);
    return diffHours >= COOLDOWN_HOURS;
  } catch (e) {
    // file doesn't exist or unreadable => treat as first time
    return true;
  }
}

async function updateCooldown() {
  try {
    fs.writeFileSync(COOLDOWN_FILE, String(Date.now()));
  } catch (e) {
    console.error('Failed to update cooldown file', e);
  }
}

// --- WhatsApp alert using Twilio ---
async function sendWhatsAppAlert(sizeBytes) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromWhatsApp = process.env.TWILIO_WHATSAPP_FROM;
  const toWhatsApp = process.env.ALERT_WHATSAPP_TO;

  console.log('Twilio config present?:', {
    hasAccountSid: !!accountSid,
    hasAuthToken: !!authToken,
    fromWhatsApp,
    toWhatsApp,
  });

  if (!accountSid || !authToken || !fromWhatsApp || !toWhatsApp) {
    console.error('❌ Twilio env vars missing, cannot send WhatsApp alert');
    return false;
  }

  const client = twilio(accountSid, authToken);

  const body = [
    '⚠️ Green House POS – Neon DB size alert',
    `Current size: ${formatMB(sizeBytes)} MB`,
    'Free tier limit: 512 MB (0.5 GB)',
    '',
    'Recommended actions:',
    '- Run invoice purge if needed',
    '- Consider upgrading Neon plan if usage will grow more',
  ].join('\n');

  try {
    const msg = await client.messages.create({
      from: fromWhatsApp,
      to: toWhatsApp,
      body,
    });
    console.log('✅ WhatsApp alert sent, SID:', msg.sid);
    return true;
  } catch (err) {
    console.error('❌ Failed to send WhatsApp message:', err);
    return false;
  }
}

// Allow requiring this file in tests without auto-running
if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error in check-db-size:', err);
    process.exit(1);
  });
}

module.exports = { main };