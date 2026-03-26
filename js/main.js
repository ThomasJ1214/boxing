// ============================================
// Virtual Boxing - Home Page Logic
// ============================================

(function () {
  'use strict';

  let selectedDifficulty = 'easy';

  // --- Background Canvas Animation ---
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles = [];
    const count = Math.floor((canvas.width * canvas.height) / 15000);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.4,
        dy: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.3 + 0.1,
      });
    }
  }

  function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw a subtle boxing ring outline in the center
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    ctx.strokeStyle = 'rgba(33, 150, 243, 0.04)';
    ctx.lineWidth = 2;
    const ringSize = Math.min(canvas.width, canvas.height) * 0.35;
    ctx.strokeRect(cx - ringSize, cy - ringSize, ringSize * 2, ringSize * 2);

    // Ring ropes
    for (let i = 1; i <= 3; i++) {
      const offset = (ringSize * i) / 3;
      ctx.strokeStyle = `rgba(33, 150, 243, ${0.02 * i})`;
      ctx.strokeRect(cx - ringSize + offset * 0.1, cy - ringSize + offset * 0.1,
        (ringSize - offset * 0.1) * 2, (ringSize - offset * 0.1) * 2);
    }

    // Particles
    for (const p of particles) {
      p.x += p.dx;
      p.y += p.dy;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(33, 150, 243, ${p.alpha})`;
      ctx.fill();
    }

    requestAnimationFrame(drawParticles);
  }

  resizeCanvas();
  createParticles();
  drawParticles();
  window.addEventListener('resize', () => {
    resizeCanvas();
    createParticles();
  });

  // --- Difficulty Selection ---
  const diffButtons = document.querySelectorAll('.difficulty-btn');
  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      diffButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedDifficulty = btn.dataset.difficulty;
    });
  });

  // --- Start Game ---
  const startBtn = document.getElementById('start-btn');
  startBtn.addEventListener('click', () => {
    window.location.href = `game.html?difficulty=${selectedDifficulty}`;
  });
})();
