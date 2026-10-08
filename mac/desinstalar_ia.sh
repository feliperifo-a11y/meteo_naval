#!/bin/bash
# Quita de este Mac los PRONÓSTICOS WRF + IA (no toca el envío de estaciones).
PLIST="$HOME/Library/LaunchAgents/cl.meteonaval.ia.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
rm -rf "$HOME/Library/Application Support/meteo_naval/ia" "$HOME/Library/Application Support/meteo_naval/pronostico_ia.sh"
echo "Pronósticos WRF + IA desinstalados de este Mac."
