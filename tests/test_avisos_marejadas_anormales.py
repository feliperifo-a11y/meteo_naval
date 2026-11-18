"""Regresión del aviso de marejadas anormales MET104SM 48/2026, emitido el 18-11-2026.

El lector no reconocía el encabezado "INICIO MAREJADAS ANORMALES:" (solo "INICIO MAREJADAS:"),
así que el aviso se publicaba sin zonas y la prospectiva de marejadas no lo marcaba.

Fuente: https://meteoarmada.directemar.cl/meteo/site/docs/20261118/20261118102826/avison48usuario.pdf
"""
import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("colector", Path(__file__).resolve().parents[1] / "scripts/colector.py")
colector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(colector)

AVISO = """1.   ÁREA COSTERA AFECTADA  Arica hasta Golfo de Arauco y Archipiélago Juan Fernández.
2.   DIRECCIÓN DEL OLEAJE:  Noroeste , originado por paso de sistema frontal en hemisferio norte.
3.   INICIO MAREJADAS   ANORMALES :  Archipiélago Juan Fernández   Viernes 20 de noviembre (AM).
Arica hasta Golfo de Arauco   Viernes 20 de noviembre (AM).
4.   TÉRMINO CONDICIÓN:  Archipiélago Juan Fernández   Lunes 23 de noviembre.
Arica hasta Golfo de Arauco   Lunes 23 de noviembre.
5.   DÍAS Y HORARIOS DE MAYOR INTENSIDAD: Viernes 20, sábado 21 y domingo 22 de noviembre.
6.   RECOMENDACIONES: ante las MAREJADAS ANORMALES .
MET104SM   48/2026  AVISO DE MAREJADAS ANORMALES"""

REF = datetime(2026, 11, 18, 13, 30, tzinfo=timezone.utc)


class AvisoMarejadasAnormales(unittest.TestCase):
    def setUp(self):
        self.zonas, self.resumen = colector.leer_marejadas(AVISO, REF, colector.Geo())

    def test_tipo_distingue_las_anormales(self):
        self.assertEqual(colector.tipo_aviso(AVISO, ""), "Aviso de marejadas anormales")
        # La portada de DIRECTEMAR rotula ambos como "marejadas"; manda el encabezado del PDF
        self.assertEqual(colector.tipo_aviso(AVISO, "Aviso de marejadas"), "Aviso de marejadas anormales")

    def test_el_tipo_anormales_sigue_enrutando_al_lector_de_marejadas(self):
        # El despacho comparaba el tipo exacto, así que al nombrar las anormales dejaban de leerse
        self.assertTrue(colector.es_aviso_marejadas("Aviso de marejadas anormales"))
        self.assertTrue(colector.es_aviso_marejadas("Aviso de marejadas"))
        self.assertFalse(colector.es_aviso_marejadas("Aviso de temporal"))
        self.assertTrue(colector.es_aviso_marejadas(colector.tipo_aviso(AVISO, "")))

    def test_lee_los_dos_sectores(self):
        self.assertEqual(len(self.zonas), 2)
        nombres = {z["nombre"] for z in self.zonas}
        self.assertIn("Archipiélago Juan Fernández", nombres)
        self.assertIn("Arica hasta Golfo de Arauco", nombres)

    def test_vigencia_del_viernes_20_al_fin_del_lunes_23(self):
        for z in self.zonas:
            self.assertEqual(z["desde"], "2026-11-20T03:00:00Z")   # viernes 20, 00:00 hora Chile
            self.assertEqual(z["hasta"], "2026-11-24T03:00:00Z")   # fin del lunes 23, hora Chile

    def test_areas_costeras_del_sector_continental(self):
        cont = next(z for z in self.zonas if z["nombre"] == "Arica hasta Golfo de Arauco")
        self.assertEqual(cont["areas"], ["I", "II", "III", "IV"])
        self.assertTrue(cont.get("geom"))

    def test_juan_fernandez_queda_identificable_para_la_prospectiva(self):
        # marejadas_alerta.avisos_por_zona reconoce la isla por el nombre del sector
        jf = next(z for z in self.zonas if "Juan Fern" in z["nombre"])
        self.assertIn("JUANFERNANDEZ", "".join(c for c in jf["nombre"].upper() if c.isalnum()).replace("Á", "A"))

    def test_resumen_conserva_la_direccion_del_oleaje(self):
        self.assertIn("noroeste", self.resumen.lower())


if __name__ == "__main__":
    unittest.main()
