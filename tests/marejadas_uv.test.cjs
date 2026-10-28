const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const root=path.join(__dirname,'..'),ctx={};
vm.runInNewContext(fs.readFileSync(path.join(root,'build/marejadas_uv.js'),'utf8'),ctx);
const geo={extent_utm:[653000,5921000,684000,5952000],grid_size:[733,733]};
test('georreferencia UTM 18S coincide con puntos de control independientes de PROJ',()=>{
  const [x,y]=ctx.uvUTM18(-36.84453063533342,-73.28399676311288);
  assert(Math.abs(x-653000)<.01);assert(Math.abs(y-5921000)<.01);
  assert.equal(ctx.uvPixel(-18.48,-70.3,geo),null);
  assert.equal(ctx.uvPixel(-36.7,-73.1,geo).length,2);
});
test('rango de color distingue tierra y permite consultar bajo una flecha sin inventar un dato en tierra',()=>{
  const w=20,h=20,p=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++){p[i*4]=5;p[i*4+3]=255;}
  const pos=(x,y)=>4*(y*w+x);
  let r=ctx.uvRango(p,w,h,10,10);assert.equal(r.minimo,1);assert.equal(r.maximo,1.25);assert.equal(r.distancia,0);
  p[pos(10,10)]=254;r=ctx.uvRango(p,w,h,10,10);assert.equal(r.minimo,1);assert(r.distancia>0);
  p[pos(10,10)]=255;assert.equal(ctx.uvRango(p,w,h,10,10),null);
  p.fill(0);assert.equal(ctx.uvRango(p,w,h,10,10),null);
});
test('las fechas UV no reciben una zona horaria inventada y una corrida incompleta se rechaza',()=>{
  assert.equal(ctx.uvFecha('2026-10-24T03:00'),'24 oct 2026 · 03:00 h UV');
  const d={schema:1,crs_origen:'EPSG:32718',...geo,bounds:[[-36.85,-73.29],[-36.55,-72.93]],consultado:'2026-10-24T18:00:00+00:00',frames:[{fecha:'2026-10-24T00:00',imagen:'AAAA',consulta:'AAAA'},{fecha:'2026-10-24T03:00',imagen:'AAAA',consulta:'AAAA'}]};
  assert.equal(ctx.uvValidar(d),d);d.frames[1].fecha='2026-10-24T06:00';assert.throws(()=>ctx.uvValidar(d));
  d.frames[1].fecha='2026-10-24T03:00';d.extent_utm=[0,0,1,1];assert.throws(()=>ctx.uvValidar(d));
});
test('Marejadas UV está desactivada inicialmente y solo pertenece al dashboard y al recolector con caché de dos horas',()=>{
  const dashboard=fs.readFileSync(path.join(root,'dashboard.html'),'utf8'),principal=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(dashboard,/'talc_uv', 'Marejadas UV'.*false,/);assert.doesNotMatch(principal,/crearMarejadasUV/); // La portada reutiliza el CSS del panel para otros modelos.
  assert.doesNotMatch(dashboard,/\/\*MAREJADAS_UV_(JS|CSS)\*\//);
  const wf=fs.readFileSync(path.join(root,'.github/workflows/actualizar.yml'),'utf8');
  assert.equal((wf.match(/for f in marejadas_uv.json/g)||[]).length,2);
  assert.match(wf,/python scripts\/marejadas_uv.py/);
  assert.match(fs.readFileSync(path.join(root,'scripts/marejadas_uv.py'),'utf8'),/TTL = 2 \* 3600/);
});

test('Valparaíso usa UTM 19S y rechaza una corrida de otra bahía',()=>{
  const [x,y]=ctx.uvUTM(-33.02,-71.6,19);
  assert(Math.abs(x-257139.53502676205)<.01);assert(Math.abs(y-6343491.844790129)<.01);
  const d={schema:1,dominio:'valparaiso',fuente:'https://marejadas.uv.cl/pronosticos/cl15va',crs_origen:'EPSG:32719',extent_utm:[246688,6339476,264181,6353462],grid_size:[742,594],maximo_metros:5,bounds:[[-33.06,-71.72],[-32.93,-71.52]],consultado:'2026-10-24T18:00:00Z',frames:[{fecha:'2026-10-24T00:00',imagen:'AAAA',consulta:'AAAA'},{fecha:'2026-10-24T03:00',imagen:'AAAA',consulta:'AAAA'}]};
  assert.equal(ctx.uvValidar(d,'valparaiso'),d);assert.throws(()=>ctx.uvValidar(d));
  assert.equal(ctx.uvPixel(-36.7,-73.1,d),null);
  assert.deepEqual(Array.from(ctx.uvPixel(-33.02,-71.6,d)),[443,423]);
  d.maximo_metros=4;assert.throws(()=>ctx.uvValidar(d,'valparaiso'));
});
test('Valparaíso interpreta hasta cinco metros y calcula la distancia con su propia resolución',()=>{
  const w=20,h=20,p=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)p[i*4]=20;
  let r=ctx.uvRango(p,w,h,10,10,5,23.57);assert.equal(r.minimo,4.75);assert.equal(r.maximo,5);
  p[(10*w+10)*4]=254;r=ctx.uvRango(p,w,h,10,10,5,23.57);assert.equal(r.distancia,23.57);
});
test('las dos bahías tienen capas UV optativas, archivos separados y un único panel visible',()=>{
  const html=fs.readFileSync(path.join(root,'dashboard.html'),'utf8');
  assert.match(html,/'valpo_uv', 'Marejadas UV'.*false,.*'valparaiso'/);
  assert.match(html,/\['talc_uv','talc_wrf','valpo_uv'\]/);
  const wf=fs.readFileSync(path.join(root,'.github/workflows/actualizar.yml'),'utf8');
  assert.equal((wf.match(/for f in [^\n]*marejadas_uv_valparaiso.json/g)||[]).length,2);
  assert.match(wf,/python scripts\/marejadas_uv.py --dominio valparaiso/);
});
