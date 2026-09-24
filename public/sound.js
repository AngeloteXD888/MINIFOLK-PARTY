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

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(650, t);
    osc.frequency.exponentialRampToValueAtTime(250, t + 0.04);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.linearRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.04);
    this.vibrate([15]);
  }

  /**
   * Tirada de dados: cascabeleo de dados de madera rodando
   */
  playDiceRoll() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const golpes = 5;
    for (let i = 0; i < golpes; i++) {
      const delay = i * 0.08 + Math.random() * 0.03;
      setTimeout(() => {
        if (!this.ctx || this.muted) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const t = this.ctx.currentTime;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180 + Math.random() * 140, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.05);

        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.05);
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

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, t);
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.08);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.09);
    this.vibrate([20]);
  }

  /**
   * Casilla azul / Ganancia de monedas (+3 monedas)
   */
  playTilePositive() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notas = [523.25, 659.25, 783.99, 1046.50]; // Do5, Mi5, Sol5, Do6
    notas.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime + idx * 0.07;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
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

    const notas = [311.13, 277.18, 246.94]; // Mib4, Reb4, Si3
    notas.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime + idx * 0.11;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
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

    const notas = [440, 554.37, 659.25, 880];
    notas.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime + idx * 0.09;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.38);
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

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t); // La4

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);
    this.vibrate([40]);
  }

  /**
   * Beep de arranque: ¡YA!
   */
  playCountdownGo() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t); // La5 (octava superior)

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.38);
    this.vibrate([100]);
  }

  /**
   * Chime de monedas clásico
   */
  playCoinGain() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t); // Si5
    osc.frequency.setValueAtTime(1318.51, t + 0.08); // Mi6

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.38);
    this.vibrate([35]);
  }

  /**
   * Salto o esquiva acrobática (whoosh rápido)
   */
  playWhoosh() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(750, t + 0.12);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);
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
    this.vibrate([120, 60, 120]);
  }

  /**
   * Acelerón de turbo (Puente Real o esprint)
   */
  playTurbo() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(650, t + 0.28);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
    this.vibrate([60]);
  }

  /**
   * Trompo sobre charco de aceite
   */
  playTrompo() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.linearRampToValueAtTime(280, t + 0.25);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
    this.vibrate([90, 40, 90]);
  }

  /**
   * Golpe de fuerza en la Plaza Alta (mash)
   */
  playPunchMash() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const t = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
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
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime + start;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.d + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + n.d + 0.08);

      start += n.d * 0.75;
    });

    this.vibrate([60, 40, 60, 40, 150]);
  }
}

export const sound = new SoundEngine();
