// ============================================================================
//  CATCH ME FIRST — pet.js   ("Mochi")
//  A little cat named Mochi lives here too — built from primitives (no download),
//  with simple wander/idle/follow AI. She pads around the apartment on the real
//  nav-floor, naps, trots over to Alice or to you, sways her tail, and purrs when
//  you pet her. Ties into the "Deku's cat is named Mochi" memory. ♡
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

function buildCat(color = "#d9a066") {
  const g = new THREE.Group();
  const M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.17, 4, 8), M(color)); body.rotation.z = Math.PI / 2; body.position.y = 0.12; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), M(color)); head.position.set(0.17, 0.16, 0); g.add(head); g._head = head;
  for (const z of [-0.045, 0.045]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.055, 4), M(color)); ear.position.set(0.18, 0.225, z); g.add(ear); }
  for (const z of [-0.035, 0.035]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 6), M("#2b2b2b")); eye.position.set(0.235, 0.17, z); g.add(eye); }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 6), M("#e88")); nose.position.set(0.245, 0.15, 0); g.add(nose);
  for (const [x, z] of [[0.08, 0.05], [0.08, -0.05], [-0.07, 0.05], [-0.07, -0.05]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 6), M(color)); leg.position.set(x, 0.06, z); g.add(leg); }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.009, 0.22, 6), M(color)); tail.position.set(-0.17, 0.17, 0); tail.rotation.z = -0.9; g.add(tail); g._tail = tail;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.scale.setScalar(1.15);
  return g;
}

export const Pet = {
  refs: null, cat: null, state: "idle", target: null, t: 0, _decideT: 2, _pokeT: 0,

  init(refs) {
    this.refs = refs;                       // { scene, navgrid, audio }
    this.cat = buildCat(State.settings.petColor || "#d9a066");
    this.cat.name = "Mochi";
    this.cat.position.set(1.4, 0, 3.2);
    this.refs.scene.add(this.cat);
    return this;
  },

  update(dt) {
    if (!this.cat) return;
    this.t += dt; this._decideT -= dt;
    if (this.cat._tail) this.cat._tail.rotation.z = -0.9 + Math.sin(this.t * 3) * 0.25;       // tail sway
    if (this.cat._head) this.cat._head.rotation.z = Math.sin(this.t * 0.7) * 0.06;            // idle head bob
    if (this._decideT <= 0) this._decide();

    if (this.state === "walk" && this.target) {
      const dx = this.target.x - this.cat.position.x, dz = this.target.z - this.cat.position.z, d = Math.hypot(dx, dz);
      if (d < 0.12) { this.state = "idle"; this._decideT = 1.5 + Math.random() * 4; this.cat.position.y = 0; }
      else {
        const sp = 0.75 * dt / d;
        this.cat.position.x += dx * sp; this.cat.position.z += dz * sp;
        this.cat.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
        this.cat.position.y = Math.abs(Math.sin(this.t * 11)) * 0.018;                        // trot bob
      }
    } else this.cat.position.y = 0;
  },

  _decide() {
    this._decideT = 2 + Math.random() * 4;
    const r = Math.random();
    if (r < 0.5) {
      let x = -3 + Math.random() * 6, z = -4.5 + Math.random() * 9;
      const ng = this.refs.navgrid;
      if (ng?.nearestCell) { const c = ng.nearestCell(x, z); if (c) { const p = ng.cellCenter(c[0], c[1]); x = p.x; z = p.z; } }
      this.target = { x, z }; this.state = "walk";
    } else if (r < 0.72 && State.world.alicePos) {
      this.target = { x: State.world.alicePos.x + 0.4, z: State.world.alicePos.z + 0.4 }; this.state = "walk";
    } else if (r < 0.86 && State.world.playerPos && !State.world.away) {
      this.target = { x: State.world.playerPos.x + 0.3, z: State.world.playerPos.z + 0.3 }; this.state = "walk";
    } else { this.state = "idle"; }   // sit / nap
  },

  pet() {
    if (Date.now() - this._pokeT < 3000) return;
    this._pokeT = Date.now();
    this.refs.audio?.sfx?.("chime");
    // little happy hop
    const y0 = this.cat.position.y;
    let h = 0; const hop = () => { h += 0.1; this.cat.position.y = y0 + Math.sin(h * Math.PI) * 0.12; if (h < 1) requestAnimationFrame(hop); else this.cat.position.y = y0; };
    hop();
    if (Math.random() < 0.6) State.bus.emit("akuu:say", { text: ["aw, Mochi likes you~ ♡", "*giggles* she never sits still", "careful, she'll want treats now", "Mochi! don't bother him— …okay fine, she's cute"][Math.floor(Math.random() * 4)], tools: [], idle: true });
  },
};
