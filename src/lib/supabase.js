import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIGURED } from '../config.js';

export { SUPABASE_CONFIGURED };

export const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

const EPUB_BUCKET = 'epubs';
const COVER_BUCKET = 'covers';

export function publicUrlFor(bucket, path) {
  if (!supabase || !path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

export function epubUrl(path) {
  return publicUrlFor(EPUB_BUCKET, path);
}

export function coverUrl(path) {
  return publicUrlFor(COVER_BUCKET, path);
}

export async function fetchShelvesWithBooks() {
  if (!supabase) return [];
  const [{ data: shelves, error: shelfErr }, { data: books, error: bookErr }] = await Promise.all([
    supabase.from('shelves').select('*').order('sort_order', { ascending: true }),
    supabase.from('books').select('*').order('title', { ascending: true }),
  ]);
  if (shelfErr) throw shelfErr;
  if (bookErr) throw bookErr;

  const byShelf = new Map((shelves || []).map((s) => [s.id, { ...s, books: [] }]));
  const unshelved = { id: null, name: 'Unshelved', sort_order: 999999, books: [] };
  for (const book of books || []) {
    const shelf = book.shelf_id ? byShelf.get(book.shelf_id) : null;
    if (shelf) shelf.books.push(book);
    else unshelved.books.push(book);
  }
  const result = Array.from(byShelf.values());
  if (unshelved.books.length) result.push(unshelved);
  return result;
}

export async function fetchBook(id) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('books').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function fetchShelves() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('shelves').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchAllBooksAdmin() {
  if (!supabase) return [];
  const { data, error } = await supabase.from('books').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function currentSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function createShelf(name, sortOrder = 0) {
  const { data, error } = await supabase.from('shelves').insert({ name, sort_order: sortOrder }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteShelf(id) {
  const { error } = await supabase.from('shelves').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadEpub(file, keyHint) {
  const path = `${keyHint}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const { error } = await supabase.storage.from(EPUB_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function uploadCover(file, keyHint) {
  const path = `${keyHint}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeStorageObject(bucket, path) {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

export async function createBook(book) {
  const { data, error } = await supabase.from('books').insert(book).select().single();
  if (error) throw error;
  return data;
}

export async function updateBook(id, patch) {
  const { data, error } = await supabase.from('books').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBookRow(id) {
  const { error } = await supabase.from('books').delete().eq('id', id);
  if (error) throw error;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

export const BUCKETS = { EPUB_BUCKET, COVER_BUCKET };
