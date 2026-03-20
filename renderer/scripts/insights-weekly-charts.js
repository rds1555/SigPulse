/**
 * Chart.js: focus trend line + stacked activity bars for Weekly Insights (SaaS-style).
 * @namespace InsightsWeeklyCharts
 */
(function (global) {
  const FONT = {
    family: "'Segoe UI', system-ui, -apple-system, sans-serif",
    size: 11,
  };
  const FONT_TITLE = { ...FONT, size: 12, weight: '600' };

  const COLORS = {
    coding: 'rgba(108, 123, 255, 0.92)',
    browsing: 'rgba(90, 155, 213, 0.9)',
    meetings: 'rgba(123, 104, 166, 0.9)',
    idle: 'rgba(100, 105, 120, 0.85)',
  };
  const BAR_BORDER = '#14161d';
  const AXIS = '#8b93a5';
  const GRID = 'rgba(148, 163, 184, 0.07)';
  const LINE_ACCENT = '#7c8cff';
  const NO_DATA_MSG = 'No data available';

  let focusChart = null;
  let stackedChart = null;

  const Data = global.InsightsWeeklyData;

  function destroyFocus() {
    if (focusChart) {
      focusChart.destroy();
      focusChart = null;
    }
  }

  function destroyStacked() {
    if (stackedChart) {
      stackedChart.destroy();
      stackedChart = null;
    }
  }

  /** @param {{ ctx: CanvasRenderingContext2D, chartArea?: { top: number, bottom: number } }} chart */
  function lineFillGradient(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) {
      return 'rgba(124, 140, 255, 0.14)';
    }
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, 'rgba(124, 140, 255, 0.26)');
    g.addColorStop(0.45, 'rgba(124, 140, 255, 0.08)');
    g.addColorStop(1, 'rgba(124, 140, 255, 0)');
    return g;
  }

  const commonAnimation = {
    duration: 420,
    easing: 'easeOutQuart',
  };

  const scaleDefaults = {
    border: { display: false },
    grid: { color: GRID, drawTicks: false },
    ticks: {
      color: AXIS,
      font: FONT,
      padding: 8,
    },
  };

  /**
   * @param {{ canvasId: string, emptyId: string, rowsNewestFirst: Array<Record<string, unknown>> }} opts
   */
  function renderFocusTrend(opts) {
    const canvas = document.getElementById(opts.canvasId);
    const emptyEl = document.getElementById(opts.emptyId);
    if (!canvas) return;

    if (typeof global.Chart === 'undefined') {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Chart library failed to load.';
      }
      canvas.hidden = true;
      return;
    }

    const list = Array.isArray(opts.rowsNewestFirst) ? opts.rowsNewestFirst : [];
    const chronological = [...list].reverse();
    const hasAny = chronological.some((r) => Data.dayHasRollupData(r));

    destroyFocus();

    if (!hasAny) {
      canvas.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = NO_DATA_MSG;
      }
      return;
    }

    canvas.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    const labels = chronological.map((r) => Data.formatChartDayLabel(r.date ? String(r.date) : ''));
    const scores = chronological.map((r) => {
      const v = r && typeof r === 'object' ? r.focus_score : undefined;
      return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    focusChart = new global.Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Focus score',
            data: scores,
            borderColor: LINE_ACCENT,
            backgroundColor(c) {
              return lineFillGradient(c.chart);
            },
            borderWidth: 2.5,
            fill: true,
            tension: 0.42,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointBackgroundColor: LINE_ACCENT,
            pointBorderColor: BAR_BORDER,
            pointBorderWidth: 2,
            pointHoverBackgroundColor: '#a5b0ff',
            pointHoverBorderColor: '#f0f2f5',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.05,
        animation: commonAnimation,
        interaction: { mode: 'index', intersect: false },
        hover: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1d27',
            borderColor: 'rgba(124, 140, 255, 0.25)',
            borderWidth: 1,
            titleColor: '#f0f2f5',
            titleFont: FONT_TITLE,
            bodyColor: '#a8b0c0',
            bodyFont: FONT,
            padding: 12,
            cornerRadius: 10,
            displayColors: false,
            caretPadding: 10,
            callbacks: {
              label(ctx) {
                const y = ctx.parsed.y;
                const n = typeof y === 'number' ? y : 0;
                return ` Focus score: ${n}`;
              },
            },
          },
        },
        scales: {
          x: {
            ...scaleDefaults,
            title: {
              display: true,
              text: 'Date',
              color: AXIS,
              font: FONT_TITLE,
              padding: { top: 10, bottom: 0 },
            },
            ticks: { ...scaleDefaults.ticks, maxRotation: 40, minRotation: 0 },
          },
          y: {
            ...scaleDefaults,
            min: 0,
            max: 100,
            title: {
              display: true,
              text: 'Focus score',
              color: AXIS,
              font: FONT_TITLE,
              padding: { bottom: 8, top: 0 },
            },
            ticks: {
              ...scaleDefaults.ticks,
              stepSize: 20,
              callback(v) {
                return `${v}`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * @param {{ canvasId: string, emptyId: string, rowsNewestFirst: Array<Record<string, unknown>> }} opts
   */
  function renderStackedActivity(opts) {
    const canvas = document.getElementById(opts.canvasId);
    const emptyEl = document.getElementById(opts.emptyId);
    if (!canvas) return;

    if (typeof global.Chart === 'undefined') {
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = 'Chart library failed to load.';
      }
      canvas.hidden = true;
      return;
    }

    const list = Array.isArray(opts.rowsNewestFirst) ? opts.rowsNewestFirst : [];
    const chronological = [...list].reverse();
    const hasAny = chronological.some((r) => Data.sumDayHours(r) > 0);

    destroyStacked();

    if (!hasAny) {
      canvas.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = NO_DATA_MSG;
      }
      return;
    }

    canvas.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    const labels = chronological.map((r) => Data.formatChartDayLabel(r.date ? String(r.date) : ''));

    const pick = (r, k) => {
      const v = r && typeof r === 'object' ? r[k] : undefined;
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    };

    const coding = chronological.map((r) => pick(r, 'coding_hours'));
    const browsing = chronological.map((r) => pick(r, 'browsing_hours'));
    const meetings = chronological.map((r) => pick(r, 'meeting_hours'));
    const idle = chronological.map((r) => pick(r, 'idle_hours'));

    const barCtx = canvas.getContext('2d');
    if (!barCtx) return;

    const barRadius = 5;
    const barDataset = (label, data, bg) => ({
      label,
      data,
      backgroundColor: bg,
      borderColor: BAR_BORDER,
      borderWidth: 1,
      borderRadius: barRadius,
      borderSkipped: false,
      maxBarThickness: 52,
    });

    stackedChart = new global.Chart(barCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          barDataset('Coding', coding, COLORS.coding),
          barDataset('Browsing', browsing, COLORS.browsing),
          barDataset('Meetings', meetings, COLORS.meetings),
          barDataset('Idle', idle, COLORS.idle),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.05,
        animation: commonAnimation,
        interaction: { mode: 'index', intersect: false },
        hover: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            align: 'center',
            labels: {
              color: '#a8b0c0',
              padding: 16,
              boxWidth: 10,
              boxHeight: 10,
              font: { ...FONT, size: 11 },
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
          tooltip: {
            backgroundColor: '#1a1d27',
            borderColor: 'rgba(124, 140, 255, 0.2)',
            borderWidth: 1,
            titleColor: '#f0f2f5',
            titleFont: FONT_TITLE,
            bodyColor: '#a8b0c0',
            bodyFont: FONT,
            padding: 12,
            cornerRadius: 10,
            caretPadding: 10,
            callbacks: {
              label(ctx) {
                const v = typeof ctx.parsed.y === 'number' ? ctx.parsed.y : 0;
                return ` ${ctx.dataset.label}: ${v.toFixed(1)} h`;
              },
              footer(items) {
                if (!items.length) return '';
                let t = 0;
                for (const it of items) {
                  const v = typeof it.parsed.y === 'number' ? it.parsed.y : 0;
                  t += v;
                }
                return ` Total: ${t.toFixed(1)} h`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ...scaleDefaults,
            title: {
              display: true,
              text: 'Day',
              color: AXIS,
              font: FONT_TITLE,
              padding: { top: 14, bottom: 0 },
            },
            ticks: { ...scaleDefaults.ticks, maxRotation: 40, autoSkip: false },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ...scaleDefaults,
            title: {
              display: true,
              text: 'Time (hours)',
              color: AXIS,
              font: FONT_TITLE,
              padding: { bottom: 8, top: 0 },
            },
            ticks: {
              ...scaleDefaults.ticks,
              callback(v) {
                return `${v} h`;
              },
            },
          },
        },
      },
    });
  }

  function destroyAll() {
    destroyFocus();
    destroyStacked();
  }

  global.InsightsWeeklyCharts = {
    renderFocusTrend,
    renderStackedActivity,
    destroyAll,
  };
})(window);
