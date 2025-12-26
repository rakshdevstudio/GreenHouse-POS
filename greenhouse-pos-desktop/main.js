const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { SerialPort } = require("serialport");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let scalePort = null;
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

  // Load local renderer (later we can load Vercel URL)
  mainWindow.loadURL("https://green-house-pos.vercel.app/");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

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

ipcMain.handle("print-receipt", async () => {
  if (!mainWindow) return { ok: false };

  try {
    await mainWindow.webContents.print({
      silent: true,              // No print dialog
      printBackground: true,     // Respect CSS colors
      deviceName: "",            // Use system default printer
      pageSize: {
        width: 72000,            // 72mm in microns (safe width for 80mm roll)
        height: 200000           // Large height for continuous thermal roll
      },
      margins: {
        marginType: "none"       // CSS controls margins
      }
    });

    console.log("🖨️ Thermal receipt printed successfully");
    return { ok: true };

  } catch (err) {
    console.error("❌ Thermal print failed:", err);
    return { ok: false, error: err.message };
  }
});

async function initScale() {
  try {
    console.log("🔌 Using fixed motherboard serial port: COM1");
    const portPath = "COM1";

    scalePort = new SerialPort({
      path: portPath,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: false,
    });

    scalePort.open(err => {
      if (err) {
        console.error("❌ Failed to open scale port:", err.message);
        setTimeout(initScale, 3000);
        return;
      }
      console.log("✅ Scale connected");
    });

    let buffer = "";

    scalePort.on("data", data => {
      buffer += data.toString("ascii");

      if (!buffer.includes("\r") && !buffer.includes("\n")) return;

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();

      for (const line of lines) {
        const clean = line.trim();
        if (!clean) continue;

        console.log("📟 SCALE RAW:", clean);

        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send("scale-data", clean);
        }
      }
    });

    scalePort.on("error", err => {
      console.error("❌ Scale error:", err.message);
    });

    scalePort.on("close", () => {
      console.warn("⚠️ Scale disconnected. Reconnecting...");
      setTimeout(initScale, 3000);
    });

  } catch (err) {
    console.error("❌ Scale init exception:", err.message);
    setTimeout(initScale, 3000);
  }
}

app.whenReady().then(() => {
  createWindow();
  initScale();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  if (!isDev) autoUpdater.checkForUpdates();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (scalePort && scalePort.isOpen) {
      scalePort.close();
    }
    app.quit();
  }
});