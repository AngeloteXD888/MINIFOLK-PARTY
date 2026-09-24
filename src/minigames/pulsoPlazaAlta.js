/**
 * src/minigames/pulsoPlazaAlta.js — Minijuego 5: Pulso de fuerza en la Plaza Alta
 *
 * CONCEPTO:
 * - Duelo de fuerza y resistencia en los soportales de la Plaza Alta.
 * - Mecánica autoritativa: "mash button" / pulsación rápida repetida en el móvil.
 * - Cada pulsación añade impulso de potencia; la fatiga reduce la fuerza progresivamente.
 * - Puntuación por potencia total acumulada y velocidad máxima de pulsación.
 */

'use strict';

const { MinigameBase, MONEDAS_POR_PUESTO } = require('./minigameBase');

class PulsoPlazaAlta extends MinigameBase {
  constructor() {
    super({
      id: 'pulso_fuerza',
      nombre: 'Pulso en la Plaza Alta',
      subtitulo: '¡Duelo de fuerza en los soportales de Badajoz!',
      descripcion: 'Pulsa el botón de fuerza tan rápido como puedas para superar a tus oponentes en la mesa de pulso.',
      controlesTexto: '¡Machaca el botón de FUERZA sin parar para mantener tu potencia al máximo!',
      tipoControl: 'mash_button',
      duracionSegundos: 16,
    });
  }

  init(players, roomCode, options = {}) {
    super.init(players, roomCode, options);

    this.jugadores.forEach((j) => {
      j.datosEspecificos = {
        fuerzaActual: 10,   // Potencia instantánea (0 - 100)
        pulsacionesTotal: 0,
        tapsPorSegundo: 0,
        tapsEnUltimoSegundo: 0,
        tiempoUltimoCalculoTps: 0,
      };
    });
  }

  onInput(playerId, input = {}) {
    if (this.terminado) return;
    const j = this.jugadores.get(playerId);
    if (!j) return;

    const action = input.action || '';
    if (action === 'fuerza_tap' || action === 'mash' || action === 'pulsar' || action === 'tap') {
      const esp = j.datosEspecificos;
      esp.pulsacionesTotal++;
      esp.tapsEnUltimoSegundo++;

      // Aumentar barra de fuerza con amortiguación en niveles altos
      const ganancia = Math.max(1.2, 5.0 * (1 - esp.fuerzaActual / 120));
      esp.fuerzaActual = Math.min(100, esp.fuerzaActual + ganancia);

      // Puntos acumulados por esfuerzo continuado
      j.puntos += 1;
    }
  }

  update(dt) {
    super.update(dt);
    if (this.terminado) return;

    const dtMs = dt * 1000;

    this.jugadores.forEach((j) => {
      const esp = j.datosEspecificos;

      // Fatiga muscular: decaimiento natural de la fuerza hacia 0
      esp.fuerzaActual = Math.max(0, esp.fuerzaActual - 24 * dt);

      // Si mantiene la fuerza por encima del 75%, suma puntos bonus de dominancia
      if (esp.fuerzaActual > 75) {
        j.puntos += Math.round(15 * dt);
      }

      // Cálculo de pulsaciones por segundo (TPS)
      esp.tiempoUltimoCalculoTps += dtMs;
      if (esp.tiempoUltimoCalculoTps >= 1000) {
        esp.tapsPorSegundo = esp.tapsEnUltimoSegundo;
        esp.tapsEnUltimoSegundo = 0;
        esp.tiempoUltimoCalculoTps = 0;
      }
    });
  }

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
        fuerzaActual: Math.round(j.datosEspecificos.fuerzaActual),
        tapsPorSegundo: j.datosEspecificos.tapsPorSegundo,
        pulsacionesTotal: j.datosEspecificos.pulsacionesTotal,
      })),
    };
  }

  getResults() {
    const lista = Array.from(this.jugadores.values());

    lista.sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      return b.datosEspecificos.pulsacionesTotal - a.datosEspecificos.pulsacionesTotal;
    });

    return lista.map((j, i) => ({
      puesto: i + 1,
      playerId: j.playerId,
      nombre: j.nombre,
      avatarId: j.avatarId,
      color: j.color,
      puntos: `${j.puntos} pts (${j.datosEspecificos.pulsacionesTotal} taps)`,
      monedasGanadas: MONEDAS_POR_PUESTO[i] || 1,
    }));
  }
}

module.exports = PulsoPlazaAlta;
