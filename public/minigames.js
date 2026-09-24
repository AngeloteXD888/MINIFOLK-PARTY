/**
 * public/minigames.js — Renderizado 3D de los Minijuegos en tiempo real (Fases 4 y 5)
 *
 * ARQUITECTURA VISUAL (Three.js sin bundlers / Módulos ES):
 * - Estética low-poly moderna, colorida y optimizada para portátiles modestos.
 * - Todos los modelos (piraguas, monumentos, torres, coches, pretiles) son procedurales.
 * - Interpolación suave lerp a 60 FPS a partir de snapshots del servidor recibidos a 20 Hz.
 *
 * CATÁLOGO COMPLETO DE LOS 8 MINIJUEGOS:
 * 1. 'carrera_guadiana' / 'piraguismo_guadiana': Piragüismo en el Guadiana
 * 2. 'esquivar_muralla': Carrera y salto en la Muralla de la Alcazaba
 * 3. 'carnaval_caramelos': Lluvia de caramelos del Carnaval de Badajoz (Giroscopio / Botones)
 * 4. 'carrera_coches': Carrera de coches por el Puente Real (Giroscopio / Volante)
 * 5. 'pulso_fuerza': Pulso de fuerza en la Plaza Alta
 * 6. 'memory_monumentos': Memory visual de monumentos pacenses
 * 7. 'equilibrio_puente': Equilibrio sobre el pretil del Puente de Palmas (Giroscopio / Botones)
 * 8. 'reaccion_luces': Reacción rápida a la luz en la Torre de Espantaperros
 * Bonus: 'lluvia_bellotas': Lluvia de Bellotas en la Dehesa
 */

import * as THREE from 'three';

export class BadajozMinigames3D {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
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

    // Referencias específicas de animación
    this.focoLuzTorre = null;
    this.focoMeshTorre = null;
    this.monumentosPeanas = new Map();
    this.aguaMesh = null;
    this.vientoMesh = null;
    this.calzadaCoches = null;

    this.initRenderer();
  }

  initRenderer() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1128);
    this.scene.fog = new THREE.FogExp2(0x0a1128, 0.015);

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

    // Luces estándar del entorno
    const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.7);
    this.scene.add(ambientLight);
    this.decorations.push(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffecd2, 1.2);
    sunLight.position.set(25, 40, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    this.scene.add(sunLight);
    this.decorations.push(sunLight);

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
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURACIÓN DE ESCENAS SEGÚN MINIJUEGO
  // ══════════════════════════════════════════════════════════════════════════

  cargarMinijuego(minigameId, jugadores, avataresCatalogo = []) {
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
  }

  limpiarEscena() {
    this.playerMeshes.forEach(mesh => this.scene.remove(mesh));
    this.playerMeshes.clear();
    this.objectMeshes.forEach(mesh => this.scene.remove(mesh));
    this.objectMeshes.clear();
    this.decorations.forEach(d => this.scene.remove(d));
    this.decorations = [];
    this.monumentosPeanas.clear();
    this.focoLuzTorre = null;
    this.focoMeshTorre = null;
    this.aguaMesh = null;
    this.vientoMesh = null;
    this.calzadaCoches = null;
  }

  // ─── 1. ESCENA: Piragüismo en el Guadiana ────────────────────────────────────
  setupCarreraGuadiana(jugadores) {
    this.scene.background = new THREE.Color(0x081a2e);
    this.scene.fog = new THREE.FogExp2(0x081a2e, 0.012);

    this.camera.position.set(-8, 14, 26);
    this.camera.lookAt(15, 0, 0);

    // Río Guadiana
    const aguaGeo = new THREE.PlaneGeometry(160, 45, 32, 16);
    const aguaMat = new THREE.MeshStandardMaterial({
      color: 0x1a5276,
      roughness: 0.15,
      metalness: 0.7,
      transparent: true,
      opacity: 0.88,
    });
    const agua = new THREE.Mesh(aguaGeo, aguaMat);
    agua.rotation.x = -Math.PI / 2;
    agua.position.set(45, 0, 0);
    this.scene.add(agua);
    this.decorations.push(agua);
    this.aguaMesh = agua;

    // Orillas de ribera
    const orillaSurGeo = new THREE.BoxGeometry(160, 2, 8);
    const orillaMat = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.8 });
    const orillaSur = new THREE.Mesh(orillaSurGeo, orillaMat);
    orillaSur.position.set(45, 0.5, 24);
    this.scene.add(orillaSur);
    this.decorations.push(orillaSur);

    const orillaNorte = new THREE.Mesh(orillaSurGeo, orillaMat);
    orillaNorte.position.set(45, 0.5, -24);
    this.scene.add(orillaNorte);
    this.decorations.push(orillaNorte);

    // Puente de Palmas al fondo
    const puenteGroup = new THREE.Group();
    const piedraMat = new THREE.MeshStandardMaterial({ color: 0xd5c4a1, roughness: 0.7 });
    for (let i = -3; i <= 3; i++) {
      const pilar = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 5), piedraMat);
      pilar.position.set(i * 12, 6, -30);
      puenteGroup.add(pilar);
    }
    const calzada = new THREE.Mesh(new THREE.BoxGeometry(84, 2, 7), piedraMat);
    calzada.position.set(0, 15, -30);
    puenteGroup.add(calzada);
    this.scene.add(puenteGroup);
    this.decorations.push(puenteGroup);

    // Arco de Meta (100m)
    const metaGroup = new THREE.Group();
    const arcoMetaMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, emissive: 0xb7950b, roughness: 0.3 });
    const arcoPosteIzq = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 12), arcoMetaMat);
    arcoPosteIzq.position.set(100, 6, -18);
    metaGroup.add(arcoPosteIzq);

    const arcoPosteDer = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 12), arcoMetaMat);
    arcoPosteDer.position.set(100, 6, 18);
    metaGroup.add(arcoPosteDer);

    const travesano = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 36), arcoMetaMat);
    travesano.position.set(100, 12, 0);
    metaGroup.add(travesano);

    this.scene.add(metaGroup);
    this.decorations.push(metaGroup);

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
    group.position.set(0, 0.2, posZ);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    const cascoGeo = new THREE.CylinderGeometry(0.7, 0.7, 5.5, 8);
    cascoGeo.rotateZ(Math.PI / 2);
    cascoGeo.scale(1, 0.5, 0.8);
    const cascoMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.3,
      metalness: 0.2,
    });
    const casco = new THREE.Mesh(cascoGeo, cascoMat);
    casco.castShadow = true;
    group.add(casco);

    const asientoMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const asiento = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.8), asientoMat);
    asiento.position.set(0, 0.2, 0);
    group.add(asiento);

    const remoGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.8);
    remoGeo.rotateX(Math.PI / 2);
    const remoMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
    const remo = new THREE.Mesh(remoGeo, remoMat);
    remo.position.set(0, 0.6, 0);
    group.add(remo);
    group.userData.remo = remo;

    this.adjuntarAvatarSprite(group, jugador.avatarId, 1.8);

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.2, 0);
    group.add(label);

    return group;
  }

  // ─── 2. ESCENA: Reacción en la Alcazaba (Minijuego 8) ────────────────────────
  setupReaccionLuces(jugadores) {
    this.scene.background = new THREE.Color(0x060b18);
    this.scene.fog = new THREE.FogExp2(0x060b18, 0.018);

    this.camera.position.set(0, 10, 24);
    this.camera.lookAt(0, 5, 0);

    const sueloGeo = new THREE.PlaneGeometry(38, 26);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x4a433a, roughness: 0.9 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    const murallaGeo = new THREE.BoxGeometry(36, 6, 2.5);
    const murallaMat = new THREE.MeshStandardMaterial({ color: 0xa89f91, roughness: 0.85 });
    const muralla = new THREE.Mesh(murallaGeo, murallaMat);
    muralla.position.set(0, 3, -8);
    this.scene.add(muralla);
    this.decorations.push(muralla);

    const torreGroup = new THREE.Group();
    torreGroup.position.set(0, 0, -8);

    const cuerpoTorreGeo = new THREE.CylinderGeometry(3.2, 3.6, 16, 8);
    const piedraTorreMat = new THREE.MeshStandardMaterial({ color: 0xbdb3a0, roughness: 0.8 });
    const cuerpoTorre = new THREE.Mesh(cuerpoTorreGeo, piedraTorreMat);
    cuerpoTorre.position.y = 8;
    cuerpoTorre.castShadow = true;
    torreGroup.add(cuerpoTorre);

    const coronaTorre = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.3, 1.8, 8),
      piedraTorreMat
    );
    coronaTorre.position.y = 16.5;
    torreGroup.add(coronaTorre);

    const focoGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const focoMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff0000,
      emissiveIntensity: 1.0,
      roughness: 0.2,
    });
    const focoMesh = new THREE.Mesh(focoGeo, focoMat);
    focoMesh.position.set(0, 18.2, 0);
    torreGroup.add(focoMesh);
    this.focoMeshTorre = focoMesh;

    const focoLuz = new THREE.PointLight(0xff2222, 2.5, 35);
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

    const peanaGeo = new THREE.CylinderGeometry(1.0, 1.1, 0.25, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.12;
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
    this.scene.background = new THREE.Color(0x101a2d);
    this.scene.fog = new THREE.FogExp2(0x101a2d, 0.015);

    this.camera.position.set(0, 14, 25);
    this.camera.lookAt(0, 2, 0);

    const sueloGeo = new THREE.PlaneGeometry(36, 26);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x8b3a3a, roughness: 0.7 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    const frisoGeo = new THREE.RingGeometry(6, 12, 32);
    const frisoMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.5, side: THREE.DoubleSide });
    const friso = new THREE.Mesh(frisoGeo, frisoMat);
    friso.rotation.x = -Math.PI / 2;
    friso.position.y = 0.01;
    this.scene.add(friso);
    this.decorations.push(friso);

    const configMonumentos = [
      { id: 'alcazaba',      x: -9.5, z: -4, label: 'La Alcazaba' },
      { id: 'plaza_alta',    x: -3.2, z: -6, label: 'La Plaza Alta' },
      { id: 'puente_real',   x: 3.2,  z: -6, label: 'El Puente Real' },
      { id: 'puerta_palmas', x: 9.5,  z: -4, label: 'Puerta de Palmas' },
    ];

    configMonumentos.forEach(cfg => {
      const peanaGroup = new THREE.Group();
      peanaGroup.position.set(cfg.x, 0, cfg.z);

      const peanaMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.3 });
      const peanaMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 1.2, 24), peanaMat);
      peanaMesh.position.y = 0.6;
      peanaGroup.add(peanaMesh);

      const modelo = this.crearModeloMonumento(cfg.id);
      modelo.position.y = 1.3;
      peanaGroup.add(modelo);
      peanaGroup.userData.modelo = modelo;
      peanaGroup.userData.id = cfg.id;

      const haloLuz = new THREE.PointLight(0xfff5a0, 0, 8);
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
      const mat = new THREE.MeshStandardMaterial({ color: 0xb5a894, roughness: 0.8 });
      const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 2.4, 8), mat);
      torre.position.y = 1.2;
      group.add(torre);

      const almena = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.9, 0.5, 8), mat);
      almena.position.y = 2.5;
      group.add(almena);

    } else if (id === 'plaza_alta') {
      const paredMat = new THREE.MeshStandardMaterial({ color: 0xa93226, roughness: 0.6 });
      const front = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 0.5), paredMat);
      front.position.y = 1.0;
      group.add(front);

      const arcoMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.5 });
      const arco1 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 8, 16, Math.PI), arcoMat);
      arco1.position.set(-0.6, 0.5, 0.28);
      group.add(arco1);
      const arco2 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 8, 16, Math.PI), arcoMat);
      arco2.position.set(0.6, 0.5, 0.28);
      group.add(arco2);

    } else if (id === 'puente_real') {
      const matAzul = new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.4 });
      const arcoPrincipal = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 8, 24, Math.PI), matAzul);
      arcoPrincipal.position.set(0, 0.6, 0);
      group.add(arcoPrincipal);

      const calzada = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x7f8c8d }));
      calzada.position.y = 0.6;
      group.add(calzada);

    } else if (id === 'puerta_palmas') {
      const piedraMat = new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.7 });
      const torreIzq = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.2, 12), piedraMat);
      torreIzq.position.set(-0.8, 1.1, 0);
      group.add(torreIzq);

      const torreDer = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.2, 12), piedraMat);
      torreDer.position.set(0.8, 1.1, 0);
      group.add(torreDer);

      const arcoCentral = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.4), piedraMat);
      arcoCentral.position.set(0, 1.2, 0);
      group.add(arcoCentral);
    }

    return group;
  }

  crearPeonMemory(jugador, posX) {
    const group = new THREE.Group();
    group.position.set(posX, 0, 4);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    const peanaGeo = new THREE.CylinderGeometry(0.9, 1.0, 0.2, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
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
    this.scene.background = new THREE.Color(0x1a0f0f);
    this.scene.fog = new THREE.FogExp2(0x1a0f0f, 0.015);

    this.camera.position.set(0, 8, 18);
    this.camera.lookAt(0, 3, 0);

    // Suelo de la Plaza Alta
    const sueloGeo = new THREE.PlaneGeometry(32, 22);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x8b3a3a, roughness: 0.75 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    // Mesa de pulso central de madera y piedra
    const mesaGroup = new THREE.Group();
    mesaGroup.position.set(0, 0, 0);

    const mesaBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.4, 2.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x424949, roughness: 0.8 })
    );
    mesaBase.position.y = 1.1;
    mesaGroup.add(mesaBase);

    const tableroMesa = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 0.35, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xa04000, roughness: 0.5 })
    );
    tableroMesa.position.y = 2.3;
    mesaGroup.add(tableroMesa);

    this.scene.add(mesaGroup);
    this.decorations.push(mesaGroup);

    // Peones alrededor de la mesa con barras de fuerza
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

    const peanaGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.2, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.1;
    group.add(peana);

    this.adjuntarAvatarSprite(group, jugador.avatarId, 1.8);

    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.4, 0);
    group.add(label);

    // Barra 3D de fuerza
    const fondoBarra = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    fondoBarra.position.set(0, 4.0, 0);
    group.add(fondoBarra);

    const barraFuerza = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.22, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0xc0392b, roughness: 0.3 })
    );
    barraFuerza.position.set(0, 4.0, 0.02);
    barraFuerza.scale.set(0.1, 1, 1);
    group.add(barraFuerza);
    group.userData.barraFuerza = barraFuerza;

    return group;
  }

  // ─── 5. ESCENA: Caramelos del Carnaval de Badajoz (Minijuego 3) ──────────────
  setupCarnavalCaramelos(jugadores) {
    this.scene.background = new THREE.Color(0x1f112e);
    this.scene.fog = new THREE.FogExp2(0x1f112e, 0.015);

    this.camera.position.set(0, 6, 17);
    this.camera.lookAt(0, 4, 0);

    // Calzada de fiesta
    const sueloGeo = new THREE.PlaneGeometry(36, 24);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x2c1b3d, roughness: 0.8 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    // Guirnaldas y farolillos carnavaleros
    const guirnaldaMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.4 });
    for (let x = -14; x <= 14; x += 4) {
      const farol = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), guirnaldaMat);
      farol.position.set(x, 10, -5);
      this.scene.add(farol);
      this.decorations.push(farol);
    }

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
    this.scene.background = new THREE.Color(0x111e2e);
    this.scene.fog = new THREE.FogExp2(0x111e2e, 0.02);

    this.camera.position.set(0, 7, 14);
    this.camera.lookAt(0, 3, -10);

    // Adarve de la muralla (largo camino hacia el fondo)
    const murallaPasoGeo = new THREE.BoxGeometry(10, 1.5, 80);
    const murallaPasoMat = new THREE.MeshStandardMaterial({ color: 0x8d8271, roughness: 0.85 });
    const camino = new THREE.Mesh(murallaPasoGeo, murallaPasoMat);
    camino.position.set(0, -0.75, -20);
    this.scene.add(camino);
    this.decorations.push(camino);

    // Almenas a la izquierda y derecha
    for (let z = -55; z <= 15; z += 4) {
      const almenaMat = new THREE.MeshStandardMaterial({ color: 0x6e6455, roughness: 0.9 });
      const almenaIzq = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 2.0), almenaMat);
      almenaIzq.position.set(-5.2, 0.9, z);
      this.scene.add(almenaIzq);
      this.decorations.push(almenaIzq);

      const almenaDer = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 2.0), almenaMat);
      almenaDer.position.set(5.2, 0.9, z);
      this.scene.add(almenaDer);
      this.decorations.push(almenaDer);
    }

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

    const peanaGeo = new THREE.CylinderGeometry(0.7, 0.8, 0.2, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
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
    this.scene.background = new THREE.Color(0x0b172a);
    this.scene.fog = new THREE.FogExp2(0x0b172a, 0.015);

    this.camera.position.set(0, 9, 16);
    this.camera.lookAt(0, 1.5, -12);

    // Calzada asfaltada del Puente Real
    const calzadaGeo = new THREE.PlaneGeometry(12, 120);
    const calzadaMat = new THREE.MeshStandardMaterial({ color: 0x222629, roughness: 0.7 });
    const calzada = new THREE.Mesh(calzadaGeo, calzadaMat);
    calzada.rotation.x = -Math.PI / 2;
    calzada.position.set(0, 0, -35);
    this.scene.add(calzada);
    this.decorations.push(calzada);
    this.calzadaCoches = calzada;

    // Gran arco azul del Puente Real con tirantes
    const arcoMat = new THREE.MeshStandardMaterial({ color: 0x2471a3, roughness: 0.3 });
    const granArco = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.6, 8, 32, Math.PI), arcoMat);
    granArco.position.set(0, 0, -35);
    granArco.scale.set(1.1, 1.4, 1);
    this.scene.add(granArco);
    this.decorations.push(granArco);

    // Tirantes blancos
    const tiranteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = -6; i <= 6; i += 2) {
      const tirante = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 11), tiranteMat);
      tirante.position.set(i * 0.7, 5.5, -35);
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

    // Chasis de coche clásico low-poly
    const chasisGeo = new THREE.BoxGeometry(1.6, 0.6, 3.0);
    const chasisMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3, metalness: 0.4 });
    const chasis = new THREE.Mesh(chasisGeo, chasisMat);
    chasis.position.y = 0.4;
    chasis.castShadow = true;
    group.add(chasis);

    // Cabina
    const cabinaGeo = new THREE.BoxGeometry(1.2, 0.5, 1.4);
    const cabinaMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1 });
    const cabina = new THREE.Mesh(cabinaGeo, cabinaMat);
    cabina.position.set(0, 0.85, -0.2);
    group.add(cabina);

    // 4 Ruedas
    const ruedaGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
    ruedaGeo.rotateZ(Math.PI / 2);
    const ruedaMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    [
      [-0.85, 0.35, 0.9],
      [0.85, 0.35, 0.9],
      [-0.85, 0.35, -0.9],
      [0.85, 0.35, -0.9],
    ].forEach(([rx, ry, rz]) => {
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
    this.scene.background = new THREE.Color(0x0c1b2b);
    this.scene.fog = new THREE.FogExp2(0x0c1b2b, 0.015);

    this.camera.position.set(0, 7, 18);
    this.camera.lookAt(0, 3, 0);

    // Río Guadiana debajo
    const aguaGeo = new THREE.PlaneGeometry(80, 50);
    const aguaMat = new THREE.MeshStandardMaterial({
      color: 0x1b4f72,
      roughness: 0.2,
      metalness: 0.6,
      transparent: true,
      opacity: 0.88,
    });
    const agua = new THREE.Mesh(aguaGeo, aguaMat);
    agua.rotation.x = -Math.PI / 2;
    agua.position.set(0, -3.5, 0);
    this.scene.add(agua);
    this.decorations.push(agua);

    // Pretil de piedra del Puente de Palmas (arcos y baranda)
    const pretilGeo = new THREE.BoxGeometry(28, 4, 1.8);
    const pretilMat = new THREE.MeshStandardMaterial({ color: 0x938874, roughness: 0.8 });
    const pretil = new THREE.Mesh(pretilGeo, pretilMat);
    pretil.position.set(0, -1.0, 0);
    this.scene.add(pretil);
    this.decorations.push(pretil);

    // Peones sobre el pretil con pértiga de equilibrista
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

    // Peana pequeña en pies
    const peanaGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.2, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.1;
    cuerpoGroup.add(peana);

    // Pértiga larga de equilibrio horizontal
    const pertigaGeo = new THREE.CylinderGeometry(0.06, 0.06, 5.5);
    pertigaGeo.rotateZ(Math.PI / 2);
    const pertigaMat = new THREE.MeshStandardMaterial({ color: 0xd4ac0d, roughness: 0.4 });
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
    this.scene.background = new THREE.Color(0x1a2e1a);
    this.scene.fog = new THREE.FogExp2(0x1a2e1a, 0.018);

    this.camera.position.set(0, 6, 17);
    this.camera.lookAt(0, 4, 0);

    const sueloGeo = new THREE.PlaneGeometry(36, 24);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    const troncoMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
    const copaMat = new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.8 });

    [-11, -4, 4, 11].forEach((x, i) => {
      const arbol = new THREE.Group();
      const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 7), troncoMat);
      tronco.position.y = 3.5;
      arbol.add(tronco);

      const copa = new THREE.Mesh(new THREE.DodecahedronGeometry(3.5, 1), copaMat);
      copa.position.y = 7.5;
      arbol.add(copa);

      arbol.position.set(x, 0, -6 - (i % 2) * 2);
      this.scene.add(arbol);
      this.decorations.push(arbol);
    });

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

    const peanaGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.1;
    group.add(peana);

    const cestaGeo = new THREE.CylinderGeometry(1.0, 0.7, 0.9, 12, 1, true);
    const cestaMat = new THREE.MeshStandardMaterial({
      color: 0x935116,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
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

    // 1. Minijuego Reacción
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
            this.actualizarSpriteTexto(lbl, `⚡ ${p.reaccionUltimaRondaMs} ms`, '#2ecc71');
            lbl.visible = true;
          } else if (!p.haPulsadoRonda) {
            lbl.visible = false;
          }
        }
      });
    }

    // 2. Minijuego Memory
    if (this.minigameId === 'memory_monumentos') {
      const objetivoId = data.monumentoObjetivo?.id;
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

    // ── 1. Piragüismo ────────────────────────────────────────────────────────
    if (this.minigameId === 'carrera_guadiana' || this.minigameId === 'piraguismo_guadiana') {
      if (this.aguaMesh) {
        this.aguaMesh.material.opacity = 0.85 + Math.sin(now * 0.003) * 0.04;
      }
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        mesh.position.x += (p.posicionX - mesh.position.x) * 0.25;
        if (mesh.userData.remo && p.velocidad > 0) {
          mesh.userData.remo.rotation.z = Math.sin(now * 0.012) * 0.35;
          mesh.rotation.z = Math.sin(now * 0.008) * 0.05;
        }
      });
      const maxX = Math.max(0, ...this.targetPlayers.map(tp => tp.posicionX || 0));
      this.camera.position.x += (Math.min(maxX, 85) - 4 - this.camera.position.x) * 0.05;
      this.camera.lookAt(this.camera.position.x + 16, 0, 0);
    }

    // ── 2. Reacción en la Alcazaba ──────────────────────────────────────────
    if (this.minigameId === 'reaccion_luces') {
      if (this.focoMeshTorre && this.snapshotActual?.luzVerdeActiva) {
        const escala = 1.0 + Math.sin(now * 0.02) * 0.12;
        this.focoMeshTorre.scale.set(escala, escala, escala);
      }
      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;
        if (p.falsoComienzo) {
          mesh.position.y = Math.abs(Math.sin(now * 0.015)) * 0.6;
          mesh.rotation.z = Math.sin(now * 0.02) * 0.2;
        } else if (p.reaccionUltimaRondaMs) {
          mesh.position.y = Math.abs(Math.sin(now * 0.01)) * 0.4;
          mesh.rotation.z = 0;
        } else {
          mesh.position.y = 0;
          mesh.rotation.z = 0;
        }
      });
    }

    // ── 3. Memory de Monumentos ─────────────────────────────────────────────
    if (this.minigameId === 'memory_monumentos') {
      const objetivoId = this.snapshotActual?.monumentoObjetivo?.id;
      this.monumentosPeanas.forEach((peanaGroup, id) => {
        const modelo = peanaGroup.userData.modelo;
        if (!modelo) return;
        if (id === objetivoId) {
          modelo.rotation.y += 0.025;
          modelo.position.y = 1.6 + Math.sin(now * 0.005) * 0.25;
        } else {
          modelo.rotation.y = 0;
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
            // Temblor de esfuerzo en el peón
            mesh.position.y = Math.sin(now * 0.05) * 0.08;
          } else {
            barra.material.color.setHex(0xe74c3c);
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
          mesh.rotation.z = Math.sin(now * 0.03) * 0.25;
        } else {
          mesh.rotation.z *= 0.8;
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
      // Renderizar obstáculos que avanzan hacia adelante
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
            cuerpo.position.y = -3.2; // sumergido
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
          mesh.rotation.z = Math.sin(now * 0.03) * 0.25;
        } else {
          mesh.rotation.z *= 0.8;
        }
      });
      this.actualizarObjetosEnEscena(this.targetObjects);
    }

    if (this.renderer && this.scene && this.camera) {
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
      const mat = new THREE.MeshStandardMaterial({ color: 0xcd6155, roughness: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.35;
      return mesh;
    } else {
      const geo = new THREE.BoxGeometry(2.2, 2.2, 0.8);
      const mat = new THREE.MeshStandardMaterial({ color: 0x78281f, roughness: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 1.1;
      return mesh;
    }
  }

  crearMeshObjeto(tipo) {
    if (tipo === 'dorado' || tipo === 'dorada') {
      const geo = new THREE.DodecahedronGeometry(0.55, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xf5b041,
        emissive: 0xf39c12,
        emissiveIntensity: 0.8,
        metalness: 0.8,
        roughness: 0.2,
      });
      return new THREE.Mesh(geo, mat);
    } else if (tipo === 'mascara') {
      const geo = new THREE.TorusGeometry(0.5, 0.15, 8, 16, Math.PI);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x9b59b6,
        emissive: 0x8e44ad,
        roughness: 0.3,
      });
      return new THREE.Mesh(geo, mat);
    } else if (tipo === 'cubo_agua' || tipo === 'piedra') {
      const geo = new THREE.OctahedronGeometry(0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x3498db, roughness: 0.8 });
      return new THREE.Mesh(geo, mat);
    } else {
      const geo = new THREE.SphereGeometry(0.45, 8, 8);
      const mat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.5 });
      return new THREE.Mesh(geo, mat);
    }
  }

  adjuntarAvatarSprite(group, avatarId, posY = 2.0) {
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
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(10, 15, 30, 0.75)';
    ctx.roundRect ? ctx.roundRect(10, 10, 236, 44, 12) : ctx.fillRect(10, 10, 236, 44);
    ctx.fill();

    ctx.strokeStyle = color || '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = 'bold 22px Outfit, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nombre, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.2, 0.8, 1);
    return sprite;
  }

  crearEtiquetaFeedback(texto, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(2.8, 0.7, 1);
    sprite.userData = { canvas, texture };
    if (texto) {
      this.actualizarSpriteTexto(sprite, texto, colorHex);
    }
    return sprite;
  }

  actualizarSpriteTexto(sprite, texto, colorHex) {
    if (!sprite || !sprite.userData?.canvas) return;
    const canvas = sprite.userData.canvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);

    ctx.fillStyle = 'rgba(15, 20, 35, 0.85)';
    ctx.roundRect ? ctx.roundRect(8, 8, 240, 48, 10) : ctx.fillRect(8, 8, 240, 48);
    ctx.fill();

    ctx.strokeStyle = colorHex || '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.font = 'bold 20px Outfit, sans-serif';
    ctx.fillStyle = colorHex || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 128, 32);

    sprite.userData.texture.needsUpdate = true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIMPIEZA COMPLETA DE RECURSOS (Previene fugas de memoria en portátiles)
  // ══════════════════════════════════════════════════════════════════════════

  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    window.removeEventListener('resize', this.onResizeBound);

    this.limpiarEscena();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
  }
}
