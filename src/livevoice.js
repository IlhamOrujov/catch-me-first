// ============================================================================
//  CATCH ME FIRST — livevoice.js   ("Just talk to her")
//  Hands-free voice conversation: you speak → she thinks → she answers OUT LOUD
//  with lip-sync, then listens again. A real call, not a chatbox.
//    • continuous turn-taking loop (STT → LLM → her TTS voice → repeat)
//    • pauses the mic while she speaks so she never hears herself
//    • an animated orb reflects listen / think / speak state
//  Start with the 🎙️ dock button or Shift+V.
// ============================================================================

import { State } from "./state.js";

export const LiveVoice = {
  refs: null, active: false, rec: null, SR: null, _prevTts: null,

  init(refs) {
    this.refs = refs;                         // { brain, audio, akuu, ui }
    this.SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._button();
    this._overlay();
    addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName);
      if (!typing && e.shiftKey && (e.key === "V" || e.key === "v")) { e.preventDefault(); this.toggle(); }
    });
    // resume listening the moment she finishes speaking
    State.bus.on("tts:end", () => { if (this.active && this._waiting) { this._waiting = false; clearTimeout(this._fallback); setTimeout(() => this.active && this._listen(), 350); } });
    return this;
  },

  _button() {
    let b = document.getElementById("liveVoiceBtn");
    if (!b) { b = document.createElement("button"); b.id = "liveVoiceBtn"; document.body.append(b); }
    b.innerHTML = "🎙️";
    b.title = "Talk to her live (Shift+V)";
    b.onclick = () => this.toggle();
    this.btn = b;
  },

  _overlay() {
    let o = document.getElementById("liveVoice");
    if (!o) { o = document.createElement("div"); o.id = "liveVoice"; document.body.append(o); }
    o.innerHTML = `
      <div class="lv-inner">
        <div class="lv-orb"><i></i><i></i><i></i></div>
        <div class="lv-name">${(State.settings.aiName || "Alice")} <span>♡</span></div>
        <div class="lv-status" id="lvStatus">tap the mic and talk</div>
        <div class="lv-transcript" id="lvTx"></div>
        <button class="lv-end" id="lvEnd">✕ end call</button>
      </div>`;
    o.querySelector("#lvEnd").onclick = () => this.stop();
    this.overlay = o;
  },

  toggle() { this.active ? this.stop() : this.start(); },

  start() {
    if (!this.SR) { this.refs.ui?.toast?.("🎙️ voice input isn't supported in this browser — use the chat"); return; }
    this.active = true;
    this.overlay.classList.add("show");
    document.body.classList.add("lv-on");
    this.btn?.classList.add("on");
    this._prevTts = State.settings.ttsEnabled;
    State.set?.("ttsEnabled", true);                 // she must speak out loud in a call
    try { this.refs.audio?.resume?.(); } catch {}
    this._listen();
  },

  stop() {
    this.active = false; this._waiting = false; clearTimeout(this._fallback);
    try { this.rec?.abort(); } catch {}
    try { window.speechSynthesis?.cancel(); } catch {}
    this.rec = null;
    this.overlay.classList.remove("show");
    document.body.classList.remove("lv-on");
    this.btn?.classList.remove("on");
    if (this._prevTts != null) State.set?.("ttsEnabled", this._prevTts);
    this._state("idle", "tap the mic and talk");
  },

  _state(cls, text) { this.overlay.dataset.state = cls; const el = document.getElementById("lvStatus"); if (el && text != null) el.textContent = text; },

  _listen() {
    if (!this.active) return;
    this._state("listen", "listening…");
    const s = State.settings;
    const rec = new this.SR();
    rec.lang = ({ English: "en-US", Japanese: "ja-JP", Turkish: "tr-TR" })[s.language] || "en-US";
    rec.interimResults = true; rec.continuous = false;
    this.rec = rec;
    let finalT = "";
    rec.onresult = (e) => {
      let interim = ""; finalT = "";
      for (const r of e.results) { if (r.isFinal) finalT += r[0].transcript; else interim += r[0].transcript; }
      const tx = document.getElementById("lvTx"); if (tx) tx.textContent = finalT || interim;
    };
    rec.onerror = (e) => { if (e.error === "not-allowed") { this.refs.ui?.toast?.("🎙️ allow mic access to talk to her"); this.stop(); } };
    rec.onend = () => { if (!this.active) return; const t = finalT.trim(); t ? this._respond(t) : (this.active && this._listen()); };
    try { rec.start(); } catch { setTimeout(() => this.active && this._listen(), 600); }
  },

  _respond(text) {
    this._state("think", "thinking…");
    const tx = document.getElementById("lvTx"); if (tx) tx.textContent = "you: " + text;
    const b = this.refs.brain;
    if (!b?.send) { this._listen(); return; }
    // she replies via akuu:say → Audio.speak (lip-synced). Wait for tts:end, then listen.
    this._waiting = true;
    b.send(text).then((r) => {
      if (!this.active) return;
      if (r?.text) {
        this._state("speak", "speaking…");
        const tx2 = document.getElementById("lvTx"); if (tx2) tx2.textContent = r.text.slice(0, 160);
        // fallback in case TTS is muted/blocked so the loop never stalls
        clearTimeout(this._fallback);
        this._fallback = setTimeout(() => { if (this.active && this._waiting) { this._waiting = false; this._listen(); } }, Math.min(14000, 2500 + r.text.length * 55));
      } else { this._waiting = false; this._listen(); }
    }).catch(() => { this._waiting = false; if (this.active) this._listen(); });
  },
};
