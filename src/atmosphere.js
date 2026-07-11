// ============================================================================
//  CATCH ME FIRST — atmosphere.js   ("The air in the room")
//  Living ambience: the sky/background colour drifts through the day (deep night
//  → dawn purple → soft day → warm dusk), fog tracks it, and fine dust motes
//  float in the light so the space feels breathed-in, not sterile. Cheap; can
//  be turned off on weak hardware.
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

// hour → background colour keyframes
const KEYS = [
  [0, "#07071a"], [6, "#231a30"], [8.5, "#181d31"], [13, "#1b2134"],
  [17.5, "#3a1d2c"], [20, "#160f20"], [24, "#07071a"],
];
function skyColor(h) {
  h = ((h % 24) + 24) % 24;
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) if (h >= KEYS[i][0] && h <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  const t = (h - a[0]) / ((b[0] - a[0]) || 1);
  return new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), t);
}

export const Atmosphere = {
  refs: null, dust: null, _sp: null, enabled: true,

  init(refs) {
    this.refs = refs;                       // { scene }
    if (matchMedia("(max-width: 900px)").matches && matchMedia("(pointer: coarse)").matches) this.enabled = false;
    if (this.enabled) this._buildDust();
    return this;
  },

  _sprite() {
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const x = c.getContext("2d"); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "#fff"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  },
  _buildDust() {
    const N = 200, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3);
    this._sp = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = -4 + Math.random() * 8; pos[i * 3 + 1] = Math.random() * 2.7; pos[i * 3 + 2] = -6 + Math.random() * 12; this._sp[i] = 0.6 + Math.random(); }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.028, map: this._sprite(), transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff2cf });
    this.dust = new THREE.Points(geo, mat); this.dust.frustumCulled = false; this.dust.renderOrder = 2;
    this.refs.scene.add(this.dust);
  },

  update(dt) {
    const scene = this.refs.scene;
    // drift the sky/fog toward the current hour's colour
    const col = skyColor(State.world.timeOfDay);
    if (!scene.background || !scene.background.isColor) scene.background = new THREE.Color("#07071a");
    scene.background.lerp(col, Math.min(1, dt * 0.6));
    if (scene.fog) scene.fog.color.copy(scene.background);
    // float the dust
    if (this.enabled && this.dust) {
      const p = this.dust.geometry.attributes.position, t = performance.now() * 0.0003;
      for (let i = 0; i < this._sp.length; i++) {
        p.array[i * 3 + 1] += this._sp[i] * dt * 0.05;
        p.array[i * 3] += Math.sin(t + i) * dt * 0.03;
        if (p.array[i * 3 + 1] > 2.75) { p.array[i * 3 + 1] = 0; p.array[i * 3] = -4 + Math.random() * 8; }
      }
      p.needsUpdate = true;
    }
  },

  toggle(on) { this.enabled = on ?? !this.enabled; if (this.dust) this.dust.visible = this.enabled; },
};
