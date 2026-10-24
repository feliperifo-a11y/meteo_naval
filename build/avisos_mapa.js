// El aviso muestra su ficha solo al pasar el cursor o tocar su geometría.
function enlaceOficialAviso(aviso) {
  for (const valor of [aviso.url, aviso.pagina]) {
    try {
      const u = new URL(valor);
      if (u.protocol === 'https:' && (u.hostname === 'directemar.cl' || u.hostname.endsWith('.directemar.cl'))) return u.href;
    } catch (e) {}
  }
  return null;
}

function configurarAvisoInteractivo(capa, aviso, zona, escapar, formatear, ahora = Date.now()) {
  const inicio = Date.parse(zona.desde), fin = Date.parse(zona.hasta);
  const vigente = t => Number.isFinite(inicio) && Number.isFinite(fin) && inicio <= t && t <= fin;
  if (!vigente(ahora)) return false;
  const enlace = enlaceOficialAviso(aviso);
  const titulo = aviso.zona_ix ? 'Alerta MeteoIA · Zona IX' : aviso.tipo;
  const html = `<section class="av-resumen-tarjeta" aria-label="${escapar(titulo)}">` +
    `<b class="av-resumen-titulo">${escapar(titulo)}</b>` +
    `<span class="av-resumen-validez">Vigencia: ${escapar(formatear(new Date(inicio)))} → ${escapar(formatear(new Date(fin)))} (Chile)</span>` +
    (enlace ? `<a href="${escapar(enlace)}" target="_blank" rel="noopener noreferrer">Pronóstico oficial ↗</a>` : '') + '</section>';
  capa.unbindTooltip();
  capa.bindPopup(html, { className: 'aviso-hover', maxWidth: 240, minWidth: 170,
    autoPan: false, closeButton: false, closeOnClick: true });
  let temporizador;
  const cancelar = () => { clearTimeout(temporizador); temporizador = null; };
  const cerrar = () => {
    cancelar();
    temporizador = setTimeout(() => {
      const nodo = capa.getPopup()?.getElement();
      if (!nodo?.matches(':hover') && !nodo?.contains(document.activeElement)) capa.closePopup();
    }, 200);
  };
  const abrir = evento => {
    cancelar();
    if (vigente(Date.now())) {
      capa.getPopup().options.offset = [0, 7];
      capa.openPopup(evento.latlng);
    }
    else capa.closePopup();
  };
  capa.on({
    mouseover: abrir,
    mouseout: cerrar,
    click: abrir, // En pantallas táctiles, tocar el área abre la misma ficha.
    popupopen: () => {
      const nodo = capa.getPopup()?.getElement();
      if (!nodo) return;
      // Mantiene la ficha dentro del mapa sin desplazarlo al pasar el cursor.
      const marco = nodo.closest('.leaflet-container');
      if (marco) {
        const a = nodo.getBoundingClientRect(), m = marco.getBoundingClientRect(), margen = 8;
        const dx = a.left < m.left + margen ? m.left + margen - a.left
          : a.right > m.right - margen ? m.right - margen - a.right : 0;
        const dy = a.top < m.top + margen ? m.top + margen - a.top
          : a.bottom > m.bottom - margen ? m.bottom - margen - a.bottom : 0;
        if (dx || dy) { capa.getPopup().options.offset = [dx, 7 + dy]; capa.getPopup().update(); }
      }
      nodo.onmouseenter = cancelar;
      nodo.onmouseleave = cerrar;
      nodo.onfocusin = cancelar;
      nodo.onfocusout = cerrar;
    },
    popupclose: cancelar,
    remove: () => { cancelar(); capa.closePopup(); }
  });
  return true;
}
