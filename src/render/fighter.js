import * as THREE from "three";
import { solve, orient } from "./ik.js";
import { tex } from "./textures.js";

/* A gladiator built from primitives, posed every frame with IK.
   Local frame: feet on y=0, facing +Z, the right hand is on -X.
   Every look shares the same skeleton and collision size, so looks never change the odds. */

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const PELVIS_Y = 0.98, THIGH = 0.46, SHIN = 0.45, ANKLE = 0.075, UA = 0.29, FA = 0.27;
const SH_R = V(-0.27, 0.5, 0), SH_L = V(0.27, 0.5, 0), HIP_R = V(-0.105, -0.02, 0), HIP_L = V(0.105, -0.02, 0);
export const HEAD_TOP = 2.0;

/* ---------- shared geometry ---------- */
const G = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLo: new THREE.SphereGeometry(1, 10, 8),
  half: new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 24)
};
const gcache = new Map();
function cyl(rt, rb, h, seg = 14, open = false) {
  const k = `c${rt},${rb},${h},${seg},${open}`;
  if (!gcache.has(k)) gcache.set(k, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  return gcache.get(k);
}
function geo(key, make) { if (!gcache.has(key)) gcache.set(key, make()); return gcache.get(key); }
function extrude(key, shape, depth = 0.012, bevel = 0.004) {
  return geo(key, () => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
    g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g;
  });
}

function add(parent, g, mat, p, s, r) {
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  if (p) m.position.set(p[0], p[1], p[2]);
  if (s) { if (typeof s === "number") m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
  if (r) m.rotation.set(r[0], r[1], r[2]);
  parent.add(m);
  return m;
}
function limb(parent, r1, r2, len, mat) {
  add(parent, cyl(r1, r2, len, 14), mat, [0, -len / 2, 0]);
  add(parent, G.sphere, mat, [0, -len, 0], r2);
}
function group(parent, p) { const g = new THREE.Group(); if (p) g.position.copy(p); parent.add(g); return g; }

/* ---------- materials (one set per fighter, so hit flashes and charring stay personal) ---------- */
function materials() {
  const list = [], cache = new Map();
  const M = (color, o = {}) => {
    const key = color + JSON.stringify(o, (k, v) => v && v.isTexture ? v.uuid : v);
    if (cache.has(key)) return cache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? 0.72, metalness: o.metal ?? 0, map: o.map || null, side: o.side ?? THREE.FrontSide,
      transparent: !!o.transparent, alphaTest: o.alphaTest ?? 0
    });
    list.push(m); cache.set(key, m); return m;
  };
  M.metal = c => M(c, { metal: 0.9, rough: 0.3 });
  M.list = list;
  return M;
}

/* ---------- weapons: grip at the origin, pointing along +Y, flat side facing +Z ---------- */
function bladeShape(len, w, x0 = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, x0); s.lineTo(w / 2, x0); s.lineTo(w / 2 * 0.85, x0 + len - w * 1.4); s.lineTo(0, x0 + len); s.lineTo(-w / 2 * 0.85, x0 + len - w * 1.4); s.closePath();
  return s;
}
function buildWeapon(type, M) {
  const g = new THREE.Group(), steel = M.metal("#d5dbe0"), wood = M("#6e4423", { rough: 0.8 }), dark = M("#3a2416"), gold = M.metal("#d4a23a"), iron = M.metal("#6b7078");
  const grip = (len, mat = dark) => add(g, cyl(0.018, 0.018, len, 8), mat, [0, -len / 2 + 0.05, 0]);
  switch (type) {
    case "gladius":
      grip(0.12); add(g, G.sphere, M("#e7dcc6"), [0, -0.08, 0], 0.03);
      add(g, G.box, M("#e7dcc6"), [0, 0.06, 0], [0.09, 0.025, 0.04]);
      add(g, extrude("gladius", bladeShape(0.5, 0.055, 0.07)), steel);
      g.userData.len = 0.57; break;
    case "longsword":
      grip(0.2); add(g, G.sphere, gold, [0, -0.16, 0], 0.03);
      add(g, G.box, iron, [0, 0.06, 0], [0.2, 0.025, 0.03]);
      add(g, extrude("longsword", bladeShape(0.82, 0.05, 0.07)), steel);
      g.userData.len = 0.9; break;
    case "greatsword":
      grip(0.32); add(g, G.sphere, iron, [0, -0.28, 0], 0.035);
      add(g, G.box, iron, [0, 0.07, 0], [0.3, 0.035, 0.04]);
      add(g, extrude("greatsword", bladeShape(1.12, 0.075, 0.09)), steel);
      g.userData.len = 1.2; break;
    case "sica": {
      grip(0.12); add(g, G.box, gold, [0, 0.06, 0], [0.08, 0.022, 0.035]);
      const s = new THREE.Shape(); s.moveTo(-0.022, 0.07); s.lineTo(0.022, 0.07); s.quadraticCurveTo(0.06, 0.32, -0.06, 0.5); s.lineTo(-0.1, 0.52); s.quadraticCurveTo(-0.03, 0.32, -0.022, 0.07);
      add(g, extrude("sica", s), steel); g.userData.len = 0.5; break;
    }
    case "axe": {
      add(g, cyl(0.02, 0.022, 0.75, 8), wood, [0, 0.22, 0]);
      const s = new THREE.Shape(); s.moveTo(0, 0.46); s.lineTo(-0.08, 0.45); s.quadraticCurveTo(-0.16, 0.42, -0.2, 0.36); s.quadraticCurveTo(-0.17, 0.52, -0.21, 0.66); s.quadraticCurveTo(-0.12, 0.62, -0.08, 0.57); s.lineTo(0, 0.57); s.closePath();
      add(g, extrude("axe", s, 0.02), iron); g.userData.len = 0.65; break;
    }
    case "spear": {
      add(g, cyl(0.02, 0.02, 2.0, 8), wood, [0, 0.4, 0]);
      const s = new THREE.Shape(); s.moveTo(0, 1.38); s.quadraticCurveTo(0.06, 1.5, 0, 1.68); s.quadraticCurveTo(-0.06, 1.5, 0, 1.38);
      add(g, extrude("spearhead", s, 0.014), steel); add(g, cyl(0.022, 0.022, 0.06, 8), iron, [0, -0.6, 0]);
      g.userData.len = 1.65; break;
    }
    case "trident": {
      add(g, cyl(0.02, 0.02, 1.8, 8), wood, [0, 0.35, 0]);
      add(g, G.box, steel, [0, 1.25, 0], [0.24, 0.03, 0.03]);
      for (const x of [-0.11, 0, 0.11]) { add(g, cyl(0.012, 0.014, 0.28, 6), steel, [x, 1.39, 0]); add(g, G.cone4, steel, [x, 1.56, 0], [0.022, 0.07, 0.022]); }
      g.userData.len = 1.58; break;
    }
    case "warhammer":
      add(g, cyl(0.022, 0.024, 1.2, 8), M("#2e3036", { metal: 0.6, rough: 0.5 }), [0, 0.3, 0]);
      add(g, G.box, iron, [0.05, 0.9, 0], [0.22, 0.13, 0.13]);
      add(g, G.cone4, iron, [-0.14, 0.9, 0], [0.05, 0.16, 0.05], [0, 0, Math.PI / 2]);
      add(g, G.cone4, iron, [0, 1.02, 0], [0.035, 0.12, 0.035]);
      g.userData.len = 1.05; break;
    case "mace":
      add(g, cyl(0.02, 0.022, 0.6, 8), wood, [0, 0.18, 0]);
      add(g, G.sphere, iron, [0, 0.52, 0], [0.075, 0.09, 0.075]);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, sp = add(g, G.cone4, steel, [Math.cos(a) * 0.075, 0.52 + (i % 2 ? 0.03 : -0.03), Math.sin(a) * 0.075], [0.025, 0.07, 0.025]); sp.lookAt(sp.position.clone().multiplyScalar(3).setY(0.52)); sp.rotateX(Math.PI / 2); }
      g.userData.len = 0.6; break;
    case "flail": {
      add(g, cyl(0.02, 0.022, 0.38, 8), wood, [0, 0.07, 0]);
      add(g, cyl(0.026, 0.026, 0.04, 8), iron, [0, 0.27, 0]);
      g.userData.len = 0.3; g.userData.flail = true; break;
    }
  }
  return g;
}
/* the flail's chain and ball live in world space and swing on a little verlet rope */
function buildFlailBall(M) {
  const ball = new THREE.Group(), iron = M.metal("#8d969e");
  add(ball, G.sphere, iron, [0, 0, 0], 0.075);
  for (let i = 0; i < 10; i++) { const s = add(ball, G.cone4, iron, [0, 0, 0], [0.025, 0.07, 0.025]); const dir = new THREE.Vector3().setFromSphericalCoords(1, Math.acos(1 - 2 * (i + 0.5) / 10), i * 2.4); s.position.copy(dir).multiplyScalar(0.075); s.quaternion.setFromUnitVectors(V(0, 1, 0), dir); }
  const chain = new THREE.Mesh(cyl(0.008, 0.008, 1, 6), M.metal("#5f646c")); chain.castShadow = true;
  return { ball, chain };
}

/* ---------- off-hand: faces +Z, up is +Y, the grip is at the origin ---------- */
function buildOff(d, M) {
  const g = new THREE.Group();
  switch (d.off) {
    case "scutum": {
      const m = M(d.shield, { map: tex.shield("scutum", d.shield, d.shieldTrim), rough: 0.6, side: THREE.DoubleSide });
      const shell = add(g, geo("scutum", () => new THREE.CylinderGeometry(0.5, 0.5, 1.0, 16, 1, true, -0.55, 1.1)), m, [0, 0, -0.42]);
      shell.rotation.y = 0;
      add(g, G.half, M.metal("#c9ced3"), [0, 0, 0.075], [0.07, 0.07, 0.05], [Math.PI / 2, 0, 0]);
      g.userData.size = [0.54, 1.0, 0.12]; break;
    }
    case "aspis": {
      const m = M(d.shield, { map: tex.shield("aspis", d.shield, d.shieldTrim), metal: 0.7, rough: 0.35 });
      add(g, geo("aspis", () => { const s = new THREE.SphereGeometry(1, 28, 8, 0, TAU, 0, 0.55); return s; }), m, [0, 0, -0.38], [0.48, 0.48, 0.48], [Math.PI / 2, 0, 0]);
      add(g, G.torus, M.metal(d.shieldTrim), [0, 0, 0.0], [0.25, 0.25, 0.25]);
      g.userData.size = [0.96, 0.96, 0.15]; break;
    }
    case "roundpaint": {
      const m = M(d.shield, { map: tex.shield("roundpaint", d.shield, d.shieldTrim), rough: 0.65 });
      add(g, cyl(0.4, 0.4, 0.035, 28), m, [0, 0, 0.02], null, [Math.PI / 2, 0, 0]);
      add(g, geo("rim", () => new THREE.TorusGeometry(0.4, 0.018, 6, 32)), M.metal("#6b6f75"), [0, 0, 0.02]);
      add(g, G.half, M.metal("#9aa3ab"), [0, 0, 0.04], [0.08, 0.08, 0.06], [Math.PI / 2, 0, 0]);
      g.userData.size = [0.8, 0.8, 0.08]; break;
    }
    case "parmula":
      add(g, G.box, M(d.shield, { map: tex.shield("parmula", d.shield, d.shieldTrim) }), [0, 0, 0.03], [0.34, 0.38, 0.03]);
      add(g, G.half, M.metal(d.shieldTrim), [0, 0, 0.045], [0.05, 0.05, 0.04], [Math.PI / 2, 0, 0]);
      g.userData.size = [0.34, 0.38, 0.06]; break;
    case "net": {
      const m = M("#ffffff", { map: tex.net(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, rough: 1 });
      const n = add(g, geo("net", () => { const p = new THREE.PlaneGeometry(0.55, 0.9, 4, 6); p.translate(0, -0.45, 0); return p; }), m, [0, 0, 0]);
      n.castShadow = false; g.userData.net = n;
      g.userData.size = [0.5, 0.9, 0.05]; break;
    }
  }
  return g;
}

/* ---------- heads and helmets (head group origin = middle of the head) ---------- */
function buildHead(head, d, M) {
  const skin = M(d.skin, { rough: 0.6 }), dark = M("#150d09"), hair = M(d.hair || "#3a2414", { rough: 0.9 });
  add(head, G.sphere, skin, [0, 0, 0], [0.104, 0.122, 0.112]);
  add(head, G.sphere, skin, [0, -0.06, 0.025], [0.085, 0.065, 0.09]);
  add(head, G.box, skin, [0, -0.005, 0.112], [0.026, 0.045, 0.035], [0.25, 0, 0]);
  for (const s of [-1, 1]) {
    add(head, G.sphere, dark, [s * 0.038, 0.018, 0.098], 0.013);
    add(head, G.box, hair, [s * 0.04, 0.045, 0.103], [0.05, 0.012, 0.015], [0, 0, s * -0.15]);
    add(head, G.sphere, skin, [s * 0.103, -0.005, -0.005], [0.018, 0.033, 0.022]);
  }
  if (d.beard) add(head, G.sphere, M(d.beard, { rough: 0.95 }), [0, -0.085, 0.05], [0.09, 0.075, 0.07]);
  if (d.moustache) for (const s of [-1, 1]) add(head, G.sphere, M(d.moustache, { rough: 0.95 }), [s * 0.03, -0.045, 0.108], [0.035, 0.012, 0.012], [0, 0, s * 0.5]);
  if (d.paint) add(head, G.box, M(d.paint), [0, 0.02, 0.1], [0.17, 0.035, 0.03]);

  const m = M.metal(d.metal || "#b7bec5"), crest = M(d.crest || "#c4302a", { rough: 0.95 });
  const fin = (len, h, z0 = 0, mat = crest) => add(head, geo(`fin${len},${h}`, () => { const c = new THREE.CylinderGeometry(len / 2, len / 2, 0.03, 20, 1, false, 0, Math.PI); c.rotateZ(Math.PI / 2); c.rotateY(Math.PI / 2); c.scale(1, h / (len / 2), 1); return c; }), mat, [0, 0.12, z0]);
  switch (d.helm) {
    case "legion":
      add(head, G.half, m, [0, 0.005, 0], [0.128, 0.14, 0.135]);
      add(head, G.box, m, [0, -0.04, -0.12], [0.2, 0.08, 0.02], [-0.5, 0, 0]);
      for (const s of [-1, 1]) add(head, G.box, m, [s * 0.11, -0.05, 0.04], [0.02, 0.1, 0.08], [0, 0, s * 0.15]);
      add(head, geo("brim", () => new THREE.TorusGeometry(0.13, 0.012, 6, 28)), m, [0, 0.01, 0], [1, 1.04, 1], [Math.PI / 2, 0, 0]);
      fin(0.22, 0.11); break;
    case "champion":
      add(head, G.half, m, [0, 0.005, 0], [0.128, 0.14, 0.135]);
      for (const s of [-1, 1]) add(head, G.box, m, [s * 0.11, -0.05, 0.04], [0.02, 0.1, 0.08], [0, 0, s * 0.15]);
      add(head, G.box, m, [0, -0.04, -0.12], [0.2, 0.08, 0.02], [-0.5, 0, 0]);
      fin(0.3, 0.16, -0.03); break;
    case "murmillo":
      add(head, G.sphere, m, [0, 0.01, 0], [0.14, 0.15, 0.145]);
      add(head, geo("mbrim", () => new THREE.CylinderGeometry(0.25, 0.25, 0.015, 32)), m, [0, -0.07, 0]);
      add(head, G.box, M("#ffffff", { map: tex.grille(), metal: 0.6, rough: 0.4 }), [0, 0, 0.13], [0.15, 0.15, 0.02]);
      fin(0.3, 0.17, -0.02, m); break;
    case "thraex":
      add(head, G.sphere, m, [0, 0.01, 0], [0.14, 0.15, 0.145]);
      add(head, geo("tbrim", () => new THREE.CylinderGeometry(0.22, 0.22, 0.015, 32)), m, [0, -0.08, 0]);
      add(head, G.box, M("#ffffff", { map: tex.rings(), metal: 0.6, rough: 0.4 }), [0, 0, 0.13], [0.14, 0.14, 0.02]);
      add(head, geo("griffin", () => new THREE.TorusGeometry(0.1, 0.025, 8, 16, Math.PI * 1.1)), m, [0, 0.16, 0.0], null, [0, Math.PI / 2, 0]);
      add(head, G.cone4, m, [0, 0.2, 0.12], [0.02, 0.08, 0.04], [1.6, 0, 0]);
      for (const s of [-1, 1]) add(head, G.box, crest, [s * 0.11, 0.17, -0.03], [0.012, 0.22, 0.05], [-0.15, 0, s * -0.2]);
      break;
    case "corinthian":
      add(head, G.sphere, m, [0, 0.01, 0.0], [0.135, 0.155, 0.145]);
      add(head, G.box, dark, [0, 0.02, 0.135], [0.13, 0.025, 0.02]);
      add(head, G.box, dark, [0, -0.06, 0.135], [0.03, 0.08, 0.02]);
      add(head, G.box, m, [0, -0.04, 0.13], [0.012, 0.09, 0.02]);
      fin(0.3, 0.2, -0.03); break;
    case "nasal":
      add(head, geo("nasaldome", () => { const s = new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2); s.scale(1, 1.3, 1); return s; }), m, [0, 0.01, 0], [0.13, 0.13, 0.135]);
      add(head, G.box, m, [0, -0.01, 0.13], [0.02, 0.08, 0.015]);
      add(head, geo("aventail", () => new THREE.CylinderGeometry(0.13, 0.15, 0.13, 20, 1, true)), M("#a0a8b0", { map: tex.mail(), metal: 0.7, rough: 0.5, side: THREE.DoubleSide }), [0, -0.05, -0.02]);
      break;
    case "secutor":
      add(head, G.sphere, m, [0, 0.01, 0.005], [0.14, 0.17, 0.155]);
      for (const s of [-1, 1]) add(head, G.sphere, dark, [s * 0.04, 0.02, 0.145], 0.018);
      fin(0.24, 0.07, -0.01, m); break;
    case "bucket":
      add(head, cyl(0.15, 0.15, 0.3, 20), m, [0, 0.02, 0]);
      add(head, G.box, dark, [0, 0.04, 0.145], [0.18, 0.025, 0.02]);
      add(head, G.box, M.metal("#7a8088"), [0, 0.02, 0.15], [0.02, 0.28, 0.01]);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) add(head, G.sphereLo, dark, [0.04 + i * 0.022, -0.06 - j * 0.02, 0.148], 0.006);
      break;
    case "retiarius":
      add(head, G.half, hair, [0, 0.015, -0.005], [0.112, 0.125, 0.12]);
      break;
    case "wild":
      add(head, G.half, hair, [0, 0.015, -0.01], [0.115, 0.13, 0.125]);
      for (let i = 0; i < 9; i++) { const a = -1.2 + i * 0.3; add(head, G.cone, hair, [Math.sin(a) * 0.08, 0.08 + Math.cos(a) * 0.03, -0.04 - Math.abs(a) * 0.02], [0.035, 0.12, 0.035], [-0.6, 0, -a * 0.8]); }
      add(head, cyl(0.025, 0.012, 0.25, 6), hair, [0, -0.12, -0.11], null, [0.3, 0, 0]);
      break;
    case "wrap": {
      const w = M(d.wrap, { rough: 0.9 });
      add(head, G.half, w, [0, 0.01, 0], [0.118, 0.13, 0.125]);
      add(head, G.box, w, [0, -0.06, 0.09], [0.17, 0.07, 0.06]);
      const tail = add(head, cyl(0.035, 0.015, 0.32, 6), w, [0, -0.02, -0.17], null, [1.1, 0, 0]);
      head.userData.tail = tail; break;
    }
  }
}

/* ---------- body ---------- */
export function buildFighter(d) {
  const M = materials();
  const skin = M(d.skin, { rough: 0.6 }), skinDark = M(shade(d.skin, -0.12), { rough: 0.65 }), cloth = M(d.cloth || "#7a2a22", { rough: 0.9 });
  const metal = M.metal(d.metal || "#b7bec5"), leather = M("#5b3a20", { rough: 0.75 }), leatherDark = M("#3e2614", { rough: 0.75 });
  const root = new THREE.Group();
  const body = group(root);                 // spin and step offsets go here, root keeps the sim position
  const pelvis = group(body, V(0, PELVIS_Y, 0));
  const torso = group(pelvis);
  const head = group(torso, V(0, 0.73, 0.01));

  /* torso */
  const armorMat = {
    bare: skin, segmentata: cloth, mail: M("#a9b0b7", { map: tex.mail(), metal: 0.7, rough: 0.45 }), cuirass: metal,
    leather: M("#6b4424", { rough: 0.7 }), plate: metal, scale: M(d.metal || "#d9b04a", { map: tex.scales(), metal: 0.85, rough: 0.35 })
  }[d.armor] || cloth;
  add(torso, cyl(0.15, 0.165, 0.28), armorMat, [0, 0.16, 0], [1, 1, 0.82]);
  add(torso, G.sphere, armorMat, [0, 0.39, 0], [0.26, 0.2, 0.165]);
  add(torso, G.sphere, armorMat, [0, 0.29, -0.01], [0.21, 0.19, 0.135]);
  add(torso, G.sphere, d.armor === "bare" ? skin : armorMat, [0, 0.53, -0.01], [0.15, 0.07, 0.1]);
  add(torso, cyl(0.062, 0.07, 0.14), skin, [0, 0.62, 0.0]);
  if (d.armor === "bare" || d.armor === "cuirass") {
    const mm = d.armor === "bare" ? skin : metal, ab = d.armor === "bare" ? skinDark : metal;
    for (const s of [-1, 1]) add(torso, G.sphere, mm, [s * 0.095, 0.43, 0.105], [0.11, 0.075, 0.06], [0, 0, s * 0.15]);
    for (const y of [0.3, 0.235, 0.17]) for (const s of [-1, 1]) add(torso, G.sphere, ab, [s * 0.045, y, 0.122], [0.042, 0.032, 0.022]);
  }
  if (d.armor === "segmentata") {
    for (let i = 0; i < 6; i++) add(torso, cyl(0.235 - Math.abs(i - 3) * 0.008, 0.24 - Math.abs(i - 3) * 0.008, 0.055, 18), i % 2 ? M.metal(shade(d.metal, 0.12)) : metal, [0, 0.1 + i * 0.065, 0], [1, 1, 0.75]);
    add(torso, G.box, M.metal("#d4a23a"), [0, 0.32, 0.18], [0.03, 0.2, 0.01]);
  }
  if (d.armor === "leather" || d.strap) {
    add(torso, G.box, leatherDark, [0, 0.33, 0.0], [0.07, 0.62, 0.36], [0, 0, 0.75]);
    for (let i = 0; i < 4; i++) add(torso, G.sphereLo, M.metal("#c9ced3"), [-0.12 + i * 0.08, 0.2 + i * 0.09, 0.15], 0.012);
  }
  if (d.armor === "plate") for (let i = 0; i < 4; i++) add(torso, cyl(0.17, 0.172, 0.012), M.metal(shade(d.metal, -0.4)), [0, 0.08 + i * 0.06, 0], [1, 1, 0.83]);
  if (d.tattoo) for (const s of [-1, 1]) add(torso, G.box, M("#1b1210"), [s * 0.08, 0.47, 0.13], [0.1, 0.012, 0.01], [0, 0, s * 0.4]);
  if (d.paint && d.armor === "bare") add(torso, geo("spiral", () => new THREE.TorusGeometry(0.06, 0.008, 6, 20)), M(d.paint), [0.08, 0.36, 0.16], null, [0, 0.4, 0]);
  if (d.mantle) add(torso, geo("mantle", () => new THREE.TorusGeometry(0.17, 0.07, 10, 22)), M("#7a5a3a", { map: tex.fur(), rough: 1 }), [0, 0.55, -0.01], [1.1, 1, 0.8], [Math.PI / 2, 0, 0]);
  if (d.torc) add(torso, geo("torc", () => new THREE.TorusGeometry(0.075, 0.012, 6, 20)), M.metal("#d4a23a"), [0, 0.6, 0.01], null, [Math.PI / 2 - 0.2, 0, 0]);
  if (d.galerus) add(torso, G.box, metal, [0.33, 0.62, 0], [0.025, 0.2, 0.17], [0, 0, -0.25]);
  if (d.skull) { add(torso, G.sphere, M("#e8e0cc"), [0.06, 0.07, 0.15], [0.035, 0.032, 0.025]); }

  /* cape: a cloth strip that sways */
  let cape = null;
  if (d.cape) {
    const cg = new THREE.PlaneGeometry(0.5, 1.05, 4, 10); cg.translate(0, -0.525, 0);
    cape = add(torso, cg, M(d.cape, { rough: 0.95, side: THREE.DoubleSide }), [0, 0.57, -0.15]);
    cape.userData.base = Float32Array.from(cg.attributes.position.array);
    if (d.capeFur) add(torso, G.sphere, M("#8a6a45", { map: tex.fur(), rough: 1 }), [0, 0.55, -0.08], [0.2, 0.06, 0.1]);
  }

  /* belt + skirt */
  const beltMat = d.belt === "bronze" ? M.metal("#b8923f") : leather;
  add(pelvis, geo("belt", () => new THREE.TorusGeometry(0.17, 0.03, 6, 22)), beltMat, [0, 0.06, 0], [1, 1, 0.82], [Math.PI / 2, 0, 0]);
  add(pelvis, G.sphere, d.skirt === "loin" ? skin : cloth, [0, -0.02, 0], [0.17, 0.12, 0.13]);
  switch (d.skirt) {
    case "tunic": add(pelvis, cyl(0.19, 0.26, 0.34, 18, true), M(d.cloth, { rough: 0.9, side: THREE.DoubleSide }), [0, -0.12, 0], [1, 1, 0.85]); break;
    case "mail": add(pelvis, cyl(0.19, 0.25, 0.32, 18, true), M(d.armor === "plate" ? "#6b7077" : "#a9b0b7", { map: tex.mail(), metal: 0.7, rough: 0.45, side: THREE.DoubleSide }), [0, -0.12, 0], [1, 1, 0.85]); break;
    case "fur": add(pelvis, cyl(0.19, 0.27, 0.32, 14, true), M(d.cloth, { map: tex.fur(), rough: 1, side: THREE.DoubleSide }), [0, -0.12, 0], [1, 1, 0.85]); break;
    case "loin":
      add(pelvis, cyl(0.175, 0.18, 0.1, 18), cloth, [0, 0.0, 0], [1, 1, 0.8]);
      add(pelvis, G.box, cloth, [0, -0.13, 0.11], [0.16, 0.24, 0.02], [-0.08, 0, 0]);
      add(pelvis, G.box, cloth, [0, -0.1, -0.1], [0.18, 0.16, 0.02], [0.1, 0, 0]);
      break;
    case "pteruges": {
      add(pelvis, cyl(0.18, 0.19, 0.08, 18), cloth, [0, 0.0, 0], [1, 1, 0.82]);
      const strip = M(d.armor === "scale" ? "#8a5a2b" : "#6b4220", { rough: 0.7 });
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; add(pelvis, G.box, strip, [Math.sin(a) * 0.19, -0.13, Math.cos(a) * 0.16], [0.06, 0.22, 0.012], [0, a, 0]); }
      break;
    }
  }

  /* legs */
  const legs = {};
  for (const [side, hip] of [["R", HIP_R], ["L", HIP_L]]) {
    const upper = group(pelvis, hip), lower = group(upper, V(0, -THIGH, 0)), end = group(lower, V(0, -SHIN, 0));
    const thighMat = d.armor === "plate" ? metal : skin;
    limb(upper, 0.095, 0.068, THIGH, thighMat);
    add(upper, G.sphere, thighMat, [0, -0.2, 0.025], [0.085, 0.16, 0.085]);
    limb(lower, 0.066, 0.046, SHIN, skin);
    add(lower, G.sphere, skin, [0, -0.13, -0.025], [0.062, 0.11, 0.066]);
    if (d.greaves) { const gm = M.metal(d.greaves); add(lower, cyl(0.075, 0.058, 0.32, 14), gm, [0, -0.22, 0.01]); add(lower, G.sphere, gm, [0, 0, 0.02], [0.07, 0.07, 0.07]); }
    if (d.wraps) for (let i = 0; i < 4; i++) add(upper, cyl(0.09 - i * 0.006, 0.088 - i * 0.006, 0.035, 12), M("#efe6d2", { rough: 0.95 }), [0, -0.2 - i * 0.06, 0]);
    const boot = d.armor === "plate" ? M.metal("#2e3036") : d.armor === "mail" ? M("#4a3220") : leather;
    add(end, G.box, boot, [0, -0.035, 0.055], [0.1, 0.075, 0.25]);
    add(end, cyl(0.05, 0.055, 0.1, 10), boot, [0, 0.0, 0]);
    legs[side] = { upper, lower, end, L1: THIGH, L2: SHIN };
  }

  /* arms */
  const arms = {};
  for (const [side, sh] of [["R", SH_R], ["L", SH_L]]) {
    const upper = group(torso, sh), lower = group(upper, V(0, -UA, 0)), end = group(lower, V(0, -FA, 0));
    add(upper, G.sphere, skin, [0, -0.01, 0], [0.095, 0.09, 0.095]);
    limb(upper, 0.07, 0.058, UA, skin);
    add(upper, G.sphere, skin, [0, -0.14, 0.025], [0.062, 0.1, 0.068]);
    limb(lower, 0.058, 0.044, FA, skin);
    add(lower, G.sphere, skin, [0, -0.07, 0.01], [0.055, 0.09, 0.055]);
    add(end, G.sphere, skin, [0, 0, 0], [0.05, 0.058, 0.055]);
    if (d.manica) for (let i = 0; i < 9; i++) { const seg = i < 5 ? upper : lower, y = i < 5 ? -0.04 - i * 0.055 : -0.03 - (i - 5) * 0.06; add(seg, cyl(0.078 - (i < 5 ? 0 : 0.012), 0.074 - (i < 5 ? 0 : 0.012), 0.05, 12), i % 2 ? metal : M.metal("#c9d0d6"), [0, y, 0]); }
    else if (d.armor === "plate") { add(upper, cyl(0.078, 0.066, 0.24, 12), metal, [0, -0.15, 0]); add(lower, cyl(0.066, 0.052, 0.22, 12), metal, [0, -0.13, 0]); add(lower, G.sphere, metal, [0, 0, 0], 0.07); }
    else add(lower, cyl(0.06, 0.052, 0.13, 10), leatherDark, [0, -0.17, 0]);
    if (d.armband && !d.manica) add(upper, cyl(0.075, 0.073, 0.035, 12), M.metal("#d4a23a"), [0, -0.12, 0]);
    if (d.tattoo) for (const y of [-0.1, -0.17]) add(upper, cyl(0.072, 0.07, 0.014, 12), M("#1b1210"), [0, y, 0]);
    if (d.pauldron) {
      add(upper, G.half, metal, [0, 0.02, 0], [0.13, 0.1, 0.13]);
      if (d.spiked) for (const [x, z] of [[0, 0], [0.06, 0.05], [-0.05, -0.05]]) add(upper, G.cone, M.metal(shade(d.metal, 0.2)), [x * (side === "R" ? -1 : 1), 0.13, z], [0.025, 0.1, 0.025]);
    }
    arms[side] = { upper, lower, end, L1: UA, L2: FA };
  }

  buildHead(head, d, M);

  /* hands */
  const weapon = buildWeapon(d.weapon, M);
  arms.R.end.add(weapon);
  let off = null, flail = null;
  if (weapon.userData.flail) { flail = buildFlailBall(M); flail.pos = null; flail.prev = null; }
  if (d.off === "sword2") off = buildWeapon("gladius", M);
  else if (d.off === "axe2") off = buildWeapon("axe", M);
  else if (d.off !== "2h") off = buildOff(d, M);
  if (off) arms.L.end.add(off);

  root.traverse(o => { if (o.isMesh) o.userData.fighterMesh = true; });
  const view = { d, root, body, pelvis, torso, head, arms, legs, weapon, off, cape, flail, mats: M.list, flashT: 0, emis: -1 };
  return view;
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  if (f < 0) c.multiplyScalar(1 + f); else c.lerp(new THREE.Color(1, 1, 1), f);
  return "#" + c.getHexString();
}

/* ---------- posing ---------- */
const P = (x, y, z) => new THREE.Vector3(x, y, z);
const tmpP = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpF = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;
const lerpV = (out, a, b, t) => out.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));

const LONG = new Set(["spear", "trident", "greatsword", "warhammer"]);
const REST = { p: [-0.25, 0.2, 0.3], d: [0, 0.55, 0.85] };
const REST_LONG = { p: [-0.24, 0.14, 0.26], d: [0.05, 0.25, 1] };
const SHIELDY = new Set(["scutum", "aspis", "roundpaint", "parmula"]);
const POLE_R = P(-1, -0.6, -0.6).normalize(), POLE_L = P(1, -0.6, -0.6).normalize(), POLE_LEG = P(0, 0, 1);

/* every attack is a few key poses for the weapon hand; they all land at the same moment (HIT_AT) */
function attackPose(atk, s, d, out) {
  const long = LONG.has(d.weapon), rest = long ? REST_LONG : REST;
  const seq = (keys) => {
    let i = 0; while (i < keys.length - 2 && s > keys[i + 1][0]) i++;
    const [s0, a, e0] = keys[i], [s1, b] = keys[i + 1];
    let t = clamp((s - s0) / (s1 - s0), 0, 1); t = e0 === "in" ? easeIn(t) : e0 === "lin" ? t : easeOut(t);
    lerpV(out.p, a.p, b.p, t); lerpV(out.d, a.d, b.d, t);
    out.lean = lerp(a.lean || 0, b.lean || 0, t); out.twist = lerp(a.twist || 0, b.twist || 0, t);
    out.dx = lerp(a.dx || 0, b.dx || 0, t); out.crouch = lerp(a.crouch ?? 0.15, b.crouch ?? 0.15, t);
    out.jump = lerp(a.jump || 0, b.jump || 0, t);
  };
  out.spin = 0;
  if (atk === 4 && !SHIELDY.has(d.off)) atk = 0;
  if (atk === 1 && !long && d.weapon !== "gladius" && d.weapon !== "longsword" && d.weapon !== "sica") atk = 3;
  switch (atk) {
    case 0: case 2: if (atk === 0) {
      seq([[0, rest], [0.35, { p: [-0.18, 0.85, -0.08], d: [0.15, 0.35, -0.92], lean: -0.12, twist: -0.4 }, "in"],
        [0.58, { p: [-0.02, 0.12, 0.5], d: [0.3, -0.55, 0.8], lean: 0.3, twist: 0.35, dx: 0.12, crouch: 0.3 }],
        [1, { ...rest, crouch: 0.15 }]]);
      break;
    }
      seq([[0, rest], [0.08, { p: [-0.5, 0.38, 0.2], d: [-0.6, 0.05, 0.8], crouch: 0.3 }, "lin"], [0.6, { p: [-0.5, 0.38, 0.2], d: [-0.6, 0.05, 0.8], crouch: 0.3 }], [1, rest]]);
      out.spin = s < 0.08 ? 0 : s < 0.6 ? easeOut((s - 0.08) / 0.52) * TAU : TAU;
      out.jump = s > 0.08 && s < 0.6 ? Math.sin(Math.PI * (s - 0.08) / 0.52) * 0.12 : 0;
      break;
    case 1:
      seq([[0, rest], [0.35, { p: [-0.3, 0.28, -0.08], d: [0, 0.12, 1], lean: -0.1, twist: -0.3 }, "in"],
        [0.6, { p: [-0.1, 0.42, 0.6], d: [0, 0, 1], lean: 0.32, twist: 0.25, dx: 0.22, crouch: 0.4 }],
        [1, rest]]);
      break;
    case 3:
      seq([[0, rest], [0.3, { p: [-0.12, 0.9, 0.0], d: [0, 0.95, -0.3], lean: -0.05, crouch: 0.05 }, "in"],
        [0.55, { p: [-0.04, 0.12, 0.52], d: [0, -0.6, 0.8], lean: 0.3, crouch: 0.55, dx: 0.15 }],
        [0.75, { p: [-0.04, 0.14, 0.5], d: [0, -0.55, 0.8], lean: 0.25, crouch: 0.55, dx: 0.15 }],
        [1, rest]]);
      out.jump = s > 0.08 && s < 0.55 ? Math.sin(Math.PI * (s - 0.08) / 0.47) * 0.55 : 0;
      break;
    case 4:
      seq([[0, rest], [0.35, { p: [-0.3, 0.3, 0.02], d: [0, 0.9, 0.2], lean: -0.05, twist: -0.25 }],
        [0.58, { p: [-0.3, 0.3, 0.02], d: [0, 0.9, 0.2], lean: 0.3, twist: 0.15, dx: 0.2, crouch: 0.35 }, "in"],
        [1, rest]]);
      out.bash = s < 0.35 ? easeOut(s / 0.35) * 0.3 : s < 0.6 ? lerp(0.3, 1, easeIn((s - 0.35) / 0.25)) : 1 - easeOut((s - 0.6) / 0.4);
      break;
  }
}

const pose = { p: new THREE.Vector3(), d: new THREE.Vector3(), lean: 0, twist: 0, dx: 0, crouch: 0.15, jump: 0, spin: 0, bash: 0 };
const pl = new THREE.Vector3(), dl = new THREE.Vector3(), fl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, 1);
const footR = new THREE.Vector3(), footL = new THREE.Vector3(), flatQ = new THREE.Quaternion(), qH = new THREE.Quaternion();

/** st: { t, walk, mv, swing, atk, flexT, hurt, dodgeT, dodgeSide, parryT, celebrate, victory, rage, speedSway } */
export function poseFighter(v, st, dt) {
  const d = v.d, t = st.t, s = st.swing;
  pose.p.set(...REST.p); pose.d.set(...REST.d);
  if (LONG.has(d.weapon)) { pose.p.set(...REST_LONG.p); pose.d.set(...REST_LONG.d); }
  pose.lean = Math.sin(t * 1.6) * 0.02; pose.twist = 0; pose.dx = 0; pose.crouch = 0.15; pose.jump = 0; pose.spin = 0; pose.bash = 0;
  let mode = "fight";
  if (st.celebrate) mode = "celebrate";
  else if (s >= 0) attackPose(st.atk, s, d, pose);
  else if (st.flexT > 0) mode = "flex";
  else if (st.parryT > 0) { pose.p.set(-0.05, 0.58, 0.36); pose.d.set(1, 0.4, 0.15); pose.lean = -0.08; }
  const mv = clamp(st.mv, 0, 1);
  if (s < 0 && mode === "fight") { pose.p.z += Math.sin(st.walk) * 0.07 * mv; pose.p.y += Math.sin(t * 2.2) * 0.012; pose.lean += 0.08 * mv; }
  if (st.dodgeT > 0) { const k = Math.sin(Math.PI * (1 - st.dodgeT / 0.35)); pose.crouch = Math.max(pose.crouch, 0.15 + 0.5 * k); pose.lean -= 0.25 * k; }
  if (st.hurt > 0) { const k = st.hurt / 0.3; pose.lean -= 0.35 * k; pose.dx -= 0.12 * k; }
  let side = st.dodgeT > 0 ? Math.sin(Math.PI * (1 - st.dodgeT / 0.35)) * 0.35 * (st.dodgeSide || 1) : 0;

  /* right (weapon) hand */
  let rp = pose.p, rd = pose.d, poleR = POLE_R;
  let cj = 0;
  if (mode === "flex") { rp = tmpP.set(-0.56, 0.8, 0.05); rd = tmpD.set(0, 1, -0.3); poleR = P(-0.2, -1, 0).normalize(); }
  else if (mode === "celebrate") {
    const vi = st.victory || 0;
    if (vi === 1) { rp = tmpP.set(-0.56, 0.8, 0.05); rd = tmpD.set(0, 1, -0.3); poleR = P(-0.2, -1, 0).normalize(); }
    else { rp = tmpP.set(-0.3, 1.0 + Math.sin(t * 9) * 0.04, 0.08); rd = tmpD.set(0, 1, 0.1); cj = vi === 0 ? Math.abs(Math.sin(t * 6.5)) * 0.25 : 0; }
  }
  const rq = orient(rd, tmpF.set(-rd.z * 0.2, 0, 1), qH);
  solve(v.arms.R, SH_R, rp, poleR, rq);

  /* left hand: shield, second weapon, two-handed grip or net */
  const twoH = d.off === "2h", dual = d.off === "sword2" || d.off === "axe2";
  let lq;
  if (mode === "flex" || (mode === "celebrate" && (st.victory || 0) === 1)) { pl.set(0.56, 0.8, 0.05); dl.set(0, 1, -0.3); lq = orient(dl, fwd, tmpQ); solve(v.arms.L, SH_L, pl, P(0.2, -1, 0).normalize(), lq); }
  else if (mode === "celebrate") { pl.set((st.victory || 0) === 0 ? 0.3 : 0.24, (st.victory || 0) === 0 ? 1.0 : 0.05, (st.victory || 0) === 0 ? 0.08 : 0.1); dl.set(0, 1, 0.1); lq = orient(dl, fwd, tmpQ); solve(v.arms.L, SH_L, pl, POLE_L, lq); }
  else if (twoH) {
    pl.copy(rp).addScaledVector(rd.clone().normalize(), -0.14);
    solve(v.arms.L, SH_L, pl, POLE_L, rq);
  } else if (dual) {
    const lagged = { p: new THREE.Vector3(), d: new THREE.Vector3() };
    if (s >= 0) { attackPose(st.atk === 2 ? 0 : st.atk, clamp(s - 0.18, 0, 1), d, lagged); } else { lagged.p.set(...REST.p); lagged.d.set(...REST.d); lagged.p.z -= Math.sin(st.walk) * 0.07 * mv; }
    pl.set(-lagged.p.x, lagged.p.y, lagged.p.z); dl.set(-lagged.d.x, lagged.d.y, lagged.d.z);
    lq = orient(dl, fl.set(dl.z * 0.2, 0, 1), tmpQ);
    solve(v.arms.L, SH_L, pl, POLE_L, lq);
  } else if (d.off === "net") {
    pl.set(0.3, 0.14 + Math.sin(t * 2) * 0.02, 0.22 - Math.sin(st.walk) * 0.06 * mv);
    lq = orient(up, fwd, tmpQ); solve(v.arms.L, SH_L, pl, POLE_L, lq);
  } else {
    const raise = st.parryT > 0 ? 1 : 0, b = pose.bash;
    pl.set(lerp(0.19, 0.1, raise) - b * 0.06, lerp(0.3, 0.52, raise) + b * 0.08, lerp(0.32, 0.4, raise) + b * 0.25 - Math.sin(st.walk) * 0.05 * mv);
    lq = orient(up, fl.set(-0.15, 0, 1), tmpQ); solve(v.arms.L, SH_L, pl, POLE_L, lq);
  }

  /* torso, body, legs */
  const crouch = pose.crouch;
  v.body.position.set(0, pose.jump + cj, pose.dx);
  v.body.rotation.y = pose.spin;
  v.pelvis.position.y = PELVIS_Y - crouch * 0.28 + (st.celebrate ? 0 : Math.sin(st.walk * 2) * 0.02 * mv);
  v.torso.rotation.set(pose.lean + crouch * 0.15, pose.twist, side);
  v.head.rotation.set(-pose.lean * 0.6, Math.sin(t * 0.7) * 0.15 - pose.twist * 0.5, 0);
  const hy = -(v.pelvis.position.y - ANKLE), tuck = clamp((pose.jump + cj) * 1.3, 0, 0.35);
  const stride = 0.3 * mv, lift = 0.13 * mv;
  footR.set(-0.13, hy + Math.max(0, Math.cos(st.walk)) * lift + tuck, -0.1 * (1 - mv) + Math.sin(st.walk) * stride - tuck * 0.3);
  footL.set(0.13, hy + Math.max(0, -Math.cos(st.walk)) * lift + tuck, 0.14 * (1 - mv) - Math.sin(st.walk) * stride - tuck * 0.3);
  footR.x -= crouch * 0.06; footL.x += crouch * 0.06;
  solve(v.legs.R, HIP_R, footR, POLE_LEG, flatQ);
  solve(v.legs.L, HIP_L, footL, POLE_LEG, flatQ);

  /* cloth, wrap tail, net */
  if (v.cape) {
    const pos = v.cape.geometry.attributes.position, base = v.cape.userData.base, sw = 0.12 + clamp(st.speedSway, 0, 1) * 0.35 + pose.jump * 0.4;
    for (let i = 0; i < pos.count; i++) {
      const by = base[i * 3 + 1], k = clamp(-by / 1.05, 0, 1);
      pos.array[i * 3 + 2] = base[i * 3 + 2] - k * k * sw - Math.sin(t * 2.6 + by * 5 + base[i * 3] * 3) * 0.035 * k - k * (pose.lean + crouch * 0.15) * 0.6;
    }
    pos.needsUpdate = true; v.cape.geometry.computeVertexNormals();
  }
  if (v.head.userData.tail) v.head.userData.tail.rotation.x = 1.1 + Math.sin(t * 5) * 0.15 + clamp(st.speedSway, 0, 1) * 0.4;
  if (v.off && v.off.userData.net) v.off.userData.net.rotation.x = Math.sin(t * 2.4) * 0.12 - mv * 0.3;
}

/* the flail ball: a verlet point on a short chain hanging from the weapon tip */
const tipW = new THREE.Vector3(), dirC = new THREE.Vector3();
export function updateFlail(v, dt, scene) {
  const f = v.flail; if (!f) return;
  if (!f.ball.parent) { scene.add(f.ball); scene.add(f.chain); }
  v.weapon.updateWorldMatrix(true, false);
  tipW.set(0, 0.29, 0).applyMatrix4(v.weapon.matrixWorld);
  if (!f.pos) { f.pos = tipW.clone().add(P(0, -0.38, 0)); f.prev = f.pos.clone(); }
  const vel = f.pos.clone().sub(f.prev).multiplyScalar(0.985);
  f.prev.copy(f.pos);
  f.pos.add(vel).add(P(0, -9.8 * dt * dt, 0));
  if (f.pos.y < 0.08) f.pos.y = 0.08;
  dirC.subVectors(f.pos, tipW); const L = dirC.length() || 1e-3;
  f.pos.copy(tipW).addScaledVector(dirC, 0.38 / L);
  f.ball.position.copy(f.pos);
  f.chain.position.copy(tipW).lerp(f.pos, 0.5);
  f.chain.scale.set(1, 0.38, 1);
  f.chain.quaternion.setFromUnitVectors(up, dirC.normalize());
}
export function removeFlail(v) { if (v.flail) { v.flail.ball.removeFromParent(); v.flail.chain.removeFromParent(); v.flail.pos = null; } }

/* hit flash and rage glow */
export function tintFighter(v, dt, rage, t) {
  v.flashT = Math.max(0, v.flashT - dt);
  const k = v.flashT > 0 ? v.flashT / 0.18 : 0, r = rage ? 0.25 + Math.sin(t * 10) * 0.12 : 0;
  const key = Math.round(k * 40) * 100 + Math.round(r * 40);
  if (key === v.emis) return;
  v.emis = key;
  for (const m of v.mats) m.emissive.setRGB(k * 0.9 + r * 0.9, k * 0.12 + r * 0.22, k * 0.08);
}
export function charFighter(v) { for (const m of v.mats) { m.color.multiplyScalar(0.18); m.metalness *= 0.3; m.roughness = 1; m.emissive.setRGB(0, 0, 0); } v.emis = -2; }
export function disposeFighter(v) {
  removeFlail(v);
  for (const m of v.mats) m.dispose();
  for (const c of v.cape ? [v.cape.geometry] : []) c.dispose();
}
