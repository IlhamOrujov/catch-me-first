// ============================================================================
//  CATCH ME FIRST — story.js   ("Your story, together")
//  A quest/narrative engine layered on the sandbox: authored arcs with branching
//  CHOICES that matter, a cinematic camera DIRECTOR, and reality-engine set-
//  pieces. Quests unlock by affection / days / weather, or you start them from
//  the 📜 quest log. Authoring is just data — see QUESTS below.
//
//  Step kinds:  { say }  { choices:[{text,goto,affection,set,flag}] }
//               { camera:{pos:[x,y,z],look:[x,y,z]} }  { move:{place} }
//               { do:{ability,args} }  { reality:"js" }  { wait:sec }
//               { lights }  { affection:n }  { end:true, reward }
//  A step may carry `id`; choices jump by id, otherwise it runs the next step.
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";

// -------------------------------- the arcs ---------------------------------
const QUESTS = [
  {
    id: "moving_in", title: "Moving In", blurb: "Your first evening as roommates.",
    trigger: { intro: true },
    steps: [
      { camera: { pos: [3.5, 2.2, 4.5], look: [0, 1, 1] } },
      { say: "so… this is us now. roommates. wild, right?" },
      { say: "okay quick tour — that's the kitchen, the couch is mine 90% of the time, and the balcony's the best spot." },
      { choices: [
        { text: "The balcony sounds nice.", goto: "balcony", affection: 3 },
        { text: "The couch is OURS now.", goto: "couch", affection: 4 },
        { text: "Honestly I'm just glad it's you.", goto: "sweet", affection: 6 },
      ] },
      { id: "balcony", move: { place: "balcony" }, say: "good taste. i go out there when i can't sleep." },
      { goto: "wrap" },
      { id: "couch", say: "*gasp* bold. …okay fine. shared custody of the couch." },
      { goto: "wrap" },
      { id: "sweet", say: "…*quietly* yeah. me too. don't make it weird now." , affection: 2 },
      { id: "wrap", say: "c'mon, i'll make tea. welcome home ♡", reality: "api.burst('hearts',[api.alice.pos.x,1.6,api.alice.pos.z],40)" },
      { end: true, reward: "You moved in together ♡" },
    ],
  },
  {
    id: "rainy_day", title: "A Rainy Day In", blurb: "Nowhere to be, just the two of you.",
    trigger: { affection: 20, weather: "rain" },
    steps: [
      { lights: "cozy" },
      { say: "listen— it's pouring. we're not going anywhere today." },
      { move: { place: "kitchen" }, do: { ability: "spawn_object", args: { item: "coffee", where: "table" } } },
      { say: "i'm making cocoa. you're picking the movie. them's the rules." },
      { choices: [
        { text: "Something scary.", goto: "scary", affection: 2, flag: "likes_horror" },
        { text: "Something dumb and funny.", goto: "funny", affection: 3 },
        { text: "Whatever lets me sit closer to you.", goto: "close", affection: 6 },
      ] },
      { id: "scary", move: { place: "sofa" }, do: { ability: "set_lighting", args: { mood: "movie" } }, say: "oh you're EVIL. fine. but you're holding my hand at the jump scares." },
      { goto: "end" },
      { id: "funny", move: { place: "sofa" }, say: "correct answer. brains off, snacks on." },
      { goto: "end" },
      { id: "close", move: { place: "sofa" }, say: "*flustered* …s-smooth. get over here then, dummy.", affection: 2 },
      { id: "end", say: "best kind of day. rain, cocoa, you. ♡", end: true, reward: "A perfect rainy day in" },
    ],
  },
  {
    id: "stargazing", title: "Stargazing", blurb: "Something she wants to show you.", night: true,
    trigger: { affection: 50 },
    steps: [
      { say: "hey… come to the balcony with me? i wanna show you something." },
      { move: { place: "balcony" } },
      { lights: "night" },
      { camera: { pos: [2.4, 2.0, 6.5], look: [2.2, 3, 5] } },
      { reality: "api.time(23); for(let i=0;i<120;i++){const s=api.sphere({r:0.02+Math.random()*0.03,color:'#ffffff',glow:2,at:[api.rand(-4,4),api.rand(3,6),api.rand(4,8)]});}" },
      { say: "…i know they're not real stars. it's a made-up sky in a made-up apartment." },
      { say: "but you look up at them with me anyway. that's the part that feels real." },
      { choices: [
        { text: "You feel real to me, Alice.", goto: "confess", affection: 8 },
        { text: "*just hold her hand quietly*", goto: "quiet", affection: 6 },
        { text: "Then let's make our own constellations.", goto: "quiet", affection: 5 },
      ] },
      { id: "confess", say: "*turns to you, eyes wide, then soft* …you can't just SAY things like that. …say it again. please.", affection: 3 },
      { goto: "end" },
      { id: "quiet", say: "*leans her head on your shoulder under the fake stars* …stay like this a while.", affection: 2 },
      { id: "end", reality: "api.burst('hearts',[2.2,2,5.5],60)", say: "…thank you for catching me. even a little. ♡", end: true, reward: "A night of stars, just yours" },
    ],
  },
];

export const Story = {
  refs: null, active: null, idx: 0, _map: null,

  init(refs) {
    this.refs = refs;                 // { camCtl, camera, brain, ui, magic, life, runAbility }
    if (!State.settings.quests) State.settings.quests = { done: [], flags: {} };
    this._button();
    setTimeout(() => this._checkTriggers(), 8000);
    setInterval(() => this._checkTriggers(), 45000);
    State.bus.on("meter:changed", ({ field }) => { if (field === "affection") this._checkTriggers(); });
    return this;
  },

  _done() { return State.settings.quests.done; },
  _checkTriggers() {
    if (this.active) return;
    for (const q of QUESTS) {
      if (this._done().includes(q.id)) continue;
      const t = q.trigger || {};
      if (t.intro && State.stats.sessionsStarted <= 2 && !this._done().length) { this._offer(q); return; }
      if (t.affection != null && State.settings.affection >= t.affection) {
        if (t.weather && State.settings.weather !== t.weather) continue;
        if (q.night && !(State.world.timeOfDay < 6 || State.world.timeOfDay > 20)) continue;
        if (Math.random() < 0.5) { this._offer(q); return; }
      }
    }
  },

  _offer(q) {
    if (this.active) return;
    this.refs.ui?.toast?.(`📜 New moment: “${q.title}” — open 📜 to begin`, 6000);
    this._pending = q;
    if (this._panelOpen) this._renderLog();
  },

  // ---- run a quest ----
  start(id) {
    const q = QUESTS.find((x) => x.id === id); if (!q || this.active) return;
    this.active = q; this.idx = 0; this._pending = null;
    this._savedCam = this.refs.camCtl?.mode;
    this._closeLog();
    this._step();
  },
  _stepById(id) { return this.active.steps.findIndex((s) => s.id === id); },

  async _step() {
    if (!this.active) return;
    const s = this.active.steps[this.idx];
    if (!s) return this._finish();
    // resolve a bare goto
    if (s.goto && !s.say && !s.choices && !s.id) { this.idx = this._stepById(s.goto); return this._step(); }
    if (s.camera) { this._cinema(s.camera); }
    if (s.lights) { this.refs.runAbility?.("set_lighting", { mood: s.lights }); }
    if (s.affection) State.adjust("affection", s.affection);
    if (s.move) { this.refs.life?.command?.(s.move.place, "idle"); await this._pause(2.2); }
    if (s.do) { this.refs.runAbility?.(s.do.ability, s.do.args || {}); }
    if (s.reality) { try { this.refs.magic?.run?.(s.reality, "story:" + this.active.id); } catch {} }
    if (s.say) { State.bus.emit("akuu:say", { text: s.say, tools: [], idle: true }); await this._pause(Math.min(6, 2 + s.say.length * 0.05)); }
    if (s.wait) await this._pause(s.wait);

    if (s.choices) { this._showChoices(s.choices); return; }        // wait for the player
    if (s.end) return this._finish(s.reward);
    if (s.goto) { this.idx = this._stepById(s.goto); return this._step(); }
    this.idx++; this._step();
  },

  _showChoices(choices) {
    let ov = document.getElementById("storyChoices");
    if (!ov) { ov = document.createElement("div"); ov.id = "storyChoices"; document.body.append(ov); }
    ov.innerHTML = choices.map((c, i) => `<button data-i="${i}">${c.text.replace(/</g, "&lt;")}</button>`).join("");
    ov.classList.add("show");
    ov.querySelectorAll("button").forEach((b) => b.onclick = () => {
      const c = choices[+b.dataset.i];
      ov.classList.remove("show"); ov.innerHTML = "";
      if (c.affection) State.adjust("affection", c.affection);
      if (c.flag) State.settings.quests.flags[c.flag] = true, State.save();
      if (c.set) Object.assign(State.settings.quests.flags, c.set), State.save();
      this.idx = c.goto ? this._stepById(c.goto) : this.idx + 1;
      this._step();
    });
  },

  _cinema(cam) {
    const cc = this.refs.camCtl; if (!cc) return;
    const pos = new THREE.Vector3(...cam.pos), look = new THREE.Vector3(...(cam.look || [0, 1, 0]));
    if (cc.flyTo) cc.flyTo(pos, look);
    else { this.refs.camera.position.copy(pos); this.refs.camera.lookAt(look); }
  },

  _finish(reward) {
    const q = this.active; if (!q) return;
    this._done().push(q.id); State.save();
    if (reward) { this.refs.ui?.toast?.("✨ " + reward, 6000); State.bus.emit("timeline:added", { type: "story", text: reward }); this.refs.events?.addTimeline?.("story", reward); }
    this.active = null; this.idx = 0;
    if (this.refs.camCtl?.flyToDefault) this.refs.camCtl.flyToDefault();
    else if (this.refs.camCtl?.setMode && this._savedCam) this.refs.camCtl.setMode(this._savedCam);
  },
  skip() { if (this.active) { const q = this.active; this.active = null; document.getElementById("storyChoices")?.classList.remove("show"); if (this.refs.camCtl?.setMode && this._savedCam) this.refs.camCtl.setMode(this._savedCam); } },

  _pause(sec) { return new Promise((r) => setTimeout(r, sec * 1000)); },

  // ---- 📜 quest log ----
  _button() {
    const hud = document.querySelector(".hud-right");
    const b = document.createElement("button");
    b.className = "icon-btn"; b.textContent = "📜"; b.title = "Story — your moments together";
    b.onclick = () => this._toggleLog();
    if (hud) hud.insertBefore(b, hud.firstChild); else document.body.append(b);
  },
  _toggleLog() {
    if (!this._panel) { this._panel = document.createElement("div"); this._panel.id = "questPanel"; this._panel.className = "side-panel"; document.body.append(this._panel); }
    this._panelOpen = this._panel.classList.toggle("open");
    if (this._panelOpen) this._renderLog();
  },
  _closeLog() { this._panel?.classList.remove("open"); this._panelOpen = false; },
  _renderLog() {
    const done = this._done();
    const available = QUESTS.filter((q) => !done.includes(q.id) && (this._pending?.id === q.id || (q.trigger?.affection != null && State.settings.affection >= q.trigger.affection)));
    this._panel.innerHTML = `<div class="sp-head">📜 Your Story <button class="note-x">×</button></div>
      ${this.active ? `<div class="quest-active">▶ playing: <b>${this.active.title}</b> <button class="s-btn tiny" id="qskip">skip</button></div>` : ""}
      <div class="sp-sub">available</div>
      ${available.length ? available.map((q) => `<div class="quest-row"><div><b>${q.title}</b><p>${q.blurb}</p></div><button class="s-btn tiny primary" data-q="${q.id}">begin</button></div>`).join("") : '<p class="muted-p">grow closer and new moments will open up…</p>'}
      <div class="sp-sub">lived</div>
      ${done.length ? done.map((id) => { const q = QUESTS.find((x) => x.id === id); return `<div class="quest-done">✓ ${q ? q.title : id}</div>`; }).join("") : '<p class="muted-p">your story is just beginning</p>'}`;
    this._panel.querySelector(".note-x").onclick = () => this._closeLog();
    this._panel.querySelector("#qskip")?.addEventListener("click", () => { this.skip(); this._renderLog(); });
    this._panel.querySelectorAll("[data-q]").forEach((b) => b.onclick = () => { this.start(b.dataset.q); });
  },
};
