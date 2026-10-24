const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),datos=JSON.parse(fs.readFileSync(path.join(root,'data/geo/valparaiso.geojson'),'utf8')),limites=JSON.parse(fs.readFileSync(path.join(root,'data/geo/valparaiso_limites.json'),'utf8'));
const ctx={URL};for(const f of ['talcahuano.js','valparaiso.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'build',f),'utf8'),ctx);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function entorno() {
 const activos=new Set(),vistas=[];
 const map={hasLayer:g=>activos.has(g),addLayer(g){if(!activos.has(g)){activos.add(g);g.events.add?.();}},removeLayer(g){if(activos.delete(g))g.events.remove?.();},closePopup(){},setView(p,z){vistas.push({p,z});},fitBounds(p){vistas.push({bounds:p});}};
 class Grupo {
  constructor(){this.children=new Set();this.events={};}
  addTo(g){g.addLayer(this);return this;}addLayer(g){this.children.add(g);return this;}removeLayer(g){this.children.delete(g);return this;}clearLayers(){this.children.clear();return this;}
  on(e,fn){this.events[e]=fn;return this;}bindTooltip(t){this.tooltip=t;return this;}bindPopup(p){this.popup=p;return this;}
  getLatLng(){return this.pos;}getBounds(){return this.pos;}openPopup(){this.abierto=true;return this;}
  setLatLng(p){this.pos=p;return this;}setIcon(i){this.opt.icon=i;return this;}setTooltipContent(t){this.tooltip=t;return this;}setPopupContent(p){this.popup=p;return this;}
 }
 const forma=(pos,opt)=>Object.assign(new Grupo(),{pos,opt});
 const L={layerGroup:()=>new Grupo(),marker:forma,circle:forma,polygon:forma,divIcon:i=>i};
 let estaciones=[{codigo:'VALPARAISO',nombre:'Valparaíso',lat:-33.03798,lon:-71.62734,fecha:'hora real'},{codigo:'WL-240087',nombre:'Montemar',lat:-32.95708,lon:-71.55036,fecha:'hora Montemar'},{codigo:'ARICA',lat:-18.4,lon:-70.3}];
 let cambios=0,zoom=0;
 const c=ctx.crearCatalogoValparaiso(L,map,datos,limites,esc,{estaciones:()=>estaciones,iconoEstacion:s=>'icono nacional '+s.codigo,tooltipEstacion:s=>'tooltip '+s.codigo,popupEstacion:s=>'dato '+s.fecha,ajustarZoom:()=>zoom++,refrescarRed:()=>cambios++,prepararVista(){},enfocarMapa(){},activar:key=>map.addLayer(c[key==='valpo_obs'?'observacion':key.slice(6)])});
 return {c,map,L,vistas,get cambios(){return cambios;},get zoom(){return zoom;},actualizar(v){estaciones=v;c.actualizarObservacion();}};
}
test('conserva los 23 fondeos, tres frentes y ZEP del paquete, con coordenadas originales coherentes',()=>{
 assert.equal(datos.features.length,27);const f=datos.features.filter(x=>x.properties.tipo==='fondeo');assert.equal(f.length,23);assert.equal(datos.features.filter(x=>x.properties.tipo==='atraque').length,3);
 const grados=s=>{const m=s.match(/(\d+) (\d+(?:\.\d+)?) [SW]/);return -(+m[1]+ +m[2]/60);};
 for(const x of f){assert(Math.abs(x.geometry.coordinates[0]-grados(x.properties.longitud_original))<.00000005);assert(Math.abs(x.geometry.coordinates[1]-grados(x.properties.latitud_original))<.00000005);}
 assert(f.some(x=>x.properties.nombre==='A-7'));assert(f.some(x=>x.properties.nombre==='UNIFORM'));
 const z=datos.features.find(x=>x.geometry.type==='Polygon');assert.equal(z.properties.fondeo_permitido,false);assert.deepEqual(z.geometry.coordinates[0][0],z.geometry.coordinates[0].at(-1));
 for(const x of datos.features.filter(x=>x.properties.tipo==='atraque'))assert.equal(limites.instalaciones.find(i=>i.nombre===x.properties.nombre).fuente,x.properties.fuente);
 const kml=fs.readFileSync(path.join(root,'data/geo/valparaiso.kml'),'utf8');assert.equal((kml.match(/<Placemark>/g)||[]).length,27);assert.equal((kml.match(/<Polygon>/g)||[]).length,1);
});
test('las cinco capas empiezan vacías, se construyen al activar y no se duplican',()=>{
 const h=entorno(),c=h.c;for(const k of ['puertos','fondeos','zep','radios','observacion'])assert.equal(c[k].children.size,0);
 h.map.addLayer(c.fondeos);assert.equal(c.fondeos.children.size,23);h.map.removeLayer(c.fondeos);h.map.addLayer(c.fondeos);assert.equal(c.fondeos.children.size,23);
 h.map.addLayer(c.puertos);assert.equal(c.puertos.children.size,3);h.map.addLayer(c.zep);assert.equal(c.zep.children.size,1);h.map.addLayer(c.radios);assert.equal(c.radios.children.size,23);
 assert.deepEqual([...c.radios.children].map(m=>m.opt.radius),datos.features.filter(f=>f.properties.tipo==='fondeo').map(f=>f.properties.radio_borneo_max_m));
 assert([...c.radios.children].every(m=>m.opt.interactive===false));
});
test('los filtros conservan bunkering y carga vital, y abrir una referencia oculta restablece su visibilidad',()=>{
 const h=entorno(),c=h.c;h.map.addLayer(c.fondeos);h.map.addLayer(c.radios);
 c.filtrar('menor');assert.equal(c.fondeos.children.size,8);assert.equal(c.radios.children.size,8);
 c.filtrar('mayor');assert.equal(c.fondeos.children.size,14);assert.equal(c.radios.children.size,14);
 c.filtrar('bunkering');assert.equal(c.fondeos.children.size,3);assert([...c.fondeos.children].some(m=>m.opt.title==='Fondeo A-7'));
 c.filtrar('vital');assert.equal(c.fondeos.children.size,1);assert.equal([...c.fondeos.children][0].opt.title,'Fondeo UNIFORM');
 c.abrir('fondeo:ALFA');assert.equal(c.fondeos.children.size,23);assert([...c.fondeos.children].find(m=>m.opt.title==='Fondeo ALFA').abierto);
});
test('observación costera reutiliza la ficha, símbolo y posición reales, se actualiza sin duplicar y no inventa sensores',()=>{
 const h=entorno(),c=h.c;h.map.addLayer(c.observacion);assert.equal(c.observacion.children.size,2);
 const m=c.marcadorEstacion('VALPARAISO');assert.deepEqual(Array.from(m.pos),[-33.03798,-71.62734]);assert.equal(m.opt.icon,'icono nacional VALPARAISO');assert.equal(m.popup(),'dato hora real');assert.equal(c.esEstacionCatalogada({codigo:'ARICA'}),false);
 h.actualizar([{codigo:'VALPARAISO',lat:-33.038,lon:-71.627,fecha:'nueva hora'}]);assert.equal(c.marcadorEstacion('VALPARAISO'),m);assert.equal(c.observacion.children.size,1);assert.equal(m.popup(),'dato nueva hora');
 h.actualizar([{codigo:'VALPARAISO',sinDatos:true}]);assert.equal(c.observacion.children.size,0);
 h.map.removeLayer(c.observacion);assert.equal(c.marcadorEstacion('VALPARAISO'),null);
});
test('las fichas conservan condiciones por sitio y diferencian documentos y calados sin inferir cierre',()=>{
 const frente=datos.features.find(f=>f.properties.nombre.includes('sitios 1-3')),html=ctx.fichaValparaiso(frente,limites,esc);
 assert.match(html,/14,1 m.*2018/);assert.match(html,/13,8 m/);assert.match(html,/No equivale a estado de puerto/);assert.match(html,/no identifica cada sitio/);
 const esp=ctx.fichaValparaiso(datos.features.find(f=>f.properties.nombre.includes('Espigón')),limites,esc);for(const n of [6,7,8])assert.match(esp,new RegExp('Sitio '+n));assert.match(esp,/9,3 \/ 8,9/);
 const f=structuredClone(frente);f.properties.nombre='<img src=x>';f.properties.fuente='javascript:alert(1)';const safe=ctx.fichaValparaiso(f,limites,esc);assert.doesNotMatch(safe,/<img|javascript:/);assert.match(safe,/&lt;img src=x&gt;/);
});
test('al alternar catálogos se mantiene el zoom ampliado y la red nacional omite estaciones regionales activas',()=>{
 const source=fs.readFileSync(path.join(root,'build/plantilla.html'),'utf8'),h=entorno(),activos=new Set();
 const talc={puertos:{},observacion:{},observacionActiva:()=>activos.has('talc'),esEstacionCatalogada:s=>s.codigo==='TALCAHUANO'};
 const c={...h.c,observacionActiva:()=>activos.has('valpo')};let maximo;
 const v={catalogoTalc:talc,catalogoFondeosTalc:{fondeos:{},arba:{}},catalogoValpo:c,map:{hasLayer:g=>activos.has(g),setMaxZoom:n=>maximo=n},zoomMaximoHabitual:14};
 vm.runInNewContext(source.match(/function ajustarZoomCapuertos\(\) \{[\s\S]*?\n\}/)[0],v);
 v.ajustarZoomCapuertos();assert.equal(maximo,14);activos.add(v.catalogoFondeosTalc.fondeos);v.ajustarZoomCapuertos();assert.equal(maximo,18);activos.delete(v.catalogoFondeosTalc.fondeos);activos.add(v.catalogoFondeosTalc.arba);v.ajustarZoomCapuertos();assert.equal(maximo,18);activos.delete(v.catalogoFondeosTalc.arba);activos.add(c.fondeos);v.ajustarZoomCapuertos();assert.equal(maximo,18);activos.add(talc.puertos);activos.delete(c.fondeos);v.ajustarZoomCapuertos();assert.equal(maximo,18);
 const b={L:h.L,ESTACIONES:[{codigo:'VALPARAISO'},{codigo:'WL-240087'},{codigo:'TALCAHUANO'},{codigo:'ARICA'}],catalogoTalc:talc,catalogoValpo:c,evaluar:()=>({k:'ok'}),iconoEstacion:()=>({}),tooltipEstacion:()=>'',popupSt:()=>''};
 vm.runInNewContext('const stMarkers=new Map();'+source.match(/function buildEst\(\) \{[\s\S]*?\n\}/)[0],b);
 assert.equal(b.buildEst().children.size,4);activos.add('valpo');assert.equal(b.buildEst().children.size,2);activos.add('talc');assert.equal(b.buildEst().children.size,1);
});
test('Valparaíso solo se incorpora al dashboard, con capas apagadas y descargas publicadas',()=>{
 const d=fs.readFileSync(path.join(root,'dashboard.html'),'utf8'),p=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(d,/btnCapuertoValpo/);assert.match(d,/capasValparaiso/);assert.doesNotMatch(d,/\/\*VALPARAISO_(JS|CSS)\*\//);assert.doesNotMatch(p,/crearCatalogoValparaiso|const VALPARAISO|btnCapuertoValpo/);
 for(const key of ['puertos','fondeos','zep','radios','obs'])assert.match(d,new RegExp("addLayerRow\\(valpo,'valpo_"+key+"'[^\\n]*false,"));
 const wf=fs.readFileSync(path.join(root,'.github/workflows/actualizar.yml'),'utf8');assert.match(wf,/cp data\/geo\/valparaiso.geojson data\/geo\/valparaiso.kml data\/geo\/valparaiso_limites.json _site\/data\/geo\//);
});
