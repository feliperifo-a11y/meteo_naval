// Service worker mínimo: permite instalar el dashboard como aplicación.
// Solo atiende la apertura de la página (siempre desde la red, sin copias guardadas);
// íconos, datos y consultas a otros sitios no pasan por aquí.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request));
});
