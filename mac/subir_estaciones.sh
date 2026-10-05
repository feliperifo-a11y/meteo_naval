#!/bin/bash
# Descarga desde este Mac (en Chile) las observaciones publicadas en el meteomapa y las sube al
# repositorio como data/estaciones.json. GitHub republica la página automáticamente.
#   - Red de Capitanías de Puerto: observaciones/directemar
#   - Redes EMA y EMA Campbell: mapa, top, fichaEstacion (Campbell) y graficoEstacion (EMA)
# Lo ejecuta launchd cada 20 minutos. Se actualiza solo desde el repositorio.
set -u
REPO="feliperifo-a11y/meteo_naval"
API_METEO="${MN_API:-https://serviciosonline.directemar.cl/meteomapa/api/meteo}"
FUENTE="$API_METEO/observaciones/directemar"
RUTA="data/estaciones.json"
DIR="$HOME/Library/Application Support/meteo_naval"
YO="$DIR/subir_estaciones.sh"
UA="dashboard-meteo-publico/1.1 (equipo local)"
mkdir -p "$DIR"
ts() { date '+%Y-%m-%d %H:%M:%S'; }

# 0. Autoactualización: si el repositorio tiene una versión nueva y válida de este script, la usa.
if [ -z "${MN_ACTUALIZADO:-}" ] && [ -z "${MN_PRUEBA:-}" ]; then
  if curl -fsS --max-time 20 "https://raw.githubusercontent.com/$REPO/main/mac/subir_estaciones.sh" -o "$DIR/nuevo.sh" 2>/dev/null \
     && bash -n "$DIR/nuevo.sh" 2>/dev/null && ! cmp -s "$DIR/nuevo.sh" "$YO"; then
    mv "$DIR/nuevo.sh" "$YO" && chmod +x "$YO"
    echo "$(ts) Script actualizado desde el repositorio"
    MN_ACTUALIZADO=1 exec /bin/bash "$YO"
  fi
  rm -f "$DIR/nuevo.sh"
fi

if [ -z "${MN_PRUEBA:-}" ]; then
  TOKEN=$(security find-generic-password -s meteo_naval_github -a meteo_naval -w 2>/dev/null) \
    || { echo "$(ts) ERROR: no hay token guardado en el Llavero (ejecute instalar.sh)"; exit 1; }
fi

get() { curl -fsS --max-time 30 -A "$UA" "$1" 2>/dev/null; }
es_json() { case "$1" in \[*|\{*) return 0;; esac; return 1; }
# De una serie de graficoEstacion conserva solo la observación más reciente (la primera).
ultima() { sed -E 's/("observaciones":\[\{[^}]*\}).*/\1]}/'; }

# 1. Red de Capitanías de Puerto
if ! curl -fsS --max-time 60 -A "$UA" "$FUENTE" -o "$DIR/obs.json"; then
  echo "$(ts) ERROR: la fuente de estaciones no respondió"; exit 1
fi
if [ "$(head -c 1 "$DIR/obs.json")" != "[" ] || [ "$(wc -c < "$DIR/obs.json")" -lt 500 ]; then
  echo "$(ts) ERROR: respuesta inesperada de la fuente"; exit 1
fi

# 2. Redes EMA y EMA Campbell
MAPA=$(get "$API_METEO/mapa"); es_json "$MAPA" || MAPA=null
TOP=$(get "$API_METEO/top");   es_json "$TOP"  || TOP=null
IDS_MAPA=$(printf '%s' "$MAPA" | grep -oE '"CDuidestmeteo":[0-9]+' | grep -oE '[0-9]+' | sort -u)
IDS_TOP=$(printf '%s' "$TOP" | grep -oE '"cduidestmeteo":[0-9]+' | grep -oE '[0-9]+' | sort -u)

FICHAS=""   # Campbell (código >= 100000): ficha con el último dato
for id in $(printf '%s\n' $IDS_MAPA $IDS_TOP | sort -u); do
  [ "$id" -ge 100000 ] 2>/dev/null || continue
  r=$(get "$API_METEO/fichaEstacion/$id"); es_json "$r" || r=null
  FICHAS="$FICHAS${FICHAS:+,}\"$id\":$r"; sleep 0.3
  # Si la ficha viene vacía (la estación se atrasó), se toma el último dato de su serie.
  if [ "$r" = "[]" ] || [ "$r" = "null" ]; then
    P=""
    for p in 7 8 11 13 14 16; do
      g=$(get "$API_METEO/graficoEstacion/$id/$p" | ultima); es_json "$g" || g=null
      P="$P${P:+,}\"$p\":$g"; sleep 0.3
    done
    GRAF_C="${GRAF_C:-}${GRAF_C:+,}\"$id\":{$P}"
  fi
done
GRAF=""     # EMA activas (listadas en "top"): último valor de cada variable
for id in $IDS_TOP; do
  [ "$id" -lt 100000 ] 2>/dev/null || continue
  P=""
  for p in 7 8 11 13 14 16; do
    r=$(get "$API_METEO/graficoEstacion/$id/$p" | ultima); es_json "$r" || r=null
    P="$P${P:+,}\"$p\":$r"; sleep 0.3
  done
  GRAF="$GRAF${GRAF:+,}\"$id\":{$P}"
done
# Una vez al día: último dato de presión de todas las EMA (para saber desde cuándo no transmiten).
if [ -z "$(find "$DIR/historico.json" -mmin -1440 2>/dev/null)" ] && [ -n "$IDS_MAPA" ]; then
  H=""
  for id in $IDS_MAPA; do
    [ "$id" -lt 100000 ] 2>/dev/null || continue
    r=$(get "$API_METEO/graficoEstacion/$id/16" | ultima); es_json "$r" || r=null
    H="$H${H:+,}\"$id\":$r"; sleep 0.3
  done
  printf '{%s}' "$H" > "$DIR/historico.json"
fi
HIST=$(cat "$DIR/historico.json" 2>/dev/null); es_json "$HIST" || HIST=null

# 3. Archivo final (se valida antes de subir; si algo de las redes EMA viene mal, se sube sin ellas)
AHORA=$(date -u +%Y-%m-%dT%H:%M:%SZ)
armar() {
  printf '{"actualizado":"%s","fuente":"%s","origen":"equipo local","datos":' "$AHORA" "$FUENTE"
  cat "$DIR/obs.json"
  [ "${1:-}" = "con_ema" ] && printf ',"ema":{"mapa":%s,"top":%s,"fichas":{%s},"graficos":{%s},"graficos_campbell":{%s},"historico":%s}' \
    "$MAPA" "$TOP" "$FICHAS" "$GRAF" "${GRAF_C:-}" "$HIST"
  printf '}'
}
json_valido() {
  if command -v osascript >/dev/null; then
    osascript -l JavaScript -e "JSON.parse(\$.NSString.stringWithContentsOfFileEncodingError('$1', 4, null).js); 'ok'" >/dev/null 2>&1
  else python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$1" 2>/dev/null; fi
}
armar con_ema > "$DIR/estaciones.json"
if ! json_valido "$DIR/estaciones.json"; then
  echo "$(ts) AVISO: datos EMA con formato inesperado; se suben solo las Capitanías de Puerto"
  armar > "$DIR/estaciones.json"
fi

if [ -n "${MN_PRUEBA:-}" ]; then echo "$(ts) PRUEBA: archivo generado en $DIR/estaciones.json"; exit 0; fi

# 4. Subida al repositorio (API de contenidos de GitHub)
API="https://api.github.com/repos/$REPO/contents/$RUTA"
H1="Authorization: Bearer $TOKEN"; H2="Accept: application/vnd.github+json"; H3="X-GitHub-Api-Version: 2022-11-28"
SHA=$(curl -fs --max-time 30 -H "$H1" -H "$H2" -H "$H3" "$API?ref=main" | grep -m1 '"sha"' | sed -E 's/.*"sha": *"([^"]+)".*/\1/')
B64=$(base64 -i "$DIR/estaciones.json" | tr -d '\n')
printf '{"message":"Estaciones %s (equipo local)","branch":"main","content":"%s"%s}' \
  "$AHORA" "$B64" "${SHA:+,\"sha\":\"$SHA\"}" > "$DIR/cuerpo.json"
COD=$(curl -sS --max-time 60 -o "$DIR/respuesta.json" -w '%{http_code}' -X PUT -H "$H1" -H "$H2" -H "$H3" \
  --data-binary @"$DIR/cuerpo.json" "$API")
if [ "$COD" = "200" ] || [ "$COD" = "201" ]; then
  N_EMA=$(printf '%s' "$IDS_MAPA" | grep -c . | tr -d ' ')
  echo "$(ts) OK: $(grep -o '"nombre"' "$DIR/obs.json" | wc -l | tr -d ' ') Capitanías + $N_EMA EMA subidas"
else
  echo "$(ts) ERROR: GitHub respondió $COD — $(head -c 300 "$DIR/respuesta.json")"; exit 1
fi
