// ============================================
// Audio System - Web Audio API Synthesized Sounds
// ============================================

const Audio = (function () {
  'use strict';

  let ctx = null;
  let muted = false;
  let masterGain = null;

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

  function playNoise(duration, frequency, type, volume) {
    if (muted) return;
    ensureContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = type || 'sawtooth';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.3, ctx.currentTime + duration);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + duration);

    gain.gain.setValueAtTime(volume || 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  function playPunchHit(power) {
    if (muted) return;
    ensureContext();

    // Impact noise using noise buffer
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3 * power, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800 + power * 600, ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start();

    // Add a thud
    playNoise(0.08, 80 + power * 40, 'sine', 0.2 * power);
  }

  function playPunchMiss() {
    if (muted) return;
    ensureContext();
    // Whoosh sound
    playNoise(0.15, 400, 'sawtooth', 0.06);
  }

  function playBell() {
    if (muted) return;
    ensureContext();

    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 800 + i * 400;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.5);
    }
  }

  function playKO() {
    if (muted) return;
    ensureContext();

    // Heavy impact
    playPunchHit(1.0);

    // Low boom
    setTimeout(() => {
      playNoise(0.5, 50, 'sine', 0.5);
      playNoise(0.4, 35, 'triangle', 0.3);
    }, 50);
  }

  function playCombo(count) {
    if (muted) return;
    ensureContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 400 + count * 100;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  function playBlock() {
    if (muted) return;
    ensureContext();
    playNoise(0.06, 200, 'square', 0.1);
  }

  function toggleMute() {
    muted = !muted;
    return muted;
  }

  return {
    playPunchHit,
    playPunchMiss,
    playBell,
    playKO,
    playCombo,
    playBlock,
    toggleMute,
    ensureContext,
    get muted() { return muted; },
  };
})();
