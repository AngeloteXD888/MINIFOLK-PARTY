/**
 * src/minigames/carreraPuenteReal.js — Minijuego 4: Carrera de coches por el Puente Real
 *
 * CONCEPTO:
 * - Carrera de coches clásicos y coloridos sobre la calzada del Puente Real de Badajoz.
 * - Conducción con aceleración, curvas, bandas de turbo doradas y manchas de aceite.
 * - Soporte de control: acelerar/frenar y giro por botones o inclinación (giroscopio).
 */

'use strict';

const { MinigameBase, MONEDAS_POR_PUESTO } = require('./minigameBase');

const META_METROS = 220;
const ANCHO_CALZADA = 8.0;

class CarreraPuenteReal extends MinigameBase {
  constructor() {
    super({
      id: 'carrera_coches',
      nombre: 'Carrera en el Puente Real',
      subtitulo: '¡Acelera a fondo sobre los tirantes del Guadiana!',
      descripcion: 'Conduce tu coche clásico por el asfalto del Puente Real. Acelera y gira para adelantar a tus rivales, pillar turbos y evitar manchas de aceite.',
      controlesTexto: 'Mantén pulsado ACELERAR y usa IZQ / DER o inclina tu móvil para trazar la calzada.',
      tipoControl: 'volante_pedal',
      duracionSegundos: 22,
    });

    this.llegadosCount = 0;
    this.elementosPista = []; // turbos y aceites
  }

  init(players, roomCode, options = {}) {
    super.init(players, roomCode, options);

    this.llegadosCount = 0;
    this.elementosPista = [];

    // Generar bandas de turbo y charcos de aceite a lo largo del puente
    for (let dist = 30; dist < META_METROS - 20; dist += 28) {
      this.elementosPista.push({
        id: `turbo_${dist}`,
        tipo: 'turbo',
        distancia: dist,
        x: (Math.random() - 0.5) * (ANCHO_CALZADA - 2.5),
      });
      this.elementosPista.push({
        id: `aceite_${dist + 14}`,
        tipo: 'aceite',
        distancia: dist + 14,
        x: (Math.random() - 0.5) * (ANCHO_CALZADA - 2.5),
      });
    }

    const carrilesIniciales = [-2.4, -0.8, 0.8, 2.4];

    this.jugadores.forEach((j) => {
      j.datosEspecificos = {
        distanciaZ: 0,
        posicionX: carrilesIniciales[j.carril % 4],
        velocidad: 0,
        acelerando: false,
        frenando: false,
        giroDir: 0,        // -1 (izq) a 1 (der)
        tiempoSpinMs: 0,   // por pisar aceite
        tiempoTurboMs: 0,
        terminado: false,
        puestoLlegada: null,
      };
    });
  }

  onInput(playerId, input = {}) {
    if (this.terminado) return;
    const j = this.jugadores.get(playerId);
    if (!j || j.datosEspecificos.terminado) return;

    const action = input.action || '';
    const payload = input.payload || {};
    const esp = j.datosEspecificos;

    if (action === 'acelerar_on') {
      esp.acelerando = true;
    } else if (action === 'acelerar_off') {
      esp.acelerando = false;
    } else if (action === 'frenar_on') {
      esp.frenando = true;
    } else if (action === 'frenar_off') {
      esp.frenando = false;
    } else if (action === 'girar') {
      esp.giroDir = Math.max(-1, Math.min(1, payload.dir || 0));
    } else if (action === 'inclinacion' || action === 'gyro') {
      const tilt = Math.max(-1, Math.min(1, (payload.tiltX || 0) * 1.5));
      esp.giroDir = tilt;
    } else if (action === 'turbo') {
      esp.tiempoTurboMs = 1200;
    }
  }

  update(dt) {
    super.update(dt);
    if (this.terminado) return;

    const dtMs = dt * 1000;

    this.jugadores.forEach((j) => {
      const esp = j.datosEspecificos;
      if (esp.terminado) return;

      if (esp.tiempoSpinMs > 0) {
        esp.tiempoSpinMs = Math.max(0, esp.tiempoSpinMs - dtMs);
        esp.velocidad = Math.max(0, esp.velocidad - 30 * dt);
        return;
      }

      // Físicas de aceleración y turbo
      let velMax = 24.0;
      let acel = 14.0;

      if (esp.tiempoTurboMs > 0) {
        esp.tiempoTurboMs = Math.max(0, esp.tiempoTurboMs - dtMs);
        velMax = 34.0;
        acel = 28.0;
      }

      if (esp.acelerando) {
        esp.velocidad = Math.min(velMax, esp.velocidad + acel * dt);
      } else if (esp.frenando) {
        esp.velocidad = Math.max(0, esp.velocidad - 25.0 * dt);
      } else {
        // Fricción pasiva de rodadura
        esp.velocidad = Math.max(0, esp.velocidad - 6.0 * dt);
      }

      // Desplazamiento lateral por giro del volante
      if (esp.velocidad > 1.0) {
        const velGiro = 8.5 * (esp.velocidad / velMax);
        esp.posicionX = Math.max(
          -ANCHO_CALZADA / 2,
          Math.min(ANCHO_CALZADA / 2, esp.posicionX + esp.giroDir * velGiro * dt)
        );
      }

      // Avance longitudinal por la calzada
      esp.distanciaZ += esp.velocidad * dt * 2.5;

      // Detectar colisión con turbos y charcos de aceite
      for (const elem of this.elementosPista) {
        if (Math.abs(esp.distanciaZ - elem.distancia) < 1.8 && Math.abs(esp.posicionX - elem.x) < 1.4) {
          if (elem.tipo === 'turbo') {
            esp.tiempoTurboMs = 1500;
            esp.velocidad = Math.min(34.0, esp.velocidad + 8.0);
          } else if (elem.tipo === 'aceite') {
            esp.tiempoSpinMs = 800; // trompo
          }
        }
      }

      // Comprobar llegada a meta
      if (esp.distanciaZ >= META_METROS) {
        esp.distanciaZ = META_METROS;
        esp.terminado = true;
        this.llegadosCount++;
        esp.puestoLlegada = this.llegadosCount;
        j.puntos = Math.max(10, 100 - (this.llegadosCount - 1) * 25);
      }
    });

    if (this.llegadosCount >= this.jugadores.size && this.jugadores.size > 0) {
      this.terminado = true;
    }
  }

  getStateSnapshot() {
    return {
      minijuegoId: this.info.id,
      tiempoRestanteMs: Math.round(this.tiempoRestanteMs),
      metaMetros: META_METROS,
      elementosPista: this.elementosPista.map(e => ({
        id: e.id,
        tipo: e.tipo,
        distancia: Math.round(e.distancia),
        x: Math.round(e.x * 10) / 10,
      })),
      jugadores: Array.from(this.jugadores.values()).map(j => ({
        playerId: j.playerId,
        nombre: j.nombre,
        color: j.color,
        carril: j.carril,
        puntos: j.puntos,
        distanciaZ: Math.round(j.datosEspecificos.distanciaZ * 10) / 10,
        posicionX: Math.round(j.datosEspecificos.posicionX * 100) / 100,
        velocidad: Math.round(j.datosEspecificos.velocidad * 10) / 10,
        trompo: j.datosEspecificos.tiempoSpinMs > 0,
        turbo: j.datosEspecificos.tiempoTurboMs > 0,
        terminado: j.datosEspecificos.terminado,
        puestoLlegada: j.datosEspecificos.puestoLlegada,
      })),
    };
  }

  getResults() {
    const lista = Array.from(this.jugadores.values());

    lista.sort((a, b) => {
      const espA = a.datosEspecificos;
      const espB = b.datosEspecificos;

      if (espA.puestoLlegada && espB.puestoLlegada) return espA.puestoLlegada - espB.puestoLlegada;
      if (espA.puestoLlegada) return -1;
      if (espB.puestoLlegada) return 1;

      return espB.distanciaZ - espA.distanciaZ;
    });

    return lista.map((j, i) => {
      const esp = j.datosEspecificos;
      return {
        puesto: i + 1,
        playerId: j.playerId,
        nombre: j.nombre,
        avatarId: j.avatarId,
        color: j.color,
        puntos: esp.puestoLlegada ? `${Math.round(esp.distanciaZ)}m (Meta)` : `${Math.round(esp.distanciaZ)}m`,
        monedasGanadas: MONEDAS_POR_PUESTO[i] || 1,
      };
    });
  }
}

module.exports = CarreraPuenteReal;
