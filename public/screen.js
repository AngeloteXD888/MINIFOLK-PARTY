/**
 * screen.js — Escena Three.js para la vista Pantalla (lobby 3D de Badajoz Party)
 *
 * VERSIÓN: Three.js r167 (importado via importmap en index.html)
 *
 * Renderiza una escena diorama nocturna de Badajoz:
 * - Campo de estrellas (partículas)
 * - Río Guadiana (plano animado)
 * - Alcazaba de Badajoz (geometrías procedurales low-poly)
 * - Puente Real (arcos con TorusGeometry)
 * - Puerta de Palmas (torres y arco)
 * - Cámara orbitando suavemente
 *
 * Todo es geometría procedural: sin assets externos, sin texturas.
 * Sombras simples (PCFSoftShadowMap) para rendimiento en hardware modesto.
 *
 * @module screen
 */

import * as THREE from 'three';

// ─── Colores de la paleta ─────────────────────────────────────────────────────
const COLOR = {
  sky:        new THREE.Color(0x04041a),
  river:      new THREE.Color(0x0d2b5e),
  riverShine: new THREE.Color(0x1a4a9e),
  ground:     new THREE.Color(0x0d0a08),
  alcazaba:   new THREE.Color(0x7a4f2f),
  alcazabaDk: new THREE.Color(0x4a2f18),
  puente:     new THREE.Color(0x5a4a38),
  puerta:     new THREE.Color(0x8a6842),
  glow:       new THREE.Color(0xff6b35),
  moonLight:  new THREE.Color(0x6080ff),
  ambient:    new THREE.Color(0x0d0820),
};

// ─── Constructor de la escena ─────────────────────────────────────────────────

/**
 * Inicializa y arranca la escena Three.js sobre el canvas indicado.
 * Devuelve una función de cleanup para liberar recursos al cambiar de vista.
 *
 * @param {string} canvasId - ID del elemento <canvas> en el DOM
 * @returns {() => void} función de cleanup
 */
export function initScene(canvasId = 'three-canvas') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    console.warn('[Scene] Canvas no encontrado:', canvasId);
    return () => {};
  }

  // ─── Renderer ─────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias:   true,
    alpha:       false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(COLOR.sky);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap; // Sombras suaves y baratas

  // ─── Escena ───────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = COLOR.sky;
  scene.fog        = new THREE.FogExp2(0x04041a, 0.018);

  // ─── Cámara ───────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 9, 26);
  camera.lookAt(0, 1, -2);

  // ─── Luces ────────────────────────────────────────────────────────────

  // Luz ambiental fría (noche estrellada)
  const ambient = new THREE.AmbientLight(COLOR.ambient, 3.5);
  scene.add(ambient);

  // Luna (luz direccional azulada desde arriba-izquierda)
  const luna = new THREE.DirectionalLight(COLOR.moonLight, 1.8);
  luna.position.set(-12, 18, -8);
  luna.castShadow              = true;
  luna.shadow.mapSize.width    = 1024;
  luna.shadow.mapSize.height   = 1024;
  luna.shadow.camera.near      = 1;
  luna.shadow.camera.far       = 80;
  luna.shadow.camera.left      = -25;
  luna.shadow.camera.right     = 25;
  luna.shadow.camera.top       = 20;
  luna.shadow.camera.bottom    = -20;
  luna.shadow.bias             = -0.002;
  scene.add(luna);

  // Luz cálida de hoguera/antorcha en la Alcazaba
  const hoguera = new THREE.PointLight(COLOR.glow, 3, 14, 2);
  hoguera.position.set(-9, 4, -4);
  scene.add(hoguera);

  // Rimlight suave azul por detrás (simula cielo nocturno)
  const rimlight = new THREE.DirectionalLight(0x2244aa, 0.6);
  rimlight.position.set(10, 5, 15);
  scene.add(rimlight);

  // ─── Suelo ────────────────────────────────────────────────────────────
  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: COLOR.ground, roughness: 0.95, metalness: 0.0 })
  );
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = -0.02;
  suelo.receiveShadow = true;
  scene.add(suelo);

  // ─── Río Guadiana ─────────────────────────────────────────────────────
  const rio = crearRio();
  scene.add(rio);

  // ─── Monumentos ───────────────────────────────────────────────────────
  const alcazabaGroup = crearAlcazaba();
  alcazabaGroup.position.set(-10, 0, -6);
  scene.add(alcazabaGroup);

  const puenteGroup = crearPuenteReal();
  puenteGroup.position.set(2, 0, -0.5);
  scene.add(puenteGroup);

  const puertaGroup = crearPuertaPalmas();
  puertaGroup.position.set(11, 0, -9);
  puertaGroup.scale.setScalar(0.7);
  scene.add(puertaGroup);

  // ─── Estrellas ────────────────────────────────────────────────────────
  const estrellas = crearEstrellas(800);
  scene.add(estrellas);

  // ─── Partículas flotantes (luciérnagas) ───────────────────────────────
  const luciernagas = crearLuciernagas(40);
  scene.add(luciernagas);

  // ─── Luna visual ──────────────────────────────────────────────────────
  const lunaVisual = new THREE.Mesh(
    new THREE.CircleGeometry(2.5, 32),
    new THREE.MeshBasicMaterial({ color: 0xddeeff, side: THREE.FrontSide })
  );
  lunaVisual.position.set(-18, 28, -40);
  lunaVisual.lookAt(camera.position);
  scene.add(lunaVisual);

  // Halo de luna
  const haloLuna = new THREE.Mesh(
    new THREE.CircleGeometry(4, 32),
    new THREE.MeshBasicMaterial({
      color:       0x2244aa,
      transparent: true,
      opacity:     0.12,
      side:        THREE.FrontSide,
    })
  );
  haloLuna.position.copy(lunaVisual.position);
  haloLuna.position.z += 0.1;
  scene.add(haloLuna);

  // ─── Clock y materiales animados ──────────────────────────────────────
  const clock = new THREE.Clock();
  const rioMat = rio.material; // guardamos referencia para animarlo

  // ─── Loop de animación ────────────────────────────────────────────────
  let rafId;
  let isActive = true;

  function animate() {
    if (!isActive) return;
    rafId = requestAnimationFrame(animate);

    const t  = clock.getElapsedTime();
    const dt = clock.getDelta(); // no se usa aún, preparado para Fase 4

    // Río: ondulación de color
    rioMat.color.lerpColors(
      COLOR.river,
      COLOR.riverShine,
      (Math.sin(t * 0.4) + 1) * 0.5
    );
    // Leve desplazamiento UV para simular corriente (approx via offset material)
    // En r167 esto requiere un shader custom; usamos solo el color por ahora

    // Cámara: órbita muy lenta (cinematic)
    const camRadius = 26;
    const camAngle  = t * 0.035;
    camera.position.x = Math.sin(camAngle) * camRadius * 0.4;
    camera.position.z = camRadius + Math.cos(camAngle * 0.6) * 3;
    camera.position.y = 9 + Math.sin(t * 0.12) * 0.8;
    camera.lookAt(0, 1.5, -2);

    // Estrellas: rotación muy lenta
    estrellas.rotation.y = t * 0.004;

    // Luciérnagas: movimiento aleatorio suave
    animarLuciernagas(luciernagas, t);

    // Hoguera: parpadeo de luz
    hoguera.intensity = 3 + Math.sin(t * 8.5) * 0.8 + Math.sin(t * 13.1) * 0.4;

    renderer.render(scene, camera);
  }

  animate();

  // ─── Resize ───────────────────────────────────────────────────────────
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ─── Cleanup ──────────────────────────────────────────────────────────
  return function cleanup() {
    isActive = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
    // Liberar geometrías y materiales
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  };
}

// ─── Constructores de elementos de la escena ─────────────────────────────────

/**
 * Río Guadiana: plano largo con material azul semitransparente.
 */
function crearRio() {
  const geo = new THREE.PlaneGeometry(70, 7, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color:       COLOR.river,
    metalness:   0.5,
    roughness:   0.15,
    transparent: true,
    opacity:     0.88,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x  = -Math.PI / 2;
  mesh.position.y  = 0.01;
  mesh.position.z  = 0.5;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Alcazaba de Badajoz: muralla, torres y crenellaciones.
 * Estética low-poly, colores cálidos (terracota/piedra).
 */
function crearAlcazaba() {
  const group  = new THREE.Group();
  const matMuro   = new THREE.MeshStandardMaterial({ color: COLOR.alcazaba, roughness: 0.9 });
  const matOscuro = new THREE.MeshStandardMaterial({ color: COLOR.alcazabaDk, roughness: 0.95 });

  // Muralla base (larga y baja)
  const muroBase = new THREE.Mesh(new THREE.BoxGeometry(14, 2.5, 2), matMuro);
  muroBase.position.set(0, 1.25, 0);
  muroBase.castShadow = muroBase.receiveShadow = true;
  group.add(muroBase);

  // Torre principal izquierda
  const torPrinc = new THREE.Mesh(new THREE.BoxGeometry(3.5, 7, 3.5), matMuro);
  torPrinc.position.set(-5, 3.5, 0);
  torPrinc.castShadow = true;
  group.add(torPrinc);

  // Torre secundaria derecha
  const torSec = new THREE.Mesh(new THREE.BoxGeometry(2.5, 5.5, 2.5), matMuro);
  torSec.position.set(4.5, 2.75, 0);
  torSec.castShadow = true;
  group.add(torSec);

  // Torre del homenaje (la más alta, en el centro)
  const torHom = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 2), matOscuro);
  torHom.position.set(-1, 4.5, 0);
  torHom.castShadow = true;
  group.add(torHom);

  // Crenellaciones en la muralla base
  const crenaPositions = [-5, -3.5, -2, -0.5, 1, 2.5, 4, 5.5];
  crenaPositions.forEach(x => {
    const cren = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), matMuro);
    cren.position.set(x, 3.15, 0);
    cren.castShadow = true;
    group.add(cren);
  });

  // Crenellaciones en torre principal
  [-1, 0, 1].forEach(dx => {
    [-1, 1].forEach(dz => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), matMuro);
      c.position.set(-5 + dx * 1.0, 7.45, dz * 1.0);
      c.castShadow = true;
      group.add(c);
    });
  });

  // Arco de entrada (puerta de la alcazaba)
  const arcoGeo = new THREE.TorusGeometry(0.8, 0.22, 8, 14, Math.PI);
  const arco    = new THREE.Mesh(arcoGeo, matOscuro);
  arco.position.set(1.5, 1.2, 1.05);
  arco.rotation.set(0, 0, Math.PI);
  group.add(arco);

  const puertaFill = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.5, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x150a04, roughness: 1 })
  );
  puertaFill.position.set(1.5, 0.75, 1.05);
  group.add(puertaFill);

  // Ventanas con luz interior (emisión)
  const matVentana = new THREE.MeshStandardMaterial({
    color:           0xff8844,
    emissive:        new THREE.Color(0xff5511),
    emissiveIntensity: 1.5,
  });
  [-5, -1].forEach(x => {
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.15), matVentana);
    vent.position.set(x, 4, 1.1);
    group.add(vent);
  });

  return group;
}

/**
 * Puente Real sobre el Guadiana: tablero y arcos de piedra.
 */
function crearPuenteReal() {
  const group = new THREE.Group();
  const mat   = new THREE.MeshStandardMaterial({ color: COLOR.puente, roughness: 0.85 });

  // Tablero del puente (muy largo)
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(22, 0.5, 3.5), mat);
  tablero.position.set(0, 2.2, 0);
  tablero.castShadow = tablero.receiveShadow = true;
  group.add(tablero);

  // Pretiles laterales
  [-1.5, 1.5].forEach(z => {
    const pretil = new THREE.Mesh(new THREE.BoxGeometry(22, 0.6, 0.25), mat);
    pretil.position.set(0, 2.75, z);
    pretil.castShadow = true;
    group.add(pretil);
  });

  // Arcos y pilares
  const posiciones = [-7.5, -3.75, 0, 3.75, 7.5];
  posiciones.forEach(x => {
    // Arco (torus medio)
    const arco = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.25, 7, 16, Math.PI),
      mat
    );
    arco.position.set(x, 1.1, 0);
    arco.rotation.z = Math.PI;
    arco.castShadow = true;
    group.add(arco);

    // Pilares a cada lado del arco
    [-1.05, 1.05].forEach(dx => {
      const pilar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 0.7), mat);
      pilar.position.set(x + dx, 1.0, 0);
      pilar.castShadow = pilar.receiveShadow = true;
      group.add(pilar);
    });
  });

  // Farolas decorativas
  const matFarola = new THREE.MeshStandardMaterial({
    color:           0xffffaa,
    emissive:        new THREE.Color(0xffd060),
    emissiveIntensity: 1.2,
  });
  posiciones.forEach(x => {
    [-1.6, 1.6].forEach(z => {
      const farola = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), matFarola);
      farola.position.set(x, 2.85, z);
      group.add(farola);
      // Punto de luz pequeño (solo algunos para no saturar)
      if (Math.abs(x) < 4 && z > 0) {
        const pl = new THREE.PointLight(0xffd060, 0.4, 5);
        pl.position.copy(farola.position);
        group.add(pl);
      }
    });
  });

  return group;
}

/**
 * Puerta de Palmas: dos torres flanqueando un arco monumental.
 */
function crearPuertaPalmas() {
  const group = new THREE.Group();
  const mat   = new THREE.MeshStandardMaterial({ color: COLOR.puerta, roughness: 0.88 });
  const matOsc= new THREE.MeshStandardMaterial({ color: 0x150a04, roughness: 1.0 });

  // Torres
  [-2.4, 2.4].forEach(x => {
    const torre = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 2), mat);
    torre.position.set(x, 4.5, 0);
    torre.castShadow = torre.receiveShadow = true;
    group.add(torre);

    // Capitel de torre (piramidal)
    const capitel = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.5, 4), mat);
    capitel.position.set(x, 9.75, 0);
    capitel.rotation.y = Math.PI / 4;
    capitel.castShadow = true;
    group.add(capitel);

    // Crenellaciones
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), mat);
      c.position.set(x + i * 0.7, 9.35, 0);
      group.add(c);
    }
  });

  // Cuerpo central entre torres (muro del arco)
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(4.8, 6, 1.5), mat);
  cuerpo.position.set(0, 3, 0);
  cuerpo.castShadow = true;
  group.add(cuerpo);

  // Arco principal (grande)
  const arco = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.35, 8, 18, Math.PI),
    mat
  );
  arco.position.set(0, 3.0, 0.76);
  arco.rotation.z = Math.PI;
  arco.castShadow = true;
  group.add(arco);

  // Relleno oscuro del arco (puerta)
  const puerta = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.0, 0.2), matOsc);
  puerta.position.set(0, 1.5, 0.76);
  group.add(puerta);

  // Decoraciones: pequeñas ventanas en las torres
  [-2.4, 2.4].forEach(x => {
    const matVent = new THREE.MeshStandardMaterial({
      color:           0x334466,
      roughness:       0.5,
    });
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.15), matVent);
    vent.position.set(x, 6, 1.05);
    group.add(vent);
  });

  return group;
}

/**
 * Campo de estrellas (partículas).
 * @param {number} count - Número de estrellas
 */
function crearEstrellas(count) {
  const positions = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Distribuir en semiesfera superior
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.random() * Math.PI * 0.5; // solo mitad superior
    const r     = 80 + Math.random() * 40;

    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 10;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 10;
    sizes[i]             = Math.random() * 0.4 + 0.1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color:           0xffffff,
    size:            0.25,
    sizeAttenuation: true,
    transparent:     true,
    opacity:         0.85,
  });

  return new THREE.Points(geo, mat);
}

/**
 * Luciérnagas: pequeñas partículas flotantes con movimiento orgánico.
 * @param {number} count
 */
function crearLuciernagas(count) {
  const positions = new Float32Array(count * 3);
  const phases    = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 24;
    positions[i * 3 + 1] = Math.random() * 5 + 0.5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
    phases[i]            = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Guardar fases como userData para animación
  geo.userData = { phases, initialPositions: positions.slice() };

  const mat = new THREE.PointsMaterial({
    color:           0x88ff44,
    size:            0.18,
    sizeAttenuation: true,
    transparent:     true,
    opacity:         0.9,
  });

  return new THREE.Points(geo, mat);
}

/**
 * Anima las luciérnagas con movimiento sinusoidal orgánico.
 * @param {THREE.Points} luciernagas
 * @param {number} t - tiempo en segundos
 */
function animarLuciernagas(luciernagas, t) {
  const pos    = luciernagas.geometry.attributes.position;
  const { phases, initialPositions } = luciernagas.geometry.userData;

  for (let i = 0; i < phases.length; i++) {
    const ph = phases[i];
    pos.array[i * 3]     = initialPositions[i * 3]     + Math.sin(t * 0.6 + ph) * 0.8;
    pos.array[i * 3 + 1] = initialPositions[i * 3 + 1] + Math.sin(t * 0.9 + ph * 1.3) * 0.6;
    pos.array[i * 3 + 2] = initialPositions[i * 3 + 2] + Math.cos(t * 0.7 + ph * 0.8) * 0.7;
  }
  pos.needsUpdate = true;

  // Parpadeo de opacidad
  luciernagas.material.opacity = 0.6 + Math.sin(t * 2.5) * 0.3;
}
