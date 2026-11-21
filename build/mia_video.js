// ============================ Video de presentación de MIA (portada) ============================
// Reproductor chico que aparece junto a MIA al entrar, se reproduce solo y se cierra al terminar.
//
// Sobre el audio: los navegadores no permiten que un video arranque con sonido si la persona todavía no ha interactuado
// con el sitio (política de reproducción automática de Chrome, Safari y Firefox). Lo que sí está siempre permitido es
// arrancar en silencio. Por eso la secuencia es: se parte en silencio y de inmediato se intenta activar el sonido; si el
// navegador lo rechaza, queda el botón de sonido a la vista y, además, el primer clic o toque en cualquier parte de la
// página lo activa solo. En un equipo donde la persona ya usó el sitio, o con MeteoIA instalada como aplicación, el
// sonido suele salir desde el primer segundo.
(function () {
  const CLAVE = 'meteoia_mia_video';         // se muestra una vez por navegador; borrar esta clave lo vuelve a mostrar
  const UNA_VEZ = true;                      // false: se muestra en cada visita
  const ESPERA = 1200;                       // ms antes de aparecer, para no competir con la carga de la portada
  const EN = window.METEOIA_LANG === 'en';
  const T = EN
    ? { activar: 'Turn sound on', silencio: 'Mute', cerrar: 'Close', etiqueta: 'MeteoIA presentation', sonido: 'Sound off, tap to listen' }
    : { activar: 'Activar sonido', silencio: 'Silenciar', cerrar: 'Cerrar', etiqueta: 'Presentación de MeteoIA', sonido: 'Sin sonido, toca para escuchar' };

  function arrancar() {
    if (UNA_VEZ) { try { if (localStorage.getItem(CLAVE)) return; localStorage.setItem(CLAVE, '1'); } catch (e) { /* sin almacenamiento: se muestra igual */ } }
    if (!document.createElement('video').canPlayType('video/mp4')) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const caja = document.createElement('div');
    caja.className = 'miav'; caja.dataset.i18n = 'no';
    caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-label', T.etiqueta);
    caja.innerHTML = `
      <video class="miav-v" playsinline muted preload="auto" poster="media/mia_intro.jpg" aria-label="${T.etiqueta}">
        <source src="media/mia_intro.mp4" type="video/mp4">
      </video>
      <button type="button" class="miav-son" title="${T.activar}" aria-label="${T.activar}">🔇<span>${T.sonido}</span></button>
      <button type="button" class="miav-x" title="${T.cerrar}" aria-label="${T.cerrar}">✕</button>
      <div class="miav-barra"><i></i></div>`;
    document.body.appendChild(caja);

    const v = caja.querySelector('.miav-v'), bSon = caja.querySelector('.miav-son'), barra = caja.querySelector('.miav-barra i');
    let cerrado = false;

    function cerrar() {
      if (cerrado) return; cerrado = true;
      quitarEscuchas();
      caja.classList.add('miav-fin');
      try { v.pause(); } catch (e) { /* ya detenido */ }
      setTimeout(() => caja.remove(), 320);
    }
    // Deja el botón acorde al estado real del video
    function pintarSonido() {
      const callado = v.muted || v.volume === 0;
      bSon.firstChild.nodeValue = callado ? '🔇' : '🔊';
      bSon.classList.toggle('miav-callado', callado);
      bSon.title = callado ? T.activar : T.silencio;
      bSon.setAttribute('aria-label', bSon.title);
    }
    async function conSonido() {
      v.muted = false; v.volume = 1;
      try { await v.play(); pintarSonido(); return true; }
      catch (e) { v.muted = true; try { await v.play(); } catch (e2) { /* ni en silencio: se cierra */ cerrar(); } pintarSonido(); return false; }
    }
    // Primer gesto en la página: el navegador ya permite el sonido
    function alPrimerGesto() { if (!cerrado && v.muted) conSonido(); quitarEscuchas(); }
    function quitarEscuchas() { for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.removeEventListener(ev, alPrimerGesto, true); }

    bSon.onclick = e => { e.stopPropagation(); if (v.muted) conSonido(); else { v.muted = true; pintarSonido(); } };
    caja.querySelector('.miav-x').onclick = e => { e.stopPropagation(); cerrar(); };
    v.addEventListener('ended', cerrar);
    v.addEventListener('error', cerrar);
    v.addEventListener('timeupdate', () => { if (v.duration) barra.style.width = (100 * v.currentTime / v.duration).toFixed(1) + '%'; });
    // Red de seguridad: si el video no termina por algún motivo, igual se va
    setTimeout(cerrar, 45000);

    requestAnimationFrame(() => caja.classList.add('miav-ver'));
    v.play().then(() => { pintarSonido(); conSonido(); }).catch(cerrar);
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, alPrimerGesto, true);
  }

  const lanzar = () => setTimeout(arrancar, ESPERA);
  if (document.readyState === 'complete') lanzar();
  else window.addEventListener('load', lanzar, { once: true });
})();
