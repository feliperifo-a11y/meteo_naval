#!/usr/bin/env python3
"""Capa «Imagen satelital visible» del dashboard: nubosidad según la reflectancia del canal visible.

1. Descarga la imagen visible (GOES, canal 01, blanco y negro) publicada en el sitio público de imágenes
   satelitales. Solo se procesa cuando la imagen cambió (fecha Last-Modified).
2. La reflectancia (0 a 1) se lee del nivel de gris; la barra de la propia imagen es lineal (negro = 0, blanco = 1).
3. Elimina lo que no es nubosidad: costa, grilla, logo, rótulos y la barra.
4. Genera una capa para el mapa en escala de grises: cielo despejado en azul oscuro semitransparente (el mapa
   se sigue viendo debajo) y nubes en blanco, más opacas cuanto mayor la reflectancia. La zona sin Sol queda vacía.
   Resultado: data/satelite_vis.png, data/satelite_vis_polar.png (proyección de la carta) y data/satelite_vis.json.

Georreferencia: la misma de la imagen infrarroja (scripts/satelite.py), comprobada con la grilla cada 10°
y la línea de costa (desplazamiento 0 píxeles). La imagen solo tiene información de día.
Uso:  python scripts/satelite_vis.py            (FORZAR=1 para procesar aunque no haya cambiado)
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import satelite as ir  # noqa: E402  (georreferencia y proyecciones compartidas)

DATA = ir.DATA
URL = "https://web.directemar.cl/met/jturno/pub/GFS/visual.png"
PAGINA = "https://meteoarmada.directemar.cl/meteo/imagenes-fotosatelites/imagen-satelital-blanco-y-negro"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (capa satelite visible)"}
VERSION = 1
TAMANO = (930, 764)
EXCLUIR = [(0, 0, 150, 165), (820, 0, 930, 150), (0, 740, 400, 764), (918, 0, 930, 764)]   # logo, barra, rótulo inferior
R_CLARO, R_PLENO = 0.08, 0.85     # reflectancia: bajo R_CLARO fondo oscuro; sobre R_PLENO blanco


def cos_cenital(hora):
    """Coseno del ángulo cenital del Sol en cada píxel de la imagen (fórmulas de la NOAA, precisión ~0,5°)."""
    h, w = TAMANO[1], TAMANO[0]
    lon = ir.LON0 + np.arange(w) / ir.KX
    lat = -np.arange(h) / ir.KY
    LON, LAT = np.meshgrid(lon, lat)
    dia = hora.timetuple().tm_yday
    g = 2 * np.pi / 365 * (dia - 1 + (hora.hour - 12) / 24)
    decl = 0.006918 - 0.399912 * np.cos(g) + 0.070257 * np.sin(g) - 0.006758 * np.cos(2 * g) + 0.000907 * np.sin(2 * g) - 0.002697 * np.cos(3 * g) + 0.00148 * np.sin(3 * g)
    eqt = 229.18 * (0.000075 + 0.001868 * np.cos(g) - 0.032077 * np.sin(g) - 0.014615 * np.cos(2 * g) - 0.040849 * np.sin(2 * g))
    tst = hora.hour * 60 + hora.minute + eqt + 4 * LON
    ha = np.radians(tst / 4 - 180)
    la = np.radians(LAT)
    return np.sin(la) * np.sin(decl) + np.cos(la) * np.cos(decl) * np.cos(ha)


# Paleta: índice 0 = sin dato (transparente); 1…255 = reflectancia creciente, de un fondo azul oscuro
# semitransparente (cielo despejado: el mapa se sigue viendo) a blanco casi opaco (nubes densas).
_F = np.clip((np.arange(256) - 1) / 254.0, 0, 1)
_C0, _C1 = np.array([22, 40, 60]), np.array([255, 255, 255])
PALETA = (_C0[None] + (_C1 - _C0)[None] * _F[:, None] ** 0.9).round().astype(np.uint8)
ALFA = (110 + 125 * _F).round().astype(np.uint8)
ALFA[0] = 0


def pintar(r, vacio):
    """Índice de paleta (0 = vacío) según la reflectancia."""
    f = np.clip((r - R_CLARO) / (R_PLENO - R_CLARO), 0, 1)
    idx = (1 + np.round(f * 254)).astype(np.uint8)
    idx[vacio] = 0
    return idx


def guardar(idx, ruta):
    """PNG con paleta de 256 colores y transparencia por índice (exacto y liviano)."""
    p = Image.fromarray(idx, "P")
    p.putpalette(PALETA.flatten().tolist())
    p.save(ruta, optimize=True, transparency=bytes(ALFA.tolist()))
    return p


def remuestrear(R, sin_dato, X, Y, fuera=None):
    from scipy.ndimage import map_coordinates
    r = map_coordinates(R, [Y, X], order=1, mode="nearest")
    vacio = map_coordinates(sin_dato.astype(float), [Y, X], order=0, mode="nearest") > 0.5
    if fuera is not None:
        vacio |= fuera
    return pintar(r, vacio)


def capa(R, sin_dato):
    ym0, ym1 = np.log(np.tan(np.pi / 4 + np.radians(ir.SUR) / 2)), np.log(np.tan(np.pi / 4 + np.radians(ir.NORTE) / 2))
    ancho = ir.ANCHO_SALIDA
    alto = int(round(ancho * (ym1 - ym0) / np.radians(ir.ESTE - ir.OESTE)))
    LON, LAT = np.meshgrid(np.linspace(ir.OESTE, ir.ESTE, ancho),
                           np.degrees(2 * np.arctan(np.exp(np.linspace(ym1, ym0, alto))) - np.pi / 2))
    return remuestrear(R, sin_dato, (LON - ir.LON0) * ir.KX, -LAT * ir.KY), [[ir.SUR, ir.OESTE], [ir.NORTE, ir.ESTE]]


def capa_polar(R, sin_dato):
    x0, y0, x1, y1 = ir.POLAR_CAJA
    xs, ys = np.meshgrid(np.arange(x0, x1, 1.0), np.arange(y0, y1, 1.0))
    dx, dy = (xs - ir.PA) / ir.PSX, (ir.PB - ys) / ir.PSY
    lat = np.degrees(2 * np.arctan(np.hypot(dx, dy))) - 90
    lon = ir.PL0 + np.degrees(np.arctan2(dx, dy))
    X, Y = (lon - ir.LON0) * ir.KX, -lat * ir.KY
    fuera = (X < 0) | (X > TAMANO[0] - 1) | (Y < 0) | (Y > TAMANO[1] - 1) | (lat < ir.SUR)
    return remuestrear(R, sin_dato, X, Y, fuera)


def hora_imagen(im):
    if not shutil.which("tesseract"):
        subprocess.run("sudo apt-get update -qq && sudo apt-get install -y -qq tesseract-ocr", shell=True, capture_output=True, timeout=240)
    c = im.crop((0, 742, 400, 764)).convert("L")
    c = c.resize((c.width * 4, c.height * 4), Image.LANCZOS).point(lambda v: 0 if v > 140 else 255)
    with tempfile.TemporaryDirectory() as t:
        p = Path(t) / "r.png"; c.save(p)
        try:
            txt = subprocess.run(["tesseract", str(p), "-", "--psm", "7"], capture_output=True, text=True, timeout=60).stdout
        except Exception:
            txt = ""
    m = re.search(r"(\d{2})\s*/\s*(\d{2})\s*/?\s*(\d{4})\s*-\s*(\d{2})\s*[:.]?\s*(\d{2})", txt)
    sat = re.search(r"GOES\s*-?\s*(\d+)", txt.upper())
    hora = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), int(m.group(4)), int(m.group(5)), tzinfo=timezone.utc) if m else None
    return hora, (f"GOES-{sat.group(1)}" if sat else "GOES"), txt.strip()


def main():
    previo = ir.leer_json(DATA / "satelite_vis.json", {})
    try:
        r = requests.get(URL, headers=CAB, timeout=60)
        r.raise_for_status()
    except Exception as e:
        print("Visible: no se pudo descargar:", e); return
    lm = r.headers.get("Last-Modified", "")
    if lm and lm == previo.get("last_modified") and previo.get("version") == VERSION and os.environ.get("FORZAR") != "1":
        print("Visible: sin cambios", lm); return
    im = Image.open(io.BytesIO(r.content)).convert("RGB")
    if im.size != TAMANO:
        print("Visible: cambió el tamaño de la imagen", im.size, "→ no se publica"); return
    a = np.asarray(im)
    g = a.mean(2)
    def linea(x):
        return max(np.mean(g[:, c] - np.maximum(g[:, c - 2], g[:, c + 2]) > 12) for c in (x - 1, x, x + 1))
    ok = sum(linea(int(round(k * 10 * ir.KX))) > 0.2 for k in range(2, 7))
    if ok < 3:
        print(f"Visible: la grilla no calza ({ok}/5) → no se publica"); return
    hora, sat, txt = hora_imagen(im)
    print("OCR:", txt, "→", hora)
    Rf = g / 255.0
    noche = np.zeros(g.shape, bool)
    if hora:   # corrige la iluminación (amanecer y atardecer); sin Sol no hay dato
        mu = cos_cenital(hora)
        noche = mu < 0.10
        Rf = np.clip(Rf / np.maximum(mu, 0.40) ** 0.8, 0, 1)
    malos = ir.mascara_ruido(a)
    for k in range(1, 10):                       # grilla punteada: margen de 2 píxeles
        x = int(round(k * 10 * ir.KX)); y = int(round(k * 10 * ir.KY))
        malos[:, max(0, x - 2):x + 3] = True
        malos[max(0, y - 2):y + 3, :] = True
    for x0, y0, x1, y1 in EXCLUIR:
        malos[y0:y1, x0:x1] = True
    from scipy.ndimage import distance_transform_edt
    _, (iy, ix) = distance_transform_edt(malos, return_indices=True)
    Rf = Rf[iy, ix]
    sin_dato = noche.copy()
    for x0, y0, x1, y1 in EXCLUIR:
        sin_dato[y0:y1, x0:x1] = True
    idx, limites = capa(Rf, sin_dato)
    img = guardar(idx, DATA / "satelite_vis.png")
    guardar(capa_polar(Rf, sin_dato), DATA / "satelite_vis_polar.png")
    meta = {"version": VERSION, "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "last_modified": lm,
            "hora": hora.strftime("%Y-%m-%dT%H:%MZ") if hora else None, "satelite": sat, "canal": "01 · visible azul",
            "limites": limites, "polar": {"x0": ir.POLAR_CAJA[0], "y0": ir.POLAR_CAJA[1], "x1": ir.POLAR_CAJA[2], "y1": ir.POLAR_CAJA[3]},
            "reflectancia_min": R_CLARO, "fraccion_de_dia": round(float(1 - noche.mean()), 2), "fuente": PAGINA, "imagen": URL}
    (DATA / "satelite_vis.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"Visible: capa publicada ({img.size[0]}×{img.size[1]}), imagen {meta['hora']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Visible: error", e)
    sys.exit(0)
