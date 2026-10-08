// Ya no se usa: este archivo se reemplaza para que los equipos que lo tenían lo den de baja solos.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.registration.unregister()));
