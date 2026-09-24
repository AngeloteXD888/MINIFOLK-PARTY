/**
 * src/minigames/lluviaBellotas.js — Minijuego adicional: Lluvia de Bellotas en la Dehesa
 *
 * CONCEPTO:
 * - Ambientado en la dehesa extremeña con encinas.
 * - Caída física autoritativa de bellotas normales (+1), doradas (+3) y piedras (-2 y aturdimiento).
 * - En el móvil: botones IZQ, DER y TURBO.
 */

'use strict';

const { MinigameBase, MONEDAS_POR_PUESTO } = require('./minigameBase');

class LluviaBellotas extends MinigameBase {
  constructor() {
    super({
      id: 'lluvia_bellotas',
      nombre: 'Lluvia de Bellotas en la Dehesa',
      subtitulo: '¡Atrapa las mejores bellotas bajo las encinas!',
      descripcion: 'Muévete para atrapar bellotas normales (+1) y doradas (+3). ¡Cuidado con las piedras (-2)!',
      controlesTexto: 'Usa los botones IZQ y DER para mover tu cesta. ¡Usa TURBO para sprintar!',
      tipoControl: 'lateral_turbo',
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
        inputActual: { izq: false, der: false, turbo: false },
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

    if (action === 'mover') {
      esp.inputActual.izq = payload.dir < 0;
      esp.inputActual.der = payload.dir > 0;
      esp.inputActual.turbo = !!payload.turbo;
    } else if (action === 'tap_izq') {
      esp.posicionX = Math.max(-7.5, esp.posicionX - 1.2);
    } else if (action === 'tap_der') {
      esp.posicionX = Math.min(7.5, esp.posicionX + 1.2);
    }
  }

  update(dt) {
    super.update(dt);
    if (this.terminado) return;

    const dtMs = dt * 1000;

    // 1. Mover jugadores
    this.jugadores.forEach(j => {
      const esp = j.datosEspecificos;
      if (esp.tiempoStunMs > 0) {
        esp.tiempoStunMs = Math.max(0, esp.tiempoStunMs - dtMs);
        return;
      }

      const speed = esp.inputActual.turbo ? 9.5 : 5.8;
      if (esp.inputActual.izq) {
        esp.posicionX = Math.max(-7.5, esp.posicionX - speed * dt);
      }
      if (esp.inputActual.der) {
        esp.posicionX = Math.min(7.5, esp.posicionX + speed * dt);
      }
    });

    // 2. Spawnear bellotas
    this.siguienteSpawnMs -= dtMs;
    if (this.siguienteSpawnMs <= 0) {
      this.siguienteSpawnMs = 380 + Math.random() * 200;
      const rand = Math.random();
      let tipo = 'normal'; // +1
      if (rand < 0.22) tipo = 'dorada'; // +3
      else if (rand < 0.42) tipo = 'piedra'; // -2

      this.objetos.push({
        id: this.proximoIdObjeto++,
        tipo,
        x: -7.0 + Math.random() * 14.0,
        y: 11.0,
        vy: 5.0 + Math.random() * 3.5,
      });
    }

    // 3. Mover y colisionar
    const objetosRestantes = [];
    const SUELO_Y = 0.8;
    const RADIO_COLISION = 1.35;

    for (const obj of this.objetos) {
      obj.y -= obj.vy * dt;

      let recogido = false;
      for (const j of this.jugadores.values()) {
        const esp = j.datosEspecificos;
        const dx = Math.abs(esp.posicionX - obj.x);
        const dy = Math.abs(SUELO_Y - obj.y);

        if (dx < RADIO_COLISION && dy < 1.1) {
          recogido = true;
          if (obj.tipo === 'dorada') {
            j.puntos += 3;
          } else if (obj.tipo === 'normal') {
            j.puntos += 1;
          } else if (obj.tipo === 'piedra') {
            j.puntos = Math.max(0, j.puntos - 2);
            esp.tiempoStunMs = 700;
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

module.exports = LluviaBellotas;
