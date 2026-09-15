import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appName = env.VITE_APP_NAME || "Super Makarios";
  const shortName = env.VITE_APP_SHORT_NAME || "Super Makarios";
  // Supabase host, so the service worker knows which requests to runtime-cache.
  let supabaseHost = "";
  try {
    supabaseHost = env.VITE_SUPABASE_URL
      ? new URL(env.VITE_SUPABASE_URL).host
      : "";
  } catch {
    supabaseHost = "";
  }

  return {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["icons/apple-touch-icon.png"],
        manifest: {
          name: appName,
          short_name: shortName,
          description: `Browse, bookmark and download books from ${appName} for offline reading.`,
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#123028",
          theme_color: "#1F4A40",
          orientation: "portrait-primary",
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // App shell + static assets: precached so the app opens offline.
          // Routing is hash-based (#/read/:id), so every navigation is
          // really a request for the same index.html.
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: "/index.html",
          runtimeCaching: [
            // Book covers and EPUB files served from Supabase Storage: cache
            // aggressively so a visited book/cover stays available even
            // without an explicit "download for offline" tap.
            ...(supabaseHost
              ? [
                  {
                    urlPattern: new RegExp(
                      `^https://${supabaseHost.replace(/\./g, "\\.")}/storage/v1/object/public/.*`,
                    ),
                    handler: "CacheFirst",
                    options: {
                      cacheName: "church-reader-storage",
                      expiration: {
                        maxEntries: 200,
                        maxAgeSeconds: 60 * 60 * 24 * 90,
                      },
                      cacheableResponse: { statuses: [0, 200] },
                    },
                  },
                  {
                    urlPattern: new RegExp(
                      `^https://${supabaseHost.replace(/\./g, "\\.")}/rest/v1/.*`,
                    ),
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "church-reader-api",
                      networkTimeoutSeconds: 4,
                      expiration: {
                        maxEntries: 50,
                        maxAgeSeconds: 60 * 60 * 24,
                      },
                      cacheableResponse: { statuses: [0, 200] },
                    },
                  },
                ]
              : []),
          ],
        },
      }),
    ],
    server: { port: 5173 },
  };
});
