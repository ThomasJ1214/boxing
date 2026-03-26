// ============================================
// Renderer - Three.js 3D Crash Test Dummies
// Drop-in replacement: same API surface
// ============================================

const Renderer = (function () {
  'use strict';

  let renderer, scene, camera;
  let playerDummy, aiDummy;
  let ringGroup;
  let particles = [];
  let particlePool = [];
  const PARTICLE_POOL_SIZE = 64;
  let shakeAmount = 0;
  const shakeDecay = 0.9;
  let cameraBasePos;

  // ---- Constants ----
  const BODY = {
    headRadius: 0.3,
    neckRadius: 0.08, neckHeight: 0.12,
    torsoW: 0.65, torsoH: 0.85, torsoD: 0.32,
    shoulderR: 0.09,
    upperArmR: 0.065, upperArmLen: 0.42,
    elbowR: 0.065,
    forearmR: 0.06, forearmLen: 0.38,
    gloveR: 0.17,
    hipR: 0.075,
    upperLegR: 0.075, upperLegLen: 0.42,
    kneeR: 0.06,
    lowerLegR: 0.065, lowerLegLen: 0.42,
    footW: 0.18, footH: 0.07, footD: 0.28,
  };

  const PLAYER_COLOR = 0x2196F3;
  const PLAYER_DARK = 0x1565C0;
  const AI_COLOR = 0xF44336;
  const AI_DARK = 0xC62828;

  // Shared geometries (created once)
  let geom = null;

  function createGeometries() {
    geom = {
      head: new THREE.SphereGeometry(BODY.headRadius, 20, 16),
      neck: new THREE.CylinderGeometry(BODY.neckRadius, BODY.neckRadius, BODY.neckHeight, 8),
      torso: new THREE.BoxGeometry(BODY.torsoW, BODY.torsoH, BODY.torsoD),
      shoulder: new THREE.SphereGeometry(BODY.shoulderR, 8, 8),
      upperArm: new THREE.CylinderGeometry(BODY.upperArmR, BODY.upperArmR, BODY.upperArmLen, 8),
      elbow: new THREE.SphereGeometry(BODY.elbowR, 8, 8),
      forearm: new THREE.CylinderGeometry(BODY.forearmR, BODY.forearmR, BODY.forearmLen, 8),
      glove: new THREE.SphereGeometry(BODY.gloveR, 12, 10),
      hip: new THREE.SphereGeometry(BODY.hipR, 8, 8),
      upperLeg: new THREE.CylinderGeometry(BODY.upperLegR, BODY.upperLegR, BODY.upperLegLen, 8),
      knee: new THREE.SphereGeometry(BODY.kneeR, 8, 8),
      lowerLeg: new THREE.CylinderGeometry(BODY.lowerLegR, BODY.lowerLegR, BODY.lowerLegLen, 8),
      foot: new THREE.BoxGeometry(BODY.footW, BODY.footH, BODY.footD),
      eye: new THREE.SphereGeometry(0.045, 8, 8),
      stunStar: new THREE.TorusGeometry(0.08, 0.02, 4, 8),
      particle: new THREE.SphereGeometry(0.05, 4, 4),
    };
  }

  // ---- Dummy Builder ----
  function createDummy(side) {
    const isPlayer = side === 'left';
    const baseColor = isPlayer ? PLAYER_COLOR : AI_COLOR;
    const darkColor = isPlayer ? PLAYER_DARK : AI_DARK;

    const bodyMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.6, metalness: 0.1 });
    const jointMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.5, metalness: 0.15 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.4, metalness: 0.2 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.3 });
    const lineMat = new THREE.LineBasicMaterial({ color: darkColor, linewidth: 2 });

    const root = new THREE.Group();
    const torsoGroup = new THREE.Group();
    root.add(torsoGroup);

    // Torso
    const torsoMesh = new THREE.Mesh(geom.torso, bodyMat);
    torsoGroup.add(torsoMesh);

    // Center line on torso
    const clGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -BODY.torsoH / 2 + 0.08, BODY.torsoD / 2 + 0.005),
      new THREE.Vector3(0, BODY.torsoH / 2 - 0.08, BODY.torsoD / 2 + 0.005),
    ]);
    const centerLine = new THREE.Line(clGeo, lineMat);
    torsoGroup.add(centerLine);

    // Target circle on torso
    const targetGeo = new THREE.RingGeometry(0.1, 0.12, 16);
    const targetMat = new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const target = new THREE.Mesh(targetGeo, targetMat);
    target.position.z = BODY.torsoD / 2 + 0.005;
    torsoGroup.add(target);

    // Neck
    const neckGroup = new THREE.Group();
    neckGroup.position.y = BODY.torsoH / 2 + BODY.neckHeight / 2;
    const neckMesh = new THREE.Mesh(geom.neck, bodyMat);
    neckGroup.add(neckMesh);
    torsoGroup.add(neckGroup);

    // Head
    const headGroup = new THREE.Group();
    headGroup.position.y = BODY.neckHeight / 2 + BODY.headRadius * 0.85;
    const headMesh = new THREE.Mesh(geom.head, bodyMat);
    headGroup.add(headMesh);
    neckGroup.add(headGroup);

    // Crosshair on head
    const chV = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -BODY.headRadius + 0.06, BODY.headRadius + 0.01),
      new THREE.Vector3(0, BODY.headRadius - 0.06, BODY.headRadius + 0.01),
    ]);
    const chH = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-BODY.headRadius + 0.06, 0, BODY.headRadius + 0.01),
      new THREE.Vector3(BODY.headRadius - 0.06, 0, BODY.headRadius + 0.01),
    ]);
    headGroup.add(new THREE.Line(chV, lineMat));
    headGroup.add(new THREE.Line(chH, lineMat));

    // Eyes
    const leftEye = new THREE.Mesh(geom.eye, eyeMat);
    leftEye.position.set(-0.1, 0.04, BODY.headRadius * 0.88);
    headGroup.add(leftEye);
    const rightEye = new THREE.Mesh(geom.eye, eyeMat);
    rightEye.position.set(0.1, 0.04, BODY.headRadius * 0.88);
    headGroup.add(rightEye);

    // KO X-eyes (hidden by default)
    const koEyeLines = new THREE.Group();
    koEyeLines.visible = false;
    const xSize = 0.06;
    for (const ox of [-0.1, 0.1]) {
      const x1 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ox - xSize, 0.04 - xSize, BODY.headRadius * 0.9),
        new THREE.Vector3(ox + xSize, 0.04 + xSize, BODY.headRadius * 0.9),
      ]);
      const x2 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ox - xSize, 0.04 + xSize, BODY.headRadius * 0.9),
        new THREE.Vector3(ox + xSize, 0.04 - xSize, BODY.headRadius * 0.9),
      ]);
      const xMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 3 });
      koEyeLines.add(new THREE.Line(x1, xMat));
      koEyeLines.add(new THREE.Line(x2, xMat));
    }
    headGroup.add(koEyeLines);

    // Stun stars (hidden by default)
    const stunStars = new THREE.Group();
    stunStars.visible = false;
    stunStars.position.y = BODY.headRadius + 0.15;
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(geom.stunStar, new THREE.MeshBasicMaterial({
        color: 0xFFD700, transparent: true, opacity: 0.8,
      }));
      const angle = (i / 3) * Math.PI * 2;
      star.position.set(Math.cos(angle) * 0.15, 0, Math.sin(angle) * 0.15);
      star.rotation.x = Math.PI / 2;
      stunStars.add(star);
    }
    headGroup.add(stunStars);

    // Mouth "O" (hidden by default)
    const mouthGeo = new THREE.TorusGeometry(0.04, 0.015, 8, 12);
    const mouthMat = new THREE.MeshBasicMaterial({ color: darkColor });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, -0.1, BODY.headRadius * 0.9);
    mouth.visible = false;
    headGroup.add(mouth);

    // ---- Arms ----
    function createArm(sideSign) {
      const shoulderGroup = new THREE.Group();
      shoulderGroup.position.set(
        sideSign * (BODY.torsoW / 2 + BODY.shoulderR * 0.5),
        BODY.torsoH / 2 - 0.1,
        0
      );
      const shoulderJoint = new THREE.Mesh(geom.shoulder, jointMat);
      shoulderGroup.add(shoulderJoint);

      const upperArmGroup = new THREE.Group();
      shoulderGroup.add(upperArmGroup);

      const upperArmMesh = new THREE.Mesh(geom.upperArm, bodyMat);
      upperArmMesh.position.y = -BODY.upperArmLen / 2;
      upperArmGroup.add(upperArmMesh);

      const elbowGroup = new THREE.Group();
      elbowGroup.position.y = -BODY.upperArmLen;
      upperArmGroup.add(elbowGroup);

      const elbowJoint = new THREE.Mesh(geom.elbow, jointMat);
      elbowGroup.add(elbowJoint);

      const forearmGroup = new THREE.Group();
      elbowGroup.add(forearmGroup);

      const forearmMesh = new THREE.Mesh(geom.forearm, bodyMat);
      forearmMesh.position.y = -BODY.forearmLen / 2;
      forearmGroup.add(forearmMesh);

      const gloveMesh = new THREE.Mesh(geom.glove, gloveMat);
      gloveMesh.position.y = -BODY.forearmLen;
      forearmGroup.add(gloveMesh);

      return { shoulderGroup, upperArmGroup, elbowGroup, forearmGroup, gloveMesh };
    }

    const leftArm = createArm(-1);
    torsoGroup.add(leftArm.shoulderGroup);
    const rightArm = createArm(1);
    torsoGroup.add(rightArm.shoulderGroup);

    // ---- Legs ----
    function createLeg(sideSign) {
      const hipGroup = new THREE.Group();
      hipGroup.position.set(sideSign * 0.15, -BODY.torsoH / 2, 0);
      const hipJoint = new THREE.Mesh(geom.hip, jointMat);
      hipGroup.add(hipJoint);

      const upperLegMesh = new THREE.Mesh(geom.upperLeg, bodyMat);
      upperLegMesh.position.y = -BODY.upperLegLen / 2;
      hipGroup.add(upperLegMesh);

      const kneeGroup = new THREE.Group();
      kneeGroup.position.y = -BODY.upperLegLen;
      hipGroup.add(kneeGroup);

      const kneeMesh = new THREE.Mesh(geom.knee, jointMat);
      kneeGroup.add(kneeMesh);

      const lowerLegMesh = new THREE.Mesh(geom.lowerLeg, bodyMat);
      lowerLegMesh.position.y = -BODY.lowerLegLen / 2;
      kneeGroup.add(lowerLegMesh);

      const footMesh = new THREE.Mesh(geom.foot, bodyMat);
      footMesh.position.set(0, -BODY.lowerLegLen / 2 - BODY.footH / 2, BODY.footD * 0.15);
      kneeGroup.add(footMesh);

      return { hipGroup };
    }

    const leftLeg = createLeg(-1);
    torsoGroup.add(leftLeg.hipGroup);
    const rightLeg = createLeg(1);
    torsoGroup.add(rightLeg.hipGroup);

    // Position root so feet are near ground (Y=0)
    const totalHeight = BODY.torsoH + BODY.neckHeight + BODY.headRadius * 2;
    const legHeight = BODY.upperLegLen + BODY.lowerLegLen + BODY.footH;
    root.position.y = legHeight + BODY.torsoH / 2;

    // Face direction
    if (side === 'right') {
      root.rotation.y = Math.PI;
    }

    return {
      root, torsoGroup, headGroup, headMesh,
      leftEye, rightEye, koEyeLines, stunStars, mouth,
      leftArm, rightArm,
      bodyMat, jointMat, gloveMat,
      originalColor: baseColor,
      side,
    };
  }

  // ---- Ring ----
  function createRing() {
    const group = new THREE.Group();

    // Floor
    const floorGeo = new THREE.BoxGeometry(14, 0.1, 12);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0d1117, roughness: 0.9 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.05;
    group.add(floor);

    // Ring canvas/mat
    const matGeo = new THREE.BoxGeometry(10, 0.06, 8);
    const matMaterial = new THREE.MeshStandardMaterial({ color: 0x16213e, roughness: 0.8 });
    const ringMat = new THREE.Mesh(matGeo, matMaterial);
    ringMat.position.y = 0.03;
    group.add(ringMat);

    // Corner posts
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x533483, roughness: 0.5 });
    const corners = [[-5, 0, -4], [5, 0, -4], [-5, 0, 4], [5, 0, 4]];
    corners.forEach(([x, , z]) => {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, 1.1, z);
      group.add(post);
    });

    // Corner pad colors (blue=player, red=ai)
    const padGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const bluePadMat = new THREE.MeshStandardMaterial({ color: PLAYER_COLOR, roughness: 0.6 });
    const redPadMat = new THREE.MeshStandardMaterial({ color: AI_COLOR, roughness: 0.6 });
    [[-5, 1.6, -4], [-5, 1.6, 4]].forEach(p => {
      const pad = new THREE.Mesh(padGeo, bluePadMat);
      pad.position.set(...p);
      group.add(pad);
    });
    [[5, 1.6, -4], [5, 1.6, 4]].forEach(p => {
      const pad = new THREE.Mesh(padGeo, redPadMat);
      pad.position.set(...p);
      group.add(pad);
    });

    // Ropes
    const ropeMat = new THREE.LineBasicMaterial({ color: 0x533483 });
    [0.7, 1.2, 1.7].forEach(h => {
      const pts = [
        new THREE.Vector3(-5, h, -4),
        new THREE.Vector3(5, h, -4),
        new THREE.Vector3(5, h, 4),
        new THREE.Vector3(-5, h, 4),
        new THREE.Vector3(-5, h, -4),
      ];
      const ropeGeo = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.Line(ropeGeo, ropeMat));
    });

    // Center line (dashed)
    const clPts = [new THREE.Vector3(0, 0.07, -3.5), new THREE.Vector3(0, 0.07, 3.5)];
    const clGeo = new THREE.BufferGeometry().setFromPoints(clPts);
    const clMat = new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, dashSize: 0.3, gapSize: 0.5 });
    const cl = new THREE.Line(clGeo, clMat);
    cl.computeLineDistances();
    group.add(cl);

    // Crowd silhouettes (simple dark shapes behind ropes)
    const crowdMat = new THREE.MeshBasicMaterial({ color: 0x080810 });
    for (let x = -4.5; x <= 4.5; x += 0.7) {
      const h = 0.35 + Math.random() * 0.2;
      const crowdGeo = new THREE.SphereGeometry(h, 6, 4);
      const head = new THREE.Mesh(crowdGeo, crowdMat);
      head.position.set(x, 1.8 + Math.random() * 0.3, -4.8);
      head.scale.y = 1.2;
      group.add(head);
      // Back row too
      const head2 = new THREE.Mesh(crowdGeo, crowdMat);
      head2.position.set(x + 0.35, 1.6 + Math.random() * 0.3, 4.8);
      head2.scale.y = 1.2;
      group.add(head2);
    }

    return group;
  }

  // ---- Lighting ----
  function createLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(2, 8, 5);
    scene.add(dirLight);

    // Accent lights at corners
    const accentPositions = [[-5, 3, -4], [5, 3, -4], [-5, 3, 4], [5, 3, 4]];
    accentPositions.forEach(pos => {
      const pl = new THREE.PointLight(0xffffff, 0.25, 15);
      pl.position.set(...pos);
      scene.add(pl);
    });

    // Slight overhead ring light
    const ringLight = new THREE.PointLight(0xffffff, 0.5, 20);
    ringLight.position.set(0, 6, 0);
    scene.add(ringLight);
  }

  // ---- Particle Pool ----
  function initParticlePool() {
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(
        geom.particle,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })
      );
      mesh.visible = false;
      particlePool.push(mesh);
    }
  }

  function getParticleMesh(color) {
    let mesh = particlePool.pop();
    if (!mesh) {
      mesh = new THREE.Mesh(
        geom.particle,
        new THREE.MeshBasicMaterial({ color: color, transparent: true })
      );
    } else {
      mesh.material.color.set(color);
      mesh.material.opacity = 1;
    }
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    scene.add(mesh);
    return mesh;
  }

  function returnParticleMesh(mesh) {
    mesh.visible = false;
    scene.remove(mesh);
    if (particlePool.length < PARTICLE_POOL_SIZE) {
      particlePool.push(mesh);
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.mesh.position.x += p.vx;
      p.mesh.position.y += p.vy;
      p.mesh.position.z += p.vz;
      p.vy -= 0.003;
      p.life -= p.decay;
      const s = Math.max(0, p.life);
      p.mesh.scale.set(s, s, s);
      p.mesh.material.opacity = s;
      if (p.life <= 0) {
        returnParticleMesh(p.mesh);
        particles.splice(i, 1);
      }
    }
  }

  // ---- Pose Updater ----
  function lerp(a, b, t) { return a + (b - a) * t; }

  function updateDummyPose(dummy, fighter) {
    const now = performance.now();

    // Root position from bodyX
    const worldX = (fighter.bodyX - 0.5) * 8 + fighter.swayOffset * 50 + fighter.dodgeOffset * 0.8;
    dummy.root.position.x = worldX;

    // Reset root Y for normal state
    const legHeight = BODY.upperLegLen + BODY.lowerLegLen + BODY.footH;
    let rootY = legHeight + BODY.torsoH / 2;

    // Torso lean for dodge
    let torsoRotZ = -fighter.dodgeOffset * 0.25;
    let torsoRotX = 0;

    // Stun wobble
    if (fighter.state === 'stunned') {
      torsoRotZ += Math.sin(now * 0.015) * 0.15;
      torsoRotX += Math.sin(now * 0.012) * 0.08;
    }

    // Knockdown
    if (fighter.state === 'knockdown') {
      const elapsed = now - (fighter.knockdownEndTime - 3000);
      const progress = Math.min(1, elapsed / 600);
      const eased = 1 - Math.pow(1 - progress, 3); // ease out
      const fallDir = fighter.side === 'left' ? -1 : 1;
      torsoRotX += eased * 0.9;
      torsoRotZ += eased * 0.3 * fallDir;
      rootY -= eased * 0.6;
    }

    // KO
    if (fighter.state === 'ko') {
      const fallDir = fighter.side === 'left' ? -1 : 1;
      torsoRotX = 1.2;
      torsoRotZ = 0.4 * fallDir;
      rootY -= 1.1;
    }

    dummy.root.position.y = rootY;
    dummy.torsoGroup.rotation.z = torsoRotZ;
    dummy.torsoGroup.rotation.x = torsoRotX;

    // ---- Arms ----
    updateArm(dummy.leftArm, fighter.leftArmExtension, fighter.leftArmAngle, fighter.guardHeight, -1, fighter);
    updateArm(dummy.rightArm, fighter.rightArmExtension, fighter.rightArmAngle, fighter.guardHeight, 1, fighter);

    // Hit flash
    const isFlashing = (now - fighter.hitFlashTime) < 100;
    if (isFlashing) {
      dummy.bodyMat.emissive.setHex(0xffffff);
      dummy.bodyMat.emissiveIntensity = 0.7;
      dummy.gloveMat.emissive.setHex(0xffffff);
      dummy.gloveMat.emissiveIntensity = 0.5;
    } else {
      dummy.bodyMat.emissive.setHex(0x000000);
      dummy.bodyMat.emissiveIntensity = 0;
      dummy.gloveMat.emissive.setHex(0x000000);
      dummy.gloveMat.emissiveIntensity = 0;
    }

    // Facial expression
    updateFace(dummy, fighter, now);
  }

  function updateArm(arm, extension, angle, guardHeight, sideSign, fighter) {
    // Eased extension for punchier feel
    const ext = extension;

    // Shoulder rotation
    // Rest: arms hang slightly forward (-0.3 rad from vertical)
    // Extended: arm horizontal toward opponent (-PI/2)
    // Guard: arms raised to face (-PI/2 + 0.4)
    const restPitch = -0.25;
    const extendedPitch = -Math.PI / 2;
    const guardPitch = -Math.PI / 2 + 0.35;

    const basePitch = lerp(restPitch, extendedPitch, ext);
    const pitch = lerp(basePitch, guardPitch, guardHeight);

    // Lateral splay
    const restSplay = sideSign * 0.35;
    const extendedSplay = sideSign * 0.05;
    const guardSplay = sideSign * 0.25;
    const baseSplay = lerp(restSplay, extendedSplay, ext);
    const splay = lerp(baseSplay, guardSplay, guardHeight);

    arm.upperArmGroup.rotation.x = pitch;
    arm.upperArmGroup.rotation.z = splay + angle * 0.4;
    arm.upperArmGroup.rotation.y = angle * 0.3; // hook lateral swing

    // Elbow bend: bent at rest, straight when extended, bent when guard
    const restElbow = Math.PI * 0.55;
    const extElbow = 0.1;
    const guardElbow = Math.PI * 0.5;
    const baseElbow = lerp(restElbow, extElbow, ext);
    const elbow = lerp(baseElbow, guardElbow, guardHeight);
    arm.forearmGroup.rotation.x = elbow;
  }

  function updateFace(dummy, fighter, now) {
    const isHit = (now - fighter.hitFlashTime) < 200;

    if (fighter.state === 'ko') {
      dummy.leftEye.visible = false;
      dummy.rightEye.visible = false;
      dummy.koEyeLines.visible = true;
      dummy.stunStars.visible = false;
      dummy.mouth.visible = false;
    } else if (fighter.state === 'stunned') {
      dummy.leftEye.visible = true;
      dummy.rightEye.visible = true;
      dummy.leftEye.scale.set(1.2, 0.4, 1);
      dummy.rightEye.scale.set(1.2, 0.4, 1);
      dummy.koEyeLines.visible = false;
      dummy.stunStars.visible = true;
      dummy.stunStars.rotation.y = now * 0.004;
      dummy.mouth.visible = false;
    } else if (isHit) {
      dummy.leftEye.visible = true;
      dummy.rightEye.visible = true;
      dummy.leftEye.scale.set(1.4, 0.15, 1);
      dummy.rightEye.scale.set(1.4, 0.15, 1);
      dummy.koEyeLines.visible = false;
      dummy.stunStars.visible = false;
      dummy.mouth.visible = true;
    } else if (fighter.state === 'blocking') {
      dummy.leftEye.visible = true;
      dummy.rightEye.visible = true;
      dummy.leftEye.scale.set(1.1, 0.5, 1);
      dummy.rightEye.scale.set(1.1, 0.5, 1);
      dummy.koEyeLines.visible = false;
      dummy.stunStars.visible = false;
      dummy.mouth.visible = false;
    } else {
      // Neutral
      dummy.leftEye.visible = true;
      dummy.rightEye.visible = true;
      dummy.leftEye.scale.set(1, 1, 1);
      dummy.rightEye.scale.set(1, 1, 1);
      dummy.koEyeLines.visible = false;
      dummy.stunStars.visible = false;
      dummy.mouth.visible = false;
    }
  }

  // ---- Public API ----

  function init(canvasEl) {
    createGeometries();

    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0a0a0f);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 3.2, 7.5);
    camera.lookAt(0, 1.4, 0);
    cameraBasePos = camera.position.clone();

    createLighting();

    ringGroup = createRing();
    scene.add(ringGroup);

    playerDummy = createDummy('left');
    scene.add(playerDummy.root);

    aiDummy = createDummy('right');
    scene.add(aiDummy.root);

    initParticlePool();
    resize();
  }

  function resize() {
    const rect = renderer.domElement.parentElement.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  function render(player, ai) {
    // Screen shake
    if (shakeAmount > 0.5) {
      camera.position.x = cameraBasePos.x + (Math.random() - 0.5) * shakeAmount * 0.04;
      camera.position.y = cameraBasePos.y + (Math.random() - 0.5) * shakeAmount * 0.04;
      camera.lookAt(0, 1.4, 0);
      shakeAmount *= shakeDecay;
    } else {
      if (shakeAmount > 0) {
        camera.position.copy(cameraBasePos);
        camera.lookAt(0, 1.4, 0);
        shakeAmount = 0;
      }
    }

    // Update dummies
    updateDummyPose(playerDummy, player);
    updateDummyPose(aiDummy, ai);

    // Update particles
    updateParticles();

    // Render frame
    renderer.render(scene, camera);
  }

  function triggerShake(amount) {
    shakeAmount = Math.min(shakeAmount + amount, 15);
  }

  function addHitParticles(x, y, color) {
    const rect = renderer.domElement.parentElement.getBoundingClientRect();
    const normX = x / rect.width;
    const worldX = (normX - 0.5) * 8;
    const worldY = 1.8;
    const worldZ = 0;
    const threeColor = new THREE.Color(color);

    for (let i = 0; i < 8; i++) {
      const mesh = getParticleMesh(threeColor);
      mesh.position.set(worldX, worldY, worldZ);
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.03 + Math.random() * 0.07;
      particles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 1.5 + 0.02,
        vz: (Math.random() - 0.5) * speed * 0.8,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
      });
    }
  }

  return { init, resize, render, triggerShake, addHitParticles };
})();
