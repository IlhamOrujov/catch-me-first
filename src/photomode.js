// ============================================================================
//  CATCH ME FIRST — photomode.js
//  Cinema/photo mode: press P (or 📸). Hides the UI, adds letterbox bars and
//  film filters, captures shots straight into the gallery.
// ============================================================================

import { State } from "./state.js";

const FILTERS = [
  ["none", "Clean", ""],
  ["warm", "Warm", "saturate(1.25) sepia(0.18) brightness(1.04)"],
  ["dreamy", "Dreamy", "saturate(1.1) blur(0.6px) brightness(1.1) contrast(0.95)"],
  ["noir", "Noir", "grayscale(1) contrast(1.25) brightness(0.95)"],
  ["retro", "Retro", "saturate(1.4) contrast(1.1) hue-rotate(-8deg) sepia(0.12)"],
];

export const PhotoMode = {
  on: false, refs: null,

  init(refs) {
    this.refs = refs;   // { renderer, ui }
    const hud = document.querySelector(".hud-right");
    if (hud) {
      const b = document.createElement("button");
      b.className = "icon-btn"; b.textContent = "📸"; b.title = "Photo mode (P)";
      b.onclick = () => this.toggle();
      hud.insertBefore(b, hud.firstChild);
    }
    addEventListener("keydown", (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "p" || e.key === "P") this.toggle();
      if (e.key === "Escape" && this.on) this.toggle(false);
    });
  },

  toggle(force) {
    this.on = force !== undefined ? force : !this.on;
    document.body.classList.toggle("photomode", this.on);
    if (this.on && !this.bar) this._buildBar();
    if (this.bar) this.bar.classList.toggle("open", this.on);
    if (!this.on) document.getElementById("scene").style.filter = "";
  },

  _buildBar() {
    const bar = document.createElement("div");
    bar.id = "photoBar";
    for (const [id, label, css] of FILTERS) {
      const b = document.createElement("button");
      b.textContent = label;
      b.onclick = () => { document.getElementById("scene").style.filter = css; bar.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); };
      bar.appendChild(b);
    }
    const snap = document.createElement("button");
    snap.className = "snap"; snap.textContent = "📷 Capture";
    snap.onclick = () => this.capture();
    bar.appendChild(snap);
    const exit = document.createElement("button");
    exit.textContent = "✕";
    exit.onclick = () => this.toggle(false);
    bar.appendChild(exit);
    document.body.appendChild(bar);
    this.bar = bar;
  },

  capture() {
    try {
      const src = this.refs.renderer.domElement;
      // downscale + JPEG so one photo is ~100-300KB (not a 3-15MB PNG that overflows storage)
      const maxW = 1280, scale = Math.min(1, maxW / src.width);
      const w = Math.max(1, Math.round(src.width * scale)), h = Math.max(1, Math.round(src.height * scale));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const g = c.getContext("2d");
      const css = document.getElementById("scene")?.style.filter;
      if (css && css !== "none") { try { g.filter = css; } catch {} }   // bake in the film filter (WYSIWYG)
      g.drawImage(src, 0, 0, w, h);
      const url = c.toDataURL("image/jpeg", 0.82);
      State.addToGallery({ type: "photo", url, caption: "cinema shot", ts: Date.now() });
      this.refs.ui.toast("📸 saved to gallery");
      const flash = document.createElement("div");
      flash.id = "photoFlash"; document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 350);
    } catch { this.refs.ui.toast("📸 capture failed"); }
  },
};
