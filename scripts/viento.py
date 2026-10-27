#!/usr/bin/env python3
"""Campo de viento a 10 m del modelo GFS (0,25°) para el mapa de la versión nueva del dashboard → data/viento_gfs.json

Toma la corrida más reciente disponible y el plazo más cercano a la hora actual, descarga solo los campos
UGRD y VGRD a 10 m (lectura parcial del GRIB2 con su índice) y los guarda en una grilla de 0,5° en nudos,
de 5° N a 70° S y de 140° W a 60° W. Se recalcula solo cuando cambia la corrida o el plazo.
Nunca hace fallar el flujo de trabajo.
"""
import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import requests

SALIDA = Path(__file__).resolve().parent.parent / "data" / "viento_gfs.json"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (viento GFS)"}
NORTE, SUR, OESTE, ESTE, PASO = 5, -70, -140, -60, 0.5
RES = "0p25"
MS_A_KT = 1.943844


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def campos(corrida, fhr):
    d, h = corrida.strftime("%Y%m%d"), corrida.strftime("%H")
    base = f"https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.{d}/{h}/atmos/gfs.t{h}z.pgrb2.{RES}.f{fhr:03d}"
    idx = requests.get(base + ".idx", headers=CAB, timeout=40)
    idx.raise_for_status()
    lineas = idx.text.strip().splitlines()
    partes = []
    for var in ("UGRD", "VGRD"):
        for i, l in enumerate(lineas):
            if f":{var}:10 m above ground:" in l:
                ini = int(l.split(":")[1])
                fin = int(lineas[i + 1].split(":")[1]) - 1 if i + 1 < len(lineas) else ""
                r = requests.get(base, headers={**CAB, "Range": f"bytes={ini}-{fin}"}, timeout=60)
                r.raise_for_status()
                partes.append(r.content)
                break
    if len(partes) != 2:
        raise RuntimeError("no se encontraron UGRD/VGRD a 10 m")
    return partes


def grilla(grib):
    import pygrib
    with tempfile.NamedTemporaryFile(suffix=".grb2") as f:
        f.write(grib); f.flush()
        g = pygrib.open(f.name)[1]
        v, lats, lons = g.data(lat1=SUR, lat2=NORTE, lon1=OESTE + 360, lon2=ESTE + 360)
    if lats[0, 0] < lats[-1, 0]:
        v, lats, lons = v[::-1], lats[::-1], lons[::-1]
    return v, lats, lons


def main():
    ahora = datetime.now(timezone.utc)
    previo = leer(SALIDA, {})
    # corrida disponible: ~4,5 h después de la hora nominal
    c0 = (ahora - timedelta(hours=4, minutes=30)).replace(minute=0, second=0, microsecond=0)
    c0 = c0.replace(hour=c0.hour - c0.hour % 6)
    for k in range(4):
        corrida = c0 - timedelta(hours=6 * k)
        fhr = int(round((ahora - corrida).total_seconds() / 3600 / 3) * 3)
        fhr = max(0, min(fhr, 120))
        clave = f"{corrida:%Y%m%d%H}+{fhr:03d}@{RES}"
        if previo.get("clave") == clave:
            print("Viento GFS: sin cambios", clave); return
        try:
            u_b, v_b = campos(corrida, fhr)
        except Exception as e:
            print("Viento GFS:", clave, "no disponible:", e); continue
        u, lats, lons = grilla(u_b)
        v, _, _ = grilla(v_b)
        paso = int(round(PASO / abs(lats[0, 0] - lats[1, 0])))
        u, v, lats, lons = u[::paso, ::paso], v[::paso, ::paso], lats[::paso, ::paso], lons[::paso, ::paso]
        datos = {
            "clave": clave, "corrida": corrida.strftime("%Y-%m-%dT%HZ"), "fhr": fhr,
            "valido": (corrida + timedelta(hours=fhr)).strftime("%Y-%m-%dT%H:%MZ"),
            "lat0": round(float(lats[0, 0]), 3), "lon0": round(float(lons[0, 0]) - 360, 3), "dlat": -PASO, "dlon": PASO,
            "nlat": int(u.shape[0]), "nlon": int(u.shape[1]),
            "u": [round(float(x) * MS_A_KT, 1) for x in u.ravel()], "v": [round(float(x) * MS_A_KT, 1) for x in v.ravel()],
            "fuente": "NOAA GFS 0,25° (viento a 10 m)",
        }
        SALIDA.write_text(json.dumps(datos, separators=(",", ":")), encoding="utf-8")
        print(f"Viento GFS: {clave} · {datos['nlat']}×{datos['nlon']} puntos")
        return
    print("Viento GFS: ninguna corrida disponible; se mantiene el archivo anterior")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Viento GFS: error", e)
    sys.exit(0)
