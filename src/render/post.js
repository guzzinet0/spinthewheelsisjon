import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* Film look: the scene is drawn in HDR with 4x MSAA, then bright things (fire, sparks, torches, lightning) glow,
   and a light grade adds contrast, a warm vignette and a touch of grain before tone mapping. */
const Grade = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.35 }, uSat: { value: 1.08 }, uGrain: { value: 0.025 }, uTint: { value: new THREE.Color("#1a0c04") }, uT: { value: 0 }, uFlash: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat, uGrain, uT, uFlash; uniform vec3 uTint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uT) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(vec3(0.0), mix(vec3(l), c.rgb, uSat));
      vec2 d = vUv - 0.5; d.x *= 1.3;
      float v = smoothstep(0.85, 0.25, length(d));
      c.rgb = mix(uTint * l, c.rgb, mix(1.0, v, uVig));
      c.rgb += uFlash * vec3(1.0, 0.92, 0.8) * 0.25;
      c.rgb *= 1.0 + (hash(vUv * 731.0) - 0.5) * uGrain;
      gl_FragColor = c;
    }`
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const c = this.composer = new EffectComposer(renderer, rt);
    c.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.5, 2.2);
    c.addPass(this.bloom);
    this.grade = new ShaderPass(Grade);
    c.addPass(this.grade);
    c.addPass(new OutputPass());
    this.base = { strength: 0.45, threshold: 2.2 };
    this.pulse = 0;
    this.spot = 0;          // 0..1 while the final spotlight is on: it lights the sand far past the bloom threshold
  }
  /** look: { bloom, threshold, vignette, sat } from the arena theme */
  setLook(look) {
    this.base = { strength: look.bloom, threshold: look.threshold };
    this.bloom.radius = 0.55;
    this.grade.uniforms.uVig.value = look.vignette;
    this.grade.uniforms.uSat.value = look.sat;
  }
  /** A brief extra glow, for crits and lightning. */
  flash(k) { this.pulse = Math.max(this.pulse, k); }
  setSize(w, h) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
  render(dt, t) {
    this.pulse = Math.max(0, this.pulse - dt * 3);
    this.bloom.strength = this.base.strength + this.pulse * 0.8;
    this.bloom.threshold = this.base.threshold * (1 + this.spot * 6) * (1 - this.pulse * 0.2);
    this.grade.uniforms.uT.value = t % 100;
    this.grade.uniforms.uFlash.value = this.pulse * 0.4;
    this.composer.render(dt);
  }
}
