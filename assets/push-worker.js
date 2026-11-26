const trackingPath = /^\/(de-CH|fr-CH)\/shipment\/[A-Za-z0-9_-]{43}$/;

self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    if (!trackingPath.test(payload.path)) return;
    event.waitUntil(self.registration.showNotification(payload.title, {
      body: payload.body, tag: payload.tag, renotify: false, data: { path: payload.path },
    }));
  } catch {
    // Ignore malformed notifications.
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const path = event.notification.data?.path;
  if (!trackingPath.test(path)) return;
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(window => window.url === url);
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
