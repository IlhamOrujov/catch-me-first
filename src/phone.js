// ============================================================================
//  CATCH ME FIRST — phone.js   ("Your phone to her")
//  A real little smartphone OS you carry: a home screen of apps —
//   💬 Messages  (a persistent text thread; you reply, she answers)
//   🖼️ Gallery   (every photo you took + art she made)
//   💭 Memories  (an auto "story so far" feed from your timeline)
//   📞 Call      (voice call her — talk, she talks back)
//   ♡  Status    (her live mood, needs, what she's doing, your bond)
//  She texts you here unprompted (esp. when you're away), with a badge.
// ============================================================================

import { State } from "./state.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const Phone = {
  refs: null, open: false, app: "home", unread: 0,

  init(refs) {
    this.refs = refs;                       // { brain, ui, audio, akuu }
    if (!State.settings.phoneThread) State.settings.phoneThread = [];
    this._shell();
    this._fab();
    State.bus.on("phone:message", ({ text }) => this.receive(text));
    State.bus.on("gallery:changed", () => { if (this.open && this.app === "gallery") this._render(); });
    return this;
  },

  // reuse the existing #phone element as the device; rebuild its guts
  _shell() {
    let dev = document.getElementById("phone");
    if (!dev) { dev = document.createElement("div"); dev.id = "phone"; document.body.append(dev); }
    dev.innerHTML = `<div class="phone-notch"></div><div id="phoneScreen"></div>`;
    this.dev = dev; this.screen = dev.querySelector("#phoneScreen");
  },

  _fab() {
    const b = document.createElement("button");
    b.id = "phoneFab"; b.innerHTML = `📱<span id="phoneBadge"></span>`;
    b.title = "Your phone (messages, gallery, call…)";
    b.onclick = () => this.toggle();
    document.body.append(b);
    this.fab = b;
  },

  toggle(force) {
    this.open = force ?? !this.open;
    this.dev.classList.toggle("show", this.open);
    if (this.open) { this.unread = 0; this._badge(); if (this.app === "home") this._render(); else this._render(); }
  },
  _badge() {
    const el = document.getElementById("phoneBadge");
    if (el) { el.textContent = this.unread || ""; el.style.display = this.unread ? "flex" : "none"; }
  },

  // ---- inbound texts from her ----
  receive(text) {
    if (!text) return;
    State.settings.phoneThread.push({ from: "her", text: String(text).slice(0, 300), ts: Date.now() });
    State.settings.phoneThread = State.settings.phoneThread.slice(-80);
    State.save();
    this.dev.classList.add("buzz"); setTimeout(() => this.dev.classList.remove("buzz"), 600);
    this.refs.audio?.sfx?.("pop");
    if (!(this.open && this.app === "messages")) { this.unread++; this._badge(); }
    else this._render();
  },

  // ---- home + router ----
  _render() {
    if (this.app === "home") return this._home();
    if (this.app === "messages") return this._messages();
    if (this.app === "gallery") return this._gallery();
    if (this.app === "memories") return this._memories();
    if (this.app === "call") return this._call();
    if (this.app === "status") return this._status();
  },
  _go(app) { this.app = app; this._render(); },
  _bar(title) {
    return `<div class="ph-bar"><button class="ph-back">‹</button><span>${esc(title)}</span></div>`;
  },
  _wire() {
    const back = this.screen.querySelector(".ph-back");
    if (back) back.onclick = () => this._go("home");
  },

  _home() {
    const s = State.settings;
    const t = new Date();
    const apps = [
      ["messages", "💬", "Messages", s.phoneThread.length ? s.phoneThread.length : ""],
      ["gallery", "🖼️", "Gallery", State.gallery.length || ""],
      ["memories", "💭", "Memories", (State.timeline || []).length || ""],
      ["call", "📞", "Call", ""],
      ["status", "♡", esc(s.aiName), ""],
    ];
    this.screen.innerHTML = `
      <div class="ph-status">${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}<span>${esc(s.aiName)} ♡</span></div>
      <div class="ph-home">
        ${apps.map(([id, ico, label, badge]) => `<button class="ph-app" data-app="${id}"><span class="ph-ico">${ico}</span><span class="ph-lbl">${label}</span>${badge ? `<span class="ph-b">${badge}</span>` : ""}</button>`).join("")}
      </div>`;
    this.screen.querySelectorAll(".ph-app").forEach((b) => b.onclick = () => this._go(b.dataset.app));
  },

  _messages() {
    const th = State.settings.phoneThread;
    this.screen.innerHTML = this._bar(State.settings.aiName) +
      `<div class="ph-thread" id="phThread">${th.map((m) => `<div class="ph-msg ${m.from}"><span></span><time>${time(m.ts)}</time></div>`).join("") || '<p class="ph-empty">no texts yet — say hi ♡</p>'}</div>
       <div class="ph-compose"><input id="phInput" placeholder="message ${esc(State.settings.aiName)}…"><button id="phSend">➤</button></div>`;
    // set text safely
    const nodes = this.screen.querySelectorAll(".ph-msg span");
    th.forEach((m, i) => { if (nodes[i]) nodes[i].textContent = m.text; });
    this._wire();
    const input = this.screen.querySelector("#phInput");
    const send = () => {
      const v = input.value.trim(); if (!v) return; input.value = "";
      State.settings.phoneThread.push({ from: "you", text: v, ts: Date.now() }); State.save();
      this._messages();
      this.refs.brain?.send?.(v).then((r) => { if (r?.text) this.receive(r.text); });
    };
    this.screen.querySelector("#phSend").onclick = send;
    input.onkeydown = (e) => { if (e.key === "Enter") send(); };
    const thread = this.screen.querySelector("#phThread"); if (thread) thread.scrollTop = thread.scrollHeight;
    setTimeout(() => input?.focus(), 50);
  },

  _gallery() {
    const g = [...State.gallery].reverse();
    this.screen.innerHTML = this._bar("Gallery") +
      `<div class="ph-gallery">${g.length ? g.map((x, i) => `<img src="${x.url}" data-i="${i}" title="${esc(x.caption || "")}">`).join("") : '<p class="ph-empty">no photos yet — press P for photo mode, or ask her to draw ♡</p>'}</div>`;
    this._wire();
    this.screen.querySelectorAll(".ph-gallery img").forEach((im) => im.onclick = () => {
      const v = document.createElement("div"); v.className = "ph-viewer"; v.innerHTML = `<img src="${im.src}">`;
      v.onclick = () => v.remove(); this.dev.append(v);
    });
  },

  _memories() {
    const tl = [...(State.timeline || [])].reverse();
    this.screen.innerHTML = this._bar("Memories") +
      `<div class="ph-memories">${tl.length ? tl.map((e) => `<div class="ph-mem"><span class="ph-memdot"></span><div><b>${new Date(e.ts).toLocaleDateString()}</b><p></p></div></div>`).join("") : '<p class="ph-empty">your story starts here ♡</p>'}</div>`;
    const ps = this.screen.querySelectorAll(".ph-mem p"); tl.forEach((e, i) => { if (ps[i]) ps[i].textContent = e.text; });
    this._wire();
  },

  _call() {
    const s = State.settings;
    this.screen.innerHTML = this._bar("Call") +
      `<div class="ph-call">
        <div class="ph-avatar">♡</div>
        <div class="ph-callname">${esc(s.aiName)}</div>
        <div class="ph-callsub" id="phCallSub">tap the mic and talk to her</div>
        <button id="phTalk" class="ph-talk">🎙️</button>
        <button id="phHang" class="ph-hang">end</button>
      </div>`;
    this._wire();
    const sub = this.screen.querySelector("#phCallSub");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const talk = this.screen.querySelector("#phTalk");
    talk.onclick = () => {
      if (!SR) { sub.textContent = "voice input isn't supported in this browser"; return; }
      const rec = new SR(); rec.lang = ({ English: "en-US", Japanese: "ja-JP", Turkish: "tr-TR" })[s.language] || "en-US";
      rec.interimResults = true; talk.classList.add("live"); sub.textContent = "listening…";
      rec.onresult = (e) => { let t = ""; for (const r of e.results) t += r[0].transcript; sub.textContent = "you: " + t; rec._t = t; };
      rec.onend = () => { talk.classList.remove("live"); const t = (rec._t || "").trim(); if (t) { sub.textContent = "she's answering…"; this.refs.brain?.send?.(t).then((r) => { sub.textContent = r?.text ? "♡ " + r.text.slice(0, 80) : "…"; }); } else sub.textContent = "tap the mic and talk to her"; };
      rec.onerror = () => { talk.classList.remove("live"); sub.textContent = "hmm, didn't catch that"; };
      try { rec.start(); } catch {}
    };
    this.screen.querySelector("#phHang").onclick = () => this._go("home");
  },

  _status() {
    const s = State.settings, w = State.world, n = w.needs || {};
    const sim = this.refs.lifesim;
    const days = s.firstMetTs ? Math.floor((Date.now() - s.firstMetTs) / 86400e3) : 0;
    this.screen.innerHTML = this._bar(s.aiName) +
      `<div class="ph-profile">
        <div class="ph-avatar big">♡</div>
        <div class="ph-pname">${esc(s.aiName)}</div>
        <div class="ph-pstatus">${w.away ? "out ♡" : w.doing ? esc(w.doing) : "home with you"} · feeling ${esc(w.mood || "content")}</div>
        <div class="ph-stats">
          <div><b>${s.affection}</b><span>affection</span></div>
          <div><b>${s.trust}</b><span>trust</span></div>
          <div><b>${days}</b><span>days</span></div>
          ${sim ? `<div><b>¤${sim.money()}</b><span>her savings</span></div>` : ""}
        </div>
        <div class="ph-pstage">${esc(s.relationshipStage)}</div>
      </div>`;
    this._wire();
  },
};
