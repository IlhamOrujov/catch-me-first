#!/usr/bin/env bash
# ============================================================================
#  Safe Netlify deploy for Catch Me First.
#  Temporarily moves src/keys.local.js OUT of the upload so your real API keys
#  can never reach the public site (they live on Netlify as env vars instead),
#  deploys the static game + the /api/chat function, then restores the file.
#
#  First time: it'll open a browser to log in / pick a site. That's expected.
#  Make sure GROQ_API_KEY (and optionally GEMINI_API_KEY) are set in
#  Netlify → Site settings → Environment variables.
# ============================================================================
set -e
cd "$(dirname "$0")"

# 1) pull secrets out of the publish set (restored automatically on exit)
if [ -f src/keys.local.js ]; then
  mv src/keys.local.js src/keys.local.js.bak
  trap '[ -f src/keys.local.js.bak ] && mv src/keys.local.js.bak src/keys.local.js' EXIT
fi

# 2) deploy static site + functions to production
npx --yes netlify-cli deploy --prod --dir=. --functions=netlify/functions

echo ""
echo "✓ Deployed. If the app can't reach her brain, set GROQ_API_KEY in"
echo "  Netlify → Site settings → Environment variables, then re-deploy."
