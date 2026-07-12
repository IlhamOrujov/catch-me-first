// ============================================================================
//  CATCH ME FIRST — brain.js
//  Akuu's mind. Multi-provider (Groq + Gemini) with automatic API-key rotation
//  to dodge rate limits, and a lean single-call design (she speaks + acts in one
//  request). Handles native tool-calls AND inline-text tool-calls.
// ============================================================================

import { State } from "./state.js";
import { buildSystemPrompt } from "./config.js";
import { toGroqTools, runAbility, abilitiesSummary, ABILITY_MAP } from "./abilities.js";
import { getHotspots } from "./hotspots.js";
import { Emotion } from "./emotion.js";
import { RAG } from "./memory-rag.js";
import { Lifesim } from "./lifesim.js";
import { Mapper } from "./mapper.js";

const KNOWN_TOOLS = new Set(Object.keys(ABILITY_MAP));

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

// scan from an opening "{" to its matching "}" (respecting strings/escapes) so we
// never truncate nested-brace args like create_anything's code. Returns index AFTER
// the closing brace, or -1.
function matchBalanced(str, from) {
  let depth = 0, inStr = false, esc = false;
  for (let i = from; i < str.length; i++) {
    const c = str[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; }
    else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { if (--depth === 0) return i + 1; }
  }
  return -1;
}

// ---- inline tool-call parsing (some models write calls as text) --------------
// Single forward pass; each tool signature pulls a brace-balanced JSON arg so
// nested braces survive and JSON *inside* a string arg is never re-scanned as a
// second (phantom) call.
function extractInlineToolCalls(text) {
  if (!text) return { calls: [], clean: text || "" };
  const calls = [];
  // forms: <function=NAME>, <tool_call>, <NAME>, NAME(, and NAME> (weak models drop the
  // opening "<" and/or wrap the tag in "*", e.g. *create_anything>{...}</create_anything>)
  const sig = /<function\s*=\s*([a-zA-Z_]+)\s*>|<(tool_call|function_call)>|<([a-z_]{3,})>|\b([a-z_]{3,})\s*\(|\b([a-z_]{3,})>/gi;
  let out = "", pos = 0, m, guard = 0;
  while ((m = sig.exec(text)) !== null && guard++ < 300) {
    if (m.index < pos) { sig.lastIndex = pos; continue; }   // inside already-consumed span
    const before = text.slice(pos, m.index);
    let end = m.index + m[0].length;
    const grabJson = () => {
      let j = end; while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "{") { const c = matchBalanced(text, j); if (c > 0) { end = c; return text.slice(j, c); } }
      return null;
    };
    if (m[2]) {                                              // <tool_call>{...}</tool_call>
      const js = grabJson();
      if (js) { try { const o = JSON.parse(js); const nm = o.name || o.function; if (nm) calls.push({ name: nm, args: typeof (o.arguments || o.args || o.parameters) === "string" ? safeParse(o.arguments || o.args || o.parameters) : (o.arguments || o.args || o.parameters || {}) }); } catch {} }
      const tail = text.slice(end).match(/^\s*<\/(?:tool_call|function_call)>/i); if (tail) end += tail[0].length;
      out += before; pos = end; sig.lastIndex = pos;
    } else {
      // m[5] (NAME>) must not be a closing tag "</name>"
      const name = m[1] || m[3] || m[4] || (m[5] && text[m.index - 1] !== "/" ? m[5] : null);
      let args = {}; const js = (name && KNOWN_TOOLS.has(name.toLowerCase())) ? grabJson() : null;
      // the paren form `word(` collides with ordinary prose ("remember (that day)"),
      // so only treat it as a call when a JSON arg actually follows.
      const realCall = name && KNOWN_TOOLS.has(name.toLowerCase()) && !(m[4] && js === null);
      if (realCall) {
        if (js) { try { args = JSON.parse(js); } catch {} }
        if (m[4]) { const tail = text.slice(end).match(/^\s*\)/); if (tail) end += tail[0].length; }
        else { const tail = text.slice(end).match(/^\s*<\/[a-z_]*\s*>/i); if (tail) end += tail[0].length; }
        // absorb a stray leading "*" the model used to wrap the tag
        let b = before; if (m[5] && b.endsWith("*")) b = b.slice(0, -1);
        calls.push({ name: name.toLowerCase(), args });
        out += b; pos = end; sig.lastIndex = pos;
      } else {                                               // not a real tool → keep verbatim
        out += before + text.slice(m.index, end); pos = end;
      }
    }
  }
  out += text.slice(pos);
  // ```json {...}``` fenced form (greedy to the last brace so nesting survives)
  out = out.replace(/```(?:json|tool_code)?\s*(\{[\s\S]*"name"[\s\S]*\})\s*```/g, (mm, json) => {
    try { const o = JSON.parse(json); if (o.name && (o.arguments || o.parameters)) { calls.push({ name: o.name, args: o.arguments || o.parameters || {} }); return ""; } } catch {}
    return mm;
  });
  const clean = out
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")          // reasoning models
    .replace(/<\/?(?:function|tool_call|function_call)[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n").trim();
  return { calls, clean };
}
function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
// never let one throwing tool kill her whole reply
function safeRunAbility(name, args, ctx) {
  try { return runAbility(name, args, ctx); }
  catch (e) { console.warn("[ability]", name, e); return `(${name} hiccuped)`; }
}

// Gemini's Schema wants UPPERCASE type names (STRING, OBJECT, …) and a limited
// field set; our tool schemas use JSON-Schema lowercase. Convert recursively.
function toGeminiSchema(s) {
  if (!s || typeof s !== "object") return s;
  const out = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.properties) { out.properties = {}; for (const k in s.properties) out.properties[k] = toGeminiSchema(s.properties[k]); }
  if (s.items) out.items = toGeminiSchema(s.items);
  if (Array.isArray(s.required) && s.required.length) out.required = s.required;
  return out;
}

export const Brain = {
  ctx: null,
  thinking: false,
  _ki: 0,               // rotating key index
  _proactiveTimer: null,

  setContext(ctx) { this.ctx = ctx; },

  // ---- messages (provider-agnostic OpenAI-ish shape) ----
  _messages(extraSystem) {
    // small models (Groq 8b/instant) have a tiny per-request token budget — send a
    // leaner prompt so we don't 413. The 70B gets the full rich context.
    const small = State.settings.provider === "groq" && /8b|9b|instant/i.test(State.settings.model || "");
    const hs = getHotspots(State);
    const placesText = hs.map((h) => `${h.label} (${h.id})`).join(", ");
    // exact spatial awareness — she knows precisely where everything (and you) is
    const ap = State.world.alicePos;
    let spatialText = "";
    if (ap && small) {
      spatialText = `You're at (${ap.x}, ${ap.z}).` + (State.world.playerPos ? ` ${State.settings.playerName} at (${State.world.playerPos.x}, ${State.world.playerPos.z}).` : "");
    } else if (ap) {
      const dirOf = (dx, dz) => {
        const a = dz < -0.6 ? "bedroom side" : dz > 0.6 ? "living/kitchen side" : "";
        const b = dx < -0.6 ? "to your left" : dx > 0.6 ? "to your right" : "";
        return [b, a].filter(Boolean).join(", ") || "right by you";
      };
      spatialText = `You're at (${ap.x}, ${ap.z}).` +
        (State.world.playerPos ? ` ${State.settings.playerName} is at (${State.world.playerPos.x}, ${State.world.playerPos.z}).` : "") +
        ` You know every spot's exact coordinates: ` +
        hs.filter((h) => h.id !== "aliceSpawn" && h.id !== "playerSpawn").map((h) => {
          const dx = h.pos[0] - ap.x, dz = h.pos[2] - ap.z, d = Math.hypot(dx, dz);
          return `${h.label} (${h.pos[0]},${h.pos[2]}) ${d.toFixed(1)}m ${dirOf(dx, dz)}`;
        }).join("; ") + ".";
    }
    // the Mapper's scanned registry is more precise (real rooms + reachable spots) — prefer it
    if (!small && Mapper.refs && Mapper.rooms?.length) { const mt = Mapper.mapText?.(); if (mt) spatialText = mt; }
    // presence: how close he is right now (or that she's out)
    const pp = State.world.playerPos, ap2 = State.world.alicePos;
    let presenceText = "";
    if (State.world.away) presenceText = "You are currently OUT of the apartment on a little errand — you two are texting.";
    else if (pp && ap2) {
      const d = Math.hypot(pp.x - ap2.x, pp.z - ap2.z);
      presenceText = `${State.settings.playerName} is ${d < 1.8 ? "right next to you" : d < 4 ? "nearby in the same room" : "somewhere across the apartment"} (${d.toFixed(1)}m away).`;
    }
    // shared history: recent timeline + keyword recall from his last message (skip on small models)
    const tlText = small ? "" : (State.timeline || []).slice(-4).map((e) => e.text).join("; ");
    let recallText = "";
    if (!small) {
      const lastUser = [...State.conversation].reverse().find((m) => m.role === "user")?.content || "";
      const words = lastUser.toLowerCase().match(/[a-z]{4,}/g) || [];
      if (words.length) {
        const pool = [...State.memories.map((m) => m.text), ...(State.timeline || []).map((t) => t.text)];
        const scored = pool.map((t) => ({ t, s: words.reduce((n, w) => n + (t.toLowerCase().includes(w) ? 1 : 0), 0) }))
          .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
        if (scored.length) recallText = scored.map((x) => x.t).join("; ");
      }
    }
    const sys = buildSystemPrompt(State.settings, { ...State.world, abilitiesText: abilitiesSummary(), placesText, spatialText, presenceText, emotionText: Emotion.promptBlock?.() || "", simText: Lifesim.promptBlock?.() || "", compact: small });
    const ragBlock = RAG.recallBlock?.() || "";
    const mem = (small ? "" : State.memoryContext())
      + (tlText ? "\n\n# MOMENTS YOU TWO SHARE (recent)\n" + tlText : "")
      + (ragBlock ? "\n\n" + ragBlock : (recallText ? "\nRELEVANT TO WHAT HE JUST SAID: " + recallText : ""));
    const msgs = [{ role: "system", content: sys + (mem ? "\n\n# MEMORY\n" + mem : "") + (extraSystem ? "\n\n" + extraSystem : "") }];
    const convo = State.conversation.filter((m) => m.role === "user" || (m.role === "assistant" && !m.tool_calls)).slice(small ? -6 : -10);
    for (const m of convo) msgs.push({ role: m.role, content: m.content || "" });
    return msgs;
  },

  _keys(provider) {
    const s = State.settings;
    if (provider === "ollama") return ["local"];   // local LLM — no key needed
    if (provider === "gemini") return (s.geminiKeys || []).filter(Boolean);
    const arr = (s.groqKeys || []).filter(Boolean);
    if (arr.length) return arr;
    return s.groqApiKey ? [s.groqApiKey] : [];
  },

  // ---- unified call with key rotation → { content, toolCalls:[{name,args}] } ----
  async _call(messages, { withTools = true } = {}) {
    const provider = State.settings.provider || "groq";
    // use the serverless proxy when explicitly set, or (auto) when there's no client
    // key — i.e. on a public deploy. Keys then live only in Vercel env vars.
    const clientKeys = this._keys(provider).filter((k) => k && k !== "local");
    const useProxy = provider !== "ollama" && (State.settings.apiMode === "proxy" ||
      (State.settings.apiMode !== "direct" && clientKeys.length === 0));
    const keys = useProxy ? ["proxy"] : this._keys(provider);
    if (!keys.length) throw new Error(provider === "gemini" ? "NO_GEMINI_KEY" : "NO_KEY");

    let lastErr, waited = false;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[(this._ki + i) % keys.length];
      try {
        const raw = (tools, lite) => provider === "ollama" ? this._rawOllama(messages, tools, lite)
          : provider === "gemini" ? this._rawGemini(messages, tools, key, lite, useProxy)
          : this._rawGroq(messages, tools, key, lite, useProxy);
        // small models get the lite tool set by default (full schemas overflow their limits)
        const liteDefault = provider === "groq" && /8b|9b|instant/i.test(State.settings.model || "");
        let res;
        try { res = await raw(withTools, liteDefault); }
        catch (e1) {
          // fumbled/oversized structured call (400 failed_generation, 413 too large) →
          // fallback ladder: lite schemas → no schemas (inline parser still catches actions).
          // Skip the lite rung if we were already lite (would just re-fail identically).
          if (withTools && /400|413|failed_generation|Failed to call|too large/i.test(e1.message)) {
            try { res = liteDefault ? await raw(false, false) : await raw(true, true); }
            catch (e2) { res = await raw(false, false); }
          } else throw e1;
        }
        this._ki = (this._ki + i) % keys.length;   // stick with the key that worked
        return res;
      } catch (e) {
        lastErr = e;
        const retryable = /_(429|401|403|500|502|503)/.test(e.message);
        if (!retryable) throw e;
        // if this is the last key and it's a per-minute limit, wait once then retry the round
        const perMinute = /_429/.test(e.message) && !/_DAILY/.test(e.message);
        if (i === keys.length - 1 && perMinute && !waited) {
          const m = e.message.match(/try again in ([\d.]+)s/i);
          const ms = Math.min(15000, Math.ceil((m ? parseFloat(m[1]) : 4) * 1000) + 300);
          this.ctx?.ui.showRateLimit?.(Math.ceil(ms / 1000));
          await new Promise((r) => setTimeout(r, ms));
          waited = true; i = -1; continue;   // restart the key loop after waiting
        }
      }
    }
    throw lastErr;
  },

  async _rawGroq(messages, withTools, key, lite = false, viaProxy = false) {
    const s = State.settings;
    // small models have a tiny TPM budget — a big max_tokens reservation alone can 413
    const small = /8b|9b|instant/i.test(s.model || "");
    const body = { model: s.model, messages, temperature: s.temperature, max_tokens: small ? Math.min(s.maxTokens, 550) : s.maxTokens, top_p: s.topP };
    if (withTools && s.abilitiesEnabled) { const t = toGroqTools(lite); if (t.length) { body.tools = t; body.tool_choice = "auto"; } }
    const res = viaProxy
      ? await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "groq", model: s.model, body }) })
      : await fetch(GROQ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      // Static host with no serverless function: /api/chat isn't real, so the host
      // answers the POST with 404/405 (often an nginx HTML page). Don't dump HTML —
      // tell the player to add their own key.
      if (viaProxy && (res.status === 404 || res.status === 405 || /<html|<!doctype/i.test(t))) throw new Error("NO_BACKEND");
      const daily = /per day|TPD/i.test(t); throw new Error(`GROQ_${res.status}${daily ? "_DAILY" : ""}: ${t.slice(0, 150)}`);
    }
    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    const toolCalls = (msg.tool_calls || []).map((tc) => { let args = {}; try { args = JSON.parse(tc.function.arguments || "{}"); } catch {} return { name: tc.function.name, args }; });
    return { content: msg.content || "", toolCalls };
  },

  // streamed Groq turn — fills the chat bubble token-by-token via the UI
  async _streamGroq(messages) {
    const s = State.settings;
    const keys = this._keys("groq").filter((k) => k && k !== "local");
    const key = keys[this._ki % keys.length];
    const small = /8b|9b|instant/i.test(s.model || "");
    const body = { model: s.model, messages, temperature: s.temperature, max_tokens: small ? Math.min(s.maxTokens, 550) : s.maxTokens, top_p: s.topP, stream: true };
    if (s.abilitiesEnabled) { const t = toGroqTools(small); if (t.length) { body.tools = t; body.tool_choice = "auto"; } }
    const res = await fetch(GROQ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) { const t = await res.text().catch(() => ""); throw new Error(`GROQ_${res.status}: ${t.slice(0, 120)}`); }
    this.ctx.ui.streamStart();
    const reader = res.body.getReader(), dec = new TextDecoder();
    let content = "", buf = "", tool = {};
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim(); if (!data || data === "[DONE]") continue;
          try {
            const d = JSON.parse(data).choices?.[0]?.delta;
            if (d?.content) { content += d.content; this.ctx.ui.streamDelta(content); }
            if (d?.tool_calls) for (const tc of d.tool_calls) { const i = tc.index ?? 0; (tool[i] ||= { name: "", args: "" }); if (tc.function?.name) tool[i].name += tc.function.name; if (tc.function?.arguments) tool[i].args += tc.function.arguments; }
          } catch {}
        }
      }
    } catch (e) { if (!content) throw e; }   // mid-stream break with content → keep what we got
    const toolCalls = Object.values(tool).filter((t) => t.name).map((t) => { let args = {}; try { args = JSON.parse(t.args || "{}"); } catch {} return { name: t.name, args }; });
    return { content, toolCalls };
  },

  async _rawGemini(messages, withTools, key, lite = false, viaProxy = false) {
    this._geminiLite = lite;
    const s = State.settings;
    const { systemInstruction, contents } = this._toGemini(messages);
    const body = { contents, generationConfig: { temperature: s.temperature, maxOutputTokens: s.maxTokens, topP: s.topP } };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    if (withTools && s.abilitiesEnabled) { const fns = this._geminiTools(); if (fns.length) body.tools = [{ functionDeclarations: fns }]; }
    const res = viaProxy
      ? await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "gemini", model: s.geminiModel, body }) })
      : await fetch(GEMINI_URL(s.geminiModel, key), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      if (viaProxy && (res.status === 404 || res.status === 405 || /<html|<!doctype/i.test(t))) throw new Error("NO_BACKEND");
      const daily = /per day|PerDay/i.test(t); throw new Error(`GEMINI_${res.status}${daily ? "_DAILY" : ""}: ${t.slice(0, 150)}`);
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    let content = ""; const toolCalls = [];
    for (const p of parts) { if (p.text) content += p.text; if (p.functionCall) toolCalls.push({ name: p.functionCall.name, args: p.functionCall.args || {} }); }
    return { content, toolCalls };
  },

  // local LLM via Ollama — no rate limits, fully private
  async _rawOllama(messages, withTools, lite = false) {
    const s = State.settings;
    const url = (s.ollamaUrl || "http://localhost:11434").replace(/\/$/, "") + "/api/chat";
    const body = { model: s.ollamaModel || "llama3.1", messages, stream: false, options: { temperature: s.temperature, num_predict: s.maxTokens } };
    if (withTools && s.abilitiesEnabled) { const t = toGroqTools(lite); if (t.length) body.tools = t; }
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(`OLLAMA_${res.status}: ${t.slice(0, 150)}`); }
    const data = await res.json();
    const msg = data.message || {};
    const toolCalls = (msg.tool_calls || []).map((tc) => ({
      name: tc.function?.name,
      args: typeof tc.function?.arguments === "string" ? safeParse(tc.function.arguments) : (tc.function?.arguments || {}),
    })).filter((t) => t.name);
    return { content: msg.content || "", toolCalls };
  },

  _toGemini(messages) {
    const sys = []; const contents = [];
    for (const m of messages) {
      if (m.role === "system") sys.push(m.content);
      else if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.content || "" }] });
      else if (m.role === "assistant") contents.push({ role: "model", parts: [{ text: m.content || "" }] });
    }
    if (!contents.length || contents[0].role !== "user") contents.unshift({ role: "user", parts: [{ text: "(hi)" }] });
    return { systemInstruction: sys.length ? { parts: [{ text: sys.join("\n\n") }] } : undefined, contents };
  },

  _geminiTools() {
    return toGroqTools(this._geminiLite).map((t) => {
      const f = t.function;
      if (!f.parameters?.properties || Object.keys(f.parameters.properties).length === 0)
        return { name: f.name, description: f.description };
      return { name: f.name, description: f.description, parameters: toGeminiSchema(f.parameters) };
    });
  },

  // ---- main entry ----
  async send(userText, { silent = false } = {}) {
    if (State.settings.frozen) { this.ctx?.ui.toast("Akuu is frozen (admin)."); return; }
    if (this.thinking) return;
    this.thinking = true;
    try {
      State.bus.emit("brain:thinking", true);
      try { this.ctx?.akuu.setExpression("thinking"); } catch {}
      if (userText && !silent) { State.conversation.push({ role: "user", content: userText }); State.stats.messages++; Emotion.observeUser?.(userText); State.bus.emit("user:said", userText); }

      try { if (userText) await RAG.prepare(userText); } catch {}   // semantic recall for this turn
      const messages = this._messages();
      // stream Groq token-by-token when possible (feels alive); fall back cleanly
      let content, toolCalls, streamed = false;
      const groqKeys = this._keys("groq").filter((k) => k && k !== "local");
      const canStream = State.settings.streaming !== false && (State.settings.provider || "groq") === "groq"
        && State.settings.apiMode !== "proxy" && groqKeys.length > 0 && !silent && this.ctx?.ui?.streamStart;
      if (canStream) {
        try { const r = await this._streamGroq(messages); content = r.content; toolCalls = r.toolCalls; streamed = true; }
        catch (e) { console.warn("[stream] fallback:", e.message); this.ctx?.ui?.streamCancel?.(); }
      }
      if (!streamed) { const r = await this._call(messages, { withTools: State.settings.abilitiesEnabled }); content = r.content; toolCalls = r.toolCalls; }

      const usedTools = [];
      for (const tc of toolCalls) usedTools.push({ name: tc.name, args: tc.args, result: safeRunAbility(tc.name, tc.args, this.ctx) });
      const parsed = extractInlineToolCalls(content);
      for (const call of parsed.calls) usedTools.push({ name: call.name, args: call.args, result: safeRunAbility(call.name, call.args, this.ctx) });

      const final = parsed.clean;
      State.conversation.push({ role: "assistant", content: final });
      State.save();
      try { if (userText) RAG.add(userText, "chat"); if (final) RAG.add(final, "chat"); } catch {}   // remember this exchange

      if (streamed) this.ctx.ui.streamEnd(final, { tools: usedTools });
      else State.bus.emit("akuu:say", { text: final, tools: usedTools, actedOnly: !final && usedTools.length > 0 });
      this._resetExpressionSoon();
      return { text: final, tools: usedTools };
    } catch (e) {
      this._handleError(e);
    } finally {
      this.thinking = false; State.bus.emit("brain:thinking", false);
    }
  },

  // One-shot reply AS another character (phone contacts / "other girls"). Uses a
  // throwaway message list so it NEVER touches Alice's conversation state or tools.
  // Throws on no-key / backend errors so the caller can fall back to canned lines.
  async sendAs(personaPrompt, history, userText) {
    const messages = [{ role: "system", content: personaPrompt }];
    for (const m of (history || []).slice(-8)) messages.push({ role: m.from === "you" ? "user" : "assistant", content: String(m.text || "") });
    messages.push({ role: "user", content: userText });
    const { content } = await this._call(messages, { withTools: false });
    return String(content || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
  },

  async proactive() {
    const nudges = [
      "(Deku has been quiet a while. Do something spontaneous and in-character — comment on the time/weather, start a small activity, tease him. Speak AND use a tool.)",
      "(A quiet moment passes. Do a small human thing in the room and mention it — you live here too.)",
      "(You suddenly notice or remember something. Bring it up unprompted, like a roommate would.)",
    ];
    return this.nudge(nudges[Math.floor(State.stats.messages % nudges.length)]);
  },

  // fire a specific self-initiated moment (used by events/romance for confessions,
  // date-night dialogue, coming home from an outing…)
  async nudge(nudgeText) {
    if (State.settings.frozen || this.thinking) return;
    this.thinking = true;
    try {
      State.bus.emit("brain:thinking", true);
      const messages = this._messages(nudgeText);
      const { content, toolCalls } = await this._call(messages, { withTools: State.settings.abilitiesEnabled });
      const usedTools = [];
      for (const tc of toolCalls) usedTools.push({ name: tc.name, args: tc.args, result: safeRunAbility(tc.name, tc.args, this.ctx) });
      const parsed = extractInlineToolCalls(content);
      for (const call of parsed.calls) usedTools.push({ name: call.name, args: call.args, result: safeRunAbility(call.name, call.args, this.ctx) });
      if (parsed.clean || usedTools.length) {
        State.conversation.push({ role: "assistant", content: parsed.clean });
        State.bus.emit("akuu:say", { text: parsed.clean, tools: usedTools, proactive: true });
        State.save();
      }
    } catch (e) { /* stay quiet on proactive errors */ }
    finally { this.thinking = false; State.bus.emit("brain:thinking", false); }
  },

  _handleError(e) {
    console.error("[brain]", e);
    const ctx = this.ctx; const msg = String(e.message);
    if (msg.includes("NO_BACKEND")) { ctx?.ui.systemLine("💤 This site has no AI backend, so Akuu can't think here yet. Open ⚙️ settings and paste a free Groq key (groq.com → API Keys) — it stays in your browser and wakes her up instantly."); ctx?.akuu.setExpression("sleepy"); return; }
    else if (msg.includes("NO_GEMINI_KEY")) ctx?.ui.systemLine("⚠️ No Gemini key set. Add one in the 🛠️ Admin panel, or switch the provider back to Groq.");
    else if (msg.includes("NO_KEY")) { ctx?.ui.systemLine("⚠️ No API key set. Open ⚙️ settings (or Admin) and paste your Groq key to wake Akuu up."); ctx?.akuu.setExpression("sleepy"); }
    else if (msg.includes("401") || msg.includes("403")) ctx?.ui.systemLine("⚠️ Your API key was rejected. Double-check it in ⚙️ / Admin.");
    else if (msg.includes("_DAILY")) { const alt = (State.settings.provider === "groq" && !String(State.settings.model).includes("8b")) ? " Try “Llama 3.1 8B (instant)” in ⚙️ — separate daily budget." : ""; ctx?.ui.systemLine("🌙 Today's free token budget is used up on every one of your keys for this model (resets daily)." + alt); ctx?.akuu.setExpression("sleepy"); }
    else if (msg.includes("429")) ctx?.ui.systemLine("⏳ All your keys are rate-limited right now. Give it a few seconds…");
    else if (msg.includes("OLLAMA_")) ctx?.ui.systemLine("⚠️ Can't reach Ollama — is `ollama serve` running with the model pulled? (" + msg.slice(0, 80) + ")");
    else if (msg.includes("GEMINI_")) ctx?.ui.systemLine("⚠️ Gemini error: " + msg);
    else if (msg.includes("GROQ_")) ctx?.ui.systemLine("⚠️ Groq error: " + msg);
    else ctx?.ui.systemLine("⚠️ Trouble reaching Akuu's brain: " + msg);
    if (!msg.includes("_DAILY") && !msg.includes("NO_")) ctx?.akuu.setExpression("sad");
    // when the brain is genuinely unreachable (rate/quota), still let HER say something
    // in character so the game never feels dead — but not on every failure (anti-spam)
    if (/_DAILY|429|GROQ_5|GEMINI_5|OLLAMA_/.test(msg) && Date.now() - (this._lastCanned || 0) > 25000) {
      this._lastCanned = Date.now();
      const CANNED = ["mmh… my head's all fuzzy right now, gimme a sec ♡", "ugh, my brain's buffering… ask me again in a bit?", "*taps her temple* …thoughts not loading. one moment~", "i totally spaced out — say that again in a minute?"];
      setTimeout(() => State.bus.emit("akuu:say", { text: CANNED[Math.floor(Date.now() / 1000) % CANNED.length], tools: [], idle: true }), 400);
    }
  },

  _resetExpressionSoon() {
    clearTimeout(this._exprTimer);
    this._exprTimer = setTimeout(() => { if (!this.thinking) this.ctx?.akuu.setExpression("neutral"); }, 8000);
  },

  startProactive() {
    this.stopProactive();
    const loop = () => {
      const s = State.settings;
      if (!s.proactiveMessages || this.thinking || s.frozen) { this._proactiveTimer = setTimeout(loop, 15000); return; }
      if (Math.random() < 0.6) this.proactive();
      this._proactiveTimer = setTimeout(loop, Math.max(30, s.proactiveIntervalSec) * 1000);
    };
    this._proactiveTimer = setTimeout(loop, Math.max(30, State.settings.proactiveIntervalSec) * 1000);
  },
  stopProactive() { clearTimeout(this._proactiveTimer); },
};
