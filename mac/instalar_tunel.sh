#!/bin/bash
# Publica el asistente local en https://asistente.meteoia.cl mediante un túnel de Cloudflare (sin abrir puertos del router).
# ANTES de correrlo: crear en Cloudflare Zero Trust la aplicación de Access para asistente.meteoia.cl (ver docs/asistente_local.md).
# El instalador verifica al final que el subdominio pida inicio de sesión; si responde sin protección, apaga el túnel.
# Uso:  curl -fsSL https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/mac/instalar_tunel.sh | bash
set -e
HOST="${MN_HOST_TUNEL:-asistente.meteoia.cl}"
NOMBRE="meteoia-asistente"
PUERTO="${MN_PUERTO:-8765}"
DEST="$HOME/Library/Application Support/meteo_naval/asistente"
PLIST="$HOME/Library/LaunchAgents/cl.meteonaval.tunel.plist"
mkdir -p "$DEST/bin" "$HOME/Library/LaunchAgents"

curl -fsS --max-time 3 "http://127.0.0.1:$PUERTO/salud" >/dev/null 2>&1 \
  || { echo "El asistente no responde en el puerto $PUERTO. Instálelo primero con instalar_asistente.sh."; exit 1; }

echo "1/5 cloudflared…"
CF="$(command -v cloudflared || true)"
if [ -z "$CF" ]; then
  CF="$DEST/bin/cloudflared"
  if [ ! -x "$CF" ]; then
    curl -fL --progress-bar https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz -o /tmp/cloudflared.tgz
    tar -xzf /tmp/cloudflared.tgz -C "$DEST/bin" && rm -f /tmp/cloudflared.tgz
    chmod +x "$CF"
  fi
fi
"$CF" --version | head -1

echo "2/5 Autorización de su cuenta de Cloudflare…"
if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
  echo "    Se abrirá el navegador: inicie sesión en Cloudflare y elija el dominio meteoia.cl."
  "$CF" tunnel login
fi
echo "    Cuenta autorizada."

echo "3/5 Túnel ${NOMBRE}…"
PY=""
for c in /usr/local/bin/python3 /opt/homebrew/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3; do
  [ -x "$c" ] && { PY="$c"; break; }
done
id_tunel() {
  local j; j=$("$CF" tunnel list --name "${NOMBRE}" --output json 2>/dev/null || true)
  if [ -n "$PY" ]; then
    printf '%s' "$j" | "$PY" -c "import json,sys; print(next((t['id'] for t in json.load(sys.stdin) if t['name']=='${NOMBRE}' and str(t.get('deleted_at') or '0001').startswith('0001')), ''))" 2>/dev/null || true
  else
    printf '%s' "$j" | grep -oE '"id": ?"[0-9a-f-]{36}"' | head -1 | grep -oE '[0-9a-f-]{36}' || true
  fi
}
ID=$(id_tunel)
if [ -z "$ID" ]; then "$CF" tunnel create "$NOMBRE"; ID=$(id_tunel); fi
[ -n "$ID" ] || { echo "    No se pudo crear o leer el túnel."; exit 1; }
CRED="$HOME/.cloudflared/$ID.json"
[ -f "$CRED" ] || { echo "    Falta la credencial $CRED (el túnel se creó en otro equipo). Bórrelo en Cloudflare y repita."; exit 1; }
echo "    Túnel $ID"

echo "4/5 Dirección ${HOST}…"
"$CF" tunnel route dns "$NOMBRE" "$HOST" 2>&1 | tail -1 || true
cat > "$DEST/tunel.yml" <<Y
tunnel: $ID
credentials-file: $CRED
ingress:
  - hostname: $HOST
    service: http://127.0.0.1:$PUERTO
  - service: http_status:404
Y
cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cl.meteonaval.tunel</string>
  <key>ProgramArguments</key><array><string>$CF</string><string>tunnel</string><string>--no-autoupdate</string><string>--config</string><string>$DEST/tunel.yml</string><string>run</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DEST/tunel.log</string>
  <key>StandardErrorPath</key><string>$DEST/tunel.log</string>
</dict></plist>
P
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "5/5 Verificando que ${HOST} exija inicio de sesión (Cloudflare Access)…"
R=""
for i in $(seq 1 12); do
  sleep 5
  R=$(curl -s -o /dev/null --max-time 10 -w '%{http_code} %{redirect_url}' "https://$HOST/salud" || true)
  case "$R" in 200*|30[0-9]*) break;; esac
done
case "$R" in
  30[0-9]*cloudflareaccess.com*)
    echo "    Protegido: pide inicio de sesión de Access. Túnel activo como servicio."
    echo; echo "Listo. Abra https://$HOST (o el botón ASISTENTE IA de la página Desarrollo) e inicie sesión con su correo autorizado.";;
  200*)
    launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
    echo "    ATENCIÓN: $HOST respondió SIN pedir inicio de sesión. Se apagó el túnel para no dejar el asistente abierto."
    echo "    Cree la aplicación de Access para $HOST en Cloudflare Zero Trust y vuelva a correr este instalador."; exit 1;;
  *)
    echo "    Aún sin respuesta ($R). El túnel puede tardar unos minutos en conectarse."
    echo "    Revise $DEST/tunel.log y pruebe https://$HOST/salud: debe pedir inicio de sesión.";;
esac
echo "Registro: $DEST/tunel.log"
