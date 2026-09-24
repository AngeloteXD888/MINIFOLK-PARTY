/**
 * src/minigameManager.js — Gestor autoritativo de Minijuegos en tiempo real (Fase 4)
 *
 * ARQUITECTURA:
 * - Servidor autoritativo con bucle de estado a 20 Hz (TICK_MS = 50 ms).
 * - Los clientes solo envían inputs y reciben snapshots del estado en tiempo real.
 * - Soporte para desconexión/reconexión sin bloquear a los demás jugadores.
 * - Transición limpia: Intro (4s) → Juego en 20 Hz (~18-20s) → Podio de monedas (4s).
 *
 * CATÁLOGO DE MINIJUEGOS:
 * 1. 'carrera_guadiana': Regata de piraguas por el río Guadiana.
 * 2. 'lluvia_bellotas': Recolección de bellotas en la Dehesa de Badajoz.
 */

'use strict';

const TICK_RATE_HZ = 20;
const TICK_MS      = 1000 / TICK_RATE_HZ; // 50 ms

/** Catálogo de minijuegos disponibles */
const CATALOGO_MINIJUEGOS = [
  {
    id: 'carrera_guadiana',
    nombre: 'Regata en el Guadiana',
    subtitulo: '¡Rema con ritmo por el Guadiana hasta el Puente de Palmas!',
    descripcion: 'Alterna remo izquierdo y derecho con ritmo para alcanzar la máxima velocidad.',
    controlesTexto: 'Toca alternadamente los botones IZQ y DER para remar.',
    duracionSegundos: 18,
    tipoControl: 'dos_botones', // 'remo_izq', 'remo_der'
  },
  {
    id: 'lluvia_bellotas',
    nombre: 'Lluvia de Bellotas en la Dehesa',
    subtitulo: '¡Atrapa las mejores bellotas bajo las encinas!',
    descripcion: 'Muévete para atrapar bellotas normales (+1) y doradas (+3). ¡Cuidado con las piedras (-2)!',
    controlesTexto: 'Usa los botones IZQ y DER para mover tu cesta. ¡Usa TURBO para sprintar!',
    duracionSegundos: 20,
    tipoControl: 'lateral_turbo', // 'izq', 'der', 'turbo'
  },
];

/** Mapa de minijuegos activos: roomCode -> InstanciaMinijuego */
const minijuegosActivos = new Map();

/**
 * Recompensas estándar en monedas según el puesto en el minijuego.
 * 1.º: 10 monedas, 2.º: 6 monedas, 3.º: 3 monedas, 4.º: 1 moneda.
 */
const MONEDAS_POR_PUESTO = [10, 6, 3, 1];

// ══════════════════════════════════════════════════════════════════════════════
// CLASE: MinijuegoBase
// ══════════════════════════════════════════════════════════════════════════════

class MinijuegoActivo {
  constructor(roomCode, infoMinijuego, listaJugadores, io, onFinalizado) {
    this.roomCode        = roomCode;
    this.info            = infoMinijuego;
    this.io              = io;
    this.onFinalizado    = onFinalizado;
    this.duracionTotalMs = infoMinijuego.duracionSegundos * 1000;
    this.tiempoRestanteMs = this.duracionTotalMs;
    this.estado          = 'INTRO'; // 'INTRO' | 'JUGANDO' | 'RESULTADOS' | 'FINALIZADO'
    this.intervalLoop    = null;
    this.introTimeout    = null;
    this.terminado       = false;

    // Inicializar estado de jugadores para el minijuego
    this.jugadores = new Map();
    listaJugadores.forEach((j, index) => {
      this.jugadores.set(j.playerId, {
        playerId:    j.playerId,
        nombre:      j.nombre || `Jugador ${index + 1}`,
        avatarId:    j.avatarId,
        color:       j.color || '#E63946',
        carril:      index, // 0, 1, 2, 3
        posicionX:   0,
        posicionY:   0,
        velocidad:   0,
        puntos:      0,
        ultimoRemo:  null,   // para carrera_guadiana ('izq' | 'der')
        tiempoStunMs: 0,     // para aturdimientos
        inputActual: { izq: false, der: false, turbo: false },
        terminado:   false,
        puestoLlegada: null,
      });
    });

    // Elementos dinámicos (bellotas, obstáculos)
    this.objetos = [];
    this.proximoIdObjeto = 1;
    this.siguienteSpawnMs = 0;
    this.llegadosCount = 0;
  }

  iniciar() {
    // 1. Emitir pantalla de introducción y reglas
    this.io.to(this.roomCode).emit('minigame:intro', {
      minijuego: {
        id:             this.info.id,
        nombre:         this.info.nombre,
        subtitulo:      this.info.subtitulo,
        descripcion:    this.info.descripcion,
        controlesTexto: this.info.controlesTexto,
        tipoControl:    this.info.tipoControl,
        duracionSegundos: this.info.duracionSegundos,
      },
      jugadores: Array.from(this.jugadores.values()).map(j => ({
        playerId: j.playerId,
        nombre:   j.nombre,
        avatarId: j.avatarId,
        color:    j.color,
        carril:   j.carril,
      })),
      cuentaAtrasMs: 4000,
    });

    // 2. Cuenta atrás de 4 segundos antes de arrancar el bucle a 20 Hz
    this.introTimeout = setTimeout(() => {
      this.arrancarBucle();
    }, 4000);
  }

  arrancarBucle() {
    if (this.terminado) return;
    this.estado = 'JUGANDO';

    this.io.to(this.roomCode).emit('minigame:start', {
      minijuegoId:      this.info.id,
      duracionTotalMs:  this.duracionTotalMs,
    });

    // Bucle autoritativo a 20 Hz (50 ms)
    this.intervalLoop = setInterval(() => {
      this.tick();
    }, TICK_MS);
  }

  procesarInput(playerId, action, payload = {}) {
    if (this.estado !== 'JUGANDO') return;
    const jugador = this.jugadores.get(playerId);
    if (!jugador || jugador.tiempoStunMs > 0) return;

    if (this.info.id === 'carrera_guadiana') {
      // Inputs: 'remo_izq' o 'remo_der'
      if (action === 'remo_izq' || action === 'remo_der') {
        const lado = action === 'remo_izq' ? 'izq' : 'der';
        if (jugador.ultimoRemo && jugador.ultimoRemo !== lado) {
          // ¡Remada con ritmo perfecto! Aceleración máxima
          jugador.velocidad = Math.min(jugador.velocidad + 1.8, 14.0);
        } else {
          // Remada del mismo lado: impulso menor
          jugador.velocidad = Math.min(jugador.velocidad + 0.6, 9.0);
        }
        jugador.ultimoRemo = lado;
      }
    } else if (this.info.id === 'lluvia_bellotas') {
      // Inputs continuos: action='mover', payload={ dir: -1 | 0 | 1, turbo: bool }
      if (action === 'mover') {
        jugador.inputActual.izq = payload.dir < 0;
        jugador.inputActual.der = payload.dir > 0;
        jugador.inputActual.turbo = !!payload.turbo;
      } else if (action === 'tap_izq') {
        jugador.posicionX = Math.max(-7.5, jugador.posicionX - 1.2);
      } else if (action === 'tap_der') {
        jugador.posicionX = Math.min(7.5, jugador.posicionX + 1.2);
      }
    }
  }

  tick() {
    if (this.terminado) return;

    const dt = TICK_MS / 1000; // 0.05 s
    this.tiempoRestanteMs = Math.max(0, this.tiempoRestanteMs - TICK_MS);

    // Actualizar física específica del minijuego
    if (this.info.id === 'carrera_guadiana') {
      this.tickCarreraGuadiana(dt);
    } else if (this.info.id === 'lluvia_bellotas') {
      this.tickLluviaBellotas(dt);
    }

    // Emitir snapshot de estado a 20 Hz a todos los clientes de la sala
    this.io.to(this.roomCode).emit('minigame:state', {
      minijuegoId:      this.info.id,
      tiempoRestanteMs: this.tiempoRestanteMs,
      jugadores: Array.from(this.jugadores.values()).map(j => ({
        playerId:      j.playerId,
        nombre:        j.nombre,
        color:         j.color,
        carril:        j.carril,
        posicionX:     Math.round(j.posicionX * 100) / 100,
        posicionY:     Math.round(j.posicionY * 100) / 100,
        velocidad:     Math.round(j.velocidad * 100) / 100,
        puntos:        j.puntos,
        puestoLlegada: j.puestoLlegada,
        tiempoStunMs:  j.tiempoStunMs,
      })),
      objetos: this.objetos.map(o => ({
        id:   o.id,
        tipo: o.tipo,
        x:    Math.round(o.x * 100) / 100,
        y:    Math.round(o.y * 100) / 100,
      })),
    });

    // Condición de fin: se agotó el tiempo o todos terminaron
    const tiempoAgotado = this.tiempoRestanteMs <= 0;
    const todosTerminaron = this.info.id === 'carrera_guadiana' && this.llegadosCount >= this.jugadores.size;

    if (tiempoAgotado || todosTerminaron) {
      this.concluir();
    }
  }

  // ─── Física: Carrera Guadiana ───────────────────────────────────────────────
  tickCarreraGuadiana(dt) {
    const META_X = 100;

    this.jugadores.forEach(j => {
      if (j.terminado) return;

      // Fricción del agua
      j.velocidad = Math.max(0, j.velocidad * Math.pow(0.965, dt * 20));
      j.posicionX += j.velocidad * dt * 4;

      // Meta alcanzada
      if (j.posicionX >= META_X) {
        j.posicionX = META_X;
        j.terminado = true;
        this.llegadosCount++;
        j.puestoLlegada = this.llegadosCount;
        j.puntos = Math.max(0, 100 - (this.llegadosCount - 1) * 25);
      }
    });
  }

  // ─── Física: Lluvia de Bellotas ─────────────────────────────────────────────
  tickLluviaBellotas(dt) {
    // 1. Mover jugadores según inputs
    this.jugadores.forEach(j => {
      if (j.tiempoStunMs > 0) {
        j.tiempoStunMs = Math.max(0, j.tiempoStunMs - TICK_MS);
        return;
      }

      let speed = j.inputActual.turbo ? 9.5 : 5.8;
      if (j.inputActual.izq) {
        j.posicionX = Math.max(-7.5, j.posicionX - speed * dt);
      }
      if (j.inputActual.der) {
        j.posicionX = Math.min(7.5, j.posicionX + speed * dt);
      }
    });

    // 2. Spawnear bellotas periódicamente (cada ~350-500 ms)
    this.siguienteSpawnMs -= TICK_MS;
    if (this.siguienteSpawnMs <= 0) {
      this.siguienteSpawnMs = 380 + Math.random() * 200;
      const rand = Math.random();
      let tipo = 'normal'; // +1
      if (rand < 0.22) tipo = 'dorada'; // +3
      else if (rand < 0.42) tipo = 'piedra'; // -2

      this.objetos.push({
        id:   this.proximoIdObjeto++,
        tipo,
        x:    -7.0 + Math.random() * 14.0,
        y:    11.0, // altura inicial
        vy:   5.0 + Math.random() * 3.5, // velocidad de caída
      });
    }

    // 3. Mover objetos y detectar colisiones con jugadores
    const objetosRestantes = [];
    const SUELO_Y = 0.8;
    const RADIO_COLISION = 1.35;

    for (const obj of this.objetos) {
      obj.y -= obj.vy * dt;

      let recogido = false;
      for (const j of this.jugadores.values()) {
        const dx = Math.abs(j.posicionX - obj.x);
        const dy = Math.abs(SUELO_Y - obj.y);

        if (dx < RADIO_COLISION && dy < 1.1) {
          recogido = true;
          if (obj.tipo === 'dorada') {
            j.puntos += 3;
          } else if (obj.tipo === 'normal') {
            j.puntos += 1;
          } else if (obj.tipo === 'piedra') {
            j.puntos = Math.max(0, j.puntos - 2);
            j.tiempoStunMs = 700; // 0.7s aturdido
          }
          break;
        }
      }

      if (!recogido && obj.y > 0) {
        objetosRestantes.push(obj);
      }
    }
    this.objetos = objetosRestantes;
  }

  // ─── Conclusión del Minijuego ──────────────────────────────────────────────
  concluir() {
    if (this.terminado) return;
    this.terminado = true;
    if (this.intervalLoop) {
      clearInterval(this.intervalLoop);
      this.intervalLoop = null;
    }
    this.estado = 'RESULTADOS';

    // Ordenar clasificación
    let clasificacion = Array.from(this.jugadores.values());
    if (this.info.id === 'carrera_guadiana') {
      clasificacion.sort((a, b) => {
        if (a.puestoLlegada && b.puestoLlegada) return a.puestoLlegada - b.puestoLlegada;
        if (a.puestoLlegada) return -1;
        if (b.puestoLlegada) return 1;
        return b.posicionX - a.posicionX;
      });
    } else {
      clasificacion.sort((a, b) => b.puntos - a.puntos);
    }

    // Asignar premios de monedas
    const resultados = clasificacion.map((j, i) => {
      const monedasGanadas = MONEDAS_POR_PUESTO[i] || 1;
      return {
        puesto:         i + 1,
        playerId:       j.playerId,
        nombre:         j.nombre,
        avatarId:       j.avatarId,
        color:          j.color,
        puntos:         this.info.id === 'carrera_guadiana' ? `${Math.round(j.posicionX)}m` : `${j.puntos} pts`,
        monedasGanadas,
      };
    });

    // Emitir resultados a clientes
    this.io.to(this.roomCode).emit('minigame:results', {
      minijuegoId:   this.info.id,
      nombre:        this.info.nombre,
      clasificacion: resultados,
      duracionMs:    4500,
    });

    // Tras mostrar podio 4.5 segundos, llamar al callback para retornar al tablero
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
    minijuegosActivos.delete(this.roomCode);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// API PÚBLICA DEL GESTOR
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Selecciona un minijuego aleatorio del catálogo o uno específico por ID.
 * @param {string|null} idEspecifico
 * @returns {object}
 */
function seleccionarMinijuego(idEspecifico = null) {
  if (idEspecifico) {
    const encontrado = CATALOGO_MINIJUEGOS.find(m => m.id === idEspecifico);
    if (encontrado) return encontrado;
  }
  const idx = Math.floor(Math.random() * CATALOGO_MINIJUEGOS.length);
  return CATALOGO_MINIJUEGOS[idx];
}

/**
 * Inicia una sesión de minijuego autoritativo para la sala especificada.
 * @param {string} roomCode
 * @param {Array} jugadores
 * @param {object} io - Instancia de Socket.io
 * @param {Function} onFinalizado - Callback que recibe (resultadosConMonedas)
 * @param {string|null} idMinijuego
 * @returns {MinijuegoActivo}
 */
function iniciarMinijuego(roomCode, jugadores, io, onFinalizado, idMinijuego = null) {
  const codigo = (roomCode || '').toUpperCase().trim();

  // Limpiar minijuego previo si existiera
  limpiarMinijuego(codigo);

  const infoMinijuego = seleccionarMinijuego(idMinijuego);
  const instancia = new MinijuegoActivo(codigo, infoMinijuego, jugadores, io, onFinalizado);
  minijuegosActivos.set(codigo, instancia);

  instancia.iniciar();
  return instancia;
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
  const minijuego = minijuegosActivos.get(codigo);
  if (minijuego) {
    minijuego.procesarInput(playerId, action, payload);
  }
}

/**
 * Obtiene la instancia activa de minijuego para una sala.
 * @param {string} roomCode
 * @returns {MinijuegoActivo|null}
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
  const minijuego = minijuegosActivos.get(codigo);
  if (minijuego) {
    minijuego.destruir();
  }
  minijuegosActivos.delete(codigo);
}

module.exports = {
  TICK_RATE_HZ,
  TICK_MS,
  CATALOGO_MINIJUEGOS,
  seleccionarMinijuego,
  iniciarMinijuego,
  procesarInputMinijuego,
  getMinijuegoActivo,
  limpiarMinijuego,
};
