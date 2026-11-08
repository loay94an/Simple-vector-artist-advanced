/* =========================================================
   RASEM 3.0 - PWA SERVICE WORKER (NETWORK-FIRST STRATEGY)
   Ensures the user ALWAYS gets the latest updates immediately
   while preserving full offline support as a robust PWA.
========================================================= */

const CACHE_NAME = "rasem-pwa-v10-flex-centered-overlay";
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./js/app.js",
  "./js/core.js",
  "./js/engine.js",
  "./js/tools.js",
  "./js/layers-history.js",
  "./js/precision.js",
  "./js/storage-export.js",
  "./js/ui.js",
  "./js/brush-library.js",
  "./js/color-ui.js",
  "./js/shapes-ui.js",
  "./js/tool-settings-popup.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Force immediate activation
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn("Pre-cache warning (non-fatal):", err);
      });
    })
  );
});

// Clean up all old caches immediately
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First strategy: Always fetch newest version from network, fall back to cache when offline
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return (await caches.match("./index.html")) || (await caches.match("./"));
        }
      })
  );
});
