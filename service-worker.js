/* رسام الخط العربي — PWA offline shell */
const CACHE_NAME = "rasem-arabic-calligraphy-pwa-v2";
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/brand-icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./css/app.css",
  "./js/app.js",
  "./js/arabic-writing.js",
  "./js/auto-correction.js",
  "./js/brush-library.js",
  "./js/color-ui.js",
  "./js/core.js",
  "./js/engine.js",
  "./js/layers-history.js",
  "./js/precision.js",
  "./js/shape-recognition.js",
  "./js/shapes-ui.js",
  "./js/storage-export.js",
  "./js/tool-settings-popup.js",
  "./js/tools.js",
  "./js/ui.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const results = await Promise.allSettled(
      PRECACHE_ASSETS.map(async asset => {
        const response = await fetch(asset, { cache: "reload" });
        if (!response.ok) throw new Error("Precache failed: " + asset);
        await cache.put(asset, response);
      })
    );
    const failures = results.filter(result => result.status === "rejected");
    if (failures.length) console.warn("PWA precache skipped some assets:", failures);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response && response.status === 200 && response.type !== "opaque") {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === "navigate") {
        return (await cache.match("./index.html")) || Response.error();
      }
      return Response.error();
    }
  })());
});
