const CACHE_NAME = 'NEXUS-v2.4'; // Incrementat per registrar suport de notificacions al mòbil

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

// Gestió de clics a notificacions del mòbil
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url.includes('view=gip') || client.url.includes(urlToOpen) || urlToOpen === '/') {
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Suport per a Web Push en segon pla
self.addEventListener('push', (event) => {
  let title = '⚠️ Retard a la xarxa FGC';
  let options = {
    body: 'Una circulació porta més de 4 minuts de retard.',
    icon: '/logoNX.png',
    badge: '/logoNX.png',
    vibrate: [200, 100, 200, 100, 200],
    data: { url: '/?view=gip' },
    tag: 'nexus-delay-alert',
    renotify: true
  };

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      options = { ...options, ...data };
    } catch (e) {
      options.body = event.data.text() || options.body;
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});
