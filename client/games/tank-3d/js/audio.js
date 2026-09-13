/** Tiny procedural sound engine — no external assets. */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.engine = null;
  }

  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      this.ready = true;
    } catch (e) {
      console.warn('[audio] unavailable', e);
    }
  }

  _noiseBuffer() {
    if (this._nb) return this._nb;
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._nb = buf;
    return buf;
  }

  _noise(dur, gain, filterType, freqStart, freqEnd, q = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    const now = this.ctx.currentTime;
    f.frequency.setValueAtTime(freqStart, now);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  _tone(type, f0, f1, dur, gain, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    const now = this.ctx.currentTime;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    o.connect(g); g.connect(this.master);
    o.start(now);
    o.stop(now + dur + 0.03);
  }

  shoot() {
    if (!this.ready || this.muted) return;
    this._tone('square', 190, 46, 0.2, 0.3);
    this._noise(0.28, 0.42, 'lowpass', 2600, 220);
  }

  enemyShoot() {
    if (!this.ready || this.muted) return;
    this._tone('square', 140, 40, 0.18, 0.16);
    this._noise(0.2, 0.2, 'lowpass', 1600, 180);
  }

  hit() {
    if (!this.ready || this.muted) return;
    this._noise(0.1, 0.3, 'bandpass', 1800, 700, 2);
    this._tone('triangle', 900, 300, 0.09, 0.16);
  }

  hitArmor() {
    if (!this.ready || this.muted) return;
    this._noise(0.14, 0.26, 'bandpass', 3200, 900, 3);
    this._tone('square', 420, 120, 0.1, 0.14);
  }

  explosion(big = false) {
    if (!this.ready || this.muted) return;
    this._noise(big ? 1.05 : 0.5, big ? 0.9 : 0.5, 'lowpass', big ? 1200 : 1500, 60, 1.2);
    this._tone('sine', big ? 130 : 170, 32, big ? 0.75 : 0.4, big ? 0.5 : 0.28);
  }

  pickup() {
    if (!this.ready || this.muted) return;
    this._tone('sine', 660, 660, 0.09, 0.2);
    setTimeout(() => this.ready && this._tone('sine', 990, 990, 0.12, 0.2), 80);
  }

  waveStart() {
    if (!this.ready || this.muted) return;
    this._tone('sawtooth', 180, 300, 0.5, 0.16);
    setTimeout(() => this.ready && this._tone('sawtooth', 300, 420, 0.5, 0.14), 180);
  }

  ui() {
    if (!this.ready || this.muted) return;
    this._tone('triangle', 520, 700, 0.08, 0.16);
  }

  gameOver() {
    if (!this.ready || this.muted) return;
    this._tone('sawtooth', 300, 70, 1.5, 0.3);
    this._noise(1.6, 0.4, 'lowpass', 900, 50);
  }

  startEngine() {
    if (!this.ready || this.muted || this.engine) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 42;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.value = 0.0;
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start();
    this.engine = { o, g, f };
  }

  setEngine(load) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const target = this.muted ? 0 : 0.045 + load * 0.075;
    this.engine.g.gain.setTargetAtTime(target, t, 0.15);
    this.engine.o.frequency.setTargetAtTime(38 + load * 42, t, 0.12);
    this.engine.f.frequency.setTargetAtTime(180 + load * 420, t, 0.15);
  }

  stopEngine() {
    if (!this.engine) return;
    try {
      this.engine.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
      const e = this.engine;
      setTimeout(() => { try { e.o.stop(); } catch (_) {} }, 500);
    } catch (_) {}
    this.engine = null;
  }
}
