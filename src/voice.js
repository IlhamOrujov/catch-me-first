// ============================================================================
//  CATCH ME FIRST — voice.js
//  Talk to Alice with your actual voice: browser speech-to-text (🎤 in the chat
//  bar, or hold nothing — click toggles). What you say lands in the chat and
//  sends automatically.
// ============================================================================

import { State } from "./state.js";

const LANGS = { English: "en-US", Japanese: "ja-JP", Spanish: "es-ES", French: "fr-FR", German: "de-DE", Turkish: "tr-TR", Russian: "ru-RU", Arabic: "ar-SA", Korean: "ko-KR", Chinese: "zh-CN" };

export const Voice = {
  rec: null, listening: false,

  init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const bar = document.getElementById("chatBar");
    const input = document.getElementById("chatInput");
    if (!SR || !bar || !input) return;

    const btn = document.createElement("button");
    btn.id = "micBtn"; btn.textContent = "🎤"; btn.title = "Speak to Alice (click, talk, it sends)";
    bar.insertBefore(btn, input);

    const rec = new SR();
    rec.interimResults = true;
    rec.continuous = false;
    this.rec = rec;

    btn.onclick = () => {
      if (this.listening) { rec.stop(); return; }
      rec.lang = LANGS[State.settings.language] || "en-US";
      try { rec.start(); } catch {}
    };
    rec.onstart = () => { this.listening = true; btn.classList.add("live"); input.placeholder = "listening…"; };
    rec.onend = () => {
      this.listening = false; btn.classList.remove("live"); input.placeholder = "Say something to Akuu…";
      const t = input.value.trim();
      if (t && this._final) { document.getElementById("sendBtn")?.click(); }
      this._final = false;
    };
    rec.onerror = () => { this.listening = false; btn.classList.remove("live"); };
    rec.onresult = (e) => {
      let text = "";
      for (const r of e.results) { text += r[0].transcript; if (r.isFinal) this._final = true; }
      input.value = text.trim();
    };
  },
};
