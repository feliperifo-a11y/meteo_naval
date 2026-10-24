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

test('conserva 34 referencias, sus fuentes, precisión y disponibilidad de consulta', () => {
  assert.equal(datos.features.length, 34);
  assert.equal(new Set(datos.features.map(f => f.properties.id)).size, 34);
  assert.equal(datos.features.filter(f => !f.properties.sensor).length, 25);
  assert.equal(datos.features.filter(f => f.properties.clase === 'estacion').length, 6);
  assert.equal(datos.features.filter(f => f.properties.clase === 'boya').length, 2);
  assert.equal(datos.features.filter(f => f.properties.clase === 'mareografo').length, 1);
  for (const f of datos.features) {
    assert.equal(f.geometry.type, 'Point');
    assert(f.geometry.coordinates.every(Number.isFinite));
    for (const k of ['name', 'precision', 'note', 'source', 'geosource', 'consultado']) assert(f.properties[k]);
  }
  const p = id => datos.features.find(f => f.properties.id === id).properties;
  assert.match(p(28).note, /1,9 km al sur/);
  assert.match(p(32).status, /histórica.*no confirmados/);
  assert.match(p(33).variables, /no documenta un sensor de oleaje/);
  assert.match(p(34).note, /no.*Watchkeeper/);
  assert.match(datos.metadata.alcance, /No se verificaron umbrales/);
});
function entorno() {
  const visibles = new Set();
  const map = { getContainer: () => ({ clientWidth: 1000 }), addLayer(l) { if (!visibles.has(l)) { visibles.add(l); l.events.add?.(); } },
    removeLayer(l) { if (visibles.delete(l)) l.events.remove?.(); }, hasLayer: l => visibles.has(l), setView() {}, fitBounds() {} };
  class Layer {
    constructor() { this.children = new Set(); this.events = {}; }
    addTo(g) { g.addLayer(this); return this; }
    addLayer(l) { this.children.add(l); return this; }
    clearLayers() { this.children.clear(); return this; }
    on(e, f) { this.events[e] = f; return this; }
    bindTooltip(s) { this.tooltip = s; return this; }
    bindPopup(f) { this.popup = f; return this; }
    getLatLng() { return this.pos; }
    openPopup() { this.abierta = true; }
  }
  const L = { layerGroup: () => new Layer(), divIcon: i => i, marker: (pos, opt) => Object.assign(new Layer(), { pos, opt }) };
  let estaciones = [{ codigo: 'TALCAHUANO', lat: -36.708056, lon: -73.112778, fecha: 'hora de la fuente' },
    { codigo: 'LIRQUEN', lat: -36.71142, lon: -72.97783 },
    { codigo: 'WU-ITALCA20', lat: -36.62582, lon: -73.06066 },
    { codigo: 'WU-IHUALP1', lat: -36.74769, lon: -73.19125 }, { codigo: 'ARICA', lat: -18.4, lon: -70.3 }];
  let redVisible = estaciones;
  const catalogo = contexto.crearCatalogoTalcahuano(L, map, datos, escapar, {
    estaciones: () => estaciones, popupEstacion: s => 'Dato instrumental: ' + s.fecha,
    activar: clave => map.addLayer(clave === 'talc_obs' ? catalogo.observacion : catalogo.puertos),
    refrescarRed: () => { redVisible = estaciones.filter(s => !catalogo.observacionActiva() || !catalogo.esEstacionCatalogada(s)); }
  });
  return { catalogo, map, get redVisible() { return redVisible; }, actualizar(s) { estaciones = s; catalogo.actualizarObservacion(); } };
}
test('las capas son opcionales, se crean al activar y no duplican marcadores al alternar', () => {
  const h = entorno(), c = h.catalogo;
  assert.equal(c.puertos.children.size, 0); assert.equal(c.observacion.children.size, 0);
  h.map.addLayer(c.puertos); assert.equal(c.puertos.children.size, 25);
  h.map.removeLayer(c.puertos); h.map.addLayer(c.puertos); assert.equal(c.puertos.children.size, 25);
  h.map.addLayer(c.observacion); assert.equal(c.observacion.children.size, 9);
  h.map.removeLayer(c.observacion); h.map.addLayer(c.observacion); assert.equal(c.observacion.children.size, 9);
});
test('reutiliza las identidades y posiciones instrumentales; la red no repite las cuatro estaciones locales', () => {
  const h = entorno(), c = h.catalogo;
  h.map.addLayer(c.observacion);
  assert.deepEqual(h.redVisible.map(s => s.codigo), ['ARICA']);
  const m = c.marcadorEstacion('WU-ITALCA20');
  assert.deepEqual(Array.from(m.pos), [-36.62582, -73.06066]);
  assert.match(m.tooltip, /posición de la fuente instrumental/);
  assert.match(c.fichaEstacion({ codigo: 'WU-ITALCA20' }), /1,9 km al sur/);
  assert(c.esBoyaCatalogada({ nombre: 'Talcahuano' }));
  assert(!c.esBoyaCatalogada({ nombre: 'San Antonio' }));
  h.map.removeLayer(c.observacion); assert.equal(h.redVisible.length, 5);
  assert.equal(c.marcadorEstacion('TALCAHUANO'), null);
});
test('las actualizaciones conservan la hora propia del dato y las referencias sin medición no simulan lecturas', () => {
  const h = entorno(), c = h.catalogo; h.map.addLayer(c.observacion);
  assert.match(c.marcadorEstacion('TALCAHUANO').popup(), /hora de la fuente/);
  h.actualizar([{ codigo: 'TALCAHUANO', lat: -36.7, lon: -73.1, fecha: 'nueva hora instrumental' }]);
  assert.match(c.marcadorEstacion('TALCAHUANO').popup(), /nueva hora instrumental/);
  const watch = [...c.observacion.children].find(m => m.opt.title.includes('Watchkeeper'));
  const html = watch.popup(); assert.match(html, /histórica/); assert.match(html, /no confirmados/);
  assert.doesNotMatch(html, /Dato instrumental:/);
});
test('las fichas escapan texto y rechazan enlaces ejecutables', () => {
  const f = JSON.parse(JSON.stringify(datos.features[0]));
  f.properties.name = '<img src=x>'; f.properties.source = 'javascript:alert(1)';
  const html = contexto.fichaTalcahuano(f, escapar, datos.metadata);
  assert.doesNotMatch(html, /<img|javascript:/); assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /noopener noreferrer/);
});
test('Capuertos ofrece una sola opción y el catálogo solo se incorpora al dashboard completo', () => {
  const dashboard = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  const principal = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(dashboard, /id="btnCapuertos"/);
  const menu = dashboard.match(/id="menuCapuertos"[^>]*>(.*?)<\/div>/s)[1];
  assert.equal((menu.match(/<button /g) || []).length, 1); assert.match(menu, /Capuerto Talcahuano/);
  assert.match(dashboard, /const TALCAHUANO =/);
  assert.doesNotMatch(principal, /const TALCAHUANO|btnCapuertos|talc-herramientas/);
  assert.doesNotMatch(dashboard, /\/\*TALCAHUANO_(JS|CSS)\*\//);
  const plantilla = fs.readFileSync(path.join(root, 'build/plantilla.html'), 'utf8');
  assert.match(plantilla, /'talc_puertos'.*false,/); assert.match(plantilla, /'talc_obs'.*false,/);
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/actualizar.yml'), 'utf8');
  assert.match(workflow, /cp data\/geo\/talcahuano.geojson data\/geo\/talcahuano.kml _site\/data\/geo\//);
});
