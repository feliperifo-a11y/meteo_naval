#!/usr/bin/env python3
"""Archivo para post-procesamiento estadístico (MOS) → data/evaluacion/mos_*.jsonl y boyas_obs.jsonl

Un MOS aprende el sesgo propio de cada punto y plazo comparando lo que pronosticó un modelo numérico con lo que se
midió después. El WRF de 3 km solo se publica como meteogramas en imagen, así que el insumo numérico disponible es
ECMWF IFS 0,1° (viento) y NOAA GFS-Wave (oleaje). Ambos se sobrescriben en cada corrida; este script los congela.

En cada ejecución, sin repetir lo ya archivado:
  · mos_ecmwf.jsonl  una línea por corrida ECMWF (00 y 12 UTC): rapidez, dirección de procedencia y ráfaga a 10 m,
                     0–72 h cada 3 h, en la celda de grilla más cercana a cada estación costera y a cada boya SHOA;
  · mos_ww3.jsonl    una línea por corrida GFS-Wave: Hs, Tp, Dp, mar de viento y mar de fondo principal, 0–72 h cada 6 h,
                     en la celda de mar con dato más cercana (hasta 1,5°) a cada boya y estación;
  · boyas_obs.jsonl  una línea por medición nueva de las boyas SHOA (todas las variables que entrega el visor oficial,
                     sin convertir unidades). La fecha se guarda tal como la entrega la fuente («fecha»); la página la
                     interpreta como UTC.

Las observaciones de las estaciones costeras no se duplican aquí: ya quedan en el historial de git de
data/estaciones.json (ml/construir_dataset.py las lee desde ahí).
El catálogo de boyas se lee de build/plantilla.html, para no mantener dos listas.
Lee data/ecmwf y data/ww3, que dejan los pasos anteriores del flujo de trabajo. Nunca hace fallar el flujo.
"""
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests

R = Path(__file__).resolve().parent.parent
DATA = R / "data"
EVAL = DATA / "evaluacion"
SAL_ECMWF = EVAL / "mos_ecmwf.jsonl"
SAL_WW3 = EVAL / "mos_ww3.jsonl"
SAL_BOYAS = EVAL / "boyas_obs.jsonl"
HORIZONTE = 72
VERSION = 1
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (archivo MOS)"}
CAMPOS_BOYA = ["hsig", "hmax", "tsig", "tp", "dp", "tpdir", "dm", "tw", "mb", "wsd", "wdir", "wmax", "taire", "rh"]


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def ahora():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def anexar(ruta, filas):
    if not filas:
        return
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with ruta.open("a", encoding="utf-8") as f:
        for x in filas:
            f.write(json.dumps(x, ensure_ascii=False, separators=(",", ":")) + "\n")


def claves_archivadas(ruta, campo="corrida"):
    vistos = set()
    try:
        with ruta.open(encoding="utf-8") as f:
            for l in f:
                try:
                    vistos.add(json.loads(l).get(campo))
                except Exception:
                    pass
    except FileNotFoundError:
        pass
    return vistos


def num(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------ puntos de verificación

def catalogo_boyas():
    """[(id, nombre, lat, lon, url)] desde la página Desarrollo."""
    try:
        txt = (R / "build" / "plantilla.html").read_text(encoding="utf-8")
    except Exception:
        return []
    pat = re.compile(r"\['([^']+)',\s*'[^']*',\s*'(https://www\.shoa\.cl/boyas/consultar_(\w+)\.php)',\s*(-?[\d.]+),\s*(-?[\d.]+)\]")
    return [(m[3], m[1], float(m[4]), float(m[5]), m[2]) for m in pat.finditer(txt)]


def puntos():
    out = []
    for x in leer(DATA / "estaciones.json", {}).get("datos", []):
        la, lo = num(x.get("latitud")), num(x.get("longitud"))
        if x.get("codigo") and la is not None and lo is not None:
            out.append({"id": "est:" + x["codigo"], "pos": [round(la, 4), round(lo, 4)]})
    for b, nombre, la, lo, _ in catalogo_boyas():
        out.append({"id": "boya:" + b, "nombre": nombre, "pos": [la, lo]})
    return out


# ------------------------------------------------------------ grillas codificadas en un byte (data/ecmwf, data/ww3)

class Grilla:
    def __init__(self, carpeta):
        self.carpeta = carpeta
        self.idx = leer(carpeta / "indice.json", {})
        self.ok = bool(self.idx.get("plazos")) and bool(self.idx.get("clave"))

    def paso(self, p):
        return p.get("paso", p.get("fhr"))

    def campos(self, p):
        n, m = self.idx["nlat"], self.idx["nlon"]
        cl = self.idx["campos"]
        b = np.frombuffer((self.carpeta / p["archivo"]).read_bytes(), dtype=np.uint8).reshape(len(cl), n, m)
        sd = self.idx.get("sin_dato", 255)
        return {c["clave"]: np.where(b[i] == sd, np.nan, b[i] / c["escala"]) for i, c in enumerate(cl)}

    def coord(self, i, j):
        return self.idx["lat0"] + i * self.idx["dlat"], self.idx["lon0"] + j * self.idx["dlon"]

    def mas_cercana(self, lat, lon):
        i = int(round((lat - self.idx["lat0"]) / self.idx["dlat"]))
        j = int(round((lon - self.idx["lon0"]) / self.idx["dlon"]))
        if 0 <= i < self.idx["nlat"] and 0 <= j < self.idx["nlon"]:
            return i, j
        return None

    def mar_cercano(self, lat, lon, valido, radio=1.5):
        """Celda con dato (mar) más cercana, hasta `radio` grados."""
        best = None
        for i in range(self.idx["nlat"]):
            la = self.coord(i, 0)[0]
            if abs(la - lat) > radio:
                continue
            for j in range(self.idx["nlon"]):
                lo = self.coord(0, j)[1]
                if abs(lo - lon) > radio or not valido[i, j]:
                    continue
                d = math.hypot(la - lat, (lo - lon) * math.cos(math.radians(lat)))
                if best is None or d < best[0]:
                    best = (d, i, j)
        return None if best is None else best[1:]


def redondear(v, d):
    return None if v is None or not math.isfinite(float(v)) else round(float(v), d)


def archivar_modelo(carpeta, salida, decimales, buscar_mar, pts):
    g = Grilla(carpeta)
    if not g.ok:
        return f"sin datos en {carpeta.name}"
    if g.idx["clave"] in claves_archivadas(salida, "clave"):
        return f"corrida {g.idx['clave']} ya archivada"
    plazos = sorted((p for p in g.idx["plazos"] if g.paso(p) is not None and g.paso(p) <= HORIZONTE), key=g.paso)
    leidos = []
    for p in plazos:
        try:
            leidos.append((g.paso(p), g.campos(p)))
        except Exception as e:
            print(f"Archivo MOS: {carpeta.name} plazo {g.paso(p)} ilegible:", e)
    if len(leidos) < max(2, len(plazos) // 2):
        return "corrida incompleta; no se archiva"
    claves = list(leidos[0][1])
    ref = leidos[0][1][claves[0]]
    filas = []
    for pt in pts:
        la, lo = pt["pos"]
        celda = g.mar_cercano(la, lo, np.isfinite(ref)) if buscar_mar else g.mas_cercana(la, lo)
        if celda is None:
            continue
        i, j = celda
        cla, clo = g.coord(i, j)
        fila = {"id": pt["id"], "celda": [round(cla, 3), round(clo, 3)]}
        for k in claves:
            fila[k] = [redondear(c[k][i, j], decimales.get(k, 1)) for _, c in leidos]
        filas.append(fila)
    anexar(salida, [{"v": VERSION, "clave": g.idx["clave"], "corrida": g.idx.get("corrida"), "fuente": g.idx.get("fuente"),
                     "archivado": ahora(), "plazos": [p for p, _ in leidos], "puntos": filas}])
    return f"corrida {g.idx['clave']} · {len(filas)} puntos · {len(leidos)} plazos"


# ------------------------------------------------------------ mediciones de boyas SHOA

def detalle_error(e):
    """Nombre del error y, si el servidor respondió, su código y el inicio del cuerpo: sin eso no se sabe si es bloqueo o ruta caída."""
    r = getattr(e, "response", None)
    if r is None:
        return type(e).__name__
    cuerpo = " ".join((r.text or "")[:80].split())
    return f"HTTP {r.status_code}" + (f" ({cuerpo})" if cuerpo else "")


def leer_boya(url):
    r = requests.post(url + "?callback=cb", headers=CAB, timeout=45)
    r.raise_for_status()
    m = re.match(r"^\s*cb\s*\(([\s\S]*)\)\s*;?\s*$", r.text)
    return json.loads(m[1] if m else r.text)


def archivar_boyas():
    vistos = set()
    try:
        with SAL_BOYAS.open(encoding="utf-8") as f:
            for l in f:
                try:
                    x = json.loads(l)
                    vistos.add((x["boya"], x["fecha"]))
                except Exception:
                    pass
    except FileNotFoundError:
        pass
    nuevas, errores = [], []
    for b, nombre, la, lo, url in catalogo_boyas():
        try:
            filas = leer_boya(url)
        except Exception as e:
            errores.append(f"{nombre}: {detalle_error(e)}")
            continue
        for f in filas if isinstance(filas, list) else []:
            fecha = str(f.get("fecha_completa") or "")[:19]
            if not f.get("idBoya") or not re.match(r"\d{4}-\d\d-\d\d[ T]\d\d:\d\d", fecha) or (b, fecha) in vistos:
                continue
            med = {k: num(f.get(k)) for k in CAMPOS_BOYA}
            if all(v is None for v in med.values()):
                continue
            # Una boya que derivó lejos de su fondeo no sirve para verificar ese punto (mismo criterio que la página).
            pla, plo = num(f.get("latitud")), num(f.get("longuitud"))
            if pla is not None and plo is not None and (abs(pla - la) > 0.5 or abs(plo - lo) > 0.5):
                continue
            vistos.add((b, fecha))
            nuevas.append({"v": VERSION, "boya": b, "nombre": nombre, "fecha": fecha,
                           **{k: v for k, v in med.items() if v is not None}})
    nuevas.sort(key=lambda x: (x["fecha"], x["boya"]))
    anexar(SAL_BOYAS, nuevas)
    return f"{len(nuevas)} mediciones nuevas" + (f" · sin respuesta: {', '.join(errores)}" if errores else "")


def main():
    pts = puntos()
    print("Archivo MOS: ECMWF ·", archivar_modelo(DATA / "ecmwf", SAL_ECMWF, {"vel": 0, "dir": 0, "raf": 0}, False, pts))
    print("Archivo MOS: WW3 ·", archivar_modelo(DATA / "ww3", SAL_WW3, {"dp": 0, "dsw": 0}, True, pts))
    print("Archivo MOS: boyas ·", archivar_boyas())


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Archivo MOS: error", repr(e))
    sys.exit(0)
