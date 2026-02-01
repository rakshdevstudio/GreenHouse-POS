const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { SerialPort } = require("serialport");
const axios = require("axios");

// ================= CONFIG =================
const SCALE_PORT = "COM1";
const BAUD_RATE = 9600;

const SERVER_URL = "https://greenhouse-pos-production.up.railway.app";
const TERMINAL_UUID =
  (process.env.TERMINAL_UUID || "s1-c4").trim().toLowerCase();

// =========================================
let mainWindow;
let scalePort;
let buffer = "";
let lastSent = 0;
const SEND_INTERVAL = 200;

// ================= WINDOW =================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  mainWindow.loadURL("https://green-house-pos.vercel.app/");
  mainWindow.on("closed", () => (mainWindow = null));
}

// ================= SCALE =================
function openScale() {
  console.log("🔌 OPENING SCALE:", SCALE_PORT, BAUD_RATE);

  scalePort = new SerialPort({
    path: `\\\\.\\${SCALE_PORT}`,
    baudRate: BAUD_RATE,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    autoOpen: false,
  });

  scalePort.open(err => {
    if (err) {
      console.error("❌ SCALE OPEN FAILED:", err.message);
      setTimeout(openScale, 3000);
      return;
    }

    console.log("✅ SCALE CONNECTED");

    // CRITICAL — exactly like .NET
    scalePort.set({ dtr: true, rts: true });
  });

  scalePort.on("data", handleRawData);

  scalePort.on("error", err => {
    console.error("❌ SCALE ERROR:", err.message);
    restartScale();
  });

  scalePort.on("close", () => {
    console.warn("⚠️ SCALE CLOSED");
    restartScale();
  });
}

function restartScale() {
  try {
    scalePort && scalePort.close();
  } catch { }
  setTimeout(openScale, 3000);
}

// ================= PARSER =================
function handleRawData(chunk) {
  buffer += chunk.toString("utf8");

  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop();

  for (const line of lines) {
    const clean = line.trim();
    if (!clean) continue;

    const match = clean.match(/-?(\d+(\.\d+)?)/);
    if (!match) continue;

    const weight = parseFloat(match[0]);
    if (Number.isNaN(weight)) continue;

    // 🔴 THIS IS AUTO-FILL SOURCE
    if (mainWindow) {
      mainWindow.webContents.send("scale-data", {
        weightKg: Number(weight.toFixed(3)),
      });
    }

    sendToBackend(weight);
  }
}

// ================= BACKEND =================
async function sendToBackend(weight) {
  const now = Date.now();
  if (now - lastSent < SEND_INTERVAL) return;
  lastSent = now;

  try {
    await axios.post(`${SERVER_URL}/scale/weight`, {
      type: "scale",
      terminal_uuid: TERMINAL_UUID,
      weight_kg: weight,
    });
  } catch {
    // Silent fail — scale must NEVER stop
  }
}

// ================= APP =================
app.whenReady().then(() => {
  console.log("🏷 TERMINAL:", TERMINAL_UUID);
  createWindow();
  openScale();
});

app.on("window-all-closed", () => {
  try {
    scalePort && scalePort.close();
  } catch { }
  app.quit();
});

process.on("uncaughtException", err => {
  console.error("🔥 FATAL:", err.message);
});