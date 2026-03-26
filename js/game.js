// ============================================
// Game Orchestrator - Main Game Loop
// ============================================

const Game = (function () {
  'use strict';

  // Game config
  const TOTAL_ROUNDS = 3;
  const ROUND_DURATION = 180; // seconds (3 minutes)
  const BREAK_DURATION = 5;   // seconds between rounds

  let difficulty = 'easy';
  let currentRound = 1;
  let roundTimeLeft = ROUND_DURATION;
  let gameState = 'loading'; // loading, countdown, fighting, round_end, break, match_end
  let lastFrameTime = 0;

  let player = null;
  let ai = null;

  // Track hand data from hand tracking callback
  let currentHandsData = [];
  let currentFps = 0;

  function getDifficulty() {
    const params = new URLSearchParams(window.location.search);
    return params.get('difficulty') || 'easy';
  }

  async function start() {
    difficulty = getDifficulty();

    // Initialize UI
    UI.init();
    UI.updateDifficulty(difficulty);
    UI.showLoading(true, 'Initializing hand tracking...');

    // Create fighters
    player = Fighter.create(true, 'left');
    ai = Fighter.create(false, 'right');

    // Initialize renderer
    const gameCanvas = document.getElementById('game-canvas');
    Renderer.init(gameCanvas);

    // Initialize AI
    AIOpponent.init(ai, difficulty);

    // Initialize hand tracking
    try {
      const videoEl = document.getElementById('webcam');
      const webcamCanvas = document.getElementById('webcam-canvas');
      await HandTracking.init(videoEl, webcamCanvas, onHandTrackingResults);
      UI.showLoading(true, 'Hand tracking ready! Get your fists up!');
    } catch (err) {
      console.error('Hand tracking init failed:', err);
      UI.showLoading(true, 'Camera access failed. Please allow webcam access and reload.');
      return;
    }

    // Ensure audio context is ready
    Audio.ensureContext();

    // Setup end screen buttons
    UI.getElements().rematchBtn.addEventListener('click', rematch);
    UI.getElements().menuBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    // Handle resize
    window.addEventListener('resize', () => Renderer.resize());

    // Small delay then start
    await sleep(1500);
    await startRound();
  }

  function onHandTrackingResults(hands, fps) {
    currentHandsData = hands;
    currentFps = fps;
    UI.updateTracking(fps, hands.length);
  }

  async function startRound() {
    // Reset fighters for new round
    player.resetForRound();
    ai.resetForRound();
    PunchDetection.reset();
    AIOpponent.init(ai, difficulty);

    roundTimeLeft = ROUND_DURATION;
    UI.updateRound(currentRound, TOTAL_ROUNDS);
    UI.updateTimer(roundTimeLeft);

    // Round announcement
    UI.showLoading(false);
    await UI.showRoundAnnounce(`ROUND ${currentRound}`);

    // Countdown
    gameState = 'countdown';
    await UI.showCountdown(3);
    await UI.showCountdown(2);
    await UI.showCountdown(1);
    await UI.showRoundAnnounce('FIGHT!');

    Audio.playBell();

    // Start fighting
    gameState = 'fighting';
    lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function gameLoop(timestamp) {
    if (gameState !== 'fighting') return;

    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05); // cap delta
    lastFrameTime = timestamp;

    // Update round timer
    roundTimeLeft -= dt;
    UI.updateTimer(Math.max(0, roundTimeLeft));

    if (roundTimeLeft <= 0) {
      endRound();
      return;
    }

    // --- Process hand tracking input ---
    const detection = PunchDetection.update(currentHandsData);

    // Player blocking
    player.setBlocking(detection.blocking);

    // Player dodging
    if (detection.dodge) {
      player.dodgeOffset = detection.dodge === 'left' ? -1 : 1;
    } else {
      player.dodgeOffset *= 0.9; // smooth return to center
      if (Math.abs(player.dodgeOffset) < 0.05) player.dodgeOffset = 0;
    }

    // Player punches
    for (const punch of detection.punches) {
      if (player.throwPunch(punch.type, punch.hand, punch.power)) {
        AIOpponent.reactToPlayerPunch(player);
        AIOpponent.recordPlayerPunch(punch.type);
      }
    }

    // Map hand positions to player arm rendering
    if (detection.handPositions.Left) {
      const lp = detection.handPositions.Left;
      player.leftArmExtension = Math.max(player.leftArmExtension,
        (0.5 - lp.y) * 1.5); // higher hand = more extension visual
    }
    if (detection.handPositions.Right) {
      const rp = detection.handPositions.Right;
      player.rightArmExtension = Math.max(player.rightArmExtension,
        (0.5 - rp.y) * 1.5);
    }

    // --- Update AI ---
    AIOpponent.update(dt, player);

    // --- Update fighters ---
    player.update(dt);
    ai.update(dt);

    // --- Physics / hit detection ---
    const hits = Physics.processFrame(player, ai);

    if (hits.playerHit) {
      handleHit(hits.playerHit, 'player');
    }
    if (hits.aiHit) {
      handleHit(hits.aiHit, 'ai');
    }

    // --- Check for KO ---
    if (ai.state === 'ko') {
      endRound('player_ko');
      return;
    }
    if (player.state === 'ko') {
      endRound('ai_ko');
      return;
    }

    // --- Render ---
    Renderer.render(player, ai);

    // --- Update HUD ---
    UI.updateBars(player, ai);

    requestAnimationFrame(gameLoop);
  }

  function handleHit(hit, attacker) {
    if (hit.blocked) {
      Audio.playBlock();
      UI.showAction('BLOCKED', '#888');
    } else {
      Audio.playPunchHit(Math.min(1, hit.damage / 20));

      const actionText = hit.type.toUpperCase() + '!';
      const actionColor = attacker === 'player' ? '#4FC3F7' : '#EF5350';
      UI.showAction(actionText, actionColor);

      // Screen shake based on damage
      Renderer.triggerShake(hit.damage * 0.5);

      // Particles
      const target = attacker === 'player' ? ai : player;
      const px = target.bodyX * document.getElementById('game-canvas').parentElement.offsetWidth;
      const py = document.getElementById('game-canvas').parentElement.offsetHeight * 0.45;
      Renderer.addHitParticles(px, py, attacker === 'player' ? '#4FC3F7' : '#EF5350');

      // Combo display
      const fighter = attacker === 'player' ? player : ai;
      if (fighter.comboCount >= 2) {
        Audio.playCombo(fighter.comboCount);
        setTimeout(() => {
          UI.showAction(`${fighter.comboCount}x COMBO!`, '#FF9800');
        }, 200);
      }
    }

    if (hit.knockdown) {
      Audio.playKO();
      Renderer.triggerShake(15);
      UI.showAction('KNOCKDOWN!', '#FF5722');
    }

    if (hit.ko) {
      Audio.playKO();
      Renderer.triggerShake(20);
    }
  }

  async function endRound(reason) {
    gameState = 'round_end';
    Audio.playBell();

    if (reason === 'player_ko') {
      await UI.showRoundAnnounce('KNOCKOUT!');
      endMatch('player');
      return;
    }

    if (reason === 'ai_ko') {
      await UI.showRoundAnnounce('KNOCKOUT!');
      endMatch('ai');
      return;
    }

    // Round ended by time
    if (currentRound >= TOTAL_ROUNDS) {
      // Decide winner by health
      let winner;
      if (player.health > ai.health) winner = 'player';
      else if (ai.health > player.health) winner = 'ai';
      else winner = 'draw';

      await UI.showRoundAnnounce('TIME!');
      endMatch(winner);
      return;
    }

    // Break between rounds
    await UI.showRoundAnnounce(`END OF ROUND ${currentRound}`);

    // Show brief tip
    const tips = [
      'Keep your hands up!',
      'Try mixing up your punches!',
      'Watch for openings after blocking!',
      'Uppercuts deal the most damage!',
      'Land combos for bonus damage!',
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];
    await UI.showRoundAnnounce(tip);

    currentRound++;
    await startRound();
  }

  function endMatch(winner) {
    gameState = 'match_end';

    if (winner === 'player') {
      Audio.playKO();
    }

    UI.showEndScreen(winner, player.stats, ai.stats);
  }

  async function rematch() {
    UI.hideEndScreen();
    currentRound = 1;
    player.resetStats();
    ai.resetStats();
    await startRound();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Auto-start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  return { start };
})();
