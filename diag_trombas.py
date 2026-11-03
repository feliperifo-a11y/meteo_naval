#!/usr/bin/env python3
"""Diagnóstico único: ingredientes de trombas en el área del aviso del 3-nov-2026 (Biobío a Los Ríos) vs. un día tranquilo."""
import json, sys, time
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
sys.path.insert(0, "scripts")
import trombas as tr

# Área del aviso: franja marítima Biobío–Los Ríos (aprox. 36,0°–40,3° S), hasta 75,5° W
SUR, NORTE, OESTE = -40.3, -36.0, -75.5
CASOS = {"aviso_3nov": (datetime(2026, 11, 3, 6), [0, 3, 6, 9, 12, 15]),     # 06–21 UTC = 03–18 h Chile
         "control_30oct": (datetime(2026, 10, 30, 6), [0, 3, 6, 9, 12, 15])}
VARS = ["mucape", "mlcape", "mlcape3", "mlcin", "ebsmu", "bwd06", "shr01", "srh500", "lr01", "lr03", "lr75",
        "mllcl", "dT", "dZ", "w850", "t850", "t500", "stp", "sherbe", "vgp", "nst"]
out = {}
for nombre, (c, fhrs) in CASOS.items():
    out[nombre] = []
    for f in fhrs:
        try:
            campos, lat, lon = tr.leer_grib(tr.bajar(c, f))
            q, la, lo = tr.procesar(campos, lat, lon)
            t500 = campos[("t", 100, 500)].ravel()[(campos[("lsm", 1, 0)] < 0.5).ravel()] - 273.15
            q["t500"] = t500
            q["t850"] = q["t850"] - 273.15
            q["ebsmu"] = q["ebsmu"] * tr.MS_A_KT; q["bwd06"] = q["bwd06"] * tr.MS_A_KT; q["shr01"] = q["shr01"] * tr.MS_A_KT
            m = (la >= SUR) & (la <= NORTE) & (lo >= OESTE)
            fila = {"valida": (c + timedelta(hours=f)).strftime("%Y-%m-%dT%HZ"), "puntos": int(m.sum())}
            for v in VARS:
                x = np.asarray(q[v], float)[m]; x = x[np.isfinite(x)]
                fila[v] = [round(float(np.percentile(x, p)), 2) for p in (10, 50, 90)] + [round(float(x.min()), 2), round(float(x.max()), 2)] if x.size else None
            fila["n_stp_-0.1"] = int((q["stp"][m] <= -0.1).sum()); fila["n_hslc"] = int(q["hslc"][m].sum()); fila["n_nst"] = int((q["nst"][m] > 1).sum())
            fila["n_sherbe1"] = int((q["sherbe"][m] >= 1).sum()); fila["n_ebsmu18"] = int((q["ebsmu"][m] > 18 * tr.MS_A_KT).sum())
            out[nombre].append(fila); print(nombre, f, "ok", fila["puntos"])
        except Exception as e:
            out[nombre].append({"fhr": f, "error": f"{type(e).__name__}: {e}"}); print(nombre, f, "error", e)
        time.sleep(1)
Path("diag").mkdir(exist_ok=True)
Path("diag/resultado.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
