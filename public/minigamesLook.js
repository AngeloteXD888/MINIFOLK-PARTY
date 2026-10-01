/**
 * public/minigamesLook.js — Pipeline visual de calidad "Mario Party Superstars"
 *
 * Características principales:
 *  - ACESFilmic tone mapping + sRGB output + EffectComposer con UnrealBloomPass suave
 *  - IBL procedural (RoomEnvironment) para brillos suaves en materiales PBR
 *  - MeshStandardMaterial con colores saturados (roughness 0.55-0.8) en lugar de toon duro
 *  - SIN contornos negros
 *  - Sol cálido + hemisférica azul-verdosa, sombras PCFSoft
 *  - Nubes 3D redondeadas animadas, cielo por degradado canvas, colinas y pradera
 *  - HUD: tarjetas + temporizador circular + indicador Ronda X/Y
 *  - Helpers cacheados: texturas (adoquin, cesped, asfalto, piedra, ladrillo, madera),
 *    crearHaloSprite, crearBlobShadow, crearAntorcha, crearArbol
 *  - disposeArbol: limpieza recursiva de geometrías, materiales y texturas canvas
 *  - Detección de rendimiento: baja calidad automáticamente si FPS < 40 durante 2 s
 */

import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment }  from 'three/addons/environments/RoomEnvironment.js';

// ══════════════════════════════════════════════════════════════════
// PALETAS POR MINIJUEGO
// ══════════════════════════════════════════════════════════════════
export const AMBIENTES = {
  carrera_guadiana: {
    arriba: '#1ad4ff', abajo: '#d0f0ff', pradera: 0x52cc48,
    colorNiebla: '#c5ecff', nearNiebla: 60, farNiebla: 200,
    colorSol: 0xfffae0, intensidadSol: 2.2,
    colorHemi: 0x7aeaff, colorHemiSuelo: 0x68d05a,
    ocultarColinas: false,
  },
  piraguismo_guadiana: {
    arriba: '#1ad4ff', abajo: '#d0f0ff', pradera: 0x52cc48,
    colorNiebla: '#c5ecff', nearNiebla: 60, farNiebla: 200,
    colorSol: 0xfffae0, intensidadSol: 2.2,
    colorHemi: 0x7aeaff, colorHemiSuelo: 0x68d05a,
    ocultarColinas: false,
  },
  reaccion_luces: {
    arriba: '#c84010', abajo: '#ff7a30', pradera: 0x7a4020,
    colorNiebla: '#ff7a30', nearNiebla: 40, farNiebla: 120,
    colorSol: 0xff9050, intensidadSol: 1.8,
    colorHemi: 0xffb060, colorHemiSuelo: 0x503020,
    ocultarColinas: true,
  },
  memory_monumentos: {
    arriba: '#4db8ff', abajo: '#e2f7ff', pradera: 0x74d66a,
    colorNiebla: '#d0f0ff', nearNiebla: 55, farNiebla: 190,
    colorSol: 0xfff5d0, intensidadSol: 2.4,
    colorHemi: 0xa0e0ff, colorHemiSuelo: 0x80d065,
    ocultarColinas: false,
  },
  pulso_fuerza: {
    arriba: '#ff9a5c', abajo: '#ffe7b0', pradera: 0x83d465,
    colorNiebla: '#ffe5a0', nearNiebla: 50, farNiebla: 180,
    colorSol: 0xffcc70, intensidadSol: 2.1,
    colorHemi: 0xffc090, colorHemiSuelo: 0x80c060,
    ocultarColinas: false,
  },
  carnaval_caramelos: {
    arriba: '#9060ff', abajo: '#ffc4ea', pradera: 0x7ad07e,
    colorNiebla: '#e0a0e8', nearNiebla: 45, farNiebla: 160,
    colorSol: 0xff80c0, intensidadSol: 1.9,
    colorHemi: 0xd080ff, colorHemiSuelo: 0x70c080,
    ocultarColinas: false,
  },
  esquivar_muralla: {
    arriba: '#3fa8ff', abajo: '#d0f0ff', pradera: 0x62cc58,
    colorNiebla: '#c8ecff', nearNiebla: 50, farNiebla: 180,
    colorSol: 0xfff8e0, intensidadSol: 2.3,
    colorHemi: 0x80d8ff, colorHemiSuelo: 0x60c050,
    ocultarColinas: false,
  },
  carrera_coches: {
    arriba: '#2f8dff', abajo: '#c2e9ff', pradera: 0x5fcb5a,
    colorNiebla: '#b8e4ff', nearNiebla: 60, farNiebla: 200,
    colorSol: 0xffe0a0, intensidadSol: 2.0,
    colorHemi: 0x70c8ff, colorHemiSuelo: 0x60b850,
    ocultarColinas: false,
  },
  equilibrio_puente: {
    arriba: '#4cb6ff', abajo: '#e2f6ff', pradera: 0x6fd06a,
    colorNiebla: '#ccebff', nearNiebla: 55, farNiebla: 190,
    colorSol: 0xfff0d0, intensidadSol: 2.2,
    colorHemi: 0x90d8ff, colorHemiSuelo: 0x70c862,
    ocultarColinas: false,
  },
  lluvia_bellotas: {
    arriba: '#5ec3ff', abajo: '#e9ffd2', pradera: 0x7ed957,
    colorNiebla: '#d8f8c0', nearNiebla: 50, farNiebla: 180,
    colorSol: 0xfff8c0, intensidadSol: 2.1,
    colorHemi: 0xa0e0a0, colorHemiSuelo: 0x80d055,
    ocultarColinas: false,
  },
};
const AMBIENTE_DEFECTO = AMBIENTES.memory_monumentos;

// ══════════════════════════════════════════════════════════════════
// CACHE DE RECURSOS GLOBALES
// ══════════════════════════════════════════════════════════════════
const _cache = {
  adoquin: null, cesped: null, asfalto: null,
  piedra: null, ladrillo: null, madera: null, sillar: null,
};

function makeCanvasTex(key, size, drawFn) {
  if (_cache[key]) return _cache[key];
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  drawFn(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.colorSpace = THREE.SRGBColorSpace;
  _cache[key] = tex;
  return tex;
}

export function texturaAdoquin() {
  return makeCanvasTex('adoquin', 512, (ctx, s) => {
    ctx.fillStyle = '#b5a88a'; ctx.fillRect(0, 0, s, s);
    const cols = 8, rows = 5, cw = s / cols, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const ox = (r % 2 === 0) ? 0 : cw * 0.5;
        const x = (cc * cw + ox) % s, y = r * rh;
        const v = (Math.random() - 0.5) * 10;
        ctx.fillStyle = `hsl(37,${28 + Math.random() * 8}%,${52 + v}%)`;
        ctx.fillRect(x + 2, y + 2, cw - 4, rh - 4);
      }
    }
    ctx.strokeStyle = 'rgba(80,65,45,0.55)'; ctx.lineWidth = 2;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(s, r * rh); ctx.stroke();
    }
    for (let cc = 0; cc <= cols; cc++) {
      ctx.beginPath(); ctx.moveTo(cc * cw, 0); ctx.lineTo(cc * cw, s); ctx.stroke();
    }
    for (let i = 0; i < 3000; i++) {
      const v = Math.random() > 0.5 ? 20 : -20;
      ctx.fillStyle = `rgba(${128 + v},${108 + v},${80 + v},0.06)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  });
}

export function texturaCesped() {
  return makeCanvasTex('cesped', 512, (ctx, s) => {
    ctx.fillStyle = '#4db83a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {
      const h = 38 + Math.random() * 15;
      ctx.strokeStyle = `hsl(${105 + Math.random() * 20},${60 + Math.random() * 20}%,${h}%)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x = Math.random() * s, y = Math.random() * s;
      ctx.moveTo(x, y); ctx.lineTo(x + (Math.random() - 0.5) * 3, y - Math.random() * 8);
      ctx.stroke();
    }
  });
}

export function texturaAsfalto() {
  return makeCanvasTex('asfalto', 512, (ctx, s) => {
    ctx.fillStyle = '#2a2d30'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 6000; i++) {
      const v = Math.random() * 15 - 7;
      ctx.fillStyle = `rgba(${60 + v},${62 + v},${65 + v},0.12)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, Math.random() * 3 + 1, 1);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2;
    for (let y2 = 64; y2 < s; y2 += 64) {
      ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(s, y2); ctx.stroke();
    }
  });
}

export function texturaPiedra() {
  return makeCanvasTex('piedra', 512, (ctx, s) => {
    ctx.fillStyle = '#c0b49a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) {
      const v = Math.random() * 20 - 10;
      ctx.fillStyle = `rgba(${140 + v},${120 + v},${95 + v},0.1)`;
      ctx.fillRect(Math.random() * s, Math.random() * s, Math.random() * 4 + 1, Math.random() * 2 + 1);
    }
  });
}

export function texturaLadrillo() {
  return makeCanvasTex('ladrillo', 512, (ctx, s) => {
    ctx.fillStyle = '#c46438'; ctx.fillRect(0, 0, s, s);
    const cols = 6, rows = 10, cw = s / cols, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const ox = (r % 2 === 0) ? 0 : cw * 0.5;
        const x = (cc * cw + ox) % s, y = r * rh;
        ctx.fillStyle = `hsl(${12 + Math.random() * 8},${60 + Math.random() * 15}%,${45 + Math.random() * 10}%)`;
        ctx.fillRect(x + 2, y + 2, cw - 4, rh - 4);
      }
    }
    ctx.strokeStyle = 'rgba(220,200,175,0.6)'; ctx.lineWidth = 2;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(s, r * rh); ctx.stroke();
    }
    for (let cc = 0; cc <= cols; cc++) {
      ctx.beginPath(); ctx.moveTo(cc * cw, 0); ctx.lineTo(cc * cw, s); ctx.stroke();
    }
  });
}

export function texturaMadera() {
  return makeCanvasTex('madera', 512, (ctx, s) => {
    ctx.fillStyle = '#8b5a2b'; ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 3) {
      const v = Math.random() * 12 - 6;
      ctx.fillStyle = `rgba(${140 + v},${85 + v},${30 + v},0.15)`;
      ctx.fillRect(0, y, s, 2);
    }
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = 'rgba(60,30,10,0.06)';
      ctx.fillRect(Math.random() * s, Math.random() * s, Math.random() * 50 + 5, 1);
    }
  });
}

export function texturaSillar() {
  return makeCanvasTex('sillar', 512, (ctx, s) => {
    ctx.fillStyle = '#c8bda8'; ctx.fillRect(0, 0, s, s);
    const cols = 4, rows = 6, cw = s / cols, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      for (let cc = 0; cc < cols; cc++) {
        const v = Math.random() * 18 - 9;
        ctx.fillStyle = `hsl(36,${15 + Math.random() * 8}%,${68 + v * 0.4}%)`;
        ctx.fillRect(cc * cw + 3, r * rh + 3, cw - 6, rh - 6);
      }
    }
    ctx.strokeStyle = 'rgba(90,75,55,0.35)'; ctx.lineWidth = 3;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * rh); ctx.lineTo(s, r * rh); ctx.stroke();
    }
    for (let cc = 0; cc <= cols; cc++) {
      ctx.beginPath(); ctx.moveTo(cc * cw, 0); ctx.lineTo(cc * cw, s); ctx.stroke();
    }
  });
}

// ══════════════════════════════════════════════════════════════════
// TOONIFY — PBR saturado sin contornos
// ══════════════════════════════════════════════════════════════════

function realzarColor(c) {
  const hsl = {};
  c.getHSL(hsl);
  if (hsl.l < 0.08) return;
  c.setHSL(
    hsl.h,
    Math.min(1, hsl.s * 1.35 + 0.08),
    Math.min(0.88, hsl.l * 1.2 + 0.04)
  );
}

export function toonify(raiz) {
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    ms.forEach((m) => {
      if (!m || !m.isMeshStandardMaterial) return;
      realzarColor(m.color);
      if (m.roughness < 0.25) m.roughness = 0.35;
      if (m.roughness > 0.92) m.roughness = 0.82;
      m.needsUpdate = true;
    });
    o.receiveShadow = true;
    if (!o.material?.transparent) o.castShadow = true;
  });
}

// ══════════════════════════════════════════════════════════════════
// HELPERS DE ESCENARIO
// ══════════════════════════════════════════════════════════════════

export function crearHaloSprite(color, size) {
  color = color || 0xffffff;
  size = size || 4;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const r = (color >> 16) & 255, g2 = (color >> 8) & 255, b = color & 255;
  const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0,   `rgba(${r},${g2},${b},0.85)`);
  grd.addColorStop(0.5, `rgba(${r},${g2},${b},0.3)`);
  grd.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  return sprite;
}

export function crearBlobShadow(radio) {
  radio = radio || 1.2;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.ellipse(32, 32, 32, 20, 0, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(radio * 2, radio);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    blending: THREE.MultiplyBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = -1;
  return mesh;
}

export function crearArbol(variante, color) {
  variante = variante || 0;
  const group = new THREE.Group();
  const colorCopa = color || [0x3cb84a, 0x2ea855, 0x48c040][variante % 3];
  const troncoMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
  const copaMat   = new THREE.MeshStandardMaterial({ color: colorCopa, roughness: 0.75 });

  if (variante === 0) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, 3.5, 7), troncoMat);
    t.position.y = 1.75; t.castShadow = true; group.add(t);
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(2.4, 9, 7), copaMat);
    c1.position.y = 5.2; c1.scale.set(1, 0.85, 1); c1.castShadow = true; group.add(c1);
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6),
      new THREE.MeshStandardMaterial({ color: colorCopa, roughness: 0.7 }));
    c2.position.set(1.2, 5.8, 0.5); c2.castShadow = true; group.add(c2);
    const c3 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), copaMat);
    c3.position.set(-1.0, 5.4, -0.8); group.add(c3);
  } else if (variante === 1) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 4, 6), troncoMat);
    t.position.y = 2; t.castShadow = true; group.add(t);
    [3.5, 5, 6.2].forEach((y, i) => {
      const r2 = 2.5 - i * 0.6;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r2, r2 * 1.2, 7), copaMat);
      cone.position.y = y; cone.castShadow = true; group.add(cone);
    });
  } else {
    const c = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), copaMat);
    c.position.y = 1.5; c.scale.set(1, 0.75, 1); group.add(c);
  }
  return group;
}

export function crearAntorcha(altoMango) {
  altoMango = altoMango || 2.5;
  const group = new THREE.Group();
  const mangoMat   = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 });
  const soporteMat = new THREE.MeshStandardMaterial({ color: 0x4a3010, roughness: 0.6 });

  const mango = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, altoMango, 6), mangoMat);
  mango.position.y = altoMango / 2; group.add(mango);

  const soporte = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 12), soporteMat);
  soporte.position.y = altoMango; group.add(soporte);

  const fc = document.createElement('canvas'); fc.width = 64; fc.height = 128;
  const fctx = fc.getContext('2d');
  const fg = fctx.createRadialGradient(32, 100, 2, 32, 60, 50);
  fg.addColorStop(0,   'rgba(255,255,150,1)');
  fg.addColorStop(0.3, 'rgba(255,140,30,0.9)');
  fg.addColorStop(0.7, 'rgba(255,60,0,0.5)');
  fg.addColorStop(1,   'rgba(255,0,0,0)');
  fctx.fillStyle = fg; fctx.fillRect(0, 0, 64, 128);
  const flameTex = new THREE.CanvasTexture(fc);
  const flameMat = new THREE.SpriteMaterial({
    map: flameTex, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const llama = new THREE.Sprite(flameMat);
  llama.scale.set(0.55, 0.9, 1);
  llama.position.y = altoMango + 0.45;
  llama.userData.isFlame = true;
  group.add(llama);

  const halo = crearHaloSprite(0xff8020, 2.2);
  halo.position.y = altoMango + 0.3;
  group.add(halo);

  return group;
}

// ══════════════════════════════════════════════════════════════════
// CIELO Y FONDO
// ══════════════════════════════════════════════════════════════════

function crearCielo(cfg) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0,    cfg.arriba);
  g.addColorStop(0.55, cfg.abajo);
  g.addColorStop(1,    cfg.abajo);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function crearNubes() {
  const grupo = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.75,
    emissive: 0xd8eeff, emissiveIntensity: 0.25, fog: false,
  });
  const geoBase = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 18; i++) {
    const nube = new THREE.Group();
    const partes = 3 + (i % 4);
    for (let k = 0; k < partes; k++) {
      const p = new THREE.Mesh(geoBase, mat);
      const r = 2.4 + Math.random() * 2.2;
      p.scale.set(r * 1.3, r * 0.72, r * 0.95);
      p.position.set((k - partes / 2) * 2.8, Math.random() * 1.1, Math.random() * 1.5);
      nube.add(p);
    }
    nube.position.set(-130 + i * 15 + Math.random() * 8,
      18 + Math.random() * 18, -58 - Math.random() * 45);
    nube.userData.vel = 0.45 + Math.random() * 0.8;
    grupo.add(nube);
  }
  return grupo;
}

function crearFondo(cfg) {
  const grupo = new THREE.Group();
  const pradera = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 450),
    new THREE.MeshStandardMaterial({ color: cfg.pradera, roughness: 0.85 })
  );
  pradera.rotation.x = -Math.PI / 2;
  pradera.position.set(0, -4, -65);
  pradera.receiveShadow = true;
  grupo.add(pradera);

  if (!cfg.ocultarColinas) {
    const geoCol = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const verdes = [0x5fcf55, 0x4fbf50, 0x74dc62, 0x60d058];
    for (let i = 0; i < 10; i++) {
      const col = new THREE.Mesh(geoCol,
        new THREE.MeshStandardMaterial({ color: verdes[i % 4], roughness: 0.8 }));
      col.scale.set(18 + Math.random() * 14, 8 + Math.random() * 8, 14);
      col.position.set(-140 + i * 30, -4, -85 - Math.random() * 20);
      col.receiveShadow = true;
      grupo.add(col);
    }
  }
  return grupo;
}

// ══════════════════════════════════════════════════════════════════
// DISPOSE
// ══════════════════════════════════════════════════════════════════

export function disposeArbol(obj) {
  if (!obj) return;
  const cacheValues = Object.values(_cache).filter(Boolean);
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const mats = Array.isArray(child.material)
      ? child.material
      : (child.material ? [child.material] : []);
    mats.forEach((m) => {
      if (!m) return;
      ['map','emissiveMap','normalMap','roughnessMap','metalnessMap','bumpMap','alphaMap'].forEach(k => {
        if (m[k] && !cacheValues.includes(m[k])) m[k].dispose();
      });
      m.dispose();
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// WATCHDOG FPS
// ══════════════════════════════════════════════════════════════════

const _fps = { frames: 0, lastTime: 0, bajado: false };

function actualizarFps(inst) {
  _fps.frames++;
  const ahora = performance.now();
  if (ahora - _fps.lastTime >= 2000) {
    const fps = (_fps.frames * 1000) / (ahora - _fps.lastTime);
    _fps.frames = 0; _fps.lastTime = ahora;
    if (fps < 40 && !_fps.bajado && inst.composer) {
      inst.composer.passes.forEach(p => { if (p.isUnrealBloomPass) p.enabled = false; });
      _fps.bajado = true;
      console.log('[Minigames] FPS bajo (' + Math.round(fps) + '), bloom desactivado');
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// API PRINCIPAL
// ══════════════════════════════════════════════════════════════════

export function configurarRenderer(inst) {
  const r = inst.renderer;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.1;
  r.outputColorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(r);
  pmrem.compileEquirectangularShader();
  const envTex = pmrem.fromScene(new RoomEnvironment()).texture;
  inst.scene.environment = envTex;
  inst.scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const w = inst.canvas.clientWidth || window.innerWidth;
  const h = inst.canvas.clientHeight || window.innerHeight;
  const composer = new EffectComposer(r);
  composer.addPass(new RenderPass(inst.scene, inst.camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 0.82);
  bloom.isUnrealBloomPass = true;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  inst.composer = composer;
  _fps.lastTime = performance.now();
  _fps.bajado = false;
}

export function aplicarAmbiente(inst, minigameId) {
  const cfg = AMBIENTES[minigameId] || AMBIENTE_DEFECTO;
  const scene = inst.scene;

  toonify(scene);

  scene.background = crearCielo(cfg);
  scene.fog = new THREE.Fog(
    new THREE.Color(cfg.colorNiebla),
    cfg.nearNiebla != null ? cfg.nearNiebla : 55,
    cfg.farNiebla  != null ? cfg.farNiebla  : 190
  );

  const hemi = new THREE.HemisphereLight(
    cfg.colorHemi     || 0xa0deff,
    cfg.colorHemiSuelo || 0x70c860, 1.1
  );
  const sol = new THREE.DirectionalLight(cfg.colorSol || 0xfff5d0, cfg.intensidadSol || 2.2);
  sol.position.set(28, 42, 24);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.camera.left   = -50; sol.shadow.camera.right  =  50;
  sol.shadow.camera.top    =  50; sol.shadow.camera.bottom = -50;
  sol.shadow.camera.near   =  1;  sol.shadow.camera.far    = 140;
  sol.shadow.bias       = -0.0004;
  sol.shadow.normalBias =  0.04;
  const ambiente = new THREE.AmbientLight(0xfff8f0, 0.28);

  scene.add(hemi, sol, sol.target, ambiente);
  inst.lucesBase = [hemi, sol, sol.target, ambiente];
  inst.sol = sol;

  inst.nubes = crearNubes();
  inst.fondo = crearFondo(cfg);
  scene.add(inst.nubes, inst.fondo);
}

export function animarAmbiente(inst, dt) {
  if (inst.nubes) {
    inst.nubes.children.forEach((n) => {
      n.position.x += n.userData.vel * dt;
      if (n.position.x > 140) n.position.x = -140;
    });
    inst.nubes.position.x = inst.camera.position.x * 0.85;
  }
  if (inst.fondo) inst.fondo.position.x = inst.camera.position.x * 0.9;
  if (inst.sol) {
    const cx = inst.camera.position.x;
    inst.sol.target.position.set(cx + 8, 0, 0);
    inst.sol.position.set(cx + 36, 42, 24);
  }

  // Animar llamas de antorchas en escenario
  if (inst.escenarioGroup) {
    const t = performance.now() * 0.001;
    inst.escenarioGroup.traverse((o) => {
      if (o.isSprite && o.userData.isFlame) {
        const sw = 0.48 + Math.sin(t * 12 + o.id * 0.7) * 0.08;
        o.scale.set(sw, sw * 1.6, 1);
      }
    });
  }

  // Actualizar blob shadows
  if (inst._blobShadows) {
    inst._blobShadows.forEach((blob, playerId) => {
      const mesh = inst.playerMeshes && inst.playerMeshes.get(playerId);
      if (mesh) {
        blob.position.x = mesh.position.x;
        blob.position.z = mesh.position.z;
        const h = Math.max(0, mesh.position.y);
        blob.material.opacity = Math.max(0, 0.45 - h * 0.08);
        blob.scale.setScalar(Math.max(0.3, 1 - h * 0.05));
      }
    });
  }

  actualizarFps(inst);
}

// ══════════════════════════════════════════════════════════════════
// HUD
// ══════════════════════════════════════════════════════════════════

const CSS_HUD = `
.mp-hud{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:flex;
  gap:14px;z-index:8;pointer-events:none;flex-wrap:wrap;justify-content:center}
.mp-card{display:flex;align-items:center;gap:10px;padding:5px 22px 5px 5px;border-radius:999px;
  background:linear-gradient(160deg,rgba(72,76,110,.95),rgba(32,36,62,.95));
  border:3px solid var(--c,#fff);
  box-shadow:0 5px 0 rgba(0,0,0,.3),0 8px 22px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12)}
.mp-card img{width:54px;height:54px;border-radius:50%;object-fit:cover;object-position:top;
  background:#dfe7ff;border:3px solid var(--c,#fff);flex-shrink:0}
.mp-name{font:800 .72rem 'Inter',sans-serif;color:#ccd6ff;letter-spacing:.05em;text-transform:uppercase;line-height:1}
.mp-score{font:900 2rem 'Inter',sans-serif;color:#fff;line-height:1;min-width:2.4ch;text-align:right;
  text-shadow:0 3px 0 rgba(0,0,0,.4);font-variant-numeric:tabular-nums}
.mp-col{display:flex;flex-direction:column;gap:3px;align-items:flex-end}
.mp-pop{animation:mpPop .25s ease-out}
@keyframes mpPop{0%{transform:scale(1)}45%{transform:scale(1.4)}100%{transform:scale(1)}}
.mp-timer-wrap{position:absolute;top:16px;left:16px;z-index:8;pointer-events:none}
.mp-timer-canvas{filter:drop-shadow(0 2px 6px rgba(0,0,0,.45))}
.mp-ronda{position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:8;pointer-events:none;
  font:800 .88rem 'Inter',sans-serif;color:#fff;background:rgba(20,22,50,.75);
  border:2px solid rgba(255,255,255,.25);border-radius:999px;padding:4px 18px;
  text-shadow:0 2px 4px rgba(0,0,0,.5);letter-spacing:.06em;display:none}
`;

export function crearHud(inst, jugadores, avatares) {
  if (!document.getElementById('mp-hud-style')) {
    const st = document.createElement('style');
    st.id = 'mp-hud-style';
    st.textContent = CSS_HUD;
    document.head.appendChild(st);
  }
  const padre = inst.canvas.parentElement;
  if (!padre) return;

  const hud = document.createElement('div');
  hud.className = 'mp-hud';
  inst.hudEls = new Map();

  (jugadores || []).forEach((j) => {
    const av = (avatares || []).find((a) => a.id === j.avatarId);
    const card = document.createElement('div');
    card.className = 'mp-card';
    card.style.setProperty('--c', j.color || '#ffffff');
    const img = document.createElement('img');
    if (av) img.src = av.seleccion || av.tablero || '';
    const col = document.createElement('div'); col.className = 'mp-col';
    const nombre = document.createElement('span'); nombre.className = 'mp-name';
    nombre.textContent = (j.nombre || '').slice(0, 10);
    const score = document.createElement('span'); score.className = 'mp-score';
    score.textContent = '0';
    col.append(nombre, score);
    card.append(img, col);
    hud.appendChild(card);
    inst.hudEls.set(j.playerId, score);
  });
  padre.appendChild(hud);
  inst.hud = hud;

  const timerWrap = document.createElement('div'); timerWrap.className = 'mp-timer-wrap';
  const timerCanvas = document.createElement('canvas');
  timerCanvas.className = 'mp-timer-canvas';
  timerCanvas.width = 72; timerCanvas.height = 72;
  timerWrap.appendChild(timerCanvas);
  padre.appendChild(timerWrap);
  inst.timerCanvas = timerCanvas;
  inst._timerTotal = null;

  const rondaEl = document.createElement('div'); rondaEl.className = 'mp-ronda';
  padre.appendChild(rondaEl);
  inst.rondaEl = rondaEl;
}

export function actualizarHud(inst, snap) {
  if (!inst.hudEls || !snap || !snap.jugadores) return;
  const id = snap.minijuegoId || inst.minigameId;

  snap.jugadores.forEach((p) => {
    const el = inst.hudEls.get(p.playerId);
    if (!el) return;
    let txt;
    if (id === 'carrera_guadiana' || id === 'piraguismo_guadiana') {
      txt = String(Math.min(100, Math.round(p.posicionX || 0))) + 'm';
    } else if (id === 'carrera_coches') {
      txt = String(Math.round(p.distanciaZ || 0)) + 'm';
    } else {
      txt = String(p.puntos != null ? p.puntos : 0);
    }
    if (el.textContent !== txt) {
      el.textContent = txt;
      el.classList.remove('mp-pop');
      void el.offsetWidth;
      el.classList.add('mp-pop');
    }
  });

  if (inst.timerCanvas && snap.tiempoRestanteMs !== undefined) {
    if (!inst._timerTotal) inst._timerTotal = snap.tiempoRestanteMs;
    _dibujarTimer(inst.timerCanvas, snap.tiempoRestanteMs, inst._timerTotal);
  }

  if (inst.rondaEl && snap.rondaActual !== undefined && snap.totalRondas !== undefined) {
    inst.rondaEl.style.display = 'block';
    inst.rondaEl.textContent = 'Ronda ' + snap.rondaActual + ' / ' + snap.totalRondas;
  }
}

function _dibujarTimer(canvas, msRestantes, msTotal) {
  const ctx = canvas.getContext('2d');
  const cx = 36, cy = 36, r = 28;
  const frac = Math.max(0, Math.min(1, msRestantes / msTotal));
  const seg = Math.ceil(msRestantes / 1000);
  ctx.clearRect(0, 0, 72, 72);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,24,50,0.78)'; ctx.fill();
  const start = -Math.PI / 2, end = start + frac * Math.PI * 2;
  const color = frac > 0.35 ? '#4cf08a' : frac > 0.15 ? '#f0c42a' : '#f04a4a';
  ctx.beginPath(); ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px Inter,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(seg), cx, cy);
}

export function destruirHud(inst) {
  if (inst.hud) { inst.hud.remove(); inst.hud = null; }
  if (inst.timerCanvas) { inst.timerCanvas.parentElement && inst.timerCanvas.parentElement.remove(); inst.timerCanvas = null; }
  if (inst.rondaEl) { inst.rondaEl.remove(); inst.rondaEl = null; }
  inst.hudEls = null;
  inst._timerTotal = null;
}
