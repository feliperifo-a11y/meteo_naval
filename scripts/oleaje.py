#!/usr/bin/env python3
"""Oleaje para los pronósticos WRF + IA.

Consulta el pronóstico de oleaje del modelo marino de Open-Meteo en la posición de cada bahía
(la misma de IA_POS en build/ia_comun.js) y deja el resultado en data/oleaje.json, que la página
ia.html muestra como una variable más junto a nubosidad y viento.

Por cada día se entrega la altura significativa máxima (Hs) expresada como rango de 1 m y su estado
del mar, más la dirección dominante, el período y el mar de fondo:

    Hs 0,42 m  ->  0,1 a 1,0 m  ·  Rizada a marejadilla   (el mínimo mostrado es 0,1 m, nunca 0,0)
    Hs 1,58 m  ->  1,0 a 2,0 m  ·  Marejadilla a marejada
    Hs 3,58 m  ->  3,0 a 4,0 m  ·  Gruesa

Escala de estado del mar (ESCALA, abajo). Cada extremo del rango se clasifica con la escala: el
inferior como valor que abre el intervalo (3,0 -> gruesa) y el superior como valor que lo cierra
(4,0 -> gruesa, 2,0 -> marejada). Si ambos extremos dan el mismo estado, se muestra uno solo.

- Una sola consulta para todas las bahías. Los modelos de olas se actualizan cada 6 h, así que si
  el archivo publicado tiene menos de HORAS_VIGENCIA no se vuelve a consultar.
- Si la fuente falla, se conserva el último archivo bueno y el script termina sin error.
- El modelo global no resuelve fiordos ni canales angostos: esas bahías quedan "sin cobertura".

Uso:  python scripts/oleaje.py          (FORZAR=1 para consultar aunque el archivo esté vigente)
"""
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "oleaje.json"
POSICIONES = RAIZ / "build" / "ia_comun.js"
URL = "https://marine-api.open-meteo.com/v1/marine"
DIAS = 5
HORAS_VIGENCIA = 3
MINIMO = 0.1   # límite inferior que se muestra cuando el rango parte en 0 m
CABECERAS = {"User-Agent": "dashboard-meteo-publico/1.0 (oleaje WRF + IA)"}

# (desde Hs en m, estado) — límite inferior inclusive. Escala usada en los pronósticos de la Armada.
ESCALA = [
    (0.0, "Rizada"),
    (0.5, "Marejadilla"),
    (1.25, "Marejada"),
    (2.5, "Gruesa"),
    (4.0, "Muy gruesa"),
    (6.0, "Arbolada"),
]
VARIABLES = ["wave_height_max", "wave_direction_dominant", "wave_period_max",
             "swell_wave_height_max", "swell_wave_direction_dominant", "swell_wave_period_max"]
RUMBOS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def estado_desde(v):
    """Estado del mar para un valor que abre un intervalo (límite inferior inclusive)."""
    nombre = ESCALA[0][1]
    for lim, n in ESCALA:
        if v >= lim:
            nombre = n
    return nombre


def estado_hasta(v):
    """Estado del mar para un valor que cierra un intervalo (límite superior inclusive)."""
    nombre = ESCALA[0][1]
    for lim, n in ESCALA:
        if v > lim:
            nombre = n
    return nombre


def rango(hs):
    """1,58 -> ('1,0 a 2,0 m', 'Marejadilla a marejada'); 0,42 -> ('0,1 a 1,0 m', 'Rizada a marejadilla')."""
    lo = max(math.floor(hs), MINIMO)
    hi = math.floor(hs) + 1
    e1, e2 = estado_desde(lo), estado_hasta(hi)
    estado = e1 if e1 == e2 else f"{e1} a {e2.lower()}"
    return f"{lo:.1f} a {hi:.1f} m".replace(".", ","), estado


def rumbo(grados):
    return None if grados is None else RUMBOS[round(grados / 22.5) % 16]


def r1(v):
    return None if v is None else round(v, 1)


def leer_posiciones():
    """Lee IA_POS de build/ia_comun.js: {codigo: (lat, lon)}."""
    txt = POSICIONES.read_text(encoding="utf-8")
    bloque = txt[txt.index("IA_POS"):txt.index("};")]
    return {c: (float(a), float(b)) for c, a, b in re.findall(r"(\w+):\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]", bloque)}


def vigente():
    if os.environ.get("FORZAR") == "1" or not SALIDA.exists():
        return False
    try:
        act = datetime.fromisoformat(json.loads(SALIDA.read_text(encoding="utf-8"))["actualizado"].replace("Z", "+00:00"))
        return datetime.now(timezone.utc) - act < timedelta(hours=HORAS_VIGENCIA)
    except Exception:
        return False


def consultar(pos):
    codigos = list(pos)
    params = {
        "latitude": ",".join(f"{pos[c][0]:.3f}" for c in codigos),
        "longitude": ",".join(f"{pos[c][1]:.3f}" for c in codigos),
        "daily": ",".join(VARIABLES),
        "forecast_days": DIAS,
        "cell_selection": "sea",
        "timezone": "America/Santiago",
    }
    r = requests.get(URL, params=params, headers=CABECERAS, timeout=60)
    r.raise_for_status()
    datos = r.json()
    if isinstance(datos, dict):
        datos = [datos]
    if len(datos) != len(codigos):
        raise ValueError(f"se esperaban {len(codigos)} puntos y llegaron {len(datos)}")
    return dict(zip(codigos, datos))


def armar(c, d):
    dd = d.get("daily") or {}
    hs = dd.get("wave_height_max") or []
    if not any(v is not None for v in hs):
        return {"sin_cobertura": True}
    dias = []
    for i, fecha in enumerate(dd.get("time", [])):
        v = lambda k: (dd.get(k) or [None] * (i + 1))[i]
        h = v("wave_height_max")
        if h is None:
            continue
        txt, est = rango(h)
        dias.append({
            "fecha": fecha,
            "hs": round(h, 2),
            "rango": txt,
            "estado": est,
            "dir": v("wave_direction_dominant"),
            "dir_txt": rumbo(v("wave_direction_dominant")),
            "periodo": r1(v("wave_period_max")),
            "hs_fondo": None if v("swell_wave_height_max") is None else round(v("swell_wave_height_max"), 2),
            "dir_fondo": v("swell_wave_direction_dominant"),
            "dir_fondo_txt": rumbo(v("swell_wave_direction_dominant")),
            "periodo_fondo": r1(v("swell_wave_period_max")),
        })
    return {"celda": [round(d["latitude"], 3), round(d["longitude"], 3)], "dias": dias}


def reetiquetar():
    """Sin consultar la fuente, recalcula rango y estado del archivo vigente (por si cambió la escala o el mínimo)."""
    d = json.loads(SALIDA.read_text(encoding="utf-8"))
    for b in d.get("bahias", {}).values():
        for dia in b.get("dias", []):
            dia["rango"], dia["estado"] = rango(dia["hs"])
    d["escala"] = [{"desde": a, "estado": b} for a, b in ESCALA]
    SALIDA.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    if vigente():
        reetiquetar()
        print(f"oleaje.json tiene menos de {HORAS_VIGENCIA} h: no se consulta (rangos recalculados)")
        return 0
    try:
        pos = leer_posiciones()
        crudo = consultar(pos)
    except Exception as e:
        print(f"Oleaje: no se pudo consultar ({e}); se mantiene el archivo anterior", file=sys.stderr)
        return 0
    bahias = {c: armar(c, d) for c, d in crudo.items()}
    salida = {
        "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": "Open-Meteo Marine Weather API (modelos de olas globales) — open-meteo.com, CC BY 4.0",
        "variable": "Altura significativa máxima diaria (Hs), en rangos de 1 m",
        "escala": [{"desde": a, "estado": b} for a, b in ESCALA],
        "bahias": bahias,
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    con = sum(1 for b in bahias.values() if not b.get("sin_cobertura"))
    print(f"oleaje.json: {con} de {len(bahias)} bahías con datos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
