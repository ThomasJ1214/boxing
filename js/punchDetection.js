// ============================================
// Punch Detection System
// High-performance version with multi-window
// velocity analysis and dropout tolerance
// ============================================

const PunchDetection = (function () {
  'use strict';

  // Position history per hand - larger buffer for multi-window analysis
  const history = { Left: [], Right: [] };
  const HISTORY_SIZE = 16;
  const COOLDOWN_MS = 400; // minimum time between punches per hand
  const lastPunchTime = { Left: 0, Right: 0 };

  // Track when we last saw each hand to handle dropouts
  const lastHandSeen = { Left: 0, Right: 0 };
  const HAND_MEMORY_MS = 400; // keep hand state for this long after dropout

  // Velocity ring buffers - track velocity over multiple windows to catch peaks
  const velocityHistory = { Left: [], Right: [] };
  const VELOCITY_HISTORY_SIZE = 6;

  // Thresholds - require deliberate motion, not slight fidgeting
  const VELOCITY_THRESHOLD = 0.07;
  const HOOK_LATERAL_THRESHOLD = 0.035;
  const UPPERCUT_VERTICAL_THRESHOLD = -0.04;

  // Minimum displacement (distance hand must travel) to count as a punch
  const MIN_PUNCH_DISPLACEMENT = 0.04;

  // State tracking for in-flight punches
  const punchState = {
    Left: { inFlight: false, peakVelocity: 0, peakType: null, startTime: 0, startPos: null },
    Right: { inFlight: false, peakVelocity: 0, peakType: null, startTime: 0, startPos: null },
  };
  const PUNCH_FLIGHT_MAX_MS = 350; // max time a punch can be "in flight" before we emit it

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
    if (handsData.length < 2) return false;
    let highHands = 0;
    for (const hand of handsData) {
      const wrist = hand.landmarks[0];
      if (wrist.y < 0.4) highHands++;
    }
    return highHands >= 2;
  }

  function getHandCenter(handsData) {
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

  // Multi-window velocity: compute velocity across several time windows
  // and return the peak, so we don't miss burst motion
  function computePeakVelocity(handHistory) {
    if (handHistory.length < 2) return null;

    const windows = [2, 3, 5, 8]; // frame distances to check
    let peakSpeed = 0;
    let peakDx = 0, peakDy = 0, peakDz = 0, peakDt = 1;

    for (const win of windows) {
      if (handHistory.length < win + 1) continue;
      const curr = handHistory[handHistory.length - 1];
      const prev = handHistory[handHistory.length - 1 - win];
      const dt = (curr.time - prev.time) / 1000;
      if (dt <= 0) continue;

      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const dz = curr.z - prev.z;
      const speed = Math.sqrt(dx * dx + dy * dy) / dt;

      if (speed > peakSpeed) {
        peakSpeed = speed;
        peakDx = dx;
        peakDy = dy;
        peakDz = dz;
        peakDt = dt;
      }
    }

    return {
      speed: peakSpeed,
      dx: peakDx,
      dy: peakDy,
      dz: peakDz,
      dt: peakDt,
      vx: peakDx / peakDt,
      vy: peakDy / peakDt,
      vz: peakDz / peakDt,
      forwardSpeed: -peakDz / peakDt,
    };
  }

  function classifyPunch(vel, label) {
    const { speed, dx, dy, forwardSpeed } = vel;

    if (speed < VELOCITY_THRESHOLD && forwardSpeed < 0.5) return null;

    // Score each punch type and pick the best match
    const scores = {
      uppercut: 0,
      hook: 0,
      jab: 0,
      cross: 0,
    };

    // Uppercut: strong upward motion (dy negative = upward in screen coords)
    if (dy < UPPERCUT_VERTICAL_THRESHOLD) {
      scores.uppercut = Math.abs(dy) / 0.05 + (Math.abs(dx) < 0.015 ? 0.5 : 0);
    }

    // Hook: strong lateral motion
    if (Math.abs(dx) > HOOK_LATERAL_THRESHOLD) {
      scores.hook = Math.abs(dx) / 0.04 + (Math.abs(dy) < 0.012 ? 0.3 : 0);
    }

    // Forward straight punches
    if (forwardSpeed > 0.3) {
      const straight = forwardSpeed / 1.5;
      if (label === 'Left') {
        scores.jab = straight;
      } else {
        scores.cross = straight;
      }
    }

    // General fast motion fallback
    if (speed > VELOCITY_THRESHOLD) {
      if (Math.abs(dx) > Math.abs(dy) * 1.3) {
        scores.hook = Math.max(scores.hook, speed / 0.12);
      } else if (dy < -0.005) {
        scores.uppercut = Math.max(scores.uppercut, speed / 0.1);
      } else {
        const straightScore = speed / 0.08;
        if (label === 'Left') {
          scores.jab = Math.max(scores.jab, straightScore);
        } else {
          scores.cross = Math.max(scores.cross, straightScore);
        }
      }
    }

    // Find best scoring type
    let bestType = null;
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    if (!bestType || bestScore < 0.5) return null;

    return { type: bestType, score: bestScore };
  }

  function update(handsData) {
    const now = performance.now();
    const results = {
      punches: [],
      blocking: detectBlock(handsData),
      dodge: detectDodge(handsData),
      handPositions: {},
    };

    // Track which hands we see this frame
    const seenHands = new Set();

    for (const hand of handsData) {
      const label = hand.label;
      seenHands.add(label);
      lastHandSeen[label] = now;

      const wrist = getWristPosition(hand.landmarks);
      const knuckle = getKnuckleCenter(hand.landmarks);

      results.handPositions[label] = {
        wrist: wrist,
        knuckle: knuckle,
        y: wrist.y,
        x: wrist.x,
        predicted: hand.predicted || false,
      };

      // Add to history (keep history across punches - don't wipe it)
      if (!history[label]) history[label] = [];
      history[label].push({ ...knuckle, time: now });
      if (history[label].length > HISTORY_SIZE) {
        history[label].shift();
      }

      // Need at least 2 frames
      if (history[label].length < 2) continue;

      // Check cooldown
      if (now - lastPunchTime[label] < COOLDOWN_MS) continue;

      // Multi-window peak velocity analysis
      const vel = computePeakVelocity(history[label]);
      if (!vel) continue;

      // Track velocity for peak detection
      if (!velocityHistory[label]) velocityHistory[label] = [];
      velocityHistory[label].push({ speed: vel.speed, time: now });
      if (velocityHistory[label].length > VELOCITY_HISTORY_SIZE) {
        velocityHistory[label].shift();
      }

      const classification = classifyPunch(vel, label);

      if (classification) {
        const state = punchState[label];

        if (!state.inFlight) {
          // Start tracking this punch - record start position for displacement check
          state.inFlight = true;
          state.peakVelocity = classification.score;
          state.peakType = classification.type;
          state.startTime = now;
          const entry = history[label][history[label].length - 1];
          state.startPos = { x: entry.x, y: entry.y };
        } else {
          // Update if we found a higher peak
          if (classification.score > state.peakVelocity) {
            state.peakVelocity = classification.score;
            state.peakType = classification.type;
          }
        }
      }

      // Check if an in-flight punch should be emitted
      const state = punchState[label];
      if (state.inFlight) {
        const elapsed = now - state.startTime;
        const velocityDropping = vel.speed < VELOCITY_THRESHOLD * 0.7;
        const timedOut = elapsed > PUNCH_FLIGHT_MAX_MS;

        // Emit punch when velocity starts dropping (deceleration phase) or timeout
        if (velocityDropping || timedOut) {
          // Check displacement - hand must have traveled a real distance
          const entry = history[label][history[label].length - 1];
          const displacement = state.startPos
            ? Math.hypot(entry.x - state.startPos.x, entry.y - state.startPos.y)
            : 0;

          if (displacement >= MIN_PUNCH_DISPLACEMENT) {
            const fist = !hand.predicted && isFist(hand.landmarks);
            let power = Math.min(1, state.peakVelocity / 1.5);
            if (fist) power = Math.min(1, power * 1.3);
            power = Math.max(0.3, power);

            results.punches.push({
              type: state.peakType,
              hand: label,
              power: power,
              position: knuckle,
            });

            lastPunchTime[label] = now;
          }

          // Always reset tracking state
          history[label] = history[label].slice(-3);
          velocityHistory[label] = [];
          state.inFlight = false;
          state.peakVelocity = 0;
          state.peakType = null;
          state.startPos = null;
        }
      }
    }

    // Handle in-flight punches for hands we lost tracking on
    for (const label of ['Left', 'Right']) {
      if (seenHands.has(label)) continue;
      const elapsed = now - lastHandSeen[label];
      const state = punchState[label];

      if (state.inFlight && elapsed < HAND_MEMORY_MS) {
        // Hand dropped mid-punch - check displacement before emitting
        const lastEntry = history[label] && history[label].length > 0
          ? history[label][history[label].length - 1]
          : { x: 0.5, y: 0.5, z: 0 };

        const displacement = state.startPos
          ? Math.hypot(lastEntry.x - state.startPos.x, lastEntry.y - state.startPos.y)
          : 0;

        if (displacement >= MIN_PUNCH_DISPLACEMENT) {
          let power = Math.min(1, state.peakVelocity / 1.5);
          power = Math.max(0.3, power);

          results.punches.push({
            type: state.peakType,
            hand: label,
            power: power,
            position: lastEntry,
          });

          lastPunchTime[label] = now;
        }

        state.inFlight = false;
        state.peakVelocity = 0;
        state.peakType = null;
        state.startPos = null;
      } else if (state.inFlight && elapsed >= HAND_MEMORY_MS) {
        // Hand gone too long - discard
        state.inFlight = false;
        state.peakVelocity = 0;
        state.peakType = null;
        state.startPos = null;
      }
    }

    return results;
  }

  function reset() {
    history.Left = [];
    history.Right = [];
    velocityHistory.Left = [];
    velocityHistory.Right = [];
    lastPunchTime.Left = 0;
    lastPunchTime.Right = 0;
    lastHandSeen.Left = 0;
    lastHandSeen.Right = 0;
    punchState.Left = { inFlight: false, peakVelocity: 0, peakType: null, startTime: 0, startPos: null };
    punchState.Right = { inFlight: false, peakVelocity: 0, peakType: null, startTime: 0, startPos: null };
  }

  return { update, reset };
})();
