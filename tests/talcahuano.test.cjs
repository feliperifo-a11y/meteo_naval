const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const datos = JSON.parse(fs.readFileSync(path.join(root, 'data/geo/talcahuano.geojson'), 'utf8'));
const contexto = { URL };
vm.runInNewContext(fs.readFileSync(path.join(root, 'build/talcahuano.js'), 'utf8'), contexto);
const escapar = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('conserva 32 referencias, sus fuentes, precisión y disponibilidad de consulta', () => {
  assert.equal(datos.features.length, 32);
  assert.equal(new Set(datos.features.map(f => f.properties.id)).size, 32);
  assert.equal(datos.features.filter(f => !f.properties.sensor).length, 25);
  assert.equal(datos.features.filter(f => f.properties.clase === 'estacion').length, 6);
  assert.equal(datos.features.filter(f => f.properties.clase === 'boya').length, 1);
  assert.equal(datos.features.filter(f => f.properties.clase === 'mareografo').length, 0);
  for (const f of datos.features) {
    assert.equal(f.geometry.type, 'Point');
    assert(f.geometry.coordinates.every(Number.isFinite));
    for (const k of ['name', 'precision', 'note', 'source', 'geosource', 'consultado']) assert(f.properties[k]);
  }
  const p = id => datos.features.find(f => f.properties.id === id).properties;
  assert.match(p(28).note, /1,9 km al sur/);
  assert.match(p(32).status, /histórica.*no confirmados/);

  assert.match(datos.metadata.alcance, /No se verificaron umbrales/);
});
function entorno() {
  const visibles = new Set();
  const map = { getContainer: () => ({ clientWidth: 1000 }), addLayer(l) { if (!visibles.has(l)) { visibles.add(l); l.events.add?.(); } },
    removeLayer(l) { if (visibles.delete(l)) l.events.remove?.(); }, hasLayer: l => visibles.has(l), setView() {}, fitBounds(b) {this.bounds=b;} };
  class Layer {
    constructor() { this.children = new Set(); this.events = {}; }
    addTo(g) { g.addLayer(this); return this; }
    addLayer(l) { this.children.add(l); return this; }
    clearLayers() { this.children.clear(); return this; }
    on(e, f) { this.events[e] = f; return this; }
    bindTooltip(s) { this.tooltip = s; return this; }
    bindPopup(f) { this.popup = f; return this; }
    setLatLng(pos) {this.pos=pos;return this;}
    setIcon(icon) {this.opt.icon=icon;return this;}
    setTooltipContent(text) {this.tooltip=text;return this;}
    setPopupContent(f) {this.popup=f;return this;}
    getLatLng() { return this.pos; }
    openPopup(pos) { this.abierta = true; this.popupPos=pos; }
  }
  const forma=(pos,opt)=>Object.assign(new Layer(),{pos,opt});
  const L = { layerGroup: () => new Layer(), divIcon: i => i, marker: forma, polyline: forma };
  let estaciones = [{ codigo: 'TALCAHUANO', lat: -36.708056, lon: -73.112778, fecha: 'hora de la fuente' },
    { codigo: 'LIRQUEN', lat: -36.71142, lon: -72.97783 },
    { codigo: 'WU-ITALCA20', lat: -36.62582, lon: -73.06066 },
    { codigo: 'WU-IHUALP1', lat: -36.74769, lon: -73.19125 }, { codigo: 'ARICA', lat: -18.4, lon: -70.3 }];
  let redVisible = estaciones;
  let boyas=[];
  const catalogo = contexto.crearCatalogoTalcahuano(L, map, datos, escapar, {
    estaciones: () => estaciones, popupEstacion: s => 'Dato instrumental: ' + s.fecha,
    boyas:()=>boyas,popupBoya:b=>'Oleaje SHOA: '+b.ultimo?.hsig+' m · '+b.ultimo?.fecha,
    iconoEstacion:s=>'icono nacional '+s.codigo,tooltipEstacion:s=>'Ficha nacional '+s.codigo,
    iconoBoya:b=>'icono boya nacional '+b.nombre,tooltipBoya:b=>'Boya nacional '+b.nombre,
    estacionSinDatos:f=>({codigo:f.properties.meteoia_codigos[0],lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],sinDatos:true,fecha:'Sin datos'}),
    activar: clave => map.addLayer(clave === 'talc_obs' ? catalogo.observacion : clave === 'talc_limite' ? catalogo.limite : catalogo.puertos),
    refrescarRed: () => { redVisible = estaciones.filter(s => !catalogo.observacionActiva() || !catalogo.esEstacionCatalogada(s)); }
  });
  return { catalogo, map, get redVisible() { return redVisible; }, actualizar(s) { estaciones = s; catalogo.actualizarObservacion(); },actualizarBoyas(b){boyas=b;catalogo.actualizarObservacion();} };
}
test('las capas son opcionales, se crean al activar y no duplican marcadores al alternar', () => {
  const h = entorno(), c = h.catalogo;
  assert.equal(c.puertos.children.size, 0); assert.equal(c.observacion.children.size, 0);
  h.map.addLayer(c.puertos); assert.equal(c.puertos.children.size, 25);
  h.map.removeLayer(c.puertos); h.map.addLayer(c.puertos); assert.equal(c.puertos.children.size, 25);
  h.map.addLayer(c.observacion); assert.equal(c.observacion.children.size, 7);
  h.map.removeLayer(c.observacion); h.map.addLayer(c.observacion); assert.equal(c.observacion.children.size, 7);
});
test('límite de puerto: paralelo y meridiano forman una L hasta el primer cruce con la costa, sin duplicados',()=>{
  const h=entorno(),c=h.catalogo;assert.equal(c.limite.children.size,0);assert(!h.map.hasLayer(c.limite));
  c.abrir('limite:puerto');assert(h.map.hasLayer(c.limite));assert.equal(c.limite.children.size,2);
  const linea=[...c.limite.children].find(l=>l.opt.interactive!==false);
  assert(linea.abierta);assert.equal(linea.pos.length,3);
  for(const p of linea.pos.slice(0,2))assert(Math.abs(p[0]+36.68833333333333)<1e-10);
  assert(Math.abs(linea.pos[0][1]+73.1)<1e-10);assert(Math.abs(linea.pos[1][1]+73.025)<1e-10);
  assert.equal(linea.pos[1][1],linea.pos[2][1]);assert(linea.pos[2][0]<linea.pos[1][0]);
  // Cruce independiente sobre el segmento costero público: evita extender el meridiano sobre tierra.
  const a={lat:-36.7386649,lon:-73.0250073},b={lat:-36.7386713,lon:-73.0249187};
  const sur=a.lat+(-73.025-a.lon)/(b.lon-a.lon)*(b.lat-a.lat);
  assert(Math.abs(linea.pos[2][0]-sur)<1e-10);assert(linea.pos[2][0]>-36.739);
  assert.equal(linea.popupPos[0],linea.pos[0][0]);assert.equal(h.map.bounds,linea.pos);
  assert.match(linea.popup(),/hacia el sur hasta la costa/);assert.match(linea.popup(),/latitud es aproximada/);assert.doesNotMatch(linea.popup(),/solo el tramo norte/);
  assert.match(linea.popup(),/12600_491_261223_cp_talcahuano\.pdf#page=2/);assert.match(linea.popup(),/openstreetmap.org\/way\/417023797/);
  assert.match(linea.popup(),/12600_151_21_abr_2015\.pdf#page=3/);assert.match(linea.popup(),/Mayo_2025\.pdf#page=60/);
  h.map.removeLayer(c.limite);h.map.addLayer(c.limite);assert.equal(c.limite.children.size,2);
  const dashboard=fs.readFileSync(path.join(root,'dashboard.html'),'utf8'),principal=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(dashboard,/addLayerRow\(talc, 'talc_limite'[^\n]*false,/);assert.doesNotMatch(principal,/crearLimitePuertoTalcahuano/);
});
test('reutiliza las identidades y posiciones instrumentales; la red no repite las cuatro estaciones locales', () => {
  const h = entorno(), c = h.catalogo;
  h.map.addLayer(c.observacion);
  assert.deepEqual(h.redVisible.map(s => s.codigo), ['ARICA']);
  const m = c.marcadorEstacion('WU-ITALCA20');
  assert.deepEqual(Array.from(m.pos), [-36.62582, -73.06066]);
  assert.match(m.tooltip, /Ficha nacional WU-ITALCA20/);
  assert.equal(m.opt.icon,'icono nacional WU-ITALCA20');
  assert.match(c.fichaEstacion({ codigo: 'WU-ITALCA20' }), /1,9 km al sur/);
  assert(c.esBoyaCatalogada({ nombre: 'Talcahuano' }));
  assert(!c.esBoyaCatalogada({ nombre: 'San Antonio' }));
  h.map.removeLayer(c.observacion); assert.equal(h.redVisible.length, 5);
  assert.equal(c.marcadorEstacion('TALCAHUANO'), null);
});
test('las actualizaciones conservan la hora propia del dato y las referencias sin medición no simulan lecturas', () => {
  const h = entorno(), c = h.catalogo; h.map.addLayer(c.observacion);
  const original=c.marcadorEstacion('TALCAHUANO');
  assert.match(original.popup(), /hora de la fuente/);
  h.actualizar([{ codigo: 'TALCAHUANO', lat: -36.7, lon: -73.1, fecha: 'nueva hora instrumental' }]);
  assert.match(c.marcadorEstacion('TALCAHUANO').popup(), /nueva hora instrumental/);
  assert.equal(c.marcadorEstacion('TALCAHUANO'),original);
  const watch = [...c.observacion.children].find(m => m.opt.title.includes('Watchkeeper'));
  const html = watch.popup(); assert.match(html, /histórica/); assert.match(html, /no confirmados/);
  assert.doesNotMatch(html, /Dato instrumental:/);
});
test('Watchkeeper comparte la ficha y posición de la boya nacional, y conserva sus antecedentes históricos cerrados',()=>{
  const h=entorno(),c=h.catalogo;h.map.addLayer(c.observacion);
  const m=[...c.observacion.children].find(m=>m.opt.title.includes('Watchkeeper'));
  h.actualizarBoyas([{nombre:'Talcahuano',lat:-36.56016,lon:-73.34134,ultimo:{hsig:1.2,fecha:'2026-10-24T19:00:00Z'}}]);
  assert.deepEqual(Array.from(m.pos),[-36.56016,-73.34134]);assert.match(m.popup(),/Oleaje SHOA: 1.2 m.*19:00:00Z/);
  assert.equal(m.opt.icon,'icono boya nacional Talcahuano');
  const metadata=c.fichaBoya({nombre:'Talcahuano'});assert.match(metadata,/<details class="talc-detalle">/);assert.doesNotMatch(metadata,/<details[^>]*\bopen/);
  assert.match(metadata,/Posición publicada en 2025/);assert.equal(c.fichaBoya({nombre:'Iquique'}),'');
  h.actualizarBoyas([{nombre:'Talcahuano',lat:-36.56,lon:-73.34,ultimo:{hsig:1.6,fecha:'2026-10-24T20:00:00Z'}}]);
  assert.match(m.popup(),/Oleaje SHOA: 1.6 m.*20:00:00Z/);assert.equal(c.observacion.children.size,7);
});
test('POSAR y el mareógrafo retirados no se pueden abrir ni aparecen en las descargas',()=>{
  const h=entorno();h.catalogo.abrir(33);h.catalogo.abrir(34);
  assert.equal(h.catalogo.observacion.children.size,0);assert.equal(h.catalogo.observacionActiva(),false);
  assert(!datos.features.some(f=>[33,34].includes(f.properties.id)));
  const kml=fs.readFileSync(path.join(root,'data/geo/talcahuano.kml'),'utf8');
  assert.doesNotMatch(kml,/POSAR|Mareógrafo|Mareografo/);assert.equal((kml.match(/<Placemark>/g)||[]).length,32);
});
test('complementa Penco y Carriel sin duplicar ni sustituir las estaciones de la red nacional',()=>{
  const nacional=[{codigo:'WU-ITALCA20',temp:16},{codigo:'DMC-360019',temp:18}],extras=[{codigo:'SCIE',temp:19},{codigo:'RMCL0193',temp:21},{codigo:'OTRA',temp:20}];
  const out=contexto.complementarEstacionesTalcahuano(nacional,extras,datos);
  assert.equal(out.length,3);assert.equal(out[0],nacional[0]);assert.equal(out[1],nacional[1]);assert.equal(out[2],extras[1]);
});
test('las fichas escapan texto y rechazan enlaces ejecutables', () => {
  const f = JSON.parse(JSON.stringify(datos.features[0]));
  f.properties.name = '<img src=x>'; f.properties.source = 'javascript:alert(1)';
  const html = contexto.fichaTalcahuano(f, escapar, datos.metadata);
  assert.doesNotMatch(html, /<img|javascript:/); assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /noopener noreferrer/);
});
test('Capuertos ofrece Talcahuano y Valparaíso y el catálogo solo se incorpora al dashboard completo', () => {
  const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  const principal = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(dashboard, /id="btnCapuertos"/);
  const menu = dashboard.match(/id="menuCapuertos"[^>]*>(.*?)<\/div>/s)[1];
  assert.equal((menu.match(/<button /g) || []).length, 2); assert.match(menu, /Capuerto Talcahuano/); assert.match(menu, /Capuerto Valparaíso/);
  assert.match(dashboard, /const TALCAHUANO =/);
  assert.doesNotMatch(principal, /const TALCAHUANO|btnCapuertos|talc-herramientas/);
  assert.doesNotMatch(dashboard, /\/\*TALCAHUANO_(JS|CSS)\*\//);
  const plantilla = fs.readFileSync(path.join(root, 'build/plantilla.html'), 'utf8');
  assert.match(plantilla, /'talc_puertos'.*false,/); assert.match(plantilla, /'talc_obs'.*false,/);
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/actualizar.yml'), 'utf8');
  assert.match(workflow, /cp data\/geo\/talcahuano.geojson data\/geo\/talcahuano.kml _site\/data\/geo\//);
});
