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
    <details class="mar-crit"><summary>Cómo se genera</summary><div><p>Cada mañana, con la corrida 12Z del WRF, el equipo local entrega a Claude (suscripción) el pronóstico WRF + IA de la bahía, el oleaje WW3 por período y ejemplos de boletines anteriores del especialista para esa bahía, cada uno con lo que entregaban los modelos cuando se escribió. Claude redacta el boletín de las 16:00 imitando la redacción y los ajustes del especialista. A medida que se archivan más boletines, los ejemplos son más parecidos a la situación del día.</p><p>Es una ayuda de redacción: no constituye pronóstico oficial.</p></div></details>`;
  const wrap = document.getElementById('mapWrap');
  wrap.appendChild(card);
  L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
  const sub = card.querySelector('.mar-sub'), tabs = card.querySelector('.bb-tabs'), cuerpo = card.querySelector('.bb-cuerpo');
  let bor = null, ofi = {}, sel = null, cargado = 0;
  card.querySelector('.mar-cerrar').onclick = () => cerrar();
  card.querySelector('.mar-min').onclick = () => card.classList.toggle('mar-minimizada');
  function cerrar() { card.hidden = true; wrap.classList.remove('mar-abierto'); }

  async function cargar() {
    try {
      const [r1, r2] = await Promise.all([fetch('data/borradores.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) }),
        fetch('data/pronosticos.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) }).catch(() => null)]);
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

  function pintar() {
    const pd = bor.pares_disponibles || {};
    sub.innerHTML = `Borrador del ${escH(fecha(bor.fecha_base))}, generado ${escH(hora(bor.generado))} (hora Chile) con el WRF + IA ${escH(bor.wrf_inicializacion || '–')} UTC y el oleaje WW3 ${escH(bor.ww3_corrida || '–')}. `
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
        + `<div class="bb-f"><span class="bb-et of">Boletín oficial</span><p>${op ? escH(`${op.situacion ? op.situacion + ', ' : ''}${op.texto || ''}${op.tmin != null || op.tmax != null ? ` · T ${op.tmin ?? '–'}/${op.tmax ?? '–'} °C` : ''}`) : '<span class="ev-vacio">' + (oDeHoy ? 'sin este período' : 'se publica a las 16:00') + '</span>'}</p></div></div>`;
    };
    cuerpo.innerHTML = (b.nota ? `<p class="bb-nota"><b>Revisar:</b> ${escH(b.nota)}</p>` : '')
      + `<p class="mar-nota">Ejemplos usados: ${(b.entradas && b.entradas.ejemplos || []).length ? b.entradas.ejemplos.map(escH).join(' · ') : 'ninguno de esta bahía (estilo de las otras bahías)'}.</p>`
      + b.periodos.map(per).join('');
    cuerpo.querySelectorAll('.bb-copiar').forEach(x => x.onclick = async () => { try { await navigator.clipboard.writeText(x.dataset.t); x.textContent = 'Copiado'; setTimeout(() => x.textContent = 'Copiar', 1500); } catch (e) { x.textContent = 'No se pudo'; } });
  }

  return {
    abrir() { card.hidden = false; card.classList.remove('mar-minimizada'); wrap.classList.add('mar-abierto'); if (!bor || Date.now() - cargado > 10 * 60e3) cargar(); },
    cerrar,
    get abierto() { return !card.hidden; }
  };
}
