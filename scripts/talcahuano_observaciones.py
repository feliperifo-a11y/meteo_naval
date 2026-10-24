#!/usr/bin/env python3
"""Observaciones públicas de Penco y Carriel Sur en el formato de la red nacional."""
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parent.parent
CHILE=ZoneInfo('America/Santiago')
PENCO='https://redmeteo.cl/jsonemas/RMCL0193.json'
SCIE='https://aviationweather.gov/api/data/metar?ids=SCIE&format=json'


def numero(v):
    return float(v) if isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) else None


def fila(codigo,nombre,lat,lon,epoch,fuente):
    if numero(epoch) is None or not (946684800 < epoch < datetime.now(timezone.utc).timestamp()+3600):
        raise ValueError('Hora de observación inválida')
    return {'codigo':codigo,'nombre':nombre,'latitud':lat,'longitud':lon,
            'fecha':datetime.fromtimestamp(epoch,timezone.utc).astimezone(CHILE).strftime('%Y-%m-%dT%H:%M:%S'),
            '_red':'Red complementaria','_fuente':fuente,'_unidad_viento':'kt',
            '_fecha_utc':datetime.fromtimestamp(epoch,timezone.utc).isoformat()}


def penco(datos):
    d=datos[0]
    m=d['metadatos']
    if m['id_estacion']!='RMCL0193' or abs(m['latitud']+36.7418)>.03 or abs(m['longitud']+72.9967)>.03:
        raise ValueError('La respuesta no corresponde a Penco')
    indices=[i for i,t in enumerate(d['fh']) if numero(t) is not None]
    if not indices:raise ValueError('Penco sin observaciones')
    i=max(indices,key=lambda i:d['fh'][i])
    get=lambda k: numero(d[k][i]) if isinstance(d.get(k),list) and len(d[k])>i else None
    r=fila('RMCL0193','Penco · estación particular',m['latitud'],m['longitud'],d['fh'][i],'RedMeteo · estación particular')
    # La página de RedMeteo convierte vv y vr de m/s a km/h mediante ×3,6.
    kt=lambda v:None if v is None else round(v*1.943844,2)
    r.update(temperatura=get('t'),puntoDeRocio=get('td'),humedad=get('rh'),presion=get('slp'),
             viento=get('vd'),velocidadDelViento=kt(get('vv')),_racha=kt(get('vr')))
    if r['_racha'] is not None and r['velocidadDelViento'] is not None and r['_racha']<r['velocidadDelViento']:
        r['_racha']=None  # No publicar como racha máxima un valor inferior al viento de esa observación.
    qc=get('qc')
    if qc is not None and qc>=128:raise ValueError('RedMeteo indica error de lectura')
    return r


def carriel(datos):
    candidatos=[d for d in datos if d.get('icaoId')=='SCIE' and numero(d.get('obsTime')) is not None]
    if not candidatos:raise ValueError('Sin METAR de SCIE')
    d=max(candidatos,key=lambda d:d['obsTime'])
    lat,lon=numero(d.get('lat')),numero(d.get('lon'))
    if lat is None or lon is None or abs(lat+36.78)>.05 or abs(lon+73.06)>.05:
        raise ValueError('Ubicación SCIE no reconocida')
    r=fila('SCIE','Carriel Sur · METAR',lat,lon,d['obsTime'],'DMC/DGAC · METAR vía NOAA/AWC')
    r.update(temperatura=numero(d.get('temp')),puntoDeRocio=numero(d.get('dewp')),
             presion=numero(d.get('altim')),viento=numero(d.get('wdir')),
             direccionViento='VRB' if d.get('wdir')=='VRB' else None,
             velocidadDelViento=numero(d.get('wspd')),_racha=numero(d.get('wgst')),
             humedad=None,_tipo_presion='QNH')  # El METAR no informa humedad relativa; no se presenta un cálculo como medición.
    return r


def consultar(url):
    with urlopen(Request(url,headers={'User-Agent':'MeteoIA/1.0 (+https://meteoia.cl)'}),timeout=25) as r:
        return json.load(r)


def main():
    path=ROOT/'data/talcahuano_observaciones.json'
    old=json.loads(path.read_text()) if path.exists() else {}
    estaciones={s['codigo']:s for s in old.get('estaciones',[])}
    errores=[]
    for codigo,url,parser in [('RMCL0193',PENCO,penco),('SCIE',SCIE,carriel)]:
        try:
            nueva=parser(consultar(url))
            previa=estaciones.get(codigo)
            # Una respuesta antigua no sustituye una observación más reciente.
            if not previa or nueva['_fecha_utc']>=previa.get('_fecha_utc',previa['fecha']):estaciones[codigo]=nueva
        except Exception as e:
            errores.append(codigo);print(codigo,type(e).__name__)
    data={'actualizado':datetime.now(timezone.utc).isoformat(timespec='seconds'),
          'estaciones':list(estaciones.values()),'sin_actualizar':errores}
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')));tmp.replace(path)
    print('Talcahuano:',len(estaciones),'estaciones complementarias; fechas propias de cada fuente')


if __name__=='__main__':main()
