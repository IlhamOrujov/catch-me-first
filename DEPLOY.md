# 🚀 Deploying Catch Me First to Vercel

This project is **ready to deploy** — it's a static site (`index.html` + `src/` + `styles/` + `assets/`) plus one serverless function (`api/chat.js`) that keeps your API keys secret.

> **Security in one line:** your real keys live only in `src/keys.local.js` (git- & vercel-ignored) for local play, and in **Vercel environment variables** for the live site. They are **never** shipped to visitors' browsers.

---

## ✅ One-time setup

### 1. Get a free Groq API key
- Go to **console.groq.com/keys** → create a key (starts with `gsk_...`).
- (Optional) A Gemini key from **aistudio.google.com** for the Gemini provider.

### 2. Deploy the folder
Easiest — the Vercel dashboard:
1. Push this folder to a **GitHub repo** (or use the Vercel CLI, below).
2. On **vercel.com → Add New → Project**, import the repo.
3. Framework preset: **Other** (it's a static site — no build step). Leave build/output settings empty.
4. Click **Deploy**.

Or with the CLI:
```bash
npm i -g vercel
cd "catch-me-first"
vercel            # first run links/creates the project
vercel --prod     # promote to production
```

### 3. Add your key as an environment variable (this is what makes it work)
In **Vercel → your project → Settings → Environment Variables**, add:

| Name             | Value            | Environments            |
|------------------|------------------|-------------------------|
| `GROQ_API_KEY`   | `gsk_...`        | Production, Preview, Dev |
| `GEMINI_API_KEY` | *(optional)*     | Production, Preview, Dev |

Then **redeploy** (Deployments → ⋯ → Redeploy) so the function picks up the variable.

That's it. Visitors can now play **without needing any key of their own** — every request goes through `/api/chat`, which injects your key server-side.

---

## 🔒 How the key handling works

- **Locally** (`python3 server.py` on your machine): `src/keys.local.js` sets `window.__CMF_KEYS__`, so the game talks to Groq/Gemini directly with your keys. Fast, no proxy needed.
- **Deployed** (no `keys.local.js` in the bundle): the client has no keys, so it automatically routes through **`/api/chat`**, which reads `GROQ_API_KEY` from the environment. Keys stay on the server.
- You can force a mode in Admin → Brain (or `settings.apiMode`): `"auto"` (default), `"direct"` (client keys), or `"proxy"` (always use the function).
- A harmless `404 /src/keys.local.js` in the browser devtools **on the live site is expected** — that file is intentionally not deployed.

---

## ⚠️ Things to know

- **Asset size / bandwidth.** `assets/` is ~86 MB (two VRM avatars + the apartment GLB + textures), downloaded once per new visitor (cached for a year after). On Vercel's Hobby plan (100 GB/mo) that's ~1,100 fresh visits/month. If you expect more, host the big files on a CDN / Vercel Blob / Cloudflare R2 and point the URLs there, or swap in lighter models.
- **First load is heavy** (~10–20 s on the first visit) while those assets download. It's cached afterward.
- **Three.js loads from unpkg** (see the import map in `index.html`). Works as-is; for max resilience you can self-host `three.module.js` under `assets/` and update the import map.
- **Keep `src/keys.local.js` private.** It's already in `.gitignore` and `.vercelignore`. If a key ever leaks, revoke it at console.groq.com/keys.
- **The proxy uses your quota.** Anyone who visits your live URL and chats is spending *your* Groq free-tier tokens (that's the point — visitors don't need keys). CORS is locked to same-origin so other *websites* can't call it, but someone determined could still script the endpoint directly. If you get abused: rotate the key, or gate it — add Vercel **BotID** / a simple rate-limit, or a shared password the client sends. For a small share among friends this is fine as-is.
- **Custom domain:** add it under Vercel → Settings → Domains.

---

## 🧪 Verify after deploying
1. Open the live URL, click **Move in →**.
2. Press **T**, say "hi" — she should reply (that confirms the proxy + env var work).
3. If she says *"GROQ_API_KEY is not set on the server"*, you skipped step 3 or didn't redeploy.
