import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
        background_color: "#0b1220",
        theme_color: "#10b981",
        icons: [
          { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
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
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src")
    }
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  }
});

