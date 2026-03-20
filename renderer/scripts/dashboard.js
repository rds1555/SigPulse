/**
 * Dashboard: Summary stats and activity breakdown.
 * Fetches data via IPC and renders into the dashboard cards. Refresh on load and on button click.
 */

function formatSummaryHours(h) {
  if (typeof h !== 'number' || !Number.isFinite(h)) return '—';
  return `${h.toFixed(1)}h`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline SVGs for structured insight panels (stroke matches currentColor). */
const AI_INSIGHT_ICONS = {
  highlights: `<svg class="ai-insight-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>`,
  warnings: `<svg class="ai-insight-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  suggestions: `<svg class="ai-insight-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  keyEvents: `<svg class="ai-insight-icon-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>`,
};

function applySummaryFocusTier(cardEl, score) {
  if (!cardEl) return;
  cardEl.classList.remove(
    'summary-stat-card--tier-high',
    'summary-stat-card--tier-medium',
    'summary-stat-card--tier-low',
  );
  if (typeof score !== 'number') return;
  if (score >= 80) cardEl.classList.add('summary-stat-card--tier-high');
  else if (score >= 50) cardEl.classList.add('summary-stat-card--tier-medium');
  else cardEl.classList.add('summary-stat-card--tier-low');
}

/**
 * @param {Record<string, number>} hoursByCategory
 * @param {number | null} focusScore
 * @param {string | null} focusLabel
 */
function renderSummaryCards(hoursByCategory, focusScore, focusLabel) {
  const cats = hoursByCategory && typeof hoursByCategory === 'object' ? hoursByCategory : {};
  const get = (key) => {
    const v = cats[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };

  const coding = get('Coding');
  const meetings = get('Meetings');
  const idle = get('Idle');
  const browsing = get('Browsing');
  const other = get('Other');
  const total = coding + meetings + idle + browsing + other;
  const productive = coding + meetings;

  const elTotal = document.getElementById('summary-stat-total-hours');
  const elProd = document.getElementById('summary-stat-productive');
  const elIdle = document.getElementById('summary-stat-idle');
  const elFocusVal = document.getElementById('summary-stat-focus');
  const elFocusSub = document.getElementById('summary-stat-focus-sub');
  const focusCard = document.getElementById('summary-stat-focus-card');

  if (elTotal) elTotal.textContent = formatSummaryHours(total);
  if (elProd) elProd.textContent = formatSummaryHours(productive);
  if (elIdle) elIdle.textContent = formatSummaryHours(idle);

  if (elFocusVal) {
    elFocusVal.textContent = typeof focusScore === 'number' ? String(Math.round(focusScore)) : '—';
  }
  if (elFocusSub) {
    elFocusSub.textContent =
      focusLabel || (typeof focusScore === 'number' ? '' : 'No data yet');
  }

  applySummaryFocusTier(focusCard, typeof focusScore === 'number' ? focusScore : null);
}

function formatInsightsGeneratedAt(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * @param {number | null} pct
 * @returns {string}
 */
function formatPercentChange(pct) {
  if (pct == null || typeof pct !== 'number' || Number.isNaN(pct)) return '';
  const abs = Math.abs(pct);
  const decimals = abs % 1 === 0 ? 0 : 1;
  const num = abs.toFixed(decimals);
  if (pct > 0) return `+${num}%`;
  if (pct < 0) return `−${num}%`;
  return '0%';
}

/**
 * @param {Record<string, unknown> | null | undefined} comparison
 */
function renderFocusYesterdayComparison(comparison) {
  const el = document.getElementById('todays-insights-focus-compare');
  if (!el) return;
  const sig = JSON.stringify(
    comparison && typeof comparison === 'object'
      ? {
          y: comparison.yesterday,
          p: comparison.percentChange,
          d: comparison.direction,
          n: comparison.noBaseline === true,
        }
      : null,
  );
  if (sig === lastFocusCompareKey) return;
  lastFocusCompareKey = sig;
  el.classList.remove(
    'todays-insights-focus-compare--up',
    'todays-insights-focus-compare--down',
    'todays-insights-focus-compare--same',
  );

  if (!comparison || comparison.yesterday === null || comparison.yesterday === undefined) {
    el.hidden = true;
    el.textContent = '';
    el.removeAttribute('aria-label');
    return;
  }

  const yesterday = typeof comparison.yesterday === 'number' ? comparison.yesterday : 0;
  const direction = comparison.direction;
  const pct = comparison.percentChange;
  const noBaseline = comparison.noBaseline === true;

  el.hidden = false;

  if (noBaseline) {
    el.classList.add('todays-insights-focus-compare--up');
    el.innerHTML =
      '<span class="focus-compare-arrow" aria-hidden="true">↑</span>' +
      '<span class="focus-compare-text">Up from yesterday (no prior score)</span>';
    el.setAttribute('aria-label', 'Focus up from yesterday; no prior day score to compare percent.');
    return;
  }

  if (direction === 'up') {
    el.classList.add('todays-insights-focus-compare--up');
    const p = formatPercentChange(pct);
    el.innerHTML =
      `<span class="focus-compare-arrow" aria-hidden="true">↑</span>` +
      `<span class="focus-compare-text">${escapeHtml(p)} vs yesterday (${yesterday})</span>`;
    el.setAttribute('aria-label', `Focus up ${p} compared to yesterday score ${yesterday}.`);
    return;
  }

  if (direction === 'down') {
    el.classList.add('todays-insights-focus-compare--down');
    const p = formatPercentChange(pct);
    el.innerHTML =
      `<span class="focus-compare-arrow" aria-hidden="true">↓</span>` +
      `<span class="focus-compare-text">${escapeHtml(p)} vs yesterday (${yesterday})</span>`;
    el.setAttribute('aria-label', `Focus down ${p} compared to yesterday score ${yesterday}.`);
    return;
  }

  el.classList.add('todays-insights-focus-compare--same');
  el.innerHTML =
    '<span class="focus-compare-arrow" aria-hidden="true">→</span>' +
    `<span class="focus-compare-text">Same as yesterday (${yesterday})</span>`;
  el.setAttribute('aria-label', `Focus same as yesterday, score ${yesterday}.`);
}

/**
 * True if structured AI payload has at least one non-empty list section (shown in UI).
 * @param {{ highlights?: unknown, warnings?: unknown, suggestions?: unknown } | null | undefined} s
 */
function structuredHasListContent(s) {
  if (!s || typeof s !== 'object') return false;
  const nonEmpty = (arr) => Array.isArray(arr) && arr.some((x) => String(x).trim());
  return nonEmpty(s.highlights) || nonEmpty(s.warnings) || nonEmpty(s.suggestions);
}

/** @type {'classic' | 'banner'} */
let cachedInsightsLayout = 'classic';

/**
 * Sync layout preference from main settings; sets root data attribute for CSS.
 * @param {{ insightsCardStyle?: string } | null | undefined} settings
 */
function applyInsightsLayoutFromSettings(settings) {
  const v = settings && settings.insightsCardStyle === 'banner' ? 'banner' : 'classic';
  cachedInsightsLayout = v;
  document.documentElement.setAttribute('data-insights-card-style', v);
}

function getInsightsLayout() {
  return cachedInsightsLayout;
}

window.applyInsightsLayoutFromSettings = applyInsightsLayoutFromSettings;

/**
 * @param {string} mod highlights | warnings | suggestions | key-events
 */
function getInsightIconHtml(mod) {
  if (mod === 'key-events') return AI_INSIGHT_ICONS.keyEvents;
  return AI_INSIGHT_ICONS[mod] || '';
}

/**
 * Chevron banner row (reference layout): style A = icon | ribbon→ | content; style B = content | ←ribbon | icon.
 * @param {'a' | 'b'} bandStyle
 * @param {string} mod
 * @param {string} titleLabel
 * @param {string} lead
 * @param {string} itemsHtml joined <li>…
 */
function buildInsightBannerSection(bandStyle, mod, titleLabel, lead, itemsHtml) {
  const titleId = `ai-insight-title-${mod}`;
  const icon = getInsightIconHtml(mod);
  const ribbon = `<div class="insight-banner__ribbon"><span id="${titleId}" class="insight-banner__ribbon-text">${escapeHtml(titleLabel.toUpperCase())}</span></div>`;
  const iconCell = `<div class="insight-banner__icon-wrap insight-banner__icon-wrap--${mod}" aria-hidden="true">${icon}</div>`;
  const content = `<div class="insight-banner__body"><p class="insight-banner__lead">${escapeHtml(lead)}</p><ul class="insight-banner__list insight-banner__list--${mod}" role="list">${itemsHtml}</ul></div>`;
  if (bandStyle === 'a') {
    return `<article class="insight-banner insight-banner--a insight-banner--${mod}" role="region" aria-labelledby="${titleId}">${iconCell}${ribbon}${content}</article>`;
  }
  return `<article class="insight-banner insight-banner--b insight-banner--${mod}" role="region" aria-labelledby="${titleId}">${content}${ribbon}${iconCell}</article>`;
}

/**
 * @param {{ structured?: Record<string, unknown> | null, text?: string } | null | undefined} aiRes
 * @returns {{ summary: string, highlights: string[], warnings: string[], suggestions: string[] } | null}
 */
function resolveDailyStructured(aiRes) {
  if (aiRes?.structured && typeof aiRes.structured === 'object') {
    const s = aiRes.structured;
    return {
      summary: typeof s.summary === 'string' ? s.summary : '',
      highlights: Array.isArray(s.highlights) ? s.highlights.map(String) : [],
      warnings: Array.isArray(s.warnings) ? s.warnings.map(String) : [],
      suggestions: Array.isArray(s.suggestions) ? s.suggestions.map(String) : [],
    };
  }
  const t = aiRes?.text;
  if (typeof t !== 'string' || !t.trim().startsWith('{')) return null;
  try {
    const o = JSON.parse(t.trim());
    if (!o || typeof o !== 'object' || typeof o.summary !== 'string') return null;
    return {
      summary: o.summary,
      highlights: Array.isArray(o.highlights) ? o.highlights.map(String) : [],
      warnings: Array.isArray(o.warnings) ? o.warnings.map(String) : [],
      suggestions: Array.isArray(o.suggestions) ? o.suggestions.map(String) : [],
    };
  } catch {
    return null;
  }
}

/**
 * @param {{ summary: string, highlights: string[], warnings: string[], suggestions: string[] }} structured
 * @param {HTMLElement} el
 */
function renderAiStructuredSections(structured, el) {
  const layout = getInsightsLayout();
  const blocks = [];
  const sections = [
    {
      title: 'Highlights',
      mod: 'highlights',
      items: structured.highlights,
      lead: 'Positive patterns grounded in your tracked time.',
      band: /** @type {'a' | 'b'} */ ('a'),
    },
    {
      title: 'Warnings',
      mod: 'warnings',
      items: structured.warnings,
      lead: 'Issues or inefficiencies worth attention.',
      band: 'b',
    },
    {
      title: 'Suggestions',
      mod: 'suggestions',
      items: structured.suggestions,
      lead: 'Concrete improvements to try next.',
      band: 'a',
    },
  ];

  for (const s of sections) {
    const list = Array.isArray(s.items) ? s.items.map((x) => String(x).trim()).filter(Boolean) : [];
    if (list.length === 0) continue;
    const titleId = `ai-insight-title-${s.mod}`;
    if (layout === 'banner') {
      const itemsHtml = list.map((item) => `<li class="insight-banner__item">${escapeHtml(item)}</li>`).join('');
      blocks.push(buildInsightBannerSection(s.band, s.mod, s.title, s.lead, itemsHtml));
      continue;
    }
    const icon = AI_INSIGHT_ICONS[s.mod] || '';
    const lis = list.map((item) => `<li class="ai-insight-panel__item">${escapeHtml(item)}</li>`).join('');
    const leadHtml = `<p class="ai-insight-panel__lead">${escapeHtml(s.lead)}</p>`;
    blocks.push(
      `<section class="ai-insight-panel ai-insight-panel--${s.mod}" role="region" aria-labelledby="${titleId}">` +
        `<header class="ai-insight-panel__head">` +
        `<span class="ai-insight-icon ai-insight-icon--${s.mod}" aria-hidden="true">${icon}</span>` +
        `<div class="ai-insight-panel__head-text">` +
        `<h3 id="${titleId}" class="ai-insight-panel__title">${escapeHtml(s.title)}</h3>` +
        `</div>` +
        `</header>` +
        leadHtml +
        `<ul class="ai-insight-panel__list ai-insight-panel__list--${s.mod}">${lis}</ul>` +
        `</section>`,
    );
  }

  if (blocks.length === 0) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  const innerClass =
    layout === 'banner' ? 'todays-insights-structured-inner todays-insights-structured-inner--banner' : 'todays-insights-structured-inner';
  el.innerHTML = `<div class="${innerClass}">${blocks.join('')}</div>`;
  el.hidden = false;
}

/**
 * Activity-derived bullets in the same card layout as AI panels (“Key Events”).
 * @param {string[]} bullets
 * @param {HTMLElement | null} el
 */
function renderKeyEventsPanel(bullets, el) {
  if (!el) return;
  const list = Array.isArray(bullets) ? bullets.map((x) => String(x).trim()).filter(Boolean) : [];
  if (list.length === 0) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  const layout = getInsightsLayout();
  const titleId = 'ai-insight-title-key-events';
  const lead = "Patterns from today's activity log — not from the AI summary.";
  if (layout === 'banner') {
    const itemsHtml = list.map((item) => `<li class="insight-banner__item">${escapeHtml(item)}</li>`).join('');
    el.innerHTML = buildInsightBannerSection('b', 'key-events', 'Key Events', lead, itemsHtml);
  } else {
    const icon = AI_INSIGHT_ICONS.keyEvents;
    const lis = list.map((item) => `<li class="ai-insight-panel__item">${escapeHtml(item)}</li>`).join('');
    el.innerHTML =
      `<section class="ai-insight-panel ai-insight-panel--key-events" role="region" aria-labelledby="${titleId}">` +
      `<header class="ai-insight-panel__head">` +
      `<span class="ai-insight-icon ai-insight-icon--key-events" aria-hidden="true">${icon}</span>` +
      `<div class="ai-insight-panel__head-text">` +
      `<h3 id="${titleId}" class="ai-insight-panel__title">Key Events</h3>` +
      `</div>` +
      `</header>` +
      `<p class="ai-insight-panel__lead">${escapeHtml(lead)}</p>` +
      `<ul class="ai-insight-panel__list ai-insight-panel__list--key-events">${lis}</ul>` +
      `</section>`;
  }
  el.hidden = false;
}

/**
 * Hero card: AI highlights/warnings/suggestions + focus score + data-driven activity bullets.
 * @param {{ text?: string, structured?: Record<string, unknown> | null, generatedAt?: string | null, loading?: boolean, loadingMessage?: string, error?: string, errorCode?: string }} aiRes
 * @param {number | null} focusScore
 * @param {string | null} focusLabel
 * @param {string[] | null | undefined} insightBullets
 * @param {Record<string, unknown> | null | undefined} focusComparison
 */
function renderTodaysInsights(aiRes, focusScore, focusLabel, insightBullets, focusComparison) {
  const statusEl = document.getElementById('todays-insights-status');
  const structuredEl = document.getElementById('todays-insights-structured');
  const keyEventsEl = document.getElementById('todays-insights-key-events');
  const metaEl = document.getElementById('todays-insights-meta');
  const valEl = document.getElementById('todays-insights-focus-value');
  const subEl = document.getElementById('todays-insights-focus-sub');
  const focusWrap = document.getElementById('todays-insights-focus-wrap');
  const card = document.getElementById('todays-insights-card');

  const loading = Boolean(aiRes && aiRes.loading);
  const loadingMessage =
    aiRes && typeof aiRes.loadingMessage === 'string' && aiRes.loadingMessage.trim()
      ? aiRes.loadingMessage.trim()
      : 'Preparing your insights…';
  const errMsg = aiRes && aiRes.error ? String(aiRes.error).trim() : '';
  const errorCode = aiRes && aiRes.errorCode ? String(aiRes.errorCode).trim() : '';
  const text = aiRes && typeof aiRes.text === 'string' ? aiRes.text.trim() : '';
  const generatedAt = aiRes && aiRes.generatedAt ? String(aiRes.generatedAt) : null;
  const structured = !loading ? resolveDailyStructured(aiRes) : null;

  const bullets =
    Array.isArray(insightBullets) && insightBullets.length > 0
      ? insightBullets.map((b) => (typeof b === 'string' ? b.trim() : '')).filter(Boolean)
      : [];

  if (!loading) {
    const cmpSig = JSON.stringify(
      focusComparison && typeof focusComparison === 'object'
        ? {
            y: focusComparison.yesterday,
            p: focusComparison.percentChange,
            d: focusComparison.direction,
            n: focusComparison.noBaseline === true,
          }
        : null,
    );
    const stateKey = JSON.stringify({
      text,
      structured,
      errMsg,
      errorCode,
      generatedAt,
      focusScore,
      focusLabel,
      bullets,
      cmpSig,
      insightsLayout: getInsightsLayout(),
    });
    if (stateKey === lastTodaysInsightsKey) return;
    lastTodaysInsightsKey = stateKey;
  } else {
    lastTodaysInsightsKey = '';
  }

  if (valEl) {
    valEl.textContent = typeof focusScore === 'number' ? String(Math.round(focusScore)) : '—';
  }
  if (subEl) {
    subEl.textContent =
      focusLabel || (typeof focusScore === 'number' ? '' : 'No data yet');
  }

  applySummaryFocusTier(focusWrap, typeof focusScore === 'number' ? focusScore : null);

  if (typeof focusScore === 'number') {
    renderFocusYesterdayComparison(focusComparison);
  } else {
    renderFocusYesterdayComparison(null);
  }

  renderKeyEventsPanel(bullets, keyEventsEl);

  const hasPanelContent = Boolean(structured && structuredHasListContent(structured));

  if (statusEl) {
    statusEl.classList.remove(
      'todays-insights-status--loading',
      'todays-insights-status--error',
      'todays-insights-status--empty',
    );
    if (loading) {
      statusEl.hidden = false;
      statusEl.classList.add('todays-insights-status--loading');
      statusEl.textContent = loadingMessage;
    } else if (errMsg) {
      statusEl.hidden = false;
      statusEl.classList.add('todays-insights-status--error');
      if (errorCode === 'MISSING_AI_KEY') {
        statusEl.textContent = '';
        statusEl.replaceChildren();
        const wrap = document.createElement('div');
        wrap.className = 'todays-insights-missing-key';
        const p = document.createElement('p');
        p.className = 'todays-insights-missing-key__text';
        p.textContent = 'Please add your Groq API key in Settings to enable insights';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-go-to-settings';
        btn.textContent = 'Go to Settings';
        btn.addEventListener('click', () => {
          if (typeof window.sigpulseNavigate === 'function') {
            window.sigpulseNavigate('settings');
          }
        });
        wrap.appendChild(p);
        wrap.appendChild(btn);
        statusEl.appendChild(wrap);
      } else {
        statusEl.textContent = `Couldn't refresh insights. ${errMsg} Try Refresh Insights again in a moment.`;
      }
    } else if (hasPanelContent) {
      statusEl.hidden = true;
      statusEl.textContent = '';
    } else if (structured && !hasPanelContent) {
      statusEl.hidden = false;
      statusEl.classList.add('todays-insights-status--empty');
      statusEl.textContent =
        'No highlight or suggestion sections in the latest insight. Try Refresh Insights to regenerate.';
    } else if (text) {
      statusEl.hidden = false;
      statusEl.classList.add('todays-insights-status--empty');
      statusEl.textContent = text;
    } else {
      statusEl.hidden = false;
      statusEl.classList.add('todays-insights-status--empty');
      statusEl.textContent =
        'No AI insights yet. Click Refresh Insights to generate highlights from your activity.';
    }
  }

  if (structuredEl) {
    if (loading || errMsg) {
      structuredEl.innerHTML = '';
      structuredEl.hidden = true;
    } else if (structured) {
      renderAiStructuredSections(structured, structuredEl);
    } else {
      structuredEl.innerHTML = '';
      structuredEl.hidden = true;
    }
  }

  if (metaEl) {
    const when = formatInsightsGeneratedAt(generatedAt);
    const hasAiContent = Boolean(hasPanelContent || text);
    if (!loading && hasAiContent && when) {
      metaEl.hidden = false;
      metaEl.textContent = `Insights generated ${when}`;
    } else {
      metaEl.hidden = true;
      metaEl.textContent = '';
    }
  }

  if (card) {
    const hasBullets = bullets.length > 0;
    const hasAiContent = Boolean(hasPanelContent || text);
    card.classList.toggle(
      'todays-insights-card--has-summary',
      hasBullets || Boolean(!loading && hasAiContent),
    );
    card.classList.toggle('todays-insights-card--loading', loading);
  }
}

let activityBreakdownChart = null;
/** Fingerprint of last doughnut dataset — skip destroy/recreate when unchanged. */
let lastActivityDoughnutKey = '';
/** Last activity rows HTML — skip innerHTML when unchanged. */
let lastActivityRowsHtml = '';
/** Last focus comparison JSON — skip DOM when unchanged. */
let lastFocusCompareKey = '';
/** Skip hero re-render when loading finished with identical state. */
let lastTodaysInsightsKey = '';

const ACTIVITY_CHART_KEYS = ['Coding', 'Browsing', 'Meetings', 'Idle'];
/** Matches activity-bar colors in main.css */
const ACTIVITY_CHART_COLORS = ['#6c7bff', '#5a9bd5', '#7b68a6', '#5a5a5a'];

/**
 * Doughnut chart for the four main categories (Chart.js).
 * @param {Record<string, number>} hoursByCategory
 */
function renderActivityBreakdownChart(hoursByCategory) {
  const canvas = document.getElementById('activity-breakdown-chart');
  const emptyEl = document.getElementById('activity-chart-empty');
  if (!canvas) return;

  if (typeof window.Chart === 'undefined') {
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = 'Chart library failed to load.';
    }
    canvas.hidden = true;
    return;
  }

  const cats = hoursByCategory && typeof hoursByCategory === 'object' ? hoursByCategory : {};
  const data = ACTIVITY_CHART_KEYS.map((key) => {
    const v = cats[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  });
  const total = data.reduce((a, b) => a + b, 0);
  const dataKey = data.map((n) => n.toFixed(2)).join('|');

  if (total <= 0) {
    if (activityBreakdownChart) {
      activityBreakdownChart.destroy();
      activityBreakdownChart = null;
    }
    lastActivityDoughnutKey = '';
    canvas.hidden = true;
    if (emptyEl) {
      emptyEl.hidden = false;
      emptyEl.textContent = 'No data for these categories yet.';
    }
    return;
  }

  if (activityBreakdownChart && dataKey === lastActivityDoughnutKey) {
    activityBreakdownChart.data.datasets[0].data = data.slice();
    activityBreakdownChart.update('none');
    canvas.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    return;
  }

  if (activityBreakdownChart) {
    activityBreakdownChart.destroy();
    activityBreakdownChart = null;
  }

  lastActivityDoughnutKey = dataKey;
  canvas.hidden = false;
  if (emptyEl) emptyEl.hidden = true;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  activityBreakdownChart = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ACTIVITY_CHART_KEYS,
      datasets: [
        {
          data,
          backgroundColor: ACTIVITY_CHART_COLORS,
          borderColor: '#1e222d',
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1.05,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#a8b0c0',
            padding: 14,
            font: { size: 11, family: "'Segoe UI', system-ui, sans-serif" },
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: '#1a1d27',
          borderColor: '#2a2f3d',
          borderWidth: 1,
          titleColor: '#f0f2f5',
          bodyColor: '#a8b0c0',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label(ctx) {
              const raw = ctx.raw;
              const n = typeof raw === 'number' ? raw : 0;
              return ` ${ctx.label}: ${n.toFixed(1)}h`;
            },
          },
        },
      },
      cutout: '56%',
    },
  });
}

function renderActivityBreakdown(hoursByCategory) {
  const container = document.getElementById('activity-breakdown');
  if (!container) return;
  const cats = hoursByCategory || {};
  renderActivityBreakdownChart(cats);
  const nextHtml =
    typeof window.buildActivityRowsHTML === 'function'
      ? window.buildActivityRowsHTML(cats)
      : '<p class="empty-state">No activity data yet.</p>';
  if (nextHtml !== lastActivityRowsHtml) {
    container.innerHTML = nextHtml;
    lastActivityRowsHtml = nextHtml;
  }
}

function getRefreshInsightsButtons() {
  return document.querySelectorAll('.btn-refresh-insights');
}

function setRefreshInsightsBusy(busy) {
  getRefreshInsightsButtons().forEach((btn) => {
    btn.classList.toggle('is-loading', busy);
    btn.disabled = busy;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  });
}

function refreshWeeklyChartsIfVisible() {
  const el = document.getElementById('view-insights');
  if (el && !el.hidden && typeof window.refreshWeeklyInsightsPage === 'function') {
    window.refreshWeeklyInsightsPage();
  }
}

let dashboardDebounceTimer = null;
const DASHBOARD_DEBOUNCE_MS = 160;

/**
 * Fetches focus score and activity summary from main; updates the dashboard.
 * Today's Insights: cached or auto-generated on load; use `forceRegenerateSummary` to re-run the AI and save.
 * @param {{ forceRegenerateSummary?: boolean, immediate?: boolean }} [options]
 */
function runDashboardRefresh(options = {}) {
  if (typeof window.sigpulse === 'undefined') return;

  const force = options.forceRegenerateSummary === true;
  if (force) setRefreshInsightsBusy(true);

  const loadingMsg = force ? 'Refreshing insights…' : 'Preparing your summary…';
  renderTodaysInsights({ loading: true, loadingMessage: loadingMsg }, null, null, null, null);

  const bulletsFn =
    typeof window.sigpulse.getActivityInsightBullets === 'function'
      ? window.sigpulse.getActivityInsightBullets
      : null;

  const ensureFn =
    typeof window.sigpulse.ensureTodaysDailySummary === 'function'
      ? window.sigpulse.ensureTodaysDailySummary
      : null;
  const genFn =
    typeof window.sigpulse.generateDailySummary === 'function'
      ? window.sigpulse.generateDailySummary
      : null;

  Promise.all([
    window.sigpulse.getFocusScore(),
    window.sigpulse.getActivitySummary(),
    bulletsFn ? bulletsFn() : Promise.resolve({ ok: false, bullets: [] }),
    typeof window.sigpulse.getSettings === 'function'
      ? window.sigpulse.getSettings().catch(() => ({ ok: false }))
      : Promise.resolve({ ok: false }),
  ])
    .then(([focusRes, activityRes, bulletsRes, settingsRes]) => {
      if (settingsRes?.ok && settingsRes.settings) {
        applyInsightsLayoutFromSettings(settingsRes.settings);
      }
      const hours = activityRes?.ok ? activityRes.hoursByCategory : {};
      const focusScore = focusRes?.ok && typeof focusRes.score === 'number' ? focusRes.score : null;
      const focusLabel = focusRes?.ok && focusRes.label ? String(focusRes.label) : null;
      const bullets =
        bulletsRes?.ok && Array.isArray(bulletsRes.bullets) ? bulletsRes.bullets : [];
      const focusComparison = focusRes?.ok && focusRes.comparison ? focusRes.comparison : null;

      renderSummaryCards(hours, focusScore, focusLabel);

      if (activityRes?.ok) renderActivityBreakdown(activityRes.hoursByCategory);
      else renderActivityBreakdown({});

      renderTodaysInsights(
        { loading: true, loadingMessage: loadingMsg },
        focusScore,
        focusLabel,
        bullets,
        focusComparison,
      );

      if (force) {
        if (!genFn) {
          return Promise.resolve({
            focusScore,
            focusLabel,
            focusComparison,
            bullets,
            insightsRes: {
              ok: false,
              error: 'Regeneration unavailable',
              text: '',
              generatedAt: null,
              structured: null,
            },
          });
        }
        return genFn().then((r) => {
          if (r?.ok && r.text) {
            return {
              focusScore,
              focusLabel,
              focusComparison,
              bullets,
              insightsRes: {
                ok: true,
                text: r.text,
                structured: r.structured ?? null,
                generatedAt: r.generatedAt ?? null,
              },
            };
          }
          return {
            focusScore,
            focusLabel,
            focusComparison,
            bullets,
            insightsRes: {
              ok: false,
              error: r?.error || 'Could not generate summary',
              errorCode: r?.errorCode,
              text: '',
              generatedAt: null,
              structured: null,
            },
          };
        });
      }

      if (!ensureFn) {
        return Promise.resolve({
          focusScore,
          focusLabel,
          focusComparison,
          bullets,
          insightsRes: {
            ok: false,
            error: 'Summary loading unavailable',
            text: '',
            generatedAt: null,
            structured: null,
          },
        });
      }

      return ensureFn().then((insightsRes) => ({
        focusScore,
        focusLabel,
        focusComparison,
        bullets,
        insightsRes,
      }));
    })
    .then((bundle) => {
      if (!bundle) return;
      const { focusScore, focusLabel, focusComparison, bullets, insightsRes } = bundle;
      if (!insightsRes) return;

      const applyInsights = (fs, fl, bull, cmp) => {
        const b = Array.isArray(bull) ? bull : bullets;
        if (insightsRes.ok) {
          const t = typeof insightsRes.text === 'string' ? insightsRes.text.trim() : '';
          renderTodaysInsights(
            {
              text: t,
              structured: insightsRes.structured ?? null,
              generatedAt: insightsRes.generatedAt ?? null,
            },
            fs,
            fl,
            b,
            cmp,
          );
        } else {
          renderTodaysInsights(
            {
              text: '',
              structured: null,
              generatedAt: null,
              error: insightsRes.error || 'Something went wrong.',
              errorCode: insightsRes.errorCode,
            },
            fs,
            fl,
            b,
            cmp,
          );
        }
      };

      if (force && insightsRes.ok) {
        return Promise.all([
          window.sigpulse.getFocusScore(),
          window.sigpulse.getActivitySummary(),
          bulletsFn ? bulletsFn() : Promise.resolve({ ok: false, bullets: [] }),
        ]).then(([fr, ar, bulletsRes2]) => {
          const h = ar?.ok ? ar.hoursByCategory : {};
          const fs = fr?.ok && typeof fr.score === 'number' ? fr.score : focusScore;
          const fl = fr?.ok && fr.label ? String(fr.label) : focusLabel;
          const b2 =
            bulletsRes2?.ok && Array.isArray(bulletsRes2.bullets) ? bulletsRes2.bullets : bullets;
          const cmp2 = fr?.ok && fr.comparison ? fr.comparison : focusComparison;
          renderSummaryCards(h, fs, fl);
          if (ar?.ok) renderActivityBreakdown(ar.hoursByCategory);
          else renderActivityBreakdown({});
          applyInsights(fs, fl, b2, cmp2);
        });
      }

      applyInsights(focusScore, focusLabel, bullets, focusComparison);
    })
    .catch((err) => {
      console.error('Dashboard refresh failed:', err);
      renderTodaysInsights(
        { text: '', generatedAt: null, error: err?.message || 'Refresh failed' },
        null,
        null,
        [],
        null,
      );
      renderSummaryCards({}, null, null);
      renderActivityBreakdown({});
    })
    .finally(() => {
      if (force) setRefreshInsightsBusy(false);
      refreshWeeklyChartsIfVisible();
    });
}

/**
 * Coalesces rapid refresh requests (e.g. multiple IPC events). Use `immediate: true` on first paint;
 * `forceRegenerateSummary: true` clears any pending debounce and runs at once.
 * @param {{ forceRegenerateSummary?: boolean, immediate?: boolean }} [options]
 */
function refreshDashboard(options = {}) {
  const force = options.forceRegenerateSummary === true;
  const immediate = options.immediate === true;
  if (force || immediate) {
    if (dashboardDebounceTimer) {
      clearTimeout(dashboardDebounceTimer);
      dashboardDebounceTimer = null;
    }
    runDashboardRefresh(options);
    return;
  }
  if (dashboardDebounceTimer) clearTimeout(dashboardDebounceTimer);
  dashboardDebounceTimer = setTimeout(() => {
    dashboardDebounceTimer = null;
    runDashboardRefresh(options);
  }, DASHBOARD_DEBOUNCE_MS);
}

function initDashboard() {
  document.querySelectorAll('.btn-refresh-insights').forEach((btn) => {
    btn.addEventListener('click', () => refreshDashboard({ forceRegenerateSummary: true }));
  });

  window.refreshDashboard = refreshDashboard;

  window.addEventListener('sigpulse-demo-mode-changed', () => refreshDashboard());
  window.addEventListener('sigpulse-ai-summary-updated', () => refreshDashboard());
  window.addEventListener('sigpulse-insights-layout-changed', () => refreshDashboard({ immediate: true }));

  if (typeof window.sigpulse !== 'undefined') {
    refreshDashboard({ immediate: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  initDashboard();
}
