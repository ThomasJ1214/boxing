// ============================================
// Physics - Hit Detection, Dodge, Damage
// ============================================

const Physics = (function () {
  'use strict';

  // Track punches that complete without connecting (for miss audio)
  const punchTracking = { player: null, ai: null };

  function checkPunchHit(attacker, defender) {
    if (attacker.state !== 'punching') return false;
    if (attacker.punchConnected) return false;

    // Tighter hit window: only during peak extension
    if (attacker.punchProgress < 0.35 || attacker.punchProgress > 0.55) return false;

    // Directional dodge check
    if (Math.abs(defender.dodgeOffset) > 0.3) {
      const dodgeDir = defender.dodgeOffset < 0 ? 'left' : 'right';
      const punchHand = attacker.punchHand;
      // Dodging left avoids right-hand punches, dodging right avoids left-hand punches
      if (dodgeDir === 'left' && punchHand === 'Right') return false;
      if (dodgeDir === 'right' && punchHand === 'Left') return false;
      // Same-side punches still have a chance to hit (30%)
      if (Math.random() > 0.3) return false;
    }

    return true;
  }

  function processPunch(attacker, defender) {
    if (!checkPunchHit(attacker, defender)) return null;

    attacker.punchConnected = true;
    let damage = attacker.calculateDamage(attacker.punchType, attacker.punchPower);

    // Headshot multiplier for uppercuts
    if (attacker.punchType === 'uppercut') {
      damage *= 1.5;
    }

    // Hook bypass: hooks partially bypass blocks (50% reduction vs 80% for others)
    const wasBlocking = defender.blockActive;
    let actualDamage;
    if (wasBlocking && attacker.punchType === 'hook') {
      // Temporarily disable block for hook bypass calculation
      const savedBlock = defender.blockActive;
      defender.blockActive = false;
      actualDamage = defender.receiveDamage(damage * 0.5, attacker.punchType);
      defender.blockActive = savedBlock;
    } else {
      actualDamage = defender.receiveDamage(damage, attacker.punchType);
    }

    attacker.registerHit();
    attacker.stats.damageDealt += actualDamage;

    return {
      damage: actualDamage,
      type: attacker.punchType,
      blocked: wasBlocking,
      ko: defender.state === 'ko',
      knockdown: defender.state === 'knockdown',
      guardBroken: defender.guardBroken || false,
    };
  }

  function processFrame(player, ai) {
    const results = { playerHit: null, aiHit: null, playerMiss: false, aiMiss: false };

    // Track punches starting
    if (player.state === 'punching' && !punchTracking.player) {
      punchTracking.player = { connected: false };
    }
    if (ai.state === 'punching' && !punchTracking.ai) {
      punchTracking.ai = { connected: false };
    }

    // Check player punch hitting AI
    if (player.state === 'punching') {
      const hit = processPunch(player, ai);
      if (hit) {
        results.playerHit = hit;
        if (punchTracking.player) punchTracking.player.connected = true;
      }
    }

    // Check AI punch hitting player
    if (ai.state === 'punching') {
      const hit = processPunch(ai, player);
      if (hit) {
        results.aiHit = hit;
        if (punchTracking.ai) punchTracking.ai.connected = true;
      }
    }

    // Detect misses: punch completed (returned to idle) without connecting
    if (player.state !== 'punching' && punchTracking.player) {
      if (!punchTracking.player.connected) results.playerMiss = true;
      punchTracking.player = null;
    }
    if (ai.state !== 'punching' && punchTracking.ai) {
      if (!punchTracking.ai.connected) results.aiMiss = true;
      punchTracking.ai = null;
    }

    return results;
  }

  return { processFrame };
})();
