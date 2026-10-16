#!/usr/bin/env python3
"""Capa «Imagen satelital IR» del dashboard: nubosidad según la paleta de temperaturas de brillo.

1. Descarga la imagen infrarroja realzada (GOES, canal 13) publicada en el sitio público de imágenes
   satelitales. Solo se procesa cuando la imagen cambió (fecha Last-Modified).
2. Convierte cada píxel a temperatura de brillo con la propia barra de colores de la imagen
   (de +60 °C a −80 °C): la escala de grises y los tramos de color se leen de la barra.
3. Elimina lo que no es nubosidad: costa, grilla, logo, rótulos y la barra.
4. Genera una capa transparente para el mapa (proyección Mercator):
     · T > +5 °C (mar, tierra cálida): transparente;
     · de +5 °C a −20 °C (nubes bajas y medias): blanco con opacidad creciente;
     · T ≤ −20 °C (topes fríos): los colores de la paleta original.
   Resultado: data/satelite_ir.png y data/satelite.json (límites, hora de la imagen, leyenda).

Georreferencia: la imagen es una grilla regular de latitud y longitud (equirectangular),
130° W a 40° W y 0° a 77° S, ajustada con la grilla cada 10° y la línea de costa (error < 1 píxel).
Si la imagen cambia de tamaño o de encuadre, no se publica la capa.
Uso:  python scripts/satelite.py            (FORZAR=1 para procesar aunque no haya cambiado)
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
URL = "https://web.directemar.cl/met/jturno/pub/GFS/color.png"
PAGINA = "https://meteoarmada.directemar.cl/meteo/imagen-satelital-infraroja"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (capa satelite IR)"}
VERSION = 1

TAMANO = (930, 795)
# Georreferencia (ajuste con grilla y costa): x = (lon + 130)·KX ; y = −lat·KY
KX, KY, LON0 = 10.3248, 10.3142, -130.0
# Barra de colores: columna y filas, y su escala (60 °C en y = 12,4; 20 °C cada 15,5 píxeles)
BARRA_X, BARRA_Y0, BARRA_Y1 = 917, 6, 122
EXCLUIR = [(0, 0, 150, 165), (840, 0, 930, 140), (0, 765, 480, 795)]   # logo, barra, rótulo inferior
# Salida
OESTE, ESTE, NORTE = -130.0, -40.0, 0.0
SUR = -70.0          # al sur de 70° S la imagen trae rótulos y hielo continental (no es nubosidad)
ANCHO_SALIDA = 1500
T_CLARO, T_COLOR = 5.0, -20.0


def temp_barra(y):
    return 60.0 - (y - 12.4) * 20.0 / 15.5


def leer_json(p, defecto):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return defecto


def tabla_colores(a):
    cols, temps = [], []
    for y in range(BARRA_Y0, BARRA_Y1 + 1):
        c = a[y, BARRA_X - 1:BARRA_X + 2].mean(0)
        cols.append(c)
        temps.append(temp_barra(y))
    return np.array(cols), np.array(temps)


def temperatura(a):
    """Temperatura de brillo de cada píxel por el color más parecido de la barra."""
    from scipy.spatial import cKDTree
    cols, temps = tabla_colores(a)
    arbol = cKDTree(cols)
    d, i = arbol.query(a.reshape(-1, 3).astype(float), k=1)
    return temps[i].reshape(a.shape[:2]), d.reshape(a.shape[:2])


def mascara_ruido(a):
    """Costa (granate), líneas de grilla y recuadros que no son nubosidad."""
    R, G, B = (a[..., i].astype(int) for i in range(3))
    m = (R > 100) & (G < 70) & (R - G > 60) & (R - B > 15)          # costa y límites
    for k in range(1, 10):                                          # grilla cada 10°
        x = int(round(k * 10 * KX)); y = int(round(k * 10 * KY))
        m[:, max(0, x - 1):x + 2] = True
        m[max(0, y - 1):y + 2, :] = True
    for x0, y0, x1, y1 in EXCLUIR:
        m[y0:y1, x0:x1] = True
    from scipy.ndimage import binary_dilation
    return binary_dilation(m, iterations=1)


def rellenar(T, a, malos):
    """Reemplaza costa, grilla y rótulos por el píxel válido más cercano (temperatura y color)."""
    from scipy.ndimage import distance_transform_edt
    _, (iy, ix) = distance_transform_edt(malos, return_indices=True)
    return T[iy, ix], a[iy, ix]


def capa(T, a, sin_dato=None):
    from scipy.ndimage import map_coordinates
    ym0, ym1 = np.log(np.tan(np.pi / 4 + np.radians(SUR) / 2)), np.log(np.tan(np.pi / 4 + np.radians(NORTE) / 2))
    ancho = ANCHO_SALIDA
    alto = int(round(ancho * (ym1 - ym0) / np.radians(ESTE - OESTE)))
    lons = np.linspace(OESTE, ESTE, ancho)
    lats = np.degrees(2 * np.arctan(np.exp(np.linspace(ym1, ym0, alto))) - np.pi / 2)
    LON, LAT = np.meshgrid(lons, lats)
    X, Y = (LON - LON0) * KX, -LAT * KY
    t = map_coordinates(T, [Y, X], order=1, mode="nearest")
    rgb = np.stack([map_coordinates(a[..., i].astype(float), [Y, X], order=0, mode="nearest") for i in range(3)], -1)
    out = np.zeros(LON.shape + (4,), np.uint8)
    vacio = map_coordinates(sin_dato.astype(float), [Y, X], order=0, mode="nearest") > 0.5 if sin_dato is not None else np.zeros(LON.shape, bool)
    nube = (t < T_CLARO) & (t > T_COLOR)
    out[nube, :3] = 255
    out[nube, 3] = (np.clip((T_CLARO - t[nube]) / (T_CLARO - T_COLOR), 0, 1) * 0.55 * 255 + 25).astype(np.uint8)
    fria = t <= T_COLOR
    out[fria, :3] = rgb[fria].astype(np.uint8)
    out[fria, 3] = 225
    out[vacio] = 0                                   # logo, barra y rótulo: sin dato
    return Image.fromarray(out, "RGBA"), [[SUR, OESTE], [NORTE, ESTE]]


def hora_imagen(im):
    """Fecha y hora del rótulo inferior (OCR); sin OCR, None."""
    if not shutil.which("tesseract"):
        subprocess.run("sudo apt-get update -qq && sudo apt-get install -y -qq tesseract-ocr", shell=True, capture_output=True, timeout=240)
    c = im.crop((0, 768, 480, 795)).convert("L")
    c = c.resize((c.width * 4, c.height * 4), Image.LANCZOS).point(lambda v: 0 if v > 140 else 255)
    with tempfile.TemporaryDirectory() as t:
        p = Path(t) / "r.png"; c.save(p)
        try:
            txt = subprocess.run(["tesseract", str(p), "-", "--psm", "7"], capture_output=True, text=True, timeout=60).stdout
        except Exception:
            txt = ""
    m = re.search(r"(\d{2})\s*/\s*(\d{2})\s*/?\s*(\d{4})\s*-\s*(\d{2})\s*:\s*(\d{2})", txt)
    sat = re.search(r"GOES\s*-?\s*(\d+)", txt.upper())
    hora = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), int(m.group(4)), int(m.group(5)), tzinfo=timezone.utc) if m else None
    return hora, (f"GOES-{sat.group(1)}" if sat else "GOES"), txt.strip()


def main():
    previo = leer_json(DATA / "satelite.json", {})
    try:
        r = requests.get(URL, headers=CAB, timeout=60)
        r.raise_for_status()
    except Exception as e:
        print("Satélite: no se pudo descargar:", e); return
    lm = r.headers.get("Last-Modified", "")
    if lm and lm == previo.get("last_modified") and previo.get("version") == VERSION and os.environ.get("FORZAR") != "1":
        print("Satélite: sin cambios", lm); return
    im = Image.open(io.BytesIO(r.content)).convert("RGB")
    if im.size != TAMANO:
        print("Satélite: cambió el tamaño de la imagen", im.size, "→ no se publica"); return
    a = np.asarray(im)
    # Control de encuadre: la grilla debe estar en las columnas y filas esperadas
    g = a.mean(2)
    def linea(x):
        return max(np.mean(g[:, c] - np.maximum(g[:, c - 2], g[:, c + 2]) > 12) for c in (x - 1, x, x + 1))
    ok = sum(linea(int(round(k * 10 * KX))) > 0.2 for k in range(2, 7))
    if ok < 3:
        print(f"Satélite: la grilla no calza ({ok}/5) → no se publica"); return
    T, d = temperatura(a)
    malos = mascara_ruido(a) | (d > 60)
    T, a_limpia = rellenar(T, a, malos)
    sin_dato = np.zeros(a.shape[:2], bool)
    for x0, y0, x1, y1 in EXCLUIR:
        sin_dato[y0:y1, x0:x1] = True
    img, limites = capa(T, a_limpia, sin_dato)
    img.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(DATA / "satelite_ir.png", optimize=True)
    hora, sat, txt = hora_imagen(im)
    print("OCR:", txt, "→", hora)
    meta = {"version": VERSION, "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "last_modified": lm,
            "hora": hora.strftime("%Y-%m-%dT%H:%MZ") if hora else None, "satelite": sat, "canal": "13 · IR onda larga",
            "limites": limites, "umbral_nube_c": T_CLARO, "umbral_color_c": T_COLOR, "fuente": PAGINA, "imagen": URL}
    (DATA / "satelite.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"Satélite: capa publicada ({img.size[0]}×{img.size[1]}), imagen {meta['hora']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Satélite: error", e)
    sys.exit(0)
