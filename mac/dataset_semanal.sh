#!/bin/bash
# DATASET SEMANAL de aprendizaje (Mac mini): actualiza la copia del repositorio y reconstruye ~/meteoia-ml/datos/*.parquet.
# Lo programa mac/instalar_dataset.sh (launchd cl.meteonaval.dataset, domingos 07:00). No sube nada ni usa claves.
ML="$HOME/meteoia-ml"
REPO="$ML/meteo_naval"
PY="$ML/bin/python"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
[ -x "$PY" ] || { echo "$(ts) Falta el entorno Python en $ML"; exit 0; }
if [ ! -d "$REPO/.git" ]; then
  git clone -q https://github.com/feliperifo-a11y/meteo_naval.git "$REPO" || { echo "$(ts) No se pudo clonar el repositorio"; exit 0; }
fi
cd "$REPO" || exit 0
[ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ] && git fetch -q --unshallow origin
git fetch -q origin main && git reset -q --hard origin/main || echo "$(ts) Aviso: no se pudo actualizar la copia; se usa la existente"
"$PY" ml/construir_dataset.py
exit 0
