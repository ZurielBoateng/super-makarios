import ePub from "epubjs";
import { fetchBook, epubUrl, coverUrl } from "../lib/supabase.js";
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
  for (const fn of current.cleanups) {
    try {
      fn();
    } catch {
      /* noop */
    }
  }
  try {
    current.rendition?.destroy();
  } catch {
    /* noop */
  }
  current = null;
}

export async function renderReader(root, bookId, { onExit } = {}) {
  teardownReader();
  const instance = { rendition: null, book: null, cleanups: [] };
  current = instance;

  root.innerHTML = `
    <div class="reader" id="reader" data-chrome="shown">
      <div class="reader__bar" id="reader-bar">
        <button class="icon-btn" id="exit-btn" aria-label="Back to library">${icon("back")}</button>
        <div class="reader__title" id="reader-title">Loading…</div>
        <button class="icon-btn" id="description-btn" aria-label="Description" title="Description">${icon("info")}</button>
        <button class="icon-btn" id="bookmark-btn" aria-label="Bookmark this page">${icon("bookmark")}</button>
        <button class="icon-btn" id="download-btn" aria-label="Download for offline">${icon("download")}</button>
        <button class="icon-btn" id="settings-btn" aria-label="Reading settings">${icon("aa")}</button>
      </div>
      <div class="reader__body" id="reader-body">
        <div class="reader__viewport" id="viewport"></div>
        <div class="reader__gesture" id="gesture"></div>
        <button class="reader__nav reader__nav--prev" id="prev-btn" aria-label="Previous page">${icon("chevronLeft")}</button>
        <button class="reader__nav reader__nav--next" id="next-btn" aria-label="Next page">${icon("chevronRight")}</button>
        <div class="reader__status" id="status"><span id="status-chapter"></span><span id="status-pct"></span></div>
        <div class="reader__loading" id="reader-loading"><div class="spinner"></div><span>Opening book…</span></div>
        <aside class="reader__panel" id="panel" data-open="false">
          <div id="panel-body"></div>
        </aside>
      </div>
      <div class="reader__footer" id="reader-footer">
        <button class="reader__chapter" id="toc-btn" aria-label="Table of contents">${icon("list")}<span id="chapter-label">Contents</span></button>
        <input class="reader__scrubber" id="scrubber" type="range" min="0" max="1000" value="0" aria-label="Reading position" />
        <span class="reader__pct" id="progress-label">0%</span>
      </div>
    </div>
  `;

  const els = {
    title: document.getElementById("reader-title"),
    viewport: document.getElementById("viewport"),
    loading: document.getElementById("reader-loading"),
    exitBtn: document.getElementById("exit-btn"),
    descriptionBtn: document.getElementById("description-btn"),
    bookmarkBtn: document.getElementById("bookmark-btn"),
    downloadBtn: document.getElementById("download-btn"),
    settingsBtn: document.getElementById("settings-btn"),
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    panel: document.getElementById("panel"),
    panelBody: document.getElementById("panel-body"),
    progressLabel: document.getElementById("progress-label"),
    scrubber: document.getElementById("scrubber"),
    tocBtn: document.getElementById("toc-btn"),
    chapterLabel: document.getElementById("chapter-label"),
    gesture: document.getElementById("gesture"),
    statusChapter: document.getElementById("status-chapter"),
    statusPct: document.getElementById("status-pct"),
    reader: document.getElementById("reader"),
    bar: document.getElementById("reader-bar"),
    footer: document.getElementById("reader-footer"),
  };

  // --- Phone-first layout ---------------------------------------------------
  // On touch devices / narrow screens the top bar and footer become overlays
  // that tap-to-toggle, so the page gets the whole screen and never reflows
  // when they appear or disappear.
  const immersiveMq = window.matchMedia("(pointer: coarse), (max-width: 640px)");
  const reducedMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  let immersive = immersiveMq.matches;
  let onResize = null;

  const syncChromeSizes = () => {
    els.reader.style.setProperty("--bar-h", `${els.bar.offsetHeight}px`);
    els.reader.style.setProperty("--foot-h", `${els.footer.offsetHeight}px`);
  };
  const applyImmersive = () => {
    immersive = immersiveMq.matches;
    els.reader.classList.toggle("reader--immersive", immersive);
    if (!immersive) els.reader.dataset.chrome = "shown";
    syncChromeSizes();
  };
  const setChrome = (shown) => {
    els.reader.dataset.chrome = shown ? "shown" : "hidden";
  };
  const applyReadTheme = () => {
    const c = READ_THEMES[readTheme] || READ_THEMES.light;
    els.reader.style.setProperty("--read-bg", c.bg);
    els.reader.style.setProperty("--read-fg", c.text);
  };
  const onImmersiveChange = () => {
    applyImmersive();
    onResize?.();
  };
  immersiveMq.addEventListener("change", onImmersiveChange);
  instance.cleanups.push(() =>
    immersiveMq.removeEventListener("change", onImmersiveChange),
  );

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
  let panelMode = null; // 'settings' | 'bookmarks' | 'description' | 'contents'
  let downloaded = false;
  let currentCfi = null;
  let atStart = false;
  let atEnd = false;
  let busy = false; // true while a page-turn animation is running
  let scrubbing = false;
  let lastSpineIndex = -1;
  let tocFlat = []; // [{ label, href, index, depth }]
  let currentTocHref = null;
  applyImmersive();
  applyReadTheme();

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

    instance.rendition = rendition;
    instance.book = book;

    // Table of contents -> flat list, used for the Contents panel and for
    // showing the current chapter name in the footer.
    book.loaded.navigation
      .then((nav) => {
        const flat = [];
        const walk = (items, depth) => {
          for (const item of items || []) {
            const href = item.href || "";
            flat.push({
              label: (item.label || "").replace(/\s+/g, " ").trim(),
              href,
              index: book.spine.get(href)?.index,
              depth,
            });
            walk(item.subitems, depth + 1);
          }
        };
        walk(nav.toc, 0);
        tocFlat = flat.filter((t) => t.label);
        updateChapterFromIndex(lastSpineIndex);
        if (panelMode === "contents") openContentsPanel();
      })
      .catch(() => {});

    onResize = () => {
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
    instance.cleanups.push(() => window.removeEventListener("resize", onResize));

    rendition.on("relocated", async (location) => {
      currentCfi = location.start.cfi;
      atStart = Boolean(location.atStart);
      atEnd = Boolean(location.atEnd);
      lastSpineIndex = location.start.index;
      updateChapterFromIndex(lastSpineIndex);
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

    els.prevBtn.addEventListener("click", () => turn(-1));
    els.nextBtn.addEventListener("click", () => turn(1));

    const onKeydown = (e) => {
      if (e.key === "ArrowLeft") turn(-1);
      if (e.key === "ArrowRight") turn(1);
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKeydown);
    instance.cleanups.push(() =>
      document.removeEventListener("keydown", onKeydown),
    );

    setupGestures();
    setupScrubber();
    syncChromeSizes();
  } catch (err) {
    els.loading.style.display = "flex";
    els.loading.innerHTML = `<p>Couldn't render this book.</p><p>${escapeHtml(err.message || String(err))}</p>`;
    return;
  }

  function updateProgressUI(percent) {
    const pct = Math.round(percent * 100);
    els.statusPct.textContent = `${pct}%`;
    if (scrubbing) return; // don't fight the user's thumb
    els.progressLabel.textContent = `${pct}%`;
    els.scrubber.value = String(Math.round(percent * 1000));
    els.scrubber.style.setProperty("--p", `${pct}%`);
  }

  // ---- Chapter tracking ----------------------------------------------------
  function updateChapterFromIndex(index) {
    let best = null;
    for (const t of tocFlat) {
      if (t.index != null && t.index <= index && (!best || t.index > best.index))
        best = t;
    }
    currentTocHref = best?.href ?? null;
    const label = best?.label || "";
    els.chapterLabel.textContent = label || "Contents";
    els.statusChapter.textContent = label;
  }

  // ---- Page turning --------------------------------------------------------
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Timers (not rAF / transitionend) drive the animation on purpose: they keep
  // the busy lock from sticking if the tab is backgrounded mid-turn.
  function setX(px, ms = 0, easing = "ease-out", opacity = 1) {
    const v = els.viewport;
    v.style.transition = ms
      ? `transform ${ms}ms ${easing}, opacity ${ms}ms ${easing}`
      : "none";
    v.style.transform = `translate3d(${px}px,0,0)`;
    v.style.opacity = opacity === 1 ? "" : String(opacity);
  }
  function clearX() {
    const v = els.viewport;
    v.style.transition = "none";
    v.style.transform = "";
    v.style.opacity = "";
  }

  async function bump(dir) {
    busy = true;
    try {
      if (immersive && !reducedMotionMq.matches) {
        setX(-dir * 18, 80);
        await sleep(80);
        setX(0, 160);
        await sleep(160);
      }
    } finally {
      clearX();
      busy = false;
    }
    if (dir > 0) toast("You've reached the end of this book");
  }

  async function snapBack() {
    busy = true;
    try {
      setX(0, 180);
      await sleep(180);
    } finally {
      clearX();
      busy = false;
    }
  }

  // dir: +1 = forward, -1 = back. If a drag is in progress the viewport is
  // already offset; the transitions below pick up from wherever it is.
  async function turn(dir) {
    if (busy || !rendition) return;
    if ((dir > 0 && atEnd) || (dir < 0 && atStart)) {
      await bump(dir);
      return;
    }
    busy = true;
    try {
      if (immersive && els.panel.dataset.open !== "true") setChrome(false);
      const animate = immersive && !reducedMotionMq.matches;
      const w = els.viewport.clientWidth || 1;
      if (animate) {
        setX(-dir * w * 0.6, 110, "ease-in", 0);
        await sleep(110);
      }
      try {
        await Promise.race([
          dir > 0 ? rendition.next() : rendition.prev(),
          sleep(4000),
        ]);
      } catch {
        /* navigation errors leave us on the current page */
      }
      if (animate) {
        setX(dir * w * 0.35, 0, "ease-out", 0);
        void els.viewport.offsetWidth; // commit the start position
        setX(0, 170, "ease-out", 1);
        await sleep(170);
      }
    } finally {
      clearX();
      busy = false;
    }
  }

  // ---- Touch / pointer gestures --------------------------------------------
  // A transparent layer sits over the page (touch layout only). Living in the
  // parent document, it sees every touch reliably — iframes on iOS Safari
  // often swallow them — and lets us move the page with the finger.
  //   drag / flick  -> turn the page (page follows the finger)
  //   tap sides     -> previous / next page
  //   tap middle    -> show / hide the toolbars
  //   tap a link    -> forwarded to the link inside the book
  function followLinkAt(clientX, clientY) {
    try {
      const doc = rendition.getContents()[0]?.document;
      const frame = doc?.defaultView?.frameElement;
      if (!doc || !frame) return false;
      const r = frame.getBoundingClientRect();
      // A little vertical slack makes small inline links easy to hit.
      for (const dy of [0, -10, 10]) {
        const el = doc.elementFromPoint(clientX - r.left, clientY - r.top + dy);
        const a = el?.closest?.("a[href]");
        if (a) {
          a.click();
          return true;
        }
      }
    } catch {
      /* fall through to normal tap handling */
    }
    return false;
  }

  function onTap(clientX, clientY, panelWasOpen) {
    if (panelWasOpen) {
      closePanel();
      return;
    }
    if (followLinkAt(clientX, clientY)) return;
    const rect = els.gesture.getBoundingClientRect();
    const rel = (clientX - rect.left) / rect.width;
    if (rel < 0.3) turn(-1);
    else if (rel > 0.7) turn(1);
    else setChrome(els.reader.dataset.chrome !== "shown");
  }

  function finishDrag(s, dx) {
    const w = els.viewport.clientWidth || 1;
    const dir = dx < 0 ? 1 : -1;
    const blocked = (dir > 0 && atEnd) || (dir < 0 && atStart);
    const flick =
      Math.abs(s.vx) > 0.4 &&
      Math.abs(dx) > 20 &&
      Math.sign(s.vx) === Math.sign(dx);
    if (!blocked && (Math.abs(dx) > w * 0.22 || flick)) {
      turn(dir);
    } else {
      snapBack();
      if (blocked && dir > 0 && Math.abs(dx) > 20)
        toast("You've reached the end of this book");
    }
  }

  function setupGestures() {
    const el = els.gesture;
    let g = null;

    el.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary || busy || (e.pointerType === "mouse" && e.button !== 0))
        return;
      g = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        t0: e.timeStamp,
        x: e.clientX,
        t: e.timeStamp,
        vx: 0,
        axis: null,
        panel: els.panel.dataset.open === "true",
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
    });

    el.addEventListener("pointermove", (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (g.axis !== "x" || g.panel) return;
      const dt = e.timeStamp - g.t;
      if (dt > 0) g.vx = 0.6 * ((e.clientX - g.x) / dt) + 0.4 * g.vx;
      g.x = e.clientX;
      g.t = e.timeStamp;
      // Rubber-band when there is nothing further in that direction.
      const resist = (dx > 0 && atStart) || (dx < 0 && atEnd) ? 0.25 : 1;
      setX(dx * resist);
    });

    el.addEventListener("pointerup", (e) => {
      if (!g || e.pointerId !== g.id) return;
      const s = g;
      g = null;
      const dx = e.clientX - s.x0;
      if (s.axis === "x") {
        if (!s.panel) finishDrag(s, dx);
      } else if (s.axis === null && e.timeStamp - s.t0 < 600) {
        onTap(e.clientX, e.clientY, s.panel);
      }
    });

    el.addEventListener("pointercancel", () => {
      if (!g) return;
      const wasDragging = g.axis === "x" && !g.panel;
      g = null;
      if (wasDragging) snapBack();
    });

    // Long-press / right-click shouldn't pop a native menu over the page.
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // ---- Progress scrubber ---------------------------------------------------
  function setupScrubber() {
    const s = els.scrubber;
    s.addEventListener("input", () => {
      scrubbing = true;
      els.progressLabel.textContent = `${Math.round(Number(s.value) / 10)}%`;
      s.style.setProperty("--p", `${Number(s.value) / 10}%`);
    });
    s.addEventListener("change", async () => {
      const p = Number(s.value) / 1000;
      try {
        if (book.locations && book.locations.length()) {
          const cfi = book.locations.cfiFromPercentage(p);
          if (cfi) await rendition.display(cfi);
        } else if (book.spine?.length) {
          // Locations still being computed: jump by chapter instead.
          const idx = Math.min(book.spine.length - 1, Math.floor(p * book.spine.length));
          const item = book.spine.get(idx);
          if (item) await rendition.display(item.href);
        }
      } catch {
        /* stay put */
      } finally {
        scrubbing = false;
      }
    });
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

  function openDescriptionPanel() {
    panelMode = "description";
    setChrome(true);
    els.panel.dataset.open = "true";
    const cover = coverUrl(bookRow.cover_path);
    const description = (bookRow.description || "").trim();
    els.panelBody.innerHTML = `
      <h3>Description</h3>
      <div class="book-detail">
        <div class="book-detail__cover">
          ${
            cover
              ? `<img src="${escapeAttr(cover)}" alt="Cover of ${escapeAttr(bookRow.title)}" />`
              : `<div class="book-card__fallback">${escapeHtml(initialsOf(bookRow.title))}</div>`
          }
        </div>
        <div class="book-detail__title">${escapeHtml(bookRow.title)}</div>
        ${bookRow.author ? `<div class="book-detail__author">${escapeHtml(bookRow.author)}</div>` : ""}
        ${
          description
            ? `<p class="book-detail__text">${escapeHtml(description)}</p>`
            : `<p class="book-detail__text book-detail__text--empty">No description has been added for this book yet.</p>`
        }
      </div>
    `;
  }

  function openContentsPanel() {
    panelMode = "contents";
    setChrome(true);
    els.panel.dataset.open = "true";
    els.panelBody.innerHTML = `
      <h3>Contents</h3>
      ${
        tocFlat.length === 0
          ? `<p style="color:var(--text-muted);font-size:0.85rem">This book doesn't have a table of contents.</p>`
          : tocFlat
              .map(
                (t, i) => `
          <button class="toc-item" data-toc="${i}" data-current="${t.href === currentTocHref}" style="padding-left:${t.depth * 14}px">${escapeHtml(t.label)}</button>`,
              )
              .join("")
      }
    `;
    els.panelBody.querySelectorAll("[data-toc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const item = tocFlat[Number(btn.dataset.toc)];
        closePanel();
        try {
          await rendition.display(item.href);
        } catch {
          toast("Couldn't open that chapter");
        }
      });
    });
    els.panelBody.querySelector('[data-current="true"]')?.scrollIntoView({ block: "center" });
  }

  function openSettingsPanel() {
    panelMode = "settings";
    setChrome(true);
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
        applyReadTheme();
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
    setChrome(true);
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

  els.descriptionBtn.addEventListener("click", () => {
    if (els.panel.dataset.open === "true" && panelMode === "description") {
      closePanel();
    } else {
      openDescriptionPanel();
    }
  });

  els.tocBtn.addEventListener("click", () => {
    if (els.panel.dataset.open === "true" && panelMode === "contents") {
      closePanel();
    } else {
      openContentsPanel();
    }
  });

  els.settingsBtn.addEventListener("click", () => {
    if (els.panel.dataset.open === "true") {
      closePanel();
    } else {
      openSettingsPanel();
    }
  });
}

function initialsOf(title = "") {
  return (
    String(title)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "•"
  );
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
