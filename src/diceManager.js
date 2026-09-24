/**
 * src/diceManager.js — Temporizador y control de tiradas de dado autoritativo
 *
 * RESPONSABILIDADES:
 * - Gestionar el temporizador de inactividad de turno (30 segundos por defecto).
 * - Ejecutar la tirada automática si el jugador no tira o pierde conexión.
 * - Asegurar que el juego nunca se detenga si un móvil se bloquea o desconecta.
 */

'use strict';

const {
  getPartida,
  getJugadorActivo,
  tirarDado,
  TIMEOUT_TURNO_MS,
} = require('./boardManager');

/** Mapa de temporizadores activos: codigoSala -> TimeoutHandle */
const temporizadoresActivos = new Map();

/**
 * Inicia el temporizador de turno para el jugador activo.
 * Si pasan TIMEOUT_TURNO_MS sin acción, invoca el callback onAutoRoll.
 *
 * @param {string} roomCode
 * @param {Function} onAutoRoll Callback ejecutado si salta el temporizador
 * @param {number} duracionMs Tiempo en ms antes de forzar la tirada
 */
function iniciarTemporizadorTurno(roomCode, onAutoRoll, duracionMs = TIMEOUT_TURNO_MS) {
  const codigo = (roomCode || '').toUpperCase().trim();

  // Limpiar temporizador previo si existiera
  cancelarTemporizadorTurno(codigo);

  const timer = setTimeout(() => {
    temporizadoresActivos.delete(codigo);
    const partida = getPartida(codigo);
    if (!partida) return;

    const jugadorActivo = getJugadorActivo(codigo);
    if (jugadorActivo && jugadorActivo.estadoTurno === 'TURNO_DADO') {
      console.log(`[Auto-Turno] Tiempo agotado para ${jugadorActivo.nombre} en sala ${codigo}. Tirando automáticamente...`);
      const resultado = tirarDado(codigo, jugadorActivo.playerId);
      if (resultado.ok && typeof onAutoRoll === 'function') {
        onAutoRoll(resultado, true /* esAutoTirada */);
      }
    }
  }, duracionMs);

  temporizadoresActivos.set(codigo, timer);
}

/**
 * Cancela el temporizador de turno activo para una sala.
 * @param {string} roomCode
 */
function cancelarTemporizadorTurno(roomCode) {
  const codigo = (roomCode || '').toUpperCase().trim();
  const timer  = temporizadoresActivos.get(codigo);
  if (timer) {
    clearTimeout(timer);
    temporizadoresActivos.delete(codigo);
  }
}

module.exports = {
  iniciarTemporizadorTurno,
  cancelarTemporizadorTurno,
  TIMEOUT_TURNO_MS,
};
