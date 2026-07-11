// ============================================================================
//  CATCH ME FIRST — admin.js
//  The super admin panel. Manage Akuu however you want. Live-syncs to the game
//  via localStorage + BroadcastChannel. 60+ controls across 11 sections.
// ============================================================================

import { State } from "./state.js";
import { DEFAULT_SETTINGS, PERSONALITY_PRESETS, GROQ_MODELS, GEMINI_MODELS, buildSystemPrompt, fmtTime } from "./config.js";
import { ABILITIES, ABILITY_CATEGORIES } from "./abilities.js";

State.load();
const channel = new BroadcastChannel("catchmefirst");
const broadcast = () => channel.postMessage({ type: "settings-updated" });
const command = (cmd, arg) => channel.postMessage({ type: "command", cmd, arg });

// ---------------- tiny DOM helpers ----------------
const el = (tag, props = {}, kids = []) => {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  });
  (Array.isArray(kids) ? kids : [kids]).forEach((k) => k && e.appendChild(typeof k === "string" ? document.createTextNode(k) : k));
  return e;
};

function row(label, control, hint) {
  return el("div", { class: "row" }, [
    el("div", { class: "row-label" }, [label, hint ? el("span", { class: "hint", html: hint }) : null]),
    el("div", { class: "row-control" }, [control]),
  ]);
}

// bound controls
function slider(path, min, max, step, fmt) {
  const val = getP(path);
  const out = el("output", {}, [fmt ? fmt(val) : String(val)]);
  const input = el("input", { type: "range", min, max, step, value: val,
    oninput: (e) => { const v = parseFloat(e.target.value); setP(path, v); out.textContent = fmt ? fmt(v) : String(v); } });
  return el("div", { class: "slider" }, [input, out]);
}
function toggle(path, onLabel = "ON", offLabel = "OFF") {
  const wrap = el("label", { class: "switch" });
  const input = el("input", { type: "checkbox" });
  input.checked = !!getP(path);
  const knob = el("span", { class: "knob" });
  input.addEventListener("change", () => setP(path, input.checked));
  wrap.append(input, knob);
  return wrap;
}
function textInput(path, placeholder = "", type = "text") {
  return el("input", { class: "txt", type, value: getP(path) ?? "", placeholder,
    oninput: (e) => setP(path, e.target.value) });
}
function selectInput(path, options) {
  const s = el("select", { class: "txt", onchange: (e) => setP(path, e.target.value) });
  options.forEach((o) => { const opt = el("option", { value: o.value ?? o }, [o.label ?? o]); if ((o.value ?? o) === getP(path)) opt.selected = true; s.appendChild(opt); });
  return s;
}
function colorInput(path) {
  const c = el("input", { type: "color", class: "color", value: getP(path) || "#ffffff", oninput: (e) => setP(path, e.target.value) });
  return c;
}
function textarea(path, placeholder = "", rows = 5) {
  return el("textarea", { class: "txt area", rows, placeholder, oninput: (e) => setP(path, e.target.value) }, [getP(path) ?? ""]);
}
function btn(label, cls, onClick) { return el("button", { class: "btn " + (cls || ""), onclick: onClick }, [label]); }
function keysArea(path) {
  const ta = el("textarea", { class: "txt area", rows: 4, spellcheck: "false", placeholder: "one key per line…", oninput: (e) => {
    State.settings[path] = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
    State.save(); broadcast();
  } });
  ta.value = (getP(path) || []).join("\n");
  return ta;
}
async function testAllKeys() {
  const out = document.getElementById("keyTestResult");
  out.textContent = " testing…";
  const groq = State.settings.groqKeys || [], gem = State.settings.geminiKeys || [];
  let gOk = 0, gemOk = 0;
  for (const k of groq) { try { const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + k }, body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "user", content: "hi" }], max_tokens: 1 }) }); if (r.ok) gOk++; } catch {} }
  for (const k of gem) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${k}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } }) }); if (r.ok) gemOk++; } catch {} }
  out.textContent = ` Groq ${gOk}/${groq.length} working · Gemini ${gemOk}/${gem.length} working`;
}

// path get/set on State.settings (with save + broadcast)
function getP(path) { return path.split(".").reduce((o, k) => (o ? o[k] : undefined), State.settings); }
function setP(path, val) { State.set(path, val); broadcast(); refreshSystemPrompt(); refreshHeader(); }

// ============================================================================
//  SECTIONS
// ============================================================================
const sections = {};

// ---- 1. BRAIN ----
sections.brain = () => panel("🧠 Brain & API", [
  card("AI Provider", [
    row("Provider", selectInput("provider", [{ value: "groq", label: "Groq — fast, generous free tier" }, { value: "gemini", label: "Google Gemini — big free tier (needs quota)" }, { value: "ollama", label: "Ollama — local, unlimited, private" }]), "Which service powers Akuu"),
    row("Ollama URL", textInput("ollamaUrl", "http://localhost:11434"), "used when provider = Ollama"),
    row("Ollama Model", textInput("ollamaModel", "llama3.1"), "e.g. llama3.1, qwen2.5, mistral"),
    row("Groq Model", selectInput("model", GROQ_MODELS.map((m) => ({ value: m.id, label: m.label }))), "Used when provider = Groq"),
    row("Gemini Model", selectInput("geminiModel", GEMINI_MODELS.map((m) => ({ value: m.id, label: m.label }))), "Used when provider = Gemini"),
    row("Temperature", slider("temperature", 0, 2, 0.05, (v) => v.toFixed(2)), "Higher = more creative/chaotic"),
    row("Max Tokens", slider("maxTokens", 100, 4000, 50), "Longest reply length"),
    row("Top P", slider("topP", 0.1, 1, 0.05, (v) => v.toFixed(2))),
  ]),
  card("API Keys — auto-rotated to dodge rate limits", [
    el("p", { class: "muted" }, ["One key per line. The game rotates through them, so more keys = more headroom before you hit a limit. Free Groq keys: console.groq.com/keys · Gemini: aistudio.google.com/apikey"]),
    row("Groq Keys", keysArea("groqKeys"), "one per line"),
    row("Gemini Keys", keysArea("geminiKeys"), "one per line"),
    el("div", { class: "inline" }, [btn("🔌 Test all keys", "sm", testAllKeys), el("span", { id: "keyTestResult", class: "muted" }, [""])]),
  ]),
  card("Identity", [
    row("AI Name", textInput("aiName", "Akuu")),
    row("Your Name", textInput("playerName", "Deku")),
    row("Pronouns", textInput("pronouns", "she/her")),
    row("Language", selectInput("language", ["English","Japanese","Spanish","French","German","Turkish","Russian","Arabic","Korean","Chinese"])),
  ]),
  card("System Prompt", [
    el("p", { class: "muted" }, ["This is Akuu's live mind, rebuilt from every setting. Add your own directives below — they override everything."]),
    row("Custom Directives", textarea("customPrompt", "e.g. 'You secretly love astronomy and bring it up often.'", 4)),
    el("div", { class: "sp-preview-wrap" }, [
      el("div", { class: "sp-head" }, ["🔍 Live System Prompt Preview", btn("Copy", "sm", () => { navigator.clipboard.writeText(buildSystemPrompt(State.settings, State.world)); toast("Copied"); })]),
      el("pre", { id: "spPreview", class: "sp-preview" }),
    ]),
  ]),
]);

// ---- 2. PERSONALITY ----
const P_KEYS = ["warmth","playfulness","sass","clinginess","intelligence","humor","confidence","shyness","chaos"];
sections.personality = () => panel("🎭 Personality", [
  card("Presets", [
    row("Load Preset", selectInput("personalityPreset", Object.keys(PERSONALITY_PRESETS)), "Applies a full personality"),
    btn("Apply Preset ✦", "primary", () => {
      const preset = PERSONALITY_PRESETS[State.settings.personalityPreset];
      if (preset) { State.settings.personality = { ...preset }; State.save(); broadcast(); rebuild("personality"); toast("Personality applied"); }
    }),
    btn("🎲 Randomize", "", () => { P_KEYS.forEach((k) => State.settings.personality[k] = Math.floor(Math.random()*101)); State.save(); broadcast(); rebuild("personality"); }),
  ]),
  card("Fine Dials (0–100)", P_KEYS.map((k) =>
    row(cap(k), slider("personality." + k, 0, 100, 1), personalityHint(k))
  )),
]);

// ---- 3. RELATIONSHIP ----
sections.relationship = () => panel("💞 Relationship", [
  card("Bond Meters", [
    row("Affection", slider("affection", 0, 100, 1, (v) => v + " ♡"), "How much she likes Deku"),
    row("Trust", slider("trust", 0, 100, 1)),
    row("Stage Label", textInput("relationshipStage", "New Roommates"), "Free-text relationship status"),
  ]),
  card("Quick Set", [
    el("div", { class: "chip-row" }, ["Strangers","New Roommates","Friends","Close Friends","Crushing","Dating","In Love"].map((s) =>
      chip(s, () => { State.set("relationshipStage", s); broadcast(); toast("Stage → " + s); }))),
  ]),
]);

// ---- 4. APPEARANCE ----
sections.appearance = () => panel("🌸 Appearance", [
  card("Akuu's Look", [
    row("Hair Color", colorInput("appearance.hairColor")),
    row("Hair Style", selectInput("appearance.hairStyle", ["twin-tails","long","bob","ponytail"])),
    row("Eye Color", colorInput("appearance.eyeColor")),
    row("Outfit", selectInput("appearance.outfit", ["casual","hoodie","uniform","pajamas","dress"])),
    row("Accent Color", colorInput("appearance.accentColor"), "Her aura / ribbon / UI color"),
    row("Skin Tone", colorInput("appearance.skinTone")),
    row("Height", slider("appearance.height", 0.8, 1.25, 0.01, (v) => v.toFixed(2) + "×")),
  ]),
  card("Presets", [
    el("div", { class: "chip-row" }, [
      chip("🌸 Sakura", () => setLook({ hairColor:"#ff9ec4", eyeColor:"#ff5f8f", hairStyle:"twin-tails", outfit:"dress", accentColor:"#ff6ba6" })),
      chip("❄️ Winter", () => setLook({ hairColor:"#bcd8ff", eyeColor:"#7dd3fc", hairStyle:"long", outfit:"hoodie", accentColor:"#38bdf8" })),
      chip("🖤 Gothic", () => setLook({ hairColor:"#2a2233", eyeColor:"#a855f7", hairStyle:"long", outfit:"dress", accentColor:"#8b5cf6" })),
      chip("☀️ Sunny", () => setLook({ hairColor:"#ffd166", eyeColor:"#f59e0b", hairStyle:"ponytail", outfit:"casual", accentColor:"#ff9e6b" })),
      chip("🎓 Student", () => setLook({ hairColor:"#5a3a24", eyeColor:"#7a4a2a", hairStyle:"bob", outfit:"uniform", accentColor:"#e11d48" })),
    ]),
  ]),
  modelCard(),
]);
function modelCard() {
  const urlIn = el("input", { class: "txt", placeholder: "https://…/model.glb  (or .gltf / .vrm)", value: State.settings.customModelUrl || "" });
  const vrmWrap = el("label", { class: "switch" }); const vi = el("input", { type: "checkbox" }); vi.checked = !!State.settings.customModelIsVRM; vrmWrap.append(vi, el("span", { class: "knob" }));
  return card("Custom 3D Model — become a Sketchfab GLB or VRM", [
    el("p", { class: "muted" }, ["Paste a direct link to a .glb/.gltf/.vrm file — it replaces Akuu's body in the live game (auto-scaled to fit). VRM avatars also get expressions + lip-sync. You can also just drag a model file onto the game window. See the README for how to get a working link from Sketchfab."]),
    row("Model URL", urlIn),
    row("VRM avatar?", vrmWrap, "turn on for .vrm files"),
    el("div", { class: "chip-row" }, [
      btn("✨ Apply Model", "primary", () => { State.set("customModelIsVRM", vi.checked); State.set("customModelUrl", urlIn.value.trim()); broadcast(); toast("Loading model in the game…"); }),
      btn("↩ Reset to built-in Akuu", "", () => { urlIn.value = ""; State.set("customModelUrl", ""); broadcast(); toast("Reverted to built-in Akuu"); }),
    ]),
    row("Outfit VRM variants", outfitsArea(), "one per line: outfitName = assets/models/alice-pajamas.vrm"),
    el("p", { class: "muted" }, ["Make outfit variants of her in VRoid Studio, export each as a VRM into assets/models/, and map them here — when she (or you) changes outfit, her whole model swaps. ✨"]),
  ]);
}
function outfitsArea() {
  const ta = el("textarea", { class: "txt area", rows: 3, spellcheck: "false", placeholder: "pajamas = assets/models/alice-pajamas.vrm", oninput: (e) => {
    const map = {};
    e.target.value.split("\n").forEach((l) => { const m = l.split("="); if (m.length === 2 && m[0].trim() && m[1].trim()) map[m[0].trim()] = m[1].trim(); });
    State.settings.outfitVRMs = map; State.save(); broadcast();
  } });
  ta.value = Object.entries(State.settings.outfitVRMs || {}).map(([k, v]) => `${k} = ${v}`).join("\n");
  return ta;
}
function setLook(o) { Object.entries(o).forEach(([k, v]) => State.settings.appearance[k] = v); State.save(); broadcast(); rebuild("appearance"); toast("Look applied ♡"); }

// ---- 5. WORLD ----
sections.world = () => panel("🏠 World & Room", [
  card("Time & Sky", [
    row("Time of Day", slider("timeOfDay", 0, 24, 0.5, (v) => fmtTime(v)), "Sky + lighting follow this"),
    row("Auto-advance Time", toggle("autoTime")),
    row("Weather", selectInput("weather", ["clear","rain","snow","storm","sunset","night"])),
  ]),
  card("Room", [
    row("Theme", selectInput("roomTheme", ["cozy","neon","minimalist","sakura","winter","halloween"])),
    row("RGB Lights", toggle("rgbLights")),
  ]),
  card("Lighting Presets (push to game)", [
    el("div", { class: "chip-row" }, ["bright","cozy","movie","romantic","focus","party","sleep"].map((m) =>
      chip(m, () => command("runAbility", JSON.stringify({ id: "set_lighting", args: { mood: m } })))),
    ),
  ]),
  card("Map / Environment", [
    row("Environment URL", textInput("environmentUrl", "assets/models/apartment/source/appartement.glb"), "GLB map; empty = built-in dorm"),
    row("Scale (0 = auto)", slider("environmentScale", 0, 40, 0.5)),
    row("Yaw", slider("environmentYaw", -3.14, 3.14, 0.05, (v) => v.toFixed(2))),
    el("div", { class: "chip-row" }, [
      chip("↩ Reset to dorm", () => { State.set("environmentUrl", ""); broadcast(); toast("Set to dorm — reload the game"); }),
      chip("🔄 Reload map", () => { broadcast(); toast("Reload the game to apply"); }),
    ]),
    el("p", { class: "muted" }, ["Changing the map needs a game reload. Place Alice's hotspots with the in-game 🧭 editor."]),
  ]),
  card("Alice's Autonomy — her own life", [
    row("Autonomy (lives on her own)", toggle("autonomy")),
    row("Restlessness", slider("autonomyIntensity", 0, 100, 5), "how active/roaming she is"),
    row("Idle chatter", toggle("idleChatter"), "occasional short self-talk"),
    row("Show hotspot markers", toggle("showHotspots")),
  ]),
]);

// ---- 6. VOICE & AUDIO ----
sections.audio = () => panel("🔊 Voice & Audio", [
  card("Text-to-Speech (Akuu's voice)", [
    row("Enable TTS", toggle("ttsEnabled")),
    row("Voice", voiceSelect(), "Browser voices (varies by device)"),
    row("Pitch", slider("ttsPitch", 0, 2, 0.05, (v) => v.toFixed(2))),
    row("Rate", slider("ttsRate", 0.5, 1.6, 0.05, (v) => v.toFixed(2))),
    btn("🔈 Test voice", "sm", () => testVoice()),
  ]),
  card("Sound & Music", [
    row("Sound Effects", toggle("sfxEnabled")),
    row("Background Music", toggle("musicEnabled")),
    row("Music Volume", slider("musicVolume", 0, 1, 0.05, (v) => Math.round(v*100)+"%")),
    row("Typing Speed", slider("typingSpeedMs", 0, 60, 2, (v) => v + "ms"), "Chat typewriter pace"),
  ]),
]);
function voiceSelect() {
  const s = el("select", { class: "txt", onchange: (e) => setP("ttsVoice", e.target.value) });
  const fill = () => { s.innerHTML = ""; s.appendChild(el("option", { value: "" }, ["(auto — female)"]));
    (window.speechSynthesis?.getVoices() || []).forEach((v) => { const o = el("option", { value: v.name }, [`${v.name} (${v.lang})`]); if (v.name === State.settings.ttsVoice) o.selected = true; s.appendChild(o); }); };
  fill(); if (window.speechSynthesis) speechSynthesis.onvoiceschanged = fill;
  return s;
}
function testVoice() {
  const u = new SpeechSynthesisUtterance("Hi Deku~ It's me, " + State.settings.aiName + ". Catch me first, okay?");
  const vs = speechSynthesis.getVoices(); const v = vs.find((x) => x.name === State.settings.ttsVoice); if (v) u.voice = v;
  u.pitch = State.settings.ttsPitch; u.rate = State.settings.ttsRate; speechSynthesis.cancel(); speechSynthesis.speak(u);
}

// ---- 7. BEHAVIOR ----
sections.behavior = () => panel("⚙️ Behavior", [
  card("How Akuu Acts", [
    row("Abilities (tool-use)", toggle("abilitiesEnabled"), "Master switch — can she DO things?"),
    row("Proactive Messages", toggle("proactiveMessages"), "She speaks up on her own"),
    row("Proactive Interval", slider("proactiveIntervalSec", 30, 300, 5, (v) => v + "s")),
    row("Long-term Memory", toggle("memoryEnabled")),
    row("Content Filter", selectInput("filterLevel", ["Off", ...Object.keys(State.settings.filters || {})]), "Edit the actual filter text in the in-game 📝 Prompt Studio"),
    row("Real weather sync", toggle("realWeather"), "in-game weather = your real weather"),
    row("Desktop notifications", toggle("notificationsEnabled"), "she can text you when the tab is hidden"),
    row("❄️ Freeze Akuu", toggle("frozen"), "Stops all responses"),
  ]),
  card("Debug", [
    row("Show FPS", toggle("showFPS")),
    row("Debug Logging", toggle("showDebug")),
  ]),
]);

// ---- 8. ABILITIES ----
sections.abilities = () => panel("✦ Abilities (" + ABILITIES.length + ")", [
  card("Toggle what Akuu is allowed to do", [
    el("p", { class: "muted" }, ["Turn individual powers on/off. Disabled ones are hidden from her mind entirely."]),
    el("div", { class: "ability-actions" }, [
      btn("Enable All", "sm", () => { State.set("disabledAbilities", []); broadcast(); rebuild("abilities"); }),
      btn("Disable All", "sm", () => { State.set("disabledAbilities", ABILITIES.map(a=>a.id)); broadcast(); rebuild("abilities"); }),
    ]),
    ...ABILITY_CATEGORIES.map((cat) => el("div", { class: "ability-group" }, [
      el("h4", {}, [catIcon(cat) + " " + cat]),
      el("div", { class: "ability-grid" }, ABILITIES.filter((a) => a.cat === cat).map((a) => abilityToggle(a))),
    ])),
  ]),
]);
function abilityToggle(a) {
  const disabled = State.settings.disabledAbilities || [];
  const on = !disabled.includes(a.id);
  const t = el("div", { class: "ability-item" + (on ? " on" : ""), title: a.desc, onclick: () => {
    const d = new Set(State.settings.disabledAbilities || []);
    if (d.has(a.id)) d.delete(a.id); else d.add(a.id);
    State.set("disabledAbilities", [...d]); broadcast();
    t.classList.toggle("on");
  } }, [el("b", {}, [prettyId(a.id)]), el("small", {}, [a.desc])]);
  return t;
}

// ---- 9. MEMORY ----
sections.memory = () => {
  const list = el("div", { class: "mem-list" });
  const render = () => { list.innerHTML = "";
    if (!State.memories.length) list.appendChild(el("p", { class: "muted" }, ["No memories yet. Akuu will save important moments here — or add your own."]));
    State.memories.slice().reverse().forEach((m) => list.appendChild(el("div", { class: "mem" + (m.pinned ? " pinned" : "") }, [
      el("span", { class: "mem-text" }, [m.text]),
      el("div", { class: "mem-btns" }, [
        el("button", { title: "Pin", onclick: () => { m.pinned = !m.pinned; State.save(); broadcast(); render(); } }, [m.pinned ? "📌" : "📍"]),
        el("button", { title: "Delete", onclick: () => { State.forget(m.id); broadcast(); render(); } }, ["🗑️"]),
      ]),
    ]))); };
  const input = el("input", { class: "txt", placeholder: "Teach Akuu a fact she'll always remember…" });
  const add = () => { if (input.value.trim()) { State.remember(input.value.trim(), true); input.value = ""; broadcast(); render(); } };
  input.addEventListener("keydown", (e) => e.key === "Enter" && add());
  render();
  return panel("🧷 Memory", [
    card("Add Memory", [el("div", { class: "inline" }, [input, btn("Add 📌", "primary", add)])]),
    card("Stored Memories", [
      el("div", { class: "inline end" }, [btn("Clear All", "danger sm", () => { if (confirm("Erase all of Akuu's memories?")) { State.memories = []; State.save(); broadcast(); render(); } })]),
      list,
    ]),
  ]);
};

// ---- 10. DIRECT CONTROL (god mode) ----
sections.control = () => {
  const sayIn = el("input", { class: "txt", placeholder: "Make Akuu say or do this now…" });
  const doSay = () => { if (sayIn.value.trim()) { command("say", sayIn.value.trim()); toast("Sent to Akuu"); sayIn.value = ""; } };
  sayIn.addEventListener("keydown", (e) => e.key === "Enter" && doSay());

  const exprSel = selectInputRaw(["neutral","happy","smile","laugh","blush","shy","sad","cry","angry","pout","surprised","sleepy","wink","love","smug","thinking","excited","annoyed","flustered","determined"]);
  const gestSel = selectInputRaw(["wave","jump","nod","shrug","twirl","dance","point","heart","peace","headpat","think"]);

  const abilitySel = selectInputRaw(ABILITIES.map((a) => a.id));
  const argBox = el("textarea", { class: "txt area", rows: 3, placeholder: '{"item":"cake","where":"table"}' });

  return panel("🕹️ Direct Control", [
    card("Puppeteer", [
      el("p", { class: "muted" }, ["Take the wheel. These fire instantly in the live game."]),
      row("Force Speak/Act", el("div", { class: "inline" }, [sayIn, btn("Go", "primary", doSay)])),
      row("Set Expression", el("div", { class: "inline" }, [exprSel, btn("Apply", "", () => command("forceExpression", exprSel.value))])),
      row("Play Gesture", el("div", { class: "inline" }, [gestSel, btn("Play", "", () => command("forceGesture", gestSel.value))])),
      row("Teleport", el("div", { class: "chip-row" }, ["desk","bed","window","center"].map((p) => chip(p, () => command("teleport", p))))),
    ]),
    card("Run Any Ability Manually", [
      row("Ability", abilitySel, "Pick a power"),
      row("Arguments (JSON)", argBox),
      btn("▶ Execute", "primary", () => { let args = {}; try { args = argBox.value ? JSON.parse(argBox.value) : {}; } catch { toast("Invalid JSON"); return; } command("runAbility", JSON.stringify({ id: abilitySel.value, args })); toast("Executed " + abilitySel.value); }),
    ]),
    card("Scene", [
      el("div", { class: "chip-row" }, [
        chip("🎥 Reset Camera", () => command("resetCamera")),
        chip("🧹 Clear Objects", () => command("clearObjects")),
        chip("🎉 Dance Party", () => command("runAbility", JSON.stringify({ id: "dance_party", args: {} }))),
        chip("💗 Hearts", () => command("runAbility", JSON.stringify({ id: "particle_effect", args: { type: "hearts" } }))),
        chip("🌸 Petals", () => command("runAbility", JSON.stringify({ id: "particle_effect", args: { type: "petals" } }))),
      ]),
    ]),
  ]);
};
function selectInputRaw(options) { const s = el("select", { class: "txt" }); options.forEach((o) => s.appendChild(el("option", { value: o }, [prettyId(o)]))); return s; }

// ---- 11. DATA ----
sections.data = () => {
  const statBox = el("div", { class: "stat-grid" });
  const journalBox = el("div", { class: "journal" });
  const galleryBox = el("div", { class: "gallery" });
  const logBox = el("div", { class: "event-log" });
  renderData(statBox, journalBox, galleryBox, logBox);
  window._adminData = { statBox, journalBox, galleryBox, logBox };

  return panel("📊 Data & Saves", [
    card("Stats", [statBox]),
    card("Akuu's Journal 📓", [journalBox]),
    card("Gallery 🖼️ (art & photos)", [galleryBox]),
    card("Live Event Log", [logBox]),
    card("Save Management", [
      el("div", { class: "chip-row" }, [
        chip("⬇️ Export Save", exportSave),
        chip("⬆️ Import Save", importSave),
        chip("🗨️ Clear Chat", () => { if (confirm("Clear conversation history?")) { State.conversation = []; State.save(); broadcast(); toast("Chat cleared"); } }),
        chip("💥 Reset Everything", () => { if (confirm("This wipes EVERYTHING (settings, memory, relationship). Sure?")) { State.resetAll(); broadcast(); location.reload(); } }),
      ]),
    ]),
  ]);
};
function renderData(statBox, journalBox, galleryBox, logBox) {
  const s = State.stats;
  const topAbilities = Object.entries(s.abilitiesUsed || {}).sort((a,b)=>b[1]-a[1]).slice(0,6);
  statBox.innerHTML = "";
  [["💬 Messages", s.messages], ["✦ Ability Uses", s.toolCalls], ["🧷 Memories", State.memories.length], ["📓 Journal", State.journal.length], ["🖼️ Gallery", State.gallery.length], ["🎮 Sessions", s.sessionsStarted]]
    .forEach(([k, v]) => statBox.appendChild(el("div", { class: "stat" }, [el("b", {}, [String(v)]), el("span", {}, [k])])));
  if (topAbilities.length) statBox.appendChild(el("div", { class: "stat wide" }, [el("span", {}, ["Top powers: " + topAbilities.map(([k,v]) => `${prettyId(k)} ×${v}`).join(" · ")])]));

  journalBox.innerHTML = "";
  if (!State.journal.length) journalBox.appendChild(el("p", { class: "muted" }, ["Akuu hasn't written anything yet."]));
  State.journal.slice().reverse().slice(0, 30).forEach((j) => journalBox.appendChild(el("div", { class: "j-entry" }, [
    el("small", {}, [new Date(j.ts).toLocaleString() + (j.mood ? " · " + j.mood : "") + (j.type === "poem" ? " · poem" : "")]),
    el("p", {}, [j.text]),
  ])));

  galleryBox.innerHTML = "";
  if (!State.gallery.length) galleryBox.appendChild(el("p", { class: "muted" }, ["No art or photos yet."]));
  State.gallery.slice().reverse().slice(0, 24).forEach((g) => { const img = el("img", { src: g.url, title: g.caption || "" }); img.onclick = () => window.open(g.url); galleryBox.appendChild(img); });
}
let eventLogBuffer = [];
function pushEvent(e) {
  eventLogBuffer.unshift(e); eventLogBuffer = eventLogBuffer.slice(0, 40);
  const box = window._adminData?.logBox; if (!box) return;
  box.innerHTML = eventLogBuffer.map((ev) => `<div class="ev"><span class="ev-t">${new Date(ev.ts).toLocaleTimeString()}</span> <b>${prettyId(ev.detail?.id || ev.type)}</b> <i>${esc(JSON.stringify(ev.detail?.args || {}))}</i></div>`).join("");
}

function exportSave() {
  const blob = new Blob([State.export()], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "catch-me-first-save.json" }); a.click(); toast("Save exported");
}
function importSave() {
  const inp = el("input", { type: "file", accept: ".json" });
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { State.import(r.result); broadcast(); location.reload(); } catch { toast("Invalid save file"); } }; r.readAsText(f); };
  inp.click();
}

// ============================================================================
//  LAYOUT / RENDER
// ============================================================================
const NAV = [
  ["brain", "🧠 Brain"], ["personality", "🎭 Personality"], ["relationship", "💞 Relationship"],
  ["appearance", "🌸 Appearance"], ["world", "🏠 World"], ["audio", "🔊 Voice"],
  ["behavior", "⚙️ Behavior"], ["abilities", "✦ Abilities"], ["memory", "🧷 Memory"],
  ["control", "🕹️ Control"], ["data", "📊 Data"],
];
let current = "brain";

function panel(title, cards) { return el("div", {}, [el("h2", { class: "panel-title" }, [title]), ...cards]); }
function card(title, kids) { return el("div", { class: "card" }, [title ? el("h3", {}, [title]) : null, ...kids]); }
function chip(label, onClick) { return el("button", { class: "gchip", onclick: onClick }, [label]); }

function rebuild(name) { current = name; render(); }
function render() {
  document.getElementById("navList").querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.k === current));
  const content = document.getElementById("content");
  content.innerHTML = "";
  content.appendChild(sections[current]());
  refreshSystemPrompt();
}
function refreshSystemPrompt() {
  const pre = document.getElementById("spPreview");
  if (pre) pre.textContent = buildSystemPrompt(State.settings, State.world);
}
function refreshHeader() {
  document.getElementById("hAff").textContent = State.settings.affection;
  document.getElementById("hTrust").textContent = State.settings.trust;
  document.getElementById("hName").textContent = State.settings.aiName;
}

function toast(t) { const box = document.getElementById("toasts"); const e = el("div", { class: "toast" }, [t]); box.appendChild(e); requestAnimationFrame(() => e.classList.add("show")); setTimeout(() => { e.classList.remove("show"); setTimeout(() => e.remove(), 300); }, 2200); }

// build nav
const navList = document.getElementById("navList");
NAV.forEach(([k, label]) => { const b = el("button", { "data-k": k, onclick: () => rebuild(k) }, [label]); navList.appendChild(b); });
render();
refreshHeader();

// ---- live sync from game ----
channel.onmessage = (e) => {
  if (e.data?.type === "live") {
    State.world = { ...State.world, ...e.data.world };
    if (e.data.settings) { State.settings.affection = e.data.settings.affection; State.settings.trust = e.data.settings.trust; }
    refreshHeader();
    document.getElementById("hMood").textContent = State.world.lastMood || "—";
    document.getElementById("hFps").textContent = (State.world.fps || 0) + " fps";
    if (current === "data") { State.reloadFromDisk(); const d = window._adminData; if (d) renderData(d.statBox, d.journalBox, d.galleryBox, d.logBox); }
  } else if (e.data?.type === "event") {
    pushEvent(e.data.e);
  }
};

// keep in sync if game saved something new
window.addEventListener("storage", () => { State.reloadFromDisk(); if (current === "data") { const d = window._adminData; if (d) renderData(d.statBox, d.journalBox, d.galleryBox, d.logBox); } });

// ---- helpers ----
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function prettyId(id) { return String(id).replace(/[_:]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function catIcon(c) { return { Body:"🎭", World:"🏠", Create:"✨", Effect:"💥", Appearance:"🌸", Bond:"💞", Interact:"📱" }[c] || "✦"; }
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
function personalityHint(k) { return { warmth:"kindness & affection", playfulness:"teasing energy", sass:"attitude & snark", clinginess:"attachment", intelligence:"depth of thought", humor:"jokes & wit", confidence:"boldness", shyness:"bashfulness", chaos:"unpredictability" }[k] || ""; }
