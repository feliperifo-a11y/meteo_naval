const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../build/plantilla.html'),'utf8');
const ctx={};vm.runInNewContext(source.slice(source.indexOf('const CAMPOS_BOYA ='),source.indexOf('let BOYAS_LEYENDO =')),ctx);
test('una boya conserva su observación meteorológica más reciente aunque no incluya altura de ola',()=>{
  const r=ctx.resumirBoya([{idBoya:1,fecha_completa:'2026-10-24 18:00:00',hsig:'1.4',tw:'13.5'},
    {idBoya:1,fecha_completa:'2026-10-24 19:00:00',hsig:null,taire:'17.2',mb:'1022'}]);
  assert.equal(r.ultimo.fecha,'2026-10-24T19:00:00.000Z');assert.equal(r.ultimo.taire,17.2);assert.equal(r.ultimo.mb,1022);
  assert.equal(r.ultimo.hsig,null);assert.equal(r.ultimo.tw,undefined);
  assert.equal(r.serie[0][1],1.4);
});
test('sin mediciones o sin fecha válida no genera una observación; los ceros medidos sí se conservan',()=>{
  assert.equal(ctx.resumirBoya([{idBoya:1,fecha_completa:'sin fecha',hsig:2}]).ultimo,null);
  assert.equal(ctx.resumirBoya([{idBoya:1,fecha_completa:'2026-10-24 18:00:00',hsig:null}]).ultimo,null);
  assert.equal(ctx.resumirBoya([{idBoya:1,fecha_completa:'2026-10-24 18:00:00',hsig:0,wsd:0}]).ultimo.hsig,0);
});
