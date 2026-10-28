import * as THREE from "three";
import { tex } from "./textures.js";

/* Point-sprite particles: blood, sparks, sand, smoke, flames, petals, snow. One draw call per system. */
const VERT = `
attribute float size; attribute float alpha; attribute vec3 tint;
uniform float uScale; varying vec3 vTint; varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
  vTint = tint; vAlpha = alpha;
}`;
const FRAG = `
uniform sampler2D map; varying vec3 vTint; varying float vAlpha;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  float a = t.a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vTint * t.rgb, a);
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(scene, { max = 3000, additive = false, map = tex.soft() } = {}) {
    this.max = max; this.list = [];
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("tint", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uScale: { value: 400 } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  /** o: { x,y,z, vx,vy,vz, life, size, color, grav, drag, grow, fade, bounce, sway } */
  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    const c = o.color instanceof THREE.Color ? o.color : new THREE.Color(o.color || "#ffffff");
    this.list.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 1, max: o.life || 1, s: o.size || 0.1,
      r: c.r, g: c.g, b: c.b, grav: o.grav ?? 0, drag: o.drag ?? 0, grow: o.grow ?? 0, fade: o.fade ?? 1, bounce: o.bounce ?? 0.3, sway: o.sway || 0, ph: Math.random() * 6 });
  }
  burst(x, y, z, n, o) {
    const sp = o.speed || 2;
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, k = Math.sqrt(1 - u * u), v = sp * (0.3 + Math.random() * 0.7);
      this.spawn({ ...o, x, y, z, vx: Math.cos(th) * k * v + (o.dirX || 0), vy: Math.abs(u) * v * (o.up ?? 1) + (o.lift || 0), vz: Math.sin(th) * k * v + (o.dirZ || 0), life: (o.life || 0.6) * (0.6 + Math.random() * 0.6), size: (o.size || 0.08) * (0.6 + Math.random() * 0.8) });
    }
  }
  update(dt, t) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt; if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      if (p.sway) { p.vx += Math.sin(t * 1.7 + p.ph) * p.sway * dt; p.vz += Math.cos(t * 1.3 + p.ph) * p.sway * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02 && p.grav > 0) { p.y = 0.02; p.vy *= -p.bounce; p.vx *= 0.5; p.vz *= 0.5; }
      p.s += p.grow * dt;
      L[w++] = p;
    }
    L.length = w;
    for (let i = 0; i < w; i++) {
      const p = L[i], k = p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.size[i] = Math.max(0, p.s); this.alpha[i] = p.fade === 2 ? Math.sin(Math.PI * Math.min(1, (1 - k) * 4)) * Math.min(1, k * 3) : Math.min(1, k * 2.2 * p.fade + (1 - p.fade));
    }
    this.geo.setDrawRange(0, w);
    for (const a of ["position", "tint", "size", "alpha"]) this.geo.attributes[a].needsUpdate = true;
  }
  clear() { this.list.length = 0; this.geo.setDrawRange(0, 0); }
}

/* Lightning: a jagged tube from the sky down to the target, with a glow around it. */
export class Lightning {
  constructor(scene) { this.scene = scene; this.bolts = []; this.core = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); this.glow = new THREE.MeshBasicMaterial({ color: "#7ea6ff", transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }); }
  strike(target) {
    const pts = [], n = 14, top = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 26, (Math.random() - 0.5) * 6));
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = top.clone().lerp(target, t);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 1.4).multiplyScalar(1 - t * 0.6));
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.1);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.05, 5), this.core.clone()));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.22, 6), this.glow.clone()));
    for (let b = 0; b < 3; b++) {
      const i0 = 3 + ((Math.random() * (n - 6)) | 0), bp = [pts[i0].clone()];
      for (let k = 0; k < 4; k++) bp.push(bp[k].clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, -1.2 - Math.random(), (Math.random() - 0.5) * 2)));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 20, 0.03, 4), this.core.clone()));
    }
    this.scene.add(group);
    this.bolts.push({ group, life: 0.45, max: 0.45 });
  }
  update(dt) {
    for (const b of this.bolts) {
      b.life -= dt;
      const a = Math.max(0, b.life / b.max) * (Math.random() < 0.25 ? 0.4 : 1);
      b.group.children.forEach((m, i) => { m.material.opacity = i === 1 ? a * 0.45 : a; });
      if (b.life <= 0) { b.group.removeFromParent(); b.group.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.dispose(); } }); }
    }
    this.bolts = this.bolts.filter(b => b.life > 0);
  }
}
