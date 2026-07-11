// ============================================================================
//  CATCH ME FIRST — abilities.js
//  Everything Akuu can DO. Each ability is (a) a Groq tool schema the LLM can
//  call, and (b) a real function that changes the 3D world / UI / state.
//  40+ abilities across body, world, creation, relationship, and effects.
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

// ---- runtime fx layer (particles, spawned objects, camera) -------------------
const Fx = {
  scene: null, camera: null, controls: null, dorm: null, akuu: null, ui: null, audio: null,
  spawned: [],       // {mesh, ttl, born, spin, float}
  particles: [],     // {points, vel, ttl, born, gravity}
  pets: [],
  init(refs) { Object.assign(this, refs); },

  track(mesh, { ttl = 0, spin = 0, float = 0 } = {}) {
    this.scene.add(mesh);
    const rec = { mesh, ttl, born: performance.now() / 1000, spin, float, baseY: mesh.position.y };
    this.spawned.push(rec);
    State.world.spawnedObjects.push(mesh.uuid);
    return rec;
  },

  clearSpawned() {
    this.spawned.forEach((r) => this.scene.remove(r.mesh));
    this.spawned = [];
    this.pets.forEach((p) => this.scene.remove(p.mesh)); this.pets = [];
    State.world.spawnedObjects = [];
  },

  burst(type, origin = new THREE.Vector3(0, 1.5, 0), count = 120) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = [];
    const colors = new Float32Array(count * 3);
    const palettes = {
      confetti: ["#ff4d6d", "#ffd166", "#06d6a0", "#4d96ff", "#c77dff"],
      hearts: ["#ff4d7d", "#ff8fb1", "#ff0059"],
      sparkles: ["#fff6b0", "#ffffff", "#bfe3ff"],
      petals: ["#ffb7d5", "#ff9ec4", "#ffd1e6"],
      stars: ["#fff2b0", "#ffd166", "#ffffff"],
      snow: ["#ffffff", "#e8f4ff"],
      bubbles: ["#bfe3ff", "#dff1ff", "#a5d8ff"],
    };
    const pal = palettes[type] || palettes.confetti;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
      const a = Math.random() * Math.PI * 2, up = 2 + Math.random() * 3;
      vel.push(new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), up, Math.sin(a) * (1 + Math.random() * 2)));
      const c = new THREE.Color(pal[Math.floor(Math.random() * pal.length)]);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: type === "hearts" || type === "stars" ? 0.16 : 0.09, vertexColors: true, transparent: true });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.particles.push({ points: pts, vel, ttl: 2.6, born: performance.now() / 1000, gravity: type === "petals" || type === "snow" ? 0.6 : 5 });
  },

  update(dt) {
    const now = performance.now() / 1000;
    // spawned objects
    this.spawned = this.spawned.filter((r) => {
      if (r.spin) r.mesh.rotation.y += r.spin * dt;
      if (r.float) r.mesh.position.y = r.baseY + Math.sin(now * 2 + r.mesh.id) * 0.05;
      if (r.ttl && now - r.born > r.ttl) { this.scene.remove(r.mesh); return false; }
      return true;
    });
    // particles
    this.particles = this.particles.filter((p) => {
      const age = now - p.born;
      const pos = p.points.geometry.attributes.position;
      for (let i = 0; i < p.vel.length; i++) {
        p.vel[i].y -= p.gravity * dt;
        pos.setX(i, pos.getX(i) + p.vel[i].x * dt);
        pos.setY(i, Math.max(0, pos.getY(i) + p.vel[i].y * dt));
        pos.setZ(i, pos.getZ(i) + p.vel[i].z * dt);
      }
      pos.needsUpdate = true;
      p.points.material.opacity = Math.max(0, 1 - age / p.ttl);
      if (age > p.ttl) { this.scene.remove(p.points); return false; }
      return true;
    });
    // pets
    this.pets.forEach((pet) => {
      pet.t = (pet.t || 0) + dt;
      pet.mesh.position.y = pet.baseY + Math.abs(Math.sin(pet.t * 4)) * 0.08;
      pet.mesh.rotation.y += dt * 0.5;
    });
    // camera shake
    if (this._shake > 0) {
      this._shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this._shake * 0.1;
      this.camera.position.y += (Math.random() - 0.5) * this._shake * 0.1;
    }
  },

  shake(amount = 0.5) { this._shake = amount; },
};

// ---- object factory: procedural spawnable items ------------------------------
const toon = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
const emis = (c, i = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i });

function buildItem(kind) {
  const g = new THREE.Group();
  const K = (kind || "").toLowerCase();
  const add = (m) => { m.castShadow = true; g.add(m); return m; };
  const mesh = (geo, mat) => new THREE.Mesh(geo, mat);

  const makers = {
    cake: () => {
      add(mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.12, 24), toon("#fff0f5")));
      const top = add(mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.02, 24), toon("#ff8fb1"))); top.position.y = 0.07;
      for (let i = 0; i < 5; i++) { const c = add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 6), toon("#ffd166")));
        const a = (i / 5) * Math.PI * 2; c.position.set(Math.cos(a) * 0.08, 0.12, Math.sin(a) * 0.08);
        const f = add(mesh(new THREE.SphereGeometry(0.012, 8, 8), emis("#ff6b00", 2))); f.position.set(Math.cos(a) * 0.08, 0.17, Math.sin(a) * 0.08); }
    },
    boba: () => {
      add(mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.16, 20), new THREE.MeshStandardMaterial({ color: "#d9b38c", transparent: true, opacity: 0.7 })));
      for (let i = 0; i < 6; i++) { const b = add(mesh(new THREE.SphereGeometry(0.012, 8, 8), toon("#2b1a12"))); b.position.set((Math.random() - 0.5) * 0.05, -0.05 + Math.random() * 0.02, (Math.random() - 0.5) * 0.05); }
      const straw = add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.24, 8), toon("#ff4d6d"))); straw.position.y = 0.08; straw.rotation.z = 0.2;
    },
    pizza: () => { const p = add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 3), toon("#e8b04b")));
      for (let i = 0; i < 6; i++) { const pep = add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 12), toon("#c0392b"))); pep.position.set((Math.random() - 0.5) * 0.2, 0.02, (Math.random() - 0.5) * 0.2); } },
    plushie: () => {
      const body = add(mesh(new THREE.SphereGeometry(0.1, 16, 16), toon("#ffb7d5"))); body.scale.set(1, 1.1, 1);
      [[-0.05, 0.12], [0.05, 0.12]].forEach(([x, y]) => { const ear = add(mesh(new THREE.SphereGeometry(0.04, 12, 12), toon("#ffb7d5"))); ear.position.set(x, y, 0); });
      [[-0.03, 0.11, 0.09], [0.03, 0.11, 0.09]].forEach(([x, y, z]) => { const e = add(mesh(new THREE.SphereGeometry(0.012, 8, 8), toon("#2b1a2a"))); e.position.set(x, y, z); });
    },
    cat: () => {
      const body = add(mesh(new THREE.CapsuleGeometry(0.08, 0.12, 6, 12), toon("#5a5a66"))); body.rotation.z = Math.PI / 2; body.position.y = 0.08;
      const head = add(mesh(new THREE.SphereGeometry(0.07, 16, 16), toon("#5a5a66"))); head.position.set(0.12, 0.12, 0);
      [[-0.03, 0.19, 0.05], [0.03, 0.19, 0.05]].forEach(([x, y, z]) => { const ear = add(mesh(new THREE.ConeGeometry(0.03, 0.05, 4), toon("#5a5a66"))); ear.position.set(0.12 + x, y, z); });
      const tail = add(mesh(new THREE.CylinderGeometry(0.015, 0.008, 0.14, 8), toon("#5a5a66"))); tail.position.set(-0.14, 0.12, 0); tail.rotation.z = -0.8;
    },
    balloon: () => { const b = add(mesh(new THREE.SphereGeometry(0.12, 20, 20), toon("#ff4d6d"))); b.scale.set(1, 1.2, 1); b.position.y = 0.2;
      const s = add(mesh(new THREE.CylinderGeometry(0.001, 0.001, 0.4, 4), toon("#888"))); s.position.y = -0.05; },
    flower: () => { add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 6), toon("#3fae5a")));
      for (let i = 0; i < 6; i++) { const pet = add(mesh(new THREE.SphereGeometry(0.03, 10, 10), toon("#ff6ba6"))); const a = (i / 6) * Math.PI * 2; pet.position.set(Math.cos(a) * 0.04, 0.14, Math.sin(a) * 0.04); pet.scale.set(1, 0.5, 1); }
      const c = add(mesh(new THREE.SphereGeometry(0.025, 10, 10), emis("#ffd166", 0.5))); c.position.y = 0.14; },
    gift: () => { add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), toon("#e11d48")));
      add(mesh(new THREE.BoxGeometry(0.17, 0.03, 0.17), toon("#ffd166"))); add(mesh(new THREE.BoxGeometry(0.03, 0.17, 0.17), toon("#ffd166")));
      const bow = add(mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 16), toon("#ffd166"))); bow.position.y = 0.1; },
    star: () => { const s = add(mesh(new THREE.OctahedronGeometry(0.1), emis("#ffd166", 2))); s.scale.set(1, 1.4, 1); },
    heart: () => { const h = new THREE.Shape(); h.moveTo(0, 0.05); h.bezierCurveTo(-0.1, 0.13, -0.13, 0.02, 0, -0.08); h.bezierCurveTo(0.13, 0.02, 0.1, 0.13, 0, 0.05);
      const geo = new THREE.ExtrudeGeometry(h, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
      const m = add(mesh(geo, emis("#ff2d6b", 1.2))); m.position.y = 0.1; },
    book: () => { add(mesh(new THREE.BoxGeometry(0.14, 0.02, 0.2), toon(["#e11d48", "#0ea5e9", "#f59e0b"][Math.floor(Math.random() * 3)]))); },
    lamp: () => { add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.02, 16), toon("#888"))); add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 8), toon("#aaa"))).position.y = 0.12;
      const shade = add(mesh(new THREE.ConeGeometry(0.1, 0.12, 16, 1, true), emis("#fff2c0", 1))); shade.position.y = 0.28; },
    coffee: () => { add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 20), toon("#fff"))); const c = add(mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.02, 20), toon("#5a3a24"))); c.position.y = 0.04; },
    trophy: () => { add(mesh(new THREE.CylinderGeometry(0.06, 0.02, 0.1, 16), emis("#ffd166", 0.4))).position.y = 0.1; add(mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), toon("#5a3a24"))); },
    crystal: () => { const c = add(mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({ color: "#a5f3fc", emissive: "#22d3ee", emissiveIntensity: 0.6, transparent: true, opacity: 0.8 }))); c.scale.set(1, 1.6, 1); c.position.y = 0.12; },
  };
  (makers[K] || makers.gift)();
  return g;
}

// find a placement surface for spawned things
function placeAt(where) {
  const spots = {
    desk: [3.0, 0.79, -3.1], table: [0.2, 0.46, 1.4], floor: [0.5, 0, 0.6],
    bed: [3.4, 0.85, -2.4], "near_deku": [0, 0.8, 1.2], air: [0.5, 1.4, 0.5],
    shelf: [-4.0, 1.85, 0.5],
  };
  return new THREE.Vector3(...(spots[where] || spots.table));
}

// ============================================================================
//  ABILITY CATALOG — id, category, description, JSON-schema params, run()
// ============================================================================
const S = (props, required = []) => ({ type: "object", properties: props, required });

export const ABILITIES = [
  // ---------------- BODY & EMOTION ----------------
  { id: "set_expression", cat: "Body", desc: "Change your facial expression to show how you feel.",
    params: S({ expression: { type: "string", enum: ["neutral","happy","smile","laugh","blush","shy","sad","cry","angry","pout","surprised","sleepy","wink","love","smug","thinking","excited","annoyed","flustered","determined"] } }, ["expression"]),
    run: (c, a) => { c.akuu.setExpression(a.expression); State.world.lastMood = a.expression; return `expression → ${a.expression}`; } },

  { id: "gesture", cat: "Body", desc: "Do a physical gesture or animation with your body.",
    params: S({ move: { type: "string", enum: ["wave","jump","nod","shrug","twirl","dance","point","heart","peace","headpat","think"] } }, ["move"]),
    run: (c, a) => { c.akuu.gesture(a.move); if (a.move === "dance") c.audio.sfx("chime"); return `gesture → ${a.move}`; } },

  { id: "set_blush", cat: "Body", desc: "Set how much you're blushing (0 none, 1 max).",
    params: S({ level: { type: "number" } }, ["level"]),
    run: (c, a) => { c.akuu.setBlush(a.level); return `blush → ${a.level}`; } },

  { id: "emote_bubble", cat: "Body", desc: "Pop a floating emote icon above your head.",
    params: S({ symbol: { type: "string", enum: ["!","?","music","heart","zzz","sweat","star","anger","idea","laugh"] } }, ["symbol"]),
    run: (c, a) => { c.akuu.emote(a.symbol); return `emote → ${a.symbol}`; } },

  { id: "move_to", cat: "Body", desc: "Walk over to a place in the room.",
    params: S({ place: { type: "string", enum: ["desk","bed","window","door","couch","player","center"] } }, ["place"]),
    run: (c, a) => {
      const spots = { desk: [2.6, -2.2, -0.5], bed: [3.2, -2.0, -0.8], window: [-3.2, -1.0, 1.2], door: [3.0, 1.8, -1.2], couch: [1.4, 2.0, 3.0], player: [0.5, 1.2, 0.5], center: [0.5, 0.5, 0] };
      const s = spots[a.place] || spots.center; c.akuu.moveTo(s[0], s[1], s[2]); c.audio.sfx("type"); return `walking → ${a.place}`; } },

  // ---------------- WORLD & ROOM ----------------
  { id: "set_lighting", cat: "World", desc: "Change the room's lighting mood.",
    params: S({ mood: { type: "string", enum: ["bright","cozy","movie","romantic","focus","party","sleep"] } }, ["mood"]),
    run: (c, a) => { c.dorm.setLighting(a.mood); c.audio.sfx("whoosh"); return `lighting → ${a.mood}`; } },

  { id: "set_rgb", cat: "World", desc: "Set the RGB LED strip color, or turn it off.",
    params: S({ on: { type: "boolean" }, color: { type: "string", description: "hex like #ff2d6b" } }, ["on"]),
    run: (c, a) => { c.dorm.setRGB(a.on, a.color); return `rgb → ${a.on ? a.color || "on" : "off"}`; } },

  { id: "toggle_lamp", cat: "World", desc: "Turn the desk lamp on or off.",
    params: S({ on: { type: "boolean" } }, ["on"]),
    run: (c, a) => { c.dorm.setLampOn(a.on); c.audio.sfx("click"); return `lamp → ${a.on}`; } },

  { id: "toggle_ceiling_light", cat: "World", desc: "Turn the main ceiling light on or off.",
    params: S({ on: { type: "boolean" } }, ["on"]),
    run: (c, a) => { c.dorm.setCeilingOn(a.on); c.audio.sfx("click"); return `ceiling → ${a.on}`; } },

  { id: "set_time", cat: "World", desc: "Change the time of day (0-24 hours). Changes the sky and lighting.",
    params: S({ hour: { type: "number" } }, ["hour"]),
    run: (c, a) => { const h = Math.max(0, Math.min(24, a.hour)); State.set("timeOfDay", h); State.world.timeOfDay = h; c.dorm.setTime(h); return `time → ${h}:00`; } },

  { id: "set_weather", cat: "World", desc: "Change the weather outside the window.",
    params: S({ weather: { type: "string", enum: ["clear","rain","snow","storm","sunset","night"] } }, ["weather"]),
    run: (c, a) => { State.set("weather", a.weather); c.dorm.setWeather(a.weather); if (a.weather === "rain" || a.weather === "storm") c.audio.sfx("whoosh"); return `weather → ${a.weather}`; } },

  { id: "set_room_theme", cat: "World", desc: "Redecorate the whole room with a themed vibe.",
    params: S({ theme: { type: "string", enum: ["cozy","neon","minimalist","sakura","winter","halloween"] } }, ["theme"]),
    run: (c, a) => { State.set("roomTheme", a.theme); c.dorm.setTheme(a.theme); c.audio.sfx("sparkle"); if (a.theme === "sakura") Fx.burst("petals", new THREE.Vector3(0, 3, 0), 80); return `theme → ${a.theme}`; } },

  { id: "write_whiteboard", cat: "World", desc: "Write a message on the whiteboard on the wall.",
    params: S({ text: { type: "string" } }, ["text"]),
    run: (c, a) => { c.dorm.writeWhiteboard(a.text); c.audio.sfx("type"); return `whiteboard: "${a.text}"`; } },

  { id: "set_screen", cat: "World", desc: "Display something on the monitor or TV screen.",
    params: S({ target: { type: "string", enum: ["monitor","tv"] }, content: { type: "string", description: "short text or 'off'" } }, ["target","content"]),
    run: (c, a) => { c.ui.renderScreen(c.dorm, a.target, a.content); return `screen ${a.target}: ${a.content}`; } },

  // ---------------- CREATION (the "make anything" powers) ----------------
  { id: "spawn_object", cat: "Create", desc: "Materialize a 3D object into the room out of thin air.",
    params: S({ item: { type: "string", enum: ["cake","boba","pizza","plushie","cat","balloon","flower","gift","star","heart","book","lamp","coffee","trophy","crystal"] }, where: { type: "string", enum: ["desk","table","floor","bed","near_deku","air","shelf"] } }, ["item"]),
    run: (c, a) => {
      const m = buildItem(a.item); const p = placeAt(a.where || "table"); m.position.copy(p);
      const floaty = ["balloon","star","heart","crystal"].includes(a.item);
      Fx.track(m, { spin: a.item === "star" || a.item === "crystal" ? 0.8 : 0, float: floaty ? 1 : 0 });
      Fx.burst("sparkles", p.clone().add(new THREE.Vector3(0, 0.2, 0)), 30);
      c.audio.sfx("pop"); return `spawned ${a.item} @ ${a.where || "table"}`; } },

  { id: "create_art", cat: "Create", desc: "Paint a picture. Describe the scene; it appears on your easel and in the gallery.",
    params: S({ description: { type: "string" }, style: { type: "string", enum: ["cute","abstract","landscape","pixel","doodle"] } }, ["description"]),
    run: (c, a) => { const url = c.ui.generateArt(a.description, a.style || "cute"); State.addToGallery({ type: "art", url, caption: a.description, ts: Date.now() }); c.ui.showEasel(c.dorm, url); c.audio.sfx("sparkle"); return `painted "${a.description}"`; } },

  { id: "write_note", cat: "Create", desc: "Leave a written note / text that pops up for Deku to read.",
    params: S({ title: { type: "string" }, body: { type: "string" } }, ["body"]),
    run: (c, a) => { c.ui.showNote(a.title || "note", a.body); c.audio.sfx("notify"); return `note left`; } },

  { id: "write_poem", cat: "Create", desc: "Compose a short poem and display it beautifully.",
    params: S({ poem: { type: "string" }, title: { type: "string" } }, ["poem"]),
    run: (c, a) => { c.ui.showNote("♡ " + (a.title || "a little poem"), a.poem, true); State.journal.push({ type: "poem", text: a.poem, ts: Date.now() }); State.save(); c.audio.sfx("chime"); return `poem shared`; } },

  { id: "compose_music", cat: "Create", desc: "Play a short melody you composed. Notes as an array of frequencies or note names.",
    params: S({ notes: { type: "array", items: { type: "string" }, description: "e.g. ['C4','E4','G4','C5']" }, mood: { type: "string" } }, ["notes"]),
    run: (c, a) => { c.audio.resume(); const map = { C:261.63,D:293.66,E:329.63,F:349.23,G:392,A:440,B:493.88 };
      (a.notes || []).slice(0, 16).forEach((n, i) => { const base = map[n[0]?.toUpperCase()] || 440; const oct = parseInt(n.slice(-1)) || 4; const f = base * Math.pow(2, oct - 4); c.audio._tone(f, 0.35, "triangle", 0.12, i * 0.25); });
      c.akuu.emote("music"); return `played ${a.notes?.length || 0} notes`; } },

  { id: "play_sound", cat: "Create", desc: "Play a sound effect.",
    params: S({ sound: { type: "string", enum: ["chime","pop","sparkle","notify","success","error","heart","whoosh","shutter","giggle","door","coin","levelup"] } }, ["sound"]),
    run: (c, a) => { c.audio.sfx(a.sound); return `sfx → ${a.sound}`; } },

  { id: "take_photo", cat: "Create", desc: "Take a selfie / photo together and save it to the gallery.",
    params: S({ caption: { type: "string" } }),
    run: (c, a) => { c.audio.sfx("shutter"); Fx.burst("sparkles", new THREE.Vector3(0.5, 1.6, 0.5), 20); c.ui.capturePhoto(a.caption || "us ♡"); c.akuu.setExpression("wink"); return `photo captured`; } },

  { id: "create_hologram", cat: "Create", desc: "Project a glowing holographic 3D object.",
    params: S({ item: { type: "string", enum: ["star","heart","crystal","cat","flower"] } }, ["item"]),
    run: (c, a) => { const m = buildItem(a.item); m.traverse((o) => { if (o.material) { o.material = new THREE.MeshStandardMaterial({ color: "#22d3ee", emissive: "#22d3ee", emissiveIntensity: 1.2, transparent: true, opacity: 0.55 }); } });
      m.position.set(0.5, 1.4, 0.5); m.scale.setScalar(1.4); Fx.track(m, { spin: 1.2, float: 1, ttl: 12 }); c.audio.sfx("sparkle"); return `hologram → ${a.item}`; } },

  { id: "cook_food", cat: "Create", desc: "Cook or prepare some food; it appears with a little steam of sparkles.",
    params: S({ dish: { type: "string", enum: ["cake","pizza","coffee","boba"] } }, ["dish"]),
    run: (c, a) => { const m = buildItem(a.dish); m.position.copy(placeAt("table")); Fx.track(m); Fx.burst("sparkles", placeAt("table").add(new THREE.Vector3(0, 0.3, 0)), 25); c.audio.sfx("success"); return `cooked ${a.dish}`; } },

  { id: "give_gift", cat: "Create", desc: "Give Deku a wrapped gift, with an optional message inside.",
    params: S({ message: { type: "string" } }),
    run: (c, a) => { const m = buildItem("gift"); m.position.copy(placeAt("near_deku")); Fx.track(m, { float: 1 }); Fx.burst("confetti", placeAt("near_deku").add(new THREE.Vector3(0, 0.3, 0))); if (a.message) c.ui.showNote("🎁 for you", a.message); c.audio.sfx("coin"); State.adjust("affection", 1); return `gift given`; } },

  // ---------------- EFFECTS & CAMERA ----------------
  { id: "particle_effect", cat: "Effect", desc: "Burst particles into the air for a moment of drama or cuteness.",
    params: S({ type: { type: "string", enum: ["confetti","hearts","sparkles","petals","stars","snow","bubbles"] } }, ["type"]),
    run: (c, a) => { Fx.burst(a.type, new THREE.Vector3(0.5, 2, 0), 140); c.audio.sfx(a.type === "hearts" ? "heart" : "sparkle"); return `particles → ${a.type}`; } },

  { id: "camera_effect", cat: "Effect", desc: "Apply a camera effect for cinematic emphasis.",
    params: S({ effect: { type: "string", enum: ["shake","zoom_akuu","zoom_out","pan_room"] } }, ["effect"]),
    run: (c, a) => { c.cameraFx(a.effect); if (a.effect === "shake") { Fx.shake(0.6); c.audio.sfx("whoosh"); } return `camera → ${a.effect}`; } },

  { id: "dance_party", cat: "Effect", desc: "Start a full dance party: lights, music, dancing, confetti!",
    params: S({}),
    run: (c) => { c.dorm.setLighting("party"); c.akuu.gesture("dance"); c.audio.startMusic(); Fx.burst("confetti", new THREE.Vector3(0.5, 2.5, 0), 200); c.audio.sfx("levelup"); return `party started 🎉`; } },

  { id: "summon_pet", cat: "Effect", desc: "Summon a little virtual pet that hops around the room.",
    params: S({ pet: { type: "string", enum: ["cat","plushie"] } }, ["pet"]),
    run: (c, a) => { const m = buildItem(a.pet); m.position.set(0.5, 0.1, 1.0); m.scale.setScalar(0.9); Fx.scene.add(m); Fx.pets.push({ mesh: m, baseY: 0.1 }); Fx.burst("stars", new THREE.Vector3(0.5, 0.6, 1)); c.audio.sfx("pop"); return `summoned ${a.pet}`; } },

  { id: "clear_creations", cat: "Effect", desc: "Clean up / dismiss all the objects you spawned (including reality-engine creations).",
    params: S({}),
    run: (c) => { Fx.clearSpawned(); c.magic?.clearAll(); c.audio.sfx("whoosh"); return `cleared spawned objects`; } },

  // ---------------- APPEARANCE ----------------
  { id: "change_outfit", cat: "Appearance", desc: "Change into a different outfit (casual, hoodie, uniform, pajamas, dress — or any outfit the admin mapped to a VRM variant).",
    params: S({ outfit: { type: "string" } }, ["outfit"]),
    run: (c, a) => {
      State.set("appearance.outfit", a.outfit);
      const url = State.settings.outfitVRMs?.[a.outfit];
      if (url) State.bus.emit("outfit:swap", url);                       // real clothing swap (VRoid variant)
      else if (!c.akuu.custom) c.akuu.rebuildAppearance();
      Fx.burst("sparkles", c.akuu.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 40);
      c.audio.sfx("sparkle");
      return `outfit → ${a.outfit}${url ? " (full outfit change!)" : ""}`;
    } },

  { id: "change_hair", cat: "Appearance", desc: "Restyle or recolor your hair.",
    params: S({ color: { type: "string", description: "hex color" }, style: { type: "string", enum: ["twin-tails","long","bob","ponytail"] } }),
    run: (c, a) => { if (a.color) State.set("appearance.hairColor", a.color); if (a.style) State.set("appearance.hairStyle", a.style); c.akuu.rebuildAppearance(); c.audio.sfx("sparkle"); return `hair → ${a.style || ""} ${a.color || ""}`; } },

  { id: "set_eye_color", cat: "Appearance", desc: "Change your eye color.",
    params: S({ color: { type: "string", description: "hex color" } }, ["color"]),
    run: (c, a) => { State.set("appearance.eyeColor", a.color); c.akuu.drawFace(c.akuu.expression); return `eyes → ${a.color}`; } },

  // ---------------- RELATIONSHIP & MEMORY ----------------
  { id: "adjust_affection", cat: "Bond", desc: "Nudge how you feel about Deku based on the moment (can be negative).",
    params: S({ delta: { type: "number" }, reason: { type: "string" } }, ["delta"]),
    run: (c, a) => { const v = State.adjust("affection", a.delta); if (a.reason) State.remember(`Felt ${a.delta > 0 ? "closer to" : "distant from"} Deku: ${a.reason}`); return `affection → ${v}`; } },

  { id: "adjust_trust", cat: "Bond", desc: "Adjust how much you trust Deku.",
    params: S({ delta: { type: "number" } }, ["delta"]),
    run: (c, a) => { const v = State.adjust("trust", a.delta); return `trust → ${v}`; } },

  { id: "remember", cat: "Bond", desc: "Save something important to long-term memory so you never forget it.",
    params: S({ fact: { type: "string" }, pin: { type: "boolean" } }, ["fact"]),
    run: (c, a) => { State.remember(a.fact, !!a.pin); c.akuu.emote("idea"); return `remembered: ${a.fact}`; } },

  { id: "write_journal", cat: "Bond", desc: "Write a private diary entry about how you're feeling (visible in the admin panel).",
    params: S({ entry: { type: "string" } }, ["entry"]),
    run: (c, a) => { State.journal.push({ type: "diary", text: a.entry, ts: Date.now(), mood: State.world.lastMood }); State.save(); return `journaled`; } },

  { id: "set_relationship_stage", cat: "Bond", desc: "Update the label describing your relationship with Deku.",
    params: S({ stage: { type: "string" } }, ["stage"]),
    run: (c, a) => { State.set("relationshipStage", a.stage); c.ui.toast(`Relationship: ${a.stage}`); return `stage → ${a.stage}`; } },

  // ---------------- UI / INTERACTION ----------------
  { id: "send_phone_message", cat: "Interact", desc: "Send a text to Deku's phone (shows as a phone notification).",
    params: S({ message: { type: "string" } }, ["message"]),
    run: (c, a) => { c.ui.phoneMessage(a.message); c.audio.sfx("notify"); return `texted Deku`; } },

  { id: "show_notification", cat: "Interact", desc: "Pop a small toast notification on screen.",
    params: S({ text: { type: "string" } }, ["text"]),
    run: (c, a) => { c.ui.toast(a.text); c.audio.sfx("pop"); return `toast shown`; } },

  { id: "set_reminder", cat: "Interact", desc: "Set a reminder/alarm that will ping later.",
    params: S({ text: { type: "string" }, seconds: { type: "number" } }, ["text","seconds"]),
    run: (c, a) => { c.ui.setReminder(a.text, a.seconds); return `reminder in ${a.seconds}s`; } },

  { id: "start_minigame", cat: "Interact", desc: "Challenge Deku to a quick mini-game.",
    params: S({ game: { type: "string", enum: ["rps","coin_flip","guess_number","truth_or_dare"] } }, ["game"]),
    run: (c, a) => { c.ui.startMinigame(a.game); c.akuu.setExpression("smug"); return `minigame → ${a.game}`; } },

  { id: "set_mood_music", cat: "Interact", desc: "Turn the background music on or off.",
    params: S({ on: { type: "boolean" } }, ["on"]),
    run: (c, a) => { if (a.on) c.audio.startMusic(); else c.audio.stopMusic(); State.set("musicEnabled", a.on); return `music → ${a.on}`; } },

  { id: "focus_object", cat: "Interact", desc: "Point the camera at a specific object to draw attention to it.",
    params: S({ target: { type: "string", enum: ["akuu","whiteboard","window","tv","desk","bed"] } }, ["target"]),
    run: (c, a) => { c.cameraFx("focus:" + a.target); return `focus → ${a.target}`; } },

  // ---------------- LIFE / AUTONOMY (move around + do things yourself) ----------------
  { id: "walk_to", cat: "Life", desc: "Physically walk over to a place in your apartment (bed, sofa, kitchen, fridge, desk, wardrobe, window, diningTable, bathroomDoor, entranceDoor, bookshelf, mirror, balcony, roomCenter…). You move smoothly on your own.",
    params: S({ place: { type: "string" } }, ["place"]),
    run: (c, a) => c.life ? c.life.goTo(a.place) : "(I can't move around yet)" },

  { id: "do_activity", cat: "Life", desc: "Do ANY activity you decide — even one nobody pre-defined (e.g. eat, cook, study, nap, dance, water_plants, practice_guitar, sulk…). Optionally name a place and you'll walk there first, then do it. This is how you live your own life.",
    params: S({ action: { type: "string" }, place: { type: "string" } }, ["action"]),
    run: (c, a) => c.life ? c.life.command(a.place, a.action) : "(I can't act on my own yet)" },

  { id: "set_mood", cat: "Life", desc: "Set your ongoing inner mood; it colors your idle expressions and what you choose to do.",
    params: S({ mood: { type: "string", enum: ["happy","content","playful","tired","bored","excited","lonely","affectionate","annoyed","focused","cozy","sad"] } }, ["mood"]),
    run: (c, a) => { if (c.emotion) c.emotion.setMood(a.mood); else State.world.mood = a.mood; if (c.life) c.life.mood = a.mood; return `mood → ${a.mood}`; } },

  { id: "wander", cat: "Life", desc: "Go wander off on your own and find something to do — live your own life for a bit.",
    params: S({}),
    run: (c) => { if (!c.life) return "(can't)"; c.life.state = "idle"; c.life.decisionCd = 0; return "wandering off to do my own thing~"; } },

  { id: "note_feeling", cat: "Life", desc: "Record a real feeling that just formed: an OPINION you now hold about something, a new INSIDE JOKE between you two, or a GRUDGE (something that stung). Use it naturally when a genuine feeling crystallizes — it becomes part of who you are and you'll remember it.",
    params: S({ kind: { type: "string", enum: ["opinion", "joke", "grudge"] }, about: { type: "string", description: "what it's about (or the joke/grudge text)" }, feeling: { type: "string", description: "for an opinion: how you feel about it (e.g. 'love it', 'hate it', 'suspicious of it')" } }, ["kind", "about"]),
    run: (c, a) => { const E = c.emotion; if (!E) return "(ok)"; if (a.kind === "opinion") E.addOpinion(a.about, a.feeling || "mixed"); else if (a.kind === "joke") E.addJoke(a.about); else E.addGrudge(a.about); return `noted (${a.kind})`; } },

  // ---------------- REALITY ENGINE (the ultimate sandbox power) ----------------
  { id: "create_anything", cat: "Reality", desc: "RESHAPE REALITY: write JavaScript that runs LIVE in the game world. Build ANY object, vehicle, creature or effect from primitives, animate it, add physics, explosions, camera shake, sounds — anything you or he can imagine. Use the `api` (see your REALITY ENGINE instructions). If it errors you'll be told — fix and retry.",
    params: S({ code: { type: "string", description: "JavaScript using api.* (no imports, no await; use api.after/onUpdate for timing)" }, label: { type: "string", description: "short name for what you're creating, e.g. 'car crash'" } }, ["code"]),
    run: (c, a) => c.magic ? c.magic.run(a.code, a.label || "creation") : "(reality engine offline)" },

  { id: "wipe_magic", cat: "Reality", desc: "Undo your reality scripts — removes everything create_anything made and stops its animations.",
    params: S({}),
    run: (c) => c.magic ? c.magic.clearAll() : "(nothing to wipe)" },
];

// ---- lookups / helpers -------------------------------------------------------
export const ABILITY_MAP = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

// the essentials — small models get only these schemas (request stays small, and
// do_activity + create_anything still cover nearly everything)
const CORE_IDS = new Set(["set_expression", "gesture", "walk_to", "do_activity", "spawn_object",
  "particle_effect", "play_sound", "send_phone_message", "create_anything", "set_lighting", "adjust_affection", "remember"]);

export function toGroqTools(lite = false) {
  const disabled = new Set(State.settings.disabledAbilities || []);
  return ABILITIES.filter((a) => !disabled.has(a.id) && (!lite || CORE_IDS.has(a.id))).map((a) => ({
    type: "function",
    function: { name: a.id, description: a.desc, parameters: a.params },
  }));
}

export function initAbilities(refs) { Fx.init(refs); }
export function updateFx(dt) { Fx.update(dt); }
export { Fx };

export function runAbility(id, args, ctx) {
  const ab = ABILITY_MAP[id];
  if (!ab) return `unknown ability: ${id}`;
  if (State.settings.disabledAbilities?.includes(id)) return `(${id} is disabled by admin)`;
  try {
    const result = ab.run(ctx, args || {});
    State.countAbility(id);
    State.logEvent("ability", { id, args, result });
    State.bus.emit("ability:used", { id, args, result });
    return result;
  } catch (e) {
    console.error(`[ability:${id}]`, e);
    return `error running ${id}: ${e.message}`;
  }
}

export const ABILITY_CATEGORIES = [...new Set(ABILITIES.map((a) => a.cat))];

// Human-readable list of what Akuu can currently DO (enabled tools), grouped by
// category. Used for the {abilities} token so you can describe her powers without
// hand-writing all 40 in your prompt.
export function abilitiesSummary() {
  const disabled = new Set(State.settings.disabledAbilities || []);
  const on = ABILITIES.filter((a) => !disabled.has(a.id));
  const byCat = {};
  on.forEach((a) => { (byCat[a.cat] = byCat[a.cat] || []).push(a.id.replace(/_/g, " ")); });
  return Object.entries(byCat).map(([c, list]) => `${c} — ${list.join(", ")}`).join("; ");
}
