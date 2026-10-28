import { ROSTER, nameOf } from "../game/roster.js";

/* The fairness panel: splits 1000 invisible fights over a few web workers and shows who won how often. */
const BATCH = 1000;
const pctFmt = v => v.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function initFairness({ getIds, getHp, setBusy }) {
  const btn = document.getElementById("fairRun"), prog = document.getElementById("fairProg"), meta = document.getElementById("fairMeta"), list = document.getElementById("fairList");
  let state = null, running = false;

  function render() {
    if (!state) return;
    const n = state.ids.length, fair = 100 / n, total = Math.max(1, state.total);
    const rows = state.ids.map(id => ({ d: ROSTER[id], p: state.wins[id] / total * 100 })).sort((a, b) => b.p - a.p);
    list.innerHTML = rows.map(r => `<li><span class="bn">${esc(nameOf(r.d))}</span><i style="--v:${Math.min(100, r.p / (2 * fair) * 100)}%"></i><span class="bw">${pctFmt(r.p)}</span></li>`).join("");
    const dev = Math.max(...rows.map(r => Math.abs(r.p - fair)));
    meta.textContent = `${state.total} teststrider med ${n} krigare och ${state.hp} liv. Rättvis andel är ${pctFmt(fair)} var. ` +
      (running ? "" : `Största skillnaden just nu är ${dev.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} procentenheter. Små skillnader är vanlig slump, som när man slår en tärning, och de krymper ju fler strider du kör.`);
  }

  async function run() {
    if (running) return;
    const ids = getIds().slice().sort((a, b) => a - b), hp = getHp(), key = ids.join(",") + "|" + hp;
    if (!state || state.key !== key) state = { key, ids, hp, wins: Object.fromEntries(ids.map(id => [id, 0])), total: 0 };
    running = true; setBusy(true);
    btn.disabled = true; btn.textContent = "Testar…"; prog.hidden = false;
    const start = state.total, nw = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    const per = Array.from({ length: nw }, (_, i) => Math.floor(BATCH / nw) + (i < BATCH % nw ? 1 : 0));
    await Promise.all(per.map(count => new Promise(resolve => {
      const w = new Worker(new URL("../game/fairness.worker.js", import.meta.url), { type: "module" });
      w.onmessage = e => {
        if (e.data.type === "progress") {
          state.total += e.data.done;
          for (const [id, c] of Object.entries(e.data.wins)) state.wins[id] += c;
          prog.firstElementChild.style.setProperty("--p", ((state.total - start) / BATCH * 100) + "%");
          render();
        } else { w.terminate(); resolve(); }
      };
      w.onerror = () => { w.terminate(); resolve(); };
      w.postMessage({ ids, hp, count });
    })));
    running = false; setBusy(false);
    prog.hidden = true; btn.disabled = false; btn.textContent = "Kör 1000 till";
    render();
  }

  btn.addEventListener("click", run);
  return { render, setDisabled(v) { if (!running) btn.disabled = v; } };
}
