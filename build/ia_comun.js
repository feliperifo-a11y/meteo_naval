// Compartido por index.html y ia.html: ubicación de cada meteograma y símbolos de nubosidad.
const IA_POS = {
  ARICA_norte_d03: [-18.470, -70.335], IQUIQUE_norte_d03: [-20.200, -70.170], PATACHE_norte_d03: [-20.800, -70.215],
  TOCOPILLA_norte_d04: [-22.090, -70.225], ANTOFAGASTA_norte_d04: [-23.640, -70.420], CHANARAL_norte_d05: [-26.345, -70.655],
  CALDERA_norte_d05: [-27.060, -70.840], COQUIMBO_centro_d07: [-29.940, -71.355], LOSVILOS_centro_d08: [-31.910, -71.530],
  QUINTERO_centro_d08: [-32.770, -71.535], VALPARAISO_centro_d08: [-33.020, -71.630], SANANTONIO_centro_d08: [-33.580, -71.640],
  LIRQUEN_centro_d09: [-36.700, -72.990], TALCAHUANO_centro_d09: [-36.690, -73.100], SANVICENTE_centro_d09: [-36.740, -73.165],
  CORONEL_centro_d09: [-37.025, -73.180], LOTA_centro_d09: [-37.090, -73.170], LEBU_centro_d09: [-37.600, -73.690],
  VALDIVIA_centro_d10: [-39.815, -73.245], CORRAL_centro_d10: [-39.870, -73.430], PUERTOMONTT_sur_d12: [-41.490, -72.950],
  GCORONADO_sur_d12: [-41.700, -73.950], ANCUD_sur_d12: [-41.850, -73.850], CASTRO_sur_d12: [-42.480, -73.760],
  QUELLON_sur_d12: [-43.120, -73.620], GOLFOCORCOVADO_sur_d12: [-43.400, -73.200], ISLAGUAFO_sur_d12: [-43.600, -74.720],
  FAROEVANGELISTA_sur_d13: [-52.400, -75.100], PASOTAMAR_sur_d13: [-52.930, -73.800], SENOOTWAY_sur_d14: [-52.950, -71.400],
  PUNTAARENAS_sur_d14: [-53.160, -70.880], BRECKNOCK_sur_d15: [-54.550, -71.300], TORTUOSO_sur_d11: [-53.620, -72.500],
  ISLAROBINSONCRUSOE_1dom_d01: [-33.637, -78.835],   // 27 km (bahía Cumberland)
  // 9 km
  HUASCO_centro_d06: [-28.460, -71.225], CONSTITUCION_centro_d06: [-35.330, -72.420], ISLAMOCHA_centro_d06: [-38.370, -73.920],
  PUERTOSAAVEDRA_centro_d06: [-38.785, -73.400], CMORALEDA_sur_d11: [-44.800, -73.450], PUERTOCHACABUCO_sur_d11: [-45.465, -72.825],
  GOLFOPENAS_sur_d11: [-47.400, -75.000], PUERTONATALES_sur_d11: [-51.730, -72.510], PRIMERANGOSTURA_sur_d11: [-52.520, -69.600],
  FROWARD_sur_d11: [-53.900, -71.300], PUERTOWILLIAMS_sur_d11: [-54.935, -67.610], CABODEHORNOS_sur_d11: [-55.980, -67.270],
  // 10 km (Antártica)
  A_FILDES_Antartica_d02: [-62.200, -58.950], A_BASEPRAT_Antartica_d02: [-62.480, -59.665], A_DECEPCION_Antartica_d02: [-62.970, -60.650],
  A_BAHIAWHISKY_Antartica_d02: [-63.930, -57.950], A_BASEOHIGGINS_Antartica_d02: [-63.320, -57.900], A_ANTARCTIC_Antartica_d02: [-63.400, -56.900],
  A_CALETASNOW_Antartica_d02: [-62.750, -61.350], A_GERLACHE_Antartica_d02: [-64.500, -62.300], A_BAHIAPARAISO_Antartica_d02: [-64.850, -62.900],
  A_BAHIASOUTH_Antartica_d02: [-64.880, -63.580],
};
const ICO_NUB = {
  Despejado: '<circle cx="12" cy="12" r="5" fill="#f2b705"/><g stroke="#f2b705" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g>',
  Parcial: '<circle cx="9" cy="9" r="4.5" fill="#f2b705"/><path d="M8 20h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 8 20Z" fill="#b8c2cc"/>',
  Nublado: '<path d="M6 19h12a4.5 4.5 0 0 0 .6-9 6 6 0 0 0-11.5 1.6A3.8 3.8 0 0 0 6 19Z" fill="#8a96a3"/>',
  Cubierto: '<path d="M4 15h10a3.5 3.5 0 0 0 .4-7 4.7 4.7 0 0 0-9 1.3A2.9 2.9 0 0 0 4 15Z" fill="#a9b3bd"/><path d="M8 21h11a4 4 0 0 0 .5-8 5.3 5.3 0 0 0-10.2 1.4A3.3 3.3 0 0 0 8 21Z" fill="#5b6673"/>',
};
const svgNub = (n, px = 20) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true">${ICO_NUB[n] || '<circle cx="12" cy="12" r="4" fill="#8a96a3"/>'}</svg>`;
