// Capa de temperatura superficial del mar: análisis MUR (GHRSST L4, NASA JPL) a 0,01° (≈ 1 km), servido como
// mosaicos por NASA GIBS. El valor al pulsar el mapa se obtiene del color del píxel, comparado con la paleta oficial
// de GIBS. Se agrega el pronóstico a 3 días de Météo-France (vía Open-Meteo) para el mismo punto.
const SST_GIBS = 'https://gibs.earthdata.nasa.gov';
const SST_MODOS = {
  sst: { capa: 'GHRSST_L4_MUR_Sea_Surface_Temperature', paleta: 'GHRSST_Sea_Surface_Temperature', titulo: 'Temperatura', marcas: [0, 8, 16, 24, 32], unidad: '°C' },
  anom: { capa: 'GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies', paleta: 'GHRSST_Sea_Surface_Temperature_Anomalies', titulo: 'Anomalía', marcas: [-3, -1.5, 0, 1.5, 3], unidad: '°C' }
};
const SST_PALETAS = {};
async function sstPaleta(nombre) {
  if (SST_PALETAS[nombre]) return SST_PALETAS[nombre];
  const t = await (await fetch(`${SST_GIBS}/colormaps/v1.3/${nombre}.xml`, { signal: AbortSignal.timeout(20000) })).text();
  const lista = [];
  for (const m of t.matchAll(/<ColorMapEntry rgb="(\d+),(\d+),(\d+)"[^>]*?value="\[([^,]+),([^)\]]+)[)\]]"/g)) {
    const a = parseFloat(m[4]), b = parseFloat(m[5]);
    lista.push({ rgb: [+m[1], +m[2], +m[3]], lo: isFinite(a) ? a : b - 0.15, hi: isFinite(b) ? b : a + 0.15 });
  }
  return (SST_PALETAS[nombre] = lista);
}
function sstValor(paleta, r, g, b) {
  let mejor = null, d = Infinity;
  for (const e of paleta) { const x = (e.rgb[0] - r) ** 2 + (e.rgb[1] - g) ** 2 + (e.rgb[2] - b) ** 2; if (x < d) { d = x; mejor = e; } }
  return d <= 300 ? mejor : null;
}
function sstGradiente(paleta, min, max) {
  const pasos = 24, col = [];
  for (let k = 0; k <= pasos; k++) {
    const v = min + (max - min) * k / pasos;
    const e = paleta.find(x => v >= x.lo && v < x.hi) || (v < paleta[0].lo ? paleta[0] : paleta[paleta.length - 1]);
    col.push(`rgb(${e.rgb.join(',')}) ${(k / pasos * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg,${col.join(',')})`;
}
function sstFechaISO(d) { return d.toISOString().slice(0, 10); }
function crearCapaSST(L, map, escapar, contenedor) {
  contenedor = contenedor || document.getElementById('mapWrap');
  const grupo = L.layerGroup();
  if (!map.getPane('sstPane')) { const p = map.createPane('sstPane'); p.style.zIndex = 320; p.style.pointerEvents = 'none'; }
  const panel = document.createElement('section'); panel.className = 'uv-panel sst-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Control de temperatura superficial del mar');
  panel.innerHTML = '<div class="uv-cab"><b>Temperatura del mar</b><a href="https://podaac.jpl.nasa.gov/MEaSUREs-MUR" target="_blank" rel="noopener noreferrer">Fuente NASA ↗</a></div>' +
    '<div class="sst-modos" role="group" aria-label="Variable"><button type="button" data-m="sst" aria-pressed="true">Temperatura</button><button type="button" data-m="anom" aria-pressed="false">Anomalía</button></div>' +
    '<p class="uv-estado" role="status">Buscando el último análisis…</p>' +
    '<div class="uv-botones"><button type="button" class="uv-anterior" aria-label="Día anterior">◀</button><input type="date" class="sst-fecha" aria-label="Fecha del análisis"><button type="button" class="uv-siguiente" aria-label="Día siguiente">▶</button></div>' +
    '<div class="uv-escala sst-escala"></div><div class="uv-marcas sst-marcas"></div>' +
    '<p class="uv-ayuda">Pulsa el mar para ver la temperatura del agua en ese punto y su pronóstico a 3 días.</p>' +
    '<details><summary>Actualización y alcance</summary><p>Análisis diario MUR (GHRSST nivel 4) de NASA JPL, resolución 0,01° (≈ 1 km), que combina varios satélites. ' +
    'Se publica con 1 a 2 días de desfase. La anomalía es la diferencia con la climatología de la fecha. El valor del punto se lee del mapa con la paleta oficial (precisión ≈ 0,15 °C). ' +
    'El pronóstico a 3 días es del modelo de Météo-France (≈ 9 km) vía Open-Meteo.</p></details>';
  contenedor.appendChild(panel);
  L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel);
  const estado = panel.querySelector('.uv-estado'), inFecha = panel.querySelector('.sst-fecha');
  let modo = 'sst', fecha = null, ultima = null, mosaico = null, paleta = null;
  const activo = () => map.hasLayer(grupo);
  const url = (m, f) => `${SST_GIBS}/wmts/epsg3857/best/${SST_MODOS[m].capa}/default/${f}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`;
  // Un mosaico frente a Chile central: si trae píxeles con datos, la fecha ya está publicada.
  async function hayDatos(f) {
    try {
      const r = await fetch(url('sst', f).replace('{z}/{y}/{x}', '3/4/2'), { signal: AbortSignal.timeout(15000) });
      if (!r.ok) return false;
      const bmp = await createImageBitmap(await r.blob()), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
      const px = ctx.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 3; i < px.length; i += 400) if (px[i] > 0) n++;
      return n > 20;
    } catch (e) { return false; }
  }
  async function pintar() {
    if (!activo() || !fecha) return;
    if (mosaico) grupo.removeLayer(mosaico);
    mosaico = L.tileLayer(url(modo, fecha), { pane: 'sstPane', maxNativeZoom: 7, maxZoom: 18, opacity: 0.85, crossOrigin: 'anonymous',
      attribution: 'Temperatura del mar: NASA JPL MUR / GIBS' }).addTo(grupo);
    const f = new Date(fecha + 'T12:00:00Z');
    estado.textContent = `${SST_MODOS[modo].titulo} · ${f.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).replace(/\./g, '')}` + (fecha === ultima ? ' (último análisis)' : '');
    inFecha.value = fecha;
    try {
      paleta = await sstPaleta(SST_MODOS[modo].paleta);
      const [a, b] = [SST_MODOS[modo].marcas[0], SST_MODOS[modo].marcas.at(-1)];
      panel.querySelector('.sst-escala').style.background = sstGradiente(paleta, a, b);
      panel.querySelector('.sst-marcas').innerHTML = SST_MODOS[modo].marcas.map((v, k, l) => `<span>${String(v).replace('.', ',')}${k === 0 || k === l.length - 1 ? ' °C' : ''}</span>`).join('');
    } catch (e) { paleta = null; }
  }
  async function iniciar() {
    if (ultima) return pintar();
    const hoy = new Date();
    for (let k = 1; k <= 5; k++) {
      const f = sstFechaISO(new Date(hoy - k * 86400000));
      if (await hayDatos(f)) { ultima = fecha = f; break; }
    }
    if (!fecha) { estado.textContent = 'No se encontró un análisis reciente de temperatura del mar.'; return; }
    inFecha.max = ultima; inFecha.min = '2002-06-01';
    pintar();
  }
  function moverDia(d) {
    if (!fecha) return;
    const n = sstFechaISO(new Date(new Date(fecha + 'T12:00:00Z').getTime() + d * 86400000));
    if (n > ultima) return; fecha = n; pintar();
  }
  async function leerPixel(latlng) {
    const z = 7, p = map.project(latlng, z), tx = Math.floor(p.x / 256), ty = Math.floor(p.y / 256);
    const r = await fetch(url(modo, fecha).replace('{z}', z).replace('{y}', ty).replace('{x}', tx), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob()), c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(Math.floor(p.x - tx * 256), Math.floor(p.y - ty * 256), 1, 1).data;
    return d[3] < 128 ? null : [d[0], d[1], d[2]];
  }
  async function pronostico(lat, lon) {
    try {
      const r = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=sea_surface_temperature&forecast_days=4&timezone=America%2FSantiago`, { signal: AbortSignal.timeout(15000) });
      const j = await r.json(), dias = {};
      (j.hourly?.time || []).forEach((t, k) => { const v = j.hourly.sea_surface_temperature[k]; if (v != null) (dias[t.slice(0, 10)] ||= []).push(v); });
      return Object.entries(dias).slice(1, 4).map(([d, v]) => [d, v.reduce((a, b) => a + b, 0) / v.length]);
    } catch (e) { return []; }
  }
  async function consultar(e) {
    if (!activo() || !fecha) return;
    const { lat, lng } = e.latlng;
    const pop = L.popup({ className: 'uv-popup', maxWidth: 280 }).setLatLng(e.latlng).setContent('<div class="uv-ficha">Consultando temperatura…</div>').openOn(map);
    let rgb = null; try { rgb = await leerPixel(e.latlng); } catch (er) { rgb = null; }
    const ent = rgb && paleta ? sstValor(paleta, ...rgb) : null;
    const pron = modo === 'sst' ? await pronostico(lat, lng) : [];
    const n = v => v.toFixed(1).replace('.', ',');
    const signo = v => (v > 0 ? '+' : '') + n(v);
    let html = `<div class="uv-ficha"><b>${modo === 'sst' ? 'Temperatura del mar' : 'Anomalía de temperatura del mar'}</b> · ${escapar(estado.textContent.split(' · ')[1] || '')}`;
    if (!ent) html += '<p>Sin dato en este punto (tierra, hielo o nubosidad persistente).</p>';
    else {
      const v = (ent.lo + ent.hi) / 2;
      html += `<p><strong>${modo === 'sst' ? n(v) : signo(v)} °C</strong>${modo === 'anom' ? (v > 0 ? ' más cálida que lo normal' : v < 0 ? ' más fría que lo normal' : '') : ''}</p>`;
    }
    if (pron.length) html += '<p>Pronóstico (Météo-France):<br>' + pron.map(([d, v]) => `${new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit' }).replace(/\./g, '')}: <b>${n(v)} °C</b>`).join(' · ') + '</p>';
    html += `<small>${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'} · ${Math.abs(lng).toFixed(2)}° ${lng < 0 ? 'W' : 'E'}</small></div>`;
    if (map.hasLayer(pop)) pop.setContent(html);
  }
  panel.querySelectorAll('.sst-modos button').forEach(b => b.onclick = () => {
    modo = b.dataset.m; panel.querySelectorAll('.sst-modos button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); map.closePopup(); pintar();
  });
  panel.querySelector('.uv-anterior').onclick = () => moverDia(-1);
  panel.querySelector('.uv-siguiente').onclick = () => moverDia(1);
  inFecha.onchange = () => { if (inFecha.value && inFecha.value <= ultima) { fecha = inFecha.value; pintar(); } };
  grupo.on('add', () => { panel.hidden = false; map.on('click', consultar); iniciar(); });
  grupo.on('remove', () => { panel.hidden = true; map.off('click', consultar); map.closePopup(); });
  return grupo;
}
