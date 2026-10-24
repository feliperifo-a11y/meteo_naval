# Marejadas UV · Capuertos Talcahuano y Valparaíso

Fuente: https://marejadas.uv.cl/pronosticos/cl19ta y su animación pública
https://marejadas.uv.cl/images/SAM/dominios/CL19TAG.gif.
Autoría: Escuela de Ingeniería Civil Oceánica, Universidad de Valparaíso.

La capa es opcional y solo se ofrece en el dashboard completo, bajo Capuertos → Talcahuano y Capuertos → Valparaíso. Ofrece reproducción, pausa, selección de fecha, avance y retroceso.
Pulsar sobre el mar pausa la animación y consulta el fotograma visible.

## Qué representa la altura

La página pública entrega imágenes, sin una descarga numérica de la malla del
modelo identificada en esta integración. El usuario aceptó expresamente la
consulta aproximada por colores. Se muestran intervalos de 0,25 m, entre 0 y
4 m en Talcahuano y 5 m en Valparaíso, leídos de la barra de colores de la propia imagen. Nunca se presentan como
mediciones o valores numéricos originales del modelo. Tierra y píxeles sin
lectura no generan alturas. Para flechas y pequeños símbolos se admite un
píxel vecino a un máximo de seis píxeles (aproximadamente 254 m en Talcahuano y 142 m en Valparaíso); la ficha
muestra la separación. La estimación no incluye una validación del modelo.

La carta tiene una cuadrícula UTM 18S, EPSG:32718, este 653000–684000 m y
norte 5921000–5952000 m. En el formato 1200×900, el área interior corresponde
a los píxeles [162,68,895,801]. Se reproyecta a Web Mercator para Leaflet;
la consulta vuelve a la cuadrícula original. La georreferencia es aproximada
por digitalización de los ejes impresos, no una georreferencia proporcionada
por la UV. La carta y los polígonos costeros de otros proveedores pueden diferir.

La fecha de cada fotograma se obtiene de su título mediante OCR. Se valida una
secuencia de tres horas. La carta no indica zona horaria, por lo que se muestra
la hora UV literalmente, sin convertirla a UTC ni a la hora de Chile. La fecha
de consulta sí es un instante UTC real y no se presenta como emisión del modelo.

## Actualización y fallos

`scripts/marejadas_uv.py` se ejecuta con el flujo habitual de publicación.
Consulta la UV como máximo cada dos horas, reutilizando `data/marejadas_uv.json`
publicado entre runners. Si la animación no cambió, conserva sus fotogramas y
renueva únicamente la hora de consulta. Los fotogramas y las cuadrículas de
consulta se publican juntos, sin mezclar versiones entre fechas. Ante descargas
o formatos inválidos conserva el archivo anterior. La UV controla la frecuencia
de emisión de sus corridas: consultar cada dos horas no crea una corrida nueva.
También comprueba las etiquetas numéricas 0–4 m de la leyenda y que esta no
cambie entre fotogramas; si cambia, conserva la corrida anterior para evitar
interpretar una escala diferente con los mismos colores.

El navegador carga la capa solo al activarla y revisa el JSON cada dos horas;
al volver a una pestaña visible también comprueba el dato publicado. Si falla
la conexión conserva la corrida disponible y lo indica. Detiene la reproducción
al desactivar la capa, cambiar fecha, consultar un punto u ocultar la pestaña.

Dependencias: numpy, Pillow, pyproj y el ejecutable `tesseract` (instalado en el
flujo de publicación). Un cambio de formato o dominio requiere revisar la
calibración; no ajustar los límites a partir de la fecha de descarga.

## Valparaíso (CL15VA)

Fuente: https://marejadas.uv.cl/pronosticos/cl15va y su GIF
https://marejadas.uv.cl/images/SAM/dominios/CL15VAG.gif.

No comparte calibración con Talcahuano: EPSG:32719 (UTM 19S), recorte interior
[157,137,899,731], cuadrícula de consulta 742×594 y escala 0–5 m. Los extremos
UTM [246688,6339476,264181,6353462] se digitalizaron por ajuste lineal de las
nueve marcas este 247000–263000 y diez marcas norte 6353000–6339500 de la
carta. Es una georreferencia aproximada; se excluyen bordes y tierra.

`python scripts/marejadas_uv.py --dominio valparaiso` publica
`data/marejadas_uv_valparaiso.json`, con caché independiente de dos horas,
validación de ambos ejes y las once etiquetas de altura de su leyenda. La
escala de cada fecha debe permanecer idéntica. Una falla conserva únicamente
la última corrida válida de esta bahía. El navegador rechaza un archivo de
otro dominio y consulta la cuadrícula del fotograma visible.

Se muestran las fechas realmente disponibles, sin completar ni prometer siete
días si el archivo oficial entrega menos fotogramas. La fixture
`tests/fixtures/uv_valparaiso_20261024.gif` conserva el GIF oficial consultado
el 24/10/2026 (10 fechas cada tres horas), para contrastar ejes, escala, fechas
y georreferencia con el mismo OCR que usa el servidor.
