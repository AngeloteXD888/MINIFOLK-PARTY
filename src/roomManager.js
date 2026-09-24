/**
 * roomManager.js — Gestión del estado de salas de Badajoz Party
 *
 * ARQUITECTURA:
 * - Todo el estado del juego vive en este módulo (servidor autoritativo)
 * - Los clientes solo envían inputs y reciben snapshots del estado
 * - Tick rate para minijuegos: 20 Hz (50 ms) — preparado para Fase 4
 *
 * MÁQUINA DE ESTADOS DE PARTIDA:
 *   LOBBY → TABLERO → MINIJUEGO → RESULTADOS_RONDA → FIN
 *   (en Fase 1 solo se usa LOBBY)
 *
 * CÓDIGO DE SALA:
 * - 4 caracteres alfanuméricos en mayúsculas
 * - Sin caracteres ambiguos: excluye 0, O, 1, I, L
 */

'use strict';

// ─── Constantes ────────────────────────────────────────────────────────────────

/** Tick rate del bucle de estado para minijuegos en tiempo real (Fase 4+) */
const TICK_RATE_HZ = 20;
/** Intervalo del tick en milisegundos */
const TICK_MS = 1000 / TICK_RATE_HZ; // 50 ms

/** Caracteres permitidos: sin 0,O,1,I,L para evitar confusión visual */
const CHARS_CODIGO = 'BCDEFGHJKMNPQRSTUVWXYZ23456789';

const MAX_JUGADORES = 4;

/** Colores asignados por orden de entrada (hex) */
const COLORES_JUGADOR = ['#E63946', '#457BB5', '#2DC653', '#F4D03F'];
/** Nombres de color en español */
const NOMBRES_COLOR   = ['Rojo', 'Azul', 'Verde', 'Amarillo'];

// ─── Estado global ─────────────────────────────────────────────────────────────

/**
 * Mapa global de salas.
 * roomCode (string) → objeto sala
 * @type {Map<string, object>}
 */
const rooms = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Genera un código de sala de 4 caracteres único que no colisione con los existentes.
 * @returns {string}
 */
function generarCodigoSala() {
  let codigo;
  do {
    codigo = Array.from({ length: 4 }, () =>
      CHARS_CODIGO[Math.floor(Math.random() * CHARS_CODIGO.length)]
    ).join('');
  } while (rooms.has(codigo));
  return codigo;
}

/**
 * Genera un playerId único y opaco.
 * @returns {string}
 */
function generarPlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Crea una nueva sala vacía y la registra en el mapa global.
 * @returns {{ codigo: string, sala: object }}
 */
function crearSala() {
  const codigo = generarCodigoSala();
  const sala = {
    codigo,
    /** Estado de la máquina de estados */
    estado: 'LOBBY',
    /** socketId del dispositivo Pantalla, o null si no hay ninguno */
    pantallaSocketId: null,
    /** playerId del anfitrión original de la sala */
    anfitrionOriginalPlayerId: null,
    /** Lista ordenada de jugadores (orden de llegada = color) */
    jugadores: [],
    /** socketId → playerId (para resolución rápida en desconexión) */
    socketAJugador: new Map(),
    /** playerId → objeto jugador (para reconexión) */
    playerIdAJugador: new Map(),
    /** Timestamp de última actividad (para limpieza automática) */
    ultimaActividad: Date.now(),
  };
  rooms.set(codigo, sala);
  return { codigo, sala };
}

/**
 * Obtiene una sala por su código (en mayúsculas). Devuelve null si no existe.
 * @param {string} codigo
 * @returns {object|null}
 */
function getSala(codigo) {
  return rooms.get((codigo || '').toUpperCase().trim()) || null;
}

/**
 * Asigna el rol de Pantalla a un socket. Solo puede haber una Pantalla por sala.
 * @param {string} codigo
 * @param {string} socketId
 * @returns {{ ok: boolean, error?: string }}
 */
function asignarPantalla(codigo, socketId) {
  const sala = getSala(codigo);
  if (!sala) return { ok: false, error: 'Sala no encontrada' };
  if (sala.pantallaSocketId && sala.pantallaSocketId !== socketId) {
    return { ok: false, error: 'Esta sala ya tiene un dispositivo Pantalla' };
  }
  sala.pantallaSocketId = socketId;
  sala.ultimaActividad = Date.now();
  return { ok: true };
}

/**
 * Une un nuevo jugador a la sala.
 * El primer jugador en unirse es el anfitrión (puede iniciar la partida).
 * @param {string} codigo
 * @param {string} socketId
 * @returns {{ ok: boolean, error?: string, jugador?: object, playerId?: string }}
 */
function unirJugador(codigo, socketId) {
  const sala = getSala(codigo);
  if (!sala) return { ok: false, error: 'Sala no encontrada' };
  if (sala.jugadores.length >= MAX_JUGADORES) {
    return { ok: false, error: 'La sala está llena (máximo 4 jugadores)' };
  }

  const colorIndex  = sala.jugadores.length;
  const playerId    = generarPlayerId();
  const esAnfitrion = sala.jugadores.length === 0;

  if (esAnfitrion && !sala.anfitrionOriginalPlayerId) {
    sala.anfitrionOriginalPlayerId = playerId;
  }

  const jugador = {
    playerId,
    socketId,
    nombre:      null,
    avatarId:    null,
    color:       COLORES_JUGADOR[colorIndex],
    nombreColor: NOMBRES_COLOR[colorIndex],
    listo:       false,
    esAnfitrion,
    conectado:   true,
    rol:         'jugador',
  };

  sala.jugadores.push(jugador);
  sala.socketAJugador.set(socketId, playerId);
  sala.playerIdAJugador.set(playerId, jugador);
  sala.ultimaActividad = Date.now();

  return { ok: true, jugador, playerId };
}

/**
 * Reconecta un jugador existente con un nuevo socketId.
 * Llama a esto cuando el cliente envía join_room con su playerId guardado.
 * @param {string} codigo
 * @param {string} playerId
 * @param {string} nuevoSocketId
 * @returns {{ ok: boolean, error?: string, jugador?: object }}
 */
function reconectarJugador(codigo, playerId, nuevoSocketId) {
  const sala = getSala(codigo);
  if (!sala) return { ok: false, error: 'Sala no encontrada' };

  const jugador = sala.playerIdAJugador.get(playerId);
  if (!jugador) return { ok: false, error: 'Jugador no encontrado en esta sala' };

  // Eliminar el mapeo del socket antiguo
  if (jugador.socketId) {
    sala.socketAJugador.delete(jugador.socketId);
  }

  jugador.socketId  = nuevoSocketId;
  jugador.conectado = true;
  sala.socketAJugador.set(nuevoSocketId, playerId);
  sala.ultimaActividad = Date.now();

  // Restaurar anfitrionía al creador original o asegurar que haya un anfitrión conectado
  if (sala.anfitrionOriginalPlayerId === playerId) {
    for (const j of sala.jugadores) {
      j.esAnfitrion = (j.playerId === playerId);
    }
  } else if (!sala.jugadores.some(j => j.esAnfitrion && j.conectado)) {
    jugador.esAnfitrion = true;
  }

  return { ok: true, jugador };
}

/**
 * Reconecta el dispositivo Pantalla con un nuevo socketId.
 * Emite un evento de "pantalla reconectada" a los demás.
 * @param {string} codigo
 * @param {string} nuevoSocketId
 * @returns {{ ok: boolean, error?: string }}
 */
function reconectarPantalla(codigo, nuevoSocketId) {
  const sala = getSala(codigo);
  if (!sala) return { ok: false, error: 'Sala no encontrada' };

  // Permitir reconexión incluso si pantallaSocketId es null (se desconectó)
  // Si hay otro dispositivo conectado como pantalla, rechazar
  if (sala.pantallaSocketId && sala.pantallaSocketId !== nuevoSocketId) {
    return { ok: false, error: 'Ya hay otro dispositivo haciendo de Pantalla en esta sala' };
  }

  sala.pantallaSocketId = nuevoSocketId;
  sala.ultimaActividad  = Date.now();
  return { ok: true };
}

/**
 * Marca a un jugador o Pantalla como desconectado cuando su socket cierra.
 * NO elimina al jugador (para permitir reconexión posterior).
 *
 * @param {string} socketId
 * @returns {{ tipo: 'pantalla'|'jugador', codigo: string, playerId?: string, jugador?: object }|null}
 */
function desconectarSocket(socketId) {
  for (const [codigo, sala] of rooms) {
    // ¿Era la Pantalla?
    if (sala.pantallaSocketId === socketId) {
      sala.pantallaSocketId = null;
      sala.ultimaActividad  = Date.now();
      return { tipo: 'pantalla', codigo };
    }

    // ¿Era un Jugador?
    const playerId = sala.socketAJugador.get(socketId);
    if (playerId) {
      const jugador = sala.playerIdAJugador.get(playerId);
      if (jugador) {
        jugador.conectado = false;
        sala.socketAJugador.delete(socketId);
        sala.ultimaActividad = Date.now();

        // Si era el anfitrión y hay otros jugadores conectados, transferir anfitrionía
        if (jugador.esAnfitrion) {
          const siguiente = sala.jugadores.find(
            j => j.playerId !== playerId && j.conectado
          );
          if (siguiente) {
            jugador.esAnfitrion   = false;
            siguiente.esAnfitrion = true;
          }
        }

        return { tipo: 'jugador', codigo, playerId, jugador };
      }
    }
  }
  return null;
}

/**
 * Establece el nombre de un jugador (máx. 12 caracteres, sin blancos).
 * @param {string} codigo
 * @param {string} playerId
 * @param {string} nombre
 * @returns {{ ok: boolean, error?: string }}
 */
function setNombre(codigo, playerId, nombre) {
  const sala = getSala(codigo);
  if (!sala) return { ok: false, error: 'Sala no encontrada' };

  const jugador = sala.playerIdAJugador.get(playerId);
  if (!jugador) return { ok: false, error: 'Jugador no encontrado' };

  const nombreLimpio = (nombre || '').trim().slice(0, 12);
  if (!nombreLimpio) return { ok: false, error: 'El nombre no puede estar vacío' };

  jugador.nombre = nombreLimpio;
  sala.ultimaActividad = Date.now();
  return { ok: true };
}

/**
 * Asigna un avatar a un jugador. Rechaza si ya lo tiene otro jugador de la misma sala.
 * @param {string} codigo
 * @param {string} playerId
 * @param {string} avatarId
 * @returns {{ ok: boolean, error?: string }}
 */
function seleccionarAvatar(codigo, playerId, avatarId) {
  const sala = getSala(codigo);
  if (!sala) return { ok: false, error: 'Sala no encontrada' };

  // Comprobar que el avatar no está ocupado por OTRO jugador
  const ocupado = sala.jugadores.some(
    j => j.avatarId === avatarId && j.playerId !== playerId
  );
  if (ocupado) return { ok: false, error: 'Este avatar ya está ocupado por otro jugador' };

  const jugador = sala.playerIdAJugador.get(playerId);
  if (!jugador) return { ok: false, error: 'Jugador no encontrado' };

  jugador.avatarId = avatarId;
  sala.ultimaActividad = Date.now();
  return { ok: true };
}

/**
 * Marca o desmarca a un jugador como "listo".
 * Requiere que el jugador tenga nombre y avatar seleccionado.
 * @param {string} codigo
 * @param {string} playerId
 * @param {boolean} listo
 * @returns {{ ok: boolean, error?: string }}
 */
function setListo(codigo, playerId, listo) {
  const sala = getSala(codigo);
  if (!sala) return { ok: false, error: 'Sala no encontrada' };

  const jugador = sala.playerIdAJugador.get(playerId);
  if (!jugador) return { ok: false, error: 'Jugador no encontrado' };

  if (listo && (!jugador.nombre || !jugador.avatarId)) {
    return { ok: false, error: 'Debes elegir nombre y avatar antes de estar listo' };
  }

  jugador.listo = listo;
  sala.ultimaActividad = Date.now();
  return { ok: true };
}

/**
 * Comprueba si la partida puede empezar.
 * Condición: ≥2 jugadores listos, con nombre y avatar, y conectados.
 * @param {string} codigo
 * @returns {boolean}
 */
function puedeEmpezar(codigo) {
  const sala = getSala(codigo);
  if (!sala) return false;
  const listos = sala.jugadores.filter(
    j => j.listo && j.nombre && j.avatarId && j.conectado
  );
  return listos.length >= 2;
}

// ─── Dependencias de juego ───────────────────────────────────────────────────
const { obtenerEstadoTablero, limpiarPartida } = require('./boardManager');

/**
 * Devuelve el estado público de la sala (sin socketIds ni datos internos).
 * Este objeto es el que se emite a todos los clientes en el evento room:state.
 * @param {string} codigo
 * @returns {object|null}
 */
function getEstadoPublico(codigo) {
  const sala = getSala(codigo);
  if (!sala) return null;

  const estadoPublico = {
    codigo:       sala.codigo,
    estado:       sala.estado,
    tienePantalla: !!sala.pantallaSocketId,
    jugadores:    sala.jugadores.map(j => ({
      playerId:    j.playerId,
      nombre:      j.nombre,
      avatarId:    j.avatarId,
      color:       j.color,
      nombreColor: j.nombreColor,
      listo:       j.listo,
      esAnfitrion: j.esAnfitrion,
      conectado:   j.conectado,
    })),
    puedeEmpezar: puedeEmpezar(codigo),
  };

  // Si la sala está en juego, adjuntar snapshot del tablero 3D
  if (sala.estado === 'TABLERO') {
    estadoPublico.tablero = obtenerEstadoTablero(codigo);
  }

  return estadoPublico;
}

/**
 * Elimina salas inactivas o completamente vacías.
 * Se llama periódicamente desde server.js.
 * @param {number} minutosInactividad - Tiempo máximo de inactividad en minutos
 */
function limpiarSalasInactivas(minutosInactividad = 30) {
  const ahora  = Date.now();
  const limite = minutosInactividad * 60 * 1000;
  let eliminadas = 0;

  for (const [codigo, sala] of rooms) {
    const inactiva    = ahora - sala.ultimaActividad > limite;
    const totallyEmpty = sala.jugadores.length === 0 && !sala.pantallaSocketId;

    if (inactiva || totallyEmpty) {
      limpiarPartida(codigo);
      rooms.delete(codigo);
      eliminadas++;
    }
  }

  if (eliminadas > 0) {
    console.log(`[Salas] ${eliminadas} sala(s) inactiva(s) eliminada(s). Salas activas: ${rooms.size}`);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  /** Expuesto para tests e inspección; no modificar directamente */
  rooms,
  TICK_RATE_HZ,
  TICK_MS,
  MAX_JUGADORES,
  crearSala,
  getSala,
  asignarPantalla,
  unirJugador,
  reconectarJugador,
  reconectarPantalla,
  desconectarSocket,
  setNombre,
  seleccionarAvatar,
  setListo,
  puedeEmpezar,
  getEstadoPublico,
  limpiarSalasInactivas,
};
