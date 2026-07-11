// ============================================================================
//  CATCH ME FIRST — magic.js  ("THE REALITY ENGINE")
//  The ultimate sandbox power: the AI writes real JavaScript that executes in
//  the live game. She gets a rich, forgiving api — primitives, compound props,
//  physics, tweens, particles, explosions, camera, sound, time/weather, her own
//  body — plus raw THREE + scene access. Say "a car crashes into the house"
//  and she scripts a car, drives it in, blows it up, shakes the camera.
//  Everything is tracked so it can all be wiped with one call.
// ============================================================================

import * as THREE from "three";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const Magic = {
  refs: null,
  actors: [],        // every object scripts created (for wipe)
  updaters: new Map(), _uid: 0,
  timers: [],        // {t, fn, every?, left?}
  tweens: [],
  bodies: [],        // simple physics bodies {obj, vel, gravity, bounce, spin, ttl}
  scripts: [],       // history [{label, code, ok, error, ts}]

  init(refs) { this.refs = refs; return this; },

  // ------------------------------------------------------------------ run
  run(code, label = "script") {
    const api = this._api();
    try {
      const fn = new Function("api", "THREE", "scene", `"use strict";\n${code}`);
      fn(api, THREE, this.refs.scene);
      this.scripts.push({ label, code, ok: true, ts: Date.now() });
      if (this.scripts.length > 40) this.scripts.shift();
      delete this.refs.State.world.lastScriptError;
      this.refs.State.logEvent("magic", { label, ok: true });
      return `✨ reality altered: ${label} (running live)`;
    } catch (e) {
      const err = String(e.message || e).slice(0, 220);
      this.scripts.push({ label, code, ok: false, error: err, ts: Date.now() });
      this.refs.State.world.lastScriptError = `your last reality script "${label}" threw: ${err} — fix the code and try create_anything again`;
      return `script error: ${err}`;
    }
  },

  // free an object's GPU resources (three.js doesn't do this on remove())
  _disposeActor(a) {
    try {
      a.parent?.remove(a);
      a.traverse?.((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const mm of mats) { mm.map?.dispose?.(); mm.dispose?.(); }
      });
    } catch {}
  },

  clearAll() {
    this.actors.forEach((a) => this._disposeActor(a));
    this.actors = [];
    this.updaters.clear();
    this.timers = []; this.tweens = []; this.bodies = [];
    return "reality restored — all scripted creations removed";
  },

  // drop a single actor (used when physics/ttl removes it) so actors[] can't grow forever
  _forget(obj) { this._disposeActor(obj); this.actors = this.actors.filter((a) => a !== obj); },

  // ------------------------------------------------------------------ loop
  update(dt) {
    const t = performance.now() / 1000;
    // timers
    this.timers = this.timers.filter((tm) => {
      tm.t -= dt;
      if (tm.t > 0) return true;
      try { tm.fn(); } catch {}
      if (tm.every != null && (tm.left === undefined || --tm.left > 0)) { tm.t = tm.every; return true; }
      return false;
    });
    // tweens
    this.tweens = this.tweens.filter((tw) => {
      tw.el += dt;
      let k = clamp(tw.el / tw.dur, 0, 1);
      const e = tw.ease === "in" ? k * k : tw.ease === "out" ? 1 - (1 - k) * (1 - k)
        : tw.ease === "bounce" ? (k < 1 ? 1 - Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k) : 1) : k;
      for (const key in tw.to) {
        const [tgt, prop] = tw.map[key];
        tgt[prop] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      }
      if (k >= 1) { try { tw.onDone?.(); } catch {} return false; }
      return true;
    });
    // physics-lite (guarded — a bad LLM script must never freeze the whole game loop)
    this.bodies = this.bodies.filter((b) => {
      try {
        if (!b.obj || !b.obj.parent) return false;
        b.vel[1] -= (b.gravity ?? 9.8) * dt;
        b.obj.position.x += b.vel[0] * dt;
        b.obj.position.y += b.vel[1] * dt;
        b.obj.position.z += b.vel[2] * dt;
        if (b.spin) { b.obj.rotation.x += b.spin * dt; b.obj.rotation.z += b.spin * 0.7 * dt; }
        if (b.obj.position.y <= (b.floor ?? 0)) {          // floor bounce
          b.obj.position.y = b.floor ?? 0;
          if (Math.abs(b.vel[1]) > 0.5 && (b.bounce ?? 0.3) > 0) { b.vel[1] = -b.vel[1] * (b.bounce ?? 0.3); b.vel[0] *= 0.7; b.vel[2] *= 0.7; }
          else { b.vel = [0, 0, 0]; b.spin = 0; }
        }
        if (b.ttl != null && (b.ttl -= dt) <= 0) { this._forget(b.obj); return false; }
        return true;
      } catch { return false; }
    });
    // custom updaters (self-heal: drop after 5 errors)
    for (const [id, u] of this.updaters) {
      try { u.fn(dt, t); } catch { if (++u.errs > 5) this.updaters.delete(id); }
    }
  },

  // ------------------------------------------------------------------ api
  _api() {
    const M = this;
    const { scene, camera, dorm, akuu, audio, camCtl, State, cameraFx, fxBurst, life } = this.refs;
    const track = (o, parent) => { (parent || scene).add(o); M.actors.push(o); o.traverse?.((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };
    const mat = (opt = {}) => new THREE.MeshStandardMaterial({
      color: opt.color || "#cccccc", roughness: opt.rough ?? 0.55, metalness: opt.metal ?? 0.1,
      transparent: opt.opacity != null, opacity: opt.opacity ?? 1,
      emissive: opt.glow ? new THREE.Color(opt.color || "#ffffff") : 0x000000, emissiveIntensity: opt.glow ? (opt.glow === true ? 1 : opt.glow) : 0,
    });
    const place = (o, opt) => {
      if (opt.at) o.position.set(opt.at[0] ?? 0, opt.at[1] ?? 0, opt.at[2] ?? 0);
      if (opt.rot) o.rotation.set(opt.rot[0] ?? 0, opt.rot[1] ?? 0, opt.rot[2] ?? 0);
      if (opt.scale) o.scale.setScalar(opt.scale);
      return o;
    };

    const api = {
      THREE, scene, camera,
      rand: (a = 0, b = 1) => a + Math.random() * (b - a),

      // ---- primitives (all auto-tracked; opt: {size|r, color, at, rot, scale, glow, opacity, parent}) ----
      box: (opt = {}) => { const s = opt.size || [1, 1, 1]; const sz = Array.isArray(s) ? s : [s, s, s]; return place(track(new THREE.Mesh(new THREE.BoxGeometry(...sz), mat(opt)), opt.parent), opt); },
      sphere: (opt = {}) => place(track(new THREE.Mesh(new THREE.SphereGeometry(opt.r ?? 0.5, 20, 16), mat(opt)), opt.parent), opt),
      cyl: (opt = {}) => place(track(new THREE.Mesh(new THREE.CylinderGeometry(opt.r1 ?? opt.r ?? 0.5, opt.r2 ?? opt.r ?? 0.5, opt.h ?? 1, 20), mat(opt)), opt.parent), opt),
      cone: (opt = {}) => place(track(new THREE.Mesh(new THREE.ConeGeometry(opt.r ?? 0.5, opt.h ?? 1, 16), mat(opt)), opt.parent), opt),
      torus: (opt = {}) => place(track(new THREE.Mesh(new THREE.TorusGeometry(opt.r ?? 0.5, opt.tube ?? 0.15, 12, 24), mat(opt)), opt.parent), opt),
      plane: (opt = {}) => { const p = place(track(new THREE.Mesh(new THREE.PlaneGeometry(...(opt.size || [1, 1])), mat({ ...opt })), opt.parent), opt); p.material.side = THREE.DoubleSide; return p; },
      group: (opt = {}) => place(track(new THREE.Group(), opt.parent), opt),
      light: (opt = {}) => { const l = opt.type === "spot" ? new THREE.SpotLight(opt.color || "#fff", opt.intensity ?? 2, opt.dist ?? 12, 0.6) : new THREE.PointLight(opt.color || "#fff", opt.intensity ?? 1.5, opt.dist ?? 10, 2); return place(track(l), opt); },
      text: (str, opt = {}) => {
        const c = document.createElement("canvas"); c.width = 512; c.height = 128;
        const x = c.getContext("2d"); x.font = `bold ${opt.px || 64}px sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillStyle = opt.color || "#ffffff"; x.shadowColor = "#000"; x.shadowBlur = 8; x.fillText(str, 256, 64);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
        sp.scale.set(opt.size ?? 2, (opt.size ?? 2) / 4, 1); return place(track(sp), opt);
      },

      // ---- compound helpers (so big requests are one-liners) ----
      car: (color = "#d22", opt = {}) => {
        const g = api.group(opt);
        api.box({ size: [2.2, 0.55, 1], color, at: [0, 0.45, 0], parent: g });
        api.box({ size: [1.2, 0.45, 0.9], color, at: [-0.1, 0.95, 0], parent: g });
        api.box({ size: [1.1, 0.35, 0.84], color: "#9fd8ff", opacity: 0.75, at: [-0.1, 0.97, 0], parent: g });
        [[-0.75, 0.45], [0.75, 0.45], [-0.75, -0.45], [0.75, -0.45]].forEach(([x, z]) => { const w = api.cyl({ r: 0.26, h: 0.18, color: "#141414", parent: g }); w.rotation.x = Math.PI / 2; w.position.set(x, 0.26, z); });
        [[1.11, 0.28], [1.11, -0.28]].forEach(([x, z]) => api.box({ size: [0.04, 0.12, 0.16], color: "#fff6c0", glow: 2, at: [x, 0.5, z], parent: g }));
        return g;
      },
      tree: (opt = {}) => { const g = api.group(opt); api.cyl({ r1: 0.09, r2: 0.14, h: 0.9, color: "#6b4a2a", at: [0, 0.45, 0], parent: g }); [1.3, 1.75, 2.1].forEach((y, i) => api.cone({ r: 0.75 - i * 0.2, h: 0.7, color: "#2f7d3f", at: [0, y, 0], parent: g })); return g; },
      rock: (opt = {}) => { const r = place(track(new THREE.Mesh(new THREE.DodecahedronGeometry(opt.r ?? 0.4, 0), mat({ color: opt.color || "#7d7d84", rough: 0.9 })), opt.parent), opt); r.rotation.set(api.rand(0, 3), api.rand(0, 3), 0); return r; },

      // ---- motion & life ----
      tween: (obj, opt = {}) => {
        if (!obj) return obj;
        const map = {}, from = {}, to = {};
        const tgt = opt.to || {};
        for (const k of ["x", "y", "z"]) if (tgt[k] != null) { map[k] = [obj.position, k]; from[k] = obj.position[k]; to[k] = tgt[k]; }
        for (const k of ["rx", "ry", "rz"]) if (tgt[k] != null) { const p = k[1]; map[k] = [obj.rotation, p]; from[k] = obj.rotation[p]; to[k] = tgt[k]; }
        if (tgt.scale != null) { map.scale = [obj.scale, "x"], from.scale = obj.scale.x, to.scale = tgt.scale; M.tweens.push({ el: 0, dur: opt.dur ?? 1, ease: opt.ease, map: { s2: [obj.scale, "y"], s3: [obj.scale, "z"] }, from: { s2: obj.scale.y, s3: obj.scale.z }, to: { s2: tgt.scale, s3: tgt.scale } }); }
        M.tweens.push({ el: 0, dur: opt.dur ?? 1, ease: opt.ease, map, from, to, onDone: opt.onDone });
        return obj;
      },
      physics: (obj, opt = {}) => { if (!obj || !obj.isObject3D) return obj; M.bodies.push({ obj, vel: [...(opt.vel || [0, 0, 0])], gravity: opt.gravity, bounce: opt.bounce, spin: opt.spin, ttl: opt.ttl, floor: opt.floor }); return obj; },
      onUpdate: (fn) => { const id = ++M._uid; if (M.updaters.size > 200) M.updaters.delete(M.updaters.keys().next().value); M.updaters.set(id, { fn, errs: 0 }); return id; },
      stop: (id) => M.updaters.delete(id),
      after: (sec, fn) => M.timers.push({ t: sec, fn }),
      every: (sec, fn, times) => M.timers.push({ t: sec, fn, every: sec, left: times }),

      // ---- drama ----
      explode: (at = [0, 1, 0], opt = {}) => {
        fxBurst?.(opt.type || "sparkles", new THREE.Vector3(...at), opt.count ?? 140);
        const n = opt.debris ?? 8;
        for (let i = 0; i < n; i++) {
          const d = api.box({ size: 0.12 + Math.random() * 0.15, color: opt.color || "#c96a3a", at: [...at] });
          api.physics(d, { vel: [api.rand(-4, 4), api.rand(2.5, 7), api.rand(-4, 4)], spin: api.rand(2, 9), bounce: 0.35, ttl: opt.ttl ?? 7 });
        }
        api.boom();
      },
      boom: () => { audio.resume(); [55, 40, 90].forEach((f, i) => audio._tone(f, 0.5, "sawtooth", 0.3, i * 0.04)); audio.sfx("error"); },
      sfx: (n) => audio.sfx(n),
      tone: (f, d = 0.3) => { audio.resume(); audio._tone(f, d, "sine", 0.2); },
      shake: (s = 1) => { cameraFx?.("shake"); this.refs.shake?.(s); },
      flash: (color = "#ffffff") => { const f = document.createElement("div"); f.style.cssText = `position:fixed;inset:0;background:${color};opacity:.85;z-index:70;pointer-events:none;transition:opacity .5s`; document.body.appendChild(f); requestAnimationFrame(() => (f.style.opacity = "0")); setTimeout(() => f.remove(), 600); },
      burst: (type, at = [0, 1.5, 0], count = 120) => fxBurst?.(type, new THREE.Vector3(...at), count),

      // ---- world ----
      time: (h) => { State.set("timeOfDay", h); State.world.timeOfDay = h; dorm.setTime(h); },
      weather: (w) => { State.set("weather", w); dorm.setWeather(w); },
      lights: (mood) => dorm.setLighting(mood),
      rgb: (color) => dorm.setRGB(true, color),

      // ---- cast ----
      alice: {
        get pos() { return akuu.root.position; },
        walkTo: (x, z) => akuu.moveTo(x, z),
        say: (t) => State.bus.emit("akuu:say", { text: t, tools: [], idle: true }),
        express: (e) => akuu.setExpression(e),
        gesture: (g) => akuu.gesture(g),
        do: (action, place) => life?.command(place, action),
      },
      player: { get pos() { return (camCtl.mode === "third" ? camCtl.deku.position : camera.position); } },
      cam: { shake: (s = 1) => api.shake(s), focus: (target) => cameraFx?.("zoom_akuu"), reset: () => cameraFx?.("zoom_out") },

      // ---- registry ----
      tag: (obj, name) => { if (obj) obj.userData._tag = name; return obj; },
      find: (name) => M.actors.find((a) => a.userData._tag === name),
      remove: (obj) => { if (obj) M._forget(obj); },
      clear: () => M.clearAll(),
      count: () => M.actors.length,
    };
    return api;
  },
};
