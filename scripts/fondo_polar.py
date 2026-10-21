#!/usr/bin/env python3
"""Fondos de relieve y batimetría en proyección estereográfica polar → data/fondo_polar.jpg (carta de superficie) y data/fondo_hielo.jpg (cartas de hielo)

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


def reproyectar(src, p, x0, x1, y0, y1, escala):
    """Imagen en la grilla de píxeles de una carta polar: x = A + SX·ρ·sen(λ−L0), y = B − SY·ρ·cos(λ−L0), ρ = tan(45° + φ/2)."""
    H0, W0 = src.shape[:2]
    W, H = round((x1 - x0) * escala), round((y1 - y0) * escala)
    X, Y = np.meshgrid(x0 + (np.arange(W) + 0.5) / escala, y0 + (np.arange(H) + 0.5) / escala)
    a, b = (X - p["A"]) / p["SX"], (p["B"] - Y) / p["SY"]          # ρ·sen(d), ρ·cos(d)
    rho, d = np.hypot(a, b), np.degrees(np.arctan2(a, b))
    del X, Y, a, b
    lat = 2 * np.degrees(np.arctan(rho)) - 90
    lon = (p["L0"] + d + 180) % 360 - 180
    fi, fj = (NORTE - lat) / PASO, (lon - OESTE) / PASO
    ok = (fi >= 0) & (fi < H0 - 1) & (fj >= 0) & (fj < W0 - 1)
    i, j = np.clip(fi, 0, H0 - 2), np.clip(fj, 0, W0 - 2)
    i0, j0 = i.astype(int), j.astype(int)
    di, dj = (i - i0)[..., None].astype(np.float32), (j - j0)[..., None].astype(np.float32)
    out = (src[i0, j0] * (1 - di) * (1 - dj) + src[i0, j0 + 1] * (1 - di) * dj + src[i0 + 1, j0] * di * (1 - dj) + src[i0 + 1, j0 + 1] * di * dj)
    out = out * 0.86                                  # algo más oscuro para que resalten isobaras, frentes y rótulos
    out[~ok] = FONDO
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


def main():
    # Destinos: carta de superficie (proyección de carta.json) y cartas de hielo de la Península (proyección de hielo.json)
    pc = (leer(CARTA, {}) or {}).get("proyeccion") or PROYECCION_DEFECTO
    ph = (leer(R / "data" / "hielo.json", {}) or {}).get("proyeccion") or {"px": 1499.02, "py": 3154.59, "L0": -72.01, "S": 8460.0}
    r50 = ph["S"] * np.tan(np.radians(45 - 50 / 2)) * 1.06          # radio del paralelo 50° S, con margen
    destinos = [
        ("carta", SALIDA, META, pc, (-MARGEN * pc["ancho"], (1 + MARGEN) * pc["ancho"], -MARGEN * pc["alto"], (1 + MARGEN) * pc["alto"]), ESCALA),
        ("hielo", R / "data" / "fondo_hielo.jpg", R / "data" / "fondo_hielo.json", {"A": ph["px"], "B": ph["py"], "SX": ph["S"], "SY": ph["S"], "L0": ph["L0"]},
         (ph["px"] - r50, ph["px"] + r50, ph["py"] - r50, ph["py"] + r50), 0.5),
    ]
    src = None
    for nombre, salida, meta, p, (x0, x1, y0, y1), esc in destinos:
        clave = f"v{VERSION}:" + ",".join(str(round(float(p[k]), 3)) for k in ("A", "B", "SX", "SY", "L0")) + f":{x0:.1f},{x1:.1f},{y0:.1f},{y1:.1f},{esc}"
        if salida.exists() and leer(meta, {}).get("clave") == clave:
            print(f"Fondo {nombre}: sin cambios"); continue
        if src is None:
            src = mosaico().astype(np.float32)
        im = reproyectar(src, p, x0, x1, y0, y1, esc)
        im.save(salida, quality=80, optimize=True, progressive=True)
        meta.write_text(json.dumps({"clave": clave, "x0": round(x0, 2), "x1": round(x1, 2), "y0": round(y0, 2), "y1": round(y1, 2),
                                    "fuente": "NASA Blue Marble con relieve sombreado y batimetría (GIBS)"}), encoding="utf-8")
        print(f"Fondo {nombre}: {im.width}×{im.height} px, {salida.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Fondo polar: error", e)
    sys.exit(0)
