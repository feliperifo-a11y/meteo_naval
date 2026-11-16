// Plan de búsqueda SAR (build/busqueda_sar.js): tablas IAMSAR vol. III, espaciamiento, patrones y probabilidad de detección.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const m = require(path.join(__dirname, '..', 'build', 'busqueda_sar.js'));
const area = { centro: [-36.5, -73.4], largo: 12, ancho: 6, rumbo: 30 };
const mn = (a, b) => Math.hypot((a[0] - b[0]) * 60, (a[1] - b[1]) * 60 * Math.cos(-36.5 * Math.PI / 180));
const largo = p => p.slice(1).reduce((s, q, i) => s + mn(p[i], q), 0);
const cerca = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

test('las tablas entregan los valores del manual y se interpolan entre columnas', () => {
  assert.equal(m.sarAnchoBarrido('buque', 'piw', 3), 0.4); assert.equal(m.sarAnchoBarrido('buque', 'balsa6', 10), 5.0); assert.equal(m.sarAnchoBarrido('buque', 'bote24', 20), 18.1);
  assert.equal(m.sarAnchoBarrido('helo', 'balsa4', 5), 1.7); assert.equal(m.sarAnchoBarrido('avion', 'bote10', 20), 7.8);
  assert.ok(cerca(m.sarAnchoBarrido('buque', 'balsa4', 7.5), (3.2 + 4.2) / 2, 1e-9));
  assert.equal(m.sarAnchoBarrido('buque', 'piw', 1), 0.4); assert.equal(m.sarAnchoBarrido('buque', 'piw', 40), 0.7);   // fuera de la tabla: borde
  for (const t of Object.values(m.SAR_BARRIDO)) for (const [, w] of Object.values(t.objetos)) assert.equal(w.length, t.vis.length);
});

test('el factor por tiempo usa la peor condición entre viento y ola', () => {
  assert.deepEqual([m.sarFactorTiempo('piw', 10, 0.5).fw, m.sarFactorTiempo('piw', 20, 0.5).fw, m.sarFactorTiempo('piw', 10, 2).fw], [1, 0.5, 0.25]);
  assert.deepEqual([m.sarFactorTiempo('balsa6', 10, 0.5).fw, m.sarFactorTiempo('balsa6', 10, 1.2).fw, m.sarFactorTiempo('balsa6', 30, 0.5).fw], [1, 0.9, 0.6]);
});

test('trayectorias paralelas: tramos a lo largo del eje mayor, primer tramo a medio espaciamiento y área completa', () => {
  const p = m.sarPatronBusqueda(area, { tipo: 'ps', S: 2, inicio: [-36.3, -73.6] });
  assert.equal(p.n, 3); assert.ok(cerca(p.S, 2)); assert.ok(cerca(p.tramoMn, 10)); assert.equal(p.pts.length, 6);
  assert.ok(cerca(p.totalMn, 3 * 10 + 2 * 2)); assert.ok(cerca(largo(p.pts), p.totalMn, 0.05)); assert.equal(p.fraccion, 1);
  assert.ok(cerca(p.rumbos[0] % 180, 30, 0.01), 'los tramos siguen el rumbo del eje mayor');
  for (const q of p.pts) assert.ok(p.dentro(q));
  // El espaciamiento se ajusta hacia abajo para cubrir el ancho exacto.
  const q = m.sarPatronBusqueda(area, { tipo: 'ps', S: 2.5 }); assert.equal(q.n, 3); assert.ok(cerca(q.S, 2));
});

test('línea progresiva: tramos a lo largo del eje menor', () => {
  const p = m.sarPatronBusqueda(area, { tipo: 'cs', S: 2 });
  assert.equal(p.n, 6); assert.ok(cerca(p.tramoMn, 4)); assert.ok(cerca(p.rumbos[0] % 180, 120, 0.01)); assert.ok(cerca(p.totalMn, 6 * 4 + 5 * 2));
});

test('con distancia limitada se recorta la trayectoria y la franja cubierta', () => {
  const p = m.sarPatronBusqueda(area, { tipo: 'ps', S: 2, maxMn: 17 });
  assert.ok(cerca(largo(p.pts), 17, 0.05)); assert.ok(p.fraccion > 0.4 && p.fraccion < 0.55); assert.ok(cerca(p.cubiertoMn2, 72 * p.fraccion, 1e-6));
  assert.equal(p.dentro(p.pts[0]), true);
});

test('cuadrado expansivo: parte en el dátum, primer tramo contra el viento, tramos S, S, 2S, 2S', () => {
  const p = m.sarPatronBusqueda(area, { tipo: 'ss', S: 1, vientoDe: 200, dato: [-36.5, -73.4] });
  assert.ok(mn(p.pts[0], [-36.5, -73.4]) < 1e-6);
  const d = p.pts.slice(1, 6).map((q, i) => mn(p.pts[i], q)); assert.ok(cerca(d[0], 1) && cerca(d[1], 1) && cerca(d[2], 2) && cerca(d[3], 2) && cerca(d[4], 3));
  const rumbo = Math.atan2((p.pts[1][1] - p.pts[0][1]) * Math.cos(36.5 * Math.PI / 180), p.pts[1][0] - p.pts[0][0]) * 180 / Math.PI;
  assert.ok(cerca((rumbo + 360) % 360, 200, 0.5), 'primer tramo hacia de donde viene el viento');
});

test('sector: siete tramos, 9 R en total, pasa por el dátum y vuelve a él', () => {
  const p = m.sarPatronBusqueda(area, { tipo: 'vs', radio: 3, vientoDe: 270, dato: [-36.5, -73.4] });
  assert.equal(p.pts.length, 8); assert.ok(cerca(p.totalMn, 27)); assert.ok(mn(p.pts[7], p.pts[0]) < 0.01, 'termina en el dátum');
  for (const q of p.pts) assert.ok(mn(q, p.pts[0]) <= 3.01);
});

test('probabilidad de detección y objeto por defecto según la categoría Leeway', () => {
  assert.ok(cerca(m.sarPOD(1), 0.632, 0.001)); assert.ok(cerca(m.sarPOD(0.5), 0.393, 0.001));
  assert.equal(m.sarObjetoBusqueda('PIW-1', 'buque'), 'piw'); assert.equal(m.sarObjetoBusqueda('LIFE-RAFT-DB-12', 'buque'), 'balsa6'); assert.equal(m.sarObjetoBusqueda('LIFE-RAFT-DB-12', 'helo'), 'balsa8');
  assert.equal(m.sarObjetoBusqueda('FISHING-VESSEL-1', 'avion'), 'bote10'); assert.equal(m.sarObjetoBusqueda('SKIFF-1', 'helo'), 'bote5');
});

test('la ficha de Caso SAR incorpora el plan de búsqueda', () => {
  const caso = fs.readFileSync(path.join(__dirname, '..', 'build', 'caso_sar.js'), 'utf8'), idx = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'construir_index.py'), 'utf8');
  assert.match(caso, /bloqueBusqueda\(/); assert.match(idx, /busqueda_sar\.js/);
});
