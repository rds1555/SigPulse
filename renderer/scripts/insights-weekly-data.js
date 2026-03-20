/**
 * Pure helpers for the Weekly Insights view (7-day rollups).
 * @namespace InsightsWeeklyData
 */
(function (global) {
  /**
   * @param {Record<string, unknown>} r
   * @returns {number}
   */
  function sumDayHours(r) {
    if (!r || typeof r !== 'object') return 0;
    const c = typeof r.coding_hours === 'number' ? r.coding_hours : 0;
    const b = typeof r.browsing_hours === 'number' ? r.browsing_hours : 0;
    const m = typeof r.meeting_hours === 'number' ? r.meeting_hours : 0;
    const i = typeof r.idle_hours === 'number' ? r.idle_hours : 0;
    return c + b + m + i;
  }

  /**
   * @param {Record<string, unknown>} r
   * @returns {boolean}
   */
  function dayHasRollupData(r) {
    if (!r || typeof r !== 'object') return false;
    const fs = typeof r.focus_score === 'number' && Number.isFinite(r.focus_score) ? r.focus_score : 0;
    if (fs > 0) return true;
    return sumDayHours(r) > 0;
  }

  /**
   * @param {string} dateStr YYYY-MM-DD
   * @returns {string}
   */
  function formatChartDayLabel(dateStr) {
    const key = dateStr ? String(dateStr) : '';
    const d = key ? new Date(`${key}T12:00:00`) : new Date();
    if (Number.isNaN(d.getTime())) return key || '—';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  global.InsightsWeeklyData = {
    sumDayHours,
    dayHasRollupData,
    formatChartDayLabel,
  };
})(window);
