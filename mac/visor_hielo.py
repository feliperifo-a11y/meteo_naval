#!/usr/bin/env python3
"""Visor local: carta de hielo del SHN (SIGRID-3) frente a la concentración AMSR2 de Bremen. Corre en el Mac de la casa.

Toma la carta SIGRID-3 más reciente del archivo (~/meteoia-ml/datos/hielo_shn, armado por archivo_hielo_shn.py) y el
AMSR2 del mismo día (~/meteoia-ml/datos/amsr2), y arma una página HTML que se abre solo en este computador:
  · capas del SHN: estado de desarrollo, concentración y borde (si está archivado);
  · capas AMSR2: clases en décimos y borde al 15 %, con el mismo proceso de la capa del sitio (hielo_amsr2.py);
  · tabla de concordancia: superficie (km², proyección de igual área) de cada clase de concentración del SHN
    frente a la clase AMSR2 en el mismo lugar.
Los datos del SHN no salen del Mac: la página no se publica. Uso: visor_hielo.py [--fecha AAAA-MM-DD] [--no-abrir]
"""
import argparse
import csv
import json
import sys
import tempfile
import webbrowser
import zipfile
from datetime import date, datetime
from pathlib import Path

import numpy as np
import shapefile
import shapely
from pyproj import CRS, Transformer
from shapely.geometry import box, mapping, shape

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
import hielo_amsr2 as H  # noqa: E402  (misma lógica que la capa del sitio)

DATOS = Path.home() / "meteoia-ml" / "datos"
DIR_SHN = DATOS / "hielo_shn"
DIR_AMSR2 = DATOS / "amsr2"
SALIDA = Path.home() / "meteoia-ml" / "visor_hielo"
AREA = (-85.0, -78.0, -20.0, -52.0)     # cobertura de la carta del SHN dentro del sector (lon O, lat S, lon E, lat N)
LAEA = "+proj=laea +lat_0=-90 +lon_0=0 +datum=WGS84 +units=m +no_defs"   # igual área, para superficies
SIMPLIFICAR_M = 1500.0

# Estados de desarrollo según la tabla SIGRID-3 (OMM); colores de la carta de etapas (scripts/hielos.py)
SA = {
    "80": ("Sin estado de desarrollo", "#9e9e9e"), "81": ("Hielo nuevo", "#f0d2fa"), "82": ("Nilas, costra de hielo", "#ff64ff"),
    "83": ("Hielo joven", "#aa28f0"), "84": ("Hielo gris", "#873cd7"), "85": ("Hielo gris-blanco", "#dc50eb"),
    "86": ("Hielo de primer año", "#ffff00"), "87": ("Primer año delgado", "#89d921"), "88": ("Primer año delgado, etapa 1", "#b1f477"),
    "89": ("Primer año delgado, etapa 2", "#affa00"), "91": ("Primer año medio", "#00c814"), "93": ("Primer año grueso", "#007800"),
    "95": ("Hielo viejo", "#b46432"), "96": ("Hielo de segundo año", "#ff780a"), "97": ("Hielo multianual", "#c80000"),
    "98": ("Hielo de glaciar", "#c8c8c8"),
}
CLASES = [("agua", "Agua libre (< 1/10 · < 15 %)", "#96c8ff")] + [(c[0], c[1], c[4]) for c in H.CLASES]


def log(*a):
    print("[visor_hielo]", *a, flush=True)


def ct_texto(c):
    fijos = {"01": "Menos de 1/10", "02": "Agua con témpanos", "91": "9–10/10", "92": "10/10"}
    if c in fijos:
        return fijos[c]
    if len(c) == 2 and c.isdigit():
        return f"{c[0]}/10" if c[1] == "0" else f"{c[0]}–{c[1]}/10"
    return f"código {c}"


def ct_clase(c):
    """Clase en décimos (como AMSR2) según el décimo mayor del código CT."""
    if c in ("91", "92"):
        return "c910"
    if c in ("01", "02") or not (len(c) == 2 and c.isdigit()):
        return "agua"
    alto = int(c[1]) if c[1] != "0" else int(c[0])
    alto = 10 if alto == 0 else alto
    return "c13" if alto <= 3 else "c46" if alto <= 6 else "c78" if alto <= 8 else "c910"


def leer_indice():
    with (DIR_SHN / "indice.csv").open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def elegir_cartas(fecha):
    filas = [f for f in leer_indice() if f["tipo"] == "sigrid3" and f["fecha_carta"]]
    sd = [f for f in filas if f["producto"] == "estados_desarrollo"]
    if not sd:
        raise SystemExit("Aún no hay cartas de estados de desarrollo archivadas. Corra primero archivo_hielo_shn.py.")
    if fecha is None:
        fecha = max(f["fecha_carta"] for f in sd)
    sel = {}
    for prod in ("estados_desarrollo", "concentracion", "borde"):
        cand = [f for f in filas if f["producto"] == prod and f["fecha_carta"] <= fecha]
        if cand:
            sel[prod] = max(cand, key=lambda f: (f["fecha_carta"], f["descargado_utc"]))
    return fecha, sel


def leer_sigrid(zip_path, caja_ll):
    """Lee el shapefile de un .zip SIGRID-3 y devuelve [(geometría lon/lat, atributos)] recortada al área."""
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(zip_path) as z:
        z.extractall(tmp)
        shp = next(Path(tmp).rglob("*.shp"))
        prj = shp.with_suffix(".prj")
        crs = CRS.from_wkt(prj.read_text(errors="replace")) if prj.exists() else CRS.from_epsg(3031)
        a_ll = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        a_geo = lambda xy: np.column_stack(a_ll.transform(xy[:, 0], xy[:, 1]))
        r = shapefile.Reader(str(shp))
        campos = [f[0] for f in r.fields[1:]]
        salida = []
        for s, rec in zip(r.iterShapes(), r.iterRecords()):
            if not s.points:
                continue
            g = shapely.make_valid(shape(s.__geo_interface__)).simplify(SIMPLIFICAR_M)
            g = shapely.make_valid(shapely.transform(shapely.segmentize(g, 6250.0), a_geo)).intersection(caja_ll)
            if g.is_empty:
                continue
            salida.append((shapely.set_precision(g, 0.005), {k: str(v).strip() for k, v in zip(campos, rec)}))
        return salida


def amsr2_del_dia(fecha):
    d = date.fromisoformat(fecha)
    tif = DIR_AMSR2 / f"{d:%Y}" / f"asi-AMSR2-s6250-{d:%Y%m%d}-v5.4.tif"
    if not tif.exists():
        log(f"No hay AMSR2 archivado para {fecha}; el visor muestra solo el SHN")
        return None
    H.AREA = AREA
    a, g, origen = H.leer_tiff(tif.read_bytes())
    conc, tierra, sin, cod = H.decodificar(a)
    return H.procesar(conc, tierra, sin, g, d, str(tif), cod)


def concordancia(shn, amsr, caja_ll):
    """Matriz de superficie (km²): fila = clase SHN, columna = clase AMSR2."""
    a_eq = Transformer.from_crs("EPSG:4326", LAEA, always_xy=True)
    eq = lambda geom: shapely.transform(geom, lambda xy: np.column_stack(a_eq.transform(xy[:, 0], xy[:, 1])))
    region = eq(caja_ll)
    try:
        costa = json.loads((AQUI.parent / "data" / "geo" / "land.json").read_text(encoding="utf-8"))
        tierra = shapely.union_all([shapely.make_valid(shapely.Polygon(H.decodificar_polilinea6(p[0])))
                                    for c in costa for p in c["p"] if len(p[0]) > 20])
        region = shapely.make_valid(region.difference(eq(tierra)))
    except Exception as e:
        log(f"Sin costa para descontar tierra ({e})")

    def por_clase(pares):
        d = {}
        for geom, cl in pares:
            d[cl] = shapely.union_all([d[cl], eq(geom)]) if cl in d else eq(geom)
        hielo = shapely.union_all(list(d.values())) if d else shapely.Polygon()
        d["agua"] = shapely.make_valid(region.difference(hielo))
        return {k: shapely.make_valid(v).intersection(region) for k, v in d.items()}

    s = por_clase([(g, ct_clase(p.get("CT", ""))) for g, p in shn if p.get("Poly_type", "I") == "I"])
    m = por_clase([(shape(f["geometry"]), f["properties"]["clase"]) for f in amsr["zonas"]["features"]])
    ids = [c[0] for c in CLASES]
    matriz = [[round(s[i].intersection(m[j]).area / 1e6) if i in s and j in m else 0 for j in ids] for i in ids]
    total = sum(map(sum, matriz))
    diag = sum(matriz[k][k] for k in range(len(ids)))
    return {"ids": ids, "nombres": [c[1] for c in CLASES], "matriz": matriz,
            "acuerdo_pct": round(100 * diag / total, 1) if total else None, "total_km2": total}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--fecha", help="fecha de la carta del SHN (AAAA-MM-DD); por omisión, la más reciente")
    ap.add_argument("--no-abrir", action="store_true", help="no abrir el navegador al terminar")
    args = ap.parse_args()
    fecha, sel = elegir_cartas(args.fecha)
    log(f"Carta del SHN: {fecha} · productos: {', '.join(sel)}")
    caja = box(AREA[0], AREA[1], AREA[2], AREA[3])
    capas, leidos = {}, {}
    for prod, fila in sel.items():
        elementos = leidos[prod] = leer_sigrid(DIR_SHN / fila["archivo"], caja)
        feats = []
        for g, p in elementos:
            ct, sa = p.get("CT", ""), p.get("SA", "")
            feats.append({"type": "Feature", "geometry": mapping(g), "properties": {
                "ct": ct, "ct_txt": ct_texto(ct) if ct and ct != "-9" else "", "sa": sa,
                "sa_txt": SA.get(sa, (f"código {sa}", ""))[0] if sa and sa != "-9" else "",
                "col_sa": SA.get(sa, ("", "#9e9e9e"))[1], "col_ct": dict((c[0], c[2]) for c in CLASES).get(ct_clase(ct), "#9e9e9e"),
                "tipo": p.get("Poly_type", "")}})
        capas[prod] = {"fecha": fila["fecha_carta"], "archivo": Path(fila["archivo"]).name, "geojson": {"type": "FeatureCollection", "features": feats}}
        log(f"  {prod}: {len(feats)} elementos (carta {fila['fecha_carta']})")
    amsr = amsr2_del_dia(fecha)
    tabla = None
    if amsr and "estados_desarrollo" in sel:
        tabla = concordancia(leidos["estados_desarrollo"], amsr, caja)
        log(f"  Concordancia de concentración: {tabla['acuerdo_pct']} % de {tabla['total_km2']:,} km²")
    datos = {"fecha": fecha, "area": AREA, "generado": datetime.now().strftime("%d-%m-%Y %H:%M"),
             "shn": capas, "amsr2": amsr, "tabla": tabla, "sa": SA, "clases": CLASES}
    SALIDA.mkdir(parents=True, exist_ok=True)
    html = (AQUI / "visor_hielo.html").read_text(encoding="utf-8").replace("/*DATOS*/null", json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
    destino = SALIDA / f"visor_hielo_{fecha.replace('-', '')}.html"
    destino.write_text(html, encoding="utf-8")
    log(f"Visor: {destino} ({destino.stat().st_size // 1024} KB)")
    if not args.no_abrir:
        webbrowser.open(destino.as_uri())


if __name__ == "__main__":
    main()
