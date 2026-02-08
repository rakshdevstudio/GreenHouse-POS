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
  }
});