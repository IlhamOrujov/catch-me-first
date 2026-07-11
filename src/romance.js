// ============================================================================
//  CATCH ME FIRST — romance.js
//  Physical closeness, earned: an ❤ Interact menu that appears near Alice with
//  actions that unlock as affection grows. Hugs, headpats, slow dances, sofa
//  cuddles, date nights, gifts, selfies — plus watch-TV-together.
// ============================================================================

import { State } from "./state.js";

const pick = (a) => a[Math.floor(Math.random() * a.length)];

const GATES = { wave: 0, compliment: 0, gift: 0, selfie: 0, watch: 0, headpat: 30, hug: 40, date: 50, dance: 55, cuddle: 65 };

export const Romance = {
  refs: null, _cool: {}, _menuOpen: false,

  init(refs) {
    this.refs = refs;   // { life, akuu, ui, brain, camCtl, audio, runAbility, events, fx }
    if (this._inited) { clearInterval(this._proxTimer); document.getElementById("interactBtn")?.remove(); document.getElementById("interactMenu")?.remove(); }
    this._inited = true;
    this._buildUI();
    this._proxTimer = setInterval(() => this._proximity(), 700);
  },

  _dist() {
    const a = State.world.alicePos, p = State.world.playerPos;
    return (a && p) ? Math.hypot(a.x - p.x, a.z - p.z) : 99;
  },

  _buildUI() {
    const btn = document.createElement("button");
    btn.id = "interactBtn"; btn.innerHTML = "❤";
    btn.title = "Interact with Alice (near her)";
    btn.onclick = () => { this._menuOpen = !this._menuOpen; this._renderMenu(); };
    document.body.appendChild(btn);
    const menu = document.createElement("div");
    menu.id = "interactMenu";
    document.body.appendChild(menu);
    this.btn = btn; this.menu = menu;
  },

  _proximity() {
    const near = this._dist() < 2.6 && !State.world.away;
    this.btn.classList.toggle("near", near);
    if (!near && this._menuOpen) { this._menuOpen = false; this._renderMenu(); }
  },

  _renderMenu() {
    const m = this.menu;
    m.classList.toggle("open", this._menuOpen);
    if (!this._menuOpen) { m.innerHTML = ""; return; }
    const aff = State.settings.affection;
    const items = [
      ["wave", "👋 Wave"], ["compliment", "🥰 Compliment"], ["headpat", "🤚 Headpat"],
      ["hug", "🤗 Hug"], ["gift", "🎁 Gift"], ["dance", "💃 Slow dance"],
      ["cuddle", "🛋️ Cuddle"], ["date", "🌙 Date night"], ["watch", "📺 Watch TV"], ["selfie", "🤳 Selfie"],
    ];
    m.innerHTML = "";
    for (const [id, label] of items) {
      const locked = aff < GATES[id];
      const b = document.createElement("button");
      b.className = "ia-btn" + (locked ? " locked" : "");
      b.innerHTML = locked ? `🔒 ${label.replace(/^\S+ /, "")}<small>closeness ${GATES[id]}+</small>` : label;
      b.onclick = () => { if (locked) { this.refs.ui.toast("💭 grow closer to her first…"); return; } this.do(id); if (id !== "gift") { this._menuOpen = false; this._renderMenu(); } };   // gift opens a submenu — keep it open
      m.appendChild(b);
    }
  },

  _gain(id, amt) {
    const now = Date.now();
    if (now - (this._cool[id] || 0) < 25000) return;   // no affection-farming
    this._cool[id] = now;
    State.adjust("affection", amt);
  },

  _first(id, text) {
    const key = "first_" + id;
    const ms = (State.settings.milestones ||= {});
    if (!ms[key]) {
      ms[key] = Date.now(); State.save();
      this.refs.events?.addTimeline("first", text);
    }
  },

  do(id) {
    const { akuu, life, ui, audio, runAbility, brain, fx } = this.refs;
    const aff = State.settings.affection;
    switch (id) {
      case "wave":
        akuu.gesture("wave"); akuu.setExpression("happy");
        this._say(pick(["hi hi~", "*waves back* hey you", "hehe, hello!"]));
        this._gain(id, 0); break;

      case "compliment":
        brain?.send?.("*I look at you and give you a sincere compliment*");
        this._gain(id, 1); break;

      case "headpat":
        akuu.gesture("headpat"); akuu.setExpression("blush");
        audio.sfx("heart");
        this._say(pick(["mnn… okay that's nice", "*leans into it slightly* …don't stop?", "w-warning next time! …but okay"]));
        this._gain(id, 1); this._first(id, "The first headpat. She pretended to mind. She didn't."); break;

      case "hug": {
        const p = State.world.playerPos;
        if (p) akuu.moveTo(p.x + 0.35, p.z + 0.35);
        setTimeout(() => {
          akuu.setExpression("love"); akuu.gesture("heart");
          fx?.("hearts"); audio.sfx("heart");
          this._say(aff >= 70 ? pick(["*melts into you* …stay like this a bit", "*hugs tight* mine."]) : pick(["*hugs you back, a little stiff at first, then soft* …okay. this is nice", "*careful hug* …you're warm"]));
        }, 1600);
        this._gain(id, 2); this._first(id, "Their first hug — she went quiet for a second"); break;
      }

      case "gift": this._giftMenu(); break;

      case "dance":
        runAbility("set_lighting", { mood: "romantic" });
        audio.startMusic();
        life.command("roomCenter", "dance");
        setTimeout(() => { fx?.("petals"); this._say(pick(["*takes your hands* just… follow me. slowly~", "one dance. don't step on my feet ♡"])); }, 2500);
        this._gain(id, 3); this._first(id, "A slow dance in the living room, lights low"); break;

      case "cuddle":
        life.command("sofa", "sit");
        setTimeout(() => {
          akuu.setExpression("love"); fx?.("hearts");
          this._say(pick(["*pats the spot next to her* c'mere.", "*leans her head on your shoulder* …quiet time.", "*curls up against you* warn me before you move…"]));
        }, 3000);
        this._gain(id, 3); this._first(id, "Cuddled on the sofa until the evening got soft"); break;

      case "date":
        ui.toast("🌙 Date night is starting…");
        runAbility("set_lighting", { mood: "romantic" });
        runAbility("spawn_object", { item: "flower", where: "table" });
        audio.startMusic();
        life.command("kitchen", "cook");
        setTimeout(() => life.command("diningTable", "eat"), 26000);
        setTimeout(() => brain?.nudge?.("(It's date night — he set it up for you two. Candle-lit dinner at home. Be warm, a little nervous, genuinely romantic. React to the evening.)"), 30000);
        this._gain(id, 4); this._first(id, "Their first date night — dinner, low light, her laugh"); break;

      case "watch":
        runAbility("set_lighting", { mood: "movie" });
        ui.renderScreen(this.refs.dorm, "tv", "♡ movie night ♡");
        life.command("sofa", "watch_tv");
        setTimeout(() => this._say(pick(["okay this movie is so bad. i love it", "*whispers* this part's good, watch"])), 9000);
        setTimeout(() => this._say(pick(["*steals a glance at you instead of the screen*", "we're watching the sequel after this. no arguments"])), 24000);
        this._gain(id, 1); break;

      case "selfie":
        akuu.gesture("peace"); akuu.setExpression("wink");
        setTimeout(() => runAbility("take_photo", { caption: "us ♡" }), 700);
        this._gain(id, 1); this._first(id, "First selfie together, saved forever"); break;
    }
  },

  _giftMenu() {
    const aff = State.settings.affection;
    const gifts = [["flower", "🌹 Flower", 1], ["boba", "🧋 Boba", 1], ["cake", "🍰 Cake", 2], ["plushie", "🧸 Plushie", 2], ["heart", "💝 Heart", 2]];
    if (aff >= 80) gifts.push(["ring", "💍 Ring", 6]);
    this.menu.innerHTML = "";
    for (const [item, label, amt] of gifts) {
      const b = document.createElement("button");
      b.className = "ia-btn"; b.textContent = label;
      b.onclick = () => { this._give(item, amt); this._menuOpen = false; this._renderMenu(); };
      this.menu.appendChild(b);
    }
    const back = document.createElement("button");
    back.className = "ia-btn"; back.textContent = "← back";
    back.onclick = () => this._renderMenu();
    this.menu.appendChild(back);
  },

  _give(item, amt) {
    const { akuu, runAbility, audio, fx, events, brain } = this.refs;
    if (item === "ring") {
      runAbility("spawn_object", { item: "heart", where: "near_deku" });
      akuu.setExpression("cry"); fx?.("hearts"); audio.sfx("levelup");
      this._say("*both hands over her mouth* …Deku. is this— *tears up* yes. obviously yes. ♡");
      events?.addTimeline("gift", "He gave her a ring. She cried (happy).");
      brain?.nudge?.("(He just gave you a RING. This is huge. React from the heart.)");
    } else {
      runAbility("spawn_object", { item, where: "near_deku" });
      akuu.setExpression("love"); fx?.("sparkles"); audio.sfx("coin");
      this._say(pick([`a ${item}?! for me?? ♡`, "you remembered i like these…", "*hugs it* mine now. no takebacks."]));
      events?.addTimeline("gift", `Deku gave Alice a ${item}`);
    }
    this._gain("gift_" + item, amt);
  },

  _say(line) { State.bus.emit("akuu:say", { text: line, tools: [], idle: true }); },
};
