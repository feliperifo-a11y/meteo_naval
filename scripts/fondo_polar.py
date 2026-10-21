#!/usr/bin/env python3
"""Fondo de relieve y batimetría para la carta de superficie en proyección estereográfica polar → data/fondo_polar.jpg

Descarga una sola vez el mosaico Blue Marble con relieve sombreado y batimetría (NASA GIBS, dominio público)
y lo reproyecta a la misma grilla de píxeles de la carta (proyección ajustada en carta.json). Como el fondo no
cambia, solo se rehace si falta el archivo o si cambia la versión o la proyección. Nunca hace fallar el flujo.
"""
import io
import json
import sys
from pathlib import Path

import numpy as np
import requests
from PIL import Image

VERSION = 2
R = Path(__file__).resolve().parent.parent
SALIDA, META, CARTA = R / "data" / "fondo_polar.jpg", R / "data" / "fondo_polar.json", R / "data" / "carta.json"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (fondo polar)"}
WMS = ("https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0"
       "&LAYERS=BlueMarble_ShadedRelief_Bathymetry&CRS=EPSG:4326&FORMAT=image/jpeg&STYLES=&BBOX={s},{w},{n},{e}&WIDTH={W}&HEIGHT={H}")
PASO = 0.04                      # grados por píxel del mosaico de origen
NORTE, SUR, OESTE, ESTE = 20.0, -90.0, -180.0, 180.0
PROYECCION_DEFECTO = {"A": 519.41, "B": 866.82, "SX": 1125.44, "SY": 1001.72, "L0": -90.08, "ancho": 1000, "alto": 800}
MARGEN, ESCALA = 0.35, 2.5       # margen alrededor de la carta (fracción) y píxeles de salida por píxel de la carta
FONDO = (8, 24, 40)


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def mosaico():
    """Mosaico equirectangular de todo el globo al sur de NORTE, armado con bloques de 30° de latitud × 20° de longitud."""
    W, H = round((ESTE - OESTE) / PASO), round((NORTE - SUR) / PASO)
    img = Image.new("RGB", (W, H), FONDO)
    for n in np.arange(NORTE, SUR, -30.0):
        for w in np.arange(OESTE, ESTE, 20.0):
            s, e = max(n - 30, SUR), min(w + 20, ESTE)
            w2, e2 = w, e
            bw, bh = round((e - w) / PASO), round((n - s) / PASO)
            url = WMS.format(s=s, w=w2, n=n, e=e2, W=bw, H=bh)
            r = requests.get(url, headers=CAB, timeout=120)
            r.raise_for_status()
            if not r.headers.get("content-type", "").startswith("image"):
                raise RuntimeError("respuesta inesperada del servicio de mosaicos")
            img.paste(Image.open(io.BytesIO(r.content)).convert("RGB").resize((bw, bh)), (round((w - OESTE) / PASO), round((NORTE - n) / PASO)))
    return np.asarray(img)


def main():
    p = (leer(CARTA, {}) or {}).get("proyeccion") or PROYECCION_DEFECTO
    clave = f"v{VERSION}:" + ",".join(str(p[k]) for k in ("A", "B", "SX", "SY", "L0", "ancho", "alto"))
    if SALIDA.exists() and leer(META, {}).get("clave") == clave:
        print("Fondo polar: sin cambios"); return
    src = mosaico()
    H0, W0 = src.shape[:2]
    x0, x1 = -MARGEN * p["ancho"], (1 + MARGEN) * p["ancho"]
    y0, y1 = -MARGEN * p["alto"], (1 + MARGEN) * p["alto"]
    W, H = round((x1 - x0) * ESCALA), round((y1 - y0) * ESCALA)
    xs = x0 + (np.arange(W) + 0.5) / ESCALA
    ys = y0 + (np.arange(H) + 0.5) / ESCALA
    X, Y = np.meshgrid(xs, ys)
    a, b = (X - p["A"]) / p["SX"], (p["B"] - Y) / p["SY"]          # ρ·sen(d), ρ·cos(d)
    rho, d = np.hypot(a, b), np.degrees(np.arctan2(a, b))
    lat = 2 * np.degrees(np.arctan(rho)) - 90
    lon = p["L0"] + d
    lon = (lon + 180) % 360 - 180
    fi, fj = (NORTE - lat) / PASO, (lon - OESTE) / PASO
    ok = (fi >= 0) & (fi < H0 - 1) & (fj >= 0) & (fj < W0 - 1)
    i, j = np.clip(fi, 0, H0 - 2), np.clip(fj, 0, W0 - 2)
    i0, j0 = i.astype(int), j.astype(int)
    di, dj = (i - i0)[..., None], (j - j0)[..., None]
    s = src.astype(np.float32)
    out = (s[i0, j0] * (1 - di) * (1 - dj) + s[i0, j0 + 1] * (1 - di) * dj + s[i0 + 1, j0] * di * (1 - dj) + s[i0 + 1, j0 + 1] * di * dj)
    out = out * 0.86                                  # algo más oscuro para que resalten isobaras, frentes y rótulos
    out[~ok] = FONDO
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(SALIDA, quality=80, optimize=True, progressive=True)
    META.write_text(json.dumps({"clave": clave, "x0": round(x0, 2), "x1": round(x1, 2), "y0": round(y0, 2), "y1": round(y1, 2),
                                "fuente": "NASA Blue Marble con relieve sombreado y batimetría (GIBS)"}), encoding="utf-8")
    print(f"Fondo polar: {W}×{H} px, {SALIDA.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Fondo polar: error", e)
    sys.exit(0)
