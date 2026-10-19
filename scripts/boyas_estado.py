#!/usr/bin/env python3
"""Estado declarado de cada boya en el visor oficial de boyas (OPERATIVA / NO OPERATIVA) → data/boyas_estado.json.
El navegador no puede leer ese archivo directamente (el servidor no lo permite desde otros sitios).
Nunca hace fallar el flujo de trabajo."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

URL = "https://shoabucket.s3.amazonaws.com/assets/js/boyas_estaciones.json"
SALIDA = Path(__file__).resolve().parent.parent / "data" / "boyas_estado.json"


def main():
    try:
        r = requests.get(URL, timeout=30, headers={"User-Agent": "dashboard-meteo-publico/1.0"})
        r.raise_for_status()
        datos = r.json()
    except Exception as e:
        print("Estado de boyas no disponible:", e); return
    est = [{"estacion": d.get("estacion"), "id": str(d.get("idboya")), "estado": (d.get("estado") or "").upper().strip(),
            "lat": d.get("lat"), "lon": d.get("long")} for d in datos]
    SALIDA.write_text(json.dumps({"actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": URL, "boyas": est},
                                 ensure_ascii=False, indent=1), encoding="utf-8")
    print("Estado de boyas:", ", ".join(f"{e['estacion']} {e['estado']}" for e in est))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Error:", e)
    sys.exit(0)
