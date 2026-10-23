(() => {
  'use strict';
  const TOTAL = 8;
  const CLAVE_RECORD = 'meteoia-trivia-record-v1';
  const $ = (id) => document.getElementById(id);
  let ronda = [], indice = 0, aciertos = 0, respondida = false, historial = [];
  let record = 0, almacenamiento = true;
  try {
    const guardado = Number(localStorage.getItem(CLAVE_RECORD));
    if (Number.isInteger(guardado) && guardado >= 0 && guardado <= TOTAL * 100) record = guardado;
    localStorage.setItem(CLAVE_RECORD, String(record));
  } catch { almacenamiento = false; }
  if (record > 0) $('record-inicio').textContent = `Tu mejor marca: ${record} puntos`;

  function barajar(elementos) {
    const copia = [...elementos];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  function enfocar(id) {
    $(id).focus({ preventScroll: true });
    $('juego').scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function comenzar() {
    ronda = barajar(PREGUNTAS).slice(0, TOTAL);
    indice = 0; aciertos = 0; historial = [];
    $('inicio').hidden = true; $('resultado').hidden = true; $('partida').hidden = false;
    mostrarPregunta();
  }

  function mostrarPregunta() {
    respondida = false;
    const actual = ronda[indice];
    $('contador').textContent = `Pregunta ${indice + 1} de ${TOTAL}`;
    $('puntos').textContent = `${aciertos * 100} puntos`;
    $('progreso').value = indice;
    $('categoria').textContent = actual.categoria;
    $('pregunta').textContent = actual.pregunta;
    $('respuesta').hidden = true; $('respuesta').replaceChildren();
    $('siguiente').hidden = true;
    $('opciones').replaceChildren();
    const opciones = barajar(actual.opciones.map((texto, i) => ({ texto, correcta: i === 0 })));
    opciones.forEach((opcion, i) => {
      const boton = document.createElement('button');
      boton.type = 'button'; boton.className = 'opcion';
      const letra = document.createElement('span');
      letra.className = 'letra'; letra.textContent = 'ABCD'[i]; letra.setAttribute('aria-hidden', 'true');
      const texto = document.createElement('span'); texto.textContent = opcion.texto;
      boton.append(letra, texto);
      boton.addEventListener('click', () => responder(opcion, boton, opciones));
      $('opciones').append(boton);
    });
    enfocar('pregunta');
  }

  function responder(elegida, pulsado, opciones) {
    if (respondida) return;
    respondida = true;
    if (elegida.correcta) aciertos++;
    const actual = ronda[indice];
    historial.push({ pregunta: actual, elegida: elegida.texto, acierto: elegida.correcta });
    [...$('opciones').children].forEach((boton, i) => {
      boton.disabled = true;
      if (opciones[i].correcta) {
        boton.classList.add('correcta');
        boton.querySelector('.letra').textContent = '✓';
        boton.setAttribute('aria-label', `${opciones[i].texto}. Respuesta correcta.`);
      } else if (boton === pulsado) {
        boton.classList.add('incorrecta');
        boton.querySelector('.letra').textContent = '×';
        boton.setAttribute('aria-label', `${opciones[i].texto}. Tu respuesta, incorrecta.`);
      } else boton.classList.add('atenuada');
    });
    const titulo = document.createElement('b');
    titulo.textContent = elegida.correcta ? '¡Correcto! +100 puntos' : `La respuesta correcta es: ${actual.opciones[0]}.`;
    const explicacion = document.createElement('p'); explicacion.textContent = actual.explicacion;
    $('respuesta').append(titulo, explicacion); $('respuesta').hidden = false;
    $('puntos').textContent = `${aciertos * 100} puntos`;
    $('progreso').value = indice + 1;
    $('siguiente').textContent = indice === TOTAL - 1 ? 'Ver mi resultado →' : 'Siguiente pregunta →';
    $('siguiente').hidden = false;
    // El foco pasa al siguiente control; la explicación se anuncia mediante role=status.
    $('siguiente').focus({ preventScroll: true });
  }

  function terminar() {
    const puntos = aciertos * 100, nuevoRecord = puntos > record;
    record = Math.max(record, puntos);
    if (almacenamiento) {
      try { localStorage.setItem(CLAVE_RECORD, String(record)); }
      catch { almacenamiento = false; }
    }
    $('partida').hidden = true; $('resultado').hidden = false;
    $('puntaje-final').textContent = puntos;
    $('titulo-resultado').textContent = aciertos === TOTAL ? '¡Tienes buen ojo para el tiempo!' : aciertos >= 5 ? '¡Vas tomando el pulso al cielo!' : 'La curiosidad es el mejor comienzo.';
    $('mensaje-resultado').textContent = `Acertaste ${aciertos} de ${TOTAL} preguntas. ${aciertos === TOTAL ? 'Una ronda perfecta. ¿Repetimos con otro desafío?' : 'Repasa las explicaciones y vuelve a intentarlo con una nueva selección.'}`;
    $('record-final').textContent = `${nuevoRecord ? '¡Nueva mejor marca! ' : ''}Mejor marca: ${record} puntos.${almacenamiento ? ' Guardada solo en este navegador.' : ' Disponible durante esta visita; el navegador no permite guardarla.'}`;
    $('lista-repaso').replaceChildren();
    for (const entrada of historial) {
      const li = document.createElement('li');
      const titulo = document.createElement('b'); titulo.textContent = entrada.pregunta.pregunta;
      const respuesta = document.createElement('p');
      respuesta.className = entrada.acierto ? 'bien' : 'mal';
      respuesta.textContent = `${entrada.acierto ? '✓ Acierto' : '× Tu respuesta'}: ${entrada.elegida}`;
      const solucion = document.createElement('p');
      solucion.textContent = `Respuesta correcta: ${entrada.pregunta.opciones[0]}. ${entrada.pregunta.explicacion}`;
      li.append(titulo, respuesta, solucion); $('lista-repaso').append(li);
    }
    $('resultado').querySelector('details').open = false;
    enfocar('titulo-resultado');
  }

  $('empezar').addEventListener('click', comenzar);
  $('repetir').addEventListener('click', comenzar);
  $('siguiente').addEventListener('click', () => {
    if (!respondida) return;
    indice++;
    if (indice === TOTAL) terminar(); else mostrarPregunta();
  });
})();
