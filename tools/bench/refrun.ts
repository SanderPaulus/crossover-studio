// Reference run: KOAN 3-way fixture through the 3-way chain on a given source tree.
// usage: ROOT=<repo root> MODE=default|legacy|neutral OUT=<file> vite-node refrun.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.env.ROOT!;
const MODE = process.env.MODE ?? 'default';
const OUT = process.env.OUT!;
const lib = (p: string) => join(ROOT, 'src/lib', p);
const { parseFrd } = await import(lib('parsers/frd.ts'));
const { parseZma } = await import(lib('parsers/zma.ts'));
const { logspace, resample, resampleImpedance } = await import(lib('dsp.ts'));
const { runThreeWayChain, rankChain3Results } = await import(lib('threeWayChain.ts'));
const D = join(ROOT, 'src/lib/parsers/fixtures/koan-3way');
const grid = logspace(210, 19000, 240);
const SILENT = -400;
const banded = (name: string) => {
  const p = parseFrd(readFileSync(join(D, name), 'utf8'));
  const g = resample(p.freq, p.spl, p.phase, grid, { clampEdges: true });
  const f0 = p.freq[0], f1 = p.freq[p.freq.length - 1];
  return { freq: grid, spl: g.spl.map((v: number, i: number) => (grid[i] < f0 || grid[i] > f1 ? SILENT : v)), phaseDeg: g.phaseDeg };
};
const w = banded('woofer-pair-hor0.frd'), m = banded('mid-hor0.txt'), t = banded('tweeter-hor0.txt');
const angles = (pre: string, ext: string) => [0, 15, 30, 45, 60].map((a) => ({ hor: a, response: banded(`${pre}${a}${ext}`) }));
const angleData = { woofer: angles('woofer-pair-hor', '.frd'), mid: angles('mid-hor', '.txt'), tweeter: angles('tweeter-hor', '.txt') };
const z = (name: string) => { const zz = parseZma(readFileSync(join(D, name), 'utf8')); return resampleImpedance(zz.freq, zz.magnitude, zz.phase, grid).z; };
const driverZ = { woofer: z('woofers-parallel.zma'), mid: z('mid.zma'), tweeter: z('tweeter.zma') };
const legacy = MODE === 'legacy' || MODE === 'neutral';
const settings: any = {
  phasePriority: 0.5,
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  hpFloorHz: 1849,
  eqBands: 2,
  breakupGuard: true,
  directivityWeight: 0.25,
  ampTarget: 'onAxis',
  phaseMetric: 'band',
  synthMode: 'acoustic',
  catalogSnap: false,
  band: [250, 18000],
  ...(legacy ? { powerMetric: 'legacy', errorSmoothOct: 0 } : {}),
  ...(MODE === 'neutral' ? { diWeight: 0, audit: { thresholds: { rSourceOhm: 0 } } } : {}),
  ...(MODE === 'default' || MODE === 'fix3' || MODE === 'nodiss' ? { diAnchorHz: { low: 1399, high: 3149 }, xoFloorPairs: [200, 1849], rSourceDisqualifyOhm: 2.0 } : {}),
  ...(MODE === 'nodiss' ? { dissipationWeight: 0 } : {}),
};
// Same candidates on both trees: 3 W-M points × M-T held at 2432 (window top), plus 2 M-T points at W-M 435.
const mk = (xoLow: number, xoHigh: number, lr: [number, number], hr: [number, number], label: string) => ({
  grid: [...grid], w, m, t, driverZ, angleData, tAdjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {},
  xoLow, xoHigh, xoLowRange: lr, xoHighRange: hr, judgeWindows: { low: { floorHz: 424, ceilHz: 622 }, high: { floorHz: 1849, ceilHz: 3149 } }, label, settings,
});
// 3 candidates (one chain ≈ 12 min single-threaded): the two W-M corners at
// the window-top M-T, and the low-M-T corner — the region the app's scan lives in.
const cands = [
  mk(424, 2432, [424, 513], [1849, 3149], 'W-M 424 · M-T 2432'),
  mk(622, 2432, [513, 622], [1849, 3149], 'W-M 622 · M-T 2432'),
  mk(514, 1849, [424, 622], [1849, 2121], 'W-M 514 · M-T 1849'),
];
const results: any[] = [];
for (const c of cands) {
  const t0 = Date.now();
  const r = runThreeWayChain(c);
  results.push(r);
  console.log(`${c.label}: peak ${r.net.after.rippleDb.toFixed(3)} avg ${r.net.after.avgDevDb?.toFixed(3)} phase ${r.net.after.phaseDeg.toFixed(2)} pairs ${(r.net.after.pairPhaseDeg ?? []).map((v: number) => v.toFixed(1)).join('/')} xo ${(r.net.after.xoHzPairs ?? []).map((v: number) => Math.round(v)).join('/')} zmin ${(r.net.after.zMinOhm ?? NaN).toFixed(2)} rs ${r.net.audit?.rSourceOhm?.toFixed?.(2)} parts ${r.parts.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const dW = 0.25;
const ranked = MODE === 'neutral' ? rankChain3Results(results, settings.targets, 0.5, dW, 0) : rankChain3Results(results, settings.targets, 0.5, dW);
for (const r of results) console.log('  dq', r.label, r.disqualified, 'floor', r.xoFloorVerdict, 'diss', r.net.after.dissRatio);
writeFileSync(OUT, JSON.stringify({ mode: MODE, root: ROOT, ranking: ranked.map((r: any) => r.label), rows: results.map((r: any) => ({ label: r.label, peak: r.net.after.rippleDb, peakSm: r.net.after.ripplePeakSmoothedDb, avg: r.net.after.avgDevDb, phase: r.net.after.phaseDeg, pairs: r.net.after.pairPhaseDeg, xo: r.net.after.xoHzPairs, zmin: r.net.after.zMinOhm, rs: r.net.audit?.rSourceOhm ?? null, powerStd: r.net.after.powerStdDb, powerFold: r.net.after.powerFoldDb, powerSlope: r.net.after.powerSlopeDbDec, parts: r.parts.length, bom: r.bomTotalEur, structure: r.structureLabel, evals: r.net.evaluations })) }, null, 1));
console.log('ranking', ranked.map((r: any) => r.label).join(' > '));
