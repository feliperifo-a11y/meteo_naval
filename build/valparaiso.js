// Datos documentales del paquete del usuario; las mediciones vienen de la red nacional.
const VALPO_ESTACIONES = ['VALPARAISO','WL-240087'];
function tipoFondeoValparaiso(p) {
  if(p.clase_nave==='carga vital')return 'vital';
  if(p.uso_adicional||p.clase_nave.includes('bunkering'))return 'bunkering';
  return p.clase_nave.includes('<100')?'menor':'mayor';
}
function coincideFondeoValparaiso(p,filtro) {
  if(filtro==='menor')return p.clase_nave.includes('<100');
  if(filtro==='mayor')return p.clase_nave.includes('>100');
  if(filtro==='bunkering')return !!p.uso_adicional||p.clase_nave.includes('bunkering');
  if(filtro==='vital')return p.clase_nave==='carga vital';
  return true;
}
function claveValparaiso(f) {return f.properties.tipo+':'+f.properties.nombre;}
function fichaValparaiso(f,limites,escapar) {
  const p=f.properties, numero=v=>Array.isArray(v)?v.map(n=>numero(n)).join(' / '):typeof v==='number'?String(v).replace('.',','):String(v);
  const fila=(label,value,unit='')=>value==null?'':`<tr><th>${escapar(label)}</th><td>${escapar(numero(value))}${unit?' '+escapar(unit):''}</td></tr>`;
  const campos={eslora_max_m:['Eslora citada','m'],calado_max_m:['Calado citado','m'],manga_max_m:['Manga','m'],ukc_min_m:['UKC mínimo','m'],viento_maniobra_max_kt:['Viento de maniobra citado','kt'],viento_auteros_max_kt:['Viento para auteros','kt'],viento_roro_max_kt:['Viento RO-RO','kt'],visibilidad_min_cables:['Visibilidad mínima citada','cables'],extension_m:['Extensión','m'],extension_total_m:['Extensión total','m'],extension_habilitada_m:['Extensión habilitada','m'],calado_sector_alterno_m:['Calado sector alterno','m'],eslora_babor_max_m:['Eslora por babor','m'],eslora_estribor_max_m:['Eslora por estribor','m'],calado_por_sector_m:['Calados por sector','m'],estribor_obligatorio_desde_eslora_m:['Estribor desde eslora','m']};
  const tabla=o=>Object.entries(campos).filter(([k])=>o[k]!=null).map(([k,[l,u]])=>fila(l,o[k],u)).join('');
  let cuerpo='';
  if(p.tipo==='fondeo') {
    cuerpo='<table>'+fila('Clase de nave',p.clase_nave)+fila('Sonda referencial',p.sonda_referencial_m,'m')+fila('Radio de borneo máximo citado',p.radio_borneo_max_m,'m')+fila('Uso adicional',p.uso_adicional)+fila('Latitud original',p.latitud_original)+fila('Longitud original',p.longitud_original)+'</table>';
  } else if(p.tipo==='atraque') {
    const norma=limites.instalaciones.find(i=>i.nombre===p.nombre)||p;
    const principales=['eslora_max_m','calado_max_m','viento_maniobra_max_kt','visibilidad_min_cables'];
    cuerpo='<p>Posición general del frente; no identifica cada sitio ni bita.</p><table>'+principales.filter(k=>norma[k]!=null).map(k=>fila(campos[k][0],norma[k],campos[k][1])).join('')+'</table>';
    if(p.nombre.includes('sitios 1-3'))cuerpo+='<p class="valpo-discrepancia">Calado: 14,1 m en la resolución de 2018; <a href="https://www.tps.cl/tps/infraestructura-y-equipamiento" target="_blank" rel="noopener noreferrer">TPS publica 13,8 m</a> (consulta 24/10/2026). Confirmar el valor aplicable.</p>';
    cuerpo+='<details><summary>Dimensiones y condiciones documentadas</summary><table>'+tabla(norma)+'</table>'+
      Object.entries(norma.sitios||{}).map(([sitio,v])=>`<h4>Sitio ${escapar(sitio)} · misma referencia de instalación</h4><table>${tabla(v)}</table>`).join('')+'<p>'+escapar(norma.nota||'')+'</p></details>';
  } else {
    cuerpo='<p><b>Fondeo no permitido según la resolución citada.</b></p><p>'+escapar(p.observacion||'')+'</p><p>Aproximación: la resolución 12000/934 (2018) cita un máximo de 4 kt; la 12000/196 (2022) indica velocidad de seguridad.</p><a href="https://www.directemar.cl/directemar/site/docs/20181017/20181017113445/08__12000_934_041018_publ.pdf#page=5" target="_blank" rel="noopener noreferrer">Resolución 12000/934 (2018) ↗</a>';
  }
  const url=enlaceTalcahuano(p.fuente);
  return `<section class="talc-ficha valpo-ficha"><h3>${escapar(p.tipo==='fondeo'?'Fondeo '+p.nombre:p.nombre)}</h3><p class="valpo-documento">Antecedente documental${p.resolucion?' · '+escapar(p.resolucion):' · resolución 12000/196 (2022)'}</p>${cuerpo}`+
    (url?`<p><a href="${escapar(url)}" target="_blank" rel="noopener noreferrer">Consultar resolución oficial ↗</a></p>`:'')+
    '<p class="talc-alcance">Referencia informativa; datum y vigencia por confirmar. No equivale a estado de puerto o autorización de maniobra.</p></section>';
}
function crearCatalogoValparaiso(L,map,datos,limites,escapar,opciones) {
  const grupos={puertos:L.layerGroup(),fondeos:L.layerGroup(),zep:L.layerGroup(),radios:L.layerGroup(),observacion:L.layerGroup()};
  const marcadores=new Map(), meteorologicos=new Map(), creados=new Set();
  let filtro='',selector=null,selectorFiltro=null;
  const esEstacionCatalogada=s=>VALPO_ESTACIONES.includes(s.codigo);
  const observacionActiva=()=>map.hasLayer(grupos.observacion);
  const icono=(texto,color)=>L.divIcon({className:'talc-marcador',iconSize:[24,24],iconAnchor:[12,12],html:`<span style="background:${color}">${escapar(texto)}</span>`});
  const fondeos=()=>datos.features.filter(f=>f.properties.tipo==='fondeo'&&coincideFondeoValparaiso(f.properties,filtro));
  function punto(f) {
    const p=f.properties, pos=f.geometry.coordinates.slice().reverse(), esFondeo=p.tipo==='fondeo';
    const nombre=esFondeo?'Fondeo '+p.nombre:p.nombre;
    const color=esFondeo?({menor:'#196a94',mayor:'#147b88',bunkering:'#ac5a14',vital:'#7455a0'}[tipoFondeoValparaiso(p)]):'#5d48aa';
    const texto=esFondeo?(p.nombre==='A-7'?'A7':p.nombre[0]):p.nombre.includes('1-3')?'T1':p.nombre.includes('4-5')?'T5':'E';
    const m=L.marker(pos,{pane:'talcPane',title:nombre,icon:icono(texto,color)}).bindTooltip(escapar(nombre),{direction:'top',offset:[0,-10]})
      .bindPopup(()=>fichaValparaiso(f,limites,escapar),{pane:'talcPopupPane',className:'talc-popup valpo-popup',maxWidth:320,autoPanPadding:[25,35]});
    marcadores.set(claveValparaiso(f),m);return m;
  }
  function construir(tipo) {
    if(creados.has(tipo))return;creados.add(tipo);
    if(tipo==='fondeos')fondeos().forEach(f=>punto(f).addTo(grupos.fondeos));
    if(tipo==='puertos')datos.features.filter(f=>f.properties.tipo==='atraque').forEach(f=>punto(f).addTo(grupos.puertos));
    if(tipo==='radios')fondeos().forEach(f=>L.circle(f.geometry.coordinates.slice().reverse(),{pane:'valpoAreasPane',radius:f.properties.radio_borneo_max_m,color:'#196a94',weight:1,fillOpacity:.035,interactive:false}).addTo(grupos.radios));
    if(tipo==='zep')datos.features.filter(f=>f.geometry.type==='Polygon').forEach(f=>{
      const m=L.polygon(f.geometry.coordinates.map(r=>r.map(p=>p.slice().reverse())),{pane:'valpoAreasPane',color:'#844d91',weight:2,dashArray:'6 4',fillOpacity:.13})
        .bindTooltip('ZEP · referencia documental · fondeo no permitido',{sticky:true}).bindPopup(()=>fichaValparaiso(f,limites,escapar),{pane:'talcPopupPane',className:'talc-popup valpo-popup',maxWidth:320});
      marcadores.set(claveValparaiso(f),m);m.addTo(grupos.zep);
    });
  }
  function actualizarObservacion() {
    if(!observacionActiva())return;
    const actuales=opciones.estaciones().filter(s=>esEstacionCatalogada(s)&&!s.sinDatos),codigos=new Set(actuales.map(s=>s.codigo));
    for(const [codigo,m] of meteorologicos)if(!codigos.has(codigo)){grupos.observacion.removeLayer(m);meteorologicos.delete(codigo);}
    for(const s of actuales) {
      let m=meteorologicos.get(s.codigo);
      if(!m) {
        m=L.marker([s.lat,s.lon],{pane:'talcPane',title:s.nombre,icon:opciones.iconoEstacion(s)})
          .bindTooltip(opciones.tooltipEstacion(s),{direction:'top',offset:[0,-8]}).bindPopup(()=>opciones.popupEstacion(s),{pane:'talcPopupPane',className:'talc-popup',maxWidth:320,autoPanPadding:[25,35]}).addTo(grupos.observacion);
        meteorologicos.set(s.codigo,m);
      } else m.setLatLng([s.lat,s.lon]).setIcon(opciones.iconoEstacion(s)).setTooltipContent(opciones.tooltipEstacion(s)).setPopupContent(()=>opciones.popupEstacion(s));
    }
  }
  for(const [tipo,g] of Object.entries(grupos)) {
    g.on('add',()=>{opciones.ajustarZoom();if(tipo==='observacion'){actualizarObservacion();opciones.refrescarRed();}else construir(tipo);});
    g.on('remove',()=>{if(tipo==='observacion')opciones.refrescarRed();opciones.ajustarZoom();});
  }
  function filtrar(value) {
    filtro=['','menor','mayor','bunkering','vital'].includes(value)?value:'';
    if(selectorFiltro)selectorFiltro.value=filtro;
    map.closePopup();
    for(const f of datos.features.filter(f=>f.properties.tipo==='fondeo'))marcadores.delete(claveValparaiso(f));
    for(const t of ['fondeos','radios']){grupos[t].clearLayers();creados.delete(t);if(map.hasLayer(grupos[t]))construir(t);}
  }
  function abrir(id) {
    if(id.startsWith('estacion:')) {
      opciones.activar('valpo_obs');const m=meteorologicos.get(id.slice(9));if(!m)return;
      opciones.prepararVista();map.setView(m.getLatLng(),15);m.openPopup();opciones.enfocarMapa();return;
    }
    const f=datos.features.find(f=>claveValparaiso(f)===id);if(!f)return;
    if(f.properties.tipo==='fondeo'&&filtro&&!coincideFondeoValparaiso(f.properties,filtro))filtrar('');
    const tipo=f.properties.tipo==='fondeo'?'fondeos':f.properties.tipo==='atraque'?'puertos':'zep';
    opciones.activar('valpo_'+tipo);opciones.prepararVista();const m=marcadores.get(id);if(!m)return;
    if(f.geometry.type==='Polygon')map.fitBounds(m.getBounds(),{padding:[30,30],maxZoom:15});else map.setView(m.getLatLng(),16);
    m.openPopup();opciones.enfocarMapa();
  }
  function verTodo() {
    ['puertos','fondeos','limite','zep','obs'].forEach(t=>opciones.activar('valpo_'+t));opciones.prepararVista();
    const puntos=datos.features.flatMap(f=>f.geometry.type==='Point'?[f.geometry.coordinates.slice().reverse()]:f.geometry.coordinates[0].map(p=>p.slice().reverse()));
    map.fitBounds(puntos,{padding:[35,35],maxZoom:13});
  }
  function controles(box) {
    const div=document.createElement('div');div.className='talc-herramientas valpo-herramientas';
    div.innerHTML='<button type="button" class="valpo-ver">Ver bahía de Valparaíso</button><label class="talc-selector">Filtrar fondeos<select aria-label="Filtrar fondeos de Valparaíso"><option value="">Todos</option><option value="menor">Eslora &lt;100 m</option><option value="mayor">Eslora &gt;100 m</option><option value="bunkering">Bunkering</option><option value="vital">Carga vital</option></select></label>'+
      '<label class="talc-selector">Consultar referencia<select aria-label="Referencia de Capuerto Valparaíso"><option value="">Seleccione una referencia…</option>'+
      datos.features.map(f=>`<option value="${escapar(claveValparaiso(f))}">${escapar(f.properties.tipo==='fondeo'?'Fondeo '+f.properties.nombre:f.properties.nombre)}</option>`).join('')+
      '<option value="estacion:VALPARAISO">Meteo Valparaíso</option><option value="estacion:WL-240087">Meteo Montemar · contexto regional</option></select></label>'+
      '<details><summary>Fuentes y alcance · 27 referencias</summary><p>23 fondeos, tres referencias generales de terminales y ZEP. Paquete del 24/10/2026. Las estaciones reutilizan la red nacional y la hora de su medición.</p><p>Referencias documentales: vigencia y datum por confirmar. Los límites de viento de maniobra no indican cierre automático del puerto.</p><p>Los radios de borneo son orientativos y no representan zonas asignadas o autorizadas.</p><p>Las posiciones de terminales no identifican cada sitio ni bita.</p>'+
      '<p><a href="data/geo/valparaiso.geojson" download>Descargar GeoJSON</a> · <a href="data/geo/valparaiso.kml" download>Descargar KML</a> · <a href="data/geo/valparaiso_limites.json" download>Antecedentes JSON</a></p></details>';
    selector=div.querySelector('[aria-label="Referencia de Capuerto Valparaíso"]');selectorFiltro=div.querySelector('[aria-label="Filtrar fondeos de Valparaíso"]');
    selector.onchange=e=>abrir(e.target.value);selectorFiltro.onchange=e=>filtrar(e.target.value);div.querySelector('.valpo-ver').onclick=verTodo;box.appendChild(div);
  }
  return {...grupos,observacionActiva,esEstacionCatalogada,actualizarObservacion,marcadorEstacion:codigo=>observacionActiva()?meteorologicos.get(codigo)||null:null,controles,abrir,verTodo,filtrar};
}
