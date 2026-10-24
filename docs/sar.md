# Capa opcional Distritos SAR

Se activa en **Capas → Distritos SAR** de la portada. Inicia desactivada y no
guarda su estado; al abrir o recargar la página vuelve a estar apagada. La
geometría de Leaflet se crea en la primera activación, sin consultas adicionales.
Mientras está activa se permite alejar el mapa para ver el límite de 131° O;
al apagarla se restablece el zoom mínimo habitual. En móvil la leyenda empieza
plegada para no tapar los distritos.

Incluye el contorno oceánico 120°/131° O, los cuatro paralelos distritales, los
rótulos de los cinco distritos y sus MRCC. Los cuadros se sitúan completamente
a la izquierda del límite oeste, con una separación de 10 píxeles. La vista SAR
reserva espacio lateral para que no queden recortados. Los MRSC se muestran al acercarse
(zoom 5 o superior). La leyenda y los rótulos desaparecen al desactivar la capa.

Los datos están en `data/geo/sar.json`, incorporados solo en la portada por
`scripts/construir_index.py`. El renderizado está en `build/sar.js` y la
configuración del interruptor y el estilo en `build/plantilla_v2.html`.

El archivo representa el esquema de la imagen de referencia, contrastado con:

- [Organización y estructura SAR nacional, apéndice 2 al anexo A (2021)](https://www.directemar.cl/directemar/site/docs/20210317/20210317091425/directiva_cja_sar_2021__buscable_.pdf).
- [Artículo 7 del Tratado de Paz y Amistad (puntos A–F)](https://www.bcn.cl/obtienearchivo?id=recursoslegales/10221.3/35109/1/Tratado_de_Paz_y_Amistad.PDF).

Es una representación de referencia, no un polígono jurisdiccional para resolver
la asignación de una posición a un distrito. Los extremos costeros usan la costa
simplificada del sitio. No se trazan los perímetros insulares particulares del II
Distrito ni el detalle del límite IV–V en los canales. Las posiciones de los
centros son aproximaciones urbanas. El V Distrito continúa al Polo Sur, pero
los trazos oceánicos del mapa se cortan antes de alcanzar la costa antártica.
El recorte usa la [costa global Natural Earth](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson),
ya que la costa incorporada en el sitio no llega hasta 131° O, y una separación visual de
0,75 grados de latitud hacia el norte para mantener el trazo separado también
del borde de hielo visible en el mapa. No modifica la jurisdicción descrita en la fuente.

No se cambian los datos meteorológicos ni el comportamiento de sus capas.
