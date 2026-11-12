#!/usr/bin/env python3
"""Arma index.html (build/plantilla_v2.html), dashboard.html (build/plantilla.html) e ia.html (build/plantilla_ia.html) a partir de las plantillas, Leaflet y las capas geográficas de data/geo.
Los datos de estaciones y avisos se leen en el navegador desde data/*.json; aquí solo se incorpora
una copia de respaldo para cuando la página se abre como archivo local.
Ejecutar solo cuando cambie la plantilla o las capas:  python scripts/construir_index.py"""
import hashlib
import json
from pathlib import Path

R = Path(__file__).resolve().parent.parent
B, D = R / "build", R / "data"


def leer(p, defecto="null"):
    return p.read_text(encoding="utf-8") if p.exists() else defecto


def preparar_avisos(html):
    """Resumen de avisos compartido por la portada y el dashboard operativo."""
    return (html.replace("/*AVISOS_MAPA_CSS*/", leer(B / "avisos_mapa.css", ""))
            .replace("/*AVISOS_MAPA_JS*/", leer(B / "avisos_mapa.js", "")))


def _sug_css():
    t = leer(B / "plantilla.html", "")
    return "\n".join(l for l in t.splitlines() if l.startswith(("#dlgSug", ".sugCaja", ".sugCerrar")))


SUG_CSS = None


def preparar_app(html):
    global SUG_CSS
    if SUG_CSS is None:
        SUG_CSS = _sug_css()
    """Ajustes compartidos de la app; se aplican a todas las páginas generadas."""
    html = html.replace('width=device-width, initial-scale=1.0',
                        'width=device-width, initial-scale=1.0, viewport-fit=cover')
    metas = ''
    if 'name="apple-mobile-web-app-capable"' not in html:
        metas += '<meta name="apple-mobile-web-app-capable" content="yes">\n'
    if 'name="apple-mobile-web-app-status-bar-style"' not in html:
        metas += '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
    html = html.replace('</head>', metas + '<style>\n' + leer(B / 'movil.css', '') + '\n</style>\n</head>')
    # Botón flotante de sugerencias en todas las páginas (el diálogo solo si la página no lo trae)
    if 'id="sugFlot"' not in html:
        sug = leer(B / 'sugerencias.html', '')
        if 'id="dlgSug"' in html:
            sug = sug.replace('<!--SUG_DLG-->', '').replace('/*SUG_DLG_CSS*/', '')
        else:
            sug = sug.replace('<!--SUG_DLG-->', leer(B / 'sugerencias_dlg.html', '')).replace('/*SUG_DLG_CSS*/', SUG_CSS)
        i = html.rfind('</body>')
        html = html[:i] + sug + html[i:] if i >= 0 else html + sug
    return html


respaldo = {"estaciones": json.loads(leer(D / "estaciones.json", "{}")), "avisos": json.loads(leer(D / "avisos.json", "{}"))}
datos = "\n".join([
    "const VALPARAISO = " + leer(D / "geo" / "valparaiso.geojson", "{}") + ";",
    "const VALPARAISO_LIMITES = " + leer(D / "geo" / "valparaiso_limites.json", "{}") + ";",
    "const FONDEOS_TALCAHUANO = " + leer(D / "geo" / "talcahuano_fondeos.geojson", "{}") + ";",
    "const TALCAHUANO = " + leer(D / "geo" / "talcahuano.geojson", "{}") + ";",
    "const SAR = " + leer(D / "geo" / "sar.json") + ";",
    "const LIMITES = " + leer(D / "geo" / "limites.json") + ";",
    "const LAND = " + leer(D / "geo" / "land.json") + ";",
    "const METAREA = " + leer(D / "geo" / "metarea.json") + ";",
    "const RESPALDO = " + json.dumps(respaldo, ensure_ascii=False, separators=(",", ":")) + ";",
])
# Versión de la página: cambia solo cuando cambian la plantilla o las capas (no con cada dato).
# Las pestañas abiertas la comparan con version.txt y se recargan solas al publicarse una versión nueva.
version = hashlib.sha1((leer(B / "plantilla.html") + leer(B / "plantilla_ia.html") + leer(B / "plantilla_pron.html") + leer(B / "plantilla_hielo.html") + leer(B / "plantilla_v2.html") + leer(B / "plantilla_wrfia.html") + leer(B / "plantilla_monan.html") + leer(B / "i18n.js", "") + leer(B / "ia_comun.js") + leer(B / "instalar.js") + leer(B / "estadisticas.js") + leer(B / "movil.css") + leer(B / "sugerencias.html", "") + leer(B / "sugerencias_dlg.html", "")
                        + leer(B / "sar.js", "") + leer(D / "geo" / "sar.json", "{}") + leer(B / "ww3.js", "") + leer(B / "ecmwf.js", "") + leer(B / "sst.js", "") + leer(B / "hielo_amsr2.js", "") + leer(B / "capas_modelo_portada.css", "") + leer(B / "deriva_sar.js", "") + leer(B / "caso_sar.js", "") + leer(B / "derrotero_lugares.js", "") + leer(B / "clima_derrotero.js", "").replace("/*CLIMA_JSON*/{ fuente: '', eje_estrecho_occidental: [], zonas: {} }", leer(D / "clima_derrotero.json", "{}")) + leer(B / "marejadas_alerta.js", "") + leer(B / "marejadas_alerta.css", "") + leer(B / "viento_alerta.js", "") + leer(B / "viento_alerta.css", "") + leer(B / "evaluacion_ia.js", "") + leer(B / "evaluacion_ia.css", "") + leer(B / "borrador_boletin.js", "") + leer(B / "umbrales_viento.js", "") + leer(B / "trombas.js", "") + leer(B / "trombas.css", "") + leer(B / "ruta_mar.js", "") + leer(B / "ruta_informe.js", "") + leer(B / "rutas_tipo.js", "") + leer(B / "ruta.js", "") + leer(B / "ruta.css", "")
                        + leer(B / "avisos_mapa.css", "") + leer(B / "avisos_mapa.js", "")
                        + leer(B / "wrf_servimet.js", "") + leer(B / "marejadas_uv.js", "") + leer(B / "marejadas_uv.css", "")
                        + leer(B / "valparaiso.js", "") + leer(B / "valparaiso.css", "") + leer(D / "geo" / "valparaiso.geojson", "{}") + leer(D / "geo" / "valparaiso_limites.json", "{}") + leer(D / "geo" / "valparaiso.kml", "")
                        + leer(B / "fondeos_talcahuano.js", "") + leer(D / "geo" / "talcahuano_fondeos.geojson", "{}") + leer(D / "geo" / "talcahuano_fondeos.kml", "")
                        + leer(B / "talcahuano.js", "") + leer(B / "talcahuano.css", "") + leer(D / "geo" / "talcahuano.geojson", "{}") + leer(D / "geo" / "talcahuano.kml", "")
                        + leer(D / "geo" / "metarea.json")).encode()).hexdigest()[:12]
(R / "version.txt").write_text(version + "\n", encoding="utf-8")
datos += "\nconst VERSION_PAGINA = " + json.dumps(version) + ";"
html = (leer(B / "plantilla.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css"))
        .replace("/*LEAFLET_JS*/", leer(B / "leaflet.js")).replace("/*DATA*/", datos).replace("/*IA_COMUN*/", leer(B / "ia_comun.js"))
        .replace("/*SAR*/", leer(B / "sar.js", ""))
        .replace("/*WW3_JS*/", leer(B / "ww3.js", ""))
        .replace("/*ECMWF_JS*/", leer(B / "ecmwf.js", ""))
        .replace("/*SST_JS*/", leer(B / "sst.js", ""))
        .replace("/*HIELO_AMSR2_JS*/", leer(B / "hielo_amsr2.js", ""))
        .replace("/*CASO_SAR_JS*/", leer(B / "deriva_sar.js", "").split("if (typeof module")[0] + leer(B / "caso_sar.js", ""))
        .replace("/*MAREJADAS_ALERTA_JS*/", leer(B / "marejadas_alerta.js", ""))
        .replace("/*VIENTO_ALERTA_JS*/", leer(B / "viento_alerta.js", ""))
        .replace("/*EVALUACION_IA_JS*/", leer(B / "evaluacion_ia.js", ""))
        .replace("/*BORRADOR_BOLETIN_JS*/", leer(B / "borrador_boletin.js", ""))
        .replace("/*QC_ESTACIONES_JS*/", leer(B / "qc_estaciones.js", ""))
        .replace("/*RUTA_JS*/", leer(B / "derrotero_lugares.js", "") + "\n" + leer(B / "clima_derrotero.js", "").replace("/*CLIMA_JSON*/{ fuente: '', eje_estrecho_occidental: [], zonas: {} }", leer(D / "clima_derrotero.json", "{}")) + "\n" + leer(B / "ruta_mar.js", "") + "\n" + leer(B / "rutas_tipo.js", "") + "\n" + leer(B / "ruta_informe.js", "") + "\n" + leer(B / "ruta.js", ""))
        .replace("/*RUTA_CSS*/", leer(B / "ruta.css", ""))
        .replace("/*TROMBAS_JS*/", leer(B / "trombas.js", ""))
        .replace("/*TROMBAS_CSS*/", leer(B / "trombas.css", ""))
        .replace("/*EVALUACION_IA_CSS*/", leer(B / "evaluacion_ia.css", ""))
        .replace("/*VIENTO_ALERTA_CSS*/", leer(B / "viento_alerta.css", ""))
        .replace("/*UMBRALES_VIENTO_JS*/", leer(B / "umbrales_viento.js", ""))
        .replace("/*MAREJADAS_ALERTA_CSS*/", leer(B / "marejadas_alerta.css", ""))
        .replace("/*WRF_SERVIMET_JS*/", leer(B / "wrf_servimet.js", ""))
        .replace("/*MAREJADAS_UV_JS*/", leer(B / "marejadas_uv.js", ""))
        .replace("/*MAREJADAS_UV_CSS*/", leer(B / "marejadas_uv.css", ""))
        .replace("/*VALPARAISO_JS*/", leer(B / "valparaiso.js", ""))
        .replace("/*VALPARAISO_CSS*/", leer(B / "valparaiso.css", ""))
        .replace("/*FONDEOS_TALCAHUANO_JS*/", leer(B / "fondeos_talcahuano.js", ""))
        .replace("/*TALCAHUANO_JS*/", leer(B / "talcahuano.js", ""))
        .replace("/*TALCAHUANO_CSS*/", leer(B / "talcahuano.css", ""))
        .replace("/*INSTALAR*/", leer(B / "instalar.js") + "\n" + leer(B / "estadisticas.js")))
(R / "dashboard.html").write_text(preparar_app(preparar_avisos(html)), encoding="utf-8")
print(f"dashboard.html: {len(html) / 1024:.0f} KB")
# Carta de superficie pública (carta.html): la misma página en modo «solo carta», siempre. Así la página Desarrollo
# (dashboard.html) puede quedar con acceso restringido sin romper los enlaces públicos a la carta.
MARCA_CARTA = "try { if (new URLSearchParams(location.search).has('carta')) document.documentElement.classList.add('soloCarta'); } catch (e) {}"
html_dash = (R / "dashboard.html").read_text(encoding="utf-8")
assert MARCA_CARTA in html_dash, "falta la marca del modo solo carta"
(R / "carta.html").write_text(html_dash.replace(MARCA_CARTA, "document.documentElement.classList.add('soloCarta');")
                              .replace("<title>", "<meta name=\"robots\" content=\"noindex\"><title>", 1), encoding="utf-8")

# Rutas de navegación públicas (rutas.html): la página Desarrollo en modo «solo ruta», con los colores de la portada.
MARCA_RUTA = "try { if (new URLSearchParams(location.search).has('rutas')) {"
assert MARCA_RUTA in html_dash, "falta la marca del modo solo ruta"
(R / "rutas.html").write_text(html_dash.replace(MARCA_RUTA, "try { if (true) {", 1)
                              .replace("<title>", "<meta name=\"description\" content=\"Rutas de navegación: condiciones meteorológicas y oceanográficas a lo largo de la ruta, avisos y estado de puerto.\"><title>", 1), encoding="utf-8")

# Página de pronósticos WRF + IA: solo necesita la costa y la METAREA XV.
datos_ia = "\n".join(["const LAND = " + leer(D / "geo" / "land.json") + ";", "const METAREA = " + leer(D / "geo" / "metarea.json") + ";",
                      "const VERSION_PAGINA = " + json.dumps(version) + ";"])
html_ia = (leer(B / "plantilla_ia.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css")).replace("/*LEAFLET_JS*/", leer(B / "leaflet.js"))
           .replace("/*DATA*/", datos_ia).replace("/*IA_COMUN*/", leer(B / "ia_comun.js")).replace("/*INSTALAR*/", leer(B / "instalar.js") + "\n" + leer(B / "estadisticas.js")))
(R / "ia.html").write_text(preparar_app(html_ia), encoding="utf-8")
print(f"ia.html: {len(html_ia) / 1024:.0f} KB")

# Página WRF + IA: pronósticos de bahía redactados con IA sobre el mapa.
html_wrfia = (leer(B / "plantilla_wrfia.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css")).replace("/*LEAFLET_JS*/", leer(B / "leaflet.js"))
              .replace("/*DATA*/", datos_ia).replace("/*INSTALAR*/", leer(B / "instalar.js") + "\n" + leer(B / "estadisticas.js")))
(R / "wrfia.html").write_text(preparar_app(html_wrfia), encoding="utf-8")
print(f"wrfia.html: {len(html_wrfia) / 1024:.0f} KB")

# Página MONAN 3 km: corrida propia (repositorio trombas_marinas), comparación con el pronóstico local y verificación.
html_monan = (leer(B / "plantilla_monan.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css")).replace("/*LEAFLET_JS*/", leer(B / "leaflet.js"))
              .replace("/*DATA*/", datos_ia).replace("/*INSTALAR*/", leer(B / "instalar.js") + "\n" + leer(B / "estadisticas.js")))
(R / "monan.html").write_text(preparar_app(html_monan), encoding="utf-8")
print(f"monan.html: {len(html_monan) / 1024:.0f} KB")

# Página de pronósticos marítimos publicados (bahías y áreas): misma estructura que la de WRF + IA.
html_pron = (leer(B / "plantilla_pron.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css")).replace("/*LEAFLET_JS*/", leer(B / "leaflet.js"))
             .replace("/*DATA*/", datos_ia).replace("/*IA_COMUN*/", leer(B / "ia_comun.js")).replace("/*INSTALAR*/", leer(B / "instalar.js") + "\n" + leer(B / "estadisticas.js")))
(R / "pronosticos.html").write_text(preparar_app(html_pron), encoding="utf-8")
print(f"pronosticos.html: {len(html_pron) / 1024:.0f} KB")

# Página de monitoreo de hielos (Península Antártica): misma presentación polar que la carta de superficie.
datos_hielo = "\n".join(["const LIMITES = " + leer(D / "geo" / "limites.json") + ";", datos_ia])
html_hielo = (leer(B / "plantilla_hielo.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css")).replace("/*LEAFLET_JS*/", leer(B / "leaflet.js"))
              .replace("/*DATA*/", datos_hielo).replace("/*INSTALAR*/", leer(B / "instalar.js") + "\n" + leer(B / "estadisticas.js")))
(R / "hielos.html").write_text(preparar_app(html_hielo), encoding="utf-8")
print(f"hielos.html: {len(html_hielo) / 1024:.0f} KB")

# Página principal con el nuevo diseño (tema oscuro, campo de viento GFS y paneles de resumen); el dashboard clásico queda en dashboard.html
html_v2 = (leer(B / "plantilla_v2.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css")).replace("/*LEAFLET_JS*/", leer(B / "leaflet.js"))
           .replace("/*DATA*/", datos_ia)
           .replace("/*IA_COMUN*/", leer(B / "ia_comun.js")).replace("/*INSTALAR*/", leer(B / "instalar.js") + "\n" + leer(B / "estadisticas.js"))
           .replace("/*WW3_JS*/", leer(B / "ww3.js", "")).replace("/*ECMWF_JS*/", leer(B / "ecmwf.js", "")).replace("/*SST_JS*/", leer(B / "sst.js", ""))
        .replace("/*HIELO_AMSR2_JS*/", leer(B / "hielo_amsr2.js", ""))
           .replace("/*UMBRALES_VIENTO_JS*/", leer(B / "umbrales_viento.js", ""))
           .replace("/*CAPAS_MODELO_CSS*/", leer(B / "marejadas_uv.css", "") + leer(B / "capas_modelo_portada.css", "")))
# Versión en inglés de la portada: el traductor de la interfaz va al inicio del <head>, antes del código de la página.
html_v2 = html_v2.replace("<head>", "<head>\n<script>" + leer(B / "i18n.js") + "</script>", 1)
(R / "index.html").write_text(preparar_app(preparar_avisos(html_v2)), encoding="utf-8")
print(f"index.html: {len(html_v2) / 1024:.0f} KB")
# La dirección de la versión de prueba redirige a la portada.
(R / "nuevo.html").write_text('<!doctype html><meta charset="utf-8"><title>MeteoIA</title><meta http-equiv="refresh" content="0; url=./"><a href="./">MeteoIA</a>\n', encoding="utf-8")

