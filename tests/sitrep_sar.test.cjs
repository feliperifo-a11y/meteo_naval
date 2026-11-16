// Borrador de SITREP (build/sitrep_sar.js): formato normalizado IAMSAR, grupo fecha-hora UTC y posiciones.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const m = require(path.join(__dirname, '..', 'build', 'sitrep_sar.js'));
const base = { numero: 3, fase: 'detresfa', fecha: new Date('2026-11-16T19:06:00Z'), de: 'MRCC Talcahuano', para: 'MRCC Chile', identidad: 'L/M Don Pedro', posicion: [-36.5, -73.4], horaIncidente: new Date('2026-11-16T09:00:00Z'),
  naturaleza: 'sin comunicación', personas: '4', asistencia: 'búsqueda', rcc: 'MRCC Talcahuano' };

test('grupo fecha-hora UTC y posición en grados y minutos', () => {
  assert.equal(m.sarGrupoFechaHora(new Date('2026-11-06T03:07:00Z'), 'es'), '060307Z NOV 26'); assert.equal(m.sarGrupoFechaHora(new Date('2026-01-16T19:06:00Z'), 'es'), '161906Z ENE 26'); assert.equal(m.sarGrupoFechaHora(new Date('2026-01-16T19:06:00Z'), 'en'), '161906Z JAN 26');
  assert.equal(m.sarPosSitrep([-36.5, -73.4]), '36-30.0S 073-24.0W'); assert.equal(m.sarPosSitrep([-36.9999, -73]), '37-00.0S 073-00.0W'); assert.equal(m.sarPosSitrep([12.25, 5.5]), '12-15.0N 005-30.0E');
});

test('forma breve: encabezado y párrafos A a F, en mayúsculas', () => {
  const t = m.sarSitrep({ ...base, idioma: 'es', forma: 'breve' }).split('\n');
  assert.deepEqual(t.slice(0, 5), ['SOCORRO', '161906Z NOV 26', 'DE: MRCC TALCAHUANO', 'PARA: MRCC CHILE', 'SAR SITREP NÚMERO 3']);
  assert.deepEqual(t.slice(6).map(l => l[0]), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.match(t[7], /^B\. POSICIÓN: 36-30\.0S 073-24\.0W \(ÚLTIMA POSICIÓN CONOCIDA, 160900Z NOV 26\)$/); assert.match(t[8], /FASE DE PELIGRO\. SIN COMUNICACIÓN\. HORA DEL INCIDENTE 160900Z NOV 26\.$/);
});

test('sin fase de peligro la prioridad es urgencia y lo que falta queda como no informado', () => {
  const t = m.sarSitrep({ idioma: 'en', forma: 'breve', numero: 1, fase: 'alerfa', fecha: base.fecha, posicion: [-37, -73], rcc: 'MRCC Talcahuano' });
  assert.match(t, /^URGENCY\n/); assert.match(t, /A\. IDENTITY OF CASUALTY: NOT REPORTED/); assert.match(t, /C\. SITUATION: ALERT PHASE\./); assert.match(t, /SAR SITREP NUMBER 1/);
  assert.match(m.sarSitrep({ idioma: 'es', forma: 'breve', fecha: base.fecha, posicion: [-37, -73] }), /C\. SITUACIÓN: FASE NO DECLARADA\./);
});

test('forma completa: condiciones, área de búsqueda y párrafos G a N', () => {
  const t = m.sarSitrep({ ...base, idioma: 'es', forma: 'completa', descripcion: 'lancha de 12 m',
    tiempo: { viento: 16.2, dir: 190, racha: 24, ola: 2, olaDir: 225, olaPer: 12, fondo: 1.8, fondoDir: 230, fondoPer: 13, vis: 24000, tsm: 13.4, hora: new Date('2026-11-16T19:00:00Z') },
    area: { tipo: 'rect', largo: 20.9, ancho: 17.7, centro: [-36.23, -73.28], vertices: [[-36.4, -73.5], [-36.3, -73.1], [-36.05, -73.2], [-36.15, -73.6]], hora: new Date('2026-11-16T18:00:00Z'), masProbable: [-36.24, -73.28], patron: 'Cuadrado expansivo (SS)' } });
  assert.deepEqual(t.split('\n').slice(6).map(l => l[0]).join(''), 'ABCDEFGHJKLMN');
  assert.match(t, /H\. .*VIENTO 190\/16 KT RACHAS 24 KT, MAR 2\.0 M DEL 225 12 S, MAR DE FONDO 1\.8 M DEL 230 13 S, VISIBILIDAD MÁS DE 10 MN, TEMPERATURA DEL AGUA 13 C\. PRONÓSTICO PUNTUAL DEL MODELO/);
  assert.match(t, /K\. ÁREA DE BÚSQUEDA: RECTÁNGULO DE 20\.9 X 17\.7 MN, VÁLIDA PARA 161800Z NOV 26\. CENTRO 36-13\.8S 073-16\.8W\. VÉRTICES: 36-24\.0S 073-30\.0W \/ /); assert.match(t, /PATRÓN: CUADRADO EXPANSIVO \(SS\)\.$/m);
  const c = m.sarSitrep({ ...base, idioma: 'en', forma: 'completa', area: { tipo: 'circ', radio: 5.2, datum: [-36.4, -73.3] } });
  assert.match(c, /K\. SEARCH AREA: CIRCLE OF RADIUS 5\.2 NM CENTRED ON DATUM 36-24\.0S 073-18\.0W\./); assert.match(c, /H\. WEATHER ON SCENE: NOT REPORTED/);
});

test('la ficha de Caso SAR incorpora el borrador de SITREP', () => {
  const caso = fs.readFileSync(path.join(__dirname, '..', 'build', 'caso_sar.js'), 'utf8'), idx = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'construir_index.py'), 'utf8');
  assert.match(caso, /bloqueSitrep\(\)/); assert.match(idx, /sitrep_sar\.js/);
});
