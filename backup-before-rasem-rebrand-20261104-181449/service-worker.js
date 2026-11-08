/* =========================================================
   RASEM 3.0 - PWA SERVICE WORKER
   Cache-First Strategy for offline capability and instant loads.
========================================================= */

const CACHE_NAME = "rasem-pwa-v3";
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
  "./js/tool-settings-popup.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Stale-While-Revalidate or Cache-First for static assets
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // Fetch in background to update cache
        fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return networkResponse;
      }).catch(async () => {
        if (request.mode === "navigate") {
          return await caches.match("./index.html");
        }
      });
    })
  );
});
