// Capa de referencia SAR. Se dibuja únicamente cuando el usuario la activa.
function crearCapaSAR(L, map, datos, escapar) {
  const grupo = L.layerGroup();
  const detalle = L.layerGroup();
  let creada = false;
  const zoomMinimo = map.getMinZoom();
  const fuente = datos.metadata.fuentes[0];
  const leyenda = L.control({ position: 'bottomright' });
  leyenda.onAdd = function () {
    const div = L.DomUtil.create('div', 'sar-info');
    div.innerHTML = `<details${map.getContainer().clientWidth > 500 ? ' open' : ''}><summary>Distritos SAR</summary><span><i class="sar-line"></i> Límite oceánico</span>` +
      '<span><i class="sar-line sar-dash"></i> Separación distrital</span>' +
      '<small>Esquema referencial. Excepciones insulares y detalle costero en la referencia.</small>' +
      '<div><button type="button">Ampliar vista SAR</button> · ' +
      `<a href="${escapar(fuente.url)}" target="_blank" rel="noopener noreferrer">Referencia</a></div></details>`;
    div.querySelector('button').onclick = () => map.fitBounds([[-78, -134], [-16, -50]], { padding: [18, 24] });
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  function actualizarDetalle() {
    L.DomUtil[map.getZoom() < 3.25 ? 'addClass' : 'removeClass'](map.getContainer(), 'sar-compact');
    if (map.getZoom() >= 5) grupo.addLayer(detalle);
    else grupo.removeLayer(detalle);
  }
  function dibujar() {
    map.createPane('sarPane').style.zIndex = 370;
    map.createPane('sarLabelPane').style.zIndex = 455;
    for (const feature of datos.features) {
      const p = feature.properties;
      if (feature.geometry.type === 'LineString') {
        L.geoJSON(feature, {
          pane: 'sarPane',
          style: { color: p.tipo === 'limite' ? '#ffad62' : '#ffe2a6', weight: p.tipo === 'limite' ? 2.5 : 1.8,
            opacity: 0.95, dashArray: p.tipo === 'distrital' ? '5 6' : null, fill: false },
          onEachFeature: (f, layer) => layer.bindTooltip(escapar(p.nombre), { sticky: true })
        }).addTo(grupo);
      } else if (p.tipo === 'rotulo') {
        const pos = feature.geometry.coordinates.slice().reverse();
        L.marker(pos, { pane: 'sarLabelPane', keyboard: true,
          icon: L.divIcon({ className: 'sar-label', iconSize: [0, 0],
            html: `<span style="border-color:${escapar(p.color)}"><b>${escapar(p.nombre)}</b><small>MRCC ${escapar(p.mrcc)}</small><em>${escapar(p.distrito)} · ${escapar(p.mrcc)}</em></span>` })
        }).bindPopup(`<b>${escapar(p.nombre)} · MRCC ${escapar(p.mrcc)}</b><p>${escapar(p.detalle)}</p>` +
          `<p>${escapar(datos.metadata.insular)}</p><small>${escapar(datos.metadata.alcance)}</small>`, { maxWidth: 310 })
          .addTo(grupo);
      } else if (p.tipo === 'centro') {
        const principal = p.rol === 'MRCC';
        L.circleMarker(feature.geometry.coordinates.slice().reverse(), {
          pane: 'sarPane', radius: principal ? 5 : 4, color: '#fff3db', weight: 1.4,
          fillColor: principal ? '#ffb65c' : '#ee6f64', fillOpacity: 1
        }).bindTooltip(`${escapar(p.nombre)} · Distrito ${escapar(p.distrito)}`, {
          permanent: !principal, direction: 'right', className: 'sar-center-name'
        }).addTo(principal ? grupo : detalle);
      }
    }
    creada = true;
  }
  grupo.on('add', () => {
    if (!creada) dibujar();
    map.setMinZoom(Math.min(zoomMinimo, 1.5));
    actualizarDetalle();
    leyenda.addTo(map);
    map.on('zoomend', actualizarDetalle);
  });
  grupo.on('remove', () => {
    map.off('zoomend', actualizarDetalle);
    L.DomUtil.removeClass(map.getContainer(), 'sar-compact');
    map.setMinZoom(zoomMinimo);
    map.removeControl(leyenda);
  });
  return grupo;
}
