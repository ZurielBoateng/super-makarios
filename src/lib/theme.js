// Theme handling: 'light' | 'dark' | 'system'. Persisted per-device in
// localStorage (a per-viewer convenience, not shared state), applied as
// a data-theme attribute the CSS in style.css keys off.

const KEY = 'reading-room:theme';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / storage blocked: theme just won't persist */
  }
}

export function getStoredTheme() {
  const v = safeGet(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') {
    root.setAttribute('data-theme', pref);
  } else {
    root.removeAttribute('data-theme');
  }
}

export function setTheme(pref) {
  safeSet(KEY, pref);
  applyTheme(pref);
}

// Cycles light -> dark -> system -> light, and returns the new value.
export function cycleTheme() {
  const cur = getStoredTheme();
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
  setTheme(next);
  return next;
}

export function initTheme() {
  applyTheme(getStoredTheme());
}

export function isDarkActive() {
  const pref = getStoredTheme();
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
