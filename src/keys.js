// ============================================================================
//  keys.js — SAFE TO DEPLOY. Contains NO secrets.
//  Real keys are provided at runtime by src/keys.local.js (git/vercel-ignored),
//  which runs before the app and sets window.__CMF_KEYS__. On a public deploy
//  that file is absent, so this exports empty arrays and the app talks to the
//  serverless /api/chat proxy (keys stay in Vercel env vars, never in the client).
// ============================================================================

const fromWindow = (typeof window !== "undefined" && window.__CMF_KEYS__) || {};

export const SEED_KEYS = {
  groqKeys: Array.isArray(fromWindow.groqKeys) ? fromWindow.groqKeys : [],
  geminiKeys: Array.isArray(fromWindow.geminiKeys) ? fromWindow.geminiKeys : [],
};
