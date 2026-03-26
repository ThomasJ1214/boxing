// ============================================
// AI Opponent - Behavior per difficulty level
// ============================================

const AIOpponent = (function () {
  'use strict';

  const DIFFICULTY_CONFIG = {
    easy: {
      attackInterval: [2000, 3000],     // ms between attacks
      blockChance: 0.10,                // chance to block incoming
      comboChance: 0.0,                 // chance for multi-hit combo
      maxCombo: 1,
      counterChance: 0.0,              // chance to counter after blocking
      dodgeChance: 0.0,
      windupTime: 500,                 // telegraph time before punch
      reactionTime: 800,               // ms to react to player punch
      punchTypes: ['jab'],             // available punches
      aggression: 0.3,
      patternMemory: 0,
    },
    medium: {
      attackInterval: [1200, 2000],
      blockChance: 0.30,
      comboChance: 0.20,
      maxCombo: 2,
      counterChance: 0.15,
      dodgeChance: 0.10,
      windupTime: 300,
      reactionTime: 500,
      punchTypes: ['jab', 'cross', 'hook'],
      aggression: 0.5,
      patternMemory: 0,
    },
    hard: {
      attackInterval: [600, 1500],
      blockChance: 0.50,
      comboChance: 0.40,
      maxCombo: 3,
      counterChance: 0.35,
      dodgeChance: 0.25,
      windupTime: 150,
      reactionTime: 300,
      punchTypes: ['jab', 'cross', 'hook', 'uppercut'],
      aggression: 0.7,
      patternMemory: 10,
    },
    insane: {
      attackInterval: [300, 1000],
      blockChance: 0.70,
      comboChance: 0.60,
      maxCombo: 5,
      counterChance: 0.60,
      dodgeChance: 0.40,
      windupTime: 50,
      reactionTime: 150,
      punchTypes: ['jab', 'cross', 'hook', 'uppercut'],
      aggression: 0.9,
      patternMemory: 20,
    },
  };

  let config = null;
  let fighter = null;
  let state = 'idle'; // idle, winding_up, attacking, blocking, recovering
  let nextAttackTime = 0;
  let windupEndTime = 0;
  let blockEndTime = 0;
  let pendingCombo = 0;
  let comboDelay = 0;

  // Pattern tracking (player's last punches)
  let playerPunchHistory = [];

  function init(aiFighter, difficulty) {
    config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;
    fighter = aiFighter;
    state = 'idle';
    nextAttackTime = performance.now() + randomInRange(config.attackInterval);
    playerPunchHistory = [];
  }

  function randomInRange(range) {
    return range[0] + Math.random() * (range[1] - range[0]);
  }

  function pickPunchType() {
    // If we have pattern memory, try to exploit player tendencies
    if (config.patternMemory > 0 && playerPunchHistory.length >= 5) {
      // If player punches a lot, go for counter timing
      const recentPunches = playerPunchHistory.slice(-config.patternMemory);
      const jabCount = recentPunches.filter(p => p === 'jab').length;

      // If player jabs a lot, use hooks to get around guard
      if (jabCount / recentPunches.length > 0.5) {
        if (config.punchTypes.includes('hook')) return 'hook';
      }
    }

    return config.punchTypes[Math.floor(Math.random() * config.punchTypes.length)];
  }

  function recordPlayerPunch(type) {
    playerPunchHistory.push(type);
    if (playerPunchHistory.length > 30) {
      playerPunchHistory.shift();
    }
  }

  function reactToPlayerPunch(playerFighter) {
    if (state === 'blocking' || state === 'attacking') return;

    // Decide to block
    if (Math.random() < config.blockChance) {
      fighter.setBlocking(true);
      state = 'blocking';
      blockEndTime = performance.now() + 400 + Math.random() * 300;

      // Counter-attack after block
      if (Math.random() < config.counterChance) {
        blockEndTime = performance.now() + 200;
        pendingCombo = 1;
      }
    }

    // Decide to dodge
    if (Math.random() < config.dodgeChance && state !== 'blocking') {
      fighter.dodgeOffset = Math.random() < 0.5 ? -1 : 1;
      setTimeout(() => { fighter.dodgeOffset = 0; }, 400);
    }
  }

  function update(dt, playerFighter) {
    const now = performance.now();

    // Handle blocking state
    if (state === 'blocking' && now > blockEndTime) {
      fighter.setBlocking(false);
      state = 'idle';

      // Execute counter if pending
      if (pendingCombo > 0) {
        executeAttack();
        pendingCombo--;
      }
    }

    // Handle wind-up state
    if (state === 'winding_up' && now > windupEndTime) {
      executeAttack();
    }

    // Handle combo delays
    if (state === 'combo_wait' && now > comboDelay) {
      executeAttack();
    }

    // Idle - decide next action
    if (state === 'idle' && fighter.state === 'idle' && now > nextAttackTime) {
      // Start attack sequence
      if (fighter.stamina > 15) {
        state = 'winding_up';
        windupEndTime = now + config.windupTime;

        // Decide combo length
        if (Math.random() < config.comboChance) {
          pendingCombo = 1 + Math.floor(Math.random() * (config.maxCombo - 1));
        } else {
          pendingCombo = 0;
        }
      }

      nextAttackTime = now + randomInRange(config.attackInterval);
    }

    // If fighter finished punching and we have combo left
    if (fighter.state === 'idle' && pendingCombo > 0 && state === 'attacking') {
      pendingCombo--;
      if (pendingCombo > 0) {
        state = 'combo_wait';
        comboDelay = now + 100 + Math.random() * 150;
      } else {
        state = 'idle';
      }
    }

    // Reset state if fighter recovered from stun/knockdown
    if ((fighter.state === 'idle' || fighter.state === 'blocking') &&
        state === 'attacking' && fighter.punchProgress === 0) {
      if (pendingCombo <= 0) {
        state = 'idle';
      }
    }

    // Occasional random blocking
    if (state === 'idle' && Math.random() < config.aggression * 0.002) {
      fighter.setBlocking(true);
      state = 'blocking';
      blockEndTime = now + 300 + Math.random() * 400;
    }
  }

  function executeAttack() {
    const punchType = pickPunchType();
    const hand = Math.random() < 0.5 ? 'Left' : 'Right';
    const power = 0.4 + Math.random() * 0.5 * config.aggression;
    fighter.throwPunch(punchType, hand, power);
    state = 'attacking';
  }

  return { init, update, reactToPlayerPunch, recordPlayerPunch };
})();
