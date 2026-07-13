// ============================================================================
//  CATCH ME FIRST — worldbuilder.js   ("Describe any world")
//  Reshape the whole world in a tap: sunset beach, snowy night, deep space,
//  enchanted forest, neon city, candlelit, cherry blossom, underwater, rain.
//  Each preset repaints the sky, fog, light + a themed particle field —
//  instant and offline. Or type a description and she rebuilds it (reality engine).
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

const PRESETS = {
  beach: { label: "🏖 Beach sunset", sky: ["#ffd9a0", "#ff7e5f"], fog: ["#ffe0c0", 0.010], sun: ["#ffcf9a", 1.7], amb: 0.7, p: "petals" },
  snow: { label: "❄️ Snowy night", sky: ["#3a4a6a", "#8fa4c4"], fog: ["#c8d4e8", 0.028], sun: ["#cfe0ff", 0.85], amb: 0.5, p: "snow" },
  space: { label: "🌌 Deep space", sky: ["#05030f", "#140a2e"], fog: null, sun: ["#8090ff", 0.4], amb: 0.35, p: "stars" },
  forest: { label: "🌲 Enchanted forest", sky: ["#3a5a3a", "#9ac48f"], fog: ["#4a6a4a", 0.035], sun: ["#c8ffb0", 1.2], amb: 0.55, p: "leaves" },
  neon: { label: "🌃 Neon city", sky: ["#1a0a2a", "#3a0a5a"], fog: ["#2a0a3a", 0.020], sun: ["#ff40ff", 1.0], amb: 0.5, p: "embers" },
  candle: { label: "🕯 Candlelit", sky: ["#1a0f0a", "#3a1f10"], fog: ["#2a1508", 0.030], sun: ["#ff9a40", 0.55], amb: 0.35, p: "embers" },
  sakura: { label: "🌸 Cherry blossom", sky: ["#ffd0e0", "#ffa8c8"], fog: ["#ffe0ec", 0.010], sun: ["#ffd9e6", 1.5], amb: 0.7, p: "petals" },
  ocean: { label: "🌊 Underwater", sky: ["#0a2a4a", "#106a9a"], fog: ["#0a4a6a", 0.045], sun: ["#40c0ff", 1.0], amb: 0.55, p: "bubbles" },
  rain: { label: "🌧 Rainy day", sky: ["#3a3a4a", "#6a6a7a"], fog: ["#4a4a5a", 0.028], sun: ["#a0a0b0", 0.7], amb: 0.5, p: "rain" },
};
const COL = { snow: "#ffffff", petals: "#ff9ec8", rain: "#a8c8ff", stars: "#ffffff", bubbles: "#a0e0ff", embers: "#ff9a40", leaves: "#c8e08f" };
const SIZE = { snow: 0.09, petals: 0.12, rain: 0.05, stars: 0.06, bubbles: 0.08, embers: 0.07, leaves: 0.11 };

export const WorldBuilder = {
  refs: null, _pts: null, _kind: null, _vel: null,

  init(refs) { this.refs = refs; this._button(); return this; },   // { scene, dorm, brain, ui }

  _button() {
    const hud = document.querySelector(".hud-right") || document.body;
    let b = document.getElementById("worldBtn");
    if (!b) { b = document.createElement("button"); b.id = "worldBtn"; b.className = "icon-btn"; hud.appendChild(b); }
    b.textContent = "🌍"; b.title = "World Builder — reshape the world";
    b.onclick = () => this.toggle();
    let p = document.getElementById("worldBuilder");
    if (!p) { p = document.createElement("div"); p.id = "worldBuilder"; p.className = "side-panel"; document.body.appendChild(p); }
    this.panel = p;
  },

  toggle(f) { const open = f ?? !this.panel.classList.contains("open"); this.panel.classList.toggle("open", open); if (open) this._render(); },

  _render() {
    this.panel.innerHTML = `
      <div class="wb-head"><b>🌍 World Builder</b><button class="wb-x" id="wbX">✕</button></div>
      <div class="wb-hint">tap a world — or describe your own</div>
      <div class="wb-grid">${Object.entries(PRESETS).map(([k, v]) => `<button class="wb-p" data-w="${k}">${v.label}</button>`).join("")}</div>
      <div class="wb-desc"><input id="wbInput" placeholder="a floating island at dawn…" autocomplete="off"><button id="wbGo">✨</button></div>
      <button class="wb-reset" id="wbReset">↺ back to the apartment</button>
      <div class="wb-status" id="wbStatus"></div>`;
    this.panel.querySelector("#wbX").onclick = () => this.toggle(false);
    this.panel.querySelectorAll(".wb-p").forEach((b) => b.onclick = () => this._apply(b.dataset.w));
    this.panel.querySelector("#wbReset").onclick = () => this._reset();
    const input = this.panel.querySelector("#wbInput");
    const go = () => { const v = input.value.trim(); if (v) this._freeform(v); };
    this.panel.querySelector("#wbGo").onclick = go;
    input.onkeydown = (e) => { if (e.key === "Enter") go(); };
  },
  _say(t) { const el = document.getElementById("wbStatus"); if (el) el.textContent = t; },

  _grad(top, bottom) {
    const c = document.createElement("canvas"); c.width = 16; c.height = 256;
    const g = c.getContext("2d"); const lg = g.createLinearGradient(0, 0, 0, 256);
    lg.addColorStop(0, top); lg.addColorStop(1, bottom); g.fillStyle = lg; g.fillRect(0, 0, 16, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  },

  _apply(name) {
    const P = PRESETS[name]; if (!P) return; const sc = this.refs.scene;
    State.world.skyLock = true;
    sc.background = this._grad(P.sky[0], P.sky[1]);
    sc.fog = P.fog ? new THREE.FogExp2(new THREE.Color(P.fog[0]).getHex(), P.fog[1]) : null;
    const sun = this.refs.dorm?.sun; if (sun) { sun.color.set(P.sun[0]); sun.intensity = P.sun[1]; }
    const amb = this.refs.dorm?.ambient; if (amb) amb.intensity = P.amb ?? 0.55;
    const hemi = this.refs.dorm?.hemi; if (hemi) hemi.color.set(P.sky[1]);
    this._particles(P.p);
    this._say(P.label + " ✓");
    try { State.bus.emit("akuu:say", { text: pickLine(name), tools: [], idle: true }); } catch {}
  },

  _reset() {
    State.world.skyLock = false;
    this._clear();
    this.refs.scene.fog = null;
    const sun = this.refs.dorm?.sun; if (sun) { sun.color.set(0xfff2d6); sun.intensity = 1; }
    const amb = this.refs.dorm?.ambient; if (amb) amb.intensity = 0.55;
    const hemi = this.refs.dorm?.hemi; if (hemi) hemi.color.set(0xbfd4ff);
    this._say("back home ♡");
  },

  _freeform(desc) {
    this._say("she's reshaping the world…");
    const b = this.refs.brain;
    if (!b?.send) { this._say("needs a Groq key for freeform worlds"); return; }
    b.send(`(Use your reality-engine powers to transform our whole surroundings into: ${desc}. Rebuild the scene visually and describe it in one line.)`)
      .then((r) => this._say(r?.text ? "✨ " + r.text.slice(0, 60) : "done ✨"))
      .catch(() => this._say("couldn't reach her powers (add a key)"));
  },

  _particles(kind) {
    this._clear(); if (!kind) return;
    const N = kind === "stars" ? 700 : kind === "rain" ? 900 : 420;
    const pos = new Float32Array(N * 3); this._vel = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = -9 + Math.random() * 18; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = -9 + Math.random() * 18; this._vel[i] = 0.4 + Math.random() * 0.9; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const additive = kind === "stars" || kind === "embers";
    const mat = new THREE.PointsMaterial({ color: COL[kind] || "#fff", size: SIZE[kind] || 0.08, transparent: true, opacity: 0.85, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this._pts = new THREE.Points(geo, mat); this._pts.frustumCulled = false; this._kind = kind; this.refs.scene.add(this._pts);
  },
  _clear() { if (this._pts) { this.refs.scene.remove(this._pts); this._pts.geometry.dispose(); this._pts.material.dispose(); this._pts = null; this._kind = null; } },

  update(dt) {
    if (!this._pts) return;
    const k = this._kind;
    if (k === "stars") { this._pts.material.opacity = 0.45 + 0.45 * Math.abs(Math.sin(performance.now() * 0.001)); return; }
    const p = this._pts.geometry.attributes.position.array, rise = (k === "bubbles" || k === "embers"), sp = k === "rain" ? 5 : 1.2;
    for (let i = 0; i < this._vel.length; i++) {
      const y = i * 3 + 1;
      p[y] += (rise ? 1 : -1) * this._vel[i] * dt * sp;
      p[i * 3] += Math.sin(performance.now() * 0.001 + i) * dt * 0.25;
      if (!rise && p[y] < 0) { p[y] = 7; } else if (rise && p[y] > 7) { p[y] = 0; }
    }
    this._pts.geometry.attributes.position.needsUpdate = true;
  },
};

function pickLine(name) {
  const L = {
    beach: "the ocean… take me here someday? ♡", snow: "it's snowing~ don't let go of my hand", space: "just us and the stars ✨",
    forest: "listen… it's so peaceful here", neon: "the city's glowing for us tonight", candle: "mmh, so cozy… come closer ♡",
    sakura: "the petals suit you ♡", ocean: "we're underwater?! hold your breath~ hehe", rain: "i love the rain when you're here",
  };
  return L[name] || "woah… you changed the whole world ♡";
}
