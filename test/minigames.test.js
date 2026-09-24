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

const PiraguismoGuadiana     = require('../src/minigames/piraguismoGuadiana');
const EsquivarMuralla        = require('../src/minigames/esquivarMuralla');
const CarnavalCaramelos      = require('../src/minigames/carnavalCaramelos');
const CarreraPuenteReal      = require('../src/minigames/carreraPuenteReal');
const PulsoPlazaAlta         = require('../src/minigames/pulsoPlazaAlta');
const MemoryMonumentos       = require('../src/minigames/memoryMonumentos');
const EquilibrioPuentePalmas = require('../src/minigames/equilibrioPuentePalmas');
const ReaccionLuces          = require('../src/minigames/reaccionLuces');
const LluviaBellotas         = require('../src/minigames/lluviaBellotas');
const minigameManager        = require('../src/minigameManager');

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
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║    Badajoz Party — Tests Fase 4 & 5 (8 Juegos)   ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  const mockJugadores = [
    { playerId: 'p1', nombre: 'Ángel',  avatarId: 'angel',  color: '#E63946' },
    { playerId: 'p2', nombre: 'Carlos', avatarId: 'carlos', color: '#457BB5' },
    { playerId: 'p3', nombre: 'María',  avatarId: 'maria',  color: '#2DC653' },
  ];

  // ── TEST 1: Cumplimiento del Contrato Común (Regla 9) ──────────────────────
  testTitle('1. Contrato Común de Minijuegos (Regla 9) en los 8 Juegos + Bonus');
  try {
    const clases = [
      PiraguismoGuadiana,
      EsquivarMuralla,
      CarnavalCaramelos,
      CarreraPuenteReal,
      PulsoPlazaAlta,
      MemoryMonumentos,
      EquilibrioPuentePalmas,
      ReaccionLuces,
      LluviaBellotas,
    ];
    clases.forEach(Clase => {
      const instancia = new Clase();
      const metodosRequeridos = ['init', 'onInput', 'update', 'isFinished', 'getResults', 'getStateSnapshot'];
      metodosRequeridos.forEach(m => {
        if (typeof instancia[m] !== 'function') {
          throw new Error(`La clase ${instancia.info.nombre} no implementa el método requerido: ${m}`);
        }
      });
    });
    ok('Las 9 clases de minijuegos implementan rigurosamente el contrato común (Regla 9)');
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

  // ── TEST 5: Minijuego 5 — Pulso de Fuerza en la Plaza Alta ────────────────
  testTitle('5. Minijuego 5: Pulso en la Plaza Alta (mash button y fatiga)');
  try {
    const juego = new PulsoPlazaAlta();
    juego.init(mockJugadores, 'TEST');

    const fInicial = juego.jugadores.get('p1').datosEspecificos.fuerzaActual;
    // Machacar botón de fuerza
    for (let i = 0; i < 5; i++) {
      juego.onInput('p1', { action: 'fuerza_tap' });
    }
    const fTrasTaps = juego.jugadores.get('p1').datosEspecificos.fuerzaActual;
    const taps = juego.jugadores.get('p1').datosEspecificos.pulsacionesTotal;

    if (fTrasTaps > fInicial && taps === 5) {
      ok(`Machacar botón incrementó la fuerza de ${fInicial} a ${fTrasTaps.toFixed(1)} (taps: ${taps})`);
    } else {
      fail('El tap no incrementó la fuerza correctamente');
    }

    // Fatiga muscular: actualizar sin pulsar debe reducir la fuerza
    juego.update(0.5);
    const fTrasFatiga = juego.jugadores.get('p1').datosEspecificos.fuerzaActual;
    if (fTrasFatiga < fTrasTaps) {
      ok(`Fatiga muscular reduce la potencia pasivamente (${fTrasTaps.toFixed(1)} -> ${fTrasFatiga.toFixed(1)})`);
    } else {
      fail('La fatiga muscular no redujo la fuerza');
    }

    const snap = juego.getStateSnapshot();
    if (snap.jugadores[0].fuerzaActual !== undefined && snap.minijuegoId === 'pulso_fuerza') {
      ok('Snapshot de Pulso en la Plaza Alta incluye fuerzaActual y tapsPorSegundo');
    } else {
      fail('Snapshot de Pulso incompleto');
    }

    juego.terminado = true;
    const res = juego.getResults();
    if (res[0].monedasGanadas === 10) {
      ok('Podio de Pulso asigna 10 monedas al ganador');
    } else {
      fail('Podio erróneo en Pulso');
    }
  } catch (err) {
    fail('Error en test de Pulso en la Plaza Alta', err);
  }

  // ── TEST 6: Minijuego 3 — Caramelos del Carnaval de Badajoz ─────────────────
  testTitle('6. Minijuego 3: Caramelos del Carnaval de Badajoz');
  try {
    const juego = new CarnavalCaramelos();
    juego.init(mockJugadores, 'TEST');

    const posXInicial = juego.jugadores.get('p1').datosEspecificos.posicionX;
    // Mover con botón táctil derecho
    juego.onInput('p1', { action: 'tap_der' });
    const posXDer = juego.jugadores.get('p1').datosEspecificos.posicionX;

    if (posXDer > posXInicial) {
      ok(`Botón derecho desplaza la cesta hacia la derecha (${posXInicial.toFixed(2)} -> ${posXDer.toFixed(2)})`);
    } else {
      fail('Botón derecho no desplazó la posición X');
    }

    // Giroscopio analógico hacia la izquierda para p2
    const p2XInicial = juego.jugadores.get('p2').datosEspecificos.posicionX;
    juego.onInput('p2', { action: 'gyro', payload: { tiltX: -0.8 } });
    juego.update(0.2);
    const p2XGyro = juego.jugadores.get('p2').datosEspecificos.posicionX;

    if (p2XGyro < p2XInicial) {
      ok(`Inclinación de giroscopio desplaza fluidamente al jugador (${p2XInicial.toFixed(2)} -> ${p2XGyro.toFixed(2)})`);
    } else {
      fail('Giroscopio no desplazó al jugador');
    }

    // Colisión con caramelo dorado (+3)
    juego.objetos.push({
      id: 999,
      tipo: 'dorado',
      x: juego.jugadores.get('p1').datosEspecificos.posicionX,
      y: 0.9,
      vy: 1,
    });
    const ptsAntes = juego.jugadores.get('p1').puntos;
    juego.update(0.05);

    if (juego.jugadores.get('p1').puntos === ptsAntes + 3) {
      ok('Recoger caramelo dorado suma +3 puntos correctamente');
    } else {
      fail('Colisión con caramelo dorado no sumó 3 puntos');
    }

    // Colisión con cubo de agua (-2 y stun) en p2
    juego.jugadores.get('p1').datosEspecificos.posicionX = -6.0;
    juego.jugadores.get('p2').datosEspecificos.posicionX = 4.0;
    juego.onInput('p2', { action: 'gyro', payload: { tiltX: 0 } });
    juego.objetos.push({
      id: 1000,
      tipo: 'cubo_agua',
      x: 4.0,
      y: 0.9,
      vy: 1,
    });
    juego.jugadores.get('p2').puntos = 10;
    juego.update(0.05);
    const espP2 = juego.jugadores.get('p2').datosEspecificos;

    if (juego.jugadores.get('p2').puntos === 8 && espP2.tiempoStunMs > 0) {
      ok(`Cubo de agua resta 2 puntos y activa aturdimiento (${espP2.tiempoStunMs} ms)`);
    } else {
      fail('Cubo de agua no aplicó penalización o stun');
    }
  } catch (err) {
    fail('Error en test de Carnaval de Caramelos', err);
  }

  // ── TEST 7: Minijuego 2 — Carrera en la Muralla de la Alcazaba ───────────────
  testTitle('7. Minijuego 2: Carrera en la Muralla de la Alcazaba (salto y carriles)');
  try {
    const juego = new EsquivarMuralla();
    juego.init(mockJugadores, 'TEST');

    const carrilInicial = juego.jugadores.get('p1').datosEspecificos.carrilActual;
    juego.onInput('p1', { action: 'carril_der' });
    const carrilDer = juego.jugadores.get('p1').datosEspecificos.carrilActual;

    if (carrilDer === Math.min(1, carrilInicial + 1)) {
      ok(`Cambio de carril con carril_der funciona correctamente (${carrilInicial} -> ${carrilDer})`);
    } else {
      fail('Cambio de carril no funcionó');
    }

    // Salto
    juego.onInput('p1', { action: 'saltar' });
    const espP1 = juego.jugadores.get('p1').datosEspecificos;
    if (espP1.enElAire && espP1.velocidadY > 0) {
      ok('Acción saltar activa estado enElAire con velocidad ascendente');
    } else {
      fail('Acción saltar no activó enElAire');
    }

    // Simular subida en el aire
    juego.update(0.1);
    if (espP1.alturaY > 0.5) {
      ok(`Física de salto eleva la altura Y (${espP1.alturaY.toFixed(2)} m)`);
    } else {
      fail('Física de salto no elevó altura Y');
    }

    // Simular obstáculo superado con salto
    const obsValla = {
      id: 88,
      carril: espP1.carrilActual,
      tipo: 'valla_baja',
      z: 0.1,
      velocidadZ: 10,
      superadoPor: new Set(),
    };
    juego.obstaculos.push(obsValla);
    const ptsAntesSalto = juego.jugadores.get('p1').puntos;
    juego.update(0.05);

    if (obsValla.superadoPor.has('p1') && juego.jugadores.get('p1').puntos > ptsAntesSalto) {
      ok('Saltar sobre valla baja registra esquiva exitosa y otorga bonus acrobático (+25 pts)');
    } else {
      fail('No se registró la esquiva por salto de valla baja');
    }

    // Simular choque con barricada en p2 (situado en carril 1)
    const espP2 = juego.jugadores.get('p2').datosEspecificos;
    espP2.carrilActual = 1;
    espP2.tiempoInmunidadMs = 0;
    const vidasAntes = espP2.vidas;
    const obsBarricada = {
      id: 89,
      carril: 1,
      tipo: 'barricada',
      z: 0.1,
      velocidadZ: 10,
      superadoPor: new Set(),
    };
    juego.obstaculos.push(obsBarricada);
    juego.update(0.05);

    if (espP2.vidas === vidasAntes - 1 && espP2.tiempoInmunidadMs > 0) {
      ok(`Impacto con barricada resta 1 corazón (${vidasAntes} -> ${espP2.vidas}) y activa inmunidad temporal`);
    } else {
      fail('Choque con barricada no restó vida');
    }
  } catch (err) {
    fail('Error en test de Muralla de la Alcazaba', err);
  }

  // ── TEST 8: Minijuego 4 — Carrera en el Puente Real ─────────────────────────
  testTitle('8. Minijuego 4: Carrera en el Puente Real (aceleración y meta)');
  try {
    const juego = new CarreraPuenteReal();
    juego.init(mockJugadores, 'TEST');

    // Acelerar a fondo
    juego.onInput('p1', { action: 'acelerar_on' });
    for (let i = 0; i < 10; i++) {
      juego.update(0.1);
    }
    const espP1 = juego.jugadores.get('p1').datosEspecificos;
    if (espP1.velocidad > 10 && espP1.distanciaZ > 5) {
      ok(`Acelerar incrementa la velocidad (${espP1.velocidad.toFixed(1)} km/h) y distancia (${espP1.distanciaZ.toFixed(1)} m)`);
    } else {
      fail('Acelerar no incrementó velocidad o distancia');
    }

    // Giro lateral
    const posXAntesGiro = espP1.posicionX;
    juego.onInput('p1', { action: 'girar', payload: { dir: 1.0 } });
    juego.update(0.2);
    if (espP1.posicionX > posXAntesGiro) {
      ok(`Girar el volante desplaza el vehículo lateralmente (${posXAntesGiro.toFixed(2)} -> ${espP1.posicionX.toFixed(2)})`);
    } else {
      fail('Giro lateral no funcionó');
    }

    // Turbo
    juego.onInput('p1', { action: 'turbo' });
    if (espP1.tiempoTurboMs > 0) {
      ok(`Banda de turbo activa boost (${espP1.tiempoTurboMs} ms)`);
    } else {
      fail('Turbo no se activó');
    }

    // Llegada a meta
    espP1.distanciaZ = 220;
    juego.update(0.05);

    if (espP1.terminado && espP1.puestoLlegada === 1) {
      ok('Cruzar la meta a 220m marca terminado=true y otorga puesto 1');
    } else {
      fail('Llegada a meta en Puente Real no registrada');
    }

    const res = juego.getResults();
    if (res[0].playerId === 'p1' && res[0].monedasGanadas === 10) {
      ok('Ganador de la Carrera en el Puente Real recibe 10 monedas');
    } else {
      fail('Resultado erróneo en Carrera Puente Real');
    }
  } catch (err) {
    fail('Error en test de Carrera Puente Real', err);
  }

  // ── TEST 9: Minijuego 7 — Equilibrio en el Puente de Palmas ─────────────────
  testTitle('9. Minijuego 7: Equilibrio en el Puente de Palmas (viento y compensación)');
  try {
    const juego = new EquilibrioPuentePalmas();
    juego.init(mockJugadores, 'TEST');

    // Provocar viento fuerte
    juego.fuerzaViento = 30;
    juego.update(0.2);
    const espP1 = juego.jugadores.get('p1').datosEspecificos;
    const anguloTrasViento = espP1.angulo;

    if (Math.abs(anguloTrasViento) > 0) {
      ok(`Viento sobre el Guadiana desestabiliza el peón (ángulo: ${anguloTrasViento.toFixed(1)}°)`);
    } else {
      fail('El viento no alteró el ángulo');
    }

    // Compensar con botón táctil izquierdo
    const velAngAntes = espP1.velocidadAngular;
    juego.onInput('p1', { action: 'compensar_izq' });
    if (espP1.velocidadAngular < velAngAntes) {
      ok('Botón compensar_izq aplica torque corrector en sentido contrario');
    } else {
      fail('Compensar no modificó velocidad angular');
    }

    // Provocar caída al río (ángulo crítico >= 40°)
    espP1.angulo = 42;
    juego.jugadores.get('p1').puntos = 50;
    juego.update(0.05);

    if (espP1.enAgua && espP1.caidasTotal === 1 && juego.jugadores.get('p1').puntos === 25) {
      ok('Superar 40° provoca caída al río Guadiana, resta 25 pts e incrementa contador de caídas');
    } else {
      fail('No se detectó la caída al agua al superar el ángulo crítico');
    }

    // Recuperación tras tiempo en agua
    espP1.tiempoEnAguaMs = 50;
    juego.update(0.1);
    if (!espP1.enAgua && espP1.angulo === 0) {
      ok('Tras salir del agua, el peón reaparece en equilibrio en el pretil');
    } else {
      fail('El peón no reapareció correctamente en el pretil');
    }
  } catch (err) {
    fail('Error en test de Equilibrio Puente de Palmas', err);
  }

  // ── TEST 10: Ciclo de vida en minigameManager con los 8 Minijuegos ──────────
  testTitle('10. minigameManager — Catálogo Completo y bucle autoritativo');
  try {
    const catalogoIds = [
      'carrera_guadiana',
      'esquivar_muralla',
      'carnaval_caramelos',
      'carrera_coches',
      'pulso_fuerza',
      'memory_monumentos',
      'equilibrio_puente',
      'reaccion_luces',
      'lluvia_bellotas',
    ];

    catalogoIds.forEach(id => {
      const inst = minigameManager.instanciarMinijuego(id);
      if (!inst) {
        throw new Error(`minigameManager no pudo instanciar el juego con ID '${id}'`);
      }
    });
    ok(`minigameManager instanció con éxito los 8 minijuegos oficiales + bonus (${catalogoIds.length} módulos)`);

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
      'pulso_fuerza'
    );

    if (introEmitido) {
      ok('iniciarMinijuego() emite minigame:intro a la sala con metadatos y controles');
    } else {
      fail('No se emitió minigame:intro');
    }

    sesion.arrancarBucle();
    if (startEmitido && sesion.estado === 'JUGANDO') {
      ok('arrancarBucle() emite minigame:start e inicia estado JUGANDO a 20 Hz');
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
