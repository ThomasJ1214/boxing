// ============================================
// Hand Tracking Module - MediaPipe Hands
// High-performance version with adaptive smoothing
// and hand persistence during fast motion
// ============================================

const HandTracking = (function () {
  'use strict';

  let hands = null;
  let camera = null;
  let videoElement = null;
  let canvasElement = null;
  let canvasCtx = null;
  let onResultsCallback = null;
  let isRunning = false;

  // Adaptive smoothing - reduces during fast motion to preserve velocity
  const EMA_ALPHA_SLOW = 0.5;   // smooth when idle
  const EMA_ALPHA_FAST = 0.85;  // near-raw when punching
  const MOTION_THRESHOLD = 0.01; // motion magnitude that triggers fast mode
  let smoothedLandmarks = [null, null]; // index 0=Left, 1=Right
  let lastRawLandmarks = [null, null];

  // Hand persistence - keep last known position when tracking drops
  const HAND_PERSIST_MS = 300; // how long to keep a ghost hand after dropout
  let lastSeenTime = [0, 0];
  let lastSeenHands = [null, null]; // cached hand data for persistence
  let handVelocity = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]; // for prediction

  // FPS tracking
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 0;

  // Frame timestamp ring buffer for timing analysis
  let frameTimes = [];
  const MAX_FRAME_TIMES = 30;

  function computeMotionMagnitude(curr, prev) {
    if (!prev || !curr) return 0;
    // Use wrist (0) and knuckle centers (5,9,13,17) for motion estimate
    const indices = [0, 5, 9, 13, 17];
    let totalMotion = 0;
    for (const i of indices) {
      const dx = curr[i].x - prev[i].x;
      const dy = curr[i].y - prev[i].y;
      const dz = curr[i].z - prev[i].z;
      totalMotion += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return totalMotion / indices.length;
  }

  function smoothLandmarks(landmarks, handIndex) {
    const prev = smoothedLandmarks[handIndex];
    const lastRaw = lastRawLandmarks[handIndex];

    // Save raw for next frame's motion estimate
    lastRawLandmarks[handIndex] = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z }));

    if (!prev) {
      smoothedLandmarks[handIndex] = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z }));
      return smoothedLandmarks[handIndex];
    }

    // Adaptive alpha: high motion = less smoothing (preserve punch velocity)
    const motion = computeMotionMagnitude(landmarks, lastRaw || prev);
    const motionFactor = Math.min(1, motion / MOTION_THRESHOLD);
    const alpha = EMA_ALPHA_SLOW + (EMA_ALPHA_FAST - EMA_ALPHA_SLOW) * motionFactor;

    const smoothed = landmarks.map((l, i) => ({
      x: alpha * l.x + (1 - alpha) * prev[i].x,
      y: alpha * l.y + (1 - alpha) * prev[i].y,
      z: alpha * l.z + (1 - alpha) * prev[i].z,
    }));
    smoothedLandmarks[handIndex] = smoothed;

    // Track velocity for prediction during dropout
    if (lastRaw) {
      const wristCurr = landmarks[0];
      const wristPrev = lastRaw[0];
      handVelocity[handIndex] = {
        x: wristCurr.x - wristPrev.x,
        y: wristCurr.y - wristPrev.y,
        z: wristCurr.z - wristPrev.z,
      };
    }

    return smoothed;
  }

  // Predict hand position when tracking drops out mid-punch
  function predictLandmarks(handIndex, elapsedMs) {
    const last = smoothedLandmarks[handIndex];
    const vel = handVelocity[handIndex];
    if (!last || !vel) return null;

    // Extrapolate with decay (don't predict too far)
    const decay = Math.max(0, 1 - elapsedMs / HAND_PERSIST_MS);
    const frameFactor = elapsedMs / 33; // normalize to ~30fps frame intervals

    return last.map(l => ({
      x: l.x + vel.x * frameFactor * decay,
      y: l.y + vel.y * frameFactor * decay,
      z: l.z + vel.z * frameFactor * decay,
    }));
  }

  function updateFps() {
    frameCount++;
    const now = performance.now();
    frameTimes.push(now);
    if (frameTimes.length > MAX_FRAME_TIMES) frameTimes.shift();
    if (now - lastFpsTime >= 1000) {
      currentFps = frameCount;
      frameCount = 0;
      lastFpsTime = now;
    }
  }

  function onResults(results) {
    updateFps();
    const now = performance.now();

    const w = canvasElement.width;
    const h = canvasElement.height;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, w, h);

    // Draw mirrored webcam feed
    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.translate(-w, 0);
    canvasCtx.drawImage(results.image, 0, 0, w, h);
    canvasCtx.restore();

    const processedHands = [];
    const seenIndices = new Set();

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i];
        // Mirror the label since video is mirrored
        const label = handedness.label === 'Left' ? 'Right' : 'Left';
        const handIdx = label === 'Left' ? 0 : 1;
        seenIndices.add(handIdx);

        const smoothed = smoothLandmarks(landmarks, handIdx);
        lastSeenTime[handIdx] = now;

        // Mirror x coordinates for drawing
        const mirrored = smoothed.map(l => ({
          x: 1 - l.x,
          y: l.y,
          z: l.z,
        }));

        // Draw skeleton on webcam canvas
        drawHandSkeleton(mirrored, label, 1.0);

        const handData = {
          label: label,
          landmarks: mirrored,
          rawLandmarks: smoothed,
          predicted: false,
        };
        processedHands.push(handData);
        lastSeenHands[handIdx] = handData;
      }
    }

    // Persist hands that dropped out (common during fast punches)
    for (let handIdx = 0; handIdx < 2; handIdx++) {
      if (seenIndices.has(handIdx)) continue;
      const elapsed = now - lastSeenTime[handIdx];
      if (elapsed < HAND_PERSIST_MS && lastSeenHands[handIdx]) {
        const predicted = predictLandmarks(handIdx, elapsed);
        if (predicted) {
          const mirrored = predicted.map(l => ({
            x: 1 - l.x,
            y: l.y,
            z: l.z,
          }));

          const opacity = Math.max(0.2, 1 - elapsed / HAND_PERSIST_MS);
          const label = handIdx === 0 ? 'Left' : 'Right';
          drawHandSkeleton(mirrored, label, opacity);

          processedHands.push({
            label: label,
            landmarks: mirrored,
            rawLandmarks: predicted,
            predicted: true,
          });
        }
      } else if (elapsed >= HAND_PERSIST_MS) {
        // Hand truly gone - clear stale smoothing data so re-detection is snappy
        smoothedLandmarks[handIdx] = null;
        lastRawLandmarks[handIdx] = null;
        handVelocity[handIdx] = { x: 0, y: 0, z: 0 };
      }
    }

    canvasCtx.restore();

    if (onResultsCallback) {
      onResultsCallback(processedHands, currentFps);
    }
  }

  function drawHandSkeleton(landmarks, label, opacity) {
    const w = canvasElement.width;
    const h = canvasElement.height;
    const color = label === 'Left' ? '#4FC3F7' : '#81D4FA';
    const jointColor = '#FFFFFF';

    ctx_alpha(opacity);

    // Hand connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // index
      [0, 9], [9, 10], [10, 11], [11, 12],  // middle
      [0, 13], [13, 14], [14, 15], [15, 16], // ring
      [0, 17], [17, 18], [18, 19], [19, 20], // pinky
      [5, 9], [9, 13], [13, 17],             // palm
    ];

    // Draw connections
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 3;
    canvasCtx.lineCap = 'round';
    for (const [a, b] of connections) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(landmarks[a].x * w, landmarks[a].y * h);
      canvasCtx.lineTo(landmarks[b].x * w, landmarks[b].y * h);
      canvasCtx.stroke();
    }

    // Draw joints
    for (let i = 0; i < landmarks.length; i++) {
      const r = [0, 5, 9, 13, 17].includes(i) ? 5 : 3;
      canvasCtx.beginPath();
      canvasCtx.arc(landmarks[i].x * w, landmarks[i].y * h, r, 0, Math.PI * 2);
      canvasCtx.fillStyle = jointColor;
      canvasCtx.fill();
      canvasCtx.strokeStyle = color;
      canvasCtx.lineWidth = 1.5;
      canvasCtx.stroke();
    }

    // Draw glove circle around knuckle area
    const knuckleX = (landmarks[5].x + landmarks[17].x) / 2;
    const knuckleY = (landmarks[5].y + landmarks[17].y) / 2;
    canvasCtx.beginPath();
    canvasCtx.arc(knuckleX * w, knuckleY * h, 25, 0, Math.PI * 2);
    canvasCtx.strokeStyle = `rgba(33, 150, 243, ${0.4 * opacity})`;
    canvasCtx.lineWidth = 2;
    canvasCtx.stroke();

    ctx_alpha(1);
  }

  function ctx_alpha(a) {
    canvasCtx.globalAlpha = a;
  }

  async function init(videoEl, canvasEl, callback) {
    videoElement = videoEl;
    canvasElement = canvasEl;
    canvasCtx = canvasElement.getContext('2d');
    onResultsCallback = callback;

    hands = new Hands({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`;
      }
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,   // lowered from 0.7 - keeps hands during fast motion
      minTrackingConfidence: 0.35,   // lowered from 0.5 - prevents dropout mid-punch
    });

    hands.onResults(onResults);

    // Get webcam - request higher framerate for better tracking
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 60, min: 30 },
        facingMode: 'user',
      }
    });

    videoElement.srcObject = stream;
    await new Promise(resolve => {
      videoElement.onloadedmetadata = () => {
        canvasElement.width = videoElement.videoWidth;
        canvasElement.height = videoElement.videoHeight;
        resolve();
      };
    });

    // Start camera loop
    camera = new Camera(videoElement, {
      onFrame: async () => {
        if (isRunning) {
          await hands.send({ image: videoElement });
        }
      },
      width: 640,
      height: 480,
    });

    isRunning = true;
    await camera.start();
  }

  function stop() {
    isRunning = false;
    if (camera) {
      camera.stop();
    }
  }

  return { init, stop };
})();
