#!/usr/bin/env python3
"""Copia de respaldo de las restricciones portuarias publicadas en SITPORT (sitport.directemar.cl).
La página las consulta en vivo desde el navegador; este archivo solo se usa si esa consulta falla.
Escribe data/restricciones.json. Nunca hace fallar el flujo de trabajo."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

API = "https://orion.directemar.cl/sitport/back/users/"
SALIDA = Path(__file__).resolve().parent.parent / "data" / "restricciones.json"


def consultar(nombre):
    r = requests.post(API + nombre, timeout=40, headers={"User-Agent": "Mozilla/5.0 (MeteoIA)"})
    r.raise_for_status()
    return r.json().get("recordset") or []


def main():
    try:
        bahias = consultar("consultaBahias")
        restr = consultar("consultaRestricciones")
    except Exception as e:  # noqa: BLE001
        print("SITPORT no disponible:", e)
        return
    datos = {
        "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": "https://sitport.directemar.cl/#/informacion",
        "bahias": [{"IDBahia": b.get("IDBahia"), "NMBahia": b.get("NMBahia"), "valor": b.get("valor")} for b in bahias],
        "restricciones": restr,
    }
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"restricciones.json: {len(restr)} restricciones en {sum(1 for b in bahias if b.get('valor'))} bahías")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print("Error:", e)
    sys.exit(0)
