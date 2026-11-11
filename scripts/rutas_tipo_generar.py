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
DESC = {
 'interior': 'Seno Reloncaví, golfos de Ancud y Corcovado, canal Moraleda, canal Pulluche, cruce del golfo de Penas, canal Messier, angostura Inglesa, canales Wide, Concepción{x}.',
 'mixta': 'Golfos de Ancud y Corcovado, salida al océano por la boca del Guafo, navegación oceánica hasta los islotes Evangelistas y entrada por la boca occidental del Estrecho de Magallanes{x}.',
 'oceanica': 'Salida al océano por el canal Chacao, navegación oceánica hasta los islotes Evangelistas y entrada por la boca occidental del Estrecho de Magallanes{x}.'}
EXP = {'interior': [['Golfo de Penas (mar abierto)', -46.0, -47.7]], 'mixta': [['Océano, de la boca del Guafo a los Evangelistas', -43.7, -52.6]], 'oceanica': [['Océano, del canal Chacao a los Evangelistas', -41.8, -52.6]]}
PARES = [
 {'archivo': 'vias_out.json', 'puertos': [109, 134], 'nombre': 'Puerto Montt – Punta Arenas',
  'x': {'interior': ', Sarmiento y Smyth, y Estrecho de Magallanes', 'mixta': '', 'oceanica': ''},
  'pasos': {'interior': ['pulluche', 'inglesa', 'escape', 'guia', 'smyth', 'shoal'], 'mixta': [], 'oceanica': ['chacao']}},
 {'archivo': 'vias_natales_out.json', 'puertos': [109, 130], 'nombre': 'Puerto Montt – Puerto Natales',
  'x': {'interior': ' y Sarmiento, canal Unión, paso Morla Vicuña, angostura Kirke o White, golfo Almirante Montt y canal Señoret',
        'mixta': '; desde el paso Tamar al N por los pasos Shoal y canal Smyth, canal Unión, paso Morla Vicuña, angostura Kirke o White y golfo Almirante Montt',
        'oceanica': '; desde el paso Tamar al N por los pasos Shoal y canal Smyth, canal Unión, paso Morla Vicuña, angostura Kirke o White y golfo Almirante Montt'},
  'pasos': {'interior': ['pulluche', 'inglesa', 'escape', 'guia', 'kirke'], 'mixta': ['shoal', 'smyth', 'kirke'], 'oceanica': ['chacao', 'shoal', 'smyth', 'kirke']}},
]
NOMBRES = {'interior': 'Aguas interiores', 'mixta': 'Mixta: boca del Guafo y océano', 'oceanica': 'Oceánica: canal Chacao y océano'}
FUENTE = 'Derrotero de la Costa de Chile, Pub. SHOA N° 3002, 3003 y 3004 (corregido al Boletín de Noticias a los Navegantes de octubre de 2026). Trazas referenciales calculadas sobre la costa GSHHG de resolución completa.'
T = []
for P in PARES:
    R = json.load(open(P['archivo'])); alts = []
    for k in ['interior', 'mixta', 'oceanica']:
        v = R[k]; t = dp(v['traza'], 0.03); L = sum(mn(t[i], t[i + 1]) for i in range(len(t) - 1))
        print(P['nombre'], k, len(v['traza']), '→', len(t), round(L, 1), 'mn')
        alts.append({'id': k, 'nombre': NOMBRES[k], 'resumen': DESC[k].format(x=P['x'][k]), 'pasos': P['pasos'][k], 'expuesto': EXP[k],
                     'hitos': [[n, round(a, 3), round(o, 3)] for n, a, o in v['via'][1:-1]], 'traza': [[round(a, 4), round(o, 4)] for a, o in t]})
    T.append({'puertos': P['puertos'], 'nombre': P['nombre'], 'fuente': FUENTE, 'alternativas': alts})
js = ('// ============================ Rutas tipo con alternativas (módulo Ruta de navegación) ============================\n'
      '// Generado con scripts/rutas_tipo_generar.py: los puntos de paso de cada alternativa se unen por el centro de los canales con la\n'
      '// costa GSHHG de resolución completa (scripts/rutas_tipo_trazar.js). Las restricciones de canales, pasos y angosturas provienen de la\n'
      '// tabla "Información operacional y restricciones en canales, pasos y angosturas" del Derrotero de la Costa de Chile (Pub. SHOA 3002 a 3004).\n'
      '// Trazas referenciales: no reemplazan la carta náutica ni el Derrotero.\n')
js += 'const RUTA_PASOS = ' + json.dumps(PASOS, ensure_ascii=False, separators=(',', ':')) + ';\n'
js += 'const RUTAS_TIPO = ' + json.dumps(T, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(sys.argv[1], 'w').write(js); print(len(js) // 1024, 'KB')
