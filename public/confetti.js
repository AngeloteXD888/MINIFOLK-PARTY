/**
 * public/confetti.js — Efectos de confeti procedimental para celebraciones en Badajoz Party
 *
 * Utiliza un lienzo canvas 2D temporal en pantalla completa sin dependencias externas.
 */

'use strict';

class ConfettiEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animId = null;
    this.colores = ['#E63946', '#457BB5', '#2DC653', '#F4D03F', '#FF007F', '#00F0FF', '#FFF'];
  }

  _crearCanvas() {
    if (this.canvas) return;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'confetti-canvas';
    this.canvas.style.position = 'fixed';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '9999';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Dispara una ráfaga de confeti festivo
   * @param {number} [count=120]
   */
  lanzar(count = 120) {
    this._crearCanvas();
    const w = this.canvas.width;
    const h = this.canvas.height;

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: w * (0.2 + Math.random() * 0.6),
        y: h * 0.35 + Math.random() * 100,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 14 - 4,
        size: Math.random() * 10 + 6,
        color: this.colores[Math.floor(Math.random() * this.colores.length)],
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.25,
        alpha: 1.0,
      });
    }

    if (!this.animId) {
      this._animar();
    }
  }

  _animar() {
    if (!this.ctx || this.particles.length === 0) {
      if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.animId = null;
      return;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.45; // gravedad
      p.vx *= 0.98; // rozamiento aire
      p.rotation += p.vRot;
      p.alpha -= 0.007;

      if (p.alpha <= 0 || p.y > this.canvas.height + 50) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, p.alpha);
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      this.ctx.restore();
    }

    this.animId = requestAnimationFrame(() => this._animar());
  }
}

export const confetti = new ConfettiEngine();
