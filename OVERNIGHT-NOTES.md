# 🎨 CUSTOM ICON SET — no more stock emoji (newest — read first)

Every stock platform emoji in the UI chrome is now a **custom line icon** in one cohesive visual language — the game looks *designed/branded*, not "WhatsApp default". `icons.js`:
- ~55 hand-built SVG line icons (theme-coloured, rounded, currentColor) + **custom mood faces** for the mood chip.
- A **DOM walker + MutationObserver** swaps mapped emoji everywhere — HUD, the ☰ drawer, panels, phone, chat bar, toasts, even elements added later — **automatically**. 49+ live on screen.
- **Scoped**: it skips chat bubbles, so *her* emoji (♡ 🥺 ✨) stay as her voice. Verified: chat keeps emoji, chrome is all custom.
- Unmapped/rare emoji are left untouched (no breakage). Runs after HudMenu so its button logic is unaffected.

To add/tweak an icon: edit the `ICONS` map (key → SVG) and `MAP` (emoji → key) in `src/icons.js`.

---

# ✨ THE "150× BETTER" PASS

A big cinematic + depth pass. Everything below is wired, live-tested (screenshots + logic), and coexists at a clean 3-button HUD with no console errors.

- **🎬 Cinematic post-processing** (`postfx.js`) — real EffectComposer pipeline: MSAA → **bloom** (lights & LED strips glow) → colour-grade + **vignette** + film grain → ACES output. The grade **shifts with the time of day** (golden warmth at dusk, cool + dim at night). Crash-safe (falls back to plain render) and the auto-tuner drops it first on weak GPUs. Off by default on phones.
- **🌌 Atmosphere** (`atmosphere.js`) — the **sky/background colour drifts through the day**, fog tracks it, and ~200 **dust motes float in the light**. Instantly makes the space feel breathed-in.
- **🔊 Ambient soundscape** (`ambient.js`) — a cozy **pad**, **generative lofi** notes on a warm scale, **rain** that fades in with the weather, and soft **footsteps** as she walks. Starts on your first click.
- **☰ HUD drawer** (`hudmenu.js`) — the ~14 tool buttons are gathered behind ONE **☰ menu** (a clean labelled grid); only ⚙️ Settings, 🛠️ Admin stay in the bar. A MutationObserver even catches the map tool that appears after the apartment loads.
- **💬 Streaming replies** (`brain.js`) — her Groq answers now **stream in token-by-token** (feels alive), tool-calls still run, and it **falls back cleanly** to the normal path on any hiccup. Also strengthened the weak-model tool-leak cleaner.
- **📔 Reflection + dreams** (`reflection.js`) — at night she **writes a real diary entry** about the day, and some nights she **dreams** (a gorgeous set-piece of ~44 floating glowing orbs while she sleeps + a murmured line) — then **brings the dream up in the morning**.
- **🐱 Mochi the cat** (`pet.js`) — the cat from her memory is real now: built from primitives, **wanders the real nav-floor**, naps, trots over to Alice or you, sways her tail, and **purrs when you pet her** (click her).

---

# 🗺️ SHE KNOWS THE MAP NOW (the "doesn't know what's where" fix)

You didn't need a new map — the fix was **reading the one you have**. New `mapper.js` + 🗺️ button:

- **Auto room-scan** — reads the GLB's real geometry and finds the 3 rooms (bedroom · living room & kitchen · bathroom & corridor) with exact bounds, then **tags every one of her places with its real room** (bed→bedroom, fridge→kitchen, …). Verified 14/14 tagged correctly.
- **Click-to-teach** — open 🗺️, hit **teach** on any place, then **click that real object in the apartment**. It snaps the spot to the exact click, finds the **nearest walkable nav-cell** so she can actually reach it, faces her toward it, and locks it (auto-scan never overwrites a spot you taught). ~5 min to make the whole apartment pixel-perfect.
- **Her prompt now says** *"Bed in the bedroom at (1.7,-2.4)… you are in the living room & kitchen"* — real rooms + exact coords + her live position — instead of bare guessed numbers. That's the actual "she knows what's where" fix, and it works on **any** map (including a custom one later).
- Note: this apartment names furniture at *room* level, so auto-placement nails rooms but leaves exact furniture spots to click-to-teach (that's the 5-min pass). Positions kept their sensible defaults; nothing got flung to a corner.

---

# 🌙 NIGHT 2 — the 10 big builds (live log)

Building 10 huge features autonomously. Server: `python3 server.py` → localhost:8123. Progress:

- ✅ **#5 Character Studio + VRoid** (`studio.js`, 🎨 button). Local VRoid bridge: drop a `.vrm` into `vroid-drop/` (or run `VROID_WATCH="/your/vroid/exports" python3 server.py`) and it appears in the Studio — click to load, or flip **VRoid Live** to auto-load the newest export the instant you save in VRoid Studio. Also: load by URL, live recolor (hair/outfit/eyes — auto-detects VRoid material names), expression preview, and **Companions** (save the current her — name/look/personality/voice — and switch between multiple AIs). VRoid Hub OAuth = future (needs your app registration).
- ✅ **#6 Emotional model + drift** (`emotion.js`). Real affect: valence/arousal mood that persists and decays to a baseline set by closeness+warmth; **good/bad days**; reads your chat sentiment (compliments lift her, insults sting + form a **grudge** that fades over ~2 days); **opinions & inside jokes** she curates via the new `note_feeling` tool; and **personality drift** — treat her well over days and warmth rises / shyness falls (bounded ±18 from her original). Feeds a live "inner state" block into her prompt and drives the HUD mood + expressions.
- ✅ **#7 RAG memory** (`memory-rag.js`, 🧠 button). Persistent IndexedDB vector store of every chat turn + event (thousands, not the old 200 cap). Fuzzy semantic retrieval (hashed tf + char-trigrams, cosine) feeds the most relevant memories into her prompt each turn — she recalls names/preferences/specifics from way back. Searchable memory browser. (Local embeddings; a neural upgrade is a documented future toggle.)
- ✅ **#8 Neural voice + lip-sync** (`emotion`-aware `audio.js` + viseme system). Real per-character **viseme lip-sync** (5 VRM mouth shapes that morph, not open/close), best-voice auto-pick (grabbed "Samantha"), **mood-driven prosody** (excited=faster/higher, sad=slower/lower), and a **🤫 whisper mode** toggle. (True neural TTS still needs a paid API; this is the best browser voice + expressive delivery.)
- ✅ **#9 Life Sim 2.0** (`lifesim.js`, 📅 button). 6 **skills** (cooking/art/music/study/fitness/social) that gain XP as she does the matching activity and **level up** (she brags as she improves); a **job + ¤money** (earns wages working her hours); an **editable weekly calendar** she actually follows; ¤100 starter allowance.
- ✅ **#10 Phone OS** (`phone.js`, 📱 button, bottom-right). A real little smartphone: **Messages** (persistent thread, you reply → she answers, unread badge), **Gallery** (your photos + her art), **Memories** (auto story-feed), **Call** (voice-call her), **Status** (her live mood/needs/bond). She texts you here unprompted.
- ✅ **#11 Build Mode** (`buildmode.js`, 🏗️ button). Decorate the apartment: buy 12 furniture/decor items with her ¤, drop them on the floor, drag to move, rotate/scale/delete (50% refund), it all persists, and **she reacts** to what you add. (Decor is cosmetic; hotspot auto-rebind was scoped out.)
- ✅ **#12 Story engine** (`story.js`, 📜 button). Authored branching quests with **choices that matter**, a cinematic **camera director**, and reality-engine set-pieces. 3 arcs so far: *Moving In*, *A Rainy Day In*, *Stargazing* (unlocks at 50 affection — camera pans to a spawned starfield, a real confession beat). Quests unlock by affection/weather/night or you start them from the log. Authoring is just data — add to the `QUESTS` array (format documented at the top of the file).
- ✅ **#13 Co-op minigames** (`minigames.js`, 🎮 button). Play WITH her: **🃏 Memory Match** (find pairs, she gasps at each), **🍳 Rhythm Cooking** (tap SPACE on the beat — accuracy = dish quality + cooking XP), **❓ Quiz Night** (she quizzes you on how well you know her). Winning nudges affection + her mood; she cheers/teases throughout.
- ✅ **#14 Mobile + PWA** (`mobile.js` + `manifest.webmanifest` + `sw.js`). **Installable PWA** (add to home screen, offline shell via service worker — network-first so deploys stay fresh, and it *skips localhost* so dev is never stale). Touch: a **virtual joystick** to move, first-person touch-look, third-person nudge (best on touch). **Responsive**: HUD wraps, panels become bottom-sheets, phone goes fullscreen. A **perf tier** dials the renderer down on phones.

## 🎉 ALL 10 DONE — verified end-to-end
Every feature was reloaded and tested (screenshots + logic checks). The only console noise is a stale `setPointerCapture` warning from my *synthetic test clicks* — real input never triggers it. New HUD buttons: 🎨 Studio · 🧠 Memory · 📅 Week · 🏗️ Build · 📜 Story · 🎮 Games · 📱 Phone (bottom-right) · 🤫 whisper (chat bar). Next up when you're back: the Vercel deploy (server proxy for keys is already scaffolded from Night 1 — see below).

---

# 🛡️ HARDENING PASS + VERCEL READY (read this first)

A focused 2-hour pass: 4 parallel agents swept every module, I fixed **28 confirmed bugs**, added real improvements, then made the whole thing **Vercel-deployable safely**.

## Biggest bugs fixed (these mattered)
- **Saves could silently die forever.** Full-res PNG photos were stuffed into localStorage; one or two cinema shots overflowed the 5MB quota and then *every* save (affection, memories, diary…) silently failed. Photos now live in their own storage key, downscaled to JPEG, hard-capped at 12 — the core save can never be corrupted again.
- **Her whole brain could latch "thinking" forever** (one stray error → she'd never respond again). Restructured with try/finally so it always recovers.
- **The reality engine broke on complex requests** — the tool-call parser truncated any code containing `{ }` (which all real code has). Rewrote it with a proper brace-matching scanner; also catches 5 different formats weak models emit.
- **A bad AI script could freeze the entire game** (physics on a missing object). The whole game loop is now crash-proof — one failing system can never stop the render loop.
- **Gifting was completely broken** (the 🎁 menu closed itself instantly). Fixed — flowers/boba/cake/plushie/ring all work now.
- **She could get stuck invisible** if commanded during an outing. Fixed.
- **Stuck-detection thrashed on 120/144Hz displays** (made her veer randomly). Now frame-rate independent.
- Plus: GPU memory leaks (magic/textures/dropped models), event-listener leaks, a self-XSS in minigames, storm lighting compounding, and ~15 more.

## Made better
- **VRM gestures now actually work** — wave/hug/heart/dance/peace/point animate her arms & head. They were completely no-op on the VRM before (she's a VRM), so every romance interaction was invisible. Now they show.
- **First-run welcome** explaining controls + how to add a key (press **Move in →**).
- **Small-model support**: a compact prompt + capped output so the 8B fallback fits its tiny rate limit (was 413-ing). One request ≈ 2,600 tokens now.
- **Global error boundary** — a stray error shows a small notice and keeps going instead of dying silently.
- **Auto graphics-tuning** — if FPS stays low (weak GPU), it drops pixel-ratio then shadows so it stays smooth.
- Chat tool-code leaks cleaned up further (weak models wrapped calls in `*`/dropped brackets).

## ▶️ Deploying to Vercel — SEE `DEPLOY.md`
It's ready. In short:
1. Push to GitHub → import on vercel.com (framework: **Other**, no build step).
2. **Settings → Environment Variables → add `GROQ_API_KEY` = your gsk_… key**, then redeploy.
3. Visitors play with **no key needed** — requests route through `api/chat.js` (serverless), which injects your key server-side.

**Your real keys are safe:** they now live only in `src/keys.local.js` (git- & vercel-ignored) for local play, and in Vercel env vars for the live site — **never in the browser bundle**. A `404 /src/keys.local.js` on the live site is expected/harmless. (Locally nothing changes — your keys still work, seeded from that file.)

> ⚠️ `assets/` is ~86 MB; that's ~1,100 fresh visits/month on Vercel's free bandwidth. See DEPLOY.md if you need more.

---

# 🌌 THE REALITY ENGINE — ultimate sandbox

**Say anything → it becomes real.** Alice now has a `create_anything` power: she writes actual JavaScript that executes live in the game. Tested end-to-end:
- Scripted **car crash** — car drives in, explodes with debris physics, camera shake, screen flash, Alice screams "WHAT THE— did a CAR just hit our house?!"
- Told her *"make a UFO appear with a glowing green beam"* in chat → **she wrote the code herself** and a glowing beam appeared.

Her api: primitives (box/sphere/cyl/cone/torus/plane/group/light/text) · ready-mades (car/tree/rock) · api.tween, api.physics (gravity/bounce/spin), api.onUpdate, api.after/every · api.explode/boom/shake/flash/burst · time/weather/lights/rgb · her own body (walk/say/express/gesture) · tag/find/remove/clear. Raw THREE + scene too — full engine control.

- Script errors get fed back into her mind so she **fixes her own code** next turn.
- "clear the magic" / wipe_magic undoes everything scripted.
- **Small-model support:** 8B gets a lite tool set automatically (fixes the 413 "request too large"); 400 "failed to call function" now falls back gracefully. **The 70B writes way more cinematic scripts** — switch back when its daily quota resets (currently on 8b-instant because 70B's daily budget got spent testing).

---

# 💥 MEGA BUILD 2 — all 30 ideas (read this first)

Everything below was built and live-verified. New buttons in-game: **❤ Interact** (bottom-right, glows when near her) · **📊 Needs** · **📔 Her diary** · **📸 Photo mode (P)** · **🎤 Voice** (in the chat bar).

## The 15 big ideas
1. **Real A\* pathfinding** — nav grid baked from the collision mesh (501 walkable cells, 21ms); she routes through doorways like a person, paths get smoothed, unreachable spots are abandoned gracefully.
2. **Voice conversation** — click 🎤, talk; it transcribes and sends (browser STT, language follows her Language setting).
3. **She holds & uses objects** — real props parented to her hand bone: mug (coffee/tea), book (reading/studying), phone (scrolling), pan (cooking), bowl (eating), pen (drawing), cloth (cleaning). Plus she **actually sits** (sofa/desk/dining) and **dozes with eyes closed** when sleeping.
4. **📊 Needs & mood panel** — live bars (energy/fullness/fun/social/fresh), her mood, what she's doing, days together.
5. **Relationship timeline** — every milestone/gift/first is recorded forever; see it in 📔 (persists & exports with saves).
6. **Outings** — she genuinely leaves through the front door sometimes, is "out ♡" for a few minutes, then comes home with a story.
7. **Co-op activities** — 📺 Watch TV together (movie lighting + her commentary), she quizzes/studies, date-night dinner.
8. **24h life** — morning coffee ritual, midday studying, evening cooking, sleeping at night (eyes closed, zzz).
9. **Outfit swapping via VRoid** — make outfit variants in VRoid Studio, export VRMs, map them in Admin → Appearance (`pajamas = assets/models/alice-pajamas.vrm`). When she changes outfit, her whole model swaps.
10. **She texts your desktop** — real browser notifications when the tab is hidden ("come home soon 🥺"). Allow notifications when asked.
11. **Dynamic events** — love notes on the fridge, memory callbacks ("remember when…"), humming, weather comments, coming to find you.
12. **Real weather sync** — in-game weather = your actual weather (verified live: 26°C). Toggle in Admin → Behavior.
13. **Poke her** — click/tap her; she reacts based on how close you two are.
14. **Local LLM (Ollama)** — provider option in Admin → Brain; `ollama serve` + llama3.1 = unlimited, private, no rate limits. (Also: Groq tool-call fumbles now auto-retry without schemas, so replies never die on a 400.)
15. **📸 Photo/cinema mode** — press P: UI hides, letterbox, film filters (warm/dreamy/noir/retro), captures to the gallery.

## The 15 romance ideas
1. **Affection-gated closeness** — the ❤ menu unlocks as she falls for you: headpats (30), hugs (40), date night (50), slow dance (55), cuddling (65), her confession (70), the ring (80), official (85).
2. **Slow dance** — romantic lights + music + petals.
3. **She initiates** — love notes, coming over to you, spontaneous moments, and at 70 affection **she confesses on her own**.
4. **🌙 Date night** — she cooks, candlelight vibe, dinner at the table, genuinely romantic dialogue.
5. **Sofa cuddles** — she sits and leans; soft lines.
6. **Blush/fluster scaling** — her reactions to pokes/hugs/compliments soften and deepen with affection.
7. **Longing & reunion** — apart 4+ minutes → she lights up and greets you when you return; texts you when the tab's hidden.
8. **Milestones** — every threshold toasts, records to the timeline, and shifts how she talks (the LLM is told exactly how close you two really are).
9. **Whisper-soft goodnights** — affection-scaled goodnight ritual when she heads to bed.
10. **Anniversaries** — weekly "it's been X days since we moved in" callbacks.
11. **Morning ritual** — she greets you and puts coffee on (6:30–10:30, once/day).
12. **Gift loop** — 🎁 flower/boba/cake/plushie/heart… and the 💍 at 80. Everything remembered in the timeline.
13. **Compliment button** — quick sincere-compliment sender.
14. **She knows how far you are** — the prompt tells her your live distance ("right next to you"), so closeness feels real in dialogue.
15. **💌 Love letters** — at big milestones she writes letters into her diary (📔) — including her confession letter.

---

# 🌙 Overnight build — read me when you wake up

Hey bro. Here's everything I built while you slept, and the few things you'll want to tune.

## ▶️ How to run (do this first)
```bash
cd "/Users/ilham/Library/Mobile Documents/com~apple~CloudDocs/catch-me-first"
python3 server.py
```
Open **http://localhost:8123** and **hard-refresh once** (Cmd+Shift+R). The server now caches the big models but keeps code fresh, so it only downloads the apartment once — after that it's fast.

> First load pulls ~100 MB (apartment + Alice + Deku), so give it 10–20s the first time.

---

## ✅ What's new

### 🏠 The apartment map
Your `appartement.glb` is now the world (the procedural dorm is hidden but its lighting/day-night still lights the apartment). Auto-fit, centered, floor at y=0.

### 🧠 Alice is ALIVE (the big one — `src/life.js`)
She runs her **own life** on a needs + daily-schedule engine:
- **Needs** (energy, hunger, fun, social, hygiene) decay over time and drive what she does. They **persist** between sessions.
- **Schedule**: coffee/freshen in the morning, study midday, cook+eat in the evening, sleep at night.
- She **walks** to hotspots (smooth, turns toward travel direction, stops at the right distance, **un-sticks** herself with detours if blocked), then **performs the activity** (expression + effect + sometimes a world action like cooking real food).
- **Doesn't repeat** the same thing back-to-back (anti-repeat scoring).
- **Reacts to you**: looks at you when you're near, greets when you approach after being away, blushes/smiles — but **doesn't follow you forever**; she goes back to her routine.
- **Idle chatter**: occasional short lines, gap-limited so she **never spams**.
- **Never freezes** — leave her alone for minutes and she keeps living.
- She **blinks**, changes expression with her **mood**, and lip-syncs when talking.

### 🗣️ She can improvise ANY action
Ask her to "make dinner", "go to bed", "practice guitar" — the LLM has `walk_to`, `do_activity` (accepts **any** action word, even ones I never coded), `set_mood`, and `wander`. She figures out the sequence herself (e.g. fridge → kitchen → cook → dining table → eat).

### 🧭 Hotspots + Editor
16 hotspots seeded (bed, sofa, kitchen, fridge, desk, wardrobe, bathroomDoor, window, diningTable, entranceDoor, bookshelf, mirror, balcony, roomCenter, aliceSpawn, playerSpawn) — each with `id, label, pos, rot, radius, actions`.
**⚠️ You need to tune positions** — I placed them from guesses; they won't line up with your apartment's real furniture. Use the **🧭 button** (top-right) → pick a spot → **Place mode ON → click the floor** where the real bed/sofa/kitchen is. "🚶 Send Alice" tests it. Hit Save.

### 💬 Chat fixes
- **Markdown renders** now — `*actions*` show as italic, `**bold**` bold, `` `code` `` mono. No more raw `**` `__`.
- **No leaked code** — any tool-call/JSON markup is stripped before display.
- **Press T** to open/focus chat, **Esc** to leave it (back to walking).

### 🚫 Filter removed
Your built-in content filter is **Off** by default now — only Groq/Gemini's own safety applies. She decides what she does. (You can still write your own filters in the 📝 Prompt Studio if you ever want.)

---

## ⚙️ New controls
- **Admin → World → Map/Environment**: change/reset the map, scale, yaw.
- **Admin → World → Alice's Autonomy**: toggle autonomy, restlessness slider, idle chatter, show hotspot markers.
- **🧭 Hotspot Editor** (in-game): place/tune hotspots on the real apartment.
- HUD mood chip shows **what she's doing** live (🎬 cooking · Kitchen).

---

## 🔧 40 ways I made it better
1. Apartment map replaces the dorm. 2. Needs system (5 needs). 3. Daily schedule by time-of-day. 4. Autonomous decision loop. 5. Anti-repeat activity scoring. 6. Smooth pathing to hotspots. 7. Gradual turning (no snap). 8. Arrive-at-radius stopping. 9. Stuck detection + detour un-stick. 10. Walk-cycle leg animation for VRMs. 11. `do_activity` improvises any action. 12. `walk_to` navigation tool. 13. `set_mood` tool. 14. `wander` tool. 15. Hotspot config schema (id/label/pos/rot/radius/actions). 16. In-game hotspot editor with click-to-place. 17. Hotspot dev markers. 18. Player look-at (head tracking). 19. Greet-on-approach. 20. Doesn't follow forever. 21. Mood-driven idle expressions. 22. Idle chatter with anti-spam cooldowns. 23. Needs persist across sessions. 24. Markdown chat rendering. 25. Code/tool-markup stripped from chat. 26. T opens chat, Esc closes. 27. Built-in filter removed (provider-only safety). 28. Apartment-sized dollhouse camera. 29. Spawn points (alice/player) honored. 30. Walk bounds clamped to the apartment. 31. Sun shadow widened for the bigger space. 32. Live "what she's doing" HUD. 33. Activity sound effects. 34. Activities fire real world abilities (cook→food, draw→art). 35. Admin autonomy controls. 36. Admin map controls + reset-to-dorm. 37. Multi-threaded no-cache dev server (fixes the load hang). 38. Smart caching (code fresh, models cached → fast reloads). 39. VRM spring-bone reset (no exploding hair) + timestep clamp. 40. She's aware of her apartment/places in the system prompt so LLM commands land.

---

## 🧱 Collision (added)
Real **mesh collision** now — Alice and you can't walk through walls/furniture (`src/collision.js`, BVH-accelerated raycasts). **Doorways stay walkable** (they're just gaps) and any mesh named "door" is excluded, so "only the doors" are passable. I also fixed a floor bug: the apartment's real floor is ~0.65m above the model's bbox bottom (foundation), so I now **detect the true floor with downward rays** and stand everyone on it. If she ever can't reach a hotspot (behind a wall), she now **gives up after ~14s and does something else** instead of freezing.

## ⚠️ Tune / know
- **Hotspot positions** — the #1 thing to fix (🧭 editor). With collision on, a hotspot stuck behind a wall = she can't reach it (she'll give up and wander). Place them on **open, reachable floor** near the real furniture. This is the main thing left for you.
- **Navigation** is walk + un-stick + give-up, not a full nav-mesh — across several walls she may not find the doorway. Good enough for line-of-sight-ish rooms; tell me if you want real A* pathfinding on a baked walkable grid.
- **Two VRMs + a 70MB apartment** is heavy on a weak GPU. Third-person renders both; overview/first-person renders just Alice.
- If a model ever looks wrong, **Admin → Appearance/World → Reset**.

Sleep well — she'll be pottering around the apartment when you get back. ♡
