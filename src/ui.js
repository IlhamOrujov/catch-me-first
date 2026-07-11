// ============================================================================
//  CATCH ME FIRST — ui.js
//  All the on-screen interface: chat, HUD, phone, notes, art, minigames.
// ============================================================================

import * as THREE from "three";
import { State } from "./state.js";
import { Audio } from "./audio.js";
import { moodIcon, doingIcon } from "./icons.js";

export const UI = {
  refs: null,
  els: {},
  onSend: null,      // callback(text) set by main → Brain.send

  init(refs) {
    this.refs = refs;
    this.els = {
      chat: document.getElementById("chatLog"),
      input: document.getElementById("chatInput"),
      sendBtn: document.getElementById("sendBtn"),
      thinking: document.getElementById("thinkingDot"),
      hudAff: document.getElementById("hudAffection"),
      hudTrust: document.getElementById("hudTrust"),
      hudMood: document.getElementById("hudMood"),
      hudTime: document.getElementById("hudTime"),
      hudStage: document.getElementById("hudStage"),
      toasts: document.getElementById("toasts"),
      phone: document.getElementById("phone"),
      phoneLog: document.getElementById("phoneLog"),
      modalRoot: document.getElementById("modalRoot"),
    };

    const send = () => {
      const t = this.els.input.value.trim();
      if (!t) return;
      this.userSay(t);
      this.els.input.value = "";
      this.onSend?.(t);
    };
    this.els.sendBtn?.addEventListener("click", send);
    this.els.input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
      if (e.key === "Escape") this.els.input.blur();          // Esc leaves the chat (back to walking)
    });

    // react to state
    State.bus.on("brain:thinking", (on) => { if (this.els.thinking) this.els.thinking.style.opacity = on ? "1" : "0"; });
    State.bus.on("meter:changed", () => this.updateHUD());
    State.bus.on("akuu:say", (p) => this.akuuSay(p.text, p));
    State.bus.on("settings:changed", () => this.updateHUD());
    // live "what Alice is doing" status in the HUD
    State.bus.on("life:activity", (p) => { State.world.doing = `${p.action.replace(/_/g, " ")} · ${p.label}`; this.updateHUD(); });
    State.bus.on("life:done", () => { State.world.doing = null; this.updateHUD(); });

    this.updateHUD();
    this._panels();
    // greet
    setTimeout(() => {
      if (State.conversation.length === 0)
        this.systemLine("You're home. Alice is living her own life around the apartment — press T to talk to her. (Set your Groq key in ⚙️)");
    }, 600);
  },

  // ---------------- needs & diary panels ----------------
  _panels() {
    const toggle = (id) => {
      const p = document.getElementById(id); if (!p) return;
      const open = p.classList.toggle("open");
      if (open) (id === "needsPanel" ? this.renderNeeds() : this.renderDiary());
    };
    document.getElementById("needsBtn")?.addEventListener("click", () => toggle("needsPanel"));
    document.getElementById("diaryBtn")?.addEventListener("click", () => toggle("diaryPanel"));
    document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => document.getElementById(b.dataset.close)?.classList.remove("open")));
    setInterval(() => { if (document.getElementById("needsPanel")?.classList.contains("open")) this.renderNeeds(); }, 2500);
  },

  renderNeeds() {
    const el = document.getElementById("needsBody"); if (!el) return;
    const n = State.world.needs || {};
    const icons = { energy: "🔋 Energy", hunger: "🍙 Fullness", fun: "🎮 Fun", social: "💬 Social", hygiene: "🛁 Fresh" };
    let html = "";
    for (const k in icons) {
      const v = Math.round(n[k] ?? 50);
      html += `<div class="need"><label>${icons[k]}</label><div class="nbar"><i style="width:${v}%;background:${v < 30 ? "#f87171" : v < 60 ? "#fbbf24" : "#34d399"}"></i></div><span>${v}</span></div>`;
    }
    html += `<div class="need-meta">mood: <b>${esc(State.world.mood || "content")}</b>${State.world.doing ? ` · <b>${esc(State.world.doing)}</b>` : ""}${State.world.away ? " · <b>out ♡</b>" : ""}</div>`;
    const days = State.settings.firstMetTs ? Math.floor((Date.now() - State.settings.firstMetTs) / 86400e3) : 0;
    html += `<div class="need-meta">together <b>${days}</b> day${days === 1 ? "" : "s"} · <b>${esc(State.settings.relationshipStage)}</b> · ♡ ${State.settings.affection}</div>`;
    el.innerHTML = html;
  },

  renderDiary() {
    const el = document.getElementById("diaryBody"); if (!el) return;
    const entries = [...State.journal].reverse().slice(0, 30);
    const tl = [...(State.timeline || [])].reverse().slice(0, 24);
    let html = "";
    if (entries.length) html += entries.map((j) => `<div class="diary-e ${j.type === "letter" ? "letter" : ""}"><small>${new Date(j.ts).toLocaleString()}${j.type === "letter" ? " · 💌 letter" : ""}</small><p>${esc(j.text).replace(/\n/g, "<br>")}</p></div>`).join("");
    else html += `<p class="muted-p">she hasn't written anything yet…</p>`;
    html += `<div class="sp-sub">⏳ your story so far</div>` + (tl.length ? tl.map((t) => `<div class="tl-e"><small>${new Date(t.ts).toLocaleDateString()}</small> ${esc(t.text)}</div>`).join("") : `<p class="muted-p">it's just beginning~</p>`);
    el.innerHTML = html;
  },

  // ---------------- chat ----------------
  _bubble(cls, html) {
    const div = document.createElement("div");
    div.className = "msg " + cls;
    div.innerHTML = html;
    this.els.chat.appendChild(div);
    this.els.chat.scrollTop = this.els.chat.scrollHeight;
    return div;
  },

  userSay(text) {
    this._bubble("user", `<span class="who">${esc(State.settings.playerName)}</span>${esc(text)}`);
  },

  systemLine(text) {
    this._bubble("sys", esc(text));
  },

  showRateLimit(seconds) {
    this.toast(`⏳ Groq's free tier is catching its breath — Akuu replies in ~${seconds}s`);
  },

  async akuuSay(text, meta = {}) {
    // show action chips if she used tools
    if (meta.tools?.length) {
      const chips = meta.tools.map((t) => `<span class="chip">✦ ${esc(prettyTool(t.name))}</span>`).join("");
      this._bubble("actions", chips);
    }
    text = cleanForDisplay(text);
    if (!text || !text.trim()) { this.updateHUD(); return; }

    const name = State.settings.aiName;
    const div = this._bubble("akuu", `<span class="who">${esc(name)}</span><span class="body"></span>`);
    const body = div.querySelector(".body");
    Audio.speak(text);
    this.refs.akuu.talk(true);
    await this._typeRich(body, text, State.settings.typingSpeedMs);
    this.refs.akuu.talk(false);
    this.updateHUD();
  },

  // ---- live streaming bubble (fills as tokens arrive from the LLM) ----
  streamStart() {
    const name = State.settings.aiName;
    this._streamDiv = this._bubble("akuu", `<span class="who">${esc(name)}</span><span class="body"></span>`);
    this._streamBody = this._streamDiv.querySelector(".body");
    this._streamShown = 0;
    try { this.refs.akuu.talk(true); } catch {}
  },
  streamDelta(full) {
    if (!this._streamBody) return;
    const clean = cleanForDisplay(full);
    this._streamBody.textContent = clean;
    for (let i = this._streamShown; i < clean.length; i++) this.refs.akuu.viseme?.(clean[i]);
    this._streamShown = clean.length;
    this.els.chat.scrollTop = this.els.chat.scrollHeight;
  },
  streamEnd(text, meta = {}) {
    const clean = cleanForDisplay(text);
    if (meta.tools?.length && this._streamDiv) {
      const cd = document.createElement("div"); cd.className = "msg actions";
      cd.innerHTML = meta.tools.map((t) => `<span class="chip">✦ ${esc(prettyTool(t.name))}</span>`).join("");
      this.els.chat.insertBefore(cd, this._streamDiv);
    }
    if (!clean.trim()) {
      this._streamDiv?.remove();                 // she acted silently → drop the empty bubble
    } else if (this._streamBody) {
      this._streamBody.innerHTML = "";
      for (const seg of parseInline(clean)) { const tag = seg.b ? "strong" : seg.i ? "em" : seg.code ? "code" : "span"; const n = document.createElement(tag); n.textContent = seg.text; this._streamBody.appendChild(n); }
      Audio.speak(clean);
    }
    try { this.refs.akuu.talk(false); } catch {}
    this._streamDiv = null; this._streamBody = null;
    this.updateHUD();
  },
  streamCancel() {
    try { this._streamDiv?.remove(); this.refs.akuu.talk(false); } catch {}
    this._streamDiv = null; this._streamBody = null;
  },

  // typewriter that renders markdown (**bold**, *italic*, `code`) so roleplay
  // *actions* and emphasis look right instead of showing raw ** __ asterisks
  async _typeRich(body, text, speed) {
    const segs = parseInline(text);
    // speed 0 (or a very long line) → render instantly; no synchronous char loop
    // and no per-char audio flood that would freeze the tab
    if (!speed || speed <= 0) {
      for (const seg of segs) {
        const tag = seg.b ? "strong" : seg.i ? "em" : seg.code ? "code" : "span";
        const node = document.createElement(tag); node.textContent = seg.text; body.appendChild(node);
      }
      this.els.chat.scrollTop = this.els.chat.scrollHeight;
      return;
    }
    let n = 0;
    for (const seg of segs) {
      const tag = seg.b ? "strong" : seg.i ? "em" : seg.code ? "code" : "span";
      const node = document.createElement(tag);
      body.appendChild(node);
      for (const ch of seg.text) {
        node.textContent += ch;
        this.els.chat.scrollTop = this.els.chat.scrollHeight;
        this.refs.akuu.viseme?.(ch);                                          // shape her mouth to this sound
        if (ch !== " " && ch !== "\n" && (n++ & 1) === 0) Audio.sfx("type");   // throttle click SFX
        await sleep(speed);
      }
    }
  },

  // ---------------- HUD ----------------
  updateHUD() {
    const s = State.settings;
    if (this.els.hudAff) this.els.hudAff.style.width = s.affection + "%";
    if (this.els.hudTrust) this.els.hudTrust.style.width = s.trust + "%";
    if (this.els.hudMood) this.els.hudMood.innerHTML = State.world.doing ? (doingIcon() + " " + esc(State.world.doing)) : (moodIcon(State.world.lastMood) + " " + esc(State.world.lastMood));
    if (this.els.hudStage) this.els.hudStage.textContent = s.relationshipStage;
    if (this.els.hudTime) {
      const t = State.world.timeOfDay; const h = Math.floor(t) % 24; const m = Math.floor((t % 1) * 60);
      const ap = h < 12 ? "AM" : "PM"; const hh = h % 12 === 0 ? 12 : h % 12;
      this.els.hudTime.textContent = `${hh}:${m.toString().padStart(2, "0")} ${ap}`;
    }
  },

  // ---------------- toasts ----------------
  toast(text, ms = 3200) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = text;
    this.els.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 400); }, ms);
  },

  // ---------------- phone ----------------
  phoneMessage(text) {
    // routed to the Phone OS (phone.js); it renders the thread + badge
    State.bus.emit("phone:message", { text });
    this.toast("📱 " + State.settings.aiName + " texted you");
  },

  // ---------------- sticky note / poem modal ----------------
  showNote(title, body, fancy = false) {
    const card = document.createElement("div");
    card.className = "note-card" + (fancy ? " fancy" : "");
    card.innerHTML = `<button class="note-x">×</button><div class="note-title">${esc(title)}</div><div class="note-body">${esc(body).replace(/\n/g, "<br>")}</div>`;
    card.querySelector(".note-x").onclick = () => card.remove();
    card.style.left = (20 + Math.random() * 40) + "px";
    card.style.top = (90 + Math.random() * 40) + "px";
    makeDraggable(card);
    this.els.modalRoot.appendChild(card);
    setTimeout(() => { if (card.isConnected) { card.classList.add("fade"); setTimeout(() => card.remove(), 1000); } }, 18000);
  },

  // ---------------- reminders ----------------
  setReminder(text, seconds) {
    this.toast(`⏰ Reminder set (${seconds}s): ${text}`);
    setTimeout(() => {
      Audio.sfx("chime");
      this.showNote("⏰ Reminder", text);
      this.onSend && State.bus.emit("reminder:fired", text);
    }, Math.max(1, seconds) * 1000);
  },

  // ---------------- screens (monitor / TV) ----------------
  renderScreen(dorm, target, content) {
    if (content === "off") { dorm.setScreen(target, "off"); return; }
    const c = document.createElement("canvas"); c.width = 320; c.height = 180;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, "#1b2a6b"); g.addColorStop(1, "#0a0e27");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = "#fff"; ctx.font = "bold 20px sans-serif"; ctx.textAlign = "center";
    wrap(ctx, content, 160, 80, 280, 26);
    dorm.setScreen(target, c.toDataURL());
  },

  // ---------------- procedural art ----------------
  generateArt(desc, style) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 512;
    const ctx = c.getContext("2d");
    const d = desc.toLowerCase();
    // background by keyword
    let bg = ["#fdf2f8", "#eef2ff"];
    if (/night|star|space|galaxy/.test(d)) bg = ["#0b1026", "#241a4d"];
    else if (/sunset|dusk|evening/.test(d)) bg = ["#ff9a6b", "#ffd36e"];
    else if (/ocean|sea|water|beach/.test(d)) bg = ["#7dd3fc", "#0369a1"];
    else if (/forest|nature|tree|green/.test(d)) bg = ["#bbf7d0", "#166534"];
    const grd = ctx.createLinearGradient(0, 0, 0, 512); grd.addColorStop(0, bg[0]); grd.addColorStop(1, bg[1]);
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 512, 512);

    if (style === "pixel") { for (let y = 0; y < 512; y += 32) for (let x = 0; x < 512; x += 32) { ctx.fillStyle = `hsla(${Math.random()*360},70%,60%,0.5)`; ctx.fillRect(x, y, 30, 30); } }

    // motifs
    const drawHearts = () => { for (let i = 0; i < 14; i++) { ctx.fillStyle = `hsla(${330 + Math.random()*40},80%,${60+Math.random()*20}%,0.85)`; this._heart(ctx, Math.random()*512, Math.random()*512, 12 + Math.random()*30); } };
    const drawStars = () => { ctx.fillStyle = "#fff"; for (let i = 0; i < 120; i++) { ctx.globalAlpha = Math.random(); ctx.beginPath(); ctx.arc(Math.random()*512, Math.random()*380, Math.random()*2.5, 0, 7); ctx.fill(); } ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(400, 110, 40, 0, 7); ctx.fill(); };
    const drawFlowers = () => { for (let i = 0; i < 10; i++) { const x = Math.random()*512, y = 200 + Math.random()*280; ctx.fillStyle = `hsl(${Math.random()*360},70%,65%)`; for (let p = 0; p < 6; p++) { const a = p/6*Math.PI*2; ctx.beginPath(); ctx.ellipse(x+Math.cos(a)*14, y+Math.sin(a)*14, 10, 6, a, 0, 7); ctx.fill(); } ctx.fillStyle = "#ffd166"; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); } };
    const drawCat = () => { ctx.fillStyle = "#4b5563"; ctx.beginPath(); ctx.ellipse(256, 320, 90, 70, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(256, 230, 60, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(210, 190); ctx.lineTo(230, 240); ctx.lineTo(190, 235); ctx.fill(); ctx.beginPath(); ctx.moveTo(302, 190); ctx.lineTo(282, 240); ctx.lineTo(322, 235); ctx.fill();
      ctx.fillStyle = "#fef08a"; ctx.beginPath(); ctx.arc(236, 225, 10, 0, 7); ctx.arc(276, 225, 10, 0, 7); ctx.fill(); ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(236, 225, 4, 0, 7); ctx.arc(276, 225, 4, 0, 7); ctx.fill();
      ctx.fillStyle = "#f472b6"; ctx.beginPath(); ctx.moveTo(256, 240); ctx.lineTo(248, 250); ctx.lineTo(264, 250); ctx.fill(); };
    const drawMountains = () => { ctx.fillStyle = "rgba(255,255,255,0.85)"; for (let i = 0; i < 4; i++) { ctx.beginPath(); const bx = i*160-40; ctx.moveTo(bx, 512); ctx.lineTo(bx+120, 260+i*20); ctx.lineTo(bx+240, 512); ctx.fill(); } };

    if (/heart|love|cute/.test(d)) drawHearts();
    if (/night|star|space|galaxy/.test(d)) drawStars();
    if (/flower|garden|bloom|sakura/.test(d)) drawFlowers();
    if (/cat|kitten|neko/.test(d)) drawCat();
    if (/mountain|forest|landscape|hill/.test(d)) drawMountains();
    if (!/heart|night|star|flower|cat|mountain|forest|space/.test(d)) {
      // abstract
      for (let i = 0; i < 12; i++) { ctx.fillStyle = `hsla(${Math.random()*360},70%,60%,0.55)`; ctx.beginPath(); ctx.arc(Math.random()*512, Math.random()*512, 30+Math.random()*90, 0, 7); ctx.fill(); }
    }
    // frame + signature
    ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 14; ctx.strokeRect(7, 7, 498, 498);
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.font = "italic 22px Georgia"; ctx.textAlign = "right";
    ctx.fillText("— " + State.settings.aiName + " ♡", 480, 490);
    return c.toDataURL();
  },

  _heart(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x, y + s*0.3); ctx.bezierCurveTo(x-s, y-s*0.5, x-s*0.5, y-s, x, y-s*0.3); ctx.bezierCurveTo(x+s*0.5, y-s, x+s, y-s*0.5, x, y+s*0.3); ctx.fill(); },

  showEasel(dorm, url) {
    // reuse a floating framed canvas in the world in front of the whiteboard
    if (!this._easel) {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.04), new THREE.MeshStandardMaterial({ color: "#8a5a34" }));
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshBasicMaterial({ color: "#fff" }));
      pic.position.z = 0.03; g.add(frame, pic);
      g.position.set(-1.2, 1.5, -3.9);
      this.refs.scene.add(g); this._easel = g; this._easelPic = pic;
    }
    new THREE.TextureLoader().load(url, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; const old = this._easelPic.material.map; if (old && old !== tex) old.dispose(); this._easelPic.material.map = tex; this._easelPic.material.color.set("#fff"); this._easelPic.material.needsUpdate = true; });
    this.toast("🎨 " + State.settings.aiName + " painted something");
    // also show in a floating gallery card
    this.showArtCard(url);
  },

  showArtCard(url) {
    const card = document.createElement("div");
    card.className = "art-card";
    card.innerHTML = `<button class="note-x">×</button><img src="${url}"/>`;
    card.querySelector(".note-x").onclick = () => card.remove();
    makeDraggable(card);
    card.style.right = "24px"; card.style.bottom = "120px";
    this.els.modalRoot.appendChild(card);
  },

  capturePhoto(caption) {
    try {
      const src = this.refs.renderer.domElement;
      const c = document.createElement("canvas"); c.width = 320; c.height = 240;
      const ctx = c.getContext("2d");
      // polaroid
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 320, 240);
      ctx.drawImage(src, 0, 0, src.width, src.height, 10, 10, 300, 190);
      ctx.fillStyle = "#333"; ctx.font = "16px 'Comic Sans MS', cursive"; ctx.textAlign = "center";
      ctx.fillText(caption, 160, 222);
      const url = c.toDataURL("image/jpeg", 0.85);
      State.addToGallery({ type: "photo", url, caption, ts: Date.now() });
      this.showArtCard(url);
      this.toast("📸 Photo saved to gallery");
    } catch (e) { this.toast("📸 (couldn't capture photo)"); }
  },

  // ---------------- minigames ----------------
  startMinigame(game) {
    const root = this.els.modalRoot;
    const modal = document.createElement("div");
    modal.className = "minigame";
    const finish = (resultText) => {
      modal.remove();
      // feed the outcome back so Akuu reacts in character
      this.onSend?.(`(mini-game result — ${resultText})`);
    };
    const close = document.createElement("button"); close.className = "mg-x"; close.textContent = "×"; close.onclick = () => modal.remove();
    modal.appendChild(close);

    if (game === "rps") {
      modal.insertAdjacentHTML("beforeend", `<h3>✊ Rock Paper Scissors</h3><p>Pick one — ${esc(State.settings.aiName)} chooses too!</p><div class="mg-btns"></div>`);
      const btns = modal.querySelector(".mg-btns");
      ["✊ Rock", "✋ Paper", "✌️ Scissors"].forEach((label, i) => {
        const b = document.createElement("button"); b.textContent = label; b.onclick = () => {
          const her = Math.floor(Math.random() * 3);
          const beats = { 0: 2, 1: 0, 2: 1 };
          let r = i === her ? "tie" : beats[i] === her ? "Deku wins" : "Akuu wins";
          Audio.sfx(r === "Akuu wins" ? "coin" : "success");
          finish(`RPS — Deku:${["rock","paper","scissors"][i]} vs Akuu:${["rock","paper","scissors"][her]} → ${r}`);
        }; btns.appendChild(b);
      });
    } else if (game === "coin_flip") {
      modal.insertAdjacentHTML("beforeend", `<h3>🪙 Coin Flip</h3><p>Call it!</p><div class="mg-btns"></div>`);
      const btns = modal.querySelector(".mg-btns");
      ["Heads", "Tails"].forEach((label, i) => { const b = document.createElement("button"); b.textContent = label; b.onclick = () => {
        const res = Math.random() < 0.5 ? 0 : 1; Audio.sfx("coin");
        finish(`Coin flip — Deku called ${label}, landed ${["Heads","Tails"][res]} → ${res === i ? "Deku right!" : "Deku wrong"}`);
      }; btns.appendChild(b); });
    } else if (game === "guess_number") {
      const n = 1 + Math.floor(Math.random() * 10);
      modal.insertAdjacentHTML("beforeend", `<h3>🔢 Guess 1–10</h3><p>${esc(State.settings.aiName)} is thinking of a number…</p><div class="mg-btns"></div>`);
      const btns = modal.querySelector(".mg-btns");
      for (let i = 1; i <= 10; i++) { const b = document.createElement("button"); b.textContent = i; b.onclick = () => { Audio.sfx(i === n ? "levelup" : "error"); finish(`Guess number — Deku guessed ${i}, it was ${n} → ${i === n ? "correct!" : (i < n ? "too low" : "too high")}`); }; btns.appendChild(b); }
    } else if (game === "truth_or_dare") {
      modal.insertAdjacentHTML("beforeend", `<h3>🎭 Truth or Dare</h3><div class="mg-btns"></div>`);
      const btns = modal.querySelector(".mg-btns");
      ["Truth", "Dare"].forEach((label) => { const b = document.createElement("button"); b.textContent = label; b.onclick = () => finish(`Deku picked ${label} — give him a fun ${label.toLowerCase()}!`); btns.appendChild(b); });
    }
    root.appendChild(modal);
  },
};

// ---------------- helpers ----------------
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// strip any leaked tool-call / code markup so the user never sees raw code
function cleanForDisplay(text) {
  if (!text) return "";
  let t = String(text);
  t = t.replace(/```[\s\S]*?```/g, "");                       // fenced code blocks
  t = t.replace(/<\/?(?:function|tool_call|function_call|tool_code)[^>]*>/gi, "");
  t = t.replace(/<function\s*=\s*[a-z_]+\s*>?\s*(?:\{[\s\S]*?\}\s*<\/function>)?/gi, ""); // <function=x>{...}</function>
  t = t.replace(/\{[^{}]*"(?:expression|item|mood|action|code|label|dish|target|place|outfit|caption|type)"[^{}]*\}/gi, ""); // inline tool JSON
  t = t.replace(/\b[a-z_]+\s*\(\s*\{[\s\S]*?\}\s*\)/gi, (m) => (/^(set|get|change|toggle|spawn|play|write|move|adjust|create|start|send|show|focus|give|take|cook|remember|do_|walk_|use_)/.test(m) ? "" : m)); // fn({...}) calls
  t = t.replace(/^\s*\{[\s\S]*?"(?:name|expression|item|mood|action)"[\s\S]*?\}\s*$/gm, ""); // stray tool JSON on its own line
  t = t.replace(/\[[a-z_]+:[^\]]*\]/gi, "");                   // [action:...] tokens
  t = t.replace(/\*?<?[a-z_]{3,}>\s*\{[\s\S]*?\}\s*<\/[a-z_]{3,}>/gi, ""); // *tool>{...}</tool> (weak-model form, nested braces ok)
  t = t.replace(/\*?<?[a-z_]{3,}>[^<>{}]*<\/[a-z_]{3,}>/gi, "");     // *tool>plaintext</tool> (arg as bare text)
  t = t.replace(/<[a-z_]{3,}>\s*\{[^{}]*\}\s*(?:<\/[a-z_]{3,}\s*>)?/gi, ""); // <tool>{...}</tool>
  t = t.replace(/<\/?[a-z]+_[a-z_]+\s*>/gi, "");               // stray snake_case tags like </set_expression>
  t = t.replace(/\*?\b(?:create_anything|particle_effect|set_expression|spawn_object|play_sound|set_lighting|write_whiteboard|send_phone_message|do_activity|walk_to)>\s*\S*/gi, ""); // orphaned opener, no close
  t = t.replace(/\b[a-z]+(?:_[a-z]+)+\s*[=:]\s*["']?[\w .+-]+["']?/gi, "");   // weak-model "set_expression=neutral" / "walk_to: kitchen" leaks
  t = t.replace(/(?:^|[\s(])(?:gesture|expression|mood|emote|particle\w*|sparkles?|lighting|sound|effect)\s*[=:]\s*["']?\w+["']?/gi, " "); // single-word tool leaks ("Gesture=shrug")
  t = t.replace(/\s=\s*[a-z]{3,}\b/gi, "");                    // orphaned "=sparkles"
  return t.replace(/\s{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// lightweight inline markdown → styled segments (bold/italic/code); roleplay
// *actions* render italic. Returns [{text, b?, i?, code?}]
function parseInline(text) {
  const segs = [];
  const push = (tt, st) => { if (tt) segs.push({ text: tt, ...st }); };
  const re = /(\*\*|__)([\s\S]+?)\1|(\*|_)([\s\S]+?)\3|`([^`]+)`/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index), {});
    if (m[1]) push(m[2], { b: true });
    else if (m[3]) push(m[4], { i: true });
    else if (m[5]) push(m[5], { code: true });
    last = re.lastIndex;
  }
  push(text.slice(last), {});
  return segs.length ? segs : [{ text }];
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function moodEmoji(m) { return { happy: "😊", love: "😍", laugh: "😆", blush: "☺️", shy: "😳", sad: "😢", cry: "😭", angry: "😠", pout: "😤", surprised: "😲", sleepy: "😴", wink: "😉", smug: "😏", thinking: "🤔", excited: "🤩", annoyed: "😒", flustered: "😖", determined: "😤", neutral: "🙂" }[m] || "🙂"; }
function prettyTool(id) { return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function wrap(ctx, text, x, y, maxW, lh) { const words = String(text).split(" "); let line = "", yy = y; for (const w of words) { if (ctx.measureText(line + w).width > maxW) { ctx.fillText(line, x, yy); line = w + " "; yy += lh; } else line += w + " "; } ctx.fillText(line, x, yy); }
function makeDraggable(el) {
  // window listeners only exist DURING a drag, so removed cards (and their heavy
  // image dataURLs) can be garbage-collected instead of being pinned forever
  let sx, sy, ox, oy;
  const onMove = (e) => { el.style.left = ox + (e.clientX - sx) + "px"; el.style.top = oy + (e.clientY - sy) + "px"; };
  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  el.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    sx = e.clientX; sy = e.clientY; const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
    el.style.right = "auto"; el.style.bottom = "auto"; el.style.left = ox + "px"; el.style.top = oy + "px";
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  });
}
