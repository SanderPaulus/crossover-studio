import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { parseZma } from './parsers/zma.ts';
import { logspace, resample, resampleImpedance, type GriddedResponse } from './dsp.ts';
import { optimizeNetworkValues } from './netOptimizer.ts';
import { crossoverToNetlist } from './vxpNetwork.ts';
import type { VxpPart } from './parsers/vxp.ts';
import type { Complex } from './complex.ts';

/**
 * WHY THE SAFETY GATE REJECTED, AS A VALUE.
 *
 * Sanders scan showed "⚠Z" on five of five candidates while his amplifier
 * limit was 0.1 ohm — so the impedance arm could not have fired, and the
 * glyph was pointing at the wrong panel. The cause: `zOk` is
 * `!safetyNote && the repair did not fail`, and the gate rejects on four
 * different physical failures. One boolean, four meanings, one label.
 *
 * `safetyKinds` fixes that by recording the category WHERE THE DECISION IS
 * MADE. This pins the two properties that matter:
 *   - a rejected tune says WHICH failure, not a default one;
 *   - a rejected tune returns the SEED, so its numbers are the seed's.
 */
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'parsers', 'fixtures');
const grid = logspace(300, 18000, 160);

function frd(name: string): GriddedResponse {
  const p = parseFrd(readFileSync(join(FIXTURES, name), 'utf-8'));
  return resample(p.freq, p.spl, p.phase, grid);
}
function zma(name: string): Complex[] {
  const z = parseZma(readFileSync(join(FIXTURES, name), 'utf-8'));
  return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z;
}
const w = frd('mid_hor0_mettape.txt');
const t = frd('tweet_hor0_mettape.txt');
const driverZ: Record<string, Complex[]> = { mid: zma('mid_Backwavecone_sheep75gram.ZMA'), tweeter: zma('tweeter.ZMA') };
const NO_ADJ = { offsetMm: 0, trimDb: 0, inverted: false };

/** A two-branch net whose values the tuner may move. */
const net = (): VxpPart[] => [
  { type: 'Generator', partId: 'G', params: [], wires: [{ x: 0, y: 0 }, { x: 0, y: 6 }] },
  { type: 'Ground', params: [], wires: [{ x: 0, y: 6 }] },
  { type: 'Inductor', partId: 'L1', params: [{ name: 'L', value: 0.8, unit: 'mH' }], wires: [{ x: 0, y: 0 }, { x: 6, y: 0 }] },
  { type: 'Driver', partId: 'D', model: 'mid', inverted: false, params: [], wires: [{ x: 6, y: 0 }, { x: 6, y: 6 }] },
  { type: 'Ground', params: [], wires: [{ x: 6, y: 6 }] },
  { type: 'Capacitor', partId: 'C1', params: [{ name: 'C', value: 4.7, unit: 'µF' }], wires: [{ x: 0, y: 0 }, { x: 12, y: 0 }] },
  { type: 'Driver', partId: 'D2', model: 'tweeter', inverted: false, params: [], wires: [{ x: 12, y: 0 }, { x: 12, y: 6 }] },
  { type: 'Ground', params: [], wires: [{ x: 12, y: 6 }] },
];

describe('safety-gate rejection reports its category, not a default one', () => {
  it('an accepted tune reports no kinds at all', () => {
    const r = optimizeNetworkValues(net(), grid, w, t, driverZ, NO_ADJ, {
      phasePriority: 0.4,
      audit: { enabled: false as const },
    });
    // No safety data supplied -> the gate cannot run -> nothing to report.
    expect(r.safetyKinds ?? []).toEqual([]);
    expect(r.safetyNote).toBeUndefined();
  });

  it('a rejected tune names the failure AND returns the seed untouched', () => {
    /* The gate compares the tuned result against the seed on the FULL band.
     * Feeding it a safety band the evaluation band cannot see is exactly the
     * situation it exists for; whether it fires depends on the data, so the
     * test asserts the INVARIANT rather than a particular failure: if it
     * rejected, it says which kind, and what comes back is the seed. */
    const seed = net();
    const sGrid = logspace(200, 19000, 200);
    const sFrd = (name: string) => {
      const p = parseFrd(readFileSync(join(FIXTURES, name), 'utf-8'));
      return resample(p.freq, p.spl, p.phase, sGrid);
    };
    const sZ = (name: string) => {
      const z = parseZma(readFileSync(join(FIXTURES, name), 'utf-8'));
      return resampleImpedance(z.freq, z.magnitude, z.phase, sGrid).z;
    };
    const r = optimizeNetworkValues(seed, grid, w, t, driverZ, NO_ADJ, {
      phasePriority: 0.4,
      band: [1000, 4000], // a deliberately narrow design scope
      safety: { freqs: sGrid, w: sFrd('mid_hor0_mettape.txt'), t: sFrd('tweet_hor0_mettape.txt'), z: { mid: sZ('mid_Backwavecone_sheep75gram.ZMA'), tweeter: sZ('tweeter.ZMA') } },
      audit: { enabled: false as const },
    });
    if (r.safetyNote) {
      const kinds = r.safetyKinds ?? [];
      // THE POINT: a rejection is never reported without its category.
      expect(kinds.length).toBeGreaterThan(0);
      for (const k of kinds) expect(['crossing', 'valley', 'protection', 'load']).toContain(k);
      // And the numbers handed back are the SEED's — `after` equals `before`,
      // nothing was tuned. Anyone showing them owes the reader that.
      expect(r.tuned).toBe(0);
      expect(r.after.rippleDb).toBe(r.before.rippleDb);
      const same = (a: readonly VxpPart[], b: readonly VxpPart[]) =>
        JSON.stringify(crossoverToNetlist({ name: 'x', parts: [...a] }).netlist) ===
        JSON.stringify(crossoverToNetlist({ name: 'x', parts: [...b] }).netlist);
      expect(same(r.parts, seed)).toBe(true);
    } else {
      // Not rejected on this data — then there must be no category either.
      expect(r.safetyKinds ?? []).toEqual([]);
    }
  });

  it('the four categories are the four the gate can decide', () => {
    /* A guard against the shape that caused this: one boolean standing in for
     * several failures. If a fifth reason is ever added to the gate it needs a
     * fifth kind, or it inherits somebody else's label again. */
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'netOptimizer.ts'), 'utf-8');
    const pushes = [...src.matchAll(/kinds\.push\('(\w+)'\)/g)].map((m) => m[1]);
    expect(new Set(pushes)).toEqual(new Set(['crossing', 'valley', 'protection', 'load']));
    // Only the gate's own list — `e.reasons.push(...)` in the part audit is a
    // different array with a different meaning.
    const reasonPushes = (src.match(/(^|[^.\w])reasons\.push\(/gm) ?? []).length;
    expect(pushes.length).toBe(reasonPushes);
  });
});
