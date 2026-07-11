// ============================================================================
//  CATCH ME FIRST — lifesim.js   ("She has a life of her own")
//  Turns the needs loop into a real life sim:
//   • SKILLS (cooking, art, music, study, fitness, social) that gain XP every
//     time she does the matching activity and LEVEL UP over days — her cooking
//     and art visibly "get better" (reflected in her prompt so she plays it).
//   • A JOB + MONEY — she works on her schedule and earns ¤ (spendable later in
//     Build Mode).
//   • An EDITABLE WEEKLY CALENDAR — 7 days of time-blocks she actually follows;
//     rearrange her week in the 📅 planner.
//   • A weekly rhythm feeding her mood (weekday grind vs. weekend ease).
// ============================================================================

import { State } from "./state.js";
import { getHotspots } from "./hotspots.js";

const SKILLS = ["cooking", "art", "music", "study", "fitness", "social"];
const PLAN_ACTIONS = ["make_coffee", "cook", "bake", "eat", "snack", "have_tea", "study", "work", "read", "write", "draw", "watch_tv", "scroll_phone", "dance", "stretch", "clean", "freshen_up", "relax", "sleep", "nap", "gaze_outside", "idle"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACT_SKILL = {
  cook: "cooking", bake: "cooking", make_coffee: "cooking", make_tea: "cooking", snack: "cooking",
  draw: "art", create_art: "art", paint: "art",
  practice_guitar: "music", sing: "music", hum: "music", dance: "music",
  study: "study", work: "study", read: "study", write: "study", browse: "study",
  stretch: "fitness", exercise: "fitness", yoga: "fitness", clean: "fitness",
  chat: "social", greet: "social", call: "social", gaze_outside: "social",
};

const DEFAULT_JOB = { title: "café barista", wage: 14, days: [1, 2, 3, 4, 5], startHour: 9, endHour: 16 };

function weekdayPlan() {
  return [
    { h: 8, action: "make_coffee", place: "kitchen" }, { h: 9, action: "work", place: "desk" },
    { h: 12, action: "eat", place: "diningTable" }, { h: 13, action: "study", place: "desk" },
    { h: 17, action: "cook", place: "kitchen" }, { h: 18, action: "eat", place: "diningTable" },
    { h: 20, action: "watch_tv", place: "sofa" }, { h: 22, action: "sleep", place: "bed" },
  ];
}
function weekendPlan() {
  return [
    { h: 10, action: "make_coffee", place: "kitchen" }, { h: 11, action: "draw", place: "desk" },
    { h: 13, action: "snack", place: "kitchen" }, { h: 15, action: "read", place: "sofa" },
    { h: 17, action: "dance", place: "roomCenter" }, { h: 19, action: "cook", place: "kitchen" },
    { h: 21, action: "watch_tv", place: "sofa" }, { h: 23, action: "sleep", place: "bed" },
  ];
}

export const Lifesim = {
  refs: null,

  init(refs) {
    this.refs = refs;
    const s = this._s();
    if (!s.calendar) s.calendar = [0, 1, 2, 3, 4, 5, 6].map((d) => (d === 0 || d === 6) ? weekendPlan() : weekdayPlan());
    if (!s.job) s.job = { ...DEFAULT_JOB };
    if (!s._allowance) { s.money += 100; s._allowance = true; }   // a little starter cash for Build Mode
    State.save();
    this._button();
    return this;
  },

  // ---------------- 📅 planner UI ----------------
  _button() {
    const hud = document.querySelector(".hud-right");
    const b = document.createElement("button");
    b.className = "icon-btn"; b.textContent = "📅"; b.title = "Her week — skills, money & schedule planner";
    b.onclick = () => this.toggle();
    if (hud) hud.insertBefore(b, hud.firstChild); else document.body.append(b);
  },
  toggle() {
    if (!this._panel) { const p = document.createElement("div"); p.id = "planPanel"; p.className = "side-panel wide"; document.body.append(p); this._panel = p; this._editDay = new Date().getDay(); }
    const open = this._panel.classList.toggle("open");
    if (open) this._render();
  },
  _render() {
    const p = this._panel, s = this._s();
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    let html = `<div class="sp-head">📅 Her Week <button class="note-x">×</button></div>`;
    html += `<div class="sp-sub">💰 ¤${this.money()} · 🧑‍🍳 ${esc(s.job?.title || "no job")}</div>`;
    // skills
    html += `<div class="plan-skills">`;
    for (const k of SKILLS) {
      const lv = this.level(k), pct = Math.min(100, (this.xp(k) % 100));
      html += `<div class="need"><label>${k}</label><div class="nbar"><i style="width:${Math.min(100, lv * 5 + pct * 0.2)}%;background:var(--pink)"></i></div><span>lv${lv}</span></div>`;
    }
    html += `</div>`;
    // day tabs
    html += `<div class="sp-sub">Schedule — tap a day to edit</div><div class="plan-days">`;
    for (let d = 0; d < 7; d++) html += `<button class="s-btn tiny plan-day${d === this._editDay ? " on" : ""}" data-day="${d}">${DAYS[d]}</button>`;
    html += `</div><div id="planBlocks"></div><button class="s-btn tiny" id="planAdd">＋ add block</button>`;
    p.innerHTML = html;
    p.querySelector(".note-x").onclick = () => this._panel.classList.remove("open");
    p.querySelectorAll(".plan-day").forEach((b) => b.onclick = () => { this._editDay = +b.dataset.day; this._render(); });
    p.querySelector("#planAdd").onclick = () => { s.calendar[this._editDay].push({ h: 12, action: "relax", place: "sofa" }); s.calendar[this._editDay].sort((a, b) => a.h - b.h); State.save(); this._render(); };
    this._renderBlocks();
  },
  _renderBlocks() {
    const wrap = this._panel.querySelector("#planBlocks"); if (!wrap) return;
    const s = this._s(); const blocks = s.calendar[this._editDay] || [];
    const places = getHotspots(State).map((h) => h.id);
    wrap.innerHTML = "";
    blocks.forEach((b, i) => {
      const row = document.createElement("div"); row.className = "plan-row";
      const hr = document.createElement("input"); hr.type = "number"; hr.min = 0; hr.max = 23; hr.value = b.h; hr.className = "plan-h";
      hr.onchange = () => { b.h = Math.max(0, Math.min(23, +hr.value || 0)); s.calendar[this._editDay].sort((a, c) => a.h - c.h); State.save(); this._renderBlocks(); };
      const act = document.createElement("select"); act.className = "plan-sel";
      for (const a of PLAN_ACTIONS) act.append(new Option(a.replace(/_/g, " "), a, false, a === b.action));
      act.onchange = () => { b.action = act.value; State.save(); };
      const pl = document.createElement("select"); pl.className = "plan-sel";
      for (const pid of places) pl.append(new Option(pid, pid, false, pid === b.place));
      pl.onchange = () => { b.place = pl.value; State.save(); };
      const del = document.createElement("button"); del.className = "s-btn tiny danger"; del.textContent = "✕";
      del.onclick = () => { blocks.splice(i, 1); State.save(); this._renderBlocks(); };
      row.append(hr, act, pl, del); wrap.append(row);
    });
    if (!blocks.length) wrap.innerHTML = '<p class="muted-p">empty day — she\'ll freestyle</p>';
  },

  _s() { return State.settings.sim || (State.settings.sim = { skills: {}, money: 0, calendar: null, job: null, workedBlocks: 0 }); },

  // ---- skills ----
  xp(name) { return this._s().skills[name] || 0; },
  level(name) { return Math.min(20, Math.floor(Math.sqrt(this.xp(name) / 6))); },
  quality(lvl) { return lvl >= 15 ? "masterful" : lvl >= 10 ? "skilled" : lvl >= 6 ? "pretty good" : lvl >= 3 ? "still learning" : "clumsy"; },
  gain(name, amt) {
    const s = this._s(); const before = this.level(name);
    s.skills[name] = (s.skills[name] || 0) + amt;
    const after = this.level(name);
    if (after > before) {
      this.refs?.ui?.toast?.(`⭐ Alice's ${name} leveled up → lvl ${after} (${this.quality(after)})`);
      this.refs?.events?.addTimeline?.("skill", `Alice's ${name} reached level ${after}`);
    }
    State.save();
  },

  // called by life when an activity finishes
  onActivityDone(action) {
    const skill = ACT_SKILL[action]; if (skill) this.gain(skill, 3 + Math.random() * 3);
    // wage for working during job hours
    if ((action === "work" || action === "study")) {
      const j = this._s().job, hr = State.world.timeOfDay, day = this._day();
      if (j && j.days.includes(day) && hr >= j.startHour && hr <= j.endHour) {
        this._s().money += j.wage; this._s().workedBlocks++; State.save();
        this.refs?.ui?.toast?.(`💰 Alice earned ¤${j.wage} (¤${this._s().money})`);
      }
    }
  },

  // ---- calendar → what she should be doing now ----
  _day() { return new Date().getDay(); },
  currentPlan(hour) {
    const cal = this._s().calendar; if (!cal) return null;
    const blocks = cal[this._day()] || [];
    let best = null;
    for (const b of blocks) if (b.h <= hour && (best === null || b.h > best.h)) best = b;
    if (best && hour - best.h < 2.6) return { action: best.action, place: best.place };
    return null;
  },

  // ---- money helpers (Build Mode economy) ----
  money() { return this._s().money; },
  spend(n) { if (this._s().money >= n) { this._s().money -= n; State.save(); return true; } return false; },
  earn(n) { this._s().money += n; State.save(); },

  // ---- prompt block ----
  promptBlock() {
    const lv = SKILLS.map((k) => `${k} ${this.quality(this.level(k))} (lv${this.level(k)})`).join(", ");
    const plan = this.currentPlan(State.world.timeOfDay);
    const j = this._s().job;
    const working = plan?.action === "work" && j;
    return `YOUR SKILLS (they really have grown — reference them naturally, e.g. brag your cooking's gotten good): ${lv}. You've saved ¤${this.money()}.` +
      (plan ? ` Right now your routine says: ${plan.action.replace(/_/g, " ")}.` : "") +
      (working ? ` (You're on the clock at your ${j.title} job.)` : "");
  },
};
