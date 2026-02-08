const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // ================= SCALE =================
  /**
   * Listen to live scale data from main.js
   * Usage in frontend:
   * window.electron.onScaleData(({ weightKg }) => { ... })
   */
  onScaleData: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("scale-data", listener);

    // cleanup helper (optional)
    return () => ipcRenderer.removeListener("scale-data", listener);
  },

  // ================= PRINT =================
  /**
   * Silent receipt print
   * Usage:
   * window.electron.printReceipt(order)
   */
  printReceipt: (order) => {
    return ipcRenderer.invoke("print-receipt", order);
  },

  // ================= DEBUG (OPTIONAL) =================
  /**
   * For debugging printer without physical print
   */
  printToPDF: () => {
    return ipcRenderer.invoke("debug-print-pdf");
  }
});