// ============================================================================
//  CATCH ME FIRST — controller.js
//  Camera system with 3 modes you can shift between like a physical person:
//    • orbit  — free overview (drag + scroll)
//    • first  — first-person Deku: WASD + mouse-look (pointer lock), sprint
//    • third  — third-person: drive a Deku avatar, camera follows behind
// ============================================================================

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { loadCharacterModel, guessIsVRM, detectFormat } from "./modelloader.js";

const EYE = 1.62;          // first-person eye height
const WALK = 2.6, RUN = 4.8;

// simple furniture no-go boxes (approx, in world XZ) so you can't walk through things
const BLOCKERS = [
  { x: -4.0, z: 0.5, rx: 0.9, rz: 0.5 },   // bookshelf
  { x: 3.9, z: 1.8, rx: 0.7, rz: 0.9 },    // wardrobe
  { x: -3.4, z: -2.4, rx: 0.7, rz: 1.1 },  // bed A
  { x: 3.4, z: -2.4, rx: 0.7, rz: 1.1 },   // bed B
  { x: -3.0, z: -3.2, rx: 0.9, rz: 0.5 },  // desk A
  { x: 3.0, z: -3.2, rx: 0.9, rz: 0.5 },   // desk B
  { x: 0.2, z: 1.4, rx: 0.6, rz: 0.4 },    // coffee table
  { x: -4.0, z: 3.0, rx: 0.4, rz: 0.4 },   // fridge
];

export class CameraController {
  constructor(camera, renderer, scene, dims, defaultTarget) {
    this.camera = camera;
    this.scene = scene;
    this.dims = dims;
    this.mode = "orbit";
    this.keys = {};
    this.defaultTarget = defaultTarget.clone();
    this.defaultPos = camera.position.clone();

    // half-extents of the walkable floor
    this.bx = dims.W / 2 - 0.5;
    this.bz = dims.D / 2 - 0.5;

    // orbit (used by 'orbit' and 'third')
    this.orbit = new OrbitControls(camera, renderer.domElement);
    this.orbit.enableDamping = true; this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 1.5; this.orbit.maxDistance = 12;
    this.orbit.maxPolarAngle = Math.PI * 0.52;
    this.orbit.target.copy(defaultTarget);

    // first-person
    this.fp = new PointerLockControls(camera, renderer.domElement);

    // Deku avatar for third-person. `deku` is a container we move/rotate; the visual
    // inside it is either the procedural body or a loaded VRM (Deku himself).
    this.deku = new THREE.Group();
    this.dekuProc = buildDeku();
    this.deku.add(this.dekuProc);
    this.dekuModel = null;
    this.deku.visible = false;
    scene.add(this.deku);
    this.dekuPos = new THREE.Vector3(0.3, 0, 0.4);   // open floor, clear of furniture blockers
    this.dekuYaw = Math.PI;

    this._bindInput(renderer.domElement);
    this.setMode("orbit");
  }

  _bindInput(dom) {
    const typing = () => {
      const el = document.activeElement;
      return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    };
    addEventListener("keydown", (e) => {
      if (typing()) return;
      this.keys[e.code] = true;
      if (e.code === "KeyC") this.cycle();
      if (["KeyV"].includes(e.code)) this.setMode("first");
    });
    addEventListener("keyup", (e) => { this.keys[e.code] = false; });
    // click to lock pointer in first-person
    dom.addEventListener("click", () => { if (this.mode === "first" && !this.fp.isLocked) this.fp.lock(); });
    this.fp.addEventListener("unlock", () => { /* stays in first mode; click to re-lock */ });
  }

  cycle() {
    const order = ["orbit", "first", "third"];
    const next = order[(order.indexOf(this.mode) + 1) % order.length];
    this.setMode(next);
  }

  setMode(mode) {
    this.mode = mode;
    document.body.classList.toggle("fp-active", mode === "first");
    const cross = document.getElementById("crosshair");
    if (cross) cross.style.display = mode === "first" ? "block" : "none";

    if (mode === "orbit") {
      this.orbit.enabled = true;
      if (this.fp.isLocked) this.fp.unlock();
      this.deku.visible = false;
      this._tween(this.defaultPos, this.defaultTarget);
    } else if (mode === "first") {
      this.orbit.enabled = false;
      this.deku.visible = false;
      document.activeElement?.blur?.();   // so WASD isn't eaten by the chat box
      // stand where Deku is (or room center), at eye height
      this.camera.position.set(this.dekuPos.x, EYE, this.dekuPos.z + 0.01);
    } else if (mode === "third") {
      this.orbit.enabled = true;
      if (this.fp.isLocked) this.fp.unlock();
      this.deku.visible = true;
      this.deku.position.copy(this.dekuPos);
      this.deku.rotation.y = this.dekuYaw;
      this.orbit.target.copy(this.dekuPos).add(new THREE.Vector3(0, 1.2, 0));
      // place camera behind Deku
      const back = new THREE.Vector3(Math.sin(this.dekuYaw), 0, Math.cos(this.dekuYaw)).multiplyScalar(3);
      this.camera.position.copy(this.dekuPos).add(new THREE.Vector3(0, 1.8, 0)).add(back);
    }
    this._emitMode();
  }

  _emitMode() {
    const label = { orbit: "🎥 Overview", first: "🚶 First-person", third: "🧍 Third-person" }[this.mode];
    document.getElementById("camMode") && (document.getElementById("camMode").textContent = label);
    window.dispatchEvent(new CustomEvent("cmf:cammode", { detail: this.mode }));
  }

  _tween(pos, target) { this._t = { pos: pos.clone(), target: target.clone(), k: 0 }; }

  setCollider(fn) { this._collider = fn; }

  _resolve(pos, prev) {
    // clamp to room
    pos.x = Math.max(-this.bx, Math.min(this.bx, pos.x));
    pos.z = Math.max(-this.bz, Math.min(this.bz, pos.z));
    if (this._collider) {                                   // mesh collision (apartment)
      const r = this._collider(new THREE.Vector3(prev.x, 0, prev.z), new THREE.Vector3(pos.x, 0, pos.z));
      pos.x = r.x; pos.z = r.z;
    } else {                                                // fallback box blockers (dorm)
      for (const b of BLOCKERS) {
        if (Math.abs(pos.x - b.x) < b.rx && Math.abs(pos.z - b.z) < b.rz) { pos.x = prev.x; pos.z = prev.z; break; }
      }
    }
    return pos;
  }

  update(dt) {
    const speed = (this.keys["ShiftLeft"] || this.keys["ShiftRight"] ? RUN : WALK) * dt;

    // First-person: WASD moves whether or not the pointer is locked (locking is only
    // for mouse-look). Gating movement on isLocked was the "can't move" bug.
    if (this.mode === "first") {
      const prev = this.camera.position.clone();
      let f = 0, r = 0;
      if (this.keys["KeyW"] || this.keys["ArrowUp"]) f += 1;
      if (this.keys["KeyS"] || this.keys["ArrowDown"]) f -= 1;
      if (this.keys["KeyD"] || this.keys["ArrowRight"]) r += 1;
      if (this.keys["KeyA"] || this.keys["ArrowLeft"]) r -= 1;
      if (f || r) {
        this.fp.moveForward(f * speed);
        this.fp.moveRight(r * speed);
      }
      this.camera.position.y = EYE + Math.sin(performance.now() / 130) * (f || r ? 0.02 : 0.004); // head bob
      this._resolve(this.camera.position, prev);
      this.dekuPos.set(this.camera.position.x, 0, this.camera.position.z);
    }

    if (this.mode === "third") {
      const prev = this.dekuPos.clone();
      // move relative to camera facing
      const camDir = new THREE.Vector3(); this.camera.getWorldDirection(camDir); camDir.y = 0; camDir.normalize();
      const right = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0, 1, 0));
      let move = new THREE.Vector3();
      if (this.keys["KeyW"] || this.keys["ArrowUp"]) move.add(camDir);
      if (this.keys["KeyS"] || this.keys["ArrowDown"]) move.sub(camDir);
      if (this.keys["KeyD"] || this.keys["ArrowRight"]) move.add(right);
      if (this.keys["KeyA"] || this.keys["ArrowLeft"]) move.sub(right);
      const moving = move.lengthSq() > 0;
      if (moving) {
        move.normalize().multiplyScalar(speed);
        this.dekuPos.add(move);
        this._resolve(this.dekuPos, prev);
        this.dekuYaw = Math.atan2(move.x, move.z);
        // move orbit target + camera with Deku
        const delta = this.dekuPos.clone().sub(prev);
        this.camera.position.add(delta);
      }
      this.deku.position.copy(this.dekuPos);
      this.deku.rotation.y += (this.dekuYaw - this.deku.rotation.y) * 0.2;
      this.orbit.target.lerp(this.dekuPos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0.3);
      if (this.dekuModel) { this.dekuModel.update(dt); this.dekuModel.walk(moving, dt); }
      else animateDeku(this.dekuProc, moving, dt);
    }

    // gentle tween (mode transitions to overview)
    if (this._t) {
      this._t.k += dt / 1.0;
      const k = Math.min(1, this._t.k);
      this.camera.position.lerp(this._t.pos, 0.08);
      this.orbit.target.lerp(this._t.target, 0.08);
      if (k >= 1) this._t = null;
    }

    if (this.orbit.enabled) this.orbit.update();
  }

  // used by cinematic abilities — force overview + fly somewhere
  flyTo(pos, target) { if (this.mode !== "orbit") this.setMode("orbit"); this._tween(pos, target); }

  // swap the procedural Deku for a real model (VRM / GLB) — "Deku himself"
  async loadDekuModel(url) {
    if (!url) return false;
    try {
      const model = await loadCharacterModel(url, { isVRM: guessIsVRM(url), format: detectFormat(url) });
      if (this.dekuModel) { this.deku.remove(this.dekuModel.root); this.dekuModel.dispose?.(); }
      this.dekuProc.visible = false;
      this.deku.add(model.root);
      this.dekuModel = model;
      return true;
    } catch (e) { console.error("Deku model load failed", e); this.dekuProc.visible = true; return false; }
  }
}

// simple walk cycle for a VRM Deku via humanoid bones (VRMs ship without animation)
function walkVRM(vrm, moving, dt) {
  if (!vrm?.humanoid) return;
  const b = (n) => vrm.humanoid.getNormalizedBoneNode(n);
  const lul = b("leftUpperLeg"), rul = b("rightUpperLeg"), lla = b("leftLowerLeg"), rla = b("rightLowerLeg"), lua = b("leftUpperArm"), rua = b("rightUpperArm");
  if (moving) {
    vrm._wt = (vrm._wt || 0) + dt * 8;
    const s = Math.sin(vrm._wt) * 0.5;
    if (lul) lul.rotation.x = s; if (rul) rul.rotation.x = -s;
    if (lla) lla.rotation.x = Math.max(0, -s) * 0.7; if (rla) rla.rotation.x = Math.max(0, s) * 0.7;
    if (lua) lua.rotation.x = -s * 0.5; if (rua) rua.rotation.x = s * 0.5;
  } else {
    [lul, rul, lla, rla, lua, rua].forEach((bn) => { if (bn) bn.rotation.x *= 0.8; });
  }
}

// ---------------------------------------------------------------------------
//  Deku — a simple stylized roommate avatar (mostly seen from behind in TP)
// ---------------------------------------------------------------------------
function buildDeku() {
  const g = new THREE.Group();
  const toon = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
  const skin = toon("#f2c9a0"), hoodie = toon("#3b6ea8"), pants = toon("#2b2f3a"), hair = toon("#2a1d16");

  const mk = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

  // head + messy hair
  const head = mk(new THREE.SphereGeometry(0.15, 24, 24), skin, 0, 1.62, 0);
  const cap = mk(new THREE.SphereGeometry(0.158, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.6), hair, 0, 1.64, 0);
  for (let i = 0; i < 8; i++) { const s = mk(new THREE.ConeGeometry(0.03, 0.09, 6), hair, (Math.random() - 0.5) * 0.22, 1.72 + Math.random() * 0.03, (Math.random() - 0.5) * 0.22); s.rotation.set(Math.random(), 0, Math.random()); }
  // simple face (two eyes) facing +z
  const eyeMat = new THREE.MeshBasicMaterial({ color: "#1a1a2a" });
  mk(new THREE.SphereGeometry(0.02, 8, 8), eyeMat, -0.05, 1.63, 0.14);
  mk(new THREE.SphereGeometry(0.02, 8, 8), eyeMat, 0.05, 1.63, 0.14);

  // body
  mk(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 16), skin, 0, 1.48, 0);          // neck/shoulders
  mk(new THREE.CapsuleGeometry(0.16, 0.34, 6, 14), hoodie, 0, 1.22, 0);            // torso hoodie
  // hood
  mk(new THREE.SphereGeometry(0.13, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), hoodie, 0, 1.42, -0.06);

  // arms (grouped for animation)
  const armL = new THREE.Group(), armR = new THREE.Group();
  [["L", armL, -1], ["R", armR, 1]].forEach(([_, grp, s]) => {
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 4, 10), hoodie);
    upper.position.y = -0.18; upper.castShadow = true; grp.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), skin);
    hand.position.y = -0.4; grp.add(hand);
    grp.position.set(s * 0.2, 1.4, 0); g.add(grp);
  });
  g.userData.armL = armL; g.userData.armR = armR;

  // legs
  const legL = new THREE.Group(), legR = new THREE.Group();
  [["L", legL, -1], ["R", legR, 1]].forEach(([_, grp, s]) => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 10), pants);
    leg.position.y = -0.28; leg.castShadow = true; grp.add(leg);
    const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), toon("#e8e8e8"));
    shoe.scale.set(1, 0.6, 1.6); shoe.position.set(0, -0.55, 0.04); grp.add(shoe);
    grp.position.set(s * 0.09, 1.0, 0); g.add(grp);
  });
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.t = 0;
  return g;   // faces +Z; the container applies dekuYaw
}

function animateDeku(d, moving, dt) {
  const u = d.userData;
  if (moving) {
    u.t += dt * 9;
    const sw = Math.sin(u.t) * 0.6;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    u.armL.rotation.x = -sw * 0.7; u.armR.rotation.x = sw * 0.7;
    d.position.y = Math.abs(Math.sin(u.t)) * 0.03;
  } else {
    u.legL.rotation.x *= 0.8; u.legR.rotation.x *= 0.8;
    u.armL.rotation.x *= 0.8; u.armR.rotation.x *= 0.8;
    d.position.y = 0;
  }
}
