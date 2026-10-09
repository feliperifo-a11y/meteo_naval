#!/usr/bin/env python3
"""Arma index.html (build/plantilla.html) e ia.html (build/plantilla_ia.html) a partir de las plantillas, Leaflet y las capas geográficas de data/geo.
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


respaldo = {"estaciones": json.loads(leer(D / "estaciones.json", "{}")), "avisos": json.loads(leer(D / "avisos.json", "{}"))}
datos = "\n".join([
    "const LIMITES = " + leer(D / "geo" / "limites.json") + ";",
    "const LAND = " + leer(D / "geo" / "land.json") + ";",
    "const METAREA = " + leer(D / "geo" / "metarea.json") + ";",
    "const RESPALDO = " + json.dumps(respaldo, ensure_ascii=False, separators=(",", ":")) + ";",
])
# Versión de la página: cambia solo cuando cambian la plantilla o las capas (no con cada dato).
# Las pestañas abiertas la comparan con version.txt y se recargan solas al publicarse una versión nueva.
version = hashlib.sha1((leer(B / "plantilla.html") + leer(B / "plantilla_ia.html") + leer(B / "ia_comun.js") + leer(B / "instalar.js")
                        + leer(D / "geo" / "metarea.json")).encode()).hexdigest()[:12]
(R / "version.txt").write_text(version + "\n", encoding="utf-8")
datos += "\nconst VERSION_PAGINA = " + json.dumps(version) + ";"
html = (leer(B / "plantilla.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css"))
        .replace("/*LEAFLET_JS*/", leer(B / "leaflet.js")).replace("/*DATA*/", datos).replace("/*IA_COMUN*/", leer(B / "ia_comun.js"))
        .replace("/*INSTALAR*/", leer(B / "instalar.js")))
(R / "index.html").write_text(html, encoding="utf-8")
print(f"index.html: {len(html) / 1024:.0f} KB")

# Página de pronósticos WRF + IA: solo necesita la costa y la METAREA XV.
datos_ia = "\n".join(["const LAND = " + leer(D / "geo" / "land.json") + ";", "const METAREA = " + leer(D / "geo" / "metarea.json") + ";",
                      "const VERSION_PAGINA = " + json.dumps(version) + ";"])
html_ia = (leer(B / "plantilla_ia.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css")).replace("/*LEAFLET_JS*/", leer(B / "leaflet.js"))
           .replace("/*DATA*/", datos_ia).replace("/*IA_COMUN*/", leer(B / "ia_comun.js")).replace("/*INSTALAR*/", leer(B / "instalar.js")))
(R / "ia.html").write_text(html_ia, encoding="utf-8")
print(f"ia.html: {len(html_ia) / 1024:.0f} KB")
