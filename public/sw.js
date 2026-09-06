const SHELL_CACHE = 'slearn-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match('/'))));
});
