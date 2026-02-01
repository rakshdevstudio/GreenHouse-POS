const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const WebSocket = require("ws");

const BACKEND_WS_URL = "wss://greenhouse-pos-production.up.railway.app/ws";
const TERMINAL_UUID = process.env.TERMINAL_UUID || process.env.TERMINAL_ID || "store1-t1";
console.log("🏷 POS TERMINAL UUID:", TERMINAL_UUID);
let backendWs = null;

const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let scalePort = null;
let scaleParser = null;
let isDev = !app.isPackaged;

let scaleStatus = "disconnected"; // disconnected | connecting | connected
let scaleHeartbeatInterval = null;
let scanTimer = null;

function notifyScaleStatus(status, info) {
  scaleStatus = status;
  // console.log("📡 SCALE STATUS:", status, info || "");
  if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("scale-status", {
      status,
      info: info || null,
      ts: Date.now(),
    });
  }
}

// ======================= BACKEND WEBSOCKET =======================

function connectBackendWS() {
  if (backendWs && backendWs.readyState === WebSocket.OPEN) return;
  if (backendWs) {
    try { backendWs.close(); } catch (e) { }
    backendWs = null;
  }

  console.log("🌐 Connecting to backend WS:", BACKEND_WS_URL);

  backendWs = new WebSocket(
    `${BACKEND_WS_URL}?terminal_uuid=${encodeURIComponent(TERMINAL_UUID)}`
  );

  backendWs.on("open", () => {
    console.log("🟢 Backend WS connected");
    // Only set connecting if we aren't already connected to a local scale
    if (scaleStatus === "disconnected") {
      notifyScaleStatus("connecting");
    }
  });

  backendWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!msg || msg.type !== "scale") return;

      const myId = String(TERMINAL_UUID || "").trim().toLowerCase();
      const msgId = String(msg.terminal_uuid || "").trim().toLowerCase();
      if (!msgId || msgId !== myId) return;

      const raw = Number(msg.weight_kg);
      if (!Number.isFinite(raw)) return;

      const weightKg = Number(raw.toFixed(3));
      console.log("⚖️ Backend scale weight:", weightKg);

      // Backend data overrides local only if local is NOT connected
      // OR if we treat backend as a valid source. 
      // User requirement: "when to trust BACKEND WS". 
      // Strategy: If local scale is connected, local takes precedence. 
      // If local disconnected, use backend.

      if (scaleStatus !== "connected") {
        notifyScaleStatus("connected", { source: "backend" });
      }

      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("scale-data", {
          source: "backend",
          weightKg,
          ts: Date.now(),
        });
      }
    } catch (err) {
      console.warn("⚠️ Invalid WS message:", err.message);
    }
  });

  backendWs.on("close", () => {
    console.warn("⚠️ Backend WS disconnected, retrying in 3s");
    setTimeout(connectBackendWS, 3000);
  });

  backendWs.on("error", (err) => {
    console.error("❌ Backend WS error:", err.message);
    try { backendWs.close(); } catch (e) { }
  });
}

// ======================= WINDOW MANAGEMENT =======================

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

  mainWindow.webContents.once("did-finish-load", () => {
    mainWindow.webContents.send("terminal-info", {
      terminal_uuid: TERMINAL_UUID,
    });
    notifyScaleStatus(scaleStatus);
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  if (!isDev && process.env.ENABLE_UPDATES === "true") {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// ======================= AUTO UPDATER =======================

autoUpdater.on("checking-for-update", () => console.log("🔄 Checking for update..."));
autoUpdater.on("update-available", () => console.log("⬇️ Update available, downloading..."));
autoUpdater.on("update-not-available", () => console.log("✅ App is up to date"));
autoUpdater.on("error", (err) => console.error("❌ Auto-update error:", err));
autoUpdater.on("update-downloaded", () => {
  console.log("🚀 Update downloaded, restarting...");
  autoUpdater.quitAndInstall();
});

// ======================= PRINT HANDLERS =======================

ipcMain.handle("print-receipt", async () => {
  if (!mainWindow) return { ok: false };
  try {
    await mainWindow.webContents.print({
      silent: true,
      printBackground: true,
      deviceName: "",
      pageSize: { width: 80000, height: 0 },
      margins: { marginType: "none" }
    });
    console.log("🖨️ Thermal receipt printed successfully");
    return { ok: true };
  } catch (err) {
    console.error("❌ Thermal print failed:", err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('debug-print-pdf', async () => {
  if (!mainWindow || !mainWindow.webContents) return { ok: false };
  try {
    const pdfBuffer = await mainWindow.webContents.printToPDF({
      marginsType: 0,
      printBackground: true,
      landscape: false,
    });
    const tmpPath = path.join(app.getPath('temp'), `greenhouse-receipt-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPath, pdfBuffer);
    console.log('📝 Debug PDF written to', tmpPath);
    return { ok: true, path: tmpPath };
  } catch (err) {
    console.error('❌ debug-print-pdf failed:', err && err.message);
    return { ok: false, error: err && err.message };
  }
});

ipcMain.handle('print-receipt-html', async (event, html) => {
  if (!html) return { ok: false, error: 'no-html' };
  try {
    const printWin = new BrowserWindow({
      show: false,
      width: 600,
      height: 800,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    const wrapper = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      @page { size: 80mm auto; margin: 0; }
      html,body { margin:0; padding:0; }
      .print-root { width:80mm; box-sizing:border-box; font-family: sans-serif; }
    </style></head><body><div class="print-root">${html}</div></body></html>`;

    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(wrapper));
    await new Promise((resolve) => printWin.webContents.once('did-finish-load', resolve));
    await new Promise((r) => setTimeout(r, 150));

    const printed = await new Promise((resolve) => {
      printWin.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: '',
        pageSize: { width: 80000, height: 0 },
        margins: { marginType: 'none' }
      }, (success, failureReason) => resolve({ success, failureReason }));
    });

    try { printWin.close(); } catch (e) { }
    if (!printed.success) {
      console.error('❌ print-receipt-html failed:', printed.failureReason);
      return { ok: false, error: printed.failureReason };
    }
    return { ok: true };
  } catch (err) {
    console.error('❌ print-receipt-html exception:', err && err.message);
    return { ok: false, error: err && err.message };
  }
});

// ======================= SCALE LOGIC (ROBUST NEW IMPLEMENTATION) =======================

const BAUD_RATES = [9600, 4800, 2400];

// Parse logic: Accepts multiple formats, strict on numbers
function parseEssaeWeight(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim();

  // Regex to find ANY valid float in the string
  // Matches: "1.234", "WT: 1.234kg", "+001.230", " 12.5 "
  const match = clean.match(/[+-]?\s*\d+(\.\d+)?/);
  if (!match) return null;

  let value = parseFloat(match[0].replace(/\s+/g, ""));

  // Handle 'g' unit conversion if explicit 'g' but not 'kg'
  if (clean.toLowerCase().includes('g') && !clean.toLowerCase().includes('kg')) {
    value = value / 1000;
  }

  return Number.isFinite(value) ? value : null;
}

// Helper: Attempt to open port at specific baud, listen for VALID DATA, return port if success
async function probePort(portPath, baud) {
  return new Promise((resolve) => {
    console.log(`🔎 Probing ${portPath} @ ${baud}...`);

    const port = new SerialPort({
      path: portPath,
      baudRate: baud,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
      rtscts: false
    });

    let foundPayload = false;
    let timer = null;

    const cleanup = async () => {
      port.removeAllListeners();
      if (port.isOpen && !foundPayload) {
        try { await new Promise(r => port.close(r)); } catch (e) { }
      }
    };

    port.on('error', (err) => {
      // console.log(`Error probing ${portPath}: ${err.message}`);
      clearTimeout(timer);
      cleanup().then(() => resolve(null));
    });

    port.open((err) => {
      if (err) {
        clearTimeout(timer);
        resolve(null);
        return;
      }

      // We need DTR true for some RS232 converters/isolators to power up
      port.set({ dtr: true, rts: true }, (err) => {
        if (err) console.warn("Failed to set DTR/RTS", err.message);
      });

      // Use raw streaming parser during probe to catch ANY delimiter
      // Essae can send \r, \n, or \r\n. 
      const parser = port.pipe(new ReadlineParser({ delimiter: '\n' })); // \n covers \r\n usually

      parser.on('data', (line) => {
        const w = parseEssaeWeight(line.toString());
        if (w !== null) {
          console.log(`✅ FOUND DATA on ${portPath} @ ${baud} => ${w}kg`);
          foundPayload = true;
          clearTimeout(timer);
          port.removeAllListeners(); // Stop listening as probe
          resolve(port); // Return the open port
        }
      });
    });

    // Wait 1500ms for data
    timer = setTimeout(() => {
      if (!foundPayload) {
        cleanup().then(() => resolve(null));
      }
    }, 1500);
  });
}

async function startScaleScan() {
  if (scalePort) return; // Already connected
  if (scanTimer) clearTimeout(scanTimer);

  notifyScaleStatus("connecting");
  console.log("📡 Starting Scale Scan...");

  // 1. Get List of Ports
  let ports = [];
  try {
    ports = await SerialPort.list();
  } catch (e) {
    console.error("List ports failed", e);
  }

  // 2. Prioritize Config or Common Ports
  let candidates = ports.map(p => p.path).filter(Boolean);

  // Add manual candidates for Windows if not found auto (e.g. ghost ports)
  if (process.platform === 'win32') {
    const common = ['COM1', 'COM2', 'COM3', 'COM4'];
    for (const c of common) {
      if (!candidates.includes(c)) candidates.push(c);
    }
  }

  // Unique
  candidates = [...new Set(candidates)];
  console.log("Candidate Ports:", candidates);

  // 3. Scan Loop
  for (const pPath of candidates) {
    // Try Baud Rates
    for (const baud of BAUD_RATES) {
      if (scalePort) return; // Stop if found in parallel? (async loop)

      const successfulPort = await probePort(pPath, baud);
      if (successfulPort) {
        lockScalConnection(successfulPort, baud);
        return;
      }
    }
  }

  // 4. Retry if not found
  console.log("❌ No scale found. Retrying in 5s...");
  scanTimer = setTimeout(startScaleScan, 5000);
}

function lockScalConnection(port, baud) {
  scalePort = port;
  console.log(`🔒 LOCKED Scale Connection on ${port.path} @ ${baud}`);
  notifyScaleStatus("connected", { port: port.path, baud });

  // Re-attach listeners for persistent operation
  scaleParser = scalePort.pipe(new ReadlineParser({ delimiter: '\n' }));

  scaleParser.on('data', (line) => {
    const raw = line.toString().trim();
    const weight = parseEssaeWeight(raw);

    if (weight !== null) {
      // Send to UI
      const weightKg = Number(weight.toFixed(3));
      // console.log(`Live: ${weightKg}`); // verbose
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("scale-data", {
          source: "serial",
          weightKg,
          raw,
          ts: Date.now()
        });
      }
    }
  });

  scalePort.on('close', () => {
    console.warn("⚠️ Scale port closed.");
    notifyScaleStatus("disconnected");
    scalePort = null;
    scaleParser = null;
    scanTimer = setTimeout(startScaleScan, 2000); // Fast reconnect
  });

  scalePort.on('error', (err) => {
    console.error("Scale connection error:", err);
    if (scalePort && scalePort.isOpen) {
      try { scalePort.close(); } catch (e) { }
    }
  });
}

// ======================= APP LIFECYCLE =======================

app.whenReady().then(() => {
  createWindow();
  connectBackendWS();
  startScaleScan(); // Start the new scanning logic

  scaleHeartbeatInterval = setInterval(() => {
    notifyScaleStatus(scaleStatus);
  }, 5000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("get-scale-status", async () => ({
  status: scaleStatus,
  ts: Date.now(),
}));

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (scalePort && scalePort.isOpen) {
      try { scalePort.close(); } catch (e) { }
    }
    app.quit();
  }
});

app.on("before-quit", () => {
  if (scaleHeartbeatInterval) clearInterval(scaleHeartbeatInterval);
  if (scanTimer) clearTimeout(scanTimer);
  if (scalePort && scalePort.isOpen) {
    try { scalePort.close(); } catch (e) { }
  }
  if (backendWs) {
    try { backendWs.close(); } catch (e) { }
  }
});
