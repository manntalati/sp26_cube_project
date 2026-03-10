const { app, BrowserWindow, screen, globalShortcut, ipcMain } = require('electron');
const path = require('path');

let win = null;

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const { x, y } = primary.workArea;

  const margin = 14;
  const xPos = Math.round(x + margin);
  const yPos = Math.round(y + margin);

  win = new BrowserWindow({
    width: 320,
    height: 70, // Start very small for minimal mode
    x: xPos,
    y: yPos,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  // Ctrl+Q quits the app (global across OS)
  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit();
  });

  // Global ESC for peek mode. Holding it spams this event.
  globalShortcut.register('Escape', () => {
    if (win) win.webContents.send('esc-pressed');
  });

  // Global backtick for manual question popups.
  globalShortcut.register('`', () => {
    if (win) win.webContents.send('backtick-pressed');
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Allow the renderer to dynamically request a footprint resize
// based on whether it is in minimal mode, peek mode, or showing a nudge.
ipcMain.on('resize-window', (event, width, height) => {
  if (win) {
    win.setContentSize(Math.ceil(width), Math.ceil(height), false);
  }
});
