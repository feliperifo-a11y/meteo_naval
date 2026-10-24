// Un resumen por aviso, dentro de una de sus zonas vigentes y junto a su geometría.
function puntoInteriorAviso(geometria) {
  const poligonos = geometria?.type === 'Polygon' ? [geometria.coordinates]
    : geometria?.type === 'MultiPolygon' ? geometria.coordinates : [];
  let mejor = null, ancho = 0;
  for (const anillos of poligonos) {
    const exterior = anillos[0];
    if (!exterior?.length) continue;
    const norte = Math.max(...exterior.map(p => p[1])), sur = Math.min(...exterior.map(p => p[1]));
    // Las intersecciones incluyen los huecos, para no colocar la tarjeta en tierra.
    const lat = (norte + sur) / 2, cortes = [];
    for (const anillo of anillos) for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const a = anillo[j], b = anillo[i];
      if ((a[1] > lat) !== (b[1] > lat)) cortes.push(a[0] + (lat - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    cortes.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cortes.length; i += 2) {
      const w = cortes[i + 1] - cortes[i];
      if (w > ancho) { ancho = w; mejor = [lat, (cortes[i] + cortes[i + 1]) / 2]; }
    }
  }
  return mejor && { posicion: mejor, ancho };
}

function enlaceOficialAviso(aviso) {
  for (const valor of [aviso.url, aviso.pagina]) {
    try {
      const u = new URL(valor);
      if (u.protocol === 'https:' && (u.hostname === 'directemar.cl' || u.hostname.endsWith('.directemar.cl'))) return u.href;
    } catch (e) {}
  }
  return null;
}

function crearResumenAviso(L, aviso, zonas, escapar, formatear, ahora = Date.now()) {
  const vigentes = zonas.filter(z => {
    const inicio = Date.parse(z.desde), fin = Date.parse(z.hasta);
    return Number.isFinite(inicio) && Number.isFinite(fin) && inicio <= ahora && ahora <= fin;
  });
  const candidatos = vigentes.map(z => puntoInteriorAviso(z.geom)).filter(Boolean).sort((a, b) => b.ancho - a.ancho);
  if (!candidatos.length) return null;
  const condiciones = [...new Set(vigentes.map(z => z.detalle?.trim()
    ? (vigentes.length > 1 ? z.nombre + ': ' : '') + z.detalle.trim() : '').filter(Boolean))];
  const resumen = condiciones.join(' · ') || aviso.resumen || 'Consulte las condiciones en la fuente oficial.';
  const fin = new Date(Math.max(...vigentes.map(z => Date.parse(z.hasta))));
  const enlace = enlaceOficialAviso(aviso);
  const html = `<section class="av-resumen-tarjeta" aria-label="${escapar(aviso.tipo)} vigente">` +
    `<b class="av-resumen-titulo">${escapar(aviso.tipo)}</b>` +
    `<span class="av-resumen-sector">${escapar(aviso.sector || vigentes.map(z => z.nombre).join(' · '))}</span>` +
    `<p class="av-resumen-texto" title="${escapar(resumen)}">${escapar(resumen)}</p>` +
    `<span class="av-resumen-validez">Vigente · hasta ${escapar(formatear(fin))} (Chile)</span>` +
    (aviso.zona_ix ? '<small>Alerta calculada por MeteoIA a partir del pronóstico.</small>' : '') +
    (enlace ? `<a href="${escapar(enlace)}" target="_blank" rel="noopener noreferrer">Pronóstico oficial ↗</a>` : '') + '</section>';
  return L.marker(candidatos[0].posicion, { pane: 'avResumenPane', keyboard: false,
    icon: L.divIcon({ className: 'av-resumen', iconSize: [0, 0], iconAnchor: [0, 0], html }) });
}
