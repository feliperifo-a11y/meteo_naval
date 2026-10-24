import importlib.util
import io
import shutil
import unittest
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('uv',ROOT/'scripts/marejadas_uv.py')
uv=importlib.util.module_from_spec(spec);spec.loader.exec_module(uv)
FIXTURE=ROOT/'tests/fixtures/uv_valparaiso_20261024.gif'
AXES={'x':'247000 249000 251000 253000 255000 257000 259000 261000 263000',
      'y':'6353000 6351500 6350000 6348500 6347000 6345500 6344000 6342500 6341000 6339500'}
SCALE='5 4.5 4 3.5 3 2.5 2 1.5 1 0.5 0'

class ValparaisoUV(unittest.TestCase):
    def test_real_chart_projection_scale_and_every_visible_frame(self):
        titles=iter((datetime(2026,10,24)+timedelta(hours=i*3)).strftime('%Y/%b/%d %Hhrs') for i in range(10))
        d=uv.procesar(FIXTURE.read_bytes(),lambda im:next(titles),AXES,SCALE,'valparaiso')
        self.assertEqual(d['crs_origen'],'EPSG:32719');self.assertEqual(d['grid_size'],[742,594])
        self.assertEqual(d['maximo_metros'],5);self.assertEqual(len(d['frames']),10)
        self.assertEqual(d['frames'][-1]['fecha'],'2026-10-25T03:00')
        self.assertLess(d['bounds'][0][0],-33.05);self.assertGreater(d['bounds'][1][0],-32.94)
        self.assertTrue(uv.cache_del_dominio(d,uv.dominio('valparaiso')))
        self.assertFalse(uv.cache_del_dominio(d,uv.dominio('talcahuano')))
        import base64
        for f in d['frames']:
            q=np.array(Image.open(io.BytesIO(base64.b64decode(f['consulta']))))
            self.assertEqual(q.shape,(594,742));self.assertTrue(((q>=1)&(q<=20)).any())
            self.assertTrue((q==255).any())
            out=Image.open(io.BytesIO(base64.b64decode(f['imagen'])))
            self.assertEqual(out.size,(768,768));self.assertLess(np.array(out)[:,:,3].mean(),255)

    def test_different_axes_and_scales_cannot_be_interchanged(self):
        uv.validar_ejes(None,AXES,'valparaiso');uv.validar_escala(SCALE,5)
        with self.assertRaises(ValueError):uv.validar_ejes(None,AXES,'talcahuano')
        with self.assertRaises(ValueError):uv.validar_escala(SCALE,4)
        with self.assertRaises(ValueError):uv.validar_escala('4 3.5 3 2.5 2 1.5 1 0.5 0',5)

    @unittest.skipUnless(shutil.which('tesseract'),'OCR real en CI con Tesseract')
    def test_server_ocr_recognizes_valparaiso_axes_scale_and_all_titles(self):
        im=Image.open(FIXTURE)
        uv.validar_ejes(im.convert('RGB'),nombre='valparaiso')
        uv.validar_escala(uv.leer_escala(im.convert('RGB'),'valparaiso'),5)
        for i in range(im.n_frames):
            im.seek(i)
            self.assertEqual(uv.fecha_titulo(uv.leer_titulo(im.convert('RGB'))),datetime(2026,10,24)+timedelta(hours=i*3))

if __name__=='__main__':unittest.main()
