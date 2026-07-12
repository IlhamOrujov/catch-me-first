// ============================================================================
//  CATCH ME FIRST — liveface.js   ("Live emotional face")
//  Her face reacts to the conversation in real time — she blushes the instant
//  you say something sweet, her face falls on a sad topic, eyes widen in
//  surprise, softens back to her mood after. Layers on top of the emotion model.
// ============================================================================

import { State } from "./state.js";

// what a line is emotionally "about" → [expression, blush 0..1]
const CUES = [
  [/\b(love you|i love|cute|beautiful|pretty|gorgeous|adorable|marry|kiss|sweetheart|darling|cuddle|hold you|you're mine|my girl)\b|♡|❤|😘|🥰|😍/, "blush", 1],
  [/\b(haha|haha|lol|lmao|lmfao|funny|hilarious)\b|😂|🤣/, "laugh", 0],
  [/\b(happy|yay|great|awesome|amazing|excited|so good|the best|proud of you|thank you|thanks|congrats)\b|😊|😄|🎉/, "happy", 0],
  [/\b(sad|sorry|cry|crying|hurts?|lonely|depressed|bad day|upset|worried|anxious|scared|afraid|miss you|grief)\b|😢|😭|🥺/, "sad", 0],
  [/\b(what|really|no way|wow|omg|whoa|shocked|surprised|unbelievable)\b|[!?]{2,}/, "surprised", 0],
  [/\b(hate|angry|mad|stupid|shut up|annoying|ugh|whatever)\b|😠|😡/, "annoyed", 0],
];
const MOOD_FACE = { happy: "happy", excited: "happy", playful: "smile", affectionate: "blush", content: "smile", cozy: "smile", giddy: "laugh", tired: "sleepy", bored: "neutral", annoyed: "annoyed", lonely: "sad", sad: "sad" };

export const LiveFace = {
  refs: null, _reacting: false, _holdT: null,

  init(refs) {
    this.refs = refs;                                  // { akuu, emotion }
    State.bus.on("user:said", (t) => this._react(t));           // the instant you speak
    State.bus.on("akuu:say", (p) => { if (p && !p.idle) this._react(p.text); });   // and to her own reply
    return this;
  },

  _react(text) {
    const t = String(text || "").toLowerCase();
    if (t.length < 2) return;
    for (const [re, expr, blush] of CUES) if (re.test(t)) { this._hold(expr, blush); return; }
  },

  _hold(expr, blush) {
    const a = this.refs.akuu; if (!a) return;
    clearTimeout(this._holdT);
    try { if (blush) a._blushLevel = 1; a.setExpression?.(expr); } catch {}
    this._reacting = true;
    this._holdT = setTimeout(() => { this._reacting = false; try { a._blushLevel = this._baseBlush(); } catch {} this._rest(); }, 3600);
  },

  // resting blush rises with how close you two are
  _baseBlush() { return Math.min(0.5, (State.settings.affection || 0) / 200); },

  // settle back to the face that matches her current mood
  _rest() {
    const a = this.refs.akuu; if (!a || this._reacting) return;
    try { const w = this.refs.emotion?.moodWord?.() || State.world.mood || "content"; a.setExpression?.(MOOD_FACE[w] || "neutral"); } catch {}
  },
};
