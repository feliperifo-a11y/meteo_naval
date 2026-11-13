// Versión en inglés de la portada y de las páginas públicas (Pronósticos Marítimos, WRF, WRF + IA, MONAN y Hielos). El idioma se elige con el botón «English / Español» (queda guardado en el navegador)
// o con ?lang=en en la dirección. Con el inglés activo, este archivo traduce el texto de la interfaz a medida que la
// página lo escribe; el código de la página no cambia. Terminología marítima según la versión en inglés del sitio
// meteorológico de la autoridad marítima (Warnings, Gales, Swell-Surges, Coastal Areas, High Seas, Sea Ice…).
// Los boletines y avisos oficiales se muestran en su español original; los pronósticos WRF y WRF + IA, traducidos.
(function () {
  let lang = 'es';
  try { const q = new URLSearchParams(location.search).get('lang'); if (q === 'en' || q === 'es') localStorage.setItem('meteoia_lang', q); lang = localStorage.getItem('meteoia_lang') === 'en' ? 'en' : 'es'; } catch (e) { /* sin almacenamiento */ }
  window.METEOIA_LANG = lang;
  const cambiar = () => { try { localStorage.setItem('meteoia_lang', lang === 'en' ? 'es' : 'en'); } catch (e) { /* sin almacenamiento */ } const u = new URL(location.href); if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); location.replace(u.pathname + u.search + u.hash); } else location.reload(); };
  function boton() {
    if (document.getElementById('btnIdioma')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'btnIdioma'; b.className = 'btnVideo'; b.lang = lang === 'en' ? 'es' : 'en';
    b.textContent = lang === 'en' ? 'Español' : 'English'; b.title = lang === 'en' ? 'Ver la página en español' : 'View this page in English'; b.dataset.i18n = 'no'; b.onclick = cambiar;
    const v = document.querySelector('.btnVideo, a.btnV[href="./"], .hBtns a.prim'); if (v && v.parentNode) { b.className = v.classList.contains('btnVideo') ? 'btnVideo' : v.classList.contains('btnV') ? 'btnV' : ''; v.parentNode.insertBefore(b, v); } else { b.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9999'; document.body.appendChild(b); }
  }
  if (lang !== 'en') { document.addEventListener('DOMContentLoaded', boton); return; }
  document.documentElement.lang = 'en';

  // Fechas y números: lo que la página pide en formato chileno se entrega en formato inglés (día/mes, punto decimal).
  for (const [P, ms] of [[Date.prototype, ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']], [Number.prototype, ['toLocaleString']]]) for (const m of ms) {
    const orig = P[m]; P[m] = function (loc, o) { return orig.call(this, loc === 'es-CL' ? 'en-GB' : loc, o); };
  }

  // ---- Texto exacto (un nodo de texto o un atributo completo)
  const EX = {
    'Inteligencia artificial para decisiones marítimas más seguras': 'Artificial intelligence for safer maritime decisions',
    'MeteoIA · Inteligencia artificial para decisiones marítimas más seguras': 'MeteoIA · Artificial intelligence for safer maritime decisions',
    'Cargando datos…': 'Loading data…', 'Cargando…': 'Loading…', 'Instalar app gratis': 'Install free app', '▶ Ver video': '▶ Watch video',
    'Desarrollo': 'Development', 'NUEVO': 'NEW', 'Desarrollo →': 'Development →',
    'Nuevo: condiciones a lo largo de la ruta de su nave, con avisos y estado de puerto': 'New: conditions along your vessel’s route, with warnings and port status',
    // Mapa y capas
    'Mapa de viento y áreas marítimas': 'Wind and maritime areas map', 'Capas': 'Layers', 'Ver todo Chile': 'View all of Chile', 'Pantalla completa': 'Full screen',
    'Viento GFS (color)': 'GFS wind (colour)', 'Viento ECMWF 9 km (costa)': 'ECMWF 9 km wind (coast)', 'Oleaje WW3': 'WW3 waves', 'Temperatura del mar (MUR 1 km)': 'Sea surface temperature (MUR 1 km)',
    'Viento GFS (flechas)': 'GFS wind (arrows)', 'Avisos vigentes y próximos': 'Warnings in force and upcoming', 'Estaciones': 'Weather stations', 'Puertos con restricción (SITPORT)': 'Ports with restrictions (SITPORT)',
    'Boyas': 'Buoys', 'Casos SAR (marcados en Desarrollo)': 'SAR cases (marked in Development)', 'Mapa base': 'Base map', 'Imagen satelital': 'Satellite imagery', 'Océano (claro)': 'Ocean (light)', 'Sin conexión (costa)': 'Offline (coastline)',
    'Viento a 10 m (kt)': '10 m wind (kt)', 'Sin acceso a mapas en línea: se usa la costa incorporada.': 'Online maps unavailable: using the built-in coastline.', 'Imagen © Esri': 'Imagery © Esri',
    // Viento ECMWF
    'Control de viento ECMWF': 'ECMWF wind control', 'Viento ECMWF 9 km': 'ECMWF 9 km wind', 'Fuente ECMWF ↗': 'ECMWF source ↗', 'Cargando corrida…': 'Loading model run…',
    'Fecha del pronóstico (hora de Chile)': 'Valid time (Chile local time)', 'Reproducir': 'Play', 'Pausar': 'Pause', 'Flechas de dirección del viento': 'Wind direction arrows',
    'Fecha del pronóstico de viento ECMWF': 'ECMWF wind valid time', 'Fecha anterior': 'Previous valid time', 'Fecha siguiente': 'Next valid time', 'Avance de la corrida ECMWF': 'ECMWF run progress',
    'Escala de viento de cero a sesenta y cuatro nudos o más': 'Wind scale from zero to sixty-four knots or more',
    'Viento medio a 10 m. Pulsa el mapa para ver rapidez, dirección y ráfaga máxima del período.': 'Mean 10 m wind. Tap the map for speed, direction and maximum gust of the period.',
    'Actualización y alcance': 'Updates and coverage',
    'Modelo global IFS del Centro Europeo (ECMWF) en su resolución nativa de 0,1° (≈ 9 km), recortado a la franja costera entre 17° S y 57° S. Datos abiertos con licencia CC-BY-4.0. Las flechas indican hacia dónde sopla el viento; la dirección del texto es la de procedencia. Se usan las corridas de 00 y 12 UTC; MeteoIA revisa cada 20 minutos si hay una nueva.':
      'ECMWF IFS global model at its native 0.1° resolution (≈ 9 km), cropped to the coastal strip between 17° S and 57° S. Open data under the CC-BY-4.0 licence. Arrows show where the wind is blowing to; directions in the text are where it comes from. The 00 and 12 UTC runs are used; MeteoIA checks for a new run every 20 minutes.',
    'Viento medio a 10 m': 'Mean 10 m wind', 'Ráfaga máxima del período:': 'Maximum gust of the period:', 'No se pudo mostrar esta fecha del viento ECMWF.': 'This ECMWF wind valid time could not be displayed.',
    'El viento ECMWF aún no está disponible. Se publica con la próxima corrida del modelo.': 'ECMWF wind is not available yet. It will be published with the next model run.',
    // Oleaje WW3
    'Control de oleaje WW3': 'WW3 wave control', 'Fuente NOAA ↗': 'NOAA source ↗', 'Flechas de dirección del oleaje': 'Wave direction arrows', 'Fecha del pronóstico de oleaje WW3': 'WW3 wave valid time',
    'Avance de la corrida WW3': 'WW3 run progress', 'Escala de altura significativa de cero a ocho metros o más': 'Significant wave height scale from zero to eight metres or more',
    'Altura significativa de ola. Pulsa el mar para ver altura, período y dirección, con el mar de viento y el mar de fondo por separado.': 'Significant wave height (Hs). Tap the sea for height, peak period and direction, with wind sea and swell given separately.',
    'Modelo global WAVEWATCH III de NOAA (GFS-Wave), resolución 0,25° (≈ 28 km), mostrado en una grilla de 0,5°. Apto para alta mar y áreas costeras; no resuelve el interior de bahías. Las flechas indican hacia dónde avanza el oleaje; la dirección del texto es la de procedencia. MeteoIA revisa cada 20 minutos si hay una corrida nueva (el modelo corre cada 6 horas).':
      'NOAA WAVEWATCH III global model (GFS-Wave), 0.25° resolution (≈ 28 km), shown on a 0.5° grid. Suitable for high seas and coastal areas; it does not resolve the interior of bays. Arrows show where the waves are travelling to; directions in the text are where they come from. MeteoIA checks for a new run every 20 minutes (the model runs every 6 hours).',
    'Período pico:': 'Peak period:', '· Dirección:': '· Direction:', 'Mar de viento:': 'Wind sea:', 'Mar de fondo:': 'Swell:', 'no significativo': 'not significant', 'Altura significativa': 'Significant wave height',
    'No se pudo mostrar esta fecha del oleaje WW3.': 'This WW3 wave valid time could not be displayed.', 'El oleaje WW3 aún no está disponible. Se publica con la próxima corrida del modelo.': 'WW3 waves are not available yet. They will be published with the next model run.',
    // Temperatura del mar
    'Temperatura del mar': 'Sea surface temperature', 'Fuente NASA ↗': 'NASA source ↗', 'Temperatura': 'Temperature', 'Anomalía': 'Anomaly', 'Buscando el último análisis…': 'Looking for the latest analysis…',
    'Control de temperatura superficial del mar': 'Sea surface temperature control', 'Variable': 'Variable', 'Día anterior': 'Previous day', 'Fecha del análisis': 'Analysis date', 'Día siguiente': 'Next day',
    'Pulsa el mar para ver la temperatura del agua en ese punto y su pronóstico a 3 días.': 'Tap the sea for the water temperature at that point and its 3-day forecast.',
    'Análisis diario MUR (GHRSST nivel 4) de NASA JPL, resolución 0,01° (≈ 1 km), que combina varios satélites. Se publica con 1 a 2 días de desfase. La anomalía es la diferencia con la climatología de la fecha. El valor del punto se lee del mapa con la paleta oficial (precisión ≈ 0,15 °C). El pronóstico a 3 días es del modelo de Météo-France (≈ 9 km) vía Open-Meteo.':
      'NASA JPL MUR daily analysis (GHRSST level 4), 0.01° resolution (≈ 1 km), blending several satellites. It is published with a 1 to 2 day delay. The anomaly is the difference from the climatology for the date. The point value is read from the map with the official palette (accuracy ≈ 0.15 °C). The 3-day forecast is from the Météo-France model (≈ 9 km) via Open-Meteo.',
    'Temperatura del mar: NASA JPL MUR / GIBS': 'Sea surface temperature: NASA JPL MUR / GIBS', '(último análisis)': '(latest analysis)', 'No se encontró un análisis reciente de temperatura del mar.': 'No recent sea surface temperature analysis was found.',
    'Consultando temperatura…': 'Fetching temperature…', 'Anomalía de temperatura del mar': 'Sea surface temperature anomaly', 'Sin dato en este punto (tierra, hielo o nubosidad persistente).': 'No data at this point (land, ice or persistent cloud).',
    'más cálida que lo normal': 'warmer than normal', 'más fría que lo normal': 'colder than normal', 'Pronóstico (Météo-France):': 'Forecast (Météo-France):',
    // Alertas y avisos
    'Alertas y avisos': 'Alerts and warnings', 'Mostrar todas en el mapa': 'Show all on map', 'Ocultar todas del mapa': 'Hide all from map', 'En mapa': 'On map', 'Oculta': 'Hidden',
    'Roja': 'Red', 'Amarilla': 'Yellow', 'Vigente': 'In force', 'Próximo': 'Upcoming',
    // Nombres de los avisos como en la versión en inglés del sitio de la autoridad marítima: especial = Weather, mal tiempo = Gales, temporal = Storms, marejadas = Swell-Surges.
    'Aviso de marejadas': 'Swell-Surge Warning', 'Aviso de temporal': 'Storm Warning', 'Aviso de mal tiempo': 'Gale Warning', 'Aviso especial · trombas marinas': 'Special Weather Warning · waterspouts', 'Aviso de temporal · Zona IX': 'Storm Warning · Area IX', 'Aviso especial': 'Special Weather Warning',
    // Estado de puerto
    'Estado de puerto': 'Port status', 'Consultando restricciones…': 'Checking restrictions…', 'Ver en SITPORT ↗': 'View in SITPORT ↗', 'Bahía': 'Bay', 'Restricción informada': 'Reported restriction', 'Restricción': 'Restriction', 'Toda la bahía': 'Whole bay',
    'La consulta no informa restricciones. Consulte el estado oficial en SITPORT.': 'No restrictions are reported. Check the official status in SITPORT.', 'SITPORT: bahía sin posición': 'SITPORT: bay without position',
    'No se pudo renovar la consulta. Se conserva la última información mostrada.': 'The query could not be refreshed. The last information shown is kept.',
    'No se pudo consultar SITPORT ni su copia publicada. Estado no disponible.': 'Neither SITPORT nor its published copy could be reached. Status unavailable.',
    // Condiciones actuales
    'Condiciones actuales': 'Current conditions', 'Viento': 'Wind', 'Oleaje': 'Waves', 'Temperatura del aire': 'Air temperature', 'Presión': 'Pressure', 'nivel del mar': 'sea level', 'sin dirección': 'no direction',
    'sin boya cercana con datos': 'no nearby buoy with data', 'Estación': 'Station', 'Lugar': 'Location',
    // Pronóstico, carta, hielos, WRF
    'Pronóstico marítimo': 'Marine weather forecast', 'Ver todos →': 'View all →', 'Bahías': 'Bays', 'Zonas costeras': 'Coastal Areas', 'Alta mar': 'High Seas', 'Ver pronóstico completo →': 'View full forecast →',
    'Sin pronósticos disponibles.': 'No forecasts available.', 'Hoy': 'Today', 'Mañana': 'Tomorrow', 'Sin pronóstico para este día': 'No forecast for this day', 'Sin pronósticos por ahora.': 'No forecasts for now.',
    'Carta de superficie': 'Surface chart', 'Ver mapa →': 'View map →', 'Isobaras GFS cada 4 hPa · A: alta presión · B: baja presión': 'GFS isobars every 4 hPa · A: high pressure · B: low pressure', 'Isobaras no disponibles por ahora.': 'Isobars not available for now.',
    'Monitoreo de hielos': 'Ice monitoring', 'Sin hielo': 'Ice free', '9–10 décimos': '9–10 tenths', 'Sin datos de hielo por ahora.': 'No ice data for now.',
    'Modelo WRF': 'WRF model', 'Ver detalle →': 'View details →', 'Hoy · pronóstico por bahía generado con IA a partir del modelo WRF': 'Today · bay forecast generated with AI from the WRF model',
    // Pie, sugerencias, video, SAR
    '¿Sugerencias o comentarios? Escríbenos': 'Suggestions or comments? Write to us', 'Sugerencias': 'Suggestions', 'Envíe sus sugerencias o comentarios': 'Send your suggestions or comments', 'Cerrar': 'Close',
    'MeteoIA es una página pública y': 'MeteoIA is a public,', 'sin fines de lucro': 'non-profit', ', creada para apoyar la toma de decisiones y la seguridad en la navegación.': 'website, created to support decision-making and safety of navigation.',
    'Cualquier sugerencia o comentario será bienvenido. Envíelo a:': 'Any suggestion or comment is welcome. Send it to:', 'Desarrollado por Felipe Rifo Espósito': 'Developed by Felipe Rifo Espósito',
    'Visitas registradas por GoatCounter (se actualiza con hasta 4 horas de retraso). Estadísticas anónimas: no se usan cookies ni datos personales.': 'Visits recorded by GoatCounter (updated with up to 4 hours of delay). Anonymous statistics: no cookies or personal data are used.',
    'Presentación de MeteoIA · 50 s': 'MeteoIA presentation · 50 s', '🔇 Silenciar': '🔇 Mute', '🔊 Activar sonido': '🔊 Unmute', 'Cerrar video': 'Close video', 'Video de bienvenida a MeteoIA': 'MeteoIA welcome video', 'Cerrar (Esc)': 'Close (Esc)',
    'Video de presentación de MeteoIA (50 s)': 'MeteoIA presentation video (50 s)', 'Sin fase declarada': 'No phase declared', 'Abrir ficha en Desarrollo →': 'Open case file in Development →', 'Caso SAR': 'SAR case',
  };
  // Rótulos de dos líneas (texto, salto de línea, texto).
  const PARES = { 'Pronósticos|Marítimos': ['Marine', 'Forecasts'], 'Carta de|Superficie': ['Surface', 'Chart'], 'Monitoreo|de Hielos': ['Ice', 'Monitoring'], 'Pronósticos|WRF': ['WRF', 'Forecasts'],
    'Pronósticos|WRF + IA': ['WRF + AI', 'Forecasts'], 'Modelo|MONAN': ['MONAN', 'Model'], 'Rutas de|navegación': ['Navigation', 'Routes'] };
  const est = k => ({ operativa: 'operational', 'con retraso': 'delayed', 'no operativa': 'not operational' }[k] || k);
  const tiempo = s => s.replace(/ días$/, ' days');
  const umbrales = s => s.replace(/viento ≥/g, 'wind ≥').replace('con componente norte de Arica a', 'with a northerly component from Arica to').replace(/ de (\d[\d.,° S]+) a /g, ' from $1 to ')
    .replace('del NE/E/SE en Magallanes', 'from the NE/E/SE in Magallanes').replace('en las islas', 'on the islands').replace('roja ≥', 'red ≥').replace(/(\d),(\d)/g, '$1.$2');
  // ---- Texto con partes variables (se compara el texto completo)
  const RX = [
    [/^(\d+) estaciones · (\d+) operativas(?: · datos actualizados (.+))?$/, (m, a, b, c) => `${a} stations · ${b} operational${c ? ' · data updated ' + c : ''}`],
    [/^Estaciones \((\d+) de (\d+) operativas\)$/, (m, a, b) => `Weather stations (${a} of ${b} operational)`],
    [/^Estación (.+?) · dato de las (\S+) \(hace (.+?)\)(?: · (con retraso|no operativa))?\.$/, (m, n, h, e, k) => `Station ${n} · observation at ${h} (${tiempo(e)} ago)${k ? ' · ' + est(k) : ''}.`],
    [/^Estación (.+?) · sin hora(?: · (con retraso|no operativa))?\.$/, (m, n, k) => `Station ${n} · no time${k ? ' · ' + est(k) : ''}.`],
    [/^(.+?) · (operativa|con retraso|no operativa)(?: · (.+))?$/, (m, n, k, r) => `${n} · ${est(k)}${r ? ' · ' + r : ''}`],
    [/^● (operativa|con retraso|no operativa)$/, (m, k) => '● ' + est(k)],
    [/^Viento: (.*)$/, (m, r) => 'Wind: ' + r], [/^Temperatura: (.*)$/, (m, r) => 'Temperature: ' + r], [/^Presión: (.*)$/, (m, r) => 'Pressure: ' + r], [/^Dato de (.*)$/, (m, r) => 'Observation at ' + r],
    [/^(.*?)(?: · )?racha (\S+) kt$/, (m, a, r) => `${a ? a + ' · ' : ''}gust ${r} kt`], [/^((?:[A-Z]{1,3} \(\d+°\) · )?)boya (.+)$/, (m, a, b) => `${a}buoy ${b}`],
    [/^humedad (\S+) %$/, (m, v) => `humidity ${v} %`], [/^aire (\S+) °C$/, (m, v) => `air ${v} °C`],
    [/^Boya (.+?) · Hs (\S+) m( \(dato antiguo\))?$/, (m, b, h, v) => `Buoy ${b} · Hs ${h} m${v ? ' (old observation)' : ''}`], [/^Boya (.+?) · sin datos$/, (m, b) => `Buoy ${b} · no data`],
    [/^Área (\S+) · (.+)$/, (m, a, n) => `Area ${a} · ${n}`], [/^GFS · válido (.+) \(hora Chile\)$/, (m, f) => `GFS · valid ${f} (Chile time)`],
    [/^Oleaje sobre (\d) m en boya (.+)$/, (m, h, b) => `Waves above ${h} m at buoy ${b}`], [/^Viento ≥ (\d+) kt en (.+)$/, (m, k, n) => `Wind ≥ ${k} kt at ${n}`],
    [/^Altura significativa (\S+) m · (.+)$/, (m, h, f) => `Significant wave height ${h} m · ${f}`], [/^(\d\S+ \d\S+) a (\d\S+ \d\S+)$/, (m, a, b) => `${a} to ${b}`],
    [/^(Aviso de marejadas|Aviso de temporal|Aviso de mal tiempo|Aviso especial · trombas marinas|Aviso de temporal · Zona IX) · (.+) · (vigente|próximo)$/, (m, t, z, e) => `${EX[t]} · ${z} · ${e === 'vigente' ? 'in force' : 'upcoming'}`],
    [/^Sin avisos vigentes ni alertas por viento u oleaje \(≥ 3 m\) en este momento\. Umbrales de viento del PD OPE-07: (.+)\.$/, (m, u) => `No warnings in force and no wind or wave (≥ 3 m) alerts at this time. Wind thresholds from directive PD OPE-07: ${umbrales(u)}.`],
    [/^(.+?) · (\d+) restricci(?:ón|ones)(?: \((.+)\))?$/, (m, n, c, r) => `${n} · ${c} restriction${c === '1' ? '' : 's'}${r ? ' (' + r + ')' : ''}`], [/^(\d+) restricci(?:ón|ones)$/, (m, c) => `${c} restriction${c === '1' ? '' : 's'}`],
    [/^(\d+) bahías · (\d+) restricciones publicadas\. (Consulta en vivo|Copia publicada)(?: · (fecha no disponible|[^.⚠]+))?\.( ⚠ SITPORT no responde desde esa hora: las restricciones pueden haber cambiado\.)?$/,
      (m, a, b, v, f, w) => `${a} bays · ${b} published restrictions. ${v === 'Consulta en vivo' ? 'Live query' : 'Published copy'}${f ? ' · ' + (f === 'fecha no disponible' ? 'date not available' : f) : ''}.${w ? ' ⚠ SITPORT has not responded since that time: restrictions may have changed.' : ''}`],
    [/^Fuente: SITPORT, (consultado en vivo|copia del (.+))\. Posición de la bahía aproximada\.$/, (m, v, f) => `Source: SITPORT, ${f ? 'copy from ' + f : 'live query'}. Approximate bay position.`],
    [/^⚠ SITPORT no responde desde el (.+): estas restricciones pueden haber cambiado\. Confirme en SITPORT o con la capitanía de puerto\.$/, (m, f) => `⚠ SITPORT has not responded since ${f}: these restrictions may have changed. Confirm in SITPORT or with the harbour master’s office.`],
    [/^(.+) · Ver detalle$/, (m, a) => `${a} · View details`], [/^Incidente: (.+)$/, (m, a) => 'Incident: ' + a],
    [/^Concentración de hielo marino \(satélite AMSR2\) ·(.*)$/, (m, f) => 'Sea ice concentration (AMSR2 satellite) ·' + f], [/^Concentración de hielo marino, Península Antártica(.*)$/, (m, f) => 'Sea ice concentration, Antarctic Peninsula' + f],
    [/^· ([\d.,]+) visitas?$/, (m, v) => `· ${v} visit${v === '1' ? '' : 's'}`],
    [/^Corrida (.+) \(hora de Chile\), (\d+) fechas: cada 3 horas hasta \+72 h y cada 6 horas hasta \+(\d+) h\.$/, (m, f, n, h) => `Run ${f} (Chile local time), ${n} valid times: every 3 hours to +72 h and every 6 hours to +${h} h.`],
    [/^Corrida (.+) \(hora de Chile\), (\d+) fechas cada 6 horas hasta \+(\d+) h\.$/, (m, f, n, h) => `Run ${f} (Chile local time), ${n} valid times every 6 hours to +${h} h.`],
    [/^(.+) · celda de 0[.,]1°\. Dirección de procedencia\.$/, (m, a) => `${a} · 0.1° cell. Direction the wind comes from.`],
    [/^(\S+) días$/, (m, v) => v + ' days'], [/^hace (.+)$/, (m, v) => tiempo(v) + ' ago'],
  ];
  // ================= Páginas públicas: Pronósticos Marítimos, WRF, WRF + IA, MONAN y Hielos =================
  Object.assign(EX, {
    '← Volver al inicio': '← Back to home', '‹ Volver': '‹ Back', 'MeteoIA · volver al inicio': 'MeteoIA · back to home', 'Todos': 'All', 'Áreas': 'Areas', 'Favoritos': 'Favourites', 'Sin datos': 'No data', 'sin datos': 'no data',
    'Viento (color)': 'Wind (colour)', 'Flechas de viento': 'Wind arrows', 'Etiquetas': 'Labels', 'Capas del mapa': 'Map layers', 'Vista': 'View', 'Buscar': 'Search', 'Océano': 'Ocean',
    'mín / máx': 'min / max', 'Rachas': 'Gusts', 'Experimental': 'Experimental', 'Boletín oficial': 'Official bulletin', 'Día': 'Day', 'Días': 'Days', 'Noche': 'Night', 'Tipo': 'Type', 'Sector': 'Sector',
    // Pronósticos marítimos
    'Pronósticos marítimos': 'Marine weather forecasts', 'Pronósticos marítimos · Bahías y áreas': 'Marine weather forecasts · Bays and areas', 'Pronósticos por bahía y área': 'Forecasts by bay and area',
    'Cargando pronósticos…': 'Loading forecasts…', 'Elige una bahía o un área en la lista o en el mapa.': 'Choose a bay or an area from the list or the map.',
    'Elige una bahía o un área en la lista o en el mapa para ver su pronóstico.': 'Choose a bay or an area from the list or the map to see its forecast.',
    'Pronósticos por bahía a partir del modelo WRF': 'Bay forecasts from the WRF model', 'Pronósticos de bahía redactados con IA': 'Bay forecasts written with AI',
    'Buscar bahía, puerto o área…': 'Search bay, port or area…', 'Mapa de pronósticos': 'Forecast map', 'Área': 'Area', 'Sin pronóstico': 'No forecast', 'Pronósticos por bahía': 'Forecasts by bay', 'Pronósticos por área': 'Forecasts by area',
    'Aún no tienes favoritos: marca la estrella de un lugar para agregarlo.': 'You have no favourites yet: tap the star of a place to add it.', 'No hay lugares que coincidan con la búsqueda.': 'No places match the search.',
    'Todos los sectores': 'All sectors', 'Área o ruta marítima': 'Maritime area or route', 'Pronóstico': 'Forecast', 'Detalle': 'Details', 'Información': 'Information',
    'Nubosidad': 'Cloud cover', 'Visibilidad': 'Visibility', 'Fenómenos': 'Significant weather', 'Mar': 'Sea state', 'Índice UV': 'UV index', 'viento': 'wind',
    'Sin pronóstico disponible': 'No forecast available', 'Pronóstico completo ·': 'Full forecast ·', 'Información del pronóstico': 'Forecast information', 'Zona marítima': 'Maritime area',
    'Emitido': 'Issued', 'Emisión': 'Issue', 'Pronóstico general de 24 h': 'General 24 h forecast', 'Pronóstico publicado ↗': 'Published forecast ↗', 'Texto original ↗': 'Original text ↗', 'Carta de superficie →': 'Surface chart →',
    'Transcrito automáticamente desde el texto publicado. Ante cualquier duda, prevalece el texto original. Producto referencial: no reemplaza los avisos oficiales.': 'Transcribed automatically from the published text. In case of doubt, the original text prevails. Reference product: it does not replace official warnings.',
    'Pronóstico por día': 'Forecast by day', 'Situación sinóptica': 'Synoptic situation',
    'Los pronósticos aún no están disponibles. Se actualizan con la próxima revisión automática.': 'Forecasts are not available yet. They are updated with the next automatic check.',
    // Pronósticos WRF
    'Pronósticos WRF': 'WRF forecasts', 'Pronósticos WRF · Bahías': 'WRF forecasts · Bays', 'Elige una bahía en la lista o en el mapa.': 'Choose a bay from the list or the map.',
    'Elige una bahía en la lista o en el mapa para ver su pronóstico.': 'Choose a bay from the list or the map to see its forecast.', 'Modelo MONAN 3 km (corrida propia)': 'MONAN 3 km model (own run)',
    'Buscar bahía, puerto o localidad…': 'Search bay, port or town…', 'Buscar bahía': 'Search bay', 'Pronóstico aún no generado': 'Forecast not generated yet', 'Bahías favoritas': 'Favourite bays',
    'Aún no tienes favoritos: marca la estrella de una bahía para agregarla.': 'You have no favourites yet: tap the star of a bay to add it.', 'No hay bahías que coincidan con la búsqueda.': 'No bays match the search.',
    'Sin pronóstico para graficar.': 'No forecast to plot.', 'Rango de viento sostenido del día (kt)': 'Daily range of sustained wind speed (kt)', 'Altura significativa máxima del día (m)': 'Daily maximum significant wave height (m)',
    'Temperatura mínima y máxima (°C)': 'Minimum and maximum temperature (°C)', 'Oleaje hoy (pronóstico)': 'Waves today (forecast)', 'Análisis IA': 'AI analysis', 'Detalle por día': 'Details by day',
    'Oleaje: sin cobertura del modelo': 'Waves: outside model coverage', 'Pronóstico WRF + IA': 'WRF + AI forecast', 'Meteograma ↗': 'Meteogram ↗', 'Resumen próximos días': 'Summary of the next days', 'Ver más →': 'See more →',
    'Pronósticos marítimos publicados': 'Published marine weather forecasts',
    'Generado automáticamente por inteligencia artificial (Claude) a partir de los meteogramas del modelo WRF (3 km; 9 km donde no hay 3 km; 10 km en la Antártica; 27 km en Juan Fernández). Oleaje: altura significativa máxima del día del modelo marino de':
      'Generated automatically by artificial intelligence (Claude) from WRF model meteograms (3 km; 9 km where 3 km is not available; 10 km in Antarctica; 27 km at Juan Fernández). Waves: daily maximum significant wave height from the marine model of',
    ', en rangos de 1 m; no resuelve fiordos ni canales angostos. Producto': ', in 1 m ranges; it does not resolve fjords or narrow channels. This is a', 'referencial y experimental': 'reference, experimental product',
    ': no reemplaza los pronósticos y avisos oficiales.': ': it does not replace official forecasts and warnings.',
    'Los pronósticos aún no están disponibles. Se generan con la próxima corrida del modelo.': 'Forecasts are not available yet. They are generated with the next model run.',
    // WRF + IA
    'Pronósticos WRF + IA': 'WRF + AI forecasts', 'Pronósticos WRF + IA · Bahías': 'WRF + AI forecasts · Bays', 'WRF + IA': 'WRF + AI', 'Bahías WRF + IA': 'WRF + AI bays', 'Bahía con pronóstico WRF + IA': 'Bay with WRF + AI forecast',
    'Mapa de pronósticos WRF + IA': 'WRF + AI forecast map', '¿Cómo mejora la IA el pronóstico del WRF?': 'How does AI improve the WRF forecast?', 'El punto de partida es el WRF.': 'The starting point is the WRF.',
    'El modelo WRF (3 km) entrega un meteograma por bahía; una lectura automática lo transcribe a texto tal como viene, sin corregirlo: es el pronóstico «WRF». Es bueno en la tendencia, pero tiene errores que se repiten en cada lugar: por ejemplo, temperaturas máximas más bajas que las observadas o direcciones de viento que no calzan con la estación.':
      'The WRF model (3 km) provides one meteogram per bay; an automatic reading transcribes it to text as it comes, without correcting it: that is the “WRF” forecast. It is good on the trend, but it has errors that repeat at each place: for example, maximum temperatures lower than observed, or wind directions that do not match the station.',
    'Cada mañana, con la corrida 12Z, la IA recibe todo lo que usaría un pronosticador:': 'Every morning, with the 12Z run, the AI receives everything a forecaster would use:',
    'el pronóstico WRF de la bahía, el oleaje del modelo WW3 en el punto de mar más cercano y boletines anteriores del especialista para esa bahía, elegidos entre los de situación más parecida y los más recientes. Cada ejemplo trae lo que decían el WRF y el WW3 cuando se escribió y lo que midió después la estación de capitanía de puerto. También recibe el acierto reciente y el sesgo del WRF, del especialista y del propio borrador.':
      'the WRF forecast for the bay, WW3 model waves at the nearest sea point, and previous bulletins by the forecaster for that bay, chosen among those with the most similar situation and the most recent ones. Each example includes what the WRF and WW3 said when it was written and what the harbour master’s station measured afterwards. It also receives the recent verification score and bias of the WRF, of the forecaster and of its own draft.',
    'Con eso redacta el pronóstico como lo haría el especialista:': 'With that it writes the forecast as the forecaster would:',
    'usa su orden, sus términos y su escala de estado del mar, y corrige los errores que muestran los ejemplos y la verificación. No agrega fenómenos que las entradas no respalden.': 'it uses the same order, terminology and sea state scale, and corrects the errors shown by the examples and the verification. It does not add weather phenomena not supported by the inputs.',
    'Ejemplo real (Iquique): «El WRF sigue dando máximas de 19–21 °C y lo observado ha sido 24–25 °C todos los días, así que usé 23–24 °C». Cada pronóstico muestra abajo su «Criterio aplicado por la IA».':
      'Real example (Iquique): “The WRF keeps giving maximums of 19–21 °C and the observed values have been 24–25 °C every day, so I used 23–24 °C”. Each forecast shows its “Criteria applied by the AI” below.',
    'Todos los días se verifica contra lo observado.': 'It is verified against observations every day.',
    'El pronóstico WRF + IA, el del especialista y el WRF se comparan con la estación según la pauta O.P.I. N° 1104 (dirección, intensidad y temperatura máxima, 08:00–20:00). Ese es el acierto que aparece más abajo y en el mapa.':
      'The WRF + AI forecast, the forecaster’s and the WRF are compared with the station following guideline O.P.I. N° 1104 (wind direction, wind speed and maximum temperature, 08:00–20:00). That is the verification score shown below and on the map.',
    'Mejora con el tiempo.': 'It improves over time.',
    'La IA no se reentrena: aprende de los ejemplos. Cada boletín del especialista que se archiva, con su observación, se suma a los ejemplos del día siguiente, y cada error medido entra en la verificación que la IA lee antes de redactar.':
      'The AI is not retrained: it learns from examples. Each archived forecaster bulletin, with its observation, is added to the next day’s examples, and each measured error enters the verification the AI reads before writing.',
    'Es un producto experimental de apoyo al pronosticador: no reemplaza el pronóstico oficial.': 'This is an experimental product to support the forecaster: it does not replace the official forecast.',
    'Acierto contra lo observado': 'Verification against observations', 'Especialista': 'Forecaster', 'sin este período': 'no such period', 'se publica a las 16:00': 'published at 16:00', 'Criterio aplicado por la IA': 'Criteria applied by the AI',
    'Redactado con Claude (Anthropic) a partir del WRF, el oleaje WW3 y los boletines archivados del especialista. Producto experimental de apoyo; no reemplaza el pronóstico oficial.': 'Written with Claude (Anthropic) from the WRF, WW3 waves and the forecaster’s archived bulletins. Experimental support product; it does not replace the official forecast.',
    'Aún no hay pronósticos WRF + IA: el equipo local los genera una vez al día con la corrida 12Z del WRF.': 'There are no WRF + AI forecasts yet: the local computer generates them once a day with the WRF 12Z run.',
    // MONAN
    'Modelo MONAN 3 km': 'MONAN 3 km model', 'Cargando la corrida…': 'Loading the model run…', '⌖ Ir a la malla': '⌖ Go to the mesh', 'Campo': 'Field', 'Temperatura a 2 m (°C)': '2 m temperature (°C)',
    'Precipitación acumulada (mm)': 'Accumulated precipitation (mm)', 'Corrida': 'Run', 'Comparación con el pronóstico local': 'Comparison with the local forecast', 'Verificación diaria contra estaciones': 'Daily verification against stations',
    'Mapa del modelo MONAN': 'MONAN model map', 'Plazo anterior': 'Previous lead time', 'Plazo': 'Lead time', 'Plazo siguiente': 'Next lead time',
    'No hay bahías con pronóstico oficial dentro de la malla de esta corrida.': 'There are no bays with an official forecast inside the mesh of this run.', 'sin este día': 'no such day',
    'La corrida de MONAN publicada no cubre días desde hoy en adelante; la comparación aparece con la próxima corrida.': 'The published MONAN run does not cover days from today onwards; the comparison will appear with the next run.',
    'La verificación se publica una vez al día.': 'The verification is published once a day.', 'sin días aún': 'no days yet', 'Celda': 'Cell', 'Distancia a la celda': 'Distance to the cell', 'Acierto': 'Score',
    'Sesgo int.': 'Wind speed bias', 'Observado − pronosticado': 'Observed − forecast', '|Error Tmáx|': '|Tmax error|', 'Últimos días evaluados': 'Latest days evaluated', 'Viento MONAN / obs.': 'MONAN wind / obs.', 'Tmáx MONAN / obs.': 'MONAN Tmax / obs.',
    'Aún no hay días completos para evaluar: se necesita una corrida que cubra el día completo (08:00 a 20:00) con 12 h de anticipación.': 'There are no complete days to evaluate yet: a run covering the whole day (08:00 to 20:00) with 12 h of lead time is needed.',
    'No se pudo leer la corrida de MONAN.': 'The MONAN run could not be read.',
    // Hielos
    'Península Antártica y Paso Drake': 'Antarctic Peninsula and Drake Passage', 'Satélite diario': 'Daily satellite', 'Concentración': 'Concentration', '% concentración (AMSR2)': '% concentration (AMSR2)', 'Etapa de desarrollo': 'Stage of development',
    'Pronóstico Antártica': 'Antarctic forecast', 'Carta de hielo marino': 'Sea ice chart', 'Concentración satelital diaria (AMSR2)': 'Daily satellite concentration (AMSR2)', 'Concentración (décimos)': 'Concentration (tenths)',
    '% de concentración (AMSR2)': '% concentration (AMSR2)', 'Ninguna': 'None', 'Opacidad': 'Opacity', 'Mostrar en azul el mar sin hielo': 'Show ice-free sea in blue', 'Leyenda': 'Legend', 'Capas adicionales': 'Additional layers',
    'Restablecer': 'Reset', 'Fondo del mapa': 'Map background', 'Hielo en cubierta (pronóstico)': 'Ice accretion on deck (forecast)', 'Posible acumulación en cubierta': 'Possible ice accretion on vessel decks',
    'Tasa de acumulación (cm/h) según el modelo GFS, de 45° a 75° S y de 90° a 50° W.': 'Icing rate (cm/h) from the GFS model, from 45° to 75° S and from 90° to 50° W.', 'Témpanos informados': 'Reported icebergs',
    'Informe glaciológico de las bases': 'Ice reports from the Antarctic bases', 'Cartas regionales y otros productos': 'Regional charts and other products',
    'Cartas de hielo y productos publicados en la sección «Monitoreo de hielos» del': 'Ice charts and products published in the “Floating Ice” section of the', 'sitio público de meteorología marítima': 'public marine meteorology website',
    '. Se usa solo el área del mapa de cada carta, georreferenciada en la misma proyección.': '. Only the map area of each chart is used, georeferenced in the same projection.',
    'Carta de hielo': 'Ice chart', 'Opacidad de la carta': 'Chart opacity', 'Animar los plazos': 'Animate lead times', 'Plazo del pronóstico': 'Forecast lead time', 'Mapa de hielos': 'Ice map', 'Volver a la vista inicial': 'Back to the initial view',
    'Leyenda · etapa de desarrollo': 'Legend · stage of development', 'Leyenda · % de concentración': 'Legend · % concentration', 'Leyenda · concentración': 'Legend · concentration', 'Leyenda · concentración satelital': 'Legend · satellite concentration',
    'Sin carta de hielo seleccionada.': 'No ice chart selected.', 'carta original ↗': 'original chart ↗', 'El análisis satelital diario no está disponible por ahora.': 'The daily satellite analysis is not available for now.',
    'Análisis': 'Analysis', 'Ver la carta publicada': 'View the published chart', 'Información del mapa': 'Map information', 'Fecha de la carta': 'Chart date', 'Fuente': 'Source', 'Estereográfica polar': 'Polar stereographic',
    'Proyección de la carta': 'Chart projection', 'Témpanos': 'Icebergs', 'Capa apagada': 'Layer off', 'Hielo en cubierta': 'Ice accretion on deck', 'Sin datos de hielo por ahora': 'No ice data for now',
    'Satélite AMSR2 diario (Bremen, procesado en MeteoIA)': 'Daily AMSR2 satellite (Bremen, processed in MeteoIA)', 'Satélite AMSR2 (Universidad de Bremen)': 'AMSR2 satellite (University of Bremen)', 'Carta de hielo publicada': 'Published ice chart',
    'Témpano': 'Iceberg', 'Tamaño (MN)': 'Size (NM)', 'Tamaño': 'Size', 'Posición': 'Position', 'Informados en el pronóstico de la Zona IX. Clic para ubicarlos.': 'Reported in the Area IX forecast. Click to locate them.', 'Sin témpanos informados.': 'No icebergs reported.',
    'texto original ↗': 'original text ↗', 'Cartas regionales (imagen original):': 'Regional charts (original image):', 'concentración': 'concentration', 'etapa': 'stage',
    'Tierra (costa)': 'Land (coastline)', 'Grilla (cada 10° y 5°)': 'Graticule (every 10° and 5°)', 'METAREA XV (áreas VII a X)': 'METAREA XV (areas VII to X)', 'Límites marítimos': 'Maritime boundaries', 'Toponimia': 'Place names',
    'Informe glaciológico (bases)': 'Ice reports (Antarctic bases)', 'Isobaras GFS': 'GFS isobars', 'Imagen satelital IR': 'IR satellite image', 'Imagen satelital visible': 'Visible satellite image',
    'Relieve y batimetría': 'Relief and bathymetry', 'Oscuro': 'Dark', 'Claro (como la carta)': 'Light (like the chart)',
    'Hielo nuevo': 'New ice', 'Hielo joven': 'Young ice', 'Hielo de primer año': 'First-year ice', 'Hielo viejo': 'Old ice', 'Hielo fijo': 'Fast ice', 'Agua libre': 'Open water', 'Aguas libres': 'Open water',
    'Zona Norte': 'Northern Zone', 'Zona Central': 'Central Zone', 'Zona Central Sur': 'South-Central Zone', 'Zona Sur': 'Southern Zone', 'Zona Austral': 'Austral Zone', 'Zona Antártica': 'Antarctic Zone', 'Tierra del Fuego': 'Tierra del Fuego',
    // Toponimia de la carta de hielos
    'Paso Drake': 'Drake Passage', 'Mar de Weddell': 'Weddell Sea', 'Mar de Bellingshausen': 'Bellingshausen Sea', 'Mar de Amundsen': 'Amundsen Sea', 'Estrecho Bransfield': 'Bransfield Strait', 'Península Antártica': 'Antarctic Peninsula',
    'Cabo de Hornos': 'Cape Horn', 'Islas Shetland del Sur': 'South Shetland Islands', 'Isla Rey Jorge': 'King George Island', 'Isla Livingston': 'Livingston Island', 'Isla Decepción': 'Deception Island', 'Isla Elefante': 'Elephant Island',
    'Estrecho Gerlache': 'Gerlache Strait', 'Isla Adelaida': 'Adelaide Island', 'Bahía Margarita': 'Marguerite Bay', 'Isla Alejandro I': 'Alexander Island', 'Isla Pedro I': 'Peter I Island', 'Isla Thurston': 'Thurston Island',
    'Barrera de hielo Larsen': 'Larsen Ice Shelf', 'Barrera de hielo Ronne': 'Ronne Ice Shelf', 'Islas Orcadas del Sur': 'South Orkney Islands', 'Islas Georgias del Sur': 'South Georgia', 'Islas Sandwich del Sur': 'South Sandwich Islands',
    'Islas Diego Ramírez': 'Diego Ramírez Islands',
  });
  const hasta = s => s.replace(/viento hasta/g, 'wind up to').replace(/mar hasta/g, 'sea up to').replace(/y al mar \(hasta/, 'and sea (up to').replace(/\(hasta/g, '(up to').replace(/(\d),(\d)/g, '$1.$2');
  RX.push(
    // Pronósticos marítimos
    [/^(Hoy|Mañana), (.+)$/, (m, a, f) => `${a === 'Hoy' ? 'Today' : 'Tomorrow'}, ${f}`], [/^(Noche|Día) · (.+)$/, (m, a, f) => `${a === 'Noche' ? 'Night' : 'Day'} · ${f}`],
    [/^(.*?)Condiciones adversas: extreme las precauciones(.*)\.$/, (m, a, r) => `${a ? (EX[a.replace(/ · $/, '')] || a.replace(/ · $/, '')) + ' · ' : ''}Adverse conditions: take extreme precautions${hasta(r)}.`],
    [/^Condiciones moderadas: atención al viento(.*)\.$/, (m, r) => `Moderate conditions: watch the wind${hasta(r)}.`],
    [/^Sin viento ni mar relevantes en el pronóstico de este día(.*)\.$/, (m, r) => `No significant wind or sea in the forecast for this day${hasta(r)}.`],
    [/^(.*?) · viento$/, (m, a) => `${a} · wind`], [/^Estación (.+) \(a (\d+) km\)\.$/, (m, n, k) => `Station ${n} (${k} km away).`], 
    [/^(\d+) de (\d+) bahías y áreas con pronóstico · revisado (.+) \(hora Chile\)$/, (m, a, b, f) => `${a} of ${b} bays and areas with a forecast · checked ${f} (Chile time)`],
    [/^(.+) \(pronóstico general marítimo\)$/, (m, a) => `${a} (general marine forecast)`], [/^(.+) \(general\)$/, (m, a) => `${a} (general)`],
    // WRF
    [/^(\d+) de (\d+) lugares con pronóstico · revisado (.+) \(hora Chile\)$/, (m, a, b, f) => `${a} of ${b} places with a forecast · checked ${f} (Chile time)`],
    [/^Estación (.+?) · dato de las (\S*) \((\d+) min\)\.$/, (m, n, h, e) => `Station ${n} · observation at ${h} (${e} min ago).`],
    [/^No hay una estación costera cercana con datos recientes\.(?: Pronóstico de hoy:)?$/, m => 'There is no nearby coastal station with recent data.' + (/hoy/.test(m) ? ' Today’s forecast:' : '')],
    [/^Generado (.+) \(hora Chile\) · corrida WRF (.+)$/, (m, f, c) => `Generated ${f} (Chile time) · WRF run ${c}`], [/^Oleaje: (.+)$/, (m, r) => 'Waves: ' + r],
    [/^, viento (.+)$/, (m, r) => ', wind ' + r], [/^, oleaje (.+)$/, (m, r) => ', waves ' + r],
    // WRF + IA
    [/^Pronóstico de bahía redactado con IA a partir del WRF (.+) UTC y el oleaje WW3 · generado (.+) \(hora Chile\)$/, (m, c, f) => `Bay forecast written with AI from the WRF ${c} UTC run and WW3 waves · generated ${f} (Chile time)`],
    [/^Promedio de los días evaluados con la estación de capitanía de puerto \(pauta O\.P\.I\. N° 1104: dirección, intensidad y temperatura máxima, 08:00–20:00\)\.(?: Último día evaluado \((.+?)\): WRF \+ IA (\S+) %(?:, especialista (\S+) %)?(?:, WRF (\S+) %)?\.)?$/,
      (m, f, a, b, c) => 'Average of the days evaluated with the harbour master’s station (guideline O.P.I. N° 1104: wind direction, wind speed and maximum temperature, 08:00–20:00).' + (f ? ` Latest day evaluated (${f}): WRF + AI ${a} %${b ? `, forecaster ${b} %` : ''}${c ? `, WRF ${c} %` : ''}.` : '')],
    [/^(.+) · (noche 20:00–08:00|día 08:00–20:00)$/, (m, f, p) => `${f} · ${p.startsWith('noche') ? 'night 20:00–08:00' : 'day 08:00–20:00'}`], [/^Pronóstico de bahía · (.+)$/, (m, b) => `Bay forecast · ${b}`],
    [/^(WRF \+ IA|Especialista|WRF) · (\d+) d$/, (m, n, d) => `${EX[n] || n} · ${d} d`],
    // MONAN
    [/^Temperatura a 2 m: (.+)$/, (m, r) => '2 m temperature: ' + r], [/^Precipitación acumulada: (.+)$/, (m, r) => 'Accumulated precipitation: ' + r], [/^Celda sobre (tierra|mar) · (.+)$/, (m, t, r) => `Cell over ${t === 'tierra' ? 'land' : 'sea'} · ${r}`],
    [/^Viento (.+) kt · T máx\. (.+) °C$/, (m, v, t) => `Wind ${v.replace('calma', 'calm')} kt · Tmax ${t} °C`], [/^(.*) · T máx\. (.+) °C$/, (m, a, t) => `${a} · Tmax ${t} °C`],
    [/^MONAN en la celda más cercana al punto de la bahía \((.+) km\), entre las 08:00 y las 20:00\. Boletín oficial emitido (.+)\.$/, (m, k, e) => `MONAN at the cell nearest to the bay point (${k} km), between 08:00 and 20:00. Official bulletin issued ${e}.`],
    [/^Pauta O\.P\.I\. N° 1104 \(dirección, intensidad y temperatura máxima, 08:00–20:00\) con la corrida iniciada a lo menos 12 h antes del día\. Corridas archivadas: (\d+)\.$/, (m, n) => `Guideline O.P.I. N° 1104 (wind direction, wind speed and maximum temperature, 08:00–20:00) with the run started at least 12 h before the day. Archived runs: ${n}.`],
    [/^⚠ Corrida de hace (\d+) h, aún no llega una más reciente\.$/, (m, h) => `⚠ Run from ${h} h ago; a more recent one has not arrived yet.`],
    [/^Corrida (.+) · (\d+) plazos cada 3 h hasta \+(\d+) h · (.+)$/, (m, c, n, h, f) => `Run ${c} · ${n} lead times every 3 h to +${h} h · ${f}`],
    [/^Inicio (.+) \(hora Chile\) · (.+) celdas · plazos cada 3 h hasta \+(\d+) h\.$/, (m, f, n, h) => `Start ${f} (Chile time) · ${n} cells · lead times every 3 h to +${h} h.`],
    [/^(.+)\. Corrida experimental en un computador propio: no constituye pronóstico oficial\.$/, (m, f) => `${f}. Experimental run on a private computer: it is not an official forecast.`],
    // Hielos
    [/^Carta actualizada el (.+) ·$/, (m, f) => `Chart updated on ${f} ·`], [/^Hielo marino (.+)$/, (m, n) => `Sea ice ${n}`], [/^Borde de hielo \((.+) %\)$/, (m, v) => `Ice edge (${v.replace(',', '.')} %)`],
    [/^Análisis satelital del (.+) · ASI AMSR2, Universidad de Bremen, grilla de (.+) km ·$/, (m, f, k) => `Satellite analysis of ${f} · ASI AMSR2, University of Bremen, ${k.replace(',', '.')} km grid ·`],
    [/^La carta de hielo publicada es del$/, () => 'The published ice chart is dated'], [/^\(hace (\d+) días\)\. Se muestra la concentración satelital diaria AMSR2 del$/, (m, d) => `(${d} days ago). Showing the daily AMSR2 satellite concentration of`],
    [/^\. Se muestra la concentración satelital diaria AMSR2 del$/, () => '. Showing the daily AMSR2 satellite concentration of'],
    [/^(\d+) informados?$/, (m, n) => `${n} reported`], [/^Revisado (.+) \(hora Chile\)$/, (m, f) => `Checked ${f} (Chile time)`], [/^(.+) \(satélite\)$/, (m, f) => `${f} (satellite)`], [/^(\+\d+ h) \(sin acumulación\)$/, (m, h) => `${h} (no icing)`],
    [/^Témpano (.+) · (.+) MN$/, (m, n, t) => `Iceberg ${n} · ${t} NM`], [/^Témpano (.+)$/, (m, n) => `Iceberg ${n}`], [/^(.+) millas náuticas$/, (m, t) => `${t} nautical miles`],
    [/^Informe glaciológico del (.+)$/, (m, f) => `Ice report of ${f}`], [/^Informe del (.+) ·$/, (m, f) => `Report of ${f} ·`], [/^(.+) \(sin color\)$/, (m, n) => `${EX[n] || n} (no colour)`], [/^(\d+)–(\d+) décimos$/, (m, a, b) => `${a}–${b} tenths`],
      // Genéricas: siempre al final
    [/^(.+) \(hora Chile\)$/, (m, f) => `${f} (Chile time)`], [/^(.+) \(hora local\)$/, (m, f) => `${f} (local time)`],
  );
  // Pronósticos redactados en español (análisis WRF y borradores WRF + IA): su traducción llega en data/traducciones_en.json,
  // que prepara el equipo local (mac/traducir_en.sh). Se aplica al texto completo o a la parte de un texto que lo contiene.
  let DIN = {}, DIN_K = [];
  // Las listas muestran solo el inicio del viento (hasta la primera coma): al cargar se agrega ese mismo recorte en inglés.
  // Los textos cortos (menos de 12 letras) solo se reemplazan cuando son el texto completo, para no alterar otras frases.
  const din = s => { if (Object.prototype.hasOwnProperty.call(DIN, s)) return DIN[s]; for (const k of DIN_K) if (s.includes(k)) s = s.split(k).join(DIN[k]); return s; };
  Object.assign(EX, { 'Cubierto': 'Overcast', 'Nublado': 'Cloudy', 'Parcial': 'Partly cloudy', 'Despejado': 'Clear' });
  RX.unshift([/^(Cubierto|Nublado|Parcial|Despejado) · (.+)$/, (m, a, b) => `${EX[a]} · ${b}`]);
  const fallas = window.__i18nSinTraducir = new Set();
  function traducir(s) {
    const k = s.replace(/\s+/g, ' ').trim(); if (!k) return null;
    // Número suelto con coma decimal (p. ej. «13,5 °C»): punto decimal.
    if (/^[+−-]?\d+,\d{1,2}(\s?[°%A-Za-z/²]{0,6})?$/.test(k)) return s.replace(/(\d),(\d)/, '$1.$2');
    if (!/[A-Za-zÁÉÍÓÚáéíóúñ]{2}/.test(k)) return null;
    let r = Object.prototype.hasOwnProperty.call(EX, k) ? EX[k] : null;
    if (r == null) for (const [re, f] of RX) { const m = k.match(re); if (m) { r = f(...m); break; } }
    if (r != null) r = din(r); else { const d = din(k); if (d !== k) r = d; }
    if (r == null) { if (/[áéíóúñ¿¡]| (de|del|la|el|los|las|en|con|sin|por|para) /i.test(k)) fallas.add(k); return null; }
    return s.replace(/^(\s*)[\s\S]*?(\s*)$/, (m, a, b) => a + r + b);
  }
  let hechos = new WeakMap(); const ATR = ['title', 'placeholder', 'aria-label', 'alt'];
  const omitir = e => !e || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(e.tagName) || (e.closest && e.closest('[data-i18n="no"]'));
  function nodoTexto(n) {
    if (hechos.get(n) === n.nodeValue || omitir(n.parentElement)) return;
    // Rótulo de dos líneas: este nodo, un <br> y otro nodo de texto.
    const br = n.nextSibling, sig = br && br.nodeName === 'BR' ? br.nextSibling : null;
    if (sig && sig.nodeType === 3) { const par = PARES[n.nodeValue.trim() + '|' + sig.nodeValue.trim()]; if (par) { n.nodeValue = par[0]; sig.nodeValue = par[1]; hechos.set(n, par[0]); hechos.set(sig, par[1]); return; } }
    const t = traducir(n.nodeValue); if (t != null && t !== n.nodeValue) n.nodeValue = t; hechos.set(n, n.nodeValue);
  }
  function elemento(e) {
    if (omitir(e)) return;
    for (const a of ATR) { const v = e.getAttribute && e.getAttribute(a); if (v) { const t = traducir(v); if (t != null && t !== v) e.setAttribute(a, t); } }
  }
  function recorrer(raiz) {
    if (raiz.nodeType === 3) return nodoTexto(raiz);
    if (raiz.nodeType !== 1 || omitir(raiz)) return;
    elemento(raiz); raiz.querySelectorAll('[title],[placeholder],[aria-label],[alt]').forEach(elemento);
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT), ns = []; while (w.nextNode()) ns.push(w.currentNode); ns.forEach(nodoTexto);
  }
  function titulo() { const t = traducir(document.title); if (t != null && t !== document.title) document.title = t; }
  function iniciar() {
    boton(); recorrer(document.body); titulo();
    fetch('data/traducciones_en.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => { if (!j || !j.t) return; DIN = j.t; for (const k in DIN) DIN[k] = DIN[k].replace(/\bmgp\b/g, 'gpm'); { const ce = t => { const x = t.split(/,| y |;| en la | durante /)[0].trim(); return x.length > 24 ? x.slice(0, 23) + '…' : x; }, ci = t => { const x = t.split(/,| and |;| in the | during /)[0].trim(); return x.length > 24 ? x.slice(0, 23) + '…' : x; }; for (const k of Object.keys(DIN)) { const f = ce(k); if (f !== k && !(f in DIN)) DIN[f] = ci(DIN[k]); } } DIN_K = Object.keys(DIN).filter(k => k.length >= 12).sort((a, b) => b.length - a.length); hechos = new WeakMap(); recorrer(document.body); }).catch(() => {});
    new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') nodoTexto(m.target); else if (m.type === 'attributes') elemento(m.target); else m.addedNodes.forEach(recorrer); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATR });
    const nota = document.createElement('div'); nota.dataset.i18n = 'no'; nota.style.cssText = 'text-align:center;color:#8fa7bf;font-size:12px;padding:4px 16px 46px';
    nota.textContent = 'English version of the interface. Official forecasts and warnings are shown in their original Spanish; WRF and WRF + AI forecast texts are machine-translated from the Spanish original. The Surface Chart, Navigation Routes and Development pages are not translated yet.';
    if (document.querySelector('nav.nav')) document.body.appendChild(nota); else { const bi = document.getElementById('btnIdioma'); if (bi) bi.title = 'Ver la página en español. ' + nota.textContent; }
    // Rótulos escritos desde la hoja de estilos (WRF + IA).
    const st = document.createElement('style'); st.textContent = ".como summary::after{content:'Show ▾'!important}.como[open] summary::after{content:'Hide ▴'!important}"; if (document.querySelector('details summary') && /wrfia/.test(location.pathname)) document.head.appendChild(st);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
