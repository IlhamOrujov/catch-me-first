// ============================================================================
//  CATCH ME FIRST — main.js
//  Bootstraps the 3D world, wires every system together, runs the game loop.
// ============================================================================

import * as THREE from "three";
import { CameraController } from "./controller.js";
import { PROMPT_TOKENS } from "./config.js";
import { State } from "./state.js";
import { Dorm } from "./dorm.js";
import { Akuu } from "./akuu.js";
import { Audio } from "./audio.js";
import { UI } from "./ui.js";
import { Brain } from "./brain.js";
import { initAbilities, updateFx, Fx, runAbility } from "./abilities.js";
import { loadEnvironment } from "./environment.js";
import { buildCollider } from "./collision.js";
import { NavGrid } from "./pathfinding.js";
import { Life } from "./life.js";
import { hotspotById } from "./hotspots.js";
import { Events } from "./events.js";
import { Romance } from "./romance.js";
import { Weather } from "./weather.js";
import { Voice } from "./voice.js";
import { PhotoMode } from "./photomode.js";
import { Magic } from "./magic.js";
import { Studio } from "./studio.js";
import { Emotion } from "./emotion.js";
import { RAG } from "./memory-rag.js";
import { Lifesim } from "./lifesim.js";
import { Phone } from "./phone.js";
import { Build } from "./buildmode.js";
import { Story } from "./story.js";
import { Minigames } from "./minigames.js";
import { Mobile } from "./mobile.js";
import { DevMode } from "./devmode.js";
import { LiveVoice } from "./livevoice.js";
import { Episodes } from "./memories.js";
import { Director } from "./director.js";
import { LiveFace } from "./liveface.js";
import { OfflineLife } from "./offlinelife.js";
import { Mapper } from "./mapper.js";
import { PostFX } from "./postfx.js";
import { Atmosphere } from "./atmosphere.js";
import { Ambient } from "./ambient.js";
import { HudMenu } from "./hudmenu.js";
import { Reflection } from "./reflection.js";
import { Icons } from "./icons.js";

State.load();

// ---------- renderer / scene / camera ----------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#12101a");
scene.fog = new THREE.Fog("#12101a", 18, 40);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 100);
const DEFAULT_CAM = new THREE.Vector3(5.4, 3.1, 5.6);
const DEFAULT_TARGET = new THREE.Vector3(0.2, 1.3, -0.4);

// cinematic post-processing (bloom + colour grade + vignette + grain)
PostFX.init({ renderer, scene, camera });
Atmosphere.init({ scene });    // time-of-day sky + drifting dust motes
camera.position.copy(DEFAULT_CAM);

// ---------- build world ----------
const dorm = new Dorm().build(scene);
const akuu = new Akuu(State.settings).build(scene);

// ---------- camera controller (orbit / first-person / third-person) ----------
const camCtl = new CameraController(camera, renderer, scene, dorm.dims, DEFAULT_TARGET);

dorm.setTime(State.settings.timeOfDay);
dorm.setWeather(State.settings.weather);
dorm.setTheme(State.settings.roomTheme);
dorm.setRGB(State.settings.rgbLights);
dorm.setLighting("cozy");

// ---------- camera cinematics (used by Akuu's abilities) ----------
function cameraFx(effect) {
  const focusPts = {
    akuu: [new THREE.Vector3(2.0, 1.6, 0.5), akuu.root.position.clone().add(new THREE.Vector3(0, 1.2, 0))],
    whiteboard: [new THREE.Vector3(-1.5, 1.8, -1.5), new THREE.Vector3(-4.2, 1.6, -1.5)],
    window: [new THREE.Vector3(-1.0, 2.0, -1.0), new THREE.Vector3(-4.3, 1.9, -1.4)],
    tv: [new THREE.Vector3(1.2, 1.8, -0.5), new THREE.Vector3(1.2, 1.7, -3.7)],
    desk: [new THREE.Vector3(3.4, 1.4, -0.5), new THREE.Vector3(3.0, 0.9, -3.0)],
    bed: [new THREE.Vector3(4.5, 1.6, 0.5), new THREE.Vector3(3.4, 0.8, -2.4)],
  };
  if (effect.startsWith("focus:")) {
    const f = focusPts[effect.split(":")[1]]; if (f) camCtl.flyTo(f[0], f[1]); return;
  }
  switch (effect) {
    case "zoom_akuu": { const t = akuu.root.position.clone().add(new THREE.Vector3(0, 1.25, 0));
      camCtl.flyTo(t.clone().add(new THREE.Vector3(1.4, 0.3, 1.6)), t); break; }
    case "zoom_out": camCtl.flyTo(DEFAULT_CAM.clone(), DEFAULT_TARGET.clone()); break;
    case "pan_room": camCtl.flyTo(new THREE.Vector3(6, 3.5, 2), new THREE.Vector3(-1, 1.4, -1)); break;
    case "shake": break; // handled by Fx.shake
    default: break;
  }
}

// ---------- wire everything ----------
Audio.init();
initAbilities({ scene, camera, controls: camCtl.orbit, dorm, akuu, ui: UI, audio: Audio });
UI.init({ akuu, scene, renderer, camera, dorm });

const ctx = { dorm, akuu, audio: Audio, ui: UI, scene, camera, cameraFx };
Brain.setContext(ctx);
UI.onSend = (text) => Brain.send(text);

// ---------- custom character model (GLB / glTF / VRM / FBX / OBJ) ----------
let loadedModelUrl = "";
async function loadAkuuModel(url, isVRM, format) {
  loadedModelUrl = url || "";
  if (!url) { akuu.removeCustomModel(); return; }
  UI.toast("⏳ Loading model…");
  try {
    const warning = await akuu.loadCustomModel(url, isVRM, format);
    UI.toast("✅ Model loaded — that's Akuu now ♡");
    State.bus.emit("akuu:modelLoaded", akuu.custom);          // Studio re-applies tints
    if (warning) setTimeout(() => UI.toast(warning, 8000), 900);
  } catch (e) { console.error(e); UI.toast("⚠️ Couldn't load that model (" + (e.message || "error") + ")"); }
  finally { if (String(url).startsWith("blob:")) { try { URL.revokeObjectURL(url); } catch {} } }   // free dropped-file blobs
}
// Load Akuu's then Deku's model sequentially so the VRM library loads once (avoids
// a startup race where the second VRM sometimes failed to appear).
(async () => {
  if (State.settings.customModelUrl) await loadAkuuModel(State.settings.customModelUrl, State.settings.customModelIsVRM);
  if (State.settings.dekuModelUrl) await camCtl.loadDekuModel(State.settings.dekuModelUrl);
})();

// ---------- apartment map + Alice's autonomous life ----------
let env = null, life = null, navgrid = null;
(async () => {
  let collider = null;
  if (State.settings.environmentUrl) {
    try {
      UI.toast("⏳ Loading the apartment…");
      env = await loadEnvironment(State.settings.environmentUrl, scene, { scale: State.settings.environmentScale, yaw: State.settings.environmentYaw });
      dorm.hideRoom();
      if (dorm.sun) { const cc = dorm.sun.shadow.camera; cc.left = -16; cc.right = 16; cc.top = 16; cc.bottom = -16; cc.far = 46; cc.updateProjectionMatrix(); }
      const aSpawn = hotspotById(State, "aliceSpawn"); if (aSpawn) akuu.root.position.set(aSpawn.pos[0], 0, aSpawn.pos[2]);
      const pSpawn = hotspotById(State, "playerSpawn"); if (pSpawn) camCtl.dekuPos.set(pSpawn.pos[0], 0, pSpawn.pos[2]);
      camCtl.bx = (env.size.x / 2) - 0.4; camCtl.bz = (env.size.z / 2) - 0.4;   // walk bounds → apartment
      // reframe the overview camera for the apartment's size (dollhouse view)
      camCtl.defaultPos.set(env.size.x * 0.55, Math.max(6, env.size.y * 1.15), env.size.z * 0.7);
      camCtl.defaultTarget.set(0, 1, 0);
      camCtl.orbit.maxDistance = Math.max(14, env.size.x + env.size.z);
      if (camCtl.mode === "orbit") camCtl.flyTo(camCtl.defaultPos.clone(), camCtl.defaultTarget.clone());
      // mesh collision so Alice + player can't walk through walls/furniture (doors stay open)
      try {
        collider = await buildCollider(env.root);
        akuu.setCollider((from, to) => collider.resolve(from, to, 0.16));   // slim so she fits through doorways/gaps
        camCtl.setCollider((from, to) => collider.resolve(from, to, 0.20));
        if (window.CMF) window.CMF.collider = collider;
        // bake the A* nav grid so she routes through doorways like a person
        try {
          navgrid = new NavGrid(collider, env.bounds).bake();
          if (window.CMF) window.CMF.navgrid = navgrid;
          console.log(`[nav] grid ${navgrid.w}×${navgrid.h} baked in ${navgrid.bakedMs}ms, ${navgrid.edges.size} connected cells`);
        } catch (e) { console.error("nav bake failed", e); }
        UI.toast("🧱 collision on");
      } catch (e) { console.error("collider build failed", e); }
      UI.toast("🏠 home ♡");
    } catch (e) { console.error("environment load failed", e); UI.toast("⚠️ Map failed to load — staying in the dorm"); }
  }
  State.bus.emit("game:ready");   // the title screen can now offer "Enter"
  life = new Life({ akuu, camCtl, camera, ui: UI, brain: Brain, scene, audio: Audio,
    bounds: env?.bounds, pathfinder: navgrid, runAbility: (id, args) => runAbility(id, args, ctx) });
  ctx.life = life;
  if (window.CMF) window.CMF.life = life;

  // the living-relationship layer: milestones, rituals, longing, random events
  Events.init({ life, akuu, ui: UI, brain: Brain, camCtl, fx: (t) => runAbility("particle_effect", { type: t }, ctx) });
  Romance.init({ life, akuu, ui: UI, brain: Brain, camCtl, audio: Audio, dorm, events: Events,
    runAbility: (id, args) => runAbility(id, args, ctx), fx: (t) => runAbility("particle_effect", { type: t }, ctx) });
  ctx.events = Events; ctx.romance = Romance;
  if (window.CMF) { window.CMF.events = Events; window.CMF.romance = Romance; }

  // THE REALITY ENGINE — she writes live game code; anything becomes real
  Magic.init({ scene, camera, dorm, akuu, audio: Audio, camCtl, State, cameraFx, life,
    fxBurst: (type, at, count) => Fx.burst(type, at, count), shake: (s) => Fx.shake(s) });
  ctx.magic = Magic;
  if (window.CMF) window.CMF.magic = Magic;

  // SPATIAL MAP — read the real geometry so she knows exactly where everything is
  if (env) {
    ctx.env = env; ctx.collider = collider; ctx.navgrid = navgrid;
    Mapper.init({ scene, camera, renderer, camCtl, ui: UI, env, collider, navgrid, get life() { return ctx.life; } });
    ctx.mapper = Mapper;
    if (window.CMF) { window.CMF.env = env; window.CMF.Mapper = Mapper; }
  }
})();

// ---------- living-world extras ----------
Weather.init();
Voice.init();
Ambient.init({ audio: Audio });   // cozy pad + generative lofi + rain + footsteps
PhotoMode.init({ renderer, ui: UI });
Studio.init({ akuu, ui: UI });
Emotion.init({ akuu });
ctx.emotion = Emotion;
if (window.CMF) window.CMF.emotion = Emotion;
RAG.init({ ui: UI }).catch((e) => console.warn("RAG init failed", e));
ctx.rag = RAG;
Lifesim.init({ ui: UI, events: Events });
ctx.lifesim = Lifesim;
Phone.init({ brain: Brain, ui: UI, audio: Audio, akuu, lifesim: Lifesim, minigames: Minigames });
// opening the phone frees the mouse so you can use it (and never traps the cursor)
State.bus.on("phone:toggled", (open) => { if (open && camCtl.fp?.isLocked) camCtl.fp.unlock(); });
ctx.phone = Phone;
Build.init({ scene, camera, renderer, camCtl, lifesim: Lifesim, ui: UI, brain: Brain, akuu });
ctx.build = Build;
Story.init({ camCtl, camera, brain: Brain, ui: UI, magic: Magic, events: Events,
  get life() { return ctx.life; }, runAbility: (id, args) => runAbility(id, args, ctx) });
ctx.story = Story;
Minigames.init({ akuu, ui: UI, lifesim: Lifesim, brain: Brain, emotion: Emotion });
ctx.minigames = Minigames;
Mobile.init({ camCtl, renderer, ui: UI });
DevMode.init({ scene, camera, renderer, camCtl, akuu, dorm, ui: UI });
LiveVoice.init({ brain: Brain, audio: Audio, akuu, ui: UI });
Episodes.init({ brain: Brain, akuu, ui: UI });
Director.init({ akuu, camCtl, runAbility: (id, a) => runAbility(id, a, ctx) });
LiveFace.init({ akuu, emotion: Emotion });
OfflineLife.init({ phone: Phone, ui: UI });
Reflection.init({ brain: Brain, ui: UI, get magic() { return ctx.magic; }, get lifesim() { return ctx.lifesim; } });
ctx.reflection = Reflection;
HudMenu.init();   // gather the tool buttons behind one ☰ menu (observer catches late ones)
Icons.init();     // swap stock emoji for our custom icon set (chat kept as-is)
if (window.CMF) window.CMF.Icons = Icons;
ctx.mobile = Mobile;
// 🤫 whisper-mode toggle in the chat bar (soft slow quiet voice for intimate moments)
(() => {
  const bar = document.getElementById("chatBar"), input = document.getElementById("chatInput");
  if (!bar) return;
  const w = document.createElement("button");
  w.id = "whisperBtn"; w.textContent = "🤫"; w.title = "Whisper mode — soft, slow, quiet voice";
  w.classList.toggle("on", !!State.settings.whisperMode);
  w.onclick = () => { const on = !State.settings.whisperMode; State.set("whisperMode", on); w.classList.toggle("on", on); UI.toast(on ? "🤫 whisper mode" : "🔊 normal voice"); };
  bar.insertBefore(w, input || null);
})();
// affection changes auto-colour her mood (captures gifts/hugs/dates/milestones)
State.bus.on("meter:changed", ({ field, delta }) => { if (field === "affection" && delta) Emotion.nudge(delta * 2.2, Math.abs(delta)); });

// desktop notification permission (first user gesture, once)
addEventListener("pointerdown", function askNotif() {
  removeEventListener("pointerdown", askNotif);
  try { if (State.settings.notificationsEnabled && "Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch {}
}, { once: true });

// outfit swap → a VRoid outfit variant becomes her body (map them in Admin → Appearance)
State.bus.on("outfit:swap", (url) => { if (url) loadAkuuModel(url, /\.vrm(\?|$)/i.test(url)); });

// click/tap Alice → she reacts (not in first-person pointer-lock, not while placing hotspots)
const pokeRay = new THREE.Raycaster();
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (camCtl.mode === "first" || document.body.classList.contains("photomode") || State.world.building) return;
  if (!akuu?.root || !life) return;
  const r = renderer.domElement.getBoundingClientRect();
  pokeRay.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
  const hits = pokeRay.intersectObject(akuu.root, true);
  if (hits.length && hits[0].distance < 14) life.poked();
});

// drag & drop a local model file onto the window to try it instantly
addEventListener("dragover", (e) => { e.preventDefault(); });
addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0]; if (!f) return;
  const m = f.name.match(/\.(glb|gltf|vrm|fbx|obj)$/i);
  if (!m) { UI.toast("Drop a .glb, .gltf, .vrm, .fbx, or .obj file"); return; }
  loadAkuuModel(URL.createObjectURL(f), /\.vrm$/i.test(f.name), m[1].toLowerCase());
});

// reminders that fire → let Akuu react
State.bus.on("reminder:fired", (text) => Brain.send(`(your reminder just went off: "${text}")`, {}));

// ---------- live settings application (admin panel + in-game) ----------
function applySetting(key, value) {
  if (key === "*") { // full reload
    akuu.settings = State.settings; if (!akuu.custom) akuu.rebuildAppearance();
    dorm.setTime(State.settings.timeOfDay); dorm.setWeather(State.settings.weather);
    dorm.setTheme(State.settings.roomTheme); dorm.setRGB(State.settings.rgbLights);
    if ((State.settings.customModelUrl || "") !== loadedModelUrl) loadAkuuModel(State.settings.customModelUrl, State.settings.customModelIsVRM);
    UI.updateHUD(); return;
  }
  if (key === "customModelUrl") loadAkuuModel(value, State.settings.customModelIsVRM);
  else if (key === "dekuModelUrl") camCtl.loadDekuModel(value);
  else if (key.startsWith("appearance")) { if (!akuu.custom) akuu.rebuildAppearance(); }
  else if (key === "timeOfDay") { State.world.timeOfDay = value; dorm.setTime(value); }
  else if (key === "weather") dorm.setWeather(value);
  else if (key === "roomTheme") dorm.setTheme(value);
  else if (key === "rgbLights") dorm.setRGB(value);
  else if (key === "musicVolume") Audio.setMusicVolume(value);
  else if (key === "musicEnabled") value ? Audio.startMusic() : Audio.stopMusic();
  else if (key === "proactiveMessages") value ? Brain.startProactive() : Brain.stopProactive();
  UI.updateHUD();
}
State.bus.on("settings:changed", ({ key, value }) => applySetting(key, value));

// cross-tab sync with the Admin panel
const channel = new BroadcastChannel("catchmefirst");
channel.onmessage = (e) => {
  if (e.data?.type === "settings-updated") {
    State.reloadFromDisk();     // reload from localStorage (no boot side-effects)
    applySetting("*");
  } else if (e.data?.type === "command") {
    handleAdminCommand(e.data.cmd, e.data.arg);
  }
};
// broadcast live meters so admin can watch
setInterval(() => channel.postMessage({ type: "live", world: State.world, settings: { affection: State.settings.affection, trust: State.settings.trust } }), 1500);
// stream Akuu's actions to the admin event log
State.bus.on("event:logged", (e) => channel.postMessage({ type: "event", e }));

function handleAdminCommand(cmd, arg) {
  switch (cmd) {
    case "say": Brain.send(`(Deku isn't speaking — the game master instructs you to say/do this now: ${arg})`, {}); break;
    case "forceExpression": akuu.setExpression(arg); break;
    case "forceGesture": akuu.gesture(arg); break;
    case "teleport": { const s = { desk: [2.6,-2.2], bed: [3.2,-2.0], window: [-3.2,1.2], center: [0.5,0] }[arg] || [0.5,0]; akuu.moveTo(s[0], 0, s[1]); break; }
    case "runAbility": try { const a = JSON.parse(arg); Brain.ctx && importRun(a.id, a.args); } catch {} break;
    case "resetCamera": cameraFx("zoom_out"); break;
    case "clearObjects": Fx.clearSpawned(); break;
    case "freeze": /* handled via settings */ break;
  }
}
async function importRun(id, args) { const { runAbility } = await import("./abilities.js"); runAbility(id, args, ctx); }

// ---------- quick in-game settings (⚙️) ----------
setupQuickSettings();
function setupQuickSettings() {
  const btn = document.getElementById("gearBtn");
  const modal = document.getElementById("quickSettings");
  if (!btn) return;
  btn.onclick = () => { modal.classList.toggle("open"); buildQuick(); };
  document.getElementById("quickClose").onclick = () => modal.classList.remove("open");
  function buildQuick() {
    document.getElementById("qsKey").value = (State.settings.groqKeys && State.settings.groqKeys[0]) || State.settings.groqApiKey || "";
    document.getElementById("qsModel").value = State.settings.model;
  }
  document.getElementById("qsSave").onclick = () => {
    const key = document.getElementById("qsKey").value.trim();
    if (key) {
      State.set("groqApiKey", key);
      const arr = State.get("groqKeys") || [];
      if (!arr.includes(key)) { arr.unshift(key); State.set("groqKeys", arr); }
    }
    State.set("model", document.getElementById("qsModel").value);
    UI.toast("Saved ♡ Akuu is ready.");
    modal.classList.remove("open");
    channel.postMessage({ type: "settings-updated" });
  };
}

// ---------- Prompt Studio (author the whole system prompt + filters in-game) ----------
setupPromptStudio();
function setupPromptStudio() {
  const btn = document.getElementById("promptBtn");
  const modal = document.getElementById("promptStudio");
  if (!btn || !modal) return;
  const promptTA = document.getElementById("psPrompt");
  const filterSel = document.getElementById("psFilterSel");
  const filterTA = document.getElementById("psFilterText");
  const tokRow = document.getElementById("psTokens");
  let workingFilters = {};

  PROMPT_TOKENS.forEach((t) => {
    const c = document.createElement("button");
    c.className = "tok"; c.textContent = t;
    c.onclick = () => insertAtCursor(promptTA, t);
    tokRow.appendChild(c);
  });

  const loadFilterText = () => {
    const k = filterSel.value;
    filterTA.value = k === "Off" ? "" : (workingFilters[k] || "");
    filterTA.disabled = k === "Off";
  };
  const refreshFilterOptions = (selected) => {
    filterSel.innerHTML = "";
    ["Off", ...Object.keys(workingFilters)].forEach((k) => {
      const o = document.createElement("option"); o.value = k; o.textContent = k;
      if (k === selected) o.selected = true; filterSel.appendChild(o);
    });
    loadFilterText();
  };

  btn.onclick = () => {
    workingFilters = { ...(State.settings.filters || {}) };
    promptTA.value = State.settings.customSystemPrompt || "";
    document.querySelectorAll('input[name="pMode"]').forEach((r) => (r.checked = r.value === State.settings.promptMode));
    refreshFilterOptions(State.settings.filterLevel);
    modal.classList.add("open");
  };
  document.getElementById("psClose").onclick = () => modal.classList.remove("open");
  filterSel.onchange = loadFilterText;
  filterTA.oninput = () => { const k = filterSel.value; if (k !== "Off") workingFilters[k] = filterTA.value; };
  document.getElementById("psFilterAdd").onclick = () => {
    const name = (window.prompt("Name this filter level (e.g. 'Sweet', 'Mature'):") || "").trim();
    if (!name) return; workingFilters[name] = ""; refreshFilterOptions(name);
  };
  document.getElementById("psFilterDel").onclick = () => {
    const k = filterSel.value; if (k === "Off") return; delete workingFilters[k]; refreshFilterOptions("Off");
  };
  document.getElementById("psSave").onclick = () => {
    const mode = document.querySelector('input[name="pMode"]:checked')?.value || "auto";
    State.settings.filters = workingFilters;
    State.set("promptMode", mode);
    State.set("customSystemPrompt", promptTA.value);
    State.set("filterLevel", filterSel.value);
    UI.toast(mode === "custom" ? "Saved — Akuu now runs on YOUR prompt ♡" : "Saved ♡");
    modal.classList.remove("open");
    channel.postMessage({ type: "settings-updated" });
  };
}
function insertAtCursor(ta, text) {
  const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.focus(); ta.selectionStart = ta.selectionEnd = s + text.length;
}

// ---------- Hotspot Editor (place where Alice goes, on the real apartment) ----------
setupHotspotEditor();
function setupHotspotEditor() {
  const btn = document.getElementById("hotspotBtn");
  const panel = document.getElementById("hotspotEditor");
  if (!btn || !panel) return;
  const sel = document.getElementById("heSelect"), rot = document.getElementById("heRot"), radius = document.getElementById("heRadius");
  const label = document.getElementById("heLabel"), actions = document.getElementById("heActions"), posEl = document.getElementById("hePos"), placeBtn = document.getElementById("hePlace");
  let placeMode = false, cur = null;
  const raycaster = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hs = () => State.settings.hotspots || [];
  const rebuild = () => { State.save(); if (life?.markers) { life.scene.remove(life.markers); life.markers = null; } };

  const fill = () => { sel.innerHTML = ""; hs().forEach((h, i) => { const o = document.createElement("option"); o.value = i; o.textContent = `${h.label} (${h.id})`; sel.appendChild(o); }); };
  const load = (i) => { cur = hs()[i]; if (!cur) return; rot.value = cur.rot || 0; radius.value = cur.radius || 0.6; label.value = cur.label || ""; actions.value = (cur.actions || []).join(", "); posEl.textContent = `x ${cur.pos[0].toFixed(2)}   z ${cur.pos[2].toFixed(2)}`; };

  btn.onclick = () => { panel.classList.toggle("open"); if (panel.classList.contains("open")) { State.set("showHotspots", true); fill(); load(0); } };
  document.getElementById("heClose").onclick = () => { panel.classList.remove("open"); placeMode = false; placeBtn.textContent = "📍 Place mode: OFF"; };
  sel.onchange = () => load(+sel.value);
  rot.oninput = () => { if (cur) { cur.rot = +rot.value; rebuild(); } };
  radius.oninput = () => { if (cur) { cur.radius = +radius.value; rebuild(); } };
  label.oninput = () => { if (cur) cur.label = label.value; };
  actions.oninput = () => { if (cur) cur.actions = actions.value.split(",").map((s) => s.trim()).filter(Boolean); };
  placeBtn.onclick = () => { placeMode = !placeMode; placeBtn.textContent = "📍 Place mode: " + (placeMode ? "ON — click floor" : "OFF"); };
  document.getElementById("heGoto").onclick = () => { if (cur && life) life.goTo(cur.id); };
  document.getElementById("heAdd").onclick = () => { hs().push({ id: "spot" + Date.now().toString(36).slice(-4), label: "New spot", pos: [0, 0, 0], rot: 0, radius: 0.6, actions: ["idle"] }); fill(); sel.value = hs().length - 1; load(hs().length - 1); rebuild(); };
  document.getElementById("heDel").onclick = () => { hs().splice(+sel.value, 1); fill(); load(0); rebuild(); };
  document.getElementById("heSave").onclick = () => { State.set("hotspots", hs()); UI.toast("Hotspots saved ♡"); channel.postMessage({ type: "settings-updated" }); };

  renderer.domElement.addEventListener("click", (e) => {
    if (!placeMode || !cur) return;
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, camera);
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(floor, pt)) { cur.pos = [pt.x, 0, pt.z]; posEl.textContent = `x ${pt.x.toFixed(2)}   z ${pt.z.toFixed(2)}`; rebuild(); }
  });
}

// press "t" to open/focus the chat (like classic games)
addEventListener("keydown", (e) => {
  if ((e.key === "t" || e.key === "T") && !e.metaKey && !e.ctrlKey) {
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    if (document.querySelector("#promptStudio.open, #quickSettings.open")) return;
    e.preventDefault();
    if (camCtl.fp?.isLocked) camCtl.fp.unlock();   // free the cursor so you can type
    const input = document.getElementById("chatInput");
    if (input) { input.focus(); }
  }
});

// After sending in first-person, resume mouse-look (re-lock the pointer). The send
// runs inside the Enter keydown / button click, so this counts as a user gesture.
State.bus.on("chat:sent", () => {
  if (camCtl.mode !== "first") return;
  document.getElementById("chatInput")?.blur();
  // request lock directly so we can swallow the async rejection browsers throw when
  // there's no user gesture / wrong document (PointerLockControls.lock() ignores it).
  try { const p = (camCtl.fp.domElement || renderer.domElement)?.requestPointerLock?.(); if (p?.catch) p.catch(() => {}); } catch {}
});

// Esc always frees the mouse and leaves the chat — never trap the cursor.
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  document.getElementById("chatInput")?.blur();
  if (camCtl.fp?.isLocked) camCtl.fp.unlock();
}, true);

// start audio on first interaction (autoplay policy)
const kick = () => { Audio.resume(); if (State.settings.musicEnabled) Audio.startMusic(); window.removeEventListener("pointerdown", kick); window.removeEventListener("keydown", kick); };
window.addEventListener("pointerdown", kick);
window.addEventListener("keydown", kick);

if (State.settings.proactiveMessages) Brain.startProactive();

// ---------- global safety net: a stray error never silently breaks the session ----------
let _errCount = 0;
addEventListener("error", (e) => {
  console.error("[global]", e.error || e.message);
  if (_errCount++ < 3) try { UI.systemLine("⚠️ small hiccup (kept going): " + String(e.message || "").slice(0, 70)); } catch {}
});
addEventListener("unhandledrejection", (e) => {
  console.error("[unhandled]", e.reason);
  if (_errCount++ < 3) try { UI.systemLine("⚠️ " + String(e.reason?.message || e.reason || "async hiccup").slice(0, 70)); } catch {}
});

// ---------- first-run welcome (controls + how to wake her up) ----------
(function maybeOnboard() {
  if (State.settings._onboarded) return;
  const hasKey = (State.settings.groqKeys?.length || State.settings.geminiKeys?.length || State.settings.groqApiKey);
  const o = document.createElement("div");
  o.id = "onboard";
  o.innerHTML = `<div class="ob-card">
    <h2>Catch Me First <span>♡</span></h2>
    <p>You share an apartment with <b>Alice</b> — an anime AI who lives her own life. She cooks, naps, wanders the rooms, and reacts to you in real time.</p>
    <div class="ob-grid">
      <div><kbd>T</kbd> talk to her</div><div><kbd>C</kbd> switch camera (overview · 1st · 3rd person)</div>
      <div><kbd>WASD</kbd> walk around (1st/3rd person)</div><div><b>❤</b> button (near her) — hug, gift, dance…</div>
      <div><kbd>P</kbd> or 📸 — cinema photo mode</div><div>🎤 in the chat bar — talk with your voice</div>
      <div>📊 her needs & mood</div><div>📔 her diary & the story of you two</div>
    </div>
    <p class="ob-tip">✨ Tell her <i>anything</i> — “make it snow indoors”, “a car crashes into the house”, “build me a fort” — and she writes the code to make it real, live.</p>
    ${hasKey ? "" : `<p class="ob-warn">⚠️ To wake her up, add a <b>free</b> Groq API key in ⚙️ (get one at console.groq.com/keys).</p>`}
    <button id="obGo">Move in →</button>
  </div>`;
  document.body.appendChild(o);
  document.getElementById("obGo").onclick = () => { o.remove(); State.set("_onboarded", true); try { Audio.resume(); if (State.settings.musicEnabled) Audio.startMusic(); } catch {} };
})();

// ---------- ✦ cinematic title / loading screen ----------
(function titleScreen() {
  const t = document.getElementById("titleScreen");
  if (!t) return;
  let ready = false, entered = false;
  const reveal = () => { if (!ready) { ready = true; t.classList.add("ready"); } };
  State.bus.on("game:ready", reveal);
  setTimeout(reveal, 12000);   // fallback so "Enter" always appears, even on a slow/failed load
  const enter = () => {
    if (entered || !ready) return;
    entered = true;
    t.classList.add("gone");
    setTimeout(() => t.remove(), 950);
    try { Audio.resume(); if (State.settings.musicEnabled) Audio.startMusic(); } catch {}   // Enter = a user gesture → audio can start
    State.bus.emit("game:started");
  };
  document.getElementById("tsEnter").onclick = enter;
  addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && ready && !entered && document.getElementById("titleScreen")) { e.preventDefault(); enter(); }
  });
})();

// ---------- resize ----------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  PostFX.setSize(innerWidth, innerHeight);
});

// ---------- game loop ----------
const clock = new THREE.Clock();
let fpsT = 0, fpsN = 0, _stepT = 0;
// run a subsystem step isolated: one throwing system (esp. LLM-authored Magic code)
// must never freeze the render loop. Warn once per system, then keep going.
const _loopWarned = {};
function step(fn, thisArg, dt, label, extra) {
  try { fn.call(thisArg, dt, extra); }
  catch (e) { if (!_loopWarned[label]) { _loopWarned[label] = 1; console.error(`[loop:${label}]`, e); } }
}
let _devLastFrame = 0;
function loop() {
  // Dev Mode FPS cap (optional throttle)
  const _cap = DevMode._fpsCap;
  if (_cap) { const now = performance.now(); if (now - _devLastFrame < 1000 / _cap - 1) { requestAnimationFrame(loop); return; } _devLastFrame = now; }
  const dt = Math.min(clock.getDelta(), 0.05);

  // auto time-of-day (slow)
  if (State.settings.autoTime) {
    State.world.timeOfDay = (State.world.timeOfDay + dt * 0.02) % 24; // ~ full day / 20min
    if (Math.floor(State.world.timeOfDay * 60) % 6 === 0) dorm.setTime(State.world.timeOfDay);
  }

  step(dorm.update, dorm, dt, "dorm");
  if (life) step(life.update, life, dt, "life");
  if (Events.refs) step(Events.update, Events, dt, "events");
  if (Reflection.refs) step(Reflection.update, Reflection, dt, "reflection");
  if (Magic.refs) step(Magic.update, Magic, dt, "magic");
  if (Emotion.refs) step(Emotion.update, Emotion, dt, "emotion");
  step(akuu.update, akuu, dt, "akuu", camera);
  step(updateFx, null, dt, "fx");
  step(camCtl.update, camCtl, dt, "cam");
  if (DevMode.on) step(DevMode.update, DevMode, dt, "dev");
  step(Atmosphere.update, Atmosphere, dt, "atmo");
  // soft footsteps as she walks
  if (akuu?.isWalking?.() && akuu._movedThisFrame !== false) { _stepT += dt; if (_stepT > 0.42) { _stepT = 0; Ambient.footstep(); } } else _stepT = 0.42;
  PostFX.setTime(State.world.timeOfDay);
  PostFX.render(dt);

  // fps + hud time
  fpsT += dt; fpsN++;
  if (fpsT > 0.5) { State.world.fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0;
    UI.updateHUD();
    const fpsEl = document.getElementById("fps"); if (fpsEl) { fpsEl.style.display = State.settings.showFPS ? "block" : "none"; fpsEl.textContent = State.world.fps + " fps"; }
    autoTune(State.world.fps);
  }
  requestAnimationFrame(loop);
}
// weak-GPU rescue: two VRMs + a 70MB apartment is heavy. If fps stays low, drop the
// pixel ratio and shadows once (biggest wins) so it stays playable.
let _lowFrames = 0, _tuned = 0;
function autoTune(fps) {
  if (_tuned >= 3 || !fps) return;
  if (fps < 34) {
    if (++_lowFrames >= 6) {
      if (_tuned === 0) { PostFX.toggle(false); UI.toast("⚙️ tuned graphics for smoother play"); }
      else if (_tuned === 1) { renderer.setPixelRatio(1); }
      else { renderer.shadowMap.enabled = false; renderer.shadowMap.needsUpdate = true; scene.traverse((o) => { if (o.isMesh && o.material) o.material.needsUpdate = true; }); }
      _tuned++; _lowFrames = 0;
    }
  } else if (fps >= 44) _lowFrames = 0;
}
loop();

// camera-mode UI buttons
document.querySelectorAll("[data-cammode]").forEach((b) =>
  b.addEventListener("click", () => camCtl.setMode(b.dataset.cammode)));

// expose for debugging / admin console
window.CMF = { State, dorm, akuu, Brain, UI, Audio, ctx, cameraFx, camera, controls: camCtl.orbit, camCtl, scene, Emotion, Studio, RAG, Lifesim, Phone, Build, Story, Minigames, Mobile, PostFX, Atmosphere, Ambient, Icons, DevMode, LiveVoice, Episodes, Director, LiveFace, OfflineLife };
console.log("%cCatch Me First ♡", "font-size:20px;color:#ff6ba6", "— Akuu is awake. Set your Groq key in ⚙️.");
