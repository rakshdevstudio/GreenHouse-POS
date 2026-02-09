const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { SerialPort } = require("serialport");
const axios = require("axios");

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
/* ==================================================
   HARD CRASH LOGGING (NO MORE SILENT FAILURES)
================================================== */
process.on("uncaughtException", (err) => {
  try {
    const logPath = path.join(
      app.getPath("desktop"),
      "greenhouse-electron-crash.txt"
    );
    fs.writeFileSync(logPath, err.stack || String(err));
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
   SAFE CONFIG LOADER (USERDATA ONLY)
================================================== */
function loadConfig(filename, defaults) {
  const configDir = app.getPath("userData"); // ✅ SAFE
  const filePath = path.join(configDir, filename);

  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(defaults, null, 2), "utf8");
      console.log(`🆕 Created ${filename} at ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`❌ Failed to load ${filename}`, err);
    return defaults;
  }
}

/* ==================================================
   INIT APP
================================================== */
function initApp() {
  /* ---------- SCALE CONFIG ---------- */
  /* ---------- SCALE CONFIG ---------- */
  const scaleConfig = loadConfig("scale-config.json", {
    terminal_uuid: "",
    scale_port: "COM1",
    baud_rate: 9600,
  });

  const rawTerminal = String(scaleConfig.terminal_uuid || "").trim().toLowerCase();

  if (!rawTerminal || !rawTerminal.includes("-")) {
    console.error("❌ terminal_uuid missing or invalid in scale-config.json");
    app.quit();
    return;
  }

  const TERMINAL_UUID = rawTerminal;
  const SCALE_PORT = scaleConfig.scale_port || "COM1";
  const BAUD_RATE = Number(scaleConfig.baud_rate) || 9600;

  console.log("🆔 SCALE TERMINAL UUID:", TERMINAL_UUID);

  /* ---------- PRINTER CONFIG ---------- */
  const printerConfig = loadConfig("printer-config.json", {
    printer_name: "", // empty = system default
    store: {
      name: "Greenhouse Supermarket",
      address_lines: [],
    },
  });

  console.log("🏷 TERMINAL:", TERMINAL_UUID);
  console.log("⚖ SCALE:", SCALE_PORT);
  console.log(
    "🖨 PRINTER:",
    printerConfig.printer_name || "(System Default)"
  );

  try {
    createWindow();
  } catch (err) {
    console.error("❌ Window creation failed", err);
    throw err;
  }

  openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID);
  setupPrinting(printerConfig);
}

/* ==================================================
   SCALE (UNCHANGED, STABLE)
================================================== */
function openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID) {
  console.log(`🔌 OPENING SCALE: ${SCALE_PORT} @ ${BAUD_RATE}`);

  scalePort = new SerialPort({
    path: `\\\\.\\${SCALE_PORT}`,
    baudRate: BAUD_RATE,
    autoOpen: false,
  });

  scalePort.open((err) => {
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

  scalePort.on("data", (chunk) =>
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

/* ==================================================
   SCALE PARSER
================================================== */
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

/* ==================================================
   🖨 PRINTING (SILENT, PRINTER-AGNOSTIC)
================================================== */
function setupPrinting(printerConfig) {
  ipcMain.handle("print-receipt-html", async (_event, receiptHtml) => {
    console.log("🖨 PRINT HANDLER CALLED");
    console.log(
      "🖨 PRINTING TO:",
      printerConfig.printer_name || "(System Default)"
    );

    if (!receiptHtml) {
      console.log("❌ No receipt HTML received");
      return { success: false, error: "No HTML provided" };
    }

    let printWindow = null;

    try {
      printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: false,
          // CRITICAL: Disable offscreen rendering which breaks thermal printers
          offscreen: false
        },
      });

      const wrappedHtml = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              /* CRITICAL: @page must match physical paper */
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                font-family: monospace;
                margin: 0;
                padding: 0;
                width: 80mm;
              }
            </style>
          </head>
          <body>${receiptHtml}</body>
        </html>
      `;

      // CRITICAL FIX #0: Register event handler BEFORE loadURL to prevent race condition
      const executePrint = () => {
        console.log("🖨 Print window loaded, waiting for render...");

        // CRITICAL FIX #1: Wait for Chromium to fully render before printing
        // Thermal printers reject blank/incomplete pages
        setTimeout(() => {
          try {
            printWindow.webContents.print(
              {
                silent: true,
                printBackground: true,

                // CRITICAL FIX #2: Explicit printer name (empty string = system default)
                deviceName: printerConfig.printer_name || undefined,

                // CRITICAL FIX #3: Thermal printers are monochrome ONLY
                color: false,

                // CRITICAL FIX #4: Force portrait (some drivers default to landscape)
                landscape: false,

                // CRITICAL FIX #5: Zero margins (thermal printers have fixed margins)
                margins: {
                  marginType: "none",
                },

                // CRITICAL FIX #6: Correct page size in microns
                // 80mm width is standard, but height must be reasonable
                pageSize: {
                  width: 80000,   // 80mm in microns
                  height: 297000  // ~297mm (A4 height) - safe upper bound
                },

                // CRITICAL FIX #7: Disable scaling (must be 100%)
                scaleFactor: 100
              },
              (success, errorType) => {
                try {
                  if (!success) {
                    console.error("❌ PRINT FAILED:", errorType);
                  } else {
                    console.log("✅ PRINT SENT TO WINDOWS SPOOLER");
                  }
                } catch (err) {
                  console.error("❌ Print callback error:", err);
                } finally {
                  // Safe window cleanup
                  try {
                    if (printWindow && !printWindow.isDestroyed()) {
                      printWindow.close();
                    }
                  } catch (err) {
                    console.error("❌ Window cleanup error:", err);
                  }
                }
              }
            );
          } catch (err) {
            console.error("❌ Print execution error:", err);
            // Safe window cleanup on error
            try {
              if (printWindow && !printWindow.isDestroyed()) {
                printWindow.close();
              }
            } catch (cleanupErr) {
              console.error("❌ Window cleanup error:", cleanupErr);
            }
          }
        }, 500); // 500ms render delay - CRITICAL for thermal printers
      };

      // CRITICAL: Use once() to prevent duplicate execution
      // Both events may fire, but we only want to print once
      let printed = false;
      const safeExecutePrint = () => {
        if (printed) return;
        printed = true;
        executePrint();
      };

      printWindow.webContents.once("did-finish-load", safeExecutePrint);
      printWindow.once("ready-to-show", safeExecutePrint);

      await printWindow.loadURL(
        "data:text/html;charset=utf-8," +
        encodeURIComponent(wrappedHtml)
      );

      return { success: true };
    } catch (err) {
      console.error("❌ CRITICAL PRINT ERROR:", err);
      // Emergency cleanup
      try {
        if (printWindow && !printWindow.isDestroyed()) {
          printWindow.close();
        }
      } catch (cleanupErr) {
        console.error("❌ Emergency cleanup error:", cleanupErr);
      }
      return { success: false, error: err.message };
    }
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