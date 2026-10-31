#!/usr/bin/env python3
"""Archivo de borradores de la IA y comparación con el boletín del especialista.

1. Archivo: cada borrador diario (data/borradores.json, lo sube el equipo local) se agrega una sola vez a
   data/evaluacion/borradores.jsonl. Al partir recupera también los borradores anteriores del historial de git.
2. Comparación: para cada borrador y bahía busca el boletín que el especialista emitió ese mismo día
   (data/evaluacion/pares.jsonl) y compara los períodos con la misma fecha y tipo (día 08–20 h / noche 20–08 h):
     · similitud del texto (0–100 %; cuánto hubo que reescribir),
     · situación sinóptica (coincide o no),
     · nubosidad (primer término: despejado, parcial, nublado, cubierto),
     · viento: dirección (algún sector a 45° o menos) e intensidad máxima (kt, con y sin «ocasional»),
     · mar: altura máxima en área oceánica (m) y estado en bahía (escala de la Armada),
     · temperaturas máxima y mínima (°C, períodos de día).
   Resultado: data/evaluacion/borradores_comparacion.json (resumen por bahía, por fecha y detalle por período).
Nunca hace fallar el flujo de trabajo.
"""
import difflib
import json
import re
import subprocess
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

R = Path(__file__).resolve().parent.parent
DATA = R / "data"
EVAL = DATA / "evaluacion"
ARCHIVO = EVAL / "borradores.jsonl"
SALIDA = EVAL / "borradores_comparacion.json"
RUMBOS = {"N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5, "E": 90, "ESE": 112.5, "SE": 135, "SSE": 157.5, "S": 180, "SSW": 202.5,
          "SW": 225, "WSW": 247.5, "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5}
ESTADOS = ["llana", "rizada", "marejadilla", "marejada", "gruesa", "muy gruesa"]
NUBES = ["despejado", "parcial", "nublado", "cubierto"]


def leer_jsonl(p):
    out = []
    if p.exists():
        for l in p.read_text(encoding="utf-8").splitlines():
            try:
                out.append(json.loads(l))
            except Exception:
                pass
    return out


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return " ".join("".join(c for c in s if unicodedata.category(c) != "Mn").split())


# ------------------------------------------------------------ 1. archivo de borradores

def versiones_git():
    try:
        out = subprocess.run(["git", "log", "--format=%H", "--", "data/borradores.json"], cwd=R, capture_output=True, text=True).stdout.split()
    except Exception:
        return []
    res = []
    for sha in reversed(out):
        try:
            res.append(json.loads(subprocess.run(["git", "show", f"{sha}:data/borradores.json"], cwd=R, capture_output=True, text=True).stdout))
        except Exception:
            pass
    return res


def archivar():
    previos = leer_jsonl(ARCHIVO)
    ya = {b.get("fecha_base") for b in previos}
    candidatos = ([] if previos else versiones_git())
    try:
        candidatos.append(json.loads((DATA / "borradores.json").read_text(encoding="utf-8")))
    except Exception:
        pass
    por_fecha = {}
    for b in candidatos:   # si hubo más de una versión en el día, queda la última generada
        f = b.get("fecha_base")
        if f and b.get("bahias") and f not in ya and (f not in por_fecha or b.get("generado", "") > por_fecha[f].get("generado", "")):
            por_fecha[f] = b
    nuevos = [por_fecha[f] for f in sorted(por_fecha)]
    if nuevos:
        EVAL.mkdir(parents=True, exist_ok=True)
        with ARCHIVO.open("a", encoding="utf-8") as fh:
            for b in nuevos:
                b = dict(b, archivado=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"))
                fh.write(json.dumps(b, ensure_ascii=False, separators=(",", ":")) + "\n")
    return previos + nuevos, len(nuevos)


# ------------------------------------------------------------ 2. lectura de los textos

def tramo(texto, ini, fin=None):
    t = texto or ""
    i = t.lower().find(ini)
    if i < 0:
        return ""
    t = t[i + len(ini):]
    if fin:
        j = t.lower().find(fin)
        if j >= 0:
            t = t[:j]
    return t


def viento(texto):
    t = tramo(texto, "viento ", ", mar ")
    if not t:
        return None
    dirs = [RUMBOS[x] for x in re.findall(r"(?<![A-Za-z])(NNE|NE|ENE|ESE|SE|SSE|SSW|SW|WSW|WNW|NW|NNW|N|E|S|W)(?![A-Za-z])", t)]
    base, extra = [], []
    for m in re.finditer(r"(ocasional(?:es)?\s+(?:(?:AM|PM|al\s+\w+|en\s+\w+)\s+)?|rachas?\s+(?:de\s+)?)?(\d+)(?:/(\d+))?\s*kt", t, re.I):
        nums = [int(m.group(2))] + ([int(m.group(3))] if m.group(3) else [])
        (extra if m.group(1) else base).extend(nums)
    calma = "calma" in t.lower()
    if not base and not extra and not calma:
        return None
    vb = max(base) if base else 0
    return {"dirs": dirs, "vmax": vb, "vmax_total": max([vb] + extra), "calma": calma}


def mar(texto):
    t = tramo(texto, ", mar ")
    if not t:
        return None
    alturas = [float(x) for par in re.findall(r"\(\s*(\d+(?:[.,]\d+)?)\s*/\s*(\d+(?:[.,]\d+)?)\s*m\s*\)", t) for x in [p.replace(",", ".") for p in par]]
    alturas += [float(x.replace(",", ".")) for x in re.findall(r"\(\s*(\d+(?:[.,]\d+)?)\s*m\s*\)", t)]
    bn = norm(t)
    seg = bn[bn.find("area oceanica") + 13:] if "area oceanica" in bn else bn
    seg = seg[:seg.find("en bahia")] if "en bahia" in seg else seg
    est = [i for i, e in enumerate(ESTADOS) if re.search(r"(?<![a-z])" + e + r"(?![a-z])", seg)]
    if "muy gruesa" in seg:
        est = [i for i in est if ESTADOS[i] != "gruesa"] + [5]
    return {"hmax": max(alturas) if alturas else None, "bahia": max(est) if est else None}


def nubosidad(texto, situacion):
    t = norm(texto)
    s = norm(situacion)
    if s and t.startswith(s):          # en los períodos de noche el texto repite la situación al comienzo
        t = t[len(s):]
    pos = [(t.find(n), n) for n in NUBES if t.find(n) >= 0]
    return min(pos)[1] if pos else None


def comparar_periodo(b, o):
    r = {"similitud": round(100 * difflib.SequenceMatcher(None, norm(b.get("texto")), norm(o.get("texto"))).ratio())}
    sb, so = norm(b.get("situacion")), norm(o.get("situacion"))
    if sb and so:
        r["situacion_coincide"] = sb == so or difflib.SequenceMatcher(None, sb, so).ratio() >= .8
    nb, no = nubosidad(b.get("texto"), b.get("situacion")), nubosidad(o.get("texto"), o.get("situacion"))
    if nb and no:
        r["nubosidad_coincide"] = nb == no
    vb, vo = viento(b.get("texto")), viento(o.get("texto"))
    if vb and vo:
        if vb["dirs"] and vo["dirs"]:
            r["direccion_coincide"] = min(abs((x - y + 180) % 360 - 180) for x in vb["dirs"] for y in vo["dirs"]) <= 45
        r["dif_vmax"] = vb["vmax"] - vo["vmax"]
        r["dif_vmax_total"] = vb["vmax_total"] - vo["vmax_total"]
    mb, mo = mar(b.get("texto")), mar(o.get("texto"))
    if mb and mo:
        if mb["hmax"] is not None and mo["hmax"] is not None:
            r["dif_hmax"] = round(mb["hmax"] - mo["hmax"], 1)
        if mb["bahia"] is not None and mo["bahia"] is not None:
            r["bahia_coincide"] = mb["bahia"] == mo["bahia"]
    for k in ("tmax", "tmin"):
        if b.get(k) is not None and o.get(k) is not None:
            r["dif_" + k] = round(float(b[k]) - float(o[k]), 1)
    return r


def agregar(filas):
    def media(k, absoluto=True):
        v = [abs(f[k]) if absoluto else f[k] for f in filas if f.get(k) is not None]
        return round(sum(v) / len(v), 1) if v else None
    def pct(k):
        v = [f[k] for f in filas if f.get(k) is not None]
        return round(100 * sum(v) / len(v)) if v else None
    return {"n": len(filas), "similitud": media("similitud"), "situacion": pct("situacion_coincide"), "nubosidad": pct("nubosidad_coincide"),
            "direccion": pct("direccion_coincide"), "dif_vmax_abs": media("dif_vmax"), "sesgo_vmax": media("dif_vmax", False),
            "dif_vmax_total_abs": media("dif_vmax_total"), "dif_hmax_abs": media("dif_hmax"), "sesgo_hmax": media("dif_hmax", False),
            "bahia": pct("bahia_coincide"), "dif_tmax_abs": media("dif_tmax"), "dif_tmin_abs": media("dif_tmin")}


def main():
    borradores, nuevos = archivar()
    oficiales = {}
    for p in leer_jsonl(EVAL / "pares.jsonl"):     # boletín del especialista emitido cada día (el último del día)
        clave = (p.get("codigo"), (p.get("emitido") or "")[:10])
        if clave not in oficiales or p["emitido"] > oficiales[clave]["emitido"]:
            oficiales[clave] = p
    detalle = []
    for bor in borradores:
        f0 = bor.get("fecha_base")
        for b in bor.get("bahias", []):
            o = oficiales.get((b.get("codigo"), f0))
            if not o:
                continue
            per_o = {(q.get("fecha"), q.get("tipo")): q for q in o.get("boletin", [])}
            for pb in b.get("periodos", []):
                po = per_o.get((pb.get("fecha"), pb.get("tipo")))
                if not po:
                    continue
                detalle.append({"fecha_base": f0, "bahia": b["codigo"], "nombre": b.get("nombre"), "fecha": pb["fecha"], "tipo": pb["tipo"],
                                "emitido": o["emitido"], "borrador": {k: pb.get(k) for k in ("situacion", "texto", "tmin", "tmax")},
                                "oficial": {k: po.get(k) for k in ("situacion", "texto", "tmin", "tmax")}, **comparar_periodo(pb, po)})
    bahias = sorted({d["bahia"] for d in detalle})
    fechas = sorted({d["fecha_base"] for d in detalle})
    res = {"version": 1, "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "borradores_archivados": len(borradores), "periodos_comparados": len(detalle),
           "total": agregar(detalle),
           "por_bahia": {k: dict(agregar([d for d in detalle if d["bahia"] == k]), nombre=next(d["nombre"] for d in detalle if d["bahia"] == k)) for k in bahias},
           "por_fecha": [dict(agregar([d for d in detalle if d["fecha_base"] == f]), fecha_base=f) for f in fechas],
           "detalle": sorted(detalle, key=lambda d: (d["fecha_base"], d["bahia"], d["fecha"], d["tipo"]), reverse=True)}
    SALIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    t = res["total"]
    print(f"Borradores: {nuevos} nuevos archivados ({len(borradores)} en total) · {len(detalle)} períodos comparados con el especialista"
          + (f" · similitud {t['similitud']} %, dirección {t['direccion']} %, |Δ viento| {t['dif_vmax_abs']} kt, |Δ mar| {t['dif_hmax_abs']} m" if detalle else ""))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Borradores: error", repr(e))
    sys.exit(0)
