#!/usr/bin/env python3
"""Evaluación sistemática de los pronósticos WRF + IA (página Desarrollo) → data/evaluacion/resumen.json

Compara, con una pauta fija, el pronóstico WRF + IA y el pronóstico profesional publicado contra lo observado en
las estaciones de las capitanías de puerto de Iquique, Valparaíso y Talcahuano. Así se puede saber si un cambio de
prompt mejora o empeora el pronóstico.

Fuentes
  · WRF + IA: historial de git de data/wrf_ia.json (cada versión que subió el equipo local o el flujo de trabajo).
    La versión de prompt se identifica con la huella del bloque de instrucciones de mac/pronostico_ia.sh vigente en
    ese momento (o de scripts/wrf_ia.py si el pronóstico lo generó la API).
  · Pronóstico profesional: boletín de bahías publicado (data/pronosticos.json). Como el sitio solo conserva el último,
    este script lo archiva en data/evaluacion/profesional.jsonl, que el flujo de trabajo guarda en el repositorio.
  · Observaciones: historial de git de data/estaciones.json (el equipo local lo sube cada ~20 min).

Pauta v2: O.P.I. N° 1104 de la Gobernación Marítima de Valparaíso (10 abr 2026), la misma que usa el Centro para
verificar sus pronósticos, aplicada a ambas fuentes en el período 08:00–20:00 hora local:
  · Observaciones de los horarios sinópticos 12, 15, 18, 21 y 00 UTC (la muestra de la estación más cercana, ±30 min).
  · Dirección (0,30), tabla N° 3: se compara cada observación con el sector pronosticado (arco que abarcan
    las direcciones pronosticadas) y se toma el mayor desvío; notas 1 y 2 para calma o viento de 5 kt o menos.
  · Intensidad (0,30), tabla N° 4: promedio de lo pronosticado (con rachas, promediado con ellas) contra el promedio
    observado; columna 0–20 kt o 21–34 kt según lo pronosticado.
  · Temperatura máxima (0,05), tabla N° 6.
  · Nubosidad (0,05), visibilidad (0,10) y estado del mar (0,20) no tienen observación en la plataforma: los coeficientes
    se renormalizan sobre 0,65. Un acierto de 75 % o menos equivale a «no conformidad».
  · Se compara el boletín profesional emitido a las 16:00 del día anterior con la versión WRF + IA disponible a las
    18:00 del día anterior (misma información, aproximadamente).
  · Aparte, sin entrar en el puntaje: chequeo de formato del texto WRF + IA (rangos, estructura, nubosidad válida).
"""
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

R = Path(__file__).resolve().parent.parent
DATA = R / "data"
EVAL = DATA / "evaluacion"
ARCHIVO_PROF = EVAL / "profesional.jsonl"
SALIDA = EVAL / "resumen.json"
TZ = ZoneInfo("America/Santiago")
PAUTA = 2   # 2: O.P.I. N° 1104 (abr 2026)
DESDE = date(2026, 10, 8)    # primera versión de data/wrf_ia.json en el repositorio
BAHIAS = [  # id, nombre, código WRF + IA, código del boletín profesional, código de la estación
    {"id": "IQQ", "nombre": "Iquique", "wrf": "IQUIQUE_norte_d03", "prof": "iquique", "est": "IQUIQUE", "est_nombre": "CP Iquique"},
    {"id": "VAL", "nombre": "Valparaíso", "wrf": "VALPARAISO_centro_d08", "prof": "valparaiso", "est": "VALPARAISO", "est_nombre": "CP Valparaíso"},
    {"id": "TAL", "nombre": "Talcahuano", "wrf": "TALCAHUANO_centro_d09", "prof": "talcahuano", "est": "TALCAHUANO", "est_nombre": "CP Talcahuano"},
]
PESOS = {"direccion": 0.30, "intensidad": 0.30, "temperatura": 0.05}   # O.P.I. N° 1104, III (sin nubosidad, visibilidad ni mar)
RUMBOS = {"N": 0, "NNE": 22.5, "NE": 45, "ENE": 67.5, "E": 90, "ESE": 112.5, "SE": 135, "SSE": 157.5, "S": 180,
          "SSW": 202.5, "SW": 225, "WSW": 247.5, "W": 270, "WNW": 292.5, "NW": 315, "NNW": 337.5}


def leer(p, defecto):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return defecto


def git(*args, entrada=None):
    return subprocess.run(["git", *args], cwd=R, input=entrada, capture_output=True, check=False).stdout


def historial(ruta):
    """[(sha, fecha UTC)] de los commits que modificaron un archivo, del más antiguo al más nuevo."""
    out = git("log", "--format=%H %ct", f"--since={DESDE.isoformat()}", "--", ruta).decode().split("\n")
    filas = [l.split() for l in out if l.strip()]
    return [(s, datetime.fromtimestamp(int(t), timezone.utc)) for s, t in reversed(filas)]


def blobs(shas, ruta):
    """Contenido de un archivo en varios commits (git cat-file --batch)."""
    if not shas:
        return {}
    out = git("cat-file", "--batch", entrada="".join(f"{s}:{ruta}\n" for s in shas).encode())
    res, i = {}, 0
    for s in shas:
        j = out.index(b"\n", i)
        cab = out[i:j].split()
        i = j + 1
        if len(cab) < 3 or cab[1] == b"missing":
            continue
        tam = int(cab[2])
        res[s] = out[i:i + tam]
        i += tam + 1
    return res


# ------------------------------------------------------------ archivo del boletín profesional

def archivar_profesional():
    """Agrega a profesional.jsonl los boletines de las bahías evaluadas que aún no estén archivados."""
    pron = leer(DATA / "pronosticos.json", {})
    codigos = {b["prof"] for b in BAHIAS}
    ya = set()
    if ARCHIVO_PROF.exists():
        for l in ARCHIVO_PROF.read_text(encoding="utf-8").splitlines():
            try:
                d = json.loads(l); ya.add((d["codigo"], d["emitido"]))
            except Exception:
                pass
    nuevos = []
    for it in pron.get("items", []):
        if it.get("codigo") in codigos and it.get("emitido") and (it["codigo"], it["emitido"]) not in ya:
            nuevos.append({"codigo": it["codigo"], "emitido": it["emitido"], "archivado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
                           "periodos": [{k: p.get(k) for k in ("tipo", "fecha", "horario", "viento", "tmin", "tmax", "nubosidad", "texto")} for p in it.get("periodos", [])]})
    if nuevos:
        EVAL.mkdir(parents=True, exist_ok=True)
        with ARCHIVO_PROF.open("a", encoding="utf-8") as f:
            for n in nuevos:
                f.write(json.dumps(n, ensure_ascii=False, separators=(",", ":")) + "\n")
    return len(nuevos)


def boletines():
    out = {}
    if ARCHIVO_PROF.exists():
        for l in ARCHIVO_PROF.read_text(encoding="utf-8").splitlines():
            try:
                d = json.loads(l)
                d["_emitido"] = datetime.fromisoformat(d["emitido"]).replace(tzinfo=TZ)
                out.setdefault(d["codigo"], []).append(d)
            except Exception:
                pass
    for v in out.values():
        v.sort(key=lambda d: d["_emitido"])
    return out


# ------------------------------------------------------------ lectura de textos de viento

def leer_viento(txt):
    """Rango de intensidad (sin rachas), direcciones y si menciona calma o viento variable."""
    t = txt or ""
    rachas = [int(x) for x in re.findall(r"racha[s]?\s+(?:de\s+)?(\d+)", t, re.I)]
    t2 = re.sub(r"racha[s]?\s+(?:de\s+)?\d+\s*(?:kt)?", " ", t, flags=re.I)
    nums = []
    for a, b in re.findall(r"(\d+)\s*/\s*(\d+)\s*kt", t2):
        nums += [int(a), int(b)]
    t3 = re.sub(r"\d+\s*/\s*\d+\s*kt", " ", t2)
    nums += [int(x) for x in re.findall(r"(\d+)\s*kt", t3)]
    solo = list(nums)
    calma = bool(re.search(r"\bcalma\b", t, re.I))
    variable = bool(re.search(r"\bvariable\b", t, re.I))
    dirs = [RUMBOS[d] for d in re.findall(r"(?<![A-Za-z])(NNE|ENE|ESE|SSE|SSW|WSW|WNW|NNW|NE|SE|SW|NW|N|E|S|W)(?![A-Za-z])", t)]
    if calma:
        nums.append(0)
    if not nums:
        return None
    return {"min": min(nums), "max": max(nums), "nums": solo, "dirs": sorted(set(dirs)), "calma": calma, "variable": variable,
            "rachas": max(rachas) if rachas else None}


def formato_wrf(p):
    """Chequeo de formato del pronóstico WRF + IA (no entra en el puntaje)."""
    if not p:
        return None
    dias = p.get("dias") or []
    con_rango = sum(1 for d in dias if re.search(r"\d+\s*/\s*\d+\s*kt", d.get("viento") or "") or re.search(r"\bcalma\b", d.get("viento") or "", re.I))
    nub_ok = sum(1 for d in dias if d.get("nubosidad") in ("Cubierto", "Nublado", "Parcial", "Despejado"))
    temps = sum(1 for d in dias if isinstance(d.get("temp_max"), (int, float)) and isinstance(d.get("temp_min"), (int, float)))
    n = len(dias) or 1
    return {"sinoptica": bool((p.get("situacion_sinoptica") or "").strip()), "viento_con_rango": round(con_rango / n, 2),
            "nubosidad_valida": round(nub_ok / n, 2), "temperaturas": round(temps / n, 2), "dias": len(dias)}


# ------------------------------------------------------------ observaciones

def num(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except Exception:
        return None


def observaciones():
    """{estación: {día: [(datetime local, kt, dir, temp)]}} desde el historial de data/estaciones.json."""
    hist = historial("data/estaciones.json")
    datos = blobs([s for s, _ in hist], "data/estaciones.json")
    codigos = {b["est"] for b in BAHIAS}
    vistos, out = set(), {}
    for s, _ in hist:
        try:
            d = json.loads(datos.get(s, b"{}"))
        except Exception:
            continue
        for x in d.get("datos", []):
            c = x.get("codigo")
            if c not in codigos or (c, x.get("fecha")) in vistos:
                continue
            vistos.add((c, x.get("fecha")))
            try:
                t = datetime.fromisoformat(x["fecha"][:19])
            except Exception:
                continue
            u = (x.get("_unidad_viento") or "").lower()
            v = num(x.get("velocidadDelViento"))
            if v is not None and ("m/s" in u or "ms" == u):
                v *= 1.94384
            elif v is not None and "km" in u:
                v *= 0.539957
            out.setdefault(c, {}).setdefault(t.date().isoformat(), []).append((t, v, num(x.get("viento")), num(x.get("temperatura"))))
    return out


def resumen_obs(muestras):
    """Observaciones del período de pronóstico 08:00–20:00 (O.P.I. N° 1104, III): horarios sinópticos 12, 15, 18, 21 y 00 UTC
    (la muestra más cercana a cada uno, a 30 min o menos) y temperatura máxima registrada en el período."""
    if not muestras:
        return None
    per = [m for m in muestras if 8 <= m[0].hour < 20]
    sinop = []
    if per:
        d0 = per[0][0].date()
        for hu in (12, 15, 18, 21, 24):
            t_utc = datetime(d0.year, d0.month, d0.day, tzinfo=timezone.utc) + timedelta(hours=hu)
            cerca = [(abs((m[0].replace(tzinfo=TZ) - t_utc).total_seconds()), m) for m in muestras if m[1] is not None]
            cerca = [c for c in cerca if c[0] <= 1800]
            if cerca:
                sinop.append(min(cerca, key=lambda c: c[0])[1])
    temps = [m[3] for m in per if m[3] is not None]
    if len(sinop) < 4:
        return {"suficiente": False, "n_sinopticas": len(sinop)}
    vel = [m[1] for m in sinop]
    return {"suficiente": True, "n_sinopticas": len(sinop), "horas": [m[0].strftime("%H:%M") for m in sinop],
            "vel": [round(v, 1) for v in vel], "dirs": [None if m[2] is None else round(m[2]) for m in sinop],
            "vprom": round(sum(vel) / len(vel), 1), "vmax": round(max(vel), 1),
            "tmax": round(max(temps), 1) if len(temps) >= 12 else None}


# ------------------------------------------------------------ pauta: O.P.I. N° 1104 (Gob. Marítima de Valparaíso, 10 abr 2026)

def tabla_intensidad(dif, fc_prom):
    """Tabla N° 4: columna 0–20 kt o 21–34 kt según la intensidad pronosticada."""
    d = abs(dif)
    cortes = (4, 6, 8, 10) if fc_prom <= 20 else (10, 15, 20, 25)
    for c, pct in zip(cortes, (100, 75, 50, 25)):
        if d <= c:
            return pct
    return 0


def tabla_direccion(desvio):
    """Tabla N° 3: diferencia angular entre lo observado y lo pronosticado."""
    for c, pct in ((22.5, 100), (45, 75), (67.5, 50), (90, 25)):
        if desvio <= c:
            return pct
    return 0


def tabla_temperatura(err):
    """Tabla N° 6."""
    e = abs(err)
    for c, pct in ((1.0, 100), (2.0, 75), (3.0, 50), (4.0, 25)):
        if e <= c + 1e-9:
            return pct
    return 0


def sector(dirs):
    """Sector pronosticado: arco mínimo que contiene las direcciones pronosticadas. En el ejemplo de la O.P.I. (S/SE rolando
    al SW, 135° a 225°; observado de 90° a 270°) el desvío es de 45° en cada extremo y el acierto, 75 %. Devuelve (inicio, ancho)."""
    if not dirs:
        return None
    ds = sorted(set(d % 360 for d in dirs))
    if len(ds) == 1:
        ini, ancho = ds[0], 0.0
    else:
        huecos = [((ds[(k + 1) % len(ds)] - ds[k]) % 360, k) for k in range(len(ds))]
        g, k = max(huecos)
        ini, ancho = ds[(k + 1) % len(ds)], 360 - g
    return (ini % 360, ancho)


def fuera_de_sector(d, sec):
    ini, ancho = sec
    rel = (d - ini) % 360
    if rel <= ancho:
        return 0.0
    return min(rel - ancho, 360 - rel)


def intensidad_pronosticada(v):
    """Promedio de las intensidades pronosticadas (valores distintos, sin calma); con rachas, promedio con las rachas."""
    vals = sorted(set(v["nums"]))
    if not vals:
        return 0.0
    prom = sum(vals) / len(vals)
    if v["rachas"]:
        prom = (prom + v["rachas"]) / 2
    return prom


def puntuar(fc, obs):
    """Porcentaje de acierto según la O.P.I. N° 1104 con los parámetros observables en las estaciones de capitanía de
    puerto: dirección (0,30), intensidad (0,30) y temperatura máxima (0,05). Nubosidad (0,05), visibilidad (0,10) y estado
    del mar (0,20) no tienen observación en la plataforma; los coeficientes se renormalizan sobre 0,65."""
    v = leer_viento(fc.get("viento"))
    comp, det = {}, {"viento_leido": None if v is None else {k: v[k] for k in ("min", "max", "dirs", "calma", "rachas")}}
    if v is not None:
        fp = intensidad_pronosticada(v)
        dif = obs["vprom"] - fp
        det.update({"int_pron": round(fp, 1), "int_obs": obs["vprom"], "error_int": round(dif, 1)})
        p_int = 100 if (fp <= 5 and obs["vprom"] <= 5) else tabla_intensidad(dif, fp)
        comp["intensidad"] = p_int
        # Dirección: no se promedia; se compara cada observación con el sector pronosticado y se toma el mayor desvío.
        if fp <= 5 and obs["vprom"] <= 5:
            p_dir, desvio = 100, None                                  # Nota 1
        elif obs["vprom"] <= 5:
            p_dir, desvio = p_int, None                                # Nota 2
        else:
            sec = sector(v["dirs"])
            # Las observaciones de 5 kt o menos se tratan como calma (criterio de las notas 1 y 2) y no cuentan para la dirección.
            ds = [d for d, x in zip(obs["dirs"], obs["vel"]) if d is not None and x > 5]
            if sec is None or not ds:
                p_dir, desvio = None, None
            else:
                desvio = max(fuera_de_sector(d, sec) for d in ds)
                p_dir = tabla_direccion(desvio)
                det["sector"] = [round(sec[0]), round((sec[0] + sec[1]) % 360)]
        if p_dir is not None:
            comp["direccion"] = p_dir
            det["desvio_dir"] = None if desvio is None else round(desvio)
    if fc.get("tmax") is not None and obs.get("tmax") is not None:
        e = obs["tmax"] - float(fc["tmax"])
        det["error_tmax"] = round(e, 1)
        comp["temperatura"] = tabla_temperatura(e)
    if not comp:
        return None
    w = sum(PESOS[k] for k in comp)
    det["puntaje"] = round(sum(PESOS[k] * comp[k] for k in comp) / w, 1)
    det["componentes"] = comp
    det["conforme"] = det["puntaje"] > 75
    return det


# ------------------------------------------------------------ pronósticos por día

def huella_prompt(sha, cache):
    """Versión de prompt vigente en un commit: huella del bloque INSTR (y ESQUEMA) de mac/pronostico_ia.sh."""
    if sha in cache:
        return cache[sha]
    txt = git("show", f"{sha}:mac/pronostico_ia.sh").decode("utf-8", "ignore")
    m = re.search(r"INSTR='(.*?)'\n", txt, re.S)
    e = re.search(r"ESQUEMA='(.*?)'\n", txt, re.S)
    h = hashlib.sha1(((m.group(1) if m else "") + (e.group(1) if e else "")).encode()).hexdigest()[:8] if m else None
    cache[sha] = h
    return h


def versiones_wrf():
    """[(fecha UTC del commit, sha, {código: bahía})] del historial de data/wrf_ia.json."""
    hist = historial("data/wrf_ia.json")
    datos = blobs([s for s, _ in hist], "data/wrf_ia.json")
    out = []
    for s, t in hist:
        try:
            d = json.loads(datos[s])
        except Exception:
            continue
        b = {x.get("codigo"): x for x in d.get("bahias", []) if x.get("codigo") in {y["wrf"] for y in BAHIAS}}
        out.append((t, s, b, d.get("modelo_ia")))
    return out


def main():
    nuevos = archivar_profesional()
    previo = leer(SALIDA, {})
    ayer = (datetime.now(TZ) - timedelta(days=1)).date()
    if previo.get("hasta") == ayer.isoformat() and previo.get("pauta") == PAUTA and not nuevos and not os.environ.get("FORZAR"):
        print(f"Evaluación WRF + IA: al día hasta {ayer} (sin cambios)"); return
    obs = observaciones()
    wrf = versiones_wrf()
    prof = boletines()
    huellas, dias_out = {}, []
    versiones = {}
    d = DESDE
    while d <= ayer:
        corte = datetime(d.year, d.month, d.day, tzinfo=TZ) - timedelta(hours=6)      # 18:00 del día anterior
        cand = [w for w in wrf if w[0] <= corte.astimezone(timezone.utc)]
        w = cand[-1] if cand else None
        for b in BAHIAS:
            o = resumen_obs(obs.get(b["est"], {}).get(d.isoformat()))
            fila = {"fecha": d.isoformat(), "bahia": b["id"], "obs": o}
            # WRF + IA
            if w and b["wrf"] in w[2]:
                p = (w[2][b["wrf"]].get("pronostico") or {})
                dia = next((x for x in p.get("dias", []) if x.get("fecha") == d.isoformat()), None)
                if dia:
                    h = huella_prompt(w[1], huellas)
                    ver = f"{'local' if 'suscrip' in (w[3] or '').lower() else 'api'}-{h or 'sin'}"
                    fc = {"viento": dia.get("viento"), "tmax": dia.get("temp_max"), "tmin": dia.get("temp_min")}
                    fila["wrf"] = {"texto": dia.get("viento"), "tmax": dia.get("temp_max"), "tmin": dia.get("temp_min"), "nubosidad": dia.get("nubosidad"),
                                   "inicializacion": p.get("inicializacion_utc"), "commit": w[1][:7], "subido": w[0].strftime("%Y-%m-%dT%H:%MZ"),
                                   "prompt": ver, "formato": formato_wrf(p)}
                    if o and o.get("suficiente"):
                        fila["wrf"]["pauta"] = puntuar(fc, o)
                    versiones.setdefault(ver, {"desde": w[0].strftime("%Y-%m-%d"), "modelo": w[3]})
            # Profesional: boletín emitido antes del inicio del día (el de las 16:00 del día anterior)
            bol = [x for x in prof.get(b["prof"], []) if x["_emitido"] < datetime(d.year, d.month, d.day, tzinfo=TZ)
                   and x["_emitido"] >= datetime(d.year, d.month, d.day, tzinfo=TZ) - timedelta(days=2)]
            if bol:
                x = bol[-1]
                per = [q for q in x["periodos"] if q.get("fecha") == d.isoformat()]
                dia = next((q for q in per if "08:00" in (q.get("horario") or "") or (q.get("tipo") == "dia" and not q.get("horario"))), None) or (per[0] if per else None)
                if dia:
                    fc = {"viento": dia.get("viento"), "tmax": dia.get("tmax"), "tmin": dia.get("tmin")}
                    fila["prof"] = {"texto": dia.get("viento"), "tmax": dia.get("tmax"), "tmin": dia.get("tmin"), "nubosidad": dia.get("nubosidad"), "emitido": x["emitido"]}
                    if o and o.get("suficiente"):
                        fila["prof"]["pauta"] = puntuar(fc, o)
            dias_out.append(fila)
        d += timedelta(days=1)

    def agregar(filas, fuente):
        ps = [f[fuente]["pauta"] for f in filas if f.get(fuente, {}).get("pauta")]
        if not ps:
            return {"n": 0}
        def media(k, absoluto=False):
            v = [abs(p[k]) if absoluto else p[k] for p in ps if p.get(k) is not None]
            return round(sum(v) / len(v), 1) if v else None
        def comp(k):
            v = [p["componentes"][k] for p in ps if k in p.get("componentes", {})]
            return round(sum(v) / len(v)) if v else None
        return {"n": len(ps), "puntaje": media("puntaje"), "conformes": round(100 * sum(1 for p in ps if p.get("conforme")) / len(ps)),
                "direccion": comp("direccion"), "intensidad": comp("intensidad"), "temperatura": comp("temperatura"),
                "sesgo_int": media("error_int"), "error_int_abs": media("error_int", True), "error_tmax_abs": media("error_tmax", True)}

    hoy = datetime.now(TZ).date()
    resumen = {}
    for b in BAHIAS:
        fb = [f for f in dias_out if f["bahia"] == b["id"]]
        u30 = [f for f in fb if date.fromisoformat(f["fecha"]) > hoy - timedelta(days=31)]
        pares = [f for f in fb if f.get("wrf", {}).get("pauta") and f.get("prof", {}).get("pauta")]
        resumen[b["id"]] = {"wrf": agregar(fb, "wrf"), "prof": agregar(fb, "prof"), "wrf_30": agregar(u30, "wrf"), "prof_30": agregar(u30, "prof"),
                            "pares": {"n": len(pares), "wrf": agregar(pares, "wrf").get("puntaje"), "prof": agregar(pares, "prof").get("puntaje")}}
    for ver, info in versiones.items():
        fv = [f for f in dias_out if f.get("wrf", {}).get("prompt") == ver]
        info.update(agregar(fv, "wrf"))
        info["bahias"] = {b["id"]: agregar([f for f in fv if f["bahia"] == b["id"]], "wrf").get("puntaje") for b in BAHIAS}
    res = {
        "pauta": PAUTA, "generado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "desde": DESDE.isoformat(), "hasta": ayer.isoformat(),
        "bahias": [{k: b[k] for k in ("id", "nombre", "est_nombre")} for b in BAHIAS],
        "pesos": PESOS, "resumen": resumen,
        "versiones": dict(sorted(versiones.items(), key=lambda kv: kv[1]["desde"])),
        "dias": sorted(dias_out, key=lambda f: (f["fecha"], f["bahia"]), reverse=True),
        "archivo_profesional": {"boletines": sum(len(v) for v in prof.values()), "desde": min((v[0]["emitido"] for v in prof.values() if v), default=None)},
        "notas": [
            "Pauta de la O.P.I. N° 1104 de la Gobernación Marítima de Valparaíso (10 abr 2026): período de pronóstico 08:00–20:00, observaciones de 12, 15, 18, 21 y 00 UTC, tablas N° 3 (dirección), N° 4 (intensidad) y N° 6 (temperatura máxima), notas 1 y 2 para calma. Las observaciones de 5 kt o menos no cuentan para la dirección.",
            "Solo se evalúan los parámetros con observación en la plataforma: dirección (0,30), intensidad (0,30) y temperatura máxima (0,05), renormalizados sobre 0,65. Nubosidad, visibilidad y estado del mar quedan fuera hasta contar con esas observaciones.",
            "Un pronóstico con 75 % o menos de acierto equivale a una «no conformidad» según la O.P.I.; se informa el porcentaje de días conformes.",
            "La apreciación nocturna (20:00–08:00) no se evalúa: el WRF + IA entrega días calendario, no ese período.",
            "Se compara el boletín profesional emitido a las 16:00 del día anterior con la versión WRF + IA disponible a las 18:00 del día anterior.",
            "La versión de prompt es la huella de las instrucciones del equipo local (mac/pronostico_ia.sh) vigentes al subir el pronóstico.",
            "Las estaciones de capitanía de puerto pueden estar abrigadas: un sesgo sistemático de la estación afecta por igual a ambas fuentes.",
        ],
    }
    EVAL.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n = sum(1 for f in dias_out for k in ("wrf", "prof") if f.get(k, {}).get("pauta"))
    print(f"Evaluación WRF + IA: {DESDE} a {ayer} · {n} pronósticos evaluados · {nuevos} boletines nuevos archivados · {len(versiones)} versiones de prompt")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Evaluación WRF + IA: error", repr(e))
    sys.exit(0)
