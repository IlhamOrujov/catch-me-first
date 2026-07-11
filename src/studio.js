// ============================================================================
//  CATCH ME FIRST — studio.js   ("Character Studio")
//  Edit HER, live, on the website:
//   • VRoid bridge — browse .vrm files dropped into ./vroid-drop/ and load them;
//     "VRoid Live" auto-loads the newest export the instant you save it in VRoid.
//   • Model source — load by URL, or reset to the default Alice.
//   • Live recolor — tint hair / outfit / eyes on the loaded VRM.
//   • Expression preview — click through her VRM expressions.
//   • Companions — save the current her (name, look, personality, voice) as a
//     preset and switch between multiple AI companions.
// ============================================================================

import { State } from "./state.js";

const $ = (tag, props = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const k in props) {
    if (k === "class") e.className = props[k];
    else if (k === "html") e.innerHTML = props[k];
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), props[k]);
    else e.setAttribute(k, props[k]);
  }
  for (const kid of [].concat(kids)) if (kid) e.append(kid);
  return e;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => "c" + Math.random().toString(36).slice(2, 9);

const TINT_GROUPS = {
  hair: /hair|kami|bang|ahoge/i,
  outfit: /cloth|tops|bottoms|onepiece|dress|shirt|skirt|coat|jacket|uniform|costume|outfit|body(?!.*skin)/i,
  eyes: /iris|hitomi|pupil|highlight/i,
};

export const Studio = {
  refs: null, open: false, live: false, _liveTimer: null, _lastMtime: 0, _panel: null,

  init(refs) {
    this.refs = refs;              // { akuu, ui }
    if (!State.settings.companions) State.settings.companions = [];
    this._button();
    // snapshot original colors + re-apply saved tints whenever a fresh model loads
    State.bus.on("akuu:modelLoaded", () => setTimeout(() => { this._snapshotOrig(); this._applyTints(); }, 80));
    return this;
  },

  _button() {
    const hud = document.querySelector(".hud-right");
    const b = $("button", { class: "icon-btn", title: "Character Studio — edit her & load VRoid models", onclick: () => this.toggle() }, ["🎨"]);
    if (hud) hud.insertBefore(b, hud.firstChild); else document.body.append(b);
  },

  toggle(force) {
    this.open = force ?? !this.open;
    if (this.open) { this._render(); this._panel.classList.add("open"); this._refreshVroid(); }
    else this._panel?.classList.remove("open");
  },

  _render() {
    if (!this._panel) { this._panel = $("div", { id: "studioPanel", class: "side-panel wide" }); document.body.append(this._panel); }
    const p = this._panel;
    p.innerHTML = "";
    p.append($("div", { class: "sp-head" }, [
      "🎨 Character Studio",
      $("button", { class: "note-x", onclick: () => this.toggle(false) }, ["×"]),
    ]));

    // ---- VRoid bridge ----
    p.append($("div", { class: "sp-sub" }, ["🔗 VRoid models"]));
    const liveRow = $("label", { class: "studio-live" }, [
      $("input", { type: "checkbox", ...(this.live ? { checked: "checked" } : {}), onchange: (e) => this._setLive(e.target.checked) }),
      $("span", {}, ["VRoid Live — auto-load newest export"]),
    ]);
    p.append(liveRow);
    this._vroidList = $("div", { class: "studio-vroid" }, [$("p", { class: "muted-p" }, ["scanning ./vroid-drop/ …"])]);
    p.append(this._vroidList);
    p.append($("p", { class: "muted-p tiny" }, ["Export a .vrm from VRoid Studio into the ", $("code", {}, ["vroid-drop/"]), " folder — it shows up here. Turn on VRoid Live and it loads the second you save."]));

    // ---- model source ----
    p.append($("div", { class: "sp-sub" }, ["📦 Model source"]));
    const url = $("input", { class: "txt", placeholder: "https://…/model.vrm  or  assets/models/x.vrm", value: "" });
    p.append(url);
    p.append($("div", { class: "chip-row" }, [
      $("button", { class: "s-btn primary", onclick: () => { const u = url.value.trim(); if (u) this.loadModel(u, /\.vrm(\?|$)/i.test(u)); } }, ["Load"]),
      $("button", { class: "s-btn", onclick: () => this.loadModel("assets/models/alice.vrm", true) }, ["↩ Default Alice"]),
      $("button", { class: "s-btn", onclick: () => this._resetProcedural() }, ["Built-in face"]),
    ]));

    // ---- live recolor ----
    p.append($("div", { class: "sp-sub" }, ["🎨 Recolor (live)"]));
    const t = State.settings.studioTint || {};
    const swatch = (key, label) => $("label", { class: "studio-tint" }, [
      $("span", {}, [label]),
      $("input", { type: "color", value: t[key] || "#ffffff", oninput: (e) => this._tint(key, e.target.value) }),
      $("button", { class: "s-btn tiny", onclick: () => this._tint(key, null) }, ["reset"]),
    ]);
    p.append($("div", { class: "studio-tints" }, [swatch("hair", "Hair"), swatch("outfit", "Outfit"), swatch("eyes", "Eyes")]));

    // ---- expressions ----
    p.append($("div", { class: "sp-sub" }, ["😊 Expression preview"]));
    const exprs = ["neutral", "happy", "smile", "blush", "love", "wink", "surprised", "sad", "angry", "sleepy", "thinking"];
    p.append($("div", { class: "chip-row wrap" }, exprs.map((x) =>
      $("button", { class: "s-btn tiny", onclick: () => this.refs.akuu.setExpression(x) }, [x]))));

    // ---- companions ----
    p.append($("div", { class: "sp-sub" }, ["👥 Companions"]));
    this._companionList = $("div", { class: "studio-companions" });
    p.append(this._companionList);
    this._renderCompanions();
    p.append($("div", { class: "chip-row" }, [
      $("button", { class: "s-btn primary", onclick: () => this._saveCompanion() }, ["＋ Save current as companion"]),
    ]));
    p.append($("p", { class: "muted-p tiny" }, ["A companion bundles her name, look, personality & voice. Deep-edit personality in the 🛠️ Admin → Personality tab."]));
  },

  // ---------- VRoid bridge ----------
  async _refreshVroid() {
    try {
      const r = await fetch("/vroid/list", { cache: "no-store" });
      if (!r.ok) throw new Error("no bridge");
      const data = await r.json();
      this._paintVroid(data.models || [], data.watch);
    } catch {
      if (this._vroidList) this._vroidList.innerHTML =
        '<p class="muted-p">VRoid bridge offline (that\'s fine on the deployed site). Run <code>python3 server.py</code> locally and drop a .vrm into <code>vroid-drop/</code> to use it.</p>';
    }
  },

  _paintVroid(models, watch) {
    if (!this._vroidList) return;
    this._vroidList.innerHTML = "";
    if (!models.length) {
      this._vroidList.append($("p", { class: "muted-p" }, ["No .vrm in ./vroid-drop/ yet. Export one from VRoid Studio into that folder."]));
      return;
    }
    for (const m of models) {
      const row = $("div", { class: "vroid-row" }, [
        $("span", { class: "vroid-name", title: m.name }, ["🧍 " + m.name]),
        $("span", { class: "vroid-size" }, [(m.size / 1e6).toFixed(1) + "MB"]),
        $("button", { class: "s-btn tiny primary", onclick: () => this.loadModel(m.url + "?t=" + m.mtime, true) }, ["Load"]),
      ]);
      this._vroidList.append(row);
    }
    if (watch) this._vroidList.append($("p", { class: "muted-p tiny" }, ["✓ watching your VRoid export folder"]));
  },

  _setLive(on) {
    this.live = on;
    clearInterval(this._liveTimer);
    if (!on) return;
    this.refs.ui?.toast?.("🔴 VRoid Live on — export in VRoid and she'll update");
    const tick = async () => {
      try {
        const r = await fetch("/vroid/list", { cache: "no-store" });
        const data = await r.json();
        const newest = (data.models || [])[0];
        if (newest && newest.mtime > this._lastMtime) {
          const first = this._lastMtime === 0;
          this._lastMtime = newest.mtime;
          if (!first) { this.loadModel(newest.url + "?t=" + newest.mtime, true); this.refs.ui?.toast?.("✨ loaded " + newest.name); }
        }
        if (this.open) this._paintVroid(data.models || [], data.watch);
      } catch {}
    };
    tick();
    this._liveTimer = setInterval(tick, 2500);
  },

  // ---------- loading ----------
  loadModel(url, isVRM = true) {
    State.set("customModelIsVRM", !!isVRM);
    State.set("customModelUrl", url);          // main.js reloads the model on this change
    this.refs.ui?.toast?.("loading her new look…");
  },
  _resetProcedural() {
    State.set("customModelUrl", "");
    this.refs.akuu.removeCustomModel?.();
    this.refs.ui?.toast?.("back to the built-in face");
  },

  // ---------- live recolor ----------
  _materials() {
    const out = [];
    const root = this.refs.akuu.custom?.vrm?.scene || this.refs.akuu.custom?.root;
    root?.traverse?.((o) => {
      if (!o.isMesh) return;
      for (const mat of [].concat(o.material)) if (mat && mat.color) out.push({ mat, name: (mat.name || o.name || "").toString() });
    });
    return out;
  },
  _tint(key, hex) {
    const tints = State.settings.studioTint || (State.settings.studioTint = {});
    if (hex == null) delete tints[key]; else tints[key] = hex;
    State.save();
    this._applyTints(true);
  },
  _applyTints(reRenderReset) {
    const tints = State.settings.studioTint || {};
    const THREE = window.CMF?.scene?.constructor ? null : null;   // color via mat.color.set(hex)
    for (const { mat, name } of this._materials()) {
      // decide which group this material belongs to; skin/face is left alone
      for (const key in TINT_GROUPS) {
        if (TINT_GROUPS[key].test(name)) {
          if (tints[key]) { try { mat.color.set(tints[key]); mat.needsUpdate = true; } catch {} }
          else if (reRenderReset && mat.userData._origColor) { try { mat.color.copy(mat.userData._origColor); } catch {} }
          break;
        }
      }
    }
  },
  _snapshotOrig() {
    for (const { mat } of this._materials()) if (mat.color && !mat.userData._origColor) mat.userData._origColor = mat.color.clone();
  },

  // ---------- companions ----------
  _renderCompanions() {
    const list = this._companionList; if (!list) return;
    list.innerHTML = "";
    const comps = State.settings.companions || [];
    if (!comps.length) { list.append($("p", { class: "muted-p" }, ["No saved companions yet. Save the current her below ↓"])); return; }
    for (const c of comps) {
      const active = c.id === State.settings.activeCompanion;
      list.append($("div", { class: "companion-row" + (active ? " active" : "") }, [
        $("span", { class: "comp-name" }, [(active ? "★ " : "") + esc(c.name || "Unnamed")]),
        $("button", { class: "s-btn tiny", onclick: () => this._switchCompanion(c.id) }, [active ? "active" : "switch"]),
        $("button", { class: "s-btn tiny danger", onclick: () => this._deleteCompanion(c.id) }, ["✕"]),
      ]));
    }
  },
  _saveCompanion() {
    const name = prompt("Name this companion:", State.settings.aiName || "Alice");
    if (!name) return;
    const s = State.settings;
    const comp = {
      id: uid(), name,
      aiName: s.aiName, pronouns: s.pronouns,
      model: { url: s.customModelUrl, isVRM: s.customModelIsVRM },
      personality: structuredClone(s.personality || {}),
      appearance: structuredClone(s.appearance || {}),
      voice: { voiceName: s.voiceName, pitch: s.voicePitch, rate: s.voiceRate },
      studioTint: structuredClone(s.studioTint || {}),
      createdAt: Date.now(),
    };
    s.companions = [...(s.companions || []), comp];
    s.activeCompanion = comp.id;
    State.save();
    this._renderCompanions();
    this.refs.ui?.toast?.("💾 saved companion: " + name);
  },
  _switchCompanion(id) {
    const c = (State.settings.companions || []).find((x) => x.id === id);
    if (!c) return;
    const s = State.settings;
    if (c.aiName) s.aiName = c.aiName;
    if (c.pronouns) s.pronouns = c.pronouns;
    if (c.personality) s.personality = structuredClone(c.personality);
    if (c.appearance) s.appearance = structuredClone(c.appearance);
    if (c.voice) { s.voiceName = c.voice.voiceName; s.voicePitch = c.voice.pitch; s.voiceRate = c.voice.rate; }
    s.studioTint = structuredClone(c.studioTint || {});
    s.activeCompanion = id;
    s.customModelIsVRM = !!c.model?.isVRM;
    State.save();
    State.bus.emit("settings:changed", { key: "*", value: s });
    if (c.model?.url !== undefined) State.set("customModelUrl", c.model.url);   // triggers reload
    this._renderCompanions();
    this.refs.ui?.toast?.("✨ now playing with " + (c.name || "her"));
  },
  _deleteCompanion(id) {
    State.settings.companions = (State.settings.companions || []).filter((x) => x.id !== id);
    if (State.settings.activeCompanion === id) State.settings.activeCompanion = null;
    State.save();
    this._renderCompanions();
  },
};
