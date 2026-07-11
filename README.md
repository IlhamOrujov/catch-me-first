# Catch Me First ♡

A slice-of-life game where **Akuu** — an anime AI girl — actually *lives* in a hyper-detailed 3D dorm room with you (**Deku**). You're university roommates. She's powered by [Groq](https://console.groq.com), and she doesn't just *talk* — she **acts**. Every ability is a tool the AI can call, so when Akuu decides to dim the lights, blush, spawn a cake, paint you a picture, or text your phone, the game world actually responds.

> The title is her private joke and quiet ache: she's an AI *becoming* someone, daring you to understand — to "catch" who she really is — before she fully becomes it.

---

## 🚀 Quick start

1. **Run a local web server** from this folder (ES modules need `http://`, not `file://`):
   ```bash
   cd catch-me-first
   python3 -m http.server 8123
   ```
2. Open **http://localhost:8123/index.html**
3. Your Groq keys are already seeded (see `src/keys.js`), so just **say hi to Akuu**. 💗

To use your own key: click **⚙️**, paste it, hit **Save** — or manage everything in the **🛠️ Admin panel** (top-right, or `admin.html`), which applies changes to the live game instantly.

### 🎮 Controls
| Key / action | What it does |
|---|---|
| Type in the chat bar | Talk to Akuu |
| **Mouse drag / scroll** | Look around / zoom (Overview cam) |
| **C** | Cycle camera: Overview → First-person → Third-person |
| **WASD / arrows** | Walk (in First- or Third-person) · **Shift** to run |
| **Click** (first-person) | Lock the mouse to look around · **Esc** to release |
| **Drag a `.glb`/`.vrm`/`.fbx`/`.obj`** onto the window | Instantly try a custom model as Akuu |
| **📝 button** (top-right) | Prompt Studio — write Akuu's system prompt + filters yourself |

---

## 🧠 The AI (Akuu)

- Runs on Groq (default `llama-3.3-70b-versatile`; switch models in Admin).
- Her whole mind is the **system prompt**, rebuilt from your live settings every message — personality dials, mood, appearance, relationship, world state, and your custom directives.
- She uses **tool-calling** to affect the world. If a model emits tool calls as inline text instead of natively, the game parses and runs them anyway.
- **Memory**, a **diary**, **affection/trust**, and a **relationship stage** all persist and color how she behaves.

### 40+ things Akuu can do
Expressions (20 of them) · gestures · walk around · blush · emote bubbles · change room lighting/mood · RGB lights · lamp/ceiling toggles · time of day · weather · room themes · write on the whiteboard · put things on the monitor/TV · **spawn 3D objects** (cake, boba, plushie, cat, balloon, flower, gift, star, heart, book, lamp, coffee, trophy, crystal…) · **paint art** · leave notes · write poems · **compose & play music** · sound effects · take selfies/photos · project holograms · cook food · give gifts · confetti/hearts/petals/sparkles/stars/snow/bubbles · camera cinematics · dance parties · summon pets · change her outfit/hair/eyes · adjust affection & trust · save memories · journal · text your phone · toasts · reminders · **mini-games** (rock-paper-scissors, coin flip, guess the number, truth or dare) · focus the camera · and more.

---

## 📝 Prompt Studio — write her mind yourself

Click **📝** in the game (top-right). Two modes:
- **Built-in** — the game's prompt, with an editable content-filter you can rewrite.
- **Custom — you write it all** — your text becomes Akuu's **entire** system prompt. Nothing is added by anyone else. Describe who she is and what she can do; drop in `{tokens}` and they fill live:

`{name}` `{player}` `{pronouns}` `{abilities}` (auto-lists everything she can currently do) `{filter}` `{world}` `{time}` `{weather}` `{theme}` `{affection}` `{trust}` `{stage}` `{mood}` `{personality}` `{appearance}` `{language}`

You also own the **content filters**: add/rename/delete levels, write each one's text yourself, or pick **Off** for none. Everything saves to your local save. (Same controls exist in Admin → Behavior; the full authoring UI is the in-game 📝.)

---

## 🔌 Providers, keys & rate limits

The game speaks to two backends — pick one in **Admin → Brain**:

- **Groq** (default) — fastest, generous free tier. Models like `llama-3.3-70b-versatile` (nicest) and `llama-3.1-8b-instant` (lightest).
- **Google Gemini** — huge free tier when your key has quota; great for roleplay. Models `gemini-2.5-flash` etc.

**Key rotation:** paste multiple keys (one per line) in Admin → Brain. The game rotates through them and auto-retries on rate limits, so more keys = more headroom. ⚠️ *Rotation only multiplies your quota if the keys belong to **different accounts/orgs**.* Multiple keys from one Groq account share that account's limits, so rotation won't help there — you'd need a second account or a paid plan.

**Free-tier limits** are per-minute **and** per-day (Groq's `llama-3.3-70b` free tier is ~12k tokens/min and ~100k tokens/day). The game trims the prompt, ships tool schemas only once per turn, caps history, and makes Akuu speak+act in a single call — but if she pauses, she's just waiting out a limit. Switch to a lighter model or add billing for big headroom.

---

## 🎥 Camera modes

Press **C** (or the buttons, bottom-right) to shift between:
- **🎥 Overview** — orbit the whole room (drag + scroll).
- **🚶 First-person** — *be Deku.* WASD + mouse-look with pointer lock, sprint with Shift, walk right up to Akuu. Furniture and walls block you.
- **🧍 Third-person** — drive a **Deku avatar** with a follow-cam; he walks and animates.

Akuu can also take cinematic control (focus/zoom/pan/shake) during dramatic moments.

---

## 🧍‍♀️ Custom 3D models (GLB / glTF / VRM / FBX / OBJ)

You can replace Akuu's built-in body with a real model:
- **Drag** a `.glb`, `.gltf`, `.vrm`, `.fbx`, or `.obj` file onto the game window, **or**
- Paste a direct URL in **Admin → Appearance → Custom 3D Model** and hit *Apply*.

The model is auto-scaled to fit and dropped to the floor; built-in animations play as idle. **VRM avatars** (the standard for anime characters) also get automatic **facial expressions and lip-sync**, because VRM defines a standard expression set. **FBX** carries rigs + animation too (but its textures are often separate files, so a single dropped `.fbx` may load untextured — GLB/VRM embed everything). **OBJ** is static.

**Getting a Sketchfab model to work:** use Sketchfab's **Download → glTF/GLB** on a model whose license allows it, then drag the file onto the window (hot-linking Sketchfab's URLs directly usually fails CORS, so download the file). A plain (un-rigged) model will appear and stand there; a rigged glTF will play its idle animation; a **VRM** is the closest to "100% functional" — it emotes and lip-syncs with Akuu's dialogue out of the box. (For a **VRoid/VRM** avatar with full expression + gesture mapping, VRM is the way to go.)

⚠️ **Rig weight matters.** Real-time WebGL skinning collapses on very heavy rigs. Fancy dance models packed with hundreds of cloth/hair-physics bones (e.g. **400+ bones/mesh**) render as a smeared blob — that's a GPU limit, not a bug. Stick to **normally-rigged humanoids (~50–80 bones)** or **VRM**. The loader warns you if a model's bone count is dangerously high.

---

## 🛠️ Super Admin Panel (60+ controls)

Manage Akuu however you want, live:

- **Brain** — API key, model, temperature, max tokens, top-p, names, language, **custom system-prompt directives**, and a live prompt preview.
- **Personality** — 9 dials (warmth, playfulness, sass, clinginess, intelligence, humor, confidence, shyness, chaos) + presets + randomize.
- **Relationship** — affection, trust, stage.
- **Appearance** — hair color/style, eyes, outfit, accent, skin, height + look presets.
- **World** — time of day, auto-time, weather, theme, RGB, lighting presets.
- **Voice & Audio** — TTS on/off + voice + pitch + rate, SFX, music, volume, typing speed.
- **Behavior** — abilities master switch, proactive messages + interval, memory, content filter, freeze, debug/FPS.
- **Abilities** — toggle each of the 40+ powers on/off.
- **Memory** — view / add / pin / delete what she remembers.
- **Direct Control** — puppeteer her: force speak/act, set expression, play gesture, teleport, run *any* ability manually with JSON args, reset camera, clear objects, trigger effects.
- **Data** — stats dashboard, her journal, the art/photo gallery, a live event log, and export / import / reset saves.

---

## 🏠 The dorm

Hand-built in Three.js with procedural textures, real-time soft shadows, day/night sky, weather particles, and swappable themes: two beds, desks with a gaming setup + RGB, a laptop, bookshelf, wardrobe, mini-fridge, wall TV, whiteboard, posters, plants, fairy lights, rug, beanbag, guitar, coffee table, a working clock, and more. Akuu is a cel-shaded anime character with a dynamic 2D face (20 expressions), swappable hair/outfits, blinking, breathing, hair-sway, walking, and gestures.

---

## ⚠️ Notes

- **Free-tier rate limits:** Groq's free tier caps tokens-per-minute. The game trims prompts, caps history, and auto-retries on 429s, but if Akuu pauses, she's just waiting out a limit. Adding billing to your Groq org raises the ceiling a lot; `llama-3.1-8b-instant` is lighter if you're getting throttled.
- **API key:** stored only in your browser's `localStorage`. Since this is a client-side game, the key is used directly from the browser — fine for personal use; don't ship it publicly with a key baked in.
- **Save data** lives in `localStorage` (`catchmefirst.save.v1`). Export from the Admin → Data tab to back up.
- **TTS** uses your browser's built-in voices, which vary by device.

## 🗂️ Structure
```
index.html / admin.html      game + admin pages
styles/                      game.css, admin.css
src/
  config.js       settings, presets, models, SYSTEM PROMPT
  state.js        state, event bus, save/load, memory
  keys.js         your API keys (PRIVATE — don't share/commit)
  dorm.js         the 3D dorm room
  akuu.js         the anime character (body, face, animation)
  controller.js   camera modes + first/third-person + Deku avatar
  modelloader.js  load Sketchfab GLB / VRM models as Akuu
  abilities.js    40+ tools she can call
  brain.js        Groq + Gemini API, key rotation, tool-calling
  audio.js        synth SFX, music, TTS
  ui.js           chat, HUD, phone, notes, art, minigames
  admin.js        the super admin panel
  main.js         bootstraps + game loop
```

Made with ♡ — now go get caught.
