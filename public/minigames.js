/**
 * public/minigames.js — Renderizado 3D de los Minijuegos en tiempo real (Fases 4 y 5)
 *
 * ARQUITECTURA VISUAL (Three.js sin bundlers / Módulos ES):
 * - PBR moderno (ACESFilmic, IBL, bloom suave) sin contornos negros.
 * - Todos los modelos (piraguas, monumentos, torres, coches, pretiles) son procedurales.
 * - Interpolación suave lerp a 60 FPS a partir de snapshots del servidor recibidos a 20 Hz.
 *
 * CATÁLOGO COMPLETO DE LOS 8 MINIJUEGOS:
 * 1. 'carrera_guadiana' / 'piraguismo_guadiana': Piragüismo en el Guadiana
 * 2. 'esquivar_muralla': Carrera y salto en la Muralla de la Alcazaba
 * 3. 'carnaval_caramelos': Lluvia de caramelos del Carnaval de Badajoz
 * 4. 'carrera_coches': Carrera de coches por el Puente Real
 * 5. 'pulso_fuerza': Pulso de fuerza en la Plaza Alta
 * 6. 'memory_monumentos': Memory visual de monumentos pacenses
 * 7. 'equilibrio_puente': Equilibrio sobre el pretil del Puente de Palmas
 * 8. 'reaccion_luces': Reacción rápida a la luz en la Torre de Espantaperros
 * Bonus: 'lluvia_bellotas': Lluvia de Bellotas en la Dehesa
 */

import * as THREE from 'three';
import {
  aplicarAmbiente, animarAmbiente, toonify, disposeArbol,
  crearHud, actualizarHud, destruirHud,
  configurarRenderer, crearBlobShadow,
} from './minigamesLook.js';
import { ESCENARIOS } from './minigamesScenery.js';

export class BadajozMinigames3D {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.composer = null;
    this.animId = null;
    this.minigameId = null;
    this.avatares = [];

    // Colecciones de mallas de la escena
    this.playerMeshes = new Map(); // playerId -> THREE.Group
    this.objectMeshes = new Map(); // id -> THREE.Mesh / THREE.Group
    this.decorations = [];

    // Snapshot y estado interpolado
    this.snapshotActual = null;
    this.targetPlayers = [];
    this.targetObjects = [];

    // Referencias específicas de animación (NO cambiar nombres — usados por actualizarEstado/animate)
    this.focoLuzTorre = null;
    this.focoMeshTorre = null;
    this.monumentosPeanas = new Map();
    this.aguaMesh = null;
    this.vientoMesh = null;
    this.calzadaCoches = null;

    // Infraestructura de look
    this.lucesBase = [];
    this.sol = null;
    this.nubes = null;
    this.fondo = null;
    this.escenarioGroup = null;
    this._blobShadows = new Map();
    this.ultimoFrame = performance.now();

    // HUD
    this.hud = null;
    this.hudEls = null;
    this.timerCanvas = null;
    this.rondaEl = null;
    this._timerTotal = null;

    this.initRenderer();
  }

  initRenderer() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1128);

    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.5, 300);
    this.camera.position.set(0, 18, 32);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Tone mapping, sRGB, IBL, EffectComposer
    configurarRenderer(this);

    this.onResizeBound = this.onResize.bind(this);
    window.addEventListener('resize', this.onResizeBound);

    this.animate = this.animate.bind(this);
    this.animId = requestAnimationFrame(this.animate);
  }

  onResize() {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURACIÓN DE ESCENAS SEGÚN MINIJUEGO
  // ══════════════════════════════════════════════════════════════════════════

  cargarMinijuego(minigameId, jugadores, avataresCatalogo) {
    this.limpiarEscena();
    this.minigameId = minigameId;
    this.avatares = avataresCatalogo || [];

    if (minigameId === 'carrera_guadiana' || minigameId === 'piraguismo_guadiana') {
      this.setupCarreraGuadiana(jugadores);
    } else if (minigameId === 'reaccion_luces') {
      this.setupReaccionLuces(jugadores);
    } else if (minigameId === 'memory_monumentos') {
      this.setupMemoryMonumentos(jugadores);
    } else if (minigameId === 'pulso_fuerza') {
      this.setupPulsoFuerza(jugadores);
    } else if (minigameId === 'carnaval_caramelos') {
      this.setupCarnavalCaramelos(jugadores);
    } else if (minigameId === 'esquivar_muralla') {
      this.setupEsquivarMuralla(jugadores);
    } else if (minigameId === 'carrera_coches') {
      this.setupCarreraCoches(jugadores);
    } else if (minigameId === 'equilibrio_puente') {
      this.setupEquilibrioPuente(jugadores);
    } else if (minigameId === 'lluvia_bellotas') {
      this.setupLluviaBellotas(jugadores);
    }

    // Escenario decorativo desde minigamesScenery.js
    const def = ESCENARIOS[minigameId];
    if (def) {
      this.escenarioGroup = def.construir(this);
      if (this.escenarioGroup) this.scene.add(this.escenarioGroup);
    }

    // Pipeline visual completo: toonify, cielo, luces, nubes, fondo
    aplicarAmbiente(this, minigameId);

    // Blob shadows bajo cada jugador
    this._crearBlobShadows(jugadores);

    // HUD
    crearHud(this, jugadores, this.avatares);
  }

  _crearBlobShadows(jugadores) {
    (jugadores || []).forEach(j => {
      const blob = crearBlobShadow(1.2);
      this.scene.add(blob);
      this._blobShadows.set(j.playerId, blob);
    });
  }

  limpiarEscena() {
    // Blob shadows
    this._blobShadows.forEach(blob => {
      this.scene.remove(blob);
      disposeArbol(blob);
    });
    this._blobShadows.clear();

    // Jugadores
    this.playerMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      disposeArbol(mesh);
    });
    this.playerMeshes.clear();

    // Objetos dinámicos
    this.objectMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      disposeArbol(mesh);
    });
    this.objectMeshes.clear();

    // Decoraciones del setup
    this.decorations.forEach(d => {
      this.scene.remove(d);
      disposeArbol(d);
    });
    this.decorations = [];

    // Luces base
    (this.lucesBase || []).forEach(l => this.scene.remove(l));
    this.lucesBase = [];

    // Nubes y fondo
    if (this.nubes) { this.scene.remove(this.nubes); disposeArbol(this.nubes); this.nubes = null; }
    if (this.fondo) { this.scene.remove(this.fondo); disposeArbol(this.fondo); this.fondo = null; }

    // Escenario decorativo
    if (this.escenarioGroup) {
      this.scene.remove(this.escenarioGroup);
      disposeArbol(this.escenarioGroup);
      this.escenarioGroup = null;
    }

    this.sol = null;
    this.monumentosPeanas.clear();
    this.focoLuzTorre = null;
    this.focoMeshTorre = null;
    this.aguaMesh = null;
    this.vientoMesh = null;
    this.calzadaCoches = null;

    destruirHud(this);
  }

  // ─── 1. ESCENA: Piragüismo en el Guadiana ────────────────────────────────────
  setupCarreraGuadiana(jugadores) {
    this.camera.position.set(-8, 14, 26);
    this.camera.lookAt(15, 0, 0);

    // Río Guadiana (PlaneGeometry con vértices para animar olas)
    const aguaGeo = new THREE.PlaneGeometry(200, 36, 48, 16);
    const aguaMat = new THREE.MeshStandardMaterial({
      color: 0x1a9ec4,
      roughness: 0.12,
      metalness: 0.65,
      transparent: true,
      opacity: 0.88,
      emissive: 0x0a4466,
      emissiveIntensity: 0.15,
    });
    const agua = new THREE.Mesh(aguaGeo, aguaMat);
    agua.rotation.x = -Math.PI / 2;
    agua.position.set(60, 0, 0);
    agua.receiveShadow = true;
    this.scene.add(agua);
    this.decorations.push(agua);
    this.aguaMesh = agua;

    // Piraguas de los jugadores
    const carrilesZ = [-9, -3, 3, 9];
    jugadores.forEach((j, index) => {
      const piragua = this.crearPiragua(j, carrilesZ[index % 4]);
      this.scene.add(piragua);
      this.playerMeshes.set(j.playerId, piragua);
    });
  }

  crearPiragua(jugador, posZ) {
    const group = new THREE.Group();
    group.position.set(0, 0.15, posZ);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    // Casco aplanado de kayak
    const cascoGeo = new THREE.CylinderGeometry(0.7, 0.7, 5.5, 10);
    cascoGeo.rotateZ(Math.PI / 2);
    cascoGeo.scale(1, 0.42, 0.78);
    const cascoMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.28, metalness: 0.18 });
    const casco = new THREE.Mesh(cascoGeo, cascoMat);
    casco.castShadow = true;
    group.add(casco);

    // Cubierta superior
    const cubiertaGeo = new THREE.CylinderGeometry(0.65, 0.65, 3.5, 10);
    cubiertaGeo.rotateZ(Math.PI / 2);
    cubiertaGeo.scale(1, 0.18, 0.5);
    const cubiertaMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const cubierta = new THREE.Mesh(cubiertaGeo, cubiertaMat);
    cubierta.position.set(0, 0.25, 0);
    group.add(cubierta);

    const remoGeo = new THREE.CylinderGeometry(0.07, 0.07, 4.2);
    remoGeo.rotateX(Math.PI / 2);
    const remoMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 });
    const remo = new THREE.Mesh(remoGeo, remoMat);
    remo.position.set(0, 0.55, 0);
    group.add(remo);
    group.userData.remo = remo;

    // Pala del remo
    const palaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    [[-2.0, 0.55, 0.7], [2.0, 0.55, -0.7]].forEach(([x, y, z]) => {
      const pala = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.35), palaMat);
      pala.position.set(x, y, z);
      group.add(pala);
    });

    // Base circular brillante del color del jugador con anillo emisivo
    const baseGeo = new THREE.CylinderGeometry(0.9, 0.95, 0.12, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.55, roughness: 0.3 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.06;
    group.add(base);

    this.adjuntarAvatarSprite(group, jugador.avatarId, 1.85);

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.3, 0);
    group.add(label);

    return group;
  }

  // ─── 2. ESCENA: Reacción en la Alcazaba (Minijuego 8) ────────────────────────
  setupReaccionLuces(jugadores) {
    this.camera.position.set(0, 10, 24);
    this.camera.lookAt(0, 5, 0);

    // Suelo (la textura viene del escenario, aquí ponemos la geometría base)
    const sueloGeo = new THREE.PlaneGeometry(40, 28);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x5a5040, roughness: 0.88 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    // Torre de Espantaperros (cuerpo principal — decoración añadida por escenario)
    const torreGroup = new THREE.Group();
    torreGroup.position.set(0, 0, -8);

    const cuerpoTorreGeo = new THREE.CylinderGeometry(3.1, 3.6, 16, 12);
    const piedraTorreMat = new THREE.MeshStandardMaterial({ color: 0xbdb3a0, roughness: 0.78 });
    const cuerpoTorre = new THREE.Mesh(cuerpoTorreGeo, piedraTorreMat);
    cuerpoTorre.position.y = 8;
    cuerpoTorre.castShadow = true;
    torreGroup.add(cuerpoTorre);

    const coronaTorre = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.2, 1.8, 12),
      piedraTorreMat
    );
    coronaTorre.position.y = 16.4;
    torreGroup.add(coronaTorre);

    // Foco de luz (MANTENER estos nombres exactos — usados por actualizarEstado)
    const focoGeo = new THREE.SphereGeometry(1.1, 16, 16);
    const focoMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff0000,
      emissiveIntensity: 1.2,
      roughness: 0.15,
    });
    const focoMesh = new THREE.Mesh(focoGeo, focoMat);
    focoMesh.position.set(0, 18.2, 0);
    torreGroup.add(focoMesh);
    this.focoMeshTorre = focoMesh;

    const focoLuz = new THREE.PointLight(0xff2222, 2.5, 38);
    focoLuz.position.set(0, 18.5, 1);
    torreGroup.add(focoLuz);
    this.focoLuzTorre = focoLuz;

    this.scene.add(torreGroup);
    this.decorations.push(torreGroup);

    const separacionX = 14 / Math.max(1, jugadores.length);
    jugadores.forEach((j, index) => {
      const posX = -7 + (index + 0.5) * separacionX;
      const peon = this.crearPeonReaccion(j, posX);
      this.scene.add(peon);
      this.playerMeshes.set(j.playerId, peon);
    });
  }

  crearPeonReaccion(jugador, posX) {
    const group = new THREE.Group();
    group.position.set(posX, 0, 4);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    // Base circular brillante con anillo emisivo
    const peanaGeo = new THREE.CylinderGeometry(0.95, 1.05, 0.22, 20);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.5, roughness: 0.35 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.11;
    group.add(peana);

    this.adjuntarAvatarSprite(group, jugador.avatarId, 2.2);

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.8, 0);
    group.add(label);

    const labelReaccion = this.crearEtiquetaFeedback('', '#f1c40f');
    labelReaccion.position.set(0, 4.6, 0);
    labelReaccion.visible = false;
    group.add(labelReaccion);
    group.userData.labelReaccion = labelReaccion;

    return group;
  }

  // ─── 3. ESCENA: Memory de Monumentos Pacenses (Minijuego 6) ──────────────────
  setupMemoryMonumentos(jugadores) {
    this.camera.position.set(0, 14, 25);
    this.camera.lookAt(0, 2, 0);

    const sueloGeo = new THREE.PlaneGeometry(38, 28);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x8b3a3a, roughness: 0.68 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    const configMonumentos = [
      { id: 'alcazaba',      x: -9.5, z: -4, label: 'La Alcazaba' },
      { id: 'plaza_alta',    x: -3.2, z: -6, label: 'La Plaza Alta' },
      { id: 'puente_real',   x:  3.2, z: -6, label: 'El Puente Real' },
      { id: 'puerta_palmas', x:  9.5, z: -4, label: 'Puerta de Palmas' },
    ];

    configMonumentos.forEach(cfg => {
      const peanaGroup = new THREE.Group();
      peanaGroup.position.set(cfg.x, 0, cfg.z);

      const peanaMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.65, roughness: 0.28 });
      const peanaMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.85, 1.2, 24), peanaMat);
      peanaMesh.position.y = 0.6;
      peanaGroup.add(peanaMesh);

      const modelo = this.crearModeloMonumento(cfg.id);
      modelo.position.y = 1.3;
      peanaGroup.add(modelo);
      peanaGroup.userData.modelo = modelo;
      peanaGroup.userData.id = cfg.id;

      // MANTENER haloLuz — actualizarEstado() lo usa
      const haloLuz = new THREE.PointLight(0xfff5a0, 0, 10);
      haloLuz.position.set(0, 3.5, 0);
      peanaGroup.add(haloLuz);
      peanaGroup.userData.haloLuz = haloLuz;

      const tag = this.crearEtiquetaNombre(cfg.label, '#ffffff');
      tag.position.set(0, 4.2, 0);
      peanaGroup.add(tag);

      this.scene.add(peanaGroup);
      this.decorations.push(peanaGroup);
      this.monumentosPeanas.set(cfg.id, peanaGroup);
    });

    const separacionX = 14 / Math.max(1, jugadores.length);
    jugadores.forEach((j, index) => {
      const posX = -7 + (index + 0.5) * separacionX;
      const pj = this.crearPeonMemory(j, posX);
      this.scene.add(pj);
      this.playerMeshes.set(j.playerId, pj);
    });
  }

  crearModeloMonumento(id) {
    const group = new THREE.Group();

    if (id === 'alcazaba') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xb5a894, roughness: 0.78 });
      const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 2.4, 10), mat);
      torre.position.y = 1.2; group.add(torre);
      const almena = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.88, 0.5, 10), mat);
      almena.position.y = 2.5; group.add(almena);
      // Almenas pequeñas
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const alm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), mat);
        alm.position.set(Math.cos(ang) * 0.8, 2.85, Math.sin(ang) * 0.8);
        group.add(alm);
      }
    } else if (id === 'plaza_alta') {
      const paredMat = new THREE.MeshStandardMaterial({ color: 0xa93226, roughness: 0.58 });
      const front = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 0.5), paredMat);
      front.position.y = 1.0; group.add(front);
      const arcoMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.45 });
      [-0.6, 0.6].forEach(x => {
        const arco = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.1, 8, 16, Math.PI), arcoMat);
        arco.position.set(x, 0.5, 0.28); group.add(arco);
      });
    } else if (id === 'puente_real') {
      const matAzul = new THREE.MeshStandardMaterial({ color: 0x2471a3, roughness: 0.38 });
      const arcoPrincipal = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 8, 24, Math.PI), matAzul);
      arcoPrincipal.position.set(0, 0.6, 0); group.add(arcoPrincipal);
      const calzada = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x7f8c8d }));
      calzada.position.y = 0.6; group.add(calzada);
    } else if (id === 'puerta_palmas') {
      const piedraMat = new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.68 });
      const torreIzq = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 2.2, 12), piedraMat);
      torreIzq.position.set(-0.8, 1.1, 0); group.add(torreIzq);
      const torreDer = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 2.2, 12), piedraMat);
      torreDer.position.set(0.8, 1.1, 0); group.add(torreDer);
      const arcoCentral = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.4), piedraMat);
      arcoCentral.position.set(0, 1.2, 0); group.add(arcoCentral);
    }

    return group;
  }

  crearPeonMemory(jugador, posX) {
    const group = new THREE.Group();
    group.position.set(posX, 0, 4);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    const peanaGeo = new THREE.CylinderGeometry(0.88, 0.98, 0.2, 18);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4, roughness: 0.35 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.1;
    group.add(peana);

    this.adjuntarAvatarSprite(group, jugador.avatarId, 2.0);

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.6, 0);
    group.add(label);

    const feedbackSprite = this.crearEtiquetaFeedback('', '#2ecc71');
    feedbackSprite.position.set(0, 4.4, 0);
    feedbackSprite.visible = false;
    group.add(feedbackSprite);
    group.userData.feedback = feedbackSprite;

    return group;
  }

  // ─── 4. ESCENA: Pulso en la Plaza Alta (Minijuego 5) ─────────────────────────
  setupPulsoFuerza(jugadores) {
    this.camera.position.set(0, 8, 18);
    this.camera.lookAt(0, 3, 0);

    const sueloGeo = new THREE.PlaneGeometry(34, 24);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x8b3a3a, roughness: 0.72 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    // Mesa de pulso
    const mesaGroup = new THREE.Group();
    const mesaBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.4, 2.2, 18),
      new THREE.MeshStandardMaterial({ color: 0x424949, roughness: 0.8 })
    );
    mesaBase.position.y = 1.1;
    mesaGroup.add(mesaBase);
    const tableroMesa = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 0.32, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xa04000, roughness: 0.48 })
    );
    tableroMesa.position.y = 2.28;
    mesaGroup.add(tableroMesa);
    this.scene.add(mesaGroup);
    this.decorations.push(mesaGroup);

    const num = Math.max(1, jugadores.length);
    const separacionX = 6.4 / num;
    jugadores.forEach((j, index) => {
      const posX = -3.2 + (index + 0.5) * separacionX;
      const pj = this.crearPeonPulso(j, posX);
      this.scene.add(pj);
      this.playerMeshes.set(j.playerId, pj);
    });
  }

  crearPeonPulso(jugador, posX) {
    const group = new THREE.Group();
    group.position.set(posX, 0, 1.8);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    const peanaGeo = new THREE.CylinderGeometry(0.78, 0.88, 0.2, 18);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4, roughness: 0.35 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.1;
    group.add(peana);

    this.adjuntarAvatarSprite(group, jugador.avatarId, 1.8);

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.4, 0);
    group.add(label);

    const fondoBarra = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    fondoBarra.position.set(0, 4.0, 0);
    group.add(fondoBarra);

    const barraFuerza = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.22, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0xc0392b, emissiveIntensity: 0.5, roughness: 0.3 })
    );
    barraFuerza.position.set(0, 4.0, 0.02);
    barraFuerza.scale.set(0.1, 1, 1);
    group.add(barraFuerza);
    group.userData.barraFuerza = barraFuerza;

    return group;
  }

  // ─── 5. ESCENA: Caramelos del Carnaval de Badajoz (Minijuego 3) ──────────────
  setupCarnavalCaramelos(jugadores) {
    this.camera.position.set(0, 6, 17);
    this.camera.lookAt(0, 4, 0);

    const sueloGeo = new THREE.PlaneGeometry(38, 26);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x2c1b3d, roughness: 0.78 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    const separacionX = 14 / Math.max(1, jugadores.length);
    jugadores.forEach((j, index) => {
      const posX = -7 + (index + 0.5) * separacionX;
      const pj = this.crearPersonajeCesta(j, posX);
      this.scene.add(pj);
      this.playerMeshes.set(j.playerId, pj);
    });
  }

  // ─── 6. ESCENA: Carrera en la Muralla de la Alcazaba (Minijuego 2) ───────────
  setupEsquivarMuralla(jugadores) {
    this.camera.position.set(0, 7, 14);
    this.camera.lookAt(0, 3, -10);

    // El adarve viene del escenario, aquí solo ponemos el plano base invisible
    const sueloGeo = new THREE.PlaneGeometry(10, 90);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x8d8271, roughness: 0.85 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.set(0, 0, -20);
    suelo.receiveShadow = true;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    jugadores.forEach((j) => {
      const pj = this.crearPeonCorredor(j);
      this.scene.add(pj);
      this.playerMeshes.set(j.playerId, pj);
    });
  }

  crearPeonCorredor(jugador) {
    const group = new THREE.Group();
    group.position.set(0, 0, 0);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    const peanaGeo = new THREE.CylinderGeometry(0.68, 0.78, 0.2, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4, roughness: 0.35 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.1;
    group.add(peana);

    this.adjuntarAvatarSprite(group, jugador.avatarId, 1.6);

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 2.9, 0);
    group.add(label);

    return group;
  }

  // ─── 7. ESCENA: Carrera de Coches por el Puente Real (Minijuego 4) ───────────
  setupCarreraCoches(jugadores) {
    this.camera.position.set(0, 9, 16);
    this.camera.lookAt(0, 1.5, -12);

    // Calzada base (el escenario añade textura encima)
    const calzadaGeo = new THREE.PlaneGeometry(12, 130);
    const calzadaMat = new THREE.MeshStandardMaterial({ color: 0x222629, roughness: 0.72 });
    const calzada = new THREE.Mesh(calzadaGeo, calzadaMat);
    calzada.rotation.x = -Math.PI / 2;
    calzada.position.set(0, 0, -35);
    calzada.receiveShadow = true;
    this.scene.add(calzada);
    this.decorations.push(calzada);
    this.calzadaCoches = calzada;

    // Gran arco azul del Puente Real
    const arcoMat = new THREE.MeshStandardMaterial({ color: 0x1a6fd4, roughness: 0.28, emissive: 0x0a3060, emissiveIntensity: 0.15 });
    const granArco = new THREE.Mesh(new THREE.TorusGeometry(9, 0.65, 10, 36, Math.PI), arcoMat);
    granArco.position.set(0, 0, -35);
    granArco.scale.set(1.05, 1.45, 1);
    granArco.castShadow = true;
    this.scene.add(granArco);
    this.decorations.push(granArco);

    // Tirantes
    const tiranteMat = new THREE.MeshStandardMaterial({ color: 0xeef2ff, roughness: 0.4 });
    for (let i = -7; i <= 7; i += 1.8) {
      const tirante = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 12), tiranteMat);
      tirante.position.set(i, 6, -35);
      this.scene.add(tirante);
      this.decorations.push(tirante);
    }

    jugadores.forEach((j) => {
      const coche = this.crearCoche3D(j);
      this.scene.add(coche);
      this.playerMeshes.set(j.playerId, coche);
    });
  }

  crearCoche3D(jugador) {
    const group = new THREE.Group();
    group.position.set(0, 0.3, 0);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    const chasisGeo = new THREE.BoxGeometry(1.6, 0.6, 3.0);
    const chasisMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.28, metalness: 0.45, emissive: colorHex, emissiveIntensity: 0.08 });
    const chasis = new THREE.Mesh(chasisGeo, chasisMat);
    chasis.position.y = 0.4; chasis.castShadow = true;
    group.add(chasis);

    const cabinaGeo = new THREE.BoxGeometry(1.2, 0.5, 1.4);
    const cabinaMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.08, metalness: 0.3 });
    const cabina = new THREE.Mesh(cabinaGeo, cabinaMat);
    cabina.position.set(0, 0.85, -0.2);
    group.add(cabina);

    const ruedaGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 14);
    ruedaGeo.rotateZ(Math.PI / 2);
    const ruedaMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.88 });
    [[-0.85, 0.35, 0.9], [0.85, 0.35, 0.9], [-0.85, 0.35, -0.9], [0.85, 0.35, -0.9]].forEach(([rx, ry, rz]) => {
      const rueda = new THREE.Mesh(ruedaGeo, ruedaMat);
      rueda.position.set(rx, ry, rz);
      group.add(rueda);
    });

    this.adjuntarAvatarSprite(group, jugador.avatarId, 1.8);

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 2.9, 0);
    group.add(label);

    return group;
  }

  // ─── 8. ESCENA: Equilibrio en el Puente de Palmas (Minijuego 7) ──────────────
  setupEquilibrioPuente(jugadores) {
    this.camera.position.set(0, 7, 18);
    this.camera.lookAt(0, 3, 0);

    // Río Guadiana
    const aguaGeo = new THREE.PlaneGeometry(100, 60, 24, 12);
    const aguaMat = new THREE.MeshStandardMaterial({
      color: 0x1a9ec4, roughness: 0.12, metalness: 0.65,
      transparent: true, opacity: 0.88,
      emissive: 0x0a4466, emissiveIntensity: 0.15,
    });
    const agua = new THREE.Mesh(aguaGeo, aguaMat);
    agua.rotation.x = -Math.PI / 2;
    agua.position.set(0, -3.5, 0);
    this.scene.add(agua);
    this.decorations.push(agua);

    // Pretil del puente
    const pretilGeo = new THREE.BoxGeometry(28, 4, 2.4);
    const pretilMat = new THREE.MeshStandardMaterial({ color: 0x938874, roughness: 0.78 });
    const pretil = new THREE.Mesh(pretilGeo, pretilMat);
    pretil.position.set(0, -1.0, 0);
    pretil.castShadow = true; pretil.receiveShadow = true;
    this.scene.add(pretil);
    this.decorations.push(pretil);

    const separacionX = 22 / Math.max(1, jugadores.length);
    jugadores.forEach((j, index) => {
      const posX = -11 + (index + 0.5) * separacionX;
      const pj = this.crearPeonEquilibrio(j, posX);
      this.scene.add(pj);
      this.playerMeshes.set(j.playerId, pj);
    });
  }

  crearPeonEquilibrio(jugador, posX) {
    const group = new THREE.Group();
    group.position.set(posX, 1.0, 0);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    const cuerpoGroup = new THREE.Group();

    const peanaGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.2, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4, roughness: 0.35 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.1;
    cuerpoGroup.add(peana);

    const pertigaGeo = new THREE.CylinderGeometry(0.055, 0.055, 5.5);
    pertigaGeo.rotateZ(Math.PI / 2);
    const pertigaMat = new THREE.MeshStandardMaterial({ color: 0xd4ac0d, roughness: 0.38, emissive: 0xaa8800, emissiveIntensity: 0.2 });
    const pertiga = new THREE.Mesh(pertigaGeo, pertigaMat);
    pertiga.position.set(0, 1.2, 0);
    cuerpoGroup.add(pertiga);

    this.adjuntarAvatarSprite(cuerpoGroup, jugador.avatarId, 1.8);

    group.add(cuerpoGroup);
    group.userData.cuerpoGroup = cuerpoGroup;

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.4, 0);
    group.add(label);

    return group;
  }

  // ─── ESCENA BONUS: Lluvia de Bellotas ────────────────────────────────────────
  setupLluviaBellotas(jugadores) {
    this.camera.position.set(0, 6, 17);
    this.camera.lookAt(0, 4, 0);

    const sueloGeo = new THREE.PlaneGeometry(38, 26);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.88 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    suelo.receiveShadow = true;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    const separacionX = 14 / Math.max(1, jugadores.length);
    jugadores.forEach((j, index) => {
      const posX = -7 + (index + 0.5) * separacionX;
      const pj = this.crearPersonajeCesta(j, posX);
      this.scene.add(pj);
      this.playerMeshes.set(j.playerId, pj);
    });
  }

  crearPersonajeCesta(jugador, posX) {
    const group = new THREE.Group();
    group.position.set(posX, 0, 0);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    const peanaGeo = new THREE.CylinderGeometry(0.88, 0.88, 0.2, 18);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.45, roughness: 0.42 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.1;
    group.add(peana);

    const cestaGeo = new THREE.CylinderGeometry(1.0, 0.7, 0.9, 14, 1, true);
    const cestaMat = new THREE.MeshStandardMaterial({ color: 0x935116, roughness: 0.68, side: THREE.DoubleSide });
    const cesta = new THREE.Mesh(cestaGeo, cestaMat);
    cesta.position.set(0, 0.8, 0.6);
    group.add(cesta);

    this.adjuntarAvatarSprite(group, jugador.avatarId, 2.2);

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.8, 0);
    group.add(label);

    return group;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ACTUALIZACIÓN DE ESTADO DESDE EL SERVIDOR (20 Hz)
  // ══════════════════════════════════════════════════════════════════════════

  actualizarEstado(data) {
    if (!data) return;
    this.snapshotActual = data;
    this.targetPlayers = data.jugadores || [];
    this.targetObjects = data.objetos || data.obstaculos || [];
    actualizarHud(this, data);

    // 1. Minijuego Reacción — focoMeshTorre y focoLuzTorre (nombres intocables)
    if (this.minigameId === 'reaccion_luces') {
      const luzVerde = !!data.luzVerdeActiva;
      if (this.focoMeshTorre && this.focoLuzTorre) {
        if (luzVerde) {
          this.focoMeshTorre.material.color.setHex(0x00ff66);
          this.focoMeshTorre.material.emissive.setHex(0x00ff66);
          this.focoMeshTorre.material.emissiveIntensity = 2.0;
          this.focoLuzTorre.color.setHex(0x00ff66);
          this.focoLuzTorre.intensity = 5.0;
        } else {
          this.focoMeshTorre.material.color.setHex(0xff2222);
          this.focoMeshTorre.material.emissive.setHex(0xff0000);
          this.focoMeshTorre.material.emissiveIntensity = 0.8;
          this.focoLuzTorre.color.setHex(0xff2222);
          this.focoLuzTorre.intensity = 2.0;
        }
      }

      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (mesh && mesh.userData.labelReaccion) {
          const lbl = mesh.userData.labelReaccion;
          if (p.falsoComienzo) {
            this.actualizarSpriteTexto(lbl, '⚠️ ¡FALSO!', '#e74c3c');
            lbl.visible = true;
          } else if (p.reaccionUltimaRondaMs) {
            this.actualizarSpriteTexto(lbl, '⚡ ' + p.reaccionUltimaRondaMs + ' ms', '#2ecc71');
            lbl.visible = true;
          } else if (!p.haPulsadoRonda) {
            lbl.visible = false;
          }
        }
      });
    }

    // 2. Minijuego Memory — haloLuz (nombre intocable)
    if (this.minigameId === 'memory_monumentos') {
      const objetivoId = data.monumentoObjetivo && data.monumentoObjetivo.id;
      this.monumentosPeanas.forEach((peanaGroup, id) => {
        const esObjetivo = id === objetivoId;
        const halo = peanaGroup.userData.haloLuz;
        if (halo) halo.intensity = esObjetivo ? 3.5 : 0;
      });

      if (data.fase === 'REVELACION') {
        this.targetPlayers.forEach(p => {
          const mesh = this.playerMeshes.get(p.playerId);
          if (mesh && mesh.userData.feedback) {
            const fb = mesh.userData.feedback;
            if (p.acertoRonda === true) {
              this.actualizarSpriteTexto(fb, '✓ ¡CORRECTO!', '#2ecc71');
              fb.visible = true;
            } else if (p.acertoRonda === false) {
              this.actualizarSpriteTexto(fb, '✗ ¡FALLO!', '#e74c3c');
              fb.visible = true;
            }
          }
        });
      } else {
        this.playerMeshes.forEach(mesh => {
          if (mesh.userData.feedback) mesh.userData.feedback.visible = false;
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUCLE DE RENDERIZADO E INTERPOLACIÓN (60 FPS)
  // ══════════════════════════════════════════════════════════════════════════

  animate() {
    this.animId = requestAnimationFrame(this.animate);
    const now = Date.now();
    const ahora = performance.now();
    const dtSeg = Math.min(0.1, (ahora - (this.ultimoFrame || ahora)) / 1000);
    this.ultimoFrame = ahora;
    const t = ahora * 0.001;

    // Ambiente (nubes, sol, llamas, blob shadows, fps watchdog)
    animarAmbiente(this, dtSeg);

    // Escenario procedural
    if (this.escenarioGroup && ESCENARIOS[this.minigameId]) {
      ESCENARIOS[this.minigameId].animar(this, dtSeg, t);
    }

    // ── 1. Piragüismo ────────────────────────────────────────────────────────
    if (this.minigameId === 'carrera_guadiana' || this.minigameId === 'piraguismo_guadiana') {
      // Olas del agua (vértices del PlaneGeometry)
      if (this.aguaMesh) {
        const pos = this.aguaMesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), z = pos.getZ(i);
          pos.setY(i, Math.sin(t * 1.8 + x * 0.15 + z * 0.22) * 0.18);
        }
        pos.needsUpdate = true;
        this.aguaMesh.geometry.computeVertexNormals();
      }
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        mesh.position.x += (p.posicionX - mesh.position.x) * 0.25;
        if (mesh.userData.remo && p.velocidad > 0) {
          mesh.userData.remo.rotation.z = Math.sin(t * 8) * 0.38;
          mesh.rotation.z = Math.sin(t * 5) * 0.05;
        }
        // Bobbing suave de piragua en el agua
        mesh.position.y = 0.15 + Math.sin(t * 1.8 + mesh.position.x * 0.1) * 0.1;
      });
      const maxX = Math.max(0, ...this.targetPlayers.map(tp => tp.posicionX || 0));
      this.camera.position.x += (Math.min(maxX, 85) - 4 - this.camera.position.x) * 0.05;
      this.camera.lookAt(this.camera.position.x + 16, 0, 0);
    }

    // ── 2. Reacción en la Alcazaba ──────────────────────────────────────────
    if (this.minigameId === 'reaccion_luces') {
      if (this.focoMeshTorre && this.snapshotActual && this.snapshotActual.luzVerdeActiva) {
        const escala = 1.0 + Math.sin(t * 12) * 0.12;
        this.focoMeshTorre.scale.set(escala, escala, escala);
      }
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        if (p.falsoComienzo) {
          mesh.position.y = Math.abs(Math.sin(t * 8)) * 0.6;
          mesh.rotation.z = Math.sin(t * 10) * 0.2;
        } else if (p.reaccionUltimaRondaMs) {
          mesh.position.y = Math.abs(Math.sin(t * 6)) * 0.4;
          mesh.rotation.z = 0;
        } else {
          mesh.position.y = 0;
          mesh.rotation.z = 0;
        }
      });
    }

    // ── 3. Memory de Monumentos ─────────────────────────────────────────────
    if (this.minigameId === 'memory_monumentos') {
      const objetivoId = this.snapshotActual && this.snapshotActual.monumentoObjetivo && this.snapshotActual.monumentoObjetivo.id;
      this.monumentosPeanas.forEach((peanaGroup, id) => {
        const modelo = peanaGroup.userData.modelo;
        if (!modelo) return;
        if (id === objetivoId) {
          modelo.rotation.y += 0.025;
          modelo.position.y = 1.6 + Math.sin(t * 2.5) * 0.25;
        } else {
          modelo.rotation.y *= 0.9;
          modelo.position.y = 1.3;
        }
      });
    }

    // ── 4. Pulso de Fuerza en la Plaza Alta ──────────────────────────────────
    if (this.minigameId === 'pulso_fuerza') {
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        const barra = mesh.userData.barraFuerza;
        if (barra) {
          const escala = Math.max(0.05, Math.min(1.0, (p.fuerzaActual || 10) / 100));
          barra.scale.x += (escala - barra.scale.x) * 0.3;
          if (escala > 0.7) {
            barra.material.color.setHex(0xf39c12);
            barra.material.emissive.setHex(0xc07000);
            mesh.position.y = Math.sin(t * 30) * 0.08;
          } else {
            barra.material.color.setHex(0xe74c3c);
            barra.material.emissive.setHex(0xc0392b);
            mesh.position.y = 0;
          }
        }
      });
    }

    // ── 5. Caramelos del Carnaval ───────────────────────────────────────────
    if (this.minigameId === 'carnaval_caramelos') {
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        mesh.position.x += (p.posicionX - mesh.position.x) * 0.3;
        if (p.tiempoStunMs > 0) {
          mesh.rotation.z = Math.sin(t * 18) * 0.25;
        } else {
          mesh.rotation.z *= 0.82;
        }
      });
      this.actualizarObjetosEnEscena(this.targetObjects);
    }

    // ── 6. Esquivar Obstáculos en la Muralla ─────────────────────────────────
    if (this.minigameId === 'esquivar_muralla') {
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        mesh.position.x += (p.posicionX - mesh.position.x) * 0.35;
        mesh.position.y += (p.alturaY - mesh.position.y) * 0.45;
        if (p.inmune) {
          mesh.visible = Math.floor(now / 80) % 2 === 0;
        } else {
          mesh.visible = true;
        }
      });
      this.actualizarObstaculosMuralla(this.targetObjects);
    }

    // ── 7. Carrera de Coches por el Puente Real ──────────────────────────────
    if (this.minigameId === 'carrera_coches') {
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        mesh.position.x += (p.posicionX - mesh.position.x) * 0.3;
        if (p.trompo) {
          mesh.rotation.y += 0.3;
        } else {
          mesh.rotation.y = 0;
        }
      });
    }

    // ── 8. Equilibrio sobre el Puente de Palmas ──────────────────────────────
    if (this.minigameId === 'equilibrio_puente') {
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        const cuerpo = mesh.userData.cuerpoGroup;
        if (cuerpo) {
          if (p.enAgua) {
            cuerpo.position.y = -3.2;
            cuerpo.rotation.z = Math.PI / 2;
          } else {
            cuerpo.position.y = 0;
            const targetRot = ((p.angulo || 0) * Math.PI) / 180;
            cuerpo.rotation.z += (targetRot - cuerpo.rotation.z) * 0.35;
          }
        }
      });
    }

    // ── Bonus: Lluvia de Bellotas ───────────────────────────────────────────
    if (this.minigameId === 'lluvia_bellotas') {
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        mesh.position.x += (p.posicionX - mesh.position.x) * 0.3;
        if (p.tiempoStunMs > 0) {
          mesh.rotation.z = Math.sin(t * 18) * 0.25;
        } else {
          mesh.rotation.z *= 0.82;
        }
      });
      this.actualizarObjetosEnEscena(this.targetObjects);
    }

    // Render con EffectComposer (bloom) o renderer directamente
    if (this.composer) {
      this.composer.render();
    } else if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GESTIÓN DE OBSTÁCULOS Y ENTIDADES DINÁMICAS
  // ══════════════════════════════════════════════════════════════════════════

  actualizarObjetosEnEscena(objetos) {
    const idsActivos = new Set(objetos.map(o => o.id));
    for (const [id, mesh] of this.objectMeshes.entries()) {
      if (!idsActivos.has(id)) {
        this.scene.remove(mesh);
        disposeArbol(mesh);
        this.objectMeshes.delete(id);
      }
    }
    objetos.forEach(obj => {
      let mesh = this.objectMeshes.get(obj.id);
      if (!mesh) {
        mesh = this.crearMeshObjeto(obj.tipo);
        this.scene.add(mesh);
        this.objectMeshes.set(obj.id, mesh);
      }
      mesh.position.x = obj.x;
      mesh.position.y += (obj.y - mesh.position.y) * 0.4;
      mesh.rotation.x += 0.05;
      mesh.rotation.y += 0.08;
    });
  }

  actualizarObstaculosMuralla(obstaculos) {
    const idsActivos = new Set(obstaculos.map(o => o.id));
    for (const [id, mesh] of this.objectMeshes.entries()) {
      if (!idsActivos.has(id)) {
        this.scene.remove(mesh);
        disposeArbol(mesh);
        this.objectMeshes.delete(id);
      }
    }
    obstaculos.forEach(obs => {
      let mesh = this.objectMeshes.get(obs.id);
      if (!mesh) {
        mesh = this.crearMeshObstaculo(obs.tipo);
        this.scene.add(mesh);
        this.objectMeshes.set(obs.id, mesh);
      }
      mesh.position.x = obs.x;
      mesh.position.z += (obs.z - mesh.position.z) * 0.4;
    });
  }

  crearMeshObstaculo(tipo) {
    if (tipo === 'valla_baja') {
      const geo = new THREE.BoxGeometry(2.1, 0.7, 0.4);
      const mat = new THREE.MeshStandardMaterial({ color: 0xee6655, roughness: 0.65 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.35; mesh.castShadow = true;
      return mesh;
    } else {
      const geo = new THREE.BoxGeometry(2.2, 2.2, 0.8);
      const mat = new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 1.1; mesh.castShadow = true;
      return mesh;
    }
  }

  crearMeshObjeto(tipo) {
    if (tipo === 'dorado' || tipo === 'dorada') {
      const geo = new THREE.DodecahedronGeometry(0.55, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xf5b041, emissive: 0xf39c12, emissiveIntensity: 1.0,
        metalness: 0.8, roughness: 0.18,
      });
      return new THREE.Mesh(geo, mat);
    } else if (tipo === 'mascara') {
      const geo = new THREE.TorusGeometry(0.5, 0.15, 8, 16, Math.PI);
      const mat = new THREE.MeshStandardMaterial({ color: 0x9b59b6, emissive: 0x8e44ad, emissiveIntensity: 0.6, roughness: 0.28 });
      return new THREE.Mesh(geo, mat);
    } else if (tipo === 'cubo_agua' || tipo === 'piedra') {
      const geo = new THREE.OctahedronGeometry(0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x3498db, emissive: 0x0a4488, emissiveIntensity: 0.3, roughness: 0.75 });
      return new THREE.Mesh(geo, mat);
    } else {
      const geo = new THREE.SphereGeometry(0.45, 10, 8);
      const mat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0xcc2200, emissiveIntensity: 0.4, roughness: 0.45 });
      return new THREE.Mesh(geo, mat);
    }
  }

  adjuntarAvatarSprite(group, avatarId, posY) {
    posY = posY || 2.0;
    const avatarInfo = this.avatares.find(a => a.id === avatarId);
    if (avatarInfo && (avatarInfo.recortado || avatarInfo.seleccion)) {
      const src = avatarInfo.recortado || avatarInfo.seleccion;
      new THREE.TextureLoader().load(src, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(0, posY, 0);
        sprite.scale.set(2.3, 2.3, 1);
        group.add(sprite);
      });
    }
  }

  crearEtiquetaNombre(nombre, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(8, 12, 28, 0.82)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(8, 8, 496, 80, 18) : ctx.fillRect(8, 8, 496, 80);
    ctx.fill();

    ctx.strokeStyle = color || '#ffffff';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Sombra del texto
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    ctx.font = 'bold 38px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nombre, 256, 48);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4.0, 1.0, 1);
    return sprite;
  }

  crearEtiquetaFeedback(texto, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.5, 0.88, 1);
    sprite.userData = { canvas, texture };
    if (texto) this.actualizarSpriteTexto(sprite, texto, colorHex);
    return sprite;
  }

  actualizarSpriteTexto(sprite, texto, colorHex) {
    if (!sprite || !sprite.userData || !sprite.userData.canvas) return;
    const canvas = sprite.userData.canvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(12, 18, 38, 0.88)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 14) : ctx.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.fill();

    ctx.strokeStyle = colorHex || '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.font = 'bold 34px Inter, sans-serif';
    ctx.fillStyle = colorHex || '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(texto, canvas.width / 2, canvas.height / 2);

    sprite.userData.texture.needsUpdate = true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIMPIEZA COMPLETA DE RECURSOS
  // ══════════════════════════════════════════════════════════════════════════

  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    window.removeEventListener('resize', this.onResizeBound);

    this.limpiarEscena();

    if (this.composer) {
      this.composer.dispose && this.composer.dispose();
      this.composer = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
  }
}
