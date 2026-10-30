"""Descarga de imágenes de web.directemar.cl con respaldo desde el equipo local.

El servidor de DIRECTEMAR a veces rechaza las descargas desde los servidores de GitHub Actions.
El Mac de la casa (mac/subir_estaciones.sh) baja las mismas imágenes y, cuando cambian, las deja en la
rama «fuentes» del repositorio junto con fuentes.json, que guarda la fecha Last-Modified original.

descargar(url) intenta primero la descarga directa; si falla, usa la copia de la rama «fuentes» y
entrega la Last-Modified original, para que la detección de «sin cambios» de cada script siga igual.
"""
import json
import os
import time
from pathlib import PurePosixPath
from types import SimpleNamespace

import requests

REPO = os.environ.get("GITHUB_REPOSITORY", "feliperifo-a11y/meteo_naval")
RAMA = "fuentes"
RAW = f"https://raw.githubusercontent.com/{REPO}/{RAMA}"


def _respaldo(nombre):
    t = int(time.time())
    m = requests.get(f"{RAW}/fuentes.json?t={t}", timeout=30)
    m.raise_for_status()
    meta = json.loads(m.text).get(nombre)
    if not meta:
        raise RuntimeError(f"{nombre} no está en la rama {RAMA}")
    r = requests.get(f"{RAW}/{nombre}?t={t}", timeout=60)
    r.raise_for_status()
    return SimpleNamespace(content=r.content, headers={"Last-Modified": meta.get("last_modified", "")},
                           origen=f"equipo local ({meta.get('subido', '?')})")


def descargar(url, cab, timeout=30):
    """Devuelve un objeto con .content, .headers (Last-Modified) y .origen; lanza excepción si fallan ambas vías."""
    try:
        r = requests.get(url, headers=cab, timeout=timeout)
        r.raise_for_status()
        return SimpleNamespace(content=r.content, headers=r.headers, origen="directo")
    except Exception as e:
        print(f"  descarga directa falló ({e}); se usa la copia del equipo local")
    return _respaldo(PurePosixPath(url).name)
