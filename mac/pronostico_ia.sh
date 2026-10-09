#!/bin/bash
# PRONÓSTICOS WRF + IA desde este Mac, con la suscripción de Claude (Claude Code), sin costo de API.
# A las 21:00 (corrida 12Z) y 04:00 (corrida 00Z) revisa si cambió algún meteograma WRF.
# Solo si hay corrida nueva:
#   1. descarga los meteogramas nuevos y los reduce de tamaño;
#   2. le pide a Claude Code (sesión iniciada con su cuenta de Claude) el pronóstico escrito, por zona;
#   3. sube el resultado al repositorio como data/wrf_ia.json (la página ia.html lo muestra).
# Lo ejecuta launchd a las 21:00 y 04:00 (si el Mac dormía, al despertar). Se actualiza solo desde el repositorio.
set -u
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN      # siempre la suscripción, nunca la API pagada
REPO="feliperifo-a11y/meteo_naval"
DIR="$HOME/Library/Application Support/meteo_naval"
TRAB="$DIR/ia"; YO="$DIR/pronostico_ia.sh"
CLAUDE="${MN_CLAUDE:-$HOME/.local/bin/claude}"
BASE="http://triton.directemar.cl/web/meteograma_"
mkdir -p "$TRAB/img"
ts() { date '+%Y-%m-%d %H:%M:%S'; }

# 0. Autoactualización
if [ -z "${MN_ACTUALIZADO:-}" ] && [ -z "${MN_PRUEBA:-}" ]; then
  if curl -fsS --max-time 20 "https://raw.githubusercontent.com/$REPO/main/mac/pronostico_ia.sh" -o "$DIR/nuevo_ia.sh" 2>/dev/null \
     && bash -n "$DIR/nuevo_ia.sh" 2>/dev/null && ! cmp -s "$DIR/nuevo_ia.sh" "$YO"; then
    mv "$DIR/nuevo_ia.sh" "$YO" && chmod +x "$YO"; echo "$(ts) Script IA actualizado"; MN_ACTUALIZADO=1 exec /bin/bash "$YO"
  fi
  rm -f "$DIR/nuevo_ia.sh"
fi
[ -x "$CLAUDE" ] || CLAUDE=$(command -v claude || true)
[ -n "$CLAUDE" ] || { echo "$(ts) ERROR: Claude Code no está instalado"; exit 1; }

# Bahías con meteograma WRF: zona|nombre|código|resolución (3 km; 9 km donde no hay 3 km; 10 km en la Antártica; 27 km en Juan Fernández)
BAHIAS="Zona Norte|Arica|ARICA_norte_d03|3 km
Zona Norte|Iquique|IQUIQUE_norte_d03|3 km
Zona Norte|Patache|PATACHE_norte_d03|3 km
Zona Norte|Tocopilla|TOCOPILLA_norte_d04|3 km
Zona Norte|Antofagasta|ANTOFAGASTA_norte_d04|3 km
Zona Central|Chañaral|CHANARAL_norte_d05|3 km
Zona Central|Caldera|CALDERA_norte_d05|3 km
Zona Central|Huasco|HUASCO_centro_d06|9 km
Zona Central|Coquimbo|COQUIMBO_centro_d07|3 km
Zona Central|Los Vilos|LOSVILOS_centro_d08|3 km
Zona Central|Quintero|QUINTERO_centro_d08|3 km
Zona Central|Valparaíso|VALPARAISO_centro_d08|3 km
Zona Central|San Antonio|SANANTONIO_centro_d08|3 km
Zona Central|Juan Fernández|ISLAROBINSONCRUSOE_1dom_d01|27 km
Zona Central Sur|Constitución|CONSTITUCION_centro_d06|9 km
Zona Central Sur|Lirquén|LIRQUEN_centro_d09|3 km
Zona Central Sur|Talcahuano|TALCAHUANO_centro_d09|3 km
Zona Central Sur|San Vicente|SANVICENTE_centro_d09|3 km
Zona Central Sur|Coronel|CORONEL_centro_d09|3 km
Zona Central Sur|Lota|LOTA_centro_d09|3 km
Zona Central Sur|Lebu|LEBU_centro_d09|3 km
Zona Central Sur|Isla Mocha|ISLAMOCHA_centro_d06|9 km
Zona Central Sur|Puerto Saavedra|PUERTOSAAVEDRA_centro_d06|9 km
Zona Central Sur|Valdivia|VALDIVIA_centro_d10|3 km
Zona Central Sur|Corral|CORRAL_centro_d10|3 km
Zona Sur|Puerto Montt|PUERTOMONTT_sur_d12|3 km
Zona Sur|Golfo Coronado|GCORONADO_sur_d12|3 km
Zona Sur|Ancud|ANCUD_sur_d12|3 km
Zona Sur|Castro|CASTRO_sur_d12|3 km
Zona Sur|Quellón|QUELLON_sur_d12|3 km
Zona Sur|Golfo Corcovado|GOLFOCORCOVADO_sur_d12|3 km
Zona Sur|Isla Guafo|ISLAGUAFO_sur_d12|3 km
Zona Sur|Canal Moraleda|CMORALEDA_sur_d11|9 km
Zona Sur|Puerto Chacabuco|PUERTOCHACABUCO_sur_d11|9 km
Zona Sur|Golfo de Penas|GOLFOPENAS_sur_d11|9 km
Zona Austral|Faro Evangelistas|FAROEVANGELISTA_sur_d13|3 km
Zona Austral|Paso Tamar|PASOTAMAR_sur_d13|3 km
Zona Austral|Puerto Natales|PUERTONATALES_sur_d11|9 km
Zona Austral|Primera Angostura|PRIMERANGOSTURA_sur_d11|9 km
Zona Austral|Seno Otway|SENOOTWAY_sur_d14|3 km
Zona Austral|Punta Arenas|PUNTAARENAS_sur_d14|3 km
Zona Austral|Cabo Froward|FROWARD_sur_d11|9 km
Zona Austral|Paso Brecknock|BRECKNOCK_sur_d15|3 km
Zona Austral|Paso Tortuoso|TORTUOSO_sur_d11|3 km
Zona Austral|Puerto Williams|PUERTOWILLIAMS_sur_d11|9 km
Zona Austral|Cabo de Hornos|CABODEHORNOS_sur_d11|9 km
Zona Antártica|Bahía Fildes|A_FILDES_Antartica_d02|10 km
Zona Antártica|Base Prat|A_BASEPRAT_Antartica_d02|10 km
Zona Antártica|Isla Decepción|A_DECEPCION_Antartica_d02|10 km
Zona Antártica|Bahía Whisky|A_BAHIAWHISKY_Antartica_d02|10 km
Zona Antártica|Base O’Higgins|A_BASEOHIGGINS_Antartica_d02|10 km
Zona Antártica|Paso Antarctic|A_ANTARCTIC_Antartica_d02|10 km
Zona Antártica|Caleta Snow|A_CALETASNOW_Antartica_d02|10 km
Zona Antártica|Estrecho Gerlache|A_GERLACHE_Antartica_d02|10 km
Zona Antártica|Bahía Paraíso|A_BAHIAPARAISO_Antartica_d02|10 km
Zona Antártica|Base Yelcho|A_BAHIASOUTH_Antartica_d02|10 km"

printf '%s\n' "$BAHIAS" > "$TRAB/bahias.txt"

# 1. ¿Qué meteogramas cambiaron? (consulta liviana de la fecha de modificación)
MARCAS="$TRAB/marcas.txt"; touch "$MARCAS"
: > "$TRAB/cambios.txt"
while IFS='|' read -r zona nombre cod res; do
  m=$(curl -sI --max-time 20 "$BASE$cod.png" | tr -d '\r' | awk -F': ' 'tolower($1)=="last-modified"{print $2}')
  [ -n "$m" ] || continue
  if [ "${MN_FORZAR:-}" = "1" ] || [ "$(grep "^$cod|" "$MARCAS" | cut -d'|' -f2-)" != "$m" ]; then
    echo "$zona|$nombre|$cod|$m" >> "$TRAB/cambios.txt"
  fi
done <<< "$BAHIAS"
N=$(wc -l < "$TRAB/cambios.txt" | tr -d ' ')
[ "$N" -gt 0 ] || { echo "$(ts) Sin corrida nueva"; exit 0; }
echo "$(ts) $N meteogramas nuevos"

# 2. Descarga y reducción (menos peso = menos consumo de la suscripción)
rm -f "$TRAB/img/"*.png
while IFS='|' read -r zona nombre cod m; do
  curl -fsS --max-time 60 "$BASE$cod.png" -o "$TRAB/img/$cod.png" && sips -Z 1600 "$TRAB/img/$cod.png" >/dev/null 2>&1
done < "$TRAB/cambios.txt"

INSTR='Eres meteorólogo marino. Cada imagen es el meteograma del modelo WRF (3, 9, 10 o 27 km según el lugar) de una bahía de Chile o de la Antártica.
Paneles, de arriba hacia abajo: (1) perfil vertical de temperatura y viento 1000-100 hPa; (2) agua de nube por niveles (nubosidad) y techo de nubes; (3) temperatura (azul) y humedad relativa (rojo) a 2 m; (4) viento a 10 m: intensidad en nudos (línea azul) y dirección (barbas rojas, círculos = calma); (5) precipitación (barras, mm) y presión a nivel del mar (hPa); (6) alturas de 700 y 850 hPa; (7) temperatura y altura de 500 hPa. Si una imagen trae otros paneles u otro orden, guíate por los títulos de cada panel.
Eje horizontal en UTC (día/hora, ej. 09/00z). Hora de Chile continental (y del Territorio Antártico) = UTC-3.
Para cada bahía, por día calendario en hora de Chile (descarta días con menos de 6 horas de datos):
- situacion_sinoptica: una o dos frases deducidas del meteograma (tendencia de presión, alturas y temperatura en 500 hPa, precipitación); usa dorsal/vaguada en altura, baja segregada, sistema frontal, vaguada costera o alta presión solo si el gráfico lo respalda.
- nubosidad: exactamente "Cubierto", "Nublado", "Parcial" o "Despejado"; nubosidad_detalle opcional y breve.
- viento: dirección (rosa de 8 o 16 rumbos, desde donde sopla) e intensidad en nudos al estilo boletín (ej. "S/SW 10/15 kt, aumentando a 15/20 kt en la tarde").
- precipitacion: solo si el meteograma la muestra; si no, cadena vacía.
- temp_max y temp_min: temperatura máxima y mínima del día a 2 m (superficie), en °C, leídas de la línea azul del panel TT-2m, redondeadas a enteros.
- inicializacion_utc: la inicialización que indica la imagen (ej. 2026-10-08T12).
No inventes datos que el gráfico no muestre. Español técnico y breve.'

ESQUEMA='{"type":"object","properties":{"bahias":{"type":"array","items":{"type":"object","properties":{"codigo":{"type":"string"},"inicializacion_utc":{"type":"string"},"situacion_sinoptica":{"type":"string"},"dias":{"type":"array","items":{"type":"object","properties":{"fecha":{"type":"string"},"nubosidad":{"type":"string","enum":["Cubierto","Nublado","Parcial","Despejado"]},"nubosidad_detalle":{"type":"string"},"viento":{"type":"string"},"precipitacion":{"type":"string"},"temp_max":{"type":"number"},"temp_min":{"type":"number"}},"required":["fecha","nubosidad","viento","temp_max","temp_min"]}}},"required":["codigo","situacion_sinoptica","dias"]}}},"required":["bahias"]}'

# 3. Una consulta por zona, en grupos de hasta 6 imágenes (pocas consultas = menos uso del cupo)
rm -f "$TRAB/res_"*.json
for zona in "Zona Norte" "Zona Central" "Zona Central Sur" "Zona Sur" "Zona Austral" "Zona Antártica"; do
  grep "^$zona|" "$TRAB/cambios.txt" | while IFS='|' read -r z nombre cod m; do [ -s "$TRAB/img/$cod.png" ] && echo "- $nombre: archivo $cod.png (codigo $cod)"; done > "$TRAB/lista.txt"
  [ -s "$TRAB/lista.txt" ] || continue
  slug=$(echo "$zona" | tr ' ' '_' | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null | tr -cd 'A-Za-z_'); g=0
  while [ -s "$TRAB/lista.txt" ]; do
    g=$((g+1)); LISTA=$(head -6 "$TRAB/lista.txt"); tail -n +7 "$TRAB/lista.txt" > "$TRAB/lista2.txt"; mv "$TRAB/lista2.txt" "$TRAB/lista.txt"
    ( cd "$TRAB/img" && "$CLAUDE" -p "$INSTR

Lee con la herramienta Read cada uno de estos archivos de imagen (están en la carpeta actual) y entrega el pronóstico de cada bahía:
$LISTA" --allowedTools "Read" --output-format json --json-schema "$ESQUEMA" > "$TRAB/res_${slug}_$g.json" 2> "$TRAB/err_${slug}_$g.txt" ) \
      && echo "$(ts) IA: $zona ($g) listo" || echo "$(ts) IA: $zona ($g) falló ($(head -c 200 "$TRAB/err_${slug}_$g.txt"))"
  done
done

# 4. Fusión con el archivo anterior (JavaScript de macOS) y subida
ACTUAL="$TRAB/wrf_ia.json"
[ -s "$ACTUAL" ] || curl -fsS --max-time 30 "https://raw.githubusercontent.com/$REPO/main/data/wrf_ia.json" -o "$ACTUAL" 2>/dev/null || echo '{}' > "$ACTUAL"
osascript -l JavaScript - "$TRAB" <<'JS' > "$TRAB/fusion.log" 2>&1
ObjC.import('Foundation');
function leer(p) { const s = $.NSString.stringWithContentsOfFileEncodingError(p, 4, null); return s.isNil() ? null : s.js; }
function escribir(p, t) { $(t).writeToFileAtomicallyEncodingError(p, true, 4, null); }
function run(argv) {
  const T = argv[0], ahora = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  let act = {}; try { act = JSON.parse(leer(T + '/wrf_ia.json') || '{}'); } catch (e) {}
  const previo = {}; (act.bahias || []).forEach(b => previo[b.codigo] = b);
  const cambios = (leer(T + '/cambios.txt') || '').trim().split('\n').filter(Boolean).map(l => l.split('|'));
  const nuevos = {};
  const fm = $.NSFileManager.defaultManager, lista = ObjC.unwrap(fm.contentsOfDirectoryAtPathError(T, null)) || [];
  lista.map(x => ObjC.unwrap(x)).filter(f => /^res_.*\.json$/.test(f)).forEach(f => {
    try { const r = JSON.parse(leer(T + '/' + f)); const so = r.structured_output || (typeof r.result === 'string' ? JSON.parse(r.result) : null);
      (so && so.bahias || []).forEach(b => { nuevos[b.codigo] = b; }); } catch (e) {}
  });
  const BAH = (leer(T + '/bahias.txt') || '').trim().split('\n').filter(Boolean).map(l => l.split('|'));
  const marcasTxt = (leer(T + '/marcas.txt') || '').trim().split('\n').filter(Boolean);
  const marcas = {}; marcasTxt.forEach(l => { const i = l.indexOf('|'); marcas[l.slice(0, i)] = l.slice(i + 1); });
  let ok = 0;
  const bahias = BAH.map(([zona, nombre, cod, res]) => {
    const base = { zona, nombre, codigo: cod, resolucion: res || '3 km', imagen: 'http://triton.directemar.cl/web/meteograma_' + cod + '.png' };
    const n = nuevos[cod], c = cambios.find(x => x[2] === cod);
    if (n) { ok++; if (c) marcas[cod] = c[3];
      const { codigo, ...pr } = n; return { ...base, pronostico: pr, generado: ahora, modelo_ia: 'Claude (suscripción, Claude Code)', error: null }; }
    const p = previo[cod] || {};
    return { ...p, ...base, error: c ? (p.pronostico ? 'pronóstico de la corrida anterior' : 'no se pudo generar') : (p.error || null) };
  });
  escribir(T + '/marcas.txt', Object.entries(marcas).map(([k, v]) => k + '|' + v).join('\n') + '\n');
  escribir(T + '/wrf_ia.json', JSON.stringify({ actualizado: ahora, modelo_ia: 'Claude (suscripción, Claude Code)', resolucion: '3, 9, 10 y 27 km',
    fuente: 'https://meteoarmada.directemar.cl/meteo/site/edic/base/port/Modelo_meteogramas.html', estado: { nuevos: ok }, bahias }));
  return 'nuevos ' + ok;
}
JS
echo "$(ts) Fusión: $(tail -1 "$TRAB/fusion.log")"
[ -n "${MN_PRUEBA:-}" ] && { echo "$(ts) PRUEBA: resultado en $ACTUAL"; exit 0; }

TOKEN=$(security find-generic-password -s meteo_naval_github -a meteo_naval -w 2>/dev/null) || { echo "$(ts) ERROR: sin token de GitHub"; exit 1; }
API="https://api.github.com/repos/$REPO/contents/data/wrf_ia.json"
H1="Authorization: Bearer $TOKEN"; H2="Accept: application/vnd.github+json"
SHA=$(curl -fs --max-time 30 -H "$H1" -H "$H2" "$API?ref=main" | grep -m1 '"sha"' | sed -E 's/.*"sha": *"([^"]+)".*/\1/')
printf '{"message":"Pronósticos WRF + IA %s (equipo local)","branch":"main","content":"%s"%s}' "$(date -u +%Y-%m-%dT%H:%MZ)" \
  "$(base64 -i "$ACTUAL" | tr -d '\n')" "${SHA:+,\"sha\":\"$SHA\"}" > "$TRAB/cuerpo.json"
COD=$(curl -sS --max-time 60 -o "$TRAB/respuesta.json" -w '%{http_code}' -X PUT -H "$H1" -H "$H2" --data-binary @"$TRAB/cuerpo.json" "$API")
[ "$COD" = "200" ] || [ "$COD" = "201" ] && echo "$(ts) OK: pronósticos subidos" || echo "$(ts) ERROR: GitHub respondió $COD"
