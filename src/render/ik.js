import * as THREE from "three";

/* Two-bone IK. A chain is { upper, lower, end, L1, L2 } where upper sits at the root joint,
   lower is a child of upper at (0,-L1,0) and end is a child of lower at (0,-L2,0).
   Segments hang along their local -Y. All targets are in the chain's parent space. */
const u = new THREE.Vector3(), n = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Vector3();
const d1 = new THREE.Vector3(), d2 = new THREE.Vector3(), x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
const m = new THREE.Matrix4(), qU = new THREE.Quaternion(), qL = new THREE.Quaternion(), qi = new THREE.Quaternion();
const tgt = new THREE.Vector3();

function segQuat(dir, normal, out) {
  y.copy(dir).negate();
  x.copy(normal).addScaledVector(y, -normal.dot(y)).normalize();
  z.crossVectors(x, y);
  m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(m);
}

/** root: joint position (parent space). target: where the end should be. pole: which way the middle joint bends. endQuat: optional end orientation (parent space). */
export function solve(chain, root, target, pole, endQuat) {
  const { L1, L2 } = chain;
  tgt.copy(target);
  u.subVectors(tgt, root);
  let d = u.length();
  const max = L1 + L2 - 1e-3, min = Math.abs(L1 - L2) + 1e-3;
  if (d < 1e-5) { u.set(0, -1, 0); d = 1e-5; }
  u.divideScalar(d);
  d = Math.min(max, Math.max(min, d));
  n.crossVectors(u, pole);
  if (n.lengthSq() < 1e-8) n.set(1, 0, 0).cross(u);
  n.normalize();
  v.crossVectors(n, u).normalize();
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  e.copy(root).addScaledVector(u, Math.cos(a) * L1).addScaledVector(v, Math.sin(a) * L1);
  tgt.copy(root).addScaledVector(u, d);
  d1.subVectors(e, root).normalize();
  d2.subVectors(tgt, e).normalize();
  segQuat(d1, n, qU);
  segQuat(d2, n, qL);
  chain.upper.quaternion.copy(qU);
  chain.lower.quaternion.copy(qi.copy(qU).invert().multiply(qL));
  if (endQuat) chain.end.quaternion.copy(qi.copy(qL).invert().multiply(endQuat));
}

const bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3(), bm = new THREE.Matrix4();
/** Orientation whose +Y points along `up` and +Z as close to `front` as possible. */
export function orient(up, front, out = new THREE.Quaternion()) {
  by.copy(up).normalize();
  bz.copy(front).addScaledVector(by, -front.dot(by));
  if (bz.lengthSq() < 1e-6) bz.set(0, 0, 1).addScaledVector(by, -by.z);
  bz.normalize();
  bx.crossVectors(by, bz);
  bm.makeBasis(bx, by, bz);
  return out.setFromRotationMatrix(bm);
}
