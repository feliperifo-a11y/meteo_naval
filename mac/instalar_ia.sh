#!/bin/bash
# Instala en este Mac los PRONÓSTICOS WRF + IA (con la suscripción de Claude, sin costo de API).
# Requisitos: Claude Code instalado y con sesión iniciada; el envío de estaciones ya instalado (usa su token de GitHub).
set -e
DEST="$HOME/Library/Application Support/meteo_naval"
PLIST="$HOME/Library/LaunchAgents/cl.meteonaval.ia.plist"
URL="https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/mac"
mkdir -p "$DEST" "$HOME/Library/LaunchAgents"
CLAUDE="$HOME/.local/bin/claude"; [ -x "$CLAUDE" ] || CLAUDE=$(command -v claude || true)
if [ -z "$CLAUDE" ]; then
  echo "Falta Claude Code. Instálelo con:  curl -fsSL https://claude.ai/install.sh | bash"
  echo "Luego ejecute  claude  una vez, inicie sesión con su cuenta de Claude, y vuelva a correr este instalador."; exit 1
fi
# Token de GitHub: el mismo del envío de estaciones; si este Mac no lo tiene, se toma del portapapeles
# (pbpaste | bash instalar_ia.sh) y se guarda en el Llavero.
if ! security find-generic-password -s meteo_naval_github -a meteo_naval -w >/dev/null 2>&1; then
  read -r -s TOKEN || true
  TOKEN=$(printf '%s' "${TOKEN:-}" | grep -oE 'github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+' | head -1)
  [ -n "$TOKEN" ] || { echo "Falta el token de GitHub. Cópielo en GitHub con el botón de copiar y ejecute:  pbpaste | bash /tmp/instalar_ia.sh"; exit 1; }
  COD=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/feliperifo-a11y/meteo_naval)
  [ "$COD" = "200" ] || { echo "GitHub rechazó el token (código $COD)."; exit 1; }
  security add-generic-password -U -s meteo_naval_github -a meteo_naval -w "$TOKEN"; unset TOKEN
  echo "Token de GitHub guardado en el Llavero."
fi
echo "1/4 Verificando la sesión de Claude Code (suscripción)…"
R=$(env -u ANTHROPIC_API_KEY "$CLAUDE" -p "Responde solo: OK" 2>&1 | tail -1)
case "$R" in *OK*) echo "    Sesión correcta.";; *) echo "    Claude Code no respondió: $R"; echo "    Ejecute  claude  , inicie sesión con su cuenta de Claude y repita."; exit 1;; esac
echo "2/4 Descargando el script…"
curl -fsSL "$URL/pronostico_ia.sh" -o "$DEST/pronostico_ia.sh" && chmod +x "$DEST/pronostico_ia.sh"
curl -fsSL "$URL/desinstalar_ia.sh" -o "$DEST/desinstalar_ia.sh" && chmod +x "$DEST/desinstalar_ia.sh"
echo "3/4 Programando la revisión de corridas nuevas (cada hora en punto y media; la IA solo trabaja cuando hay corrida nueva)…"
cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cl.meteonaval.ia</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DEST/pronostico_ia.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><false/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>$DEST/registro_ia.log</string>
  <key>StandardErrorPath</key><string>$DEST/registro_ia.log</string>
</dict></plist>
P
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
if [ -s "$DEST/ia/marcas.txt" ]; then
  echo "4/4 Ya estaba instalado: se mantienen los pronósticos actuales (sin nueva lectura)."
else
  echo "4/4 Primera ejecución (puede tardar varios minutos: lee los 33 meteogramas)…"
  MN_FORZAR=1 MN_ACTUALIZADO=1 /bin/bash "$DEST/pronostico_ia.sh" | tee -a "$DEST/registro_ia.log"
fi
echo; echo "Listo. Registro: $DEST/registro_ia.log"
echo "Para desinstalar: bash \"$DEST/desinstalar_ia.sh\""
