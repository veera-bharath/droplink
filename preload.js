const { contextBridge, ipcRenderer } = require('electron');

// Expose secure global APIs to the renderer (public/app.js)
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  
  // Sends a message to main process to open the native DropLink downloads folder
  openDownloads: () => ipcRenderer.send('open-downloads'),
  
  // Triggers native directory picker dialog and returns the selected path
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  
  // Sends a request to display a native OS desktop notification
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body })
});
