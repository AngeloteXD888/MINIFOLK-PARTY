/**
 * src/minigames/memoryMonumentos.js — Minijuego 6 (MVP): Memory visual de monumentos pacenses
 *
 * CONCEPTO:
 * - Ambientado en la emblemática Plaza Alta de Badajoz con su suelo de patrones geométricos.
 * - Los 4 grandes monumentos pacenses aparecen en peanas 3D:
 *   1. 'alcazaba': La Alcazaba y Torre de Espantaperros 🏰
 *   2. 'plaza_alta': La Plaza Alta y soportales 🏛️
 *   3. 'puente_real': El Puente Real y sus tirantes 🌉
 *   4. 'puerta_palmas': La Puerta de Palmas y sus almenas ⛩️
 * - En la pantalla 3D se ilumina y destaca un monumento objetivo en cada ronda.
 * - En los móviles se muestran las 4 cartas para que cada jugador seleccione la correcta.
 * - Acierto veloz otorga máxima puntuación; el fallo da 0 puntos.
 * - Se juegan 4 rondas rápidas de identificación visual.
 */

'use strict';

const { MinigameBase, MONEDAS_POR_PUESTO } = require('./minigameBase');

const MONUMENTOS = [
  { id: 'alcazaba',      nombre: 'La Alcazaba',     icono: '🏰', pista: 'Muralla árabe y Torre de Espantaperros' },
  { id: 'plaza_alta',    nombre: 'La Plaza Alta',   icono: '🏛️', pista: 'Arcos decorados y suelo ajedrezado' },
  { id: 'puente_real',   nombre: 'El Puente Real',  icono: '🌉', pista: 'Gran estructura con tirantes sobre el Guadiana' },
  { id: 'puerta_palmas', nombre: 'Puerta de Palmas',icono: '⛩️', pista: 'Puerta monumental flanqueada por dos torres' },
];

const TOTAL_RONDAS = 4;
const DURACION_RONDA_MS = 4000;
const DURACION_REVELACION_MS = 1400;

class MemoryMonumentos extends MinigameBase {
  constructor() {
    super({
      id: 'memory_monumentos',
      nombre: 'Memory de Monumentos',
      subtitulo: '¡Reconoce los monumentos pacenses en la Plaza Alta!',
      descripcion: 'Identifica qué monumento se destaca en la pantalla grande y pulsa la carta correcta en tu móvil antes de que se agote el tiempo.',
      controlesTexto: 'Selecciona una de las 4 cartas de monumentos (Alcazaba, Plaza Alta, Puente Real o Puerta de Palmas).',
      tipoControl: 'cuatro_cartas',
      duracionSegundos: 22,
    });

    this.rondaActual = 1;
    this.monumentoObjetivo = null;
    this.fase = 'JUGANDO_RONDA'; // 'JUGANDO_RONDA' | 'REVELACION'
    this.tiempoFaseMs = 0;
    this.timestampInicioRonda = 0;
  }

  init(players, roomCode, options = {}) {
    super.init(players, roomCode, options);

    this.rondaActual = 1;
    this.iniciarRonda();

    this.jugadores.forEach((j) => {
      j.datosEspecificos = {
        eleccionRonda: null,      // id de monumento elegido
        tiempoRespuestaMs: null,
        acertoRonda: null,        // true | false | null
        aciertosTotales: 0,
        haRespondido: false,
      };
    });
  }

  iniciarRonda() {
    this.fase = 'JUGANDO_RONDA';
    this.tiempoFaseMs = 0;
    this.timestampInicioRonda = Date.now();

    // Seleccionar monumento al azar asegurando no repetir inmediatamente
    let posibles = MONUMENTOS;
    if (this.monumentoObjetivo) {
      posibles = MONUMENTOS.filter(m => m.id !== this.monumentoObjetivo.id);
    }
    const idx = Math.floor(Math.random() * posibles.length);
    this.monumentoObjetivo = posibles[idx];

    // Resetear respuestas de la ronda
    this.jugadores.forEach((j) => {
      j.datosEspecificos.eleccionRonda = null;
      j.datosEspecificos.tiempoRespuestaMs = null;
      j.datosEspecificos.acertoRonda = null;
      j.datosEspecificos.haRespondido = false;
    });
  }

  onInput(playerId, input = {}) {
    if (this.terminado || this.fase !== 'JUGANDO_RONDA') return;
    const j = this.jugadores.get(playerId);
    if (!j) return;

    const esp = j.datosEspecificos;
    if (esp.haRespondido) return; // Solo una respuesta por ronda

    const action = input.action || '';
    let seleccionId = null;

    if (action === 'seleccionar_monumento' || action === 'select_card') {
      seleccionId = input.payload?.monumentoId || input.payload?.id;
    } else if (MONUMENTOS.some(m => m.id === action)) {
      seleccionId = action;
    }

    if (!seleccionId) return;

    const tiempoMs = Math.max(80, Date.now() - this.timestampInicioRonda);
    const esCorrecto = seleccionId === this.monumentoObjetivo.id;

    esp.haRespondido = true;
    esp.eleccionRonda = seleccionId;
    esp.tiempoRespuestaMs = tiempoMs;
    esp.acertoRonda = esCorrecto;

    if (esCorrecto) {
      esp.aciertosTotales++;
      // Puntos: 100 de base + hasta 100 extra por velocidad
      const bonusVelocidad = Math.max(0, Math.round(100 * (1 - (tiempoMs / DURACION_RONDA_MS))));
      j.puntos += (100 + bonusVelocidad);
    }

    // Si todos han respondido, pasar de inmediato a la revelación
    const todosRespondieron = Array.from(this.jugadores.values()).every(
      jug => jug.datosEspecificos.haRespondido
    );
    if (todosRespondieron) {
      this.transicionarARevelacion();
    }
  }

  update(dt) {
    super.update(dt);
    if (this.terminado) return;

    const dtMs = dt * 1000;
    this.tiempoFaseMs += dtMs;

    if (this.fase === 'JUGANDO_RONDA') {
      if (this.tiempoFaseMs >= DURACION_RONDA_MS) {
        this.transicionarARevelacion();
      }
    } else if (this.fase === 'REVELACION') {
      if (this.tiempoFaseMs >= DURACION_REVELACION_MS) {
        if (this.rondaActual < TOTAL_RONDAS) {
          this.rondaActual++;
          this.iniciarRonda();
        } else {
          this.terminado = true;
        }
      }
    }
  }

  transicionarARevelacion() {
    this.fase = 'REVELACION';
    this.tiempoFaseMs = 0;
  }

  getStateSnapshot() {
    return {
      minijuegoId: this.info.id,
      tiempoRestanteMs: Math.round(this.tiempoRestanteMs),
      rondaActual: this.rondaActual,
      totalRondas: TOTAL_RONDAS,
      fase: this.fase,
      monumentoObjetivo: {
        id: this.monumentoObjetivo.id,
        nombre: this.monumentoObjetivo.nombre,
        icono: this.monumentoObjetivo.icono,
        pista: this.monumentoObjetivo.pista,
      },
      monumentosCatalogo: MONUMENTOS.map(m => ({ id: m.id, nombre: m.nombre, icono: m.icono })),
      jugadores: Array.from(this.jugadores.values()).map(j => ({
        playerId: j.playerId,
        nombre: j.nombre,
        color: j.color,
        carril: j.carril,
        puntos: j.puntos,
        haRespondido: j.datosEspecificos.haRespondido,
        acertoRonda: this.fase === 'REVELACION' ? j.datosEspecificos.acertoRonda : null,
        aciertosTotales: j.datosEspecificos.aciertosTotales,
      })),
    };
  }

  getResults() {
    const lista = Array.from(this.jugadores.values());

    lista.sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      return (b.datosEspecificos.aciertosTotales || 0) - (a.datosEspecificos.aciertosTotales || 0);
    });

    return lista.map((j, i) => ({
      puesto: i + 1,
      playerId: j.playerId,
      nombre: j.nombre,
      avatarId: j.avatarId,
      color: j.color,
      puntos: `${j.puntos} pts (${j.datosEspecificos.aciertosTotales || 0}/${TOTAL_RONDAS})`,
      monedasGanadas: MONEDAS_POR_PUESTO[i] || 1,
    }));
  }
}

module.exports = MemoryMonumentos;
