// ============================ Lugares del Derrotero: buscador en el mapa y abrigos cercanos ============================
// data/derrotero_lugares.json: 1.235 caletas, bahías, puertos, senos, ensenadas, fondeaderos y otros lugares con coordenadas,
// extraídos del Derrotero de la Costa de Chile (Pub. SHOA 3001 a 3006). Se carga al primer uso.
// Campos de cada lugar: [nombre, lat, lon, volumen, cartas, texto, abrigo (1 = caleta o fondeadero descrito como abrigo), solo_menores].
const DERROTERO = { datos: null, carga: null, fuente: '' };
const derroteroNorm = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function derroteroCargar() {
  if (!DERROTERO.carga) DERROTERO.carga = fetch('data/derrotero_lugares.json', { signal: AbortSignal.timeout(30000) }).then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { DERROTERO.fuente = d.fuente; DERROTERO.datos = d.lugares.map(x => ({ n: x[0], la: x[1], lo: x[2], v: x[3], c: x[4], tx: x[5], ab: !!x[6], me: !!x[7], k: derroteroNorm(x[0]) })); return DERROTERO.datos; })
    .catch(() => { DERROTERO.carga = null; return []; });
  return DERROTERO.carga;
}
// Distancia (mn) y rumbo verdadero desde p a q
function derroteroDist(p, q) {
  const c = Math.cos((p[0] + q[0]) / 2 * Math.PI / 180), dy = (q[0] - p[0]) * 60, dx = (q[1] - p[1]) * 60 * c;
  return { mn: Math.hypot(dx, dy), rumbo: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 };
}
// Abrigos (o todos los lugares) a menos de "radio" mn de p, del más cercano al más lejano
function derroteroCerca(p, radio, soloAbrigo = true, n = 8) {
  if (!DERROTERO.datos) return [];
  const g = radio / 60, gl = g / Math.cos(p[0] * Math.PI / 180);
  return DERROTERO.datos.filter(x => (!soloAbrigo || x.ab) && Math.abs(x.la - p[0]) < g && Math.abs(x.lo - p[1]) < gl)
    .map(x => ({ x, ...derroteroDist(p, [x.la, x.lo]) })).filter(o => o.mn <= radio).sort((a, b) => a.mn - b.mn).slice(0, n);
}
// Ficha HTML de un lugar (popup y listas)
function derroteroFicha(x, escH, extra = '') {
  return `<div class="der-ficha"><b>${escH(x.n)}</b>${x.ab ? ' <span class="der-tag">abrigo</span>' : ''}${x.me ? ' <span class="der-tag der-men">solo embarcaciones menores</span>' : ''}
    <div class="der-sub">Derrotero Vol. ${escH(x.v)}${x.c ? ' · carta ' + escH(x.c) : ''} · ${sarDM(x.la, 'N', 'S')} ${sarDM(x.lo, 'E', 'W')}</div>
    <div class="der-tx">${escH(x.tx)}</div>${extra}</div>`;
}

// ---------------- Buscador en el mapa (control de Leaflet)
function crearBuscadorDerrotero(L, map, ctx) {
  const escH = ctx.escH;
  const Ctl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const d = L.DomUtil.create('div', 'der-busca leaflet-bar');
      d.innerHTML = `<input type="search" placeholder="Buscar caleta, bahía, puerto…" aria-label="Buscar lugar del Derrotero" autocomplete="off"><div class="der-res" hidden></div>`;
      L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
      return d;
    }
  });
  const ctl = new Ctl(); ctl.addTo(map);
  const box = ctl.getContainer(), inp = box.querySelector('input'), lista = box.querySelector('.der-res');
  let marca = null, items = [], activo = -1;
  inp.addEventListener('focus', () => derroteroCargar());
  function buscar() {
    const q = derroteroNorm(inp.value);
    if (q.length < 2 || !DERROTERO.datos) { lista.hidden = true; return; }
    const pal = q.split(' ');
    items = DERROTERO.datos.map(x => {
      const w = ' ' + x.k; if (!pal.every(p => w.includes(' ' + p) || x.k.includes(p))) return null;
      const s = x.k === q ? 0 : x.k.startsWith(q) ? 1 : pal.every(p => w.includes(' ' + p)) ? 2 : 3;
      return { x, s };
    }).filter(Boolean).sort((a, b) => a.s - b.s || b.x.ab - a.x.ab || a.x.n.length - b.x.n.length).slice(0, 10).map(o => o.x);
    activo = -1;
    lista.innerHTML = items.length ? items.map((x, i) => `<button type="button" data-i="${i}"><b>${escH(x.n)}</b><small>Vol. ${escH(x.v)} · ${sarDM(x.la, 'N', 'S')}${x.ab ? ' · abrigo' : ''}</small></button>`).join('')
      : '<p>Sin coincidencias en el Derrotero.</p>';
    lista.hidden = false;
    lista.querySelectorAll('button').forEach(b => b.onclick = () => elegir(items[+b.dataset.i]));
  }
  inp.addEventListener('input', () => { if (DERROTERO.datos) buscar(); else derroteroCargar().then(buscar); });
  inp.addEventListener('keydown', e => {
    const bs = lista.querySelectorAll('button');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!bs.length) return; activo = (activo + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length; bs.forEach((b, i) => b.classList.toggle('on', i === activo)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items.length) elegir(items[Math.max(0, activo)]); }
    else if (e.key === 'Escape') { lista.hidden = true; inp.blur(); }
  });
  document.addEventListener('click', e => { if (!box.contains(e.target)) lista.hidden = true; });
  function elegir(x) {
    lista.hidden = true; inp.value = x.n;
    if (marca) map.removeLayer(marca);
    const botones = ctx.usar ? `<div class="der-usar">Usar en la ruta: <button type="button" data-r="zarpe">Zarpe</button><button type="button" data-r="punto">Punto intermedio</button><button type="button" data-r="recalada">Recalada</button></div>` : '';
    marca = L.marker([x.la, x.lo], { icon: L.divIcon({ className: '', html: `<div class="der-pin${x.ab ? ' ab' : ''}">${x.ab ? '⚓' : '•'}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindPopup(derroteroFicha(x, escH, botones), { maxWidth: 340 }).addTo(map);
    marca.on('popupopen', ev => ev.popup.getElement().querySelectorAll('.der-usar button').forEach(b => b.onclick = () => { map.closePopup(); ctx.usar(x, b.dataset.r); }));
    map.flyTo([x.la, x.lo], Math.max(map.getZoom(), 10), { duration: .8 });
    map.once('moveend', () => marca && marca.openPopup());
  }
  return { elegir };
}
