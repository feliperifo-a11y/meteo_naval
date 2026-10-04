#!/bin/bash
# Doble clic: toma el token de GitHub desde el portapapeles, lo guarda en el Llavero,
# lo verifica, sube las estaciones y limpia portapapeles e historial. No hay que pegar nada.
clear
echo "Guardar token del dashboard meteo_naval"
echo "---------------------------------------"
T=$(pbpaste | grep -oE 'github_pat_[A-Za-z0-9_]+' | head -1)
if [ -z "$T" ]; then
  echo
  echo "No encontré un token en el portapapeles."
  echo "En GitHub presione el botón de copiar del token y vuelva a abrir este archivo."
  echo; read -n 1 -r -p "Presione una tecla para cerrar…"; exit 1
fi
security add-generic-password -U -s meteo_naval_github -a meteo_naval -w "$T"
COD=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $T" https://api.github.com/user)
unset T
pbcopy < /dev/null
sed -i '' '/github_pat_/d' "$HOME/.zsh_history" 2>/dev/null
echo
if [ "$COD" = "200" ]; then
  echo "✅ Token válido y guardado en el Llavero."
  echo "Subiendo estaciones…"
  bash "$HOME/Library/Application Support/meteo_naval/subir_estaciones.sh"
  echo; echo "Listo. Puede cerrar esta ventana."
else
  echo "❌ GitHub rechazó el token (código $COD)."
  echo "Regenérelo en GitHub, cópielo con el botón de copiar y vuelva a abrir este archivo."
fi
echo; read -n 1 -r -p "Presione una tecla para cerrar…"
