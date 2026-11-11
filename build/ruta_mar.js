// ============================ Ruta por mar: evita la tierra (módulo Ruta de navegación) ============================
// Usa la costa incorporada (LAND). Un punto marcado sobre tierra se lleva a la orilla, un poco mar adentro. Un tramo que cruza
// tierra se reemplaza por el camino más corto por mar: la zona del tramo se divide en celdas de mar y tierra, se busca el camino
// con A* (las celdas junto a la costa cuestan un poco más, para no rozarla) y luego se endereza el camino uniendo los puntos
// que se ven entre sí sin cruzar tierra. Sirve para canales y estrechos (por ejemplo, el estrecho de Magallanes) en la medida
// en que la costa incorporada los tenga abiertos; no considera profundidades ni dispositivos de tráfico.
const RUTA_RAD = Math.PI / 180;
function rutaMarAnillos() {
  if (rutaMarAnillos.c) return rutaMarAnillos.c;
  const out = [];
  try {
    for (const c of LAND) for (const poly of c.p) {
      const r = decodePolyline6(poly[0]); if (r.length < 3) continue;
      let a = 90, b = -90, cc = 180, d = -180;
      for (const [y, x] of r) { if (y < a) a = y; if (y > b) b = y; if (x < cc) cc = x; if (x > d) d = x; }
      out.push({ r, a, b, cc, d });
    }
  } catch (e) { /* sin costa incorporada */ }
  return (rutaMarAnillos.c = out);
}
function rutaEnTierra(la, lo) {
  for (const { r, a, b, cc, d } of rutaMarAnillos()) {
    if (la < a || la > b || lo < cc || lo > d) continue;
    let dentro = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ai, oi] = r[i], [aj, oj] = r[j];
      if ((ai > la) !== (aj > la) && lo < (oj - oi) * (la - ai) / (aj - ai) + oi) dentro = !dentro;
    }
    if (dentro) return true;
  }
  return false;
}
// Distancia aproximada en mn (plano local), suficiente para tramos cortos
function rutaMn(p, q) { const c = Math.cos((p[0] + q[0]) / 2 * RUTA_RAD); return Math.hypot((q[0] - p[0]) * 60, (q[1] - p[1]) * 60 * c); }
function rutaCruzaTierra(p, q, paso = 0.5) {
  const n = Math.max(2, Math.ceil(rutaMn(p, q) / paso));
  for (let k = 1; k < n; k++) { const f = k / n; if (rutaEnTierra(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f)) return true; }
  return false;
}
// Punto marcado sobre tierra: se lleva al punto de costa más cercano y luego un poco mar adentro.
function rutaAlMar(p) {
  if (!rutaEnTierra(p[0], p[1])) return p;
  const c = Math.cos(p[0] * RUTA_RAD); let mejor = null;
  for (const { r, a, b, cc, d } of rutaMarAnillos()) {
    if (p[0] < a - 1 || p[0] > b + 1 || p[1] < cc - 1.5 || p[1] > d + 1.5) continue;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const ax = (r[j][1] - p[1]) * c, ay = r[j][0] - p[0], bx = (r[i][1] - p[1]) * c, by = r[i][0] - p[0];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const x = ax + t * dx, y = ay + t * dy, d2 = x * x + y * y;
      if (!mejor || d2 < mejor.d2) mejor = { d2, x, y, nx: -dy, ny: dx };
    }
  }
  if (!mejor) return p;
  // dirección mar adentro: desde el punto marcado hacia la costa (o la normal del segmento si el punto ya está en la orilla)
  let ux = mejor.x, uy = mejor.y, l = Math.hypot(ux, uy);
  if (l < 1e-6) { ux = mejor.nx; uy = mejor.ny; l = Math.hypot(ux, uy) || 1; }
  ux /= l; uy /= l;
  for (const mn of [0.25, 0.5, 1, 2]) {
    for (const s of [1, -1]) {
      const q = [+(p[0] + mejor.y + s * uy * mn / 60).toFixed(4), +(p[1] + (mejor.x + s * ux * mn / 60) / c).toFixed(4)];
      if (!rutaEnTierra(q[0], q[1])) return q;
    }
  }
  return p;
}
// Grilla de mar (0) y tierra (1) en una caja, con celdas de res mn
function rutaGrilla(la1, la2, lo1, lo2, res) {
  const dlat = res / 60, dlon = res / 60 / Math.cos((la1 + la2) / 2 * RUTA_RAD);
  const ny = Math.ceil((la2 - la1) / dlat), nx = Math.ceil((lo2 - lo1) / dlon), T = new Uint8Array(nx * ny);
  for (const g of rutaMarAnillos()) {
    if (g.b < la1 || g.a > la2 || g.d < lo1 || g.cc > lo2) continue;
    const r = g.r, filas = new Map();
    for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const [y1, x1] = r[k], [y2, x2] = r[i]; if (y1 === y2) continue;
      const ymin = Math.min(y1, y2), ymax = Math.max(y1, y2);
      const ja = Math.max(0, Math.ceil((ymin - la1) / dlat - 0.5)), jb = Math.min(ny - 1, Math.floor((ymax - la1) / dlat - 0.5));
      for (let j = ja; j <= jb; j++) {
        const yc = la1 + (j + 0.5) * dlat; if (yc < ymin || yc >= ymax) continue;
        let f = filas.get(j); if (!f) filas.set(j, f = []); f.push(x1 + (yc - y1) * (x2 - x1) / (y2 - y1));
      }
    }
    for (const [j, xs] of filas) {
      xs.sort((p, q) => p - q);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        const ia = Math.max(0, Math.ceil((xs[q] - lo1) / dlon - 0.5)), ib = Math.min(nx - 1, Math.floor((xs[q + 1] - lo1) / dlon - 0.5));
        for (let i = ia; i <= ib; i++) T[j * nx + i] = 1;
      }
    }
  }
  return { T, nx, ny, la1, lo1, dlat, dlon, res };
}
// Distancia (mn) de cada celda a la celda de tierra más cercana (transformada de distancia en dos pasadas)
function rutaDistCosta(G) {
  const { T, nx, ny, res } = G, N = nx * ny, D = new Float32Array(N), SQ = Math.SQRT2, INF = 1e9;
  for (let k = 0; k < N; k++) D[k] = T[k] ? 0 : INF;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let v = D[k]; if (!v) continue;
    if (i > 0) v = Math.min(v, D[k - 1] + 1);
    if (j > 0) { v = Math.min(v, D[k - nx] + 1); if (i > 0) v = Math.min(v, D[k - nx - 1] + SQ); if (i < nx - 1) v = Math.min(v, D[k - nx + 1] + SQ); }
    D[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; let v = D[k]; if (!v) continue;
    if (i < nx - 1) v = Math.min(v, D[k + 1] + 1);
    if (j < ny - 1) { v = Math.min(v, D[k + nx] + 1); if (i < nx - 1) v = Math.min(v, D[k + nx + 1] + SQ); if (i > 0) v = Math.min(v, D[k + nx - 1] + SQ); }
    D[k] = v;
  }
  for (let k = 0; k < N; k++) D[k] = D[k] >= INF ? 9999 : D[k] * res;
  return D;
}
// Camino de menor costo; las celdas a menos de "margen" mn de la costa cuestan más (hasta 6 veces junto a la orilla)
function rutaAstar(G, s, t, margen) {
  const { T, nx, ny } = G, N = nx * ny, SQ = Math.SQRT2, D = G.D;
  const m = margen ? margen + G.res : G.res * 1.5;   // la distancia de la grilla es entre centros de celda: se suma una celda
  const pen = k => { const d = D[k]; return d >= m ? 1 : 1 + 8 * (1 - d / m); };
  const g = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), cerr = new Uint8Array(N);
  const tx = t % nx, ty = (t / nx) | 0;
  const h = k => { const dx = Math.abs(k % nx - tx), dy = Math.abs(((k / nx) | 0) - ty); return dx + dy + (SQ - 2) * Math.min(dx, dy); };
  // montículo binario de (f, celda)
  let hf = new Float64Array(1024), hk = new Int32Array(1024), n = 0;
  const push = (f, k) => {
    if (n === hf.length) { const a = new Float64Array(n * 2), b = new Int32Array(n * 2); a.set(hf); b.set(hk); hf = a; hk = b; }
    let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hk[i] = hk[p]; i = p; } hf[i] = f; hk[i] = k;
  };
  const pop = () => {
    const k = hk[0], f = hf[--n], kk = hk[n]; let i = 0;
    while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hf[c + 1] < hf[c]) c++; if (hf[c] >= f) break; hf[i] = hf[c]; hk[i] = hk[c]; i = c; }
    hf[i] = f; hk[i] = kk; return k;
  };
  g[s] = 0; push(h(s), s);
  const V = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ], [1, -1, SQ], [-1, 1, SQ], [-1, -1, SQ]];
  while (n) {
    const k = pop(); if (cerr[k]) continue; cerr[k] = 1;
    if (k === t) break;
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj, c] of V) {
      const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
      const q = y * nx + x; if (T[q] || cerr[q]) continue;
      if (di && dj && (T[j * nx + x] || T[y * nx + i])) continue;   // sin cortar esquinas de tierra
      const v = g[k] + c * pen(q);
      if (v < g[q]) { g[q] = v; prev[q] = k; push(v + h(q), q); }
    }
  }
  if (!cerr[t]) return null;
  const camino = []; for (let k = t; k !== -1; k = prev[k]) camino.push(k);
  return camino.reverse();
}
// Celda de mar más cercana (búsqueda en anchura)
function rutaMarCercano(G, k0) {
  if (!G.T[k0]) return k0;
  const { T, nx, ny } = G, vis = new Uint8Array(nx * ny), cola = [k0]; vis[k0] = 1;
  for (let h = 0; h < cola.length; h++) {
    const k = cola[h], i = k % nx, j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = i + di, y = j + dj; if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
      const q = y * nx + x; if (vis[q]) continue; if (!T[q]) return q; vis[q] = 1; cola.push(q);
    }
  }
  return -1;
}
// ¿El segmento p→q cruza celdas de tierra de la grilla? (fuera de la grilla se considera mar)
// req(la, lo): despeje mínimo exigido en ese punto (mn); 0 = solo no cruzar tierra
function rutaVeGrilla(G, p, q, req) {
  const n = Math.max(2, Math.ceil(rutaMn(p, q) / (G.res * 0.35)));
  for (let k = 0; k <= n; k++) {
    const f = k / n, la = p[0] + (q[0] - p[0]) * f, lo = p[1] + (q[1] - p[1]) * f;
    const i = Math.floor((lo - G.lo1) / G.dlon), j = Math.floor((la - G.la1) / G.dlat);
    if (i < 0 || j < 0 || i >= G.nx || j >= G.ny) continue;
    const c = j * G.nx + i;
    if (G.T[c]) return false;
    if (req && G.D[c] < req(la, lo) - G.res * 0.05) return false;
  }
  return true;
}
// Tramo a→b por mar, a "margen" mn o más de la costa salvo al acercarse al zarpe o a la recalada.
// Devuelve la lista de puntos (incluye a y b) o null si no hay paso por mar en la costa incorporada.
function rutaPorMar(a, b, margen = 0, prof = 0) {
  const cruza = rutaCruzaTierra(a, b);
  if (!cruza && !margen) return [a, b];
  const cLat = Math.cos((a[0] + b[0]) / 2 * RUTA_RAD);
  const sLat = Math.abs(a[0] - b[0]), sLon = Math.abs(a[1] - b[1]);
  const mLat = Math.max(0.6, 0.35 * Math.max(sLat, sLon * cLat)) + 2 * margen / 60, mLon = mLat / cLat;
  const la1 = Math.min(a[0], b[0]) - mLat, la2 = Math.max(a[0], b[0]) + mLat, lo1 = Math.min(a[1], b[1]) - mLon, lo2 = Math.max(a[1], b[1]) + mLon;
  const area = (la2 - la1) * 60 * (lo2 - lo1) * 60 * cLat;
  // celdas de 0,25 a 3 mn (y no más de un tercio del margen), con un máximo de ~2 millones de celdas
  let res = Math.min(3, Math.max(0.25, Math.sqrt(area / 1.2e6)));
  if (margen) res = Math.max(Math.sqrt(area / 2e6), Math.min(res, Math.max(0.25, margen / 3)));
  // despeje exigido: el margen, reducido cerca del zarpe y de la recalada (para poder entrar y salir del puerto)
  const req = margen ? (la, lo) => Math.min(margen, rutaMn([la, lo], a), rutaMn([la, lo], b)) : null;
  for (let intento = 0; intento < 2; intento++, res = Math.max(0.2, res / 2)) {
    const G = rutaGrilla(la1, la2, lo1, lo2, res);
    if (G.nx * G.ny > 4e6) break;
    G.D = rutaDistCosta(G);
    // sin cruzar tierra y con despeje suficiente en todo el tramo: línea recta
    const reqG = req ? (la, lo) => { const r = req(la, lo); return r > 0 ? r + 0.7 * G.res : 0; } : null;   // corrección por el tamaño de celda
    if (!cruza && rutaVeGrilla(G, a, b, reqG)) return [a, b];
    const celda = p => Math.min(G.ny - 1, Math.max(0, Math.floor((p[0] - la1) / G.dlat))) * G.nx + Math.min(G.nx - 1, Math.max(0, Math.floor((p[1] - lo1) / G.dlon)));
    const s = rutaMarCercano(G, celda(a)), t = rutaMarCercano(G, celda(b));
    if (s < 0 || t < 0) continue;
    const cam = rutaAstar(G, s, t, margen); if (!cam) continue;
    const centro = k => [la1 + (((k / G.nx) | 0) + 0.5) * G.dlat, lo1 + (k % G.nx + 0.5) * G.dlon];
    const P = [a, ...cam.map(centro), b];
    // déficit de despeje del propio camino en cada punto (canales angostos): un atajo puede tener a lo más ese déficit
    const DEF = P.map((q, k) => k === 0 || k === P.length - 1 || !reqG ? 0 : Math.max(0, reqG(q[0], q[1]) - G.D[cam[k - 1]]));
    // enderezar: desde cada punto se avanza mientras el atajo no cruce tierra ni quede más cerca de la costa que el camino
    const out = [a]; let i = 0;
    while (i < P.length - 1) {
      let j = i + 1, def = 0;
      while (j + 1 < P.length) {
        const d = Math.max(def, DEF[j], DEF[j + 1]);
        const rq = reqG ? (la, lo) => reqG(la, lo) - d : null;
        if (!rutaVeGrilla(G, P[i], P[j + 1], rq)) break;
        def = d; j++;
      }
      out.push(P[j]); i = j;
    }
    // revisión fina con la costa real: un tramo que todavía roza tierra se recalcula en una caja más chica (celdas más finas)
    const fin = [a];
    for (let k = 1; k < out.length; k++) {
      const p = fin[fin.length - 1], q = out[k];
      const sub = prof < 2 && rutaCruzaTierra(p, q, 0.25) ? rutaPorMar(p, q, 0, prof + 1) : null;
      if (sub) fin.push(...sub.slice(1)); else fin.push(q);
    }
    return fin.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]);
  }
  return null;
}
