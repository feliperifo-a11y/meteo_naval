import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('talc',Path(__file__).resolve().parents[1]/'scripts/talcahuano_observaciones.py')
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)

class Observaciones(unittest.TestCase):
    def test_redmeteo_uses_observation_time_and_converts_wind_from_metres_per_second(self):
        d=[{'metadatos':{'id_estacion':'RMCL0193','latitud':-36.7418,'longitud':-72.9967,'ultima_actualizacion':'2099-01-01T00:00:00Z'},
            'fh':[1720000000,1720000600],'vv':[1,2],'vr':[2,3],'vd':[240,250],
            't':[15,16],'rh':[80,78],'slp':[1020,1021],'pa':[1010,1011],'td':[10,11],'qc':[0,0]}]
        r=t.penco(d)
        self.assertEqual(r['temperatura'],16);self.assertEqual(r['presion'],1021)
        self.assertAlmostEqual(r['velocidadDelViento'],3.89,places=2)
        self.assertEqual(r['_unidad_viento'],'kt');self.assertTrue(r['_fecha_utc'].startswith('2024-07-03'))
        self.assertNotIn('2099',r['fecha'])
        d[0]['metadatos']['id_estacion']='OTRA'
        with self.assertRaises(ValueError):t.penco(d)

    def test_metar_preserves_knots_hpa_and_does_not_invent_humidity(self):
        d=[{'icaoId':'SCIE','obsTime':1720000600,'lat':-36.773,'lon':-73.063,'temp':19,'dewp':6,'wdir':'VRB','wspd':10,'wgst':15,'altim':1022}]
        r=t.carriel(d)
        self.assertEqual(r['velocidadDelViento'],10);self.assertEqual(r['_racha'],15);self.assertEqual(r['presion'],1022)
        self.assertEqual(r['direccionViento'],'VRB');self.assertIsNone(r['viento']);self.assertIsNone(r['humedad'])
        self.assertEqual(r['latitud'],-36.773)
        with self.assertRaises(ValueError):t.carriel([dict(d[0],icaoId='SCEL')])

    def test_missing_values_stay_missing_and_wrong_location_is_rejected(self):
        self.assertIsNone(t.numero(None));self.assertIsNone(t.numero(float('nan')));self.assertIsNone(t.numero(True))
        with self.assertRaises(ValueError):t.carriel([{'icaoId':'SCIE','obsTime':1720000600,'lat':-33.5,'lon':-70.7}])

if __name__=='__main__':unittest.main()
