// Deriva SAR por ensemble (método Leeway), para la herramienta Caso SAR.
// Miles de partículas derivan con el viento y la corriente a lo largo de su propia trayectoria. Cada una lleva su propia
// combinación de errores: posición y hora iniciales, coeficientes de abatimiento del objeto, miembro del ensemble de viento
// y error de la corriente. La nube resultante entrega el área de búsqueda probable y su incertidumbre.
// Abatimiento: método Leeway (Allen y Plourde, 1999; Allen, 2005; Breivik y Allen, 2008), con la misma formulación y la misma
// tabla de coeficientes que usa el modelo Leeway de OpenDrift (Dagestad et al., 2018). Columnas de «c»: pendiente a favor del
// viento (%), ordenada (cm/s) y desviación (cm/s); luego lo mismo para la componente transversal a la derecha y a la izquierda.
const SAR_LEEWAY = {
  'PIW-1': { nombre: 'Persona en el agua, estado desconocido', c: [0.96, 0, 12, 0.54, 0, 9.4, -0.54, 0, 9.4] },
  'PIW-2': { nombre: 'Persona en el agua, vertical, con chaleco, consciente', c: [0.48, 0, 8.3, 0.15, 0, 6.7, -0.15, 0, 6.7] },
  'PIW-3': { nombre: 'Persona en el agua, sentada, con chaleco', c: [1.6, -3.98, 2.42, 0.13, 0.33, 2.11, -0.13, -0.33, 2.11] },
  'PIW-4': { nombre: 'Persona en el agua con traje de supervivencia', c: [1.71, 1.12, 3.93, 1.36, -3.3, 1.71, -0.13, -2.65, 1.62] },
  'PIW-6': { nombre: 'Persona en el agua, boca abajo (fallecida)', c: [1.117, 10.2, 3.04, 0.04, 3.9, 4.05, -0.04, -3.9, 4.05] },
  'LIFE-RAFT-NB-1': { nombre: 'Balsa salvavidas sin lastre, general', c: [3.7, 0, 12, 1.98, 0, 9.4, -1.98, 0, 9.4] },
  'LIFE-RAFT-SB-6': { nombre: 'Balsa salvavidas con lastre somero y capota, general', c: [2.68, 0, 12, 1.1, 0, 9.4, -1.1, 0, 9.4] },
  'LIFE-RAFT-DB-10': { nombre: 'Balsa salvavidas con lastre profundo, general', c: [3.52, -2.5, 6.1, 0.62, -3, 3.5, -0.45, -0.2, 3.6] },
  'LIFE-RAFT-DB-12': { nombre: 'Balsa 4 a 14 personas, lastre profundo, sin ancla flotante', c: [3.75, -2.3, 4.4, 0.78, -3.6, 3.6, -0.47, -0.1, 3.9] },
  'LIFE-RAFT-DB-15': { nombre: 'Balsa 4 a 14 personas, lastre profundo, con ancla flotante', c: [1.91, 0.9, 1.6, 0.78, -3.6, 3.6, -0.47, -0.1, 3.9] },
  'LIFE-RAFT-DB-18': { nombre: 'Balsa 15 a 50 personas, lastre profundo, con capota', c: [3.68, -4.96, 5.37, 0.34, -1.85, 2.5, -0.49, 1.58, 2.63] },
  'LIFE-RAFT-DB-21': { nombre: 'Balsa con lastre profundo, volcada', c: [0.88, 0, 2.5, 0.18, 0, 2.4, -0.18, 0, 2.4] },
  'PERSON-POWERED-VESSEL-1': { nombre: 'Kayak de mar con persona', c: [1.16, 11.12, 4.12, 0.41, 0, 4.39, -0.41, 0, 4.39] },
  'PERSON-POWERED-VESSEL-2': { nombre: 'Tabla de surf con persona', c: [1.93, 0, 8.3, 0.51, 0, 6.7, -0.51, 0, 6.7] },
  'PERSON-POWERED-VESSEL-3': { nombre: 'Tabla de windsurf con mástil y vela en el agua', c: [2.25, 5.03, 2.5, 0.69, -1.3, 2.96, -0.69, 1.3, 2.96] },
  'SKIFF-1': { nombre: 'Bote con motor fuera de borda (casco en V modificado)', c: [3.15, 0, 2.2, 1.29, 0, 2.2, -1.29, 0, 2.2] },
  'SKIFF-2': { nombre: 'Bote de casco en V', c: [2.87, 3.98, 3.33, 0.32, -2.93, 2.53, -0.62, 1.03, 3.05] },
  'SKIFF-3': { nombre: 'Bote anegado o volcado', c: [1.65, 0, 3.1, 0.39, 0, 2.9, -0.39, 0, 2.9] },
  'SPORT-BOAT': { nombre: 'Lancha deportiva sin toldo', c: [6.54, 0, 3, 2.19, 0, 2.8, -2.19, 0, 2.8] },
  'SPORT-FISHER': { nombre: 'Lancha de pesca deportiva, consola central', c: [5.55, 0, 3.3, 2.27, 0, 3, -2.27, 0, 3] },
  'FISHING-VESSEL-1': { nombre: 'Pesquero, general', c: [2.47, 0, 12, 2.76, 0, 9.4, -2.76, 0, 9.4] },
  'FISHING-VESSEL-6': { nombre: 'Pesquero de enmalle con carrete a popa', c: [3.72, -0.87, 3.33, 1.41, 2, 3.36, -1.41, -2, 3.36] },
  'COASTAL-FREIGHTER': { nombre: 'Carguero costero', c: [1.87, 0, 8.3, 2.09, 0, 6.7, -2.09, 0, 6.7] },
  'SAILBOAT-1': { nombre: 'Velero monocasco, promedio', c: [4.5, 0, 19.4, 4.95, 0, 18.42, -2.82, 0, 24.95] },
  'SAILBOAT-2': { nombre: 'Velero monocasco desarbolado', c: [3.94, 0, 19.62, 3.98, 0, 12.6788, -0.79, 0, 2.13] },
  'FV-DEBRIS': { nombre: 'Restos de un pesquero', c: [1.97, 0, 8.3, 0.36, 0, 6.7, -0.36, 0, 6.7] },
  'SLDMB': { nombre: 'Boya marcadora de dátum (sin abatimiento)', c: [0, 0, 0, 0, 0, 0, 0, 0, 0] }
};
// Categoría Leeway que corresponde por defecto a cada objeto del cálculo IAMSAR de la ficha.
const SAR_LEEWAY_POR_OBJETO = { piw: 'PIW-1', balsa: 'LIFE-RAFT-NB-1', balsa_lastre: 'LIFE-RAFT-DB-12', balsa_ancla: 'LIFE-RAFT-DB-15', balsa_capota: 'LIFE-RAFT-DB-15', otro: 'PIW-1' };
// Supuestos de incertidumbre (se muestran en la ficha).
const SAR_DERIVA_DEF = { n: 2000, dt: 900, jibe: 0.04, sigViento: 1.5, sigCorr: 0.10, K: 10, salidaCada: 3600 };

// Generador de números aleatorios con semilla (resultados repetibles) y normal estándar.
function sarAzar(semilla) {
  let a = (semilla >>> 0) || 1, guardado = null;
  const u = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const n = () => { if (guardado != null) { const g = guardado; guardado = null; return g; } let x, y, s; do { x = 2 * u() - 1; y = 2 * u() - 1; s = x * x + y * y; } while (s >= 1 || s === 0); const m = Math.sqrt(-2 * Math.log(s) / s); guardado = y * m; return x * m; };
  return { u, n };
}

// Campo en grilla regular (latitudes y longitudes crecientes, tiempos en segundos Unix crecientes).
// Interpolación lineal en el tiempo y bilineal en el espacio; fuera de la grilla se usa el borde.
function sarCampoInterp(c, k, lat, lon, t, sal) {
  const { lats, lons, ts } = c, ny = lats.length, nx = lons.length, nt = ts.length;
  let fy = ny > 1 ? (lat - lats[0]) / (lats[ny - 1] - lats[0]) * (ny - 1) : 0, fx = nx > 1 ? (lon - lons[0]) / (lons[nx - 1] - lons[0]) * (nx - 1) : 0;
  let ft = nt > 1 ? (t - ts[0]) / (ts[nt - 1] - ts[0]) * (nt - 1) : 0;
  let fuera = false;
  if (fy < 0) { fuera = fuera || fy < -0.01; fy = 0; } else if (fy > ny - 1) { fuera = fuera || fy > ny - 0.99; fy = ny - 1; }
  if (fx < 0) { fuera = fuera || fx < -0.01; fx = 0; } else if (fx > nx - 1) { fuera = fuera || fx > nx - 0.99; fx = nx - 1; }
  if (ft < 0) ft = 0; else if (ft > nt - 1) ft = nt - 1;
  const j0 = Math.min(ny - 1, Math.floor(fy)), i0 = Math.min(nx - 1, Math.floor(fx)), l0 = Math.min(nt - 1, Math.floor(ft));
  const j1 = Math.min(ny - 1, j0 + 1), i1 = Math.min(nx - 1, i0 + 1), l1 = Math.min(nt - 1, l0 + 1);
  const wy = fy - j0, wx = fx - i0, wt = ft - l0, np = ny * nx, b = k * nt * np;
  const A = c.u, B = c.v, a0 = b + l0 * np, a1 = b + l1 * np;
  const q = (M, o) => (M[o + j0 * nx + i0] * (1 - wx) + M[o + j0 * nx + i1] * wx) * (1 - wy) + (M[o + j1 * nx + i0] * (1 - wx) + M[o + j1 * nx + i1] * wx) * wy;
  sal[0] = q(A, a0) * (1 - wt) + q(A, a1) * wt; sal[1] = q(B, a0) * (1 - wt) + q(B, a1) * wt;
  return fuera;
}

// Convierte la respuesta de Open-Meteo para una lista de puntos (grilla recorrida por filas, de sur a norte y de oeste a este)
// en un campo. tipo: 'viento' (m/s, dirección de donde viene) o 'corriente' (km/h, dirección hacia donde va).
// Los puntos sin dato (tierra, en la corriente) toman el valor del punto con dato más cercano.
function sarCampoOpenMeteo(resp, lats, lons, tipo) {
  const L = Array.isArray(resp) ? resp : [resp], ny = lats.length, nx = lons.length, np = ny * nx;
  if (L.length !== np || !L[0] || !L[0].hourly) return null;
  const kv = tipo === 'viento' ? 'wind_speed_10m' : 'ocean_current_velocity', kd = tipo === 'viento' ? 'wind_direction_10m' : 'ocean_current_direction';
  const clave = (h, k) => h[k] || h[Object.keys(h).find(x => x.startsWith(k) && !/member/.test(x))];
  const ts = L[0].hourly.time.map(Number), nt = ts.length, u = new Float32Array(nt * np), v = new Float32Array(nt * np);
  let nulos = 0; const sinDato = new Uint8Array(np);
  for (let p = 0; p < np; p++) {
    const h = L[p].hourly, S = clave(h, kv), D = clave(h, kd); let vacios = 0;
    for (let l = 0; l < nt; l++) {
      const s = S ? S[l] : null, d = D ? D[l] : null, o = l * np + p;
      if (s == null || d == null) { u[o] = NaN; v[o] = NaN; vacios++; nulos++; continue; }
      const r = d * Math.PI / 180, m = tipo === 'viento' ? -s : s / 3.6;
      u[o] = m * Math.sin(r); v[o] = m * Math.cos(r);
    }
    if (vacios === nt) sinDato[p] = 1;
  }
  // Relleno: primero en el tiempo dentro del mismo punto; luego con el punto con dato más cercano.
  for (let p = 0; p < np; p++) {
    if (sinDato[p]) continue; let ult = -1;
    for (let l = 0; l < nt; l++) { const o = l * np + p; if (!isNaN(u[o])) { if (ult < 0) for (let m = 0; m < l; m++) { u[m * np + p] = u[o]; v[m * np + p] = v[o]; } ult = l; } else if (ult >= 0) { u[o] = u[ult * np + p]; v[o] = v[ult * np + p]; } }
  }
  const conDato = []; for (let p = 0; p < np; p++) if (!sinDato[p]) conDato.push(p);
  if (!conDato.length) return null;
  for (let p = 0; p < np; p++) {
    if (!sinDato[p]) continue; const j = Math.floor(p / nx), i = p % nx; let mejor = -1, dm = Infinity;
    for (const q of conDato) { const d2 = (Math.floor(q / nx) - j) ** 2 + (q % nx - i) ** 2; if (d2 < dm) { dm = d2; mejor = q; } }
    for (let l = 0; l < nt; l++) { u[l * np + p] = u[l * np + mejor]; v[l * np + p] = v[l * np + mejor]; }
  }
  return { lats, lons, ts, u, v, nm: 1, fraccionSinDato: nulos / (nt * np), puntosSinDato: sinDato.reduce((a, b) => a + b, 0) };
}

// Ensemble de viento de Open-Meteo: devuelve las anomalías de cada miembro respecto de la media del ensemble.
function sarEnsembleOpenMeteo(resp, lats, lons) {
  const L = Array.isArray(resp) ? resp : [resp], ny = lats.length, nx = lons.length, np = ny * nx;
  if (L.length !== np || !L[0] || !L[0].hourly) return null;
  const h0 = L[0].hourly, sufijos = Object.keys(h0).filter(k => /^wind_speed_10m(_.*)?$/.test(k)).map(k => k.slice('wind_speed_10m'.length));
  const usables = sufijos.filter(s => h0['wind_direction_10m' + s]);
  if (usables.length < 5) return null;
  const ts = h0.time.map(Number), nt = ts.length, nm = usables.length, u = new Float32Array(nm * nt * np), v = new Float32Array(nm * nt * np);
  const valido = new Uint8Array(nt).fill(1);
  for (let p = 0; p < np; p++) for (let l = 0; l < nt; l++) {
    let su = 0, sv = 0, ok = true;
    for (let m = 0; m < nm; m++) {
      const s = L[p].hourly['wind_speed_10m' + usables[m]]?.[l], d = L[p].hourly['wind_direction_10m' + usables[m]]?.[l], o = (m * nt + l) * np + p;
      if (s == null || d == null) { ok = false; u[o] = 0; v[o] = 0; continue; }
      const r = d * Math.PI / 180; u[o] = -s * Math.sin(r); v[o] = -s * Math.cos(r); su += u[o]; sv += v[o];
    }
    if (!ok) { valido[l] = 0; for (let m = 0; m < nm; m++) { const o = (m * nt + l) * np + p; u[o] = 0; v[o] = 0; } continue; }
    su /= nm; sv /= nm;
    for (let m = 0; m < nm; m++) { const o = (m * nt + l) * np + p; u[o] -= su; v[o] -= sv; }
  }
  // Tramo con datos del ensemble (los extremos sin dato quedan fuera).
  let a = valido.indexOf(1), b = valido.lastIndexOf(1);
  if (a < 0) return null;
  return { lats, lons, ts, u, v, nm, tIni: ts[a], tFin: ts[b] };
}

// Máscara de tierra en una grilla fina a partir de los anillos de costa ([lat, lon]); relleno por líneas de barrido (par-impar).
function sarMascaraTierra(anillos, caja, nx, ny) {
  const [s, w, n, e] = caja, m = new Uint8Array(nx * ny), dx = (e - w) / nx, dy = (n - s) / ny;
  const utiles = anillos.filter(r => { let a = 90, b = -90, c = 180, d = -180; for (const [la, lo] of r) { if (la < a) a = la; if (la > b) b = la; if (lo < c) c = lo; if (lo > d) d = lo; } return b >= s && a <= n && d >= w && c <= e; });
  for (let j = 0; j < ny; j++) {
    const y = s + (j + 0.5) * dy, xs = [];
    for (const r of utiles) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const y1 = r[i][0], y2 = r[k][0];
      if ((y1 > y) !== (y2 > y)) xs.push(r[i][1] + (y - y1) / (y2 - y1) * (r[k][1] - r[i][1]));
    }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil((xs[q] - w) / dx - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - w) / dx - 0.5));
      for (let i = i0; i <= i1; i++) m[j * nx + i] = 1;
    }
  }
  return (lat, lon) => { const i = Math.floor((lon - w) / dx), j = Math.floor((lat - s) / dy); return i >= 0 && i < nx && j >= 0 && j < ny ? m[j * nx + i] === 1 : false; };
}

// Simulación. Tiempos en segundos Unix. Devuelve la posición y el estado de cada partícula en cada hora de salida.
// estado: 0 aún no inicia (por la incertidumbre de la hora), 1 a la deriva, 2 varada en la costa.
function sarDerivaSimular(o) {
  const P = Object.assign({}, SAR_DERIVA_DEF, o), n = P.n, az = sarAzar(P.semilla || 12345), obj = SAR_LEEWAY[P.objeto] || SAR_LEEWAY['PIW-1'], c = obj.c;
  const lat = new Float64Array(n), lon = new Float64Array(n), est = new Uint8Array(n), tIni = new Float64Array(n);
  const dwS = new Float32Array(n), dwE = new Float32Array(n), cwS = new Float32Array(n), cwO = new Float32Array(n), cwE = new Float32Array(n);
  const eu = new Float32Array(n), ev = new Float32Array(n), wu = new Float32Array(n), wv = new Float32Array(n), miembro = new Uint16Array(n);
  const G = 111320, rad = Math.PI / 180, sig = P.sigmaPos || 0, esTierra = P.esTierra || null, M = P.miembros || null;
  for (let i = 0; i < n; i++) {
    // Posición inicial: normal alrededor de la última posición conocida; si cae en tierra se vuelve a sortear.
    let la = P.lat, lo = P.lon, intento = 0;
    do { la = P.lat + az.n() * sig / G; lo = P.lon + az.n() * sig / (G * Math.cos(P.lat * rad)); } while (sig > 0 && esTierra && esTierra(la, lo) && ++intento < 30);
    if (sig > 0 && esTierra && esTierra(la, lo)) { la = P.lat; lo = P.lon; }
    lat[i] = la; lon[i] = lo;
    tIni[i] = P.t0 + (P.errT ? (2 * az.u() - 1) * P.errT : 0);
    // Coeficientes de abatimiento con su error (igual que Leeway de OpenDrift).
    const der = i % 2 === 0; let eps = az.n() * c[2]; while (c[0] + eps / 20 < 0) eps = az.n() * c[2];
    dwS[i] = c[0]; dwE[i] = eps; cwS[i] = der ? c[3] : c[6]; cwO[i] = der ? c[4] : c[7]; cwE[i] = az.n() * (der ? c[5] : c[8]);
    // Errores persistentes de la corriente y del viento (este último solo donde no hay ensemble).
    eu[i] = az.n() * P.sigCorr; ev[i] = az.n() * P.sigCorr; wu[i] = az.n() * P.sigViento; wv[i] = az.n() * P.sigViento;
    miembro[i] = M ? Math.floor(az.u() * M.nm) % M.nm : 0;
  }
  const tiempos = []; for (let t = P.t0; t < P.t1 - 1; t += P.salidaCada) tiempos.push(t); tiempos.push(P.t1);
  const nOut = tiempos.length, LA = new Float32Array(nOut * n), LO = new Float32Array(nOut * n), ES = new Uint8Array(nOut * n);
  const pJibe = 1 - Math.exp(Math.log(1 - P.jibe) / 3600 * P.dt), dif = Math.sqrt(2 * P.K * P.dt), w = [0, 0], cc = [0, 0], an = [0, 0];
  let fuera = 0, sinEns = 0, pasos = 0;
  const guardar = k => { const b = k * n; for (let i = 0; i < n; i++) { LA[b + i] = lat[i]; LO[b + i] = lon[i]; ES[b + i] = est[i]; } };
  let k = 0, t = P.t0 - (P.errT || 0);
  while (k < nOut) {
    if (t >= tiempos[k] - 1e-6) { guardar(k); k++; if (k >= nOut) break; }
    const dt = Math.min(P.dt, tiempos[k] - t), tm = t + dt / 2, conEns = M && tm >= M.tIni && tm <= M.tFin;
    for (let i = 0; i < n; i++) {
      if (est[i] === 2) continue;
      if (est[i] === 0) { if (tIni[i] <= t) est[i] = 1; else continue; }
      const fw = sarCampoInterp(P.viento, 0, lat[i], lon[i], tm, w); sarCampoInterp(P.corriente, 0, lat[i], lon[i], tm, cc);
      if (fw) fuera++;
      let uw = w[0], vw = w[1];
      if (conEns) { sarCampoInterp(M, miembro[i], lat[i], lon[i], tm, an); uw += an[0]; vw += an[1]; } else { uw += wu[i]; vw += wv[i]; sinEns++; }
      pasos++;
      const W = Math.hypot(uw, vw), th = Math.atan2(uw, vw), sn = Math.sin(th), cs = Math.cos(th);
      const dw = ((dwS[i] + dwE[i] / 20) * W + c[1] + dwE[i] / 2) * 0.01, cw = ((cwS[i] + cwE[i] / 20) * W + cwO[i] + cwE[i] / 2) * 0.01;
      const vx = dw * sn - cw * cs + cc[0] + eu[i], vy = dw * cs + cw * sn + cc[1] + ev[i];
      const la = lat[i] + (vy * dt + (dif ? az.n() * dif * Math.sqrt(dt / P.dt) : 0)) / G, lo = lon[i] + (vx * dt + (dif ? az.n() * dif * Math.sqrt(dt / P.dt) : 0)) / (G * Math.cos(lat[i] * rad));
      if (esTierra && esTierra(la, lo)) { est[i] = 2; continue; }   // vara: queda en la última posición en el agua
      lat[i] = la; lon[i] = lo;
      if (az.u() < pJibe * dt / P.dt) cwS[i] = -cwS[i];
    }
    t += dt;
  }
  return { n, nOut, tiempos, lat: LA, lon: LO, estado: ES, objeto: P.objeto, nombreObjeto: obj.nombre, miembros: M ? M.nm : 0,
    fraccionFuera: pasos ? fuera / pasos : 0, fraccionSinEnsemble: pasos ? sinEns / pasos : 1, origen: [P.lat, P.lon] };
}

// Resumen de la nube en la salida k: zonas que contienen el 50 % y el 90 % de la probabilidad, posición más probable y
// rectángulo de búsqueda orientado según el eje principal de la nube.
function sarDerivaResumen(sim, k, esTierra) {
  const n = sim.n, b = k * n, G = 111320, rad = Math.PI / 180, xs = [], ys = [], idx = [];
  let varadas = 0, sinIniciar = 0, la0 = 0, lo0 = 0, m = 0;
  for (let i = 0; i < n; i++) { const e = sim.estado[b + i]; if (e === 0) { sinIniciar++; continue; } if (e === 2) varadas++; la0 += sim.lat[b + i]; lo0 += sim.lon[b + i]; m++; }
  if (!m) return null;
  la0 /= m; lo0 /= m; const kx = G * Math.cos(la0 * rad);
  for (let i = 0; i < n; i++) { if (sim.estado[b + i] === 0) continue; xs.push((sim.lon[b + i] - lo0) * kx); ys.push((sim.lat[b + i] - la0) * G); idx.push(i); }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < m; i++) { if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]; if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]; }
  // Grilla de densidad con suavizado gaussiano.
  const celda = Math.max(150, Math.max(x1 - x0, y1 - y0) / 44), mg = 3, nx = Math.ceil((x1 - x0) / celda) + 2 * mg + 1, ny = Math.ceil((y1 - y0) / celda) + 2 * mg + 1;
  const ox = x0 - mg * celda, oy = y0 - mg * celda, H = new Float32Array(nx * ny), cel = new Int32Array(m);
  for (let i = 0; i < m; i++) { const c = Math.floor((ys[i] - oy) / celda) * nx + Math.floor((xs[i] - ox) / celda); cel[i] = c; H[c]++; }
  const nuc = [0.0625, 0.25, 0.375, 0.25, 0.0625], T = new Float32Array(nx * ny), D = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let q = -2; q <= 2; q++) { const ii = i + q; if (ii >= 0 && ii < nx) s += H[j * nx + ii] * nuc[q + 2]; } T[j * nx + i] = s; }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let q = -2; q <= 2; q++) { const jj = j + q; if (jj >= 0 && jj < ny) s += T[jj * nx + i] * nuc[q + 2]; } D[j * nx + i] = s; }
  const orden = []; for (let c = 0; c < nx * ny; c++) if (D[c] > 0) orden.push(c);
  orden.sort((p, q) => D[q] - D[p]);
  const nivel = new Uint8Array(nx * ny); let ac = 0; const tot = orden.reduce((s, c) => s + D[c], 0);
  for (const c of orden) { nivel[c] = ac < 0.5 * tot ? 1 : ac < 0.9 * tot ? 2 : 0; ac += D[c]; if (ac >= 0.9 * tot && !nivel[c]) break; }
  const aLL = (x, y) => [la0 + y / G, lo0 + x / kx], celdas = [];
  // Las celdas sin partículas cuyo centro cae en tierra (efecto del suavizado junto a la costa) no se cuentan ni se dibujan.
  if (esTierra) for (let c = 0; c < nx * ny; c++) if (nivel[c] && !H[c]) { const q = aLL(ox + (c % nx + 0.5) * celda, oy + (Math.floor(c / nx) + 0.5) * celda); if (esTierra(q[0], q[1])) nivel[c] = 0; }
  for (let c = 0; c < nx * ny; c++) if (nivel[c]) { const i = c % nx, j = Math.floor(c / nx); celdas.push({ nivel: nivel[c] === 1 ? 50 : 90, sw: aLL(ox + i * celda, oy + j * celda), ne: aLL(ox + (i + 1) * celda, oy + (j + 1) * celda) }); }
  const cm = orden[0], masProbable = aLL(ox + (cm % nx + 0.5) * celda, oy + (Math.floor(cm / nx) + 0.5) * celda);
  // Rectángulo de búsqueda: partículas dentro de la zona del 90 %, ejes principales de la nube.
  const dentro = []; for (let i = 0; i < m; i++) if (nivel[cel[i]]) dentro.push(i);
  let mx = 0, my = 0; for (const i of dentro) { mx += xs[i]; my += ys[i]; } mx /= dentro.length; my /= dentro.length;
  let sxx = 0, syy = 0, sxy = 0; for (const i of dentro) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ca = Math.cos(ang), sa = Math.sin(ang);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const i of dentro) { const dx = xs[i] - mx, dy = ys[i] - my, p = dx * ca + dy * sa, q = -dx * sa + dy * ca; if (p < a0) a0 = p; if (p > a1) a1 = p; if (q < b0) b0 = q; if (q > b1) b1 = q; }
  // Margen mínimo de media celda para que el rectángulo nunca sea degenerado.
  const mgR = celda / 2; a0 -= mgR; a1 += mgR; b0 -= mgR; b1 += mgR;
  const esq = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([p, q]) => aLL(mx + p * ca - q * sa, my + p * sa + q * ca));
  const largo = (a1 - a0) / 1852, ancho = (b1 - b0) / 1852, centro = aLL(mx + (a0 + a1) / 2 * ca - (b0 + b1) / 2 * sa, my + (a0 + a1) / 2 * sa + (b0 + b1) / 2 * ca);
  const rumboEje = ((90 - ang * 180 / Math.PI) % 180 + 180) % 180;
  // Distancia desde el origen: mediana y percentil 90.
  const d = idx.map((_, i) => Math.hypot((sim.lon[b + idx[i]] - sim.origen[1]) * G * Math.cos(sim.origen[0] * rad), (sim.lat[b + idx[i]] - sim.origen[0]) * G) / 1852).sort((p, q) => p - q);
  return { t: sim.tiempos[k], activas: m - varadas, varadas, sinIniciar, total: n, media: [la0, lo0], masProbable, celdas, celdaM: celda,
    area50: celdas.filter(c => c.nivel === 50).length * celda * celda / 1852 ** 2, area90: celdas.length * celda * celda / 1852 ** 2,
    rect: { esquinas: esq, centro, largo: Math.max(largo, ancho), ancho: Math.min(largo, ancho), area: largo * ancho, rumbo: largo >= ancho ? rumboEje : (rumboEje + 90) % 180 },
    distMediana: d[Math.floor(d.length / 2)], dist90: d[Math.floor(d.length * 0.9)] };
}
if (typeof module !== 'undefined') module.exports = { SAR_LEEWAY, SAR_LEEWAY_POR_OBJETO, SAR_DERIVA_DEF, sarAzar, sarCampoInterp, sarCampoOpenMeteo, sarEnsembleOpenMeteo, sarMascaraTierra, sarDerivaSimular, sarDerivaResumen };
