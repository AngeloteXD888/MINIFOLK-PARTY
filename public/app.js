/**
 * app.js — Lógica principal del cliente de Badajoz Party
 *
 * FLUJO:
 * 1. Contraseña → conectar socket con auth → Menú
 * 2. Crear sala / Unirse → elegir rol → Vista Pantalla o Vista Jugador
 * 3. Gestionar estado en tiempo real via room:state
 * 4. Reconexión automática por playerId guardado en localStorage
 * 5. Screen Wake Lock para que el móvil no se apague
 *
 * NOTA: este archivo es un módulo ES (type="module" en HTML).
 * Socket.io-client se obtiene del servidor (misma versión que el server).
 */

// ─── Importaciones ─────────────────────────────────────────────────────────────
// Socket.io ESM servido directamente por el servidor Express
import { io } from '/socket.io/socket.io.esm.min.js';
import { BadajozMinigames3D } from './minigames.js';

// ─── Estado de la aplicación ───────────────────────────────────────────────────

/** Estado centralizado del cliente. Solo se modifica a través de los handlers de eventos. */
const state = {
  socket:           null,    // Instancia de socket.io
  password:         null,    // Contraseña maestra (guardada para reconexión)
  roomCode:         null,    // Código de la sala actual
  playerId:         null,    // ID único del jugador (persistente en localStorage)
  role:             null,    // 'pantalla' | 'jugador'
  esAnfitrion:      false,   // ¿Es el jugador el anfitrión?
  miJugador:        null,    // Datos del propio jugador (color, nombre, avatarId, listo)
  avatares:         [],      // Lista de avatares del catálogo (cargada de /avatars/avatars.json)
  wakeLock:         null,    // Screen Wake Lock handle
  sceneCleanup:     null,    // Función para limpiar la escena lobby Three.js al salir
  boardInstance:    null,    // Instancia de BadajozBoard3D (tablero 3D de juego)
  minigameInstance: null,    // Instancia de BadajozMinigames3D (minijuegos 3D)
  minigameActive:   false,   // ¿Hay un minijuego en curso?
  minigameId:       null,    // ID del minijuego activo
  minigameTimer:    null,    // Timer para cuenta atrás
  joinRoomCode:     null,    // Código pre-rellenado desde URL (?room=XXXX)
  turnoActivo:      false,   // ¿Es actualmente el turno de este jugador?
  timerInterval:    null,    // Intervalo del contador de turno en el mando
  jugadoresTablero: new Map(), // Map(playerId -> { nombre, color, ... }) — caché en partida
};

// ─── Claves de localStorage ────────────────────────────────────────────────────
const LS_PASSWORD  = 'bp_password';
const LS_ROOM_CODE = 'bp_roomCode';
const LS_PLAYER_ID = 'bp_playerId';
const LS_ROLE      = 'bp_role';

// ─── Referencias DOM ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const views = {
  password:       $('view-password'),
  menu:           $('view-menu'),
  lobbyScreen:    $('view-lobby-screen'),
  lobbyPlayer:    $('view-lobby-player'),
  boardScreen:    $('view-board-screen'),    // Vista tablero 3D (Pantalla)
  boardPlayer:    $('view-board-player'),    // Vista mando móvil (Jugador)
  minigameScreen: $('view-minigame-screen'), // Vista minijuego 3D (Pantalla)
  minigamePlayer: $('view-minigame-player'), // Vista controles minijuego (Jugador)
};

// ─── Gestión de vistas ─────────────────────────────────────────────────────────

/**
 * Cambia la vista activa con una transición de fade.
 * @param {'password'|'menu'|'lobbyScreen'|'lobbyPlayer'} viewName
 */
function showView(viewName) {
  Object.entries(views).forEach(([name, el]) => {
    el.classList.remove('active', 'visible');
  });

  const target = views[viewName];
  if (!target) return;

  target.classList.add('active');
  // Forzar reflow para que la transición funcione
  target.getBoundingClientRect();
  requestAnimationFrame(() => target.classList.add('visible'));
}

// ─── Screen Wake Lock ──────────────────────────────────────────────────────────

/**
 * Adquiere el Screen Wake Lock para evitar que el móvil se apague.
 * Hace re-adquisición automática al volver de segundo plano (visibilitychange).
 */
async function adquirirWakeLock() {
  if (!('wakeLock' in navigator)) {
    console.info('[WakeLock] No soportado en este navegador (sin HTTPS o browser antiguo)');
    return;
  }
  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    console.info('[WakeLock] Adquirido');
    state.wakeLock.addEventListener('release', () => {
      console.info('[WakeLock] Liberado');
    });
  } catch (err) {
    console.warn('[WakeLock] No se pudo adquirir:', err.message);
  }
}

/** Re-adquiere el Wake Lock al volver de segundo plano */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && state.role) {
    // Solo re-adquirir si estamos en una vista de juego
    await adquirirWakeLock();
  }
});

// ─── Carga de avatares ─────────────────────────────────────────────────────────

/**
 * Carga el catálogo de avatares desde /avatars/avatars.json.
 * @returns {Promise<Array>}
 */
async function cargarAvatares() {
  try {
    const res = await fetch('/avatars/avatars.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.avatares = await res.json();
    return state.avatares;
  } catch (err) {
    console.error('[Avatares] Error cargando:', err);
    return [];
  }
}

// ─── Galería de avatares ───────────────────────────────────────────────────────

/**
 * Renderiza la galería de selección de avatares.
 * Marca como "taken" los avatares ocupados por otros jugadores.
 * @param {string[]} avataresOcupados - IDs de avatares ya elegidos por otros
 */
function renderizarGaleria(avataresOcupados = []) {
  const gallery = $('avatar-gallery');
  if (!gallery) return;

  const selectedId = state.miJugador?.avatarId || null;

  gallery.innerHTML = state.avatares.map(av => {
    const isTaken    = avataresOcupados.includes(av.id) && av.id !== selectedId;
    const isSelected = av.id === selectedId;

    return `
      <button
        class="avatar-card${isSelected ? ' avatar-selected' : ''}${isTaken ? ' avatar-taken' : ''}"
        data-avatar-id="${av.id}"
        aria-label="${av.nombre}${isTaken ? ' (ocupado)' : ''}${isSelected ? ' (seleccionado)' : ''}"
        aria-pressed="${isSelected}"
        ${isTaken ? 'disabled aria-disabled="true"' : ''}
      >
        <img
          class="avatar-card-img"
          src="${av.seleccion}"
          alt="${av.nombre}"
          loading="lazy"
          onerror="this.style.opacity='0.3'"
        />
        <div class="avatar-card-overlay">
          <span class="avatar-card-name">${av.nombre}</span>
          ${isTaken ? `<span class="avatar-taken-label">Ocupado</span>` : ''}
        </div>
        <span class="avatar-card-check" aria-hidden="true">✓</span>
      </button>
    `;
  }).join('');

  // Eventos de click en los avatares
  gallery.querySelectorAll('.avatar-card:not([disabled])').forEach(card => {
    card.addEventListener('click', () => {
      const avatarId = card.dataset.avatarId;
      if (avatarId === state.miJugador?.avatarId) return; // Ya seleccionado
      seleccionarAvatar(avatarId);
    });
  });
}

// ─── Toast (notificaciones) ────────────────────────────────────────────────────

/**
 * Muestra una notificación emergente (toast) durante unos segundos.
 * @param {string} mensaje
 * @param {'info'|'error'|'success'} tipo
 * @param {number} duracionMs
 */
function toast(mensaje, tipo = 'info', duracionMs = 3500) {
  const container = $('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.textContent = mensaje;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duracionMs);
}

// ─── Modales ───────────────────────────────────────────────────────────────────

function abrirModal(id) {
  const m = $(id);
  if (m) {
    m.classList.add('open');
    // Foco al primer botón del modal para accesibilidad
    requestAnimationFrame(() => m.querySelector('button')?.focus());
  }
}

function cerrarModal(id) {
  const m = $(id);
  if (m) m.classList.remove('open');
}

// ─── Conexión Socket.io ────────────────────────────────────────────────────────

/**
 * Crea la conexión de Socket.io con la contraseña en el handshake.
 * La contraseña NUNCA se valida en el cliente — solo se envía al servidor.
 * @param {string} password
 * @returns {Promise<import('socket.io-client').Socket>}
 */
function conectarSocket(password) {
  return new Promise((resolve, reject) => {
    // Si ya hay un socket conectado con la misma contraseña, reutilizarlo
    if (state.socket?.connected && state.password === password) {
      resolve(state.socket);
      return;
    }

    // Desconectar socket anterior si existe
    state.socket?.disconnect();

    const socket = io(window.location.origin, {
      auth:        { password },
      autoConnect: true,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
    });

    // ── Conexión exitosa ───────────────────────────────────────────────────
    socket.once('connect', () => {
      console.log('[Socket] Conectado con ID:', socket.id);
      state.socket   = socket;
      state.password = password;

      // Guardar contraseña para reconexión automática al refrescar
      localStorage.setItem(LS_PASSWORD, password);

      // Registrar handlers de eventos del juego DESPUÉS de conectar
      registrarEventosSocket(socket);

      resolve(socket);
    });

    // ── Error de conexión (contraseña incorrecta, límite de intentos…) ────
    socket.once('connect_error', (err) => {
      socket.disconnect();
      reject(err);
    });
  });
}

// ─── Handlers de eventos Socket.io ────────────────────────────────────────────

/**
 * Registra todos los handlers de eventos del servidor.
 * Se llama una sola vez tras conectar exitosamente.
 * @param {import('socket.io-client').Socket} socket
 */
function registrarEventosSocket(socket) {

  // ── Estado de sala actualizado (evento principal de sincronización) ─────
  socket.on('room:state', (estado) => {
    actualizarVistaConEstado(estado);
  });

  // ── Sala creada ─────────────────────────────────────────────────────────
  socket.on('room:created', (data) => {
    guardarSesion(data);
    if (data.role === 'pantalla') {
      irAVistaPantalla(data.roomCode);
    } else {
      irAVistaJugador(data);
    }
  });

  // ── Sala unida (join fresco) ────────────────────────────────────────────
  socket.on('room:joined', (data) => {
    guardarSesion(data);
    if (data.role === 'pantalla') {
      irAVistaPantalla(data.roomCode);
    } else {
      irAVistaJugador(data);
    }
  });

  // ── Reconexión exitosa a sala ───────────────────────────────────────────
  socket.on('room:rejoined', (data) => {
    console.log('[Reconexión] Sesión restaurada para jugador', data.playerId);
    guardarSesion({ ...data, role: 'jugador' });
    irAVistaJugador(data, true /* reconexion */);
  });

  // ── Pantalla reconectada ────────────────────────────────────────────────
  socket.on('screen:reconnected', (data) => {
    guardarSesion({ roomCode: data.roomCode, role: 'pantalla', playerId: null });
    irAVistaPantalla(data.roomCode);
  });

  socket.on('room:screen_reconnected', () => {
    $('player-screen-disconnected')?.classList.add('hidden');
    $('screen-disconnected-banner')?.classList.add('hidden');
    toast('¡La Pantalla volvió a conectarse!', 'success');
  });

  // ── Pantalla desconectada ───────────────────────────────────────────────
  socket.on('room:screen_disconnected', () => {
    $('player-screen-disconnected')?.classList.remove('hidden');
    toast('⚠️ La Pantalla se ha desconectado. Espera a que vuelva.', 'error', 5000);
  });

  // ── Jugador desconectado ────────────────────────────────────────────────
  socket.on('room:player_disconnected', ({ nombre }) => {
    toast(`${nombre || 'Un jugador'} se ha desconectado`, 'info');
  });

  // ── Jugador reconectado ─────────────────────────────────────────────────
  socket.on('room:player_reconnected', ({ nombre }) => {
    toast(`${nombre || 'Un jugador'} volvió a conectarse`, 'success');
  });

  // ── Avatar rechazado (ya ocupado) ───────────────────────────────────────
  socket.on('avatar:error', ({ mensaje }) => {
    const errEl = $('avatar-error');
    if (errEl) {
      errEl.textContent = mensaje;
      setTimeout(() => { errEl.textContent = ''; }, 3500);
    }
    toast(mensaje, 'error');
  });

  // ── Partida iniciada → navegar al tablero ──────────────────────────────
  socket.on('game:started', async (data) => {
    console.log('[Juego] Iniciado:', data);
    toast('¡La partida ha comenzado!', 'success');
    await navegarAlTablero(data);
  });

  // ── Inicialización del tablero (grafo y jugadores) ──────────────────────
  socket.on('board:init', async (estadoTablero) => {
    console.log('[Tablero] board:init recibido');
    if (state.role === 'pantalla') {
      await inicializarTablero3D(estadoTablero);
    }
  });

  // ── Inicio de turno ─────────────────────────────────────────────────────
  socket.on('turn:start', (data) => {
    const { playerId, nombre, tiempoLimiteMs } = data;
    const esMiTurno = (state.role === 'jugador' && playerId === state.playerId);
    state.turnoActivo = esMiTurno;

    if (state.role === 'pantalla') {
      mostrarAnuncio(`🎲 ¡Turno de ${nombre}!`, 'Tira el dado para avanzar', 0);
      actualizarMarcadorTablero(data.tablero?.jugadores);
      if (state.boardInstance) state.boardInstance.activePlayerId = playerId;
    }

    if (state.role === 'jugador') {
      if (esMiTurno) {
        mostrarPanelControlador('active');
        iniciarCuentaAtrasControlador(tiempoLimiteMs);
      } else {
        mostrarPanelControlador('waiting');
        const t = $('waiting-turn-title');
        const d = $('waiting-turn-desc');
        if (t) t.textContent = `Turno de ${nombre}`;
        if (d) d.textContent = 'Esperando a que tire el dado…';
      }
    }
  });

  // ── Dado tirado ─────────────────────────────────────────────────────────
  socket.on('dice:rolled', (data) => {
    const { playerId, valor, tiempoAnimacionMs } = data;
    const nombre = obtenerNombreJugador(playerId);

    if (state.role === 'pantalla') {
      if (state.boardInstance) state.boardInstance.animateDice(valor);
      mostrarAnuncio(`🎲 ${nombre} sacó un ${valor}`, 'Moviendo…', tiempoAnimacionMs);
    }

    if (state.role === 'jugador') {
      detenerCuentaAtrasControlador();
      const esYo = playerId === state.playerId;
      agregarEventoControlador(`${esYo ? '¡Tú sacaste' : nombre + ' sacó'} un ${valor}! 🎲`);
      mostrarPanelControlador('waiting');
    }
  });

  // ── Peón avanza un paso ─────────────────────────────────────────────────
  socket.on('player:step', (data) => {
    const { playerId, casillaActual } = data;
    if (state.role === 'pantalla' && state.boardInstance) {
      state.boardInstance.animatePlayerStep(playerId, casillaActual);
    }
  });

  // ── Peón aterriza en casilla final del turno ────────────────────────────
  socket.on('player:landed', (data) => {
    const { playerId, casillaActual, efectoCasilla, tablero } = data;
    const nombre = obtenerNombreJugador(playerId);
    const jugadorAterrizado = tablero?.jugadores?.find(j => j.playerId === playerId);

    if (state.role === 'pantalla') {
      if (state.boardInstance) state.boardInstance.animatePlayerStep(playerId, casillaActual);

      // Si ha conseguido un Sol de Badajoz, lanzar celebración especial
      if (efectoCasilla?.deltaSoles > 0 && jugadorAterrizado) {
        mostrarCelebracionSol(jugadorAterrizado, efectoCasilla.deltaSoles);
      } else {
        mostrarAnuncio(
          `${iconoEfecto(efectoCasilla)} Casilla ${casillaActual.tipo}`,
          obtenerDescripcionEfecto(efectoCasilla),
          2800
        );
      }
      actualizarMarcadorTablero(tablero?.jugadores);
    }

    if (state.role === 'jugador') {
      const esYo = playerId === state.playerId;
      agregarEventoControlador(
        `${esYo ? '¡Caíste' : nombre + ' cayó'} en casilla ${casillaActual.tipo} ${iconoEfecto(efectoCasilla)}`
      );
      if (efectoCasilla?.deltaSoles > 0) {
        if (esYo) {
          toast('☀️ ¡CONSEGUISTE UN SOL DE BADAJOZ! ☀️', 'success');
        } else {
          toast(`☀️ ¡${nombre} consiguió un Sol de Badajoz!`, 'info');
        }
      }
      if (esYo && tablero) {
        const miDato = tablero.jugadores?.find(j => j.playerId === state.playerId);
        if (miDato) actualizarStatsControlador(miDato);
      }
    }
  });

  // ── Bifurcación: elegir camino ──────────────────────────────────────────
  socket.on('branch:choice_request', (data) => {
    const { playerId, opciones } = data;
    const esMiTurno = (state.role === 'jugador' && playerId === state.playerId);

    if (state.role === 'pantalla') {
      mostrarAnuncio('🔀 ¡Bifurcación!', 'El jugador elige por dónde continuar…', 0);
    }

    if (esMiTurno) {
      mostrarPanelControlador('branch');
      renderizarOpcionesBifurcacion(opciones);
    }
  });

  // ── Ronda completada ────────────────────────────────────────────────────
  socket.on('round:ended', (data) => {
    const { rondaCompletada, siguienteRonda, tablero } = data;
    if (state.role === 'pantalla') {
      const total = tablero?.rondasTotales || 10;
      mostrarAnuncio(
        `🏁 ¡Ronda ${rondaCompletada} completada!`,
        `Comienza la ronda ${siguienteRonda}…`,
        2500
      );
      actualizarMarcadorTablero(tablero?.jugadores);
      const ctr = $('board-round-counter');
      if (ctr) ctr.textContent = `${siguienteRonda} / ${total}`;
    }
    if (state.role === 'jugador') {
      agregarEventoControlador(`🏁 Ronda ${rondaCompletada} terminada – comienza la ${siguienteRonda}`);
    }
  });

  // ── Partida terminada ───────────────────────────────────────────────────
  socket.on('game:ended', (data) => {
    const { clasificacion } = data;
    if (state.role === 'pantalla') {
      mostrarClasificacionFinal(clasificacion);
    }
    if (state.role === 'jugador') {
      const miPuesto = clasificacion.findIndex(j => j.playerId === state.playerId) + 1;
      agregarEventoControlador(`🏆 ¡Partida terminada! Quedaste en el puesto #${miPuesto}`);
      mostrarPanelControlador('waiting');
      const t = $('waiting-turn-title');
      const d = $('waiting-turn-desc');
      if (t) t.textContent = '¡Partida terminada!';
      if (d) d.textContent = `Puesto #${miPuesto} – Mira la clasificación final`;
      mostrarClasificacionFinal(clasificacion);
    }
  });

  // ─── MINIJUEGOS EN TIEMPO REAL (FASE 4) ───────────────────────────────────

  // 1. Intro del minijuego (4 segundos con reglas y cuenta atrás)
  socket.on('minigame:intro', (data) => {
    const { minijuego, jugadores, cuentaAtrasMs } = data;
    state.minigameActive = true;
    state.minigameId = minijuego.id;

    if (state.role === 'pantalla') {
      showView('minigameScreen');

      // Inicializar escena 3D del minijuego
      if (state.minigameInstance) {
        state.minigameInstance.destroy();
      }
      const canvasEl = $('minigame-three-canvas');
      if (canvasEl) {
        state.minigameInstance = new BadajozMinigames3D(canvasEl);
        state.minigameInstance.cargarMinijuego(minijuego.id, jugadores, state.avatares);
      }

      // Configurar textos de la intro
      if ($('minigame-screen-title'))    $('minigame-screen-title').textContent    = minijuego.nombre;
      if ($('minigame-intro-title'))     $('minigame-intro-title').textContent     = minijuego.nombre;
      if ($('minigame-intro-desc'))      $('minigame-intro-desc').textContent      = minijuego.descripcion;
      if ($('minigame-intro-controls'))  $('minigame-intro-controls').textContent  = minijuego.controlesTexto;

      // Mostrar overlay de intro y ocultar resultados anteriores
      $('minigame-intro-overlay')?.classList.remove('hidden');
      $('minigame-results-overlay')?.classList.add('hidden');

      // Animación de cuenta atrás (3, 2, 1, ¡YA!)
      iniciarCuentaAtrasIntro(cuentaAtrasMs);
    }

    if (state.role === 'jugador') {
      showView('minigamePlayer');

      // Cabecera del jugador
      const avatarInfo = state.avatares.find(a => a.id === state.miJugador?.avatarId);
      const avatarImg = $('minigame-player-avatar');
      if (avatarImg && avatarInfo) avatarImg.src = avatarInfo.seleccion;
      if ($('minigame-player-name'))   $('minigame-player-name').textContent   = state.miJugador?.nombre || 'Tú';
      if ($('minigame-current-title')) $('minigame-current-title').textContent = minijuego.nombre;
      if ($('minigame-player-score'))  $('minigame-player-score').textContent  = '0';

      // Activar panel de controles correspondiente
      $('controls-carrera-guadiana')?.classList.add('hidden');
      $('controls-lluvia-bellotas')?.classList.add('hidden');
      $('controls-reaccion-luces')?.classList.add('hidden');
      $('controls-memory-monumentos')?.classList.add('hidden');
      $('controls-pulso-fuerza')?.classList.add('hidden');
      $('controls-carnaval-caramelos')?.classList.add('hidden');
      $('controls-esquivar-muralla')?.classList.add('hidden');
      $('controls-carrera-coches')?.classList.add('hidden');
      $('controls-equilibrio-puente')?.classList.add('hidden');

      if (minijuego.id === 'carrera_guadiana' || minijuego.id === 'piraguismo_guadiana') {
        $('controls-carrera-guadiana')?.classList.remove('hidden');
        if ($('minigame-score-icon')) $('minigame-score-icon').textContent = '🚣';
      } else if (minijuego.id === 'reaccion_luces') {
        $('controls-reaccion-luces')?.classList.remove('hidden');
        if ($('minigame-score-icon')) $('minigame-score-icon').textContent = '⚡';
        const pBtn = $('btn-reaccion-pulsar');
        if (pBtn) {
          pBtn.className = 'btn-touch-game btn-reaccion-pulsar btn-reaccion-espera';
          $('reaccion-btn-icon').textContent = '🔴';
          $('reaccion-btn-label').textContent = '¡ESPERA A LA LUZ!';
        }
        $('reaccion-feedback-box')?.classList.add('hidden');
      } else if (minijuego.id === 'memory_monumentos') {
        $('controls-memory-monumentos')?.classList.remove('hidden');
        if ($('minigame-score-icon')) $('minigame-score-icon').textContent = '🏛️';
        document.querySelectorAll('.btn-memory-card').forEach(b => {
          b.className = 'btn-touch-game btn-memory-card';
          b.disabled = false;
        });
      } else if (minijuego.id === 'pulso_fuerza') {
        $('controls-pulso-fuerza')?.classList.remove('hidden');
        if ($('minigame-score-icon')) $('minigame-score-icon').textContent = '💪';
      } else if (minijuego.id === 'carnaval_caramelos') {
        $('controls-carnaval-caramelos')?.classList.remove('hidden');
        if ($('minigame-score-icon')) $('minigame-score-icon').textContent = '🎭';
      } else if (minijuego.id === 'esquivar_muralla') {
        $('controls-esquivar-muralla')?.classList.remove('hidden');
        if ($('minigame-score-icon')) $('minigame-score-icon').textContent = '🏃';
      } else if (minijuego.id === 'carrera_coches') {
        $('controls-carrera-coches')?.classList.remove('hidden');
        if ($('minigame-score-icon')) $('minigame-score-icon').textContent = '🏎️';
      } else if (minijuego.id === 'equilibrio_puente') {
        $('controls-equilibrio-puente')?.classList.remove('hidden');
        if ($('minigame-score-icon')) $('minigame-score-icon').textContent = '⚖️';
      } else if (minijuego.id === 'lluvia_bellotas') {
        $('controls-lluvia-bellotas')?.classList.remove('hidden');
        if ($('minigame-score-icon')) $('minigame-score-icon').textContent = '🌰';
      }

      // Overlay de preparación
      const prepOverlay = $('minigame-player-status-overlay');
      if (prepOverlay) {
        prepOverlay.classList.remove('hidden');
        if ($('minigame-player-status-text')) $('minigame-player-status-text').textContent = '¡Prepárate!';
      }
    }
  });

  // 2. Comienza la partida del minijuego (bucle 20 Hz activo)
  socket.on('minigame:start', (data) => {
    if (state.role === 'pantalla') {
      $('minigame-intro-overlay')?.classList.add('hidden');
      iniciarTemporizadorMinijuego(data.duracionTotalMs);
    }

    if (state.role === 'jugador') {
      $('minigame-player-status-overlay')?.classList.add('hidden');
      if ('vibrate' in navigator) {
        try { navigator.vibrate(80); } catch (e) {}
      }
    }
  });

  // 3. Snapshot de estado a 20 Hz
  socket.on('minigame:state', (data) => {
    if (state.role === 'pantalla' && state.minigameInstance) {
      state.minigameInstance.actualizarEstado(data);
      const segs = Math.ceil(data.tiempoRestanteMs / 1000);
      const timerEl = $('minigame-screen-timer');
      if (timerEl) timerEl.textContent = `${segs}s`;
    }

    if (state.role === 'jugador') {
      const miDato = data.jugadores?.find(j => j.playerId === state.playerId);
      if (miDato) {
        const scoreEl = $('minigame-player-score');
        if (scoreEl) {
          if (data.minijuegoId === 'carrera_guadiana' || data.minijuegoId === 'piraguismo_guadiana') {
            scoreEl.textContent = `${Math.min(100, Math.round(miDato.posicionX))}m`;
          } else if (data.minijuegoId === 'carrera_coches') {
            scoreEl.textContent = `${Math.round(miDato.distanciaZ || 0)}m`;
          } else {
            scoreEl.textContent = `${miDato.puntos}`;
          }
        }

        // Feedback para 'reaccion_luces'
        if (data.minijuegoId === 'reaccion_luces') {
          const btnPulsar = $('btn-reaccion-pulsar');
          const fbBox     = $('reaccion-feedback-box');
          const fbText    = $('reaccion-feedback-text');

          if (btnPulsar) {
            if (miDato.falsoComienzo) {
              btnPulsar.className = 'btn-touch-game btn-reaccion-pulsar btn-reaccion-falso';
              const ico = $('reaccion-btn-icon');
              const lbl = $('reaccion-btn-label');
              if (ico) ico.textContent = '⚠️';
              if (lbl) lbl.textContent = '¡FALSO COMIENZO!';
              if (fbBox && fbText) {
                fbBox.classList.remove('hidden');
                fbText.textContent = 'Penalizado por adelantarte';
              }
            } else if (miDato.reaccionUltimaRondaMs) {
              btnPulsar.className = 'btn-touch-game btn-reaccion-pulsar';
              const ico = $('reaccion-btn-icon');
              const lbl = $('reaccion-btn-label');
              if (ico) ico.textContent = '✓';
              if (lbl) lbl.textContent = '¡REGISTRADO!';
              if (fbBox && fbText) {
                fbBox.classList.remove('hidden');
                fbText.textContent = `⚡ ${miDato.reaccionUltimaRondaMs} ms`;
              }
            } else if (data.luzVerdeActiva) {
              btnPulsar.className = 'btn-touch-game btn-reaccion-pulsar btn-reaccion-activa';
              const ico = $('reaccion-btn-icon');
              const lbl = $('reaccion-btn-label');
              if (ico) ico.textContent = '🟢';
              if (lbl) lbl.textContent = '¡¡PULSA YA!!';
            } else {
              btnPulsar.className = 'btn-touch-game btn-reaccion-pulsar btn-reaccion-espera';
              const ico = $('reaccion-btn-icon');
              const lbl = $('reaccion-btn-label');
              if (ico) ico.textContent = '🔴';
              if (lbl) lbl.textContent = '¡ESPERA A LA LUZ!';
              fbBox?.classList.add('hidden');
            }
          }
        }

        // Feedback para 'memory_monumentos'
        if (data.minijuegoId === 'memory_monumentos') {
          if (data.fase === 'REVELACION') {
            const objetivoId = data.monumentoObjetivo?.id;
            document.querySelectorAll('.btn-memory-card').forEach(b => {
              const cardId = b.dataset.monumentoId;
              b.disabled = true;
              if (cardId === objetivoId) {
                b.classList.add('card-correct');
              } else if (b.classList.contains('card-selected')) {
                b.classList.add('card-incorrect');
              }
            });
          } else {
            if (!miDato.haRespondido) {
              document.querySelectorAll('.btn-memory-card').forEach(b => {
                b.disabled = false;
                b.classList.remove('card-selected', 'card-correct', 'card-incorrect');
              });
            }
          }
        }

        // Feedback para 'pulso_fuerza'
        if (data.minijuegoId === 'pulso_fuerza') {
          const fill = $('pulso-meter-fill');
          const txt  = $('pulso-power-text');
          if (fill) fill.style.width = `${Math.min(100, Math.max(5, miDato.fuerzaActual || 10))}%`;
          if (txt)  txt.textContent  = `${Math.round(miDato.fuerzaActual || 0)}%`;
        }

        // Feedback para 'esquivar_muralla'
        if (data.minijuegoId === 'esquivar_muralla') {
          const vidasEl = $('muralla-vidas-display');
          if (vidasEl) {
            const v = miDato.vidas !== undefined ? miDato.vidas : 3;
            vidasEl.textContent = v > 0 ? '❤️'.repeat(v) : '💀';
          }
        }

        // Feedback para 'equilibrio_puente'
        if (data.minijuegoId === 'equilibrio_puente') {
          const bubble = $('inclinometer-bubble');
          if (bubble) {
            const ang = miDato.angulo || 0;
            // desplazar burbuja en el inclinómetro
            const offsetPx = Math.max(-50, Math.min(50, ang * 2.8));
            bubble.style.transform = `translateX(${offsetPx}px)`;
          }
        }
      }
    }
  });

  // 4. Resultados y podio de monedas
  socket.on('minigame:results', (data) => {
    const { clasificacion } = data;

    if (state.role === 'pantalla') {
      const resultsOverlay = $('minigame-results-overlay');
      const podiumList = $('minigame-podium-list');

      if (podiumList && Array.isArray(clasificacion)) {
        const medallas = ['🥇', '🥈', '🥉', '4️⃣'];
        podiumList.innerHTML = clasificacion.map((j, i) => {
          const avatar = state.avatares.find(a => a.id === j.avatarId);
          return `
            <div class="minigame-podium-row ${i === 0 ? 'minigame-winner-row' : ''}">
              <span class="podium-row-rank">${medallas[i] || `${i + 1}º`}</span>
              ${avatar ? `<img class="podium-row-avatar" src="${avatar.seleccion}" alt="${j.nombre}">` : ''}
              <span class="podium-row-name" style="color:${j.color}">${j.nombre}</span>
              <span class="podium-row-score">${j.puntos}</span>
              <span class="podium-row-coins">+${j.monedasGanadas} 🪙</span>
            </div>
          `;
        }).join('');
      }

      resultsOverlay?.classList.remove('hidden');
    }

    if (state.role === 'jugador') {
      const miResultado = clasificacion?.find(j => j.playerId === state.playerId);
      if (miResultado) {
        toast(`🎉 ¡Minijuego terminado! Puesto #${miResultado.puesto} (+${miResultado.monedasGanadas} monedas 🪙)`, 'success');
        const prepOverlay = $('minigame-player-status-overlay');
        if (prepOverlay) {
          prepOverlay.classList.remove('hidden');
          if ($('minigame-player-status-text')) {
            $('minigame-player-status-text').textContent = `Puesto #${miResultado.puesto} (+${miResultado.monedasGanadas}🪙)`;
          }
        }
      }
    }
  });

  // 5. Retorno al tablero tras minijuego
  socket.on('board:update', (data) => {
    state.minigameActive = false;
    if (state.role === 'pantalla') {
      if (state.minigameInstance) {
        state.minigameInstance.destroy();
        state.minigameInstance = null;
      }
      showView('boardScreen');
      actualizarMarcadorTablero(data.tablero?.jugadores);
    }
    if (state.role === 'jugador') {
      showView('boardPlayer');
      const miDato = data.tablero?.jugadores?.find(j => j.playerId === state.playerId);
      if (miDato) actualizarStatsControlador(miDato);
    }
  });

  // ── Error genérico del servidor ─────────────────────────────────────────
  socket.on('error', ({ mensaje }) => {
    toast(mensaje, 'error');
    if (mensaje && mensaje.toLowerCase().includes('sala no encontrada')) {
      limpiarSesion();
      if (state.socket?.connected) {
        showView('menu');
      } else {
        showView('password');
      }
    }
  });

  // ── Reconexión automática del socket (red caída) ────────────────────────
  socket.on('disconnect', (reason) => {
    console.warn('[Socket] Desconectado:', reason);
    toast('Conexión perdida. Reconectando…', 'error');
  });

  socket.on('reconnect', () => {
    console.log('[Socket] Reconectado');
    toast('Conexión restaurada', 'success');
    const roomCode = localStorage.getItem(LS_ROOM_CODE);
    const playerId = localStorage.getItem(LS_PLAYER_ID);
    const role     = localStorage.getItem(LS_ROLE);
    if (roomCode && role) {
      socket.emit('join_room', { roomCode, rol: role, playerId });
    }
  });
}

// ─── Persistencia de sesión ───────────────────────────────────────────────────

function guardarSesion({ roomCode, role, playerId, color, nombreColor, esAnfitrion, nombre, avatarId, listo } = {}) {
  state.roomCode    = roomCode  || state.roomCode;
  state.role        = role      || state.role;
  state.playerId    = playerId  !== undefined ? playerId : state.playerId;
  state.esAnfitrion = esAnfitrion ?? state.esAnfitrion;

  if (state.miJugador === null) state.miJugador = {};
  if (color)       state.miJugador.color       = color;
  if (nombreColor) state.miJugador.nombreColor  = nombreColor;
  if (nombre)      state.miJugador.nombre       = nombre;
  if (avatarId)    state.miJugador.avatarId     = avatarId;
  if (listo !== undefined) state.miJugador.listo = listo;

  // Persistir en localStorage para reconexión
  if (state.roomCode) localStorage.setItem(LS_ROOM_CODE, state.roomCode);
  if (state.role)     localStorage.setItem(LS_ROLE, state.role);
  if (state.playerId) localStorage.setItem(LS_PLAYER_ID, state.playerId);
}

function limpiarSesion() {
  [LS_ROOM_CODE, LS_PLAYER_ID, LS_ROLE].forEach(k => localStorage.removeItem(k));
  state.roomCode    = null;
  state.playerId    = null;
  state.role        = null;
  state.esAnfitrion = false;
  state.miJugador   = null;
}

// ─── Navegación a vistas ───────────────────────────────────────────────────────

async function irAVistaPantalla(roomCode) {
  state.roomCode = roomCode;
  $('screen-room-code').textContent = roomCode;
  $('player-room-code') && ($('player-room-code').textContent = roomCode);

  showView('lobbyScreen');
  adquirirWakeLock();

  // Cargar QR
  cargarQR(roomCode);

  // Inicializar escena Three.js (importación dinámica)
  if (!state.sceneCleanup) {
    const { initScene } = await import('./screen.js');
    state.sceneCleanup = initScene('three-canvas');
  }
}

function irAVistaJugador(data, esReconexion = false) {
  // Actualizar el badge de color
  const badge    = $('player-color-badge');
  const colorName = $('player-color-name');
  if (badge && data.color) {
    badge.style.color            = data.color;
    badge.style.borderColor      = data.color;
    badge.style.backgroundColor  = data.color + '22';
  }
  if (colorName && data.nombreColor) {
    colorName.textContent = data.nombreColor;
  }

  $('player-room-code').textContent = state.roomCode || data.roomCode || '----';

  // Si hay nombre previo (reconexión), pre-rellenar
  if (data.nombre) {
    const input = $('input-player-name');
    if (input) {
      input.value = data.nombre;
      actualizarContadorNombre(data.nombre);
    }
  }

  showView('lobbyPlayer');
  adquirirWakeLock();

  // Renderizar galería (vacía al principio, se actualizará con room:state)
  renderizarGaleria([]);

  // Mostrar botón "Empezar" solo si es anfitrión
  const btnStart = $('btn-start-game');
  if (btnStart) {
    if (data.esAnfitrion || state.esAnfitrion) {
      btnStart.classList.remove('hidden');
    } else {
      btnStart.classList.add('hidden');
    }
  }

  if (esReconexion) toast('Sesión recuperada correctamente', 'success');
}

// ─── Tablero: Navegación y arranque ──────────────────────────────────────────

/**
 * Navega a la vista de tablero según el rol.
 * Llamado cuando el servidor emite 'game:started'.
 * @param {object} data - Payload de game:started
 */
async function navegarAlTablero(data) {
  // Limpiar escena del lobby si existía
  if (state.sceneCleanup) {
    state.sceneCleanup();
    state.sceneCleanup = null;
  }

  // Rellenar la caché de nombres de jugadores para toda la partida
  state.jugadoresTablero.clear();
  if (Array.isArray(data.jugadores)) {
    data.jugadores.forEach(j => state.jugadoresTablero.set(j.playerId, j));
  }

  if (state.role === 'pantalla') {
    const roomCode = state.roomCode;
    const codeEl   = $('board-screen-room-code');
    if (codeEl) codeEl.textContent = `Sala: ${roomCode}`;
    showView('boardScreen');
    // El board:init llegará inmediatamente después y cargará la escena 3D
  }

  if (state.role === 'jugador') {
    showView('boardPlayer');
    // Poblar la cabecera del controlador con los datos del jugador
    const yo = data.jugadores?.find(j => j.playerId === state.playerId);
    if (yo) {
      const avatarObj = state.avatares.find(a => a.id === yo.avatarId);
      const avatarImg = $('controller-avatar-img');
      const nameEl    = $('controller-player-name');
      const colorEl   = $('controller-color-tag');
      if (avatarImg && avatarObj) avatarImg.src = avatarObj.seleccion;
      if (nameEl)  nameEl.textContent  = yo.nombre || 'Jugador';
      if (colorEl) {
        colorEl.textContent      = yo.nombreColor || '';
        colorEl.style.background = yo.color + '33';
        colorEl.style.color      = yo.color;
      }
    }
    mostrarPanelControlador('waiting');
  }
}


/**
 * Inicializa la escena Three.js del tablero en la Pantalla.
 * Llamado cuando llega 'board:init' del servidor.
 * @param {object} estadoTablero - Payload con grafoCasillas y jugadores
 */
async function inicializarTablero3D(estadoTablero) {
  const canvas = $('board-three-canvas');
  if (!canvas) {
    console.warn('[Board3D] Canvas board-three-canvas no encontrado');
    return;
  }

  // Destruir instancia anterior si existe
  if (state.boardInstance) {
    state.boardInstance.dispose();
    state.boardInstance = null;
  }

  const { BadajozBoard3D } = await import('./board.js');
  const board = new BadajozBoard3D(canvas);
  board.init(estadoTablero.grafoCasillas, estadoTablero.jugadores || []);
  state.boardInstance = board;

  // Inicializar el marcador inferior con el estado inicial
  actualizarMarcadorTablero(estadoTablero.jugadores);

  console.log('[Board3D] Escena inicializada con', estadoTablero.grafoCasillas?.length, 'casillas');
}

// ─── Tablero: HUD Pantalla ────────────────────────────────────────────────────

/**
 * Muestra el banner de anuncio central en la pantalla de tablero.
 * @param {string} titulo
 * @param {string} descripcion
 * @param {number} duranteMs - 0 = permanente hasta el siguiente anuncio
 */
let _anuncioTimeout = null;
function mostrarAnuncio(titulo, descripcion, duranteMs = 3000) {
  const banner  = $('board-announcement-banner');
  const titleEl = $('announcement-title');
  const descEl  = $('announcement-desc');

  if (!banner) return;

  if (titleEl) titleEl.textContent = titulo;
  if (descEl)  descEl.textContent  = descripcion;
  banner.classList.remove('hidden');

  clearTimeout(_anuncioTimeout);
  if (duranteMs > 0) {
    _anuncioTimeout = setTimeout(() => banner.classList.add('hidden'), duranteMs);
  }
}

/**
 * Actualiza el marcador inferior de la Pantalla con las puntuaciones actuales.
 * @param {Array} jugadores - Array de objetos jugador con monedas, soles, etc.
 */
function actualizarMarcadorTablero(jugadores) {
  const marcador = $('board-scoreboard');
  if (!marcador || !Array.isArray(jugadores)) return;

  const maxSoles = Math.max(...jugadores.map(j => j.soles || 0));

  marcador.innerHTML = jugadores.map(j => {
    const avatar = state.avatares.find(a => a.id === j.avatarId);
    const esLider = (j.soles || 0) > 0 && (j.soles || 0) === maxSoles;
    return `
      <div class="scoreboard-card ${esLider ? 'scoreboard-leader' : ''}" style="border-color:${j.color}88">
        <div class="scoreboard-avatar-wrap">
          ${avatar
            ? `<img class="scoreboard-avatar" src="${avatar.seleccion}" alt="${j.nombre}" style="border-color:${j.color}">`
            : `<div class="scoreboard-avatar" style="background:${j.color}44;border-color:${j.color}"></div>`
          }
          ${esLider ? '<span class="scoreboard-crown" title="¡Líder en Soles!">👑</span>' : ''}
        </div>
        <div class="scoreboard-info">
          <span class="scoreboard-name" style="color:${j.color}">${j.nombre || '—'}</span>
          <span class="scoreboard-stats">
            <span class="stat-sol-badge">☀️ ${j.soles ?? 0}</span>
            <span class="stat-coin-badge">🪙 ${j.monedas ?? 0}</span>
          </span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Muestra el overlay animado de celebración cuando un jugador consigue un Sol de Badajoz.
 * @param {object} jugador - Datos del jugador
 * @param {number} deltaSoles - Cantidad de soles conseguidos
 */
function mostrarCelebracionSol(jugador, deltaSoles = 1) {
  const overlay = $('board-sol-overlay');
  if (!overlay || !jugador) return;

  const avatar = state.avatares.find(a => a.id === jugador.avatarId);
  const avatarImg = $('sol-avatar-img');
  const nameEl    = $('sol-player-name');
  const descEl    = $('sol-celebration-desc');

  if (avatarImg) {
    avatarImg.src = avatar ? avatar.seleccion : '';
    avatarImg.style.borderColor = jugador.color || '#f5a623';
  }
  if (nameEl) {
    nameEl.textContent = jugador.nombre || 'Jugador';
    nameEl.style.color = jugador.color || '#f5a623';
  }
  if (descEl) {
    descEl.textContent = deltaSoles > 1
      ? `¡Ha conseguido ${deltaSoles} Soles de Badajoz!`
      : '¡Ha conseguido un Sol de Badajoz!';
  }

  overlay.classList.remove('hidden');
  overlay.classList.add('sol-celebrating');

  if ('vibrate' in navigator) {
    try { navigator.vibrate([100, 50, 100, 50, 200]); } catch (e) {}
  }

  setTimeout(() => {
    overlay.classList.remove('sol-celebrating');
    overlay.classList.add('hidden');
  }, 3800);
}

/**
 * Muestra la pantalla de clasificación final y podio.
 * @param {Array} clasificacion - Ordenada por posición
 */
function mostrarClasificacionFinal(clasificacion) {
  const modal  = $('modal-game-over');
  const podium = $('podium-container');

  if (podium && Array.isArray(clasificacion)) {
    const medallas = ['🥇', '🥈', '🥉', '4️⃣'];
    const puestosTexto = ['1.º Puesto', '2.º Puesto', '3.º Puesto', '4.º Puesto'];

    podium.innerHTML = clasificacion.map((j, i) => {
      const avatar = state.avatares.find(a => a.id === j.avatarId);
      const esGanador = i === 0;
      return `
        <div class="podium-card ${esGanador ? 'podium-winner' : ''}" style="--player-col:${j.color}">
          <div class="podium-rank-badge">${medallas[i] || `${i + 1}º`}</div>
          <div class="podium-avatar-wrap">
            ${avatar
              ? `<img class="podium-avatar" src="${avatar.seleccion}" alt="${j.nombre}">`
              : `<div class="podium-avatar-placeholder" style="background:${j.color}"></div>`
            }
            ${esGanador ? '<div class="podium-crown">👑</div>' : ''}
          </div>
          <div class="podium-player-name" style="color:${j.color}">${j.nombre}</div>
          <div class="podium-stats-row">
            <span class="podium-stat-pill">☀️ ${j.soles} ${j.soles === 1 ? 'Sol' : 'Soles'}</span>
            <span class="podium-stat-pill">🪙 ${j.monedas} Monedas</span>
          </div>
          <div class="podium-rank-label">${puestosTexto[i] || ''}</div>
        </div>
      `;
    }).join('');
  }

  if (modal) {
    modal.classList.add('active');
  }

  // Respaldo en banner de anuncio
  const banner  = $('board-announcement-banner');
  const titleEl = $('announcement-title');
  const descEl  = $('announcement-desc');
  if (banner && titleEl && descEl && Array.isArray(clasificacion)) {
    const ganador = clasificacion[0];
    titleEl.textContent = `🏆 ¡${ganador ? ganador.nombre : 'Partida'} es el Ganador!`;
    descEl.textContent  = '¡Comprueba el podio final de Badajoz Party!';
    banner.classList.remove('hidden');
  }
}

// ─── Controlador Móvil (vista jugador en partida) ─────────────────────────────

/**
 * Muestra el panel correcto del controlador según el estado.
 * @param {'active'|'waiting'|'branch'} panel
 */
function mostrarPanelControlador(panel) {
  $('controller-turn-active')?.classList.add('hidden');
  $('controller-branch-active')?.classList.add('hidden');
  $('controller-turn-waiting')?.classList.remove('hidden');

  if (panel === 'active') {
    $('controller-turn-active')?.classList.remove('hidden');
    $('controller-turn-waiting')?.classList.add('hidden');
  } else if (panel === 'branch') {
    $('controller-branch-active')?.classList.remove('hidden');
    $('controller-turn-waiting')?.classList.add('hidden');
  }
}

/**
 * Inicia el contador visual de tiempo de turno en el botón del dado.
 * @param {number} tiempoMs
 */
function iniciarCuentaAtrasControlador(tiempoMs) {
  detenerCuentaAtrasControlador();
  const badge  = $('controller-timer-badge');
  if (!badge) return;

  const fin    = Date.now() + tiempoMs;
  badge.textContent = `${Math.ceil(tiempoMs / 1000)}s`;

  state.timerInterval = setInterval(() => {
    const restante = fin - Date.now();
    if (restante <= 0) {
      badge.textContent = '0s';
      detenerCuentaAtrasControlador();
    } else {
      badge.textContent = `${Math.ceil(restante / 1000)}s`;
    }
  }, 500);
}

/** Detiene el contador visual del controlador. */
function detenerCuentaAtrasControlador() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

/**
 * Añade un texto al feed de eventos del controlador.
 * @param {string} texto
 */
function agregarEventoControlador(texto) {
  const el = $('controller-event-text');
  if (el) el.textContent = texto;
}

/**
 * Actualiza las estadísticas del jugador en la cabecera del controlador.
 * @param {object} jugador - { monedas, soles }
 */
function actualizarStatsControlador(jugador) {
  const coinsEl = $('controller-coins');
  const solesEl = $('controller-soles');
  if (coinsEl) coinsEl.textContent = jugador.monedas ?? 0;
  if (solesEl) solesEl.textContent = jugador.soles   ?? 0;
}

/**
 * Renderiza los botones de elección en una bifurcación.
 * @param {Array} opciones - Array de { casillaId, etiqueta }
 */
function renderizarOpcionesBifurcacion(opciones) {
  const container = $('controller-branch-buttons');
  if (!container) return;

  container.innerHTML = (opciones || []).map((op, i) => `
    <button
      class="btn btn-role btn-role-primary branch-btn"
      data-casilla-id="${op.casillaId}"
      id="branch-btn-${i}"
    >
      <span class="btn-role-icon">🔀</span>
      <span class="btn-role-text">
        <strong>${op.etiqueta || `Camino ${i + 1}`}</strong>
        <small>Casilla #${op.casillaId}</small>
      </span>
    </button>
  `).join('');

  container.querySelectorAll('.branch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const casillaElegidaId = parseInt(btn.dataset.casillaId, 10);
      state.socket?.emit('branch:choice_submit', {
        roomCode:         state.roomCode,
        playerId:         state.playerId,
        casillaElegidaId,
      });
      mostrarPanelControlador('waiting');
      agregarEventoControlador('Camino elegido. Avanzando…');
    });
  });
}

// ─── Helpers de tablero ───────────────────────────────────────────────────────

/**
 * Devuelve el nombre del jugador por playerId consultando room:state en caché.
 * Si no se encuentra, devuelve 'Jugador'.
 * @param {string} playerId
 * @returns {string}
 */
function obtenerNombreJugador(playerId) {
  // Primero buscamos en la caché del tablero (se rellena al iniciar la partida)
  const cached = state.jugadoresTablero.get(playerId);
  if (cached?.nombre) return cached.nombre;
  // Fallback: el propio jugador
  if (state.playerId === playerId && state.miJugador?.nombre) {
    return state.miJugador.nombre;
  }
  return 'Jugador';
}

/**
 * Devuelve el icono emoji según el tipo de efecto de casilla.
 * @param {object|null} efecto
 * @returns {string}
 */
function iconoEfecto(efecto) {
  if (!efecto) return '⬛';
  const iconos = {
    inicio:       '🌟',
    azul:         '🔵',
    roja:         '🔴',
    evento:       '🟢',
    minijuego:    '🎮',
    bifurcacion:  '🔀',
    sol:          '☀️',
    sorpresa:     '❓',
  };
  return iconos[efecto.tipo] || '⬛';
}

/**
 * Devuelve una descripción legible del efecto de casilla.
 * @param {object|null} efecto
 * @returns {string}
 */
function obtenerDescripcionEfecto(efecto) {
  if (!efecto) return '';
  const descripciones = {
    azul:      `+${efecto.valor || 3} monedas 🪙`,
    roja:      `-${efecto.valor || 3} monedas 🪙`,
    sol:       '¡Ganas un Sol de Badajoz! ☀️',
    evento:    'Evento especial de Badajoz 🏛️',
    minijuego: '¡Minijuego! Que gane el mejor 🎮',
    inicio:    'Casilla de inicio – +10 monedas 🪙',
    sorpresa:  'Casilla sorpresa ❓',
  };
  return descripciones[efecto.tipo] || efecto.descripcion || '';
}



/**
 * Actualiza todas las partes de la UI con el estado recibido del servidor.
 * Esta es la función central de sincronización cliente ↔ servidor.
 * @param {object} estado - Payload del evento room:state
 */
function actualizarVistaConEstado(estado) {
  const { jugadores, tienePantalla, puedeEmpezar: puedeIniciar } = estado;

  // ── Actualizar datos propios ────────────────────────────────────────────
  if (state.playerId && state.miJugador !== null) {
    const yo = jugadores.find(j => j.playerId === state.playerId);
    if (yo) {
      state.miJugador = { ...state.miJugador, ...yo };
      state.esAnfitrion = yo.esAnfitrion;

      // Si nos convirtieron en anfitrión (por transferencia)
      const btnStart = $('btn-start-game');
      if (btnStart) {
        btnStart.classList.toggle('hidden', !yo.esAnfitrion);
      }
    }
  }

  // ── Vista Pantalla: lista de jugadores ─────────────────────────────────
  if (state.role === 'pantalla') {
    actualizarListaJugadoresPantalla(jugadores);

    // Estado del texto de inicio
    const statusEl = $('screen-status-text');
    if (statusEl) {
      if (puedeIniciar) {
        statusEl.textContent = '✅ El anfitrión puede iniciar la partida';
        statusEl.style.color = 'var(--success)';
      } else {
        const listos = jugadores.filter(j => j.listo).length;
        statusEl.textContent = `${listos}/${jugadores.length} listo(s) · Esperando más jugadores…`;
        statusEl.style.color = '';
      }
    }
  }

  // ── Vista Jugador: galería + estado de otros ───────────────────────────
  if (state.role === 'jugador') {
    // Avatares ocupados por OTROS jugadores
    const ocupados = jugadores
      .filter(j => j.avatarId && j.playerId !== state.playerId)
      .map(j => j.avatarId);
    renderizarGaleria(ocupados);

    // Actualizar lista de otros jugadores
    actualizarOtrosJugadores(jugadores);

    // Botón "Empezar" (solo anfitrión)
    const btnStart = $('btn-start-game');
    if (btnStart && state.esAnfitrion) {
      btnStart.disabled = !puedeIniciar;
    }

    // Estado del botón "Listo"
    const btnReady = $('btn-player-ready');
    const yo = jugadores.find(j => j.playerId === state.playerId);
    if (btnReady && yo) {
      if (yo.listo) {
        btnReady.textContent = '✔ ¡Listo!';
        btnReady.classList.add('btn-secondary');
        btnReady.classList.remove('btn-primary');
        $('player-waiting-text')?.classList.remove('hidden');
      } else {
        btnReady.textContent = '✔ Listo';
        btnReady.classList.remove('btn-secondary');
        btnReady.classList.add('btn-primary');
        $('player-waiting-text')?.classList.add('hidden');
      }
      // Habilitar solo si tiene nombre y avatar
      btnReady.disabled = !(yo.nombre && yo.avatarId);
    }
  }
}

/**
 * Renderiza la lista de jugadores en la vista de Pantalla.
 */
function actualizarListaJugadoresPantalla(jugadores) {
  const lista = $('screen-players-list');
  if (!lista) return;

  if (jugadores.length === 0) {
    lista.innerHTML = '<li class="player-slot empty">Esperando jugadores…</li>';
    return;
  }

  lista.innerHTML = jugadores.map(j => {
    const avatar = state.avatares.find(a => a.id === j.avatarId);
    const listoBadge = j.listo ? '✅' : (j.conectado ? '⌛' : '❌');

    return `
      <li class="player-slot" style="border-color: ${j.color}22">
        ${avatar
          ? `<img class="player-slot-avatar" src="${avatar.seleccion}" alt="${j.nombre || 'Jugador'}" style="border-color:${j.color}" onerror="this.style.display='none'" />`
          : `<div class="player-slot-avatar" style="background:${j.color}33;border-color:${j.color}"></div>`
        }
        <div class="player-slot-info">
          <div class="player-slot-name" style="color:${j.color}">
            ${j.nombre || '<em style="opacity:0.5">Sin nombre</em>'}
            ${j.esAnfitrion ? ' 👑' : ''}
          </div>
          <div class="player-slot-color">${j.nombreColor}${!j.conectado ? ' · Desconectado' : ''}</div>
        </div>
        <span class="player-slot-status" title="${j.listo ? 'Listo' : 'No listo'}">${listoBadge}</span>
      </li>
    `;
  }).join('');
}

/**
 * Renderiza la lista de "otros jugadores" en la vista del jugador.
 */
function actualizarOtrosJugadores(jugadores) {
  const lista = $('player-others-list');
  if (!lista) return;

  const otros = jugadores.filter(j => j.playerId !== state.playerId);

  if (otros.length === 0) {
    lista.innerHTML = '<li style="color:var(--text-faint);font-size:0.85rem">Nadie más por ahora…</li>';
    return;
  }

  lista.innerHTML = otros.map(j => `
    <li class="other-player-item">
      <div class="other-player-dot" style="background:${j.color}"></div>
      <span class="other-player-name">
        ${j.nombre || '<em style="opacity:0.5">Sin nombre</em>'}
        ${j.esAnfitrion ? ' 👑' : ''}
      </span>
      <span class="other-player-status">
        ${j.listo ? '✅' : (j.conectado ? '⌛' : '❌ DC')}
      </span>
    </li>
  `).join('');
}

// ─── Acciones del jugador ──────────────────────────────────────────────────────

function seleccionarAvatar(avatarId) {
  if (!state.socket || !state.playerId) return;
  state.socket.emit('player:select_avatar', {
    roomCode: state.roomCode,
    playerId: state.playerId,
    avatarId,
  });
  // Optimistic update para que la UI responda inmediatamente
  if (state.miJugador) state.miJugador.avatarId = avatarId;
}

function enviarNombre(nombre) {
  if (!state.socket || !state.playerId || !nombre.trim()) return;
  state.socket.emit('player:set_name', {
    roomCode: state.roomCode,
    playerId: state.playerId,
    nombre:   nombre.trim(),
  });
  if (state.miJugador) state.miJugador.nombre = nombre.trim();
}

function marcarListo(listo) {
  if (!state.socket || !state.playerId) return;
  state.socket.emit('player:ready', {
    roomCode: state.roomCode,
    playerId: state.playerId,
    listo,
  });
}

function iniciarPartida() {
  if (!state.socket || !state.playerId) return;
  state.socket.emit('game:start', {
    roomCode: state.roomCode,
    playerId: state.playerId,
  });
}

// ─── Carga del QR ─────────────────────────────────────────────────────────────

async function cargarQR(roomCode) {
  const img     = $('screen-qr-img');
  const loading = $('screen-qr-loading');
  const urlEl   = $('screen-qr-url');

  if (!img || !loading) return;

  try {
    loading.classList.remove('hidden');
    img.classList.add('hidden');

    const res  = await fetch(`/qr/${roomCode}`);
    const data = await res.json();

    if (data.qr) {
      img.src = data.qr;
      img.onload = () => {
        loading.classList.add('hidden');
        img.classList.remove('hidden');
      };
      if (urlEl) urlEl.textContent = data.url || '';
    }
  } catch (err) {
    loading.innerHTML = '<span style="color:var(--error)">Error al generar QR</span>';
    console.error('[QR]', err);
  }
}

// ─── Contador de caracteres de nombre ─────────────────────────────────────────

function actualizarContadorNombre(valor) {
  const count = $('name-char-count');
  if (count) count.textContent = `${valor.length}/12`;
}

// ─── Inicialización y bind de eventos de UI ──────────────────────────────────

async function init() {
  // ── Leer URL para código de sala pre-rellenado ─────────────────────────
  const params = new URLSearchParams(window.location.search);
  state.joinRoomCode = params.get('room')?.toUpperCase().trim() || null;

  // ── Cargar avatares en background ──────────────────────────────────────
  await cargarAvatares();

  // ── Intentar sesión guardada ───────────────────────────────────────────
  const savedPassword = localStorage.getItem(LS_PASSWORD);
  const savedRoom     = localStorage.getItem(LS_ROOM_CODE);
  const savedPlayerId = localStorage.getItem(LS_PLAYER_ID);
  const savedRole     = localStorage.getItem(LS_ROLE);

  if (savedPassword && savedRoom && savedRole) {
    // Intentar reconexión silenciosa
    try {
      await conectarSocket(savedPassword);
      state.roomCode = savedRoom;
      state.playerId = savedPlayerId;
      state.role     = savedRole;

      if (savedRole === 'pantalla') {
        state.socket.emit('join_room', { roomCode: savedRoom, rol: 'pantalla' });
      } else {
        state.socket.emit('join_room', {
          roomCode: savedRoom,
          rol:      'jugador',
          playerId: savedPlayerId,
        });
      }
      // La vista se actualiza cuando el servidor responda con room:joined / room:rejoined
      return; // No mostrar pantalla de contraseña
    } catch (err) {
      // Sesión caducada o contraseña cambiada → mostrar pantalla de acceso
      limpiarSesion();
      localStorage.removeItem(LS_PASSWORD);
    }
  }

  // ── Mostrar pantalla de contraseña ────────────────────────────────────
  showView('password');
  setTimeout(() => $('input-password')?.focus(), 100);

  // ── Si llegamos con ?room= en la URL, auto-abrir el modal de join tras login ──
  // (lo gestionamos en el evento de login exitoso)

  // ═══════════════════════════════════════════════════════════════════════
  // EVENTOS DE UI
  // ═══════════════════════════════════════════════════════════════════════

  // ── Formulario de contraseña ───────────────────────────────────────────
  $('form-password')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password  = $('input-password').value;
    const errorEl   = $('password-error');
    const submitBtn = $('btn-password-submit');
    const spinner   = submitBtn?.querySelector('.btn-spinner');
    const btnText   = submitBtn?.querySelector('.btn-text');

    if (!password) return;

    // UI de carga
    errorEl.textContent = '';
    submitBtn.disabled  = true;
    spinner?.classList.remove('hidden');
    btnText?.classList.add('hidden');

    try {
      await conectarSocket(password);

      // Éxito: ir al menú
      showView('menu');

      // Si la URL tenía ?room=, abrir directamente el modal de unirse
      if (state.joinRoomCode) {
        $('input-room-code').value = state.joinRoomCode;
        abrirModal('modal-join');
      }
    } catch (err) {
      const msg = err.message || '';
      if (msg.startsWith('CONTRASENA_INCORRECTA:')) {
        const restantes = msg.split(':')[1];
        errorEl.textContent = `Contraseña incorrecta. Intentos restantes: ${restantes}`;
      } else if (msg === 'DEMASIADOS_INTENTOS') {
        errorEl.textContent = 'Demasiados intentos incorrectos. Recarga la página para intentarlo de nuevo.';
        submitBtn.disabled = true;
        return; // Dejar botón deshabilitado
      } else {
        errorEl.textContent = 'Error de conexión. Comprueba tu internet e inténtalo de nuevo.';
      }
    } finally {
      if (submitBtn.style.pointerEvents !== 'none') {
        submitBtn.disabled = false;
        spinner?.classList.add('hidden');
        btnText?.classList.remove('hidden');
      }
    }
  });

  // ── Menú: Crear Partida ────────────────────────────────────────────────
  $('btn-create-room')?.addEventListener('click', () => abrirModal('modal-role'));

  // ── Modal rol al crear: "Ser la Pantalla" ─────────────────────────────
  $('btn-role-screen')?.addEventListener('click', async () => {
    cerrarModal('modal-role');
    try {
      state.socket.emit('create_room', { rol: 'pantalla' });
    } catch (err) {
      toast('Error creando la sala', 'error');
    }
  });

  // ── Modal rol al crear: "Ser Jugador" ─────────────────────────────────
  $('btn-role-player')?.addEventListener('click', () => {
    cerrarModal('modal-role');
    state.socket.emit('create_room', { rol: 'jugador' });
  });

  // ── Cerrar modal de rol ────────────────────────────────────────────────
  $('btn-role-cancel')?.addEventListener('click',        () => cerrarModal('modal-role'));
  $('modal-role-backdrop')?.addEventListener('click',    () => cerrarModal('modal-role'));

  // ── Menú: Unirse a Partida ─────────────────────────────────────────────
  $('btn-join-room')?.addEventListener('click', () => {
    if (state.joinRoomCode) {
      $('input-room-code').value = state.joinRoomCode;
    }
    abrirModal('modal-join');
  });

  // ── Modal unirse: "Buscar sala" ────────────────────────────────────────
  $('btn-join-confirm')?.addEventListener('click', () => {
    const code    = ($('input-room-code')?.value || '').toUpperCase().trim();
    const errorEl = $('join-code-error');

    if (code.length !== 4) {
      if (errorEl) errorEl.textContent = 'El código debe tener 4 caracteres';
      return;
    }
    if (errorEl) errorEl.textContent = '';

    // Guardar el código y mostrar selección de rol
    state.joinRoomCode = code;
    $('join-step-code')?.classList.add('hidden');
    $('join-step-role')?.classList.remove('hidden');
  });

  // ── Modal unirse: "Ser Jugador" ────────────────────────────────────────
  $('btn-join-as-player')?.addEventListener('click', () => {
    cerrarModal('modal-join');
    state.socket.emit('join_room', {
      roomCode: state.joinRoomCode,
      rol:      'jugador',
    });
  });

  // ── Modal unirse: "Ser la Pantalla" ───────────────────────────────────
  $('btn-join-as-screen')?.addEventListener('click', () => {
    cerrarModal('modal-join');
    state.socket.emit('join_room', {
      roomCode: state.joinRoomCode,
      rol:      'pantalla',
    });
  });

  // ── Cerrar modal de unirse ─────────────────────────────────────────────
  $('btn-join-cancel')?.addEventListener('click',       () => {
    cerrarModal('modal-join');
    $('join-step-code')?.classList.remove('hidden');
    $('join-step-role')?.classList.add('hidden');
    if ($('input-room-code')) $('input-room-code').value = '';
  });
  $('modal-join-backdrop')?.addEventListener('click',   () => {
    cerrarModal('modal-join');
    $('join-step-code')?.classList.remove('hidden');
    $('join-step-role')?.classList.add('hidden');
  });

  // ── Input código de sala: auto-mayúsculas y filtrado ──────────────────
  $('input-room-code')?.addEventListener('input', (e) => {
    const val      = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    e.target.value = val;
  });

  // ── Input nombre: contador + enviar al servidor ────────────────────────
  let nombreTimeout = null;
  $('input-player-name')?.addEventListener('input', (e) => {
    const val = e.target.value;
    actualizarContadorNombre(val);
    actualizarBotonListo();

    // Debounce para no enviar en cada pulsación
    clearTimeout(nombreTimeout);
    nombreTimeout = setTimeout(() => {
      if (val.trim()) enviarNombre(val);
    }, 600);
  });

  // ── Botón "Listo" ──────────────────────────────────────────────────────
  $('btn-player-ready')?.addEventListener('click', () => {
    const yaListo = state.miJugador?.listo;
    marcarListo(!yaListo);
  });

  // ── Botón "Empezar" (anfitrión) ────────────────────────────────────────
  $('btn-start-game')?.addEventListener('click', () => iniciarPartida());

  // ── Botón "Tirar Dado" (controlador móvil en partida) ─────────────────
  $('btn-roll-dice')?.addEventListener('click', () => {
    if (!state.turnoActivo || !state.socket) return;
    state.socket.emit('dice:roll', {
      roomCode: state.roomCode,
      playerId: state.playerId,
    });
    // Deshabilitar brevemente para evitar doble clic
    const btn = $('btn-roll-dice');
    if (btn) {
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, 800);
    }
  });

  // ── Botón "Volver al Menú" tras fin de partida ────────────────────────
  $('btn-game-over-menu')?.addEventListener('click', () => {
    cerrarModal('modal-game-over');
    limpiarSesion();
    if (state.boardInstance) {
      try { state.boardInstance.destroy(); } catch (e) {}
      state.boardInstance = null;
    }
    if (state.minigameInstance) {
      try { state.minigameInstance.destroy(); } catch (e) {}
      state.minigameInstance = null;
    }
    showView('menu');
  });

  // ── Controles Minijuego: Carrera en el Guadiana (remada) ─────────────────
  const enviarRemada = (lado) => {
    if (!state.minigameActive || !state.socket) return;
    state.socket.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   lado === 'izq' ? 'remo_izq' : 'remo_der',
    });

    if ('vibrate' in navigator) {
      try { navigator.vibrate(25); } catch (e) {}
    }

    const btnIzq = $('btn-remo-izq');
    const btnDer = $('btn-remo-der');
    if (lado === 'izq') {
      btnIzq?.classList.remove('pulse-guide');
      btnDer?.classList.add('pulse-guide');
    } else {
      btnDer?.classList.remove('pulse-guide');
      btnIzq?.classList.add('pulse-guide');
    }
  };

  $('btn-remo-izq')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    enviarRemada('izq');
  });

  $('btn-remo-der')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    enviarRemada('der');
  });

  // ── Controles Minijuego: Lluvia de Bellotas ──────────────────────────────
  let dirActual = 0;
  let turboActual = false;

  const enviarMovimientoBellotas = () => {
    if (!state.minigameActive || !state.socket) return;
    state.socket.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'mover',
      payload:  { dir: dirActual, turbo: turboActual },
    });
  };

  $('btn-bellota-izq')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dirActual = -1;
    enviarMovimientoBellotas();
  });
  const pararIzq = () => {
    if (dirActual === -1) {
      dirActual = 0;
      enviarMovimientoBellotas();
    }
  };
  $('btn-bellota-izq')?.addEventListener('pointerup', pararIzq);
  $('btn-bellota-izq')?.addEventListener('pointerleave', pararIzq);

  $('btn-bellota-der')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dirActual = 1;
    enviarMovimientoBellotas();
  });
  const pararDer = () => {
    if (dirActual === 1) {
      dirActual = 0;
      enviarMovimientoBellotas();
    }
  };
  $('btn-bellota-der')?.addEventListener('pointerup', pararDer);
  $('btn-bellota-der')?.addEventListener('pointerleave', pararDer);

  $('btn-bellota-turbo')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    turboActual = true;
    $('btn-bellota-turbo')?.classList.add('active-turbo');
    enviarMovimientoBellotas();
  });
  const pararTurbo = () => {
    turboActual = false;
    $('btn-bellota-turbo')?.classList.remove('active-turbo');
    enviarMovimientoBellotas();
  };
  $('btn-bellota-turbo')?.addEventListener('pointerup', pararTurbo);
  $('btn-bellota-turbo')?.addEventListener('pointerleave', pararTurbo);

  // ── Controles Minijuego: Reacción en la Alcazaba (pulsador de reflejos) ───
  $('btn-reaccion-pulsar')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state.minigameActive || !state.socket) return;

    state.socket.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'pulsar',
    });

    if ('vibrate' in navigator) {
      try { navigator.vibrate(50); } catch (err) {}
    }
  });

  // ── Controles Minijuego: Memory de Monumentos (selección de carta) ─────────
  document.querySelectorAll('.btn-memory-card').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!state.minigameActive || !state.socket || btn.disabled) return;

      const monumentoId = btn.dataset.monumentoId;
      document.querySelectorAll('.btn-memory-card').forEach(b => b.classList.remove('card-selected'));
      btn.classList.add('card-selected');

      state.socket.emit('minigame:input', {
        roomCode: state.roomCode,
        playerId: state.playerId,
        action:   'seleccionar_monumento',
        payload:  { monumentoId },
      });

      if ('vibrate' in navigator) {
        try { navigator.vibrate(35); } catch (err) {}
      }
    });
  });

  // ── Controles Minijuego 5: Pulso en la Plaza Alta ─────────────────────────
  $('btn-pulso-mash')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state.minigameActive || !state.socket) return;

    state.socket.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'fuerza_tap',
    });

    if ('vibrate' in navigator) {
      try { navigator.vibrate(20); } catch (err) {}
    }
  });

  // ── Controles Minijuego 3: Caramelos del Carnaval ─────────────────────────
  $('btn-toggle-gyro-carnaval')?.addEventListener('click', () => {
    solicitarPermisoGiroscopio('btn-toggle-gyro-carnaval', 'label-gyro-carnaval');
  });

  let dirCarnaval = 0;
  let turboCarnaval = false;
  const enviarMovCarnaval = () => {
    if (!state.minigameActive || !state.socket) return;
    state.socket.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'mover',
      payload:  { dir: dirCarnaval, turbo: turboCarnaval },
    });
  };

  $('btn-carnaval-izq')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dirCarnaval = -1;
    enviarMovCarnaval();
  });
  const pararCarnavalIzq = () => {
    if (dirCarnaval === -1) { dirCarnaval = 0; enviarMovCarnaval(); }
  };
  $('btn-carnaval-izq')?.addEventListener('pointerup', pararCarnavalIzq);
  $('btn-carnaval-izq')?.addEventListener('pointerleave', pararCarnavalIzq);

  $('btn-carnaval-der')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dirCarnaval = 1;
    enviarMovCarnaval();
  });
  const pararCarnavalDer = () => {
    if (dirCarnaval === 1) { dirCarnaval = 0; enviarMovCarnaval(); }
  };
  $('btn-carnaval-der')?.addEventListener('pointerup', pararCarnavalDer);
  $('btn-carnaval-der')?.addEventListener('pointerleave', pararCarnavalDer);

  $('btn-carnaval-turbo')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    turboCarnaval = true;
    $('btn-carnaval-turbo')?.classList.add('active-turbo');
    enviarMovCarnaval();
  });
  const pararCarnavalTurbo = () => {
    turboCarnaval = false;
    $('btn-carnaval-turbo')?.classList.remove('active-turbo');
    enviarMovCarnaval();
  };
  $('btn-carnaval-turbo')?.addEventListener('pointerup', pararCarnavalTurbo);
  $('btn-carnaval-turbo')?.addEventListener('pointerleave', pararCarnavalTurbo);

  // ── Controles Minijuego 2: Esquivar en la Muralla ─────────────────────────
  $('btn-muralla-izq')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state.minigameActive || !state.socket) return;
    state.socket.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'carril_izq',
    });
    if ('vibrate' in navigator) try { navigator.vibrate(30); } catch (_) {}
  });

  $('btn-muralla-der')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state.minigameActive || !state.socket) return;
    state.socket.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'carril_der',
    });
    if ('vibrate' in navigator) try { navigator.vibrate(30); } catch (_) {}
  });

  $('btn-muralla-salto')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!state.minigameActive || !state.socket) return;
    state.socket.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'saltar',
    });
    if ('vibrate' in navigator) try { navigator.vibrate(45); } catch (_) {}
  });

  // ── Controles Minijuego 4: Carrera de Coches ──────────────────────────────
  $('btn-toggle-gyro-coches')?.addEventListener('click', () => {
    solicitarPermisoGiroscopio('btn-toggle-gyro-coches', 'label-gyro-coches');
  });

  $('btn-coche-izq')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.socket?.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'girar',
      payload:  { dir: -1 },
    });
  });
  const soltarGiroCoche = () => {
    state.socket?.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'girar',
      payload:  { dir: 0 },
    });
  };
  $('btn-coche-izq')?.addEventListener('pointerup', soltarGiroCoche);
  $('btn-coche-izq')?.addEventListener('pointerleave', soltarGiroCoche);

  $('btn-coche-der')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.socket?.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'girar',
      payload:  { dir: 1 },
    });
  });
  $('btn-coche-der')?.addEventListener('pointerup', soltarGiroCoche);
  $('btn-coche-der')?.addEventListener('pointerleave', soltarGiroCoche);

  $('btn-coche-gas')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.socket?.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'acelerar_on',
    });
  });
  const soltarGas = () => {
    state.socket?.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'acelerar_off',
    });
  };
  $('btn-coche-gas')?.addEventListener('pointerup', soltarGas);
  $('btn-coche-gas')?.addEventListener('pointerleave', soltarGas);

  $('btn-coche-freno')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.socket?.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'frenar_on',
    });
  });
  const soltarFreno = () => {
    state.socket?.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'frenar_off',
    });
  };
  $('btn-coche-freno')?.addEventListener('pointerup', soltarFreno);
  $('btn-coche-freno')?.addEventListener('pointerleave', soltarFreno);

  // ── Controles Minijuego 7: Equilibrio en el Puente de Palmas ─────────────
  $('btn-toggle-gyro-equilibrio')?.addEventListener('click', () => {
    solicitarPermisoGiroscopio('btn-toggle-gyro-equilibrio', 'label-gyro-equilibrio');
  });

  $('btn-equilibrio-izq')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.socket?.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'compensar_izq',
    });
    if ('vibrate' in navigator) try { navigator.vibrate(25); } catch (_) {}
  });

  $('btn-equilibrio-der')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    state.socket?.emit('minigame:input', {
      roomCode: state.roomCode,
      playerId: state.playerId,
      action:   'compensar_der',
    });
    if ('vibrate' in navigator) try { navigator.vibrate(25); } catch (_) {}
  });

  // Activar la vista inicial
  showView('password');
  setTimeout(() => $('input-password')?.focus(), 200);
}

// ─── Gestión de Giroscopio y Sensores Móviles (Regla 12) ────────────────────
let gyroHabilitado = false;

async function solicitarPermisoGiroscopio(btnId, labelId) {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permiso = await DeviceOrientationEvent.requestPermission();
      if (permiso === 'granted') {
        activarGiroscopio(btnId, labelId);
        return true;
      } else {
        toast('Permiso de giroscopio denegado en iOS. Usa los botones táctiles.', 'info');
        return false;
      }
    } catch (err) {
      console.warn('Giroscopio iOS error:', err);
      toast('Error solicitando giroscopio', 'error');
      return false;
    }
  } else if ('DeviceOrientationEvent' in window) {
    activarGiroscopio(btnId, labelId);
    return true;
  }
  toast('Giroscopio no disponible en este dispositivo (requiere HTTPS o sensor)', 'info');
  return false;
}

function activarGiroscopio(btnId, labelId) {
  gyroHabilitado = !gyroHabilitado;
  const btn = $(btnId);
  const lbl = $(labelId);

  if (gyroHabilitado) {
    btn?.classList.add('gyro-active');
    if (lbl) lbl.textContent = 'Giroscopio ACTIVO';
    window.addEventListener('deviceorientation', handleOrientationGlobal);
    toast('¡Giroscopio activado! Inclina tu móvil para moverte', 'success');
  } else {
    btn?.classList.remove('gyro-active');
    if (lbl) lbl.textContent = 'Activar Giroscopio';
    window.removeEventListener('deviceorientation', handleOrientationGlobal);
    toast('Giroscopio desactivado. Control por botones táctiles', 'info');
  }
}

function handleOrientationGlobal(e) {
  if (!gyroHabilitado || !state.minigameActive || !state.socket) return;
  const gamma = e.gamma || 0;
  const tiltX = Math.max(-1.0, Math.min(1.0, gamma / 28));

  state.socket.emit('minigame:input', {
    roomCode: state.roomCode,
    playerId: state.playerId,
    action:   'inclinacion',
    payload:  { tiltX },
  });
}

// ─── Helpers de Minijuegos (Fase 4) ──────────────────────────────────────────

function iniciarCuentaAtrasIntro(ms) {
  const cdEl = $('minigame-countdown-number');
  if (!cdEl) return;

  let seg = Math.ceil(ms / 1000) - 1;
  cdEl.textContent = seg > 0 ? seg : '¡YA!';

  const interval = setInterval(() => {
    seg--;
    if (seg > 0) {
      cdEl.textContent = seg;
      cdEl.classList.remove('pulse-countdown');
      void cdEl.offsetWidth; // trigger reflow
      cdEl.classList.add('pulse-countdown');
    } else if (seg === 0) {
      cdEl.textContent = '¡YA!';
    } else {
      clearInterval(interval);
    }
  }, 1000);
}

function iniciarTemporizadorMinijuego(ms) {
  if (state.minigameTimer) clearInterval(state.minigameTimer);
  const timerEl = $('minigame-screen-timer');
  let restante = Math.ceil(ms / 1000);
  if (timerEl) timerEl.textContent = `${restante}s`;

  state.minigameTimer = setInterval(() => {
    restante = Math.max(0, restante - 1);
    if (timerEl) timerEl.textContent = `${restante}s`;
    if (restante <= 0) {
      clearInterval(state.minigameTimer);
      state.minigameTimer = null;
    }
  }, 1000);
}

// ─── Helper: habilitar/deshabilitar botón Listo ──────────────────────────────

function actualizarBotonListo() {
  const btn     = $('btn-player-ready');
  const nombre  = $('input-player-name')?.value?.trim();
  const avatar  = state.miJugador?.avatarId;
  if (btn) btn.disabled = !(nombre && avatar);
}

// ─── Arranque ─────────────────────────────────────────────────────────────────

init().catch(err => {
  console.error('[App] Error en init:', err);
});
