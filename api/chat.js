// ============================================================================
//  /api/chat — Vercel serverless proxy for the LLM providers.
//  Keeps API keys server-side (in Vercel env vars) so they never reach the
//  browser. The client sends the exact provider body; we inject the key and
//  forward, returning the provider's response (and status) verbatim so the
//  client's existing parsing / error handling keeps working.
//
//  Set in Vercel → Project → Settings → Environment Variables:
//    GROQ_API_KEY   = gsk_...        (required for Groq)
//    GEMINI_API_KEY = ...            (optional, for Gemini)
// ============================================================================

export default async function handler(req, res) {
  // No permissive CORS on purpose: the game calls this same-origin, so it needs no
  // CORS header — and omitting `Access-Control-Allow-Origin: *` stops other websites
  // from calling your proxy in a browser and draining your Groq quota.
  if (req.method !== "POST") { res.status(405).json({ error: { message: "POST only" } }); return; }

  try {
    let { provider = "groq", model, body } = req.body || {};
    if (typeof req.body === "string") { const p = JSON.parse(req.body); provider = p.provider || "groq"; model = p.model; body = p.body; }
    if (!body || typeof body !== "object") { res.status(400).json({ error: { message: "missing 'body'" } }); return; }

    let url, headers = { "Content-Type": "application/json" };
    if (provider === "gemini") {
      const key = process.env.GEMINI_API_KEY;
      if (!key) { res.status(500).json({ error: { message: "GEMINI_API_KEY is not set on the server (Vercel → Settings → Environment Variables)." } }); return; }
      const m = encodeURIComponent(model || "gemini-2.0-flash");
      url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`;
    } else {
      const key = process.env.GROQ_API_KEY;
      if (!key) { res.status(500).json({ error: { message: "GROQ_API_KEY is not set on the server (Vercel → Settings → Environment Variables)." } }); return; }
      url = "https://api.groq.com/openai/v1/chat/completions";
      headers.Authorization = `Bearer ${key}`;
    }

    const upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (e) {
    res.status(502).json({ error: { message: "proxy error: " + String(e && e.message || e) } });
  }
}
