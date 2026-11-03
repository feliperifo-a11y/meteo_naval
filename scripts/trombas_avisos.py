#!/usr/bin/env python3
"""Qué mostraba el modelo en cada aviso de trombas marinas → data/trombas_avisos.json (archivo en el repositorio)

Cada vez que data/avisos.json trae un aviso de trombas marinas (aviso especial de un CMM), calcula con el GFS 0,25°
los ingredientes convectivos sobre el mar del área del aviso, cada 3 h dentro de su vigencia, en tres etapas:
  · emision:    la corrida GFS que el pronosticador tenía disponible al emitir (publicación − 5 h, redondeada a 6 h).
  · referencia: la misma área y las mismas horas, 7 días antes (análisis y plazo de 3 h), como día de comparación.
  · durante:    análisis y plazo de 3 h de cada hora de la vigencia, una vez terminado el aviso (lo que de verdad hubo).
Área: zonas del Cuadro "F" que nombra el aviso (desde su límite norte), puntos de mar a 1° o menos de la costa.
Por variable guarda percentiles 10, 50 y 90, mínimo y máximo de todos los puntos y horas, más conteos sobre umbral.
El archivo se acumula: con el tiempo muestra qué condiciones acompañan a los avisos de trombas.
NOMADS guarda unos 10 días de corridas: avisos más antiguos no se pueden calcular. Nunca hace fallar el flujo.
"""
import json
import math
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import trombas as tr          # noqa: E402  (descarga y cálculo GFS 0,25°)
import viento_alerta as va    # noqa: E402  (polígonos de tierra)

DATA = Path(__file__).resolve().parent.parent / "data"
SALIDA = DATA / "trombas_avisos.json"
VERSION = 1
TZ = ZoneInfo("America/Santiago")
DIAS_NOMADS = 9
DIST_COSTA = 1.0          # grados
VARS = ["mucape", "mlcape", "mlcape3", "mlcin", "ebsmu", "bwd06", "shr01", "srh500", "lr01", "lr03", "lr75",
        "mllcl", "dT", "dZ", "w850", "t850", "t500", "stp", "sherbe", "vgp", "nst"]


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%MZ")


def piso(t, h):
    return t.replace(minute=0, second=0, microsecond=0, hour=t.hour // h * h)


def area(aviso):
    """Polígono de mar evaluado: zonas del Cuadro F del aviso (desde su límite norte), a ≤ 1° de la costa."""
    from shapely.geometry import box, shape
    from shapely.ops import unary_union
    feats = {f["properties"]["id"]: shape(f["geometry"]) for f in leer(DATA / "geo" / "metarea.json", {"features": []})["features"]}
    partes, norte = [], None
    for z in aviso.get("zonas") or []:
        ids = [a for a in (z.get("areas") or []) if a in feats]
        if ids:
            partes.append(unary_union([feats[a] for a in ids]))
        elif z.get("geom"):
            partes.append(shape(z["geom"]))
        if z.get("north") is not None:
            norte = max(norte, z["north"]) if norte is not None else z["north"]
    if not partes:
        return None
    g = unary_union(partes)
    if norte is not None:
        b = g.bounds
        g = g.intersection(box(b[0] - 1, b[1] - 1, b[2] + 1, norte))
    t = va.tierra()
    return g.intersection(t.buffer(DIST_COSTA)).difference(t)


def horas(desde, hasta):
    t = piso(desde, 3)
    if t < desde:
        t += timedelta(hours=3)
    out = []
    while t <= hasta:
        out.append(t); t += timedelta(hours=3)
    return out or [piso(desde, 3)]


def estadistica(pares, g):
    """pares: lista de (corrida, fhr). Devuelve percentiles por variable sobre todos los puntos y horas del área."""
    import shapely
    shapely.prepare(g)
    b = g.bounds
    tr.NORTE, tr.SUR, tr.OESTE, tr.ESTE = math.ceil(b[3] + 0.5), math.floor(b[1] - 0.5), math.floor(b[0] - 0.5), math.ceil(b[2] + 0.5)
    acum = {v: [] for v in VARS}
    cont = {"stp": 0, "hslc": 0, "nst": 0, "sherbe": 0, "dT12": 0, "lr01_9": 0, "total": 0}
    por_hora = []
    for c, f in pares:
        campos, lat, lon = tr.leer_grib(tr.bajar(c, f))
        q, la, lo = tr.procesar(campos, lat, lon)
        mar = (campos[("lsm", 1, 0)] < 0.5).ravel()
        q["t500"] = campos[("t", 100, 500)].ravel()[mar] - 273.15
        q["t850"] = q["t850"] - 273.15
        for k in ("ebsmu", "bwd06", "shr01"):
            q[k] = q[k] * tr.MS_A_KT
        m = shapely.contains_xy(g, lo, la)
        for v in VARS:
            x = np.asarray(q[v], float)[m]
            acum[v].append(x[np.isfinite(x)])
        cont["stp"] += int((q["stp"][m] <= tr.UMBRAL["stp"]).sum()); cont["hslc"] += int(q["hslc"][m].sum())
        cont["nst"] += int((q["nst"][m] > tr.UMBRAL["nst"]).sum()); cont["sherbe"] += int((q["sherbe"][m] >= 1).sum())
        cont["dT12"] += int((q["dT"][m] >= 12).sum()); cont["lr01_9"] += int((q["lr01"][m] >= 9).sum()); cont["total"] += int(m.sum())
        por_hora.append({"valida": iso(c + timedelta(hours=f)), "corrida": c.strftime("%Y-%m-%dT%HZ"), "fhr": f,
                         **{v: (round(float(np.nanmedian(q[v][m])), 2) if m.any() else None) for v in ("mucape", "ebsmu", "srh500", "lr01", "dT", "t500", "nst", "stp")}})
        time.sleep(1)
    est = {}
    for v, xs in acum.items():
        x = np.concatenate(xs) if xs else np.array([])
        est[v] = [round(float(np.percentile(x, p)), 2) for p in (10, 50, 90)] + [round(float(x.min()), 2), round(float(x.max()), 2)] if x.size else None
    return {"puntos": int(cont["total"] / max(len(pares), 1)), "horas": len(pares), "estad": est, "conteos": cont, "por_hora": por_hora}


def main():
    arch = leer(SALIDA, {"version": VERSION, "avisos": {}})
    avisos = [a for a in leer(DATA / "avisos.json", {}).get("avisos", []) if "tromba" in (a.get("tipo", "") + a.get("resumen", "")).lower()]
    ahora = datetime.now(timezone.utc)
    cambios = False
    for a in avisos:
        zonas = a.get("zonas") or []
        if not zonas:
            continue
        desde = min(datetime.fromisoformat(z["desde"].replace("Z", "+00:00")) for z in zonas)
        hasta = max(datetime.fromisoformat(z["hasta"].replace("Z", "+00:00")) for z in zonas)
        clave = f"{a.get('codigo', '?')} · {desde:%Y-%m-%dT%HZ}"
        reg = arch["avisos"].setdefault(clave, {})
        if (ahora - desde).days > DIAS_NOMADS and not reg.get("emision"):
            reg.setdefault("nota", "Aviso anterior a los datos disponibles del GFS en NOMADS (unos 10 días).")
            continue
        reg.update({"codigo": a.get("codigo"), "tipo": a.get("tipo"), "sector": a.get("sector"), "publicado": a.get("publicado"),
                    "situacion": a.get("resumen", "").replace("Situación sinóptica:", "").strip(), "url": a.get("url"),
                    "desde": iso(desde), "hasta": iso(hasta), "zonas": sorted({x for z in zonas for x in (z.get("areas") or [])})})
        try:
            g = area(a)
            if g is None or g.is_empty:
                reg["nota"] = "Sin área evaluable en el Cuadro F"; continue
            hs = horas(desde, hasta)
            if "emision" not in reg:
                try:
                    pub = datetime.strptime(a["publicado"], "%d/%m/%Y %H:%M").replace(tzinfo=TZ).astimezone(timezone.utc)
                except Exception:
                    pub = desde - timedelta(hours=12)
                c = piso(pub - timedelta(hours=5), 6)
                pares = [(c, int((t - c).total_seconds() // 3600)) if t >= c else (piso(t, 6), t.hour % 6) for t in hs]
                print(f"{clave}: emisión con GFS {c:%Y-%m-%d %HZ}")
                reg["emision"] = {"corrida": c.strftime("%Y-%m-%dT%HZ"), **estadistica(pares, g)}; cambios = True
            if "referencia" not in reg:
                pares = [(piso(t - timedelta(days=7), 6), (t - timedelta(days=7)).hour % 6) for t in hs]
                print(f"{clave}: referencia 7 días antes")
                reg["referencia"] = {"desde": iso(desde - timedelta(days=7)), **estadistica(pares, g)}; cambios = True
            if "durante" not in reg and ahora > hasta + timedelta(hours=7):
                pares = [(piso(t, 6), t.hour % 6) for t in hs]
                print(f"{clave}: durante (análisis)")
                reg["durante"] = estadistica(pares, g); cambios = True
            reg.pop("error", None)
        except Exception as e:
            ln = traceback.extract_tb(e.__traceback__)[-1]
            reg["error"] = f"{type(e).__name__}: {e} ({Path(ln.filename).name}:{ln.lineno})"[:300]
            print(clave, "error", reg["error"]); cambios = True
    if cambios:
        arch["version"] = VERSION
        arch["actualizado"] = ahora.strftime("%Y-%m-%dT%H:%M:%SZ")
        SALIDA.write_text(json.dumps(arch, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("Trombas avisos: archivo actualizado,", len(arch["avisos"]), "avisos")
    else:
        print("Trombas avisos: sin cambios")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Trombas avisos: error", e)
