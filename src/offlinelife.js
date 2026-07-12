// ============================================================================
//  CATCH ME FIRST — offlinelife.js   ("She lives while you're gone")
//  Tab hidden or reload after a while → she keeps living: does little things,
//  texts your phone, sends browser notifications, and greets you with a
//  "while you were gone ♡" recap when you come back. Absence has weight now.
// ============================================================================

import { State } from "./state.js";

const ACTS = [
  "made tea and watched the rain ☔", "tidied up the living room", "drew you a little something ✏️",
  "napped on the couch 😴", "practiced a song for you 🎵", "reorganised the bookshelf",
  "waited by the window for you", "cooked dinner for two (…ate yours too, sorry ♡)",
  "folded the laundry, humming to myself", "looked through our photos 🖼️", "tried a new recipe",
  "watered the plants 🪴", "wrote in my diary about you", "watched the sunset alone 🌇",
];
const TEXTS = [
  "miss you already ♡", "when are you coming back?", "the apartment's too quiet without you 🥺",
  "made your favourite — hurry home", "thinking about you rn", "come home soon? ♡",
  "it's lonely here without you", "i saved you a seat by the window", "hope you're okay out there ♡",
];

export const OfflineLife = {
  refs: null, _timer: null, _away: null, _hb: null,

  init(refs) {
    this.refs = refs;                                  // { phone, ui }
    const s = State.settings;
    // came back after a real absence (page was closed / reloaded)
    if (s.lastSeenTs) { const gap = Date.now() - s.lastSeenTs; if (gap > 20 * 60000) this._recap(gap, true); }
    this._mark();
    this._hb = setInterval(() => this._mark(), 30000);
    document.addEventListener("visibilitychange", () => (document.hidden ? this._leave() : this._return()));
    // ask for notification permission once, on a real user gesture
    addEventListener("pointerdown", () => { try { if (window.Notification && Notification.permission === "default") Notification.requestPermission().catch(() => {}); } catch {} }, { once: true });
    return this;
  },

  _mark() { State.settings.lastSeenTs = Date.now(); },

  _leave() { this._away = { start: Date.now(), beats: [], texts: 0 }; this._schedule(); },
  _schedule() { clearTimeout(this._timer); this._timer = setTimeout(() => { if (!document.hidden) return; this._beat(); this._schedule(); }, 70000 + Math.random() * 80000); },
  _beat() {
    if (!this._away) this._away = { start: Date.now(), beats: [], texts: 0 };
    this._away.beats.push(ACTS[Math.floor(Math.random() * ACTS.length)]);
    const txt = TEXTS[Math.floor(Math.random() * TEXTS.length)];
    try { this.refs.phone?.receive?.(txt); } catch {}
    this._away.texts++; this._notify(txt); State.world.away = true;
  },
  _notify(text) { try { if (window.Notification && Notification.permission === "granted") new Notification((State.settings.aiName || "Alice") + " ♡", { body: text }); } catch {} },

  _return() {
    clearTimeout(this._timer); State.world.away = false;
    if (this._away && Date.now() - this._away.start > 45000) this._recap(Date.now() - this._away.start, false, this._away.beats);
    this._away = null; this._mark();
  },

  _recap(gap, cold, beats) {
    const mins = Math.max(1, Math.round(gap / 60000));
    let acts = (beats && beats.length) ? beats.slice() : Array.from({ length: Math.min(4, 1 + Math.floor(mins / 25)) }, () => ACTS[Math.floor(Math.random() * ACTS.length)]);
    acts = [...new Set(acts)].slice(0, 4);
    if (cold) { try { this.refs.phone?.receive?.(`welcome back ♡ you were gone ${this._dur(mins)}… i missed you`); } catch {} }
    this._card(mins, acts, cold);
    try { State.bus.emit("akuu:say", { text: cold ? "oh— you're back! ♡ i missed you so much" : "there you are ♡ welcome home", tools: [], idle: true }); } catch {}
  },
  _dur(mins) { return mins < 60 ? mins + " min" : Math.round(mins / 60) + "h"; },

  _card(mins, acts, cold) {
    document.getElementById("awayRecap")?.remove();
    const el = document.createElement("div"); el.id = "awayRecap";
    el.innerHTML = `<div class="ar-card">
      <div class="ar-h">💌 While you were gone</div>
      <div class="ar-sub">${this._dur(mins)} apart · she thought about you</div>
      <ul class="ar-list">${acts.map(() => "<li></li>").join("")}</ul>
      <button class="ar-btn" id="arBtn">welcome home ♡</button></div>`;
    document.body.appendChild(el);
    el.querySelectorAll(".ar-list li").forEach((li, i) => (li.textContent = acts[i]));
    el.querySelector("#arBtn").onclick = () => el.remove();
    setTimeout(() => document.getElementById("awayRecap")?.remove(), 22000);
  },
};
