# Capuertos: Talcahuano

El dashboard completo ofrece el botón **Capuertos → Capuerto Talcahuano**. Es la
única capitanía incluida. El acceso activa dos capas opcionales y centra la vista:
25 referencias portuarias y siete puntos de observación (seis estaciones y una
boya SHOA Watchkeeper). La portada no incorpora estos datos ni el menú.

El selector de referencias permite abrir las 32 fichas, incluidas ubicaciones
cercanas difíciles de seleccionar en el mapa. Las fichas conservan entidad,
variables documentadas, precisión, disponibilidad y fecha de consulta, notas y
fuentes. «Fuentes y alcance» incluye las resoluciones de 2015 y 2022 y las
descargas GeoJSON/KML. Los documentos no se presentan como límites operacionales
actuales: su vigencia y los umbrales por terminal no se han verificado.

`data/geo/talcahuano.geojson` conserva los campos del inventario y las referencias actualmente incluidas,
con su clase, fecha de consulta y correspondencias con MeteoIA.
`data/geo/talcahuano.kml` ofrece la misma selección de 32 referencias. El constructor incluye
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
de mediciones y sus símbolos son los mismos de la red nacional. Los antecedentes
documentales quedan dentro de «Ubicación, antecedentes y fuentes», cerrado al abrir.
Las actualizaciones conservan el marcador y la ficha abiertos.

La posición instrumental mantiene la coordenada de la fuente existente; la
coordenada documental figura por separado. En Quiriquina la ficha DMC del faro
se sitúa aproximadamente 1,9 km al norte de la posición de RedMeteo/Weather
Underground. No se traslada una medición a la coordenada del faro sin verificar
su emplazamiento. Penco se complementa desde el JSON público de RedMeteo (`RMCL0193`), con viento
convertido de m/s a nudos y la fecha de la observación, no la del archivo. Carriel
Sur usa el METAR `SCIE` difundido por NOAA/AWC (observación DMC/DGAC): viento en
nudos y presión QNH en hPa; la humedad no se calcula ni se presenta como medición.
Se respeta la posición comunicada por el METAR, separada de la del inventario.
Ambas fuentes se actualizan en el flujo habitual mediante
`scripts/talcahuano_observaciones.py`; un fallo conserva la observación anterior,
que envejece con su hora original. El navegador integra los datos sin duplicar
ni reemplazar una estación que ya tenga observaciones en la red nacional.

Watchkeeper se asocia a la boya Talcahuano del catálogo SHOA ya usado por el
dashboard, tanto en la posición de referencia como en las lecturas, estado,
símbolo y gráfico de altura significativa. Su posición histórica publicada en
2025 permanece separada en los antecedentes: no se trasladan las mediciones a
esa ubicación. La recepción y los errores de acceso se muestran igual que en
las demás boyas nacionales. La capa general omite este mismo instrumento
mientras está activa la regional.

La boya POSAR y el mareógrafo de Talcahuano se retiraron del catálogo, del mapa,
del selector de referencias y de ambas descargas por solicitud del usuario,
al no contar con lecturas disponibles en esta integración. Se mantienen las
seis estaciones y la boya SHOA Watchkeeper.

## Fuentes principales

- [Plan de mal tiempo, 11/01/2022](https://www.directemar.cl/directemar/site/docs/20220114/20220114153957/19__12000_06_110122_talc_publ.pdf).
- [Deportes náuticos, 08/05/2015](https://www.directemar.cl/directemar/site/docs/20170209/20170209141204/02__12400_1_publ.pdf).
- [Directorio SERVIMET](https://web.directemar.cl/met/jturno/estaciones/davis.htm).
- [Ficha DMC Isla Quiriquina](https://climatologia.meteochile.gob.cl/application/informacion/fichaDeEstacion/360015).

Las demás fuentes y enlaces de geolocalización figuran individualmente en el
GeoJSON y en las fichas. El inventario no añade datos de Marejadas UV ni nodos
operacionales no verificados.
