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
  inicio: { base: 0xf1c40f, glow: 0xffeaa7, emissive: 0xd4ac0d },
  azul: { base: 0x3498db, glow: 0x74b9ff, emissive: 0x2980b9 },
  roja: { base: 0xe74c3c, glow: 0xff7675, emissive: 0xc0392b },
  evento: { base: 0x2ecc71, glow: 0x55efc4, emissive: 0x27ae60 },
  minijuego: { base: 0x9b59b6, glow: 0xa29bfe, emissive: 0x8e44ad },
  bifurcacion: { base: 0xe67e22, glow: 0xf39c12, emissive: 0xd35400 },
  // ☀️ Sol de Badajoz: dorado radiante
  sol: { base: 0xf5c518, glow: 0xffe066, emissive: 0xe6b800 },
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
    this.grafoCasillas = [];
    // Centros de los monumentos (todos en tierra firme, salvo el puente que cruza el río)
    this.zonasMonumentos = [
      { x: -31, z: 13, r: 8 }, // Alcazaba (orilla sur, junto a la muralla del circuito)
      { x: -16, z: -19, r: 6 }, // Puerta de Palmas
      { x: -12, z: 10.2, r: 5 }, // Plaza Alta (dentro del anillo, orilla sur)
      { x: 17.5, z: 0, r: 8 }, // Puente Real
    ];

    // Estado de animación
    this.clock = new THREE.Clock();
    this.cameraTarget = new THREE.Vector3(0, 0, 0);
    this.currentCameraPos = new THREE.Vector3(0, 32, 38);
    // Cámara isométrica: elevada ~45° y desplazada en diagonal respecto al objetivo
    this.cameraOffset = new THREE.Vector3(0, 32, 29);
    this.lookTarget = new THREE.Vector3(0, 0, 0); // objetivo suavizado de la mirada
    this.activePlayerId = null;

    // Callbacks
    this.onAnimationFinished = null;
  }

  /**
   * Inicializa la escena, cámara, renderizador e iluminación.
   */
  init(grafoCasillas, jugadores = []) {
    this.grafoCasillas = grafoCasillas;
    // 1. Escena
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fdcff); // cielo despejado de día
    this.scene.fog = new THREE.Fog(0xbfe8ff, 90, 220); // bruma lejana muy suave

    // 2. Cámara
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 300);
    this.camera.position.set(0, 34, 40); // vista general inicial; luego sigue al peón activo
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
    // Luz ambiental blanca y luminosa (colores vivos, sin zonas negras)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    // Sol cálido y alto, con sombras suaves
    const dirLight = new THREE.DirectionalLight(0xfff1d6, 1.6);
    dirLight.position.set(25, 45, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -45;
    dirLight.shadow.camera.right = 45;
    dirLight.shadow.camera.top = 45;
    dirLight.shadow.camera.bottom = -45;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Relleno cielo (azul claro) / suelo (verde) para dar aspecto alegre
    const hemiLight = new THREE.HemisphereLight(0xbfe6ff, 0x7bc96f, 0.6);
    this.scene.add(hemiLight);
  }

  /**
   * Altura del terreno en (x, z): llano junto al circuito, al río y a los monumentos,
   * y con colinas suaves hacia los bordes (el circuito queda "en un valle").
   */
  alturaTerreno(x, z) {
    let d = Infinity;
    for (const t of this.grafoCasillas) d = Math.min(d, Math.hypot(t.x - x, t.z - z));
    for (const m of this.zonasMonumentos) d = Math.min(d, Math.hypot(m.x - x, m.z - z) - m.r);

    const orilla = Math.min(1, Math.max(0, (Math.abs(z) - 9.5) / 4)); // el río siempre llano
    const t = Math.min(1, Math.max(0, (d - 5) / 12));
    const suave = t * t * (3 - 2 * t);
    const ruido = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.0) * Math.cos(z * 0.19 + Math.sin(x * 0.13) * 1.5);
    return suave * orilla * (0.8 + ruido * 3.4);
  }

  /**
   * Terreno, Río Guadiana y siluetas monumentales.
   */
  setupEnvironment() {
    // ── Suelo Verde / Tierra de Badajoz
    const groundGeo = new THREE.PlaneGeometry(120, 100, 80, 66);
    const pos = groundGeo.attributes.position;
    const colores = new Float32Array(pos.count * 3);
    const verdeLlano = new THREE.Color(0x76c94f);
    const verdeColina = new THREE.Color(0x3f9e3a);
    const tmp = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      // Tras rotar el plano -90º en X: altura mundo = z local, z mundo = -y local
      const h = this.alturaTerreno(pos.getX(k), -pos.getY(k));
      pos.setZ(k, h);
      tmp.copy(verdeLlano).lerp(verdeColina, Math.min(1, h / 3.5));
      colores[k * 3] = tmp.r; colores[k * 3 + 1] = tmp.g; colores[k * 3 + 2] = tmp.b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colores, 3));
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      flatShading: true, // aspecto low-poly
      roughness: 0.95,
      metalness: 0.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // ── Río Guadiana (Cruza horizontalmente el centro)
    const riverGeo = new THREE.PlaneGeometry(120, 14, 64, 16);
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x39a9f0,
      roughness: 0.25,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88,
    });
    this.waterMesh = new THREE.Mesh(riverGeo, riverMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.set(0, -0.35, 0);
    this.scene.add(this.waterMesh);

    // ── Orillas del río
    const orillaMat = new THREE.MeshStandardMaterial({ color: 0xe9dcae, roughness: 0.8 });
    const orillaSur = new THREE.Mesh(new THREE.BoxGeometry(120, 0.4, 0.8), orillaMat);
    orillaSur.position.set(0, -0.2, 7.4);
    this.scene.add(orillaSur);

    const orillaNorte = new THREE.Mesh(new THREE.BoxGeometry(120, 0.4, 0.8), orillaMat);
    orillaNorte.position.set(0, -0.2, -7.4);
    this.scene.add(orillaNorte);

    // ── Monumentos estilizados
    this.buildAlcazaba(-31, 0, 13);
    this.buildPuenteReal(17.5, 0.2, 0);
    this.buildPuertaPalmas(-16, 0, -19);
    this.buildPlazaAlta(-12, 0, 10.2);
  }

  /**
   * La Alcazaba de Badajoz y Torre de Espantaperros
   */
  buildAlcazaba(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.scale.setScalar(0.6); // monumento a escala de maqueta: no tapa el circuito

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe2a94b, roughness: 0.9 });

    // Muralla base
    const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 4), wallMat);
    wall.position.set(0, 2.5, 0);
    wall.castShadow = true;
    group.add(wall);

    // Torre octogonal de Espantaperros
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xf4c25b, roughness: 0.8 });
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
    group.scale.setScalar(0.8); // monumento a escala de maqueta: no tapa el circuito

    // Calzada del puente
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.4 });
    const road = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 18), bridgeMat);
    road.position.set(0, 0, 0);
    road.castShadow = true;
    road.receiveShadow = true;
    group.add(road);

    // Pilono central blanco
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const pylon = new THREE.Mesh(new THREE.ConeGeometry(0.8, 12, 4), pylonMat);
    pylon.position.set(2.9, 6, 0); // a un lado de la calzada, para no tapar el camino
    group.add(pylon);

    // Tirantes iluminados (cables)
    const cableMat = new THREE.LineBasicMaterial({ color: 0x74b9ff, linewidth: 2 });
    for (let i = -6; i <= 6; i += 3) {
      if (i === 0) continue;
      const points = [
        new THREE.Vector3(2.9, 10, 0),
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
    group.scale.setScalar(0.6); // monumento a escala de maqueta: no tapa el circuito

    const ladrillo = new THREE.MeshStandardMaterial({ color: 0xe8604c, roughness: 0.8 });
    const piedra = new THREE.MeshStandardMaterial({ color: 0xf0d9a0, roughness: 0.8 });
    const tejado = new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.8 });
    const add = (mesh, px, py, pz) => {
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    // Dos pilares y dintel: dejan un hueco central (el paso de la puerta)
    add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 4, 1.8), piedra), -1.5, 2, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 4, 1.8), piedra), 1.5, 2, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(4.3, 1.2, 1.8), piedra), 0, 4.6, 0);
    // Almenas sobre el dintel
    for (let i = -2; i <= 2; i++) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 1.8), piedra), i * 0.85, 5.5, 0);
    }

    // Torres gemelas con remate cónico
    [-3.6, 3.6].forEach(tx => {
      add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 6.4, 16), ladrillo), tx, 3.2, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.4, 16), piedra), tx, 6.6, 0);
      add(new THREE.Mesh(new THREE.ConeGeometry(1.7, 2, 16), tejado), tx, 7.8, 0);
    });

    this.scene.add(group);
  }

  /**
   * La Plaza Alta con arcadas y motivos geométricos
   */
  buildPlazaAlta(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.scale.setScalar(0.6); // monumento a escala de maqueta: no tapa el circuito

    const add = (mesh, px, py, pz) => {
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    // Suelo ajedrezado característico de la plaza (textura procedural)
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const cx = cv.getContext('2d');
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        cx.fillStyle = (i + j) % 2 === 0 ? '#f6e3b4' : '#e2895a';
        cx.fillRect(i * 16, j * 16, 16, 16);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 1.5);
    const suelo = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.2, 5.5),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })
    );
    add(suelo, 0, 0.1, 1.2);

    // Soportales: hilera de columnas + cornisa
    const col = new THREE.MeshStandardMaterial({ color: 0xf6d8a8, roughness: 0.8 });
    for (let i = -3; i <= 3; i++) {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.4, 10), col), i * 1.4, 1.9, 0);
    }
    const cornisa = new THREE.MeshStandardMaterial({ color: 0xe9b97a, roughness: 0.8 });
    add(new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.5, 2.2), cornisa), 0, 3.85, -0.2);

    // Planta superior con ventanas y tejado
    add(new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.9, 1.8), new THREE.MeshStandardMaterial({ color: 0xf6d8a8, roughness: 0.8 })), 0, 5.05, -0.4);
    const ventana = new THREE.MeshStandardMaterial({ color: 0x3a4a6b, roughness: 0.4 });
    for (let i = -3; i <= 3; i += 1.5) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.1), ventana), i * 1.2, 5.1, 0.52);
    }
    add(new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.4, 2.4), new THREE.MeshStandardMaterial({ color: 0xd9622b, roughness: 0.8 })), 0, 6.2, -0.4);

    this.scene.add(group);
  }

  /**
   * Construye las casillas 3D conectadas según el grafo recibido del servidor.
   */
  buildBoard(grafoCasillas) {
    // Camino de piedra continuo (estilo tablero de aventura): losas de piedra unidas por
    // tramos de piedra, con un marcador de color incrustado que indica el tipo de casilla.
    const PIEDRA_SUPERIOR = 0xe8cb8f;
    const PIEDRA_LATERAL = 0xa87b4a;

    const matLateral = new THREE.MeshStandardMaterial({ color: PIEDRA_LATERAL, roughness: 0.95, metalness: 0.0 });
    const matSuperior = new THREE.MeshStandardMaterial({ color: PIEDRA_SUPERIOR, roughness: 0.85, metalness: 0.0 });
    const matTramo = new THREE.MeshStandardMaterial({ color: 0xdcbc7c, roughness: 0.9, metalness: 0.0 });
    const matFlecha = new THREE.MeshStandardMaterial({ color: 0xf6e7c8, roughness: 0.6 });

    grafoCasillas.forEach(c => {
      const estilo = COLORES_CASILLAS[c.tipo] || COLORES_CASILLAS.azul;
      const especial = ['inicio', 'sol', 'minijuego', 'bifurcacion'].includes(c.tipo);

      // Losa hexagonal de piedra (cara superior en y = 0.5, igual que antes)
      const tileGeo = new THREE.CylinderGeometry(2.0, 2.2, 1.0, 6);
      const tileMesh = new THREE.Mesh(tileGeo, [matLateral, matSuperior, matLateral]);
      tileMesh.position.set(c.x, 0, c.z);
      tileMesh.rotation.y = ((c.id * 37) % 11) * 0.05; // ligera variación: cada losa parece tallada a mano
      tileMesh.receiveShadow = true;
      tileMesh.castShadow = true;

      // Marcador de color incrustado en la piedra (indica el tipo de casilla)
      const radio = especial ? 1.15 : 0.9;
      const marcador = new THREE.Mesh(
        new THREE.CylinderGeometry(radio, radio, 0.08, 24),
        new THREE.MeshStandardMaterial({
          color: estilo.base,
          emissive: estilo.emissive,
          emissiveIntensity: 0.45,
          roughness: 0.3,
        })
      );
      marcador.position.y = 0.52;
      tileMesh.add(marcador);

      // Aro claro alrededor del marcador
      const aro = new THREE.Mesh(
        new THREE.RingGeometry(radio, radio + 0.18, 24),
        new THREE.MeshBasicMaterial({ color: estilo.glow, side: THREE.DoubleSide })
      );
      aro.rotation.x = -Math.PI / 2;
      aro.position.y = 0.565;
      tileMesh.add(aro);

      tileMesh.userData = { casillaId: c.id, tipo: c.tipo, nombre: c.nombre };
      this.scene.add(tileMesh);
      this.tilesMeshes.set(c.id, tileMesh);

      // Tramos de piedra hacia la(s) siguiente(s) casilla(s), con flecha de dirección
      c.siguientes.forEach(sigId => {
        const sigCasilla = grafoCasillas.find(item => item.id === sigId);
        if (!sigCasilla) return;

        const dx = sigCasilla.x - c.x;
        const dz = sigCasilla.z - c.z;
        const dist = Math.hypot(dx, dz);
        const rumbo = Math.atan2(dx, dz);

        const tramo = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, dist), matTramo);
        tramo.position.set(c.x + dx / 2, 0, c.z + dz / 2); // cara superior en y = 0.45
        tramo.rotation.y = rumbo;
        tramo.receiveShadow = true;
        this.scene.add(tramo);

        const flecha = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 3), matFlecha);
        flecha.rotation.order = 'YXZ';
        flecha.rotation.y = rumbo;
        flecha.rotation.x = Math.PI / 2; // la punta apunta a la casilla siguiente
        flecha.scale.set(1, 1, 0.25);
        flecha.position.set(c.x + dx * 0.5, 0.52, c.z + dz * 0.5);
        this.scene.add(flecha);
      });
    });

    this.buildVegetacion(grafoCasillas);
  }

  /**
   * Arbustos y árboles low-poly repartidos junto al camino (decoración procedural).
   * Determinista: usa el id de cada casilla como semilla, así no cambia entre recargas.
   */
  buildVegetacion(grafoCasillas) {
    // Generador pseudoaleatorio con semilla fija: el paisaje es igual en cada partida
    let semilla = 20240;
    const rnd = () => {
      semilla = (semilla + 0x6D2B79F5) | 0;
      let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const libre = (x, z, margen) =>
      Math.abs(z) > 10.5 && Math.abs(z) < 46 && Math.abs(x) < 57 &&
      grafoCasillas.every(t => Math.hypot(t.x - x, t.z - z) > margen) &&
      this.zonasMonumentos.every(m => Math.hypot(m.x - x, m.z - z) > m.r + 1);

    const arboles = [];
    const arbustos = [];
    for (let n = 0; n < 1400 && (arboles.length < 80 || arbustos.length < 70); n++) {
      const x = (rnd() - 0.5) * 112;
      const z = (rnd() - 0.5) * 92;
      if (!libre(x, z, 4.6)) continue;
      if (arboles.length < 80 && rnd() < 0.55) arboles.push({ x, z, s: 0.8 + rnd() * 0.9 });
      else if (arbustos.length < 70) arbustos.push({ x, z, s: 0.7 + rnd() * 0.7 });
    }

    // Florecillas junto al camino (fuera del río)
    const flores = [];
    grafoCasillas.forEach(c => {
      if (Math.abs(c.z) < 9) return;
      for (let n = 0; n < 5; n++) {
        const a = rnd() * Math.PI * 2;
        const d = 3.1 + rnd() * 1.3;
        const x = c.x + Math.cos(a) * d;
        const z = c.z + Math.sin(a) * d;
        if (libre(x, z, 2.9)) flores.push({ x, z });
      }
    });

    const dummy = new THREE.Object3D();
    const suelo = (x, z) => -0.5 + this.alturaTerreno(x, z);

    const paletaCopa = [0x3f9e3a, 0x57b846, 0x2f8a34, 0x6cc24a].map(c => new THREE.Color(c));
    const copas = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.4, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      arboles.length
    );
    const troncos = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x7a4b2a, roughness: 0.9 }),
      arboles.length
    );
    arboles.forEach((a, k) => {
      const y = suelo(a.x, a.z);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.setScalar(a.s);
      dummy.position.set(a.x, y + 0.8 * a.s, a.z);
      dummy.updateMatrix();
      troncos.setMatrixAt(k, dummy.matrix);
      dummy.position.set(a.x, y + 2.6 * a.s, a.z);
      dummy.updateMatrix();
      copas.setMatrixAt(k, dummy.matrix);
      copas.setColorAt(k, paletaCopa[k % paletaCopa.length]);
    });
    copas.castShadow = troncos.castShadow = true;
    this.scene.add(troncos, copas);

    const matas = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      arbustos.length
    );
    arbustos.forEach((a, k) => {
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.scale.set(a.s, a.s * 0.75, a.s);
      dummy.position.set(a.x, suelo(a.x, a.z) + a.s * 0.3, a.z);
      dummy.updateMatrix();
      matas.setMatrixAt(k, dummy.matrix);
      matas.setColorAt(k, paletaCopa[(k + 1) % paletaCopa.length]);
    });
    matas.castShadow = true;
    this.scene.add(matas);

    if (flores.length > 0) {
      const paletaFlor = [0xffd93d, 0xff7aa2, 0xffffff, 0xff6b6b].map(c => new THREE.Color(c));
      const florMesh = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(0.22, 0),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
        flores.length
      );
      flores.forEach((f, k) => {
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.position.set(f.x, suelo(f.x, f.z) + 0.15, f.z);
        dummy.updateMatrix();
        florMesh.setMatrixAt(k, dummy.matrix);
        florMesh.setColorAt(k, paletaFlor[k % paletaFlor.length]);
      });
      this.scene.add(florMesh);
    }
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
   * En Fase 3: también genera una etiqueta con el nombre flotante sobre el peón.
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

    // ── Etiqueta de nombre flotante (canvas 2D → sprite billboard) ────────
    const nombreLabel = this.crearEtiquetaNombre(jugador.nombre || '?', jugador.color || '#ffffff');
    nombreLabel.position.y = 4.2;
    group.add(nombreLabel);
    group.userData.labelSprite = nombreLabel;

    // Luz de punto tenue para resaltar el peón
    const pointLight = new THREE.PointLight(colorHex, 0.8, 6);
    pointLight.position.y = 1.5;
    group.add(pointLight);

    return group;
  }

  /**
   * Genera un Sprite Three.js con el nombre del jugador dibujado en canvas.
   * @param {string} nombre  - Nombre del jugador
   * @param {string} color   - Color hex del jugador (ej. '#E63946')
   * @returns {THREE.Sprite}
   */
  crearEtiquetaNombre(nombre, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Fondo semitransparente redondeado
    ctx.fillStyle = 'rgba(7, 7, 26, 0.78)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.fill();

    // Borde del color del jugador
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 12);
    ctx.stroke();

    // Texto
    ctx.font = 'bold 26px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nombre, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3, 0.75, 1);
    return sprite;
  }

  /**
   * Desplazamiento sutil para acomodar hasta 4 peones en la misma casilla sin taparse.
   */
  getPlayerTileOffset(colorHex) {
    switch (colorHex) {
      case '#E63946': return { x: -1.3, z: -0.7 };
      case '#457BB5': return { x: 1.3, z: -0.7 };
      case '#2DC653': return { x: -1.3, z: 0.7 };
      case '#F4D03F': return { x: 1.3, z: 0.7 };
      default: return { x: 0, z: 0 };
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
      1: { x: 0, z: Math.PI / 2 },
      2: { x: 0, z: 0 },
      3: { x: -Math.PI / 2, z: 0 },
      4: { x: Math.PI / 2, z: 0 },
      5: { x: Math.PI, z: 0 },
      6: { x: 0, z: -Math.PI / 2 },
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

    // Cámara isométrica que sigue al objetivo (peón activo) con suavizado independiente del framerate
    const suavizado = 1 - Math.exp(-delta * 3);
    this.lookTarget.lerp(this.cameraTarget, suavizado);

    // Sin jugador activo: vista general más alejada; con jugador activo: plano más cercano
    const zoom = this.activePlayerId ? 1 : 1.3;
    this.currentCameraPos.set(
      this.lookTarget.x + this.cameraOffset.x * zoom,
      this.lookTarget.y + this.cameraOffset.y * zoom,
      this.lookTarget.z + this.cameraOffset.z * zoom
    );
    this.camera.position.lerp(this.currentCameraPos, suavizado);
    this.camera.lookAt(this.lookTarget);

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