// Procedural sound: engine drone + tiny jingles. Everything is generated with WebAudio.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(ctx.destination);

    // engine: two detuned saws through a lowpass
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 400;
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'square';
    this.osc1.connect(this.engFilter); this.osc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.osc1.start(); this.osc2.start();

    // wind/road noise
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource(); this.noise.buffer = buf; this.noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter(); this.noiseFilter.type = 'bandpass'; this.noiseFilter.frequency.value = 900;
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter); this.noiseFilter.connect(this.noiseGain); this.noiseGain.connect(this.master);
    this.noise.start();
  }

  setEngine(speedPct, accelOn, offroad) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 55 + speedPct * 220 + (accelOn ? 12 : 0);
    this.osc1.frequency.setTargetAtTime(rpm, t, 0.05);
    this.osc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(300 + speedPct * 1500 + (accelOn ? 300 : 0), t, 0.05);
    this.engGain.gain.setTargetAtTime(this.muted ? 0 : 0.12 + speedPct * 0.1, t, 0.05);
    this.noiseGain.gain.setTargetAtTime(this.muted ? 0 : speedPct * speedPct * 0.15 + (offroad ? 0.12 : 0), t, 0.05);
    this.noiseFilter.frequency.setTargetAtTime(offroad ? 300 : 900 + speedPct * 1500, t, 0.1);
  }

  stopEngine() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(0, t, 0.2);
    this.noiseGain.gain.setTargetAtTime(0, t, 0.2);
  }

  _tone(freq, start, dur, type = 'square', vol = 0.18) {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    o.connect(g); g.connect(this.master); o.start(start); o.stop(start + dur + 0.05);
  }

  play(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'count': this._tone(440, t, 0.15); break;
      case 'go': this._tone(880, t, 0.4); break;
      case 'checkpoint': [523, 659, 784, 1047].forEach((f, i) => this._tone(f, t + i * 0.09, 0.25)); break;
      case 'goal': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this._tone(f, t + i * 0.12, 0.35, 'triangle', 0.25)); break;
      case 'timeup': [440, 349, 262].forEach((f, i) => this._tone(f, t + i * 0.25, 0.5, 'sawtooth', 0.15)); break;
      case 'crash': {
        const ctx = this.ctx; if (this.muted) return;
        const src = ctx.createBufferSource(); src.buffer = this.noise.buffer;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
        src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.4);
        this._tone(90, t, 0.3, 'sawtooth', 0.3);
        break;
      }
    }
  }

  toggleMute() { this.muted = !this.muted; return this.muted; }
}
