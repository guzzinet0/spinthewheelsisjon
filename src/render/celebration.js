import * as THREE from "three";
import { WALL_R } from "./physics.js";

/* The victory shower: petals and cloth strips that flutter down over the sand, and roses thrown from the stands
   at the winner. Everything stays where it lands until the next match. Only for looks. */
const PETALS = 420, STRIPS = 160, ROSES = 28;
const PETAL_COLS = ["#c0182a", "#e0405a", "#f27a8a", "#fbe6e8", "#ffffff", "#e8a33a"];

function petalTex() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grd = g.createRadialGradient(32, 40, 2, 32, 32, 30);
  grd.addColorStop(0, "#ffffff"); grd.addColorStop(1, "#c8c8c8");
  g.fillStyle = grd; g.beginPath();
  g.moveTo(32, 62); g.bezierCurveTo(4, 44, 6, 8, 32, 4); g.bezierCurveTo(58, 8, 60, 44, 32, 62); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function stripTex() {
  const c = document.createElement("canvas"); c.width = 32; c.height = 128;
  const g = c.getContext("2d");
  for (let y = 0; y < 128; y++) { const k = 0.82 + 0.18 * Math.sin(y * 0.3); g.fillStyle = `rgb(${255 * k | 0},${255 * k | 0},${255 * k | 0})`; g.fillRect(0, y, 32, 1); }
  g.clearRect(0, 120, 8, 8); g.clearRect(24, 120, 8, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1), s0 = new THREE.Vector3(0, 0, 0), pv = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

export class Celebration {
  constructor(scene) {
    this.scene = scene;
    const mk = (geo, map, n) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.receiveShadow = true;
      for (let i = 0; i < n; i++) { m.setMatrixAt(i, m4.makeScale(0, 0, 0)); m.setColorAt(i, new THREE.Color()); }
      scene.add(m); return m;
    };
    this.petals = mk(new THREE.PlaneGeometry(0.09, 0.08), petalTex(), PETALS);
    this.strips = mk(new THREE.PlaneGeometry(0.06, 0.26), stripTex(), STRIPS);
    this.bits = [];          // fluttering petals and strips
    this.roses = [];
    this.roseGeo = { head: new THREE.IcosahedronGeometry(0.05, 1), leaf: new THREE.ConeGeometry(0.035, 0.07, 5), stem: new THREE.CylinderGeometry(0.007, 0.007, 0.3, 5) };
    this.roseMat = { head: new THREE.MeshStandardMaterial({ color: "#a8101e", roughness: 0.6 }), stem: new THREE.MeshStandardMaterial({ color: "#2f6b2a", roughness: 0.8 }) };
    this.pending = [];       // roses waiting to be thrown: { at, from, to }
    this.time = 0;
  }

  /** Starts the shower. cloth: theme colours, seat(): a random spot in the stands, target: the winner. */
  start(cloth, seat, target) {
    this.clear();
    const cols = cloth.concat(["#e8b84a", "#f4e7cf"]);
    for (let i = 0; i < PETALS + STRIPS; i++) {
      const strip = i >= PETALS, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (WALL_R - 0.5);
      this.bits.push({
        mesh: strip ? this.strips : this.petals, idx: strip ? i - PETALS : i,
        x: Math.sin(a) * r, y: rnd(6, 11), z: Math.cos(a) * r, delay: rnd(0, 4.5),
        fall: strip ? rnd(0.9, 1.3) : rnd(0.55, 0.85), sway: rnd(0.3, 0.8), ph: rnd(0, 6), f: rnd(1.5, 3),
        rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), sx: rnd(-4, 4), sy: rnd(-3, 3), sz: rnd(-4, 4), landed: false
      });
      const c = new THREE.Color(strip ? cols[(Math.random() * cols.length) | 0] : PETAL_COLS[(Math.random() * PETAL_COLS.length) | 0]);
      (strip ? this.strips : this.petals).setColorAt(strip ? i - PETALS : i, c);
    }
    this.petals.instanceColor.needsUpdate = true; this.strips.instanceColor.needsUpdate = true;
    for (let i = 0; i < ROSES; i++) this.pending.push({ at: 0.4 + i * 0.12 + rnd(0, 0.5), from: seat(), to: target });
    this.pending.sort((a, b) => a.at - b.at);
    this.time = 0;
  }

  throwRose({ from, to }) {
    const g = new THREE.Group(), { head, leaf, stem } = this.roseGeo;
    const st = new THREE.Mesh(stem, this.roseMat.stem); st.position.y = -0.15;
    const hd = new THREE.Mesh(head, this.roseMat.head); hd.scale.set(1, 0.8, 1);
    const lf = new THREE.Mesh(leaf, this.roseMat.stem); lf.position.set(0.03, -0.12, 0); lf.rotation.z = -1;
    for (const m of [st, hd, lf]) m.castShadow = true;
    g.add(st, hd, lf);
    const a = Math.random() * Math.PI * 2, d = rnd(0.5, 1.6);
    const tx = to.x + Math.sin(a) * d, tz = to.z + Math.cos(a) * d, T = rnd(1.1, 1.6);
    g.position.copy(from);
    this.scene.add(g);
    this.roses.push({ g, vx: (tx - from.x) / T, vy: (0.04 - from.y + 0.5 * 9.8 * T * T) / T, vz: (tz - from.z) / T, spin: new THREE.Vector3(rnd(-9, 9), rnd(-4, 4), rnd(-9, 9)), landed: false });
  }

  update(dt, t) {
    if (!this.bits.length && !this.roses.length && !this.pending.length) return;
    this.time += dt;
    while (this.pending.length && this.pending[0].at <= this.time) this.throwRose(this.pending.shift());
    for (const r of this.roses) {
      if (r.landed) continue;
      r.vy -= 9.8 * dt;
      r.g.position.x += r.vx * dt; r.g.position.y += r.vy * dt; r.g.position.z += r.vz * dt;
      r.g.rotation.x += r.spin.x * dt; r.g.rotation.y += r.spin.y * dt; r.g.rotation.z += r.spin.z * dt;
      if (r.g.position.y <= 0.05 && r.vy < 0) { r.landed = true; r.g.position.y = 0.05; r.g.rotation.set(0, Math.random() * 6.28, Math.PI / 2); }
    }
    let dirtyP = false, dirtyS = false;
    for (const b of this.bits) {
      if (b.landed) continue;
      if (this.time < b.delay) continue;
      const k = t * b.f + b.ph;
      b.y -= b.fall * dt * (0.75 + 0.35 * Math.sin(k * 2));
      b.x += Math.sin(k) * b.sway * dt; b.z += Math.cos(k * 0.8) * b.sway * dt;
      b.rx += b.sx * dt; b.ry += b.sy * dt; b.rz += b.sz * dt;
      if (b.y <= 0.012) {
        b.landed = true; b.y = 0.008 + (b.idx % 7) * 0.0008;
        e.set(-Math.PI / 2, 0, b.ry);
      } else e.set(b.rx, b.ry, b.rz);
      b.mesh.setMatrixAt(b.idx, m4.compose(pv.set(b.x, b.y, b.z), q.setFromEuler(e), s1));
      if (b.mesh === this.petals) dirtyP = true; else dirtyS = true;
    }
    if (dirtyP) this.petals.instanceMatrix.needsUpdate = true;
    if (dirtyS) this.strips.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const b of this.bits) b.mesh.setMatrixAt(b.idx, m4.compose(pv.set(0, -10, 0), q.identity(), s0));
    this.petals.instanceMatrix.needsUpdate = true; this.strips.instanceMatrix.needsUpdate = true;
    for (const r of this.roses) r.g.removeFromParent();
    this.bits = []; this.roses = []; this.pending = [];
  }
}
