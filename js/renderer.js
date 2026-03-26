// ============================================
// Renderer - Crash Test Dummies & Ring
// ============================================

const Renderer = (function () {
  'use strict';

  let canvas, ctx, w, h;
  let particles = [];
  let shakeAmount = 0;
  let shakeDecay = 0.9;

  const COLORS = {
    player: {
      body: '#2196F3',
      bodyDark: '#1565C0',
      bodyLight: '#64B5F6',
      glove: '#1565C0',
      target: '#90CAF9',
    },
    ai: {
      body: '#F44336',
      bodyDark: '#C62828',
      bodyLight: '#EF9A9A',
      glove: '#C62828',
      target: '#FFCDD2',
    },
  };

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    w = canvas.width;
    h = canvas.height;
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    w = rect.width;
    h = rect.height;
  }

  function triggerShake(amount) {
    shakeAmount = Math.min(shakeAmount + amount, 15);
  }

  function addHitParticles(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
        size: 2 + Math.random() * 4,
        color: color,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // gravity
      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRing() {
    // Floor
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Ring canvas/mat
    const ringTop = h * 0.35;
    const ringBottom = h * 0.95;
    const ringLeft = w * 0.05;
    const ringRight = w * 0.95;

    // Perspective floor
    ctx.fillStyle = '#16213e';
    ctx.beginPath();
    ctx.moveTo(ringLeft + 40, ringTop);
    ctx.lineTo(ringRight - 40, ringTop);
    ctx.lineTo(ringRight, ringBottom);
    ctx.lineTo(ringLeft, ringBottom);
    ctx.closePath();
    ctx.fill();

    // Ring border
    ctx.strokeStyle = '#0f3460';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 10]);
    ctx.beginPath();
    ctx.moveTo(w / 2, ringTop + 20);
    ctx.lineTo(w / 2, ringBottom - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ropes (3 horizontal lines on each side)
    const ropeColors = ['#533483', '#2b2d42', '#1a1a2e'];
    for (let i = 0; i < 3; i++) {
      const y = ringTop + (i + 1) * 25;
      ctx.strokeStyle = ropeColors[i];
      ctx.lineWidth = 3 - i;
      ctx.beginPath();
      ctx.moveTo(ringLeft + 30, y);
      ctx.lineTo(ringRight - 30, y);
      ctx.stroke();
    }

    // Corner posts
    const posts = [
      { x: ringLeft + 30, y: ringTop },
      { x: ringRight - 30, y: ringTop },
    ];
    for (const post of posts) {
      ctx.fillStyle = '#533483';
      ctx.fillRect(post.x - 4, post.y - 10, 8, ringTop + 80 - post.y + 10);
    }
  }

  function drawDummy(fighter, colors, facingDir) {
    const now = performance.now();
    const cx = fighter.bodyX * w + fighter.swayOffset * w + fighter.dodgeOffset * 40;
    const baseY = h * 0.55;

    // Hit flash
    const isFlashing = (now - fighter.hitFlashTime) < 100;
    const flashColor = isFlashing ? '#FFFFFF' : null;

    // Knockdown animation
    let knockdownAngle = 0;
    if (fighter.state === 'knockdown') {
      const progress = Math.min(1, (now - (fighter.knockdownEndTime - 3000)) / 500);
      knockdownAngle = progress * 0.5 * (fighter.side === 'left' ? -1 : 1);
    }
    if (fighter.state === 'ko') {
      knockdownAngle = 0.6 * (fighter.side === 'left' ? -1 : 1);
    }

    ctx.save();
    ctx.translate(cx, baseY);
    ctx.rotate(knockdownAngle);

    const scale = 0.85;
    const s = (val) => val * scale;

    // --- Body parts ---
    const bodyColor = flashColor || colors.body;
    const darkColor = flashColor || colors.bodyDark;
    const lightColor = flashColor || colors.bodyLight;

    // Torso
    const torsoW = s(50);
    const torsoH = s(70);
    ctx.fillStyle = bodyColor;
    roundRect(ctx, -torsoW / 2, -torsoH / 2, torsoW, torsoH, 10);
    ctx.fill();

    // Center line on torso
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -torsoH / 2 + 8);
    ctx.lineTo(0, torsoH / 2 - 8);
    ctx.stroke();

    // Target circles on torso
    ctx.strokeStyle = colors.target;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, s(12), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -s(18), s(8), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Neck
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-s(8), -torsoH / 2 - s(15), s(16), s(18));

    // Head
    const headY = -torsoH / 2 - s(45);
    const headR = s(25);
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Head crosshair (crash test dummy signature)
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 2.5;
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(0, headY - headR + 5);
    ctx.lineTo(0, headY + headR - 5);
    ctx.stroke();
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(-headR + 5, headY);
    ctx.lineTo(headR - 5, headY);
    ctx.stroke();

    // Eyes (small circles at crosshair intersection area)
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.arc(-s(8), headY - s(3), s(3), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(s(8), headY - s(3), s(3), 0, Math.PI * 2);
    ctx.fill();

    // --- Arms ---
    const shoulderY = -torsoH / 2 + s(8);
    const shoulderSpread = torsoW / 2 + s(5);
    const upperArmLen = s(35);
    const forearmLen = s(35);
    const gloveR = s(16);
    const dir = facingDir; // 1 = facing right, -1 = facing left

    // Left arm
    drawArm(ctx, -shoulderSpread, shoulderY,
      fighter.leftArmExtension, fighter.leftArmAngle, fighter.guardHeight,
      upperArmLen, forearmLen, gloveR, -1, dir, bodyColor, darkColor, colors.glove);

    // Right arm
    drawArm(ctx, shoulderSpread, shoulderY,
      fighter.rightArmExtension, fighter.rightArmAngle, fighter.guardHeight,
      upperArmLen, forearmLen, gloveR, 1, dir, bodyColor, darkColor, colors.glove);

    // --- Legs (simple) ---
    ctx.fillStyle = darkColor;
    ctx.fillRect(-s(15), torsoH / 2, s(12), s(45));
    ctx.fillRect(s(3), torsoH / 2, s(12), s(45));

    // Feet
    ctx.fillStyle = bodyColor;
    roundRect(ctx, -s(18), torsoH / 2 + s(42), s(18), s(10), 3);
    ctx.fill();
    roundRect(ctx, s(0), torsoH / 2 + s(42), s(18), s(10), 3);
    ctx.fill();

    ctx.restore();
  }

  function drawArm(ctx, shoulderX, shoulderY, extension, angle, guard,
    upperLen, foreLen, gloveR, side, faceDir, bodyColor, darkColor, gloveColor) {

    // Arm bends outward at rest, extends forward when punching
    const restAngle = side * 0.4; // slight outward angle at rest
    const guardLift = guard * -20; // raise hands when blocking

    // Elbow position
    const elbowAngle = restAngle + angle;
    const elbowX = shoulderX + Math.sin(elbowAngle) * upperLen * (0.3 + extension * 0.2) * faceDir;
    const elbowY = shoulderY + upperLen * 0.5 + guardLift * 0.5;

    // Hand/glove position
    const handExtend = extension;
    const handX = elbowX + faceDir * foreLen * handExtend * 0.8;
    const handY = elbowY + foreLen * 0.2 * (1 - handExtend) + guardLift;

    // Upper arm
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.stroke();

    // Elbow joint
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.arc(elbowX, elbowY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Forearm
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    // Glove
    ctx.fillStyle = gloveColor;
    ctx.beginPath();
    ctx.arc(handX, handY, gloveR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glove detail line
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(handX, handY, gloveR * 0.6, -0.5, 0.5);
    ctx.stroke();

    // Shoulder joint
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.arc(shoulderX, shoulderY, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function render(player, ai) {
    // Apply screen shake
    ctx.save();
    if (shakeAmount > 0.5) {
      const sx = (Math.random() - 0.5) * shakeAmount;
      const sy = (Math.random() - 0.5) * shakeAmount;
      ctx.translate(sx, sy);
      shakeAmount *= shakeDecay;
    } else {
      shakeAmount = 0;
    }

    drawRing();

    // Draw AI (back, slightly smaller feel)
    drawDummy(ai, COLORS.ai, -1);

    // Draw player (front)
    drawDummy(player, COLORS.player, 1);

    // Particles on top
    updateParticles();
    drawParticles();

    ctx.restore();
  }

  return { init, resize, render, triggerShake, addHitParticles };
})();
