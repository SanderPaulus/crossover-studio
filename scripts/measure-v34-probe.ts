/**
 * V34 — WHERE THE SOURCE-RESISTANCE PROBE LANDS, ON EVERY GRID THIS APP HOLDS.
 *
 * `npx vite-node scripts/measure-v34-probe.ts` — seconds, no chain run.
 *
 * THE QUESTION. `sourceResistanceOhm` reports the Thevenin resistance the
 * lowest driver sees at its box tuning; without a stated tuning it takes that
 * driver's impedance PEAK over the bottom of whatever grid it was handed. That
 * number feeds a hard disqualification, a search constraint, a structure-move
 * guard, an audit tier and one objective term — and until V34 nothing printed
 * the FREQUENCY beside it, so nobody could see that on casus 1 it was being
 * read at 640.2 Hz, the top of the probe's own search window, with the woofer
 * pair's real peaks at 17 and 51 Hz.
 *
 * WHAT IT PRINTS. Per grid — the chain's analysis grid, the tuner's full-band
 * safety grid, and the gate's own measured-sweep reference — where the probe
 * lands per driver, whether each edge rule accepts it, and then the source
 * resistance of every frozen netlist read on all three plus its DC limit.
 *
 * IT IS THE EVIDENCE UNDER CASEBOOK V34 and it stays runnable for the same
 * reason `compare-corpora.ts` takes arguments: a measurement quoted in prose
 * that nobody can repeat is a paragraph, not a measurement.
 * `frozenNetlistGates.test.ts` asserts the CLAIMS this table supports; this
 * script is what lets a reader see the numbers they were drawn from.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  casus1Files,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { casus1ChainInput } from '../src/lib/engine2/casus1V2.fixture.ts';
import {
  sourceProbeIndex,
  sourceResistanceOhm,
  seriesPathResistanceOhm,
  SOURCE_PROBE_WINDOW_TOP_HZ,
} from '../src/lib/partAudit.ts';
import { impedanceReferenceFrom } from '../src/lib/engine2/optimizer/impedanceReference.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import type { Complex } from '../src/lib/complex.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const ci = casus1ChainInput(manifest, files, golden);

type ZMap = Record<string, readonly Complex[]>;

function show(name: string, grid: readonly number[], z: ZMap): void {
  const stop = Math.max(SOURCE_PROBE_WINDOW_TOP_HZ, grid[Math.floor(grid.length / 4)]);
  let last = -1;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > stop) break;
    last = i;
  }
  console.log(
    `\n=== ${name}: ${grid.length} punten, ${grid[0].toFixed(2)}–${grid[grid.length - 1].toFixed(0)} Hz` +
      `\n    zoekvenster: stop = ${stop.toFixed(1)} Hz → indices 0..${last} ` +
      `(${grid[0].toFixed(2)}..${grid[last].toFixed(1)} Hz)`,
  );
  for (const d of Object.keys(z).sort()) {
    const first = sourceProbeIndex(grid, z[d], undefined, 'first');
    const both = sourceProbeIndex(grid, z[d], undefined, 'both');
    if (!first) {
      console.log(`  ${d}: geen probe`);
      continue;
    }
    const mag = Math.hypot(z[d][first.idx].re, z[d][first.idx].im);
    const edge = first.idx === 0 ? ' ← ONDERRAND' : first.idx === last ? ' ← BOVENRAND' : '';
    console.log(
      `  ${d.padEnd(8)} idx ${String(first.idx).padStart(4)}  ${grid[first.idx].toFixed(1).padStart(8)} Hz  ` +
        `|Z| ${mag.toFixed(2).padStart(6)} Ω   first=${String(first.inBand).padEnd(5)} ` +
        `both=${String(both!.inBand).padEnd(5)}${edge}`,
    );
  }
}

show('KETENRASTER (CASUS1_V2_GRID)', ci.grid, ci.driverZ);
show('VEILIGHEIDSRASTER (safety.freqs)', ci.safety.freqs, ci.safety.z);

const sweeps: Record<
  string,
  { grid: number[]; magnitude: number[]; phaseDeg: number[]; validHz: [number, number] }
> = {};
for (const e of manifest.entries) {
  if (e.kind !== 'Z') continue;
  const f = files.find((x) => x.entry.file === e.file);
  if (!f?.impedance) continue;
  const g = f.impedance.freq;
  sweeps[e.driver] = {
    grid: [...g],
    magnitude: [...f.impedance.magnitude],
    phaseDeg: [...f.impedance.phaseDeg],
    validHz: [g[0], g[g.length - 1]],
  };
}
const ref = impedanceReferenceFrom(sweeps);
if (ref) show('POORTRASTER (impedanceReferenceFrom)', ref.grid, ref.driverZ);

/* ---- per bevroren netlist, en de DC-limiet ernaast ---------------------- *
 *
 * De DC-limiet is de ondergrens: hij mag veroordelen maar nooit vrijpleiten.
 * Waar het ketenraster hem exact reproduceert is dat GEEN toeval — daar is de
 * probe geweigerd en is er dus niets gemeten. */
console.log('\n=== R_source per bevroren netlist, per raster (strikte randregel) ===');
console.log(
  `${'naam'.padEnd(18)}${'keten'.padStart(10)}${'veiligheid'.padStart(12)}` +
    `${'sweep'.padStart(10)}${'DC-limiet'.padStart(12)}`,
);
const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;
let worstGap = { key: '', gap: 0 };
for (const [key, rel] of Object.entries(netlists)) {
  const parts = deserializeFilter(readFileSync(join(CASUS1_DIR, rel), 'utf-8')).parts;
  const rd = (grid: readonly number[], z: ZMap) =>
    sourceResistanceOhm(parts, { grid, driverZ: z, edgeRule: 'both' });
  const a = rd(ci.grid, ci.driverZ);
  const b = rd(ci.safety.freqs, ci.safety.z);
  const c = ref ? rd(ref.grid, ref.driverZ) : null;
  const dc = seriesPathResistanceOhm(parts);
  if (b !== null && c !== null && Math.abs(b - c) > worstGap.gap) {
    worstGap = { key, gap: Math.abs(b - c) };
  }
  const f = (x: number | null) => (x === null ? '—' : x.toFixed(3));
  console.log(
    `${key.padEnd(18)}${f(a).padStart(10)}${f(b).padStart(12)}${f(c).padStart(10)}${f(dc).padStart(12)}`,
  );
}
console.log(
  `\ngrootste verschil veiligheidsraster ↔ poortraster: ` +
    `${worstGap.gap.toFixed(4)} Ω bij ${worstGap.key}`,
);
