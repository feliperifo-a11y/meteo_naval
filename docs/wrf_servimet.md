# WRF SERVIMET · Capuerto Talcahuano

Capa opcional únicamente en el dashboard completo, desactivada inicialmente. Comparte el panel temporal de Marejadas UV: 25 fechas cada tres horas, anterior/siguiente, selector, reproducción, pausa y clic para consultar. Al activar una de las dos cartas se oculta la otra y se desmarca su casilla, para evitar dos escalas superpuestas.

## Fuente y significado

Página oficial: http://triton.directemar.cl/web/html/Vto-color-centro9.html. Aunque el nombre de la página incluye «centro9», sus imágenes `carta_wnd_slp_color_centro_d04.000001.png` a `.000073.png`, en pasos de tres, declaran **WRF de 3 km**, viento a 10 m en nudos y presión NMM en hPa. El pie atribuye la generación a la Dirección Meteorológica de Chile. Se respeta esa resolución impresa; no se presupone por el nombre del enlace.

Las horas de simulación y validez terminan en Z: se leen de cada carta mediante Tesseract y se muestran en UTC. Se exige una sola inicialización y 25 validades consecutivas desde +0 hasta +72 h. La página y su índice público ofrecen imágenes; no exponen una descarga numérica del modelo.

La consulta identifica el **intervalo de color de 5 kt** (0–5 a 55–60; púrpura ≥60 kt). No es una lectura puntual del modelo. Se conservan las barbas grises como dibujo. Se eliminan costa, rótulos e isobaras para que el mapa de fondo siga siendo legible; la presión completa permanece en la fuente. No se calculan dirección, ráfaga ni presión al hacer clic. Las líneas rojas de presión y puntos de ciudades coinciden con un color de viento: ese rojo solo se admite como viento si pertenece a una superficie de al menos siete píxeles de espesor, nunca a trazos aislados. Un símbolo puede llevar a consultar el color más próximo dentro de tres píxeles de la carta, aproximadamente hasta 1,1 km; la ficha informa el desplazamiento conservador en centenas de metros. Sin color reconocible no se publica un valor.

## Cobertura y registro

Mismo dominio de Marejadas UV CL19TA: EPSG:32718, [653000,5921000,684000,5952000], 31 × 31 km. Se usan la misma cuadrícula de consulta de 733 × 733 y el mismo recorte reproyectado a Web Mercator de 768 × 768, con transparencia fuera del polígono UTM. No se estira la carta regional completa sobre la bahía.

La carta no entrega su transformación geográfica. Se realizó un registro afín **aproximado y local**, guiado por sus ejes y ajustado a la costa georreferenciada de CL19TA (península de Tumbes, bahía de Talcahuano y San Vicente). Ajuste robusto de la costa principal UV contra el trazo negro de la carta, excluyendo el rótulo Talcahuano; errores residuales de aproximadamente uno a varios píxeles en una costa simplificada. La isla Quiriquina no está resuelta en esta carta. No se infiere precisión portuaria de la ampliación de la imagen.

Para longitud/latitud en grados: `pixel = [[270.94,2.17],[-5.13,-341.58]] × [lon+73,lat+37] + [641.56,387.52]`. Este registro solo vale para la carta de 900 × 900 y esta cobertura. El colector valida los ejes impresos, la paleta, la escala y once anclas del trazo de costa antes de usarlo. Un cambio de formato se rechaza y requiere revisar la georreferencia.

## Actualización

`scripts/wrf_servimet.py` revisa la fuente como máximo cada dos horas, dentro del trabajo habitual de publicación. Descarga las 25 imágenes con cuatro conexiones y vuelve a comprobar la primera para detectar un reemplazo durante la descarga. Las fechas de todas las imágenes también deben pertenecer a la misma corrida. Solo entonces reemplaza atómicamente `data/wrf_servimet.json`; una falla conserva la última corrida válida y su fecha de consulta original. La página vuelve a consultar el JSON cada dos horas mientras la capa está activada y al regresar a la pestaña. No fuerza a SERVIMET a generar corridas nuevas.

Las imágenes se publican dentro del JSON servido por HTTPS de MeteoIA, evitando contenido HTTP mixto en el mapa. El enlace de la ficha lleva a la fuente oficial HTTP.

## Comprobaciones

Pruebas de códigos de color, rango superior abierto, UTC, secuencia, corridas mezcladas, dominio igual a UV, costa desplazada, cambios de ejes y alternancia de casillas. Fixtures: primera carta y recortes de los 25 títulos originales consultados el 24 de octubre de 2026. CI usa Tesseract real para validar los 25 títulos, los ejes y las unidades, además de las pruebas previas de Marejadas UV y estaciones.
