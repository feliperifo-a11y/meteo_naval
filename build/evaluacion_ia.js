// ============================ Evaluación sistemática del WRF + IA (página Desarrollo) ============================
// Lee data/evaluacion/resumen.json (scripts/evaluacion_ia.py): pauta fija aplicada al pronóstico WRF + IA y al pronóstico
// profesional contra las estaciones de capitanía de puerto de Iquique, Valparaíso y Talcahuano, por versión de prompt.
function crearEvaluacionIA(L, map, h) {
  const escH = h.escH;
  const nf = (v, d = 1) => v == null ? '–' : Number(v).toFixed(d).replace('.', ',');
  const sg = v => v == null ? '–' : (v > 0 ? '+' : '') + nf(v);
  const ROSA = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const rosa = d => d == null ? '–' : ROSA[Math.round(d / 22.5) % 16];
  const nivel = p => p == null ? 'ev0' : p > 75 ? 'ev3' : p >= 60 ? 'ev2' : 'ev1';   // O.P.I. N° 1104: 75 % o menos = no conformidad
  const fecha = f => new Date(f + 'T12:00:00Z').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\./g, '');
  const card = document.createElement('section');
  card.className = 'card mar-card ev-card'; card.id = 'evaluacionIA'; card.hidden = true;
  card.innerHTML = `<div class="mar-cab"><h2>Evaluación WRF + IA</h2><span class="mar-etq">Pauta O.P.I. N° 1104 · se actualiza una vez al día</span>
      <button type="button" class="mar-min" aria-label="Minimizar panel" title="Minimizar / ampliar">▾</button><button type="button" class="mar-cerrar" aria-label="Cerrar panel">✕</button></div>
    <p class="mar-sub" aria-live="polite">Cargando…</p><div class="ev-cuerpo"></div>
    <details class="mar-crit"><summary>Pauta (O.P.I. N° 1104) y notas</summary><div></div></details>`;
  const wrap = document.getElementById('mapWrap');
  wrap.appendChild(card);
  L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
  const sub = card.querySelector('.mar-sub'), cuerpo = card.querySelector('.ev-cuerpo'), crit = card.querySelector('.mar-crit div');
  let datos = null, bahia = null, cargado = 0;
  card.querySelector('.mar-cerrar').onclick = () => cerrar();
  card.querySelector('.mar-min').onclick = () => card.classList.toggle('mar-minimizada');
  function cerrar() { card.hidden = true; wrap.classList.remove('mar-abierto'); }

  async function cargar() {
    try {
      const r = await fetch('data/evaluacion/resumen.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      datos = await r.json(); cargado = Date.now();
    } catch (e) { sub.textContent = 'Aún no hay una evaluación publicada; se genera una vez al día con el flujo de actualización.'; cuerpo.innerHTML = ''; return; }
    bahia = bahia || datos.bahias[0].id;
    pintar();
  }
  const chip = (p, n) => `<span class="ev-chip ${nivel(p)}">${p == null ? '–' : nf(p, 0)}</span>${n != null ? `<small class="ev-n">n=${n}</small>` : ''}`;

  function pintar() {
    const d = datos, ap = d.archivo_profesional || {};
    sub.innerHTML = `Período ${escH(d.desde)} a ${escH(d.hasta)} · porcentaje de acierto según la O.P.I. N° 1104, período 08:00–20:00 · estaciones de capitanía de puerto. `
      + `Pronóstico profesional archivado desde ${ap.desde ? escH(ap.desde.slice(0, 10)) : 'hoy'} (${ap.boletines || 0} boletines): la comparación con el pronosticador se completa a medida que se acumulan días.`;
    let t = '<h3 class="ev-h">Resumen por bahía</h3><div class="ev-tw"><table class="ev-tabla"><thead><tr><th>Bahía</th><th>Fuente</th><th title="Porcentaje de acierto medio">Acierto</th><th title="Días con más de 75 % de acierto (sin no conformidad)">Conformes</th><th title="Acierto medio en dirección del viento (tabla N° 3)">Dir.</th><th title="Acierto medio en intensidad (tabla N° 4); entre paréntesis, sesgo observado − pronosticado en kt">Int.</th><th title="Acierto medio en temperatura máxima (tabla N° 6); entre paréntesis, error absoluto medio en °C">T máx.</th></tr></thead><tbody>';
    for (const b of d.bahias) {
      const r = d.resumen[b.id] || {};
      [['wrf', 'WRF + IA'], ['prof', 'Profesional']].forEach(([k, nom], i) => {
        const a = r[k] || { n: 0 };
        t += `<tr class="${i ? '' : 'ev-sep'}">${i ? '' : `<th rowspan="2">${escH(b.nombre)}</th>`}<td>${nom}</td><td>${chip(a.puntaje, a.n)}</td>`
          + (a.n ? `<td>${a.conformes} %</td><td>${a.direccion ?? '–'} %</td><td>${a.intensidad ?? '–'} % <small>(${sg(a.sesgo_int)})</small></td><td>${a.temperatura ?? '–'} % <small>(${nf(a.error_tmax_abs)})</small></td>` : '<td colspan="4" class="ev-vacio">sin días evaluados</td>') + '</tr>';
      });
      const p = r.pares || {};
      if (p.n) t += `<tr><td colspan="7" class="ev-par">Mismos días (${p.n}): WRF + IA ${nf(p.wrf, 0)} · profesional ${nf(p.prof, 0)}</td></tr>`;
    }
    t += '</tbody></table></div>';
    const vs = Object.entries(d.versiones || {});
    t += '<h3 class="ev-h">Por versión de prompt</h3><div class="ev-tw"><table class="ev-tabla"><thead><tr><th>Versión</th><th>Desde</th><th>Puntaje</th>' + d.bahias.map(b => `<th>${escH(b.id)}</th>`).join('') + '<th>Conformes</th></tr></thead><tbody>'
      + vs.map(([k, v]) => `<tr><td><code>${escH(k)}</code></td><td>${escH(v.desde)}</td><td>${chip(v.puntaje, v.n)}</td>${d.bahias.map(b => `<td>${nf(v.bahias && v.bahias[b.id], 0)}</td>`).join('')}<td>${v.conformes ?? '–'} %</td></tr>`).join('')
      + '</tbody></table></div><p class="mar-nota">Una versión nueva aparece cuando cambian las instrucciones del prompt del equipo local. Compara puntajes con al menos 10 a 15 días por versión.</p>';
    t += `<h3 class="ev-h">Detalle diario</h3><div class="ev-tabs" role="tablist">${d.bahias.map(b => `<button type="button" role="tab" data-b="${b.id}" aria-selected="${b.id === bahia}">${escH(b.nombre)}</button>`).join('')}</div><div class="ev-dias"></div>`;
    cuerpo.innerHTML = t;
    cuerpo.querySelectorAll('.ev-tabs button').forEach(x => x.onclick = () => { bahia = x.dataset.b; cuerpo.querySelectorAll('.ev-tabs button').forEach(y => y.setAttribute('aria-selected', y.dataset.b === bahia)); pintarDias(); });
    pintarDias();
    crit.innerHTML = '<p>Coeficientes de la O.P.I.: nubosidad 0,05 · visibilidad 0,10 · dirección del viento 0,30 · intensidad 0,30 · estado del mar 0,20 · temperatura 0,05. Con los datos de la plataforma se evalúan dirección, intensidad y temperatura máxima (0,65 en total, renormalizado).</p>'
      + '<ul><li>Dirección (tabla N° 3): mayor desvío entre cada observación y el sector pronosticado: &lt; 22,5° 100 %, hasta 45° 75 %, hasta 67,5° 50 %, hasta 90° 25 %, más de 90° 0 %.</li><li>Intensidad (tabla N° 4): promedio pronosticado contra promedio observado; con pronóstico de 0–20 kt, diferencia de hasta 4 kt 100 %, 6 kt 75 %, 8 kt 50 %, 10 kt 25 %; con 21–34 kt, 10, 15, 20 y 25 kt.</li><li>Temperatura máxima (tabla N° 6): error de hasta 1 °C 100 %, 2 °C 75 %, 3 °C 50 %, 4 °C 25 %.</li></ul>'
      + `<p><b>Notas:</b></p><ul>${(d.notas || []).map(x => `<li>${escH(x)}</li>`).join('')}</ul><p>Puerto Montt y Punta Arenas quedan fuera hasta contar con una estación costera con datos en la plataforma.</p>`;
  }

  function pintarDias() {
    const el = cuerpo.querySelector('.ev-dias');
    const filas = datos.dias.filter(f => f.bahia === bahia).slice(0, 21);
    el.innerHTML = filas.map(f => {
      const o = f.obs;
      const obs = !o ? 'sin observaciones' : !o.suficiente ? `observaciones sinópticas insuficientes (${o.n_sinopticas})` : `${o.dirs.map((x, i) => `${rosa(x)} ${nf(o.vel[i], 0)}`).join(' · ')} kt · promedio ${nf(o.vprom)} kt · T máx. ${nf(o.tmax)} °C`;
      const fuente = (k, nom) => {
        const x = f[k]; if (!x) return `<div class="ev-f"><b>${nom}</b><span class="ev-vacio">sin pronóstico archivado</span></div>`;
        const p = x.pauta;
        const c = (p && p.componentes) || {};
        const det = p ? `dir. ${c.direccion ?? '–'} %${p.desvio_dir != null ? ` (desvío ${p.desvio_dir}°)` : ''} · int. ${c.intensidad ?? '–'} % (${nf(p.int_pron)} vs ${nf(p.int_obs)} kt) · T máx. ${c.temperatura ?? '–'} % (${sg(p.error_tmax)} °C)` : '';
        return `<div class="ev-f"><b>${nom}</b>${p ? chip(p.puntaje) : ''}<span class="ev-txt">${escH(x.texto || '–')} · T máx. ${x.tmax ?? '–'} °C</span>${det ? `<small>${det}${k === 'wrf' ? ` · prompt <code>${escH(x.prompt)}</code>` : ''}</small>` : ''}</div>`;
      };
      return `<div class="ev-dia"><div class="ev-cab"><b>${escH(fecha(f.fecha))}</b><span>Observado: ${obs}</span></div>${fuente('wrf', 'WRF + IA')}${fuente('prof', 'Profesional')}</div>`;
    }).join('') || '<p class="mar-nota">Sin días evaluados.</p>';
  }

  return {
    abrir() { card.hidden = false; card.classList.remove('mar-minimizada'); wrap.classList.add('mar-abierto'); if (!datos || Date.now() - cargado > 30 * 60e3) cargar(); },
    cerrar,
    get abierto() { return !card.hidden; }
  };
}
