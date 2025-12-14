const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("scale", {
  onData: (callback) => {
    ipcRenderer.removeAllListeners("scale-data");
    ipcRenderer.on("scale-data", (_event, data) => {
      callback(data);
    });
  },
});

contextBridge.exposeInMainWorld("electron", {
  print: async () => {
    return ipcRenderer.invoke("print-receipt");
  },
});