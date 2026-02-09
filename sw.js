
const CACHE_NAME = 'fgc-pro-v2.2'; // Canviar aquest número quan vulguis forçar una actualització

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Estrategia Network-only o simple pass-through para asegurar que Supabase funcione siempre
  event.respondWith(fetch(event.request));
});
