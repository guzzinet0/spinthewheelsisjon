import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildFighter, poseFighter, disposeFighter } from "./fighter.js";

/* Renders a still of every fighter once, for the roster cards and the winner banner. */
export function renderPortraits(list, { w = 240, h = 300 } = {}) {
  const out = new Map();
  let r;
  try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { return out; }
  r.setPixelRatio(1); r.setSize(w, h, false);
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(r);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight("#ffe8c8", "#402818", 1.4));
  const key = new THREE.DirectionalLight("#fff0d8", 3.2); key.position.set(-2, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight("#ffb070", 2.2); rim.position.set(3, 3, -3); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(28, w / h, 0.1, 50);
  cam.position.set(1.4, 1.5, 4.6); cam.lookAt(0, 1.08, 0);
  for (const d of list) {
    const v = buildFighter(d);
    v.root.rotation.y = 0.3;
    poseFighter(v, { t: 0.4 + d.id, walk: 0, mv: 0, swing: -1, atk: 0, flexT: 1, hurt: 0, dodgeT: 0, parryT: 0, celebrate: false, victory: 0, speedSway: 0 }, 0);
    scene.add(v.root);
    r.render(scene, cam);
    out.set(d.id, r.domElement.toDataURL("image/png"));
    v.root.removeFromParent(); disposeFighter(v);
  }
  pmrem.dispose(); r.dispose(); r.forceContextLoss();
  return out;
}
