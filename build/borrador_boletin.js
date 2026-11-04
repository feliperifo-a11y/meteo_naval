// ============================ Borrador de boletín de bahía «estilo especialista» (página Desarrollo) ============================
// Lee data/borradores.json (lo sube el equipo local, mac/borrador_boletin.sh, con la suscripción de Claude) y lo muestra junto al
// boletín oficial publicado (data/pronosticos.json) para cada período, para que el meteorólogo lo corrija y para comparar.
function crearBorradorBoletin(L, map, h) {
  const escH = h.escH;
  const fecha = f => new Date(f + 'T12:00:00Z').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const hora = iso => new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
  const card = document.createElement('section');
  card.className = 'card mar-card ev-card bb-card'; card.id = 'borradorBoletin'; card.hidden = true;
  card.innerHTML = `<div class="mar-cab"><h2>Borrador de boletín</h2><span class="mar-etq">Redactado por IA · requiere revisión del meteorólogo</span>
      <button type="button" class="mar-min" aria-label="Minimizar panel" title="Minimizar / ampliar">▾</button><button type="button" class="mar-cerrar" aria-label="Cerrar panel">✕</button></div>
    <p class="mar-sub" aria-live="polite">Cargando…</p><div class="ev-tabs bb-tabs" role="tablist"></div><div class="bb-cuerpo"></div>
    <details class="mar-crit"><summary>Cómo se genera</summary><div><p>Cada mañana, con la corrida 12Z del WRF, el equipo local entrega a Claude (suscripción) el pronóstico WRF de la bahía, el oleaje WW3 por período y ejemplos de boletines anteriores del especialista para esa bahía, cada uno con lo que entregaban los modelos cuando se escribió. Claude redacta el boletín de las 16:00 imitando la redacción y los ajustes del especialista. A medida que se archivan más boletines, los ejemplos son más parecidos a la situación del día.</p><p>Es una ayuda de redacción: no constituye pronóstico oficial.</p></div></details>`;
  const wrap = document.getElementById('mapWrap');
  wrap.appendChild(card);
  L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
  const sub = card.querySelector('.mar-sub'), tabs = card.querySelector('.bb-tabs'), cuerpo = card.querySelector('.bb-cuerpo');
  let bor = null, ofi = {}, cmp = null, ver = null, sel = null, cargado = 0;
  card.querySelector('.mar-cerrar').onclick = () => cerrar();
  card.querySelector('.mar-min').onclick = () => card.classList.toggle('mar-minimizada');
  function cerrar() { card.hidden = true; wrap.classList.remove('mar-abierto'); }

  async function cargar() {
    try {
      const [r1, r2] = await Promise.all([fetch('data/borradores.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) }),
        fetch('data/pronosticos.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) }).catch(() => null)]);
      try { const r3 = await fetch('data/evaluacion/borradores_comparacion.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) }); cmp = r3.ok ? await r3.json() : null; } catch (e) { cmp = null; }
      try { const r4 = await fetch('data/evaluacion/resumen.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) }); ver = r4.ok ? await r4.json() : null; } catch (e) { ver = null; }
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      bor = await r1.json(); cargado = Date.now();
      ofi = {};
      if (r2 && r2.ok) { const p = await r2.json(); (p.items || []).forEach(x => { ofi[x.codigo] = x; }); }
    } catch (e) {
      sub.textContent = 'Aún no hay borradores. El equipo local los genera una vez al día, entre las 09:00 y las 16:00, cuando llega la corrida 12Z del WRF.';
      tabs.innerHTML = ''; cuerpo.innerHTML = ''; return;
    }
    sel = sel || (bor.bahias[0] || {}).codigo;
    pintar();
  }

  const nf = (v, d = 1) => v == null ? '–' : Number(v).toFixed(d).replace('.', ',');
  const sg = (v, d = 0) => v == null ? '–' : (v > 0 ? '+' : '') + nf(v, d);
  const ok = v => v == null ? '–' : v ? '✓' : '✗';
  // Comparación de un período del borrador con el boletín del especialista (archivo diario)
  function lineaCmp(p) {
    const d = cmp && (cmp.detalle || []).find(x => x.fecha_base === bor.fecha_base && x.bahia === sel && x.fecha === p.fecha && x.tipo === p.tipo);
    if (!d) return '';
    return `<div class="bb-cmp">Comparación con el especialista: <b>similitud ${d.similitud} %</b> · situación ${ok(d.situacion_coincide)} · nubosidad ${ok(d.nubosidad_coincide)} · dirección ${ok(d.direccion_coincide)}`
      + ` · Δ viento ${sg(d.dif_vmax)} kt · Δ mar ${sg(d.dif_hmax, 1)} m · bahía ${ok(d.bahia_coincide)}${d.dif_tmax != null ? ` · Δ Tmax ${sg(d.dif_tmax)} °C` : ''}</div>`;
  }
  // Acierto contra las estaciones (pauta O.P.I. N° 1104): borrador IA, especialista y WRF
  function tablaVer() {
    const IDS = { iquique: 'IQQ', valparaiso: 'VAL', talcahuano: 'TAL' };
    if (!ver || !ver.resumen) return '';
    const nom = (cod, id) => escH((ver.bahias.find(x => x.id === id) || {}).nombre || cod);
    const fcorta = f => { const [a, m, d] = String(f).split('-'); return `${+d}/${+m}`; };
    // Último día evaluado de cada bahía (puntaje diario de cada fuente)
    const diaCelda = p => p ? `<b>${nf(p.puntaje, 0)} %</b><br><small>int ${sg(p.error_int, 1)} kt${p.error_tmax != null ? `<br>Tmax ${sg(p.error_tmax, 1)} °C` : ''}</small>` : '<span class="ev-vacio">–</span>';
    const filasDia = Object.entries(IDS).map(([cod, id]) => {
      const f = (ver.dias || []).find(x => x.bahia === id && ['borr', 'prof', 'wrf'].some(k => x[k] && x[k].pauta));
      if (!f) return `<tr><th>${nom(cod, id)}</th><td colspan="4"><span class="ev-vacio">sin días evaluados aún</span></td></tr>`;
      return `<tr><th>${nom(cod, id)}</th><td>${fcorta(f.fecha)}</td><td>${diaCelda(f.borr && f.borr.pauta)}</td><td>${diaCelda(f.prof && f.prof.pauta)}</td><td>${diaCelda(f.wrf && f.wrf.pauta)}</td></tr>`;
    }).join('');
    // Promedio de todos los días evaluados
    const celda = a => a && a.n ? `<b>${nf(a.puntaje, 0)} %</b> <small>(${a.n} d)</small><br><small>int ${sg(a.sesgo_int, 1)} kt<br>|Tmax| ${nf(a.error_tmax_abs)} °C</small>` : '<span class="ev-vacio">sin días aún</span>';
    const filas = Object.entries(IDS).map(([cod, id]) => { const r = ver.resumen[id] || {}; return `<tr><th>${nom(cod, id)}</th><td>${celda(r.borr)}</td><td>${celda(r.prof)}</td><td>${celda(r.wrf)}</td></tr>`; }).join('');
    return `<h3 class="ev-h">Acierto contra lo observado</h3><p class="mar-nota">Pauta O.P.I. N° 1104 (dirección, intensidad y temperatura máxima, período 08:00–20:00) con las estaciones de capitanía de puerto; el estado del mar no se evalúa por falta de observación. El acierto se calcula día a día. «int» es el error observado − pronosticado: positivo = el pronóstico se quedó corto.</p>`
      + `<h4 class="ev-h">Último día evaluado</h4><div class="ev-tw"><table class="ev-tabla"><thead><tr><th>Bahía</th><th>Día</th><th>Borrador IA</th><th>Especialista</th><th>WRF</th></tr></thead><tbody>${filasDia}</tbody></table></div>`
      + `<h4 class="ev-h">Promedio de referencia${ver.desde ? ` (desde el ${fcorta(ver.desde)})` : ''}</h4><div class="ev-tw"><table class="ev-tabla"><thead><tr><th>Bahía</th><th>Borrador IA</th><th>Especialista</th><th>WRF</th></tr></thead><tbody>${filas}</tbody></table></div>`
      + '<p class="mar-nota">El promedio es la media simple de los porcentajes diarios, no una suma. Más de 75 % es conforme según la pauta.</p>';
  }
  function tablaCmp() {
    if (!cmp || !cmp.periodos_comparados) return '<p class="mar-nota">La comparación con el especialista aparece cuando se archiva el boletín oficial del mismo día (después de las 16:00).</p>';
    const fila = (nom, a) => `<tr><th>${escH(nom)}</th><td>${a.n}</td><td><b>${nf(a.similitud, 0)} %</b></td><td>${a.situacion ?? '–'} %</td><td>${a.nubosidad ?? '–'} %</td><td>${a.direccion ?? '–'} %</td>`
      + `<td>${nf(a.dif_vmax_abs)} <small>(${sg(a.sesgo_vmax, 1)})</small></td><td>${nf(a.dif_hmax_abs)} <small>(${sg(a.sesgo_hmax, 1)})</small></td><td>${a.bahia ?? '–'} %</td><td>${nf(a.dif_tmax_abs)}</td></tr>`;
    const pb = cmp.por_bahia || {};
    return `<h3 class="ev-h">Borrador frente al especialista</h3><p class="mar-nota">${cmp.borradores_archivados} borradores archivados · ${cmp.periodos_comparados} períodos comparados con el boletín emitido el mismo día. Entre paréntesis, el sesgo (borrador − especialista).</p>`
      + '<div class="ev-tw"><table class="ev-tabla"><thead><tr><th>Bahía</th><th title="Períodos comparados">n</th><th title="Similitud del texto completo: cuánto se parece la redacción">Texto</th><th>Situación</th><th title="Primer término de nubosidad">Nubosidad</th><th title="Algún sector del viento a 45° o menos">Dirección</th><th title="Diferencia absoluta media del viento máximo (sin «ocasional»)">|Δ viento| kt</th><th title="Diferencia absoluta media de la altura máxima en área oceánica">|Δ mar| m</th><th title="Estado del mar en bahía (escala de la Armada)">Bahía</th><th>|Δ Tmax| °C</th></tr></thead><tbody>'
      + Object.entries(pb).map(([k, a]) => fila(a.nombre || k, a)).join('') + fila('Total', cmp.total) + '</tbody></table></div>'
      + '<p class="mar-nota">Mientras más alta la similitud y más bajas las diferencias, menos correcciones necesitó el borrador. Se espera que mejore a medida que crece el archivo de ejemplos.</p>';
  }

  function pintar() {
    const pd = bor.pares_disponibles || {};
    sub.innerHTML = `Borrador del ${escH(fecha(bor.fecha_base))}, generado ${escH(hora(bor.generado))} (hora Chile) con el WRF ${escH(bor.wrf_inicializacion || '–')} UTC y el oleaje WW3 ${escH(bor.ww3_corrida || '–')}. `
      + `Ejemplos del especialista archivados: ${Object.entries(pd).map(([k, v]) => `${escH(k)} ${v}`).join(' · ')}.`;
    tabs.innerHTML = bor.bahias.map(b => `<button type="button" role="tab" data-c="${escH(b.codigo)}" aria-selected="${b.codigo === sel}">${escH(b.nombre)}</button>`).join('');
    tabs.querySelectorAll('button').forEach(x => x.onclick = () => { sel = x.dataset.c; pintar(); });
    const b = bor.bahias.find(x => x.codigo === sel); if (!b) { cuerpo.innerHTML = ''; return; }
    const o = ofi[sel], oDeHoy = o && (o.emitido || '').slice(0, 10) === bor.fecha_base;
    const per = (p) => {
      const op = oDeHoy ? (o.periodos || []).find(q => q.fecha === p.fecha && ((q.horario || '').startsWith('20:00') ? 'noche' : (q.horario ? 'dia' : q.tipo)) === p.tipo) : null;
      const t = `${p.situacion ? p.situacion + ', ' : ''}${p.texto}${p.tmin != null || p.tmax != null ? ` · T ${p.tmin ?? '–'}/${p.tmax ?? '–'} °C` : ''}`;
      return `<div class="bb-per"><div class="bb-cab"><b>${escH(fecha(p.fecha))} · ${p.tipo === 'noche' ? 'noche 20:00–08:00' : 'día 08:00–20:00'}</b><button type="button" class="bb-copiar" data-t="${escH(t)}" title="Copiar el texto del borrador">Copiar</button></div>`
        + `<div class="bb-f"><span class="bb-et ia">Borrador IA</span><p>${escH(t)}</p></div>`
        + lineaCmp(p) + `<div class="bb-f"><span class="bb-et of">Boletín oficial</span><p>${op ? escH(`${op.situacion ? op.situacion + ', ' : ''}${op.texto || ''}${op.tmin != null || op.tmax != null ? ` · T ${op.tmin ?? '–'}/${op.tmax ?? '–'} °C` : ''}`) : '<span class="ev-vacio">' + (oDeHoy ? 'sin este período' : 'se publica a las 16:00') + '</span>'}</p></div></div>`;
    };
    cuerpo.innerHTML = (b.nota ? `<p class="bb-nota"><b>Revisar:</b> ${escH(b.nota)}</p>` : '')
      + `<p class="mar-nota">Ejemplos usados: ${(b.entradas && b.entradas.ejemplos || []).length ? b.entradas.ejemplos.map(escH).join(' · ') : 'ninguno de esta bahía (estilo de las otras bahías)'}.</p>`
      + b.periodos.map(per).join('') + tablaCmp() + tablaVer();
    cuerpo.querySelectorAll('.bb-copiar').forEach(x => x.onclick = async () => { try { await navigator.clipboard.writeText(x.dataset.t); x.textContent = 'Copiado'; setTimeout(() => x.textContent = 'Copiar', 1500); } catch (e) { x.textContent = 'No se pudo'; } });
  }

  return {
    abrir() { card.hidden = false; card.classList.remove('mar-minimizada'); wrap.classList.add('mar-abierto'); if (!bor || Date.now() - cargado > 10 * 60e3) cargar(); },
    cerrar,
    get abierto() { return !card.hidden; }
  };
}
