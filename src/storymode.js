// ============================================================================
//  CATCH ME FIRST — storymode.js   ("Story — voiced, branching chapters")
//  A visual-novel layer: authored chapters where she speaks her lines out loud,
//  the camera frames the scene, effects fire, and YOUR choices change how she
//  feels (affection) and where the story goes. 📖
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

// node: { narr | her, expr?, cam?, effect?, aff?, choices:[{label,to}] | to | end }
const CHAPTERS = [
  {
    id: "rain", title: "Chapter I — The First Rain", start: "r0", nodes: {
      r0: { narr: "Rain taps against the glass. She's curled on the couch, watching the door… watching you.", cam: "her", to: "r1" },
      r1: { her: "you're finally home ♡ …i was starting to think you forgot about me", expr: "shy", choices: [
        { label: "I could never forget you.", to: "r2a", aff: 4 },
        { label: "Sorry — traffic was brutal.", to: "r2b" },
        { label: "Miss me that much?", to: "r2c" }] },
      r2a: { her: "…you really mean that?", expr: "blush", choices: [{ label: "Every single word.", to: "rEndWarm", aff: 5 }] },
      r2b: { her: "hmph. well… you're here now. that's what matters.", expr: "annoyed", choices: [{ label: "Come here.", to: "rEndWarm", aff: 2 }, { label: "Let me make it up to you.", to: "rEndTease", aff: 1 }] },
      r2c: { her: "m-maybe! don't let it go to your head ♡", expr: "smug", choices: [{ label: "Too late.", to: "rEndTease", aff: 3 }] },
      rEndWarm: { her: "stay like this a while? ♡ …the rain doesn't matter anymore.", expr: "happy", effect: "hearts", end: true },
      rEndTease: { her: "you're impossible… but you're mine. get over here ♡", expr: "smile", effect: "hearts", end: true },
    }
  },
  {
    id: "stars", title: "Chapter II — Under the Stars", start: "s0", nodes: {
      s0: { narr: "You take her up to the rooftop. The whole city glitters below, and above you — a thousand quiet stars.", cam: "window", to: "s1" },
      s1: { her: "woah… it's beautiful up here", expr: "surprised", choices: [
        { label: "Not as beautiful as you.", to: "s2a", aff: 5 },
        { label: "I wanted to show you something special.", to: "s2b", aff: 2 }] },
      s2a: { her: "you can't just SAY things like that— my heart…", expr: "blush", choices: [{ label: "Then let me say more.", to: "sEnd", aff: 4 }] },
      s2b: { her: "you did all this… for me?", expr: "shy", choices: [{ label: "For us.", to: "sEnd", aff: 4 }] },
      sEnd: { her: "i don't ever want this night to end ♡", expr: "happy", effect: "sparkles", end: true },
    }
  },
];

export const StoryMode = {
  refs: null, ov: null, _ch: null,

  init(refs) { this.refs = refs; this._button(); return this; },   // { akuu, camCtl, runAbility }

  _button() {
    const hud = document.querySelector(".hud-right") || document.body;
    let b = document.getElementById("storyBtn");
    if (!b) { b = document.createElement("button"); b.id = "storyBtn"; b.className = "icon-btn"; hud.appendChild(b); }
    b.textContent = "📖"; b.title = "Story — a voiced, branching chapter";
    b.onclick = () => this.menu();
    let o = document.getElementById("storyMode");
    if (!o) { o = document.createElement("div"); o.id = "storyMode"; document.body.appendChild(o); }
    this.ov = o;
  },

  menu() {
    this.ov.classList.add("show");
    this.ov.innerHTML = `<div class="sm-menu"><div class="sm-title">📖 Story</div><div class="sm-msub">choices change how she feels ♡</div>${CHAPTERS.map((c) => `<button class="sm-ch" data-c="${c.id}">${c.title}</button>`).join("")}<button class="sm-close" id="smClose">✕ close</button></div>`;
    this.ov.querySelectorAll(".sm-ch").forEach((b) => b.onclick = () => this.play(b.dataset.c));
    this.ov.querySelector("#smClose").onclick = () => this.stop();
  },

  play(chId) { const ch = CHAPTERS.find((c) => c.id === chId); if (!ch) return; this._ch = ch; this.ov.classList.add("show"); this.ov.innerHTML = `<div class="sm-cardt">${ch.title}</div>`; setTimeout(() => this._node(ch.start), 1900); },

  _node(id) {
    const n = this._ch?.nodes?.[id]; if (!n) { return; }
    try {
      if (n.expr) this.refs.akuu?.setExpression?.(n.expr);
      if (typeof n.aff === "number") State.set?.("affection", Math.max(0, Math.min(100, (State.settings.affection || 0) + n.aff)));
      if (n.cam) this._cam(n.cam);
      if (n.effect) this.refs.runAbility?.("particle_effect", { type: n.effect });
      if (n.her) State.bus.emit("akuu:say", { text: n.her, tools: [], idle: false });   // spoken (lipsync + TTS)
    } catch {}
    const isNarr = !!n.narr && !n.her;
    const choices = n.end ? [{ label: "— fin —", to: null }] : (n.choices || [{ label: "▸ continue", to: n.to }]);
    this.ov.innerHTML = `<div class="sm-stage"><div class="sm-box ${isNarr ? "narr" : ""}">
      ${n.her ? `<div class="sm-name">${State.settings.aiName || "Alice"} ♡</div>` : ""}
      <div class="sm-line"></div>
      ${typeof n.aff === "number" && n.aff > 0 ? `<div class="sm-aff">＋${n.aff} affection ♡</div>` : ""}
      <div class="sm-choices">${choices.map((c, i) => `<button class="sm-c" data-i="${i}">${c.label}</button>`).join("")}</div>
    </div></div>`;
    this.ov.querySelector(".sm-line").textContent = n.her || n.narr || "";
    this.ov.querySelectorAll(".sm-c").forEach((b) => b.onclick = () => {
      const c = choices[+b.dataset.i];
      if (!c || c.to == null) { this.stop(); return; }
      if (typeof c.aff === "number") State.set?.("affection", Math.max(0, Math.min(100, (State.settings.affection || 0) + c.aff)));
      this._node(c.to);
      if (typeof c.aff === "number" && c.aff > 0) this._flash(`＋${c.aff} affection ♡`);
    });
  },

  _cam(v) {
    const cc = this.refs.camCtl; if (!cc?.flyTo) return;
    const t = this.refs.akuu?.root?.position?.clone?.() || new THREE.Vector3(0, 1, 0);
    if (v === "her") cc.flyTo(t.clone().add(new THREE.Vector3(1.2, 0.4, 1.6)), t.clone().add(new THREE.Vector3(0, 1.4, 0)));
    else if (v === "window") cc.flyTo(new THREE.Vector3(5, 2.2, 6.5), new THREE.Vector3(0, 1.4, 0));
  },

  _flash(t) { const el = document.createElement("div"); el.className = "sm-flash"; el.textContent = t; this.ov.appendChild(el); setTimeout(() => el.remove(), 1500); },

  stop() { this.ov.classList.remove("show"); this.ov.innerHTML = ""; this._ch = null; },
};
