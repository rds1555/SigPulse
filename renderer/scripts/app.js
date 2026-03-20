/**
 * SigPulse renderer: tracking controls and inline summary.
 *
 * - State: mode is 'off' | 'running' | 'paused'. UI and IPC stay in sync.
 * - Start/Pause/Resume/Stop call main via window.sigpulse; errors are logged and UI still updates.
 */

const state = {
  mode: 'off',
};

const selectors = {
  statusIndicator: document.getElementById('status-indicator'),
  btnStart: document.getElementById('btn-start'),
  btnPause: document.getElementById('btn-pause'),
  btnResume: document.getElementById('btn-resume'),
  btnStop: document.getElementById('btn-stop'),
  btnDeleteToday: document.getElementById('btn-delete-today'),
  trackingActiveBanner: document.getElementById('tracking-active-banner'),
  trackingActiveText: document.getElementById('tracking-active-text'),
  trackingActiveDetail: document.getElementById('tracking-active-detail'),
  settingScreenshots: document.getElementById('setting-screenshots'),
  settingGentleNudges: document.getElementById('setting-gentle-nudges'),
  settingBlacklist: document.getElementById('setting-blacklist'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  settingDemoMode: document.getElementById('setting-demo-mode'),
  demoModeNotice: document.getElementById('demo-mode-notice'),
  btnViewOnboarding: document.getElementById('btn-view-onboarding'),
  insightsLayoutRadios: () => document.querySelectorAll('input[name="setting-insights-layout"]'),
};

function setMode(newMode) {
  state.mode = newMode;
  if (typeof window.sigpulse === 'undefined') {
    updateUI();
    return;
  }
  try {
    if (newMode === 'running') {
      window.sigpulse.startTracking().catch((err) => console.error('Start tracking failed:', err));
    } else if (newMode === 'off') {
      window.sigpulse.stopTracking().catch((err) => console.error('Stop tracking failed:', err));
    } else if (newMode === 'paused') {
      window.sigpulse.pauseTracking().catch((err) => console.error('Pause tracking failed:', err));
    }
  } catch (err) {
    console.error('setMode IPC failed:', err);
  }
  updateUI();
}

function resumeTracking() {
  if (state.mode !== 'paused') return;
  state.mode = 'running';
  if (typeof window.sigpulse !== 'undefined') {
    window.sigpulse.resumeTracking().catch((err) => console.error('Resume tracking failed:', err));
  }
  updateUI();
}

function updateUI() {
  const { statusIndicator, btnStart, btnPause, btnResume, btnStop, btnDeleteToday } = selectors;
  if (!statusIndicator || !btnStart || !btnStop) return;

  statusIndicator.classList.remove('status-on', 'status-off', 'status-paused');
  if (state.mode === 'running') {
    statusIndicator.textContent = 'Tracking ON';
    statusIndicator.classList.add('status-on');
    btnStart.disabled = true;
    if (btnPause) btnPause.disabled = false;
    if (btnResume) btnResume.disabled = true;
    btnStop.disabled = false;
  } else if (state.mode === 'paused') {
    statusIndicator.textContent = 'Paused';
    statusIndicator.classList.add('status-paused');
    btnStart.disabled = true;
    if (btnPause) btnPause.disabled = true;
    if (btnResume) btnResume.disabled = false;
    btnStop.disabled = false;
  } else {
    statusIndicator.textContent = 'Tracking OFF';
    statusIndicator.classList.add('status-off');
    btnStart.disabled = false;
    if (btnPause) btnPause.disabled = true;
    if (btnResume) btnResume.disabled = true;
    btnStop.disabled = true;
  }

  if (btnDeleteToday) btnDeleteToday.disabled = false;

  // Show or hide tracking-active banner and update its text (transparency)
  const banner = selectors.trackingActiveBanner;
  const textEl = selectors.trackingActiveText;
  const detailEl = selectors.trackingActiveDetail;
  if (state.mode === 'running' || state.mode === 'paused') {
    if (banner) banner.hidden = false;
    if (typeof window.sigpulse !== 'undefined') {
      window.sigpulse.getSettings().then((res) => {
        if (!res?.ok || !res.settings) return;
        const s = res.settings;
        const screenshotsLine = 'Screenshots: ' + (s.screenshotsEnabled ? 'On' : 'Off');
        const blacklistCount = (s.appBlacklist && s.appBlacklist.length) || 0;
        const appLine = 'App usage: On' + (blacklistCount > 0 ? ` (${blacklistCount} blacklisted)` : '');
        const idleLine = 'Idle: On';
        if (textEl) textEl.textContent = [screenshotsLine, appLine, idleLine].join(' · ');
        if (detailEl) detailEl.textContent = 'Data is stored locally in this app\'s folder.';
      }).catch((err) => console.error('getSettings failed:', err));
    }
  } else {
    if (banner) banner.hidden = true;
  }
}

function readInsightsLayoutFromForm() {
  const radios = selectors.insightsLayoutRadios();
  const checked = radios && radios.length ? Array.from(radios).find((r) => r.checked) : null;
  return checked && checked.value === 'banner' ? 'banner' : 'classic';
}

function applyInsightsLayoutRadios(settings) {
  const v = settings?.insightsCardStyle === 'banner' ? 'banner' : 'classic';
  const radios = selectors.insightsLayoutRadios();
  if (radios && radios.length) {
    radios.forEach((r) => {
      r.checked = r.value === v;
    });
  }
  if (typeof window.applyInsightsLayoutFromSettings === 'function') {
    window.applyInsightsLayoutFromSettings(settings);
  }
}

/** Load privacy settings from main into the form. */
function loadPrivacySettings() {
  if (typeof window.sigpulse === 'undefined') return;
  window.sigpulse.getSettings().then((res) => {
    if (!res?.ok || !res.settings) return;
    const s = res.settings;
    if (selectors.settingScreenshots) selectors.settingScreenshots.checked = s.screenshotsEnabled !== false;
    if (selectors.settingGentleNudges) selectors.settingGentleNudges.checked = s.gentleNudgesEnabled !== false;
    if (selectors.settingBlacklist && Array.isArray(s.appBlacklist)) {
      selectors.settingBlacklist.value = s.appBlacklist.join(', ');
    }
    applyInsightsLayoutRadios(s);
  }).catch((err) => console.error('loadPrivacySettings failed:', err));
}

/** Load demo mode state and show/hide the notice. */
function loadDemoMode() {
  if (typeof window.sigpulse === 'undefined') return Promise.resolve();
  return window.sigpulse
    .getDemoMode()
    .then((res) => {
      if (!res?.ok) return;
      const on = !!res.demoMode;
      if (selectors.settingDemoMode) selectors.settingDemoMode.checked = on;
      if (selectors.demoModeNotice) selectors.demoModeNotice.hidden = !on;
    })
    .catch((err) => console.error('loadDemoMode failed:', err));
}

/** Toggle demo mode and refresh dashboard/modal data. */
function setDemoModeFromUI(on) {
  if (typeof window.sigpulse === 'undefined') return;
  window.sigpulse.setDemoMode(on).then((res) => {
    if (!res?.ok) return;
    if (selectors.demoModeNotice) selectors.demoModeNotice.hidden = !res.demoMode;
    window.dispatchEvent(new CustomEvent('sigpulse-demo-mode-changed', { detail: { demoMode: res.demoMode } }));
    if (typeof window.refreshWeeklyInsightsPage === 'function') {
      window.refreshWeeklyInsightsPage();
    }
  }).catch((err) => console.error('setDemoMode failed:', err));
}

/** Save privacy form and refresh tracking banner if active. */
function savePrivacySettings() {
  if (typeof window.sigpulse === 'undefined') return;
  const screenshotsEnabled = selectors.settingScreenshots ? selectors.settingScreenshots.checked : true;
  const gentleNudgesEnabled = selectors.settingGentleNudges ? selectors.settingGentleNudges.checked : true;
  const raw = selectors.settingBlacklist ? selectors.settingBlacklist.value : '';
  const appBlacklist = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const insightsCardStyle = readInsightsLayoutFromForm();
  window.sigpulse
    .setSettings({ screenshotsEnabled, gentleNudgesEnabled, appBlacklist, insightsCardStyle })
    .then((res) => {
      if (res?.ok) {
        if (res.settings) applyInsightsLayoutRadios(res.settings);
        if (state.mode === 'running' || state.mode === 'paused') updateUI();
        window.dispatchEvent(new CustomEvent('sigpulse-insights-layout-changed'));
      }
    })
    .catch((err) => console.error('savePrivacySettings failed:', err));
}

function persistInsightsLayoutOnly() {
  if (typeof window.sigpulse === 'undefined') return;
  const insightsCardStyle = readInsightsLayoutFromForm();
  window.sigpulse
    .setSettings({ insightsCardStyle })
    .then((res) => {
      if (res?.ok && res.settings) {
        applyInsightsLayoutRadios(res.settings);
        window.dispatchEvent(new CustomEvent('sigpulse-insights-layout-changed'));
      }
    })
    .catch((err) => console.error('persistInsightsLayoutOnly failed:', err));
}

function init() {
  const { btnStart, btnPause, btnResume, btnStop, btnDeleteToday } = selectors;

  window.addEventListener('sigpulse-post-onboarding', (e) => {
    if (e.detail && e.detail.startTracking) {
      setMode('running');
    }
  });

  if (selectors.btnViewOnboarding) {
    selectors.btnViewOnboarding.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('sigpulse-open-onboarding'));
    });
  }

  if (btnStart) btnStart.addEventListener('click', () => setMode('running'));
  if (btnStop) btnStop.addEventListener('click', () => setMode('off'));
  if (btnPause) btnPause.addEventListener('click', () => setMode('paused'));
  if (btnResume) btnResume.addEventListener('click', resumeTracking);

  if (selectors.btnSaveSettings && typeof window.sigpulse !== 'undefined') {
    selectors.btnSaveSettings.addEventListener('click', savePrivacySettings);
  }
  loadPrivacySettings();

  selectors.insightsLayoutRadios().forEach((radio) => {
    radio.addEventListener('change', () => persistInsightsLayoutOnly());
  });

  if (selectors.settingDemoMode && typeof window.sigpulse !== 'undefined') {
    selectors.settingDemoMode.addEventListener('change', () => {
      setDemoModeFromUI(selectors.settingDemoMode.checked);
    });
  }
  loadDemoMode().then(() => {
    if (typeof window.refreshWeeklyInsightsPage === 'function') {
      window.refreshWeeklyInsightsPage();
    }
  });

  if (btnDeleteToday && typeof window.sigpulse !== 'undefined') {
    btnDeleteToday.addEventListener('click', () => {
      if (!confirm("Delete all of today's tracking data (screenshots, activity, idle)? This cannot be undone.")) {
        return;
      }
      window.sigpulse
        .deleteTodayData()
        .then((result) => {
          if (result?.ok) {
            alert("Today's data has been deleted.");
          } else {
            alert('Delete failed: ' + (result?.error ?? 'Unknown error'));
          }
        })
        .catch((err) => {
          console.error('Delete today failed:', err);
          alert('Delete failed.');
        });
    });
  }

  updateUI();
}

init();
