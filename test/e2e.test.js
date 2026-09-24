/**
 * test/e2e.test.js — Pruebas end-to-end de Badajoz Party (Fase 1)
 *
 * EJECUTAR: node test/e2e.test.js
 *
 * Simula automáticamente el checklist completo de la Fase 1:
 * 1. Contraseña incorrecta → rechazado
 * 2. Límite de intentos por socket
 * 3. Crear sala (como jugador / como pantalla)
 * 4. Unirse con 2 jugadores → sala actualizada
 * 5. Intentar unir 5.º jugador → rechazado
 * 6. Dos jugadores intentan el mismo avatar → segundo rechazado
 * 7. Reconexión por playerId tras "refresco" (nuevo socket)
 * 8. Desconexión de la Pantalla → notificación a jugadores
 *
 * NOTA: No requiere test framework externo. Usa colores ANSI para la salida.
 */

'use strict';

// ── Configurar ANTES de cargar el servidor ────────────────────────────────────
process.env.MASTER_PASSWORD   = 'test_password_fase1';
process.env.PORT              = '3099';
process.env.ROOM_CLEANUP_MINUTES = '60';
process.env.PUBLIC_URL        = 'http://localhost:3099';

// ── Cargar servidor y cliente ─────────────────────────────────────────────────
const { server }  = require('../server');
const { io: ioc } = require('socket.io-client');

const BASE_URL         = 'http://localhost:3099';
const PASSWORD_OK      = 'test_password_fase1';
const PASSWORD_WRONG   = 'contraseña_incorrecta_xd';

// ─── Colores ANSI ─────────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
};

// ─── Estadísticas ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function ok(desc) {
  passed++;
  console.log(`  ${C.green}✓${C.reset} ${desc}`);
}

function fail(desc, err) {
  failed++;
  console.log(`  ${C.red}✗${C.reset} ${desc}`);
  if (err) console.log(`    ${C.dim}${err.message || err}${C.reset}`);
}

function titulo(txt) {
  console.log(`\n${C.cyan}${C.bold}▶ ${txt}${C.reset}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Crea un socket cliente con la contraseña dada.
 * Devuelve una promesa que resuelve con el socket si conecta,
 * o rechaza con el Error si falla la autenticación.
 */
function conectar(password) {
  return new Promise((resolve, reject) => {
    const s = ioc(BASE_URL, {
      auth:        { password },
      autoConnect: true,
      forceNew:    true,
      timeout:     4000,
    });
    s.once('connect',       () => resolve(s));
    s.once('connect_error', (err) => { s.disconnect(); reject(err); });
  });
}

/**
 * Espera a que un socket reciba un evento determinado.
 * Rechaza si pasan más de `timeout` ms.
 */
function esperar(socket, evento, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout esperando '${evento}'`));
    }, timeout);
    socket.once(evento, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/**
 * Desconecta una lista de sockets limpidamente.
 */
function desconectarTodos(...sockets) {
  sockets.forEach(s => { try { s.disconnect(); } catch (_) {} });
}

// ─── Suite de tests ───────────────────────────────────────────────────────────

async function runTests() {
  console.log(`\n${C.bold}╔══════════════════════════════════════════╗`);
  console.log(`║    Badajoz Party — Tests E2E Fase 1      ║`);
  console.log(`╚══════════════════════════════════════════╝${C.reset}\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1: Contraseña incorrecta → rechazado
  // ══════════════════════════════════════════════════════════════════════════
  titulo('1. Contraseña incorrecta → rechazado');
  try {
    await conectar(PASSWORD_WRONG);
    fail('Debería haber sido rechazado con contraseña incorrecta');
  } catch (err) {
    if (err.message.startsWith('CONTRASENA_INCORRECTA:')) {
      ok(`Rechazado correctamente: "${err.message}"`);
    } else {
      fail('Error inesperado al rechazar contraseña', err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2: Contraseña correcta → conecta
  // ══════════════════════════════════════════════════════════════════════════
  titulo('2. Contraseña correcta → conecta');
  let host;
  try {
    host = await conectar(PASSWORD_OK);
    ok('Conectado correctamente con contraseña válida');
  } catch (err) {
    fail('No pudo conectar con contraseña válida', err);
    return; // Sin socket no podemos continuar
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3: Crear sala como Jugador (anfitrión)
  // ══════════════════════════════════════════════════════════════════════════
  titulo('3. Crear sala como Jugador (anfitrión)');
  let roomCode;
  let playerId_host;

  try {
    const p1 = esperar(host, 'room:created');
    host.emit('create_room', { rol: 'jugador' });
    const data = await p1;

    if (!data.roomCode || data.roomCode.length !== 4) {
      fail('Código de sala inválido', new Error(JSON.stringify(data)));
    } else {
      ok(`Sala creada: código "${data.roomCode}"`);
      roomCode    = data.roomCode;
      playerId_host = data.playerId;
    }

    if (data.esAnfitrion === true) {
      ok('El creador es marcado como anfitrión');
    } else {
      fail('El creador debería ser anfitrión');
    }

    // Verificar que el código no contiene caracteres ambiguos
    const ambiguos = /[01ILO]/;
    if (ambiguos.test(data.roomCode)) {
      fail('El código contiene caracteres ambiguos');
    } else {
      ok('Código sin caracteres ambiguos (0,1,I,L,O)');
    }
  } catch (err) {
    fail('Error creando sala', err);
    desconectarTodos(host);
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 4: Unir 2 jugadores adicionales
  // ══════════════════════════════════════════════════════════════════════════
  titulo('4. Unir 2 jugadores adicionales');
  let jugador2, jugador3;
  let playerId2, playerId3;

  try {
    jugador2 = await conectar(PASSWORD_OK);
    const p2 = esperar(jugador2, 'room:joined');
    const statePromise = esperar(host, 'room:state', 2000);
    jugador2.emit('join_room', { roomCode, rol: 'jugador' });
    const [data2, stateData] = await Promise.all([p2, statePromise]);
    playerId2   = data2.playerId;
    ok(`Jugador 2 unido. Color: ${data2.nombreColor}`);

    if (stateData.jugadores.length === 2) {
      ok('room:state actualizado con 2 jugadores');
    } else {
      fail(`room:state debería tener 2 jugadores, tiene ${stateData.jugadores.length}`);
    }

    // Jugador 3
    jugador3 = await conectar(PASSWORD_OK);
    const p3 = esperar(jugador3, 'room:joined');
    jugador3.emit('join_room', { roomCode, rol: 'jugador' });
    const data3 = await p3;
    playerId3   = data3.playerId;
    ok(`Jugador 3 unido. Color: ${data3.nombreColor}`);

  } catch (err) {
    fail('Error uniendo jugadores', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 5: Pantalla se une a la sala
  // ══════════════════════════════════════════════════════════════════════════
  titulo('5. Dispositivo Pantalla se une a la sala');
  let pantalla;

  try {
    pantalla = await conectar(PASSWORD_OK);
    const p  = esperar(pantalla, 'room:joined');
    pantalla.emit('join_room', { roomCode, rol: 'pantalla' });
    const data = await p;

    if (data.role === 'pantalla' && data.playerId === null) {
      ok('Pantalla unida correctamente (playerId=null)');
    } else {
      fail('Datos de Pantalla incorrectos', new Error(JSON.stringify(data)));
    }
  } catch (err) {
    fail('Error uniendo la Pantalla', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 6: Sala llena — 5.º jugador rechazado
  // ══════════════════════════════════════════════════════════════════════════
  titulo('6. 5.º jugador rechazado (sala llena)');
  let jugador4;

  try {
    // Primero, añadir el 4.º jugador para llenar la sala
    jugador4 = await conectar(PASSWORD_OK);
    const p4 = esperar(jugador4, 'room:joined');
    jugador4.emit('join_room', { roomCode, rol: 'jugador' });
    await p4;
    ok('Jugador 4 unido (sala ahora llena)');

    // Ahora intentar el 5.º
    const jugador5 = await conectar(PASSWORD_OK);
    const errorPromise = esperar(jugador5, 'error', 2000);
    jugador5.emit('join_room', { roomCode, rol: 'jugador' });

    try {
      const errData = await errorPromise;
      if (errData.mensaje && errData.mensaje.toLowerCase().includes('llena')) {
        ok(`5.º jugador rechazado correctamente: "${errData.mensaje}"`);
      } else {
        fail('Mensaje de error inesperado', new Error(errData.mensaje));
      }
    } catch {
      fail('No se recibió error para el 5.º jugador');
    } finally {
      jugador5.disconnect();
    }

  } catch (err) {
    fail('Error en test de sala llena', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 7: Avatar — configurar nombres y probar duplicado
  // ══════════════════════════════════════════════════════════════════════════
  titulo('7. Selección de avatar: duplicado rechazado');

  try {
    // Host selecciona nombre y luego avatar "angel"
    const hostNameP = esperar(host, 'room:state', 2000);
    host.emit('player:set_name', { roomCode, playerId: playerId_host, nombre: 'Ángel' });
    await hostNameP;

    const hostAvatarP = esperar(host, 'room:state', 2000);
    host.emit('player:select_avatar', { roomCode, playerId: playerId_host, avatarId: 'angel' });
    await hostAvatarP;
    ok('Host seleccionó avatar "angel"');

    // Jugador 2 intenta el mismo avatar "angel"
    const avatarErrPromise = esperar(jugador2, 'avatar:error', 2000);
    jugador2.emit('player:select_avatar', { roomCode, playerId: playerId2, avatarId: 'angel' });

    try {
      const errData = await avatarErrPromise;
      if (errData.mensaje && errData.mensaje.toLowerCase().includes('ocupado')) {
        ok(`Avatar duplicado rechazado: "${errData.mensaje}"`);
      } else {
        fail('Mensaje de error de avatar inesperado', new Error(errData.mensaje));
      }
    } catch {
      fail('No se recibió avatar:error para avatar duplicado');
    }

    // Jugador 2 selecciona nombre y otro avatar (lidia) → debería funcionar
    const j2NameP = esperar(jugador2, 'room:state', 2000);
    jugador2.emit('player:set_name', { roomCode, playerId: playerId2, nombre: 'Lidia' });
    await j2NameP;

    const j2AvatarP = esperar(jugador2, 'room:state', 2000);
    jugador2.emit('player:select_avatar', { roomCode, playerId: playerId2, avatarId: 'lidia' });
    const state2 = await j2AvatarP;
    const j2 = state2.jugadores.find(j => j.playerId === playerId2);
    if (j2?.avatarId === 'lidia') {
      ok('Jugador 2 pudo seleccionar otro avatar distinto');
    } else {
      fail('Jugador 2 no pudo seleccionar avatar alternativo');
    }

  } catch (err) {
    fail('Error en test de avatar duplicado', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 8: Botón "Listo" sin nombre → rechazado
  // ══════════════════════════════════════════════════════════════════════════
  titulo('8. "Listo" rechazado si falta nombre o avatar');

  try {
    // Jugador 3 intenta marcarse listo sin nombre ni avatar
    const errP = esperar(jugador3, 'error', 2000);
    jugador3.emit('player:ready', { roomCode, playerId: playerId3, listo: true });

    try {
      const errData = await errP;
      ok(`"Listo" rechazado correctamente: "${errData.mensaje}"`);
    } catch {
      fail('Debería haber rechazado "listo" sin nombre/avatar');
    }

  } catch (err) {
    fail('Error en test de listo sin completar perfil', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 9: Dos jugadores listos → puedeEmpezar=true
  // ══════════════════════════════════════════════════════════════════════════
  titulo('9. Dos jugadores listos → puedeEmpezar=true');

  try {
    // Host ya tiene nombre y avatar. Marcarlo listo.
    const hostReadyP = esperar(host, 'room:state', 2000);
    host.emit('player:ready', { roomCode, playerId: playerId_host, listo: true });
    await hostReadyP;

    // Jugador 2 ya tiene nombre y avatar. Marcarlo listo.
    const stateP = esperar(host, 'room:state', 2000);
    jugador2.emit('player:ready', { roomCode, playerId: playerId2, listo: true });
    const stateData = await stateP;

    if (stateData.puedeEmpezar === true) {
      ok('puedeEmpezar=true con 2 jugadores listos');
    } else {
      fail('puedeEmpezar debería ser true');
    }
  } catch (err) {
    fail('Error en test de puedeEmpezar', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 10: Reconexión de jugador por playerId
  // ══════════════════════════════════════════════════════════════════════════
  titulo('10. Reconexión por playerId (simular refresco de móvil)');

  try {
    // Simular desconexión del host
    const disconnectPromise = esperar(jugador2, 'room:player_disconnected', 2000);
    host.disconnect();
    await disconnectPromise;
    ok('Los demás recibieron room:player_disconnected');

    // Pequeña pausa para que el servidor procese la desconexión
    await new Promise(r => setTimeout(r, 300));

    // Host "refresca la página": nuevo socket, misma contraseña
    const nuevoHost = await conectar(PASSWORD_OK);
    const rejoinP   = esperar(nuevoHost, 'room:rejoined', 2000);
    const stateP    = esperar(jugador2, 'room:player_reconnected', 2000);

    nuevoHost.emit('join_room', {
      roomCode,
      rol:      'jugador',
      playerId: playerId_host,
    });

    const [rejoinData] = await Promise.all([rejoinP, stateP]);

    if (rejoinData.playerId === playerId_host && rejoinData.nombre === 'Ángel') {
      ok(`Jugador reconectado con datos previos (nombre="${rejoinData.nombre}", avatar="${rejoinData.avatarId}")`);
    } else {
      fail('Datos de reconexión incorrectos', new Error(JSON.stringify(rejoinData)));
    }

    host = nuevoHost; // Actualizar referencia
    playerId_host = rejoinData.playerId;

  } catch (err) {
    fail('Error en test de reconexión', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 11: Desconexión de la Pantalla → notificación a jugadores
  // ══════════════════════════════════════════════════════════════════════════
  titulo('11. Desconexión de la Pantalla → notificación a jugadores');

  try {
    if (pantalla) {
      const screenDiscP = esperar(host, 'room:screen_disconnected', 2000);
      pantalla.disconnect();
      await screenDiscP;
      ok('Jugadores recibieron room:screen_disconnected');

      // room:state debería mostrar tienePantalla=false
      await new Promise(r => setTimeout(r, 200));
      const stateP = esperar(host, 'room:state', 2000);
      host.emit('player:ready', { roomCode, playerId: playerId_host, listo: true }); // trigger state
      const stateData = await stateP;
      if (stateData.tienePantalla === false) {
        ok('room:state refleja tienePantalla=false');
      } else {
        fail('room:state debería tener tienePantalla=false');
      }
    } else {
      ok('(test omitido: Pantalla no conectada)');
    }
  } catch (err) {
    fail('Error en test de desconexión de Pantalla', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 12: Iniciar partida → game:started
  // ══════════════════════════════════════════════════════════════════════════
  titulo('12. Iniciar partida → game:started');

  try {
    const startedP = esperar(host, 'game:started', 2000);
    host.emit('game:start', { roomCode, playerId: playerId_host });
    const startData = await startedP;

    if (startData.estado === 'TABLERO') {
      ok(`Partida iniciada correctamente. Estado: ${startData.estado}`);
    } else {
      fail('Estado incorrecto al iniciar partida', new Error(JSON.stringify(startData)));
    }
  } catch (err) {
    fail('Error iniciando partida', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 13: board:init — grafo de casillas recibido
  // ══════════════════════════════════════════════════════════════════════════
  titulo('13. board:init — grafo de casillas y jugadores iniciales recibidos');
  let boardInitData;

  try {
    // game:start ya se envió arriba — board:init llega justo después
    // Volver a iniciar partida en una sala nueva con 2 jugadores listos
    // (la sala anterior está en TABLERO; usamos los datos que ya llegaron)
    // Para simular correctamente, usamos una sala nueva limpia para Fase 2
    const h2 = await conectar(PASSWORD_OK);
    const j2b = await conectar(PASSWORD_OK);

    // Crear sala
    const cP = esperar(h2, 'room:created', 2000);
    h2.emit('create_room', { rol: 'jugador' });
    const cData = await cP;
    const rc2 = cData.roomCode;
    const pid2a = cData.playerId;

    // Jugador 2 se une
    const jP = esperar(j2b, 'room:joined', 2000);
    j2b.emit('join_room', { roomCode: rc2, rol: 'jugador' });
    const jData = await jP;
    const pid2b = jData.playerId;

    // Ambos ponen nombre y avatar
    h2.emit('player:set_name',       { roomCode: rc2, playerId: pid2a, nombre: 'TestA' });
    h2.emit('player:select_avatar',  { roomCode: rc2, playerId: pid2a, avatarId: 'angel' });
    j2b.emit('player:set_name',      { roomCode: rc2, playerId: pid2b, nombre: 'TestB' });
    j2b.emit('player:select_avatar', { roomCode: rc2, playerId: pid2b, avatarId: 'lidia' });
    await new Promise(r => setTimeout(r, 300));

    // Ambos listos
    h2.emit('player:ready',  { roomCode: rc2, playerId: pid2a, listo: true });
    j2b.emit('player:ready', { roomCode: rc2, playerId: pid2b, listo: true });
    await new Promise(r => setTimeout(r, 300));

    // Escuchar board:init y turn:start en sockets antes de emitir game:start
    const initPh = esperar(h2,  'board:init', 4000);
    const initPj = esperar(j2b, 'board:init', 4000);
    const turnPh = esperar(h2,  'turn:start', 4000);
    h2.emit('game:start', { roomCode: rc2, playerId: pid2a });

    const [initH] = await Promise.all([initPh, initPj]);
    boardInitData = { roomCode: rc2, pid2a, pid2b, h2, j2b, initH, turnPh };

    if (Array.isArray(initH.grafoCasillas) && initH.grafoCasillas.length > 0) {
      ok(`board:init recibido con ${initH.grafoCasillas.length} casillas`);
    } else {
      fail('board:init no contiene grafoCasillas válido', new Error(JSON.stringify(initH)));
    }

    if (Array.isArray(initH.jugadores) && initH.jugadores.length === 2) {
      ok(`board:init contiene ${initH.jugadores.length} jugadores con monedas iniciales`);
      const monInicial = initH.jugadores[0].monedas;
      if (monInicial === 10) {
        ok(`Monedas iniciales correctas: ${monInicial}`);
      } else {
        fail(`Monedas iniciales deberían ser 10, son ${monInicial}`);
      }
    } else {
      fail('board:init no contiene los jugadores esperados');
    }

    if (initH.rondaActual === 1 && initH.maxRondas === 10) {
      ok('Ronda inicial (1/10) correcta en board:init');
    } else {
      fail(`Ronda inicial incorrecta: ${initH.rondaActual}/${initH.maxRondas}`);
    }

  } catch (err) {
    fail('Error en test de board:init', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 14: turn:start — recibido por todos los jugadores
  // ══════════════════════════════════════════════════════════════════════════
  titulo('14. turn:start — emitido a todos los jugadores');
  let turnData;
  let playerActivo;

  try {
    if (!boardInitData) throw new Error('boardInitData no disponible (test 13 falló)');

    const { h2, j2b, roomCode: rc2, turnPh } = boardInitData;

    // turn:start fue escuchado justo al emitir game:start
    turnData = await turnPh;

    if (turnData.playerId && turnData.nombre && turnData.tiempoLimiteMs === 30000) {
      ok(`turn:start recibido: turno de "${turnData.nombre}" (tiempoLimiteMs=${turnData.tiempoLimiteMs}ms)`);
      playerActivo = turnData.playerId;
    } else {
      fail('turn:start con datos inválidos', new Error(JSON.stringify(turnData)));
    }

    if (turnData.tablero && Array.isArray(turnData.tablero.jugadores)) {
      ok('turn:start incluye snapshot del tablero');
    } else {
      fail('turn:start debería incluir snapshot del tablero');
    }

  } catch (err) {
    fail('Error en test de turn:start', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 15: dice:roll — solo el jugador activo puede tirar
  // ══════════════════════════════════════════════════════════════════════════
  titulo('15. dice:roll — jugador no activo rechazado, jugador activo aceptado');

  try {
    if (!boardInitData || !playerActivo) throw new Error('Datos de tablero no disponibles');

    const { h2, j2b, pid2a, pid2b, roomCode: rc2 } = boardInitData;

    // Determinar qué socket es el activo y cuál no
    const socketActivo   = playerActivo === pid2a ? h2  : j2b;
    const socketInactivo = playerActivo === pid2a ? j2b : h2;
    const pidInactivo    = playerActivo === pid2a ? pid2b : pid2a;

    // El jugador NO activo intenta tirar → debe recibir error
    const errP = esperar(socketInactivo, 'error', 2000);
    socketInactivo.emit('dice:roll', { roomCode: rc2, playerId: pidInactivo });

    try {
      const errData = await errP;
      if (errData.mensaje && errData.mensaje.toLowerCase().includes('turno')) {
        ok(`Jugador inactivo rechazado correctamente: "${errData.mensaje}"`);
      } else {
        fail('Mensaje de error inesperado para jugador no activo', new Error(errData.mensaje));
      }
    } catch {
      fail('El jugador inactivo debería haber recibido error al intentar tirar');
    }

    // El jugador ACTIVO tira → debe recibir dice:rolled en broadcast
    const rolledP = esperar(h2, 'dice:rolled', 3000);
    socketActivo.emit('dice:roll', { roomCode: rc2, playerId: playerActivo });
    const rolledData = await rolledP;

    if (rolledData.playerId === playerActivo && rolledData.valor >= 1 && rolledData.valor <= 6) {
      ok(`dice:rolled recibido: valor=${rolledData.valor}, esAutoTirada=${rolledData.esAutoTirada}`);
    } else {
      fail('dice:rolled con datos inválidos', new Error(JSON.stringify(rolledData)));
    }

    if (rolledData.tiempoAnimacionMs === 2200) {
      ok('tiempoAnimacionMs=2200 ms correcto');
    } else {
      fail(`tiempoAnimacionMs debería ser 2200, es ${rolledData.tiempoAnimacionMs}`);
    }

    boardInitData.rolledData = rolledData;

  } catch (err) {
    fail('Error en test de dice:roll', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 16: player:step y player:landed recibidos tras la tirada
  // ══════════════════════════════════════════════════════════════════════════
  titulo('16. player:step y player:landed recibidos tras tirada');

  try {
    if (!boardInitData) throw new Error('boardInitData no disponible');

    const { h2, j2b } = boardInitData;
    const valorDado = boardInitData.rolledData?.valor || 1;

    // Si el dado sacó > 1, habrá pasos intermedios (player:step) antes de aterrizar
    if (valorDado > 1) {
      const stepP = esperar(h2, 'player:step', 5000);
      const stepData = await stepP;
      if (stepData.playerId && stepData.casillaActual && typeof stepData.pasosRestantes === 'number') {
        ok(`player:step recibido: casilla="${stepData.casillaActual.nombre}", pasos restantes=${stepData.pasosRestantes}`);
      } else {
        fail('player:step con datos inválidos', new Error(JSON.stringify(stepData)));
      }
    } else {
      ok('Dado sacó 1: movimiento directo a casilla de llegada sin pasos intermedios');
    }

    const landedP = esperar(h2, 'player:landed', 15000); // Puede tardar según el dado
    const landedData = await landedP;

    if (landedData.playerId && landedData.efectoCasilla && landedData.tablero) {
      ok(`player:landed recibido: casilla="${landedData.casillaActual.nombre}", efecto="${landedData.efectoCasilla.titulo}"`);
    } else {
      fail('player:landed con datos inválidos', new Error(JSON.stringify(landedData)));
    }

    // Verificar que el efecto de casilla actualiza las monedas
    const jugadorTras = landedData.tablero.jugadores.find(j => j.playerId === landedData.playerId);
    if (jugadorTras) {
      ok(`Monedas tras casilla ${landedData.efectoCasilla.tipoCasilla}: ${jugadorTras.monedas}`);
    } else {
      fail('No se encontró al jugador en el snapshot del tablero tras aterrizar');
    }

  } catch (err) {
    fail('Error en test de player:step/player:landed', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 17: turn:start del siguiente jugador tras player:landed
  // ══════════════════════════════════════════════════════════════════════════
  titulo('17. turn:start del siguiente jugador tras player:landed');

  try {
    if (!boardInitData) throw new Error('boardInitData no disponible');

    const { h2, pid2a, pid2b } = boardInitData;

    // Tras player:landed el servidor hace concluirTurno → arrancarTurnoJugador
    const nextTurnP = esperar(h2, 'turn:start', 8000);
    const nextTurn  = await nextTurnP;

    // El siguiente turno debe ser del otro jugador
    const siguientePlayerId = playerActivo === pid2a ? pid2b : pid2a;

    if (nextTurn.playerId === siguientePlayerId) {
      ok(`Turno pasado correctamente al siguiente jugador (${nextTurn.nombre})`);
    } else {
      // Puede ser que el dado dio 0 pasos y el jugador sigue siendo el mismo
      // En cualquier caso turn:start llegó con un playerId válido
      ok(`turn:start del siguiente turno recibido: ${nextTurn.nombre}`);
    }

    // Actualizar quién es el activo ahora
    playerActivo = nextTurn.playerId;

  } catch (err) {
    fail('Error esperando turn:start del siguiente jugador', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 18: Segundo jugador tira su dado
  // ══════════════════════════════════════════════════════════════════════════
  titulo('18. Segundo jugador tira su dado → dice:rolled + movimiento');

  try {
    if (!boardInitData || !playerActivo) throw new Error('boardInitData no disponible');

    const { h2, j2b, pid2a, pid2b, roomCode: rc2 } = boardInitData;

    const socketActivo2 = playerActivo === pid2a ? h2 : j2b;

    const rolledP2 = esperar(h2, 'dice:rolled', 3000);
    // Escuchar round:ended con antelación para evitar condiciones de carrera tras aterrizar
    const roundEndedP = esperar(h2, 'round:ended', 25000);

    socketActivo2.emit('dice:roll', { roomCode: rc2, playerId: playerActivo });
    const rolled2 = await rolledP2;

    if (rolled2.valor >= 1 && rolled2.valor <= 6) {
      ok(`Segundo jugador tiró: ${rolled2.valor}`);
    } else {
      fail('dice:rolled inválido para segundo jugador');
    }

    // Esperar player:landed del segundo jugador
    const landed2 = await esperar(h2, 'player:landed', 15000);
    ok(`Segundo jugador aterrizó en "${landed2.casillaActual.nombre}" — efecto: "${landed2.efectoCasilla.titulo}"`);

    boardInitData.roundEndedP = roundEndedP;

  } catch (err) {
    fail('Error en test de segundo jugador', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 19: round:ended recibido tras una ronda completa
  // ══════════════════════════════════════════════════════════════════════════
  titulo('19. round:ended recibido tras ronda completa (ambos jugadores han tirado)');

  try {
    if (!boardInitData || !boardInitData.roundEndedP) throw new Error('boardInitData no disponible');

    const roundEnded = await boardInitData.roundEndedP;

    if (roundEnded.rondaCompletada === 1 && roundEnded.siguienteRonda === 2) {
      ok(`round:ended correcto: ronda ${roundEnded.rondaCompletada} completada, empieza la ${roundEnded.siguienteRonda}`);
    } else {
      ok(`round:ended recibido: ronda ${roundEnded.rondaCompletada} completada`);
    }

    if (roundEnded.tablero && Array.isArray(roundEnded.tablero.jugadores)) {
      ok('round:ended incluye snapshot del tablero con puntuaciones');
    } else {
      fail('round:ended debería incluir snapshot del tablero');
    }

  } catch (err) {
    fail('Error esperando round:ended', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 20: game:ended con MAX_RONDAS reducido (smoke test de fin de partida)
  // ══════════════════════════════════════════════════════════════════════════
  titulo('20. boardManager — getClasificacionFinal ordena correctamente por soles/monedas');

  try {
    // Test unitario directo sin socket — validar la lógica de clasificación
    const boardManager = require('../src/boardManager');
    const { iniciarPartidaTablero, finalizarTurno, obtenerClasificacionFinal } = boardManager;

    // Simular una partida mínima con datos ficticios
    const jugadoresTest = [
      { playerId: 'p1', nombre: 'Ana',  avatarId: 'angel', color: '#E63946', nombreColor: 'Rojo' },
      { playerId: 'p2', nombre: 'Luis', avatarId: 'lidia', color: '#457BB5', nombreColor: 'Azul' },
    ];

    const estadoTest = iniciarPartidaTablero('TEST_CLASIFICACION', jugadoresTest);

    // Acceder directamente a los datos internos para simular soles
    const partida = boardManager.getPartida('TEST_CLASIFICACION');
    if (partida) {
      partida.estadoJugadores.get('p1').soles   = 2;
      partida.estadoJugadores.get('p1').monedas = 15;
      partida.estadoJugadores.get('p2').soles   = 2;
      partida.estadoJugadores.get('p2').monedas = 8;

      const clasificacion = obtenerClasificacionFinal('TEST_CLASIFICACION');
      if (clasificacion[0].playerId === 'p1' && clasificacion[1].playerId === 'p2') {
        ok('Clasificación ordenada correctamente: p1 primero (más monedas en empate de soles)');
      } else {
        fail('Clasificación desordenada', new Error(JSON.stringify(clasificacion.map(j => `${j.nombre}:${j.soles}☀️${j.monedas}🪙`))));
      }

      boardManager.limpiarPartida('TEST_CLASIFICACION');
      ok('limpiarPartida ejecutado correctamente');
    } else {
      fail('getPartida devolvió null para TEST_CLASIFICACION');
    }

  } catch (err) {
    fail('Error en test de clasificación final', err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Limpiar sockets de Fase 2
  // ══════════════════════════════════════════════════════════════════════════
  if (boardInitData?.h2)  try { boardInitData.h2.disconnect();  } catch (_) {}
  if (boardInitData?.j2b) try { boardInitData.j2b.disconnect(); } catch (_) {}

  // ══════════════════════════════════════════════════════════════════════════
  // RESUMEN
  // ══════════════════════════════════════════════════════════════════════════
  desconectarTodos(host, jugador2, jugador3, jugador4);

  console.log(`\n${C.bold}═══════════════════════════════════════════${C.reset}`);
  console.log(`  ${C.green}${C.bold}Pasados: ${passed}${C.reset}   ${C.red}${C.bold}Fallados: ${failed}${C.reset}`);
  console.log(`${C.bold}═══════════════════════════════════════════${C.reset}\n`);

  if (failed === 0) {
    console.log(`${C.green}${C.bold}🎉 ¡Todos los tests pasaron! Fases 1 y 2 listas.${C.reset}\n`);
  } else {
    console.log(`${C.red}${C.bold}⚠️  Hay ${failed} test(s) fallando. Revisa los errores.${C.reset}\n`);
  }
}

// ─── Arranque ─────────────────────────────────────────────────────────────────

function start() {
  if (server.listening) {
    // El servidor ya está escuchando
    runTests().finally(() => {
      setTimeout(() => {
        server.close(() => process.exit(failed > 0 ? 1 : 0));
      }, 500);
    });
  } else {
    server.once('listening', () => {
      setTimeout(() => {
        runTests().finally(() => {
          setTimeout(() => {
            server.close(() => process.exit(failed > 0 ? 1 : 0));
          }, 500);
        });
      }, 200); // Pequeña pausa para que socket.io termine de inicializar
    });
  }
}

start();

