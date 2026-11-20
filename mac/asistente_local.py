#!/usr/bin/env python3
"""Asistente MeteoIA con IA local (Ollama), para el Mac de la casa.

El modelo de lenguaje NO calcula ni inventa el pronóstico: entiende la pregunta, llama a una de las
herramientas de abajo (que leen los mismos datos de MeteoIA y Open-Meteo) y redacta la respuesta con
esos números. Todo corre en este Mac; no usa la API pagada de Anthropic ni servicios de pago.

Herramientas
  condicion_punto   viento, racha, precipitación, visibilidad y oleaje en un lugar y día (0 a 5 días)
  avisos_vigentes   avisos vigentes y próximos de data/avisos.json que cubren un lugar (o todos)
  pronostico_bahia  pronóstico WRF + IA de una bahía (data/wrf_ia.json)
  comparar_rutas    condiciones previstas a lo largo de cada alternativa de las rutas tipo del módulo Ruta

Uso
  python3 asistente_local.py                       servidor web en http://127.0.0.1:8765
  python3 asistente_local.py --pregunta "…"        una pregunta por la terminal
  python3 asistente_local.py --probar              prueba las herramientas sin el modelo

Variables: MN_MODELO (qwen3:4b), MN_HOSTS (127.0.0.1), MN_PUERTO (8765), MN_OLLAMA (http://127.0.0.1:11434).
Solo biblioteca estándar de Python 3.9+.
"""
import json, math, os, re, ssl, sys, threading, time, unicodedata, difflib, urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("America/Santiago")
except Exception:  # pragma: no cover
    TZ = timezone(timedelta(hours=-3))

MODELO = os.environ.get("MN_MODELO", "qwen3:4b-instruct-2507-q4_K_M")
OLLAMA = os.environ.get("MN_OLLAMA", "http://127.0.0.1:11434").rstrip("/")
PUERTO = int(os.environ.get("MN_PUERTO", "8765"))
HOSTS = [h.strip() for h in os.environ.get("MN_HOSTS", "127.0.0.1").split(",") if h.strip()]
RAW = "https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/"
SITIO = os.environ.get("MN_SITIO", "https://meteoia.cl/").rstrip("/") + "/"   # datos vivos (GitHub Pages)
ORIGENES = {"https://meteoia.cl", "https://www.meteoia.cl", "https://feliperifo-a11y.github.io"}
HORIZONTE_DIAS = 5          # el sitio publica viento y oleaje de 0 a 120 h
MAX_RONDAS = 4              # llamadas a herramientas por pregunta
VERSION = "1.6"
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


# ------------------------------------------------------------------ red y caché
def _contexto_ssl():
    # El Python de python.org en macOS no trae certificados si no se corrió "Install Certificates".
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    for f in ("/etc/ssl/cert.pem", "/private/etc/ssl/cert.pem"):
        if os.path.exists(f):
            return ssl.create_default_context(cafile=f)
    return ssl.create_default_context()


SSL = _contexto_ssl()
_cache, _cache_lock = {}, threading.Lock()


def obtener(url, ttl=600, json_=True, timeout=30):
    ahora = time.time()
    with _cache_lock:
        if url in _cache and ahora - _cache[url][0] < ttl:
            return _cache[url][1]
    req = urllib.request.Request(url, headers={"User-Agent": "MeteoIA-asistente-local/" + VERSION})
    with urllib.request.urlopen(req, timeout=timeout, context=SSL) as r:
        crudo = r.read().decode("utf-8")
    dato = json.loads(crudo) if json_ else crudo
    with _cache_lock:
        _cache[url] = (ahora, dato)
    return dato


def dato(nombre, ttl=600):
    """data/<nombre> publicado en el sitio (vivo); si no responde, la copia del repositorio."""
    try:
        return obtener(SITIO + "data/" + nombre, ttl=ttl)
    except Exception:
        return obtener(RAW + "data/" + nombre, ttl=ttl)


def open_meteo(base, params, ttl=900):
    return obtener(base + "?" + urllib.parse.urlencode(params, safe=","), ttl=ttl)


# ------------------------------------------------------------------ utilidades
# Formas cortas o navales de nombrar lugares (se amplía con las preguntas reales de los usuarios)
ALIAS = [(r"\bvalpo\b", "valparaiso"), (r"\bthno\b", "talcahuano"), (r"\b(pmo|pto montt)\b", "puerto montt"),
         (r"\bpta arenas\b", "punta arenas"), (r"\bantofa\b", "antofagasta"), (r"\biqq\b", "iquique"),
         (r"\bsan anto\b", "san antonio"), (r"\b(juan fernandez|archipielago juan fernandez)\b", "robinson crusoe"),
         (r"\b(rapa nui|isla de pascua|pascua)\b", "isla pascua"), (r"\b(pto|pta)\b", lambda m: "puerto" if m.group(1) == "pto" else "punta")]


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    for pat, rep in ALIAS:
        s = re.sub(pat, rep, s)
    s = re.sub(r"\b(cp|bahia de|bahia|puerto|caleta|de|del|la|el|los|las)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def similitud(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    r = difflib.SequenceMatcher(None, a, b).ratio()
    if a in b.split() or (len(a) >= 4 and (b.startswith(a) or a.startswith(b))):
        r = max(r, 0.9)
    return r


def gm(lat, lon):
    """Coordenadas en grados y minutos."""
    def f(v, p, n):
        h = p if v >= 0 else n
        v = abs(v)
        g = int(v)
        m = (v - g) * 60
        return f"{g}°{m:04.1f}' {h}".replace(".", ",")
    return f"{f(lat, 'N', 'S')} {f(lon, 'E', 'W')}"


def escala_armada(h):
    if h is None:
        return None
    for lim, n in ((0.5, "rizada"), (1.25, "marejadilla"), (2.5, "marejada"), (4, "gruesa"), (6, "muy gruesa")):
        if h < lim:
            return n
    return "superior a muy gruesa (> 6 m)"


ROSA = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def rumbo(grados):
    g = [x for x in grados if x is not None]
    if not g:
        return None
    s = sum(math.sin(math.radians(x)) for x in g)
    c = sum(math.cos(math.radians(x)) for x in g)
    d = (math.degrees(math.atan2(s, c)) + 360) % 360
    return ROSA[int((d + 22.5) // 45) % 8]


def rango(v, dec=0):
    v = [x for x in v if x is not None]
    if not v:
        return None
    a, b = min(v), max(v)
    fmt = (lambda x: f"{x:.{dec}f}".replace(".", ","))
    return fmt(a) if round(a, dec) == round(b, dec) else f"{fmt(a)}/{fmt(b)}"


def millas(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 3440.065 * math.asin(math.sqrt(h))


def ahora_local():
    return datetime.now(TZ)


def hora_local(iso_utc):
    try:
        return datetime.fromisoformat(iso_utc.replace("Z", "+00:00")).astimezone(TZ).strftime("%d/%m %H:%M")
    except Exception:
        return iso_utc


def _dia_hora(t):
    return f"{DIAS[t.weekday()]} {t:%d/%m %H:%M}"


def _titulo(x):
    return re.sub(r"\b(De|Del|La|Las|Los|El|Y)\b", lambda m: m.group(1).lower(), str(x).strip().title())


def _a_lista(r):
    return r if isinstance(r, list) else [r]


# ------------------------------------------------------------------ nomenclátor (lugares del Derrotero, estaciones y rutas)
_lugares = {"t": 0, "l": []}


def lugares():
    if time.time() - _lugares["t"] < 3600 and _lugares["l"]:
        return _lugares["l"]
    l = []
    try:
        for x in dato("derrotero_lugares.json", ttl=86400).get("lugares", []):
            l.append((x[0], x[1], x[2], "Derrotero de la Costa de Chile (SHOA)"))
    except Exception:
        pass
    try:
        for e in dato("estaciones.json", ttl=3600).get("datos", []):
            if e.get("latitud") is not None:
                l.append((e["nombre"], e["latitud"], e["longitud"], "Estación costera DIRECTEMAR"))
    except Exception:
        pass
    try:
        for r in rutas_tipo():
            a = r["nombre"].split(" – ")
            t = r["alternativas"][0]["traza"]
            if len(a) == 2:
                l.append((a[0], t[0][0], t[0][1], "Rutas tipo MeteoIA"))
                l.append((a[1], t[-1][0], t[-1][1], "Rutas tipo MeteoIA"))
            for alt in r["alternativas"]:   # golfos, canales, pasos y cabos con posición (hitos de las rutas tipo)
                for h in alt.get("hitos", []):
                    if not h[0].lower().startswith("frente a"):
                        l.append((h[0], h[1], h[2], "Hitos de las rutas tipo (Derrotero)"))
    except Exception:
        pass
    _lugares.update(t=time.time(), l=l)
    return l


def resolver(lugar=None, lat=None, lon=None):
    """Devuelve (nombre, lat, lon, fuente) o lanza ValueError con sugerencias."""
    if lat is not None and lon is not None:
        lat, lon = float(lat), float(lon)
        if lon > 0 and lat < 0:      # el modelo a veces omite el signo de la longitud W
            lon = -lon
        if not (-70 <= lat <= -10 and -120 <= lon <= -50):
            raise ValueError("La posición está fuera del área de MeteoIA (METAREA XV y Antártica).")
        return (lugar or gm(lat, lon), lat, lon, "posición indicada")
    if not lugar:
        raise ValueError("Falta el lugar o la posición.")
    m = re.match(r"^\s*(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)\s*$", str(lugar))
    if m:
        return resolver(None, m.group(1).replace(",", "."), m.group(2).replace(",", "."))
    cand = sorted(((similitud(lugar, n), n, la, lo, f) for n, la, lo, f in lugares()), key=lambda x: -x[0])
    if not cand or cand[0][0] < 0.72:
        sug = ", ".join(c[1] for c in cand[:5])
        raise ValueError(f"No encontré \"{lugar}\" en el nomenclátor. Parecidos: {sug}. Pida al usuario un nombre o la posición.")
    _, n, la, lo, f = cand[0]
    return (n, la, lo, f)


# ------------------------------------------------------------------ herramienta 1: condición en un punto
PERIODOS = (("madrugada", 0, 6), ("mañana", 6, 12), ("tarde", 12, 18), ("noche", 18, 24))


def _fecha(fecha=None, dias=None):
    hoy = ahora_local().date()
    if fecha:
        f = datetime.strptime(str(fecha)[:10], "%Y-%m-%d").date()
    else:
        f = hoy + timedelta(days=int(dias or 0))
    d = (f - hoy).days
    if d < 0:
        raise ValueError("La fecha ya pasó; solo hay pronóstico desde hoy.")
    if d > HORIZONTE_DIAS:
        raise ValueError(f"Fuera del horizonte: MeteoIA publica pronóstico hasta {HORIZONTE_DIAS} días (120 h).")
    return f


def _var(h, nombre, i):
    for suf in ("_ecmwf_ifs", "_gfs_global", ""):
        v = h.get(nombre + suf)
        if v is not None and i < len(v) and v[i] is not None:
            return v[i], suf
    return None, None


def condicion_punto(lugar=None, lat=None, lon=None, fecha=None, dias=None):
    n, la, lo, fuente_lugar = resolver(lugar, lat, lon)
    f = _fecha(fecha, dias)
    comun = {"latitude": f"{la:.3f}", "longitude": f"{lo:.3f}", "timezone": "America/Santiago",
             "start_date": f.isoformat(), "end_date": f.isoformat()}
    atm = open_meteo("https://api.open-meteo.com/v1/forecast", dict(comun,
          hourly="wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,visibility,pressure_msl",
          models="ecmwf_ifs,gfs_global", wind_speed_unit="kn"))
    try:
        mar = open_meteo("https://marine-api.open-meteo.com/v1/marine", dict(comun,
              hourly="wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_direction",
              cell_selection="sea"))
    except Exception:
        mar = {}
    ha, hm = atm.get("hourly", {}), mar.get("hourly", {})
    horas = ha.get("time", [])
    modelos_usados = set()
    periodos = []
    for nom, h0, h1 in PERIODOS:
        idx = [i for i, t in enumerate(horas) if h0 <= int(t[11:13]) < h1]
        if not idx:
            continue
        val = {k: [] for k in ("v", "d", "r", "p", "vis", "pr")}
        for i in idx:
            for k, var in (("v", "wind_speed_10m"), ("d", "wind_direction_10m"), ("r", "wind_gusts_10m"),
                           ("p", "precipitation"), ("vis", "visibility"), ("pr", "pressure_msl")):
                x, suf = _var(ha, var, i)
                val[k].append(x)
                if suf and k == "v":
                    modelos_usados.add("ECMWF IFS" if suf == "_ecmwf_ifs" else "GFS")
        ola = [hm.get("wave_height", [None] * 24)[i] for i in idx] if hm else []
        per = [hm.get("wave_period", [None] * 24)[i] for i in idx] if hm else []
        dol = [hm.get("wave_direction", [None] * 24)[i] for i in idx] if hm else []
        fondo = [hm.get("swell_wave_height", [None] * 24)[i] for i in idx] if hm else []
        dfo = [hm.get("swell_wave_direction", [None] * 24)[i] for i in idx] if hm else []
        omax = max([x for x in ola if x is not None], default=None)
        vis = [x for x in val["vis"] if x is not None]
        periodos.append({
            "periodo": f"{nom} ({h0:02d}-{h1:02d} h)",
            "viento_kt": (f"{rumbo(val['d'])} {rango(val['v'])} kt" if rango(val["v"]) else "sin dato"),
            "racha_max_kt": round(max([x for x in val["r"] if x is not None], default=0)) or None,
            "precipitacion_mm": round(sum(x for x in val["p"] if x is not None), 1),
            "visibilidad_min_km": round(min(vis) / 1000, 1) if vis else None,
            "presion_hpa": rango(val["pr"]),
            "oleaje_m": (f"{rango(ola, 1)} m del {rumbo(dol)}, período {rango(per)} s" if omax is not None else "sin dato (aguas interiores o costa)"),
            "estado_del_mar": escala_armada(omax),
            "mar_de_fondo_m": (f"{rango(fondo, 1)} m del {rumbo(dfo)}" if any(x is not None for x in fondo) else None),
        })
    if not periodos:
        raise ValueError("Open-Meteo no entregó datos para esa fecha.")
    dia = f"{DIAS[f.weekday()]} {f:%d/%m}"
    lineas = []
    for p in periodos:
        t = f"{p['periodo'].split(' (')[0].capitalize()}: viento {p['viento_kt']}"
        if p["racha_max_kt"]:
            t += f", racha hasta {p['racha_max_kt']} kt"
        if p["estado_del_mar"]:
            t += f"; mar {p['estado_del_mar']}, oleaje {p['oleaje_m']}"
        if p["precipitacion_mm"]:
            t += f"; lluvia {str(p['precipitacion_mm']).replace('.', ',')} mm"
        if p["visibilidad_min_km"] is not None and p["visibilidad_min_km"] < 5:
            t += f"; visibilidad mínima {str(p['visibilidad_min_km']).replace('.', ',')} km"
        lineas.append(t + ".")
    nombre = (_titulo(lugar) if lugar and not re.match(r"^\s*-?\d", str(lugar)) else n)
    resumen = f"Pronóstico para {nombre}, {dia} (un solo día, hora local):\n" + "\n".join(lineas)
    return {"resumen": resumen,
        "lugar": n, "posicion": gm(la, lo), "referencia_lugar": fuente_lugar, "_pos": [n, la, lo],
        "fecha": f"{DIAS[f.weekday()]} {f:%d/%m/%Y}", "hora": "local de Chile",
        "periodos": periodos,
        "fuente": f"Open-Meteo: viento {' y '.join(sorted(modelos_usados)) or 'ECMWF IFS/GFS'}; oleaje del modelo marino de Open-Meteo",
        "consultado": ahora_local().strftime("%d/%m/%Y %H:%M"),
        "nota": "Estado del mar según escala de la Armada. Valores de modelo, no observaciones.",
    }


# ------------------------------------------------------------------ herramienta 2: avisos
def _en_anillo(lat, lon, anillo):
    dentro, j = False, len(anillo) - 1
    for i in range(len(anillo)):
        xi, yi = anillo[i][0], anillo[i][1]
        xj, yj = anillo[j][0], anillo[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
            dentro = not dentro
        j = i
    return dentro


def _dist_grados(lat, lon, anillo):
    best = 9e9
    for (x1, y1), (x2, y2) in zip(anillo, anillo[1:]):
        dx, dy = x2 - x1, y2 - y1
        t = max(0, min(1, ((lon - x1) * dx + (lat - y1) * dy) / ((dx * dx + dy * dy) or 1e-12)))
        px, py = x1 + t * dx, y1 + t * dy
        best = min(best, math.hypot((lon - px) * math.cos(math.radians(lat)), lat - py))
    return best


def cubre(geom, lat, lon, tol=0.12):
    """Punto dentro del polígono del aviso o a menos de ~7 M de su borde (los lugares del Derrotero están en la costa)."""
    if not geom:
        return False
    polis = geom["coordinates"] if geom.get("type") == "MultiPolygon" else [geom.get("coordinates", [])]
    for p in polis:
        if p and _en_anillo(lat, lon, p[0]) and not any(_en_anillo(lat, lon, h) for h in p[1:]):
            return True
    return any(p and _dist_grados(lat, lon, p[0]) <= tol for p in polis)


def _avisos_crudos():
    return dato("avisos.json", ttl=600)


def _estado(z, ahora):
    try:
        d = datetime.fromisoformat(z["desde"].replace("Z", "+00:00")) if z.get("desde") else None
        h = datetime.fromisoformat(z["hasta"].replace("Z", "+00:00")) if z.get("hasta") else None
    except Exception:
        return "vigente"
    if h and h < ahora:
        return None
    if d and d > ahora:
        return "próximo"
    return "vigente"


def avisos_vigentes(lugar=None, lat=None, lon=None):
    datos = _avisos_crudos()
    ahora = datetime.now(timezone.utc)
    punto = None
    if lugar or (lat is not None and lon is not None):
        punto = resolver(lugar, lat, lon)
    salida = []
    for a in datos.get("avisos", []):
        for z in a.get("zonas", []) or [{}]:
            est = _estado(z, ahora)
            if not est:
                continue
            if punto and not cubre(z.get("geom"), punto[1], punto[2]):
                continue
            salida.append({"estado": est, "tipo": a.get("tipo"), "codigo": a.get("codigo"),
                           "zona": z.get("nombre") or a.get("sector"),
                           "desde": hora_local(z.get("desde", "")) if z.get("desde") else None,
                           "hasta": hora_local(z.get("hasta", "")) if z.get("hasta") else None,
                           "detalle": z.get("detalle"), "resumen": a.get("resumen"),
                           "publicado": a.get("publicado")})
    vig = [a for a in salida if a["estado"] == "vigente"][:8]
    prox = [a for a in salida if a["estado"] == "próximo"][:8]
    lugar_txt = (_titulo(lugar) if lugar and not re.match(r"^\s*-?\d", str(lugar)) else punto[0]) if punto else "el litoral"
    def linea(a):
        return f"{a['tipo']} {a['codigo'] or ''}, {a['zona']}, desde {a['desde'] or '–'} hasta {a['hasta'] or '–'}".replace("  ", " ")
    partes = [f"Vigentes ahora en {lugar_txt}: " + ("; ".join(linea(a) for a in vig) if vig else "ninguno") + "."]
    if prox:
        partes.append("Próximos (aún no comienzan): " + "; ".join(linea(a) for a in prox) + ".")
    return {"lugar": f"{punto[0]} ({gm(punto[1], punto[2])})" if punto else "todo el litoral",
            "resumen": " ".join(partes),
            "vigentes_ahora": vig, "proximos": prox, "_pos": [punto[0], punto[1], punto[2]] if punto else None,
            "fuente": datos.get("fuente") or "Avisos del Servicio Meteorológico de la Armada (meteoarmada.directemar.cl), leídos por MeteoIA",
            "actualizado": hora_local(datos.get("actualizado", "")),
            "nota": "Horas locales de Chile. El aviso oficial es el publicado por DIRECTEMAR."}


# ------------------------------------------------------------------ herramienta 3: pronóstico WRF + IA de bahía
def pronostico_bahia(bahia):
    w = dato("wrf_ia.json", ttl=1800)
    bs = w.get("bahias", [])
    cand = sorted(((similitud(bahia, b["nombre"]), b) for b in bs), key=lambda x: -x[0])
    if not cand or cand[0][0] < 0.72:
        raise ValueError("No hay pronóstico WRF + IA para esa bahía. Disponibles: " + ", ".join(b["nombre"] for b in bs))
    b = cand[0][1]
    p = b.get("pronostico") or {}
    return {"bahia": b["nombre"], "zona": b.get("zona"), "resolucion_wrf": b.get("resolucion"),
            "inicializacion_utc": p.get("inicializacion_utc"),
            "situacion_sinoptica": p.get("situacion_sinoptica"),
            "dias": p.get("dias", [])[:4],
            "fuente": "Meteograma WRF del Servicio Meteorológico de la Armada, redactado por IA en MeteoIA (página WRF + IA)",
            "actualizado": hora_local(w.get("actualizado", ""))}


# ------------------------------------------------------------------ herramienta 4: rutas tipo
def rutas_tipo():
    js = obtener(RAW + "build/rutas_tipo.js", ttl=86400, json_=False)
    m = re.search(r"const RUTAS_TIPO\s*=\s*(\[.*?\]);\s*(?:\n|$)", js, re.S)
    return json.loads(m.group(1)) if m else []


def _pasos():
    js = obtener(RAW + "build/rutas_tipo.js", ttl=86400, json_=False)
    m = re.search(r"const RUTA_PASOS\s*=\s*(\{.*?\});\s*\n", js, re.S)
    return json.loads(m.group(1)) if m else {}


def _buscar_ruta(zarpe, recalada):
    mejor = (0, None, False)
    for r in rutas_tipo():
        a = r["nombre"].split(" – ")
        if len(a) != 2:
            continue
        s1 = min(similitud(zarpe, a[0]), similitud(recalada, a[1]))
        s2 = min(similitud(zarpe, a[1]), similitud(recalada, a[0]))
        if max(s1, s2) > mejor[0]:
            mejor = (max(s1, s2), r, s2 > s1)
    return mejor


UMB = {"vientoA": 22, "vientoR": 34, "olaA": 2.5, "olaR": 4}   # umbrales base del módulo Ruta (RUTA_UMBRALES_BASE, build/ruta.js)
MARGEN_COSTA = 5   # mn, el mismo margen por defecto del módulo Ruta
_geo = {"t": 0, "costa": None, "puertos": []}
_rutas_cache = {}


def _geo_cargar():
    """Costa incorporada y puertos SITPORT del módulo Ruta (mismos datos que la página)."""
    if _geo["costa"] and time.time() - _geo["t"] < 86400:
        return _geo
    import ruta_mar
    land = obtener(RAW + "data/geo/land.json", ttl=86400)
    js = obtener(RAW + "build/ruta.js", ttl=86400, json_=False)
    pl = obtener(RAW + "build/plantilla.html", ttl=86400, json_=False)
    lista = json.loads(re.search(r"const RUTA_PUERTOS = (\[.*?\]);", js).group(1))
    pos = json.loads(re.sub(r"([{,])(\d+):", r'\1"\2":', re.search(r"const BAHIA_POS = (\{.*?\});", pl).group(1)))
    _geo.update(t=time.time(), costa=ruta_mar.Costa(land),
                puertos=[(n, pos[str(i)][0], pos[str(i)][1]) for i, n in lista if str(i) in pos])
    return _geo


def _punto_ruta(nombre):
    """Puerto SITPORT por nombre; si no, un lugar del Derrotero o una posición."""
    g = _geo_cargar()
    cand = sorted(((similitud(nombre, n), n, la, lo) for n, la, lo in g["puertos"]), key=lambda x: -x[0])
    if cand and cand[0][0] >= 0.72:
        return cand[0][1], cand[0][2], cand[0][3]
    n, la, lo, _ = resolver(nombre)
    return n, la, lo


def _referencia(p, cache):
    """Nombre del lugar del Derrotero más cercano a un punto de la traza (o su posición)."""
    k = (round(p[0], 2), round(p[1], 2))
    if k not in cache:
        cerca = [(millas(p, (la, lo)), n) for n, la, lo, f in lugares() if f.startswith("Derrotero") and abs(la - p[0]) < 0.6]
        d, n = min(cerca) if cerca else (999, "")
        cache[k] = f"frente a {n}" if d <= 25 else gm(p[0], p[1])
    return cache[k]


def comparar_rutas(zarpe, recalada, velocidad_kt=10, salida=None):
    vel = float(velocidad_kt or 10)
    if not 2 <= vel <= 40:
        raise ValueError("Velocidad fuera de rango (2 a 40 kt).")
    score, ruta, inv = _buscar_ruta(zarpe, recalada)
    if ruta and score >= 0.72:   # ruta tipo con alternativas trazadas con el Derrotero
        alternativas = [{"nombre": a["nombre"], "descripcion": a.get("resumen"),
                         "traza": list(reversed(a["traza"])) if inv else a["traza"],
                         "hitos": a.get("hitos", []), "pasos": a.get("pasos", [])} for a in ruta["alternativas"]]
        nombre_ruta = ruta["nombre"] + (" (sentido inverso)" if inv else "")
        fuente_traza = ruta.get("fuente", "rutas tipo MeteoIA")
    else:                        # cualquier otro par: ruta por mar calculada, como el módulo Ruta de la página
        import ruta_mar
        za, zb = _punto_ruta(zarpe), _punto_ruta(recalada)
        costa = _geo_cargar()["costa"]
        a, b = ruta_mar.al_mar(costa, za[1:]), ruta_mar.al_mar(costa, zb[1:])
        clave = (round(a[0], 3), round(a[1], 3), round(b[0], 3), round(b[1], 3))
        if clave not in _rutas_cache:
            _rutas_cache[clave] = ruta_mar.por_mar(costa, a, b, MARGEN_COSTA)
        traza = _rutas_cache[clave]
        if not traza:
            raise ValueError(f"No encontré paso por mar entre {za[0]} y {zb[0]} con la costa incorporada.")
        alternativas = [{"nombre": "Ruta por mar calculada", "traza": traza, "hitos": [], "pasos": [],
                         "descripcion": f"Evita la tierra y se mantiene a {MARGEN_COSTA} mn o más de la costa, salvo al salir y al llegar"}]
        nombre_ruta = f"{za[0]} – {zb[0]}"
        fuente_traza = "ruta por mar calculada con la costa incorporada de MeteoIA (mismo método del módulo Ruta)."
    if salida:
        try:
            t0 = datetime.strptime(str(salida)[:16].replace("T", " "), "%Y-%m-%d %H:%M").replace(tzinfo=TZ)
        except ValueError:
            t0 = datetime.strptime(str(salida)[:10], "%Y-%m-%d").replace(hour=8, tzinfo=TZ)
    else:
        t0 = ahora_local().replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    limite = ahora_local() + timedelta(days=HORIZONTE_DIAS)
    pasos = _pasos()
    try:
        av = _avisos_crudos().get("avisos", [])
    except Exception:
        av = []
    refs = {}

    # 1. muestras a lo largo de cada alternativa (cada ~3 h de navegación, máximo 16 por alternativa)
    alts, todos = [], []
    for alt in alternativas:
        tr = alt["traza"]
        acum = [0.0]
        for p1, p2 in zip(tr, tr[1:]):
            acum.append(acum[-1] + millas(p1, p2))
        total = acum[-1]
        paso_mn = max(vel * 3, total / 15)
        objetivos = [min(total, k * paso_mn) for k in range(int(total // paso_mn) + 1)] + [total]
        hitos = alt.get("hitos") or []
        mu, j = [], 0
        for d in objetivos:
            while j < len(acum) - 2 and acum[j + 1] < d:
                j += 1
            seg = acum[j + 1] - acum[j] if j + 1 < len(acum) else 0   # posición interpolada dentro del tramo
            f = min(1, max(0, (d - acum[j]) / seg)) if seg else 0
            p = [tr[j][0] + (tr[j + 1][0] - tr[j][0]) * f, tr[j][1] + (tr[j + 1][1] - tr[j][1]) * f] if seg else tr[j]
            eta = (t0 + timedelta(hours=d / vel, minutes=30)).replace(minute=0, second=0, microsecond=0)
            cerca = min(hitos, key=lambda h: millas(p, (h[1], h[2])))[0] if hitos else _referencia(p, refs)
            mu.append({"p": p, "eta": eta, "d": d, "ref": cerca})
        alts.append((alt, total, mu))
        todos.extend(m for m in mu if m["eta"] <= limite)

    # 2. Open-Meteo en lote (una consulta atmosférica y una marina para todos los puntos)
    if todos:
        uniq = list({(round(m["p"][0], 2), round(m["p"][1], 2)) for m in todos})
        f1 = min(m["eta"] for m in todos).date().isoformat()
        f2 = max(m["eta"] for m in todos).date().isoformat()
        comun = {"latitude": ",".join(f"{u[0]}" for u in uniq), "longitude": ",".join(f"{u[1]}" for u in uniq),
                 "timezone": "America/Santiago", "start_date": f1, "end_date": f2}
        atm = _a_lista(open_meteo("https://api.open-meteo.com/v1/forecast", dict(comun,
                       hourly="wind_speed_10m,wind_direction_10m,wind_gusts_10m", models="ecmwf_ifs", wind_speed_unit="kn")))
        try:
            mar = _a_lista(open_meteo("https://marine-api.open-meteo.com/v1/marine", dict(comun,
                           hourly="wave_height,wave_direction", cell_selection="sea")))
        except Exception:
            mar = [{}] * len(uniq)
        pos = {u: k for k, u in enumerate(uniq)}
        for m in todos:
            k = pos[(round(m["p"][0], 2), round(m["p"][1], 2))]
            clave = m["eta"].strftime("%Y-%m-%dT%H:00")
            ha, hm = atm[k].get("hourly", {}), (mar[k] or {}).get("hourly", {})
            i = ha.get("time", []).index(clave) if clave in ha.get("time", []) else None
            im = hm.get("time", []).index(clave) if clave in hm.get("time", []) else None
            m["v"], m["dir"], m["r"] = ((_var(ha, v, i)[0] for v in ("wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"))
                                        if i is not None else (None, None, None))
            m["ola"] = _var(hm, "wave_height", im)[0] if im is not None else None

    # 3. resumen por alternativa, con los umbrales y el puntaje del módulo Ruta (menor es mejor)
    res = []
    for alt, total, mu in alts:
        con = [m for m in mu if m.get("v") is not None or m.get("ola") is not None]
        olas = [m for m in con if m.get("ola") is not None]
        vien = [m for m in con if m.get("v") is not None]
        mo = max(olas, key=lambda m: m["ola"]) if olas else None
        mv = max(vien, key=lambda m: m["v"]) if vien else None
        rojo = sum(1 for m in con if (m.get("v") or 0) >= UMB["vientoR"] or (m.get("ola") or 0) >= UMB["olaR"])
        amar = sum(1 for m in con if (m.get("v") or 0) >= UMB["vientoA"] or (m.get("ola") or 0) >= UMB["olaA"]) - rojo
        restric = []
        for pid in alt.get("pasos", []):
            p = pasos.get(pid, {})
            if p.get("velMin") and vel < p["velMin"]:
                restric.append(f"{p.get('n')}: naves de menos de {p['velMin']} kt deben cruzarlo con corriente a favor ({p.get('ref')})")
        av_ruta = set()
        for m in mu:
            for a_ in av:
                for z in a_.get("zonas", []):
                    if _estado(z, m["eta"].astimezone(timezone.utc)) == "vigente" and cubre(z.get("geom"), m["p"][0], m["p"][1], tol=0.05):
                        av_ruta.add(f"{a_.get('tipo')} {a_.get('codigo') or ''} ({z.get('nombre')})".replace("  ", " "))
        res.append({
            "alternativa": alt["nombre"], "descripcion": alt.get("descripcion"),
            "distancia_mn": round(total), "duracion_h": round(total / vel, 1),
            "llegada_estimada": _dia_hora(t0 + timedelta(hours=total / vel)),
            "ola_max": (f"{mo['ola']:.1f} m ({escala_armada(mo['ola'])}) el {mo['eta']:%d/%m %H:%M}, {mo['ref']}".replace(".", ",", 1) if mo else "sin dato de oleaje en la traza"),
            "viento_max": (f"{rumbo([mv['dir']])} {round(mv['v'])} kt, racha {round(mv['r'] or mv['v'])} kt, el {mv['eta']:%d/%m %H:%M}, {mv['ref']}" if mv else "sin dato"),
            "puntos_restrictivos": rojo, "puntos_limitantes": amar, "puntos_revisados": len(con),
            "tramo_sin_pronostico": any(m["eta"] > limite for m in mu),
            "avisos_en_la_traza": sorted(av_ruta)[:5],
            "restricciones_por_velocidad": restric,
            "_puntaje": rojo * 1000 + amar * 100 + len(av_ruta) * 150 + total / vel,
        })
    if len(res) > 1:
        min(res, key=lambda x: x["_puntaje"])["recomendada"] = True

    # texto listo para el usuario
    lineas = [f"Ruta {nombre_ruta}: zarpe {_dia_hora(t0)} a {str(vel).rstrip('0').rstrip('.').replace('.', ',')} kt (hora local)."]
    for x in sorted(res, key=lambda x: x["_puntaje"]):
        t = (f"\n{x['alternativa']}{' (recomendada)' if x.get('recomendada') else ''}: {x['distancia_mn']} mn, "
             f"{str(x['duracion_h']).replace('.', ',')} h, llegada {x['llegada_estimada']}.")
        t += f"\n  Ola máxima {x['ola_max']}. Viento máximo {x['viento_max']}."
        if x["puntos_revisados"]:
            t += (f"\n  Puntos sobre umbral: {x['puntos_restrictivos']} restrictivos y {x['puntos_limitantes']} limitantes "
                  f"de {x['puntos_revisados']} revisados.")
        if x["avisos_en_la_traza"]:
            t += "\n  Avisos vigentes en la traza: " + "; ".join(x["avisos_en_la_traza"]) + "."
        for r_ in x["restricciones_por_velocidad"]:
            t += f"\n  Restricción: {r_}."
        if x["tramo_sin_pronostico"]:
            t += f"\n  Parte del trayecto queda fuera del horizonte de pronóstico ({HORIZONTE_DIAS} días)."
        lineas.append(t)
    lineas.append(f"\nUmbrales del módulo Ruta: viento {UMB['vientoA']}/{UMB['vientoR']} kt y ola "
                  f"{str(UMB['olaA']).replace('.', ',')}/{UMB['olaR']} m (limitante/restrictivo).")
    for x in res:
        x.pop("_puntaje", None)
    return {"resumen": "\n".join(lineas),
            "ruta": nombre_ruta, "zarpe": _dia_hora(t0), "velocidad_kt": vel, "alternativas": res,
            "fuente": "Trazas: " + fuente_traza + " Pronóstico: Open-Meteo (viento ECMWF IFS; oleaje modelo marino).",
            "nota": "Trazas referenciales: no reemplazan la carta náutica ni el Derrotero. Muestreo cada ~3 h de navegación."}


# ------------------------------------------------------------------ herramienta 5: tendencia de 5 días en un punto
BLOQUES = (("madrugada", 0), ("mañana", 6), ("tarde", 12), ("noche", 18))
ORDEN_MAR = ["rizada", "marejadilla", "marejada", "gruesa", "muy gruesa", "superior a muy gruesa (> 6 m)"]


def tendencia_punto(lugar=None, lat=None, lon=None):
    n, la, lo, fuente_lugar = resolver(lugar, lat, lon)
    hoy = ahora_local().date()
    comun = {"latitude": f"{la:.3f}", "longitude": f"{lo:.3f}", "timezone": "America/Santiago",
             "start_date": hoy.isoformat(), "end_date": (hoy + timedelta(days=HORIZONTE_DIAS - 1)).isoformat()}
    atm = open_meteo("https://api.open-meteo.com/v1/forecast", dict(comun,
          hourly="wind_speed_10m,wind_direction_10m,wind_gusts_10m", models="ecmwf_ifs,gfs_global", wind_speed_unit="kn"))
    try:
        mar = open_meteo("https://marine-api.open-meteo.com/v1/marine", dict(comun, hourly="wave_height,wave_direction", cell_selection="sea"))
    except Exception:
        mar = {}
    ha, hm = atm.get("hourly", {}), mar.get("hourly", {})
    horas = ha.get("time", [])
    ahora = ahora_local().replace(tzinfo=None)
    bloques = []
    for i0 in range(0, len(horas), 6):
        t = datetime.fromisoformat(horas[i0])
        if t + timedelta(hours=6) <= ahora:
            continue
        idx = range(i0, min(i0 + 6, len(horas)))
        v = [_var(ha, "wind_speed_10m", i)[0] for i in idx]
        d = [_var(ha, "wind_direction_10m", i)[0] for i in idx]
        r = [_var(ha, "wind_gusts_10m", i)[0] for i in idx]
        o = [hm.get("wave_height", [None] * len(horas))[i] for i in idx] if hm else []
        vv, rr, oo = [x for x in v if x is not None], [x for x in r if x is not None], [x for x in o if x is not None]
        if not vv:
            continue
        bloques.append({"t": t, "vmax": max(vv), "vmin": min(vv), "dir": rumbo(d), "dirs": d, "racha": max(rr) if rr else None,
                        "ola": max(oo) if oo else None})
    if not bloques:
        raise ValueError("Open-Meteo no entregó datos para ese lugar.")
    nb = lambda b: f"{DIAS[b['t'].weekday()][:3]} {b['t']:%d/%m} en la {dict(BLOQUES_H)[b['t'].hour]}"
    # resumen por día
    lineas = []
    for dia in sorted({b["t"].date() for b in bloques}):
        bs = [b for b in bloques if b["t"].date() == dia]
        olas = [b["ola"] for b in bs if b["ola"] is not None]
        txt = f"{DIAS[dia.weekday()].capitalize()} {dia:%d/%m}: viento {rumbo([x for b in bs for x in b['dirs']]) or ''} {round(min(b['vmin'] for b in bs))}/{round(max(b['vmax'] for b in bs))} kt"
        rach = [b["racha"] for b in bs if b["racha"]]
        if rach:
            txt += f" (racha hasta {round(max(rach))} kt)"
        if olas:
            e1, e2 = escala_armada(min(olas)), escala_armada(max(olas))
            txt += f"; mar {e1 if e1 == e2 else e1 + ' a ' + e2} ({rango(olas, 1)} m)"
        lineas.append(txt.replace("viento  ", "viento ") + ".")
    # mejor ventana: menor oleaje y viento combinados
    cand = [b for b in bloques if b["ola"] is not None] or bloques
    mejor = min(cand, key=lambda b: (b["ola"] or 0) + b["vmax"] / 10)
    vent = f"Mejor ventana de los próximos días: {nb(mejor)}, viento {mejor['dir'] or ''} {round(mejor['vmax'])} kt"
    if mejor["ola"] is not None:
        vent += f", ola {str(round(mejor['ola'], 1)).replace('.', ',')} m ({escala_armada(mejor['ola'])})"
    # cuándo cambia el estado del mar respecto de ahora
    evol = None
    olab = [b for b in bloques if b["ola"] is not None]
    if olab:
        k0 = ORDEN_MAR.index(escala_armada(olab[0]["ola"]))
        for b in olab[1:]:
            k = ORDEN_MAR.index(escala_armada(b["ola"]))
            if k != k0:
                evol = (f"La mar {'baja' if k < k0 else 'sube'} de {ORDEN_MAR[k0]} a {ORDEN_MAR[k]} desde el {nb(b)}.")
                break
        if not evol:
            evol = f"La mar se mantiene {ORDEN_MAR[k0]} en todo el período."
    nombre = (_titulo(lugar) if lugar and not re.match(r"^\s*-?\d", str(lugar)) else n)
    resumen = f"Tendencia para {nombre}, próximos {HORIZONTE_DIAS} días (hora local):\n" + "\n".join(lineas) + "\n" + vent + "." + (("\n" + evol) if evol else "")
    return {"resumen": resumen, "lugar": n, "posicion": gm(la, lo), "_pos": [n, la, lo],
            "fuente": "Open-Meteo: viento ECMWF IFS (GFS si falta); oleaje del modelo marino de Open-Meteo",
            "consultado": ahora_local().strftime("%d/%m/%Y %H:%M"),
            "nota": "Estado del mar según escala de la Armada. Valores de modelo, no observaciones."}


BLOQUES_H = [(0, "madrugada"), (6, "mañana"), (12, "tarde"), (18, "noche")]


# ------------------------------------------------------------------ herramienta 6: estado de puerto (SITPORT)
SITPORT_API = "https://orion.directemar.cl/sitport/back/users/"


def _sitport():
    try:
        def post(nombre):
            req = urllib.request.Request(SITPORT_API + nombre, data=b"", method="POST",
                                         headers={"User-Agent": "MeteoIA-asistente-local/" + VERSION})
            with urllib.request.urlopen(req, timeout=12, context=SSL) as r:
                return json.loads(r.read()).get("recordset", [])
        with _cache_lock:
            c = _cache.get("sitport")
            if c and time.time() - c[0] < 600:
                return c[1]
        d = {"bahias": post("consultaBahias"), "restricciones": post("consultaRestricciones"), "vivo": True,
             "actualizado": datetime.now(timezone.utc).isoformat()}
        with _cache_lock:
            _cache["sitport"] = (time.time(), d)
        return d
    except Exception:
        d = dato("restricciones.json", ttl=600)
        d["vivo"] = False
        return d


def _txt(s):
    s = str(s or "").replace("&GT;", ">").replace("&LT;", "<").replace("&AMP;", "&").replace("&gt;", ">").replace("&lt;", "<")
    return re.sub(r"\s+", " ", s).strip(" -")


def estado_puerto(puerto=None):
    d = _sitport()
    titulo = lambda x: re.sub(r"\b(De|Del|La|Las|Los|El|Y)\b", lambda m: m.group(1).lower(), x.title())
    nombres = {b["IDBahia"]: titulo(_txt(b.get("NMBahia"))) for b in d.get("bahias", [])}
    por = {}
    for r in d.get("restricciones", []):
        por.setdefault(r.get("bahia"), []).append(r)
    origen = "consultado en vivo" if d.get("vivo") else f"copia de MeteoIA del {hora_local(d.get('actualizado', ''))}"
    if puerto:
        cand = sorted(((max(similitud(puerto, nm), similitud(puerto, _txt((por.get(i) or [{}])[0].get("GLBahia")))), i, nm)
                       for i, nm in nombres.items()), key=lambda x: -x[0])
        if not cand or cand[0][0] < 0.72:
            raise ValueError("No encontré ese puerto en SITPORT. Indique el nombre de la bahía o puerto.")
        _, bid, nm = cand[0]
        lista = por.get(bid, [])
        if not lista:
            resumen = f"{nm}: sin restricciones vigentes en SITPORT."
        else:
            filas = []
            for r in lista[:8]:
                inst = " · ".join(x for x in (_txt(r.get("tipo")), _txt(r.get("NombreInstalacion"))) if x and x not in ("TODOS", "TODAS")) or "Toda la bahía"
                f = f"- {_txt(r.get('MotivoRestriccion')).capitalize() or 'Restricción'} ({_txt(r.get('tiporestriccion')).lower()}): {titulo(inst)}"
                det = _txt(r.get("Detalle")).rstrip(" .,")
                if det and det != "-":
                    f += f". Condición: {det.lower()}"
                if r.get("NaveRecibe"):
                    f += f". Naves: {_txt(r.get('NaveRecibe')).lower()}"
                f += f". Desde {_txt(r.get('FCinicio'))[:17]}" + (f" hasta {_txt(r.get('FCTermino'))[:17]}" if r.get("FCTermino") else "")
                filas.append(f)
            resumen = f"{nm}: {len(lista)} restricci{'ón' if len(lista) == 1 else 'ones'} vigente{'' if len(lista) == 1 else 's'} en SITPORT.\n" + "\n".join(filas)
    else:
        con = sorted(((nombres.get(i) or titulo(_txt(l[0].get("GLBahia"))), l) for i, l in por.items()), key=lambda x: x[0])
        resumen = (f"Puertos con restricciones vigentes en SITPORT ({len(con)}):\n" +
                   "\n".join(f"- {nm}: {', '.join(sorted({_txt(r.get('MotivoRestriccion')).lower() for r in l if r.get('MotivoRestriccion')}))}" for nm, l in con)
                   if con else "No hay restricciones vigentes en SITPORT.")
    return {"resumen": resumen, "fuente": f"SITPORT, Autoridad Marítima (sitport.directemar.cl), {origen}",
            "nota": "La condición de puerto oficial es la publicada por la Capitanía de Puerto en SITPORT."}


# ------------------------------------------------------------------ esquema de herramientas para el modelo
def _p(desc, tipo="string"):
    return {"type": tipo, "description": desc}


HERRAMIENTAS = {
    "condicion_punto": (condicion_punto, "Pronóstico de viento, racha, lluvia, visibilidad y oleaje en un lugar para un día (hoy hasta 5 días).", {
        "lugar": _p("Nombre del lugar, bahía, puerto o caleta (ej. Valparaíso, Isla Mocha)"),
        "lat": _p("Latitud decimal (negativa al sur), solo si el usuario dio posición", "number"),
        "lon": _p("Longitud decimal (negativa al oeste), solo si el usuario dio posición", "number"),
        "dias": _p("Días desde hoy: 0 hoy, 1 mañana, 3 en tres días", "integer"),
        "fecha": _p("Fecha AAAA-MM-DD, si el usuario la dio"),
    }, []),
    "avisos_vigentes": (avisos_vigentes, "Avisos meteorológicos vigentes y próximos (marejadas, mal tiempo, temporal) para un lugar, o todos si no se indica lugar.", {
        "lugar": _p("Nombre del lugar (opcional)"),
        "lat": _p("Latitud decimal (opcional)", "number"),
        "lon": _p("Longitud decimal (opcional)", "number"),
    }, []),
    "pronostico_bahia": (pronostico_bahia, "Pronóstico escrito WRF + IA de una bahía (situación sinóptica, nubosidad, viento por día).", {
        "bahia": _p("Nombre de la bahía (ej. Talcahuano, Puerto Montt)"),
    }, ["bahia"]),
    "tendencia_punto": (tendencia_punto, "Evolución de viento y oleaje en un lugar para los próximos 5 días: cuándo mejora o empeora, mejor ventana para zarpar o cruzar. Usar para '¿cuándo baja?', 'mejor hora/ventana', 'esta semana', 'fin de semana'.", {
        "lugar": _p("Nombre del lugar, bahía, puerto, golfo o canal"),
        "lat": _p("Latitud decimal (negativa al sur), solo si el usuario dio posición", "number"),
        "lon": _p("Longitud decimal (negativa al oeste), solo si el usuario dio posición", "number"),
    }, []),
    "estado_puerto": (estado_puerto, "Condición de puerto y restricciones vigentes de la Autoridad Marítima (SITPORT) en un puerto, o en todos si no se indica. Usar para '¿puedo salir/zarpar?', 'puerto cerrado', 'restricciones'.", {
        "puerto": _p("Nombre del puerto o bahía (opcional)"),
    }, []),
    "comparar_rutas": (comparar_rutas, "Ruta de navegación entre dos puertos o lugares de Chile (cualquiera, de Arica a la Antártica): traza por mar, viento y oleaje previstos en el trayecto y, si hay alternativas, cuál conviene. Usar para 'ruta', 'mejor ruta', 'navegar de X a Y'.", {
        "zarpe": _p("Puerto o lugar de zarpe"),
        "recalada": _p("Puerto o lugar de recalada"),
        "velocidad_kt": _p("Velocidad de la nave en nudos (si no la dan, 10)", "number"),
        "salida": _p("Fecha y hora de zarpe 'AAAA-MM-DD HH:MM' hora local (opcional; si no, la próxima hora)"),
    }, ["zarpe", "recalada"]),
}

ESQUEMA = [{"type": "function", "function": {"name": n, "description": d,
            "parameters": {"type": "object", "properties": props, "required": req}}}
           for n, (_, d, props, req) in HERRAMIENTAS.items()]


def ejecutar(nombre, args):
    if nombre not in HERRAMIENTAS:
        return {"error": f"Herramienta desconocida: {nombre}"}
    fn, _, props, _ = HERRAMIENTAS[nombre]
    args = {k: v for k, v in (args or {}).items() if k in props and v not in (None, "", "null")}
    try:
        return fn(**args)
    except ValueError as e:
        return {"error": str(e)}
    except Exception as e:  # red caída, formato inesperado
        return {"error": f"No se pudo obtener el dato ({type(e).__name__}: {e})"}


# ------------------------------------------------------------------ modelo local (Ollama)
def sistema():
    a = ahora_local()
    prox = ", ".join(f"{DIAS[(a + timedelta(days=k)).weekday()]} {(a + timedelta(days=k)):%Y-%m-%d}" for k in range(6))
    return f"""Eres el asistente de MeteoIA, plataforma de información meteorológica marítima de Chile.
Hoy es {DIAS[a.weekday()]} {a:%Y-%m-%d}, son las {a:%H:%M} hora de Chile. Próximos días: {prox}.

Reglas obligatorias:
1. Para cualquier pregunta sobre tiempo, mar, avisos o rutas, llama primero a una herramienta. Nunca respondas valores de memoria.
2. Responde solo con los datos que devolvió la herramienta. Si devolvió "error", explícalo al usuario y no inventes.
3. Viento en nudos (kt) con dirección (N, NE, E, SE, S, SW, W, NW), oleaje en metros con el estado del mar de la escala de la Armada (rizada, marejadilla, marejada, gruesa, muy gruesa). Usa rangos.
4. Para "¿cuándo baja/mejora?", "mejor ventana" o "esta semana" usa tendencia_punto. Para "¿puedo salir/zarpar?" o "restricciones" usa estado_puerto (y si menciona un lugar, también condicion_punto). Para "mejor ruta" usa comparar_rutas y recomienda la alternativa con menor oleaje y viento máximos, mencionando avisos y restricciones si las hay.
5. Si la herramienta trae "resumen", cópialo casi textual, sin cambiar fechas, cifras ni el estado del mar, y sin generalizar a varios días. Un aviso "próximo" todavía no está vigente: dilo así.
6. Respuesta breve en español formal: máximo 8 líneas. Termina con una línea "Fuente: …" con la fuente y la hora de consulta o actualización que entregó la herramienta.
7. No reemplazas el pronóstico ni los avisos oficiales de la Armada; si hay avisos vigentes, menciónalos primero.
8. Solo respondes sobre tiempo, mar, avisos y rutas en Chile. Ante otros temas, indica en una línea que solo atiendes consultas de meteorología marítima.""" + (" /no_think" if "qwen3" in MODELO and "instruct" not in MODELO else "")


def _ollama(mensajes):
    cuerpo = {"model": MODELO, "messages": mensajes, "tools": ESQUEMA, "stream": False, "think": False,
              "keep_alive": "30m", "options": {"temperature": 0.2, "num_ctx": 8192}}
    req = urllib.request.Request(OLLAMA + "/api/chat", data=json.dumps(cuerpo).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())["message"]


def _llamadas_en_texto(texto):
    """Algunos modelos chicos escriben la llamada como JSON en el texto en vez de usar tool_calls."""
    for m in re.finditer(r"\{[^{}]*\"name\"\s*:\s*\"(\w+)\"[^{}]*\"arguments\"\s*:\s*(\{[^{}]*\})[^{}]*\}", texto or ""):
        try:
            yield {"function": {"name": m.group(1), "arguments": json.loads(m.group(2))}}
        except Exception:
            pass


DIRECTAS = {"condicion_punto", "avisos_vigentes", "comparar_rutas", "tendencia_punto", "estado_puerto"}


SITIO_URL = "meteoia.cl"
CIERRES = {
    "condicion_punto": "Para más detalle, abre el mapa en meteoia.cl y activa las capas de viento y oleaje.",
    "tendencia_punto": "En el mapa de meteoia.cl puedes mover la hora de las capas de viento y oleaje para ver cómo evoluciona.",
    "avisos_vigentes": "En la portada de meteoia.cl los avisos vigentes aparecen en rojo: haz clic en uno para ver hasta cuándo rige y su detalle.",
    "comparar_rutas": "Si entras a RUTA en la página Desarrollo (meteoia.cl/dashboard.html) puedes trazarla con más información: abrigos, estaciones cercanas y mejor hora de zarpe.",
    "estado_puerto": "En la página Desarrollo, el botón Capuertos muestra las restricciones de cada puerto en el mapa.",
}


def _saludo(nombre, r, args):
    if nombre == "avisos_vigentes":
        res = r.get("resumen", "")
        if "Vigentes ahora en" in res and ": ninguno." not in res.split("\n")[0]:
            return "Hola, sí: hay aviso vigente."
        return "Hola, por ahora no hay avisos vigentes, pero viene uno:" if "Próximos" in res else "Hola, por ahora no hay avisos vigentes."
    if nombre in ("condicion_punto", "tendencia_punto") and args.get("lat") is not None and not args.get("lugar"):
        return "Hola, me la pones difícil con latitud y longitud, pero aquí va:"
    return {"condicion_punto": "Hola, esto es lo que muestran los modelos:",
            "tendencia_punto": "Hola, buena pregunta. Así viene la semana:",
            "comparar_rutas": "Hola, revisé la ruta:",
            "estado_puerto": "Hola, revisé SITPORT:"}.get(nombre, "Hola:")


def _recomendaciones(nombre, r, pos):
    """Recomendaciones por regla (no las inventa el modelo)."""
    out = []
    av = []
    if nombre == "avisos_vigentes":
        av = r.get("vigentes_ahora", [])
    elif pos and nombre in ("condicion_punto", "tendencia_punto"):
        try:
            av = avisos_vigentes(lat=pos[1], lon=pos[2]).get("vigentes_ahora", [])
            if av:
                out.append("Atento: " + "; ".join(f"{a['tipo']} {a['codigo'] or ''} vigente hasta el {a['hasta']}".replace("  ", " ") for a in av[:3]) + ".")
        except Exception:
            pass
    tipos = " ".join(str(a.get("tipo", "")).lower() for a in av)
    if "marejada" in tipos:
        out.append("Te recomiendo no acercarte al borde costero mientras esté vigente.")
    if any(x in tipos for x in ("mal tiempo", "temporal", "viento")):
        out.append("Si vas a navegar, revisa el aviso antes de zarpar.")
    if nombre == "condicion_punto":
        estados = re.findall(r"mar (rizada|marejadilla|marejada|gruesa|muy gruesa)", r.get("resumen", ""))
        if any(e in ("gruesa", "muy gruesa") for e in estados):
            out.append("Se ve movido: si vas a salir, revisa bien antes.")
        elif estados and all(e in ("rizada", "marejadilla") for e in estados):
            out.append("Buenas condiciones de mar, aprovecha.")
    if nombre == "estado_puerto" and "restricci" in r.get("resumen", "") and "sin restricciones" not in r.get("resumen", ""):
        out.append("Antes de salir, confirma con la Capitanía de Puerto: la condición puede cambiar durante el día.")
    return out


def _respuesta_directa(resultados, args_por_tool=None):
    """Si todas las herramientas llamadas traen resumen redactado y no hubo errores, arma la respuesta sin el modelo:
    saludo y cierre en el tono de MeteoIA, el resumen de la herramienta tal cual, recomendaciones por regla y la fuente."""
    if not resultados or any(n not in DIRECTAS or r.get("error") or not r.get("resumen") for n, r, _ in resultados):
        return None
    args_por_tool = args_por_tool or {}
    n0 = resultados[0][0]
    partes, fuentes, recs, cierres = [_saludo(n0, resultados[0][1], args_por_tool.get(n0, {}))], [], [], []
    for n, r, pos in resultados:
        partes.append(r["resumen"])
        for x in _recomendaciones(n, r, pos):
            if x not in recs:
                recs.append(x)
        if CIERRES.get(n) and CIERRES[n] not in cierres:
            cierres.append(CIERRES[n])
        f = r.get("fuente", "")
        if r.get("consultado"):
            f += f", consultado {r['consultado']}"
        elif r.get("actualizado"):
            f += f", actualizado {r['actualizado']}"
        if f not in fuentes:
            fuentes.append(f)
    notas = {r.get("nota") for _, r, _ in resultados if r.get("nota")}
    texto = "\n\n".join(partes)
    if recs:
        texto += "\n\n" + " ".join(recs)
    if cierres:
        texto += "\n\n" + " ".join(cierres)
    return texto + "\n\n" + "\n".join("Fuente: " + f for f in fuentes) + ("\n" + " ".join(sorted(notas)) if notas else "")


_modelo_lock = threading.Lock()   # un usuario a la vez: el M1 de 8 GB no da para más


def preguntar(pregunta, historial=None):
    t = time.time()
    msgs = [{"role": "system", "content": sistema()}]
    for h in (historial or [])[-6:]:
        if h.get("texto"):
            msgs.append({"role": "assistant" if h.get("rol") == "asistente" else "user", "content": str(h["texto"])[:1500]})
    msgs.append({"role": "user", "content": str(pregunta)[:1000]})
    usadas, resultados = [], []
    with _modelo_lock:
        for _ in range(MAX_RONDAS):
            m = _ollama(msgs)
            llamadas = m.get("tool_calls") or list(_llamadas_en_texto(m.get("content")))
            if not llamadas:
                texto = (m.get("content") or "").split("</think>")[-1].strip()   # por si el modelo razona en el texto
                return {"respuesta": texto, "herramientas": usadas, "segundos": round(time.time() - t, 1), "modelo": MODELO}
            msgs.append({"role": "assistant", "content": m.get("content") or "", "tool_calls": llamadas})
            for c in llamadas:
                f = c.get("function", {})
                args = f.get("arguments") or {}
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except Exception:
                        args = {}
                r = ejecutar(f.get("name"), args)
                pos = r.pop("_pos", None)
                usadas.append({"nombre": f.get("name"), "argumentos": args, "error": r.get("error"), "pos": pos})
                resultados.append((f.get("name"), r, pos))
                msgs.append({"role": "tool", "tool_name": f.get("name"), "content": json.dumps(r, ensure_ascii=False)[:6000]})
            directa = _respuesta_directa(resultados, {u["nombre"]: u["argumentos"] for u in usadas})
            if directa:   # condición en un punto y avisos: se entrega el texto de la herramienta tal cual, sin reescribir
                return {"respuesta": directa, "herramientas": usadas, "segundos": round(time.time() - t, 1), "modelo": MODELO}
        return {"respuesta": "No logré completar la consulta. Intente formularla de otra manera, indicando lugar y día.",
                "herramientas": usadas, "segundos": round(time.time() - t, 1), "modelo": MODELO}


# ------------------------------------------------------------------ servidor web
PAGINA = r"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>MeteoIA · Asistente local</title>
<style>
:root{--f:#0b1620;--p:#122434;--b:#1f3a52;--t:#e6eef5;--s:#8fa8bd;--a:#3fa9f5}
*{box-sizing:border-box}body{margin:0;background:var(--f);color:var(--t);font:16px/1.45 system-ui,-apple-system,sans-serif}
header{padding:14px 16px;border-bottom:1px solid var(--b)}h1{margin:0;font-size:18px}header p{margin:4px 0 0;color:var(--s);font-size:13px}
main{max-width:760px;margin:0 auto;padding:12px 12px 140px}
.m{padding:10px 12px;border-radius:10px;margin:10px 0;white-space:pre-wrap;word-wrap:break-word}
.u{background:var(--b);margin-left:15%}.a{background:var(--p);border:1px solid var(--b);margin-right:5%}
.h{color:var(--s);font-size:12px;margin-top:6px}
.ej{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.ej button{background:var(--p);color:var(--t);border:1px solid var(--b);border-radius:16px;padding:6px 10px;font-size:13px;cursor:pointer}
form{position:fixed;bottom:0;left:0;right:0;background:var(--f);border-top:1px solid var(--b);padding:10px 12px calc(10px + env(safe-area-inset-bottom))}
.fila{max-width:760px;margin:0 auto;display:flex;gap:8px}
textarea{flex:1;resize:none;height:48px;background:var(--p);color:var(--t);border:1px solid var(--b);border-radius:10px;padding:10px;font:inherit}
form button{background:var(--a);color:#001;border:0;border-radius:10px;padding:0 16px;font-weight:600}
.aviso{max-width:760px;margin:6px auto 0;color:var(--s);font-size:11px;text-align:center}
</style></head><body>
<header><h1>MeteoIA · Asistente con IA local</h1><p id="est">Prototipo · modelo local en el Mac · un usuario a la vez</p></header>
<main id="chat"><div class="ej" id="ej">
<button>¿Cómo estará el mar en Valparaíso en tres días?</button>
<button>¿Hay avisos vigentes para Talcahuano?</button>
<button>Mejor ruta de Puerto Montt a Punta Arenas a 12 nudos, zarpando mañana a las 08:00</button>
<button>Pronóstico WRF de la bahía de Puerto Montt</button></div></main>
<form id="f"><div class="fila"><textarea id="q" placeholder="Pregunte por un lugar, un día, avisos o una ruta…"></textarea><button>Enviar</button></div>
<div class="aviso">Información referencial generada por IA con datos de modelos. No reemplaza los pronósticos ni avisos oficiales de la Armada de Chile.</div></form>
<script>
const chat=document.getElementById('chat'),q=document.getElementById('q'),hist=[];
fetch('salud').then(r=>r.json()).then(s=>{document.getElementById('est').textContent='Prototipo · modelo '+s.modelo+(s.ollama?' · listo':' · Ollama no responde')}).catch(()=>{});
function burbuja(t,c){const d=document.createElement('div');d.className='m '+c;d.textContent=t;chat.appendChild(d);window.scrollTo(0,document.body.scrollHeight);return d}
async function enviar(t){if(!t.trim())return;document.getElementById('ej').style.display='none';burbuja(t,'u');q.value='';
 const d=burbuja('Consultando datos…','a');const t0=Date.now();
 try{const r=await fetch('preguntar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pregunta:t,historial:hist.slice(-6)})});
  const j=await r.json();d.textContent=j.respuesta||j.error||'Sin respuesta';
  const h=document.createElement('div');h.className='h';h.textContent=(j.herramientas||[]).map(x=>x.nombre).join(' → ')+(j.segundos?' · '+j.segundos+' s':'');d.appendChild(h);
  hist.push({rol:'usuario',texto:t},{rol:'asistente',texto:j.respuesta||''});
 }catch(e){d.textContent='Error de conexión con el asistente: '+e}}
document.getElementById('f').onsubmit=e=>{e.preventDefault();enviar(q.value)};
q.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();enviar(q.value)}});
document.querySelectorAll('#ej button').forEach(b=>b.onclick=()=>enviar(b.textContent));
</script></body></html>"""


def ollama_ok():
    try:
        with urllib.request.urlopen(OLLAMA + "/api/tags", timeout=3) as r:
            return any(m.get("name", "").startswith(MODELO.split(":")[0]) for m in json.loads(r.read()).get("models", []))
    except Exception:
        return False


LIM_MIN, LIM_DIA = int(os.environ.get("MN_LIMITE_MIN", "5")), int(os.environ.get("MN_LIMITE_DIA", "40"))
_uso, _uso_lock = {}, threading.Lock()


def cupo(ip):
    """Límite de consultas por persona (IP real que entrega Cloudflare). Devuelve None si puede preguntar, o el mensaje de espera."""
    ahora = time.time()
    with _uso_lock:
        h = [x for x in _uso.get(ip, []) if ahora - x < 86400]
        if len(h) >= LIM_DIA:
            return f"Alcanzó el máximo de {LIM_DIA} consultas por día. Intente mañana."
        if sum(1 for x in h if ahora - x < 60) >= LIM_MIN:
            return f"Máximo {LIM_MIN} consultas por minuto. Espere un momento."
        h.append(ahora)
        _uso[ip] = h
        if len(_uso) > 5000:   # limpieza ocasional
            for k in [k for k, v in _uso.items() if not v or ahora - v[-1] > 86400]:
                _uso.pop(k, None)
    return None


class Manejador(BaseHTTPRequestHandler):
    def _cors(self):
        o = self.headers.get("Origin", "")
        if o in ORIGENES or o.startswith("http://localhost") or o.startswith("http://127.0.0.1"):
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Access-Control-Allow-Credentials", "true")   # cookie de Cloudflare Access
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _enviar(self, cod, cuerpo, tipo="application/json; charset=utf-8"):
        b = cuerpo.encode() if isinstance(cuerpo, str) else json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(cod)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        ruta = self.path.split("?")[0]
        if ruta in ("/", "/index.html"):
            self._enviar(200, PAGINA, "text/html; charset=utf-8")
        elif ruta == "/salud":
            self._enviar(200, {"ok": True, "modelo": MODELO, "ollama": ollama_ok(), "version": VERSION})
        else:
            self._enviar(404, {"error": "no existe"})

    def do_POST(self):
        if self.path.split("?")[0] != "/preguntar":
            return self._enviar(404, {"error": "no existe"})
        try:
            n = min(int(self.headers.get("Content-Length", "0")), 20000)
            j = json.loads(self.rfile.read(n) or b"{}")
            p = str(j.get("pregunta", "")).strip()
            if not p:
                return self._enviar(400, {"error": "Pregunta vacía"})
            ip = self.headers.get("CF-Connecting-IP") or self.client_address[0]
            espera = cupo(ip)
            if espera:
                return self._enviar(429, {"error": espera})
            if not _modelo_lock.acquire(timeout=90):
                return self._enviar(503, {"error": "El asistente está respondiendo otra consulta. Intente en un momento."})
            _modelo_lock.release()
            self._enviar(200, preguntar(p, j.get("historial")))
        except urllib.error.URLError:
            self._enviar(503, {"error": "Ollama no responde en este Mac. Revise que esté corriendo."})
        except Exception as e:
            self._enviar(500, {"error": f"{type(e).__name__}: {e}"})

    def log_message(self, fmt, *args):
        sys.stderr.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {self.address_string()} {fmt % args}\n")


def servir():
    servidores = []
    for h in HOSTS:
        try:
            s = ThreadingHTTPServer((h, PUERTO), Manejador)
            servidores.append(s)
            print(f"Asistente MeteoIA en http://{h}:{PUERTO}  (modelo {MODELO})", flush=True)
        except OSError as e:
            print(f"No se pudo abrir {h}:{PUERTO}: {e}", flush=True)
    if not servidores:
        sys.exit(1)
    for s in servidores[1:]:
        threading.Thread(target=s.serve_forever, daemon=True).start()
    servidores[0].serve_forever()


def probar():
    casos = [("condicion_punto", {"lugar": "Valparaíso", "dias": 3}),
             ("avisos_vigentes", {"lugar": "Talcahuano"}),
             ("pronostico_bahia", {"bahia": "Puerto Montt"}),
             ("comparar_rutas", {"zarpe": "Puerto Montt", "recalada": "Punta Arenas", "velocidad_kt": 12})]
    for n, a in casos:
        t = time.time()
        r = ejecutar(n, a)
        print(f"\n=== {n} {a}  ({time.time() - t:.1f} s)")
        print(json.dumps(r, ensure_ascii=False, indent=1)[:2500])


if __name__ == "__main__":
    if "--probar" in sys.argv:
        probar()
    elif "--pregunta" in sys.argv:
        r = preguntar(" ".join(sys.argv[sys.argv.index("--pregunta") + 1:]))
        print(r["respuesta"])
        print(f"\n[{' → '.join(h['nombre'] for h in r['herramientas'])} · {r['segundos']} s · {r['modelo']}]")
    else:
        servir()
