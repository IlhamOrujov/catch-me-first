# Go live — 2 clicks + 1 paste

The whole game (code + models + the key-safe `/api/chat` function) is already in this
repo and tested. The only step that must be **you** is authorising your own Netlify
account once — no CLI, no terminal.

## Deploy
1. Go to **https://app.netlify.com** → **Add new site → Import an existing project**.
2. Choose **GitHub** → authorise → pick **`catch-me-first`** → **Deploy**.
   (Netlify reads `netlify.toml` automatically — nothing to configure.)

## Make her brain work (one paste)
3. New site → **Site settings → Environment variables → Add a variable**:
   - `GROQ_API_KEY` = your `gsk_…` key (it's in `src/keys.local.js` on your Mac)
   - `GEMINI_API_KEY` = *(optional)*
4. **Deploys → Trigger deploy → Deploy site** once so the key takes effect.

Done — she's live at `https://<your-site>.netlify.app`, keys safe on the server.

---

### Why the login has to be you
Deploying to an account means proving the account is yours. I can't be you at that
screen, and I won't fake accounts or handle your tokens — that protects you. Everything
up to that point is finished and verified.

### Prefer the terminal? One command instead of the clicks
```bash
./deploy-netlify.sh
```
Moves your keys out of the upload, deploys the site + function, restores them. Still
opens a browser once to log in.
