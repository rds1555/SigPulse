/**
 * Settings → AI Configuration: Groq API key (masked input, main-process storage via IPC).
 */

(function initAiSettings() {
  const input = document.getElementById('setting-groq-api-key');
  const btnToggle = document.getElementById('btn-toggle-groq-key-visibility');
  const btnTest = document.getElementById('btn-test-groq-key');
  const btnSave = document.getElementById('btn-save-groq-key');
  const messageEl = document.getElementById('groq-key-save-message');
  const statusEl = document.getElementById('groq-api-key-status');

  if (!input || !btnToggle || !btnTest || !btnSave || typeof window.sigpulse === 'undefined') {
    return;
  }

  let showingPlain = false;

  /**
   * @param {'pending' | 'ok' | 'missing'} state
   * @param {string} text
   */
  function setApiKeyStatus(state, text) {
    if (!statusEl) return;
    statusEl.classList.remove('groq-api-status--pending', 'groq-api-status--ok', 'groq-api-status--missing');
    statusEl.classList.add(
      state === 'ok' ? 'groq-api-status--ok' : state === 'missing' ? 'groq-api-status--missing' : 'groq-api-status--pending',
    );
    const label = statusEl.querySelector('.groq-api-status__text');
    if (label) label.textContent = text;
  }

  function refreshApiKeyStatus() {
    return window.sigpulse
      .getGroqApiKeyStatus()
      .then((res) => {
        if (res?.ok && res.configured) {
          setApiKeyStatus('ok', 'API Key Configured');
        } else {
          setApiKeyStatus('missing', 'Not Configured');
        }
      })
      .catch(() => {
        setApiKeyStatus('missing', 'Not Configured');
      });
  }

  function setMessage(text, kind) {
    if (!messageEl) return;
    messageEl.hidden = !text;
    messageEl.textContent = text || '';
    messageEl.classList.remove('is-success', 'is-error');
    if (kind === 'success') messageEl.classList.add('is-success');
    if (kind === 'error') messageEl.classList.add('is-error');
  }

  function syncToggleLabel() {
    btnToggle.textContent = showingPlain ? 'Hide' : 'Show';
    btnToggle.setAttribute('aria-pressed', showingPlain ? 'true' : 'false');
  }

  btnToggle.addEventListener('click', () => {
    showingPlain = !showingPlain;
    input.type = showingPlain ? 'text' : 'password';
    syncToggleLabel();
  });
  syncToggleLabel();

  btnTest.addEventListener('click', () => {
    setMessage('', null);
    btnTest.disabled = true;
    btnTest.setAttribute('aria-busy', 'true');
    const candidate = (input.value || '').trim();
    window.sigpulse
      .testGroqApiKey(candidate)
      .then((res) => {
        if (res?.ok) {
          setMessage('API key works — Groq responded successfully.', 'success');
        } else {
          setMessage(res?.error || 'API key test failed.', 'error');
        }
      })
      .catch(() => {
        setMessage('Could not reach Groq. Check your network and try again.', 'error');
      })
      .finally(() => {
        btnTest.disabled = false;
        btnTest.setAttribute('aria-busy', 'false');
      });
  });

  btnSave.addEventListener('click', () => {
    setMessage('', null);
    const value = (input.value || '').trim();
    if (!value) {
      setMessage('Enter a Groq API key before saving.', 'error');
      input.focus();
      return;
    }
    btnSave.disabled = true;
    window.sigpulse
      .saveGroqApiKey(value)
      .then((res) => {
        if (res?.ok) {
          input.value = '';
          setMessage('API key saved. You can refresh insights from the dashboard.', 'success');
          setApiKeyStatus('ok', 'API Key Configured');
        } else {
          setMessage(res?.error || 'Could not save API key.', 'error');
        }
      })
      .catch(() => {
        setMessage('Could not save API key.', 'error');
      })
      .finally(() => {
        btnSave.disabled = false;
      });
  });

  refreshApiKeyStatus();
})();
