/**
 * Centralized data storage for SigPulse.
 *
 * - Persisted data lives under app.getPath('userData') when packaged, else the project root:
 *   screenshots.json, activity.json, idle.json, settings.json, daily-ai-summary.json,
 *   summary.json, and the screenshots/ directory.
 * - Writes are atomic (write to .tmp then rename) to avoid corruption on crash.
 * - Invalid or missing files are treated as empty (version + entries []).
 */

const fs = require('fs');
const path = require('path');
const { getAppDataDir } = require('./paths');
const demoMode = require('./demo-mode');
const demoData = require('./demo-data');
const activityLog = require('./activity-log');
const summaryModule = require('./summary');

const DATA_VERSION = 1;
const LOG_PREFIX = '[Storage]';

const FILE_NAMES = {
  screenshots: 'screenshots.json',
  activity: 'activity.json',
  idle: 'idle.json',
  settings: 'settings.json',
  aiDailySummary: 'daily-ai-summary.json',
};

const FILES = new Proxy(
  {},
  {
    get(_, prop) {
      const name = FILE_NAMES[prop];
      if (!name) return undefined;
      return path.join(getAppDataDir(), name);
    },
  }
);

/**
 * @param {string} filePath
 * @returns {{ version: number, entries: unknown[] }}
 */
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { version: DATA_VERSION, entries: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.entries)) {
      return { version: DATA_VERSION, entries: [] };
    }
    return { version: data.version ?? DATA_VERSION, entries: [...data.entries] };
  } catch {
    return { version: DATA_VERSION, entries: [] };
  }
}

/**
 * Atomic write: write to .tmp then rename. Preserves original if write/rename fails.
 * @param {string} filePath
 * @param {object} data
 * @throws {Error} On write or rename failure (caller should handle).
 */
function writeJsonFile(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmpPath, json, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        fs.unlinkSync(tmpPath);
      } catch (e) {
        console.error(LOG_PREFIX, 'Failed to remove temp file', tmpPath, e);
      }
    }
    console.error(LOG_PREFIX, 'writeJsonFile failed', filePath, err);
    throw err;
  }
}

/**
 * @returns {string} Absolute path to the screenshots directory.
 */
function getScreenshotsDir() {
  return path.join(getAppDataDir(), 'screenshots');
}

/**
 * Ensure the screenshots directory exists.
 */
function ensureScreenshotsDir() {
  const dir = getScreenshotsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Privacy settings (screenshots toggle, app blacklist) ---

const DEFAULT_SETTINGS = {
  screenshotsEnabled: true,
  appBlacklist: [],
  gentleNudgesEnabled: true,
  /** True until the user finishes the first-run onboarding flow (only for brand-new installs). */
  isFirstLaunch: true,
  /**
   * Dashboard insight sections: rounded panels (classic) or chevron banner rows (banner).
   * @type {'classic' | 'banner'}
   */
  insightsCardStyle: 'classic',
};

/**
 * @typedef {{
 *   screenshotsEnabled: boolean,
 *   appBlacklist: string[],
 *   gentleNudgesEnabled: boolean,
 *   isFirstLaunch: boolean,
 *   insightsCardStyle?: 'classic' | 'banner',
 * }} Settings
 */

/**
 * Returns current privacy settings. Missing/invalid file returns defaults.
 * When `settings.json` already exists but has no `isFirstLaunch` field, treats as false (upgrade from pre-onboarding builds).
 * @returns {Settings}
 */
function getSettings() {
  if (!fs.existsSync(FILES.settings)) {
    return { ...DEFAULT_SETTINGS, appBlacklist: [] };
  }
  try {
    const raw = fs.readFileSync(FILES.settings, 'utf8');
    const data = JSON.parse(raw);
    const isFirstLaunch =
      typeof data.isFirstLaunch === 'boolean'
        ? data.isFirstLaunch
        : false;
    const cardStyle =
      data.insightsCardStyle === 'banner' ? 'banner' : 'classic';
    return {
      screenshotsEnabled: typeof data.screenshotsEnabled === 'boolean' ? data.screenshotsEnabled : DEFAULT_SETTINGS.screenshotsEnabled,
      appBlacklist: Array.isArray(data.appBlacklist)
        ? data.appBlacklist.filter((s) => typeof s === 'string').map((s) => s.trim().toLowerCase()).filter(Boolean)
        : [],
      gentleNudgesEnabled:
        typeof data.gentleNudgesEnabled === 'boolean' ? data.gentleNudgesEnabled : DEFAULT_SETTINGS.gentleNudgesEnabled,
      isFirstLaunch,
      insightsCardStyle: cardStyle,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, appBlacklist: [] };
  }
}

/**
 * Persists privacy settings. appBlacklist can be array of strings (stored normalized).
 * @param {{
 *   screenshotsEnabled?: boolean,
 *   appBlacklist?: string[],
 *   gentleNudgesEnabled?: boolean,
 *   isFirstLaunch?: boolean,
 *   insightsCardStyle?: 'classic' | 'banner',
 * }} next
 */
function setSettings(next) {
  const current = getSettings();
  const screenshotsEnabled = typeof next.screenshotsEnabled === 'boolean' ? next.screenshotsEnabled : current.screenshotsEnabled;
  const appBlacklist = Array.isArray(next.appBlacklist)
    ? next.appBlacklist.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : current.appBlacklist;
  const gentleNudgesEnabled =
    typeof next.gentleNudgesEnabled === 'boolean' ? next.gentleNudgesEnabled : current.gentleNudgesEnabled;
  const isFirstLaunch = typeof next.isFirstLaunch === 'boolean' ? next.isFirstLaunch : current.isFirstLaunch;
  const insightsCardStyle =
    next.insightsCardStyle === 'banner' || next.insightsCardStyle === 'classic'
      ? next.insightsCardStyle
      : current.insightsCardStyle;
  const data = { screenshotsEnabled, appBlacklist, gentleNudgesEnabled, isFirstLaunch, insightsCardStyle };
  writeJsonFile(FILES.settings, data);
}

/**
 * Returns true if the given app name should be excluded from activity log (blacklisted).
 * @param {string} appName
 * @returns {boolean}
 */
function isAppBlacklisted(appName) {
  const settings = getSettings();
  if (!settings.appBlacklist.length || !appName) return false;
  const lower = String(appName).toLowerCase();
  return settings.appBlacklist.some((term) => lower.includes(term) || term.includes(lower));
}

// --- Screenshots metadata ---

/**
 * @typedef { { capturedAt: string, filePath: string, fileName: string } } ScreenshotEntry
 */

/**
 * @returns {{ version: number, entries: ScreenshotEntry[] }}
 */
function getScreenshotsMetadata() {
  if (demoMode.isDemoMode()) return demoData.getDemoScreenshotsMetadata();
  return readJsonFile(FILES.screenshots);
}

/**
 * Appends one screenshot metadata entry. Always writes to real file (ignores demo mode).
 * @param {ScreenshotEntry} entry
 */
function appendScreenshotMetadata(entry) {
  const data = readJsonFile(FILES.screenshots);
  data.entries.push({
    capturedAt: entry.capturedAt,
    filePath: entry.filePath,
    fileName: entry.fileName,
    ...(entry.appName ? { appName: String(entry.appName) } : {}),
  });
  writeJsonFile(FILES.screenshots, data);
}

// --- App usage (activity) logs ---

/**
 * @typedef { { timestamp: string, appName: string, windowTitle: string } } ActivityEntry
 */

/**
 * @returns {{ version: number, entries: ActivityEntry[] }}
 */
function getActivityLog() {
  if (demoMode.isDemoMode()) return demoData.getDemoActivityLog();
  return readJsonFile(FILES.activity);
}

/**
 * @param {ActivityEntry} entry
 */
function appendActivityLog(entry) {
  const data = readJsonFile(FILES.activity);
  data.entries.push({
    timestamp: entry.timestamp,
    appName: entry.appName ?? '',
    windowTitle: entry.windowTitle ?? '',
  });
  writeJsonFile(FILES.activity, data);
}

// --- Idle time logs ---

/**
 * @typedef { { idleStart: string, idleEnd: string } } IdleEntry
 */

/**
 * @returns {{ version: number, entries: IdleEntry[] }}
 */
function getIdleLog() {
  if (demoMode.isDemoMode()) return demoData.getDemoIdleLog();
  return readJsonFile(FILES.idle);
}

/**
 * @param {IdleEntry} entry
 */
function appendIdleLog(entry) {
  const data = readJsonFile(FILES.idle);
  data.entries.push({
    idleStart: entry.idleStart,
    idleEnd: entry.idleEnd,
  });
  writeJsonFile(FILES.idle, data);
}

// --- Activity categorization & summary ---

const CATEGORIES = { CODING: 'Coding', BROWSING: 'Browsing', MEETINGS: 'Meetings', IDLE: 'Idle', OTHER: 'Other' };

const CATEGORY_KEYWORDS = {
  [CATEGORIES.CODING]: ['code', 'intellij', 'webstorm', 'pycharm', 'cursor', 'sublime', 'vim', 'visual studio', 'phpstorm', 'rubymine', 'android studio', 'xcode', 'eclipse', 'netbeans'],
  [CATEGORIES.BROWSING]: ['chrome', 'edge', 'firefox', 'brave', 'safari', 'opera', 'msedge', 'browser'],
  [CATEGORIES.MEETINGS]: ['zoom', 'teams', 'meet', 'gmeet', 'webex', 'slack', 'bluejeans', 'gotomeeting', 'google meet', 'microsoft teams'],
};

const ACTIVITY_SAMPLE_INTERVAL_MS = 10 * 1000; // 10 seconds between activity samples

/**
 * Categorize an app name into Coding, Browsing, Meetings, or Other.
 * @param {string} appName
 * @returns {string} Category key (Coding, Browsing, Meetings, Other)
 */
function categorizeApp(appName) {
  if (!appName || typeof appName !== 'string') return CATEGORIES.OTHER;
  const lower = appName.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return CATEGORIES.OTHER;
}

/**
 * Compute total seconds per category from activity log (using time between consecutive entries).
 * Idle seconds come from idle log.
 * @returns {{ Coding: number, Browsing: number, Meetings: number, Idle: number, Other: number }} Hours per category
 */
function getActivitySummary() {
  const activityData = getActivityLog();
  const idleData = getIdleLog();
  const totalsSec = {
    [CATEGORIES.CODING]: 0,
    [CATEGORIES.BROWSING]: 0,
    [CATEGORIES.MEETINGS]: 0,
    [CATEGORIES.IDLE]: 0,
    [CATEGORIES.OTHER]: 0,
  };

  const entries = activityData.entries;
  for (let i = 0; i < entries.length; i++) {
    const category = categorizeApp(entries[i].appName);
    let durationMs;
    if (i < entries.length - 1) {
      durationMs = new Date(entries[i + 1].timestamp).getTime() - new Date(entries[i].timestamp).getTime();
      if (durationMs < 0) durationMs = ACTIVITY_SAMPLE_INTERVAL_MS;
      if (durationMs > ACTIVITY_SAMPLE_INTERVAL_MS * 2) durationMs = ACTIVITY_SAMPLE_INTERVAL_MS;
    } else {
      durationMs = ACTIVITY_SAMPLE_INTERVAL_MS;
    }
    totalsSec[category] = (totalsSec[category] || 0) + durationMs / 1000;
  }

  for (const entry of idleData.entries) {
    const start = new Date(entry.idleStart).getTime();
    const end = new Date(entry.idleEnd).getTime();
    totalsSec[CATEGORIES.IDLE] += (end - start) / 1000;
  }

  const hours = {};
  for (const [cat, sec] of Object.entries(totalsSec)) {
    hours[cat] = Math.round((sec / 3600) * 100) / 100;
  }
  return hours;
}

/**
 * Write activity summary JSON to file (atomic write).
 * @param {string} [filePath] Optional path; defaults to summary.json in project root.
 */
function writeActivitySummary(filePath) {
  const target = filePath || path.join(getAppDataDir(), 'summary.json');
  const summary = getActivitySummary();
  const data = { generatedAt: new Date().toISOString(), hoursByCategory: summary };
  writeJsonFile(target, data);
}

// --- Focus Score ---

const FOCUS_LABELS = { HIGH: 'High Focus', MEDIUM: 'Medium', LOW: 'Low' };
const SWITCH_RATE_PENALTY = 2; // switches per hour that reduce score by 100 (50/hr -> 0)

/**
 * Calculate Focus Score (0–100) from idle time, app switching frequency, and productive app time.
 * Productive = Coding + Meetings. Less idle and fewer switches increase score.
 * @returns {{ score: number, label: string }}
 */
function getFocusScore() {
  const summary = getActivitySummary();
  const totalHours = Object.values(summary).reduce((a, b) => a + b, 0);

  if (totalHours === 0) {
    return { score: 0, label: FOCUS_LABELS.LOW };
  }

  const idleHours = summary[CATEGORIES.IDLE] || 0;
  const idleRatio = idleHours / totalHours;
  const idleScore = 100 * (1 - idleRatio);

  const productiveHours = (summary[CATEGORIES.CODING] || 0) + (summary[CATEGORIES.MEETINGS] || 0);
  const productiveRatio = productiveHours / totalHours;
  const productiveScore = 100 * productiveRatio;

  const activityData = getActivityLog();
  const entries = activityData.entries;
  let switchCount = 0;
  for (let i = 0; i < entries.length - 1; i++) {
    if (entries[i].appName !== entries[i + 1].appName) switchCount++;
  }
  const switchRatePerHour = switchCount / totalHours;
  const switchScore = Math.max(0, 100 - switchRatePerHour * SWITCH_RATE_PENALTY);

  const rawScore = (idleScore + productiveScore + switchScore) / 3;
  const score = Math.round(Math.max(0, Math.min(100, rawScore)) * 100) / 100;

  let label;
  if (score >= 80) label = FOCUS_LABELS.HIGH;
  else if (score >= 50) label = FOCUS_LABELS.MEDIUM;
  else label = FOCUS_LABELS.LOW;

  return { score, label };
}

/**
 * Local calendar date YYYY-MM-DD for yesterday.
 * @returns {string}
 */
function getYesterdayLocalDateKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return activityLog.formatLocalDate(d);
}

/**
 * Compare today's live focus score with yesterday's stored rollup (activity-log).
 * @returns {{
 *   today: number,
 *   yesterday: number | null,
 *   percentChange: number | null,
 *   direction: 'up' | 'down' | 'same' | null,
 *   noBaseline?: boolean
 * }}
 */
function getFocusScoreYesterdayComparison() {
  const live = getFocusScore();
  const todayRounded = Math.round(live.score);
  const yesterdayKey = getYesterdayLocalDateKey();

  /** @type {number | null} */
  let yesterdayRounded = null;

  if (demoMode.isDemoMode()) {
    const rows = getLastNDaysData(2);
    const yRow = rows.find((r) => r && r.date === yesterdayKey);
    if (yRow && typeof yRow.focus_score === 'number') {
      yesterdayRounded = Math.round(yRow.focus_score);
    }
  } else {
    const sum = activityLog.getDailySummary(yesterdayKey);
    if (sum && typeof sum.focus_score === 'number') {
      yesterdayRounded = Math.round(sum.focus_score);
    }
  }

  if (yesterdayRounded === null) {
    return {
      today: todayRounded,
      yesterday: null,
      percentChange: null,
      direction: null,
    };
  }

  if (yesterdayRounded <= 0) {
    if (todayRounded === 0) {
      return {
        today: todayRounded,
        yesterday: 0,
        percentChange: null,
        direction: 'same',
      };
    }
    return {
      today: todayRounded,
      yesterday: 0,
      percentChange: null,
      direction: 'up',
      noBaseline: true,
    };
  }

  const rawPct = ((todayRounded - yesterdayRounded) / yesterdayRounded) * 100;
  const percentChange = Math.round(rawPct * 10) / 10;
  let direction = /** @type {'up' | 'down' | 'same'} */ ('same');
  if (percentChange > 0.5) direction = 'up';
  else if (percentChange < -0.5) direction = 'down';

  return {
    today: todayRounded,
    yesterday: yesterdayRounded,
    percentChange,
    direction,
  };
}

/**
 * Segment duration i → i+1 in ms (aligned with {@link getActivitySummary}).
 * @param {{ timestamp?: string, appName?: string }[]} entries
 * @param {number} i
 * @returns {number}
 */
function activitySegmentDurationMs(entries, i) {
  if (!entries || i >= entries.length) return 0;
  if (i < entries.length - 1) {
    let durationMs =
      new Date(entries[i + 1].timestamp).getTime() - new Date(entries[i].timestamp).getTime();
    if (durationMs < 0) durationMs = ACTIVITY_SAMPLE_INTERVAL_MS;
    if (durationMs > ACTIVITY_SAMPLE_INTERVAL_MS * 2) durationMs = ACTIVITY_SAMPLE_INTERVAL_MS;
    return durationMs;
  }
  return ACTIVITY_SAMPLE_INTERVAL_MS;
}

/** Switches per hour above this → “frequent context switching” bullet */
const CONTEXT_SWITCH_ELEVATED_PER_HOUR = 14;

/** Minimum total hours (rollup) before share-based idle/productivity flags apply */
const SIGNALS_MIN_TOTAL_HOURS = 0.12;
/** Idle share of total OR absolute idle hours triggers high-idle signal */
const SIGNAL_HIGH_IDLE_SHARE = 0.26;
const SIGNAL_HIGH_IDLE_ABS_HOURS = 2.0;
/** Coding-heavy: coding dominates tracked time */
const SIGNAL_CODING_HEAVY_SHARE = 0.4;
const SIGNAL_CODING_HEAVY_MIN_HOURS = 0.85;
/** Strong productive mix: coding + meetings */
const SIGNAL_PRODUCTIVE_SURGE_SHARE = 0.58;
const SIGNAL_PRODUCTIVE_SURGE_MIN_HOURS = 2.0;

/** UI / JSON insight tags (deterministic, activity-derived) */
const INSIGHT_TAG_DEEP_WORK = 'Deep Work';
const INSIGHT_TAG_DISTRACTION = 'Distraction';
const INSIGHT_TAG_CONTEXT_SWITCHING = 'Context Switching';
/** Browsing-heavy → Distraction tag (alongside idle) */
const SIGNAL_HIGH_BROWSING_SHARE = 0.28;
const SIGNAL_HIGH_BROWSING_ABS_HOURS = 2.0;
const SIGNAL_HIGH_BROWSING_SOFT_MIN_H = 0.75;
/** Deep Work: strong coding without full codingHeavyDay threshold */
const SIGNAL_DEEP_WORK_CODING_SHARE = 0.3;
const SIGNAL_DEEP_WORK_CODING_MIN_H = 1.0;

/**
 * Activity samples for the current local calendar day (same window as insight bullets).
 * @returns {{ timestamp?: string, appName?: string }[]}
 */
function getTodayActivityEntriesRaw() {
  const todayKey = activityLog.formatLocalDate(new Date());
  if (demoMode.isDemoMode()) {
    return (demoData.getDemoActivityLog().entries || []).filter(
      (e) => e && typeof e.timestamp === 'string' && isIsoLocalDateKey(e.timestamp, todayKey),
    );
  }
  const data = readJsonFile(FILES.activity);
  return (data.entries || []).filter(
    (e) => e && typeof e.timestamp === 'string' && isIsoLocalDateKey(e.timestamp, todayKey),
  );
}

/**
 * App switches and sample-tracked hours for today (aligned with insight-bullet switching logic).
 * @param {{ timestamp?: string, appName?: string }[]} entries
 */
function computeSwitchMetricsFromEntries(entries) {
  const list = Array.isArray(entries)
    ? entries.filter((e) => e && typeof e.timestamp === 'string').slice()
    : [];
  list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  if (list.length === 0) {
    return {
      totalTrackedHours: 0,
      switchCount: 0,
      switchesPerHour: null,
      elevatedSwitching: false,
    };
  }
  let totalTrackedSec = 0;
  let switchCount = 0;
  for (let i = 0; i < list.length; i++) {
    totalTrackedSec += activitySegmentDurationMs(list, i) / 1000;
    if (i < list.length - 1) {
      const app = (list[i].appName || '').trim() || 'Unknown';
      const nextApp = (list[i + 1].appName || '').trim() || 'Unknown';
      if (app !== nextApp) switchCount += 1;
    }
  }
  const totalHours = totalTrackedSec / 3600;
  const rate = totalHours >= 0.08 && switchCount > 0 ? switchCount / totalHours : 0;
  const elevatedSwitching = totalHours >= 0.08 && rate >= CONTEXT_SWITCH_ELEVATED_PER_HOUR;
  return {
    totalTrackedHours: Math.round(totalHours * 100) / 100,
    switchCount,
    switchesPerHour: totalHours >= 0.08 ? Math.round(rate * 10) / 10 : null,
    elevatedSwitching,
  };
}

/** Simple behavioral thresholds (distinct from {@link getDailySummaryPreprocessorSignals}). */
const BEHAVIORAL_HIGH_IDLE_HOURS = 1;
const BEHAVIORAL_HIGH_PRODUCTIVITY_CODING_SHARE = 0.6;

/**
 * Boolean behavioral flags from rolled-up hours + today’s activity samples.
 *
 * Rules:
 * - `high_idle_time`: rollup idle hours &gt; {@link BEHAVIORAL_HIGH_IDLE_HOURS}
 * - `high_productivity`: coding / total rollup hours ≥ {@link BEHAVIORAL_HIGH_PRODUCTIVITY_CODING_SHARE} (0 if no tracked total)
 * - `frequent_context_switching`: same as sample-based “elevated” switching ({@link CONTEXT_SWITCH_ELEVATED_PER_HOUR} switches/hour)
 *
 * @typedef {{ high_idle_time: boolean, high_productivity: boolean, frequent_context_switching: boolean }} BehavioralSignals
 * @param {{ Coding?: number, Browsing?: number, Meetings?: number, Idle?: number, Other?: number }} activitySummaryHours From {@link getActivitySummary}
 * @returns {BehavioralSignals}
 */
function getBehavioralSignalsFromActivity(activitySummaryHours) {
  const s = activitySummaryHours && typeof activitySummaryHours === 'object' ? activitySummaryHours : {};
  const coding = typeof s.Coding === 'number' ? s.Coding : 0;
  const meeting = typeof s.Meetings === 'number' ? s.Meetings : 0;
  const idle = typeof s.Idle === 'number' ? s.Idle : 0;
  const browsing = typeof s.Browsing === 'number' ? s.Browsing : 0;
  const other = typeof s.Other === 'number' ? s.Other : 0;
  const total = coding + meeting + idle + browsing + other;

  const high_idle_time = idle > BEHAVIORAL_HIGH_IDLE_HOURS;

  const codingShare = total > 0 ? coding / total : 0;
  const high_productivity = total > 0 && codingShare >= BEHAVIORAL_HIGH_PRODUCTIVITY_CODING_SHARE;

  const switchM = computeSwitchMetricsFromEntries(getTodayActivityEntriesRaw());
  const frequent_context_switching = switchM.elevatedSwitching;

  return {
    high_idle_time,
    high_productivity,
    frequent_context_switching,
  };
}

/**
 * Deterministic pre-AI signals: idle load, coding-heavy / productive mix, app switching.
 * Passed to the LLM to ground structured JSON insights (same data as dashboard rollups + today’s samples).
 * @param {{ Coding?: number, Browsing?: number, Meetings?: number, Idle?: number, Other?: number }} activitySummaryHours
 * @returns {Record<string, unknown>}
 */
function getDailySummaryPreprocessorSignals(activitySummaryHours) {
  const s = activitySummaryHours && typeof activitySummaryHours === 'object' ? activitySummaryHours : {};
  const coding = typeof s.Coding === 'number' ? s.Coding : 0;
  const meeting = typeof s.Meetings === 'number' ? s.Meetings : 0;
  const idle = typeof s.Idle === 'number' ? s.Idle : 0;
  const browsing = typeof s.Browsing === 'number' ? s.Browsing : 0;
  const other = typeof s.Other === 'number' ? s.Other : 0;
  const total = coding + meeting + idle + browsing + other;
  const productiveH = coding + meeting;

  const entries = getTodayActivityEntriesRaw();
  const switchM = computeSwitchMetricsFromEntries(entries);

  const idleShare = total >= SIGNALS_MIN_TOTAL_HOURS ? idle / total : null;
  const codingShare = total >= SIGNALS_MIN_TOTAL_HOURS ? coding / total : null;
  const productiveShare = total >= SIGNALS_MIN_TOTAL_HOURS ? productiveH / total : null;

  const highIdleTime =
    total >= SIGNALS_MIN_TOTAL_HOURS &&
    (idleShare >= SIGNAL_HIGH_IDLE_SHARE || idle >= SIGNAL_HIGH_IDLE_ABS_HOURS);

  const codingHeavyDay =
    total >= SIGNALS_MIN_TOTAL_HOURS &&
    codingShare >= SIGNAL_CODING_HEAVY_SHARE &&
    coding >= SIGNAL_CODING_HEAVY_MIN_HOURS;

  const highProductivityMix =
    total >= SIGNALS_MIN_TOTAL_HOURS &&
    productiveShare >= SIGNAL_PRODUCTIVE_SURGE_SHARE &&
    productiveH >= SIGNAL_PRODUCTIVE_SURGE_MIN_HOURS;

  const browsingShare = total >= SIGNALS_MIN_TOTAL_HOURS ? browsing / total : null;
  const highBrowsingDistraction =
    total >= SIGNALS_MIN_TOTAL_HOURS &&
    (browsing >= SIGNAL_HIGH_BROWSING_ABS_HOURS ||
      (browsingShare >= SIGNAL_HIGH_BROWSING_SHARE && browsing >= SIGNAL_HIGH_BROWSING_SOFT_MIN_H));

  const deepWorkTag =
    codingHeavyDay ||
    (total >= SIGNALS_MIN_TOTAL_HOURS &&
      coding >= SIGNAL_DEEP_WORK_CODING_MIN_H &&
      codingShare != null &&
      codingShare >= SIGNAL_DEEP_WORK_CODING_SHARE);

  const distractionTag = highIdleTime || highBrowsingDistraction;

  /** @type {string[]} */
  const insightTags = [];
  if (deepWorkTag) insightTags.push(INSIGHT_TAG_DEEP_WORK);
  if (distractionTag) insightTags.push(INSIGHT_TAG_DISTRACTION);
  if (switchM.elevatedSwitching) insightTags.push(INSIGHT_TAG_CONTEXT_SWITCHING);

  return {
    preprocessedSignalsVersion: 1,
    insufficientSampleForRollup: total < SIGNALS_MIN_TOTAL_HOURS,
    totalTrackedHoursRollup: Math.round(total * 100) / 100,
    idleHours: Math.round(idle * 100) / 100,
    idleShareOfTotal: idleShare != null ? Math.round(idleShare * 1000) / 1000 : null,
    highIdleTime,
    codingHours: Math.round(coding * 100) / 100,
    codingShareOfTotal: codingShare != null ? Math.round(codingShare * 1000) / 1000 : null,
    codingHeavyDay,
    productiveHours: Math.round(productiveH * 100) / 100,
    productiveShareOfTotal: productiveShare != null ? Math.round(productiveShare * 1000) / 1000 : null,
    highProductivityMix,
    frequentAppSwitching: switchM.elevatedSwitching,
    appSwitchCountToday: switchM.switchCount,
    appSwitchesPerSampleHour: switchM.switchesPerHour,
    activitySampleTrackedHours: switchM.totalTrackedHours,
    highBrowsingDistraction,
    browsingHours: Math.round(browsing * 100) / 100,
    browsingShareOfTotal: browsingShare != null ? Math.round(browsingShare * 1000) / 1000 : null,
    insightTags,
  };
}

/**
 * Build human-readable bullets from activity entries (typically one local calendar day).
 * @param {{ timestamp?: string, appName?: string }[]} entries
 * @returns {string[]}
 */
function computeInsightBulletsFromEntries(entries) {
  const bullets = [];
  const list = Array.isArray(entries)
    ? entries.filter((e) => e && typeof e.timestamp === 'string').slice()
    : [];
  list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (list.length === 0) {
    return ['No activity samples for today yet — insights will appear after tracking runs.'];
  }

  let totalTrackedSec = 0;
  for (let i = 0; i < list.length; i++) {
    totalTrackedSec += activitySegmentDurationMs(list, i) / 1000;
  }
  const totalHours = totalTrackedSec / 3600;

  const productiveSecByHour = new Array(24).fill(0);
  /** @type {Record<string, number>} */
  const appSec = {};
  let switchCount = 0;
  let maxStreakMs = 0;
  let maxStreakApp = '';
  let streakMs = 0;
  let streakApp = (list[0].appName || '').trim() || 'Unknown';

  for (let i = 0; i < list.length; i++) {
    const durationMs = activitySegmentDurationMs(list, i);
    const app = (list[i].appName || '').trim() || 'Unknown';
    const cat = categorizeApp(list[i].appName);
    const productive = cat === CATEGORIES.CODING || cat === CATEGORIES.MEETINGS;

    if (productive) {
      const d = new Date(list[i].timestamp);
      if (!Number.isNaN(d.getTime())) {
        const h = d.getHours();
        productiveSecByHour[h] += durationMs / 1000;
      }
    }

    appSec[app] = (appSec[app] || 0) + durationMs / 1000;

    if (i < list.length - 1) {
      const nextApp = (list[i + 1].appName || '').trim() || 'Unknown';
      if (app !== nextApp) switchCount += 1;
    }

    if (app === streakApp) {
      streakMs += durationMs;
    } else {
      if (streakMs > maxStreakMs) {
        maxStreakMs = streakMs;
        maxStreakApp = streakApp;
      }
      streakApp = app;
      streakMs = durationMs;
    }
  }
  if (streakMs > maxStreakMs) {
    maxStreakMs = streakMs;
    maxStreakApp = streakApp;
  }

  let bestHour = -1;
  let bestProd = 0;
  for (let h = 0; h < 24; h++) {
    if (productiveSecByHour[h] > bestProd) {
      bestProd = productiveSecByHour[h];
      bestHour = h;
    }
  }
  const MIN_PRODUCTIVE_SEC = 2 * 60;
  if (bestHour >= 0 && bestProd >= MIN_PRODUCTIVE_SEC) {
    const dStart = new Date();
    dStart.setHours(bestHour, 0, 0, 0);
    const dEnd = new Date();
    dEnd.setHours((bestHour + 1) % 24, 0, 0, 0);
    const timeOpt = { hour: 'numeric', minute: '2-digit' };
    const rangeLabel = `${dStart.toLocaleTimeString(undefined, timeOpt)} – ${dEnd.toLocaleTimeString(undefined, timeOpt)}`;
    bullets.push(`Most productive time of day: ${rangeLabel} (coding + meetings).`);
  } else if (totalTrackedSec >= 120) {
    bullets.push(
      'Most productive time of day: no single hour stood out with enough coding or meeting time.',
    );
  }

  let topApp = '';
  let topSec = 0;
  for (const [name, sec] of Object.entries(appSec)) {
    if (sec > topSec) {
      topSec = sec;
      topApp = name;
    }
  }
  if (topApp && topSec >= 45) {
    const mins = Math.round(topSec / 60);
    const hrs = topSec / 3600;
    const timeStr = hrs >= 1 ? `${hrs.toFixed(1)}h` : `${mins} min`;
    bullets.push(`Most used application: ${topApp} (~${timeStr} active).`);
  }

  if (maxStreakMs >= 60 * 1000 && maxStreakApp) {
    const mins = Math.round(maxStreakMs / 60000);
    const hrs = maxStreakMs / 3600000;
    const durStr = hrs >= 1 ? `${hrs.toFixed(1)} hours` : `${mins} minutes`;
    bullets.push(`Longest focus streak: ~${durStr} without switching away from ${maxStreakApp}.`);
  }

  if (totalHours >= 0.08 && switchCount > 0) {
    const rate = switchCount / totalHours;
    if (rate >= CONTEXT_SWITCH_ELEVATED_PER_HOUR) {
      bullets.push(
        `Frequent context switching: about ${Math.round(rate)} app changes per tracked hour (${switchCount} switches today).`,
      );
    }
  }

  if (bullets.length === 0) {
    bullets.push('Keep tracking to unlock day-level insights (time of day, apps, streaks, and switching).');
  }

  return bullets;
}

/**
 * Data-driven insight bullets for today from the activity log (local calendar day).
 * @returns {string[]}
 */
function getActivityInsightBullets() {
  return computeInsightBulletsFromEntries(getTodayActivityEntriesRaw());
}

// --- Cached daily AI summary (Insights / dashboard) ---

/**
 * Refresh activity-derived insight tags on read so the UI matches current tracking
 * even when the cached JSON was saved before tags existed.
 * @param {object | null} structured
 * @returns {object | null}
 */
function attachInsightTagsToStructured(structured) {
  if (!structured || typeof structured !== 'object') return structured;
  try {
    const { insightTags } = getDailySummaryPreprocessorSignals(getActivitySummary());
    return {
      ...structured,
      tags: summaryModule.normalizeInsightTags(insightTags),
    };
  } catch {
    return structured;
  }
}

/**
 * @returns {{ text: string, generatedAt: string | null, structured: object | null }} structured is parsed daily JSON insight when `text` is stored JSON.
 */
function getDailyAiSummary() {
  if (demoMode.isDemoMode()) {
    const d = demoData.getDemoDailyAiSummary();
    const text = typeof d.text === 'string' ? d.text.trim() : '';
    const structuredRaw =
      d.structured && typeof d.structured === 'object'
        ? summaryModule.normalizeDailyStructured(d.structured)
        : summaryModule.tryParseDailyStructuredFromText(text);
    const structured = attachInsightTagsToStructured(structuredRaw);
    return { text, generatedAt: d.generatedAt, structured };
  }
  if (!fs.existsSync(FILES.aiDailySummary)) {
    return { text: '', generatedAt: null, structured: null };
  }
  try {
    const raw = fs.readFileSync(FILES.aiDailySummary, 'utf8');
    const data = JSON.parse(raw);
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    const generatedAt = typeof data.generatedAt === 'string' ? data.generatedAt : null;
    const structured = attachInsightTagsToStructured(summaryModule.tryParseDailyStructuredFromText(text));
    return { text, generatedAt, structured };
  } catch {
    return { text: '', generatedAt: null, structured: null };
  }
}

/**
 * True if ISO timestamp is the same local calendar day as dateKey (YYYY-MM-DD).
 * @param {string | null} isoString
 * @param {string} dateKey
 * @returns {boolean}
 */
function isIsoLocalDateKey(isoString, dateKey) {
  if (!isoString || typeof isoString !== 'string' || !dateKey) return false;
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return false;
  return activityLog.formatLocalDate(d) === dateKey;
}

/**
 * Stored daily AI summary for today if present: prefers activity-log `summary_text`,
 * else `daily-ai-summary.json` when `generatedAt` is today's local date.
 * Call {@link syncTodayActivityLog} first so today's rollup exists.
 * @returns {{ text: string, generatedAt: string | null, structured: object | null } | null}
 */
function getTodaysStoredDailySummary() {
  if (demoMode.isDemoMode()) {
    const { text, generatedAt, structured } = getDailyAiSummary();
    return text ? { text, generatedAt, structured } : null;
  }
  const todayKey = activityLog.formatLocalDate(new Date());
  const rollup = activityLog.getDailySummary(todayKey);
  const fromLog = rollup?.summary_text && String(rollup.summary_text).trim();
  if (fromLog) {
    const ai = getDailyAiSummary();
    const genAt = ai.text && ai.text.trim() === fromLog ? ai.generatedAt : null;
    const structured = attachInsightTagsToStructured(summaryModule.tryParseDailyStructuredFromText(fromLog));
    return { text: fromLog, generatedAt: genAt, structured };
  }
  const ai = getDailyAiSummary();
  if (ai.text && isIsoLocalDateKey(ai.generatedAt, todayKey)) {
    return { text: ai.text, generatedAt: ai.generatedAt, structured: ai.structured };
  }
  return null;
}

/**
 * Persist last successful AI daily summary (skipped in demo mode).
 * Also merges summary_text into today's row in activity-log.json after syncing metrics.
 * @param {string} text
 */
function saveDailyAiSummary(text) {
  if (demoMode.isDemoMode()) return;
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return;
  syncTodayActivityLog();
  writeJsonFile(FILES.aiDailySummary, {
    version: DATA_VERSION,
    text: t,
    generatedAt: new Date().toISOString(),
  });
  const date = activityLog.formatLocalDate(new Date());
  activityLog.saveDailySummary(date, { summary_text: t });
}

// --- Delete today's data ---

/**
 * True if the ISO timestamp falls on today (local date).
 * @param {string} isoString
 * @returns {boolean}
 */
function isToday(isoString) {
  const d = new Date(isoString);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/**
 * Remove all entries dated today from all store files and delete today's screenshot PNGs.
 * Always operates on real files (ignores demo mode).
 */
function deleteTodayData() {
  const screenshotsData = readJsonFile(FILES.screenshots);
  const todayScreenshotFiles = [];
  screenshotsData.entries = screenshotsData.entries.filter((entry) => {
    const keep = !isToday(entry.capturedAt);
    if (!keep) todayScreenshotFiles.push(entry.fileName);
    return keep;
  });
  writeJsonFile(FILES.screenshots, screenshotsData);
  for (const fileName of todayScreenshotFiles) {
    const fullPath = path.join(getScreenshotsDir(), fileName);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (err) {
        console.error('Could not delete screenshot:', fullPath, err);
      }
    }
  }

  const activityData = readJsonFile(FILES.activity);
  activityData.entries = activityData.entries.filter((entry) => !isToday(entry.timestamp));
  writeJsonFile(FILES.activity, activityData);

  const idleData = readJsonFile(FILES.idle);
  idleData.entries = idleData.entries.filter(
    (entry) => !isToday(entry.idleStart) && !isToday(entry.idleEnd)
  );
  writeJsonFile(FILES.idle, idleData);

  if (fs.existsSync(FILES.aiDailySummary)) {
    try {
      fs.unlinkSync(FILES.aiDailySummary);
    } catch (err) {
      console.error(LOG_PREFIX, 'Could not delete daily AI summary file', err);
    }
  }

  activityLog.removeDailySummary(activityLog.formatLocalDate(new Date()));
}

// --- Date-wise activity log (activity-log.json) ---

/**
 * Build rollup payload from current activity + idle logs and focus score.
 * Does not set summary_text; merges in activity-log preserve existing summary_text.
 * @returns {{ coding_hours: number, browsing_hours: number, meeting_hours: number, idle_hours: number, focus_score: number }}
 */
function buildDailyRollupPayload() {
  const summary = getActivitySummary();
  const focus = getFocusScore();
  return {
    coding_hours: summary[CATEGORIES.CODING] ?? 0,
    browsing_hours: summary[CATEGORIES.BROWSING] ?? 0,
    meeting_hours: summary[CATEGORIES.MEETINGS] ?? 0,
    idle_hours: summary[CATEGORIES.IDLE] ?? 0,
    focus_score: Math.round(focus.score),
  };
}

/**
 * Persist or merge one calendar day's metrics. Skipped in demo mode.
 * @param {string} date YYYY-MM-DD
 * @param {Record<string, unknown>} data
 */
function saveDailySummary(date, data) {
  if (demoMode.isDemoMode()) return;
  activityLog.saveDailySummary(date, data);
}

/**
 * Read one day's stored rollup. In demo mode, today's row is computed from demo logs.
 * @param {string} date YYYY-MM-DD
 * @returns {{ coding_hours: number, browsing_hours: number, meeting_hours: number, idle_hours: number, focus_score: number, summary_text: string } | null}
 */
function getDailySummary(date) {
  if (demoMode.isDemoMode()) {
    const todayKey = activityLog.formatLocalDate(new Date());
    if (date === todayKey) {
      return activityLog.normalizeDayData(buildDailyRollupPayload());
    }
    return null;
  }
  return activityLog.getDailySummary(date);
}

/**
 * Last N local calendar days ending today, newest first. Missing days use zeros.
 * @param {number} n
 */
function getLastNDaysData(n) {
  if (demoMode.isDemoMode()) {
    const todayKey = activityLog.formatLocalDate(new Date());
    const todayPayload = activityLog.normalizeDayData(buildDailyRollupPayload());
    const synthetic = demoData.getSampleActivityHistoryLastNDays(n);
    return synthetic.map((row) =>
      row.date === todayKey ? { date: row.date, ...todayPayload } : row,
    );
  }
  return activityLog.getLastNDaysData(n);
}

/**
 * Update today's entry in activity-log.json from current logs (merge). No-op in demo mode.
 */
function syncTodayActivityLog() {
  if (demoMode.isDemoMode()) return;
  const date = activityLog.formatLocalDate(new Date());
  activityLog.saveDailySummary(date, buildDailyRollupPayload());
}

module.exports = {
  getScreenshotsDir,
  ensureScreenshotsDir,
  getScreenshotsMetadata,
  appendScreenshotMetadata,
  getActivityLog,
  appendActivityLog,
  getIdleLog,
  appendIdleLog,
  getSettings,
  setSettings,
  isAppBlacklisted,
  categorizeApp,
  getActivitySummary,
  writeActivitySummary,
  getFocusScore,
  getFocusScoreYesterdayComparison,
  getActivityInsightBullets,
  getDailySummaryPreprocessorSignals,
  getBehavioralSignalsFromActivity,
  getDailyAiSummary,
  getTodaysStoredDailySummary,
  saveDailyAiSummary,
  deleteTodayData,
  saveDailySummary,
  getDailySummary,
  getLastNDaysData,
  syncTodayActivityLog,
};
