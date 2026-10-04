#!/bin/bash
# Descarga las observaciones de la red de estaciones desde este Mac (en Chile) y las sube al
# repositorio como data/estaciones.json. GitHub republica la página automáticamente.
# Lo ejecuta launchd cada 20 minutos (ver instalar.sh). No requiere git ni Python.
set -u
REPO="feliperifo-a11y/meteo_naval"
FUENTE="https://serviciosonline.directemar.cl/meteomapa/api/meteo/observaciones/directemar"
RUTA="data/estaciones.json"
DIR="$HOME/Library/Application Support/meteo_naval"
mkdir -p "$DIR"
ts() { date '+%Y-%m-%d %H:%M:%S'; }

TOKEN=$(security find-generic-password -s meteo_naval_github -a meteo_naval -w 2>/dev/null) \
  || { echo "$(ts) ERROR: no hay token guardado en el Llavero (ejecute instalar.sh)"; exit 1; }

# 1. Observaciones
if ! curl -fsS --max-time 60 -A "dashboard-meteo-publico/1.0 (equipo local)" "$FUENTE" -o "$DIR/obs.json"; then
  echo "$(ts) ERROR: la fuente de estaciones no respondió"; exit 1
fi
if [ "$(head -c 1 "$DIR/obs.json")" != "[" ] || [ "$(wc -c < "$DIR/obs.json")" -lt 500 ]; then
  echo "$(ts) ERROR: respuesta inesperada de la fuente"; exit 1
fi
AHORA=$(date -u +%Y-%m-%dT%H:%M:%SZ)
{ printf '{"actualizado":"%s","fuente":"%s","origen":"equipo local","datos":' "$AHORA" "$FUENTE"
  cat "$DIR/obs.json"; printf '}'; } > "$DIR/estaciones.json"

# 2. Subida al repositorio (API de contenidos de GitHub)
API="https://api.github.com/repos/$REPO/contents/$RUTA"
H1="Authorization: Bearer $TOKEN"; H2="Accept: application/vnd.github+json"; H3="X-GitHub-Api-Version: 2022-11-28"
SHA=$(curl -fs --max-time 30 -H "$H1" -H "$H2" -H "$H3" "$API?ref=main" | grep -m1 '"sha"' | sed -E 's/.*"sha": *"([^"]+)".*/\1/')
B64=$(base64 -i "$DIR/estaciones.json" | tr -d '\n')
printf '{"message":"Estaciones %s (equipo local)","branch":"main","content":"%s"%s}' \
  "$AHORA" "$B64" "${SHA:+,\"sha\":\"$SHA\"}" > "$DIR/cuerpo.json"
COD=$(curl -sS --max-time 60 -o "$DIR/respuesta.json" -w '%{http_code}' -X PUT -H "$H1" -H "$H2" -H "$H3" \
  --data-binary @"$DIR/cuerpo.json" "$API")
if [ "$COD" = "200" ] || [ "$COD" = "201" ]; then
  echo "$(ts) OK: $(grep -o '"nombre"' "$DIR/obs.json" | wc -l | tr -d ' ') estaciones subidas"
else
  echo "$(ts) ERROR: GitHub respondió $COD — $(head -c 300 "$DIR/respuesta.json")"; exit 1
fi
