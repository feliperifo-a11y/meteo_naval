// Deriva SAR por ensemble: el motor (build/deriva_sar.js) se contrasta con resultados de OpenDrift 1.14 (modelo Leeway)
// obtenidos con viento y corriente idénticos (tests/fixtures/deriva_opendrift.json; 6.000 partículas, 24 h, paso de 15 min).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const m = require(path.join(__dirname, '..', 'build', 'deriva_sar.js'));
const ref = require('./fixtures/deriva_opendrift.json');
const t0 = Date.UTC(2017, 0, 1) / 1000, H = 24, ts = []; for (let t = t0; t <= t0 + H * 3600; t += 900) ts.push(t);
const campo = (fu, fv) => { const u = new Float32Array(ts.length * 4), v = new Float32Array(ts.length * 4); ts.forEach((t, l) => { for (let p = 0; p < 4; p++) { u[l * 4 + p] = fu(t); v[l * 4 + p] = fv(t); } }); return { lats: [-40, -33], lons: [-78, -70], ts, u, v, nm: 1 }; };
const media = a => a.reduce((p, q) => p + q, 0) / a.length, desv = a => { const mu = media(a); return Math.sqrt(media(a.map(v => (v - mu) ** 2))); };
const metros = (s, k) => { const b = k * s.n, x = [], y = []; for (let i = 0; i < s.n; i++) { x.push((s.lon[b + i] + 73.5) * 111320 * Math.cos(-36.5 * Math.PI / 180)); y.push((s.lat[b + i] + 36.5) * 111320); } return { x, y }; };

test('el abatimiento Leeway reproduce a OpenDrift con viento y corriente idénticos', () => {
  for (const k of Object.keys(ref)) {
    const [caso, obj] = k.split('|'), r = ref[k];
    const viento = caso === 'const' ? campo(() => 8, () => -3) : campo(t => 10 * Math.sin((t - t0) / 43200 * Math.PI), () => 5);
    const corriente = caso === 'const' ? campo(() => 0.2, () => 0.1) : campo(() => -0.1, () => 0.15);
    const s = m.sarDerivaSimular({ lat: -36.5, lon: -73.5, t0, t1: t0 + H * 3600, n: 6000, objeto: obj, viento, corriente, sigCorr: 0, sigViento: 0, K: 0, semilla: 99 });
    const { x, y } = metros(s, s.nOut - 1), dist = Math.hypot(r.mx, r.my);
    assert.ok(Math.hypot(media(x) - r.mx, media(y) - r.my) / dist < 0.03, `${k}: deriva media fuera del 3 %`);
    assert.ok(Math.abs(desv(x) / r.sx - 1) < 0.08 && Math.abs(desv(y) / r.sy - 1) < 0.08, `${k}: dispersión fuera del 8 %`);
  }
});

test('la tabla de objetos coincide con la de OpenDrift y cada objeto de la ficha tiene categoría', () => {
  assert.deepEqual(m.SAR_LEEWAY['PIW-1'].c, [0.96, 0, 12, 0.54, 0, 9.4, -0.54, 0, 9.4]);
  for (const o of Object.values(m.SAR_LEEWAY)) assert.equal(o.c.length, 9);
  for (const k of Object.values(m.SAR_LEEWAY_POR_OBJETO)) assert.ok(m.SAR_LEEWAY[k], k);
});

test('la simulación es repetible con la misma semilla y la incertidumbre amplía la nube', () => {
  const base = { lat: -36.5, lon: -73.5, t0, t1: t0 + 12 * 3600, n: 800, objeto: 'PIW-1', viento: campo(() => 6, () => 2), corriente: campo(() => 0.1, () => 0), semilla: 5 };
  const a = m.sarDerivaSimular(base), b = m.sarDerivaSimular(base);
  assert.deepEqual(Array.from(a.lat.slice(-10)), Array.from(b.lat.slice(-10)));
  const sin = m.sarDerivaSimular({ ...base, sigCorr: 0, sigViento: 0, K: 0 }), con = m.sarDerivaSimular({ ...base, sigmaPos: 2000 });
  assert.ok(m.sarDerivaResumen(con, con.nOut - 1).area90 > m.sarDerivaResumen(sin, sin.nOut - 1).area90);
});

test('las partículas varan en la costa y no entran a tierra', () => {
  // Costa recta en 73,3° W: todo lo que está al este es tierra. Viento del oeste.
  const anillo = [[-40, -73.3], [-33, -73.3], [-33, -70], [-40, -70]], esTierra = m.sarMascaraTierra([anillo], [-37, -74, -36, -73], 400, 400);
  assert.equal(esTierra(-36.5, -73.2), true); assert.equal(esTierra(-36.5, -73.4), false);
  const s = m.sarDerivaSimular({ lat: -36.5, lon: -73.5, t0, t1: t0 + 24 * 3600, n: 600, objeto: 'LIFE-RAFT-NB-1', viento: campo(() => 12, () => 0), corriente: campo(() => 0.1, () => 0), esTierra, semilla: 3 });
  const r = m.sarDerivaResumen(s, s.nOut - 1, esTierra), b = (s.nOut - 1) * s.n;
  assert.ok(r.varadas > 0.9 * s.n, 'casi todas deben varar');
  for (let i = 0; i < s.n; i++) assert.ok(s.lon[b + i] <= -73.3 + 1e-3);
});

test('la incertidumbre de la hora retrasa el inicio de parte de las partículas', () => {
  const s = m.sarDerivaSimular({ lat: -36.5, lon: -73.5, t0, t1: t0 + 6 * 3600, n: 400, objeto: 'PIW-1', viento: campo(() => 6, () => 2), corriente: campo(() => 0.1, () => 0), errT: 2 * 3600, semilla: 8 });
  const r0 = m.sarDerivaResumen(s, 0), r3 = m.sarDerivaResumen(s, 3);
  assert.ok(r0.sinIniciar > 100 && r0.sinIniciar < 300); assert.equal(r3.sinIniciar, 0);
});

test('el resumen entrega zonas del 50 % y 90 % y un rectángulo que contiene la zona del 90 %', () => {
  const s = m.sarDerivaSimular({ lat: -36.5, lon: -73.5, t0, t1: t0 + 24 * 3600, n: 2000, objeto: 'SKIFF-1', viento: campo(() => 8, () => -3), corriente: campo(() => 0.2, () => 0.1), sigmaPos: 1500, semilla: 11 });
  const r = m.sarDerivaResumen(s, s.nOut - 1);
  assert.ok(r.area50 > 0 && r.area50 < r.area90 && r.area90 <= r.rect.area * 1.05);
  assert.ok(r.rect.largo >= r.rect.ancho && r.rect.esquinas.length === 4 && r.rect.rumbo >= 0 && r.rect.rumbo < 180);
  // Fracción de partículas dentro del rectángulo: al menos 85 %.
  const [A, B, , D] = r.rect.esquinas, kx = Math.cos(-36.5 * Math.PI / 180), ab = [(B[1] - A[1]) * kx, B[0] - A[0]], ad = [(D[1] - A[1]) * kx, D[0] - A[0]], b = (s.nOut - 1) * s.n; let dentro = 0;
  for (let i = 0; i < s.n; i++) { const p = [(s.lon[b + i] - A[1]) * kx, s.lat[b + i] - A[0]], u = (p[0] * ab[0] + p[1] * ab[1]) / (ab[0] ** 2 + ab[1] ** 2), v = (p[0] * ad[0] + p[1] * ad[1]) / (ad[0] ** 2 + ad[1] ** 2); if (u >= 0 && u <= 1 && v >= 0 && v <= 1) dentro++; }
  assert.ok(dentro / s.n > 0.85, `dentro ${dentro / s.n}`);
});

test('las respuestas de Open-Meteo se convierten en campos y en anomalías del ensemble', () => {
  const time = [0, 3600, 7200], lats = [-37, -36], lons = [-74, -73];
  const viento = m.sarCampoOpenMeteo(lats.flatMap(() => lons.map(() => ({ hourly: { time, wind_speed_10m: [10, 10, 10], wind_direction_10m: [270, 270, 270] } }))), lats, lons, 'viento');
  const sal = [0, 0]; m.sarCampoInterp(viento, 0, -36.5, -73.5, 1800, sal);
  assert.ok(Math.abs(sal[0] - 10) < 1e-4 && Math.abs(sal[1]) < 1e-4, 'viento del oeste sopla hacia el este');
  // Corriente: un punto en tierra (sin dato) toma el valor del vecino; 3,6 km/h hacia el norte = 1 m/s.
  const rc = lats.flatMap(() => lons.map(() => ({ hourly: { time, ocean_current_velocity: [3.6, 3.6, 3.6], ocean_current_direction: [0, 0, 0] } })));
  rc[3] = { hourly: { time, ocean_current_velocity: [null, null, null], ocean_current_direction: [null, null, null] } };
  const corr = m.sarCampoOpenMeteo(rc, lats, lons, 'corriente'); m.sarCampoInterp(corr, 0, -36, -73, 0, sal);
  assert.equal(corr.puntosSinDato, 1); assert.ok(Math.abs(sal[1] - 1) < 1e-4 && Math.abs(sal[0]) < 1e-4);
  const h = { time }; for (let k = 0; k <= 10; k++) { const s = k ? '_member' + String(k).padStart(2, '0') : ''; h['wind_speed_10m' + s] = [5 + k, 5 + k, 5 + k]; h['wind_direction_10m' + s] = [180, 180, 180]; }
  const ens = m.sarEnsembleOpenMeteo(lats.flatMap(() => lons.map(() => ({ hourly: h }))), lats, lons);
  assert.equal(ens.nm, 11); m.sarCampoInterp(ens, 0, -36.5, -73.5, 0, sal); assert.ok(Math.abs(sal[1] + 5) < 1e-4, 'el control queda 5 m/s bajo la media');
  let suma = 0; for (let k = 0; k < 11; k++) { m.sarCampoInterp(ens, k, -36.5, -73.5, 0, sal); suma += sal[1]; } assert.ok(Math.abs(suma) < 1e-3, 'las anomalías suman cero');
  assert.equal(m.sarEnsembleOpenMeteo([{ hourly: { time, wind_speed_10m: [1, 1, 1], wind_direction_10m: [0, 0, 0] } }], [0], [0]), null);
});

test('la ficha de Caso SAR incorpora el área de búsqueda y la página incluye el motor', () => {
  const caso = fs.readFileSync(path.join(__dirname, '..', 'build', 'caso_sar.js'), 'utf8'), idx = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'construir_index.py'), 'utf8');
  assert.match(caso, /bloqueEnsemble\(lat, lon, deriva\)/); assert.match(caso, /ensemble-api\.open-meteo\.com/); assert.match(idx, /deriva_sar\.js/);
});
