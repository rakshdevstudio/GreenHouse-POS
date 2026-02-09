const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { SerialPort } = require("serialport");
const axios = require("axios");

let mainWindow;
let scalePort;
let buffer = "";
let lastSent = 0;
const SEND_INTERVAL = 200;

const SERVER_URL = "https://greenhouse-pos-production.up.railway.app";

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
}

// ==================================================
// CONFIG + SCALE INIT (AFTER APP READY)
// ==================================================
function initApp() {
  // 🔒 SAFE to call now
  const exeDir = path.dirname(app.getPath("exe"));
  const configPath = path.join(exeDir, "scale-config.json");

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
      console.log("🆕 Created scale-config.json at:", configPath);
    }

    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log("📄 Loaded scale config:", configPath);

  } catch (err) {
    console.error("❌ Config error:", err.message);
  }

  const TERMINAL_UUID = config.terminal_uuid?.trim().toLowerCase();
  const SCALE_PORT = config.scale_port || "COM1";
  const BAUD_RATE = config.baud_rate || 9600;

  if (!TERMINAL_UUID) {
    console.error("❌ terminal_uuid missing in scale-config.json");
    app.quit();
    return;
  }

  console.log("🏷 TERMINAL:", TERMINAL_UUID);
  createWindow();
  openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID);
}

// ==================================================
// SCALE
// ==================================================
function openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID) {
  console.log(`🔌 OPENING SCALE: ${SCALE_PORT} @ ${BAUD_RATE}`);

  scalePort = new SerialPort({
    path: `\\\\.\\${SCALE_PORT}`,
    baudRate: BAUD_RATE,
    autoOpen: false,
  });

  scalePort.open(err => {
    if (err) {
      console.error("❌ SCALE OPEN FAILED:", err.message);
      return setTimeout(() =>
        openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID), 3000);
    }

    console.log("✅ SCALE CONNECTED");
    scalePort.set({ dtr: true, rts: true });
  });

  scalePort.on("data", chunk =>
    handleRawData(chunk, TERMINAL_UUID));

  scalePort.on("error", restartScale);
  scalePort.on("close", restartScale);
}

function restartScale() {
  try { scalePort?.close(); } catch { }
}

// ==================================================
// PARSER
// ==================================================
function handleRawData(chunk, TERMINAL_UUID) {
  buffer += chunk.toString("utf8");
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop();

  for (const line of lines) {
    const match = line.match(/-?(\d+(\.\d+)?)/);
    if (!match) continue;

    const weightKg = Number(parseFloat(match[0]).toFixed(3));
    if (Number.isNaN(weightKg)) continue;

    mainWindow?.webContents.send("scale-data", { weightKg });

    axios.post(`${SERVER_URL}/scale/weight`, {
      type: "scale",
      terminal_uuid: TERMINAL_UUID,
      weight_kg: weightKg,
    }).catch(() => { });
  }
}

// ==================================================
// APP
// ==================================================
app.whenReady().then(initApp);

app.on("window-all-closed", () => {
  try { scalePort?.close(); } catch { }
  app.quit();
});