const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let scalePort = null;
let parser = null;
let isDev = !app.isPackaged;

let scaleInitializing = false;

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

  if (!isDev && process.env.ENABLE_UPDATES === "true") {
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

// Debug: generate a PDF of the current contents (for troubleshooting printed output)
ipcMain.handle('debug-print-pdf', async () => {
  if (!mainWindow || !mainWindow.webContents) return { ok: false };

  try {
    // Generate PDF of current window contents
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

// Print provided HTML content in a hidden window sized for thermal receipts (80mm)
ipcMain.handle('print-receipt-html', async (event, html) => {
  if (!html) return { ok: false, error: 'no-html' };
  try {
    const printWin = new BrowserWindow({
      show: false,
      width: 600, // logical pixels, content will be sized by CSS to 80mm
      height: 800,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const wrapper = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      @page { size: 80mm auto; margin: 0; }
      html,body { margin:0; padding:0; }
      .print-root { width:80mm; box-sizing:border-box; font-family: sans-serif; }
    </style></head><body><div class="print-root">${html}</div></body></html>`;

    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(wrapper));

    await new Promise((resolve) => {
      printWin.webContents.once('did-finish-load', () => resolve());
    });

    // Give a brief moment for fonts/images to settle
    await new Promise((r) => setTimeout(r, 150));

    const printed = await new Promise((resolve) => {
      printWin.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: '',
        pageSize: { width: 80000, height: 0 },
        margins: { marginType: 'none' }
      }, (success, failureReason) => {
        resolve({ success, failureReason });
      });
    });

    try { printWin.close(); } catch (e) {}

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
  if (scaleInitializing) return;
  scaleInitializing = true;
  try {
    // Load optional config file (scale-config.json) next to this main.js
    const defaultCfg = {
      path: process.platform === 'win32' ? 'COM1' : null,
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    };

    // Prefer config locations that work both in dev and in a packaged EXE.
    const possibleConfigPaths = [
      path.join(app.getPath('userData'), 'scale-config.json'), // writable and recommended for packaged apps
      path.join(path.dirname(process.execPath), 'scale-config.json'), // next to the exe
      path.join(process.resourcesPath || '', 'scale-config.json'), // inside resources (may be read-only)
      path.join(__dirname, 'scale-config.json'), // fallback for dev
    ].filter(Boolean);

    let cfg = { ...defaultCfg };
    let cfgPath = null;

    for (const p of possibleConfigPaths) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          const parsed = JSON.parse(raw);
          cfg = { ...cfg, ...parsed };
          cfgPath = p;
          console.log('🔧 Loaded scale config from', p);
          break;
        }
      } catch (err) {
        console.warn('⚠️ Failed to read scale-config at', p, err && err.message);
      }
    }

    // If none found, choose the userData path as the canonical place to persist
    if (!cfgPath) cfgPath = path.join(app.getPath('userData'), 'scale-config.json');

    // If not present, try to read legacy .config/.xml files (extract ComPort/BaudRate/dataBits)
    try {
      const files = fs.readdirSync(__dirname);
      for (const f of files) {
        if (!/\.(config|xml)$/i.test(f)) continue;
        const p = path.join(__dirname, f);
        try {
          const txt = fs.readFileSync(p, 'utf8');
          const get = (k) => {
            const m = txt.match(new RegExp('<add\\s+key=["\']' + k + '["\']\\s+value=["\']([^"\']+)["\']', 'i'));
            return m ? m[1] : null;
          };

          const legacyPort = get('ComPort') || get('Comport') || get('comPort');
          const legacyBaud = get('BaudRate');
          const legacyDataBits = get('dataBits');

          if (legacyPort || legacyBaud || legacyDataBits) {
            console.log('🔁 Found legacy config in', f, { legacyPort, legacyBaud, legacyDataBits });
            if (legacyPort && !cfg.path) cfg.path = legacyPort;
            if (legacyBaud && !cfg.baudRate) cfg.baudRate = Number(legacyBaud);
            if (legacyDataBits && !cfg.dataBits) cfg.dataBits = Number(legacyDataBits);

            // Persist merged config so next startup uses JSON
            try {
              fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
              console.log('🔧 Written merged scale-config.json from legacy config');
            } catch (werr) {
              console.warn('⚠️ Failed to write merged scale-config.json:', werr && werr.message);
            }

            break; // stop after first file that contains keys
          }
        } catch (e) {
          /* ignore read errors */
        }
      }
    } catch (e) {
      /* ignore */
    }

    console.log('🔌 Attempting to connect to scale with settings:', cfg);

    // Helper to try opening a specific port path
    function tryOpenPort(portPath) {
      return new Promise((resolve, reject) => {
        const finalPath =
          process.platform === "win32" && !portPath.startsWith("\\\\.\\")
            ? `\\\\.\\${portPath}`
            : portPath;

        const sp = new SerialPort({
          path: finalPath,
          baudRate: cfg.baudRate || 9600,
          dataBits: cfg.dataBits || 8,
          stopBits: cfg.stopBits || 1,
          parity: cfg.parity || "none",
          rtscts: false,
          xon: false,
          xoff: false,
          autoOpen: false,
        });

        const onError = (err) => {
          if (sp.isOpen === true) {
            try { sp.close(); } catch (e) {}
          }
          reject(err);
        };

        sp.open((err) => {
          if (err) return onError(err);
          // success
          resolve(sp);
        });
      });
    }

    // Decide candidate ports: configured path first (if provided), otherwise enumerate
    let triedPaths = [];
    let openedPort = null;

    if (cfg.path) {
      triedPaths.push(cfg.path);
      try {
        openedPort = await tryOpenPort(cfg.path);
        console.log('✅ Scale connected on', cfg.path);
      } catch (err) {
        console.warn('❌ Failed to open configured port', cfg.path, err && err.message);
      }
    }

    // If not opened, enumerate available ports and try likely candidates
    if (!openedPort) {
      let ports = [];
      try {
        ports = await SerialPort.list();
      } catch (err) {
        console.warn('⚠️ SerialPort.list() failed:', err && err.message);
        ports = [];
      }

      // Build a list of candidate paths
      const candidates = [];
      for (const p of ports) {
        if (p.path) candidates.push(p.path);
      }

      // Add common fallback names for different OSes
      if (process.platform === 'darwin' || process.platform === 'linux') {
        candidates.push('/dev/tty.usbserial');
        candidates.push('/dev/tty.usbmodem');
        candidates.push('/dev/ttyUSB0');
        candidates.push('/dev/ttyACM0');
      }
      if (process.platform === 'win32') {
        candidates.push('COM1');
        candidates.push('COM2');
      }

      // Remove duplicates
      const uniq = Array.from(new Set(candidates));

      for (const pth of uniq) {
        if (openedPort) break;
        triedPaths.push(pth);
        try {
          openedPort = await tryOpenPort(pth);
          console.log('✅ Scale connected on', pth);
          break;
        } catch (err) {
          console.warn('❌ Could not open', pth, err && err.message);
        }
      }
    }

    if (!openedPort) {
      console.error('❌ No scale port available. Tried:', triedPaths);
      // Retry after delay
      setTimeout(initScale, 3000);
      return;
    }

    // Assign the opened port to global variable for lifecycle management
    scalePort = openedPort;

    // Try both \r\n and \r delimiters (Essae scales may use either)
    parser = scalePort.pipe(
      new ReadlineParser({
        delimiter: "\r",
        encoding: "ascii",
      })
    );

    // Listen to parsed lines
    parser.on("data", (line) => {
      const clean = line.toString().trim();
      if (!clean) return;

      // Log raw data for debugging
      console.log("📟 SCALE RAW:", clean);

      // Parse the weight
      const weight = parseEssaeWeight(clean);
      
      if (weight !== null) {
        const weightKg = weight.toFixed(3);
        console.log("⚖️ PARSED WEIGHT:", weightKg, "kg");
        
        // Send raw line to renderer (existing renderer code parses it too)
        if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("scale-data", {
            raw: clean,
            weightKg: Number(weightKg),
          });
        }
      } else {
        console.log("⚠️ Could not parse weight from:", clean);
      }
    });

    scalePort.on("error", (err) => {
      console.error("❌ Scale error:", err.message);
      if (scalePort && scalePort.isOpen === true) {
        try { scalePort.close(); } catch (e) {}
      }
    });

    scalePort.on("close", () => {
      console.warn("⚠️ Scale disconnected. Reconnecting in 3 seconds...");
      scalePort = null;
      parser = null;
      setTimeout(() => {
        if (!app.isQuiting) initScale();
      }, 3000);
    });

  } catch (err) {
    console.error("❌ Scale init exception:", err.message);
    setTimeout(initScale, 3000);
  } finally {
    scaleInitializing = false;
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
    if (scalePort && scalePort.isOpen === true) {
      scalePort.removeAllListeners();
      try {
        scalePort.close();
      } catch (e) {
        console.warn("⚠️ Scale close skipped:", e.message);
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