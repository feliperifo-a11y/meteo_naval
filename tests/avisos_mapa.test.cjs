const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const ahora = Date.parse('2026-10-24T16:00:00Z');
const zona = extra => ({ desde: '2026-10-24T12:00:00Z', hasta: '2026-10-25T12:00:00Z', nombre: 'Sector central', detalle: 'Condiciones que no deben mostrarse', ...extra });
const aviso = { tipo: 'Aviso de temporal', sector: 'Zona X', resumen: 'Resumen que no debe mostrarse', url: 'https://meteoarmada.directemar.cl/meteo/zona-x' };
const escapar = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function preparar(a = aviso, z = zona(), tiempo = ahora) {
  const timers = new Map(); let reloj = tiempo, sec = 0;
  const nodo = { hovered: false, focused: false, matches() { return this.hovered; }, contains() { return this.focused; }, closest() { return null; } };
  const capa = { abierto: false, html: null, eventos: {}, tooltip: true,
    unbindTooltip() { this.tooltip = false; },
    bindPopup(html, options) { this.html = html; this.popup = { options, getElement: () => nodo }; return this; },
    getPopup() { return this.popup; },
    openPopup(pos) { this.abierto = true; this.pos = pos; this.eventos.popupopen?.(); },
    closePopup() { this.abierto = false; this.eventos.popupclose?.(); },
    on(events) { Object.assign(this.eventos, events); }
  };
  class Reloj extends Date { static now() { return reloj; } }
  const contexto = { URL, Date: Reloj, document: { activeElement: {} },
    setTimeout: cb => { timers.set(++sec, cb); return sec; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'build/avisos_mapa.js'), 'utf8'), contexto);
  const configurado = contexto.configurarAvisoInteractivo(capa, a, z, escapar, d => d.toISOString(), tiempo);
  return { capa, nodo, timers, configurado, hora: t => { reloj = t; }, pasar: () => capa.eventos.mouseover({ latlng: [0, 0] }),
    agotar() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(cb => cb()); } };
}
test('inicia sin fichas; al pasar el cursor solo muestra título, vigencia y enlace oficial', () => {
  const h = preparar();
  assert.equal(h.configurado, true); assert.equal(h.capa.abierto, false);
  h.pasar(); assert.equal(h.capa.abierto, true); assert.equal(h.capa.tooltip, false);
  assert.match(h.capa.html, /Aviso de temporal/);
  assert.match(h.capa.html, /Vigencia: 2026-10-24T12:00:00.000Z → 2026-10-25T12:00:00.000Z/);
  assert.match(h.capa.html, /href="https:\/\/meteoarmada.directemar.cl\/meteo\/zona-x" target="_blank" rel="noopener noreferrer">Pronóstico oficial/);
  assert.doesNotMatch(h.capa.html, /Condiciones|Resumen|av-resumen-texto|av-resumen-sector|<small>/);
  assert.equal(h.capa.popup.options.autoPan, false);
});
test('permite mover el cursor desde la geometría al enlace y cierra al salir de ambos', () => {
  const h = preparar(); h.pasar(); h.capa.eventos.mouseout();
  assert.equal(h.timers.size, 1); h.nodo.onmouseenter(); h.agotar();
  assert.equal(h.capa.abierto, true);
  h.nodo.onmouseleave(); h.agotar(); assert.equal(h.capa.abierto, false);
});
test('mantiene el enlace accesible con foco y permite abrir la ficha al tocar el área', () => {
  const h = preparar(); h.capa.eventos.click({ latlng: [1, 2] });
  assert.equal(h.capa.abierto, true); assert.deepEqual(h.capa.pos, [1, 2]);
  h.nodo.focused = true; h.capa.eventos.mouseout(); h.agotar(); assert.equal(h.capa.abierto, true);
  h.nodo.focused = false; h.nodo.onfocusout(); h.agotar(); assert.equal(h.capa.abierto, false);
});
test('no añade fichas a próximos o expirados y vuelve a comprobar la hora al abrir', () => {
  assert.equal(preparar(aviso, zona({ desde: '2026-10-25T12:00:00Z', hasta: '2026-10-26T12:00:00Z' })).configurado, false);
  assert.equal(preparar(aviso, zona({ hasta: '2026-10-24T15:59:59Z' })).configurado, false);
  assert.equal(preparar(aviso, zona({ desde: 'inválido' })).configurado, false);
  const h = preparar(); h.hora(Date.parse(zona().hasta) + 1); h.pasar(); assert.equal(h.capa.abierto, false);
  assert.equal(preparar(aviso, zona(), Date.parse(zona().desde)).configurado, true);
  assert.equal(preparar(aviso, zona(), Date.parse(zona().hasta)).configurado, true);
});
test('retira la ficha y cancela su temporizador al ocultar la geometría', () => {
  const h = preparar(); h.pasar(); h.capa.eventos.mouseout(); h.capa.eventos.remove();
  assert.equal(h.capa.abierto, false); assert.equal(h.timers.size, 0);
});
test('escapa el título, usa enlaces oficiales HTTPS e identifica la alerta calculada sin texto extra', () => {
  const h = preparar({ ...aviso, tipo: '<img src=x>', url: 'javascript:alert(1)', pagina: aviso.url });
  assert.doesNotMatch(h.capa.html, /<img|javascript:/); assert.match(h.capa.html, /&lt;img src=x&gt;/);
  assert.match(h.capa.html, /href="https:\/\/meteoarmada.directemar.cl/);
  assert.doesNotMatch(preparar({ ...aviso, url: 'https://directemar.cl.ejemplo.com/falso' }).capa.html, /<a /);
  assert.match(preparar({ ...aviso, zona_ix: true }).capa.html, /Alerta MeteoIA · Zona IX/);
});
test('la portada y el dashboard usan las geometrías, sin tarjetas permanentes', () => {
  for (const p of ['build/plantilla.html', 'build/plantilla_v2.html']) {
    const s = fs.readFileSync(path.join(root, p), 'utf8');
    assert.match(s, /configurarAvisoInteractivo\(lyr, a, z, escH,/);
    assert.doesNotMatch(s, /crearResumenAviso|avResumenPane/);
  }
  for (const p of ['index.html', 'dashboard.html']) {
    const s = fs.readFileSync(path.join(root, p), 'utf8');
    assert.match(s, /function configurarAvisoInteractivo/);
    assert.match(s, /\.aviso-hover \.leaflet-popup-content-wrapper/);
    assert.doesNotMatch(s, /crearResumenAviso|avResumenPane|\/\*AVISOS_MAPA_(CSS|JS)\*\//);
  }
});
