// ============================================================================
//  CATCH ME FIRST — ambient.js   ("The sound of home")
//  A living soundscape layered on the shared AudioContext:
//   • a soft, slowly-breathing PAD (cozy room tone)
//   • gentle GENERATIVE lofi notes on a warm pentatonic scale
//   • RAIN that fades in when the weather turns (real filtered noise)
//   • quiet FOOTSTEPS as she moves around
//  Starts on the first user gesture (browsers require it) and rides the mixer.
// ============================================================================

import { State } from "./state.js";

const SCALE = [220, 261.63, 293.66, 349.23, 392.00, 440, 523.25];  // A-minor pentatonic-ish, cozy

export const Ambient = {
  refs: null, started: false, g: null, rainGain: null,

  init(refs) {
    this.refs = refs;                       // { audio }
    const start = () => { this.start(); removeEventListener("pointerdown", start); removeEventListener("keydown", start); };
    addEventListener("pointerdown", start); addEventListener("keydown", start);
    State.bus.on("settings:changed", ({ key, value }) => { if (key === "weather") this.setWeather(value); });
    return this;
  },

  start() {
    const A = this.refs.audio;
    if (!A.ctx) { try { A.init?.(); } catch {} }
    const ctx = A.ctx; if (!ctx || this.started) return;
    this.started = true;
    this.g = ctx.createGain(); this.g.gain.value = 0; this.g.connect(A.master);
    this.g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 4);
    this._pad(ctx); this._rain(ctx); this._loop(ctx);
    this.setWeather(State.settings.weather);
  },

  _pad(ctx) {
    const gain = ctx.createGain(); gain.gain.value = 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 0.8;
    gain.connect(lp); lp.connect(this.g);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045; const lg = ctx.createGain(); lg.gain.value = 260;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    for (const f of [110, 164.8, 220]) {   // A2 · E3 · A3 — open, warm
      for (const det of [1, 1.006]) { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f * det; o.connect(gain); o.start(); }
    }
  },

  _loop(ctx) {
    const tick = () => {
      if (!this.started) return;
      if (State.settings.musicEnabled && Math.random() < 0.62) {
        const f = SCALE[Math.floor(Math.random() * SCALE.length)];
        this._note(ctx, f, 0);
        if (Math.random() < 0.4) this._note(ctx, f * 1.5, 0.28);   // a soft fifth on top
      }
      this._t = setTimeout(tick, 1400 + Math.random() * 2800);
    };
    tick();
  },
  _note(ctx, freq, delay) {
    const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = freq;
    const g = ctx.createGain(); const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.3);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1300;
    o.connect(lp); lp.connect(g); g.connect(this.g); o.start(t); o.stop(t + 1.4);
  },

  _rain(ctx) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 0.4;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    src.connect(bp); bp.connect(this.rainGain); this.rainGain.connect(this.g); src.start();
  },
  setWeather(w) {
    if (!this.rainGain) return;
    const on = w === "rain" || w === "storm";
    this.rainGain.gain.setTargetAtTime(on ? 0.14 : 0, this.refs.audio.ctx.currentTime, 1.6);
  },

  footstep() {
    if (!this.started || !State.settings.sfxEnabled) return;
    const ctx = this.refs.audio.ctx, o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = "sine"; o.frequency.value = 72 + Math.random() * 26;
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g); g.connect(this.g); o.start(t); o.stop(t + 0.13);
  },

  toggle(on) { if (this.g) this.g.gain.setTargetAtTime((on ?? this.g.gain.value < 0.1) ? 0.5 : 0, this.refs.audio.ctx.currentTime, 0.5); },
};
