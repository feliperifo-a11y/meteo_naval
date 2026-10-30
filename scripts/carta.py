#!/usr/bin/env python3
"""Capa «Carta sinóptica» del dashboard: frentes del análisis + isobaras del modelo GFS.

1. Descarga la carta de superficie pronosticada (imagen pública, proyección estereográfica polar).
   Solo se procesa cuando la imagen cambió (fecha Last-Modified).
2. Lee de la propia carta la fecha de validez y la corrida del modelo (OCR del recuadro y la leyenda).
3. Separa los frentes y los centros A/B (trazos de color rojo, azul y morado), descarta el fondo,
   la costa y las isobaras en negro, y reproyecta esos trazos a la proyección del mapa (Mercator).
   Resultado: data/carta_frentes.png (transparente) y sus límites geográficos.
4. Calcula las isobaras (cada 4 hPa) con la presión a nivel del mar del GFS 0,5° para la misma
   corrida y hora de validez de la carta, y las guarda como líneas: data/carta_isobaras.json.
5. data/carta.json reúne la fecha de validez, la corrida, los límites de la imagen y el origen.

La proyección de la carta se ajustó con su grilla de meridianos y paralelos (error < 1 píxel):
    x = A + SX·ρ·sen(λ − λ0) ;  y = B − SY·ρ·cos(λ − λ0) ;  ρ = tan(45° + φ/2)
Si la carta cambia de encuadre, el script lo detecta (la grilla ya no calza) y no publica frentes.

Si algo falla se conservan los archivos anteriores y el script termina sin error.
Uso:  python scripts/carta.py            (FORZAR=1 para procesar aunque la carta no haya cambiado)
"""
import io
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import requests
from PIL import Image

from fuente_directemar import descargar  # noqa: E402  (respaldo desde el equipo local)

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
URL_CARTA = "https://web.directemar.cl/met/jturno/cartas/carta.jpg"
PAGINA_CARTA = "https://meteoarmada.directemar.cl/meteo/cartas-sinopticas/carta-de-superficie-blanco-y-negro"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (capa carta sinoptica)"}

# Proyección de la carta (ajuste por mínimos cuadrados sobre la grilla de la imagen de 1000 x 800)
A, B, SX, SY, L0 = 519.41, 866.82, 1125.44, 1001.72, -90.08
TAMANO = (1000, 800)
MARCO = (49, 28, 992, 793)                 # zona del mapa dentro de la imagen (x0, y0, x1, y1)
RECUADROS = [(55, 33, 360, 100), (720, 735, 995, 795)]   # título y leyenda (se excluyen)
# Grilla de control para verificar que el encuadre no cambió: (lon, lat) -> debe caer sobre línea gris
CONTROL = [(-90, -20), (-90, -30), (-90, -40), (-100, -30), (-80, -30), (-110, -20), (-70, -20)]

# Recorte de salida (grados) y resolución de la imagen reproyectada
OESTE, ESTE, SUR, NORTE = -165.0, -40.0, -80.0, 2.0
ANCHO_SALIDA = 3000
NIVELES = list(range(940, 1061, 4))
VERSION = 4          # al cambiar el procesamiento se sube este número y la carta vigente se vuelve a procesar


def fwd(lon, lat):
    r = np.tan(np.pi / 4 + np.radians(lat) / 2)
    d = np.radians(np.asarray(lon) - L0)
    return A + SX * r * np.sin(d), B - SY * r * np.cos(d)


def merc_y(lat):
    return np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))


def lat_de_merc(y):
    return np.degrees(2 * np.arctan(np.exp(y)) - np.pi / 2)


def leer_json(p, defecto):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return defecto


# ------------------------------------------------------------------ OCR de fechas
MESES = {m: i + 1 for i, m in enumerate("ENERO FEBRERO MARZO ABRIL MAYO JUNIO JULIO AGOSTO SEPTIEMBRE OCTUBRE NOVIEMBRE DICIEMBRE".split())}


def ocr(img):
    import shutil
    if not shutil.which("tesseract"):              # en GitHub Actions se instala solo cuando hay carta nueva
        subprocess.run("sudo apt-get update -qq && sudo apt-get install -y -qq tesseract-ocr", shell=True,
                       capture_output=True, timeout=240)
    with tempfile.TemporaryDirectory() as t:
        p = Path(t) / "r.png"
        img.save(p)
        try:
            return subprocess.run(["tesseract", str(p), "-", "--psm", "6"], capture_output=True, text=True, timeout=60).stdout
        except Exception:
            return ""


def fechas_carta(im):
    """Fecha de validez (recuadro de título) y corrida del modelo (leyenda)."""
    def prep(box):
        c = im.crop(box).convert("L")
        return c.resize((c.width * 4, c.height * 4), Image.LANCZOS).point(lambda v: 255 if v > 150 else 0)
    t1 = ocr(prep((60, 35, 360, 98))).upper().replace(" ", "")
    t2 = ocr(prep((722, 738, 995, 792))).upper().replace(" ", "")
    valida = corrida = None
    m = re.search(r"(\d{1,2})-([A-Z]+)-(\d{4})HORA(\d{2})", t1)
    if m:
        mes = next((v for k, v in MESES.items() if m.group(2).startswith(k[:3])), None)
        if mes:
            valida = datetime(int(m.group(3)), mes, int(m.group(1)), int(m.group(4)), tzinfo=timezone.utc)
    m = re.search(r"CORRIDA(\d{1,2})-(\d{1,2})-(\d{4})(\d{2})", t2)
    if m:
        corrida = datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)), int(m.group(4)), tzinfo=timezone.utc)
    return valida, corrida, (t1, t2)


# ------------------------------------------------------------------ Frentes
def verificar_encuadre(arr):
    """La grilla gris debe pasar por los puntos de control (tolerancia 3 px)."""
    R, G, Bc = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    gris = (abs(R - G) < 16) & (abs(G - Bc) < 16) & (R > 80) & (R < 210)
    ok = 0
    for lon, lat in CONTROL:
        x, y = fwd(lon, lat)
        x, y = int(round(float(x))), int(round(float(y)))
        if gris[max(0, y - 3):y + 4, max(0, x - 3):x + 4].any():
            ok += 1
    return ok, len(CONTROL)


def mascara_color(arr):
    R, G, Bc = (arr[..., i].astype(int) for i in range(3))
    rojo = (R > 150) & (G < 110) & (Bc < 110) & (R - G > 80)
    azul = (Bc > 140) & (R < 110) & (G < 140) & (Bc - R > 70)
    morado = (R > 80) & (Bc > 80) & (G < 80) & (abs(R - Bc) < 90) & (R - G > 40) & (Bc - G > 40)
    m = np.zeros(arr.shape[:2], np.uint8)
    m[rojo] = 1
    m[azul] = 2
    m[morado] = 3
    x0, y0, x1, y1 = MARCO
    m[:y0, :] = 0; m[y1:, :] = 0; m[:, :x0] = 0; m[:, x1:] = 0
    for bx0, by0, bx1, by1 in RECUADROS:
        m[by0:by1, bx0:bx1] = 0
    return m


COLORES = {1: (220, 30, 30), 2: (25, 70, 230), 3: (140, 30, 150)}


def reproyectar(m):
    """Imagen RGBA en Mercator con los trazos de color de la carta (muestreo bilineal, bordes suaves)."""
    from scipy.ndimage import map_coordinates
    ym0, ym1 = merc_y(SUR), merc_y(NORTE)
    ancho = ANCHO_SALIDA
    alto = int(round(ancho * (ym1 - ym0) / np.radians(ESTE - OESTE)))
    lons = np.linspace(OESTE, ESTE, ancho)
    lats = lat_de_merc(np.linspace(ym1, ym0, alto))
    LON, LAT = np.meshgrid(lons, lats)
    X, Y = fwd(LON, LAT)
    capas = []
    for k in (1, 2, 3):
        capas.append(map_coordinates((m == k).astype(np.float32), [Y, X], order=1, mode="constant", cval=0.0))
    capas = np.stack(capas)
    alfa = capas.max(0)
    clase = capas.argmax(0) + 1
    rgba = np.zeros(LON.shape + (4,), np.uint8)
    for k, c in COLORES.items():
        sel = (clase == k) & (alfa > 0.02)
        rgba[sel, 0], rgba[sel, 1], rgba[sel, 2] = c
    rgba[..., 3] = np.clip(alfa * 1.6 * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA"), [[SUR, OESTE], [NORTE, ESTE]], int((alfa > 0.3).sum())


# ------------------------------------------------------------------ Isobaras GFS
def descargar_prmsl(corrida, fhr):
    """Campo PRMSL del GFS 0,5° (archivo GRIB2 parcial). Primero AWS, luego NOMADS."""
    d, h = corrida.strftime("%Y%m%d"), corrida.strftime("%H")
    base = f"https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.{d}/{h}/atmos/gfs.t{h}z.pgrb2.0p50.f{fhr:03d}"
    try:
        idx = requests.get(base + ".idx", headers=CAB, timeout=40)
        idx.raise_for_status()
        lineas = idx.text.strip().splitlines()
        for i, l in enumerate(lineas):
            if ":PRMSL:mean sea level:" in l:
                ini = int(l.split(":")[1])
                fin = int(lineas[i + 1].split(":")[1]) - 1 if i + 1 < len(lineas) else ""
                r = requests.get(base, headers={**CAB, "Range": f"bytes={ini}-{fin}"}, timeout=60)
                r.raise_for_status()
                return r.content, "AWS"
    except Exception as e:
        print("  AWS:", e)
    url = ("https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p50.pl?"
           f"dir=%2Fgfs.{d}%2F{h}%2Fatmos&file=gfs.t{h}z.pgrb2full.0p50.f{fhr:03d}&var_PRMSL=on&lev_mean_sea_level=on"
           "&subregion=&toplat=10&leftlon=195&rightlon=330&bottomlat=-80")
    r = requests.get(url, headers=CAB, timeout=60)
    r.raise_for_status()
    return r.content, "NOMADS"


def isobaras(grib):
    import pygrib
    from matplotlib import pyplot as plt
    with tempfile.NamedTemporaryFile(suffix=".grb2") as f:
        f.write(grib); f.flush()
        g = pygrib.open(f.name).select(name="Pressure reduced to MSL")[0]
        v, lats, lons = g.data(lat1=-80, lat2=10, lon1=195, lon2=330)
    v = v / 100.0
    lons = np.where(lons > 180, lons - 360, lons)
    if lats[0, 0] > lats[-1, 0]:
        v, lats, lons = v[::-1], lats[::-1], lons[::-1]
    # Solo dentro del área que cubre la carta, para que isobaras y frentes abarquen exactamente la misma zona
    px, py = fwd(lons, lats)
    x0, y0, x1, y1 = MARCO
    fuera = (px < x0) | (px > x1) | (py < y0) | (py > y1)
    for bx0, by0, bx1, by1 in RECUADROS:
        fuera |= (px > bx0) & (px < bx1) & (py > by0) & (py < by1)
    v = np.ma.masked_where(fuera, v)
    cs = plt.contour(lons, lats, v, levels=NIVELES)
    lineas = []
    for nivel, segs in zip(cs.levels, cs.allsegs):
        for s in segs:
            if len(s) < 4:
                continue
            pts = [[round(float(la), 2), round(float(lo), 2)] for lo, la in s]
            lineas.append({"p": int(nivel), "c": pts})
    plt.close("all")
    centros = []
    from scipy.ndimage import maximum_filter, minimum_filter
    for tipo, filtro, comp in (("A", maximum_filter, np.greater_equal), ("B", minimum_filter, np.less_equal)):
        ext = comp(v, filtro(v, size=21, mode="nearest")) & (v == filtro(v, size=21, mode="nearest")) & ~np.ma.getmaskarray(v)
        for i, j in zip(*np.where(ext)):
            if 3 < i < v.shape[0] - 4 and 3 < j < v.shape[1] - 4:
                centros.append({"t": tipo, "p": round(float(v[i, j])), "c": [round(float(lats[i, j]), 2), round(float(lons[i, j]), 2)]})
    return lineas, centros


# ------------------------------------------------------------------ Principal
def main():
    previo = leer_json(DATA / "carta.json", {})
    try:
        r = descargar(URL_CARTA, CAB)
    except Exception as e:
        print("Carta: no se pudo descargar:", e)
        return
    lm = r.headers.get("Last-Modified", "")
    print("  imagen descargada:", r.origen, lm)
    if lm and lm == previo.get("last_modified") and previo.get("version") == VERSION and os.environ.get("FORZAR") != "1":
        print("Carta: sin cambios", lm)
        return
    im = Image.open(io.BytesIO(r.content)).convert("RGB")
    if im.size != TAMANO:
        print("Carta: cambió el tamaño de la imagen", im.size, "→ no se publica")
        return
    arr = np.asarray(im)
    ok, n = verificar_encuadre(arr)
    if ok < n - 1:
        print(f"Carta: la grilla no calza ({ok}/{n}); posible cambio de encuadre → no se publica")
        return
    valida, corrida, textos = fechas_carta(im)
    print("OCR:", textos, "→ válida", valida, "corrida", corrida)
    m = mascara_color(arr)
    capa, limites, npx = reproyectar(m)
    capa.save(DATA / "carta_frentes.png", optimize=True)
    (DATA / "carta.jpg").write_bytes(r.content)            # copia para la vista en proyección polar
    # Frentes en la proyección original de la carta (para el mapa polar), fondo transparente
    pol = np.zeros(m.shape + (4,), np.uint8)
    for k, c in COLORES.items():
        pol[m == k] = (*c, 255)
    Image.fromarray(pol, "RGBA").save(DATA / "carta_frentes_polar.png", optimize=True)
    print(f"Frentes: {npx} píxeles reproyectados")

    meta = {"version": VERSION, "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "last_modified": lm,
            "valida": valida.strftime("%Y-%m-%dT%H:%MZ") if valida else None,
            "corrida_carta": corrida.strftime("%Y-%m-%dT%HZ") if corrida else None,
            "limites": limites, "proyeccion": {"A": A, "B": B, "SX": SX, "SY": SY, "L0": L0, "ancho": TAMANO[0], "alto": TAMANO[1]},
            "fuente": PAGINA_CARTA, "imagen": URL_CARTA, "isobaras": None}

    # Isobaras: misma corrida y hora de validez que la carta; si no está, la corrida más reciente que la cubra
    if valida:
        candidatas = []
        if corrida and valida >= corrida:
            candidatas.append(corrida)
        base = valida.replace(hour=valida.hour // 6 * 6)
        for k in range(0, 5):
            c = base - timedelta(hours=6 * k)
            if c not in candidatas:
                candidatas.append(c)
        for c in candidatas:
            fhr = int((valida - c).total_seconds() // 3600)
            if not 0 <= fhr <= 120:
                continue
            try:
                grib, origen = descargar_prmsl(c, fhr)
                lineas, centros = isobaras(grib)
                (DATA / "carta_isobaras.json").write_text(json.dumps({"valida": meta["valida"], "corrida": c.strftime("%Y-%m-%dT%HZ"),
                                                                       "fhr": fhr, "origen": origen, "lineas": lineas, "centros": centros},
                                                                      separators=(",", ":")))
                meta["isobaras"] = {"corrida": c.strftime("%Y-%m-%dT%HZ"), "fhr": fhr, "origen": origen, "lineas": len(lineas)}
                print(f"Isobaras: GFS {c:%Y-%m-%d %HZ} +{fhr} h ({origen}), {len(lineas)} líneas")
                break
            except Exception as e:
                print(f"  GFS {c:%Y-%m-%d %HZ} +{fhr}: {e}")
    (DATA / "carta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:                          # nunca detiene la publicación del dashboard
        print("Carta: error", e)
    sys.exit(0)
