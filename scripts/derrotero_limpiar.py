# Limpia lugares_raw.json y genera data/derrotero_lugares.json (texto breve: descripción y frases sobre abrigo o fondeo).
import re,json
L=json.load(open('lugares_raw.json'))
TIPO_ABRIGO={'Caleta','Bahía','Puerto','Seno','Ensenada','Fondeadero','Rada','Surgidero','Estero','Abra','Caletas','Fiordo','Puertecillo'}
def limpia(t):
    t=re.sub(r'\(30\d\d\)\s*[IVXF]+[-­ ]?\d*(?:-\d+)*','',t)
    t=re.sub(r'[IVX]+-\d+-\d+\s*\(30\d\d\)','',t)
    t=re.sub(r'\bCap\. [IVX]+\b','',t)
    t=re.sub(r'(?<=[\s,;.])(?:10|20|30|40)\s(?=[a-záéíóúñ(—])','',t)       # números de línea al margen
    t=re.sub(r'\b[A-ZÁÉÍÓÚÑ]{3,}(?:[ \-–—.,]+[A-ZÁÉÍÓÚÑ]{2,}){2,}\b','',t)  # títulos corridos en mayúsculas
    t=re.sub(r'Cartas?:\s*(?:[\dA-Z]+\s*[-–]\s*)*[\dA-Z]+(?:\s*[-–]\s*UKHO\s*\d+)?','',t)
    t=re.sub(r'Cambio N[ºo°]?\s*\d+,?\s*\w+\s*\d{4}\.?','',t)
    t=re.sub(r'\(Ver [Cc]roquis\)\.?|Croquis referencial[^.]*?(?=\s[A-Z][a-z])','',t)
    t=re.sub(r'\s+',' ',t).strip(' .;,')
    return t
def frases(t):
    return [f.strip() for f in re.split(r'(?<=[a-záéíóúñ)\d])\.\s+(?=[A-ZÁÉÍÓÚ])',t) if len(f.strip())>8]
out=[]
for o in L:
    tx=limpia(o['tx']); F=frases(tx)
    if not F: continue
    desc=F[0]
    clave=[f for f in F[1:] if re.search(r'abrig|protegid|resguard|fondea|tenedero|surgidero|[Aa]pt[ao]s? |embarcaciones menores|buques (?:pequeños|menores|mayores)|vientos? del|travesía|marejada|desabrigad',f,re.I)]
    txt=(desc+'. '+'. '.join(clave[:3])).strip()
    if len(txt)>520: txt=txt[:517].rsplit(' ',1)[0]+'…'
    elif not txt.endswith('.'): txt+='.'
    menores=bool(re.search(r'(?:s[oó]lo|únicamente)[^.]{0,40}(?:embarcaciones menores|buques (?:muy )?pequeños)',tx,re.I))
    fon=o['t'] in TIPO_ABRIGO and o['ab']
    out.append([o['n'],round(o['la'],4),round(o['lo'],4),o['v'],o['c'],txt,1 if fon else 0,1 if menores else 0])
print(len(out),sum(x[6] for x in out),'fondeaderos/abrigos',sum(x[7] for x in out),'solo menores')
for x in out[::150]: print(x[0],'|',x[5][:220])
js={'fuente':'Derrotero de la Costa de Chile, Pub. SHOA N° 3001 a 3006 (corregido al Boletín de Noticias a los Navegantes de octubre de 2026)','campos':['nombre','lat','lon','volumen','cartas','texto','abrigo','solo_menores'],'lugares':out}
open('/home/claude/meteo_naval/data/derrotero_lugares.json','w').write(json.dumps(js,ensure_ascii=False,separators=(',',':')))
