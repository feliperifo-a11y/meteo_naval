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

function crearCasoSAR(L, map, ctx) {
  const { escH, nf } = ctx;
  let medios = SAR_MEDIOS_BASE.map(m => ({ ...m }));
  try { const g = JSON.parse(localStorage.getItem('meteoia_sar_medios') || 'null'); if (Array.isArray(g)) medios = SAR_MEDIOS_BASE.map(m => ({ ...m, ...(g.find(x => x.id === m.id) || {}) })); } catch (e) { /* sin almacenamiento */ }
  const guardarMedios = () => { try { localStorage.setItem('meteoia_sar_medios', JSON.stringify(medios)); } catch (e) { /* sin almacenamiento */ } };
  let marca = null, eligiendo = false, ultimo = null, token = 0;

  const card = document.createElement('section');
  card.className = 'card sar-card'; card.id = 'casoSAR'; card.hidden = true;
  card.innerHTML = `<div class="sar-cab"><h2>Caso SAR · cuadro ambiental</h2><span class="sar-etq">Herramienta de apoyo en validación</span><button type="button" class="sar-cerrar" aria-label="Cerrar caso SAR">✕</button></div>
    <form class="sar-form"><label>Latitud<input name="lat" placeholder="36 30,0 S" autocomplete="off"></label><label>Longitud<input name="lon" placeholder="73 24,0 W" autocomplete="off"></label>
    <label>Hora del incidente<input name="hora" type="datetime-local"></label><button type="submit">Analizar</button><button type="button" class="sar-elegir">Elegir en el mapa</button></form>
    <p class="sar-ayuda">Pulsa «Elegir en el mapa» y luego la posición del caso, o escribe las coordenadas (grados y minutos o decimales; S y W por defecto). El marcador se puede arrastrar.</p>
    <div class="sar-res" aria-live="polite"></div>`;
  document.getElementById('mapWrap').after(card);
  const form = card.querySelector('.sar-form'), res = card.querySelector('.sar-res');
  const aviso = document.createElement('div'); aviso.className = 'sar-aviso-mapa'; aviso.hidden = true; aviso.textContent = 'Pulsa el mapa en la posición del caso (Esc para cancelar)';
  document.getElementById('mapWrap').appendChild(aviso);

  function modoElegir(on) {
    eligiendo = on; aviso.hidden = !on; map.getContainer().style.cursor = on ? 'crosshair' : '';
    if (on) document.getElementById('mapWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function abrir() {
    card.hidden = false;
    if (!form.hora.value) form.hora.value = sarHoraLocal(new Date()).slice(0, 16);
    modoElegir(true);
  }
  function cerrar() { card.hidden = true; modoElegir(false); if (marca) { map.removeLayer(marca); marca = null; } res.innerHTML = ''; ultimo = null; }
  card.querySelector('.sar-cerrar').onclick = cerrar;
  card.querySelector('.sar-elegir').onclick = () => modoElegir(true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && eligiendo) modoElegir(false); });
  map.on('click', e => { if (!eligiendo) return; modoElegir(false); fijar(e.latlng.lat, e.latlng.lng); });
  form.onsubmit = e => {
    e.preventDefault();
    const la = sarLeerCoord(form.lat.value, true), lo = sarLeerCoord(form.lon.value, false);
    if (!isFinite(la) || !isFinite(lo)) { res.innerHTML = '<p class="sar-error">Revisa las coordenadas: no se pudieron interpretar.</p>'; return; }
    fijar(la, lo, true);
  };

  function fijar(lat, lon, centrar) {
    form.lat.value = sarDM(lat, 'N', 'S'); form.lon.value = sarDM(lon, 'E', 'W');
    if (!marca) {
      marca = L.marker([lat, lon], { draggable: true, zIndexOffset: 2000, icon: L.divIcon({ className: 'sar-marca', html: '<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="13" fill="none" stroke="#ff6a00" stroke-width="3"/><path d="M17 2v9M17 23v9M2 17h9M23 17h9" stroke="#ff6a00" stroke-width="3"/><circle cx="17" cy="17" r="3" fill="#ff6a00"/></svg>', iconSize: [34, 34], iconAnchor: [17, 17] }) })
        .bindTooltip('Posición del caso SAR', { direction: 'top', offset: [0, -16] }).addTo(map);
      marca.on('dragend', () => { const p = marca.getLatLng(); fijar(p.lat, p.lng); });
    } else marca.setLatLng([lat, lon]);
    if (centrar) map.setView([lat, lon], Math.max(map.getZoom(), 7));
    analizar(lat, lon);
  }

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

  async function analizar(lat, lon) {
    const yo = ++token;
    res.innerHTML = '<p class="sar-cargando">Consultando condiciones en la posición…</p>';
    const env = entorno(lat, lon);
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
    }
    // 4. Observaciones cercanas
    html += `<div class="sar-blq"><h3>Observaciones cercanas</h3>` +
      (env.estaciones.length ? env.estaciones.map(({ s, mn }) => `<p><b>${escH(ctx.nombreEst(s))}</b> · ${Math.round(mn)} mn<br>${s.vel != null ? nf(s.vel, 0) + ' kt' : '–'} ${s.dirG != null ? sarCompas(s.dirG) : ''}${s.temp != null ? ' · ' + nf(s.temp, 1) + ' °C' : ''} · ${(t => t ? t.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }) + ' h' : '')(ctx.evaluar(s, Date.now()).t)}</p>`).join('') : '<p>Sin estaciones operativas cercanas.</p>') +
      env.boyas.map(({ b, mn }) => `<p><b>Boya ${escH(b.nombre)}</b> · ${Math.round(mn)} mn<br>${b.ultimo.hsig != null ? 'Hs ' + nf(b.ultimo.hsig, 1) + ' m' : ''}${b.ultimo.tp != null ? ' · Tp ' + nf(b.ultimo.tp, 0) + ' s' : ''}${b.ultimo.tw != null ? ' · agua ' + nf(b.ultimo.tw, 1) + ' °C' : ''}</p>`).join('') + '</div>';
    // 5. Avisos
    html += `<div class="sar-blq"><h3>Avisos en la posición</h3>` + (env.avisos.length ? env.avisos.map(({ a, z, e }) =>
      `<p><span class="sar-pill sar-${e.k}">${e.txt}</span> <b>${escH(a.tipo)}</b><br>${escH(z.nombre)}<br><small>${e.ini.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} → ${e.fin.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></p>`).join('')
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

  return { abrir, cerrar };
}
