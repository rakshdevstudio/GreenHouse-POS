# Offline Mode Foundation

## Overview

This directory contains the complete offline mode infrastructure for the Greenhouse POS Electron app.

**Status:** ✅ Phase 1 Complete - Foundation scaffolded, ready for integration

## Architecture

```
offline/
├── network.js   → Network status detection
├── storage.js   → Local invoice persistence
├── session.js   → Cached login/session
└── sync.js      → Background sync manager
```

## Module Responsibilities

### 🌐 network.js
**Purpose:** Detect online/offline state reliably

**Features:**
- DNS-based connectivity checks (more reliable than browser APIs)
- Event callbacks for online/offline transitions
- Periodic health checks (every 30s)
- Works in Electron main process

**API:**
```javascript
const network = require('./offline/network');

network.init();
network.isOnline();              // → boolean
network.onOnline(() => { ... }); // Callback when back online
network.onOffline(() => { ... }); // Callback when offline
```

---

### 💾 storage.js
**Purpose:** Persist invoices locally when offline

**Features:**
- JSON file-based storage (upgradeable to SQLite)
- Per-terminal invoice tracking
- Sync status tracking
- Automatic cleanup of old synced invoices

**API:**
```javascript
const storage = require('./offline/storage');

storage.init();
storage.saveInvoice(invoiceData, terminalUuid);  // → localId
storage.getPendingInvoices(terminalUuid);        // → Array
storage.markInvoiceSynced(localId, serverId);
storage.getStats();                              // → { pending, synced, ... }
```

**Storage Location:**
- `{userData}/offline-data/invoices.json`
- Persists across app restarts

---

### 👤 session.js
**Purpose:** Enable offline login with cached credentials

**Features:**
- Caches last successful login
- Basic credential obfuscation (not encryption)
- Session age validation (30 day limit)
- Username-based offline validation

**API:**
```javascript
const session = require('./offline/session');

session.init();
session.saveSession({ userId, storeId, terminal_uuid, authToken, ... });
session.isOfflineLoginAllowed();                  // → boolean
session.validateOfflineLogin(username, password); // → session | null
session.getSession();                             // → cached session
```

**Storage Location:**
- `{userData}/session/cached-session.json`

**Security Note:**
- Uses basic obfuscation, NOT encryption
- For production, consider using `keytar` for secure credential storage

---

### 🔄 sync.js
**Purpose:** Sync offline invoices when back online

**Features:**
- Automatic sync when network returns
- Exponential backoff retry logic
- Periodic background sync (every 60s)
- Per-invoice retry tracking
- Handles partial failures gracefully

**API:**
```javascript
const syncModule = require('./offline/sync');

const sync = syncModule.create(networkManager, storageManager);
sync.init('https://your-backend-url.com');
sync.syncNow();                  // Manual trigger
sync.getStatus();                // → { syncing, online, pendingInvoices, ... }
sync.syncTerminal(terminalUuid); // Force sync for specific terminal
```

**Retry Strategy:**
- Max 5 attempts per invoice
- Backoff: 1s → 5s → 15s → 30s → 60s
- Skips retry for 4xx client errors

---

## Integration Guide

### Step 1: Initialize in main.js

```javascript
const network = require('./offline/network');
const storage = require('./offline/storage');
const session = require('./offline/session');
const syncModule = require('./offline/sync');

// Initialize all modules
network.init();
storage.init();
session.init();

const sync = syncModule.create(network, storage);
sync.init('https://greenhouse-pos-production.up.railway.app');
```

### Step 2: Handle Offline Invoice Creation

```javascript
// When checkout happens
ipcMain.handle('create-invoice', async (event, invoiceData) => {
  const terminalUuid = config.terminal_uuid;
  
  if (network.isOnline()) {
    // Normal online flow
    const response = await axios.post(`${SERVER_URL}/invoices/create`, invoiceData);
    return response.data;
  } else {
    // Offline flow
    const localId = storage.saveInvoice(invoiceData, terminalUuid);
    console.log('📴 Created offline invoice:', localId);
    
    return {
      offline: true,
      localId,
      message: 'Invoice saved locally, will sync when online'
    };
  }
});
```

### Step 3: Handle Offline Login

```javascript
ipcMain.handle('login', async (event, { username, password }) => {
  if (network.isOnline()) {
    // Normal online login
    const response = await axios.post(`${SERVER_URL}/auth/login`, { username, password });
    
    // Cache session for offline use
    session.saveSession({
      userId: response.data.user.id,
      storeId: response.data.user.store_id,
      terminal_uuid: config.terminal_uuid,
      authToken: response.data.token,
      username: username,
      storeName: response.data.store.name
    });
    
    return response.data;
  } else {
    // Offline login attempt
    const cachedSession = session.validateOfflineLogin(username, password);
    
    if (cachedSession) {
      return {
        offline: true,
        user: { id: cachedSession.userId },
        store: { id: cachedSession.storeId },
        terminal_uuid: cachedSession.terminal_uuid,
        message: 'Logged in offline with cached credentials'
      };
    } else {
      throw new Error('Offline login not available');
    }
  }
});
```

### Step 4: Monitor Network Status

```javascript
network.onOnline(() => {
  console.log('🟢 Back online - triggering sync');
  mainWindow?.webContents.send('network-status', { online: true });
  sync.syncNow();
});

network.onOffline(() => {
  console.log('🔴 Gone offline');
  mainWindow?.webContents.send('network-status', { online: false });
});
```

---

## Testing Checklist

- [ ] Network detection works (try disconnecting WiFi)
- [ ] Offline invoices save to local storage
- [ ] Invoices sync when back online
- [ ] Offline login works with cached credentials
- [ ] Sync retries on failure
- [ ] Multiple terminals don't interfere with each other
- [ ] Data persists across app restarts

---

## Future Enhancements

### Phase 2: Full Integration
- Integrate with existing `main.js`
- Add IPC handlers for offline operations
- Update frontend to show offline indicator
- Add sync status to UI

### Phase 3: Advanced Features
- Upgrade to SQLite for better performance
- Add conflict resolution for synced data
- Implement secure credential storage (keytar)
- Add offline product catalog caching
- Support offline customer lookup

### Phase 4: Production Hardening
- Add comprehensive error handling
- Implement data migration for schema changes
- Add telemetry for offline usage
- Create admin dashboard for sync monitoring

---

## File Locations

All data is stored in Electron's `userData` directory:

**macOS:**
```
~/Library/Application Support/Greenhouse POS/
├── offline-data/
│   └── invoices.json
└── session/
    └── cached-session.json
```

**Windows:**
```
C:\Users\{username}\AppData\Roaming\Greenhouse POS\
├── offline-data\
│   └── invoices.json
└── session\
    └── cached-session.json
```

---

## Dependencies

All modules use built-in Node.js and Electron APIs:
- `fs` - File system operations
- `path` - Path manipulation
- `crypto` - Credential obfuscation
- `dns` - Network connectivity checks
- `electron` - App paths and IPC
- `axios` - HTTP requests (already in package.json)

**No additional dependencies required!**

---

## Support

For questions or issues:
1. Check the TODO comments in each file
2. Review the integration examples above
3. Test in development before deploying to terminals

---

**Created:** 2026-02-09  
**Status:** Ready for Phase 2 Integration  
**Version:** 1.0.0
