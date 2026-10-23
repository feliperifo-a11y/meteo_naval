// Instalación voluntaria: enlace discreto, sin banners ni diálogos automáticos.
(function () {
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const guia = new URL('app/', location.href);
  if (!instalada && new URLSearchParams(location.search).has('instalar')) {
    location.replace(guia.href);
    return;
  }
  const cabecera = document.querySelector('.reloj');
  if (!instalada && cabecera) {
    const enlace = document.createElement('a');
    enlace.href = guia.href;
    enlace.className = 'app-install-link';
    enlace.textContent = 'Instalar app gratis';
    cabecera.appendChild(enlace);
  }
  // También en iPhone. El worker solo intercepta navegaciones: los íconos y
  // los datos meteorológicos conservan sus consultas normales a la red.
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register(new URL('sw-app.js', location.href)).catch(() => {});
  }
})();

