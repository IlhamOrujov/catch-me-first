// ============================================================================
//  CATCH ME FIRST — modelloader.js
//  Load a real 3D model to BE Akuu: glTF/GLB (what Sketchfab exports) or VRM
//  (rigged anime avatars). VRM gets expression + lip-sync support when the
//  three-vrm library loads; otherwise a .vrm still renders as a static mesh.
// ============================================================================

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

let _vrmMod;               // cached three-vrm module (or false if unavailable)
async function ensureVRM() {
  if (_vrmMod !== undefined) return _vrmMod;
  try {
    _vrmMod = await import("https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3/lib/three-vrm.module.min.js");
  } catch (e) { console.warn("three-vrm unavailable, VRM will load as static mesh", e); _vrmMod = false; }
  return _vrmMod;
}

// Map Akuu's expression names → VRM expression presets
const VRM_EXPR = {
  happy: "happy", smile: "happy", laugh: "happy", excited: "happy", love: "happy",
  sad: "sad", cry: "sad", shy: "sad", flustered: "sad",
  angry: "angry", annoyed: "angry", pout: "angry", determined: "angry",
  surprised: "surprised", blush: "relaxed", sleepy: "relaxed", neutral: "neutral",
  wink: "happy", smug: "happy", thinking: "neutral",
};

export function detectFormat(url, isVRM) {
  if (isVRM) return "vrm";
  const clean = (url || "").split("?")[0].toLowerCase();
  if (clean.endsWith(".vrm")) return "vrm";
  if (clean.endsWith(".fbx")) return "fbx";
  if (clean.endsWith(".obj")) return "obj";
  if (clean.endsWith(".gltf")) return "gltf";
  return "glb";
}

export async function loadCharacterModel(url, { isVRM = false, format } = {}) {
  const fmt = (format || detectFormat(url, isVRM)).toLowerCase();
  let inner, vrm = null, animations = [];

  if (fmt === "fbx") {
    const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
    inner = await new FBXLoader().loadAsync(url);   // FBX is often authored in cm; auto-fit below normalizes it
    animations = inner.animations || [];
  } else if (fmt === "obj") {
    const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
    inner = await new OBJLoader().loadAsync(url);    // OBJ has no rig/animation
  } else {
    const loader = new GLTFLoader();
    try {
      const draco = new DRACOLoader();
      draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
      loader.setDRACOLoader(draco);
    } catch {}
    if (fmt === "vrm") {
      const mod = await ensureVRM();
      if (mod && mod.VRMLoaderPlugin) loader.register((parser) => new mod.VRMLoaderPlugin(parser));
    }
    const gltf = await loader.loadAsync(url);
    animations = gltf.animations || [];
    if (fmt === "vrm" && gltf.userData?.vrm) {
      vrm = gltf.userData.vrm;
      const mod = await ensureVRM();
      try { mod.VRMUtils?.removeUnnecessaryVertices?.(gltf.scene); mod.VRMUtils?.combineSkeletons?.(gltf.scene); } catch {}
      if (vrm.meta?.metaVersion === "0") vrm.scene.rotation.y = Math.PI;   // VRM 0.x faces -Z
      // VRMs ship in a stiff T-pose with no animation → drop the arms to a natural rest
      if (!animations.length && vrm.humanoid) {
        const pose = (n, z) => { const b = vrm.humanoid.getNormalizedBoneNode(n); if (b) b.rotation.z = z; };
        pose("leftUpperArm", 1.2); pose("rightUpperArm", -1.2);
        pose("leftLowerArm", 0.25); pose("rightLowerArm", -0.25);
        vrm.update?.(0);
      }
    }
    inner = vrm ? vrm.scene : gltf.scene;
  }

  inner.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });

  // Auto-fit by scaling a WRAPPER above the glTF scene — NOT the scene itself.
  // Scaling a skinned mesh's own scene breaks its bind matrices and collapses the
  // mesh; scaling a parent wrapper keeps mesh+skeleton in their loaded relationship.
  const root = new THREE.Group();
  root.add(inner);
  const box = new THREE.Box3().setFromObject(inner);
  const size = new THREE.Vector3(); box.getSize(size);
  const targetH = 1.5;
  const scale = size.y > 0.001 ? targetH / size.y : 1;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;     // drop feet to y=0

  // Mixer targets the inner scene (that's where the animated nodes/skeleton live).
  const mixer = animations.length ? new THREE.AnimationMixer(inner) : null;
  let action = null;
  if (mixer) { action = mixer.clipAction(animations[0]); action.play(); }

  // settle VRM spring bones to the posed/scaled rest, or the hair can explode on load
  if (vrm) { try { vrm.update(0); vrm.springBoneManager?.reset?.(); } catch {} }

  // Detect an over-heavy rig — real-time WebGL skinning collapses past a few hundred
  // bones (e.g. dance models packed with cloth/hair-physics bones), so warn instead of
  // silently rendering a blob.
  let maxBones = 0;
  inner.traverse((o) => { if (o.isSkinnedMesh) maxBones = Math.max(maxBones, o.skeleton.bones.length); });
  const warning = maxBones > 256
    ? `Heads up: this model has ${maxBones} bones/mesh — that's a very heavy rig and may render as a blob (WebGL real-time skinning tops out well below that). A VRM avatar or a normally-rigged character (~50–80 bones) works best.`
    : null;

  return {
    root, vrm, mixer, warning, boneCount: maxBones, animations,
    setExpression(name) {
      if (!vrm?.expressionManager) return;
      const em = vrm.expressionManager;
      // reset the emotion presets, then apply the mapped one
      ["happy", "angry", "sad", "relaxed", "surprised", "neutral"].forEach((e) => { try { em.setValue(e, 0); } catch {} });
      const preset = VRM_EXPR[name] || "neutral";
      try { em.setValue(preset, preset === "neutral" ? 0 : 1); } catch {}
    },
    // procedural walk cycle + poses (sit / rest) via humanoid bones
    walk(moving, dt) {
      if (!vrm?.humanoid) return;
      const b = (n) => vrm.humanoid.getNormalizedBoneNode(n);
      const hips = b("hips");
      const lul = b("leftUpperLeg"), rul = b("rightUpperLeg"), lla = b("leftLowerLeg"), rla = b("rightLowerLeg"), lua = b("leftUpperArm"), rua = b("rightUpperArm");
      if (hips && vrm._hipsRestY === undefined) vrm._hipsRestY = hips.position.y;
      if (moving) {
        if (hips && vrm._hipsRestY !== undefined) hips.position.y = vrm._hipsRestY;
        vrm._wt = (vrm._wt || 0) + dt * 8;
        const s = Math.sin(vrm._wt) * 0.5;
        if (lul) lul.rotation.x = s; if (rul) rul.rotation.x = -s;
        if (lla) lla.rotation.x = Math.max(0, -s) * 0.7; if (rla) rla.rotation.x = Math.max(0, s) * 0.7;
        if (lua) lua.rotation.x = -s * 0.5; if (rua) rua.rotation.x = s * 0.5;
      } else if (this._pose === "sit" || this._pose === "rest") {
        // seated: hips drop, thighs forward, shins down (signs flipped via SIT const if a model bends oddly)
        const SIT_THIGH = -1.45, SIT_SHIN = 1.25;
        if (hips && vrm._hipsRestY !== undefined) hips.position.y = vrm._hipsRestY - 0.31;
        if (lul) lul.rotation.x = SIT_THIGH; if (rul) rul.rotation.x = SIT_THIGH;
        if (lla) lla.rotation.x = SIT_SHIN; if (rla) rla.rotation.x = SIT_SHIN;
        const head = b("head");
        if (head) head.rotation.x += (((this._pose === "rest") ? 0.34 : 0) - head.rotation.x) * 0.1;   // doze
      } else {
        if (hips && vrm._hipsRestY !== undefined) hips.position.y += (vrm._hipsRestY - hips.position.y) * 0.2;
        [lul, rul, lla, rla, lua, rua].forEach((bn) => { if (bn) bn.rotation.x *= 0.85; });
      }
    },
    setPose(p) { this._pose = p === "stand" ? null : p; },
    // small handheld props (mug, book, phone…) parented to her actual hand bone
    attachProp(kind) {
      this.removeProp();
      if (!vrm?.humanoid) return;
      const hand = vrm.humanoid.getRawBoneNode("rightHand");
      if (!hand) return;
      const prop = buildProp(kind);
      if (!prop) return;
      prop.position.set(0.01, -0.07, 0.025);
      hand.add(prop);
      this._prop = prop;
    },
    removeProp() { if (this._prop) { this._prop.parent?.remove(this._prop); this._prop = null; } },
    // upper-body gestures on the VRM (wave/heart/peace/point/nod/cheer/think/shrug/dance).
    // Interpolates from the arms-down rest pose. Returns true when finished.
    gesture(name, t) {
      if (!vrm?.humanoid) return true;
      const b = (n) => vrm.humanoid.getNormalizedBoneNode(n);
      const rua = b("rightUpperArm"), lua = b("leftUpperArm"), rla = b("rightLowerArm"), lla = b("leftLowerArm"), head = b("head");
      // rest baselines match the load-time pose (right arm z=-1.2, left z=+1.2)
      const R = { ruaZ: -1.2, luaZ: 1.2, rlaZ: -0.25, llaZ: 0.25 };
      const setRest = () => { if (rua) rua.rotation.set(0, 0, R.ruaZ); if (lua) lua.rotation.set(0, 0, R.luaZ); if (rla) rla.rotation.set(0, 0, R.rlaZ); if (lla) lla.rotation.set(0, 0, R.llaZ); if (head) head.rotation.set(0, 0, 0); };
      if (!name) { setRest(); return true; }
      const DUR = { wave: 1.6, heart: 2.2, peace: 1.8, point: 1.5, nod: 1.1, cheer: 2.0, dance: 3.0, think: 2.0, shrug: 1.3, headpat: 1.5, jump: 1.0, twirl: 0.9 }[name] || 1.5;
      const env = Math.min(1, t / 0.28) * (t > DUR - 0.32 ? Math.max(0, (DUR - t) / 0.32) : 1);   // ease in/out
      const to = (bone, ax, target, base) => { if (bone) bone.rotation[ax] = base + (target - base) * env; };
      setRest();
      switch (name) {
        case "wave": to(rua, "z", 0.35, R.ruaZ); to(rua, "x", -0.25, 0); if (rla) rla.rotation.z = R.rlaZ + Math.sin(t * 12) * 0.55 * env; break;
        case "peace": to(rua, "z", 0.05, R.ruaZ); to(rla, "x", -1.35, 0); break;
        case "point": to(rua, "x", -1.45, 0); to(rua, "z", -0.85, R.ruaZ); break;
        case "heart": to(rua, "z", 0.15, R.ruaZ); to(lua, "z", -0.15, R.luaZ); to(rua, "x", -0.5, 0); to(lua, "x", -0.5, 0); to(rla, "z", -1.15, R.rlaZ); to(lla, "z", 1.15, R.llaZ); break;
        case "cheer": to(rua, "z", 0.55, R.ruaZ); to(lua, "z", -0.55, R.luaZ); to(rua, "x", -0.2, 0); to(lua, "x", -0.2, 0); break;
        case "think": to(rua, "z", -0.85, R.ruaZ); to(rua, "x", -0.45, 0); to(rla, "x", -1.45, 0); if (head) head.rotation.z = 0.12 * env; break;
        case "shrug": to(rua, "z", -0.85, R.ruaZ); to(lua, "z", 0.85, R.luaZ); to(rla, "x", -0.5, 0); to(lla, "x", -0.5, 0); break;
        case "nod": if (head) head.rotation.x = Math.sin(t * 9) * 0.22 * env; break;
        case "headpat": if (head) head.rotation.z = Math.sin(t * 6) * 0.08 * env; break;
        case "dance": if (rua) rua.rotation.z = R.ruaZ + (0.7 + Math.sin(t * 7) * 0.35) * env; if (lua) lua.rotation.z = R.luaZ - (0.7 + Math.sin(t * 7 + 1) * 0.35) * env; if (head) head.rotation.z = Math.sin(t * 7) * 0.1 * env; break;
      }
      return t >= DUR;
    },
    // turn the head toward a world point (subtle look-at)
    lookAt(worldPoint, rootObj) {
      if (!vrm?.humanoid) return;
      const head = vrm.humanoid.getNormalizedBoneNode("head");
      if (!head || !rootObj) return;
      const local = rootObj.worldToLocal(worldPoint.clone());
      const yaw = Math.atan2(local.x, Math.max(0.2, local.z)) * 0.5;
      const pitch = -Math.atan2(local.y - 1.4, Math.max(0.4, Math.hypot(local.x, local.z))) * 0.3;
      head.rotation.y += (THREE.MathUtils.clamp(yaw, -0.7, 0.7) - head.rotation.y) * 0.12;
      head.rotation.x += (THREE.MathUtils.clamp(pitch, -0.4, 0.4) - head.rotation.x) * 0.12;
    },
    talk(on, t = 0) {
      if (!vrm?.expressionManager) return;
      try { vrm.expressionManager.setValue("aa", on ? 0.2 + 0.5 * Math.abs(Math.sin(t * 16)) : 0); } catch {}
    },
    // real visemes — set the five VRM mouth shapes at once (for text-driven lip-sync)
    setVisemes(w) {
      if (!vrm?.expressionManager) return;
      const em = vrm.expressionManager;
      try { em.setValue("aa", w.aa || 0); em.setValue("ih", w.ih || 0); em.setValue("ou", w.ou || 0); em.setValue("ee", w.ee || 0); em.setValue("oh", w.oh || 0); } catch {}
    },
    blink(v) { if (vrm?.expressionManager) { try { vrm.expressionManager.setValue("blink", v); } catch {} } },
    update(dt) { if (mixer) mixer.update(dt); if (vrm) vrm.update(Math.min(dt, 0.033)); },   // clamp so big frames don't blow up spring bones
    dispose() {
      root.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.()); });
    },
  };
}

export function guessIsVRM(nameOrUrl) { return /\.vrm(\?|$)/i.test(nameOrUrl || ""); }

// tiny handheld props for activities — she actually holds things
function buildProp(kind) {
  const M = (c, e) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: e || 0x000000, emissiveIntensity: e ? 0.4 : 0 });
  const g = new THREE.Group();
  const add = (geo, mat, y = 0, z = 0, x = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  switch (kind) {
    case "mug": add(new THREE.CylinderGeometry(0.028, 0.024, 0.07, 14), M("#fff")); add(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 14), M("#5a3a24"), 0.032); break;
    case "phone": add(new THREE.BoxGeometry(0.038, 0.075, 0.006), M("#111")); add(new THREE.BoxGeometry(0.033, 0.066, 0.002), M("#223", "#4ea8ff"), 0, 0.004); break;
    case "book": { const bk = add(new THREE.BoxGeometry(0.1, 0.02, 0.14), M("#c2564e")); bk.rotation.x = 0.4; add(new THREE.BoxGeometry(0.094, 0.01, 0.132), M("#f5efdf"), 0.012).rotation.x = 0.4; break; }
    case "pan": { const p = add(new THREE.CylinderGeometry(0.07, 0.065, 0.022, 16), M("#2b2b30")); add(new THREE.BoxGeometry(0.1, 0.012, 0.02), M("#3a3a40"), 0.005, 0, 0.11); break; }
    case "pen": { const p = add(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 8), M("#3355aa")); p.rotation.z = 1.2; break; }
    case "bowl": add(new THREE.CylinderGeometry(0.05, 0.032, 0.035, 14), M("#e8e2d4")); add(new THREE.CylinderGeometry(0.043, 0.043, 0.01, 14), M("#c98a4b"), 0.016); break;
    case "cloth": add(new THREE.BoxGeometry(0.07, 0.008, 0.07), M("#7fb6d9")); break;
    default: return null;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
