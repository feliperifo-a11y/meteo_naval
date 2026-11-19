#!/bin/bash
# Desinstala el asistente MeteoIA con IA local. Deja instalada la aplicación Ollama y el modelo descargado;
# para liberar el espacio del modelo:  ~/Applications/Ollama.app/Contents/Resources/ollama rm qwen3:4b
DEST="$HOME/Library/Application Support/meteo_naval/asistente"
for n in asistente ollama tunel; do
  P="$HOME/Library/LaunchAgents/cl.meteonaval.$n.plist"
  launchctl bootout "gui/$(id -u)" "$P" 2>/dev/null || true
  rm -f "$P"
done
rm -rf "$DEST"
echo "Asistente desinstalado (Ollama y el modelo siguen en el Mac)."
