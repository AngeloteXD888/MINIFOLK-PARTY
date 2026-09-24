/**
 * public/board.js — Escena 3D del Tablero "Badajoz Party" (Three.js r167)
 *
 * RESPONSABILIDADES:
 * - Renderizar el entorno 3D de Badajoz: río Guadiana, Puerta de Palmas, Alcazaba, Puente Real y Plaza Alta.
 * - Renderizar el circuito de casillas 3D (grafo con conexiones y bifurcaciones).
 * - Renderizar los peones de los jugadores con sprites billboard y peanas del color del jugador.
 * - Animar el Dado 3D con rotación física y detención en la cara correspondiente.
 * - Animar los saltos parabólicos de los peones casilla a casilla.
 * - Cámara dinámica que sigue la acción del jugador activo.
 */

import * as THREE from 'three';

// ─── COLORES Y ESTILOS DE CASILLAS ───────────────────────────────────────────
const COLORES_CASILLAS = {
  inicio:       { base: 0xf1c40f, glow: 0xffeaa7, emissive: 0xd4ac0d },
  azul:         { base: 0x3498db, glow: 0x74b9ff, emissive: 0x2980b9 },
  roja:         { base: 0xe74c3c, glow: 0xff7675, emissive: 0xc0392b },
  evento:       { base: 0x2ecc71, glow: 0x55efc4, emissive: 0x27ae60 },
  minijuego:    { base: 0x9b59b6, glow: 0xa29bfe, emissive: 0x8e44ad },
  bifurcacion:  { base: 0xe67e22, glow: 0xf39c12, emissive: 0xd35400 },
};

export class BadajozBoard3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.animId = null;
    this.disposed = false;

    // Componentes Three.js
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Objetos en escena
    this.tilesMeshes = new Map(); // id -> Mesh
    this.playerMeshes = new Map(); // playerId -> Object3D
    this.diceMesh = null;
    this.waterMesh = null;
    this.decorations = [];

    // Estado de animación
    this.clock = new THREE.Clock();
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.currentCameraPos = new THREE.Vector3(0, 32, 38);
    this.activePlayerId = null;

    // Callbacks
    this.onAnimationFinished = null;
  }

  /**
   * Inicializa la escena, cámara, renderizador e iluminación.
   */
  init(grafoCasillas, jugadores = []) {
    // 1. Escena
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1128);
    this.scene.fog = new THREE.FogExp2(0x0a1128, 0.015);

    // 2. Cámara
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 300);
    this.camera.position.set(0, 34, 40);
    this.camera.lookAt(0, 0, 0);

    // 3. Renderizador
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 4. Luces
    this.setupLighting();

    // 5. Entorno (Suelo, Río Guadiana y Monumentos)
    this.setupEnvironment();

    // 6. Circuito de casillas
    this.buildBoard(grafoCasillas);

    // 7. Dado 3D
    this.buildDice();

    // 8. Jugadores iniciales
    if (jugadores.length > 0) {
      this.updatePlayers(jugadores);
    }

    // 9. Resize listener
    this.onResize = () => {
      if (this.disposed) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.onResize);

    // 10. Bucle de render
    this.animate();
  }

  /**
   * Configuración de la iluminación del atardecer pacense.
   */
  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.8);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffaa55, 1.4);
    dirLight.position.set(25, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -35;
    dirLight.shadow.camera.right = 35;
    dirLight.shadow.camera.top = 35;
    dirLight.shadow.camera.bottom = -35;
    this.scene.add(dirLight);

    // Luz fría de relleno (reflejo del cielo y río)
    const hemiLight = new THREE.HemisphereLight(0x74b9ff, 0x1e3799, 0.6);
    this.scene.add(hemiLight);
  }

  /**
   * Terreno, Río Guadiana y siluetas monumentales.
   */
  setupEnvironment() {
    // ── Suelo Verde / Tierra de Badajoz
    const groundGeo = new THREE.PlaneGeometry(120, 100, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1b4332,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // ── Río Guadiana (Cruza horizontalmente el centro)
    const riverGeo = new THREE.PlaneGeometry(120, 14, 64, 16);
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x0984e3,
      roughness: 0.2,
      metalness: 0.7,
      transparent: true,
      opacity: 0.88,
    });
    this.waterMesh = new THREE.Mesh(riverGeo, riverMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set(0, -0.35, 0);
    this.scene.add(this.waterMesh);

    // ── Orillas del río
    const orillaMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, roughness: 0.8 });
    const orillaSur = new THREE.Mesh(new THREE.BoxGeometry(120, 0.4, 0.8), orillaMat);
    orillaSur.position.set(0, -0.2, 7.4);
    this.scene.add(orillaSur);

    const orillaNorte = new THREE.Mesh(new THREE.BoxGeometry(120, 0.4, 0.8), orillaMat);
    orillaNorte.position.set(0, -0.2, -7.4);
    this.scene.add(orillaNorte);

    // ── Monumentos estilizados
    this.buildAlcazaba(-25, 2, 0);
    this.buildPuenteReal(17.5, 0.5, 0);
    this.buildPuertaPalmas(-16, 0.5, -15);
    this.buildPlazaAlta(-15, 0.5, 15);
  }

  /**
   * La Alcazaba de Badajoz y Torre de Espantaperros
   */
  buildAlcazaba(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xb7791f, roughness: 0.9 });

    // Muralla base
    const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 4), wallMat);
    wall.position.set(0, 2.5, 0);
    wall.castShadow = true;
    group.add(wall);

    // Torre octogonal de Espantaperros
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xd69e2e, roughness: 0.8 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 9, 8), towerMat);
    tower.position.set(-4, 4.5, 0);
    tower.castShadow = true;
    group.add(tower);

    // Almenas
    const almena = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wallMat);
    almena.position.set(-4, 9.5, 0);
    group.add(almena);

    this.scene.add(group);
  }

  /**
   * El Puente Real con sus icónicos tirantes
   */
  buildPuenteReal(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    // Calzada del puente
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.4 });
    const road = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 16), bridgeMat);
    road.position.set(0, 0, 0);
    road.castShadow = true;
    road.receiveShadow = true;
    group.add(road);

    // Pilono central blanco
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const pylon = new THREE.Mesh(new THREE.ConeGeometry(0.8, 12, 4), pylonMat);
    pylon.position.set(0, 6, 0);
    group.add(pylon);

    // Tirantes iluminados (cables)
    const cableMat = new THREE.LineBasicMaterial({ color: 0x74b9ff, linewidth: 2 });
    for (let i = -6; i <= 6; i += 3) {
      if (i === 0) continue;
      const points = [
        new THREE.Vector3(0, 10, 0),
        new THREE.Vector3(0, 0.4, i)
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geom, cableMat);
      group.add(line);
    }

    this.scene.add(group);
  }

  /**
   * La Puerta de Palmas con sus dos torreones cilíndricos
   */
  buildPuertaPalmas(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });

    // Arco central
    const arch = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 1.5), stoneMat);
    arch.position.set(0, 2, 0);
    group.add(arch);

    // Torres gemelas
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 6, 16), stoneMat);
    t1.position.set(-2.8, 3, 0);
    group.add(t1);

    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 6, 16), stoneMat);
    t2.position.set(2.8, 3, 0);
    group.add(t2);

    this.scene.add(group);
  }

  /**
   * La Plaza Alta con arcadas y motivos geométricos
   */
  buildPlazaAlta(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const facadeMat = new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.8 });
    const arcade = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 2), facadeMat);
    arcade.position.set(0, 2.25, 0);
    group.add(arcade);

    this.scene.add(group);
  }

  /**
   * Construye las casillas 3D conectadas según el grafo recibido del servidor.
   */
  buildBoard(grafoCasillas) {
    grafoCasillas.forEach(c => {
      const estilo = COLORES_CASILLAS[c.tipo] || COLORES_CASILLAS.azul;

      // Geometría de casilla hexagonal biselada
      const tileGeo = new THREE.CylinderGeometry(1.8, 2.0, 0.5, 6);
      const tileMat = new THREE.MeshStandardMaterial({
        color: estilo.base,
        emissive: estilo.emissive,
        emissiveIntensity: 0.25,
        roughness: 0.3,
        metalness: 0.2,
      });

      const tileMesh = new THREE.Mesh(tileGeo, tileMat);
      tileMesh.position.set(c.x, 0.25, c.z);
      tileMesh.receiveShadow = true;
      tileMesh.castShadow = true;

      // Anillo decorativo iluminado superior
      const ringGeo = new THREE.RingGeometry(1.3, 1.6, 6);
      const ringMat = new THREE.MeshBasicMaterial({
        color: estilo.glow,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.26;
      tileMesh.add(ring);

      tileMesh.userData = { casillaId: c.id, tipo: c.tipo, nombre: c.nombre };
      this.scene.add(tileMesh);
      this.tilesMeshes.set(c.id, tileMesh);

      // Dibujar línea conectora hacia la(s) siguiente(s) casilla(s)
      c.siguientes.forEach(sigId => {
        const sigCasilla = grafoCasillas.find(item => item.id === sigId);
        if (sigCasilla) {
          const linePoints = [
            new THREE.Vector3(c.x, 0.1, c.z),
            new THREE.Vector3(sigCasilla.x, 0.1, sigCasilla.z),
          ];
          const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
          const lineMat = new THREE.LineBasicMaterial({
            color: 0xf5f6fa,
            transparent: true,
            opacity: 0.45,
            linewidth: 2,
          });
          const pathLine = new THREE.Line(lineGeo, lineMat);
          this.scene.add(pathLine);
        }
      });
    });
  }

  /**
   * Construye el Dado 3D flotante con textura de puntos procedurales del 1 al 6.
   */
  buildDice() {
    const diceGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);

    // Crear materiales para cada cara (1 a 6) usando un canvas HTML
    const materials = [];
    const faceValues = [1, 6, 2, 5, 3, 4]; // Orden de caras en Three.js (+X, -X, +Y, -Y, +Z, -Z)

    faceValues.forEach(val => {
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = 128;
      faceCanvas.height = 128;
      const ctx = faceCanvas.getContext('2d');

      // Fondo blanco marfil
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 128);

      // Borde redondeado suave
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#dcdde1';
      ctx.strokeRect(4, 4, 120, 120);

      // Dibujar puntos
      ctx.fillStyle = val === 1 ? '#e74c3c' : '#2c3e50';
      const drawPip = (x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fill();
      };

      if (val % 2 === 1) drawPip(64, 64); // Centro
      if (val > 1) { drawPip(32, 32); drawPip(96, 96); } // Esquinas sup-izq e inf-der
      if (val > 3) { drawPip(96, 32); drawPip(32, 96); } // Esquinas sup-der e inf-izq
      if (val === 6) { drawPip(32, 64); drawPip(96, 64); } // Laterales medios

      const texture = new THREE.CanvasTexture(faceCanvas);
      materials.push(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.3 }));
    });

    this.diceMesh = new THREE.Mesh(diceGeo, materials);
    this.diceMesh.position.set(0, 7, 0);
    this.diceMesh.castShadow = true;
    this.diceMesh.visible = false;
    this.scene.add(this.diceMesh);
  }

  /**
   * Sincroniza la lista de jugadores y crea/actualiza sus peones en el tablero.
   */
  updatePlayers(jugadores) {
    jugadores.forEach(j => {
      let pObj = this.playerMeshes.get(j.playerId);

      if (!pObj) {
        pObj = this.createPlayerToken(j);
        this.playerMeshes.set(j.playerId, pObj);
        this.scene.add(pObj);
      }

      // Colocar peón en su casilla correspondiente
      const tile = this.tilesMeshes.get(j.casillaActualId);
      if (tile && !pObj.userData.isAnimating) {
        // Desplazamiento leve para no superponer peones en la misma casilla
        const offset = this.getPlayerTileOffset(j.color);
        pObj.position.set(tile.position.x + offset.x, 0.5, tile.position.z + offset.z);
      }
    });
  }

  /**
   * Crea un peón 3D tipo Billboard con la imagen recortada del avatar y peana del color del jugador.
   */
  createPlayerToken(jugador) {
    const group = new THREE.Group();
    group.userData = { playerId: jugador.playerId, isAnimating: false };

    // Peana circular cilíndrica con color del jugador
    const colorHex = jugador.color ? parseInt(jugador.color.replace('#', '0x')) : 0xe63946;
    const baseGeo = new THREE.CylinderGeometry(0.9, 1.1, 0.4, 24);
    const baseMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: colorHex,
      emissiveIntensity: 0.4,
      roughness: 0.3,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.2;
    base.castShadow = true;
    group.add(base);

    // Sprite Billboard con el avatar del jugador
    const textureLoader = new THREE.TextureLoader();
    const avatarUrl = `/avatars/${jugador.avatarId}_tablero.png`;

    textureLoader.load(
      avatarUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(3.2, 3.2, 1);
        sprite.position.y = 2.0;
        group.add(sprite);
      },
      undefined,
      () => {
        // Fallback geométrico si la textura tarda
        const fallbackGeo = new THREE.ConeGeometry(0.7, 2, 8);
        const fallbackMat = new THREE.MeshStandardMaterial({ color: colorHex });
        const fallback = new THREE.Mesh(fallbackGeo, fallbackMat);
        fallback.position.y = 1.4;
        group.add(fallback);
      }
    );

    // Luz de punto tenue para resaltar el peón
    const pointLight = new THREE.PointLight(colorHex, 0.8, 6);
    pointLight.position.y = 1.5;
    group.add(pointLight);

    return group;
  }

  /**
   * Desplazamiento sutil para acomodar hasta 4 peones en la misma casilla sin taparse.
   */
  getPlayerTileOffset(colorHex) {
    switch (colorHex) {
      case '#E63946': return { x: -0.5, z: -0.5 };
      case '#457BB5': return { x:  0.5, z: -0.5 };
      case '#2DC653': return { x: -0.5, z:  0.5 };
      case '#F4D03F': return { x:  0.5, z:  0.5 };
      default:        return { x: 0, z: 0 };
    }
  }

  /**
   * Anima el lanzamiento del dado 3D.
   * @param {number} valor Resultado del dado (1 a 6)
   * @param {number} duracionMs Duración de la animación
   * @param {Function} onComplete Callback al detenerse
   */
  rollDice(valor, duracionMs = 2200, onComplete) {
    if (!this.diceMesh) return;

    this.diceMesh.visible = true;
    this.diceMesh.position.set(this.cameraTarget.x, 10, this.cameraTarget.z);

    const startTime = performance.now();

    // Rotaciones objetivo para que la cara correspondiente quede hacia arriba (+Y)
    // Orden de caras: +X:1, -X:6, +Y:2, -Y:5, +Z:3, -Z:4
    const rotacionesCara = {
      1: { x: 0,           z: Math.PI / 2 },
      2: { x: 0,           z: 0 },
      3: { x: -Math.PI / 2,z: 0 },
      4: { x: Math.PI / 2, z: 0 },
      5: { x: Math.PI,     z: 0 },
      6: { x: 0,           z: -Math.PI / 2 },
    };

    const objetivo = rotacionesCara[valor] || { x: 0, z: 0 };
    const girosCompletos = 4 * Math.PI * 2; // giros rápidos antes de frenar

    const animateDice = () => {
      const now = performance.now();
      const progress = Math.min((now - startTime) / duracionMs, 1);

      // Easing elástico de caída
      const easeOut = 1 - Math.pow(1 - progress, 3);
      this.diceMesh.position.y = 10 - easeOut * 4.5; // cae de y=10 a y=5.5

      // Rotación
      const angle = (1 - easeOut) * girosCompletos;
      this.diceMesh.rotation.x = objetivo.x + angle * 1.3;
      this.diceMesh.rotation.y = angle * 0.9;
      this.diceMesh.rotation.z = objetivo.z + angle * 1.1;

      if (progress < 1) {
        requestAnimationFrame(animateDice);
      } else {
        // Fijar exactamente la orientación de la cara ganadora
        this.diceMesh.rotation.set(objetivo.x, 0, objetivo.z);

        setTimeout(() => {
          this.diceMesh.visible = false;
          if (typeof onComplete === 'function') onComplete();
        }, 800);
      }
    };

    animateDice();
  }

  /**
   * Anima un salto suave (hop) del peón hacia la siguiente casilla.
   */
  animateHop(playerId, targetCasillaId, onComplete) {
    const pObj = this.playerMeshes.get(playerId);
    const targetTile = this.tilesMeshes.get(targetCasillaId);

    if (!pObj || !targetTile) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    pObj.userData.isAnimating = true;
    const startPos = pObj.position.clone();
    const endPos = new THREE.Vector3(targetTile.position.x, 0.5, targetTile.position.z);

    const duracionMs = 450;
    const startTime = performance.now();
    const jumpHeight = 2.2;

    const hopLoop = () => {
      const now = performance.now();
      const progress = Math.min((now - startTime) / duracionMs, 1);

      // Interpolación lineal X, Z
      pObj.position.x = THREE.MathUtils.lerp(startPos.x, endPos.x, progress);
      pObj.position.z = THREE.MathUtils.lerp(startPos.z, endPos.z, progress);

      // Parábola de salto Y
      pObj.position.y = 0.5 + Math.sin(progress * Math.PI) * jumpHeight;

      // Actualizar cámara hacia el peón
      this.cameraTarget.lerp(pObj.position, 0.08);

      if (progress < 1) {
        requestAnimationFrame(hopLoop);
      } else {
        pObj.position.copy(endPos);
        pObj.userData.isAnimating = false;
        if (typeof onComplete === 'function') onComplete();
      }
    };

    hopLoop();
  }

  /**
   * Enfoca la cámara dinámicamente en el jugador activo.
   */
  focusPlayer(playerId) {
    this.activePlayerId = playerId;
    const pObj = this.playerMeshes.get(playerId);
    if (pObj) {
      this.cameraTarget.set(pObj.position.x, 1, pObj.position.z);
    }
  }

  /**
   * Bucle continuo de renderizado y animación.
   */
  animate() {
    if (this.disposed) return;
    this.animId = requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    const elapsedTime = this.clock.getElapsedTime();

    // Ondulación suave del río Guadiana
    if (this.waterMesh) {
      this.waterMesh.material.opacity = 0.85 + Math.sin(elapsedTime * 2) * 0.05;
    }

    // Suavizado de la cámara hacia el objetivo
    this.camera.lookAt(this.cameraTarget);

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Limpia recursos al desmontar la vista.
   */
  destroy() {
    this.disposed = true;
    if (this.animId) cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.onResize);

    if (this.renderer) {
      this.renderer.dispose();
    }
    this.tilesMeshes.clear();
    this.playerMeshes.clear();
  }

  // ─── Aliases de API pública (usados desde app.js) ─────────────────────

  /**
   * Alias de rollDice — compatibilidad con app.js
   * @param {number} valor - Resultado del dado (1-6)
   */
  animateDice(valor) {
    this.rollDice(valor);
  }

  /**
   * Alias de animateHop — compatibilidad con app.js
   * @param {string} playerId
   * @param {{ id: number }} casillaActual
   */
  animatePlayerStep(playerId, casillaActual) {
    if (casillaActual?.id !== undefined) {
      this.animateHop(playerId, casillaActual.id);
    }
  }

  /**
   * Alias de destroy — compatibilidad con app.js
   */
  dispose() {
    this.destroy();
  }
}
