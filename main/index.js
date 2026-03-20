/**
 * SigPulse main process entry point.
 * Handles app lifecycle and window creation; tracking and IPC are in separate modules.
 */

const path = require('path');

// Load project-root .env into process.env before any module reads API keys (e.g. summary.js).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app, BrowserWindow, Menu } = require('electron');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.sigpulse.app');
}

/**
 * Packaged builds: drop Electron's default File / Edit / View / Window / Help menu.
 * Dev keeps defaults so Reload and DevTools stay reachable from the menu.
 * macOS always has a menu bar — use a minimal app menu only (no View → reload, etc.).
 */
function configureMenuForPackagedApp() {
  if (!app.isPackaged) {
    return;
  }
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
      ]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }
}

const config = require('./config');
const storage = require('./storage');
const summary = require('./summary');
const tracker = require('./tracker');
const demoMode = require('./demo-mode');
const { registerIpcHandlers } = require('./ipc');
const gentleNudges = require('./gentle-nudges');
const { initAutoUpdater } = require('./updater');

/** @type {Electron.BrowserWindow | null} */
let mainWindow = null;

/**
 * Creates and configures the main application window.
 * Loads the renderer and sets up preload + context isolation.
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 400,
    minHeight: 300,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      // Renderer cannot access Node, process.env, or filesystem; API keys stay in the main process only.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
    title: 'SigPulse - Productivity Insights',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (config.isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  configureMenuForPackagedApp();
  registerIpcHandlers({ storage, summary, tracker, demoMode });
  createWindow();
  initAutoUpdater(mainWindow);
  gentleNudges.startHighFocusWatcher();
});

app.on('will-quit', () => {
  gentleNudges.stopHighFocusWatcher();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
