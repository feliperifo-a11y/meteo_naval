// ============================ Asistente IA local (página Desarrollo) ============================
// Chat con el asistente que corre en el Mac de la casa (mac/asistente_local.py + Ollama), publicado por un túnel de Cloudflare en
// ASISTENTE_URL y protegido con Cloudflare Access. El modelo no calcula: llama a herramientas que leen los datos de MeteoIA y
// Open-Meteo y redacta con esos números. Si el Mac está apagado o no hay sesión de Access, el panel lo indica y el resto de la página
// sigue igual. La consulta va como text/plain para evitar la petición previa (OPTIONS), que Access bloquearía.
const ASISTENTE_URL = 'https://asistente.meteoia.cl';
function crearAsistenteIA(L, map, h) {
  const escH = h.escH;
  const card = document.createElement('section');
  card.className = 'card mar-card asi-card'; card.id = 'asistenteIA'; card.hidden = true;
  card.innerHTML = `<div class="mar-cab"><h2>Asistente IA</h2><span class="mar-etq asi-etq">Prototipo · IA local</span>
      <button type="button" class="mar-min" aria-label="Minimizar panel" title="Minimizar / ampliar">▾</button><button type="button" class="mar-cerrar" aria-label="Cerrar panel">✕</button></div>
    <p class="mar-sub asi-est" aria-live="polite">Conectando con el asistente…</p>
    <div class="asi-ej" hidden>
      <button type="button">¿Cómo estará el mar en Valparaíso en tres días?</button>
      <button type="button">¿Hay avisos vigentes para Talcahuano?</button>
      <button type="button">Mejor ruta de Puerto Montt a Punta Arenas a 12 nudos, zarpando mañana a las 08:00</button>
      <button type="button">Pronóstico WRF + IA de la bahía de Puerto Montt</button></div>
    <div class="asi-chat" aria-live="polite"></div>
    <form class="asi-f" hidden><textarea rows="2" maxlength="1000" placeholder="Pregunte por un lugar y día, avisos, una bahía o una ruta…"></textarea><button type="submit">Enviar</button></form>
    <details class="mar-crit"><summary>Cómo funciona</summary><div>
      <p>Un modelo de lenguaje que corre en un equipo local (Ollama, sin servicios de pago) interpreta la pregunta y llama a una de cuatro herramientas: condición en un punto (Open-Meteo: viento ECMWF IFS, oleaje del modelo marino), avisos vigentes y próximos (los mismos de esta página), pronóstico WRF + IA de bahía y comparación de las alternativas de las rutas tipo. La respuesta se redacta solo con esos datos y cita la fuente y la hora de consulta.</p>
      <p>Atiende una consulta a la vez; cada respuesta puede tardar de 10 a 40 s. El estado del mar se expresa con la escala de la Armada. Las trazas de ruta son referenciales y no reemplazan la carta náutica ni el Derrotero.</p>
      <p><b>Información referencial generada por IA con datos de modelos. No reemplaza los pronósticos ni los avisos oficiales de la Armada de Chile.</b></p></div></details>`;
  const wrap = document.getElementById('mapWrap');
  wrap.appendChild(card);
  L.DomEvent.disableClickPropagation(card); L.DomEvent.disableScrollPropagation(card);
  const est = card.querySelector('.asi-est'), chat = card.querySelector('.asi-chat'), form = card.querySelector('.asi-f'),
        q = form.querySelector('textarea'), ej = card.querySelector('.asi-ej');
  const grupo = L.layerGroup();
  const hist = [];
  let listo = false, ocupado = false;
  const api = { abierto: false, abrir, cerrar };
  card.querySelector('.mar-cerrar').onclick = () => cerrar();
  card.querySelector('.mar-min').onclick = () => card.classList.toggle('mar-minimizada');

  function cerrar() { card.hidden = true; api.abierto = false; wrap.classList.remove('mar-abierto'); map.removeLayer(grupo); }
  function abrir() {
    card.hidden = false; api.abierto = true; wrap.classList.add('mar-abierto'); grupo.addTo(map);
    if (!listo) conectar();
  }

  async function conectar() {
    est.textContent = 'Conectando con el asistente…';
    try {
      const r = await fetch(ASISTENTE_URL + '/salud', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const s = await r.json();
      listo = true;
      est.innerHTML = `Conectado · modelo <b>${escH(s.modelo)}</b>${s.ollama ? '' : ' · <span class="asi-mal">el motor de IA no responde en el equipo local</span>'}`;
      form.hidden = false; if (!chat.children.length) ej.hidden = false;
      q.focus();
    } catch (e) {
      // Sin sesión de Cloudflare Access el servidor redirige al inicio de sesión y el navegador lo informa como error de red.
      est.innerHTML = `No hay conexión con el asistente. Si es la primera vez, <a href="${ASISTENTE_URL}/" target="_blank" rel="noopener">inicie sesión</a> con su correo autorizado y luego
        <button type="button" class="asi-reint">reintente</button>. Si ya inició sesión, el equipo local puede estar apagado o sin internet.`;
      est.querySelector('.asi-reint').onclick = conectar;
      form.hidden = true; ej.hidden = true;
    }
  }

  function burbuja(txt, cls) {
    const d = document.createElement('div'); d.className = 'asi-m ' + cls; d.textContent = txt;
    chat.appendChild(d); d.scrollIntoView({ block: 'nearest' }); return d;
  }

  const NOMBRES = { condicion_punto: 'condición en el punto', avisos_vigentes: 'avisos', pronostico_bahia: 'WRF + IA', comparar_rutas: 'rutas' };
  function marcar(herr) {
    const pts = herr.map(x => x.pos).filter(p => Array.isArray(p) && isFinite(p[1]) && isFinite(p[2]));
    if (!pts.length) return;
    grupo.clearLayers();
    pts.forEach(([n, la, lo]) => L.circleMarker([la, lo], { radius: 8, color: '#0f2a44', weight: 2, fillColor: '#3fa9f5', fillOpacity: .9 })
      .bindTooltip(escH(n), { direction: 'top' }).addTo(grupo));
    const [, la, lo] = pts[pts.length - 1];
    map.flyTo([la, lo], Math.max(map.getZoom(), 8), { duration: .8 });
  }

  async function enviar(t) {
    t = (t || '').trim();
    if (!t || ocupado) return;
    ocupado = true; ej.hidden = true; form.querySelector('button').disabled = true;
    burbuja(t, 'asi-u'); q.value = '';
    const d = burbuja('Consultando datos…', 'asi-a asi-espera');
    try {
      const r = await fetch(ASISTENTE_URL + '/preguntar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ pregunta: t, historial: hist.slice(-6) }), signal: AbortSignal.timeout(180000) });
      const j = await r.json();
      d.classList.remove('asi-espera');
      d.textContent = j.respuesta || j.error || 'Sin respuesta.';
      const herr = j.herramientas || [];
      const pie = document.createElement('div'); pie.className = 'asi-h';
      pie.textContent = [herr.map(x => NOMBRES[x.nombre] || x.nombre).join(' → '), j.segundos ? `${String(j.segundos).replace('.', ',')} s` : ''].filter(Boolean).join(' · ');
      d.appendChild(pie);
      if (j.respuesta) hist.push({ rol: 'usuario', texto: t }, { rol: 'asistente', texto: j.respuesta });
      marcar(herr);
    } catch (e) {
      d.classList.remove('asi-espera');
      d.textContent = 'Se perdió la conexión con el asistente (' + (e.name === 'TimeoutError' ? 'sin respuesta en 3 min' : e.message) + ').';
      listo = false; conectar();
    } finally {
      ocupado = false; form.querySelector('button').disabled = false;
    }
  }
  form.onsubmit = e => { e.preventDefault(); enviar(q.value); };
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(q.value); } });
  ej.querySelectorAll('button').forEach(b => { b.onclick = () => enviar(b.textContent); });
  return api;
}
