/**
 * Shared renderer utilities: formatting and safe HTML for dashboard/modal.
 * Categories are fixed (Coding, Browsing, etc.) so we do not escape them here.
 */

/** Display order and labels for activity categories. */
const ACTIVITY_CATEGORIES = ['Coding', 'Browsing', 'Meetings', 'Idle', 'Other'];

/**
 * Build HTML for activity breakdown rows (bars + hours).
 * Used by dashboard and today modal to avoid duplication.
 * @param {{ [key: string]: number }} hoursByCategory
 * @param {string} [emptyMessage] Message when no data.
 * @returns {string}
 */
function buildActivityRowsHTML(hoursByCategory, emptyMessage = 'No activity data yet.') {
  const total = Object.values(hoursByCategory || {}).reduce((a, b) => a + b, 0);
  const maxHours = Math.max(total, 1);

  if (total === 0) {
    return `<p class="empty-state">${emptyMessage}</p>`;
  }

  const rows = ACTIVITY_CATEGORIES.filter((cat) => (hoursByCategory[cat] || 0) > 0).map((cat) => {
    const hours = hoursByCategory[cat] || 0;
    const pct = (hours / maxHours) * 100;
    const barClass = cat.toLowerCase();
    return `
      <div class="activity-row">
        <span class="activity-label">${cat}</span>
        <div class="activity-bar-wrap">
          <div class="activity-bar ${barClass}" style="width: ${pct}%"></div>
        </div>
        <span class="activity-hours">${hours.toFixed(1)}h</span>
      </div>
    `;
  });

  return rows.length > 0 ? rows.join('') : `<p class="empty-state">${emptyMessage}</p>`;
}

/**
 * Apply focus score color class to a container element based on score.
 * @param {HTMLElement | null} el
 * @param {number} score
 */
function applyFocusScoreClass(el, score) {
  if (!el) return;
  el.classList.remove('focus-high', 'focus-medium', 'focus-low');
  if (typeof score !== 'number') return;
  if (score >= 80) el.classList.add('focus-high');
  else if (score >= 50) el.classList.add('focus-medium');
  else el.classList.add('focus-low');
}

/**
 * HTML for AI summary loading (spinner + accessible status text).
 * @returns {string}
 */
function buildAiSummaryLoadingHTML() {
  return (
    '<span class="ai-summary-loading" role="status" aria-live="polite">' +
    '<span class="spinner" aria-hidden="true"></span>' +
    '<span class="ai-summary-loading-text">Generating summary…</span>' +
    '</span>'
  );
}

// Expose for dashboard / weekly insights (no module system in renderer)
if (typeof window !== 'undefined') {
  window.buildActivityRowsHTML = buildActivityRowsHTML;
  window.applyFocusScoreClass = applyFocusScoreClass;
  window.buildAiSummaryLoadingHTML = buildAiSummaryLoadingHTML;
}
