/**
 * Wat kiest de STRUCTUURZOEKER, en wat kost dat aan impedantie?
 *
 * `designThreeWay` enumereert alignment × alignment × twee polariteiten en
 * kiest op de akoestische som. Niets in die trap kent impedantie. Dit script
 * dwingt elk alignment-paar af, synthetiseert, mergt en meet de geassembleerde
 * Zmin — zodat zichtbaar wordt of een structuur binnen een kleine marge van de
 * beste een wezenlijk gezondere last levert.
 *
 * Draait op de DUMP van de meetlat, niet op een eigen configuratie:
 *   ROOT="$PWD" DUMPINPUT=/tmp/c0.json ONLY=0 npx tsx tools/bench/bench.mts
 *   ROOT="$PWD" IN=/tmp/c0.json npx tsx tools/bench/structz.mts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.env.ROOT ?? process.cwd();
const lib = (p: string) => join(ROOT, 'src/lib', p);
const { designThreeWay } = await import(lib('threeWayDesign.ts'));
const { synthesize } = await import(lib('synthesis.ts'));
const { mergeSynthesizedSchematics } = await import(lib('schematicEdit.ts'));
const { crossoverToNetlist } = await import(lib('vxpNetwork.ts'));
const { solveNetwork } = await import(lib('network.ts'));
const { setCustomSeries } = await import(lib('catalog.ts'));
const { deserializeCatalog } = await import(lib('catalogFile.ts'));
if (process.env.CAT) {
  let text = readFileSync(process.env.CAT, 'utf8');
  try { const o = JSON.parse(text); if (o && typeof o.catalog === 'string') text = o.catalog; } catch { /* al een catalogusbestand */ }
  const c = deserializeCatalog(text);
  setCustomSeries(c.series, c.parts ?? []);
}
/** De snap staat AAN zoals in de keten, tenzij expliciet uitgezet. */
const SNAP = process.env.SNAP !== '0';

const inp = JSON.parse(readFileSync(process.env.IN!, 'utf8'));
const { grid, w, m, t, driverZ, tAdjust, midAdjust, xoLow, xoHigh, settings: s } = inp;
const ALIVE = -300;

const KINDS = [
  { kind: 'LR', order: 2 }, { kind: 'LR', order: 4 },
  { kind: 'BW', order: 3 }, { kind: 'BS', order: 4 },
] as const;

const synthOne = (spec: any, resp: any, key: string) => {
  const idx: number[] = [];
  for (let i = 0; i < grid.length; i++) if (resp.spl[i] > ALIVE) idx.push(i);
  return synthesize(spec, idx.map((i: number) => grid[i]), idx.map((i: number) => driverZ[key][i]), {
    mode: s.synthMode, phasePriority: s.phasePriority, catalogSnap: SNAP && s.catalogSnap,
    corrections: (s.targets ? 'lean' : 'auto'), leanTargetDb: s.targets?.rippleDb, label: key,
    ...(s.synthMode === 'acoustic' ? { driverSplDb: idx.map((i: number) => resp.spl[i]) } : {}),
  } as any);
};

const rows: any[] = [];
for (const lo of KINDS) {
  for (const hi of KINDS) {
    let d: any;
    try {
      d = designThreeWay({
        w, m, t, tAdjust, midAdjust, xoLow, xoHigh,
        band: s.band, phasePriority: s.phasePriority,
        xoLowWindow: inp.xoLowRange, xoHighWindow: inp.xoHighRange,
        breakupGuard: s.breakupGuard, eqBandsPerBranch: s.eqBands,
        hpFloorHz: s.hpFloorHz, diAnchorHz: s.diAnchorHz, diWeight: s.diWeight,
        structureLow: lo, structureHigh: hi,
      } as any);
    } catch (e) { rows.push({ lo, hi, err: String(e).slice(0, 60) }); continue; }
    let zmin = NaN, atHz = 0, parts = 0;
    try {
      const merged = mergeSynthesizedSchematics([
        { components: synthOne(d.specs.woofer, w, 'woofer').components, model: 'woofer' },
        { components: synthOne(d.specs.mid, m, 'mid').components, model: 'mid' },
        { components: synthOne(d.specs.tweeter, t, 'tweeter').components, model: 'tweeter' },
      ]).parts;
      parts = merged.filter((p: any) => /Resistor|Inductor|Capacitor/.test(p.type)).length;
      const { netlist } = crossoverToNetlist({ name: 'x', parts: merged } as any);
      const sol = solveNetwork(netlist, grid, driverZ);
      let mn = Infinity;
      sol.inputZ.forEach((c: any, i: number) => { const v = Math.hypot(c.re, c.im); if (v < mn) { mn = v; atHz = grid[i]; } });
      zmin = mn;
    } catch (e) { rows.push({ lo, hi, fx: d.fx, err: String(e).slice(0, 60) }); continue; }
    rows.push({ lo, hi, fx: d.fx, zmin, atHz, parts, xo: [d.xoLow, d.xoHigh], inv: [d.midInverted, d.tweeterInverted] });
    if (process.env.DISSECT && `${lo.kind}${lo.order}/${hi.kind}${hi.order}` === process.env.DISSECT) {
      // Per tak, op het VOLLE grid, de impedantie op de frequentie waar de
      // geassembleerde last instort — plus de parallelsom als controle.
      const per = ['woofer', 'mid', 'tweeter'].map((k) => {
        const r = k === 'woofer' ? synthOne(d.specs.woofer, w, 'woofer')
          : k === 'mid' ? synthOne(d.specs.mid, m, 'mid') : synthOne(d.specs.tweeter, t, 'tweeter');
        const one = mergeSynthesizedSchematics([{ components: r.components, model: k }]).parts;
        const { netlist } = crossoverToNetlist({ name: k, parts: one } as any);
        const sol = solveNetwork(netlist, grid, driverZ);
        let bi = 0;
        for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - atHz) < Math.abs(grid[bi] - atHz)) bi = i;
        const c = sol.inputZ[bi];
        let mn = Infinity, mnAt = 0;
        sol.inputZ.forEach((cc: any, i: number) => { const v = Math.hypot(cc.re, cc.im); if (v < mn) { mn = v; mnAt = grid[i]; } });
        return { k, re: c.re, im: c.im, mag: Math.hypot(c.re, c.im), mn, mnAt };
      });
      console.log(`\nDISSECTIE ${process.env.DISSECT} — geassembleerde dip ${zmin.toFixed(2)} Ω @ ${Math.round(atHz)} Hz`);
      let yre = 0, yim = 0;
      for (const p2 of per) {
        const d2 = p2.re * p2.re + p2.im * p2.im;
        yre += p2.re / d2; yim += -p2.im / d2;
        console.log(`  ${p2.k.padEnd(8)} |Z| @dip ${p2.mag.toFixed(2).padStart(7)} Ω  (${p2.re.toFixed(2)} ${p2.im >= 0 ? '+' : '-'} j${Math.abs(p2.im).toFixed(2)})   eigen minimum ${p2.mn.toFixed(2)} @ ${Math.round(p2.mnAt)} Hz`);
      }
      console.log(`  parallelsom van die drie: ${(1 / Math.hypot(yre, yim)).toFixed(2)} Ω  (controle op ${zmin.toFixed(2)})`);
    }
  }
}
const ok = rows.filter((r) => Number.isFinite(r.fx));
const bestFx = Math.min(...ok.map((r) => r.fx));
ok.sort((a, b) => a.fx - b.fx);
console.log(`${'structuur'.padEnd(16)} ${'fx'.padStart(8)} ${'%boven'.padStart(7)} ${'Zmin'.padStart(7)} ${'@Hz'.padStart(6)} ${'parts'.padStart(5)}  kruisingen`);
console.log('─'.repeat(78));
for (const r of ok) {
  const name = `${r.lo.kind}${r.lo.order}/${r.hi.kind}${r.hi.order}`;
  const over = ((r.fx / bestFx - 1) * 100).toFixed(1);
  console.log(`${name.padEnd(16)} ${r.fx.toFixed(4).padStart(8)} ${over.padStart(6)}% ${r.zmin.toFixed(2).padStart(7)} ${String(Math.round(r.atHz)).padStart(6)} ${String(r.parts).padStart(5)}  ${r.xo.map((x: number) => Math.round(x)).join('/')}`);
}
for (const r of rows.filter((x) => x.err)) console.log(`${r.lo.kind}${r.lo.order}/${r.hi.kind}${r.hi.order}: ${r.err}`);
