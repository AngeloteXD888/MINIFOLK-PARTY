/**
 * src/minigames/equilibrioPuentePalmas.js — Minijuego 7: Mantener el equilibrio sobre el Puente de Palmas
 *
 * CONCEPTO:
 * - Caminar sobre el histórico pretil de sillería del Puente de Palmas sobre el Guadiana.
 * - Ráfagas de viento del río desestabilizan a los peones.
 * - Mecánica autoritativa: contrarrestar la inclinación angular (giroscopio o botones).
 * - Si el ángulo supera el umbral crítico (+/- 40º), el peón cae al río y es penalizado.
 */

'use strict';

const { MinigameBase, MONEDAS_POR_PUESTO } = require('./minigameBase');

const ANGULO_CAIDA = 40.0; // Grados críticos de caída

class EquilibrioPuentePalmas extends MinigameBase {
  constructor() {
    super({
      id: 'equilibrio_puente',
      nombre: 'Equilibrio en el Puente de Palmas',
      subtitulo: '¡Mantente en pie sobre el pretil de piedra sobre el Guadiana!',
      descripcion: 'Ráfagas de viento intentan tirarte al río. Contrarresta el balanceo inclinando el móvil o usando los botones IZQ / DER.',
      controlesTexto: 'Mantén la burbuja de equilibrio en el centro. ¡Evita caerte al agua!',
      tipoControl: 'giroscopio_o_botones',
      duracionSegundos: 18,
    });

    this.fuerzaViento = 0;
    this.siguienteCambioVientoMs = 0;
  }

  init(players, roomCode, options = {}) {
    super.init(players, roomCode, options);

    this.fuerzaViento = 0;
    this.siguienteCambioVientoMs = 1000;

    this.jugadores.forEach((j) => {
      j.datosEspecificos = {
        angulo: (Math.random() - 0.5) * 6, // Grados iniciales pequeños
        velocidadAngular: 0,
        enAgua: false,
        tiempoEnAguaMs: 0,
        caidasTotal: 0,
        tiempoEnEquilibrioSegs: 0,
      };
    });
  }

  onInput(playerId, input = {}) {
    if (this.terminado) return;
    const j = this.jugadores.get(playerId);
    if (!j || j.datosEspecificos.enAgua) return;

    const action = input.action || '';
    const payload = input.payload || {};
    const esp = j.datosEspecificos;

    if (action === 'inclinacion' || action === 'gyro') {
      // Giroscopio: inclinar el móvil aplica un par corrector directo
      const tilt = Math.max(-1.0, Math.min(1.0, payload.tiltX || 0));
      esp.velocidadAngular += tilt * 28;
    } else if (action === 'compensar_izq' || action === 'izq') {
      // Botón táctil compensar a la izquierda
      esp.velocidadAngular -= 18;
    } else if (action === 'compensar_der' || action === 'der') {
      // Botón táctil compensar a la derecha
      esp.velocidadAngular += 18;
    }
  }

  update(dt) {
    super.update(dt);
    if (this.terminado) return;

    const dtMs = dt * 1000;

    // 1. Variación aleatoria de las ráfagas de viento del Guadiana
    this.siguienteCambioVientoMs -= dtMs;
    if (this.siguienteCambioVientoMs <= 0) {
      this.siguienteCambioVientoMs = 1200 + Math.random() * 1500;
      // Ráfaga hacia izquierda (-1) o derecha (+1)
      this.fuerzaViento = (Math.random() - 0.5) * 45;
    }

    // 2. Físicas de péndulo invertido para cada jugador
    this.jugadores.forEach((j) => {
      const esp = j.datosEspecificos;

      if (esp.enAgua) {
        esp.tiempoEnAguaMs = Math.max(0, esp.tiempoEnAguaMs - dtMs);
        if (esp.tiempoEnAguaMs <= 0) {
          // Reaparece en el pretil
          esp.enAgua = false;
          esp.angulo = 0;
          esp.velocidadAngular = 0;
        }
        return;
      }

      // Par desestabilizador: gravedad propia del ángulo + fuerza del viento
      const aceleracionAngular = (esp.angulo * 0.95) + this.fuerzaViento;
      esp.velocidadAngular += aceleracionAngular * dt;

      // Amortiguación natural del aire y brazos del peón
      esp.velocidadAngular *= Math.pow(0.92, dt * 20);
      esp.angulo += esp.velocidadAngular * dt;

      // Evaluar estabilidad
      if (Math.abs(esp.angulo) < 12) {
        // En zona verde de perfecto equilibrio: +3 puntos por segundo
        j.puntos += Math.round(15 * dt);
        esp.tiempoEnEquilibrioSegs += dt;
      } else if (Math.abs(esp.angulo) < 25) {
        // Zona amarilla: +1 punto
        j.puntos += Math.round(5 * dt);
      }

      // Caída al río
      if (Math.abs(esp.angulo) >= ANGULO_CAIDA) {
        esp.enAgua = true;
        esp.caidasTotal++;
        esp.tiempoEnAguaMs = 1500; // 1.5s en el agua
        j.puntos = Math.max(0, j.puntos - 25);
      }
    });
  }

  getStateSnapshot() {
    return {
      minijuegoId: this.info.id,
      tiempoRestanteMs: Math.round(this.tiempoRestanteMs),
      fuerzaViento: Math.round(this.fuerzaViento),
      anguloCaida: ANGULO_CAIDA,
      jugadores: Array.from(this.jugadores.values()).map(j => ({
        playerId: j.playerId,
        nombre: j.nombre,
        color: j.color,
        carril: j.carril,
        puntos: j.puntos,
        angulo: Math.round(j.datosEspecificos.angulo * 10) / 10,
        enAgua: j.datosEspecificos.enAgua,
        caidasTotal: j.datosEspecificos.caidasTotal,
      })),
    };
  }

  getResults() {
    const lista = Array.from(this.jugadores.values());

    lista.sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      return a.datosEspecificos.caidasTotal - b.datosEspecificos.caidasTotal;
    });

    return lista.map((j, i) => ({
      puesto: i + 1,
      playerId: j.playerId,
      nombre: j.nombre,
      avatarId: j.avatarId,
      color: j.color,
      puntos: `${j.puntos} pts (${j.datosEspecificos.caidasTotal} caídas)`,
      monedasGanadas: MONEDAS_POR_PUESTO[i] || 1,
    }));
  }
}

module.exports = EquilibrioPuentePalmas;
