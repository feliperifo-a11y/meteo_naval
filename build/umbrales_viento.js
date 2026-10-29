// ============================ Umbrales de aviso por viento (PD OPE-07, SMA, 05-08-2025) ============================
// Compartido por la portada y Desarrollo para las alertas por viento observado en estaciones. Cada estación toma los
// parámetros del Centro Meteorológico Marítimo (CMM) cuya área de responsabilidad la contiene (PD OPE-07, cap. VII).
// Amarilla: umbral de aviso de mal tiempo del área. Roja: 34 kt o más (temporal o viento fuerte, fuerza 8 Beaufort);
// en Magallanes también racha de 50 kt o más. Una estación informa el viento de un instante: no evalúa duración ni extensión.
const PD_OPE07 = 'PD OPE-07 «Elaboración y emisión de avisos meteorológicos» (SMA, 05-08-2025)';
// Viento "general Norte": componente norte, procedencia entre 270° y 90° pasando por el norte.
const vientoNorte = d => d == null || isNaN(d) || d >= 270 || d <= 90;
const vientoEste = d => d == null || isNaN(d) || (d >= 22.5 && d <= 157.5);   // NE, E y SE (Magallanes)
function cmmViento(lat, lon) {
  if (lon != null && lon < -76.5) return { id: 'islas', nombre: 'CMM Valparaíso (Juan Fernández e Isla de Pascua)', mt: 20, cond: () => true, condTxt: 'cualquier dirección' };
  if (lat >= -26) return { id: 'iqq', nombre: 'CMM Iquique', mt: 20, cond: vientoNorte, condTxt: 'componente norte' };
  if (lat >= -34.6) return { id: 'val', nombre: 'CMM Valparaíso', mt: 20, cond: vientoNorte, condTxt: 'componente norte' };
  if (lat >= -40.2) return { id: 'tal', nombre: 'CMM Talcahuano', mt: 30, cond: vientoNorte, condTxt: 'componente norte' };
  // Puerto Montt: la mayoría de las estaciones está en aguas interiores, donde el mal tiempo parte en 25 kt de cualquier
  // dirección (con más de 6 h, que una observación no permite verificar).
  if (lat >= -48.8) return { id: 'pmo', nombre: 'CMM Puerto Montt', mt: 25, cond: () => true, condTxt: 'cualquier dirección' };
  return { id: 'mag', nombre: 'CMM Magallanes', mt: 20, cond: vientoEste, condTxt: 'del NE, E o SE', racha: 50 };
}
// Nivel de alerta para una observación de viento (kt): null, 'am' o 'rj', con el texto del criterio aplicado.
function alertaVientoEst(lat, lon, kt, dir, racha) {
  if (kt == null) return null;
  const c = cmmViento(lat, lon);
  if (kt >= 34) return { n: 'rj', um: 34, c, txt: 'viento de 34 kt o más (fuerza 8)' };
  if (c.racha && racha != null && racha >= c.racha) return { n: 'rj', um: 34, c, txt: `racha de ${c.racha} kt o más` };
  if (kt >= c.mt && c.cond(dir)) return { n: 'am', um: c.mt, c, txt: `viento de ${c.mt} kt o más, ${c.condTxt}` };
  return null;
}
const TXT_UMBRAL_VIENTO = 'viento ≥ 20 kt con componente norte de Arica a 34,6° S; ≥ 30 kt de 34,6° S a 40,2° S; ≥ 25 kt de 40,2° S a 48,8° S; ≥ 20 kt del NE/E/SE en Magallanes; ≥ 20 kt en las islas; roja ≥ 34 kt';
