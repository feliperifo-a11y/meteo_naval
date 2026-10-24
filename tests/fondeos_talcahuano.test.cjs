const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),datos=JSON.parse(fs.readFileSync(path.join(root,'data/geo/talcahuano_fondeos.geojson'),'utf8')),ctx={URL};
for(const file of ['talcahuano.js','fondeos_talcahuano.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'build',file),'utf8'),ctx);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Posiciones DMS del Word aportado, contrastadas con pp. 4–6 del PDF 12.600/491.
const originales={A:[36,39,24,73,4,6],B:[36,39,24,73,3,30],C:[36,39,54,73,4,18],D:[36,39,54,73,3,36],E:[36,40,24,73,4,12],F:[36,40,24,73,3,30],G:[36,40,54,73,4,6],H:[36,40,54,73,3,24],I:[36,40,54,73,2,42],J:[36,41,48,73,3,36],K:[36,41,48,73,2,54],L:[36,41,48,73,2,12],M:[36,42,18,73,3,36],N:[36,42,18,73,2,54],O:[36,42,18,73,2,12],A1:[36,40,15,73,0,57],A2:[36,40,15,73,2,12],A3:[36,41,6,73,1,30],A4:[36,39,15,73,0,57]};
test('conserva los 19 fondeos y sus posiciones originales con grupos 9 exteriores, 6 interiores y 4 de alije',()=>{
 const puntos=datos.features.filter(f=>f.geometry.type==='Point');assert.equal(puntos.length,19);assert.equal(new Set(puntos.map(f=>f.properties.nombre)).size,19);
 for(const [grupo,n]of [['exterior',9],['interior',6],['alije',4]])assert.equal(puntos.filter(f=>f.properties.grupo===grupo).length,n);
 for(const f of puntos){const o=originales[f.properties.nombre],c=f.geometry.coordinates;assert(o);assert(Math.abs(c[1]+o[0]+o[1]/60+o[2]/3600)<.00000051);assert(Math.abs(c[0]+o[3]+o[4]/60+o[5]/3600)<.00000051);assert(f.properties.latitud_original.endsWith(' S'));assert(f.properties.longitud_original.endsWith(' W'));}
 assert.equal(datos.features.find(f=>f.properties.nombre==='A4').geometry.coordinates[1],-36.654167);
});
test('ARBA es un único polígono cerrado por el perímetro, con los cuatro vértices identificados y sin diagonales',()=>{
 const polys=datos.features.filter(f=>f.geometry.type==='Polygon');assert.equal(polys.length,1);assert.equal(datos.features.length,20);
 const f=polys[0],ring=f.geometry.coordinates[0];assert.equal(f.properties.nombre,'ARBA');assert.equal(f.properties.vertices_originales.length,4);assert.equal(ring.length,5);assert.deepEqual(ring[0],ring.at(-1));
 assert.deepEqual(ring,[[-73.083333,-36.703889],[-73.083333,-36.711944],[-73.066389,-36.711944],[-73.066389,-36.703889],[-73.083333,-36.703889]]);
 for(let i=1;i<ring.length;i++)assert(ring[i][0]===ring[i-1][0]||ring[i][1]===ring[i-1][1]);
 const kml=fs.readFileSync(path.join(root,'data/geo/talcahuano_fondeos.kml'),'utf8');assert.equal((kml.match(/<Placemark>/g)||[]).length,20);assert.equal((kml.match(/<Point>/g)||[]).length,19);assert.equal((kml.match(/<Polygon>/g)||[]).length,1);
 for(const p of datos.features.filter(f=>f.geometry.type==='Point'))assert(kml.includes(p.geometry.coordinates.join(',')+',0'));
});
function entorno(){
 const activos=new Set(),vistas=[];let zoom=0;
 const map={getContainer:()=>({clientWidth:1000}),hasLayer:g=>activos.has(g),addLayer(g){if(!activos.has(g)){activos.add(g);g.events.add?.();}},removeLayer(g){if(activos.delete(g))g.events.remove?.();},closePopup(){},setView(p,z){vistas.push({p,z});},fitBounds(p){vistas.push({bounds:p});}};
 class Grupo{constructor(){this.children=new Set();this.events={};}on(k,f){this.events[k]=f;return this;}addLayer(g){this.children.add(g);return this;}addTo(g){g.addLayer(this);return this;}clearLayers(){this.children.clear();return this;}bindPopup(f){this.popup=f;return this;}bindTooltip(t){this.tooltip=t;return this;}getLatLng(){return this.pos;}getBounds(){return this.pos;}openPopup(){this.abierto=true;return this;}}
 const forma=(pos,opt)=>Object.assign(new Grupo(),{pos,opt}),L={layerGroup:()=>new Grupo(),marker:forma,polygon:forma,divIcon:o=>o};
 const c=ctx.crearFondeaderosTalcahuano(L,map,datos,esc,{ajustarZoom:()=>zoom++,prepararVista(){},enfocarMapa(){},activar:k=>map.addLayer(k==='talc_arba'?c.arba:c.fondeos)});
 return{c,map,vistas,get zoom(){return zoom;}};
}
test('las capas se construyen al activar y alternan sin duplicar marcadores ni confundir ARBA con fondeos',()=>{
 const h=entorno(),{c,map}=h;assert.equal(c.fondeos.children.size,0);assert.equal(c.arba.children.size,0);
 map.addLayer(c.fondeos);assert.equal(c.fondeos.children.size,19);map.removeLayer(c.fondeos);map.addLayer(c.fondeos);assert.equal(c.fondeos.children.size,19);
 map.addLayer(c.arba);assert.equal(c.arba.children.size,1);assert([...c.arba.children][0].tooltip.includes('ARBA'));assert(h.zoom>=4);
 assert.equal(new Set([...c.fondeos.children].map(m=>m.opt.icon.html.match(/background:([^\"]+)/)[1])).size,3);
});
test('filtra por las categorías del documento y abrir un fondeo excluido restablece la vista',()=>{
 const {c,map}=entorno();c.filtrar('alije');assert.equal(c.fondeos.children.size,0);map.addLayer(c.fondeos);assert.equal(c.fondeos.children.size,4);
 c.filtrar('interior');assert.equal(c.fondeos.children.size,6);c.filtrar('exterior');assert.equal(c.fondeos.children.size,9);
 c.abrir('fondeo:A1');assert.equal(c.fondeos.children.size,19);assert([...c.fondeos.children].find(m=>m.opt.title==='Fondeo A1').abierto);
 c.abrir('arba:ARBA');assert.equal(c.arba.children.size,1);assert([...c.arba.children][0].abierto);c.abrir('fondeo:INEXISTENTE');assert.equal(c.fondeos.children.size,19);
 c.filtrar('alije');map.removeLayer(c.fondeos);map.addLayer(c.fondeos);assert.equal(c.fondeos.children.size,4);assert.equal(c.arba.children.size,1);
});
test('las fichas conservan origen, coordenadas y fuente por página sin añadir sondas ni radios ausentes',()=>{
 const f=datos.features.find(f=>f.properties.nombre==='A1'),html=ctx.fichaFondeaderoTalcahuano(f,esc);assert.match(html,/Faenas de alije/);assert.match(html,/36°40′15″ S/);assert.match(html,/-36.670833, -73.015833/);assert.match(html,/#page=5/);assert.match(html,/Anexo A/);assert.doesNotMatch(html,/Sonda|Radio de borneo/);
 const arba=ctx.fichaFondeaderoTalcahuano(datos.features.at(-1),esc);assert.match(arba,/cuatro vértices/);assert.match(arba,/#page=6/);assert.match(arba,/ARBA 4/);
 const mal=structuredClone(f);mal.properties.nombre='<img src=x>';mal.properties.fuente='javascript:alert(1)';const safe=ctx.fichaFondeaderoTalcahuano(mal,esc);assert.doesNotMatch(safe,/<img|javascript:/);assert.match(safe,/&lt;img/);
});
test('los fondeos de Talcahuano solo se publican en el dashboard, comienzan apagados y conservan descargas propias',()=>{
 const d=fs.readFileSync(path.join(root,'dashboard.html'),'utf8'),p=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(d,/const FONDEOS_TALCAHUANO =/);assert.doesNotMatch(p,/FONDEOS_TALCAHUANO|crearFondeaderosTalcahuano/);assert.doesNotMatch(d,/\/\*FONDEOS_TALCAHUANO_JS\*\//);
 for(const key of ['talc_fondeos','talc_arba'])assert.match(d,new RegExp("addLayerRow\\(talc, '"+key+"'[^\\n]*false,"));
 const wf=fs.readFileSync(path.join(root,'.github/workflows/actualizar.yml'),'utf8');assert.match(wf,/cp data\/geo\/talcahuano_fondeos.geojson data\/geo\/talcahuano_fondeos.kml _site\/data\/geo\//);
 assert.match(d,/Filtrar fondeos de Talcahuano/);assert.match(d,/catalogoTalc.controles\(talc, catalogoFondeosTalc\)/);
});
