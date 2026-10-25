// Inventario documental de Capuerto Talcahuano, integrado con la red existente.
function referenciaEstacionTalcahuano(datos, estacion) {
  return datos.features.find(f => (f.properties.meteoia_codigos || []).includes(estacion.codigo));
}
function complementarEstacionesTalcahuano(estaciones, complementarias, datos) {
  const salida=estaciones.slice();
  for (const s of complementarias) {
    const f=referenciaEstacionTalcahuano(datos,s); if(!f)continue;
    const i=salida.findIndex(x=>(f.properties.meteoia_codigos||[]).includes(x.codigo));
    if(i<0)salida.push(s);else if(salida[i].sinDatos&&!s.sinDatos)salida[i]=s;
  }
  return salida;
}
function enlaceTalcahuano(valor) {
  try { const u = new URL(valor); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch (e) { return null; }
}
function fichaInstrumentoSinDatosTalcahuano(f,escapar) {
  const p=f.properties;
  const variables=p.clase==='boya'?['Altura significativa','Altura máxima','Período significativo','Dirección media','Temperatura del agua']:[ 'Viento','Temperatura del aire','Presión','Humedad' ];
  const url=enlaceTalcahuano(p.dataurl||p.source);
  return `<div class="pp"><div class="ppT">${escapar(p.label||p.name)}</div><table><tr><th>Estado</th><td>Sin datos</td></tr><tr><th>Último dato</th><td>Sin lectura disponible</td></tr>`+
    variables.map(k=>`<tr><th>${escapar(k)}</th><td>—</td></tr>`).join('')+
    `<tr><th>Fuente</th><td>${escapar(p.owner||'')}</td></tr></table><p>Las fechas del inventario no corresponden a mediciones recientes.</p>`+
    (url?`<a href="${escapar(url)}" target="_blank" rel="noopener noreferrer">Consultar datos en la fuente ↗</a>`:'')+'</div>';
}
function fichaTalcahuano(feature, escapar, metadatos) {
  const p = feature.properties, [lon, lat] = feature.geometry.coordinates;
  const enlace = (url, texto, pagina) => {
    const u = enlaceTalcahuano(url); if (!u) return '';
    const href = pagina && /\.pdf(?:$|[?#])/i.test(u) ? u.split('#')[0] + '#page=' + pagina : u;
    return `<a href="${escapar(href)}" target="_blank" rel="noopener noreferrer">${escapar(texto)} ↗</a>`;
  };
  const rows = [['Categoría', p.category], ['Entidad', p.owner], ['Variables documentadas', p.variables],
    ['Precisión de la referencia', p.precision], ['Posición del inventario', `${lat.toFixed(p.digits || 6)}, ${lon.toFixed(p.digits || 6)}`],
    [p.sensor?'Antecedente del inventario':'Disponibilidad en la consulta', p.status], ['Consulta del inventario', p.consultado || metadatos.consultado]];
  const links = [enlace(p.source, 'Fuente documental', p.page), enlace(p.geosource, 'Fuente de ubicación'),
    enlace(p.dataurl, 'Consultar datos en la fuente'), enlace(p.alternativeurl, 'Fuente alternativa'), enlace(p.metadataurl, 'Metadatos')].filter(Boolean);
  return `<section class="talc-ficha"><h3>${escapar(p.name)}</h3><table>${rows.filter(([,v]) => v).map(([k,v]) => `<tr><th>${escapar(k)}</th><td>${escapar(v)}</td></tr>`).join('')}</table>` +
    `<p>${escapar(p.note || '')}</p><div class="talc-fuentes">${links.join(' ')}</div>` +
    (p.sensor ? '<p class="talc-alcance">El inventario documenta fuentes; sus fechas de consulta no son mediciones actuales. Los datos de la red de MeteoIA, si existen, se muestran con su propia hora.</p>' : '') + '</section>';
}
// Límite en L: resolución CP Talcahuano 12.600/491 (26/12/2023), p. 2, foto 2.
// SHOA, Lista de Faros 3007, corrección mayo 2025, I-24: Manzano 73°06′,0 W.
// La resolución fija el paralelo 36°41′18″ S y el extremo este 73°01′30″ W.
const LIMITE_PUERTO_TALCAHUANO = {
  latitud: -(36 + 41 / 60 + 18 / 3600),
  oeste: -(73 + 6 / 60), este: -(73 + 1 / 60 + 30 / 3600),
  // Primer cruce hacia el sur con la costa OSM (way 417023797, versión 11):
  // nodos 4857126548 (-36.7386649,-73.0250073) y 4857126549 (-36.7386713,-73.0249187).
  // Interpolación al meridiano -73.025; posición costera aproximada, no coordenada de la resolución.
  sur: -36.73866542731377,
  documento: 'https://www.directemar.cl/directemar/site/docs/20220818/20220818103212/12600_491_261223_cp_talcahuano.pdf#page=2',
  resolucion: 'https://www.directemar.cl/directemar/site/docs/20170202/20170202122929/12600_151_21_abr_2015.pdf#page=3',
  costa: 'https://www.openstreetmap.org/way/417023797',
  faro: 'https://shoabucket.s3.amazonaws.com/shoa.cl/documentos/boletines/2025/Mayo_2025.pdf#page=60'
};
function crearLimitePuertoTalcahuano(L, map, escapar, ajustarZoom) {
  const capa=L.layerGroup(), d=LIMITE_PUERTO_TALCAHUANO;
  const extremos=[[d.latitud,d.oeste],[d.latitud,d.este],[d.sur,d.este]];
  let linea;
  function construir() {
    if(linea)return;
    L.polyline(extremos,{pane:'talcAreasPane',color:'#fff',weight:7,opacity:.95,interactive:false}).addTo(capa);
    linea=L.polyline(extremos,{pane:'talcAreasPane',className:'talc-limite-puerto',color:'#c45508',weight:3,opacity:1}).addTo(capa);
    linea.bindTooltip('Límite de puerto · tramos norte y este',{sticky:true});
    linea.bindPopup(()=>`<section class="talc-ficha"><h3>Límite de puerto · Talcahuano</h3>`+
      '<p>Desde Molo Caleta Manzano hacia el este y luego hacia el sur hasta la costa, formando una L.</p>'+
      '<table><tr><th>Tramo norte · paralelo</th><td>36°41′18″ S</td></tr><tr><th>Inicio · Manzano</th><td>073°06′,0 W (aprox. SHOA)</td></tr><tr><th>Tramo este · meridiano</th><td>073°01′30″ W</td></tr><tr><th>Llegada a costa</th><td>≈ 36°44′19″ S (OSM)</td></tr><tr><th>Documento</th><td>12.600/491 · 26/12/2023 · foto 2</td></tr></table>'+
      '<p>El extremo sur se ajusta al primer cruce del meridiano con la costa cartografiada. Su latitud es aproximada y no está especificada numéricamente en la resolución.</p>'+
      `<div class="talc-fuentes"><a href="${escapar(d.documento)}" target="_blank" rel="noopener noreferrer">Resolución oficial · 2023 ↗</a> <a href="${escapar(d.resolucion)}" target="_blank" rel="noopener noreferrer">Coordenadas del límite · 2015 ↗</a> <a href="${escapar(d.faro)}" target="_blank" rel="noopener noreferrer">Faro · SHOA ↗</a> <a href="${escapar(d.costa)}" target="_blank" rel="noopener noreferrer">Costa · © OpenStreetMap ↗</a></div></section>`,
      {pane:'talcPopupPane',className:'talc-popup talc-limite-popup',maxWidth:Math.min(320,map.getContainer().clientWidth-100),autoPanPaddingTopLeft:[25,75],autoPanPaddingBottomRight:[25,35]});
  }
  capa.on('add',()=>{ajustarZoom?.();construir();});
  capa.on('remove',()=>ajustarZoom?.());
  return {capa,abrir:()=>{
    construir();map.fitBounds(extremos,{padding:[35,35],maxZoom:14});
    linea.openPopup([d.latitud,(d.oeste+d.este)/2]);
  }};
}
function crearCatalogoTalcahuano(L, map, datos, escapar, opciones) {
  const puertos = L.layerGroup(), observacion = L.layerGroup(), marcadores = new Map();
  const limitePuerto=crearLimitePuertoTalcahuano(L,map,escapar,opciones.ajustarZoom);
  const colores = { Autoridad: '#5d48aa', 'Alcaldía / caleta': '#ad5a28', 'Puerto / sitio': '#196a94',
    'Deporte / borde costero': '#487d31', 'Referencia marítima': '#6b6f76', estacion: '#147b88', boya: '#bd6b16' };
  const activa = () => map.hasLayer(observacion);
  const asociada = s => referenciaEstacionTalcahuano(datos, s);
  const esBoya = b => String(b.nombre).trim().toLowerCase() === 'talcahuano';
  const documental = f => `<details class="talc-detalle"><summary>Ubicación, antecedentes y fuentes</summary>${fichaTalcahuano(f,escapar,datos.metadata)}</details>`;
  function instrumento(f) {
    const p=f.properties;
    if(p.clase==='estacion')return opciones.estaciones().find(s=>(p.meteoia_codigos||[]).includes(s.codigo))||opciones.estacionSinDatos?.(f);
    if(p.id===32)return (opciones.boyas?.()||[]).find(esBoya);
    return null;
  }
  function contenido(f) {
    const p=f.properties,i=instrumento(f);
    if(p.clase==='estacion'&&i)return opciones.popupEstacion(i);
    if(p.id===32&&i)return opciones.popupBoya(i);
    if(p.sensor)return fichaInstrumentoSinDatosTalcahuano(f,escapar)+documental(f);
    return fichaTalcahuano(f,escapar,datos.metadata);
  }
  function presentacion(f) {
    const p=f.properties,i=instrumento(f);
    const posicion=i?[i.lat,i.lon]:f.geometry.coordinates.slice().reverse();
    const icon=i?(p.clase==='estacion'?opciones.iconoEstacion?.(i):opciones.iconoBoya?.(i)):
      p.clase==='boya'?opciones.iconoBoyaSinDatos?.(f):null;
    const tooltip=i?(p.clase==='estacion'?opciones.tooltipEstacion?.(i):opciones.tooltipBoya?.(i)):null;
    return {posicion,icon:icon||icono(p),tooltip:tooltip||`${escapar(p.label||p.name)} · ${escapar(p.precision)}`};
  }
  function icono(p) {
    const c = colores[p.clase] || colores[p.category] || '#196a94';
    const signo = p.clase === 'estacion' ? 'M' : p.clase === 'boya' ? 'B' : p.id;
    return L.divIcon({ className: 'talc-marcador', iconSize: [24,24], iconAnchor: [12,12],
      html: `<span style="background:${c}">${escapar(signo)}</span>` });
  }
  function agregar(f, grupo) {
    const p = f.properties;
    const v=presentacion(f);
    const m = L.marker(v.posicion, { pane: 'talcPane', icon: v.icon, title: p.name });
    m.bindTooltip(v.tooltip, { direction: 'top', offset: [0,-10] });
    m.bindPopup(() => contenido(f), { pane: 'talcPopupPane', className: 'talc-popup', maxWidth: 320, autoPanPadding: [25,35] });
    m.addTo(grupo); marcadores.set(p.id, m);
  }
  let puertosCreados = false;
  puertos.on('add', () => { opciones.ajustarZoom?.(true); if (!puertosCreados) { datos.features.filter(f => !f.properties.sensor).forEach(f => agregar(f, puertos)); puertosCreados = true; } });
  puertos.on('remove', () => { if (!activa()) opciones.ajustarZoom?.(false); });
  function actualizarObservacion() {
    if (!activa()) return;
    for(const f of datos.features.filter(f=>f.properties.sensor)) {
      const m=marcadores.get(f.properties.id);
      if(!m){agregar(f,observacion);continue;}
      const v=presentacion(f);m.setLatLng(v.posicion);m.setIcon(v.icon);m.setTooltipContent(v.tooltip);
      // Conserva el marcador y la ficha abiertos al llegar una observación nueva.
      m.setPopupContent(()=>contenido(f));
    }
  }
  observacion.on('add', () => { opciones.ajustarZoom?.(true); actualizarObservacion(); opciones.refrescarRed(); });
  observacion.on('remove', () => { opciones.refrescarRed(); if (!map.hasLayer(puertos)) opciones.ajustarZoom?.(false); });
  function abrir(id) {
    if(id==='limite:puerto') {
      opciones.activar('talc_limite');opciones.prepararVista?.();
      limitePuerto.abrir();opciones.enfocarMapa?.();return;
    }
    const f = datos.features.find(f => f.properties.id === +id); if (!f) return;
    opciones.activar(f.properties.sensor ? 'talc_obs' : 'talc_puertos');
    const m = marcadores.get(f.properties.id); if (!m) return;
    opciones.prepararVista?.();
    const pos = m.getLatLng();
    map.setView(pos, f.properties.view === 'coast' || f.properties.clase === 'boya' ? 12 : 16);
    m.openPopup(); opciones.enfocarMapa?.();
  }
  function verTodo() {
    opciones.activar('talc_puertos'); opciones.activar('talc_obs'); opciones.activar('talc_limite'); opciones.activarFondeos?.(); opciones.prepararVista?.();
    map.fitBounds(datos.features.map(f => f.geometry.coordinates.slice().reverse()), { padding: [30,30], maxZoom: 12 });
  }
  function controles(box, fondeos) {
    const div = document.createElement('div'); div.className = 'talc-herramientas';
    div.innerHTML = '<button type="button" class="talc-ver">Ver bahía de Talcahuano</button>' +
      (fondeos?'<label class="talc-selector">Filtrar fondeos<select aria-label="Filtrar fondeos de Talcahuano"><option value="">Todos</option><option value="exterior">Fuera de los límites del puerto</option><option value="interior">Dentro de los límites del puerto</option><option value="alije">Faenas de alije</option></select></label>':'') +
      '<label class="talc-selector">Consultar referencia<select aria-label="Referencia de Capuerto Talcahuano"><option value="">Seleccione una referencia…</option>' +
      '<option value="limite:puerto">Límite de puerto · norte y este</option>' +
      datos.features.map(f => `<option value="${f.properties.id}">${f.properties.id}. ${escapar(f.properties.label || f.properties.name)}</option>`).join('') + (fondeos?.opcionesHTML()||'') + '</select></label>' +
      `<details><summary>Fuentes y alcance · ${datos.features.length} referencias</summary>` +
      `<p>Consulta: ${escapar(datos.metadata.consultado)}. ${escapar(datos.metadata.alcance)}</p><p>${escapar(datos.metadata.precision)}</p>` +
      datos.metadata.documentos.map(d => `<p><a href="${escapar(enlaceTalcahuano(d.url))}" target="_blank" rel="noopener noreferrer">${escapar(d.titulo)} ↗</a></p>`).join('') +
      '<p>Las estaciones y la boya SHOA usan los mismos símbolos, estados y fichas de mediciones que la red nacional. Los números identifican referencias portuarias. La boya SHOA usa la posición de referencia de su catálogo; su posición histórica queda en los antecedentes.</p>' +
      `<p>${escapar(datos.metadata.atribucion)}</p>` +
      '<p><a href="data/geo/talcahuano.geojson" download>Descargar GeoJSON</a> · <a href="data/geo/talcahuano.kml" download>Descargar KML</a></p></details>' + (fondeos?.fuentesHTML()||'');
    div.querySelector('.talc-ver').onclick = verTodo;
    div.querySelector('[aria-label="Referencia de Capuerto Talcahuano"]').onchange = e => {
      const clave=e.target.value;if(fondeos&&/^(fondeo|arba):/.test(clave))fondeos.abrir(clave);else abrir(clave);
    };
    fondeos?.conectarFiltro(div);
    box.appendChild(div);
  }
  return { puertos, observacion, limite:limitePuerto.capa, observacionActiva: activa, esEstacionCatalogada: s => !!asociada(s), esBoyaCatalogada: esBoya,
    fichaEstacion: s => { const f = asociada(s); return f ? documental(f) : ''; },
    fichaBoya: b => { const f=datos.features.find(f=>f.properties.id===32);return esBoya(b)&&f?documental(f):''; },
    marcadorEstacion: codigo => { const f = asociada({ codigo }); return activa() && f ? marcadores.get(f.properties.id) : null; },
    actualizarObservacion, controles, abrir, verTodo };
}
