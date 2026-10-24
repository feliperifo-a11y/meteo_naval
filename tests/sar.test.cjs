const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/geo/sar.json'), 'utf8'));

test('conserva los cinco distritos, sus centros y los paralelos de referencia', () => {
  const districts = data.features.filter(f => f.properties.tipo === 'rotulo');
  assert.deepEqual(districts.map(f => f.properties.distrito), ['I', 'II', 'III', 'IV', 'V']);
  assert.equal(data.features.filter(f => f.properties.rol === 'MRCC').length, 5);
  assert.equal(data.features.filter(f => f.properties.rol === 'MRSC').length, 11);
  const limits = data.features.filter(f => f.properties.tipo === 'distrital');
  const expected = [-(26 + 3 / 60 + 20 / 3600), -(34 + 41 / 60), -(40 + 14 / 60 + 30 / 3600), -(48 + 49 / 60)];
  limits.forEach((f, i) => {
    assert(Math.abs(f.geometry.coordinates[0][1] - expected[i]) < 1e-9);
    assert.equal(f.geometry.coordinates[0][0], i === 0 ? -120 : -131);
    assert(f.geometry.coordinates[1][0] > -76 && f.geometry.coordinates[1][0] < -70);
  });
});
test('los minutos decimales australes no se interpretan como segundos', () => {
  const points = data.features.find(f => /austral/.test(f.properties.nombre)).geometry.coordinates;
  assert(Math.abs(points[0][1] + 55 + 7.3 / 60) < 1e-9);
  assert(Math.abs(points[3][1] + 56 + 22.8 / 60) < 1e-9);
  assert(Math.abs(points[5][1] + 58 + 21.1 / 60) < 1e-9);
  assert.equal(points[6][0], -53);
  assert(points[7][1] < -60 && points[7][1] > -80);
});
test('los trazos se detienen en el mar y los rótulos se anclan fuera del borde oeste', () => {
  for (const f of data.features.filter(f => f.properties.tipo === 'limite')) {
    const end = f.geometry.coordinates.at(-1);
    const crop = f.properties.corte_visual_antartica;
    assert(end[1] > crop.costa_latitud);
    assert(Math.abs(end[1] - crop.costa_latitud - 0.75) < 1e-9);
    assert(end[1] > -80 && end[1] < -60);
  }
  for (const f of data.features.filter(f => f.properties.tipo === 'rotulo')) {
    const [lon, lat] = f.geometry.coordinates;
    assert.equal(lon, lat > -30 ? -120 : -131);
    assert.equal(f.properties.anclaje, 'limite_oeste');
  }
  const template = fs.readFileSync(path.join(root, 'build/plantilla_v2.html'), 'utf8');
  assert.match(template, /\.sar-label\.sar-outside>span\{transform:translate\(calc\(-100% - 10px\),-50%\)\}/);
});
test('la portada conserva la capa SAR apagada y las capas habituales encendidas', () => {
  const html = fs.readFileSync(path.join(root, 'build/plantilla_v2.html'), 'utf8');
  assert.match(html, /\['Distritos SAR', capaSAR, false\]/);
  assert.match(html, /\['METAREA XV', MET, true\]/);
  assert.match(html, /\['Estaciones', capaEst, true\]/);
  assert.match(html, /\['Avisos vigentes y próximos', capaAv, true\]/);
  assert.doesNotMatch(html, /capaSAR\.addTo\(map\)/);
});

function harness() {
  const counts = { geometry: 0, marker: 0 }, listeners = new Map(), controls = new Set();
  class Layer {
    constructor() { this.children = new Set(); this.events = {}; }
    addLayer(child) { this.children.add(child); return this; }
    removeLayer(child) { this.children.delete(child); return this; }
    addTo(target) { target.addLayer(this); return this; }
    on(event, callback) { this.events[event] = callback; return this; }
    bindTooltip() { return this; }
    bindPopup() { return this; }
  }
  const map = { zoom: 3, minZoom: 3,
    getMinZoom() { return this.minZoom; }, setMinZoom(z) { this.minZoom = z; }, getContainer: () => ({}),
    createPane: () => ({ style: {} }), getZoom() { return this.zoom; },
    on: (event, cb) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(cb); },
    off: (event, cb) => listeners.get(event)?.delete(cb),
    removeControl: c => controls.delete(c), fitBounds() {}
  };
  const L = { layerGroup: () => new Layer(),
    control: () => ({ addTo(map) { this.onAdd(map); controls.add(this); return this; } }),
    geoJSON: () => { counts.geometry++; return new Layer(); },
    marker: () => { counts.marker++; return new Layer(); }, circleMarker: () => new Layer(), divIcon: options => options,
    DomUtil: { create: () => ({ innerHTML: '', querySelector: () => ({ onclick: null }) }), addClass() {}, removeClass() {} },
    DomEvent: { disableClickPropagation() {}, disableScrollPropagation() {} }
  };
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'build/sar.js'), 'utf8'), context);
  const layer = context.crearCapaSAR(L, map, data, String);
  return { layer, map, counts, listeners, controls };
}
test('dibuja al activar y no duplica elementos ni controles al alternar la capa', () => {
  const h = harness();
  assert.equal(h.counts.geometry, 0); assert.equal(h.layer.children.size, 0);
  h.layer.events.add();
  assert.equal(h.map.minZoom, 1.5);
  assert.equal(h.counts.geometry, 6); assert.equal(h.counts.marker, 5);
  const size = h.layer.children.size;
  assert.equal(h.controls.size, 1); assert.equal(h.listeners.get('zoomend').size, 1);
  h.layer.events.remove();
  assert.equal(h.map.minZoom, 3);
  assert.equal(h.controls.size, 0); assert.equal(h.listeners.get('zoomend').size, 0);
  h.layer.events.add();
  assert.equal(h.counts.geometry, 6); assert.equal(h.layer.children.size, size);
  assert.equal(h.controls.size, 1); assert.equal(h.listeners.get('zoomend').size, 1);
  h.map.zoom = 5; for (const cb of h.listeners.get('zoomend')) cb();
  assert.equal(h.layer.children.size, size + 1);
  h.map.zoom = 3; for (const cb of h.listeners.get('zoomend')) cb();
  assert.equal(h.layer.children.size, size);
});
