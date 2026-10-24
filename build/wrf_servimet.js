// La carta declara fechas Z: se muestran explícitamente en UTC.
function wrfFecha(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(value)) return 'Fecha no disponible';
  return uvFecha(value.slice(0,-1)).replace('h UV','UTC');
}
function wrfRango(pixels, width, height, x, y) {
  const i=(y*width+x)*4, code=pixels[i];
  if(code<1||code>13)return null;
  return {minimo:(code-1)*5,maximo:code===13?null:code*5,distancia:pixels[i+1]*100};
}
function wrfValidar(d) {
  if(d?.schema!==1||d.tipo!=='wrf_servimet'||d.crs_origen!=='EPSG:32718'||d.grid_size?.join()!=='733,733'||
    d.extent_utm?.join()!=='653000,5921000,684000,5952000'||d.resolucion_km!==3||d.intervalo_nudos!==5||
    !Array.isArray(d.frames)||d.frames.length!==25||!Number.isFinite(Date.parse(d.consultado))||
    !Array.isArray(d.bounds)||d.bounds.length!==2||!d.bounds.every(p=>p.length===2&&p.every(Number.isFinite))||
    wrfFecha(d.inicializacion)==='Fecha no disponible')throw Error('Formato WRF no reconocido');
  const init=Date.parse(d.inicializacion);
  d.frames.forEach((f,i)=>{
    if(wrfFecha(f.fecha)==='Fecha no disponible'||Date.parse(f.fecha)!==init+i*10800000||
      !/^[A-Za-z0-9+/=]+$/.test(f.imagen)||!/^[A-Za-z0-9+/=]+$/.test(f.consulta))throw Error('Corrida WRF incompleta');
  });
  return d;
}
function crearWRFServimet(L,map,escapar,prepararVista) {
  return crearPronosticoRaster(L,map,escapar,prepararVista,'wrf');
}
