#!/usr/bin/env python3
"""Alerta preventiva de marejadas a 10 días (página Desarrollo) → data/marejadas_alerta.json

Aplica los criterios de emisión de la O.P.I. N° 1107 de la Gobernación Marítima de Valparaíso
(21 mar 2024, ver. 1.6), puntos II.2 y II.3, sobre el pronóstico NOAA GFS-Wave (WAVEWATCH III, 0,25°)
de 0 a 240 h, cada 6 h. Es una estimación automática: no constituye aviso.

Zonas evaluadas:
  · Costa continental, del Golfo de Penas a Arica, por zona costera del Cuadro "F" (I a VI). Solo se usan puntos
    de la grilla a 24 mn o menos de la costa (zona contigua) y con salida libre al océano hacia el oeste,
    para no evaluar canales, fiordos ni aguas interiores.
  · Archipiélago Juan Fernández y Rapa Nui: puntos a 24 mn o menos de cada isla.

Criterios (O.P.I. N° 1107; referencia: costa de la Región de Valparaíso):
  Marejadas ............ mar de fondo SW/W de 3 a 4 m · mar de fondo NW de 2,0 m o más ·
                         mar de viento S/SW sobre 3 m en el litoral central (criterio c, asociado al Anticiclón)
  Marejadas anormales .. mar de fondo SW/W sobre 4 m · mar de fondo NW con período de 14 a 17 s y 2,5 m o más ·
                         mar de fondo NW con período de 18 s o más y 2,0 m o más ·
                         mar de viento NW/W sobre 3,0 m (criterio d, sistema frontal)
Las alturas del modelo son mar afuera (altura significativa de cada partición), no la altura en la rompiente.
El período de cada partición es su período medio. Se marcan además los días cercanos a sicigias (luna nueva o llena).

Confianza: persistencia entre corridas (cuántas de las últimas corridas muestran el mismo día con marejadas).
Si la corrida no cambió, solo se actualiza la marca de avisos oficiales vigentes. Nunca hace fallar el flujo.
"""
import json
import math
import os
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import requests

R = Path(__file__).resolve().parent.parent
DATA = R / "data"
SALIDA = DATA / "marejadas_alerta.json"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (alerta de marejadas)"}
TZ = ZoneInfo("America/Santiago")
VERSION = 1
PLAZOS = list(range(0, 241, 6))
DIAS = 10
CORRIDAS_HISTORIAL = 4
# Recorte de lectura de la grilla global (incluye Rapa Nui y la costa continental)
SUR, NORTE, OESTE, ESTE = -50.0, -15.0, -112.0, -68.0
ZONA_CONTIGUA_MN = 24.0
LAT_ARICA, LAT_PENAS = -18.35, -47.8   # límite norte (frontera) y Golfo de Penas (Faro San Pedro 47°43' S)
COSTERAS = ["I", "II", "III", "IV", "V", "VI"]
LITORAL_CENTRAL = {"II", "III"}
ISLAS = {
    "JF": {"nombre": "Archipiélago Juan Fernández", "centros": [(-33.64, -78.83), (-33.77, -80.78)], "radio_isla_mn": 4},
    "RN": {"nombre": "Rapa Nui", "centros": [(-27.12, -109.35)], "radio_isla_mn": 7},
}
# clave interna, texto del índice GRIB
CAMPOS = [
    ("hw", ":WVHGT:surface:"), ("tw", ":WVPER:surface:"), ("dw", ":WVDIR:surface:"),
    ("h1", ":SWELL:1 in sequence:"), ("t1", ":SWPER:1 in sequence:"), ("d1", ":SWDIR:1 in sequence:"),
    ("h2", ":SWELL:2 in sequence:"), ("t2", ":SWPER:2 in sequence:"), ("d2", ":SWDIR:2 in sequence:"),
]
CRITERIOS = {
    "fuente": "O.P.I. N° 1107 de la Gobernación Marítima de Valparaíso (21 mar 2024, ver. 1.6), puntos II.2 y II.3",
    "marejadas": ["Mar de fondo del SW/W con olas de 3 a 4 m",
                  "Mar de fondo del NW con olas de 2,0 m o más",
                  "Mar de viento del S/SW sobre 3 m en el litoral central (zonas II y III; criterio asociado al fortalecimiento del Anticiclón)"],
    "anormales": ["Mar de fondo del SW/W sobre 4 m",
                  "Mar de fondo del NW con período de 14 a 17 s y olas de 2,5 m o más",
                  "Mar de fondo del NW con período de 18 s o más y olas de 2,0 m o más",
                  "Mar de viento del NW/W sobre 3,0 m (sistema frontal)"],
    "notas": ["La O.P.I. usa como referencia la costa de la Región de Valparaíso; aquí se aplica a toda la costa evaluada.",
              "El modelo entrega altura significativa mar afuera por partición, no la altura de las olas en la rompiente.",
              "El período de cada partición del modelo es su período medio.",
              "Sectores de procedencia: SW 202,5°–247,5°, W 247,5°–292,5°, NW 292,5°–337,5°, S/SW 157,5°–247,5°.",
              "La O.P.I. exige emitir los avisos con a lo menos 48 horas de antelación; las sicigias se consideran al evaluar marejadas anormales."],
}


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def url(corrida, fhr):
    d, h = corrida.strftime("%Y%m%d"), corrida.strftime("%H")
    return f"https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.{d}/{h}/wave/gridded/gfswave.t{h}z.global.0p25.f{fhr:03d}.grib2"


def corrida_completa(ahora):
    """Corrida más reciente que ya publicó el plazo de 240 h."""
    c0 = (ahora - timedelta(hours=3)).replace(minute=0, second=0, microsecond=0)
    c0 = c0.replace(hour=c0.hour - c0.hour % 6)
    for k in range(5):
        corrida = c0 - timedelta(hours=6 * k)
        try:
            r = requests.get(url(corrida, PLAZOS[-1]) + ".idx", headers=CAB, timeout=30)
            if r.ok and "SWELL" in r.text:
                return corrida
        except Exception:
            pass
    return None


def descargar(corrida, fhr):
    """Lee solo los campos necesarios del GRIB2 (lectura parcial con su índice)."""
    base = url(corrida, fhr)
    idx = requests.get(base + ".idx", headers=CAB, timeout=40)
    idx.raise_for_status()
    lineas = idx.text.strip().splitlines()
    partes = {}
    for clave, texto in CAMPOS:
        for i, l in enumerate(lineas):
            if texto in l:
                ini = int(l.split(":")[1])
                fin = int(lineas[i + 1].split(":")[1]) - 1 if i + 1 < len(lineas) else ""
                r = requests.get(base, headers={**CAB, "Range": f"bytes={ini}-{fin}"}, timeout=90)
                r.raise_for_status()
                partes[clave] = r.content
                break
    faltan = [c for c, _ in CAMPOS if c not in partes]
    if faltan:
        raise RuntimeError(f"f{fhr:03d}: faltan {', '.join(faltan)}")
    return partes


def grilla(grib):
    """Campo recortado a la región, con NaN donde no hay dato (tierra o hielo)."""
    import pygrib
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".grb2") as f:
        f.write(grib); f.flush()
        g = pygrib.open(f.name)[1]
        v, lats, lons = g.data(lat1=SUR, lat2=NORTE, lon1=OESTE + 360, lon2=ESTE + 360)
    v = np.ma.filled(np.ma.masked_invalid(np.ma.asarray(v, dtype=float)), np.nan)
    v[np.abs(v) > 1e6] = np.nan
    return v, lats, np.where(lons > 180, lons - 360, lons)


# ------------------------------------------------------------ geografía

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


def millas(a, b):
    r = math.pi / 180
    dla, dlo = (b[0] - a[0]) * r, (b[1] - a[1]) * r
    h = math.sin(dla / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlo / 2) ** 2
    return 2 * 3440.065 * math.asin(math.sqrt(h))


def seleccionar_puntos(mar, lats, lons):
    """Índices de grilla por zona: costa continental (zona contigua, cara al océano) e islas."""
    from shapely import affinity
    from shapely.geometry import LineString, Point, shape
    from shapely.prepared import prep
    t = tierra()
    tp = prep(t)
    areas = {f["properties"]["id"]: (f["properties"].get("nombre", f["properties"]["id"]), shape(f["geometry"]))
             for f in leer(DATA / "geo" / "metarea.json", {"features": []})["features"] if f["properties"]["id"] in COSTERAS}
    zonas = {k: {"nombre": areas[k][0] if k in areas else k, "idx": []} for k in COSTERAS}
    zonas.update({k: {"nombre": v["nombre"], "idx": []} for k, v in ISLAS.items()})
    r = ZONA_CONTIGUA_MN / 60.0
    for i, j in zip(*np.where(mar)):
        la, lo = float(lats[i, j]), float(lons[i, j])
        for k, isla in ISLAS.items():
            if any(millas((la, lo), c) <= ZONA_CONTIGUA_MN + isla["radio_isla_mn"] for c in isla["centros"]):
                zonas[k]["idx"].append((int(i), int(j)))
        if not (LAT_PENAS <= la <= LAT_ARICA and lo > -77.5):
            continue
        p = Point(lo, la)
        circulo = affinity.scale(p.buffer(r, resolution=16), xfact=1 / math.cos(math.radians(la)), yfact=1)
        if not tp.intersects(circulo) or tp.contains(p):
            continue
        # Salida libre al océano: una línea de 4° hacia el oeste no cruza tierra (excluye canales y aguas interiores).
        # Al sur de 41,4° S se exige además salida hacia el WNW y el WSW, para dejar fuera golfos interiores
        # como el Corcovado, cuya boca queda abierta al oeste entre islas.
        rumbos = (0, 30, -30) if la < -41.4 else (0,)
        if any(tp.intersects(LineString([(lo, la), (lo - 4, la + 4 * math.tan(math.radians(a)))])) for a in rumbos):
            continue
        zona = next((k for k, (_, g) in areas.items() if g.buffer(0.05).contains(p)), None)
        if zona is None:   # punto entre polígonos por simplificación: zona más cercana
            zona = min(areas, key=lambda k: areas[k][1].distance(p)) if areas else None
        if zona:
            zonas[zona]["idx"].append((int(i), int(j)))
    return zonas


# ------------------------------------------------------------ criterios O.P.I. N° 1107

def sector(d):
    if d is None or not math.isfinite(d):
        return None
    d %= 360
    if 202.5 <= d < 247.5: return "SW"
    if 247.5 <= d < 292.5: return "W"
    if 292.5 <= d < 337.5: return "NW"
    return None


def evaluar(v, zona):
    """Categoría para un punto y plazo: (categoría, origen, h, t, d). 0 sin marejadas, 1 marejadas, 2 anormales."""
    mejor = (0, None, None, None, None)

    def tomar(c, origen, h, t, d):
        nonlocal mejor
        if (c, h or 0) > (mejor[0], mejor[2] or 0):
            mejor = (c, origen, h, t, d)

    for p in ("1", "2"):
        h, t, d = v["h" + p], v["t" + p], v["d" + p]
        if not math.isfinite(h):
            continue
        s = sector(d)
        if s in ("SW", "W"):
            if h > 4.0: tomar(2, "Mar de fondo del SW/W", h, t, d)
            elif h >= 3.0: tomar(1, "Mar de fondo del SW/W", h, t, d)
        elif s == "NW":
            if math.isfinite(t) and ((t >= 18 and h >= 2.0) or (14 <= t < 18 and h >= 2.5)):
                tomar(2, "Mar de fondo del NW", h, t, d)
            elif h >= 2.0:
                tomar(1, "Mar de fondo del NW", h, t, d)
    h, t, d = v["hw"], v["tw"], v["dw"]
    if math.isfinite(h) and math.isfinite(d):
        s = sector(d)
        if s in ("W", "NW") and h > 3.0:
            tomar(2, "Mar de viento del NW/W", h, t, d)
        elif zona in LITORAL_CENTRAL and 157.5 <= d % 360 < 247.5 and h > 3.0:
            tomar(1, "Mar de viento del S/SW", h, t, d)
    return mejor


# ------------------------------------------------------------ sicigias (Meeus, Astronomical Algorithms, cap. 49, términos principales)

def fase_lunar(k):
    """Fecha UTC de la luna nueva (k entero) o llena (k + 0,5)."""
    T = k / 1236.85
    jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T ** 2
    r = math.pi / 180
    E = 1 - 0.002516 * T
    M = (2.5534 + 29.10535670 * k) * r
    Mp = (201.5643 + 385.81693528 * k) * r
    F = (160.7108 + 390.67050284 * k) * r
    if abs(k - round(k)) < 1e-6:
        c = (-0.40720 * math.sin(Mp) + 0.17241 * E * math.sin(M) + 0.01608 * math.sin(2 * Mp) + 0.01039 * math.sin(2 * F)
             + 0.00739 * E * math.sin(Mp - M) - 0.00514 * E * math.sin(Mp + M) + 0.00208 * E * E * math.sin(2 * M))
    else:
        c = (-0.40614 * math.sin(Mp) + 0.17302 * E * math.sin(M) + 0.01614 * math.sin(2 * Mp) + 0.01043 * math.sin(2 * F)
             + 0.00734 * E * math.sin(Mp - M) - 0.00515 * E * math.sin(Mp + M) + 0.00209 * E * E * math.sin(2 * M))
    return datetime(2000, 1, 1, 12, tzinfo=timezone.utc) + timedelta(days=jde + c - 2451545.0)


def sicigias(desde, hasta):
    """Fases (nueva/llena) entre dos fechas y días locales a ±1 día de cada una."""
    k0 = math.floor((desde.year + (desde.timetuple().tm_yday - 1) / 365.25 - 2000) * 12.3685) - 1
    fases, dias = [], set()
    for n in range(0, 8):
        for frac, nombre in ((0.0, "Luna nueva"), (0.5, "Luna llena")):
            t = fase_lunar(k0 + n + frac)
            local = t.astimezone(TZ)
            if desde - timedelta(days=2) <= local.date() <= hasta + timedelta(days=2):
                fases.append({"fase": nombre, "utc": t.strftime("%Y-%m-%dT%H:%MZ")})
                for dd in (-1, 0, 1):
                    dias.add((local.date() + timedelta(days=dd)).isoformat())
    fases.sort(key=lambda f: f["utc"])
    return fases, sorted(dias)


# ------------------------------------------------------------ avisos oficiales vigentes

def compacto(s):
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").upper()) if c.isalnum() and unicodedata.category(c) != "Mn")


def avisos_por_zona():
    """Intervalos (desde, hasta) de avisos oficiales de marejadas por zona evaluada."""
    out = {k: [] for k in COSTERAS + list(ISLAS)}
    for a in leer(DATA / "avisos.json", {}).get("avisos", []):
        if "MAREJADA" not in compacto(a.get("tipo")):
            continue
        for z in a.get("zonas", []):
            try:
                ini = datetime.fromisoformat(z["desde"].replace("Z", "+00:00"))
                fin = datetime.fromisoformat(z["hasta"].replace("Z", "+00:00"))
            except Exception:
                continue
            n = compacto(z.get("nombre"))
            claves = [k for k in z.get("areas", []) if k in COSTERAS]
            if "JUANFERNANDEZ" in n: claves.append("JF")
            if "RAPANUI" in n or "PASCUA" in n: claves.append("RN")
            for k in claves:
                out[k].append((ini, fin, a.get("codigo") or a.get("tipo")))
    return out


def marcar_avisos(res):
    av = avisos_por_zona()
    for z in res["zonas"]:
        for c in z["celdas"]:
            d = date.fromisoformat(c["fecha"])
            ini_d = datetime(d.year, d.month, d.day, tzinfo=TZ)
            fin_d = ini_d + timedelta(days=1)
            c["aviso"] = next((cod for ini, fin, cod in av.get(z["id"], []) if ini < fin_d and fin > ini_d), None)
    res["avisos_revisados"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


# ------------------------------------------------------------ corrida

def procesar(corrida):
    with ThreadPoolExecutor(max_workers=8) as ex:
        futuros = {fhr: ex.submit(descargar, corrida, fhr) for fhr in PLAZOS}
    zonas, lats, lons, valores = None, None, None, {}
    for fhr in PLAZOS:
        try:
            partes = futuros[fhr].result()
        except Exception as e:
            print(f"Alerta de marejadas: plazo {fhr} h no disponible:", e)
            continue
        campos = {}
        for clave, _ in CAMPOS:
            v, la, lo = grilla(partes[clave])
            campos[clave] = v
            if lats is None:
                lats, lons = la, lo
        if zonas is None:
            zonas = seleccionar_puntos(np.isfinite(campos["h1"]) | np.isfinite(campos["hw"]), lats, lons)
        valores[fhr] = campos
    if len(valores) < len(PLAZOS) * 0.8 or zonas is None:
        raise RuntimeError(f"corrida incompleta ({len(valores)} de {len(PLAZOS)} plazos)")

    hoy = datetime.now(TZ).date()
    fechas = [(hoy + timedelta(days=n)).isoformat() for n in range(DIAS)]
    salida = []
    for k, z in zonas.items():
        celdas = {f: {"fecha": f, "cat": 0} for f in fechas}
        for fhr, campos in sorted(valores.items()):
            valido = corrida + timedelta(hours=fhr)
            f = valido.astimezone(TZ).date().isoformat()
            if f not in celdas:
                continue
            c = celdas[f]
            c["plazos"] = c.get("plazos", 0) + 1
            for i, j in z["idx"]:
                v = {cl: float(campos[cl][i, j]) for cl, _ in CAMPOS}
                cat, origen, h, t, d = evaluar(v, k)
                hs_ref = h if h is not None else max((x for x in (v["h1"], v["h2"], v["hw"]) if math.isfinite(x)), default=0)
                if (cat, hs_ref) > (c["cat"], c.get("hs", -1)):
                    c.update({"cat": cat, "hs": round(hs_ref, 1), "origen": origen,
                              "tp": round(t, 1) if t is not None and math.isfinite(t) else None,
                              "dir": round(d) % 360 if d is not None and math.isfinite(d) else None,
                              "lat": round(float(lats[i, j]), 2), "lon": round(float(lons[i, j]), 2),
                              "valido": valido.strftime("%Y-%m-%dT%H:%MZ"), "fhr": fhr})
        salida.append({"id": k, "nombre": z["nombre"],
                       "puntos": [[round(float(lats[i, j]), 2), round(float(lons[i, j]), 2)] for i, j in z["idx"]],
                       "celdas": [celdas[f] for f in fechas]})
    return fechas, salida


def persistencia(res, previo):
    """Historial de las últimas corridas y cuántas muestran marejadas en cada zona y día."""
    clave = res["clave"]
    hist = [h for h in previo.get("historial", []) if h.get("clave") != clave][-(CORRIDAS_HISTORIAL - 1):]
    actual = {"clave": clave, "cat": {z["id"]: {c["fecha"]: c["cat"] for c in z["celdas"]} for z in res["zonas"]}}
    hist.append(actual)
    res["historial"] = hist
    for z in res["zonas"]:
        for c in z["celdas"]:
            cubren = [h for h in hist if c["fecha"] in h["cat"].get(z["id"], {})]
            c["persistencia"] = [sum(1 for h in cubren if h["cat"][z["id"]][c["fecha"]] >= 1), len(cubren)]


def main():
    previo = leer(SALIDA, {})
    corrida = corrida_completa(datetime.now(timezone.utc))
    if corrida is None:
        print("Alerta de marejadas: ninguna corrida completa a 240 h; se mantiene lo anterior")
        if previo.get("zonas"):
            marcar_avisos(previo)
            SALIDA.write_text(json.dumps(previo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        return
    clave = corrida.strftime("%Y%m%d%H")
    if previo.get("clave") == clave and previo.get("version") == VERSION and not os.environ.get("FORZAR"):
        marcar_avisos(previo)
        SALIDA.write_text(json.dumps(previo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print("Alerta de marejadas: sin corrida nueva", clave, "(avisos oficiales revisados)"); return
    fechas, zonas = procesar(corrida)
    fases, dias_sicigia = sicigias(date.fromisoformat(fechas[0]), date.fromisoformat(fechas[-1]))
    res = {
        "version": VERSION, "clave": clave, "corrida": corrida.strftime("%Y-%m-%dT%HZ"),
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": "NOAA GFS-Wave (WAVEWATCH III) 0,25°, 0–240 h cada 6 h",
        "zona_contigua_mn": ZONA_CONTIGUA_MN, "fechas": fechas, "zonas": zonas,
        "fases_lunares": fases, "dias_sicigia": dias_sicigia, "criterios": CRITERIOS,
    }
    persistencia(res, previo)
    marcar_avisos(res)
    SALIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = sum(1 for z in zonas for c in z["celdas"] if c["cat"])
    print(f"Alerta de marejadas: {clave} · {sum(len(z['puntos']) for z in zonas)} puntos · {n} días-zona con marejadas")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Alerta de marejadas: error", e)
    sys.exit(0)
