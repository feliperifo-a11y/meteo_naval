"""Genera build/rutas_tipo.js a partir de las trazas calculadas por rutas_tipo_trazar.js (archivos *_out.json)."""
import json, math, sys
def mn(p, q):
    c = math.cos(math.radians((p[0] + q[0]) / 2)); return math.hypot((q[0] - p[0]) * 60, (q[1] - p[1]) * 60 * c)
def dp(P, tol):
    if len(P) < 3: return P
    keep = [False] * len(P); keep[0] = keep[-1] = True; st = [(0, len(P) - 1)]
    while st:
        a, b = st.pop()
        if b <= a + 1: continue
        c = math.cos(math.radians(P[a][0])); ax, ay = P[a][1] * 60 * c, P[a][0] * 60; bx, by = P[b][1] * 60 * c, P[b][0] * 60
        dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy; md = -1; mi = -1
        for i in range(a + 1, b):
            px, py = P[i][1] * 60 * c, P[i][0] * 60
            t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) if l2 else 0
            d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > md: md = d; mi = i
        if md > tol: keep[mi] = True; st += [(a, mi), (mi, b)]
    return [p for p, k in zip(P, keep) if k]
PASOS = {
 'chacao': {'n': 'Canal Chacao', 'carta': '7210', 'p': [-41.79, -73.60], 'velMin': 10, 'ref': 'Pub. SHOA N° 3002, cap. VII, primera parte',
   'nota': 'Calado aéreo máximo bajo el cable: 59 m. Las naves con velocidad menor a 10 nudos deben cruzarlo con corriente a favor. Informar a Corona Radio la hora de inicio del cruce y la ETA al bajo Colo-Colo y a la roca Remolinos.'},
 'pulluche': {'n': 'Canal Pulluche', 'carta': '8640', 'p': [-45.80, -74.45], 'calado': 9.0, 'ref': 'Pub. SHOA N° 3002, cap. VIII, segunda parte',
   'nota': 'Calado máximo 9,0 m por el W de la boya Bajo Roepke y 7,5 m por el E (más marea; UKA 1,3 m). Informar ETA a la boya Bajo Roepke.'},
 'inglesa': {'n': 'Angostura Inglesa', 'carta': '9510', 'p': [-48.97, -74.42], 'eslora': 180, 'calado': 10.7, 'luz': True, 'ref': 'Pub. SHOA N° 3003, cap. IX, cuarta parte',
   'nota': 'Eslora máxima 180 m y calado máximo 10,7 m. Tránsito en estoa o con corriente débil y con luz diurna, hasta el crepúsculo civil. Informar ETA entre el islote Clío y la punta Cedar.'},
 'escape': {'n': 'Canal Escape (paso del Abismo / paso Piloto Pardo)', 'carta': '9530', 'p': [-49.60, -74.45], 'luz': True, 'ref': 'Pub. SHOA N° 3003, cap. IX, cuarta parte',
   'nota': 'Solo con luz diurna. De N a S se navega por el paso del Abismo; de S a N, por el paso Piloto Pardo. Informar ETA a la cuadra del islote Centro (N a S) o de la punta Entrada (S a N).'},
 'guia': {'n': 'Angostura Guía', 'carta': '10340', 'p': [-50.73, -74.47], 'ref': 'Pub. SHOA N° 3003, cap. X, tercera parte',
   'nota': 'Informar ETA a la punta Porpoise y a la isla Escala Alta.'},
 'smyth': {'n': 'Canal Smyth (paso Summer o canal Gray)', 'carta': '10722', 'p': [-52.30, -73.62], 'luz': True, 'ref': 'Pub. SHOA N° 3003, cap. X, tercera y cuarta parte',
   'opciones': [{'n': 'canal Gray', 'eslora': 230, 'calado': 12.0}, {'n': 'paso Summer', 'calado': 7.35}],
   'nota': 'Por el canal Gray: eslora máxima 230 m, calado máximo 12,0 m más marea y tránsito con luz diurna hasta el crepúsculo civil. Por el paso Summer: calado máximo 7,35 m más marea (UKA 0,75 m). Navegando del sur, informar la hora de ingreso a la Estación de Control de Tráfico Marítimo faro Bahía Félix.'},
 'shoal': {'n': 'Paso Shoal', 'carta': '10750', 'p': [-52.55, -73.65], 'ref': 'Pub. SHOA N° 3003, cap. X, cuarta parte',
   'nota': 'Navegando del sur, informar la hora de ingreso a la Estación de Control de Tráfico Marítimo faro Bahía Félix, y la hora estimada entre la punta George y la isla Shoal.'},
 'kirke': {'n': 'Angostura Kirke o angostura White', 'carta': '10641 / 10631', 'p': [-52.08, -73.0], 'luz': True, 'ref': 'Pub. SHOA N° 3003, cap. X, séptima parte',
   'opciones': [{'n': 'angostura Kirke', 'eslora': 150, 'calado': 6.3, 'manga': 23}, {'n': 'angostura White (canal Santa María)', 'eslora': 140, 'calado': 7.0}],
   'nota': 'Acceso al golfo Almirante Montt y a Puerto Natales. Angostura Kirke: eslora máxima 150 m, calado 6,3 m y manga 23 m. Angostura White: eslora máxima 140 m y calado 7,0 m. En ambas: tránsito en estoa o con corriente débil y con luz diurna, hasta el crepúsculo civil; las naves de más de 120 m de eslora deben tener una embarcación menor de asistencia para observar la corriente; preferencia de paso a los buques de más de 100 m de eslora.'},
}
PASOS.update({
 'obrien': {'n': "Canal O'Brien", 'carta': '12720', 'p': [-54.90, -70.62], 'ref': 'Pub. SHOA N° 3005, cap. XII, tercera parte',
   'nota': "Informar ETA al islote Redondo y a la punta Acevedo. Preferencia de paso al buque que navega de E a W."},
 'timbales': {'n': 'Paso Timbales', 'carta': '12720', 'p': [-54.88, -70.35], 'ref': 'Pub. SHOA N° 3005, cap. XII, tercera parte',
   'nota': 'Informar ETA a la baliza luminosa Islote Cóndor o a la boya luminosa Bajo Walton. Preferencia de paso al buque que navega de W a E; la nave que viene del E puede optar por el paso Occidental para evitar el cruce.'},
})
PASOS['dalcahue'] = {'n': 'Canal Dalcahue', 'carta': '7371', 'p': [-42.40, -73.67], 'aereo': 44.3, 'ref': 'Pub. SHOA N° 3002, cap. VII, segunda parte',
   'nota': 'Instrucciones obligatorias: ninguna nave debe adelantar ni cruzarse con otra entre la punta Balseo (N) y la punta Chulequehue (S). Una hora antes, alerta de seguridad DSC por canal 70 VHF y SECURITE por canal 16 VHF (nombre, posición, sentido del cruce y hora frente a los bancos del Astillero y del Pasaje), repetida cada 15 minutos. Preferencia de paso a la nave que navega de N a S; la que viene del S espera al S de la punta Chulequehue. Cables de alta tensión con elevación mínima de 44,34 m sobre las más altas pleamares.'}
PASOS['mackinlay'] = {'n': 'Paso Mackinlay', 'carta': '13100', 'p': [-54.915, -67.40], 'ref': 'Pub. SHOA N° 3005, cap. XIII, tercera parte',
   'nota': 'Informar la hora de tránsito y la ETA a la punta Espora a la Estación de Control de Tráfico Marítimo de Puerto Williams. Preferencia de paso al buque que navega de W a E.'}
# Antártica (Pub. SHOA N° 3006): pasos de las rutas tipo, pasos que el Derrotero declara no navegables e instrucciones de recalada
PASOS.update({
 'nelson': {'n': 'Estrecho Nelson', 'carta': '14220 (INT 9133)', 'p': [-62.38, -59.25], 'ref': 'Pub. SHOA N° 3006, cap. XIV, primera parte',
   'nota': 'Paso amplio y profundo, apto para naves de cualquier tamaño y en cualquier condición de tiempo, con limitaciones con mala visibilidad; es la alternativa más apropiada para recalar a la costa S de las Shetland del Sur. En la boca N, bajos fondos al W con témpanos varados dejan un paso utilizable de 1,4 millas. Corriente de flujo hacia el SE de hasta 5 nudos en sicigias y escarceos frente a la punta Armonía. Neblina frecuente: navegar con radar. Pueden encontrarse tempanitos y escombros de hielo a la deriva.'},
 'ingles': {'n': 'Estrecho Inglés (parte S)', 'carta': '14230', 'p': [-62.47, -59.6], 'ref': 'Pub. SHOA N° 3006, cap. XIV, primera parte',
   'nota': 'La parte S, entre la punta Prat y la punta Tac, es ancha, limpia y muy profunda. El acceso N (paso Lautaro, de casi 4 cables) solo con buen tiempo y visibilidad; si faltan, preferir el estrecho Nelson. Corrientes de 2 a 3 nudos en el acceso N. Se congela de abril a octubre; la parte ancha queda libre de hielo a mediados de diciembre y la boca N, a mediados de enero.'},
 'aguirrecerda': {'n': 'Canal Aguirre Cerda', 'carta': '15350 (INT 9104)', 'p': [-64.826, -62.852], 'ref': 'Pub. SHOA N° 3006, cap. XV, segunda parte',
   'nota': 'El más estrecho de los accesos a la bahía Paraíso (5 cables frente a la caleta Gloria); profundo y limpio, salvo dos pequeños bancos de piedra en la punta Molina. Corrientes de marea de hasta 5 nudos (flujo al SSW, reflujo al NNE). Los témpanos de los glaciares pueden obstruir por completo su boca N; alternativas: canales Lientur y Lautaro, aptos para toda clase de buques.'},
})
NO_NAV = [
 {'n': 'Estrecho Fildes', 'p': [-62.205, -59.02], 'r': 0.8, 'ref': 'Pub. SHOA N° 3006, cap. XIV, primera parte',
  'nota': 'Pasaje somero y sucio, obstruido por islotes, rocas y bajos fondos, con fuertes corrientes de marea: el Derrotero recomienda no intentar su navegación, ni siquiera con embarcaciones menores.'},
 {'n': 'Estrecho Morton y paso Puertas del Infierno', 'p': [-62.70, -61.20], 'r': 3.0, 'ref': 'Pub. SHOA N° 3006, cap. XIV',
  'nota': 'Aunque comunica el paso Drake con el estrecho Bransfield, el Derrotero lo declara del todo inútil para la navegación; no debe intentarse la navegación del paso Puertas del Infierno.'},
 {'n': 'Brazo S del estrecho Bismarck (al S de las islas Wauwermans)', 'p': [-64.98, -63.90], 'r': 2.5, 'ref': 'Pub. SHOA N° 3006, cap. XV',
  'nota': 'No es navegable: no ha sido hidrografiado y está obstruido por rocas y bajos fondos entre las islas Wauwermans y Dannebrog. La derrota del estrecho Bismarck cruza solo por el N de las islas Wauwermans.'},
]
RECALADAS = {
 139: {'n': 'Bahía Fildes', 'carta': '14212 (INT 9124)', 'ref': 'Pub. SHOA N° 3006, cap. XIV, segunda parte', 'textos': [
   'Entrada entre el cabo Ibarra y la punta Duthoit (5,5 millas), con un freo navegable de algo más de 2,5 millas: ambas puntas despiden rocas y bajos fondos (la punta Duthoit hasta 1,5 millas; las rocas Pig, a casi 1 milla al E de ella).',
   'Bahía profunda y de fondo irregular, con peligros que exigen una navegación cuidadosa. Fondeaderos ocasionales en la bahía Edgell, la caleta Ardley, la bahía Collins y las caletas Marian y Potter; el Derrotero no los recomienda, salvo la caleta Potter, "un magnífico puerto".',
   'Está bien protegida de los vientos reinantes. En verano los glaciares descargan hielos flotantes, en general pequeños. No intentar el estrecho Fildes, en su extremo NW.']},
 231: {'n': 'Bahía Chile (puerto Soberanía)', 'carta': '14231 (INT 9122)', 'ref': 'Pub. SHOA N° 3006, cap. XIV, primera parte', 'textos': [
   'Acceso desde el estrecho Inglés, entre la punta Fort William y la punta Bascopé. A comienzos del verano, con campos de hielo, la nieve impide apreciar distancias, sobre todo con mala visibilidad.',
   'Reconocer las balizas ciegas Punta Bascopé y cerro Poisson, luego las torres e instalaciones de la base "Capitán Arturo Prat" en la península Guesalaga y, al S, el islote De la Fuente, buena referencia para el fondeo.',
   'Fondeadero recomendado para buques medianos en el puerto Soberanía: 30 a 40 m sobre fango, buen tenedero, al 245° y a 3,3 cables de la baliza ciega Isla González (ha aguantado vientos de hasta 75 nudos). Dar resguardo al bajo Toro, visible solo en bajamar, y aproximar al rumbo 065° hacia esa baliza para evitar el bajo Maipo. Es el de más abrigo de los vientos del 1.er y 2.º cuadrantes, los más frecuentes en verano.']},
 140: {'n': 'Bahía Paraíso', 'carta': '15350 (INT 9104)', 'ref': 'Pub. SHOA N° 3006, cap. XV, segunda parte', 'textos': [
   'Tres accesos desde el estrecho De Gerlache: canal Aguirre Cerda (el más estrecho, con corrientes de hasta 5 nudos y témpanos que pueden obstruir su boca N), canal Lientur y canal Lautaro (limpios y profundos, aptos para toda clase de buques). No navegar el canalizo al S de la isla Lautaro.',
   'Fondeaderos escasos y malos tenederos por la gran profundidad, el fondo de piedra y los témpanos a la deriva. Posiblemente el mejor, al 025° y a 1,08 cables de la punta Guzmán, más protegido de los témpanos; también en 36 m sobre fango al 292° y a 1,15 cables de la punta Araos, cerca del desembarcadero.',
   'Con viento fuerte o con el fondeadero invadido por hielos, es preferible mantenerse sobre las máquinas.']},
}
PM_INT = 'Seno Reloncaví, golfos de Ancud y Corcovado, canal Moraleda, canal Pulluche, cruce del golfo de Penas, canal Messier, angostura Inglesa, canales Wide, Concepción'
PM_MIX = 'Golfos de Ancud y Corcovado, salida al océano por la boca del Guafo, navegación oceánica hasta los islotes Evangelistas y entrada por la boca occidental del Estrecho de Magallanes'
PM_OCE = 'Salida al océano por el canal Chacao, navegación oceánica hasta los islotes Evangelistas y entrada por la boca occidental del Estrecho de Magallanes'
SUBE = '; desde el paso Tamar al N por el paso Shoal y el canal Smyth, canal Unión, paso Morla Vicuña, angostura Kirke o White y golfo Almirante Montt'
FUEG = 'Estrecho de Magallanes al S, canales Magdalena y Cockburn, acceso oceánico SW del Cockburn, bahía Desolada, canales Ballenero y O\'Brien, paso Timbales y brazo Noroeste del canal Beagle'
ATL = 'Estrecho de Magallanes al NE por las angosturas Segunda y Primera, boca oriental, costa atlántica de Tierra del Fuego a 10 millas y estrecho de Le Maire (aguas argentinas)'
PARES = [
 {'archivo': 'vias_out.json', 'puertos': [109, 134], 'nombre': 'Puerto Montt – Punta Arenas', 'alts': [
   ('interior', 'Aguas interiores', PM_INT + ', Sarmiento y Smyth, y Estrecho de Magallanes.', ['pulluche', 'inglesa', 'escape', 'guia', 'smyth', 'shoal'], ['Golfo de Penas (mar abierto)']),
   ('mixta', 'Mixta: boca del Guafo y océano', PM_MIX + '.', [], ['Océano, de la boca del Guafo a los Evangelistas']),
   ('oceanica', 'Oceánica: canal Chacao y océano', PM_OCE + '.', ['chacao'], ['Océano, del canal Chacao a los Evangelistas'])]},
 {'archivo': 'vias_natales_out.json', 'puertos': [109, 130], 'nombre': 'Puerto Montt – Puerto Natales', 'alts': [
   ('interior', 'Aguas interiores', PM_INT + ' y Sarmiento, canal Unión, paso Morla Vicuña, angostura Kirke o White, golfo Almirante Montt y canal Señoret.', ['pulluche', 'inglesa', 'escape', 'guia', 'kirke'], ['Golfo de Penas (mar abierto)']),
   ('mixta', 'Mixta: boca del Guafo y océano', PM_MIX + SUBE + '.', ['shoal', 'smyth', 'kirke'], ['Océano, de la boca del Guafo a los Evangelistas']),
   ('oceanica', 'Oceánica: canal Chacao y océano', PM_OCE + SUBE + '.', ['chacao', 'shoal', 'smyth', 'kirke'], ['Océano, del canal Chacao a los Evangelistas'])]},
 {'archivo': 'vias_chacabuco_out.json', 'puertos': [109, 126], 'nombre': 'Puerto Montt – Puerto Chacabuco', 'alts': [
   ('interior', 'Aguas interiores', 'Seno Reloncaví, golfos de Ancud y Corcovado, canal Moraleda y estero Aysén.', [], ['Golfo Corcovado']),
   ('exterior', 'Exterior de Chiloé: canal Chacao y boca del Guafo', 'Salida al océano por el canal Chacao, costa oceánica de Chiloé a 10 millas, entrada por la boca del Guafo, canal Moraleda y estero Aysén.', ['chacao'], ['Océano, del canal Chacao a la boca del Guafo'])]},
 {'archivo': 'vias_pw_out.json', 'puertos': [134, 138], 'nombre': 'Punta Arenas – Puerto Williams', 'alts': [
   ('fueguinos', 'Canales fueguinos', FUEG + ' y canal Beagle.', ['obrien', 'timbales'], ['Acceso oceánico SW del canal Cockburn']),
   ('atlantico', 'Atlántico: boca oriental del Estrecho y estrecho de Le Maire', ATL + ', y canal Beagle desde el E.', [], ['Atlántico, de la boca oriental del Estrecho al estrecho de Le Maire'])]},
 {'archivo': 'vias_fildes_out.json', 'puertos': [134, 139], 'nombre': 'Punta Arenas – Bahía Fildes', 'alts': [
   ('fueguinos', 'Canales fueguinos y cabo de Hornos', FUEG + ', canal Beagle, canal Murray, bahía Nassau, cabo de Hornos, paso Drake y estrecho de Bransfield.', ['obrien', 'timbales', 'nelson'], ['Paso Drake, desde el cabo de Hornos']),
   ('atlantico', 'Atlántico: boca oriental del Estrecho y estrecho de Le Maire', ATL + ', paso Drake y estrecho de Bransfield.', ['nelson'], ['Atlántico, estrecho de Le Maire y paso Drake'])]},
 {'archivo': 'vias_pan_cas_out.json', 'puertos': [134, 130], 'nombre': 'Punta Arenas – Puerto Natales', 'alts': [
   ('pan', 'Estrecho de Magallanes y canal Smyth', 'Estrecho de Magallanes al W por los pasos del Hambre, Inglés y Tortuoso hasta el paso Tamar; al N por el paso Shoal y el canal Smyth, canal Unión, paso Morla Vicuña, angostura Kirke o White, golfo Almirante Montt y canal Señoret. Es la única ruta por mar entre ambos puertos.', ['shoal', 'smyth', 'kirke'], ['Estrecho de Magallanes, sector occidental'])]},
 {'archivo': 'vias_pan_cas_out.json', 'puertos': [109, 116], 'nombre': 'Puerto Montt – Castro', 'alts': [
   ('dalcahue', 'Canal Dalcahue', 'Seno Reloncaví, golfo de Ancud, paso Tenaún y canal Dalcahue hasta la boca del estero Castro.', ['dalcahue'], ['Golfo de Ancud']),
   ('quinchao', 'Canal Quinchao y canal Lemuy', 'Seno Reloncaví, golfo de Ancud, canal Quinchao ("la más franca y expedita" según el Derrotero), canal Lemuy y boca del estero Castro.', [], ['Golfo de Ancud'])]},
 {'archivo': 'par_quellon.json', 'puertos': [109, 117], 'nombre': 'Puerto Montt – Quellón', 'alts': [
   ('interior', 'Aguas interiores', 'Seno Reloncaví, golfo de Ancud, canal Apiao y golfo Corcovado hasta la bahía Quellón.', [], ['Golfo Corcovado']),
   ('exterior', 'Exterior de Chiloé: canal Chacao y boca del Guafo', 'Salida al océano por el canal Chacao, costa oceánica de Chiloé a 10 millas y entrada por la boca del Guafo a la bahía Quellón.', ['chacao'], ['Océano, del canal Chacao a la boca del Guafo'])]},
 {'archivo': 'par_eden.json', 'puertos': [109, 129], 'nombre': 'Puerto Montt – Puerto Edén', 'alts': [
   ('interior', 'Aguas interiores', 'Seno Reloncaví, golfos de Ancud y Corcovado, canal Moraleda, canal Pulluche, cruce del golfo de Penas, canal Messier y angostura Inglesa.', ['pulluche', 'inglesa'], ['Golfo de Penas (mar abierto)']),
   ('mixta', 'Mixta: boca del Guafo y océano', 'Golfos de Ancud y Corcovado, salida al océano por la boca del Guafo, navegación oceánica hasta el golfo de Penas, canal Messier y angostura Inglesa.', ['inglesa'], ['Océano, de la boca del Guafo al golfo de Penas']),
   ('oceanica', 'Oceánica: canal Chacao y océano', 'Salida al océano por el canal Chacao, navegación oceánica hasta el golfo de Penas, canal Messier y angostura Inglesa.', ['chacao', 'inglesa'], ['Océano, del canal Chacao al golfo de Penas'])]},
 {'archivo': 'par_wf.json', 'puertos': [138, 139], 'nombre': 'Puerto Williams – Bahía Fildes', 'alts': [
   ('hornos', 'Canal Murray y cabo de Hornos', 'Canal Beagle al W, canal Murray, bahía Nassau, cabo de Hornos, paso Drake y estrecho de Bransfield.', ['nelson'], ['Paso Drake, desde el cabo de Hornos']),
   ('nueva', 'Canal Beagle al E e isla Nueva', 'Canal Beagle al E, por fuera de la isla Nueva, paso Drake y estrecho de Bransfield.', ['nelson'], ['Paso Drake, desde la isla Nueva'])]},
 {'archivo': 'par_chile.json', 'puertos': [134, 231], 'nombre': 'Punta Arenas – Bahía Chile', 'alts': [
   ('fueguinos', 'Canales fueguinos y cabo de Hornos', FUEG + ', canal Beagle, canal Murray, bahía Nassau, cabo de Hornos, paso Drake y estrecho de Bransfield.', ['obrien', 'timbales', 'nelson', 'ingles'], ['Paso Drake, desde el cabo de Hornos']),
   ('atlantico', 'Atlántico: boca oriental del Estrecho y estrecho de Le Maire', ATL + ', paso Drake y estrecho de Bransfield.', ['nelson', 'ingles'], ['Atlántico, estrecho de Le Maire y paso Drake'])]},
 {'archivo': 'par_paraiso.json', 'puertos': [134, 140], 'nombre': 'Punta Arenas – Bahía Paraíso', 'alts': [
   ('fueguinos', 'Canales fueguinos y cabo de Hornos', FUEG + ', canal Beagle, canal Murray, bahía Nassau, cabo de Hornos, paso Drake y estrechos de Bransfield y de Gerlache.', ['obrien', 'timbales', 'nelson', 'aguirrecerda'], ['Paso Drake, desde el cabo de Hornos', 'Estrechos de Bransfield y de Gerlache (hielo marino y témpanos)']),
   ('atlantico', 'Atlántico: boca oriental del Estrecho y estrecho de Le Maire', ATL + ', paso Drake y estrechos de Bransfield y de Gerlache.', ['nelson', 'aguirrecerda'], ['Atlántico, estrecho de Le Maire y paso Drake', 'Estrechos de Bransfield y de Gerlache (hielo marino y témpanos)'])]},

 {'archivo': 'par_melinka.json', 'puertos': [109, 124], 'nombre': 'Puerto Montt – Melinka', 'alts': [
   ('interior', 'Aguas interiores', 'Seno Reloncaví, golfos de Ancud y Corcovado hasta las islas Guaitecas.', [], ['Golfo Corcovado']),
   ('exterior', 'Exterior de Chiloé: canal Chacao y boca del Guafo', 'Salida al océano por el canal Chacao, costa oceánica de Chiloé a 10 millas y boca del Guafo.', ['chacao'], ['Océano, del canal Chacao a la boca del Guafo'])]},
 {'archivo': 'par_aguirre.json', 'puertos': [109, 125], 'nombre': 'Puerto Montt – Puerto Aguirre', 'alts': [
   ('interior', 'Aguas interiores', 'Seno Reloncaví, golfos de Ancud y Corcovado y canal Moraleda hasta las islas Huichas.', [], ['Golfo Corcovado']),
   ('exterior', 'Exterior de Chiloé: canal Chacao y boca del Guafo', 'Salida al océano por el canal Chacao, costa oceánica de Chiloé a 10 millas, boca del Guafo y canal Moraleda.', ['chacao'], ['Océano, del canal Chacao a la boca del Guafo'])]},
 {'archivo': 'par_cisnes.json', 'puertos': [109, 123], 'nombre': 'Puerto Montt – Puerto Cisnes', 'alts': [
   ('interior', 'Aguas interiores', 'Seno Reloncaví, golfos de Ancud y Corcovado, canal Moraleda y canal Puyuhuapi.', [], ['Golfo Corcovado']),
   ('exterior', 'Exterior de Chiloé: canal Chacao y boca del Guafo', 'Salida al océano por el canal Chacao, costa oceánica de Chiloé a 10 millas, boca del Guafo, canal Moraleda y canal Puyuhuapi.', ['chacao'], ['Océano, del canal Chacao a la boca del Guafo'])]},
 {'archivo': 'par_chaiten.json', 'puertos': [109, 121], 'nombre': 'Puerto Montt – Chaitén', 'alts': [
   ('unica', 'Seno Reloncaví y golfo de Ancud', 'Seno Reloncaví y golfo de Ancud hasta la bahía Chaitén. Es la ruta directa por aguas interiores.', [], ['Golfo de Ancud'])]},
 {'archivo': 'par_porvenir.json', 'puertos': [134, 137], 'nombre': 'Punta Arenas – Porvenir', 'alts': [
   ('unica', 'Cruce del Estrecho de Magallanes', 'Cruce del Estrecho de Magallanes hasta la bahía Porvenir y la bahía Chilota.', [], ['Estrecho de Magallanes'])]},
 {'archivo': 'par_toro.json', 'puertos': [138, 260], 'nombre': 'Puerto Williams – Puerto Toro', 'alts': [
   ('unica', 'Canal Beagle y paso Picton', 'Canal Beagle al E por el paso Mackinlay y al S por el oeste de la isla Picton hasta Puerto Toro.', ['mackinlay'], ['Canal Beagle'])]},
]
FUENTE = 'Derrotero de la Costa de Chile, Pub. SHOA N° 3002 a 3006 (corregido al Boletín de Noticias a los Navegantes de octubre de 2026). Trazas referenciales calculadas sobre la costa GSHHG de resolución completa.'
# ---- Quitar desvíos innecesarios: los puntos de paso obligan a la traza a tocarlos y a veces dejan "espigas" de ida y vuelta.
# Se recorre la traza y, donde hace un desvío marcado (el camino es al menos 1 mn y un 25 % más largo que la recta), se une con
# el punto más lejano visible en línea recta, siempre que el tramo directo no quede más cerca de la costa que la traza original
# en ese mismo tramo (nunca reduce el resguardo) ni la cruce.
import math, os
from shapely.geometry import Polygon, LineString, Point
from shapely.strtree import STRtree
def _proj(la, lo): return (lo * 60 * math.cos(math.radians(la)), la * 60)
_TIERRA = []
for f in os.environ.get('COSTAS', 'costa/costa_sur.json,costa/costa_austral.json').split(','):
    if os.path.exists(f):
        for r in json.load(open(f)):
            if len(r) >= 4:
                g = Polygon([_proj(a_, o_) for a_, o_ in r])
                if not g.is_valid: g = g.buffer(0)
                _TIERRA.append(g)
_ARBOL = STRtree(_TIERRA) if _TIERRA else None
def _dist_tierra(geom, tope=6.0):
    if _ARBOL is None: return tope
    idx = _ARBOL.query(geom.buffer(tope))
    return min([tope] + [_TIERRA[k].distance(geom) for k in idx])
def despicar(tr, ventana_mn=40.0):
    if _ARBOL is None or len(tr) < 3: return tr
    P = [_proj(a_, o_) for a_, o_ in tr]
    cum = [0.0]
    for i in range(1, len(P)): cum.append(cum[-1] + math.dist(P[i - 1], P[i]))
    cl = [_dist_tierra(Point(q)) for q in P]
    out, i = [0], 0
    while i < len(P) - 1:
        mejor = i + 1
        j = i + 2
        cand = []
        while j < len(P) and cum[j] - cum[i] <= ventana_mn: cand.append(j); j += 1
        for j in reversed(cand):
            d, c = math.dist(P[i], P[j]), cum[j] - cum[i]
            if c - d < 1.0 or d > 0.8 * c: continue   # solo desvíos marcados (ida y vuelta o entradas), no curvas suaves
            req = max(0.05, min(cl[i:j + 1]) - 0.05)
            if _dist_tierra(LineString([P[i], P[j]]), req + 0.01) >= req: mejor = j; break
        out.append(mejor); i = mejor
    return [tr[k] for k in out]

T = []
for P in PARES:
    R = json.load(open(P['archivo'])); alts = []
    for k, nom, res, pasos, exp in P['alts']:
        v = R[k]; L0 = sum(mn(v['traza'][i], v['traza'][i + 1]) for i in range(len(v['traza']) - 1)); t = dp(despicar(v['traza']), 0.03); L = sum(mn(t[i], t[i + 1]) for i in range(len(t) - 1))
        print(P['nombre'], k, len(v['traza']), '→', len(t), round(L0, 1), '→', round(L, 1), 'mn')
        alts.append({'id': k, 'nombre': nom, 'resumen': res, 'pasos': pasos, 'expuesto': [[e] for e in exp],
                     'hitos': [[n, round(a, 3), round(o, 3)] for n, a, o in v['via'][1:-1]], 'traza': [[round(a, 4), round(o, 4)] for a, o in t]})
    T.append({'puertos': P['puertos'], 'nombre': P['nombre'], 'fuente': FUENTE, 'alternativas': alts})
js = ('// ============================ Rutas tipo con alternativas (módulo Ruta de navegación) ============================\n'
      '// Generado con scripts/rutas_tipo_generar.py: los puntos de paso de cada alternativa se unen por el centro de los canales con la\n'
      '// costa GSHHG de resolución completa (scripts/rutas_tipo_trazar.js). Las restricciones de canales, pasos y angosturas provienen de la\n'
      '// tabla "Información operacional y restricciones en canales, pasos y angosturas" del Derrotero de la Costa de Chile (Pub. SHOA 3002 a 3004).\n'
      '// Trazas referenciales: no reemplazan la carta náutica ni el Derrotero.\n')
js += 'const RUTA_PASOS = ' + json.dumps(PASOS, ensure_ascii=False, separators=(',', ':')) + ';\n'
js += 'const RUTA_NO_NAV = ' + json.dumps(NO_NAV, ensure_ascii=False, separators=(',', ':')) + ';\n'
js += 'const RUTA_RECALADAS = ' + json.dumps(RECALADAS, ensure_ascii=False, separators=(',', ':')) + ';\n'
js += 'const RUTAS_TIPO = ' + json.dumps(T, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(sys.argv[1], 'w').write(js); print(len(js) // 1024, 'KB')
