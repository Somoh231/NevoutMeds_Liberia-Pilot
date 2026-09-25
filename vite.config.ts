import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Release = the deployed commit (Vercel sets VERCEL_GIT_COMMIT_SHA at build time).
const RELEASE = process.env.VITE_APP_RELEASE || (process.env.VERCEL_GIT_COMMIT_SHA ? `nevout-meds@${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)}` : "");
// Source maps are uploaded to Sentry ONLY when a build-side auth token exists
// (a Vercel env var, never VITE_*), and are deleted from the output afterwards so
// they are never served publicly. Without the token, no maps are produced.
const UPLOAD_MAPS = !!(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_RELEASE": JSON.stringify(RELEASE)
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["pwa/favicon-32.png", "pwa/apple-touch-icon.png"],
      manifest: {
        name: "NevOut Meds",
        short_name: "NevOut Meds",
        description: "NevOut Meds Platform — offline-capable pharmacy workflows.",
        start_url: "/platform",
        scope: "/",
        display: "standalone",
        background_color: "#f3f6f4",
        theme_color: "#0b6b50",
        icons: [
          { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // The monitoring SDK is fetched only when monitoring is configured and
        // online; it is not worth pre-downloading on every install over 3G.
        globIgnores: ["**/sentry-*.js"],
        clientsClaim: true,
        skipWaiting: false,
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2,ttf,eot,json}"],
        runtimeCaching: [
          // App shell navigation: always try network first, fall back to cached shell.
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html",
              networkTimeoutSeconds: 3
            }
          },
          // Static assets.
          {
            urlPattern: ({ request }) => request.destination === "script" || request.destination === "style" || request.destination === "worker",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "assets" }
          },
          // Images.
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    }),
    ...(UPLOAD_MAPS
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: RELEASE || undefined },
            sourcemaps: { filesToDeleteAfterUpload: ["**/*.map"] },
            telemetry: false
          })
        ]
      : [])
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src")
    }
  },
  root: path.resolve(__dirname, "client"),
  // Env files live at the repo root, not under client/.
  envDir: __dirname,
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: UPLOAD_MAPS ? "hidden" : false
  }
});

