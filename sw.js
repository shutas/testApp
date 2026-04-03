const CACHE_NAME = "stack-game-v1";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(e.request).then((cached) => {
        if (cached) {
          const dateHeader = cached.headers.get("date");
          if (dateHeader) {
            const age = Date.now() - new Date(dateHeader).getTime();
            if (age < CACHE_MAX_AGE) return cached;
          } else {
            return cached;
          }
        }
        return fetch(e.request).then((response) => {
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        }).catch(() => cached || new Response("Offline", { status: 503 }));
      })
    )
  );
});
