import * as THREE from "three";

/* Procedural canvas textures, made once and shared. */
const cache = new Map();
function canvasTex(key, w, h, draw, { repeat = null, srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  cache.set(key, t);
  return t;
}
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export const tex = {
  mail: () => canvasTex("mail", 128, 128, (c, w, h) => {
    c.fillStyle = "#c8c8c8"; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) for (let x = 0; x < w; x += 6) {
      const ox = (y / 6) % 2 ? 3 : 0;
      c.strokeStyle = "#5a5a5a"; c.lineWidth = 1.4; c.beginPath(); c.arc(x + ox, y, 2.6, 0, Math.PI * 2); c.stroke();
      c.fillStyle = "#f2f2f2"; c.fillRect(x + ox - 1, y - 2, 1.5, 1);
    }
  }, { repeat: [3, 3] }),
  scales: () => canvasTex("scales", 128, 128, (c, w, h) => {
    c.fillStyle = "#8a8a8a"; c.fillRect(0, 0, w, h);
    for (let y = -8, r = 0; y < h + 8; y += 10, r++) for (let x = (r % 2) * 8 - 16; x < w + 16; x += 16) {
      const g = c.createRadialGradient(x, y + 2, 1, x, y, 10); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#9a9a9a");
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 8, 0, Math.PI); c.fill();
      c.strokeStyle = "#4a4a4a"; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, 8, 0, Math.PI); c.stroke();
    }
  }, { repeat: [2, 2] }),
  fur: () => canvasTex("fur", 128, 128, (c, w, h) => {
    const r = mulberry(4); c.fillStyle = "#b0b0b0"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const x = r() * w, y = r() * h, l = 4 + r() * 8, v = 120 + r() * 135 | 0; c.strokeStyle = `rgb(${v},${v},${v})`; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - .5) * 3, y + l); c.stroke(); }
  }, { repeat: [2, 1] }),
  grille: () => canvasTex("grille", 64, 64, (c, w, h) => {
    c.fillStyle = "#060404"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#cfcfcf"; c.lineWidth = 4;
    for (let i = 4; i < w; i += 12) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); }
  }),
  rings: () => canvasTex("rings", 64, 64, (c, w, h) => {
    c.fillStyle = "#060404"; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#cfcfcf"; c.lineWidth = 3;
    for (let r = 6; r < 34; r += 7) { c.beginPath(); c.arc(w / 2, h / 2, r, 0, Math.PI * 2); c.stroke(); }
  }),
  net: () => canvasTex("net", 128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.strokeStyle = "#e3d6b3"; c.lineWidth = 2.2;
    for (let i = -w; i < w * 2; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke(); c.beginPath(); c.moveTo(i, 0); c.lineTo(i - h, h); c.stroke(); }
  }, { repeat: [2, 3] }),
  shield: (kind, base, trim) => canvasTex(`sh-${kind}-${base}-${trim}`, 256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "rgba(0,0,0,.35)"); g.addColorStop(.55, "rgba(255,255,255,.06)"); g.addColorStop(1, "rgba(0,0,0,.25)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = trim; c.fillStyle = trim; c.lineWidth = 9; c.lineCap = "round";
    if (kind === "scutum") {
      c.strokeRect(14, 14, w - 28, h - 28);
      for (const [x1, y1, x2, y2] of [[50, 60, 110, 112], [206, 60, 146, 112], [50, 196, 110, 144], [206, 196, 146, 144]]) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
      c.lineWidth = 6; for (const y of [40, 216]) { c.beginPath(); c.moveTo(70, y); c.quadraticCurveTo(128, y + (y < 128 ? 22 : -22), 186, y); c.stroke(); }
    } else if (kind === "aspis") {
      c.beginPath(); c.arc(128, 128, 112, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 16; c.beginPath(); c.moveTo(78, 190); c.lineTo(128, 62); c.lineTo(178, 190); c.stroke();
    } else if (kind === "roundpaint") {
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(128, 128); c.arc(128, 128, 130, i * Math.PI / 2, i * Math.PI / 2 + Math.PI / 4); c.closePath(); c.fill(); }
      c.strokeStyle = "rgba(60,30,10,.18)"; c.lineWidth = 2; for (let x = 8; x < w; x += 18) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    } else {
      c.lineWidth = 12; c.strokeRect(20, 20, w - 40, h - 40);
    }
  }),
  sand: theme => canvasTex("sand-" + theme.key, 1024, 1024, (c, w, h) => {
    const r = mulberry(11), [a, b, d] = theme.sand;
    const g = c.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 2); g.addColorStop(0, a); g.addColorStop(.75, b); g.addColorStop(1, d);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) { c.fillStyle = r() < .5 ? theme.speck[0] : theme.speck[1]; c.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2); }
    c.strokeStyle = theme.rake; c.lineWidth = 3;
    for (let i = 1; i <= 5; i++) { c.beginPath(); c.arc(w / 2, h / 2, i * 85, 0, Math.PI * 2); c.stroke(); }
    for (let i = 0; i < 60; i++) { c.globalAlpha = .08; c.fillStyle = theme.speck[0]; c.beginPath(); c.ellipse(r() * w, r() * h, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
  }),
  stone: theme => canvasTex("stone-" + theme.key, 512, 128, (c, w, h) => {
    const r = mulberry(7); c.fillStyle = theme.stone[0]; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 * 32 - 32; x < w; x += 64) {
      c.fillStyle = r() < .5 ? theme.stone[0] : theme.stone[1]; c.fillRect(x + 1, y + 1, 62, 30);
      c.fillStyle = "rgba(0,0,0,.12)"; c.fillRect(x + 1, y + 27, 62, 4);
    }
    for (let i = 0; i < 3000; i++) { c.fillStyle = r() < .5 ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.05)"; c.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [24, 1] }),
  facade: theme => canvasTex("facade-" + theme.key, 512, 256, (c, w, h) => {
    c.fillStyle = theme.stone[1]; c.fillRect(0, 0, w, h);
    for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
      const x = i * 128 + 24, y = row * 128 + 22, aw = 80, ah = 96;
      c.fillStyle = theme.archDark; c.beginPath(); c.moveTo(x, y + ah); c.lineTo(x, y + 40); c.arc(x + aw / 2, y + 40, aw / 2, Math.PI, 0); c.lineTo(x + aw, y + ah); c.fill();
      c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(i * 128, row * 128, 10, 128);
    }
    c.fillStyle = "rgba(0,0,0,.25)"; c.fillRect(0, 124, w, 8); c.fillRect(0, 0, w, 6);
  }, { repeat: [16, 1] }),
  sky: theme => canvasTex("sky-" + theme.key, 16, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    theme.sky.forEach((col, i) => g.addColorStop(i / (theme.sky.length - 1), col));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }),
  stars: () => canvasTex("stars", 2048, 512, (c, w, h) => {
    const r = mulberry(3); c.clearRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const y = Math.pow(r(), 1.6) * h * .55; c.fillStyle = `rgba(255,255,255,${.3 + r() * .7})`; c.fillRect(r() * w, y, r() < .1 ? 2 : 1, r() < .1 ? 2 : 1); }
  }),
  soft: () => canvasTex("soft", 64, 64, (c, w, h) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.4, "rgba(255,255,255,.8)"); g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }),
  flame: () => canvasTex("flame", 64, 128, (c, w, h) => {
    const g = c.createRadialGradient(32, 92, 2, 32, 80, 60);
    g.addColorStop(0, "rgba(255,250,210,1)"); g.addColorStop(.25, "rgba(255,200,80,.95)"); g.addColorStop(.6, "rgba(255,90,20,.6)"); g.addColorStop(1, "rgba(120,20,0,0)");
    c.fillStyle = g; c.beginPath(); c.moveTo(32, 2); c.quadraticCurveTo(62, 70, 52, 104); c.quadraticCurveTo(32, 128, 12, 104); c.quadraticCurveTo(2, 70, 32, 2); c.fill();
  }),
  lane: () => canvasTex("lane", 256, 32, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = "rgba(220,40,30,1)";
    for (let x = 0; x < w; x += 64) { c.beginPath(); c.moveTo(x + 6, 4); c.lineTo(x + 38, 4); c.lineTo(x + 54, 16); c.lineTo(x + 38, 28); c.lineTo(x + 6, 28); c.lineTo(x + 22, 16); c.fill(); }
  }, { repeat: [6, 1] }),
  scorch: () => canvasTex("scorch", 512, 512, (c, w, h) => {
    const r = mulberry(9); c.clearRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(20,8,2,${.05 + r() * .1})`; c.beginPath(); c.arc(r() * w, r() * h, 6 + r() * 30, 0, Math.PI * 2); c.fill(); }
  }, { repeat: [8, 1] })
};
