#!/bin/bash
# Programa en este Mac el ARCHIVO DE CARTAS DE HIELO del SHN (cada 6 horas). No toca los demás trabajos ni usa claves.
# Guarda las cartas SIGRID-3 nuevas y sus imágenes en ~/meteoia-ml/datos/hielo_shn, y el AMSR2 de Bremen de las
# mismas fechas en ~/meteoia-ml/datos/amsr2. Es un archivo interno para entrenamiento futuro: no se publica nada.
set -e
DEST="$HOME/Library/Application Support/meteo_naval"
PLIST="$HOME/Library/LaunchAgents/cl.meteonaval.hielo-shn.plist"
URL="https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/mac"
mkdir -p "$DEST" "$HOME/Library/LaunchAgents" "$HOME/meteoia-ml/datos"
if [ -x "$HOME/meteoia-ml/bin/python" ]; then PY="$HOME/meteoia-ml/bin/python"; else PY="$(command -v python3 || true)"; fi
[ -n "$PY" ] || { echo "No hay Python 3 en este Mac. Instale las herramientas de línea de comandos (xcode-select --install)."; exit 1; }
echo "1/3 Descargando el script…"
curl -fsSL "$URL/archivo_hielo_shn.py" -o "$DEST/archivo_hielo_shn.py"
echo "2/3 Programando cada 6 horas…"
cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cl.meteonaval.hielo-shn</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$DEST/archivo_hielo_shn.py</string></array>
  <key>StartInterval</key><integer>21600</integer>
  <key>RunAtLoad</key><false/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>$DEST/registro_hielo_shn.log</string>
  <key>StandardErrorPath</key><string>$DEST/registro_hielo_shn.log</string>
</dict></plist>
P
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "3/3 Primera descarga (las cartas pesan hasta unos 25 MB cada una; puede tardar un par de minutos)…"
"$PY" "$DEST/archivo_hielo_shn.py" | tee -a "$DEST/registro_hielo_shn.log"
echo; du -sh "$HOME/meteoia-ml/datos/hielo_shn" "$HOME/meteoia-ml/datos/amsr2" 2>/dev/null || true
echo; echo "Listo. Se repite cada 6 horas mientras el Mac esté encendido. Registro: $DEST/registro_hielo_shn.log"
echo "Para desprogramar: launchctl bootout gui/\$(id -u) \"$PLIST\" && rm \"$PLIST\""
