import {
  SUPABASE_CONFIGURED,
  currentSession,
  signIn,
  signOut,
  fetchShelves,
  fetchAllBooksAdmin,
  createShelf,
  deleteShelf,
  createBook,
  updateBook,
  deleteBookRow,
  uploadEpub,
  uploadCover,
  removeStorageObject,
  coverUrl,
  BUCKETS,
} from '../lib/supabase.js';
import { icon } from '../lib/icons.js';
import { toast } from '../lib/toast.js';
import { APP_NAME } from '../config.js';

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function renderAdmin(root) {
  if (!SUPABASE_CONFIGURED) {
    root.innerHTML = `
      <div class="page-head"><h1>Admin</h1></div>
      <div class="empty-state">
        <h3>Not connected yet</h3>
        <p>Add your Supabase URL and anon key to <code>.env</code> (see the README) before signing in here.</p>
      </div>`;
    return;
  }

  const session = await currentSession();
  if (!session) {
    renderLogin(root);
    return;
  }
  await renderDashboard(root, session);
}

function renderLogin(root) {
  root.innerHTML = `
    <div class="login-wrap">
      <div class="card">
        <h2 style="margin-bottom:4px">Admin sign in</h2>
        <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:18px">
          Accounts are created by whoever manages ${APP_NAME} in the Supabase dashboard —
          there's no public sign-up here.
        </p>
        <form id="login-form">
          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" required autocomplete="username" />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input type="password" id="password" required autocomplete="current-password" />
          </div>
          <p id="login-error" style="color:var(--danger);font-size:0.85rem;min-height:1.2em"></p>
          <button class="btn btn--primary btn--block" type="submit">Sign in</button>
        </form>
      </div>
      <p style="text-align:center;margin-top:14px"><a class="muted-link" href="#/">Back to the library</a></p>
    </div>
  `;
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await signIn(email, password);
      await renderAdmin(document.getElementById('main'));
    } catch (err) {
      errorEl.textContent = err.message || 'Could not sign in.';
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function renderDashboard(root, session) {
  root.innerHTML = `
    <div class="page-head" style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <h1>Admin</h1>
        <p>Signed in as ${escapeHtml(session.user.email)}</p>
      </div>
      <button class="btn" id="signout-btn">${icon('logout')} Sign out</button>
    </div>
    <div class="tabbar">
      <button data-tab="books" data-active="true">Books</button>
      <button data-tab="shelves" data-active="false">Shelves</button>
    </div>
    <div id="tab-books"></div>
    <div id="tab-shelves" hidden></div>
  `;

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await signOut();
    await renderAdmin(root);
  });

  const tabButtons = root.querySelectorAll('.tabbar button');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => (b.dataset.active = String(b === btn)));
      document.getElementById('tab-books').hidden = btn.dataset.tab !== 'books';
      document.getElementById('tab-shelves').hidden = btn.dataset.tab !== 'shelves';
    });
  });

  await renderBooksTab(document.getElementById('tab-books'));
  await renderShelvesTab(document.getElementById('tab-shelves'));
}

/* ------------------------------- Shelves ------------------------------- */

async function renderShelvesTab(el) {
  el.innerHTML = `
    <div class="card">
      <h3 style="margin-bottom:12px">Add a shelf</h3>
      <form id="shelf-form" class="field-row" style="align-items:flex-end">
        <div class="field" style="flex:2">
          <label for="shelf-name">Shelf name</label>
          <input type="text" id="shelf-name" placeholder="e.g. Sermons, Devotionals, Bible Studies" required />
        </div>
        <div class="field" style="max-width:120px">
          <label for="shelf-order">Order</label>
          <input type="text" id="shelf-order" inputmode="numeric" placeholder="0" />
        </div>
        <div class="field" style="flex:0">
          <button class="btn btn--primary" type="submit">${icon('plus')} Add</button>
        </div>
      </form>
    </div>
    <div class="card" id="shelf-list-card">
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Order</th><th></th></tr></thead>
        <tbody id="shelf-rows"><tr><td colspan="3">Loading…</td></tr></tbody>
      </table></div>
    </div>
  `;

  async function load() {
    const shelves = await fetchShelves();
    const rows = document.getElementById('shelf-rows');
    if (shelves.length === 0) {
      rows.innerHTML = `<tr><td colspan="3" style="color:var(--text-muted)">No shelves yet.</td></tr>`;
      return;
    }
    rows.innerHTML = shelves
      .map(
        (s) => `
        <tr>
          <td>${escapeHtml(s.name)}</td>
          <td>${s.sort_order}</td>
          <td class="row-actions"><button class="btn btn--sm btn--danger" data-delete-shelf="${s.id}">${icon('trash')} Delete</button></td>
        </tr>`
      )
      .join('');
    rows.querySelectorAll('[data-delete-shelf]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this shelf? Books on it will become unshelved, not deleted.')) return;
        try {
          await deleteShelf(btn.dataset.deleteShelf);
          toast('Shelf deleted');
          await load();
        } catch (err) {
          toast(err.message || 'Could not delete shelf');
        }
      });
    });
  }

  document.getElementById('shelf-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('shelf-name').value.trim();
    const order = parseInt(document.getElementById('shelf-order').value, 10) || 0;
    if (!name) return;
    try {
      await createShelf(name, order);
      e.target.reset();
      toast('Shelf added');
      await load();
    } catch (err) {
      toast(err.message || 'Could not add shelf');
    }
  });

  await load();
}

/* -------------------------------- Books -------------------------------- */

async function renderBooksTab(el) {
  el.innerHTML = `
    <div class="card">
      <h3 id="form-heading" style="margin-bottom:12px">Add a book</h3>
      <form id="book-form">
        <input type="hidden" id="book-id" />
        <div class="field-row">
          <div class="field">
            <label for="title">Title</label>
            <input type="text" id="title" required />
          </div>
          <div class="field">
            <label for="author">Author</label>
            <input type="text" id="author" />
          </div>
        </div>
        <div class="field">
          <label for="description">Description</label>
          <textarea id="description" placeholder="A short summary members will see before opening the book"></textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="shelf">Shelf</label>
            <select id="shelf"><option value="">Unshelved</option></select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="epub-file">EPUB file <span id="epub-current" style="font-weight:400"></span></label>
            <input type="file" id="epub-file" accept=".epub,application/epub+zip" />
          </div>
          <div class="field">
            <label for="cover-file">Cover image <span id="cover-current" style="font-weight:400"></span></label>
            <input type="file" id="cover-file" accept="image/*" />
          </div>
        </div>
        <p id="book-error" style="color:var(--danger);font-size:0.85rem;min-height:1.2em"></p>
        <div class="row-actions">
          <button class="btn btn--primary" type="submit" id="save-btn">${icon('plus')} Save book</button>
          <button class="btn" type="button" id="cancel-edit" hidden>${icon('x')} Cancel edit</button>
        </div>
      </form>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th></th><th>Title</th><th>Shelf</th><th>Added</th><th></th></tr></thead>
        <tbody id="book-rows"><tr><td colspan="5">Loading…</td></tr></tbody>
      </table></div>
    </div>
  `;

  const form = document.getElementById('book-form');
  const errorEl = document.getElementById('book-error');
  const shelfSelect = document.getElementById('shelf');
  const cancelBtn = document.getElementById('cancel-edit');
  const formHeading = document.getElementById('form-heading');
  const saveBtn = document.getElementById('save-btn');

  let shelves = [];
  let books = [];
  let editingBook = null;

  async function loadShelvesIntoSelect() {
    shelves = await fetchShelves();
    shelfSelect.innerHTML =
      `<option value="">Unshelved</option>` +
      shelves.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  }

  function shelfName(id) {
    return shelves.find((s) => s.id === id)?.name || 'Unshelved';
  }

  async function loadBooks() {
    books = await fetchAllBooksAdmin();
    const rows = document.getElementById('book-rows');
    if (books.length === 0) {
      rows.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted)">No books yet — add your first one above.</td></tr>`;
      return;
    }
    rows.innerHTML = books
      .map((b) => {
        const cover = coverUrl(b.cover_path);
        return `
        <tr>
          <td>${
            cover
              ? `<img src="${cover}" alt="" style="width:34px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--border)" />`
              : `<div style="width:34px;height:48px;border-radius:4px;background:var(--surface-2)"></div>`
          }</td>
          <td>${escapeHtml(b.title)}${b.author ? `<div style="color:var(--text-muted);font-size:0.78rem">${escapeHtml(b.author)}</div>` : ''}</td>
          <td><span class="pill">${escapeHtml(shelfName(b.shelf_id))}</span></td>
          <td style="color:var(--text-muted);font-size:0.8rem">${new Date(b.created_at).toLocaleDateString()}</td>
          <td class="row-actions">
            <button class="btn btn--sm" data-edit="${b.id}">${icon('edit')} Edit</button>
            <button class="btn btn--sm btn--danger" data-delete="${b.id}">${icon('trash')} Delete</button>
          </td>
        </tr>`;
      })
      .join('');

    rows.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => startEdit(btn.dataset.edit));
    });
    rows.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => handleDelete(btn.dataset.delete));
    });
  }

  function startEdit(id) {
    const b = books.find((x) => x.id === id);
    if (!b) return;
    editingBook = b;
    document.getElementById('book-id').value = b.id;
    document.getElementById('title').value = b.title || '';
    document.getElementById('author').value = b.author || '';
    document.getElementById('description').value = b.description || '';
    shelfSelect.value = b.shelf_id || '';
    document.getElementById('epub-current').textContent = b.epub_path ? '(replace current file, optional)' : '';
    document.getElementById('cover-current').textContent = b.cover_path ? '(replace current image, optional)' : '';
    document.getElementById('epub-file').required = false;
    formHeading.textContent = `Editing "${b.title}"`;
    saveBtn.innerHTML = `${icon('checkCircle')} Save changes`;
    cancelBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    editingBook = null;
    form.reset();
    document.getElementById('book-id').value = '';
    document.getElementById('epub-current').textContent = '';
    document.getElementById('cover-current').textContent = '';
    document.getElementById('epub-file').required = true;
    formHeading.textContent = 'Add a book';
    saveBtn.innerHTML = `${icon('plus')} Save book`;
    cancelBtn.hidden = true;
    errorEl.textContent = '';
  }

  cancelBtn.addEventListener('click', resetForm);

  async function handleDelete(id) {
    const b = books.find((x) => x.id === id);
    if (!b) return;
    if (!confirm(`Delete "${b.title}"? This can't be undone.`)) return;
    try {
      await deleteBookRow(id);
      if (b.epub_path) await removeStorageObject(BUCKETS.EPUB_BUCKET, b.epub_path);
      if (b.cover_path) await removeStorageObject(BUCKETS.COVER_BUCKET, b.cover_path);
      toast('Book deleted');
      if (editingBook?.id === id) resetForm();
      await loadBooks();
    } catch (err) {
      toast(err.message || 'Could not delete book');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const title = document.getElementById('title').value.trim();
    const author = document.getElementById('author').value.trim();
    const description = document.getElementById('description').value.trim();
    const shelf_id = shelfSelect.value || null;
    const epubFile = document.getElementById('epub-file').files[0];
    const coverFile = document.getElementById('cover-file').files[0];

    if (!title) return;
    if (!editingBook && !epubFile) {
      errorEl.textContent = 'Please choose an EPUB file.';
      return;
    }

    saveBtn.disabled = true;
    const originalLabel = saveBtn.innerHTML;
    saveBtn.innerHTML = `<div class="spinner" style="width:16px;height:16px"></div> Saving…`;

    try {
      const keyHint = slug(title) || 'book';
      const patch = { title, author, description, shelf_id };

      if (epubFile) {
        if (epubFile.size > 190 * 1024 * 1024) {
          throw new Error('That EPUB is larger than 190MB — Supabase’s default upload limit. Split it or raise the limit in project settings.');
        }
        patch.epub_path = await uploadEpub(epubFile, keyHint);
        if (editingBook?.epub_path) await removeStorageObject(BUCKETS.EPUB_BUCKET, editingBook.epub_path);
      }
      if (coverFile) {
        patch.cover_path = await uploadCover(coverFile, keyHint);
        if (editingBook?.cover_path) await removeStorageObject(BUCKETS.COVER_BUCKET, editingBook.cover_path);
      }

      if (editingBook) {
        await updateBook(editingBook.id, patch);
        toast('Book updated');
      } else {
        await createBook(patch);
        toast('Book added');
      }
      resetForm();
      await loadBooks();
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong saving this book.';
    } finally {
      saveBtn.disabled = false;
      if (!editingBook) saveBtn.innerHTML = originalLabel;
    }
  });

  await loadShelvesIntoSelect();
  await loadBooks();
}

function slug(s = '') {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}
