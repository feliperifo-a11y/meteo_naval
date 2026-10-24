#!/usr/bin/env python3
"""Publica la animación UV y rangos leídos de su escala, nunca datos del modelo.

La geometría es la cuadrícula UTM 18S de la carta CL19TA. Ante cambios de
formato, fechas ilegibles o descarga fallida se conserva el archivo anterior.
"""
import argparse
import base64
import hashlib
import io
import json
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image, ImageFilter
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
SOURCE = 'https://marejadas.uv.cl/pronosticos/cl19ta'
GIF = 'https://marejadas.uv.cl/images/SAM/dominios/CL19TAG.gif'
TTL = 2 * 3600
CROP = (162, 68, 895, 801)
UTM = [653000, 5921000, 684000, 5952000]


def reciente(data, ahora):
    try:
        edad = (ahora - datetime.fromisoformat(data['consultado'])).total_seconds()
        return data.get('schema') == 1 and bool(data['frames']) and 0 <= edad < TTL
    except (ValueError, KeyError, TypeError):
        return False


def fecha_titulo(texto):
    meses = dict(zip(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], range(1, 13)))
    m = re.search(r'(20\d{2})\s*/\s*([A-Za-z]{3})\s*/\s*(\d{1,2})\s+(\d{1,2})\s*h', texto.replace('0c¢t','Oct').replace('0ct', 'Oct'))
    if not m or m[2].title() not in meses:
        raise ValueError('Fecha UV ilegible: ' + texto)
    # La fuente no indica zona horaria. No se inventa un desplazamiento a UTC.
    return datetime(int(m[1]), meses[m[2].title()], int(m[3]), int(m[4]))


def leer_texto(im, caja, psm=7):
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / 'titulo.png'
        region = im.crop(caja)
        region.resize((region.width*4,region.height*4)).save(p)
        r = subprocess.run(['tesseract', str(p), 'stdout', '--psm', str(psm)],
                           check=True, capture_output=True, text=True, timeout=15)
        return r.stdout.strip()


def leer_titulo(im):
    return leer_texto(im, (590,25,820,60))


def validar_ejes(im, textos=None):
    textos = textos or {'x':leer_texto(im,(155,810,900,835)), 'y':leer_texto(im,(90,90,148,810),6)}
    x = [int(v) for v in re.findall(r'\d{6}',textos['x'].replace(' ',''))]
    y = [int(v) for v in re.findall(r'\d{7}',textos['y'].replace(' ',''))]
    esperado_x = list(range(653600,681051,3050))
    esperado_y = list(range(5949000,5920999,-3500))
    # Los números impresos tienen ocho píxeles de alto: se admite algún dígito
    # mal reconocido, pero la mayoría de las marcas debe confirmar ambos ejes.
    if (len(set(x)&set(esperado_x)) < 8 or len(set(y)&set(esperado_y)) < 7
            or esperado_x[0] not in x or esperado_x[-1] not in x
            or not (esperado_y[0] in y or esperado_y[-1] in y)):
        raise ValueError('Cambió la cuadrícula UTM de la carta UV')


def codificar(im, tipo):
    f = io.BytesIO()
    im.save(f, format=tipo, **({'lossless': True, 'method': 3} if tipo == 'WEBP' else {}))
    return base64.b64encode(f.getvalue()).decode('ascii')


def clasificar(im):
    """Rango de 0,25 m por color; 0=sin dato, 254=símbolo, 255=tierra."""
    rgb = np.array(im.convert('RGB'), dtype=np.int16)
    # Barra de colores: y=182..740. La banda gris inferior es "sin dato".
    palette = rgb[182:741, 995, :]
    if (np.max(palette, axis=1) - np.min(palette, axis=1) < 100).any():
        raise ValueError('Cambió la escala de colores UV')
    crop = rgb[CROP[1]:CROP[3], CROP[0]:CROP[2]]
    unique, inverse = np.unique(crop.reshape(-1, 3), axis=0, return_inverse=True)
    distances = ((unique[:, None, :].astype(np.int32) - palette[None, :, :]) ** 2).sum(axis=2)
    nearest = distances.argmin(axis=1)
    exact = distances.min(axis=1) <= 18 ** 2
    heights = 4 * (1 - nearest / 558)
    codes = np.where(exact, np.minimum(15, np.floor(heights / .25)).astype(np.uint8) + 1, 0)
    codes[np.max(unique, axis=1) < 60] = 254
    codes[(np.max(unique, axis=1) - np.min(unique, axis=1) < 12) & (unique[:, 0] > 180) & (unique[:, 0] < 235)] = 255
    grid = codes[inverse].reshape(crop.shape[:2])
    if np.count_nonzero((grid >= 1) & (grid <= 16)) < grid.size * .35:
        raise ValueError('Carta UV sin suficiente superficie de oleaje reconocible')
    return crop.astype(np.uint8), grid


def proyeccion(size=768):
    to_merc = Transformer.from_crs(32718, 3857, always_xy=True)
    to_utm = Transformer.from_crs(3857, 32718, always_xy=True)
    to_ll = Transformer.from_crs(3857, 4326, always_xy=True)
    x0, y0, x1, y1 = UTM
    edge = np.linspace(0, 1, 80)
    ex = np.concatenate([x0 + edge * (x1-x0), x0 + edge * (x1-x0), np.full(80,x0), np.full(80,x1)])
    ey = np.concatenate([np.full(80,y0), np.full(80,y1), y0 + edge * (y1-y0), y0 + edge * (y1-y0)])
    mx, my = to_merc.transform(ex, ey)
    bounds = [float(min(mx)), float(min(my)), float(max(mx)), float(max(my))]
    xx, yy = np.meshgrid(np.linspace(bounds[0],bounds[2],size), np.linspace(bounds[3],bounds[1],size))
    ux, uy = to_utm.transform(xx, yy)
    px = np.floor((ux-x0)/(x1-x0)*733).astype(int)
    py = np.floor((y1-uy)/(y1-y0)*733).astype(int)
    inside = (px>=0)&(px<733)&(py>=0)&(py<733)
    px, py = np.clip(px,0,732), np.clip(py,0,732)
    sw, ne = to_ll.transform(bounds[0],bounds[1]), to_ll.transform(bounds[2],bounds[3])
    return px, py, inside, [[sw[1],sw[0]],[ne[1],ne[0]]]


def procesar(blob, ocr=leer_titulo, ejes=None):
    im = Image.open(io.BytesIO(blob))
    if im.format != 'GIF' or im.size != (1200,900) or not 2 <= im.n_frames <= 120:
        raise ValueError('Formato o dominio UV desconocido')
    validar_ejes(im.convert('RGB'),ejes)
    px, py, inside, bounds = proyeccion()
    frames, fechas = [], []
    for i in range(im.n_frames):
        im.seek(i)
        frame = im.convert('RGB')
        fecha = fecha_titulo(ocr(frame))
        if fechas and (fecha-fechas[-1]).total_seconds() != 3*3600:
            raise ValueError('Secuencia UV no consecutiva de tres horas')
        fechas.append(fecha)
        crop, grid = clasificar(frame)
        # Mantiene las flechas sobre el mar, sin extender colores sobre tierra.
        water = (grid>=1)&(grid<=16)
        near = np.array(Image.fromarray(water.astype('uint8')*255).filter(ImageFilter.MaxFilter(7)))>0
        alpha = ((water | ((grid==254)&near)) & (grid!=255)).astype('uint8')*255
        rgba = np.dstack([crop,alpha])[py,px]
        rgba[~inside,3] = 0
        frames.append({'fecha': fecha.isoformat(timespec='minutes'),
                       'imagen': codificar(Image.fromarray(rgba), 'WEBP'),
                       'consulta': codificar(Image.fromarray(grid), 'PNG')})
    return {'schema':1, 'fuente':SOURCE, 'archivo_fuente':GIF,
            'crs_origen':'EPSG:32718', 'extent_utm':UTM, 'bounds':bounds,
            'grid_size':[733,733], 'paso_horas':3, 'intervalo_metros':.25,
            'hora':'Hora publicada por UV; zona horaria no indicada en la carta',
            'metodo':'Rango aproximado leído de los colores de la imagen UV; no es el dato numérico del modelo.',
            'frames':frames, 'sha256':hashlib.sha256(blob).hexdigest()}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--archivo', type=Path)
    p.add_argument('--titulos', type=Path, help='Textos OCR de una validación local de los mismos fotogramas')
    p.add_argument('--ejes', type=Path, help='Textos OCR de los ejes de la misma carta local')
    p.add_argument('--forzar', action='store_true')
    args = p.parse_args()
    destino = ROOT/'data/marejadas_uv.json'
    old = json.loads(destino.read_text()) if destino.exists() else {}
    now = datetime.now(timezone.utc)
    if not args.forzar and not args.archivo and reciente(old, now):
        print('Marejadas UV: consulta de hace menos de dos horas'); return
    modified = None
    if args.archivo:
        blob = args.archivo.read_bytes()
    else:
        with urlopen(Request(GIF, headers={'User-Agent':'MeteoIA/1.0 (+https://meteoia.cl)'}), timeout=45) as r:
            blob = r.read(15_000_001)
            modified = r.headers.get('Last-Modified')
        if len(blob)>15_000_000:
            raise ValueError('Archivo UV demasiado grande')
    if old.get('sha256') == hashlib.sha256(blob).hexdigest():
        result = old
    else:
        if args.titulos:
            textos = iter(json.loads(args.titulos.read_text()).values())
            result = procesar(blob, lambda im:next(textos), json.loads(args.ejes.read_text()) if args.ejes else None)
        else:
            result = procesar(blob)
    result['consultado'] = now.isoformat(timespec='seconds')
    if modified:
        result['modificado_fuente'] = modified
    tmp = destino.with_suffix('.tmp')
    tmp.write_text(json.dumps(result, ensure_ascii=False, separators=(',',':')))
    tmp.replace(destino)
    print(f'Marejadas UV: {len(result["frames"])} fechas; {destino.stat().st_size/1024:.0f} KB')


if __name__ == '__main__':
    main()
