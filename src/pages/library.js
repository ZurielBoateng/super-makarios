import { fetchShelvesWithBooks, coverUrl, SUPABASE_CONFIGURED } from '../lib/supabase.js';
import { getAllProgress, getAllDownloadIds } from '../lib/db.js';
import { icon } from '../lib/icons.js';
import { APP_NAME } from '../config.js';

function initials(title = '') {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function bookCard(book, { progress, downloaded }) {
  const cover = coverUrl(book.cover_path);
  const pct = Math.round((progress?.percent || 0) * 100);
  return `
    <a class="book-card" href="#/read/${book.id}" data-title="${(book.title || '').toLowerCase()}" data-author="${(book.author || '').toLowerCase()}">
      <div class="book-card__cover">
        ${
          cover
            ? `<img src="${cover}" alt="" loading="lazy" />`
            : `<div class="book-card__fallback">${initials(book.title)}</div>`
        }
        ${downloaded ? `<div class="book-card__badge" title="Available offline">${icon('checkCircle')}</div>` : ''}
        ${pct > 0 ? `<div class="book-card__progress"><span style="width:${pct}%"></span></div>` : ''}
      </div>
      <div class="book-card__title">${escapeHtml(book.title)}</div>
      ${book.author ? `<div class="book-card__author">${escapeHtml(book.author)}</div>` : ''}
      ${pct > 0 ? `<div class="book-card__meta">${pct}% read</div>` : ''}
    </a>
  `;
}

function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function renderLibrary(root) {
  if (!SUPABASE_CONFIGURED) {
    root.innerHTML = `
      <div class="page-head"><h1>${APP_NAME}</h1></div>
      <div class="empty-state">
        <h3>Almost there</h3>
        <p>This app isn't connected to a book library yet. Add your Supabase project URL and anon key
        to a <code>.env</code> file (see <code>.env.example</code> and the README) and reload.</p>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="page-head">
      <h1>${APP_NAME}</h1>
      <p>Browse the bookshelves below, pick up where you left off, or download a title to read offline.</p>
    </div>
    <div class="search-row">
      <input class="search-input" id="search" type="search" placeholder="Search by title or author…" aria-label="Search books" />
    </div>
    <div id="shelves"><div class="spinner" style="margin:40px auto"></div></div>
  `;

  const shelvesEl = document.getElementById('shelves');
  const searchEl = document.getElementById('search');

  let shelves = [];
  let progressMap = new Map();
  let downloadIds = new Set();
  try {
    const [shelfData, pMap, dIds] = await Promise.all([
      fetchShelvesWithBooks(),
      getAllProgress(),
      getAllDownloadIds(),
    ]);
    shelves = shelfData;
    progressMap = pMap;
    downloadIds = dIds;
    paint(shelves, progressMap, downloadIds);
  } catch (err) {
    shelvesEl.innerHTML = `
      <div class="empty-state">
        <h3>Couldn't load the library</h3>
        <p>${escapeHtml(err.message || String(err))}</p>
      </div>`;
    return;
  }

  function paint(shelfList, progressMap, downloadIds, filter = '') {
    const q = filter.trim().toLowerCase();
    const visibleShelves = shelfList
      .map((shelf) => ({
        ...shelf,
        books: shelf.books.filter(
          (b) => !q || b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q)
        ),
      }))
      .filter((shelf) => shelf.books.length > 0);

    if (!shelfList.some((s) => s.books.length > 0)) {
      shelvesEl.innerHTML = `
        <div class="empty-state">
          <h3>No books yet</h3>
          <p>Once books are added from the admin panel, they'll appear here on their shelves.</p>
        </div>`;
      return;
    }

    if (visibleShelves.length === 0) {
      shelvesEl.innerHTML = `<div class="empty-state"><h3>No matches</h3><p>Try a different search.</p></div>`;
      return;
    }

    shelvesEl.innerHTML = visibleShelves
      .map(
        (shelf) => `
        <section class="shelf">
          <div class="shelf__head">
            <h2>${escapeHtml(shelf.name)}</h2>
            <span class="shelf__count">${shelf.books.length} book${shelf.books.length === 1 ? '' : 's'}</span>
          </div>
          <div class="book-grid">
            ${shelf.books
              .map((b) =>
                bookCard(b, {
                  progress: progressMap.get(b.id),
                  downloaded: downloadIds.has(b.id),
                })
              )
              .join('')}
          </div>
        </section>`
      )
      .join('');
  }

  searchEl.addEventListener('input', () => {
    paint(shelves, progressMap, downloadIds, searchEl.value);
  });
}
