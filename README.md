# Dashboard meteorológico costero

Página pública que muestra, en un solo mapa:

- **Avisos meteorológicos vigentes y próximos** (marejadas, mal tiempo, temporal, trombas), dibujados dentro de las subáreas METAREA XV que afectan.
- **Avisos de temporal o mal tiempo en alta mar (Zona X)**: se leen de la Parte I del boletín de tiempo y mar de la Zona X y cada sector se dibuja como el rectángulo de latitudes y longitudes que indica el boletín.
- **Operatividad de la red de estaciones meteorológicas costeras**: estado de cada estación según la antigüedad de su último dato.
- Capas de referencia: METAREA XV, ZEE (200 M), zona contigua (24 M) y mar territorial (12 M).

Todos los datos provienen de páginas web públicas. Se actualizan solos cada 20 minutos mediante GitHub Actions.

---

## Cómo funciona

```
GitHub Actions (cada 20 min)
   └─ scripts/colector.py
        ├─ descarga las observaciones de las estaciones      → data/estaciones.json
        ├─ lee la portada del sitio de avisos y cada PDF      → data/avisos.json
        ├─ lee el boletín de alta mar Zona X (Parte I)        → data/avisos.json
        └─ deja un resumen de la ejecución y sus errores      → data/estado.json
   └─ scripts/construir_index.py  → index.html
   └─ publica index.html + data/*.json en GitHub Pages
```

La página lee los archivos `data/*.json` al abrirse y otra vez cada 5 minutos. Si una fuente no responde, se mantiene el último dato bueno y el dashboard muestra un aviso naranjo de datos desactualizados.

## Estructura del repositorio

| Ruta | Contenido |
|---|---|
| `index.html` | Dashboard (se regenera en cada publicación) |
| `build/plantilla.html` | Plantilla editable del dashboard |
| `build/leaflet.js`, `build/leaflet.css` | Librería de mapas incorporada (funciona sin CDN) |
| `scripts/colector.py` | Recolector de estaciones y avisos |
| `scripts/construir_index.py` | Arma `index.html` desde la plantilla |
| `data/avisos_manual.json` | **Correcciones manuales de avisos** (ver más abajo) |
| `data/geo/` | Costa, METAREA XV y límites marítimos |
| `.github/workflows/actualizar.yml` | Tarea programada que recolecta y publica |

---

## Puesta en marcha (una sola vez)

### 1. Crear el repositorio
1. En GitHub: **New repository** → nombre, por ejemplo `meteo_naval` → **Public** → *Create repository*.
2. En la página del repositorio vacío: **uploading an existing file** → arrastra todo el contenido de esta carpeta → *Commit changes*.

> **Ojo con la carpeta `.github`.** Algunos sistemas ocultan las carpetas que empiezan con punto y el navegador no las sube. Si después de subir no ves `.github/workflows/actualizar.yml` en el repositorio, créalo a mano: **Add file → Create new file**, escribe como nombre `.github/workflows/actualizar.yml`, pega el contenido del archivo y confirma.

### 2. Activar GitHub Pages
**Settings → Pages → Build and deployment → Source: _GitHub Actions_.**

### 3. Ejecutar la primera vez
**Actions → "Actualizar y publicar" → Run workflow.**
Si GitHub pregunta si deseas habilitar los workflows, acepta.

Es normal que la ejecución que GitHub lanza sola al subir los archivos falle, porque Pages todavía no estaba activado; basta con esta ejecución manual.

Al terminar (1–3 minutos), la página queda en:

```
https://TU-USUARIO.github.io/meteo_naval/
```

Ese es el enlace para compartir. Desde ahí se actualiza sola.

---

## Revisar que todo funciona

- **En la página:** el encabezado indica la hora de la última actualización.
- **En GitHub:** pestaña **Actions**, cada ejecución en verde.
- **Detalle de errores:** `https://TU-USUARIO.github.io/meteo_naval/data/estado.json` muestra si cada fuente respondió y los errores de la última ejecución.

Si `estaciones_ok` o `avisos_ok` aparecen siempre en `false`, lo más probable es que el servidor de origen rechace las consultas desde GitHub (sus servidores están fuera de Chile). En ese caso, el recolector puede correr desde un computador en Chile; ver la sección final.

---

## Avisos: lectura automática y correcciones

El recolector lee cada aviso desde su PDF y extrae:

- código, fechas de validez (UTC), sectores y condiciones;
- la forma en el mapa:
  - **franja costera** para marejadas;
  - **sector marítimo** entre dos latitudes para mal tiempo, temporal y trombas;
  - **círculo** para Rapa Nui, Juan Fernández y otras islas oceánicas;
- las subáreas METAREA XV que toca cada zona.

Para ubicar los sectores usa un nomenclátor de lugares y regiones del litoral que está dentro de `scripts/colector.py`.

Si un PDF es una imagen escaneada o trae un sector desconocido, el aviso aparece en la lista como **"Por revisar"** con su enlace al documento original. Para completarlo, edita `data/avisos_manual.json` directamente en GitHub (ícono del lápiz). El archivo tiene tres secciones:

- **`corregir`**: por URL del PDF, los campos que reemplazan lo leído automáticamente.
- **`agregar`**: avisos completos escritos a mano.
- **`ignorar`**: URLs de PDF que no deben mostrarse.

Ejemplo de zona:

```json
{"nombre": "Corral a Faro Corona", "forma": "sector", "lat_norte": 39.87, "lat_sur": 41.8,
 "desde": "2026-10-02T15:00:00Z", "hasta": "2026-10-04T22:00:00Z",
 "detalle": "Viento W/NW 20/30 kt rachas 40 kt. Mar gruesa a muy gruesa (3,0/5,0 m)."}
```

- **`forma`**: `franja`, `sector` o `circulo`. Para un círculo se usa `"centro": [-33.65, -79.0]` y `"radio": 1.0` (en grados).
- **Latitudes:** grados Sur, en positivo.
- **Fechas:** en UTC.

Al guardar el archivo, la página se republica sola con la corrección. Los avisos expirados se retiran solos 6 horas después de su término.

Para que un sector nuevo se reconozca automáticamente en el futuro, agrégalo al diccionario `LUGARES` (o `ISLAS`) en `scripts/colector.py`.

---

## Uso local (sin publicar)

```bash
pip install -r requirements.txt
python scripts/colector.py            # actualiza data/*.json
python scripts/construir_index.py     # regenera index.html
python -m http.server 8000            # abrir http://localhost:8000
```

Si abres `index.html` con doble clic, el navegador no deja leer `data/*.json` y la página usa la copia de datos incorporada al construirla (lo indica en el encabezado).

## Limitaciones conocidas

- **Horario:** GitHub no garantiza la hora exacta de las tareas programadas; con alta demanda pueden atrasarse algunos minutos.
- **Pausa por inactividad:** GitHub pausa las tareas programadas de repositorios sin actividad por 60 días. El workflow hace un "latido" semanal (`.github/latido.txt`) para evitarlo. Si aun así se pausa, basta con volver a habilitarlo en **Actions**.
- **Consultas moderadas:** cada 20 minutos y con pausa entre descargas, para no cargar los servidores de origen. No conviene bajar de 15 minutos.
- **Límites aproximados de METAREA XV:** los límites oceánicos (76°W, 78°W, ~80°W y ~98,5°W) se digitalizaron de la carta publicada (OMM N° 9, Vol. D, 2018) y son aproximados.
- **Velocidad del viento:** la fuente de estaciones no informa su unidad.

## Estaciones enviadas desde un Mac en Chile

El servicio de estaciones no responde a los servidores de GitHub (están fuera de Chile). Por eso un Mac en Chile descarga las observaciones cada 20 minutos y las sube como `data/estaciones.json`; cada subida republica la página. Los avisos sí se leen desde GitHub.

**Instalar (una vez, en Terminal):**

```bash
curl -fsSL https://raw.githubusercontent.com/feliperifo-a11y/meteo_naval/main/mac/instalar.sh -o /tmp/instalar.sh && bash /tmp/instalar.sh
```

Pide un *token* de GitHub con permiso de escritura solo sobre este repositorio y lo guarda en el Llavero de macOS.

- **Revisar funcionamiento:** `tail ~/Library/Application\ Support/meteo_naval/registro.log`
- **Desinstalar:** `bash ~/Library/Application\ Support/meteo_naval/desinstalar.sh`

El Mac también envía una copia del boletín Zona X; GitHub la usa solo si no logra descargarlo directamente.

Las estaciones se actualizan solo mientras el Mac esté encendido y conectado. Si está apagado, la página muestra el último dato con el aviso naranjo de datos desactualizados.


### Redes de estaciones

El dashboard muestra las mismas estaciones que dibuja el meteomapa en su mapa:

| Red | Fuente | Símbolo |
|---|---|---|
| Capitanías de Puerto (43) | `observaciones/directemar` | ● |
| EMA Campbell (8) | `top` + `fichaEstacion/{código}`; si la ficha viene vacía, `graficoEstacion` | ■ |

El listado `mapa` del servicio también incluye una red EMA antigua (sin datos desde hace años, duplicados de Capitanías y coordenadas erróneas) que el meteomapa no muestra; el dashboard tampoco la incluye. "Campbell Punta Delgada" aparece dos veces con datos idénticos: se usa el código 100006, de posición correcta.

El script del Mac se actualiza solo desde este repositorio en cada ejecución.

## Si GitHub no puede descargar los datos

Ejecuta el recolector en un computador en Chile y sube los JSON al repositorio:

1. Programa `python scripts/colector.py` cada 20 minutos con el Programador de tareas de Windows o con `cron`.
2. Haz que suba `data/*.json` al repositorio con `git add data && git commit -m datos && git push`.
3. En el workflow, cambia el paso "Recolectar datos" por uno que no descargue nada. El sitio se publicará con los JSON que subió tu equipo.

Con este esquema, los datos se actualizan solo mientras ese computador esté encendido.
