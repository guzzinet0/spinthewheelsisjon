import * as THREE from "three";

/* Crisp HTML on top of the 3D view: name tags with health bars, floating numbers and warnings. */
const v = new THREE.Vector3();

export class Overlay {
  constructor(el) {
    this.el = el; this.labels = new Map(); this.floats = [];
  }
  project(p, camera, w, h) {
    v.copy(p).project(camera);
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, ok: v.z < 1 && v.z > -1 };
  }
  label(id) {
    let l = this.labels.get(id);
    if (!l) {
      const el = document.createElement("div"); el.className = "tag";
      el.innerHTML = `<span class="nm"></span><span class="hp"><i></i></span>`;
      this.el.appendChild(el);
      l = { el, nm: el.firstChild, bar: el.lastChild.firstChild, name: "", pct: -1, cls: "" };
      this.labels.set(id, l);
    }
    return l;
  }
  setLabel(id, { name, pos, pct, rage, win, show }, camera, w, h) {
    const l = this.label(id);
    if (!show) { l.el.hidden = true; return; }
    const p = this.project(pos, camera, w, h);
    l.el.hidden = !p.ok;
    if (!p.ok) return;
    if (l.name !== name) { l.name = name; l.nm.textContent = name; }
    const q = Math.round(pct * 100);
    if (l.pct !== q) { l.pct = q; l.bar.style.width = q + "%"; }
    const cls = "tag" + (rage ? " rage" : pct > 0.5 ? "" : pct > 0.25 ? " mid" : " low") + (win ? " win" : "");
    if (l.cls !== cls) { l.cls = cls; l.el.className = cls; }
    l.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
  }
  removeLabel(id) { const l = this.labels.get(id); if (l) { l.el.remove(); this.labels.delete(id); } }
  clearLabels() { for (const id of [...this.labels.keys()]) this.removeLabel(id); }

  float(pos, text, cls = "", life = 1.1) {
    const el = document.createElement("div"); el.className = "float " + cls; el.textContent = text;
    this.el.appendChild(el);
    this.floats.push({ el, pos: pos.clone(), life, max: life });
  }
  update(dt, camera, w, h) {
    for (const f of this.floats) {
      f.life -= dt; f.pos.y += dt * 0.9 * Math.max(0.2, f.life / f.max);
      const p = this.project(f.pos, camera, w, h), a = Math.min(1, f.life / f.max * 2.2);
      f.el.style.opacity = p.ok ? a : 0;
      f.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%) scale(${(0.8 + 0.4 * Math.min(1, (f.max - f.life) * 8)).toFixed(2)})`;
      if (f.life <= 0) f.el.remove();
    }
    this.floats = this.floats.filter(f => f.life > 0);
  }
  clearFloats() { for (const f of this.floats) f.el.remove(); this.floats = []; }
}
