#!/bin/bash
# BORRADOR DE BOLETÍN DE BAHÍA «estilo especialista», desde este Mac con la suscripción de Claude (Claude Code), sin costo de API.
# Lo llama pronostico_ia.sh cada hora; trabaja una sola vez al día, entre las 09:00 y las 15:59 (hora de Chile), cuando
# GitHub ya preparó las entradas con el WRF + IA de la corrida 12Z de hoy (data/evaluacion/entradas_borrador.json).
#   1. descarga las entradas: por bahía, el WRF + IA, el oleaje WW3 por período y ejemplos de boletines del especialista;
#   2. le pide a Claude Code que redacte el boletín de las 16:00 de cada bahía imitando a los ejemplos;
#   3. sube el resultado al repositorio como data/borradores.json (la página Desarrollo lo muestra).
# Es un paso aislado: si algo falla, sale sin tocar los pronósticos WRF + IA.
# Variables que entrega pronostico_ia.sh: TRAB (carpeta de trabajo), CLAUDE (ejecutable), REPO.
set -u
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN      # siempre la suscripción, nunca la API pagada
ts() { date '+%Y-%m-%d %H:%M:%S'; }
: "${TRAB:?}" "${CLAUDE:?}" "${REPO:?}"
B="$TRAB/borrador"; mkdir -p "$B"
HOY=$(TZ=America/Santiago date +%Y-%m-%d)
HORA=$(TZ=America/Santiago date +%H); HORA=${HORA#0}
if [ -z "${MN_FORZAR_BORRADOR:-}" ]; then
  [ "$(cat "$B/hecho.txt" 2>/dev/null)" = "$HOY" ] && exit 0
  [ "$HORA" -ge 9 ] && [ "$HORA" -lt 16 ] || exit 0
fi

# 1. Entradas preparadas por GitHub (se publican con el sitio)
curl -fsS --max-time 40 "https://meteoia.cl/data/evaluacion/entradas_borrador.json?t=$(date +%s)" -o "$B/entradas.json" 2>/dev/null \
  || curl -fsS --max-time 40 "https://feliperifo-a11y.github.io/meteo_naval/data/evaluacion/entradas_borrador.json" -o "$B/entradas.json" 2>/dev/null \
  || { echo "$(ts) Borrador: sin entradas publicadas"; exit 0; }
grep -q "\"fecha_base\":\"$HOY\"" "$B/entradas.json" || { echo "$(ts) Borrador: entradas aún no son de hoy"; exit 0; }
if [ -z "${MN_FORZAR_BORRADOR:-}" ]; then
  grep -q '"listo":true' "$B/entradas.json" || { echo "$(ts) Borrador: esperando el WRF + IA de la corrida 12Z"; exit 0; }
fi

INSTR='Eres meteorólogo previsionista del Servicio Meteorológico de la Armada de Chile y redactas el pronóstico de bahía que se emite a las 16:00.
Lee con la herramienta Read el archivo entradas.json de la carpeta actual. Para cada bahía de "bahias":
- "objetivo" son los períodos que debes redactar (día 08–20 h y noche 20–08 h), con el oleaje del modelo WW3 en el punto de mar más cercano ("ww3": hs = altura significativa total mínima y máxima en m, mar_fondo con altura, período y dirección de procedencia, mar_viento = altura del mar de viento).
- "wrf_ia" es el pronóstico WRF + IA de esta mañana para la bahía (situación sinóptica y, por día, nubosidad, viento, precipitación y temperaturas): es la base del borrador.
- "ejemplos" son boletines anteriores del especialista para esa misma bahía, cada uno con lo que entregaban el WRF + IA y el WW3 cuando él lo escribió. Estúdialos: imita exactamente su redacción (orden de los elementos, términos de situación sinóptica como "Vaguada costera", "Prefrontal a frontal" o "Margen anticiclónico", nubosidad, "vis buena (10 km)", fenómenos, viento con rangos como "S/SW 5/10 kt", "rolando al", "ocasional", "rachas", y el estado del mar como "marejadilla a marejada (1.0/2.0 m) como mar de fondo del SW en área oceánica, rizada a marejadilla en bahía" o, en bahías interiores, solo el estado en bahía). Aprende también cómo ajusta lo que dice el modelo (por ejemplo, si redondea o amplía los rangos de viento, cómo pasa del oleaje del modelo al estado del mar en bahía, cuándo agrega rachas o rompiente en borde costero) y aplica ese mismo criterio a la situación de hoy.
- Si una bahía no tiene ejemplos, usa el estilo de los ejemplos de las otras bahías.
Para el estado del mar usa la escala de la Armada: llana, rizada, marejadilla (0,5–1,25 m), marejada (1,25–2,5 m), gruesa (2,5–4 m), muy gruesa (4–6 m).
Para cada período entrega: "situacion" (breve, estilo boletín), "texto" (la oración completa del período, como la escribe el especialista) y, en los períodos de día, "tmin" y "tmax" (°C, enteros). Agrega en "nota" una frase breve con lo que el meteorólogo debería revisar con más cuidado (por ejemplo, discrepancia entre el WRF + IA y el WW3).
No inventes fenómenos que las entradas no respalden. Español técnico, con la puntuación y el estilo de los ejemplos.'

ESQUEMA='{"type":"object","properties":{"bahias":{"type":"array","items":{"type":"object","properties":{"codigo":{"type":"string"},"nota":{"type":"string"},"periodos":{"type":"array","items":{"type":"object","properties":{"tipo":{"type":"string","enum":["dia","noche"]},"fecha":{"type":"string"},"situacion":{"type":"string"},"texto":{"type":"string"},"tmin":{"type":"number"},"tmax":{"type":"number"}},"required":["tipo","fecha","situacion","texto"]}}},"required":["codigo","periodos"]}}},"required":["bahias"]}'

# 2. Redacción con Claude Code (suscripción)
( cd "$B" && "$CLAUDE" -p "$INSTR" --allowedTools "Read" --output-format json --json-schema "$ESQUEMA" > "$B/res.json" 2> "$B/err.txt" ) \
  || { echo "$(ts) Borrador: Claude falló ($(head -c 200 "$B/err.txt"))"; exit 0; }

# 3. Armado de data/borradores.json (JavaScript de macOS)
osascript -l JavaScript - "$B" <<'JS' > "$B/armado.log" 2>&1
ObjC.import('Foundation');
function leer(p) { const s = $.NSString.stringWithContentsOfFileEncodingError(p, 4, null); return s.isNil() ? null : s.js; }
function escribir(p, t) { $(t).writeToFileAtomicallyEncodingError(p, true, 4, null); }
function run(argv) {
  const B = argv[0];
  const ent = JSON.parse(leer(B + '/entradas.json') || '{}');
  const r = JSON.parse(leer(B + '/res.json') || '{}');
  const so = r.structured_output || (typeof r.result === 'string' ? JSON.parse(r.result) : null);
  if (!so || !so.bahias || !so.bahias.length) throw new Error('sin resultado estructurado');
  const meta = {}; (ent.bahias || []).forEach(b => meta[b.codigo] = b);
  const bahias = so.bahias.map(b => { const m = meta[b.codigo] || {};
    return { codigo: b.codigo, nombre: m.nombre || b.codigo, nota: b.nota || '', periodos: b.periodos,
             entradas: { wrf_inicializacion: (m.wrf_ia || {}).inicializacion || null, ww3_punto: m.ww3_punto || null, ejemplos: (m.ejemplos || []).map(e => e.emitido) } }; });
  const ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  escribir(B + '/borradores.json', JSON.stringify({ version: 1, generado: ahora, fecha_base: ent.fecha_base, modelo_ia: 'Claude (suscripción, Claude Code)',
    wrf_inicializacion: ent.wrf_inicializacion_esperada, ww3_corrida: ent.ww3_corrida, pares_disponibles: ent.pares_disponibles, bahias }));
  return 'bahías ' + bahias.length;
}
JS
[ -s "$B/borradores.json" ] || { echo "$(ts) Borrador: no se pudo armar ($(tail -1 "$B/armado.log"))"; exit 0; }
echo "$(ts) Borrador: $(tail -1 "$B/armado.log")"
[ -n "${MN_PRUEBA:-}" ] && { echo "$(ts) PRUEBA: resultado en $B/borradores.json"; exit 0; }

# 4. Subida a GitHub (mismo token que los pronósticos WRF + IA)
TOKEN=$(security find-generic-password -s meteo_naval_github -a meteo_naval -w 2>/dev/null) || { echo "$(ts) Borrador: sin token de GitHub"; exit 0; }
API="https://api.github.com/repos/$REPO/contents/data/borradores.json"
H1="Authorization: Bearer $TOKEN"; H2="Accept: application/vnd.github+json"
SHA=$(curl -fs --max-time 30 -H "$H1" -H "$H2" "$API?ref=main" | grep -m1 '"sha"' | sed -E 's/.*"sha": *"([^"]+)".*/\1/')
printf '{"message":"Borrador de boletín %s (equipo local)","branch":"main","content":"%s"%s}' "$HOY" \
  "$(base64 -i "$B/borradores.json" | tr -d '\n')" "${SHA:+,\"sha\":\"$SHA\"}" > "$B/cuerpo.json"
COD=$(curl -sS --max-time 60 -o "$B/respuesta.json" -w '%{http_code}' -X PUT -H "$H1" -H "$H2" --data-binary @"$B/cuerpo.json" "$API")
if [ "$COD" = "200" ] || [ "$COD" = "201" ]; then echo "$HOY" > "$B/hecho.txt"; echo "$(ts) Borrador: subido"; else echo "$(ts) Borrador: GitHub respondió $COD"; fi
exit 0
