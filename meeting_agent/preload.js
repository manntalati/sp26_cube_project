const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window resize
  resizeWindow: (width, height) => ipcRenderer.send('resize-window', width, height),

  // Open URL in system browser (for OAuth)
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Listen for global shortcut events from main process
  onEscPressed: (callback) => ipcRenderer.on('esc-pressed', callback),
  onBacktickPressed: (callback) => ipcRenderer.on('backtick-pressed', callback),
  onToggleSettings: (callback) => ipcRenderer.on('toggle-settings', callback),

  // Quit the app
  quitApp: () => ipcRenderer.send('quit-app'),
});
