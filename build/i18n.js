// Versión en inglés de la portada. El idioma se elige con el botón «English / Español» (queda guardado en el navegador)
// o con ?lang=en en la dirección. Con el inglés activo, este archivo traduce el texto de la interfaz a medida que la
// página lo escribe; el código de la página no cambia. Terminología marítima según la versión en inglés del sitio
// meteorológico de la autoridad marítima (Warnings, Gales, Swell-Surges, Coastal Areas, High Seas, Sea Ice…).
// Los boletines y avisos oficiales, y los pronósticos redactados en español, se muestran en su idioma original.
(function () {
  let lang = 'es';
  try { const q = new URLSearchParams(location.search).get('lang'); if (q === 'en' || q === 'es') localStorage.setItem('meteoia_lang', q); lang = localStorage.getItem('meteoia_lang') === 'en' ? 'en' : 'es'; } catch (e) { /* sin almacenamiento */ }
  window.METEOIA_LANG = lang;
  const cambiar = () => { try { localStorage.setItem('meteoia_lang', lang === 'en' ? 'es' : 'en'); } catch (e) { /* sin almacenamiento */ } const u = new URL(location.href); if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); location.replace(u.pathname + u.search + u.hash); } else location.reload(); };
  function boton() {
    if (document.getElementById('btnIdioma')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'btnIdioma'; b.className = 'btnVideo'; b.lang = lang === 'en' ? 'es' : 'en';
    b.textContent = lang === 'en' ? 'Español' : 'English'; b.title = lang === 'en' ? 'Ver la página en español' : 'View this page in English'; b.dataset.i18n = 'no'; b.onclick = cambiar;
    const v = document.querySelector('.btnVideo'); if (v && v.parentNode) v.parentNode.insertBefore(b, v); else { b.style.cssText = 'position:fixed;top:8px;right:8px;z-index:9999'; document.body.appendChild(b); }
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
    'Fecha del pronóstico (hora de Chile)': 'Forecast time (Chile time)', 'Reproducir': 'Play', 'Pausar': 'Pause', 'Flechas de dirección del viento': 'Wind direction arrows',
    'Fecha del pronóstico de viento ECMWF': 'ECMWF wind forecast time', 'Fecha anterior': 'Previous time', 'Fecha siguiente': 'Next time', 'Avance de la corrida ECMWF': 'ECMWF run progress',
    'Escala de viento de cero a sesenta y cuatro nudos o más': 'Wind scale from zero to sixty-four knots or more',
    'Viento medio a 10 m. Pulsa el mapa para ver rapidez, dirección y ráfaga máxima del período.': 'Mean wind at 10 m. Tap the map for speed, direction and maximum gust of the period.',
    'Actualización y alcance': 'Updates and coverage',
    'Modelo global IFS del Centro Europeo (ECMWF) en su resolución nativa de 0,1° (≈ 9 km), recortado a la franja costera entre 17° S y 57° S. Datos abiertos con licencia CC-BY-4.0. Las flechas indican hacia dónde sopla el viento; la dirección del texto es la de procedencia. Se usan las corridas de 00 y 12 UTC; MeteoIA revisa cada 20 minutos si hay una nueva.':
      'ECMWF IFS global model at its native 0.1° resolution (≈ 9 km), cropped to the coastal strip between 17° S and 57° S. Open data under the CC-BY-4.0 licence. Arrows show where the wind is blowing to; directions in the text are where it comes from. The 00 and 12 UTC runs are used; MeteoIA checks for a new run every 20 minutes.',
    'Viento medio a 10 m': 'Mean wind at 10 m', 'Ráfaga máxima del período:': 'Maximum gust of the period:', 'No se pudo mostrar esta fecha del viento ECMWF.': 'This ECMWF wind time could not be displayed.',
    'El viento ECMWF aún no está disponible. Se publica con la próxima corrida del modelo.': 'ECMWF wind is not available yet. It will be published with the next model run.',
    // Oleaje WW3
    'Control de oleaje WW3': 'WW3 wave control', 'Fuente NOAA ↗': 'NOAA source ↗', 'Flechas de dirección del oleaje': 'Wave direction arrows', 'Fecha del pronóstico de oleaje WW3': 'WW3 wave forecast time',
    'Avance de la corrida WW3': 'WW3 run progress', 'Escala de altura significativa de cero a ocho metros o más': 'Significant wave height scale from zero to eight metres or more',
    'Altura significativa de ola. Pulsa el mar para ver altura, período y dirección, con el mar de viento y el mar de fondo por separado.': 'Significant wave height. Tap the sea for height, period and direction, with wind sea and swell shown separately.',
    'Modelo global WAVEWATCH III de NOAA (GFS-Wave), resolución 0,25° (≈ 28 km), mostrado en una grilla de 0,5°. Apto para alta mar y áreas costeras; no resuelve el interior de bahías. Las flechas indican hacia dónde avanza el oleaje; la dirección del texto es la de procedencia. MeteoIA revisa cada 20 minutos si hay una corrida nueva (el modelo corre cada 6 horas).':
      'NOAA WAVEWATCH III global model (GFS-Wave), 0.25° resolution (≈ 28 km), shown on a 0.5° grid. Suitable for high seas and coastal areas; it does not resolve the interior of bays. Arrows show where the waves are travelling to; directions in the text are where they come from. MeteoIA checks for a new run every 20 minutes (the model runs every 6 hours).',
    'Período pico:': 'Peak period:', '· Dirección:': '· Direction:', 'Mar de viento:': 'Wind sea:', 'Mar de fondo:': 'Swell:', 'no significativo': 'not significant', 'Altura significativa': 'Significant wave height',
    'No se pudo mostrar esta fecha del oleaje WW3.': 'This WW3 wave time could not be displayed.', 'El oleaje WW3 aún no está disponible. Se publica con la próxima corrida del modelo.': 'WW3 waves are not available yet. They will be published with the next model run.',
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
    'Aviso de marejadas': 'Swell-Surge Warning', 'Aviso de temporal': 'Gale Warning', 'Aviso de mal tiempo': 'Bad Weather Warning', 'Aviso especial · trombas marinas': 'Special Weather Warning · waterspouts', 'Aviso de temporal · Zona IX': 'Gale Warning · Area IX',
    // Estado de puerto
    'Estado de puerto': 'Port status', 'Consultando restricciones…': 'Checking restrictions…', 'Ver en SITPORT ↗': 'View in SITPORT ↗', 'Bahía': 'Bay', 'Restricción informada': 'Reported restriction', 'Restricción': 'Restriction', 'Toda la bahía': 'Whole bay',
    'La consulta no informa restricciones. Consulte el estado oficial en SITPORT.': 'No restrictions are reported. Check the official status in SITPORT.', 'SITPORT: bahía sin posición': 'SITPORT: bay without position',
    'No se pudo renovar la consulta. Se conserva la última información mostrada.': 'The query could not be refreshed. The last information shown is kept.',
    'No se pudo consultar SITPORT ni su copia publicada. Estado no disponible.': 'Neither SITPORT nor its published copy could be reached. Status unavailable.',
    // Condiciones actuales
    'Condiciones actuales': 'Current conditions', 'Viento': 'Wind', 'Oleaje': 'Waves', 'Temperatura del aire': 'Air temperature', 'Presión': 'Pressure', 'nivel del mar': 'sea level', 'sin dirección': 'no direction',
    'sin boya cercana con datos': 'no nearby buoy with data', 'Estación': 'Station', 'Lugar': 'Place',
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
    [/^Corrida (.+) \(hora de Chile\), (\d+) fechas: cada 3 horas hasta \+72 h y cada 6 horas hasta \+(\d+) h\.$/, (m, f, n, h) => `Run ${f} (Chile time), ${n} forecast times: every 3 hours to +72 h and every 6 hours to +${h} h.`],
    [/^Corrida (.+) \(hora de Chile\), (\d+) fechas cada 6 horas hasta \+(\d+) h\.$/, (m, f, n, h) => `Run ${f} (Chile time), ${n} forecast times every 6 hours to +${h} h.`],
    [/^(.+) · celda de 0[.,]1°\. Dirección de procedencia\.$/, (m, a) => `${a} · 0.1° cell. Direction the wind comes from.`],
    [/^(\S+) días$/, (m, v) => v + ' days'], [/^hace (.+)$/, (m, v) => tiempo(v) + ' ago'],
  ];
  const fallas = window.__i18nSinTraducir = new Set();
  function traducir(s) {
    const k = s.replace(/\s+/g, ' ').trim(); if (!k) return null;
    // Número suelto con coma decimal (p. ej. «13,5 °C»): punto decimal.
    if (/^[+−-]?\d+,\d{1,2}(\s?[°%A-Za-z/²]{0,6})?$/.test(k)) return s.replace(/(\d),(\d)/, '$1.$2');
    if (!/[A-Za-zÁÉÍÓÚáéíóúñ]{2}/.test(k)) return null;
    let r = Object.prototype.hasOwnProperty.call(EX, k) ? EX[k] : null;
    if (r == null) for (const [re, f] of RX) { const m = k.match(re); if (m) { r = f(...m); break; } }
    if (r == null) { if (/[áéíóúñ¿¡]| (de|del|la|el|los|las|en|con|sin|por|para) /i.test(k)) fallas.add(k); return null; }
    return s.replace(/^(\s*)[\s\S]*?(\s*)$/, (m, a, b) => a + r + b);
  }
  const hechos = new WeakMap(), ATR = ['title', 'placeholder', 'aria-label', 'alt'];
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
    new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') nodoTexto(m.target); else if (m.type === 'attributes') elemento(m.target); else m.addedNodes.forEach(recorrer); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATR });
    const nota = document.createElement('div'); nota.dataset.i18n = 'no'; nota.style.cssText = 'text-align:center;color:#8fa7bf;font-size:12px;padding:4px 16px 46px';
    nota.textContent = 'English version of the interface. Official forecasts and warnings are shown in their original Spanish; the other pages of the site are in Spanish.';
    document.body.appendChild(nota);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
