const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'build/plantilla_v2.html'),'utf8');
test('el panel SITPORT agrupa por bahía, incluye restricciones sin ubicación y escapa el contenido de la fuente',()=>{
  const nodos={puertosNota:{},listaPuertos:{}},ctx={BAHIA_POS:{71:[-18,-70],98:[-36,-73]},document:{getElementById:id=>nodos[id],querySelectorAll:()=>[]},fmtDM:()=> '25/10/2026 08:00',escH:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),popupPuerto:(n,l)=>'<p>Detalle '+l.length+'</p>'};
  vm.runInNewContext(source.slice(source.indexOf('const txtSitport'),source.indexOf('function popupPuerto'))+source.slice(source.indexOf('function agruparPuertos'),source.indexOf('function aplicarRestricciones')),ctx);
  const d={bahias:[{IDBahia:71,NMBahia:'Arica'},{IDBahia:98,NMBahia:'Talcahuano'}],restricciones:[{bahia:98,MotivoRestriccion:'Viento'},{bahia:'71',MotivoRestriccion:'Oleaje'},{bahia:71,MotivoRestriccion:'Oleaje'},{bahia:999,GLBahia:'<img src=x>',MotivoRestriccion:'<script>mal</script>'}],actualizado:'2026-10-25T11:00:00Z',vivo:false};
  const g=ctx.agruparPuertos(d);assert.deepEqual(Array.from(g,x=>x.id),['71','98','999']);assert.equal(g[0].lista.length,2);
  ctx.pintarPuertos(d);assert.match(nodos.puertosNota.textContent,/3 bahías · 4 restricciones/);assert.match(nodos.puertosNota.textContent,/Copia publicada/);
  assert.match(nodos.listaPuertos.innerHTML,/&lt;img/);assert.doesNotMatch(nodos.listaPuertos.innerHTML,/<script>|<img/);assert.equal((nodos.listaPuertos.innerHTML.match(/data-bahia=/g)||[]).length,2);
  ctx.pintarPuertos({...d,restricciones:[],vivo:true});assert.match(nodos.puertosNota.textContent,/Consulta en vivo/);assert.match(nodos.listaPuertos.innerHTML,/no informa restricciones/);assert.doesNotMatch(nodos.listaPuertos.innerHTML,/puerto-resumen/);
});
test('la carga comparte la petición, muestra respaldo primero y conserva los datos ante fallo total',async()=>{
  const nota={},backup={bahias:[],restricciones:[{bahia:71}],actualizado:'2026-10-25T11:00:00Z'},aplicados=[];let terminar;
  const ctx={document:{getElementById:()=>nota},leerJSON:async()=>backup,leerRestricciones:()=>new Promise(r=>terminar=r),aplicarRestricciones:d=>{ctx.PUERTO_DATOS=d;aplicados.push(d);},PUERTO_CARGA:null,PUERTO_DATOS:null};
  vm.runInNewContext(source.slice(source.indexOf('function cargarPuertos()'),source.indexOf('setInterval(cargarPuertos')),ctx);
  const a=ctx.cargarPuertos(),b=ctx.cargarPuertos();assert.equal(a,b);await new Promise(setImmediate);assert.equal(aplicados.length,1);assert.equal(aplicados[0].vivo,false);
  terminar({bahias:[],restricciones:[],vivo:true});await a;assert.equal(aplicados.length,2);assert.equal(ctx.PUERTO_DATOS.restricciones.length,0);assert.equal(ctx.PUERTO_CARGA,null);
  const c=ctx.cargarPuertos();terminar(null);await c;assert.match(nota.textContent,/Se conserva la última/);assert.equal(aplicados.length,2);
});
test('el resumen queda entre avisos y estaciones y mantiene actualización independiente de la capa',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(html.indexOf('id="alertas"')<html.indexOf('id="estadoPuertos"'));assert(html.indexOf('id="estadoPuertos"')<html.indexOf('id="estaciones"'));
  assert.match(html,/setInterval\(cargarPuertos, 10 \* 60000\)/);assert.match(html,/cargar\(\); cargarPuertos\(\)/);
});
