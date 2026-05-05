import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Set base for GitHub Pages: serves at /<repo-name>/.
// Override with VITE_BASE if your repo name differs from "golf-planner".
const base = process.env.VITE_BASE ?? '/golf-planner/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Caddy — Golf Strategy Planner',
        short_name: 'Caddy',
        description: 'Pre-round hole-by-hole strategy recommendations.',
        theme_color: '#0a4d2e',
        background_color: '#0a4d2e',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            // Esri World Imagery satellite tiles — cache so courses load offline.
            urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esri-tiles',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Overpass responses — cache for the session.
            urlPattern: /^https:\/\/overpass-api\.de\/.*$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'overpass',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
})
