/**
 * src/minigames/minigameBase.js — Contrato común autoritativo para minijuegos (Regla 9)
 *
 * ARQUITECTURA:
 * Cada minijuego es un módulo independiente que implementa el contrato común:
 * - init(players, roomCode, options)
 * - onInput(playerId, input)
 * - update(dt)
 * - isFinished()
 * - getResults() -> ranking con posiciones
 *
 * Esto garantiza que todos los minijuegos son intercambiables y el sistema
 * de tablero no depende de ninguno en particular.
 */

'use strict';

/** Recompensas estándar en monedas según el puesto en el podio */
const MONEDAS_POR_PUESTO = [10, 6, 3, 1];

class MinigameBase {
  /**
   * @param {object} info Metadatos del minijuego (id, nombre, subtitulo, descripcion, tipoControl, duracionSegundos)
   */
  constructor(info) {
    this.info = info;
    this.roomCode = null;
    this.duracionTotalMs = (info.duracionSegundos || 18) * 1000;
    this.tiempoRestanteMs = this.duracionTotalMs;
    this.jugadores = new Map();
    this.terminado = false;
  }

  /**
   * Inicializa el minijuego con la lista de jugadores y el código de sala.
   * @param {Array} players
   * @param {string} roomCode
   * @param {object} [options]
   */
  init(players, roomCode, options = {}) {
    this.roomCode = (roomCode || '').toUpperCase().trim();
    this.duracionTotalMs = (this.info.duracionSegundos || 18) * 1000;
    this.tiempoRestanteMs = this.duracionTotalMs;
    this.terminado = false;
    this.jugadores.clear();

    players.forEach((p, index) => {
      this.jugadores.set(p.playerId, {
        playerId: p.playerId,
        nombre: p.nombre || `Jugador ${index + 1}`,
        avatarId: p.avatarId || null,
        color: p.color || '#E63946',
        carril: index,
        puntos: 0,
        datosEspecificos: {},
      });
    });
  }

  /**
   * Procesa un input de un jugador en tiempo real.
   * @param {string} playerId
   * @param {object} input { action: string, payload?: object }
   */
  onInput(playerId, input) {
    throw new Error(`El método onInput() debe ser implementado por ${this.info.id}`);
  }

  /**
   * Actualiza el estado y física del minijuego con el paso del tiempo.
   * Llamado a 20 Hz (dt = 0.05 segundos).
   * @param {number} dt Delta de tiempo en segundos
   */
  update(dt) {
    this.tiempoRestanteMs = Math.max(0, this.tiempoRestanteMs - dt * 1000);
    if (this.tiempoRestanteMs <= 0) {
      this.terminado = true;
    }
  }

  /**
   * Comprueba si el minijuego ha concluido (por tiempo o por condición de victoria).
   * @returns {boolean}
   */
  isFinished() {
    return this.terminado || this.tiempoRestanteMs <= 0;
  }

  /**
   * Devuelve un snapshot ligero del estado para emitir a 20 Hz a los clientes vía Socket.io.
   * @returns {object}
   */
  getStateSnapshot() {
    return {
      minijuegoId: this.info.id,
      tiempoRestanteMs: Math.round(this.tiempoRestanteMs),
      jugadores: Array.from(this.jugadores.values()).map(j => ({
        playerId: j.playerId,
        nombre: j.nombre,
        color: j.color,
        carril: j.carril,
        puntos: j.puntos,
        ...j.datosEspecificos,
      })),
    };
  }

  /**
   * Devuelve el ranking final ordenado con recompensas en monedas.
   * @returns {Array<{ puesto: number, playerId: string, nombre: string, avatarId: string, color: string, puntos: string|number, monedasGanadas: number }>}
   */
  getResults() {
    const lista = Array.from(this.jugadores.values());
    lista.sort((a, b) => (b.puntos || 0) - (a.puntos || 0));

    return lista.map((j, i) => ({
      puesto: i + 1,
      playerId: j.playerId,
      nombre: j.nombre,
      avatarId: j.avatarId,
      color: j.color,
      puntos: j.puntos,
      monedasGanadas: MONEDAS_POR_PUESTO[i] || 1,
    }));
  }

  /**
   * Limpieza de timers o recursos internos al terminar.
   */
  destroy() {
    this.terminado = true;
  }
}

module.exports = {
  MinigameBase,
  MONEDAS_POR_PUESTO,
};
