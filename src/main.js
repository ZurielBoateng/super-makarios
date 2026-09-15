import './style.css';
import { route, notFound, startRouter, navigate } from './lib/router.js';
import { initTheme, cycleTheme, getStoredTheme } from './lib/theme.js';
import { icon } from './lib/icons.js';
import { APP_NAME } from './config.js';
import { renderLibrary } from './pages/library.js';

// The reader (epub.js + JSZip) and admin screens are the heaviest parts
// of the bundle and aren't needed for the common case of just browsing
// the library, so they're loaded on demand.
let readerModule = null;
async function getReaderModule() {
  if (!readerModule) readerModule = await import('./pages/reader.js');
  return readerModule;
}
let adminModule = null;
async function getAdminModule() {
  if (!adminModule) adminModule = await import('./pages/admin.js');
  return adminModule;
}

initTheme();

const app = document.getElementById('app');

app.innerHTML = `
  <header class="topbar" id="topbar">
    <a href="#/" class="topbar__brand">
      <img src="/icons/icon-192.png" alt="" class="topbar__mark" />
      <span>${APP_NAME}</span>
    </a>
    <div class="topbar__actions">
      <button class="icon-btn" id="theme-toggle" title="Toggle theme" aria-label="Toggle theme"></button>
      <a class="icon-btn" href="#/admin" title="Admin" aria-label="Admin">${icon('settings')}</a>
    </div>
  </header>
  <main id="main"></main>
`;

const mainEl = document.getElementById('main');
const themeBtn = document.getElementById('theme-toggle');

function paintThemeButton() {
  const pref = getStoredTheme();
  const map = { light: 'sun', dark: 'moon', system: 'auto' };
  themeBtn.innerHTML = icon(map[pref] || 'sun');
  themeBtn.title = `Theme: ${pref} (tap to change)`;
}
paintThemeButton();
themeBtn.addEventListener('click', () => {
  cycleTheme();
  paintThemeButton();
});

// Offline banner: a small, unobtrusive notice, not a blocking modal.
const offlineBanner = document.createElement('div');
offlineBanner.style.cssText =
  'display:none;align-items:center;gap:8px;justify-content:center;padding:8px;font-size:0.8rem;background:var(--surface-2);color:var(--text-muted);border-bottom:1px solid var(--border)';
offlineBanner.innerHTML = `${icon('wifiOff')} <span>You're offline — downloaded books still open.</span>`;
document.getElementById('topbar').after(offlineBanner);
function syncOnlineState() {
  offlineBanner.style.display = navigator.onLine ? 'none' : 'flex';
}
window.addEventListener('online', syncOnlineState);
window.addEventListener('offline', syncOnlineState);
syncOnlineState();

async function teardownCurrentPage() {
  if (readerModule) readerModule.teardownReader();
}

route('/', async () => {
  await teardownCurrentPage();
  document.getElementById('topbar').style.display = 'flex';
  await renderLibrary(mainEl);
});

route('/read/:id', async ({ params }) => {
  document.getElementById('topbar').style.display = 'none';
  const { renderReader } = await getReaderModule();
  await renderReader(mainEl, params.id, { onExit: () => navigate('/') });
});

route('/admin', async () => {
  await teardownCurrentPage();
  document.getElementById('topbar').style.display = 'flex';
  const { renderAdmin } = await getAdminModule();
  await renderAdmin(mainEl);
});

notFound(async () => {
  await teardownCurrentPage();
  document.getElementById('topbar').style.display = 'flex';
  mainEl.innerHTML = `
    <div class="empty-state">
      <h3>Page not found</h3>
      <p>That link doesn't lead anywhere in ${APP_NAME}.</p>
      <p><a href="#/" class="btn btn--primary" style="margin-top:12px">Back to the library</a></p>
    </div>`;
});

startRouter();
