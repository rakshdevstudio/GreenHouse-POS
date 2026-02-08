const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { SerialPort } = require("serialport");
const axios = require("axios");

process.on("uncaughtException", err => {
  try {
    fs.writeFileSync(
      path.join(process.cwd(), "fatal.log"),
      err.stack || err.toString()
    );
  } catch { }
  app.quit();
});

process.on("unhandledRejection", err => {
  try {
    fs.writeFileSync(
      path.join(process.cwd(), "fatal.log"),
      err?.stack || err?.toString()
    );
  } catch { }
});
// ==================================================
// GLOBALS
// ==================================================
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
// CONFIG LOADER (FROM EXE DIRECTORY)
// ==================================================
function loadConfig(filename, defaults) {
  const configDir = app.getPath("userData"); // ✅ SAFE
  const filePath = path.join(configDir, filename);

  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaults, null, 2), "utf8");
      console.log(`🆕 Created ${filename} at`, filePath);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`❌ Failed to load ${filename}`, err);
    return defaults;
  }
}

// ==================================================
// INIT APP
// ==================================================
function initApp() {
  // ================= SCALE CONFIG =================
  const scaleConfig = loadConfig("scale-config.json", {
    terminal_uuid: "s1-c1",
    scale_port: "COM1",
    baud_rate: 9600,
  });

  const TERMINAL_UUID = scaleConfig.terminal_uuid.trim().toLowerCase();
  const SCALE_PORT = scaleConfig.scale_port;
  const BAUD_RATE = scaleConfig.baud_rate;

  if (!TERMINAL_UUID) {
    console.error("❌ terminal_uuid missing in scale-config.json");
    app.quit();
    return;
  }

  // ================= PRINTER CONFIG =================
  const printerConfig = loadConfig("printer-config.json", {
    printer_name: "", // must match Windows printer name
    silent: true,
    store: {
      name: "Greenhouse Supermarket",
      address_lines: [],
    },
  });

  console.log("🏷 TERMINAL:", TERMINAL_UUID);
  console.log("⚖ SCALE:", SCALE_PORT);
  console.log("🖨 PRINTER:", printerConfig.printer_name || "(system default)");

  createWindow();
  openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID);
  setupPrinting(printerConfig);
}

// ==================================================
// SCALE (UNCHANGED & STABLE)
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

  scalePort.on("data", chunk => handleRawData(chunk, TERMINAL_UUID));
  scalePort.on("error", restartScale);
  scalePort.on("close", restartScale);
}

function restartScale() {
  try {
    if (scalePort?.isOpen) scalePort.close();
  } catch { }
}

// ==================================================
// SCALE PARSER (UNCHANGED)
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

    const now = Date.now();
    if (now - lastSent < SEND_INTERVAL) return;
    lastSent = now;

    axios
      .post(`${SERVER_URL}/scale/weight`, {
        type: "scale",
        terminal_uuid: TERMINAL_UUID,
        weight_kg: weightKg,
      })
      .catch(() => { });
  }
}

// ==================================================
// 🖨 PRINTING (SILENT, PRINTER-AGNOSTIC)
// ==================================================
function setupPrinting(printerConfig) {
  ipcMain.handle("print-receipt-html", async (_event, receiptHtml) => {
    if (!receiptHtml) return;

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: false,
      },
    });

    const wrappedHtml = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body {
                font-family: monospace;
                margin: 0;
                padding: 0;
              }
            </style>
          </head>
          <body>
            ${receiptHtml}
          </body>
        </html>
      `;

    await printWindow.loadURL(
      "data:text/html;charset=utf-8," +
      encodeURIComponent(wrappedHtml)
    );

    printWindow.webContents.on("did-finish-load", () => {
      printWindow.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerConfig.printer_name || undefined,
        },
        () => {
          printWindow.close();
        }
      );
    });
  });
}

// ==================================================
// APP LIFECYCLE
// ==================================================
app.whenReady().then(initApp);

app.on("window-all-closed", () => {
  try {
    scalePort?.close();
  } catch { }
  app.quit();
});