#!/usr/bin/env python3
"""Dataset de aprendizaje de MeteoIA (equipo local, Mac mini) → ~/meteoia-ml/datos/*.parquet

Se ejecuta una vez por semana (mac/dataset_semanal.sh, launchd cl.meteonaval.dataset) sobre la copia del repositorio en
~/meteoia-ml/meteo_naval. Reconstruye todo desde cero en cada corrida, a partir del archivo de pares y del historial de git:

  pares_periodos.parquet   un registro por período de boletín del especialista (todas las bahías), con su texto, situación,
                           temperaturas, el oleaje WW3 del período y lo que decía el WRF + IA para ese día cuando se emitió;
  wrf_ia.parquet           todas las versiones del pronóstico WRF + IA de las cinco bahías de referencia, por día pronosticado;
  observaciones.parquet    todas las observaciones de las estaciones de la plataforma (viento en kt, dirección, temperatura);
  evaluacion.parquet       puntaje O.P.I. N° 1104 por día, bahía y fuente (WRF + IA y profesional), del resumen publicado.

No modifica el repositorio ni sube nada: es un insumo local para estadística (nivel 2) y ajuste fino (nivel 3).
"""
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

REPO = Path(os.environ.get("MN_REPO", Path.home() / "meteoia-ml" / "meteo_naval"))
SALIDA = Path(os.environ.get("MN_DATOS", Path.home() / "meteoia-ml" / "datos"))
DESDE = "2026-10-08"   # primera versión de data/wrf_ia.json en el repositorio
BAHIAS_WRF = {"IQUIQUE_norte_d03": "iquique", "VALPARAISO_centro_d08": "valparaiso", "TALCAHUANO_centro_d09": "talcahuano",
              "PUERTOMONTT_sur_d12": "puertomontt", "PUNTAARENAS_sur_d14": "puntaarenas"}
URL_RESUMEN = "https://meteoia.cl/data/evaluacion/resumen.json"


def git(*args, entrada=None):
    return subprocess.run(["git", *args], cwd=REPO, input=entrada, capture_output=True, check=False).stdout


def historial(ruta):
    out = git("log", "--format=%H %ct", f"--since={DESDE}", "--", ruta).decode().split("\n")
    filas = [l.split() for l in out if l.strip()]
    return [(s, datetime.fromtimestamp(int(t), timezone.utc)) for s, t in reversed(filas)]


def blobs(shas, ruta):
    """Contenido de un archivo en varios commits, por lotes (git cat-file --batch)."""
    res = {}
    for k in range(0, len(shas), 500):
        lote = shas[k:k + 500]
        out = git("cat-file", "--batch", entrada="".join(f"{s}:{ruta}\n" for s in lote).encode())
        i = 0
        for s in lote:
            j = out.index(b"\n", i)
            cab = out[i:j].split()
            i = j + 1
            if len(cab) < 3 or cab[1] == b"missing":
                continue
            tam = int(cab[2])
            res[s] = out[i:i + tam]
            i += tam + 1
    return res


def num(x):
    try:
        v = float(str(x).replace(",", "."))
        return v if v == v else None
    except Exception:
        return None


def guardar(filas, nombre):
    df = pd.DataFrame(filas)
    df.to_parquet(SALIDA / f"{nombre}.parquet", index=False)
    return len(df)


# ------------------------------------------------------------ pares boletín ↔ entradas

def pares():
    filas = []
    p = REPO / "data" / "evaluacion" / "pares.jsonl"
    if not p.exists():
        return filas
    for l in p.read_text(encoding="utf-8").splitlines():
        try:
            d = json.loads(l)
        except Exception:
            continue
        w = (d.get("entradas") or {}).get("wrf_ia") or {}
        dias = {x.get("fecha"): x for x in w.get("dias") or []}
        for per in d.get("boletin", []):
            o = per.get("ww3") or {}
            mf = o.get("mar_fondo") or {}
            hs = o.get("hs") or [None, None]
            wd = dias.get(per.get("fecha")) or {}
            filas.append({
                "codigo": d.get("codigo"), "nombre": d.get("nombre"), "grupo": d.get("grupo"),
                "lat": (d.get("pos") or [None, None])[0], "lon": (d.get("pos") or [None, None])[1],
                "emitido": d.get("emitido"), "tipo": per.get("tipo"), "fecha": per.get("fecha"), "horario": per.get("horario"),
                "situacion": per.get("situacion"), "texto": per.get("texto"), "tmin": per.get("tmin"), "tmax": per.get("tmax"),
                "ww3_hs_min": hs[0], "ww3_hs_max": hs[1], "ww3_tp": o.get("tp"), "ww3_dp": o.get("dp"), "ww3_mar_viento": o.get("mar_viento"),
                "ww3_fondo_h": mf.get("h"), "ww3_fondo_t": mf.get("t"), "ww3_fondo_dir": mf.get("dir"),
                "wrf_commit": w.get("commit"), "wrf_inicializacion": w.get("inicializacion"), "wrf_situacion": w.get("situacion_sinoptica"),
                "wrf_nubosidad": wd.get("nubosidad"), "wrf_viento": wd.get("viento"), "wrf_precipitacion": wd.get("precipitacion"),
                "wrf_tmax": wd.get("temp_max"), "wrf_tmin": wd.get("temp_min"),
            })
    return filas


# ------------------------------------------------------------ versiones del WRF + IA

def wrf_ia():
    hist = historial("data/wrf_ia.json")
    datos = blobs([s for s, _ in hist], "data/wrf_ia.json")
    filas, vistos = [], set()
    for s, t in hist:
        try:
            d = json.loads(datos[s])
        except Exception:
            continue
        for b in d.get("bahias", []):
            c = b.get("codigo")
            p = b.get("pronostico") or {}
            if c not in BAHIAS_WRF or not p:
                continue
            clave = (c, p.get("inicializacion_utc"), b.get("generado"))
            if clave in vistos:            # el mismo pronóstico reaparece en commits posteriores
                continue
            vistos.add(clave)
            for x in p.get("dias", []):
                filas.append({"bahia": BAHIAS_WRF[c], "codigo_wrf": c, "commit": s[:12], "subido": t.isoformat(), "modelo_ia": d.get("modelo_ia"),
                              "generado": b.get("generado"), "inicializacion": p.get("inicializacion_utc"),
                              "situacion_sinoptica": p.get("situacion_sinoptica"), "fecha": x.get("fecha"),
                              "nubosidad": x.get("nubosidad"), "nubosidad_detalle": x.get("nubosidad_detalle"), "viento": x.get("viento"),
                              "precipitacion": x.get("precipitacion"), "temp_max": x.get("temp_max"), "temp_min": x.get("temp_min")})
    return filas


# ------------------------------------------------------------ observaciones de estaciones

def observaciones():
    hist = historial("data/estaciones.json")
    datos = blobs([s for s, _ in hist], "data/estaciones.json")
    filas, vistos = [], set()
    for s, _ in hist:
        try:
            d = json.loads(datos.get(s, b"{}"))
        except Exception:
            continue
        for x in d.get("datos", []):
            c, f = x.get("codigo"), x.get("fecha")
            if not c or not f or (c, f) in vistos:
                continue
            vistos.add((c, f))
            u = (x.get("_unidad_viento") or "").lower()
            v = num(x.get("velocidadDelViento"))
            if v is not None and ("m/s" in u or u == "ms"):
                v *= 1.94384
            elif v is not None and "km" in u:
                v *= 0.539957
            filas.append({"estacion": c, "nombre": x.get("nombre"), "hora_local": f[:19], "viento_kt": None if v is None else round(v, 1),
                          "dir": num(x.get("viento")), "temperatura": num(x.get("temperatura"))})
    return filas


# ------------------------------------------------------------ evaluación O.P.I. N° 1104 (resumen publicado)

def evaluacion():
    req = urllib.request.Request(f"{URL_RESUMEN}?t={int(datetime.now().timestamp())}", headers={"User-Agent": "meteoia-dataset"})
    with urllib.request.urlopen(req, timeout=60) as r:
        res = json.loads(r.read())
    filas = []
    for f in res.get("dias", []):
        o = f.get("obs") or {}
        for fuente in ("wrf", "prof"):
            x = f.get(fuente)
            if not x:
                continue
            p = x.get("pauta") or {}
            c = p.get("componentes") or {}
            filas.append({"fecha": f["fecha"], "bahia": f["bahia"], "fuente": fuente, "texto": x.get("texto"), "tmax_pron": x.get("tmax"),
                          "prompt": x.get("prompt"), "puntaje": p.get("puntaje"), "conforme": p.get("conforme"),
                          "dir_pct": c.get("direccion"), "int_pct": c.get("intensidad"), "tmax_pct": c.get("temperatura"),
                          "int_pron": p.get("int_pron"), "int_obs": p.get("int_obs"), "error_int": p.get("error_int"), "error_tmax": p.get("error_tmax"),
                          "obs_vprom": o.get("vprom"), "obs_tmax": o.get("tmax"), "obs_suficiente": o.get("suficiente")})
    return filas


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    if not (REPO / ".git").exists():
        print(f"No encuentro la copia del repositorio en {REPO}"); return 1
    res = {}
    for nombre, f in (("pares_periodos", pares), ("wrf_ia", wrf_ia), ("observaciones", observaciones), ("evaluacion", evaluacion)):
        try:
            res[nombre] = guardar(f(), nombre)
        except Exception as e:
            res[nombre] = f"error {e!r}"
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M")
    linea = f"{ahora} Dataset: " + " · ".join(f"{k} {v}" for k, v in res.items())
    (SALIDA / "ultimo.json").write_text(json.dumps({"generado": ahora, "filas": res}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(linea)
    return 0


if __name__ == "__main__":
    sys.exit(main())
