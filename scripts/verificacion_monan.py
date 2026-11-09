#!/usr/bin/env python3
"""Verificación diaria de MONAN 3 km (corrida propia de Felipe, repositorio trombas_marinas) contra las estaciones costeras.

Para cada corrida archivada en el historial de git de trombas_marinas/data/monan_campos.json y cada estación de
capitanía de puerto que cae dentro de la malla (fuera de la zona de borde), compara el día 08:00–20:00 con la misma
pauta O.P.I. N° 1104 que usa la evaluación del WRF (dirección, intensidad y temperatura máxima, horarios sinópticos 12,
15, 18, 21 y 00 UTC). MONAN entrega viento y temperatura cada 3 h, justo en esos horarios.

Corrida que se evalúa para el día D: la más reciente iniciada a lo menos 12 h antes del inicio del día (D−1 12Z o
anterior), es decir, un pronóstico de 24 a 48 h, comparable con el boletín de bahía emitido la tarde anterior.

Entradas: MONAN_REPO (clon de trombas_marinas con historial), historial de data/estaciones.json de este repositorio.
Salida: data/evaluacion/monan.json. Nunca hace fallar el flujo.
"""
import json
import math
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluacion_ia import (PESOS, TZ, blobs, historial, num, resumen_obs, tabla_direccion,  # noqa: E402
                           tabla_intensidad, tabla_temperatura)

R = Path(__file__).resolve().parent.parent
DATA = R / "data"
SALIDA = DATA / "evaluacion" / "monan.json"
MONAN_REPO = Path(os.environ.get("MONAN_REPO", "/tmp/trombas_marinas"))
RUTA_MONAN = "data/monan_campos.json"
DIST_MAX_KM = 15.0           # la estación debe quedar a menos de esta distancia del centro de la celda más cercana
ANTICIPACION_H = 12          # corrida iniciada a lo menos 12 h antes de las 08:00 locales del día evaluado


def km(lat1, lon1, lat2, lon2):
    r = math.radians
    a = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def ang(a, b):
    d = abs((a - b) % 360)
    return min(d, 360 - d)


def corridas():
    """[(datetime de inicio UTC, sha, dict)] de las corridas archivadas en trombas_marinas, una por corrida."""
    if not (MONAN_REPO / ".git").exists():
        return []
    log = subprocess.run(["git", "-C", str(MONAN_REPO), "log", "--format=%H", "--", RUTA_MONAN],
                         capture_output=True, text=True).stdout.split()
    vistas, out = set(), []
    for sha in log:
        try:
            d = json.loads(subprocess.run(["git", "-C", str(MONAN_REPO), "show", f"{sha}:{RUTA_MONAN}"],
                                          capture_output=True).stdout)
            ini = datetime.strptime(d["corrida"], "%Y-%m-%dT%HZ").replace(tzinfo=timezone.utc)
        except Exception:
            continue
        if ini in vistas:
            continue
        vistas.add(ini)
        out.append((ini, sha[:7], d))
    return sorted(out, key=lambda x: x[0])


def centros(d):
    vlat, vlon = np.array(d["vlat"]), np.array(d["vlon"])
    clat = np.array([vlat[c].mean() for c in d["celdas"]])
    clon = np.array([vlon[c].mean() for c in d["celdas"]])
    return clat, clon


def estaciones_actuales():
    d = json.loads((DATA / "estaciones.json").read_text(encoding="utf-8"))
    out = []
    for x in d.get("datos", []):
        la, lo = num(x.get("latitud")), num(x.get("longitud"))
        if la is None or lo is None:
            continue
        nombre = str(x.get("nombre") or x.get("codigo")).replace("CP.", "").strip().title()
        out.append({"codigo": x["codigo"], "nombre": nombre, "lat": la, "lon": lo})
    return out


def obs_por_estacion(codigos):
    """{estación: {día: [(datetime local, kt, dir, temp)]}} para las estaciones pedidas (historial de estaciones.json)."""
    hist = historial("data/estaciones.json")
    datos = blobs([s for s, _ in hist], "data/estaciones.json")
    vistos, out = set(), {}
    for s, _ in hist:
        try:
            d = json.loads(datos.get(s, b"{}"))
        except Exception:
            continue
        for x in d.get("datos", []):
            c = x.get("codigo")
            if c not in codigos or (c, x.get("fecha")) in vistos:
                continue
            vistos.add((c, x.get("fecha")))
            try:
                t = datetime.fromisoformat(x["fecha"][:19])
            except Exception:
                continue
            u = (x.get("_unidad_viento") or "").lower()
            v = num(x.get("velocidadDelViento"))
            if v is not None and ("m/s" in u or u == "ms"):
                v *= 1.94384
            elif v is not None and "km" in u:
                v *= 0.539957
            out.setdefault(c, {}).setdefault(t.date().isoformat(), []).append((t, v, num(x.get("viento")), num(x.get("temperatura"))))
    return out


def pronostico_celda(d, celda, dia):
    """Viento (kt, de dónde viene) y temperatura de MONAN en la celda, en los plazos del día 08–20 h local y 00 UTC siguiente."""
    U, V, T = d["campos"]["u10"], d["campos"]["v10"], d["campos"]["t2"]
    filas = []
    for i, p in enumerate(d["plazos"]):
        vt = datetime.strptime(p["valida"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
        loc = vt.astimezone(TZ)
        dentro = (loc.date().isoformat() == dia and 8 <= loc.hour < 20) or (vt == datetime.fromisoformat(dia).replace(tzinfo=timezone.utc) + timedelta(days=1))
        if not dentro:
            continue
        u, v, t = U["datos"][i][celda], V["datos"][i][celda], T["datos"][i][celda]
        if u is None or v is None:
            continue
        u, v = u / U["esc"], v / V["esc"]
        vel = math.hypot(u, v)
        direc = (math.degrees(math.atan2(-u, -v)) + 360) % 360
        filas.append({"valida": vt, "vel": vel, "dir": direc, "t": None if t is None else t / T["esc"]})
    return filas


def puntuar_monan(fc, o, dia):
    """Misma pauta que evaluacion_ia.puntuar, con el pronóstico numérico de MONAN hora a hora."""
    if len(fc) < 4 or not o or not o.get("suficiente"):
        return None
    fp = sum(f["vel"] for f in fc) / len(fc)
    comp, det = {}, {"int_pron": round(fp, 1), "int_obs": o["vprom"], "error_int": round(o["vprom"] - fp, 1)}
    p_int = 100 if (fp <= 5 and o["vprom"] <= 5) else tabla_intensidad(o["vprom"] - fp, fp)
    comp["intensidad"] = p_int
    if fp <= 5 and o["vprom"] <= 5:
        p_dir = 100
    elif o["vprom"] <= 5:
        p_dir = p_int
    else:
        desv = []
        d0 = datetime.fromisoformat(dia)
        for h, dobs, vobs in zip(o["horas"], o["dirs"], o["vel"]):
            if dobs is None or vobs <= 5:
                continue
            hh, mm = map(int, h.split(":"))
            t_obs = d0.replace(hour=hh, minute=mm, tzinfo=TZ)
            cerca = min(fc, key=lambda f: abs((f["valida"] - t_obs).total_seconds()))
            if abs((cerca["valida"] - t_obs).total_seconds()) <= 5400:
                desv.append(ang(dobs, cerca["dir"]))
        p_dir = tabla_direccion(max(desv)) if desv else None
        if desv:
            det["desvio_dir"] = round(max(desv))
    if p_dir is not None:
        comp["direccion"] = p_dir
    temps = [f["t"] for f in fc if f["t"] is not None and f["valida"].astimezone(TZ).date().isoformat() == dia]
    if temps and o.get("tmax") is not None:
        tx = max(temps)
        det["tmax_pron"] = round(tx, 1)
        det["error_tmax"] = round(o["tmax"] - tx, 1)
        comp["temperatura"] = tabla_temperatura(o["tmax"] - tx)
    w = sum(PESOS[k] for k in comp)
    det["puntaje"] = round(sum(PESOS[k] * comp[k] for k in comp) / w, 1)
    det["componentes"] = comp
    det["conforme"] = det["puntaje"] > 75
    return det


def main():
    runs = corridas()
    if not runs:
        print("Verificación MONAN: sin corridas (falta el clon de trombas_marinas)"); return
    ult = runs[-1][2]
    clat, clon = centros(ult)
    borde = np.array(ult["borde"])
    ests = []
    for e in estaciones_actuales():
        dist = (clat - e["lat"]) ** 2 + ((clon - e["lon"]) * math.cos(math.radians(e["lat"]))) ** 2
        dist[borde == 1] = np.inf
        c = int(np.argmin(dist))
        dk = km(e["lat"], e["lon"], clat[c], clon[c])
        if dk <= DIST_MAX_KM:
            ests.append({**e, "celda": c, "dist_km": round(dk, 1)})
    obs = obs_por_estacion({e["codigo"] for e in ests})
    hoy = datetime.now(TZ).date()
    dias = []
    for e in ests:
        for dia, muestras in sorted(obs.get(e["codigo"], {}).items()):
            if datetime.fromisoformat(dia).date() >= hoy:
                continue
            inicio = datetime.fromisoformat(dia).replace(hour=8, tzinfo=TZ)
            cand = [r for r in runs if r[0] <= inicio - timedelta(hours=ANTICIPACION_H)]
            if not cand:
                continue
            ini, sha, d = cand[-1]
            if len(d["celdas"]) != len(ult["celdas"]):          # cambió la malla: se busca la celda en esa corrida
                la, lo = centros(d)
                dd = (la - e["lat"]) ** 2 + ((lo - e["lon"]) * math.cos(math.radians(e["lat"]))) ** 2
                celda = int(np.argmin(dd))
            else:
                celda = e["celda"]
            fc = pronostico_celda(d, celda, dia)
            o = resumen_obs(muestras)
            p = puntuar_monan(fc, o, dia)
            dias.append({"fecha": dia, "est": e["codigo"], "corrida": ini.strftime("%Y-%m-%dT%HZ"),
                         "anticipacion_h": int((inicio - ini).total_seconds() // 3600), "obs": o, "pauta": p})

    def agregar(fs):
        ps = [f["pauta"] for f in fs if f.get("pauta")]
        if not ps:
            return {"n": 0}
        m = lambda k, ab=False: (lambda v: round(sum(v) / len(v), 1) if v else None)([abs(p[k]) if ab else p[k] for p in ps if p.get(k) is not None])
        return {"n": len(ps), "puntaje": m("puntaje"), "conformes": round(100 * sum(1 for p in ps if p["conforme"]) / len(ps)),
                "sesgo_int": m("error_int"), "error_int_abs": m("error_int", True), "error_tmax_abs": m("error_tmax", True)}

    resumen = {e["codigo"]: agregar([f for f in dias if f["est"] == e["codigo"]]) for e in ests}
    res = {"generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "fuente": ult.get("fuente"), "corrida_actual": ult.get("corrida"),
           "corridas": [r[0].strftime("%Y-%m-%dT%HZ") for r in runs],
           "estaciones": [{k: e[k] for k in ("codigo", "nombre", "lat", "lon", "dist_km")} for e in ests],
           "resumen": resumen, "total": agregar(dias),
           "dias": sorted(dias, key=lambda f: (f["fecha"], f["est"]), reverse=True),
           "notas": ["Pauta O.P.I. N° 1104 (dirección, intensidad y temperatura máxima, 08:00–20:00) aplicada al viento y la temperatura de MONAN en la celda más cercana a la estación.",
                     f"Se evalúa la corrida iniciada a lo menos {ANTICIPACION_H} h antes de las 08:00 del día (pronóstico de 24 a 48 h).",
                     "MONAN entrega datos cada 3 h; la temperatura máxima pronosticada es el mayor valor entre 09:00 y 18:00 y puede quedar bajo el máximo real."]}
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Verificación MONAN: {len(runs)} corridas · {len(ests)} estaciones en la malla · {sum(1 for f in dias if f['pauta'])} días evaluados")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print("Verificación MONAN: error", e)
