#!/usr/bin/env python3
"""Carta WRF SERVIMET: viento por colores, recortado al dominio UTM de UV.

No se extraen valores numéricos del modelo ni se deduce dirección o presión.
Una corrida se publica completa y atómicamente; ante error queda la anterior.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
import hashlib
import io
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image, ImageFilter
from pyproj import Transformer
from marejadas_uv import UTM, codificar, leer_texto, proyeccion, reciente

ROOT = Path(__file__).resolve().parent.parent
SOURCE = 'http://triton.directemar.cl/web/html/Vto-color-centro9.html'
BASE = 'http://triton.directemar.cl/web/'
TTL = 2 * 3600
NUMEROS = list(range(1, 74, 3))
PALETA = np.array([[175,238,238],[0,154,205],[0,191,255],[152,251,152],
                    [192,255,62],[255,255,0],[255,215,0],[238,154,0],
                    [255,69,0],[205,55,0],[255,0,0],[139,0,0],[160,32,240]], dtype=np.int16)
# Registro afín local de la costa de la carta con la costa UTM de CL19TA.
# Solo es válido para esta imagen de 900x900 y esta bahía; no es la malla WRF.
# La comprobación de ejes y costa impide reutilizarlo si cambia el formato.
MATRIZ = np.array([[270.94,2.17],[-5.13,-341.58]])
OFFSET = np.array([641.56,387.52])
ANCLAS = [(611,257),(607,265),(606,273),(600,293),(591,302),
          (585,312),(593,319),(624,297),(643,298),(649,280),(649,274)]


def fechas(texto):
    if not re.search(r'Viento\s+Color\s+10m', texto, re.I) or 'nudos' not in texto.lower():
        raise ValueError('La carta no declara viento a 10 m en nudos')
    # OCR confunde la Z de UTC con 7 o 2; solo se corrige tras los dos dígitos de hora.
    m = re.findall(r'(20\d{2})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})\s*[-:]\s*([0-9OoIl]{2})\s*[Zz72]', texto)
    if len(m) != 2:
        raise ValueError('Inicialización o validez WRF ilegible: ' + texto)
    tr = str.maketrans({'O':'0','o':'0','I':'1','l':'1'})
    return tuple(datetime(int(y),int(mes),int(d),int(h.translate(tr)),tzinfo=timezone.utc) for y,mes,d,h in m)


def leer_titulo(im):
    return leer_texto(im,(108,157,510,194),6)


def validar_formato(im, textos=None):
    if im.size != (900,900):
        raise ValueError('Cambió el tamaño de la carta WRF')
    if textos is None:
        textos = {'x':leer_texto(im,(210,665,815,685),6),
                  'y':leer_texto(im,(58,265,110,641),6),
                  'escala':leer_texto(im,(254,690,674,763),6)}
    # Se tolera que OCR separe el punto decimal de la primera longitud.
    x = re.findall(r'(\d{2})(?:[. ]([05]))?\s*[°ºo]?\s*W',textos['x'],re.I)
    if [float(a+'.'+(b or '0')) for a,b in x] != [74.5,74,73.5,73,72.5]:
        raise ValueError('Cambió el eje de longitudes WRF')
    y = [float(v) for v in re.findall(r'(\d{2}\.\d)\s*[°ºo]?\s*S',textos['y'],re.I)]
    if y != [36.7,37,37.3,37.7]:
        raise ValueError('Cambió el eje de latitudes WRF')
    escala = textos['escala'].splitlines()[0]
    if [int(v) for v in re.findall(r'\d+',escala)] != list(range(0,61,5)) or 'nudos' not in textos['escala'].lower():
        raise ValueError('Cambió la escala de viento WRF')
    rgb = np.array(im.convert('RGB'))
    if not np.all(np.max(np.abs(rgb[705,[300+29*i for i in range(13)],:].astype(int)-PALETA),axis=1)<3):
        raise ValueError('Cambió la paleta de viento WRF')
    validar_costa(rgb)


def validar_costa(rgb):
    # Buscar el trazo negro en un radio de dos píxeles admite el antialiasing
    # y pequeñas oclusiones por barbas, pero rechaza otra carta o dominio.
    n = sum(bool((rgb[y-2:y+3,x-2:x+3].max(axis=2)<40).any()) for x,y in ANCLAS)
    if n < 9:
        raise ValueError('La costa WRF no coincide con el registro de Talcahuano')


def pixel_fuente(lon,lat):
    return (np.stack([np.asarray(lon)+73,np.asarray(lat)+37],axis=-1) @ MATRIZ.T) + OFFSET


def muestreo():
    # Píxeles de consulta en la MISMA cuadrícula de 31x31 km que Marejadas UV.
    x,y = np.meshgrid(653000+(np.arange(733)+.5)/733*31000,
                      5952000-(np.arange(733)+.5)/733*31000)
    lon,lat = Transformer.from_crs(32718,4326,always_xy=True).transform(x,y)
    p = np.rint(pixel_fuente(lon,lat)).astype(int)
    if p[...,0].min()<114 or p[...,0].max()>809 or p[...,1].min()<201 or p[...,1].max()>662:
        raise ValueError('El dominio UV no está cubierto por la carta WRF')
    return p[...,0],p[...,1]


def clasificar(rgb):
    """Códigos 1..12: intervalos de 5 kt; 13: >=60 kt; 0: ilegible.

    Consulta bajo un símbolo: color más próximo a <=3 píxeles de la carta.
    El canal verde guarda esa distancia, en centenas de metros, redondeada.
    """
    unique,inverse = np.unique(rgb.reshape(-1,3),axis=0,return_inverse=True)
    d = ((unique[:,None,:].astype(np.int32)-PALETA[None,:,:])**2).sum(axis=2)
    codes = np.where(d.min(axis=1)<=20**2,d.argmin(axis=1)+1,0).astype('uint8')
    grid = codes[inverse].reshape(rgb.shape[:2])
    # Las isobaras y puntos de ciudades usan el mismo rojo que 50–55 kt.
    # Solo se admite ese rango en superficies anchas, nunca en un trazo.
    red=np.array(Image.fromarray(((grid==11)*255).astype('uint8')).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7)))>0
    grid[(grid==11)&~red]=0
    original=grid.copy()
    distancia=np.zeros_like(grid)
    # Ordena por distancia para no propagar valores de píxeles ya rellenados.
    for dx,dy in sorted([(dx,dy) for dx in range(-3,4) for dy in range(-3,4) if 0<dx*dx+dy*dy<=9],key=lambda p:p[0]**2+p[1]**2):
        neighbor=np.roll(original,(-dy,-dx),axis=(0,1))
        mask=(grid==0)&(neighbor>0)
        mask[:4]=False;mask[-4:]=False;mask[:,:4]=False;mask[:,-4:]=False
        grid[mask]=neighbor[mask]
        distancia[mask]=int(np.ceil(np.hypot(dx,dy)*350/100))
    return grid,distancia


def procesar(blobs, ocr=leer_titulo, ejes=None):
    if len(blobs)!=25:
        raise ValueError('Corrida WRF incompleta')
    sx,sy = muestreo()
    px,py,inside,bounds = proyeccion()
    frames=[];init=None;leyenda=None
    for i,blob in enumerate(blobs):
        im=Image.open(io.BytesIO(blob))
        if im.format!='PNG' or im.size!=(900,900):raise ValueError('Formato WRF desconocido')
        im=im.convert('RGB');rgb=np.array(im)
        if i==0:
            validar_formato(im,ejes)
            leyenda=im.crop((258,697,665,718)).tobytes()
        elif im.crop((258,697,665,718)).tobytes()!=leyenda:
            raise ValueError('La escala WRF cambia dentro de la corrida')
        validar_costa(rgb)
        inicial,valida=fechas(ocr(im))
        if init is None:init=inicial
        if inicial!=init or valida!=init+timedelta(hours=i*3):
            raise ValueError('Imágenes WRF de distintas corridas o fechas no consecutivas')
        codes,dist=clasificar(rgb)
        query=np.stack([codes[sy,sx],dist[sy,sx],np.zeros_like(sx,dtype='uint8')],axis=-1).astype('uint8')
        if (query[...,0]>0).mean()<.85:raise ValueError('Insuficiente viento legible en la bahía')
        # Limpia rótulos, costa e isobaras; conserva las barbas grises que no
        # estén pegadas al trazo negro de un rótulo o la costa.
        visual=PALETA[np.maximum(0,codes.astype(int)-1)].astype('uint8')
        near_black=np.array(Image.fromarray(((rgb.max(axis=2)<40)*255).astype('uint8')).filter(ImageFilter.MaxFilter(7)))>0
        grey=(rgb.max(axis=2)-rgb.min(axis=2)<15)&(rgb.min(axis=2)>55)&(rgb.max(axis=2)<150)&~near_black
        visual[grey]=rgb[grey]
        alpha=((codes>0)|grey).astype('uint8')*255
        crop=visual[sy,sx];rgba=np.dstack([crop,alpha[sy,sx]])[py,px]
        rgba[~inside,3]=0
        frames.append({'fecha':valida.isoformat(timespec='minutes').replace('+00:00','Z'),
                       'imagen':codificar(Image.fromarray(rgba),'WEBP'),
                       'consulta':codificar(Image.fromarray(query),'PNG')})
    return {'schema':1,'tipo':'wrf_servimet','fuente':SOURCE,'crs_origen':'EPSG:32718',
            'extent_utm':UTM,'grid_size':[733,733],'bounds':bounds,'paso_horas':3,
            'inicializacion':init.isoformat(timespec='minutes').replace('+00:00','Z'),
            'resolucion_km':3,'intervalo_nudos':5,'hora':'UTC',
            'metodo':'Rangos de viento a 10 m leídos del color de la carta; no son datos numéricos del modelo. Registro geográfico aproximado de la costa con la carta UV.',
            'georreferencia':{'matriz':MATRIZ.tolist(),'offset':OFFSET.tolist(),'origen_lonlat':[-73,-37]},
            'frames':frames,'sha256':hashlib.sha256(b''.join(blobs)).hexdigest()}


def descargar(url, limite=1_000_000):
    with urlopen(Request(url,headers={'User-Agent':'MeteoIA/1.0 (+https://meteoia.cl)'}),timeout=35) as r:
        blob=r.read(limite+1)
    if len(blob)>limite:raise ValueError('Respuesta WRF demasiado grande')
    return blob


def main():
    p=argparse.ArgumentParser();p.add_argument('--carpeta',type=Path);p.add_argument('--titulos',type=Path);p.add_argument('--ejes',type=Path);p.add_argument('--forzar',action='store_true');args=p.parse_args()
    destino=ROOT/'data/wrf_servimet.json'
    try:old=json.loads(destino.read_text())
    except (OSError,ValueError):old={}
    now=datetime.now(timezone.utc)
    if not args.forzar and not args.carpeta and old.get('tipo')=='wrf_servimet' and reciente(old,now):
        print('WRF SERVIMET: consulta de hace menos de dos horas');return
    if args.carpeta:
        blobs=[(args.carpeta/f'{n:06}.png').read_bytes() for n in NUMEROS]
    else:
        html=descargar(SOURCE).decode('utf-8')
        archivos=re.findall(r'src="\.\./(carta_wnd_slp_color_centro_d04\.\d{6}\.png)"',html)
        esperados=[f'carta_wnd_slp_color_centro_d04.{n:06}.png' for n in NUMEROS]
        if archivos!=esperados:raise ValueError('Cambió la secuencia de la página SERVIMET')
        with ThreadPoolExecutor(max_workers=4) as ex:blobs=list(ex.map(lambda f:descargar(BASE+f),archivos))
        # Impide publicar una mezcla si el servidor reemplazó la corrida durante la descarga.
        if descargar(BASE+archivos[0])!=blobs[0]:raise ValueError('SERVIMET está actualizando la corrida; se reintentará')
    huella=hashlib.sha256(b''.join(blobs)).hexdigest()
    if old.get('sha256')==huella and old.get('tipo')=='wrf_servimet':result=old
    else:
        ocr=leer_titulo
        if args.titulos:
            titulos=json.loads(args.titulos.read_text());textos=iter(titulos[str(n)] for n in NUMEROS);ocr=lambda im:next(textos)
        result=procesar(blobs,ocr,json.loads(args.ejes.read_text()) if args.ejes else None)
    result['consultado']=now.isoformat(timespec='seconds')
    destino.parent.mkdir(parents=True,exist_ok=True)
    tmp=destino.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')));tmp.replace(destino)
    print(f'WRF SERVIMET: {len(result["frames"])} fechas; {destino.stat().st_size/1024:.0f} KB')


if __name__=='__main__':main()
