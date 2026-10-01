/**
 * public/minigamesScenery.js — Escenarios 3D detallados por minijuego
 *
 * ARQUITECTURA:
 *   ESCENARIOS[minigameId] = { construir(inst) → THREE.Group, animar(inst, dt, t) }
 *   - construir(): crea toda la decoración visual y la retorna como un Group.
 *     aplicarAmbiente() llama a construir() y guarda el resultado en inst.escenarioGroup.
 *   - animar(): se llama cada frame desde animarAmbiente(). Lee inst.snapshotActual
 *     para reaccionar al estado del juego (p.ej. luz verde/roja) pero NUNCA escribe
 *     estado de juego ni toca playerMeshes/objectMeshes.
 *   - limpiarEscena() llama a disposeArbol(inst.escenarioGroup).
 *
 * REGLAS:
 *   - No tocar jugabilidad, posiciones de jugadores, cámara base ni protocolo.
 *   - Solo three.js (ya importado desde el import map).
 *   - InstancedMesh para elementos repetidos (público, flores, banderines).
 *   - Texturas de minigamesLook.js (cacheadas, no se duplican).
 *   - Sin PointLights nuevas (los focos usan sprites/mallas emisivas aditivas).
 */

import * as THREE from 'three';
import {
  texturaAdoquin, texturaCesped, texturaAsfalto, texturaPiedra,
  texturaLadrillo, texturaMadera, texturaSillar,
  crearHaloSprite, crearArbol, crearAntorcha, crearBlobShadow,
} from './minigamesLook.js';

// ══════════════════════════════════════════════════════════════════
// HELPERS COMPARTIDOS
// ══════════════════════════════════════════════════════════════════

/** Crea un InstancedMesh de N copias de geo+mat y las sitúa con transforms[]. */
function instanced(geo, mat, transforms) {
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  transforms.forEach((tr, i) => {
    dummy.position.set(tr[0] || 0, tr[1] || 0, tr[2] || 0);
    dummy.rotation.set(tr[3] || 0, tr[4] || 0, tr[5] || 0);
    dummy.scale.setScalar(tr[6] != null ? tr[6] : 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Banderines triangulares instanciados en una cuerda. */
function crearBanderines(group, desde, hasta, cantidad, colores) {
  const dir = new THREE.Vector3().subVectors(hasta, desde);
  const longTotal = dir.length();
  const paso = longTotal / (cantidad + 1);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,  0.5, 0, 0,  0.25, -0.5, 0,
  ], 3));
  tri.computeVertexNormals();

  colores.forEach((col, ci) => {
    const mat = new THREE.MeshStandardMaterial({
      color: col, roughness: 0.55, side: THREE.DoubleSide,
    });
    for (let i = ci; i < cantidad; i += colores.length) {
      const t = (i + 1) / (cantidad + 1);
      const pos = new THREE.Vector3().lerpVectors(desde, hasta, t);
      const b = new THREE.Mesh(tri, mat);
      b.position.copy(pos);
      b.rotation.y = Math.atan2(dir.x, dir.z);
      group.add(b);
    }
  });

  // Cuerda
  const pts = [desde, hasta];
  const cuerdaGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const cuerdaMat = new THREE.LineBasicMaterial({ color: 0x4a3010 });
  group.add(new THREE.Line(cuerdaGeo, cuerdaMat));
}

/** Suelo con textura y repeat. */
function sueloTexturizado(tex, anchoX, anchoZ, posY, repeatX, repeatZ) {
  repeatX = repeatX || 8; repeatZ = repeatZ || 8;
  const t = tex.clone(); t.needsUpdate = true;
  t.repeat.set(repeatX, repeatZ); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const geo = new THREE.PlaneGeometry(anchoX, anchoZ, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.78 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = posY || 0;
  mesh.receiveShadow = true;
  return mesh;
}

/** Edificio de fachada colorida (frontal plano, chunky). */
function crearEdificio(ancho, alto, prof, color, ventanas) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, prof), mat);
  cuerpo.position.y = alto / 2; cuerpo.castShadow = true; cuerpo.receiveShadow = true;
  group.add(cuerpo);
  // Ventanas
  if (ventanas) {
    const ventMat = new THREE.MeshStandardMaterial({ color: 0xaaddff, roughness: 0.1, metalness: 0.5, emissive: 0x224488, emissiveIntensity: 0.3 });
    const filas = Math.floor(alto / 2.5), cols = Math.floor(ancho / 2.2);
    for (let r = 0; r < filas; r++) {
      for (let c = 0; c < cols; c++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.05), ventMat);
        v.position.set(
          -ancho / 2 + 1.1 + c * 2.2,
          1.5 + r * 2.5,
          prof / 2 + 0.03
        );
        group.add(v);
      }
    }
  }
  return group;
}

// ══════════════════════════════════════════════════════════════════
// ESCENARIOS
// ══════════════════════════════════════════════════════════════════

export const ESCENARIOS = {};

// ─────────────────────────────────────────────────────────────────
// 1. REACCION_LUCES — Explanada de la Alcazaba al atardecer
// ─────────────────────────────────────────────────────────────────
ESCENARIOS.reaccion_luces = {
  construir(inst) {
    const g = new THREE.Group();

    // Suelo adoquinado
    g.add(sueloTexturizado(texturaAdoquin(), 42, 30, 0, 10, 8));

    // Muralla de fondo (sillar texturizado)
    const sillarTex = texturaSillar().clone();
    sillarTex.needsUpdate = true; sillarTex.repeat.set(12, 2);
    const murallaMat = new THREE.MeshStandardMaterial({ map: sillarTex, roughness: 0.82 });
    const muralla = new THREE.Mesh(new THREE.BoxGeometry(40, 7, 2.5), murallaMat);
    muralla.position.set(0, 3.5, -9); muralla.castShadow = true; muralla.receiveShadow = true;
    g.add(muralla);

    // Almenas de la muralla (instanced)
    const almGeo = new THREE.BoxGeometry(1.2, 1.5, 2.6);
    const almMat = new THREE.MeshStandardMaterial({ map: sillarTex, roughness: 0.85 });
    const almTransforms = [];
    for (let i = -9; i <= 9; i += 2.4) almTransforms.push([i, 7.75, -9]);
    g.add(instanced(almGeo, almMat, almTransforms));

    // Torre de Espantaperros detallada
    const torreGroup = new THREE.Group();
    torreGroup.position.set(0, 0, -9);

    const torreBaseTex = texturaSillar().clone();
    torreBaseTex.needsUpdate = true; torreBaseTex.repeat.set(4, 6);
    const torreMat = new THREE.MeshStandardMaterial({ map: torreBaseTex, roughness: 0.8 });

    // Cuerpo principal (ya existe en setupReaccionLuces; este escenario
    // añade DECORACIÓN alrededor, no reemplaza el cuerpo de la torre)
    // Anillo decorativo (ménsula)
    const mensula = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 3.8, 0.6, 16), torreMat
    );
    mensula.position.y = 14; torreGroup.add(mensula);

    // Almenas de la torre
    const almTorreGeo = new THREE.BoxGeometry(1.0, 1.2, 1.0);
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const alm = new THREE.Mesh(almTorreGeo, torreMat);
      alm.position.set(Math.cos(ang) * 3.5, 16.5, Math.sin(ang) * 3.5);
      torreGroup.add(alm);
    }

    // Ventanas (4 arcos)
    const ventMat = new THREE.MeshStandardMaterial({ color: 0x1a0a00, roughness: 0.9 });
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2;
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.3), ventMat);
      v.position.set(Math.cos(ang) * 3.2, 10, Math.sin(ang) * 3.2);
      torreGroup.add(v);
    }

    // Halo de cono de luz bajo el foco (sprite cónico aditivo)
    const cono = crearHaloSprite(0xff3300, 12);
    cono.position.set(0, 16, 0);
    cono.scale.set(8, 14, 1);
    torreGroup.add(cono);
    torreGroup.userData.haloFoco = cono;

    g.add(torreGroup);

    // Antorchas flanqueando la explanada (SIN PointLight)
    const posAntorchas = [
      [-14, 0, -2], [-14, 0, -6], [-14, 0, -10],
      [ 14, 0, -2], [ 14, 0, -6], [ 14, 0, -10],
    ];
    posAntorchas.forEach(([x, , z]) => {
      const ant = crearAntorcha(3.5);
      ant.position.set(x, 0, z);
      g.add(ant);
    });

    // Estandartes
    const estandarteMat = new THREE.MeshStandardMaterial({ color: 0xcc2200, roughness: 0.6, side: THREE.DoubleSide });
    const paloMat = new THREE.MeshStandardMaterial({ color: 0x4a3010, roughness: 0.8 });
    [[-12, 0, -8.5], [12, 0, -8.5]].forEach(([x, , z]) => {
      const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6, 6), paloMat);
      palo.position.set(x, 3, z); g.add(palo);
      const tela = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.5), estandarteMat);
      tela.position.set(x + 0.6, 5.2, z); g.add(tela);
    });

    // Banderines entre antorchas
    crearBanderines(g,
      new THREE.Vector3(-14, 4.5, -2),
      new THREE.Vector3(14, 4.5, -2),
      12,
      [0xff2200, 0xffaa00, 0x2288ff, 0xffffff]
    );

    return g;
  },

  animar(inst, dt, t) {
    if (!inst.escenarioGroup) return;
    const luzVerde = inst.snapshotActual && inst.snapshotActual.luzVerdeActiva;
    const halo = inst.escenarioGroup.getObjectByProperty
      ? null  // getObjectByProperty solo existe en Object3D base, accedemos por userData
      : null;

    // Cambiar color del halo cónico según estado de luz
    inst.escenarioGroup.traverse((o) => {
      if (o.userData.haloFoco && o.userData.haloFoco.material) {
        const col = luzVerde ? new THREE.Color(0x00ff66) : new THREE.Color(0xff3300);
        o.userData.haloFoco.material.color.lerp(col, 0.1);
      }
    });
  },
};

// ─────────────────────────────────────────────────────────────────
// 2. CARRERA_GUADIANA — Río Guadiana con orillas exuberantes
// ─────────────────────────────────────────────────────────────────
ESCENARIOS.carrera_guadiana   = _escenarioGuadiana();
ESCENARIOS.piraguismo_guadiana = _escenarioGuadiana();

function _escenarioGuadiana() {
  return {
    construir(inst) {
      const g = new THREE.Group();

      // Orillas con textura de césped
      const cespedMat = new THREE.MeshStandardMaterial({ map: texturaCesped(), roughness: 0.85 });
      const cer = (z) => {
        const t = cespedMat.map.clone(); t.needsUpdate = true; t.repeat.set(30, 4);
        const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
        const orilla = new THREE.Mesh(new THREE.BoxGeometry(220, 1, 10), m);
        orilla.position.set(50, 0.4, z); orilla.receiveShadow = true;
        return orilla;
      };
      g.add(cer(26)); g.add(cer(-26));

      // Boyas instanciadas
      const boyaGeo = new THREE.SphereGeometry(0.4, 8, 6);
      const boyaMat = new THREE.MeshStandardMaterial({ color: 0xff4400, roughness: 0.4, emissive: 0xff2200, emissiveIntensity: 0.3 });
      const boyaPos = [];
      for (let x = 5; x <= 90; x += 15) {
        boyaPos.push([x, 0.4, -14]); boyaPos.push([x, 0.4, 14]);
      }
      g.add(instanced(boyaGeo, boyaMat, boyaPos));

      // Banderines en las boyas
      crearBanderines(g,
        new THREE.Vector3(5, 1.6, -14),
        new THREE.Vector3(90, 1.6, -14),
        8, [0xff4400, 0xffffff]
      );
      crearBanderines(g,
        new THREE.Vector3(5, 1.6, 14),
        new THREE.Vector3(90, 1.6, 14),
        8, [0xff4400, 0xffffff]
      );

      // Árboles en las orillas (instanced con crearArbol)
      for (let x = -10; x <= 100; x += 18) {
        const arb1 = crearArbol(x % 3); arb1.position.set(x, 0.4, 30); g.add(arb1);
        const arb2 = crearArbol((x + 1) % 3); arb2.position.set(x, 0.4, -30); g.add(arb2);
      }

      // Arco de META mejorado (naranja+blanco llamativo)
      const metaG = new THREE.Group();
      const arcMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff6600, emissiveIntensity: 0.5, roughness: 0.3 });
      const blMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

      // Postes
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 14, 12), arcMat);
      p1.position.set(100, 7, -18); metaG.add(p1);
      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 14, 12), arcMat);
      p2.position.set(100, 7, 18); metaG.add(p2);

      // Travesaño segmentado rojo/blanco
      for (let i = 0; i < 8; i++) {
        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 1.4, 4.5),
          i % 2 === 0 ? arcMat : blMat
        );
        seg.position.set(100, 14, -14 + i * 4.5); metaG.add(seg);
      }

      // Letrero META
      const letreroMat = new THREE.MeshStandardMaterial({ color: 0xffee22, emissive: 0xffcc00, emissiveIntensity: 0.8, roughness: 0.2 });
      const letrero = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 10), letreroMat);
      letrero.position.set(100, 17.5, 0); metaG.add(letrero);
      g.add(metaG);

      // Puente de Palmas mejorado al fondo
      const piedTex = texturaPiedra().clone(); piedTex.needsUpdate = true; piedTex.repeat.set(4, 3);
      const puenteMat = new THREE.MeshStandardMaterial({ map: piedTex, roughness: 0.8 });
      const puenteG = new THREE.Group();
      for (let i = -3; i <= 3; i++) {
        const pilar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 18, 10), puenteMat);
        pilar.position.set(i * 10, 5, -32); pilar.castShadow = true; puenteG.add(pilar);
        // Arco bajo el pilar
        const arco = new THREE.Mesh(
          new THREE.TorusGeometry(3.5, 0.4, 8, 24, Math.PI),
          puenteMat
        );
        arco.rotation.z = Math.PI; arco.position.set(i * 10, -1, -32);
        puenteG.add(arco);
      }
      const calzPuente = new THREE.Mesh(new THREE.BoxGeometry(84, 1.5, 8), puenteMat);
      calzPuente.position.set(0, 14.5, -32); calzPuente.castShadow = true; puenteG.add(calzPuente);
      g.add(puenteG);

      return g;
    },

    animar(inst, dt, t) {
      // Las olas del agua se animan en minigames.js (aguaMesh)
      // Aquí solo animamos algún elemento decorativo si lo hubiera
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// 3. CARRERA_COCHES — Puente Real con asfalto y gradas
// ─────────────────────────────────────────────────────────────────
ESCENARIOS.carrera_coches = {
  construir(inst) {
    const g = new THREE.Group();

    // Asfalto texturizado (la calzada base viene de setupCarreraCoches)
    const asfTex = texturaAsfalto().clone();
    asfTex.needsUpdate = true; asfTex.repeat.set(3, 40);
    const asfMat = new THREE.MeshStandardMaterial({ map: asfTex, roughness: 0.75 });
    const asfalto = new THREE.Mesh(new THREE.PlaneGeometry(12, 130), asfMat);
    asfalto.rotation.x = -Math.PI / 2; asfalto.position.set(0, 0.01, -35);
    asfalto.receiveShadow = true; g.add(asfalto);

    // Líneas de carril (canvas)
    const lcCanvas = document.createElement('canvas'); lcCanvas.width = 128; lcCanvas.height = 512;
    const lcCtx = lcCanvas.getContext('2d');
    lcCtx.fillStyle = 'transparent'; lcCtx.fillRect(0, 0, 128, 512);
    lcCtx.strokeStyle = 'rgba(255,255,180,0.85)'; lcCtx.lineWidth = 8; lcCtx.setLineDash([40, 40]);
    lcCtx.beginPath(); lcCtx.moveTo(42, 0); lcCtx.lineTo(42, 512); lcCtx.stroke();
    lcCtx.beginPath(); lcCtx.moveTo(85, 0); lcCtx.lineTo(85, 512); lcCtx.stroke();
    const lcTex = new THREE.CanvasTexture(lcCanvas);
    lcTex.wrapS = lcTex.wrapT = THREE.RepeatWrapping; lcTex.repeat.set(1, 20);
    const lcMat = new THREE.MeshBasicMaterial({ map: lcTex, transparent: true, depthWrite: false });
    const lc = new THREE.Mesh(new THREE.PlaneGeometry(12, 130), lcMat);
    lc.rotation.x = -Math.PI / 2; lc.position.set(0, 0.02, -35); g.add(lc);

    // Bordillos rojo/blanco instanciados
    const bGeo = new THREE.BoxGeometry(1.2, 0.35, 3);
    const bRojo  = new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.55 });
    const bBlanco = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
    for (let z = -90; z <= 20; z += 6) {
      const bL = new THREE.Mesh(bGeo, z % 12 === 0 ? bRojo : bBlanco);
      bL.position.set(-6.6, 0.17, z); bL.castShadow = true; g.add(bL);
      const bR = new THREE.Mesh(bGeo, z % 12 === 0 ? bRojo : bBlanco);
      bR.position.set(6.6, 0.17, z); bR.castShadow = true; g.add(bR);
    }

    // Gradas con público instanciado (SphereGeometry como cabezas)
    const cabGeo = new THREE.SphereGeometry(0.35, 6, 5);
    const cabColores = [0xffb340, 0xff4444, 0x44bbff, 0xffffff, 0x44ff88, 0xff88ff];
    for (let lado = -1; lado <= 1; lado += 2) {
      for (let fila = 0; fila < 4; fila++) {
        for (let asiento = -9; asiento <= 9; asiento++) {
          const cabMat = new THREE.MeshStandardMaterial({ color: cabColores[Math.abs(asiento + fila) % 6], roughness: 0.7 });
          const cab = new THREE.Mesh(cabGeo, cabMat);
          cab.position.set(lado * (9 + fila * 1.5), 1 + fila * 1.4, asiento * 1.8 - 30);
          cab.castShadow = true; g.add(cab);
          // Cuerpo
          const cuerpoMat = new THREE.MeshStandardMaterial({ color: cabColores[(Math.abs(asiento + fila) + 3) % 6], roughness: 0.8 });
          const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.4), cuerpoMat);
          cuerpo.position.set(lado * (9 + fila * 1.5), 0.5 + fila * 1.4, asiento * 1.8 - 30);
          g.add(cuerpo);
        }
      }
      // Vallas de separación
      const vallaGeo = new THREE.BoxGeometry(0.15, 1.5, 65);
      const vallaMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
      const valla = new THREE.Mesh(vallaGeo, vallaMat);
      valla.position.set(lado * 7.5, 0.75, -30); g.add(valla);
    }

    // Vallas publicitarias
    const vpColores = [0x2255cc, 0xcc4400, 0x22aa44];
    ['BADAJOZ', 'GUADIANA', 'MINIFOLK'].forEach((txt, i) => {
      const vpMat = new THREE.MeshStandardMaterial({ color: vpColores[i], roughness: 0.6, emissive: vpColores[i], emissiveIntensity: 0.15 });
      const vp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 6), vpMat);
      vp.position.set(i % 2 === 0 ? 12 : -12, 1.5, -15 - i * 20);
      vp.castShadow = true; g.add(vp);
    });

    // Gran arco del Puente Real mejorado (ya está en setup, aquí añadimos pilones)
    const arcoMat = new THREE.MeshStandardMaterial({ color: 0x1a6fd4, roughness: 0.3, emissive: 0x0a3080, emissiveIntensity: 0.2 });
    const pylon1 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 20, 8), arcoMat);
    pylon1.position.set(-6.5, 10, -35); pylon1.castShadow = true; g.add(pylon1);
    const pylon2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 20, 8), arcoMat);
    pylon2.position.set(6.5, 10, -35); pylon2.castShadow = true; g.add(pylon2);

    // Meta a cuadros
    const metaGeo = new THREE.BoxGeometry(14, 0.3, 1.5);
    const metaC = document.createElement('canvas'); metaC.width = 128; metaC.height = 16;
    const mCtx = metaC.getContext('2d');
    for (let i = 0; i < 16; i++) {
      mCtx.fillStyle = i % 2 === 0 ? '#000' : '#fff';
      mCtx.fillRect(i * 8, 0, 8, 8);
      mCtx.fillStyle = i % 2 === 0 ? '#fff' : '#000';
      mCtx.fillRect(i * 8, 8, 8, 8);
    }
    const metaTex = new THREE.CanvasTexture(metaC); metaTex.repeat.set(8, 1);
    const metaMat = new THREE.MeshBasicMaterial({ map: metaTex }); metaMat.map.wrapS = THREE.RepeatWrapping;
    const metaMesh = new THREE.Mesh(metaGeo, metaMat);
    metaMesh.position.set(0, 0.16, 5); g.add(metaMesh);

    return g;
  },

  animar(inst, dt, t) {
    // Cabezas del público oscilan
    if (inst.escenarioGroup) {
      let idx = 0;
      inst.escenarioGroup.traverse((o) => {
        if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry') {
          o.position.y += Math.sin(t * 2.5 + idx * 0.8) * 0.003;
          idx++;
        }
      });
    }
  },
};

// ─────────────────────────────────────────────────────────────────
// 4. MEMORY_MONUMENTOS — Arena circular con anillo dorado
// ─────────────────────────────────────────────────────────────────
ESCENARIOS.memory_monumentos = {
  construir(inst) {
    const g = new THREE.Group();

    // Plataforma circular con borde elevado
    const plataforma = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14.5, 0.8, 48),
      new THREE.MeshStandardMaterial({ color: 0x6a0020, roughness: 0.7, metalness: 0.1 })
    );
    plataforma.position.y = -0.4; plataforma.receiveShadow = true; g.add(plataforma);

    // Anillo dorado metálico con remaches
    const anilloMat = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.85, roughness: 0.25, emissive: 0x7a5a00, emissiveIntensity: 0.2 });
    const anillo = new THREE.Mesh(
      new THREE.TorusGeometry(13, 0.55, 16, 64),
      anilloMat
    );
    anillo.rotation.x = Math.PI / 2; anillo.position.y = 0.05; g.add(anillo);

    // Remaches instanciados
    const remGeo = new THREE.SphereGeometry(0.14, 6, 5);
    const remPos = [];
    for (let i = 0; i < 32; i++) {
      const ang = (i / 32) * Math.PI * 2;
      remPos.push([Math.cos(ang) * 13, 0.22, Math.sin(ang) * 13]);
    }
    g.add(instanced(remGeo, anilloMat, remPos));

    // Mosaico en el suelo (sectores de colores)
    const sectorColores = [0x8b1010, 0xa01a1a, 0x7a0808, 0x901818];
    for (let i = 0; i < 8; i++) {
      const sec = new THREE.Mesh(
        new THREE.CircleGeometry(12, 8, (i / 8) * Math.PI * 2, Math.PI * 2 / 8),
        new THREE.MeshStandardMaterial({ color: sectorColores[i % 4], roughness: 0.65, side: THREE.DoubleSide })
      );
      sec.rotation.x = -Math.PI / 2; sec.position.y = 0.01; g.add(sec);
    }

    // Focos decorativos alrededor (sprites emisivos, SIN PointLight)
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const x = Math.cos(ang) * 12, z = Math.sin(ang) * 12;
      const focoSprite = crearHaloSprite(0xfff5a0, 3);
      focoSprite.position.set(x, 2.5, z); g.add(focoSprite);

      const poste = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 2.5, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a4060, roughness: 0.6 })
      );
      poste.position.set(x, 1.25, z); g.add(poste);
    }

    // Gradas al borde (semicírculo)
    const gradaGeo = new THREE.BoxGeometry(1.8, 0.45, 1.4);
    const gradaMat = new THREE.MeshStandardMaterial({ color: 0x4a3858, roughness: 0.7 });
    for (let fila = 0; fila < 3; fila++) {
      for (let i = 0; i < 20; i++) {
        const ang = ((i - 10) / 20) * Math.PI;
        const r = 16 + fila * 2;
        const grd = new THREE.Mesh(gradaGeo, gradaMat);
        grd.position.set(Math.cos(ang) * r, fila * 0.45, Math.sin(ang) * r - 2);
        grd.rotation.y = -ang; grd.receiveShadow = true; g.add(grd);
      }
    }

    return g;
  },

  animar(inst, dt, t) {
    // El anillo dorado gira lentamente
    if (inst.escenarioGroup) {
      inst.escenarioGroup.traverse((o) => {
        if (o.isMesh && o.geometry && o.geometry.type === 'TorusGeometry') {
          o.rotation.z += dt * 0.12;
        }
      });
    }
  },
};

// ─────────────────────────────────────────────────────────────────
// 5. PULSO_FUERZA — Plaza Alta con baldosas y fuentes
// ─────────────────────────────────────────────────────────────────
ESCENARIOS.pulso_fuerza = {
  construir(inst) {
    const g = new THREE.Group();

    // Suelo de ladrillo / baldosa
    g.add(sueloTexturizado(texturaLadrillo(), 36, 26, 0, 8, 6));

    // Fuentes (2)
    const fuenteMat = new THREE.MeshStandardMaterial({ color: 0xc8bda8, roughness: 0.6 });
    [[-10, 0, -6], [10, 0, -6]].forEach(([x, , z]) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 0.6, 16), fuenteMat);
      base.position.set(x, 0.3, z); base.castShadow = true; g.add(base);
      const taza = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.3, 8, 24), fuenteMat);
      taza.rotation.x = Math.PI / 2; taza.position.set(x, 0.65, z); g.add(taza);
      const columna = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.4, 8), fuenteMat);
      columna.position.set(x, 1.3, z); g.add(columna);
      // Agua de la fuente (disco emisivo)
      const agua = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 0.1, 16),
        new THREE.MeshStandardMaterial({ color: 0x40c0ff, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.85, emissive: 0x0080ff, emissiveIntensity: 0.3 })
      );
      agua.position.set(x, 0.62, z); g.add(agua);
    });

    // Edificios de fachada colorida al fondo
    const paleta = [0xff7755, 0xffee66, 0x55ccff, 0xff88cc, 0x88ff88];
    for (let i = 0; i < 7; i++) {
      const ancho = 3.5 + Math.random() * 2;
      const alto  = 5  + Math.random() * 5;
      const ed = crearEdificio(ancho, alto, 2, paleta[i % 5], true);
      ed.position.set(-12 + i * 4.5, 0, -13); g.add(ed);
    }

    // Farolas instanciadas
    const farMat  = new THREE.MeshStandardMaterial({ color: 0x303040, roughness: 0.6 });
    const farLuzMat = new THREE.MeshStandardMaterial({ color: 0xffeeaa, emissive: 0xffdd88, emissiveIntensity: 1.2, roughness: 0.2 });
    const farolas = [[-12, 0, 6], [12, 0, 6], [-12, 0, -2], [12, 0, -2]];
    farolas.forEach(([x, , z]) => {
      const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6), farMat);
      palo.position.set(x, 2.5, z); g.add(palo);
      const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), farLuzMat);
      cabeza.position.set(x, 5.2, z); g.add(cabeza);
      const haloFar = crearHaloSprite(0xffdd88, 2.8);
      haloFar.position.set(x, 5.2, z); g.add(haloFar);
    });

    // Árboles en los laterales
    [[-14, 0, 3], [-14, 0, -5], [14, 0, 3], [14, 0, -5]].forEach(([x, , z]) => {
      const arb = crearArbol(0); arb.position.set(x, 0, z); g.add(arb);
    });

    // Público instanciado
    const cabGeo2 = new THREE.SphereGeometry(0.3, 6, 5);
    const cpColores = [0xff8844, 0x44aaff, 0xffee44, 0xff44aa];
    for (let i = 0; i < 30; i++) {
      const cm = new THREE.MeshStandardMaterial({ color: cpColores[i % 4], roughness: 0.7 });
      const cab = new THREE.Mesh(cabGeo2, cm);
      cab.position.set(-13 + (i % 7) * 4.2, 0.5, 8 + Math.floor(i / 7) * 1.5);
      g.add(cab);
    }

    // Banderines
    crearBanderines(g, new THREE.Vector3(-14, 7, -12), new THREE.Vector3(14, 7, -12), 10, [0xff5522, 0xffee22, 0x22aaff]);

    return g;
  },

  animar(inst, dt, t) { /* estático */ },
};

// ─────────────────────────────────────────────────────────────────
// 6. CARNAVAL_CARAMELOS — Arena de feria con guirnaldas
// ─────────────────────────────────────────────────────────────────
ESCENARIOS.carnaval_caramelos = {
  construir(inst) {
    const g = new THREE.Group();

    // Suelo festivo
    g.add(sueloTexturizado(texturaLadrillo(), 40, 28, 0, 10, 8));

    // Postes de luz carnavaleros
    const posteMat = new THREE.MeshStandardMaterial({ color: 0x3a1a5a, roughness: 0.7 });
    const pColores = [0xff2200, 0xff8800, 0xffee00, 0x00bbff, 0xaa00ff];
    const postes = [[-14, 0, -8], [-14, 0, 8], [14, 0, -8], [14, 0, 8], [0, 0, -8]];
    postes.forEach(([x, , z]) => {
      const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 12, 7), posteMat);
      poste.position.set(x, 6, z); g.add(poste);
    });

    // Farolillos emisivos (reemplaza DodecahedronGeometry)
    const farColores = [0xff2244, 0xff8800, 0xffee22, 0x44ddff, 0xcc44ff, 0x44ff88];
    let fcIdx = 0;
    for (let x = -14; x <= 14; x += 3.5) {
      const col = farColores[fcIdx % farColores.length]; fcIdx++;
      const farMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.3 });
      const far = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), farMat);
      const altura = 9.5 + Math.sin(fcIdx * 0.7) * 0.8;
      far.position.set(x, altura, -6);
      g.add(far);
      const hFar = crearHaloSprite(col, 2.5);
      hFar.position.set(x, altura, -6); g.add(hFar);
    }

    // Guirnaldas (cuerda entre postes)
    crearBanderines(g, new THREE.Vector3(-14, 11, -8), new THREE.Vector3(14, 11, -8), 12, pColores);
    crearBanderines(g, new THREE.Vector3(-14, 11, 8), new THREE.Vector3(14, 11, 8), 12, pColores);
    crearBanderines(g, new THREE.Vector3(-14, 11, -8), new THREE.Vector3(-14, 11, 8), 6, pColores);
    crearBanderines(g, new THREE.Vector3(14, 11, -8), new THREE.Vector3(14, 11, 8), 6, pColores);

    // Tribunas laterales decorativas
    const tribMat = new THREE.MeshStandardMaterial({ color: 0x5a1a8a, roughness: 0.7 });
    [-15.5, 15.5].forEach(lado => {
      const trib = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 20), tribMat);
      trib.position.set(lado, 2, 0); trib.castShadow = true; g.add(trib);
    });

    // Público instanciado en las tribunas
    const cabG3 = new THREE.SphereGeometry(0.28, 6, 5);
    const cpC3 = [0xffb340, 0xff4444, 0x88ffcc, 0xffee88];
    for (let i = 0; i < 24; i++) {
      const cm = new THREE.MeshStandardMaterial({ color: cpC3[i % 4], roughness: 0.7 });
      const cab = new THREE.Mesh(cabG3, cm);
      cab.position.set(
        (i < 12 ? -15.5 : 15.5) + (Math.random() - 0.5) * 2,
        3.5 + Math.floor(i % 3) * 0.9,
        -8 + (i % 12) * 1.5
      );
      g.add(cab);
    }

    return g;
  },

  animar(inst, dt, t) {
    // Los farolillos ya brillan con emissive. No hacemos nada extra.
  },
};

// ─────────────────────────────────────────────────────────────────
// 7. ESQUIVAR_MURALLA — Adarve detallado de la Alcazaba
// ─────────────────────────────────────────────────────────────────
ESCENARIOS.esquivar_muralla = {
  construir(inst) {
    const g = new THREE.Group();

    // Superficie del adarve (sillar)
    const silTex = texturaSillar().clone(); silTex.needsUpdate = true; silTex.repeat.set(5, 30);
    const silMat = new THREE.MeshStandardMaterial({ map: silTex, roughness: 0.82 });
    const adarve = new THREE.Mesh(new THREE.BoxGeometry(10, 1.5, 90), silMat);
    adarve.position.set(0, -0.75, -20); adarve.receiveShadow = true; g.add(adarve);

    // Pretil lateral (muros a izq/dcha)
    const pretilGeo = new THREE.BoxGeometry(0.8, 2.2, 90);
    const pretilIzq = new THREE.Mesh(pretilGeo, silMat);
    pretilIzq.position.set(-5.4, 0.35, -20); pretilIzq.castShadow = true; g.add(pretilIzq);
    const pretilDer = new THREE.Mesh(pretilGeo, silMat);
    pretilDer.position.set(5.4, 0.35, -20); pretilDer.castShadow = true; g.add(pretilDer);

    // Almenas chunky con bisel (las del setup son cajas simples, añadimos las detalladas)
    for (let z = -58; z <= 14; z += 5) {
      [[-5.4, 1.55, z], [5.4, 1.55, z]].forEach(([x, y, zz]) => {
        // Almena principal
        const alm = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 1.8, 2.2),
          new THREE.MeshStandardMaterial({ map: silTex, roughness: 0.85 })
        );
        alm.position.set(x, y, zz); alm.castShadow = true; g.add(alm);
        // Bisel superior
        const bevel = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 0.25, 2.3),
          new THREE.MeshStandardMaterial({ color: 0xc8bda8, roughness: 0.7 })
        );
        bevel.position.set(x, y + 1.0, zz); g.add(bevel);
      });
    }

    // Puerta/meta al fondo (arco de entrada)
    const puertaMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.9 });
    const puertaMarco = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 2), silMat);
    puertaMarco.position.set(0, 4, -68); g.add(puertaMarco);
    const hueco = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 2.2), puertaMat);
    hueco.position.set(0, 3.5, -68); g.add(hueco);
    const arcoMeta = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.4, 8, 24, Math.PI),
      silMat
    );
    arcoMeta.position.set(0, 7, -68); arcoMeta.rotation.z = Math.PI; g.add(arcoMeta);

    // Letrero META en el arco
    const metaMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.8, roughness: 0.2 });
    const letrero = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.2, 0.4), metaMat);
    letrero.position.set(0, 8.5, -68); g.add(letrero);

    // Paisaje lateral (árboles)
    for (let z = -60; z <= 10; z += 20) {
      const a1 = crearArbol(z % 3); a1.position.set(-16, 0, z); g.add(a1);
      const a2 = crearArbol((z + 1) % 3); a2.position.set(16, 0, z); g.add(a2);
    }

    // Banderines en la muralla
    crearBanderines(g, new THREE.Vector3(-5, 3, -60), new THREE.Vector3(-5, 3, 10), 8, [0xff2200, 0xffdd00]);
    crearBanderines(g, new THREE.Vector3(5, 3, -60), new THREE.Vector3(5, 3, 10), 8, [0xff2200, 0xffdd00]);

    return g;
  },

  animar(inst, dt, t) { /* estático */ },
};

// ─────────────────────────────────────────────────────────────────
// 8. EQUILIBRIO_PUENTE — Puente de Palmas detallado
// ─────────────────────────────────────────────────────────────────
ESCENARIOS.equilibrio_puente = {
  construir(inst) {
    const g = new THREE.Group();

    // Textura de piedra para el puente
    const piedTex = texturaPiedra().clone(); piedTex.needsUpdate = true; piedTex.repeat.set(6, 1);
    const puMat = new THREE.MeshStandardMaterial({ map: piedTex, roughness: 0.82 });

    // Arcos del puente (bajo el pretil)
    for (let i = -2; i <= 2; i++) {
      const arco = new THREE.Mesh(
        new THREE.TorusGeometry(3, 0.5, 8, 24, Math.PI),
        puMat
      );
      arco.rotation.z = Math.PI; arco.position.set(i * 7, -3.5, 1.5); g.add(arco);
      const pilar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 3), puMat);
      pilar.position.set(i * 7, -3.5, 1.5); pilar.castShadow = true; g.add(pilar);
    }

    // Barandilla detallada
    const barMat = new THREE.MeshStandardMaterial({ color: 0xc8bda8, roughness: 0.7 });
    for (let x = -13; x <= 13; x += 2.5) {
      const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.8, 7), barMat);
      bal.position.set(x, 0.9, 1.2); bal.castShadow = true; g.add(bal);
      const bal2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.8, 7), barMat);
      bal2.position.set(x, 0.9, -1.2); bal2.castShadow = true; g.add(bal2);
    }
    // Pasamanos
    const pasMat = new THREE.MeshStandardMaterial({ color: 0xb0a090, roughness: 0.6 });
    const pasIzq = new THREE.Mesh(new THREE.BoxGeometry(28, 0.2, 0.2), pasMat);
    pasIzq.position.set(0, 1.8, 1.2); g.add(pasIzq);
    const pasDer = new THREE.Mesh(new THREE.BoxGeometry(28, 0.2, 0.2), pasMat);
    pasDer.position.set(0, 1.8, -1.2); g.add(pasDer);

    // Orillas con césped y árboles
    const cespMat = new THREE.MeshStandardMaterial({ map: texturaCesped(), roughness: 0.85 });
    const orillaN = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 12), cespMat);
    orillaN.position.set(0, -3.9, -12); g.add(orillaN);
    const orillaS = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 12), cespMat);
    orillaS.position.set(0, -3.9, 12); g.add(orillaS);

    [[-16, -3.5, -16], [-8, -3.5, -18], [8, -3.5, -18], [16, -3.5, -16],
     [-16, -3.5, 16],  [-8, -3.5, 18],  [8, -3.5, 18],  [16, -3.5, 16]].forEach(([x, y, z]) => {
      const arb = crearArbol(Math.abs(z) % 3); arb.position.set(x, y, z); g.add(arb);
    });

    return g;
  },

  animar(inst, dt, t) { /* agua animada ya está en minigames.js (aguaMesh) */ },
};

// ─────────────────────────────────────────────────────────────────
// 9. LLUVIA_BELLOTAS — Prado con flores, árboles y hojas
// ─────────────────────────────────────────────────────────────────
ESCENARIOS.lluvia_bellotas = {
  construir(inst) {
    const g = new THREE.Group();

    // Suelo de césped texturizado
    g.add(sueloTexturizado(texturaCesped(), 40, 28, 0, 10, 8));

    // Árboles con copas multicapa (sustituye DodecahedronGeometry)
    const posArboles = [[-11, 0, -7], [-11, 0, -10], [-4, 0, -9], [4, 0, -9], [11, 0, -7], [11, 0, -10]];
    posArboles.forEach(([x, , z], i) => {
      const arb = crearArbol(i % 2); arb.position.set(x, 0, z); g.add(arb);
    });

    // Flores instanciadas (esferas pequeñas de colores)
    const floresColores = [0xff4488, 0xffee22, 0xff8822, 0xcc44ff, 0xff2244, 0xffffff];
    const floresPos = [];
    for (let i = 0; i < 80; i++) {
      floresPos.push([
        (Math.random() - 0.5) * 36, 0.35,
        (Math.random() - 0.5) * 24,
      ]);
    }
    floresColores.forEach((col, ci) => {
      const fGeo = new THREE.SphereGeometry(0.2, 5, 4);
      const fMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, emissive: col, emissiveIntensity: 0.2 });
      const subset = floresPos.filter((_, i) => i % floresColores.length === ci);
      if (subset.length) g.add(instanced(fGeo, fMat, subset));
    });

    // Arbustos redondeados instanciados
    const arbMat = new THREE.MeshStandardMaterial({ color: 0x3ab840, roughness: 0.75 });
    const arbPos = [[-14, 0, 5], [14, 0, 5], [-14, 0, -3], [14, 0, -3]];
    const arbGeo = new THREE.SphereGeometry(1.4, 8, 6);
    g.add(instanced(arbGeo, arbMat, arbPos.map(p => [p[0], 1.1, p[2]])));

    // Bellotas en el suelo (doradas brillantes)
    const belGeo = new THREE.SphereGeometry(0.22, 7, 5);
    const belMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.4, emissive: 0x6b4a10, emissiveIntensity: 0.3 });
    const belPos = [];
    for (let i = 0; i < 20; i++) {
      belPos.push([(Math.random() - 0.5) * 30, 0.22, (Math.random() - 0.5) * 20]);
    }
    g.add(instanced(belGeo, belMat, belPos));

    // Partículas de hojas cayendo (Points)
    const hojasCount = 120;
    const hojasGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(hojasCount * 3);
    const velocidades = new Float32Array(hojasCount * 3);
    for (let i = 0; i < hojasCount; i++) {
      positions[i * 3    ] = (Math.random() - 0.5) * 38;
      positions[i * 3 + 1] = Math.random() * 14 + 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 26;
      velocidades[i * 3    ] = (Math.random() - 0.5) * 0.3;
      velocidades[i * 3 + 1] = -(0.5 + Math.random() * 1.2);
      velocidades[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    hojasGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const hojasMat = new THREE.PointsMaterial({ color: 0x88cc44, size: 0.28, transparent: true, opacity: 0.85 });
    const hojas = new THREE.Points(hojasGeo, hojasMat);
    hojas.userData.velocidades = velocidades;
    hojas.userData.esHojas = true;
    g.add(hojas);

    return g;
  },

  animar(inst, dt, t) {
    if (!inst.escenarioGroup) return;
    inst.escenarioGroup.traverse((o) => {
      if (!o.userData.esHojas) return;
      const pos = o.geometry.attributes.position.array;
      const vel = o.userData.velocidades;
      for (let i = 0; i < pos.length / 3; i++) {
        pos[i * 3    ] += vel[i * 3    ] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3 + 1] = 14 + Math.random() * 4;
          pos[i * 3    ] = (Math.random() - 0.5) * 38;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 26;
        }
      }
      o.geometry.attributes.position.needsUpdate = true;
    });
  },
};
