#!/usr/bin/env python3
"""Arma index.html a partir de build/plantilla.html, Leaflet y las capas geográficas de data/geo.
Los datos de estaciones y avisos se leen en el navegador desde data/*.json; aquí solo se incorpora
una copia de respaldo para cuando la página se abre como archivo local.
Ejecutar solo cuando cambie la plantilla o las capas:  python scripts/construir_index.py"""
import json
from pathlib import Path

R = Path(__file__).resolve().parent.parent
B, D = R / "build", R / "data"


def leer(p, defecto="null"):
    return p.read_text(encoding="utf-8") if p.exists() else defecto


respaldo = {"estaciones": json.loads(leer(D / "estaciones.json", "{}")), "avisos": json.loads(leer(D / "avisos.json", "{}")),
            "boyas": json.loads(leer(D / "boyas.json", "{}"))}
datos = "\n".join([
    "const LIMITES = " + leer(D / "geo" / "limites.json") + ";",
    "const LAND = " + leer(D / "geo" / "land.json") + ";",
    "const METAREA = " + leer(D / "geo" / "metarea.json") + ";",
    "const RESPALDO = " + json.dumps(respaldo, ensure_ascii=False, separators=(",", ":")) + ";",
])
html = (leer(B / "plantilla.html").replace("/*LEAFLET_CSS*/", leer(B / "leaflet.css"))
        .replace("/*LEAFLET_JS*/", leer(B / "leaflet.js")).replace("/*DATA*/", datos))
(R / "index.html").write_text(html, encoding="utf-8")
print(f"index.html: {len(html) / 1024:.0f} KB")
