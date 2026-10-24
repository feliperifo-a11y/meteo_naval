# Ficha de avisos sobre el mapa

En la portada y el dashboard completo, al pasar el cursor sobre una zona con
aviso vigente aparece una ficha con solo el título, la vigencia en hora de Chile
y el enlace al documento o pronóstico oficial de DIRECTEMAR. En pantallas táctiles
se abre al tocar el área. Las alertas antárticas calculadas usan el título
«Alerta MeteoIA · Zona IX».

El mapa inicia sin fichas abiertas. Se puede mover el cursor desde el área hacia
la ficha para pulsar el enlace; al salir de ambas, se cierra. Se retira también al
ocultar la geometría del aviso. La vigencia corresponde a la zona señalada y se
comprueba nuevamente al abrir la ficha. El mapa recalcula estados cada minuto.

El componente y sus estilos están en `build/avisos_mapa.js` y
`build/avisos_mapa.css`. El constructor los incorpora en ambas páginas y los
incluye en la versión que actualiza las pestañas abiertas. Los avisos próximos,
los expirados y los boletines conservan su comportamiento anterior.
