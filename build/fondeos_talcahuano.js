// Posiciones documentales de la resolución 12.600/491 (26/12/2023).
function claveFondeaderoTalcahuano(f) {return f.properties.tipo+':'+f.properties.nombre;}
function grupoFondeaderoTalcahuano(grupo) {
  return {exterior:'Fuera de los límites del puerto',interior:'Dentro de los límites del puerto',alije:'Faenas de alije',reservada:'Área reservada Armada de Chile'}[grupo]||grupo;
}
function fichaFondeaderoTalcahuano(f,escapar) {
  const p=f.properties, fila=(nombre,valor)=>`<tr><th>${escapar(nombre)}</th><td>${escapar(valor)}</td></tr>`;
  const enlace=enlaceTalcahuano(p.fuente), url=enlace?enlace.split('#')[0]+'#page='+p.pagina_pdf:null;
  let cuerpo='<table>'+fila('Categoría',grupoFondeaderoTalcahuano(p.grupo));
  if(f.geometry.type==='Point') {
    const [lon,lat]=f.geometry.coordinates;
    cuerpo+=fila('Latitud original',p.latitud_original)+fila('Longitud original',p.longitud_original)+fila('Posición decimal',lat.toFixed(6)+', '+lon.toFixed(6));
  }
  cuerpo+='</table>';
  if(p.tipo==='arba')cuerpo+='<p>Área de fondeo reservada para buques de la Armada de Chile. Los cuatro vértices delimitan un polígono.</p><details><summary>Coordenadas de los cuatro vértices</summary><table>'+
    p.vertices_originales.map(v=>fila(v.vertice,v.latitud_original+' · '+v.longitud_original)).join('')+'</table></details>';
  if(p.grupo==='alije')cuerpo+='<p>La resolución remite al Anexo A para las condiciones de las faenas de alije.</p>';
  return `<section class="talc-ficha"><h3>${escapar(p.tipo==='fondeo'?'Fondeo '+p.nombre:'Área reservada ARBA')}</h3><p>Antecedente documental · ${escapar(p.resolucion)} · 26/12/2023</p>${cuerpo}`+
    (url?`<p><a href="${escapar(url)}" target="_blank" rel="noopener noreferrer">Consultar resolución oficial ↗</a></p>`:'')+
    '<p class="talc-alcance">Referencia informativa; datum y vigencia por confirmar. No equivale a autorización de fondeo ni a estado de puerto.</p></section>';
}
function crearFondeaderosTalcahuano(L,map,datos,escapar,opciones) {
  const fondeos=L.layerGroup(), arba=L.layerGroup(), marcadores=new Map();
  const creados=new Set();let filtro='',selectorFiltro=null;
  const coincide=f=>f.properties.tipo==='fondeo'&&(!filtro||f.properties.grupo===filtro);
  function construir(tipo) {
    if(creados.has(tipo))return;creados.add(tipo);
    for(const f of datos.features.filter(f=>tipo==='fondeos'?coincide(f):f.properties.tipo==='arba')) {
      const p=f.properties;
      const m=tipo==='fondeos'?L.marker(f.geometry.coordinates.slice().reverse(),{pane:'talcPane',title:'Fondeo '+p.nombre,
        icon:L.divIcon({className:'talc-marcador',iconSize:[24,24],iconAnchor:[12,12],html:`<span style="background:${{exterior:'#196a94',interior:'#147b88',alije:'#ac5a14'}[p.grupo]}">${escapar(p.nombre)}</span>`})})
        .bindTooltip(escapar('Fondeo '+p.nombre+' · '+grupoFondeaderoTalcahuano(p.grupo)),{direction:'top',offset:[0,-10]}):
        L.polygon(f.geometry.coordinates.map(r=>r.map(c=>c.slice().reverse())),{pane:'talcAreasPane',color:'#844d91',weight:2,dashArray:'6 4',fillOpacity:.13})
          .bindTooltip('ARBA · área reservada Armada de Chile',{sticky:true});
      m.bindPopup(()=>fichaFondeaderoTalcahuano(f,escapar),{pane:'talcPopupPane',className:'talc-popup',maxWidth:Math.min(320,map.getContainer().clientWidth-100),autoPanPaddingTopLeft:[25,75],autoPanPaddingBottomRight:[25,35]});
      marcadores.set(claveFondeaderoTalcahuano(f),m);m.addTo(tipo==='fondeos'?fondeos:arba);
    }
  }
  for(const [tipo,g] of [['fondeos',fondeos],['arba',arba]]) {
    g.on('add',()=>{opciones.ajustarZoom();construir(tipo);});g.on('remove',()=>opciones.ajustarZoom());
  }
  function filtrar(valor) {
    filtro=['exterior','interior','alije'].includes(valor)?valor:'';
    if(selectorFiltro)selectorFiltro.value=filtro;
    map.closePopup();
    for(const f of datos.features.filter(f=>f.properties.tipo==='fondeo'))marcadores.delete(claveFondeaderoTalcahuano(f));
    fondeos.clearLayers();creados.delete('fondeos');if(map.hasLayer(fondeos))construir('fondeos');
  }
  function abrir(clave) {
    const f=datos.features.find(f=>claveFondeaderoTalcahuano(f)===clave);if(!f)return;
    if(f.properties.tipo==='fondeo'&&!coincide(f))filtrar('');
    opciones.activar(f.properties.tipo==='fondeo'?'talc_fondeos':'talc_arba');opciones.prepararVista();
    const m=marcadores.get(clave);if(!m)return;
    if(f.geometry.type==='Polygon')map.fitBounds(m.getBounds(),{padding:[30,30],maxZoom:15});else map.setView(m.getLatLng(),16);
    m.openPopup();opciones.enfocarMapa();
  }
  function opcionesHTML() {
    return '<optgroup label="Fondeos y área reservada">'+datos.features.map(f=>`<option value="${escapar(claveFondeaderoTalcahuano(f))}">${escapar(f.properties.tipo==='fondeo'?'Fondeo '+f.properties.nombre:'Área reservada ARBA')}</option>`).join('')+'</optgroup>';
  }
  function conectarFiltro(div) {selectorFiltro=div.querySelector('[aria-label="Filtrar fondeos de Talcahuano"]');selectorFiltro.onchange=e=>filtrar(e.target.value);}
  function fuentesHTML() {
    const url=enlaceTalcahuano(datos.metadata.fuente);
    return '<details><summary>Fondeos y área reservada · 19 puntos + ARBA</summary><p>Azul: exteriores (A–I). Verde azulado: interiores (J–O). Naranja: alije (A1–A4). Violeta: área reservada ARBA.</p><p>Coordenadas del documento aportado y resolución 12.600/491, de 26/12/2023. Datum y vigencia por confirmar.</p>'+
      (url?`<p><a href="${escapar(url)}" target="_blank" rel="noopener noreferrer">Resolución oficial ↗</a></p>`:'')+
      '<p><a href="data/geo/talcahuano_fondeos.geojson" download>Descargar fondeos GeoJSON</a> · <a href="data/geo/talcahuano_fondeos.kml" download>Descargar fondeos KML</a></p></details>';
  }
  return {fondeos,arba,filtrar,abrir,opcionesHTML,fuentesHTML,conectarFiltro};
}
