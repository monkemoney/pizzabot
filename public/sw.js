'use strict';

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ── Push received ──────────────────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch {}

  const title   = data.title   || '🍕 הזמנה חדשה!';
  const body    = data.body    || 'הגיעה הזמנה חדשה לדשבורד';
  const orderId = data.orderId || '';
  const badge   = '/favicon.ico';

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/favicon.ico',
      badge,
      tag:   'new-order-' + orderId,
      renotify: true,
      vibrate:  [200, 100, 200],
      data: { url: '/?tab=orders' },
      actions: [
        { action: 'open',    title: 'פתח דשבורד' },
        { action: 'dismiss', title: 'סגור'        },
      ],
    })
  );
});

// ── Notification click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  const targetUrl = (e.notification.data && e.notification.data.url)
    ? e.notification.data.url
    : '/';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NEW_ORDER' });
          return;
        }
      }
      // Open new tab
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
