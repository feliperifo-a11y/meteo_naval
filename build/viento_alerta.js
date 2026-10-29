// ============================ Alerta preventiva de viento a 5 días (página Desarrollo) ============================
// Lee data/viento_alerta.json (scripts/viento_alerta.py): parámetros de aviso por viento del PD OPE-07 aplicados al viento
// a 10 m del ECMWF IFS 0,1° de 0 a 120 h, por área de responsabilidad de cada CMM, Juan Fernández e Isla de Pascua.
// Estimación automática: no constituye aviso.
function crearAlertaViento(L, map, h) {
  const escH = h.escH;
  const CAT = {
    E: { txt: 'Aviso especial', corto: 'E', cls: 'v1', color: '#5fb0ff' },
    M: { txt: 'Mal tiempo', corto: 'MT', cls: 'v2', color: '#f2a900' },
    VF: { txt: 'Viento fuerte', corto: 'VF', cls: 'v3', color: '#e8452c' },
    T: { txt: 'Temporal', corto: 'T', cls: 'v4', color: '#b3149a' }
  };
  const NADA = { txt: 'Sin aviso estimado', corto: '', cls: 'v0' };
  const ROSA = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const rosa = d => d == null ? '–' : ROSA[Math.round(d / 22.5) % 16];
  const beaufort = kt => [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64].findIndex(l => kt < l) < 0 ? 12 : [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64].findIndex(l => kt < l);
  const dm = (v, pos, neg) => { const t = Math.round(Math.abs(v) * 60), g = Math.floor(t / 60), mi = t - g * 60; return `${g}°${String(mi).padStart(2, '0')}′ ${v < 0 ? neg : pos}`; };
  const fechaCorta = f => { const d = new Date(f + 'T12:00:00Z'); return `${d.toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'UTC' }).replace('.', '').slice(0, 2)}<br>${d.getUTCDate()}`; };
  const fechaLarga = f => new Date(f + 'T12:00:00Z').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const horaChile = iso => new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
  const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

  const card = document.createElement('section');
  card.className = 'card mar-card vto-card'; card.id = 'alertaViento'; card.hidden = true;
  card.innerHTML = `<div class="mar-cab"><h2>Viento · perspectiva a 5 días</h2><span class="mar-etq">Estimación automática · no constituye aviso</span>
      <button type="button" class="mar-min" aria-label="Minimizar panel" title="Minimizar / ampliar">▾</button><button type="button" class="mar-cerrar" aria-label="Cerrar panel">✕</button></div>
    <p class="mar-sub" aria-live="polite">Cargando…</p>
    <div class="mar-tabla-wrap"></div>
    <div class="mar-ley">${Object.values(CAT).map(c => `<span><i class="${c.cls}"></i>${c.txt}</span>`).join('')}<span><i class="mav"></i>Aviso oficial vigente</span><span><b>15/20</b> rango de viento del día (kt)</span></div>
    <div class="mar-det" aria-live="polite"><p class="mar-ayuda">Selecciona un día para ver el viento que lo determina y el área evaluada en el mapa.</p></div>
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
      const r = await fetch('data/viento_alerta.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      datos = await r.json(); cargado = Date.now();
    } catch (e) {
      datos = null;
      sub.textContent = 'Aún no hay una corrida procesada o no se pudo leer el archivo. Se genera con cada corrida nueva del ECMWF (00 y 12 UTC).';
      tablaWrap.innerHTML = ''; return;
    }
    pintar();
  }

  function pintar() {
    const d = datos, h0 = hoy();
    const fechas = d.fechas.filter(f => f >= h0);
    const viejo = Date.now() - new Date(d.generado) > 20 * 3600e3;
    sub.innerHTML = `Corrida ${escH(d.corrida.replace('T', ' ').replace('Z', ' UTC'))} · ${escH(d.fuente)} · procesada ${escH(horaChile(d.generado))} (hora Chile). Cada área va desde la costa hasta su límite oceánico, sin aguas interiores.`
      + (viejo ? ' <b class="mar-viejo">Datos con más de 20 h: la corrida no se ha actualizado.</b>' : '');
    const dia = f => Math.round((new Date(f + 'T12:00:00Z') - new Date(h0 + 'T12:00:00Z')) / 864e5);
    const grupoDe = f => dia(f) < 1 ? 0 : dia(f) < 3 ? 1 : 2;
    const tramos = [];
    fechas.forEach(f => { const g = grupoDe(f); if (!tramos.length || tramos[tramos.length - 1].g !== g) tramos.push({ g, n: 1 }); else tramos[tramos.length - 1].n++; });
    const nombresG = ['< 24 h', 'Alerta preventiva', 'Perspectiva'];
    let html = `<table class="mar-tabla"><thead><tr><th></th>${tramos.map(t => `<th colspan="${t.n}" class="mar-g${t.g}">${nombresG[t.g]}</th>`).join('')}</tr>`
      + `<tr><th class="mar-z">Área</th>${fechas.map(f => `<th title="${escH(fechaLarga(f))}">${fechaCorta(f)}</th>`).join('')}</tr></thead><tbody>`;
    d.zonas.forEach((z, zi) => {
      html += `<tr><th class="mar-z" title="${escH(z.nombre)}">${escH(z.id)}</th>`;
      fechas.forEach(f => {
        const i = z.celdas.findIndex(c => c.fecha === f), c = z.celdas[i];
        if (!c) { html += '<td><span class="mar-c vto-sd" title="Sin datos">–</span></td>'; return; }
        const k = CAT[c.cat] || NADA, p = c.persistencia || [0, 0], esSel = sel && sel[0] === zi && sel[1] === i;
        const rg = c.rango ? `${c.dir_dom != null ? rosa(c.dir_dom) + ' ' : ''}${c.rango[0]}/${c.rango[1]} kt` : '';
        const tit = `${z.nombre} · ${fechaLarga(f)}: ${k.txt}${c.cat ? ` (${c.vel} kt del ${rosa(c.dir)})` : ''}${rg ? ` · viento ${rg}` : ''}${c.cat && p[1] > 1 ? ` · ${p[0]} de ${p[1]} corridas` : ''}${c.aviso ? ' · aviso oficial vigente' : ''}`;
        html += `<td><button type="button" class="mar-c ${k.cls}${c.aviso ? ' mav' : ''}${esSel ? ' sel' : ''}" data-z="${zi}" data-i="${i}" title="${escH(tit)}" aria-label="${escH(tit)}">`
          + `${k.corto ? `<b>${k.corto}</b>` : ''}${c.rango ? `<small class="mar-rg">${c.rango[0]}/${c.rango[1]}</small>` : ''}</button></td>`;
      });
      html += '</tr>';
    });
    tablaWrap.innerHTML = html + '</tbody></table><p class="mar-zonas">' + d.zonas.map(z => `<b>${escH(z.id)}</b> ${escH(z.nombre)}`).join(' · ') + '</p>';
    tablaWrap.querySelectorAll('button.mar-c').forEach(b => b.onclick = () => elegir(+b.dataset.z, +b.dataset.i));
    const cr = d.criterios || {};
    crit.innerHTML = `<p><b>Parámetros por área:</b></p><ul>${(cr.areas || []).map(x => `<li>${escH(x)}</li>`).join('')}</ul>`
      + `<p><b>Notas:</b></p><ul>${(cr.notas || []).map(x => `<li>${escH(x)}</li>`).join('')}</ul>`
      + `<p>La confianza se indica como el número de corridas recientes (hasta 3) que muestran un aviso ese día. Fuente de los parámetros: ${escH(cr.fuente || '')}. Modelo: ${escH(d.fuente)}; Isla de Pascua: ECMWF IFS 0,25° vía Open-Meteo.</p>`;
    if (sel) elegir(sel[0], sel[1], true);
  }

  function elegir(zi, i, sinZoom) {
    sel = [zi, i];
    tablaWrap.querySelectorAll('.mar-c.sel').forEach(b => b.classList.remove('sel'));
    const btn = tablaWrap.querySelector(`.mar-c[data-z="${zi}"][data-i="${i}"]`); if (btn) btn.classList.add('sel');
    const z = datos.zonas[zi], c = z.celdas[i], k = CAT[c.cat] || NADA, p = c.persistencia || [0, 0];
    let t = `<h3>${escH(z.nombre)} · ${escH(fechaLarga(c.fecha))}</h3><p class="mar-cat ${k.cls}">${escH(k.txt)}</p>`;
    if (c.cat) {
      t += `<dl>${c.rango ? `<dt>Viento en el área</dt><dd>${c.dir_dom != null ? escH(rosa(c.dir_dom)) + ' ' : ''}${c.rango[0]}/${c.rango[1]} kt</dd>` : ''}<dt>Viento máximo</dt><dd>${c.vel} kt del ${escH(rosa(c.dir))} (${c.dir}°) · Beaufort ${beaufort(c.vel)}</dd>`
        + `<dt>Ráfaga en ese punto</dt><dd>${c.raf == null ? '–' : c.raf + ' kt'}</dd>`
        + `<dt>Extensión</dt><dd>${c.frac} % de los puntos del área · sector ${escH(c.sector)}</dd>`
        + `<dt>Punto del máximo</dt><dd>${dm(c.lat, 'N', 'S')} · ${dm(c.lon, 'E', 'W')}</dd>`
        + `<dt>Hora del máximo</dt><dd>${escH(horaChile(c.valido))} (hora Chile)</dd>`
        + `<dt>Persistencia</dt><dd>${p[1] ? `${p[0]} de ${p[1]} corridas recientes` : 'primera corrida'}</dd></dl>`;
    } else if (c.vmax != null) {
      t += `<p>${c.rango ? `Viento en el área: ${c.dir_dom != null ? escH(rosa(c.dir_dom)) + ' ' : ''}${c.rango[0]}/${c.rango[1]} kt. ` : ''}Máximo puntual: ${c.vmax} kt, bajo los parámetros de aviso (o sin la extensión y duración requeridas).</p>`;
    }
    if (c.aviso) t += `<p class="mar-nota mar-nota-av">Aviso oficial de viento vigente: ${escH(c.aviso)}.</p>`;
    const n = Math.round((new Date(c.fecha + 'T12:00:00Z') - new Date(hoy() + 'T12:00:00Z')) / 864e5);
    t += `<p class="mar-nota">${n < 1 ? 'Plazo menor que las 24 h de antelación que exige el PD OPE-07 para emitir el aviso.' : n < 3 ? 'Alerta preventiva: plazo de 1 a 2 días.' : 'Perspectiva: plazo de 3 a 5 días; la confianza disminuye con el plazo.'}</p>`;
    if (z.fuente) t += `<p class="mar-nota">Fuente para esta área: ${escH(z.fuente)}.</p>`;
    det.innerHTML = t;
    grupo.clearLayers();
    z.puntos.forEach(pt => L.circleMarker(pt, { radius: 2.5, weight: 1, color: '#1f6fb2', fillColor: '#5fb0ff', fillOpacity: .6, interactive: false }).addTo(grupo));
    if (c.cat && c.lat != null) L.circleMarker([c.lat, c.lon], { radius: 9, weight: 3, color: '#fff', fillColor: k.color, fillOpacity: 1 }).bindTooltip(`${k.txt}: ${c.vel} kt del ${rosa(c.dir)}`, { direction: 'top' }).addTo(grupo);
    if (!map.hasLayer(grupo)) grupo.addTo(map);
    if (!sinZoom && z.puntos.length) map.fitBounds(L.latLngBounds(z.puntos).pad(0.15), { maxZoom: 8, paddingBottomRight: matchMedia('(max-width:1050px)').matches ? [0, 0] : [Math.min(520, wrap.clientWidth * .5), 0] });
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
