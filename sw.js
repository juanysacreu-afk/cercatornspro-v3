
const CACHE_NAME = 'fgc-pro-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Estrategia Network-only o simple pass-through para asegurar que Supabase funcione siempre
  event.respondWith(fetch(event.request));
});
