// Local, per-device storage: reading progress, bookmarks, and downloaded
// EPUB files for offline reading. Nothing here is shared between
// members' devices by design (see the app's setup notes) — it all lives
// in this browser's IndexedDB via idb.

import { openDB } from 'idb';

const DB_NAME = 'reading-room';
const DB_VERSION = 1;

function dbPromise() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('bookmarks')) {
        const store = db.createObjectStore('bookmarks', { keyPath: 'id' });
        store.createIndex('by-book', 'bookId');
      }
      if (!db.objectStoreNames.contains('downloads')) {
        db.createObjectStore('downloads', { keyPath: 'bookId' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });
}

let _db = null;
async function getDb() {
  if (!_db) _db = await dbPromise();
  return _db;
}

/* ---------------------------- progress ---------------------------- */

export async function getProgress(bookId) {
  const db = await getDb();
  return db.get('progress', bookId);
}

export async function getAllProgress() {
  const db = await getDb();
  const all = await db.getAll('progress');
  const map = new Map();
  for (const p of all) map.set(p.bookId, p);
  return map;
}

export async function saveProgress(bookId, { cfi, percent, chapter }) {
  const db = await getDb();
  await db.put('progress', {
    bookId,
    cfi,
    percent: percent ?? 0,
    chapter: chapter ?? null,
    updatedAt: Date.now(),
  });
}

export async function clearProgress(bookId) {
  const db = await getDb();
  await db.delete('progress', bookId);
}

/* ---------------------------- bookmarks ---------------------------- */

export async function getBookmarks(bookId) {
  const db = await getDb();
  const all = await db.getAllFromIndex('bookmarks', 'by-book', bookId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addBookmark(bookId, { cfi, label }) {
  const db = await getDb();
  const id = `${bookId}:${cfi}`;
  const record = { id, bookId, cfi, label: label || '', createdAt: Date.now() };
  await db.put('bookmarks', record);
  return record;
}

export async function removeBookmark(id) {
  const db = await getDb();
  await db.delete('bookmarks', id);
}

export async function isBookmarked(bookId, cfi) {
  const db = await getDb();
  const record = await db.get('bookmarks', `${bookId}:${cfi}`);
  return Boolean(record);
}

/* ---------------------------- downloads ---------------------------- */

export async function saveDownload(bookId, blob, meta = {}) {
  const db = await getDb();
  await db.put('downloads', {
    bookId,
    blob,
    size: blob.size,
    downloadedAt: Date.now(),
    ...meta,
  });
}

export async function getDownload(bookId) {
  const db = await getDb();
  return db.get('downloads', bookId);
}

export async function removeDownload(bookId) {
  const db = await getDb();
  await db.delete('downloads', bookId);
}

export async function getAllDownloadIds() {
  const db = await getDb();
  const keys = await db.getAllKeys('downloads');
  return new Set(keys);
}

export async function downloadsUsage() {
  const db = await getDb();
  const all = await db.getAll('downloads');
  return all.reduce((sum, d) => sum + (d.size || 0), 0);
}

/* ---------------------------- settings ---------------------------- */

export async function getSetting(key, fallback = null) {
  const db = await getDb();
  const record = await db.get('settings', key);
  return record ? record.value : fallback;
}

export async function setSetting(key, value) {
  const db = await getDb();
  await db.put('settings', { key, value });
}
