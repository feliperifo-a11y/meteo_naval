// Plan de búsqueda SAR: espaciamiento entre trayectorias, patrones de búsqueda y probabilidad de detección.
// Tablas del Manual IAMSAR, vol. III, sección 3 («Planning and conducting the search»): espaciamiento recomendado para
// buques mercantes (Su, en millas náuticas, según la visibilidad meteorológica), anchos de barrido para helicópteros y
// aviones, y factor de corrección por condiciones de tiempo (fw). Valores contrastados con una copia del manual
// (Doc 9731, págs. 3-18 a 3-20); antes de un uso operativo deben confirmarse con la edición vigente.
// Probabilidad de detección: POD = 1 − e^(−C), con C = W / S (curva de búsqueda aleatoria de Koopman, la más conservadora).
const SAR_BARRIDO = {
  buque: { nombre: 'Buque o embarcación', vel: 10, vis: [3, 5, 10, 15, 20], objetos: {
    piw: ['Persona en el agua', [0.4, 0.5, 0.6, 0.7, 0.7]], balsa4: ['Balsa de 4 personas', [2.3, 3.2, 4.2, 4.9, 5.5]], balsa6: ['Balsa de 6 personas', [2.5, 3.6, 5.0, 6.2, 6.9]],
    balsa15: ['Balsa de 15 personas', [2.6, 4.0, 5.1, 6.4, 7.3]], balsa25: ['Balsa de 25 personas', [2.7, 4.2, 5.2, 6.5, 7.5]], bote5: ['Bote de menos de 5 m', [1.1, 1.4, 1.9, 2.1, 2.3]],
    bote7: ['Bote de 7 m', [2.0, 2.9, 4.3, 5.2, 5.8]], bote12: ['Embarcación de 12 m', [2.8, 4.5, 7.6, 9.4, 11.6]], bote24: ['Embarcación de 24 m', [3.2, 5.6, 10.7, 14.7, 18.1]] } },
  helo: { nombre: 'Helicóptero', vel: 90, vis: [1, 5, 20], objetos: {
    piw: ['Persona en el agua', [0.0, 0.1, 0.1]], balsa4: ['Balsa de 4 personas', [0.5, 1.7, 2.9]], balsa8: ['Balsa de 8 personas', [0.5, 2.1, 3.8]], balsa15: ['Balsa de 15 personas', [0.6, 2.4, 4.5]],
    balsa25: ['Balsa de 25 personas', [0.6, 2.8, 5.7]], bote5: ['Bote de menos de 5 m', [0.5, 1.6, 2.5]], bote6: ['Bote de 6 m', [0.7, 3.0, 5.9]], bote10: ['Embarcación de 10 m', [0.7, 3.9, 9.1]], bote24: ['Embarcación de 24 m', [0.8, 5.7, 18.5]] } },
  avion: { nombre: 'Avión', vel: 150, vis: [1, 5, 20], objetos: {
    piw: ['Persona en el agua', [0.0, 0.1, 0.1]], balsa4: ['Balsa de 4 personas', [0.3, 1.3, 2.3]], balsa8: ['Balsa de 8 personas', [0.4, 1.7, 3.0]], balsa15: ['Balsa de 15 personas', [0.4, 2.0, 3.7]],
    balsa25: ['Balsa de 25 personas', [0.4, 2.3, 4.7]], bote5: ['Bote de menos de 5 m', [0.4, 1.3, 2.0]], bote6: ['Bote de 6 m', [0.5, 2.5, 5.0]], bote10: ['Embarcación de 10 m', [0.5, 3.4, 7.8]], bote24: ['Embarcación de 24 m', [0.6, 5.1, 16.7]] } }
};
const SAR_PATRONES = { ps: 'Trayectorias paralelas (PS)', cs: 'Transversales o línea progresiva (CS)', ss: 'Cuadrado expansivo (SS)', vs: 'Sector (VS)' };
// Objeto de búsqueda que corresponde por defecto a cada categoría Leeway de la ficha.
function sarObjetoBusqueda(categoria, medio) {
  const o = SAR_BARRIDO[medio].objetos, k = String(categoria || '');
  const cand = /^PIW|PERSON-POWERED/.test(k) ? ['piw'] : /LIFE-RAFT-DB-18/.test(k) ? ['balsa25', 'balsa15'] : /LIFE-RAFT/.test(k) ? ['balsa6', 'balsa8', 'balsa4'] : /SKIFF|SPORT-BOAT/.test(k) ? ['bote5']
    : /SPORT-FISHER|SAILBOAT/.test(k) ? ['bote7', 'bote6'] : /FISHING-VESSEL-1|FISHING-VESSEL-6/.test(k) ? ['bote12', 'bote10'] : /COASTAL-FREIGHTER/.test(k) ? ['bote24'] : ['piw'];
  return cand.find(x => o[x]) || Object.keys(o)[0];
}
// Espaciamiento o ancho de barrido sin corregir (mn) para la visibilidad dada: interpolación lineal entre las columnas de la tabla.
function sarAnchoBarrido(medio, objeto, visMn) {
  const t = SAR_BARRIDO[medio]; if (!t || !t.objetos[objeto]) return null;
  const v = t.vis, w = t.objetos[objeto][1], x = Math.max(v[0], Math.min(v[v.length - 1], visMn));
  for (let i = 1; i < v.length; i++) if (x <= v[i]) return +(w[i - 1] + (w[i] - w[i - 1]) * (x - v[i - 1]) / (v[i] - v[i - 1])).toFixed(3);
  return w[w.length - 1];
}
// Factor de corrección por tiempo: se aplica la peor condición entre el viento y la altura de ola.
function sarFactorTiempo(objeto, vientoKt, olaM) {
  const nivel = (vientoKt > 25 || olaM > 1.5) ? 2 : (vientoKt > 15 || olaM > 1) ? 1 : 0;
  return { nivel, nombre: ['ligeras', 'moderadas', 'fuertes'][nivel], fw: (objeto === 'piw' ? [1, 0.5, 0.25] : [1, 0.9, 0.6])[nivel] };
}
const sarPOD = c => 1 - Math.exp(-c);

// Patrón de búsqueda sobre un área rectangular. area = { centro: [lat, lon], largo, ancho (mn), rumbo (° del eje mayor) }.
// o = { tipo, S (mn), inicio: [lat, lon] de referencia para elegir el punto de inicio, vientoDe (° de donde viene),
//       dato: [lat, lon] (centro de los patrones SS y VS), radio (mn, sector), maxMn (distancia que alcanza a recorrerse) }.
function sarPatronBusqueda(area, o) {
  const rad = Math.PI / 180, la0 = area.centro[0], lo0 = area.centro[1], kx = 60 * Math.cos(la0 * rad);
  const aLL = (x, y) => [la0 + y / 60, lo0 + x / kx], aXY = ll => [(ll[1] - lo0) * kx, (ll[0] - la0) * 60];
  const r = area.rumbo * rad, u = [Math.sin(r), Math.cos(r)], v = [Math.cos(r), -Math.sin(r)];   // ejes mayor y menor
  const maxMn = o.maxMn > 0 ? o.maxMn : Infinity, S = o.S;
  const largoTray = p => { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return d; };
  // Recorta la trayectoria a la distancia disponible.
  const recortar = p => { const out = [p[0]]; let d = 0; for (let i = 1; i < p.length; i++) { const t = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (d + t > maxMn) { const f = (maxMn - d) / t; out.push([p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f]); return out; } out.push(p[i]); d += t; } return out; };
  const rumboDe = (a, b) => (Math.atan2(b[0] - a[0], b[1] - a[1]) / rad + 360) % 360;
  if (o.tipo === 'ps' || o.tipo === 'cs') {
    // PS: tramos paralelos al lado mayor; CS: paralelos al lado menor. El primer tramo va a medio espaciamiento del borde.
    const [e1, e2, L1, L2] = o.tipo === 'ps' ? [u, v, area.largo, area.ancho] : [v, u, area.ancho, area.largo];
    const n = Math.max(1, Math.ceil(L2 / S - 1e-9)), Se = L2 / n, medio = Math.max(0, L1 / 2 - Se / 2), ini = o.inicio ? aXY(o.inicio) : [0, 0];
    let mejor = null;
    for (const sp of [1, -1]) for (const sq of [1, -1]) {
      const pts = []; for (let k = 0; k < n; k++) { const q = sq * (-L2 / 2 + Se * (k + 0.5)), a = sp * (k % 2 ? 1 : -1) * medio, b = -a;
        pts.push([e1[0] * a + e2[0] * q, e1[1] * a + e2[1] * q], [e1[0] * b + e2[0] * q, e1[1] * b + e2[1] * q]); }
      const d = Math.hypot(pts[0][0] - ini[0], pts[0][1] - ini[1]); if (!mejor || d < mejor.d) mejor = { d, pts, sq };
    }
    const total = largoTray(mejor.pts), pts = recortar(mejor.pts), hecho = largoTray(pts), tramos = hecho >= total - 1e-9 ? n : Math.min(n, hecho / (2 * medio + Se));
    const f = Math.min(1, tramos / n), sq = mejor.sq;
    // Franja cubierta: desde el borde de inicio, la fracción de tramos completados.
    const dentro = ll => { const [x, y] = aXY(ll), p = x * e1[0] + y * e1[1], q = sq * (x * e2[0] + y * e2[1]); return Math.abs(p) <= L1 / 2 && q >= -L2 / 2 && q <= -L2 / 2 + L2 * f; };
    return { tipo: o.tipo, pts: pts.map(p => aLL(p[0], p[1])), todo: mejor.pts.map(p => aLL(p[0], p[1])), n, S: Se, tramoMn: 2 * medio, rumbos: [rumboDe(mejor.pts[0], mejor.pts[1]), (rumboDe(mejor.pts[0], mejor.pts[1]) + 180) % 360], totalMn: total, hechoMn: hecho, fraccion: f, areaMn2: area.largo * area.ancho, cubiertoMn2: area.largo * area.ancho * f, dentro };
  }
  const c0 = aXY(o.dato || area.centro);
  if (o.tipo === 'ss') {
    // Cuadrado expansivo: parte en el dátum, primer tramo contra el viento, virajes de 90° a estribor, tramos S, S, 2S, 2S, 3S…
    const h0 = (o.vientoDe == null ? area.rumbo : o.vientoDe) * rad, lim = Math.max(area.largo, area.ancho) / 2 + S, full = [c0.slice()]; let p = c0.slice(), k = 0;
    while (Math.ceil((k + 1) / 2) * S / 2 <= lim && k < 400) { k++; const h = h0 + (k - 1) * Math.PI / 2, d = Math.ceil(k / 2) * S; p = [p[0] + Math.sin(h) * d, p[1] + Math.cos(h) * d]; full.push(p.slice()); }
    const total = largoTray(full), pts = recortar(full), hecho = largoTray(pts); let kh = 0, ac = 0; for (let i = 1; i <= k; i++) { ac += Math.ceil(i / 2) * S; if (ac <= hecho + 1e-9) kh = i; }
    const semi = S * (Math.ceil(kh / 2) + 1) / 2, ch = Math.cos(h0), sh = Math.sin(h0);
    const dentro = ll => { const [x, y] = aXY(ll), dx = x - c0[0], dy = y - c0[1]; return Math.abs(dx * sh + dy * ch) <= semi && Math.abs(dx * ch - dy * sh) <= semi; };
    return { tipo: 'ss', pts: pts.map(q => aLL(q[0], q[1])), todo: full.map(q => aLL(q[0], q[1])), n: kh, nTotal: k, S, rumbos: [(h0 / rad + 360) % 360], totalMn: total, hechoMn: hecho, fraccion: Math.min(1, hecho / total), cubiertoMn2: (2 * semi) ** 2, semiMn: semi, dentro };
  }
  // Sector: radio R, virajes de 120° a estribor; tramos R, R, 2R, R, 2R, R, R (9 R en total) y vuelve al dátum.
  const R = o.radio, h0 = (o.vientoDe == null ? area.rumbo : (o.vientoDe + 180) % 360) * rad, full = [c0.slice()]; let p = c0.slice();
  [1, 1, 2, 1, 2, 1, 1].forEach((m, i) => { const h = h0 + i * 2 * Math.PI / 3; p = [p[0] + Math.sin(h) * m * R, p[1] + Math.cos(h) * m * R]; full.push(p.slice()); });
  const total = largoTray(full), pts = recortar(full), hecho = largoTray(pts);
  const dentro = ll => { const [x, y] = aXY(ll); return Math.hypot(x - c0[0], y - c0[1]) <= R; };
  return { tipo: 'vs', pts: pts.map(q => aLL(q[0], q[1])), todo: full.map(q => aLL(q[0], q[1])), n: 7, radio: R, rumbos: [(h0 / rad + 360) % 360], totalMn: total, hechoMn: hecho, fraccion: Math.min(1, hecho / total), cubiertoMn2: Math.PI * R * R, dentro };
}
// Cobertura media de un patrón: esfuerzo (ancho de barrido × distancia recorrida) dividido por el área barrida.
// En los patrones de tramos paralelos equivale a W / S; permite dar una probabilidad de detección también al sector.
function sarCoberturaMedia(pat, W) { return pat.cubiertoMn2 > 0 ? W * pat.hechoMn / pat.cubiertoMn2 : 0; }
// Reasignación tras búsquedas sin resultado (actualización bayesiana): cada partícula que estaba dentro de lo barrido a la
// hora de la búsqueda conserva solo la fracción (1 − POD) de su peso; el peso acompaña a la partícula en las horas siguientes.
// busquedas: [{ t (hora, s Unix), area, o (opciones del patrón), pod }]. Devuelve un peso por partícula.
function sarPesosBusquedas(sim, busquedas) {
  const w = new Float32Array(sim.n).fill(1);
  for (const q of busquedas || []) {
    let k = 0, dm = Infinity; sim.tiempos.forEach((t, i) => { const d = Math.abs(t - q.t); if (d < dm) { dm = d; k = i; } });
    const dentro = sarPatronBusqueda(q.area, q.o).dentro, b = k * sim.n, f = 1 - Math.max(0, Math.min(1, q.pod));
    for (let i = 0; i < sim.n; i++) if (sim.estado[b + i] && dentro([sim.lat[b + i], sim.lon[b + i]])) w[i] *= f;
  }
  return w;
}
if (typeof module !== 'undefined') module.exports = { SAR_BARRIDO, SAR_PATRONES, sarObjetoBusqueda, sarAnchoBarrido, sarFactorTiempo, sarPOD, sarPatronBusqueda, sarCoberturaMedia, sarPesosBusquedas };
