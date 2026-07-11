// ============================================================================
//  CATCH ME FIRST — mobile.js   ("Play it anywhere")
//  Touch controls + a performance tier for phones, plus PWA install & the
//  service-worker registration (offline shell). On a touch device:
//   • a virtual JOYSTICK (bottom-left) drives her/your movement
//   • right-side drag looks around in first-person (orbit handles the rest)
//   • the renderer is tuned down so it stays smooth on mobile GPUs
//   • an "＋ Install" prompt appears when the browser offers it
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

const isTouch = () => matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const isMobile = () => isTouch() && matchMedia("(max-width: 900px)").matches;

export const Mobile = {
  refs: null,

  init(refs) {
    this.refs = refs;                     // { camCtl, renderer, ui }
    this._perfTier();
    this._registerSW();
    this._install();
    if (isTouch()) { this._joystick(); this._look(); this._nudgeThirdPerson(); }
    return this;
  },

  // dial the renderer down on phones so it stays smooth
  _perfTier() {
    const r = this.refs.renderer;
    const weak = isMobile() || navigator.hardwareConcurrency <= 4 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
    if (weak) {
      r.setPixelRatio(Math.min(devicePixelRatio, 1.25));
      if (r.shadowMap) { r.shadowMap.enabled = isMobile() ? false : true; }
      State.world.perfTier = "low";
    }
  },

  _registerSW() {
    // only on the deployed site — never register on localhost (keeps dev un-stale)
    if ("serviceWorker" in navigator && !/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) {
      addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
    }
  },

  _install() {
    let deferred = null;
    addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault(); deferred = e;
      const b = document.createElement("button");
      b.id = "installBtn"; b.textContent = "＋ Install";
      b.onclick = async () => { b.remove(); deferred.prompt(); try { await deferred.userChoice; } catch {} deferred = null; };
      document.body.append(b);
      setTimeout(() => b.remove(), 20000);
    });
  },

  // ---- virtual movement joystick ----
  _joystick() {
    const base = document.createElement("div"); base.id = "joy";
    const nub = document.createElement("div"); nub.id = "joyNub";
    base.append(nub); document.body.append(base);
    const R = 52; let id = null, cx = 0, cy = 0;
    const setKeys = (dx, dy) => {
      const k = this.refs.camCtl.keys;
      k["KeyW"] = dy < -0.35; k["KeyS"] = dy > 0.35;
      k["KeyA"] = dx < -0.35; k["KeyD"] = dx > 0.35;
    };
    const clearKeys = () => { const k = this.refs.camCtl.keys; k.KeyW = k.KeyS = k.KeyA = k.KeyD = false; };
    base.addEventListener("touchstart", (e) => { const t = e.changedTouches[0]; id = t.identifier; const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; e.preventDefault(); }, { passive: false });
    base.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        let dx = t.clientX - cx, dy = t.clientY - cy; const d = Math.hypot(dx, dy) || 1; const cl = Math.min(1, d / R);
        nub.style.transform = `translate(${(dx / d) * R * cl}px,${(dy / d) * R * cl}px)`;
        setKeys((dx / d) * cl, (dy / d) * cl);
      }
      e.preventDefault();
    }, { passive: false });
    const end = () => { id = null; nub.style.transform = ""; clearKeys(); };
    base.addEventListener("touchend", end); base.addEventListener("touchcancel", end);
    // only show the joystick when walking around (first/third person)
    setInterval(() => { base.style.display = (this.refs.camCtl.mode === "first" || this.refs.camCtl.mode === "third") ? "block" : "none"; }, 400);
  },

  // ---- first-person touch look (right half of the screen) ----
  _look() {
    const yAxis = new THREE.Vector3(0, 1, 0);
    let id = null, lx = 0, ly = 0;
    addEventListener("touchstart", (e) => {
      if (this.refs.camCtl.mode !== "first") return;
      const t = e.changedTouches[0];
      if (t.clientX < innerWidth * 0.5) return;         // left half = joystick zone
      id = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: true });
    addEventListener("touchmove", (e) => {
      if (id === null || this.refs.camCtl.mode !== "first") return;
      for (const t of e.changedTouches) if (t.identifier === id) {
        const dx = t.clientX - lx, dy = t.clientY - ly; lx = t.clientX; ly = t.clientY;
        const cam = this.refs.camCtl.camera;
        cam.rotateOnWorldAxis(yAxis, -dx * 0.005);        // yaw
        cam.rotateX(-dy * 0.004);                          // pitch (clamped by feel)
      }
    }, { passive: true });
    addEventListener("touchend", (e) => { for (const t of e.changedTouches) if (t.identifier === id) id = null; });
  },

  _nudgeThirdPerson() {
    if (isMobile() && !State.settings._mobileNudged) {
      State.settings._mobileNudged = true; State.save();
      setTimeout(() => this.refs.ui?.toast?.("📱 tip: tap C for third-person — best on touch. Use the joystick to move ♡", 7000), 3000);
    }
  },
};
