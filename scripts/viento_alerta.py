#!/usr/bin/env python3
"""Alerta preventiva de viento a 5 días (página Desarrollo) → data/viento_alerta.json

Aplica los parámetros de aviso por viento del PD OPE-07 «Elaboración y emisión de avisos meteorológicos» del Servicio
Meteorológico de la Armada (05-08-2025, cap. VII) al viento a 10 m del ECMWF IFS 0,1° (0–120 h) que ya descarga
scripts/ecmwf_viento.py en data/ecmwf/. Evalúa cada área de responsabilidad de los Centros Meteorológicos Marítimos (CMM)
desde la costa hasta su límite oceánico, sin aguas interiores, y Juan Fernández e Isla de Pascua (Rapa Nui).
Rapa Nui queda fuera de la grilla de data/ecmwf; para la isla se usa el ECMWF IFS 0,25° vía Open-Meteo.
Es una estimación automática: no constituye aviso.

Viento "general Norte" = componente norte (procedencia de 270° a 90° pasando por el norte); "general Sur" = componente sur.
Criterio de MeteoIA para "viento general" (el PD no lo define): el umbral se cumple en al menos el 10 % de los puntos del
área (mínimo 2 puntos) durante al menos dos plazos consecutivos del modelo (6 h hasta 72 h; 12 h después).
Si la corrida no cambió, solo se actualiza la marca de avisos oficiales vigentes. Nunca hace fallar el flujo.
"""
import json
import math
import os
import sys
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import requests

R = Path(__file__).resolve().parent.parent
DATA = R / "data"
ECMWF = DATA / "ecmwf"
SALIDA = DATA / "viento_alerta.json"
TZ = ZoneInfo("America/Santiago")
VERSION = 1
CORRIDAS_HISTORIAL = 3
FRAC_MIN, PUNTOS_MIN, PLAZOS_MIN = 0.10, 2, 2
SUBMUESTREO = 2          # 0,2° a partir de la grilla de 0,1°
COSTERO_MN = 10.0        # PD OPE-07, IV.g: sector costero hasta 10 mn
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (alerta de viento)"}

# Áreas de responsabilidad (PD OPE-07, cap. VII). Umbrales en kt; None = el PD no define ese aviso para el área oceánica.
#   esp/mt: inicio de aviso especial y de mal tiempo con viento general norte; tmp: temporal con viento general norte;
#   vf: viento fuerte con viento general sur; todas: el umbral se aplica a cualquier dirección.
AREAS = [
    {"id": "IQQ", "nombre": "CMM Iquique · Arica a 26° S", "norte": -18.35, "sur": -26.0, "oeste": -76.0,
     "esp": 15, "mt": 20, "tmp": 34, "vf": 34},
    {"id": "VAL", "nombre": "CMM Valparaíso · 26° S a 34,6° S", "norte": -26.0, "sur": -34.6, "oeste": -78.0,
     "esp": 15, "mt": 20, "tmp": 34, "vf": 34},
    {"id": "TAL", "nombre": "CMM Talcahuano · 34,6° S a 40,2° S", "norte": -34.6, "sur": -40.2, "oeste": -78.0,
     "esp": 20, "mt": 30, "tmp": 34, "vf": 34},
    {"id": "PMO", "nombre": "CMM Puerto Montt · 40,2° S a 48,8° S (área oceánica)", "norte": -40.2, "sur": -48.8, "oeste": -78.0,
     "esp": None, "mt": 30, "tmp": 34, "vf": 34},
    {"id": "MAG", "nombre": "CMM Magallanes · 48,8° S a 57° S (área oceánica)", "norte": -48.8, "sur": -57.0, "oeste": -78.0,
     "esp": None, "mt": None, "tmp": 34, "vf": None, "todas": True},
    {"id": "JF", "nombre": "Archipiélago Juan Fernández", "isla": [(-33.64, -78.83, 4), (-33.77, -80.78, 3)],
     "esp": None, "mt": 20, "tmp": 34, "vf": None, "todas": True},
    {"id": "RN", "nombre": "Isla de Pascua (Rapa Nui)", "isla": [(-27.12, -109.35, 7)], "openmeteo": True,
     "esp": None, "mt": 20, "tmp": 34, "vf": None, "todas": True},
]
CATS = {  # clave: (rango, nombre)
    "E": (1, "Aviso especial"), "M": (2, "Mal tiempo"), "VF": (3, "Viento fuerte"), "T": (4, "Temporal"),
}
CRITERIOS = {
    "fuente": "PD OPE-07 «Elaboración y emisión de avisos meteorológicos», Servicio Meteorológico de la Armada (05-08-2025), cap. VII",
    "areas": [
        "CMM Iquique (Arica a 26° S, hasta 76° W) y CMM Valparaíso (26° S a 34,6° S, hasta 78° W): especial N 15–19 kt; mal tiempo N 20–33 kt; temporal N 34 kt o más; viento fuerte S 34 kt o más.",
        "CMM Talcahuano (34,6° S a 40,2° S, hasta 78° W): especial N 20–29 kt; mal tiempo N 30–33 kt; temporal N 34 kt o más; viento fuerte S 34 kt o más.",
        "CMM Puerto Montt, área oceánica (40,2° S a 48,8° S, hasta 78° W): mal tiempo N 30–33 kt; temporal N 34 kt o más; viento fuerte S 34 kt o más.",
        "CMM Magallanes, área oceánica (48,8° S al límite de la grilla en 57° S, hasta 78° W): temporal con 34 kt o más de cualquier dirección.",
        "Juan Fernández e Isla de Pascua: mal tiempo 20–33 kt y temporal 34 kt o más. El PD los asocia a situaciones prefrontales, frontales (IV y I cuadrante; W en Juan Fernández) y postfrontales (II y III cuadrante), es decir, a todas las direcciones; el aviso especial de las islas depende de la situación sinóptica y no se distingue de forma automática.",
    ],
    "notas": [
        "Viento general norte: componente norte (procedencia de 270° a 90° pasando por el norte); viento general sur: componente sur.",
        "Criterio de MeteoIA (el PD no define 'viento general'): el umbral se cumple en al menos el 10 % de los puntos del área (mínimo 2) durante al menos dos plazos consecutivos del modelo (6 h hasta 72 h; 12 h después).",
        "No se evalúan las aguas interiores de Puerto Montt y Magallanes ni los avisos locales (Punta Arenas, Puerto Harris, Bahía Fildes), que tienen parámetros propios.",
        "Los avisos se emiten con al menos 24 h de antelación; en las islas, el aviso especial con 48 h (PD OPE-07, IV.d y VII.2).",
        "Sector costero hasta 10 mn de la costa; más afuera, área oceánica (PD OPE-07, IV.g). La distancia se aproxima en grados.",
    ],
}


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def compacto(s):
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").upper()) if c.isalnum() and unicodedata.category(c) != "Mn")


def _dec(s):
    """Polilínea codificada de data/geo/land.json (misma codificación que usa colector.py)."""
    out, i, lat, lon = [], 0, 0, 0
    while i < len(s):
        for k in range(2):
            sh = res = 0
            while True:
                b = ord(s[i]) - 63; i += 1; res |= (b & 0x1F) << sh; sh += 5
                if b < 0x20:
                    break
            d = ~(res >> 1) if res & 1 else res >> 1
            if k == 0: lat += d
            else: lon += d
        out.append((lon / 1e6, lat / 1e6))
    return out


def tierra():
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    polys = []
    for c in leer(DATA / "geo" / "land.json", []):
        for poly in c["p"]:
            anillos = [_dec(r) for r in poly]
            if len(anillos[0]) >= 3:
                g = Polygon(anillos[0], [r for r in anillos[1:] if len(r) >= 3]).buffer(0)
                if not g.is_empty:
                    polys.append(g)
    return unary_union(polys)


# ------------------------------------------------------------ datos ECMWF (data/ecmwf)

def leer_ecmwf():
    idx = leer(ECMWF / "indice.json", {})
    if not idx.get("plazos"):
        return None
    nlat, nlon = idx["nlat"], idx["nlon"]
    lats = idx["lat0"] + idx["dlat"] * np.arange(nlat)
    lons = idx["lon0"] + idx["dlon"] * np.arange(nlon)
    esc = {c["clave"]: c["escala"] for c in idx["campos"]}
    claves = [c["clave"] for c in idx["campos"]]
    sd = idx.get("sin_dato", 255)
    pasos = []
    for p in idx["plazos"]:
        try:
            b = np.frombuffer((ECMWF / p["archivo"]).read_bytes(), dtype=np.uint8)
        except Exception:
            continue
        if b.size != nlat * nlon * len(claves):
            continue
        b = b.reshape(len(claves), nlat, nlon)
        campos = {}
        for k, clave in enumerate(claves):
            v = b[k].astype(float)
            v[b[k] == sd] = np.nan
            campos[clave] = v / esc[clave]
        pasos.append({"valido": datetime.fromisoformat(p["valido"].replace("Z", "+00:00")), "paso": p["paso"], **campos})
    if len(pasos) < 5:
        return None
    return {"indice": idx, "lats": lats, "lons": lons, "pasos": pasos}


def seleccionar(ec):
    """Puntos de mar por área: grilla submuestreada a 0,2°, sin tierra ni aguas interiores; marca los costeros (≤ 10 mn)."""
    import shapely
    from shapely.geometry import LineString
    t = tierra()
    shapely.prepare(t)
    costa = t.buffer(COSTERO_MN / 60.0)
    shapely.prepare(costa)
    lats, lons = ec["lats"], ec["lons"]
    ii = np.arange(0, len(lats), SUBMUESTREO)
    jj = np.arange(0, len(lons), SUBMUESTREO)
    I, J = np.meshgrid(ii, jj, indexing="ij")
    I, J = I.ravel(), J.ravel()
    LA, LO = lats[I], lons[J]
    mar = ~shapely.contains_xy(t, LO, LA)
    out = {}
    for a in AREAS:
        if a.get("openmeteo"):
            continue
        if a.get("isla"):
            sel = np.zeros(LA.size, bool)
            for la0, lo0, rad in a["isla"]:
                d = np.hypot((LA - la0) * 60, (LO - lo0) * 60 * math.cos(math.radians(la0)))   # mn, aproximación plana
                sel |= d <= 24 + rad
            sel &= mar
        else:
            sel = mar & (LA <= a["norte"] + 1e-6) & (LA > a["sur"] + 1e-6) & (LO >= a["oeste"] - 1e-6)
            # Salida libre al océano hacia el oeste (al sur de 41,4° S, también WNW y WSW): excluye canales y fiordos.
            cand = np.where(sel)[0]
            if cand.size:
                bloqueado = np.zeros(cand.size, bool)
                for r in (0, 30, -30):
                    usa = np.ones(cand.size, bool) if r == 0 else LA[cand] < -41.4
                    if not usa.any():
                        continue
                    lineas = [LineString([(LO[k], LA[k]), (LO[k] - 4, LA[k] + 4 * math.tan(math.radians(r)))]) for k in cand[usa]]
                    bloqueado[usa] |= shapely.intersects(t, np.array(lineas, dtype=object))
                sel[cand[bloqueado]] = False
        k = np.where(sel)[0]
        cost = shapely.contains_xy(costa, LO[k], LA[k])
        out[a["id"]] = {"i": I[k], "j": J[k], "lat": LA[k], "lon": LO[k], "costero": cost}
    return out


def serie_ecmwf(ec, pts):
    """Velocidad, dirección y ráfaga por plazo (matrices plazos × puntos)."""
    i, j = pts["i"], pts["j"]
    vel = np.array([p["vel"][i, j] for p in ec["pasos"]])
    dirc = np.array([p["dir"][i, j] for p in ec["pasos"]])
    raf = np.array([p["raf"][i, j] if "raf" in p else np.full(i.size, np.nan) for p in ec["pasos"]])
    return vel, dirc, raf


def serie_openmeteo(a, validos):
    """Rapa Nui: ECMWF IFS 0,25° vía Open-Meteo en un anillo de 8 puntos a 15 mn de la isla."""
    la0, lo0, _ = a["isla"][0]
    lat, lon = [], []
    for k in range(8):
        az = math.radians(k * 45)
        lat.append(round(la0 + 15 / 60 * math.cos(az), 3))
        lon.append(round(lo0 + 15 / 60 * math.sin(az) / math.cos(math.radians(la0)), 3))
    r = requests.get("https://api.open-meteo.com/v1/forecast", headers=CAB, timeout=40, params={
        "latitude": ",".join(map(str, lat)), "longitude": ",".join(map(str, lon)),
        "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m", "models": "ecmwf_ifs025",
        "wind_speed_unit": "kn", "forecast_days": 7, "timezone": "GMT"})
    r.raise_for_status()
    js = r.json()
    js = js if isinstance(js, list) else [js]
    vel = np.full((len(validos), len(js)), np.nan); dirc = vel.copy(); raf = vel.copy()
    for c, punto in enumerate(js):
        h = punto.get("hourly", {})
        horas = {t: n for n, t in enumerate(h.get("time", []))}
        for f, v in enumerate(validos):
            n = horas.get(v.strftime("%Y-%m-%dT%H:00"))
            if n is None:
                continue
            for arr, clave in ((vel, "wind_speed_10m"), (dirc, "wind_direction_10m"), (raf, "wind_gusts_10m")):
                x = (h.get(clave) or [None] * (n + 1))[n]
                arr[f, c] = np.nan if x is None else float(x)
    pts = {"lat": np.array(lat), "lon": np.array(lon), "costero": np.zeros(len(lat), bool)}
    return pts, vel, dirc, raf


# ------------------------------------------------------------ criterios PD OPE-07

def condiciones(a, vel, dirc):
    """Booleanos plazos × puntos por categoría."""
    ok = np.isfinite(vel)
    norte = np.cos(np.radians(np.nan_to_num(dirc))) >= -1e-9
    cond = {}
    if a.get("todas"):
        if a.get("tmp"): cond["T"] = ok & (vel >= a["tmp"])
        if a.get("mt"): cond["M"] = ok & (vel >= a["mt"])
        return cond
    if a.get("tmp"): cond["T"] = ok & norte & (vel >= a["tmp"])
    if a.get("vf"): cond["VF"] = ok & ~norte & (vel >= a["vf"])
    if a.get("mt"): cond["M"] = ok & norte & (vel >= a["mt"])
    if a.get("esp"): cond["E"] = ok & norte & (vel >= a["esp"])
    return cond


def evaluar_area(a, pts, vel, dirc, raf, validos):
    n = vel.shape[1]
    cond = condiciones(a, vel, dirc)
    activo = {}
    for k, c in cond.items():
        cuenta = c.sum(axis=1)
        cumple = (cuenta >= max(PUNTOS_MIN, math.ceil(FRAC_MIN * n))) if n else np.zeros(len(validos), bool)
        dur = np.zeros_like(cumple)
        f = 0
        while f < len(cumple):   # tramos de al menos PLAZOS_MIN plazos consecutivos
            if cumple[f]:
                g = f
                while g + 1 < len(cumple) and cumple[g + 1]:
                    g += 1
                if g - f + 1 >= PLAZOS_MIN:
                    dur[f:g + 1] = True
                f = g + 1
            else:
                f += 1
        activo[k] = (dur, c, cuenta)
    hoy = datetime.now(TZ).date()
    dias = sorted({v.astimezone(TZ).date() for v in validos if v.astimezone(TZ).date() >= hoy})
    celdas = []
    for d in dias:
        fs = [f for f, v in enumerate(validos) if v.astimezone(TZ).date() == d]
        celda = {"fecha": d.isoformat(), "cat": None, "plazos": len(fs)}
        vmax = np.nanmax(vel[fs]) if len(fs) and np.isfinite(vel[fs]).any() else None
        celda["vmax"] = None if vmax is None else round(float(vmax))
        for k in sorted(activo, key=lambda x: -CATS[x][0]):
            dur, c, cuenta = activo[k]
            fk = [f for f in fs if dur[f]]
            if not fk:
                continue
            # plazo y punto de mayor viento entre los que cumplen la condición
            mejor = max(((f, p) for f in fk for p in np.where(c[f])[0]), key=lambda fp: vel[fp[0], fp[1]])
            f, p = mejor
            cos_ = pts["costero"][c[f]]
            celda.update({
                "cat": k, "vel": round(float(vel[f, p])), "dir": None if not np.isfinite(dirc[f, p]) else int(round(dirc[f, p])) % 360,
                "raf": None if not np.isfinite(raf[f, p]) else round(float(raf[f, p])),
                "lat": round(float(pts["lat"][p]), 2), "lon": round(float(pts["lon"][p]), 2),
                "valido": validos[f].strftime("%Y-%m-%dT%H:%MZ"),
                "frac": round(100 * max(cuenta[x] for x in fk) / n),
                "sector": "costero y oceánico" if cos_.any() and (~cos_).any() else "costero" if cos_.any() else "oceánico",
            })
            break
        celdas.append(celda)
    paso = max(1, len(pts["lat"]) // 220)
    return {"id": a["id"], "nombre": a["nombre"], "n_puntos": int(n),
            "puntos": [[round(float(x), 2), round(float(y), 2)] for x, y in zip(pts["lat"][::paso], pts["lon"][::paso])],
            "celdas": celdas, "_lat": pts["lat"], "_lon": pts["lon"]}


# ------------------------------------------------------------ avisos oficiales y persistencia

def es_aviso_viento(tipo):
    t = compacto(tipo)
    return not any(x in t for x in ("MAREJADA", "TROMBA")) and any(x in t for x in ("MALTIEMPO", "TEMPORAL", "VIENTO", "ESPECIAL", "AVISOMETEOROLOGICO"))


def marcar_avisos(res, coords=None):
    """Marca los días con un aviso oficial de viento vigente que cubre algún punto evaluado del área."""
    import shapely
    from shapely.geometry import shape
    avisos = []
    for a in leer(DATA / "avisos.json", {}).get("avisos", []):
        if not es_aviso_viento(a.get("tipo")):
            continue
        for z in a.get("zonas", []):
            try:
                g = shape(z["geom"])
                ini = datetime.fromisoformat(z["desde"].replace("Z", "+00:00"))
                fin = datetime.fromisoformat(z["hasta"].replace("Z", "+00:00"))
            except Exception:
                continue
            avisos.append((g, ini, fin, a.get("codigo") or a.get("tipo")))
    for zona in res["zonas"]:
        la, lo = (coords or {}).get(zona["id"], (None, None))
        if la is None:
            la = np.array([p[0] for p in zona["puntos"]]); lo = np.array([p[1] for p in zona["puntos"]])
        cubren = [(ini, fin, cod) for g, ini, fin, cod in avisos if la.size and shapely.contains_xy(g, lo, la).any()]
        for c in zona["celdas"]:
            d = date.fromisoformat(c["fecha"])
            i0 = datetime(d.year, d.month, d.day, tzinfo=TZ)
            c["aviso"] = next((cod for ini, fin, cod in cubren if ini < i0 + timedelta(days=1) and fin > i0), None)
    res["avisos_revisados"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def persistencia(res, previo):
    previas = previo.get("historial", []) if previo.get("version") == VERSION else []
    hist = [h for h in previas if h.get("clave") != res["clave"]][-(CORRIDAS_HISTORIAL - 1):]
    hist.append({"clave": res["clave"], "cat": {z["id"]: {c["fecha"]: c["cat"] for c in z["celdas"]} for z in res["zonas"]}})
    res["historial"] = hist
    for z in res["zonas"]:
        for c in z["celdas"]:
            cubren = [h for h in hist if c["fecha"] in h["cat"].get(z["id"], {})]
            c["persistencia"] = [sum(1 for h in cubren if h["cat"][z["id"]][c["fecha"]]), len(cubren)]


def escribir(res):
    SALIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    previo = leer(SALIDA, {})
    ec = leer_ecmwf()
    if ec is None:
        print("Alerta de viento: sin datos ECMWF en data/ecmwf; se mantiene lo anterior")
        if previo.get("zonas"):
            marcar_avisos(previo); escribir(previo)
        return
    clave = ec["indice"]["clave"]
    if previo.get("clave") == clave and previo.get("version") == VERSION and not os.environ.get("FORZAR"):
        marcar_avisos(previo); escribir(previo)
        print("Alerta de viento: sin corrida nueva", clave, "(avisos oficiales revisados)"); return
    validos = [p["valido"] for p in ec["pasos"]]
    puntos = seleccionar(ec)
    zonas, coords, fallas = [], {}, []
    for a in AREAS:
        try:
            if a.get("openmeteo"):
                pts, vel, dirc, raf = serie_openmeteo(a, validos)
            else:
                pts = puntos[a["id"]]
                vel, dirc, raf = serie_ecmwf(ec, pts)
            z = evaluar_area(a, pts, vel, dirc, raf, validos)
            if a.get("openmeteo"):
                z["fuente"] = "ECMWF IFS 0,25° (Open-Meteo)"
        except Exception as e:
            fallas.append(f"{a['id']}: {e}")
            print(f"Alerta de viento: {a['id']} no disponible:", e)
            continue
        coords[z["id"]] = (z.pop("_lat"), z.pop("_lon"))
        zonas.append(z)
    if not zonas:
        print("Alerta de viento: ninguna área evaluada; se mantiene lo anterior"); return
    fechas = sorted({c["fecha"] for z in zonas for c in z["celdas"]})
    res = {
        "version": VERSION, "clave": clave, "corrida": ec["indice"]["corrida"],
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": "ECMWF IFS 0,1° (datos abiertos CC-BY-4.0), viento a 10 m, 0–120 h",
        "fechas": fechas, "zonas": zonas, "categorias": {k: v[1] for k, v in CATS.items()},
        "criterios": CRITERIOS, "fallas": fallas,
    }
    persistencia(res, previo)
    marcar_avisos(res, coords)
    escribir(res)
    n = sum(1 for z in zonas for c in z["celdas"] if c["cat"])
    print(f"Alerta de viento: {clave} · {sum(z['n_puntos'] for z in zonas)} puntos · {n} días-área con aviso estimado")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Alerta de viento: error", e)
    sys.exit(0)
