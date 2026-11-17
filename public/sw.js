// Service worker mínimo: permite instalar el escáner como app (PWA).
// Las operaciones requieren conexión, así que solo se guarda en caché la página sin conexión.
const CACHE = "escaner-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request("/offline.html", { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
  }
});
