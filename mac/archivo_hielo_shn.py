#!/usr/bin/env python3
"""Archivo de cartas de hielo del SHN (Argentina) para entrenamiento futuro. Corre en el Mac de la casa.

Qué hace en cada ejecución:
  1. Lee las cuatro páginas de cartas del Servicio de Hielo del SHN (borde, concentración, estados de desarrollo y
     témpanos) y busca los enlaces a sus archivos SIGRID-3 (.zip) y a las imágenes de la carta (.jpg).
  2. Baja cada archivo y lo guarda solo si es nuevo (se compara su huella SHA-256 con lo ya archivado).
  3. Por cada carta nueva, baja la concentración AMSR2 de la Universidad de Bremen de la fecha de la carta y de los
     dos días anteriores (las cartas combinan imágenes de varios días), para tener el par carta–satélite.

Destino: ~/meteoia-ml/datos/hielo_shn/<producto>/ y ~/meteoia-ml/datos/amsr2/, con un índice en
~/meteoia-ml/datos/hielo_shn/indice.csv. Solo usa la biblioteca estándar de Python. No sube nada ni usa claves.
Uso interno de archivo: las cartas son producto del SHN (todos los derechos reservados); no se publican.
"""
import csv
import hashlib
import io
import os
import re
import sys
import time
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

BASE_SHN = os.environ.get("SHN_BASE", "https://www.hidro.gov.ar/Smara/glacio/sglaciologica.asp")
PAGINAS = {"borde": 1, "concentracion": 2, "estados_desarrollo": 3, "tempanos": 4}
BREMEN = os.environ.get("BREMEN_BASE", "https://data.seaice.uni-bremen.de/amsr2/asi_daygrid_swath/s6250")
MESES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
RAIZ = Path(os.environ.get("ARCHIVO_HIELO", Path.home() / "meteoia-ml" / "datos"))
DIR_SHN = RAIZ / "hielo_shn"
DIR_AMSR2 = RAIZ / "amsr2"
INDICE = DIR_SHN / "indice.csv"
CAMPOS = ["descargado_utc", "producto", "tipo", "fecha_carta", "archivo", "sha256", "bytes", "url"]
CAB = {"User-Agent": "MeteoIA-archivo/1.0 (archivo interno de cartas de hielo; uso no comercial)"}
ENLACE = re.compile(r"""href\s*=\s*["']([^"']+\.(?:zip|jpg|jpeg|png))["']|src\s*=\s*["']([^"']+\.(?:jpg|jpeg|png))["']""", re.I)
FECHA = re.compile(r"(20\d{6})")


def log(*a):
    print(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def bajar(url, timeout=120):
    with urlopen(Request(url, headers=CAB), timeout=timeout) as r:
        return r.read()


def leer_indice():
    if not INDICE.exists():
        return []
    with INDICE.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def anotar(fila):
    nuevo = not INDICE.exists()
    with INDICE.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS)
        if nuevo:
            w.writeheader()
        w.writerow(fila)


def fecha_de(nombre, contenido=None):
    """Fecha de la carta: desde los nombres dentro del .zip (p. ej. shn_antartida_zonas_sd_20261104_pl_a.shp)
    o desde el nombre del archivo (p. ej. 20261105_BH.jpg)."""
    candidatos = []
    if contenido is not None:
        try:
            with zipfile.ZipFile(io.BytesIO(contenido)) as z:
                candidatos = [n for n in z.namelist()]
        except zipfile.BadZipFile:
            return None, False
    candidatos.append(nombre)
    for n in candidatos:
        m = FECHA.search(Path(n).name)
        if m:
            try:
                return datetime.strptime(m.group(1), "%Y%m%d").date(), True
            except ValueError:
                continue
    return None, True


def amsr2(d):
    """Concentración AMSR2 de Bremen para la fecha d, si aún no está archivada."""
    nombre = f"asi-AMSR2-s6250-{d:%Y%m%d}-v5.4.tif"
    destino = DIR_AMSR2 / f"{d:%Y}" / nombre
    if destino.exists():
        return False
    try:
        datos = bajar(f"{BREMEN}/{d:%Y}/{MESES[d.month - 1]}/Antarctic/{nombre}", timeout=90)
    except Exception as e:
        log(f"  AMSR2 {d}: no disponible ({e})")
        return False
    if datos[:2] not in (b"II", b"MM"):
        log(f"  AMSR2 {d}: respuesta que no es GeoTIFF; se omite")
        return False
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(datos)
    log(f"  AMSR2 {d}: archivado ({len(datos) // 1024} KB)")
    return True


def main():
    DIR_SHN.mkdir(parents=True, exist_ok=True)
    vistos = {f["sha256"] for f in leer_indice()}
    nuevas, fallas, fechas_par = 0, 0, set()
    for producto, op in PAGINAS.items():
        url_pag = f"{BASE_SHN}?op={op}"
        try:
            html = bajar(url_pag, timeout=60).decode("utf-8", errors="replace")
        except Exception as e:
            log(f"{producto}: no se pudo leer la página ({e})")
            fallas += 1
            continue
        enlaces = []
        for m in ENLACE.finditer(html):
            u = urljoin(url_pag, m.group(1) or m.group(2))
            if "glacio" in u.lower() and u not in enlaces:
                enlaces.append(u)
        if not enlaces:
            log(f"{producto}: la página no trae enlaces de carta (¿cambió el sitio?)")
            fallas += 1
            continue
        for u in enlaces:
            nombre = Path(u.split("?")[0]).name
            tipo = "sigrid3" if nombre.lower().endswith(".zip") else "imagen"
            if tipo == "imagen" and not FECHA.search(nombre):
                continue          # imágenes fijas de la página (p. ej. el gráfico de zonas): no son la carta del día
            try:
                datos = bajar(u)
            except Exception as e:
                log(f"{producto}: no se pudo bajar {nombre} ({e})")
                fallas += 1
                continue
            sha = hashlib.sha256(datos).hexdigest()
            if sha in vistos:
                continue
            f_carta, valido = fecha_de(nombre, datos if tipo == "sigrid3" else None)
            if not valido:
                log(f"{producto}: {nombre} no es un .zip válido; se omite")
                fallas += 1
                continue
            etiqueta = f_carta.strftime("%Y%m%d") if f_carta else "sin_fecha"
            destino = DIR_SHN / producto / f"{etiqueta}_{sha[:8]}_{nombre}"
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_bytes(datos)
            anotar({"descargado_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "producto": producto,
                    "tipo": tipo, "fecha_carta": f_carta.isoformat() if f_carta else "", "archivo": str(destino.relative_to(DIR_SHN)),
                    "sha256": sha, "bytes": len(datos), "url": u})
            vistos.add(sha)
            nuevas += 1
            log(f"{producto}: nuevo {tipo} {nombre} (carta {etiqueta}, {len(datos) // 1024} KB)")
            if tipo == "sigrid3" and f_carta:
                fechas_par.add(f_carta)
            time.sleep(1)
    # Pares AMSR2: para toda carta SIGRID-3 de los últimos 10 días (no solo las de hoy), se completan los días que falten;
    # así se reintenta cuando Bremen publica después que el SHN.
    hoy = datetime.now(timezone.utc).date()
    for fila in leer_indice():
        if fila["tipo"] == "sigrid3" and fila["fecha_carta"]:
            f = date.fromisoformat(fila["fecha_carta"])
            if (hoy - f).days <= 10:
                fechas_par.add(f)
    dias = sorted({f - timedelta(days=k) for f in fechas_par for k in (2, 1, 0)})
    for d in dias:
        if d <= hoy:
            amsr2(d)
    log(f"Resumen: {nuevas} archivos nuevos, {fallas} problemas. Archivo: {DIR_SHN}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"Error: {e}")
    sys.exit(0)
