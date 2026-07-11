// ============================================================================
//  CATCH ME FIRST — events.js
//  The heartbeat of the relationship: timeline of shared memories, milestones
//  that unlock as affection grows, morning/goodnight rituals, longing when
//  you're away, anniversaries, random little life events, and desktop
//  notifications when she "texts" you while the tab is hidden.
// ============================================================================

import { State } from "./state.js";

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// affection thresholds → what they unlock (kept in sync with romance.js gates)
export const MILESTONES = [
  { id: "warming_up", at: 25, toast: "🌸 Alice seems more comfortable around you", tl: "Alice started warming up to Deku" },
  { id: "headpats",   at: 30, toast: "💮 New interaction unlocked: Headpat", tl: "Headpats are okay now" },
  { id: "hugs",       at: 40, toast: "💗 New interaction unlocked: Hug", tl: "First time hugging distance felt natural" },
  { id: "date",       at: 50, toast: "🌙 New: Date night", tl: "Date nights became a thing" },
  { id: "dance",      at: 55, toast: "💃 New: Slow dance", tl: "They can slow dance now" },
  { id: "cuddle",     at: 65, toast: "🛋️ New: Cuddle on the sofa", tl: "Cuddling unlocked" },
  { id: "confession", at: 70, toast: "💌 Something shifted in how she looks at you…", tl: "Alice confessed her feelings" },
  { id: "ring",       at: 80, toast: "💍 A very special gift is now possible…", tl: "A promise became possible" },
  { id: "official",   at: 85, toast: "💞 You two are official now", tl: "Alice and Deku became official ♡" },
];

const LOVE_NOTES = [
  "found a sticky note on the fridge: 'made you smile yet today? — A ♡'",
  "there's a doodle of you two on the whiteboard, signed with a tiny heart",
  "a note on your desk: 'study hard. i believe in you. (also you owe me boba)'",
  "she left your favorite mug out with a note: 'you looked tired. — A'",
];

const REUNION_LINES = ["you're back!! *lights up*", "welcome home~ i missed you", "finally! it was too quiet here", "*perks up immediately* hey you~"];
const AWAY_TEXTS = ["come home soon 🥺", "the apartment is boring without you", "bring snacks on your way back? ♡", "i keep looking at the door lol"];

export const Events = {
  refs: null,
  farT: 0, hiddenT: 0, _wasFar: false, _awayTexted: false,
  evtCd: 120, _noteCd: 0, _lastNotify: 0, _annChecked: false,

  init(refs) {
    this.refs = refs;
    if (this._inited) return;   // never stack duplicate bus listeners on a re-init
    this._inited = true;
    // first-met seed + timeline store
    if (!State.timeline) State.timeline = [];
    if (!State.journal) State.journal = [];
    if (!State.settings.firstMetTs) {
      State.settings.firstMetTs = Date.now();
      this.addTimeline("meet", "The day Alice and Deku became roommates");
    }
    if (!State.settings.milestones) State.settings.milestones = {};
    State.save();

    // milestone watcher
    State.bus.on("meter:changed", ({ field, value }) => { if (field === "affection") this._checkMilestones(value); });
    this._checkMilestones(State.settings.affection);

    // goodnight ritual — when she heads to sleep and you're nearby
    State.bus.on("life:activity", (p) => {
      if (p.action === "sleep" && this._playerDist() < 5 && this._gap("goodnight", 6 * 3600e3)) {
        const aff = State.settings.affection;
        const line = aff >= 70 ? "goodnight… come to bed soon, okay? ♡" : aff >= 40 ? "goodnight, Deku~ sleep well ♡" : "mm, i'm heading to bed. night.";
        setTimeout(() => this._say(line), 2500);
      }
    });

    // anniversaries (weekly since first met)
    const days = Math.floor((Date.now() - State.settings.firstMetTs) / 86400e3);
    if (days > 0 && days % 7 === 0 && this._gap("anniversary", 20 * 3600e3)) {
      setTimeout(() => this._say(`hey… it's been ${days} days since we moved in together. time flies, huh~`), 30000);
    }
  },

  update(dt) {
    if (!this.refs) return;
    this._longing(dt);
    this._morningRitual();
    this._randomEvents(dt);
  },

  // ---------- timeline ----------
  addTimeline(type, text) {
    State.timeline = State.timeline || [];
    State.timeline.push({ type, text, ts: Date.now() });
    if (State.timeline.length > 200) State.timeline.shift();
    State.save();
    State.bus.emit("timeline:added", { type, text });
  },

  // ---------- milestones ----------
  _checkMilestones(aff) {
    for (const m of MILESTONES) {
      if (aff >= m.at && !State.settings.milestones[m.id]) {
        State.settings.milestones[m.id] = Date.now();
        State.save();
        this.refs.ui.toast(m.toast, 5200);
        this.addTimeline("milestone", m.tl);
        if (m.id === "confession") this._confession();
        if (m.id === "official") this._official();
      }
    }
  },

  _confession() {
    // she works up the nerve, then speaks from the heart (LLM if available)
    setTimeout(() => {
      this.refs.brain?.nudge?.("(Your feelings for him finally spill over. Shyly, genuinely confess that you've fallen for him — your own words, vulnerable and real. Walk closer first.)");
      State.journal.push({ type: "letter", text: `Dear ${State.settings.playerName},\n\nI don't know when it happened. Somewhere between the burnt toast and the late-night talks, you stopped being just my roommate.\n\nI think... you already know.\n\n— ${State.settings.aiName} ♡`, ts: Date.now() });
      State.save();
      this.refs.ui.toast("📔 She wrote something in her diary…", 6000);
    }, 4000);
  },

  _official() {
    State.set("relationshipStage", "Dating ♡");
    State.journal.push({ type: "letter", text: `${State.settings.playerName} & ${State.settings.aiName}.\n\nOfficial. Real. Us.\n\nCatch me? You already did.\n\n— A ♡`, ts: Date.now() });
    State.save();
  },

  // ---------- longing / reunion ----------
  _playerDist() {
    const a = State.world.alicePos, p = State.world.playerPos;
    return (a && p) ? Math.hypot(a.x - p.x, a.z - p.z) : 99;
  },

  _longing(dt) {
    const far = this._playerDist() > 6 || document.hidden;
    if (far) {
      this.farT += dt;
      if (document.hidden) {
        this.hiddenT += dt;
        if (this.hiddenT > 170 && !this._awayTexted && State.settings.affection >= 30) {
          this._awayTexted = true;
          const t = pick(AWAY_TEXTS);
          this.refs.ui.phoneMessage(t);
          this.notify(State.settings.aiName + " 💬", t);
        }
      }
    } else {
      if (this.farT > 240 && !State.world.away) {   // real reunion after 4+ min apart
        this.refs.akuu.setExpression("love");
        this.refs.fx?.("hearts");
        this._say(pick(REUNION_LINES));
        State.adjust("affection", 1);
      }
      this.farT = 0; this.hiddenT = 0; this._awayTexted = false;
    }
  },

  // ---------- rituals ----------
  _morningRitual() {
    const h = State.world.timeOfDay;
    if (h >= 6.5 && h <= 10.5 && this._playerDist() < 6 && this._gap("morning", 16 * 3600e3)) {
      const aff = State.settings.affection;
      this._say(aff >= 60 ? "morning, sleepyhead~ ♡ i'll put coffee on" : "oh — morning! want coffee?");
      setTimeout(() => this.refs.life?.command("kitchen", "make_coffee"), 3000);
    }
  },

  // ---------- random little life events ----------
  _randomEvents(dt) {
    this.evtCd -= dt; this._noteCd = Math.max(0, this._noteCd - dt);
    if (this.evtCd > 0) return;
    this.evtCd = 110 + Math.random() * 160;
    if (State.settings.frozen || !State.settings.autonomy || State.world.away || this.refs.brain?.thinking) return;
    const aff = State.settings.affection;
    const roll = Math.random();
    if (roll < 0.22) {                                     // weather comment
      const w = State.settings.weather, t = State.world.realWeather?.temp;
      const lines = { rain: "listen… the rain sounds nice", snow: "IT'S SNOWING. okay that's it, hot chocolate time", storm: "woah, that storm is intense…", clear: "it's so nice out today~" };
      this._say((lines[w] || lines.clear) + (t != null ? ` (${Math.round(t)}° out)` : ""));
    } else if (roll < 0.40 && State.timeline?.length > 2) { // memory callback
      const old = pick(State.timeline.filter((e) => Date.now() - e.ts > 3600e3));
      if (old) this._say(`hehe… i was just thinking about — ${old.text.toLowerCase()}. good times~`);
    } else if (roll < 0.55 && aff >= 45 && this._noteCd <= 0) {  // love note
      this._noteCd = 600;
      const note = pick(LOVE_NOTES);
      this.refs.ui.showNote("♡ from Alice", note.replace(/^found |^there's |^a note[^:]*: /i, ""), true);
      this.refs.ui.toast("💌 " + note, 6000);
      this.addTimeline("note", "Alice left a little note");
    } else if (roll < 0.7 && aff >= 60) {                  // she comes to you
      const p = State.world.playerPos;
      if (p && this.refs.life?.state === "idle") {
        this.refs.akuu.moveTo(p.x + 0.6, p.z + 0.6);
        setTimeout(() => { this.refs.akuu.gesture?.("wave"); this._say(pick(["whatcha doing?~", "hi. i got bored. entertain me", "*appears next to you* hey~"])); }, 2600);
      }
    } else if (roll < 0.85) {                              // hum / idle charm
      this.refs.akuu.emote?.("music");
      this._say(pick(["*hums a little melody*", "la la la~ ♪", "*sings quietly to herself*"]));
    } else if (this.refs.brain && (State.settings.groqKeys?.length || State.settings.geminiKeys?.length)) {
      this.refs.brain.proactive?.();                       // rare: real spontaneous LLM moment
    }
  },

  // ---------- notifications ----------
  notify(title, body) {
    try {
      if (!State.settings.notificationsEnabled || !("Notification" in window)) return;
      if (Notification.permission !== "granted" || !document.hidden) return;
      if (Date.now() - this._lastNotify < 240e3) return;
      this._lastNotify = Date.now();
      new Notification(title, { body, silent: false });
    } catch {}
  },

  _say(line) { if (Date.now() - (this._lastSay || 0) > 15000) { this._lastSay = Date.now(); State.bus.emit("akuu:say", { text: line, tools: [], idle: true }); } },
  _gap(key, ms) {
    const store = State.settings._ritualTs || (State.settings._ritualTs = {});
    if (Date.now() - (store[key] || 0) < ms) return false;
    store[key] = Date.now(); State.save(); return true;
  },
};
