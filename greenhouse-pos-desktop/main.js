const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let scalePort = null;
let parser = null;
let isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL("https://green-house-pos.vercel.app/");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// Auto-updater events
autoUpdater.on("checking-for-update", () => {
  console.log("🔄 Checking for update...");
});

autoUpdater.on("update-available", () => {
  console.log("⬇️ Update available, downloading...");
});

autoUpdater.on("update-not-available", () => {
  console.log("✅ App is up to date");
});

autoUpdater.on("error", (err) => {
  console.error("❌ Auto-update error:", err);
});

autoUpdater.on("update-downloaded", () => {
  console.log("🚀 Update downloaded, restarting...");
  autoUpdater.quitAndInstall();
});

// Print handler
ipcMain.handle("print-receipt", async () => {
  if (!mainWindow) return { ok: false };

  try {
    await mainWindow.webContents.print({
      silent: true,
      printBackground: true,
      deviceName: "",
      pageSize: {
        width: 80000,   // 80mm for 77.5mm printers
        height: 0       // Auto height
      },
      margins: {
        marginType: "none"
      }
    });

    console.log("🖨️ Thermal receipt printed successfully");
    return { ok: true };
  } catch (err) {
    console.error("❌ Thermal print failed:", err);
    return { ok: false, error: err.message };
  }
});

// Essae scale weight parser
// Handles multiple common formats from Essae scales
function parseEssaeWeight(raw) {
  if (!raw || typeof raw !== 'string') return null;

  const clean = raw.trim();
  
  // Common Essae formats:
  // Format 1: "ST,GS,+00.850kg"
  // Format 2: "US,GS,+00.850kg"
  // Format 3: "00.850kg"
  // Format 4: "+00.850"
  // Format 5: "0.850"
  
  // Try to extract weight with optional unit
  const patterns = [
    /([+-]?\d+\.?\d*)\s*kg/i,           // "0.850kg" or "+0.850kg"
    /([+-]?\d+\.?\d*)\s*g/i,            // "850g" (grams)
    /,([+-]?\d+\.?\d*)(?:kg|g)?/i,      // ",+00.850kg" (comma-separated)
    /([+-]?\d*\.?\d+)/,                  // Any number with optional sign
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match) {
      let value = parseFloat(match[1]);
      
      // If the match includes 'g' (grams), convert to kg
      if (match[0].toLowerCase().includes('g') && !match[0].toLowerCase().includes('kg')) {
        value = value / 1000;
      }
      
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
  }

  return null;
}

// Initialize scale connection
async function initScale() {
  try {
    console.log("🔌 Connecting to scale on COM1...");
    console.log("⚙️ Settings: 9600 baud, 8 data bits, 1 stop bit, no parity");

    scalePort = new SerialPort({
      path: "COM1",
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: false,
    });

    // Try both \r\n and \r delimiters (Essae scales may use either)
    parser = scalePort.pipe(new ReadlineParser({ 
      delimiter: /\r?\n/,
      encoding: 'ascii'
    }));

    scalePort.open((err) => {
      if (err) {
        console.error("❌ Failed to open scale port:", err.message);
        setTimeout(initScale, 3000);
        return;
      }
      console.log("✅ Scale connected on COM1");
    });

    // Listen to parsed lines
    parser.on("data", (line) => {
      const clean = line.trim();
      if (!clean) return;

      // Log raw data for debugging
      console.log("📟 SCALE RAW:", clean);

      // Parse the weight
      const weight = parseEssaeWeight(clean);
      
      if (weight !== null) {
        const weightKg = weight.toFixed(3);
        console.log("⚖️ PARSED WEIGHT:", weightKg, "kg");
        
        // Send to renderer
        if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("scale-data", clean);
        }
      } else {
        console.log("⚠️ Could not parse weight from:", clean);
      }
    });

    scalePort.on("error", (err) => {
      console.error("❌ Scale error:", err.message);
    });

    scalePort.on("close", () => {
      console.warn("⚠️ Scale disconnected. Reconnecting in 3 seconds...");
      scalePort = null;
      parser = null;
      setTimeout(initScale, 3000);
    });

  } catch (err) {
    console.error("❌ Scale init exception:", err.message);
    setTimeout(initScale, 3000);
  }
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  initScale();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (scalePort && scalePort.isOpen) {
      try {
        scalePort.close();
      } catch (e) {
        console.warn("Error closing scale port:", e);
      }
    }
    app.quit();
  }
});

app.on("before-quit", () => {
  if (scalePort && scalePort.isOpen) {
    try {
      scalePort.close();
    } catch (e) {
      console.warn("Error closing scale port:", e);
    }
  }
});