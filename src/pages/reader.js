import ePub from "epubjs";
import { fetchBook, epubUrl } from "../lib/supabase.js";
import {
  getProgress,
  saveProgress,
  getBookmarks,
  addBookmark,
  removeBookmark,
  getDownload,
  saveDownload,
  removeDownload,
  getSetting,
  setSetting,
} from "../lib/db.js";
import { icon } from "../lib/icons.js";
import { toast } from "../lib/toast.js";

const FONT_STEPS = [87, 100, 112, 125, 140, 160];
const READ_THEMES = {
  light: { bg: "#f6f1e4", text: "#241f1a" },
  sepia: { bg: "#f1e7cf", text: "#3a2f1d" },
  dark: { bg: "#141f1b", text: "#e9efe9" },
};

let current = null; // holds teardown-able state for the active reader instance

function useSpread() {
  const wide = window.matchMedia("(min-width: 900px)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  return wide && finePointer ? "auto" : "none";
}

export function teardownReader() {
  if (!current) return;
  try {
    current.rendition?.destroy();
  } catch {
    /* noop */
  }
  document.removeEventListener("keydown", current.onKeydown);
  window.removeEventListener("resize", current.onResize);
  current = null;
}

export async function renderReader(root, bookId, { onExit } = {}) {
  teardownReader();

  root.innerHTML = `
    <div class="reader" id="reader">
      <div class="reader__bar">
        <button class="icon-btn" id="exit-btn" aria-label="Back to library">${icon("back")}</button>
        <div class="reader__title" id="reader-title">Loading…</div>
        <button class="icon-btn" id="bookmark-btn" aria-label="Bookmark this page">${icon("bookmark")}</button>
        <button class="icon-btn" id="download-btn" aria-label="Download for offline">${icon("download")}</button>
        <button class="icon-btn" id="settings-btn" aria-label="Reading settings">${icon("aa")}</button>
      </div>
      <div class="reader__body">
        <div class="reader__viewport" id="viewport"></div>
        <button class="reader__nav reader__nav--prev" id="prev-btn" aria-label="Previous page">${icon("chevronLeft")}</button>
        <button class="reader__nav reader__nav--next" id="next-btn" aria-label="Next page">${icon("chevronRight")}</button>
        <div class="reader__loading" id="reader-loading"><div class="spinner"></div><span>Opening book…</span></div>
        <aside class="reader__panel" id="panel" data-open="false">
          <div id="panel-body"></div>
        </aside>
      </div>
      <div class="reader__footer">
        <span id="progress-label">0%</span>
        <div class="reader__progress-track"><div class="reader__progress-fill" id="progress-fill" style="width:0%"></div></div>
      </div>
    </div>
  `;

  const els = {
    title: document.getElementById("reader-title"),
    viewport: document.getElementById("viewport"),
    loading: document.getElementById("reader-loading"),
    exitBtn: document.getElementById("exit-btn"),
    bookmarkBtn: document.getElementById("bookmark-btn"),
    downloadBtn: document.getElementById("download-btn"),
    settingsBtn: document.getElementById("settings-btn"),
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    panel: document.getElementById("panel"),
    panelBody: document.getElementById("panel-body"),
    progressLabel: document.getElementById("progress-label"),
    progressFill: document.getElementById("progress-fill"),
  };

  els.exitBtn.addEventListener("click", () => {
    teardownReader();
    onExit?.();
  });

  let book, rendition;
  let bookRow;
  let fontStepIndex = FONT_STEPS.indexOf(
    (await getSetting("reader:fontStep")) ?? 100,
  );
  if (fontStepIndex < 0) fontStepIndex = 1;
  let readTheme = (await getSetting("reader:theme")) || "light";
  let panelMode = null; // 'settings' | 'bookmarks'
  let downloaded = false;
  let currentCfi = null;

  try {
    bookRow = await fetchBook(bookId);
  } catch (err) {
    els.loading.innerHTML = `<p>Couldn't load this book.</p><p>${escapeHtml(err.message || String(err))}</p>`;
    return;
  }
  if (!bookRow) {
    els.loading.innerHTML = `<p>This book couldn't be found.</p>`;
    return;
  }
  els.title.textContent = bookRow.title;

  const existingDownload = await getDownload(bookId);
  downloaded = Boolean(existingDownload);
  paintDownloadIcon();

  let openSource;
  try {
    if (existingDownload) {
      openSource = await existingDownload.blob.arrayBuffer();
    } else if (navigator.onLine) {
      openSource = epubUrl(bookRow.epub_path);
    } else {
      els.loading.innerHTML = `
        <div>${icon("wifiOff")}</div>
        <p>You're offline and this book hasn't been downloaded yet.</p>
        <p>Connect to the internet once to read or download it.</p>`;
      return;
    }
  } catch (err) {
    els.loading.innerHTML = `<p>Couldn't open this book.</p><p>${escapeHtml(err.message || String(err))}</p>`;
    return;
  }

  try {
    book = ePub(openSource);
    let spreadMode = useSpread();
    rendition = book.renderTo(els.viewport, {
      width: "100%",
      height: "100%",
      flow: "paginated",
      spread: spreadMode,
      allowScriptedContent: false,
    });

    Object.entries(READ_THEMES).forEach(([name, colors]) => {
      rendition.themes.register(name, {
        body: {
          background: `${colors.bg} !important`,
          color: `${colors.text} !important`,
        },
        "a, a:link": { color: `${colors.text} !important` },
      });
    });
    rendition.themes.select(readTheme);
    rendition.themes.fontSize(`${FONT_STEPS[fontStepIndex]}%`);

    const savedProgress = await getProgress(bookId);
    await rendition.display(savedProgress?.cfi || undefined);
    els.loading.style.display = "none";

    // Generate locations in the background for accurate % complete; falls
    // back to spine-position percentage until this resolves.
    book.locations.generate(1600).catch(() => {});

    current = { rendition, book, onKeydown: null };

    const onResize = () => {
      requestAnimationFrame(() => {
        const width = els.viewport.clientWidth;
        const height = els.viewport.clientHeight;
        if (!width || !height) return;

        const nextSpreadMode = useSpread();
        if (nextSpreadMode !== spreadMode) {
          spreadMode = nextSpreadMode;
          rendition.spread(spreadMode);
        } else {
          rendition.resize(width, height);
        }
      });
    };
    window.addEventListener("resize", onResize);
    current.onResize = onResize;

    rendition.on("relocated", async (location) => {
      currentCfi = location.start.cfi;
      let percent = location.start.percentage ?? 0;
      if (book.locations && book.locations.length()) {
        percent = book.locations.percentageFromCfi(currentCfi);
      } else if (book.spine?.length) {
        percent = (location.start.index + 1) / book.spine.length;
      }
      percent = Math.min(1, Math.max(0, percent));
      updateProgressUI(percent);
      await saveProgress(bookId, { cfi: currentCfi, percent });
      await refreshBookmarkIcon();
    });

    els.prevBtn.addEventListener("click", () => rendition.prev());
    els.nextBtn.addEventListener("click", () => rendition.next());

    const onKeydown = (e) => {
      if (e.key === "ArrowLeft") rendition.prev();
      if (e.key === "ArrowRight") rendition.next();
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKeydown);
    current.onKeydown = onKeydown;

    // Handle horizontal swipes inside the rendition iframe without
    // hijacking vertical scrolling or taps on links.
    rendition.on("rendered", () => {
      try {
        const doc = rendition.getContents()[0]?.document;
        if (!doc) return;
        doc.body.style.touchAction = "pan-y";
        let startX = 0;
        let startY = 0;
        let tracking = false;

        doc.addEventListener("touchstart", (e) => {
          if (e.touches.length !== 1) return;
          const touch = e.touches[0];
          startX = touch.clientX;
          startY = touch.clientY;
          tracking = true;
        }, { passive: true });
        doc.addEventListener("touchend", (e) => {
          if (!tracking || e.changedTouches.length !== 1) return;
          tracking = false;
          const touch = e.changedTouches[0];
          const dx = touch.clientX - startX;
          const dy = touch.clientY - startY;
          if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
          if (dx > 0) rendition.prev();
          else rendition.next();
        }, { passive: true });
        doc.addEventListener("touchcancel", () => {
          tracking = false;
        }, { passive: true });
      } catch {
        /* iframe not ready / cross-origin quirk: swipe just won't be available */
      }
    });
  } catch (err) {
    els.loading.style.display = "flex";
    els.loading.innerHTML = `<p>Couldn't render this book.</p><p>${escapeHtml(err.message || String(err))}</p>`;
    return;
  }

  function updateProgressUI(percent) {
    const pct = Math.round(percent * 100);
    els.progressLabel.textContent = `${pct}%`;
    els.progressFill.style.width = `${pct}%`;
  }

  async function refreshBookmarkIcon() {
    if (!currentCfi) return;
    const marks = await getBookmarks(bookId);
    const match = marks.some((m) => m.cfi === currentCfi);
    els.bookmarkBtn.innerHTML = icon(match ? "bookmarkFilled" : "bookmark");
    els.bookmarkBtn.title = match ? "Remove bookmark" : "Bookmark this page";
    els.bookmarkBtn.dataset.marked = String(match);
  }

  els.bookmarkBtn.addEventListener("click", async () => {
    if (!currentCfi) return;
    const marked = els.bookmarkBtn.dataset.marked === "true";
    if (marked) {
      await removeBookmark(`${bookId}:${currentCfi}`);
      toast("Bookmark removed");
    } else {
      const percent = parseInt(els.progressLabel.textContent, 10) || 0;
      await addBookmark(bookId, {
        cfi: currentCfi,
        label: `${percent}% through`,
      });
      toast("Bookmarked");
    }
    await refreshBookmarkIcon();
    if (panelMode === "bookmarks") openBookmarksPanel();
  });

  function paintDownloadIcon() {
    els.downloadBtn.innerHTML = icon(downloaded ? "checkCircle" : "download");
    els.downloadBtn.title = downloaded
      ? "Downloaded for offline — tap to remove"
      : "Download for offline";
  }

  els.downloadBtn.addEventListener("click", async () => {
    if (downloaded) {
      await removeDownload(bookId);
      downloaded = false;
      paintDownloadIcon();
      toast("Removed offline copy");
      return;
    }
    if (!navigator.onLine) {
      toast("Connect to the internet to download this book");
      return;
    }
    els.downloadBtn.disabled = true;
    els.downloadBtn.innerHTML = `<div class="spinner" style="width:16px;height:16px"></div>`;
    try {
      const res = await fetch(epubUrl(bookRow.epub_path));
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      await saveDownload(bookId, blob, { title: bookRow.title });
      downloaded = true;
      toast("Available offline now");
    } catch (err) {
      toast("Couldn't download this book");
    } finally {
      els.downloadBtn.disabled = false;
      paintDownloadIcon();
    }
  });

  function closePanel() {
    els.panel.dataset.open = "false";
    panelMode = null;
  }

  function openSettingsPanel() {
    panelMode = "settings";
    els.panel.dataset.open = "true";
    els.panelBody.innerHTML = `
      <h3>Reading settings</h3>
      <div class="panel-row">
        <span>Text size</span>
        <div class="font-stepper">
          <button class="icon-btn btn--sm" id="font-minus" aria-label="Smaller text">−</button>
          <span id="font-pct">${FONT_STEPS[fontStepIndex]}%</span>
          <button class="icon-btn btn--sm" id="font-plus" aria-label="Larger text">+</button>
        </div>
      </div>
      <div class="panel-row">
        <span>Theme</span>
        <div class="swatches">
          ${Object.entries(READ_THEMES)
            .map(
              ([name, c]) =>
                `<button class="swatch" data-theme="${name}" data-active="${readTheme === name}" style="background:${c.bg}" aria-label="${name} theme"></button>`,
            )
            .join("")}
        </div>
      </div>
      <div class="panel-row" style="border-bottom:none">
        <button class="btn btn--block" id="show-bookmarks">${icon("bookmark")} View bookmarks</button>
      </div>
    `;
    document
      .getElementById("font-minus")
      .addEventListener("click", () => stepFont(-1));
    document
      .getElementById("font-plus")
      .addEventListener("click", () => stepFont(1));
    els.panelBody.querySelectorAll(".swatch").forEach((sw) => {
      sw.addEventListener("click", async () => {
        readTheme = sw.dataset.theme;
        rendition.themes.select(readTheme);
        await setSetting("reader:theme", readTheme);
        openSettingsPanel();
      });
    });
    document
      .getElementById("show-bookmarks")
      .addEventListener("click", openBookmarksPanel);
  }

  async function stepFont(dir) {
    fontStepIndex = Math.min(
      FONT_STEPS.length - 1,
      Math.max(0, fontStepIndex + dir),
    );
    rendition.themes.fontSize(`${FONT_STEPS[fontStepIndex]}%`);
    await setSetting("reader:fontStep", FONT_STEPS[fontStepIndex]);
    openSettingsPanel();
  }

  async function openBookmarksPanel() {
    panelMode = "bookmarks";
    els.panel.dataset.open = "true";
    const marks = await getBookmarks(bookId);
    els.panelBody.innerHTML = `
      <h3>Bookmarks</h3>
      ${
        marks.length === 0
          ? `<p style="color:var(--text-muted);font-size:0.85rem">No bookmarks yet. Tap the bookmark icon while reading to save a page.</p>`
          : marks
              .map(
                (m) => `
              <div class="bookmark-item">
                <button class="bookmark-item__label" data-cfi="${escapeAttr(m.cfi)}">${escapeHtml(m.label || "Bookmark")}</button>
                <button class="icon-btn btn--sm" data-remove="${escapeAttr(m.id)}" aria-label="Remove bookmark">${icon("trash")}</button>
              </div>`,
              )
              .join("")
      }
      <div class="panel-row" style="border-bottom:none;margin-top:10px">
        <button class="btn btn--block" id="show-settings">${icon("aa")} Reading settings</button>
      </div>
    `;
    els.panelBody.querySelectorAll("[data-cfi]").forEach((btn) => {
      btn.addEventListener("click", () => {
        rendition.display(btn.dataset.cfi);
        closePanel();
      });
    });
    els.panelBody.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await removeBookmark(btn.dataset.remove);
        await refreshBookmarkIcon();
        openBookmarksPanel();
      });
    });
    document
      .getElementById("show-settings")
      .addEventListener("click", openSettingsPanel);
  }

  els.settingsBtn.addEventListener("click", () => {
    if (els.panel.dataset.open === "true") {
      closePanel();
    } else {
      openSettingsPanel();
    }
  });
}

function escapeHtml(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function escapeAttr(s = "") {
  return String(s).replace(/"/g, "&quot;");
}
