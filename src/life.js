// ============================================================================
//  CATCH ME FIRST — life.js
//  Makes Alice ALIVE. A needs + schedule driven autonomy director: she decides
//  what to do, walks there (smooth, rotates, unstucks), performs the activity,
//  reacts to the player, chatters occasionally, and never freezes or spams.
//  She can also be *commanded* (by the LLM tools) and can improvise any action.
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";
import { getHotspots, hotspotById } from "./hotspots.js";
import { Lifesim } from "./lifesim.js";

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// What each action means: expression, how long, which needs it restores, a sfx,
// optional world ability to fire, and flavour lines. Unknown actions fall back to
// a generic spec so Alice can improvise things you never coded.
const ACTION_SPECS = {
  sleep:       { expr: "sleepy", dur: [18, 40], restore: { energy: 9 }, lines: ["*yawn*… five more minutes…", "mmnn… so cozy…"], emote: "zzz", pose: "rest", eyes: true },
  nap:         { expr: "sleepy", dur: [10, 20], restore: { energy: 6 }, lines: ["just a lil nap~"], emote: "zzz", pose: "rest", eyes: true },
  lie_down:    { expr: "sleepy", dur: [8, 18], restore: { energy: 4 }, pose: "rest" },
  relax:       { expr: "smile", dur: [8, 16], restore: { fun: 3, energy: 2 }, pose: "sit" },
  sit:         { expr: "neutral", dur: [8, 18], restore: { energy: 2 }, pose: "sit" },
  watch_tv:    { expr: "happy", dur: [12, 26], restore: { fun: 6 }, lines: ["ooh this part's good", "pfft, so dumb, i love it"], pose: "sit" },
  scroll_phone:{ expr: "smug", dur: [8, 16], restore: { fun: 4, social: 3 }, lines: ["lol", "hmm…", "no way she posted that"], pose: "sit", prop: "phone" },
  read:        { expr: "thinking", dur: [12, 24], restore: { fun: 5 }, lines: ["one more chapter…"], pose: "sit", prop: "book" },
  pick_book:   { expr: "thinking", dur: [4, 8] },
  browse:      { expr: "thinking", dur: [8, 16], restore: { fun: 3 } },
  daydream:    { expr: "shy", dur: [8, 16], restore: { fun: 2 }, lines: ["…", "i wonder…"] },
  cook:        { expr: "determined", dur: [14, 26], restore: { hunger: 6 }, sfx: "success", ability: { id: "cook_food", args: { dish: "cake" } }, lines: ["okay… don't burn it this time", "smells good already~"], prop: "pan" },
  bake:        { expr: "happy", dur: [16, 28], restore: { hunger: 5 }, sfx: "success", lines: ["baking therapy hehe"], prop: "pan" },
  make_coffee: { expr: "sleepy", dur: [6, 12], restore: { energy: 5 }, sfx: "pop", ability: { id: "spawn_object", args: { item: "coffee", where: "table" } }, lines: ["coffee. now.", "mmm caffeine"], prop: "mug" },
  make_tea:    { expr: "smile", dur: [6, 12], restore: { energy: 3 }, ability: { id: "spawn_object", args: { item: "coffee", where: "table" } }, lines: ["tea time~"], prop: "mug" },
  eat:         { expr: "happy", dur: [10, 18], restore: { hunger: 10 }, sfx: "coin", lines: ["itadakimasu~", "mmm good"], pose: "sit", prop: "bowl" },
  snack:       { expr: "happy", dur: [5, 10], restore: { hunger: 5 }, lines: ["just a snack, promise"], prop: "bowl" },
  have_tea:    { expr: "smile", dur: [8, 14], restore: { hunger: 3, energy: 2 }, pose: "sit", prop: "mug" },
  get_food:    { expr: "neutral", dur: [3, 6], restore: { hunger: 2 } },
  get_drink:   { expr: "neutral", dur: [3, 6] },
  peek_inside: { expr: "thinking", dur: [3, 6], lines: ["…nothing good in here", "we're out of everything again"] },
  clean:       { expr: "determined", dur: [10, 18], restore: { hygiene: 5, fun: -1 }, lines: ["ugh, this place", "there, better"], prop: "cloth" },
  tidy:        { expr: "neutral", dur: [8, 14], restore: { hygiene: 3 } },
  set_table:   { expr: "neutral", dur: [5, 9] },
  study:       { expr: "thinking", dur: [16, 30], restore: { fun: -2 }, lines: ["okay focus… focus…", "why is this so hard", "we have an exam and i'm doomed"], pose: "sit", prop: "book" },
  work:        { expr: "determined", dur: [16, 28], lines: ["grind time"], pose: "sit", prop: "book" },
  draw:        { expr: "happy", dur: [12, 24], restore: { fun: 6 }, ability: { id: "create_art", args: { description: "a little doodle", style: "doodle" } }, lines: ["hehe look what i drew"], pose: "sit", prop: "pen" },
  write:       { expr: "thinking", dur: [10, 20], restore: { fun: 3 }, pose: "sit", prop: "pen" },
  browse_web:  { expr: "smug", dur: [8, 16], restore: { fun: 4 } },
  change_outfit:{ expr: "smug", dur: [6, 12], ability: { id: "change_outfit", args: { outfit: "casual" } }, lines: ["new fit~", "how do i look?"] },
  pick_clothes:{ expr: "thinking", dur: [5, 10] },
  freshen_up:  { expr: "relax", dur: [8, 14], restore: { hygiene: 8 }, lines: ["ah, refreshed"] },
  brush_hair:  { expr: "smile", dur: [5, 9], restore: { hygiene: 3 } },
  check_mail:  { expr: "surprised", dur: [4, 8], lines: ["mail's here", "bills… great"] },
  greet:       { expr: "happy", dur: [3, 6], lines: ["oh, hey~", "welcome back!"] },
  leave:       { expr: "neutral", dur: [3, 6] },
  gaze_outside:{ expr: "shy", dur: [8, 18], restore: { fun: 2, social: 1 }, lines: ["it's pretty out today", "the sky's nice…"] },
  fresh_air:   { expr: "relax", dur: [8, 16], restore: { energy: 2, fun: 2 } },
  water_plants:{ expr: "smile", dur: [5, 10], lines: ["drink up, lil guy"] },
  stretch:     { expr: "happy", dur: [3, 7], restore: { energy: 2 }, emote: "star" },
  dance:       { expr: "excited", dur: [8, 16], restore: { fun: 8 }, ability: { id: "gesture", args: { move: "dance" } }, lines: ["can't stop won't stop~"] },
  twirl:       { expr: "happy", dur: [3, 6], ability: { id: "gesture", args: { move: "twirl" } } },
  check_look:  { expr: "smug", dur: [4, 8], lines: ["lookin' good, if i say so myself"] },
  pose:        { expr: "smug", dur: [3, 6], ability: { id: "gesture", args: { move: "peace" } } },
  fix_hair:    { expr: "neutral", dur: [4, 8], restore: { hygiene: 2 } },
  think:       { expr: "thinking", dur: [5, 12] },
  idle:        { expr: "neutral", dur: [4, 10] },
  chat:        { expr: "happy", dur: [6, 12], restore: { social: 5 } },
  scroll:      { expr: "smug", dur: [8, 14], restore: { fun: 3 } },
};
const GENERIC = { expr: "neutral", dur: [6, 12] };   // for improvised/unknown actions

const IDLE_LINES = ["hmm~", "la la la…", "so quiet today", "i'm kinda bored", "what to do, what to do", "*hums a little tune*", "ugh i should really study", "i wonder what Deku's up to", "this apartment is a mess lol", "…", "*stretches*"];
const REACT_LINES = ["oh, hey~", "you're back?", "hi hi", "*glances over* need something?", "hmm? what's up?", "*smiles at you*", "don't sneak up like that!", "oh! didn't see you there"];
// closer / more aware — fired when you step right into her personal space
const NOTICE_LINES = ["…you're kinda close", "*looks up at you*", "oh— hi you", "mm? right there huh", "*tilts head at you* what's up?", "*notices you* hey~", "you need something?", "*leans back a bit* personal space~", "you always this close? hehe", "*peeks up* yes~?"];

export class Life {
  constructor(refs) {
    this.refs = refs;                 // { akuu, camCtl, camera, ui, brain, scene }
    this.needs = { energy: 78, hunger: 66, fun: 62, social: 55, hygiene: 78, ...(State.settings.aliceNeeds || {}) };
    this.mood = State.world.mood || "content";
    this.state = "idle";              // idle | walking | acting
    this.activity = null;
    this.recentHot = []; this.recentAct = [];
    this.decisionCd = 3; this.idleLineCd = 30; this.reactCd = 0; this._saveCd = 30; this._moodExprCd = 12;
    this._path = []; this._pathIdx = 0; this._stuckT = 0; this._lastPos = null;
    this._actT = 0; this._actDur = 0;
    this.awaiting = false; this._playerWasFar = true;
    this.markers = null;
  }

  // floor keeps her alive even at the slider's minimum (0 would freeze all decisions)
  intensity() { return Math.max(0.12, (State.settings.autonomyIntensity ?? 55) / 55); }

  update(dt) {
    const akuu = this.refs.akuu;
    if (!akuu?.root) return;

    // publish her exact live position so she "knows where she is" in the prompt
    const rp = akuu.root.position;
    State.world.alicePos = { x: +rp.x.toFixed(2), z: +rp.z.toFixed(2), facing: +akuu.root.rotation.y.toFixed(2) };
    // and the player's, so she knows where you are too
    const pp = this._playerPos();
    State.world.playerPos = { x: +pp.x.toFixed(2), z: +pp.z.toFixed(2) };

    if (State.world.outing) { try { this._playerReactions(dt); } catch {} return; }   // on a date — no autonomous wandering
    if (this.state === "away") { this._awayTick(dt); return; }   // she's out of the apartment

    // passive life always on (blink handled in akuu; here: look-at + subtle)
    this._playerReactions(dt);

    if (!State.settings.autonomy || State.settings.frozen || this.refs.brain?.thinking) {
      // if she's mid-walk when autonomy toggles off, let her finish gracefully
      if (this.state === "walking") this._walk(dt);
      return;
    }

    this._decayNeeds(dt);
    if (this.state === "walking") this._walk(dt);
    else if (this.state === "acting") this._act(dt);
    else {
      this.decisionCd -= dt * this.intensity();
      if (this.decisionCd <= 0 && !this.awaiting) this._decide();
      this._moodExpression(dt);
    }
    this._idleChatter(dt);
    this._syncMarkers();
    // persist needs occasionally so she doesn't reset each session
    this._saveCd -= dt;
    if (this._saveCd <= 0) { this._saveCd = 30; State.settings.aliceNeeds = { ...this.needs }; State.save(); }
  }

  _decayNeeds(dt) {
    const k = dt / 60;
    this.needs.energy = clamp(this.needs.energy - k * 3.5);
    this.needs.hunger = clamp(this.needs.hunger - k * 4.5);
    this.needs.fun = clamp(this.needs.fun - k * 3.5);
    this.needs.social = clamp(this.needs.social - k * 2.5);
    this.needs.hygiene = clamp(this.needs.hygiene - k * 2);
    State.world.needs = this.needs;
  }

  _moodExpression(dt) {
    this._moodExprCd -= dt;
    if (this._moodExprCd > 0) return;
    this._moodExprCd = 14 + Math.random() * 16;
    const MOOD_EXPR = {
      happy: ["happy", "smile"], content: ["smile", "neutral", "relax"], playful: ["smug", "wink", "happy"],
      tired: ["sleepy", "neutral"], bored: ["neutral", "annoyed", "pout"], excited: ["excited", "happy"],
      lonely: ["sad", "shy"], affectionate: ["love", "blush", "smile"], annoyed: ["annoyed", "pout"],
      focused: ["thinking", "determined"], cozy: ["relax", "smile"], sad: ["sad", "shy"],
    };
    const pool = MOOD_EXPR[State.world.mood] || MOOD_EXPR[this.mood] || ["neutral", "smile"];
    if (!this.refs.akuu.isBusy?.()) this.refs.akuu.setExpression(pick(pool));
  }

  // ---- decision making ----
  _decide() {
    const hour = State.world.timeOfDay;
    // follow her weekly calendar most of the time (jobs, meals, hobbies)
    const plan = Lifesim.currentPlan?.(hour);
    if (plan && Math.random() < 0.7 && !this.recentAct.includes(plan.action) && hotspotById(State, plan.place)) {
      this._startActivity(plan.place, plan.action, false);
      this.decisionCd = 6 + Math.random() * 6;
      return;
    }
    const scored = this._scoreActivities(hour);
    if (!scored.length) { this.decisionCd = 5; return; }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(5, scored.length));
    const choice = pick(top);                       // variety among the best
    this._startActivity(choice.hotspotId, choice.action, false);
    this.decisionCd = 5 + Math.random() * 7;
  }

  _scoreActivities(hour) {
    const out = [];
    const n = this.needs;
    const night = hour < 6.5 || hour > 22.5;
    const morning = hour >= 6.5 && hour < 11;
    const midday = hour >= 11 && hour < 16;
    const evening = hour >= 16 && hour < 22.5;
    for (const h of getHotspots(State)) {
      for (const action of (h.actions || [])) {
        let s = 8 + Math.random() * 6;
        // needs pull
        if (["eat", "cook", "snack", "get_food", "make_tea", "have_tea", "bake"].includes(action)) s += (100 - n.hunger) * 0.5;
        if (["sleep", "nap", "lie_down"].includes(action)) s += (100 - n.energy) * 0.6 + (night ? 40 : -30);
        if (["make_coffee"].includes(action)) s += (100 - n.energy) * 0.35 + (morning ? 15 : 0);
        if (["watch_tv", "read", "scroll_phone", "dance", "draw", "daydream", "browse"].includes(action)) s += (100 - n.fun) * 0.4;
        if (["freshen_up", "clean", "brush_hair", "tidy"].includes(action)) s += (100 - n.hygiene) * 0.4;
        if (["chat", "greet", "gaze_outside"].includes(action)) s += (100 - n.social) * 0.3;
        // schedule
        if (["study", "work"].includes(action)) s += midday ? 22 : evening ? 10 : -8;
        if (["cook", "eat", "set_table"].includes(action)) s += evening ? 22 : -4;
        if (["make_coffee", "freshen_up", "stretch"].includes(action)) s += morning ? 18 : 0;
        if (["sleep"].includes(action) && !night) s -= 60;
        if (["dance", "watch_tv"].includes(action) && night) s -= 10;
        // anti-repeat
        if (this.recentAct.includes(action)) s -= 30;
        if (this.recentHot.includes(h.id)) s -= 14;
        out.push({ hotspotId: h.id, action, score: s });
      }
    }
    return out;
  }

  // ---- start / navigate ----
  _clearPresentation() {
    const a = this.refs.akuu;
    a.setPose?.("stand"); a.removeProp?.(); a.setEyesClosed?.(false);
  }

  _startActivity(hotspotId, action, commanded) {
    // if she was OUT of the apartment, bring her back before doing anything —
    // otherwise a directed command mid-outing would leave her invisible forever
    if (this.state === "away") { this.refs.akuu.root.visible = true; State.world.away = false; State.world.doing = null; }
    this._clearPresentation();
    const hs = hotspotById(State, hotspotId) || getHotspots(State)[0];
    this.activity = { hotspotId: hs.id, action, hs, commanded };
    const here = this.refs.akuu.root.position;
    if (dist2D(here, { x: hs.pos[0], z: hs.pos[2] }) < (hs.radius || 0.7) + 0.2) {
      this._arrive();                              // already there
    } else {
      this.state = "walking";
      this._buildPath(hs);
    }
    State.logEvent("life", { action, hotspot: hs.id, commanded });
    State.bus.emit("life:activity", { action, hotspot: hs.id, label: hs.label });
  }

  _buildPath(hs) {
    const start = this.refs.akuu.root.position.clone();
    const goal = new THREE.Vector3(hs.pos[0], 0, hs.pos[2]);
    // stopping point: just inside the radius, on the line from start
    const dir = goal.clone().sub(start); dir.y = 0;
    const stop = goal.clone();
    if (dir.length() > (hs.radius || 0.7)) stop.copy(goal).addScaledVector(dir.normalize(), -(hs.radius || 0.7) * 0.7);
    this._clamp(stop);
    // real A* route through doorways when the nav grid is baked; fallback = direct
    let pts = null;
    if (this.refs.pathfinder) { try { pts = this.refs.pathfinder.findPath(start, stop); } catch {} }
    this._pathConfident = !!(pts && pts.length);
    this._path = this._pathConfident ? pts : [stop];
    this._pathIdx = 0;
    this._stuckT = 0; this._lastPos = start.clone();
    this._walkStart = this._now();
    this._detours = 0;
    const first = this._path[0];
    this.refs.akuu.moveTo(first.x, first.z, hs.rot);
  }

  _now() { return (this._t2 = (this._t2 || 0)); }   // monotonic-ish via accumulated dt

  _walk(dt) {
    this._t2 = (this._t2 || 0) + dt;
    const root = this.refs.akuu.root;
    // give up FAST on unreachable targets so she never grinds into a wall
    // (A*-confident paths get longer since cross-apartment routes take a while)
    if (this._t2 - this._walkStart > (this._pathConfident ? 22 : 8) || this._detours > (this._pathConfident ? 8 : 3)) {
      this.state = "idle"; this.activity = null;
      this.refs.akuu._walking = false; this.decisionCd = 0.5;
      this.recentHot = []; this.recentAct = [];                 // avoid re-picking the unreachable spot
      State.bus.emit("life:done", {}); return;
    }
    const target = this._path[this._pathIdx];
    if (!target) { this._arrive(); return; }
    if (dist2D(root.position, target) < 0.28) {
      this._pathIdx++;
      if (this._pathIdx >= this._path.length) { this._arrive(); return; }
      const t = this._path[this._pathIdx];
      this.refs.akuu.moveTo(t.x, t.z, this.activity?.hs?.rot ?? 0);
    }
    // stuck detection → redirect quickly (before she visibly pushes into the wall).
    // Compare SPEED (m/s), not raw per-frame distance, so it's frame-rate independent
    // (on 120/144Hz displays a distance threshold made normal walking read as "stuck").
    const moved = this._lastPos ? root.position.distanceTo(this._lastPos) : 1;
    const speed = moved / Math.max(dt, 0.001);
    this._stuckT = speed < 0.4 ? this._stuckT + dt : 0;
    this._lastPos = root.position.clone();
    if (this._stuckT > 0.55) { this._unstuck(target); this._stuckT = 0; }
  }

  _unstuck(target) {
    const root = this.refs.akuu.root;
    const dir = target.clone().sub(root.position); dir.y = 0; if (dir.length() < 0.01) return; dir.normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar((Math.random() < 0.5 ? 1 : -1) * 1.3);
    const detour = root.position.clone().add(perp).addScaledVector(dir, 0.5);
    this._clamp(detour);
    this._path.splice(this._pathIdx, 0, detour);
    this.refs.akuu.moveTo(detour.x, detour.z);
    this._detours = (this._detours || 0) + 1;
    State.bus.emit("life:unstuck");
  }

  _clamp(v) {
    const b = this.refs.bounds;
    if (b) { v.x = Math.max(b.minX, Math.min(b.maxX, v.x)); v.z = Math.max(b.minZ, Math.min(b.maxZ, v.z)); }
    return v;
  }

  // ---- perform ----
  _arrive() {
    const hs = this.activity.hs;
    if (this.activity.action === "leave") { this._goOut(); return; }   // outing!
    this.refs.akuu.faceAngle?.(hs.rot ?? 0);
    this.state = "acting";
    this._actT = 0;
    const spec = ACTION_SPECS[this.activity.action] || GENERIC;
    const [lo, hi] = spec.dur || [6, 12];
    this._actDur = lo + Math.random() * (hi - lo);
    // present the action — expression, pose (sitting/resting), held prop, effects
    if (spec.expr) this.refs.akuu.setExpression(spec.expr);
    if (spec.pose) this.refs.akuu.setPose?.(spec.pose);
    if (spec.prop) this.refs.akuu.attachProp?.(spec.prop);
    if (spec.eyes) this.refs.akuu.setEyesClosed?.(true);
    if (spec.emote) this.refs.akuu.emote?.(spec.emote);
    if (spec.sfx) this.refs.audio?.sfx(spec.sfx);
    if (spec.ability && Math.random() < 0.7) this.refs.runAbility?.(spec.ability.id, spec.ability.args);
    // record
    this.recentAct.unshift(this.activity.action); this.recentAct = this.recentAct.slice(0, 4);
    this.recentHot.unshift(hs.id); this.recentHot = this.recentHot.slice(0, 3);
    // occasional flavour line — kept rare + gap-limited so she never spams
    if (State.settings.idleChatter && spec.lines && Math.random() < 0.28 && Date.now() - (this._lastLine || 0) > 30000) {
      this._say(pick(spec.lines));
    }
  }

  _act(dt) {
    this._actT += dt;
    const spec = ACTION_SPECS[this.activity.action] || GENERIC;
    if (spec.restore) for (const k in spec.restore) this.needs[k] = clamp((this.needs[k] ?? 50) + spec.restore[k] * dt);
    if (this._actT >= this._actDur) {
      this.state = "idle"; const done = this.activity; this.activity = null;
      this.decisionCd = 2 + Math.random() * 5;
      this._clearPresentation();
      this.refs.akuu.setExpression("neutral");
      Lifesim.onActivityDone?.(done?.action);             // skill XP + wages
      State.bus.emit("life:done", { action: done?.action, hotspot: done?.hotspotId });
    }
  }

  // ---- outings: she actually leaves through the front door and comes back ----
  _goOut() {
    const akuu = this.refs.akuu;
    this._clearPresentation();
    akuu.root.visible = false;
    this.state = "away"; this.activity = null;
    this.awayT = 90 + Math.random() * 150;
    State.world.away = true;
    State.world.doing = "out ♡";
    this.refs.ui?.toast("🚪 Alice headed out for a bit…");
    State.bus.emit("life:activity", { action: "out", hotspot: "entranceDoor", label: "Outside" });
  }

  _awayTick(dt) {
    this.awayT -= dt;
    if (this.awayT > 0) return;
    const akuu = this.refs.akuu;
    const door = hotspotById(State, "entranceDoor");
    if (door) akuu.root.position.set(door.pos[0], 0, door.pos[2]);
    akuu.root.visible = true;
    this.state = "idle"; State.world.away = false; State.world.doing = null;
    this.decisionCd = 8 + Math.random() * 6;
    akuu.setExpression("happy");
    if ((State.settings.groqKeys?.length || State.settings.geminiKeys?.length) && Math.random() < 0.75)
      this.refs.brain?.nudge?.("(You just walked back in from a little outing — greet him warmly and share one small story or thing you brought back.)");
    else State.bus.emit("akuu:say", { text: "i'm home~ ♡", tools: [], idle: true });
    State.bus.emit("life:done", { action: "out" });
  }

  // click/tap on Alice → she reacts
  poked() {
    if (Date.now() - (this._pokeT || 0) < 4000) return;
    this._pokeT = Date.now();
    const aff = State.settings.affection;
    this.refs.akuu.setExpression(aff >= 60 ? pick(["love", "blush", "happy"]) : pick(["surprised", "pout", "blush"]));
    this.refs.akuu.emote?.(aff >= 60 ? "heart" : "!");
    if (Math.random() < 0.55 && Date.now() - (this._lastLine || 0) > 9000) {
      this._say(aff >= 60 ? pick(["hehe~ ♡", "*giggles* what?", "yes, you~?"]) : pick(["eep—! what?", "hm? *tilts head*", "hands to yourself~"]));
    }
    if (Math.random() < 0.3) State.adjust("affection", 1);
  }

  // ---- player presence ----
  _playerPos() {
    const c = this.refs;
    if (c.camCtl?.mode === "third" && c.camCtl.deku) return c.camCtl.deku.position;
    return c.camera.position;   // first-person / overview: the eye
  }
  _playerReactions(dt) {
    const akuu = this.refs.akuu;
    const p = this._playerPos();
    const d = dist2D(akuu.root.position, p);
    this.reactCd -= dt;
    if (d < 2.8) {
      akuu.lookAtPoint?.(p);                                   // track the player with her head
      // she visibly turns her body toward you when you're close and she's free — noticing you
      if (d < 2.1 && this.state !== "walking" && !akuu.isBusy?.()) {
        akuu.faceAngle?.(Math.atan2(p.x - akuu.root.position.x, p.z - akuu.root.position.z));
      }
      // acknowledgement beat when you step into her personal space (cooldown → never spammy)
      if (d < 1.8 && this.reactCd <= 0) {
        this.reactCd = 9 + Math.random() * 7;
        const away = this._playerWasFar; this._playerWasFar = false;
        if (this.state !== "walking")
          akuu.setExpression(pick(away ? ["happy", "surprised", "smile"] : ["surprised", "blush", "smile", "smug"]));
        this.needs.social = clamp(this.needs.social + (away ? 6 : 3));
        if (State.settings.idleChatter && Date.now() - (this._lastLine || 0) > 8000)
          this._say(pick(away ? REACT_LINES : NOTICE_LINES));
      }
    } else if (d > 4) {
      this._playerWasFar = true;                               // reset so she greets warmly next time
    }
  }

  _idleChatter(dt) {
    if (!State.settings.idleChatter) return;
    this.idleLineCd -= dt;
    if (this.idleLineCd > 0 || this.state === "walking" || this.refs.brain?.thinking) return;
    this.idleLineCd = 55 + Math.random() * 70;               // long cooldown → never spam
    // mostly canned (free), rarely a spontaneous LLM line
    if (Math.random() < 0.22 && State.settings.groqKeys?.length) this.refs.brain?.proactive?.();
    else this._say(pick(IDLE_LINES));
  }

  _say(line) {
    this._lastLine = Date.now();
    State.bus.emit("akuu:say", { text: line, tools: [], idle: true });
  }

  // ---- external commands (from LLM tools / user) ----
  _resolveHotspot(place, action) {
    if (place) {
      const byId = hotspotById(State, place);
      if (byId) return byId;
      const byLabel = getHotspots(State).find((h) => h.label.toLowerCase() === String(place).toLowerCase());
      if (byLabel) return byLabel;
    }
    if (action) { const byAct = getHotspots(State).find((h) => (h.actions || []).includes(action)); if (byAct) return byAct; }
    return hotspotById(State, "roomCenter") || getHotspots(State)[0];
  }
  command(place, action) {                 // directed activity, higher priority
    this.awaiting = false;
    const hs = this._resolveHotspot(place, action);
    this._startActivity(hs.id, action || "idle", true);
    return `okay~ ${action ? action.replace(/_/g, " ") : "heading over"}${hs ? " (" + hs.label.toLowerCase() + ")" : ""}`;
  }
  goTo(place) {
    const hs = this._resolveHotspot(place, null);
    this._startActivity(hs.id, "idle", true);
    return `walking to the ${hs.label.toLowerCase()}`;
  }

  // ---- dev markers ----
  _syncMarkers() {
    const show = State.settings.showHotspots;
    if (show && !this.markers) this._buildMarkers();
    if (!show && this.markers) { this.refs.scene.remove(this.markers); this.markers = null; }
  }
  _buildMarkers() {
    const g = new THREE.Group();
    for (const h of getHotspots(State)) {
      const ring = new THREE.Mesh(new THREE.RingGeometry((h.radius || 0.6) * 0.9, (h.radius || 0.6), 24),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(h.pos[0], 0.02, h.pos[2]);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6), new THREE.MeshBasicMaterial({ color: 0xff6ba6 }));
      pole.position.set(h.pos[0], 0.8, h.pos[2]);
      g.add(ring, pole);
    }
    this.markers = g; this.refs.scene.add(g);
  }
}
