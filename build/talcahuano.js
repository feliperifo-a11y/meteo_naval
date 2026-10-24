// Inventario documental de Capuerto Talcahuano, integrado con la red existente.
function referenciaEstacionTalcahuano(datos, estacion) {
  return datos.features.find(f => (f.properties.meteoia_codigos || []).includes(estacion.codigo));
}
function enlaceTalcahuano(valor) {
  try { const u = new URL(valor); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch (e) { return null; }
}
function fichaTalcahuano(feature, escapar, metadatos) {
  const p = feature.properties, [lon, lat] = feature.geometry.coordinates;
  const enlace = (url, texto, pagina) => {
    const u = enlaceTalcahuano(url); if (!u) return '';
    const href = pagina && /\.pdf(?:$|[?#])/i.test(u) ? u.split('#')[0] + '#page=' + pagina : u;
    return `<a href="${escapar(href)}" target="_blank" rel="noopener noreferrer">${escapar(texto)} ↗</a>`;
  };
  const rows = [['Categoría', p.category], ['Entidad', p.owner], ['Variables documentadas', p.variables],
    ['Precisión de la referencia', p.precision], ['Posición del inventario', `${lat.toFixed(p.digits || 6)}, ${lon.toFixed(p.digits || 6)}`],
    ['Disponibilidad en la consulta', p.status], ['Consulta del inventario', p.consultado || metadatos.consultado]];
  const links = [enlace(p.source, 'Fuente documental', p.page), enlace(p.geosource, 'Fuente de ubicación'),
    enlace(p.dataurl, 'Consultar datos en la fuente'), enlace(p.alternativeurl, 'Fuente alternativa'), enlace(p.metadataurl, 'Metadatos')].filter(Boolean);
  return `<section class="talc-ficha"><h3>${escapar(p.name)}</h3><table>${rows.filter(([,v]) => v).map(([k,v]) => `<tr><th>${escapar(k)}</th><td>${escapar(v)}</td></tr>`).join('')}</table>` +
    `<p>${escapar(p.note || '')}</p><div class="talc-fuentes">${links.join(' ')}</div>` +
    (p.sensor ? '<p class="talc-alcance">El inventario documenta fuentes; sus fechas de consulta no son mediciones actuales. Los datos de la red de MeteoIA, si existen, se muestran con su propia hora.</p>' : '') + '</section>';
}
function crearCatalogoTalcahuano(L, map, datos, escapar, opciones) {
  const puertos = L.layerGroup(), observacion = L.layerGroup(), marcadores = new Map();
  const colores = { Autoridad: '#5d48aa', 'Alcaldía / caleta': '#ad5a28', 'Puerto / sitio': '#196a94',
    'Deporte / borde costero': '#487d31', 'Referencia marítima': '#6b6f76', estacion: '#147b88', boya: '#bd6b16', mareografo: '#a13d80' };
  const activa = () => map.hasLayer(observacion);
  const asociada = s => referenciaEstacionTalcahuano(datos, s);
  const esBoya = b => String(b.nombre).trim().toLowerCase() === 'talcahuano';
  function icono(p) {
    const c = colores[p.clase] || colores[p.category] || '#196a94';
    const signo = p.clase === 'estacion' ? 'M' : p.clase === 'mareografo' ? 'N' : p.clase === 'boya' ? 'B' : p.id;
    return L.divIcon({ className: 'talc-marcador', iconSize: [24,24], iconAnchor: [12,12],
      html: `<span style="background:${c}">${escapar(signo)}</span>` });
  }
  function agregar(f, grupo) {
    const p = f.properties;
    const estacion = p.clase === 'estacion' ? opciones.estaciones().find(s => (p.meteoia_codigos || []).includes(s.codigo)) : null;
    // Conserva la posición de la fuente instrumental. La coordenada documental se consulta en la ficha.
    const posicion = estacion ? [estacion.lat, estacion.lon] : f.geometry.coordinates.slice().reverse();
    const m = L.marker(posicion, { pane: 'talcPane', icon: icono(p), title: p.name });
    m.bindTooltip(`${escapar(p.label || p.name)} · ${escapar(estacion ? 'posición de la fuente instrumental' : p.precision)}`, { direction: 'top', offset: [0,-10] });
    m.bindPopup(() => estacion ? opciones.popupEstacion(estacion) : fichaTalcahuano(f, escapar, datos.metadata), { pane: 'talcPopupPane', className: 'talc-popup', maxWidth: Math.min(370, map.getContainer().clientWidth - 70), autoPanPadding: [25,35] });
    m.addTo(grupo); marcadores.set(p.id, m);
  }
  let puertosCreados = false;
  puertos.on('add', () => { opciones.ajustarZoom?.(true); if (!puertosCreados) { datos.features.filter(f => !f.properties.sensor).forEach(f => agregar(f, puertos)); puertosCreados = true; } });
  puertos.on('remove', () => { if (!activa()) opciones.ajustarZoom?.(false); });
  function actualizarObservacion() {
    if (!activa()) return;
    observacion.clearLayers();
    datos.features.filter(f => f.properties.sensor).forEach(f => agregar(f, observacion));
  }
  observacion.on('add', () => { opciones.ajustarZoom?.(true); actualizarObservacion(); opciones.refrescarRed(); });
  observacion.on('remove', () => { opciones.refrescarRed(); if (!map.hasLayer(puertos)) opciones.ajustarZoom?.(false); });
  function abrir(id) {
    const f = datos.features.find(f => f.properties.id === +id); if (!f) return;
    opciones.activar(f.properties.sensor ? 'talc_obs' : 'talc_puertos');
    const m = marcadores.get(f.properties.id); if (!m) return;
    opciones.prepararVista?.();
    const pos = m.getLatLng();
    map.setView(pos, f.properties.view === 'coast' || f.properties.clase === 'boya' ? 12 : 16);
    m.openPopup(); opciones.enfocarMapa?.();
  }
  function verTodo() {
    opciones.activar('talc_puertos'); opciones.activar('talc_obs'); opciones.prepararVista?.();
    map.fitBounds(datos.features.map(f => f.geometry.coordinates.slice().reverse()), { padding: [30,30], maxZoom: 12 });
  }
  function controles(box) {
    const div = document.createElement('div'); div.className = 'talc-herramientas';
    div.innerHTML = '<button type="button" class="talc-ver">Ver bahía de Talcahuano</button>' +
      '<label class="talc-selector">Consultar referencia<select aria-label="Referencia de Capuerto Talcahuano"><option value="">Seleccione una referencia…</option>' +
      datos.features.map(f => `<option value="${f.properties.id}">${f.properties.id}. ${escapar(f.properties.label || f.properties.name)}</option>`).join('') + '</select></label>' +
      '<details><summary>Fuentes y alcance · 34 referencias</summary>' +
      `<p>Consulta: ${escapar(datos.metadata.consultado)}. ${escapar(datos.metadata.alcance)}</p><p>${escapar(datos.metadata.precision)}</p>` +
      datos.metadata.documentos.map(d => `<p><a href="${escapar(enlaceTalcahuano(d.url))}" target="_blank" rel="noopener noreferrer">${escapar(d.titulo)} ↗</a></p>`).join('') +
      '<p>Las letras M, B y N identifican estaciones, boyas y nivel del mar. Los números identifican referencias portuarias. La posición de Watchkeeper es histórica y su transmisión actual no está confirmada. POSAR es una boya científica; el inventario no acredita sensor de oleaje.</p>' +
      `<p>${escapar(datos.metadata.atribucion)}</p>` +
      '<p><a href="data/geo/talcahuano.geojson" download>Descargar GeoJSON</a> · <a href="data/geo/talcahuano.kml" download>Descargar KML</a></p></details>';
    div.querySelector('.talc-ver').onclick = verTodo;
    div.querySelector('select').onchange = e => abrir(e.target.value);
    box.appendChild(div);
  }
  return { puertos, observacion, observacionActiva: activa, esEstacionCatalogada: s => !!asociada(s), esBoyaCatalogada: esBoya,
    fichaEstacion: s => { const f = asociada(s); return f ? fichaTalcahuano(f, escapar, datos.metadata) : ''; },
    marcadorEstacion: codigo => { const f = asociada({ codigo }); return activa() && f ? marcadores.get(f.properties.id) : null; },
    actualizarObservacion, controles, abrir, verTodo };
}
