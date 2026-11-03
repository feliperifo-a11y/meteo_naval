#!/usr/bin/env python3
"""Copia de respaldo de las restricciones portuarias publicadas en SITPORT (sitport.directemar.cl).
La página las consulta en vivo desde el navegador; este archivo solo se usa si esa consulta falla.
El servidor de SITPORT no responde a GitHub Actions (fuera de Chile): en ese caso se usa la consulta que hace el
equipo local en Chile cada 20 minutos y adjunta en data/estaciones.json («sitport»).
Escribe data/restricciones.json. Nunca hace fallar el flujo de trabajo."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

API = "https://orion.directemar.cl/sitport/back/users/"
DATA = Path(__file__).resolve().parent.parent / "data"
SALIDA = DATA / "restricciones.json"


def consultar(nombre):
    r = requests.post(API + nombre, timeout=15, headers={"User-Agent": "Mozilla/5.0 (MeteoIA)"})
    r.raise_for_status()
    return r.json().get("recordset") or []


def del_equipo_local():
    """Consulta de SITPORT adjunta por el equipo local en data/estaciones.json: (bahías, restricciones, fecha)."""
    d = json.loads((DATA / "estaciones.json").read_text(encoding="utf-8")).get("sitport") or {}
    b, r = (d.get("bahias") or {}).get("recordset"), (d.get("restricciones") or {}).get("recordset")
    if not isinstance(b, list) or not isinstance(r, list) or not d.get("consultado"):
        raise RuntimeError("sin consulta de SITPORT del equipo local")
    return b, r, d["consultado"]


def main():
    origen = "directo"
    actualizado = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        bahias = consultar("consultaBahias")
        restr = consultar("consultaRestricciones")
    except Exception as e:  # noqa: BLE001
        print("SITPORT directo no disponible:", e)
        try:
            bahias, restr, actualizado = del_equipo_local()
            origen = "equipo local"
        except Exception as e2:  # noqa: BLE001
            print("Tampoco hay consulta del equipo local:", e2)
            return
    previo = {}
    try:
        previo = json.loads(SALIDA.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        pass
    if previo.get("actualizado", "") > actualizado:
        print("restricciones.json: se mantiene la copia publicada, más reciente", previo.get("actualizado"))
        return
    datos = {
        "actualizado": actualizado,
        "origen": origen,
        "fuente": "https://sitport.directemar.cl/#/informacion",
        "bahias": [{"IDBahia": b.get("IDBahia"), "NMBahia": b.get("NMBahia"), "valor": b.get("valor")} for b in bahias],
        "restricciones": restr,
    }
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"restricciones.json ({origen}, {actualizado}): {len(restr)} restricciones en {sum(1 for b in bahias if b.get('valor'))} bahías")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print("Error:", e)
    sys.exit(0)
