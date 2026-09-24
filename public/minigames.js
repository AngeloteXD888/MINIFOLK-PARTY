/**
 * public/minigames.js — Renderizado 3D de los Minijuegos en tiempo real (Fase 4)
 *
 * ARQUITECTURA VISUAL (Three.js sin bundlers / Módulos ES):
 * - Estética low-poly moderna, colorida y optimizada para portátiles modestos.
 * - Todos los modelos (piraguas, monumentos, torres, encinas, cartas) son procedurales.
 * - Interpolación suave lerp a 60 FPS a partir de snapshots del servidor recibidos a 20 Hz.
 *
 * CATÁLOGO 3D IMPLEMENTADO (MVP):
 * 1. 'carrera_guadiana': Piragüismo en el Guadiana (río, piraguas, estelas, Puente de Palmas).
 * 2. 'reaccion_luces': Reacción en la Alcazaba (Torre de Espantaperros nocturna, foco volumétrico rojo/verde, peones atentos).
 * 3. 'memory_monumentos': Memory de Monumentos (Plaza Alta con suelo geométrico, peanas con mini-monumentos 3D y halo revelador).
 * 4. 'lluvia_bellotas': Lluvia de Bellotas en la Dehesa (encinas, cestas, bellotas doradas y piedras).
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
    this.monumentosPeanas = new Map(); // 'alcazaba' -> THREE.Group, etc.
    this.aguaMesh = null;

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

    // Casco estilizado de la piragua
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

    // Asiento
    const asientoMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const asiento = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.8), asientoMat);
    asiento.position.set(0, 0.2, 0);
    group.add(asiento);

    // Remo doble de madera
    const remoGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.8);
    remoGeo.rotateX(Math.PI / 2);
    const remoMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
    const remo = new THREE.Mesh(remoGeo, remoMat);
    remo.position.set(0, 0.6, 0);
    group.add(remo);
    group.userData.remo = remo;

    // Avatar del jugador
    this.adjuntarAvatarSprite(group, jugador.avatarId, 1.8);

    // Nombre flotante
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

    // Suelo empedrado de la Alcazaba
    const sueloGeo = new THREE.PlaneGeometry(38, 26);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x4a433a, roughness: 0.9 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    // Muralla abaluartada al fondo
    const murallaGeo = new THREE.BoxGeometry(36, 6, 2.5);
    const murallaMat = new THREE.MeshStandardMaterial({ color: 0xa89f91, roughness: 0.85 });
    const muralla = new THREE.Mesh(murallaGeo, murallaMat);
    muralla.position.set(0, 3, -8);
    this.scene.add(muralla);
    this.decorations.push(muralla);

    // Torre de Espantaperros (Octogonal estilizada) en el centro de la muralla
    const torreGroup = new THREE.Group();
    torreGroup.position.set(0, 0, -8);

    // Cuerpo octogonal (Cylinder con 8 segmentos)
    const cuerpoTorreGeo = new THREE.CylinderGeometry(3.2, 3.6, 16, 8);
    const piedraTorreMat = new THREE.MeshStandardMaterial({ color: 0xbdb3a0, roughness: 0.8 });
    const cuerpoTorre = new THREE.Mesh(cuerpoTorreGeo, piedraTorreMat);
    cuerpoTorre.position.y = 8;
    cuerpoTorre.castShadow = true;
    torreGroup.add(cuerpoTorre);

    // Almenas superiores
    const coronaTorre = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.3, 1.8, 8),
      piedraTorreMat
    );
    coronaTorre.position.y = 16.5;
    torreGroup.add(coronaTorre);

    // Foco de la Torre (esfera emisiva roja/verde)
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

    // Luz puntual del foco
    const focoLuz = new THREE.PointLight(0xff2222, 2.5, 35);
    focoLuz.position.set(0, 18.5, 1);
    torreGroup.add(focoLuz);
    this.focoLuzTorre = focoLuz;

    this.scene.add(torreGroup);
    this.decorations.push(torreGroup);

    // Peones de los jugadores en semicírculo esperando la señal
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

    // Peana circular
    const peanaGeo = new THREE.CylinderGeometry(1.0, 1.1, 0.25, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.12;
    group.add(peana);

    // Avatar del jugador
    this.adjuntarAvatarSprite(group, jugador.avatarId, 2.2);

    // Nombre flotante
    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.8, 0);
    group.add(label);

    // Etiqueta de tiempo de reacción
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

    // 1. Suelo ajedrezado con los patrones de la Plaza Alta de Badajoz
    const sueloGeo = new THREE.PlaneGeometry(36, 26);
    const sueloMat = new THREE.MeshStandardMaterial({
      color: 0x8b3a3a, // Rojizo mudéjar de la Plaza Alta
      roughness: 0.7,
    });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    // Friso decorativo blanco en el suelo (patrón geométrico de Badajoz)
    const frisoGeo = new THREE.RingGeometry(6, 12, 32);
    const frisoMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.5, side: THREE.DoubleSide });
    const friso = new THREE.Mesh(frisoGeo, frisoMat);
    friso.rotation.x = -Math.PI / 2;
    friso.position.y = 0.01;
    this.scene.add(friso);
    this.decorations.push(friso);

    // 2. Las 4 Peanas con los mini-monumentos 3D de Badajoz
    // Distribución en semicírculo: Alcazaba (-9), Plaza Alta (-3), Puente Real (+3), Puerta de Palmas (+9)
    const configMonumentos = [
      { id: 'alcazaba',      x: -9.5, z: -4, label: 'La Alcazaba' },
      { id: 'plaza_alta',    x: -3.2, z: -6, label: 'La Plaza Alta' },
      { id: 'puente_real',   x: 3.2,  z: -6, label: 'El Puente Real' },
      { id: 'puerta_palmas', x: 9.5,  z: -4, label: 'Puerta de Palmas' },
    ];

    configMonumentos.forEach(cfg => {
      const peanaGroup = new THREE.Group();
      peanaGroup.position.set(cfg.x, 0, cfg.z);

      // Peana cilíndrica dorada
      const peanaMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.6, roughness: 0.3 });
      const peanaMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 1.2, 24), peanaMat);
      peanaMesh.position.y = 0.6;
      peanaGroup.add(peanaMesh);

      // Modelo 3D del monumento correspondiente
      const modelo = this.crearModeloMonumento(cfg.id);
      modelo.position.y = 1.3;
      peanaGroup.add(modelo);
      peanaGroup.userData.modelo = modelo;
      peanaGroup.userData.id = cfg.id;

      // Halo de luz para destacar cuando sea el objetivo
      const haloLuz = new THREE.PointLight(0xfff5a0, 0, 8);
      haloLuz.position.set(0, 3.5, 0);
      peanaGroup.add(haloLuz);
      peanaGroup.userData.haloLuz = haloLuz;

      // Cartel con nombre del monumento
      const tag = this.crearEtiquetaNombre(cfg.label, '#ffffff');
      tag.position.set(0, 4.2, 0);
      peanaGroup.add(tag);

      this.scene.add(peanaGroup);
      this.decorations.push(peanaGroup);
      this.monumentosPeanas.set(cfg.id, peanaGroup);
    });

    // 3. Peones de los jugadores en la parte frontal
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
      // Alcazaba / Torre octogonal
      const mat = new THREE.MeshStandardMaterial({ color: 0xb5a894, roughness: 0.8 });
      const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 2.4, 8), mat);
      torre.position.y = 1.2;
      group.add(torre);

      const almena = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.9, 0.5, 8), mat);
      almena.position.y = 2.5;
      group.add(almena);

    } else if (id === 'plaza_alta') {
      // Plaza Alta con arcos y soportales
      const paredMat = new THREE.MeshStandardMaterial({ color: 0xa93226, roughness: 0.6 });
      const front = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 0.5), paredMat);
      front.position.y = 1.0;
      group.add(front);

      // Arcadas blancas
      const arcoMat = new THREE.MeshStandardMaterial({ color: 0xfdfefe, roughness: 0.5 });
      const arco1 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 8, 16, Math.PI), arcoMat);
      arco1.position.set(-0.6, 0.5, 0.28);
      group.add(arco1);
      const arco2 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 8, 16, Math.PI), arcoMat);
      arco2.position.set(0.6, 0.5, 0.28);
      group.add(arco2);

    } else if (id === 'puente_real') {
      // Puente Real con tirantes estilizados
      const matAzul = new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.4 });
      const arcoPrincipal = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 8, 24, Math.PI), matAzul);
      arcoPrincipal.position.set(0, 0.6, 0);
      group.add(arcoPrincipal);

      const calzada = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x7f8c8d }));
      calzada.position.y = 0.6;
      group.add(calzada);

    } else if (id === 'puerta_palmas') {
      // Puerta de Palmas (dos torreones y arco monumental)
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

  // ─── 4. ESCENA: Lluvia de Bellotas ───────────────────────────────────────────
  setupLluviaBellotas(jugadores) {
    this.scene.background = new THREE.Color(0x1a2e1a);
    this.scene.fog = new THREE.FogExp2(0x1a2e1a, 0.018);

    this.camera.position.set(0, 6, 17);
    this.camera.lookAt(0, 4, 0);

    // Suelo de dehesa
    const sueloGeo = new THREE.PlaneGeometry(36, 24);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    // Encinas extremeñas
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

    // Peones con cesta
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
    this.targetObjects = data.objetos || [];

    // 1. Minijuego Reacción: Actualizar foco de la torre
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

      // Actualizar feedback en peones
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

    // 2. Minijuego Memory: Iluminar monumento objetivo
    if (this.minigameId === 'memory_monumentos') {
      const objetivoId = data.monumentoObjetivo?.id;
      this.monumentosPeanas.forEach((peanaGroup, id) => {
        const esObjetivo = id === objetivoId;
        const halo = peanaGroup.userData.haloLuz;
        if (halo) {
          halo.intensity = esObjetivo ? 3.5 : 0;
        }
      });

      // Feedback de acierto o fallo en peones
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
        // En ronda activa, ocultar feedback
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

    // ── Animación en Piragüismo ──────────────────────────────────────────────
    if ((this.minigameId === 'carrera_guadiana' || this.minigameId === 'piraguismo_guadiana')) {
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

      // La cámara sigue al líder de carrera
      const maxX = Math.max(0, ...this.targetPlayers.map(tp => tp.posicionX || 0));
      this.camera.position.x += (Math.min(maxX, 85) - 4 - this.camera.position.x) * 0.05;
      this.camera.lookAt(this.camera.position.x + 16, 0, 0);
    }

    // ── Animación en Reacción en la Alcazaba ─────────────────────────────────
    if (this.minigameId === 'reaccion_luces') {
      if (this.focoMeshTorre && this.snapshotActual?.luzVerdeActiva) {
        // Pulso resplandeciente del foco verde
        const escala = 1.0 + Math.sin(now * 0.02) * 0.12;
        this.focoMeshTorre.scale.set(escala, escala, escala);
      }

      this.targetPlayers.forEach(p => {
        const mesh = this.playerMeshes.get(p.playerId);
        if (!mesh) return;

        if (p.falsoComienzo) {
          // Salto de sobresalto
          mesh.position.y = Math.abs(Math.sin(now * 0.015)) * 0.6;
          mesh.rotation.z = Math.sin(now * 0.02) * 0.2;
        } else if (p.reaccionUltimaRondaMs) {
          // Salto alegre de éxito
          mesh.position.y = Math.abs(Math.sin(now * 0.01)) * 0.4;
          mesh.rotation.z = 0;
        } else {
          mesh.position.y = 0;
          mesh.rotation.z = 0;
        }
      });
    }

    // ── Animación en Memory de Monumentos ────────────────────────────────────
    if (this.minigameId === 'memory_monumentos') {
      const objetivoId = this.snapshotActual?.monumentoObjetivo?.id;

      this.monumentosPeanas.forEach((peanaGroup, id) => {
        const modelo = peanaGroup.userData.modelo;
        if (!modelo) return;

        if (id === objetivoId) {
          // El monumento objetivo rota y flota ligeramente
          modelo.rotation.y += 0.025;
          modelo.position.y = 1.6 + Math.sin(now * 0.005) * 0.25;
        } else {
          modelo.rotation.y = 0;
          modelo.position.y = 1.3;
        }
      });
    }

    // ── Animación en Lluvia de Bellotas ──────────────────────────────────────
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

      // Renderizar objetos
      const idsActivos = new Set(this.targetObjects.map(o => o.id));
      for (const [id, mesh] of this.objectMeshes.entries()) {
        if (!idsActivos.has(id)) {
          this.scene.remove(mesh);
          this.objectMeshes.delete(id);
        }
      }

      this.targetObjects.forEach(obj => {
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

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS DE RECURSOS VISUALES
  // ══════════════════════════════════════════════════════════════════════════

  crearMeshObjeto(tipo) {
    if (tipo === 'dorada') {
      const geo = new THREE.DodecahedronGeometry(0.55, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xf5b041,
        emissive: 0xf39c12,
        emissiveIntensity: 0.8,
        metalness: 0.8,
        roughness: 0.2,
      });
      return new THREE.Mesh(geo, mat);
    } else if (tipo === 'piedra') {
      const geo = new THREE.OctahedronGeometry(0.5, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7f8c8d,
        roughness: 0.9,
      });
      return new THREE.Mesh(geo, mat);
    } else {
      const geo = new THREE.SphereGeometry(0.45, 8, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xa0522d,
        roughness: 0.6,
      });
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
