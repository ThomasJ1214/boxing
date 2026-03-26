// ============================================
// Physics - Hit Detection & Damage
// ============================================

const Physics = (function () {
  'use strict';

  // Check if a punch from attacker hits the defender
  function checkPunchHit(attacker, defender) {
    if (attacker.state !== 'punching') return false;
    if (attacker.punchConnected) return false;

    // Only check during the extension phase (first half of punch)
    if (attacker.punchProgress < 0.3 || attacker.punchProgress > 0.6) return false;

    // Defender dodging
    if (defender.dodgeOffset !== 0) {
      // Random dodge chance based on timing
      if (Math.random() < 0.6) return false;
    }

    // In our simplified model, punches always reach if in range
    // Attacker and defender are always facing each other
    return true;
  }

  function processPunch(attacker, defender) {
    if (!checkPunchHit(attacker, defender)) return null;

    attacker.punchConnected = true;
    const damage = attacker.calculateDamage(attacker.punchType, attacker.punchPower);
    const actualDamage = defender.receiveDamage(damage, attacker.punchType);

    attacker.registerHit();
    attacker.stats.damageDealt += actualDamage;

    return {
      damage: actualDamage,
      type: attacker.punchType,
      blocked: defender.blockActive,
      ko: defender.state === 'ko',
      knockdown: defender.state === 'knockdown',
    };
  }

  function processFrame(player, ai) {
    const results = { playerHit: null, aiHit: null };

    // Check player punch hitting AI
    if (player.state === 'punching') {
      results.playerHit = processPunch(player, ai);
    }

    // Check AI punch hitting player
    if (ai.state === 'punching') {
      results.aiHit = processPunch(ai, player);
    }

    return results;
  }

  return { processFrame };
})();
