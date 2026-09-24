/**
 * src/minigames/piraguismoGuadiana.js — Minijuego 1 (MVP): Piragüismo en el Guadiana
 *
 * CONCEPTO:
 * - Regata de piraguas por las aguas del río Guadiana con vistas al Puente de Palmas.
 * - En el móvil: dos botones táctiles grandes ("REMO A / IZQ" y "REMO B / DER").
 * - Mecánica: alternar remo A y B con ritmo para alcanzar la aceleración punta.
 * - Meta a 100 metros.
 */

'use strict';

const { MinigameBase, MONEDAS_POR_PUESTO } = require('./minigameBase');

const META_METROS = 100;

class PiraguismoGuadiana extends MinigameBase {
  constructor() {
    super({
      id: 'carrera_guadiana', // Compatible con frontend e identificadores
      aliasId: 'piraguismo_guadiana',
      nombre: 'Piragüismo en el Guadiana',
      subtitulo: '¡Rema con ritmo por el Guadiana hasta el Puente de Palmas!',
      descripcion: 'Alterna remo A (izq) y remo B (der) con ritmo constante para alcanzar máxima velocidad.',
      controlesTexto: 'Toca alternadamente los botones REMO A y REMO B en el móvil.',
      tipoControl: 'dos_botones',
      duracionSegundos: 18,
    });
    this.llegadosCount = 0;
  }

  init(players, roomCode, options = {}) {
    super.init(players, roomCode, options);
    this.llegadosCount = 0;

    // Inicializar estado específico de navegación para cada piragua
    this.jugadores.forEach((j, index) => {
      j.datosEspecificos = {
        posicionX: 0,
        velocidad: 0,
        ultimoRemo: null,   // 'izq' | 'der' | 'A' | 'B'
        tiempoStunMs: 0,
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
    let lado = null;

    if (action === 'remo_izq' || action === 'remo_a' || action === 'A') {
      lado = 'izq';
    } else if (action === 'remo_der' || action === 'remo_b' || action === 'B') {
      lado = 'der';
    } else if (action === 'remo') {
      lado = input.payload?.lado === 'der' || input.payload?.lado === 'B' ? 'der' : 'izq';
    }

    if (!lado) return;

    const esp = j.datosEspecificos;

    if (esp.ultimoRemo && esp.ultimoRemo !== lado) {
      // ¡Remada con ritmo perfecto! Gran impulso acelerativo
      esp.velocidad = Math.min(esp.velocidad + 1.85, 14.5);
    } else {
      // Remada del mismo lado consecutivo: impulso menor
      esp.velocidad = Math.min(esp.velocidad + 0.65, 9.2);
    }

    esp.ultimoRemo = lado;
  }

  update(dt) {
    super.update(dt);
    if (this.terminado) return;

    this.jugadores.forEach(j => {
      const esp = j.datosEspecificos;
      if (esp.terminado) return;

      // Fricción hidrodinámica del río
      esp.velocidad = Math.max(0, esp.velocidad * Math.pow(0.965, dt * 20));
      esp.posicionX = Math.min(META_METROS, esp.posicionX + esp.velocidad * dt * 4);

      // Comprobar si cruza la línea de meta
      if (esp.posicionX >= META_METROS) {
        esp.posicionX = META_METROS;
        esp.terminado = true;
        this.llegadosCount++;
        esp.puestoLlegada = this.llegadosCount;
        j.puntos = Math.max(10, 100 - (this.llegadosCount - 1) * 25);
      }
    });

    // Terminar si todos han llegado a la meta
    if (this.llegadosCount >= this.jugadores.size && this.jugadores.size > 0) {
      this.terminado = true;
    }
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
        velocidad: Math.round(j.datosEspecificos.velocidad * 100) / 100,
        puntos: j.puntos,
        puestoLlegada: j.datosEspecificos.puestoLlegada,
        terminado: j.datosEspecificos.terminado,
      })),
      metaMetros: META_METROS,
    };
  }

  getResults() {
    const lista = Array.from(this.jugadores.values());

    // Ordenar primero por puesto de llegada a meta, o por metros recorridos
    lista.sort((a, b) => {
      const espA = a.datosEspecificos;
      const espB = b.datosEspecificos;

      if (espA.puestoLlegada && espB.puestoLlegada) {
        return espA.puestoLlegada - espB.puestoLlegada;
      }
      if (espA.puestoLlegada) return -1;
      if (espB.puestoLlegada) return 1;

      return espB.posicionX - espA.posicionX;
    });

    return lista.map((j, i) => {
      const esp = j.datosEspecificos;
      return {
        puesto: i + 1,
        playerId: j.playerId,
        nombre: j.nombre,
        avatarId: j.avatarId,
        color: j.color,
        puntos: esp.puestoLlegada ? `${Math.round(esp.posicionX)}m (Meta)` : `${Math.round(esp.posicionX)}m`,
        monedasGanadas: MONEDAS_POR_PUESTO[i] || 1,
      };
    });
  }
}

module.exports = PiraguismoGuadiana;
