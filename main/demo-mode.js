/**
 * Demo mode flag for presentation: when true, storage returns preloaded sample data
 * instead of real files. Toggled via IPC from the renderer.
 */

let demoMode = false;

function isDemoMode() {
  return demoMode;
}

function setDemoMode(value) {
  demoMode = Boolean(value);
}

module.exports = { isDemoMode, setDemoMode };
