/**
 * server.js — Servidor principal de Badajoz Party
 *
 * RESPONSABILIDADES:
 * - Servir archivos estáticos de /public (Express)
 * - Generar QR de sala vía HTTP (GET /qr/:roomCode)
 * - Gestionar toda la comunicación en tiempo real (Socket.io)
 * - Validar contraseña maestra en el middleware de Socket.io (NUNCA en el cliente)
 * - Aplicar límite de intentos por socket (no por IP)
 * - Limpiar salas inactivas periódicamente
 *
 * SEGURIDAD:
 * - La contraseña vive solo en MASTER_PASSWORD (variable de entorno)
 * - Límite: MAX_INTENTOS_CONTRASENA intentos por socket antes de bloquear
 * - No se bloquea por IP (varios jugadores pueden compartir el mismo WiFi)
 *
 * TICK RATE: 20 Hz (50 ms) — preparado para el bucle de minijuegos en Fase 4
 */

'use strict';

require('dotenv').config();

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const QRCode   = require('qrcode');
const path     = require('path');

const {
  rooms,
  TICK_RATE_HZ,
  TICK_MS,
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
} = require('./src/roomManager');

// ─── Validación de entorno ────────────────────────────────────────────────────

const PORT              = process.env.PORT || 3000;
const MASTER_PASSWORD   = process.env.MASTER_PASSWORD;
const PUBLIC_URL        = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const ROOM_CLEANUP_MIN  = parseInt(process.env.ROOM_CLEANUP_MINUTES || '30', 10);

/** Máximo de intentos de contraseña incorrecta por socket antes de bloquearlo */
const MAX_INTENTOS_CONTRASENA = 5;

if (!MASTER_PASSWORD) {
  console.error(
    '\n[ERROR FATAL] La variable de entorno MASTER_PASSWORD no está definida.' +
    '\nCrea un archivo .env basándote en .env.example y define MASTER_PASSWORD.\n'
  );
  process.exit(1);
}

// ─── Express ─────────────────────────────────────────────────────────────────

const app    = express();
const server = http.createServer(app);

// Servir archivos estáticos de /public
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

/**
 * GET /health
 * Endpoint de salud para el health check de Render.
 */
app.get('/health', (_req, res) => {
  res.json({ ok: true, salas: rooms.size, timestamp: Date.now() });
});

/**
 * GET /qr/:roomCode
 * Genera y devuelve el QR de una sala como data URL PNG base64.
 * La URL embebida en el QR incluye el código de sala: /?room=XXXX
 *
 * Responde con: { qr: "data:image/png;base64,...", url: "https://..." }
 */
app.get('/qr/:roomCode', async (req, res) => {
  const codigo = (req.params.roomCode || '').toUpperCase().trim();
  const sala   = getSala(codigo);

  if (!sala) {
    return res.status(404).json({ error: 'Sala no encontrada' });
  }

  // URL que se codifica en el QR — incluye el código de sala para auto-rellenarlo
  const url = `${PUBLIC_URL}/?room=${codigo}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      width:  280,
      margin: 2,
      color:  {
        dark:  '#1a1a2e', // color de los módulos QR
        light: '#f5f0e8', // fondo del QR
      },
    });
    res.json({ qr: qrDataUrl, url });
  } catch (err) {
    console.error('[QR] Error generando QR:', err);
    res.status(500).json({ error: 'Error generando el código QR' });
  }
});

// ─── Socket.io ───────────────────────────────────────────────────────────────

const io = new Server(server, {
  cors: {
    origin:  '*',
    methods: ['GET', 'POST'],
  },
  // Sin connectionStateRecovery: usamos reconexión manual por playerId
  // para tener control total y compatibilidad con el sistema de salas
});

/**
 * Mapa de intentos de contraseña por socket.
 * socketId → número de intentos fallidos
 * Se limpia al desconectarse.
 */
const intentosPorSocket = new Map();

// ─── Middleware de autenticación ─────────────────────────────────────────────

/**
 * Valida la contraseña maestra en el handshake de Socket.io.
 * Límite: MAX_INTENTOS_CONTRASENA intentos por socket (no por IP).
 *
 * El cliente envía: io(url, { auth: { password: '...' } })
 * Nunca aparece en el código del cliente que la contraseña correcta es X.
 */
io.use((socket, next) => {
  const { password } = socket.handshake.auth || {};

  // Recuperar o inicializar el contador de intentos para este socket
  // Nota: en el primer intento, socket.id ya está asignado pero la conexión aún no se acepta
  const socketKey = socket.handshake.address + '_' + (socket.handshake.headers['x-forwarded-for'] || socket.id);

  // Usar el ID pre-asignado del socket para el contador (es único por intento)
  if (!intentosPorSocket.has(socket.id)) {
    intentosPorSocket.set(socket.id, 0);
  }

  const intentos = intentosPorSocket.get(socket.id);

  if (intentos >= MAX_INTENTOS_CONTRASENA) {
    console.warn(`[Auth] Socket ${socket.id} bloqueado por demasiados intentos`);
    return next(new Error('DEMASIADOS_INTENTOS'));
  }

  if (!password || password !== MASTER_PASSWORD) {
    const nuevosIntentos = intentos + 1;
    intentosPorSocket.set(socket.id, nuevosIntentos);
    const restantes = MAX_INTENTOS_CONTRASENA - nuevosIntentos;
    console.warn(`[Auth] Contraseña incorrecta para socket ${socket.id}. Intentos restantes: ${restantes}`);
    return next(new Error(`CONTRASENA_INCORRECTA:${restantes}`));
  }

  // Contraseña correcta: limpiar el contador de intentos
  intentosPorSocket.delete(socket.id);
  next();
});

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Emite el estado completo actualizado de la sala a todos sus sockets.
 * Es la forma principal de mantener sincronizados a los clientes.
 * @param {string} codigo
 */
function emitirEstadoSala(codigo) {
  const estado = getEstadoPublico(codigo);
  if (estado) {
    io.to(codigo).emit('room:state', estado);
  }
}

// ─── Manejadores de eventos Socket.io ────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[Socket] Conectado: ${socket.id}`);

  // ── Crear sala ─────────────────────────────────────────────────────────────
  /**
   * Evento: create_room
   * Emitido por: cualquier cliente autenticado
   * Payload: { rol: 'pantalla' | 'jugador' }
   *
   * El dispositivo elige si quiere ser la Pantalla (visualiza el tablero 3D)
   * o un Jugador (controla su personaje). Si elige Jugador, será el anfitrión.
   */
  socket.on('create_room', ({ rol } = {}) => {
    const { codigo } = crearSala();

    // Unirse a la sala de Socket.io (para poder recibir broadcasts)
    socket.join(codigo);

    if (rol === 'pantalla') {
      // Dispositivo que crea quiere ser la Pantalla
      asignarPantalla(codigo, socket.id);
      socket.emit('room:created', {
        roomCode: codigo,
        role:     'pantalla',
        playerId: null,
      });
      console.log(`[Sala] ${codigo} creada. Pantalla: ${socket.id}`);

    } else {
      // Dispositivo que crea quiere ser Jugador (= también anfitrión)
      const resultado = unirJugador(codigo, socket.id);
      if (!resultado.ok) {
        socket.emit('error', { mensaje: resultado.error });
        return;
      }
      socket.emit('room:created', {
        roomCode:    codigo,
        role:        'jugador',
        playerId:    resultado.playerId,
        color:       resultado.jugador.color,
        nombreColor: resultado.jugador.nombreColor,
        esAnfitrion: true,
      });
      console.log(`[Sala] ${codigo} creada. Anfitrión jugador: ${socket.id}`);
    }

    emitirEstadoSala(codigo);
  });

  // ── Unirse a sala ──────────────────────────────────────────────────────────
  /**
   * Evento: join_room
   * Emitido por: cliente que quiere unirse (o reconectarse) a una sala existente
   * Payload: { roomCode: string, rol: 'pantalla'|'jugador', playerId?: string }
   *
   * Si se incluye playerId, se intenta reconectar al jugador existente.
   * Esto permite que un móvil recupere su sesión tras refrescar la página.
   */
  socket.on('join_room', ({ roomCode, rol, playerId: existingPlayerId } = {}) => {
    const codigo = (roomCode || '').toUpperCase().trim();
    const sala   = getSala(codigo);

    if (!sala) {
      socket.emit('error', { mensaje: 'Sala no encontrada. Verifica el código e inténtalo de nuevo.' });
      return;
    }

    // Unir socket a la sala de Socket.io para recibir broadcasts
    socket.join(codigo);

    // ── Intento de reconexión por playerId ──────────────────────────────────
    if (existingPlayerId && sala.playerIdAJugador.has(existingPlayerId)) {
      const resultado = reconectarJugador(codigo, existingPlayerId, socket.id);
      if (resultado.ok) {
        const j = resultado.jugador;
        socket.emit('room:rejoined', {
          roomCode:    codigo,
          playerId:    existingPlayerId,
          role:        'jugador',
          nombre:      j.nombre,
          avatarId:    j.avatarId,
          color:       j.color,
          nombreColor: j.nombreColor,
          listo:       j.listo,
          esAnfitrion: j.esAnfitrion,
        });
        io.to(codigo).emit('room:player_reconnected', {
          playerId: existingPlayerId,
          nombre:   j.nombre,
        });
        emitirEstadoSala(codigo);
        console.log(`[Reconexión] Jugador ${existingPlayerId} reconectado en sala ${codigo}`);
        return;
      }
      // Si falla la reconexión, continuar con unión normal
    }

    // ── Reconexión de Pantalla ──────────────────────────────────────────────
    if (rol === 'pantalla') {
      if (sala.pantallaSocketId && sala.pantallaSocketId !== socket.id) {
        socket.emit('error', { mensaje: 'Esta sala ya tiene un dispositivo Pantalla conectado.' });
        return;
      }
      asignarPantalla(codigo, socket.id);
      socket.emit('room:joined', {
        roomCode: codigo,
        role:     'pantalla',
        playerId: null,
      });
      io.to(codigo).emit('room:screen_reconnected');
      emitirEstadoSala(codigo);
      console.log(`[Sala] Socket ${socket.id} se unió a ${codigo} como Pantalla`);
      return;
    }

    // ── Unión como Jugador nuevo ────────────────────────────────────────────
    const resultado = unirJugador(codigo, socket.id);
    if (!resultado.ok) {
      socket.emit('error', { mensaje: resultado.error });
      return;
    }
    socket.emit('room:joined', {
      roomCode:    codigo,
      role:        'jugador',
      playerId:    resultado.playerId,
      color:       resultado.jugador.color,
      nombreColor: resultado.jugador.nombreColor,
      esAnfitrion: resultado.jugador.esAnfitrion,
    });
    emitirEstadoSala(codigo);
    console.log(`[Sala] Socket ${socket.id} se unió a ${codigo} como Jugador`);
  });

  // ── Reconexión explícita de Pantalla ───────────────────────────────────────
  /**
   * Evento: screen:reconnect
   * Emitido por: dispositivo Pantalla al volver de una desconexión
   * Payload: { roomCode: string }
   */
  socket.on('screen:reconnect', ({ roomCode } = {}) => {
    const codigo    = (roomCode || '').toUpperCase().trim();
    const resultado = reconectarPantalla(codigo, socket.id);

    if (!resultado.ok) {
      socket.emit('error', { mensaje: resultado.error });
      return;
    }

    socket.join(codigo);
    socket.emit('screen:reconnected', { roomCode: codigo });
    io.to(codigo).emit('room:screen_reconnected');
    emitirEstadoSala(codigo);
    console.log(`[Reconexión] Pantalla reconectada en sala ${codigo}`);
  });

  // ── Establecer nombre ──────────────────────────────────────────────────────
  /**
   * Evento: player:set_name
   * Payload: { roomCode: string, playerId: string, nombre: string }
   */
  socket.on('player:set_name', ({ roomCode, playerId, nombre } = {}) => {
    const codigo    = (roomCode || '').toUpperCase().trim();
    const resultado = setNombre(codigo, playerId, nombre);
    if (!resultado.ok) {
      socket.emit('error', { mensaje: resultado.error });
      return;
    }
    emitirEstadoSala(codigo);
  });

  // ── Seleccionar avatar ─────────────────────────────────────────────────────
  /**
   * Evento: player:select_avatar
   * Payload: { roomCode: string, playerId: string, avatarId: string }
   */
  socket.on('player:select_avatar', ({ roomCode, playerId, avatarId } = {}) => {
    const codigo    = (roomCode || '').toUpperCase().trim();
    const resultado = seleccionarAvatar(codigo, playerId, avatarId);
    if (!resultado.ok) {
      socket.emit('avatar:error', { mensaje: resultado.error });
      return;
    }
    emitirEstadoSala(codigo);
  });

  // ── Marcar listo ───────────────────────────────────────────────────────────
  /**
   * Evento: player:ready
   * Payload: { roomCode: string, playerId: string, listo: boolean }
   */
  socket.on('player:ready', ({ roomCode, playerId, listo } = {}) => {
    const codigo    = (roomCode || '').toUpperCase().trim();
    const resultado = setListo(codigo, playerId, listo);
    if (!resultado.ok) {
      socket.emit('error', { mensaje: resultado.error });
      return;
    }
    emitirEstadoSala(codigo);
  });

  // ── Iniciar partida (solo anfitrión) ───────────────────────────────────────
  /**
   * Evento: game:start
   * Payload: { roomCode: string, playerId: string }
   * Solo el jugador con esAnfitrion=true puede emitir este evento con efecto.
   */
  socket.on('game:start', ({ roomCode, playerId } = {}) => {
    const codigo = (roomCode || '').toUpperCase().trim();
    const sala   = getSala(codigo);
    if (!sala) return;

    const jugador = sala.playerIdAJugador.get(playerId);
    if (!jugador?.esAnfitrion) {
      socket.emit('error', { mensaje: 'Solo el anfitrión puede iniciar la partida.' });
      return;
    }

    if (!puedeEmpezar(codigo)) {
      socket.emit('error', { mensaje: 'Se necesitan al menos 2 jugadores listos para empezar.' });
      return;
    }

    sala.estado = 'TABLERO';
    sala.ultimaActividad = Date.now();

    io.to(codigo).emit('game:started', {
      estado:    'TABLERO',
      jugadores: sala.jugadores.map(j => ({
        playerId:    j.playerId,
        nombre:      j.nombre,
        avatarId:    j.avatarId,
        color:       j.color,
        nombreColor: j.nombreColor,
      })),
    });

    console.log(`[Partida] Iniciada en sala ${codigo} con ${sala.jugadores.length} jugadores`);
  });

  // ── Desconexión ────────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Desconectado: ${socket.id} (${reason})`);

    // Limpiar el contador de intentos de contraseña
    intentosPorSocket.delete(socket.id);

    const resultado = desconectarSocket(socket.id);
    if (!resultado) return;

    if (resultado.tipo === 'pantalla') {
      // Notificar a los jugadores que la Pantalla se desconectó
      // La partida queda en pausa; al reconectar, la Pantalla recupera su rol
      io.to(resultado.codigo).emit('room:screen_disconnected');
      emitirEstadoSala(resultado.codigo);
      console.log(`[Pantalla] Desconectada de sala ${resultado.codigo} (partida pausada)`);

    } else if (resultado.tipo === 'jugador') {
      // Notificar a los demás; el jugador puede reconectarse con su playerId
      io.to(resultado.codigo).emit('room:player_disconnected', {
        playerId: resultado.playerId,
        nombre:   resultado.jugador.nombre,
      });
      emitirEstadoSala(resultado.codigo);
    }
  });
});

// ─── Limpieza periódica de salas ─────────────────────────────────────────────

/** Ejecutar limpieza cada 5 minutos */
setInterval(() => {
  limpiarSalasInactivas(ROOM_CLEANUP_MIN);
}, 5 * 60 * 1000);

// ─── Arranque del servidor ────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║        🎉  BADAJOZ PARTY  🎉            ║
╠══════════════════════════════════════════╣
║  Puerto:        ${String(PORT).padEnd(26)}║
║  Tick rate:     ${`${TICK_RATE_HZ} Hz (${1000/TICK_RATE_HZ}ms)`.padEnd(26)}║
║  Limpieza sala: ${`${ROOM_CLEANUP_MIN} min`.padEnd(26)}║
║  Public URL:    ${String(PUBLIC_URL).slice(0,26).padEnd(26)}║
╚══════════════════════════════════════════╝
  `);
});

// Exportar para tests e2e
module.exports = { app, server, io };
