/* Step 1, CORRECTED. Two things were wrong the first time:
 *  (a) the harness never passed `safety` — the App always does, and without it
 *      the full-band safety gate (which rejects a degenerate tune and restores
 *      the seed) never runs. Every candidate came back disqualified, two of
 *      them presenting ~0 ohm to the amplifier.
 *  (b) the comparison has to be WINNER vs WINNER, ranked at each weight.
 * usage: ROOT=<tree> PP=0.5 OUT=<file> npx vite-node pprun2.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.env.ROOT!;
const PP = Number(process.env.PP ?? '0.5');
const AMP = Number(process.env.AMP ?? '2.5'); // stated amplifier rating (Ω); 0 = none
const OUT = process.env.OUT!;
const lib = (p: string) => join(ROOT, 'src/lib', p);
const { parseFrd } = await import(lib('parsers/frd.ts'));
const { parseZma } = await import(lib('parsers/zma.ts'));
const { logspace, resample, resampleImpedance, combine, applyTransfer } = await import(lib('dsp.ts'));
const { runThreeWayChain, rankChain3Results } = await import(lib('threeWayChain.ts'));
const { computeIntegration } = await import(lib('integration.ts'));
const { computePhaseStats } = await import(lib('phaseStats.ts'));
const { crossoverToNetlist } = await import(lib('vxpNetwork.ts'));
const { solveNetwork } = await import(lib('network.ts'));
const { deserializeCatalog } = await import(lib('catalogFile.ts'));
const { setCustomSeries } = await import(lib('catalog.ts'));
{ const imp = deserializeCatalog(readFileSync(join(ROOT,'src/lib/parsers/fixtures/gemini-catalog-v6.json'),'utf8'));
  setCustomSeries(imp.series, imp.parts); }

const D = join(ROOT, 'src/lib/parsers/fixtures/koan-3way');
const grid = logspace(210, 19000, 240);
const SILENT = -400;
const bandedOn = (name: string, g0: readonly number[]) => {
  const p = parseFrd(readFileSync(join(D, name), 'utf8'));
  const g = resample(p.freq, p.spl, p.phase, g0, { clampEdges: true });
  const f0 = p.freq[0], f1 = p.freq[p.freq.length - 1];
  return { freq: [...g0], spl: g.spl.map((v: number, i: number) => (g0[i] < f0 || g0[i] > f1 ? SILENT : v)),
           phaseDeg: g.phaseDeg.map((v: number, i: number) => (g0[i] < f0 || g0[i] > f1 ? 0 : v)) };
};
const banded = (n: string) => bandedOn(n, grid);
const w = banded('woofer-pair-hor0.frd'), m = banded('mid-hor0.txt'), t = banded('tweeter-hor0.txt');
const angles = (pre: string, ext: string) => [0, 15, 30, 45, 60].map((a) => ({ hor: a, response: banded(`${pre}${a}${ext}`) }));
const angleData = { woofer: angles('woofer-pair-hor', '.frd'), mid: angles('mid-hor', '.txt'), tweeter: angles('tweeter-hor', '.txt') };
const zOn = (name: string, g0: readonly number[]) => { const zz = parseZma(readFileSync(join(D, name), 'utf8')); return resampleImpedance(zz.freq, zz.magnitude, zz.phase, g0).z; };
const driverZ = { woofer: zOn('woofers-parallel.zma', grid), mid: zOn('mid.zma', grid), tweeter: zOn('tweeter.zma', grid) };

/* SAFETY GRID, exactly as App.tsx builds it: 200..20000 clamped to what the
 * files actually cover, 240 log points, each branch silent outside its own
 * range. This is the guard the first measurement was missing. */
const sLo = Math.max(200, Math.min(...['woofer-pair-hor0.frd','mid-hor0.txt','tweeter-hor0.txt'].map((f) => parseFrd(readFileSync(join(D,f),'utf8')).freq[0])));
const sHi = Math.min(20000, Math.max(...['woofer-pair-hor0.frd','mid-hor0.txt','tweeter-hor0.txt'].map((f) => { const p = parseFrd(readFileSync(join(D,f),'utf8')); return p.freq[p.freq.length-1]; })));
const sGrid = logspace(sLo, sHi, 240);
const safety = { freqs: sGrid, w: bandedOn('woofer-pair-hor0.frd', sGrid), m: bandedOn('mid-hor0.txt', sGrid), t: bandedOn('tweeter-hor0.txt', sGrid),
                 z: { woofer: zOn('woofers-parallel.zma', sGrid), mid: zOn('mid.zma', sGrid), tweeter: zOn('tweeter.zma', sGrid) } };

const settings: any = {
  phasePriority: PP,
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  hpFloorHz: 1849, eqBands: 2, breakupGuard: true,
  directivityWeight: 0.25, ampTarget: 'onAxis', phaseMetric: 'band',
  synthMode: 'acoustic', catalogSnap: false, band: [250, 18000],
  diAnchorHz: { low: 1399, high: 3149 }, xoFloorPairs: [200, 1849],
  rSourceDisqualifyOhm: 2.0,
  ampMinLoadOhm: AMP > 0 ? AMP : undefined,
  safety,
};
const mk = (xoLow: number, xoHigh: number, lr: [number, number], hr: [number, number], label: string) => ({
  grid: [...grid], w, m, t, driverZ, angleData, tAdjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {},
  xoLow, xoHigh, xoLowRange: lr, xoHighRange: hr,
  judgeWindows: { low: { floorHz: 424, ceilHz: 622 }, high: { floorHz: 1849, ceilHz: 3149 } }, label, settings,
});
const cands = [
  mk(424, 2432, [424, 513], [1849, 3149], 'W-M 424 · M-T 2432'),
  mk(622, 2432, [513, 622], [1849, 3149], 'W-M 622 · M-T 2432'),
  mk(514, 1849, [424, 622], [1849, 2121], 'W-M 514 · M-T 1849'),
];
/* Same yardstick the mtPhaseBar test uses. */
const barGrid = logspace(455, 16000, 500);
const barResp = { woofer: bandedOn('woofer-pair-hor0.frd', barGrid), mid: bandedOn('mid-hor0.txt', barGrid), tweeter: bandedOn('tweeter-hor0.txt', barGrid) };
const barZ: any = { woofer: zOn('woofers-parallel.zma', barGrid), mid: zOn('mid.zma', barGrid), tweeter: zOn('tweeter.zma', barGrid) };
function onBar(parts: any[]) {
  const { netlist } = crossoverToNetlist({ name: 'x', parts: [...parts] } as any);
  const sol = solveNetwork(netlist, barGrid, barZ);
  const branch: any = {};
  for (const d of sol.drivers) { const r = (barResp as any)[d.model]; if (r) branch[d.model] = applyTransfer(r, sol.transfers[d.id]); }
  const pair = (a: any, b: any) => {
    const c = combine(a, b, { offsetMm: 0, trimDb: 0, inverted: false });
    const ig = computeIntegration(c);
    const ps = computePhaseStats(c.relativePhaseDeg, ig.points);
    return ps?.avgErrorDeg ?? null;
  };
  return { wm: pair(branch.woofer, branch.mid), mt: pair(branch.mid, branch.tweeter) };
}
const results: any[] = [];
for (const c of cands) {
  const t0 = Date.now();
  const r: any = runThreeWayChain(c as any);
  r._bar = onBar(r.parts);
  results.push(r);
  console.log(`[pp=${PP} amp=${AMP}] ${c.label}: peak ${r.net.after.rippleDb.toFixed(3)} avg ${r.net.after.avgDevDb?.toFixed(3)} pairs ${(r.net.after.pairPhaseDeg ?? []).map((v: number) => v.toFixed(1)).join('/')} zmin ${(r.net.after.zMinOhm ?? NaN).toFixed(2)} rs ${r.net.after.rSourceOhm?.toFixed?.(2) ?? '-'} parts ${r.parts.length} bom ${r.bomTotalEur?.toFixed?.(0) ?? '-'} | BAR W-M ${r._bar.wm?.toFixed(1)} M-T ${r._bar.mt?.toFixed(1)} | DQ ${(r.disqualified ?? []).length} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
  if ((r.disqualified ?? []).length) for (const d of r.disqualified) console.log('     dq:', d.slice(0, 150));
}
const rankWith = (amp: number) => rankChain3Results(results as any, settings.targets, PP, 0.25, 1.0, 0, amp).map((r: any) => r.label);
const rankedStated = rankWith(AMP);
const rankedNone = rankWith(0);
console.log(`[pp=${PP}] ranking (amp ${AMP} Ω stated): ${rankedStated.join(' > ')}`);
console.log(`[pp=${PP}] ranking (no amp stated)     : ${rankedNone.join(' > ')}`);
writeFileSync(OUT, JSON.stringify({ pp: PP, amp: AMP, rankedStated, rankedNone, rows: results.map((r: any) => ({
  label: r.label, peak: r.net.after.rippleDb, avg: r.net.after.avgDevDb, phase: r.net.after.phaseDeg,
  pairs: r.net.after.pairPhaseDeg, xo: r.net.after.xoHzPairs, zmin: r.net.after.zMinOhm,
  rs: r.net.after.rSourceOhm ?? null, parts: r.parts.length, bom: r.bomTotalEur,
  zOk: r.zOk, xoWindowOk: r.xoWindowOk, disq: r.disqualified ?? [], bar: r._bar,
})) }, null, 1));
