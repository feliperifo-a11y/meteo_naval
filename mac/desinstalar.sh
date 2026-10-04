#!/bin/bash
# Quita el envío automático de estaciones de este Mac.
PLIST="$HOME/Library/LaunchAgents/cl.meteonaval.estaciones.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null
rm -f "$PLIST"
security delete-generic-password -s meteo_naval_github -a meteo_naval >/dev/null 2>&1
rm -rf "$HOME/Library/Application Support/meteo_naval"
echo "Envío automático desinstalado y token eliminado del Llavero."
