import { readFileSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const lib = (p: string) => `${ROOT}/src/lib/${p}`;
const { parseFrd } = await import(lib('parsers/frd.ts'));
const { parseZma } = await import(lib('parsers/zma.ts'));
const { logspace, resample, resampleImpedance, applyTransfer, combineN } = await import(lib('dsp.ts'));
const { withSlotAliasesN, pickSlotsN } = await import(lib('driverSlots.ts'));
const { crossoverToNetlist } = await import(lib('vxpNetwork.ts'));
const { solveNetwork } = await import(lib('network.ts'));
const proj = JSON.parse(readFileSync(process.env.PROJ!, 'utf8'));
const SILENT = -400;
const starts = ['woofer','mid','tweeter'].map((k) => parseFrd((proj as any)[k].raw).freq[0]);
const ends = ['woofer','mid','tweeter'].map((k) => { const f = parseFrd((proj as any)[k].raw).freq; return f[f.length-1]; });
const grid = logspace(Math.max(20, Math.min(...starts)), Math.min(20000, Math.max(...ends)), 900);
const band = (raw: string) => { const p = parseFrd(raw); const r = resample(p.freq, p.spl, p.phase, grid, { clampEdges: true });
  const f0 = p.freq[0], f1 = p.freq[p.freq.length-1];
  return { freq: grid, spl: r.spl.map((v: number, i: number) => (grid[i] < f0 || grid[i] > f1 ? SILENT : v)), phaseDeg: r.phaseDeg }; };
const zf = (raw: string) => { const z = parseZma(raw); return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z; };
const base: any = { woofer: band(proj.woofer.raw), mid: band(proj.mid.raw), tweeter: band(proj.tweeter.raw) };
const dz = withSlotAliasesN({ woofer: zf(proj.zByRole.low.raw), mid: zf(proj.zByRole.mid.raw), tweeter: zf(proj.zByRole.high.raw) } as any);
const wrap = (x: number) => { let y = x; while (y > 180) y -= 360; while (y < -180) y += 360; return y; };
const at = (hz: number) => { let b = 0; for (let i = 0; i < grid.length; i++) if (Math.abs(Math.log(grid[i]/hz)) < Math.abs(Math.log(grid[b]/hz))) b = i; return b; };
for (const d of proj.design.networkDesigns) {
  if (!['working', 'dmt61q1vb254'].includes(d.id)) continue;
  const { netlist } = crossoverToNetlist({ name: d.name, parts: d.parts } as any);
  const sol = solveNetwork(netlist, grid, dz);
  const slots = pickSlotsN(sol.drivers);
  const br: any = {};
  for (const [role, drv] of [['woofer', slots.woofer], ['mid', slots.mid], ['tweeter', slots.tweeter]] as any[])
    if (drv) br[role] = applyTransfer(base[role], sol.transfers[drv.id]);
  const sum = combineN([{ response: br.woofer }, { response: br.mid }, { response: br.tweeter }]);
  const inb = grid.map((f: number, i: number) => (f >= 455 && f <= 16000 ? sum.combinedSpl[i] : NaN)).filter((x: number) => !Number.isNaN(x));
  const med = [...inb].sort((a: number, b: number) => a - b)[Math.floor(inb.length/2)];
  let worst = { i: -1, dd: 0 };
  for (let i = 0; i < grid.length; i++) { if (grid[i] < 455 || grid[i] > 16000) continue;
    const dd = med - sum.combinedSpl[i]; if (dd > worst.dd) worst = { i, dd }; }
  console.log(`${d.name.padEnd(15)} mediaan ${med.toFixed(1)} dB · DIEPSTE INZINKING ${worst.dd.toFixed(1)} dB @ ${Math.round(grid[worst.i])} Hz`);
  for (const hz of [1200, 1500, 1775, 2000, 2500]) { const i = at(hz);
    console.log(`${''.padEnd(15)} ${String(Math.round(grid[i])).padStart(5)} Hz  som ${sum.combinedSpl[i].toFixed(1)}  (w ${br.woofer.spl[i].toFixed(0)} m ${br.mid.spl[i].toFixed(1)} t ${br.tweeter.spl[i].toFixed(1)})  M-T Δφ ${wrap(br.tweeter.phaseDeg[i]-br.mid.phaseDeg[i]).toFixed(0)}°`); }
}
