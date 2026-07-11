// ============================================================================
//  CATCH ME FIRST — buildmode.js   ("Make it yours")
//  A decorate/build mode: buy furniture & decor with the ¤ she earns, place it
//  on the floor (click to drop, drag to move, rotate/scale/delete), and it all
//  persists. She notices and reacts to what you add. Everything is built from
//  primitives so there are no downloads.
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

const M = (c, opt = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: opt.r ?? 0.6, metalness: opt.m ?? 0.05, emissive: opt.glow ? new THREE.Color(c) : 0, emissiveIntensity: opt.glow || 0 });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };

// ---- catalog: id → { name, price, build() → Object3D } ----
const CATALOG = {
  plant: { name: "🪴 Plant", price: 20, build: () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.22, 12), M("#b5651d"), 0, 0.11, 0)); for (let i = 0; i < 7; i++) { const l = mesh(new THREE.ConeGeometry(0.05, 0.5, 6), M("#2f8f46"), 0, 0.45, 0); l.rotation.set(Math.random() * 0.6, i, Math.random() * 0.4); g.add(l); } return g; } },
  cactus: { name: "🌵 Cactus", price: 12, build: () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.16, 10), M("#c98a4b"), 0, 0.08, 0)); g.add(mesh(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), M("#3a9b5c"), 0, 0.36, 0)); g.add(mesh(new THREE.CapsuleGeometry(0.04, 0.16, 4, 6), M("#3a9b5c"), 0.12, 0.34, 0)); return g; } },
  lamp: { name: "💡 Floor lamp", price: 35, build: () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 8), M("#333"), 0, 0.65, 0)); g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 12), M("#fff6d5", { glow: 0.8 }), 0, 1.35, 0)); const li = new THREE.PointLight("#ffe9b0", 0.8, 4, 2); li.position.set(0, 1.35, 0); g.add(li); return g; } },
  rug: { name: "🟫 Rug", price: 25, build: () => { const o = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.02, 24), M("#a3527a"), 0, 0.011, 0); return o; } },
  beanbag: { name: "🫘 Beanbag", price: 40, build: () => { const o = mesh(new THREE.SphereGeometry(0.42, 16, 12), M("#e08a5b"), 0, 0.3, 0); o.scale.set(1, 0.7, 1); return o; } },
  shelf: { name: "📚 Bookshelf", price: 60, build: () => { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(0.9, 1.6, 0.28), M("#6b4a2a"), 0, 0.8, 0)); for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { const b = mesh(new THREE.BoxGeometry(0.09, 0.22, 0.2), M(`hsl(${(i * 5 + j) * 30},50%,55%)`), -0.35 + j * 0.16, 0.35 + i * 0.4, 0.02); g.add(b); } return g; } },
  table: { name: "🪑 Side table", price: 30, build: () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), M("#cbb18a"), 0, 0.5, 0)); for (const [x, z] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), M("#8a6a3a"), x, 0.25, z)); return g; } },
  plushie: { name: "🧸 Plushie", price: 15, build: () => { const g = new THREE.Group(); const c = "#c78b4a"; g.add(mesh(new THREE.SphereGeometry(0.14, 12, 10), M(c), 0, 0.14, 0)); g.add(mesh(new THREE.SphereGeometry(0.1, 12, 10), M(c), 0, 0.34, 0)); g.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), M(c), -0.08, 0.42, 0)); g.add(mesh(new THREE.SphereGeometry(0.04, 8, 6), M(c), 0.08, 0.42, 0)); return g; } },
  fairy: { name: "✨ Fairy lights", price: 20, build: () => { const g = new THREE.Group(); for (let i = 0; i < 20; i++) { const b = mesh(new THREE.SphereGeometry(0.03, 6, 6), M("#ffe9a8", { glow: 1 }), -0.9 + i * 0.095, 1.6 + Math.sin(i) * 0.06, 0); g.add(b); } return g; } },
  poster: { name: "🖼️ Poster", price: 12, build: () => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"); x.fillStyle = `hsl(${Math.random() * 360},60%,55%)`; x.fillRect(0, 0, 128, 128); x.fillStyle = "#fff"; x.font = "bold 60px sans-serif"; x.textAlign = "center"; x.fillText("♡", 64, 86); const o = mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }), 0, 1.3, 0); return o; } },
  clock: { name: "🕐 Clock", price: 15, build: () => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 20).rotateX(Math.PI / 2), M("#eee"), 0, 1.5, 0)); g.add(mesh(new THREE.BoxGeometry(0.015, 0.14, 0.01), M("#222"), 0, 1.55, 0.02)); return g; } },
  tv: { name: "📺 TV", price: 120, build: () => { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(1.1, 0.64, 0.05), M("#111"), 0, 0.9, 0)); g.add(mesh(new THREE.BoxGeometry(1.02, 0.56, 0.01), M("#1a2b3a", { glow: 0.4 }), 0, 0.9, 0.03)); g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), M("#333"), 0, 0.4, 0)); return g; } },
};

export const Build = {
  refs: null, active: false, armed: null, selected: null, group: null,

  init(refs) {
    this.refs = refs;                        // { scene, camera, renderer, camCtl, lifesim, ui, brain, akuu }
    this.group = new THREE.Group(); this.group.name = "decor";
    refs.scene.add(this.group);
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (!State.settings.decor) State.settings.decor = [];
    this._button();
    this._rebuild();
    refs.renderer.domElement.addEventListener("pointerdown", (e) => this._onPointer(e), true);
    return this;
  },

  _rebuild() {
    this.group.clear();
    for (const d of State.settings.decor) this._instantiate(d);
  },
  _instantiate(d) {
    const spec = CATALOG[d.type]; if (!spec) return null;
    const o = spec.build();
    o.position.set(d.pos[0], d.pos[1] || 0, d.pos[2]);
    o.rotation.y = d.rot || 0; o.scale.setScalar(d.scale || 1);
    o.userData.decor = d;
    this.group.add(o);
    return o;
  },

  _button() {
    const hud = document.querySelector(".hud-right");
    const b = document.createElement("button");
    b.className = "icon-btn"; b.textContent = "🏗️"; b.title = "Build mode — decorate the apartment";
    b.onclick = () => this.toggle();
    if (hud) hud.insertBefore(b, hud.firstChild); else document.body.append(b);
  },

  toggle(force) {
    this.active = force ?? !this.active;
    State.world.building = this.active;
    document.body.classList.toggle("building", this.active);
    if (this.active) { this.refs.camCtl?.setMode?.("orbit"); this._panel(); this.refs.ui?.toast?.("🏗️ Build mode — pick something to place"); }
    else { this._closePanel(); this._select(null); this.armed = null; }
  },

  _panel() {
    if (!this._el) { this._el = document.createElement("div"); this._el.id = "buildPanel"; document.body.append(this._el); }
    const money = this.refs.lifesim?.money?.() ?? 0;
    this._el.innerHTML = `<div class="sp-head">🏗️ Build <span class="build-money">¤${money}</span><button class="note-x">×</button></div>
      <div class="build-hint">click an item, then click the floor to place it. click a placed item to move/rotate/delete.</div>
      <div class="build-catalog">${Object.entries(CATALOG).map(([id, s]) => `<button class="build-item${money < s.price ? " poor" : ""}" data-id="${id}"><span>${s.name}</span><small>¤${s.price}</small></button>`).join("")}</div>
      <div id="buildTools"></div>
      <button class="s-btn tiny danger" id="buildClear">clear all decor</button>`;
    this._el.classList.add("open");
    this._el.querySelector(".note-x").onclick = () => this.toggle(false);
    this._el.querySelectorAll(".build-item").forEach((b) => b.onclick = () => this._arm(b.dataset.id));
    this._el.querySelector("#buildClear").onclick = () => { State.settings.decor = []; State.save(); this._rebuild(); this._select(null); };
  },
  _closePanel() { this._el?.classList.remove("open"); },

  _arm(id) {
    const spec = CATALOG[id]; const money = this.refs.lifesim?.money?.() ?? 0;
    if (money < spec.price) { this.refs.ui?.toast?.(`need ¤${spec.price} — she has ¤${money}. earn more!`); return; }
    this.armed = id; this._select(null);
    this.refs.ui?.toast?.(`placing ${spec.name} — click the floor`);
  },

  _onPointer(e) {
    if (!this.active || e.button !== 0) return;
    const clamp = (p) => { p.x = Math.max(-3.8, Math.min(3.8, p.x)); p.z = Math.max(-5.8, Math.min(5.8, p.z)); return p; };
    if (this.armed) {                                   // placing a new item
      const p = this._floorPoint(e); if (!p) return;
      clamp(p); e.stopPropagation(); e.preventDefault();
      const spec = CATALOG[this.armed];
      if (!this.refs.lifesim?.spend?.(spec.price)) { this.refs.ui?.toast?.("not enough ¤"); this.armed = null; return; }
      const d = { type: this.armed, pos: [p.x, 0, p.z], rot: 0, scale: 1 };
      State.settings.decor.push(d); State.save();
      this._select(this._instantiate(d));
      this.armed = null; this._panel(); this._react(spec.name);
      return;
    }
    const hit = this._pick(e);
    if (hit) {                                          // grab an item → select + drag it
      e.stopPropagation();
      this._select(hit);
      const move = (ev) => { const p = this._floorPoint(ev); if (!p) return; clamp(p); hit.position.set(p.x, 0, p.z); hit.userData.decor.pos = [p.x, 0, p.z]; if (this._marker) this._marker.position.set(p.x, 0.02, p.z); };
      const up = () => { State.save(); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    } else {
      this._select(null);                               // empty space → deselect, let the camera orbit
    }
  },

  _floorPoint(e) {
    const r = this.refs.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this.refs.camera);
    const out = new THREE.Vector3();
    return this._ray.ray.intersectPlane(this._plane, out) ? out : null;
  },
  _pick(e) {
    const r = this.refs.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(ndc, this.refs.camera);
    const hits = this._ray.intersectObjects(this.group.children, true);
    if (!hits.length) return null;
    let o = hits[0].object; while (o.parent && o.parent !== this.group) o = o.parent;
    return o;
  },
  _moveSelected(p) {
    const d = this.selected.userData.decor;
    this.selected.position.set(p.x, 0, p.z); d.pos = [p.x, 0, p.z]; State.save();
  },

  _select(o) {
    if (this._marker) { this._marker.parent?.remove(this._marker); this._marker = null; }
    this.selected = o;
    const tools = document.getElementById("buildTools"); if (tools) tools.innerHTML = "";
    if (!o) return;
    // ring marker
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ff6ba6", transparent: true, opacity: 0.8 }));
    ring.position.copy(o.position); ring.position.y = 0.02; this.refs.scene.add(ring); this._marker = ring;
    if (!tools) return;
    tools.innerHTML = `<div class="build-tools"><span>selected</span>
      <button data-a="rl">⟲</button><button data-a="rr">⟳</button>
      <button data-a="bigger">＋</button><button data-a="smaller">－</button>
      <button data-a="del" class="danger">🗑</button></div>`;
    tools.querySelectorAll("button").forEach((b) => b.onclick = () => this._tool(b.dataset.a));
  },
  _tool(a) {
    const o = this.selected; if (!o) return; const d = o.userData.decor;
    if (a === "rl") { o.rotation.y -= 0.4; d.rot = o.rotation.y; }
    if (a === "rr") { o.rotation.y += 0.4; d.rot = o.rotation.y; }
    if (a === "bigger") { d.scale = Math.min(2.5, (d.scale || 1) + 0.15); o.scale.setScalar(d.scale); }
    if (a === "smaller") { d.scale = Math.max(0.4, (d.scale || 1) - 0.15); o.scale.setScalar(d.scale); }
    if (a === "del") {
      State.settings.decor = State.settings.decor.filter((x) => x !== d);
      this.refs.lifesim?.earn?.(Math.round((CATALOG[d.type]?.price || 0) * 0.5));   // partial refund
      o.parent?.remove(o); this._select(null); this._panel();
    }
    State.save();
    if (this._marker && o) this._marker.position.copy(o.position).setY(0.02);
  },

  _react(name) {
    const lines = [`ooh, a ${name.replace(/^\S+ /, "")}! i love it there~`, `nice pick! the place is really coming together ♡`, `wait that's actually so cute where you put it`, `mmm cozy. good taste.`];
    setTimeout(() => State.bus.emit("akuu:say", { text: lines[Math.floor(Math.random() * lines.length)], tools: [], idle: true }), 700);
    State.adjust?.("affection", 0);
  },
};
