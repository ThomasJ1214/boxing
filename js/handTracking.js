// ============================================
// Hand Tracking Module - MediaPipe Hands
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

  // Smoothing - exponential moving average
  const EMA_ALPHA = 0.6;
  let smoothedLandmarks = [null, null]; // left, right

  // FPS tracking
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 0;

  function smoothLandmarks(landmarks, handIndex) {
    if (!smoothedLandmarks[handIndex]) {
      smoothedLandmarks[handIndex] = landmarks.map(l => ({ x: l.x, y: l.y, z: l.z }));
      return smoothedLandmarks[handIndex];
    }

    const prev = smoothedLandmarks[handIndex];
    const smoothed = landmarks.map((l, i) => ({
      x: EMA_ALPHA * l.x + (1 - EMA_ALPHA) * prev[i].x,
      y: EMA_ALPHA * l.y + (1 - EMA_ALPHA) * prev[i].y,
      z: EMA_ALPHA * l.z + (1 - EMA_ALPHA) * prev[i].z,
    }));
    smoothedLandmarks[handIndex] = smoothed;
    return smoothed;
  }

  function updateFps() {
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      currentFps = frameCount;
      frameCount = 0;
      lastFpsTime = now;
    }
  }

  function onResults(results) {
    updateFps();

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

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i];
        // Mirror the label since video is mirrored
        const label = handedness.label === 'Left' ? 'Right' : 'Left';
        const handIdx = label === 'Left' ? 0 : 1;

        const smoothed = smoothLandmarks(landmarks, handIdx);

        // Mirror x coordinates for drawing
        const mirrored = smoothed.map(l => ({
          x: 1 - l.x,
          y: l.y,
          z: l.z,
        }));

        // Draw skeleton on webcam canvas
        drawHandSkeleton(mirrored, label);

        processedHands.push({
          label: label,
          landmarks: mirrored,
          rawLandmarks: smoothed,
        });
      }
    }

    canvasCtx.restore();

    if (onResultsCallback) {
      onResultsCallback(processedHands, currentFps);
    }
  }

  function drawHandSkeleton(landmarks, label) {
    const w = canvasElement.width;
    const h = canvasElement.height;
    const color = label === 'Left' ? '#4FC3F7' : '#4FC3F7';
    const jointColor = '#FFFFFF';

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
    canvasCtx.strokeStyle = 'rgba(33, 150, 243, 0.4)';
    canvasCtx.lineWidth = 2;
    canvasCtx.stroke();
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
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults(onResults);

    // Get webcam
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
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
