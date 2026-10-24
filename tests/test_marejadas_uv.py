import importlib.util
from datetime import datetime, timezone, timedelta
from pathlib import Path
import unittest
import shutil
import numpy as np
from PIL import Image

spec=importlib.util.spec_from_file_location('uv',Path(__file__).resolve().parents[1]/'scripts/marejadas_uv.py')
uv=importlib.util.module_from_spec(spec)
spec.loader.exec_module(uv)

class MarejadasUV(unittest.TestCase):
    @unittest.skipUnless(shutil.which('tesseract'),'OCR real solo donde está instalado Tesseract')
    def test_real_uv_titles_with_server_ocr(self):
        # Recortes originales de CL19TAG.gif, consultado 2026-10-24, UV.
        sheet=Image.open(Path(__file__).parent/'fixtures/uv_titulos_20261024.png')
        errores=[]
        for i in range(61):
            im=Image.new('RGB',(1200,900),'white')
            im.paste(sheet.crop((0,35*i,230,35*(i+1))),(590,25))
            texto=uv.leer_titulo(im)
            try:
                if uv.fecha_titulo(texto)!=datetime(2026,10,24)+timedelta(hours=3*i):errores.append((i,texto))
            except ValueError:errores.append((i,texto))
        self.assertEqual(errores,[])

    def test_dates_and_two_hour_cache(self):
        self.assertEqual(uv.fecha_titulo('2026/0ct/24 03hrs'),datetime(2026,10,24,3))
        self.assertEqual(uv.fecha_titulo('5 2026/Oct/24 OOhrs'),datetime(2026,10,24))
        self.assertEqual(uv.fecha_titulo('2026/Oct/3O l5hrs'),datetime(2026,10,30,15))
        self.assertEqual(uv.fecha_titulo('5 2026/Oct/30 O3Shrs'),datetime(2026,10,30,3))
        for text in ['2026/Oct/32 03hrs','2026/Oct/24 25hrs','sin fecha']:
            with self.assertRaises(ValueError):uv.fecha_titulo(text)
        now=datetime(2026,10,24,tzinfo=timezone.utc)
        data={'schema':1,'frames':[1],'consultado':(now-timedelta(seconds=7199)).isoformat()}
        self.assertTrue(uv.reciente(data,now))
        data['consultado']=(now-timedelta(seconds=7200)).isoformat();self.assertFalse(uv.reciente(data,now))
        data['consultado']=(now+timedelta(hours=1)).isoformat();self.assertFalse(uv.reciente(data,now))

    def test_warp_keeps_corners_and_has_valid_mercator_footprint(self):
        px,py,inside,bounds=uv.proyeccion(20)
        self.assertEqual(px.shape,(20,20));self.assertTrue(inside.any());self.assertFalse(inside.all())
        self.assertLess(bounds[0][0],-36.84);self.assertGreater(bounds[1][0],-36.57)
        self.assertLess(bounds[0][1],-73.28);self.assertGreater(bounds[1][1],-72.95)
        self.assertTrue(((px>=0)&(px<733)&(py>=0)&(py<733)).all())

    def test_unknown_image_format_is_rejected(self):
        import io
        b=io.BytesIO();Image.new('RGB',(1200,900)).save(b,format='PNG')
        with self.assertRaises(ValueError):uv.procesar(b.getvalue())

    def test_height_legend_must_still_be_zero_to_four_metres(self):
        uv.validar_escala('4\n3.5\n3\n2.5\n2\n1.5\n1\n0.5\n0')
        with self.assertRaises(ValueError):uv.validar_escala('5\n4.5\n4\n3.5\n3\n2.5\n2\n1.5\n1\n0.5\n0')

    def test_changed_coordinate_axes_are_rejected_despite_isolated_ocr_errors(self):
        axes={'x':'653600 656650 659700 662750 665800 668850 671300 674950 678000 681050',
              'y':'5349000 5945500 5942000 5938500 5935000 5931500 5928000 5924500 5921000'}
        uv.validar_ejes(None,axes)
        axes['x']=' '.join(str(x+10000) for x in range(653600,681051,3050))
        with self.assertRaises(ValueError):uv.validar_ejes(None,axes)

if __name__=='__main__':unittest.main()
