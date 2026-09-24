/**
 * src/boardManager.js — Lógica autoritativa del Tablero 3D y Sistema de Turnos
 *
 * RESPONSABILIDADES:
 * - Definir la topología del circuito de casillas (grafo 3D inspirado en Badajoz).
 * - Gestionar el estado de la partida: orden de turnos, ronda actual, saldos de monedas y soles.
 * - Simular movimientos autoritativos casilla a casilla con soporte para bifurcaciones.
 * - Aplicar los efectos de las casillas (Azul: +3, Roja: -3, Eventos de Badajoz, Minijuego).
 * - Controlar el temporizador de turno anti-bloqueo (30 segundos máximo por tirada).
 */

'use strict';

// ─── CONSTANTES DEL JUEGO ─────────────────────────────────────────────────────

const MONEDAS_INICIALES    = 10;
const SOLES_INICIALES      = 0;
const MAX_RONDAS           = 10;
const PRECIO_SOL           = 20; // Monedas necesarias para comprar un Sol de Badajoz
const TIMEOUT_TURNO_MS     = 30000; // 30 segundos para tirar antes de auto-tirada
const TIEMPO_ANIMACION_DADO_MS = 2200; // Duración de la animación del dado 3D

/**
 * Catálogo de eventos típicos de Badajoz para las casillas de Evento
 */
const EVENTOS_BADAJOZ = [
  {
    id: 'tostada_cachuela',
    titulo: '¡Desayuno en San Roque!',
    descripcion: 'Te tomas una buena tostada con cachuela y café. ¡Lleno de energía!',
    efecto: 'monedas',
    cantidad: 4,
  },
  {
    id: 'perrunilla',
    titulo: '¡Perrunillas del convento!',
    descripcion: 'Las monjas te regalan una caja de dulces tradicionales.',
    efecto: 'monedas',
    cantidad: 5,
  },
  {
    id: 'tropezon_alcazaba',
    titulo: '¡Tropezón en la Alcazaba!',
    descripcion: 'Un resbalón en el adoquín te hace perder unas cuantas monedas.',
    efecto: 'monedas',
    cantidad: -3,
  },
  {
    id: 'carnaval_disfraz',
    titulo: '¡Premio en el Carnaval!',
    descripcion: 'Tu comparsa gana una mención de honor en el desfile de Badajoz.',
    efecto: 'monedas',
    cantidad: 6,
  },
  {
    id: 'cambio_viento',
    titulo: '¡Viento del Guadiana!',
    descripcion: 'Una fuerte ráfaga cruza el río e intercambia tu posición con otro jugador.',
    efecto: 'intercambio_posicion',
  },
];

/**
 * Topología del Tablero: Grafo de 24 casillas en circuito cerrado con bifurcación.
 *
 * Coordenadas (X, Z) en espacio de mundo 3D ( Three.js ):
 * El río Guadiana fluye aproximadamente a lo largo del eje X (Z cerca de 0).
 *
 * BIFURCACIÓN:
 * - En casilla 6 (acceso al Puente Real / Muralla):
 *   * Rama A (rápida, cruza el río directo por el puente): 6 -> 7 -> 8 -> 11
 *   * Rama B (panorámica por la Alcazaba y murallas): 6 -> 9 -> 10 -> 11
 * Ambas ramas convergen en la casilla 11.
 */
const GRAFO_CASILLAS = [
  // ── Margen Sur: Plaza Alta y Casco Antiguo (Casillas 0 - 5)
  { id: 0,  x: -18, z: 14,  tipo: 'inicio',   nombre: 'Plaza Alta (Salida)',       siguientes: [1] },
  { id: 1,  x: -12, z: 16,  tipo: 'azul',     nombre: 'Calle San Juan',            siguientes: [2] },
  { id: 2,  x: -6,  z: 17,  tipo: 'roja',     nombre: 'Cuesta de Castelar',        siguientes: [3] },
  { id: 3,  x: 0,   z: 16,  tipo: 'azul',     nombre: 'Plaza de España',           siguientes: [4] },
  // ☀️ Casilla Sol de Badajoz — compra un sol si tienes ≥20 monedas
  { id: 4,  x: 6,   z: 15,  tipo: 'sol',      nombre: 'Feria de San Juan ☀️',      siguientes: [5] },
  { id: 5,  x: 12,  z: 13,  tipo: 'azul',     nombre: 'Baluarte de San Roque',     siguientes: [6] },

  // ── Casilla de Bifurcación (Casilla 6)
  {
    id: 6,
    x: 17,
    z: 10,
    tipo: 'bifurcacion',
    nombre: 'Cruce del Puente Real',
    siguientes: [7, 9], // 7 = Puente Real, 9 = Paseo Fluvial
    bifurcacionNombres: { 7: 'Cruzar por el Puente Real', 9: 'Rodeo por la Muralla' }
  },

  // ── Rama A: El Puente Real (directo, cruza el Guadiana) (Casillas 7 - 8)
  { id: 7,  x: 18, z: 2,   tipo: 'azul',     nombre: 'Puente Real (Pilar Sur)',   siguientes: [8] },
  { id: 8,  x: 17, z: -6,  tipo: 'evento',   nombre: 'Puente Real (Pilar Norte)', siguientes: [11] },

  // ── Rama B: Paseo Fluvial y Muralla (Casillas 9 - 10)
  { id: 9,  x: 23, z: 7,   tipo: 'minijuego',nombre: 'Ribera del Guadiana',       siguientes: [10] },
  { id: 10, x: 22, z: -3,  tipo: 'roja',     nombre: 'Punta del Azud',            siguientes: [11] },

  // ── Punto de convergencia — ☀️ Casilla Sol central
  { id: 11, x: 14, z: -12, tipo: 'sol',      nombre: 'Monumento al Sol ☀️',       siguientes: [12] },

  // ── Margen Norte: Hacia la Puerta de Palmas (Casillas 12 - 17)
  { id: 12, x: 8,   z: -16, tipo: 'roja',     nombre: 'Avenida de Elvas',          siguientes: [13] },
  { id: 13, x: 2,   z: -17, tipo: 'azul',     nombre: 'Baluarte de San Vicente',   siguientes: [14] },
  { id: 14, x: -4,  z: -17, tipo: 'minijuego',nombre: 'Embarcadero del Guadiana',  siguientes: [15] },
  { id: 15, x: -10, z: -16, tipo: 'evento',   nombre: 'Jardines de la Galera',     siguientes: [16] },
  { id: 16, x: -16, z: -14, tipo: 'azul',     nombre: 'Puerta de Palmas',          siguientes: [17] },
  // ☀️ Casilla Sol de Badajoz — zona norte
  { id: 17, x: -21, z: -9,  tipo: 'sol',      nombre: 'Puente de Palmas ☀️',       siguientes: [18] },

  // ── Zona Oeste: La Alcazaba y Espantaperros (Casillas 18 - 21)
  { id: 18, x: -23, z: -2,  tipo: 'azul',     nombre: 'Cuesta de la Alcazaba',     siguientes: [19] },
  { id: 19, x: -24, z: 4,   tipo: 'minijuego',nombre: 'Torre de Espantaperros',    siguientes: [20] },
  { id: 20, x: -22, z: 9,   tipo: 'evento',   nombre: 'Muralla Abaluartada',       siguientes: [21] },
  { id: 21, x: -19, z: 12,  tipo: 'azul',     nombre: 'Plaza Alta (Entrada)',      siguientes: [0] },
];

/** Mapa de búsqueda rápida de casilla por ID */
const MAPA_CASILLAS = new Map(GRAFO_CASILLAS.map(c => [c.id, c]));

// ─── ALMACÉN DE PARTIDAS ──────────────────────────────────────────────────────

/** Mapa: codigoSala -> ObjetoPartida */
const partidas = new Map();

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Mezcla aleatoriamente un array (Fisher-Yates) para determinar el orden de turnos.
 * @param {Array} arr
 * @returns {Array} nuevo array mezclado
 */
function mezclarArray(arr) {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Genera un número de dado del 1 al 6 de forma autoritativa.
 * @returns {number}
 */
function generarTiradaDado() {
  return Math.floor(Math.random() * 6) + 1;
}

// ─── GESTIÓN DE PARTIDA ───────────────────────────────────────────────────────

/**
 * Inicializa la partida en el tablero para una sala concreta.
 * @param {string} roomCode
 * @param {Array<object>} jugadoresSala Lista de jugadores del roomManager
 * @returns {object} Estado inicial del tablero
 */
function iniciarPartidaTablero(roomCode, jugadoresSala) {
  const codigo = (roomCode || '').toUpperCase().trim();

  // Filtrar jugadores válidos conectados
  const listaJugadores = jugadoresSala.filter(j => j && j.playerId);
  if (listaJugadores.length < 2) {
    throw new Error('Se requieren al menos 2 jugadores para iniciar el tablero.');
  }

  // Orden aleatorio de turnos
  const idsJugadores = listaJugadores.map(j => j.playerId);
  const ordenTurnos  = mezclarArray(idsJugadores);

  // Inicializar estado de cada jugador en el tablero
  const estadoJugadores = new Map();
  for (const j of listaJugadores) {
    estadoJugadores.set(j.playerId, {
      playerId:         j.playerId,
      nombre:           j.nombre,
      avatarId:         j.avatarId,
      color:            j.color,
      nombreColor:      j.nombreColor,
      casillaActualId:  0, // Salen desde la Casilla 0 (Plaza Alta)
      monedas:          MONEDAS_INICIALES,
      soles:            SOLES_INICIALES,
      pasosRestantes:   0,
      estadoTurno:      'ESPERANDO', // 'TURNO_DADO' | 'MOVIENDO' | 'ELIGE_BIFURCACION' | 'ESPERANDO'
    });
  }

  const partida = {
    roomCode:             codigo,
    rondaActual:          1,
    maxRondas:            MAX_RONDAS,
    ordenTurnos,          // [playerId1, playerId2, ...]
    turnoIndex:           0, // Índice en ordenTurnos
    estadoJugadores,      // Map(playerId -> datos)
    ultimoDado:           null,
    bifurcacionPendiente: null, // { playerId, casillaId, opciones: [id1, id2] }
    temporizadorTurno:    null, // Handle del timer anti-bloqueo
    enMovimiento:         false,
    historialUltimoEfecto:null,
  };

  partidas.set(codigo, partida);

  // Marcar al primer jugador en turno
  const primerPlayerId = ordenTurnos[0];
  const primerJugador  = estadoJugadores.get(primerPlayerId);
  primerJugador.estadoTurno = 'TURNO_DADO';

  return obtenerEstadoTablero(codigo);
}

/**
 * Obtiene la partida activa de una sala.
 * @param {string} roomCode
 * @returns {object|null}
 */
function getPartida(roomCode) {
  return partidas.get((roomCode || '').toUpperCase().trim()) || null;
}

/**
 * Devuelve el objeto del jugador activo en este momento.
 * @param {string} roomCode
 * @returns {object|null}
 */
function getJugadorActivo(roomCode) {
  const partida = getPartida(roomCode);
  if (!partida) return null;
  const playerIdActivo = partida.ordenTurnos[partida.turnoIndex];
  return partida.estadoJugadores.get(playerIdActivo) || null;
}

/**
 * Procesa la tirada de dado del jugador activo.
 * @param {string} roomCode
 * @param {string} playerId
 * @param {number|null} valorForzado (solo para tests unitarios / depuración)
 * @returns {{ ok: boolean, error?: string, valor?: number, jugador?: object }}
 */
function tirarDado(roomCode, playerId, valorForzado = null) {
  const partida = getPartida(roomCode);
  if (!partida) return { ok: false, error: 'Partida no encontrada' };

  const jugadorActivo = getJugadorActivo(roomCode);
  if (!jugadorActivo || jugadorActivo.playerId !== playerId) {
    return { ok: false, error: 'No es tu turno de tirar el dado' };
  }

  if (jugadorActivo.estadoTurno !== 'TURNO_DADO') {
    return { ok: false, error: 'El dado ya ha sido lanzado en este turno' };
  }

  // Cancelar temporizador de inactividad
  if (partida.temporizadorTurno) {
    clearTimeout(partida.temporizadorTurno);
    partida.temporizadorTurno = null;
  }

  const valor = valorForzado && valorForzado >= 1 && valorForzado <= 6
    ? valorForzado
    : generarTiradaDado();

  partida.ultimoDado = valor;
  jugadorActivo.pasosRestantes = valor;
  jugadorActivo.estadoTurno    = 'MOVIENDO';
  partida.enMovimiento         = true;

  return {
    ok: true,
    valor,
    jugador: jugadorActivo,
    tiempoAnimacionMs: TIEMPO_ANIMACION_DADO_MS,
  };
}

/**
 * Calcula el siguiente paso del peón en el tablero.
 * Maneja avances lineales y bifurcaciones.
 *
 * @param {string} roomCode
 * @param {string} playerId
 * @param {number|null} bifurcacionElegidaId Si el jugador está eligiendo en una bifurcación
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   tipo: 'PASO' | 'BIFURCACION' | 'LLEGADA',
 *   casillaActual?: object,
 *   pasosRestantes?: number,
 *   opcionesBifurcacion?: Array<object>,
 *   efectoCasilla?: object
 * }}
 */
function procesarPasoMovimiento(roomCode, playerId, bifurcacionElegidaId = null) {
  const partida = getPartida(roomCode);
  if (!partida) return { ok: false, error: 'Partida no encontrada' };

  const jugador = partida.estadoJugadores.get(playerId);
  if (!jugador) return { ok: false, error: 'Jugador no encontrado' };

  if (jugador.pasosRestantes <= 0) {
    return { ok: false, error: 'No quedan pasos por mover' };
  }

  const casillaActual = MAPA_CASILLAS.get(jugador.casillaActualId);
  if (!casillaActual) return { ok: false, error: 'Casilla actual no válida' };

  let siguienteId;

  // Si la casilla actual es una bifurcación y tiene múltiples salidas:
  if (casillaActual.siguientes.length > 1) {
    if (bifurcacionElegidaId !== null) {
      // El jugador ya eligió una rama válida
      if (!casillaActual.siguientes.includes(bifurcacionElegidaId)) {
        return { ok: false, error: 'Opción de bifurcación no permitida' };
      }
      siguienteId = bifurcacionElegidaId;
      partida.bifurcacionPendiente = null;
      jugador.estadoTurno = 'MOVIENDO';
    } else {
      // Detener avance momentáneo y solicitar elección al jugador
      jugador.estadoTurno = 'ELIGE_BIFURCACION';
      partida.bifurcacionPendiente = {
        playerId,
        casillaId: casillaActual.id,
        opciones: casillaActual.siguientes.map(id => ({
          casillaId: id,
          nombre: MAPA_CASILLAS.get(id)?.nombre || `Casilla ${id}`,
          tipo: MAPA_CASILLAS.get(id)?.tipo || 'azul',
          descripcion: casillaActual.bifurcacionNombres?.[id] || `Ir por casilla ${id}`,
        })),
      };

      return {
        ok: true,
        tipo: 'BIFURCACION',
        casillaActual,
        pasosRestantes: jugador.pasosRestantes,
        opcionesBifurcacion: partida.bifurcacionPendiente.opciones,
      };
    }
  } else {
    siguienteId = casillaActual.siguientes[0];
  }

  // Avanzar a la siguiente casilla
  jugador.casillaActualId = siguienteId;
  jugador.pasosRestantes -= 1;

  const nuevaCasilla = MAPA_CASILLAS.get(siguienteId);

  // ¿Ha llegado a su casilla de destino final?
  if (jugador.pasosRestantes === 0) {
    jugador.estadoTurno = 'CASILLA_EFECTO';
    partida.enMovimiento = false;
    const efecto = resolverEfectoCasilla(partida, jugador, nuevaCasilla);
    partida.historialUltimoEfecto = efecto;

    return {
      ok: true,
      tipo: 'LLEGADA',
      casillaActual: nuevaCasilla,
      pasosRestantes: 0,
      efectoCasilla: efecto,
    };
  }

  return {
    ok: true,
    tipo: 'PASO',
    casillaActual: nuevaCasilla,
    pasosRestantes: jugador.pasosRestantes,
  };
}

/**
 * Resuelve y aplica de manera autoritativa el efecto de la casilla en la que se aterriza.
 * @param {object} partida
 * @param {object} jugador
 * @param {object} casilla
 * @returns {object} Detalles del efecto para feedback visual
 */
function resolverEfectoCasilla(partida, jugador, casilla) {
  let deltaMonedas = 0;
  let deltaSoles   = 0;
  let eventoDesc = '';
  let titulo = '';

  switch (casilla.tipo) {
    case 'azul':
    case 'inicio':
      deltaMonedas = 3;
      titulo = '¡Casilla Azul!';
      eventoDesc = '+3 monedas para tu saca.';
      jugador.monedas += deltaMonedas;
      break;

    case 'roja': {
      deltaMonedas = -3;
      titulo = '¡Casilla Roja!';
      const monedasPerdidas = Math.min(jugador.monedas, 3);
      jugador.monedas = Math.max(0, jugador.monedas - 3);
      eventoDesc = `Pierdes ${monedasPerdidas} monedas.`;
      break;
    }

    case 'sol': {
      // Comprar un Sol de Badajoz si el jugador tiene suficientes monedas
      if (jugador.monedas >= PRECIO_SOL) {
        jugador.monedas -= PRECIO_SOL;
        jugador.soles   += 1;
        deltaSoles    = 1;
        deltaMonedas  = -PRECIO_SOL;
        titulo     = '☀️ ¡Sol de Badajoz!';
        eventoDesc = `¡Compraste un Sol por ${PRECIO_SOL} monedas! Total: ${jugador.soles} sol(es).`;
      } else {
        // Si no tiene suficiente: +2 monedas de consuelo
        deltaMonedas = 2;
        jugador.monedas += deltaMonedas;
        titulo     = '☀️ Casilla Sol (sin fondos)';
        eventoDesc = `Necesitas ${PRECIO_SOL} monedas para un Sol. ¡+2 monedas!`;
      }
      break;
    }

    case 'minijuego':
      deltaMonedas = 5;
      titulo = '¡Casilla Minijuego Bonus!';
      eventoDesc = '¡Práctica para la ronda! Recibes +5 monedas.';
      jugador.monedas += deltaMonedas;
      break;

    case 'evento': {
      // Elegir un evento pacense al azar
      const ev = EVENTOS_BADAJOZ[Math.floor(Math.random() * EVENTOS_BADAJOZ.length)];
      titulo = ev.titulo;

      if (ev.efecto === 'monedas') {
        deltaMonedas = ev.cantidad;
        if (deltaMonedas > 0) {
          jugador.monedas += deltaMonedas;
          eventoDesc = `${ev.descripcion} (+${deltaMonedas} monedas)`;
        } else {
          const perdidas = Math.min(jugador.monedas, Math.abs(deltaMonedas));
          jugador.monedas = Math.max(0, jugador.monedas + deltaMonedas);
          eventoDesc = `${ev.descripcion} (-${perdidas} monedas)`;
        }
      } else if (ev.efecto === 'intercambio_posicion') {
        // Intercambiar posición con otro jugador aleatorio
        const otros = Array.from(partida.estadoJugadores.values())
          .filter(j => j.playerId !== jugador.playerId);

        if (otros.length > 0) {
          const elegido = otros[Math.floor(Math.random() * otros.length)];
          const posTemp = jugador.casillaActualId;
          jugador.casillaActualId = elegido.casillaActualId;
          elegido.casillaActualId = posTemp;
          eventoDesc = `${ev.descripcion} ¡Cambias posición con ${elegido.nombre}!`;
        } else {
          eventoDesc = ev.descripcion;
        }
      }
      break;
    }

    default:
      titulo = 'Casilla Neutral';
      eventoDesc = 'Un paseo tranquilo sin novedades.';
      break;
  }

  return {
    tipoCasilla: casilla.tipo,
    nombreCasilla: casilla.nombre,
    titulo,
    descripcion: eventoDesc,
    deltaMonedas,
    deltaSoles,
    monedasActuales: jugador.monedas,
    solesActuales: jugador.soles,
    casillaId: casilla.id,
    precioBol: PRECIO_SOL,
  };
}

/**
 * Pasa el turno al siguiente jugador de la lista.
 * Si todos los jugadores han jugado, incrementa la ronda.
 * @param {string} roomCode
 * @returns {{
 *   ok: boolean,
 *   siguientePlayerId?: string,
 *   rondaActual?: number,
 *   finRonda?: boolean,
 *   partidaTerminada?: boolean
 * }}
 */
function finalizarTurno(roomCode) {
  const partida = getPartida(roomCode);
  if (!partida) return { ok: false, error: 'Partida no encontrada' };

  // Limpiar estado del jugador anterior
  const jugadorAnteriorId = partida.ordenTurnos[partida.turnoIndex];
  const jugadorAnterior   = partida.estadoJugadores.get(jugadorAnteriorId);
  if (jugadorAnterior) {
    jugadorAnterior.estadoTurno    = 'ESPERANDO';
    jugadorAnterior.pasosRestantes = 0;
  }

  partida.ultimoDado            = null;
  partida.bifurcacionPendiente  = null;
  partida.enMovimiento          = false;
  partida.historialUltimoEfecto = null;

  // Siguiente turno
  partida.turnoIndex += 1;
  let finRonda = false;

  // ¿Completó la ronda completa de todos los jugadores?
  if (partida.turnoIndex >= partida.ordenTurnos.length) {
    partida.turnoIndex = 0;
    partida.rondaActual += 1;
    finRonda = true;
  }

  // ¿Se llegó al límite de rondas? (Fin de partida)
  const partidaTerminada = partida.rondaActual > partida.maxRondas;
  if (partidaTerminada) {
    return {
      ok: true,
      finRonda: true,
      partidaTerminada: true,
      rondaActual: partida.maxRondas,
      clasificacionFinal: obtenerClasificacionFinal(partida),
    };
  }

  // Activar al nuevo jugador
  const nuevoPlayerId = partida.ordenTurnos[partida.turnoIndex];
  const nuevoJugador  = partida.estadoJugadores.get(nuevoPlayerId);
  if (nuevoJugador) {
    nuevoJugador.estadoTurno = 'TURNO_DADO';
  }

  return {
    ok: true,
    siguientePlayerId: nuevoPlayerId,
    rondaActual: partida.rondaActual,
    finRonda,
    partidaTerminada: false,
  };
}

/**
 * Devuelve la clasificación de jugadores ordenada por Soles y luego Monedas.
 * @param {object} partida
 * @returns {Array<object>}
 */
function obtenerClasificacionFinal(partida) {
  const lista = Array.from(partida.estadoJugadores.values());
  return lista.sort((a, b) => {
    if (b.soles !== a.soles) return b.soles - a.soles;
    return b.monedas - a.monedas;
  });
}

/**
 * Devuelve el snapshot público completo del tablero para sincronizar clientes.
 * @param {string} roomCode
 * @returns {object|null}
 */
function obtenerEstadoTablero(roomCode) {
  const partida = getPartida(roomCode);
  if (!partida) return null;

  const jugadorActivo = getJugadorActivo(roomCode);

  return {
    roomCode:             partida.roomCode,
    rondaActual:          partida.rondaActual,
    maxRondas:            partida.maxRondas,
    rondasTotales:        partida.maxRondas,  // alias para compatibilidad con cliente
    ordenTurnos:          partida.ordenTurnos,
    turnoIndex:           partida.turnoIndex,
    playerIdActivo:       jugadorActivo ? jugadorActivo.playerId : null,
    ultimoDado:           partida.ultimoDado,
    enMovimiento:         partida.enMovimiento,
    bifurcacionPendiente: partida.bifurcacionPendiente,
    ultimoEfecto:         partida.historialUltimoEfecto,
    timeoutTurnoMs:       TIMEOUT_TURNO_MS,
    grafoCasillas:        GRAFO_CASILLAS,
    jugadores: Array.from(partida.estadoJugadores.values()).map(j => ({
      playerId:        j.playerId,
      nombre:          j.nombre,
      avatarId:        j.avatarId,
      color:           j.color,
      nombreColor:     j.nombreColor,
      casillaActualId: j.casillaActualId,
      monedas:         j.monedas,
      soles:           j.soles,
      pasosRestantes:  j.pasosRestantes,
      estadoTurno:     j.estadoTurno,
      esMiTurno:       jugadorActivo ? j.playerId === jugadorActivo.playerId : false,
    })),
  };
}

/**
 * Wrapper público de obtenerClasificacionFinal que acepta roomCode (string).
 * Compatible con la llamada desde server.js.
 * @param {string} roomCode
 * @returns {Array}
 */
function obtenerClasificacionFinalPorCodigo(roomCode) {
  const partida = getPartida(roomCode);
  if (!partida) return [];
  return obtenerClasificacionFinal(partida);
}

/**
 * Elimina la partida de memoria cuando se limpia la sala.
 * @param {string} roomCode
 */
function limpiarPartida(roomCode) {
  const codigo = (roomCode || '').toUpperCase().trim();
  const partida = partidas.get(codigo);
  if (partida && partida.temporizadorTurno) {
    clearTimeout(partida.temporizadorTurno);
  }
  partidas.delete(codigo);
}

/**
 * Suma (o resta) monedas a un jugador en la partida autoritativa.
 * Utilizado por el gestor de minijuegos (Fase 4).
 * @param {string} roomCode
 * @param {string} playerId
 * @param {number} cantidad
 * @returns {number} nuevo saldo de monedas
 */
function sumarMonedasJugador(roomCode, playerId, cantidad) {
  const partida = getPartida(roomCode);
  if (!partida) return 0;
  const jugador = partida.estadoJugadores.get(playerId);
  if (!jugador) return 0;
  jugador.monedas = Math.max(0, (jugador.monedas || 0) + cantidad);
  return jugador.monedas;
}

// ─── EXPORTACIONES ────────────────────────────────────────────────────────────

module.exports = {
  GRAFO_CASILLAS,
  MAPA_CASILLAS,
  EVENTOS_BADAJOZ,
  MONEDAS_INICIALES,
  SOLES_INICIALES,
  MAX_RONDAS,
  PRECIO_SOL,
  TIMEOUT_TURNO_MS,
  TIEMPO_ANIMACION_DADO_MS,
  iniciarPartidaTablero,
  getPartida,
  getJugadorActivo,
  tirarDado,
  procesarPasoMovimiento,
  finalizarTurno,
  obtenerEstadoTablero,
  obtenerClasificacionFinal: obtenerClasificacionFinalPorCodigo, // acepta roomCode
  limpiarPartida,
  sumarMonedasJugador,
};

