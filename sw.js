const CACHE = "faith-tracker-v4";
// Relative paths: work whether the app lives at the site root or in a folder (e.g. username.github.io/faith-tracker/).
// A leading "/" always means the domain root, which is the wrong place for a project site.
const ASSETS = ["./", "./index.html", "./manifest.json"];

// ── INSTALL: cache core assets, activate immediately ──────
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

// ── ACTIVATE: clear old caches, take control right away ───
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: network-first, so updates always show when   ──
// ── you're online. Falls back to cache only if offline.  ──
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
