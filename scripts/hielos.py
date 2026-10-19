#!/usr/bin/env python3
"""Página «Monitoreo de hielos»: capas en la proyección estereográfica polar de la carta de hielo de la Península Antártica.

Fuentes (sitio público de meteorología marítima, sección «Monitoreo de hielos» de su versión liviana):
  · Cartas de hielo marino de la Península Antártica: concentración (en décimos), % de concentración (AMSR2)
    y etapa de desarrollo. Se recorta solo el área del mapa (sin rótulos ni logos), se reconocen las clases de
    color de su leyenda, se eliminan líneas y textos y la tierra queda transparente.
  · Posible acumulación de hielo en cubierta (modelo GFS, 06 a 48 h): se georreferencia su grilla lat/lon.
  · Témpanos informados (texto del pronóstico de la Zona IX) e informe glaciológico de las bases antárticas.
Georreferencia: polar estereográfica centrada en el polo sur, ajustada con los meridianos y paralelos de cada carta
(error < 1 píxel). La página usa la proyección de la carta de concentración como base.
Salida: data/hielo.json y data/hielo_*.png. Nunca hace fallar el flujo de trabajo.
"""
import io
import json
import math
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
SAL = DATA
BASE = "https://web.directemar.cl/met/jturno/"
LIVIANA = "https://meteoarmada.directemar.cl/meteo/site/edic/base/port/inicio_liviana.html"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (monitoreo de hielos)"}
VERSION = 1

# Proyección de cada carta: polo (px, py) en píxeles, meridiano vertical L0 y escala S (ρ = S·tan(45° + φ/2))
PROY_CONC = {"px": 1499.02, "py": 3154.59, "L0": -72.01, "S": 8460.0}
PROY_BREMEN = {"px": 1523.45, "py": 3176.68, "L0": -72.02, "S": 8616.0}
MARCO = (172, 711, 2875, 3206)          # x0, y0, x1, y1 del mapa en la carta de concentración (base de la página)
SUB = 2                                  # la capa se publica a la mitad de la resolución
TOPE = 720                               # fila para controlar los meridianos (100° a 50° W)
MERID_CONC = [205, 708.5, 1157, 1584.5, 2017, 2483]
MERID_BREMEN = [218, 726, 1179, 1610, 2046, 2517]

CONC = [  # (nombre, color en la carta, …colores equivalentes)
    ("Sin hielo", (0, 100, 255), (0, 101, 255)),
    ("0–1 décimos", (150, 199, 255)),
    ("1–3 décimos", (140, 255, 160), (141, 255, 160)),
    ("4–6 décimos", (255, 255, 0), (255, 255, 1)),
    ("7–8 décimos", (255, 125, 7), (255, 124, 6)),
    ("9–10 décimos", (255, 0, 0), (254, 0, 0)),
    ("Nilas 9–10 décimos", (255, 100, 254)),
    ("Hielo nuevo 7–10 décimos", (255, 175, 255), (254, 175, 255)),
    ("Hielo fijo", (150, 150, 150)),
    ("Barrera de hielo", (210, 210, 210)),
    ("Hielo no definido", (192, 192, 192)),
]
ETAPA = [
    ("Sin hielo", (0, 101, 255), (25, 115, 255), (0, 100, 255)),
    ("Hielo nuevo (< 10 cm)", (240, 210, 250)),
    ("Nilas, costra de hielo (< 10 cm)", (255, 100, 255)),
    ("Hielo joven (10–30 cm)", (170, 40, 240)),
    ("Hielo gris (10–15 cm)", (135, 60, 215)),
    ("Hielo gris-blanco (15–30 cm)", (220, 80, 235)),
    ("Primer año (30–200 cm)", (255, 255, 0)),
    ("Primer año delgado (30–70 cm)", (137, 217, 33)),
    ("Primer año delgado, etapa 1 (30–50 cm)", (177, 244, 119)),
    ("Primer año delgado, etapa 2 (50–70 cm)", (175, 250, 0)),
    ("Primer año medio (70–120 cm)", (0, 200, 20)),
    ("Primer año grueso (> 120 cm)", (0, 120, 0)),
    ("Hielo viejo (> 2 m)", (180, 100, 50)),
    ("Segundo año", (255, 120, 10)),
    ("Multianual", (200, 0, 0)),
    ("Hielo fijo / no definido", (150, 150, 150)),
]
TIERRA = [(255, 255, 255), (254, 254, 254), (253, 253, 253), (252, 252, 252)]

CARTAS = {
    "conc": ("cartas/PENINSULA.png", "Concentración de hielo marino", PROY_CONC, MERID_CONC, CONC),
    "etapa": ("cartas/PENINSULA_DESARROLLO.png", "Etapa de desarrollo del hielo", PROY_CONC, MERID_CONC, ETAPA),
    "bremen": ("cartas/PENINSULA_BREMEN.png", "% de concentración (AMSR2)", PROY_BREMEN, MERID_BREMEN, None),
}
REGIONALES = [
    ("Estrecho de Bransfield · Estrecho Gerlache · Mar de Weddell", "BRANSFIELD"),
    ("Isla Anvers · Isla Adelaida", "ANVERS"),
    ("Bahía Margarita", "MARGARITA"),
    ("Paso Antarctic · Mar de Weddell", "WEDDELL"),
]
OTRAS = [
    ("Carta de témpanos", "cartas/iceberg_chart.png"),
    ("Imagen de radar de apertura sintética (SAR)", "cartas/sea_ice.png"),
    ("Hielo flotante en aguas interiores (canales australes)", "cartas/HIELO_FLOTANTE.png"),
]


def leer_json(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def bajar(url, timeout=60):
    try:
        r = requests.get(url, headers=CAB, timeout=timeout)
        if r.status_code == 200 and r.content:
            return r
    except Exception as e:
        print("No se pudo descargar", url, e)
    return None


def adelante(lat, lon, P):
    t = np.tan(np.radians(45 + np.asarray(lat) / 2.0))
    th = np.radians(np.asarray(lon) - P["L0"])
    return P["px"] + P["S"] * t * np.sin(th), P["py"] - P["S"] * t * np.cos(th)


def inversa(x, y, P):
    dx, dy = (np.asarray(x) - P["px"]) / P["S"], (P["py"] - np.asarray(y)) / P["S"]
    lat = 2 * np.degrees(np.arctan(np.hypot(dx, dy))) - 90
    lon = P["L0"] + np.degrees(np.arctan2(dx, dy))
    return lat, (lon + 180) % 360 - 180


def meridianos_ok(a, esperados):
    g = a[TOPE].astype(int).sum(1)
    return sum(1 for x in esperados if (g[max(0, int(x) - 3):int(x) + 4] < 200).any()) >= len(esperados) - 1


def clasificar(a, clases):
    """Índice de clase de cada píxel (0 = tierra, 1..n = clases, 255 = línea o texto)."""
    h, w, _ = a.shape
    idx = np.full((h, w), 255, np.uint8)
    flat = a.reshape(-1, 3).astype(int)
    out = idx.reshape(-1)
    for c in TIERRA:
        out[(np.abs(flat - c).sum(1) <= 3)] = 0
    for i, cl in enumerate(clases, start=1):
        for c in cl[1:]:
            out[(np.abs(flat - c).sum(1) <= 6)] = i
    return out.reshape(h, w)


def rellenar(idx, malo):
    from scipy.ndimage import distance_transform_edt
    _, (iy, ix) = distance_transform_edt(malo, return_indices=True)
    return idx[iy, ix]


def grilla_salida():
    x0, y0, x1, y1 = MARCO
    xs = np.arange(x0, x1, SUB) + SUB / 2
    ys = np.arange(y0, y1, SUB) + SUB / 2
    return np.meshgrid(xs, ys)


def procesar_clases(a, P, clases):
    idx = clasificar(a, clases)
    malo = idx == 255
    # rótulos blancos sobre el mar (componentes blancas pequeñas): se rellenan con el entorno
    from scipy import ndimage
    lab, n = ndimage.label(idx == 0)
    if n:
        tam = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
        malo |= np.isin(lab, np.where(tam < 900)[0] + 1)
    idx = rellenar(idx, malo)
    # grises sueltos (líneas punteadas sobre tierra, flecha del norte): se consideran tierra
    grises = [i for i, cl in enumerate(clases, start=1) if len(set(cl[1])) == 1]
    for gi in grises:
        lab, n = ndimage.label(idx == gi)
        if n:
            tam = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
            idx[np.isin(lab, np.where(tam < 2500)[0] + 1)] = 0
    X, Y = grilla_salida()
    lat, lon = inversa(X, Y, PROY_CONC)
    sx, sy = adelante(lat, lon, P)
    sx = np.clip(np.round(sx).astype(int), 0, a.shape[1] - 1)
    sy = np.clip(np.round(sy).astype(int), 0, a.shape[0] - 1)
    fuera = (sx < 172) | (sy < 711) | (sy > 3206)
    k = idx[sy, sx]
    k[fuera] = 0
    pal = [0, 0, 0]
    for cl in clases:
        pal += list(cl[1])
    pal += [0, 0, 0] * (256 - len(pal) // 3)
    im = Image.fromarray(k.astype(np.uint8), "P")
    im.putpalette(pal)
    trans = bytes([0] + [235] * len(clases) + [0] * (255 - len(clases)))
    return im, trans


def procesar_bremen(a, P):
    """% de concentración: escala continua. Tierra (gris azulado o blanco) transparente; líneas y textos rellenados."""
    ai = a.astype(int)
    mx, mn = ai.max(2), ai.min(2)
    tierra = ((mn > 175) & (mx - mn < 45)) | (mn > 240)
    linea = (mx < 90) | ((mx - mn < 25) & (mx < 175))
    for c in ((183, 72, 75), (141, 90, 153), (244, 23, 252), (200, 80, 90)):   # límites y espacios marítimos dibujados
        linea |= np.abs(ai - c).sum(2) < 45
    from scipy.ndimage import distance_transform_edt
    malo = linea
    _, (iy, ix) = distance_transform_edt(malo, return_indices=True)
    rgb = a[iy, ix]
    tierra = tierra[iy, ix]
    X, Y = grilla_salida()
    lat, lon = inversa(X, Y, PROY_CONC)
    sx, sy = adelante(lat, lon, P)
    sx = np.clip(np.round(sx).astype(int), 0, a.shape[1] - 1)
    sy = np.clip(np.round(sy).astype(int), 0, a.shape[0] - 1)
    fuera = (sx < 172) | (sx > 2923) | (sy < 711) | (sy > 3205)
    out = np.zeros(X.shape + (4,), np.uint8)
    out[..., :3] = rgb[sy, sx]
    out[..., 3] = np.where(tierra[sy, sx] | fuera, 0, 235)
    return Image.fromarray(out, "RGBA").quantize(colors=200, method=Image.Quantize.FASTOCTREE), None


# ---------------------------------------------------------------- hielo en cubierta (GFS)
ICE_MARCO = (57, 118, 935, 810)       # x de 90° W a 50° W, y de 45° S a 75° S (grilla lat/lon regular)
ICE_COL = [((0, 200, 200), "0–0,02"), ((160, 230, 50), "0,02–0,04"), ((255, 0, 0), "0,04–0,06"), ((202, 83, 255), "0,06–0,08"), ((180, 0, 180), "> 0,08")]


def procesar_cubierta(a):
    x0, y0, x1, y1 = ICE_MARCO
    ai = a.astype(int)
    X, Y = grilla_salida()
    lat, lon = inversa(X, Y, PROY_CONC)
    gx = x0 + (lon + 90) / 40 * (x1 - x0)
    gy = y0 + (-45 - lat) / 30 * (y1 - y0)
    dentro = (gx >= x0) & (gx <= x1) & (gy >= y0) & (gy <= y1)
    gxi = np.clip(np.round(gx).astype(int), 0, a.shape[1] - 1)
    gyi = np.clip(np.round(gy).astype(int), 0, a.shape[0] - 1)
    c = ai[gyi, gxi]
    sat = c.max(2) - c.min(2)
    out = np.zeros(X.shape + (4,), np.uint8)
    hay = dentro & (sat > 60)
    if hay.any():
        pal = np.array([k for k, _ in ICE_COL])
        d = ((c[hay][:, None, :] - pal[None]) ** 2).sum(2)
        out[hay, :3] = pal[d.argmin(1)]
        out[hay, 3] = 220
    return Image.fromarray(out, "RGBA"), int(hay.sum())


# ---------------------------------------------------------------- textos
def tempanos():
    r = bajar(BASE + "PRONOSTICOS/Cenmeteopar/zonanueve.txt", 30)
    if not r:
        return []
    t = r.content.decode("cp1252", "replace")
    out = []
    for m in re.finditer(r"^\s*([A-Z]\d+[A-Z]?)\s+TAMA\S*\s+(\d+(?:[.,]\d+)?)\s*X\s*(\d+(?:[.,]\d+)?)\s*MN,\s*LAT\.?\s*(\d+(?:[.,]\d+)?)\s*([NS])\s*/\s*LONG\.?\s*(\d+(?:[.,]\d+)?)\s*([EW])", t, re.M):
        lat = float(m.group(4).replace(",", ".")) * (-1 if m.group(5) == "S" else 1)
        lon = float(m.group(6).replace(",", ".")) * (-1 if m.group(7) == "W" else 1)
        out.append({"nombre": m.group(1), "largo_mn": float(m.group(2).replace(",", ".")), "ancho_mn": float(m.group(3).replace(",", ".")), "lat": lat, "lon": lon})
    vistos, unicos = set(), []
    for x in out:
        if x["nombre"] not in vistos:
            vistos.add(x["nombre"]); unicos.append(x)
    return unicos


TILDES = {"Concentracion": "Concentración", "Bahia": "Bahía", "Ingles": "Inglés", "Gandara": "Gándara", "Kopaitic": "Kopaitic"}


def tildes(s):
    return re.sub(r"[A-Za-zÁÉÍÓÚáéíóúÑñ]+", lambda m: TILDES.get(m.group(0), m.group(0)), s)


BASES_ANT = {"BAHIA FILDES": ("Bahía Fildes (Base Fildes)", -62.217, -58.817), "BAHIA CHILE": ("Bahía Chile (Base Prat)", -62.483, -59.683),
             "BASE OHIGGINS": ("Rada Covadonga (Base O'Higgins)", -63.317, -57.9)}


def informe():
    r = bajar(BASE + "avisos/informe.txt", 30)
    if not r:
        return None
    t = r.content.decode("cp1252", "replace").replace("\r", "")
    fecha = re.search(r"FECHA\s*:\s*(.+?)\.", t)
    bases, act, sec = [], None, None
    for l in t.split("\n"):
        u = l.strip()
        if not u or u.startswith(("GOBERNACION", "CENTRO", "INFORME", "FECHA", "EMITIDO", "POR EL")):
            continue
        m = re.match(r"^([A-Z' ]+?)\s*\(.*?\)\s*LAT", u)
        if m and m.group(1).strip() in BASES_ANT:
            n, la, lo = BASES_ANT[m.group(1).strip()]
            act = {"nombre": n, "lat": la, "lon": lo, "sectores": []}; bases.append(act); sec = None; continue
        m = re.match(r"^\d+\.-\s*(.+?):?$", u)
        if m and act is not None:
            sec = {"nombre": tildes(m.group(1).strip(" :").title().replace(" A ", " a ").replace(" De ", " de ")), "datos": []}
            act["sectores"].append(sec); continue
        m = re.match(r"^([A-ZÑÁÉÍÓÚ /]+?)\s*:\s*(.+?)\.?$", u)
        if m and sec is not None and not u.startswith("A.-"):
            k, v = tildes(m.group(1).strip().capitalize()), m.group(2).strip()
            if v:
                sec["datos"].append([k, v.capitalize() if not re.match(r"\d", v) else v])
    return {"fecha": fecha.group(1).strip().capitalize() if fecha else None, "bases": bases, "url": BASE + "avisos/informe.txt"}


# ---------------------------------------------------------------- principal
def main():
    SAL.mkdir(parents=True, exist_ok=True)
    previo = leer_json(DATA / "hielo.json", {})
    forzar = os.environ.get("FORZAR") == "1" or previo.get("version") != VERSION
    meta = {"version": VERSION, "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": LIVIANA,
            "proyeccion": PROY_CONC, "marco": {"x0": MARCO[0], "y0": MARCO[1], "x1": MARCO[2], "y1": MARCO[3]}, "capas": {}}
    for clave, (ruta, nombre, P, merid, clases) in CARTAS.items():
        ant = (previo.get("capas") or {}).get(clave)
        if ant and not forzar and (SAL / f"hielo_{clave}.png").exists():
            try:   # sin cambios en la carta: no se vuelve a descargar
                hd = requests.head(BASE + ruta, headers=CAB, timeout=20)
                if hd.ok and hd.headers.get("Last-Modified", "") == ant.get("last_modified"):
                    meta["capas"][clave] = ant; continue
            except Exception:
                pass
        r = bajar(BASE + ruta)
        if not r:
            if ant: meta["capas"][clave] = ant
            continue
        lm = r.headers.get("Last-Modified", "")
        if ant and ant.get("last_modified") == lm and not forzar and (SAL / f"hielo_{clave}.png").exists():
            meta["capas"][clave] = ant; continue
        a = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB"))
        if not meridianos_ok(a, merid):
            print(nombre, ": cambió el encuadre de la carta → se mantiene la capa anterior")
            if ant: meta["capas"][clave] = ant
            continue
        im, trans = procesar_clases(a, P, clases) if clases else procesar_bremen(a, P)
        if trans is not None:
            im.save(SAL / f"hielo_{clave}.png", optimize=True, transparency=trans)
        else:
            im.save(SAL / f"hielo_{clave}.png", optimize=True)
        meta["capas"][clave] = {"nombre": nombre, "last_modified": lm, "original": BASE + ruta,
                                "leyenda": [[c[0], "#%02x%02x%02x" % c[1]] for c in clases] if clases else None}
        print("Capa", clave, "publicada", lm)
    # hielo en cubierta
    horas = []
    for h in range(6, 49, 6):
        r = bajar(BASE + f"pub/GFS/IceG{h:02d}.png", 40)
        if not r:
            continue
        a = np.asarray(Image.open(io.BytesIO(r.content)).convert("RGB"))
        if a.shape[:2] != (1099, 970):
            continue
        im, n = procesar_cubierta(a)
        im.save(SAL / f"hielo_cubierta_{h:02d}.png", optimize=True)
        horas.append({"h": h, "pixeles": n, "last_modified": r.headers.get("Last-Modified", "")})
    if horas:
        meta["cubierta"] = {"horas": horas, "leyenda": [["#%02x%02x%02x" % c, t] for c, t in ICE_COL], "original": BASE + "pub/GFS/IceG06.png"}
    elif previo.get("cubierta"):
        meta["cubierta"] = previo["cubierta"]
    meta["tempanos"] = tempanos() or previo.get("tempanos", [])
    meta["informe"] = informe() or previo.get("informe")
    meta["regionales"] = [{"nombre": n, "conc": BASE + f"cartas/{k}.png", "bremen": BASE + f"cartas/{k}_BREMEN.png", "etapa": BASE + f"cartas/{k}_DESARROLLO.png"} for n, k in REGIONALES]
    meta["otras"] = [{"nombre": n, "url": BASE + u} for n, u in OTRAS]
    (DATA / "hielo.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Hielos: {len(meta['capas'])} cartas, {len(horas)} horas de hielo en cubierta, {len(meta['tempanos'])} témpanos")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback; traceback.print_exc()
        print("Hielos: error", e)
    sys.exit(0)
