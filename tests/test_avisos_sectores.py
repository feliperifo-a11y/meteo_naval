"""Regresión del temporal 41/T, SERVIMET, emitido el 27-10-2026.

Fuente: https://meteoarmada.directemar.cl/meteo/site/docs/20261027/20261027214604/temporal_n_41.pdf
"""
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from shapely.geometry import Point, shape

spec = importlib.util.spec_from_file_location("colector", Path(__file__).resolve().parents[1] / "scripts/colector.py")
colector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(colector)

AVISO = """A. AVISO TEMPORAL EN ÁREA OCEÁNICA.
SECTOR FARO SAN PEDRO A LATITUD 60 GDS SUR.
VALIDO DESDE OCT 281200 UTC (280900 HORA LOCAL) HASTA OCT 291200 HORA UTC
(290900 HORA LOCAL).
B. SITUACIÓN SINÓPTICA:
SISTEMA FRONTAL.
C. PRONOSTICO:
SECTOR FARO SAN PEDRO A FARO EVANGELISTAS:
VIENTO N/NE 30/40 KT (TEMPORAL) RACHAS 55 KT.
SECTOR FARO EVANGELISTAS A LATITUD 56 GDS SUR:
VIENTO N/NW 30/40 KT (TEMPORAL) RACHAS 60 KT.
SECTOR LATITUD 56 GDS SUR A LATITUD 60 GDS SUR:
VIENTO N/NW 20/30 KT AUMENTANDO 290000 UTC 30/35 KT (TEMPORAL).
D. EVENTUALES CAMBIOS SE INFORMARAN OPORTUNAMENTE.
MET011NA 41/T
EMITIDO: 27 DE OCTUBRE DE 2026.
"""
REF = datetime(2026, 10, 28, 14, tzinfo=timezone.utc)
SECTOR = "FARO SAN PEDRO A LATITUD 60 GDS SUR"
URL = "https://meteoarmada.directemar.cl/meteo/site/docs/20261027/20261027214604/temporal_n_41.pdf"


class AvisosSectores(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.geo = colector.Geo()

    def test_extremos_nombrados_y_latitudes(self):
        for texto, esperado in [
            ("FARO SAN PEDRO A FARO EVANGELISTAS", (47.72, 52.4)),
            ("FARO EVANGELISTAS A LATITUD 56 GDS SUR", (52.4, 56)),
            ("LATITUD 56 GDS SUR A LATITUD 60 GDS SUR", (56, 60)),
            ("LATITUD 56° S A LATITUD 60° S", (56, 60)),
            ("LAT. 56,5 GRADOS SUR A LATITUD 60 GDS SUR", (56.5, 60)),
            ("VALPARAISO A TALCAHUANO", (33.03, 36.7)),
        ]:
            with self.subTest(texto=texto):
                self.assertEqual(colector.ubicar(texto), ("banda", esperado))
        for texto in ["LONGITUD 60 GDS SUR", "VIENTO 30/40 KT", "LATITUD 960 GDS SUR"]:
            self.assertIsNone(colector.ubicar(texto))

    def test_pdf_conserva_tres_tramos_fechas_y_condiciones(self):
        zonas, _ = colector.leer_aviso_general(AVISO, SECTOR, REF, self.geo)
        self.assertEqual(len(zonas), 3)
        for zona, norte, sur, racha in zip(zonas, [-47.72, -52.4, -56], [-52.4, -56, -60], ["55 KT", "60 KT", "30/35 KT"]):
            with self.subTest(zona=zona["nombre"]):
                g = shape(zona["geom"])
                self.assertAlmostEqual(g.bounds[3], norte, places=3)
                self.assertAlmostEqual(g.bounds[1], sur, places=3)
                self.assertEqual(zona["desde"], "2026-10-28T12:00:00Z")
                self.assertEqual(zona["hasta"], "2026-10-29T12:00:00Z")
                self.assertIn(racha, zona["detalle"])
                self.assertTrue(g.is_valid)
                # La costa se simplifica a 0,01° para dibujar el mapa.
                self.assertLess(g.intersection(self.geo.tierra.buffer(-0.02)).area, 0.001)
        self.assertEqual(zonas[0]["areas"], ["VI", "VII"])
        self.assertEqual(zonas[1]["areas"], ["VIII"])
        self.assertEqual(zonas[2]["areas"], ["VIII"])

    def test_sector_austral_llega_a_60_sin_incluir_costa_atlantica(self):
        g = shape(self.geo.zona("sector", lat_n=56, lat_s=60)["geom"])
        self.assertTrue(g.covers(Point(-73, -58)))
        self.assertFalse(g.covers(Point(-73, -60.1)))
        self.assertFalse(g.covers(Point(-82, -58)))
        self.assertEqual(g.bounds[1], -60)
        norte = shape(self.geo.zona("sector", lat_n=52.4, lat_s=56)["geom"])
        self.assertFalse(norte.covers(Point(-68, -53.5)))
        self.assertFalse(norte.covers(Point(-70.8, -53.5)))  # estrecho de Magallanes

    def test_encabezados_con_simbolo_de_grado(self):
        zonas, _ = colector.leer_aviso_general(AVISO.replace(" GDS SUR", "° S"), SECTOR, REF, self.geo)
        self.assertEqual(len(zonas), 3)
        self.assertEqual(shape(zonas[-1]["geom"]).bounds[1], -60)

    def test_relee_cache_antigua_y_conserva_correccion_manual(self):
        with TemporaryDirectory() as carpeta:
            data = Path(carpeta)
            (data / "avisos.json").write_text(json.dumps({"avisos": [{
                "url": URL, "_auto": True, "zonas": [{"hasta": "2026-10-29T12:00:00Z"}]
            }]}))
            (data / "avisos_manual.json").write_text(json.dumps({"corregir": {URL: {"nota": "Nota manual conservada"}}}))
            portada = [{"pagina": "https://meteoarmada.directemar.cl/meteo/faro-san-pedro-a-latitud-60-gds",
                        "sector": SECTOR, "tipo_portada": "AVISO TEMPORAL", "publicado": "27/10/2026"}]
            def respuesta(url):
                return SimpleNamespace(text=f'<a href="{URL}">PDF</a>', content=b"pdf")
            with patch.multiple(colector, DATA=data), patch.object(colector, "ahora_utc", return_value=REF), \
                    patch.object(colector, "listar_portada", return_value=portada), \
                    patch.object(colector, "get", side_effect=respuesta), \
                    patch.object(colector, "texto_pdf", return_value=AVISO) as pdf, \
                    patch.object(colector, "texto_zona_x", return_value=None), \
                    patch.object(colector, "texto_zona_ix", return_value=None), patch.dict("os.environ", {"RELEER": "0"}):
                self.assertTrue(colector.recolectar_avisos(self.geo))
                self.assertEqual(pdf.call_count, 1)
                aviso = json.loads((data / "avisos.json").read_text())["avisos"][0]
                self.assertEqual(len(aviso["zonas"]), 3)
                self.assertEqual(aviso["_lector_version"], colector.LECTOR_AVISOS_VERSION)
                self.assertEqual(aviso["nota"], "Nota manual conservada")
                self.assertTrue(colector.recolectar_avisos(self.geo))
                self.assertEqual(pdf.call_count, 1)  # la nueva geometría sí puede reutilizarse


if __name__ == "__main__":
    unittest.main()
