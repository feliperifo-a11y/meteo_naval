#!/usr/bin/env python3
"""Entradas para el borrador de boletín de bahía «estilo especialista» → data/evaluacion/entradas_borrador.json

El equipo local (mac/borrador_boletin.sh, con la suscripción de Claude) lee este archivo cada mañana y redacta un borrador
del pronóstico de bahía que se emite a las 16:00, para que el meteorólogo solo lo corrija. Aquí se prepara, por bahía:
  · objetivo: los períodos que debe tener el boletín de hoy (día de mañana 08–20 h, noche de mañana 20–08 h y día de
    pasado mañana y del día siguiente), igual que el boletín publicado;
  · wrf_ia: el pronóstico WRF + IA vigente (situación sinóptica y días), que es la base del borrador;
  · ww3: el oleaje NOAA GFS-Wave en el punto de mar más cercano, por período;
  · ejemplos: pares archivados de esa bahía (data/evaluacion/pares.jsonl) con lo que entregaron el WRF + IA y el WW3 y lo
    que finalmente escribió el especialista; se eligen los más parecidos a la situación de hoy y los más recientes.
"listo" es verdadero cuando el WRF + IA de las bahías ya corresponde a la corrida 12Z de hoy.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
from archivo_pares import Oleaje, leer  # noqa: E402
from evaluacion_ia import leer_viento  # noqa: E402

R = Path(__file__).resolve().parent.parent
DATA = R / "data"
SALIDA = DATA / "evaluacion" / "entradas_borrador.json"
TZ = ZoneInfo("America/Santiago")
BAHIAS = [  # código del boletín, nombre, código WRF + IA, posición
    ("iquique", "Iquique", "IQUIQUE_norte_d03", (-20.205, -70.155)),
    ("valparaiso", "Valparaíso", "VALPARAISO_centro_d08", (-33.03, -71.625)),
    ("talcahuano", "Talcahuano", "TALCAHUANO_centro_d09", (-36.715, -73.11)),
    ("puertomontt", "Puerto Montt", "PUERTOMONTT_sur_d12", (-41.48, -72.94)),
    ("puntaarenas", "Punta Arenas", "PUNTAARENAS_sur_d14", (-53.165, -70.9)),
]
MAX_EJEMPLOS = 5


def periodos_objetivo(hoy):
    """Períodos del boletín de las 16:00 de hoy: mañana (día y noche), pasado mañana y el día siguiente (día)."""
    out = []
    for n, tipo in ((1, "dia"), (1, "noche"), (2, "dia"), (3, "dia")):
        f = hoy + timedelta(days=n)
        h0 = 20 if tipo == "noche" else 8
        ini = datetime(f.year, f.month, f.day, h0, tzinfo=TZ)
        out.append({"tipo": tipo, "fecha": f.isoformat(), "horario": "20:00–08:00 h" if tipo == "noche" else "08:00–20:00 h",
                    "_ini": ini.astimezone(timezone.utc), "_fin": (ini + timedelta(hours=12)).astimezone(timezone.utc)})
    return out


def rasgos(wrf_dias, ww3_per, fecha):
    """Rasgos para comparar situaciones: viento del WRF + IA del día y altura de ola del período diurno."""
    d = next((x for x in (wrf_dias or []) if x.get("fecha") == fecha), None)
    v = leer_viento(d.get("viento")) if d else None
    hs = (ww3_per or {}).get("hs") or [None, None]
    return {"vmax": v["max"] if v else None, "dirs": v["dirs"] if v else [], "hs": hs[1]}


def distancia(a, b):
    d = 0.0
    if a["vmax"] is not None and b["vmax"] is not None:
        d += abs(a["vmax"] - b["vmax"]) / 5
    else:
        d += 1
    if a["dirs"] and b["dirs"]:
        dif = min(abs((x - y + 180) % 360 - 180) for x in a["dirs"] for y in b["dirs"])
        d += dif / 45
    else:
        d += 1
    if a["hs"] is not None and b["hs"] is not None:
        d += abs(a["hs"] - b["hs"]) / 0.5
    else:
        d += 1
    return d


def ejemplos(pares, codigo, hoy_rasgos, hoy):
    # Solo boletines anteriores a hoy: el de hoy es justamente el que el borrador debe anticipar.
    propios = [p for p in pares if p.get("codigo") == codigo and p["entradas"].get("wrf_ia") and p.get("emitido", "") < hoy.isoformat()]
    if not propios:
        return []
    for p in propios:   # rasgos del primer día del boletín de ese ejemplo
        dia = next((x for x in p["boletin"] if x.get("tipo") == "dia"), None)
        p["_r"] = rasgos(p["entradas"]["wrf_ia"].get("dias"), (dia or {}).get("ww3"), (dia or {}).get("fecha")) if dia else {"vmax": None, "dirs": [], "hs": None}
    recientes = sorted(propios, key=lambda p: p["emitido"], reverse=True)[:2]
    parecidos = sorted(propios, key=lambda p: distancia(p["_r"], hoy_rasgos))
    elegidos = []
    for p in recientes + parecidos:
        if p not in elegidos:
            elegidos.append(p)
        if len(elegidos) >= MAX_EJEMPLOS:
            break
    out = []
    for p in sorted(elegidos, key=lambda p: p["emitido"]):
        fechas = {x.get("fecha") for x in p["boletin"]}
        w = p["entradas"]["wrf_ia"]
        out.append({"emitido": p["emitido"],
                    "wrf_ia": {"situacion_sinoptica": w.get("situacion_sinoptica"), "dias": [d for d in w.get("dias", []) if d.get("fecha") in fechas]},
                    "boletin_especialista": [{k: x.get(k) for k in ("tipo", "fecha", "situacion", "texto", "tmin", "tmax", "ww3")} for x in p["boletin"]]})
    return out


def main():
    ahora = datetime.now(TZ)
    hoy = ahora.date()
    wrf = leer(DATA / "wrf_ia.json", {})
    por_codigo = {b.get("codigo"): b for b in wrf.get("bahias", [])}
    pares = []
    p = DATA / "evaluacion" / "pares.jsonl"
    if p.exists():
        for l in p.read_text(encoding="utf-8").splitlines():
            try:
                pares.append(json.loads(l))
            except Exception:
                pass
    ola = Oleaje()
    obj = periodos_objetivo(hoy)
    init_hoy = datetime.now(timezone.utc).strftime("%Y-%m-%dT12")
    bahias, listos = [], 0
    for codigo, nombre, cod_wrf, pos in BAHIAS:
        b = por_codigo.get(cod_wrf) or {}
        pr = b.get("pronostico") or {}
        if pr.get("inicializacion_utc") == init_hoy:
            listos += 1
        celda = ola.celda(*pos)
        periodos = [{"tipo": x["tipo"], "fecha": x["fecha"], "horario": x["horario"], "ww3": ola.periodo(celda, x["_ini"], x["_fin"])} for x in obj]
        dia1 = periodos[0]
        hoy_r = rasgos(pr.get("dias"), dia1.get("ww3"), dia1["fecha"])
        bahias.append({"codigo": codigo, "nombre": nombre,
                       "objetivo": periodos,
                       "wrf_ia": {"codigo": cod_wrf, "inicializacion": pr.get("inicializacion_utc"), "situacion_sinoptica": pr.get("situacion_sinoptica"),
                                  "dias": pr.get("dias", [])},
                       "ww3_punto": None if celda is None else [round(celda[3], 2), round(celda[4], 2)],
                       "ejemplos": ejemplos(pares, codigo, hoy_r, hoy)})
    res = {"version": 1, "fecha_base": hoy.isoformat(), "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "listo": listos >= 3, "wrf_inicializacion_esperada": init_hoy, "bahias_listas": listos,
           "ww3_corrida": ola.idx.get("corrida"), "ww3_fuente": ola.idx.get("fuente"),
           "pares_disponibles": {c: sum(1 for x in pares if x.get("codigo") == c) for c, *_ in BAHIAS},
           "bahias": bahias}
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Entradas del borrador: {hoy} · listo={res['listo']} ({listos}/5 con WRF 12Z de hoy) · ejemplos {[len(b['ejemplos']) for b in bahias]}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Entradas del borrador: error", repr(e))
    sys.exit(0)
