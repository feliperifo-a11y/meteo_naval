import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import unittest
import shutil
from datetime import datetime, timezone, timedelta
import numpy as np
from PIL import Image
import wrf_servimet as wrf
import marejadas_uv as uv

FIX=Path(__file__).parent/'fixtures'
class WRFServimet(unittest.TestCase):
    @unittest.skipUnless(shutil.which('tesseract'),'OCR real solo donde está instalado Tesseract')
    def test_real_titles_axes_and_units_with_server_ocr(self):
        sheet=Image.open(FIX/'wrf_titulos_20261024.png');init=datetime(2026,10,24,12,tzinfo=timezone.utc)
        for i in range(25):
            im=Image.new('RGB',(900,900),'white');im.paste(sheet.crop((0,37*i,402,37*(i+1))),(108,157))
            with self.subTest(frame=i):self.assertEqual(wrf.fechas(wrf.leer_titulo(im)),(init,init+timedelta(hours=i*3)))
        wrf.validar_formato(Image.open(FIX/'wrf_carta_20261024.png').convert('RGB'))

    def test_dates_are_utc_and_bad_titles_rejected(self):
        text='Viento Color 10m (nudos) - Presion NMM (hPa)\nSimulacion: 2026 - 10 - 24 - 127\nValidez: 2026 - 10 - 25 : OOZ'
        init,valid=wrf.fechas(text);self.assertEqual(init.hour,12);self.assertEqual(valid,datetime(2026,10,25,tzinfo=timezone.utc))
        for bad in [text.replace('10m','2m'),text.replace('nudos','m/s'),text.replace('OOZ','25Z'),text.split('Validez')[0]]:
            with self.assertRaises(ValueError):wrf.fechas(bad)

    def test_color_bins_and_symbols_do_not_invent_exact_wind(self):
        rgb=np.tile(wrf.PALETA[1].astype('uint8'),(20,20,1));rgb[10,10]=[90,90,90]
        codes,dist=wrf.clasificar(rgb);self.assertEqual(codes[10,10],2);self.assertGreater(dist[10,10],0)
        self.assertEqual(dist[9,9],0)
        blank=np.full((20,20,3),255,dtype='uint8');c,_=wrf.clasificar(blank);self.assertFalse(c.any())
        # Una isobara roja no se interpreta como 50–55 kt.
        line=np.tile(wrf.PALETA[0].astype('uint8'),(30,30,1));line[:,14:16]=[255,0,0]
        c,_=wrf.clasificar(line);self.assertNotIn(11,c)
        for i,color in enumerate(wrf.PALETA):
            c,_=wrf.clasificar(np.tile(color.astype('uint8'),(10,10,1)));self.assertTrue((c==i+1).all())

    def test_same_footprint_as_uv_and_local_coast_registration(self):
        sx,sy=wrf.muestreo();self.assertEqual(sx.shape,(733,733));self.assertTrue(((sx>560)&(sx<670)&(sy>220)&(sy<340)).all())
        self.assertEqual(wrf.UTM,uv.UTM);self.assertEqual(wrf.proyeccion(20)[3],uv.proyeccion(20)[3])
        # Cabo Tumbes de la costa UV: aprox. píxel 361,138 en su cuadrícula.
        from pyproj import Transformer
        lon,lat=Transformer.from_crs(32718,4326,always_xy=True).transform(653000+361/733*31000,5952000-138/733*31000)
        p=wrf.pixel_fuente(lon,lat);self.assertLess(float(np.linalg.norm(p-[611,257])),3)
        rgb=np.array(Image.open(FIX/'wrf_carta_20261024.png').convert('RGB'));wrf.validar_costa(rgb)
        with self.assertRaises(ValueError):wrf.validar_costa(np.roll(rgb,20,axis=1))

    def test_incomplete_or_mixed_runs_and_changed_axes_are_rejected(self):
        blob=(FIX/'wrf_carta_20261024.png').read_bytes()
        with self.assertRaises(ValueError):wrf.procesar([blob])
        axes={'x':'74.5°W 74°W 73.5°W 73°W 72.5°W','y':'36.7°S 37.0°S 37.3°S 37.7°S','escala':'0 5 10 15 20 25 30 35 40 45 50 55 60\nViento 10m (nudos)'}
        im=Image.open(FIX/'wrf_carta_20261024.png').convert('RGB');wrf.validar_formato(im,axes)
        axes['y']=axes['y'].replace('36.7','35.7')
        with self.assertRaises(ValueError):wrf.validar_formato(im,axes)
        axes['y']='36.7°S 37.0°S 37.3°S 37.7°S'
        titles=iter(['Viento Color 10m (nudos)\n2026 - 10 - 24 - 12Z\n2026 - 10 - 24 : 12Z','Viento Color 10m (nudos)\n2026 - 10 - 24 - 00Z\n2026 - 10 - 24 : 15Z'])
        with self.assertRaises(ValueError):wrf.procesar([blob]*25,lambda im:next(titles),axes)

if __name__=='__main__':unittest.main()
