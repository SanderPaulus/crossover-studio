import { readFileSync } from 'node:fs';
const ROOT = process.env.ROOT!;
const lib = (p: string) => `${ROOT}/src/lib/${p}`;
const { parseFrd } = await import(lib('parsers/frd.ts'));
const { parseZma } = await import(lib('parsers/zma.ts'));
const { logspace, resample, resampleImpedance } = await import(lib('dsp.ts'));
const { withSlotAliasesN } = await import(lib('driverSlots.ts'));
const { auditNetwork } = await import(lib('partAudit.ts'));
const { busPositions } = await import(lib('netOptimizer.ts'));
const proj = JSON.parse(readFileSync(process.env.PROJ!, 'utf8'));
const SILENT = -400;
const starts = ['woofer','mid','tweeter'].map((k) => parseFrd((proj as any)[k].raw).freq[0]);
const ends = ['woofer','mid','tweeter'].map((k) => { const f = parseFrd((proj as any)[k].raw).freq; return f[f.length-1]; });
const grid = logspace(Math.max(20, Math.min(...starts)), Math.min(20000, Math.max(...ends)), 400);
const band = (raw: string) => { const p = parseFrd(raw); const r = resample(p.freq, p.spl, p.phase, grid, { clampEdges: true });
  const f0 = p.freq[0], f1 = p.freq[p.freq.length-1];
  return { freq: grid, spl: r.spl.map((v: number, i: number) => (grid[i] < f0 || grid[i] > f1 ? SILENT : v)), phaseDeg: r.phaseDeg }; };
const zf = (raw: string) => { const z = parseZma(raw); return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z; };
const dz = withSlotAliasesN({ woofer: zf(proj.zByRole.low.raw), mid: zf(proj.zByRole.mid.raw), tweeter: zf(proj.zByRole.high.raw) } as any);
const d = proj.design.networkDesigns.find((x: any) => x.id === 'working');
const pos = busPositions(d.parts);
const a: any = auditNetwork(d.parts, { grid, wBase: band(proj.woofer.raw), tBase: band(proj.tweeter.raw),
  midBase: band(proj.mid.raw), driverZ: dz, adjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {} } as any);
if (!a) { console.log('audit gaf niets'); } else {
  const val = (p: any) => { const q = p.params.find((x: any) => ['R','L','C'].includes(x.name)); return q ? `${q.value} ${q.unit}` : '?'; };
  const byId = new Map(d.parts.filter((p: any) => p.partId).map((p: any) => [p.partId, p]));
  console.log(`${'part'.padEnd(8)} ${'waarde'.padEnd(11)} ${'pad'.padEnd(7)} ${'dSPL'.padStart(6)} ${'dφ'.padStart(6)} ${'€'.padStart(7)}  oordeel`);
  for (const e of a.entries) {
    if (e.ids.length !== 1) continue;
    const p: any = byId.get(e.ids[0]);
    console.log(`${String(e.ids[0]).padEnd(8)} ${(p?val(p):'').padEnd(11)} ${String(pos(e.ids[0])).padEnd(7)} ${e.dA.toFixed(2).padStart(6)} ${e.dP.toFixed(1).padStart(6)} ${(e.costEur!=null?'€'+e.costEur.toFixed(2):'—').padStart(7)}  ${e.verdict}`);
  }
  const inert = a.entries.filter((e: any) => e.ids.length === 1 && e.verdict === 'inert');
  const eur = inert.reduce((s: number, e: any) => s + (e.costEur ?? 0), 0);
  console.log(`\nINERT: ${inert.length} onderdelen, samen €${eur.toFixed(2)} — ${inert.map((e: any) => e.ids[0]).join(', ')}`);
}
