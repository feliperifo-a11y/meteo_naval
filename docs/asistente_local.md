# Asistente MeteoIA con IA local (prototipo)

Responde preguntas en lenguaje natural con los mismos datos de MeteoIA, usando un modelo de lenguaje que corre en el Mac de la casa (Ollama). No usa la API pagada ni servicios de pago.

El modelo **no calcula el pronóstico**: interpreta la pregunta, llama a una herramienta y redacta la respuesta solo con lo que esta devuelve, citando la fuente y la hora.

| Herramienta | Qué entrega | Datos |
|---|---|---|
| `condicion_punto` | Viento, racha, lluvia, visibilidad y oleaje por período (madrugada, mañana, tarde, noche) en un lugar, de hoy a 5 días | Open-Meteo: viento ECMWF IFS (GFS si falta); oleaje del modelo marino |
| `avisos_vigentes` | Avisos vigentes y próximos que cubren un lugar | `data/avisos.json` del sitio |
| `pronostico_bahia` | Pronóstico escrito WRF + IA de una bahía | `data/wrf_ia.json` |
| `comparar_rutas` | Por cada alternativa de las rutas tipo: distancia, duración, llegada, ola y viento máximos con hora y tramo, avisos en la traza y restricciones por velocidad | `build/rutas_tipo.js` + Open-Meteo |

Los lugares se buscan en el nomenclátor del Derrotero (`data/derrotero_lugares.json`), las estaciones costeras y los puertos de las rutas tipo. El estado del mar se nombra con la escala de la Armada.

## Instalación (Mac mini)

```bash
curl -fsSL https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/mac/instalar_asistente.sh | bash
```

Instala Ollama como servicio (solo `127.0.0.1`), descarga el modelo (`qwen3:4b` con 8 GB de RAM; `qwen3:8b` con 16 GB o más) y deja el asistente en `http://127.0.0.1:8765` y en la IP de Tailscale del equipo, si existe.

Prueba sin modelo: `python3 asistente_local.py --probar`. Una pregunta por terminal: `python3 asistente_local.py --pregunta "…"`.

## Publicación en la página Desarrollo (botón ASISTENTE IA)

1. **Cloudflare Access primero.** En Cloudflare Zero Trust → Access → Applications → Add an application → Self-hosted: dominio `asistente.meteoia.cl`, política *Allow* con los correos autorizados e inicio de sesión por código al correo (One-time PIN).
2. **Túnel** en el Mac mini: `curl -fsSL https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/mac/instalar_tunel.sh | bash`. Pide autorizar la cuenta de Cloudflare en el navegador (una vez), crea el túnel `meteoia-asistente`, el registro DNS y el servicio. Al final verifica que el subdominio exija inicio de sesión; si responde sin protección, apaga el túnel.
3. **Panel** (`build/asistente_ia.js` y `.css`): consulta `https://asistente.meteoia.cl` con la cookie de Access (`credentials: 'include'`). La pregunta va como `text/plain` para no generar la petición previa OPTIONS, que Access bloquea. Sin sesión o con el Mac apagado, el panel muestra el enlace para iniciar sesión y el resto de la página no se ve afectado. Las posiciones consultadas se marcan en el mapa.

## Límites del prototipo

- Un usuario a la vez; en un M1 de 8 GB cada respuesta tarda del orden de 10 a 30 s.
- No está publicado en internet. Para integrarlo a la página Desarrollo falta un túnel de Cloudflare protegido con Cloudflare Access.
- Las rutas solo existen entre los puertos de las rutas tipo; las trazas son referenciales y no reemplazan la carta náutica ni el Derrotero.
- Información referencial: no reemplaza los pronósticos ni los avisos oficiales de la Armada de Chile.
