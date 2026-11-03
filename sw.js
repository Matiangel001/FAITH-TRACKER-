const CACHE = "faith-tracker-v5";
// Relative paths: work whether the app lives at the site root or in a folder (e.g. username.github.io/faith-tracker/).
// A leading "/" always means the domain root, which is the wrong place for a project site.
const ASSETS = ["./", "./index.html", "./manifest.json"];

// Files from these hosts are versioned in their URL (firebasejs/10.13.2, htm@3.1.1) or practically never change (fonts),
// so they are served from the cache first. After the first visit the app no longer waits for the network to start.
const CDN_HOSTS = ["www.gstatic.com", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"];

// How long the app's own files (index.html …) get to answer before the saved copy is used instead.
// The network request keeps going in the background and refreshes the saved copy, so updates still arrive — on the next launch.
const NETWORK_WAIT_MS = 4000;

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

const cacheable = (res) => res && (res.ok || res.type === "opaque");

// CDN files: saved copy first, network only the very first time.
async function cacheFirst(request, event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) event.waitUntil(cache.put(request, res.clone()).catch(() => {})); // keep the worker alive until it is saved
  return res;
}

// The app's own files: fresh from the network when it answers in time, otherwise the saved copy.
async function networkFirst(request, event) {
  const cache = await caches.open(CACHE);
  const network = fetch(request);
  // Save the answer for next time. waitUntil keeps the worker alive until it is saved, even after we have already
  // answered the page from the saved copy because the network was slow.
  event.waitUntil(network.then((res) => (res.ok ? cache.put(request, res.clone()) : undefined)).catch(() => {}));
  const cached = await cache.match(request, { ignoreVary: true });
  if (!cached) {
    // Nothing saved yet: wait for the network, and fall back to the saved start page for page loads.
    return network.catch(async () => (request.mode === "navigate" && (await cache.match("./index.html"))) || Response.error());
  }
  return Promise.race([
    network.catch(() => cached),
    new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_WAIT_MS)),
  ]);
}

// ── FETCH ─────────────────────────────────────────────────
// Only plain GET requests for the app's own files and the CDN files above are handled here.
// Everything else — Firestore, Firebase sign-in, Sentry, any POST — goes straight to the network untouched. (The old version
// ran ALL of it through the worker, which can stall or break Firestore's long-lived connections on a slow phone network.)
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, event));
  } else if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, event));
  }
});
