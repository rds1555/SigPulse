/**
 * Subtle, non-intrusive desktop notifications (idle reminder, high-focus praise).
 * Respects Settings → gentle nudges toggle and demo mode. Uses silent toasts where supported.
 */

const { Notification } = require('electron');
const config = require('./config');
const demoMode = require('./demo-mode');
const storage = require('./storage');

/**
 * @returns {boolean}
 */
function nudgesAllowed() {
  if (demoMode.isDemoMode()) return false;
  try {
    const s = storage.getSettings();
    return s.gentleNudgesEnabled !== false;
  } catch {
    return true;
  }
}

/**
 * @param {string} title
 * @param {string} body
 */
function showNudge(title, body) {
  if (!nudgesAllowed()) return;
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title: String(title).slice(0, 64),
      body: String(body).slice(0, 256),
      silent: true,
    });
    n.show();
  } catch (err) {
    console.error('[GentleNudges] Notification failed:', err);
  }
}

function notifyIdleExtended() {
  const mins = Math.max(1, Math.floor(config.IDLE_LONG_NOTIFY_SECONDS / 60));
  showNudge(
    'Away for a while',
    `You've been idle for ${mins}+ minutes. We'll keep logging when you're back.`,
  );
}

// --- Periodic high-focus encouragement (lazy-require tracker to avoid circular deps) ---

/** @type {NodeJS.Timeout | null} */
let highFocusTimerId = null;
let highFocusLastShownAt = 0;

function tickHighFocusEncouragement() {
  if (!nudgesAllowed()) return;
  try {
    const tracker = require('./tracker');
    if (!tracker.isTrackingActive()) return;
    const { score } = storage.getFocusScore();
    const rounded = Math.round(score);
    if (rounded < config.NUDGE_HIGH_FOCUS_SCORE_MIN) return;
    const now = Date.now();
    if (now - highFocusLastShownAt < config.NUDGE_HIGH_FOCUS_COOLDOWN_MS) return;
    highFocusLastShownAt = now;
    showNudge('Strong focus', 'Your focus score is high today — nice work staying on track.');
  } catch (err) {
    console.error('[GentleNudges] High-focus tick failed:', err);
  }
}

function startHighFocusWatcher() {
  if (highFocusTimerId) return;
  highFocusTimerId = setInterval(tickHighFocusEncouragement, config.NUDGE_HIGH_FOCUS_INTERVAL_MS);
}

function stopHighFocusWatcher() {
  if (highFocusTimerId) {
    clearInterval(highFocusTimerId);
    highFocusTimerId = null;
  }
}

module.exports = {
  showNudge,
  notifyIdleExtended,
  startHighFocusWatcher,
  stopHighFocusWatcher,
};
