// ============================ Informe de la ruta de navegación: Word (.docx) e impresión / PDF ============================
// Sin bibliotecas externas: el .docx se arma en el navegador (XML de WordprocessingML dentro de un ZIP sin compresión).
// inf = { titulo, subtitulo, datos: [[campo, valor]], secciones: [{ titulo, parrafos: [texto], tabla: { cab: [], filas: [[]], anchos: [] }, nota }] }
const RUTA_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function rutaCrc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = RUTA_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function rutaZip(archivos) {   // [{ nombre, texto }] → Blob (método "store")
  const enc = new TextEncoder(), partes = [], central = []; let off = 0;
  const u16 = v => [v & 255, (v >>> 8) & 255], u32 = v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const a of archivos) {
    const nom = enc.encode(a.nombre), dat = enc.encode(a.texto), crc = rutaCrc32(dat);
    const cab = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(dat.length), ...u32(dat.length), ...u16(nom.length), ...u16(0)];
    partes.push(new Uint8Array(cab), nom, dat);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(dat.length), ...u32(dat.length), ...u16(nom.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nom);
    off += cab.length + nom.length + dat.length;
  }
  const tamC = central.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(archivos.length), ...u16(archivos.length), ...u32(tamC), ...u32(off), ...u16(0)]);
  return new Blob([...partes, ...central, fin], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
function rutaDocx(inf) {
  const x = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const run = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 20}"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
  const par = (contenido, o = {}) => `<w:p><w:pPr><w:spacing w:before="${o.antes || 0}" w:after="${o.despues == null ? 80 : o.despues}"/>${o.centro ? '<w:jc w:val="center"/>' : ''}</w:pPr>${contenido}</w:p>`;
  const borde = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="B7C3D0"/>`).join('') + '</w:tblBorders>';
  const celda = (t, ancho, cab) => `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/>${cab ? '<w:shd w:val="clear" w:color="auto" w:fill="0F3B66"/>' : ''}<w:tcMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>${par(run(t, cab ? { b: true, color: 'FFFFFF', sz: 17 } : { sz: 17 }), { despues: 0 })}</w:tc>`;
  const tabla = (tb, total) => {
    const n = tb.cab.length, pesos = tb.anchos || tb.cab.map(() => 1), sp = pesos.reduce((s, v) => s + v, 0), an = pesos.map(v => Math.round(total * v / sp));
    return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${borde}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${an.map(a => `<w:gridCol w:w="${a}"/>`).join('')}</w:tblGrid>` +
      `<w:tr><w:trPr><w:tblHeader/></w:trPr>${tb.cab.map((c, i) => celda(c, an[i], true)).join('')}</w:tr>` +
      tb.filas.map(f => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${f.slice(0, n).map((c, i) => celda(c, an[i], false)).join('')}</w:tr>`).join('') + '</w:tbl>';
  };
  const ANCHO = 15398;   // A4 apaisado con márgenes de 0,5" (en twips)
  let cuerpo = par(run(inf.titulo, { b: true, sz: 32, color: '0F3B66' }), { despues: 40 }) + par(run(inf.subtitulo, { sz: 18, color: '5A6B7C' }), { despues: 160 });
  cuerpo += tabla({ cab: ['Dato', 'Valor'], filas: inf.datos, anchos: [1, 3] }, ANCHO);
  for (const s of inf.secciones) {
    cuerpo += par(run(s.titulo, { b: true, sz: 24, color: 'C2410C' }), { antes: 240, despues: 80 });
    for (const p of s.parrafos || []) cuerpo += par(run(p));
    if (s.tabla && s.tabla.filas.length) cuerpo += tabla(s.tabla, ANCHO);
    if (s.nota) cuerpo += par(run(s.nota, { i: true, sz: 17, color: '5A6B7C' }), { antes: 60 });
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}` +
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>';
  return rutaZip([
    { nombre: '[Content_Types].xml', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { nombre: '_rels/.rels', texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { nombre: 'word/document.xml', texto: doc }
  ]);
}
function rutaHtmlInforme(inf) {
  const x = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tabla = tb => `<table><thead><tr>${tb.cab.map(c => `<th>${x(c)}</th>`).join('')}</tr></thead><tbody>${tb.filas.map(f => `<tr>${f.map(c => `<td>${x(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${x(inf.titulo)}</title><style>
    @page{size:A4 landscape;margin:12mm}body{font:10.5pt Calibri,Arial,sans-serif;color:#1d2733;margin:0 auto;max-width:1100px;padding:16px}
    h1{color:#0f3b66;font-size:20pt;margin:0 0 2px}.sub{color:#5a6b7c;margin:0 0 12px}h2{color:#c2410c;font-size:13pt;margin:18px 0 6px;break-after:avoid}
    table{border-collapse:collapse;width:100%;margin:4px 0}th{background:#0f3b66;color:#fff;text-align:left}th,td{border:1px solid #b7c3d0;padding:3px 6px;font-size:9.5pt;vertical-align:top}
    tr{break-inside:avoid}thead{display:table-header-group}.nota{color:#5a6b7c;font-style:italic;font-size:9pt}p{margin:3px 0}
    @media screen{.barra{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #ddd;margin-bottom:10px}.barra button{font:inherit;padding:6px 14px;cursor:pointer}}@media print{.barra{display:none}}
    </style></head><body><div class="barra"><button onclick="print()">Imprimir o guardar como PDF</button></div>
    <h1>${x(inf.titulo)}</h1><p class="sub">${x(inf.subtitulo)}</p>${tabla({ cab: ['Dato', 'Valor'], filas: inf.datos })}` +
    inf.secciones.map(s => `<h2>${x(s.titulo)}</h2>${(s.parrafos || []).map(p => `<p>${x(p)}</p>`).join('')}${s.tabla && s.tabla.filas.length ? tabla(s.tabla) : ''}${s.nota ? `<p class="nota">${x(s.nota)}</p>` : ''}`).join('') +
    '</body></html>';
}
