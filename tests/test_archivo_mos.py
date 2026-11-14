import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location('mos', Path(__file__).resolve().parents[1] / 'scripts/archivo_mos.py')
mos = importlib.util.module_from_spec(spec); spec.loader.exec_module(mos)


def grilla(carpeta, clave, campos, plazos, nlat=5, nlon=5, lat0=-30.0, lon0=-73.0, d=0.5, tierra=()):
    carpeta.mkdir(parents=True)
    ps = []
    for p in plazos:
        b = np.zeros((len(campos), nlat, nlon), dtype=np.uint8)
        for k, (_, esc) in enumerate(campos):
            b[k] = np.uint8(min(254, (10 + p) * esc)) if esc >= 1 else np.uint8(100)
        for i, j in tierra:
            b[:, i, j] = 255
        (carpeta / f'f{p:03d}.bin').write_bytes(b.tobytes())
        ps.append({'paso': p, 'archivo': f'f{p:03d}.bin', 'valido': 'x'})
    (carpeta / 'indice.json').write_text(json.dumps({
        'version': 1, 'clave': clave, 'corrida': clave, 'lat0': lat0, 'lon0': lon0, 'dlat': -d, 'dlon': d,
        'nlat': nlat, 'nlon': nlon, 'sin_dato': 255, 'campos': [{'clave': c, 'escala': e} for c, e in campos], 'plazos': ps}))


class ArchivoMOS(unittest.TestCase):
    def test_archiva_una_vez_por_corrida_solo_hasta_72_h(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            grilla(t / 'ecmwf', '2026111400', [('vel', 1), ('dir', 0.5), ('raf', 1)], [0, 3, 72, 78])
            sal = t / 'mos_ecmwf.jsonl'
            pts = [{'id': 'est:X', 'pos': [-30.9, -72.1]}, {'id': 'est:FUERA', 'pos': [-10.0, -72.0]}]
            r = mos.archivar_modelo(t / 'ecmwf', sal, {'vel': 0}, False, pts)
            self.assertIn('1 puntos', r)
            x = json.loads(sal.read_text().splitlines()[0])
            self.assertEqual(x['plazos'], [0, 3, 72])
            self.assertEqual(x['puntos'][0]['celda'], [-31.0, -72.0])
            self.assertEqual(x['puntos'][0]['vel'], [10, 13, 82])
            self.assertEqual(x['puntos'][0]['dir'], [200.0] * 3)
            self.assertIn('ya archivada', mos.archivar_modelo(t / 'ecmwf', sal, {}, False, pts))
            self.assertEqual(len(sal.read_text().splitlines()), 1)

    def test_oleaje_busca_la_celda_de_mar_mas_cercana(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            grilla(t / 'ww3', '2026111406', [('hs', 10)], [0, 6], tierra=[(2, 2), (2, 3), (1, 2)])
            sal = t / 'mos_ww3.jsonl'
            mos.archivar_modelo(t / 'ww3', sal, {}, True, [{'id': 'boya:1', 'pos': [-31.0, -72.0]}])
            p = json.loads(sal.read_text())['puntos'][0]
            self.assertNotEqual(p['celda'], [-31.0, -72.0])
            self.assertEqual(p['hs'], [10.0, 16.0])

    def test_sin_datos_no_escribe_nada(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            self.assertIn('sin datos', mos.archivar_modelo(t / 'nada', t / 's.jsonl', {}, False, []))
            self.assertFalse((t / 's.jsonl').exists())

    def test_catalogo_de_boyas_se_lee_de_la_pagina_desarrollo(self):
        c = mos.catalogo_boyas()
        self.assertGreaterEqual(len(c), 7)
        self.assertIn(('610a01', 'Concón'), [(b, n) for b, n, *_ in c])

    def test_boyas_sin_duplicados_y_descarta_boya_a_la_deriva(self):
        orig = (mos.SAL_BOYAS, mos.catalogo_boyas, mos.leer_boya)
        self.addCleanup(lambda: setattr(mos, 'SAL_BOYAS', orig[0]) or setattr(mos, 'catalogo_boyas', orig[1]) or setattr(mos, 'leer_boya', orig[2]))
        with tempfile.TemporaryDirectory() as t:
            mos.SAL_BOYAS = Path(t) / 'boyas_obs.jsonl'
            filas = [{'idBoya': 1, 'fecha_completa': '2026-11-14 18:00:00', 'hsig': '1.4', 'wsd': '0'},
                     {'idBoya': 1, 'fecha_completa': '2026-11-14 19:00:00', 'hsig': None},
                     {'idBoya': 1, 'fecha_completa': '2026-11-14 20:00:00', 'hsig': '9', 'latitud': '-10', 'longuitud': '-80'}]
            mos.catalogo_boyas = lambda: [('610a01', 'Concón', -32.86, -71.66, 'u')]
            mos.leer_boya = lambda url: filas
            self.assertTrue(mos.archivar_boyas().startswith('1 '))
            self.assertTrue(mos.archivar_boyas().startswith('0 '))
            x = json.loads(mos.SAL_BOYAS.read_text())
            self.assertEqual((x['fecha'], x['hsig'], x['wsd']), ('2026-11-14 18:00:00', 1.4, 0.0))


if __name__ == '__main__':
    unittest.main()
