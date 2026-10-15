const CACHE_NAME = 'NEXUS-v2.5'; // Suport per obrir circulació a GIP en prémer la notificació

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

// Gestió de clics a notificacions del mòbil i escriptori (PC)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const urlToOpen = notifData.url || '/?view=gip';
  const circId = notifData.circId || (() => {
    try {
      const u = new URL(urlToOpen, self.location.origin);
      return u.searchParams.get('circ');
    } catch (_) {
      return null;
    }
  })();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. Si ja hi ha una finestra o pestanya oberta de l'aplicació
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          // Notifiquem a l'aplicació oberta perquè canviï a la pestanya GIP i seleccioni la circulació
          client.postMessage({
            type: 'NEXUS_OPEN_GIP_CIRC',
            circId: circId,
            url: urlToOpen
          });
          return;
        }
      }

      // 2. Si l'aplicació estava completament tancada, obrim la finestra amb la URL que conté els paràmetres ?view=gip&circ=...
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
      const circId = data.circId || data.data?.circId || null;
      const url = data.url || data.data?.url || (circId ? `/?view=gip&circ=${encodeURIComponent(circId)}` : '/?view=gip');

      options = {
        ...options,
        ...data,
        data: {
          url,
          circId: circId || (() => {
            try {
              return new URL(url, self.location.origin).searchParams.get('circ');
            } catch (_) {
              return null;
            }
          })()
        }
      };
    } catch (e) {
      options.body = event.data.text() || options.body;
    }
  }

  event.waitUntil(self.registration.showNotification(title, options));
});
