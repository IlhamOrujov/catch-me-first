// ============================================================================
//  CATCH ME FIRST — state.js
//  Global game state, event bus, persistence, memory. The single source of truth.
// ============================================================================

import { DEFAULT_SETTINGS } from "./config.js";
import { SEED_KEYS } from "./keys.js";
import { DEFAULT_HOTSPOTS } from "./hotspots.js";

const SAVE_KEY = "catchmefirst.save.v1";
const GALLERY_KEY = "catchmefirst.gallery.v1";   // kept separate so heavy image
                                                 // dataURLs can never overflow & kill the core save
const GALLERY_MAX = 12;

// ---- Tiny event bus so modules can talk without importing each other ----------
class Bus {
  constructor() { this.map = new Map(); }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.map.get(evt)?.delete(fn);
  }
  emit(evt, payload) {
    this.map.get(evt)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`[bus:${evt}]`, e); }
    });
    // wildcard listeners
    this.map.get("*")?.forEach((fn) => fn({ evt, payload }));
  }
}

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k in over) {
    if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) && typeof base[k] === "object") {
      out[k] = deepMerge(base[k], over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}

export const State = {
  bus: new Bus(),
  settings: structuredClone(DEFAULT_SETTINGS),

  // Runtime, non-persisted-per-frame world snapshot
  world: {
    timeOfDay: DEFAULT_SETTINGS.timeOfDay,
    spawnedObjects: [],   // ids of things Akuu created
    akuuPosition: "desk",
    lastMood: "neutral",
    fps: 0,
  },

  // Conversation + memory
  conversation: [],       // {role, content, tool_calls?, name?}
  memories: [],           // [{id, text, ts, pinned}]
  journal: [],            // Akuu's diary entries (+ letters)
  gallery: [],            // dataURLs of art/photos she made
  timeline: [],           // shared relationship history [{type, text, ts}]
  eventLog: [],           // admin-visible log of everything she did

  stats: {
    messages: 0,
    toolCalls: 0,
    sessionsStarted: 0,
    abilitiesUsed: {},    // id -> count
    playtimeSec: 0,
  },

  // ---- persistence ----
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), data.settings || {});
        this.memories = data.memories || [];
        this.journal = data.journal || [];
        this.gallery = data.gallery || [];   // migrate any legacy in-save gallery
        this.timeline = data.timeline || [];
        this.stats = deepMerge(this.stats, data.stats || {});
        this.conversation = data.conversation || [];
        this.world.timeOfDay = this.settings.timeOfDay;
      }
      // gallery now lives in its own key (isolated from the core save)
      let hadGalleryKey = false;
      try { const g = localStorage.getItem(GALLERY_KEY); if (g != null) { hadGalleryKey = true; this.gallery = JSON.parse(g) || []; } } catch {}
      if (this.gallery.length > GALLERY_MAX) this.gallery = this.gallery.slice(-GALLERY_MAX);
      // migrate a legacy in-save gallery to its own key BEFORE save() rewrites the core
      // save without it (otherwise the old images would be lost on first upgrade)
      if (!hadGalleryKey && this.gallery.length) this.saveGallery();
    } catch (e) { console.warn("Load failed, using defaults", e); }
    // seed provided API keys (once) so rotation works out of the box
    try {
      if ((!this.settings.groqKeys || !this.settings.groqKeys.length) && SEED_KEYS?.groqKeys?.length)
        this.settings.groqKeys = [...SEED_KEYS.groqKeys];
      if ((!this.settings.geminiKeys || !this.settings.geminiKeys.length) && SEED_KEYS?.geminiKeys?.length)
        this.settings.geminiKeys = [...SEED_KEYS.geminiKeys];
      // one-time: make the Alice VRM Akuu's body (clear it in Admin → Appearance to revert)
      if (!this.settings._modelSeeded) {
        if (!this.settings.customModelUrl) { this.settings.customModelUrl = "assets/models/alice.vrm"; this.settings.customModelIsVRM = true; }
        this.settings._modelSeeded = true;
      }
      // one-time: make the Urban Simple VRM Deku's third-person avatar
      if (!this.settings._dekuSeeded) {
        if (!this.settings.dekuModelUrl) this.settings.dekuModelUrl = "assets/models/deku.vrm";
        this.settings._dekuSeeded = true;
      }
      // one-time: clear the built-in content filter — only the provider's safety rules
      if (!this.settings._filterCleared) { this.settings.filterLevel = "Off"; this.settings._filterCleared = true; }
      // one-time: roomier replies so she can write reality-engine scripts
      if (!this.settings._tok900) { if ((this.settings.maxTokens || 0) < 900) this.settings.maxTokens = 900; this.settings._tok900 = true; }
      // one-time: switch to the apartment map
      if (!this.settings._aptSeeded) {
        if (!this.settings.environmentUrl) this.settings.environmentUrl = "assets/models/apartment/source/appartement.glb";
        this.settings._aptSeeded = true;
      }
      if (!this.settings.hotspots) this.settings.hotspots = structuredClone(DEFAULT_HOTSPOTS);
      // one-time: upgrade hotspots to the apartment-aware positions (overwrites the
      // old guessed ones; if you've already tuned them yourself, they're kept)
      if (!this.settings._hotspots2) { this.settings.hotspots = structuredClone(DEFAULT_HOTSPOTS); this.settings._hotspots2 = true; }
    } catch {}
    this.stats.sessionsStarted++;
    this.save();
  },

  // re-read from disk WITHOUT boot side-effects (no sessionsStarted++, no save).
  // Use this for live refreshes (admin sync / cross-tab), not the boot load().
  reloadFromDisk() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), data.settings || {});
        this.memories = data.memories || [];
        this.journal = data.journal || [];
        this.timeline = data.timeline || [];
        this.stats = deepMerge(this.stats, data.stats || {});
        this.conversation = data.conversation || [];
        this.world.timeOfDay = this.settings.timeOfDay;
      }
      try { const g = localStorage.getItem(GALLERY_KEY); if (g) this.gallery = JSON.parse(g) || []; } catch {}
    } catch (e) { console.warn("reload failed", e); }
  },

  save() {
    try {
      const payload = {
        settings: this.settings,
        memories: this.memories,
        journal: this.journal,
        timeline: (this.timeline || []).slice(-200),
        stats: this.stats,
        conversation: this.conversation.slice(-60),
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Save failed", e);
      // most likely quota — shed the heaviest non-essential data and retry once
      try {
        this.conversation = this.conversation.slice(-20);
        localStorage.setItem(SAVE_KEY, JSON.stringify({ settings: this.settings, memories: this.memories, journal: this.journal, timeline: (this.timeline || []).slice(-120), stats: this.stats, conversation: this.conversation, savedAt: new Date().toISOString() }));
      } catch {}
    }
  },

  // gallery is saved on its own so an oversized image can never break core persistence
  addToGallery(item) {
    if (!item) return;
    this.gallery.push(item);
    if (this.gallery.length > GALLERY_MAX) this.gallery = this.gallery.slice(-GALLERY_MAX);
    this.saveGallery();
    this.bus.emit("gallery:added", item);
  },
  saveGallery() {
    try { localStorage.setItem(GALLERY_KEY, JSON.stringify(this.gallery)); }
    catch {
      while (this.gallery.length > 1) {            // quota → drop oldest until it fits
        this.gallery.shift();
        try { localStorage.setItem(GALLERY_KEY, JSON.stringify(this.gallery)); return; } catch {}
      }
      try { localStorage.removeItem(GALLERY_KEY); } catch {}
    }
  },

  export() {
    return JSON.stringify({
      settings: this.settings, memories: this.memories, journal: this.journal,
      gallery: this.gallery, timeline: this.timeline, stats: this.stats, conversation: this.conversation,
    }, null, 2);
  },

  import(json) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    this.settings = deepMerge(structuredClone(DEFAULT_SETTINGS), data.settings || {});
    this.memories = data.memories || [];
    this.journal = data.journal || [];
    this.gallery = data.gallery || [];
    this.timeline = data.timeline || [];
    this.stats = deepMerge(this.stats, data.stats || {});
    this.conversation = data.conversation || [];
    this.save();
    this.bus.emit("settings:changed", { key: "*", value: this.settings });
    this.bus.emit("state:imported");
  },

  resetAll() {
    localStorage.removeItem(SAVE_KEY);
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.conversation = []; this.memories = []; this.journal = [];
    this.gallery = []; this.eventLog = []; this.timeline = [];
    this.stats = { messages: 0, toolCalls: 0, sessionsStarted: 1, abilitiesUsed: {}, playtimeSec: 0 };
    this.save();
    this.bus.emit("settings:changed", { key: "*", value: this.settings });
    this.bus.emit("state:reset");
  },

  // ---- settings helpers (used heavily by admin panel) ----
  set(path, value) {
    const parts = path.split(".");
    let obj = this.settings;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
    this.save();
    this.bus.emit("settings:changed", { key: path, value });
  },

  get(path) {
    return path.split(".").reduce((o, k) => (o ? o[k] : undefined), this.settings);
  },

  // ---- memory ----
  remember(text, pinned = false) {
    const m = { id: crypto.randomUUID(), text, ts: Date.now(), pinned };
    this.memories.push(m);
    if (this.memories.length > 200) {
      // drop oldest unpinned
      const idx = this.memories.findIndex((x) => !x.pinned);
      if (idx >= 0) this.memories.splice(idx, 1);
    }
    this.save();
    this.bus.emit("memory:added", m);
    return m;
  },

  forget(id) {
    this.memories = this.memories.filter((m) => m.id !== id);
    this.save();
    this.bus.emit("memory:removed", id);
  },

  memoryContext(limit = 12) {
    if (!this.settings.memoryEnabled || this.memories.length === 0) return "";
    const pinned = this.memories.filter((m) => m.pinned);
    const recent = this.memories.filter((m) => !m.pinned).slice(-limit);
    const all = [...pinned, ...recent];
    if (all.length === 0) return "";
    return "Things you remember about your life with " + this.settings.playerName + ":\n" +
      all.map((m) => "- " + m.text).join("\n");
  },

  // ---- affection / trust nudging (tools + admin use this) ----
  adjust(field, delta) {
    const v = Math.max(0, Math.min(100, (this.settings[field] ?? 0) + delta));
    this.settings[field] = v;
    this.save();
    this.bus.emit("settings:changed", { key: field, value: v });
    this.bus.emit("meter:changed", { field, value: v, delta });
    return v;
  },

  logEvent(type, detail) {
    const e = { type, detail, ts: Date.now() };
    this.eventLog.push(e);
    if (this.eventLog.length > 300) this.eventLog.shift();
    this.bus.emit("event:logged", e);
  },

  countAbility(id) {
    this.stats.abilitiesUsed[id] = (this.stats.abilitiesUsed[id] || 0) + 1;
    this.stats.toolCalls++;
  },
};

// convenience
export const bus = State.bus;
