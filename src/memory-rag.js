// ============================================================================
//  CATCH ME FIRST — memory-rag.js   ("She actually remembers")
//  Long-term semantic memory: every conversation turn, event and diary line is
//  embedded into a vector and stored in IndexedDB (thousands of them, far past
//  the 200-item working set). Each turn we retrieve the most relevant memories
//  and feed them to her prompt — so she recalls things from weeks ago and
//  connects them, instead of forgetting the moment they scroll off.
//
//  Embeddings are computed LOCALLY (a hashed tf + char-trigram vector, cosine-
//  ranked) — zero dependencies, instant, offline, Vercel-friendly. A neural
//  embedder (Transformers.js) can be dropped in later behind settings.smartMemory.
// ============================================================================

import { State } from "./state.js";

const DIM = 512;
const uid = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const STOP = new Set("the a an and or but of to in on at is are was were be been am i you he she it we they me my your our his her their this that these those with for from as if so just really very not no yes do does did have has had will would can could should there here what when where who how".split(" "));

function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function toks(t) { return (String(t).toLowerCase().match(/[a-z0-9']{2,}/g) || []).filter((w) => !STOP.has(w)); }

// stable local embedding (no corpus state → vectors never drift)
function embedLocal(text) {
  const v = new Float32Array(DIM);
  const add = (s, w) => { const h = h32(s); v[h % DIM] += w; v[(Math.imul(h, 7) >>> 0) % DIM] += w * 0.6; };
  for (const w of toks(text)) {
    add(w, 1 + 0.5 * Math.min(w.length, 8) / 8);
    for (let i = 0; i + 3 <= w.length; i++) add(w.slice(i, i + 3), 0.25);   // fuzzy char-trigrams
  }
  let n = 0; for (let i = 0; i < DIM; i++) n += v[i] * v[i]; n = Math.sqrt(n) || 1;
  const out = new Array(DIM); for (let i = 0; i < DIM; i++) out[i] = v[i] / n;
  return out;
}
function cosine(a, b) { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; }

// ---- IndexedDB (persistence; the working set lives in RAM for sync retrieval) ----
const DBN = "cmf-rag", STORE = "mem";
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbAll() { try { const db = await openDB(); return await new Promise((res) => { const q = db.transaction(STORE, "readonly").objectStore(STORE).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch { return []; } }
async function dbPut(rec) { try { const db = await openDB(); db.transaction(STORE, "readwrite").objectStore(STORE).put(rec); } catch {} }
async function dbDel(id) { try { const db = await openDB(); db.transaction(STORE, "readwrite").objectStore(STORE).delete(id); } catch {} }
async function dbClear() { try { const db = await openDB(); db.transaction(STORE, "readwrite").objectStore(STORE).clear(); } catch {} }

export const RAG = {
  refs: null, mem: [], ready: false, _q: null, _seen: new Set(),

  async init(refs) {
    this.refs = refs;
    this.mem = await dbAll();
    for (const m of this.mem) this._seen.add(this._key(m.text));
    this.ready = true;
    this._backfill();          // fold in existing memories/timeline/journal once
    this._button();
    return this;
  },

  _key(t) { return String(t).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 90); },

  // one-time import of what she already "knows" so recall works from day one
  async _backfill() {
    const src = [
      ...State.memories.map((m) => ({ t: m.text, type: "memory" })),
      ...(State.timeline || []).map((e) => ({ t: e.text, type: "moment" })),
      ...State.journal.map((j) => ({ t: j.text, type: "diary" })),
    ];
    for (const s of src) await this.add(s.t, s.type);
  },

  async add(text, type = "chat") {
    if (!this.ready && this.mem.length === 0 && !text) return;
    text = String(text || "").trim();
    if (text.length < 4) return;
    const key = this._key(text);
    if (this._seen.has(key)) return;               // de-dupe
    this._seen.add(key);
    const rec = { id: uid(), text: text.slice(0, 500), type, ts: Date.now(), vec: embedLocal(text) };
    this.mem.push(rec);
    dbPut(rec);
    if (this.mem.length > 3000) { const rm = this.mem.shift(); this._seen.delete(this._key(rm.text)); dbDel(rm.id); }
  },

  // async so a neural embedder can slot in later; called before the LLM turn
  async prepare(query, k = 5) {
    if (!query || !this.mem.length) { this._q = null; return; }
    const qv = embedLocal(query);
    const scored = this.mem.map((m) => ({ m, s: cosine(qv, m.vec) })).sort((a, b) => b.s - a.s);
    const hits = scored.filter((x) => x.s > 0.1).slice(0, k).map((x) => x.m);
    this._q = hits.length ? { query, hits } : null;
  },

  // sync — read the last prepare() result into a prompt block
  recallBlock() {
    if (!this._q) return "";
    return "MEMORIES that fit what he just said (weave in naturally if relevant, don't recite):\n" +
      this._q.hits.map((h) => "• " + h.text).join("\n");
  },

  // synchronous search for the browser UI
  search(query, k = 12) {
    if (!query) return [];
    const qv = embedLocal(query);
    return this.mem.map((m) => ({ m, s: cosine(qv, m.vec) })).filter((x) => x.s > 0.08).sort((a, b) => b.s - a.s).slice(0, k);
  },

  async clearAll() { this.mem = []; this._seen.clear(); this._q = null; await dbClear(); },

  // ---------------- memory browser UI ----------------
  _button() {
    const hud = document.querySelector(".hud-right");
    const b = document.createElement("button");
    b.className = "icon-btn"; b.textContent = "🧠"; b.title = "Long-term memory — search everything she remembers";
    b.onclick = () => this.toggle();
    if (hud) hud.insertBefore(b, hud.firstChild); else document.body.append(b);
  },
  toggle() {
    if (!this._panel) {
      const p = document.createElement("div");
      p.id = "memPanel"; p.className = "side-panel wide";
      document.body.append(p); this._panel = p;
    }
    const open = this._panel.classList.toggle("open");
    if (open) this._renderPanel();
  },
  _renderPanel() {
    const p = this._panel;
    p.innerHTML = `<div class="sp-head">🧠 Memory <button class="note-x">×</button></div>
      <input id="memSearch" class="txt" placeholder="search her memory… (e.g. exams, our first date)">
      <div class="sp-sub" id="memStat"></div><div id="memResults"></div>`;
    p.querySelector(".note-x").onclick = () => this._panel.classList.remove("open");
    const input = p.querySelector("#memSearch");
    const stat = p.querySelector("#memStat");
    const results = p.querySelector("#memResults");
    stat.textContent = `${this.mem.length} memories stored`;
    const paint = (list) => {
      results.innerHTML = list.length ? "" : '<p class="muted-p">no matches</p>';
      for (const { m, s } of list) {
        const el = document.createElement("div");
        el.className = "mem-row";
        el.innerHTML = `<span class="mem-type">${m.type}</span><span class="mem-text"></span><span class="mem-sim">${Math.round(s * 100)}%</span>`;
        el.querySelector(".mem-text").textContent = m.text;
        results.append(el);
      }
    };
    input.oninput = () => { const q = input.value.trim(); paint(q ? this.search(q) : []); };
    // recent by default
    paint(this.mem.slice(-14).reverse().map((m) => ({ m, s: 0 })));
    setTimeout(() => input.focus(), 50);
  },
};
