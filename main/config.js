/**
 * SigPulse main process configuration.
 * Centralizes intervals and feature flags for easier tuning and testing.
 */

/** Screenshot capture interval (ms). */
const CAPTURE_INTERVAL_MS = 5 * 60 * 1000;

/** Active window sampling interval (ms). */
const WINDOW_TRACK_INTERVAL_MS = 10 * 1000;

/** How often we check system idle time (ms). */
const IDLE_CHECK_INTERVAL_MS = 5000;

/** Idle threshold: no mouse/keyboard for this many seconds counts as idle. */
const IDLE_THRESHOLD_SECONDS = 60;

/** After this many seconds continuously idle, show one gentle desktop nudge (per idle episode). */
const IDLE_LONG_NOTIFY_SECONDS = 15 * 60;

/** How often to check if focus score merits encouragement (ms). */
const NUDGE_HIGH_FOCUS_INTERVAL_MS = 30 * 60 * 1000;

/** Encouragement when rounded focus score is at or above this. */
const NUDGE_HIGH_FOCUS_SCORE_MIN = 80;

/** Minimum time between high-focus encouragement toasts (ms). */
const NUDGE_HIGH_FOCUS_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Whether to open DevTools when the window is ready (development). */
const isDev = process.env.NODE_ENV === 'development';

module.exports = {
  CAPTURE_INTERVAL_MS,
  WINDOW_TRACK_INTERVAL_MS,
  IDLE_CHECK_INTERVAL_MS,
  IDLE_THRESHOLD_SECONDS,
  IDLE_LONG_NOTIFY_SECONDS,
  NUDGE_HIGH_FOCUS_INTERVAL_MS,
  NUDGE_HIGH_FOCUS_SCORE_MIN,
  NUDGE_HIGH_FOCUS_COOLDOWN_MS,
  isDev,
};
