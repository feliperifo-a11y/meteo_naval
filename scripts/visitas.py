#!/usr/bin/env python3
"""Visitas al sitio por día, semana y mes, desde la API de GoatCounter.

GoatCounter ya cuenta las visitas de meteoia.cl (ver build/estadisticas.js). El contador público
(/counter/TOTAL.json) solo entrega el total histórico y no acepta rangos, así que la serie se pide
a la API autenticada:

    GET /api/v0/stats/total?start=...&end=...   ->  {"stats": [{"day", "daily", "weekly", "monthly",
                                                     "hourly": [...]}], "total", "total_utc", ...}

Las semanas y los meses se suman aquí a partir de "daily", en lugar de usar los campos "weekly" y
"monthly" de la respuesta, para no depender de dónde empieza la semana en GoatCounter.

Necesita el secreto GOATCOUNTER_TOKEN (una clave de API con permiso de solo lectura de estadísticas).
Sin el secreto el script no escribe nada y avisa, igual que DESARROLLO_CLAVE.

Uso: python3 scripts/visitas.py [--forzar]
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "data" / "visitas.json"

SITIO = os.environ.get("GOATCOUNTER_SITIO", "meteoia")
TOKEN = os.environ.get("GOATCOUNTER_TOKEN", "").strip()
DESDE = date(2025, 1, 1)      # antes de que el sitio existiera: el rango sobra y no estorba
VENTANA = 180                 # días por consulta, para no pedir rangos enormes de una vez
DIAS_SERIE, SEMANAS_SERIE, MESES_SERIE = 90, 26, 24
REFRESCO_MIN = 60             # no vuelve a consultar si el archivo es más nuevo que esto


def pedir(desde: date, hasta: date) -> dict:
    q = urllib.parse.urlencode({
        "start": f"{desde.isoformat()}T00:00:00Z",
        "end": f"{hasta.isoformat()}T23:00:00Z",
    })
    url = f"https://{SITIO}.goatcounter.com/api/v0/stats/total?{q}"
    pet = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": "meteoia/visitas",
    })
    with urllib.request.urlopen(pet, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def serie_diaria() -> tuple[dict[str, int], int]:
    """Devuelve {'YYYY-MM-DD': visitas} y el total del rango consultado."""
    dias: dict[str, int] = {}
    total = 0
    hoy = datetime.now(timezone.utc).date()
    ini = DESDE
    while ini <= hoy:
        fin = min(ini + timedelta(days=VENTANA - 1), hoy)
        r = pedir(ini, fin)
        if not isinstance(r, dict) or "stats" not in r:
            raise ValueError(f"respuesta inesperada de GoatCounter: {str(r)[:200]}")
        for s in r.get("stats") or []:
            d = str(s.get("day") or "")[:10]
            if d:
                dias[d] = dias.get(d, 0) + int(s.get("daily") or 0)
        total += int(r.get("total") or 0)
        ini = fin + timedelta(days=1)
    return dias, total


def agrupar(dias: dict[str, int], clave) -> list[dict]:
    """Suma los días dentro de cada grupo (semana o mes) que define clave()."""
    g: dict[str, int] = defaultdict(int)
    for d, n in dias.items():
        g[clave(date.fromisoformat(d))] += n
    return [{"d": k, "n": g[k]} for k in sorted(g)]


def lunes(d: date) -> str:
    return (d - timedelta(days=d.weekday())).isoformat()


def mes(d: date) -> str:
    return d.replace(day=1).isoformat()


def reciente() -> bool:
    try:
        prev = json.loads(SALIDA.read_text(encoding="utf-8"))
        t = datetime.fromisoformat(str(prev["actualizado"]).replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - t) < timedelta(minutes=REFRESCO_MIN)
    except Exception:
        return False


def main() -> int:
    forzar = "--forzar" in sys.argv or os.environ.get("FORZAR")
    if not TOKEN:
        print("Visitas: falta el secreto GOATCOUNTER_TOKEN; no se actualiza la serie de visitas")
        return 0
    if not forzar and reciente():
        print(f"Visitas: sin cambios (el archivo tiene menos de {REFRESCO_MIN} min)")
        return 0
    try:
        dias, total = serie_diaria()
    except urllib.error.HTTPError as e:
        cuerpo = e.read().decode("utf-8", "replace")[:200]
        print(f"Visitas: GoatCounter respondió HTTP {e.code} ({cuerpo}); no se actualiza")
        return 0
    except Exception as e:
        print(f"Visitas: no se pudo consultar GoatCounter ({e}); no se actualiza")
        return 0

    orden = sorted(dias)
    res = {
        "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": "GoatCounter · estadísticas de uso anónimas y agregadas, sin cookies ni datos personales",
        "zona": "Las fechas siguen la zona horaria configurada en GoatCounter.",
        "total": total,
        "rango": {"desde": orden[0] if orden else None, "hasta": orden[-1] if orden else None},
        "dias": [{"d": d, "n": dias[d]} for d in orden][-DIAS_SERIE:],
        "semanas": agrupar(dias, lunes)[-SEMANAS_SERIE:],
        "meses": agrupar(dias, mes)[-MESES_SERIE:],
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Visitas: {total} en total · {len(res['dias'])} días, {len(res['semanas'])} semanas, "
          f"{len(res['meses'])} meses")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
