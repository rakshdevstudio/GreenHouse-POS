const { contextBridge, ipcRenderer } = require("electron");

// Expose scale API (matching your React code's expectation)
contextBridge.exposeInMainWorld("electron", {
  // Scale data listener - matches your POS.jsx usage
  onScaleData: (callback) => {
    const listener = (_event, data) => {
      callback(data);
    };
    
    // Add the listener
    ipcRenderer.on("scale-data", listener);
    
    // Return cleanup function so React can unsubscribe
    return () => {
      ipcRenderer.removeListener("scale-data", listener);
    };
  },

  // Print function
  print: async () => {
    return ipcRenderer.invoke("print-receipt");
  }
});