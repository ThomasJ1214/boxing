// ============================================
// UI / HUD Manager
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
      roundDisplay: document.getElementById('round-display'),
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
      endOverlay: document.getElementById('end-overlay'),
      endTitle: document.getElementById('end-title'),
      endStats: document.getElementById('end-stats'),
      rematchBtn: document.getElementById('rematch-btn'),
      menuBtn: document.getElementById('menu-btn'),
    };
  }

  function updateBars(player, ai) {
    elements.playerHealthBar.style.width = `${player.health}%`;
    elements.aiHealthBar.style.width = `${ai.health}%`;
    elements.playerStaminaBar.style.width = `${player.stamina}%`;
    elements.aiStaminaBar.style.width = `${ai.stamina}%`;

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
      void elements.countdownText.offsetWidth; // trigger reflow
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

  function showEndScreen(winner, playerStats, aiStats) {
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

    const accuracy = playerStats.punchesThrown > 0
      ? Math.round((playerStats.punchesLanded / playerStats.punchesThrown) * 100)
      : 0;

    elements.endStats.innerHTML = `
      <div class="stat-row"><span class="stat-label">Punches Thrown</span><span class="stat-value">${playerStats.punchesThrown}</span></div>
      <div class="stat-row"><span class="stat-label">Punches Landed</span><span class="stat-value">${playerStats.punchesLanded}</span></div>
      <div class="stat-row"><span class="stat-label">Accuracy</span><span class="stat-value">${accuracy}%</span></div>
      <div class="stat-row"><span class="stat-label">Damage Dealt</span><span class="stat-value">${Math.round(playerStats.damageDealt)}</span></div>
      <div class="stat-row"><span class="stat-label">Damage Received</span><span class="stat-value">${Math.round(playerStats.damageReceived)}</span></div>
      <div class="stat-row"><span class="stat-label">Best Combo</span><span class="stat-value">${playerStats.comboBest}x</span></div>
      <div class="stat-row"><span class="stat-label">Knockdowns</span><span class="stat-value">${playerStats.knockdowns}</span></div>
    `;
  }

  function hideEndScreen() {
    elements.endOverlay.classList.add('hidden');
  }

  function getElements() {
    return elements;
  }

  return {
    init,
    updateBars,
    updateRound,
    updateTimer,
    updateDifficulty,
    updateTracking,
    showAction,
    showLoading,
    showCountdown,
    showRoundAnnounce,
    showEndScreen,
    hideEndScreen,
    getElements,
  };
})();
