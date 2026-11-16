// Borrador de SITREP (informe de situación SAR) en el formato normalizado del Manual IAMSAR (vol. II, apéndice I; vol. III,
// apéndice D): forma breve con los párrafos A a F y forma completa con los párrafos G a N. El texto se arma con los datos
// del caso y el cuadro ambiental de la ficha; es un borrador para que el coordinador lo revise, complete y transmita.
const SAR_SITREP_TXT = {
  es: { peligro: 'SOCORRO', urgencia: 'URGENCIA', de: 'DE', para: 'PARA', sitrep: 'SAR SITREP NÚMERO', nd: 'NO INFORMADO',
    A: 'IDENTIDAD DE LA NAVE O PERSONA SINIESTRADA', B: 'POSICIÓN', C: 'SITUACIÓN', D: 'NÚMERO DE PERSONAS EN PELIGRO', E: 'AUXILIO REQUERIDO', F: 'CENTRO COORDINADOR',
    G: 'DESCRIPCIÓN DE LA NAVE SINIESTRADA', H: 'CONDICIONES METEOROLÓGICAS EN EL LUGAR', J: 'MEDIDAS INICIALES ADOPTADAS', K: 'ÁREA DE BÚSQUEDA', L: 'INSTRUCCIONES PARA LA COORDINACIÓN', M: 'PLANES FUTUROS', N: 'INFORMACIÓN ADICIONAL',
    fases: { incerfa: 'FASE DE INCERTIDUMBRE', alerfa: 'FASE DE ALERTA', detresfa: 'FASE DE PELIGRO' }, sinFase: 'FASE NO DECLARADA', incidente: 'HORA DEL INCIDENTE', ult: 'ÚLTIMA POSICIÓN CONOCIDA',
    viento: 'VIENTO', calma: 'CALMA', rachas: 'RACHAS', mar: 'MAR', fondo: 'MAR DE FONDO', del: 'DEL', vis: 'VISIBILIDAD', masDe: 'MÁS DE', agua: 'TEMPERATURA DEL AGUA', pron: 'PRONÓSTICO PUNTUAL DEL MODELO, SIN OBSERVACIÓN EN EL LUGAR',
    rect: 'RECTÁNGULO DE', centro: 'CENTRO', vertices: 'VÉRTICES', circ: 'CÍRCULO DE RADIO', enDatum: 'MN CENTRADO EN EL DÁTUM', valida: 'VÁLIDA PARA', masProb: 'POSICIÓN MÁS PROBABLE', patron: 'PATRÓN', mn: 'MN', s: 'S' },
  en: { peligro: 'DISTRESS', urgencia: 'URGENCY', de: 'FROM', para: 'TO', sitrep: 'SAR SITREP NUMBER', nd: 'NOT REPORTED',
    A: 'IDENTITY OF CASUALTY', B: 'POSITION', C: 'SITUATION', D: 'NUMBER OF PERSONS AT RISK', E: 'ASSISTANCE REQUIRED', F: 'COORDINATING RCC',
    G: 'DESCRIPTION OF CASUALTY', H: 'WEATHER ON SCENE', J: 'INITIAL ACTIONS TAKEN', K: 'SEARCH AREA', L: 'COORDINATING INSTRUCTIONS', M: 'FUTURE PLANS', N: 'ADDITIONAL INFORMATION',
    fases: { incerfa: 'UNCERTAINTY PHASE', alerfa: 'ALERT PHASE', detresfa: 'DISTRESS PHASE' }, sinFase: 'PHASE NOT DECLARED', incidente: 'TIME OF INCIDENT', ult: 'LAST KNOWN POSITION',
    viento: 'WIND', calma: 'CALM', rachas: 'GUSTS', mar: 'SEA', fondo: 'SWELL', del: 'FROM', vis: 'VISIBILITY', masDe: 'MORE THAN', agua: 'SEA TEMPERATURE', pron: 'MODEL POINT FORECAST, NO ON-SCENE OBSERVATION',
    rect: 'RECTANGLE', centro: 'CENTRE', vertices: 'CORNERS', circ: 'CIRCLE OF RADIUS', enDatum: 'NM CENTRED ON DATUM', valida: 'VALID FOR', masProb: 'MOST PROBABLE POSITION', patron: 'PATTERN', mn: 'NM', s: 'S' }
};
const SAR_MESES = { es: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'], en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] };
// Grupo fecha-hora UTC: 161906Z NOV 26.
function sarGrupoFechaHora(d, idioma) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z ${SAR_MESES[idioma][d.getUTCMonth()]} ${p(d.getUTCFullYear() % 100)}`;
}
// Posición en grados y minutos: 36-30.0S 073-24.0W.
function sarPosSitrep(ll) {
  const f = (v, n, pos, neg) => { const a = Math.abs(v); let g = Math.floor(a), m = Math.round((a - g) * 600) / 10; if (m >= 60) { g++; m = 0; } return `${String(g).padStart(n, '0')}-${m.toFixed(1).padStart(4, '0')}${v >= 0 ? pos : neg}`; };
  return `${f(ll[0], 2, 'N', 'S')} ${f(ll[1], 3, 'E', 'W')}`;
}
function sarSitrep(d) {
  const L = SAR_SITREP_TXT[d.idioma === 'en' ? 'en' : 'es'], id = d.idioma === 'en' ? 'en' : 'es', M = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toUpperCase(), o = v => M(v) || L.nd;
  const n1 = (v, dec = 0) => Number(v).toFixed(dec), r3 = v => String(Math.round(v) % 360).padStart(3, '0'), fase = d.fase && L.fases[d.fase];
  const lin = [d.fase === 'detresfa' ? L.peligro : L.urgencia, sarGrupoFechaHora(d.fecha, id), `${L.de}: ${o(d.de)}`, `${L.para}: ${o(d.para)}`, `${L.sitrep} ${d.numero || 1}`, ''];
  const P = (k, t) => lin.push(`${k}. ${L[k]}: ${t}`);
  P('A', o(d.identidad));
  P('B', sarPosSitrep(d.posicion) + (d.horaIncidente ? ` (${L.ult}, ${sarGrupoFechaHora(d.horaIncidente, id)})` : ''));
  P('C', [fase || L.sinFase, M(d.naturaleza), d.horaIncidente ? `${L.incidente} ${sarGrupoFechaHora(d.horaIncidente, id)}` : ''].filter(Boolean).join('. ') + '.');
  P('D', o(d.personas)); P('E', o(d.asistencia)); P('F', o(d.rcc));
  if (d.forma !== 'completa') return lin.join('\n');
  P('G', o(d.descripcion));
  const t = d.tiempo;
  if (t) { const x = [];
    x.push(t.viento == null ? null : t.viento < 1 ? `${L.viento} ${L.calma}` : `${L.viento} ${t.dir == null ? '' : r3(t.dir) + '/'}${n1(t.viento)} KT${t.racha != null && t.racha > t.viento + 2 ? ` ${L.rachas} ${n1(t.racha)} KT` : ''}`);
    x.push(t.ola == null ? null : `${L.mar} ${n1(t.ola, 1)} M${t.olaDir != null ? ` ${L.del} ${r3(t.olaDir)}` : ''}${t.olaPer != null ? ` ${n1(t.olaPer)} ${L.s}` : ''}`);
    x.push(t.fondo == null ? null : `${L.fondo} ${n1(t.fondo, 1)} M${t.fondoDir != null ? ` ${L.del} ${r3(t.fondoDir)}` : ''}${t.fondoPer != null ? ` ${n1(t.fondoPer)} ${L.s}` : ''}`);
    x.push(t.vis == null ? null : `${L.vis} ${t.vis >= 20000 ? L.masDe + ' 10' : n1(t.vis / 1852, 1)} ${L.mn}`);
    x.push(t.tsm == null ? null : `${L.agua} ${n1(t.tsm)} C`);
    P('H', x.filter(Boolean).join(', ') + `. ${L.pron}${t.hora ? ' ' + sarGrupoFechaHora(t.hora, id) : ''}.`); } else P('H', L.nd);
  P('J', o(d.acciones));
  const a = d.area;
  if (a) { const val = a.hora ? `, ${L.valida} ${sarGrupoFechaHora(a.hora, id)}` : '';
    P('K', (a.tipo === 'rect' ? `${L.rect} ${n1(a.largo, 1)} X ${n1(a.ancho, 1)} ${L.mn}${val}. ${L.centro} ${sarPosSitrep(a.centro)}. ${L.vertices}: ${a.vertices.map(sarPosSitrep).join(' / ')}`
      : `${L.circ} ${n1(a.radio, 1)} ${L.enDatum} ${sarPosSitrep(a.datum)}${val}`) + (a.masProbable ? `. ${L.masProb} ${sarPosSitrep(a.masProbable)}` : '') + (a.patron ? `. ${L.patron}: ${M(a.patron)}` : '') + '.'); } else P('K', L.nd);
  P('L', o(d.instrucciones)); P('M', o(d.planes)); P('N', o(d.adicional));
  return lin.join('\n');
}
if (typeof module !== 'undefined') module.exports = { SAR_SITREP_TXT, sarGrupoFechaHora, sarPosSitrep, sarSitrep };
