// Service worker mínimo de Meteo Naval: no guarda nada en caché, solo pasa cada consulta a la red.
// Existe para que Chrome/Edge ofrezcan "Instalar aplicación".
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => { if (e.request.method === 'GET') e.respondWith(fetch(e.request)); });
