// Capa de oleaje WAVEWATCH III (NOAA GFS-Wave). Datos en data/ww3/: indice.json y un binario por plazo
// (un byte por valor, campos consecutivos). Se carga solo cuando el usuario activa la capa.
const WW3_COLORES = [[0,'#1b2a8f'],[0.5,'#1f5fd1'],[1,'#1e9be0'],[1.5,'#22c3c3'],[2,'#3ccf72'],[2.5,'#9be04a'],
  [3,'#e8e43a'],[4,'#f6a623'],[5,'#ee5a24'],[6,'#d0202f'],[7,'#a3157a'],[8,'#6a1b9a']];
// Tabla de colores cada 0,05 m (0 a 8 m), calculada una vez.
const WW3_TABLA = (() => {
  const c = WW3_COLORES.map(([h, x]) => [h, [1,3,5].map(k => parseInt(x.substr(k, 2), 16))]), t = [];
  for (let n = 0; n <= 160; n++) {
    const h = n / 20; let i = 1; while (i < c.length - 1 && h > c[i][0]) i++;
    const [h0, a] = c[i-1], [h1, b] = c[i], f = Math.min(1, Math.max(0, (h - h0) / (h1 - h0)));
    t.push(a.map((v, k) => Math.round(v * (1-f) + b[k] * f)));
  }
  return t;
})();
function ww3Rgb(h) { return WW3_TABLA[Math.max(0, Math.min(160, Math.round(h * 20)))]; }
function ww3Rumbo(g) { return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((g % 360) + 360) % 360 / 22.5) % 16]; }
function ww3Fecha(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/\./g, '');
}
function crearCapaWW3(L, map, escapar) {
  const grupo = L.layerGroup(), flechas = L.layerGroup();
  if (!map.getPane('ww3Pane')) { map.createPane('ww3Pane').style.zIndex = 405; }
  if (!map.getPane('ww3FlechaPane')) { const p = map.createPane('ww3FlechaPane'); p.style.zIndex = 406; p.style.pointerEvents = 'none'; }
  const panel = document.createElement('section'); panel.className = 'uv-panel ww3-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Control de oleaje WW3');
  panel.innerHTML = '<div class="uv-cab"><b>Oleaje WW3</b><a href="https://polar.ncep.noaa.gov/waves/" target="_blank" rel="noopener noreferrer">Fuente NOAA ↗</a></div>' +
    '<p class="uv-estado" role="status">Cargando corrida…</p><div class="uv-tiempo" hidden><label>Fecha del pronóstico (hora de Chile)' +
    '<select aria-label="Fecha del pronóstico de oleaje WW3"></select></label>' +
    '<div class="uv-botones"><button type="button" class="uv-anterior" aria-label="Fecha anterior">◀</button><button type="button" class="uv-play">Reproducir</button><button type="button" class="uv-siguiente" aria-label="Fecha siguiente">▶</button></div>' +
    '<input class="uv-slider" type="range" min="0" step="1" value="0" aria-label="Avance de la corrida WW3">' +
    '<div class="uv-escala ww3-escala" aria-label="Escala de altura significativa de cero a ocho metros o más"></div>' +
    '<div class="uv-marcas"><span>0 m</span><span>2</span><span>4</span><span>6</span><span>8+ m</span></div>' +
    '<label class="ww3-op"><input type="checkbox" checked> Flechas de dirección del oleaje</label>' +
    '<p class="uv-ayuda">Altura significativa de ola. Pulsa el mar para ver altura, período y dirección, con el mar de viento y el mar de fondo por separado.</p>' +
    '<details><summary>Actualización y alcance</summary><p class="uv-info"></p><p>Modelo global WAVEWATCH III de NOAA (GFS-Wave), resolución 0,25° (≈ 28 km), mostrado en una grilla de 0,5°. ' +
    'Apto para alta mar y áreas costeras; no resuelve el interior de bahías. Las flechas indican hacia dónde avanza el oleaje; la dirección del texto es la de procedencia. ' +
    'MeteoIA revisa cada 20 minutos si hay una corrida nueva (el modelo corre cada 6 horas).</p></details></div>';
  document.getElementById('mapWrap').appendChild(panel);
  L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel);
  const estado = panel.querySelector('.uv-estado'), selector = panel.querySelector('select'), slider = panel.querySelector('.uv-slider'), play = panel.querySelector('.uv-play');
  const chkFlechas = panel.querySelector('.ww3-op input');
  let idx = null, campos = null, indice = 0, timer = null, overlay = null, token = 0;
  const cache = new Map();
  const activo = () => map.hasLayer(grupo);
  const detener = () => { clearInterval(timer); timer = null; play.textContent = 'Reproducir'; play.setAttribute('aria-pressed', 'false'); };
  let posicion = {};
  function valor(nombre, i, j) {
    const [k, esc] = posicion[nombre];
    const b = campos[k * idx.nlat * idx.nlon + i * idx.nlon + j];
    return b === idx.sin_dato ? NaN : b / esc;
  }
  // Interpolación bilineal de la altura; los puntos de tierra no cuentan.
  function hsEn(lat, lon) {
    const fi = (idx.lat0 - lat) / -idx.dlat, fj = (lon - idx.lon0) / idx.dlon;
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    if (i0 < 0 || j0 < 0 || i0 >= idx.nlat - 1 || j0 >= idx.nlon - 1) return NaN;
    const ti = fi - i0, tj = fj - j0;
    let s = 0, w = 0;
    for (const [di, dj, p] of [[0,0,(1-ti)*(1-tj)],[0,1,(1-ti)*tj],[1,0,ti*(1-tj)],[1,1,ti*tj]]) {
      const v = valor('hs', i0 + di, j0 + dj); if (!isNaN(v)) { s += v * p; w += p; }
    }
    return w > 0.25 ? s / w : NaN;
  }
  // Imagen en proyección Mercator: cada fila de píxeles corresponde a su latitud real en el mapa.
  function pintar() {
    const latN = idx.lat0, latS = idx.lat0 + idx.dlat * (idx.nlat - 1), lonW = idx.lon0, lonE = idx.lon0 + idx.dlon * (idx.nlon - 1);
    const merc = la => Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360));
    const W = idx.nlon * 4, H = Math.round(W * (merc(latN) - merc(latS)) / ((lonE - lonW) * Math.PI / 180));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), px = img.data;
    const yN = merc(latN), yS = merc(latS);
    for (let y = 0; y < H; y++) {
      const lat = Math.atan(Math.sinh(yN - (y + 0.5) / H * (yN - yS))) * 180 / Math.PI;
      for (let x = 0; x < W; x++) {
        const h = hsEn(lat, lonW + (x + 0.5) / W * (lonE - lonW)); if (isNaN(h)) continue;
        const [r, g, b] = ww3Rgb(h), o = (y * W + x) * 4;
        px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (overlay) grupo.removeLayer(overlay);
    overlay = L.imageOverlay(cv.toDataURL('image/png'), [[latS, lonW], [latN, lonE]], { pane: 'ww3Pane', opacity: 0.72, interactive: true, bubblingMouseEvents: false,
      attribution: 'Oleaje: NOAA GFS-Wave (WAVEWATCH III)' }).on('click', consultar).addTo(grupo);
    pintarFlechas();
  }
  function pintarFlechas() {
    flechas.clearLayers();
    if (!idx || !campos || !activo() || !chkFlechas.checked) return;
    const b = map.getBounds().pad(0.05), z = map.getZoom();
    const paso = Math.max(1, Math.round(48 / (256 * Math.pow(2, z) * idx.dlon / 360)));
    for (let i = 0; i < idx.nlat; i += paso) {
      const lat = idx.lat0 + idx.dlat * i; if (lat < b.getSouth() || lat > b.getNorth()) continue;
      for (let j = 0; j < idx.nlon; j += paso) {
        const lon = idx.lon0 + idx.dlon * j; if (lon < b.getWest() || lon > b.getEast()) continue;
        const d = valor('dp', i, j), h = valor('hs', i, j); if (isNaN(d) || isNaN(h)) continue;
        const largo = 10 + Math.min(h, 8) * 1.6;
        L.marker([lat, lon], { pane: 'ww3FlechaPane', interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'ww3-flecha', iconSize: [0, 0],
            html: `<svg width="30" height="30" viewBox="-15 -15 30 30" style="transform:rotate(${(d + 180) % 360}deg)"><path d="M0 ${largo/2}V${-largo/2}M-4 ${-largo/2+5}L0 ${-largo/2}L4 ${-largo/2+5}" /></svg>` }) }).addTo(flechas);
      }
    }
  }
  function consultar(e) {
    const { lat, lng } = e.latlng;
    const i = Math.round((idx.lat0 - lat) / -idx.dlat), j = Math.round((lng - idx.lon0) / idx.dlon);
    if (i < 0 || j < 0 || i >= idx.nlat || j >= idx.nlon) return;
    const v = n => valor(n, i, j), m = x => isNaN(x) ? '–' : x.toFixed(1).replace('.', ',') + ' m';
    const s = x => isNaN(x) ? '–' : Math.round(x) + ' s', dir = x => isNaN(x) ? '–' : ww3Rumbo(x) + ' (' + Math.round(x) + '°)';
    if (isNaN(v('hs'))) return;
    const p = idx.plazos[indice];
    L.popup({ className: 'uv-popup', maxWidth: 280 }).setLatLng(e.latlng).setContent(
      `<div class="uv-ficha"><b>Oleaje WW3</b> · ${escapar(ww3Fecha(p.valido))}<p>Altura significativa<br><strong>${m(v('hs'))}</strong></p>` +
      `<p>Período pico: <b>${s(v('tp'))}</b> · Dirección: <b>${dir(v('dp'))}</b></p>` +
      `<p>Mar de viento: <b>${isNaN(v('hw')) ? 'no significativo' : m(v('hw'))}</b><br>Mar de fondo: <b>${isNaN(v('hsw')) ? 'no significativo' : m(v('hsw')) + '</b> · ' + s(v('tsw')) + ' · ' + dir(v('dsw')) + '<b>'}</b></p>` +
      `<small>${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'} · ${Math.abs(lng).toFixed(2)}° W · celda de 0,5°. Dirección de procedencia.</small></div>`).openOn(map);
  }
  async function mostrar(n) {
    if (!idx || !activo()) return;
    const solicitud = ++token; indice = (n + idx.plazos.length) % idx.plazos.length;
    const p = idx.plazos[indice]; selector.value = String(indice); slider.value = String(indice);
    estado.textContent = ww3Fecha(p.valido) + ' · +' + p.fhr + ' h';
    try {
      let b = cache.get(p.archivo);
      if (!b) {
        const r = await fetch('data/ww3/' + p.archivo + '?c=' + idx.clave, { signal: AbortSignal.timeout(45000) });
        if (!r.ok) throw Error('sin plazo');
        b = new Uint8Array(await r.arrayBuffer());
        if (b.length !== idx.nlat * idx.nlon * idx.campos.length) throw Error('tamaño inesperado');
        cache.set(p.archivo, b);
      }
      if (solicitud !== token || !activo()) return;
      campos = b; pintar(); map.closePopup();
    } catch (e) { if (solicitud === token) { detener(); estado.textContent = 'No se pudo mostrar esta fecha del oleaje WW3.'; } }
  }
  async function cargar() {
    try {
      const r = await fetch('data/ww3/indice.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw Error('sin corrida');
      const nuevo = await r.json();
      if (!nuevo.plazos?.length) throw Error('sin plazos');
      if (idx && nuevo.clave === idx.clave) return;
      idx = nuevo; cache.clear();
      posicion = Object.fromEntries(idx.campos.map((c, k) => [c.clave, [k, c.escala]]));
      selector.innerHTML = idx.plazos.map((p, k) => `<option value="${k}">${escapar(ww3Fecha(p.valido))} · +${p.fhr} h</option>`).join('');
      slider.max = String(idx.plazos.length - 1);
      panel.querySelector('.uv-tiempo').hidden = false;
      panel.querySelector('.uv-info').textContent = `Corrida ${ww3Fecha(idx.corrida.replace(/Z$/, ':00Z'))} (hora de Chile), ${idx.plazos.length} fechas cada 6 horas hasta +${idx.plazos.at(-1).fhr} h.`;
      const ahora = Date.now();
      let k = 0; idx.plazos.forEach((p, n) => { if (Math.abs(Date.parse(p.valido) - ahora) < Math.abs(Date.parse(idx.plazos[k].valido) - ahora)) k = n; });
      await mostrar(k);
    } catch (e) { if (!idx) estado.textContent = 'El oleaje WW3 aún no está disponible. Se publica con la próxima corrida del modelo.'; }
  }
  selector.onchange = () => { detener(); mostrar(+selector.value); };
  slider.oninput = () => { detener(); mostrar(+slider.value); };
  panel.querySelector('.uv-anterior').onclick = () => { detener(); mostrar(indice - 1); };
  panel.querySelector('.uv-siguiente').onclick = () => { detener(); mostrar(indice + 1); };
  play.onclick = () => {
    if (timer) return detener();
    play.textContent = 'Pausa'; play.setAttribute('aria-pressed', 'true');
    timer = setInterval(() => mostrar(indice + 1), 1200);
  };
  chkFlechas.onchange = pintarFlechas;
  map.on('moveend zoomend', () => { if (activo()) pintarFlechas(); });
  grupo.on('add', () => { panel.hidden = false; flechas.addTo(map); cargar(); });
  grupo.on('remove', () => { panel.hidden = true; detener(); map.removeLayer(flechas); map.closePopup(); });
  setInterval(() => { if (activo()) cargar(); }, 30 * 60000);
  return grupo;
}
