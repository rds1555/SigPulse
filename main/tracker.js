/**
 * Tracking module: screenshots, active window, and idle detection.
 * All intervals and state are encapsulated here; start/stop/pause/resume
 * are the only public API.
 */

const path = require('path');
const screenshot = require('screenshot-desktop');
const config = require('./config');
const storage = require('./storage');

// ---------------------------------------------------------------------------
// Interval handles (cleared on stop/pause)
// ---------------------------------------------------------------------------

/** @type {NodeJS.Timeout | null} */
let captureIntervalId = null;

/** @type {NodeJS.Timeout | null} */
let windowTrackIntervalId = null;

/** @type {NodeJS.Timeout | null} */
let idleCheckIntervalId = null;

/** Tracks whether we're currently in an idle period (for logging end time). */
const idleState = { isIdle: false, idleStartTime: null, longIdleNotified: false };

/** True between startAll() and stopAll() — used for gentle nudges and focus checks. */
let trackingActive = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a filename-safe timestamp string (YYYY-MM-DD_HH-mm-ss). */
function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Screenshot capture
// ---------------------------------------------------------------------------

/**
 * Captures one screenshot, saves to disk, and appends metadata to storage.
 * Skips entirely if user has disabled screenshots in settings. Failures are logged.
 */
function captureScreenshot() {
  try {
    const settings = storage.getSettings();
    if (!settings.screenshotsEnabled) return Promise.resolve();
  } catch (err) {
    console.error('[Tracker] Screenshot: failed to read settings', err);
    return Promise.resolve();
  }

  try {
    storage.ensureScreenshotsDir();
  } catch (err) {
    console.error('[Tracker] Screenshot: failed to ensure dir', err);
    return Promise.resolve();
  }

  const fileName = `${timestamp()}.png`;
  const filePath = path.join(storage.getScreenshotsDir(), fileName);
  const capturedAt = new Date().toISOString();

  return screenshot({ filename: filePath, format: 'png' })
    .then(async () => {
      let appName = '';
      try {
        const { activeWindow } = await import('active-win');
        const win = await activeWindow();
        appName = win?.owner?.name ?? '';
        if (storage.isAppBlacklisted(appName)) {
          appName = '';
        }
      } catch {
        /* overlay can stay empty */
      }
      try {
        storage.appendScreenshotMetadata({
          capturedAt,
          filePath: `screenshots/${fileName}`,
          fileName,
          ...(appName ? { appName } : {}),
        });
      } catch (err) {
        console.error('[Tracker] Screenshot: failed to append metadata', err);
      }
      return filePath;
    })
    .catch((err) => {
      console.error('[Tracker] Screenshot capture failed:', err);
    });
}

function startScreenshotCapture() {
  if (captureIntervalId) return;
  captureScreenshot();
  captureIntervalId = setInterval(captureScreenshot, config.CAPTURE_INTERVAL_MS);
}

function stopScreenshotCapture() {
  if (captureIntervalId) {
    clearInterval(captureIntervalId);
    captureIntervalId = null;
  }
}

// ---------------------------------------------------------------------------
// Active window tracking
// ---------------------------------------------------------------------------

/**
 * Records the current active window to storage (async, fire-and-forget).
 * Skips logging if the app is in the privacy blacklist. Errors are logged.
 */
function recordActiveWindow() {
  (async () => {
    try {
      const { activeWindow } = await import('active-win');
      const win = await activeWindow();
      const appName = win?.owner?.name ?? '';
      if (storage.isAppBlacklisted(appName)) return;
      storage.appendActivityLog({
        timestamp: new Date().toISOString(),
        appName,
        windowTitle: win?.title ?? '',
      });
    } catch (err) {
      console.error('[Tracker] Active window record failed:', err);
    }
  })();
}

function startWindowTracking() {
  if (windowTrackIntervalId) return;
  recordActiveWindow();
  windowTrackIntervalId = setInterval(recordActiveWindow, config.WINDOW_TRACK_INTERVAL_MS);
}

function stopWindowTracking() {
  if (windowTrackIntervalId) {
    clearInterval(windowTrackIntervalId);
    windowTrackIntervalId = null;
  }
}

// ---------------------------------------------------------------------------
// Idle detection (powerMonitor)
// ---------------------------------------------------------------------------

function appendIdleRecord(idleStart, idleEnd) {
  try {
    storage.appendIdleLog({ idleStart, idleEnd });
  } catch (err) {
    console.error('[Tracker] Idle record append failed:', err);
  }
}

function checkIdle() {
  try {
    const { powerMonitor } = require('electron');
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const now = new Date();

    if (idleSeconds >= config.IDLE_THRESHOLD_SECONDS) {
      if (!idleState.isIdle) {
        idleState.isIdle = true;
        idleState.idleStartTime = new Date(now.getTime() - idleSeconds * 1000);
        idleState.longIdleNotified = false;
      } else if (idleState.idleStartTime && !idleState.longIdleNotified) {
        const idleMs = now.getTime() - idleState.idleStartTime.getTime();
        const longMs = config.IDLE_LONG_NOTIFY_SECONDS * 1000;
        if (idleMs >= longMs) {
          idleState.longIdleNotified = true;
          try {
            require('./gentle-nudges').notifyIdleExtended();
          } catch (err) {
            console.error('[Tracker] Idle nudge failed:', err);
          }
        }
      }
    } else {
      if (idleState.isIdle && idleState.idleStartTime) {
        appendIdleRecord(idleState.idleStartTime.toISOString(), now.toISOString());
        idleState.isIdle = false;
        idleState.idleStartTime = null;
        idleState.longIdleNotified = false;
      }
    }
  } catch (err) {
    console.error('[Tracker] Idle check failed:', err);
  }
}

function startIdleTracking() {
  if (idleCheckIntervalId) return;
  idleState.isIdle = false;
  idleState.idleStartTime = null;
  idleState.longIdleNotified = false;
  checkIdle();
  idleCheckIntervalId = setInterval(checkIdle, config.IDLE_CHECK_INTERVAL_MS);
}

function stopIdleTracking() {
  if (idleCheckIntervalId) {
    clearInterval(idleCheckIntervalId);
    idleCheckIntervalId = null;
  }
  if (idleState.isIdle && idleState.idleStartTime) {
    appendIdleRecord(idleState.idleStartTime.toISOString(), new Date().toISOString());
    idleState.isIdle = false;
    idleState.idleStartTime = null;
    idleState.longIdleNotified = false;
  }
}

// ---------------------------------------------------------------------------
// Public API: start/stop/pause/resume (all three subsystems)
// ---------------------------------------------------------------------------

function startAll() {
  trackingActive = true;
  startScreenshotCapture();
  startWindowTracking();
  startIdleTracking();
}

function stopAll() {
  trackingActive = false;
  stopScreenshotCapture();
  stopWindowTracking();
  stopIdleTracking();
}

function isTrackingActive() {
  return trackingActive;
}

module.exports = {
  startAll,
  stopAll,
  isTrackingActive,
};
