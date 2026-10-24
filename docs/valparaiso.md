# Capuertos · Valparaíso

El dashboard ofrece Capuertos → Capuerto Valparaíso y un desplegable Valparaíso junto a Talcahuano. Las capas comienzan apagadas. El acceso directo activa terminales, fondeos, ZEP y observación costera, abre el desplegable y centra los datos del paquete. Los radios de borneo se activan por separado.

## Datos aportados

Se incorporan sin modificar los valores del ZIP `Bahia_Valparaiso_MeteoIA_Paquete.zip`, preparado el 24/10/2026:

- `data/geo/valparaiso.geojson`: 23 fondeos (incluidos A-7 y Uniform), tres posiciones generales de terminales/frentes y un polígono ZEP.
- `data/geo/valparaiso_limites.json`: condiciones y dimensiones citadas en las resoluciones del paquete.
- `data/geo/valparaiso.kml`: exportación de las mismas 27 geometrías y propiedades. No se generan coordenadas distintas para los sitios 6, 7 y 8.

El HTML adjunto se usa como referencia, sin incorporar ni ejecutar sus scripts. El informe Word se consultó para contrastar alcance y fuentes. No se incluye el ZIP ni el informe en la publicación.

## Presentación

Fichas con el estilo del catálogo Talcahuano, coordenadas originales, sonda referencial, clase de nave, radio de borneo y resolución enlazada. Las fichas de terminales distinguen valores documentales de información del operador. Espigón conserva las condiciones particulares de los sitios 6, 7 y 8 dentro de la misma ficha de instalación.

El filtro ofrece todos, eslora menor de 100 m, mayor de 100 m, bunkering (India, Juliet y A-7), y carga vital (Uniform). El filtro también afecta los radios; abrir un fondeo excluido restablece la visibilidad. Los radios se dibujan con metros, sin interceptar clics, y no son zonas asignadas o autorizadas.

ZEP se muestra en violeta, con la prohibición documental de fondeo y las referencias de aproximación de 2018 y 2022. No se compara automáticamente la meteorología con umbrales ni se deduce cierre de puerto. Se mantienen el aviso de datum/vigencia pendiente y el carácter informativo de las coordenadas del paquete.

## Observaciones

Valparaíso (`VALPARAISO`) y Viña del Mar / Montemar (`WL-240087`, contexto regional) reutilizan posiciones, horas, símbolos y fichas de la red nacional. No se crean mediciones ni instrumentos nuevos. Las actualizaciones conservan los marcadores, y la capa nacional omite las estaciones mientras se muestran en Valparaíso. Al apagar la capa regional vuelven a la red general. La tabla nacional puede abrir también el marcador regional.

El máximo de zoom considera ambos catálogos: apagar uno no reduce el zoom si queda otra capa de Capuertos activa. Las cartas UV y WRF de Talcahuano se ocultan al enfocar referencias de Valparaíso. El paquete no aporta una corrida UV para esta bahía; no se desplaza la de Talcahuano a otra ubicación.

## Contraste de fuentes (24/10/2026)

Se revisaron los documentos enlazados del paquete y las coordenadas originales de fondeo y ZEP. Esto no certifica vigencia ni ausencia de cambios posteriores:

- [Fondeos 12000/934, 04/10/2018](https://www.directemar.cl/directemar/site/docs/20181017/20181017113445/08__12000_934_041018_publ.pdf).
- [TPS 1–3, 12000/728, 25/07/2018, archivo con cambio de 14/03/2019](https://www.directemar.cl/directemar/site/docs/20180726/20180726115752/07__12000_728_250718_publ.pdf).
- [TPS 4–5, 12000/729, 25/07/2018, archivo con cambio de 14/03/2019](https://www.directemar.cl/directemar/site/docs/20180726/20180726120345/06__12000_729_250718_publ.pdf).
- [Espigón 6–8, 12000/196, 10/03/2022](https://www.directemar.cl/directemar/site/docs/20220314/20220314092543/23__12000_196_100322_publ.pdf).
- [Infraestructura TPS](https://www.tps.cl/tps/infraestructura-y-equipamiento): publica 13,8 m para sitios 1–3, frente a los 14,1 m del documento de 2018. La ficha muestra ambos con atribución y fecha, sin seleccionar automáticamente un valor aplicable.

## Verificación

Pruebas de preservación de coordenadas grados/minutos, las 27 geometrías y sus exportaciones; construcción diferida y alternancia sin duplicados; filtros y radios; apertura de un fondeo oculto por filtro; actualización de observaciones reales; fichas y escape de textos; zoom compartido; exclusión de duplicados de la red nacional; publicación solo en dashboard y copia de descargas.
