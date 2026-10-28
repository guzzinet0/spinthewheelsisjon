/* Runs thousands of invisible fights with the game's own rules (src/game/sim.js) and prints who wins how often.
   npm run fairness            -> 11 fighters, 20 000 fights
   npm test                    -> chi-square check that fails if anyone is favoured */
import { runFight } from "../src/game/sim.js";
import { ROSTER, nameOf } from "../src/game/roster.js";

const args = process.argv.slice(2);
const check = args.includes("--check");
const num = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? +args[i + 1] : def; };
const fights = num("--fights", check ? 6000 : 20000);
const hp = num("--hp", 120);

/* Chi-square critical values at p = 0.001 for df = 1..10. A fair game fails this about once in a thousand runs. */
const CRIT = [10.83, 13.82, 16.27, 18.47, 20.52, 22.46, 24.32, 26.12, 27.88, 29.59];

function test(ids, n) {
  const wins = new Map(ids.map(id => [id, 0]));
  let timeouts = 0;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { const w = runFight(ids, hp); if (w === null) timeouts++; else wins.set(w, wins.get(w) + 1); }
  const decided = n - timeouts, exp = decided / ids.length;
  let chi = 0;
  for (const c of wins.values()) chi += (c - exp) ** 2 / exp;
  const ok = chi < CRIT[ids.length - 2];
  console.log(`\n${ids.length} krigare, ${n} strider, ${hp} liv (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  for (const [id, c] of [...wins].sort((a, b) => b[1] - a[1])) {
    const p = c / decided * 100;
    console.log(`  ${nameOf(ROSTER[id]).padEnd(10)} ${p.toFixed(2).padStart(6)} %  ${"█".repeat(Math.round(p * 2))}`);
  }
  console.log(`  rättvis andel ${(100 / ids.length).toFixed(2)} %, chi² = ${chi.toFixed(2)} (gräns ${CRIT[ids.length - 2]})${timeouts ? `, ${timeouts} oavgjorda` : ""} -> ${ok ? "RÄTTVIST" : "INTE RÄTTVIST"}`);
  return ok && timeouts === 0;
}

const all = ROSTER.map(d => d.id);
let ok = test(all, fights);
if (check) ok = test([0, 8], fights) && ok;      // the lightest look against the heaviest
if (!ok) process.exitCode = 1;
