/**
 * src/minigames/carnavalCaramelos.js — Minijuego 3: Lluvia de caramelos del Carnaval de Badajoz
 *
 * CONCEPTO:
 * - El multitudinario Carnaval de Badajoz (Fiesta de Interés Turístico Internacional).
 * - Las comparsas desfilan y lanzan caramelos, serpentinas y antifaces.
 * - Mecánica autoritativa: mover la cesta para atrapar dulces y evitar cubos de agua.
 * - Soporte híbrido: control por inclinación (giroscopio) o botones táctiles IZQ/DER.
 */

'use strict';

const { MinigameBase, MONEDAS_POR_PUESTO } = require('./minigameBase');

class CarnavalCaramelos extends MinigameBase {
  constructor() {
    super({
      id: 'carnaval_caramelos',
      nombre: 'Caramelos del Carnaval de Badajoz',
      subtitulo: '¡Atrapa los dulces del gran desfile de comparsas!',
      descripcion: 'Mueve tu cesta usando los botones o inclinando tu móvil (giroscopio). Recoge caramelos (+1), caramelos dorados (+3) y antifaces (+5). ¡Evita los cubos de agua (-2)!',
      controlesTexto: 'Inclina el móvil o usa los botones IZQ / DER para moverte. ¡Usa TURBO para esprintar!',
      tipoControl: 'giroscopio_o_botones',
      duracionSegundos: 20,
    });

    this.objetos = [];
    this.proximoIdObjeto = 1;
    this.siguienteSpawnMs = 0;
  }

  init(players, roomCode, options = {}) {
    super.init(players, roomCode, options);

    this.objetos = [];
    this.proximoIdObjeto = 1;
    this.siguienteSpawnMs = 0;

    const separacionX = 14 / Math.max(1, players.length);

    this.jugadores.forEach((j) => {
      j.datosEspecificos = {
        posicionX: -7 + (j.carril + 0.5) * separacionX,
        tiempoStunMs: 0,
        velocidadX: 0,
        inputActual: { izq: false, der: false, turbo: false, tiltX: 0 },
      };
    });
  }

  onInput(playerId, input = {}) {
    if (this.terminado) return;
    const j = this.jugadores.get(playerId);
    if (!j || j.datosEspecificos.tiempoStunMs > 0) return;

    const action = input.action || '';
    const payload = input.payload || {};
    const esp = j.datosEspecificos;

    if (action === 'inclinacion' || action === 'gyro') {
      // Giroscopio: payload.tiltX oscila típicamente entre -1.0 y 1.0
      const tilt = Math.max(-1.0, Math.min(1.0, payload.tiltX || 0));
      esp.inputActual.tiltX = tilt;
      esp.inputActual.izq = tilt < -0.15;
      esp.inputActual.der = tilt > 0.15;
      esp.inputActual.turbo = Math.abs(tilt) > 0.65;
    } else if (action === 'mover') {
      esp.inputActual.izq = payload.dir < 0;
      esp.inputActual.der = payload.dir > 0;
      esp.inputActual.turbo = !!payload.turbo;
    } else if (action === 'tap_izq') {
      esp.posicionX = Math.max(-7.8, esp.posicionX - 1.3);
    } else if (action === 'tap_der') {
      esp.posicionX = Math.min(7.8, esp.posicionX + 1.3);
    }
  }

  update(dt) {
    super.update(dt);
    if (this.terminado) return;

    const dtMs = dt * 1000;

    // 1. Mover jugadores según controles
    this.jugadores.forEach((j) => {
      const esp = j.datosEspecificos;
      if (esp.tiempoStunMs > 0) {
        esp.tiempoStunMs = Math.max(0, esp.tiempoStunMs - dtMs);
        return;
      }

      let speed = esp.inputActual.turbo ? 9.8 : 6.0;

      // Si usa giroscopio analógico suave
      if (Math.abs(esp.inputActual.tiltX) > 0.1) {
        esp.posicionX = Math.max(-7.8, Math.min(7.8, esp.posicionX + esp.inputActual.tiltX * speed * dt * 1.5));
      } else {
        if (esp.inputActual.izq) {
          esp.posicionX = Math.max(-7.8, esp.posicionX - speed * dt);
        }
        if (esp.inputActual.der) {
          esp.posicionX = Math.min(7.8, esp.posicionX + speed * dt);
        }
      }
    });

    // 2. Generación procedural de dulces y objetos carnavaleros
    this.siguienteSpawnMs -= dtMs;
    if (this.siguienteSpawnMs <= 0) {
      this.siguienteSpawnMs = 320 + Math.random() * 220;
      const rand = Math.random();
      let tipo = 'caramelo'; // +1

      if (rand < 0.20) {
        tipo = 'dorado'; // +3 (caramelo dorado de comparsa)
      } else if (rand < 0.32) {
        tipo = 'mascara'; // +5 (antifaz de carnaval)
      } else if (rand < 0.48) {
        tipo = 'cubo_agua'; // -2 (broma carnavalera)
      }

      this.objetos.push({
        id: this.proximoIdObjeto++,
        tipo,
        x: -7.2 + Math.random() * 14.4,
        y: 11.5,
        vy: 5.2 + Math.random() * 3.8,
      });
    }

    // 3. Simular caída y detección de colisiones
    const objetosRestantes = [];
    const SUELO_Y = 0.8;
    const RADIO_COLISION = 1.4;

    for (const obj of this.objetos) {
      obj.y -= obj.vy * dt;

      let atrapado = false;
      for (const j of this.jugadores.values()) {
        const esp = j.datosEspecificos;
        const dx = Math.abs(esp.posicionX - obj.x);
        const dy = Math.abs(SUELO_Y - obj.y);

        if (dx < RADIO_COLISION && dy < 1.15) {
          atrapado = true;
          if (obj.tipo === 'mascara') {
            j.puntos += 5;
          } else if (obj.tipo === 'dorado') {
            j.puntos += 3;
          } else if (obj.tipo === 'caramelo') {
            j.puntos += 1;
          } else if (obj.tipo === 'cubo_agua') {
            j.puntos = Math.max(0, j.puntos - 2);
            esp.tiempoStunMs = 700; // aturdimiento
          }
          break;
        }
      }

      if (!atrapado && obj.y > 0) {
        objetosRestantes.push(obj);
      }
    }
    this.objetos = objetosRestantes;
  }

  getStateSnapshot() {
    return {
      minijuegoId: this.info.id,
      tiempoRestanteMs: Math.round(this.tiempoRestanteMs),
      jugadores: Array.from(this.jugadores.values()).map(j => ({
        playerId: j.playerId,
        nombre: j.nombre,
        color: j.color,
        carril: j.carril,
        posicionX: Math.round(j.datosEspecificos.posicionX * 100) / 100,
        puntos: j.puntos,
        tiempoStunMs: Math.round(j.datosEspecificos.tiempoStunMs),
      })),
      objetos: this.objetos.map(o => ({
        id: o.id,
        tipo: o.tipo,
        x: Math.round(o.x * 100) / 100,
        y: Math.round(o.y * 100) / 100,
      })),
    };
  }

  getResults() {
    const lista = Array.from(this.jugadores.values());
    lista.sort((a, b) => b.puntos - a.puntos);

    return lista.map((j, i) => ({
      puesto: i + 1,
      playerId: j.playerId,
      nombre: j.nombre,
      avatarId: j.avatarId,
      color: j.color,
      puntos: `${j.puntos} pts`,
      monedasGanadas: MONEDAS_POR_PUESTO[i] || 1,
    }));
  }
}

module.exports = CarnavalCaramelos;
