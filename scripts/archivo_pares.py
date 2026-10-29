#!/usr/bin/env python3
"""Archivo de pares «entradas del modelo → boletín del especialista» → data/evaluacion/pares.jsonl

Para enseñar a un modelo a redactar el pronóstico de bahía como lo hace el especialista, cada vez que se publica un
boletín nuevo (data/pronosticos.json, se emite a las 16:00) se guarda, por bahía:
  · el boletín: situación sinóptica y texto de cada período (día 08–20 h y noche 20–08 h) con temperaturas;
  · las entradas disponibles a esa hora:
      - la versión vigente del pronóstico WRF + IA de la misma bahía (solo la referencia al commit de data/wrf_ia.json,
        cuyo contenido completo queda en el historial de git, más la situación sinóptica y el viento por día);
      - el oleaje NOAA GFS-Wave (WAVEWATCH III) en el punto de mar más cercano a la bahía, por período del boletín:
        altura significativa total, mar de viento y mar de fondo principal (altura, período y dirección).
Solo agrega boletines que aún no estén archivados. Nunca hace fallar el flujo de trabajo.
"""
import json
import math
import subprocess
import sys
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np

R = Path(__file__).resolve().parent.parent
DATA = R / "data"
SALIDA = DATA / "evaluacion" / "pares.jsonl"
TZ = ZoneInfo("America/Santiago")
VERSION = 1


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def compacto(s):
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").upper()) if c.isalnum() and unicodedata.category(c) != "Mn")


def commit_actual(ruta):
    try:
        return subprocess.run(["git", "log", "-1", "--format=%H", "--", ruta], cwd=R, capture_output=True, text=True).stdout.strip()[:12] or None
    except Exception:
        return None


# ------------------------------------------------------------ oleaje WW3 (data/ww3, 0,5°, cada 6 h)

class Oleaje:
    def __init__(self):
        self.idx = leer(DATA / "ww3" / "indice.json", {})
        self.campos = {}
        if not self.idx.get("plazos"):
            return
        n, m = self.idx["nlat"], self.idx["nlon"]
        claves = [c["clave"] for c in self.idx["campos"]]
        esc = {c["clave"]: c["escala"] for c in self.idx["campos"]}
        for p in self.idx["plazos"]:
            try:
                b = np.frombuffer((DATA / "ww3" / p["archivo"]).read_bytes(), dtype=np.uint8).reshape(len(claves), n, m)
            except Exception:
                continue
            t = datetime.fromisoformat(p["valido"].replace("Z", "+00:00"))
            self.campos[t] = {k: np.where(b[i] == self.idx.get("sin_dato", 255), np.nan, b[i] / esc[k]) for i, k in enumerate(claves)}

    def celda(self, lat, lon):
        """Celda de mar con dato más cercana a la bahía (hasta 1,5°)."""
        if not self.campos:
            return None
        hs = next(iter(self.campos.values()))["hs"]
        la0, lo0, dla, dlo = self.idx["lat0"], self.idx["lon0"], self.idx["dlat"], self.idx["dlon"]
        mejor = None
        for i in range(hs.shape[0]):
            la = la0 + i * dla
            if abs(la - lat) > 1.5:
                continue
            for j in range(hs.shape[1]):
                lo = lo0 + j * dlo
                if abs(lo - lon) > 1.5 or not math.isfinite(hs[i, j]):
                    continue
                d = math.hypot(la - lat, (lo - lon) * math.cos(math.radians(lat)))
                if mejor is None or d < mejor[0]:
                    mejor = (d, i, j, la, lo)
        return mejor

    def periodo(self, celda, ini, fin):
        """Resumen del oleaje en un período (UTC): rangos y mar de fondo en el momento de mayor altura."""
        if celda is None:
            return None
        _, i, j, _, _ = celda
        filas = [(t, c) for t, c in sorted(self.campos.items()) if ini <= t <= fin]
        if not filas:
            return None
        hs = [c["hs"][i, j] for _, c in filas]
        k = int(np.nanargmax(hs))
        c = filas[k][1]
        r = lambda v, d=1: None if v is None or not math.isfinite(v) else round(float(v), d)
        return {"hs": [r(np.nanmin(hs)), r(np.nanmax(hs))], "tp": r(c["tp"][i, j]), "dp": r(c["dp"][i, j], 0),
                "mar_viento": r(np.nanmax([x["hw"][i, j] for _, x in filas])),
                "mar_fondo": {"h": r(c["hsw"][i, j]), "t": r(c["tsw"][i, j]), "dir": r(c["dsw"][i, j], 0)},
                "plazos": len(filas)}


def ventana(per):
    """Período del boletín en UTC: día 08–20 h y noche 20–08 h (hora local)."""
    try:
        f = datetime.fromisoformat(per["fecha"])
    except Exception:
        return None
    h = (per.get("horario") or "").strip()
    noche = h.startswith("20:00") if h else per.get("tipo") == "noche"   # el horario manda: el tipo publicado a veces viene cruzado
    ini = datetime(f.year, f.month, f.day, 20 if noche else 8, tzinfo=TZ)
    fin = ini + timedelta(hours=12)
    return ("noche" if noche else "dia"), ini.astimezone(timezone.utc), fin.astimezone(timezone.utc)


def main():
    pron = leer(DATA / "pronosticos.json", {})
    wrf = leer(DATA / "wrf_ia.json", {})
    ya = set()
    if SALIDA.exists():
        for l in SALIDA.read_text(encoding="utf-8").splitlines():
            try:
                d = json.loads(l); ya.add((d["codigo"], d["emitido"]))
            except Exception:
                pass
    bahias_wrf = {compacto(b.get("nombre")): b for b in wrf.get("bahias", [])}
    commit_wrf = commit_actual("data/wrf_ia.json")
    ola = Oleaje()
    nuevos = []
    for it in pron.get("items", []):
        if it.get("tipo") != "bahia" or not it.get("emitido") or (it["codigo"], it["emitido"]) in ya:
            continue
        # bahía WRF + IA equivalente (mismo nombre, o nombre contenido: «Fiordo Aysén y Puerto Chacabuco» → «Puerto Chacabuco»)
        n = compacto(it.get("nombre"))
        b = bahias_wrf.get(n) or next((v for k, v in bahias_wrf.items() if k and (k in n or n in k)), None)
        pos = it.get("pos") or [None, None]
        celda = ola.celda(*pos) if pos[0] is not None else None
        periodos = []
        for p in it.get("periodos", []):
            v = ventana(p)
            periodos.append({"tipo": v[0] if v else p.get("tipo"), "fecha": p.get("fecha"), "horario": p.get("horario"),
                             "situacion": p.get("situacion"), "texto": p.get("texto"), "tmin": p.get("tmin"), "tmax": p.get("tmax"),
                             "ww3": ola.periodo(celda, v[1], v[2]) if v else None})
        entrada_wrf = None
        if b and b.get("pronostico"):
            pr = b["pronostico"]
            entrada_wrf = {"codigo": b.get("codigo"), "commit": commit_wrf, "generado": b.get("generado"), "inicializacion": pr.get("inicializacion_utc"),
                           "situacion_sinoptica": pr.get("situacion_sinoptica"),
                           "dias": [{k: d.get(k) for k in ("fecha", "nubosidad", "nubosidad_detalle", "viento", "precipitacion", "temp_max", "temp_min")} for d in pr.get("dias", [])]}
        nuevos.append({
            "v": VERSION, "codigo": it["codigo"], "nombre": it.get("nombre"), "grupo": it.get("grupo"), "pos": pos, "emitido": it["emitido"],
            "archivado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
            "boletin": periodos,
            "entradas": {"wrf_ia": entrada_wrf,
                         "ww3": None if celda is None else {"corrida": ola.idx.get("corrida"), "punto": [round(celda[3], 2), round(celda[4], 2)],
                                                            "fuente": ola.idx.get("fuente")}},
        })
    if nuevos:
        SALIDA.parent.mkdir(parents=True, exist_ok=True)
        with SALIDA.open("a", encoding="utf-8") as f:
            for x in nuevos:
                f.write(json.dumps(x, ensure_ascii=False, separators=(",", ":")) + "\n")
    con_wrf = sum(1 for x in nuevos if x["entradas"]["wrf_ia"])
    con_ola = sum(1 for x in nuevos if x["entradas"]["ww3"])
    print(f"Archivo de pares: {len(nuevos)} boletines nuevos ({con_wrf} con WRF + IA, {con_ola} con oleaje WW3) · {len(ya) + len(nuevos)} en total")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Archivo de pares: error", repr(e))
    sys.exit(0)
