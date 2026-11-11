// ============================ Ruta de navegación (página Desarrollo) ============================
// El usuario marca zarpe, destino y puntos intermedios, la hora de zarpe y la velocidad. La ruta se divide en tramos y,
// para la hora estimada de paso por cada punto, se muestran: viento, ráfaga, oleaje y visibilidad (Open-Meteo: ECMWF IFS y
// GFS; oleaje Météo-France), avisos vigentes o próximos que la ruta cruza a esa hora, avisos probables (alertas preventivas
// de viento 5 días y marejadas 10 días de MeteoIA), restricciones SITPORT en el puerto de zarpe y de llegada y estaciones
// cercanas. Semáforo por tramo con umbrales editables (iguales para toda embarcación: solo importa la velocidad).
// Usa funciones del módulo CASO SAR (sarMillas, sarRumbo, sarMover, sarDM, sarLeerCoord, sarCercaGeom, sarCompas, sarFmt…).
// Puertos y bahías de SITPORT (sin lagos ni ríos), de norte a sur: [ID de bahía SITPORT, nombre]. La posición es BAHIA_POS.
const RUTA_PUERTOS = [[71,"Bahía de Arica"],[204,"Pisagua"],[72,"Bahía de Iquique"],[196,"Borde Costero Norte Patache"],[195,"Patillo"],[73,"Patache"],[197,"Borde Costero Sur Patache"],[74,"Bahía Algodonales"],[236,"Caleta Viuda"],[76,"Caleta Michilla"],[75,"Bahía Mejillones del Sur"],[77,"Bahía Moreno (Antofagasta)"],[78,"Caleta Coloso"],[79,"Taltal"],[172,"Bahía Pan de Azúcar"],[80,"Bahía Chañaral"],[83,"Sector Punta Totoralillo"],[81,"Bahía Caldera"],[82,"Bahía Calderilla"],[89,"Isla de Pascua"],[157,"Puerto Carrizal Bajo"],[84,"Bahía Puerto Huasco"],[158,"Caleta Chañaral y Ensenada Gaviota"],[202,"Cruz Grande"],[206,"La Higuera"],[85,"Bahía Coquimbo"],[86,"Bahía Herradura de Guayacán"],[150,"Guanaqueros"],[87,"Tongoy"],[151,"Barnes"],[88,"Bahía Conchalí"],[180,"Bahía Pichidangui"],[219,"Sector Norte Quintero"],[91,"Bahía de Quintero"],[173,"Bahía Concón"],[92,"Bahía de Valparaíso"],[174,"Bahía Rada Quintay"],[94,"Bahía Algarrobo"],[215,"El Quisco"],[93,"Puerto de San Antonio"],[90,"Isla Robinson Crusoe"],[95,"Pichilemu"],[103,"Bahía Constitución"],[97,"Bahía Concepción - Lirquén"],[98,"Bahía Concepción - Talcahuano"],[99,"Bahía San Vicente"],[198,"Sector Costero Península de Hualpen"],[100,"Bahía Coronel"],[102,"Lota"],[101,"Lebu"],[143,"Carahue - Borde Costero"],[208,"Borde Costero-Valdivia"],[107,"Bahía Corral"],[170,"Sector Chaihuín"],[148,"Ensenada Estaquilla"],[109,"Puerto Montt"],[152,"Cochamo"],[216,"Canal Tenglo"],[110,"Bahía Chincui"],[112,"Bahía Maullín"],[233,"Seno Reloncavi"],[147,"Rada Manzano"],[149,"Rada de Carelmapu"],[113,"Bahía de Calbuco"],[114,"Canal Chacao Sector Pargua y Punta Coronel"],[213,"Canal Chacao"],[232,"San José-Caicaen"],[118,"Bahía Ancud y Canal Chacao"],[214,"Bahía Ancud"],[185,"Ensenada Rolecha"],[115,"Canal Hornopirén"],[183,"Estero Pichicolo"],[184,"Ensenada Hualaihué"],[120,"Puerto Quemchi"],[181,"Canal Cholgo"],[182,"Estero Comau"],[186,"Sector Ayacara"],[163,"Canal Dalcahue"],[187,"Sector Buill"],[122,"Achao"],[116,"Castro"],[235,"Chequian"],[205,"Puqueldón (Isla Lemuy)"],[119,"Chonchi"],[155,"Queilen"],[121,"Chaitén"],[117,"Bahía Quellón"],[251,"Canal Golfo Corcovado (Norte)"],[175,"Sector Repolla Alto"],[124,"Melinka"],[176,"Sector Repolla Bajo"],[252,"Canal Moraleda (Este)"],[253,"Canal Chaffers Norte"],[255,"Canal Pérez Norte"],[254,"Canal Chaffers Sur"],[123,"Puerto Cisnes"],[238,"Sector Canal Moraleda"],[256,"Canal Pérez Sur"],[241,"Sector Canal Goñi y Canal Ninualac"],[244,"Sector Canal Tránsito"],[125,"Sector Bahía de Puerto Aguirre"],[239,"Sector Canal Ferronave y Canal Devia"],[240,"Sector Canal Pilcomayo y Canal Rodriguez"],[228,"Canal Vicuña"],[242,"Sector Canal Carrera del Chivato y Canal Cuchi"],[220,"Fiordo Aysen"],[227,"Canal Williams"],[243,"Sector Canal Darwin"],[225,"Canal Utarupa"],[126,"Bahía Chacabuco"],[224,"Canal Errázuriz"],[223,"Canal Costa y Elefantes"],[221,"Estero Quitralco"],[226,"Boca Wickham"],[222,"Estero Cupquelan"],[127,"Baker"],[129,"Puerto Edén"],[154,"Isla Guarello"],[130,"Puerto Natales"],[156,"Primera Angostura"],[165,"Skyring"],[131,"Bahía Gregorio"],[132,"Bahía Clarencia"],[135,"Cabo Negro"],[200,"Laredo"],[136,"Seno Otway"],[133,"Bahía Catalina"],[134,"Punta Arenas"],[137,"Bahía Chilota"],[259,"Bahía Caleta 2 de Mayo Yendegaia"],[138,"Puerto Williams"],[260,"Bahía Puerto Toro"],[199,"Cabo de Hornos"],[139,"Bahía Fildes"],[231,"Bahía Chile"],[140,"Bahía Paraíso"]];
const RUTA_UMBRALES_BASE = { vientoA: 22, vientoR: 34, olaA: 2.5, olaR: 4, visA: 2, visR: 0.5 };   // kt · m · mn (Beaufort 6 y 8)
function crearRuta(L, map, ctx) {
  const { escH, nf } = ctx;
  let umb = { ...RUTA_UMBRALES_BASE };
  try { const g = JSON.parse(localStorage.getItem('meteoia_ruta_umbrales') || 'null'); if (g) umb = { ...umb, ...g }; } catch (e) { /* sin almacenamiento */ }
  const guardarUmb = () => { try { localStorage.setItem('meteoia_ruta_umbrales', JSON.stringify(umb)); } catch (e) { /* sin almacenamiento */ } };
  let pts = [], modo = null, token = 0, ultimo = null;
  // Puertos SITPORT: se eligen por nombre en los campos de zarpe y recalada
  const normP = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const POS_B = ctx.bahiaPos() || {};
  const PUERTOS = RUTA_PUERTOS.filter(([id]) => POS_B[id]).map(([id, n]) => ({ id, n, p: POS_B[id], k: normP(n) }));
  const puertoPorId = id => PUERTOS.find(x => x.id === id) || null;
  // pp[i]: puerto SITPORT del punto i (o null); est[i]: horas de estadía en el punto i (recaladas intermedias)
  let pp = [], est = [];
  // Pestaña Puertos: zarpe y lista de recaladas en orden, con estadía en cada recalada intermedia
  let pz = null, recs = [{ p: null, h: 0 }];
  let tipo = 'coord', condAbierta = false, buque = '', margen = 5, eslora = null, calado = null, altSel = null;   // tipo de entrada: 'coord' (mapa o grados) o 'puertos'
  try {
    const g = JSON.parse(localStorage.getItem('meteoia_ruta') || 'null');
    if (g && Array.isArray(g.pts)) { pts = g.pts; pp = (g.pp || []).map(id => puertoPorId(id)); est = g.est || []; }
    if (g && (g.tipo === 'puertos' || g.tipo === 'coord')) tipo = g.tipo;
    if (g && g.pz) pz = puertoPorId(g.pz);
    if (g && Array.isArray(g.recs) && g.recs.length) recs = g.recs.map(r => ({ p: puertoPorId(r.p), h: +r.h || 0 }));
    if (g && g.buque) buque = String(g.buque).slice(0, 80);
    if (g && g.eslora > 0) eslora = +g.eslora; if (g && g.calado > 0) calado = +g.calado;
    if (g && g.margen != null && isFinite(g.margen)) margen = Math.min(50, Math.max(0, +g.margen));
  } catch (e) { /* sin almacenamiento */ }
  const pZ = () => pp[0] || null, pR = () => (pts.length > 1 && pp[pts.length - 1]) || null;

  const card = document.createElement('section');
  card.className = 'card sar-card ruta-card'; card.id = 'rutaNav'; card.hidden = true;
  card.innerHTML = `<div class="sar-cab"><h2>Ruta de navegación</h2><span class="sar-etq">Herramienta de apoyo en validación</span><button type="button" class="sar-min" aria-label="Minimizar ficha" title="Minimizar / ampliar">▾</button><button type="button" class="sar-cerrar" aria-label="Cerrar ficha">✕</button></div>
    <div class="ruta-tipo" role="tablist" aria-label="Cómo indicar zarpe y recalada">
      <button type="button" role="tab" data-t="coord">Latitud y longitud <small>(mapa o grados)</small></button>
      <button type="button" role="tab" data-t="puertos">Puertos <small>(SITPORT)</small></button>
    </div>
    <form class="sar-form ruta-form">
      <label class="ruta-buque">Buque o embarcación<input name="buque" placeholder="Nombre del buque (opcional)" autocomplete="off" maxlength="80"></label>
      <label title="Opcional: se compara con la eslora máxima de canales y angosturas">Eslora (m)<input name="eslora" inputmode="decimal" placeholder="opcional" style="width:80px;min-width:80px"></label>
      <label title="Opcional: se compara con el calado máximo de canales y angosturas">Calado (m)<input name="calado" inputmode="decimal" placeholder="opcional" style="width:80px;min-width:80px"></label>
      <label class="ruta-c">Zarpe (lat, lon)<input name="a" placeholder="33 01,5 S  71 38,0 W" autocomplete="off"></label>
      <label class="ruta-c">Recalada (lat, lon)<input name="b" placeholder="36 42,0 S  73 07,0 W" autocomplete="off"></label>
      <label class="ruta-p">Puerto de zarpe<select name="pa"></select></label>
      <div class="ruta-p ruta-recs"></div>
      <button type="button" class="ruta-p ruta-masrec">+ Agregar recalada</button>
      <label>Zarpe (hora Chile)<input name="hora" type="datetime-local"></label>
      <label>Velocidad (kt)<input name="vel" inputmode="decimal" value="10" style="width:80px;min-width:80px"></label>
      <label title="La ruta se mantiene a esta distancia de la costa y de las islas, salvo al salir del zarpe y al llegar a cada recalada">Distancia a la costa (mn)<input name="margen" inputmode="decimal" value="5" style="width:80px;min-width:80px"></label>
      <button type="submit">Calcular</button>
      <button type="button" class="sar-elegir ruta-elegir ruta-c">Marcar en el mapa</button>
      <button type="button" class="sar-borrar ruta-borrar">Limpiar</button>
    </form>
    <p class="sar-ayuda ruta-ayuda ruta-c">Escribe las coordenadas (grados y minutos o decimales; S y W por defecto) o usa "Marcar en el mapa": primer clic = zarpe, cada clic siguiente agrega un punto de la ruta; el último es la recalada. Termina con <b>Enter</b>, doble clic o el botón "Terminar ruta" (Esc cancela). Los puntos se pueden arrastrar; un punto sobre tierra se lleva a la orilla.</p>
    <p class="sar-ayuda ruta-ayuda ruta-p">Elige el puerto de zarpe y uno o más puertos de recalada, en el orden de navegación (136 puertos y bahías de SITPORT, de norte a sur, agrupados por zona). En cada recalada intermedia puedes indicar la estadía en horas. Las restricciones SITPORT se leen de las bahías elegidas.</p>
    <div class="sar-res ruta-res" aria-live="polite"></div>`;
  const wrap = document.getElementById('mapWrap');
  wrap.appendChild(card);
  L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
  const form = card.querySelector('.ruta-form'), res = card.querySelector('.ruta-res');
  const grupo = L.layerGroup();
  const aviso = document.createElement('div'); aviso.className = 'sar-aviso-mapa'; aviso.hidden = true;
  aviso.innerHTML = '<span class="ruta-aviso-txt">Clic en el mapa: zarpe</span> <button type="button" class="ruta-fin">Terminar ruta</button> <button type="button" class="ruta-cancelar">Cancelar</button>';
  wrap.appendChild(aviso);
  L.DomEvent.disableClickPropagation(aviso);
  aviso.querySelector('.ruta-fin').onclick = e => { e.stopPropagation(); terminarMarcar(); };
  aviso.querySelector('.ruta-cancelar').onclick = e => { e.stopPropagation(); modoMarcar(false); pts = []; pp = []; est = []; guardar(); sincForm(); dibujarPuntos(); };
  const avisoTxt = aviso.querySelector('.ruta-aviso-txt');
  const textoAviso = () => { avisoTxt.textContent = !pts.length ? 'Clic en el mapa: zarpe' : pts.length === 1 ? 'Clic: siguiente punto o recalada' : `${pts.length} puntos · clic: otro punto · Enter, doble clic o "Terminar ruta": el último es la recalada`; };
  // Coordenadas junto al cursor mientras se marca
  const cursor = document.createElement('div'); cursor.className = 'sar-cursor'; cursor.hidden = true; wrap.appendChild(cursor);
  map.getContainer().addEventListener('mousemove', e => {
    if (modo !== 'marcar') return;
    const ll = map.mouseEventToLatLng(e), r = wrap.getBoundingClientRect();
    cursor.textContent = `${sarDM(ll.lat, 'N', 'S')} · ${sarDM(ll.lng, 'E', 'W')}`;
    cursor.style.left = (e.clientX - r.left + 16) + 'px'; cursor.style.top = (e.clientY - r.top + 18) + 'px'; cursor.hidden = false;
  });
  map.getContainer().addEventListener('mouseleave', () => { cursor.hidden = true; });
  card.querySelector('.sar-cerrar').onclick = () => cerrar();
  card.querySelector('.sar-min').onclick = e => { card.classList.toggle('sar-minimizada'); e.currentTarget.textContent = card.classList.contains('sar-minimizada') ? '▴' : '▾'; };
  const guardar = () => { try { localStorage.setItem('meteoia_ruta', JSON.stringify({ pts, tipo, pp: pp.map(x => x && x.id), est, pz: pz && pz.id, recs: recs.map(r => ({ p: r.p && r.p.id, h: r.h })), buque, margen, eslora, calado })); } catch (e) { /* sin almacenamiento */ } };
  // Listas de puertos agrupadas por zona (de norte a sur)
  const ZONAS = [['Islas oceánicas', x => x.p[1] < -76], ['Arica a Coquimbo', x => x.p[0] >= -32], ['Valparaíso a Biobío', x => x.p[0] >= -38], ['Araucanía a Los Lagos', x => x.p[0] >= -43.5],
    ['Aysén', x => x.p[0] >= -49], ['Magallanes', x => x.p[0] >= -60], ['Antártica', () => true]];
  const zonaDe = x => ZONAS.find(([, f]) => f(x))[0];
  const opciones = actual => '<option value="">— Elige —</option>' + ZONAS.map(([z]) => { const g = PUERTOS.filter(x => zonaDe(x) === z); return `<optgroup label="${z}">${g.map(x => `<option value="${x.id}"${actual === x ? ' selected' : ''}>${escH(x.n)}</option>`).join('')}</optgroup>`; }).join('');
  const recsDiv = card.querySelector('.ruta-recs');
  function llenarListas() {
    form.pa.innerHTML = opciones(pz);
    recsDiv.innerHTML = recs.map((r, i) => `<div class="ruta-rec" data-i="${i}"><label>Recalada${recs.length > 1 ? ' ' + (i + 1) : ''}<select class="ruta-rsel">${opciones(r.p)}</select></label>` +
      (i < recs.length - 1 ? `<label class="ruta-est">Estadía (h)<input class="ruta-rest" inputmode="decimal" value="${String(r.h || 0).replace('.', ',')}"></label>` : '') +
      (recs.length > 1 ? `<button type="button" class="ruta-quitar" title="Quitar esta recalada" aria-label="Quitar recalada ${i + 1}">✕</button>` : '') + '</div>').join('');
    recsDiv.querySelectorAll('.ruta-rec').forEach(d => {
      const i = +d.dataset.i;
      d.querySelector('.ruta-rsel').onchange = e => { recs[i].p = puertoPorId(+e.target.value); guardar(); if (pz && recs.every(r => r.p)) form.requestSubmit(); };
      const e = d.querySelector('.ruta-rest'); if (e) e.onchange = () => { recs[i].h = Math.max(0, parseFloat(e.value.replace(',', '.')) || 0); guardar(); if (pz && recs.every(r => r.p)) form.requestSubmit(); };
      const q = d.querySelector('.ruta-quitar'); if (q) q.onclick = () => { recs.splice(i, 1); llenarListas(); guardar(); if (pz && recs.every(r => r.p)) form.requestSubmit(); };
    });
  }
  card.querySelector('.ruta-masrec').onclick = () => { recs.push({ p: null, h: 0 }); llenarListas(); guardar(); const s = recsDiv.querySelectorAll('.ruta-rsel'); s[s.length - 1].focus(); };
  function ponerTipo(t) {
    tipo = t;
    card.querySelectorAll('.ruta-tipo button').forEach(b => { const on = b.dataset.t === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    card.querySelectorAll('.ruta-c').forEach(e => { e.hidden = t !== 'coord'; });
    card.querySelectorAll('.ruta-p').forEach(e => { e.hidden = t !== 'puertos'; });
    if (t === 'puertos' && modo === 'marcar') modoMarcar(false);
    sincForm(); guardar();
  }
  card.querySelectorAll('.ruta-tipo button').forEach(b => b.onclick = () => ponerTipo(b.dataset.t));
  form.pa.addEventListener('change', () => { pz = puertoPorId(+form.pa.value); guardar(); if (pz && recs.every(r => r.p)) form.requestSubmit(); });
  form.buque.value = buque;
  for (const k of ['eslora', 'calado']) {
    form[k].value = (k === 'eslora' ? eslora : calado) != null ? String(k === 'eslora' ? eslora : calado).replace('.', ',') : '';
    form[k].addEventListener('change', () => { const v = parseFloat(form[k].value.replace(',', '.')); if (k === 'eslora') eslora = v > 0 ? v : null; else calado = v > 0 ? v : null; guardar(); if (ultimo) { pintar(); } });
  }
  form.margen.value = String(margen).replace('.', ',');
  form.margen.addEventListener('change', () => { const v = parseFloat(form.margen.value.replace(',', '.')); margen = isFinite(v) ? Math.min(50, Math.max(0, v)) : 5; form.margen.value = String(margen).replace('.', ','); guardar(); if (pts.length >= 2) calcular(); });
  form.buque.addEventListener('input', () => { buque = form.buque.value.trim(); guardar(); const t = res.querySelector('.ruta-nombre-buque'); if (t) t.textContent = buque; });
  form.buque.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
  // Busca un puerto por nombre: coincidencia exacta, o única que empiece o contenga el texto
  function buscarPuerto(t) {
    const q = normP(t); if (q.length < 3) return null;
    const unico = c => c.length === 1 ? c[0] : null;
    return PUERTOS.find(x => x.k === q) || unico(PUERTOS.filter(x => x.k.startsWith(q)))
      || unico(PUERTOS.filter(x => (' ' + x.k).includes(' ' + q)))   // alguna palabra del nombre empieza así ("paraiso" no confunde con Valparaíso)
      || unico(PUERTOS.filter(x => x.k.includes(q)));
  }
  const fmtPos = p => `${sarDM(p[0], 'N', 'S')} ${sarDM(p[1], 'E', 'W')}`;
  form.hora.value = sarHoraLocal(new Date(Date.now() + 3600e3)).slice(0, 16);

  // La tierra y la ruta por mar están en ruta_mar.js (rutaEnTierra, rutaAlMar, rutaPorMar).
  let trazaCache = { clave: '', traza: null };

  // ---------------- Mapa: marcadores y traza
  function dibujarPuntos() {
    grupo.clearLayers();
    if (pts.length >= 2 && !ultimo) L.polyline(pts, { color: '#ff6a00', weight: 3, dashArray: '6 6' }).addTo(grupo);
    dibujarMarcadores();
  }
  function sincForm() {
    form.a.value = pts[0] ? fmtPos(pts[0]) : '';
    form.b.value = pts.length > 1 ? fmtPos(pts[pts.length - 1]) : '';
    llenarListas();
  }
  function modoMarcar(on) {
    modo = on ? 'marcar' : null; aviso.hidden = !on; map.getContainer().style.cursor = on ? 'crosshair' : ''; if (!on) cursor.hidden = true;
    map.getContainer().classList.toggle('ruta-marcando', on);
    // Pantallas angostas: mientras se marca, la ficha se pliega para dejar libre el mapa
    if (innerWidth <= 1050) { card.classList.toggle('sar-minimizada', on); card.querySelector('.sar-min').textContent = on ? '▴' : '▾'; if (on) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    if (on) { pts = []; pp = []; est = []; ultimo = null; res.innerHTML = ''; dibujarPuntos(); textoAviso(); map.doubleClickZoom.disable(); } else map.doubleClickZoom.enable();
  }
  // El clic se captura antes que cualquier capa (costa, zonas, Marejadas UV, WRF, ECMWF y WW3 interceptan los clics del mapa).
  map.getContainer().addEventListener('click', e => {
    if (modo !== 'marcar' || card.hidden || e.target.closest('.leaflet-control')) return;
    e.stopPropagation(); e.preventDefault();
    const ll = map.mouseEventToLatLng(e);
    pts.push(rutaAlMar([+ll.lat.toFixed(4), +ll.lng.toFixed(4)])); sincForm(); dibujarPuntos(); textoAviso();   // sobre tierra: se lleva a la orilla
  }, true);
  map.getContainer().addEventListener('dblclick', e => {
    if (modo !== 'marcar' || e.target.closest('.leaflet-control')) return;
    e.stopPropagation(); e.preventDefault(); terminarMarcar();
  }, true);
  document.addEventListener('keydown', e => {
    if (modo !== 'marcar') return;
    if (e.key === 'Escape') { modoMarcar(false); pts = []; dibujarPuntos(); }
    if (e.key === 'Enter') { e.preventDefault(); terminarMarcar(); }
  });
  function terminarMarcar() {
    // el doble clic agrega dos veces el último punto: se quitan los duplicados consecutivos
    pts = pts.filter((p, i) => i === 0 || sarMillas(p, pts[i - 1]) > 0.05);
    modoMarcar(false); guardar(); sincForm();
    if (pts.length >= 2) calcular(); else { res.innerHTML = '<p class="sar-error">Marca al menos el zarpe y el destino.</p>'; dibujarPuntos(); }
  }
  card.querySelector('.ruta-elegir').onclick = () => modoMarcar(true);
  card.querySelector('.ruta-borrar').onclick = () => { modoMarcar(false); pts = []; ultimo = null; guardar(); sincForm(); res.innerHTML = ''; grupo.clearLayers(); };
  // Al elegir un puerto de la lista (o escribir uno completo) se calcula de inmediato si el otro extremo ya está
  form.onsubmit = e => {
    e.preventDefault();
    const leer = s => {
      // admite "33 01,5 S 71 38,0 W", "33°01,5'S / 71°38,0'W" o decimales "-33.025 -71.633" / "-33.025; -71.633"
      const t = String(s).trim().toUpperCase().replace(/[;/]/g, ' ');
      let la, lo; const h = t.match(/^(.*?[NS])\s*,?\s*(.+)$/);
      if (h) { la = h[1]; lo = h[2]; } else { const q = t.split(/\s+|,\s+/).filter(Boolean); if (q.length !== 2) return null; [la, lo] = q; }
      const a = sarLeerCoord(la, true), b = sarLeerCoord(lo, false); return isFinite(a) && isFinite(b) ? [a, b] : null; };
    let a, b, pa = null, pb = null;
    if (tipo === 'puertos') {
      if (!pz || !recs.every(r => r.p)) { ++token; res.innerHTML = `<p class="sar-error">Elige ${!pz ? 'el puerto de zarpe' : 'el puerto de cada recalada'}.</p>`; return; }
      const lista = [pz, ...recs.map(r => r.p)].filter((x, i, l) => i === 0 || x !== l[i - 1]);   // sin repetir puertos seguidos
      if (lista.length < 2) { ++token; res.innerHTML = '<p class="sar-error">La recalada debe ser distinta del zarpe.</p>'; return; }
      pts = lista.map(x => rutaAlMar(x.p)); pp = lista;
      est = lista.map((x, i) => { if (i === 0 || i === lista.length - 1) return 0; const r = recs.find(r => r.p === x); return r ? r.h : 0; });
      guardar(); calcular(); return;
    } else {
      // en coordenadas también se acepta el nombre completo de un puerto
      pa = buscarPuerto(form.a.value); pb = buscarPuerto(form.b.value);
      a = pa ? pa.p : leer(form.a.value); b = pb ? pb.p : leer(form.b.value);
      if (!a || !b) { ++token; res.innerHTML = `<p class="sar-error">Revisa las coordenadas de ${!a && !b ? 'zarpe y recalada' : !a ? 'zarpe' : 'recalada'}.</p>`; return; }
    }
    // si las coordenadas escritas cambian, se conservan los puntos intermedios
    const medios = pts.length > 2 ? pts.slice(1, -1) : [];
    pts = [rutaAlMar(a), ...medios, rutaAlMar(b)]; pp = [pa, ...medios.map(() => null), pb]; est = pts.map(() => 0); sincForm(); guardar(); calcular();
  };

  // ---------------- Cálculo
  // La hora de zarpe se escribe en hora de Chile, aunque el navegador esté en otra zona horaria.
  function horaChile(txt) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(txt || '')) return null;
    const g = Date.parse(txt.slice(0, 16) + ':00Z');
    const l = Date.parse(new Date(g).toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).replace(' ', 'T') + 'Z');
    return new Date(g - (l - g));
  }
  // Traza por mar entre los puntos del usuario: cada tramo que cruza tierra se reemplaza por el camino más corto por mar.
  function trazar() {
    const clave = JSON.stringify(pts) + '|' + margen;
    if (trazaCache.clave === clave) return trazaCache.traza;
    const tz = [{ p: pts[0], ip: 0 }], sinPaso = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const c = rutaPorMar(pts[i], pts[i + 1], margen);
      if (c) c.slice(1).forEach(p => tz.push({ p }));
      else { tz[tz.length - 1].malo = true; tz.push({ p: pts[i + 1] }); sinPaso.push(i + 1); }   // sin paso por mar: tramo recto marcado
      tz[tz.length - 1].ip = i + 1;   // vértice que corresponde al punto i + 1 del usuario
    }
    const recta = pts.slice(1).reduce((s, p, i) => s + sarMillas(pts[i], p), 0);
    trazaCache = { clave, traza: { tz, sinPaso, recta } };
    return trazaCache.traza;
  }
  // Rutas tipo: par de puertos (en cualquier sentido) que tiene alternativas trazadas con el Derrotero
  function parTipo() {
    if (typeof RUTAS_TIPO === 'undefined' || pts.length !== 2 || !pp[0] || !pp[1]) return null;
    for (const d of RUTAS_TIPO) { if (d.puertos[0] === pp[0].id && d.puertos[1] === pp[1].id) return { d, inv: false }; if (d.puertos[1] === pp[0].id && d.puertos[0] === pp[1].id) return { d, inv: true }; }
    return null;
  }
  function trazaAlt(a, inv) {
    const t = inv ? a.traza.slice().reverse() : a.traza, P = [];
    if (sarMillas(pts[0], t[0]) > 0.3) P.push(pts[0]);
    P.push(...t);
    if (sarMillas(pts[1], t[t.length - 1]) > 0.3) P.push(pts[1]);
    const tz = P.map(p => ({ p })); tz[0].ip = 0; tz[tz.length - 1].ip = 1;
    return { tz, sinPaso: [], recta: sarMillas(pts[0], pts[1]) };
  }
  // Elevación del sol (grados) en un punto y hora: para los pasos que exigen luz diurna (crepúsculo civil: sobre -6°)
  function solElev(d, la, lo) {
    const rad = Math.PI / 180, n = d.getTime() / 864e5 - 10957.5, L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) % 360;
    const lam = L + 1.915 * Math.sin(g * rad) + 0.02 * Math.sin(2 * g * rad), eps = 23.439 - 4e-7 * n;
    const dec = Math.asin(Math.sin(eps * rad) * Math.sin(lam * rad)), ra = Math.atan2(Math.cos(eps * rad) * Math.sin(lam * rad), Math.cos(lam * rad));
    const gmst = (18.697374558 + 24.06570982441908 * n) % 24, H = (gmst * 15 + lo) * rad - ra;
    return Math.asin(Math.sin(la * rad) * Math.sin(dec) + Math.cos(la * rad) * Math.cos(dec) * Math.cos(H)) / rad;
  }
  // Pasos con restricción de una alternativa: hora de paso, luz y comparación con eslora y calado del buque
  function pasosDe(a, Rr) {
    const tr = Rr.traza, cum = [0]; for (let i = 1; i < tr.length; i++) cum.push(cum[i - 1] + sarMillas(tr[i - 1], tr[i]));
    return (a.pasos || []).map(id => {
      const q = RUTA_PASOS[id]; let bi = 0, bd = 1e9; tr.forEach((p, i) => { const d = sarMillas(p, q.p); if (d < bd) { bd = d; bi = i; } });
      const mn = cum[bi]; let esp = 0; for (const e of Rr.escalas) if (e.mn < mn - 0.01 && e.h) esp += e.h;
      const eta = new Date(Rr.t0.getTime() + (mn / Rr.v + esp) * 3600e3), dia = solElev(eta, q.p[0], q.p[1]) > -6, prob = [];
      if (q.eslora && eslora && eslora > q.eslora) prob.push(`eslora ${nf(eslora, 0)} m sobre el máximo de ${nf(q.eslora, 0)} m`);
      if (q.calado && calado && calado > q.calado) prob.push(`calado ${nf(calado, 1)} m sobre el máximo de ${nf(q.calado, 1)} m`);
      if (q.luz && !dia) prob.push('la hora de paso es de noche y exige luz diurna');
      if (q.velMin && Rr.v < q.velMin) prob.push(`a menos de ${q.velMin} kt debe cruzarse con corriente a favor`);
      return { id, q, mn, eta, dia, prob };
    }).sort((x, y) => x.mn - y.mn);
  }
  function muestrear(T) {
    const v = Math.max(0.5, parseFloat(String(form.vel.value).replace(',', '.')) || 10);
    const t0 = horaChile(form.hora.value) || new Date();
    const P = T.tz.map(x => x.p);
    const total = P.slice(1).reduce((s, p, i) => s + sarMillas(P[i], p), 0);
    const paso = Math.max(3, Math.ceil(total / 40));     // ≤ ~40 puntos para la consulta
    const out = [], escalas = []; let acum = 0, espera = 0, sig = 0;   // espera: horas de estadía acumuladas
    const nomPt = i => pp[i] ? pp[i].n : i === 0 ? 'Zarpe' : i === pts.length - 1 ? 'Recalada' : 'Punto ' + i;
    for (let i = 0; i < P.length - 1; i++) {
      const ip = T.tz[i].ip, h = ip != null && ip > 0 ? (+est[ip] || 0) : 0;
      if (h > 0) {   // recalada intermedia con estadía: llegada y luego zarpe
        const lleg = new Date(t0.getTime() + (acum / v + espera) * 3600e3);
        out.push({ p: P[i], mn: acum, rumbo: 0, eta: lleg, puerto: nomPt(ip) + ' (llegada)' });
        espera += h; escalas.push({ nombre: nomPt(ip), mn: acum, llegada: lleg, zarpe: new Date(lleg.getTime() + h * 3600e3), h });
      } else if (ip != null && ip > 0) escalas.push({ nombre: nomPt(ip), mn: acum, llegada: new Date(t0.getTime() + (acum / v + espera) * 3600e3), h: 0 });
      // puntos interpolados en línea recta (la misma geometría con que se verificó que el tramo no cruza tierra)
      // Muestras cada "paso" millas a lo largo de la traza (no en cada vértice) y siempre en zarpe y recaladas
      const a = P[i], b = P[i + 1], d = sarMillas(a, b), rv = sarRumbo(a, b);
      const mk = (f, puerto) => { const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; out.push({ p, mn: acum + d * f, rumbo: rv, malo: !!T.tz[i].malo, eta: new Date(t0.getTime() + ((acum + d * f) / v + espera) * 3600e3), puerto }); };
      if (ip != null) { mk(0, ip === 0 ? nomPt(0) : nomPt(ip) + (h > 0 ? ' (zarpe)' : '')); sig = acum + paso; }
      while (sig < acum + d - paso * 0.3) { mk((sig - acum) / d, null); sig += paso; }
      acum += d;
    }
    const eta = new Date(t0.getTime() + (total / v + espera) * 3600e3);
    out.push({ p: P[P.length - 1], mn: total, rumbo: out.length ? out[out.length - 1].rumbo : 0, llegada: true, eta, puerto: nomPt(pts.length - 1) });
    out.forEach(s => { s.tierra = s.malo && rutaEnTierra(s.p[0], s.p[1]); });
    return { muestras: out, traza: P, total, recta: T.recta, sinPaso: T.sinPaso, v, t0, eta, espera, escalas };
  }
  async function pronostico(muestras, dias) {
    const la = muestras.map(s => s.p[0].toFixed(3)).join(','), lo = muestras.map(s => s.p[1].toFixed(3)).join(',');
    const q = `latitude=${la}&longitude=${lo}&forecast_days=${dias}&timezone=America%2FSantiago`;
    const [a, m] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${q}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,precipitation&models=ecmwf_ifs,gfs_global&wind_speed_unit=kn`, { signal: AbortSignal.timeout(30000) }).then(r => r.json()),
      fetch(`https://marine-api.open-meteo.com/v1/marine?${q}&hourly=wave_height,wave_period,wave_direction`, { signal: AbortSignal.timeout(30000) }).then(r => r.json()).catch(() => null)
    ]);
    const A = Array.isArray(a) ? a : [a], M = m ? (Array.isArray(m) ? m : [m]) : [];
    if (!A[0] || !A[0].hourly) throw Error((A[0] && A[0].reason) || 'sin pronóstico');
    return { A, M };
  }
  // hora entera más cercana a la hora de paso
  const idxHora = (h, d) => { const t = sarHoraLocal(new Date(d.getTime() + 30 * 60e3)).slice(0, 13); const i = h.time.findIndex(x => x.slice(0, 13) === t); return i; };
  const pick = (h, k, i) => { for (const s of ['_ecmwf_ifs', '_gfs_global', '']) { const v = h[k + s]?.[i]; if (v != null) return v; } return null; };
  function nivel(c) {
    if (c.tierra) return 'tierra';
    let n = 0;
    if (c.viento != null) n = Math.max(n, c.viento >= umb.vientoR ? 2 : c.viento >= umb.vientoA ? 1 : 0);
    if (c.rafaga != null) n = Math.max(n, c.rafaga >= umb.vientoR * 1.3 ? 2 : 0);
    if (c.ola != null) n = Math.max(n, c.ola >= umb.olaR ? 2 : c.ola >= umb.olaA ? 1 : 0);
    if (c.vis != null) { const mn = c.vis / 1852; n = Math.max(n, mn < umb.visR ? 2 : mn < umb.visA ? 1 : 0); }
    return c.viento == null && c.ola == null ? 'sd' : ['ok', 'lim', 'no'][n];
  }
  async function alertasPreventivas() {
    const leer = u => fetch(u + '?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(20000) }).then(r => r.ok ? r.json() : null).catch(() => null);
    const [v, m] = await Promise.all([leer('data/viento_alerta.json'), leer('data/marejadas_alerta.json')]);
    return { v, m };
  }
  function cruceProbables(muestras, al) {
    const out = new Map();
    const cats = { v: (al.v && al.v.categorias) || {}, m: { 1: 'Marejadas', 2: 'Marejadas anormales' } };
    for (const [tipo, d] of [['v', al.v], ['m', al.m]]) {
      if (!d || !d.zonas) continue;
      for (const z of d.zonas) {
        const puntos = z.puntos || [];
        for (const s of muestras) {
          if (s.tierra) continue;
          const fecha = sarHoraLocal(s.eta).slice(0, 10), c = (z.celdas || []).find(x => x.fecha === fecha);
          if (!c || !c.cat) continue;
          if (!puntos.some(([la, lo]) => Math.abs(la - s.p[0]) < 0.3 && Math.abs(lo - s.p[1]) < 0.3 / Math.cos(s.p[0] * Math.PI / 180))) continue;
          const k = tipo + z.id + fecha;
          const nom = tipo === 'v' ? (cats.v[c.cat] || c.cat) : (cats.m[c.cat] || 'Marejadas');   // viento: E/M/VF/T · marejadas: 1/2
          const e = out.get(k) || { tipo, nom, zona: z.nombre || z.id, fecha, desde: s.mn, hasta: s.mn, rango: c.rango, pers: c.persistencia };
          e.desde = Math.min(e.desde, s.mn); e.hasta = Math.max(e.hasta, s.mn); out.set(k, e);
        }
      }
    }
    return [...out.values()].sort((a, b) => a.desde - b.desde);
  }
  function cruceAvisos(muestras) {
    const out = new Map();
    for (const { a } of ctx.avisos()) for (const z of a.zonas || []) {
      if (!z.geom) continue;
      for (const s of muestras) {
        const e = ctx.estadoAviso(z, s.eta); if (e.k !== 'V') continue;      // vigente a la hora de paso
        if (!sarCercaGeom(s.p[0], s.p[1], z.geom, 3)) continue;
        const k = (a.id || a.tipo) + '|' + z.nombre;
        const x = out.get(k) || { a, z, e, desde: s.mn, hasta: s.mn, t1: s.eta, t2: s.eta };
        x.desde = Math.min(x.desde, s.mn); x.hasta = Math.max(x.hasta, s.mn); x.t2 = s.eta; out.set(k, x);
      }
    }
    return [...out.values()].sort((a, b) => a.desde - b.desde);
  }
  async function puertos() {
    const d = await ctx.sitport().catch(() => null); if (!d) return null;
    const nombres = Object.fromEntries((d.bahias || []).map(b => [String(b.IDBahia), String(b.NMBahia || '').trim()]));
    const por = {}; for (const r of d.restricciones || []) (por[r.bahia] = por[r.bahia] || []).push(r);
    const cerca = p => Object.entries(ctx.bahiaPos()).map(([id, q]) => ({ id, q, mn: sarMillas(p, q) })).filter(x => x.mn <= 12).sort((x, y) => x.mn - y.mn)[0];
    const uno = (p, pp) => { const c = pp ? { id: String(pp.id), mn: 0 } : cerca(p); if (!c) return null; const lista = por[c.id] || []; return { nombre: (pp && pp.n) || nombres[c.id] || (lista[0] && ctx.txtSitport(lista[0].GLBahia)) || 'Bahía N° ' + c.id, mn: c.mn, lista }; };
    const lista = pts.map((p, i) => ({ rol: i === 0 ? 'Zarpe' : i === pts.length - 1 ? 'Recalada' + (pp.filter(Boolean).length > 2 ? ' final' : '') : 'Recalada intermedia', p, x: pp[i] })).filter((o, i) => i === 0 || i === pts.length - 1 || o.x);
    return { lista: lista.map(o => ({ rol: o.rol, ...(uno(o.p, o.x) || { nada: true }) })), vivo: d.vivo, actualizado: d.actualizado };
  }
  function estacionesCerca(muestras) {
    const ahora = Date.now(), out = [];
    for (const s of ctx.estaciones()) {
      if (s.sinDatos || ctx.evaluar(s, ahora).k !== 'ok') continue;
      let best = null; for (const m of muestras) { const d = sarMillas(m.p, [s.lat, s.lon]); if (!best || d < best.d) best = { d, mn: m.mn }; }
      if (best && best.d <= 15) out.push({ s, ...best });
    }
    return out.sort((a, b) => a.mn - b.mn).slice(0, 12);
  }

  function aplicarPronostico(Rr, F) {
    Rr.muestras.forEach((s, j) => {
      const h = F && F.A[j] && F.A[j].hourly, mh = F && F.M[j] && F.M[j].hourly;
      if (h) { const i = idxHora(h, s.eta); if (i >= 0) { s.viento = pick(h, 'wind_speed_10m', i); s.dir = pick(h, 'wind_direction_10m', i); s.rafaga = pick(h, 'wind_gusts_10m', i); s.vis = pick(h, 'visibility', i); s.pp = pick(h, 'precipitation', i); } else s.fuera = true; }
      if (mh) { const i = idxHora(mh, s.eta); if (i >= 0) { s.ola = mh.wave_height[i]; s.tp = mh.wave_period[i]; s.dola = mh.wave_direction[i]; } }
      s.nivel = nivel(s);
    });
  }
  async function calcular() {
    if (pts.length < 2) return;
    const yo = ++token, par = parTipo();
    if (!par && trazaCache.clave !== JSON.stringify(pts) + '|' + margen) { res.innerHTML = '<p class="sar-cargando">Trazando la ruta por mar…</p>'; await new Promise(r => setTimeout(r, 30)); if (yo !== token) return; }
    // Con rutas tipo se evalúan todas las alternativas; si no, la traza calculada entre los puntos
    const cand = par ? par.d.alternativas.map(a => ({ a, R: muestrear(trazaAlt(a, par.inv)) })) : [{ a: null, R: muestrear(trazar()) }];
    res.innerHTML = `<p class="sar-cargando">Consultando el pronóstico${par ? ` de ${cand.length} alternativas de ruta` : ` en ${cand[0].R.muestras.length} puntos de la ruta`}…</p>`;
    const [al, pu] = await Promise.all([alertasPreventivas(), puertos()]);
    let err = null;
    await Promise.all(cand.map(async c => {
      const dias = Math.min(10, Math.max(2, Math.ceil((c.R.eta - Date.now()) / 864e5) + 1)); let F = null;
      try { F = await pronostico(c.R.muestras, dias); } catch (e) { err = e; }
      aplicarPronostico(c.R, F);
    }));
    if (yo !== token) return;
    let alts = null, elegido = cand[0];
    if (par) {
      alts = cand.map(c => {
        const M = c.R.muestras, cnt = k => M.filter(s => s.nivel === k).length, mx = k => M.reduce((m, s) => s[k] != null && s[k] > m ? s[k] : m, -1);
        const pasos = pasosDe(c.a, c.R), nav = pasos.filter(x => x.prob.some(t => /eslora|calado/.test(t))).length;
        const x = { a: c.a, R: c.R, rojo: cnt('no'), amar: cnt('lim'), sd: cnt('sd'), vmax: mx('viento'), omax: mx('ola'), avisos: cruceAvisos(M).length, pasos, noApta: nav > 0 };
        x.puntaje = (x.noApta ? 1e6 : 0) + x.rojo * 1000 + x.amar * 100 + x.avisos * 150 + c.R.total / c.R.v;   // menor es mejor
        return x;
      });
      const rec = alts.slice().sort((x, y) => x.puntaje - y.puntaje)[0]; alts.forEach(x => { x.recomendada = x === rec; });
      const sel = alts.find(x => x.a.id === altSel) || rec; alts.forEach(x => { x.sel = x === sel; });
      elegido = sel;
    }
    const Rr = elegido.R;
    ultimo = { R: Rr, avisos: cruceAvisos(Rr.muestras), prob: cruceProbables(Rr.muestras, al), pu, est: estacionesCerca(Rr.muestras), err, al, alts, par };
    pintar(); dibujarRuta();
  }

  // ---------------- Presentación
  const COL = { ok: '#2e9d57', lim: '#e0a100', no: '#d32f2f', sd: '#8a939e', tierra: '#7a4b2a' };
  const TXT = { ok: 'favorable', lim: 'precaución', no: 'desfavorable', sd: 'sin datos', tierra: 'sobre tierra' };
  const hf = d => { const q = Object.fromEntries(new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value])); return `${q.weekday.replace('.', '')} ${q.day}/${q.month} ${q.hour}:${q.minute}`; };
  function dibujarRuta() {
    grupo.clearLayers();
    const M = ultimo.R.muestras;
    // alternativas no elegidas: línea delgada punteada
    const COLALT = { interior: '#8e44ad', mixta: '#16a085', oceanica: '#2c6fbb' };
    if (ultimo.alts) ultimo.alts.filter(x => !x.sel).forEach(x => L.polyline(x.R.traza, { color: COLALT[x.a.id] || '#888', weight: 3, opacity: .75, dashArray: '6 7' })
      .bindTooltip(`${escH(x.a.nombre)} · ${nf(x.R.total, 0)} mn · clic para elegirla`, { sticky: true }).on('click', () => { altSel = x.a.id; calcular(); }).addTo(grupo));
    // la ruta se dibuja siguiendo la traza (no en línea recta entre muestras), con el color del tramo
    const tr = ultimo.R.traza, cum = [0]; for (let i = 1; i < tr.length; i++) cum.push(cum[i - 1] + sarMillas(tr[i - 1], tr[i]));
    let k = 0;
    for (let i = 0; i < M.length - 1; i++) {
      if (M[i + 1].mn - M[i].mn < 0.01) continue;
      const seg = [M[i].p]; while (k < tr.length && cum[k] <= M[i].mn + 0.01) k++;
      let j = k; while (j < tr.length && cum[j] < M[i + 1].mn - 0.01) seg.push(tr[j++]);
      seg.push(M[i + 1].p);
      L.polyline(seg, { color: COL[M[i].nivel], weight: 6, opacity: .9 }).addTo(grupo);
    }
    M.forEach(s => L.circleMarker(s.p, { radius: 4, color: '#fff', weight: 1, fillColor: COL[s.nivel], fillOpacity: 1 })
      .bindTooltip(`${hf(s.eta)} · ${nf(s.mn, 0)} mn<br>Viento ${s.viento == null ? '–' : nf(s.viento, 0) + ' kt ' + sarCompas(s.dir)}${s.rafaga != null ? ' (ráfaga ' + nf(s.rafaga, 0) + ')' : ''}<br>Ola ${s.ola == null ? '–' : nf(s.ola, 1) + ' m · ' + nf(s.tp, 0) + ' s ' + sarCompas(s.dola)}<br>${TXT[s.nivel]}`).addTo(grupo));
    dibujarMarcadores();
    const ancho = innerWidth > 1050;   // la ficha tapa la derecha del mapa (o la parte baja en pantallas angostas)
    map.fitBounds(L.latLngBounds([...M.map(s => s.p), ...(ultimo.alts ? ultimo.alts.flatMap(x => x.R.traza.filter((_, i) => i % 10 === 0)) : [])]).pad(0.1), { animate: false, paddingTopLeft: [20, 20], paddingBottomRight: [ancho ? card.offsetWidth + 20 : 20, ancho ? 20 : card.offsetHeight + 20] });
  }
  function dibujarMarcadores() {
    pts.forEach((p, i) => {
      const fin = i === pts.length - 1 && pts.length > 1, ini = i === 0;
      const m = L.marker(p, { draggable: tipo === 'coord' || (!ini && !fin), icon: L.divIcon({ className: '', html: `<div class="ruta-pto ${ini ? 'ini' : fin ? 'fin' : ''}">${ini ? 'Z' : fin ? 'R' : pp[i] ? 'R' + i : i}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) })
        .bindTooltip((ini ? 'Zarpe' : fin ? 'Recalada' : pp[i] ? 'Recalada ' + i : 'Punto ' + i) + (pp[i] ? ': ' + escH(pp[i].n) : '') + (est[i] ? ` · estadía ${nf(est[i], 1)} h` : '')).addTo(grupo);
      m.on('dragend', () => { const q = m.getLatLng(); pts[i] = rutaAlMar([+q.lat.toFixed(4), +q.lng.toFixed(4)]); pp[i] = null; guardar(); sincForm(); calcular(); });
    });
  }
  function perfil(M) {
    const W = 420, H = 120, x = mn => 30 + (W - 40) * mn / Math.max(1, M[M.length - 1].mn);
    const vmax = Math.max(umb.vientoR + 5, ...M.map(s => s.viento || 0)), omax = Math.max(umb.olaR + 1, ...M.map(s => s.ola || 0));
    const yv = v => H - 18 - (H - 30) * v / vmax, yo = v => H - 18 - (H - 30) * v / omax;
    const linea = (f, k) => M.filter(s => s[k] != null).map(s => `${x(s.mn).toFixed(1)},${f(s[k]).toFixed(1)}`).join(' ');
    const bandas = M.slice(0, -1).map((s, i) => `<rect x="${x(s.mn)}" y="${H - 14}" width="${Math.max(1, x(M[i + 1].mn) - x(s.mn))}" height="8" fill="${COL[s.nivel]}"/>`).join('');
    return `<svg class="ruta-perfil" viewBox="0 0 ${W} ${H}" role="img" aria-label="Perfil de viento y ola a lo largo de la ruta">
      <line x1="30" x2="${W - 10}" y1="${yv(umb.vientoA)}" y2="${yv(umb.vientoA)}" stroke="#e0a100" stroke-dasharray="3 3"/><line x1="30" x2="${W - 10}" y1="${yv(umb.vientoR)}" y2="${yv(umb.vientoR)}" stroke="#d32f2f" stroke-dasharray="3 3"/>
      <polyline points="${linea(yv, 'viento')}" fill="none" stroke="#1f6fb2" stroke-width="2"/><polyline points="${linea(yo, 'ola')}" fill="none" stroke="#7b3fb5" stroke-width="2"/>${bandas}
      <text x="30" y="10" font-size="10" fill="#1f6fb2">Viento (kt)</text><text x="110" y="10" font-size="10" fill="#7b3fb5">Ola (m)</text>
      <text x="30" y="${H - 1}" font-size="9" fill="currentColor">0 mn</text><text x="${W - 10}" y="${H - 1}" font-size="9" text-anchor="end" fill="currentColor">${nf(M[M.length - 1].mn, 0)} mn</text></svg>`;
  }
  function pintar() {
    const { R, avisos, prob, pu, est, err } = ultimo, M = R.muestras;
    const peor = ['tierra', 'no', 'lim', 'ok', 'sd'].find(k => M.some(s => s.nivel === k)) || 'sd';
    const tierra = M.some(s => s.tierra), fuera = M.some(s => s.fuera);
    const esc = R.escalas.filter(e => e.mn < R.total - 0.01);
    let h = '';
    const alts = ultimo.alts, selA = alts && alts.find(x => x.sel);
    if (alts) {
      const sem = x => `<span class="ruta-sem" style="background:${COL[x.rojo ? 'no' : x.amar ? 'lim' : x.sd === x.R.muestras.length ? 'sd' : 'ok']}"></span>`;
      h += `<div class="sar-blq ruta-alts"><h3>Alternativas de ruta · ${escH(ultimo.par.d.nombre)}</h3>
        <div class="sar-tabla-scroll"><table class="sar-tabla ruta-tabla-alt"><thead><tr><th></th><th>Alternativa</th><th>mn</th><th>Horas</th><th>Llegada</th><th>Viento máx.</th><th>Ola máx.</th><th>Tramos</th><th>Avisos</th></tr></thead><tbody>` +
        alts.map(x => `<tr class="${x.sel ? 'sel' : ''}" data-alt="${x.a.id}" title="${escH(x.a.resumen)}"><td>${sem(x)}</td><td><b>${escH(x.a.nombre)}</b>${x.recomendada ? ' <span class="ruta-rec-tag">más favorable</span>' : ''}${x.noApta ? ' <span class="ruta-noapta">excede eslora o calado</span>' : ''}</td>` +
          `<td>${nf(x.R.total, 0)}</td><td>${nf(x.R.total / x.R.v, 0)}</td><td>${hf(x.R.eta)}</td><td>${x.vmax < 0 ? '–' : nf(x.vmax, 0) + ' kt'}</td><td>${x.omax < 0 ? '–' : nf(x.omax, 1) + ' m'}</td>` +
          `<td>${x.rojo ? `<b style="color:${COL.no}">${x.rojo} rojo${x.rojo > 1 ? 's' : ''}</b> ` : ''}${x.amar ? `<span style="color:${COL.lim}">${x.amar} amarillo${x.amar > 1 ? 's' : ''}</span>` : ''}${!x.rojo && !x.amar ? (x.sd === x.R.muestras.length ? 'sin datos' : 'sin alertas') : ''}</td><td>${x.avisos}</td></tr>`).join('') +
        `</tbody></table></div>
        <p class="sar-nota"><b>${escH(selA.a.nombre)}:</b> ${escH(selA.a.resumen)} Tramo expuesto: ${selA.a.expuesto.map(e => escH(e[0])).join('; ')}.</p>
        <p class="sar-nota">Clic en una fila (o en la línea punteada del mapa) para ver el detalle de esa alternativa. "Más favorable" pondera tramos en rojo y amarillo, avisos cruzados, restricciones del buque y horas de navegación; es una ayuda, la decisión es del capitán. Fuente: ${escH(ultimo.par.d.fuente)}</p></div>`;
    }
    h += `<div class="sar-blq ruta-resumen" style="border-left:5px solid ${COL[peor]}"><h3>Resumen de la ruta${selA ? ' · ' + escH(selA.a.nombre) : ''}</h3>
      ${buque ? `<p class="ruta-buque-res">Buque: <b class="ruta-nombre-buque">${escH(buque)}</b></p>` : ''}
      <p><b>${nf(R.total, 1)} mn</b> a ${nf(R.v, 1)} kt · <b>${nf(R.total / R.v, 1)} h</b> de navegación${R.espera ? ` + ${nf(R.espera, 1)} h de estadía en puerto` : ''}</p>
      <p>Zarpe ${pZ() ? escH(pZ().n) + ' ' : ''}${hf(R.t0)} → llegada estimada${pR() ? ' a ' + escH(pR().n) : ''} <b>${hf(R.eta)}</b></p>
      ${esc.length ? `<p>Recaladas intermedias: ${esc.map(e => `<b>${escH(e.nombre)}</b> (milla ${nf(e.mn, 0)}, llegada ${hf(e.llegada)}${e.h ? `, zarpe ${hf(e.zarpe)}` : ''})`).join(' · ')}</p>` : ''}
      <p>Condición más exigente en la ruta: <b style="color:${COL[peor]}">${TXT[peor]}</b> · avisos vigentes cruzados: <b>${avisos.length}</b> · avisos probables: <b>${prob.length}</b></p>
      ${!alts && R.total > R.recta + 0.5 ? `<p>La ruta se mantiene${margen ? ` a ${nf(margen, margen % 1 ? 1 : 0)} mn o más de la costa (salvo al salir y llegar a puerto)` : ' por mar'}: ${nf(R.total, 0)} mn (${nf(R.recta, 0)} mn en línea recta entre los puntos marcados).</p>` : ''}
      ${R.sinPaso.length ? `<p class="sar-error">No se encontró paso por mar ${R.sinPaso.length === 1 && pts.length === 2 ? 'entre el zarpe y la recalada' : 'en ' + (R.sinPaso.length === 1 ? 'el tramo ' : 'los tramos ') + R.sinPaso.join(', ')} con la costa incorporada${tierra ? ' (los puntos sobre tierra se marcan en café)' : ''}: agrega puntos intermedios por el paso que corresponda.</p>` : ''}
      ${fuera ? '<p class="sar-error">Parte de la ruta queda fuera del horizonte del pronóstico: esos tramos no tienen datos.</p>' : ''}
      ${err ? '<p class="sar-error">No se pudo obtener el pronóstico en la ruta; se muestran solo avisos, puertos y estaciones.</p>' : ''}
      ${perfil(M)}
      <div class="ruta-export"><button type="button" class="ruta-word">Descargar informe Word</button><button type="button" class="ruta-pdf">Imprimir o guardar PDF</button></div></div>`;
    // Pasos con restricción de la alternativa elegida (Derrotero)
    if (selA && selA.pasos.length) h += `<div class="sar-blq"><h3>Canales, pasos y angosturas con restricción</h3>` + selA.pasos.map(x =>
      `<p><b>${escH(x.q.n)}</b> · carta ${escH(x.q.carta)} · milla ${nf(x.mn, 0)} · paso estimado <b>${hf(x.eta)}</b> ${x.q.luz ? `<span class="sar-pill" style="background:${x.dia ? '#2e9d57' : '#d32f2f'}">${x.dia ? 'de día' : 'de noche'}</span>` : ''}` +
      `${x.prob.length ? `<br><span class="sar-error">Atención: ${escH(x.prob.join('; '))}.</span>` : ''}<br><small>${escH(x.q.nota)} (${escH(x.q.ref)})</small></p>`).join('') +
      `<p class="sar-nota">${eslora || calado ? '' : 'Ingresa la eslora y el calado del buque para compararlos con los máximos. '}Restricciones de la tabla "Información operacional y restricciones en canales, pasos y angosturas" del Derrotero de la Costa de Chile. La navegación por canales exige práctico o capitán habilitado según la reglamentación vigente. Estoas y corrientes: no se calculan aquí.</p></div>`;
    // Tabla por punto de la ruta
    h += `<details class="sar-blq ruta-cond"${condAbierta ? ' open' : ''}><summary><h3>Condiciones a la hora de paso</h3><span class="ruta-cond-n">${M.length} puntos de la ruta · ${condAbierta ? 'ocultar' : 'desplegar'}</span></summary><div class="sar-tabla-scroll"><table class="sar-tabla ruta-tabla"><thead><tr><th>Hora</th><th>mn</th><th>Posición</th><th>Viento</th><th>Ola</th><th>Vis.</th><th></th></tr></thead><tbody>` +
      M.map(s => `<tr><td>${hf(s.eta)}</td><td>${nf(s.mn, 0)}</td><td>${s.puerto ? `<b>${escH(s.puerto)}</b><br>` : ''}${fmtPos(s.p)}</td><td>${s.viento == null ? '–' : `${sarCompas(s.dir)} ${nf(s.viento, 0)}${s.rafaga != null ? `<small> (${nf(s.rafaga, 0)})</small>` : ''}`}</td>` +
        `<td>${s.ola == null ? '–' : `${nf(s.ola, 1)} m<small> ${nf(s.tp, 0)} s ${sarCompas(s.dola)}</small>`}</td><td>${s.vis == null ? '–' : nf(Math.min(s.vis / 1852, 10), 1) + (s.vis / 1852 >= 10 ? '+' : '')} mn</td>` +
        `<td><span class="ruta-sem" style="background:${COL[s.nivel]}" title="${TXT[s.nivel]}"></span></td></tr>`).join('') +
      `</tbody></table></div><p class="sar-nota">Viento en kt con ráfaga entre paréntesis (ECMWF IFS; si falta, GFS). Ola: altura significativa, período y dirección de procedencia (Météo-France). Hora de Chile.</p></details>`;
    // Avisos vigentes
    h += `<div class="sar-blq"><h3>Avisos vigentes a la hora de paso</h3>` + (avisos.length ? avisos.map(x =>
      `<p><span class="sar-pill sar-V">Vigente</span> <b>${escH(x.a.tipo)}</b> · ${escH(x.z.nombre)}<br><small>Entre las millas ${nf(x.desde, 0)} y ${nf(x.hasta, 0)} de la ruta (paso ${hf(x.t1)} a ${hf(x.t2)}) · aviso hasta ${hf(x.e.fin)}</small></p>`).join('')
      : '<p>La ruta no cruza avisos vigentes a la hora de paso (radio de 3 mn).</p>') + '</div>';
    // Avisos probables
    h += `<div class="sar-blq"><h3>Avisos probables (alertas preventivas)</h3>` + (prob.length ? prob.map(x =>
      `<p><span class="sar-pill" style="background:${x.tipo === 'v' ? '#1f6fb2' : '#7b3fb5'}">${x.tipo === 'v' ? 'Viento' : 'Marejadas'}</span> <b>${escH(x.nom)}</b> · ${escH(x.zona)} · ${sarFmtDia(x.fecha + 'T12:00')}<br><small>Entre las millas ${nf(x.desde, 0)} y ${nf(x.hasta, 0)}${x.rango ? ` · ${x.tipo === 'v' ? 'viento' : 'altura'} ${nf(x.rango[0], x.tipo === 'v' ? 0 : 1)} a ${nf(x.rango[1], x.tipo === 'v' ? 0 : 1)} ${x.tipo === 'v' ? 'kt' : 'm'}` : ''}${x.pers ? ` · persistencia ${x.pers[0]}/${x.pers[1]} corridas` : ''}</small></p>`).join('')
      : '<p>Sin alertas preventivas de viento (5 días) ni de marejadas (10 días) en la ruta para las fechas de paso.</p>') +
      '<p class="sar-nota">Estimación automática de MeteoIA con los criterios de la PD OPE-07 (viento) y la O.P.I. N° 1107 (marejadas); no son avisos oficiales.</p></div>';
    // Puertos
    const pblq = (t, x) => !x ? `<p><b>${t}:</b> sin bahía SITPORT a menos de 12 mn.</p>` : `<p><b>${t}:</b> ${escH(x.nombre)} · ${x.lista.length ? `<span class="sar-pill sar-V">${x.lista.length} restricci${x.lista.length === 1 ? 'ón' : 'ones'}</span><br><small>${x.lista.map(r => escH(ctx.txtSitport(r.MotivoRestriccion) + (r.NaveRecibe ? ' · ' + ctx.txtSitport(r.NaveRecibe) : ''))).join('<br>')}</small>` : '<span class="sar-pill" style="background:#2e9d57">sin restricciones</span>'}</p>`;
    h += `<div class="sar-blq"><h3>Puertos (SITPORT)</h3>${pu ? pu.lista.map(o => pblq(o.rol, o.nada ? null : o)).join('') + `<p class="sar-nota">${pu.vivo ? 'Consultado en vivo.' : 'Copia publicada del ' + hf(new Date(pu.actualizado)) + '.'} Restricciones actuales: pueden cambiar antes del zarpe o de la llegada.</p>` : '<p>SITPORT no disponible.</p>'}</div>`;
    // Estaciones
    h += `<div class="sar-blq"><h3>Estaciones cercanas a la ruta (≤ 15 mn)</h3>` + (est.length ? est.map(({ s, d, mn }) =>
      `<p><b>${escH(ctx.nombreEst(s))}</b> · milla ${nf(mn, 0)} · a ${nf(d, 0)} mn<br>${s.vel != null ? nf(s.vel, 0) + ' kt' : '–'} ${s.dirG != null ? sarCompas(s.dirG) : ''}${s.temp != null ? ' · ' + nf(s.temp, 1) + ' °C' : ''}</p>`).join('')
      : '<p>Sin estaciones operativas a menos de 15 mn de la ruta.</p>') + '</div>';
    // Umbrales
    h += `<details class="sar-umbrales"><summary>Umbrales del semáforo (editables)</summary><p class="sar-nota">Iguales para toda embarcación. Amarillo = precaución, rojo = desfavorable; las ráfagas sobre 1,3 veces el viento rojo también marcan rojo. Se guardan solo en este navegador.</p>
      <table><thead><tr><th></th><th>Amarillo</th><th>Rojo</th></tr></thead><tbody>
      <tr><td>Viento (kt)</td><td><input class="sar-umbral" data-k="vientoA" value="${umb.vientoA}"></td><td><input class="sar-umbral" data-k="vientoR" value="${umb.vientoR}"></td></tr>
      <tr><td>Ola (m)</td><td><input class="sar-umbral" data-k="olaA" value="${String(umb.olaA).replace('.', ',')}"></td><td><input class="sar-umbral" data-k="olaR" value="${String(umb.olaR).replace('.', ',')}"></td></tr>
      <tr><td>Visibilidad menor a (mn)</td><td><input class="sar-umbral" data-k="visA" value="${String(umb.visA).replace('.', ',')}"></td><td><input class="sar-umbral" data-k="visR" value="${String(umb.visR).replace('.', ',')}"></td></tr>
      </tbody></table><button type="button" class="sar-restablecer">Restablecer valores iniciales</button></details>
      <p class="sar-nota">Herramienta de apoyo en validación: no reemplaza la carta náutica, los avisos oficiales ni el criterio del capitán. La traza evita la tierra según la costa incorporada, de escala aproximada: no evalúa profundidades, bajos, obstáculos ni dispositivos de tráfico; verifícala en la carta náutica.</p>`;
    res.innerHTML = h;
    res.querySelector('.ruta-word').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(rutaDocx(informe())); a.download = nombreInforme() + '.docx'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };
    res.querySelector('.ruta-pdf').onclick = () => { const u = URL.createObjectURL(new Blob([rutaHtmlInforme(informe())], { type: 'text/html' })); const w = window.open(u, '_blank'); if (!w) location.href = u; setTimeout(() => URL.revokeObjectURL(u), 60000); };
    res.querySelectorAll('.ruta-tabla-alt tr[data-alt]').forEach(tr => tr.onclick = () => { if (altSel !== tr.dataset.alt || !tr.classList.contains('sel')) { altSel = tr.dataset.alt; calcular(); } });
    const cd = res.querySelector('.ruta-cond'); if (cd) cd.addEventListener('toggle', () => { condAbierta = cd.open; cd.querySelector('.ruta-cond-n').textContent = `${M.length} puntos de la ruta · ${cd.open ? 'ocultar' : 'desplegar'}`; });
    res.querySelectorAll('.sar-umbral').forEach(inp => inp.onchange = () => { const v = parseFloat(inp.value.replace(',', '.')); if (isFinite(v)) { umb[inp.dataset.k] = v; guardarUmb(); M.forEach(s => s.nivel = nivel(s)); pintar(); dibujarRuta(); } });
    const rb = res.querySelector('.sar-restablecer'); if (rb) rb.onclick = () => { umb = { ...RUTA_UMBRALES_BASE }; guardarUmb(); M.forEach(s => s.nivel = nivel(s)); pintar(); dibujarRuta(); };
  }

  // ---------------- Informe (Word o impresión): mismos datos de la ficha
  const extremo = fin => { const p = fin ? pts[pts.length - 1] : pts[0], x = fin ? pR() : pZ(); return x ? `${x.n} (${fmtPos(p)})` : fmtPos(p); };
  const corto = fin => { const x = fin ? pR() : pZ(), p = fin ? pts[pts.length - 1] : pts[0]; return x ? x.n : fmtPos(p); };
  function nombreInforme() {
    const sl = t => normP(t).replace(/ /g, '_').slice(0, 30) || 'punto';
    return `ruta_${buque ? sl(buque) + '_' : ''}${sl(corto(false))}_a_${sl(corto(true))}_${sarHoraLocal(new Date()).slice(0, 10)}`;
  }
  function informe() {
    const { R, avisos, prob, pu, est, err } = ultimo, M = R.muestras;
    const peor = ['tierra', 'no', 'lim', 'ok', 'sd'].find(k => M.some(s => s.nivel === k)) || 'sd';
    const n0 = v => v == null ? '–' : nf(v, 0), n1 = v => v == null ? '–' : nf(v, 1);
    const datos = [];
    if (buque) datos.push(['Buque o embarcación', buque]);
    datos.push(['Zarpe', extremo(false)]);
    const esc = R.escalas.filter(e => e.mn < R.total - 0.01);
    if (esc.length) datos.push(['Recaladas intermedias', esc.map(e => `${e.nombre}: milla ${nf(e.mn, 0)}, llegada ${hf(e.llegada)}${e.h ? `, estadía ${nf(e.h, 1)} h, zarpe ${hf(e.zarpe)}` : ''}`).join(' · ')]);
    datos.push([esc.length ? 'Recalada final' : 'Recalada', extremo(true)]);
    const medios = pts.slice(1, -1).map((p, i) => pp[i + 1] ? null : `${i + 1}: ${fmtPos(p)}`).filter(Boolean);
    if (medios.length) datos.push(['Puntos intermedios', medios.join(' · ')]);
    datos.push(['Hora de zarpe', hf(R.t0) + ' (hora Chile)'], ['Velocidad', nf(R.v, 1) + ' kt'], ['Distancia mínima a la costa', margen ? nf(margen, margen % 1 ? 1 : 0) + ' mn (salvo al salir y llegar a puerto)' : 'sin margen (solo evita tierra)'],
      ['Distancia', `${nf(R.total, 1)} mn por mar` + (R.total > R.recta + 0.5 ? ` (${nf(R.recta, 1)} mn en línea recta entre los puntos marcados)` : '')],
      ['Duración estimada', nf(R.total / R.v, 1) + ' h de navegación' + (R.espera ? ` + ${nf(R.espera, 1)} h de estadía en puerto` : '')], ['Llegada estimada', hf(R.eta) + ' (hora Chile)'],
      ['Condición más exigente', TXT[peor]], ['Avisos vigentes cruzados', String(avisos.length)], ['Avisos probables', String(prob.length)],
      ['Pronóstico', err ? 'No disponible al generar el informe' : 'Open-Meteo: viento ECMWF IFS (respaldo GFS), oleaje Météo-France']);
    if (R.sinPaso.length) datos.push(['Advertencia', 'Hay tramos sin paso por mar en la costa incorporada; revisar la traza.']);
    const sec = [], alts = ultimo.alts, selA = alts && alts.find(x => x.sel);
    if (alts) {
      datos.splice(buque ? 1 : 0, 0, ['Alternativa elegida', selA.a.nombre + (selA.recomendada ? ' (la más favorable)' : '')]);
      sec.push({ titulo: 'Alternativas de ruta · ' + ultimo.par.d.nombre, tabla: { cab: ['Alternativa', 'mn', 'Horas', 'Llegada', 'Viento máx.', 'Ola máx.', 'Tramos en rojo', 'Tramos en amarillo', 'Avisos cruzados', 'Observación'], anchos: [1.8, .5, .5, 1.1, .7, .7, .6, .7, .6, 1.4],
        filas: alts.map(x => [x.a.nombre, n0(x.R.total), n0(x.R.total / x.R.v), hf(x.R.eta), x.vmax < 0 ? '–' : n0(x.vmax) + ' kt', x.omax < 0 ? '–' : n1(x.omax) + ' m', String(x.rojo), String(x.amar), String(x.avisos), [x.sel ? 'elegida' : '', x.recomendada ? 'más favorable' : '', x.noApta ? 'excede eslora o calado' : ''].filter(Boolean).join('; ')]) },
        parrafos: alts.map(x => `${x.a.nombre}: ${x.a.resumen} Tramo expuesto: ${x.a.expuesto.map(e => e[0]).join('; ')}.`), nota: 'Fuente: ' + ultimo.par.d.fuente });
      if (selA.pasos.length) sec.push({ titulo: 'Canales, pasos y angosturas con restricción', tabla: { cab: ['Paso', 'Carta', 'Milla', 'Paso estimado', 'Luz', 'Atención', 'Restricción (Derrotero)'], anchos: [1.2, .5, .4, 1, .5, 1.4, 3.4],
        filas: selA.pasos.map(x => [x.q.n, x.q.carta, n0(x.mn), hf(x.eta), x.q.luz ? (x.dia ? 'de día' : 'de noche') : '–', x.prob.join('; ') || '–', x.q.nota + ' (' + x.q.ref + ')']) },
        nota: (eslora || calado ? `Buque: ${eslora ? 'eslora ' + nf(eslora, 0) + ' m' : ''}${eslora && calado ? ', ' : ''}${calado ? 'calado ' + nf(calado, 1) + ' m' : ''}. ` : '') + 'La navegación por canales exige práctico o capitán habilitado. Estoas y corrientes no calculadas.' });
    }
    sec.push({ titulo: 'Condiciones a la hora de paso', tabla: { cab: ['Hora', 'mn', 'Posición', 'Viento', 'Ráfaga (kt)', 'Ola (m)', 'Período (s)', 'Dir. ola', 'Visibilidad (mn)', 'Estado'], anchos: [1.3, .5, 2, 1, .8, .7, .8, .7, 1, 1],
      filas: M.map(s => [hf(s.eta), n0(s.mn), (s.puerto ? s.puerto + ' · ' : '') + fmtPos(s.p), s.viento == null ? '–' : `${sarCompas(s.dir)} ${n0(s.viento)} kt`, n0(s.rafaga), n1(s.ola), n0(s.tp), s.dola == null ? '–' : sarCompas(s.dola), s.vis == null ? '–' : nf(Math.min(s.vis / 1852, 10), 1) + (s.vis / 1852 >= 10 ? '+' : ''), TXT[s.nivel]]) },
      nota: 'Viento a 10 m; dirección de procedencia. Ola: altura significativa, período y dirección de procedencia. Hora de Chile.' });
    sec.push(avisos.length ? { titulo: 'Avisos vigentes a la hora de paso', tabla: { cab: ['Aviso', 'Zona', 'Millas de la ruta', 'Paso por la zona', 'Vigente hasta'], anchos: [1.4, 1.6, .9, 1.6, 1],
      filas: avisos.map(v => [v.a.tipo, v.z.nombre, `${n0(v.desde)} a ${n0(v.hasta)}`, `${hf(v.t1)} a ${hf(v.t2)}`, hf(v.e.fin)]) } }
      : { titulo: 'Avisos vigentes a la hora de paso', parrafos: ['La ruta no cruza avisos vigentes a la hora de paso (radio de 3 mn).'] });
    sec.push({ titulo: 'Avisos probables (alertas preventivas)', parrafos: prob.length ? [] : ['Sin alertas preventivas de viento (5 días) ni de marejadas (10 días) en la ruta para las fechas de paso.'],
      tabla: { cab: ['Tipo', 'Categoría', 'Zona', 'Fecha', 'Millas de la ruta', 'Rango'], anchos: [.8, 1.2, 1.6, 1, .9, 1],
        filas: prob.map(v => [v.tipo === 'v' ? 'Viento' : 'Marejadas', v.nom, v.zona, sarFmtDia(v.fecha + 'T12:00'), `${n0(v.desde)} a ${n0(v.hasta)}`, v.rango ? `${nf(v.rango[0], v.tipo === 'v' ? 0 : 1)} a ${nf(v.rango[1], v.tipo === 'v' ? 0 : 1)} ${v.tipo === 'v' ? 'kt' : 'm'}` : '–']) },
      nota: 'Estimación automática de MeteoIA con los criterios de la PD OPE-07 (viento) y la O.P.I. N° 1107 (marejadas); no son avisos oficiales.' });
    const fp = (t, v) => !v ? [t, 'Sin bahía SITPORT a menos de 12 mn', '–'] : [t, v.nombre, v.lista.length ? v.lista.map(r => ctx.txtSitport(r.MotivoRestriccion) + (r.NaveRecibe ? ' · ' + ctx.txtSitport(r.NaveRecibe) : '')).join(' / ') : 'Sin restricciones'];
    sec.push(pu ? { titulo: 'Puertos (SITPORT)', tabla: { cab: ['', 'Bahía', 'Restricciones'], anchos: [.6, 1.4, 4], filas: pu.lista.map(o => fp(o.rol, o.nada ? null : o)) },
      nota: (pu.vivo ? 'Consultado en vivo.' : 'Copia publicada del ' + hf(new Date(pu.actualizado)) + '.') + ' Restricciones vigentes al generar el informe: pueden cambiar antes del zarpe o de la llegada.' }
      : { titulo: 'Puertos (SITPORT)', parrafos: ['SITPORT no disponible al generar el informe.'] });
    sec.push(est.length ? { titulo: 'Estaciones cercanas a la ruta (15 mn o menos)', tabla: { cab: ['Estación', 'Milla de la ruta', 'Distancia (mn)', 'Viento observado', 'Temperatura'], anchos: [1.6, .8, .8, 1, .8],
      filas: est.map(({ s, d, mn }) => [ctx.nombreEst(s), n0(mn), n0(d), s.vel != null ? `${n0(s.vel)} kt ${s.dirG != null ? sarCompas(s.dirG) : ''}`.trim() : '–', s.temp != null ? nf(s.temp, 1) + ' °C' : '–']) },
      nota: 'Última observación disponible al generar el informe.' } : { titulo: 'Estaciones cercanas a la ruta (15 mn o menos)', parrafos: ['Sin estaciones operativas a menos de 15 mn de la ruta.'] });
    sec.push({ titulo: 'Umbrales del semáforo', tabla: { cab: ['Variable', 'Precaución (amarillo)', 'Desfavorable (rojo)'], filas: [['Viento', `≥ ${nf(umb.vientoA, 0)} kt`, `≥ ${nf(umb.vientoR, 0)} kt`], ['Ola', `≥ ${nf(umb.olaA, 1)} m`, `≥ ${nf(umb.olaR, 1)} m`], ['Visibilidad', `< ${nf(umb.visA, 1)} mn`, `< ${nf(umb.visR, 1)} mn`]] } });
    sec.push({ titulo: 'Advertencia', parrafos: ['Herramienta de apoyo en validación: no reemplaza la carta náutica, los avisos oficiales ni el criterio del capitán. La traza evita la tierra según una costa de escala aproximada; no evalúa profundidades, bajos, obstáculos ni dispositivos de tráfico.'] });
    return { titulo: 'Ruta de navegación' + (buque ? ' · ' + buque : ''), subtitulo: `${[corto(false), ...esc.map(e => e.nombre), corto(true)].join(' → ')} · MeteoIA · generado el ${hf(new Date())} (hora Chile)`, datos, secciones: sec };
  }

  function abrir() {
    card.hidden = false; wrap.classList.add('sar-abierto'); grupo.addTo(map);
    const lb = document.getElementById('layerBox'); if (lb && !lb.classList.contains('min')) { lb.classList.add('min'); const bt = document.getElementById('lbBtn'); if (bt) bt.textContent = '▴'; }
    ponerTipo(tipo);
    if (pts.length >= 2) { if (!ultimo) calcular(); else { pintar(); dibujarRuta(); } } else { dibujarPuntos(); if (tipo === 'coord') modoMarcar(true); }
  }
  function cerrar() { card.hidden = true; wrap.classList.remove('sar-abierto'); modoMarcar(false); map.removeLayer(grupo); }
  return { abrir, cerrar, get abierto() { return !card.hidden; } };
}
