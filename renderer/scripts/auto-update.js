/**
 * Packaged-app update banner: notify, download with progress, restart to install.
 */
(function initAutoUpdateUi() {
  const api = window.sigpulse;
  if (
    !api ||
    typeof api.onAutoUpdateAvailable !== 'function' ||
    typeof api.onAutoUpdateCheckFailed !== 'function' ||
    typeof api.autoUpdateDownload !== 'function'
  ) {
    return;
  }

  const banner = document.getElementById('auto-update-banner');
  const textEl = document.getElementById('auto-update-banner-text');
  const progress = document.getElementById('auto-update-progress');
  const btnDownload = document.getElementById('btn-auto-update-download');
  const btnRestart = document.getElementById('btn-auto-update-restart');
  const btnDismiss = document.getElementById('btn-auto-update-dismiss');
  if (!banner || !textEl || !progress || !btnDownload || !btnRestart || !btnDismiss) return;

  function openBanner() {
    banner.hidden = false;
  }

  function resetProgress() {
    progress.value = 0;
  }

  api.onAutoUpdateAvailable((info) => {
    openBanner();
    const suffix = info && info.version ? ` (v${info.version})` : '';
    textEl.textContent = `Update available${suffix}`;
    btnDownload.hidden = false;
    btnDownload.disabled = false;
    btnRestart.hidden = true;
    progress.hidden = true;
    resetProgress();
  });

  api.onAutoUpdateProgress((p) => {
    const pct = typeof p.percent === 'number' ? Math.round(p.percent) : 0;
    progress.value = Math.min(100, Math.max(0, pct));
  });

  api.onAutoUpdateDownloaded(() => {
    hideCheckFailureChrome();
    textEl.textContent = 'Update ready. Restart to install.';
    progress.hidden = true;
    resetProgress();
    btnDownload.hidden = true;
    btnRestart.hidden = false;
  });

  api.onAutoUpdateError((payload) => {
    hideCheckFailureChrome();
    const raw = payload && payload.message ? String(payload.message) : '';
    const looksNetwork = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|network|fetch|TLS|certificate/i.test(raw);
    textEl.textContent = looksNetwork
      ? "Couldn't download the update. Check your connection and try again."
      : "Couldn't download the update. Please try again.";
    progress.hidden = true;
    resetProgress();
    btnDownload.hidden = false;
    btnDownload.disabled = false;
  });

  btnDismiss.addEventListener('click', () => {
    banner.hidden = true;
    btnDismiss.hidden = true;
  });

  btnDownload.addEventListener('click', async () => {
    hideCheckFailureChrome();
    btnDownload.disabled = true;
    progress.hidden = false;
    resetProgress();
    textEl.textContent = 'Downloading update…';
    try {
      const res = await api.autoUpdateDownload();
      if (!res || !res.ok) {
        textEl.textContent = res && res.error ? res.error : 'Download failed.';
        btnDownload.disabled = false;
        progress.hidden = true;
      }
    } catch (err) {
      const msg = err && err.message ? err.message : 'Download failed.';
      textEl.textContent = msg;
      btnDownload.disabled = false;
      progress.hidden = true;
    }
  });

  btnRestart.addEventListener('click', () => {
    api.autoUpdateQuitAndInstall();
  });
})();
