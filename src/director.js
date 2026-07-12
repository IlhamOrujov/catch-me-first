// ============================================================================
//  CATCH ME FIRST — director.js   ("Director mode")
//  Write a scene as a list of beats — a line she says, an expression, a gesture,
//  a camera move, an effect, a pause — and hit Play. She performs the whole
//  thing cinematically. Save scenes and replay them. 🎬
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

const BEATS = [["say", "💬 line"], ["express", "😊 mood"], ["gesture", "👋 gesture"], ["camera", "🎥 camera"], ["move", "🚶 move"], ["effect", "✨ effect"], ["wait", "⏱ wait"]];
const EXPR = ["neutral", "happy", "smile", "blush", "shy", "smug", "surprised", "sad", "wink"];
const GEST = ["wave", "heart", "peace", "nod", "cheer", "shrug", "dance", "think"];
const CAMS = ["her (close-up)", "overview", "by the window", "cinematic pan"];
const FX = ["sparkles", "hearts", "confetti", "petals", "snow", "magic"];

export const Director = {
  refs: null, playing: false, _scene: [],

  init(refs) {
    this.refs = refs;                        // { akuu, camCtl, runAbility }
    if (!State.settings.directorScenes) State.settings.directorScenes = {};
    this._button();
    return this;
  },

  _button() {
    const hud = document.querySelector(".hud-right") || document.body;
    let b = document.getElementById("directorBtn");
    if (!b) { b = document.createElement("button"); b.id = "directorBtn"; b.className = "icon-btn"; hud.appendChild(b); }
    b.textContent = "🎬"; b.title = "Director — write a scene, she performs it";
    b.onclick = () => this.toggle();
    let p = document.getElementById("director");
    if (!p) { p = document.createElement("div"); p.id = "director"; p.className = "side-panel"; document.body.appendChild(p); }
    this.panel = p;
  },

  toggle(f) { const open = f ?? !this.panel.classList.contains("open"); this.panel.classList.toggle("open", open); if (open) this._render(); },

  _render() {
    const scenes = Object.keys(State.settings.directorScenes || {});
    this.panel.innerHTML = `
      <div class="dr-head"><b>🎬 Director</b><button class="dr-x" id="drX">✕</button></div>
      <div class="dr-hint">add beats, then play — she performs the scene</div>
      <div class="dr-add"></div>
      <div class="dr-scene" id="drScene"></div>
      <div class="dr-foot">
        <button class="dr-b hot" id="drPlay">▶ Play</button>
        <button class="dr-b" id="drStop">⏹</button>
        <button class="dr-b" id="drSave">💾 Save</button>
        <button class="dr-b" id="drClear">Clear</button>
      </div>
      ${scenes.length ? `<div class="dr-saved">${scenes.map((n) => `<button class="dr-b sm" data-load="${n}">📁 ${n}</button>`).join("")}</div>` : ""}`;
    const add = this.panel.querySelector(".dr-add");
    BEATS.forEach(([t, l]) => { const b = document.createElement("button"); b.className = "dr-add-b"; b.textContent = l; b.onclick = () => this._addBeat(t); add.appendChild(b); });
    this._renderScene();
    this.panel.querySelector("#drX").onclick = () => this.toggle(false);
    this.panel.querySelector("#drPlay").onclick = () => this.play();
    this.panel.querySelector("#drStop").onclick = () => { this.playing = false; };
    this.panel.querySelector("#drSave").onclick = () => { const n = prompt("Scene name:"); if (n) { State.settings.directorScenes[n] = JSON.parse(JSON.stringify(this._scene)); State.save?.(); this._render(); } };
    this.panel.querySelector("#drClear").onclick = () => { this._scene = []; this._renderScene(); };
    this.panel.querySelectorAll("[data-load]").forEach((b) => b.onclick = () => { this._scene = JSON.parse(JSON.stringify(State.settings.directorScenes[b.dataset.load] || [])); this._renderScene(); });
  },

  _addBeat(type) {
    const d = { say: { text: "hey, come here ♡" }, express: { v: "happy" }, gesture: { v: "wave" }, camera: { v: "her (close-up)" }, move: { v: this._places()[0] || "sofa" }, effect: { v: "sparkles" }, wait: { v: 1 } }[type] || {};
    this._scene.push({ type, ...d }); this._renderScene();
  },
  _places() { const h = (State.settings.hotspots || []).map((x) => x.id); return h.length ? h.slice(0, 14) : ["sofa", "kitchen", "bed", "window", "desk"]; },

  _renderScene() {
    const el = this.panel.querySelector("#drScene"); if (!el) return; el.innerHTML = "";
    if (!this._scene.length) { el.innerHTML = `<p class="dr-empty">no beats yet — tap one above ↑</p>`; return; }
    this._scene.forEach((b, i) => {
      const row = document.createElement("div"); row.className = "dr-row";
      const n = document.createElement("span"); n.className = "dr-n"; n.textContent = i + 1;
      const lbl = document.createElement("span"); lbl.className = "dr-type"; lbl.textContent = b.type;
      let ctl;
      if (b.type === "say") { ctl = document.createElement("input"); ctl.value = b.text; ctl.oninput = () => b.text = ctl.value; }
      else if (b.type === "wait") { ctl = document.createElement("input"); ctl.type = "number"; ctl.min = "0"; ctl.step = "0.5"; ctl.value = b.v; ctl.oninput = () => b.v = +ctl.value; }
      else { ctl = document.createElement("select"); const opts = { express: EXPR, gesture: GEST, camera: CAMS, effect: FX, move: this._places() }[b.type] || []; opts.forEach((o) => { const op = document.createElement("option"); op.value = o; op.textContent = o; if (o === b.v) op.selected = true; ctl.appendChild(op); }); ctl.onchange = () => b.v = ctl.value; }
      ctl.className = "dr-ctl";
      const del = document.createElement("button"); del.className = "dr-del"; del.textContent = "✕"; del.onclick = () => { this._scene.splice(i, 1); this._renderScene(); };
      const up = document.createElement("button"); up.className = "dr-mv"; up.textContent = "↑"; up.onclick = () => { if (i > 0) { [this._scene[i - 1], this._scene[i]] = [this._scene[i], this._scene[i - 1]]; this._renderScene(); } };
      row.append(n, lbl, ctl, up, del); el.appendChild(row);
    });
  },

  async play() {
    if (this.playing || !this._scene.length) return;
    this.playing = true; this._now("🎬 Action…");
    for (const b of this._scene) { if (!this.playing) break; await this._run(b); }
    this.playing = false; this._now("");
  },
  _now(t) { let o = document.getElementById("drNow"); if (!t) { o?.remove(); return; } if (!o) { o = document.createElement("div"); o.id = "drNow"; document.body.appendChild(o); } o.textContent = t; },
  _wait(ms) { return new Promise((r) => setTimeout(r, ms)); },

  async _run(b) {
    const A = this.refs.akuu, cc = this.refs.camCtl;
    try {
      switch (b.type) {
        case "say": this._now("💬 " + b.text.slice(0, 44)); State.bus.emit("akuu:say", { text: b.text, tools: [], idle: false }); await this._wait(1700 + (b.text.length) * 45); break;
        case "express": this._now("😊 " + b.v); A?.setExpression?.(b.v); await this._wait(800); break;
        case "gesture": this._now("👋 " + b.v); try { (A?.custom?.gesture || A?.gesture)?.call(A.custom || A, b.v, 0); } catch {} await this._wait(1300); break;
        case "camera": this._now("🎥 " + b.v); this._camera(b.v); await this._wait(1700); break;
        case "move": this._now("🚶 → " + b.v); this._move(b.v); await this._wait(1800); break;
        case "effect": this._now("✨ " + b.v); try { this.refs.runAbility?.("particle_effect", { type: b.v }); } catch {} await this._wait(1000); break;
        case "wait": await this._wait((b.v || 1) * 1000); break;
      }
    } catch {}
  },
  _camera(v) {
    const cc = this.refs.camCtl; if (!cc?.flyTo) return;
    const t = this.refs.akuu?.root?.position?.clone?.() || new THREE.Vector3(0, 1, 0);
    if (v.includes("her")) cc.flyTo(t.clone().add(new THREE.Vector3(1.3, 0.5, 1.7)), t.clone().add(new THREE.Vector3(0, 1.4, 0)));
    else if (v.includes("overview")) cc.setMode?.("orbit");
    else if (v.includes("window")) cc.flyTo(new THREE.Vector3(5, 2, 6), new THREE.Vector3(0, 1.4, 0));
    else cc.flyTo(new THREE.Vector3(6, 3.5, 2.5), new THREE.Vector3(-1, 1.4, -1));
  },
  _move(place) {
    const A = this.refs.akuu; const h = (State.settings.hotspots || []).find((x) => x.id === place);
    if (!h || !A?.root) return; const p = new THREE.Vector3(h.pos[0], 0, h.pos[2]);
    if (A.moveTo) A.moveTo(p); else { A.root.position.set(p.x, 0, p.z); A.lookAtPoint?.(this.refs.camCtl?.camera?.position || p); }
  },
};
