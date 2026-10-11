// Estadísticas de uso anónimas y agregadas (sin cookies ni datos personales).
// - Cloudflare Web Analytics: origen de las visitas, páginas vistas, país y tipo de equipo.
// - GoatCounter: qué se usa dentro de la página (clics en botones, avisos, estaciones, bahías, capas).
// Mientras los códigos estén vacíos no se carga nada.
(function estadisticas() {
  const CLOUDFLARE_TOKEN = '62d3b34b679746b88bd3d864ec86b6f8';   // token de Cloudflare Web Analytics (público)
  const GOATCOUNTER = '';        // código del sitio en GoatCounter, p. ej. 'meteoia' → meteoia.goatcounter.com
  if (location.hostname === 'localhost' || location.protocol === 'file:') return;

  if (CLOUDFLARE_TOKEN) {
    const s = document.createElement('script');
    s.defer = true; s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: CLOUDFLARE_TOKEN }));
    document.head.appendChild(s);
  }
  if (!GOATCOUNTER) return;
  const g = document.createElement('script');
  g.async = true; g.src = 'https://gc.zgo.at/count.js';
  g.setAttribute('data-goatcounter', `https://${GOATCOUNTER}.goatcounter.com/count`);
  document.head.appendChild(g);

  const pagina = /ia\.html/.test(location.pathname) ? 'pronosticos' : 'dashboard';
  const limpio = t => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const evento = (nombre, titulo) => {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: `${pagina}/${nombre}`, title: limpio(titulo || nombre), event: true }); } catch (e) {}
  };
  window.mnEvento = evento;

  document.addEventListener('click', e => {
    const t = e.target;
    const c = sel => t.closest && t.closest(sel);
    let el;
    if ((el = c('.btnIA'))) return evento('boton-pronosticos-ia');
    if ((el = c('a[href*="meteograma_"]'))) return evento('meteograma', el.href.replace(/.*meteograma_|\.png.*/g, ''));
    if ((el = c('#avList .av[data-n]'))) return evento('aviso', el.querySelector('.avT b')?.textContent);
    if ((el = c('#tbl tbody tr[data-c]'))) return evento('estacion-tabla', el.dataset.c);
    if ((el = c('.bi[data-c]')) && !c('.biD')) return evento('bahia-lista', el.dataset.c);
    if ((el = c('#dias button, .iaDias button'))) return evento('dia', el.textContent);
    if ((el = c('#btnRefresh'))) return evento('boton-actualizar');
    if ((el = c('.btnPleg'))) return evento('plegar-panel', el.dataset.p);
    if ((el = c('.marca'))) return evento('logo');
    if ((el = c('a[target="_blank"]'))) return evento('enlace-externo', el.hostname);
  }, true);
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'selZona') evento('area', t.value || 'todas');
    else if (/^chk_/.test(t.id)) evento('capa', `${t.id.slice(4)} ${t.checked ? 'on' : 'off'}`);
    else if (['fEst', 'fRed', 'fArea'].includes(t.id)) evento('filtro-' + t.id.slice(1).toLowerCase(), t.value || 'todos');
  }, true);
  // Ventanas abiertas en el mapa (estaciones, boyas, avisos, subáreas, bahías)
  const engancharMapa = () => {
    if (typeof map === 'undefined' || !map.on) return setTimeout(engancharMapa, 1000);
    map.on('popupopen', ev => {
      const el = ev.popup.getElement();
      const titulo = el && (el.querySelector('.ppT, .popH b') || {}).textContent;
      evento('mapa-ventana', titulo);
    });
  };
  engancharMapa();
})();
