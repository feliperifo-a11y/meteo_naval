#!/usr/bin/env python3
"""Ajuste estadístico del viento WRF + IA por bahía (prueba, página Desarrollo) → data/wrf_ia_ajuste.json

Aprende de data/evaluacion/pares.jsonl, donde cada boletín profesional de bahías quedó archivado junto al
pronóstico WRF + IA que existía a esa hora, y calcula dos correcciones por bahía:

  1. Sesgo del viento sostenido: diferencia media entre el máximo sostenido del WRF + IA y el del especialista
     para el mismo día (sin rachas ni valores "ocasional"). Se encoge hacia cero con n / (n + K) para que una
     bahía con pocos días no reciba una corrección grande, y solo se aplica si queda en 2 kt o más.
  2. Rachas: los meteogramas WRF no traen racha. De los días en que el especialista pronosticó rachas se obtiene
     el exceso racha − sostenido (mediana, kt) y el sostenido desde el cual el especialista suele ponerlas
     (≥ 60 % de los días). Con eso se estima la racha del día a partir del sostenido ya corregido. El exceso
     aditivo resultó mejor que un factor multiplicativo en la verificación (error medio de racha 4,7 kt contra 8,8 kt).

La referencia es el especialista, no lo observado: el ajuste acerca el WRF + IA a cómo redacta el Centro.
El texto original del WRF + IA (data/wrf_ia.json) no se modifica; este archivo va aparte y es referencial.
La verificación separa los días más recientes (25 %) y los evalúa con la calibración de los días anteriores.
"""
import json
import re
import statistics as st
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PARES = RAIZ / "data" / "evaluacion" / "pares.jsonl"
WRF = RAIZ / "data" / "wrf_ia.json"
SALIDA = RAIZ / "data" / "wrf_ia_ajuste.json"

K = 10            # encogimiento del sesgo: n / (n + K)
N_MIN = 10        # días mínimos por bahía para corregir
SESGO_MIN = 2     # kt; correcciones menores no se aplican
SESGO_MAX = 10    # kt; tope de la corrección
FREC_RACHAS = 0.6 # el especialista pone rachas en al menos este porcentaje de días

RE_RACHA = re.compile(r"rachas?\s*(?:de\s*)?(\d+)(?:\s*/\s*(\d+))?\s*(?:kt)?", re.I)
RE_OCAS = re.compile(r"ocasional(?:mente)?\s*(?:de\s*)?\d+(?:\s*/\s*\d+)?\s*(?:kt)?", re.I)
RE_PAR = re.compile(r"(\d+)\s*/\s*(\d+)")
RE_UNO = re.compile(r"(?<![\d/])(\d+)\s*kt", re.I)


def sostenido(txt):
    """Máximo viento sostenido (kt) del texto, sin rachas ni valores «ocasional»."""
    if not txt:
        return None
    t = RE_OCAS.sub(" ", RE_RACHA.sub(" ", txt))
    n = [int(x) for a, b in RE_PAR.findall(t) for x in (a, b)]
    n += [int(x) for x in RE_UNO.findall(RE_PAR.sub(" ", t))]
    n = [x for x in n if x <= 120]
    if n:
        return max(n)
    return 0 if re.search(r"\bcalma\b", t, re.I) else None


def racha(txt):
    g = [int(b or a) for a, b in RE_RACHA.findall(txt or "")]
    return max(g) if g else None


def red5(x):
    return int(5 * round(x / 5))


def leer_pares():
    """Un registro por (bahía WRF, fecha): el del boletín emitido más tarde y su WRF + IA de esa hora."""
    mejor = {}
    if not PARES.exists():
        return []
    for linea in PARES.open(encoding="utf-8"):
        try:
            d = json.loads(linea)
        except ValueError:
            continue
        w = ((d.get("entradas") or {}).get("wrf_ia")) or {}
        cod = w.get("codigo")
        if not cod:
            continue
        ia = {x.get("fecha"): x for x in w.get("dias") or []}
        seg = defaultdict(list)
        for b in d.get("boletin") or []:
            seg[b.get("fecha")].append(b)
        for f, bs in seg.items():
            if f not in ia:
                continue
            dia = [b for b in bs if b.get("tipo") == "dia"] or bs   # 08–20 h, como la pauta O.P.I. N° 1104
            e = [v for v in (sostenido(b.get("texto")) for b in dia) if v is not None]
            i = sostenido(ia[f].get("viento"))
            if not e or i is None:
                continue
            g = [v for v in (racha(b.get("texto")) for b in dia) if v]
            k = (cod, f)
            reg = {"fecha": f, "emitido": d.get("emitido") or "", "esp": max(e), "esp_racha": max(g) if g else None,
                   "ia": i, "nombre": d.get("nombre")}
            if k not in mejor or reg["emitido"] > mejor[k]["emitido"]:
                mejor[k] = reg
    return [(cod, r) for (cod, _), r in mejor.items()]


def calibrar(regs):
    n = len(regs)
    sesgo = st.mean(r["ia"] - r["esp"] for r in regs)
    aplicado = sesgo * n / (n + K)
    aplicado = max(-SESGO_MAX, min(SESGO_MAX, round(aplicado))) if n >= N_MIN and abs(aplicado) >= SESGO_MIN else 0
    con = [r for r in regs if r["esp_racha"] and r["esp"] > 0]
    exceso = red5(st.median(r["esp_racha"] - r["esp"] for r in con)) if len(con) >= 5 else None
    umbral = None
    if exceso and exceso >= 10:
        for u in (5, 10, 15, 20, 25, 30):
            sub = [r for r in regs if r["esp"] >= u]
            if len(sub) >= 5 and sum(1 for r in sub if r["esp_racha"]) / len(sub) >= FREC_RACHAS:
                umbral = u
                break
    return {"n": n, "sesgo_kt": round(sesgo, 1), "correccion_kt": -aplicado,
            "rachas": {"frecuencia": round(len(con) / n, 2) if n else 0, "exceso_kt": exceso, "desde_kt": umbral}}


def ajustar_texto(txt, corr):
    """Aplica la corrección a cada valor sostenido del texto, proporcional a su intensidad (el máximo recibe la
    corrección completa y los vientos débiles casi nada); ≥ 10 kt se redondea a múltiplos de 5, como el boletín."""
    smax = sostenido(txt)
    if not txt or not corr or not smax:
        return txt

    def f(x):
        return max(0, round(int(x) + corr * int(x) / smax))

    def par(m):
        lo, hi = f(m.group(1)), f(m.group(2))
        if hi >= 10:
            hi = red5(hi)
            lo = red5(lo) if lo >= 5 else lo
            if lo >= hi:
                lo = hi - 5
        elif lo >= hi:
            lo = max(0, hi - 2)
        return f"{lo}/{hi}"
    return RE_PAR.sub(par, txt)


def estimar(cal, ia_txt):
    s = sostenido(ia_txt)
    if s is None:
        return None, None, None
    s_aj = sostenido(ajustar_texto(ia_txt, cal["correccion_kt"]))
    r = cal["rachas"]
    rach = None
    if r["exceso_kt"] and r["desde_kt"] is not None and s_aj >= r["desde_kt"]:
        rach = red5(s_aj + r["exceso_kt"])
    return s, s_aj, rach


def verificar(por_bahia):
    """Últimos 25 % de días de cada bahía con la calibración de los días anteriores."""
    a = b = rh = rt = fa = 0
    n = 0
    err_r = []
    for cod, regs in por_bahia.items():
        regs = sorted(regs, key=lambda r: r["fecha"])
        corte = int(len(regs) * 0.75)
        if corte < N_MIN or len(regs) - corte < 2:
            continue
        cal = calibrar(regs[:corte])
        for r in regs[corte:]:
            n += 1
            a += abs(r["ia"] - r["esp"])
            b += abs(max(0, r["ia"] + cal["correccion_kt"]) - r["esp"])
            _, s_aj, rach = estimar(cal, f"{r['ia']} kt")
            rt += bool(r["esp_racha"])
            rh += bool(r["esp_racha"]) and rach is not None
            fa += (not r["esp_racha"]) and rach is not None
            if r["esp_racha"] and rach is not None:
                err_r.append(abs(rach - r["esp_racha"]))
    if not n:
        return None
    return {"dias": n, "error_medio_original_kt": round(a / n, 1), "error_medio_ajustado_kt": round(b / n, 1),
            "rachas_del_especialista": rt, "rachas_estimadas_en_esos_dias": rh,
            "rachas_estimadas_sin_rachas_del_especialista": fa,
            "error_medio_racha_kt": round(st.mean(err_r), 1) if err_r else None}


def main():
    por_bahia = defaultdict(list)
    for cod, r in leer_pares():
        por_bahia[cod].append(r)
    cal = {cod: calibrar(regs) for cod, regs in por_bahia.items() if regs}
    try:
        wrf = json.loads(WRF.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        wrf = {}
    bahias = {}
    for b in wrf.get("bahias") or []:
        c = cal.get(b.get("codigo"))
        if not c:
            continue
        dias = {}
        for d in ((b.get("pronostico") or {}).get("dias")) or []:
            s, s_aj, rach = estimar(c, d.get("viento"))
            if s is None:
                continue
            dias[d["fecha"]] = {"viento_original": d.get("viento"), "viento_ajustado": ajustar_texto(d.get("viento"), c["correccion_kt"]),
                                "max_original_kt": s, "max_ajustado_kt": s_aj, "rachas_kt": rach}
        bahias[b["codigo"]] = {"nombre": b.get("nombre"), **c, "dias": dias}
    salida = {
        "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "metodo": "Corrección de sesgo del viento sostenido y estimación de rachas por bahía, aprendidas del boletín profesional "
                  "(data/evaluacion/pares.jsonl). Referencial y experimental; el texto WRF + IA original no se modifica.",
        "parametros": {"K": K, "n_min": N_MIN, "sesgo_min_kt": SESGO_MIN, "sesgo_max_kt": SESGO_MAX, "frecuencia_rachas": FREC_RACHAS},
        "verificacion": verificar(por_bahia),
        "bahias": bahias,
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    v = salida["verificacion"] or {}
    print(f"wrf_ia_ajuste: {len(bahias)} bahías; verificación {v}")


if __name__ == "__main__":
    main()
