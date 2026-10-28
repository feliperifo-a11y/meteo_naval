// ============================ Caso SAR (fase 1): cuadro ambiental y ventanas de operación ============================
// Herramienta de apoyo en validación. El coordinador marca la posición del caso y obtiene, para ese punto: posición,
// subárea METAREA, distrito SAR y centros cercanos; condiciones actuales y pronóstico (Open-Meteo: ECMWF IFS 9 km y GFS para
// viento y visibilidad; Météo-France para oleaje, temperatura del agua y corrientes); observaciones cercanas; avisos que
// afectan la posición; horas de luz, y una línea de tiempo de 72 h por tipo de medio con umbrales editables.
const SAR_MEDIOS_BASE = [
  { id: 'menor', nombre: 'Embarcación menor (bote / semirrígido)', viento: 20, ola: 2.0, vis: null },
  { id: 'lancha', nombre: 'Lancha patrullera', viento: 30, ola: 3.0, vis: null },
  { id: 'opv', nombre: 'Patrullero / OPV', viento: 45, ola: 5.0, vis: null },
  { id: 'helo', nombre: 'Helicóptero', viento: 40, ola: null, vis: 1.5 }
];
// Límite superior realista del tiempo de supervivencia en el agua con ropa normal, desde la entrada al agua.
// Valores leídos del gráfico del Manual IAMSAR: vol. III ed. 2022, sección 12 (pág. 12-33), igual a vol. II ed. 2016, fig. N-14 (±1 h).
// El gráfico cubre de 2 a 20 °C. No es un tiempo de búsqueda recomendado (IAMSAR vol. II, 3.8.6).
const SAR_SUPERVIVENCIA = [[2, 7], [4, 8], [6, 10], [8, 12.5], [10, 15], [12, 18.3], [14, 22.2], [16, 27.2], [18, 33.5], [20, 40]];
function sarLimiteSupervivencia(t) {
  if (t == null || !isFinite(t)) return null;
  if (t > 20) return { sobre20: true };
  if (t < 2) return { horas: SAR_SUPERVIVENCIA[0][1], bajo2: true };
  for (let i = 1; i < SAR_SUPERVIVENCIA.length; i++) {
    const [t0, h0] = SAR_SUPERVIVENCIA[i - 1], [t1, h1] = SAR_SUPERVIVENCIA[i];
    if (t <= t1) return { horas: h0 + (h1 - h0) * (t - t0) / (t1 - t0) };
  }
  return { horas: 40 };
}
const SAR_DISTRITOS = [[-26.0556, 'I'], [-34.6833, 'II'], [-40.2417, 'III'], [-48.8167, 'IV'], [-90, 'V']];
function sarMillas(a, b) {
  const r = Math.PI / 180, dla = (b[0] - a[0]) * r, dlo = (b[1] - a[1]) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dlo / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.sqrt(h));
}
function sarRumbo(a, b) {
  const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function sarDM(v, pos, neg) {
  const a = Math.abs(v), g = Math.floor(a), m = (a - g) * 60;
  return `${g}°${m.toFixed(1).replace('.', ',').padStart(4, '0')}′ ${v < 0 ? neg : pos}`;
}
// Admite "-36.5", "36,5 S", "36 30.0 S", "36°30,0'S", "36 30 15 S".
function sarLeerCoord(txt, esLat) {
  if (!txt) return NaN;
  const t = String(txt).trim().toUpperCase().replace(/,/g, '.');
  const neg = /[SWO]$/.test(t) || t.startsWith('-');
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (!nums.length) return NaN;
  let v = nums[0] + (nums[1] || 0) / 60 + (nums[2] || 0) / 3600;
  if (neg) v = -v;
  if (!/[NSEWO]$/.test(t) && !t.startsWith('-') && !t.startsWith('+')) v = esLat ? -Math.abs(v) : -Math.abs(v); // Chile: S y W por defecto
  return (esLat ? Math.abs(v) <= 90 : Math.abs(v) <= 180) ? v : NaN;
}
function sarDentroAnillo(p, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
function sarDentroGeom(lonlat, g) {
  if (!g) return false;
  if (g.type === 'FeatureCollection') return g.features.some(f => sarDentroGeom(lonlat, f.geometry));
  if (g.type === 'Feature') return sarDentroGeom(lonlat, g.geometry);
  if (g.type === 'GeometryCollection') return g.geometries.some(x => sarDentroGeom(lonlat, x));
  const polis = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polis.some(pl => sarDentroAnillo(lonlat, pl[0]) && !pl.slice(1).some(h => sarDentroAnillo(lonlat, h)));
}
// Dentro del polígono o a menos de "mn" millas (franjas costeras angostas, como las de marejadas).
function sarCercaGeom(lat, lon, g, mn) {
  if (sarDentroGeom([lon, lat], g)) return true;
  const dLa = mn / 60, dLo = mn / 60 / Math.cos(lat * Math.PI / 180);
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; if (sarDentroGeom([lon + dLo * Math.sin(a), lat + dLa * Math.cos(a)], g)) return true; }
  return false;
}
function sarHoraLocal(d) { return d.toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).slice(0, 13).replace(' ', 'T') + ':00'; }
function sarFmtHora(iso) { return iso.slice(11, 16); }
function sarFmtDia(iso) { return new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, ''); }
function sarCompas(g) { return g == null ? '–' : ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((g % 360) + 360) % 360 / 22.5) % 16]; }

// Fases de emergencia según la Directiva SAR 2021 (Ord. N° 12600/287, anexo A, sección IV.B).
const SAR_FASES = {
  incertidumbre: { nombre: 'Incertidumbre', sigla: 'INCERFA', color: '#d9a400', def: 'Existen dudas acerca de la seguridad de una aeronave o de un buque y de las personas a bordo.' },
  alerta: { nombre: 'Alerta', sigla: 'ALERFA', color: '#ff7a00', def: 'Se teme por la seguridad de una aeronave o de un buque y de las personas a bordo.' },
  peligro: { nombre: 'Peligro', sigla: 'DETRESFA', color: '#d32f2f', def: 'Existen motivos justificados para creer que un buque u otra nave, incluida una aeronave o una persona, están amenazados por un peligro grave e inminente y necesitan auxilio inmediato.' }
};
const SAR_SIN_FASE = { nombre: 'Sin fase declarada', color: '#6b7a8c', def: 'El coordinador declara la fase en la etapa de acción inicial, según el grado de preocupación.' };
const sarFase = f => SAR_FASES[f] || SAR_SIN_FASE;
function sarIcono(color, n) {
  return L.divIcon({ className: 'sar-marca', iconSize: [34, 34], iconAnchor: [17, 17],
    html: `<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="13" fill="rgba(255,255,255,.35)" stroke="${color}" stroke-width="3"/><path d="M17 1v8M17 25v8M1 17h8M25 17h8" stroke="${color}" stroke-width="3"/><text x="17" y="21.5" text-anchor="middle" font-size="12" font-weight="700" font-family="system-ui,Arial" fill="${color}">${n}</text></svg>` });
}
// Casos guardados en este navegador (los lee también el mapa principal).
const SAR_CLAVE = 'meteoia_casos_sar';
function sarLeerCasos() {
  try {
    let l = JSON.parse(localStorage.getItem(SAR_CLAVE) || 'null');
    if (!Array.isArray(l)) l = [];
    const v = JSON.parse(localStorage.getItem('meteoia_caso_sar') || 'null');   // formato anterior: un solo caso
    if (v && isFinite(v.lat)) {
      const n = Math.max(0, ...l.map(c => c.n || 0)) + 1;
      l.push({ id: 'c' + Date.now().toString(36), nombre: 'Caso ' + n, n, fase: null, ...v });
      localStorage.setItem(SAR_CLAVE, JSON.stringify(l)); localStorage.removeItem('meteoia_caso_sar');
    }
    return l.filter(c => isFinite(c.lat) && isFinite(c.lon));
  } catch (e) { return []; }
}

function crearCasoSAR(L, map, ctx) {
  const { escH, nf } = ctx;
  let medios = SAR_MEDIOS_BASE.map(m => ({ ...m }));
  try { const g = JSON.parse(localStorage.getItem('meteoia_sar_medios') || 'null'); if (Array.isArray(g)) medios = SAR_MEDIOS_BASE.map(m => ({ ...m, ...(g.find(x => x.id === m.id) || {}) })); } catch (e) { /* sin almacenamiento */ }
  const guardarMedios = () => { try { localStorage.setItem('meteoia_sar_medios', JSON.stringify(medios)); } catch (e) { /* sin almacenamiento */ } };
  let casos = sarLeerCasos(), actual = null, borrador = null, marca = null, eligiendo = false, ultimo = null, token = 0, ocultas = null;
  const marcas = new Map(), capaCaso = L.layerGroup();
  const guardar = () => { try { localStorage.setItem(SAR_CLAVE, JSON.stringify(casos)); } catch (e) { /* sin almacenamiento */ } };
  const caso = () => casos.find(c => c.id === actual) || null;
  const siguienteN = () => Math.max(0, ...casos.map(c => c.n || 0)) + 1;

  const card = document.createElement('section');
  card.className = 'card sar-card'; card.id = 'casoSAR'; card.hidden = true;
  card.innerHTML = `<div class="sar-cab"><h2>Caso SAR · cuadro ambiental</h2><span class="sar-etq">Herramienta de apoyo en validación</span><button type="button" class="sar-min" aria-label="Minimizar ficha" title="Minimizar / ampliar">▾</button><button type="button" class="sar-cerrar" aria-label="Cerrar ficha">✕</button></div>
    <div class="sar-casos"><label>Caso<select class="sar-lista" aria-label="Caso seleccionado"></select></label><button type="button" class="sar-nuevo">+ Nuevo caso</button><label class="sar-nombre-l">Nombre<input class="sar-nombre" maxlength="40" autocomplete="off"></label></div>
    <div class="sar-fases" role="group" aria-label="Fase de la emergencia">${Object.entries(SAR_FASES).map(([k, f]) => `<button type="button" data-f="${k}" style="--c:${f.color}" aria-pressed="false">${f.nombre}</button>`).join('')}</div>
    <p class="sar-fase-def"></p>
    <details class="sar-fases-info"><summary>¿Qué significa cada fase?</summary>${Object.values(SAR_FASES).map(f => `<p><b style="color:${f.color}">${f.nombre}</b> (${f.sigla}): ${f.def}</p>`).join('')}<p class="sar-nota">El coordinador de la misión SAR clasifica el suceso y declara la fase en la etapa de acción inicial, según el grado de preocupación por las personas o la nave. Fuente: Directiva SAR 2021, anexo A, sección IV.</p></details>
    <label class="sar-notas-l">Descripción del caso y acciones adoptadas<textarea class="sar-notas" rows="4" maxlength="2000" placeholder="Ej.: embarcación pesquera con 4 tripulantes sin comunicación desde las 06:00; se alertó a la lancha de la capitanía de puerto y se solicitó apoyo aéreo…"></textarea></label><small class="sar-notas-estado" aria-live="polite"></small>
    <form class="sar-form"><label>Latitud<input name="lat" placeholder="36 30,0 S" autocomplete="off"></label><label>Longitud<input name="lon" placeholder="73 24,0 W" autocomplete="off"></label>
    <label>Hora del incidente<input name="hora" type="datetime-local"></label><button type="submit">Analizar</button><button type="button" class="sar-elegir">Elegir en el mapa</button><button type="button" class="sar-borrar">Borrar caso</button></form>
    <p class="sar-ayuda">Pulsa «Elegir en el mapa» y luego la posición, o escribe las coordenadas (grados y minutos o decimales; S y W por defecto). Mientras eliges, las capas del mapa se ocultan y vuelven al marcar el punto. Los casos quedan guardados en este navegador y se ven también en el mapa principal; los marcadores se pueden arrastrar.</p>
    <div class="sar-res" aria-live="polite"></div>`;
  // La ficha va sobre el mapa, como panel lateral (en pantallas angostas, como panel inferior).
  const wrap = document.getElementById('mapWrap');
  wrap.appendChild(card);
  L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
  const grupoMapa = L.layerGroup().addTo(map);
  const form = card.querySelector('.sar-form'), res = card.querySelector('.sar-res'), lista = card.querySelector('.sar-lista'), nombre = card.querySelector('.sar-nombre');
  // Instrucción al elegir: en pantallas táctiles, "Toca" y botón Cancelar (no hay tecla Esc).
  const tactil = matchMedia('(pointer: coarse)').matches;
  const aviso = document.createElement('div'); aviso.className = 'sar-aviso-mapa'; aviso.hidden = true;
  aviso.innerHTML = tactil ? '<span>Toca el mapa en la posición del caso</span><button type="button">Cancelar</button>' : 'Pulsa el mapa en la posición del caso (Esc para cancelar)';
  wrap.appendChild(aviso);
  L.DomEvent.disableClickPropagation(aviso);
  const btnCancelar = aviso.querySelector('button'); if (btnCancelar) btnCancelar.onclick = e => { e.stopPropagation(); modoElegir(false); };
  // Coordenadas que siguen al cursor mientras se elige la posición.
  const cursor = document.createElement('div'); cursor.className = 'sar-cursor'; cursor.hidden = true; wrap.appendChild(cursor);
  map.getContainer().addEventListener('mousemove', e => {
    if (!eligiendo) return;
    const ll = map.mouseEventToLatLng(e), r = wrap.getBoundingClientRect();
    cursor.textContent = `${sarDM(ll.lat, 'N', 'S')} · ${sarDM(ll.lng, 'E', 'W')}`;
    cursor.style.left = (e.clientX - r.left + 16) + 'px'; cursor.style.top = (e.clientY - r.top + 18) + 'px'; cursor.hidden = false;
  });
  map.getContainer().addEventListener('mouseleave', () => { cursor.hidden = true; });
  // Descripción y acciones: se guardan solas mientras se escribe.
  const notas = card.querySelector('.sar-notas'), notasEstado = card.querySelector('.sar-notas-estado');
  let notasTimer = null;
  notas.addEventListener('input', () => {
    const ref = caso() || borrador; if (!ref) return;
    ref.notas = notas.value; notasEstado.textContent = 'Guardando…';
    clearTimeout(notasTimer);
    notasTimer = setTimeout(() => { if (caso()) { guardar(); notasEstado.textContent = 'Guardado en este navegador · ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }); } else notasEstado.textContent = 'Se guardará al marcar la posición del caso.'; }, 600);
  });

  // ---- Lista de casos, nombre y fase
  function pintarCabecera() {
    const c = caso();
    lista.innerHTML = casos.map(x => `<option value="${x.id}">${escH(x.nombre)} · ${sarFase(x.fase).nombre}</option>`).join('') + (borrador ? `<option value="">${escH(borrador.nombre)} (sin posición)</option>` : '');
    lista.value = c ? c.id : ''; lista.disabled = casos.length + (borrador ? 1 : 0) < 2;
    const ref = c || borrador;
    nombre.value = ref ? ref.nombre : '';
    notas.value = ref?.notas || ''; notasEstado.textContent = '';
    const fase = ref?.fase || null;
    card.querySelectorAll('.sar-fases button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === fase)));
    const f = sarFase(fase);
    card.querySelector('.sar-fase-def').innerHTML = `<b style="color:${f.color}">${f.nombre}${f.sigla ? ' (' + f.sigla + ')' : ''}:</b> ${f.def}`;
    card.style.setProperty('--fase', f.color);
  }
  function pintarMarca(c) {
    let m = marcas.get(c.id); const f = sarFase(c.fase);
    if (!m) {
      m = L.marker([c.lat, c.lon], { draggable: true, zIndexOffset: 2000, icon: sarIcono(f.color, c.n) }).addTo(capaCaso);
      m.on('dragend', () => { const p = m.getLatLng(); seleccionar(c.id, false); fijar(p.lat, p.lng, false, true); });
      m.on('click', () => seleccionar(c.id, true));
      marcas.set(c.id, m);
    } else { m.setLatLng([c.lat, c.lon]); m.setIcon(sarIcono(f.color, c.n)); }
    if (!(c.id === actual && !card.hidden)) { m.unbindTooltip(); m.bindTooltip(`${escH(c.nombre)} · ${f.nombre}`, { direction: 'top', offset: [0, -16] }); }
  }
  function seleccionar(id, analizarYa) {
    actual = id; borrador = null; const c = caso(); if (!c) return;
    mostrarFicha();
    form.lat.value = sarDM(c.lat, 'N', 'S'); form.lon.value = sarDM(c.lon, 'E', 'W'); form.hora.value = c.hora || '';
    marca = marcas.get(id); casos.forEach(pintarMarca); pintarCabecera();
    if (analizarYa) analizar(c.lat, c.lon, true);
  }
  lista.onchange = () => { if (lista.value) seleccionar(lista.value, true); };
  nombre.onchange = () => {
    const ref = caso() || borrador; if (!ref) return;
    ref.nombre = nombre.value.trim() || ref.nombre; if (caso()) { guardar(); pintarMarca(ref); if (ultimo) pintar(); } pintarCabecera();
  };
  card.querySelectorAll('.sar-fases button').forEach(b => b.onclick = () => {
    const ref = caso() || borrador; if (!ref) return;
    ref.fase = ref.fase === b.dataset.f ? null : b.dataset.f;
    if (caso()) { guardar(); pintarMarca(ref); if (ultimo) pintar(); }
    pintarCabecera();
  });
  card.querySelector('.sar-nuevo').onclick = nuevoCaso;
  function nuevoCaso() {
    const n = siguienteN();
    actual = null; borrador = { id: 'c' + Date.now().toString(36), n, nombre: 'Caso ' + n, fase: null };
    marca = null; ultimo = null; grupoMapa.clearLayers(); res.innerHTML = '';
    form.lat.value = ''; form.lon.value = ''; form.hora.value = sarHoraLocal(new Date()).slice(0, 16);
    casos.forEach(pintarMarca); mostrarFicha(); pintarCabecera(); modoElegir(true);
  }

  // Al elegir la posición se ocultan las capas superpuestas (avisos, METAREA, campos de color, bahías…) y se restauran al terminar.
  function ocultarCapas(on) {
    const capas = ctx.capas ? ctx.capas() : {};
    if (on && !ocultas) {
      ocultas = Object.keys(capas).filter(k => capas[k]?.lyr && map.hasLayer(capas[k].lyr) && capas[k].lyr !== capaCaso);
      ocultas.forEach(k => capas[k].set(false)); grupoMapa.remove();
    } else if (!on && ocultas) {
      ocultas.forEach(k => capas[k].set(true)); ocultas = null; grupoMapa.addTo(map);
    }
  }
  function modoElegir(on) {
    eligiendo = on; aviso.hidden = !on; map.getContainer().style.cursor = on ? 'crosshair' : ''; if (!on) cursor.hidden = true;
    ocultarCapas(on);
    // Pantallas angostas: mientras se elige, la ficha se pliega para dejar libre el mapa, y vuelve al terminar.
    if (window.innerWidth <= 1050) {
      card.classList.toggle('sar-minimizada', on); card.querySelector('.sar-min').textContent = on ? '▴' : '▾';
      if (on) {
        wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const c = map.getCenter(); if (c.lat > -15 || c.lat < -60 || c.lng < -90 || c.lng > -60) map.fitBounds([[-56, -80], [-18, -68]], { animate: false });
      }
    }
  }
  function abrir() {
    if (actual && caso()) { seleccionar(actual, !ultimo); return; }
    if (casos.length) { seleccionar(casos[casos.length - 1].id, true); return; }
    nuevoCaso();
  }
  function mostrarFicha() {
    card.hidden = false; wrap.classList.add('sar-abierto');
    // Libera espacio en el mapa: el panel de capas se minimiza.
    const lb = document.getElementById('layerBox'); if (lb && !lb.classList.contains('min')) { lb.classList.add('min'); const bt = document.getElementById('lbBtn'); if (bt) bt.textContent = '▴'; }
    card.classList.remove('sar-minimizada'); card.querySelector('.sar-min').textContent = '▾';
    if (!map.hasLayer(capaCaso) && casos.length) { capaCaso.addTo(map); const ch = document.getElementById('chk_caso_sar'); if (ch) ch.checked = true; }
  }
  // Cerrar la ficha no borra los casos: los puntos quedan en el mapa como una capa más.
  function cerrar() { card.hidden = true; wrap.classList.remove('sar-abierto'); modoElegir(false); grupoMapa.clearLayers(); borrador = null; casos.forEach(pintarMarca); }
  const btnBorrar = card.querySelector('.sar-borrar');
  btnBorrar.onclick = () => {
    if (!caso()) { if (borrador) { borrador = null; modoElegir(false); abrir(); } return; }
    if (!btnBorrar.dataset.ok) { btnBorrar.dataset.ok = '1'; btnBorrar.textContent = '¿Borrar? Pulsa de nuevo'; setTimeout(() => { delete btnBorrar.dataset.ok; btnBorrar.textContent = 'Borrar caso'; }, 4000); return; }
    delete btnBorrar.dataset.ok; btnBorrar.textContent = 'Borrar caso';
    const m = marcas.get(actual); if (m) capaCaso.removeLayer(m); marcas.delete(actual);
    casos = casos.filter(c => c.id !== actual); guardar(); actual = null; marca = null; ultimo = null; grupoMapa.clearLayers(); res.innerHTML = '';
    if (casos.length) seleccionar(casos[casos.length - 1].id, true);
    else { form.lat.value = ''; form.lon.value = ''; pintarCabecera(); }
  };
  form.hora.addEventListener('change', () => { const c = caso(); if (c) { c.hora = form.hora.value; guardar(); } else if (borrador) borrador.hora = form.hora.value; if (ultimo) pintar(); });
  card.querySelector('.sar-min').onclick = () => { const m = card.classList.toggle('sar-minimizada'); card.querySelector('.sar-min').textContent = m ? '▴' : '▾'; };
  card.querySelector('.sar-cerrar').onclick = cerrar;
  card.querySelector('.sar-elegir').onclick = () => modoElegir(true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && eligiendo) modoElegir(false); });
  // Se captura el clic antes que cualquier capa (Marejadas UV, WRF, ECMWF, WW3 interceptan los clics del mapa).
  map.getContainer().addEventListener('click', e => {
    if (!eligiendo || e.target.closest('.leaflet-control')) return;
    e.stopPropagation(); e.preventDefault();
    const ll = map.mouseEventToLatLng(e); modoElegir(false); fijar(ll.lat, ll.lng);
  }, true);
  form.onsubmit = e => {
    e.preventDefault();
    const la = sarLeerCoord(form.lat.value, true), lo = sarLeerCoord(form.lon.value, false);
    if (!isFinite(la) || !isFinite(lo)) { res.innerHTML = '<p class="sar-error">Revisa las coordenadas: no se pudieron interpretar.</p>'; return; }
    fijar(la, lo, true);
  };

  // Encuadra el caso y su centro coordinador más cercano, sin que queden bajo la ficha.
  function encuadrar(lat, lon, env) {
    const pts = [[lat, lon]], cen = env.centros[0];
    if (cen && cen.mn < 600) { const c = SAR.features.find(f => f.properties.tipo === 'centro' && f.properties.nombre === cen.nombre).geometry.coordinates; pts.push([c[1], c[0]]); }
    const lateral = window.innerWidth > 1050, ancho = lateral ? card.offsetWidth + 20 : 0, alto = lateral ? 0 : card.offsetHeight + 16;
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.15), { paddingTopLeft: [60, 70], paddingBottomRight: [ancho + 40, alto + 40], maxZoom: 9, animate: false });
    else { map.setView([lat, lon], Math.max(map.getZoom(), 6), { animate: false }); map.panBy([ancho / 2, alto / 2], { animate: false }); }
  }
  // Fija la posición del caso actual (o crea el caso nuevo) y la guarda.
  function fijar(lat, lon, centrar, arrastre) {
    form.lat.value = sarDM(lat, 'N', 'S'); form.lon.value = sarDM(lon, 'E', 'W');
    let c = caso();
    if (!c) {
      c = { ...(borrador || { id: 'c' + Date.now().toString(36), n: siguienteN(), fase: null }), marcado: new Date().toISOString() };
      if (!c.nombre) c.nombre = 'Caso ' + c.n;
      casos.push(c); borrador = null; actual = c.id;
    }
    c.lat = lat; c.lon = lon; c.hora = form.hora.value || c.hora || null; guardar();
    if (!map.hasLayer(capaCaso)) { capaCaso.addTo(map); const ch = document.getElementById('chk_caso_sar'); if (ch) ch.checked = true; }
    pintarMarca(c); marca = marcas.get(c.id); pintarCabecera();
    analizar(lat, lon, !arrastre);
  }
  // Casos guardados: se muestran al cargar la página.
  casos.forEach(pintarMarca);
  if (casos.length) capaCaso.addTo(map);

  async function datosPunto(lat, lon) {
    const q = `latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&forecast_days=4&timezone=America%2FSantiago`;
    const [a, m] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${q}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,precipitation&models=ecmwf_ifs,gfs_global&daily=sunrise,sunset&wind_speed_unit=kn`, { signal: AbortSignal.timeout(20000) }).then(r => r.json()),
      fetch(`https://marine-api.open-meteo.com/v1/marine?${q}&hourly=wave_height,wave_period,wave_direction,wind_wave_height,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature,ocean_current_velocity,ocean_current_direction`, { signal: AbortSignal.timeout(20000) }).then(r => r.json()).catch(() => ({}))
    ]);
    if (!a.hourly) throw Error(a.reason || 'sin pronóstico');
    return { a, m };
  }

  function entorno(lat, lon) {
    const out = {};
    out.subarea = (METAREA.features || []).find(f => sarDentroGeom([lon, lat], f.geometry))?.properties || null;
    const dentroSAR = lat <= -18.35 && lon >= (lat > -30 ? -120 : -131);
    out.distrito = dentroSAR ? SAR_DISTRITOS.find(([l]) => lat >= l)[1] : null;
    out.centros = SAR.features.filter(f => f.properties.tipo === 'centro').map(f => {
      const [clo, cla] = f.geometry.coordinates; return { ...f.properties, mn: sarMillas([lat, lon], [cla, clo]), rv: sarRumbo([cla, clo], [lat, lon]) };
    }).sort((x, y) => x.mn - y.mn).slice(0, 3);
    const ahora = Date.now();
    out.estaciones = ctx.estaciones().filter(s => !s.sinDatos && ctx.evaluar(s, ahora).k === 'ok')
      .map(s => ({ s, mn: sarMillas([lat, lon], [s.lat, s.lon]) })).sort((x, y) => x.mn - y.mn).slice(0, 3);
    out.boyas = ctx.boyas().filter(b => b.ultimo && ctx.evaluarBoya(b, ahora).k === 'ok')
      .map(b => ({ b, mn: sarMillas([lat, lon], [b.lat, b.lon]) })).sort((x, y) => x.mn - y.mn).slice(0, 2);
    out.avisos = [];
    for (const { a } of ctx.avisos()) for (const z of a.zonas || []) {
      const e = ctx.estadoAviso(z, ahora); if (e.k === 'X' || !z.geom) continue;
      if (sarCercaGeom(lat, lon, z.geom, 5)) out.avisos.push({ a, z, e });
    }
    return out;
  }

  async function analizar(lat, lon, enmarcar) {
    const yo = ++token;
    res.innerHTML = '<p class="sar-cargando">Consultando condiciones en la posición…</p>';
    const env = entorno(lat, lon);
    if (enmarcar) encuadrar(lat, lon, env);
    let d = null, err = null;
    try { d = await datosPunto(lat, lon); } catch (e) { err = e; }
    if (yo !== token) return;
    ultimo = { lat, lon, env, d };
    pintar();
    if (err) res.insertAdjacentHTML('afterbegin', '<p class="sar-error">No se pudo obtener el pronóstico en la posición. Se muestran solo los datos de la plataforma.</p>');
  }

  function pintar() {
    if (!ultimo) return;
    const { lat, lon, env, d } = ultimo, h = d?.a.hourly, mh = d?.m?.hourly || {};
    const horaAhora = sarHoraLocal(new Date());
    let i0 = h ? h.time.indexOf(horaAhora) : -1; if (h && i0 < 0) i0 = 0;
    const val = (k, i) => (h && h[k] ? h[k][i] : null), mval = (k, i) => (mh[k] ? mh[k][i] : null);
    dibujarMapa(lat, lon, env, h ? { viento: val('wind_speed_10m_ecmwf_ifs', i0), dir: val('wind_direction_10m_ecmwf_ifs', i0), raf: val('wind_gusts_10m_ecmwf_ifs', i0),
      ola: mval('wave_height', i0), agua: mval('sea_surface_temperature', i0) } : null);
    const incidente = form.hora.value ? new Date(form.hora.value) : null;
    const transcurrido = incidente && !isNaN(incidente) ? (Date.now() - incidente) / 3600e3 : null;
    let html = '<div class="sar-grid">';
    // 1. Posición
    html += `<div class="sar-blq"><h3>Posición</h3><p class="sar-pos">${sarDM(lat, 'N', 'S')} · ${sarDM(lon, 'E', 'W')}</p>
      <p>Subárea METAREA XV: <b>${env.subarea ? escH(env.subarea.id + ' · ' + env.subarea.nombre) : 'fuera de las subáreas'}</b><br>
      Distrito SAR: <b>${env.distrito ? 'Distrito ' + env.distrito : 'fuera del área SAR nacional'}</b></p>
      <p>Centros más cercanos:<br>${env.centros.map(c => `${escH(c.nombre)} · <b>${Math.round(c.mn)} mn</b> (caso al ${sarCompas(c.rv)} del centro)`).join('<br>')}</p>
      ${transcurrido != null ? `<p>Tiempo desde el incidente: <b>${transcurrido < 0 ? 'hora futura' : transcurrido < 48 ? nf(transcurrido, 1) + ' h' : nf(transcurrido / 24, 1) + ' días'}</b></p>` : ''}</div>`;
    // 2. Condiciones ahora
    if (h) {
      const vis = val('visibility_ecmwf_ifs', i0) ?? val('visibility_gfs_global', i0);
      html += `<div class="sar-blq"><h3>Condiciones ahora · ${sarFmtHora(h.time[i0])} h</h3>
        <p>Viento ECMWF: <b>${nf(val('wind_speed_10m_ecmwf_ifs', i0), 0)} kt ${sarCompas(val('wind_direction_10m_ecmwf_ifs', i0))}</b>, ráfagas ${nf(val('wind_gusts_10m_ecmwf_ifs', i0), 0)} kt<br>
        Viento GFS: ${nf(val('wind_speed_10m_gfs_global', i0), 0)} kt ${sarCompas(val('wind_direction_10m_gfs_global', i0))}</p>
        <p>Oleaje: <b>${nf(mval('wave_height', i0), 1)} m</b> del ${sarCompas(mval('wave_direction', i0))}, período ${nf(mval('wave_period', i0), 0)} s<br>
        Mar de fondo: ${nf(mval('swell_wave_height', i0), 1)} m · ${nf(mval('swell_wave_period', i0), 0)} s · ${sarCompas(mval('swell_wave_direction', i0))}</p>
        <p>Temperatura del agua: <b>${nf(mval('sea_surface_temperature', i0), 1)} °C</b><br>
        Visibilidad: <b>${vis == null ? '–' : vis >= 20000 ? 'más de 10 mn' : nf(vis / 1852, 1) + ' mn'}</b>${val('precipitation_ecmwf_ifs', i0) > 0.2 ? ` · precipitación ${nf(val('precipitation_ecmwf_ifs', i0), 1)} mm/h` : ''}<br>
        Corriente superficial: ${mval('ocean_current_velocity', i0) == null ? '–' : nf(mval('ocean_current_velocity', i0) / 1.852, 1) + ' kt hacia el ' + sarCompas(mval('ocean_current_direction', i0))}</p></div>`;
      // 3. Luz
      const dias = d.a.daily || {}, sr = dias.sunrise_ecmwf_ifs || dias.sunrise || [], ss = dias.sunset_ecmwf_ifs || dias.sunset || [];
      const k = (dias.time || []).indexOf(horaAhora.slice(0, 10));
      let luz = '';
      if (k >= 0 && sr[k] && ss[k]) {
        // Todas las horas son de Chile continental: se comparan como texto convertido a una misma referencia.
        const t = x => Date.parse(x.slice(0, 16) + ':00Z'), ahoraT = t(new Date().toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).replace(' ', 'T'));
        const salida = t(sr[k]), puesta = t(ss[k]);
        luz = ahoraT < salida ? `Noche · amanece a las <b>${sarFmtHora(sr[k])}</b>` : ahoraT < puesta ? `Quedan <b>${nf((puesta - ahoraT) / 3600e3, 1)} h</b> de luz · puesta a las <b>${sarFmtHora(ss[k])}</b>`
          : `Noche · amanece a las <b>${sr[k + 1] ? sarFmtHora(sr[k + 1]) : '–'}</b>`;
      }
      html += `<div class="sar-blq"><h3>Luz natural</h3><p>${luz || 'Sin dato'}</p><p class="sar-nota">Hora de Chile continental. Salida y puesta de sol en la posición.</p></div>`;
      html += bloqueSupervivencia(mval('sea_surface_temperature', i0), transcurrido);
    }
    // 4. Observaciones cercanas
    html += `<div class="sar-blq"><h3>Observaciones cercanas</h3>` +
      (env.estaciones.length ? env.estaciones.map(({ s, mn }) => `<p><b>${escH(ctx.nombreEst(s))}</b> · ${Math.round(mn)} mn<br>${s.vel != null ? nf(s.vel, 0) + ' kt' : '–'} ${s.dirG != null ? sarCompas(s.dirG) : ''}${s.temp != null ? ' · ' + nf(s.temp, 1) + ' °C' : ''} · ${(t => t ? t.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false }) + ' h' : '')(ctx.evaluar(s, Date.now()).t)}</p>`).join('') : '<p>Sin estaciones operativas cercanas.</p>') +
      env.boyas.map(({ b, mn }) => `<p><b>Boya ${escH(b.nombre)}</b> · ${Math.round(mn)} mn<br>${b.ultimo.hsig != null ? 'Hs ' + nf(b.ultimo.hsig, 1) + ' m' : ''}${b.ultimo.tp != null ? ' · Tp ' + nf(b.ultimo.tp, 0) + ' s' : ''}${b.ultimo.tw != null ? ' · agua ' + nf(b.ultimo.tw, 1) + ' °C' : ''}</p>`).join('') + '</div>';
    // 5. Avisos
    html += `<div class="sar-blq"><h3>Avisos en la posición</h3>` + (env.avisos.length ? env.avisos.map(({ a, z, e }) =>
      `<p><span class="sar-pill sar-${e.k}">${e.txt}</span> <b>${escH(a.tipo)}</b><br>${escH(z.nombre)}<br><small>${e.ini.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })} → ${e.fin.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</small></p>`).join('')
      : '<p>No hay avisos vigentes ni próximos que cubran la posición (radio de 5 mn).</p>') + '</div>';
    html += '</div>';
    // 6. Ventanas de operación
    if (h) html += ventanas(h, mh, i0, d.a.daily || {});
    html += `<p class="sar-nota">Fuentes: pronóstico puntual Open-Meteo (ECMWF IFS 9 km y NOAA GFS para viento, ráfaga y visibilidad; Météo-France para oleaje, temperatura del agua y corriente), observaciones y avisos de MeteoIA.
      Herramienta de apoyo en validación: no reemplaza los procedimientos SAR, los avisos oficiales ni las herramientas de planificación de búsqueda.</p>`;
    res.innerHTML = html;
    res.querySelectorAll('.sar-umbral').forEach(inp => inp.onchange = () => {
      const m = medios.find(x => x.id === inp.dataset.id), v = parseFloat(String(inp.value).replace(',', '.'));
      m[inp.dataset.k] = isFinite(v) && v > 0 ? v : null; guardarMedios(); pintar();
    });
    const rest = res.querySelector('.sar-restablecer'); if (rest) rest.onclick = () => { medios = SAR_MEDIOS_BASE.map(m => ({ ...m })); guardarMedios(); pintar(); };
  }

  // En el mapa: etiqueta fija con las condiciones del punto, línea al centro coordinador más cercano y estaciones de referencia.
  function dibujarMapa(lat, lon, env, c) {
    grupoMapa.clearLayers();
    if (marca && !card.hidden) {
      marca.unbindTooltip();
      const cs = caso(), f = sarFase(cs?.fase), tit = `<b>${escH(cs ? cs.nombre : 'Caso SAR')}</b> · ${f.nombre}`;
      const txt = c ? `${tit}<br>${nf(c.viento, 0)} kt ${sarCompas(c.dir)} (ráf. ${nf(c.raf, 0)})<br>Ola ${nf(c.ola, 1)} m · agua ${nf(c.agua, 1)} °C` : tit;
      marca.bindTooltip(txt, { permanent: true, direction: 'top', offset: [0, -18], className: 'sar-etiqueta sar-et-' + (cs?.fase || 'nd') }).openTooltip();
    }
    const cen = env.centros[0];
    if (cen) {
      const c0 = SAR.features.find(f => f.properties.tipo === 'centro' && f.properties.nombre === cen.nombre).geometry.coordinates;
      L.polyline([[c0[1], c0[0]], [lat, lon]], { color: '#ff6a00', weight: 2.5, dashArray: '8 6', interactive: false }).addTo(grupoMapa);
      L.circleMarker([c0[1], c0[0]], { radius: 7, color: '#fff', weight: 2, fillColor: '#ff6a00', fillOpacity: 1 })
        .bindTooltip(`${escH(cen.nombre)} · ${Math.round(cen.mn)} mn al caso`, { permanent: true, direction: 'bottom', offset: [0, 10], className: 'sar-etiqueta sar-etiqueta-centro' }).addTo(grupoMapa);
    }
    for (const { s, mn } of env.estaciones) L.polyline([[s.lat, s.lon], [lat, lon]], { color: '#147b88', weight: 1.5, dashArray: '3 5', opacity: .8, interactive: false })
      .bindTooltip(`${escH(ctx.nombreEst(s))} · ${Math.round(mn)} mn`).addTo(grupoMapa);
  }

  // Tiempo de supervivencia de referencia (IAMSAR vol. II, fig. N-14) según la temperatura del agua y el tiempo transcurrido.
  function bloqueSupervivencia(tAgua, transcurrido) {
    const lim = sarLimiteSupervivencia(tAgua);
    const pie = `<details class="sar-sup-info"><summary>Cómo interpretarlo</summary>
      <p>Es el <b>límite superior realista</b> para una persona en el agua con <b>ropa normal</b>, desde que entra al agua. <b>No es un tiempo de búsqueda recomendado</b>: el gráfico es una ayuda, no un instrumento, para la decisión. Con agua fría, muchas personas sobreviven bastante menos que este máximo.</p>
      <p><b>Lo alargan:</b> chaleco salvavidas, salir del agua total o parcialmente, agua tranquila, ropa gruesa, buen estado de salud, comportamiento protector (agruparse, posición fetal). Los trajes de inmersión o de neopreno pueden multiplicarlo de 2 a 10 veces; los trajes de supervivencia SOLAS deben mantener a la persona viva 24 h en aguas muy frías.</p>
      <p><b>Lo acortan:</b> agua agitada, inmersión total, lesiones, nadar, alcohol o medicamentos, niños y personas mayores, ropa ligera, mareo, y el golpe de frío de los primeros minutos. Cerca de la costa, las rompientes y corrientes pueden acortarlo, pero hay que considerar que la persona haya llegado a tierra.</p>
      <p class="sar-nota">Fuente: Manual IAMSAR, ed. 2022, vol. III, sección 12 (gráfico del límite superior realista del tiempo de supervivencia, basado en la opinión de expertos médicos y los últimos datos científicos); misma curva que el vol. II, ed. 2016, figura N-14 y párrafo 3.8.6. Valores leídos del gráfico (±1 h). Solicitar asesoramiento médico experto cuando sea posible.</p></details>`;
    if (!lim) return `<div class="sar-blq"><h3>Supervivencia en el agua (referencia)</h3><p>Sin dato de temperatura del agua en la posición.</p>${pie}</div>`;
    if (lim.sobre20) return `<div class="sar-blq"><h3>Supervivencia en el agua (referencia)</h3><p>Agua a <b>${nf(tAgua, 1)} °C</b>: sobre 20 °C el manual <b>no fija un límite</b>; la supervivencia depende aún más de cada caso. Considerar búsquedas de más de 24 h y, con agua más cálida, de varios días.</p>${pie}</div>`;
    const H = lim.horas, fmtH = x => x < 1 ? Math.round(x * 60) + ' min' : nf(x, x < 10 ? 1 : 0) + ' h';
    let avance = '';
    if (transcurrido != null && transcurrido >= 0) {
      const pct = Math.min(100, transcurrido / H * 100), resta = H - transcurrido;
      const cls = pct < 50 ? 'ok' : pct < 85 ? 'lim' : 'no';
      avance = `<div class="sar-sup-barra" role="img" aria-label="${Math.round(pct)} % del límite de referencia transcurrido"><i class="c-${cls}" style="width:${pct.toFixed(1)}%"></i></div>
        <p>Transcurrido desde el incidente: <b>${fmtH(transcurrido)}</b> · ${resta > 0 ? `quedan <b>${fmtH(resta)}</b> dentro del límite de referencia` : `<b>se superó el límite de referencia</b> para ropa normal: evaluar si la persona pudo tener chaleco, traje de inmersión o salir del agua, y pedir asesoramiento médico`}.</p>`;
    } else avance = '<p class="sar-nota">Indica la hora del incidente para ver el tiempo transcurrido respecto del límite.</p>';
    return `<div class="sar-blq sar-sup"><h3>Supervivencia en el agua (referencia)</h3>
      <p>Agua a <b>${nf(tAgua, 1)} °C</b> → límite superior de referencia: <b>~${fmtH(H)}</b> con ropa normal${lim.bajo2 ? ' (bajo 2 °C, fuera del gráfico: probablemente menos)' : ''}.</p>${avance}${pie}</div>`;
  }

  function ventanas(h, mh, i0, daily) {
    const sr = daily.sunrise_ecmwf_ifs || daily.sunrise || [], ss = daily.sunset_ecmwf_ifs || daily.sunset || [], dias = daily.time || [];
    const deNoche = t => { const k = dias.indexOf(t.slice(0, 10)); return k < 0 ? false : (t < sr[k] || t >= ss[k]); };
    const bloques = [];
    for (let i = i0; i < Math.min(h.time.length, i0 + 72); i += 3) {
      const r = []; for (let k = i; k < Math.min(i + 3, h.time.length); k++) r.push(k);
      const mx = (arr, f = x => x) => { const v = r.map(k => arr?.[k]).filter(x => x != null).map(f); return v.length ? Math.max(...v) : null; };
      const mn = arr => { const v = r.map(k => arr?.[k]).filter(x => x != null); return v.length ? Math.min(...v) : null; };
      bloques.push({ t: h.time[i], noche: deNoche(h.time[i]), viento: mx(h.wind_speed_10m_ecmwf_ifs), rafaga: mx(h.wind_gusts_10m_ecmwf_ifs), ola: mx(mh.wave_height),
        vis: mn(h.visibility_ecmwf_ifs) ?? mn(h.visibility_gfs_global) });
    }
    const nivel = (m, b) => {
      const r = [];
      if (m.viento && b.viento != null) r.push((m.id === 'helo' && b.rafaga != null ? b.rafaga : b.viento) / m.viento);
      if (m.ola && b.ola != null) r.push(b.ola / m.ola);
      if (m.vis && b.vis != null) r.push(m.vis / Math.max(b.vis / 1000, 0.01));
      if (!r.length) return ['sd', 'sin datos'];
      const x = Math.max(...r); return x <= 0.8 ? ['ok', 'dentro de límites'] : x <= 1 ? ['lim', 'cerca del límite'] : ['no', 'sobre el límite'];
    };
    let html = '<div class="sar-ventanas"><h3>Ventanas de operación · próximas 72 h</h3><div class="sar-tabla-scroll"><table class="sar-tabla"><thead><tr><th></th>';
    let diaPrevio = '';
    for (const b of bloques) { const dia = b.t.slice(0, 10); html += `<th class="${b.noche ? 'noche' : ''}${dia !== diaPrevio ? ' nuevo-dia' : ''}" title="${sarFmtDia(b.t)} ${sarFmtHora(b.t)}">${dia !== diaPrevio ? `<span class="dia">${sarFmtDia(b.t)}</span>` : ''}${sarFmtHora(b.t).slice(0, 2)}</th>`; diaPrevio = dia; }
    html += '</tr></thead><tbody>';
    for (const m of medios) {
      html += `<tr><th scope="row">${escH(m.nombre)}</th>`;
      for (const b of bloques) {
        const [k, txt] = nivel(m, b);
        html += `<td class="c-${k}${b.noche ? ' noche' : ''}" title="${escH(m.nombre)} · ${sarFmtDia(b.t)} ${sarFmtHora(b.t)}: ${txt} · viento ${nf(b.viento, 0)} kt, ráfaga ${nf(b.rafaga, 0)} kt, ola ${nf(b.ola, 1)} m, visibilidad ${b.vis == null ? '–' : nf(b.vis / 1852, 1) + ' mn'}"></td>`;
      }
      html += '</tr>';
    }
    html += `</tbody></table></div><div class="sar-ley"><span><i class="c-ok"></i>Dentro de límites (≤ 80 %)</span><span><i class="c-lim"></i>Cerca del límite</span><span><i class="c-no"></i>Sobre el límite</span><span><i class="noche-ej"></i>Noche</span></div>
      <details class="sar-umbrales"><summary>Umbrales por medio (editables)</summary><p class="sar-nota">Valores iniciales de referencia, sin validar: deben ajustarse con los criterios del MRCC y de cada unidad. Se guardan solo en este navegador. Para el helicóptero se usa la ráfaga.</p>
      <table><thead><tr><th>Medio</th><th>Viento máx. (kt)</th><th>Ola máx. (m)</th><th>Visibilidad mín. (km)</th></tr></thead><tbody>` +
      medios.map(m => `<tr><td>${escH(m.nombre)}</td>${['viento', 'ola', 'vis'].map(k => `<td><input class="sar-umbral" data-id="${m.id}" data-k="${k}" value="${m[k] == null ? '' : String(m[k]).replace('.', ',')}" inputmode="decimal" aria-label="${escH(m.nombre)} ${k}"></td>`).join('')}</tr>`).join('') +
      '</tbody></table><button type="button" class="sar-restablecer">Restablecer valores iniciales</button></details></div>';
    return html;
  }

  return { abrir, cerrar, capa: capaCaso, hayCaso: () => casos.length > 0, seleccionar: id => seleccionar(id, true) };
}
