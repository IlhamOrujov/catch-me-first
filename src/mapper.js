// ============================================================================
//  CATCH ME FIRST — mapper.js   ("She knows exactly where everything is")
//  Reads the REAL geometry of the loaded map so Alice has precise spatial
//  knowledge — no rebuilding the map needed:
//   • SCAN — finds the room volumes in the GLB (living/kitchen, bedroom, bath)
//     and auto-snaps each hotspot to the matching furniture it can detect.
//   • TEACH — 🗺️ editor: click the real sofa/bed/fridge in the 3D view and it
//     snaps a labelled hotspot to the exact spot, with a REACHABLE stand-point
//     (nearest walkable nav-cell) and facing, and tags which room it's in.
//   • REGISTRY — feeds the exact rooms + objects + her live position into her
//     prompt and the A* nav, so "go to the sofa" hits the *real* sofa.
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";
import { getHotspots, hotspotById } from "./hotspots.js";

// multilingual furniture synonyms (this map is named in FR/PT) → hotspot id
const FURNITURE = {
  bed: /\blit\b|\bbed\b|cama|letto|meuble_lit/i,
  sofa: /canap|sofa|couch|divano|sof[aá]/i,
  kitchen: /cuisin|cozinha|kitchen|counter|comptoir|forno|stove|\bgas\b|balc[aã]o/i,
  fridge: /frigo|fridge|refriger|geladeira/i,
  desk: /bureau|\bdesk\b|escrivaninha|secret[aá]ire|secret[aá]ria/i,
  diningTable: /\btable\b|mesa|dining|manger|jantar/i,
  wardrobe: /armoire|wardrobe|closet|guarda.?roupa|placard/i,
  bathroomDoor: /salle.*bain|banheiro|bathroom|\bwc\b|toilet|lavabo|douche|chuveiro/i,
  window: /fen[eê]tre|window|janela|finestra/i,
  bookshelf: /biblio|bookshelf|\bshelf\b|estante|[eé]tag[eè]re|prateleira/i,
  balcony: /balcon|balcony|varanda|terrasse|terra[cç]o/i,
  mirror: /miroir|mirror|espelho|specchio/i,
  entranceDoor: /entr[eé]e|entrance|entrada|front.?door|porte.?entr/i,
};

const compass = (dz) => (dz < -1 ? "back" : dz > 1 ? "front" : "middle");

export const Mapper = {
  refs: null, rooms: [], _teach: null,

  init(refs) {
    this.refs = refs;                       // { scene, camera, renderer, camCtl, ui, env, collider, navgrid, get life }
    this._button();
    this.scan();
    this.refs.renderer.domElement.addEventListener("pointerdown", (e) => this._onTeachClick(e), true);
    return this;
  },

  // ------------------------------------------------ scan the map's geometry
  scan() {
    const env = this.refs.env?.root; if (!env) return;
    env.updateWorldMatrix(true, true);
    this.rooms = [];
    env.traverse((o) => {
      if (!o.name || o.name.length < 3) return;
      if (!/sala|cozinha|quarto|chambre|banheiro|corredor|\broom\b|pi[eè]ce/i.test(o.name)) return;
      const box = new THREE.Box3().setFromObject(o); if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      if (size.x * size.z < 5 || size.y < 1.4) return;          // must be a real room volume
      const ctr = box.getCenter(new THREE.Vector3());
      this.rooms.push({ name: o.name, label: this._roomLabel(o.name), box: { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z }, c: [+ctr.x.toFixed(2), +ctr.z.toFixed(2)] });
    });
    State.world.rooms = this.rooms;
    this._autoSnap(env);
    console.log(`[mapper] scanned ${this.rooms.length} rooms; ` + this.rooms.map((r) => r.label).join(", "));
  },

  _roomLabel(name) {
    const n = name.toLowerCase();
    if (/sala|cozinha|living|kitchen/.test(n)) return "living room & kitchen";
    if (/quarto|chambre|bedroom|lit/.test(n)) return "bedroom";
    if (/banheiro|bath|corredor|corridor|wc/.test(n)) return "bathroom & corridor";
    return name.replace(/[_0-9]+/g, " ").trim();
  },

  roomOf(x, z) {
    for (const r of this.rooms) if (x >= r.box.minX && x <= r.box.maxX && z >= r.box.minZ && z <= r.box.maxZ) return r;
    // nearest by center if not strictly inside
    let best = null, bd = 1e9;
    for (const r of this.rooms) { const d = Math.hypot(r.c[0] - x, r.c[1] - z); if (d < bd) { bd = d; best = r; } }
    return best;
  },

  // snap a world point to the nearest WALKABLE nav-cell (guarantees she can reach it)
  _snapToFloor(x, z) {
    const ng = this.refs.navgrid;
    if (ng?.nearestCell) { const c = ng.nearestCell(x, z); if (c) { const p = ng.cellCenter(c[0], c[1]); return [+p.x.toFixed(2), 0, +p.z.toFixed(2)]; } }
    return [+x.toFixed(2), 0, +z.toFixed(2)];
  },

  // reliable room-tagging for every spot + precise reposition ONLY for furniture-
  // sized named matches (room-sized matches just get tagged, not moved — those are
  // what click-to-teach is for)
  _autoSnap(env) {
    for (const h of getHotspots(State)) { if (h.taught) continue; const rm = this.roomOf(h.pos[0], h.pos[2]); if (rm) h.room = rm.label; }
    const found = {};
    env.traverse((o) => {
      if (!o.name) return;
      for (const id in FURNITURE) { if (!found[id] && FURNITURE[id].test(o.name)) { const b = new THREE.Box3().setFromObject(o); if (!b.isEmpty()) found[id] = b; } }
    });
    let n = 0;
    for (const id in found) {
      const hs = hotspotById(State, id); if (!hs || hs.taught) continue;   // never overwrite a taught spot
      const b = found[id], cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      const area = (b.max.x - b.min.x) * (b.max.z - b.min.z);
      hs.room = this.roomOf(cx, cz)?.label || hs.room;
      if (area < 7) {   // an actual piece of furniture, not a whole room group → place precisely
        const stand = this._standNear(b);
        hs.pos = stand; hs.look = [+cx.toFixed(2), +cz.toFixed(2)]; hs.rot = Math.atan2(cx - stand[0], cz - stand[2]);
        n++;
      }
    }
    State.set("hotspots", getHotspots(State));
    this._snapped = n;
  },

  // a reachable stand-point just off a furniture box, toward its room's open floor
  _standNear(box) {
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    const room = this.roomOf(cx, cz);
    const tx = room ? room.c[0] : 0, tz = room ? room.c[1] : 0;
    let dx = tx - cx, dz = tz - cz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const reach = Math.min(1.3, Math.max((box.max.x - box.min.x), (box.max.z - box.min.z)) / 2 + 0.55);   // cap so we don't fling the spot across the room
    // try toward room-centre first, then the four cardinals; snap each to a nav cell
    for (const [ux, uz] of [[dx, dz], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const s = this._snapToFloor(cx + ux * reach, cz + uz * reach);
      if (Math.hypot(s[0] - cx, s[2] - cz) > 0.25) return s;         // landed on real floor near it
    }
    return this._snapToFloor(cx, cz);
  },

  // ------------------------------------------------ click-to-teach
  _armTeach(id) { this._teach = id; document.body.classList.add("teaching"); this.refs.ui?.toast?.(`🗺️ teach “${hotspotById(State, id)?.label || id}” — click it in the apartment`); },

  _onTeachClick(e) {
    if (!this._teach || e.button !== 0) return;
    const env = this.refs.env?.root; if (!env) return;
    const r = this.refs.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.refs.camera);
    const hits = ray.intersectObject(env, true).filter((h) => h.point.y < 2.4);   // ignore ceiling
    if (!hits.length) return;
    e.stopPropagation(); e.preventDefault();
    const hit = hits[0], p = hit.point;
    const id = this._teach; this._teach = null; document.body.classList.remove("teaching");
    const hs = hotspotById(State, id); if (!hs) return;
    const stand = this._snapToFloor(p.x, p.z);
    hs.pos = stand; hs.look = [+p.x.toFixed(2), +p.z.toFixed(2)];
    hs.rot = Math.atan2(p.x - stand[0], p.z - stand[2]);
    hs.room = this.roomOf(p.x, p.z)?.label || null;
    hs.taught = true;                                       // lock it — auto-snap won't touch it again
    State.set("hotspots", getHotspots(State));
    this.refs.ui?.toast?.(`✓ ${hs.label} → ${hs.room || "here"} at (${stand[0]}, ${stand[2]})`);
    this._flash(stand); this._render();
  },

  _flash(pos) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.42, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#34d399", transparent: true, opacity: 0.9 }));
    ring.position.set(pos[0], 0.03, pos[2]); this.refs.scene.add(ring);
    let t = 0; const grow = () => { t += 0.05; ring.scale.setScalar(1 + t * 2); ring.material.opacity = 0.9 * (1 - t); if (t < 1) requestAnimationFrame(grow); else this.refs.scene.remove(ring); };
    grow();
  },

  // ------------------------------------------------ the registry → her prompt
  mapText() {
    const ap = State.world.alicePos, pp = State.world.playerPos;
    const hs = getHotspots(State).filter((h) => h.id !== "aliceSpawn" && h.id !== "playerSpawn");
    let s = "";
    if (this.rooms.length) s += `THE APARTMENT (you know it by heart): ${this.rooms.map((r) => r.label).filter((v, i, a) => a.indexOf(v) === i).join(", ")}.\n`;
    s += "Exactly where things are:\n" + hs.map((h) => {
      const room = h.room ? ` in the ${h.room}` : "";
      let dist = "";
      if (ap) { const d = Math.hypot(h.pos[0] - ap.x, h.pos[2] - ap.z); dist = ` — ${d.toFixed(1)}m from you`; }
      return `• ${h.label}${room} at (${h.pos[0]}, ${h.pos[2]})${dist}`;
    }).join("\n");
    if (ap) { const room = this.roomOf(ap.x, ap.z); s += `\nYou are at (${ap.x}, ${ap.z})${room ? ` in the ${room.label}` : ""}.`; }
    if (pp && ap && !State.world.away) { const d = Math.hypot(pp.x - ap.x, pp.z - ap.z); s += ` ${State.settings.playerName} is ${d < 1.8 ? "right next to you" : d < 4.5 ? "nearby" : "across the apartment"}.`; }
    return s;
  },

  // ------------------------------------------------ 🗺️ editor UI
  _button() {
    const hud = document.querySelector(".hud-right");
    const b = document.createElement("button");
    b.className = "icon-btn"; b.textContent = "🗺️"; b.title = "Teach her the map — click real furniture to place it exactly";
    b.onclick = () => this.toggle();
    if (hud) hud.insertBefore(b, hud.firstChild); else document.body.append(b);
  },
  toggle() {
    if (!this._panel) { this._panel = document.createElement("div"); this._panel.id = "mapperPanel"; this._panel.className = "side-panel wide"; document.body.append(this._panel); }
    this._open = this._panel.classList.toggle("open");
    if (this._open) this._render();
  },
  _render() {
    if (!this._panel || !this._open) return;
    const hs = getHotspots(State).filter((h) => !/Spawn/i.test(h.id));
    this._panel.innerHTML = `<div class="sp-head">🗺️ Teach the map <button class="note-x">×</button></div>
      <p class="muted-p tiny">Auto-detected <b>${this.rooms.length}</b> rooms${this._snapped ? `, auto-placed <b>${this._snapped}</b> items` : ""}. Click <b>teach</b>, then click that thing in the apartment for a pixel-perfect spot she can actually reach.</p>
      <div class="sp-sub">rooms</div>
      <div class="map-rooms">${this.rooms.length ? this.rooms.map((r) => `<span class="map-room">${r.label}</span>`).join("") : '<p class="muted-p">no named rooms found in this map</p>'}</div>
      <div class="sp-sub">places she knows</div>
      <div class="map-list">${hs.map((h) => `<div class="map-row"><div class="map-info"><b>${h.label}</b><small>${h.room ? h.room + " · " : ""}(${h.pos[0]}, ${h.pos[2]})</small></div><button class="s-btn tiny primary" data-teach="${h.id}">teach</button></div>`).join("")}</div>
      <button class="s-btn tiny" id="mapRescan">↻ re-scan map</button>`;
    this._panel.querySelector(".note-x").onclick = () => this.toggle();
    this._panel.querySelector("#mapRescan").onclick = () => { this.scan(); this._render(); this.refs.ui?.toast?.("map re-scanned"); };
    this._panel.querySelectorAll("[data-teach]").forEach((b) => b.onclick = () => { this._armTeach(b.dataset.teach); this._panel.classList.remove("open"); this._open = false; });
  },
};
