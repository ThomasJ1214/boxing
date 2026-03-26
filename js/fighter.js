// ============================================
// Fighter Class - Player and AI
// ============================================

const Fighter = (function () {
  'use strict';

  const PUNCH_DAMAGE = {
    jab:      { min: 5, max: 8 },
    cross:    { min: 10, max: 15 },
    hook:     { min: 12, max: 18 },
    uppercut: { min: 15, max: 22 },
  };

  const PUNCH_STAMINA_COST = {
    jab: 5,
    cross: 10,
    hook: 12,
    uppercut: 15,
  };

  const PUNCH_DURATION = {
    jab: 200,
    cross: 300,
    hook: 350,
    uppercut: 400,
  };

  class FighterInstance {
    constructor(isPlayer, side) {
      this.isPlayer = isPlayer;
      this.side = side; // 'left' or 'right' (screen position)
      this.health = 100;
      this.maxHealth = 100;
      this.stamina = 100;
      this.maxStamina = 100;
      this.staminaRegen = 8; // per second

      this.state = 'idle'; // idle, punching, blocking, stunned, knockdown, ko
      this.punchType = null;
      this.punchHand = null;
      this.punchPower = 0;
      this.punchStartTime = 0;
      this.punchProgress = 0; // 0 to 1
      this.punchConnected = false;

      this.blockActive = false;
      this.stunEndTime = 0;
      this.knockdownEndTime = 0;
      this.knockdowns = 0;

      this.hitFlashTime = 0;
      this.invulnerableUntil = 0;

      // Combo tracking
      this.comboCount = 0;
      this.lastHitTime = 0;
      this.comboTimeout = 1500; // ms to maintain combo

      // Stats
      this.stats = {
        punchesThrown: 0,
        punchesLanded: 0,
        damageDealt: 0,
        damageReceived: 0,
        knockdowns: 0,
        comboBest: 0,
      };

      // Position for rendering (normalized 0-1)
      this.bodyX = side === 'left' ? 0.3 : 0.7;
      this.bodyY = 0.5;

      // Arm positions (for rendering)
      this.leftArmExtension = 0;  // 0 = guard, 1 = fully extended
      this.rightArmExtension = 0;
      this.leftArmAngle = 0;
      this.rightArmAngle = 0;
      this.guardHeight = 0; // 0 = normal, 1 = high guard

      // Sway animation
      this.swayOffset = 0;
      this.swaySpeed = isPlayer ? 0 : 1.5;
      this.dodgeOffset = 0; // -1 left, 0 center, 1 right
    }

    throwPunch(type, hand, power) {
      if (this.state !== 'idle' && this.state !== 'blocking') return false;
      if (this.stamina < PUNCH_STAMINA_COST[type]) return false;

      this.state = 'punching';
      this.punchType = type;
      this.punchHand = hand || (type === 'jab' ? 'Left' : 'Right');
      this.punchPower = power || 0.5;
      this.punchStartTime = performance.now();
      this.punchProgress = 0;
      this.punchConnected = false;
      this.stamina -= PUNCH_STAMINA_COST[type];
      this.stats.punchesThrown++;
      return true;
    }

    setBlocking(active) {
      if (this.state === 'stunned' || this.state === 'knockdown' || this.state === 'ko') return;
      if (active && this.state !== 'punching') {
        this.state = 'blocking';
        this.blockActive = true;
        this.guardHeight = 1;
      } else if (!active && this.state === 'blocking') {
        this.state = 'idle';
        this.blockActive = false;
        this.guardHeight = 0;
      }
    }

    receiveDamage(damage, punchType) {
      const now = performance.now();
      if (now < this.invulnerableUntil) return 0;

      let actualDamage = damage;

      if (this.blockActive) {
        actualDamage = damage * 0.2;
        this.stamina -= damage * 0.15; // blocking costs stamina
      }

      this.health = Math.max(0, this.health - actualDamage);
      this.stats.damageReceived += actualDamage;
      this.hitFlashTime = now;
      this.invulnerableUntil = now + 150;

      // Stun on heavy hits
      if (!this.blockActive && actualDamage > 12) {
        this.state = 'stunned';
        this.stunEndTime = now + 400;
      }

      // Knockdown check
      if (this.health < 20 && actualDamage > 10 && !this.blockActive) {
        this.triggerKnockdown(now);
      }

      // KO
      if (this.health <= 0) {
        this.state = 'ko';
      }

      return actualDamage;
    }

    triggerKnockdown(now) {
      this.state = 'knockdown';
      this.knockdownEndTime = now + 3000;
      this.knockdowns++;
      this.stats.knockdowns++;

      if (this.knockdowns >= 3) {
        this.health = 0;
        this.state = 'ko';
      }
    }

    calculateDamage(punchType, power) {
      const range = PUNCH_DAMAGE[punchType];
      const baseDamage = range.min + (range.max - range.min) * power;

      // Combo multiplier
      let comboMult = 1;
      if (this.comboCount >= 5) comboMult = 2.0;
      else if (this.comboCount >= 3) comboMult = 1.5;
      else if (this.comboCount >= 2) comboMult = 1.2;

      return baseDamage * comboMult;
    }

    registerHit() {
      const now = performance.now();
      if (now - this.lastHitTime < this.comboTimeout) {
        this.comboCount++;
      } else {
        this.comboCount = 1;
      }
      this.lastHitTime = now;
      this.stats.punchesLanded++;
      if (this.comboCount > this.stats.comboBest) {
        this.stats.comboBest = this.comboCount;
      }
    }

    update(dt) {
      const now = performance.now();

      // Stamina regeneration
      if (this.state !== 'punching') {
        this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * dt);
      }

      // Punch animation progress
      if (this.state === 'punching') {
        const elapsed = now - this.punchStartTime;
        const duration = PUNCH_DURATION[this.punchType] || 300;
        this.punchProgress = Math.min(1, elapsed / duration);

        if (this.punchProgress >= 1) {
          this.state = 'idle';
          this.punchType = null;
          this.punchProgress = 0;
        }
      }

      // Stun recovery
      if (this.state === 'stunned' && now > this.stunEndTime) {
        this.state = 'idle';
      }

      // Knockdown recovery
      if (this.state === 'knockdown' && now > this.knockdownEndTime) {
        if (this.health > 0) {
          this.state = 'idle';
          this.health = Math.max(this.health, 15); // get up with some health
        }
      }

      // Combo timeout
      if (now - this.lastHitTime > this.comboTimeout) {
        this.comboCount = 0;
      }

      // Sway animation (AI only)
      if (this.swaySpeed > 0) {
        this.swayOffset = Math.sin(now / 1000 * this.swaySpeed) * 0.01;
      }

      // Update arm animations based on state
      this.updateArmPositions();
    }

    updateArmPositions() {
      const target = { leftExt: 0, rightExt: 0, leftAng: 0, rightAng: 0 };

      if (this.state === 'punching') {
        const ext = this.punchProgress < 0.5
          ? this.punchProgress * 2  // extending
          : (1 - this.punchProgress) * 2; // retracting

        if (this.punchHand === 'Left') {
          target.leftExt = ext;
          if (this.punchType === 'hook') target.leftAng = -0.5 * ext;
          if (this.punchType === 'uppercut') target.leftAng = 0.8 * ext;
        } else {
          target.rightExt = ext;
          if (this.punchType === 'hook') target.rightAng = 0.5 * ext;
          if (this.punchType === 'uppercut') target.rightAng = 0.8 * ext;
        }
      }

      if (this.state === 'blocking') {
        target.leftExt = 0.15;
        target.rightExt = 0.15;
      }

      // Smooth interpolation
      const lerp = 0.2;
      this.leftArmExtension += (target.leftExt - this.leftArmExtension) * lerp;
      this.rightArmExtension += (target.rightExt - this.rightArmExtension) * lerp;
      this.leftArmAngle += (target.leftAng - this.leftArmAngle) * lerp;
      this.rightArmAngle += (target.rightAng - this.rightArmAngle) * lerp;

      // Guard height smoothing
      const guardTarget = this.state === 'blocking' ? 1 : 0;
      this.guardHeight += (guardTarget - this.guardHeight) * lerp;
    }

    resetForRound() {
      this.health = this.maxHealth;
      this.stamina = this.maxStamina;
      this.state = 'idle';
      this.punchType = null;
      this.punchProgress = 0;
      this.blockActive = false;
      this.comboCount = 0;
      this.knockdowns = 0;
      this.dodgeOffset = 0;
    }

    resetStats() {
      this.stats = {
        punchesThrown: 0,
        punchesLanded: 0,
        damageDealt: 0,
        damageReceived: 0,
        knockdowns: 0,
        comboBest: 0,
      };
    }
  }

  return { create: (isPlayer, side) => new FighterInstance(isPlayer, side) };
})();
