// ============================================================================
//  CATCH ME FIRST — postfx.js   ("Cinematic look")
//  A real post-processing pipeline so the apartment reads like a film still:
//  MSAA render → bloom (glow on lights/highlights) → colour-grade + vignette +
//  film grain → ACES tone-map output. The grade shifts with the time of day
//  (golden warmth at sunset, cool + dim at night). Perf-tiered so phones can
//  drop it. Falls back to a plain render if post-processing can't load.
// ============================================================================

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// colour grade + vignette + subtle grain, all in one cheap pass
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 1.15 }, saturation: { value: 1.14 }, warmth: { value: 0.05 },
    brightness: { value: 1.0 }, contrast: { value: 1.05 }, grain: { value: 0.028 }, time: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette,saturation,warmth,brightness,contrast,grain,time; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(vec3(l), c, saturation);              // saturation
      c = (c - 0.5) * contrast + 0.5;               // contrast
      c.r += warmth*0.06; c.b -= warmth*0.06;       // warm/cool tint
      c *= brightness;
      vec2 q = vUv - 0.5; c *= clamp(1.0 - dot(q,q)*vignette, 0.0, 1.0);   // vignette
      c += (rnd(vUv + fract(time))-0.5) * grain;    // film grain
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export const PostFX = {
  refs: null, composer: null, bloom: null, grade: null, enabled: true, ok: false,

  init(refs) {
    this.refs = refs;                                // { renderer, scene, camera }
    try {
      const { renderer, scene, camera } = refs;
      const size = renderer.getSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType });
      const composer = new EffectComposer(renderer, rt);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.55, 0.82);  // strength, radius, threshold
      composer.addPass(bloom);
      const grade = new ShaderPass(GradeShader);
      composer.addPass(grade);
      composer.addPass(new OutputPass());
      this.composer = composer; this.bloom = bloom; this.grade = grade; this.ok = true;
      this.setSize(size.x, size.y);
      // phones: keep it off by default (toggle-able) so they stay smooth
      if (matchMedia("(max-width: 900px)").matches && matchMedia("(pointer: coarse)").matches) this.enabled = false;
    } catch (e) { console.warn("[postfx] unavailable, plain render", e); this.ok = false; this.enabled = false; }
    return this;
  },

  setSize(w, h) { try { this.composer?.setSize(w, h); this.bloom?.setResolution?.(new THREE.Vector2(w, h)); } catch {} },

  // grade drifts with time of day
  setTime(hour) {
    if (!this.grade) return;
    const u = this.grade.uniforms;
    const night = hour < 6 || hour >= 20.5;
    const golden = (hour >= 6 && hour < 9) || (hour >= 17 && hour < 20.5);
    u.warmth.value = golden ? 0.55 : night ? -0.4 : 0.08;
    u.brightness.value = night ? 0.8 : golden ? 1.04 : 1.0;
    u.saturation.value = night ? 1.02 : 1.15;
    if (this.bloom) this.bloom.strength = night ? 0.62 : 0.45;   // lights pop more at night
  },

  render(dt) {
    try {
      if (this.enabled && this.ok && this.composer) {
        if (this.grade) this.grade.uniforms.time.value += dt || 0.016;
        this.composer.render();
        return;
      }
    } catch (e) { this.ok = false; console.warn("[postfx] render failed, plain render", e); }   // never let FX crash the loop
    this.refs.renderer.render(this.refs.scene, this.refs.camera);
  },

  toggle(on) { this.enabled = on ?? !this.enabled; return this.enabled; },
};
