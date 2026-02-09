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
  const configDir = app.getPath("userData");
  const scaleConfigPath = path.join(configDir, "scale-config.json");

  const DEFAULT_SCALE_CONFIG = {
    terminal_uuid: "s1-c1",
    scale_port: "COM1",
    baud_rate: 9600,
  };

  try {
    // Ensure config directory exists
    fs.mkdirSync(configDir, { recursive: true });

    console.log("📁 CONFIG DIR:", configDir);
    console.log("📄 CONFIG PATH:", scaleConfigPath);

    // Ensure scale-config.json exists
    if (!fs.existsSync(scaleConfigPath)) {
      fs.writeFileSync(
        scaleConfigPath,
        JSON.stringify(DEFAULT_SCALE_CONFIG, null, 2),
        "utf8"
      );
      console.log("🆕 Created scale-config.json at:", scaleConfigPath);
    }

    const configFileContents = fs.readFileSync(scaleConfigPath, "utf8");
    console.log("📖 RAW CONFIG FILE CONTENTS:");
    console.log(configFileContents);

    const scaleConfig = JSON.parse(configFileContents);
    console.log("📦 PARSED CONFIG:", JSON.stringify(scaleConfig, null, 2));

    const TERMINAL_UUID = String(scaleConfig.terminal_uuid || "")
      .trim()
      .toLowerCase();

    console.log("🔍 TERMINAL_UUID FROM CONFIG:", scaleConfig.terminal_uuid);
    console.log("🔍 AFTER PROCESSING:", TERMINAL_UUID);

    if (!TERMINAL_UUID || !TERMINAL_UUID.includes("-")) {
      throw new Error("Invalid terminal_uuid in scale-config.json");
    }

    const SCALE_PORT = scaleConfig.scale_port || "COM1";
    const BAUD_RATE = Number(scaleConfig.baud_rate) || 9600;

    console.log("✅ FINAL SCALE TERMINAL UUID:", TERMINAL_UUID);
    console.log("✅ FINAL SCALE PORT:", SCALE_PORT);

    createWindow();

    openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID);
    setupPrinting(loadPrinterConfig(configDir));
  } catch (err) {
    console.error("❌ INIT FAILED:", err);
    app.quit();
  }
}

/* ==================================================
   PRINTER CONFIG
================================================== */
function loadPrinterConfig(configDir) {
  const printerPath = path.join(configDir, "printer-config.json");

  try {
    if (fs.existsSync(printerPath)) {
      return JSON.parse(fs.readFileSync(printerPath, "utf8"));
    }
  } catch (err) {
    console.error("❌ Failed to load printer-config.json", err);
  }

  return { printer_name: "" };
}

/* ==================================================
   SCALE
================================================== */
function openScale(port, baudRate, terminalUuid) {
  console.log(`🔌 OPENING SCALE: ${port} @ ${baudRate}`);

  scalePort = new SerialPort({
    path: `\\\\.\\${port}`,
    baudRate,
    autoOpen: false,
  });

  scalePort.open((err) => {
    if (err) {
      console.error("❌ SCALE OPEN FAILED:", err.message);
      return setTimeout(() => openScale(port, baudRate, terminalUuid), 3000);
    }
    console.log("✅ SCALE CONNECTED");
  });

  scalePort.on("data", (chunk) => handleRawData(chunk, terminalUuid));
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
function handleRawData(chunk, terminalUuid) {
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
      terminal_uuid: terminalUuid,
      weight_kg: weightKg,
    }).catch(() => { });
  }
}

/* ==================================================
   PRINTING (UNCHANGED LOGIC)
================================================== */
function setupPrinting(printerConfig) {
  ipcMain.handle("print-receipt-html", async (_e, receiptHtml) => {
    if (!receiptHtml) return;

    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: false, offscreen: false },
    });

    await win.loadURL(
      "data:text/html;charset=utf-8," +
      encodeURIComponent(receiptHtml)
    );

    win.webContents.print(
      {
        silent: true,
        deviceName: printerConfig.printer_name || undefined,
        printBackground: true,
      },
      () => win.close()
    );
  });
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