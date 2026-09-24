/**
 * src/minigames/esquivarMuralla.js — Minijuego 2: Esquivar obstáculos en la muralla de la Alcazaba
 *
 * CONCEPTO:
 * - Carrera de obstáculos por el adarve superior de la muralla de la Alcazaba.
 * - Mecánica autoritativa: 3 carriles (-1, 0, +1) y salto en el eje Y.
 * - Obstáculos procedurales que avanzan hacia los jugadores:
 *   * 'valla_baja': se esquiva saltando o cambiando de carril.
 *   * 'barricada': alta, solo se esquiva cambiando de carril.
 * - Inputs: 'carril_izq', 'carril_der', 'saltar'.
 */

'use strict';

const { MinigameBase, MONEDAS_POR_PUESTO } = require('./minigameBase');

const ANCHO_CARRIL = 2.4; // Distancia entre carriles en Three.js

class EsquivarMuralla extends MinigameBase {
  constructor() {
    super({
      id: 'esquivar_muralla',
      nombre: 'Carrera en la Muralla de la Alcazaba',
      subtitulo: '¡Esquiva obstáculos y salta sobre las almenas!',
      descripcion: 'Corre por la muralla de la Alcazaba. Cambia entre carriles con IZQ y DER, y pulsa SALTAR para superar las vallas.',
      controlesTexto: 'Usa los botones IZQ y DER para moverte de carril, y SALTAR para esquivar las vallas bajas.',
      tipoControl: 'joypad_carriles_salto',
      duracionSegundos: 20,
    });

    this.obstaculos = [];
    this.proximoIdObstaculo = 1;
    this.siguienteSpawnMs = 0;
    this.distanciaRecorrida = 0;
  }

  init(players, roomCode, options = {}) {
    super.init(players, roomCode, options);

    this.obstaculos = [];
    this.proximoIdObstaculo = 1;
    this.siguienteSpawnMs = 1200; // Primer obstáculo tras 1.2s
    this.distanciaRecorrida = 0;

    this.jugadores.forEach((j) => {
      j.datosEspecificos = {
        carrilActual: (j.carril % 3) - 1, // -1 (izq), 0 (centro), 1 (der)
        alturaY: 0,
        velocidadY: 0,
        enElAire: false,
        vidas: 3,
        tiempoInmunidadMs: 0,
        esquivasCorrectas: 0,
      };
    });
  }

  onInput(playerId, input = {}) {
    if (this.terminado) return;
    const j = this.jugadores.get(playerId);
    if (!j) return;

    const action = input.action || '';
    const esp = j.datosEspecificos;

    if (action === 'carril_izq' || action === 'izq') {
      esp.carrilActual = Math.max(-1, esp.carrilActual - 1);
    } else if (action === 'carril_der' || action === 'der') {
      esp.carrilActual = Math.min(1, esp.carrilActual + 1);
    } else if (action === 'saltar' || action === 'jump') {
      if (!esp.enElAire && esp.alturaY <= 0.05) {
        esp.enElAire = true;
        esp.velocidadY = 9.5; // Impulso de salto
      }
    }
  }

  update(dt) {
    super.update(dt);
    if (this.terminado) return;

    const dtMs = dt * 1000;
    this.distanciaRecorrida += 15 * dt;

    // 1. Físicas de salto para cada jugador
    const GRAVEDAD = 24;
    this.jugadores.forEach((j) => {
      const esp = j.datosEspecificos;

      if (esp.tiempoInmunidadMs > 0) {
        esp.tiempoInmunidadMs = Math.max(0, esp.tiempoInmunidadMs - dtMs);
      }

      if (esp.enElAire) {
        esp.alturaY += esp.velocidadY * dt;
        esp.velocidadY -= GRAVEDAD * dt;

        if (esp.alturaY <= 0) {
          esp.alturaY = 0;
          esp.velocidadY = 0;
          esp.enElAire = false;
        }
      }

      // Puntos continuos por supervivencia y distancia
      if (esp.vidas > 0) {
        j.puntos += Math.round(10 * dt);
      }
    });

    // 2. Spawnear obstáculos en los carriles (-1, 0, 1)
    this.siguienteSpawnMs -= dtMs;
    if (this.siguienteSpawnMs <= 0) {
      this.siguienteSpawnMs = 700 + Math.random() * 450;

      // Elegir carril aleatorio y tipo
      const carril = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
      const tipo = Math.random() < 0.55 ? 'valla_baja' : 'barricada';

      this.obstaculos.push({
        id: this.proximoIdObstaculo++,
        carril,
        tipo,
        z: -35, // Viene desde el fondo hacia adelante
        velocidadZ: 18 + Math.min(6, this.distanciaRecorrida * 0.02),
        superadoPor: new Set(),
      });
    }

    // 3. Mover obstáculos hacia los peones (Z = 0) y detectar choques
    const obstaculosRestantes = [];

    for (const obs of this.obstaculos) {
      obs.z += obs.velocidadZ * dt;

      // Comprobar colisión en Z cercano a 0
      if (Math.abs(obs.z) < 1.2) {
        this.jugadores.forEach((j) => {
          const esp = j.datosEspecificos;
          if (esp.carrilActual === obs.carril && !obs.superadoPor.has(j.playerId)) {
            // Comprobar si esquivó saltando la valla baja (altura obstáculo ~0.9m)
            const esquivadoPorSalto = obs.tipo === 'valla_baja' && esp.alturaY > 0.8;

            if (esquivadoPorSalto) {
              // ¡Salto perfecto sobre la valla!
              obs.superadoPor.add(j.playerId);
              esp.esquivasCorrectas++;
              j.puntos += 25; // Bonus por acrobacia
            } else if (esp.tiempoInmunidadMs <= 0) {
              // ¡Impacto con el obstáculo!
              obs.superadoPor.add(j.playerId);
              esp.vidas = Math.max(0, esp.vidas - 1);
              esp.tiempoInmunidadMs = 1200; // 1.2s de invulnerabilidad
              j.puntos = Math.max(0, j.puntos - 20);
            }
          }
        });
      }

      // Descartar obstáculos que ya pasaron
      if (obs.z < 8) {
        obstaculosRestantes.push(obs);
      }
    }
    this.obstaculos = obstaculosRestantes;
  }

  getStateSnapshot() {
    return {
      minijuegoId: this.info.id,
      tiempoRestanteMs: Math.round(this.tiempoRestanteMs),
      distanciaMetros: Math.round(this.distanciaRecorrida),
      jugadores: Array.from(this.jugadores.values()).map(j => ({
        playerId: j.playerId,
        nombre: j.nombre,
        color: j.color,
        carril: j.carril,
        puntos: j.puntos,
        carrilActual: j.datosEspecificos.carrilActual,
        posicionX: j.datosEspecificos.carrilActual * ANCHO_CARRIL,
        alturaY: Math.round(j.datosEspecificos.alturaY * 100) / 100,
        enElAire: j.datosEspecificos.enElAire,
        vidas: j.datosEspecificos.vidas,
        inmune: j.datosEspecificos.tiempoInmunidadMs > 0,
      })),
      obstaculos: this.obstaculos.map(o => ({
        id: o.id,
        carril: o.carril,
        x: o.carril * ANCHO_CARRIL,
        z: Math.round(o.z * 100) / 100,
        tipo: o.tipo,
      })),
    };
  }

  getResults() {
    const lista = Array.from(this.jugadores.values());

    lista.sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      return b.datosEspecificos.vidas - a.datosEspecificos.vidas;
    });

    return lista.map((j, i) => ({
      puesto: i + 1,
      playerId: j.playerId,
      nombre: j.nombre,
      avatarId: j.avatarId,
      color: j.color,
      puntos: `${j.puntos} pts (${j.datosEspecificos.vidas} ❤️)`,
      monedasGanadas: MONEDAS_POR_PUESTO[i] || 1,
    }));
  }
}

module.exports = EsquivarMuralla;
