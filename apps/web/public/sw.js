/* AgriLink service worker — offline shell for field agents (module 02).
 *  - Static assets (/_next/static, icons): cache-first (they are content-hashed).
 *  - Page navigations: network-first, falling back to the last cached copy, then /offline.
 *  - API calls are never cached here (registrations queue in IndexedDB instead).
 */
const VERSION = "agrilink-v2";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const PRECACHE_PAGES = ["/offline", "/agent", "/agent/farmers/new", "/agent/farmers", "/agent/sync"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE_PAGES.map((url) =>
            fetch(url, { credentials: "same-origin" })
              .then((res) => (res.ok && !res.redirected ? cache.put(url, res) : undefined))
              .catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        try {
          const res = await fetch(request);
          // Don't cache redirects to /login or error pages.
          if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          return (await cache.match(url.pathname)) || (await cache.match("/offline")) || Response.error();
        }
      })(),
    );
  }
});
