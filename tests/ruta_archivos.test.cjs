// Intercambio de rutas (build/ruta_archivos.js): salida GPX y lectura de GPX, RTZ y KML.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const m = require(path.join(__dirname, '..', 'build', 'ruta_archivos.js'));

const VALPO = { lat: -33.03, lon: -71.62, nombre: 'Bahía de Valparaíso' };
const TALCA = { lat: -36.7, lon: -73.11, nombre: 'Bahía Concepción - Talcahuano' };
const ruta2 = { nombre: 'Valparaíso a Talcahuano', fecha: new Date('2026-11-18T12:00:00Z'), puntos: [VALPO, TALCA] };

test('el GPX sale bien formado, con las coordenadas en grados decimales', () => {
  const g = m.rutaGpx(ruta2);
  assert.match(g, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/);
  assert.match(g, /xmlns="http:\/\/www\.topografix\.com\/GPX\/1\/1"/);
  assert.match(g, /<time>2026-11-18T12:00:00Z<\/time>/);
  assert.equal((g.match(/<rtept /g) || []).length, 2);
  assert.match(g, /<rtept lat="-33\.030000" lon="-71\.620000">/);
  assert.match(g, /<rtept lat="-36\.700000" lon="-73\.110000">/);
  // orden de elementos del esquema GPX dentro de rtept: name, desc, sym
  assert.match(g, /<name>[^<]*<\/name>\s*<desc>[^<]*<\/desc>\s*<sym>Waypoint<\/sym>/);
  assert.ok(g.trim().endsWith('</gpx>'));
});

test('los nombres de punto de paso van sin acentos y recortados, y el nombre completo queda en la descripción', () => {
  const g = m.rutaGpx(ruta2);
  assert.match(g, /<name>Bahia de Valpara<\/name>/);                 // 16 caracteres, sin tildes
  assert.match(g, /<desc>Bahía de Valparaíso<\/desc>/);              // el largo, tal cual
  assert.equal(m.rutaNomCorto('Bahía Concepción - Talcahuano'), 'Bahia Concepcion');
  assert.equal(m.rutaNomCorto('Punta Ángeles', 30), 'Punta Angeles');
  assert.equal(m.rutaNomCorto('¡¿##!!'), 'WP');
  assert.equal(m.rutaNomCorto(''), 'WP');
});

test('el escapado impide que un nombre rompa el XML', () => {
  const g = m.rutaGpx({ nombre: 'A & B <test>', puntos: [{ ...VALPO, nombre: 'P1 & "x"' }, TALCA] });
  assert.ok(!/<test>/.test(g));
  assert.match(g, /&amp;/);
  const r = m.rutaLeerRuta(g);
  assert.equal(r.error, undefined);
  assert.equal(r.nombre, 'A & B <test>');
});

test('ida y vuelta: lo que se escribe se vuelve a leer con las mismas posiciones', () => {
  const g = m.rutaGpx({ nombre: 'Prueba', puntos: [VALPO, { lat: -34.5, lon: -72.2, nombre: 'Medio' }, TALCA] });
  const r = m.rutaLeerRuta(g);
  assert.equal(r.formato, 'GPX');
  assert.equal(r.puntos.length, 3);
  assert.deepEqual(r.puntos.map(p => [p.lat, p.lon]), [[-33.03, -71.62], [-34.5, -72.2], [-36.7, -73.11]]);
  assert.deepEqual(r.avisos, []);
});

test('GPX: sin ruta se usa la derrota registrada, y en último caso los puntos sueltos, avisando', () => {
  const trk = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Derrota</name>
    <trkseg><trkpt lat="-33.0" lon="-71.6"/><trkpt lat="-34.0" lon="-72.0"/></trkseg>
    <trkseg><trkpt lat="-35.0" lon="-72.5"/></trkseg></trk></gpx>`;
  const a = m.rutaLeerRuta(trk);
  assert.equal(a.puntos.length, 3);
  assert.equal(a.nombre, 'Derrota');
  assert.match(a.avisos[0], /derrota registrada/);

  const wpt = `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="-33.0" lon="-71.6"><name>A</name></wpt><wpt lat="-34.0" lon="-72.0"><name>B</name></wpt></gpx>`;
  const b = m.rutaLeerRuta(wpt);
  assert.equal(b.puntos.length, 2);
  assert.match(b.avisos[0], /puntos sueltos/);
  assert.deepEqual(b.puntos.map(p => p.nombre), ['A', 'B']);
});

test('RTZ: se leen los puntos de paso, el nombre de la ruta, la hora de zarpe y la velocidad', () => {
  const rtz = `<?xml version="1.0" encoding="UTF-8"?>
<route xmlns="http://www.cirm.org/RTZ/1/1" version="1.1">
  <routeInfo routeName="Valparaiso a Talcahuano" vesselVoyage="2026-11-18"/>
  <waypoints>
    <waypoint id="1" name="Zarpe"><position lat="-33.0300" lon="-71.6200"/><leg geometryType="Loxodrome" speedMin="8" speedMax="12"/></waypoint>
    <waypoint id="2" name="Punta Angeles"><position lat="-33.0500" lon="-71.7000"/><leg speedMax="12"/></waypoint>
    <waypoint id="3" name="Recalada"><position lat="-36.7000" lon="-73.1100"/></waypoint>
  </waypoints>
  <schedules><schedule id="1" name="Plan">
    <calculated>
      <scheduleElement waypointId="1" etd="2026-11-18T14:00:00Z" speed="11"/>
      <scheduleElement waypointId="3" eta="2026-11-19T12:00:00Z"/>
    </calculated>
  </schedule></schedules>
</route>`;
  const r = m.rutaLeerRuta(rtz);
  assert.equal(r.error, undefined);
  assert.equal(r.formato, 'RTZ');
  assert.equal(r.nombre, 'Valparaiso a Talcahuano');
  assert.equal(r.puntos.length, 3);
  assert.deepEqual(r.puntos.map(p => p.nombre), ['Zarpe', 'Punta Angeles', 'Recalada']);
  assert.deepEqual(r.puntos[0], { lat: -33.03, lon: -71.62, nombre: 'Zarpe' });
  assert.equal(r.velocidad, 11);
  assert.equal(r.zarpe.toISOString(), '2026-11-18T14:00:00.000Z');
  assert.deepEqual(r.avisos, []);
});

test('RTZ: sin horario, la velocidad sale del primer tramo que la declare', () => {
  const rtz = `<route xmlns="http://www.cirm.org/RTZ/1/1" version="1.0"><routeInfo routeName="R"/><waypoints>
    <waypoint id="1"><position lat="-33" lon="-71.6"/><leg/></waypoint>
    <waypoint id="2"><position lat="-34" lon="-72"/><leg speedMax="9.5"/></waypoint>
    <waypoint id="3"><position lat="-35" lon="-72.5"/></waypoint></waypoints></route>`;
  const r = m.rutaLeerRuta(rtz);
  assert.equal(r.velocidad, 9.5);
  assert.equal(r.zarpe, null);
  assert.deepEqual(r.puntos.map(p => p.nombre), ['WP1', 'WP2', 'WP3']);
});

test('RTZ: se avisa de extensiones de fabricante y de una versión mayor distinta', () => {
  const rtz = `<route xmlns="http://www.cirm.org/RTZ/2/0" version="2.0"><routeInfo routeName="R"/><waypoints>
    <waypoint id="1"><position lat="-33" lon="-71.6"/></waypoint>
    <waypoint id="2"><position lat="-34" lon="-72"/></waypoint>
    <extensions><extension manufacturer="ACME" name="X" version="1"/></extensions></waypoints></route>`;
  const r = m.rutaLeerRuta(rtz);
  assert.equal(r.puntos.length, 2);
  assert.match(r.avisos.join(' '), /versión 2\.0/);
  assert.match(r.avisos.join(' '), /extensiones propias/);
});

test('KML: la línea de coordenadas viene en longitud, latitud, altura', () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Placemark><name>Travesía</name><LineString><tessellate>1</tessellate>
    <coordinates>-71.62,-33.03,0 -72.20,-34.50,0 -73.11,-36.70,0</coordinates>
    </LineString></Placemark></Document></kml>`;
  const r = m.rutaLeerRuta(kml);
  assert.equal(r.formato, 'KML');
  assert.equal(r.nombre, 'Travesía');
  assert.deepEqual(r.puntos.map(p => [p.lat, p.lon]), [[-33.03, -71.62], [-34.5, -72.2], [-36.7, -73.11]]);
});

test('coordenadas invertidas: se intercambian y se avisa', () => {
  const g = `<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><rte>
    <rtept lat="-171.6" lon="-33.0"/><rtept lat="-172.0" lon="-34.0"/></rte></gpx>`;
  const r = m.rutaLeerRuta(g);
  assert.deepEqual(r.puntos.map(p => [p.lat, p.lon]), [[-33, -171.6], [-34, -172]]);
  assert.match(r.avisos.join(' '), /invertidas/);
});

test('se descartan puntos fuera de rango, sin coordenada y duplicados seguidos', () => {
  const v = m.rutaValidarPuntos([
    { lat: -33, lon: -71.6 }, { lat: -33, lon: -71.6 },            // duplicado seguido
    { lat: NaN, lon: -72 },                                         // sin coordenada
    { lat: -200, lon: -72 },                                        // fuera de rango, sin que el intercambio lo salve
    { lat: -34, lon: -72 },
  ]);
  assert.equal(v.error, undefined);
  assert.deepEqual(v.puntos.map(p => [p.lat, p.lon]), [[-33, -71.6], [-34, -72]]);
  assert.equal(v.avisos.length, 2);
  assert.match(v.avisos.join(' '), /sin coordenada válida/);
  assert.match(v.avisos.join(' '), /fuera de rango/);
});

test('una derrota larga se submuestrea conservando el primero y el último', () => {
  const larga = Array.from({ length: 900 }, (_, i) => ({ lat: -33 - i * 0.004, lon: -71.6 - i * 0.002 }));
  const v = m.rutaValidarPuntos(larga);
  assert.equal(v.puntos.length, m.RUTA_MAX_PUNTOS);
  assert.deepEqual(v.puntos[0], larga[0]);
  assert.deepEqual(v.puntos[v.puntos.length - 1], larga[larga.length - 1]);
  assert.match(v.avisos.join(' '), /900 puntos y se redujo a 100/);
  // el submuestreo no reordena
  for (let i = 1; i < v.puntos.length; i++) assert.ok(v.puntos[i].lat < v.puntos[i - 1].lat);
  assert.equal(m.rutaSubmuestrear([1, 2, 3], 10).length, 3);
});

test('se exporta la traza por mar completa, con el nombre de los puertos en sus vértices', () => {
  // La traza lleva dos vértices que el usuario no marcó: la vuelta que da la ruta para no cruzar tierra.
  const traza = [[-33.03, -71.62], [-33.05, -71.75], [-33.40, -71.95], [-36.70, -73.11]];
  const R = { traza, muestras: [
    { p: traza[0], puerto: 'Bahía de Valparaíso' },
    { p: [-34.2, -72.3], puerto: null },
    { p: traza[3], puerto: 'Talcahuano' },
  ] };
  const P = m.rutaPuntosArchivo(R);
  assert.equal(P.length, 4);
  assert.deepEqual(P.map(p => p.nombre), ['Bahía de Valparaíso', 'WP2', 'WP3', 'Talcahuano']);
  assert.deepEqual(P.map(p => [p.lat, p.lon]), traza);
  // el GPX resultante se vuelve a leer con las mismas posiciones y en el mismo orden
  const r = m.rutaLeerRuta(m.rutaGpx({ nombre: 'T', puntos: P }));
  assert.deepEqual(r.puntos.map(p => [p.lat, p.lon]), traza);
  assert.deepEqual(m.rutaPuntosArchivo(null), []);
  assert.deepEqual(m.rutaPuntosArchivo({ traza: [[-33, -71]] }), []);
});

test('errores claros cuando el archivo no sirve', () => {
  assert.match(m.rutaLeerRuta('').error, /vacío/);
  assert.match(m.rutaLeerRuta('   ').error, /vacío/);
  assert.match(m.rutaLeerRuta('lat,lon\n-33,-71').error, /no es XML válido|no se reconoce/i);
  assert.match(m.rutaLeerRuta('<cosa><otra/></cosa>').error, /no se reconoce el formato/i);
  assert.match(m.rutaLeerRuta('<gpx version="1.1"><rte><rtept lat="-33" lon="-71.6"/></rte></gpx>').error, /al menos dos puntos/);
  assert.match(m.rutaLeerRuta('<route><routeInfo routeName="R"/><waypoints/></route>').error, /no contiene puntos de paso/);
  assert.match(m.rutaLeerRuta('<kml><Document><Placemark/></Document></kml>').error, /no contiene una línea/);
  assert.throws(() => m.rutaGpx({ puntos: [VALPO] }), /al menos dos puntos/);
});

test('el lector de XML entiende comentarios, CDATA, entidades, etiquetas vacías y prefijos', () => {
  const x = m.rutaXmlSimple(`<?xml version="1.0"?><!-- comentario con <etiqueta> adentro -->
    <gpx:gpx xmlns:gpx="http://www.topografix.com/GPX/1/1" version='1.1'>
      <gpx:rte><gpx:name><![CDATA[Ruta & <prueba>]]></gpx:name>
      <gpx:rtept lat="-33.0" lon="-71.6"><gpx:name>A &amp; B</gpx:name></gpx:rtept>
      <gpx:rtept lat="-34.0" lon="-72.0"/></gpx:rte></gpx:gpx>`);
  assert.equal(x.n, 'gpx');
  assert.equal(x.a.version, '1.1');
  const rte = x.h.find(c => c.n === 'rte');
  assert.equal(rte.h.find(c => c.n === 'name').t, 'Ruta & <prueba>');
  const ps = rte.h.filter(c => c.n === 'rtept');
  assert.equal(ps.length, 2);
  assert.equal(ps[0].a.lat, '-33.0');
  assert.equal(ps[0].h[0].t, 'A & B');
  assert.equal(ps[1].h.length, 0);
  assert.equal(m.rutaDesEnt('&#65;&#x42;&amp;'), 'AB&');
});

test('un archivo con prefijo de espacio de nombres se lee igual que uno sin prefijo', () => {
  const con = m.rutaLeerRuta(`<rtz:route xmlns:rtz="http://www.cirm.org/RTZ/1/1" version="1.1"><rtz:routeInfo routeName="N"/>
    <rtz:waypoints><rtz:waypoint id="1"><rtz:position lat="-33" lon="-71.6"/></rtz:waypoint>
    <rtz:waypoint id="2"><rtz:position lat="-34" lon="-72"/></rtz:waypoint></rtz:waypoints></rtz:route>`);
  assert.equal(con.formato, 'RTZ');
  assert.equal(con.nombre, 'N');
  assert.equal(con.puntos.length, 2);
});
