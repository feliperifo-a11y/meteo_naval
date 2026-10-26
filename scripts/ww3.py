#!/usr/bin/env python3
"""Oleaje WAVEWATCH III (NOAA GFS-Wave, 0,25°) para la capa de Desarrollo → data/ww3/

Toma la corrida más reciente completa (la que ya publicó el plazo de 120 h) y guarda, cada 6 horas hasta
120 h, siete campos en una grilla de 0,5° de 5° N a 70° S y de 140° W a 60° W:
altura significativa total, período y dirección pico, altura del mar de viento y altura, período y
dirección del mar de fondo principal. Solo descarga esas variables (lectura parcial del GRIB2 con su índice).

Cada plazo se escribe como un archivo binario de un byte por valor (data/ww3/fFFF.bin) y data/ww3/indice.json
describe la grilla, la codificación y los plazos. Si la corrida no cambió, no hace nada; si el sitio publicado
ya tiene esa corrida, la copia desde ahí en vez de volver a calcularla. Nunca hace fallar el flujo de trabajo.
"""
import json
import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import requests

CARPETA = Path(__file__).resolve().parent.parent / "data" / "ww3"
INDICE = CARPETA / "indice.json"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (oleaje WW3)"}
NORTE, SUR, OESTE, ESTE, PASO = 5, -70, -140, -60, 0.5
PLAZOS = list(range(0, 121, 6))
VERSION = 1
# clave interna, texto del índice GRIB, escala de codificación (valor = byte / escala)
CAMPOS = [
    ("hs", ":HTSGW:surface:", 10),          # altura significativa total, m (0,1 m)
    ("tp", ":PERPW:surface:", 10),          # período pico, s (0,1 s)
    ("dp", ":DIRPW:surface:", 0.5),         # dirección pico de procedencia, ° (2°)
    ("hw", ":WVHGT:surface:", 10),          # altura del mar de viento, m
    ("hsw", ":SWELL:1 in sequence:", 10),   # altura del mar de fondo principal, m
    ("tsw", ":SWPER:1 in sequence:", 10),   # período del mar de fondo principal, s
    ("dsw", ":SWDIR:1 in sequence:", 0.5),  # dirección del mar de fondo principal, °
]
SIN_DATO = 255


def url(corrida, fhr):
    d, h = corrida.strftime("%Y%m%d"), corrida.strftime("%H")
    return f"https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.{d}/{h}/wave/gridded/gfswave.t{h}z.global.0p25.f{fhr:03d}.grib2"


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def corrida_completa(ahora):
    """Corrida más reciente que ya publicó su último plazo."""
    c0 = (ahora - timedelta(hours=3)).replace(minute=0, second=0, microsecond=0)
    c0 = c0.replace(hour=c0.hour - c0.hour % 6)
    for k in range(5):
        corrida = c0 - timedelta(hours=6 * k)
        try:
            r = requests.get(url(corrida, PLAZOS[-1]) + ".idx", headers=CAB, timeout=30)
            if r.ok and "HTSGW" in r.text:
                return corrida
        except Exception:
            pass
    return None


def descargar(corrida, fhr):
    base = url(corrida, fhr)
    idx = requests.get(base + ".idx", headers=CAB, timeout=40)
    idx.raise_for_status()
    lineas = idx.text.strip().splitlines()
    partes = {}
    for clave, texto, _ in CAMPOS:
        for i, l in enumerate(lineas):
            if texto in l:
                ini = int(l.split(":")[1])
                fin = int(lineas[i + 1].split(":")[1]) - 1 if i + 1 < len(lineas) else ""
                r = requests.get(base, headers={**CAB, "Range": f"bytes={ini}-{fin}"}, timeout=90)
                r.raise_for_status()
                partes[clave] = r.content
                break
    faltan = [c for c, _, _ in CAMPOS if c not in partes]
    if faltan:
        raise RuntimeError(f"f{fhr:03d}: faltan {', '.join(faltan)}")
    return partes


def grilla(grib):
    import pygrib
    with tempfile.NamedTemporaryFile(suffix=".grb2") as f:
        f.write(grib); f.flush()
        g = pygrib.open(f.name)[1]
        v, lats, lons = g.data(lat1=SUR, lat2=NORTE, lon1=OESTE + 360, lon2=ESTE + 360)
    v = np.ma.filled(np.ma.masked_invalid(np.ma.asarray(v, dtype=float)), np.nan)
    v[np.abs(v) > 1e6] = np.nan
    if lats[0, 0] < lats[-1, 0]:
        v, lats, lons = v[::-1], lats[::-1], lons[::-1]
    return v, lats, lons


def codificar(v, escala):
    b = np.full(v.shape, SIN_DATO, dtype=np.uint8)
    ok = np.isfinite(v)
    b[ok] = np.clip(np.rint(v[ok] * escala), 0, SIN_DATO - 1).astype(np.uint8)
    return b


def plazo(corrida, fhr):
    partes = descargar(corrida, fhr)
    salida, malla = [], None
    for clave, _, escala in CAMPOS:
        v, lats, lons = grilla(partes[clave])
        paso = int(round(PASO / abs(lats[0, 0] - lats[1, 0])))
        v, lats, lons = v[::paso, ::paso], lats[::paso, ::paso], lons[::paso, ::paso]
        if clave.startswith("d"):
            v = np.mod(v, 360)
        salida.append(codificar(v, escala))
        malla = malla or {"lat0": round(float(lats[0, 0]), 3), "lon0": round(float(lons[0, 0]) - 360, 3),
                          "nlat": int(v.shape[0]), "nlon": int(v.shape[1])}
    (CARPETA / f"f{fhr:03d}.bin").write_bytes(b"".join(x.tobytes() for x in salida))
    return malla


def copiar_publicado(clave):
    base = os.environ.get("PUBLICADO", "").rstrip("/")
    if not base:
        return False
    try:
        r = requests.get(f"{base}/data/ww3/indice.json", headers=CAB, timeout=30)
        pub = r.json() if r.ok else {}
        if pub.get("clave") != clave or pub.get("version") != VERSION:
            return False
        tam = pub["nlat"] * pub["nlon"] * len(pub["campos"])
        for p in pub["plazos"]:
            b = requests.get(f"{base}/data/ww3/{p['archivo']}", headers=CAB, timeout=60)
            b.raise_for_status()
            if len(b.content) != tam:
                return False
            (CARPETA / p["archivo"]).write_bytes(b.content)
        INDICE.write_text(json.dumps(pub, separators=(",", ":")), encoding="utf-8")
        print(f"Oleaje WW3: {clave} copiado del sitio publicado ({len(pub['plazos'])} plazos)")
        return True
    except Exception as e:
        print("Oleaje WW3: no se pudo copiar lo publicado:", e)
        return False


def main():
    CARPETA.mkdir(parents=True, exist_ok=True)
    corrida = corrida_completa(datetime.now(timezone.utc))
    if corrida is None:
        print("Oleaje WW3: ninguna corrida completa disponible; se mantiene lo anterior"); return
    clave = corrida.strftime("%Y%m%d%H")
    previo = leer(INDICE, {})
    if previo.get("clave") == clave and previo.get("version") == VERSION:
        print("Oleaje WW3: sin cambios", clave); return
    if copiar_publicado(clave):
        return
    with ThreadPoolExecutor(max_workers=6) as ex:
        futuros = {fhr: ex.submit(plazo, corrida, fhr) for fhr in PLAZOS}
    mallas, plazos = [], []
    for fhr, fut in futuros.items():
        try:
            mallas.append(fut.result())
            plazos.append({"fhr": fhr, "archivo": f"f{fhr:03d}.bin",
                           "valido": (corrida + timedelta(hours=fhr)).strftime("%Y-%m-%dT%H:%MZ")})
        except Exception as e:
            print(f"Oleaje WW3: plazo {fhr} h no disponible:", e)
    if len(plazos) < len(PLAZOS) // 2 or any(m != mallas[0] for m in mallas):
        print("Oleaje WW3: corrida incompleta o grillas distintas; se mantiene lo anterior"); return
    indice = {
        "version": VERSION, "clave": clave, "corrida": corrida.strftime("%Y-%m-%dT%HZ"),
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        **mallas[0], "dlat": -PASO, "dlon": PASO, "sin_dato": SIN_DATO,
        "campos": [{"clave": c, "escala": e} for c, _, e in CAMPOS],
        "plazos": plazos,
        "fuente": "NOAA GFS-Wave (WAVEWATCH III) 0,25°",
    }
    INDICE.write_text(json.dumps(indice, separators=(",", ":")), encoding="utf-8")
    vigentes = {p["archivo"] for p in plazos}
    for f in CARPETA.glob("f*.bin"):
        if f.name not in vigentes:
            f.unlink()
    print(f"Oleaje WW3: {clave} · {len(plazos)} plazos · {indice['nlat']}×{indice['nlon']} puntos")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Oleaje WW3: error", e)
    sys.exit(0)
