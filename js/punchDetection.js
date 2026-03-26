// ============================================
// Punch Detection System
// ============================================

const PunchDetection = (function () {
  'use strict';

  // Position history per hand
  const history = { Left: [], Right: [] };
  const HISTORY_SIZE = 8;
  const COOLDOWN_MS = 250;
  const lastPunchTime = { Left: 0, Right: 0 };

  // Thresholds
  const VELOCITY_THRESHOLD = 0.035;
  const HOOK_LATERAL_THRESHOLD = 0.025;
  const UPPERCUT_VERTICAL_THRESHOLD = -0.03;

  function getWristPosition(landmarks) {
    return { x: landmarks[0].x, y: landmarks[0].y, z: landmarks[0].z };
  }

  function getKnuckleCenter(landmarks) {
    return {
      x: (landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 4,
      y: (landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) / 4,
      z: (landmarks[5].z + landmarks[9].z + landmarks[13].z + landmarks[17].z) / 4,
    };
  }

  function isFist(landmarks) {
    // Check if fingers are curled: fingertip should be closer to wrist than PIP joint
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20];
    const fingerPIPs = [6, 10, 14, 18];
    let curledCount = 0;

    for (let i = 0; i < fingerTips.length; i++) {
      const tipDist = Math.hypot(
        landmarks[fingerTips[i]].x - wrist.x,
        landmarks[fingerTips[i]].y - wrist.y
      );
      const pipDist = Math.hypot(
        landmarks[fingerPIPs[i]].x - wrist.x,
        landmarks[fingerPIPs[i]].y - wrist.y
      );
      if (tipDist < pipDist * 1.15) curledCount++;
    }
    return curledCount >= 2;
  }

  function detectBlock(handsData) {
    // Both hands raised near face level (y < 0.35 in normalized coords)
    if (handsData.length < 2) return false;

    let highHands = 0;
    for (const hand of handsData) {
      const wrist = hand.landmarks[0];
      if (wrist.y < 0.4) highHands++;
    }
    return highHands >= 2;
  }

  function getHandCenter(handsData) {
    // Average position of all tracked hands for dodge detection
    if (handsData.length === 0) return { x: 0.5, y: 0.5 };
    let sumX = 0;
    for (const hand of handsData) {
      sumX += hand.landmarks[0].x;
    }
    return { x: sumX / handsData.length };
  }

  function detectDodge(handsData) {
    const center = getHandCenter(handsData);
    if (center.x < 0.3) return 'left';
    if (center.x > 0.7) return 'right';
    return null;
  }

  function update(handsData) {
    const now = performance.now();
    const results = {
      punches: [],
      blocking: detectBlock(handsData),
      dodge: detectDodge(handsData),
      handPositions: {},
    };

    for (const hand of handsData) {
      const label = hand.label;
      const wrist = getWristPosition(hand.landmarks);
      const knuckle = getKnuckleCenter(hand.landmarks);

      results.handPositions[label] = {
        wrist: wrist,
        knuckle: knuckle,
        y: wrist.y,
        x: wrist.x,
      };

      // Add to history
      if (!history[label]) history[label] = [];
      history[label].push({ ...knuckle, time: now });
      if (history[label].length > HISTORY_SIZE) {
        history[label].shift();
      }

      // Need at least 3 frames of history
      if (history[label].length < 3) continue;

      // Check cooldown
      if (now - lastPunchTime[label] < COOLDOWN_MS) continue;

      // Calculate velocity (difference between current and 3 frames ago)
      const prev = history[label][history[label].length - 3];
      const curr = history[label][history[label].length - 1];
      const dt = (curr.time - prev.time) / 1000; // seconds
      if (dt === 0) continue;

      const vx = (curr.x - prev.x) / dt;
      const vy = (curr.y - prev.y) / dt;
      const vz = (curr.z - prev.z) / dt;
      const speed = Math.sqrt(vx * vx + vy * vy);

      // Z-axis velocity (forward punch detection - z gets more negative when moving toward camera)
      const forwardSpeed = -vz;

      // Check if hand is in fist-like position
      const fist = isFist(hand.landmarks);

      // Calculate total movement
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;

      // Detect punch type
      let punchType = null;
      let power = 0;

      if (speed > VELOCITY_THRESHOLD || forwardSpeed > 0.5) {
        if (dy < UPPERCUT_VERTICAL_THRESHOLD && Math.abs(dx) < 0.02) {
          // Upward motion = uppercut
          punchType = 'uppercut';
          power = Math.min(1, Math.abs(dy) / 0.08);
        } else if (Math.abs(dx) > HOOK_LATERAL_THRESHOLD && Math.abs(dy) < 0.015) {
          // Lateral motion = hook
          punchType = 'hook';
          power = Math.min(1, Math.abs(dx) / 0.06);
        } else if (forwardSpeed > 0.5) {
          // Forward z motion = straight punch
          punchType = label === 'Left' ? 'jab' : 'cross';
          power = Math.min(1, forwardSpeed / 2);
        } else if (speed > VELOCITY_THRESHOLD) {
          // General fast motion - classify by direction
          if (Math.abs(dx) > Math.abs(dy)) {
            punchType = 'hook';
            power = Math.min(1, speed / 0.15);
          } else if (dy < 0) {
            punchType = 'uppercut';
            power = Math.min(1, speed / 0.12);
          } else {
            punchType = label === 'Left' ? 'jab' : 'cross';
            power = Math.min(1, speed / 0.1);
          }
        }
      }

      if (punchType) {
        // Boost power if fist detected
        if (fist) power = Math.min(1, power * 1.3);
        power = Math.max(0.3, power); // minimum power

        results.punches.push({
          type: punchType,
          hand: label,
          power: power,
          position: knuckle,
        });
        lastPunchTime[label] = now;
        // Clear history to prevent double detection
        history[label] = [];
      }
    }

    return results;
  }

  function reset() {
    history.Left = [];
    history.Right = [];
    lastPunchTime.Left = 0;
    lastPunchTime.Right = 0;
  }

  return { update, reset };
})();
