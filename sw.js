// Service worker mínimo: permite instalar el dashboard como aplicación en el celular.
// No guarda copias: las páginas y datos propios se piden siempre a la red, para que estén al día.
// Las consultas a otros sitios (boyas, contador) no se tocan.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request));
});
