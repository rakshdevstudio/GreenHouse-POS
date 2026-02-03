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
// INIT APP (CONFIGS + SCALE)
// ==================================================
function initApp() {
  const exeDir = path.dirname(app.getPath("exe"));

  // ================= SCALE CONFIG =================
  const scaleConfigPath = path.join(exeDir, "scale-config.json");

  const DEFAULT_SCALE_CONFIG = {
    terminal_uuid: "s1-c1",
    scale_port: "COM1",
    baud_rate: 9600
  };

  let scaleConfig = DEFAULT_SCALE_CONFIG;

  try {
    if (!fs.existsSync(scaleConfigPath)) {
      fs.writeFileSync(
        scaleConfigPath,
        JSON.stringify(DEFAULT_SCALE_CONFIG, null, 2),
        "utf8"
      );
      console.log("🆕 Created scale-config.json:", scaleConfigPath);
    }

    scaleConfig = JSON.parse(fs.readFileSync(scaleConfigPath, "utf8"));
    console.log("📄 Loaded scale-config.json");

  } catch (err) {
    console.error("❌ Scale config error:", err.message);
  }

  const TERMINAL_UUID = scaleConfig.terminal_uuid?.trim().toLowerCase();
  const SCALE_PORT = scaleConfig.scale_port || "COM1";
  const BAUD_RATE = scaleConfig.baud_rate || 9600;

  if (!TERMINAL_UUID) {
    console.error("❌ terminal_uuid missing in scale-config.json");
    app.quit();
    return;
  }

  // ================= PRINTER CONFIG =================
  const printerConfigPath = path.join(exeDir, "printer-config.json");

  const DEFAULT_PRINTER_CONFIG = {
    printer_name: "EPSON TM-T82",
    paper_width: 80,
    cut: true,
    store: {
      name: "Greenhouse Supermarket",
      address_lines: []
    }
  };

  let printerConfig = DEFAULT_PRINTER_CONFIG;

  try {
    if (!fs.existsSync(printerConfigPath)) {
      fs.writeFileSync(
        printerConfigPath,
        JSON.stringify(DEFAULT_PRINTER_CONFIG, null, 2),
        "utf8"
      );
      console.log("🆕 Created printer-config.json:", printerConfigPath);
    }

    printerConfig = JSON.parse(fs.readFileSync(printerConfigPath, "utf8"));
    console.log("🖨 Loaded printer-config.json");

  } catch (err) {
    console.error("❌ Printer config error:", err.message);
  }

  // 🔎 Logs for sanity check
  console.log("🏷 TERMINAL:", TERMINAL_UUID);
  console.log("🖨 PRINTER:", printerConfig.printer_name);

  createWindow();
  openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID);
}

// ==================================================
// SCALE (UNCHANGED)
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
      return setTimeout(
        () => openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID),
        3000
      );
    }

    console.log("✅ SCALE CONNECTED");
    scalePort.set({ dtr: true, rts: true });
  });

  scalePort.on("data", chunk =>
    handleRawData(chunk, TERMINAL_UUID)
  );

  scalePort.on("error", restartScale);
  scalePort.on("close", restartScale);
}

function restartScale() {
  try {
    if (scalePort?.isOpen) scalePort.close();
  } catch { }
}

// ==================================================
// PARSER (UNCHANGED)
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
// APP LIFECYCLE
// ==================================================
app.whenReady().then(initApp);

app.on("window-all-closed", () => {
  try { scalePort?.close(); } catch { }
  app.quit();
});