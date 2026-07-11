// ============================================================================
//  CATCH ME FIRST — reflection.js   ("Her inner life at night")
//  When she goes to sleep, she REFLECTS on the day — writes a real diary entry
//  (and, if her brain's online, murmurs a soft private thought). Some nights she
//  DREAMS: a brief surreal set-piece painted by the reality engine while she
//  sleeps. In the morning she remembers it and brings it up to you.
// ============================================================================

import { State } from "./state.js";

const CLOSERS = ["Grateful for the little things.", "Hope tomorrow's kinder.", "…i think i'm happy here.", "I miss him when the apartment's quiet.", "Funny how a place becomes home.", "Sleep now. More tomorrow. ♡"];
const DREAMS = [
  "floating through a sky full of soft paper lanterns",
  "a version of our apartment where every door opened onto the sea",
  "slow-dancing with someone whose face was warm but blurry",
  "chasing a little paper heart down a hallway that never ended",
  "the kitchen, but the kettle poured starlight instead of tea",
  "being small enough to nap inside a teacup",
];

export const Reflection = {
  refs: null,

  init(refs) {
    this.refs = refs;                       // { brain, magic, lifesim, ui } (magic/lifesim may be getters)
    State.bus.on("life:activity", (p) => { if (p.action === "sleep" || p.action === "nap") this._maybeNight(); });
    return this;
  },

  _dayKey() { return Math.floor(Date.now() / 86400e3); },

  _maybeNight() {
    const s = State.settings, dk = this._dayKey();
    if (s._reflectedDay === dk) return;
    s._reflectedDay = dk; State.save();
    setTimeout(() => this._reflect(), 4500);
    if (Math.random() < 0.45) setTimeout(() => this._dream(), 10000);
  },

  _reflect() {
    const since = Date.now() - 16 * 3600e3;
    const today = (State.timeline || []).filter((e) => e.ts > since).map((e) => e.text);
    const mood = State.world.mood || "okay";
    // let her write it in her own voice if her brain's online
    if (this.refs.brain && (State.settings.groqKeys?.length || State.settings.geminiKeys?.length) && Math.random() < 0.7) {
      this.refs.brain.nudge?.(`(It's late; you're winding down for the night. Share one quiet, private reflection on today — a real feeling, a sentence or two${today.length ? `. Today: ${today.slice(-3).join("; ")}` : ""}. Soft and honest, like a thought before sleep.)`);
    }
    // always record a diary entry
    const body = today.length ? today.slice(-3).join(". ") + "." : "A quiet day at home, mostly.";
    const entry = `Today felt ${mood}. ${body} ${CLOSERS[Math.floor(Math.random() * CLOSERS.length)]}`;
    State.journal.push({ type: "diary", text: entry, ts: Date.now() });
    State.save();
    this.refs.ui?.toast?.("📔 " + State.settings.aiName + " wrote in her diary");
  },

  _dream() {
    const M = this.refs.magic; if (!M?.run) return;
    const theme = DREAMS[Math.floor(Math.random() * DREAMS.length)];
    State.settings._lastDream = theme; State.save();
    // a soft, brief dream painted around the sleeping her, then it fades
    M.run(`api.lights('night');
      const ds=[];
      for(let i=0;i<44;i++){ const s=api.sphere({r:0.04+Math.random()*0.09,color:['#ffd0e2','#c9b6ff','#a8e0ff','#fff2cf'][i%4],glow:2,opacity:0.85,at:[api.rand(-4,4),api.rand(0.6,4),api.rand(-5,5)]}); api.tween(s,{to:{y:s.position.y+2.2},dur:7,ease:'out'}); ds.push(s); }
      api.burst('hearts',[0,2,0],26);
      api.after(9,()=>{ ds.forEach(s=>api.remove(s)); });`, "dream");
    setTimeout(() => State.bus.emit("akuu:say", { text: `*mumbles in her sleep* …mm… ${theme}…`, tools: [], idle: true }), 2200);
  },

  // morning recall — she brings the dream up
  update() {
    const h = State.world.timeOfDay, dk = this._dayKey(), s = State.settings;
    if (h >= 7 && h < 10.5 && s._lastDream && s._dreamToldDay !== dk && !State.world.away && !this.refs.brain?.thinking) {
      s._dreamToldDay = dk; State.save();
      const dream = s._lastDream;
      setTimeout(() => State.bus.emit("akuu:say", { text: `oh— i had the weirdest dream. something about ${dream}. what do you think that means?~`, tools: [], idle: true }), 3000);
    }
  },
};
