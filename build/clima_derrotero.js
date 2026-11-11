// ============================ Clima regional del Derrotero (capítulo F de cada volumen) ============================
// Síntesis de la climatología descrita en el Derrotero de la Costa de Chile (Pub. SHOA 3001 a 3006), por zona.
// Fuente única: data/clima_derrotero.json (la usan también los borradores de boletín y el WRF + IA). construir_index.py la inserta aquí.
// Cada zona: nombre, vol, resumen, campos descriptivos y "meses": observaciones que aplican a meses concretos (1 = enero).
const CLIMA_DATOS = /*CLIMA_JSON*/{ fuente: '', eje_estrecho_occidental: [], zonas: {} };
const CLIMA_DERROTERO = CLIMA_DATOS.zonas, CLIMA_FUENTE = CLIMA_DATOS.fuente, CLIMA_EJE_OCC = CLIMA_DATOS.eje_estrecho_occidental;
// Zona por posición: misma lógica que scripts/clima_derrotero.py
function climaDistEje(la, lo) {
  const c = Math.cos(la * Math.PI / 180); let m = Infinity;
  for (let i = 0; i < CLIMA_EJE_OCC.length - 1; i++) {
    const a = CLIMA_EJE_OCC[i], b = CLIMA_EJE_OCC[i + 1];
    const ax = (a[1] - lo) * c * 60, ay = (a[0] - la) * 60, bx = (b[1] - lo) * c * 60, by = (b[0] - la) * 60, dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy)));
    m = Math.min(m, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return m;
}
// Zona climática del Derrotero para una posición (null si queda fuera, p. ej. islas oceánicas)
function climaZona(la, lo) {
  if (la <= -60) return 'ant';
  if (la <= -56.1) return 'drake';
  if (lo < -77.5) return null;
  if (la <= -54.0 || (la < -52.6 && lo > -68.45)) return 'fueg';
  if (la < -51.9 && lo > -71.3) return 'estrori';
  if (la < -52.3 && climaDistEje(la, lo) < 12) return 'estrocc';
  if (la <= -47.0) return 'patag';
  if (la < -41.75 || (la < -41.3 && lo > -73.9)) return 'chiloe';
  if (la < -25.4) return 'centro';
  return 'norte';
}
// Observaciones de la zona que aplican a los meses dados (y a la latitud, si la observación tiene límite)
function climaMeses(id, meses, laMin) {
  const z = CLIMA_DERROTERO[id]; if (!z) return [];
  return z.meses.filter(o => o.m.some(m => meses.includes(m)) && (o.sur == null || laMin <= o.sur)).map(o => o.t);
}
