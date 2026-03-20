/**
 * Writes sample rollup rows for the last 5 local calendar days into activity-log.json.
 * Run from project root: npm run seed-activity-log
 * Safe: merges per date; does not clear other dates.
 */

const path = require('path');

// Ensure cwd is project root (where activity-log.json should live)
process.chdir(path.join(__dirname, '..'));

const activityLog = require('./activity-log');
const demoData = require('./demo-data');

const DAYS = 7;
const rows = demoData.getSampleActivityHistoryLastNDays(DAYS);

for (const row of rows) {
  const { date, ...metrics } = row;
  activityLog.saveDailySummary(date, metrics);
}

console.log('[seed-activity-log] Wrote', rows.length, 'day(s):', rows.map((r) => r.date).join(', '));
