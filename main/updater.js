/**
 * Auto-update (electron-updater). Only runs in packaged builds.
 * Replace YOUR_GITHUB_USERNAME / YOUR_REPOSITORY_NAME in package.json build.publish before release;
 * electron-builder embeds the feed URL for GitHub Releases, which electron-updater consumes at runtime.
 *
 * Packaged: checks once after the main window finishes loading, then every CHECK_INTERVAL_MS until quit.
 */

const { app, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');

const LOG = '[Updater]';

/** Background checks after startup (ms). */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

const CH = {
  AVAILABLE: 'auto-update-available',
  PROGRESS: 'auto-update-progress',
  DOWNLOADED: 'auto-update-downloaded',
  ERROR: 'auto-update-error',
  CHECK_FAILED: 'auto-update-check-failed',
};

/** User-facing copy when checkForUpdates fails (details stay in main-process logs only). */
function friendlyCheckFailureMessage(err) {
  const msg = err == null ? '' : String(err.message ?? err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENETUNREACH|certificate|SSL|fetch failed|network/i.test(msg)) {
    return "Couldn't reach the update server. Check your connection. The app works as usual—we'll try again later.";
  }
  return "Couldn't check for updates. The app works as usual—we'll try again automatically.";
}

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}

function registerUpdaterIpc(ipcMain) {
  ipcMain.handle('auto-update-download', async () => {
    if (!app.isPackaged) {
      return { ok: false, error: 'Updates are only available in the installed app.' };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      const message = err?.message ?? String(err);
      console.error(LOG, 'downloadUpdate failed:', message);
      broadcast(CH.ERROR, { message });
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('auto-update-quit-and-install', () => {
    if (!app.isPackaged) {
      return { ok: false, error: 'Not packaged' };
    }
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
}

/**
 * @param {Electron.BrowserWindow | null} mainWindow When set, checks after load so the renderer has subscribed to IPC events.
 */
function initAutoUpdater(mainWindow) {
  if (!app.isPackaged) {
    console.log(LOG, 'Skipped (not packaged)');
    return;
  }

  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    console.log(LOG, 'Checking for update…');
  });
  autoUpdater.on('update-available', (info) => {
    console.log(LOG, 'Update available:', info.version, info.releaseName || '');
    broadcast(CH.AVAILABLE, {
      version: info.version,
      releaseName: info.releaseName,
    });
  });
  autoUpdater.on('update-not-available', () => {
    console.log(LOG, 'No update available');
  });
  autoUpdater.on('error', (err) => {
    const message = err?.message ?? String(err);
    console.error(LOG, message);
    // Do not push every `error` event to the UI: check failures are handled in `runCheck`
    // (this event often duplicates the rejected `checkForUpdates` promise).
  });
  autoUpdater.on('download-progress', (p) => {
    const percent = typeof p.percent === 'number' ? p.percent : 0;
    console.log(LOG, `Download ${Math.round(percent)}%`);
    broadcast(CH.PROGRESS, {
      percent,
      transferred: p.transferred,
      total: p.total,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log(LOG, 'Update downloaded:', info.version);
    broadcast(CH.DOWNLOADED, { version: info.version });
  });

  const runCheck = () => {
    autoUpdater
      .checkForUpdates()
      .catch((err) => {
        console.error(LOG, 'checkForUpdates failed:', err?.message || err);
        broadcast(CH.CHECK_FAILED, { message: friendlyCheckFailureMessage(err) });
      });
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.once('did-finish-load', () => {
      runCheck();
      const intervalId = setInterval(runCheck, CHECK_INTERVAL_MS);
      app.once('will-quit', () => clearInterval(intervalId));
    });
  } else {
    runCheck();
    const intervalId = setInterval(runCheck, CHECK_INTERVAL_MS);
    app.once('will-quit', () => clearInterval(intervalId));
  }
}

module.exports = { initAutoUpdater, registerUpdaterIpc };
