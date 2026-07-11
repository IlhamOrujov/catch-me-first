// ============================================================================
//  CATCH ME FIRST — akuu.js
//  The anime AI girl. Cel-shaded 3D body + hair with a dynamic 2D face
//  (canvas texture) for crisp anime expressions. Blink, breathe, sway, emote.
// ============================================================================

import * as THREE from "three";
import { loadCharacterModel, guessIsVRM } from "./modelloader.js";

// 3-step toon gradient → the flat cel-shaded anime look
function toonGradient() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 1;
  const ctx = c.getContext("2d");
  const cols = ["#8a8a8a", "#b8b8b8", "#e8e8e8", "#ffffff"];
  cols.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(i, 0, 1, 1); });
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  return t;
}

const EXPRESSIONS = [
  "neutral", "happy", "smile", "laugh", "blush", "shy", "sad", "cry",
  "angry", "pout", "surprised", "sleepy", "wink", "love", "smug",
  "thinking", "excited", "annoyed", "flustered", "determined",
];

// map a spoken character to one of the five VRM mouth shapes (aa/ih/ou/ee/oh)
const CHAR_VISEME = { a: "aa", e: "ee", i: "ih", o: "oh", u: "ou", y: "ih",
  m: "oh", b: "oh", p: "oh", w: "ou", f: "ih", v: "ih", l: "ih", r: "ou" };

export class Akuu {
  constructor(settings) {
    this.settings = settings;
    this.root = new THREE.Group();
    this.gradient = toonGradient();
    this.parts = {};
    this.expression = "neutral";
    this._blinkT = 0; this._nextBlink = 2 + Math.random() * 3;
    this._breathT = 0; this._talkT = 0; this._talking = false;
    this._swayT = 0;
    this._gesture = null; this._gestureT = 0;
    this._targetPos = null; this._facing = 0;
    this._blushLevel = 0;
  }

  toon(color, opts = {}) {
    return new THREE.MeshToonMaterial({ color, gradientMap: this.gradient, ...opts });
  }

  // outline: inverted-hull black shell for the anime silhouette pop
  _outline(mesh, thickness = 0.012) {
    const geo = mesh.geometry.clone();
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a1a22, side: THREE.BackSide });
    const shell = new THREE.Mesh(geo, mat);
    shell.scale.copy(mesh.scale).multiplyScalar(1 + thickness / Math.max(0.1, mesh.scale.x));
    // approximate: scale up a touch
    const s = 1 + thickness * 8;
    shell.scale.set(mesh.scale.x * s, mesh.scale.y * s, mesh.scale.z * s);
    shell.position.copy(mesh.position);
    shell.rotation.copy(mesh.rotation);
    return shell;
  }

  build(scene) {
    const a = this.settings.appearance;
    const skin = this.toon(a.skinTone);

    // ---- head ----
    const head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 32), skin);
    skull.scale.set(1, 1.08, 0.92);
    skull.castShadow = true;
    head.add(this._outline(skull, 0.02), skull);

    // face plane with dynamic canvas texture
    this.faceCanvas = document.createElement("canvas");
    this.faceCanvas.width = 512; this.faceCanvas.height = 512;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, depthWrite: false });
    // A gently curved PLANE — a plane keeps clean 0-1 UVs so the drawn face maps 1:1
    // (a sphere-segment warps the UVs and shrinks the eyes; that was the old bug).
    const faceGeo = new THREE.PlaneGeometry(0.30, 0.31, 16, 16);
    const fp = faceGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), y = fp.getY(i);
      // bow the plane back at the edges so it wraps the skull; center stays forward
      fp.setZ(i, -(x * x * 1.5 + y * y * 0.9) * 1.0);
    }
    fp.needsUpdate = true; faceGeo.computeVertexNormals();
    const face = new THREE.Mesh(faceGeo, faceMat);
    // Face must sit in FRONT of the skull (~0.156) AND the hair cap (~0.185) or they
    // render over the eyes. Curved edges bow back to meet the head; transparent
    // corners poking forward don't show. This was the "her face is wrong" bug.
    face.position.set(0, 0.008, 0.192);
    face.renderOrder = 3;
    head.add(face);
    this.parts.face = face;

    // ears (tiny)
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), skin);
      ear.position.set(s * 0.16, -0.01, 0); ear.scale.set(0.7, 1, 0.6); head.add(ear);
    });

    head.position.y = 1.34;
    this.parts.head = head;

    // ---- hair ----
    this.hairGroup = new THREE.Group();
    this._buildHair(a);
    head.add(this.hairGroup);

    // ---- neck ----
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16), skin);
    neck.position.y = 1.22; neck.castShadow = true;

    // ---- torso + outfit ----
    this.body = new THREE.Group();
    this._buildOutfit(a);

    // ---- assemble ----
    this._proceduralParts = [head, neck, this.body];
    this.root.add(head, neck, this.body);
    this.root.position.set(this.settings.appearance ? 2.6 : 0, 0, -2.2); // near her desk
    this.root.rotation.y = -0.5;
    const sc = a.height || 1;
    this.root.scale.setScalar(sc);

    this.drawFace("neutral");
    scene.add(this.root);
    this._buildEmoteLayer();
    return this;
  }

  _buildHair(a) {
    // clear
    while (this.hairGroup.children.length) this.hairGroup.remove(this.hairGroup.children[0]);
    const hairMat = this.toon(a.hairColor);
    const dark = new THREE.Color(a.hairColor).multiplyScalar(0.75);
    const hairMat2 = this.toon(dark.getStyle());

    // cap covering the top/back of the head
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    cap.scale.set(1.02, 1.1, 1.0); cap.position.y = 0.02;
    this.hairGroup.add(this._outline(cap, 0.02), cap);

    // bangs — a fringe that frames the FOREHEAD only (kept above the eyes, and
    // set behind the face plane at z<0.168 so the eyes always render in front)
    const bangCount = 7;
    for (let i = 0; i < bangCount; i++) {
      const t = i / (bangCount - 1) - 0.5;
      const bang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 8), hairMat);
      bang.position.set(t * 0.2, 0.13, 0.12 - Math.abs(t) * 0.02);
      bang.rotation.x = Math.PI; bang.rotation.z = t * 0.5;
      bang.scale.set(1, 1, 0.55);
      this.hairGroup.add(bang);
    }
    // side frames — hang down beside the cheeks, pushed out to the sides
    [-1, 1].forEach((s) => {
      const side = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.32, 8), hairMat);
      side.position.set(s * 0.17, -0.06, 0.02); side.rotation.x = Math.PI - 0.15; side.rotation.z = s * 0.2;
      this.hairGroup.add(side);
    });

    // style-specific back hair / tails
    this.tails = [];
    const style = a.hairStyle || "twin-tails";
    if (style === "twin-tails") {
      [-1, 1].forEach((s) => {
        const tail = new THREE.Group();
        for (let seg = 0; seg < 4; seg++) {
          const r = 0.06 - seg * 0.01;
          const part = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), seg % 2 ? hairMat2 : hairMat);
          part.position.y = -seg * 0.12; part.scale.set(1, 1.3, 1);
          tail.add(part);
        }
        const tie = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 8, 16), this.toon(a.accentColor));
        tie.rotation.x = Math.PI / 2; tie.position.y = 0.02; tail.add(tie);
        tail.position.set(s * 0.19, 0.04, -0.02); tail.rotation.z = s * 0.3;
        this.hairGroup.add(tail); this.tails.push(tail);
      });
    } else if (style === "ponytail") {
      const tail = new THREE.Group();
      for (let seg = 0; seg < 6; seg++) {
        const r = 0.07 - seg * 0.008;
        const part = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), seg % 2 ? hairMat2 : hairMat);
        part.position.set(0, -seg * 0.11, -0.02 - seg * 0.02); part.scale.set(1, 1.3, 1); tail.add(part);
      }
      tail.position.set(0, 0.08, -0.14); this.hairGroup.add(tail); this.tails.push(tail);
    } else { // long / bob → back curtain
      const back = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 24, 24, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), hairMat);
      back.scale.set(1.05, style === "long" ? 2.4 : 1.3, 1.0);
      back.position.set(0, style === "long" ? -0.22 : -0.06, -0.02);
      this.hairGroup.add(back); this.tails.push(back);
    }

    // ahoge (little anime cowlick antenna) — signature cuteness
    const ahoge = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 12, Math.PI * 1.4), hairMat);
    ahoge.position.set(0.02, 0.19, 0.02); ahoge.rotation.set(0.4, 0, 0.6);
    this.hairGroup.add(ahoge); this.ahoge = ahoge;
  }

  _buildOutfit(a) {
    while (this.body.children.length) this.body.remove(this.body.children[0]);
    const skin = this.toon(a.skinTone);
    const outfits = {
      casual:  { top: "#ff8fb1", bottom: "#3b4a6b", sleeve: "short" },
      hoodie:  { top: "#8b5cf6", bottom: "#2b2f3a", sleeve: "long" },
      uniform: { top: "#243b6b", bottom: "#7a1030", sleeve: "long", collar: true },
      pajamas: { top: "#a5d8ff", bottom: "#a5d8ff", sleeve: "long" },
      dress:   { top: a.accentColor, bottom: a.accentColor, sleeve: "short", skirt: true },
    };
    const o = outfits[a.outfit] || outfits.casual;
    const topMat = this.toon(o.top);
    const botMat = this.toon(o.bottom);

    // torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.34, 20), topMat);
    torso.position.y = 1.0; torso.castShadow = true;
    this.body.add(this._outline(torso, 0.012), torso);

    // chest/shoulders taper
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), topMat);
    shoulders.scale.set(1, 0.5, 0.8); shoulders.position.y = 1.15; this.body.add(shoulders);

    // arms
    this.arms = [];
    [-1, 1].forEach((s) => {
      const arm = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.22, 14), o.sleeve === "long" ? topMat : skin);
      upper.position.y = -0.11; arm.add(upper);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.2, 14), skin);
      fore.position.y = -0.31; arm.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), skin);
      hand.position.y = -0.42; hand.scale.set(1, 1.2, 0.7); arm.add(hand);
      arm.position.set(s * 0.14, 1.16, 0);
      arm.rotation.z = s * 0.12;
      arm.castShadow = true;
      this.body.add(arm); this.arms.push(arm);
    });

    // lower body — skirt or pants
    if (o.skirt || a.outfit === "uniform" || a.outfit === "dress") {
      const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.26, 20, 1, true), a.outfit === "uniform" ? this.toon(o.bottom) : botMat);
      skirt.position.y = 0.76; skirt.castShadow = true;
      this.body.add(this._outline(skirt, 0.012), skirt);
      // legs below skirt
      [-1, 1].forEach((s) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.55, 14), this.toon(a.outfit === "uniform" ? "#2b2b33" : a.skinTone));
        leg.position.set(s * 0.06, 0.42, 0); leg.castShadow = true; this.body.add(leg);
        const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), this.toon("#5a3a2a"));
        shoe.scale.set(1, 0.6, 1.6); shoe.position.set(s * 0.06, 0.13, 0.03); this.body.add(shoe);
      });
    } else {
      // pants
      [-1, 1].forEach((s) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.78, 14), botMat);
        leg.position.set(s * 0.06, 0.44, 0); leg.castShadow = true; this.body.add(leg);
        const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), this.toon("#e8e8e8"));
        shoe.scale.set(1, 0.6, 1.7); shoe.position.set(s * 0.06, 0.06, 0.04); this.body.add(shoe);
      });
    }

    // hips
    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), o.skirt ? this.toon(o.top) : botMat);
    hips.scale.set(1, 0.6, 0.9); hips.position.y = 0.82; this.body.add(hips);

    if (o.collar) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 20), this.toon("#ffffff"));
      collar.rotation.x = Math.PI / 2; collar.position.y = 1.16; this.body.add(collar);
      // ribbon
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), this.toon(a.accentColor));
      ribbon.position.set(0, 1.13, 0.11); this.body.add(ribbon);
    }
  }

  // ============================ FACE (the anime magic) =======================
  drawFace(expr) {
    this.expression = expr;
    const ctx = this.faceCanvas.getContext("2d");
    const W = 512, H = 512;
    ctx.clearRect(0, 0, W, H);
    const eyeColor = this.settings.appearance.eyeColor;
    const skin = this.settings.appearance.skinTone;

    // --- config per expression ---
    const cfg = this._expressionConfig(expr);

    // blush
    if (cfg.blush || this._blushLevel > 0.3) {
      const lvl = Math.max(cfg.blush ? 0.7 : 0, this._blushLevel);
      ctx.fillStyle = `rgba(255,120,150,${0.35 * lvl})`;
      ctx.beginPath(); ctx.ellipse(150, 300, 46, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(362, 300, 46, 26, 0, 0, Math.PI * 2); ctx.fill();
      // blush lines
      if (lvl > 0.5) { ctx.strokeStyle = `rgba(230,90,120,${0.5 * lvl})`; ctx.lineWidth = 4;
        for (const cx of [130, 150, 170, 342, 362, 382]) { ctx.beginPath(); ctx.moveTo(cx, 288); ctx.lineTo(cx, 314); ctx.stroke(); } }
    }

    // eyebrows
    ctx.strokeStyle = new THREE.Color(this.settings.appearance.hairColor).multiplyScalar(0.7).getStyle();
    ctx.lineWidth = 9; ctx.lineCap = "round";
    this._brow(ctx, 175, cfg.browY, cfg.browAngle, -1);
    this._brow(ctx, 337, cfg.browY, cfg.browAngle, 1);

    // eyes
    this._eye(ctx, 168, 250, eyeColor, cfg, -1);
    this._eye(ctx, 344, 250, eyeColor, cfg, 1);

    // mouth
    this._mouth(ctx, 256, 360, cfg);

    // tears
    if (cfg.tears) {
      ctx.fillStyle = "rgba(150,210,255,0.85)";
      for (const ex of [168, 344]) {
        ctx.beginPath(); ctx.moveTo(ex, 270);
        ctx.quadraticCurveTo(ex - 8, 320, ex, 350);
        ctx.quadraticCurveTo(ex + 8, 320, ex, 270); ctx.fill();
      }
    }
    // sparkles for excited/love
    if (cfg.sparkle) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      for (const [sx, sy] of [[110, 200], [400, 210], [90, 320], [420, 300]]) this._star(ctx, sx, sy, 12);
    }
    // anger vein
    if (cfg.vein) {
      ctx.strokeStyle = "#e0284a"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(380, 180); ctx.lineTo(410, 175); ctx.moveTo(395, 165); ctx.lineTo(400, 195); ctx.stroke();
    }

    this.faceTex.needsUpdate = true;
  }

  _expressionConfig(expr) {
    const base = { eyeOpen: 1, eyeShape: "round", pupil: 1, browY: 190, browAngle: 0, mouth: "smile", blush: 0, tears: false, sparkle: false, vein: false, shine: true };
    const map = {
      neutral:    { mouth: "small", eyeOpen: 1 },
      happy:      { mouth: "smile", browAngle: -0.05 },
      smile:      { mouth: "smile" },
      laugh:      { mouth: "open", eyeShape: "happy", eyeOpen: 0.15, browAngle: -0.1 },
      blush:      { mouth: "small", blush: 1, browAngle: 0.1, eyeShape: "soft" },
      shy:        { mouth: "wavy", blush: 1, eyeOpen: 0.7, browAngle: 0.2, browY: 200 },
      sad:        { mouth: "frown", browAngle: 0.3, browY: 205, eyeShape: "soft" },
      cry:        { mouth: "frownOpen", browAngle: 0.35, tears: true, browY: 208 },
      angry:      { mouth: "grit", browAngle: -0.4, browY: 175, vein: true, eyeShape: "sharp" },
      pout:       { mouth: "pout", browAngle: 0.15, browY: 198, blush: 0.4 },
      surprised:  { mouth: "o", eyeOpen: 1.3, pupil: 0.7, browY: 165 },
      sleepy:     { mouth: "small", eyeOpen: 0.35, browAngle: 0.1, browY: 200 },
      wink:       { mouth: "smile", wink: true, blush: 0.3 },
      love:       { mouth: "smile", eyeShape: "heart", blush: 0.9, sparkle: true },
      smug:       { mouth: "smirk", browAngle: -0.1, eyeOpen: 0.75, eyeShape: "sharp" },
      thinking:   { mouth: "small", browAngle: -0.1, lookUp: true, eyeOpen: 0.85 },
      excited:    { mouth: "open", sparkle: true, browAngle: -0.1, blush: 0.4 },
      annoyed:    { mouth: "flat", browAngle: -0.25, browY: 182, eyeOpen: 0.7 },
      flustered:  { mouth: "wavy", blush: 1, browAngle: 0.25, eyeOpen: 1.1, sparkle: false, vein: false },
      determined: { mouth: "grit", browAngle: -0.2, eyeShape: "sharp", browY: 180 },
    };
    return { ...base, ...(map[expr] || {}) };
  }

  _brow(ctx, x, y, angle, side) {
    ctx.beginPath();
    ctx.moveTo(x - 26, y + side * angle * 40);
    ctx.quadraticCurveTo(x, y - 6 + side * angle * 20, x + 26, y - side * angle * 40);
    ctx.stroke();
  }

  _eye(ctx, x, y, color, cfg, side) {
    const isWink = cfg.wink && side === 1;
    const open = isWink ? 0.05 : cfg.eyeOpen;
    if (open < 0.12) {
      // closed / happy arc
      ctx.strokeStyle = "#3a2a30"; ctx.lineWidth = 8; ctx.lineCap = "round";
      ctx.beginPath();
      if (cfg.eyeShape === "happy") { ctx.moveTo(x - 34, y + 6); ctx.quadraticCurveTo(x, y - 20, x + 34, y + 6); }
      else { ctx.moveTo(x - 32, y); ctx.quadraticCurveTo(x, y + 12, x + 32, y); }
      ctx.stroke();
      return;
    }
    const rx = 40, ry = 52 * open;
    // white
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    // upper lash line
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.clip();
    // iris
    const irisY = cfg.lookUp ? y - 8 : y + 2;
    let ir = 30 * cfg.pupil;
    if (cfg.eyeShape === "sharp") ir *= 0.85;
    const g = ctx.createRadialGradient(x - 6, irisY - 6, 4, x, irisY, ir);
    const c = new THREE.Color(color);
    g.addColorStop(0, c.clone().multiplyScalar(1.4).getStyle());
    g.addColorStop(0.7, color);
    g.addColorStop(1, c.clone().multiplyScalar(0.55).getStyle());
    if (cfg.eyeShape === "heart") {
      ctx.fillStyle = "#ff4d7d"; this._heart(ctx, x, irisY, ir * 1.1);
    } else {
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, irisY, ir, 0, Math.PI * 2); ctx.fill();
      // pupil
      ctx.fillStyle = "rgba(20,10,20,0.85)"; ctx.beginPath(); ctx.arc(x, irisY, ir * 0.45, 0, Math.PI * 2); ctx.fill();
      // shine
      if (cfg.shine) {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath(); ctx.arc(x - 10, irisY - 12, ir * 0.28, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 8, irisY + 8, ir * 0.14, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    // lash / outline
    ctx.strokeStyle = "#2a1a22"; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    // outer corner lash flick
    ctx.beginPath(); ctx.moveTo(x + side * rx * 0.9, y - ry * 0.2);
    ctx.lineTo(x + side * (rx + 14), y - ry * 0.5); ctx.stroke();
  }

  _mouth(ctx, x, y, cfg) {
    ctx.strokeStyle = "#8a3a4a"; ctx.fillStyle = "#c25b6e"; ctx.lineWidth = 6; ctx.lineCap = "round";
    const talk = this._talking ? (0.5 + 0.5 * Math.sin(this._talkT * 18)) : 0;
    switch (cfg.mouth) {
      case "small": ctx.beginPath(); ctx.arc(x, y - 6, 10 + talk * 8, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); break;
      case "smile": ctx.beginPath(); ctx.moveTo(x - 26, y - 4); ctx.quadraticCurveTo(x, y + 18 + talk * 10, x + 26, y - 4); ctx.stroke(); break;
      case "open": case "frownOpen": {
        ctx.beginPath(); ctx.ellipse(x, y + 2, 20, 16 + talk * 12, 0, 0, Math.PI * 2); ctx.fillStyle = "#7a2b3a"; ctx.fill();
        ctx.fillStyle = "#ff6f8a"; ctx.beginPath(); ctx.ellipse(x, y + 12, 12, 7, 0, 0, Math.PI * 2); ctx.fill(); break; }
      case "o": ctx.beginPath(); ctx.arc(x, y + 2, 15, 0, Math.PI * 2); ctx.fillStyle = "#7a2b3a"; ctx.fill(); break;
      case "frown": ctx.beginPath(); ctx.moveTo(x - 22, y + 10); ctx.quadraticCurveTo(x, y - 8, x + 22, y + 10); ctx.stroke(); break;
      case "pout": ctx.beginPath(); ctx.moveTo(x - 16, y + 6); ctx.quadraticCurveTo(x, y - 6, x + 16, y + 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y + 12, 8, 0, Math.PI); ctx.stroke(); break;
      case "smirk": ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.quadraticCurveTo(x + 10, y + 12 + talk * 8, x + 28, y - 10); ctx.stroke(); break;
      case "grit": ctx.fillStyle = "#fff"; ctx.strokeRect(x - 26, y - 6, 52, 16); ctx.fillRect(x - 26, y - 6, 52, 16);
        ctx.strokeStyle = "#8a3a4a"; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 12, y - 6); ctx.lineTo(x + i * 12, y + 10); ctx.stroke(); } break;
      case "wavy": ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.quadraticCurveTo(x - 8, y + 10, x, y); ctx.quadraticCurveTo(x + 8, y - 10, x + 22, y); ctx.stroke(); break;
      case "flat": ctx.beginPath(); ctx.moveTo(x - 20, y + 2); ctx.lineTo(x + 20, y + 2); ctx.stroke(); break;
      default: ctx.beginPath(); ctx.arc(x, y, 10, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }
  }

  _heart(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x - s, y - s * 0.5, x - s * 0.5, y - s, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.5, x, y + s * 0.3);
    ctx.fill();
  }
  _star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rad = i % 2 ? r * 0.4 : r; const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
    ctx.closePath(); ctx.fill();
  }

  // ---- emote layer (floating icons above head: !, ?, ♪, ♥, zzz, sweat) ----
  _buildEmoteLayer() {
    this.emoteSprite = null;
  }
  emote(symbol) {
    if (this.emoteSprite) this.root.remove(this.emoteSprite);
    const c = document.createElement("canvas"); c.width = 128; c.height = 128;
    const ctx = c.getContext("2d");
    ctx.font = "90px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const map = { "!": "❗", "?": "❓", music: "🎵", heart: "💗", zzz: "💤", sweat: "💦", star: "⭐", anger: "💢", idea: "💡", laugh: "😆" };
    ctx.fillText(map[symbol] || symbol, 64, 68);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    spr.scale.set(0.3, 0.3, 0.3); spr.position.set(0.18, 1.62, 0.1);
    this.root.add(spr); this.emoteSprite = spr; this._emoteT = 0;
  }

  // ============================ custom 3D model (Sketchfab GLB / VRM) =========
  async loadCustomModel(url, isVRM, format) {
    const model = await loadCharacterModel(url, { isVRM: isVRM ?? guessIsVRM(url), format });
    this.removeCustomModel();
    this.custom = model;
    this._proceduralParts.forEach((p) => (p.visible = false)); // hide the built-in body (hair/face are children of the head, so they hide too)
    this.root.add(model.root);
    model.setExpression(this.expression);
    return model.warning || null;
  }
  removeCustomModel() {
    if (this.custom) { this.root.remove(this.custom.root); this.custom.dispose?.(); this.custom = null; }
    this._proceduralParts?.forEach((p) => (p.visible = true));
  }

  // ============================ animation & control ==========================
  setExpression(name) {
    if (!EXPRESSIONS.includes(name)) return;
    this.expression = name;
    if (this.custom) this.custom.setExpression(name); else this.drawFace(name);
  }
  setBlush(level) { this._blushLevel = Math.max(0, Math.min(1, level)); if (!this.custom) this.drawFace(this.expression); }

  rebuildAppearance() {
    const a = this.settings.appearance;
    this._buildHair(a);
    this._buildOutfit(a);
    this.drawFace(this.expression);
    this.root.scale.setScalar(a.height || 1);
  }

  talk(on) { this._talking = on; if (!on) this._visTarget = null; if (!this.custom && !on) this.drawFace(this.expression); }
  // called per spoken/typed character to shape the mouth
  viseme(ch) {
    const s = CHAR_VISEME[String(ch || "").toLowerCase()];
    if (s) { this._visTarget = s; this._visAt = this._talkT; }
    else this._visTarget = null;   // consonant/space → mouth relaxes
  }

  gesture(name) {
    this._gesture = name; this._gestureT = 0;
    const em = { wave: null, jump: "star", nod: null, shrug: "sweat", twirl: "music",
      point: "!", heart: "heart", peace: "star", headpat: "heart", think: "idea", dance: "music" }[name];
    if (em) this.emote(em);
  }

  moveTo(x, z, faceAngle) {
    this._targetPos = new THREE.Vector3(x, 0, z);
    if (faceAngle !== undefined) this._facing = faceAngle;
    this._walking = true;
  }

  lookAt(vec) { this.lookAtPoint(vec); }
  lookAtPoint(vec) {
    this._lookTarget = (vec.isVector3 ? vec.clone() : new THREE.Vector3(vec.x, vec.y ?? 1.5, vec.z));
    if (this._lookTarget.y < 0.5) this._lookTarget.y = 1.5;
    this._lookExpire = this._breathT + 0.6;   // expires unless refreshed
  }
  faceAngle(rot) { this._facing = rot; this._faceActive = true; }
  isWalking() { return !!this._walking; }
  isBusy() { return !!this._walking || !!this._gesture; }
  setCollider(fn) { this._collider = fn; }   // (from, to) => resolved position
  setPose(p) { this.custom?.setPose?.(p); }
  attachProp(k) { this.custom?.attachProp?.(k); }
  removeProp() { this.custom?.removeProp?.(); }
  setEyesClosed(on) { this._forceEyesClosed = !!on; }

  update(dt, camera) {
    this._breathT += dt; this._swayT += dt; this._talkT += dt;

    // ---- custom model: drive its animation, lip-sync, blink; still allow root
    //      movement/gestures below. Skip the procedural face/hair/breathing work.
    if (this.custom) {
      this.custom.update(dt);
      // ---- viseme lip-sync: ease the five mouth shapes toward the current one ----
      const vis = this._vis || (this._vis = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 });
      const fresh = this._talking && this._visTarget && (this._visAt || 0) > this._talkT - 0.17;
      for (const s of ["aa", "ih", "ou", "ee", "oh"]) vis[s] += ((fresh && this._visTarget === s ? 0.8 : 0) - vis[s]) * 0.5;
      if (this.custom.setVisemes) this.custom.setVisemes(vis); else this.custom.talk(this._talking, this._talkT);
      this.custom.walk?.(this._walking && this._movedThisFrame !== false, dt);   // stop legs when blocked (no walking-in-place)
      // head look-at (set by lookAtPoint); relax to neutral when nothing fresh
      const now = this._breathT;
      if (this._lookTarget && this._lookExpire > now) this.custom.lookAt?.(this._lookTarget, this.root);
      else if (this.custom.vrm?.humanoid) { const h = this.custom.vrm.humanoid.getNormalizedBoneNode("head"); if (h) { h.rotation.y *= 0.9; h.rotation.x *= 0.9; } }
      if (this._forceEyesClosed) this.custom.blink(1);   // sleeping / dozing
      else {
        this._blinkT += dt;
        if (this._blinkT > this._nextBlink) {
          this.custom.blink(1);
          if (this._blinkT > this._nextBlink + 0.12) { this.custom.blink(0); this._blinkT = 0; this._nextBlink = 2 + Math.random() * 4; }
        } else this.custom.blink(0);
      }
      // body gestures on the VRM (wave/heart/dance/…) — previously no-op on custom models
      if (this._gesture) {
        this._gestureT = (this._gestureT || 0) + dt;
        if (this._gesture === "jump") this.root.position.y = Math.max(0, Math.sin(this._gestureT * 6) * 0.25);
        else if (this._gesture === "twirl") this.root.rotation.y += dt * 8;
        const gDone = this.custom.gesture?.(this._gesture, this._gestureT);
        if (gDone || this._gestureT > 3.5) { this.custom.gesture?.(null, 0); if (this._gesture === "jump") this.root.position.y = 0; this._gesture = null; this._gestureT = 0; }
      }
      this._updateMovement(dt, camera);
      return;
    }

    // breathing
    const breath = Math.sin(this._breathT * 1.6) * 0.008;
    if (this.parts.head) this.parts.head.position.y = 1.34 + breath;
    this.body.position.y = breath * 0.5;

    // idle sway
    this.root.rotation.z = Math.sin(this._swayT * 0.7) * 0.01;

    // hair / tail sway
    this.tails?.forEach((t, i) => {
      t.rotation.x = Math.sin(this._swayT * 1.5 + i) * 0.12;
      t.rotation.z = (t.rotation.z || 0) * 0 + (i === 0 ? -1 : 1) * 0.3 + Math.sin(this._swayT + i) * 0.05;
    });
    if (this.ahoge) this.ahoge.rotation.z = 0.6 + Math.sin(this._swayT * 3) * 0.15;

    // blinking
    this._blinkT += dt;
    if (this._blinkT > this._nextBlink) {
      const p = (this._blinkT - this._nextBlink);
      if (p < 0.12) { /* closing handled via face redraw */ }
      if (p >= 0.12) { this._blinkT = 0; this._nextBlink = 2 + Math.random() * 4; this.drawFace(this.expression); }
      else {
        // quick closed frame
        const ctx = this.faceCanvas.getContext("2d");
        if (!this._blinked) { this._quickBlink(); this._blinked = true; }
      }
    } else this._blinked = false;

    // talking mouth refresh
    if (this._talking) this.drawFace(this.expression);

    this._updateMovement(dt, camera);
  }

  // shared by procedural + custom-model paths (all act on this.root)
  _updateMovement(dt, camera) {
    // walking — smooth move toward target, turn gradually toward travel direction
    if (this._walking && this._targetPos) {
      const dir = this._targetPos.clone().sub(this.root.position); dir.y = 0;
      const dist = dir.length();
      if (dist > 0.06) {
        dir.normalize();
        const step = Math.min(dist, dt * (this._walkSpeed || 1.5));
        const px = this.root.position.x, pz = this.root.position.z;
        const next = this.root.position.clone().addScaledVector(dir, step);
        if (this._collider) { const r = this._collider(this.root.position, next); this.root.position.set(r.x, this.root.position.y, r.z); }
        else this.root.position.copy(next);
        this._movedThisFrame = Math.hypot(this.root.position.x - px, this.root.position.z - pz) > step * 0.25;   // false = blocked
        let d = Math.atan2(dir.x, dir.z) - this.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.root.rotation.y += d * Math.min(1, dt * 10);
        this.root.position.y = this.custom ? 0 : Math.abs(Math.sin(this._swayT * 8)) * 0.03;
        this.arms?.forEach((arm, i) => arm.rotation.x = Math.sin(this._swayT * 8 + i * Math.PI) * 0.5);
      } else {
        this._walking = false; this.root.position.y = 0;
        this.arms?.forEach((arm) => arm.rotation.x *= 0.8);
      }
    } else if (this._faceActive) {   // idle: ease toward the facing angle from faceAngle()
      let d = this._facing - this.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.root.rotation.y += d * Math.min(1, dt * 4);
    }

    // gestures — procedural avatar only. Custom/VRM models are driven by the gesture
    // block in the custom branch of update(); running both double-steps _gestureT and
    // clears _gesture before the VRM is reset to rest (arm freezes mid-pose).
    if (this._gesture && !this.custom) {
      this._gestureT += dt; const t = this._gestureT;
      const done = () => { this._gesture = null; this.root.rotation.z = 0;   // clear dance/twirl tilt
        this.arms?.forEach((a) => { a.rotation.x = 0; a.rotation.z = a === this.arms[0] ? 0.12 : -0.12; }); this.root.position.y = Math.max(0, this.root.position.y); };
      switch (this._gesture) {
        case "wave": if (this.arms) { this.arms[1].rotation.z = -1.8; this.arms[1].rotation.x = Math.sin(t * 12) * 0.4; } if (t > 1.5) done(); break;
        case "jump": this.root.position.y = Math.max(0, Math.sin(t * 6) * 0.25); if (t > 1.0) done(); break;
        case "nod": if (this.parts.head) this.parts.head.rotation.x = Math.sin(t * 10) * 0.2; if (t > 1.0) { this.parts.head.rotation.x = 0; done(); } break;
        case "shrug": if (this.arms) this.arms.forEach((a, i) => { a.rotation.z = (i ? -1 : 1) * 0.6; a.rotation.x = -0.3; }); if (t > 1.2) done(); break;
        case "twirl": this.root.rotation.y += dt * 8; if (t > 0.8) done(); break;
        case "dance": this.root.rotation.z = Math.sin(t * 8) * 0.15; this.root.position.y = Math.abs(Math.sin(t * 8)) * 0.08;
          if (this.arms) this.arms.forEach((a, i) => a.rotation.z = (i ? -1 : 1) * (0.8 + Math.sin(t * 8) * 0.5)); if (t > 3) done(); break;
        case "point": if (this.arms) { this.arms[1].rotation.x = -1.4; this.arms[1].rotation.z = -0.3; } if (t > 1.5) done(); break;
        case "heart": if (this.arms) { this.arms.forEach((a, i) => { a.rotation.x = -1.6; a.rotation.z = (i ? -0.8 : 0.8); }); } if (t > 2) done(); break;
        case "peace": if (this.arms) { this.arms[1].rotation.x = -1.7; this.arms[1].rotation.z = -0.2; } if (t > 1.8) done(); break;
        case "headpat": if (this.parts.head) this.parts.head.rotation.z = Math.sin(t * 6) * 0.06; if (t > 1.5) { this.parts.head.rotation.z = 0; done(); } break;
        case "think": if (this.arms) { this.arms[1].rotation.x = -1.3; this.arms[1].rotation.z = -0.5; } if (this.parts.head) this.parts.head.rotation.z = 0.1; if (t > 2) { this.parts.head.rotation.z = 0; done(); } break;
        default: done();
      }
    }

    // emote float
    if (this.emoteSprite) {
      this._emoteT += dt;
      this.emoteSprite.position.y = 1.62 + Math.sin(this._emoteT * 4) * 0.03;
      this.emoteSprite.material.opacity = Math.max(0, 1 - (this._emoteT - 2) );
      if (this._emoteT > 3) { this.root.remove(this.emoteSprite); this.emoteSprite = null; }
    }

    // face the camera slightly (subtle head tracking — procedural head only)
    if (camera && !this.custom && this.parts.head && !this._walking && !this._gesture) {
      const local = this.root.worldToLocal(camera.position.clone());
      const yaw = Math.atan2(local.x, local.z + 2) * 0.15;
      this.parts.head.rotation.y += (yaw - this.parts.head.rotation.y) * 0.05;
    }
  }

  _quickBlink() {
    const ctx = this.faceCanvas.getContext("2d");
    // redraw normal then overpaint eyes as closed arcs
    this.drawFace(this.expression);
    const skin = this.settings.appearance.skinTone;
    // cover eyes
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.clearRect(120, 200, 100, 110); ctx.clearRect(296, 200, 100, 110);
    // need skin behind — but face plane is transparent; draw closed lash
    ctx.strokeStyle = "#3a2a30"; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(136, 250); ctx.quadraticCurveTo(168, 262, 200, 250); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(312, 250); ctx.quadraticCurveTo(344, 262, 376, 250); ctx.stroke();
    this.faceTex.needsUpdate = true;
  }
}

export { EXPRESSIONS };
