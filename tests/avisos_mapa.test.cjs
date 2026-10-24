const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const contexto = { URL };
vm.runInNewContext(fs.readFileSync(path.join(root, 'build/avisos_mapa.js'), 'utf8'), contexto);
const ahora = Date.parse('2026-10-24T16:00:00Z');
const rectangulo = (o, s, e, n) => ({ type: 'Polygon', coordinates: [[[o, s], [o, n], [e, n], [e, s], [o, s]]] });
const zona = extra => ({ nombre: 'Sector central', desde: '2026-10-24T12:00:00Z', hasta: '2026-10-25T12:00:00Z', detalle: 'Viento NW 25/35 kt, rachas 50 kt.', geom: rectangulo(-120, -45, -95, -30), ...extra });
const aviso = { tipo: 'Aviso de temporal', sector: 'Zona X', url: 'https://meteoarmada.directemar.cl/meteo/zona-x' };
const escapar = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const L = { divIcon: v => v, marker: (pos, options) => ({ pos, options }) };
const crear = (a = aviso, zs = [zona()], t = ahora) => contexto.crearResumenAviso(L, a, zs, escapar, d => d.toISOString(), t);

test('el resumen aparece automáticamente dentro del área y enlaza al pronóstico oficial', () => {
  const r = crear();
  assert.deepEqual(Array.from(r.pos), [-37.5, -107.5]);
  assert.equal(r.options.pane, 'avResumenPane');
  assert.match(r.options.icon.html, /Viento NW 25\/35 kt, rachas 50 kt/);
  assert.match(r.options.icon.html, /Vigente · hasta 2026-10-25T12:00:00.000Z/);
  assert.match(r.options.icon.html, /href="https:\/\/meteoarmada.directemar.cl\/meteo\/zona-x" target="_blank" rel="noopener noreferrer">Pronóstico oficial/);
});
test('al cambiar la hora solo resume zonas vigentes, nunca próximas o expiradas', () => {
  const proxima = zona({ desde: '2026-10-25T12:00:00Z', hasta: '2026-10-26T12:00:00Z', detalle: 'Futuro' });
  const pasada = zona({ hasta: '2026-10-24T15:59:59Z', detalle: 'Expirado' });
  assert.equal(crear(aviso, [proxima, pasada]), null);
  assert.equal(crear(aviso, [zona({ desde: 'inválido' })]), null);
  assert.equal(crear(aviso, [zona({ geom: null })]), null);
  const r = crear(aviso, [zona(), proxima, pasada]);
  assert.doesNotMatch(r.options.icon.html, /Futuro|Expirado/);
  assert(crear(aviso, [zona()], Date.parse(zona().desde)));
  assert(crear(aviso, [zona()], Date.parse(zona().hasta)));
  assert.equal(crear(aviso, [zona()], Date.parse(zona().hasta) + 1), null);
});
test('agrupa zonas del mismo aviso, conserva condiciones y diferencia la alerta calculada por MeteoIA', () => {
  const r = crear({ ...aviso, zona_ix: true }, [zona(), zona({ detalle: 'Mar gruesa 5/7 m.' })]);
  assert.equal((r.options.icon.html.match(/<section /g) || []).length, 1);
  assert.match(r.options.icon.html, /Viento NW.*Mar gruesa 5\/7 m/);
  assert.match(r.options.icon.html, /Alerta calculada por MeteoIA/);
  assert.doesNotMatch(crear().options.icon.html, /Alerta calculada/);
  assert.match(crear({ ...aviso, resumen: 'Situación frontal' }, [zona({ detalle: '' })]).options.icon.html, /Situación frontal/);
});
test('ubica el resumen en el interior de multipolígonos, fuera de sus huecos', () => {
  const geom = { type: 'MultiPolygon', coordinates: [rectangulo(-120, -45, -95, -30).coordinates, rectangulo(-80, -40, -79, -39).coordinates] };
  assert.deepEqual(Array.from(crear(aviso, [zona({ geom })]).pos), [-37.5, -107.5]);
  const conHueco = rectangulo(-120, -45, -95, -30);
  conHueco.coordinates.push(rectangulo(-115, -42, -100, -33).coordinates[0]);
  const pos = crear(aviso, [zona({ geom: conHueco })]).pos;
  assert(pos[1] < -115 || pos[1] > -100);
});
test('escapa el texto y solo publica enlaces HTTPS de la fuente oficial', () => {
  const r = crear({ ...aviso, tipo: '<img src=x>', url: 'javascript:alert(1)', pagina: aviso.url }, [zona({ detalle: '<script>alert(1)</script>' })]);
  assert.doesNotMatch(r.options.icon.html, /<script>|<img|javascript:/);
  assert.match(r.options.icon.html, /&lt;script&gt;/);
  assert.match(r.options.icon.html, /href="https:\/\/meteoarmada.directemar.cl/);
  assert.doesNotMatch(crear({ ...aviso, url: 'https://directemar.cl.ejemplo.com/falso' }).options.icon.html, /<a /);
});
test('ambas páginas incluyen el componente y lo agregan al mismo grupo que se oculta con el aviso', () => {
  for (const p of ['build/plantilla.html', 'build/plantilla_v2.html']) {
    const s = fs.readFileSync(path.join(root, p), 'utf8');
    assert.match(s, /const resumen = crearResumenAviso\(L, a, .*?\); if \(resumen\) resumen.addTo\(g\)/);
  }
  for (const p of ['index.html', 'dashboard.html']) {
    const s = fs.readFileSync(path.join(root, p), 'utf8');
    assert.match(s, /function crearResumenAviso/);
    assert.match(s, /\.av-resumen-tarjeta\{/);
    assert.doesNotMatch(s, /\/\*AVISOS_MAPA_(CSS|JS)\*\//);
  }
  assert.match(fs.readFileSync(path.join(root, 'build/plantilla_v2.html'), 'utf8'), /setInterval\(pintarAvisos, 60000\)/);
});
