import * as THREE from "three";

/* The lion and the chariot that charge across the sand. Both face +Z. */
const TAU = Math.PI * 2;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, flatShading: !!o.flat });
function add(parent, geo, mat, p, s, r) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  if (p) m.position.set(...p); if (s) typeof s === "number" ? m.scale.setScalar(s) : m.scale.set(...s); if (r) m.rotation.set(...r);
  parent.add(m); return m;
}
const S = new THREE.SphereGeometry(1, 18, 12), C = r => new THREE.CylinderGeometry(r[0], r[1], r[2], 10), B = new THREE.BoxGeometry(1, 1, 1);

function leg(parent, p, len, r, mat, paw) {
  const g = new THREE.Group(); g.position.set(...p); parent.add(g);
  const upper = add(g, C([r, r * 0.8, len * 0.55]), mat, [0, -len * 0.27, 0]);
  const knee = new THREE.Group(); knee.position.set(0, -len * 0.55, 0); g.add(knee);
  add(knee, C([r * 0.75, r * 0.6, len * 0.45]), mat, [0, -len * 0.22, 0]);
  add(knee, S, paw || mat, [0, -len * 0.45, 0.04], [r * 1.1, r * 0.6, r * 1.5]);
  upper.userData = {}; g.userData.knee = knee;
  return g;
}

export function buildLion() {
  const g = new THREE.Group(), fur = std("#c8913f"), dark = std("#9c6a28"), mane = std("#6e3f17", { flat: true, rough: 1 }), black = std("#1a120d");
  const body = new THREE.Group(); g.add(body);
  add(body, S, fur, [0, 0.78, -0.05], [0.33, 0.32, 0.78]);
  add(body, S, fur, [0, 0.82, 0.45], [0.36, 0.38, 0.42]);
  const head = new THREE.Group(); head.position.set(0, 1.02, 0.85); body.add(head);
  add(head, new THREE.IcosahedronGeometry(1, 1), mane, [0, 0.02, -0.08], [0.42, 0.42, 0.36]);
  add(head, S, fur, [0, 0, 0.1], [0.2, 0.21, 0.22]);
  add(head, S, std("#e2b46a"), [0, -0.07, 0.29], [0.12, 0.1, 0.12]);
  add(head, S, black, [0, -0.02, 0.4], [0.045, 0.035, 0.03]);
  const jaw = add(head, S, std("#e2b46a"), [0, -0.15, 0.24], [0.1, 0.05, 0.11]);
  add(head, S, std("#5a1414"), [0, -0.12, 0.27], [0.07, 0.03, 0.08]);
  for (const s of [-1, 1]) { add(head, S, black, [s * 0.09, 0.07, 0.29], 0.025); add(head, S, fur, [s * 0.15, 0.2, 0.02], [0.06, 0.06, 0.03]); }
  const legs = [[-0.2, 0.7, 0.5, 0], [0.2, 0.7, 0.5, Math.PI], [-0.2, 0.7, -0.55, Math.PI], [0.2, 0.7, -0.55, 0]].map(([x, y, z, ph]) => ({ g: leg(body, [x, y, z], 0.7, 0.1, z > 0 ? fur : dark), ph }));
  const tail = new THREE.Group(); tail.position.set(0, 0.9, -0.8); body.add(tail);
  add(tail, C([0.03, 0.025, 0.7]), fur, [0, 0, -0.35], null, [Math.PI / 2, 0, 0]);
  add(tail, S, mane, [0, 0, -0.72], [0.07, 0.07, 0.1]);
  return {
    group: g, height: 1.4,
    animate(ph) {
      body.position.y = Math.abs(Math.sin(ph)) * 0.08;
      body.rotation.x = Math.sin(ph * 2) * 0.04;
      for (const l of legs) { l.g.rotation.x = Math.sin(ph + l.ph) * 0.7; l.g.userData.knee.rotation.x = Math.max(0, -Math.sin(ph + l.ph)) * 0.9; }
      tail.rotation.x = -0.4 + Math.sin(ph * 1.3) * 0.25; tail.rotation.y = Math.sin(ph * 0.7) * 0.4;
      jaw.position.y = -0.15 - Math.max(0, Math.sin(ph * 0.5)) * 0.05;
    }
  };
}

function horse(parent, x) {
  const g = new THREE.Group(); g.position.set(x, 0, 0); parent.add(g);
  const coat = std("#6b4220"), darkc = std("#4a2c14"), red = std("#c4302a"), black = std("#140c08");
  const body = new THREE.Group(); g.add(body);
  add(body, S, coat, [0, 1.15, 0], [0.26, 0.32, 0.72]);
  const neck = new THREE.Group(); neck.position.set(0, 1.3, 0.55); neck.rotation.x = -0.75; body.add(neck);
  add(neck, C([0.13, 0.18, 0.6]), coat, [0, 0.28, 0]);
  add(neck, B, black, [0, 0.3, -0.12], [0.05, 0.55, 0.08]);
  const head = new THREE.Group(); head.position.set(0, 0.58, 0.02); head.rotation.x = 1.5; neck.add(head);
  add(head, B, coat, [0, 0.18, 0], [0.16, 0.42, 0.2]);
  add(head, S, black, [0, 0.39, 0.0], [0.08, 0.05, 0.1]);
  for (const s of [-1, 1]) add(head, S, black, [s * 0.08, 0.1, 0.05], 0.022);
  add(head, S, red, [0, 0.0, -0.18], [0.05, 0.12, 0.05]);
  const legs = [[-0.13, 0.95, 0.42, 0], [0.13, 0.95, 0.42, 1.2], [-0.13, 0.95, -0.45, Math.PI], [0.13, 0.95, -0.45, Math.PI + 1.2]].map(([lx, y, z, ph]) => ({ g: leg(body, [lx, y, z], 0.95, 0.07, z > 0 ? coat : darkc, black), ph }));
  const tail = add(body, C([0.05, 0.02, 0.6]), black, [0, 1.15, -0.85], null, [-0.9, 0, 0]);
  add(body, B, std("#3a5f8a"), [0, 1.42, 0.05], [0.5, 0.05, 0.5]);
  return { g, body, legs, tail };
}

export function buildChariot() {
  const g = new THREE.Group(), red = std("#9e2b25"), gold = std("#d4a23a", { metal: 0.9, rough: 0.3 }), wood = std("#5a3a1e");
  const horses = [horse(g, -0.4), horse(g, 0.4)];
  horses.forEach(h => h.g.position.z = 1.35);
  const cart = new THREE.Group(); g.add(cart);
  add(cart, B, wood, [0, 0.6, -0.3], [1.1, 0.08, 0.8]);
  add(cart, new THREE.CylinderGeometry(0.55, 0.55, 0.7, 16, 1, true, -1.2, 2.4), red, [0, 0.95, -0.4], [1, 1, 0.9]).material.side = THREE.DoubleSide;
  add(cart, new THREE.TorusGeometry(0.55, 0.025, 6, 20, 2.4), gold, [0, 1.3, -0.4], [1, 0.9, 1], [Math.PI / 2, 0, -Math.PI / 2 + 1.2 - 1.2]);
  add(cart, C([0.03, 0.03, 1.6]), wood, [0, 0.75, 0.6], null, [Math.PI / 2 - 0.1, 0, 0]);
  add(cart, B, wood, [0, 1.25, 1.35], [1.0, 0.06, 0.08]);
  const wheels = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.62, 0.48, -0.35); cart.add(w);
    add(w, new THREE.TorusGeometry(0.46, 0.04, 8, 24), wood, null, null, [0, Math.PI / 2, 0]);
    for (let k = 0; k < 8; k++) add(w, C([0.015, 0.015, 0.9]), std("#c9a46a"), null, null, [k / 8 * Math.PI, 0, 0]);
    add(w, C([0.07, 0.07, 0.12]), gold, null, null, [0, 0, Math.PI / 2]);
    wheels.push(w);
  }
  const driver = new THREE.Group(); driver.position.set(0, 0.65, -0.35); cart.add(driver);
  add(driver, C([0.2, 0.17, 0.75]), std("#3a5f8a"), [0, 0.6, 0]);
  add(driver, S, std("#d9a07a"), [0, 1.13, 0.02], 0.13);
  add(driver, new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2), std("#b7bec5", { metal: 0.9, rough: 0.3 }), [0, 1.15, 0], 0.145);
  for (const s of [-1, 1]) add(driver, C([0.05, 0.04, 0.55]), std("#d9a07a"), [s * 0.2, 0.75, 0.25], null, [-1.2, 0, 0]);
  return {
    group: g, height: 1.9,
    animate(ph, dist) {
      for (const w of wheels) w.rotation.x = dist / 0.46;
      cart.position.y = Math.abs(Math.sin(ph * 2.1)) * 0.03;
      horses.forEach((h, i) => {
        h.body.position.y = Math.abs(Math.sin(ph + i)) * 0.1;
        h.body.rotation.x = Math.sin(ph * 2 + i) * 0.05;
        for (const l of h.legs) { l.g.rotation.x = Math.sin(ph * 1.2 + l.ph + i) * 0.8; l.g.userData.knee.rotation.x = Math.max(0, -Math.sin(ph * 1.2 + l.ph + i)) * 1.1; }
        h.tail.rotation.x = -0.9 + Math.sin(ph * 2 + i) * 0.2;
      });
      driver.rotation.z = Math.sin(ph * 1.7) * 0.05;
    }
  };
}

export function disposeCreature(c) {
  c.group.removeFromParent();
  c.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
}
