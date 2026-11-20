#!/bin/bash
# Instala en este Mac el ASISTENTE MeteoIA con IA local (Ollama), sin costo y sin la API pagada.
#   1. Ollama (motor de IA local) como servicio, solo accesible desde este Mac.
#   2. El modelo: qwen3:4b-instruct-2507 con 8 GB de RAM (unos 2,5 GB; responde sin "pensar en voz alta", más rápido);
#      qwen3:8b con 16 GB o más. Si una variante no existe en Ollama, prueba la siguiente.
#   3. El asistente (asistente_local.py) como servicio en el puerto 8765: http://127.0.0.1:8765
#      y, si hay Tailscale, también en la IP de Tailscale (para abrirlo desde el MacBook o el celular).
# Uso:  curl -fsSL https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/mac/instalar_asistente.sh | bash
# Para otro modelo:  ... | MN_MODELO=llama3.2:3b bash
set -e
RAMA="${MN_RAMA:-main}"
URL="https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/$RAMA/mac"
DEST="$HOME/Library/Application Support/meteo_naval/asistente"
LA="$HOME/Library/LaunchAgents"
P_OLL="$LA/cl.meteonaval.ollama.plist"
P_ASI="$LA/cl.meteonaval.asistente.plist"
PUERTO="${MN_PUERTO:-8765}"
mkdir -p "$DEST" "$LA"

[ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ] || { echo "Este instalador es para Mac con Apple Silicon (M1 o posterior)."; exit 1; }
RAM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
if [ -n "${MN_MODELO:-}" ]; then CANDIDATOS="$MN_MODELO"
elif [ "$RAM_GB" -ge 16 ]; then CANDIDATOS="qwen3:8b qwen3:4b-instruct-2507-q4_K_M"
else CANDIDATOS="qwen3:4b-instruct-2507-q4_K_M qwen3:4b-instruct llama3.2:3b"; fi
echo "Mac con $RAM_GB GB de RAM → modelo: ${CANDIDATOS%% *}"

# Python 3.9+ (el de python.org, Homebrew o las herramientas de desarrollo de Apple)
PY=""
for c in /usr/local/bin/python3 /opt/homebrew/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3 "$(command -v python3 || true)"; do
  [ -n "$c" ] && [ -x "$c" ] && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null && { PY="$c"; break; }
done
[ -n "$PY" ] || { echo "Falta Python 3.9 o superior. Instálelo desde https://www.python.org/downloads/macos/ y repita."; exit 1; }
echo "Python: $PY"

api_ok() { curl -fsS --max-time 3 http://127.0.0.1:11434/api/version >/dev/null 2>&1; }

echo "1/4 Motor de IA local (Ollama)…"
OLL="$(command -v ollama || true)"
for app in /Applications/Ollama.app "$HOME/Applications/Ollama.app"; do
  [ -z "$OLL" ] && [ -x "$app/Contents/Resources/ollama" ] && OLL="$app/Contents/Resources/ollama"
done
if [ -z "$OLL" ]; then
  echo "    Descargando Ollama (unos 200 MB)…"
  mkdir -p "$HOME/Applications"
  rm -rf "$HOME/Applications/Ollama.app"
  if curl -fL --progress-bar https://ollama.com/download/Ollama-darwin.zip -o /tmp/Ollama-darwin.zip; then
    ditto -x -k /tmp/Ollama-darwin.zip "$HOME/Applications/" && rm -f /tmp/Ollama-darwin.zip
  else
    curl -fL --progress-bar https://ollama.com/download/Ollama.dmg -o /tmp/Ollama.dmg
    VOL=$(hdiutil attach -nobrowse -readonly /tmp/Ollama.dmg | awk -F'\t' '/\/Volumes\//{print $NF}' | tail -1)
    ditto "$VOL/Ollama.app" "$HOME/Applications/Ollama.app"
    hdiutil detach -quiet "$VOL" || true; rm -f /tmp/Ollama.dmg
  fi
  OLL="$HOME/Applications/Ollama.app/Contents/Resources/ollama"
  [ -x "$OLL" ] || OLL=$(find "$HOME/Applications/Ollama.app" -type f -name ollama -perm -u+x 2>/dev/null | head -1)
  [ -n "$OLL" ] && [ -x "$OLL" ] || { echo "    No se encontró el ejecutable de Ollama dentro de la descarga."; exit 1; }
fi
echo "    Ollama: $OLL"
if api_ok; then
  echo "    Ollama ya está corriendo en este Mac; se usa el que existe."
else
  cat > "$P_OLL" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cl.meteonaval.ollama</string>
  <key>ProgramArguments</key><array><string>$OLL</string><string>serve</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>OLLAMA_HOST</key><string>127.0.0.1:11434</string>
    <key>OLLAMA_KEEP_ALIVE</key><string>30m</string>
    <key>OLLAMA_MAX_LOADED_MODELS</key><string>1</string>
    <key>OLLAMA_NUM_PARALLEL</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DEST/ollama.log</string>
  <key>StandardErrorPath</key><string>$DEST/ollama.log</string>
</dict></plist>
P
  launchctl bootout "gui/$(id -u)" "$P_OLL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$P_OLL"
  for i in $(seq 1 30); do api_ok && break; sleep 1; done
  api_ok || { echo "    Ollama no arrancó. Revise $DEST/ollama.log"; exit 1; }
  echo "    Ollama corriendo como servicio (solo accesible desde este Mac)."
fi

echo "2/4 Descargando el modelo (solo la primera vez; puede tardar varios minutos)…"
MN_MODELO=""
for m in $CANDIDATOS; do
  echo "    $m"
  if "$OLL" pull "$m"; then MN_MODELO="$m"; break; fi
  echo "    No disponible; se prueba el siguiente."
done
[ -n "$MN_MODELO" ] || { echo "    No se pudo descargar ningún modelo."; exit 1; }
# La primera versión instaló qwen3:4b, que razona en voz alta (lento en el M1): se borra para liberar espacio.
if [ "$MN_MODELO" != "qwen3:4b" ] && "$OLL" list 2>/dev/null | grep -q '^qwen3:4b '; then
  "$OLL" rm qwen3:4b >/dev/null 2>&1 && echo "    Se borró el modelo anterior qwen3:4b (2,5 GB liberados)."
fi

echo "3/4 Instalando el asistente…"
curl -fsSL "$URL/asistente_local.py" -o "$DEST/asistente_local.py"
curl -fsSL "$URL/desinstalar_asistente.sh" -o "$DEST/desinstalar_asistente.sh" && chmod +x "$DEST/desinstalar_asistente.sh"
"$PY" -m py_compile "$DEST/asistente_local.py"
HOSTS="127.0.0.1"
TS=""
for t in /Applications/Tailscale.app/Contents/MacOS/Tailscale "$(command -v tailscale || true)"; do
  [ -n "$t" ] && [ -x "$t" ] && TS=$("$t" ip -4 2>/dev/null | head -1) && [ -n "$TS" ] && break
done
[ -n "$TS" ] && HOSTS="127.0.0.1,$TS"
cat > "$P_ASI" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cl.meteonaval.asistente</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$DEST/asistente_local.py</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>MN_MODELO</key><string>$MN_MODELO</string>
    <key>MN_HOSTS</key><string>$HOSTS</string>
    <key>MN_PUERTO</key><string>$PUERTO</string>
  </dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DEST/asistente.log</string>
  <key>StandardErrorPath</key><string>$DEST/asistente.log</string>
</dict></plist>
P
launchctl bootout "gui/$(id -u)" "$P_ASI" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$P_ASI"
for i in $(seq 1 15); do curl -fsS --max-time 2 "http://127.0.0.1:$PUERTO/salud" >/dev/null 2>&1 && break; sleep 1; done

echo "4/4 Pregunta de prueba (la primera carga del modelo tarda más)…"
echo "    ¿Hay avisos vigentes para Valparaíso?"
MN_MODELO="$MN_MODELO" "$PY" "$DEST/asistente_local.py" --pregunta "¿Hay avisos vigentes para Valparaíso?" | sed 's/^/    /' || echo "    La prueba falló; revise $DEST/asistente.log"

echo
echo "Listo. Abra el asistente en este Mac:  http://127.0.0.1:$PUERTO"
[ -n "$TS" ] && echo "Desde el MacBook o el celular (con Tailscale activo):  http://$TS:$PUERTO"
echo "Registros: $DEST/asistente.log y $DEST/ollama.log"
echo "Para desinstalar: bash \"$DEST/desinstalar_asistente.sh\""
