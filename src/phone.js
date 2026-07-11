// ============================================================================
//  CATCH ME FIRST — phone.js   ("Your phone to her")   ✦ v2 — a real little OS
//  A pocket smartphone you carry everywhere. Lock screen, live clock, a home
//  screen of real apps, and she texts you here unprompted.
//    🔒 Lock      — clock, date, her latest notification, swipe to open
//    💬 Messages  — a live text thread; she's-typing dots, read receipts, reactions
//    📷 Camera    — snap a photo of the moment (→ Gallery)
//    🖼️ Gallery   — every photo + artwork, full-screen viewer, save/delete
//    🎵 Music     — a tiny player wired to the in-game soundtrack
//    🎮 Games     — launch the co-op minigames
//    🌤️ Weather   — the apartment's live sky & hour
//    📅 Today     — her schedule for the day
//    💭 Memories  — the "story so far" from your timeline
//    📞 Call      — voice-call her (speech in, she answers)
//    📝 Notes     — a shared notepad
//    ♡  Her       — live mood, needs, bond, savings, skills
//    ⚙️ Settings  — wallpaper, music, open full game settings
//  Close it with the ✕, the home bar, Esc, the FAB, or tapping outside.
// ============================================================================

import { State } from "./state.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmm = (ts = Date.now()) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));

// ---- little inline SVGs for the status bar (crisp at any size) ----------------
const SVG = {
  signal: `<svg viewBox="0 0 18 12" width="16"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1" opacity=".45"/></svg>`,
  wifi: `<svg viewBox="0 0 16 12" width="15"><path d="M8 11.2a1.3 1.3 0 100-2.6 1.3 1.3 0 000 2.6z"/><path d="M3.4 6.6a6.5 6.5 0 019.2 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".8"/><path d="M1.2 4.3a9.6 9.6 0 0113.6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".55"/></svg>`,
  batt: (pct) => `<svg viewBox="0 0 26 12" width="24"><rect x="0.5" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/><rect x="2" y="2" width="${clamp(pct) / 100 * 19}" height="8" rx="1.5" fill="currentColor"/><rect x="23.5" y="3.5" width="2" height="5" rx="1" fill="currentColor" opacity=".55"/></svg>`,
};

// wallpapers: gradients keyed by hour-of-day, plus a few chooseable presets
const WALLS = {
  dawn: "linear-gradient(160deg,#f6b8c8,#c9a0e0 55%,#8a7fc0)",
  day: "linear-gradient(160deg,#8fd0ff,#b6a6ff 55%,#e7b8e0)",
  golden: "linear-gradient(160deg,#ffb27a,#ff87a6 55%,#a56fd0)",
  night: "linear-gradient(160deg,#2a1e4a,#3b2a63 50%,#553b7a)",
  sakura: "linear-gradient(160deg,#ffc2d4,#ffa8c4 55%,#d98fc4)",
  mint: "linear-gradient(160deg,#8fe0c8,#6fbfe0 60%,#8f9fe0)",
  dusk: "linear-gradient(160deg,#6a5acd,#b86fb0 55%,#ff9a8b)",
};
const wallForHour = (h) => h < 6 ? "night" : h < 9 ? "dawn" : h < 17 ? "day" : h < 20 ? "golden" : "night";

const PLAYLIST = [
  { t: "room tone (lofi)", a: "for two" }, { t: "afternoon rain", a: "study beats" },
  { t: "her humming", a: "unreleased ♡" }, { t: "midnight snacks", a: "chill hop" },
  { t: "sunday, slow", a: "for two" }, { t: "pixel hearts", a: "8-bit dreams" },
];

const NOTICE_EMPTY = "no texts yet — say hi ♡";

export const Phone = {
  refs: null, open: false, app: "lock", unread: 0, locked: true,
  _batt: 86, _track: 0, _typing: false,

  init(refs) {
    this.refs = refs;                       // { brain, ui, audio, akuu, lifesim }
    const s = State.settings;
    if (!s.phoneThread) s.phoneThread = [];
    if (typeof s.phoneNotes !== "string") s.phoneNotes = "";
    if (!s.phoneWall) s.phoneWall = "auto";
    this._shell();
    this._fab();
    State.bus.on("phone:message", ({ text }) => this.receive(text));
    State.bus.on("gallery:changed", () => { if (this.open && this.app === "gallery") this._render(); });
    State.bus.on("gallery:added", () => { if (this.open && this.app === "gallery") this._render(); });
    // live clock / battery drift while the phone is open
    this._timer = setInterval(() => this._tick(), 1000);
    // Esc closes the phone first (before it frees the mouse)
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.open) { this.toggle(false); e.stopPropagation(); }
    }, true);
    return this;
  },

  // ---- device shell: backdrop + frame(statusbar / screen / home bar) ----------
  _shell() {
    let back = document.getElementById("phoneBackdrop");
    if (!back) { back = document.createElement("div"); back.id = "phoneBackdrop"; document.body.append(back); }
    back.onclick = () => this.toggle(false);
    this.backdrop = back;

    let dev = document.getElementById("phone");
    if (!dev) { dev = document.createElement("div"); dev.id = "phone"; document.body.append(dev); }
    dev.innerHTML = `
      <div class="ph-island"></div>
      <div class="ph-statusbar">
        <span class="ph-clock" id="phClock">${hhmm()}</span>
        <span class="ph-sysico">${SVG.signal}${SVG.wifi}<span id="phBattWrap">${SVG.batt(this._batt)}</span></span>
      </div>
      <div id="phoneScreen"></div>
      <div class="ph-homebar" id="phHomebar" title="home · tap again to close"></div>`;
    this.dev = dev;
    this.screen = dev.querySelector("#phoneScreen");
    dev.querySelector("#phHomebar").onclick = () => { if (this.locked || this.app === "home") this.toggle(false); else this._go("home"); };
    this._applyWall();
  },

  _fab() {
    let b = document.getElementById("phoneFab");
    if (!b) { b = document.createElement("button"); b.id = "phoneFab"; document.body.append(b); }
    b.innerHTML = `📱<span id="phoneBadge"></span>`;
    b.title = "Your phone — messages, camera, music, call…";
    b.onclick = () => this.toggle();
    this.fab = b;
  },

  _applyWall() {
    const s = State.settings;
    const key = s.phoneWall === "auto" ? wallForHour(Math.floor(State.world.timeOfDay ?? 14)) : s.phoneWall;
    this.dev.style.setProperty("--wall", WALLS[key] || WALLS.day);
    this.dev.classList.toggle("wall-dark", key === "night" || key === "dusk");
  },

  _tick() {
    if (!this.open) return;
    const c = document.getElementById("phClock"); if (c) c.textContent = hhmm();
    const lc = document.getElementById("phLockClock"); if (lc) lc.textContent = hhmm();
    // gentle battery drift so it feels live (never dies)
    if (Math.random() < 0.06) { this._batt = clamp(this._batt + (Math.random() < 0.5 ? -1 : 1), 42, 98); const w = document.getElementById("phBattWrap"); if (w) w.innerHTML = SVG.batt(this._batt); }
    if (this.app === "call" && this._callStart) { const el = document.getElementById("phCallTimer"); if (el) { const s = Math.floor((Date.now() - this._callStart) / 1000); el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; } }
  },

  toggle(force) {
    this.open = force ?? !this.open;
    this.dev.classList.toggle("show", this.open);
    this.backdrop.classList.toggle("show", this.open);
    document.body.classList.toggle("phone-open", this.open);
    State.bus.emit("phone:toggled", this.open);   // main frees the mouse when it opens
    if (this.open) {
      this._applyWall();
      this.unread = 0; this._badge();
      this.app = "lock"; this.locked = true;
      this._render();
      this.refs.audio?.sfx?.("pop");
    }
  },

  _badge() {
    const el = document.getElementById("phoneBadge");
    if (el) { el.textContent = this.unread > 9 ? "9+" : (this.unread || ""); el.style.display = this.unread ? "flex" : "none"; }
    this.fab?.classList.toggle("buzzing", this.unread > 0);
  },

  // ---- inbound texts from her ----
  receive(text) {
    if (!text) return;
    const s = State.settings;
    s.phoneThread.push({ from: "her", text: String(text).slice(0, 400), ts: Date.now() });
    s.phoneThread = s.phoneThread.slice(-120);
    State.save();
    this.dev.classList.add("buzz"); setTimeout(() => this.dev.classList.remove("buzz"), 550);
    this.refs.audio?.sfx?.("pop");
    if (this.open && this.app === "messages" && !this.locked) this._messages();
    else { this.unread++; this._badge(); if (this.open && this.locked) this._lock(); }
  },

  // ---- router ----
  _render() {
    if (this.locked) return this._lock();
    const fn = {
      home: this._home, messages: this._messages, camera: this._camera, gallery: this._gallery,
      music: this._music, games: this._games, weather: this._weather, calendar: this._calendar,
      memories: this._memories, call: this._call, notes: this._notes, status: this._status, settings: this._settings,
    }[this.app] || this._home;
    this.screen.classList.remove("ph-in"); void this.screen.offsetWidth; this.screen.classList.add("ph-in");
    fn.call(this);
  },
  _go(app) { this.app = app; if (app !== "call") this._callStart = 0; this._render(); },
  _header(title, sub) {
    return `<div class="ph-bar"><button class="ph-back" title="back">‹</button><div class="ph-bartitle"><span>${esc(title)}</span>${sub ? `<em>${esc(sub)}</em>` : ""}</div></div>`;
  },
  _wireBack() { const b = this.screen.querySelector(".ph-back"); if (b) b.onclick = () => this._go("home"); },

  // ================= LOCK SCREEN =================
  _lock() {
    const s = State.settings;
    const last = [...s.phoneThread].reverse().find((m) => m.from === "her");
    const d = new Date();
    const date = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    this.screen.innerHTML = `
      <div class="ph-lock">
        <div class="ph-lockclock" id="phLockClock">${hhmm()}</div>
        <div class="ph-lockdate">${esc(date)}</div>
        ${(this.unread && last) ? `<div class="ph-notif"><b>${esc(s.aiName)} ♡</b><span></span><time>${hhmm(last.ts)}</time></div>` : `<div class="ph-lockhint">♡ ${esc(s.aiName)} is ${State.world.away ? "out right now" : "home with you"}</div>`}
        <button class="ph-unlock" id="phUnlock"><span>swipe up to open</span><i>⌃</i></button>
      </div>`;
    if (this.unread && last) { const sp = this.screen.querySelector(".ph-notif span"); if (sp) sp.textContent = last.text; }
    const un = this.screen.querySelector("#phUnlock");
    un.onclick = () => this._unlock();
    // swipe up to unlock (touch)
    let sy = 0;
    this.screen.ontouchstart = (e) => { sy = e.touches[0].clientY; };
    this.screen.ontouchend = (e) => { if (sy && sy - (e.changedTouches[0]?.clientY ?? sy) > 40) this._unlock(); };
    const notif = this.screen.querySelector(".ph-notif"); if (notif) notif.onclick = () => { this._unlock("messages"); };
  },
  _unlock(app = "home") {
    this.locked = false; this.app = app; this.unread = 0; this._badge();
    this.screen.ontouchstart = this.screen.ontouchend = null;
    this.refs.audio?.sfx?.("click");
    this._render();
  },

  // ================= HOME =================
  _home() {
    const s = State.settings, w = State.world;
    const apps = [
      ["messages", "💬", "Messages", s.phoneThread.length || ""],
      ["camera", "📷", "Camera", ""],
      ["gallery", "🖼️", "Gallery", State.gallery.length || ""],
      ["music", "🎵", "Music", ""],
      ["games", "🎮", "Games", ""],
      ["weather", "🌤️", "Weather", ""],
      ["calendar", "📅", "Today", ""],
      ["memories", "💭", "Memories", (State.timeline || []).length || ""],
      ["notes", "📝", "Notes", ""],
    ];
    const dock = [["messages", "💬"], ["camera", "📷"], ["call", "📞"], ["status", "♡"]];
    const doing = w.away ? `out ♡ ${esc(w.doing || "")}` : (w.doing ? esc(w.doing) : "hanging out with you");
    this.screen.innerHTML = `
      <div class="ph-widget">
        <div class="ph-wtime">${hhmm()}<em>${esc(new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }))}</em></div>
        <div class="ph-wher"><span class="ph-wdot ${w.away ? "away" : ""}"></span>${esc(s.aiName)} · ${esc(w.mood || "content")}<small>${doing}</small></div>
      </div>
      <div class="ph-home">
        ${apps.map(([id, ico, label, badge]) => `<button class="ph-app" data-app="${id}"><span class="ph-ico">${ico}</span><span class="ph-lbl">${label}</span>${badge ? `<span class="ph-b">${badge}</span>` : ""}</button>`).join("")}
      </div>
      <div class="ph-dock">
        ${dock.map(([id, ico]) => `<button class="ph-dockapp" data-app="${id}"><span>${ico}</span></button>`).join("")}
      </div>`;
    this.screen.querySelectorAll("[data-app]").forEach((b) => b.onclick = () => this._go(b.dataset.app));
  },

  // ================= MESSAGES =================
  _messages() {
    const s = State.settings, th = s.phoneThread;
    this.screen.innerHTML = this._header(s.aiName, State.world.away ? "out ♡" : "online") +
      `<div class="ph-thread" id="phThread">${th.length ? th.map((m, i) => this._bubble(m, i)).join("") : `<p class="ph-empty">${NOTICE_EMPTY}</p>`}</div>
       <div class="ph-compose"><input id="phInput" maxlength="300" placeholder="message ${esc(s.aiName)}…" autocomplete="off"><button id="phSend" title="send">➤</button></div>`;
    // fill text safely + wire reactions
    this.screen.querySelectorAll(".ph-msg").forEach((el) => {
      const i = +el.dataset.i; const m = th[i]; if (!m) return;
      const sp = el.querySelector(".ph-txt"); if (sp) sp.textContent = m.text;
      if (m.react) el.querySelector(".ph-react").textContent = m.react;
      el.querySelector(".ph-txt").onclick = () => this._reactTo(i, el);
    });
    this._wireBack();
    const input = this.screen.querySelector("#phInput");
    const send = () => {
      const v = input.value.trim(); if (!v) return; input.value = "";
      th.push({ from: "you", text: v.slice(0, 300), ts: Date.now(), read: false });
      State.save(); this._messages();
      this._showTyping();
      const b = this.refs.brain;
      if (!b?.send) { this._hideTyping(); return; }
      b.send(v).then((r) => {
        // mark your last message "read", then show her reply
        const yours = [...th].reverse().find((m) => m.from === "you"); if (yours) yours.read = true;
        if (r?.text) this.receive(r.text);
        else { this._hideTyping(); this._messages(); }
      }).catch(() => { this._hideTyping(); });
    };
    this.screen.querySelector("#phSend").onclick = send;
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } };
    this._scrollThread();
    setTimeout(() => input?.focus(), 60);
  },
  _bubble(m, i) {
    const read = m.from === "you" ? `<i class="ph-tick">${m.read ? "✓✓" : "✓"}</i>` : "";
    return `<div class="ph-msg ${m.from}" data-i="${i}"><span class="ph-txt"></span><span class="ph-react">${m.react ? esc(m.react) : ""}</span><time>${hhmm(m.ts)}${read}</time></div>`;
  },
  _reactTo(i, el) {
    const m = State.settings.phoneThread[i]; if (!m) return;
    const picks = ["♡", "😊", "😂", "😮", "🥺", "👍"];
    const cur = picks.indexOf(m.react || "♡");
    m.react = m.react === picks[(cur + 1) % picks.length] ? "" : picks[(cur + 1) % picks.length];
    if (cur === -1) m.react = "♡";
    State.save();
    const r = el.querySelector(".ph-react"); if (r) { r.textContent = m.react; r.classList.remove("pop"); void r.offsetWidth; r.classList.add("pop"); }
  },
  _showTyping() {
    this._hideTyping();
    const th = this.screen.querySelector("#phThread"); if (!th) return;
    const t = document.createElement("div"); t.className = "ph-msg her ph-typing"; t.id = "phTyping";
    t.innerHTML = `<span class="ph-dots"><i></i><i></i><i></i></span>`;
    th.append(t); this._typing = true; this._scrollThread();
  },
  _hideTyping() { document.getElementById("phTyping")?.remove(); this._typing = false; },
  _scrollThread() { const t = this.screen.querySelector("#phThread"); if (t) t.scrollTop = t.scrollHeight; },

  // ================= CAMERA =================
  _camera() {
    const s = State.settings;
    this.screen.innerHTML = this._header("Camera") +
      `<div class="ph-cam">
        <div class="ph-viewfinder"><div class="ph-vfgrid"></div><div class="ph-vfhint">point at the moment ♡</div><div class="ph-flash" id="phFlash"></div></div>
        <div class="ph-camrow">
          <button class="ph-cammode" id="phSelfie">🤳 selfie</button>
          <button class="ph-shutter" id="phShutter" title="take photo"></button>
          <button class="ph-cammode" id="phGoto">🖼️ ${State.gallery.length}</button>
        </div>
      </div>`;
    this._wireBack();
    this.screen.querySelector("#phShutter").onclick = () => {
      const flash = document.getElementById("phFlash"); if (flash) { flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go"); }
      this.refs.audio?.sfx?.("shutter");
      try { this.refs.ui?.capturePhoto?.(`with ${s.aiName} ♡`); } catch {}
      const g = this.screen.querySelector("#phGoto"); setTimeout(() => { if (g) g.textContent = `🖼️ ${State.gallery.length}`; }, 120);
    };
    this.screen.querySelector("#phSelfie").onclick = (e) => { e.currentTarget.classList.toggle("on"); this.screen.querySelector(".ph-viewfinder").classList.toggle("selfie"); };
    this.screen.querySelector("#phGoto").onclick = () => this._go("gallery");
  },

  // ================= GALLERY =================
  _gallery() {
    const g = [...State.gallery].reverse();
    this.screen.innerHTML = this._header("Gallery", `${g.length} photo${g.length === 1 ? "" : "s"}`) +
      `<div class="ph-gallery">${g.length ? g.map((x, i) => `<button class="ph-gitem" data-i="${i}"><img src="${x.url}" loading="lazy"><span class="ph-gcap">${esc(x.caption || "")}</span></button>`).join("") : '<p class="ph-empty">no photos yet — open 📷 Camera, or ask her to draw ♡</p>'}</div>`;
    this._wireBack();
    this.screen.querySelectorAll(".ph-gitem").forEach((b) => b.onclick = () => this._viewPhoto(g[+b.dataset.i]));
  },
  _viewPhoto(item) {
    if (!item) return;
    const v = document.createElement("div"); v.className = "ph-viewer";
    v.innerHTML = `<img src="${item.url}"><div class="ph-vcap">${esc(item.caption || "")}</div>
      <div class="ph-vrow"><a class="ph-vbtn" href="${item.url}" download="catch-me-first.jpg">⬇ save</a><button class="ph-vbtn ph-vdel">🗑 delete</button></div>`;
    v.querySelector(".ph-vdel").onclick = (e) => {
      e.stopPropagation();
      const idx = State.gallery.indexOf(item);
      if (idx >= 0) { State.gallery.splice(idx, 1); State.save?.(); State.bus.emit("gallery:changed"); }
      v.remove(); this._gallery();
    };
    v.onclick = (e) => { if (e.target === v || e.target.tagName === "IMG") v.remove(); };
    this.dev.append(v);
  },

  // ================= MUSIC =================
  _music() {
    const a = this.refs.audio;
    const playing = !!(a?.musicNodes?.length) && State.settings.musicEnabled;
    const tr = PLAYLIST[this._track % PLAYLIST.length];
    this.screen.innerHTML = this._header("Music") +
      `<div class="ph-music">
        <div class="ph-vinyl ${playing ? "spin" : ""}"><div class="ph-vlabel">♪</div></div>
        <div class="ph-trackt">${esc(tr.t)}</div>
        <div class="ph-tracka">${esc(tr.a)}</div>
        <div class="ph-scrub"><span class="ph-scrubfill ${playing ? "run" : ""}"></span></div>
        <div class="ph-mrow">
          <button class="ph-mbtn" id="phPrev">⏮</button>
          <button class="ph-play" id="phPlay">${playing ? "❚❚" : "▶"}</button>
          <button class="ph-mbtn" id="phNext">⏭</button>
        </div>
        <div class="ph-mhint">the apartment's little soundtrack ♡</div>
      </div>`;
    this._wireBack();
    this.screen.querySelector("#phPlay").onclick = () => {
      const on = !!(a?.musicNodes?.length) && State.settings.musicEnabled;
      if (on) { a?.stopMusic?.(); }
      else { State.settings.musicEnabled = true; State.save?.(); a?.resume?.(); a?.startMusic?.(); }
      setTimeout(() => this._music(), 60);
    };
    this.screen.querySelector("#phNext").onclick = () => { this._track = (this._track + 1) % PLAYLIST.length; this._music(); };
    this.screen.querySelector("#phPrev").onclick = () => { this._track = (this._track + PLAYLIST.length - 1) % PLAYLIST.length; this._music(); };
  },

  // ================= GAMES =================
  _games() {
    const mg = this.refs.minigames || window.CMF?.Minigames;
    const games = [
      ["memory", "🧠", "Memory Match", "flip & pair the cards"],
      ["cook", "🍳", "Kitchen Rhythm", "cook to the beat"],
      ["quiz", "❓", "How Well Do You Know Her", "answer about her"],
    ];
    this.screen.innerHTML = this._header("Games", "play together") +
      `<div class="ph-games">${games.map(([id, ico, name, sub]) => `<button class="ph-game" data-g="${id}"><span class="ph-gico">${ico}</span><div><b>${name}</b><em>${sub}</em></div><i>›</i></button>`).join("")}</div>`;
    this._wireBack();
    this.screen.querySelectorAll(".ph-game").forEach((b) => b.onclick = () => {
      const id = b.dataset.g;
      this.toggle(false);
      try { (mg?.[id]) ? mg[id]() : mg?.open?.(); } catch { this.refs.ui?.toast?.("couldn't start the game"); }
    });
  },

  // ================= WEATHER =================
  _weather() {
    const h = Math.floor(State.world.timeOfDay ?? 14);
    const kinds = h < 6 ? ["clear night", "🌙", 14] : h < 9 ? ["soft dawn", "🌅", 17] : h < 12 ? ["sunny", "☀️", 22]
      : h < 17 ? ["bright", "🌤️", 24] : h < 20 ? ["golden hour", "🌇", 21] : ["starry", "✨", 16];
    const [label, ico, temp] = kinds;
    const fore = [["now", ico, temp], ["+3h", "🌤️", temp + 1], ["+6h", h < 12 ? "☀️" : "🌙", temp - 2], ["+9h", "☁️", temp - 3]];
    this.screen.innerHTML = this._header("Weather", "your apartment") +
      `<div class="ph-weather">
        <div class="ph-wbig">${ico}</div>
        <div class="ph-wtemp">${temp}°</div>
        <div class="ph-wlabel">${label}</div>
        <div class="ph-wsub">it's ${hhmm()} inside · she likes ${h < 6 || h >= 20 ? "cozy nights" : "days like this"} ♡</div>
        <div class="ph-forecast">${fore.map(([t, i, tp]) => `<div class="ph-fcell"><span>${t}</span><b>${i}</b><em>${tp}°</em></div>`).join("")}</div>
      </div>`;
    this._wireBack();
  },

  // ================= TODAY / CALENDAR =================
  _calendar() {
    const s = State.settings;
    const cal = s.calendar || s.sim?.calendar;
    const today = Array.isArray(cal) ? (cal[new Date().getDay()] || []) : [];
    const nowH = Math.floor(State.world.timeOfDay ?? new Date().getHours());
    const rows = (today || []).slice().sort((a, b) => (a.h ?? 0) - (b.h ?? 0));
    this.screen.innerHTML = this._header("Today", new Date().toLocaleDateString([], { weekday: "long" })) +
      `<div class="ph-cal">${rows.length ? rows.map((b) => {
        const active = b.h <= nowH && nowH < b.h + 2;
        return `<div class="ph-cblock ${active ? "now" : ""}"><span class="ph-ch">${String(b.h ?? 0).padStart(2, "0")}:00</span><div><b>${esc(b.action || "free time")}</b>${b.place ? `<em>@ ${esc(b.place)}</em>` : ""}</div>${active ? '<i class="ph-cnow">now</i>' : ""}</div>`;
      }).join("") : `<p class="ph-empty">her day's wide open — spend it together ♡</p>`}</div>`;
    this._wireBack();
  },

  // ================= MEMORIES =================
  _memories() {
    const tl = [...(State.timeline || [])].reverse();
    this.screen.innerHTML = this._header("Memories", "your story so far") +
      `<div class="ph-memories">${tl.length ? tl.map((e) => `<div class="ph-mem"><span class="ph-memdot"></span><div><b>${new Date(e.ts).toLocaleDateString([], { month: "short", day: "numeric" })} · ${hhmm(e.ts)}</b><p></p></div></div>`).join("") : '<p class="ph-empty">your story starts here ♡</p>'}</div>`;
    const ps = this.screen.querySelectorAll(".ph-mem p"); tl.forEach((e, i) => { if (ps[i]) ps[i].textContent = e.text; });
    this._wireBack();
  },

  // ================= CALL =================
  _call() {
    const s = State.settings;
    this._callStart = this._callStart || Date.now();
    this.screen.innerHTML = this._header("Call") +
      `<div class="ph-call">
        <div class="ph-avatar ring"><div class="ph-ava-inner">♡</div></div>
        <div class="ph-callname">${esc(s.aiName)}</div>
        <div class="ph-calltimer" id="phCallTimer">00:00</div>
        <div class="ph-callsub" id="phCallSub">tap the mic and talk to her</div>
        <div class="ph-callrow">
          <button id="phTalk" class="ph-talk">🎙️</button>
        </div>
        <button id="phHang" class="ph-hang">✕ end call</button>
      </div>`;
    this._wireBack();
    const sub = this.screen.querySelector("#phCallSub");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const talk = this.screen.querySelector("#phTalk");
    talk.onclick = () => {
      if (!SR) { sub.textContent = "voice input isn't supported here — try Messages ♡"; return; }
      const rec = new SR(); rec.lang = ({ English: "en-US", Japanese: "ja-JP", Turkish: "tr-TR" })[s.language] || "en-US";
      rec.interimResults = true; talk.classList.add("live"); sub.textContent = "listening…";
      rec.onresult = (e) => { let t = ""; for (const r of e.results) t += r[0].transcript; sub.textContent = "you: " + t; rec._t = t; };
      rec.onend = () => { talk.classList.remove("live"); const t = (rec._t || "").trim(); if (t) { sub.textContent = "she's answering…"; this.refs.brain?.send?.(t).then((r) => { sub.textContent = r?.text ? "♡ " + r.text.slice(0, 90) : "…"; }).catch(() => sub.textContent = "hmm, try again"); } else sub.textContent = "tap the mic and talk to her"; };
      rec.onerror = () => { talk.classList.remove("live"); sub.textContent = "hmm, didn't catch that"; };
      try { rec.start(); } catch {}
    };
    this.screen.querySelector("#phHang").onclick = () => { this._callStart = 0; this._go("home"); };
  },

  // ================= NOTES =================
  _notes() {
    const s = State.settings;
    this.screen.innerHTML = this._header("Notes", "shared ♡") +
      `<div class="ph-notes"><textarea id="phNotes" maxlength="4000" placeholder="little notes to each other… a date idea, a reminder, a doodle in words ♡">${esc(s.phoneNotes)}</textarea><div class="ph-notesave" id="phSaved">saved ✓</div></div>`;
    this._wireBack();
    const ta = this.screen.querySelector("#phNotes"); const saved = this.screen.querySelector("#phSaved");
    let t; ta.oninput = () => { clearTimeout(t); saved.classList.remove("show"); t = setTimeout(() => { s.phoneNotes = ta.value; State.save?.(); saved.classList.add("show"); }, 400); };
    setTimeout(() => ta.focus(), 60);
  },

  // ================= HER (STATUS) =================
  _status() {
    const s = State.settings, w = State.world, n = w.needs || {};
    const sim = this.refs.lifesim;
    const days = s.firstMetTs ? Math.max(0, Math.floor((Date.now() - s.firstMetTs) / 86400e3)) : 0;
    const meters = [["♡ love", n.love], ["⚡ energy", n.energy], ["💬 social", n.social], ["🎨 fun", n.fun], ["🍜 full", 100 - (n.hunger ?? 0)]]
      .filter(([, v]) => typeof v === "number");
    let skills = "";
    try { if (sim) { const named = Object.keys(sim._s?.().skills || State.settings.sim?.skills || {}); skills = named.slice(0, 6).map((k) => `<span class="ph-skill">${esc(k)} · L${sim.level?.(k) ?? 0}</span>`).join(""); } } catch {}
    this.screen.innerHTML = this._header(s.aiName) +
      `<div class="ph-profile">
        <div class="ph-avatar big"><div class="ph-ava-inner">♡</div></div>
        <div class="ph-pname">${esc(s.aiName)}</div>
        <div class="ph-pstatus">${w.away ? "out ♡" : w.doing ? esc(w.doing) : "home with you"} · feeling ${esc(w.mood || "content")}</div>
        <div class="ph-stats">
          <div><b>${s.affection ?? 0}</b><span>affection</span></div>
          <div><b>${s.trust ?? 0}</b><span>trust</span></div>
          <div><b>${days}</b><span>days ♡</span></div>
          ${sim ? `<div><b>¤${sim.money?.() ?? 0}</b><span>savings</span></div>` : ""}
        </div>
        ${meters.length ? `<div class="ph-meters">${meters.map(([l, v]) => `<div class="ph-meter"><span>${l}</span><i><b style="width:${clamp(v)}%"></b></i></div>`).join("")}</div>` : ""}
        ${skills ? `<div class="ph-skills">${skills}</div>` : ""}
        <div class="ph-pstage">${esc(s.relationshipStage || "roommates")}</div>
      </div>`;
    this._wireBack();
  },

  // ================= SETTINGS =================
  _settings() {
    const s = State.settings;
    const walls = ["auto", "sakura", "mint", "dusk", "day", "night", "golden"];
    this.screen.innerHTML = this._header("Settings") +
      `<div class="ph-settings">
        <div class="ph-slabel">Wallpaper</div>
        <div class="ph-walls">${walls.map((k) => `<button class="ph-wall ${s.phoneWall === k ? "on" : ""}" data-w="${k}" style="background:${k === "auto" ? "conic-gradient(from 90deg,#f6b8c8,#8a7fc0,#ffb27a,#2a1e4a,#f6b8c8)" : (WALLS[k] || WALLS.day)}"><span>${k}</span></button>`).join("")}</div>
        <button class="ph-srow" id="phMusicToggle"><span>🎵 Music</span><i class="ph-toggle ${s.musicEnabled ? "on" : ""}"></i></button>
        <button class="ph-srow" id="phOpenSettings"><span>⚙️ Full game settings</span><i>›</i></button>
        <button class="ph-srow" id="phClearThread"><span>🧹 Clear message thread</span><i>›</i></button>
        <div class="ph-sfoot">Catch Me First · phone OS ♡</div>
      </div>`;
    this._wireBack();
    this.screen.querySelectorAll(".ph-wall").forEach((b) => b.onclick = () => { s.phoneWall = b.dataset.w; State.save?.(); this._applyWall(); this._settings(); });
    this.screen.querySelector("#phMusicToggle").onclick = () => {
      s.musicEnabled = !s.musicEnabled; State.save?.();
      if (s.musicEnabled) { this.refs.audio?.resume?.(); this.refs.audio?.startMusic?.(); } else this.refs.audio?.stopMusic?.();
      this._settings();
    };
    this.screen.querySelector("#phOpenSettings").onclick = () => { this.toggle(false); document.getElementById("gearBtn")?.click(); };
    this.screen.querySelector("#phClearThread").onclick = () => { s.phoneThread = []; State.save?.(); this.refs.ui?.toast?.("🧹 thread cleared"); this._go("home"); };
  },
};
