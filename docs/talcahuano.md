# Capuertos: Talcahuano

El dashboard completo ofrece el botón **Capuertos → Capuerto Talcahuano**. Es la
única capitanía incluida. El acceso activa dos capas opcionales y centra la vista:
25 referencias portuarias y nueve puntos de observación (seis estaciones, dos
boyas y un mareógrafo). La portada no incorpora estos datos ni el menú.

El selector de referencias permite abrir las 34 fichas, incluidas ubicaciones
cercanas difíciles de seleccionar en el mapa. Las fichas conservan entidad,
variables documentadas, precisión, disponibilidad y fecha de consulta, notas y
fuentes. «Fuentes y alcance» incluye las resoluciones de 2015 y 2022 y las
descargas GeoJSON/KML. Los documentos no se presentan como límites operacionales
actuales: su vigencia y los umbrales por terminal no se han verificado.

`data/geo/talcahuano.geojson` conserva todos los campos del inventario trasladado
el 24/10/2026 y añade clase, fecha de consulta y correspondencias con MeteoIA.
`data/geo/talcahuano.kml` conserva la exportación original. El constructor incluye
el catálogo y `build/talcahuano.js`/`.css` solo en el dashboard. La publicación
copia ambas descargas a `data/geo/`.

## Estaciones y ausencia de duplicados

| Referencia | Identificador existente |
| --- | --- |
| Talcahuano | `TALCAHUANO` |
| Lirquén | `LIRQUEN` |
| Faro Isla Quiriquina | `WU-ITALCA20` |
| Faro Punta Hualpén | `WU-IHUALP1` |

La capa regional reutiliza los objetos normalizados de la red y su ficha de
mediciones, con la hora propia del dato. Mientras está activa, el constructor de
la capa general omite esas estaciones y la boya Talcahuano, para evitar marcadores
duplicados. Al apagarla se restablecen los marcadores generales. El selector de
la tabla de estaciones reconoce también los marcadores regionales. Las fichas
de las cuatro estaciones generales incluyen los metadatos del inventario.

La posición instrumental mantiene la coordenada de la fuente existente; la
coordenada documental figura por separado. En Quiriquina la ficha DMC del faro
se sitúa aproximadamente 1,9 km al norte de la posición de RedMeteo/Weather
Underground. No se traslada una medición a la coordenada del faro sin verificar
su emplazamiento. Los códigos RedMeteo y DMC se conservan para asociaciones
futuras, sin añadir consultas ni recolectores nuevos.

Watchkeeper conserva su posición histórica publicada en 2025 y la falta de
confirmación de fondeo/transmisión actuales en el estudio. La ficha regional no
asocia esa posición a las lecturas del catálogo general. POSAR no se presenta
como boya de oleaje y el mareógrafo identifica nivel del mar. Un estado de
catálogo «Operational» no se traduce en recepción actual.

## Fuentes principales

- [Plan de mal tiempo, 11/01/2022](https://www.directemar.cl/directemar/site/docs/20220114/20220114153957/19__12000_06_110122_talc_publ.pdf).
- [Deportes náuticos, 08/05/2015](https://www.directemar.cl/directemar/site/docs/20170209/20170209141204/02__12400_1_publ.pdf).
- [Directorio SERVIMET](https://web.directemar.cl/met/jturno/estaciones/davis.htm).
- [Ficha DMC Isla Quiriquina](https://climatologia.meteochile.gob.cl/application/informacion/fichaDeEstacion/360015).
- [Boya POSAR, CR2](https://www.cr2.cl/posar/).
- [Mareógrafo SHOA/IOC Talcahuano](https://www.ioc-sealevelmonitoring.org/station.php?code=talc).

Las demás fuentes y enlaces de geolocalización figuran individualmente en el
GeoJSON y en las fichas. El inventario no añade datos de Marejadas UV ni nodos
operacionales no verificados.
