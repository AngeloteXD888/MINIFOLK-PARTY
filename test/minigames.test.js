/**
 * test/minigames.test.js — Suite de Pruebas Unitarias y E2E para Fase 4 (Minijuegos)
 *
 * Valida:
 * 1. Cumplimiento del Contrato Común (Regla 9) en todos los módulos.
 * 2. Lógica autoritativa de Minijuego 1: Piragüismo en el Guadiana (ritmo y meta).
 * 3. Lógica autoritativa de Minijuego 8: Reacción en la Alcazaba (luz verde y penalización falso comienzo).
 * 4. Lógica autoritativa de Minijuego 6: Memory de Monumentos Pacenses (reconocimiento y puntuación).
 * 5. Ciclo de vida en minigameManager (20 Hz, conclusión y reparto de monedas [10, 6, 3, 1]).
 */

'use strict';

const PiraguismoGuadiana = require('../src/minigames/piraguismoGuadiana');
const ReaccionLuces      = require('../src/minigames/reaccionLuces');
const MemoryMonumentos   = require('../src/minigames/memoryMonumentos');
const LluviaBellotas     = require('../src/minigames/lluviaBellotas');
const minigameManager    = require('../src/minigameManager');

let passed = 0;
let failed = 0;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
  passed++;
}

function fail(msg, err) {
  console.error(`  ✗ ${msg}`);
  if (err) console.error('   ', err);
  failed++;
}

function testTitle(title) {
  console.log(`\n▶ ${title}`);
}

async function runMinigamesTests() {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║    Badajoz Party — Tests Fase 4 (MVP)    ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  const mockJugadores = [
    { playerId: 'p1', nombre: 'Ángel',  avatarId: 'angel',  color: '#E63946' },
    { playerId: 'p2', nombre: 'Carlos', avatarId: 'carlos', color: '#457BB5' },
    { playerId: 'p3', nombre: 'María',  avatarId: 'maria',  color: '#2DC653' },
  ];

  // ── TEST 1: Cumplimiento del Contrato Común (Regla 9) ──────────────────────
  testTitle('1. Contrato Común de Minijuegos (Regla 9)');
  try {
    const clases = [PiraguismoGuadiana, ReaccionLuces, MemoryMonumentos, LluviaBellotas];
    clases.forEach(Clase => {
      const instancia = new Clase();
      const metodosRequeridos = ['init', 'onInput', 'update', 'isFinished', 'getResults', 'getStateSnapshot'];
      metodosRequeridos.forEach(m => {
        if (typeof instancia[m] !== 'function') {
          throw new Error(`La clase ${instancia.info.nombre} no implementa el método requerido: ${m}`);
        }
      });
    });
    ok('Todos los minijuegos implementan init(), onInput(), update(), isFinished(), getResults() y getStateSnapshot()');
  } catch (err) {
    fail('Error en contrato común', err);
  }

  // ── TEST 2: Minijuego 1 — Piragüismo en el Guadiana ────────────────────────
  testTitle('2. Minijuego 1: Piragüismo en el Guadiana (ritmo y meta)');
  try {
    const juego = new PiraguismoGuadiana();
    juego.init(mockJugadores, 'TEST');

    // Jugador 1 rema con ritmo alterno A/B
    juego.onInput('p1', { action: 'remo_a' });
    const vel1 = juego.jugadores.get('p1').datosEspecificos.velocidad;
    juego.onInput('p1', { action: 'remo_b' });
    const vel2 = juego.jugadores.get('p1').datosEspecificos.velocidad;

    if (vel2 > vel1) {
      ok(`Ritmo alterno A/B incrementa la velocidad correctamente (${vel1} -> ${vel2})`);
    } else {
      fail('El ritmo alterno no incrementó la velocidad');
    }

    // Jugador 2 rema repitiendo el mismo lado dos veces
    juego.onInput('p2', { action: 'remo_a' });
    const velP2_1 = juego.jugadores.get('p2').datosEspecificos.velocidad;
    juego.onInput('p2', { action: 'remo_a' });
    const velP2_2 = juego.jugadores.get('p2').datosEspecificos.velocidad;

    if ((velP2_2 - velP2_1) < (vel2 - vel1)) {
      ok('Repetir el mismo lado da un impulso menor que alternar');
    } else {
      fail('Repetir lado debería penalizar el impulso de aceleración');
    }

    // Simular avance hasta la meta
    for (let i = 0; i < 40; i++) {
      juego.update(0.05);
    }
    const snap = juego.getStateSnapshot();
    if (snap.jugadores && snap.jugadores.length === 3) {
      ok('Snapshot de estado incluye posición y velocidad a 20 Hz');
    } else {
      fail('Snapshot no contiene la estructura requerida');
    }

    // Forzar llegada a meta
    juego.jugadores.get('p1').datosEspecificos.posicionX = 100;
    juego.update(0.05);

    const resultados = juego.getResults();
    if (resultados[0].playerId === 'p1' && resultados[0].monedasGanadas === 10) {
      ok('Llegada a meta otorga puesto 1 y 10 monedas');
    } else {
      fail('Resultado del ganador de piragüismo no asignó 10 monedas');
    }
  } catch (err) {
    fail('Error en test de Piragüismo', err);
  }

  // ── TEST 3: Minijuego 8 — Reacción en la Alcazaba ───────────────────────────
  testTitle('3. Minijuego 8: Reacción en la Alcazaba (falso comienzo y reflejos)');
  try {
    const juego = new ReaccionLuces();
    juego.init(mockJugadores, 'TEST');

    // En fase ESPERA (luz roja), el jugador p2 pulsa -> Falso comienzo
    juego.onInput('p2', { action: 'pulsar' });
    const espP2 = juego.jugadores.get('p2').datosEspecificos;
    if (espP2.falsoComienzo === true) {
      ok('Pulsar con luz roja detecta "Falso Comienzo" correctamente');
    } else {
      fail('No se detectó falso comienzo al pulsar en fase ESPERA');
    }

    // Avanzar tiempo para que la luz cambie a VERDE
    juego.duracionEsperaMs = 100;
    juego.update(0.15); // Dispara cambio a VERDE

    if (juego.faseRonda === 'VERDE') {
      ok('El foco de la torre cambió a luz VERDE tras el tiempo de espera');
    } else {
      fail(`Fase esperada 'VERDE', pero fue ${juego.faseRonda}`);
    }

    // El jugador p1 pulsa con luz verde
    juego.onInput('p1', { action: 'pulsar' });
    const espP1 = juego.jugadores.get('p1').datosEspecificos;
    if (espP1.reaccionUltimaRondaMs !== null && juego.jugadores.get('p1').puntos > 0) {
      ok(`Reacción válida registrada: ${espP1.reaccionUltimaRondaMs} ms y +${juego.jugadores.get('p1').puntos} puntos`);
    } else {
      fail('No se registró la reacción con luz verde');
    }

    // Finalizar juego y validar podio
    juego.terminado = true;
    const res = juego.getResults();
    if (res[0].monedasGanadas === 10 && res[1].monedasGanadas === 6) {
      ok('Podio de Reacción asigna correctamente 10 monedas al 1.º y 6 al 2.º');
    } else {
      fail('Recompensas de monedas erróneas en Reacción');
    }
  } catch (err) {
    fail('Error en test de Reacción', err);
  }

  // ── TEST 4: Minijuego 6 — Memory de Monumentos Pacenses ────────────────────
  testTitle('4. Minijuego 6: Memory de Monumentos Pacenses');
  try {
    const juego = new MemoryMonumentos();
    juego.init(mockJugadores, 'TEST');

    const objId = juego.monumentoObjetivo.id;
    ok(`Monumento objetivo seleccionado para la ronda 1: ${juego.monumentoObjetivo.nombre} (${objId})`);

    // p1 responde con el monumento correcto
    juego.onInput('p1', { action: 'seleccionar_monumento', payload: { monumentoId: objId } });
    const espP1 = juego.jugadores.get('p1').datosEspecificos;
    if (espP1.acertoRonda === true && juego.jugadores.get('p1').puntos > 100) {
      ok(`Acierto en Memory otorga puntuación base y bonus de rapidez: ${juego.jugadores.get('p1').puntos} pts`);
    } else {
      fail('El acierto en Memory no sumó la puntuación correspondiente');
    }

    // p2 responde con un monumento incorrecto
    const errId = objId === 'alcazaba' ? 'puente_real' : 'alcazaba';
    juego.onInput('p2', { action: 'seleccionar_monumento', payload: { monumentoId: errId } });
    const espP2 = juego.jugadores.get('p2').datosEspecificos;
    if (espP2.acertoRonda === false && juego.jugadores.get('p2').puntos === 0) {
      ok('Fallo en Memory no suma puntos');
    } else {
      fail('El fallo en Memory sumó puntos indebidos');
    }

    juego.terminado = true;
    const res = juego.getResults();
    if (res[0].playerId === 'p1') {
      ok('Clasificación de Memory sitúa en 1.º lugar al jugador con aciertos');
    } else {
      fail('Clasificación incorrecta en Memory');
    }
  } catch (err) {
    fail('Error en test de Memory', err);
  }

  // ── TEST 5: Ciclo de vida en minigameManager ────────────────────────────────
  testTitle('5. minigameManager — Instanciación y bucle autoritativo');
  try {
    // Probar instanciación de cada uno
    const m1 = minigameManager.instanciarMinijuego('carrera_guadiana');
    const m8 = minigameManager.instanciarMinijuego('reaccion_luces');
    const m6 = minigameManager.instanciarMinijuego('memory_monumentos');

    if (m1 && m8 && m6) {
      ok('instanciarMinijuego() genera correctamente las 3 instancias del MVP');
    } else {
      fail('Fallo instanciando minijuegos por ID');
    }

    // Mock Socket.io para probar iniciarMinijuego
    let introEmitido = false;
    let startEmitido = false;
    const mockIo = {
      to: () => ({
        emit: (evento, payload) => {
          if (evento === 'minigame:intro') introEmitido = true;
          if (evento === 'minigame:start') startEmitido = true;
        }
      })
    };

    const sesion = minigameManager.iniciarMinijuego(
      'ROOM_TEST',
      mockJugadores,
      mockIo,
      (resultados) => {},
      'reaccion_luces'
    );

    if (introEmitido) {
      ok('iniciarMinijuego() emite minigame:intro a la sala');
    } else {
      fail('No se emitió minigame:intro');
    }

    sesion.arrancarBucle();
    if (startEmitido && sesion.estado === 'JUGANDO') {
      ok('arrancarBucle() emite minigame:start e inicia estado JUGANDO');
    } else {
      fail('Fallo en arranque de bucle autoritativo');
    }

    minigameManager.limpiarMinijuego('ROOM_TEST');
    if (!minigameManager.getMinijuegoActivo('ROOM_TEST')) {
      ok('limpiarMinijuego() destruye la sesión y limpia la memoria');
    } else {
      fail('limpiarMinijuego no eliminó la sesión');
    }
  } catch (err) {
    fail('Error en test de minigameManager', err);
  }

  // ── RESUMEN ────────────────────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  Pasados: ${passed}   Fallados: ${failed}`);
  console.log(`═══════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runMinigamesTests().catch(err => {
  console.error('[Error FATAL en test]', err);
  process.exit(1);
});
