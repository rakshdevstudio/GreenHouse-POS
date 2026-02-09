const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // ================= SCALE =================
  /**
   * Listen to live scale data from main.js
   * Usage:
   * window.electron.onScaleData(({ weightKg }) => { ... })
   */
  onScaleData: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("scale-data", listener);

    // cleanup helper
    return () => ipcRenderer.removeListener("scale-data", listener);
  },

  // ================= PRINT =================
  /**
   * Silent HTML receipt print
   * Usage:
   * window.electron.print(receiptHtml)
   */
  print: (receiptHtml) => {
    return ipcRenderer.invoke("print-receipt-html", receiptHtml);
  },

  // ================= PHASE 2: OFFLINE MODE =================
  /**
   * Get current network and offline status
   * Usage: window.electron.getNetworkStatus()
   */
  getNetworkStatus: () => {
    return ipcRenderer.invoke('get-network-status');
  },

  /**
   * Login with offline fallback
   * Usage: window.electron.login({ username, password })
   */
  login: (credentials) => {
    return ipcRenderer.invoke('login', credentials);
  },

  /**
   * Create invoice with offline fallback
   * Usage: window.electron.createInvoice(invoiceData)
   */
  createInvoice: (invoiceData) => {
    return ipcRenderer.invoke('create-invoice', invoiceData);
  },

  /**
   * Get pending offline invoices
   * Usage: window.electron.getOfflineInvoices()
   */
  getOfflineInvoices: () => {
    return ipcRenderer.invoke('get-offline-invoices');
  },

  /**
   * Force sync pending invoices
   * Usage: window.electron.forceSync()
   */
  forceSync: () => {
    return ipcRenderer.invoke('force-sync');
  },

  /**
   * Listen to network status changes
   * Usage: window.electron.onNetworkStatus(({ online }) => { ... })
   */
  onNetworkStatus: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('network-status', listener);
    return () => ipcRenderer.removeListener('network-status', listener);
  },
});