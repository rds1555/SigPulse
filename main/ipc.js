/**
 * IPC handlers for renderer ↔ main communication.
 * All handlers return a consistent shape: { ok, ... } or { ok, error } on failure.
 *
 * Secrets: Never pass GROQ_API_KEY, OPENAI_* keys, or raw .env contents to the renderer.
 * AI generation runs entirely in the main process (see summary.generateDailySummary).
 */

const fs = require('fs');
const path = require('path');
const { ipcMain, shell, nativeImage } = require('electron');
const groqCredentials = require('./groq-credentials');

const LOG_PREFIX = '[IPC]';

/**
 * Wraps an async handler to catch errors and return { ok: false, error }.
 * @param {(event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>} fn
 * @returns {(event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<{ ok: boolean, error?: string, [k: string]: unknown }>}
 */
function safeHandler(fn) {
  return async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (err) {
      const message = err?.message ?? String(err);
      console.error(LOG_PREFIX, message);
      return { ok: false, error: message };
    }
  };
}

/**
 * Registers all IPC handlers. Call once after app is ready.
 * @param {{ storage: object, summary: object, tracker: object, demoMode: object }} deps
 */
function registerIpcHandlers(deps) {
  const { storage, summary, tracker, demoMode } = deps;

  // ---- Tracking control ----
  ipcMain.handle('start-tracking', () => {
    tracker.startAll();
    return Promise.resolve();
  });

  ipcMain.handle('pause-tracking', () => {
    tracker.stopAll();
    return Promise.resolve();
  });

  ipcMain.handle('resume-tracking', () => {
    tracker.startAll();
    return Promise.resolve();
  });

  ipcMain.handle('stop-tracking', () => {
    tracker.stopAll();
    return Promise.resolve();
  });

  // ---- Data mutations ----
  ipcMain.handle('delete-today-data', safeHandler(async () => {
    storage.deleteTodayData();
    return { ok: true };
  }));

  // ---- Demo mode (presentation) ----
  ipcMain.handle('get-demo-mode', () => Promise.resolve({ ok: true, demoMode: demoMode.isDemoMode() }));
  ipcMain.handle('set-demo-mode', (_, value) => {
    demoMode.setDemoMode(value);
    return Promise.resolve({ ok: true, demoMode: demoMode.isDemoMode() });
  });

  // ---- Privacy settings ----
  ipcMain.handle('get-settings', safeHandler(async () => {
    const settings = storage.getSettings();
    return { ok: true, settings };
  }));

  ipcMain.handle('set-settings', safeHandler(async (_, next) => {
    storage.setSettings(next || {});
    return { ok: true, settings: storage.getSettings() };
  }));

  ipcMain.handle('get-groq-api-key-status', () => {
    return { ok: true, configured: groqCredentials.hasGroqApiKey() };
  });

  ipcMain.handle(
    'save-groq-api-key',
    safeHandler(async (_, key) => {
      const k = typeof key === 'string' ? key.trim() : '';
      if (!k) {
        return { ok: false, error: 'Groq API key cannot be empty.' };
      }
      groqCredentials.setGroqApiKey(k);
      return { ok: true };
    }),
  );

  ipcMain.handle(
    'test-groq-api-key',
    safeHandler(async (_, keyFromRenderer) => {
      const trimmed = typeof keyFromRenderer === 'string' ? keyFromRenderer.trim() : '';
      const key =
        trimmed ||
        groqCredentials.getGroqApiKey() ||
        (process.env.GROQ_API_KEY && String(process.env.GROQ_API_KEY).trim()) ||
        '';
      if (!key) {
        return {
          ok: false,
          error: 'No API key to test. Paste a key above or save one in Settings.',
        };
      }
      return summary.testGroqApiKeyConnection(key);
    }),
  );

  // ---- Read-only data (dashboard / modal) ----
  ipcMain.handle('get-screenshots-metadata', safeHandler(async () => {
    const data = storage.getScreenshotsMetadata();
    return { ok: true, entries: data.entries ?? [] };
  }));

  ipcMain.handle('get-activity-summary', safeHandler(async () => {
    const hoursByCategory = storage.getActivitySummary();
    storage.syncTodayActivityLog();
    return { ok: true, hoursByCategory };
  }));

  ipcMain.handle('get-focus-score', safeHandler(async () => {
    const result = storage.getFocusScore();
    const comparison = storage.getFocusScoreYesterdayComparison();
    return { ok: true, score: result.score, label: result.label, comparison };
  }));

  ipcMain.handle('get-activity-insight-bullets', safeHandler(async () => {
    const bullets = storage.getActivityInsightBullets();
    return { ok: true, bullets };
  }));

  ipcMain.handle('get-activity-history-days', safeHandler(async (_, n) => {
    const days = typeof n === 'number' ? n : 7;
    const clamped = Math.min(Math.max(1, Math.floor(days)), 31);
    const rows = storage.getLastNDaysData(clamped);
    return { ok: true, days: rows };
  }));

  // ---- AI summary ----
  ipcMain.handle('get-daily-ai-summary', safeHandler(async () => {
    const { text, generatedAt, structured } = storage.getDailyAiSummary();
    return { ok: true, text, generatedAt, structured: structured ?? null };
  }));

  /**
   * Dashboard: return today's summary from storage if any; otherwise generate, save, and return.
   */
  ipcMain.handle('ensure-todays-daily-summary', safeHandler(async () => {
    if (demoMode.isDemoMode()) {
      const cached = storage.getTodaysStoredDailySummary();
      if (cached) {
        return {
          ok: true,
          text: cached.text,
          generatedAt: cached.generatedAt,
          structured: cached.structured ?? null,
          cached: true,
        };
      }
      return { ok: true, text: '', generatedAt: null, structured: null, cached: true };
    }
    storage.syncTodayActivityLog();
    const cached = storage.getTodaysStoredDailySummary();
    if (cached) {
      return {
        ok: true,
        text: cached.text,
        generatedAt: cached.generatedAt,
        structured: cached.structured ?? null,
        cached: true,
      };
    }
    const activitySummary = storage.getActivitySummary();
    const focusScore = storage.getFocusScore();
    const preprocessorSignals = storage.getDailySummaryPreprocessorSignals(activitySummary);
    const behavioralSignals = storage.getBehavioralSignalsFromActivity(activitySummary);
    const result = await summary.generateDailySummary(
      activitySummary,
      focusScore,
      preprocessorSignals,
      behavioralSignals,
    );
    if (result.ok && result.text) {
      storage.saveDailyAiSummary(result.text);
      const after = storage.getDailyAiSummary();
      return {
        ok: true,
        text: result.text,
        structured: result.structured ?? after.structured ?? null,
        generatedAt: after.generatedAt,
        cached: false,
      };
    }
    return {
      ok: false,
      error: result.error || 'Could not generate summary',
      errorCode: result.errorCode,
      text: '',
      generatedAt: null,
      structured: null,
      cached: false,
    };
  }));

  // AI runs in main only; response must never include API keys (summary layer sanitizes errors).
  ipcMain.handle('generate-daily-summary', safeHandler(async () => {
    if (demoMode.isDemoMode()) {
      const { text, generatedAt } = storage.getDailyAiSummary();
      return { ok: true, text: text || '', generatedAt: generatedAt ?? null };
    }
    storage.syncTodayActivityLog();
    const activitySummary = storage.getActivitySummary();
    const focusScore = storage.getFocusScore();
    const preprocessorSignals = storage.getDailySummaryPreprocessorSignals(activitySummary);
    const behavioralSignals = storage.getBehavioralSignalsFromActivity(activitySummary);
    const result = await summary.generateDailySummary(
      activitySummary,
      focusScore,
      preprocessorSignals,
      behavioralSignals,
    );
    if (result.ok && result.text) {
      storage.saveDailyAiSummary(result.text);
      const after = storage.getDailyAiSummary();
      return {
        ok: true,
        text: result.text,
        structured: result.structured ?? after.structured ?? null,
        generatedAt: after.generatedAt,
      };
    }
    return result;
  }));

  // ---- Open screenshot in system default app ----
  ipcMain.handle('open-screenshot', safeHandler(async (_, fileName) => {
    if (!fileName || typeof fileName !== 'string') {
      return { ok: false, error: 'Invalid fileName' };
    }
    const fullPath = path.join(storage.getScreenshotsDir(), fileName);
    await shell.openPath(fullPath);
    return { ok: true };
  }));

  /**
   * PNG thumbnail as data URL for dashboard grid (renderer CSP-safe).
   * Demo mode or missing files return a neutral SVG placeholder.
   */
  ipcMain.handle('get-screenshot-thumbnail', safeHandler(async (_, fileName, maxWidth) => {
    if (!fileName || typeof fileName !== 'string' || /[/\\]/.test(fileName)) {
      return { ok: false, error: 'Invalid fileName' };
    }
    const safeName = path.basename(fileName);
    if (safeName !== fileName) {
      return { ok: false, error: 'Invalid fileName' };
    }

    const maxW = typeof maxWidth === 'number' && maxWidth > 0 ? Math.min(maxWidth, 800) : 360;

    const placeholderSvg = () => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="202" viewBox="0 0 360 202"><rect fill="#2a2f3d" width="360" height="202" rx="8"/><path fill="none" stroke="#4b5568" stroke-width="1.5" d="M120 130l40-48 32 38 48-62 40 72H120z"/><circle cx="148" cy="88" r="12" fill="#4b5568"/><text x="180" y="188" text-anchor="middle" fill="#6b7280" font-family="Segoe UI,system-ui,sans-serif" font-size="12">No preview</text></svg>`;
      return { ok: true, dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, placeholder: true };
    };

    if (demoMode.isDemoMode()) {
      return placeholderSvg();
    }

    const fullPath = path.join(storage.getScreenshotsDir(), safeName);
    if (!fs.existsSync(fullPath)) {
      return placeholderSvg();
    }

    const img = nativeImage.createFromPath(fullPath);
    if (img.isEmpty()) {
      return placeholderSvg();
    }

    const { width, height } = img.getSize();
    let w = width;
    let h = height;
    if (w > maxW) {
      h = Math.round((height * maxW) / width);
      w = maxW;
    }
    const resized = w === width && h === height ? img : img.resize({ width: w, height: h, quality: 'good' });
    return { ok: true, dataUrl: resized.toDataURL(), placeholder: false };
  }));

  const { registerUpdaterIpc } = require('./updater');
  registerUpdaterIpc(ipcMain);
}

module.exports = { registerIpcHandlers };
