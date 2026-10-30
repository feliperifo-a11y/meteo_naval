// ============================ Trombas marinas: perspectiva 0–72 h y ficha técnica (página Desarrollo) ============================
// Lee data/trombas.json (scripts/trombas.py): STP (hemisferio sur), ambiente HSLC y NST calculados sobre el océano con el GFS 0,25°,
// e ingredientes del nomograma de Szilagyi. Estimación experimental: no constituye aviso. Toda cifra de la ficha lleva su fuente.
function crearTrombas(L, map, h) {
  const escH = h.escH;
  const nf = (v, d = 1) => v == null ? '–' : Number(v).toFixed(d).replace('.', ',');
  const horaChile = iso => new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
  const hhChile = iso => new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false });
  const diaChile = iso => new Date(iso).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: 'numeric' }).replace('.', '');
  const dm = (v, pos, neg) => { const t = Math.round(Math.abs(v) * 60), g = Math.floor(t / 60), mi = t - g * 60; return `${g}°${String(mi).padStart(2, '0')}′ ${v < 0 ? neg : pos}`; };
  const COLOR = { stp: '#b3149a', hslc: '#f28c00', nst: '#1f6fb2' };
  const grupo = L.layerGroup();
  let datos = null, sel = null, cargado = 0;
  // Probabilidad por zona (GEFS, data/trombas_prob.json)
  const grupoZona = L.layerGroup();
  let prob = null, indProb = 'stp', celdaProb = null;
  const NOMBRE_IND = { stp: 'STP ≤ −0,1', hslc: 'Alto cizalle y CAPE bajo', nst: 'NST > 1 (sin validar en Chile)' };
  const claseP = v => v == null ? '' : v >= 80 ? 'p4' : v >= 50 ? 'p3' : v >= 20 ? 'p2' : v > 0 ? 'p1' : 'p0';
  const diaLargo = f => new Date(f + 'T12:00:00Z').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).replace('.', '');
  const card = document.createElement('section');
  card.className = 'card mar-card tr-card'; card.id = 'trombas'; card.hidden = true;
  card.innerHTML = `<div class="mar-cab"><h2>Trombas marinas · zonas III a V · 72 h</h2><span class="mar-etq tr-etq">Experimental · no constituye aviso</span>
      <button type="button" class="mar-min" aria-label="Minimizar panel" title="Minimizar / ampliar">▾</button><button type="button" class="mar-cerrar" aria-label="Cerrar panel">✕</button></div>
    <h3 class="tr-h">Probabilidad por zona · ensamble GEFS</h3>
    <p class="mar-sub tr-psub" aria-live="polite">Cargando…</p>
    <div class="ev-tabs tr-ptabs" role="tablist">${Object.entries(NOMBRE_IND).map(([k, t]) => `<button type="button" role="tab" data-i="${k}" aria-selected="${k === 'stp'}">${t}</button>`).join('')}</div>
    <div class="tr-ptabla"></div>
    <div class="mar-ley tr-pley"><span><i class="tr-p0"></i>0 %</span><span><i class="tr-p1"></i>1–19</span><span><i class="tr-p2"></i>20–49</span><span><i class="tr-p3"></i>50–79</span><span><i class="tr-p4"></i>80–100 %</span></div>
    <div class="mar-det tr-pdet" aria-live="polite"><p class="mar-ayuda">Porcentaje de los miembros del ensamble en que al menos un punto de la zona supera el umbral durante el día (hora de Chile). Selecciona una casilla para ver el detalle cada 6 h.</p></div>
    <h3 class="tr-h">Detalle por celda · GFS 0,25° (una corrida, sin probabilidad)</h3>
    <p class="mar-sub tr-sub" aria-live="polite">Cargando…</p>
    <div class="tr-tira"></div>
    <div class="mar-ley tr-ley"><span><i style="background:${COLOR.stp}"></i>STP ≤ −0,1</span><span><i style="background:${COLOR.hslc}"></i>Alto cizalle y CAPE bajo</span><span><i style="background:${COLOR.nst}"></i>NST &gt; 1</span><span>número = celdas de 0,25° sobre umbral</span></div>
    <div class="mar-det tr-det" aria-live="polite"><p class="mar-ayuda">Selecciona un plazo para ver en el mapa las celdas que superan algún umbral.</p></div>
    <p class="mar-nota">Índices calculados sobre el océano con el GFS 0,25°, dominio 20°–56° S / 85°–68° W. Los umbrales vienen de estudios de tornados chilenos en tierra (Marín et al., 2024 y 2026) y del NST del SPC: aún no están calibrados para trombas. El GFS no resuelve la vorticidad de escala local, por lo que el NST rara vez supera su umbral.</p>
    <h3 class="tr-h">Ficha técnica</h3>

    <h3 class="tr-h">Dos mecanismos, dos juegos de parámetros</h3>
    <ul class="tr-l">
      <li><b>Frontal o postfrontal (mesociclónica).</b> Nace de convección organizada en ambiente de alto cizalle y CAPE bajo (HSLC). Es el caso típico de los avisos entre Maule y Los Lagos.</li>
      <li><b>De buen tiempo (no mesociclónica).</b> Se forma desde la superficie cuando un cúmulo en crecimiento estira un vórtice preexistente. Requiere cizalle débil, inestabilidad en capas bajas y vorticidad en superficie.</li>
    </ul>

    <h3 class="tr-h">Índices propuestos</h3>
    <div class="ev-tw"><table class="ev-tabla tr-tabla">
      <thead><tr><th>Tipo</th><th>Índice e ingredientes</th><th>Umbral de referencia</th><th>Fuente</th></tr></thead>
      <tbody>
        <tr><th>Frontal / postfrontal</th><td><b>STP</b> (versión hemisferio sur): MLCAPE, MLLCL, MLCIN, SRH 0–500 m con movimiento Bunkers izquierdo, cizalle efectivo</td><td>STP ≤ −0,1 (máximos de los 16 tornados notables entre −0,1 y −0,9)</td><td>Marín et al. (2024)</td></tr>
        <tr><th></th><td><b>Alto cizalle y CAPE bajo (HSLC)</b>: SHERBE (cizalle efectivo, gradientes 0–3 km y 700–500 hPa) con cizalle efectivo y CAPE</td><td>SHERBE ≥ 1, cizalle efectivo &gt; 18 m/s y MUCAPE &lt; 1000 J/kg (MeteoIA exige además MUCAPE &gt; 0)</td><td>Marín et al. (2026)</td></tr>
        <tr><th></th><td><b>VGP</b>: cizalle 0–1 km × √CAPE; y <b>base de nube</b> (LCL)</td><td>Sin umbral publicado; se muestran como referencia</td><td>Caballero-Morán y Rondanelli (2025); Marín et al. (2026)</td></tr>
        <tr class="ev-sep"><th>Convectiva general</th><td><b>SWI</b> (nomograma de Szilagyi): ΔT = TSM − T850; ΔZ = EL − LCL; viento en 850 hPa</td><td>SWI ≥ 0; viento 850 hPa ≤ 40 kt</td><td>Szilagyi (2009)</td></tr>
        <tr class="ev-sep"><th>Buen tiempo</th><td><b>NST</b>: gradiente 0–1 km, MLCAPE 0–3 km, MLCIN, cizalle 0–6 km, vorticidad relativa en superficie (signo invertido en el hemisferio sur)</td><td>NST &gt; 1 (sin validación en Chile) · gradiente 0–1 km &gt; 9 °C/km · MLCAPE 0–3 km &gt; 100 J/kg · MLCIN &gt; −25 J/kg · vorticidad &gt; 8×10⁻⁵ s⁻¹ · cizalle 0–6 km ≤ 25 kt (necesario ≤ 35 kt)</td><td>NWS WDTD (2023)</td></tr>
      </tbody></table></div>

    <details class="mar-crit" open><summary>Ambiente de los tornados chilenos (Marín et al., 2024)</summary><div>
      <p>16 tornados notables entre 1981 y 2021 (San Carlos, Villarrica, Los Ángeles, Concepción, Puerto Montt, Toltén, entre otros), analizados con ERA5. Valores aproximados leídos de las figuras 2 y 3 del artículo: corresponden a los <b>máximos dentro de una caja de 0,5° × 0,5°</b>, no a valores puntuales.</p>
      <ul>
        <li><b>MLCAPE</b> (capa mezclada 100 hPa): aumenta desde T−12 h; algunos casos superan 400 J/kg.</li>
        <li><b>EBSMU</b> (cizalle efectivo de la parcela más inestable): media cercana a 20 m/s (≈ 39 kt) en la hora del reporte.</li>
        <li><b>Gradiente 0–3 km</b>: entre −6 y −7 K/km. <b>Gradiente 700–500 hPa</b>: más intenso que −6 K/km.</li>
        <li><b>SRH 0–500 m</b> (Bunkers izquierdo): media cercana a −200 m²/s², con máximo unas <b>15 h antes</b> del tornado, mientras CAPE, cizalle y STP lo alcanzan cerca de la hora del evento.</li>
        <li><b>STP</b>: máximos entre −0,1 y −0,9. Discrimina lugar y momento mejor que SHERBE, que da señales falsas sobre la cordillera.</li>
        <li>Temporada favorable: mayo a agosto. Zonas con más días de STP ≤ −0,3: entre la Cordillera de la Costa y los Andes cerca de 38° S, e isla de Chiloé, donde hay reportes de trombas.</li>
      </ul>
      <p><b>Limitación.</b> Los 16 casos son tornados sobre tierra y los umbrales se evaluaron con máscara continental. El artículo señala que la estacionalidad de las trombas no calza tan bien con el STP y lo deja como tema pendiente. Para trombas, estos umbrales son una referencia sin calibrar.</p>
    </div></details>

    <details class="mar-crit"><summary>Lo que dicen los estudios chilenos sobre el CAPE</summary><div><ul>
      <li><b>El CAPE por sí solo no discrimina.</b> En 40 tornados chilenos (1980–2023), más de la mitad ocurrió con MUCAPE de 0 a 400 J/kg y casi siempre bajo 500; los autores no encuentran un umbral de CAPE útil (Marín et al., 2026).</li>
      <li><b>Manda el cizalle.</b> En la simulación de los tornados de mayo de 2019, quitar relieve debilitó el chorro de bajo nivel y redujo cizalle y helicidad; calentar el mar 2 K aumentó el CAPE, sobre todo mar afuera, pero no compensó la pérdida de cizalle (Marín et al., 2021).</li>
      <li><b>Valores típicos en Chile:</b> cizalle efectivo 16–18 m/s, helicidad 0–500 m de 50 a 150 m²/s² en magnitud, base de nube media de unos 300 m, y STP = 0 en cerca de la mitad de los casos (Marín et al., 2026).</li>
      <li><b>Rayos:</b> al menos 65 % de las tormentas tornádicas tuvo actividad eléctrica; el número de rayos se correlacionó más con SHERBE (r = 0,59) que con el CAPE (r = 0,31) (Marín et al., 2026).</li>
      <li><b>Temporada:</b> en el centro-sur, de mediados de mayo a mediados de junio, reproducida con el VGP; en la zona austral (47,5°–54° S) hay condiciones favorables en diciembre y enero, sin registros (Caballero-Morán y Rondanelli, 2025).</li>
      <li>No hay estudios chilenos específicos de trombas marinas: todos analizan tornados en tierra.</li>
    </ul></div></details>

    <details class="mar-crit"><summary>Diferencias a nivel del mar</summary><div><ul>
      <li>Nivel de condensación bajo: favorece el término LCL del STP.</li>
      <li>La inestabilidad en capas bajas depende del aire frío postfrontal sobre agua más cálida: ΔT (TSM − T850) es más informativo que el gradiente 0–3 km genérico.</li>
      <li>En el caso de Concepción (31 mayo 2019), la señal de STP negativo apareció primero sobre el océano adyacente, unas 12 h antes, y luego se extendió a la costa.</li>
      <li>Mar adentro se debilita el refuerzo del chorro de bajo nivel por bloqueo andino, que explicó parte del cizalle en 2019.</li>
    </ul></div></details>

    <details class="mar-crit"><summary>Validación del método de Szilagyi</summary><div><ul>
      <li>Desarrollado con 172 eventos en 21 años en los Grandes Lagos; ΔT y ΔZ resultaron los mejores correladores entre 14 parámetros.</li>
      <li>Adriático 2010: el nomograma acertó 14 de 19 casos (73,7 %).</li>
      <li>Adriático, WRF a 500 m: el SWI acertó casi todos los casos; falló uno invernal con nube poco profunda (ΔZ 2,5 km) y cizalle 0–1 km alto (16 m/s). Ese tipo de caso se parece al ambiente HSLC chileno.</li>
    </ul></div></details>

    <details class="mar-crit"><summary>Dónde obtener los datos</summary><div><ul>
      <li><b>GFS 0,25° (NOMADS):</b> CAPE y CIN 180-0 mb (parcela más inestable) y 90-0 mb (capa mezclada), HLCY 0–3000 m (Bunkers; no equivale al SRH 0–500 m con movimiento izquierdo), temperatura, viento y humedad por niveles (975, 950, 925, 900 hPa…), temperatura de superficie.</li>
      <li><b>ECMWF IFS open data (CC-BY-4.0):</b> MUCAPE. Sirve para el patrón sinóptico; tiene pocos niveles en la capa límite para SRH 0–500 m.</li>
      <li><b>WRF 3 km:</b> todos los niveles del modelo; la mejor base para los cuatro índices en la franja costera.</li>
      <li><b>TSM:</b> NASA GIBS MUR (ya en el sitio) o temperatura de superficie del GFS sobre el océano.</li>
      <li><b>Calibración:</b> ERA5 (Copernicus CDS), la misma base del artículo de Marín et al.</li>
      <li><b>Cálculo:</b> MetPy (Python) o thundeR (R, el paquete usado por Marín et al.; calcula el STP para el hemisferio norte por defecto).</li>
      <li><b>Dominio de referencia:</b> 20°–56° S, 85°–68° W (ERA5 en Marín et al.), sin máscara continental para incluir el océano.</li>
    </ul></div></details>

    <details class="mar-crit"><summary>Próximos pasos</summary><div><ul>
      <li>Calcular STP (HS), SHERBE, SWI y NST cada 3 h desde GFS 0,25°, y luego desde WRF.</li>
      <li>Reunir casos chilenos de trombas con hora conocida (avisos SERVIMET, reportes visuales) y verificar los umbrales contra ellos.</li>
      <li>Mostrar en el mapa solo las celdas que superen el umbral, con hora de corrida y de validez.</li>
    </ul></div></details>

    <details class="mar-crit"><summary>Referencias</summary><div><ul class="tr-ref">
      <li>Marín, J. C., Barrett, B. S., Gutiérrez Cotapos, F. y Pozo, D. (2026). Mesoscale environments of tornadoes in Chile and along the U.S. west coast. <i>Atmospheric Research</i>, 344, 109331. <a href="https://doi.org/10.1016/j.atmosres.2026.109331" target="_blank" rel="noopener">doi:10.1016/j.atmosres.2026.109331</a></li>
      <li>Caballero-Morán, V. y Rondanelli, R. (2025). Tornado Seasonality in Central-Southern Chile. <i>Geophysical Research Letters</i>, 52, e2024GL110900. <a href="https://doi.org/10.1029/2024GL110900" target="_blank" rel="noopener">doi:10.1029/2024GL110900</a></li>
      <li>Marín, J. C., Barrett, B. S. y Pozo, D. (2021). The tornadoes of 30–31 May 2019 in south-central Chile: Sensitivity to topography and SST. <i>Atmospheric Research</i>, 249, 105301. <a href="https://doi.org/10.1016/j.atmosres.2020.105301" target="_blank" rel="noopener">doi:10.1016/j.atmosres.2020.105301</a></li>
      <li>Marín, J. C., Gutiérrez, F., Gensini, V. A., Barrett, B. S., Pozo, D., Jacques-Coper, M. y Veloso-Aguila, D. (2024). Climatological Aspects of Notable Tornado Events in Chile. <i>Monthly Weather Review</i>, 152(8), 1803–1819. <a href="https://doi.org/10.1175/MWR-D-23-0249.1" target="_blank" rel="noopener">doi:10.1175/MWR-D-23-0249.1</a></li>
      <li>Vicencio, J. et al. (2021). The Chilean Tornado Outbreak of May 2019: Synoptic, Mesoscale, and Historical Contexts. <i>Bulletin of the American Meteorological Society</i>, 102(3), E611–E634. <a href="https://doi.org/10.1175/BAMS-D-19-0218.1" target="_blank" rel="noopener">doi:10.1175/BAMS-D-19-0218.1</a></li>
      <li>Szilagyi, W. (2009). A waterspout forecasting technique. 5th European Conference on Severe Storms, Landshut. <a href="https://www.essl.org/ECSS/2009/preprints/O05-14-sziladgyi.pdf" target="_blank" rel="noopener">ESSL</a></li>
      <li>Renko, T., Kozarić, T. y Tudor, M. (2011). Testing waterspout forecasting indices over the Adriatic Sea using the ALADIN model. 6th ECSS, Palma de Mallorca. <a href="https://www.essl.org/ECSS/2011/programme/posters/7.pdf" target="_blank" rel="noopener">ESSL</a></li>
      <li>Ivušić, S. et al. (2017). Performance of waterspout forecasting method using high resolution numerical weather model. 9th ECSS, Pula. <a href="https://meetingorganizer.copernicus.org/ECSS2017/ECSS2017-5-2.pdf" target="_blank" rel="noopener">Copernicus</a></li>
      <li>NWS Warning Decision Training Division (2023). RAC one-pager reference: umbrales del Non-Supercell Tornado Parameter. <a href="https://training.weather.gov/wdtd/courses/rac/severe/apd-50dbz-height/story_content/external_files/RAC%20one%20pagers%20reference%20-%20Sep%202023%20update.pdf" target="_blank" rel="noopener">NWS</a></li>
    </ul></div></details>`;
  const wrap = document.getElementById('mapWrap');
  wrap.appendChild(card);
  L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
  const sub = card.querySelector('.tr-sub'), tira = card.querySelector('.tr-tira'), det = card.querySelector('.tr-det');
  const psub = card.querySelector('.tr-psub'), ptabla = card.querySelector('.tr-ptabla'), pdet = card.querySelector('.tr-pdet');
  card.querySelectorAll('.tr-ptabs button').forEach(b => b.onclick = () => {
    indProb = b.dataset.i;
    card.querySelectorAll('.tr-ptabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    if (prob) pintarProb();
  });

  async function cargarProb() {
    try {
      const r = await fetch('data/trombas_prob.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      prob = await r.json();
    } catch (e) {
      prob = null; ptabla.innerHTML = '';
      psub.textContent = 'Aún no hay una corrida del ensamble procesada. Se calcula con las corridas GEFS de 00 y 12 UTC cuando está disponible el plazo de 72 h.';
      return;
    }
    if (!prob.prob) { psub.innerHTML = 'La última corrida del ensamble no se pudo procesar; se reintenta en la próxima ejecución.'; ptabla.innerHTML = ''; return; }
    pintarProb();
  }

  function pintarProb() {
    const d = prob, hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    const dias = d.dias.filter(f => f >= hoy);
    psub.innerHTML = `Corrida ${escH(d.corrida.replace('T', ' ').replace('Z', ' UTC'))} · ${escH(d.fuente)} · procesada ${escH(horaChile(d.generado))} (hora Chile)`;
    ptabla.innerHTML = `<div class="ev-tw"><table class="ev-tabla tr-pt"><thead><tr><th>Zona</th>${dias.map(f => `<th>${escH(diaLargo(f))}</th>`).join('')}</tr></thead><tbody>` +
      d.areas.map(a => `<tr><th title="${escH(a.nombre)}">${escH(a.nombre.replace(/^Zona (\S+) · /, '$1 · '))}</th>` +
        dias.map(f => { const v = d.prob_dia[a.id][indProb][f]; return `<td><button type="button" class="tr-pc tr-${claseP(v)}${celdaProb && celdaProb[0] === a.id && celdaProb[1] === f ? ' sel' : ''}" data-a="${a.id}" data-f="${f}">${v == null ? '–' : v + ' %'}</button></td>`; }).join('') + '</tr>').join('') +
      '</tbody></table></div>';
    ptabla.querySelectorAll('.tr-pc').forEach(b => b.onclick = () => elegirProb(b.dataset.a, b.dataset.f));
    if (celdaProb) elegirProb(...celdaProb, true);
  }

  function elegirProb(id, f, silencioso) {
    celdaProb = [id, f];
    ptabla.querySelectorAll('.tr-pc').forEach(b => b.classList.toggle('sel', b.dataset.a === id && b.dataset.f === f));
    const d = prob, a = d.areas.find(x => x.id === id); if (!a) return;
    const filas = d.validas.map((v, k) => [v, d.prob[id][indProb][k]]).filter(([v]) => new Date(v).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) === f);
    pdet.innerHTML = `<h3>${escH(a.nombre)} · ${escH(diaLargo(f))}</h3>
      <p class="mar-ayuda">${escH(NOMBRE_IND[indProb])}: porcentaje de ${d.miembros} miembros, cada 6 h (hora de Chile).</p>
      <div class="tr-6h">${filas.map(([v, x]) => `<span class="tr-${claseP(x)}"><b>${escH(hhChile(v))} h</b>${x} %</span>`).join('')}</div>`;
    grupoZona.clearLayers();
    for (const [la, lo] of a.puntos) L.circleMarker([la, lo], { radius: 4, color: '#18212b', weight: 1, fillColor: '#ffffff', fillOpacity: 0.7 }).addTo(grupoZona);
    if (!map.hasLayer(grupoZona)) grupoZona.addTo(map);
    if (!silencioso) map.fitBounds(L.latLngBounds(a.puntos).pad(0.2), { maxZoom: 7 });
  }
  card.querySelector('.mar-cerrar').onclick = () => cerrar();
  card.querySelector('.mar-min').onclick = () => card.classList.toggle('mar-minimizada');
  function cerrar() { card.hidden = true; wrap.classList.remove('mar-abierto'); map.removeLayer(grupo); map.removeLayer(grupoZona); }

  async function cargar() {
    try {
      const r = await fetch('data/trombas.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      datos = await r.json(); cargado = Date.now();
    } catch (e) {
      datos = null; tira.innerHTML = '';
      sub.textContent = 'Aún no hay una corrida procesada. Se genera con cada corrida nueva del GFS (cuatro al día) cuando está disponible el plazo de 72 h.';
      return;
    }
    pintar();
  }

  function pintar() {
    const d = datos, ahora = Date.now() - 3 * 3600e3;
    const pasos = d.pasos.filter(p => new Date(p.valida) >= ahora);
    const viejo = Date.now() - new Date(d.generado) > 15 * 3600e3;
    sub.innerHTML = `Corrida ${escH(d.corrida.replace('T', ' ').replace('Z', ' UTC'))} · ${escH(d.fuente)} · procesada ${escH(horaChile(d.generado))} (hora Chile)${viejo ? ' · <b class="mar-viejo">corrida antigua</b>' : ''}`;
    if (d.completo === false) sub.innerHTML += ' · <b class="mar-viejo">no se pudo procesar; se reintenta en la próxima ejecución</b>';
    let html = '', dia = '';
    for (const p of pasos) {
      const dd = diaChile(p.valida);
      if (dd !== dia) { html += `${dia ? '</div>' : ''}<div class="tr-dia"><span class="tr-dia-t">${escH(dd)}</span>`; dia = dd; }
      const n = p.celdas.length, k = p.n.stp ? 'stp' : p.n.hslc ? 'hslc' : p.n.nst ? 'nst' : '';
      html += `<button type="button" class="tr-p${k ? ' tr-' + k : ''}${sel === p.fhr ? ' sel' : ''}" data-f="${p.fhr}" title="Válido ${escH(horaChile(p.valida))} · +${p.fhr} h"><b>${escH(hhChile(p.valida))}</b><small>${n || '·'}</small></button>`;
    }
    tira.innerHTML = (html ? html + '</div>' : '<p class="mar-nota">Sin plazos vigentes en la corrida disponible.</p>');
    tira.querySelectorAll('.tr-p').forEach(b => b.onclick = () => elegir(+b.dataset.f));
    if (sel == null) { const p = pasos.find(x => x.celdas.length) || pasos[0]; if (p) elegir(p.fhr); }
    else elegir(sel);
  }

  function elegir(fhr) {
    const p = datos.pasos.find(x => x.fhr === fhr); if (!p) return;
    sel = fhr;
    tira.querySelectorAll('.tr-p').forEach(b => b.classList.toggle('sel', +b.dataset.f === fhr));
    grupo.clearLayers();
    const col = datos.columnas, i = Object.fromEntries(col.map((c, k) => [c, k])), m = datos.paso_grilla / 2;
    for (const c of p.celdas) {
      const k = c[i.stp] <= datos.umbrales.stp ? 'stp' : c[i.hslc] ? 'hslc' : 'nst';
      L.rectangle([[c[0] - m, c[1] - m], [c[0] + m, c[1] + m]], { color: COLOR[k], weight: 0.5, fillOpacity: 0.45 })
        .bindPopup(`<div class="pp"><div class="ppT">${dm(c[0], 'N', 'S')} · ${dm(c[1], 'E', 'W')}</div><table>` +
          `<tr><th>Válido</th><td>${escH(horaChile(p.valida))}</td></tr>` +
          `<tr><th>STP (HS)</th><td>${nf(c[i.stp], 2)}</td></tr><tr><th>SHERBE</th><td>${nf(c[i.sherbe], 2)}</td></tr><tr><th>Alto cizalle, CAPE bajo</th><td>${c[i.hslc] ? 'sí' : 'no'}</td></tr><tr><th>NST</th><td>${nf(c[i.nst], 2)}</td></tr><tr><th>VGP</th><td>${nf(c[i.vgp], 2)} m/s²</td></tr><tr><th>Base de nube (LCL)</th><td>${nf(c[i.mllcl], 0)} m</td></tr><tr><th>MUCAPE</th><td>${nf(c[i.mucape], 0)} J/kg</td></tr>` +
          `<tr><th>MLCAPE</th><td>${nf(c[i.mlcape], 0)} J/kg</td></tr><tr><th>SRH 0–500 m</th><td>${nf(c[i.srh500], 0)} m²/s²</td></tr><tr><th>Cizalle efectivo</th><td>${nf(c[i.ebsmu_kt], 0)} kt</td></tr>` +
          `<tr><th>ΔT (TSM − T850)</th><td>${nf(c[i.dT])} °C</td></tr><tr><th>ΔZ (EL − LCL)</th><td>${nf(c[i.dZ_km])} km</td></tr><tr><th>Viento 850 hPa</th><td>${nf(c[i.w850_kt], 0)} kt</td></tr></table></div>`)
        .addTo(grupo);
    }
    if (!map.hasLayer(grupo)) grupo.addTo(map);
    const e = p.extremos;
    det.innerHTML = `<h3>${escH(horaChile(p.valida))} <small>(+${p.fhr} h)</small></h3>
      <dl><dt>STP mínimo</dt><dd>${nf(e.stp, 2)} · ${p.n.stp} celdas ≤ −0,1</dd>
      <dt>Alto cizalle, CAPE bajo</dt><dd>${p.n.hslc} celdas (SHERBE máximo ${nf(e.sherbe, 2)})</dd>
      <dt>NST máximo</dt><dd>${nf(e.nst, 2)} · ${p.n.nst} celdas &gt; 1 (sin validar en Chile)</dd>
      <dt>VGP máximo</dt><dd>${nf(e.vgp, 2)} m/s² (referencia, sin umbral chileno)</dd>
      <dt>ΔT máximo</dt><dd>${nf(e.dT)} °C (TSM − T850)</dd></dl>
      <p class="mar-ayuda">${p.celdas.length ? 'Toca una celda en el mapa para ver sus valores.' : 'Ninguna celda supera los umbrales en este plazo.'} Evaluados ${p.n.puntos} puntos de océano.</p>`;
  }

  return {
    abrir() { card.hidden = false; card.classList.remove('mar-minimizada'); wrap.classList.add('mar-abierto'); if (map.hasLayer(grupo) === false && datos) grupo.addTo(map); if (!datos || Date.now() - cargado > 30 * 60e3) { cargar(); cargarProb(); } },
    cerrar,
    get abierto() { return !card.hidden; }
  };
}
