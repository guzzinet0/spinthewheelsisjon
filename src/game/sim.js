/* The rules and the gameplay physics. Pure JavaScript: no DOM, no Three.js, no looks.
   The live match and the fairness test (worker + Node) run this exact file, tick for tick. */

export const DT = 1 / 30;            // fixed tick, same everywhere
export const ARENA_R = 7;            // playable radius in metres
export const BODY_R = 0.4;           // every fighter is the same circle...
export const MASS = 90;              // ...with the same mass, whatever armour they wear
export const HP_DEFAULT = 120;
export const FIRE_MIN = 0.34;
export const ATTACKS = 5;            // attack animations; all land at the same moment with the same effect
export const HIT_AT = 0.55;
/* Identical for every fighter: looks never change the odds. */
export const STATS = Object.freeze({ dmg: 14, speed: 1.6, reach: 1.35, swing: 0.46, dodge: 0.1, parry: 0.12, crit: 0.12 });

const TAU = Math.PI * 2, FACE_CONE = 0.9, EV_DMG = 16, RESTITUTION = 0.2, WALL_BOUNCE = 0.3;

const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export class Sim {
  constructor({ hp = HP_DEFAULT, rng = Math.random, emit = null } = {}) {
    this.hp = hp;
    this.rng = rng;
    this.emit = emit || (() => {});
    this.fighters = [];
    this.phase = "setup";
    this.reset();
  }

  rnd(a, b) { return a + this.rng() * (b - a); }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (this.rng() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  alive() { return this.fighters.filter(f => !f.dead); }
  fireStart() { return 40 * this.hp / HP_DEFAULT; }
  fireDur() { return 40 * this.hp / HP_DEFAULT; }

  reset() {
    this.time = 0; this.scale = 1; this.ev = null; this.finalMode = false; this.winner = null;
    this.fireWarned = false; this.fireStarted = false; this.nextEvent = this.rnd(8, 14);
  }

  newFighter(id) {
    return { id, x: this.rnd(-0.6, 0.6), z: -ARENA_R + 0.4, px: 0, pz: 0, face: 0, pface: 0, homeX: 0, homeZ: 0 };
  }
  resetFighter(f) {
    Object.assign(f, {
      vx: 0, vz: 0, mx: 0, mz: 0, hp: this.hp, swing: -1, hitDone: false, atk: 0, cd: this.rnd(0.5, 1.3),
      target: null, retarget: 0, lat: 0, dead: false, kills: 0, rage: false, burn: 0
    });
    f.px = f.x; f.pz = f.z; f.pface = f.face;
  }

  /** The lottery: shuffles who stands where, and the order everyone is processed in. */
  layout(ids) {
    const order = this.shuffle(ids.slice()), n = order.length, rot = this.rng() * TAU;
    const old = new Map(this.fighters.map(f => [f.id, f]));
    this.fighters = order.map((id, i) => {
      const f = old.get(id) || this.newFighter(id);
      this.resetFighter(f);
      const a = rot + (i / n) * TAU, r = ARENA_R * (n > 6 ? 0.74 : 0.6);
      f.homeX = Math.sin(a) * r; f.homeZ = Math.cos(a) * r;
      return f;
    });
    this.phase = "setup"; this.reset();
  }

  /** Everyone at their drawn spot, facing the middle. */
  start() {
    this.reset();
    for (const f of this.fighters) {
      this.resetFighter(f);
      f.x = f.homeX; f.z = f.homeZ; f.face = Math.atan2(-f.x, -f.z);
      f.px = f.x; f.pz = f.z; f.pface = f.face;
    }
    this.finalMode = this.fighters.length === 2;
    this.phase = "fight";
  }

  step(dt = DT) {
    for (const f of this.fighters) { f.px = f.x; f.pz = f.z; f.pface = f.face; }
    if (this.phase === "setup") { for (const f of this.fighters) this.walkHome(f, dt); return; }
    if (this.phase !== "fight") { for (const f of this.fighters) if (!f.dead) this.coast(f, dt); return; }

    this.time += dt;
    const fs = this.fireStart();
    if (!this.fireWarned && this.time >= fs - 3) { this.fireWarned = true; this.emit("fireWarn"); }
    if (!this.fireStarted && this.time >= fs) { this.fireStarted = true; this.emit("fireStart"); }
    this.scale = 1 - (1 - FIRE_MIN) * Math.min(1, Math.max(0, (this.time - fs) / this.fireDur()));

    this.updateEvent(dt);
    if (this.phase !== "fight") return;
    for (const f of this.shuffle(this.fighters.slice())) { this.updateFighter(f, dt); if (this.phase !== "fight") return; }
    this.collide();
  }

  walkHome(f, dt) {
    const mx = f.homeX - f.x, mz = f.homeZ - f.z, md = Math.hypot(mx, mz);
    if (md > 0.03) {
      const sp = Math.min(STATS.speed * 2.2, md * 5);
      f.mx = mx / md * sp; f.mz = mz / md * sp; f.face = Math.atan2(mx, mz);
      f.x += f.mx * dt; f.z += f.mz * dt;
    } else {
      f.x = f.homeX; f.z = f.homeZ; f.mx = 0; f.mz = 0; f.face = Math.atan2(-f.x, -f.z);
    }
  }

  coast(f, dt) {
    f.x += (f.vx + f.mx) * dt; f.z += (f.vz + f.mz) * dt;
    const k = Math.pow(0.02, dt); f.vx *= k; f.vz *= k; f.mx *= 0.8; f.mz *= 0.8;
    this.wall(f);
  }

  /* ---------- physics: identical circles, impulses, friction, walls ---------- */
  wall(f) {
    const R = ARENA_R * this.scale, d = Math.hypot(f.x, f.z);
    if (d <= R) return;
    const nx = f.x / d, nz = f.z / d;
    f.x = nx * R; f.z = nz * R;
    const vn = f.vx * nx + f.vz * nz; if (vn > 0) { f.vx -= (1 + WALL_BOUNCE) * vn * nx; f.vz -= (1 + WALL_BOUNCE) * vn * nz; }
    const mn = f.mx * nx + f.mz * nz; if (mn > 0) { f.mx -= mn * nx; f.mz -= mn * nz; }
  }
  collide() {
    const a = this.shuffle(this.alive()), min = BODY_R * 2;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      const p = a[i], q = a[j], dx = q.x - p.x, dz = q.z - p.z, d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d, push = (min - d) / 2;
      p.x -= nx * push; p.z -= nz * push; q.x += nx * push; q.z += nz * push;
      const rel = (q.vx - p.vx) * nx + (q.vz - p.vz) * nz;
      if (rel < 0) {                                   // equal masses: the impulse splits evenly
        const jn = -(1 + RESTITUTION) * rel / 2;
        p.vx -= jn * nx; p.vz -= jn * nz; q.vx += jn * nx; q.vz += jn * nz;
      }
    }
  }

  /* ---------- combat (identical rules for everyone) ---------- */
  pickTarget(f) {
    const others = this.fighters.filter(o => o !== f && !o.dead);
    if (!others.length) return null;
    if (this.rng() < 0.6) {
      let best = null, bd = 1e9;
      for (const o of others) { const d = Math.hypot(o.x - f.x, o.z - f.z); if (d < bd) { bd = d; best = o; } }
      return best;
    }
    return others[(this.rng() * others.length) | 0];
  }

  updateFighter(f, dt) {
    if (f.dead) return;
    f.x += (f.vx + f.mx) * dt; f.z += (f.vz + f.mz) * dt;
    const damp = Math.pow(0.02, dt); f.vx *= damp; f.vz *= damp;
    this.wall(f);

    if (!f.rage && f.hp < this.hp * 0.25) { f.rage = true; this.emit("rage", { f }); }
    f.cd -= dt; f.retarget -= dt;
    if (!f.target || f.target.dead || f.retarget <= 0) { f.target = this.pickTarget(f); f.retarget = this.rnd(2, 4.5); f.lat = this.rnd(-0.15, 0.15); }
    const t = f.target;
    if (t) {
      const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz) || 1e-3;
      if (f.swing >= 0) {
        f.swing += dt / (STATS.swing * (f.rage ? 0.72 : 1));
        if (!f.hitDone && f.swing >= HIT_AT) { f.hitDone = true; this.resolveHit(f); if (this.phase !== "fight") return; }
        if (f.swing >= 1) { f.swing = -1; f.cd = this.rnd(0.4, 1) * (f.rage ? 0.6 : 1); }
        const k = Math.pow(0.85, dt * 60); f.mx *= k; f.mz *= k;
      } else {
        f.face = Math.atan2(dx, dz);
        const ux = dx / d, uz = dz / d, back = STATS.reach * 0.8;
        const gx = t.x - ux * back - uz * f.lat, gz = t.z - uz * back + ux * f.lat;
        const mx = gx - f.x, mz = gz - f.z, md = Math.hypot(mx, mz);
        let tx = 0, tz = 0;
        if (md > 0.07) { tx = mx / md * STATS.speed; tz = mz / md * STATS.speed; }
        const k = Math.min(1, dt * 6); f.mx += (tx - f.mx) * k; f.mz += (tz - f.mz) * k;
        if (d <= STATS.reach * 1.1 && f.cd <= 0) {
          f.atk = (this.rng() * ATTACKS) | 0; f.swing = 0; f.hitDone = false;
          this.emit("swing", { f });
        }
      }
    }
    this.burnCheck(f, dt);
  }

  resolveHit(f) {
    const t = f.target; if (!t || t.dead) return;
    const dx = t.x - f.x, dz = t.z - f.z, d = Math.hypot(dx, dz) || 1e-3;
    if (d > STATS.reach * 1.35 || Math.abs(angDiff(Math.atan2(dx, dz), f.face)) > FACE_CONE) { this.emit("miss", { f, t }); return; }
    const ux = dx / d, uz = dz / d;
    if (this.rng() < STATS.dodge) {
      const side = this.rng() < 0.5 ? -1 : 1;
      t.vx += -uz * side * 1.6; t.vz += ux * side * 1.6;
      this.emit("dodge", { f, t, side }); return;
    }
    if (this.rng() < STATS.parry) {
      t.vx += ux * 1.3; t.vz += uz * 1.3; f.vx -= ux * 0.6; f.vz -= uz * 0.6;
      this.emit("parry", { f, t }); return;
    }
    const crit = this.rng() < STATS.crit;
    const dmg = Math.round(STATS.dmg * this.rnd(0.75, 1.25) * (crit ? 1.8 : 1));
    const kb = crit ? 4 : 2.4;
    t.hp -= dmg; t.vx += ux * kb; t.vz += uz * kb;
    this.emit("hit", { f, t, dmg, crit, ux, uz });
    if (t.hp <= 0) this.kill(t, f, "blade", ux, uz);
  }

  kill(t, f, cause, ux = 0, uz = 0) {
    if (t.dead) return;
    t.hp = 0; t.dead = true; t.swing = -1; t.rage = false;
    if (f) f.kills++;
    for (const o of this.fighters) if (o.target === t) o.target = null;
    this.emit("kill", { t, f, cause, ux, uz });
    const left = this.alive();
    if (left.length === 1) {
      this.phase = "over"; this.winner = left[0]; left[0].swing = -1; left[0].rage = false;
      this.emit("win", { w: left[0] });
    } else if (left.length === 2 && this.fighters.length > 2 && !this.finalMode) {
      this.finalMode = true;
      if (this.ev) { this.ev = null; this.emit("eventEnd"); }
      this.emit("final");
    }
  }

  burnCheck(f, dt) {
    if (this.scale >= 1 || f.dead) return;
    const R = ARENA_R * this.scale, d = Math.hypot(f.x, f.z) || 1e-3;
    if ((d / R) ** 2 <= 0.88) return;
    f.burn += dt * 9; f.vx -= f.x / d * 4 * dt; f.vz -= f.z / d * 4 * dt;
    if (f.burn >= 3) {
      const dmg = Math.floor(f.burn); f.burn -= dmg; f.hp -= dmg;
      this.emit("burn", { f, dmg });
      if (f.hp <= 0) this.kill(f, null, "fire", -f.x / d, -f.z / d);
    }
  }

  /* ---------- arena events: a random lane at a random angle, so nobody is favoured ---------- */
  spawnEvent() {
    const th = this.rnd(0, TAU), dx = Math.sin(th), dz = Math.cos(th);
    const o = this.rnd(-0.75, 0.75) * ARENA_R * this.scale, L = Math.sqrt(Math.max(0, ARENA_R * ARENA_R - o * o));
    const type = this.rng() < 0.5 ? "lion" : "chariot";
    this.ev = { type, dx, dz, px: dz, pz: -dx, o, s: -L, end: L, warn: 1.4, speed: type === "lion" ? 6.5 : 8, hit: new Set() };
    this.emit("eventSpawn", { ev: this.ev });
  }
  evPos(ev = this.ev) { return { x: ev.px * ev.o + ev.dx * ev.s, z: ev.pz * ev.o + ev.dz * ev.s }; }
  updateEvent(dt) {
    let ev = this.ev;
    if (!ev) { if (this.time > this.nextEvent && this.alive().length > 2 && !this.finalMode) this.spawnEvent(); return; }
    if (ev.warn > 0) { ev.warn -= dt; if (ev.warn <= 0) this.emit("eventGo", { ev }); return; }
    ev.s += ev.speed * dt;
    for (const f of this.fighters) {
      if (f.dead || ev.hit.has(f)) continue;
      const rx = f.x - ev.px * ev.o, rz = f.z - ev.pz * ev.o;
      const along = rx * ev.dx + rz * ev.dz - ev.s, lat = rx * ev.px + rz * ev.pz;
      if (Math.abs(lat) > 0.75 || Math.abs(along) > 0.9) continue;
      ev.hit.add(f);
      const side = lat >= 0 ? 1 : -1;
      f.hp -= EV_DMG; f.vx += ev.dx * 3 + ev.px * side * 4; f.vz += ev.dz * 3 + ev.pz * side * 4;
      this.emit("eventHit", { f, ev, dmg: EV_DMG });
      if (f.hp <= 0) { this.kill(f, null, ev.type, ev.px * side, ev.pz * side); if (this.phase !== "fight" || !this.ev) return; }
    }
    if (ev.s > ev.end) { this.ev = null; this.nextEvent = this.time + this.rnd(10, 17); this.emit("eventEnd"); }
  }
}

/** One invisible fight with the exact same rules as the visible one. Returns the winner's id. */
export function runFight(ids, hp = HP_DEFAULT, rng = Math.random) {
  const sim = new Sim({ hp, rng });
  sim.layout(ids);
  sim.start();
  for (let steps = 0; sim.phase === "fight" && steps < 30000; steps++) sim.step(DT);
  return sim.winner ? sim.winner.id : null;
}
