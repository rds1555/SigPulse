/**
 * Preloaded sample data for demo mode (presentation).
 * Produces a realistic activity summary and focus score without touching real files.
 */

const DATA_VERSION = 1;

/** Base "today" for demo timestamps (local date, morning start). */
function getTodayStart() {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

/** Local calendar date YYYY-MM-DD (same convention as activity-log). */
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Five varied daily rollups for weekly-style charts (offset 0 = today, 1 = yesterday, …).
 * Totals differ per “day” so bars are easy to distinguish when testing.
 */
const SAMPLE_LAST_5_DAY_ROLLUPS = [
  { coding_hours: 5.2, browsing_hours: 1.1, meeting_hours: 0.8, idle_hours: 0.45, focus_score: 82, summary_text: '' },
  { coding_hours: 3.8, browsing_hours: 2.0, meeting_hours: 1.5, idle_hours: 0.65, focus_score: 71, summary_text: '' },
  { coding_hours: 4.5, browsing_hours: 1.4, meeting_hours: 2.0, idle_hours: 0.35, focus_score: 68, summary_text: '' },
  { coding_hours: 6.0, browsing_hours: 0.9, meeting_hours: 0.5, idle_hours: 0.5, focus_score: 88, summary_text: '' },
  { coding_hours: 2.5, browsing_hours: 2.8, meeting_hours: 1.2, idle_hours: 1.1, focus_score: 55, summary_text: '' },
];

/**
 * Sample activity-log rows for the last N calendar days (newest first), for demo mode / dev seeding.
 * @param {number} n
 * @returns {Array<{ date: string, coding_hours: number, browsing_hours: number, meeting_hours: number, idle_hours: number, focus_score: number, summary_text: string }>}
 */
function getSampleActivityHistoryLastNDays(n) {
  const count = typeof n === 'number' && n > 0 ? Math.min(Math.floor(n), 366) : 0;
  if (count === 0) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = formatLocalDate(d);
    const pattern = SAMPLE_LAST_5_DAY_ROLLUPS[i % SAMPLE_LAST_5_DAY_ROLLUPS.length];
    out.push({ date: key, ...pattern });
  }
  return out;
}

/**
 * Demo activity log: ~2h Coding, ~1.2h Browsing, ~0.5h Meetings, ~0.4h Other.
 * Idle is added via idle log. Sample interval 2 min per entry (~50 entries = ~1.7h active).
 */
function getDemoActivityLog() {
  const start = getTodayStart();
  const intervalMs = 2 * 60 * 1000; // 2 min
  const apps = [
    { name: 'Code', count: 22 },
    { name: 'Chrome', count: 14 },
    { name: 'Zoom', count: 5 },
    { name: 'File Explorer', count: 9 },
  ];
  const entries = [];
  let t = start;
  for (const { name, count } of apps) {
    for (let i = 0; i < count; i++) {
      entries.push({
        timestamp: new Date(t).toISOString(),
        appName: name,
        windowTitle: name + ' – Demo',
      });
      t += intervalMs;
    }
  }
  return { version: DATA_VERSION, entries };
}

/** Demo idle log: two short idle segments (~12 min total). */
function getDemoIdleLog() {
  const start = getTodayStart();
  return {
    version: DATA_VERSION,
    entries: [
      { idleStart: new Date(start + 45 * 60 * 1000).toISOString(), idleEnd: new Date(start + 52 * 60 * 1000).toISOString() },
      { idleStart: new Date(start + 90 * 60 * 1000).toISOString(), idleEnd: new Date(start + 95 * 60 * 1000).toISOString() },
    ],
  };
}

const DEMO_SCREENSHOT_APPS = ['Visual Studio Code', 'Google Chrome', 'Zoom', 'Slack', 'Terminal', 'File Explorer'];

/** Demo screenshot metadata: 8 captures across the day. */
function getDemoScreenshotsMetadata() {
  const start = getTodayStart();
  const entries = [];
  for (let i = 0; i < 8; i++) {
    const t = new Date(start + (i + 1) * 45 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const fileName = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}_${pad(t.getHours())}-${pad(t.getMinutes())}-${pad(t.getSeconds())}.png`;
    entries.push({
      capturedAt: t.toISOString(),
      filePath: `screenshots/${fileName}`,
      fileName,
      appName: DEMO_SCREENSHOT_APPS[i % DEMO_SCREENSHOT_APPS.length],
    });
  }
  return { version: DATA_VERSION, entries };
}

/** Short demo structured AI insight for dashboard / cached summary. */
function getDemoDailyAiSummary() {
  const start = getTodayStart();
  const structured = {
    summary:
      'Demo data shows a build-heavy rhythm with collaboration mid-day.\nCoding time leads the mix—consistent with a focus-friendly schedule.\nRoom remains to tighten browsing blocks if you want deeper afternoon flow.',
    highlights: [
      'Strong coding share vs. browsing — deep-work signal in the sample window.',
      'Meetings sit in a healthy band relative to maker time.',
      'Idle segments are short versus total tracked time.',
    ],
    warnings: ['Browsing is non-trivial — watch for context switches after long meeting blocks.'],
    suggestions: [
      'Protect a 90-minute coding block after your last meeting tomorrow.',
      'Batch communication apps into two check-ins to preserve flow.',
    ],
    /** Overwritten on read from live demo activity via preprocessor signals */
    tags: ['Deep Work', 'Context Switching'],
  };
  return {
    text: JSON.stringify(structured),
    structured,
    generatedAt: new Date(start + 6 * 60 * 60 * 1000).toISOString(),
  };
}

module.exports = {
  getDemoActivityLog,
  getDemoIdleLog,
  getDemoScreenshotsMetadata,
  getDemoDailyAiSummary,
  getSampleActivityHistoryLastNDays,
  SAMPLE_LAST_5_DAY_ROLLUPS,
};
