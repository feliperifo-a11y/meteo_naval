#!/bin/bash
# Instala en este Mac el VISOR LOCAL de hielo (carta SIGRID-3 del SHN frente a AMSR2). No programa nada: se usa a pedido.
# Requisitos: entorno ~/meteoia-ml con Python (el mismo del dataset semanal) y el archivo de cartas
# (instalar_archivo_hielo.sh). Agrega a ese entorno las librerías de lectura de shapefile, geometrías y proyecciones.
set -e
VDIR="$HOME/Library/Application Support/meteo_naval/visor_hielo"
URL="https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main"
PY="$HOME/meteoia-ml/bin/python"
[ -x "$PY" ] || { echo "Falta el entorno ~/meteoia-ml (Python). Créelo primero (uv venv ~/meteoia-ml)."; exit 1; }
mkdir -p "$VDIR/scripts" "$VDIR/data/geo" "$HOME/meteoia-ml/visor_hielo"
echo "1/3 Instalando librerías en ~/meteoia-ml…"
PAQ="pyshp shapely>=2.0 pyproj>=3.6 numpy pillow matplotlib requests"
if command -v uv >/dev/null 2>&1; then uv pip install -q --python "$PY" $PAQ; else "$PY" -m pip install -q $PAQ; fi
echo "2/3 Descargando el visor…"
curl -fsSL "$URL/mac/visor_hielo.py" -o "$VDIR/scripts/visor_hielo.py"
curl -fsSL "$URL/mac/visor_hielo.html" -o "$VDIR/scripts/visor_hielo.html"
curl -fsSL "$URL/scripts/hielo_amsr2.py" -o "$VDIR/scripts/hielo_amsr2.py"
curl -fsSL "$URL/data/geo/land.json" -o "$VDIR/data/geo/land.json"
cat > "$HOME/meteoia-ml/Visor de hielo.command" <<C
#!/bin/bash
"$PY" "$VDIR/scripts/visor_hielo.py" "\$@"
C
chmod +x "$HOME/meteoia-ml/Visor de hielo.command"
echo "3/3 Primer visor…"
if [ -f "$HOME/meteoia-ml/datos/hielo_shn/indice.csv" ]; then
  "$PY" "$VDIR/scripts/visor_hielo.py" || echo "No se pudo armar el visor todavía (¿hay cartas de estados de desarrollo archivadas?)."
else
  echo "Aún no hay cartas archivadas. Instale primero el archivo (instalar_archivo_hielo.sh) y vuelva a abrir el visor."
fi
echo; echo "Listo. Para abrir el visor más adelante: doble clic en ~/meteoia-ml/Visor de hielo.command"
echo "Los visores quedan en ~/meteoia-ml/visor_hielo/ (uso interno: no publicar las cartas del SHN)."
