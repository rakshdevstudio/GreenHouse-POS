// electron/offline/example-integration.js
// EXAMPLE: How to integrate offline modules into main.js
// DO NOT RUN THIS FILE - it's a reference guide only

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');

// Import offline modules
const network = require('./offline/network');
const storage = require('./offline/storage');
const session = require('./offline/session');
const syncModule = require('./offline/sync');

const SERVER_URL = 'https://greenhouse-pos-production.up.railway.app';

let mainWindow;
let config = { terminal_uuid: 's1-c1' }; // Load from scale-config.json
let sync;

// ============================================
// APP INITIALIZATION
// ============================================

app.whenReady().then(() => {
    // Initialize offline modules FIRST
    initOfflineModules();

    // Then create window and start app
    createWindow();
    // ... rest of your initialization
});

function initOfflineModules() {
    console.log('🚀 Initializing offline modules...');

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
        sync.syncNow(); // Auto-sync when back online
    });

    network.onOffline(() => {
        console.log('🔴 Network: OFFLINE');
        mainWindow?.webContents.send('network-status', { online: false });
    });

    console.log('✅ Offline modules initialized');
}

// ============================================
// IPC HANDLERS - INVOICE CREATION
// ============================================

ipcMain.handle('create-invoice', async (event, invoiceData) => {
    const terminalUuid = config.terminal_uuid;

    try {
        if (network.isOnline()) {
            // ONLINE: Send to server immediately
            console.log('📡 Creating invoice online...');

            const response = await axios.post(
                `${SERVER_URL}/invoices/create`,
                {
                    ...invoiceData,
                    terminal_uuid: terminalUuid,
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
                invoice: response.data.invoice,
            };

        } else {
            // OFFLINE: Save locally
            console.log('📴 Creating invoice offline...');

            const localId = storage.saveInvoice(invoiceData, terminalUuid);

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
            const localId = storage.saveInvoice(invoiceData, terminalUuid);

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

// ============================================
// IPC HANDLERS - AUTHENTICATION
// ============================================

ipcMain.handle('login', async (event, { username, password }) => {
    try {
        if (network.isOnline()) {
            // ONLINE LOGIN
            console.log('🔐 Logging in online...');

            const response = await axios.post(
                `${SERVER_URL}/auth/login`,
                { username, password },
                { timeout: 10000 }
            );

            // Cache session for offline use
            session.saveSession({
                userId: response.data.user.id,
                storeId: response.data.user.store_id,
                terminal_uuid: config.terminal_uuid,
                authToken: response.data.token,
                username: username,
                storeName: response.data.store?.name || 'Greenhouse',
            });

            return {
                success: true,
                online: true,
                user: response.data.user,
                store: response.data.store,
                token: response.data.token,
            };

        } else {
            // OFFLINE LOGIN
            console.log('🔐 Attempting offline login...');

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
                    message: 'Logged in offline with cached credentials',
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

// ============================================
// IPC HANDLERS - SYNC STATUS
// ============================================

ipcMain.handle('get-sync-status', async () => {
    return sync.getStatus();
});

ipcMain.handle('force-sync', async () => {
    if (!network.isOnline()) {
        throw new Error('Cannot sync while offline');
    }

    await sync.syncNow();
    return { success: true };
});

// ============================================
// IPC HANDLERS - NETWORK STATUS
// ============================================

ipcMain.handle('get-network-status', async () => {
    return {
        online: network.isOnline(),
        sessionCached: session.isOfflineLoginAllowed(),
        storage: storage.getStats(),
        sync: sync.getStatus(),
    };
});

// ============================================
// CLEANUP ON EXIT
// ============================================

app.on('before-quit', () => {
    console.log('🧹 Cleaning up offline modules...');
    network.destroy();
    sync.destroy();
});

// ============================================
// NOTES FOR INTEGRATION
// ============================================

/*
FRONTEND CHANGES NEEDED:

1. Listen for network status:
   window.electron.on('network-status', ({ online }) => {
     setIsOnline(online);
   });

2. Show offline indicator in UI:
   {!isOnline && <div>⚠️ Offline Mode</div>}

3. Handle offline invoice creation:
   const result = await window.electron.createInvoice(invoiceData);
   if (!result.online) {
     showNotification('Invoice saved offline, will sync later');
   }

4. Show sync status:
   const status = await window.electron.getSyncStatus();
   // Display pending count, last sync time, etc.

5. Add manual sync button:
   <button onClick={() => window.electron.forceSync()}>
     Sync Now
   </button>
*/

/*
PRELOAD.JS ADDITIONS:

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Existing methods...
  
  // Offline methods
  createInvoice: (data) => ipcRenderer.invoke('create-invoice', data),
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  forceSync: () => ipcRenderer.invoke('force-sync'),
  getNetworkStatus: () => ipcRenderer.invoke('get-network-status'),
  
  // Event listeners
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
});
*/
