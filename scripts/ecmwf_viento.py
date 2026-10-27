#!/usr/bin/env python3
"""Viento a 10 m del modelo ECMWF IFS a 0,1° (≈ 9 km) para la franja costera de Chile → data/ecmwf/

Datos abiertos del ECMWF (licencia CC-BY-4.0) en su repositorio público de AWS. Toma la corrida más reciente
de 00 o 12 UTC que ya publicó el plazo de 120 h y guarda, cada 3 horas hasta 72 h y cada 6 horas hasta 120 h,
la rapidez del viento, su dirección y la ráfaga máxima del período, en la grilla nativa de 0,1° entre 17° S y
57° S y entre 82° W y 66° W. Solo descarga los campos 10u, 10v y 10fg (lectura parcial con el índice).

Cada plazo se escribe como un archivo binario de un byte por valor (data/ecmwf/fXXX.bin); data/ecmwf/indice.json
describe la grilla, la codificación y los plazos. Si la corrida no cambió, no hace nada; si el sitio publicado
ya la tiene, la copia desde ahí. Nunca hace fallar el flujo de trabajo.
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

CARPETA = Path(__file__).resolve().parent.parent / "data" / "ecmwf"
INDICE = CARPETA / "indice.json"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (viento ECMWF)"}
BASE = "https://ecmwf-forecasts.s3.eu-central-1.amazonaws.com"
NORTE, SUR, OESTE, ESTE = -17.0, -57.0, -82.0, -66.0
PLAZOS = list(range(0, 73, 3)) + list(range(78, 121, 6))
VERSION = 1
MS_A_KT = 1.943844
SIN_DATO = 255
# clave, escala (valor = byte / escala)
CAMPOS = [("vel", 1), ("dir", 0.5), ("raf", 1)]


def url(corrida, paso, ext):
    d, h = corrida.strftime("%Y%m%d"), corrida.strftime("%H")
    return f"{BASE}/{d}/{h}z/ifs/0p1/oper/{d}{h}0000-{paso}h-oper-fc-sfc.{ext}"


REGISTRO = []


def log(*a):
    texto = " ".join(str(x) for x in a)
    REGISTRO.append(texto)
    print(texto)


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def corrida_completa(ahora):
    c0 = ahora.replace(minute=0, second=0, microsecond=0)
    c0 = c0.replace(hour=c0.hour - c0.hour % 12)
    for k in range(4):
        corrida = c0 - timedelta(hours=12 * k)
        try:
            r = requests.get(url(corrida, PLAZOS[-1], "index"), headers=CAB, timeout=30)
            if r.ok and '"10u"' in r.text:
                return corrida
        except Exception:
            pass
    return None


def decodificar(grib):
    """Devuelve (valores, lats, lons) de un mensaje GRIB2; prueba pygrib y luego eccodes (compresión CCSDS)."""
    try:
        import pygrib
        with tempfile.NamedTemporaryFile(suffix=".grb2") as f:
            f.write(grib); f.flush()
            g = pygrib.open(f.name)[1]
            v = np.ma.filled(np.ma.asarray(g.values, dtype=float), np.nan)
            lats, lons = g.latlons()
            return v, lats[:, 0], lons[0, :]
    except Exception as e:
        error = e
    try:
        import eccodes
        h = eccodes.codes_new_from_message(grib)
        try:
            ni, nj = eccodes.codes_get(h, "Ni"), eccodes.codes_get(h, "Nj")
            v = eccodes.codes_get_values(h).reshape(nj, ni).astype(float)
            la1, lo1 = eccodes.codes_get(h, "latitudeOfFirstGridPointInDegrees"), eccodes.codes_get(h, "longitudeOfFirstGridPointInDegrees")
            la2, lo2 = eccodes.codes_get(h, "latitudeOfLastGridPointInDegrees"), eccodes.codes_get(h, "longitudeOfLastGridPointInDegrees")
            if lo2 < lo1:
                lo2 += 360
            return v, np.linspace(la1, la2, nj), np.linspace(lo1, lo2, ni)
        finally:
            eccodes.codes_release(h)
    except Exception as e:
        raise RuntimeError(f"no se pudo decodificar el GRIB2 (pygrib: {error}; eccodes: {e})")


def recorte(v, lats, lons):
    lons = ((lons + 180) % 360) - 180
    fi = np.where((lats <= NORTE + 1e-6) & (lats >= SUR - 1e-6))[0]
    fj = np.where((lons >= OESTE - 1e-6) & (lons <= ESTE + 1e-6))[0]
    sub = v[np.ix_(fi, fj)]
    la, lo = lats[fi], lons[fj]
    orden = np.argsort(lo)
    sub, lo = sub[:, orden], lo[orden]
    if la[0] < la[-1]:
        sub, la = sub[::-1], la[::-1]
    sub[np.abs(sub) > 1e6] = np.nan
    return sub, la, lo


def descargar(corrida, paso):
    idx = requests.get(url(corrida, paso, "index"), headers=CAB, timeout=40)
    idx.raise_for_status()
    partes = {}
    for linea in idx.text.strip().splitlines():
        d = json.loads(linea)
        if d.get("param") in ("10u", "10v", "10fg") and d.get("param") not in partes:
            ini, largo = d["_offset"], d["_length"]
            r = requests.get(url(corrida, paso, "grib2"), headers={**CAB, "Range": f"bytes={ini}-{ini + largo - 1}"}, timeout=120)
            r.raise_for_status()
            partes[d["param"]] = r.content
    if "10u" not in partes or "10v" not in partes:
        raise RuntimeError(f"{paso} h: faltan 10u/10v")
    return partes


def codificar(v, escala):
    b = np.full(v.shape, SIN_DATO, dtype=np.uint8)
    ok = np.isfinite(v)
    b[ok] = np.clip(np.rint(v[ok] * escala), 0, SIN_DATO - 1).astype(np.uint8)
    return b


def plazo(corrida, paso):
    partes = descargar(corrida, paso)
    u, la, lo = recorte(*decodificar(partes["10u"]))
    v, _, _ = recorte(*decodificar(partes["10v"]))
    vel = np.hypot(u, v) * MS_A_KT
    direc = np.mod(np.degrees(np.arctan2(-u, -v)), 360)  # procedencia
    if "10fg" in partes:
        raf = recorte(*decodificar(partes["10fg"]))[0] * MS_A_KT
    else:
        raf = np.full(vel.shape, np.nan)
    datos = [codificar(vel, 1), codificar(direc, 0.5) % 180, codificar(raf, 1)]
    datos[1][~np.isfinite(direc)] = SIN_DATO
    (CARPETA / f"f{paso:03d}.bin").write_bytes(b"".join(x.tobytes() for x in datos))
    return {"lat0": round(float(la[0]), 3), "lon0": round(float(lo[0]), 3), "dlat": round(float(la[1] - la[0]), 4),
            "dlon": round(float(lo[1] - lo[0]), 4), "nlat": int(len(la)), "nlon": int(len(lo))}


def copiar_publicado(clave):
    base = os.environ.get("PUBLICADO", "").rstrip("/")
    if not base:
        return False
    try:
        r = requests.get(f"{base}/data/ecmwf/indice.json", headers=CAB, timeout=30)
        pub = r.json() if r.ok else {}
        if pub.get("clave") != clave or pub.get("version") != VERSION:
            return False
        tam = pub["nlat"] * pub["nlon"] * len(pub["campos"])
        for p in pub["plazos"]:
            b = requests.get(f"{base}/data/ecmwf/{p['archivo']}", headers=CAB, timeout=60)
            b.raise_for_status()
            if len(b.content) != tam:
                return False
            (CARPETA / p["archivo"]).write_bytes(b.content)
        INDICE.write_text(json.dumps(pub, separators=(",", ":")), encoding="utf-8")
        log(f"Viento ECMWF: {clave} copiado del sitio publicado ({len(pub['plazos'])} plazos)")
        return True
    except Exception as e:
        log("Viento ECMWF: no se pudo copiar lo publicado:", e)
        return False


def main():
    CARPETA.mkdir(parents=True, exist_ok=True)
    corrida = corrida_completa(datetime.now(timezone.utc))
    if corrida is None:
        log("Viento ECMWF: ninguna corrida completa disponible; se mantiene lo anterior"); return
    clave = corrida.strftime("%Y%m%d%H")
    previo = leer(INDICE, {})
    if previo.get("clave") == clave and previo.get("version") == VERSION:
        log("Viento ECMWF: sin cambios", clave); return
    if copiar_publicado(clave):
        return
    with ThreadPoolExecutor(max_workers=6) as ex:
        futuros = {p: ex.submit(plazo, corrida, p) for p in PLAZOS}
    mallas, plazos = [], []
    for p, fut in futuros.items():
        try:
            mallas.append(fut.result())
            plazos.append({"paso": p, "archivo": f"f{p:03d}.bin",
                           "valido": (corrida + timedelta(hours=p)).strftime("%Y-%m-%dT%H:%MZ")})
        except Exception as e:
            log(f"Viento ECMWF: plazo {p} h no disponible:", repr(e))
    if len(plazos) < len(PLAZOS) // 2 or any(m != mallas[0] for m in mallas):
        log("Viento ECMWF: corrida incompleta o grillas distintas; se mantiene lo anterior"); return
    indice = {
        "version": VERSION, "clave": clave, "corrida": corrida.strftime("%Y-%m-%dT%HZ"),
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        **mallas[0], "sin_dato": SIN_DATO,
        "campos": [{"clave": c, "escala": e} for c, e in CAMPOS],
        "plazos": plazos,
        "fuente": "ECMWF IFS 0,1° · datos abiertos CC-BY-4.0",
    }
    INDICE.write_text(json.dumps(indice, separators=(",", ":")), encoding="utf-8")
    vigentes = {p["archivo"] for p in plazos}
    for f in CARPETA.glob("f*.bin"):
        if f.name not in vigentes:
            f.unlink()
    log(f"Viento ECMWF: {clave} · {len(plazos)} plazos · {indice['nlat']}×{indice['nlon']} puntos")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log("Viento ECMWF: error", repr(e))
    try:
        CARPETA.mkdir(parents=True, exist_ok=True)
        (CARPETA / "estado.json").write_text(json.dumps({"hora": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                                                          "registro": REGISTRO[-40:]}, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass
    sys.exit(0)
