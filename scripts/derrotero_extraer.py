# Extrae del texto de los Derroteros (pdftotext, Pub. SHOA 3001 a 3006, archivos 3001.raw.txt …) los lugares con coordenadas → lugares_raw.json
# Los PDF no se incluyen en el repositorio (publicación con derechos del SHOA).
import re,json,sys
from collections import Counter
TIPOS=r'(?:Caleta|Bahía|Puerto|Seno|Ensenada|Fondeadero|Rada|Surgidero|Estero|Fiordo|Abra|Puertecillo|Caletilla|Bahías|Caletas|Isla|Islas|Islote|Islotes|Punta|Cabo|Canal|Paso|Angostura|Golfo|Morro|Faro|Monte|Cerro|Roca|Bajo|Península|Archipiélago)'
Q=r"""[’'′´"”]"""
pat=re.compile(r"((?:"+TIPOS+r")(?: [\wáéíóúñÁÉÍÓÚÑ’'´\-]+){0,6}?)\s*(?:\([^)]{0,40}\))?\.[-–—]\s*(?:Cartas? N[ºo°]?\s*s?\.?\s*([\d ,yY–\-]{3,60}?)\s*\.\s*)?Lat\.?\s*(\d{2})\s*[ºo°]\s*(\d{1,2})\s*"+Q+r"?\s*(?:(\d{1,2}(?:[,.]\d)?)\s*"+Q+r"{1,2})?\s*S\.?\s*[;,.]?\s*Long\.?\s*(\d{2,3})\s*[ºo°]\s*(\d{1,2})\s*"+Q+r"?\s*(?:(\d{1,2}(?:[,.]\d)?)\s*"+Q+r"{1,2})?\s*(W|E)")
VOL={'3001':'I','3002':'II','3003':'III','3004':'IV','3005':'V','3006':'VI'}
out=[];vistos=set()
for b in VOL:
    t=open(b+'.raw.txt').read()
    t=re.sub(r'USUARIO: ANDRÉS HOWARD\.|PUBLICACIÓN ACTUALIZADA AL BOLETÍN DE NOTICIAS A LOS NAVEGANTES DEL MES DE OCTUBRE DE 2026','',t)
    t=t.replace('­','')
    t=re.sub(r'-\n(?=[a-záéíóúñ])','',t)
    t=re.sub(r'\s+',' ',t)
    ms=list(pat.finditer(t))
    for i,m in enumerate(ms):
        nom=m.group(1).strip(' ,')
        if len(nom)<5: continue
        sec=lambda g: (float(g.replace(',','.')) if g else 0)
        la=-(int(m.group(3))+int(m.group(4))/60+sec(m.group(5))/3600)
        lo=(1 if m.group(9)=='E' else -1)*(int(m.group(6))+int(m.group(7))/60+sec(m.group(8))/3600)
        if not(-70<la<-17 and -115<lo<-50): continue
        fin=ms[i+1].start() if i+1<len(ms) else m.end()+1500
        cuerpo=t[m.end():min(fin,m.end()+1500)]
        h=re.search(r"\s(?:[A-ZÁÉÍÓÚ][\wáéíóúñ]+)(?: [\wáéíóúñÁÉÍÓÚ’'´\-]+){0,5}\.[-–—]\s",cuerpo[40:])
        if h: cuerpo=cuerpo[:40+h.start()]
        cuerpo=re.sub(r'^\s*\(aprox\.\)\s*\.?','',cuerpo).strip(' .;')
        k=(nom.lower(),round(la,3),round(lo,3))
        if k in vistos: continue
        vistos.add(k)
        out.append({'n':nom,'t':nom.split()[0],'la':round(la,4),'lo':round(lo,4),'v':VOL[b],'c':re.sub(r'\s+',' ',m.group(2) or '').strip(' ,'),'tx':cuerpo,
                    'ab':bool(re.search(r'abrig|protegid|resguard|fondea|tenedero|surgidero',cuerpo,re.I))})
print(len(out)); print(Counter(o['t'] for o in out).most_common(22)); print(sum(o['ab'] for o in out),'con abrigo/fondeo')
for o in [x for x in out if any(k in x['n'] for k in ('Tortel','Tarn','Rolecha','Fildes','Quellón'))][:6]: print(o['n'],o['la'],o['lo'],o['v'],o['c'],'|',o['tx'][:300]); print()
json.dump(out,open('lugares_raw.json','w'),ensure_ascii=False)
