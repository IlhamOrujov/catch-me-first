// ============================================================================
//  CATCH ME FIRST — dorm.js
//  A hand-built, highly-detailed 3D dorm room. Procedural canvas textures,
//  layered furniture, real-time shadows, day/night, weather, swappable themes.
// ============================================================================

import * as THREE from "three";

// ---------- texture helpers (canvas-generated → no external files) ------------
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodTexture(base = "#a9743f", plank = 6) {
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const ph = h / plank;
    for (let i = 0; i < plank; i++) {
      const y = i * ph;
      // plank tint variation
      const shade = 12 - Math.round((i % 3) * 8);
      ctx.fillStyle = `rgba(${60 + shade},${40 + shade},${20 + shade},0.25)`;
      ctx.fillRect(0, y, w, ph);
      // grain
      for (let g = 0; g < 40; g++) {
        ctx.strokeStyle = `rgba(80,50,25,${0.03 + Math.random() * 0.06})`;
        ctx.lineWidth = 1 + Math.random() * 1.5;
        ctx.beginPath();
        const gy = y + Math.random() * ph;
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(w * 0.3, gy + (Math.random() - 0.5) * 8, w * 0.6, gy + (Math.random() - 0.5) * 8, w, gy + (Math.random() - 0.5) * 6);
        ctx.stroke();
      }
      // plank seam
      ctx.fillStyle = "rgba(30,18,8,0.5)"; ctx.fillRect(0, y, w, 2);
    }
  }, { repeat: [3, 3] });
}

function wallTexture(base = "#e9e3d8") {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.02})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
  }, { repeat: [2, 2] });
}

function posterTexture(kind) {
  return canvasTex(256, 360, (ctx, w, h) => {
    const palettes = {
      anime: ["#ff5f8f", "#ffd36e", "#5ad1ff"],
      band: ["#111", "#e11d48", "#f5f5f5"],
      space: ["#0b1026", "#4c5bd4", "#f0abfc"],
      motiv: ["#0ea5e9", "#fef08a", "#111"],
    };
    const pal = palettes[kind] || palettes.anime;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, pal[0]); g.addColorStop(1, pal[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // big shape
    ctx.fillStyle = pal[1];
    ctx.beginPath(); ctx.arc(w / 2, h * 0.4, w * 0.28, 0, Math.PI * 2); ctx.fill();
    // rays
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 6;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(w / 2, h * 0.4);
      ctx.lineTo(w / 2 + Math.cos(ang) * w, h * 0.4 + Math.sin(ang) * w); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, h - 60, w, 60);
    ctx.fillStyle = "#fff"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(["CATCH ME", "TOKYO '99", "COSMOS", "STAY WEIRD"][["anime","band","space","motiv"].indexOf(kind)] || "AKUU", w / 2, h - 22);
  }, { srgb: true });
}

function fabricTexture(color) {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4)
      for (let x = 0; x < w; x += 4) {
        ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
        ctx.fillRect(x, y, 2, 2);
      }
  }, { repeat: [3, 3] });
}

// ---------- small builder utilities -------------------------------------------
const M = (opts) => new THREE.MeshStandardMaterial(opts);
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, mat, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true; m.receiveShadow = true; return m;
}

// ============================================================================
export class Dorm {
  constructor() {
    this.group = new THREE.Group();
    this.interactive = {};   // named objects abilities can grab
    this.rain = null;
    this.snow = null;
    this.rgbStrips = [];
    this.decorGroup = new THREE.Group();
    this.spawnAnchor = new THREE.Group();
    this.spawnAnchor.position.set(0, 0, 0);
    this.group.add(this.decorGroup, this.spawnAnchor);
    this._t = 0;
  }

  build(scene) {
    this._buildShell();
    this._buildWindow();
    this._buildBeds();
    this._buildDesks();
    this._buildBookshelf();
    this._buildStorage();
    this._buildDecor();
    this._buildLighting();
    this._buildWeatherSystems();
    scene.add(this.group);
    return this;
  }

  // ---- room shell: floor, walls, ceiling, trim -------------------------------
  _buildShell() {
    const W = 9, D = 8, H = 3.4;
    this.dims = { W, D, H };

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, D),
      M({ map: woodTexture(), roughness: 0.55, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.group.add(floor);

    // rug
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 2.2),
      M({ map: this._rugTex(), roughness: 0.9 })
    );
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.6); rug.receiveShadow = true;
    this.group.add(rug); this.interactive.rug = rug;

    const wallMat = M({ map: wallTexture(), roughness: 0.9 });
    const mkWall = (w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true;
      this.group.add(m); return m;
    };
    mkWall(W, H, 0, H / 2, -D / 2, 0);              // back
    this.leftWall = mkWall(D, H, -W / 2, H / 2, 0, Math.PI / 2);   // left
    this.rightWall = mkWall(D, H, W / 2, H / 2, 0, -Math.PI / 2);  // right

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M({ color: "#f3efe6", roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; this.group.add(ceil);

    // baseboards
    const bbMat = M({ color: "#d8d2c4", roughness: 0.7 });
    this.group.add(box(W, 0.14, 0.05, bbMat, 0, 0.07, -D / 2 + 0.03));

    // door on right wall
    const doorFrame = box(0.05, 2.3, 1.25, M({ color: "#b8926a", roughness: 0.6 }), W / 2 - 0.02, 1.15, 2.4);
    const door = box(0.06, 2.15, 1.1, M({ color: "#8a5a34", roughness: 0.55 }), W / 2 - 0.05, 1.08, 2.4);
    const knob = cyl(0.04, 0.04, 0.08, M({ color: "#e6c86e", metalness: 0.8, roughness: 0.3 }));
    knob.rotation.z = Math.PI / 2; knob.position.set(W / 2 - 0.12, 1.05, 2.0);
    this.group.add(doorFrame, door, knob);
    this.interactive.door = door;
  }

  _rugTex() {
    return canvasTex(256, 180, (ctx, w, h) => {
      ctx.fillStyle = "#7b8fd4"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#e7ecff"; ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.strokeStyle = "#5568b8"; ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, i * 30); ctx.lineTo(w, i * 30 + 20); ctx.stroke(); }
    });
  }

  // ---- window + curtains + outside view --------------------------------------
  _buildWindow() {
    const { D, H } = this.dims;
    const frameMat = M({ color: "#efe9dd", roughness: 0.6 });
    const wx = -this.dims.W / 2 + 0.06;
    const grp = new THREE.Group();

    // outside "sky" plane visible through the glass
    this.skyPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 2.2),
      new THREE.MeshBasicMaterial({ map: this._skyTex(18.5), toneMapped: false })
    );
    this.skyPlane.rotation.y = Math.PI / 2;
    this.skyPlane.position.set(wx - 0.12, 1.9, -1.4);
    grp.add(this.skyPlane);

    // glass
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 2.0),
      M({ color: "#bfe3ff", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18 })
    );
    glass.rotation.y = Math.PI / 2; glass.position.set(wx, 1.9, -1.4);
    grp.add(glass);

    // frame + mullions
    const fr = (w, h, y, z) => { const m = box(0.08, h, w, frameMat, wx, y, z); grp.add(m); };
    fr(3.6, 0.1, 2.95, -1.4); fr(3.6, 0.1, 0.85, -1.4);
    const fv = (h, z) => { const m = box(0.08, h, 0.1, frameMat, wx, 1.9, z); grp.add(m); };
    fv(2.1, -3.2); fv(2.1, -1.4); fv(2.1, 0.4);

    // curtains
    const curtainMat = M({ map: fabricTexture("#d98bb0"), roughness: 0.85, side: THREE.DoubleSide });
    this.curtains = [];
    [-2.65, -0.15].forEach((z, i) => {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.3, 8, 1), curtainMat);
      const pos = c.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        pos.setX(v, x); pos.setZ(v, Math.sin((x + 0.45) * 8) * 0.08);
      }
      pos.needsUpdate = true; c.geometry.computeVertexNormals();
      c.rotation.y = Math.PI / 2; c.position.set(wx - 0.15, 2.0, z);
      c.castShadow = true; grp.add(c); this.curtains.push(c);
    });

    this.group.add(grp);
    this.interactive.window = grp;
  }

  _skyTex(hour) {
    return canvasTex(512, 320, (ctx, w, h) => {
      let top, bot, sun = null, stars = false;
      if (hour < 5 || hour > 20) { top = "#0a0e27"; bot = "#1a2247"; stars = true; }
      else if (hour < 7) { top = "#2c3e73"; bot = "#e8896b"; sun = ["#ffd39b", h * 0.7]; }
      else if (hour < 17) { top = "#5fa8e8"; bot = "#bfe3ff"; sun = ["#fff6d8", h * 0.28]; }
      else if (hour < 19) { top = "#3a4d8f"; bot = "#ff9e6b"; sun = ["#ffcaa0", h * 0.62]; }
      else { top = "#1a1f4a"; bot = "#c26b7a"; sun = ["#ffd9b0", h * 0.72]; }
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top); g.addColorStop(1, bot);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (stars) for (let i = 0; i < 120; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
        ctx.fillRect(Math.random() * w, Math.random() * h * 0.7, Math.random() * 2, Math.random() * 2);
      }
      if (sun) { ctx.fillStyle = sun[0]; ctx.beginPath(); ctx.arc(w * 0.7, sun[1], 34, 0, Math.PI * 2); ctx.fill(); }
      // distant city silhouette
      ctx.fillStyle = hour < 5 || hour > 20 ? "#0c1020" : "rgba(40,50,80,0.55)";
      let x = 0;
      while (x < w) { const bw = 20 + Math.random() * 40, bh = 40 + Math.random() * 120; ctx.fillRect(x, h - bh, bw, bh);
        if ((hour < 6 || hour > 18)) for (let wy = h - bh + 8; wy < h - 8; wy += 14)
          for (let wx2 = x + 4; wx2 < x + bw - 4; wx2 += 10) { if (Math.random() > 0.5) { ctx.fillStyle = "#ffd98a"; ctx.fillRect(wx2, wy, 4, 6); ctx.fillStyle = hour < 5 || hour > 20 ? "#0c1020" : "rgba(40,50,80,0.55)"; } }
        x += bw + 6; }
    }, { srgb: true });
  }

  // ---- beds (two roommates) --------------------------------------------------
  _buildBeds() {
    const frameMat = M({ color: "#7a5230", roughness: 0.6 });
    const makeBed = (x, z, sheet, pillow) => {
      const g = new THREE.Group();
      g.add(box(1.1, 0.35, 2.1, frameMat, 0, 0.35, 0));          // frame
      const mattress = box(1.02, 0.22, 2.0, M({ color: "#f2ede2", roughness: 0.9 }), 0, 0.6, 0);
      g.add(mattress);
      const duvet = box(1.06, 0.16, 1.5, M({ map: fabricTexture(sheet), roughness: 0.85 }), 0, 0.72, 0.25);
      g.add(duvet);
      const pil = box(0.7, 0.16, 0.4, M({ map: fabricTexture(pillow), roughness: 0.9 }), 0, 0.78, -0.75);
      g.add(pil);
      // headboard
      g.add(box(1.1, 0.7, 0.08, frameMat, 0, 0.7, -1.02));
      g.position.set(x, 0, z);
      this.group.add(g); return g;
    };
    this.bedA = makeBed(-3.4, -2.4, "#8ab6e8", "#ffffff");   // Deku's — blue
    this.bedB = makeBed(3.4, -2.4, "#e88ab6", "#fff0f6");    // Akuu's — pink
    this.interactive.akuuBed = this.bedB;

    // fairy lights over Akuu's bed
    const lights = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8),
        new THREE.MeshStandardMaterial({ color: "#fff2b0", emissive: "#ffd36e", emissiveIntensity: 2 }));
      b.position.set(2.4 + i * 0.14, 2.4 + Math.sin(i) * 0.05, -3.4);
      lights.add(b);
    }
    this.fairyLights = lights; this.group.add(lights);
  }

  // ---- desks, monitors, gaming setup -----------------------------------------
  _buildDesks() {
    const deskMat = M({ color: "#caa77e", roughness: 0.5 });
    const legMat = M({ color: "#3a3a42", roughness: 0.4, metalness: 0.4 });

    const makeDesk = (x, z, ry) => {
      const g = new THREE.Group();
      g.add(box(1.6, 0.06, 0.7, deskMat, 0, 0.75, 0));
      [[-0.72, -0.3], [0.72, -0.3], [-0.72, 0.3], [0.72, 0.3]].forEach(([lx, lz]) =>
        g.add(box(0.06, 0.75, 0.06, legMat, lx, 0.375, lz)));
      g.position.set(x, 0, z); g.rotation.y = ry;
      this.group.add(g); return g;
    };

    // Deku's desk (back-left) with monitor + keyboard + tower
    const deskA = makeDesk(-3.0, -3.2, 0);
    const monA = this._monitor("#0a0a12");
    monA.position.set(-3.2, 0.78, -3.35); this.group.add(monA);
    this.interactive.monitor = monA.userData.screen;
    this.group.add(box(0.45, 0.03, 0.16, M({ color: "#222", roughness: 0.5 }), -3.0, 0.79, -3.05)); // keyboard
    const tower = box(0.22, 0.5, 0.45, M({ color: "#17171d", roughness: 0.4 }), -3.75, 0.25, -3.2);
    this.group.add(tower);
    // RGB glow strip on tower
    const rgbTower = box(0.02, 0.42, 0.02, new THREE.MeshStandardMaterial({ color: "#ff2d6b", emissive: "#ff2d6b", emissiveIntensity: 1.5 }), -3.63, 0.25, -3.2);
    this.group.add(rgbTower); this.rgbStrips.push(rgbTower);

    // gaming chair
    const chair = this._chair(); chair.position.set(-3.0, 0, -2.5); chair.rotation.y = Math.PI; this.group.add(chair);
    this.interactive.chair = chair;

    // Akuu's desk (back-right) with laptop + whiteboard nearby
    const deskB = makeDesk(3.0, -3.2, 0);
    const laptop = this._laptop(); laptop.position.set(3.0, 0.78, -3.25); this.group.add(laptop);
    this.interactive.laptop = laptop;

    // desk lamp
    const lamp = this._deskLamp(); lamp.position.set(3.7, 0.78, -3.4); this.group.add(lamp);
    this.interactive.lamp = lamp;

    // mugs / clutter
    this.group.add(this._mug("#e0554e", -2.5, 0.78, -3.1));
    this.group.add(this._mug("#4e9be0", 3.5, 0.78, -3.05));
  }

  _monitor(screenColor) {
    const g = new THREE.Group();
    g.add(box(0.7, 0.42, 0.03, M({ color: "#111", roughness: 0.4 }), 0, 0.25, 0));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.36),
      new THREE.MeshBasicMaterial({ map: this._screenTex("desktop"), toneMapped: false }));
    screen.position.set(0, 0.25, 0.017); g.add(screen);
    g.add(box(0.08, 0.2, 0.06, M({ color: "#222" }), 0, 0.05, 0));
    g.add(box(0.28, 0.02, 0.16, M({ color: "#222" }), 0, 0.0, 0));
    g.userData.screen = screen;
    return g;
  }

  _screenTex(kind) {
    return canvasTex(320, 180, (ctx, w, h) => {
      if (kind === "desktop") {
        const gr = ctx.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, "#1b2a6b"); gr.addColorStop(1, "#0a0e27"); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("catch me first", w / 2, h / 2);
        for (let i = 0; i < 4; i++) { ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(12 + i * 40, 12, 30, 30); }
      } else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h); }
    });
  }

  _laptop() {
    const g = new THREE.Group();
    g.add(box(0.5, 0.02, 0.34, M({ color: "#c0c4cc", metalness: 0.6, roughness: 0.3 }), 0, 0, 0)); // base
    const lid = new THREE.Group();
    lid.add(box(0.5, 0.34, 0.02, M({ color: "#c0c4cc", metalness: 0.6, roughness: 0.3 }), 0, 0.17, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3),
      new THREE.MeshBasicMaterial({ map: this._screenTex("desktop"), toneMapped: false }));
    scr.position.set(0, 0.17, 0.011); lid.add(scr);
    lid.position.set(0, 0, -0.16); lid.rotation.x = -0.35; g.add(lid);
    return g;
  }

  _deskLamp() {
    const g = new THREE.Group();
    const mat = M({ color: "#e7d9c4", roughness: 0.5, metalness: 0.2 });
    g.add(cyl(0.09, 0.11, 0.03, mat)); // base
    const arm = cyl(0.015, 0.015, 0.4, mat); arm.position.y = 0.2; arm.rotation.z = 0.3; g.add(arm);
    const head = cyl(0.09, 0.05, 0.12, mat); head.position.set(0.12, 0.42, 0); head.rotation.z = -0.9; g.add(head);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12),
      new THREE.MeshStandardMaterial({ color: "#fff5cc", emissive: "#ffdd88", emissiveIntensity: 2 }));
    bulb.position.set(0.14, 0.38, 0); g.add(bulb);
    const l = new THREE.PointLight(0xffd88a, 0.6, 3, 2); l.position.set(0.16, 0.36, 0);
    g.add(l); g.userData.light = l; g.userData.bulb = bulb;
    return g;
  }

  _chair() {
    const g = new THREE.Group();
    const mat = M({ color: "#1e1e26", roughness: 0.5 });
    const accent = M({ color: "#e11d48", roughness: 0.5 });
    g.add(box(0.5, 0.1, 0.5, mat, 0, 0.5, 0));       // seat
    g.add(box(0.5, 0.7, 0.1, mat, 0, 0.9, -0.22));   // back
    g.add(box(0.52, 0.08, 0.05, accent, 0, 1.2, -0.24));
    g.add(box(0.05, 0.08, 0.5, accent, -0.25, 0.55, 0));
    g.add(box(0.05, 0.08, 0.5, accent, 0.25, 0.55, 0));
    const pole = cyl(0.04, 0.04, 0.4, M({ color: "#333", metalness: 0.6 })); pole.position.y = 0.25; g.add(pole);
    const casterMat = M({ color: "#333" });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = box(0.28, 0.04, 0.06, casterMat, Math.cos(a) * 0.14, 0.06, Math.sin(a) * 0.14);
      leg.rotation.y = a; g.add(leg);
    }
    return g;
  }

  _mug(color, x, y, z) {
    const g = new THREE.Group();
    const body = cyl(0.05, 0.045, 0.1, M({ color, roughness: 0.4 })); body.position.y = 0.05; g.add(body);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 16), M({ color }));
    handle.position.set(0.06, 0.05, 0); g.add(handle);
    g.position.set(x, y, z); return g;
  }

  // ---- bookshelf -------------------------------------------------------------
  _buildBookshelf() {
    const g = new THREE.Group();
    const woodMat = M({ color: "#8a5a34", roughness: 0.6 });
    g.add(box(1.4, 2.0, 0.32, woodMat, 0, 1.0, 0));
    const inner = box(1.28, 1.9, 0.28, M({ color: "#5a3a20", roughness: 0.7 }), 0, 1.0, 0.02);
    g.add(inner);
    for (let s = 0; s < 4; s++) g.add(box(1.28, 0.03, 0.28, woodMat, 0, 0.4 + s * 0.45, 0.02));
    // books
    const colors = ["#e11d48", "#0ea5e9", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#f43f5e", "#14b8a6"];
    for (let s = 0; s < 4; s++) {
      let x = -0.58;
      while (x < 0.55) {
        const bw = 0.04 + Math.random() * 0.05, bh = 0.28 + Math.random() * 0.08;
        const b = box(bw, bh, 0.22, M({ color: colors[Math.floor(Math.random() * colors.length)], roughness: 0.7 }),
          x, 0.4 + s * 0.45 + bh / 2 + 0.015, 0.04);
        g.add(b); x += bw + 0.005;
      }
    }
    // a couple of trinkets
    g.add(this._plant(0.12, "#e0a0c0", 0.45, 1.75, 0.02));
    g.position.set(-4.0, 0, 0.5); g.rotation.y = Math.PI / 2;
    this.group.add(g); this.interactive.bookshelf = g;
  }

  // ---- storage: wardrobe + mini fridge + shelves -----------------------------
  _buildStorage() {
    // wardrobe
    const wMat = M({ color: "#c9b18e", roughness: 0.5 });
    const wardrobe = new THREE.Group();
    wardrobe.add(box(1.3, 2.2, 0.6, wMat, 0, 1.1, 0));
    wardrobe.add(box(0.63, 2.1, 0.02, M({ color: "#a88c62", roughness: 0.5 }), -0.32, 1.1, 0.31));
    wardrobe.add(box(0.63, 2.1, 0.02, M({ color: "#a88c62", roughness: 0.5 }), 0.32, 1.1, 0.31));
    const handleMat = M({ color: "#555", metalness: 0.6 });
    [-0.15, 0.15].forEach((x) => wardrobe.add(box(0.03, 0.14, 0.03, handleMat, x, 1.1, 0.33)));
    wardrobe.position.set(3.9, 0, 1.8); wardrobe.rotation.y = -Math.PI / 2;
    this.group.add(wardrobe);

    // mini fridge
    const fridge = new THREE.Group();
    fridge.add(box(0.6, 0.85, 0.6, M({ color: "#f0f0f2", roughness: 0.3, metalness: 0.2 }), 0, 0.42, 0));
    fridge.add(box(0.02, 0.4, 0.05, M({ color: "#888", metalness: 0.7 }), -0.28, 0.55, 0.31));
    // magnets
    fridge.add(box(0.06, 0.06, 0.01, M({ color: "#e11d48", emissive: "#e11d48", emissiveIntensity: 0.2 }), 0.1, 0.6, 0.31));
    fridge.position.set(-4.0, 0, 3.0); this.group.add(fridge);
    this.interactive.fridge = fridge;

    // TV on right-back wall
    const tv = new THREE.Group();
    tv.add(box(1.5, 0.9, 0.05, M({ color: "#0a0a0a", roughness: 0.3 }), 0, 0, 0));
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.82),
      new THREE.MeshBasicMaterial({ map: this._screenTex("desktop"), toneMapped: false }));
    tvScreen.position.z = 0.03; tv.add(tvScreen);
    tv.position.set(1.2, 1.7, -3.94); this.group.add(tv);
    this.interactive.tv = tvScreen;

    // whiteboard on left wall
    const wb = new THREE.Group();
    wb.add(box(0.04, 1.1, 1.6, M({ color: "#dfe3ea", roughness: 0.4 }), 0, 0, 0));
    this.whiteboardCanvas = document.createElement("canvas");
    this.whiteboardCanvas.width = 640; this.whiteboardCanvas.height = 440;
    this._clearWhiteboard();
    this.whiteboardTex = new THREE.CanvasTexture(this.whiteboardCanvas);
    const wbFace = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0),
      new THREE.MeshBasicMaterial({ map: this.whiteboardTex }));
    wbFace.rotation.y = Math.PI / 2; wbFace.position.set(0.03, 0, 0); wb.add(wbFace);
    wb.position.set(-4.46, 1.6, -1.5); this.group.add(wb);
    this.interactive.whiteboard = wb;
  }

  _clearWhiteboard() {
    const ctx = this.whiteboardCanvas.getContext("2d");
    ctx.fillStyle = "#f7f9fc"; ctx.fillRect(0, 0, 640, 440);
    ctx.strokeStyle = "#c8cfda"; ctx.lineWidth = 4; ctx.strokeRect(6, 6, 628, 428);
  }

  writeWhiteboard(text) {
    const ctx = this.whiteboardCanvas.getContext("2d");
    this._clearWhiteboard();
    ctx.fillStyle = "#2b6cb0"; ctx.font = "bold 34px 'Comic Sans MS', sans-serif";
    const words = String(text).split(" "); let line = "", y = 70;
    for (const wd of words) {
      if ((line + wd).length > 22) { ctx.fillText(line, 30, y); line = wd + " "; y += 46; }
      else line += wd + " ";
    }
    ctx.fillText(line, 30, y);
    ctx.fillStyle = "#e11d48"; ctx.font = "26px 'Comic Sans MS', sans-serif";
    ctx.fillText("— Akuu ♡", 380, 410);
    this.whiteboardTex.needsUpdate = true;
  }

  setScreen(which, dataUrlOrKind) {
    const target = which === "tv" ? this.interactive.tv : this.interactive.monitor;
    if (!target) return;
    const apply = (tex) => { if (target.material.map && target.material.map !== tex) target.material.map.dispose(); target.material.map = tex; target.material.needsUpdate = true; };
    if (typeof dataUrlOrKind === "string" && dataUrlOrKind.startsWith("data:")) {
      new THREE.TextureLoader().load(dataUrlOrKind, (t) => { t.colorSpace = THREE.SRGBColorSpace; apply(t); });
    } else apply(this._screenTex(dataUrlOrKind || "desktop"));
  }

  // ---- decor: posters, plants, string art, guitar, beanbag -------------------
  _buildDecor() {
    // posters on back wall
    const mkPoster = (kind, x, y) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.26),
        new THREE.MeshStandardMaterial({ map: posterTexture(kind), roughness: 0.8 }));
      p.position.set(x, y, -3.96); this.decorGroup.add(p);
    };
    mkPoster("anime", -1.2, 2.2); mkPoster("space", 3.4, 2.3); mkPoster("motiv", -2.4, 1.9);

    // plants
    this.decorGroup.add(this._plant(0.4, "#3fae5a", -4.0, 0, 2.0));
    const bigPlant = this._plant(0.6, "#2f9e4a", 4.0, 0, -1.0); this.decorGroup.add(bigPlant);

    // beanbag
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.6),
      M({ map: fabricTexture("#f2a65a"), roughness: 0.95 }));
    bag.scale.set(1, 0.7, 1); bag.position.set(1.6, 0.28, 2.2); bag.castShadow = true;
    this.decorGroup.add(bag); this.interactive.beanbag = bag;

    // guitar leaning on wall
    const guitar = this._guitar(); guitar.position.set(-3.9, 0.7, 3.6); guitar.rotation.z = 0.25; guitar.rotation.y = 0.4;
    this.decorGroup.add(guitar);

    // coffee table with snacks
    const table = new THREE.Group();
    table.add(box(1.1, 0.05, 0.6, M({ color: "#b0895e", roughness: 0.5 }), 0, 0.4, 0));
    [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(([x, z]) =>
      table.add(box(0.05, 0.4, 0.05, M({ color: "#7a5a34" }), x, 0.2, z)));
    table.add(this._mug("#7dd3fc", -0.3, 0.42, 0));
    // snack bowl
    const bowl = cyl(0.12, 0.08, 0.06, M({ color: "#ef4444", roughness: 0.4 })); bowl.position.set(0.2, 0.46, 0); table.add(bowl);
    table.position.set(0.2, 0, 1.4); this.decorGroup.add(table);
    this.interactive.table = table;

    // wall clock
    const clock = new THREE.Group();
    clock.add(cyl(0.2, 0.2, 0.03, M({ color: "#fff", roughness: 0.5 }), 24).rotateX(Math.PI / 2));
    this.clockHands = new THREE.Group();
    const hand = (len, w, col) => { const h = box(w, len, 0.01, M({ color: col }), 0, len / 2, 0.02); return h; };
    this.hourHand = hand(0.1, 0.02, "#111"); this.minHand = hand(0.15, 0.012, "#111");
    this.clockHands.add(this.hourHand, this.minHand);
    clock.add(this.clockHands);
    clock.position.set(0, 2.9, -3.93); this.decorGroup.add(clock);
    this.interactive.clock = clock;
  }

  _plant(scale, leafColor, x, y, z) {
    const g = new THREE.Group();
    const pot = cyl(0.14 * scale / 0.4, 0.1 * scale / 0.4, 0.2 * scale / 0.4, M({ color: "#c1633f", roughness: 0.7 }));
    pot.position.y = 0.1 * scale / 0.4; g.add(pot);
    const leafMat = M({ color: leafColor, roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 12; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05 * scale / 0.4, 0.4 * scale / 0.4, 5), leafMat);
      const a = (i / 12) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 0.08 * scale / 0.4, 0.35 * scale / 0.4, Math.sin(a) * 0.08 * scale / 0.4);
      leaf.rotation.set(Math.cos(a) * 0.5, 0, Math.sin(a) * -0.5);
      leaf.castShadow = true; g.add(leaf);
    }
    g.position.set(x, y, z); return g;
  }

  _guitar() {
    const g = new THREE.Group();
    const bodyMat = M({ color: "#b5651d", roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), bodyMat);
    body.scale.set(1, 1.2, 0.28); g.add(body);
    g.add(cyl(0.03, 0.03, 0.8, bodyMat).translateY(0.55));
    const head = box(0.09, 0.16, 0.03, M({ color: "#3a2410" }), 0, 0.98, 0); g.add(head);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), M({ color: "#1a0e04" }));
    hole.position.z = 0.08; g.add(hole);
    return g;
  }

  // ---- lighting --------------------------------------------------------------
  _buildLighting() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.group.add(this.ambient);

    // hemispheric for soft fill
    this.hemi = new THREE.HemisphereLight(0xbfd4ff, 0x3a2c22, 0.5);
    this.group.add(this.hemi);

    // sun through window (directional, casts shadows)
    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.0);
    this.sun.position.set(-6, 6, -3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -8; this.sun.shadow.camera.right = 8;
    this.sun.shadow.camera.top = 8; this.sun.shadow.camera.bottom = -8;
    this.sun.shadow.camera.near = 0.5; this.sun.shadow.camera.far = 30;
    this.sun.shadow.bias = -0.0005;
    this.group.add(this.sun, this.sun.target);

    // ceiling light
    const fixture = box(0.5, 0.08, 0.5, M({ color: "#f0e6cc", emissive: "#fff4d0", emissiveIntensity: 0.5 }), 0, this.dims.H - 0.06, 0);
    this.group.add(fixture); this.ceilFixture = fixture;
    this.ceilLight = new THREE.PointLight(0xfff0d0, 0.7, 12, 2);
    this.ceilLight.position.set(0, this.dims.H - 0.3, 0);
    this.ceilLight.castShadow = true; this.ceilLight.shadow.mapSize.set(1024, 1024);
    this.group.add(this.ceilLight);

    // RGB accent strips (ceiling perimeter)
    const stripMat = () => new THREE.MeshStandardMaterial({ color: "#ff2d6b", emissive: "#ff2d6b", emissiveIntensity: 1.4 });
    const { W, D, H } = this.dims;
    const s1 = box(W - 0.4, 0.04, 0.04, stripMat(), 0, H - 0.12, -D / 2 + 0.25);
    const s2 = box(0.04, 0.04, D - 0.4, stripMat(), -W / 2 + 0.25, H - 0.12, 0);
    const s3 = box(0.04, 0.04, D - 0.4, stripMat(), W / 2 - 0.25, H - 0.12, 0);
    this.group.add(s1, s2, s3); this.rgbStrips.push(s1, s2, s3);
    this.rgbLight = new THREE.PointLight(0xff2d6b, 0.4, 10, 2);
    this.rgbLight.position.set(0, H - 0.3, -D / 2 + 1);
    this.group.add(this.rgbLight);
  }

  // ---- weather systems -------------------------------------------------------
  _buildWeatherSystems() {
    const mk = (count, color, size, area) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * area.x;
        pos[i * 3 + 1] = Math.random() * area.y;
        pos[i * 3 + 2] = (Math.random() - 0.5) * area.z;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.7 });
      const pts = new THREE.Points(geo, mat); pts.visible = false;
      // keep just outside the window
      pts.position.set(-4.6, 0, -1.4);
      this.group.add(pts); return pts;
    };
    this.rain = mk(600, 0xaaccff, 0.04, { x: 0.4, y: 6, z: 4 });
    this.snow = mk(400, 0xffffff, 0.08, { x: 0.4, y: 6, z: 4 });
  }

  // hide the procedural room geometry (used when a GLB map is loaded) — keeps the
  // lights, so the loaded apartment is still lit by the sun/ambient/day-night rig
  hideRoom() {
    this.group.traverse((o) => { if (o.isMesh || o.isPoints) o.visible = false; });
    this._roomHidden = true;
  }
  showRoom() {
    this.group.traverse((o) => { if (o.isMesh || o.isPoints) o.visible = true; });
    this._roomHidden = false;
  }

  // ============================ public API for abilities =====================
  setTime(hour) {
    this._t = hour;
    // sky
    this.skyPlane.material.map = this._skyTex(hour);
    this.skyPlane.material.needsUpdate = true;

    // sun angle + color + intensity
    const day = hour > 6 && hour < 20;
    const t = (hour - 6) / 14; // 0..1 across the day
    const elev = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
    this.sun.position.set(-6 + t * 12, 1 + elev * 8, -3);
    this.sun.intensity = day ? 0.3 + elev * 1.0 : 0.05;
    const warm = hour < 8 || hour > 17;
    this.sun.color.set(warm ? 0xffb27a : 0xfff2d6);
    this.ambient.intensity = day ? 0.4 + elev * 0.25 : 0.22;
    this.hemi.intensity = day ? 0.5 : 0.25;
    // window plane glows less at night
    // clock hands
    if (this.hourHand && this.minHand) {
      const ha = ((hour % 12) / 12) * Math.PI * 2;
      const ma = ((hour % 1)) * Math.PI * 2;
      this.hourHand.rotation.z = -ha; this.minHand.rotation.z = -ma;
    }
  }

  setWeather(w) {
    this.rain.visible = w === "rain" || w === "storm";
    this.snow.visible = w === "snow";
    // only dim on the transition INTO storm so repeated calls can't compound-darken;
    // leaving storm is restored by the next setTime()
    if (w === "storm" && this._weather !== "storm") this.ambient.intensity *= 0.6;
    this._weather = w;
  }

  setCeilingOn(on) {
    this.ceilLight.intensity = on ? 0.7 : 0.0;
    this.ceilFixture.material.emissiveIntensity = on ? 0.5 : 0.05;
  }

  setLampOn(on) {
    const lamp = this.interactive.lamp;
    if (lamp?.userData.light) lamp.userData.light.intensity = on ? 0.6 : 0;
    if (lamp?.userData.bulb) lamp.userData.bulb.material.emissiveIntensity = on ? 2 : 0.1;
  }

  setRGB(on, color) {
    const c = new THREE.Color(color || "#ff2d6b");
    this.rgbStrips.forEach((s) => {
      s.material.emissiveIntensity = on ? 1.4 : 0;
      if (color) { s.material.color.set(c); s.material.emissive.set(c); }
    });
    this.rgbLight.intensity = on ? 0.4 : 0;
    if (color) this.rgbLight.color.set(c);
    this._rgbOn = on;
  }

  setLighting(mood) {
    // presets used by abilities: bright, cozy, movie, romantic, focus, party, sleep
    const presets = {
      bright: () => { this.setCeilingOn(true); this.ambient.intensity = 0.8; this.setRGB(false); },
      cozy: () => { this.setCeilingOn(false); this.setLampOn(true); this.ambient.intensity = 0.4; this.setRGB(true, "#ff9e6b"); },
      movie: () => { this.setCeilingOn(false); this.setLampOn(false); this.ambient.intensity = 0.15; this.setRGB(true, "#3b82f6"); },
      romantic: () => { this.setCeilingOn(false); this.setLampOn(true); this.ambient.intensity = 0.25; this.setRGB(true, "#ff4d8d"); },
      focus: () => { this.setCeilingOn(true); this.setLampOn(true); this.ambient.intensity = 0.7; this.setRGB(true, "#22d3ee"); },
      party: () => { this.setCeilingOn(false); this.ambient.intensity = 0.3; this.setRGB(true, "#a855f7"); this._party = true; },
      sleep: () => { this.setCeilingOn(false); this.setLampOn(false); this.ambient.intensity = 0.08; this.setRGB(true, "#4338ca"); },
    };
    (presets[mood] || presets.cozy)();
    if (mood !== "party") this._party = false;
  }

  setTheme(theme) {
    // recolor accents + RGB to match a vibe
    const themes = {
      cozy: "#ff9e6b", neon: "#a855f7", minimalist: "#94a3b8",
      sakura: "#ff9ec4", winter: "#7dd3fc", halloween: "#f97316",
    };
    this.setRGB(true, themes[theme] || "#ff9e6b");
    // sakura petals / winter snow ambience toggles
    if (theme === "winter") this.setWeather("snow");
    this._theme = theme;
  }

  update(dt) {
    // weather motion
    const fall = (pts, speed) => {
      if (!pts.visible) return;
      const p = pts.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - speed * dt;
        if (y < 0) y = 6;
        p.setY(i, y);
        if (pts === this.snow) p.setX(i, p.getX(i) + Math.sin((y + i) * 0.5) * 0.002);
      }
      p.needsUpdate = true;
    };
    fall(this.rain, 9);
    fall(this.snow, 1.5);

    // party RGB cycling
    if (this._party) {
      this._t2 = (this._t2 || 0) + dt;
      const hue = (this._t2 * 0.2) % 1;
      const c = new THREE.Color().setHSL(hue, 0.9, 0.55);
      this.rgbStrips.forEach((s) => { s.material.color.set(c); s.material.emissive.set(c); });
      this.rgbLight.color.set(c);
    }
    // fairy light twinkle
    if (this.fairyLights) this.fairyLights.children.forEach((b, i) =>
      b.material.emissiveIntensity = 1.5 + Math.sin((performance.now() / 400) + i) * 0.6);
  }
}
