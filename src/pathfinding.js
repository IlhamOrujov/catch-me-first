// ============================================================================
//  CATCH ME FIRST — pathfinding.js
//  Real A* navigation on a grid baked from the apartment's collision meshes.
//  Bakes once after the collider exists: cells are connected if a character-
//  width ray between their centers hits nothing. Paths are then smoothed with
//  line-of-sight shortcuts so she walks naturally, not in stair-steps.
// ============================================================================

import * as THREE from "three";

const CELL = 0.3;          // metres per grid cell
const CHAR_R = 0.16;       // character radius used for edge tests

export class NavGrid {
  constructor(collider, bounds) {
    this.col = collider;
    this.minX = bounds.minX; this.minZ = bounds.minZ;
    this.w = Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / CELL));
    this.h = Math.max(2, Math.ceil((bounds.maxZ - bounds.minZ) / CELL));
    this.open = new Uint8Array(this.w * this.h);      // 1 = has floor (inside apartment)
    this.edges = new Map();                            // idx -> array of neighbour idx
    this._down = new THREE.Raycaster();
    this._downDir = new THREE.Vector3(0, -1, 0);
  }

  idx(cx, cz) { return cz * this.w + cx; }
  cellCenter(cx, cz) { return new THREE.Vector3(this.minX + (cx + 0.5) * CELL, 0, this.minZ + (cz + 0.5) * CELL); }
  cellOf(x, z) {
    const cx = Math.floor((x - this.minX) / CELL), cz = Math.floor((z - this.minZ) / CELL);
    return (cx >= 0 && cz >= 0 && cx < this.w && cz < this.h) ? [cx, cz] : null;
  }

  bake() {
    const t0 = performance.now();
    // pass 1: which cells are over a floor (inside the apartment at walkable height)
    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const c = this.cellCenter(cx, cz);
      this._down.set(new THREE.Vector3(c.x, 2.3, c.z), this._downDir);
      this._down.far = 3.2;
      const hits = this._down.intersectObjects(this.col.meshes, false);
      // floor near y=0 (not a table top / counter): first hit below 0.45
      this.open[this.idx(cx, cz)] = hits.length && hits[0].point.y < 0.45 ? 1 : 0;
    }
    // pass 2: connect neighbours when the direct line is clear at body width
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let cz = 0; cz < this.h; cz++) for (let cx = 0; cx < this.w; cx++) {
      const a = this.idx(cx, cz);
      if (!this.open[a]) continue;
      const ca = this.cellCenter(cx, cz);
      for (const [dx, dz] of dirs) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
        const b = this.idx(nx, nz);
        if (!this.open[b]) continue;
        if (dx && dz) {   // diagonal only if both orthogonals are open (no corner-cutting)
          if (!this.open[this.idx(cx + dx, cz)] || !this.open[this.idx(cx, cz + dz)]) continue;
        }
        if (!this.col.blocked(ca, this.cellCenter(nx, nz), CHAR_R)) {
          if (!this.edges.has(a)) this.edges.set(a, []);
          if (!this.edges.has(b)) this.edges.set(b, []);
          this.edges.get(a).push(b);
          this.edges.get(b).push(a);
        }
      }
    }
    this.bakedMs = Math.round(performance.now() - t0);
    return this;
  }

  // nearest connected cell to a world point (spiral out a few rings)
  nearestCell(x, z) {
    const c = this.cellOf(x, z);
    if (!c) return null;
    for (let r = 0; r <= 5; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = c[0] + dx, cz = c[1] + dz;
        if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) continue;
        const i = this.idx(cx, cz);
        if (this.open[i] && this.edges.has(i)) return [cx, cz];
      }
    }
    return null;
  }

  // A* between world points → array of THREE.Vector3 waypoints (smoothed), or null
  findPath(from, to) {
    const s = this.nearestCell(from.x, from.z), g = this.nearestCell(to.x, to.z);
    if (!s || !g) return null;
    const start = this.idx(s[0], s[1]), goal = this.idx(g[0], g[1]);
    if (start === goal) return [new THREE.Vector3(to.x, 0, to.z)];

    const hx = (i) => i % this.w, hz = (i) => Math.floor(i / this.w);
    const H = (i) => Math.hypot(hx(i) - g[0], hz(i) - g[1]);
    const openSet = new Set([start]);
    const came = new Map(), gScore = new Map([[start, 0]]), fScore = new Map([[start, H(start)]]);

    let guard = this.w * this.h * 4;
    while (openSet.size && guard-- > 0) {
      let cur = null, best = Infinity;
      for (const n of openSet) { const f = fScore.get(n) ?? Infinity; if (f < best) { best = f; cur = n; } }
      if (cur === goal) return this._reconstruct(came, cur, to);
      openSet.delete(cur);
      for (const nb of (this.edges.get(cur) || [])) {
        const cost = (hx(nb) !== hx(cur) && hz(nb) !== hz(cur)) ? 1.414 : 1;
        const t = (gScore.get(cur) ?? Infinity) + cost;
        if (t < (gScore.get(nb) ?? Infinity)) {
          came.set(nb, cur); gScore.set(nb, t); fScore.set(nb, t + H(nb));
          openSet.add(nb);
        }
      }
    }
    return null;
  }

  _reconstruct(came, cur, to) {
    const cells = [cur];
    while (came.has(cur)) { cur = came.get(cur); cells.push(cur); }
    cells.reverse();
    let pts = cells.map((i) => this.cellCenter(i % this.w, Math.floor(i / this.w)));
    pts.push(new THREE.Vector3(to.x, 0, to.z));
    // smooth: keep the farthest waypoint visible from the current one
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && this.col.blocked(pts[i], pts[j], CHAR_R)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
}
