const { contextBridge, ipcRenderer } = require('electron');

// Expose secure global APIs to the renderer (public/app.js)
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  
  // Sends a message to main process to open the native DropLink downloads folder
  openDownloads: () => ipcRenderer.send('open-downloads')
});
