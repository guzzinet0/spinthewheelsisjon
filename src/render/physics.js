import * as CANNON from "cannon-es";
import * as THREE from "three";
import { ARENA_R } from "../game/sim.js";

/* 3D rigid-body physics for everything that happens after a fighter falls: ragdolls, dropped weapons and shields.
   It is only for looks. It never feeds back into the rules, so it cannot favour anyone. */
const GROUND = 1, WALL = 2, RAG = 4, GEAR = 8, LIVE = 16;
export const WALL_R = ARENA_R + 0.9;

const SEGS = [
  // key, getter, half extents, centre offset, mass
  ["pelvis", v => v.pelvis, [0.17, 0.11, 0.12], [0, -0.03, 0], 12],
  ["torso", v => v.torso, [0.21, 0.3, 0.14], [0, 0.32, 0], 30],
  ["uaR", v => v.arms.R.upper, [0.065, 0.15, 0.065], [0, -0.14, 0], 3],
  ["faR", v => v.arms.R.lower, [0.055, 0.17, 0.055], [0, -0.17, 0], 2.5],
  ["uaL", v => v.arms.L.upper, [0.065, 0.15, 0.065], [0, -0.14, 0], 3],
  ["faL", v => v.arms.L.lower, [0.055, 0.17, 0.055], [0, -0.17, 0], 2.5],
  ["thR", v => v.legs.R.upper, [0.085, 0.23, 0.085], [0, -0.23, 0], 8],
  ["shR", v => v.legs.R.lower, [0.065, 0.27, 0.08], [0, -0.25, 0.03], 5],
  ["thL", v => v.legs.L.upper, [0.085, 0.23, 0.085], [0, -0.23, 0], 8],
  ["shL", v => v.legs.L.lower, [0.065, 0.27, 0.08], [0, -0.25, 0.03], 5]
];
const JOINTS = [["torso", "pelvis"], ["uaR", "torso"], ["faR", "uaR"], ["uaL", "torso"], ["faL", "uaL"], ["thR", "pelvis"], ["shR", "thR"], ["thL", "pelvis"], ["shL", "thL"]];

const wp = new THREE.Vector3(), wq = new THREE.Quaternion();

export class Physics {
  constructor(scene) {
    this.scene = scene;
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = true;
    w.solver.iterations = 12;
    w.defaultContactMaterial.friction = 0.7;
    w.defaultContactMaterial.restitution = 0.15;

    const ground = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUND, collisionFilterMask: RAG | GEAR });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(ground);

    const n = 40, wall = new CANNON.Body({ mass: 0, collisionFilterGroup: WALL, collisionFilterMask: RAG | GEAR });
    const half = new CANNON.Vec3(Math.PI * WALL_R / n + 0.05, 1, 0.25);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, q = new CANNON.Quaternion(); q.setFromEuler(0, a, 0);
      wall.addShape(new CANNON.Box(half), new CANNON.Vec3(Math.sin(a) * (WALL_R + 0.25), 1, Math.cos(a) * (WALL_R + 0.25)), q);
    }
    w.addBody(wall);

    this.items = [];          // { body, obj }
    this.constraints = [];
    this.live = new Map();    // fighter id -> kinematic body so falling gear bounces off the living
  }

  syncLive(list) {
    const seen = new Set();
    for (const { id, x, z, vx, vz } of list) {
      seen.add(id);
      let b = this.live.get(id);
      if (!b) {
        b = new CANNON.Body({ type: CANNON.Body.KINEMATIC, collisionFilterGroup: LIVE, collisionFilterMask: GEAR });
        b.addShape(new CANNON.Cylinder(0.36, 0.36, 1.3, 10), new CANNON.Vec3(0, 1.15, 0));
        this.world.addBody(b); this.live.set(id, b);
      }
      b.position.set(x, 0, z); b.velocity.set(vx, 0, vz);
    }
    for (const [id, b] of this.live) if (!seen.has(id)) { this.world.removeBody(b); this.live.delete(id); }
  }

  /** Turns a posed fighter into a ragdoll. vel: the fighter's velocity, kick: the push that killed them. */
  ragdoll(view, vel, kick) {
    view.root.updateMatrixWorld(true);
    const bodies = {};
    for (const [key, get, he, off, mass] of SEGS) {
      const obj = get(view);
      obj.getWorldPosition(wp); obj.getWorldQuaternion(wq);
      const b = new CANNON.Body({ mass, linearDamping: 0.05, angularDamping: 0.45, collisionFilterGroup: RAG, collisionFilterMask: GROUND | WALL | GEAR });
      b.addShape(new CANNON.Box(new CANNON.Vec3(...he)), new CANNON.Vec3(...off));
      if (key === "torso") b.addShape(new CANNON.Sphere(0.14), new CANNON.Vec3(0, 0.74, 0));
      b.position.set(wp.x, wp.y, wp.z); b.quaternion.set(wq.x, wq.y, wq.z, wq.w);
      b.velocity.set(vel.x + kick.x, vel.y + kick.y, vel.z + kick.z);
      b.sleepSpeedLimit = 0.15; b.sleepTimeLimit = 0.8;
      bodies[key] = { b, obj };
    }
    const t = bodies.torso.b;
    t.velocity.set(vel.x + kick.x * 1.4, kick.y * 0.6, vel.z + kick.z * 1.4);
    t.angularVelocity.set(kick.z * 2.2 + (Math.random() - 0.5), (Math.random() - 0.5) * 2, -kick.x * 2.2 + (Math.random() - 0.5));
    for (const [c, p] of JOINTS) {
      const cb = bodies[c].b, pb = bodies[p].b;
      const pivot = pb.pointToLocalFrame(cb.position);
      const con = new CANNON.PointToPointConstraint(cb, new CANNON.Vec3(0, 0, 0), pb, pivot, 1e4);
      this.world.addConstraint(con); this.constraints.push(con);
    }
    for (let i = SEGS.length - 1; i >= 0; i--) {
      const { b, obj } = bodies[SEGS[i][0]];
      this.scene.attach(obj);
      this.world.addBody(b);
      this.items.push({ body: b, obj });
    }
  }

  /** Lets go of a weapon or shield so it clatters to the sand on its own. */
  drop(obj, vel, spin = 4) {
    if (!obj || !obj.parent) return;
    obj.updateWorldMatrix(true, true);
    const box = localBox(obj), size = new THREE.Vector3(), centre = new THREE.Vector3();
    box.getSize(size); box.getCenter(centre);
    obj.getWorldPosition(wp); obj.getWorldQuaternion(wq);
    const mass = Math.max(0.6, size.x * size.y * size.z * 400);
    const b = new CANNON.Body({ mass: Math.min(mass, 6), linearDamping: 0.05, angularDamping: 0.2, collisionFilterGroup: GEAR, collisionFilterMask: GROUND | WALL | RAG | LIVE | GEAR });
    b.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(0.015, size.x / 2), Math.max(0.015, size.y / 2), Math.max(0.015, size.z / 2))), new CANNON.Vec3(centre.x, centre.y, centre.z));
    b.position.set(wp.x, wp.y, wp.z); b.quaternion.set(wq.x, wq.y, wq.z, wq.w);
    b.velocity.set(vel.x, vel.y, vel.z);
    b.angularVelocity.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    b.sleepSpeedLimit = 0.1; b.sleepTimeLimit = 0.6;
    this.scene.attach(obj);
    this.world.addBody(b);
    this.items.push({ body: b, obj });
  }

  /** A loose sphere (the flail ball). */
  dropBall(obj, r, vel) {
    const b = new CANNON.Body({ mass: 2, collisionFilterGroup: GEAR, collisionFilterMask: GROUND | WALL | RAG | LIVE | GEAR, linearDamping: 0.05 });
    b.addShape(new CANNON.Sphere(r));
    b.position.set(obj.position.x, obj.position.y, obj.position.z);
    b.velocity.set(vel.x, vel.y, vel.z);
    this.world.addBody(b);
    this.items.push({ body: b, obj });
  }

  step(dt) {
    if (dt <= 0) return;
    this.world.step(1 / 90, Math.min(dt, 0.1), 8);
    for (const { body, obj } of this.items) {
      obj.position.set(body.position.x, body.position.y, body.position.z);
      obj.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    }
  }

  clear() {
    for (const c of this.constraints) this.world.removeConstraint(c);
    for (const { body, obj } of this.items) { this.world.removeBody(body); obj.removeFromParent(); }
    this.items = []; this.constraints = [];
  }
}

const rel = new THREE.Matrix4(), inv = new THREE.Matrix4();
function localBox(obj) {
  const box = new THREE.Box3(), b = new THREE.Box3();
  inv.copy(obj.matrixWorld).invert();
  obj.traverse(m => {
    if (!m.isMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    rel.multiplyMatrices(inv, m.matrixWorld);
    box.union(b.copy(m.geometry.boundingBox).applyMatrix4(rel));
  });
  return box;
}
