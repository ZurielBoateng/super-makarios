# Super Makarios

PWA made with Claude code, feel free to use it as a template for other personal libraries
link to Super Makarios: https://super-makarios.zab777.workers.dev/#/

A installable reading app (PWA) for your church's books: bookshelves, a
built-in EPUB reader with light/dark/sepia themes, bookmarking, reading
progress, and offline downloads — plus an admin screen for adding and
managing books yourselves, no code required after setup.

This is a static front-end (plain JavaScript, built with Vite) backed by
[Supabase](https://supabase.com) for the book library (Postgres +
file storage + admin login). Supabase's free tier is enough for a church
library. You deploy the front-end yourself to any static host
(Netlify, Vercel, Cloudflare Pages, or GitHub Pages all work and all
have free tiers).

Nothing about a member's reading — their bookmarks, progress, or which
shelf order they prefer — is sent anywhere. It's stored only in their own
browser (IndexedDB), so the app needs no member accounts and works fully
offline once opened.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), sign up or sign in, and
   click **New project**. Pick any name and a database password (save
   the password somewhere safe — you likely won't need it again, but
   Supabase asks for one).
2. Once the project has finished provisioning, open **SQL Editor** in
   the left sidebar, click **New query**, paste in the entire contents
   of [`supabase/schema.sql`](./supabase/schema.sql) from this project,
   and click **Run**. This creates the `books` and `shelves` tables,
   sets up public read / admin-only write permissions, and creates the
   `epubs` and `covers` storage buckets.
3. Open **Project Settings -> API**. You'll need two values from this
   page in step 3 below:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

## 2. Create an admin account

Members never sign in — only whoever manages the book library does.

1. In the Supabase dashboard, open **Authentication -> Users**.
2. Click **Add user -> Create new user**.
3. Enter the admin's email and a password, and make sure **Auto Confirm
   User** is switched on (so no confirmation email is required).
4. Repeat for anyone else who should be able to add books. There's no
   self-serve sign-up screen in the app on purpose — only people you add
   here can sign in to `/admin`.

## 3. Configure the app

1. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```
2. Open `.env` and fill in the **Project URL** and **anon public** key
   from step 1.3, and optionally rename the app:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   VITE_APP_NAME="Super Makarios"
   VITE_APP_SHORT_NAME="Super Makarios"
   ```

## 4. Run it locally

Requires [Node.js](https://nodejs.org) 18 or newer.

```
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Go to
`#/admin` (or click the gear icon top-right) and sign in with the admin
account from step 2 to add your first shelf and book.

> Service workers (what makes offline mode work) are disabled in dev
> mode by some browsers on `localhost` — build and preview (step 5) to
> test the full offline/installable experience.

## 5. Build and deploy

```
npm run build
```

This produces a `dist/` folder — a fully static site. Deploy it to any
static host. A few easy options:

**Netlify** — drag the `dist` folder onto
[app.netlify.com/drop](https://app.netlify.com/drop), or connect your
git repo and set build command `npm run build`, publish directory
`dist`. Add the same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` /
`VITE_APP_NAME` variables under **Site settings -> Environment
variables** if you connect a repo (a drag-and-drop deploy already has
them baked into the build).

**Vercel** — `npx vercel` from this folder, or connect the repo in the
Vercel dashboard. Framework preset: Vite. Add the same environment
variables under **Project Settings -> Environment Variables**.

**Cloudflare Pages** — connect the repo, build command `npm run build`,
output directory `dist`. Add the same environment variables under
**Settings -> Environment variables**.

**GitHub Pages** — run `npm run build`, then publish the `dist` folder
(e.g. with the `gh-pages` npm package, or GitHub's "Deploy from a
branch" pointed at a `gh-pages` branch containing `dist`'s contents).

Once deployed, open the site on a phone and use "Add to Home Screen"
(iOS Safari) or the install prompt / browser menu "Install app"
(Android Chrome, desktop Chrome/Edge) to install it like a native app.

### A note on custom domains and HTTPS

PWA installability and service workers require HTTPS — every host
listed above provides this automatically, including on a custom domain.

## 6. Add your books

Open the deployed site, go to `#/admin`, sign in, and:

1. Switch to the **Shelves** tab and create a few shelves (e.g.
   "Devotionals", "Sermons", "Bible Studies").
2. Switch to the **Books** tab, fill in a title/author/description,
   choose a shelf, pick the EPUB file and (optionally) a cover image,
   and save.

Books appear on the public library page immediately — no redeploy
needed. Anyone with the site's link can browse and read; only the
accounts you created in step 2 can add, edit, or remove books.

### About file sizes

The schema sets a 200MB per-file limit for EPUBs and 10MB for covers,
comfortably more than a typical church book needs (most EPUBs are a few
MB). Supabase's free tier includes 1GB of file storage — plenty for a
substantial library of text-based books; if you're publishing books
heavy with images, keep an eye on **Project Settings -> Usage**.

---

## How the offline experience works

- **The app itself** installs and opens offline once visited, because
  its own code/styles/icons are precached by a service worker.
- **The library list and covers** are visible offline for anything a
  member has already browsed (cached automatically for about 90 days).
- **A specific book** is available fully offline — including on a
  fresh install with no prior visit to that book — only after a member
  taps the download icon while reading it (or on its cover). That
  explicit download is what makes an offline reading trip reliable:
  it's stored as a complete file in the browser's IndexedDB, not
  dependent on the network cache surviving.
- Reading progress and bookmarks are saved locally as a member reads,
  online or off, and sync to nothing — they're private to that device.

## Project structure

```
src/
  main.js            App shell: top bar, theme toggle, routing
  config.js           Reads .env values
  style.css            All styles (light + dark theme tokens)
  lib/
    supabase.js        Supabase client + all book/shelf/auth queries
    db.js               IndexedDB: progress, bookmarks, offline downloads
    router.js            Tiny hash router
    theme.js              Light/dark/system theme handling
    icons.js               Inline SVG icon set
    toast.js                Small toast notifications
  pages/
    library.js          Bookshelves + search
    reader.js             EPUB reader (epub.js), bookmarks, progress, download
    admin.js               Login + book/shelf management
supabase/
  schema.sql            Run once in the Supabase SQL editor
```

## Customizing

- **Branding**: change `VITE_APP_NAME` / `VITE_APP_SHORT_NAME` in
  `.env`, and swap `design/icon-source.svg` (then re-run the icon
  export — see below) for your own mark.
- **Colors**: edit the CSS custom properties at the top of
  `src/style.css` (`:root` for light, the two dark blocks for dark).
- **Regenerating app icons** after changing `design/icon-source.svg`,
  with Node and the `sharp` package available:
  ```js
  // save as design/build-icons.mjs, then: node design/build-icons.mjs
  import sharp from "sharp";
  const src = "design/icon-source.svg";
  await sharp(src).resize(192, 192).png().toFile("public/icons/icon-192.png");
  await sharp(src).resize(512, 512).png().toFile("public/icons/icon-512.png");
  await sharp(src)
    .resize(180, 180)
    .png()
    .toFile("public/icons/apple-touch-icon.png");
  ```

## Troubleshooting

- **"Almost there" / "Not connected yet" message** — `.env` is missing
  or wasn't picked up. Confirm `.env` exists (not just `.env.example`)
  and restart `npm run dev` / rebuild after editing it.
- **Sign-in fails with a valid password** — double check the user was
  created with **Auto Confirm User** on in Supabase, or confirm the
  account via the confirmation email if not.
- **Books don't appear after adding** — check the browser console;
  a common cause is the SQL in step 1.2 not having been run, or having
  been run before the buckets existed. Re-running `schema.sql` is safe.
- **A download or cover image fails to load** — Supabase Storage
  buckets created as "public" (as `schema.sql` does) serve files with
  permissive CORS by default; if you changed bucket settings, make sure
  the bucket is still public.
