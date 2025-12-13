/**
 * scale-bridge.js
 * ----------------
 * Reads weight from RS232 / USB weighing scale on Windows
 * Sends live weight to Greenhouse POS backend
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const axios = require('axios');

/* ================= CONFIG ================= */

// 👉 CHANGE THIS AFTER CHECKING DEVICE MANAGER
const COM_PORT = 'COM3';

// Common baud rates: 4800 / 9600
const BAUD_RATE = 9600;

// Local backend (client PC)
const BACKEND_URL = 'https://greenhouse-pos-production.up.railway.app/scale/weight';

// Production example (Railway)
// const BACKEND_URL = 'https://greenhouse-pos-production.up.railway.app/scale/mock';

/* ========================================== */

console.log('=================================');
console.log('🔌 Greenhouse Scale Bridge START');
console.log(`📡 Port : ${COM_PORT}`);
console.log(`⚡ Baud : ${BAUD_RATE}`);
console.log('=================================');

const port = new SerialPort({
  path: COM_PORT,
  baudRate: BAUD_RATE,
  autoOpen: false,
});

const parser = port.pipe(
  new ReadlineParser({
    delimiter: '\n',
  })
);

// 🔴 TEMPORARILY DISABLED
// This should be ENABLED on the CLIENT'S WINDOWS PC
// macOS does not have COM ports like COM3, so this will fail on Mac
// Uncomment this block when running on Windows with the scale connected

port.open((err) => {
  if (err) {
    console.error('❌ Failed to open scale port:', err.message);
    console.error('👉 Check COM port & cable');
    return;
  }
  console.log('✅ Scale connected successfully');
});

// Read weight data
parser.on('data', async (data) => {
  try {
    const raw = data.trim();

    // Example outputs:
    // "WT: 1.235 kg"
    // "1.235"
    // "GROSS 0001.235"

    const match = raw.match(/([\d.]+)/);
    if (!match) return;

    const weight = Number(match[1]);
    if (!Number.isFinite(weight) || weight <= 0) return;

    console.log(`⚖️ Weight received: ${weight} kg`);

    await axios.post(BACKEND_URL, {
      weight_kg: weight,
    });

  } catch (err) {
    console.warn('⚠️ Failed to send weight:', err.message);
  }
});

// Serial errors
port.on('error', (err) => {
  console.error('❌ Serial port error:', err.message);
});

// Graceful exit
process.on('SIGINT', () => {
  console.log('\n🛑 Scale bridge stopped');
  try {
    port.close();
  } catch (e) {}
  process.exit(0);
});