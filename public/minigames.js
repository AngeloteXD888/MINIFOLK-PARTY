/**
 * public/minigames.js — Renderizado 3D de los Minijuegos en tiempo real (Fase 4)
 *
 * RESPONSABILIDADES:
 * - Renderizar en Three.js los minijuegos en la Pantalla Compartida.
 * - Interpolación suave (lerp) a 60 FPS a partir de los snapshots a 20 Hz recibidos del servidor.
 * - Minijuego 1: «Regata en el Guadiana» (río, piraguas, estelas de agua, Puente de Palmas).
 * - Minijuego 2: «Lluvia de Bellotas en la Dehesa» (dehesa extremeña, encinas, cestas, bellotas 3D).
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

    // Entidades del minijuego
    this.playerMeshes = new Map(); // playerId -> THREE.Group
    this.objectMeshes = new Map(); // objId -> THREE.Mesh
    this.decorations = [];

    // Estado interpolado
    this.targetPlayers = [];
    this.targetObjects = [];

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Luces estándar
    const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.65);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffecd2, 1.2);
    sunLight.position.set(25, 40, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    this.scene.add(sunLight);

    window.addEventListener('resize', this.onResize.bind(this));
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
  // CONFIGURACIÓN DE ESCENA SEGÚN MINIJUEGO
  // ══════════════════════════════════════════════════════════════════════════

  cargarMinijuego(minigameId, jugadores, avataresCatalogo = []) {
    this.limpiarEscena();
    this.minigameId = minigameId;
    this.avatares = avataresCatalogo;

    if (minigameId === 'carrera_guadiana') {
      this.setupCarreraGuadiana(jugadores);
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
  }

  // ─── ESCENA 1: Carrera en el Guadiana ───────────────────────────────────────
  setupCarreraGuadiana(jugadores) {
    this.scene.background = new THREE.Color(0x081a2e);
    this.scene.fog = new THREE.FogExp2(0x081a2e, 0.012);

    // Ajustar cámara para vista lateral/isométrica de la regata
    this.camera.position.set(-8, 14, 26);
    this.camera.lookAt(15, 0, 0);

    // 1. Río Guadiana (superficie acuática)
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

    // 2. Orillas y ribera
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

    // 3. Puente de Palmas en el fondo (arcos de piedra)
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

    // 4. Boyas de carril y línea de salida/meta
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

    // 5. Crear piraguas para cada jugador
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

    // Casco de la piragua (forma alargada y puntiaguda)
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
    const avatarInfo = this.avatares.find(a => a.id === jugador.avatarId);
    if (avatarInfo && avatarInfo.recortado) {
      new THREE.TextureLoader().load(avatarInfo.recortado, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(0, 1.8, 0);
        sprite.scale.set(2.2, 2.2, 1);
        group.add(sprite);
      });
    }

    // Nombre flotante
    const label = this.crearEtiquetaNombre(jugador.nombre || 'Jugador', jugador.color || '#fff');
    label.position.set(0, 3.2, 0);
    group.add(label);

    return group;
  }

  // ─── ESCENA 2: Lluvia de Bellotas ──────────────────────────────────────────
  setupLluviaBellotas(jugadores) {
    this.scene.background = new THREE.Color(0x1a2e1a);
    this.scene.fog = new THREE.FogExp2(0x1a2e1a, 0.018);

    this.camera.position.set(0, 6, 17);
    this.camera.lookAt(0, 4, 0);

    // 1. Suelo de dehesa (hierba verde con relieve)
    const sueloGeo = new THREE.PlaneGeometry(36, 24);
    const sueloMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
    const suelo = new THREE.Mesh(sueloGeo, sueloMat);
    suelo.rotation.x = -Math.PI / 2;
    this.scene.add(suelo);
    this.decorations.push(suelo);

    // 2. Encinas extremeñas en el fondo
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

    // 3. Crear personajes con cesta para cada jugador
    const separacionX = 14 / Math.max(1, jugadores.length);
    jugadores.forEach((j, index) => {
      const posInicialX = -7 + (index + 0.5) * separacionX;
      const pj = this.crearPersonajeCesta(j, posInicialX);
      this.scene.add(pj);
      this.playerMeshes.set(j.playerId, pj);
    });
  }

  crearPersonajeCesta(jugador, posX) {
    const group = new THREE.Group();
    group.position.set(posX, 0, 0);

    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;

    // Peana / sombra
    const peanaGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.2, 16);
    const peanaMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 });
    const peana = new THREE.Mesh(peanaGeo, peanaMat);
    peana.position.y = 0.1;
    group.add(peana);

    // Cesta de mimbre / madera dorada
    const cestaGeo = new THREE.CylinderGeometry(1.0, 0.7, 0.9, 12, 1, true);
    const cestaMat = new THREE.MeshStandardMaterial({
      color: 0x935116,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const cesta = new THREE.Mesh(cestaGeo, cestaMat);
    cesta.position.set(0, 0.8, 0.6);
    group.add(cesta);

    // Avatar del jugador
    const avatarInfo = this.avatares.find(a => a.id === jugador.avatarId);
    if (avatarInfo && avatarInfo.recortado) {
      new THREE.TextureLoader().load(avatarInfo.recortado, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.position.set(0, 2.2, 0);
        sprite.scale.set(2.4, 2.4, 1);
        group.add(sprite);
      });
    }

    // Nombre flotante
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
    this.targetPlayers = data.jugadores || [];
    this.targetObjects = data.objetos || [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUCLE DE RENDERIZADO E INTERPOLACIÓN (60 FPS)
  // ══════════════════════════════════════════════════════════════════════════

  animate() {
    this.animId = requestAnimationFrame(this.animate);

    // 1. Ondulación suave del agua en carrera
    if (this.minigameId === 'carrera_guadiana' && this.aguaMesh) {
      this.aguaMesh.material.opacity = 0.85 + Math.sin(Date.now() * 0.003) * 0.04;
    }

    // 2. Interpolación de jugadores
    this.targetPlayers.forEach(p => {
      const mesh = this.playerMeshes.get(p.playerId);
      if (!mesh) return;

      if (this.minigameId === 'carrera_guadiana') {
        // En carrera: avance en X
        mesh.position.x += (p.posicionX - mesh.position.x) * 0.25;

        // Balanceo de remo según velocidad
        if (mesh.userData.remo && p.velocidad > 0) {
          mesh.userData.remo.rotation.z = Math.sin(Date.now() * 0.012) * 0.35;
          mesh.rotation.z = Math.sin(Date.now() * 0.008) * 0.05;
        }

        // Si la cámara sigue a la cabeza de carrera:
        const maxX = Math.max(...this.targetPlayers.map(tp => tp.posicionX || 0));
        this.camera.position.x += (Math.min(maxX, 85) - 4 - this.camera.position.x) * 0.05;
        this.camera.lookAt(this.camera.position.x + 16, 0, 0);

      } else if (this.minigameId === 'lluvia_bellotas') {
        // En bellotas: movimiento lateral en X
        mesh.position.x += (p.posicionX - mesh.position.x) * 0.3;

        // Efecto visual si está aturdido
        if (p.tiempoStunMs > 0) {
          mesh.rotation.z = Math.sin(Date.now() * 0.03) * 0.25;
        } else {
          mesh.rotation.z *= 0.8;
        }
      }
    });

    // 3. Renderizar y actualizar bellotas / objetos
    if (this.minigameId === 'lluvia_bellotas') {
      const idsActivos = new Set(this.targetObjects.map(o => o.id));

      // Eliminar objetos que ya no están
      for (const [id, mesh] of this.objectMeshes.entries()) {
        if (!idsActivos.has(id)) {
          this.scene.remove(mesh);
          this.objectMeshes.delete(id);
        }
      }

      // Actualizar o crear objetos
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

  crearMeshObjeto(tipo) {
    if (tipo === 'dorada') {
      // Bellota dorada reluciente
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
      // Piedra gris
      const geo = new THREE.OctahedronGeometry(0.5, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7f8c8d,
        roughness: 0.9,
      });
      return new THREE.Mesh(geo, mat);
    } else {
      // Bellota normal
      const geo = new THREE.SphereGeometry(0.45, 8, 8);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xa0522d,
        roughness: 0.6,
      });
      return new THREE.Mesh(geo, mat);
    }
  }

  crearEtiquetaNombre(nombre, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(7, 7, 26, 0.82)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.stroke();

    ctx.font = 'bold 26px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nombre, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.6, 0.9, 1);
    return sprite;
  }

  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    window.removeEventListener('resize', this.onResize);
    this.limpiarEscena();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
