// ============================================================================
//  CATCH ME FIRST — emotion.js   ("The heart under the hood")
//  A real affect model so she becomes someone:
//   • Mood as valence (down↔up) + arousal (calm↔fired-up) that PERSISTS and
//     decays toward a baseline set by how close you two are + her warmth.
//   • Good days / bad days — a daily offset that colours everything.
//   • Opinions she forms, inside jokes you build, grudges that sting then fade.
//   • Personality DRIFT — treat her well over days and she opens up; neglect or
//     needle her and she guards up. The 9 axes slowly, believably move.
//  All of it feeds her prompt and her expressions.
// ============================================================================

import { State } from "./state.js";

const clamp = (v, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, v));
const now = () => Date.now();
const dayKey = () => Math.floor(now() / 86400000);
const AXES = ["warmth", "playfulness", "sass", "clinginess", "intelligence", "humor", "confidence", "shyness", "chaos"];

// named mood → target [valence, arousal] (matches the set_mood tool's vocabulary)
const MOOD_TARGET = {
  happy: [45, 10], content: [22, -5], playful: [30, 25], tired: [-3, -35], bored: [-12, -18],
  excited: [42, 35], lonely: [-28, -8], affectionate: [35, 8], annoyed: [-22, 25],
  focused: [8, 8], cozy: [20, -20], sad: [-35, -5],
};

// named emotional events → [Δvalence, Δarousal]
const FEELINGS = {
  compliment: [18, 8], gift: [22, 10], hug: [26, 6], headpat: [16, 4], cuddle: [24, -6],
  dance: [28, 12], date: [30, 10], kiss: [34, 14], reunion: [20, 12], praise: [22, 6],
  ignored: [-12, -6], left_alone: [-8, -4], insult: [-32, 22], reject: [-24, 6],
  argument: [-22, 24], teased: [-4, 10], win_game: [16, 18], lose_game: [-8, 10],
  good_food: [10, 2], tired: [-4, -14], accomplished: [14, 6],
};

// crude sentiment lexicon for reading his messages
const POS = /\b(love|adore|cute|adorable|beautiful|pretty|gorgeous|amazing|awesome|sweet|thank|thanks|proud|perfect|best|marry|missed you|miss you|good girl|smart|funny|happy|glad|care about you|you're the)\b/i;
const NEG = /\b(hate|stupid|dumb|idiot|shut up|ugly|annoying|boring|useless|worthless|leave me|go away|shut it|whatever|don't care|clingy|weird|creepy|cringe)\b/i;

export const Emotion = {
  refs: null,

  init(refs) {
    this.refs = refs;
    const e = this._s();
    if (!e.baselinePersonality) e.baselinePersonality = structuredClone(State.settings.personality || {});
    this._rollDay();
    return this;
  },

  _s() {
    return State.settings.emotion || (State.settings.emotion = {
      valence: 6, arousal: 0, dayMood: 0, day: dayKey(),
      opinions: [], jokes: [], grudges: [], treatAccum: 0, treatCount: 0,
      baselinePersonality: null,
    });
  },

  // baseline mood she gravitates back to: closeness + her warmth + today's mood
  _baseline() {
    const s = State.settings, e = this._s();
    const warm = ((s.personality?.warmth ?? 50) - 50) * 0.2;
    return clamp(-8 + (s.affection ?? 0) * 0.35 + warm + e.dayMood, -40, 60);
  },

  update(dt) {
    const e = this._s();
    // ease valence/arousal toward baseline (halflife ~3 min), arousal toward calm
    const k = Math.min(1, dt / 180);
    e.valence += (this._baseline() - e.valence) * k;
    e.arousal += (0 - e.arousal) * Math.min(1, dt / 90);
    // grudges fade over ~2 days
    if (e.grudges.length) e.grudges = e.grudges.filter((g) => (g.weight -= dt / 172800 * 100) > 3);
    // new real-world day?
    if (dayKey() !== e.day) this._rollDay();
    // publish a mood word for the rest of the game (HUD, expressions)
    State.world.mood = this.moodWord();
    State.world.lastMood = State.world.mood;
    this._persistThrottled();
  },

  _rollDay() {
    const e = this._s();
    e.day = dayKey();
    // yesterday's treatment tilts today's mood, plus a little randomness
    const avg = e.treatCount ? e.treatAccum / e.treatCount : 0;
    e.dayMood = clamp(avg * 0.5 + (Math.random() * 24 - 12), -22, 22);
    this._drift(avg);                // personality inches based on how she's treated
    e.treatAccum = 0; e.treatCount = 0;
    State.save();
  },

  // ---- events push her mood ----
  feel(kind, extraNote) {
    const d = FEELINGS[kind];
    if (!d) return;
    const e = this._s();
    e.valence = clamp(e.valence + d[0]);
    e.arousal = clamp(e.arousal + d[1]);
    e.treatAccum += d[0]; e.treatCount++;
    if (kind === "insult") this.addGrudge(extraNote || "you snapped at me");
    this._reflectExpression();
    State.save();
  },

  nudge(dv, da = 0) {
    const e = this._s();
    e.valence = clamp(e.valence + dv); e.arousal = clamp(e.arousal + da);
    e.treatAccum += dv; e.treatCount++;
  },

  // read his message, feel something about it
  observeUser(text) {
    if (!text) return;
    const pos = POS.test(text), neg = NEG.test(text);
    if (pos && !neg) { this.nudge(12, 4); }
    else if (neg && !pos) { this.feel("insult", text.slice(0, 60)); }
    else if (/\?$/.test(text.trim())) this.nudge(1, 2);
  },

  // ---- opinions / jokes / grudges (she curates these via a tool) ----
  addOpinion(about, feeling, note) {
    const e = this._s();
    const ex = e.opinions.find((o) => o.about?.toLowerCase() === String(about).toLowerCase());
    if (ex) { ex.feeling = feeling; ex.note = note || ex.note; ex.ts = now(); }
    else e.opinions.push({ about, feeling, note: note || "", ts: now() });
    e.opinions = e.opinions.slice(-24);
    State.save();
  },
  addJoke(text) { const e = this._s(); if (text) { e.jokes.push({ text: String(text).slice(0, 120), ts: now() }); e.jokes = e.jokes.slice(-16); State.save(); } },
  addGrudge(text) { const e = this._s(); if (text) { e.grudges.push({ text: String(text).slice(0, 120), weight: 100, ts: now() }); e.grudges = e.grudges.slice(-10); State.save(); } },

  // ---- personality drift (slow, bounded to ±18 from the original) ----
  _drift(avgTreat) {
    const s = State.settings, e = this._s(), base = e.baselinePersonality || {};
    if (!s.personality) return;
    const move = (key, amt) => {
      const b = base[key] ?? 50;
      s.personality[key] = clamp((s.personality[key] ?? b) + amt, Math.max(0, b - 18), Math.min(100, b + 18));
      s.personality[key] = Math.round(Math.max(0, Math.min(100, s.personality[key])));
    };
    if (avgTreat > 6) { move("warmth", 1.2); move("shyness", -1); move("confidence", 0.8); }
    else if (avgTreat < -6) { move("warmth", -1.2); move("shyness", 1.2); move("sass", 1); move("clinginess", -0.8); }
    State.save();
    State.bus.emit("settings:changed", { key: "personality", value: s.personality });
  },

  // let the AI (or admin) name a mood — biases her real affect toward it and holds
  // her chosen mood for ~a minute before natural feelings take back over
  setMood(name) {
    const t = MOOD_TARGET[name]; const e = this._s();
    if (t) { e.valence = clamp(e.valence * 0.3 + t[0] * 0.7); e.arousal = clamp(e.arousal * 0.3 + t[1] * 0.7); }
    e.moodOverride = name; e.moodOverrideUntil = now() + 60000;
    State.world.mood = name; State.world.lastMood = name;
    this._reflectExpression(); State.save();
  },

  // ---- outputs (vocabulary matches life.js MOOD_EXPR so expressions line up) ----
  moodWord() {
    const e = this._s();
    if (e.moodOverrideUntil && now() < e.moodOverrideUntil && e.moodOverride) return e.moodOverride;
    const v = e.valence, a = e.arousal;
    if (v > 42) return a > 22 ? "excited" : "happy";
    if (v > 15) return a > 28 ? "playful" : a < -18 ? "cozy" : "content";
    if (v > -10) return a < -22 ? "tired" : a > 28 ? "annoyed" : "bored";
    if (v > -32) return a > 22 ? "annoyed" : "lonely";
    return "sad";
  },

  _reflectExpression() {
    const map = { excited: "excited", happy: "happy", playful: "smug", content: "smile", cozy: "relax", tired: "sleepy", annoyed: "annoyed", bored: "neutral", lonely: "sad", sad: "sad", affectionate: "love", focused: "thinking" };
    this.refs?.akuu?.setExpression?.(map[this.moodWord()] || "neutral");
  },

  // the block injected into her system prompt
  promptBlock() {
    const e = this._s(), s = State.settings, name = s.playerName;
    const parts = [`YOUR INNER STATE right now (let it colour your tone naturally — never state numbers): you feel ${this.moodWord()}${e.dayMood > 8 ? " (it's been a good day)" : e.dayMood < -8 ? " (kind of an off day honestly)" : ""}.`];
    if (e.opinions.length) parts.push("Opinions you hold: " + e.opinions.slice(-6).map((o) => `${o.about} — ${o.feeling}`).join("; ") + ".");
    if (e.jokes.length) parts.push(`Inside jokes with ${name}: ` + e.jokes.slice(-4).map((j) => j.text).join("; ") + ".");
    const g = e.grudges.filter((x) => x.weight > 25);
    if (g.length) parts.push("Still a little sore about: " + g.map((x) => x.text).join("; ") + " (bring it up only if it fits).");
    return parts.join("\n");
  },

  _persistThrottled() {
    this._pt = (this._pt || 0) + 1;
    if (this._pt % 600 === 0) State.save();   // ~every 10s at 60fps
  },
};
