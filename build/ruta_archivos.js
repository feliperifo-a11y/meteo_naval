// ============================ Intercambio de rutas de navegación: salida GPX y lectura de archivos ============================
// Todo ocurre en el navegador, sin biblioteca externa y sin servidor: el .gpx se arma como texto y se entrega con un Blob,
// igual que el informe en Word, y los archivos que trae el usuario se leen con el analizador XML del propio navegador.
//
// Formatos que se leen: GPX 1.1 (TopoGrafix), RTZ (anexo S de IEC 61174, esquema de la CIRM) y KML (Google Earth).
// Formato que se escribe: GPX 1.1, que es el que aceptan los plotters y las aplicaciones de navegación.
//
// El análisis se hace en dos pasos: primero el XML se convierte en un árbol de objetos simples y después se extraen los
// puntos de ese árbol. Así la extracción, que es donde están los errores posibles, se prueba sin navegador. En el
// navegador el árbol lo construye DOMParser; fuera de él, un lector reducido que basta para estos tres formatos.

const RUTA_MAX_PUNTOS = 100;        // tope de puntos de paso: por encima, la consulta de pronóstico no alcanza a responder
const RUTA_MAX_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------- texto

const RUTA_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function rutaDesEnt(s) {
  return String(s).replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, (t, c) => {
    if (c[0] === '#') { const n = c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10); return isFinite(n) && n > 0 ? String.fromCodePoint(n) : t; }
    return RUTA_ENT[c.toLowerCase()] != null ? RUTA_ENT[c.toLowerCase()] : t;
  });
}
function rutaEscXml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');   // caracteres de control: no son XML válido
}
// Quita acentos y la eñe: varios plotters solo aceptan letras sin marcas en el nombre del punto de paso
function rutaSinTilde(s) {
  const t = String(s == null ? '' : s);
  return t.normalize ? t.normalize('NFD').replace(/[̀-ͯ]/g, '') : t;
}
// Nombre corto para el punto de paso: muchos equipos truncan entre 6 y 16 caracteres y descartan los símbolos
function rutaNomCorto(s, max) {
  const t = rutaSinTilde(s).replace(/[^A-Za-z0-9 _.-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (t || 'WP').slice(0, max || 16).trim() || 'WP';
}

// ---------------------------------------------------------------- árbol XML
// Nodo: { n: nombre local en minúsculas, a: atributos en minúsculas, h: hijos, t: texto }
// Se pierde el prefijo de espacio de nombres a propósito: los tres formatos lo usan de maneras distintas y ninguno
// tiene dos elementos o atributos que se diferencien solo por mayúsculas.

function rutaNodoDom(el) {
  const a = {};
  const ats = el.attributes || [];
  for (let i = 0; i < ats.length; i++) { const nm = ats[i].name || ''; a[(nm.includes(':') ? nm.split(':').pop() : nm).toLowerCase()] = ats[i].value; }
  const h = []; let t = '';
  const cs = el.childNodes || [];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c.nodeType === 1) h.push(rutaNodoDom(c));
    else if (c.nodeType === 3 || c.nodeType === 4) t += c.nodeValue || '';
  }
  const nm = el.localName || el.nodeName || '';
  return { n: nm.toLowerCase(), a, h, t: t.trim() };
}

function rutaXmlAtributos(s) {
  const a = {}, re = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) {
    const k = m[1].includes(':') ? m[1].split(':').pop() : m[1];
    a[k.toLowerCase()] = rutaDesEnt(m[2] != null ? m[2] : m[3]);
  }
  return a;
}

// Lector reducido, para usar fuera del navegador. Entiende declaración, comentarios, CDATA, etiquetas vacías,
// atributos entre comillas simples o dobles, prefijos de espacio de nombres y entidades.
function rutaXmlSimple(txt) {
  const s = String(txt).replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  const raiz = { n: '#', a: {}, h: [], t: '' }, pila = [raiz];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(s))) {
    const act = pila[pila.length - 1];
    if (m[1] != null) { act.t += m[1]; continue; }                       // CDATA: literal
    if (m[6] != null) { act.t += rutaDesEnt(m[6]); continue; }           // texto
    const nom = (m[3].includes(':') ? m[3].split(':').pop() : m[3]).toLowerCase();
    if (m[2] === '/') {                                                   // cierre: sube hasta la etiqueta que corresponde
      for (let i = pila.length - 1; i > 0; i--) if (pila[i].n === nom) { pila.length = i; break; }
      continue;
    }
    const nodo = { n: nom, a: rutaXmlAtributos(m[4] || ''), h: [], t: '' };
    act.h.push(nodo);
    if (!m[5]) pila.push(nodo);
  }
  const poda = nd => { nd.t = nd.t.trim(); nd.h.forEach(poda); return nd; };
  return raiz.h.length ? poda(raiz.h[0]) : null;
}

function rutaXmlArbol(txt) {
  if (typeof DOMParser !== 'undefined') {
    let doc = null;
    try { doc = new DOMParser().parseFromString(String(txt), 'application/xml'); } catch (e) { return null; }
    if (!doc || !doc.documentElement) return null;
    if (doc.getElementsByTagName('parsererror').length || doc.documentElement.nodeName === 'parsererror') return null;
    return rutaNodoDom(doc.documentElement);
  }
  return rutaXmlSimple(txt);
}

const rutaHijos = (nd, n) => nd ? nd.h.filter(x => x.n === n) : [];
const rutaHijo = (nd, n) => rutaHijos(nd, n)[0] || null;
function rutaPrimero(nd, n) {                       // primer descendiente con ese nombre, en orden de documento
  if (!nd) return null;
  for (const c of nd.h) { if (c.n === n) return c; const r = rutaPrimero(c, n); if (r) return r; }
  return null;
}
const rutaTexto = (nd, n) => { const c = rutaHijo(nd, n); return c ? c.t : ''; };
const rutaNum = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : NaN; };

// ---------------------------------------------------------------- validación de los puntos leídos

function rutaSubmuestrear(P, max) {
  if (P.length <= max) return P.slice();
  const out = [], paso = (P.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(P[Math.round(i * paso)]);
  return out.filter((p, i, A) => i === 0 || p !== A[i - 1]);
}

function rutaValidarPuntos(lista, max) {
  const avisos = [], tope = max || RUTA_MAX_PUNTOS;
  let P = lista.filter(p => isFinite(p.lat) && isFinite(p.lon));
  if (P.length < lista.length) avisos.push(`Se descartaron ${lista.length - P.length} ${lista.length - P.length === 1 ? 'punto sin coordenada válida' : 'puntos sin coordenada válida'}.`);
  const enRango = p => Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  // Latitud y longitud invertidas: pasa seguido al armar el archivo a mano
  if (P.length && !P.every(enRango) && P.every(p => Math.abs(p.lon) <= 90 && Math.abs(p.lat) <= 180)) {
    P = P.map(p => ({ lat: p.lon, lon: p.lat, nombre: p.nombre }));
    avisos.push('Las coordenadas venían invertidas (la longitud en el campo de latitud) y se intercambiaron.');
  }
  const antes = P.length;
  P = P.filter(enRango);
  if (P.length < antes) avisos.push(`Se descartaron ${antes - P.length} ${antes - P.length === 1 ? 'punto fuera de rango' : 'puntos fuera de rango'}.`);
  P = P.filter((p, i, A) => i === 0 || Math.abs(p.lat - A[i - 1].lat) > 1e-6 || Math.abs(p.lon - A[i - 1].lon) > 1e-6);
  if (P.length < 2) return { error: 'El archivo no trae al menos dos puntos de paso utilizables.' };
  if (P.length > tope) {
    const n = P.length;
    P = rutaSubmuestrear(P, tope);
    avisos.push(`La ruta traía ${n} puntos y se redujo a ${P.length}, conservando el primero y el último.`);
  }
  return { puntos: P, avisos };
}

// ---------------------------------------------------------------- lectura por formato

function rutaLeerGpx(raiz) {
  const avisos = [];
  const pto = (nd, i) => ({ lat: rutaNum(nd.a.lat), lon: rutaNum(nd.a.lon), nombre: rutaTexto(nd, 'name') || rutaTexto(nd, 'desc') || 'WP' + (i + 1) });
  const rte = rutaPrimero(raiz, 'rte');
  let lista = rte ? rutaHijos(rte, 'rtept').map(pto) : [];
  let nombre = rte ? rutaTexto(rte, 'name') : '';
  if (!lista.length) {                                  // sin ruta: se acepta la derrota registrada
    const trk = rutaPrimero(raiz, 'trk');
    if (trk) {
      lista = rutaHijos(trk, 'trkseg').reduce((a, sg) => a.concat(rutaHijos(sg, 'trkpt')), []).map(pto);
      nombre = nombre || rutaTexto(trk, 'name');
      if (lista.length) avisos.push('El archivo no traía una ruta, sino una derrota registrada; se usaron sus puntos.');
    }
  }
  if (!lista.length) {                                  // ni ruta ni derrota: puntos sueltos, en el orden del archivo
    lista = rutaHijos(raiz, 'wpt').map(pto);
    if (lista.length) avisos.push('El archivo solo traía puntos sueltos; se unieron en el orden en que vienen.');
  }
  if (!lista.length) return { error: 'El archivo GPX no contiene rutas, derrotas ni puntos.' };
  nombre = nombre || rutaTexto(rutaHijo(raiz, 'metadata'), 'name');
  return { formato: 'GPX', nombre: nombre.trim(), lista, avisos };
}

function rutaLeerRtz(raiz) {
  const avisos = [];
  const info = rutaHijo(raiz, 'routeinfo');
  const cont = rutaHijo(raiz, 'waypoints');
  const wps = cont ? rutaHijos(cont, 'waypoint') : [];
  if (!wps.length) return { error: 'El archivo RTZ no contiene puntos de paso.' };
  const lista = wps.map((w, i) => {
    const pos = rutaHijo(w, 'position') || { a: {} };
    return { lat: rutaNum(pos.a.lat), lon: rutaNum(pos.a.lon), nombre: (w.a.name || 'WP' + (w.a.id != null ? w.a.id : i + 1)) };
  });
  // Horario: entrega la hora de zarpe y la velocidad, así el usuario no tiene que volver a escribirlas
  let zarpe = null, velocidad = NaN;
  const prog = rutaHijo(raiz, 'schedules');
  const hor = prog ? rutaHijos(prog, 'schedule')[0] : null;
  const bloque = hor ? (rutaHijo(hor, 'calculated') || rutaHijo(hor, 'manual')) : null;
  if (bloque) {
    const els = rutaHijos(bloque, 'scheduleelement');
    for (const e of els) { if (!zarpe && e.a.etd) { const d = new Date(e.a.etd); if (!isNaN(d.getTime())) zarpe = d; } if (!isFinite(velocidad) && e.a.speed) velocidad = rutaNum(e.a.speed); }
  }
  if (!isFinite(velocidad)) {                            // sin horario: la velocidad máxima del primer tramo sirve igual
    for (const w of wps) { const lg = rutaHijo(w, 'leg'); if (lg && (lg.a.speedmax || lg.a.speedmin)) { velocidad = rutaNum(lg.a.speedmax || lg.a.speedmin); break; } }
  }
  const ver = raiz.a.version || '';
  if (ver && !/^1\./.test(ver)) avisos.push(`El archivo declara RTZ versión ${ver}, que no es de la familia 1.x; se leyeron solo las posiciones.`);
  if (rutaPrimero(raiz, 'extension')) avisos.push('El archivo trae extensiones propias de un fabricante, que no se interpretan.');
  return { formato: 'RTZ', nombre: ((info && info.a.routename) || '').trim(), lista, avisos, zarpe, velocidad: isFinite(velocidad) ? velocidad : null };
}

function rutaLeerKml(raiz) {
  const ln = rutaPrimero(raiz, 'linestring');
  const crd = ln ? rutaHijo(ln, 'coordinates') : null;
  if (!crd || !crd.t.trim()) return { error: 'El archivo KML no contiene una línea con coordenadas.' };
  const lista = crd.t.trim().split(/\s+/).map((tri, i) => {
    const q = tri.split(',');
    return { lat: rutaNum(q[1]), lon: rutaNum(q[0]), nombre: 'WP' + (i + 1) };   // KML va longitud, latitud, altura
  });
  const pm = rutaPrimero(raiz, 'placemark');
  return { formato: 'KML', nombre: (pm ? rutaTexto(pm, 'name') : '').trim(), lista, avisos: [] };
}

// Devuelve { formato, nombre, puntos: [{lat, lon, nombre}], avisos, zarpe, velocidad } o { error }
function rutaLeerRuta(texto, max) {
  if (texto == null || !String(texto).trim()) return { error: 'El archivo está vacío.' };
  const raiz = rutaXmlArbol(texto);
  if (!raiz) return { error: 'El archivo no es XML válido. Se aceptan GPX, RTZ y KML.' };
  const lect = raiz.n === 'gpx' ? rutaLeerGpx(raiz) : raiz.n === 'route' ? rutaLeerRtz(raiz) : raiz.n === 'kml' ? rutaLeerKml(raiz) : null;
  if (!lect) return { error: `No se reconoce el formato del archivo (elemento raíz "${raiz.n}"). Se aceptan GPX, RTZ y KML.` };
  if (lect.error) return lect;
  const v = rutaValidarPuntos(lect.lista, max);
  if (v.error) return { error: v.error };
  return { formato: lect.formato, nombre: lect.nombre, puntos: v.puntos, avisos: lect.avisos.concat(v.avisos), zarpe: lect.zarpe || null, velocidad: lect.velocidad || null };
}

// ---------------------------------------------------------------- puntos de paso para exportar
// Se exporta la traza por mar, que es la geometría que evita la tierra, y no los puntos que marcó el usuario:
// entre dos de esos puntos la traza puede rodear una punta o entrar por un canal, y esa vuelta es parte de la ruta.
// Los vértices que coinciden con un puerto o una bahía conservan su nombre; el resto se numera.
function rutaPuntosArchivo(R) {
  if (!R || !R.traza || R.traza.length < 2) return [];
  const M = R.muestras || [];
  const igual = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  return R.traza.map((p, i) => {
    const s = M.find(x => x.puerto && x.p && igual(x.p, p));
    return { lat: p[0], lon: p[1], nombre: s ? s.puerto : i === 0 ? 'Zarpe' : i === R.traza.length - 1 ? 'Recalada' : 'WP' + (i + 1) };
  });
}

// ---------------------------------------------------------------- salida GPX
// d = { nombre, desc, fecha, puntos: [{ lat, lon, nombre, desc }] }

function rutaGpx(d) {
  const P = (d && d.puntos) || [];
  if (P.length < 2) throw new Error('Una ruta GPX necesita al menos dos puntos.');
  const g = n => (Math.round(n * 1e6) / 1e6).toFixed(6);
  const fecha = d.fecha instanceof Date ? d.fecha : new Date();
  const nom = String(d.nombre || 'Ruta MeteoIA').trim() || 'Ruta MeteoIA';
  const L = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="MeteoIA" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `  <metadata><name>${rutaEscXml(nom)}</name>${d.desc ? `<desc>${rutaEscXml(d.desc)}</desc>` : ''}<time>${fecha.toISOString().replace(/\.\d{3}Z$/, 'Z')}</time></metadata>`,
    '  <rte>', `    <name>${rutaEscXml(rutaSinTilde(nom))}</name>`];
  if (d.desc) L.push(`    <desc>${rutaEscXml(d.desc)}</desc>`);
  P.forEach((p, i) => {
    const corto = rutaNomCorto(p.nombre || ('WP' + (i + 1)));
    L.push(`    <rtept lat="${g(p.lat)}" lon="${g(p.lon)}">`);
    L.push(`      <name>${rutaEscXml(corto)}</name>`);
    if (p.desc || (p.nombre && rutaSinTilde(p.nombre) !== corto)) L.push(`      <desc>${rutaEscXml(p.desc || p.nombre)}</desc>`);
    L.push('      <sym>Waypoint</sym>');
    L.push('    </rtept>');
  });
  L.push('  </rte>', '</gpx>');
  return L.join('\n') + '\n';
}

if (typeof module !== 'undefined') module.exports = { RUTA_MAX_PUNTOS, RUTA_MAX_BYTES, rutaDesEnt, rutaEscXml, rutaSinTilde, rutaNomCorto, rutaXmlSimple, rutaXmlArbol, rutaSubmuestrear, rutaValidarPuntos, rutaLeerRuta, rutaPuntosArchivo, rutaGpx };
