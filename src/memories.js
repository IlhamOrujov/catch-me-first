// ============================================================================
//  CATCH ME FIRST — memories.js   ("Episodic memory / Memory Lane")
//  She remembers the MOMENTS, not just the chat log. Meaningful things you say,
//  photos you take, gifts, milestones — each becomes an "episode" she keeps,
//  feeds into recall, and brings up unprompted. A visible Memory Lane shows the
//  story of you two. 💞
// ============================================================================

import { State } from "./state.js";

const CHARGED = /\b(love|loved|hate|hated|favou?rite|birthday|dream|dreamt|scared|afraid|remember|first|always|never|feel|felt|feeling|miss|missed|family|mom|mum|dad|sister|brother|work|job|school|name'?s?|named|born|happy|sad|lonely|excited|nervous|hope|hoped|wish|wished|promise|forever|marry|future|proud|thank you|sorry|beautiful|cute|special)\b/i;
const PERSONAL = /\b(i|i'?m|im|i'?ve|my|me|mine|myself)\b/i;
const EMO_ICON = { happy: "😊", excited: "🤩", playful: "😋", affectionate: "🥰", content: "🙂", cozy: "☺️", giddy: "😆", tired: "😌", bored: "😐", annoyed: "😑", lonely: "🥺", sad: "😢" };

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const snippet = (s, n = 52) => { s = clean(s); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export const Episodes = {
  refs: null, _lastCap: 0, _rag: null,

  init(refs) {
    this.refs = refs;                              // { ui, brain, akuu }
    const s = State.settings;
    if (!Array.isArray(s.episodes)) s.episodes = [];
    this._backfill();
    this._button();
    // capture meaningful exchanges (her real replies, not idle chatter)
    State.bus.on("akuu:say", (p) => { if (!p?.idle) this._fromChat(p?.text); });
    // photos become memories
    State.bus.on("gallery:added", (item) => { if (item) this.capture({ kind: "photo", title: item.caption || "a photo we took", text: item.caption || "a moment, captured", photo: item.url, emo: "happy" }); });
    // milestones / logged events
    State.bus.on("event:logged", (e) => { if (e && /milestone|date|gift|confess|kiss|hug|first/i.test(e.type || "")) this.capture({ kind: "milestone", title: snippet(e.text, 60), text: e.text, emo: "affectionate" }); });
    // occasionally she reminisces on her own
    this._timer = setInterval(() => this._maybeReminisce(), 90000);
    try { import("./memory-rag.js").then((m) => this._rag = m.RAG).catch(() => {}); } catch {}
    return this;
  },

  _list() { return State.settings.episodes; },

  capture(ep) {
    if (!ep?.text) return;
    const e = { id: "ep_" + this._list().length + "_" + Math.floor(State.world.timeOfDay * 60 || 0), ts: Date.now(), emo: ep.emo || State.world.mood || "content", importance: ep.importance || 1, kind: ep.kind || "moment", ...ep };
    this._list().push(e);
    while (this._list().length > 140) this._list().shift();
    State.save?.();
    try { this._rag?.add?.(`Memory: ${e.text}`, "episode"); } catch {}
    State.bus.emit("episode:added", e);
    if (document.getElementById("memoryLane")?.classList.contains("open")) this._render();
  },

  _fromChat(herText) {
    const users = State.conversation.filter((m) => m.role === "user");
    const last = clean(users[users.length - 1]?.content);
    if (!last || last.length < 10) return;
    if (!(PERSONAL.test(last) && CHARGED.test(last))) return;
    if (Date.now() - this._lastCap < 25000) return;                 // don't spam episodes
    if (this._list().some((e) => e.text === last)) return;          // dedupe
    this._lastCap = Date.now();
    const imp = (last.match(CHARGED) ? 2 : 1) + (/\b(love|forever|promise|birthday|name|family|dream)\b/i.test(last) ? 1 : 0);
    this.capture({ kind: "you-said", title: snippet(last), text: last, reply: snippet(herText, 90), emo: State.world.mood, importance: imp });
  },

  _maybeReminisce() {
    const s = State.settings;
    if (!s.idleChatter || State.world.away || this.refs.brain?.thinking) return;
    if (Math.random() > 0.28) return;
    const pool = this._list().filter((e) => e.importance >= 2 && e.kind !== "photo");
    const ep = pool[Math.floor(Math.random() * pool.length)] || this._list()[Math.floor(Math.random() * this._list().length)];
    if (!ep) return;
    const lines = [
      `hey… remember when you said "${snippet(ep.title, 40)}"? that stuck with me ♡`,
      `i was just thinking about that time — "${snippet(ep.title, 40)}"`,
      `"${snippet(ep.title, 40)}"… i still smile about that ♡`,
      `do you remember "${snippet(ep.title, 40)}"? because i do.`,
    ];
    State.bus.emit("akuu:say", { text: lines[Math.floor(Math.random() * lines.length)], tools: [], idle: true });
  },

  // pull existing history in as episodes the first time
  _backfill() {
    if (this._list().length) return;
    const s = State.settings;
    if (s.firstMetTs) this.capture({ kind: "milestone", title: "the day we met", text: "the first day we started living together", emo: "affectionate", importance: 3, ts: s.firstMetTs });
    for (const t of (State.timeline || []).slice(-20)) this.capture({ kind: "milestone", title: snippet(t.text, 56), text: t.text, emo: "content", importance: 2, ts: t.ts });
  },

  // ---- Memory Lane panel ----
  _button() {
    const hud = document.querySelector(".hud-right") || document.body;
    let b = document.getElementById("memLaneBtn");
    if (!b) { b = document.createElement("button"); b.id = "memLaneBtn"; b.className = "icon-btn"; hud.appendChild(b); }
    b.textContent = "💞"; b.title = "Memory Lane — the story of you two";
    b.onclick = () => this.toggle();
    let p = document.getElementById("memoryLane");
    if (!p) { p = document.createElement("div"); p.id = "memoryLane"; p.className = "side-panel"; document.body.appendChild(p); }
    this.panel = p;
  },

  toggle(force) {
    const open = force ?? !this.panel.classList.contains("open");
    this.panel.classList.toggle("open", open);
    if (open) this._render();
  },

  _render() {
    const s = State.settings;
    const eps = [...this._list()].sort((a, b) => b.ts - a.ts);
    const days = s.firstMetTs ? Math.max(0, Math.floor((Date.now() - s.firstMetTs) / 86400e3)) : 0;
    this.panel.innerHTML = `
      <div class="ml-head"><b>💞 Memory Lane</b><button class="ml-x" id="mlX">✕</button></div>
      <div class="ml-sub">${eps.length} moments together · ${days} days ♡</div>
      <div class="ml-feed">${eps.length ? eps.map((e) => `
        <div class="ml-ep ml-${e.kind}">
          <div class="ml-dot">${EMO_ICON[e.emo] || "💗"}</div>
          <div class="ml-body">
            <time>${new Date(e.ts).toLocaleDateString([], { month: "short", day: "numeric" })}${e.importance >= 3 ? " · ★" : ""}</time>
            ${e.photo ? `<img class="ml-photo" src="${e.photo}">` : ""}
            <p class="ml-t"></p>
            ${e.reply ? `<p class="ml-r">— she said: <span></span></p>` : ""}
          </div>
        </div>`).join("") : `<p class="ml-empty">Your story starts now. Talk to her, take photos, share things — the moments that matter will live here. ♡</p>`}</div>`;
    // set text safely
    const ts = this.panel.querySelectorAll(".ml-t"); eps.forEach((e, i) => { if (ts[i]) ts[i].textContent = e.title || e.text; });
    const rs = this.panel.querySelectorAll(".ml-r span"); let ri = 0; eps.forEach((e) => { if (e.reply) { const el = rs[ri++]; if (el) el.textContent = e.reply; } });
    this.panel.querySelector("#mlX").onclick = () => this.toggle(false);
  },
};
