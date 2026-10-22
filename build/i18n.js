// Versión en inglés de las páginas (botón «English / Español»). La página se escribe en español y, si el visitante
// elige inglés, este script traduce en el navegador los textos de la interfaz, las etiquetas dinámicas y el vocabulario
// habitual de los pronósticos marítimos. Los textos largos redactados (análisis IA, boletines) se dejan en español.
(function () {
  let LANG = 'es';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'es') localStorage.setItem('mi_lang', q);
    LANG = localStorage.getItem('mi_lang') === 'en' ? 'en' : 'es';
  } catch (e) {}
  window.MI_LANG = LANG;

  // ---------------- Botón de idioma
  function boton() {
    if (document.getElementById('btnIdioma')) return;
    const st = document.createElement('style');
    st.textContent = '#btnIdioma{position:fixed;right:10px;bottom:30px;z-index:4001;display:flex;align-items:center;gap:6px;background:rgba(15,42,68,.9);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:16px;padding:5px 11px;font:600 12px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}#btnIdioma:hover{background:#1c4f84}#btnIdioma svg{width:14px;height:14px}@media print{#btnIdioma{display:none}}';
    document.head.appendChild(st);
    const b = document.createElement('button'); b.type = 'button'; b.id = 'btnIdioma'; b.setAttribute('data-noi18n', '');
    b.title = LANG === 'en' ? 'Ver la página en español' : 'View this page in English';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9Z"/></svg>' + (LANG === 'en' ? 'Español' : 'English');
    b.onclick = () => { try { localStorage.setItem('mi_lang', LANG === 'en' ? 'es' : 'en'); } catch (e) {} const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.toString()); };
    document.body.appendChild(b);
  }
  if (document.body) boton(); else document.addEventListener('DOMContentLoaded', boton);
  if (LANG !== 'en') return;
  document.documentElement.lang = 'en';

  // ---------------- Fechas y números en formato inglés
  const loc = l => (l === 'es-CL' || l === 'es') ? 'en-GB' : l;
  const dD = Date.prototype.toLocaleDateString, dS = Date.prototype.toLocaleString, dT = Date.prototype.toLocaleTimeString, nS = Number.prototype.toLocaleString;
  Date.prototype.toLocaleDateString = function (l, o) { return dD.call(this, loc(l), o); };
  Date.prototype.toLocaleString = function (l, o) { return dS.call(this, loc(l), o); };
  Date.prototype.toLocaleTimeString = function (l, o) { return dT.call(this, loc(l), o); };
  Number.prototype.toLocaleString = function (l, o) { return nS.call(this, loc(l), o); };

  // ---------------- Textos exactos de la interfaz (los saltos de línea \n corresponden a <br>)
  const D = {
    'Inteligencia artificial para decisiones marítimas más seguras': 'Artificial intelligence for safer maritime decisions',
    'Pronósticos\nMarítimos': 'Marine\nForecasts', 'Carta de\nSuperficie': 'Surface\nAnalysis', 'Monitoreo\nde Hielos': 'Sea Ice\nMonitoring', 'Pronósticos\nWRF + IA': 'WRF + AI\nForecasts', 'Dashboard\ncompleto': 'Full\nDashboard',
    'Inicio': 'Home', 'Mapa': 'Map', 'Pronósticos': 'Forecasts', 'Estaciones': 'Stations', 'Alertas': 'Alerts', 'Sugerencias': 'Feedback',
    'Capas': 'Layers', 'Viento GFS (color)': 'GFS wind (colour)', 'Viento GFS (flechas)': 'GFS wind (arrows)', 'Avisos vigentes y próximos': 'Current and upcoming warnings',
    'Puertos con restricción (SITPORT)': 'Ports with restrictions (SITPORT)', 'Boyas': 'Buoys', 'Mapa base': 'Base map', 'Imagen satelital': 'Satellite imagery',
    'Océano (claro)': 'Ocean (light)', 'Sin conexión (costa)': 'Offline (coastline)', 'Viento a 10 m (kt)': '10 m wind (kt)', 'Alertas y avisos': 'Alerts and warnings',
    'Mostrar todas en el mapa': 'Show all on the map', 'Ocultar todas del mapa': 'Hide all from the map', 'Dashboard →': 'Dashboard →', 'Condiciones actuales': 'Current conditions',
    'Viento': 'Wind', 'Oleaje': 'Waves', 'Temperatura del aire': 'Air temperature', 'Presión': 'Pressure', 'nivel del mar': 'sea level', 'sin boya cercana con datos': 'no nearby buoy with data',
    'Pronóstico marítimo': 'Marine forecast', 'Ver todos →': 'See all →', 'Bahías': 'Bays', 'Zonas costeras': 'Coastal zones', 'Alta mar': 'High seas',
    'Hoy': 'Today', 'Mañana': 'Tomorrow', 'Sin pronóstico para este día': 'No forecast for this day', 'Ver pronóstico completo →': 'See full forecast →',
    'Carta de superficie': 'Surface analysis', 'Ver mapa →': 'Open map →', 'Isobaras GFS cada 4 hPa · A: alta presión · B: baja presión': 'GFS isobars every 4 hPa · A: high pressure · B: low pressure',
    'Monitoreo de hielos': 'Sea ice monitoring', 'Concentración de hielo marino, Península Antártica': 'Sea ice concentration, Antarctic Peninsula', 'Sin hielo': 'Ice free',
    'Modelo WRF + IA': 'WRF + AI model', 'Ver detalle →': 'See details →', 'Hoy · pronóstico por bahía generado con IA a partir del modelo WRF': 'Today · bay forecasts generated by AI from the WRF model',
    'Mapa de viento y áreas marítimas': 'Map of wind and maritime areas', 'Buscar estación, bahía o área…': 'Search station, bay or area…', 'Buscar': 'Search', 'Ver todo Chile': 'View all of Chile',
    'Pantalla completa': 'Full screen', 'Estación': 'Station', 'Lugar': 'Place', 'Zoom in': 'Zoom in', 'Zoom out': 'Zoom out',
    'Visitas a la página (una por sesión del navegador). Estadísticas anónimas: no se usan cookies ni datos personales.': 'Page visits (one per browser session). Anonymous statistics: no cookies or personal data are used.',
    'Rojo': 'Red', 'Roja': 'Red', 'Amarilla': 'Yellow', 'Vigente': 'In force', 'Próximo': 'Upcoming', 'En mapa': 'On map', 'Oculta': 'Hidden', 'Mostrar u ocultar en el mapa': 'Show or hide on the map',
    'Clic para ubicarla en el mapa': 'Click to locate it on the map', 'operativa': 'operational', 'con retraso': 'delayed', 'no operativa': 'not operational',
    // dashboard
    'PRONÓSTICOS MARÍTIMOS': 'MARINE FORECASTS', 'CARTA DE SUPERFICIE': 'SURFACE ANALYSIS', 'MONITOREO DE HIELOS': 'SEA ICE MONITORING', 'PRONÓSTICOS WRF + IA': 'WRF + AI FORECASTS',
    'Actualizar': 'Refresh', '1 · Avisos meteorológicos': '1 · Weather warnings', 'Ver todos': 'Show all', 'Ocultar todos': 'Hide all', 'No hay avisos vigentes ni próximos.': 'No current or upcoming warnings.',
    'De norte a sur. Marque o desmarque cada aviso para verlo en el mapa; clic en el aviso para ubicarlo.': 'North to south. Tick or untick each warning to show it on the map; click a warning to locate it.',
    'sitio público de avisos': 'public warnings website', 'Mostrar avisos expirados': 'Show expired warnings', '2 · Operatividad de estaciones': '2 · Station availability',
    'Estado de la red': 'Network status', 'Operativas': 'Operational', 'Con retraso': 'Delayed', 'No operativas': 'Not operational', 'Sensor dudoso': 'Suspect sensor',
    'Cuadro de estado operativo': 'Operational status table', 'Todos los estados': 'All statuses', 'Con sensor dudoso': 'With suspect sensor', 'Todas las redes': 'All networks',
    'Capitanías de Puerto': 'Harbour Master offices', 'Red complementaria': 'Complementary network', 'Todas las subáreas': 'All sub-areas', 'Datos de estaciones desactualizados.': 'Station data out of date.',
    'Sub.': 'Sub.', 'Estado': 'Status', 'Último dato': 'Latest reading', 'Operativa': 'Operational', 'No operativa': 'Not operational', 'Fecha inválida en la fuente': 'Invalid date at source', 'Sin fecha': 'No date',
    'Redes:': 'Networks:', 'Criterio:': 'Criteria:', 'Sensor dudoso:': 'Suspect sensor:', 'Esri Océano': 'Esri Ocean', 'Esri Satélite': 'Esri Satellite', 'Sin conexión (costa incorporada)': 'Offline (built-in coastline)',
    'Costa: Natural Earth': 'Coastline: Natural Earth', 'Sin acceso a mapas en línea: se usa la costa incorporada.': 'Online maps unavailable: using the built-in coastline.', 'Operación': 'Operations',
    'Estaciones meteorológicas': 'Weather stations', 'Boyas meteoceanográficas': 'Met-ocean buoys', 'Pronóstico WRF + IA': 'WRF + AI forecast', 'Isobaras (presión, GFS)': 'Isobars (pressure, GFS)',
    'Imagen satelital IR (nubosidad)': 'IR satellite image (clouds)', 'Imagen satelital visible (nubosidad diurna)': 'Visible satellite image (daytime clouds)', 'Avisos meteorológicos': 'Weather warnings',
    'METAREA XV (subáreas)': 'METAREA XV (sub-areas)', 'Límites marítimos': 'Maritime boundaries', 'ZEE y plataforma continental (200 M)': 'EEZ and continental shelf (200 NM)', 'Zona contigua (24 M)': 'Contiguous zone (24 NM)',
    'Mar territorial (12 M)': 'Territorial sea (12 NM)', 'Simbología de estaciones': 'Station symbols', 'Capitanía de Puerto': 'Harbour Master office', 'Aviso vigente': 'Warning in force', 'Aviso próximo': 'Upcoming warning',
    'Carta ↗': 'Chart ↗', 'MeteoIA es una página pública y': 'MeteoIA is a public,', 'sin fines de lucro': 'non-profit website',
    ', creada para apoyar la toma de decisiones y la seguridad en la navegación.': ', created to support decision-making and safety of navigation.', 'Cualquier sugerencia o comentario será bienvenido. Envíelo a:': 'Any suggestion or comment is welcome. Please send it to:',
    'Instalar en el celular': 'Install on your phone', 'Vuelve a leer los datos publicados': 'Reload the published data', 'Envíe sus sugerencias o comentarios': 'Send your suggestions or comments',
    'Replegar panel': 'Collapse panel', 'Buscar estación…': 'Search station…', 'Buscar estación': 'Search station', 'Filtrar por estado': 'Filter by status', 'Filtrar por red': 'Filter by network',
    'Filtrar por subárea': 'Filter by sub-area', 'Mapa operativo': 'Operational map', 'Contraer o expandir capas': 'Collapse or expand layers', 'Cerrar': 'Close', 'MeteoIA · página principal': 'MeteoIA · home page',
    'Pronósticos publicados para bahías, áreas marítimas, alta mar (Zona X) y Antártica, con mapa': 'Published forecasts for bays, maritime areas, high seas (Zone X) and Antarctica, with map',
    'Carta de superficie en proyección estereográfica polar: isobaras GFS, frentes, avisos, METAREA XV, estaciones y boyas': 'Surface analysis in polar stereographic projection: GFS isobars, fronts, warnings, METAREA XV, stations and buoys',
    'Cartas de hielo marino de la Península Antártica, hielo en cubierta, témpanos e informe glaciológico, en proyección polar': 'Antarctic Peninsula sea ice charts, ice accretion, icebergs and ice report, in polar projection',
    'Pronósticos por bahía generados con IA a partir del modelo WRF, con mapa': 'Bay forecasts generated by AI from the WRF model, with map',
    'Visitas a esta página (se cuenta una por sesión del navegador). Estadísticas de uso anónimas y agregadas: no se usan cookies ni se recopilan datos personales.': 'Page visits (one per browser session). Anonymous, aggregated usage statistics: no cookies and no personal data.',
    // carta polar
    'Proyección estereográfica polar': 'Polar stereographic projection', '‹ Volver': '‹ Back', 'al dashboard': 'to dashboard', 'al inicio': 'to home', 'Volver al dashboard (Esc)': 'Back to the dashboard (Esc)',
    'Volver a la página principal (Esc)': 'Back to the home page (Esc)', 'Restablecer': 'Reset', 'Fondo del mapa': 'Map background', 'Opacidad de imágenes': 'Image opacity', 'Opacidad de las imágenes': 'Image opacity',
    'Se aplica a la carta original y a las imágenes satelitales IR y visible.': 'Applies to the original chart and the IR and visible satellite images.', 'Simbología': 'Legend',
    'Frente frío': 'Cold front', 'Frente cálido': 'Warm front', 'Frente ocluido': 'Occluded front', 'Frente estacionario': 'Stationary front', 'Alta presión': 'High pressure', 'Baja presión': 'Low pressure',
    'Isobara (hPa)': 'Isobar (hPa)', 'Carta original': 'Original chart', 'Imagen satelital IR': 'IR satellite image', 'Imagen satelital visible': 'Visible satellite image', 'Isobaras (GFS)': 'Isobars (GFS)',
    'Frentes': 'Fronts', 'Altas / Bajas (GFS)': 'Highs / Lows (GFS)', 'Grilla': 'Grid', 'Avisos': 'Warnings', 'Costa': 'Coastline', 'Relieve y batimetría': 'Relief and bathymetry', 'Oscuro': 'Dark',
    'Claro (como la carta)': 'Light (like the chart)', 'Producto': 'Product', 'Isobaras GFS cada 4 hPa': 'GFS isobars every 4 hPa', 'Frentes y centros A/B del análisis de superficie': 'Fronts and A/B centres from the surface analysis',
    'Válida:': 'Valid:', 'Ajustar a la carta completa': 'Fit to the whole chart', 'Volver a las capas, el fondo y la opacidad iniciales': 'Restore the default layers, background and opacity',
    // pronósticos marítimos
    'Pronósticos marítimos · Bahías y áreas': 'Marine forecasts · Bays and areas', 'Pronósticos WRF + IA': 'WRF + AI forecasts', '← Volver al inicio': '← Back to home', 'Pronósticos por bahía y área': 'Forecasts by bay and area',
    'De norte a sur. Elija el sector y el día; clic en un lugar (en la lista o en el mapa) para ver el pronóstico completo.': 'North to south. Choose the sector and the day; click a place (in the list or on the map) to see the full forecast.',
    'Área': 'Area', 'indica un pronóstico para un área o ruta marítima, no para una bahía.': 'marks a forecast for a maritime area or route, not a bay.', 'Todos los sectores': 'All sectors', 'Norte': 'North',
    'Centro norte': 'North-central', 'Islas oceánicas': 'Oceanic islands', 'Centro sur': 'South-central', 'Sur': 'South', 'Austral': 'Far south', 'Antártica': 'Antarctica', 'Alta mar (Zona X)': 'High seas (Zone X)',
    'Costa (pronóstico general marítimo)': 'Coast (general marine forecast)', 'Situación sinóptica': 'Synoptic situation', 'Período': 'Period', 'Mín/Máx': 'Min/Max', 'Nubosidad': 'Cloud cover', 'Mar': 'Sea', 'Día': 'Day',
    'Noche': 'Night', 'Pronóstico ↗': 'Forecast ↗', 'Texto original ↗': 'Original text ↗', 'Pronóstico general de 24 h': '24 h general forecast', 'Aviso de temporal': 'Gale warning', 'Sector': 'Sector',
    'Mapa de pronósticos': 'Forecast map', 'MeteoIA · volver al inicio': 'MeteoIA · back to home', 'sitio público de pronósticos': 'public forecasts website', 'referencial': 'for reference only', ': no reemplaza los avisos oficiales.': ': it does not replace official warnings.',
    'Pronósticos publicados para bahías, áreas y rutas marítimas, transcritos automáticamente desde los textos del': 'Forecasts published for bays, areas and maritime routes, transcribed automatically from the texts of the',
    // hielos
    'Península Antártica y Paso Drake': 'Antarctic Peninsula and Drake Passage', 'Concentración': 'Concentration', '% concentración (AMSR2)': '% concentration (AMSR2)', 'Etapa de desarrollo': 'Stage of development',
    'Pronóstico Antártica': 'Antarctic forecast', 'Carta de hielo marino': 'Sea ice chart', 'Concentración (décimos)': 'Concentration (tenths)', '% de concentración (AMSR2)': '% concentration (AMSR2)', 'Ninguna': 'None',
    'Opacidad': 'Opacity', 'Mostrar en azul el mar sin hielo': 'Show ice-free sea in blue', 'Leyenda': 'Legend', 'Leyenda · concentración': 'Legend · concentration', 'Leyenda · etapa de desarrollo': 'Legend · stage of development',
    'Leyenda · % de concentración': 'Legend · % concentration', 'Sin hielo (sin color)': 'Ice free (no colour)', 'Hielo fijo': 'Fast ice', 'Barrera de hielo': 'Ice shelf', 'Hielo no definido': 'Undetermined ice',
    'carta original ↗': 'original chart ↗', 'Capas adicionales': 'Additional layers', 'Tierra (costa)': 'Land (coastline)', 'Grilla (cada 10° y 5°)': 'Grid (every 10° and 5°)', 'METAREA XV (áreas VII a X)': 'METAREA XV (areas VII to X)',
    'Toponimia': 'Place names', 'Témpanos informados': 'Reported icebergs', 'Informe glaciológico (bases)': 'Ice report (bases)', 'Isobaras GFS': 'GFS isobars', 'Hielo en cubierta (pronóstico)': 'Ice accretion on deck (forecast)',
    'Posible acumulación en cubierta': 'Possible ice accretion on deck', 'Plazo': 'Lead time', 'Témpano': 'Iceberg', 'Tamaño (MN)': 'Size (NM)', 'Posición': 'Position',
    'Informados en el pronóstico de la Zona IX. Clic para ubicarlos.': 'Reported in the Zone IX forecast. Click to locate them.', 'Informe glaciológico de las bases': 'Ice report from the bases', 'texto original ↗': 'original text ↗',
    'Cartas regionales y otros productos': 'Regional charts and other products', 'Cartas regionales (imagen original):': 'Regional charts (original image):', 'concentración': 'concentration', 'etapa': 'stage',
    'Carta de témpanos': 'Iceberg chart', 'Imagen de radar de apertura sintética (SAR)': 'Synthetic aperture radar (SAR) image', 'Hielo flotante en aguas interiores (canales australes)': 'Floating ice in inland waters (southern channels)',
    'Cartas de hielo y productos publicados en la sección «Monitoreo de hielos» del': 'Ice charts and products published in the «Ice monitoring» section of the', 'sitio público de meteorología marítima': 'public marine meteorology website',
    '. Se usa solo el área del mapa de cada carta, georreferenciada en la misma proyección.': '. Only the map area of each chart is used, georeferenced in the same projection.',
    'Información del mapa': 'Map information', 'Fecha de la carta': 'Chart date', 'Carta de hielo publicada': 'Published ice chart', 'Fuente': 'Source', 'Estereográfica polar': 'Polar stereographic',
    'Proyección de la carta': 'Chart projection', 'Témpanos': 'Icebergs', 'Capa apagada': 'Layer off', 'Hielo en cubierta': 'Ice accretion', 'Carta de hielo': 'Ice chart', 'Opacidad de la carta': 'Chart opacity',
    'Animar los plazos': 'Animate lead times', 'Plazo del pronóstico': 'Forecast lead time', 'Mapa de hielos': 'Ice map', 'Volver a la vista inicial': 'Back to the initial view', 'Sin carta de hielo seleccionada.': 'No ice chart selected.',
    'Tasa de acumulación (cm/h) según el modelo GFS, de 45° a 75° S y de 90° a 50° W.': 'Accretion rate (cm/h) from the GFS model, 45° to 75° S and 90° to 50° W.', 'Satélite AMSR2 (Universidad de Bremen)': 'AMSR2 satellite (University of Bremen)',
    'Paso Drake': 'Drake Passage', 'Mar de Weddell': 'Weddell Sea', 'Mar de Bellingshausen': 'Bellingshausen Sea', 'Mar de Amundsen': 'Amundsen Sea', 'Mar de la Flota': 'Scotia Sea', 'Península Antártica': 'Antarctic Peninsula',
    'Islas Shetland del Sur': 'South Shetland Islands', 'Isla Rey Jorge': 'King George Island', 'Isla Elefante': 'Elephant Island', 'Islas Orcadas del Sur': 'South Orkney Islands', 'Islas Georgias del Sur': 'South Georgia',
    'Islas Sandwich del Sur': 'South Sandwich Islands', 'Islas Malvinas': 'Falkland Islands (Malvinas)', 'Isla Alejandro I': 'Alexander Island', 'Isla Pedro I': 'Peter I Island', 'Barrera de hielo Larsen': 'Larsen Ice Shelf',
    'Barrera de hielo Ronne': 'Ronne Ice Shelf', 'Isla Decepción': 'Deception Island', 'Bahía Margarita': 'Marguerite Bay', 'Isla Adelaida': 'Adelaide Island', 'Cabo de Hornos': 'Cape Horn', 'Estrecho Bransfield': 'Bransfield Strait',
    'Estrecho Gerlache': 'Gerlache Strait',
    // WRF + IA
    'Pronósticos WRF + IA · Bahías': 'WRF + AI forecasts · Bays', 'Favoritos': 'Favourites', 'Pronósticos por bahía': 'Forecasts by bay', 'Bahías favoritas': 'Favourite bays', 'Todas': 'All',
    'Buscar bahía, puerto o localidad…': 'Search bay, port or town…', 'Viento (color)': 'Wind (colour)', 'Flechas de viento': 'Wind arrows', 'Etiquetas': 'Labels', 'Temperatura': 'Temperature', 'Rachas': 'Gusts',
    'Oleaje hoy (pronóstico)': 'Waves today (forecast)', 'Experimental': 'Experimental', 'Meteograma ↗': 'Meteogram ↗', 'Rango de viento sostenido del día (kt)': 'Daily sustained wind range (kt)',
    'Altura significativa máxima del día (m)': 'Daily maximum significant wave height (m)', 'Temperatura mínima y máxima (°C)': 'Minimum and maximum temperature (°C)', 'Análisis IA': 'AI analysis',
    'Resumen próximos días': 'Next days', 'Ver más →': 'More →', 'Detalle por día': 'Day-by-day details', 'Agregar a favoritos': 'Add to favourites', 'Quitar de favoritos': 'Remove from favourites', 'Favorito': 'Favourite',
    'Día anterior': 'Previous day', 'Día siguiente': 'Next day', 'Capas del mapa': 'Map layers', 'sin dato': 'no data', 'sin datos': 'no data', 'Elige una bahía en la lista o en el mapa para ver su pronóstico.': 'Choose a bay in the list or on the map to see its forecast.',
    'No hay una estación costera cercana con datos recientes.': 'There is no nearby coastal station with recent data.', 'Pronóstico aún no generado': 'Forecast not yet generated',
    'Aún no tienes favoritos: marca la estrella de una bahía para agregarla.': 'No favourites yet: tick the star of a bay to add it.', 'No hay bahías que coincidan con la búsqueda.': 'No bays match the search.',
    'Zona Norte': 'North Zone', 'Zona Central': 'Central Zone', 'Zona Central Sur': 'South-Central Zone', 'Zona Sur': 'South Zone', 'Zona Austral': 'Far South Zone', 'Zona Antártica': 'Antarctic Zone',
    'Dashboard operativo · Inteligencia artificial para decisiones marítimas más seguras': 'Operational dashboard · Artificial intelligence for safer maritime decisions',
    'Capitanías de Puerto (●) y EMA Campbell (■), las mismas que dibuja el meteomapa, y red complementaria (◆): faros y estaciones de IFOP, Weather Underground y WeatherLink.': 'Harbour Master offices (●) and Campbell AWS (■), the same ones drawn on the meteomap, plus a complementary network (◆): lighthouses and IFOP, Weather Underground and WeatherLink stations.',
    'operativa ≤ 60 min; con retraso 1–6 h; no operativa > 6 h. Si la fuente no informa la hora, se usa la del último cambio de valores (≈).': 'operational ≤ 60 min; delayed 1–6 h; not operational > 6 h. If the source gives no time, the time of the last change in values is used (≈).',
    'transmite con valores imposibles, en cero o sin variación (temperatura, humedad o viento ≥ 6 h; presión ≥ 3 h; viento en calma ≥ 24 h; se excluye humedad ≥ 99 %). Clic en una fila para ver la estación y sus datos en el mapa.': 'reports impossible, zero or unchanging values (temperature, humidity or wind ≥ 6 h; pressure ≥ 3 h; calm wind ≥ 24 h; humidity ≥ 99 % excluded). Click a row to see the station and its data on the map.',
    'METAREA XV digitalizada de la carta OMM N° 9, Vol. D (2018); meridianos oceánicos aproximados.': 'METAREA XV digitised from WMO chart No. 9, Vol. D (2018); oceanic meridians approximate.',
    '. El estado se recalcula con la hora del equipo. En el mapa: marejadas como franja costera, mal tiempo y trombas como sectores sobre el mar, y Juan Fernández y Rapa Nui como áreas circulares. Rojo = vigente; azul punteado = próximo.': '. Status is recalculated with your device clock. On the map: swell warnings as a coastal strip, bad weather and waterspouts as sectors over the sea, and Juan Fernández and Rapa Nui as circular areas. Red = in force; dotted blue = upcoming.',
    'y ordenados por día. Las bahías tienen pronóstico diurno (08–20 h), nocturno (20–08 h) y para los dos días siguientes; varias áreas solo tienen día y noche. Alta mar (Zona X), la Antártica y el pronóstico general marítimo cubren 24 h (horario UTC). En el mapa, los sectores de la Zona X usan los límites del boletín (95° W; 18°, 30°, 45° y 60° S) y su borde este coincide con el límite exterior de las áreas costeras I a VIII; las zonas del pronóstico general se muestran sobre las áreas de la METAREA XV; las demás áreas se marcan con un rombo en una posición aproximada. Ante cualquier duda, prevalece el texto original (enlace en cada pronóstico). Producto': 'and sorted by day. Bays have a day forecast (08–20 h), a night forecast (20–08 h) and the next two days; some areas only have day and night. High seas (Zone X), Antarctica and the general marine forecast cover 24 h (UTC). On the map, the Zone X sectors use the bulletin limits (95° W; 18°, 30°, 45° and 60° S) and their eastern edge matches the outer limit of coastal areas I to VIII; general forecast zones are shown over the METAREA XV areas; other areas are marked with a diamond at an approximate position. In case of doubt, the original text prevails (link in each forecast). Product',
    'Generado automáticamente por inteligencia artificial (Claude) a partir de los meteogramas del modelo WRF (3 km; 9 km donde no hay 3 km; 10 km en la Antártica; 27 km en Juan Fernández). Oleaje: altura significativa máxima del día del modelo marino de': 'Generated automatically by artificial intelligence (Claude) from WRF model meteograms (3 km; 9 km where 3 km is not available; 10 km in Antarctica; 27 km at Juan Fernández). Waves: daily maximum significant height from the marine model of',
    ', en rangos de 1 m; no resuelve fiordos ni canales angostos. Producto': ', in 1 m ranges; it does not resolve fjords or narrow channels. Product', 'referencial y experimental': 'for reference and experimental',
    ': no reemplaza los pronósticos y avisos oficiales.': ': it does not replace official forecasts and warnings.', 'Buscar bahía': 'Search bay', 'Pronósticos marítimos publicados': 'Published marine forecasts', 'Sector': 'Sector',
    'Cargando…': 'Loading…', 'Cargando datos…': 'Loading data…', 'Cargando pronósticos…': 'Loading forecasts…', 'Cargando capas…': 'Loading layers…', 'Sin datos': 'No data'
  };

  // ---------------- Textos con partes variables
  const R = [
    [/^(\d+) estaciones · (\d+) operativas(.*)$/, (m, a, b, r) => `${a} stations · ${b} operational${r.replace(' · datos actualizados ', ' · data updated ')}`],
    [/^Estaciones \((\d+) de (\d+) operativas\)$/, 'Stations ($1 of $2 operational)'],
    [/^Estación (.+) · dato de las (.+) \(hace (.+)\)\.$/, 'Station $1 · reading at $2 ($3 ago).'],
    [/^Estación (.+) · dato de las (.+) \((.+)\)\.$/, 'Station $1 · reading at $2 ($3 ago).'],
    [/^hace (.+)$/, (m, a) => a.replace(/días/, 'days').replace(/día/, 'day').replace(/meses/, 'months').replace(/mes/, 'month').replace(/años/, 'years').replace(/año/, 'year') + ' ago'],
    [/^Lista actualizada automáticamente el (.+) \(hora Chile\) desde el$/, 'List updated automatically on $1 (Chile time) from the'],
    [/^Informe del (\d+) de (\w+) de (\d{4})(.*)$/, (m, d, me, a, r) => `Report of ${d} ${MESES[me] || me} ${a}${r}`], [/^humedad (.+)$/, 'humidity $1'],
    [/^Viento > (\d+) kt en (.+)$/, 'Wind > $1 kt at $2'], [/^Aviso por viento > (\d+) kt en (.+)$/, 'Wind alert > $1 kt at $2'],
    [/^Oleaje sobre (\d) m en boya (.+)$/, 'Waves over $1 m at buoy $2'], [/^Atención: oleaje sobre (\d) metros en boya (.+)$/, 'Attention: waves over $1 m at buoy $2'],
    [/^Altura significativa (.+)$/, 'Significant height $1'],
    [/^Sin avisos vigentes ni alertas por viento.*$/, 'No warnings in force and no wind (> 20 kt north of Corral, > 25 kt south) or wave (≥ 3 m) alerts right now.'],
    [/^(\d+) de (\d+) lugares con pronóstico · revisado (.+) \(hora Chile\)$/, '$1 of $2 places with a forecast · checked $3 (Chile time)'],
    [/^(\d+) de (\d+) bahías y áreas con pronóstico · revisado (.+) \(hora Chile\)$/, '$1 of $2 bays and areas with a forecast · checked $3 (Chile time)'],
    [/^(\d+) con pronóstico$/, '$1 with a forecast'], [/^· ([\d.,]+) visitas?$/, '· $1 visits'], [/^([\d.,]+) visitas?$/, '$1 visits'],
    [/^(\d+) vigentes · (\d+) próximos$/, '$1 in force · $2 upcoming'], [/^(\d+) de (\d+) en el mapa$/, '$1 of $2 on the map'], [/^(\d+) de (\d+) estaciones$/, '$1 of $2 stations'],
    [/^(\d+) informados?$/, '$1 reported'], [/^GFS · válido (.+) \(hora Chile\)$/, 'GFS · valid $1 (Chile time)'], [/^(.*)\(hora Chile\)(.*)$/, '$1(Chile time)$2'],
    [/^Hora Chile (.+)$/, 'Chile time $1'], [/^Revisado (.+)$/, 'Checked $1'], [/^Generado (.+)$/, 'Generated $1'], [/^Emitido (.+) h \(hora local\)$/, 'Issued $1 (local time)'],
    [/^Carta actualizada el (.*)$/, 'Chart updated on $1'], [/^Informe del (.+)$/, 'Report of $1'], [/^Actualización: (.+)$/, 'Updated: $1'],
    [/^Válida (.+)$/, 'Valid $1'], [/^\(corrida (.+)\)$/, '(run $1)'], [/^Proyección estereográfica polar • Válida (.+)$/, 'Polar stereographic projection • Valid $1'],
    [/^Área X · Sector (.+)$/, 'Area X · $1 sector'], [/^Área ([IVX]+) · (.+)$/, 'Area $1 · $2'], [/^Zona X · Sector (.+)$/, 'Zone X · $1 sector'], [/^Zona IX · Sector (.+)$/, 'Zone IX · $1 sector'], [/^Área IX · (.+)$/, 'Area IX · $1'],
    [/^Zona (\d+(?: \(\d\))?) · (.+)$/, 'Zone $1 · $2'], [/^Restricci(ón|ones) · (.+)$/, 'Restriction · $2'],
    [/^(.+) · (\d+) restricci(ón|ones)(.*)$/, (m, a, n, s, r) => `${a} · ${n} restriction${n === '1' ? '' : 's'}${r}`],
    [/^Hoy, (.+)$/, 'Today, $1'], [/^Mañana, (.+)$/, 'Tomorrow, $1'], [/^Rango de (.+)$/, 'Range of $1'], [/^Viento: (.+)$/, m => 'Wind: ' + glosario(m.slice(8))], [/^Oleaje: (.+)$/, m => 'Waves: ' + glosario(m.slice(8))],
    [/^(.+) · viento$/, '$1 · wind'], [/^WRF (\d+ km)$/, 'WRF $1'], [/^(\d+)–(\d+) kt$/, '$1–$2 kt']
  ];
  // Términos de los dominios para ajustar textos ya traducidos por las reglas
  const MESES = { enero: 'January', febrero: 'February', marzo: 'March', abril: 'April', mayo: 'May', junio: 'June', julio: 'July', agosto: 'August', septiembre: 'September', octubre: 'October', noviembre: 'November', diciembre: 'December' };
  const SECTOR = { 'Noroeste': 'Northwest', 'Noreste': 'Northeast', 'Central Oeste': 'Central West', 'Central Este': 'Central East', 'Suroeste': 'Southwest', 'Sureste': 'Southeast', 'Oeste': 'West', 'Central': 'Central', 'Este': 'East' };

  // ---------------- Vocabulario de los pronósticos marítimos (se aplica a textos cortos)
  const G = [
    ['como mar de fondo del', 'as swell from the'], ['como mar de fondo', 'as swell'], ['mar de fondo del', 'swell from the'], ['mar de fondo', 'swell'], ['acceso a', 'approach to'], ['en área oceánica', 'in the open-sea area'], ['en áreas oceánicas', 'in open-sea areas'], ['con rompiente en borde costero', 'with breakers along the shore'],
    ['abierto al', 'open to the'], ['en sectores abiertos', 'in open sectors'], ['en bahías', 'in the bays'], ['en bahía', 'in the bay'], ['décimos de hielo marino', 'tenths of sea ice'], ['décimo de hielo marino', 'tenth of sea ice'],
    ['al sur del área', 'south of the area'], ['al norte del área', 'north of the area'], ['al weste del área', 'west of the area'], ['al este del área', 'east of the area'], ['al sur del sector', 'south of the sector'], ['al weste del sector', 'west of the sector'],
    ['fin período', 'end of period'], ['variando a', 'becoming'], ['variando al', 'becoming'], ['rolando al', 'shifting to'], ['rolando a', 'shifting to'], ['rolando', 'shifting'], ['aumentando', 'increasing'], ['disminuyendo', 'decreasing'],
    ['ocasional', 'occasionally'], ['rachas', 'gusts'], ['racha', 'gust'], ['en la madrugada', 'early morning'], ['en la mañana', 'in the morning'], ['en la tarde', 'in the afternoon'], ['en la noche', 'at night'], ['al final de la noche', 'late at night'],
    ['muy gruesa', 'very rough'], ['gruesa', 'rough'], ['marejadilla', 'slight'], ['marejada', 'moderate'], ['arbolada', 'high'], ['rizada', 'smooth'], ['llana', 'calm (glassy)'], ['congelado', 'frozen'],
    ['vis\\. muy mala', 'vis. very poor'], ['vis\\. mala', 'vis. poor'], ['vis\\. regular', 'vis. moderate'], ['vis\\. buena', 'vis. good'], ['muy mala', 'very poor'], ['mala', 'poor'], ['regular', 'moderate'], ['buena', 'good'],
    ['chubascos aislados', 'isolated showers'], ['probables', 'possible'], ['probable', 'possible'], ['probales', 'possible'], ['actividad eléctrica', 'thunderstorms'], ['chubascos', 'showers'], ['chubasco', 'shower'], ['lluvia débil', 'light rain'],
    ['lluvia', 'rain'], ['llovizna', 'drizzle'], ['precipitaciones', 'precipitation'], ['neblina', 'mist'], ['niebla', 'fog'], ['aguanieve', 'sleet'], ['nieve', 'snow'], ['granizo', 'hail'], ['inapreciable', 'negligible'],
    ['nubosidad baja', 'low cloud'], ['nubes medias', 'mid-level cloud'], ['nubosidad', 'cloud cover'], ['despejado', 'clear'], ['nublado', 'cloudy'], ['cubierto', 'overcast'], ['parcial', 'partly cloudy'],
    ['calma o variable', 'calm or variable'], ['calma/variable', 'calm/variable'], ['calma', 'calm'], ['variable', 'variable'], ['circulación ciclónica', 'cyclonic circulation'], ['margen anticiclónico', 'anticyclonic margin'], ['anticiclónico', 'anticyclonic'],
    ['inestabilidad postfrontal', 'post-frontal instability'], ['inestabilidad en altura', 'upper-level instability'], ['restos de inestabilidad', 'residual instability'], ['inestabilidad', 'instability'], ['inestable', 'unstable'],
    ['postfrontal', 'post-frontal'], ['prefrontal', 'pre-frontal'], ['frontal', 'frontal'], ['vaguada', 'trough'], ['cuña', 'ridge'], ['dorsal', 'ridge'], ['débil', 'weak'], ['sector este', 'eastern sector'],
    ['índice uv', 'UV index'], ['muy alto', 'very high'], ['alto', 'high'], ['moderado', 'moderate'], ['moderada', 'moderate'], ['bajo', 'low'], ['extremo', 'extreme'],
    ['presencia de témpanos', 'icebergs present'], ['informados en el área', 'reported in the area'], ['ver texto original', 'see original text'], ['cercano a la península', 'near the peninsula'],
    ['hielo nuevo', 'new ice'], ['nilas', 'nilas'], ['décimos', 'tenths'], ['sin cobertura del modelo', 'not covered by the model'], ['hasta', 'until'], ['del día siguiente', 'of the following day'], ['hora local', 'local time'],
    ['datos actualizados', 'data updated'], ['estaciones', 'stations'], ['operativas', 'operational'], ['viento', 'wind'], ['y mar', 'and sea'], ['desde la mañana', 'from the morning'], ['desde la tarde', 'from the afternoon'], ['desde la noche', 'from the night'], ['la mañana', 'the morning'], ['la tarde', 'the afternoon'], ['la noche', 'the night'], ['desde', 'from'], ['bajas', 'low'], ['medias', 'mid-level'], ['al', 'to'], ['sector este', 'eastern sector'], ['alta', 'high'], ['baja', 'low'], ['análisis', 'analysis'], [' y ', ' and '], [' a ', ' to '], [' con ', ' with '], [' en ', ' in ']
  ].map(([es, en]) => [new RegExp('(^|[^\\p{L}])(' + es.trim() + ')(?=$|[^\\p{L}])', 'giu'), en.trim(), /^\s/.test(es)]);
  function glosario(t) {
    let o = t.replace(/· Mar (?=\p{Lu})/gu, '· Sea ');
    for (const [re, en, esp] of G) o = o.replace(re, (m, pre, w) => pre + (/^\p{Lu}/u.test(w) && !esp ? en.charAt(0).toUpperCase() + en.slice(1) : en));
    return o;
  }
  const ES = /[áéíóúñ]|\b(sector|al|como|desde|el|la|los|las|del|de|en|con|para|por|sin|hoy|día|viento|mar|hielo|cubierto|nublado|parcial|despejado|calma|marejad|rizad|llana|gruesa|chubasc|lluvia|neblina|niebla|nieve|rolando|aumentando|ocasional|rachas)\b/i;
  const SECT = s => s.replace(/(Noroeste|Noreste|Central Oeste|Central Este|Suroeste|Sureste|Oeste|Central|Este) sector/g, (m, k) => `${SECTOR[k] || k} sector`);
  function traducir(k) {
    if (D[k] != null) return D[k];
    let t = k, hubo = false;
    for (const [re, f] of R) if (re.test(t)) { t = t.replace(re, f); hubo = true; }
    if (hubo) return SECT(ES.test(t) ? glosario(t) : t);
    if (k.length <= 330 && (k.match(/\. \p{Lu}/gu) || []).length < 2 && ES.test(k)) { t = glosario(k); if (t !== k) return t; }
    return null;
  }

  // ---------------- Recorrido del documento
  const HECHO = new WeakMap();   // nodo → texto ya traducido (para no traducir dos veces)
  function nodoTexto(n) {
    const v = n.nodeValue; if (!v || !/\p{L}/u.test(v) || HECHO.get(n) === v) return;
    const p = n.parentElement; if (p && /^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE)$/.test(p.tagName)) return;
    if (p && p.closest && p.closest('[data-noi18n]')) return;
    const k = v.replace(/\s+/g, ' ').trim(); if (!k) return;
    const t = traducir(k);
    if (t != null && t !== k) { const nv = v.replace(v.trim(), t.replace(/\n/g, ' ')); n.nodeValue = nv; HECHO.set(n, nv); } else HECHO.set(n, v);
  }
  function elemento(el) {
    // Rótulos partidos con <br> (botones de la portada): se traducen enteros
    if (el.querySelector && el.childElementCount && [...el.children].every(c => c.tagName === 'BR' || c.tagName === 'svg' || c.tagName === 'SVG')) {
      const partes = [...el.childNodes].filter(c => c.nodeType === 3 && c.nodeValue.trim()).map(c => c.nodeValue.trim());
      if (partes.length > 1) { const t = D[partes.join('\n')]; if (t) { const tt = t.split('\n'); let i = 0; for (const c of el.childNodes) if (c.nodeType === 3 && c.nodeValue.trim()) { c.nodeValue = tt[i++] || ''; HECHO.set(c, c.nodeValue); } return true; } }
    }
    return false;
  }
  function atributos(el) {
    if (el.closest && el.closest('[data-noi18n]')) return;
    for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute && el.getAttribute(a); if (!v || el['_i18n_' + a] === v) continue;
      const t = traducir(v.replace(/\s+/g, ' ').trim()); if (t != null) el.setAttribute(a, t.replace(/\n/g, ' ')); el['_i18n_' + a] = el.getAttribute(a); }
  }
  function recorrer(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) return nodoTexto(raiz);
    if (raiz.nodeType !== 1) return;
    const els = [raiz, ...raiz.querySelectorAll('*')];
    for (const el of els) { if (/^(SCRIPT|STYLE)$/.test(el.tagName)) continue; atributos(el); if (elemento(el)) continue;
      for (const c of el.childNodes) if (c.nodeType === 3) nodoTexto(c); }
  }
  function iniciar() {
    if (document.title) document.title = (traducir(document.title) || document.title).replace(/\n/g, ' ');
    recorrer(document.body);
    new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') nodoTexto(m.target); else if (m.type === 'attributes') atributos(m.target); else m.addedNodes.forEach(recorrer); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
  }
  if (document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);
})();
