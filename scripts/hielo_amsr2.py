#!/usr/bin/env python3
"""Concentración y borde del hielo marino desde AMSR2 (Universidad de Bremen), para la página Desarrollo.

Fuente: concentración diaria del algoritmo ASI aplicada a AMSR2 (Universidad de Bremen, versión 5.4), grilla
antártica de 6,25 km en proyección estereográfica polar del NSIDC. Se usa el GeoTIFF diario:
  https://data.seaice.uni-bremen.de/amsr2/asi_daygrid_swath/s6250/AAAA/mmm/Antarctic/asi-AMSR2-s6250-AAAAMMDD-v5.4.tif
Cita pedida por la fuente: Spreen, G., Kaleschke, L. y Heygster, G. (2008), J. Geophys. Res., 113, C02S03,
doi:10.1029/2005JC003384. La fuente no declara licencia y advierte que la calibración AMSR2 no está terminada.

Proceso: recorte al área de responsabilidad de SERVIMET (METAREA XV, de 120° W a 53° W y al norte de 70° S); clases de concentración
en décimos con los colores OMM (los mismos de la carta de hielo); borde de hielo como el contorno de 15 %, umbral
usual en microondas pasiva. Es una estimación automática satelital, no una carta de hielo analizada.

Autoverificación: antes de publicar, comprueba que la tierra de la grilla caiga sobre la Península Antártica y la isla
Alejandro I, y que el Paso Drake sea mar. Si no cuadra, no escribe nada y se conserva la última salida válida.
Salida: data/hielo_amsr2.json. Nunca hace fallar el flujo de trabajo.
"""
import io
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import requests
import shapely
from PIL import Image
from pyproj import Transformer
from shapely.geometry import MultiLineString, Polygon, box, mapping

Image.MAX_IMAGE_PIXELS = None
RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "hielo_amsr2.json"
BASE = "https://data.seaice.uni-bremen.de/amsr2/asi_daygrid_swath/s6250/{a}/{m}/Antarctic/asi-AMSR2-s6250-{f}-v5.4.tif"
MESES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (hielo AMSR2)"}
VERSION = 1

# Estereográfica polar sur del NSIDC (latitud verdadera 70° S). El GeoTIFF de Bremen la usa sobre WGS84.
PROY = "+proj=stere +lat_0=-90 +lat_ts=-70 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
# Grilla estándar del NSIDC a 6,25 km (respaldo si el archivo no trae sus marcas de georreferencia)
GRILLA_NSIDC = {"x0": -3950000.0, "y0": 4350000.0, "dx": 6250.0, "dy": 6250.0}
AREA = (-120.0, -70.0, -53.0, -50.0)    # lon O, lat S, lon E, lat N: área de SERVIMET (METAREA XV, data/geo/metarea.json)
SECTOR_DRAKE = (-70.0, -53.0)           # longitudes para la latitud más al norte del borde
UMBRAL_BORDE = 15.0
# Clases en décimos (redondeo al décimo más cercano); bajo 15 % se trata como agua libre, como el borde.
CLASES = [
    ("c13", "1–3 décimos", 15.0, 35.0, "#8cffa0"),
    ("c46", "4–6 décimos", 35.0, 65.0, "#ffff00"),
    ("c78", "7–8 décimos", 65.0, 85.0, "#ff7d07"),
    ("c910", "9–10 décimos", 85.0, 100.01, "#ff0000"),
]
# Control de georreferencia: (lat, lon, debe_ser_tierra)
CONTROL = [(-71.5, -70.5, True), (-66.0, -64.0, True), (-69.5, -65.0, True), (-80.0, -80.0, True),
           (-58.0, -65.0, False), (-56.0, -45.0, False), (-65.0, -67.5, False), (-64.5, -56.0, False), (-68.0, -85.0, False)]
SIMPLIFICAR_M = 2500.0                  # 0,4 celda: no altera la clase de ninguna celda de 6,25 km


def log(*a):
    print("[hielo_amsr2]", *a, flush=True)


def fecha_existente():
    try:
        return json.loads(SALIDA.read_text(encoding="utf-8")).get("fecha")
    except Exception:
        return None


def bajar(fecha):
    url = BASE.format(a=fecha.year, m=MESES[fecha.month - 1], f=fecha.strftime("%Y%m%d"))
    try:
        r = requests.get(url, headers=CAB, timeout=60)
        if r.status_code == 200 and r.content[:2] in (b"II", b"MM"):
            return url, r.content
        log(f"{fecha:%Y-%m-%d}: HTTP {r.status_code}")
    except Exception as e:
        log(f"{fecha:%Y-%m-%d}: {e}")
    return url, None


def leer_tiff(contenido):
    im = Image.open(io.BytesIO(contenido))
    a = np.array(im)
    if a.ndim == 3:
        a = a[..., 0]
    tags = getattr(im, "tag_v2", {})
    escala, punto = tags.get(33550), tags.get(33922)
    if escala and punto and len(punto) >= 5:
        g = {"x0": float(punto[3]) - float(punto[0]) * float(escala[0]), "y0": float(punto[4]) + float(punto[1]) * float(escala[1]),
             "dx": float(escala[0]), "dy": float(escala[1])}
        origen = "marcas del GeoTIFF"
    else:
        g, origen = dict(GRILLA_NSIDC), "grilla estándar NSIDC"
    return a, g, origen


def decodificar(a):
    """Devuelve (concentración en %, máscara de tierra, máscara sin dato) y la codificación detectada."""
    if np.issubdtype(a.dtype, np.floating):
        c = a.astype(float)
        sin = ~np.isfinite(c) | (c < 0) | (c > 100.5)
        return np.where(sin, np.nan, c), np.zeros(c.shape, bool), sin, "flotante 0–100 %"
    v = a.astype(int)
    altos = np.unique(v[(v > 100) & (v <= 250)])
    if len(altos) > 5:                   # escala 0–200 (pasos de 0,5 %); 251 = tierra, 255 = sin dato
        c, tierra, sin, cod = v / 2.0, v == 251, (v > 200) & (v != 251), "byte 0–200 (0,5 %)"
    else:                                # escala 0–100; los valores sobre 100 son marcas
        c, sin, cod = v.astype(float), v > 100, "byte 0–100 %"
        marcas = [m for m in np.unique(v[v > 100]) if m != 255]
        tierra = np.isin(v, marcas) if marcas else np.zeros(v.shape, bool)
        sin = sin & ~tierra
    c = np.where(tierra | sin, np.nan, c)
    return c, tierra, sin, cod


def indice(g, x, y):
    return int((g["y0"] - y) // g["dy"]), int((x - g["x0"]) // g["dx"])


def verificar(tierra, sin, g, a_xy):
    fallas = []
    for lat, lon, debe in CONTROL:
        x, y = a_xy.transform(lon, lat)
        f, c = indice(g, x, y)
        if not (1 <= f < tierra.shape[0] - 1 and 1 <= c < tierra.shape[1] - 1):
            fallas.append(f"{lat},{lon} fuera de la grilla")
            continue
        ventana = tierra[f - 1:f + 2, c - 1:c + 2]
        es_tierra = ventana.mean() > 0.5
        if es_tierra != debe:
            fallas.append(f"{lat},{lon}: se esperaba {'tierra' if debe else 'mar'}")
        if not debe and sin[f - 1:f + 2, c - 1:c + 2].mean() > 0.5:
            fallas.append(f"{lat},{lon}: sin dato")
    if not fallas:
        fallas += verificar_calce(tierra, g)
    return fallas


def decodificar_polilinea6(s):
    i = lat = lon = 0
    pts = []
    while i < len(s):
        par = []
        for _ in (0, 1):
            r = sh = 0
            while True:
                b = ord(s[i]) - 63
                i += 1
                r |= (b & 31) << sh
                sh += 5
                if b < 32:
                    break
            par.append(~(r >> 1) if r & 1 else r >> 1)
        lat += par[0]
        lon += par[1]
        pts.append((lon / 1e6, lat / 1e6))
    return pts


def verificar_calce(tierra, g):
    """Compara la tierra de la grilla con la costa del sitio (data/geo/land.json): la posición nominal debe calzar
    mejor que la grilla corrida 25 km en cualquiera de ocho direcciones. Detecta corrimientos que los puntos no ven."""
    try:
        costa = json.loads((RAIZ / "data" / "geo" / "land.json").read_text(encoding="utf-8"))
        partes = []
        for c in costa:
            for poli in c["p"]:
                anillos = [decodificar_polilinea6(r) for r in poli]
                if len(anillos[0]) >= 4:
                    partes.append(shapely.make_valid(Polygon(anillos[0], [r for r in anillos[1:] if len(r) >= 4])))
        ref = shapely.union_all(partes)
        shapely.prepare(ref)
    except Exception as e:
        log(f"Sin costa de referencia para el control de calce ({e}); se usan solo los puntos de control")
        return []
    a_ll = Transformer.from_crs(PROY, "EPSG:4326", always_xy=True)
    C, F = np.meshgrid(np.arange(0, tierra.shape[1], 2), np.arange(0, tierra.shape[0], 2))

    def calce(dx, dy):
        x = g["x0"] + dx + (C + 0.5) * g["dx"]
        y = g["y0"] + dy - (F + 0.5) * g["dy"]
        lo, la = a_ll.transform(x, y)
        m = (lo >= AREA[0]) & (lo <= AREA[2]) & (la >= AREA[1]) & (la <= AREA[3])
        r = shapely.contains_xy(ref, lo[m], la[m])
        k = tierra[F[m], C[m]]
        return (r & k).sum() / max((r | k).sum(), 1)

    base = calce(0, 0)
    d = 25000.0
    vecinos = {(dx, dy): calce(dx, dy) for dx in (-d, 0, d) for dy in (-d, 0, d) if (dx, dy) != (0, 0)}
    mejor = max(vecinos, key=vecinos.get)
    log(f"Calce con la costa del sitio: {base:.3f} (mejor corrimiento de 25 km: {vecinos[mejor]:.3f})")
    if vecinos[mejor] >= base:
        return [f"la grilla calza mejor corrida {mejor[0] / 1000:+.0f} km E, {mejor[1] / 1000:+.0f} km N"]
    return []


def anillos_a_poligono(anillos):
    """Une los anillos de un nivel con diferencia simétrica: resuelve islas y huecos anidados."""
    geom = Polygon()
    for r in anillos:
        if len(r) >= 4:
            p = shapely.make_valid(Polygon(r))
            geom = geom.symmetric_difference(p)
    return geom


def main():
    hoy = datetime.now(timezone.utc).date()
    previa = fecha_existente()
    url = contenido = fecha = None
    for k in range(0, 6):
        d = hoy - timedelta(days=k)
        if previa and d.isoformat() <= previa:
            log(f"Sin día más nuevo que {previa}: se conserva la salida existente")
            return
        url, contenido = bajar(d)
        if contenido:
            fecha = d
            break
    if not contenido:
        log("No se encontró un archivo de los últimos 6 días")
        return

    a, g, origen = leer_tiff(contenido)
    conc, tierra, sin, cod = decodificar(a)
    log(f"{fecha} · {a.shape[1]}×{a.shape[0]} · {a.dtype} · {cod} · georreferencia: {origen}")
    salida = procesar(conc, tierra, sin, g, fecha, url, cod)
    if salida:
        escribir(salida)


def procesar(conc, tierra, sin, g, fecha, url, cod):
    """Clases, borde y resumen a partir de la grilla decodificada. Devuelve None si la verificación falla."""
    a_xy = Transformer.from_crs("EPSG:4326", PROY, always_xy=True)
    a_ll = Transformer.from_crs(PROY, "EPSG:4326", always_xy=True)
    fallas = verificar(tierra, sin, g, a_xy)
    if fallas:
        log("Georreferencia o codificación no verificadas; no se publica: " + "; ".join(fallas))
        return None

    # Recorte al área de interés (caja en la proyección que contiene la caja geográfica)
    lons = np.linspace(AREA[0], AREA[2], 161)
    lats = np.linspace(AREA[1], AREA[3], 61)
    LO, LA = np.meshgrid(lons, lats)
    X, Y = a_xy.transform(LO, LA)
    f0, c0 = indice(g, X.min(), Y.max())
    f1, c1 = indice(g, X.max(), Y.min())
    f0, c0 = max(f0 - 8, 0), max(c0 - 8, 0)
    f1, c1 = min(f1 + 9, conc.shape[0]), min(c1 + 9, conc.shape[1])
    sub = conc[f0:f1, c0:c1]
    xs = g["x0"] + (np.arange(c0, c1) + 0.5) * g["dx"]
    ys = g["y0"] - (np.arange(f0, f1) + 0.5) * g["dy"]

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    campo = np.ma.masked_invalid(sub)
    niveles = [k[2] for k in CLASES] + [CLASES[-1][3]]
    fig, ax = plt.subplots()
    cs = ax.contourf(xs, ys, campo, levels=niveles)
    cl = ax.contour(xs, ys, campo, levels=[UMBRAL_BORDE])
    caja = box(AREA[0], AREA[1], AREA[2], AREA[3])
    a_geo = lambda xy: np.column_stack(a_ll.transform(xy[:, 0], xy[:, 1]))

    zonas = []
    for (cid, nombre, lo, hi, color), camino in zip(CLASES, cs.get_paths()):
        anillos = camino.to_polygons(closed_only=True)
        geom = shapely.make_valid(anillos_a_poligono(anillos).simplify(SIMPLIFICAR_M))
        # Densificar antes de cambiar de proyección: un tramo recto largo en la estereográfica no es recto en lat/lon
        geom = shapely.segmentize(geom, g["dx"])
        geom = shapely.make_valid(shapely.transform(geom, a_geo)).intersection(caja)
        geom = shapely.make_valid(geom)
        geom = shapely.set_precision(geom, 0.01)
        if geom.is_empty:
            continue
        zonas.append({"type": "Feature", "properties": {"clase": cid, "nombre": nombre, "min": lo, "max": min(hi, 100), "color": color},
                      "geometry": mapping(geom)})

    lineas = []
    for camino in cl.get_paths():
        for seg in camino.to_polygons(closed_only=False):
            if len(seg) >= 3:
                lineas.append(seg)
    plt.close(fig)
    borde = shapely.transform(MultiLineString(lineas), a_geo).simplify(0.02).intersection(caja) if lineas else MultiLineString()
    borde = shapely.set_precision(borde, 0.01)

    # Latitud más al norte del borde en el sector del Paso Drake
    lat_norte = None
    if not borde.is_empty:
        pts = shapely.get_coordinates(borde)
        sel = pts[(pts[:, 0] >= SECTOR_DRAKE[0]) & (pts[:, 0] <= SECTOR_DRAKE[1])]
        if len(sel):
            lat_norte = round(float(sel[:, 1].max()), 2)
    region = sub[np.isfinite(sub) | sin[f0:f1, c0:c1]]
    faltante = float(np.isnan(region).mean() * 100) if region.size else None

    salida = {
        "version": VERSION,
        "fecha": fecha.isoformat(),
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "fuente": "Universidad de Bremen · ASI AMSR2 v5.4",
        "url_fuente": url,
        "cita": "Spreen, G., Kaleschke, L. y Heygster, G. (2008), J. Geophys. Res., 113, C02S03, doi:10.1029/2005JC003384",
        "resolucion_km": 6.25,
        "umbral_borde": UMBRAL_BORDE,
        "area": AREA,
        "codificacion": cod,
        "clases": [{"id": c[0], "nombre": c[1], "min": c[2], "max": min(c[3], 100), "color": c[4]} for c in CLASES],
        "zonas": {"type": "FeatureCollection", "features": zonas},
        "borde": {"type": "Feature", "properties": {"umbral": UMBRAL_BORDE}, "geometry": mapping(borde)},
        "resumen": {"borde_lat_norte_drake": lat_norte, "sector_drake_lon": SECTOR_DRAKE,
                    "sin_dato_pct": round(faltante, 1) if faltante is not None else None},
    }
    return salida


def escribir(salida):
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    tmp = SALIDA.with_suffix(".tmp")
    tmp.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(SALIDA)
    r = salida["resumen"]
    log(f"Publicado {SALIDA.name}: {len(salida['zonas']['features'])} clases, "
        f"borde más al norte en el Drake {r['borde_lat_norte_drake']}°, {SALIDA.stat().st_size // 1024} KB")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # nunca hace fallar el flujo
        log(f"Error: {e}")
    sys.exit(0)
