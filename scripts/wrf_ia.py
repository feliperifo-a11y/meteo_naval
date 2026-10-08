#!/usr/bin/env python3
"""Pronósticos WRF + IA.

Lee los meteogramas WRF de 3 km de cada bahía y le pide a Claude (API de Anthropic) que los
transforme en un pronóstico escrito: situación sinóptica, nubosidad y viento por día.

- Solo se procesa una bahía cuando su meteograma cambió (nueva corrida del modelo), para no
  gastar consultas en cada actualización del dashboard.
- La clave de la API llega como secreto del repositorio (ANTHROPIC_API_KEY). Sin clave, el
  script solo verifica el acceso a los meteogramas y deja el archivo como estaba.
- Resultado: data/wrf_ia.json (lo lee la página ia.html).
"""
import base64
import concurrent.futures as cf
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "data" / "wrf_ia.json"
BASE = "http://triton.directemar.cl/web/meteograma_{}.png"
MODELO = os.environ.get("WRF_IA_MODELO", "claude-sonnet-5-5")
CABECERAS = {"User-Agent": "dashboard-meteo-publico/1.0 (pronostico WRF + IA)"}

# (zona, nombre visible, código del archivo) — solo meteogramas de 3 km
BAHIAS = [
    ("Zona Norte", "Arica", "ARICA_norte_d03"),
    ("Zona Norte", "Iquique", "IQUIQUE_norte_d03"),
    ("Zona Norte", "Patache", "PATACHE_norte_d03"),
    ("Zona Norte", "Tocopilla", "TOCOPILLA_norte_d04"),
    ("Zona Norte", "Antofagasta", "ANTOFAGASTA_norte_d04"),
    ("Zona Central", "Chañaral", "CHANARAL_norte_d05"),
    ("Zona Central", "Caldera", "CALDERA_norte_d05"),
    ("Zona Central", "Huasco", "HUASCO_centro_d06"),
    ("Zona Central", "Coquimbo", "COQUIMBO_centro_d07"),
    ("Zona Central", "Los Vilos", "LOSVILOS_centro_d08"),
    ("Zona Central", "Quintero", "QUINTERO_centro_d08"),
    ("Zona Central", "Valparaíso", "VALPARAISO_centro_d08"),
    ("Zona Central", "San Antonio", "SANANTONIO_centro_d08"),
    ("Zona Central Sur", "Constitución", "CONSTITUCION_centro_d06"),
    ("Zona Central Sur", "Lirquén", "LIRQUEN_centro_d09"),
    ("Zona Central Sur", "Talcahuano", "TALCAHUANO_centro_d09"),
    ("Zona Central Sur", "San Vicente", "SANVICENTE_centro_d09"),
    ("Zona Central Sur", "Coronel", "CORONEL_centro_d09"),
    ("Zona Central Sur", "Lota", "LOTA_centro_d09"),
    ("Zona Central Sur", "Lebu", "LEBU_centro_d09"),
    ("Zona Central Sur", "Isla Mocha", "ISLAMOCHA_centro_d06"),
    ("Zona Central Sur", "Puerto Saavedra", "PUERTOSAAVEDRA_centro_d06"),
    ("Zona Central Sur", "Valdivia", "VALDIVIA_centro_d10"),
    ("Zona Central Sur", "Corral", "CORRAL_centro_d10"),
    ("Zona Sur", "Puerto Montt", "PUERTOMONTT_sur_d12"),
    ("Zona Sur", "Golfo Coronado", "GCORONADO_sur_d12"),
    ("Zona Sur", "Ancud", "ANCUD_sur_d12"),
    ("Zona Sur", "Castro", "CASTRO_sur_d12"),
    ("Zona Sur", "Quellón", "QUELLON_sur_d12"),
    ("Zona Sur", "Golfo Corcovado", "GOLFOCORCOVADO_sur_d12"),
    ("Zona Sur", "Isla Guafo", "ISLAGUAFO_sur_d12"),
    ("Zona Sur", "Canal Moraleda", "CMORALEDA_sur_d11"),
    ("Zona Sur", "Puerto Chacabuco", "PUERTOCHACABUCO_sur_d11"),
    ("Zona Sur", "Golfo de Penas", "GOLFOPENAS_sur_d11"),
    ("Zona Austral", "Faro Evangelistas", "FAROEVANGELISTA_sur_d13"),
    ("Zona Austral", "Paso Tamar", "PASOTAMAR_sur_d13"),
    ("Zona Austral", "Puerto Natales", "PUERTONATALES_sur_d11"),
    ("Zona Austral", "Primera Angostura", "PRIMERANGOSTURA_sur_d11"),
    ("Zona Austral", "Seno Otway", "SENOOTWAY_sur_d14"),
    ("Zona Austral", "Punta Arenas", "PUNTAARENAS_sur_d14"),
    ("Zona Austral", "Cabo Froward", "FROWARD_sur_d11"),
    ("Zona Austral", "Paso Brecknock", "BRECKNOCK_sur_d15"),
    ("Zona Austral", "Paso Tortuoso", "TORTUOSO_sur_d11"),
    ("Zona Austral", "Puerto Williams", "PUERTOWILLIAMS_sur_d11"),
    ("Zona Austral", "Cabo de Hornos", "CABODEHORNOS_sur_d11"),
    ("Zona Antártica", "Bahía Fildes", "A_FILDES_Antartica_d02"),
    ("Zona Antártica", "Base Prat", "A_BASEPRAT_Antartica_d02"),
    ("Zona Antártica", "Isla Decepción", "A_DECEPCION_Antartica_d02"),
    ("Zona Antártica", "Bahía Whisky", "A_BAHIAWHISKY_Antartica_d02"),
    ("Zona Antártica", "Base O’Higgins", "A_BASEOHIGGINS_Antartica_d02"),
    ("Zona Antártica", "Paso Antarctic", "A_ANTARCTIC_Antartica_d02"),
    ("Zona Antártica", "Caleta Snow", "A_CALETASNOW_Antartica_d02"),
    ("Zona Antártica", "Estrecho Gerlache", "A_GERLACHE_Antartica_d02"),
    ("Zona Antártica", "Bahía Paraíso", "A_BAHIAPARAISO_Antartica_d02"),
    ("Zona Antártica", "Base Yelcho", "A_BAHIASOUTH_Antartica_d02"),
]

INSTRUCCIONES = """Eres meteorólogo marino. Recibes el meteograma del modelo WRF (resolución 3 km) de una bahía de Chile.
Paneles, de arriba hacia abajo:
1) Perfil vertical: temperatura (colores) y viento (barbas) de 1000 a 100 hPa.
2) Agua de nube (g/kg) por niveles y línea roja de techo de nubes: indica nubosidad y su altura.
3) Temperatura a 2 m (azul, °C) y humedad relativa a 2 m (rojo segmentado, %).
4) Viento a 10 m: intensidad en nudos (línea azul) y dirección (barbas rojas; los círculos son calma).
5) Precipitación (barras, mm) y presión a nivel del mar (rojo, hPa).
6) Alturas geopotenciales de 700 hPa (azul) y 850 hPa (rojo).
7) Temperatura (azul) y altura (rojo) de 500 hPa.
El eje horizontal está en UTC con formato día/hora (ej. 09/00z). La hora de Chile continental es UTC-3.

Redacta el pronóstico en español técnico y breve, por día calendario en hora de Chile, para todo el período que cubre el meteograma (descarta un día si tiene menos de 6 horas de datos):
- Situación sinóptica: una o dos frases deducidas del meteograma (tendencia de presión, alturas y temperatura en 500 hPa, cizalle del viento, precipitación). Usa términos como dorsal en altura, vaguada en altura, baja segregada, sistema frontal, vaguada costera, alta presión, flujo zonal, solo cuando el meteograma lo respalde; si la señal es débil, dilo.
- Nubosidad de cada día: exactamente una de estas categorías: "Cubierto", "Nublado", "Parcial" o "Despejado". Si cambia durante el día, puedes agregar un detalle breve (ej. "nubosidad baja en la mañana").
- Viento de cada día: dirección en rosa de 8 o 16 rumbos y rango de intensidad en nudos con el formato de los boletines (ej. "S/SW 10/15 kt, aumentando a 15/20 kt en la tarde"). Usa la dirección de las barbas (desde donde sopla el viento).
- Precipitación de cada día solo si el meteograma la muestra (ej. "Lloviznas débiles, 1,6 mm"); si no hay, déjalo vacío.
- Temperatura máxima y mínima de cada día a 2 m (superficie), en °C, leídas de la línea azul del panel TT-2m, redondeadas a enteros.
Lee los valores con cuidado; no inventes datos que el gráfico no muestra. Responde únicamente con la herramienta entregada."""

HERRAMIENTA = {
    "name": "pronostico_bahia",
    "description": "Entrega el pronóstico escrito de la bahía, leído desde el meteograma.",
    "input_schema": {
        "type": "object",
        "properties": {
            "inicializacion_utc": {"type": "string", "description": "Fecha y hora de inicialización del modelo, tal como aparece en el meteograma (ej. 2026-10-08T12)"},
            "situacion_sinoptica": {"type": "string"},
            "dias": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "fecha": {"type": "string", "description": "Fecha local AAAA-MM-DD"},
                        "nubosidad": {"type": "string", "enum": ["Cubierto", "Nublado", "Parcial", "Despejado"]},
                        "nubosidad_detalle": {"type": "string"},
                        "viento": {"type": "string"},
                        "precipitacion": {"type": "string"},
                        "temp_max": {"type": "number"},
                        "temp_min": {"type": "number"},
                    },
                    "required": ["fecha", "nubosidad", "viento", "temp_max", "temp_min"],
                },
            },
        },
        "required": ["situacion_sinoptica", "dias"],
    },
}


def ahora():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def descargar(codigo):
    r = requests.get(BASE.format(codigo), headers=CABECERAS, timeout=40)
    r.raise_for_status()
    if not r.content.startswith(b"\x89PNG"):
        raise ValueError("la respuesta no es una imagen PNG")
    return r.content


def consultar_claude(png, nombre, clave):
    cuerpo = {
        "model": MODELO,
        "max_tokens": 1500,
        "system": INSTRUCCIONES,
        "tools": [HERRAMIENTA],
        "tool_choice": {"type": "tool", "name": "pronostico_bahia"},
        "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": base64.b64encode(png).decode()}},
            {"type": "text", "text": f"Meteograma WRF 3 km de {nombre}. Entrega el pronóstico."},
        ]}],
    }
    for intento in range(3):
        r = requests.post("https://api.anthropic.com/v1/messages", json=cuerpo, timeout=120,
                          headers={"x-api-key": clave, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        if r.status_code in (429, 500, 502, 503, 529) and intento < 2:
            time.sleep(10 * (intento + 1)); continue
        if r.status_code != 200:
            raise RuntimeError(f"API {r.status_code}")      # sin el detalle: nunca se registra la clave
        for bloque in r.json().get("content", []):
            if bloque.get("type") == "tool_use":
                return bloque["input"]
        raise RuntimeError("la respuesta no trae el pronóstico")


def main():
    clave = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not clave:
        # Sin clave de API, los pronósticos los genera el Mac con la suscripción (mac/pronostico_ia.sh)
        # y los sube a data/wrf_ia.json: aquí no se toca ese archivo.
        print("WRF + IA: sin clave de API; se publica el archivo enviado por el equipo local.")
        return 0
    previo = {}
    try:
        previo = {b["codigo"]: b for b in json.loads(SALIDA.read_text(encoding="utf-8")).get("bahias", [])}
    except Exception:
        pass

    def procesar(z):
        zona, nombre, codigo = z
        p = previo.get(codigo, {})
        b = {"zona": zona, "nombre": nombre, "codigo": codigo, "imagen": BASE.format(codigo)}
        # Consulta liviana: si la fecha de modificación no cambió, es la misma corrida y no se descarga.
        try:
            h = requests.head(BASE.format(codigo), headers=CABECERAS, timeout=20)
            marca = (h.headers.get("Last-Modified") or h.headers.get("ETag")) if h.ok else None
        except Exception:
            marca = None
        if marca and p.get("marca") == marca and p.get("pronostico"):
            return {**p, **b, "error": None}, "igual"
        try:
            png = descargar(codigo)
        except Exception as e:
            return {**p, **b, "error": f"meteograma no disponible ({type(e).__name__})"}, "sin_imagen"
        huella = hashlib.sha1(png).hexdigest()[:16]
        if p.get("huella") == huella and p.get("pronostico"):
            return {**p, **b, "marca": marca, "error": None}, "igual"                # misma corrida: no se vuelve a consultar
        if not clave:
            return {**p, **b, "error": None if p.get("pronostico") else "falta configurar la clave de la IA"}, "sin_clave"
        try:
            pr = consultar_claude(png, nombre, clave)
            return {**b, "huella": huella, "marca": marca, "pronostico": pr, "generado": ahora(), "modelo_ia": MODELO, "error": None}, "nuevo"
        except Exception as e:
            print(f"  {nombre}: {e}")
            return {**p, **b, "error": f"no se pudo generar ({str(e)[:40]})"}, "error"

    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        res = list(ex.map(procesar, BAHIAS))
    bahias = [r for r, _ in res]
    cuenta = {}
    for _, estado in res:
        cuenta[estado] = cuenta.get(estado, 0) + 1
    print("WRF + IA:", ", ".join(f"{k} {v}" for k, v in sorted(cuenta.items())))
    if cuenta.get("sin_imagen") == len(BAHIAS) and previo:
        print("Sin acceso a los meteogramas: se conserva el archivo anterior.")
        return 0
    SALIDA.write_text(json.dumps({"actualizado": ahora(), "modelo_ia": MODELO, "resolucion": "3, 9 y 10 km",
                                  "fuente": "https://meteoarmada.directemar.cl/meteo/site/edic/base/port/Modelo_meteogramas.html",
                                  "estado": cuenta, "bahias": bahias}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
