#!/bin/bash
# PRONÓSTICOS WRF + IA desde este Mac, con la suscripción de Claude (Claude Code), sin costo de API.
# A las 06:00 y a las 18:00 (hora de Chile) revisa si cambió algún meteograma WRF de 3 km. Solo si hay corrida nueva:
#   1. descarga los meteogramas nuevos y los reduce de tamaño;
#   2. le pide a Claude Code (sesión iniciada con su cuenta de Claude) el pronóstico escrito, por zona;
#   3. sube el resultado al repositorio como data/wrf_ia.json (la página ia.html lo muestra).
# Lo ejecuta launchd a las 06:00 y 18:00 (si el Mac dormía, al despertar). Se actualiza solo desde el repositorio.
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

# Bahías con meteograma de 3 km: zona|nombre|código
BAHIAS="Zona Norte|Arica|ARICA_norte_d03
Zona Norte|Iquique|IQUIQUE_norte_d03
Zona Norte|Patache|PATACHE_norte_d03
Zona Norte|Tocopilla|TOCOPILLA_norte_d04
Zona Norte|Antofagasta|ANTOFAGASTA_norte_d04
Zona Central|Chañaral|CHANARAL_norte_d05
Zona Central|Caldera|CALDERA_norte_d05
Zona Central|Coquimbo|COQUIMBO_centro_d07
Zona Central|Los Vilos|LOSVILOS_centro_d08
Zona Central|Quintero|QUINTERO_centro_d08
Zona Central|Valparaíso|VALPARAISO_centro_d08
Zona Central|San Antonio|SANANTONIO_centro_d08
Zona Central Sur|Lirquén|LIRQUEN_centro_d09
Zona Central Sur|Talcahuano|TALCAHUANO_centro_d09
Zona Central Sur|San Vicente|SANVICENTE_centro_d09
Zona Central Sur|Coronel|CORONEL_centro_d09
Zona Central Sur|Lota|LOTA_centro_d09
Zona Central Sur|Lebu|LEBU_centro_d09
Zona Central Sur|Valdivia|VALDIVIA_centro_d10
Zona Central Sur|Corral|CORRAL_centro_d10
Zona Sur|Puerto Montt|PUERTOMONTT_sur_d12
Zona Sur|Golfo Coronado|GCORONADO_sur_d12
Zona Sur|Ancud|ANCUD_sur_d12
Zona Sur|Castro|CASTRO_sur_d12
Zona Sur|Quellón|QUELLON_sur_d12
Zona Sur|Golfo Corcovado|GOLFOCORCOVADO_sur_d12
Zona Sur|Isla Guafo|ISLAGUAFO_sur_d12
Zona Austral|Faro Evangelistas|FAROEVANGELISTA_sur_d13
Zona Austral|Paso Tamar|PASOTAMAR_sur_d13
Zona Austral|Seno Otway|SENOOTWAY_sur_d14
Zona Austral|Punta Arenas|PUNTAARENAS_sur_d14
Zona Austral|Paso Brecknock|BRECKNOCK_sur_d15
Zona Austral|Paso Tortuoso|TORTUOSO_sur_d11"

printf '%s\n' "$BAHIAS" > "$TRAB/bahias.txt"

# 1. ¿Qué meteogramas cambiaron? (consulta liviana de la fecha de modificación)
MARCAS="$TRAB/marcas.txt"; touch "$MARCAS"
: > "$TRAB/cambios.txt"
while IFS='|' read -r zona nombre cod; do
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

INSTR='Eres meteorólogo marino. Cada imagen es el meteograma del modelo WRF (3 km) de una bahía de Chile.
Paneles, de arriba hacia abajo: (1) perfil vertical de temperatura y viento 1000-100 hPa; (2) agua de nube por niveles (nubosidad) y techo de nubes; (3) temperatura (azul) y humedad relativa (rojo) a 2 m; (4) viento a 10 m: intensidad en nudos (línea azul) y dirección (barbas rojas, círculos = calma); (5) precipitación (barras, mm) y presión a nivel del mar (hPa); (6) alturas de 700 y 850 hPa; (7) temperatura y altura de 500 hPa.
Eje horizontal en UTC (día/hora, ej. 09/00z). Hora de Chile continental = UTC-3.
Para cada bahía, por día calendario en hora de Chile (descarta días con menos de 6 horas de datos):
- situacion_sinoptica: una o dos frases deducidas del meteograma (tendencia de presión, alturas y temperatura en 500 hPa, precipitación); usa dorsal/vaguada en altura, baja segregada, sistema frontal, vaguada costera o alta presión solo si el gráfico lo respalda.
- nubosidad: exactamente "Cubierto", "Nublado", "Parcial" o "Despejado"; nubosidad_detalle opcional y breve.
- viento: dirección (rosa de 8 o 16 rumbos, desde donde sopla) e intensidad en nudos al estilo boletín (ej. "S/SW 10/15 kt, aumentando a 15/20 kt en la tarde").
- precipitacion: solo si el meteograma la muestra; si no, cadena vacía.
- temp_max y temp_min: temperatura máxima y mínima del día a 2 m (superficie), en °C, leídas de la línea azul del panel TT-2m, redondeadas a enteros.
- inicializacion_utc: la inicialización que indica la imagen (ej. 2026-10-08T12).
No inventes datos que el gráfico no muestre. Español técnico y breve.'

ESQUEMA='{"type":"object","properties":{"bahias":{"type":"array","items":{"type":"object","properties":{"codigo":{"type":"string"},"inicializacion_utc":{"type":"string"},"situacion_sinoptica":{"type":"string"},"dias":{"type":"array","items":{"type":"object","properties":{"fecha":{"type":"string"},"nubosidad":{"type":"string","enum":["Cubierto","Nublado","Parcial","Despejado"]},"nubosidad_detalle":{"type":"string"},"viento":{"type":"string"},"precipitacion":{"type":"string"},"temp_max":{"type":"number"},"temp_min":{"type":"number"}},"required":["fecha","nubosidad","viento","temp_max","temp_min"]}}},"required":["codigo","situacion_sinoptica","dias"]}}},"required":["bahias"]}'

# 3. Una consulta por zona (pocas consultas = menos uso del cupo)
rm -f "$TRAB/res_"*.json
for zona in "Zona Norte" "Zona Central" "Zona Central Sur" "Zona Sur" "Zona Austral"; do
  LISTA=$(grep "^$zona|" "$TRAB/cambios.txt" | while IFS='|' read -r z nombre cod m; do [ -s "$TRAB/img/$cod.png" ] && echo "- $nombre: archivo $cod.png (codigo $cod)"; done)
  [ -n "$LISTA" ] || continue
  slug=$(echo "$zona" | tr ' ' '_')
  ( cd "$TRAB/img" && "$CLAUDE" -p "$INSTR

Lee con la herramienta Read cada uno de estos archivos de imagen (están en la carpeta actual) y entrega el pronóstico de cada bahía:
$LISTA" --allowedTools "Read" --output-format json --json-schema "$ESQUEMA" > "$TRAB/res_$slug.json" 2> "$TRAB/err_$slug.txt" ) \
    && echo "$(ts) IA: $zona listo" || echo "$(ts) IA: $zona falló ($(head -c 200 "$TRAB/err_$slug.txt"))"
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
  const bahias = BAH.map(([zona, nombre, cod]) => {
    const base = { zona, nombre, codigo: cod, imagen: 'http://triton.directemar.cl/web/meteograma_' + cod + '.png' };
    const n = nuevos[cod], c = cambios.find(x => x[2] === cod);
    if (n) { ok++; if (c) marcas[cod] = c[3];
      const { codigo, ...pr } = n; return { ...base, pronostico: pr, generado: ahora, modelo_ia: 'Claude (suscripción, Claude Code)', error: null }; }
    const p = previo[cod] || {};
    return { ...p, ...base, error: c ? (p.pronostico ? 'pronóstico de la corrida anterior' : 'no se pudo generar') : (p.error || null) };
  });
  escribir(T + '/marcas.txt', Object.entries(marcas).map(([k, v]) => k + '|' + v).join('\n') + '\n');
  escribir(T + '/wrf_ia.json', JSON.stringify({ actualizado: ahora, modelo_ia: 'Claude (suscripción, Claude Code)', resolucion: '3 km',
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
