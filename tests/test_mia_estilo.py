import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('asistente', ROOT / 'mac/asistente_local.py')
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)

RESP = "Hola, esto es lo que muestran los modelos para Talcahuano, sábado 21/11:\nTarde: viento SW 10/14 kt.\nFuente: Open-Meteo (ECMWF), 16:00."
OK = [{"nombre": "condicion_punto", "error": None}]


class SaludoEspejo(unittest.TestCase):
    def test_apodos_amistosos(self):
        for p, apodo in [("hola amigo, ¿cómo estará el mar mañana en Valparaíso?", "amigo"),
                         ("Hola carreta quiero ir a la playa mañana en Talcahuano", "carreta"),
                         ("hola manilla! hay avisos en Talcahuano?", "manilla"),
                         ("wena compadre, mar en Iquique hoy", "compadre"),
                         ("Holaa Panchito, ¿hay avisos?", "Panchito")]:
            self.assertEqual(a.apodo_saludo(p), apodo, p)

    def test_no_es_apodo(self):
        for p in ["hola, ¿cómo estará el mar mañana?", "Hola quiero ir a la playa mañana", "hola mia, hay avisos?",
                  "hola tonta, hay avisos?", "buenos días, mar en Arica", "hola como estará Valparaíso",
                  "¿Cómo estará el mar en Valparaíso?", "hola hay avisos en Talcahuano"]:
            self.assertIsNone(a.apodo_saludo(p), p)

    def test_respuesta_con_apodo_primera_vez(self):
        r = a.estilo_mia(RESP, "hola carreta, quiero ir a la playa mañana en Talcahuano", None, OK)
        self.assertTrue(r.startswith("¡Hola, carreta! Tanto tiempo. Mira, aquí va la respuesta a tu pregunta:\nEsto es lo que muestran"), r)
        self.assertEqual(r.count("Hola"), 1)

    def test_sin_tanto_tiempo_a_mitad_de_conversacion(self):
        r = a.estilo_mia(RESP, "hola amigo, y en Lota?", [{"rol": "usuario", "texto": "x"}], OK)
        self.assertTrue(r.startswith("¡Hola, amigo! Mira, aquí va"), r)

    def test_sin_apodo_no_cambia(self):
        self.assertEqual(a.estilo_mia(RESP, "¿Cómo estará el mar en Talcahuano el sábado?", None, OK), RESP)


class NotaTiempoClima(unittest.TestCase):
    def test_clima_para_manana_agrega_nota_al_final(self):
        r = a.estilo_mia(RESP, "quiero ir a la playa mañana en talcahuano, como estará el clima?", None, OK)
        self.assertTrue(r.startswith(RESP))
        self.assertTrue(r.endswith(a.NOTA_CLIMA))

    def test_apodo_y_clima_juntos(self):
        r = a.estilo_mia(RESP, "hola manilla, como estará el clima el sábado en Talcahuano?", None, OK)
        self.assertTrue(r.startswith("¡Hola, manilla! Tanto tiempo."))
        self.assertTrue(r.endswith(a.NOTA_CLIMA))

    def test_sin_dia_cercano_o_con_error_no_agrega(self):
        self.assertNotIn(a.NOTA_CLIMA, a.estilo_mia(RESP, "¿cómo es el clima de Talcahuano en invierno?", None, OK))
        self.assertNotIn(a.NOTA_CLIMA, a.estilo_mia("No encontré ese lugar.", "clima mañana en Narnia", None,
                                                    [{"nombre": "condicion_punto", "error": "lugar no encontrado"}]))
        self.assertNotIn(a.NOTA_CLIMA, a.estilo_mia(RESP, "¿cómo estará el tiempo mañana?", None, OK))


class WrfIaFueraDeServicio(unittest.TestCase):
    def test_fuera_de_las_herramientas_por_defecto(self):
        self.assertNotIn("pronostico_bahia", a.HERRAMIENTAS)
        self.assertNotIn("pronostico_bahia", [e["function"]["name"] for e in a.ESQUEMA])
        self.assertIn("error", a.ejecutar("pronostico_bahia", {"bahia": "Talcahuano"}))

    def test_pronostico_vencido_se_rechaza(self):
        from datetime import datetime
        w = {"actualizado": "2026-11-16T13:43:18Z", "bahias": [{"nombre": "Talcahuano", "pronostico": {"dias": [
            {"fecha": "2026-11-16"}, {"fecha": "2026-11-19"}]}}]}
        dato0, ahora0 = a.dato, a.ahora_local
        try:
            a.dato = lambda *x, **k: w
            a.ahora_local = lambda: datetime(2026, 11, 20, 16, 0, tzinfo=a.TZ)
            with self.assertRaisesRegex(ValueError, "atrasado"):
                a.pronostico_bahia("Talcahuano")
            w["bahias"][0]["pronostico"]["dias"].append({"fecha": "2026-11-20"})   # 5.º día de una corrida vieja: igual atrasado
            with self.assertRaisesRegex(ValueError, "atrasado"):
                a.pronostico_bahia("Talcahuano")
            w["actualizado"] = (datetime.now(a.timezone.utc) - a.timedelta(hours=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
            a.ahora_local = lambda: datetime(2026, 11, 18, 9, 0, tzinfo=a.TZ)
            self.assertEqual([d["fecha"] for d in a.pronostico_bahia("Talcahuano")["dias"]], ["2026-11-19", "2026-11-20"])
        finally:
            a.dato, a.ahora_local = dato0, ahora0


if __name__ == '__main__':
    unittest.main()
