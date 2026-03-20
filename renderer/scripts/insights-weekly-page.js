/**
 * Weekly Insights view: fetch 7-day rollups and render charts.
 */
(function (global) {
  const HISTORY_DAYS = 7;

  /** `JSON.stringify(rows)` — skip chart redraw when unchanged. */
  let weeklyRowsCacheKey = '';

  function getSigpulse() {
    return global.sigpulse;
  }

  function refreshWeeklyInsightsPage() {
    const sp = getSigpulse();
    if (!sp || typeof sp.getActivityHistoryDays !== 'function') {
      weeklyRowsCacheKey = '';
      renderEmptyState();
      return Promise.resolve();
    }

    return sp
      .getActivityHistoryDays(HISTORY_DAYS)
      .then((res) => {
        const rows = res?.ok && Array.isArray(res.days) ? res.days : [];
        const rowKey = JSON.stringify(rows);

        if (rowKey !== weeklyRowsCacheKey) {
          weeklyRowsCacheKey = rowKey;
          if (global.InsightsWeeklyCharts) {
            global.InsightsWeeklyCharts.renderFocusTrend({
              canvasId: 'insights-focus-trend-chart',
              emptyId: 'insights-focus-trend-empty',
              rowsNewestFirst: rows,
            });
            global.InsightsWeeklyCharts.renderStackedActivity({
              canvasId: 'insights-activity-stacked-chart',
              emptyId: 'insights-activity-stacked-empty',
              rowsNewestFirst: rows,
            });
          }
        }
      })
      .catch((err) => {
        console.error('[Weekly Insights] refresh failed:', err);
        weeklyRowsCacheKey = '';
        renderEmptyState();
      });
  }

  function renderEmptyState() {
    if (global.InsightsWeeklyCharts) {
      global.InsightsWeeklyCharts.renderFocusTrend({
        canvasId: 'insights-focus-trend-chart',
        emptyId: 'insights-focus-trend-empty',
        rowsNewestFirst: [],
      });
      global.InsightsWeeklyCharts.renderStackedActivity({
        canvasId: 'insights-activity-stacked-chart',
        emptyId: 'insights-activity-stacked-empty',
        rowsNewestFirst: [],
      });
    }
  }

  function initWeeklyInsightsPage() {
    global.addEventListener('sigpulse-demo-mode-changed', () => {
      refreshWeeklyInsightsPage();
    });
    if (typeof global.sigpulse !== 'undefined') {
      refreshWeeklyInsightsPage();
    }
  }

  global.refreshWeeklyInsightsPage = refreshWeeklyInsightsPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWeeklyInsightsPage);
  } else {
    initWeeklyInsightsPage();
  }
})(window);
