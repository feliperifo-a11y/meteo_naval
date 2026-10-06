#!/bin/bash
# Instala en este Mac el envío automático de datos de estaciones al dashboard (cada 20 minutos).
set -e
DEST="$HOME/Library/Application Support/meteo_naval"
PLIST="$HOME/Library/LaunchAgents/cl.meteonaval.estaciones.plist"
URL="https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/mac/subir_estaciones.sh"
mkdir -p "$DEST" "$HOME/Library/LaunchAgents"

echo "1/4 Descargando el script de envío…"
curl -fsSL "$URL" -o "$DEST/subir_estaciones.sh"
chmod +x "$DEST/subir_estaciones.sh"

echo "2/4 Token de GitHub (no se muestra al escribir; se guarda en el Llavero de macOS)."
# "|| true": si el token llega desde el portapapeles (pbpaste | bash instalar.sh) no trae salto de línea final
read -r -s -p "    Pegue el token y presione Enter: " TOKEN || true; echo
TOKEN=$(printf '%s' "$TOKEN" | grep -oE 'github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+' | head -1)
[ -n "$TOKEN" ] || { echo "No se encontró un token de GitHub (debe empezar con github_pat_). Cópielo con el botón de copiar e intente de nuevo."; exit 1; }
COD=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/feliperifo-a11y/meteo_naval)
[ "$COD" = "200" ] || { echo "GitHub rechazó el token (código $COD). Revise que tenga acceso al repositorio meteo_naval."; exit 1; }
echo "    Token válido."
security add-generic-password -U -s meteo_naval_github -a meteo_naval -w "$TOKEN"
unset TOKEN

echo "3/4 Programando la ejecución cada 20 minutos…"
cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cl.meteonaval.estaciones</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DEST/subir_estaciones.sh</string></array>
  <key>StartInterval</key><integer>1200</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DEST/registro.log</string>
  <key>StandardErrorPath</key><string>$DEST/registro.log</string>
</dict></plist>
P
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "4/4 Primera ejecución de prueba…"
sleep 2
/bin/bash "$DEST/subir_estaciones.sh" || true
echo
echo "Listo. Registro de ejecuciones: $DEST/registro.log"
echo "Para desinstalar: bash \"$DEST/desinstalar.sh\""
curl -fsSL "${URL%subir_estaciones.sh}desinstalar.sh" -o "$DEST/desinstalar.sh" && chmod +x "$DEST/desinstalar.sh"
