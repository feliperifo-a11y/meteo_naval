# Resúmenes de avisos sobre el mapa

La portada y el dashboard completo muestran automáticamente una tarjeta por
aviso con zonas vigentes. Incluye tipo, sector, condiciones publicadas, hora de
término en Chile y un enlace al documento o pronóstico oficial de DIRECTEMAR.
Si un aviso afecta varios sectores, sus condiciones se identifican por sector.
Las alertas antárticas calculadas por MeteoIA se identifican como calculadas.

La tarjeta se sitúa dentro de una de las zonas vigentes del aviso, evitando los
huecos de los polígonos. Forma parte del mismo grupo que el área: se retira al
ocultar el aviso o su capa. Los próximos y expirados mantienen el comportamiento
anterior, sin tarjeta automática. La vigencia se recalcula cada minuto; las
lecturas de datos conservan su frecuencia habitual.

El componente y sus estilos están en `build/avisos_mapa.js` y
`build/avisos_mapa.css`. El constructor los incorpora en ambas páginas y los
incluye en la versión que permite actualizar las pestañas abiertas. No modifica
los boletines, sus geometrías ni las reglas que generan los avisos.
