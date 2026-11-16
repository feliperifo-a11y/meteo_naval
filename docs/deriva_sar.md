# Caso SAR: área de búsqueda por deriva con ensemble

Bloque «Área de búsqueda probable · deriva por ensemble» de la herramienta **CASO SAR** de la página Desarrollo.
Complementa el dátum IAMSAR de la misma ficha (una trayectoria y un círculo de error) con una nube de 2.000 derivas
posibles, de la que se obtienen las zonas con 50 % y 90 % de probabilidad y un rectángulo de búsqueda.

Es una herramienta de apoyo en validación: no reemplaza la planificación de búsqueda del MRCC.

## Cómo se usa

1. Marcar la posición del caso, indicar la hora del incidente y pulsar **Analizar**.
2. En «Deriva y dátum», elegir la hora del dátum (ahora o hasta +72 h) y el error X de la posición inicial.
3. En el bloque nuevo, elegir la **categoría del objeto** (27 categorías Leeway: personas en el agua, balsas, botes,
   pesqueros, veleros, restos) y, si no se conoce la hora exacta, la **incertidumbre de la hora**.
4. Pulsar **Calcular área de búsqueda**. El cálculo demora pocos segundos y se hace en el navegador.
5. El deslizador muestra la nube hora a hora. «Copiar área de búsqueda» deja en el portapapeles la posición más
   probable y los vértices del rectángulo.

En el mapa: zona del 50 % en rojo, zona del 90 % en naranjo, partículas en gris, partículas varadas en rojo oscuro,
rectángulo de búsqueda en línea azul segmentada y posición más probable como punto rojo.

## Método

- **Motor:** `build/deriva_sar.js`, sin dependencias. Paso de 15 minutos, salida horaria.
- **Abatimiento:** método Leeway (componente a favor del viento y transversal, con cambio de banda de 4 % por hora),
  con la formulación y la tabla de coeficientes del modelo Leeway de OpenDrift (`OBJECTPROP.DAT`).
- **Viento:** ECMWF IFS 9 km en una grilla de 4 × 4 puntos que cubre la deriva esperada. Cada partícula suma la
  desviación de un miembro del ensemble ECMWF (51 miembros, 0,25°, grilla de 3 × 3) respecto de la media del ensemble.
  El ensemble cubre hasta 3 días hacia atrás; antes de eso, o si no responde, se aplica un error persistente de
  1,5 m/s por componente y la ficha lo indica.
- **Corriente:** Météo-France (vía Open-Meteo Marine), grilla de 5 × 5 puntos. No hay ensemble de corrientes: cada
  partícula lleva un error persistente de 0,10 m/s por componente (cerca de 0,3 kt, el valor por defecto del IAMSAR)
  y una difusión de 10 m²/s.
- **Posición y hora iniciales:** normal circular en que X es el radio que contiene el 50 %; la hora se sortea de
  manera uniforme dentro del margen indicado.
- **Costa:** máscara de 500 × 500 celdas a partir de la costa incorporada en el sitio. La partícula que llega a
  tierra queda varada en su última posición en el agua.
- **Resultado:** densidad en grilla con suavizado; las zonas del 50 % y 90 % son las celdas de mayor densidad que
  acumulan esa probabilidad. El rectángulo se orienta según el eje principal de las partículas de la zona del 90 %.

Todo el cálculo ocurre en el navegador con datos pedidos directamente a Open-Meteo. La posición del caso no se
publica ni pasa por el repositorio.

## Validación

`tests/deriva_sar.test.cjs` compara el motor con OpenDrift 1.14.11 (modelo Leeway) con viento y corriente idénticos,
en 16 casos (8 categorías de objeto; viento constante y viento que rota), 6.000 partículas y 24 h. Los resultados de
OpenDrift están en `tests/fixtures/deriva_opendrift.json`. La deriva media difiere menos de 1,5 % y la dispersión
menos de 3 %, dentro del error de muestreo. Esta comparación valida la formulación, no la calidad de los pronósticos
de viento y corriente.

## Límites

- La corriente del modelo global no resuelve la marea local, los canales ni las bahías cerradas.
- La costa es simplificada: la varada es aproximada.
- El resultado depende de la categoría elegida; si el estado del objeto es incierto conviene calcular más de una.
- No se ha contrastado con derivas reales (boyas de deriva o casos) en aguas chilenas. Con derivas de varios días la
  incertidumbre real puede ser mayor que la mostrada.

## Referencias

- Allen, A. A. y Plourde, J. V. (1999). *Review of Leeway: Field Experiments and Implementation*. U.S. Coast Guard
  Research and Development Center, informe CG-D-08-99.
- Allen, A. A. (2005). *Leeway Divergence*. U.S. Coast Guard Research and Development Center, informe CG-D-05-05.
- Breivik, Ø. y Allen, A. A. (2008). An operational search and rescue model for the Norwegian Sea and the North Sea.
  *Journal of Marine Systems*, 69, 99-113.
- Dagestad, K.-F., Röhrs, J., Breivik, Ø. y Ådlandsvik, B. (2018). OpenDrift v1.0: a generic framework for trajectory
  modelling. *Geoscientific Model Development*, 11, 1405-1420.

# Caso SAR: plan de búsqueda

Bloque «Plan de búsqueda» de la ficha, a continuación del área de búsqueda. Convierte el área en un patrón que un medio
puede ejecutar. Motor en `build/busqueda_sar.js`; pruebas en `tests/busqueda_sar.test.cjs`.

- **Área:** el rectángulo de la deriva por ensemble a la hora mostrada; si no se ha calculado, un cuadrado de lado 2E
  centrado en el dátum IAMSAR.
- **Espaciamiento:** tablas del Manual IAMSAR, vol. III, sección 3: espaciamiento recomendado para buques mercantes
  (Su) y anchos de barrido para helicópteros y aviones, según el objeto y la visibilidad meteorológica, con
  interpolación entre columnas. Se corrige con el factor por tiempo fw (viento sobre 15 o 25 kt, ola sobre 1 o 1,5 m).
  La visibilidad, el viento y la ola son los pronosticados para la hora del dátum; todo se puede cambiar a mano.
- **Patrones:** trayectorias paralelas (PS), línea progresiva (CS), cuadrado expansivo (SS) y sector (VS). En PS y CS
  el espaciamiento se ajusta hacia abajo para cubrir el área exacta y el primer tramo va a medio espaciamiento del
  borde; el inicio es la esquina más cercana al centro coordinador más próximo. SS parte en la posición más probable
  con el primer tramo contra el viento y virajes de 90° a estribor. VS usa virajes de 120° a estribor y 9 radios.
- **Resultados:** tramos, rumbos, recorrido, tiempo a la velocidad indicada, parte del patrón que alcanza a recorrerse
  en las horas disponibles, factor de cobertura C = W / S, probabilidad de detección POD = 1 − e^(−C) (búsqueda
  aleatoria, la curva más conservadora) y probabilidad de éxito = POD × proporción de partículas dentro de lo barrido.

Límites: búsqueda visual de día; no considera fatiga, altura de vuelo, tránsito al área ni otros sensores. Las tablas
se contrastaron con una copia del manual (Doc 9731, págs. 3-18 a 3-20) y deben confirmarse con la edición vigente.

# Caso SAR: borrador de SITREP

Último bloque de la ficha. Arma el informe de situación en el formato normalizado del Manual IAMSAR (vol. II,
apéndice I): forma breve (párrafos A a F) o completa (A a N), en español o en inglés. Texto en `build/sitrep_sar.js`;
pruebas en `tests/sitrep_sar.test.cjs`.

- De la ficha se toman la posición (B), la fase y la hora del incidente (C), las condiciones en el lugar (H, que son
  el pronóstico del modelo y así se declara), las medidas adoptadas (J, desde la descripción del caso) y el área de
  búsqueda con su patrón (K).
- El coordinador completa identidad, naturaleza del suceso, personas, auxilio requerido, descripción, instrucciones,
  planes e información adicional. Lo que falta queda como «NO INFORMADO».
- El grupo fecha-hora es UTC. «Copiar y pasar al N.º siguiente» deja el texto en el portapapeles y aumenta el número.

No usa inteligencia artificial: es una plantilla que se llena con los datos del caso. La página no transmite nada.
