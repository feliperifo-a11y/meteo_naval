#!/usr/bin/env python3
"""Pronósticos marítimos publicados (bahías y áreas) → data/pronosticos.json

Lee los textos de pronóstico del sitio público de meteorología marítima (los mismos que enlaza su
«versión liviana») y los ordena en el formato de la página de pronósticos: por lugar y por período.

Tipos de texto:
  · Bahías: pronóstico del día (08–20 h), noche (20–08 h) y los dos días siguientes, con temperaturas.
  · Áreas y rutas (Chiloé, Boca del Guafo, Golfo de Penas, Estrecho de Magallanes, etc.): mismo esquema,
    a veces solo día y noche.
  · Zona X (alta mar): un boletín con varios sectores, cada uno con sus límites de latitud y longitud.
  · Zona IX y Península Antártica: un texto con varios sectores.
  · Pronóstico general marítimo: nueve zonas costeras (archivo JSON del sitio).
Se omiten las firmas y la identificación de quien emite; se conserva la fecha y hora de emisión.
No usa IA: es una lectura directa del texto. Nunca hace fallar el flujo de trabajo.
"""
import json
import re
import sys
import time
import unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "pronosticos.json"
BASE = "https://web.directemar.cl/met/jturno/PRONOSTICOS/"
SITIO = "https://meteoarmada.directemar.cl"
LIVIANA = SITIO + "/meteo/site/edic/base/port/inicio_liviana.html"
CAB = {"User-Agent": "dashboard-meteo-publico/1.0 (pronosticos maritimos)"}

# codigo, nombre, grupo, archivo, página, tipo, posición [lat, lon]
N, CN, IS, CS, S, AU, AN = ("Norte", "Centro norte", "Islas oceánicas", "Centro sur", "Sur", "Austral", "Antártica")
CATALOGO = [
    ("arica", "Arica", N, "Cenmeteoique/72/arica72.txt", "/meteo/arica", "bahia", [-18.475, -70.325]),
    ("iquique", "Iquique", N, "Cenmeteoique/72/iquique72.txt", "/meteo/iquique", "bahia", [-20.205, -70.155]),
    ("patache", "Patache", N, "Cenmeteoique/72/patache72.txt", "/meteo/patache", "bahia", [-20.81, -70.2]),
    ("tocopilla", "Tocopilla", N, "Cenmeteoique/72/tocopilla72.txt", "/meteo/tocopilla", "bahia", [-22.09, -70.215]),
    ("mejillones", "Mejillones", N, "Cenmeteoique/72/mejillones72.txt", "/meteo/mejillones", "bahia", [-23.095, -70.44]),
    ("antofagasta", "Antofagasta", N, "Cenmeteoique/72/antofagasta72.txt", "/meteo/antofagasta", "bahia", [-23.64, -70.41]),
    ("taltal", "Taltal", N, "Cenmeteoique/72/taltal72.txt", "/meteo/taltal", "bahia", [-25.405, -70.48]),
    ("chanaral", "Chañaral", CN, "Cenmeteovalp/72/chañaral72.txt", "/meteo/chanaral", "bahia", [-26.345, -70.63]),
    ("caldera", "Caldera", CN, "Cenmeteovalp/72/caldera72.txt", "/meteo/caldera", "bahia", [-27.065, -70.83]),
    ("huasco", "Huasco", CN, "Cenmeteovalp/72/huasco72.txt", "/meteo/huasco", "bahia", [-28.465, -71.225]),
    ("coquimbo", "Coquimbo", CN, "Cenmeteovalp/72/coquimbo72.txt", "/meteo/coquimbo", "bahia", [-29.95, -71.34]),
    ("losvilos", "Los Vilos", CN, "Cenmeteovalp/72/losvilos72.txt", "/meteo/los-vilos", "bahia", [-31.91, -71.52]),
    ("quintero", "Quintero", CN, "Cenmeteovalp/72/quintero72.txt", "/meteo/quintero", "bahia", [-32.775, -71.51]),
    ("valparaiso", "Valparaíso", CN, "Cenmeteovalp/72/valpo72.txt", "/meteo/valparaiso", "bahia", [-33.03, -71.625]),
    ("sanantonio", "San Antonio", CN, "Cenmeteovalp/72/antonio72.txt", "/meteo/san-antonio", "bahia", [-33.585, -71.62]),
    ("pichilemu", "Pichilemu", CN, "Cenmeteovalp/72/pichilemu72.txt", "/meteo/pichilemu", "bahia", [-34.385, -72.01]),
    ("pascua", "Rapa Nui", IS, "Cenmeteovalp/72/pascua72.txt", "/meteo/isla-de-pascua", "bahia", [-27.15, -109.43]),
    ("juanfernandez", "Juan Fernández", IS, "Cenmeteovalp/72/fernandez72.txt", "/meteo/juan-fernandez", "bahia", [-33.635, -78.83]),
    ("constitucion", "Constitución", CS, "Cenmeteotalc/72/constitucion72.txt", "/meteo/constitucion", "bahia", [-35.33, -72.42]),
    ("lirquen", "Lirquén", CS, "Cenmeteotalc/72/lirquen72.txt", "/meteo/lirquen", "bahia", [-36.71, -72.975]),
    ("talcahuano", "Talcahuano", CS, "Cenmeteotalc/72/talcahuano72.txt", "/meteo/talcahuano", "bahia", [-36.715, -73.11]),
    ("sanvicente", "San Vicente", CS, "Cenmeteotalc/72/vicente72.txt", "/meteo/san-vicente", "bahia", [-36.735, -73.145]),
    ("coronel", "Coronel", CS, "Cenmeteotalc/72/coronel72.txt", "/meteo/coronel", "bahia", [-37.03, -73.16]),
    ("lota", "Lota", CS, "Cenmeteotalc/72/lota72.txt", "/meteo/lota", "bahia", [-37.09, -73.16]),
    ("lebu", "Lebu", CS, "Cenmeteotalc/72/lebu72.txt", "/meteo/lebu", "bahia", [-37.605, -73.66]),
    ("saavedra", "Puerto Saavedra", CS, "Cenmeteotalc/72/saavedra72.txt", "/meteo/puerto-saavedra", "bahia", [-38.785, -73.40]),
    ("mehuin", "Mehuín", CS, "Cenmeteotalc/72/mehuin72.txt", "/meteo/mehuin", "bahia", [-39.43, -73.22]),
    ("corral", "Corral", CS, "Cenmeteotalc/72/corral72.txt", "/meteo/corral", "bahia", [-39.87, -73.43]),
    ("chacao", "Canal Chacao (acceso oceánico)", S, "Cenmeteopmo/72/chacao72.txt", "/meteo/canal-chacao", "area", [-41.80, -73.62]),
    ("puertomontt", "Puerto Montt", S, "Cenmeteopmo/72/pmontt72.txt", "/meteo/puerto-montt", "bahia", [-41.48, -72.94]),
    ("chiloe1", "Seno Reloncaví a isla Buta Chauques", S, "Cenmeteopmo/72/chiloe1.txt", None, "area", [-41.80, -72.95]),
    ("chiloe2", "Isla Buta Chauques a isla San Pedro", S, "Cenmeteopmo/72/chiloe2.txt", None, "area", [-42.65, -73.25]),
    ("chiloe3", "Boca del Guafo y Golfo Corcovado", S, "Cenmeteopmo/72/chiloe3.txt", None, "area", [-43.30, -73.35]),
    ("quellonmelinka", "Ruta Quellón a Melinka", S, "Cenmeteopmo/72/QuellonMelinka72.txt", "/meteo/ruta-quellon-a-melinka", "area", [-43.55, -73.70]),
    ("guafo", "Boca del Guafo", S, "Cenmeteopmo/72/guafo72.txt", "/meteo/boca-del-guafo", "area", [-43.65, -74.35]),
    ("chacabuco", "Fiordo Aysén y Puerto Chacabuco", S, "Cenmeteopmo/72/chacabuco72.txt", "/meteo/fiordo-aysen-y-bahia-chacabuco", "bahia", [-45.465, -72.83]),
    ("penas", "Golfo de Penas", S, "Cenmeteopmo/72/penas72.txt", "/meteo/golfo-de-penas", "area", [-47.40, -75.00]),
    ("eden", "Puerto Edén", AU, "Cenmeteopar/72/ptoeden72.txt", "/meteo/puertro-eden", "bahia", [-49.13, -74.41]),
    ("trinidad", "Golfo Trinidad", AU, "Cenmeteopar/72/trinidad72.txt", "/meteo/golfo-trinidad", "area", [-49.95, -75.35]),
    ("nelson", "Estrecho Nelson", AU, "Cenmeteopar/72/nelson72.txt", "/meteo/estrecho-nelson", "area", [-51.60, -74.95]),
    ("natales", "Puerto Natales", AU, "Cenmeteopar/72/natales72.txt", "/meteo/puerto-natales", "bahia", [-51.73, -72.51]),
    ("skyring", "Seno Skyring", AU, "Cenmeteopar/72/skyring72.txt", "/meteo/seno-skyring", "area", [-52.55, -71.90]),
    ("otway", "Seno Otway", AU, "Cenmeteopar/72/senotway72.txt", "/meteo/seno-otway", "area", [-52.98, -71.35]),
    ("bocaoccidental", "Boca occidental Estrecho de Magallanes", AU, "Cenmeteopar/72/bocem72.txt", "/meteo/boca-occidental-estrecho-magallanes", "area", [-52.70, -74.60]),
    ("limiteoriental", "Límite oriental Estrecho de Magallanes", AU, "Cenmeteopar/72/borem72.txt", "/meteo/boca-oriental-estrecho-magallanes", "area", [-52.40, -68.55]),
    ("gregorio", "Bahía Gregorio", AU, "Cenmeteopar/72/bgregorio72.txt", "/meteo/bahia-gregorio", "bahia", [-52.64, -70.18]),
    ("puntaarenas", "Punta Arenas", AU, "Cenmeteopar/72/parenas72.txt", "/meteo/punta-arenas", "bahia", [-53.165, -70.90]),
    ("chilota", "Bahía Chilota", AU, "Cenmeteopar/72/bchilota72.txt", "/meteo/bahiaa-chilota", "bahia", [-53.29, -70.37]),
    ("mansa", "Bahía Mansa", AU, "Cenmeteopar/72/bmansa72.txt", "/meteo/bahia-mansa", "bahia", [-53.62, -70.93]),
    ("williams", "Puerto Williams", AU, "Cenmeteopar/72/williams72.txt", "/meteo/puerto-williams", "bahia", [-54.93, -67.61]),
    ("fildes", "Bahía Fildes", AN, "Cenmeteopar/72/fildes72.txt", "/meteo/bahia-fildes-base-antartica", "bahia", [-62.20, -58.95]),
]
ZONA_X = ("Cenmeteovalp/zonadiez.txt", "/meteo/zona-x")
ZONA_IX = ("Cenmeteopar/zonanueve.txt", "/meteo/reporte-meteorologico-antartico-zona-ix")
GENERAL = SITIO + "/meteo/stat/download/regionalMaritimo.json"

MESES = {m: i + 1 for i, m in enumerate(["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"])}
DIA_SEM = r"(?:LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO|LUN|MRT|MIE|JUE|VIE|SAB|DOM)"
NUBES = ["DESPEJADO", "PARCIAL", "NUBLADO", "CUBIERTO"]
CAT_NUB = {"DESPEJADO": "Despejado", "PARCIAL": "Parcial", "NUBLADO": "Nublado", "CUBIERTO": "Cubierto"}


def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def decodificar(b):
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode("latin-1", "replace")


def descargar(sesion, url):
    for intento in range(2):
        try:
            r = sesion.get(url, headers=CAB, timeout=30)
            if r.status_code == 200 and r.content.strip():
                return decodificar(r.content)
        except Exception:
            pass
        time.sleep(2)
    return None


# ---------------------------------------------------------------- texto → campos
DIRS_SIEMPRE = {"sw", "nw", "sse", "ssw", "nne", "nnw", "ene", "ese", "wsw", "wnw"}
DIRS_NUM = {"n", "s", "e", "w", "ne", "se"}
TILDES = {"circulacion": "circulación", "ciclonica": "ciclónica", "anticiclonico": "anticiclónico", "anticiclonica": "anticiclónica",
          "area": "área", "areas": "áreas", "oceanica": "oceánica", "oceanico": "oceánico", "electrica": "eléctrica", "analisis": "análisis",
          "decimos": "décimos", "decimo": "décimo", "bahia": "bahía", "bahias": "bahías", "dorsal": "dorsal", "vaguada": "vaguada",
          "precipitacion": "precipitación", "precipitaciones": "precipitaciones", "debil": "débil", "depresion": "depresión",
          "rolando": "rolando", "transito": "tránsito", "maximo": "máximo", "minimo": "mínimo", "periodo": "período", "region": "región",
          "peninsula": "península", "antartica": "antártica", "tempanos": "témpanos", "isla": "isla", "proximo": "próximo",
          "termino": "término", "inestabilidad": "inestabilidad", "frontal": "frontal", "postfrontal": "postfrontal", "prefrontal": "prefrontal",
          "rapida": "rápida", "rapido": "rápido", "segun": "según", "ultravioleta": "ultravioleta", "dias": "días", "dia": "día"}
NOMBRES = ["golfo de ancud", "seno reloncaví", "seno reloncavi", "golfo corcovado", "boca del guafo", "golfo de penas", "canal chacao",
           "caleta ardley", "ensenada iquique", "paso antarctic", "golfo erebus y terror", "canal grandidier", "estrecho de magallanes",
           "canal moraleda", "isla mocha", "juan fernández", "rapa nui", "isla de pascua"]


def oracion(s):
    """MAYÚSCULAS → texto normal, conservando direcciones (SW, N/NE), unidades y siglas."""
    s = re.sub(r"\s+", " ", (s or "").strip()).strip(" .")
    if not s:
        return ""
    t = s.lower()
    t = re.sub(r"\bsurweste\b", "SW", t)
    t = re.sub(r"\bnorweste\b", "NW", t)
    t = re.sub(r"\b(\d+(?:\.\d+)?)([nsew])\b", lambda m: m.group(1) + m.group(2).upper(), t)
    t = re.sub(r"\b[nsew]{1,3}(?:/[nsew]{1,3})+\b", lambda m: m.group(0).upper(), t)
    t = re.sub(r"\b([nsew]{1,3})\b(?=(\s+\d|$|[.,;)]))?", lambda m: m.group(1).upper() if (m.group(1) in DIRS_SIEMPRE or (m.group(1) in DIRS_NUM and m.group(2) and m.group(2).strip()[:1].isdigit())) else m.group(1), t)
    t = re.sub(r"\b(am|pm|utc|dmc|uv)\b", lambda m: m.group(1).upper(), t)
    t = re.sub(r"(\d)\s*kt\b", r"\1 kt", t)
    t = re.sub(r"(\d)\s*km\b", r"\1 km", t)
    t = re.sub(r"(\d)m\b", r"\1 m", t)
    t = re.sub(r"\bhpa\b", "hPa", t)
    t = t.replace("°c", "°C").replace("º", "°")
    t = re.sub(r"\b[a-záéíóúñ]+\b", lambda m: TILDES.get(m.group(0), m.group(0)), t)
    for n in NOMBRES:
        t = re.sub(r"\b" + n + r"\b", lambda m: " ".join(w if w in ("de", "del", "y") else w[:1].upper() + w[1:] for w in m.group(0).split()), t)
    return t[0].upper() + t[1:]


def clausulas(txt):
    """Divide en cláusulas por comas que no estén dentro de paréntesis."""
    out, prof, act = [], 0, ""
    for ch in txt:
        if ch == "(":
            prof += 1
        elif ch == ")":
            prof = max(0, prof - 1)
        if ch == "," and prof == 0:
            out.append(act.strip()); act = ""
        else:
            act += ch
    if act.strip():
        out.append(act.strip())
    return [c for c in out if c]


def desarmar(txt, con_situacion=False):
    """Texto de pronóstico → nubosidad, visibilidad, fenómenos, viento, mar (y situación inicial si la trae)."""
    r = {"situacion": "", "nubosidad": "", "visibilidad": "", "fenomenos": "", "viento": "", "mar": "", "otros": ""}
    ultimo = None
    txt = re.sub(r"\bESPEJADO\b", "DESPEJADO", txt)   # errata frecuente en los textos
    for i, c in enumerate(clausulas(re.sub(r"\s+", " ", txt))):
        u = sin_tildes(c.upper())
        if u.startswith("VIS "):
            v = c[4:].strip()
            m = re.match(r"(.*?\))\s*(.*)$", v)
            r["visibilidad"], fen = (m.group(1), m.group(2)) if m else (v, "")
            if fen:
                r["fenomenos"] = (r["fenomenos"] + " · " if r["fenomenos"] else "") + fen
            ultimo = "visibilidad"
        elif u.startswith("VIENTO "):
            r["viento"] = (r["viento"] + ", " if r["viento"] else "") + c[7:].strip(); ultimo = "viento"
        elif u.startswith("MAR ") and not u.startswith("MAR DE WEDDELL"):
            r["mar"] = (r["mar"] + ", " if r["mar"] else "") + c[4:].strip(); ultimo = "mar"
        elif any(re.search(r"\b" + n + r"\b", u) for n in NUBES) and not r["nubosidad"] and ultimo in (None, "situacion"):
            r["nubosidad"] = c; ultimo = "nubosidad"
        elif ultimo is None and (con_situacion or i == 0) and not re.search(r"\b(LLUVIA|CHUBASCO|LLOVIZNA|NEBLINA|NIEBLA|NIEVE|PRECIPITACION)", u):
            r["situacion"] = (r["situacion"] + ", " if r["situacion"] else "") + c; ultimo = "situacion"
        elif ultimo:
            sep = " · " if ultimo == "visibilidad" else ", "
            if ultimo == "visibilidad":
                r["fenomenos"] = (r["fenomenos"] + sep if r["fenomenos"] else "") + c
            else:
                r[ultimo] += ", " + c
        else:
            r["otros"] = (r["otros"] + ", " if r["otros"] else "") + c
    cat = ""
    if r["nubosidad"]:
        u = sin_tildes(r["nubosidad"].upper())
        pos = [(u.find(n), n) for n in NUBES if re.search(r"\b" + n + r"\b", u)]
        if pos:
            cat = CAT_NUB[min(pos)[1]]
    salida = {k: oracion(v) for k, v in r.items() if v}
    if cat:
        salida["cat"] = cat
    precip = re.search(r"\b(LLUVIA|CHUBASCO|LLOVIZNA|PRECIPITACION|NIEVE|AGUANIEVE|TORMENTA|ACTIVIDAD ELECTRICA)", sin_tildes(txt.upper()))
    if precip:
        salida["precip"] = True
    return salida


def temp(linea):
    m = re.search(r"(-?\d+(?:[.,]\d+)?)\s*\S?\s*C\b", linea.upper())
    return float(m.group(1).replace(",", ".")) if m else None


def emision(texto):
    u = sin_tildes(texto.upper())
    m = re.search(r"EMITIDO:\s*(\d{1,2})\s+(?:DE\s+)?([A-Z]{3})[A-Z]*\s+(?:DE\s+)?(\d{4})\s+A\s+LAS\s+(\d{1,2}):(\d{2})\s*(HORA LOCAL|UTC)?", u)
    if not m:
        return None, None
    try:
        d = datetime(int(m.group(3)), MESES[m.group(2)], int(m.group(1)), int(m.group(4)), int(m.group(5)))
    except Exception:
        return None, None
    return d, ("UTC" if m.group(6) == "UTC" else "local")


def fecha_de_dia(dia, ref):
    """Número de día del mes → fecha, tomando el mes de la emisión (con cambio de mes)."""
    if ref is None:
        ref = datetime.now(timezone.utc) - timedelta(hours=4)
    base = date(ref.year, ref.month, 1)
    cand = []
    for k in (-1, 0, 1):
        y, mth = base.year + (base.month - 1 + k) // 12, (base.month - 1 + k) % 12 + 1
        try:
            cand.append(date(y, mth, dia))
        except ValueError:
            pass
    return min(cand, key=lambda d: abs((d - ref.date()).days)).isoformat()


def limpiar(texto):
    """Quita BOM, firmas, emisor y copias antiguas pegadas al final (separadas por asteriscos)."""
    texto = texto.replace("﻿", "").replace("\r", "")
    texto = re.split(r"\n\s*\*{10,}", texto)[0]
    return texto


def cortar_firma(bloque):
    lineas = []
    for l in bloque.split("\n"):
        u = l.strip().upper()
        if re.match(r"^MET\d", u) or u.startswith("EMITIDO") or u.startswith("POR EL CENTRO"):
            break
        lineas.append(l)
    return "\n".join(lineas)


# ---------------------------------------------------------------- textos de bahía y área
def parsear_estandar(texto):
    """Bahías y áreas: períodos día (08–20 h), noche (20–08 h) y días siguientes."""
    emit, ref_tipo = emision(texto)
    cuerpo = cortar_firma(texto)
    lineas = [l.strip() for l in cuerpo.split("\n")]
    periodos, act, campo, buf, utc = [], None, None, [], False

    def cerrar_buf():
        nonlocal buf, campo
        if act is not None and campo and buf:
            t = " ".join(buf).strip()
            act[campo] = (act.get(campo, "") + " " + t).strip()
        buf = []

    def nuevo(tipo, fecha, desde=None, hasta=None):
        nonlocal act, campo
        cerrar_buf()
        act = {"tipo": tipo, "fecha": fecha, "desde": desde, "hasta": hasta}
        periodos.append(act); campo = None
        return act

    titulo = lineas[0] if lineas else ""
    for l in lineas[1:]:
        u = sin_tildes(l.upper())
        if not l:
            cerrar_buf(); campo = None if campo in ("pronostico", "situacion", "noche") else campo; continue
        m = re.match(r"^VALIDO DESDE (\d{2})(\d{2})(\d{2}) HASTA (\d{2})(\d{2})(\d{2})\s*(HORA LOCAL|UTC)?", u)
        if m and act is not None:
            nuevo("noche", fecha_de_dia(int(m.group(1)), emit), f"{m.group(2)}:{m.group(3)}", f"{m.group(5)}:{m.group(6)}")
            campo = "texto_noche"; continue
        if m and act is None:
            utc = (m.group(7) == "UTC")
            nuevo("dia", fecha_de_dia(int(m.group(1)), emit), f"{m.group(2)}:{m.group(3)}", f"{m.group(5)}:{m.group(6)}")
            continue
        m = re.match(r"^(?:PRONOSTICO VALIDO|APRECIACION VALIDA) DESDE (\d{2})(\d{2})(\d{2}) HASTA (\d{2})(\d{2})(\d{2})", u)
        if m:
            nuevo("noche", fecha_de_dia(int(m.group(1)), emit), f"{m.group(2)}:{m.group(3)}", f"{m.group(5)}:{m.group(6)}")
            campo = "texto_noche"; continue
        m = re.match(r"^" + DIA_SEM + r"\.?\s+(\d{1,2})\s*[:.]?\s*$", u)
        if m:
            nuevo("dia", fecha_de_dia(int(m.group(1)), emit)); continue
        if act is None:
            continue
        if u.startswith("SITUACION SINOPTICA"):
            cerrar_buf(); campo = "situacion"
            resto = l.split(":", 1)[1].strip() if ":" in l else ""
            if resto:
                buf.append(resto)
            continue
        if re.match(r"^PRON[A-Z]*\s*:?$", u):
            cerrar_buf(); campo = "pronostico"; continue
        if u.startswith("TEMPERATURA MINIMA"):
            cerrar_buf(); act["tmin"] = temp(l); campo = None; continue
        if u.startswith("TEMPERATURA MAXIMA"):
            cerrar_buf(); act["tmax"] = temp(l); campo = None; continue
        if u.startswith("INDICE DE RADIACION"):
            cerrar_buf(); act["uv"] = oracion(re.sub(r"\(FUENTE.*?\)", "", l.split(":", 1)[-1])); campo = None; continue
        if campo == "texto_noche" and not re.search(r"\b(VIS|VIENTO|MAR)\b", u) and l.endswith(".") and "," not in l and len(buf) == 0:
            continue   # subtítulo de área («PUERTO MONTT A ISLA BUTA CHAUQUES.»)
        if campo == "pronostico" and not re.search(r"\b(VIS|VIENTO|MAR)\b", u) and l.endswith(".") and "," not in l and not buf:
            continue
        if campo:
            buf.append(l)
    cerrar_buf()
    out = []
    for p in periodos:
        txt = p.get("pronostico") or p.get("texto_noche") or ""
        if not txt and not p.get("situacion"):
            continue
        d = desarmar(txt, con_situacion=(p["tipo"] == "noche" and not p.get("situacion")))
        if p.get("situacion"):
            d["situacion"] = oracion(p["situacion"])
        per = {"tipo": p["tipo"], "fecha": p["fecha"], **d}
        if p.get("desde"):
            per["horario"] = f"{p['desde']}–{p['hasta']}" + (" UTC" if utc else " h")
        for k in ("tmin", "tmax", "uv"):
            if p.get(k) is not None:
                per[k] = p[k]
        per["texto"] = oracion(txt)
        out.append(per)
    return titulo, emit, out


# ---------------------------------------------------------------- Zona X (alta mar)
SECT_X = {"NORESTE": "NE", "NORWESTE": "NO", "NOROESTE": "NO", "CENTRAL ESTE": "CE", "CENTRAL WESTE": "CO", "CENTRAL OESTE": "CO",
          "SURESTE": "SE", "SURWESTE": "SO", "SUROESTE": "SO"}
NOM_X = {"NE": "Sector Noreste", "NO": "Sector Noroeste", "CE": "Sector Central Este", "CO": "Sector Central Oeste", "SE": "Sector Sureste", "SO": "Sector Suroeste"}


def parsear_zona_x(texto):
    emit, _ = emision(texto)
    cuerpo = cortar_firma(texto)
    u_all = sin_tildes(cuerpo.upper())
    m = re.search(r"VALIDO (\d{2})(\d{2})(\d{2}) HASTA (\d{2})(\d{2})(\d{2}) UTC", u_all)
    fecha = fecha_de_dia(int(m.group(1)), emit) if m else None
    horario = f"{m.group(2)}:{m.group(3)} a {m.group(5)}:{m.group(6)} UTC del día siguiente" if m else ""
    sit = re.search(r"PARTE II:.*?\n(.*?)(?:\n\s*\n|PARTE III)", cuerpo, re.S | re.I)
    situacion = "; ".join(x.strip() for x in sit.group(1).split("\n") if x.strip()) if sit else ""
    sit_t = re.search(r"PARTE II: SITUACION SINOPTICA \((.*?)\)", u_all)
    items = []
    parte = None
    lineas = cuerpo.split("\n")
    i = 0
    while i < len(lineas):
        l = lineas[i].strip(); u = sin_tildes(l.upper())
        if u.startswith("PARTE I:"):
            parte = "aviso"
        elif u.startswith("PARTE III"):
            parte = "pronostico"
        ms = re.match(r"^SECTOR ([A-Z ]+?) \(LAT (\d+) A (\d+) SUR Y LONG (\d+) A (\d+) WESTE\)", u)
        if ms:
            cod = SECT_X.get(ms.group(1).strip())
            txt = []
            i += 1
            while i < len(lineas) and lineas[i].strip():
                txt.append(lineas[i].strip()); i += 1
            t = " ".join(txt)
            if cod:
                la1, la2, lo1, lo2 = (int(ms.group(k)) for k in range(2, 6))
                d = desarmar(t)
                per = {"tipo": "dia", "fecha": fecha, "horario": horario, **d, "texto": oracion(t)}
                if situacion:
                    per["situacion"] = oracion(situacion) + (f" ({oracion(sit_t.group(1))})" if sit_t else "")
                items.append({"codigo": "zx_" + cod.lower(), "nombre": "Zona X · " + NOM_X[cod], "grupo": "Alta mar (Zona X)", "tipo": "area",
                              "aviso": "Aviso de temporal" if parte == "aviso" else None,
                              "metarea": "X-" + cod,   # mismo polígono de la capa base (límites del boletín, ajustados a las áreas costeras)
                              "periodos": [per]})
            continue
        i += 1
    orden = ["zx_no", "zx_ne", "zx_co", "zx_ce", "zx_so", "zx_se"]
    items.sort(key=lambda x: orden.index(x["codigo"]) if x["codigo"] in orden else 9)
    return emit, items


# ---------------------------------------------------------------- Zona IX y Península Antártica
SUB_IX = [
    (r"^SECTOR CENTRAL", "zix_central", "Zona IX · Sector Central", {"metarea": "IX-C"}),
    (r"^SECTOR WESTE", "zix_weste", "Zona IX · Sector Oeste", {"metarea": "IX-O"}),
    (r"^PASO DRAKE", "pen_drake", "Paso Drake Sur", {"metarea": "IX-PD"}),
    (r"^ESTRECHO BRANSFIELD", "pen_bransfield", "Estrecho Bransfield", {"pos": [-63.0, -59.2]}),
    (r"^BAHIA CHILE", "pen_bahiachile", "Bahía Chile (isla Greenwich)", {"pos": [-62.48, -59.66]}),
    (r"^RADA COVADONGA", "pen_covadonga", "Rada Covadonga", {"pos": [-63.32, -57.90]}),
    (r"^MAR DE WEDDELL", "pen_weddell", "Mar de Weddell", {"metarea": "IX-W"}),
    (r"^COSTA WESTE", "pen_costaw", "Costa oeste Tierra de O'Higgins", {"pos": [-66.2, -67.8]}),
]


def parsear_zona_ix(texto):
    emit, _ = emision(texto)
    bloques = re.split(r"\n-{10,}\s*\n", texto)
    items = []
    for b in bloques:
        b = cortar_firma(b)
        u_all = sin_tildes(b.upper())
        m = re.search(r"VALIDO DESDE [A-Z]{3} (\d{2})(\d{2})(\d{2}) (HORA LOCAL|UTC)", u_all)
        fecha = fecha_de_dia(int(m.group(1)), emit) if m else None
        mv = re.search(r"VALIDO DESDE (.*?)\.\s*\n", u_all)
        horario = oracion(mv.group(1)).replace("Oct ", "") if mv else ""
        sits = {}
        ms = re.search(r"SITUACION SINOPTICA:\s*\n(.*?)\n\s*\n", b, re.S)
        if ms:
            for x in ms.group(1).split("\n"):
                if ":" in x:
                    k, v = x.split(":", 1)
                    sits[sin_tildes(k.upper()).split("(")[0].strip()] = v.strip()
        sit_general = "; ".join(f"{oracion(k)}: {oracion(v)}" for k, v in sits.items())
        mp = re.search(r"\nPRONOSTICO:\s*\n(.*?)(?:\nPRESENCIA DE TEMPANOS|$)", b, re.S)
        if not mp:
            continue
        for seg in re.split(r"\n\s*\n", mp.group(1)):
            seg = seg.strip()
            if not seg or ":" not in seg.split("\n")[0]:
                continue
            cab, cuerpo = seg.split("\n", 1) if "\n" in seg else (seg, "")
            uc = sin_tildes(cab.upper())
            for rx, cod, nom, geo in SUB_IX:
                if re.match(rx, uc):
                    t = " ".join(x.strip() for x in cuerpo.split("\n"))
                    sit = next((v for k, v in sits.items() if k.startswith(uc.split(":")[0].split("(")[0].strip())), None)
                    per = {"tipo": "dia", "fecha": fecha, "horario": horario, **desarmar(t), "texto": oracion(t),
                           "situacion": oracion(sit) if sit else sit_general}
                    items.append({"codigo": cod, "nombre": nom, "grupo": AN, "tipo": "area", **geo, "periodos": [per]})
                    break
    tempanos = re.search(r"PRESENCIA DE TEMPANOS:\s*\n(.*?)\(FUENTE", texto, re.S)
    nota = None
    if tempanos:
        n = len([x for x in tempanos.group(1).split("\n") if x.strip()])
        nota = f"Presencia de témpanos: {n} informados en el área (ver texto original)."
    return emit, items, nota


# ---------------------------------------------------------------- Pronóstico general marítimo (zonas costeras)
ZONAS_GEN = {"1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI", "7": "VII", "8.1": "VIII", "8.2": "VIII", "8": "VIII"}


def parsear_general(sesion):
    try:
        r = sesion.get(GENERAL, headers=CAB, timeout=30)
        d = r.json()
    except Exception as e:
        print("General marítimo: no disponible", e)
        return []
    p = d.get("pronostico") or {}
    val = p.get("periodo_validez") or {}
    m = re.match(r"(\d{2})(\d{2})(\d{2})", val.get("inicio", ""))
    fecha = fecha_de_dia(int(m.group(1)), None) if m else None
    horario = f"{val.get('inicio', '')} a {val.get('fin', '')}".replace("UTC", "").strip() + " UTC" if val else ""
    horario = re.sub(r"(\d{2})(\d{2})(\d{2})", lambda x: f"{x.group(1)} {x.group(2)}:{x.group(3)}", horario)
    items = []
    for z in p.get("pronostico_detallado") or []:
        idz = str(z.get("id-zona", ""))
        nombre = (z.get("zona") or "").strip()
        nombre = re.sub(r"\s+", " ", nombre)
        mar = ", ".join(x for x in [(z.get("mar_oceanico") or "").strip(" ."), (z.get("mar_bahia") or "").strip(" .")] if x)
        vis = (z.get("visibilidad") or "").strip()
        mv = re.match(r"(.*?\))\s*(.*)$", vis)
        texto = ", ".join(x for x in [z.get("nubosidad"), "VIS " + vis if vis else "", "VIENTO " + (z.get("viento") or ""), "MAR " + mar if mar else ""] if x)
        per = {"tipo": "dia", "fecha": fecha, "horario": horario, **desarmar(texto), "texto": oracion(texto)}
        sit = (z.get("situacion_sinoptica") or "").split("\n")[0]
        if sit:
            per["situacion"] = oracion(sit)
        cod = "gen_" + idz.replace(".", "_")
        mz = re.match(r"Zona (\w+)(?: \((\d)\))? \((.*)\)$", nombre)
        NUM = {"UNO": "1", "DOS": "2", "TRES": "3", "CUATRO": "4", "CINCO": "5", "SEIS": "6", "SIETE": "7", "OCHO": "8"}
        if mz:
            tramo = re.sub(r"\bLat\b", "lat.", mz.group(3)).replace("GDS Sur", "°S").replace(" GDS", "°").replace("A F.", "a F.")
            nombre = f"Zona {NUM.get(mz.group(1).upper(), mz.group(1))}{' (' + mz.group(2) + ')' if mz.group(2) else ''} · {tramo}"
        items.append({"codigo": cod, "nombre": nombre,
                      "grupo": "Costa (pronóstico general marítimo)", "tipo": "area", "metarea": ZONAS_GEN.get(idz), "periodos": [per]})
    return items


# ---------------------------------------------------------------- principal
def main():
    s = requests.Session()
    items, errores, emisiones = [], [], []
    for cod, nombre, grupo, arch, pag, tipo, pos in CATALOGO:
        url = BASE + arch
        t = descargar(s, url)
        if not t:
            errores.append(nombre)
            items.append({"codigo": cod, "nombre": nombre, "grupo": grupo, "tipo": tipo, "pos": pos, "periodos": [], "error": "No se pudo leer el pronóstico",
                          "url": SITIO + pag if pag else url, "txt": url})
            continue
        try:
            titulo, emit, periodos = parsear_estandar(limpiar(t))
        except Exception as e:
            titulo, emit, periodos = "", None, []
            print("Error al leer", nombre, e)
        it = {"codigo": cod, "nombre": nombre, "grupo": grupo, "tipo": tipo, "pos": pos, "periodos": periodos,
              "emitido": emit.strftime("%Y-%m-%dT%H:%M") if emit else None, "url": SITIO + pag if pag else url, "txt": url}
        if not periodos:
            it["error"] = "El texto publicado no trae un pronóstico legible"
        items.append(it)
        time.sleep(0.3)
    # Zona X
    url = BASE + ZONA_X[0]
    t = descargar(s, url)
    if t:
        emit, zx = parsear_zona_x(limpiar(t))
        for z in zx:
            z.update({"emitido": emit.strftime("%Y-%m-%dT%H:%M") if emit else None, "url": SITIO + ZONA_X[1], "txt": url})
        items += zx
    else:
        errores.append("Zona X")
    # Zona IX y Península
    url = BASE + ZONA_IX[0]
    t = descargar(s, url)
    if t:
        emit, zix, nota = parsear_zona_ix(t.replace("﻿", "").replace("\r", ""))
        for z in zix:
            z.update({"emitido": emit.strftime("%Y-%m-%dT%H:%M") if emit else None, "url": SITIO + ZONA_IX[1], "txt": url})
            if nota:
                z["nota"] = nota
        items += zix
    else:
        errores.append("Zona IX")
    gen = parsear_general(s)
    for g in gen:
        g.update({"url": SITIO + "/pronostico-maritimo", "txt": GENERAL})
    items += gen
    # Continuidad: un pronóstico nuevo suele empezar al día siguiente (p. ej. emitido a las 16 h, válido desde las 08 h
    # de mañana). Para no dejar «hoy» vacío, se conservan los períodos de hoy del pronóstico anterior.
    try:
        previo = json.loads(SALIDA.read_text(encoding="utf-8"))
        ant = {x["codigo"]: x for x in previo.get("items", [])}
    except Exception:
        ant = {}
    hoy = (datetime.now(timezone.utc) - timedelta(hours=3)).date().isoformat()
    for it in items:
        pa = ant.get(it["codigo"])
        if not pa:
            continue
        if not it.get("periodos"):
            it.update({k: v for k, v in pa.items() if k in ("periodos", "emitido")}); it.pop("error", None)
            continue
        primera = min(p["fecha"] for p in it["periodos"] if p.get("fecha"))
        viejos = [dict(p, anterior=True) for p in pa.get("periodos", []) if p.get("fecha") and hoy <= p["fecha"] < primera]
        if viejos:
            it["periodos"] = viejos + it["periodos"]
            it["emitido_anterior"] = pa.get("emitido_anterior") if all(p.get("anterior") for p in pa.get("periodos", []) if p["fecha"] < primera) and pa.get("emitido_anterior") else pa.get("emitido")
    ok = sum(1 for x in items if x.get("periodos"))
    if ok < 10:
        print(f"Pronósticos: solo {ok} legibles → se mantiene el archivo anterior"); return
    datos = {"actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "fuente": LIVIANA, "items": items, "errores": errores}
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Pronósticos: {ok} de {len(items)} con pronóstico" + (f"; sin acceso: {', '.join(errores)}" if errores else ""))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Pronósticos: error", e)
    sys.exit(0)
