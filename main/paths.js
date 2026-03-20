/**
 * Resolves the directory for persisted JSON, screenshots, and activity logs.
 * - Packaged: Electron userData (writable, per-user).
 * - Development / Node CLI: project root (parent of main/).
 */

const path = require('path');

let cached;

function getAppDataDir() {
  if (cached !== undefined) {
    return cached;
  }
  try {
    const electron = require('electron');
    if (
      electron &&
      typeof electron === 'object' &&
      electron.app &&
      typeof electron.app.getPath === 'function'
    ) {
      cached = electron.app.isPackaged ? electron.app.getPath('userData') : path.join(__dirname, '..');
      return cached;
    }
  } catch {
    // Plain Node (e.g. seed-activity-log) — no Electron
  }
  cached = path.join(__dirname, '..');
  return cached;
}

module.exports = { getAppDataDir };
