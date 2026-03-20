/**
 * Persist Groq API key in the main process using electron-store (encrypted at rest).
 * Never import this from the renderer.
 */

const crypto = require('crypto');
const Store = require('electron-store');

/** @type {import('electron-store') | null} */
let store = null;

/**
 * @returns {import('electron-store')}
 */
function getSecretsStore() {
  if (store) {
    return store;
  }
  const { app } = require('electron');
  const encryptionKey = crypto
    .createHash('sha256')
    .update(`${app.getPath('userData')}\n${app.getName()}\nsigpulse-groq-v1`)
    .digest('hex');
  store = new Store({
    name: 'sigpulse-credentials',
    encryptionKey,
  });
  return store;
}

/**
 * @returns {string}
 */
function getGroqApiKey() {
  try {
    const raw = getSecretsStore().get('groqApiKey');
    if (typeof raw !== 'string') return '';
    return raw.trim();
  } catch (e) {
    console.error('[GroqCredentials] read failed:', e);
    return '';
  }
}

/**
 * @param {string} key
 */
function setGroqApiKey(key) {
  getSecretsStore().set('groqApiKey', String(key).trim());
}

/**
 * @returns {boolean}
 */
function hasGroqApiKey() {
  return Boolean(getGroqApiKey());
}

module.exports = {
  getGroqApiKey,
  setGroqApiKey,
  hasGroqApiKey,
};
