/* Plays the .wav files in public/sounds/ through Web Audio, panned by where things happen on screen. */
const FILES = ["swing1", "swing2", "swing3", "clang1", "clang2", "clang3", "hit1", "hit2", "hit3", "hit_crit", "dodge", "fall",
  "drum", "drum_big", "dice", "horn", "fanfare", "cheer", "gasp", "crowd_loop", "roar", "growl", "rumble", "fire", "fire_loop", "thunder"];
const GROUPS = { swing: ["swing1", "swing2", "swing3"], clang: ["clang1", "clang2", "clang3"], hit: ["hit1", "hit2", "hit3"] };
const base = import.meta.env.BASE_URL + "sounds/";

let ac = null, master = null, loading = null, on = true;
const buffers = new Map(), loops = new Map();
try { on = localStorage.getItem("arena-sound") !== "off"; } catch (e) { /* private mode */ }

async function load() {
  await Promise.all(FILES.map(async name => {
    try {
      const res = await fetch(base + name + ".wav");
      buffers.set(name, await ac.decodeAudioData(await res.arrayBuffer()));
    } catch (e) { console.warn("Kunde inte ladda ljud", name, e); }
  }));
}

export const SFX = {
  /** Must be called from a click/tap: browsers only allow audio after a gesture. */
  init() {
    if (ac) { if (ac.state === "suspended") ac.resume(); return loading; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = on ? 0.8 : 0;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    loading = load().then(() => { this.loop("crowd_loop", 0); this.loop("fire_loop", 0); });
    return loading;
  },
  get on() { return on; },
  toggle() {
    on = !on;
    try { localStorage.setItem("arena-sound", on ? "on" : "off"); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, 0.05);
    return on;
  },
  /** name: file or group; pan -1..1; rate: playback speed (pitch) */
  play(name, { vol = 1, pan = 0, rate = 1, jitter = 0.06, delay = 0 } = {}) {
    if (!ac || !on) return;
    const g = GROUPS[name]; if (g) name = g[(Math.random() * g.length) | 0];
    const b = buffers.get(name); if (!b) return;
    const src = ac.createBufferSource(); src.buffer = b;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const gain = ac.createGain(); gain.gain.value = vol;
    let node = src.connect(gain);
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node = node.connect(p); }
    node.connect(master);
    src.start(ac.currentTime + delay);
  },
  loop(name, level) {
    if (!ac) return;
    let l = loops.get(name);
    if (!l) {
      const b = buffers.get(name); if (!b) return;
      const src = ac.createBufferSource(); src.buffer = b; src.loop = true;
      const gain = ac.createGain(); gain.gain.value = 0;
      src.connect(gain); gain.connect(master); src.start();
      l = { gain, level: 0 }; loops.set(name, l);
    }
    if (Math.abs(l.level - level) > 0.005) { l.level = level; l.gain.gain.setTargetAtTime(level, ac.currentTime, 0.35); }
  }
};
