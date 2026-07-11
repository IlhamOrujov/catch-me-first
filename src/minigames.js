// ============================================================================
//  CATCH ME FIRST — minigames.js   ("Play together")
//  A little arcade you play WITH her — she cheers, teases, and reacts, and how
//  you do nudges her mood and your affection:
//   🃏 Memory Match — flip cards, find pairs (she gasps at every match)
//   🍳 Rhythm Cooking — tap to the beat to cook a dish (accuracy = quality)
//   ❓ Quiz Night — she quizzes you; get them right to impress her
// ============================================================================

import { State } from "./state.js";

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const QUIZ = [
  { q: "What's the sweetest way to spend a rainy day?", a: ["Movies under a blanket", "Deep-clean the whole apartment", "Ignore each other"], c: 0 },
  { q: "It's my birthday — what do you do?", a: ["Forget it entirely", "Surprise me with something small & thoughtful", "Just send a text"], c: 1 },
  { q: "I'm having a rough day. Best move?", a: ["Tell me to get over it", "Make me tea and just… stay", "Leave me totally alone"], c: 1 },
  { q: "Which is the cutest?", a: ["Matching mugs", "Nothing is cute", "Separate everything"], c: 0 },
  { q: "I fall asleep on your shoulder. You…", a: ["Shove me off", "Don't move for an hour so I can sleep", "Wake me up loudly"], c: 1 },
  { q: "What do I secretly love most?", a: ["Being ignored", "When you remember the little things", "Loud surprises"], c: 1 },
  { q: "Perfect first date?", a: ["Somewhere loud & crowded", "A quiet walk & talking for hours", "You cancel"], c: 1 },
];

const COOK_DISHES = ["omurice", "pancakes", "ramen", "cookies", "curry", "taiyaki"];

export const Minigames = {
  refs: null, _sayT: 0,

  init(refs) { this.refs = refs; this._button(); return this; },

  _button() {
    const hud = document.querySelector(".hud-right");
    const b = document.createElement("button");
    b.className = "icon-btn"; b.textContent = "🎮"; b.title = "Play a game together";
    b.onclick = () => this.open();
    if (hud) hud.insertBefore(b, hud.firstChild); else document.body.append(b);
  },

  say(t, force) {
    if (!force && Date.now() - this._sayT < 2500) return;
    this._sayT = Date.now();
    State.bus.emit("akuu:say", { text: t, tools: [], idle: true });
  },

  open() {
    const ov = this._overlay(`
      <div class="mg-menu">
        <h2>🎮 Play together</h2>
        <button data-g="memory">🃏 Memory Match</button>
        <button data-g="cook">🍳 Rhythm Cooking</button>
        <button data-g="quiz">❓ Quiz Night</button>
        <button class="mg-close">maybe later</button>
      </div>`);
    ov.querySelectorAll("[data-g]").forEach((b) => b.onclick = () => { this._close(); this[b.dataset.g](); });
    ov.querySelector(".mg-close").onclick = () => this._close();
  },

  _overlay(html) {
    this._close();
    const ov = document.createElement("div");
    ov.id = "mgOverlay"; ov.innerHTML = `<div class="mg-panel">${html}</div>`;
    document.body.append(ov); this._ov = ov;
    return ov.querySelector(".mg-panel");
  },
  _close() { this._ov?.remove(); this._ov = null; if (this._raf) cancelAnimationFrame(this._raf), this._raf = null; },

  _reward(aff, mood, line) {
    if (aff) State.adjust("affection", aff);
    if (mood) this.refs.emotion?.setMood?.(mood);
    this.say(line, true);
  },

  // ---------------- 🃏 Memory Match ----------------
  memory() {
    const emojis = ["🍓", "🌙", "⭐", "🐱", "🎀", "☕", "🌸", "🍰"];
    const deck = shuffle([...emojis, ...emojis].map((e, i) => ({ e, i })));
    const panel = this._overlay(`<h2>🃏 Memory Match</h2><p class="mg-sub">find all the pairs ♡</p><div class="mg-grid"></div><div class="mg-foot"><span id="mgMatches">0/8 pairs</span><button class="mg-close">quit</button></div>`);
    panel.querySelector(".mg-close").onclick = () => this._close();
    const grid = panel.querySelector(".mg-grid");
    let flipped = [], matched = 0, lock = false, moves = 0;
    this.say("okay okay, i'm good at this. bet i spot the pairs first~", true);
    deck.forEach((card) => {
      const el = document.createElement("button"); el.className = "mg-card"; el.textContent = "?";
      el.onclick = () => {
        if (lock || el.classList.contains("open") || el.classList.contains("done")) return;
        el.textContent = card.e; el.classList.add("open"); flipped.push({ el, card });
        if (flipped.length === 2) {
          moves++; lock = true;
          if (flipped[0].card.e === flipped[1].card.e) {
            flipped.forEach((f) => f.el.classList.add("done")); matched++;
            panel.querySelector("#mgMatches").textContent = `${matched}/8 pairs`;
            this.say(pick(["yes! got one~", "hah, easy", "we're a good team ♡"]));
            flipped = []; lock = false;
            if (matched === 8) { const aff = moves <= 14 ? 4 : moves <= 22 ? 3 : 2; setTimeout(() => { this._close(); this._reward(aff, "happy", moves <= 14 ? "that was PERFECT. we're unstoppable ♡" : "we did it~ good game 💕"); }, 600); }
          } else {
            this.say(pick(["nnn, no…", "wait i had it!", "okay focus, focus"]));
            setTimeout(() => { flipped.forEach((f) => { f.el.textContent = "?"; f.el.classList.remove("open"); }); flipped = []; lock = false; }, 800);
          }
        }
      };
      grid.append(el);
    });
  },

  // ---------------- 🍳 Rhythm Cooking ----------------
  cook() {
    const dish = pick(COOK_DISHES);
    const panel = this._overlay(`<h2>🍳 Cooking ${dish}</h2><p class="mg-sub">tap SPACE (or click) when a note hits the line!</p>
      <div class="mg-track"><div class="mg-hit"></div><div class="mg-notes" id="mgNotes"></div></div>
      <div class="mg-foot"><span id="mgScore">0</span><button class="mg-close">quit</button></div>`);
    panel.querySelector(".mg-close").onclick = () => this._close();
    const notesEl = panel.querySelector("#mgNotes"), scoreEl = panel.querySelector("#mgScore");
    this.say(`ooh ${dish}! don't burn it — tap on the beat~`, true);
    const N = 16, gap = 0.85; let spawned = 0, score = 0, perfect = 0, start = performance.now(), notes = [];
    const HIT_X = 40;                       // px from left where the hit line is
    const spawnNext = (t) => { if (spawned < N && t > start + spawned * gap * 1000) { const n = document.createElement("div"); n.className = "mg-note"; n.style.left = "100%"; notesEl.append(n); notes.push({ el: n, born: t }); spawned++; } };
    const dur = 1500;                        // travel time
    const loop = (t) => {
      spawnNext(t);
      const w = notesEl.clientWidth || 360;
      for (const nt of notes) { if (!nt.el.isConnected) continue; const p = (t - nt.born) / dur; nt.el.style.left = (100 - p * 100) + "%"; if (p > 1.15 && !nt.hit) { nt.hit = "miss"; nt.el.remove(); this.say(pick(["ah, missed!", "oops"])); } }
      if (spawned >= N && notes.every((n) => n.hit)) { this._finishCook(dish, score, perfect, N); return; }
      this._raf = requestAnimationFrame(loop);
    };
    const tap = () => {
      const t = performance.now(), w = notesEl.clientWidth || 360;
      let best = null, bd = 1e9;
      for (const nt of notes) { if (nt.hit) continue; const x = (parseFloat(nt.el.style.left) / 100) * w; const d = Math.abs(x - HIT_X); if (d < bd) { bd = d; best = nt; } }
      if (best && bd < 90) { best.hit = bd < 35 ? "perfect" : "good"; best.el.classList.add(best.hit); score += best.hit === "perfect" ? 100 : 60; if (best.hit === "perfect") perfect++; scoreEl.textContent = score; setTimeout(() => best.el.remove(), 150); if (best.hit === "perfect") this.say("perfect~!"); }
    };
    this._keyHandler = (e) => { if (e.code === "Space") { e.preventDefault(); tap(); } };
    window.addEventListener("keydown", this._keyHandler);
    panel.querySelector(".mg-track").onclick = tap;
    this._raf = requestAnimationFrame(loop);
    this._cookCleanup = () => window.removeEventListener("keydown", this._keyHandler);
  },
  _finishCook(dish, score, perfect, N) {
    this._cookCleanup?.();
    const acc = perfect / N;
    this.refs.lifesim?.gain?.("cooking", 6);
    const aff = acc > 0.7 ? 4 : acc > 0.4 ? 3 : 1;
    setTimeout(() => { this._close(); this._reward(aff, acc > 0.6 ? "happy" : "content", acc > 0.7 ? `WOW this ${dish} is restaurant-tier. chef ${State.settings.playerName} ♡` : acc > 0.4 ? `mm, decent ${dish}! i'd eat it~` : `…it's a little burnt. but you made it for me, so ♡`); }, 500);
  },

  // ---------------- ❓ Quiz Night ----------------
  quiz() {
    const qs = shuffle([...QUIZ]).slice(0, 5); let i = 0, score = 0;
    this.say("quiz night! let's see if you actually get me~", true);
    const ask = () => {
      if (i >= qs.length) { const aff = score >= 4 ? 5 : score >= 3 ? 3 : score >= 1 ? 1 : -1; this._close(); this._reward(aff, score >= 4 ? "affectionate" : score >= 2 ? "happy" : "annoyed", score >= 4 ? `${score}/5?! you really DO get me… ♡` : score >= 2 ? `${score}/5 — not bad, roomie` : `${score}/5… we are WORKING on this. hmph.`); return; }
      const q = qs[i]; const order = shuffle(q.a.map((text, idx) => ({ text, ok: idx === q.c })));
      const panel = this._overlay(`<h2>❓ Quiz ${i + 1}/5</h2><p class="mg-q">${q.q.replace(/</g, "&lt;")}</p><div class="mg-answers"></div><div class="mg-foot"><span>${score} right</span><button class="mg-close">quit</button></div>`);
      panel.querySelector(".mg-close").onclick = () => this._close();
      const ans = panel.querySelector(".mg-answers");
      order.forEach((o) => { const b = document.createElement("button"); b.className = "mg-ans"; b.textContent = o.text; b.onclick = () => { ans.querySelectorAll("button").forEach((x) => x.disabled = true); if (o.ok) { b.classList.add("right"); score++; this.say(pick(["yesss exactly!", "aw, you DO know me ♡", "correct~"])); } else { b.classList.add("wrong"); order.forEach((oo, k) => { if (oo.ok) ans.children[k].classList.add("right"); }); this.say(pick(["nope! c'mon", "wrong~ hmph", "…we'll pretend you didn't say that"])); } i++; setTimeout(ask, 1200); }; ans.append(b); });
    };
    ask();
  },
};
