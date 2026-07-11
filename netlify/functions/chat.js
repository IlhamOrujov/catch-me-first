// ============================================================================
//  netlify/functions/chat.js  —  Netlify Function LLM proxy
//  Keeps API keys server-side (in Netlify env vars) so they never reach the
//  browser. The client posts the exact provider body to /api/chat; we inject
//  the key and forward, returning the provider's response + status verbatim so
//  the game's existing parsing / error handling keeps working unchanged.
//
//  Netlify → Site settings → Environment variables:
//    GROQ_API_KEY   = gsk_...     (required for Groq)
//    GEMINI_API_KEY = ...         (optional, for Gemini)
//
//  `config.path` maps this function to /api/chat directly — no redirect needed.
// ============================================================================

export const config = { path: "/api/chat" };

const json = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  // Called same-origin by the game, so no permissive CORS header — that also stops
  // other sites from calling your proxy in a browser and draining your quota.
  if (req.method !== "POST") return json({ error: { message: "POST only" } }, 405);

  try {
    const { provider = "groq", model, body } = await req.json();
    if (!body || typeof body !== "object") return json({ error: { message: "missing 'body'" } }, 400);

    let url, headers = { "Content-Type": "application/json" };
    if (provider === "gemini") {
      const key = process.env.GEMINI_API_KEY;
      if (!key) return json({ error: { message: "GEMINI_API_KEY is not set (Netlify → Site settings → Environment variables)." } }, 500);
      const m = encodeURIComponent(model || "gemini-2.0-flash");
      url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
    } else {
      const key = process.env.GROQ_API_KEY;
      if (!key) return json({ error: { message: "GROQ_API_KEY is not set (Netlify → Site settings → Environment variables)." } }, 500);
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers.Authorization = `Bearer ${key}`;
    }

    const upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return json({ error: { message: "proxy error: " + String((e && e.message) || e) } }, 502);
  }
};
