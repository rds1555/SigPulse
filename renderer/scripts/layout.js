/**
 * App shell: sidebar navigation and main content view switching.
 */

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  activity: 'Activity',
  insights: 'Weekly Insights',
  settings: 'Settings',
};

function initLayout() {
  const navItems = document.querySelectorAll('.sidebar-nav-item[data-view]');
  const views = document.querySelectorAll('.content-view');
  const titleEl = document.getElementById('main-view-title');

  function showView(viewId) {
    navItems.forEach((btn) => {
      const active = btn.getAttribute('data-view') === viewId;
      btn.classList.toggle('is-active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    views.forEach((view) => {
      const match = view.id === `view-${viewId}`;
      view.hidden = !match;
      view.classList.toggle('is-active', match);
    });

    if (titleEl && VIEW_TITLES[viewId]) {
      titleEl.textContent = VIEW_TITLES[viewId];
    }

    const primaryRefresh = document.getElementById('btn-refresh-insights-primary');
    if (primaryRefresh) {
      primaryRefresh.hidden = viewId === 'insights';
    }

    if (viewId === 'insights' && typeof window.refreshWeeklyInsightsPage === 'function') {
      window.refreshWeeklyInsightsPage();
    }
  }

  /** Used by onboarding (skip → dashboard) and other flows; keeps nav in sync. */
  window.sigpulseNavigate = function sigpulseNavigate(viewId) {
    if (VIEW_TITLES[viewId]) {
      showView(viewId);
    }
  };

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      if (viewId) showView(viewId);
    });
  });

  showView('dashboard');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLayout);
} else {
  initLayout();
}
