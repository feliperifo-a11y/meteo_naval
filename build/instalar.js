// Aviso "Instalar como app" (dashboard y pronósticos). Compartido por index.html e ia.html.
// Chrome/Edge (computador y Android): usa el diálogo nativo de instalación.
// Safari en Mac: indica "Archivo → Agregar al Dock". iPhone/iPad: indica "Compartir → Agregar a inicio".
(function instalarApp() {
  const app = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (app) return;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safariMac = !ios && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\//.test(ua);
  const safariIos = ios && !/CriOS|FxiOS|EdgiOS|GSA\//.test(ua);
  // Service worker mínimo (solo pasa las consultas a la red): Chrome lo usa para ofrecer la instalación.
  // No se usa en iPhone/iPad, donde no hace falta.
  if ('serviceWorker' in navigator && !ios && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw-app.js').catch(() => {});
  let cerradoHasta = 0; try { cerradoHasta = +localStorage.getItem('mn_inst_cerrado') || 0; } catch (e) {}
  if (Date.now() < cerradoHasta) return;

  const css = document.createElement('style');
  css.textContent = `#instBar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:4000;display:flex;align-items:center;gap:12px;background:#0f2a44;color:#f2f6fa;border-radius:14px;padding:9px 10px 9px 12px;box-shadow:0 8px 28px rgba(0,0,0,.35);font:13px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:calc(100vw - 24px)}
#instBar[hidden]{display:none}
#instBar img{width:34px;height:34px;border-radius:8px;flex:none}
#instBar b{display:block;font-size:13.5px}#instBar span{opacity:.8;font-size:12px}
#instBar .ib{border:0;border-radius:999px;padding:7px 15px;font:600 13px system-ui,sans-serif;cursor:pointer;background:#2e9d4f;color:#fff;white-space:nowrap}
#instBar .ib:hover{filter:brightness(1.1)}
#instBar .ix{border:0;background:none;color:#f2f6fa;opacity:.7;font-size:18px;cursor:pointer;padding:0 4px}
#instAyuda{position:fixed;inset:0;z-index:4001;background:rgba(8,20,34,.6);display:flex;align-items:center;justify-content:center;padding:16px}
#instAyuda[hidden]{display:none}
#instAyuda .c{background:#fff;color:#18212b;border-radius:14px;max-width:360px;width:100%;padding:18px 20px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4);font:14px/1.5 system-ui,sans-serif}
#instAyuda img{width:64px;height:64px;border-radius:14px}
#instAyuda h3{margin:8px 0 6px;font-size:17px}
#instAyuda ol{text-align:left;padding-left:20px;margin:6px 0 12px}
#instAyuda button{border:0;background:#0f2a44;color:#fff;border-radius:8px;padding:7px 16px;font:inherit;cursor:pointer}`;
  document.head.appendChild(css);
  const bar = document.createElement('div');
  bar.id = 'instBar'; bar.hidden = true;
  bar.innerHTML = '<img src="app/ic-192.png" alt=""><div><b>Instalar MeteoIA</b><span>Ábrala como app, en su propia ventana</span></div><button type="button" class="ib">Instalar</button><button type="button" class="ix" aria-label="Cerrar">×</button>';
  document.body.appendChild(bar);
  const cerrar = () => { bar.hidden = true; try { localStorage.setItem('mn_inst_cerrado', String(Date.now() + 14 * 864e5)); } catch (e) {} };
  bar.querySelector('.ix').onclick = cerrar;

  const ayuda = pasos => {
    let a = document.getElementById('instAyuda');
    if (!a) { a = document.createElement('div'); a.id = 'instAyuda'; document.body.appendChild(a); a.addEventListener('click', e => { if (e.target === a) a.hidden = true; }); }
    a.innerHTML = `<div class="c"><img src="app/ic-192.png" alt=""><h3>Instalar MeteoIA</h3><ol>${pasos}</ol><button type="button">Entendido</button></div>`;
    a.querySelector('button').onclick = () => { a.hidden = true; };
    a.hidden = false;
  };

  let diferido = null;
  window.addEventListener('beforeinstallprompt', e => {     // Chrome / Edge
    e.preventDefault(); diferido = e; bar.hidden = false;
  });
  window.addEventListener('appinstalled', () => { bar.hidden = true; });
  bar.querySelector('.ib').onclick = async () => {
    if (diferido) { diferido.prompt(); const r = await diferido.userChoice.catch(() => null); diferido = null; if (r && r.outcome === 'accepted') bar.hidden = true; return; }
    if (safariMac) ayuda('<li>En la barra de menú de Safari, abra <b>Archivo</b>.</li><li>Elija <b>Agregar al Dock…</b> y luego <b>Agregar</b>.</li>');
    else if (safariIos) ayuda('<li>Toque <b>Compartir</b> (el cuadrado con flecha hacia arriba).</li><li>Elija <b>Agregar a pantalla de inicio</b> y toque <b>Agregar</b>.</li>');
    else if (ios) ayuda('<li>Abra esta página en <b>Safari</b>.</li><li>Toque <b>Compartir</b> y elija <b>Agregar a pantalla de inicio</b>.</li>');
    else ayuda('<li>Abra el menú del navegador (⋮).</li><li>Elija <b>Instalar aplicación</b> o <b>Agregar a pantalla principal</b>.</li>');
  };
  // Safari no avisa cuando se puede instalar: se muestra el aviso tras unos segundos.
  if (safariMac || safariIos) setTimeout(() => { if (!diferido) bar.hidden = false; }, 4000);
})();
