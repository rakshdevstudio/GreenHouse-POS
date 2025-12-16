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
      silent: true,
      printBackground: true,
    });
    return { ok: true };
  } catch (err) {
    console.error("❌ Print failed:", err);
    return { ok: false, error: err.message };
  }
});

async function initScale() {
  try {
    const ports = await SerialPort.list();

    if (!ports.length) {
      console.error("❌ No COM ports found");
      return;
    }

    // Prefer USB / Serial scale ports automatically
    const preferred =
      ports.find(p =>
        (p.manufacturer || "").toLowerCase().includes("usb") ||
        (p.friendlyName || "").toLowerCase().includes("usb") ||
        (p.path || "").toLowerCase().includes("com")
      ) || ports[0];

    console.log("🔌 Using scale port:", preferred.path);

    scalePort = new SerialPort({
      path: preferred.path,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: true,
    });

    scalePort.on("data", (data) => {
      if (!mainWindow) return;
      const raw = data.toString();
      mainWindow.webContents.send("scale-data", raw);
    });

    scalePort.on("error", (err) => {
      console.error("❌ Scale error:", err.message);
    });

    console.log(`✅ Scale connected on ${preferred.path}`);
  } catch (err) {
    console.error("❌ Failed to init scale:", err.message);
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