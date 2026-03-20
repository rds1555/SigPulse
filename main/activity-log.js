/**
 * Date-keyed activity rollup persistence (activity-log.json).
 * Keys are YYYY-MM-DD; values hold coding/browsing/meeting/idle hours, focus_score,
 * and optional summary_text (AI daily summary for that date).
 * Atomic writes; safe when file is missing or corrupt.
 */

const fs = require('fs');
const path = require('path');
const { getAppDataDir } = require('./paths');

const LOG_PREFIX = '[ActivityLog]';

function getActivityLogPath() {
  return path.join(getAppDataDir(), 'activity-log.json');
}
const SCHEMA_VERSION = 2;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} key
 * @returns {boolean}
 */
function isDateKey(key) {
  return typeof key === 'string' && DATE_KEY_RE.test(key);
}

/**
 * @returns {Record<string, unknown>}
 */
function loadRaw() {
  const logPath = getActivityLogPath();
  if (!fs.existsSync(logPath)) {
    return { version: SCHEMA_VERSION };
  }
  try {
    const raw = fs.readFileSync(logPath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { version: SCHEMA_VERSION };
    }
    return { ...data };
  } catch (err) {
    console.error(LOG_PREFIX, 'Failed to read activity-log.json, starting fresh', err);
    return { version: SCHEMA_VERSION };
  }
}

/**
 * @param {Record<string, unknown>} data
 */
function writeAtomic(data) {
  const logPath = getActivityLogPath();
  const tmpPath = `${logPath}.tmp`;
  const payload = { ...data, version: SCHEMA_VERSION };
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tmpPath, logPath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch (e) {
        console.error(LOG_PREFIX, 'Failed to remove temp file', e);
      }
    }
    console.error(LOG_PREFIX, 'writeAtomic failed', err);
    throw err;
  }
}

/**
 * @param {unknown} n
 * @returns {number}
 */
function toHours(n) {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x * 100) / 100;
}

/**
 * @param {unknown} n
 * @returns {number}
 */
function toFocusScore(n) {
  const x = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(Math.max(0, Math.min(100, x)));
}

/**
 * @param {unknown} s
 * @returns {string}
 */
function toSummaryText(s) {
  return typeof s === 'string' ? s.trim() : '';
}

/**
 * Normalize stored day payload to the canonical shape (read path / display).
 * @param {Record<string, unknown>} data
 * @returns {{ coding_hours: number, browsing_hours: number, meeting_hours: number, idle_hours: number, focus_score: number, summary_text: string }}
 */
function normalizeDayData(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    coding_hours: toHours(d.coding_hours),
    browsing_hours: toHours(d.browsing_hours),
    meeting_hours: toHours(d.meeting_hours),
    idle_hours: toHours(d.idle_hours),
    focus_score: toFocusScore(d.focus_score),
    summary_text: toSummaryText(d.summary_text),
  };
}

/**
 * Local calendar date YYYY-MM-DD.
 * @param {Date} d
 * @returns {string}
 */
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Validate YYYY-MM-DD.
 * @param {string} date
 * @returns {boolean}
 */
function isValidDateKey(date) {
  return typeof date === 'string' && DATE_KEY_RE.test(date);
}

/**
 * Merge or create one day; other date keys are preserved.
 * Numeric fields default from previous row when omitted; summary_text is only updated when `summary_text` is present in `data`.
 * @param {string} date YYYY-MM-DD
 * @param {Record<string, unknown>} data
 */
function saveDailySummary(date, data) {
  if (!isValidDateKey(date)) {
    throw new Error(`Invalid date key: ${date}`);
  }
  const raw = loadRaw();
  const prev = raw[date] && typeof raw[date] === 'object' && !Array.isArray(raw[date]) ? raw[date] : {};
  const prevNorm = normalizeDayData(prev);
  const inc = data && typeof data === 'object' ? data : {};
  const merged = {
    coding_hours: toHours('coding_hours' in inc ? inc.coding_hours : prevNorm.coding_hours),
    browsing_hours: toHours('browsing_hours' in inc ? inc.browsing_hours : prevNorm.browsing_hours),
    meeting_hours: toHours('meeting_hours' in inc ? inc.meeting_hours : prevNorm.meeting_hours),
    idle_hours: toHours('idle_hours' in inc ? inc.idle_hours : prevNorm.idle_hours),
    focus_score: toFocusScore('focus_score' in inc ? inc.focus_score : prevNorm.focus_score),
    summary_text: 'summary_text' in inc ? toSummaryText(inc.summary_text) : prevNorm.summary_text,
  };
  raw[date] = merged;
  writeAtomic(raw);
}

/**
 * @param {string} date YYYY-MM-DD
 * @returns {{ coding_hours: number, browsing_hours: number, meeting_hours: number, idle_hours: number, focus_score: number, summary_text: string } | null}
 */
function getDailySummary(date) {
  if (!isValidDateKey(date)) return null;
  const raw = loadRaw();
  const entry = raw[date];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  return normalizeDayData(/** @type {Record<string, unknown>} */ (entry));
}

/**
 * @param {string} date YYYY-MM-DD
 */
function removeDailySummary(date) {
  if (!isValidDateKey(date)) return;
  const raw = loadRaw();
  if (!(date in raw)) return;
  delete raw[date];
  writeAtomic(raw);
}

const EMPTY_DAY = () => ({
  coding_hours: 0,
  browsing_hours: 0,
  meeting_hours: 0,
  idle_hours: 0,
  focus_score: 0,
  summary_text: '',
});

/**
 * Last N calendar days ending today (local), newest first.
 * Days not yet stored use zeroed metrics (stable shape for charts).
 * @param {number} n
 * @returns {Array<{ date: string, coding_hours: number, browsing_hours: number, meeting_hours: number, idle_hours: number, focus_score: number, summary_text: string }>}
 */
function getLastNDaysData(n) {
  const count = typeof n === 'number' && n > 0 ? Math.min(Math.floor(n), 366) : 0;
  if (count === 0) return [];

  const raw = loadRaw();
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = formatLocalDate(d);
    const entry = raw[key];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      out.push({
        date: key,
        ...normalizeDayData(/** @type {Record<string, unknown>} */ (entry)),
      });
    } else {
      out.push({ date: key, ...EMPTY_DAY() });
    }
  }
  return out;
}

module.exports = {
  getActivityLogPath,
  formatLocalDate,
  isValidDateKey,
  saveDailySummary,
  getDailySummary,
  getLastNDaysData,
  removeDailySummary,
  normalizeDayData,
};
