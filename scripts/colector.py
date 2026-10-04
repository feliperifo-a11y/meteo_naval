#!/usr/bin/env python3
"""
Recolector del dashboard público de estaciones y avisos meteorológicos.

Qué hace en cada ejecución:
  1. Descarga las observaciones de la red de estaciones y escribe data/estaciones.json.
  2. Lee la lista de avisos meteorológicos publicados en la portada del sitio de avisos,
     abre cada aviso, descarga su PDF, extrae fechas de validez, sectores y condiciones,
     y arma la geometría que se dibuja en el mapa (franja costera, sector marítimo o círculo).
  3. Aplica las correcciones manuales de data/avisos_manual.json.
  4. Escribe data/avisos.json y data/estado.json (resumen de la ejecución).

Si una fuente falla, se conserva el último archivo bueno y el error queda en estado.json.
Uso:  python scripts/colector.py            (todo)
      python scripts/colector.py --solo-estaciones
      python scripts/colector.py --solo-avisos
"""
from __future__ import annotations

import io
import json
import math
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from pypdf import PdfReader
from shapely.geometry import Point, Polygon, box, mapping, shape
from shapely.ops import unary_union
from shapely import set_precision

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
GEO = DATA / "geo"
TZ = ZoneInfo("America/Santiago")
UTC = timezone.utc

URL_ESTACIONES = "https://serviciosonline.directemar.cl/meteomapa/api/meteo/observaciones/directemar"
URL_AVISOS = "https://meteoarmada.directemar.cl/"
BASE_AVISOS = "https://meteoarmada.directemar.cl"
CABECERAS = {"User-Agent": "dashboard-meteo-publico/1.0 (consulta programada cada 20 min)"}
PAUSA = 1.0          # segundos entre descargas, para no cargar los servidores
CONSERVAR_H = 6      # horas que se mantiene un aviso después de expirar

errores: list[str] = []


def ahora_utc() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def iso(d: datetime) -> str:
    return d.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def leer_json(p: Path, defecto):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return defecto


def escribir_json(p: Path, obj, compacto=False):
    p.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, separators=(",", ":") if compacto else None, indent=None if compacto else 1)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(txt, encoding="utf-8")
    tmp.replace(p)


def get(url: str, **kw) -> requests.Response:
    r = requests.get(url, headers=CABECERAS, timeout=40, **kw)
    r.raise_for_status()
    time.sleep(PAUSA)
    return r


# ============================================================ Estaciones
CAMPOS = ["nombre", "codigo", "fecha", "latitud", "longitud", "viento", "direccionViento", "velocidadDelViento",
          "temperatura", "presion", "humedad", "puntoDeRocio"]


def recolectar_estaciones() -> bool:
    try:
        datos = get(URL_ESTACIONES).json()
        if not isinstance(datos, list) or not datos or "nombre" not in datos[0]:
            raise ValueError("respuesta sin la estructura esperada")
        limpio = [{k: d.get(k) for k in CAMPOS} for d in datos]
        escribir_json(DATA / "estaciones.json", {"actualizado": iso(ahora_utc()), "fuente": URL_ESTACIONES, "datos": limpio}, compacto=True)
        print(f"Estaciones: {len(limpio)} registros")
        return True
    except Exception as e:
        errores.append(f"estaciones: {e}")
        print("ERROR estaciones:", e)
        return False


# ============================================================ Geografía
def _dec(s: str):
    out, i, lat, lon = [], 0, 0, 0
    while i < len(s):
        for k in range(2):
            sh = res = 0
            while True:
                b = ord(s[i]) - 63; i += 1; res |= (b & 0x1F) << sh; sh += 5
                if b < 0x20:
                    break
            d = ~(res >> 1) if res & 1 else res >> 1
            if k == 0: lat += d
            else: lon += d
        out.append((lon / 1e6, lat / 1e6))
    return out


class Geo:
    def __init__(self):
        polys = []
        for c in leer_json(GEO / "land.json", []):
            for poly in c["p"]:
                anillos = [_dec(r) for r in poly]
                if len(anillos[0]) >= 3:
                    g = Polygon(anillos[0], [r for r in anillos[1:] if len(r) >= 3]).buffer(0)
                    if not g.is_empty:
                        polys.append(g)
        self.tierra = unary_union(polys)
        self.areas = {f["properties"]["id"]: shape(f["geometry"]) for f in leer_json(GEO / "metarea.json", {"features": []})["features"]}
        costeras = [self.areas[k] for k in ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"] if k in self.areas]
        self.costera = unary_union(costeras)
        self.franja = self.tierra.buffer(0.22).difference(self.tierra)

    def zona(self, forma: str, lat_n=None, lat_s=None, centro=None, radio=None):
        if forma == "circulo":
            g = Point(centro[1], centro[0]).buffer(radio or 1.0, resolution=32)
        else:
            n, s = -abs(lat_n), -abs(lat_s)
            n, s = max(n, s), min(n, s)
            este = -66 if s < -52 else -69
            if forma == "franja":
                g = self.franja.intersection(box(-77.5, s, este, n))
            else:
                g = self.costera.intersection(box(-82, s, este, n))
        g = g.difference(self.tierra).buffer(0).simplify(0.01, preserve_topology=True)
        areas = [k for k, a in self.areas.items() if a.intersection(g).area > 1e-4]
        g = set_precision(g, 0.001)
        return {"geom": mapping(g), "areas": areas, "north": round(g.bounds[3], 3) if not g.is_empty else -90}


# ============================================================ Nomenclátor
# Latitudes Sur (positivas). Las regiones usan su extensión aproximada en el litoral.
REGIONES = {
    "ARICAYPARINACOTA": (18.35, 19.2), "TARAPACA": (19.2, 21.45), "ANTOFAGASTA": (21.45, 26.05), "ATACAMA": (26.05, 29.25),
    "COQUIMBO": (29.25, 32.05), "VALPARAISO": (32.05, 33.95), "OHIGGINS": (33.95, 34.8), "LIBERTADORGENERALBERNARDOOHIGGINS": (33.95, 34.8),
    "MAULE": (34.8, 35.98), "NUBLE": (35.98, 36.45), "BIOBIO": (36.45, 38.45), "ARAUCANIA": (38.45, 39.4),
    "LOSRIOS": (39.4, 40.2), "LOSLAGOS": (40.2, 43.75), "AYSEN": (43.75, 48.8), "MAGALLANES": (48.8, 56.0),
}
LUGARES = {
    # Norte grande y chico
    "ARICA": 18.35, "PISAGUA": 19.6, "IQUIQUE": 20.21, "PATACHE": 20.8, "TOCOPILLA": 22.09, "MEJILLONES": 23.1,
    "ANTOFAGASTA": 23.65, "PAPOSO": 25.0, "TALTAL": 25.4, "CHANARAL": 26.35, "CALDERA": 27.06, "HUASCO": 28.46,
    "LASERENA": 29.9, "COQUIMBO": 30.0, "TONGOY": 30.26, "LENGUADEVACA": 30.24,
    # Centro
    "PICHIDANGUI": 32.14, "LOSMOLLES": 32.24, "LOSVILOS": 31.91, "PAPUDO": 32.5, "ZAPALLAR": 32.55, "QUINTERO": 32.78,
    "VALPARAISO": 33.03, "CURAUMILLA": 33.1, "QUINTAY": 33.19, "ALGARROBO": 33.36, "CARTAGENA": 33.55, "PANUL": 33.58,
    "SANANTONIO": 33.59, "SANTODOMINGO": 33.64, "NAVIDAD": 33.95, "TOPOCALMA": 34.13, "PICHILEMU": 34.39,
    "BUCALEMU": 34.64, "BOYERUCA": 34.69, "LLICO": 34.77, "DUAO": 34.88, "ILOCA": 34.93, "CONSTITUCION": 35.33,
    "PELLUHUE": 35.82, "CURANIPE": 35.84, "COBQUECURA": 36.13,
    # Centro sur
    "DICHATO": 36.55, "TOME": 36.62, "TALCAHUANO": 36.7, "SANVICENTE": 36.73, "CORONEL": 37.03, "LOTA": 37.09,
    "GOLFODEARAUCO": 37.2, "LEBU": 37.6, "TIRUA": 38.34, "ISLAMOCHA": 38.37, "PUERTOSAAVEDRA": 38.78,
    "QUEULE": 39.39, "MEHUIN": 39.43, "NIEBLA": 39.87, "CORRAL": 39.87, "VALDIVIA": 39.85, "PUNTAGALERA": 40.0,
    "BAHIAMANSA": 40.58,
    # Sur y austral
    "MAULLIN": 41.62, "CARELMAPU": 41.75, "FAROCORONA": 41.8, "PUNTACORONA": 41.8, "CANALCHACAO": 41.8,
    "ANCUD": 41.87, "PUERTOMONTT": 41.47, "CALBUCO": 41.77, "CASTRO": 42.48, "CHAITEN": 42.92, "QUELLON": 43.12,
    "GUAFO": 43.6, "MELINKA": 43.9, "PUERTOAYSEN": 45.4, "CHACABUCO": 45.47, "ANNAPINK": 45.8, "GOLFODEPENAS": 47.1,
    "PUERTONATALES": 51.73, "EVANGELISTAS": 52.4, "PUNTAARENAS": 53.15, "PUERTOWILLIAMS": 54.93,
    "CABODEHORNOS": 55.98, "DIEGORAMIREZ": 56.5,
}
ISLAS = {  # nombre compacto → (lat, lon)
    "RAPANUI": (-27.12, -109.35), "ISLADEPASCUA": (-27.12, -109.35), "JUANFERNANDEZ": (-33.65, -79.0),
    "SANFELIX": (-26.28, -80.09), "DESVENTURADAS": (-26.3, -80.0), "SALASYGOMEZ": (-26.47, -105.36),
}


def compacto(s: str) -> str:
    s = unicodedata.normalize("NFD", s.upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Z0-9]", "", s)


def ubicar(nombre: str):
    """Devuelve ('circulo', (lat,lon)) o ('banda', (lat_n, lat_s)) o None."""
    c = compacto(nombre)
    for k, ll in ISLAS.items():
        if k in c:
            return "circulo", ll
    lats = []
    resto = c
    for k, (a, b) in sorted(REGIONES.items(), key=lambda x: -len(x[0])):
        for pref in ("REGIONDELOS", "REGIONDELA", "REGIONDEL", "REGIONDE", "REGION"):
            kk = pref + (k[3:] if k.startswith("LOS") and pref == "REGIONDELOS" else k)
            if kk in resto:
                lats += [a, b]; resto = resto.replace(kk, "|")
                break
    for k, v in sorted(LUGARES.items(), key=lambda x: -len(x[0])):
        if k in resto:
            lats.append(v); resto = resto.replace(k, "|")
    if not lats:
        return None
    n, m = min(lats), max(lats)
    if m - n < 0.3:                     # un solo lugar: franja de ±0,15° alrededor
        n, m = n - 0.15, m + 0.15
    return "banda", (n, m)


# ============================================================ Lectura de avisos
MESES = {"ENE": 1, "JAN": 1, "FEB": 2, "MAR": 3, "ABR": 4, "APR": 4, "MAY": 5, "JUN": 6, "JUL": 7, "AGO": 8, "AUG": 8,
         "SEP": 9, "SET": 9, "OCT": 10, "NOV": 11, "DIC": 12, "DEC": 12}
MESES_L = {"ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5, "JUNIO": 6, "JULIO": 7, "AGOSTO": 8,
           "SEPTIEMBRE": 9, "SETIEMBRE": 9, "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12}


def sin_acentos(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def limpiar_espacios(s: str) -> str:
    """Corrige letras acentuadas separadas por la extracción ('REGI Ó N' → 'REGIÓN')."""
    s = re.sub(r"(?<=[A-ZÑ]) (?=[ÁÉÍÓÚ])", "", s)        # 'REGI Ó' → 'REGIÓ'
    s = re.sub(r"(?<=[ÁÉÍÓÚ]) (?=[A-ZÑ])", "", s)        # 'Ó N' → 'ÓN'
    s = re.sub(r"\bH ASTA\b", "HASTA", s)
    s = re.sub(r"\bDE L\b", "DEL", s)
    return re.sub(r"[ \t]+", " ", s)


def texto_pdf(datos: bytes) -> str:
    try:
        r = PdfReader(io.BytesIO(datos))
        return "\n".join((p.extract_text() or "") for p in r.pages[:4])
    except Exception as e:
        errores.append(f"pdf ilegible: {e}")
        return ""


def anio_emision(t: str, ref: datetime) -> tuple[int, datetime | None]:
    tt = sin_acentos(t.upper())
    m = re.search(r"EMITIDO:?\s*([\d ]{1,4})\s*(?:DE\s*)?([A-Z]+)\s*(?:DE\s*)?(\d{4})", tt)
    if m:
        dia = int(re.sub(r"\s", "", m.group(1)) or 1)
        mes = MESES_L.get(m.group(2)) or MESES.get(m.group(2)[:3])
        if mes:
            try:
                return int(m.group(3)), datetime(int(m.group(3)), mes, dia, tzinfo=TZ)
            except ValueError:
                pass
    return ref.year, None


def fecha_utc(mes_txt: str | None, dd: int, hh: int, mi: int, anio: int, emision: datetime | None, ref: datetime) -> datetime:
    mes = MESES.get((mes_txt or "")[:3]) if mes_txt else None
    base = emision or ref.astimezone(TZ)
    cand = []
    for a in (anio - 1, anio, anio + 1):
        for m in ([mes] if mes else [base.month - 1 or 12, base.month, base.month % 12 + 1]):
            try:
                cand.append(datetime(a, m, dd, hh, mi, tzinfo=UTC))
            except ValueError:
                pass
    return min(cand, key=lambda d: abs((d - base).total_seconds()))


def validez(t: str, ref: datetime):
    """Busca dos instantes UTC (desde, hasta) en el texto."""
    anio, emi = anio_emision(t, ref)
    tt = sin_acentos(t.upper())
    out = []
    # (OCT 051100 UTC)  /  (051300 UTC)  /  ( 04 0 3 00 HORA UTC)
    for m in re.finditer(r"\(([^()]{4,40}?UTC)\)", tt):
        s = re.sub(r"\s", "", m.group(1))
        mm = re.match(r"([A-Z]{3})?(\d{2})(\d{2})(\d{2})(?:HORA)?UTC", s)
        if mm:
            pre = tt[max(0, m.start() - 40):m.start()]
            mes = mm.group(1) or (re.findall(r"\b([A-Z]{3})\s*[\d ]{4,9}\s*HORA", pre) or [None])[-1]
            out.append(fecha_utc(mes, int(mm.group(2)), int(mm.group(3)), int(mm.group(4)), anio, emi, ref))
    if len(out) < 2:  # OCT 02 1500 HORA UTC
        out = []
        for m in re.finditer(r"\b([A-Z]{3})\s*(\d{2})\s*(\d{2})\s?(\d{2})\s*(?:HORA\s*)?UTC", tt):
            if m.group(1)[:3] in MESES:
                out.append(fecha_utc(m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), anio, emi, ref))
    if len(out) >= 2 and out[1] > out[0]:
        return out[0], out[1]
    return None


def codigo(t: str) -> str:
    tt = sin_acentos(t.upper())
    m = re.search(r"MET\s*\d{3}\s*[A-Z]{2}\s*[0-9A-Z]+\s*/\s*[0-9A-Z]+", tt)
    return re.sub(r"\s+", "", m.group(0)) if m else ""


def codigo_legible(c: str) -> str:
    m = re.match(r"(MET\d{3}[A-Z]{2})(.*)", c)
    return f"{m.group(1)} {m.group(2)}" if m else c


def seccion(t: str, ini: str, fin_pats: list[str]) -> str:
    tt = t
    i = re.search(ini, tt, re.I)
    if not i:
        return ""
    resto = tt[i.end():]
    fin = len(resto)
    for p in fin_pats:
        j = re.search(p, resto, re.I)
        if j: fin = min(fin, j.start())
    return resto[:fin].strip()


def resumen_corto(s: str, n=320) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + "…"


DIAS = r"(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)"


def leer_marejadas(t: str, ref: datetime, geo: Geo):
    """Avisos de marejadas: sectores con día de inicio (AM/PM) y día de término."""
    anio, emi = anio_emision(t, ref)
    tt = sin_acentos(t.upper())
    ini = seccion(tt, r"INICIO\s+MAREJADAS?\s*:", [r"\d\.\s*TERMINO", r"TERMINO\s+CONDICION"])
    fin = seccion(tt, r"TERMINO\s+CONDICION\s*:", [r"\d\.\s*HORARIOS", r"HORARIOS"])
    pat = re.compile(r"([A-Z][A-Z\.\s]+?)\s+" + DIAS + r"\s+(\d{1,2})\s+DE\s+([A-Z]+)(?:\s*\((AM|PM)\))?")

    def fecha_local(dd, mes_txt, hora):
        mes = MESES_L.get(mes_txt) or MESES.get(mes_txt[:3]) or ref.astimezone(TZ).month
        base = emi or ref.astimezone(TZ)
        cands = []
        for a in (anio - 1, anio, anio + 1):
            try: cands.append(datetime(a, mes, dd, hora, 0, tzinfo=TZ))
            except ValueError: pass
        return min(cands, key=lambda d: abs((d - base).total_seconds()))

    terminos = []
    for m in pat.finditer(fin):
        u = ubicar(m.group(1))
        terminos.append((m.group(1).strip(), u, fecha_local(int(m.group(3)), m.group(4), 0) + timedelta(days=1)))
    zonas = []
    for m in pat.finditer(ini):
        nombre = m.group(1).strip()
        u = ubicar(nombre)
        if not u:
            continue
        desde = fecha_local(int(m.group(3)), m.group(4), 12 if m.group(5) == "PM" else 0)
        # término: el sector de término que contiene a este sector
        hasta = None
        for tn, tu, tf in terminos:
            if not tu: continue
            if u[0] == "circulo" and tu[0] == "circulo" and compacto(tn)[:6] == compacto(nombre)[:6]:
                hasta = tf
            elif u[0] == "banda" and tu[0] == "banda":
                medio = (u[1][0] + u[1][1]) / 2
                if tu[1][0] - 0.05 <= medio <= tu[1][1] + 0.05:
                    hasta = tf
        if not hasta:
            continue
        nom = titulo(nombre)
        if u[0] == "circulo":
            z = geo.zona("circulo", centro=u[1], radio=0.6)
        else:
            z = geo.zona("franja", lat_n=u[1][0], lat_s=u[1][1])
        zonas.append({"nombre": nom, "desde": iso(desde), "hasta": iso(hasta),
                      "detalle": f"{m.group(2).title()} {m.group(3)}{' (' + m.group(5) + ')' if m.group(5) else ''} al fin del {hasta.astimezone(TZ) - timedelta(days=1):%d/%m}.", **z})
    res = seccion(tt, r"DIRECCION DEL OLEAJE\s*:", [r"\d\.\s*INICIO", r"INICIO"])
    res = resumen_corto(res.lower()) if res else ""
    return zonas, ("Oleaje del " + res) if res else ""


def leer_aviso_general(t: str, sector: str, ref: datetime, geo: Geo):
    """Avisos de mal tiempo, temporal o especiales: validez única y uno o varios sectores."""
    v = validez(t, ref)
    if not v:
        return [], ""
    desde, hasta = v
    tl = limpiar_espacios(t)
    pron = seccion(tl, r"C\.\s*-?\s*PRON[OÓ]STICO\s*:|C\.\s*-?\s*RECOMENDACIONES\s*:", [r"\bD\.\s*-"])
    sinop = seccion(tl, r"SITUACI[OÓ]N\s+SIN[OÓ]PTICA\s*:", [r"\bC\.\s*-", r"D[IÍ]A,\s*HORARIO"])
    zonas = []
    # Subsectores "SECTOR X A Y:" dentro del pronóstico
    partes = list(re.finditer(r"SECTOR\s+([A-ZÁÉÍÓÚÑ0-9\.\s]+?)\s*:", pron, re.I))
    for i, m in enumerate(partes):
        u = ubicar(m.group(1))
        if not u or u[0] != "banda": continue
        cuerpo = pron[m.end(): partes[i + 1].start() if i + 1 < len(partes) else len(pron)]
        zonas.append({"nombre": titulo(m.group(1)), "desde": iso(desde), "hasta": iso(hasta),
                      "detalle": resumen_corto(cuerpo, 260), **geo.zona("sector", lat_n=u[1][0], lat_s=u[1][1])})
    if not zonas:
        linea_a = seccion(tl, r"A\.\s*-?", [r"V[AÁ]LID", r"\bB\.\s*-"])
        u = ubicar(sector) or ubicar(linea_a)
        if u:
            g = geo.zona("circulo", centro=u[1], radio=1.0) if u[0] == "circulo" else geo.zona("sector", lat_n=u[1][0], lat_s=u[1][1])
            zonas.append({"nombre": sector, "desde": iso(desde), "hasta": iso(hasta), "detalle": resumen_corto(pron, 300), **g})
    return zonas, resumen_corto(("Situación sinóptica: " + sinop) if sinop else pron, 260)


def listar_portada(html: str):
    """Avisos de la portada: bloques <article> con subtítulo, descripción, fecha y enlace."""
    out = []
    for art in re.findall(r'<div class="alert__info">(.*?)</div>', html, re.S):
        tit = re.search(r'alert__subtitle">(.*?)<', art, re.S)
        des = re.search(r'alert__description">(.*?)<', art, re.S)
        fec = re.search(r'alert__date">(.*?)<', art, re.S)
        href = re.search(r'href="([^"]+)"', art)
        if tit and href:
            url = href.group(1) if href.group(1).startswith("http") else BASE_AVISOS + href.group(1)
            out.append({"sector": re.sub(r"\s+", " ", tit.group(1)).strip(), "tipo_portada": re.sub(r"\s+", " ", des.group(1)).strip() if des else "",
                        "publicado": fec.group(1).strip() if fec else "", "pagina": url})
    return out


def tipo_aviso(t: str, tipo_portada: str) -> str:
    """Primero la descripción de la portada; luego el encabezado del PDF. ('mar marejada' en un pronóstico no es un aviso de marejadas)."""
    tp = sin_acentos(tipo_portada.upper())
    tt = sin_acentos(t.upper())
    for clave, nombre in (("MAREJADA", "Aviso de marejadas"), ("TROMBA", "Aviso especial · trombas marinas"),
                          ("TEMPORAL", "Aviso de temporal"), ("MAL TIEMPO", "Aviso de mal tiempo")):
        if clave in tp:
            return nombre
    if re.search(r"AVISO\s+DE\s+MAREJADAS|INICIO\s+MAREJADAS", tt): return "Aviso de marejadas"
    if "TROMBA" in tt: return "Aviso especial · trombas marinas"
    if re.search(r"AVISO\s+DE\s+TEMPORAL", tt): return "Aviso de temporal"
    if re.search(r"AVISO\s+DE\s+MAL\s+TIEMPO", tt): return "Aviso de mal tiempo"
    return "Aviso meteorológico"


MENORES = {"de", "del", "la", "las", "los", "el", "a", "y", "hasta", "en"}


TILDES = {"archipielago": "archipiélago", "fernandez": "fernández", "region": "región", "rios": "ríos", "bahia": "bahía",
          "nuble": "ñuble", "valparaiso": "valparaíso", "constitucion": "constitución", "chanaral": "chañaral",
          "quellon": "quellón", "aysen": "aysén", "biobio": "biobío", "araucania": "araucanía", "tarapaca": "tarapacá",
          "felix": "félix", "gomez": "gómez", "ramirez": "ramírez", "oceanico": "oceánico", "oceanica": "oceánica"}


def titulo(s: str) -> str:
    pal = re.sub(r"\s+", " ", s).strip().lower().split(" ")
    pal = [TILDES.get(p, p) for p in pal]
    return " ".join(p if (i and p in MENORES) else p[:1].upper() + p[1:] for i, p in enumerate(pal))


def zonas_validas(zonas):
    return [z for z in zonas if z.get("areas") and z.get("geom", {}).get("coordinates")]


def recolectar_avisos(geo: Geo) -> bool:
    ref = ahora_utc()
    previo = {a["url"]: a for a in leer_json(DATA / "avisos.json", {}).get("avisos", [])}
    manual = leer_json(DATA / "avisos_manual.json", {})
    ignorar = set(manual.get("ignorar", []))
    corregir = manual.get("corregir", {})
    try:
        portada = listar_portada(get(URL_AVISOS).text)
    except Exception as e:
        errores.append(f"portada de avisos: {e}")
        print("ERROR portada:", e)
        return False
    print(f"Portada: {len(portada)} avisos listados")
    avisos = {}
    for p in portada:
        try:
            html = get(p["pagina"]).text
            pdfs = re.findall(r'href="([^"]*/meteo/site/docs/[^"]+?\.pdf)"', html, re.I)
            if not pdfs:
                raise ValueError("la página no tiene PDF")
            url = pdfs[0] if pdfs[0].startswith("http") else BASE_AVISOS + pdfs[0]
            if url in ignorar:
                continue
            sector = titulo(p["sector"])
            if url in previo and previo[url].get("_auto") and not previo[url].get("revisar") and os.environ.get("RELEER") != "1":
                avisos[url] = previo[url]; continue            # ya leído en una ejecución anterior
            t = texto_pdf(get(url).content)
            tipo = tipo_aviso(t, p["tipo_portada"])
            if tipo == "Aviso de marejadas":
                zonas, res = leer_marejadas(t, ref, geo)
                nota = "El aviso indica días (AM/PM); el inicio se toma a las 00:00 o 12:00 y el término al fin del día, hora Chile."
            else:
                zonas, res = leer_aviso_general(t, sector, ref, geo)
                nota = ""
            zonas = zonas_validas(zonas)
            a = {"tipo": tipo, "sector": sector, "codigo": codigo_legible(codigo(t)) or p["publicado"], "url": url, "pagina": p["pagina"],
                 "publicado": p["publicado"], "resumen": res, "nota": nota, "zonas": zonas, "_auto": True}
            if not zonas:
                a["revisar"] = True
                a["motivo"] = "No se pudo leer el PDF (posible imagen escaneada) o no trae fechas/sector reconocibles." if not t.strip() else "No se reconocieron fechas de validez o sectores."
            avisos[url] = a
            print(f"  {tipo} · {sector}: {len(zonas)} zona(s){' · REVISAR' if not zonas else ''}")
        except Exception as e:
            errores.append(f"aviso {p.get('pagina')}: {e}")
            print("  ERROR", p.get("pagina"), e)
            if p.get("pagina") in [v.get("pagina") for v in previo.values()]:
                for u, v in previo.items():
                    if v.get("pagina") == p["pagina"]: avisos[u] = v
    # Avisos que salieron de la portada pero siguen vigentes
    for u, v in previo.items():
        if u not in avisos and u not in ignorar and v.get("zonas"):
            avisos[u] = v
    # Correcciones manuales y avisos agregados a mano
    for u, c in corregir.items():
        if u in avisos:
            avisos[u] = aplicar_manual({**avisos[u], **c, "url": u}, geo)
    for a in manual.get("agregar", []):
        avisos[a["url"]] = aplicar_manual(a, geo)
    # Depuración de expirados
    limite = ref - timedelta(hours=CONSERVAR_H)
    final = []
    for a in avisos.values():
        fin = max((datetime.fromisoformat(z["hasta"].replace("Z", "+00:00")) for z in a.get("zonas", [])), default=None)
        if fin is None and not a.get("revisar"):
            continue
        if fin and fin < limite:
            continue
        final.append(a)
    final.sort(key=lambda a: -max([z.get("north", -90) for z in a.get("zonas", [])] or [-90]))
    escribir_json(DATA / "avisos.json", {"actualizado": iso(ref), "fuente": URL_AVISOS, "avisos": final}, compacto=True)
    print(f"Avisos: {len(final)} publicados")
    return True


def aplicar_manual(a: dict, geo: Geo) -> dict:
    """Las zonas manuales se escriben con forma + latitudes (o centro); aquí se calcula su geometría."""
    zonas = []
    for z in a.get("zonas", []):
        if "geom" in z and "forma" not in z:
            zonas.append(z); continue
        if z.get("forma") == "circulo":
            g = geo.zona("circulo", centro=z["centro"], radio=z.get("radio", 1.0))
        else:
            g = geo.zona(z.get("forma", "sector"), lat_n=z["lat_norte"], lat_s=z["lat_sur"])
        zonas.append({k: v for k, v in z.items() if k not in ("forma", "lat_norte", "lat_sur", "centro", "radio")} | g)
    out = {**a, "zonas": zonas, "manual": True}
    out.pop("revisar", None); out.pop("motivo", None)
    return out


def main():
    args = set(sys.argv[1:])
    t0 = time.time()
    ok_e = ok_a = None
    if "--solo-avisos" not in args:
        ok_e = recolectar_estaciones()
    if "--solo-estaciones" not in args:
        ok_a = recolectar_avisos(Geo())
    escribir_json(DATA / "estado.json", {"ejecucion": iso(ahora_utc()), "estaciones_ok": ok_e, "avisos_ok": ok_a,
                                         "errores": errores, "duracion_s": round(time.time() - t0, 1)})
    # El flujo no se marca como fallido por errores de las fuentes: el dashboard muestra el último dato bueno.
    return 0


if __name__ == "__main__":
    sys.exit(main())
