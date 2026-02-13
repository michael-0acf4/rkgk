const CACHE_NAME = "v-20260213-214241";
const ASSETS = [
  "/",
  "/src/index.js",
  "/src/pwa/icon-192.png",
  "/src/pwa/icon-32.png",
  "/src/pwa/icon-512.png",
  "/src/pwa/icon.png",
  "/src/pwa/manifest.json",
  "/src/pwa/sw.js",
  "/src/rkgk/rkgk-brushes.js",
  "/src/rkgk/rkgk.js",
  "/src/ui/ui-comp.js",
  "/src/ui/ui-persist.js",
  "/src/ui/ui-window.js",
  "/textures/pencil.png",
  "/index.html"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((res) => res || fetch(event.request))
  );
});
