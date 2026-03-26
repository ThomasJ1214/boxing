// ============================================
// UI / HUD Manager
// Pause, mute, enhanced end screen, 8-count,
// training HUD, guard bars
// ============================================

const UI = (function () {
  'use strict';

  let elements = {};
  let actionTimeout = null;

  function init() {
    elements = {
      playerHealthBar: document.getElementById('player-health-bar'),
      aiHealthBar: document.getElementById('ai-health-bar'),
      playerStaminaBar: document.getElementById('player-stamina-bar'),
      aiStaminaBar: document.getElementById('ai-stamina-bar'),
      playerGuardBar: document.getElementById('player-guard-bar'),
      aiGuardBar: document.getElementById('ai-guard-bar'),
      roundDisplay: document.getElementById('round-display'),
      roundScore: document.getElementById('round-score'),
      timerDisplay: document.getElementById('timer-display'),
      difficultyDisplay: document.getElementById('difficulty-display'),
      fpsDisplay: document.getElementById('fps-display'),
      handsDisplay: document.getElementById('hands-display'),
      actionDisplay: document.getElementById('action-display'),
      loadingOverlay: document.getElementById('loading-overlay'),
      loadingStatus: document.getElementById('loading-status'),
      countdownOverlay: document.getElementById('countdown-overlay'),
      countdownText: document.getElementById('countdown-text'),
      roundOverlay: document.getElementById('round-overlay'),
      roundText: document.getElementById('round-text'),
      pauseOverlay: document.getElementById('pause-overlay'),
      resumeBtn: document.getElementById('resume-btn'),
      pauseMenuBtn: document.getElementById('pause-menu-btn'),
      pauseBtn: document.getElementById('pause-btn'),
      muteBtn: document.getElementById('mute-btn'),
      countOverlay: document.getElementById('count-overlay'),
      countNumber: document.getElementById('count-number'),
      countLabel: document.getElementById('count-label'),
      countHint: document.getElementById('count-hint'),
      endOverlay: document.getElementById('end-overlay'),
      endTitle: document.getElementById('end-title'),
      endMethod: document.getElementById('end-method'),
      endStats: document.getElementById('end-stats'),
      rematchBtn: document.getElementById('rematch-btn'),
      menuBtn: document.getElementById('menu-btn'),
      trainingHud: document.getElementById('training-hud'),
      trainingPunchType: document.getElementById('training-punch-type'),
      trainingPowerBar: document.getElementById('training-power-bar'),
      trainingJabs: document.getElementById('training-jabs'),
      trainingCrosses: document.getElementById('training-crosses'),
      trainingHooks: document.getElementById('training-hooks'),
      trainingUppercuts: document.getElementById('training-uppercuts'),
      trainingQuitBtn: document.getElementById('training-quit-btn'),
    };
  }

  function updateBars(player, ai) {
    elements.playerHealthBar.style.width = `${player.health}%`;
    elements.aiHealthBar.style.width = `${ai.health}%`;
    elements.playerStaminaBar.style.width = `${player.stamina}%`;
    elements.aiStaminaBar.style.width = `${ai.stamina}%`;

    // Guard integrity bars
    elements.playerGuardBar.style.width = `${player.guardIntegrity}%`;
    elements.aiGuardBar.style.width = `${ai.guardIntegrity}%`;

    // Guard bar flicker when low
    if (player.guardIntegrity < 30) {
      elements.playerGuardBar.style.opacity = 0.5 + Math.sin(performance.now() * 0.02) * 0.5;
    } else {
      elements.playerGuardBar.style.opacity = 1;
    }
    if (ai.guardIntegrity < 30) {
      elements.aiGuardBar.style.opacity = 0.5 + Math.sin(performance.now() * 0.02) * 0.5;
    } else {
      elements.aiGuardBar.style.opacity = 1;
    }

    // Color change at low health
    if (player.health < 25) {
      elements.playerHealthBar.style.background = 'linear-gradient(90deg, #FF5722, #FF9800)';
    } else {
      elements.playerHealthBar.style.background = '';
    }
    if (ai.health < 25) {
      elements.aiHealthBar.style.background = 'linear-gradient(90deg, #FF5722, #FF9800)';
    } else {
      elements.aiHealthBar.style.background = '';
    }
  }

  function updateRound(round, totalRounds) {
    elements.roundDisplay.textContent = `ROUND ${round} / ${totalRounds}`;
  }

  function updateRoundScore(playerWins, aiWins) {
    elements.roundScore.textContent = `${playerWins} - ${aiWins}`;
  }

  function updateTimer(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    elements.timerDisplay.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  }

  function updateDifficulty(diff) {
    elements.difficultyDisplay.textContent = diff.toUpperCase();
  }

  function updateTracking(fps, handCount) {
    elements.fpsDisplay.textContent = `FPS: ${fps}`;
    elements.handsDisplay.textContent = `Hands: ${handCount}`;
  }

  function updateMuteButton(isMuted) {
    elements.muteBtn.innerHTML = isMuted ? '&#128263;' : '&#128264;';
  }

  function showAction(text, color) {
    elements.actionDisplay.textContent = text;
    elements.actionDisplay.style.color = color || '#FF9800';
    elements.actionDisplay.classList.add('visible');

    if (actionTimeout) clearTimeout(actionTimeout);
    actionTimeout = setTimeout(() => {
      elements.actionDisplay.classList.remove('visible');
    }, 800);
  }

  function showLoading(show, status) {
    if (show) {
      elements.loadingOverlay.classList.remove('hidden');
      if (status) elements.loadingStatus.textContent = status;
    } else {
      elements.loadingOverlay.classList.add('hidden');
    }
  }

  function showCountdown(number) {
    return new Promise(resolve => {
      elements.countdownOverlay.classList.remove('hidden');
      elements.countdownText.textContent = number;
      elements.countdownText.style.animation = 'none';
      void elements.countdownText.offsetWidth;
      elements.countdownText.style.animation = 'countPulse 0.5s ease-out';
      setTimeout(() => {
        if (number <= 1) {
          elements.countdownOverlay.classList.add('hidden');
        }
        resolve();
      }, 1000);
    });
  }

  function showRoundAnnounce(text) {
    return new Promise(resolve => {
      elements.roundOverlay.classList.remove('hidden');
      elements.roundText.textContent = text;
      setTimeout(() => {
        elements.roundOverlay.classList.add('hidden');
        resolve();
      }, 1500);
    });
  }

  // ---- Pause ----
  function showPause() {
    elements.pauseOverlay.classList.remove('hidden');
  }

  function hidePause() {
    elements.pauseOverlay.classList.add('hidden');
  }

  // ---- Standing 8-count ----
  function showCount(number, label, hint) {
    elements.countOverlay.classList.remove('hidden');
    elements.countNumber.textContent = number;
    elements.countNumber.style.animation = 'none';
    void elements.countNumber.offsetWidth;
    elements.countNumber.style.animation = 'countPulse 0.5s ease-out';
    if (label) elements.countLabel.textContent = label;
    if (hint) elements.countHint.textContent = hint;
  }

  function hideCount() {
    elements.countOverlay.classList.add('hidden');
  }

  // ---- Training HUD ----
  function showTrainingHud() {
    elements.trainingHud.classList.remove('hidden');
  }

  function updateTrainingHud(punchType, power, counts) {
    if (punchType) {
      elements.trainingPunchType.textContent = punchType.toUpperCase();
    }
    if (power !== undefined) {
      elements.trainingPowerBar.style.width = `${Math.round(power * 100)}%`;
    }
    if (counts) {
      elements.trainingJabs.textContent = counts.jab || 0;
      elements.trainingCrosses.textContent = counts.cross || 0;
      elements.trainingHooks.textContent = counts.hook || 0;
      elements.trainingUppercuts.textContent = counts.uppercut || 0;
    }
  }

  // ---- End screen (side-by-side stats) ----
  function showEndScreen(winner, playerStats, aiStats, method, roundScores) {
    elements.endOverlay.classList.remove('hidden');

    if (winner === 'player') {
      elements.endTitle.textContent = 'YOU WIN!';
      elements.endTitle.style.color = '#4CAF50';
    } else if (winner === 'ai') {
      elements.endTitle.textContent = 'YOU LOSE';
      elements.endTitle.style.color = '#F44336';
    } else {
      elements.endTitle.textContent = 'DRAW';
      elements.endTitle.style.color = '#FF9800';
    }

    elements.endMethod.textContent = method || '';

    const pAcc = playerStats.punchesThrown > 0
      ? Math.round((playerStats.punchesLanded / playerStats.punchesThrown) * 100) : 0;
    const aAcc = aiStats.punchesThrown > 0
      ? Math.round((aiStats.punchesLanded / aiStats.punchesThrown) * 100) : 0;

    const roundScoreHtml = roundScores
      ? `<div class="stat-row round-score-row"><span class="stat-label">Round Score</span><span class="stat-value">${roundScores[0]} - ${roundScores[1]}</span></div>` : '';

    elements.endStats.innerHTML = `
      ${roundScoreHtml}
      <div class="stat-row stat-header"><span></span><span class="stat-col-label blue">YOU</span><span class="stat-col-label red">CPU</span></div>
      <div class="stat-row"><span class="stat-label">Punches Thrown</span><span class="stat-value">${playerStats.punchesThrown}</span><span class="stat-value">${aiStats.punchesThrown}</span></div>
      <div class="stat-row"><span class="stat-label">Punches Landed</span><span class="stat-value">${playerStats.punchesLanded}</span><span class="stat-value">${aiStats.punchesLanded}</span></div>
      <div class="stat-row"><span class="stat-label">Accuracy</span><span class="stat-value">${pAcc}%</span><span class="stat-value">${aAcc}%</span></div>
      <div class="stat-row"><span class="stat-label">Damage Dealt</span><span class="stat-value">${Math.round(playerStats.damageDealt)}</span><span class="stat-value">${Math.round(aiStats.damageDealt)}</span></div>
      <div class="stat-row"><span class="stat-label">Blocks</span><span class="stat-value">${playerStats.punchesBlocked || 0}</span><span class="stat-value">${aiStats.punchesBlocked || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Best Combo</span><span class="stat-value">${playerStats.comboBest}x</span><span class="stat-value">${aiStats.comboBest}x</span></div>
      <div class="stat-row"><span class="stat-label">Knockdowns</span><span class="stat-value">${playerStats.knockdowns}</span><span class="stat-value">${aiStats.knockdowns}</span></div>
    `;
  }

  function hideEndScreen() {
    elements.endOverlay.classList.add('hidden');
  }

  function getElements() {
    return elements;
  }

  return {
    init, updateBars, updateRound, updateRoundScore, updateTimer,
    updateDifficulty, updateTracking, updateMuteButton,
    showAction, showLoading, showCountdown, showRoundAnnounce,
    showPause, hidePause,
    showCount, hideCount,
    showTrainingHud, updateTrainingHud,
    showEndScreen, hideEndScreen, getElements,
  };
})();
