// ============================ Trombas marinas: ficha técnica de parámetros (página Desarrollo) ============================
// Referencia estática, sin datos de modelo: resume los parámetros de pronóstico de trombas y sus fuentes, como base del
// futuro cálculo automático (GFS 0,25° / WRF). No constituye aviso. Toda cifra lleva su fuente; no agregar umbrales sin ella.
function crearTrombas(L, map) {
  const card = document.createElement('section');
  card.className = 'card mar-card tr-card'; card.id = 'trombas'; card.hidden = true;
  card.innerHTML = `<div class="mar-cab"><h2>Trombas marinas · parámetros de pronóstico</h2><span class="mar-etq tr-etq">En desarrollo · sin cálculo automático</span>
      <button type="button" class="mar-min" aria-label="Minimizar panel" title="Minimizar / ampliar">▾</button><button type="button" class="mar-cerrar" aria-label="Cerrar panel">✕</button></div>
    <p class="mar-sub">Ficha de referencia para construir una alerta preventiva de trombas. Reúne los índices con respaldo bibliográfico, sus umbrales y dónde obtener los datos. Aún no se calcula ningún índice: no constituye aviso.</p>

    <h3 class="tr-h">Dos mecanismos, dos juegos de parámetros</h3>
    <ul class="tr-l">
      <li><b>Frontal o postfrontal (mesociclónica).</b> Nace de convección organizada en ambiente de alto cizalle y CAPE bajo (HSLC). Es el caso típico de los avisos entre Maule y Los Lagos.</li>
      <li><b>De buen tiempo (no mesociclónica).</b> Se forma desde la superficie cuando un cúmulo en crecimiento estira un vórtice preexistente. Requiere cizalle débil, inestabilidad en capas bajas y vorticidad en superficie.</li>
    </ul>

    <h3 class="tr-h">Índices propuestos</h3>
    <div class="ev-tw"><table class="ev-tabla tr-tabla">
      <thead><tr><th>Tipo</th><th>Índice e ingredientes</th><th>Umbral de referencia</th><th>Fuente</th></tr></thead>
      <tbody>
        <tr><th>Frontal / postfrontal</th><td><b>STP</b> (versión hemisferio sur): MLCAPE, MLLCL, MLCIN, SRH 0–500 m con movimiento Bunkers izquierdo, cizalle efectivo</td><td>STP ≤ −0,3</td><td>Marín et al. (2024)</td></tr>
        <tr><th></th><td><b>SHERBE</b>: cizalle efectivo (EBSMU), gradiente 0–3 km, gradiente 700–500 hPa</td><td>SHERBE ≥ 1</td><td>Marín et al. (2024)</td></tr>
        <tr class="ev-sep"><th>Convectiva general</th><td><b>SWI</b> (nomograma de Szilagyi): ΔT = TSM − T850; ΔZ = EL − LCL; viento en 850 hPa</td><td>SWI ≥ 0; viento 850 hPa ≤ 40 kt</td><td>Szilagyi (2009)</td></tr>
        <tr class="ev-sep"><th>Buen tiempo</th><td><b>NST</b>: gradiente 0–1 km, MLCAPE 0–3 km, MLCIN, cizalle 0–6 km, vorticidad relativa en superficie (signo invertido en el hemisferio sur)</td><td>NST &gt; 1 · gradiente 0–1 km &gt; 9 °C/km · MLCAPE 0–3 km &gt; 100 J/kg · MLCIN &gt; −25 J/kg · vorticidad &gt; 8×10⁻⁵ s⁻¹ · cizalle 0–6 km ≤ 25 kt (necesario ≤ 35 kt)</td><td>NWS WDTD (2023)</td></tr>
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
  card.querySelector('.mar-cerrar').onclick = () => cerrar();
  card.querySelector('.mar-min').onclick = () => card.classList.toggle('mar-minimizada');
  function cerrar() { card.hidden = true; wrap.classList.remove('mar-abierto'); }
  return {
    abrir() { card.hidden = false; card.classList.remove('mar-minimizada'); wrap.classList.add('mar-abierto'); },
    cerrar,
    get abierto() { return !card.hidden; }
  };
}
