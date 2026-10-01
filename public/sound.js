/**
 * public/sound.js — Motor de audio procedimental para Badajoz Party (Web Audio API)
 *
 * CARACTERÍSTICAS:
 * - Sin archivos de audio externos (0 peticiones HTTP, 0 bytes de assets, 0 latencia).
 * - Efectos sintetizados en tiempo real mediante osciladores, filtros y buffers de ruido.
 * - Desbloqueo automático en la primera interacción del usuario (touch o click).
 * - Soporte para vibración háptica en dispositivos móviles (navigator.vibrate).
 * - Modo silencio / mute persistente.
 */

'use strict';

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noiseBuffer = null;
    this.initialized = false;
  }

  /**
   * Inicializa o reanuda el contexto de audio tras un gesto del usuario.
   */
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this._generarNoiseBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.initialized = true;
  }

  /**
   * Helper privado: crea un oscilador con ganancia, lo programa y
   * lo desconecta automáticamente al terminar (evita leak de nodos).
   * @param {(osc: OscillatorNode, gain: GainNode, t: number) => void} configurar
   * @param {number} duracion - Duración total del nodo en segundos
   */
  _playOsc(configurar, duracion) {
    if (!this.ctx) return;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t    = this.ctx.currentTime;
    configurar(osc, gain, t);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duracion);
    // Desconectar nodos cuando terminan — evita acumulación de memoria
    osc.addEventListener('ended', () => {
      try { osc.disconnect();  } catch (_) {}
      try { gain.disconnect(); } catch (_) {}
    }, { once: true });
  }

  _generarNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 segundos de ruido blanco
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  vibrate(pattern = [30]) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {}
    }
  }

  /**
   * Clic táctil suave al pulsar botones
   */
  playClick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._playOsc((osc, gain, t) => {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, t);
      osc.frequency.exponentialRampToValueAtTime(250, t + 0.04);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.linearRampToValueAtTime(0.001, t + 0.04);
    }, 0.05);
    this.vibrate([15]);
  }

  /**
   * Tirada de dados: cascabeleo de dados de madera rodando
   */
  playDiceRoll() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    for (let i = 0; i < 5; i++) {
      const delay = i * 0.08 + Math.random() * 0.03;
      setTimeout(() => {
        if (!this.ctx || this.muted) return;
        this._playOsc((osc, gain, t) => {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(180 + Math.random() * 140, t);
          osc.frequency.exponentialRampToValueAtTime(80, t + 0.05);
          gain.gain.setValueAtTime(0.15, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        }, 0.06);
      }, delay * 1000);
    }
    this.vibrate([20, 40, 20]);
  }

  /**
   * Salto de peón al recorrer casillas
   */
  playPawnStep() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._playOsc((osc, gain, t) => {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.exponentialRampToValueAtTime(480, t + 0.08);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    }, 0.10);
    this.vibrate([20]);
  }

  /**
   * Casilla azul / Ganancia de monedas (+3 monedas)
   */
  playTilePositive() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      this._playOsc((osc, gain, t) => {
        t += idx * 0.07;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      }, idx * 0.07 + 0.24);
    });
    this.vibrate([30, 40, 60]);
  }

  /**
   * Casilla roja / Pérdida de monedas (-3 monedas)
   */
  playTileNegative() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    [311.13, 277.18, 246.94].forEach((freq, idx) => {
      this._playOsc((osc, gain, t) => {
        t += idx * 0.11;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      }, idx * 0.11 + 0.22);
    });
    this.vibrate([80, 50, 80]);
  }

  /**
   * Casilla de evento pacense (misterio / fanfarria)
   */
  playTileEvent() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    [440, 554.37, 659.25, 880].forEach((freq, idx) => {
      this._playOsc((osc, gain, t) => {
        t += idx * 0.09;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      }, idx * 0.09 + 0.38);
    });
    this.vibrate([40, 30, 40, 30, 60]);
  }

  /**
   * Beep de cuenta atrás: 3... 2... 1...
   */
  playCountdownPip() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._playOsc((osc, gain, t) => {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    }, 0.14);
    this.vibrate([40]);
  }

  /**
   * Beep de arranque: ¡YA!
   */
  playCountdownGo() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._playOsc((osc, gain, t) => {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    }, 0.38);
    this.vibrate([100]);
  }

  /**
   * Chime de monedas clásico
   */
  playCoinGain() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._playOsc((osc, gain, t) => {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, t);
      osc.frequency.setValueAtTime(1318.51, t + 0.08);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    }, 0.38);
    this.vibrate([35]);
  }

  /**
   * Salto o esquiva acrobática (whoosh rápido)
   */
  playWhoosh() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._playOsc((osc, gain, t) => {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, t);
      osc.frequency.exponentialRampToValueAtTime(750, t + 0.12);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    }, 0.15);
    this.vibrate([25]);
  }

  /**
   * Chapuzón en el agua del río Guadiana (ruido blanco filtrado)
   */
  playWaterSplash() {
    if (this.muted) return;
    this.init();
    if (!this.ctx || !this.noiseBuffer) return;

    const t = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(250, t + 0.5);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + 0.55);
    // Desconectar nodos cuando terminan — evita leak de memoria
    noise.addEventListener('ended', () => {
      try { noise.disconnect();  } catch (_) {}
      try { filter.disconnect(); } catch (_) {}
      try { gain.disconnect();   } catch (_) {}
    }, { once: true });
    this.vibrate([120, 60, 120]);
  }

  /**
   * Acelerón de turbo (Puente Real o esprint)
   */
  playTurbo() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._playOsc((osc, gain, t) => {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(650, t + 0.28);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    }, 0.32);
    this.vibrate([60]);
  }

  /**
   * Trompo sobre charco de aceite
   */
  playTrompo() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._playOsc((osc, gain, t) => {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(700, t);
      osc.frequency.linearRampToValueAtTime(280, t + 0.25);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    }, 0.32);
    this.vibrate([90, 40, 90]);
  }

  /**
   * Golpe de fuerza en la Plaza Alta (mash)
   */
  playPunchMash() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    this._playOsc((osc, gain, t) => {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    }, 0.10);
    this.vibrate([25]);
  }

  /**
   * Fanfarria de victoria (podio de minijuegos y fin de partida)
   */
  playVictoryFanfare() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    // Acorde victorioso en Do mayor: C4, G4, C5, E5, G5
    const notas = [
      { f: 261.63, d: 0.15 },
      { f: 392.00, d: 0.15 },
      { f: 523.25, d: 0.15 },
      { f: 659.25, d: 0.22 },
      { f: 783.99, d: 0.45 },
    ];

    let start = 0;
    notas.forEach((n) => {
      const offset = start;
      this._playOsc((osc, gain, t) => {
        t += offset;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.f, t);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + n.d + 0.05);
      }, offset + n.d + 0.08);
      start += n.d * 0.75;
    });

    this.vibrate([60, 40, 60, 40, 150]);
  }
}

export const sound = new SoundEngine();
