/* What Z-minimum does DESIGN + SYNTHESIS hand the tuner, on Sanders data? */
import { readFileSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const lib = (p: string) => `${ROOT}/src/lib/${p}`;
const { parseFrd } = await import(lib('parsers/frd.ts'));
const { parseZma } = await import(lib('parsers/zma.ts'));
const { logspace, resample, resampleImpedance } = await import(lib('dsp.ts'));
const { withSlotAliasesN } = await import(lib('driverSlots.ts'));
const { crossoverToNetlist } = await import(lib('vxpNetwork.ts'));
const { solveNetwork } = await import(lib('network.ts'));
const { designThreeWay } = await import(lib('threeWayDesign.ts'));
const { synthesize } = await import(lib('synthesis.ts'));
const { mergeSynthesizedSchematics } = await import(lib('schematicEdit.ts'));
const { optimizeNetworkValues } = await import(lib('netOptimizer.ts'));
const { branchImpedanceRatios, RATIO_DEGENERATE } = await import(lib('impedanceDiag.ts'));

const proj = JSON.parse(readFileSync(process.env.PROJ!, 'utf8'));
const SILENT = -400, ALIVE = -300;
const starts = ['woofer','mid','tweeter'].map((k)=>parseFrd((proj as any)[k].raw).freq[0]);
const ends = ['woofer','mid','tweeter'].map((k)=>{const f=parseFrd((proj as any)[k].raw).freq; return f[f.length-1];});
const grid = logspace(Math.max(10, Math.min(...starts)), Math.min(20000, Math.max(...ends)), 600);
const band = (raw: string) => {
  const p = parseFrd(raw);
  const r = resample(p.freq, p.spl, p.phase, grid, { clampEdges: true });
  const f0 = p.freq[0], f1 = p.freq[p.freq.length - 1];
  return { freq: grid, spl: r.spl.map((v: number, i: number) => (grid[i] < f0 || grid[i] > f1 ? SILENT : v)), phaseDeg: r.phaseDeg };
};
const zf = (raw: string) => { const z = parseZma(raw); return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z; };
const w = band(proj.woofer.raw), m = band(proj.mid.raw), t = band(proj.tweeter.raw);
const dz = withSlotAliasesN({ woofer: zf(proj.zByRole.low.raw), mid: zf(proj.zByRole.mid.raw), tweeter: zf(proj.zByRole.high.raw) } as any);

const EQ = Number(process.env.EQ ?? '4');
for (const [lo, hi] of [[400, 2100], [455, 2432], [500, 1900]] as [number, number][]) {
  const d: any = designThreeWay({
    w, m, t, tAdjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {},
    xoLow: lo, xoHigh: hi, band: [455, 20000], phasePriority: 0.5,
    xoLowWindow: [lo * 0.85, lo * 1.18], xoHighWindow: [hi * 0.85, hi * 1.18],
    breakupGuard: true, eqBandsPerBranch: EQ,
  } as any);
  const one = (spec: any, resp: any, key: string) => {
    const idx: number[] = [];
    for (let i = 0; i < grid.length; i++) if (resp.spl[i] > ALIVE) idx.push(i);
    return synthesize(spec, idx.map((i) => grid[i]), idx.map((i) => dz[key][i]), {
      mode: 'acoustic', phasePriority: 0.5, catalogSnap: false, corrections: 'lean',
      leanTargetDb: 2.5, label: key, driverSplDb: idx.map((i) => resp.spl[i]),
    } as any);
  };
  const merged = mergeSynthesizedSchematics([
    { components: one(d.specs.woofer, w, 'woofer').components, model: 'woofer' },
    { components: one(d.specs.mid, m, 'mid').components, model: 'mid' },
    { components: one(d.specs.tweeter, t, 'tweeter').components, model: 'tweeter' },
  ]).parts;
  const { netlist } = crossoverToNetlist({ name: 'seed', parts: merged } as any);
  const sol = solveNetwork(netlist, grid, dz);
  let mn = Infinity, at = 0;
  sol.inputZ.forEach((c: any, i: number) => { const v = Math.hypot(c.re, c.im); if (v < mn) { mn = v; at = grid[i]; } });
  const n = merged.filter((p: any) => /Resistor|Inductor|Capacitor/.test(p.type)).length;
  const sGrid = logspace(Math.max(200, Math.min(...starts)), grid[grid.length-1], 240);
  const sb = (raw: string) => { const p2 = parseFrd(raw); const r = resample(p2.freq, p2.spl, p2.phase, sGrid, { clampEdges: true });
    const f0 = p2.freq[0], f1 = p2.freq[p2.freq.length-1];
    return { freq: sGrid, spl: r.spl.map((v: number, i: number) => (sGrid[i] < f0 || sGrid[i] > f1 ? SILENT : v)), phaseDeg: r.phaseDeg }; };
  const sz = (raw: string) => { const z = parseZma(raw); return resampleImpedance(z.freq, z.magnitude, z.phase, sGrid).z; };
  if (!process.env.TUNE) {
    const sw = one(d.specs.woofer, w, 'woofer'), sm = one(d.specs.mid, m, 'mid'), st = one(d.specs.tweeter, t, 'tweeter');
    const dg = [['woofer', sw], ['mid', sm], ['tweeter', st]]
      .filter(([, r]: any) => r.degenerateLoad).map(([k]: any) => k);
    const rats = branchImpedanceRatios(merged, grid, dz, [455, grid[grid.length - 1]]);
    console.log(`     per-tak ratio: ${rats.map((r: any) => `${r.name} ${r.worst.toFixed(3)}@${Math.round(r.worstAtHz)}Hz`).join(' · ')}  | synthese weigerde: ${dg.length ? dg.join(',') : 'niets'} (grens ${RATIO_DEGENERATE})`);
    console.log(`  eq ${EQ}  W-M ${String(lo).padStart(4)} · M-T ${String(hi).padStart(4)}  seed Z min ${mn.toFixed(2).padStart(5)} Ω @ ${String(Math.round(at)).padStart(5)} Hz  (${n} parts)`);
    continue;
  }
  const AMPV = process.env.AMP === '' ? undefined : Number(process.env.AMP ?? '3');
  const o: any = { midBranch: { response: m, adjust: {} }, phasePriority: 0.5, breakupGuard: true,
    band: [455, grid[grid.length-1]], staged: { rippleDb: 2.5, phaseDeg: 15 }, phaseMetric: 'band',
    catalogSnap: false, zFloorStrict: true, audit: { enabled: false },
    safety: { freqs: sGrid, w: sb(proj.woofer.raw), t: sb(proj.tweeter.raw), m: sb(proj.mid.raw),
      z: withSlotAliasesN({ woofer: sz(proj.zByRole.low.raw), mid: sz(proj.zByRole.mid.raw), tweeter: sz(proj.zByRole.high.raw) } as any) } };
  if (AMPV !== undefined) o.ampMinLoadOhm = AMPV;
  const r: any = optimizeNetworkValues(merged, grid, w, t, dz, { offsetMm: 0, trimDb: 0, inverted: false }, o);
  const { netlist: n2 } = crossoverToNetlist({ name: 'tuned', parts: r.parts } as any);
  const s2 = solveNetwork(n2, grid, dz);
  let m2 = Infinity; s2.inputZ.forEach((c: any) => { const v = Math.hypot(c.re, c.im); if (v < m2) m2 = v; });
  console.log(`  W-M ${String(lo).padStart(4)} · M-T ${String(hi).padStart(4)}  seed ${mn.toFixed(2).padStart(5)} Ω  →  TUNED ${m2.toFixed(2).padStart(5)} Ω  · repair ${String(r.ampFloorRepair ?? '-').padEnd(7)} · tuned ${r.tuned} · peak ${r.after.rippleDb.toFixed(2)} (${n} parts)`);
}
