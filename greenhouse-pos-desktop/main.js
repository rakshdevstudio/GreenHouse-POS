const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { SerialPort } = require("serialport");
const axios = require("axios");

// PHASE 2: OFFLINE MODE MODULES
const network = require('./offline/network');
const storage = require('./offline/storage');
const session = require('./offline/session');
const syncModule = require('./offline/sync');

let mainWindow;
let scalePort;
let buffer = "";
let lastSent = 0;
const SEND_INTERVAL = 200;

// PHASE 2: OFFLINE MODE GLOBALS
let sync; // Sync manager instance
let terminalConfig; // Store config globally for IPC handlers

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
  console.log("⚖ SCALE PORT:", SCALE_PORT);

  createWindow();
  openScale(SCALE_PORT, BAUD_RATE, TERMINAL_UUID);

  // Setup printing with config from same directory
  const printerConfig = loadPrinterConfig(exeDir);
  setupPrinting(printerConfig);

  // PHASE 2: OFFLINE MODE WIRING
  terminalConfig = {
    terminal_uuid: TERMINAL_UUID,
    exeDir: exeDir
  };

  initOfflineMode(TERMINAL_UUID);
  setupOfflineHandlers();
}

// ==================================================
// PRINTER CONFIG
// ==================================================
function loadPrinterConfig(exeDir) {
  const printerConfigPath = path.join(exeDir, "printer-config.json");

  const DEFAULT_PRINTER_CONFIG = {
    printer_name: "",
    store: {
      name: "Greenhouse Supermarket",
      address_lines: [],
    },
  };

  try {
    if (!fs.existsSync(printerConfigPath)) {
      fs.writeFileSync(
        printerConfigPath,
        JSON.stringify(DEFAULT_PRINTER_CONFIG, null, 2),
        "utf8"
      );
      console.log("🆕 Created printer-config.json at:", printerConfigPath);
    }

    console.log("🖨 Loaded printer config:", printerConfigPath);
    return JSON.parse(fs.readFileSync(printerConfigPath, "utf8"));
  } catch (err) {
    console.error("❌ Printer config error:", err.message);
    return DEFAULT_PRINTER_CONFIG;
  }
}

// ==================================================
// PRINTING
// ==================================================
function setupPrinting(printerConfig) {
  ipcMain.handle("print-receipt-html", async (_event, receiptHtml) => {
    if (!receiptHtml) {
      return { success: false, error: "No HTML provided" };
    }

    let win;
    try {
      win = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: false },
      });

      const wrappedHtml = `
        <html>
          <head>
            <style>
              @page { size: 80mm auto; margin: 0; }
              
              body {
                width: 80mm;
                margin: 0;
                padding: 3mm 2mm;
                font-family: "Courier New", Courier, monospace;
                font-size: 10px;
                line-height: 1.4;
                color: #000;
                background: #fff;
              }

              /* Receipt container */
              .receipt-preview {
                width: 100%;
                box-sizing: border-box;
              }

              /* Store header */
              .receipt-store {
                text-align: center;
                margin-bottom: 4mm;
              }

              .receipt-store-name {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 2mm;
                text-transform: uppercase;
              }

              .receipt-store-sub {
                font-size: 9px;
                margin: 1mm 0;
              }

              /* Divider */
              .receipt-divider {
                border-top: 1px dashed #000;
                margin: 3mm 0;
                width: 100%;
              }

              /* Items section */
              .receipt-items {
                width: 100%;
                margin: 2mm 0;
              }

              .receipt-items-header {
                display: flex;
                justify-content: space-between;
                font-weight: bold;
                font-size: 9px;
                margin-bottom: 2mm;
                padding-bottom: 1mm;
                border-bottom: 1px solid #000;
              }

              .receipt-item-row {
                display: flex;
                justify-content: space-between;
                margin: 1.5mm 0;
                font-size: 9px;
              }

              /* Column widths */
              .r-col-name {
                flex: 0 0 35%;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                text-align: left;
              }

              .r-col-qty {
                flex: 0 0 20%;
                text-align: right;
                padding-right: 2mm;
              }

              .r-col-rate {
                flex: 0 0 22%;
                text-align: right;
                padding-right: 2mm;
              }

              .r-col-amt {
                flex: 0 0 23%;
                text-align: right;
                font-weight: bold;
              }

              /* Totals */
              .receipt-totals {
                margin-top: 3mm;
                padding-top: 2mm;
                border-top: 1px solid #000;
              }

              .receipt-total-row {
                display: flex;
                justify-content: space-between;
                margin: 1.5mm 0;
                font-size: 10px;
              }

              .receipt-total-row-strong {
                font-weight: bold;
                font-size: 12px;
                margin-top: 2mm;
                padding-top: 2mm;
                border-top: 1px dashed #000;
              }

              /* Footer */
              .receipt-footer {
                margin-top: 4mm;
                text-align: center;
                font-size: 9px;
              }

              .receipt-footer-sub {
                font-size: 8px;
                font-style: italic;
                margin-top: 1mm;
              }
            </style>
          </head>
          <body>${receiptHtml}</body>
        </html>
      `;

      win.webContents.once("did-finish-load", () => {
        setTimeout(() => {
          win.webContents.print(
            {
              silent: true,
              deviceName: printerConfig.printer_name || undefined,
              color: false,
              landscape: false,
              margins: { marginType: "none" },
              pageSize: { width: 80000, height: 297000 },
              scaleFactor: 100,
            },
            () => win.close()
          );
        }, 500);
      });

      await win.loadURL(
        "data:text/html;charset=utf-8," +
        encodeURIComponent(wrappedHtml)
      );

      return { success: true };
    } catch (err) {
      try { win?.close(); } catch { }
      return { success: false, error: err.message };
    }
  });
}

// ==================================================
// PHASE 2: OFFLINE MODE INITIALIZATION
// ==================================================
function initOfflineMode(terminalUuid) {
  console.log('🔄 Initializing offline mode...');

  try {
    // 1. Network detection
    network.init();

    // 2. Local storage
    storage.init();

    // 3. Session cache
    session.init();

    // 4. Sync manager
    sync = syncModule.create(network, storage);
    sync.init(SERVER_URL);

    // 5. Network event handlers
    network.onOnline(() => {
      console.log('🟢 Network: ONLINE');
      mainWindow?.webContents.send('network-status', { online: true });
      sync.syncNow();
    });

    network.onOffline(() => {
      console.log('🔴 Network: OFFLINE');
      mainWindow?.webContents.send('network-status', { online: false });
    });

    console.log('✅ Offline mode initialized');
  } catch (err) {
    console.error('❌ Offline mode init failed:', err);
    // Don't crash app if offline mode fails
  }
}

// ==================================================
// PHASE 2: OFFLINE MODE IPC HANDLERS
// ==================================================
function setupOfflineHandlers() {
  // Network status query
  ipcMain.handle('get-network-status', async () => {
    return {
      online: network.isOnline(),
      sessionCached: session.isOfflineLoginAllowed(),
      pendingInvoices: storage.getStats().pending,
    };
  });

  // Login with offline fallback
  ipcMain.handle('login', async (event, { username, password }) => {
    try {
      if (network.isOnline()) {
        // ONLINE: Normal login to backend
        const response = await axios.post(
          `${SERVER_URL}/auth/store-login`,
          { username, password },
          { timeout: 10000 }
        );

        // Cache session for offline use
        // ---- FIX: normalize backend response ----
        console.log('Login Response Data:', JSON.stringify(response.data));

        const userId =
          response.data.user?.id ||
          response.data.user_id ||
          response.data.id; // Fallback for some flattened responses

        const storeId =
          response.data.store?.id ||
          response.data.store_id ||
          (response.data.user ? response.data.user.store_id : null);

        if (!userId || !storeId) {
          console.warn("⚠️ Warning: Incomplete login response from server. Proceeding with best effort.");
          console.warn("Got:", { userId, storeId });
        }

        // Cache session correctly (best effort)
        if (userId && storeId) {
          session.saveSession({
            userId,
            storeId,
            terminal_uuid: terminalConfig.terminal_uuid,
            authToken: response.data.token,
            username,
            storeName: response.data.store?.name || 'Greenhouse',
          });
        }

        // Return structure frontend already understands
        // Frontend mostly cares about token and store_id
        return {
          success: true,
          online: true,
          token: response.data.token,
          store: response.data.store || { id: storeId },
          store_id: storeId,
          user_id: userId,
          user: response.data.user || { id: userId, username }, // Ensure user object exists
        };
      } else {
        // OFFLINE: Use cached session
        const cachedSession = session.validateOfflineLogin(username, password);

        if (cachedSession) {
          return {
            success: true,
            online: false,
            user: {
              id: cachedSession.userId,
              username: cachedSession.username,
            },
            store: {
              id: cachedSession.storeId,
              name: cachedSession.storeName,
            },
            terminal_uuid: cachedSession.terminal_uuid,
            token: cachedSession.authToken,
          };
        } else {
          throw new Error('Offline login not available. Please connect to internet.');
        }
      }
    } catch (err) {
      console.error('❌ Login failed:', err);
      throw err;
    }
  });

  // Invoice creation with offline fallback
  ipcMain.handle('create-invoice', async (event, invoiceData) => {
    try {
      if (network.isOnline()) {
        // ONLINE: Send to backend immediately
        const response = await axios.post(
          `${SERVER_URL}/invoices`,
          {
            ...invoiceData,
            terminal_uuid: terminalConfig.terminal_uuid,
          },
          {
            timeout: 10000,
            headers: {
              'Authorization': `Bearer ${session.getSession()?.authToken || ''}`,
            }
          }
        );

        return {
          success: true,
          online: true,
          invoice: response.data.invoice || response.data,
        };
      } else {
        // OFFLINE: Save locally
        const localId = storage.saveInvoice(invoiceData, terminalConfig.terminal_uuid);

        return {
          success: true,
          online: false,
          localId,
          message: 'Invoice saved locally. Will sync when online.',
        };
      }
    } catch (err) {
      console.error('❌ Invoice creation failed:', err);

      // Fallback to offline if online request fails
      if (network.isOnline()) {
        console.log('⚠️  Online request failed, falling back to offline mode');
        const localId = storage.saveInvoice(invoiceData, terminalConfig.terminal_uuid);

        return {
          success: true,
          online: false,
          localId,
          fallback: true,
          message: 'Server error. Invoice saved locally.',
        };
      }

      throw err;
    }
  });

  // Manual sync trigger
  ipcMain.handle('force-sync', async () => {
    if (!network.isOnline()) {
      throw new Error('Cannot sync while offline');
    }
    await sync.syncNow();
    return { success: true };
  });

  console.log('✅ Offline IPC handlers registered');
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

    const now = Date.now();
    if (now - lastSent < SEND_INTERVAL) continue;
    lastSent = now;

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

  // PHASE 2: OFFLINE MODE CLEANUP
  try {
    network.destroy();
    sync?.destroy();
  } catch { }

  app.quit();
});