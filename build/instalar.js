// Sin aviso de instalación en pantalla (retirado a pedido). Se mantiene el service worker mínimo para que
// Chrome/Edge sigan permitiendo instalar la página desde su propio menú o el ícono de la barra de direcciones.
(function () {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if ('serviceWorker' in navigator && !ios && (location.protocol === 'https:' || location.hostname === 'localhost'))
    navigator.serviceWorker.register('sw-app.js').catch(() => {});
})();
