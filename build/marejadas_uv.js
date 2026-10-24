// Alturas aproximadas de la escala de la carta UV. No son lecturas del modelo.
function uvUTM18(lat, lon) {
  const r = Math.PI / 180, a = 6378137, e2 = .0066943799901413165, ep = e2 / (1-e2), k = .9996;
  const p = lat*r, l = (lon+75)*r, n = a/Math.sqrt(1-e2*Math.sin(p)**2);
  const t = Math.tan(p)**2, c = ep*Math.cos(p)**2, A = Math.cos(p)*l;
  const m = a*((1-e2/4-3*e2**2/64-5*e2**3/256)*p-(3*e2/8+3*e2**2/32+45*e2**3/1024)*Math.sin(2*p)+(15*e2**2/256+45*e2**3/1024)*Math.sin(4*p)-35*e2**3/3072*Math.sin(6*p));
  return [500000+k*n*(A+(1-t+c)*A**3/6+(5-18*t+t*t+72*c-58*ep)*A**5/120),
    10000000+k*(m+n*Math.tan(p)*(A*A/2+(5-t+9*c+4*c*c)*A**4/24+(61-58*t+t*t+600*c-330*ep)*A**6/720))];
}
function uvPixel(lat, lon, datos) {
  const [x,y] = uvUTM18(lat,lon), [x0,y0,x1,y1] = datos.extent_utm, [w,h] = datos.grid_size;
  if (x<x0 || x>=x1 || y<=y0 || y>y1) return null;
  return [Math.floor((x-x0)/(x1-x0)*w), Math.floor((y1-y)/(y1-y0)*h)];
}
function uvRango(pixels, width, height, x, y) {
  const at = (a,b) => pixels[(b*width+a)*4];
  const centro = at(x,y);
  if (centro===255) return null; // Tierra: nunca buscar un valor en el mar vecino.
  let code = centro, distancia = 0;
  if (!(code>=1 && code<=16)) {
    let best = Infinity;
    for (let dy=-6;dy<=6;dy++) for (let dx=-6;dx<=6;dx++) {
      const a=x+dx,b=y+dy,d=dx*dx+dy*dy;
      if (a<0||a>=width||b<0||b>=height||d>36) continue;
      const v=at(a,b);
      if (v>=1&&v<=16&&d<best) { code=v; best=d; }
    }
    if (!(code>=1&&code<=16)) return null;
    distancia=Math.sqrt(best)*31000/733;
  }
  return { minimo:(code-1)*.25, maximo:code*.25, distancia };
}
function uvFecha(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return 'Fecha no disponible';
  return `${m[3]} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][+m[2]-1]} ${m[1]} · ${m[4]}:${m[5]} h UV`;
}
function uvValidar(d) {
  if (d?.schema!==1 || d.crs_origen!=='EPSG:32718' || d.grid_size?.join()!=='733,733' ||
    d.extent_utm?.join()!=='653000,5921000,684000,5952000' || !Array.isArray(d.frames) || d.frames.length<2 || d.frames.length>120 ||
    !Array.isArray(d.bounds) || d.bounds.length!==2 || !d.bounds.every(p=>p.length===2&&p.every(Number.isFinite)) || !Number.isFinite(Date.parse(d.consultado))) throw Error('Formato UV no reconocido');
  let anterior = 0;
  for (const f of d.frames) {
    const fecha=Date.parse(f.fecha+'Z');
    if (uvFecha(f.fecha)==='Fecha no disponible'||!Number.isFinite(fecha)||(anterior&&fecha-anterior!==10800000)||
      !/^[A-Za-z0-9+/=]+$/.test(f.imagen)||!/^[A-Za-z0-9+/=]+$/.test(f.consulta)) throw Error('Corrida UV incompleta');
    anterior=fecha;
  }
  return d;
}
function crearMarejadasUV(L, map, escapar, prepararVista) {
  const grupo=L.layerGroup();
  const panel=document.createElement('section'); panel.className='uv-panel'; panel.hidden=true;
  panel.setAttribute('aria-label','Control de Marejadas UV');
  panel.innerHTML='<div class="uv-cab"><b>Marejadas UV</b><a href="https://marejadas.uv.cl/pronosticos/cl19ta" target="_blank" rel="noopener noreferrer">Fuente UV ↗</a></div>'+
    '<p class="uv-estado" role="status">Cargando corrida…</p><div class="uv-tiempo" hidden><label>Fecha del pronóstico<select aria-label="Fecha del pronóstico Marejadas UV"></select></label>'+
    '<div class="uv-botones"><button type="button" class="uv-anterior" aria-label="Fecha anterior">◀</button><button type="button" class="uv-play">Reproducir</button><button type="button" class="uv-siguiente" aria-label="Fecha siguiente">▶</button></div>'+
    '<input class="uv-slider" type="range" min="0" step="1" value="0" aria-label="Avance de la corrida Marejadas UV">'+
    '<div class="uv-escala" aria-label="Escala de altura de cero a cuatro metros"></div><div class="uv-marcas"><span>0 m</span><span>1</span><span>2</span><span>3</span><span>4 m</span></div>'+
    '<p class="uv-ayuda">Pulsa el mar para ver un rango aproximado de altura.</p><details><summary>Actualización y alcance</summary><p class="uv-info"></p><p>Estimación por colores en intervalos de 0,25 m. Puede diferir del dato del modelo. Hora UV: la carta no indica zona horaria. La consulta en MeteoIA se revisa cada dos horas; la UV decide cuándo publica una corrida nueva.</p></details></div>';
  document.getElementById('mapWrap').appendChild(panel);
  L.DomEvent.disableClickPropagation(panel); L.DomEvent.disableScrollPropagation(panel);
  if (!map.getPane('uvPane')) { map.createPane('uvPane').style.zIndex=410; }
  const estado=panel.querySelector('.uv-estado'), selector=panel.querySelector('select'), slider=panel.querySelector('.uv-slider'), play=panel.querySelector('.uv-play');
  let datos=null, indice=0, timer=null, consultaTimer=null, cargando=false, overlay=null, canvas=null, frameVisible=-1, token=0, popup=null;
  const activo=()=>map.hasLayer(grupo);
  const detener=()=>{clearInterval(timer);timer=null;play.textContent='Reproducir';play.setAttribute('aria-pressed','false');};
  const imagen=(base,tipo)=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Imagen UV ilegible'));im.src=`data:image/${tipo};base64,${base}`;});
  function informacion() {
    const edad=Date.now()-Date.parse(datos.consultado), vencida=datos.frames.at(-1).fecha.slice(0,10)<new Date().toLocaleDateString('sv-SE');
    estado.textContent=(vencida?'Corrida vencida · ':edad>4*3600000?'Última corrida conservada · ':'')+uvFecha(datos.frames[indice].fecha);
    panel.querySelector('.uv-info').textContent=`Inicio: ${uvFecha(datos.frames[0].fecha)}. Última consulta: ${new Date(datos.consultado).toLocaleString('es-CL')}. ${datos.frames.length} fechas, cada 3 horas. Georreferencia aproximada desde la carta UTM 18S de la UV.`;
  }
  async function mostrar(n) {
    if (!datos||!activo()) return;
    const solicitud=++token; indice=(n+datos.frames.length)%datos.frames.length;
    const f=datos.frames[indice]; selector.value=String(indice);slider.value=String(indice);informacion();
    frameVisible=-1;panel.setAttribute('aria-busy','true');
    try {
      const [im,q]=await Promise.all([imagen(f.imagen,'webp'),imagen(f.consulta,'png')]);
      if (solicitud!==token||!activo()) return;
      if (q.width!==733||q.height!==733) throw Error('Cuadrícula UV desconocida');
      canvas=document.createElement('canvas');canvas.width=q.width;canvas.height=q.height;canvas.getContext('2d',{willReadFrequently:true}).drawImage(q,0,0);
      if (overlay) grupo.removeLayer(overlay);
      overlay=L.imageOverlay(im.src,datos.bounds,{pane:'uvPane',opacity:.80,interactive:true,bubblingMouseEvents:false,attribution:'Oleaje: Universidad de Valparaíso · Marejadas UV'}).on('click',click).addTo(grupo);
      frameVisible=indice;
    } catch(e) { if (solicitud===token) { detener();estado.textContent='No se pudo mostrar esta fecha de la corrida UV.'; } }
    finally { if(solicitud===token)panel.setAttribute('aria-busy','false'); }
  }
  async function cargar() {
    if (cargando||!activo()) return; cargando=true;
    try {
      const r=await fetch('data/marejadas_uv.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(45000)});
      if(!r.ok)throw Error('Sin corrida publicada');
      const nueva=uvValidar(await r.json());
      const fecha=datos?.frames[indice]?.fecha, cambio=nueva.sha256!==datos?.sha256;
      datos=nueva;
      if(cambio||!selector.options.length) {
        detener();selector.replaceChildren();datos.frames.forEach((f,i)=>{const o=document.createElement('option');o.value=i;o.textContent=uvFecha(f.fecha);selector.appendChild(o);});
        slider.max=datos.frames.length-1;
        indice=Math.max(0,datos.frames.findIndex(f=>f.fecha===fecha));
      }
      panel.querySelector('.uv-tiempo').hidden=false;
      if(cambio||frameVisible<0)await mostrar(indice);else informacion();
    } catch(e) {
      if (activo()) { if(datos) { informacion();estado.textContent='Sin conexión · '+estado.textContent; } else estado.textContent='No hay corrida UV disponible. Revisa el enlace a la fuente.'; }
    } finally { cargando=false; }
  }
  selector.onchange=()=>{detener();if(popup)map.closePopup(popup);mostrar(+selector.value);};
  slider.oninput=()=>{detener();if(popup)map.closePopup(popup);mostrar(+slider.value);};
  panel.querySelector('.uv-anterior').onclick=()=>{detener();if(popup)map.closePopup(popup);mostrar(indice-1);};
  panel.querySelector('.uv-siguiente').onclick=()=>{detener();if(popup)map.closePopup(popup);mostrar(indice+1);};
  play.onclick=()=>{if(timer)detener();else {if(popup)map.closePopup(popup);play.textContent='Pausar';play.setAttribute('aria-pressed','true');timer=setInterval(()=>{if(frameVisible===indice)mostrar(indice+1);},900);}};
  function click(e) {
    if(!datos||!canvas||frameVisible!==indice)return;
    const pixel=uvPixel(e.latlng.lat,e.latlng.lng,datos);if(!pixel)return;
    detener();
    const r=uvRango(canvas.getContext('2d').getImageData(0,0,733,733).data,733,733,...pixel);
    const numero=n=>n.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
    const contenido=`<section class="uv-ficha"><b>Marejadas UV · altura aproximada</b><p>${escapar(uvFecha(datos.frames[indice].fecha))}</p>`+
      (r?`<strong>${numero(r.minimo)}–${numero(r.maximo)} m</strong><p>Rango estimado según el color de la imagen UV.${r.distancia?` Lectura de un píxel a ${Math.ceil(r.distancia)} m del punto pulsado.`:''}</p>`:'<p>Sin altura interpretable en este punto de la imagen (tierra, fuera de datos o símbolo).</p>')+
      `<p>${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}</p><a href="https://marejadas.uv.cl/pronosticos/cl19ta" target="_blank" rel="noopener noreferrer">Consultar pronóstico UV ↗</a></section>`;
    panel.classList.add('uv-consulta');
    popup=L.popup({autoPanPaddingBottomRight:[15,100],pane:'talcPopupPane',className:'uv-popup',maxWidth:Math.min(310,map.getContainer().clientWidth-70)}).setLatLng(e.latlng).setContent(contenido).on('remove',()=>panel.classList.remove('uv-consulta')).openOn(map);
  }
  grupo.on('add',()=>{panel.hidden=false;document.getElementById('mapWrap').classList.add('uv-activa');prepararVista();map.on('click',click);if(datos)mostrar(indice);cargar();consultaTimer=setInterval(cargar,7200000);map.fitBounds([[-36.845,-73.284],[-36.559,-72.938]],{padding:[35,35],maxZoom:12});});
  grupo.on('remove',()=>{detener();clearInterval(consultaTimer);++token;panel.hidden=true;panel.setAttribute('aria-busy','false');document.getElementById('mapWrap').classList.remove('uv-activa');map.off('click',click);if(popup)map.closePopup(popup);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)detener();else if(activo())cargar();});
  return grupo;
}
