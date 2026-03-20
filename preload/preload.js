/**
 * Preload script: exposes a safe API to the renderer via contextBridge.
 *
 * Security (API keys & secrets):
 * - Never expose process.env, API keys, or file paths to secrets here.
 * - LLM calls use ipcRenderer.invoke('generate-daily-summary') only; keys live in main/summary.js.
 * - Groq key: save/status/test via dedicated IPC; the stored key is never read back into the renderer (test accepts optional pasted key).
 * - All entries below are thin IPC bridges — no credentials cross into the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sigpulse', {
  startTracking: () => ipcRenderer.invoke('start-tracking'),
  pauseTracking: () => ipcRenderer.invoke('pause-tracking'),
  resumeTracking: () => ipcRenderer.invoke('resume-tracking'),
  stopTracking: () => ipcRenderer.invoke('stop-tracking'),
  deleteTodayData: () => ipcRenderer.invoke('delete-today-data'),
  generateDailySummary: () => ipcRenderer.invoke('generate-daily-summary'),
  ensureTodaysDailySummary: () => ipcRenderer.invoke('ensure-todays-daily-summary'),
  getDailyAiSummary: () => ipcRenderer.invoke('get-daily-ai-summary'),
  getScreenshotsMetadata: () => ipcRenderer.invoke('get-screenshots-metadata'),
  getActivitySummary: () => ipcRenderer.invoke('get-activity-summary'),
  getFocusScore: () => ipcRenderer.invoke('get-focus-score'),
  getActivityInsightBullets: () => ipcRenderer.invoke('get-activity-insight-bullets'),
  getActivityHistoryDays: (n) => ipcRenderer.invoke('get-activity-history-days', n),
  openScreenshot: (fileName) => ipcRenderer.invoke('open-screenshot', fileName),
  getScreenshotThumbnail: (fileName, maxWidth) =>
    ipcRenderer.invoke('get-screenshot-thumbnail', fileName, maxWidth),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (next) => ipcRenderer.invoke('set-settings', next),
  getGroqApiKeyStatus: () => ipcRenderer.invoke('get-groq-api-key-status'),
  saveGroqApiKey: (key) => ipcRenderer.invoke('save-groq-api-key', key),
  testGroqApiKey: (key) => ipcRenderer.invoke('test-groq-api-key', key),
  getDemoMode: () => ipcRenderer.invoke('get-demo-mode'),
  setDemoMode: (value) => ipcRenderer.invoke('set-demo-mode', value),

  autoUpdateDownload: () => ipcRenderer.invoke('auto-update-download'),
  autoUpdateQuitAndInstall: () => ipcRenderer.invoke('auto-update-quit-and-install'),
  onAutoUpdateAvailable: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('auto-update-available', handler);
  },
  onAutoUpdateProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('auto-update-progress', handler);
  },
  onAutoUpdateDownloaded: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('auto-update-downloaded', handler);
  },
  onAutoUpdateError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('auto-update-error', handler);
  },
  onAutoUpdateCheckFailed: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('auto-update-check-failed', handler);
  },
});
