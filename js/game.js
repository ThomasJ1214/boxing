// ============================================
// Game Orchestrator - Main Game Loop
// Round scoring, pause, standing 8-count,
// training mode, miss audio, persistent stats
// ============================================

const Game = (function () {
  'use strict';

  const TOTAL_ROUNDS = 3;
  const ROUND_DURATION = 180;

  let difficulty = 'easy';
  let gameMode = 'fight'; // 'fight' or 'training'
  let currentRound = 1;
  let roundTimeLeft = ROUND_DURATION;
  let gameState = 'loading';
  let lastFrameTime = 0;

  let player = null;
  let ai = null;

  // Double-buffered hand data
  let pendingHandsData = [];
  let currentHandsData = [];
  let handDataFresh = false;
  let currentFps = 0;

  // Round scoring
  let roundScores = [0, 0]; // [player wins, AI wins]
  let winMethod = '';

  // Standing 8-count
  let knockdownTarget = null; // 'player' or 'ai'
  let knockdownCount = 0;
  let knockdownCountTimer = 0;
  const COUNT_INTERVAL = 1000; // 1 second per count

  // Training mode stats
  let trainingCounts = { jab: 0, cross: 0, hook: 0, uppercut: 0 };

  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      difficulty: params.get('difficulty') || 'easy',
      mode: params.get('mode') || 'fight',
    };
  }

  async function start() {
    const params = getParams();
    difficulty = params.difficulty;
    gameMode = params.mode;

    UI.init();
    UI.updateDifficulty(difficulty);
    UI.showLoading(true, 'Initializing hand tracking...');

    // Load mute state
    Audio.loadMuteState();
    UI.updateMuteButton(Audio.muted);

    // Create fighters
    player = Fighter.create(true, 'left');
    ai = Fighter.create(false, 'right');

    // Initialize renderer
    const gameCanvas = document.getElementById('game-canvas');
    Renderer.init(gameCanvas);

    // Initialize AI
    AIOpponent.init(ai, difficulty);

    // Hand tracking
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

    Audio.ensureContext();

    // Setup buttons
    UI.getElements().rematchBtn.addEventListener('click', rematch);
    UI.getElements().menuBtn.addEventListener('click', goToMenu);
    UI.getElements().resumeBtn.addEventListener('click', resumeGame);
    UI.getElements().pauseMenuBtn.addEventListener('click', goToMenu);
    UI.getElements().pauseBtn.addEventListener('click', togglePause);
    UI.getElements().muteBtn.addEventListener('click', toggleMute);

    if (UI.getElements().trainingQuitBtn) {
      UI.getElements().trainingQuitBtn.addEventListener('click', goToMenu);
    }

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') togglePause();
    });

    // Resize
    window.addEventListener('resize', () => Renderer.resize());

    await sleep(1500);

    if (gameMode === 'training') {
      startTraining();
    } else {
      await startRound();
    }
  }

  function goToMenu() {
    Audio.stopCrowd();
    window.location.href = 'index.html';
  }

  function onHandTrackingResults(hands, fps) {
    pendingHandsData = hands;
    handDataFresh = true;
    currentFps = fps;
    UI.updateTracking(fps, hands.length);
  }

  // ---- Fight Mode ----

  async function startRound() {
    player.resetForRound();
    ai.resetForRound();
    PunchDetection.reset();
    AIOpponent.init(ai, difficulty);

    roundTimeLeft = ROUND_DURATION;
    UI.updateRound(currentRound, TOTAL_ROUNDS);
    UI.updateRoundScore(roundScores[0], roundScores[1]);
    UI.updateTimer(roundTimeLeft);

    UI.showLoading(false);
    await UI.showRoundAnnounce(`ROUND ${currentRound}`);

    gameState = 'countdown';
    await UI.showCountdown(3);
    await UI.showCountdown(2);
    await UI.showCountdown(1);
    await UI.showRoundAnnounce('FIGHT!');

    Audio.playBell();
    Audio.startCrowd();

    gameState = 'fighting';
    lastFrameTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function gameLoop(timestamp) {
    if (gameState === 'paused') return;
    if (gameState !== 'fighting' && gameState !== 'knockdown_count') return;

    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
    lastFrameTime = timestamp;

    // Crowd ambient
    Audio.updateCrowd();

    if (gameState === 'knockdown_count') {
      updateKnockdownCount(timestamp);
      Renderer.render(player, ai);
      UI.updateBars(player, ai);
      requestAnimationFrame(gameLoop);
      return;
    }

    // Update round timer
    roundTimeLeft -= dt;
    UI.updateTimer(Math.max(0, roundTimeLeft));
    if (roundTimeLeft <= 0) {
      endRound();
      return;
    }

    // Swap hand tracking buffer
    if (handDataFresh) {
      currentHandsData = pendingHandsData;
      handDataFresh = false;
    }

    // Process hand tracking
    const detection = PunchDetection.update(currentHandsData);

    player.setBlocking(detection.blocking);

    if (detection.dodge) {
      player.dodgeOffset = detection.dodge === 'left' ? -1 : 1;
    } else {
      player.dodgeOffset *= 0.9;
      if (Math.abs(player.dodgeOffset) < 0.05) player.dodgeOffset = 0;
    }

    for (const punch of detection.punches) {
      if (player.throwPunch(punch.type, punch.hand, punch.power)) {
        AIOpponent.reactToPlayerPunch(player);
        AIOpponent.recordPlayerPunch(punch.type);
      }
    }

    // Arm position mapping
    if (detection.handPositions.Left) {
      const lp = detection.handPositions.Left;
      const targetExt = Math.max(0, (0.5 - lp.y) * 1.5);
      player.leftArmExtension += (targetExt - player.leftArmExtension) * 0.3;
    } else {
      player.leftArmExtension *= 0.85;
    }
    if (detection.handPositions.Right) {
      const rp = detection.handPositions.Right;
      const targetExt = Math.max(0, (0.5 - rp.y) * 1.5);
      player.rightArmExtension += (targetExt - player.rightArmExtension) * 0.3;
    } else {
      player.rightArmExtension *= 0.85;
    }

    // Update AI
    AIOpponent.update(dt, player);

    // Update fighters
    player.update(dt);
    ai.update(dt);

    // Physics
    const hits = Physics.processFrame(player, ai);

    if (hits.playerHit) handleHit(hits.playerHit, 'player');
    if (hits.aiHit) handleHit(hits.aiHit, 'ai');
    if (hits.playerMiss) Audio.playPunchMiss();
    if (hits.aiMiss) Audio.playPunchMiss();

    // Check KO
    if (ai.state === 'ko') {
      endRound('player_ko');
      return;
    }
    if (player.state === 'ko') {
      endRound('ai_ko');
      return;
    }

    // Check knockdown → standing 8-count
    if (ai.state === 'knockdown' && knockdownTarget !== 'ai') {
      startKnockdownCount('ai');
    }
    if (player.state === 'knockdown' && knockdownTarget !== 'player') {
      startKnockdownCount('player');
    }

    Renderer.render(player, ai);
    UI.updateBars(player, ai);

    requestAnimationFrame(gameLoop);
  }

  function handleHit(hit, attacker) {
    if (hit.blocked) {
      Audio.playBlock();
      UI.showAction('BLOCKED', '#888');
    } else {
      Audio.playPunchHit(Math.min(1, hit.damage / 20), hit.type);

      const actionText = hit.type.toUpperCase() + '!';
      const actionColor = attacker === 'player' ? '#4FC3F7' : '#EF5350';
      UI.showAction(actionText, actionColor);

      Renderer.triggerShake(hit.damage * 0.5);

      const target = attacker === 'player' ? ai : player;
      const px = target.bodyX * document.getElementById('game-canvas').parentElement.offsetWidth;
      const py = document.getElementById('game-canvas').parentElement.offsetHeight * 0.45;
      Renderer.addHitParticles(px, py, attacker === 'player' ? '#4FC3F7' : '#EF5350');

      const fighter = attacker === 'player' ? player : ai;
      if (fighter.comboCount >= 2) {
        Audio.playCombo(fighter.comboCount);
        setTimeout(() => {
          UI.showAction(`${fighter.comboCount}x COMBO!`, '#FF9800');
        }, 200);
      }
    }

    if (hit.guardBroken) {
      Audio.playGuardBreak();
      UI.showAction('GUARD BREAK!', '#FF5722');
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

  // ---- Standing 8-Count ----

  function startKnockdownCount(target) {
    knockdownTarget = target;
    knockdownCount = 0;
    knockdownCountTimer = performance.now();
    gameState = 'knockdown_count';

    const label = target === 'player' ? 'YOU\'RE DOWN!' : 'KNOCKDOWN!';
    const hint = target === 'player' ? 'Raise both hands to get up!' : '';
    UI.showCount(0, label, hint);
  }

  function updateKnockdownCount(timestamp) {
    const elapsed = timestamp - knockdownCountTimer;
    const newCount = Math.floor(elapsed / COUNT_INTERVAL) + 1;

    if (newCount > knockdownCount && newCount <= 10) {
      knockdownCount = newCount;
      UI.showCount(knockdownCount, null, null);
      Audio.playCount(knockdownCount);
    }

    // Check recovery
    if (knockdownTarget === 'player' && knockdownCount < 8) {
      // Player recovers by raising both hands
      if (handDataFresh) {
        currentHandsData = pendingHandsData;
        handDataFresh = false;
      }
      const detection = PunchDetection.update(currentHandsData);
      if (detection.blocking) {
        recoverFromKnockdown('player');
        return;
      }
    } else if (knockdownTarget === 'ai' && knockdownCount >= 3) {
      // AI recovery based on health
      const fighter = ai;
      if (AIOpponent.shouldRecoverFromKnockdown(fighter.health)) {
        recoverFromKnockdown('ai');
        return;
      }
    }

    // Count reached 10 = TKO
    if (knockdownCount >= 10) {
      UI.hideCount();
      knockdownTarget = null;
      const winner = knockdownTarget === 'player' ? 'ai' : 'player';
      // The target was knocked out by count
      if (knockdownTarget === 'player') {
        player.health = 0;
        player.state = 'ko';
      } else {
        ai.health = 0;
        ai.state = 'ko';
      }
      winMethod = 'TKO (Count Out)';
      endRound(winner === 'player' ? 'player_ko' : 'ai_ko');
    }
  }

  function recoverFromKnockdown(target) {
    UI.hideCount();
    const fighter = target === 'player' ? player : ai;
    fighter.state = 'idle';
    fighter.health = Math.max(fighter.health, 15);
    knockdownTarget = null;
    gameState = 'fighting';
  }

  // ---- Round End / Match End ----

  async function endRound(reason) {
    gameState = 'round_end';

    if (reason === 'player_ko') {
      Audio.playKOBell();
      winMethod = winMethod || 'KO';
      await UI.showRoundAnnounce('KNOCKOUT!');
      endMatch('player');
      return;
    }

    if (reason === 'ai_ko') {
      Audio.playKOBell();
      winMethod = winMethod || 'KO';
      await UI.showRoundAnnounce('KNOCKOUT!');
      endMatch('ai');
      return;
    }

    // Round ended by time - record round winner
    Audio.playBell();
    if (player.health > ai.health) {
      roundScores[0]++;
    } else if (ai.health > player.health) {
      roundScores[1]++;
    }
    // Draw round: no one gets a point

    UI.updateRoundScore(roundScores[0], roundScores[1]);

    if (currentRound >= TOTAL_ROUNDS) {
      let winner;
      if (roundScores[0] > roundScores[1]) winner = 'player';
      else if (roundScores[1] > roundScores[0]) winner = 'ai';
      else {
        // Tiebreak: total health remaining
        if (player.health > ai.health) winner = 'player';
        else if (ai.health > player.health) winner = 'ai';
        else winner = 'draw';
      }
      winMethod = 'Decision';
      await UI.showRoundAnnounce('TIME!');
      endMatch(winner);
      return;
    }

    await UI.showRoundAnnounce(`END OF ROUND ${currentRound}`);

    const tips = [
      'Keep your hands up!',
      'Try mixing up your punches!',
      'Watch for openings after blocking!',
      'Uppercuts deal the most damage!',
      'Land combos for bonus damage!',
      'Hooks bypass blocks partially!',
      'Don\'t turtle - your guard will break!',
    ];
    const tip = tips[Math.floor(Math.random() * tips.length)];
    await UI.showRoundAnnounce(tip);

    currentRound++;
    await startRound();
  }

  function endMatch(winner) {
    gameState = 'match_end';
    Audio.stopCrowd();

    if (winner === 'player') {
      Audio.playKO();
    }

    UI.showEndScreen(winner, player.stats, ai.stats, winMethod, roundScores);

    // Save persistent stats
    saveStats(winner);
  }

  // ---- Pause ----

  function togglePause() {
    if (gameState === 'fighting') {
      gameState = 'paused';
      UI.showPause();
    } else if (gameState === 'paused') {
      resumeGame();
    }
  }

  function resumeGame() {
    if (gameState !== 'paused') return;
    UI.hidePause();
    gameState = 'fighting';
    lastFrameTime = performance.now(); // prevent time jump
    requestAnimationFrame(gameLoop);
  }

  // ---- Mute ----

  function toggleMute() {
    const isMuted = Audio.toggleMute();
    Audio.saveMuteState();
    UI.updateMuteButton(isMuted);
  }

  // ---- Training Mode ----

  function startTraining() {
    UI.showLoading(false);
    UI.showTrainingHud();
    trainingCounts = { jab: 0, cross: 0, hook: 0, uppercut: 0 };

    // AI stands still
    ai.state = 'idle';

    gameState = 'fighting';
    lastFrameTime = performance.now();
    requestAnimationFrame(trainingLoop);
  }

  function trainingLoop(timestamp) {
    if (gameState !== 'fighting') return;

    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
    lastFrameTime = timestamp;

    if (handDataFresh) {
      currentHandsData = pendingHandsData;
      handDataFresh = false;
    }

    const detection = PunchDetection.update(currentHandsData);

    // Arm mapping
    if (detection.handPositions.Left) {
      const lp = detection.handPositions.Left;
      const targetExt = Math.max(0, (0.5 - lp.y) * 1.5);
      player.leftArmExtension += (targetExt - player.leftArmExtension) * 0.3;
    } else {
      player.leftArmExtension *= 0.85;
    }
    if (detection.handPositions.Right) {
      const rp = detection.handPositions.Right;
      const targetExt = Math.max(0, (0.5 - rp.y) * 1.5);
      player.rightArmExtension += (targetExt - player.rightArmExtension) * 0.3;
    } else {
      player.rightArmExtension *= 0.85;
    }

    for (const punch of detection.punches) {
      player.throwPunch(punch.type, punch.hand, punch.power);
      Audio.playPunchHit(punch.power, punch.type);
      trainingCounts[punch.type] = (trainingCounts[punch.type] || 0) + 1;
      UI.updateTrainingHud(punch.type, punch.power, trainingCounts);

      // Visual feedback
      Renderer.triggerShake(punch.power * 3);
      const px = ai.bodyX * document.getElementById('game-canvas').parentElement.offsetWidth;
      const py = document.getElementById('game-canvas').parentElement.offsetHeight * 0.45;
      Renderer.addHitParticles(px, py, '#4FC3F7');
    }

    player.update(dt);
    ai.update(dt);

    Renderer.render(player, ai);

    requestAnimationFrame(trainingLoop);
  }

  // ---- Persistent Stats ----

  function saveStats(winner) {
    try {
      const stored = JSON.parse(localStorage.getItem('virtualBoxing_stats') || '{}');
      stored.totalFights = (stored.totalFights || 0) + 1;
      stored.totalPunchesThrown = (stored.totalPunchesThrown || 0) + player.stats.punchesThrown;
      stored.totalPunchesLanded = (stored.totalPunchesLanded || 0) + player.stats.punchesLanded;
      stored.bestCombo = Math.max(stored.bestCombo || 0, player.stats.comboBest);

      if (winner === 'player') {
        stored.wins = (stored.wins || 0) + 1;
        if (winMethod.includes('KO') || winMethod.includes('TKO')) {
          stored.kos = (stored.kos || 0) + 1;
        }
      } else if (winner === 'ai') {
        stored.losses = (stored.losses || 0) + 1;
      } else {
        stored.draws = (stored.draws || 0) + 1;
      }

      localStorage.setItem('virtualBoxing_stats', JSON.stringify(stored));
    } catch (e) {
      // localStorage not available
    }
  }

  // ---- Rematch ----

  async function rematch() {
    UI.hideEndScreen();
    currentRound = 1;
    roundScores = [0, 0];
    winMethod = '';
    player.resetStats();
    ai.resetStats();
    await startRound();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  return { start };
})();
