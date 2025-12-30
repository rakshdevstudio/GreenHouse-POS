const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  // ===== SCALE =====
  onScaleData: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("scale-data", listener);
    return () => ipcRenderer.removeListener("scale-data", listener);
  },

  // ===== PRINT =====
  print: async (html) => {
    if (html) {
      return ipcRenderer.invoke("print-receipt-html", html);
    }
    return ipcRenderer.invoke("print-receipt");
  },

  // ===== DEBUG =====
  printToPDF: async () => {
    return ipcRenderer.invoke("debug-print-pdf");
  }
});