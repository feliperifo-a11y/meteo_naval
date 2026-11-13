#!/bin/bash
# TRADUCCIÓN AL INGLÉS de los pronósticos redactados en español (análisis WRF y borradores WRF + IA), para la versión en
# inglés del sitio. Desde este Mac con la suscripción de Claude (Claude Code), sin costo de API.
# Lo llama pronostico_ia.sh: después del borrador de cada día y después de cada corrida WRF nueva.
#   1. reúne los textos en español de data/wrf_ia.json y data/borradores.json que aún no tienen traducción;
#   2. le pide a Claude Code que los traduzca con el glosario marítimo, en grupos de 100;
#   3. sube el diccionario español → inglés al repositorio como data/traducciones_en.json (lo lee build/i18n.js).
# Es un paso aislado: no cambia los pronósticos ni sus instrucciones, y si falla la página sigue mostrando el texto en español.
# Variables que entrega pronostico_ia.sh: TRAB (carpeta de trabajo), CLAUDE (ejecutable), REPO.
set -u
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN      # siempre la suscripción, nunca la API pagada
ts() { date '+%Y-%m-%d %H:%M:%S'; }
: "${TRAB:?}" "${CLAUDE:?}" "${REPO:?}"
E="$TRAB/en"; mkdir -p "$E"
RAW="https://raw.githubusercontent.com/$REPO/main/data"
[ -s "$TRAB/wrf_ia.json" ] || curl -fsS --max-time 30 "$RAW/wrf_ia.json" -o "$TRAB/wrf_ia.json" 2>/dev/null || true
[ -s "$TRAB/borrador/borradores.json" ] && cp "$TRAB/borrador/borradores.json" "$E/borradores.json" || curl -fsS --max-time 30 "$RAW/borradores.json" -o "$E/borradores.json" 2>/dev/null || true
[ -s "$E/traducciones.json" ] || curl -fsS --max-time 30 "$RAW/traducciones_en.json" -o "$E/traducciones.json" 2>/dev/null || echo '{}' > "$E/traducciones.json"

# Instrucciones del traductor (nombres propios para no confundirlas con las del pronóstico, cuya huella identifica la versión evaluada)
TRAD_INSTR='You are a marine meteorologist translating Chilean Navy bay forecasts from Spanish into English for mariners.
Read the file pendientes.json in the current folder with the Read tool. It is a JSON array of Spanish strings (forecast sentences, synoptic situations, wind descriptions and short notes).
Translate every string into concise technical English, in the style of marine weather bulletins. Rules:
- Keep numbers, ranges (10/15), units (kt, m, hPa, °C, km), compass points (N, NE, S/SW), UTC and local times, and place names exactly as they are. Write decimals with a point (1,5 m becomes 1.5 m). Write geopotential metres as gpm (5820 mgp becomes 5820 gpm) and PNM as MSLP.
- Do not add, omit or interpret information. Keep the same order of elements and the same telegraphic style.
- Use WMO marine terminology. Glossary. Sea state: llana = calm (glassy); rizada = rippled; marejadilla = slight; marejada = moderate; gruesa = rough; muy gruesa = very rough; mar de fondo = swell; mar de viento = wind sea; rompiente = breakers; borde costero = coastline; área oceánica = offshore area; bahía = bay.
  Synoptic: vaguada costera = coastal trough; vaguada en altura = upper-level trough; dorsal = ridge; margen anticiclónico = anticyclonic margin; anticiclón = anticyclone; sistema frontal = frontal system; prefrontal = pre-frontal; baja segregada = cut-off low; circulación ciclónica = cyclonic circulation.
  Sky and weather: cubierto = overcast; nublado = cloudy; parcial = partly cloudy; despejado = clear; nubosidad baja/media/alta = low/mid-level/high cloud; neblina = mist; niebla = fog; bruma = haze; llovizna = drizzle; lluvia = rain; chubascos = showers; chubascos de nieve = snow showers; aguanieve = sleet; nieve = snow; granizo = hail; trazas = traces; débil = light; moderado = moderate; fuerte = heavy (precipitation) or strong (wind).
  Wind: calma = calm; racha = gust; ocasional = occasionally; temporal = gale; aumentando = increasing; disminuyendo = decreasing; rolando a = veering to when the change of direction is clockwise (for example S to SW or W to NW), backing to when it is anticlockwise (for example NW to W or SW to S), and shifting to when the change is 180 degrees or the sense is not clear; madrugada = early morning; mañana = morning; tarde = afternoon; noche = night.
  Visibility: vis buena = good visibility; vis regular = moderate visibility; vis mala = poor visibility.
Return one item per input string, with "i" equal to the position of the string in the array (starting at 0) and "en" with its translation.'
TRAD_ESQUEMA='{"type":"object","properties":{"traducciones":{"type":"array","items":{"type":"object","properties":{"i":{"type":"integer"},"en":{"type":"string"}},"required":["i","en"]}}},"required":["traducciones"]}'

# JavaScript de macOS: «pendientes» reúne lo que falta traducir; «fusionar» incorpora la respuesta y arma el archivo publicado.
paso() {
osascript -l JavaScript - "$TRAB" "$1" <<'JS' 2>&1
ObjC.import('Foundation');
function leer(p) { const s = $.NSString.stringWithContentsOfFileEncodingError(p, 4, null); return s.isNil() ? null : s.js; }
function escribir(p, t) { $(t).writeToFileAtomicallyEncodingError(p, true, 4, null); }
function run(argv) { return nucleo(argv[0], argv[1], leer, escribir); }
/*NUCLEO*/
function nucleo(T, modo, leer, escribir) {
  const E = T + '/en', json = (p, d) => { try { return JSON.parse(leer(p) || 'null') || d; } catch (e) { return d; } };
  const cache = (json(E + '/traducciones.json', {}).t) || {};
  // Textos en uso: análisis WRF (situación, detalle de nubosidad, viento y precipitación por día) y borradores WRF + IA.
  const uso = new Set(), poner = s => { if (typeof s === 'string') { s = s.replace(/\s+/g, ' ').trim(); if (s.length > 2 && /[a-záéíóúñ]{3}/i.test(s)) uso.add(s); } };
  for (const b of json(T + '/wrf_ia.json', {}).bahias || []) { const p = b.pronostico || {}; poner(p.situacion_sinoptica); for (const d of p.dias || []) { poner(d.nubosidad_detalle); poner(d.viento); poner(d.precipitacion); } }
  for (const b of json(E + '/borradores.json', {}).bahias || []) { poner(b.nota); for (const p of b.periodos || []) { poner(p.situacion); poner(p.texto); } }
  if (modo === 'fusionar') {
    const pend = json(E + '/pendientes.json', []), r = json(E + '/res.json', {});
    let so = r.structured_output; if (!so && typeof r.result === 'string') { try { so = JSON.parse(r.result); } catch (e) { so = null; } }
    let n = 0; for (const x of (so && so.traducciones) || []) { const es = pend[x.i]; if (es && typeof x.en === 'string' && x.en.trim()) { cache[es] = x.en.trim(); n++; } }
    if (!n) return 'fusion 0';
  }
  // El archivo publicado conserva solo las traducciones de los textos en uso.
  const t = {}; let faltan = []; for (const s of uso) { if (cache[s]) t[s] = cache[s]; else faltan.push(s); }
  const previo = leer(E + '/traducciones.json') || '', nuevo = JSON.stringify({ version: 1, idioma: 'en', n: Object.keys(t).length, t });
  const cambio = JSON.stringify((json(E + '/traducciones.json', {}).t) || {}) !== JSON.stringify(t);
  if (cambio || !previo) escribir(E + '/traducciones.json', nuevo.replace('{"version"', '{"generado":"' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '","version"'));
  escribir(E + '/pendientes.json', JSON.stringify(faltan.slice(0, 100)));
  return (modo === 'fusionar' ? 'fusion' : 'pendientes') + ' ' + faltan.length + ' de ' + uso.size + (cambio ? ' cambio' : '');
}
JS
}

R=$(paso pendientes | tail -1); N=$(echo "$R" | awk '{print $2}'); CAMBIO=0
case "$R" in pendientes*) ;; *) echo "$(ts) Inglés: no se pudo revisar ($R)"; exit 0;; esac
case "$R" in *cambio) CAMBIO=1;; esac
VUELTA=0
while [ "${N:-0}" -gt 0 ] && [ "$VUELTA" -lt 8 ]; do
  VUELTA=$((VUELTA+1))
  ( cd "$E" && "$CLAUDE" -p "$TRAD_INSTR" --allowedTools "Read" --output-format json --json-schema "$TRAD_ESQUEMA" > "$E/res.json" 2> "$E/err.txt" ) \
    || { echo "$(ts) Inglés: Claude falló ($(head -c 200 "$E/err.txt"))"; break; }
  R=$(paso fusionar | tail -1); ANT=$N; N=$(echo "$R" | awk '{print $2}')
  case "$R" in fusion\ 0|"") echo "$(ts) Inglés: respuesta sin traducciones"; break;; esac
  CAMBIO=1; [ "${N:-0}" -lt "$ANT" ] || break
done
[ "$CAMBIO" = "1" ] || exit 0
echo "$(ts) Inglés: $(grep -o '"n":[0-9]*' "$E/traducciones.json" | head -1 | cut -d: -f2) textos traducidos, ${N:-0} pendientes"
[ -n "${MN_PRUEBA:-}" ] && { echo "$(ts) PRUEBA: resultado en $E/traducciones.json"; exit 0; }

# Subida a GitHub (mismo token que los pronósticos WRF + IA)
TOKEN=$(security find-generic-password -s meteo_naval_github -a meteo_naval -w 2>/dev/null) || { echo "$(ts) Inglés: sin token de GitHub"; exit 0; }
API="https://api.github.com/repos/$REPO/contents/data/traducciones_en.json"
H1="Authorization: Bearer $TOKEN"; H2="Accept: application/vnd.github+json"
SHA=$(curl -fs --max-time 30 -H "$H1" -H "$H2" "$API?ref=main" | grep -m1 '"sha"' | sed -E 's/.*"sha": *"([^"]+)".*/\1/')
printf '{"message":"Traducciones al inglés %s (equipo local)","branch":"main","content":"%s"%s}' "$(date -u +%Y-%m-%dT%H:%MZ)" \
  "$(base64 -i "$E/traducciones.json" | tr -d '\n')" "${SHA:+,\"sha\":\"$SHA\"}" > "$E/cuerpo.json"
COD=$(curl -sS --max-time 60 -o "$E/respuesta.json" -w '%{http_code}' -X PUT -H "$H1" -H "$H2" --data-binary @"$E/cuerpo.json" "$API")
if [ "$COD" = "200" ] || [ "$COD" = "201" ]; then echo "$(ts) Inglés: subido"; else echo "$(ts) Inglés: GitHub respondió $COD"; fi
exit 0
