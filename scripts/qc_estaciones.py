#!/usr/bin/env python3
"""Control de calidad de las estaciones con aprendizaje automático (Isolation Forest) → data/estaciones_qc.json

Toma los últimos 30 días de observaciones de todas las estaciones (historial de git de data/estaciones.json) y, para
cada lectura, calcula rasgos relativos a la propia estación y a sus vecinas:
  · desvío respecto de lo habitual en esa estación a esa hora (temperatura, presión, humedad, viento),
  · cambio brusco respecto de la lectura anterior (por hora),
  · diferencia con la mediana de las estaciones vecinas (≤ 150 km) a la misma hora (temperatura, presión),
  · horas con el mismo valor repetido (posible sensor pegado).
Un Isolation Forest (scikit-learn) aprende qué combinaciones son normales y marca las lecturas raras; se informa como
«sospechosa» solo si además algún rasgo se aparta claramente (|z| ≥ 3) o se viola un límite físico. Es apoyo: una lectura
rara puede ser un fenómeno real (frente, rafagosidad) y debe revisarla el meteorólogo.
Se recalcula como máximo una vez por hora. Nunca hace fallar el flujo de trabajo.
"""
import bisect
import json
import math
import os
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

R = Path(__file__).resolve().parent.parent
SALIDA = R / "data" / "estaciones_qc.json"
DIAS, RECIENTE_H, VECINAS_KM = 30, 72, 150
LIMITES = {"temp": (-25, 45), "pres": (930, 1060), "hum": (0, 100), "vel": (0, 120)}
NOMBRES = {"temp_hab": "temperatura fuera de lo habitual para la hora", "pres_hab": "presión fuera de lo habitual",
           "hum_hab": "humedad fuera de lo habitual", "vel_hab": "viento fuera de lo habitual para la hora",
           "temp_salto": "salto brusco de temperatura", "pres_salto": "salto brusco de presión", "vel_salto": "salto brusco de viento",
           "temp_vec": "temperatura distinta de las estaciones vecinas", "pres_vec": "presión distinta de las estaciones vecinas",
           "temp_rep": "temperatura repetida por horas (posible sensor pegado)", "pres_rep": "presión repetida por horas (posible sensor pegado)"}


def git(*a, entrada=None):
    return subprocess.run(["git", *a], cwd=R, input=entrada, capture_output=True, check=False).stdout


def num(x):
    try:
        v = float(str(x).replace(",", "."))
        return v if math.isfinite(v) else None
    except Exception:
        return None


def historial():
    desde = (datetime.now(timezone.utc) - timedelta(days=DIAS)).strftime("%Y-%m-%d")
    shas = [l.split()[0] for l in git("log", "--format=%H", f"--since={desde}", "--", "data/estaciones.json").decode().splitlines() if l.strip()]
    obs, meta = {}, {}
    for k in range(0, len(shas), 400):
        lote = shas[k:k + 400]
        out = git("cat-file", "--batch", entrada="".join(f"{s}:data/estaciones.json\n" for s in lote).encode())
        i = 0
        for _ in lote:
            j = out.index(b"\n", i); cab = out[i:j].split(); i = j + 1
            if len(cab) < 3 or cab[1] == b"missing":
                continue
            n = int(cab[2]); blob = out[i:i + n]; i += n + 1
            try:
                d = json.loads(blob)
            except Exception:
                continue
            for x in d.get("datos", []):
                c, f = x.get("codigo"), x.get("fecha")
                if not c or not f or (c, f) in obs:
                    continue
                try:
                    t = datetime.fromisoformat(f[:19])
                except Exception:
                    continue
                u = (x.get("_unidad_viento") or "").lower()
                v = num(x.get("velocidadDelViento"))
                if v is not None and ("m/s" in u or u == "ms"):
                    v *= 1.94384
                elif v is not None and "km" in u:
                    v *= 0.539957
                obs[(c, f)] = {"c": c, "t": t, "temp": num(x.get("temperatura")), "pres": num(x.get("presion")), "hum": num(x.get("humedad")),
                               "vel": v, "dir": num(x.get("viento"))}
                if x.get("latitud") is not None:
                    meta[c] = {"nombre": x.get("nombre") or c, "lat": x.get("latitud"), "lon": x.get("longitud")}
    return list(obs.values()), meta


def robusto(v):
    v = np.asarray([x for x in v if x is not None and math.isfinite(x)], float)
    if len(v) < 10:
        return None, None
    med = float(np.median(v)); mad = float(np.median(np.abs(v - med))) * 1.4826
    return med, max(mad, 1e-6)


def dist_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def main():
    previo = {}
    try:
        previo = json.loads(SALIDA.read_text(encoding="utf-8"))
    except Exception:
        pass
    ahora = datetime.now(timezone.utc)
    if previo.get("generado") and not os.environ.get("FORZAR"):
        if ahora - datetime.fromisoformat(previo["generado"].replace("Z", "+00:00")) < timedelta(minutes=55):
            print("Control de calidad de estaciones: al día"); return
    from sklearn.ensemble import IsolationForest

    filas, meta = historial()
    if len(filas) < 500:
        print("Control de calidad de estaciones: pocas observaciones", len(filas)); return
    por_est = defaultdict(list)
    for o in filas:
        por_est[o["c"]].append(o)
    for v in por_est.values():
        v.sort(key=lambda o: o["t"])

    # Rasgos por estación: desvío respecto de la hora habitual, saltos y valores repetidos
    for c, v in por_est.items():
        for var in ("temp", "pres", "hum", "vel"):
            por_hora = defaultdict(list)
            for o in v:
                if o[var] is not None:
                    por_hora[o["t"].hour].append(o[var])
            ref = {}
            for h in range(24):
                ref[h] = robusto(por_hora[(h - 1) % 24] + por_hora[h] + por_hora[(h + 1) % 24])
            for o in v:
                m, s = ref[o["t"].hour]
                o[var + "_hab"] = None if (o[var] is None or m is None) else (o[var] - m) / s
        for var in ("temp", "pres", "vel"):
            tasas = []
            for a, b in zip(v, v[1:]):
                dh = (b["t"] - a["t"]).total_seconds() / 3600
                b["_d" + var] = (b[var] - a[var]) / max(dh, 1 / 6) if (a[var] is not None and b[var] is not None and 0 < dh <= 3) else None
                if b["_d" + var] is not None:
                    tasas.append(b["_d" + var])
            m, s = robusto(tasas)
            for o in v:
                d = o.get("_d" + var)
                o[var + "_salto"] = None if (d is None or m is None) else (d - m) / s
        for var in ("temp", "pres"):
            ini = 0
            for k, o in enumerate(v):
                if k == 0 or o[var] is None or v[k - 1][var] != o[var]:
                    ini = k
                horas = (o["t"] - v[ini]["t"]).total_seconds() / 3600 if o[var] is not None else 0
                o[var + "_rep"] = max(0.0, horas - 3) / 1.5          # z ≈ 3 con 7,5 h sin cambio

    # Vecinas: diferencia con la mediana de las estaciones a ≤ 150 km en ±40 min
    vecinas = {c: [d for d in meta if d != c and d in por_est and dist_km(meta[c], meta[d]) <= VECINAS_KM] for c in meta}
    indice = {c: {var: ([o["t"].timestamp() for o in v if o[var] is not None], [o[var] for o in v if o[var] is not None]) for var in ("temp", "pres")}
              for c, v in por_est.items()}
    for c, v in por_est.items():
        vs = vecinas.get(c, [])
        for var in ("temp", "pres"):
            difs = []
            for o in v:
                vals = []
                ts = o["t"].timestamp()
                for d in vs:
                    tt, vv = indice[d][var]
                    k = bisect.bisect_left(tt, ts)
                    mejor = min((abs(tt[q] - ts), vv[q]) for q in (k - 1, k) if 0 <= q < len(tt)) if tt else None
                    if mejor and mejor[0] <= 2400:
                        vals.append(mejor[1])
                o["_v" + var] = (o[var] - float(np.median(vals))) if (vals and o[var] is not None) else None
                if o["_v" + var] is not None:
                    difs.append(o["_v" + var])
            m, s = robusto(difs)
            for o in v:
                d = o.get("_v" + var)
                o[var + "_vec"] = None if (d is None or m is None) else (d - m) / s

    claves = list(NOMBRES)
    X = np.array([[0.0 if o.get(k) is None else float(np.clip(o[k], -12, 12)) for k in claves] for v in por_est.values() for o in v])
    todas = [o for v in por_est.values() for o in v]
    modelo = IsolationForest(n_estimators=200, contamination=0.01, random_state=0).fit(X)
    puntaje = -modelo.score_samples(X)               # mayor = más raro
    pred = modelo.predict(X)

    corte = (ahora.astimezone(timezone(timedelta(hours=-3))).replace(tzinfo=None) - timedelta(hours=RECIENTE_H))
    sospechosas = []
    for o, p, sc, fila in zip(todas, pred, puntaje, X):
        if o["t"] < corte:
            continue
        motivos = []
        for var, (lo, hi) in LIMITES.items():
            if o[var] is not None and not lo <= o[var] <= hi:
                motivos.append(f"{var} fuera de rango físico ({o[var]:g})")
        if p == -1:
            orden = sorted(((abs(z), k) for z, k in zip(fila, claves)), reverse=True)
            motivos += [NOMBRES[k] for z, k in orden if z >= 3][:3]
        if motivos and (p == -1 or any("rango físico" in m for m in motivos)):
            sospechosas.append({"codigo": o["c"], "nombre": meta.get(o["c"], {}).get("nombre", o["c"]), "fecha": o["t"].strftime("%Y-%m-%dT%H:%M"),
                                "temp": o["temp"], "pres": o["pres"], "hum": o["hum"], "vel": None if o["vel"] is None else round(o["vel"], 1),
                                "dir": o["dir"], "puntaje": round(float(sc), 3), "motivos": motivos})
    sospechosas.sort(key=lambda s: s["fecha"], reverse=True)
    estaciones = []
    for c, v in por_est.items():
        rec = [o for o in v if o["t"] >= corte]
        s = [x for x in sospechosas if x["codigo"] == c]
        frac = len(s) / len(rec) if rec else 0
        estaciones.append({"codigo": c, **meta.get(c, {"nombre": c}), "lecturas_72h": len(rec), "sospechosas_72h": len(s),
                           "ultima": rec[-1]["t"].strftime("%Y-%m-%dT%H:%M") if rec else None,
                           "estado": "sin datos" if not rec else "revisar" if (frac >= 0.05 or len(s) >= 6) else "atención" if s else "ok",
                           "motivo_principal": max((m for x in s for m in x["motivos"]), key=lambda m: sum(m in x["motivos"] for x in s), default=None)})
    orden = {"revisar": 0, "atención": 1, "sin datos": 2, "ok": 3}
    estaciones.sort(key=lambda e: (orden[e["estado"]], -e["sospechosas_72h"], e["nombre"]))
    res = {"version": 1, "generado": ahora.strftime("%Y-%m-%dT%H:%M:%SZ"), "ventana_dias": DIAS, "reciente_horas": RECIENTE_H,
           "observaciones": len(todas), "estaciones_n": len(por_est),
           "modelo": "Isolation Forest (scikit-learn), 200 árboles, contaminación 1 %, 11 rasgos relativos a la estación y a sus vecinas",
           "estaciones": estaciones, "sospechosas": sospechosas[:300]}
    SALIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Control de calidad de estaciones: {len(todas)} lecturas en {DIAS} días · {len(sospechosas)} sospechosas en {RECIENTE_H} h · "
          f"{sum(e['estado'] == 'revisar' for e in estaciones)} estaciones para revisar")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Control de calidad de estaciones: error", repr(e))
    sys.exit(0)
