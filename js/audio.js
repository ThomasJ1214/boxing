// ============================================
// Audio System - Punch-type variation, crowd,
// combo tones, improved bell
// ============================================

const Audio = (function () {
  'use strict';

  let ctx = null;
  let muted = false;
  let masterGain = null;
  let crowdNode = null;
  let crowdGain = null;
  let crowdTargetVol = 0.06;

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  // ---- Punch hit sounds (varies by type) ----
  function playPunchHit(power, type) {
    if (muted) return;
    ensureContext();

    // Noise burst for impact
    const bufferSize = ctx.sampleRate * 0.12;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.12));
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';

    // Per-type characteristics
    let freq, dur, vol, oscFreq, oscType;
    switch (type) {
      case 'jab':
        freq = 1200 + power * 400;
        dur = 0.04;
        vol = 0.2 * power;
        oscFreq = 300;
        oscType = 'sine';
        break;
      case 'cross':
        freq = 800 + power * 300;
        dur = 0.07;
        vol = 0.3 * power;
        oscFreq = 150;
        oscType = 'triangle';
        break;
      case 'hook':
        freq = 600 + power * 200;
        dur = 0.09;
        vol = 0.35 * power;
        oscFreq = 100;
        oscType = 'sawtooth';
        break;
      case 'uppercut':
        freq = 400 + power * 200;
        dur = 0.12;
        vol = 0.4 * power;
        oscFreq = 60;
        oscType = 'sine';
        break;
      default:
        freq = 800;
        dur = 0.08;
        vol = 0.25 * power;
        oscFreq = 120;
        oscType = 'triangle';
    }

    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start();

    // Tonal thud
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = oscType;
    osc.frequency.setValueAtTime(oscFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(oscFreq * 0.4, ctx.currentTime + dur * 1.5);
    oscGain.gain.setValueAtTime(vol * 0.6, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur * 1.5);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + dur * 1.5);

    // Boost crowd on hit
    bumpCrowd(0.03 * power);
  }

  function playPunchMiss() {
    if (muted) return;
    ensureContext();
    // Whoosh: filtered noise sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.15);
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.5;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  // ---- Bell (harmonics with decay envelope) ----
  function playBell() {
    if (muted) return;
    ensureContext();
    const harmonics = [440, 880, 1320];
    const amps = [0.15, 0.08, 0.04];
    harmonics.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(amps[i], ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();
      osc.stop(ctx.currentTime + 2.0);
    });
  }

  function playKOBell() {
    if (muted) return;
    ensureContext();
    // Triple bell ring
    for (let r = 0; r < 3; r++) {
      const delay = r * 0.3;
      const harmonics = [440, 880, 1320];
      harmonics.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.12 - i * 0.03, ctx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 1.5);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 1.5);
      });
    }
  }

  function playKO() {
    if (muted) return;
    ensureContext();
    // Heavy impact
    playPunchHit(1.0, 'uppercut');
    // Deep boom
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(40, ctx.currentTime + 0.05);
    osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.6);
    gain.gain.setValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(ctx.currentTime + 0.05);
    osc.stop(ctx.currentTime + 0.6);
    // Crowd roar
    bumpCrowd(0.15);
  }

  // ---- Combo tones (ascending pitch) ----
  function playCombo(count) {
    if (muted) return;
    ensureContext();
    // C4=262, E4=330, G4=392, C5=523
    const pitches = [262, 330, 392, 523, 659];
    const freq = pitches[Math.min(count - 2, pitches.length - 1)] || 523;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  }

  function playBlock() {
    if (muted) return;
    ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 200;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  function playGuardBreak() {
    if (muted) return;
    ensureContext();
    // Shattering sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }

  // ---- Count sound (for standing 8-count) ----
  function playCount(num) {
    if (muted) return;
    ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 100 + num * 20;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  // ---- Crowd ambient noise ----
  function startCrowd() {
    if (crowdNode) return;
    ensureContext();
    // Generate a long noise buffer
    const dur = 4;
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    crowdNode = ctx.createBufferSource();
    crowdNode.buffer = buffer;
    crowdNode.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.3;

    crowdGain = ctx.createGain();
    crowdGain.gain.value = muted ? 0 : 0.06;

    crowdNode.connect(filter);
    filter.connect(crowdGain);
    crowdGain.connect(masterGain);
    crowdNode.start();
  }

  function stopCrowd() {
    if (crowdNode) {
      crowdNode.stop();
      crowdNode.disconnect();
      crowdNode = null;
    }
  }

  function bumpCrowd(amount) {
    if (!crowdGain || muted) return;
    crowdTargetVol = Math.min(0.25, crowdTargetVol + amount);
  }

  function updateCrowd() {
    if (!crowdGain || muted) return;
    // Decay crowd volume back to base
    crowdTargetVol = Math.max(0.06, crowdTargetVol - 0.0005);
    crowdGain.gain.value += (crowdTargetVol - crowdGain.gain.value) * 0.1;
  }

  function toggleMute() {
    muted = !muted;
    if (crowdGain) {
      crowdGain.gain.value = muted ? 0 : 0.06;
    }
    return muted;
  }

  function loadMuteState() {
    const saved = localStorage.getItem('virtualBoxing_muted');
    if (saved === 'true') {
      muted = true;
    }
  }

  function saveMuteState() {
    localStorage.setItem('virtualBoxing_muted', muted ? 'true' : 'false');
  }

  return {
    playPunchHit,
    playPunchMiss,
    playBell,
    playKOBell,
    playKO,
    playCombo,
    playBlock,
    playGuardBreak,
    playCount,
    startCrowd,
    stopCrowd,
    updateCrowd,
    toggleMute,
    loadMuteState,
    saveMuteState,
    ensureContext,
    get muted() { return muted; },
  };
})();
