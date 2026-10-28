/* Runs invisible fights off the main thread with the same rules file as the visible match. */
import { runFight } from "./sim.js";

self.onmessage = e => {
  const { ids, hp, count } = e.data;
  const wins = Object.fromEntries(ids.map(id => [id, 0]));
  let done = 0, last = 0;
  for (let i = 0; i < count; i++) {
    const w = runFight(ids, hp);
    if (w !== null) wins[w]++;
    done++;
    if (done - last >= 25) { self.postMessage({ type: "progress", done: done - last, wins }); last = done; for (const k in wins) wins[k] = 0; }
  }
  self.postMessage({ type: "progress", done: done - last, wins });
  self.postMessage({ type: "done" });
};
