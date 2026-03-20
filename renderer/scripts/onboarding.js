/**
 * First-run onboarding: shown when settings.isFirstLaunch === true (new install).
 * Persists isFirstLaunch: false via setSettings; dispatches sigpulse-post-onboarding to start tracking.
 */
(function () {
  const STEP_COUNT = 4;

  /** When true, opened from Settings — do not change `isFirstLaunch` on skip/finish. */
  let isRevisitSession = false;

  /** Avoid stacking duplicate click handlers when reopening onboarding. */
  let rootClickHandler = null;

  /**
   * @returns {HTMLElement | null}
   */
  function getRoot() {
    return document.getElementById('onboarding-root');
  }

  function buildMarkup() {
    const root = getRoot();
    if (!root) return;

    const segmentsHtml = Array.from(
      { length: STEP_COUNT },
      (_, i) => `<span class="onboarding-progress-segment" data-segment="${i}" aria-hidden="true"></span>`,
    ).join('');

    const dotsHtml = Array.from(
      { length: STEP_COUNT },
      (_, i) => `<span class="onboarding-progress-dot" data-dot="${i}" aria-hidden="true"></span>`,
    ).join('');

    root.innerHTML = `
      <div
        class="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-live-title"
      >
        <div class="onboarding-card-header">
          <button
            type="button"
            class="onboarding-skip"
            data-action="skip"
            aria-label="Skip onboarding and go to dashboard"
          >
            Skip
          </button>
        </div>
        <div class="onboarding-progress-wrap">
          <p class="onboarding-progress-eyebrow">Getting started</p>
          <p class="onboarding-step-counter" role="status" aria-live="polite" aria-atomic="true">
            <span class="onboarding-step-counter-prefix">Step </span><span class="onboarding-step-counter-current" data-onboarding-step-num>1</span><span class="onboarding-step-counter-dim"> of ${STEP_COUNT}</span>
          </p>
          <div
            class="onboarding-progress-track"
            role="progressbar"
            aria-valuemin="1"
            aria-valuemax="${STEP_COUNT}"
            aria-valuenow="1"
            aria-valuetext="Step 1 of ${STEP_COUNT}"
            aria-label="Onboarding progress"
          >
            ${segmentsHtml}
          </div>
          <div class="onboarding-progress-dots" role="presentation">
            ${dotsHtml}
          </div>
        </div>
        <div class="onboarding-steps">
          <div class="onboarding-step" data-step="0">
            <div class="onboarding-step-animate onboarding-step-animate--in">
              <p class="onboarding-eyebrow">SigPulse</p>
              <h2 class="onboarding-title">Welcome to SigPulse</h2>
              <p class="onboarding-subtitle">Understand how you work. Improve your focus.</p>
              <div class="onboarding-actions">
                <button type="button" class="btn btn-today-primary" data-action="next">Get Started</button>
              </div>
            </div>
          </div>
          <div class="onboarding-step" data-step="1" hidden>
            <div class="onboarding-step-animate">
              <h2 class="onboarding-title">Features Overview</h2>
              <ul class="onboarding-list">
                <li>Tracks your work patterns</li>
                <li>Provides daily insights and weekly charts</li>
                <li>Helps improve focus and productivity</li>
              </ul>
              <div class="onboarding-actions">
                <button type="button" class="btn btn-today-primary" data-action="next">Next</button>
              </div>
            </div>
          </div>
          <div class="onboarding-step" data-step="2" hidden>
            <div class="onboarding-step-animate">
              <h2 class="onboarding-title">Your Privacy Matters</h2>
              <ul class="onboarding-list">
                <li>Data is stored locally</li>
                <li>You can pause tracking anytime</li>
                <li>No hidden monitoring</li>
              </ul>
              <div class="onboarding-actions">
                <button type="button" class="btn btn-today-primary" data-action="next">Continue</button>
              </div>
            </div>
          </div>
          <div class="onboarding-step" data-step="3" hidden>
            <div class="onboarding-step-animate">
              <h2 class="onboarding-title">You're all set!</h2>
              <p class="onboarding-subtitle">Turn on tracking when you're ready to see your first insights.</p>
              <div class="onboarding-actions">
                <button type="button" class="btn btn-today-primary" data-action="finish">Start Tracking</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * @param {number} index
   * @param {HTMLElement} root
   */
  const EXIT_MS = 440;

  /**
   * @param {number} index
   * @param {HTMLElement} root
   * @param {boolean} [isInitialMount]
   */
  function setActiveStep(index, root, isInitialMount = false) {
    const steps = root.querySelectorAll('.onboarding-step');
    const dots = root.querySelectorAll('.onboarding-progress-dot');
    const segments = root.querySelectorAll('.onboarding-progress-segment');
    const stepNumEl = root.querySelector('[data-onboarding-step-num]');
    const progressBar = root.querySelector('[role="progressbar"]');

    steps.forEach((el, i) => {
      const wasActive = el.classList.contains('is-active');
      const title = el.querySelector('.onboarding-title');
      const anim = el.querySelector('.onboarding-step-animate');
      if (title) title.removeAttribute('id');
      el.classList.remove('is-active', 'is-exit');

      if (i === index) {
        el.hidden = false;
        el.classList.add('is-active');
        if (title) title.id = 'onboarding-live-title';
        if (anim) {
          if (isInitialMount && index === 0) {
            /* Step 0: HTML already includes --in; avoid restart to prevent double animation. */
          } else {
            anim.classList.remove('onboarding-step-animate--in');
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                anim.classList.add('onboarding-step-animate--in');
              });
            });
          }
        }
      } else if (wasActive) {
        el.classList.add('is-exit');
        el.hidden = false;
        window.setTimeout(() => {
          if (!el.classList.contains('is-active')) {
            el.hidden = true;
            el.classList.remove('is-exit');
          }
        }, EXIT_MS);
      } else {
        el.hidden = true;
      }
    });

    segments.forEach((seg, i) => {
      seg.classList.toggle('is-done', i < index);
      seg.classList.toggle('is-active', i === index);
    });

    if (stepNumEl) stepNumEl.textContent = String(index + 1);
    if (progressBar) {
      const n = index + 1;
      progressBar.setAttribute('aria-valuenow', String(n));
      progressBar.setAttribute('aria-valuetext', `Step ${n} of ${STEP_COUNT}`);
    }

    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === index);
    });

    const primary = steps[index]?.querySelector('[data-action]');
    if (primary && typeof primary.focus === 'function') {
      requestAnimationFrame(() => primary.focus());
    }
  }

  /**
   * @param {HTMLElement} root
   */
  function showRoot(root) {
    root.hidden = false;
    root.removeAttribute('aria-hidden');
    document.body.classList.add('onboarding-active');
    requestAnimationFrame(() => {
      root.classList.add('is-visible');
    });
  }

  const ONBOARDING_CLOSE_MS = 620;

  /**
   * Fade out overlay, then clear DOM and run optional callback (e.g. navigate / start tracking).
   * @param {HTMLElement | null} root
   * @param {(() => void) | undefined} afterClose
   */
  function hideRoot(root, afterClose) {
    if (!root) {
      if (typeof afterClose === 'function') afterClose();
      return;
    }

    document.body.classList.remove('onboarding-active');
    root.classList.remove('is-visible');
    root.classList.add('is-leaving');

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      root.classList.remove('is-leaving');
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
      root.innerHTML = '';
      if (typeof afterClose === 'function') afterClose();
    };

    const onTransitionEnd = (e) => {
      if (e.target !== root || e.propertyName !== 'opacity') return;
      root.removeEventListener('transitionend', onTransitionEnd);
      done();
    };
    root.addEventListener('transitionend', onTransitionEnd);
    window.setTimeout(done, ONBOARDING_CLOSE_MS + 120);
  }

  async function completeOnboarding() {
    const sp = window.sigpulse;
    const root = getRoot();
    if (!sp || typeof sp.setSettings !== 'function') {
      if (root) hideRoot(root);
      return;
    }
    if (!isRevisitSession) {
      try {
        await sp.setSettings({ isFirstLaunch: false });
      } catch (err) {
        console.error('[Onboarding] setSettings failed:', err);
      }
    }
    hideRoot(root, () => {
      window.dispatchEvent(
        new CustomEvent('sigpulse-post-onboarding', {
          detail: { startTracking: true },
        }),
      );
    });
  }

  async function skipOnboarding() {
    const root = getRoot();
    const sp = window.sigpulse;
    if (!root) return;

    if (!isRevisitSession && sp && typeof sp.setSettings === 'function') {
      try {
        await sp.setSettings({ isFirstLaunch: false });
      } catch (err) {
        console.error('[Onboarding] skip setSettings failed:', err);
      }
    }

    hideRoot(root, () => {
      if (typeof window.sigpulseNavigate === 'function') {
        try {
          window.sigpulseNavigate('dashboard');
        } catch (err) {
          console.error('[Onboarding] navigate to dashboard failed:', err);
        }
      }
    });
  }

  /**
   * @param {HTMLElement} root
   * @param {boolean} initialFirstStep
   */
  function wire(root, initialFirstStep) {
    let stepIndex = 0;
    setActiveStep(0, root, initialFirstStep);

    if (rootClickHandler) {
      root.removeEventListener('click', rootClickHandler);
    }

    rootClickHandler = (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const btn = t.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      if (action === 'next') {
        if (stepIndex < STEP_COUNT - 1) {
          stepIndex += 1;
          setActiveStep(stepIndex, root, false);
        }
      } else if (action === 'finish') {
        completeOnboarding();
      } else if (action === 'skip') {
        skipOnboarding();
      }
    };

    root.addEventListener('click', rootClickHandler);
  }

  async function maybeStartOnboarding() {
    const root = getRoot();
    if (!root || typeof window.sigpulse === 'undefined' || typeof window.sigpulse.getSettings !== 'function') {
      return;
    }

    let res;
    try {
      res = await window.sigpulse.getSettings();
    } catch (err) {
      console.error('[Onboarding] getSettings failed:', err);
      return;
    }

    if (!res?.ok || !res.settings || res.settings.isFirstLaunch !== true) {
      return;
    }

    isRevisitSession = false;
    buildMarkup();
    wire(root, true);
    showRoot(root);
  }

  function openOnboardingRevisit() {
    const root = getRoot();
    if (!root) return;
    isRevisitSession = true;
    buildMarkup();
    wire(root, false);
    showRoot(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => maybeStartOnboarding());
  } else {
    maybeStartOnboarding();
  }

  window.addEventListener('sigpulse-open-onboarding', () => {
    openOnboardingRevisit();
  });
})();
