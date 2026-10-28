/* Renders every sound effect to a real .wav file in public/sounds/.
   Run with: npm run sounds
   Want recorded sounds instead? Drop your own files in public/sounds/ with the same names. */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SR = 32000;
const OUT = fileURLToPath(new URL("../public/sounds/", import.meta.url));
mkdirSync(OUT, { recursive: true });

/* ---------- tiny DSP kit ---------- */
let seed = 1;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rand() * 2 - 1;
const buf = sec => new Float32Array(Math.ceil(sec * SR));
const TAU = Math.PI * 2;

/* RBJ biquad, frequency may change per sample */
function biquad(type) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, f, q = 0.707) => {
    const w = TAU * Math.min(f, SR * 0.45) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
const env = (t, a, d) => t < a ? t / a : Math.exp(-(t - a) / d);
const mix = (dst, src, gain = 1, at = 0) => { const o = Math.round(at * SR); for (let i = 0; i < src.length && i + o < dst.length; i++) dst[i + o] += src[i] * gain; return dst; };

/* small Schroeder reverb so things sound like they're in a stone arena */
function reverb(x, wet = 0.25, size = 1) {
  const out = new Float32Array(x.length + Math.round(SR * 1.2 * size));
  out.set(x);
  const combs = [1557, 1617, 1491, 1422].map(n => ({ b: new Float32Array(Math.round(n * size * SR / 44100)), i: 0, fb: 0.78, lp: 0 }));
  const aps = [225, 556].map(n => ({ b: new Float32Array(Math.round(n * SR / 44100)), i: 0 }));
  for (let n = 0; n < out.length; n++) {
    const inp = n < x.length ? x[n] : 0; let s = 0;
    for (const c of combs) { const y = c.b[c.i]; c.lp = y * 0.6 + c.lp * 0.4; c.b[c.i] = inp + c.lp * c.fb; c.i = (c.i + 1) % c.b.length; s += y; }
    s /= 4;
    for (const a of aps) { const y = a.b[a.i]; const v = s + y * 0.5; a.b[a.i] = v; a.i = (a.i + 1) % a.b.length; s = y - v * 0.5; }
    out[n] = (n < x.length ? x[n] : 0) + s * wet;
  }
  return out;
}
function finish(x, peak = 0.9, fadeOut = 0.02) {
  let m = 0; for (const v of x) m = Math.max(m, Math.abs(v));
  const g = m > 0 ? peak / m : 1, f = Math.round(fadeOut * SR);
  for (let i = 0; i < x.length; i++) { x[i] *= g; const r = x.length - i; if (r < f) x[i] *= r / f; }
  return x;
}
function trim(x, thr = 0.004) { let e = x.length; while (e > 1 && Math.abs(x[e - 1]) < thr) e--; return x.slice(0, Math.min(x.length, e + 200)); }
function save(name, x) {
  if (!name.endsWith("_loop")) x = trim(x);
  const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  writeFileSync(OUT + name + ".wav", b);
  console.log(`  ${name}.wav  ${(n / SR).toFixed(2)} s  ${(b.length / 1024).toFixed(0)} kB`);
}

/* ---------- building blocks ---------- */
function whoosh(dur, f0, f1, q, sk = 1) {
  const x = buf(dur), bp = biquad("bp");
  for (let i = 0; i < x.length; i++) {
    const t = i / x.length, a = Math.sin(Math.PI * Math.pow(t, sk)) ** 2;
    x[i] = bp(noise(), f0 * Math.pow(f1 / f0, t), q) * a;
  }
  return x;
}
function thump(dur, f0, f1, decay) {
  const x = buf(dur); let ph = 0;
  for (let i = 0; i < x.length; i++) { const t = i / SR, f = f1 + (f0 - f1) * Math.exp(-t * 18); ph += TAU * f / SR; x[i] = Math.sin(ph) * env(t, 0.002, decay); }
  return x;
}
function noiseBurst(dur, type, f, q, a, d) {
  const x = buf(dur), fl = biquad(type);
  for (let i = 0; i < x.length; i++) x[i] = fl(noise(), f, q) * env(i / SR, a, d);
  return x;
}
function metal(dur, base, ratios, decays, amps) {
  const x = buf(dur);
  ratios.forEach((r, k) => { const f = base * r, ph = rand() * TAU; for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] += Math.sin(ph + TAU * f * t) * amps[k] * Math.exp(-t / decays[k]); } });
  return x;
}
/* brass-like tone: band-limited saw through a moving low-pass, with vibrato */
function brass(dur, freq, vol = 1, bright = 2600) {
  const x = buf(dur), lp = biquad("lp"); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, vib = 1 + Math.sin(TAU * 5.2 * t) * 0.006 * Math.min(1, t * 3);
    ph += freq * vib / SR; ph -= Math.floor(ph);
    let s = 0; for (let h = 1; h <= 14; h++) s += Math.sin(TAU * ph * h) / h;
    const a = Math.min(1, t / 0.05) * Math.min(1, (dur - t) / 0.08);
    x[i] = lp(s, 400 + bright * Math.min(1, t / 0.08) * (0.7 + 0.3 * a), 1.2) * a * vol;
  }
  return x;
}
/* a crowd: many band-passed "voices" swelling and fading */
function crowd(dur, density, vowel = [700, 1150], excite = 0.5) {
  const x = buf(dur);
  const lpA = biquad("lp"), bpA = biquad("bp"), bpB = biquad("bp");
  for (let i = 0; i < x.length; i++) { const n = noise(); x[i] = (bpA(n, vowel[0], 1.1) * 0.7 + bpB(n, vowel[1], 1.4) * 0.45 + lpA(n, 300) * 0.4) * 0.35; }
  for (let v = 0; v < density; v++) {
    const st = rand() * dur, len = 0.25 + rand() * 1.2 * (1 - excite * 0.5), f0 = 110 + rand() * 230, vf = vowel[0] * (0.8 + rand() * 0.5);
    const bp = biquad("bp"), bp2 = biquad("bp"); let ph = rand();
    const n0 = Math.round(st * SR), nl = Math.round(len * SR), slide = (rand() - 0.3) * 0.25 * (1 + excite);
    for (let i = 0; i < nl; i++) {
      const k = (n0 + i) % x.length, t = i / nl;
      const f = f0 * (1 + slide * t); ph += f / SR; ph -= Math.floor(ph);
      const src = (ph * 2 - 1) * 0.6 + noise() * 0.4, a = Math.sin(Math.PI * t) ** 1.5;
      x[k] += (bp(src, vf, 3) + bp2(src, vf * 1.9, 4) * 0.5) * a * 0.22;
    }
  }
  return x;
}
/* make a buffer loop seamlessly by crossfading its tail into its head */
function loopify(x, fade) {
  const f = Math.round(fade * SR), out = x.slice(0, x.length - f);
  for (let i = 0; i < f; i++) { const t = i / f; out[i] = out[i] * t + x[x.length - f + i] * (1 - t); }
  return out;
}

/* ---------- the sounds ---------- */
console.log("Skapar ljudfiler i public/sounds/");

for (let k = 1; k <= 3; k++) { seed = 11 * k; save(`swing${k}`, finish(whoosh(0.24 + k * 0.03, 500 + k * 120, 2600 + k * 300, 1.6, 0.8), 0.6)); }

for (let k = 1; k <= 3; k++) {
  seed = 100 + k;
  const base = 1350 + k * 260;
  const x = metal(0.9, base, [1, 2.76, 5.4, 8.93, 1.5], [0.32, 0.18, 0.09, 0.05, 0.25], [1, 0.6, 0.35, 0.2, 0.4]);
  mix(x, noiseBurst(0.05, "hp", 3500, 0.7, 0.0005, 0.01), 1.4);
  save(`clang${k}`, finish(reverb(x, 0.22), 0.75));
}

for (let k = 1; k <= 3; k++) {
  seed = 200 + k;
  const x = buf(0.35);
  mix(x, thump(0.3, 190 - k * 15, 55, 0.07), 1);
  mix(x, noiseBurst(0.2, "lp", 1500 + k * 300, 0.8, 0.001, 0.035), 0.9);
  mix(x, noiseBurst(0.08, "bp", 2800, 1.5, 0.001, 0.012), 0.35);
  save(`hit${k}`, finish(reverb(x, 0.15, 0.8), 0.85));
}
{
  seed = 250;
  const x = buf(0.7);
  mix(x, thump(0.5, 160, 40, 0.13), 1.2);
  mix(x, noiseBurst(0.35, "lp", 1100, 0.8, 0.001, 0.07), 1);
  mix(x, whoosh(0.16, 1800, 5200, 2), 0.5);
  mix(x, metal(0.5, 2100, [1, 2.76, 5.4], [0.12, 0.07, 0.04], [0.4, 0.25, 0.15]), 0.6);
  save("hit_crit", finish(reverb(x, 0.25), 0.95));
}

seed = 300; save("dodge", finish(whoosh(0.3, 350, 1500, 1.1, 1.3), 0.5));

{
  seed = 400;
  const x = buf(1.2);
  mix(x, thump(0.45, 110, 38, 0.12), 1.2);
  mix(x, noiseBurst(0.6, "lp", 420, 0.7, 0.002, 0.12), 1.1);
  mix(x, noiseBurst(0.9, "bp", 900, 0.6, 0.05, 0.25), 0.35, 0.06);
  mix(x, metal(0.6, 900, [1, 2.4, 4.1], [0.15, 0.08, 0.05], [0.25, 0.15, 0.1]), 0.6, 0.12);
  save("fall", finish(reverb(x, 0.3), 0.9));
}

/* countdown: war drum, then a bigger drum with a cymbal for "Strid!" */
{
  seed = 500;
  const x = buf(0.9);
  mix(x, thump(0.8, 150, 62, 0.16), 1);
  mix(x, noiseBurst(0.2, "lp", 700, 0.8, 0.001, 0.03), 0.6);
  save("drum", finish(reverb(x, 0.3, 1.2), 0.85));
  seed = 501;
  const y = buf(2.2);
  mix(y, thump(1, 120, 48, 0.25), 1.2);
  mix(y, noiseBurst(0.3, "lp", 600, 0.8, 0.001, 0.05), 0.7);
  mix(y, metal(2, 410, [1, 1.47, 2.09, 2.56, 3.37, 4.42, 5.81], [1.1, 0.9, 0.7, 0.6, 0.45, 0.35, 0.25], [0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15]), 0.55, 0.01);
  mix(y, noiseBurst(1.6, "hp", 5000, 0.6, 0.002, 0.5), 0.35);
  save("drum_big", finish(reverb(y, 0.35, 1.2), 0.9));
}

{
  seed = 600;
  const x = buf(0.45);
  for (let i = 0; i < 9; i++) mix(x, noiseBurst(0.05, "bp", 1800 + rand() * 2400, 3, 0.0005, 0.008), 0.6 + rand() * 0.4, i * 0.035 + rand() * 0.02);
  save("dice", finish(reverb(x, 0.15, 0.6), 0.7));
}

/* cornu: three-note Roman horn call */
{
  seed = 700;
  const x = buf(1.9);
  [[392, 0, 0.2], [392, 0.26, 0.2], [523.25, 0.52, 1.2]].forEach(([f, at, d]) => { mix(x, brass(d, f, 1), 0.8, at); mix(x, brass(d, f / 2, 0.8, 1400), 0.6, at); });
  save("horn", finish(reverb(x, 0.4, 1.3), 0.85));
}

/* fanfare and cheer for the winner */
{
  seed = 800;
  const x = buf(4.2);
  const notes = [[523.25, 0, 0.18], [659.25, 0.18, 0.18], [783.99, 0.36, 0.18], [1046.5, 0.54, 0.36], [783.99, 0.92, 0.18], [1046.5, 1.1, 1.5]];
  notes.forEach(([f, at, d]) => { mix(x, brass(d, f, 1, 3200), 0.55, at); mix(x, brass(d, f * 0.75, 0.7, 1800), 0.35, at); mix(x, brass(d, f / 2, 0.8, 1200), 0.4, at); });
  mix(x, thump(0.8, 120, 50, 0.2), 0.8, 1.1);
  const c = crowd(3.4, 220, [750, 1250], 1);
  for (let i = 0; i < c.length; i++) c[i] *= Math.min(1, i / SR / 0.6) * Math.min(1, (c.length - i) / SR / 1.2);
  mix(x, c, 0.9, 0.7);
  save("fanfare", finish(reverb(x, 0.35, 1.3), 0.9, 0.3));
}
{
  seed = 850;
  const c = crowd(2.6, 160, [760, 1260], 1);
  for (let i = 0; i < c.length; i++) { const t = i / SR; c[i] *= Math.min(1, t / 0.25) * Math.exp(-Math.max(0, t - 0.5) / 0.9); }
  save("cheer", finish(reverb(c, 0.3, 1.3), 0.85, 0.2));
}
{
  seed = 870;
  const c = crowd(1.8, 90, [520, 900], 0.3);
  for (let i = 0; i < c.length; i++) { const t = i / SR; c[i] *= Math.min(1, t / 0.15) * Math.exp(-Math.max(0, t - 0.3) / 0.6); }
  save("gasp", finish(reverb(c, 0.3, 1.3), 0.7, 0.2));
}
{
  seed = 900;
  const c = crowd(9, 260, [650, 1100], 0.2);
  save("crowd_loop", finish(loopify(reverb(c, 0.3, 1.4).slice(0, 9 * SR), 1.5), 0.7, 0));
}

/* lion roar: growling saw through vowel formants with a rough tremolo */
function roar(dur, f0, rough) {
  const x = buf(dur), f1 = biquad("bp"), f2 = biquad("bp"), f3 = biquad("lp"); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, u = t / dur;
    const f = f0 * (1 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.3))) * (1 + 0.04 * Math.sin(TAU * 31 * t));
    ph += f / SR; ph -= Math.floor(ph);
    const src = (ph * 2 - 1) + noise() * 0.5;
    const trem = 1 - rough + rough * (0.5 + 0.5 * Math.sin(TAU * (22 + 10 * Math.sin(TAU * 1.7 * t)) * t));
    const a = Math.min(1, t / 0.12) * Math.pow(1 - u, 1.3);
    x[i] = (f1(src, 500 + 300 * Math.sin(Math.PI * u), 2) + f2(src, 1100, 3) * 0.5 + f3(src, 260) * 0.8) * a * trem;
  }
  return x;
}
seed = 1000; save("roar", finish(reverb(roar(1.7, 95, 0.55), 0.35, 1.3), 0.95));
seed = 1001; save("growl", finish(reverb(roar(0.8, 70, 0.7), 0.2), 0.8));

/* chariot: rumbling wheels and galloping hooves */
{
  seed = 1100;
  const x = buf(2.6), lp = biquad("lp");
  for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = lp(noise(), 160 + 60 * Math.sin(TAU * 3 * t), 0.9) * Math.min(1, t / 0.3) * Math.min(1, (2.6 - t) / 0.6) * 1.4; }
  for (let t = 0.05; t < 2.4; t += 0.14 + rand() * 0.03) {
    mix(x, noiseBurst(0.06, "bp", 700 + rand() * 300, 2, 0.001, 0.012), 0.6);
    mix(x, thump(0.08, 160, 80, 0.02), 0.5, t);
    mix(x, noiseBurst(0.05, "bp", 1200, 2, 0.001, 0.01), 0.4, t + 0.05);
  }
  save("rumble", finish(reverb(x, 0.25), 0.9));
}

/* fire: whoosh on ignition and a crackling loop */
{
  seed = 1200;
  const x = buf(2.2), lp = biquad("lp");
  for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = lp(noise(), 300 + 1500 * Math.min(1, t / 0.6), 0.7) * Math.min(1, t / 0.4) * Math.exp(-Math.max(0, t - 0.8) / 0.6); }
  for (let k = 0; k < 40; k++) mix(x, noiseBurst(0.02, "hp", 2500, 0.8, 0.0003, 0.004), 0.5 * rand(), 0.2 + rand() * 1.6);
  save("fire", finish(reverb(x, 0.2), 0.85));
  seed = 1201;
  const y = buf(5), lp2 = biquad("lp"), bp = biquad("bp");
  for (let i = 0; i < y.length; i++) { const t = i / SR, n = noise(); y[i] = lp2(n, 500, 0.6) * (0.7 + 0.3 * Math.sin(TAU * 0.7 * t)) + bp(n, 1400, 0.8) * 0.15; }
  for (let k = 0; k < 220; k++) mix(y, noiseBurst(0.025, "hp", 2000 + rand() * 3000, 0.8, 0.0003, 0.003 + rand() * 0.006), 0.4 + rand() * 1.2, rand() * 4.9);
  save("fire_loop", finish(loopify(y, 0.8), 0.6, 0));
}

/* lightning: sharp crack and a long rolling rumble */
{
  seed = 1300;
  const x = buf(3.5);
  mix(x, noiseBurst(0.25, "hp", 1600, 0.6, 0.0005, 0.04), 1.4);
  mix(x, noiseBurst(0.12, "bp", 3000, 0.8, 0.0005, 0.02), 0.8, 0.02);
  const lp = biquad("lp"), r = buf(3.4);
  for (let i = 0; i < r.length; i++) { const t = i / SR; r[i] = lp(noise(), 140 + 80 * Math.sin(TAU * 0.9 * t), 0.8) * Math.min(1, t / 0.05) * Math.exp(-t / 1.1) * (0.7 + 0.3 * Math.sin(TAU * 2.3 * t)) * 3; }
  mix(x, r, 1, 0.04);
  mix(x, thump(1.4, 70, 30, 0.5), 0.9, 0.03);
  save("thunder", finish(reverb(x, 0.45, 1.5), 0.98));
}

console.log("Klart.");
