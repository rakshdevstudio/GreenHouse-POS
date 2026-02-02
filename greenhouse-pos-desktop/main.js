const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { SerialPort } = require("serialport");
const axios = require("axios");

// ==================================================
// CONFIG FILE (AUTO-CREATED ON FIRST RUN)
// ==================================================
const configPath = path.join(app.getPath("userData"), "scale-config.json");

const DEFAULT_CONFIG = {
  terminal_uuid: "s1-c1",
  scale_port: "COM1",
  baud_rate: 9600
};

let config = DEFAULT_CONFIG;

try {
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify(DEFAULT_CONFIG, null, 2),
      "utf8"
    );
    console.log("🆕 Created default scale-config.json at:", configPath);
  }

  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  console.log("📄 Loaded scale config from:", configPath);

} catch (err) {
  console.error("❌ Config load failed, using defaults:", err.message);
}

// ==================================================
const TERMINAL_UUID = config.terminal_uuid?.trim().toLowerCase();
const SCALE_PORT = config.scale_port || "COM1";
const BAUD_RATE = config.baud_rate || 9600;

const SERVER_URL = "https://greenhouse-pos-production.up.railway.app";

// ==================================================
let mainWindow = null;
let scalePort = null;
let buffer = "";
let lastSent = 0;
const SEND_INTERVAL = 200;

// ==================================================
// WINDOW
// ==================================================
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

// ==================================================
// SCALE
// ==================================================
function openScale() {
  console.log(`🔌 OPENING SCALE: ${SCALE_PORT} @ ${BAUD_RATE}`);

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
      return setTimeout(openScale, 3000);
    }

    console.log("✅ SCALE CONNECTED");
    scalePort.set({ dtr: true, rts: true }); // .NET compatible
  });

  scalePort.on("data", handleRawData);
  scalePort.on("error", restartScale);
  scalePort.on("close", restartScale);
}

function restartScale() {
  try {
    if (scalePort && scalePort.isOpen) scalePort.close();
  } catch { }
  scalePort = null;
  setTimeout(openScale, 3000);
}

// ==================================================
// PARSER
// ==================================================
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

    const weightKg = Number(weight.toFixed(3));

    if (mainWindow) {
      mainWindow.webContents.send("scale-data", { weightKg });
    }

    sendToBackend(weightKg);
  }
}

// ==================================================
// BACKEND
// ==================================================
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
    // silent fail — scale must never stop
  }
}

// ==================================================
// APP LIFECYCLE
// ==================================================
app.whenReady().then(() => {
  console.log("🏷 TERMINAL UUID:", TERMINAL_UUID);
  createWindow();
  openScale();
});

app.on("window-all-closed", () => {
  try {
    if (scalePort && scalePort.isOpen) scalePort.close();
  } catch { }
  app.quit();
});

process.on("uncaughtException", err => {
  console.error("🔥 FATAL:", err.message);
});