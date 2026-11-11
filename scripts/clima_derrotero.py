#!/usr/bin/env python3
"""Clima regional del Derrotero de la Costa de Chile (Pub. SHOA 3001 a 3006, capítulo F) como contexto para la IA.

Fuente única: data/clima_derrotero.json (la misma que usa la ruta de navegación en el navegador).
  · contexto(lat, lon, meses): zona, síntesis y observaciones de los meses dados; lo usa entradas_borrador.py.
  · Ejecutado como programa escribe data/clima_derrotero_wrf.json: el contexto de cada bahía con meteograma WRF
    (posiciones de build/ia_comun.js) para el mes en curso y los próximos 7 días; lo lee mac/pronostico_ia.sh.
"""
import json
import math
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

R = Path(__file__).resolve().parent.parent
DATOS = json.loads((R / "data" / "clima_derrotero.json").read_text(encoding="utf-8"))
ZONAS, EJE = DATOS["zonas"], DATOS["eje_estrecho_occidental"]
TZ = ZoneInfo("America/Santiago")


def _dist_eje(la, lo):
    c, m = math.cos(math.radians(la)), float("inf")
    for a, b in zip(EJE, EJE[1:]):
        ax, ay, bx, by = (a[1] - lo) * c * 60, (a[0] - la) * 60, (b[1] - lo) * c * 60, (b[0] - la) * 60
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy)))
        m = min(m, math.hypot(ax + t * dx, ay + t * dy))
    return m


def zona(la, lo):
    """Misma lógica que climaZona() de build/clima_derrotero.js."""
    if la <= -60:
        return "ant"
    if la <= -56.1:
        return "drake"
    if lo < -77.5:
        return None
    if la <= -54.0 or (la < -52.6 and lo > -68.45):
        return "fueg"
    if la < -51.9 and lo > -71.3:
        return "estrori"
    if la < -52.3 and _dist_eje(la, lo) < 12:
        return "estrocc"
    if la <= -47.0:
        return "patag"
    if la < -41.75 or (la < -41.3 and lo > -73.9):
        return "chiloe"
    if la < -25.4:
        return "centro"
    return "norte"


def contexto(la, lo, meses):
    z_id = zona(la, lo)
    if not z_id:
        return None
    z = ZONAS[z_id]
    obs = [o["t"] for o in z["meses"] if set(o["m"]) & set(meses) and (o.get("sur") is None or la <= o["sur"])]
    c = {"zona": z["nombre"], "volumen": "Pub. SHOA " + z["vol"], "resumen": z["resumen"], "vientos": z["vientos"],
         "temporales": z["temporales"], "visibilidad": z["visibilidad"], "observaciones_del_mes": obs}
    if z.get("senales"):
        c["senales_de_mal_tiempo"] = z["senales"]
    return c


def posiciones_wrf():
    t = (R / "build" / "ia_comun.js").read_text(encoding="utf-8")
    return {k: (float(a), float(b)) for k, a, b in re.findall(r"\b([A-Za-z][A-Za-z_0-9]*_d\d\d): \[(-?\d+\.?\d*), (-?\d+\.?\d*)\]", t)}


def main():
    hoy = datetime.now(TZ).date()
    meses = sorted({(hoy + timedelta(days=d)).month for d in range(8)})
    bahias = {}
    for cod, (la, lo) in posiciones_wrf().items():
        c = contexto(la, lo, meses)
        if c:
            bahias[cod] = c
    res = {"fuente": DATOS["fuente"], "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "meses": meses, "bahias": bahias}
    (R / "data" / "clima_derrotero_wrf.json").write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Clima del Derrotero: {len(bahias)} bahías WRF, meses {meses}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Clima del Derrotero: error", repr(e))
    sys.exit(0)
