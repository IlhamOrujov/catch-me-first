// ============================================================================
//  CATCH ME FIRST — audio.js
//  Web Audio synthesized SFX (no files), a gentle lo-fi music bed, and TTS.
// ============================================================================

import { State } from "./state.js";

export const Audio = {
  ctx: null,
  master: null,
  musicGain: null,
  musicNodes: [],
  voices: [],

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = State.settings.musicVolume;
    this.musicGain.connect(this.master);
    // load TTS voices
    this._loadVoices();
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => this._loadVoices();
  },

  resume() { if (this.ctx?.state === "suspended") this.ctx.resume(); },

  _env(node, gain, dur, attack = 0.005, release = 0.1) {
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.linearRampToValueAtTime(0, t + dur);
    node.connect(g); g.connect(this.master);
    return g;
  },

  _tone(freq, dur, type = "sine", gain = 0.2, when = 0) {
    if (!this.ctx || !State.settings.sfxEnabled) return;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this._env(o, gain, dur);
    o.start(this.ctx.currentTime + when);
    o.stop(this.ctx.currentTime + when + dur + 0.05);
  },

  // ---- named SFX ----
  sfx(name) {
    if (!State.settings.sfxEnabled) return;
    this.resume();
    switch (name) {
      case "click": this._tone(660, 0.05, "square", 0.1); break;
      case "pop": this._tone(880, 0.08, "sine", 0.18); this._tone(1320, 0.06, "sine", 0.1, 0.02); break;
      case "chime": [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.35, "sine", 0.15, i * 0.08)); break;
      case "sparkle": [1200, 1600, 2000, 2400].forEach((f, i) => this._tone(f, 0.18, "triangle", 0.08, i * 0.04)); break;
      case "notify": this._tone(880, 0.12, "sine", 0.2); this._tone(1174, 0.18, "sine", 0.18, 0.1); break;
      case "success": [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.2, "triangle", 0.15, i * 0.06)); break;
      case "error": this._tone(200, 0.25, "sawtooth", 0.15); this._tone(150, 0.3, "sawtooth", 0.12, 0.05); break;
      case "heart": this._tone(700, 0.15, "sine", 0.15); this._tone(900, 0.2, "sine", 0.13, 0.08); this._tone(1100, 0.25, "sine", 0.1, 0.16); break;
      case "whoosh": { const o = this.ctx.createOscillator(); o.type = "sawtooth";
        o.frequency.setValueAtTime(800, this.ctx.currentTime); o.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.3);
        const g = this._env(o, 0.1, 0.3); o.start(); o.stop(this.ctx.currentTime + 0.35); break; }
      case "shutter": this._tone(2000, 0.03, "square", 0.15); this._tone(500, 0.05, "square", 0.1, 0.04); break;
      case "type": this._tone(400 + Math.random() * 300, 0.03, "square", 0.04); break;
      case "giggle": [700, 900, 750, 950, 800].forEach((f, i) => this._tone(f, 0.1, "sine", 0.08, i * 0.09)); break;
      case "door": this._tone(120, 0.2, "sine", 0.15); this._tone(90, 0.3, "sine", 0.1, 0.1); break;
      case "coin": this._tone(988, 0.08, "square", 0.12); this._tone(1319, 0.3, "square", 0.1, 0.07); break;
      case "levelup": [392, 523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.15, "square", 0.12, i * 0.08)); break;
      default: this._tone(660, 0.08, "sine", 0.12);
    }
  },

  // ---- lo-fi ambient music bed ----
  startMusic() {
    if (!this.ctx || !State.settings.musicEnabled || this.musicNodes.length) return;
    this.resume();
    // simple chord pad + soft arp
    const chords = [[261.63, 329.63, 392], [220, 277.18, 329.63], [293.66, 349.23, 440], [246.94, 311.13, 392]];
    let idx = 0;
    const playChord = () => {
      if (!State.settings.musicEnabled) return;
      const notes = chords[idx % chords.length];
      notes.forEach((f) => {
        const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
        const g = this.ctx.createGain(); g.gain.value = 0;
        const t = this.ctx.currentTime;
        g.gain.linearRampToValueAtTime(0.05, t + 1); g.gain.linearRampToValueAtTime(0, t + 3.8);
        o.connect(g); g.connect(this.musicGain); o.start(); o.stop(t + 4);
      });
      idx++;
      this._musicTimer = setTimeout(playChord, 4000);
    };
    playChord();
    this.musicNodes.push(true);
  },

  stopMusic() { clearTimeout(this._musicTimer); this.musicNodes = []; },
  setMusicVolume(v) { if (this.musicGain) this.musicGain.gain.value = v; },

  // ---- TTS: Akuu's voice ----
  _loadVoices() {
    if (!window.speechSynthesis) return;
    this.voices = speechSynthesis.getVoices();
  },

  // rank the browser's voices — premium/neural first, then known-good female names
  _pickVoice() {
    const want = State.settings.ttsVoice;
    if (want) { const v = this.voices.find((v) => v.name === want); if (v) return v; }
    if (!this.voices?.length) return null;
    const score = (v) => {
      let s = 0; const n = v.name || "";
      if (/premium|neural|natural|enhanced|siri/i.test(n)) s += 12;
      if (/samantha|ava|allison|zoe|serena|karen|moira|tessa|kate|nora|google uk english female|google us english|zira|aria|jenny|libby/i.test(n)) s += 7;
      if (/female|woman/i.test(n)) s += 3;
      if (v.lang?.startsWith((State.settings.langCode || "en").slice(0, 2))) s += 4; else if (v.lang?.startsWith("en")) s += 2;
      if (v.localService === false) s += 1;   // cloud voices tend to sound better
      return s;
    };
    return [...this.voices].sort((a, b) => score(b) - score(a))[0];
  },

  speak(text) {
    if (!State.settings.ttsEnabled || !window.speechSynthesis || !text) return;
    // strip emoji/asterisks/stage directions for cleaner speech
    const clean = String(text).replace(/\*[^*]*\*/g, "").replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").replace(/[~_`#]/g, "").trim();
    if (!clean) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    const v = this._pickVoice(); if (v) u.voice = v;
    // expressive prosody — her mood colours pitch & pace [pitchΔ, rateΔ]
    const MOOD = { excited: [0.14, 0.18], happy: [0.08, 0.06], playful: [0.12, 0.1], giddy: [0.15, 0.2],
      content: [0, 0], cozy: [-0.04, -0.09], affectionate: [0.05, -0.05], tired: [-0.1, -0.2],
      bored: [-0.06, -0.1], annoyed: [-0.06, 0.1], lonely: [-0.08, -0.12], sad: [-0.14, -0.22] };
    const adj = MOOD[State.world.mood] || [0, 0];
    let pitch = (State.settings.ttsPitch ?? 1.2) + adj[0];
    let rate = (State.settings.ttsRate ?? 1) + adj[1];
    let vol = 1;
    if (State.settings.whisperMode) { pitch -= 0.06; rate *= 0.88; vol = 0.4; }
    u.pitch = Math.max(0, Math.min(2, pitch));
    u.rate = Math.max(0.5, Math.min(2, rate));
    u.volume = vol;
    u.onstart = () => State.bus.emit("tts:start", { text: clean });
    u.onend = () => State.bus.emit("tts:end");
    speechSynthesis.speak(u);
  },

  stopSpeaking() { if (window.speechSynthesis) speechSynthesis.cancel(); },
  listVoices() { return this.voices.map((v) => v.name); },
};
