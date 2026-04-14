const { app, BrowserWindow, screen, globalShortcut, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let win = null;
let flaskProcess = null;

// ─────────────────────────────────────────────────────────────────────────────
// FLASK BACKEND LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
function startFlask() {
  const backendDir = path.join(__dirname, 'backend');
  const venvPython = path.join(backendDir, 'venv', 'bin', 'python3');
  const systemPython = 'python3';

  // Prefer venv python if it exists, otherwise system python
  const fs = require('fs');
  const pythonPath = fs.existsSync(venvPython) ? venvPython : systemPython;

  flaskProcess = spawn(pythonPath, ['app.py'], {
    cwd: backendDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1', FLASK_DEBUG: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  flaskProcess.stdout.on('data', (data) => {
    console.log(`[Flask] ${data.toString().trim()}`);
  });

  flaskProcess.stderr.on('data', (data) => {
    console.log(`[Flask] ${data.toString().trim()}`);
  });

  flaskProcess.on('error', (err) => {
    console.error('[Flask] Failed to start:', err.message);
  });

  flaskProcess.on('exit', (code) => {
    console.log(`[Flask] exited with code ${code}`);
    flaskProcess = null;
  });
}

function stopFlask() {
  if (flaskProcess) {
    flaskProcess.kill('SIGTERM');
    flaskProcess = null;
  }
}

function waitForFlask(maxMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get('http://127.0.0.1:5002/api/health', (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() - start > maxMs) {
        reject(new Error('Flask backend did not start in time'));
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ELECTRON WINDOW
// ─────────────────────────────────────────────────────────────────────────────
function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const { x, y } = primary.workArea;

  const margin = 14;
  const xPos = Math.round(x + margin);
  const yPos = Math.round(y + margin);

  win = new BrowserWindow({
    width: 340,
    height: 70,
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Grant microphone access for in-person mode (getUserMedia in renderer)
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media';
  });

  win.loadFile('index.html');
}

// ─────────────────────────────────────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  startFlask();

  try {
    await waitForFlask();
    console.log('[Main] Flask backend ready');
  } catch (err) {
    console.error('[Main]', err.message);
  }

  createWindow();

  // Global shortcuts
  globalShortcut.register('CommandOrControl+Q', () => app.quit());

  globalShortcut.register('Escape', () => {
    if (win) win.webContents.send('esc-pressed');
  });

  globalShortcut.register('`', () => {
    if (win) win.webContents.send('backtick-pressed');
  });

  globalShortcut.register('CommandOrControl+,', () => {
    if (win) win.webContents.send('toggle-settings');
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopFlask();
});

// IPC handlers
ipcMain.on('resize-window', (_event, width, height) => {
  if (win) win.setContentSize(Math.ceil(width), Math.ceil(height), false);
});

ipcMain.on('open-external', (_event, url) => {
  shell.openExternal(url);
});

ipcMain.on('quit-app', () => {
  app.quit();
});
