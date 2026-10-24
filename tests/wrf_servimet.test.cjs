const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),ctx={};
for(const f of ['marejadas_uv.js','wrf_servimet.js'])vm.runInNewContext(fs.readFileSync(path.join(root,'build',f),'utf8'),ctx);
test('WRF consulta nudos y conserva el intervalo superior abierto, los símbolos y las calmas',()=>{
  const p=new Uint8ClampedArray(16);p[0]=1;p[4]=4;p[5]=7;p[8]=13;
  let r=ctx.wrfRango(p,4,1,0,0);assert.equal(r.minimo,0);assert.equal(r.maximo,5);
  r=ctx.wrfRango(p,4,1,1,0);assert.equal(r.minimo,15);assert.equal(r.maximo,20);assert.equal(r.distancia,700);
  r=ctx.wrfRango(p,4,1,2,0);assert.equal(r.minimo,60);assert.equal(r.maximo,null);
  assert.equal(ctx.wrfRango(p,4,1,3,0),null);
});
test('solo acepta las 25 fechas consecutivas de una misma inicialización en UTC y el dominio UV',()=>{
  assert.equal(ctx.wrfFecha('2026-10-24T12:00Z'),'24 oct 2026 · 12:00 UTC');
  assert.equal(ctx.wrfFecha('2026-10-24T12:00'),'Fecha no disponible');
  const d={schema:1,tipo:'wrf_servimet',crs_origen:'EPSG:32718',extent_utm:[653000,5921000,684000,5952000],grid_size:[733,733],resolucion_km:3,intervalo_nudos:5,bounds:[[-36.85,-73.29],[-36.55,-72.93]],consultado:'2026-10-24T18:00:00Z',inicializacion:'2026-10-24T12:00Z',frames:Array.from({length:25},(_,i)=>({fecha:new Date(Date.parse('2026-10-24T12:00Z')+i*10800000).toISOString().slice(0,16)+'Z',imagen:'AAAA',consulta:'AAAA'}))};
  assert.equal(ctx.wrfValidar(d),d);
  d.frames[3].fecha=d.frames[2].fecha;assert.throws(()=>ctx.wrfValidar(d));
  d.frames.splice(3,1);assert.throws(()=>ctx.wrfValidar(d));
});
test('WRF es opcional solo en dashboard y comparte controles UV con exclusión de escalas',()=>{
  const dashboard=fs.readFileSync(path.join(root,'dashboard.html'),'utf8'),principal=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(dashboard,/'talc_wrf', 'WRF SERVIMET'.*false,/);assert.doesNotMatch(principal,/crearWRFServimet|wrf_servimet.json/);
  assert.doesNotMatch(dashboard,/\/\*WRF_SERVIMET_JS\*\//);
  const start=dashboard.indexOf('function vistaPronosticoTalc('),end=dashboard.indexOf('function renderCapas()',start);
  const code=dashboard.slice(start,end),checks={talc_uv:{checked:true},talc_wrf:{checked:true}},calls=[];
  const c={window:{innerWidth:1280},LAYERS:{talc_uv:{set:v=>calls.push(['uv',v])},talc_wrf:{set:v=>calls.push(['wrf',v])}},document:{getElementById:id=>checks[id.slice(4)]},map:{closePopup:()=>{},hasLayer:()=>false},ocean:{}};
  vm.runInNewContext(code,c);c.vistaPronosticoTalc('talc_wrf');assert.deepEqual(calls,[['uv',false]]);assert.equal(checks.talc_uv.checked,false);assert.equal(checks.talc_wrf.checked,true);
  const wf=fs.readFileSync(path.join(root,'.github/workflows/actualizar.yml'),'utf8');assert.equal((wf.match(/for f in marejadas_uv.json wrf_servimet.json/g)||[]).length,2);assert.match(wf,/python scripts\/wrf_servimet.py/);
});
