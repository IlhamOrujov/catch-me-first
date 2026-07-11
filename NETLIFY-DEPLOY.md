# Deploying Catch Me First to Netlify

**Yes — it's ready and verified.** Static game + one serverless function (`/api/chat`)
that keeps your API keys server-side. The proxy was tested end-to-end (real Groq call → 200).

## Fastest way (CLI, keys stay safe)
```bash
./deploy-netlify.sh
```
This moves `src/keys.local.js` out of the upload (so your keys never go public),
deploys the game + function, then restores it. First run opens a browser to log in.

Then set your keys as **environment variables** on the site (once):
Netlify → **Site settings → Environment variables**
```
GROQ_API_KEY   = gsk_...        (copy from src/keys.local.js)
GEMINI_API_KEY = ...            (optional)
```
Re-run the script (or "Deploy" in the dashboard) and she's live.

## Or via Git (auto-deploys on every push)
`git` is already initialised and `.gitignore` excludes `keys.local.js`, so your
keys never enter the repo.
```bash
git add -A && git commit -m "Catch Me First"
# create a repo on GitHub, then:
git remote add origin <your-repo-url> && git push -u origin main
```
Netlify → **Add new site → Import from Git** → pick the repo → deploy
(no build command; publish directory `.`). Add the same env vars as above.

## Good to know
- **Keys are safe**: `keys.local.js` is gitignored and excluded by the script; the
  live site talks to `/api/chat`, which reads the keys from Netlify env vars.
- **First load is ~97 MB** (the apartment + two avatars). Netlify's free tier gives
  100 GB/month ≈ ~1,000 first-visits. Plenty for personal use; they're cached after.
- **On the live site replies don't token-stream** (streaming needs client-side keys;
  the proxy returns the full reply) — the typewriter still animates it. Everything
  else — memory, emotion, life, dreams, Mochi, the works — runs fully client-side.
- **Function timeout** is 10s on the free tier; the default 70B usually answers well
  under that. If you ever see timeouts, switch to “Llama 3.1 8B (instant)” in ⚙️.
- **VRoid Live bridge** only exists on the local `python3 server.py`; on the live
  site the Studio just shows “bridge offline” (load models by URL / VRoid Hub instead).
