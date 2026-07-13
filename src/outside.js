// ============================================================================
//  CATCH ME FIRST — outside.js   ("Step outside — a living world")
//  Leave the apartment and take her somewhere: a city rooftop under the stars,
//  a dusk park, a warm little café. Each place is built procedurally, the
//  apartment hides, she comes with you, and it's a real date. 🚪
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

const LOCS = { rooftop: { label: "🌃 The Rooftop" }, park: { label: "🌳 The Park" }, cafe: { label: "☕ The Café" } };

export const Outside = {
  refs: null, group: null, place: "home", _saved: null,

  init(refs) { this.refs = refs; this._button(); return this; },   // { scene, dorm, akuu, camCtl }

  _button() {
    const hud = document.querySelector(".hud-right") || document.body;
    let b = document.getElementById("outsideBtn");
    if (!b) { b = document.createElement("button"); b.id = "outsideBtn"; b.className = "icon-btn"; hud.appendChild(b); }
    b.textContent = "🚪"; b.title = "Step outside — go somewhere together";
    b.onclick = () => this.menu();
    let o = document.getElementById("outMenu"); if (!o) { o = document.createElement("div"); o.id = "outMenu"; document.body.appendChild(o); } this.ov = o;
    let f = document.getElementById("outFade"); if (!f) { f = document.createElement("div"); f.id = "outFade"; document.body.appendChild(f); } this.fade = f;
  },

  menu() {
    this.ov.classList.add("show");
    this.ov.innerHTML = `<div class="om-card"><button class="om-x" id="omX">✕</button><div class="om-t">Where to, together? ♡</div>${Object.entries(LOCS).map(([k, v]) => `<button class="om-b" data-p="${k}"${k === this.place ? " disabled" : ""}>${v.label}</button>`).join("")}${this.place !== "home" ? `<button class="om-b home" data-p="home">🏠 Home</button>` : ""}</div>`;
    this.ov.querySelectorAll(".om-b").forEach((b) => b.onclick = () => { this.ov.classList.remove("show"); this.go(b.dataset.p); });
    this.ov.querySelector("#omX").onclick = () => this.ov.classList.remove("show");
  },

  go(place) {
    if (place === this.place) return;
    this.fade.classList.add("on");
    setTimeout(() => {
      this._teardown();
      if (place === "home") { this._restore(); this.place = "home"; } else { this._enter(place); }
      this.fade.classList.remove("on");
      this._label(place);
    }, 560);
  },

  _label(place) {
    if (place === "home") return;
    let l = document.getElementById("outLabel"); if (!l) { l = document.createElement("div"); l.id = "outLabel"; document.body.appendChild(l); }
    l.textContent = LOCS[place]?.label || ""; l.classList.add("show"); setTimeout(() => l.classList.remove("show"), 2700);
  },

  _teardown() {
    if (!this.group) return;
    this.refs.scene.remove(this.group);
    this.group.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); });
    this.group = null;
  },

  _enter(place) {
    State.world.outing = true;
    const cc = this.refs.camCtl, a = this.refs.akuu;
    const env = window.CMF?.env?.root, dg = this.refs.dorm?.group;
    if (!this._saved) this._saved = { envVis: env?.visible, dormVis: dg?.visible, bx: cc.bx, bz: cc.bz, cam: cc._collider, akuuCol: a._collider, fog: this.refs.scene.fog };
    if (env) env.visible = false; if (dg) dg.visible = false;
    cc.bx = 22; cc.bz = 22;
    const pass = (f, t) => ({ x: t.x, y: t.y ?? 0, z: t.z });
    cc.setCollider(pass); a.setCollider(pass);
    this.group = this._build(place); this.refs.scene.add(this.group);
    this.place = place;
    if (a?.root) { a.root.position.set(-0.3, 0, 0.9); a.root.rotation.y = Math.PI * 0.85; }
    cc.dekuPos?.set?.(-1.4, 0, 2.0);
    cc.setMode?.("orbit"); cc.flyTo?.(new THREE.Vector3(4.5, 2.6, 5.2), new THREE.Vector3(0.6, 1.2, 0));
    try { State.bus.emit("akuu:say", { text: this._line(place), tools: [], idle: true }); } catch {}
  },

  _restore() {
    State.world.outing = false; State.world.skyLock = false;
    const s = this._saved, cc = this.refs.camCtl, a = this.refs.akuu;
    if (s) {
      const env = window.CMF?.env?.root, dg = this.refs.dorm?.group;
      if (env) env.visible = s.envVis !== false; if (dg) dg.visible = s.dormVis !== false;
      cc.bx = s.bx; cc.bz = s.bz;
      if (s.cam) cc.setCollider(s.cam); if (s.akuuCol) a.setCollider(s.akuuCol);
      this.refs.scene.fog = s.fog || null;
    }
    this._saved = null;
    if (a?.root) a.root.position.set(0.3, 0, 0.4);
    cc.setMode?.("orbit"); cc.flyTo?.(cc.defaultPos.clone(), cc.defaultTarget.clone());
    try { State.bus.emit("akuu:say", { text: "home sweet home ♡", tools: [], idle: true }); } catch {}
  },

  // -------- procedural locations --------
  _grad(top, bottom) { const c = document.createElement("canvas"); c.width = 16; c.height = 256; const g = c.getContext("2d"); const lg = g.createLinearGradient(0, 0, 0, 256); lg.addColorStop(0, top); lg.addColorStop(1, bottom); g.fillStyle = lg; g.fillRect(0, 0, 16, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; },
  _sky(top, bottom, fog, fd) { const sc = this.refs.scene; State.world.skyLock = true; sc.background = this._grad(top, bottom); sc.fog = fog ? new THREE.FogExp2(new THREE.Color(fog).getHex(), fd) : null; },

  _build(place) {
    const g = new THREE.Group();
    const box = (w, h, d, c, x, y, z, e) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, emissive: e || 0x000000, emissiveIntensity: e ? 1 : 0 })); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const cyl = (r, h, c, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    const sun = this.refs.dorm?.sun, amb = this.refs.dorm?.ambient;

    if (place === "rooftop") {
      this._sky("#0a0a24", "#3a2a5a", "#1a1636", 0.018);
      box(30, 0.2, 30, 0x2a2a32, 0, -0.1, 0);
      [[0, -8, 16, 0.1], [0, 8, 16, 0.1], [-8, 0, 0.1, 16], [8, 0, 0.1, 16]].forEach(([x, z, w, d]) => box(w, 0.9, d, 0x555566, x, 0.45, z));
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, dd = 15 + Math.random() * 9, h = 4 + Math.random() * 16; const b = box(2 + Math.random() * 2, h, 2 + Math.random() * 2, 0x14141f, Math.cos(a) * dd, h / 2 - 2, Math.sin(a) * dd); for (let w = 0; w < 5; w++) if (Math.random() < 0.5) box(0.25, 0.32, 0.06, 0xffd47a, b.position.x + (Math.random() - 0.5) * 1.6, 1 + Math.random() * (h - 2), b.position.z + (Math.sin(a) > 0 ? 1.05 : -1.05), 0xffd47a); }
      this._stars(g);
      cyl(0.34, 0.7, 0x8a6a4a, 1.2, 0.35, 0.5); box(0.55, 0.05, 0.55, 0x9a7a5a, 1.2, 0.72, 0.5);
      box(0.4, 0.5, 0.4, 0x555, 0.5, 0.25, 0.5); box(0.4, 0.5, 0.4, 0x555, 1.9, 0.25, 0.5);
      const pl = new THREE.PointLight(0xffcf9a, 0.9, 8); pl.position.set(1.2, 1.7, 0.5); g.add(pl);
      if (sun) { sun.color.set("#9aa8d0"); sun.intensity = 0.6; } if (amb) amb.intensity = 0.5;
    } else if (place === "park") {
      this._sky("#6a5acd", "#ff9a8b", "#c88fa0", 0.018);
      box(40, 0.2, 40, 0x3a6a3a, 0, -0.1, 0);
      box(3, 0.05, 22, 0x9a8a6a, 0, 0.01, 0);
      for (let i = 0; i < 10; i++) { const x = -13 + Math.random() * 26, z = -13 + Math.random() * 26; if (Math.abs(x) < 2.2) continue; cyl(0.2, 1.4, 0x6a4a2a, x, 0.7, z); const f = new THREE.Mesh(new THREE.SphereGeometry(1 + Math.random() * 0.6, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1 })); f.position.set(x, 1.85, z); f.castShadow = true; g.add(f); }
      box(1.6, 0.1, 0.5, 0x6a4a2a, 2.4, 0.4, 2); box(1.6, 0.5, 0.1, 0x6a4a2a, 2.4, 0.65, 2.22);
      [[-8, -7], [9, -6]].forEach(([x, z]) => { cyl(0.08, 3, 0x333, x, 1.5, z); const s = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffe8a0 })); s.position.set(x, 3, z); g.add(s); const pl = new THREE.PointLight(0xffe8a0, 0.5, 7); pl.position.set(x, 3, z); g.add(pl); });
      if (sun) { sun.color.set("#ffc79a"); sun.intensity = 1.3; } if (amb) amb.intensity = 0.85;
    } else {
      this._sky("#4a3550", "#8a5f5a", "#3a2a30", 0.012);
      box(16, 0.2, 16, 0x9a7448, 0, -0.1, 0);
      box(0.25, 4, 16, 0xb58f6a, -6, 2, 0); box(16, 4, 0.25, 0xb58f6a, 0, 2, -6);
      box(3, 2.4, 0.28, 0xffd98a, -5.85, 1.6, 2, 0xffcf7a);   // warm glowing window
      [[-2, 0], [2, -1], [0.3, 2.4]].forEach(([x, z]) => { cyl(0.5, 0.75, 0x6a4a2a, x, 0.37, z); box(0.95, 0.05, 0.95, 0x8a6a4a, x, 0.77, z); cyl(0.08, 0.12, 0xffffff, x - 0.2, 0.86, z); box(0.42, 0.5, 0.42, 0x6a4a2a, x + 0.85, 0.25, z); box(0.42, 0.5, 0.42, 0x6a4a2a, x - 0.85, 0.25, z); });
      const pl = new THREE.PointLight(0xffc888, 2.4, 16); pl.position.set(-1, 3.4, 0); g.add(pl);
      const pl2 = new THREE.PointLight(0xffb060, 1.2, 12); pl2.position.set(2, 2.6, 2); g.add(pl2);
      if (sun) { sun.color.set("#ffd8a8"); sun.intensity = 1.0; } if (amb) amb.intensity = 1.0;
    }
    return g;
  },

  _stars(g) { const N = 420, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 17 + Math.random() * 11; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 6 + Math.random() * 15; pos[i * 3 + 2] = Math.sin(a) * r; } const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.13, transparent: true, opacity: 0.9 }))); },
  _line(place) { return { rooftop: "woah… the whole city's below us ♡ come stand with me", park: "fresh air ♡ …hold my hand? the path's a little dark", cafe: "mmh, it's so warm in here ♡ i'll get us coffee" }[place] || "where are we going? ♡"; },
};
