import "./style.css";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Sim, DT, ARENA_R, STATS, HP_DEFAULT } from "./game/sim.js";
import { ROSTER, CUSTOM, nameOf } from "./game/roster.js";
import { buildFighter, poseFighter, updateFlail, removeFlail, tintFighter, charFighter, disposeFighter } from "./render/fighter.js";
import { Arena, THEMES } from "./render/arena.js";
import { Physics } from "./render/physics.js";
import { Particles, Lightning } from "./render/effects.js";
import { Overlay } from "./render/overlay.js";
import { buildLion, buildChariot, disposeCreature } from "./render/creatures.js";
import { renderPortraits } from "./render/portraits.js";
import { Post } from "./render/post.js";
import { Celebration } from "./render/celebration.js";
import { tex } from "./render/textures.js";
import { SFX } from "./audio/sfx.js";
import { initFairness } from "./ui/fairness.js";

const $ = id => document.getElementById(id);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const lerpAngle = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- renderer ---------- */
const canvas = $("arena"), box = $("box");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
} catch (e) {
  $("loading").textContent = "Din webbläsare kan inte visa 3D-grafik (WebGL saknas).";
  throw e;
}
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 220);

const arena = new Arena(scene, renderer);
const physics = new Physics(scene);
const dust = new Particles(scene, { max: 3000 });
const glow = new Particles(scene, { max: 2500, additive: true });
const flames = new Particles(scene, { max: 3500, additive: true, map: tex.flame() });
const lightning = new Lightning(scene);
const overlay = new Overlay($("tags"));
const post = new Post(renderer, scene, camera);
const party = new Celebration(scene);
const spot = new THREE.SpotLight("#fff2c8", 0, 40, 0.42, 0.6, 1.2); spot.position.set(0, 16, 0); scene.add(spot, spot.target);
const strikeLight = new THREE.PointLight("#bcd2ff", 0, 30, 1.5); scene.add(strikeLight);

/* ---------- state ---------- */
const selected = new Set();
let phase = "setup";              // setup | countdown | fight | over | abort
let speed = 1, acc = 0, T = 0, slowmo = 0, hitstop = 0, shake = 0, cdTimer = 0, cdShown = -1, overT = 0, finalK = 0, flashA = 0;
let creature = null, abortQ = [], abortT = 0, abortEnd = 0, fairBusy = false, portraits = new Map();
const views = new Map();          // fighter id -> { view, st, dead }
const sim = new Sim({ emit: onEvent });
try { const h = +localStorage.getItem("arena-hp"); if (h >= 40 && h <= 400) sim.hp = h; } catch (e) { /* ignore */ }
try { const saved = localStorage.getItem("arena-custom-name"); if (saved) CUSTOM.name = saved; } catch (e) { /* ignore */ }

const locked = () => phase === "countdown" || phase === "fight" || phase === "abort" || fairBusy;

/* ---------- fighter views ---------- */
function newView(id) {
  const view = buildFighter(ROSTER[id]);
  scene.add(view.root);
  return { view, dead: false, st: { t: rnd(0, 10), walk: 0, mv: 0, swing: -1, atk: 0, flexT: 0, flexCd: rnd(1, 6), hurt: 0, dodgeT: 0, dodgeSide: 1, parryT: 0, celebrate: false, victory: 0, speedSway: 0 } };
}
function dropView(id) {
  const V = views.get(id); if (!V) return;
  V.view.root.removeFromParent(); removeFlail(V.view); disposeFighter(V.view);
  overlay.removeLabel(id); views.delete(id);
}
/** Make the 3D figures match the fighters in the sim (rebuilding anyone who fell last match). */
function syncViews() {
  const ids = new Set(sim.fighters.map(f => f.id));
  for (const id of [...views.keys()]) if (!ids.has(id) || views.get(id).dead) dropView(id);
  for (const f of sim.fighters) if (!views.has(f.id)) views.set(f.id, newView(f.id));
}

/* ---------- camera ---------- */
const cam = { az: 0.35, el: 0.6, dist: 17, target: new THREE.Vector3(0, 1, 0), tTarget: new THREE.Vector3(0, 1, 0), tDist: 17, zoom: 1, userT: 0 };
function fitPoints(pts, minD = 5.5) {
  if (!pts.length) { cam.tTarget.set(0, 1, 0); cam.tDist = 17; return; }
  let x1 = 1e9, x2 = -1e9, z1 = 1e9, z2 = -1e9;
  for (const p of pts) { x1 = Math.min(x1, p.x); x2 = Math.max(x2, p.x); z1 = Math.min(z1, p.z); z2 = Math.max(z2, p.z); }
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
  r += 1.7;
  const vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  cam.tTarget.set(cx, 0.95, cz);
  cam.tDist = clamp(r / Math.sin(Math.min(vf, hf) / 2) * 0.82, minD, 21);
}
function updateCamera(dt) {
  const alive = sim.fighters.filter(f => !f.dead), pts = alive.map(f => ({ x: f.x, z: f.z }));
  if (phase === "fight" && creature && sim.ev && sim.ev.warn <= 0) { const p = sim.evPos(); if (Math.hypot(p.x, p.z) < ARENA_R) pts.push(p); }
  if (phase === "over" && sim.winner) {
    const w = sim.winner;
    if (overT > 2.2) { cam.tTarget.set(w.x, 1.1, w.z); cam.tDist = 5.2; } else fitPoints([{ x: w.x, z: w.z }], 4.5);
  } else if (phase === "abort") { cam.tTarget.set(0, 1, 0); cam.tDist = 16; }
  else if (phase === "fight") fitPoints(pts);
  else fitPoints(pts, 11);
  cam.userT = Math.max(0, cam.userT - dt);
  if (phase === "setup" && cam.userT <= 0 && !reduced) cam.az += dt * 0.04;
  if (phase === "over" && overT > 2.2 && cam.userT <= 0 && !reduced) cam.az += dt * 0.12;
  const k = 1 - Math.exp(-dt * (phase === "fight" ? 1.6 : 2.2));
  cam.target.lerp(cam.tTarget, k); cam.dist = lerp(cam.dist, cam.tDist, k);
  const d = cam.dist * cam.zoom;
  camera.position.set(cam.target.x + Math.sin(cam.az) * Math.cos(cam.el) * d, cam.target.y + Math.sin(cam.el) * d, cam.target.z + Math.cos(cam.az) * Math.cos(cam.el) * d);
  camera.lookAt(cam.target);
  if (shake > 0 && !reduced) { camera.position.x += rnd(-shake, shake); camera.position.y += rnd(-shake, shake) * 0.6; }
}
{
  let drag = null;
  canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); canvas.classList.add("drag"); });
  canvas.addEventListener("pointermove", e => {
    if (!drag || drag.id !== e.pointerId) return;
    cam.az -= (e.clientX - drag.x) * 0.008; cam.el = clamp(cam.el + (e.clientY - drag.y) * 0.005, 0.18, 1.25);
    drag.x = e.clientX; drag.y = e.clientY; cam.userT = 5;
  });
  const end = () => { drag = null; canvas.classList.remove("drag"); };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", e => { e.preventDefault(); cam.zoom = clamp(cam.zoom * Math.exp(e.deltaY * 0.001), 0.55, 1.7); cam.userT = 5; }, { passive: false });
}
const pv = new THREE.Vector3();
const panOf = (x, z) => { pv.set(x, 1, z).project(camera); return clamp(pv.x, -1, 1) * 0.7; };

/* ---------- events from the rules ---------- */
const chest = (f, y = 1.35) => new THREE.Vector3(f.x, y, f.z);
function onEvent(type, d) {
  switch (type) {
    case "swing": if (Math.random() < 0.6) SFX.play("swing", { pan: panOf(d.f.x, d.f.z), vol: 0.7 }); break;
    case "dodge": {
      const V = views.get(d.t.id); V.st.dodgeT = 0.35; V.st.dodgeSide = d.side;
      overlay.float(chest(d.t, 2.0), "Undviker!", "miss");
      SFX.play("dodge", { pan: panOf(d.t.x, d.t.z) });
      break;
    }
    case "parry": {
      views.get(d.t.id).st.parryT = 0.3;
      const p = chest(d.t, 1.45).lerp(chest(d.f, 1.45), 0.4);
      glow.burst(p.x, p.y, p.z, 14, { color: "#ffe6a0", speed: 4, grav: 6, life: 0.35, size: 0.07 });
      overlay.float(chest(d.t, 2.0), "Pareras!", "parry");
      SFX.play("clang", { pan: panOf(d.t.x, d.t.z) }); shake = Math.max(shake, 0.05);
      break;
    }
    case "hit": {
      const V = views.get(d.t.id); V.view.flashT = 0.18; V.st.hurt = 0.3; V.st.flexT = 0;
      const p = chest(d.t);
      dust.burst(p.x, p.y, p.z, d.crit ? 28 : 14, { color: "#7e1414", speed: d.crit ? 3.4 : 2.4, grav: 9.8, life: 0.9, size: 0.07, dirX: d.ux * 1.6, dirZ: d.uz * 1.6, bounce: 0.05 });
      glow.burst(p.x, p.y, p.z, 6, { color: "#fff0c0", speed: 3.5, grav: 6, life: 0.25, size: 0.06 });
      overlay.float(chest(d.t, 2.05), d.crit ? `KRITISK! ${d.dmg}` : String(d.dmg), d.crit ? "crit" : "");
      shake = Math.max(shake, d.crit ? 0.22 : 0.08); hitstop = d.crit ? 0.09 : 0.04;
      if (d.crit) post.flash(0.5);
      SFX.play(d.crit ? "hit_crit" : "hit", { pan: panOf(d.t.x, d.t.z) });
      if (d.crit) SFX.play("gasp", { vol: 0.35 });
      break;
    }
    case "kill": fallDown(d); break;
    case "win": {
      phase = "over"; overT = 0;
      const V = views.get(d.w.id); V.st.celebrate = true; V.st.victory = (Math.random() * 3) | 0;
      arena.cheer(d.w.x, d.w.z, 1, 7);
      party.start(arena.theme.cloth, () => arena.seatPos(), new THREE.Vector3(d.w.x, 0, d.w.z));
      log(`<span class="skull" style="color:var(--gold)">★</span> <span><b>${esc(nameOf(ROSTER[d.w.id]))}</b> vinner arenan</span>`);
      $("status").textContent = nameOf(ROSTER[d.w.id]) + " vann!";
      $("abort").hidden = true;
      break;
    }
    case "rage": overlay.float(chest(d.f, 2.1), "RASERI!", "rage"); SFX.play("growl", { pan: panOf(d.f.x, d.f.z), vol: 0.8 }); break;
    case "final": showCd("Final!"); SFX.play("horn"); break;
    case "eventSpawn": {
      const ev = d.ev, p = sim.evPos(ev);
      creature = ev.type === "lion" ? buildLion() : buildChariot();
      creature.group.visible = false; creature.dist = 0; creature.ph = 0;
      creature.group.position.set(p.x, 0, p.z); creature.group.rotation.y = Math.atan2(ev.dx, ev.dz);
      scene.add(creature.group);
      overlay.float(new THREE.Vector3(p.x + ev.dx * 1.5, 1.4, p.z + ev.dz * 1.5), ev.type === "lion" ? "LEJON!" : "VAGN!", "ev", 1.4);
      SFX.play(ev.type === "lion" ? "roar" : "rumble", { pan: panOf(p.x, p.z), vol: 0.8 });
      break;
    }
    case "eventGo": {
      if (!creature) break;
      creature.group.visible = true;
      const p = sim.evPos(d.ev);
      dust.burst(p.x, 0.3, p.z, 30, { color: "#cfae78", speed: 2.5, grav: 3, life: 1.2, size: 0.3, grow: 0.4, drag: 1.5 });
      if (d.ev.type === "lion") SFX.play("roar", { pan: panOf(p.x, p.z) });
      else SFX.play("rumble", { pan: panOf(p.x, p.z) });
      break;
    }
    case "eventHit": {
      const V = views.get(d.f.id); V.view.flashT = 0.25; V.st.hurt = 0.3;
      dust.burst(d.f.x, 0.6, d.f.z, 18, { color: "#cfae78", speed: 3, grav: 6, life: 0.8, size: 0.18, grow: 0.3 });
      overlay.float(chest(d.f, 2.05), String(d.dmg), "ev");
      shake = Math.max(shake, 0.2); SFX.play("hit_crit", { pan: panOf(d.f.x, d.f.z) });
      break;
    }
    case "eventEnd":
      if (creature) {
        const p = creature.group.position;
        if (creature.group.visible) dust.burst(p.x, 0.3, p.z, 24, { color: "#cfae78", speed: 2, grav: 3, life: 1, size: 0.3, grow: 0.4, drag: 1.5 });
        disposeCreature(creature); creature = null;
      }
      break;
    case "burn": {
      views.get(d.f.id).view.flashT = 0.1;
      overlay.float(chest(d.f, 1.9), String(d.dmg), "fire", 0.8);
      flames.burst(d.f.x, 0.3, d.f.z, 6, { color: "#ff8a2a", speed: 1, lift: 1.2, life: 0.5, size: 0.35 });
      break;
    }
    case "fireStart": showCd("Elden kryper in!", true); SFX.play("fire"); break;
  }
}

function fallDown({ t, f, cause, ux, uz }) {
  const V = views.get(t.id); if (!V || V.dead) return;
  V.dead = true;
  const vel = new THREE.Vector3(t.vx * 0.5 + t.mx, 0, t.vz * 0.5 + t.mz);
  const k = cause === "blade" ? 2.2 : cause === "fire" ? 1.2 : 3.2;
  const kick = new THREE.Vector3(ux * k, cause === "blade" ? 1.2 : 2.4, uz * k);
  if (cause === "fire") charFighter(V.view);
  ragdollView(V, vel, kick);
  const tn = `<b>${esc(nameOf(ROSTER[t.id]))}</b>`;
  const msg = cause === "fire" ? `${tn} föll i elden` : cause === "lion" ? `${tn} togs av lejonet` : cause === "chariot" ? `${tn} kördes över av vagnen` : `<b>${esc(nameOf(ROSTER[f.id]))}</b> besegrade ${tn}`;
  log(`<span class="skull">✝</span> <span>${msg}</span>`);
  if (f) { const K = views.get(f.id); if (K) K.st.flexT = 1.1; }
  const left = sim.fighters.filter(o => !o.dead).length;
  slowmo = left <= 1 ? 1.6 : 0.45; shake = Math.max(shake, 0.25); hitstop = 0.12;
  SFX.play("fall", { pan: panOf(t.x, t.z) }); SFX.play("cheer", { vol: left <= 1 ? 0.9 : 0.55, delay: 0.15 });
  arena.excite = Math.min(1, arena.excite + 0.5);
  if (left > 1) arena.cheer(t.x, t.z, 0.75, 2.4);
}
function ragdollView(V, vel, kick) {
  const v = V.view;
  if (v.emis !== -2) for (const m of v.mats) m.emissive.setRGB(0, 0, 0);
  if (v.flail && v.flail.pos) { const ball = v.flail.ball; v.flail.chain.removeFromParent(); physics.dropBall(ball, 0.075, vel.clone().add(kick)); v.flail.pos = null; v.flail = null; }
  physics.drop(v.weapon, vel.clone().add(kick).add(new THREE.Vector3(rnd(-1, 1), 2, rnd(-1, 1))), 8);
  if (v.off) physics.drop(v.off, vel.clone().add(kick.clone().multiplyScalar(0.6)).add(new THREE.Vector3(rnd(-1, 1), 1.5, rnd(-1, 1))), 5);
  physics.ragdoll(v, vel, kick);
  v.root.removeFromParent();
  const p = v.pelvis.position;
  dust.burst(p.x, 0.15, p.z, 20, { color: "#c9a874", speed: 2, grav: 2, life: 1.4, size: 0.35, grow: 0.5, drag: 2, delay: 0.3 });
}

/* ---------- lightning ends an aborted match ---------- */
function strike(f) {
  const V = views.get(f.id); if (!V || V.dead) return;
  f.dead = true; f.hp = 0;
  const top = new THREE.Vector3(f.x, 1.6, f.z);
  lightning.strike(top);
  strikeLight.position.set(f.x, 3, f.z); strikeLight.intensity = 260; flashA = 1;
  charFighter(V.view); V.dead = true;
  ragdollView(V, new THREE.Vector3(), new THREE.Vector3(rnd(-1.5, 1.5), 2.5, rnd(-1.5, 1.5)));
  glow.burst(f.x, 1.4, f.z, 30, { color: "#dfe9ff", speed: 5, grav: 4, life: 0.4, size: 0.08 });
  for (let i = 0; i < 10; i++) dust.spawn({ x: f.x + rnd(-0.3, 0.3), y: rnd(0.4, 1.6), z: f.z + rnd(-0.3, 0.3), vy: rnd(0.4, 0.9), life: rnd(1.4, 2.4), size: 0.4, grow: 0.6, color: "#46464b", drag: 0.5 });
  overlay.removeLabel(f.id);
  shake = 0.3; post.flash(1); SFX.play("thunder", { pan: panOf(f.x, f.z) });
}
function abortFight() {
  if (phase !== "countdown" && phase !== "fight") return;
  phase = "abort"; sim.phase = "abort";
  $("cdWrap").hidden = true;
  if (creature) { disposeCreature(creature); creature = null; } sim.ev = null;
  slowmo = 0; hitstop = 0;
  abortQ = shuffle(sim.fighters.filter(f => !f.dead)); abortT = 0.35; abortEnd = 0;
  log(`<span class="skull" style="color:#9fb8ff">ϟ</span> <span>Matchen avbröts av gudarna</span>`);
  $("status").textContent = "Matchen avbryts…"; startBtn.textContent = "Avbryter…";
  refreshUi();
}
function updateAbort(real) {
  abortT -= real;
  if (abortQ.length) { if (abortT <= 0) { strike(abortQ.shift()); abortT = abortQ.length > 6 ? 0.14 : 0.24; } return; }
  abortEnd += real;
  if (abortEnd > 0.5 && abortEnd - real <= 0.5) showCd("Matchen avbröts", true);
  if (abortEnd > 2.4) toSetup();
}

/* ---------- loop ---------- */
let last = performance.now(), cardTick = 0, lastW = 0, lastH = 0;
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000); last = now; T += real;
  let scale = phase === "fight" || phase === "over" ? speed : 1;
  if (slowmo > 0) { slowmo -= real; scale *= 0.25; }
  if (hitstop > 0) { hitstop -= real; scale = 0; }
  const gdt = real * scale;
  shake = Math.max(0, shake - real * 1.2);

  if (phase === "countdown") {
    cdTimer -= real;
    const n = Math.ceil(cdTimer);
    if (n !== cdShown) {
      cdShown = n; showCd(n > 0 ? String(n) : (sim.fighters.length === 2 ? "Final!" : "Strid!"));
      SFX.play(n > 0 ? "drum" : "drum_big", { jitter: 0 });
      if (n <= 0) SFX.play("horn", { vol: 0.8 });
    }
    if (cdTimer <= -0.6) { sim.start(); acc = 0; phase = "fight"; $("cdWrap").hidden = true; arena.excite = 0.35; }
  }
  if (phase !== "abort" && phase !== "countdown") {
    acc += gdt; let n = 0;
    while (acc >= DT && n++ < 12) { sim.step(DT); acc -= DT; }
    if (n >= 12) acc = 0;
  }
  if (phase === "abort") updateAbort(real);
  if (phase === "over") {
    overT += real;
    if (overT > 1.6 && $("winWrap").hidden) showWinner();
  }
  const alpha = clamp(acc / DT, 0, 1);

  /* fighters */
  const animScale = phase === "setup" || phase === "countdown" ? real : gdt;
  for (const f of sim.fighters) {
    const V = views.get(f.id); if (!V || V.dead) continue;
    const st = V.st, v = V.view;
    const x = lerp(f.px, f.x, alpha), z = lerp(f.pz, f.z, alpha);
    v.root.position.set(x, 0, z); v.root.rotation.y = lerpAngle(f.pface, f.face, alpha);
    const vel = Math.hypot(f.mx + (f.vx || 0) * 0.3, f.mz + (f.vz || 0) * 0.3);
    st.t += animScale;
    st.mv += (clamp(vel / STATS.speed, 0, 1.2) - st.mv) * Math.min(1, animScale * 8);
    st.walk += vel * animScale * 4.4;
    st.speedSway += (clamp(vel / 2.5, 0, 1) - st.speedSway) * Math.min(1, animScale * 4);
    st.swing = f.swing >= 0 ? Math.min(1, f.swing + alpha * DT / (STATS.swing * (f.rage ? 0.72 : 1))) : -1;
    st.atk = f.atk;
    for (const k of ["hurt", "dodgeT", "parryT", "flexT"]) st[k] = Math.max(0, st[k] - animScale);
    if ((phase === "setup" || phase === "countdown") && vel < 0.05) { st.flexCd -= real; if (st.flexCd <= 0) { st.flexT = 1.6; st.flexCd = rnd(5, 11); } }
    poseFighter(v, st, animScale);
    updateFlail(v, Math.max(1 / 240, animScale), scene);
    tintFighter(v, animScale, f.rage, T);
  }
  physics.syncLive(sim.fighters.filter(f => !f.dead).map(f => ({ id: f.id, x: f.x, z: f.z, vx: f.vx + f.mx, vz: f.vz + f.mz })));
  physics.step(phase === "abort" ? real : gdt);

  /* creature */
  if (creature && sim.ev) {
    const ev = sim.ev, p = sim.evPos(ev);
    creature.group.position.set(p.x, 0, p.z);
    if (ev.warn <= 0) {
      creature.ph += gdt * (ev.type === "lion" ? 13 : 11); creature.dist += ev.speed * gdt;
      creature.animate(creature.ph, creature.dist);
      if (Math.random() < 0.6) dust.spawn({ x: p.x - ev.dx * 0.6 + rnd(-0.4, 0.4), y: 0.1, z: p.z - ev.dz * 0.6 + rnd(-0.4, 0.4), vx: -ev.dx * rnd(0.5, 1.5), vy: rnd(0.3, 1), vz: -ev.dz * rnd(0.5, 1.5), life: 1, size: 0.3, grow: 0.5, drag: 1.5, color: "#cfae78" });
    }
  }
  arena.showLane(phase === "fight" ? sim.ev : null, T);

  /* fire, final spotlight, flashes */
  const fs = sim.fireStart(), fireOn = (phase === "fight" || phase === "over") && sim.fireWarned;
  arena.update(real, T, { on: fireOn, radius: ARENA_R * sim.scale + 0.4, grow: clamp((sim.time - fs + 3) / 3, 0.3, 1) }, flames);
  const left = sim.fighters.filter(f => !f.dead);
  const wantSpot = (phase === "fight" && sim.finalMode && sim.fighters.length > 2) || (phase === "over" && overT < 2.5 && sim.fighters.length > 2);
  finalK += ((wantSpot ? 1 : 0) - finalK) * Math.min(1, real * 2);
  if (left.length) { let mx = 0, mz = 0; for (const f of left) { mx += f.x; mz += f.z; } mx /= left.length; mz /= left.length; spot.target.position.set(mx, 0, mz); spot.position.set(mx * 0.6, 15, mz * 0.6 + 3); }
  spot.intensity = 900 * finalK; post.spot = finalK;
  arena.sun.intensity = arena.theme.sunI * (1 - 0.7 * finalK); arena.hemi.intensity = arena.theme.hemiI * (1 - 0.6 * finalK);
  for (const tc of arena.torches) tc.light.intensity *= 1 - 0.5 * finalK;
  flashA = Math.max(0, flashA - real * 3); strikeLight.intensity *= Math.exp(-real * 7);
  if (flashA > 0) { arena.hemi.intensity += flashA * 3; }
  arena.excite = Math.max(phase === "over" ? 0.6 : phase === "fight" ? 0.15 + (sim.finalMode ? 0.25 : 0) : 0.03, arena.excite - real * 0.25);

  dust.update(real, T); glow.update(real, T); flames.update(real, T); lightning.update(real); party.update(real, T);

  /* sound beds */
  let crowd = 0.12;
  if (phase === "countdown") crowd = 0.22;
  if (phase === "fight") crowd = 0.28 + arena.excite * 0.35;
  if (phase === "over") crowd = overT < 4 ? 0.6 : 0.25;
  SFX.loop("crowd_loop", crowd);
  SFX.loop("fire_loop", fireOn ? 0.5 * clamp((sim.time - fs + 3) / 3, 0, 1) : 0);

  /* camera, labels, draw */
  resize();
  updateCamera(real);
  for (const f of sim.fighters) {
    const V = views.get(f.id);
    if (!V || V.dead) { overlay.removeLabel(f.id); continue; }
    const p = V.view.root.position, y = 2.25 + V.view.body.position.y;
    overlay.setLabel(f.id, { name: nameOf(ROSTER[f.id]), pos: pv.set(p.x, y, p.z), pct: clamp(f.hp / sim.hp, 0, 1), rage: f.rage, win: sim.winner === f, show: phase !== "abort" }, camera, lastW, lastH);
  }
  overlay.update(real, camera, lastW, lastH);
  post.render(real, T);

  cardTick -= real; if (cardTick <= 0) { cardTick = 0.2; syncCards(); }
  requestAnimationFrame(frame);
}
function resize() {
  const w = box.clientWidth, h = box.clientHeight;
  if (w === lastW && h === lastH) return;
  lastW = w; lastH = h;
  renderer.setSize(w, h, false); post.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const s = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
  for (const p of [dust, glow, flames]) p.mat.uniforms.uScale.value = s;
}

/* ---------- UI ---------- */
const startBtn = $("start"), statusEl = $("status"), shuffleBtn = $("shuffle"), hpRange = $("hpRange"), hpOut = $("hpOut"), arenaSel = $("arenaSel");
const logEl = $("log");
function log(html) { const li = document.createElement("li"); li.innerHTML = html; logEl.prepend(li); while (logEl.children.length > 5) logEl.lastChild.remove(); }
function showCd(s, small) {
  const w = $("cdWrap"), el = $("cd");
  w.hidden = false; el.textContent = s; el.classList.toggle("small", !!small);
  el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
}

/* roster cards */
const rosterEl = $("roster"), cards = [];
ROSTER.forEach(d => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "pick"; b.setAttribute("aria-pressed", "false");
  b.innerHTML = `<img alt="" width="120" height="150"><span class="pn"></span><span class="ps"></span><span class="php"><i></i></span>`;
  b.querySelector(".ps").textContent = d.style;
  b.addEventListener("click", () => togglePick(d.id));
  rosterEl.appendChild(b); cards[d.id] = b;
});
function cardNames() { ROSTER.forEach(d => { cards[d.id].querySelector(".pn").textContent = nameOf(d); cards[d.id].setAttribute("aria-label", nameOf(d) + ", " + d.style); }); }
cardNames();
function syncCards() {
  ROSTER.forEach(d => {
    const b = cards[d.id], f = phase !== "setup" ? sim.fighters.find(x => x.id === d.id) : null;
    b.setAttribute("aria-pressed", selected.has(d.id) ? "true" : "false");
    b.disabled = locked();
    b.classList.toggle("infight", !!f && !f.dead);
    b.classList.toggle("dead", !!f && f.dead);
    b.classList.toggle("winner", !!f && sim.winner === f && phase === "over");
    if (f) b.querySelector(".php i").style.width = clamp(f.hp / sim.hp, 0, 1) * 100 + "%";
  });
  $("customName").disabled = locked();
}
function togglePick(id) {
  if (locked()) return;
  if (phase === "over") toSetup();
  selected.has(id) ? selected.delete(id) : selected.add(id);
  SFX.init(); if (selected.has(id)) SFX.play("drum", { vol: 0.35, rate: 1.4 });
  refreshSetup();
}
function refreshUi() {
  shuffleBtn.disabled = locked() || selected.size < 2;
  hpRange.disabled = locked(); arenaSel.disabled = phase === "countdown" || phase === "fight";
  fair.setDisabled(locked());
  if (fairBusy) startBtn.disabled = true;
  else if (phase === "setup") startBtn.disabled = selected.size < 2;
  else if (phase === "over") startBtn.disabled = false;
  else startBtn.disabled = true;
  $("abort").hidden = !(phase === "countdown" || phase === "fight");
  const hint = $("hintMsg");
  hint.hidden = !(phase === "setup" && selected.size < 2);
  hint.textContent = selected.size === 0 ? "Välj krigare nedan" : "Välj minst en till";
  syncCards();
}
function refreshSetup() {
  sim.layout([...selected]); syncViews();
  const n = selected.size;
  startBtn.textContent = n < 2 ? "Välj minst 2" : "Starta striden";
  statusEl.textContent = n === 0 ? "Ingen vald" : n + (n === 1 ? " krigare vald" : " krigare valda");
  refreshUi();
}
function resetMatchVisuals() {
  physics.clear(); overlay.clearFloats(); party.clear(); arena.cheers = [];
  if (creature) { disposeCreature(creature); creature = null; }
  slowmo = 0; hitstop = 0; finalK = 0; overT = 0;
  $("winWrap").hidden = true; $("cdWrap").hidden = true;
  for (const V of views.values()) { V.st.celebrate = false; V.st.flexT = 0; }
}
function toSetup() {
  phase = "setup"; resetMatchVisuals();
  refreshSetup();
}
function startFight() {
  if (selected.size < 2) return;
  SFX.init();
  if (phase !== "setup") toSetup();
  resetMatchVisuals(); logEl.innerHTML = "";
  syncViews();
  for (const f of sim.fighters) { f.x = f.homeX; f.z = f.homeZ; f.px = f.x; f.pz = f.z; f.face = f.pface = Math.atan2(-f.x, -f.z); f.mx = f.mz = 0; f.hp = sim.hp; }
  phase = "countdown"; cdTimer = 3; cdShown = -1;
  startBtn.textContent = "Striden pågår…";
  statusEl.textContent = selected.size + " kämpar · " + sim.hp + " liv var";
  refreshUi();
  box.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
}
function showWinner() {
  const w = sim.winner, d = ROSTER[w.id];
  $("winWrap").hidden = false;
  $("winName").textContent = nameOf(d);
  $("winKills").textContent = `${d.style} · ${w.kills} ${w.kills === 1 ? "besegrad" : "besegrade"} · ${Math.max(0, Math.round(w.hp))} liv kvar`;
  const img = $("winPic"); if (portraits.has(w.id)) img.src = portraits.get(w.id);
  startBtn.disabled = false; startBtn.textContent = "Ny strid";
  SFX.play("fanfare");
  refreshUi();
}

$("abort").addEventListener("click", abortFight);
startBtn.addEventListener("click", () => { if (fairBusy) return; if (phase === "over" || phase === "setup") startFight(); });
$("again").addEventListener("click", () => { if (!fairBusy) startFight(); });
$("newPick").addEventListener("click", () => { toSetup(); $("rosterSec").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); });
$("all").addEventListener("click", () => { if (locked()) return; if (phase === "over") phase = "setup"; ROSTER.forEach(d => selected.add(d.id)); toSetup(); });
$("none").addEventListener("click", () => { if (locked()) return; selected.clear(); toSetup(); });
shuffleBtn.addEventListener("click", () => { if (locked()) return; SFX.init(); SFX.play("dice"); toSetup(); statusEl.textContent = "Startplatserna lottade"; });
hpRange.value = sim.hp; hpOut.textContent = sim.hp;
hpRange.addEventListener("input", () => {
  if (locked()) return;
  sim.hp = +hpRange.value; hpOut.textContent = sim.hp;
  try { localStorage.setItem("arena-hp", sim.hp); } catch (e) { /* ignore */ }
  if (phase === "over") toSetup(); else for (const f of sim.fighters) f.hp = sim.hp;
});
document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => {
  speed = +b.dataset.s; document.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
}));
const soundBtn = $("sound");
const soundLabel = () => { soundBtn.setAttribute("aria-pressed", SFX.on ? "true" : "false"); soundBtn.textContent = SFX.on ? "Ljud på" : "Ljud av"; };
soundLabel();
soundBtn.addEventListener("click", () => { SFX.init(); SFX.toggle(); soundLabel(); });
document.addEventListener("pointerdown", () => SFX.init(), { once: true });
{
  const inp = $("customName"); inp.value = CUSTOM.name;
  inp.addEventListener("input", () => {
    CUSTOM.name = inp.value; cardNames();
    try { localStorage.setItem("arena-custom-name", CUSTOM.name); } catch (e) { /* ignore */ }
    fair.render();
  });
  inp.addEventListener("focus", () => { if (phase === "setup" && !selected.has(CUSTOM.id)) { selected.add(CUSTOM.id); refreshSetup(); } });
}

/* arenas */
arenaSel.innerHTML = Object.entries(THEMES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join("");
function setTheme(key) {
  if (!THEMES[key]) key = "sol";
  arena.setTheme(key); post.setLook(arena.theme.look); arenaSel.value = key;
  try { localStorage.setItem("arena-theme", key); } catch (e) { /* ignore */ }
}
arenaSel.addEventListener("change", () => setTheme(arenaSel.value));

/* fullscreen (real fullscreen, or a full-window fallback) */
const stageEl = document.querySelector(".stage"), fsBtn = $("fsBtn");
const isFs = () => document.fullscreenElement === stageEl || stageEl.classList.contains("pseudo-fs");
const updFs = () => { fsBtn.textContent = isFs() ? "Avsluta helskärm" : "Helskärm"; };
const exitPseudo = () => { stageEl.classList.remove("pseudo-fs"); document.body.classList.remove("noscroll"); updFs(); };
fsBtn.addEventListener("click", async () => {
  if (isFs()) { if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch (e) { /* ignore */ } } exitPseudo(); return; }
  let ok = false;
  if (stageEl.requestFullscreen) { try { await stageEl.requestFullscreen(); ok = !!document.fullscreenElement; } catch (e) { ok = false; } }
  if (!ok) { stageEl.classList.add("pseudo-fs"); document.body.classList.add("noscroll"); }
  updFs();
});
document.addEventListener("fullscreenchange", updFs);
document.addEventListener("keydown", e => { if (e.key === "Escape" && stageEl.classList.contains("pseudo-fs")) exitPseudo(); });

/* fairness test */
const fair = initFairness({
  getIds: () => selected.size >= 2 ? [...selected] : ROSTER.map(d => d.id),
  getHp: () => sim.hp,
  setBusy: v => { fairBusy = v; refreshUi(); }
});

/* ---------- boot ---------- */
let theme = "sol";
try { const th = localStorage.getItem("arena-theme"); if (th && THEMES[th]) theme = th; } catch (e) { /* ignore */ }
setTheme(theme);
refreshSetup();
resize();
requestAnimationFrame(t => { last = t; $("loading").hidden = true; requestAnimationFrame(frame); });
setTimeout(() => {
  portraits = renderPortraits(ROSTER);
  ROSTER.forEach(d => { const u = portraits.get(d.id); if (u) cards[d.id].querySelector("img").src = u; });
}, 50);

/* handy for poking at the game from the console */
window.arena = { sim, views, scene, camera, cam, post, HP_DEFAULT };
