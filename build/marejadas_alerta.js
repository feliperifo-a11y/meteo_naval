// ============================ Alerta preventiva de marejadas a 10 días (página Desarrollo) ============================
// Lee data/marejadas_alerta.json (scripts/marejadas_alerta.py): criterios de la O.P.I. N° 1107 aplicados al pronóstico
// GFS-Wave (WAVEWATCH III) de 0 a 240 h, por zona costera del Cuadro "F" (zona contigua) y en Juan Fernández y Rapa Nui.
// Estimación automática: no constituye aviso.
function crearAlertaMarejadas(L, map, h) {
  const escH = h.escH;
  const CAT = [
    { txt: 'Sin marejadas', corto: '', cls: 'm0' },
    { txt: 'Marejadas', corto: 'M', cls: 'm1', color: '#f2a900' },
    { txt: 'Marejadas anormales', corto: 'MA', cls: 'm2', color: '#c62828' }
  ];
  const ROSA = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const rosa = d => d == null ? '–' : ROSA[Math.round(d / 22.5) % 16];
  // Escala Armada de oleaje
  const escala = hs => hs == null ? '' : hs < 0.5 ? 'rizada' : hs < 1.25 ? 'marejadilla' : hs < 2.5 ? 'marejada' : hs < 4 ? 'gruesa' : hs <= 6 ? 'muy gruesa' : 'sobre 6 m';
  const num = (v, d = 1) => v == null ? '–' : Number(v).toFixed(d).replace('.', ',');
  const dm = (v, pos, neg) => {
    const t = Math.round(Math.abs(v) * 60), g = Math.floor(t / 60), mi = t - g * 60;
    return `${g}°${String(mi).padStart(2, '0')}′ ${v < 0 ? neg : pos}`;
  };
  const fechaCorta = f => { const d = new Date(f + 'T12:00:00Z'); return `${d.toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'UTC' }).replace('.', '').slice(0, 2)}<br>${d.getUTCDate()}`; };
  const fechaLarga = f => new Date(f + 'T12:00:00Z').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const horaChile = iso => new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
  const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

  const card = document.createElement('section');
  card.className = 'card mar-card'; card.id = 'alertaMar'; card.hidden = true;
  card.innerHTML = `<div class="mar-cab"><h2>Marejadas · perspectiva a 10 días</h2><span class="mar-etq">Estimación automática · no constituye aviso</span>
      <button type="button" class="mar-min" aria-label="Minimizar panel" title="Minimizar / ampliar">▾</button><button type="button" class="mar-cerrar" aria-label="Cerrar panel">✕</button></div>
    <p class="mar-sub" aria-live="polite">Cargando…</p>
    <div class="mar-tabla-wrap"></div>
    <div class="mar-ley"><span><i class="m1"></i>Marejadas</span><span><i class="m2"></i>Marejadas anormales</span><span><i class="mav"></i>Aviso oficial vigente</span><span><b>☾</b> Sicigias (±1 día)</span><span><b>3/4</b> corridas que lo muestran</span></div>
    <div class="mar-det" aria-live="polite"><p class="mar-ayuda">Selecciona un día para ver el oleaje que lo determina y los puntos evaluados en el mapa.</p></div>
    <details class="mar-crit"><summary>Criterios y fuentes</summary><div></div></details>`;
  const wrap = document.getElementById('mapWrap');
  wrap.appendChild(card);
  L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
  const sub = card.querySelector('.mar-sub'), tablaWrap = card.querySelector('.mar-tabla-wrap'), det = card.querySelector('.mar-det'), crit = card.querySelector('.mar-crit div');
  const grupo = L.layerGroup();
  let datos = null, sel = null, cargado = 0;

  card.querySelector('.mar-cerrar').onclick = () => cerrar();
  card.querySelector('.mar-min').onclick = () => card.classList.toggle('mar-minimizada');

  function cerrar() { card.hidden = true; wrap.classList.remove('mar-abierto'); map.removeLayer(grupo); }

  async function cargar() {
    try {
      const r = await fetch('data/marejadas_alerta.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      datos = await r.json(); cargado = Date.now();
    } catch (e) {
      datos = null;
      sub.textContent = 'Aún no hay una corrida procesada o no se pudo leer el archivo. Se genera con cada corrida nueva de GFS-Wave (cuatro al día).';
      tablaWrap.innerHTML = ''; return;
    }
    pintar();
  }

  function pintar() {
    const d = datos, h0 = hoy();
    const idxs = d.fechas.map((f, i) => [f, i]).filter(([f]) => f >= h0);
    const gen = new Date(d.generado), viejo = Date.now() - gen > 18 * 3600e3;
    sub.innerHTML = `Corrida ${escH(d.corrida.replace('T', ' ').replace('Z', ' UTC'))} · ${escH(d.fuente)} · procesada ${escH(horaChile(d.generado))} (hora Chile).`
      + ` Costa continental hasta ${d.zona_contigua_mn} mn (zona contigua) y alrededor de cada isla.`
      + (viejo ? ' <b class="mar-viejo">Datos con más de 18 h: la corrida no se ha actualizado.</b>' : '');
    const sic = new Set(d.dias_sicigia || []);
    // Encabezado de plazos: ≤ 48 h, alerta preventiva (2 a 4 días) y perspectiva (5 a 9 días)
    const grupoDe = i => i < 2 ? 0 : i < 5 ? 1 : 2;
    const tramos = [];
    idxs.forEach(([, i]) => { const g = grupoDe(i); if (!tramos.length || tramos[tramos.length - 1].g !== g) tramos.push({ g, n: 1 }); else tramos[tramos.length - 1].n++; });
    const nombresG = ['≤ 48 h', 'Alerta preventiva', 'Perspectiva'];
    let html = `<table class="mar-tabla"><thead><tr><th></th>${tramos.map(t => `<th colspan="${t.n}" class="mar-g${t.g}">${nombresG[t.g]}</th>`).join('')}</tr>`
      + `<tr><th class="mar-z">Zona</th>${idxs.map(([f]) => `<th title="${escH(fechaLarga(f))}${sic.has(f) ? ' · sicigias' : ''}">${fechaCorta(f)}${sic.has(f) ? '<b class="mar-sic">☾</b>' : ''}</th>`).join('')}</tr></thead><tbody>`;
    d.zonas.forEach((z, zi) => {
      html += `<tr><th class="mar-z" title="${escH(z.nombre)}">${escH(z.id)}</th>`;
      idxs.forEach(([f, i]) => {
        const c = z.celdas[i], k = CAT[c.cat] || CAT[0], p = c.persistencia || [0, 0];
        const esSel = sel && sel[0] === zi && sel[1] === i;
        const tit = `${z.nombre} · ${fechaLarga(f)}: ${k.txt}${c.cat ? ` (${num(c.hs)} m, ${c.origen})` : ''}${c.aviso ? ' · aviso oficial vigente' : ''}`;
        html += `<td><button type="button" class="mar-c ${k.cls}${c.aviso ? ' mav' : ''}${esSel ? ' sel' : ''}" data-z="${zi}" data-i="${i}" title="${escH(tit)}" aria-label="${escH(tit)}">`
          + `${k.corto}${c.cat && p[1] > 1 ? `<small>${p[0]}/${p[1]}</small>` : ''}</button></td>`;
      });
      html += '</tr>';
    });
    tablaWrap.innerHTML = html + '</tbody></table><p class="mar-zonas">' + d.zonas.map(z => `<b>${escH(z.id)}</b> ${escH(z.nombre)}`).join(' · ') + '</p>';
    tablaWrap.querySelectorAll('.mar-c').forEach(b => b.onclick = () => elegir(+b.dataset.z, +b.dataset.i));
    const cr = d.criterios || {};
    crit.innerHTML = `<p><b>Marejadas:</b></p><ul>${(cr.marejadas || []).map(x => `<li>${escH(x)}</li>`).join('')}</ul>`
      + `<p><b>Marejadas anormales:</b></p><ul>${(cr.anormales || []).map(x => `<li>${escH(x)}</li>`).join('')}</ul>`
      + `<p><b>Notas:</b></p><ul>${(cr.notas || []).map(x => `<li>${escH(x)}</li>`).join('')}</ul>`
      + `<p>La confianza se indica como el número de corridas recientes (hasta 4) que muestran marejadas ese día. Fuente de los criterios: ${escH(cr.fuente || '')}. Modelo: ${escH(d.fuente)}. Fases lunares calculadas con las fórmulas de Meeus (precisión de minutos).</p>`;
    if (sel) elegir(sel[0], sel[1], true);
  }

  function elegir(zi, i, sinZoom) {
    sel = [zi, i];
    tablaWrap.querySelectorAll('.mar-c.sel').forEach(b => b.classList.remove('sel'));
    const btn = tablaWrap.querySelector(`.mar-c[data-z="${zi}"][data-i="${i}"]`); if (btn) btn.classList.add('sel');
    const z = datos.zonas[zi], c = z.celdas[i], k = CAT[c.cat] || CAT[0], p = c.persistencia || [0, 0];
    const sic = (datos.dias_sicigia || []).includes(c.fecha);
    let t = `<h3>${escH(z.nombre)} · ${escH(fechaLarga(c.fecha))}</h3><p class="mar-cat ${k.cls}">${escH(k.txt)}</p>`;
    if (c.cat) {
      t += `<dl><dt>Origen</dt><dd>${escH(c.origen)}</dd>`
        + `<dt>Altura significativa</dt><dd>${num(c.hs)} m (${escH(escala(c.hs))})</dd>`
        + `<dt>Período medio</dt><dd>${c.tp == null ? '–' : num(c.tp) + ' s'}</dd>`
        + `<dt>Procedencia</dt><dd>${c.dir == null ? '–' : c.dir + '° (' + rosa(c.dir) + ')'}</dd>`
        + `<dt>Punto del máximo</dt><dd>${dm(c.lat, 'N', 'S')} · ${dm(c.lon, 'E', 'W')}</dd>`
        + `<dt>Hora del máximo</dt><dd>${escH(horaChile(c.valido))} (hora Chile, plazo ${c.fhr} h)</dd>`
        + `<dt>Persistencia</dt><dd>${p[1] ? `${p[0]} de ${p[1]} corridas recientes` : 'primera corrida'}</dd></dl>`;
    } else if (c.hs != null) {
      t += `<p>Mayor altura de mar de fondo o de viento en la zona ese día: ${num(c.hs)} m (${escH(escala(c.hs))}), bajo los criterios de emisión.</p>`;
    }
    if (sic) t += '<p class="mar-nota">Día a ±1 día de sicigias (luna nueva o llena): la O.P.I. pide considerarlo al evaluar marejadas anormales.</p>';
    if (c.aviso) t += `<p class="mar-nota mar-nota-av">Aviso oficial de marejadas vigente: ${escH(c.aviso)}.</p>`;
    const plazo = i < 2 ? 'Plazo menor que las 48 h de antelación que exige la O.P.I. para emitir el aviso.' : i < 5 ? 'Alerta preventiva: plazo de 2 a 4 días.' : 'Perspectiva: plazo de 5 a 9 días; la confianza disminuye con el plazo.';
    t += `<p class="mar-nota">${plazo}</p>`;
    det.innerHTML = t;
    // Mapa: puntos evaluados de la zona y el punto del máximo
    grupo.clearLayers();
    z.puntos.forEach(pt => L.circleMarker(pt, { radius: 3, weight: 1, color: '#1f6fb2', fillColor: '#5fb0ff', fillOpacity: .7, interactive: false }).addTo(grupo));
    if (c.cat && c.lat != null) {
      L.circleMarker([c.lat, c.lon], { radius: 9, weight: 3, color: '#fff', fillColor: k.color, fillOpacity: 1 })
        .bindTooltip(`${k.txt}: ${num(c.hs)} m · ${c.origen}`, { direction: 'top' }).addTo(grupo);
    }
    if (!map.hasLayer(grupo)) grupo.addTo(map);
    if (!sinZoom && z.puntos.length) map.fitBounds(L.latLngBounds(z.puntos).pad(0.25), { maxZoom: 8, paddingBottomRight: matchMedia('(max-width:1050px)').matches ? [0, 0] : [Math.min(520, wrap.clientWidth * .5), 0] });
  }

  return {
    abrir() {
      card.hidden = false; card.classList.remove('mar-minimizada'); wrap.classList.add('mar-abierto');
      if (sel) grupo.addTo(map);
      if (!datos || Date.now() - cargado > 10 * 60e3) cargar();
    },
    cerrar,
    get abierto() { return !card.hidden; }
  };
}
