const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { SerialPort } = require("serialport");
const axios = require("axios");

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");

/* ==================================================
   HARD CRASH LOGGING
================================================== */
process.on("uncaughtException", (err) => {
  try {
    fs.writeFileSync(
      path.join(app.getPath("desktop"), "greenhouse-electron-crash.txt"),
      err.stack || String(err)
    );
  } catch { }
  process.exit(1);
});

/* ==================================================
   GLOBALS
================================================== */
let mainWindow;
let scalePort;
let buffer = "";
let lastSent = 0;
const SEND_INTERVAL = 200;

const SERVER_URL = "https://greenhouse-pos-production.up.railway.app";

/* ==================================================
   WINDOW
================================================== */
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
}

/* ==================================================
   INIT APP (SINGLE SOURCE OF TRUTH)
================================================== */
function initApp() {
  const configPath = path.join(__dirname, "scale-config.json");

  if (!fs.existsSync(configPath)) {
    console.error("❌ scale-config.json NOT FOUND at:", configPath);
    app.quit();
    return;
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    console.error("❌ Invalid scale-config.json:", err.message);
    app.quit();
    return;
  }

  const TERMINAL_UUID = String(config.terminal_uuid || "").trim().toLowerCase();
  const SCALE_PORT = config.scale_port || "COM1";
  const BAUD_RATE = Number(config.baud_rate) || 9600;

  if (!TERMINAL_UUID) {
    console.error("❌ terminal_uuid missing in scale-config.json");
    app.quit();
    return;
  }

  console.log("🆔 SCALE TERMINAL UUID:", TERMINAL_UUID);
  console.log("⚖ SCALE PORT:", SCALE_PORT);

  createWindow();
  openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID);
  setupPrinting();
}

/* ==================================================
   SCALE
================================================== */
function openScale(port, baudRate, terminalUUID) {
  scalePort = new SerialPort({
    path: `\\\\.\\${port}`,
    baudRate,
    autoOpen: false,
  });

  scalePort.open((err) => {
    if (err) {
      console.error("❌ SCALE OPEN FAILED:", err.message);
      return setTimeout(() => openScale(port, baudRate, terminalUUID), 3000);
    }
    console.log("✅ SCALE CONNECTED");
  });

  scalePort.on("data", (chunk) => handleRawData(chunk, terminalUUID));
  scalePort.on("error", restartScale);
  scalePort.on("close", restartScale);
}

function restartScale() {
  try {
    if (scalePort?.isOpen) scalePort.close();
  } catch { }
}

/* ==================================================
   SCALE PARSER
================================================== */
function handleRawData(chunk, terminalUUID) {
  buffer += chunk.toString("utf8");
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop();

  for (const line of lines) {
    const match = line.match(/-?(\d+(\.\d+)?)/);
    if (!match) continue;

    const weightKg = Number(parseFloat(match[0]).toFixed(3));
    if (Number.isNaN(weightKg)) continue;

    mainWindow?.webContents.send("scale-data", { weightKg });

    const now = Date.now();
    if (now - lastSent < SEND_INTERVAL) return;
    lastSent = now;

    axios.post(`${SERVER_URL}/scale/weight`, {
      type: "scale",
      terminal_uuid: terminalUUID,
      weight_kg: weightKg,
    }).catch(() => { });
  }
}

/* ==================================================
   PRINTING (UNCHANGED)
================================================== */
function setupPrinting() {
  ipcMain.handle("print-receipt-html", async () => ({ success: true }));
}

/* ==================================================
   APP LIFECYCLE
================================================== */
app.whenReady().then(initApp);

app.on("window-all-closed", () => {
  try {
    scalePort?.close();
  } catch { }
  app.quit();
});