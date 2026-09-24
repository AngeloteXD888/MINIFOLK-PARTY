/**
 * src/minigames/reaccionLuces.js — Minijuego 8 (MVP): Reacción rápida a tonos/luces
 *
 * CONCEPTO:
 * - Ambientado en la Alcazaba de Badajoz, ante la majestuosa Torre de Espantaperros.
 * - En lo alto de la torre un gran foco vigila la explanada.
 * - Mecánica: esperar a que la señal roja cambie a VERDE y pulsar el botón en el móvil.
 * - Si el jugador pulsa ANTES de tiempo: ¡Falso comienzo! Recibe penalización inmediata.
 * - Se juegan 3 rondas sucesivas para máxima emoción.
 */

'use strict';

const { MinigameBase, MONEDAS_POR_PUESTO } = require('./minigameBase');

const TOTAL_RONDAS = 3;

class ReaccionLuces extends MinigameBase {
  constructor() {
    super({
      id: 'reaccion_luces',
      nombre: 'Reacción en la Alcazaba',
      subtitulo: '¡Atento al foco de la Torre de Espantaperros!',
      descripcion: 'Espera a que la luz cambie a VERDE y pulsa el botón al instante. ¡Cuidado: pulsar antes conlleva penalización!',
      controlesTexto: 'Mantén el dedo preparado y pulsa en cuanto el foco se encienda en VERDE.',
      tipoControl: 'un_boton_reaccion',
      duracionSegundos: 20,
    });

    this.rondaActual = 1;
    this.faseRonda = 'ESPERA'; // 'ESPERA' (luz roja) | 'VERDE' (luz verde) | 'PAUSA' (evaluación)
    this.tiempoFaseMs = 0;
    this.duracionEsperaMs = 0;
    this.timestampVerde = 0;
  }

  init(players, roomCode, options = {}) {
    super.init(players, roomCode, options);

    this.rondaActual = 1;
    this.iniciarNuevaRonda();

    this.jugadores.forEach((j) => {
      j.datosEspecificos = {
        reaccionUltimaRondaMs: null,
        falsoComienzo: false,
        haPulsadoRonda: false,
        tiemposRondas: [],
        falsosComienzosTotal: 0,
      };
    });
  }

  iniciarNuevaRonda() {
    this.faseRonda = 'ESPERA';
    this.tiempoFaseMs = 0;
    // Tiempo de espera tenso y aleatorio entre 2200 ms y 4200 ms
    this.duracionEsperaMs = 2200 + Math.random() * 2000;
    this.timestampVerde = 0;

    // Resetear banderas de ronda para cada jugador
    this.jugadores.forEach((j) => {
      j.datosEspecificos.reaccionUltimaRondaMs = null;
      j.datosEspecificos.falsoComienzo = false;
      j.datosEspecificos.haPulsadoRonda = false;
    });
  }

  onInput(playerId, input = {}) {
    if (this.terminado) return;
    const j = this.jugadores.get(playerId);
    if (!j) return;

    const action = input.action || '';
    if (action !== 'pulsar' && action !== 'reaccion' && action !== 'tap') return;

    const esp = j.datosEspecificos;
    if (esp.haPulsadoRonda) return; // Ya pulsó en esta ronda

    if (this.faseRonda === 'ESPERA') {
      // ⚠️ ¡Falso comienzo! Pulsó mientras la luz aún estaba roja
      esp.falsoComienzo = true;
      esp.haPulsadoRonda = true;
      esp.falsosComienzosTotal++;
      esp.reaccionUltimaRondaMs = null;
      // Penalización: resta puntos si tenía, y 0 puntos en esta ronda
      j.puntos = Math.max(0, j.puntos - 25);
    } else if (this.faseRonda === 'VERDE') {
      // ✅ ¡Reacción válida con luz verde!
      const tiempoMs = Math.max(50, Date.now() - this.timestampVerde);
      esp.haPulsadoRonda = true;
      esp.reaccionUltimaRondaMs = tiempoMs;
      esp.tiemposRondas.push(tiempoMs);

      // Puntos en función de los reflejos (hasta 150 puntos si reacciona en <200ms)
      const puntosRonda = Math.max(20, Math.round(180 - (tiempoMs / 10)));
      j.puntos += puntosRonda;
    }

    // Comprobar si todos los jugadores ya han pulsado
    const todosHanPulsado = Array.from(this.jugadores.values()).every(
      jug => jug.datosEspecificos.haPulsadoRonda
    );

    if (todosHanPulsado && this.faseRonda === 'VERDE') {
      this.transicionarAPausa();
    }
  }

  update(dt) {
    super.update(dt);
    if (this.terminado) return;

    const dtMs = dt * 1000;
    this.tiempoFaseMs += dtMs;

    if (this.faseRonda === 'ESPERA') {
      if (this.tiempoFaseMs >= this.duracionEsperaMs) {
        // ¡CAMBIO A LUZ VERDE!
        this.faseRonda = 'VERDE';
        this.tiempoFaseMs = 0;
        this.timestampVerde = Date.now();
      }
    } else if (this.faseRonda === 'VERDE') {
      // Si pasan 2.2 segundos de luz verde y alguien no ha pulsado, timeout de la ronda
      if (this.tiempoFaseMs >= 2200) {
        this.transicionarAPausa();
      }
    } else if (this.faseRonda === 'PAUSA') {
      // Pausa de 1.4 segundos para ver feedback antes de la siguiente ronda
      if (this.tiempoFaseMs >= 1400) {
        if (this.rondaActual < TOTAL_RONDAS) {
          this.rondaActual++;
          this.iniciarNuevaRonda();
        } else {
          this.terminado = true;
        }
      }
    }
  }

  transicionarAPausa() {
    this.faseRonda = 'PAUSA';
    this.tiempoFaseMs = 0;
  }

  getStateSnapshot() {
    return {
      minijuegoId: this.info.id,
      tiempoRestanteMs: Math.round(this.tiempoRestanteMs),
      rondaActual: this.rondaActual,
      totalRondas: TOTAL_RONDAS,
      faseRonda: this.faseRonda, // 'ESPERA' | 'VERDE' | 'PAUSA'
      luzVerdeActiva: this.faseRonda === 'VERDE',
      jugadores: Array.from(this.jugadores.values()).map(j => ({
        playerId: j.playerId,
        nombre: j.nombre,
        color: j.color,
        carril: j.carril,
        puntos: j.puntos,
        haPulsadoRonda: j.datosEspecificos.haPulsadoRonda,
        falsoComienzo: j.datosEspecificos.falsoComienzo,
        reaccionUltimaRondaMs: j.datosEspecificos.reaccionUltimaRondaMs,
        falsosComienzosTotal: j.datosEspecificos.falsosComienzosTotal,
      })),
    };
  }

  getResults() {
    const lista = Array.from(this.jugadores.values());

    lista.sort((a, b) => {
      // Más puntos primero
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;

      // Desempate por mejor tiempo medio
      const mediaA = a.datosEspecificos.tiemposRondas.length > 0
        ? a.datosEspecificos.tiemposRondas.reduce((sum, v) => sum + v, 0) / a.datosEspecificos.tiemposRondas.length
        : 9999;
      const mediaB = b.datosEspecificos.tiemposRondas.length > 0
        ? b.datosEspecificos.tiemposRondas.reduce((sum, v) => sum + v, 0) / b.datosEspecificos.tiemposRondas.length
        : 9999;
      return mediaA - mediaB;
    });

    return lista.map((j, i) => {
      const tiempos = j.datosEspecificos.tiemposRondas;
      const mejorTiempo = tiempos.length > 0 ? `${Math.min(...tiempos)} ms` : 'Sin aciertos';
      return {
        puesto: i + 1,
        playerId: j.playerId,
        nombre: j.nombre,
        avatarId: j.avatarId,
        color: j.color,
        puntos: `${j.puntos} pts (${mejorTiempo})`,
        monedasGanadas: MONEDAS_POR_PUESTO[i] || 1,
      };
    });
  }
}

module.exports = ReaccionLuces;
