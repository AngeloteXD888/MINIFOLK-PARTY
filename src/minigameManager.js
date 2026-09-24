/**
 * src/minigameManager.js — Gestor autoritativo del Ciclo de Vida de Minijuegos (Fase 4)
 *
 * ARQUITECTURA MODULAR (Regla 9):
 * - Cada minijuego es un módulo independiente que implementa el contrato común:
 *   * init(players, room)
 *   * onInput(playerId, input)
 *   * update(dt)
 *   * isFinished()
 *   * getResults() -> ranking con posiciones
 *
 * - El gestor controla el bucle autoritativo a 20 Hz (TICK_MS = 50 ms),
 *   emite snapshots del estado en tiempo real, gestiona la intro (4s),
 *   la cuenta atrás, la conclusión y el retorno fluido al tablero con reparto de monedas.
 *
 * CATÁLOGO DE MINIJUEGOS DEL MVP:
 * 1. 'carrera_guadiana' / 'piraguismo_guadiana': Minijuego 1 (Piragüismo en el Guadiana)
 * 2. 'reaccion_luces': Minijuego 8 (Reacción rápida en la Alcazaba con penalización por falso comienzo)
 * 3. 'memory_monumentos': Minijuego 6 (Memory visual de monumentos pacenses)
 * 4. 'lluvia_bellotas': Lluvia de Bellotas en la Dehesa
 */

'use strict';

const PiraguismoGuadiana = require('./minigames/piraguismoGuadiana');
const ReaccionLuces      = require('./minigames/reaccionLuces');
const MemoryMonumentos   = require('./minigames/memoryMonumentos');
const LluviaBellotas     = require('./minigames/lluviaBellotas');

const TICK_RATE_HZ = 20;
const TICK_MS      = 1000 / TICK_RATE_HZ; // 50 ms

/**
 * Catálogo de clases de minijuegos disponibles
 */
const CLASES_MINIJUEGOS = [
  PiraguismoGuadiana, // Minijuego 1 MVP
  ReaccionLuces,      // Minijuego 8 MVP
  MemoryMonumentos,   // Minijuego 6 MVP
  LluviaBellotas,     // Minijuego adicional
];

/**
 * Metadata pública de los minijuegos para intros y menús
 */
const CATALOGO_MINIJUEGOS = CLASES_MINIJUEGOS.map(Clase => {
  const dummy = new Clase();
  return dummy.info;
});

/** Mapa de sesiones activas: roomCode -> SesionMinijuego */
const minijuegosActivos = new Map();

// ══════════════════════════════════════════════════════════════════════════════
// CLASE: SesionMinijuego (controlador del ciclo de vida autoritativo)
// ══════════════════════════════════════════════════════════════════════════════

class SesionMinijuego {
  constructor(roomCode, instanciaJuego, listaJugadores, io, onFinalizado) {
    this.roomCode      = roomCode;
    this.juego         = instanciaJuego;
    this.jugadores     = listaJugadores;
    this.io            = io;
    this.onFinalizado  = onFinalizado;
    this.estado        = 'INTRO'; // 'INTRO' | 'JUGANDO' | 'RESULTADOS' | 'FINALIZADO'
    this.intervalLoop  = null;
    this.introTimeout  = null;
    this.terminado     = false;
  }

  iniciar() {
    // 1. Inicializar la lógica del minijuego con el contrato común
    this.juego.init(this.jugadores, this.roomCode);

    // 2. Emitir pantalla de introducción, reglas y controles al salón
    this.io.to(this.roomCode).emit('minigame:intro', {
      minijuego: {
        id:               this.juego.info.id,
        nombre:           this.juego.info.nombre,
        subtitulo:        this.juego.info.subtitulo,
        descripcion:      this.juego.info.descripcion,
        controlesTexto:   this.juego.info.controlesTexto,
        tipoControl:      this.juego.info.tipoControl,
        duracionSegundos: this.juego.info.duracionSegundos,
      },
      jugadores: this.jugadores.map((j, i) => ({
        playerId: j.playerId,
        nombre:   j.nombre || `Jugador ${i + 1}`,
        avatarId: j.avatarId,
        color:    j.color,
        carril:   i,
      })),
      cuentaAtrasMs: 4000,
    });

    // 3. Cuenta atrás de 4 segundos antes de arrancar el bucle en 20 Hz
    this.introTimeout = setTimeout(() => {
      this.arrancarBucle();
    }, 4000);
  }

  arrancarBucle() {
    if (this.terminado) return;
    this.estado = 'JUGANDO';

    this.io.to(this.roomCode).emit('minigame:start', {
      minijuegoId:     this.juego.info.id,
      duracionTotalMs: this.juego.duracionTotalMs,
    });

    // Bucle autoritativo a 20 Hz
    this.intervalLoop = setInterval(() => {
      this.tick();
    }, TICK_MS);
  }

  procesarInput(playerId, action, payload = {}) {
    if (this.estado !== 'JUGANDO' || this.terminado) return;
    this.juego.onInput(playerId, { action, payload });
  }

  tick() {
    if (this.terminado) return;

    const dt = TICK_MS / 1000; // 0.05 s
    this.juego.update(dt);

    // Snapshot a 20 Hz para todos los clientes de la sala
    const snapshot = this.juego.getStateSnapshot();
    this.io.to(this.roomCode).emit('minigame:state', snapshot);

    // Comprobar condición de conclusión
    if (this.juego.isFinished()) {
      this.concluir();
    }
  }

  concluir() {
    if (this.terminado) return;
    this.terminado = true;

    if (this.intervalLoop) {
      clearInterval(this.intervalLoop);
      this.intervalLoop = null;
    }
    this.estado = 'RESULTADOS';

    // Obtener ranking y recompensas de monedas del contrato común
    const resultados = this.juego.getResults();

    this.io.to(this.roomCode).emit('minigame:results', {
      minijuegoId:   this.juego.info.id,
      nombre:        this.juego.info.nombre,
      clasificacion: resultados,
      duracionMs:    4500,
    });

    // Tras 4.5 segundos mostrando el podio, invocar callback para volver al tablero
    setTimeout(() => {
      this.destruir();
      if (typeof this.onFinalizado === 'function') {
        this.onFinalizado(resultados);
      }
    }, 4500);
  }

  destruir() {
    this.terminado = true;
    if (this.introTimeout) {
      clearTimeout(this.introTimeout);
      this.introTimeout = null;
    }
    if (this.intervalLoop) {
      clearInterval(this.intervalLoop);
      this.intervalLoop = null;
    }
    if (this.juego && typeof this.juego.destroy === 'function') {
      this.juego.destroy();
    }
    minijuegosActivos.delete(this.roomCode);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// API PÚBLICA DEL GESTOR
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Crea una instancia de minijuego según ID o de forma aleatoria (priorizando los 3 MVP).
 * @param {string|null} idEspecifico
 * @returns {MinigameBase}
 */
function instanciarMinijuego(idEspecifico = null) {
  if (idEspecifico) {
    const ClaseEncontrada = CLASES_MINIJUEGOS.find(C => {
      const dummy = new C();
      return dummy.info.id === idEspecifico || dummy.info.aliasId === idEspecifico;
    });
    if (ClaseEncontrada) return new ClaseEncontrada();
  }

  // Si no se especifica, elegir aleatoriamente
  const idx = Math.floor(Math.random() * CLASES_MINIJUEGOS.length);
  const ClaseElegida = CLASES_MINIJUEGOS[idx];
  return new ClaseElegida();
}

/**
 * Inicia una sesión de minijuego autoritativo para la sala especificada.
 * @param {string} roomCode
 * @param {Array} jugadores
 * @param {object} io - Instancia de Socket.io
 * @param {Function} onFinalizado - Callback que recibe (resultadosConMonedas)
 * @param {string|null} idMinijuego
 * @returns {SesionMinijuego}
 */
function iniciarMinijuego(roomCode, jugadores, io, onFinalizado, idMinijuego = null) {
  const codigo = (roomCode || '').toUpperCase().trim();

  // Limpiar sesión previa si existiera
  limpiarMinijuego(codigo);

  const instanciaJuego = instanciarMinijuego(idMinijuego);
  const sesion = new SesionMinijuego(codigo, instanciaJuego, jugadores, io, onFinalizado);
  minijuegosActivos.set(codigo, sesion);

  sesion.iniciar();
  return sesion;
}

/**
 * Enruta un input de jugador hacia el minijuego activo de la sala.
 * @param {string} roomCode
 * @param {string} playerId
 * @param {string} action
 * @param {object} payload
 */
function procesarInputMinijuego(roomCode, playerId, action, payload = {}) {
  const codigo = (roomCode || '').toUpperCase().trim();
  const sesion = minijuegosActivos.get(codigo);
  if (sesion) {
    sesion.procesarInput(playerId, action, payload);
  }
}

/**
 * Obtiene la sesión activa de minijuego para una sala.
 * @param {string} roomCode
 * @returns {SesionMinijuego|null}
 */
function getMinijuegoActivo(roomCode) {
  return minijuegosActivos.get((roomCode || '').toUpperCase().trim()) || null;
}

/**
 * Destruye y limpia cualquier minijuego activo de la sala.
 * @param {string} roomCode
 */
function limpiarMinijuego(roomCode) {
  const codigo = (roomCode || '').toUpperCase().trim();
  const sesion = minijuegosActivos.get(codigo);
  if (sesion) {
    sesion.destruir();
  }
  minijuegosActivos.delete(codigo);
}

module.exports = {
  TICK_RATE_HZ,
  TICK_MS,
  CATALOGO_MINIJUEGOS,
  instanciarMinijuego,
  iniciarMinijuego,
  procesarInputMinijuego,
  getMinijuegoActivo,
  limpiarMinijuego,
};
