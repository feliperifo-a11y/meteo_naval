// ============================ Hielo marino AMSR2 (página Desarrollo) ============================
// Lee data/hielo_amsr2.json (scripts/hielo_amsr2.py): concentración diaria ASI AMSR2 v5.4 de la Universidad de Bremen
// (6,25 km), en clases de décimos con los colores OMM, y el borde de hielo como contorno de 15 %.
// Estimación automática satelital: no reemplaza la carta de hielo oficial.
function crearCapaHieloAMSR2(L, map, escapar, contenedor) {
  contenedor = contenedor || document.getElementById('mapWrap');
  const grupo = L.layerGroup();
  if (!map.getPane('hieloAmsrPane')) { const p = map.createPane('hieloAmsrPane'); p.style.zIndex = 330; }
  const panel = document.createElement('section'); panel.className = 'uv-panel hielo-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Hielo marino AMSR2');
  panel.innerHTML = '<div class="uv-cab"><b>Hielo marino (AMSR2)</b><a href="https://seaice.uni-bremen.de/sea-ice-concentration/" target="_blank" rel="noopener noreferrer">Fuente Bremen ↗</a></div>' +
    '<p class="hielo-etq">Estimación automática satelital · no reemplaza la carta de hielo oficial</p>' +
    '<p class="uv-estado" role="status">Cargando…</p>' +
    '<div class="hielo-ley"></div>' +
    '<p class="hielo-res"></p>' +
    '<p class="uv-ayuda">Pulsa una zona para ver su concentración. Carta oficial: <a href="hielos.html">Monitoreo de hielos</a>.</p>' +
    '<details><summary>Fuente y alcance</summary><div class="hielo-fuente"></div></details>';
  contenedor.appendChild(panel);
  L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel);
  const estado = panel.querySelector('.uv-estado'), ley = panel.querySelector('.hielo-ley'),
    res = panel.querySelector('.hielo-res'), fuente = panel.querySelector('.hielo-fuente');
  let datos = null, cargado = 0;

  const latDM = v => { const t = Math.round(Math.abs(v) * 60), g = Math.floor(t / 60), m = t - g * 60; return `${g}°${String(m).padStart(2, '0')}′ ${v < 0 ? 'S' : 'N'}`; };
  const fechaDato = f => new Date(f + 'T12:00:00Z').toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/\./g, '');
  const horaChile = iso => new Date(iso.replace('Z', ':00Z')).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
  const pct = v => String(v).replace('.', ',');

  async function cargar() {
    if (datos && Date.now() - cargado < 30 * 60000) return pintar();
    estado.textContent = 'Cargando…';
    try {
      const r = await fetch('data/hielo_amsr2.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      datos = await r.json(); cargado = Date.now();
    } catch (e) {
      datos = null; grupo.clearLayers(); ley.innerHTML = ''; res.textContent = '';
      estado.textContent = 'Aún no hay un análisis procesado o no se pudo leer el archivo. Se actualiza una vez al día, cuando la Universidad de Bremen publica el mapa.';
      return;
    }
    pintar();
  }

  function pintar() {
    if (!map.hasLayer(grupo) || !datos) return;
    grupo.clearLayers();
    L.geoJSON(datos.zonas, {
      pane: 'hieloAmsrPane',
      style: f => ({ stroke: false, fillColor: f.properties.color, fillOpacity: 0.62 }),
      onEachFeature: (f, capa) => capa.bindPopup(`<b>Hielo marino ${escapar(f.properties.nombre)}</b><br>Concentración ${pct(f.properties.min)}–${pct(f.properties.max)} %<br><small>AMSR2 · ${escapar(fechaDato(datos.fecha))} · estimación automática</small>`)
    }).addTo(grupo);
    if (datos.borde && datos.borde.geometry && datos.borde.geometry.coordinates && datos.borde.geometry.coordinates.length) {
      L.geoJSON(datos.borde, { pane: 'hieloAmsrPane', interactive: false, style: { color: '#ffffff', weight: 4, opacity: 0.85 } }).addTo(grupo);
      L.geoJSON(datos.borde, { pane: 'hieloAmsrPane', interactive: false, style: { color: '#0d2b6b', weight: 1.8, opacity: 1 } }).addTo(grupo);
    }
    estado.textContent = `Análisis del ${fechaDato(datos.fecha)}`;
    ley.innerHTML = datos.clases.map(c => `<span><i style="background:${c.color}"></i>${escapar(c.nombre)}</span>`).join('') +
      '<span><i class="hielo-borde"></i>Borde de hielo (' + pct(datos.umbral_borde) + ' %)</span>';
    const r = datos.resumen || {};
    res.textContent = r.borde_lat_norte_drake != null
      ? `Borde más al norte en el Paso Drake (${Math.abs(r.sector_drake_lon[0])}° a ${Math.abs(r.sector_drake_lon[1])}° W): ${latDM(r.borde_lat_norte_drake)}.`
      : 'Sin borde de hielo en el sector del Paso Drake (70° a 50° W).';
    fuente.innerHTML = `<p>Concentración diaria del algoritmo ASI aplicado al radiómetro de microondas AMSR2, ${escapar(datos.fuente)}, ` +
      `grilla de ${pct(datos.resolucion_km)} km. Área: METAREA XV, de ${Math.abs(datos.area[0])}° W a ${Math.abs(datos.area[2])}° W y al norte de ${Math.abs(datos.area[1])}° S. Procesado en MeteoIA: ${escapar(horaChile(datos.generado))} (hora de Chile).</p>` +
      `<p>Clases en décimos según la concentración redondeada al décimo; bajo ${pct(datos.umbral_borde)} % se considera agua libre, umbral usual del borde en microondas pasiva.</p>` +
      '<p>Limitaciones: la microondas pasiva subestima el hielo delgado y nuevo, y pierde exactitud cerca de la costa (en una franja del orden de la resolución del sensor) y con fusión superficial. ' +
      'La fuente advierte que la calibración de AMSR2 no está terminada.</p>' +
      `<p>Cita: ${escapar(datos.cita)}. <a href="${escapar(datos.url_fuente)}" target="_blank" rel="noopener noreferrer">Archivo de origen ↗</a></p>`;
  }

  grupo.on('add', () => { panel.hidden = false; cargar(); });
  grupo.on('remove', () => { panel.hidden = true; map.closePopup(); });
  return grupo;
}
