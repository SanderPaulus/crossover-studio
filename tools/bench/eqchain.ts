// Full 3-way chain on the KOAN fixtures at a given phasePriority.
// usage: ROOT=<tree> PP=0.5 OUT=<file> npx vite-node pprun.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.env.ROOT!;
const PP = Number(process.env.PP ?? "0.5");
const NEQ = Number(process.env.NEQ ?? "2");
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

const D = join(ROOT, 'src/lib/parsers/fixtures/koan-3way');
const grid = logspace(210, 19000, 240);
const SILENT = -400;
const banded = (name: string, g0 = grid) => {
  const p = parseFrd(readFileSync(join(D, name), 'utf8'));
  const g = resample(p.freq, p.spl, p.phase, g0, { clampEdges: true });
  const f0 = p.freq[0], f1 = p.freq[p.freq.length - 1];
  return { freq: g0, spl: g.spl.map((v: number, i: number) => (g0[i] < f0 || g0[i] > f1 ? SILENT : v)), phaseDeg: g.phaseDeg };
};
const w = banded('woofer-pair-hor0.frd'), m = banded('mid-hor0.txt'), t = banded('tweeter-hor0.txt');
const angles = (pre: string, ext: string) => [0, 15, 30, 45, 60].map((a) => ({ hor: a, response: banded(`${pre}${a}${ext}`) }));
const angleData = { woofer: angles('woofer-pair-hor', '.frd'), mid: angles('mid-hor', '.txt'), tweeter: angles('tweeter-hor', '.txt') };
const z = (name: string) => { const zz = parseZma(readFileSync(join(D, name), 'utf8')); return resampleImpedance(zz.freq, zz.magnitude, zz.phase, grid).z; };
const driverZ = { woofer: z('woofers-parallel.zma'), mid: z('mid.zma'), tweeter: z('tweeter.zma') };

const settings: any = {
  phasePriority: PP,
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  hpFloorHz: 1849,
  eqBands: NEQ,
  breakupGuard: true,
  directivityWeight: 0.25,
  ampTarget: 'onAxis',
  phaseMetric: 'band',
  synthMode: 'acoustic',
  catalogSnap: false,
  band: [250, 18000],
  diAnchorHz: { low: 1399, high: 3149 },
  xoFloorPairs: [200, 1849],
  rSourceDisqualifyOhm: 2.0,
};
const mk = (xoLow: number, xoHigh: number, lr: [number, number], hr: [number, number], label: string) => ({
  grid: [...grid], w, m, t, driverZ, angleData, tAdjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {},
  xoLow, xoHigh, xoLowRange: lr, xoHighRange: hr,
  judgeWindows: { low: { floorHz: 424, ceilHz: 622 }, high: { floorHz: 1849, ceilHz: 3149 } }, label, settings,
});
const cands = [
  mk(514, 2432, [424, 622], [1849, 3149], 'W-M 514 · M-T 2432'),
];
const _unused = [
  mk(424, 2432, [424, 513], [1849, 3149], 'W-M 424 · M-T 2432'),
  mk(622, 2432, [513, 622], [1849, 3149], 'W-M 622 · M-T 2432'),
  mk(514, 1849, [424, 622], [1849, 2121], 'W-M 514 · M-T 1849'),
];

/* Measure the delivered network on the SAME yardstick the mtPhaseBar test uses:
 * its own 455 Hz-16 kHz grid, pair-wise uniform average phase. */
const barGrid = logspace(455, 16000, 500);
const barResp = { woofer: banded('woofer-pair-hor0.frd', barGrid), mid: banded('mid-hor0.txt', barGrid), tweeter: banded('tweeter-hor0.txt', barGrid) };
const barZ = (name: string) => { const zz = parseZma(readFileSync(join(D, name), 'utf8')); return resampleImpedance(zz.freq, zz.magnitude, zz.phase, barGrid).z; };
const barDriverZ: any = { woofer: barZ('woofers-parallel.zma'), mid: barZ('mid.zma'), tweeter: barZ('tweeter.zma') };
function onBar(parts: any[]) {
  const { netlist } = crossoverToNetlist({ name: 'x', parts: [...parts] } as any);
  const sol = solveNetwork(netlist, barGrid, barDriverZ);
  const branch: any = {};
  for (const d of sol.drivers) { const r = (barResp as any)[d.model]; if (r) branch[d.model] = applyTransfer(r, sol.transfers[d.id]); }
  const pair = (a: any, b: any) => {
    const c = combine(a, b, { offsetMm: 0, trimDb: 0, inverted: false });
    const ig = computeIntegration(c);
    const ps = computePhaseStats(c.relativePhaseDeg, ig.points);
    return { avg: ps?.avgErrorDeg ?? null, p95: ps?.p95ErrorDeg ?? null, xoHz: ig.overlapCentreHz };
  };
  return { wm: pair(branch.woofer, branch.mid), mt: pair(branch.mid, branch.tweeter) };
}

const results: any[] = [];
for (const c of cands) {
  const t0 = Date.now();
  const r: any = runThreeWayChain(c as any);
  const bar = onBar(r.parts);
  (r as any)._bar = bar;
  results.push(r);
  console.log(`[pp=${PP} eq=${NEQ}] ${c.label}: peak ${r.net.after.rippleDb.toFixed(3)} avg ${r.net.after.avgDevDb?.toFixed(3)} pairs ${(r.net.after.pairPhaseDeg ?? []).map((v: number) => v.toFixed(1)).join('/')} xo ${(r.net.after.xoHzPairs ?? []).map((v: number) => Math.round(v)).join('/')} parts ${r.parts.length} bom ${r.bomTotalEur?.toFixed?.(0) ?? '-'} | BAR W-M ${bar.wm.avg?.toFixed(1)} M-T ${bar.mt.avg?.toFixed(1)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const ranked = rankChain3Results(results as any, settings.targets, PP, 0.25);
writeFileSync(OUT, JSON.stringify({ pp: PP, root: ROOT, ranking: ranked.map((r: any) => r.label), rows: results.map((r: any) => ({
  label: r.label, peak: r.net.after.rippleDb, avg: r.net.after.avgDevDb, phase: r.net.after.phaseDeg,
  pairs: r.net.after.pairPhaseDeg, xo: r.net.after.xoHzPairs, zmin: r.net.after.zMinOhm,
  rs: r.net.audit?.rSourceOhm ?? null, parts: r.parts.length, bom: r.bomTotalEur,
  structure: r.structureLabel, evals: r.net.evaluations, disq: r.disqualified ?? null,
  bar: r._bar,
})) }, null, 1));
console.log(`[pp=${PP} eq=${NEQ}] ranking: ${ranked.map((r: any) => r.label).join(' > ')}`);
