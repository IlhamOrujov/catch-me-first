// ============================================================================
//  CATCH ME FIRST — collision.js
//  Mesh collision against the apartment so Alice (and you) can't walk through
//  walls / furniture. Door openings are just gaps (no mesh) so they stay
//  walkable, and any mesh literally named "door" is excluded so closed doors
//  don't block either — "only the doors" are passable.
//  Uses three-mesh-bvh for fast raycasts; falls back to naive raycasting.
// ============================================================================

import * as THREE from "three";

let _bvh = undefined;
async function ensureBVH() {
  if (_bvh !== undefined) return _bvh;
  try {
    const m = await import("https://unpkg.com/three-mesh-bvh@0.7.8/build/index.module.js");
    THREE.BufferGeometry.prototype.computeBoundsTree = m.computeBoundsTree;
    THREE.BufferGeometry.prototype.disposeBoundsTree = m.disposeBoundsTree;
    THREE.Mesh.prototype.raycast = m.acceleratedRaycast;
    _bvh = m;
  } catch (e) { console.warn("three-mesh-bvh unavailable — naive collision raycasts", e); _bvh = false; }
  return _bvh;
}

export async function buildCollider(root) {
  const bvh = await ensureBVH();
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const tag = ((o.name || "") + " " + (o.material?.name || "")).toLowerCase();
    if (tag.includes("door")) return;                 // let her walk through doors
    meshes.push(o);
    if (bvh) { try { o.geometry.computeBoundsTree({ maxLeafTris: 8 }); } catch {} }
  });
  return new Collider(meshes);
}

class Collider {
  constructor(meshes) {
    this.meshes = meshes;
    this.ray = new THREE.Raycaster();
    this.ray.firstHitOnly = true;                     // BVH speed-up: we only need "is there a wall?"
    this._from = new THREE.Vector3(); this._dir = new THREE.Vector3();
  }

  // is moving from → to blocked by a wall/object within `radius`?
  blocked(from, to, radius) {
    this._dir.set(to.x - from.x, 0, to.z - from.z);
    const dist = this._dir.length();
    if (dist < 1e-4) return false;
    this._dir.multiplyScalar(1 / dist);
    this.ray.far = dist + radius;
    for (const h of [0.5, 1.2]) {                     // above floor thresholds/rugs; hip + chest
      this.ray.set(this._from.set(from.x, h, from.z), this._dir);
      if (this.ray.intersectObjects(this.meshes, false).length) return true;
    }
    return false;
  }

  // resolve a desired move: full → axis slide → inch forward → stay
  resolve(from, to, radius = 0.18) {
    if (!this.blocked(from, to, radius)) return to.clone();
    const sx = new THREE.Vector3(to.x, from.y, from.z);
    if (!this.blocked(from, sx, radius)) return sx;
    const sz = new THREE.Vector3(from.x, from.y, to.z);
    if (!this.blocked(from, sz, radius)) return sz;
    for (const f of [0.5, 0.25]) {                    // inch through tight gaps/corners
      const mid = from.clone().lerp(to, f);
      if (!this.blocked(from, mid, radius)) return mid;
    }
    return from.clone();                               // fully blocked
  }
}
