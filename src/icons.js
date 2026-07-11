// ============================================================================
//  CATCH ME FIRST — icons.js   ("Our own icon set")
//  Replaces the stock platform emoji in the UI chrome with a cohesive set of
//  custom line icons (theme-coloured, rounded, one visual language) so the game
//  looks branded instead of "WhatsApp default emoji". A DOM walker + observer
//  swaps mapped emoji everywhere EXCEPT inside chat bubbles (her expressive
//  emoji stay as her voice). Unmapped emoji are left untouched.
// ============================================================================

const S = (inner, opts = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${opts}>${inner}</svg>`;
const FILL = (path) => `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">${path}</svg>`;

// icon key → svg markup
const ICONS = {
  menu: S(`<path d="M4 7h16M4 12h16M4 17h16"/>`),
  settings: S(`<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M3 12h2.2M18.8 12H21M5.2 18.8l1.6-1.6M17.2 6.8l1.6-1.6"/>`),
  tools: S(`<path d="M14.5 5.5a3.5 3.5 0 0 0 4.6 4.6L21 12l-8 8-2-2 5.5-5.5"/><path d="M6 14l-3 3 2 2 3-3"/><path d="M8.5 8.5 4 4"/>`),
  games: S(`<rect x="2.5" y="7" width="19" height="10" rx="4"/><path d="M7 11v2M6 12h2M15.5 11.5h.01M18 13.5h.01"/>`),
  calendar: S(`<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/>`),
  palette: S(`<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.5-1.3.4-2.4 1.8-2.4H18a3 3 0 0 0 3-3c0-4.7-4-8.5-9-8.5Z"/><circle cx="8" cy="12" r="1"/><circle cx="9.5" cy="8" r="1"/><circle cx="14.5" cy="8" r="1"/>`),
  map: S(`<path d="M9 4 3.5 6.2v13.3L9 17l6 2.5 5.5-2.2V4L15 6.5 9 4Z"/><path d="M9 4v13M15 6.5v13"/>`),
  brain: S(`<path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a2.6 2.6 0 0 0-1.5 4.7A2.6 2.6 0 0 0 7 16.5a2.5 2.5 0 0 0 4.9.6V5a2.5 2.5 0 0 0-2.4-.5Z"/><path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a2.6 2.6 0 0 1 1.5 4.7A2.6 2.6 0 0 1 17 16.5a2.5 2.5 0 0 1-4.9.6"/>`),
  build: S(`<path d="M3 21h18M5 21V9l7-4 7 4v12"/><path d="M9 21v-5h6v5"/>`),
  story: S(`<path d="M6 4h10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H6Z"/><path d="M6 4a2 2 0 0 0-2 2v11a2 2 0 0 1 2-2"/><path d="M9 8h6M9 11h6"/>`),
  chart: S(`<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="2.6" height="5" rx="1"/><rect x="11.7" y="8" width="2.6" height="9" rx="1"/><rect x="16.4" y="5" width="2.6" height="12" rx="1"/>`),
  diary: S(`<path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 3v18M11 8h5M11 11h5"/>`),
  phone: S(`<rect x="6.5" y="2.5" width="11" height="19" rx="3"/><path d="M10.5 18.5h3"/>`),
  camera: S(`<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.3"/><path d="M8.5 7 10 4.5h4L15.5 7"/>`),
  mic: S(`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>`),
  whisper: S(`<path d="M4 9v6h3l5 4V5L7 9H4Z"/><path d="M15 9.5s1 1 1 2.5-1 2.5-1 2.5"/><path d="M20 5 4 21" stroke-width="1.6"/>`),
  sound: S(`<path d="M4 9v6h3l5 4V5L7 9H4Z"/><path d="M15.5 9.5s1.2 1 1.2 2.5-1.2 2.5-1.2 2.5M18 7s2 1.7 2 5-2 5-2 5"/>`),
  heart: FILL(`<path d="M12 20.5S3.5 15 3.5 8.9C3.5 6 5.7 4 8.2 4c1.7 0 3 .9 3.8 2 .8-1.1 2.1-2 3.8-2 2.5 0 4.7 2 4.7 4.9 0 6.1-8.5 11.6-8.5 11.6Z"/>`),
  heartOutline: S(`<path d="M12 20.5S3.5 15 3.5 8.9C3.5 6 5.7 4 8.2 4c1.7 0 3 .9 3.8 2 .8-1.1 2.1-2 3.8-2 2.5 0 4.7 2 4.7 4.9 0 6.1-8.5 11.6-8.5 11.6Z"/>`),
  compass: S(`<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>`),
  note: S(`<path d="M4 4h16v11l-4 4H4V4Z"/><path d="M16 19v-4h4M8 9h8M8 12.5h5"/>`),
  pin: S(`<path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10Z"/><circle cx="12" cy="11" r="2.2"/>`),
  flower: S(`<circle cx="12" cy="12" r="2.4"/><path d="M12 9.6c0-3 3.6-3 3.6 0M14.4 12c3 0 3 3.6 0 3.6M12 14.4c0 3-3.6 3-3.6 0M9.6 12c-3 0-3-3.6 0-3.6"/>`),
  moon: S(`<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>`),
  sparkle: FILL(`<path d="M12 2.5c.4 3.6 2.4 5.6 6 6-3.6.4-5.6 2.4-6 6-.4-3.6-2.4-5.6-6-6 3.6-.4 5.6-2.4 6-6Z"/><path d="M18.5 14c.2 1.7 1.1 2.6 2.8 2.8-1.7.2-2.6 1.1-2.8 2.8-.2-1.7-1.1-2.6-2.8-2.8 1.7-.2 2.6-1.1 2.8-2.8Z"/>`),
  star: FILL(`<path d="M12 3l2.5 5.4L20 9.2l-4 4 1 5.8-5-2.9-5 2.9 1-5.8-4-4 5.5-.8L12 3Z"/>`),
  starLine: S(`<path d="M12 3.5l2.4 5 5.1.7-3.7 3.7.9 5.2-4.7-2.6-4.7 2.6.9-5.2L4.5 9.2l5.1-.7L12 3.5Z"/>`),
  arrowR: S(`<path d="M5 12h13M13 6l6 6-6 6"/>`),
  undo: S(`<path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1"/>`),
  close: S(`<path d="M6 6l12 12M18 6 6 18"/>`),
  check: S(`<path d="M5 12.5 10 17 19 7"/>`),
  warn: S(`<path d="M12 3.5 21 19H3l9-15.5Z"/><path d="M12 10v4M12 17h.01"/>`),
  question: S(`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.9.4-1.4 1-1.4 2M12 17h.01"/>`),
  chat: S(`<path d="M4 5h16v11H9l-4 3.5V16H4V5Z"/><path d="M8 9.5h8M8 12.5h5"/>`),
  image: S(`<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17 4.5-4 3 2.6 3-2.6 4.5 4"/>`),
  thought: S(`<path d="M6 6.5C6 4.6 8 3 10.5 3S15 4.6 15 6.5 13 10 10.5 10 6 8.4 6 6.5Z"/><circle cx="7" cy="13" r="1.4"/><circle cx="4.5" cy="16" r="1"/>`),
  call: S(`<path d="M6 3.5c1 0 1.7.6 2 1.6l.7 2.3c.2.8 0 1.4-.6 1.9l-1 .8a11 11 0 0 0 4.5 4.5l.8-1c.5-.6 1.1-.8 1.9-.6l2.3.7c1 .3 1.6 1 1.6 2v1.9c0 1.3-1.1 2.3-2.4 2.1C10 22.7 3.3 16 3.3 7.9 3.1 6.6 4.1 5.5 5.4 5.5"/>`),
  tv: S(`<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M8 3.5 12 6l4-2.5"/>`),
  gift: S(`<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M4 13h16M12 9v11M12 9c-1-3-5-3-5-.5S10 9 12 9Zm0 0c1-3 5-3 5-.5S14 9 12 9Z"/>`),
  ring: S(`<circle cx="12" cy="14" r="5.5"/><path d="m9.5 8 2.5-4 2.5 4"/>`),
  cards: S(`<rect x="8" y="4.5" width="11" height="15" rx="2" transform="rotate(8 13.5 12)"/><path d="M6 7 3.5 16.5a2 2 0 0 0 1.4 2.4l4 1.1"/>`),
  pan: S(`<circle cx="10.5" cy="13.5" r="6"/><path d="M16 11h6M20.5 9v4"/>`),
  coin: S(`<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.8 9.3a2.2 2.2 0 0 1 4.4 0M14.2 14.7a2.2 2.2 0 0 1-4.4 0" stroke-width="1.6"/>`),
  trash: S(`<path d="M5 7h14M9 7V5h6v2M6.5 7l1 12h9l1-12"/>`),
  masks: S(`<path d="M3.5 6.5c3 0 5 0 7 1v6c0 2-2 3.5-3.5 3.5S3.5 15.5 3.5 13V6.5Z"/><path d="M13.5 7.5c2-1 4-1 7-1V13c0 2-2 3.5-3.5 3.5"/>`),
  house: S(`<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>`),
  refresh: S(`<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20v-4h4"/>`),
  joystick: S(`<circle cx="12" cy="7" r="3.5"/><path d="M12 10.5V16M8 20l4-4 4 4"/>`),
  book: S(`<path d="M4 5c2-1 5-1 8 0v14c-3-1-6-1-8 0V5Z"/><path d="M20 5c-2-1-5-1-8 0v14c3-1 6-1 8 0V5Z"/>`),
  hand: S(`<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.6-2.1L4 15.5a1.6 1.6 0 0 1 2.4-2L8 15"/>`),
  wave: S(`<path d="M18 8c1.2-1.2 3-1.2 4 0M17.5 5.5c1.8-1.8 4.5-1.8 6.3 0" transform="translate(-4 -1)"/><path d="M7 12.5 9.5 10a1.4 1.4 0 0 1 2 2l-1 1 3.5-3.5a1.4 1.4 0 0 1 2 2L15 15.5a6 6 0 0 1-8.5 0L4 13a1.4 1.4 0 0 1 2-2l1 1.5Z"/>`),
  couch: S(`<path d="M4 11V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/><path d="M3 12a1.6 1.6 0 0 1 1.6 1.6V16h14.8v-2.4A1.6 1.6 0 0 1 21 12M5 18v1.5M19 18v1.5M4.6 16h14.8"/>`),
  dance: S(`<circle cx="13" cy="5" r="2"/><path d="M13 7v5l3 3M13 12l-3 1-2 4M13 9l4-1M8 21l2-4"/>`),
  selfie: S(`<rect x="6" y="3" width="12" height="18" rx="3"/><circle cx="12" cy="10" r="2.2"/><path d="M8.5 16c.8-1.5 6.2-1.5 7 0"/>`),
  hotspot: S(`<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="6.5" stroke-width="1.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/>`),
  music: S(`<path d="M9 17V6l10-2v11"/><circle cx="6.5" cy="17" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>`),
  clapper: S(`<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 8l3-4 3.5 3M8 4l3.5 3M13 4l3.5 3.5"/>`),
  // mood faces (custom — one visual language)
  faceHappy: S(`<circle cx="12" cy="12" r="9"/><path d="M8.6 10.4h.01M15.4 10.4h.01" stroke-width="2.7"/><path d="M8.3 13.8a4.2 4.2 0 0 0 7.4 0"/>`),
  faceSmile: S(`<circle cx="12" cy="12" r="9"/><path d="M8.6 10.6h.01M15.4 10.6h.01" stroke-width="2.7"/><path d="M9 14.5c1.6 1.4 4.4 1.4 6 0"/>`),
  faceNeutral: S(`<circle cx="12" cy="12" r="9"/><path d="M8.6 10.6h.01M15.4 10.6h.01" stroke-width="2.7"/><path d="M9 15h6"/>`),
  faceSad: S(`<circle cx="12" cy="12" r="9"/><path d="M8.6 10.6h.01M15.4 10.6h.01" stroke-width="2.7"/><path d="M9 16a4.2 4.2 0 0 1 6 0"/>`),
  faceAnnoyed: S(`<circle cx="12" cy="12" r="9"/><path d="M7.6 9.5l2 1M16.4 9.5l-2 1M9 15.5h6"/><path d="M9 11.6h.01M15 11.6h.01" stroke-width="2.5"/>`),
  faceSleepy: S(`<circle cx="12" cy="12" r="9"/><path d="M8 11c.7-.6 1.6-.6 2.4 0M13.6 11c.8-.6 1.7-.6 2.4 0M10 15.5h4"/>`),
  faceSurprised: S(`<circle cx="12" cy="12" r="9"/><path d="M8.6 10h.01M15.4 10h.01" stroke-width="2.7"/><circle cx="12" cy="15" r="1.7"/>`),
  faceThinking: S(`<circle cx="12" cy="12" r="9"/><path d="M8.6 10.6h.01M15.4 10.6h.01" stroke-width="2.7"/><path d="M9 15.5c1.5-.8 3-.4 6 0"/>`),
};

// mood name → face icon key
const FACE = {
  happy: "faceHappy", laugh: "faceHappy", excited: "faceHappy", love: "faceHappy", giddy: "faceHappy",
  blush: "faceSmile", wink: "faceSmile", smug: "faceSmile", content: "faceSmile", cozy: "faceSmile", affectionate: "faceSmile", playful: "faceSmile",
  neutral: "faceNeutral", bored: "faceNeutral",
  sad: "faceSad", cry: "faceSad", lonely: "faceSad", shy: "faceSad", flustered: "faceSad", down: "faceSad", upset: "faceSad",
  angry: "faceAnnoyed", pout: "faceAnnoyed", annoyed: "faceAnnoyed", determined: "faceAnnoyed", irritated: "faceAnnoyed", restless: "faceAnnoyed",
  sleepy: "faceSleepy", tired: "faceSleepy",
  surprised: "faceSurprised",
  thinking: "faceThinking", focused: "faceThinking",
};
export function moodIcon(mood) { return iconHTML(FACE[mood] || "faceNeutral"); }
export function doingIcon() { return iconHTML("clapper"); }

// stock emoji → our icon key (UI chrome only; unmapped emoji are left alone)
const MAP = {
  "☰": "menu", "⚙": "settings", "🛠": "tools", "🎮": "games", "📅": "calendar", "🎨": "palette",
  "🗺": "map", "🧠": "brain", "🏗": "build", "📜": "story", "📊": "chart", "📔": "diary", "📓": "diary",
  "📱": "phone", "📸": "camera", "🎥": "camera", "🎤": "mic", "🤫": "whisper", "🔊": "sound",
  "❤": "heart", "♥": "heart", "💗": "heart", "💞": "heart", "💕": "heart", "♡": "heartOutline",
  "🧭": "compass", "📝": "note", "🧷": "pin", "📍": "pin", "🌸": "flower", "🌙": "moon",
  "✨": "sparkle", "✦": "starLine", "⭐": "star", "🌟": "star", "→": "arrowR", "➤": "arrowR",
  "↩": "undo", "↻": "refresh", "✕": "close", "×": "close", "✓": "check", "⚠": "warn", "❓": "question",
  "💬": "chat", "🖼": "image", "💭": "thought", "📞": "call", "📺": "tv", "🎁": "gift", "💍": "ring",
  "🃏": "cards", "🍳": "pan", "💰": "coin", "🗑": "trash", "🎭": "masks", "🏠": "house",
  "🕹": "joystick", "📖": "book", "🤚": "hand", "👋": "wave", "🛋": "couch", "💃": "dance",
  "🤳": "selfie", "🥰": "heart", "🤗": "heart", "♪": "music", "🎵": "music", "🎶": "music", "🧍": "hotspot",
};

export function iconHTML(key) { return ICONS[key] ? `<span class="ci">${ICONS[key]}</span>` : ""; }
export function forEmoji(ch) { const k = MAP[ch]; return k ? iconHTML(k) : null; }

// swap mapped emoji inside a subtree, skipping chat bubbles + inputs
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SVG", "PATH"]);
function inChat(node) { let p = node.parentElement; while (p) { if (p.classList && (p.classList.contains("msg") || p.id === "chatLog" || p.classList.contains("phone-msg") || p.classList.contains("ph-msg"))) return true; p = p.parentElement; } return false; }
const EMOJI_RE = /[←-⇿☀-➿⬀-⯿\u{1f000}-\u{1faff}☰♡♥❤⚙⚠]/u;

export const Icons = {
  init() {
    this._swap(document.body);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.target && (m.target.nodeType === 1) && inChat(m.target.firstChild || m.target)) continue;   // ignore chat churn
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) this._swap(n);
          else if (n.nodeType === 3) this._swapText(n);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
    return this;
  },
  _swap(root) {
    if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.classList?.contains("ci")) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue && EMOJI_RE.test(n.nodeValue) && !SKIP.has(n.parentElement?.tagName) && !inChat(n)) ? 1 : 2,
    });
    const texts = []; let t; while ((t = walker.nextNode())) texts.push(t);
    for (const tn of texts) this._swapText(tn);
  },
  _swapText(tn) {
    const v = tn.nodeValue; if (!v || inChat(tn) || SKIP.has(tn.parentElement?.tagName)) return;
    if (!EMOJI_RE.test(v)) return;
    let changed = false;
    const frag = document.createDocumentFragment();
    // split into runs, replacing mapped emoji with icon spans
    const chars = [...v]; let buf = "";
    for (const ch of chars) {
      const html = MAP[ch] ? iconHTML(MAP[ch]) : null;
      if (html) { if (buf) { frag.append(buf); buf = ""; } const s = document.createElement("span"); s.className = "ci-w"; s.innerHTML = html; frag.append(s.firstChild); changed = true; }
      else buf += ch;
    }
    if (buf) frag.append(buf);
    if (changed) tn.parentNode?.replaceChild(frag, tn);
  },
};
