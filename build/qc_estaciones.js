// ============================ Control de calidad de estaciones con Isolation Forest (página Desarrollo) ============================
// Lee data/estaciones_qc.json (scripts/qc_estaciones.py): estado de cada estación en las últimas 72 h y lecturas sospechosas.
function crearQCEstaciones(L, map, h) {
  const escH = h.escH;
  const nf = (v, d = 1) => v == null ? '–' : Number(v).toFixed(d).replace('.', ',');
  const hora = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + ' ' + s.slice(11, 16) : '–';
  const COL = { revisar: '#d32f2f', 'atención': '#e08a00', ok: '#1f9d55', 'sin datos': '#6b7a8c' };
  const card = document.createElement('section');
  card.className = 'card mar-card ev-card'; card.id = 'qcEstaciones'; card.hidden = true;
  card.innerHTML = `<div class="mar-cab"><h2>Control de calidad de estaciones</h2><span class="mar-etq">Aprendizaje automático · Isolation Forest · últimas 72 h</span>
      <button type="button" class="mar-min" aria-label="Minimizar panel" title="Minimizar / ampliar">▾</button><button type="button" class="mar-cerrar" aria-label="Cerrar panel">✕</button></div>
    <p class="mar-sub" aria-live="polite">Cargando…</p><div class="qc-cuerpo"></div>
    <details class="mar-crit"><summary>Cómo funciona</summary><div><p>Con los últimos 30 días de cada estación, el modelo aprende qué es normal: el valor habitual a cada hora, los cambios entre lecturas, la diferencia con las estaciones vecinas (≤ 150 km) y si un valor se repite por horas. Un Isolation Forest detecta las combinaciones raras; se marca una lectura como sospechosa solo si además algún rasgo se aparta claramente (|z| ≥ 3) o si viola un límite físico.</p>
    <p>Estados: <b style="color:${COL.revisar}">revisar</b> = 5 % o más de lecturas sospechosas (o 6 o más), <b style="color:${COL['atención']}">atención</b> = alguna lectura sospechosa, <b style="color:${COL.ok}">ok</b> = sin lecturas sospechosas.</p>
    <p>Es una ayuda: una lectura rara puede ser un fenómeno real (paso frontal, rachas). La decisión sobre el dato es del meteorólogo.</p></div></details>`;
  const wrap = document.getElementById('mapWrap');
  wrap.appendChild(card);
  L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
  const sub = card.querySelector('.mar-sub'), cuerpo = card.querySelector('.qc-cuerpo');
  const capa = L.layerGroup();
  let datos = null, cargado = 0, sel = null;
  card.querySelector('.mar-cerrar').onclick = () => cerrar();
  card.querySelector('.mar-min').onclick = () => card.classList.toggle('mar-minimizada');
  function cerrar() { card.hidden = true; wrap.classList.remove('mar-abierto'); map.removeLayer(capa); }

  async function cargar() {
    try {
      const r = await fetch('data/estaciones_qc.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      datos = await r.json(); cargado = Date.now();
    } catch (e) { sub.textContent = 'Aún no hay un control de calidad publicado; se calcula una vez por hora.'; cuerpo.innerHTML = ''; return; }
    pintar();
  }
  function pintar() {
    const d = datos, cuenta = {};
    d.estaciones.forEach(e => { cuenta[e.estado] = (cuenta[e.estado] || 0) + 1; });
    const gen = new Date(d.generado).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
    sub.innerHTML = `Actualizado ${escH(gen)} (hora Chile) · ${d.observaciones.toLocaleString('es-CL')} lecturas de ${d.estaciones_n} estaciones en ${d.ventana_dias} días. `
      + ['revisar', 'atención', 'ok', 'sin datos'].map(k => `<b style="color:${COL[k]}">${cuenta[k] || 0} ${k}</b>`).join(' · ');
    const filas = d.estaciones.map(e => `<tr data-c="${escH(e.codigo)}" class="qc-fila${e.codigo === sel ? ' qc-sel' : ''}"><td><span class="qc-punto" style="background:${COL[e.estado]}"></span>${escH(e.estado)}</td>`
      + `<th>${escH(e.nombre)}</th><td>${e.lecturas_72h}</td><td>${e.sospechosas_72h}</td><td>${escH(e.motivo_principal || '–')}</td><td>${hora(e.ultima)}</td></tr>`).join('');
    const lista = d.sospechosas.filter(s => !sel || s.codigo === sel).slice(0, 40).map(s => `<tr><td>${hora(s.fecha)}</td><th>${escH(s.nombre)}</th>`
      + `<td>${nf(s.temp)} °C · ${nf(s.pres)} hPa · ${nf(s.hum, 0)} % · ${nf(s.vel)} kt${s.dir != null ? ' ' + nf(s.dir, 0) + '°' : ''}</td><td>${s.motivos.map(escH).join('; ')}</td></tr>`).join('');
    cuerpo.innerHTML = `<h3 class="ev-h">Estado por estación</h3><div class="ev-tw"><table class="ev-tabla qc-tabla"><thead><tr><th>Estado</th><th>Estación</th><th title="Lecturas en 72 h">Lecturas</th><th>Sospechosas</th><th>Motivo principal</th><th>Última lectura</th></tr></thead><tbody>${filas}</tbody></table></div>`
      + `<h3 class="ev-h">Lecturas sospechosas${sel ? ' · ' + escH((d.estaciones.find(e => e.codigo === sel) || {}).nombre || '') + ' <button type="button" class="lnkBtn qc-todas">ver todas</button>' : ''}</h3>`
      + (lista ? `<div class="ev-tw"><table class="ev-tabla"><thead><tr><th>Hora</th><th>Estación</th><th>Valores</th><th>Motivos</th></tr></thead><tbody>${lista}</tbody></table></div>` : '<p class="mar-nota">Sin lecturas sospechosas.</p>');
    cuerpo.querySelectorAll('.qc-fila').forEach(tr => tr.onclick = () => { sel = sel === tr.dataset.c ? null : tr.dataset.c; pintar(); const e = d.estaciones.find(x => x.codigo === sel); if (e && e.lat != null) map.flyTo([e.lat, e.lon], Math.max(map.getZoom(), 7), { duration: .6 }); });
    const t = cuerpo.querySelector('.qc-todas'); if (t) t.onclick = () => { sel = null; pintar(); };
    capa.clearLayers();
    d.estaciones.filter(e => e.lat != null).forEach(e => L.circleMarker([e.lat, e.lon], { radius: e.estado === 'ok' ? 5 : 9, color: '#fff', weight: 2, fillColor: COL[e.estado], fillOpacity: .95 })
      .bindTooltip(`${escH(e.nombre)} · ${escH(e.estado)}${e.sospechosas_72h ? ` · ${e.sospechosas_72h} sospechosas` : ''}`).on('click', () => { sel = e.codigo; pintar(); }).addTo(capa));
    capa.addTo(map);
  }
  return {
    abrir() { card.hidden = false; card.classList.remove('mar-minimizada'); wrap.classList.add('mar-abierto'); if (datos) capa.addTo(map); if (!datos || Date.now() - cargado > 20 * 60e3) cargar(); },
    cerrar,
    get abierto() { return !card.hidden; }
  };
}
