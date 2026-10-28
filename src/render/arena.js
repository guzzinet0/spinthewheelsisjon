import * as THREE from "three";
import { tex, mulberry } from "./textures.js";
import { ARENA_R } from "../game/sim.js";
import { WALL_R } from "./physics.js";

export const THEMES = {
  sol: {
    label: "Solsken", sky: ["#2f6aa8", "#79a8d6", "#cfe0ee", "#efe2c4"], fog: "#d9cdb0", fogDensity: 0.008,
    sun: "#fff0d2", sunI: 2.5, sunPos: [-14, 24, 10], hemi: ["#cfe0f4", "#8a6a45"], hemiI: 0.95, env: 0.55, exposure: 0.92,
    sand: ["#e4c48c", "#d0a86c", "#a8814c"], speck: ["rgba(120,80,40,.22)", "rgba(255,244,215,.3)"], rake: "rgba(130,90,45,.16)",
    stone: ["#b39a78", "#9d8463"], archDark: "#3b2b1e", wall: "#8a2a1f", stud: "#d9a63a", crowd: 1,
    torches: 4, torchI: 4, stars: false, snow: false, cloth: ["#7a2a22", "#2f4f7a", "#6b5a2b", "#3d6b46", "#5a3a6b", "#8a6b3a", "#e8e0cc", "#7a4a22"],
    look: { bloom: 0.35, threshold: 2.6, vignette: 0.3, sat: 1.06 }
  },
  sunset: {
    label: "Solnedgång", sky: ["#241a40", "#7a3a6a", "#e0704a", "#ffc27a"], fog: "#c87a5a", fogDensity: 0.012,
    sun: "#ffa060", sunI: 2.8, sunPos: [-22, 7, -8], hemi: ["#f4a888", "#4a2a20"], hemiI: 0.8, env: 0.4, exposure: 1.05,
    sand: ["#f6c88f", "#e39d5f", "#a85f35"], speck: ["rgba(140,60,30,.22)", "rgba(255,225,190,.28)"], rake: "rgba(140,70,35,.18)",
    stone: ["#9c6e55", "#865a44"], archDark: "#2a1610", wall: "#8a2a1a", stud: "#f0b04a", crowd: 0.95,
    torches: 6, torchI: 10, stars: false, snow: false, cloth: ["#7a2a22", "#2f4f7a", "#6b5a2b", "#3d6b46", "#5a3a6b", "#8a6b3a", "#e8e0cc", "#7a4a22"],
    look: { bloom: 0.5, threshold: 2.2, vignette: 0.4, sat: 1.1 }
  },
  night: {
    label: "Natt", sky: ["#01030a", "#06102a", "#122244", "#1c2c48"], fog: "#0a1222", fogDensity: 0.016,
    sun: "#93a8ff", sunI: 0.7, sunPos: [12, 22, -10], hemi: ["#5868a8", "#1a140e"], hemiI: 0.35, env: 0.18, exposure: 1.15,
    sand: ["#d8ccb0", "#b7a789", "#7c6d52"], speck: ["rgba(70,60,40,.22)", "rgba(255,245,220,.15)"], rake: "rgba(70,60,40,.18)",
    stone: ["#4a4a55", "#3d3d48"], archDark: "#0a0a12", wall: "#4a1a2a", stud: "#c9a24a", crowd: 0.8,
    torches: 8, torchI: 22, stars: true, snow: false, cloth: ["#5a2a22", "#2a3f6a", "#4b4a2b", "#2d4b36", "#4a2a5b", "#6a5b3a", "#a8a090", "#5a3a22"],
    look: { bloom: 0.8, threshold: 1.1, vignette: 0.5, sat: 1.05 }
  },
  winter: {
    label: "Vinter", sky: ["#5d6d84", "#93a3b8", "#c7d1dd", "#e6ebf1"], fog: "#c8d2de", fogDensity: 0.022,
    sun: "#eef2ff", sunI: 1.4, sunPos: [-10, 20, 14], hemi: ["#e0eaf6", "#8090a0"], hemiI: 1.25, env: 0.5, exposure: 1.0,
    sand: ["#f2f5f9", "#dde4ee", "#b4c2d2"], speck: ["rgba(140,160,195,.25)", "rgba(255,255,255,.8)"], rake: "rgba(120,150,190,.2)",
    stone: ["#7a828f", "#6a7280"], archDark: "#2a303a", wall: "#2f4f7a", stud: "#dfe8f2", crowd: 1,
    torches: 4, torchI: 6, stars: false, snow: true, cloth: ["#7a2a22", "#2f4f7a", "#3d6b46", "#5a3a6b", "#eae6dd", "#8a6b3a", "#2a2a30"],
    look: { bloom: 0.3, threshold: 2.8, vignette: 0.28, sat: 1.0 }
  }
};
Object.entries(THEMES).forEach(([k, t]) => { t.key = k; });

const TIERS = 10, TIER_D = 0.85, TIER_H = 0.55, PODIUM_H = 1.6;

/* The colosseum: sand, podium wall, stepped stands with a crowd, torches, sky and the shrinking ring of fire. */
export class Arena {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.hemi = new THREE.HemisphereLight("#ffffff", "#806040", 1); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight("#ffffff", 3);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 70 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false }));
    this.stars = new THREE.Mesh(new THREE.SphereGeometry(88, 32, 16), new THREE.MeshBasicMaterial({ map: tex.stars(), side: THREE.BackSide, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(this.sky, this.stars);

    this.floorMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(WALL_R + 0.05, 96), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; scene.add(this.floor);

    /* scorch + fire glow: a shader on a disc, driven by the current fire radius */
    this.fireU = { uR: { value: 99 }, uT: { value: 0 }, uOn: { value: 0 }, map: { value: tex.scorch() } };
    const fire = new THREE.Mesh(new THREE.CircleGeometry(WALL_R, 96), new THREE.ShaderMaterial({
      uniforms: this.fireU, transparent: true, depthWrite: false,
      vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform float uR, uT, uOn; varying vec2 vP;
        void main(){ float r = length(vP), a = atan(vP.y, vP.x);
          float edge = uR + 0.08 * sin(a * 9.0 + uT * 3.0) + 0.05 * sin(a * 23.0 - uT * 5.0);
          float ash = smoothstep(edge - 0.1, edge + 0.6, r) * 0.78;
          float glow = exp(-pow((r - edge) * 3.2, 2.0)) * (0.8 + 0.2 * sin(uT * 14.0 + a * 30.0));
          vec3 c = mix(vec3(0.06, 0.03, 0.015), vec3(1.0, 0.45, 0.1), glow);
          gl_FragColor = vec4(c, max(ash, glow * 0.9) * uOn); }`
    }));
    fire.rotation.x = -Math.PI / 2; fire.position.y = 0.01; fire.renderOrder = 1; scene.add(fire);
    this.fireLights = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight("#ff7a2a", 0, 9, 2); scene.add(l); return l; });

    /* lane warning for the lion and the chariot */
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.5), new THREE.MeshBasicMaterial({ map: tex.lane(), transparent: true, depthWrite: false, opacity: 0 }));
    this.lane.rotation.x = -Math.PI / 2; this.lane.position.y = 0.02; this.lane.renderOrder = 2; scene.add(this.lane);

    this.structure = new THREE.Group(); scene.add(this.structure);
    this.torches = [];
    this.cheers = [];
    this.excite = 0.1;
  }

  setTheme(key) {
    const th = this.theme = THEMES[key] || THEMES.sol;
    const { scene, renderer } = this;
    scene.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    renderer.toneMappingExposure = th.exposure;
    scene.environmentIntensity = th.env;
    this.sky.material.map = tex.sky(th); this.sky.material.needsUpdate = true;
    this.stars.visible = th.stars;
    this.hemi.color.set(th.hemi[0]); this.hemi.groundColor.set(th.hemi[1]); this.hemi.intensity = th.hemiI;
    this.sun.color.set(th.sun); this.sun.intensity = th.sunI; this.sun.position.set(...th.sunPos);
    this.floorMat.map = tex.sand(th); this.floorMat.needsUpdate = true;
    this.buildStructure(th);
    this.buildSnow(th.snow);
  }

  buildStructure(th) {
    const g = this.structure;
    g.traverse(o => { if (o.isMesh || o.isInstancedMesh) { o.geometry.dispose(); if (o.material.dispose) o.material.dispose(); } });
    g.clear();
    for (const t of this.torches) t.light.removeFromParent();
    this.torches = [];
    const stoneTex = tex.stone(th);

    /* podium wall with studs */
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, PODIUM_H, 96, 1, true), new THREE.MeshStandardMaterial({ color: th.wall, map: stoneTex, roughness: 0.85, side: THREE.BackSide }));
    wall.position.y = PODIUM_H / 2; wall.receiveShadow = true; g.add(wall);
    const cap = new THREE.Mesh(new THREE.RingGeometry(WALL_R - 0.05, WALL_R + 0.5, 96), new THREE.MeshStandardMaterial({ color: th.stone[0], roughness: 0.9 }));
    cap.rotation.x = -Math.PI / 2; cap.position.y = PODIUM_H; cap.receiveShadow = true; g.add(cap);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R - 0.02, WALL_R - 0.02, 0.12, 96, 1, true), new THREE.MeshStandardMaterial({ color: th.stud, metalness: 0.8, roughness: 0.35, side: THREE.BackSide }));
    band.position.y = PODIUM_H - 0.12; g.add(band);
    const studs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: th.stud, metalness: 0.9, roughness: 0.3 }), 48);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; m4.makeTranslation(Math.sin(a) * (WALL_R - 0.04), PODIUM_H * 0.45, Math.cos(a) * (WALL_R - 0.04)); studs.setMatrixAt(i, m4); }
    g.add(studs);
    /* two gates */
    for (const a of [Math.PI / 2, -Math.PI / 2]) {
      const gate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), new THREE.MeshStandardMaterial({ color: "#0b0705", roughness: 1 }));
      gate.position.set(Math.sin(a) * (WALL_R - 0.01), 0.7, Math.cos(a) * (WALL_R - 0.01)); gate.lookAt(0, 0.7, 0); g.add(gate);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: th.stud, metalness: 0.8, roughness: 0.4 }));
      arch.position.set(Math.sin(a) * (WALL_R - 0.03), 1.4, Math.cos(a) * (WALL_R - 0.03)); arch.lookAt(0, 1.4, 0); arch.scale.set(1, 0.3, 1); g.add(arch);
    }

    /* stepped stands as one lathe */
    const pts = [new THREE.Vector2(WALL_R + 0.5, PODIUM_H)];
    for (let i = 0; i < TIERS; i++) {
      const r = WALL_R + 0.5 + i * TIER_D, y = PODIUM_H + i * TIER_H;
      pts.push(new THREE.Vector2(r, y + TIER_H), new THREE.Vector2(r + TIER_D, y + TIER_H));
    }
    const outerR = WALL_R + 0.5 + TIERS * TIER_D, topY = PODIUM_H + TIERS * TIER_H;
    pts.push(new THREE.Vector2(outerR, topY + 1.4), new THREE.Vector2(outerR + 0.6, topY + 1.4), new THREE.Vector2(outerR + 0.6, 0));
    const standTex = tex.stone(th).clone(); standTex.repeat.set(40, 6); standTex.needsUpdate = true;
    const stands = new THREE.Mesh(new THREE.LatheGeometry(pts, 128), new THREE.MeshStandardMaterial({ color: th.stone[0], map: standTex, roughness: 0.92, flatShading: true, side: THREE.DoubleSide }));
    stands.receiveShadow = true; g.add(stands);
    const facade = new THREE.Mesh(new THREE.CylinderGeometry(outerR + 0.62, outerR + 0.62, topY + 3.5, 128, 1, true), new THREE.MeshStandardMaterial({ color: "#ffffff", map: tex.facade(th), roughness: 0.9, side: THREE.BackSide }));
    facade.position.y = (topY + 3.5) / 2; g.add(facade);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 32), new THREE.MeshStandardMaterial({ color: th.stone[1], roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; g.add(ground);

    /* the crowd */
    const rnd = mulberry(17), seats = [];
    for (let i = 0; i < TIERS; i++) {
      const r = WALL_R + 0.5 + i * TIER_D + TIER_D * 0.55, y = PODIUM_H + i * TIER_H + TIER_H, n = Math.round(r * 2 * Math.PI * 1.25);
      for (let k = 0; k < n; k++) { if (rnd() > 0.82 * th.crowd + 0.05) continue; const a = (k + rnd() * 0.4) / n * Math.PI * 2; if (Math.abs(Math.sin(a)) > 0.985 && i < 3) continue; seats.push({ a, r: r + (rnd() - 0.5) * 0.15, y, ph: rnd() * 6, amp: 0.5 + rnd() }); }
    }
    const N = seats.length;
    const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.28, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.7 }), N);
    /* arms hang from the shoulder pivot, so the geometry is shifted to point down from its origin */
    const armGeo = new THREE.CapsuleGeometry(0.045, 0.26, 2, 6); armGeo.translate(0, -0.15, 0);
    const arms = new THREE.InstancedMesh(armGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), N * 2);
    const flagGeo = new THREE.PlaneGeometry(0.26, 0.18); flagGeo.translate(0.13, -0.38, 0);
    const flags = new THREE.InstancedMesh(flagGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }), N);
    const skins = ["#e3a978", "#c98d62", "#8f5a38", "#f0c4a0", "#a86b44", "#d9a27c"].map(c => new THREE.Color(c)), cloth = th.cloth.map(c => new THREE.Color(c));
    const flagCols = cloth.concat(["#e8b84a", "#f4e7cf", "#c0392b"].map(c => new THREE.Color(c)));
    seats.forEach((s, i) => {
      const skin = skins[(rnd() * skins.length) | 0];
      bodies.setColorAt(i, cloth[(rnd() * cloth.length) | 0]); heads.setColorAt(i, skin);
      arms.setColorAt(i * 2, skin); arms.setColorAt(i * 2 + 1, skin);
      flags.setColorAt(i, flagCols[(rnd() * flagCols.length) | 0]);
      s.flag = rnd() < 0.3; s.stand = 0; s.lazy = 0.4 + rnd() * 0.6; s.wave = 6 + rnd() * 5;
    });
    for (const m of [bodies, heads, arms, flags]) { m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    g.add(bodies, heads, arms, flags);
    this.crowd = { seats, bodies, heads, arms, flags };
    this.cheers = [];
    this.updateCrowd(0, 0, true);

    /* torches on the podium */
    const tm = new THREE.MeshStandardMaterial({ color: "#3a2618", roughness: 0.9 }), bowl = new THREE.MeshStandardMaterial({ color: "#6b4a2b", metalness: 0.6, roughness: 0.5 });
    for (let k = 0; k < th.torches; k++) {
      const a = (k + 0.5) / th.torches * Math.PI * 2 + 0.2, x = Math.sin(a) * (WALL_R + 0.25), z = Math.cos(a) * (WALL_R + 0.25);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 8), tm); pole.position.set(x, PODIUM_H + 0.55, z); g.add(pole);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.2, 12), bowl); b.position.set(x, PODIUM_H + 1.15, z); g.add(b);
      const light = new THREE.PointLight("#ff9a40", th.torchI, 12, 1.6); light.position.set(x * 0.97, PODIUM_H + 1.6, z * 0.97);
      this.scene.add(light);
      this.torches.push({ x, y: PODIUM_H + 1.3, z, light, base: th.torchI, ph: rnd() * 10 });
    }
  }

  buildSnow(on) {
    if (this.snow) { this.snow.geometry.dispose(); this.snow.removeFromParent(); this.snow = null; }
    if (!on) return;
    const n = 2500, p = new Float32Array(n * 3), r = mulberry(5);
    for (let i = 0; i < n; i++) { p[i * 3] = (r() - 0.5) * 40; p[i * 3 + 1] = r() * 18; p[i * 3 + 2] = (r() - 0.5) * 40; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#ffffff", size: 0.07, map: tex.soft(), transparent: true, depthWrite: false, opacity: 0.9 }));
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  /** The stands nearest (x, z) jump up first and the cheer rolls around the ring. strength 1 = everybody, for a long while. */
  cheer(x, z, strength = 0.7, hold = 2.2) {
    this.cheers.push({ a: Math.atan2(x, z), r: Math.hypot(x, z), k: strength, hold, t: 0 });
  }
  /** A random spot among the front rows, for throwing things into the arena. */
  seatPos(out = new THREE.Vector3()) {
    const front = this.crowd.seats.filter(s => s.y < PODIUM_H + TIER_H * 4);
    const s = front[(Math.random() * front.length) | 0];
    return out.set(Math.sin(s.a) * s.r, s.y + 1.1, Math.cos(s.a) * s.r);
  }

  updateCrowd(t, dt, force) {
    const { seats, bodies, heads, arms, flags } = this.crowd, ex = this.excite;
    for (const c of this.cheers) c.t += dt;
    this.cheers = this.cheers.filter(c => c.t < c.hold + 4);
    if (!force && ex < 0.02 && !this.cheers.length && !this.anyStanding) return;
    const m = this.m4 || (this.m4 = new THREE.Matrix4()), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
    const s0 = new THREE.Vector3(0, 0, 0), side = new THREE.Vector3();
    let standing = false;
    for (let i = 0; i < seats.length; i++) {
      const st = seats[i];
      let want = 0;
      for (const c of this.cheers) {
        let d = Math.abs(st.a - c.a) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
        const reach = c.k >= 1 ? Math.PI : 0.6 + c.k * 1.4;
        if (d > reach) continue;
        const local = c.t - d / 2.2 - (st.r - WALL_R) * 0.03;
        if (local < 0 || local > c.hold * st.lazy + 0.6) continue;
        want = Math.max(want, c.k * (1 - d / reach * 0.6));
      }
      want = Math.min(1, want * (0.6 + st.lazy * 0.6));
      st.stand += (want - st.stand) * Math.min(1, dt * (want > st.stand ? 7 : 2.5));
      if (st.stand > 0.01) standing = true;
      const up = st.stand, jump = Math.max(0, Math.sin(t * (5 + st.amp * 3) + st.ph)) * (ex * 0.22 + up * 0.12) * st.amp;
      const x = Math.sin(st.a) * st.r, z = Math.cos(st.a) * st.r, y = st.y + up * 0.22 + jump;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, st.a + Math.PI);
      m.compose(p.set(x, y + 0.35, z), q, s); bodies.setMatrixAt(i, m);
      m.compose(p.set(x, y + 0.78, z), q, s); heads.setMatrixAt(i, m);
      /* arms: hang down while seated, go up and wave while standing */
      side.set(1, 0, 0).applyQuaternion(q);
      for (let k = 0; k < 2; k++) {
        const sgn = k ? -1 : 1, wave = Math.sin(t * st.wave + st.ph + k * 1.7) * 0.45 * up;
        const ang = sgn * (0.18 + up * (2.55 + (st.flag && k === 0 ? 0.2 : 0)) + wave);
        qa.setFromAxisAngle(Z, ang); qa.premultiply(q);
        p.set(x, y + 0.56, z).addScaledVector(side, sgn * 0.2);
        m.compose(p, qa, s); arms.setMatrixAt(i * 2 + k, m);
        if (k === 0) { m.compose(p, qa, st.flag && up > 0.15 ? s : s0); flags.setMatrixAt(i, m); }
      }
    }
    this.anyStanding = standing;
    for (const im of [bodies, heads, arms, flags]) im.instanceMatrix.needsUpdate = true;
  }

  /** fire: { on, radius, grow } ; flames: additive particle system */
  update(dt, t, fire, flames) {
    this.updateCrowd(t, dt);
    for (const tc of this.torches) {
      tc.light.intensity = tc.base * (0.85 + Math.sin(t * 13 + tc.ph) * 0.08 + Math.sin(t * 7.3 + tc.ph * 2) * 0.07);
      if (Math.random() < dt * 30) flames.spawn({ x: tc.x + (Math.random() - 0.5) * 0.15, y: tc.y, z: tc.z + (Math.random() - 0.5) * 0.15, vy: 0.9 + Math.random() * 0.5, life: 0.45, size: 0.55, grow: -0.6, color: "#ffb050" });
    }
    const u = this.fireU;
    u.uT.value = t;
    u.uOn.value += ((fire.on ? 1 : 0) - u.uOn.value) * Math.min(1, dt * 2);
    u.uR.value = fire.radius;
    if (fire.on) {
      const R = fire.radius + 0.12, n = Math.round(R * Math.PI * 2 * 9 * dt * 10 * fire.grow);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, rr = R + (Math.random() - 0.3) * 0.25;
        flames.spawn({ x: Math.sin(a) * rr, y: 0.05, z: Math.cos(a) * rr, vx: -Math.sin(a) * 0.15, vy: 1 + Math.random() * 1.2, vz: -Math.cos(a) * 0.15, life: 0.4 + Math.random() * 0.4, size: (0.5 + Math.random() * 0.6) * fire.grow, grow: -0.5, color: Math.random() < 0.3 ? "#ffd070" : "#ff7a2a" });
      }
      this.fireLights.forEach((l, i) => { const a = i / 4 * Math.PI * 2 + t * 0.1; l.position.set(Math.sin(a) * R, 0.8, Math.cos(a) * R); l.intensity = 9 * u.uOn.value * (0.85 + Math.sin(t * 11 + i) * 0.15); });
    } else this.fireLights.forEach(l => { l.intensity = 0; });
    if (this.snow) {
      const p = this.snow.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { p[i + 1] -= dt * (0.6 + (i % 7) * 0.08); p[i] += Math.sin(t + i) * dt * 0.2; if (p[i + 1] < 0) p[i + 1] += 18; }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
  }

  showLane(ev, t) {
    if (!ev || ev.warn <= 0) { this.lane.material.opacity = 0; return; }
    const L = ev.end - (-ev.end);
    this.lane.scale.set(L, 1, 1);
    this.lane.position.set(ev.px * ev.o, 0.02, ev.pz * ev.o);
    this.lane.rotation.set(-Math.PI / 2, 0, Math.atan2(-ev.dz, ev.dx));
    this.lane.material.map.repeat.set(L / 1.6, 1);
    this.lane.material.map.offset.x = -t * 1.2;
    this.lane.material.opacity = Math.sin(t * 16) > 0 ? 0.75 : 0.35;
  }
}
