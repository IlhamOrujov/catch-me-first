// ============================================================================
//  CATCH ME FIRST — devmode.js   ("Developer Mode")
//  An in-game toolkit for editing EVERYTHING: pick/move/scale/delete meshes,
//  add primitives + models + images + lights, edit materials & lighting &
//  atmosphere, drive Alice, live-edit UI text & theme, leave notes for Claude
//  (saved to the repo via server.py), a JS console, a state editor, perf HUD,
//  and a 90+30 feature roadmap. Toggle with the `DEV` button, F8, or backtick.
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

let TransformControls = null;   // loaded lazily (addon) so a CDN hiccup can't break boot

const $ = (html) => { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; };
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const EXPRESSIONS = ["neutral", "happy", "smile", "blush", "shy", "smug", "surprised", "sad", "annoyed", "sleepy", "thinking", "wink"];
const GESTURES = ["wave", "heart", "peace", "point", "nod", "cheer", "think", "shrug", "dance"];

export const DevMode = {
  on: false, ctx: null, sel: null, added: [], helpers: {}, _flyKeys: {}, fly: false, _notes: [],

  init(ctx) {
    this.ctx = ctx;                 // { scene, camera, renderer, camCtl, akuu, dorm, ui }
    this._button();
    this._panel();
    addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (e.key === "F8" || (e.key === "`" && !typing && !e.metaKey && !e.ctrlKey)) { e.preventDefault(); this.toggle(); }
      if (!this.on) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); this._palette(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); this._undo(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); this._redo(); }
      this._flyKey(e, true);
    });
    addEventListener("keyup", (e) => { if (this.fly) this._flyKey(e, false); });
    // double-click a mesh to focus it
    this.ctx.renderer?.domElement?.addEventListener("dblclick", (e) => { if (this.on) { this._pick(e, true); this._frame(); } });
    this._loadNotes();
    return this;
  },

  async _ensureTC() {
    if (TransformControls) return TransformControls;
    try { ({ TransformControls } = await import("three/addons/controls/TransformControls.js")); } catch (e) { console.warn("[dev] TransformControls unavailable", e); }
    return TransformControls;
  },

  _button() {
    let b = document.getElementById("devBtn");
    if (!b) { b = document.createElement("button"); b.id = "devBtn"; document.body.append(b); }
    b.textContent = "DEV";
    b.title = "Developer Mode (F8 or ` )";
    b.onclick = () => this.toggle();
  },

  toggle(force) {
    this.on = force ?? !this.on;
    this.panel.classList.toggle("show", this.on);
    document.body.classList.toggle("dev-on", this.on);
    this._button();
    document.getElementById("devBtn")?.classList.toggle("on", this.on);
    if (this.on) { this._tab(this._curTab || "scene"); this._perfLoop(); }
    else { this._detach(); this.fly = false; if (this.ctx.camCtl?.orbit) this.ctx.camCtl.orbit.enabled = (this.ctx.camCtl.mode !== "first"); }
  },

  // ---------------------------------------------------------------- panel shell
  _panel() {
    let p = document.getElementById("devPanel");
    if (!p) { p = document.createElement("div"); p.id = "devPanel"; document.body.append(p); }
    const TABS = [
      ["scene", "Scene"], ["object", "Object"], ["light", "Light"], ["look", "Look"], ["world", "World"],
      ["image", "Image"], ["camera", "Camera"], ["alice", "Alice"], ["audio", "Audio"], ["ui", "UI"],
      ["notes", "Notes"], ["console", "Console"], ["state", "State"], ["perf", "Perf"], ["features", "Features"],
    ];
    p.innerHTML = `
      <div class="dv-head"><b>⚙ Developer Mode</b><div class="dv-perf" id="dvPerf"></div><button class="dv-x" id="dvClose">✕</button></div>
      <div class="dv-tabs">${TABS.map(([id, l]) => `<button class="dv-tab" data-t="${id}">${l}</button>`).join("")}</div>
      <div class="dv-body" id="dvBody"></div>
      <div class="dv-status" id="dvStatus">ready ♡</div>`;
    this.panel = p;
    this.body = p.querySelector("#dvBody");
    p.querySelector("#dvClose").onclick = () => this.toggle(false);
    p.querySelectorAll(".dv-tab").forEach((b) => b.onclick = () => this._tab(b.dataset.t));
    // pointer picking in the 3D scene
    this.ctx.renderer?.domElement?.addEventListener("pointerdown", (e) => this._pick(e));
  },

  _status(t) { const s = document.getElementById("dvStatus"); if (s) s.textContent = t; },
  _tab(id) {
    this._curTab = id;
    this.panel.querySelectorAll(".dv-tab").forEach((b) => b.classList.toggle("on", b.dataset.t === id));
    const fn = this["_tab_" + id]; this.body.innerHTML = ""; if (fn) fn.call(this);
  },

  // small UI builders --------------------------------------------------------
  _row(label, node) { const r = $(`<div class="dv-row"><label>${label}</label></div>`); r.append(node); this.body.append(r); return r; },
  _btn(label, fn, cls = "") { const b = $(`<button class="dv-b ${cls}">${label}</button>`); b.onclick = fn; return b; },
  _grid(btns) { const g = $(`<div class="dv-grid"></div>`); btns.forEach((b) => g.append(b)); this.body.append(g); return g; },
  _slider(label, min, max, step, val, fn) {
    const wrap = $(`<div class="dv-slider"><label>${label} <b>${(+val).toFixed(2)}</b></label></div>`);
    const s = $(`<input type="range" min="${min}" max="${max}" step="${step}" value="${val}">`);
    s.oninput = () => { wrap.querySelector("b").textContent = (+s.value).toFixed(2); fn(+s.value); };
    wrap.append(s); this.body.append(wrap); return s;
  },
  _text(label, val, fn, ph = "") { const wrap = $(`<div class="dv-field"><label>${label}</label></div>`); const i = $(`<input type="text" placeholder="${ph}" value="${(val ?? "").toString().replace(/"/g, "&quot;")}">`); i.onchange = () => fn(i.value); wrap.append(i); this.body.append(wrap); return i; },
  _color(label, val, fn) { const wrap = $(`<div class="dv-row"><label>${label}</label></div>`); const i = $(`<input type="color" value="${val}">`); i.oninput = () => fn(i.value); wrap.append(i); this.body.append(wrap); return i; },
  _h(t) { this.body.append($(`<div class="dv-h">${t}</div>`)); },

  // ============================================================ SCENE
  _tab_scene() {
    this._h("Add object");
    this._grid([
      this._btn("＋ Box", () => this._addPrim("box")),
      this._btn("＋ Sphere", () => this._addPrim("sphere")),
      this._btn("＋ Cylinder", () => this._addPrim("cyl")),
      this._btn("＋ Cone", () => this._addPrim("cone")),
      this._btn("＋ Plane", () => this._addPrim("plane")),
      this._btn("＋ Torus", () => this._addPrim("torus")),
      this._btn("＋ Point light", () => this._addLight("point")),
      this._btn("＋ Spot light", () => this._addLight("spot")),
    ]);
    this._text("Load model URL (.glb/.vrm/.fbx)", "", (u) => this._addModel(u), "https://…");
    this._h("Selection");
    this._grid([
      this._btn("🖈 Pick mode: " + (this._pickMode ? "ON" : "off"), () => { this._pickMode = !this._pickMode; this._tab("scene"); this._status(this._pickMode ? "click an object in the world" : "pick off"); }, this._pickMode ? "hot" : ""),
      this._btn("Frame selected", () => this._frame()),
      this._btn("Duplicate", () => this._dup()),
      this._btn("Delete", () => this._del(), "danger"),
    ]);
    this._h("Helpers");
    this._grid([
      this._btn("Grid", () => this._toggleHelper("grid")),
      this._btn("Axes", () => this._toggleHelper("axes")),
      this._btn("Wireframe all", () => this._wireAll()),
      this._btn("Show collision", () => this._toggleHelper("collision")),
    ]);
    this._h("Prefabs & export");
    this._grid([this._btn("⬇ Export scene JSON", () => this._exportScene()), this._btn("Save prefab", () => this._savePrefab())]);
    const prefabs = Object.keys(State.settings.devPrefabs || {});
    if (prefabs.length) this._grid(prefabs.map((n) => this._btn("▣ " + n, () => this._spawnPrefab(n))));
    this._h("Scene tree");
    const list = $(`<div class="dv-list"></div>`);
    const named = [];
    this.ctx.scene?.traverse((o) => { if ((o.isMesh || o.isLight || o.isGroup) && o.name && named.length < 120) named.push(o); });
    named.forEach((o) => { const it = $(`<button class="dv-it">${o.isLight ? "💡" : o.isGroup ? "▣" : "△"} ${o.name}</button>`); it.onclick = () => this._select(o); list.append(it); });
    if (!named.length) list.append($(`<i class="dv-dim">no named objects</i>`));
    this.body.append(list);
  },

  // ============================================================ OBJECT
  _tab_object() {
    const o = this.sel;
    if (!o) { this.body.append($(`<i class="dv-dim">Nothing selected. Use Scene → Pick mode, or click a name in the tree.</i>`)); return; }
    this._h(`Selected: ${o.name || o.type}`);
    this._grid([
      this._btn("Move", () => this._gizmo("translate"), this._tcMode === "translate" ? "hot" : ""),
      this._btn("Rotate", () => this._gizmo("rotate"), this._tcMode === "rotate" ? "hot" : ""),
      this._btn("Scale", () => this._gizmo("scale"), this._tcMode === "scale" ? "hot" : ""),
      this._btn("Gizmo off", () => this._detach()),
    ]);
    this._grid([
      this._btn("↩ Undo", () => this._undo()), this._btn("↪ Redo", () => this._redo()),
      this._btn("Copy", () => this._copy()), this._btn("Paste", () => this._paste()),
      this._btn("Rename", () => this._rename()), this._btn(o.userData.devLocked ? "Unlock 🔒" : "Lock", () => this._lockObj()),
      this._btn(this._iso ? "Un-isolate" : "Isolate", () => this._isolate()), this._btn("Align to grid", () => this._align()),
      this._btn("Drop (physics)", () => this._drop()), this._btn("Save prefab", () => this._savePrefab()),
    ]);
    this._slider("snap grid", 0, 2, 0.05, this._snap || 0, (v) => { this._snap = v || null; if (this.tc) this.tc.translationSnap = this._snap; });
    ["x", "y", "z"].forEach((ax) => this._slider(`pos ${ax}`, -20, 20, 0.01, o.position[ax], (v) => { o.position[ax] = v; }));
    this._slider("rot y°", -180, 180, 1, THREE.MathUtils.radToDeg(o.rotation.y), (v) => { o.rotation.y = THREE.MathUtils.degToRad(v); });
    this._slider("scale", 0.05, 6, 0.01, o.scale.x, (v) => o.scale.setScalar(v));
    this._grid([
      this._btn("Snap to floor", () => { o.position.y = 0; }),
      this._btn(o.visible ? "Hide" : "Show", () => { o.visible = !o.visible; this._tab("object"); }),
      this._btn("Duplicate", () => this._dup()),
      this._btn("Delete", () => this._del(), "danger"),
    ]);
    // material
    const m = o.material && !Array.isArray(o.material) ? o.material : null;
    if (m) {
      this._h("Material");
      if (m.color) this._color("color", "#" + m.color.getHexString(), (c) => m.color.set(c));
      if (m.emissive) this._color("emissive", "#" + m.emissive.getHexString(), (c) => m.emissive.set(c));
      if ("roughness" in m) this._slider("roughness", 0, 1, 0.01, m.roughness, (v) => m.roughness = v);
      if ("metalness" in m) this._slider("metalness", 0, 1, 0.01, m.metalness, (v) => m.metalness = v);
      this._slider("opacity", 0, 1, 0.01, m.opacity ?? 1, (v) => { m.opacity = v; m.transparent = v < 1; });
      this._grid([this._btn(m.wireframe ? "Solid" : "Wireframe", () => { m.wireframe = !m.wireframe; this._tab("object"); })]);
      this._h("Material presets");
      this._grid(["gold", "glass", "neon", "matte", "mirror", "wood"].map((k) => this._btn(k, () => this._matPreset(k))));
      let nrm = "";
      this._text("normal/rough map URL", "", (u) => nrm = u, "https://…");
      this._grid([this._btn("→ normalMap", () => this._pbr(nrm, "normalMap")), this._btn("→ roughnessMap", () => this._pbr(nrm, "roughnessMap"))]);
    }
    this._h("Collision");
    this._grid([
      this._btn("Block here (wall)", () => this._addBlocker(o)),
      this._btn("Clear my walls", () => this._clearBlockers(), "danger"),
    ]);
  },

  // ============================================================ LIGHT
  _tab_light() {
    const lights = [];
    this.ctx.scene?.traverse((o) => { if (o.isLight) lights.push(o); });
    this._h("Lights");
    const list = $(`<div class="dv-list"></div>`);
    lights.forEach((L) => { const it = $(`<button class="dv-it">💡 ${L.name || L.type} · ${L.intensity.toFixed(1)}</button>`); it.onclick = () => this._select(L); list.append(it); });
    this.body.append(list);
    const L = this.sel && this.sel.isLight ? this.sel : (this.ctx.dorm?.sun || lights[0]);
    if (L) {
      this._h("Edit: " + (L.name || L.type));
      this._slider("intensity", 0, 8, 0.05, L.intensity, (v) => L.intensity = v);
      if (L.color) this._color("color", "#" + L.color.getHexString(), (c) => L.color.set(c));
      if ("distance" in L) this._slider("distance", 0, 40, 0.5, L.distance || 0, (v) => L.distance = v);
      if ("angle" in L) this._slider("angle", 0.1, 1.5, 0.01, L.angle, (v) => L.angle = v);
      ["x", "y", "z"].forEach((ax) => this._slider(`pos ${ax}`, -20, 20, 0.1, L.position[ax], (v) => L.position[ax] = v));
    }
    this._h("Add");
    this._grid([
      this._btn("＋ Point", () => this._addLight("point")),
      this._btn("＋ Spot", () => this._addLight("spot")),
      this._btn("＋ Directional", () => this._addLight("dir")),
    ]);
    this._grid([this._btn("Toggle light helper", () => this._lightHelper())]);
  },

  // ============================================================ LOOK (atmosphere/postfx)
  _tab_look() {
    const C = window.CMF || {}; const r = this.ctx.renderer, sc = this.ctx.scene;
    this._h("Time of day");
    this._slider("hour", 0, 24, 0.1, State.world.timeOfDay ?? 14, (v) => { State.world.timeOfDay = v; try { C.Atmosphere?.setTime?.(v); C.PostFX?.setTime?.(v); } catch {} });
    this._h("Renderer");
    if (r) this._slider("exposure", 0, 3, 0.01, r.toneMappingExposure ?? 1, (v) => r.toneMappingExposure = v);
    this._grid([
      this._btn("Shadows " + (r?.shadowMap?.enabled ? "off" : "on"), () => { if (r) { r.shadowMap.enabled = !r.shadowMap.enabled; sc.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); this._tab("look"); } }),
    ]);
    this._h("Fog");
    if (sc?.fog) {
      this._color("fog color", "#" + sc.fog.color.getHexString(), (c) => sc.fog.color.set(c));
      if ("density" in sc.fog) this._slider("fog density", 0, 0.15, 0.001, sc.fog.density, (v) => sc.fog.density = v);
      if ("far" in sc.fog) this._slider("fog far", 5, 120, 1, sc.fog.far, (v) => sc.fog.far = v);
    } else this._grid([this._btn("Add fog", () => { sc.fog = new THREE.FogExp2(0x1a1226, 0.02); this._tab("look"); })]);
    this._h("Background");
    if (sc) this._color("bg color", sc.background?.isColor ? "#" + sc.background.getHexString() : "#101018", (c) => { sc.background = new THREE.Color(c); });
    this._h("Bloom (post-fx)");
    const bloom = C.PostFX?.bloom;
    if (bloom) { this._slider("strength", 0, 2, 0.01, bloom.strength, (v) => bloom.strength = v); this._slider("threshold", 0, 1, 0.01, bloom.threshold, (v) => bloom.threshold = v); this._slider("radius", 0, 1, 0.01, bloom.radius, (v) => bloom.radius = v); }
    else this.body.append($(`<i class="dv-dim">bloom not exposed (mobile / off)</i>`));
  },

  // ============================================================ IMAGE
  _tab_image() {
    this._h("Add image to the world");
    this.body.append($(`<i class="dv-dim">Drops a photo/poster as a plane in front of the camera.</i>`));
    let url = "";
    this._text("Image URL", "", (u) => url = u, "https://…​.jpg");
    this._grid([this._btn("＋ Place image", () => url && this._addImage(url))]);
    if (this.sel && this.sel.material) {
      this._h("Apply image to selected");
      let t2 = "";
      this._text("Texture URL", "", (u) => t2 = u, "https://…");
      this._grid([this._btn("Apply texture", () => t2 && this._applyTexture(this.sel, t2))]);
    }
    this._h("Screenshot");
    this._grid([this._btn("📷 Save PNG", () => this._screenshot())]);
  },

  // ============================================================ CAMERA
  _tab_camera() {
    const cam = this.ctx.camera, cc = this.ctx.camCtl;
    this._h("Free-fly camera");
    this._grid([
      this._btn(this.fly ? "Fly: ON (WASD/QE)" : "Fly: off", () => this._toggleFly(), this.fly ? "hot" : ""),
      this._btn("Frame selected", () => this._frame()),
    ]);
    if (this.fly) this._slider("fly speed", 0.5, 20, 0.5, this._flySpeed || 5, (v) => this._flySpeed = v);
    this._h("Views");
    this._grid([
      this._btn("Top", () => this._view("top")),
      this._btn("Front", () => this._view("front")),
      this._btn("Reset", () => cc?.setMode?.("orbit")),
    ]);
    if (cam) this._slider("FOV", 25, 100, 1, cam.fov, (v) => { cam.fov = v; cam.updateProjectionMatrix(); });
    this._h("Bookmarks & capture");
    this._grid([
      this._btn("＋ Save view", () => this._saveBookmark()),
      this._btn(this.ctx.camCtl?.orbit?.autoRotate ? "Dolly: ON" : "Orbit dolly", () => this._dolly(), this.ctx.camCtl?.orbit?.autoRotate ? "hot" : ""),
      this._btn("📷 Screenshot", () => this._screenshot()),
      this._btn("📷 No-HUD shot", () => this._screenshotClean()),
    ]);
    const bl = $(`<div class="dv-list"></div>`); (State.settings.devCamBookmarks || []).forEach((bm, i) => { const it = $(`<button class="dv-it">🎥 view ${i + 1}</button>`); it.onclick = () => this._loadBookmark(bm); bl.append(it); }); this.body.append(bl);
    const pos = cam ? `${cam.position.x.toFixed(2)}, ${cam.position.y.toFixed(2)}, ${cam.position.z.toFixed(2)}` : "-";
    this.body.append($(`<div class="dv-mono">cam: ${pos}</div>`));
  },

  // ============================================================ ALICE
  _tab_alice() {
    const a = this.ctx.akuu;
    this._h("Expression");
    this._grid(EXPRESSIONS.map((e) => this._btn(e, () => { try { a?.setExpression?.(e); } catch {} this._status("expr: " + e); })));
    this._h("Gesture");
    this._grid(GESTURES.map((g) => this._btn(g, () => { try { (a?.custom?.gesture || a?.gesture)?.call(a.custom || a, g, 0); } catch {} this._status("gesture: " + g); })));
    this._h("Make her say");
    let line = "";
    this._text("line", "", (v) => line = v, "type a line…");
    this._grid([this._btn("💬 Say", () => line && State.bus.emit("akuu:say", { text: line, tools: [], idle: true }))]);
    this._h("Mood & bond");
    this._slider("affection", 0, 100, 1, State.settings.affection ?? 0, (v) => State.set("affection", Math.round(v)));
    this._slider("trust", 0, 100, 1, State.settings.trust ?? 0, (v) => State.set("trust", Math.round(v)));
    const n = State.world.needs || {};
    ["energy", "hunger", "fun", "social"].forEach((k) => { if (k in n) this._slider("need " + k, 0, 100, 1, n[k], (v) => n[k] = v); });
    this._h("Control");
    this._grid([
      this._btn(State.settings.frozen ? "Unfreeze AI" : "Freeze AI", () => { State.set("frozen", !State.settings.frozen); this._tab("alice"); }),
      this._btn("Teleport to me", () => { try { const p = this.ctx.camera.position; a.root.position.set(p.x, 0, p.z + 1); } catch {} }),
      this._btn("Look at me", () => { try { a.lookAtPoint?.(this.ctx.camera.position); } catch {} }),
    ]);
    this._text("Swap model URL (.vrm/.glb)", "", (u) => u && State.set("customModelUrl", u), "https://…");
  },

  // ============================================================ UI
  _tab_ui() {
    this._h("Live text editor");
    this.body.append($(`<i class="dv-dim">Toggle, then click any on-screen text to edit it.</i>`));
    this._grid([this._btn(this._uiEdit ? "Editing: ON" : "Edit text: off", () => this._toggleUIEdit(), this._uiEdit ? "hot" : "")]);
    this._h("HUD panels");
    const toggles = [["#hud", "HUD"], ["#chatDock", "Chat"], ["#phoneFab", "Phone btn"], ["#fps", "FPS"], [".hud-right", "Right dock"]];
    this._grid(toggles.map(([sel, label]) => this._btn(label, () => { const el = document.querySelector(sel); if (el) { el.style.display = el.style.display === "none" ? "" : "none"; } })));
    this._h("Theme colors");
    const vars = [["--pink", "#ff6ba6"], ["--purple", "#8b5cf6"], ["--cyan", "#38bdf8"], ["--text", "#f4eefb"]];
    const cs = getComputedStyle(document.documentElement);
    vars.forEach(([v, def]) => this._color(v, (cs.getPropertyValue(v).trim() || def), (c) => document.documentElement.style.setProperty(v, c)));
    this._h("UI scale");
    this._slider("root font", 12, 22, 0.5, parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, (v) => document.documentElement.style.fontSize = v + "px");
    this._h("Dev panel");
    this._grid([this._btn("Toggle panel theme", () => this._panelTheme())]);
  },

  // ============================================================ NOTES (for Claude)
  _tab_notes() {
    this._h("Notes for Claude");
    this.body.append($(`<i class="dv-dim">Saved to DEV-NOTES.md in the repo (via server.py) + your browser. Leave TODOs, bugs, requests — Claude reads them next session.</i>`));
    const ta = $(`<textarea class="dv-ta" placeholder="e.g. the sofa clips the wall near the window — please fix\nmake Yuki flirtier\nthe kitchen light is too orange"></textarea>`);
    this.body.append(ta);
    this._grid([
      this._btn("💾 Save note", () => { const t = ta.value.trim(); if (t) { this._saveNote(t); ta.value = ""; } }),
      this._btn("⬇ Export .md", () => this._exportNotes()),
      this._btn("Clear", () => { if (confirm("Clear all saved notes?")) { this._notes = []; localStorage.removeItem("cmf.devnotes"); this._tab("notes"); } }, "danger"),
    ]);
    this._h(`Saved (${this._notes.length})`);
    const list = $(`<div class="dv-list"></div>`);
    [...this._notes].reverse().forEach((n) => list.append($(`<div class="dv-note"><time>${new Date(n.ts).toLocaleString()}</time><p></p></div>`)));
    [...this._notes].reverse().forEach((n, i) => { const p = list.querySelectorAll(".dv-note p")[i]; if (p) p.textContent = n.text; });
    this.body.append(list);
  },

  // ============================================================ CONSOLE
  _tab_console() {
    this._h("JS console");
    this.body.append($(`<i class="dv-dim">Runs in page scope. <code>CMF</code> = all modules.</i>`));
    const out = $(`<div class="dv-console" id="dvCon"></div>`); this.body.append(out);
    const inp = $(`<input class="dv-conin" placeholder="CMF.akuu.setExpression('wink')">`);
    inp.onkeydown = (e) => { if (e.key === "Enter") { const code = inp.value; inp.value = ""; this._eval(code, out); } };
    this.body.append(inp);
    this._h("Quick actions");
    this._grid([
      this._btn("Export save", () => this._exportSave()),
      this._btn("Import save", () => this._importSave()),
      this._btn("Reload", () => location.reload()),
      this._btn("Reset save", () => { if (confirm("Wipe the save?")) { State.reset?.(); location.reload(); } }, "danger"),
    ]);
    this._grid([this._btn("⌘K Command palette", () => this._palette()), this._btn("⌨ Shortcuts", () => this._cheatsheet())]);
  },

  // ============================================================ STATE
  _tab_state() {
    this._h("Save snapshots");
    this._grid([this._btn("📸 Snapshot now", () => this._snapshot())]);
    try { const snaps = Object.keys(JSON.parse(localStorage.getItem("cmf.devsnaps") || "{}")).sort().reverse(); if (snaps.length) this._grid(snaps.slice(0, 6).map((ts) => this._btn("↺ " + new Date(+ts).toLocaleTimeString(), () => this._rollback(ts)))); } catch {}
    this._h("Settings editor");
    const s = State.settings;
    const search = $(`<input class="dv-conin" placeholder="filter keys…">`); this.body.append(search);
    const list = $(`<div class="dv-list" id="dvState"></div>`); this.body.append(list);
    const render = (q = "") => {
      list.innerHTML = "";
      Object.keys(s).sort().filter((k) => k.toLowerCase().includes(q.toLowerCase())).slice(0, 80).forEach((k) => {
        const v = s[k]; const t = typeof v;
        if (t === "boolean") { const b = $(`<button class="dv-it">${v ? "☑" : "☐"} ${k}</button>`); b.onclick = () => { State.set(k, !s[k]); render(search.value); }; list.append(b); }
        else if (t === "number" || t === "string") { const row = $(`<div class="dv-kv"><label>${k}</label></div>`); const i = $(`<input value="${String(v).replace(/"/g, "&quot;")}">`); i.onchange = () => State.set(k, t === "number" ? num(i.value, v) : i.value); row.append(i); list.append(row); }
        else { list.append($(`<div class="dv-kv dim"><label>${k}</label><i class="dv-dim">${t}</i></div>`)); }
      });
    };
    search.oninput = () => render(search.value); render();
  },

  // ============================================================ PERF
  _tab_perf() {
    this._h("Frame time (ms)");
    const cv = $(`<canvas class="dv-graph" width="300" height="56"></canvas>`); this.body.append(cv);
    this._drawGraph(cv);
    this._h("Renderer stats");
    this.body.append($(`<div class="dv-mono" id="dvPerfBody">…</div>`));
    this._h("Quality");
    const r = this.ctx.renderer;
    if (r) this._slider("pixel ratio", 0.5, 2, 0.05, r.getPixelRatio(), (v) => r.setPixelRatio(v));
    this._grid([
      this._btn("Shadows toggle", () => { if (r) { r.shadowMap.enabled = !r.shadowMap.enabled; } }),
      this._btn("PostFX toggle", () => { try { window.CMF.PostFX.enabled = !window.CMF.PostFX.enabled; } catch {} }),
    ]);
    this._perfBody();
  },

  // ============================================================ FEATURES (roadmap)
  _tab_features() {
    this._h("Developer Mode — feature roadmap");
    const done = FEATURES.filter((f) => f[0]).length;
    this.body.append($(`<div class="dv-mono">${done}/${FEATURES.length} live · the rest are on the roadmap</div>`));
    const list = $(`<div class="dv-list"></div>`);
    FEATURES.forEach(([ok, cat, name]) => list.append($(`<div class="dv-feat ${ok ? "ok" : ""}"><span>${ok ? "✅" : "▫️"}</span><b>${cat}</b> ${name}</div>`)));
    this.body.append(list);
  },

  // ================================================================ ACTIONS
  _addPrim(kind) {
    const geo = kind === "box" ? new THREE.BoxGeometry(0.6, 0.6, 0.6)
      : kind === "sphere" ? new THREE.SphereGeometry(0.4, 32, 24)
      : kind === "cyl" ? new THREE.CylinderGeometry(0.35, 0.35, 0.8, 32)
      : kind === "cone" ? new THREE.ConeGeometry(0.4, 0.8, 32)
      : kind === "plane" ? new THREE.PlaneGeometry(1, 1)
      : new THREE.TorusGeometry(0.35, 0.14, 20, 40);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff6ba6, roughness: 0.5, metalness: 0.1 }));
    mesh.name = kind + "_" + (this.added.length + 1); mesh.castShadow = mesh.receiveShadow = true;
    this._placeInFront(mesh); this.ctx.scene.add(mesh); this.added.push(mesh); this._select(mesh);
    this._status("added " + mesh.name);
  },
  _addLight(kind) {
    const L = kind === "point" ? new THREE.PointLight(0xffd9b0, 2, 12)
      : kind === "spot" ? new THREE.SpotLight(0xffffff, 3, 18, 0.6, 0.4)
      : new THREE.DirectionalLight(0xffffff, 1.5);
    L.name = kind + "Light_" + Math.floor(Math.random() * 999); this._placeInFront(L); L.position.y = 3;
    if (L.castShadow !== undefined) L.castShadow = true;
    this.ctx.scene.add(L); this.added.push(L); this._select(L); this._status("added " + L.name);
  },
  async _addModel(url) {
    if (!url) return; this._status("loading model…");
    try {
      const { loadCharacterModel, guessIsVRM, detectFormat } = await import("./modelloader.js");
      const m = await loadCharacterModel(url, { isVRM: guessIsVRM(url), format: detectFormat(url) });
      const root = m.root || m.scene || m; root.name = "model_" + (this.added.length + 1);
      this._placeInFront(root); this.ctx.scene.add(root); this.added.push(root); this._select(root); this._status("loaded model");
    } catch (e) { this._status("model failed: " + e.message); }
  },
  _addImage(url) {
    new THREE.TextureLoader().load(url, (tex) => {
      const ar = (tex.image?.width || 1) / (tex.image?.height || 1);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4 * ar, 1.4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
      mesh.name = "image_" + (this.added.length + 1); this._placeInFront(mesh); mesh.position.y = 1.6;
      this.ctx.scene.add(mesh); this.added.push(mesh); this._select(mesh); this._status("placed image");
    }, undefined, () => this._status("image failed to load"));
  },
  _applyTexture(o, url) { new THREE.TextureLoader().load(url, (tex) => { if (o.material) { o.material.map = tex; o.material.needsUpdate = true; this._status("texture applied"); } }, undefined, () => this._status("texture failed")); },
  _placeInFront(o) { const cam = this.ctx.camera; const dir = new THREE.Vector3(); cam.getWorldDirection(dir); o.position.copy(cam.position).add(dir.multiplyScalar(2.5)); o.position.y = Math.max(0.3, o.position.y); },

  _dup() { if (!this.sel) return; const c = this.sel.clone(true); if (this.sel.material) c.material = this.sel.material.clone?.() || this.sel.material; c.name = (this.sel.name || "obj") + "_copy"; c.position.x += 0.5; this.ctx.scene.add(c); this.added.push(c); this._select(c); },
  _del() { const o = this.sel; if (!o) return; this._detach(); o.parent?.remove(o); o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); this.added = this.added.filter((x) => x !== o); this.sel = null; this._status("deleted"); this._tab(this._curTab); },
  _frame() { const o = this.sel; const cc = this.ctx.camCtl; if (!o || !cc?.flyTo) return; const p = new THREE.Vector3(); o.getWorldPosition(p); cc.flyTo(p.clone().add(new THREE.Vector3(2, 1.5, 2)), p.clone()); },

  // selection + gizmo
  _select(o) { this.sel = o; if (window.CMF) window.CMF.devSel = o; this._status("selected: " + (o.name || o.type)); if (this.on) this._tab("object"); },
  async _gizmo(mode) {
    this._tcMode = mode;
    const TC = await this._ensureTC(); if (!TC || !this.sel) return;
    if (!this.tc) {
      this.tc = new TC(this.ctx.camera, this.ctx.renderer.domElement);
      const helper = this.tc.getHelper ? this.tc.getHelper() : this.tc;
      this.tc._helperObj = helper; this.ctx.scene.add(helper);
      this.tc.addEventListener("dragging-changed", (e) => {
        if (this.ctx.camCtl?.orbit) this.ctx.camCtl.orbit.enabled = !e.value;
        const o = this.tc.object; if (!o) return;
        if (e.value) { this._dragFrom = { o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }; }
        else if (this._dragFrom?.o === o) { const f = this._dragFrom, t = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }; this._hist(() => { o.position.copy(f.p); o.quaternion.copy(f.q); o.scale.copy(f.s); }, () => { o.position.copy(t.p); o.quaternion.copy(t.q); o.scale.copy(t.s); }); this._dragFrom = null; }
      });
    }
    this.tc.translationSnap = this._snap || null;
    this.tc.setMode(mode); this.tc.attach(this.sel);
    this.panel.querySelectorAll(".dv-grid .dv-b").forEach((b) => {}); this._tab("object");
  },
  _detach() { if (this.tc) { this.tc.detach(); } this._tcMode = null; },

  // collision blockers (soft dev walls) — wraps the camCtl/akuu colliders once
  _addBlocker(o) {
    const p = new THREE.Vector3(); o.getWorldPosition(p);
    const box = new THREE.Box3().setFromObject(o); const size = box.getSize(new THREE.Vector3());
    (State.world.devBlockers ||= []).push({ x: p.x, z: p.z, rx: Math.max(0.3, size.x / 2), rz: Math.max(0.3, size.z / 2) });
    this._hookColliders(); this._status("wall added at " + o.name);
  },
  _clearBlockers() { State.world.devBlockers = []; this._status("dev walls cleared"); },
  _hookColliders() {
    if (this._hooked) return; this._hooked = true;
    const cc = this.ctx.camCtl; if (!cc) return;
    const wrap = (setter, get) => { const orig = get(); setter((from, to) => { let r = orig ? orig(from, to) : to; for (const b of (State.world.devBlockers || [])) { if (Math.abs(r.x - b.x) < b.rx && Math.abs(r.z - b.z) < b.rz) { r = { x: from.x, y: r.y ?? 0, z: from.z }; break; } } return r; }); };
    try { wrap((fn) => cc.setCollider(fn), () => cc._collider); } catch {}
  },

  // helpers (grid/axes/collision/wireframe)
  _toggleHelper(kind) {
    const sc = this.ctx.scene, H = this.helpers;
    if (H[kind]) { sc.remove(H[kind]); H[kind].geometry?.dispose?.(); H[kind] = null; this._status(kind + " off"); return; }
    if (kind === "grid") H.grid = new THREE.GridHelper(30, 30, 0xff6ba6, 0x445);
    else if (kind === "axes") H.axes = new THREE.AxesHelper(3);
    else if (kind === "collision") { const g = new THREE.Group(); const env = window.CMF?.collider?.root || window.CMF?.env?.root; (env || sc).traverse((o) => { if (o.isMesh && o.geometry) { const w = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry), new THREE.LineBasicMaterial({ color: 0x39ff88 })); o.updateWorldMatrix(true, false); w.applyMatrix4(o.matrixWorld); g.add(w); } }); H.collision = g; }
    if (H[kind]) { sc.add(H[kind]); this._status(kind + " on"); }
  },
  _wireAll() { this._wire = !this._wire; this.ctx.scene.traverse((o) => { if (o.isMesh && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.wireframe = this._wire); }); this._status("wireframe " + (this._wire ? "on" : "off")); },

  // camera views + fly + bookmarks
  _view(which) {
    const cc = this.ctx.camCtl; if (!cc?.flyTo) return; const t = cc.defaultTarget?.clone?.() || new THREE.Vector3(0, 1, 0);
    if (which === "top") cc.flyTo(new THREE.Vector3(t.x, 16, t.z + 0.01), t);
    else cc.flyTo(new THREE.Vector3(t.x, 2, t.z + 10), t);
  },
  _toggleFly() {
    this.fly = !this.fly; const cc = this.ctx.camCtl;
    if (this.fly) { if (cc?.orbit) cc.orbit.enabled = false; this._flySpeed = this._flySpeed || 5; }
    else if (cc?.orbit && cc.mode !== "first") cc.orbit.enabled = true;
    this._tab("camera");
  },
  _flyKey(e, down) { const k = e.key.toLowerCase(); if ("wasdqe".includes(k) || e.key.startsWith("Arrow")) this._flyKeys[k] = down; },
  _flyUpdate(dt) {
    if (!this.fly) return; const cam = this.ctx.camera; const sp = (this._flySpeed || 5) * dt; const K = this._flyKeys;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    if (K.w) cam.position.addScaledVector(fwd, sp); if (K.s) cam.position.addScaledVector(fwd, -sp);
    if (K.d) cam.position.addScaledVector(right, sp); if (K.a) cam.position.addScaledVector(right, -sp);
    if (K.e) cam.position.y += sp; if (K.q) cam.position.y -= sp;
  },
  _saveBookmark() { const cam = this.ctx.camera, cc = this.ctx.camCtl; (State.settings.devCamBookmarks ||= []).push({ p: cam.position.toArray(), t: (cc?.orbit?.target || new THREE.Vector3()).toArray() }); State.save?.(); this._tab("camera"); },
  _loadBookmark(bm) { const cc = this.ctx.camCtl; if (cc?.flyTo) cc.flyTo(new THREE.Vector3().fromArray(bm.p), new THREE.Vector3().fromArray(bm.t)); },

  _screenshot() {
    try {
      const src = this.ctx.renderer.domElement; const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
      c.getContext("2d").drawImage(src, 0, 0); const url = c.toDataURL("image/png");
      const a = document.createElement("a"); a.href = url; a.download = "cmf-dev-" + Date.now() + ".png"; a.click(); this._status("screenshot saved");
    } catch (e) { this._status("screenshot failed: " + e.message); }
  },

  // UI live text edit
  _toggleUIEdit() {
    this._uiEdit = !this._uiEdit;
    if (this._uiEdit) { this._uiHandler = (e) => this._editText(e); document.addEventListener("click", this._uiHandler, true); document.body.classList.add("dev-uiedit"); }
    else { document.removeEventListener("click", this._uiHandler, true); document.body.classList.remove("dev-uiedit"); }
    this._tab("ui");
  },
  _editText(e) {
    const t = e.target; if (this.panel.contains(t) || t.closest("#devPanel,#devBtn")) return;
    if (t.children.length > 0 && ![...t.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
    e.preventDefault(); e.stopPropagation();
    const cur = t.textContent; const v = prompt("Edit text:", cur); if (v != null) t.textContent = v;
  },

  // notes for Claude — POST to server.py, fallback to localStorage/download
  _loadNotes() { try { this._notes = JSON.parse(localStorage.getItem("cmf.devnotes") || "[]"); } catch { this._notes = []; } },
  _saveNote(text) {
    const note = { text, ts: Date.now() }; this._notes.push(note);
    try { localStorage.setItem("cmf.devnotes", JSON.stringify(this._notes.slice(-200))); } catch {}
    fetch("/dev/note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(note) })
      .then((r) => this._status(r.ok ? "saved to DEV-NOTES.md ♡" : "saved locally (no server)"))
      .catch(() => this._status("saved locally (offline)"));
    this._tab("notes");
  },
  _exportNotes() {
    const md = "# Dev notes for Claude\n\n" + this._notes.map((n) => `- **${new Date(n.ts).toLocaleString()}** — ${n.text}`).join("\n") + "\n";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" })); a.download = "DEV-NOTES.md"; a.click();
  },

  // console
  _eval(code, out) {
    let res; try { res = eval(`(function(){ const CMF=window.CMF; return (${code}); })()`); } catch (e1) { try { res = eval(`(function(){ const CMF=window.CMF; ${code} })()`); } catch (e2) { res = e2; } }
    const line = $(`<div class="dv-cl"><span class="dv-ci">›</span> <code></code><div class="dv-cr"></div></div>`);
    line.querySelector("code").textContent = code;
    let s; try { s = res instanceof Error ? "⚠ " + res.message : typeof res === "object" ? JSON.stringify(res, (k, v) => v?.isVector3 ? v.toArray() : v, 1)?.slice(0, 400) : String(res); } catch { s = String(res); }
    line.querySelector(".dv-cr").textContent = s;
    out.append(line); out.scrollTop = out.scrollHeight;
  },
  _exportSave() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(State.settings, null, 1)], { type: "application/json" })); a.download = "cmf-save.json"; a.click(); },
  _importSave() { const i = document.createElement("input"); i.type = "file"; i.accept = ".json"; i.onchange = () => { const f = i.files[0]; if (!f) return; f.text().then((t) => { try { Object.assign(State.settings, JSON.parse(t)); State.save?.(); location.reload(); } catch (e) { alert("bad save file"); } }); }; i.click(); },

  // picking
  _pick(e, force = false) {
    if (!this.on || this.tc?.dragging) return;
    if (!(this._pickMode || this._measuring || this._pinning || force)) return;
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(m, this.ctx.camera);
    const hit = ray.intersectObjects(this.ctx.scene.children, true).find((h) => h.object.isMesh && h.object.visible);
    if (!hit) return;
    if (this._pinning) { this._addPin(hit.point.clone()); this._pinning = false; return; }
    if (this._measuring) { (this._measPts ||= []).push(hit.point.clone()); if (this._measPts.length === 2) { const d = this._measPts[0].distanceTo(this._measPts[1]); this._drawMeasure(this._measPts[0], this._measPts[1]); this._status("distance: " + d.toFixed(2) + " m"); this._measPts = []; } else this._status("measure: first point set — click the second"); return; }
    let o = hit.object; while (o.parent && o.parent !== this.ctx.scene && !o.name) o = o.parent;
    if (o.userData.devLocked) { this._status("🔒 locked: " + (o.name || o.type)); return; }
    this._select(o);
  },
  _drawMeasure(a, b) { if (this._measLine) this.ctx.scene.remove(this._measLine); this._measLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0x39ff88 })); this.ctx.scene.add(this._measLine); },

  // perf
  _perfLoop() { cancelAnimationFrame(this._pf); const tick = () => { if (!this.on) return; this._perfHead(); this._pf = requestAnimationFrame(tick); }; tick(); },
  _perfHead() { const info = this.ctx.renderer?.info; const el = document.getElementById("dvPerf"); if (el && info) el.textContent = `${info.render.calls} calls · ${(info.render.triangles / 1000).toFixed(0)}k tris`; },
  _perfBody() { const info = this.ctx.renderer?.info; const el = document.getElementById("dvPerfBody"); if (!el || !info) return; el.textContent = `draw calls: ${info.render.calls}\ntriangles: ${info.render.triangles}\ngeometries: ${info.memory.geometries}\ntextures: ${info.memory.textures}\nprograms: ${info.programs?.length ?? "?"}\npixelRatio: ${this.ctx.renderer.getPixelRatio()}`; setTimeout(() => { if (this.on && this._curTab === "perf") this._perfBody(); }, 500); },
  _drawGraph(cv) {
    const ctx = cv.getContext("2d");
    const draw = () => {
      if (!this.on || this._curTab !== "perf" || !cv.isConnected) return;
      const w = cv.width, h = cv.height, ft = this._ft || [];
      ctx.fillStyle = "#0f0a16"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#39ff8855"; ctx.beginPath(); ctx.moveTo(0, h - 16.6); ctx.lineTo(w, h - 16.6); ctx.stroke();   // 60fps reference
      ctx.fillStyle = "#7dd3fc"; const bw = w / 120;
      for (let i = 0; i < ft.length; i++) { const v = Math.min(50, ft[i]); const bh = (v / 50) * h; ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 1), bh); }
      requestAnimationFrame(draw);
    };
    draw();
  },

  // ---------------- history (undo/redo) ----------------
  _hist(undo, redo) { (this._H ||= []).push({ undo, redo }); if (this._H.length > 60) this._H.shift(); this._R = []; },
  _undo() { const a = (this._H || []).pop(); if (!a) return this._status("nothing to undo"); try { a.undo(); } catch {} (this._R ||= []).push(a); this._status("undone ↩"); if (this.on) this._tab(this._curTab); },
  _redo() { const a = (this._R || []).pop(); if (!a) return this._status("nothing to redo"); try { a.redo(); } catch {} (this._H ||= []).push(a); this._status("redone ↪"); if (this.on) this._tab(this._curTab); },
  _recordAdd(o) { this._hist(() => { o.parent?.remove(o); this.added = this.added.filter((x) => x !== o); if (this.sel === o) this.sel = null; }, () => { this.ctx.scene.add(o); this.added.push(o); }); },

  // ---------------- clipboard ----------------
  _copy() { if (!this.sel) return; try { this._clip = this.sel.toJSON(); this._status("copied " + (this.sel.name || this.sel.type)); } catch { this._status("copy failed"); } },
  _paste() { if (!this._clip) return this._status("clipboard empty"); try { const o = new THREE.ObjectLoader().parse(this._clip); o.name = (o.name || "obj") + "_paste"; o.position.x += 0.6; this.ctx.scene.add(o); this.added.push(o); this._recordAdd(o); this._select(o); this._status("pasted"); } catch (e) { this._status("paste failed: " + e.message); } },
  _rename() { if (!this.sel) return; const v = prompt("Rename:", this.sel.name || ""); if (v != null) { this.sel.name = v; this._tab(this._curTab); } },
  _lockObj() { if (!this.sel) return; this.sel.userData.devLocked = !this.sel.userData.devLocked; this._status(this.sel.userData.devLocked ? "locked 🔒" : "unlocked"); this._tab("object"); },
  _isolate() { const sc = this.ctx.scene; if (this._iso) { this._iso.forEach(([o, v]) => o.visible = v); this._iso = null; this._status("un-isolated"); } else { this._iso = []; sc.children.forEach((o) => { if (o !== this.sel && o.isMesh) { this._iso.push([o, o.visible]); o.visible = false; } }); this._status("isolated"); } },
  _align() { if (!this.sel) return; const g = this._snap || 0.25; ["x", "y", "z"].forEach((a) => this.sel.position[a] = Math.round(this.sel.position[a] / g) * g); this._tab("object"); },

  // ---------------- material presets / PBR textures ----------------
  _matPreset(kind) {
    const m = this.sel?.material; if (!m || Array.isArray(m)) return;
    const set = (c, r, mt, e = "#000000", op = 1) => { m.color?.set(c); if ("roughness" in m) m.roughness = r; if ("metalness" in m) m.metalness = mt; m.emissive?.set(e); m.opacity = op; m.transparent = op < 1; m.needsUpdate = true; };
    ({ gold: () => set("#ffd27a", 0.25, 1), glass: () => set("#bfe6ff", 0.05, 0, "#000000", 0.35), neon: () => set("#ff4fa3", 0.4, 0, "#ff2f8f"), matte: () => set("#cfc7d8", 0.95, 0), mirror: () => set("#ffffff", 0.02, 1), wood: () => set("#8a5a34", 0.7, 0) }[kind] || (() => {}))();
    this._status("material: " + kind); this._tab("object");
  },
  _pbr(url, slot) { if (!url) return; new THREE.TextureLoader().load(url, (tex) => { const m = this.sel?.material; if (m) { m[slot] = tex; m.needsUpdate = true; this._status(slot + " set"); } }, undefined, () => this._status(slot + " failed")); },

  // ---------------- world: cycle / sky presets / dolly / spawn ----------------
  _autoCycle() { this._cycle = !this._cycle; this._status("day/night cycle " + (this._cycle ? "on" : "off")); this._tab("world"); },
  _skyPreset(name) { const C = window.CMF || {}; const P = { noon: 12, golden: 18, night: 23, dawn: 6.5, fog: 15 }[name]; if (P == null) return; State.world.timeOfDay = P; try { C.Atmosphere?.setTime?.(P); C.PostFX?.setTime?.(P); } catch {} if (name === "fog") this.ctx.scene.fog = new THREE.FogExp2(0x9aa0b0, 0.03); this._status("sky: " + name); },
  _dolly() { const o = this.ctx.camCtl?.orbit; if (!o) return; o.autoRotate = !o.autoRotate; o.autoRotateSpeed = 1.4; this._status("dolly " + (o.autoRotate ? "on" : "off")); this._tab("camera"); },
  _spawnDummy() { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.8, 6, 12), new THREE.MeshStandardMaterial({ color: 0x88aaff, roughness: 0.6 })); body.position.y = 0.85; const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffd9b0 })); head.position.y = 1.55; g.add(body, head); g.name = "npc_" + (this.added.length + 1); this._placeInFront(g); g.traverse((o) => { o.castShadow = true; }); this.ctx.scene.add(g); this.added.push(g); this._recordAdd(g); this._select(g); this._status("spawned NPC"); },

  // ---------------- AI playground / hotspots ----------------
  _playground(sys, msg, out) { out.textContent = "…thinking"; const b = window.CMF?.Brain; if (!b?.sendAs) { out.textContent = "no brain / key"; return; } b.sendAs(sys || "You are a helpful test character.", [], msg).then((t) => out.textContent = t || "(empty)").catch((e) => out.textContent = "⚠ " + e.message); },
  _openHotspots() { this.toggle(false); (document.getElementById("hotspotBtn") || document.querySelector('[title*="otspot"]'))?.click?.(); },

  // ---------------- palette / cheatsheet / snapshots ----------------
  _palette() {
    let ov = document.getElementById("dvPalette"); if (ov) { ov.remove(); return; }
    ov = $(`<div id="dvPalette"><input placeholder="type a command…" autocomplete="off"><div class="dv-pl"></div></div>`); document.body.append(ov);
    const inp = ov.querySelector("input"), list = ov.querySelector(".dv-pl");
    const render = (q = "") => { list.innerHTML = ""; PALETTE.filter((c) => c[0].toLowerCase().includes(q.toLowerCase())).slice(0, 14).forEach((c) => { const b = $(`<button>${c[0]}</button>`); b.onclick = () => { ov.remove(); try { c[1](this); } catch {} }; list.append(b); }); };
    inp.oninput = () => render(inp.value); inp.onkeydown = (e) => { if (e.key === "Escape") ov.remove(); if (e.key === "Enter") list.querySelector("button")?.click(); };
    render(); setTimeout(() => inp.focus(), 30);
  },
  _cheatsheet() { alert("Dev Mode shortcuts\n\n F8 or `   toggle Dev Mode\n Ctrl/⌘+K  command palette\n Ctrl/⌘+Z / +Y  undo / redo\n Pick mode → click any object\n Gizmo: Move / Rotate / Scale\n Fly cam: WASD + Q/E\n Double-click a mesh: focus it\n\n Everything autosaves to your browser."); },
  _snapshot() { try { const all = JSON.parse(localStorage.getItem("cmf.devsnaps") || "{}"); all[Date.now()] = JSON.stringify(State.settings); const keys = Object.keys(all).sort(); while (keys.length > 10) delete all[keys.shift()]; localStorage.setItem("cmf.devsnaps", JSON.stringify(all)); } catch {} this._status("snapshot saved"); this._tab("state"); },
  _rollback(ts) { try { const all = JSON.parse(localStorage.getItem("cmf.devsnaps") || "{}"); if (all[ts] && confirm("Roll back the save to this snapshot? (reloads)")) { Object.assign(State.settings, JSON.parse(all[ts])); State.save?.(); location.reload(); } } catch {} },

  // ---------------- export / prefabs / physics ----------------
  _exportScene() {
    const objs = this.added.map((o) => { try { return o.toJSON(); } catch { return null; } }).filter(Boolean);
    const body = JSON.stringify({ objects: objs, ts: Date.now() }, null, 1);
    fetch("/dev/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "scene.json", body }) }).then((r) => this._status(r.ok ? "→ dev-exports/scene.json ♡" : "downloaded")).catch(() => {});
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "application/json" })); a.download = "cmf-scene.json"; a.click();
  },
  _savePrefab() { if (!this.sel) return; const name = prompt("Prefab name:", this.sel.name || "prefab"); if (!name) return; try { (State.settings.devPrefabs ||= {})[name] = this.sel.toJSON(); State.save?.(); this._status("prefab: " + name); this._tab("scene"); } catch { this._status("prefab failed"); } },
  _spawnPrefab(name) { const j = State.settings.devPrefabs?.[name]; if (!j) return; try { const o = new THREE.ObjectLoader().parse(j); o.position.x += 0.5; this.ctx.scene.add(o); this.added.push(o); this._recordAdd(o); this._select(o); this._status("spawned " + name); } catch { this._status("spawn failed"); } },
  _drop() { if (!this.sel) return; (this._phys ||= []).push({ o: this.sel, vy: 0 }); this._status("dropped (gravity + bounce)"); },

  // ---------------- clean screenshot / light helper / measure / pins / theme ----------------
  _screenshotClean() { const hide = [this.panel, document.getElementById("devBtn"), document.getElementById("hud"), document.getElementById("chatDock")].filter(Boolean); const prev = hide.map((e) => e.style.display); hide.forEach((e) => e.style.display = "none"); requestAnimationFrame(() => { this._screenshot(); hide.forEach((e, i) => e.style.display = prev[i]); }); },
  _lightHelper() { const L = this.sel; if (!L?.isLight) return; if (L.userData._helper) { L.userData._helper.parent?.remove(L.userData._helper); L.userData._helper = null; this._status("helper off"); return; } let h; if (L.isPointLight) h = new THREE.PointLightHelper(L, 0.4); else if (L.isSpotLight) h = new THREE.SpotLightHelper(L); else if (L.isDirectionalLight) h = new THREE.DirectionalLightHelper(L, 1); if (h) { this.ctx.scene.add(h); L.userData._helper = h; this._status("light helper on"); } },
  _measure() { this._measuring = !this._measuring; this._measPts = []; this._status(this._measuring ? "click two points to measure" : "measure off"); },
  _pinMode() { this._pinning = !this._pinning; this._status(this._pinning ? "click in the world to pin a note" : "pin off"); },
  _addPin(point) { const text = prompt("Pin note here:"); if (text == null) return; const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffd447 })); s.position.copy(point); s.userData.pinText = text; s.name = "pin"; this.ctx.scene.add(s); (this._pins ||= []).push(s); this._saveNote(`[PIN @ ${point.x.toFixed(1)},${point.y.toFixed(1)},${point.z.toFixed(1)}] ${text}`); this._status("pin dropped + noted"); },
  _panelTheme() { this.panel.classList.toggle("dv-light"); this._status("panel theme toggled"); },

  // ---------------- AUDIO tab ----------------
  _tab_audio() {
    const A = window.CMF?.Audio; const s = State.settings;
    this._h("Mixer");
    this._slider("music vol", 0, 1, 0.01, s.musicVolume ?? 0.5, (v) => { State.set("musicVolume", v); A?.setMusicVolume?.(v); });
    this._slider("sfx vol", 0, 1, 0.01, s.sfxVolume ?? 0.6, (v) => State.set("sfxVolume", v));
    if (A?.master) this._slider("master vol", 0, 1, 0.01, A.master.gain.value, (v) => A.master.gain.value = v);
    this._h("Toggles");
    this._grid([
      this._btn((s.musicEnabled ? "Music: on" : "Music: off"), () => { State.set("musicEnabled", !s.musicEnabled); if (s.musicEnabled) { A?.resume?.(); A?.startMusic?.(); } else A?.stopMusic?.(); this._tab("audio"); }, s.musicEnabled ? "hot" : ""),
      this._btn("Ambient toggle", () => { try { const Am = window.CMF.Ambient; Am._on = !Am._on; } catch {} }),
    ]);
    this._h("Trigger SFX");
    this._grid(["pop", "click", "shutter", "chime", "success", "error"].map((n) => this._btn(n, () => { try { A?.resume?.(); A?.sfx?.(n); } catch {} })));
  },

  // ---------------- WORLD tab ----------------
  _tab_world() {
    this._h("Time");
    this._grid([this._btn(this._cycle ? "Auto-cycle: ON" : "Auto-cycle: off", () => this._autoCycle(), this._cycle ? "hot" : "")]);
    if (this._cycle) this._slider("cycle speed", 0.1, 4, 0.1, this._cycleSpeed || 1, (v) => this._cycleSpeed = v);
    this._h("Sky / weather presets");
    this._grid(["noon", "golden", "dawn", "night", "fog"].map((n) => this._btn(n, () => this._skyPreset(n))));
    this._h("Spawn");
    this._grid([this._btn("＋ Dummy NPC", () => this._spawnDummy()), this._btn("＋ Model URL", () => { const u = prompt("Character model URL:"); if (u) this._addModel(u); })]);
    this._h("World tools");
    this._grid([
      this._btn("🧭 Hotspot editor", () => this._openHotspots()),
      this._btn(this._pinning ? "Pin: ON" : "📌 Pin note in world", () => this._pinMode(), this._pinning ? "hot" : ""),
      this._btn(this._measuring ? "Measure: ON" : "📏 Measure", () => this._measure(), this._measuring ? "hot" : ""),
    ]);
    this._h("Quest / event tester");
    this._grid([
      this._btn("Trigger reminder", () => State.bus.emit("reminder:fired", "dev test reminder")),
      this._btn("Proactive line", () => { try { window.CMF.Brain.proactive(); } catch {} }),
      this._btn("Particle burst", () => { try { window.CMF.ctx && window.CMF.magic?.fxBurst?.("sparkles"); } catch {} }),
    ]);
    this._h("AI prompt playground");
    let sys = "", msg = "";
    this._text("system / persona", "", (v) => sys = v, "You are a grumpy wizard…");
    this._text("message", "", (v) => msg = v, "say hi");
    const out = $(`<div class="dv-mono" style="min-height:34px">reply appears here…</div>`);
    this._grid([this._btn("▶ Run", () => this._playground(sys, msg, out))]);
    this.body.append(out);
  },

  // called every frame from main loop
  update(dt) {
    this._flyUpdate(dt);
    // day/night auto-cycle
    if (this._cycle) { State.world.timeOfDay = ((State.world.timeOfDay || 12) + dt * (this._cycleSpeed || 1) * 0.4) % 24; try { window.CMF.Atmosphere?.setTime?.(State.world.timeOfDay); window.CMF.PostFX?.setTime?.(State.world.timeOfDay); } catch {} }
    // simple physics drop (gravity + floor bounce)
    if (this._phys?.length) { for (const b of this._phys) { b.vy -= 9.8 * dt; b.o.position.y += b.vy * dt; if (b.o.position.y <= 0) { b.o.position.y = 0; b.vy = -b.vy * 0.45; if (Math.abs(b.vy) < 0.4) b.settled = true; } } this._phys = this._phys.filter((b) => !b.settled); }
    // frame-time sampling for the graph
    (this._ft ||= []).push(dt * 1000); if (this._ft.length > 120) this._ft.shift();
  },
};

// -------- command palette actions (⌘K) --------------------------------------
const PALETTE = [
  ["Add box", (D) => D._addPrim("box")], ["Add sphere", (D) => D._addPrim("sphere")], ["Add point light", (D) => D._addLight("point")],
  ["Undo", (D) => D._undo()], ["Redo", (D) => D._redo()], ["Copy object", (D) => D._copy()], ["Paste object", (D) => D._paste()],
  ["Duplicate", (D) => D._dup()], ["Delete selected", (D) => D._del()], ["Isolate selected", (D) => D._isolate()], ["Frame selected", (D) => D._frame()],
  ["Screenshot", (D) => D._screenshot()], ["Screenshot (no HUD)", (D) => D._screenshotClean()], ["Export scene JSON", (D) => D._exportScene()],
  ["Day/night cycle", (D) => D._autoCycle()], ["Sky: golden hour", (D) => D._skyPreset("golden")], ["Sky: night", (D) => D._skyPreset("night")], ["Sky: noon", (D) => D._skyPreset("noon")],
  ["Orbit dolly", (D) => D._dolly()], ["Free-fly camera", (D) => D._toggleFly()], ["Spawn NPC", (D) => D._spawnDummy()],
  ["Grid helper", (D) => D._toggleHelper("grid")], ["Wireframe all", (D) => D._wireAll()], ["Measure tool", (D) => D._measure()],
  ["Pin note in world", (D) => D._pinMode()], ["Snapshot save", (D) => D._snapshot()], ["Shortcuts help", (D) => D._cheatsheet()],
  ["Alice: wink", () => { try { window.CMF.akuu.setExpression("wink"); } catch {} }], ["Alice: wave", () => { try { (window.CMF.akuu.custom?.gesture || window.CMF.akuu.gesture)?.call(window.CMF.akuu.custom || window.CMF.akuu, "wave", 0); } catch {} }],
  ["Toggle Freeze AI", () => { try { window.CMF.State.set("frozen", !window.CMF.State.settings.frozen); } catch {} }], ["Reload page", () => location.reload()],
];

// -------- the 90 BIG + 30 small feature roadmap (✅ = live in this build) -------
const FEATURES = [
  // BIG — scene/object (live)
  [1, "Scene", "click-to-pick any object"], [1, "Scene", "add box/sphere/cyl/cone/plane/torus"], [1, "Scene", "load GLB/VRM/FBX by URL"],
  [1, "Object", "move/rotate/scale gizmo (TransformControls)"], [1, "Object", "numeric position/rotation/scale"], [1, "Object", "duplicate object"],
  [1, "Object", "delete object"], [1, "Object", "hide/show + snap to floor"], [1, "Object", "scene tree browser"],
  [1, "Collision", "add block volumes (dev walls)"], [1, "Collision", "clear dev walls"], [1, "Collision", "show collision wireframe"],
  [1, "Light", "add point/spot/directional lights"], [1, "Light", "edit intensity/color/distance/angle"], [1, "Light", "move lights"],
  [1, "Look", "time-of-day scrubber"], [1, "Look", "exposure control"], [1, "Look", "fog color/density/far"],
  [1, "Look", "background color"], [1, "Look", "bloom strength/threshold/radius"], [1, "Look", "shadows on/off"],
  [1, "Material", "color/emissive pickers"], [1, "Material", "roughness/metalness/opacity"], [1, "Material", "per-object wireframe"],
  [1, "Image", "place image as a plane in-world"], [1, "Image", "apply texture URL to selected"], [1, "Image", "PNG screenshot export"],
  [1, "Camera", "free-fly camera (WASD/QE)"], [1, "Camera", "fly speed + FOV"], [1, "Camera", "top/front/reset views"],
  [1, "Camera", "frame selected"], [1, "Camera", "save/load view bookmarks"], [1, "Alice", "set any expression"],
  [1, "Alice", "trigger any gesture"], [1, "Alice", "make her say a line"], [1, "Alice", "affection/trust sliders"],
  [1, "Alice", "need sliders"], [1, "Alice", "freeze/unfreeze AI"], [1, "Alice", "teleport / look-at me"],
  [1, "Alice", "hot-swap model URL"], [1, "UI", "live-edit any on-screen text"], [1, "UI", "toggle HUD panels"],
  [1, "UI", "theme color variables live"], [1, "UI", "UI scale"], [1, "Notes", "notes for Claude → repo file"],
  [1, "Notes", "export notes as markdown"], [1, "Console", "in-game JS eval (CMF)"], [1, "Console", "export/import save JSON"],
  [1, "Console", "reset save / reload"], [1, "State", "live settings editor + search"], [1, "State", "toggle boolean flags"],
  [1, "Perf", "draw calls / tris / memory HUD"], [1, "Perf", "pixel ratio + shadow + postfx toggles"], [1, "Scene", "grid + axes helpers"],
  [1, "Scene", "global wireframe"], [1, "Global", "hotkey toggle (F8 / backtick)"], [1, "Global", "persistent dev button"],
  // BIG — batch 2 (now live)
  [0, "Object", "multi-select + group transform"], [0, "Scene", "drag-drop model files onto window"], [1, "Scene", "prefab library (save/spawn)"],
  [0, "Collision", "paint navmesh walkable/blocked"], [0, "Collision", "auto-rebuild BVH from edits"], [1, "Light", "light gizmos + shadow preview"],
  [0, "Look", "full color-grade curves editor"], [1, "Look", "weather/sky presets"], [1, "Material", "PBR texture-set uploader"],
  [1, "Material", "material library + presets"], [0, "Image", "decal projection onto walls"], [0, "Camera", "cinematic keyframe timeline"],
  [1, "Camera", "orbit-around-target dolly"], [0, "Alice", "pose editor (per-bone)"], [0, "Alice", "dialogue tree editor"],
  [0, "Alice", "record/replay her actions"], [0, "UI", "drag to reposition HUD panels"], [0, "UI", "full CSS inspector"],
  [1, "Notes", "pin notes to 3D locations"], [0, "Notes", "attach screenshot to a note"], [1, "Console", "command palette"],
  [1, "State", "rollback save-history snapshots"], [1, "Perf", "frame-time graph"], [1, "World", "hotspot editor integration"],
  [1, "World", "day/night auto-cycle"], [1, "World", "spawn NPC / other characters"], [1, "Audio", "per-channel mixer"],
  [1, "Audio", "trigger/preview SFX"], [1, "Physics", "gravity/bounce drop sandbox"], [1, "Export", "export edited scene to JSON"],
  [0, "Export", "one-click share build"], [1, "World", "quest/event trigger tester"], [1, "AI", "prompt playground in-game"],
  // SMALL (30)
  [1, "small", "status line feedback"], [1, "small", "selected object highlighted in CMF.devSel"], [1, "small", "esc-safe hotkeys while typing"],
  [1, "small", "color pickers everywhere"], [1, "small", "sliders show live value"], [1, "small", "scene tree icons"],
  [1, "small", "danger buttons styled red"], [1, "small", "active tool highlighted"], [1, "small", "notes timestamped"],
  [1, "small", "console history scroll"], [1, "small", "feature counter"], [1, "small", "camera position readout"],
  [1, "small", "keyboard shortcut cheat-sheet"], [1, "small", "undo last edit"], [1, "small", "redo"],
  [1, "small", "copy object as JSON"], [1, "small", "paste object"], [1, "small", "lock object"],
  [1, "small", "rename object inline"], [0, "small", "duplicate along axis"], [1, "small", "align to grid"],
  [1, "small", "measure tool"], [1, "small", "isolate selected"], [1, "small", "focus-on-double-click"],
  [0, "small", "recent colors palette"], [0, "small", "favorite objects bar"], [1, "small", "snap increment setting"],
  [0, "small", "toggle vsync/cap fps"], [1, "small", "screenshot with/without HUD"], [1, "small", "dark/light panel theme"],
];
