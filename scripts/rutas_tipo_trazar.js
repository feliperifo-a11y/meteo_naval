// Trazado fuera de línea de las rutas tipo del sur con la costa GSHHG de resolución completa
const fs = require('fs');
let src = fs.readFileSync(__dirname + '/../build/ruta_mar.js', 'utf8');
const rep = (a, b) => { if (!src.includes(a)) throw new Error('falta ' + a); src = src.replace(a, b); };
rep('Math.max(0.6, 0.35 * Math.max(sLat, sLon * cLat))', 'Math.max(0.2, 0.3 * Math.max(sLat, sLon * cLat))');
rep('let res = Math.min(3, Math.max(0.25, Math.sqrt(area / 1.2e6)));', 'let res = Math.min(3, Math.max(RESMIN, Math.sqrt(area / 3e6)));');
rep('if (margen) res = Math.max(Math.sqrt(area / 2e6), Math.min(res, Math.max(0.25, margen / 3)));', 'if (margen) res = Math.max(Math.sqrt(area / 3e6), Math.min(res, Math.max(RESMIN, margen / 3)));');
rep('res = Math.max(0.2, res / 2)', 'res = Math.max(RESMIN / 2, res / 2)');
rep('if (G.nx * G.ny > 4e6) break;', 'if (G.nx * G.ny > 1.4e7) break;');
global.RESMIN = 0.06;
eval(src + ';global.F={rutaPorMar,rutaAlMar,rutaEnTierra,rutaCruzaTierra,rutaMn,rutaMarAnillos}');
// costa_sur.json: anillos [lat, lon] de GSHHG resolución completa (GSHHS_f_L1) recortados a 40,5–56,5° S; no se incluye en el repositorio
const rings = JSON.parse(fs.readFileSync(process.env.COSTA_SUR || __dirname + '/costa/costa_sur.json'));
F.rutaMarAnillos.c = rings.map(r => { let a = 90, b = -90, cc = 180, d = -180; for (const [y, x] of r) { if (y < a) a = y; if (y > b) b = y; if (x < cc) cc = x; if (x > d) d = x; } return { r, a, b, cc, d }; });
const RUTAS = JSON.parse(fs.readFileSync(process.argv[2]));
const out = {};
for (const [id, R] of Object.entries(RUTAS)) {
  if (process.argv[3] && !id.includes(process.argv[3])) continue;
  const via = R.via.map(v => ({ n: v[0], p0: [v[1], v[2]], p: F.rutaAlMar([v[1], v[2]]), m: v[3] }));
  via.forEach(v => { if (F.rutaMn(v.p0, v.p) > 0.01) console.log(`  [${id}] "${v.n}" estaba en tierra → movido ${F.rutaMn(v.p0, v.p).toFixed(2)} mn`); });
  let tz = [via[0].p], total = 0; const tramos = [];
  for (let i = 0; i < via.length - 1; i++) {
    const t = Date.now(), mg = via[i + 1].m != null ? via[i + 1].m : R.margen;
    const c = F.rutaPorMar(via[i].p, via[i + 1].p, mg);
    if (!c) { console.log(`  [${id}] SIN PASO ${via[i].n} → ${via[i + 1].n}`); tz.push(via[i + 1].p); continue; }
    const d = c.slice(1).reduce((s, p, k) => s + F.rutaMn(c[k], p), 0), recta = F.rutaMn(via[i].p, via[i + 1].p);
    total += d; tramos.push({ de: via[i].n, a: via[i + 1].n, mn: +d.toFixed(1) });
    console.log(`  [${id}] ${via[i].n} → ${via[i + 1].n}: ${d.toFixed(1)} mn (recta ${recta.toFixed(1)}) ${c.length} pts ${Date.now() - t} ms${d > recta * 1.6 + 3 ? '  ⚠ rodeo' : ''}`);
    tz.push(...c.slice(1));
  }
  console.log(`[${id}] ${R.nombre}: ${total.toFixed(0)} mn, ${tz.length} puntos`);
  out[id] = { ...R, via: via.map(v => [v.n, v.p[0], v.p[1]]), traza: tz, mn: +total.toFixed(1), tramos };
}
fs.writeFileSync(process.argv[2].replace('.json', '_out.json'), JSON.stringify(out));
