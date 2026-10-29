#!/bin/bash
# Programa en este Mac el DATASET SEMANAL de aprendizaje (domingos 07:00). No toca los demás trabajos ni usa claves.
# Requisito: entorno ~/meteoia-ml con Python, pandas y pyarrow (uv venv ~/meteoia-ml).
# Nota: ~/meteoia-ml/meteo_naval queda como copia espejo del repositorio (se sobrescribe cada semana): no edite ahí.
set -e
DEST="$HOME/Library/Application Support/meteo_naval"
PLIST="$HOME/Library/LaunchAgents/cl.meteonaval.dataset.plist"
URL="https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/mac"
mkdir -p "$DEST" "$HOME/Library/LaunchAgents" "$HOME/meteoia-ml/datos"
[ -x "$HOME/meteoia-ml/bin/python" ] || { echo "Falta el entorno ~/meteoia-ml (Python). Créelo primero."; exit 1; }
"$HOME/meteoia-ml/bin/python" -c "import pandas, pyarrow" 2>/dev/null || { echo "Faltan pandas o pyarrow en ~/meteoia-ml."; exit 1; }
echo "1/3 Descargando el script…"
curl -fsSL "$URL/dataset_semanal.sh" -o "$DEST/dataset_semanal.sh" && chmod +x "$DEST/dataset_semanal.sh"
echo "2/3 Programando los domingos a las 07:00…"
cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cl.meteonaval.dataset</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DEST/dataset_semanal.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>$DEST/registro_dataset.log</string>
  <key>StandardErrorPath</key><string>$DEST/registro_dataset.log</string>
</dict></plist>
P
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "3/3 Primera construcción (uno o dos minutos)…"
/bin/bash "$DEST/dataset_semanal.sh" | tee -a "$DEST/registro_dataset.log"
echo; ls -lh "$HOME/meteoia-ml/datos"
echo; echo "Listo. Se repite cada domingo a las 07:00. Registro: $DEST/registro_dataset.log"
echo "Para desprogramar: launchctl bootout gui/\$(id -u) \"$PLIST\" && rm \"$PLIST\""
