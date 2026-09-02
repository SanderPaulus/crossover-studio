/**
 * UI-2 — EVERY EDITOR MUTATION EITHER RE-SIMULATES OR SAYS WHY NOT.
 *
 * Two halves.
 *
 * THE MUTATION TABLE. Every operation the schematic editor offers (draw a
 * wire, delete a wire, add / delete / rotate a component, change a value,
 * place a generator or a ground, undo, redo, load a shortlist row) is applied
 * to the loaded shortlist design of casus 1 (`KAND-V2-1`), and for each the
 * test holds two things: that the mutation produces a DIFFERENT part list
 * (which is what fires the sim memo in `App.tsx` — the sim is a memo on the
 * schematic, so a mutation that changes the parts re-simulates by
 * construction) and what `assessNetwork` says about the result. That second
 * column is the deliverable: until UI-2, "simulable, woofer silent" and
 * "simulable, wire connects nothing" were both printed as nothing at all.
 *
 * THE CASE, measured. Sander's two actions on the live site — remove the
 * series resistor before the woofer, then draw a wire — reproduced on casus
 * 1's own impedances with the solver the app uses. (b) turned out to be a
 * wire one grid row beside the gap: the netlist is byte-identical to the one
 * before it, so the sim correctly did nothing, and nothing could say so.
 *
 * Reads from disk (the casus 1 fixtures), so it lives in a test only.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserializeFilter } from './filterFile.ts';
import { solveNetwork } from './network.ts';
import { validateNetlist } from './netlistEdit.ts';
import { addPart, addWire, deletePart, rotatePart, setPartParam, setPartProps } from './schematicEdit.ts';
import { logspace, resampleImpedance } from './dsp.ts';
import type { VxpPart } from './parsers/vxp.ts';
import { assessNetwork, NETWORK_READINESS_VERSION, type NetworkReadiness } from './networkReadiness.ts';
import {
  CASUS1_DIR,
  casus1Files,
  casus1FilterFromParts,
  casus1Manifest,
} from './engine2/casus1.fixture.ts';

const manifest = casus1Manifest();
const files = casus1Files(manifest);
const loadParts = (file: string): VxpPart[] =>
  deserializeFilter(readFileSync(join(CASUS1_DIR, file), 'utf-8')).parts;

/** The shortlist's first row, as the Working tab would hold it. */
const K1 = loadParts('KAND-V2-1.adsfilter.json');
const K2 = loadParts('KAND-V2-2.adsfilter.json');
const MODELS = Object.keys(casus1FilterFromParts('k1', K1, manifest, files).driverZ);

/** Where the series resistor before the woofer sits, read from the file and
 *  not typed: the part whose id is R5, between the bus at (17,6) and (24,6). */
const R5 = K1.findIndex((p) => p.partId === 'R5');
const GAP_A = { x: K1[R5].wires[0].x, y: K1[R5].wires[0].y };
const GAP_B = { x: K1[R5].wires[K1[R5].wires.length - 1].x, y: K1[R5].wires[K1[R5].wires.length - 1].y };
const GEN = K1.findIndex((p) => p.type === 'Generator');
const WOOFER = K1.findIndex((p) => p.type === 'Driver' && p.model === 'woofer');
const MID_FEED = K1.findIndex(
  (p) => p.type === 'Wire' && p.wires.length === 4 && p.wires[3].y === K1.find((q) => q.model === 'mid')!.wires[0].y,
);
/** A grid spot nothing occupies, found rather than assumed. */
const FREE = (() => {
  const taken = new Set(K1.flatMap((p) => p.wires.map((w) => `${w.x},${w.y}`)));
  for (let y = 60; y < 80; y++) for (let x = 2; x < 40; x++) {
    if (![0, 1, 2, 3, 4, 5, 6, 7].some((d) => taken.has(`${x + d},${y}`) || taken.has(`${x},${y + d}`))) return { x, y };
  }
  throw new Error('no free grid spot');
})();

const serial = (p: readonly VxpPart[]) => JSON.stringify(p);
const codes = (r: NetworkReadiness) => r.defects.map((d) => d.code).sort();

interface Row {
  op: string;
  /** The state the mutation starts from (default: the loaded design). */
  from?: VxpPart[];
  mutate: (parts: VxpPart[]) => VxpPart[];
  expect: { kind: 'simulable' | 'refused'; cause?: string; codes: string[] };
}

const NO_R5 = deletePart(K1, R5);

const TABLE: Row[] = [
  { op: 'draw a wire that bridges the gap (after R5 is gone)', from: NO_R5, mutate: (p) => addWire(p, GAP_A, GAP_B), expect: { kind: 'simulable', codes: [] } },
  { op: 'draw a wire across a component (R5 still there)', mutate: (p) => addWire(p, GAP_A, GAP_B), expect: { kind: 'simulable', codes: ['shorted-part'] } },
  {
    op: 'draw a wire one row beside the gap (the live case)',
    from: NO_R5,
    mutate: (p) => addWire(p, { x: GAP_A.x, y: GAP_A.y + 1 }, { x: GAP_B.x, y: GAP_B.y + 1 }),
    expect: { kind: 'simulable', codes: ['dangling-wire', 'undriven-driver', 'undriven-part'] },
  },
  {
    op: 'draw a wire that reaches one terminal only',
    from: NO_R5,
    mutate: (p) => addWire(p, GAP_A, { x: GAP_B.x - 1, y: GAP_B.y }),
    expect: { kind: 'simulable', codes: ['undriven-driver', 'undriven-part'] },
  },
  { op: 'delete a wire (the feed to the mid branch)', mutate: (p) => deletePart(p, MID_FEED), expect: { kind: 'simulable', codes: Array(8).fill('undriven-part').concat(['undriven-driver']).sort() } },
  { op: 'add a component (lands unconnected)', mutate: (p) => addPart(p, 'Resistor', FREE), expect: { kind: 'simulable', codes: ['undriven-part'] } },
  { op: 'delete a component (R5 before the woofer)', mutate: (p) => deletePart(p, R5), expect: { kind: 'simulable', codes: ['undriven-driver', 'undriven-part'] } },
  { op: 'change a value', mutate: (p) => setPartParam(p, R5, 'R', 2, 'Ω'), expect: { kind: 'simulable', codes: [] } },
  { op: 'change a value to zero', mutate: (p) => setPartParam(p, R5, 'R', 0, 'Ω'), expect: { kind: 'refused', cause: 'invalid-value', codes: [] } },
  { op: 'rotate a component (R5, around its first terminal)', mutate: (p) => rotatePart(p, R5), expect: { kind: 'simulable', codes: ['undriven-driver', 'undriven-part'] } },
  { op: 'invert a driver', mutate: (p) => setPartProps(p, WOOFER, { inverted: true }), expect: { kind: 'simulable', codes: [] } },
  { op: 'place a generator (a second one, unconnected)', mutate: (p) => addPart(p, 'Generator', FREE), expect: { kind: 'simulable', codes: ['extra-generator'] } },
  { op: 'delete the generator (its ground symbol is left hanging)', mutate: (p) => deletePart(p, GEN), expect: { kind: 'refused', cause: 'no-generator', codes: ['dangling-ground'] } },
  { op: 'wire across the generator', mutate: (p) => addWire(p, p[GEN].wires[0], p[GEN].wires[1]), expect: { kind: 'refused', cause: 'shorted-generator', codes: [] } },
  { op: 'place a ground (unconnected)', mutate: (p) => addPart(p, 'Ground', FREE), expect: { kind: 'simulable', codes: ['dangling-ground'] } },
  { op: 'delete a driver (the woofer; its ground symbol is left hanging)', mutate: (p) => deletePart(p, WOOFER), expect: { kind: 'simulable', codes: ['dangling-ground'] } },
  { op: 'undo (the part list before the deletion comes back)', from: NO_R5, mutate: () => [...K1], expect: { kind: 'simulable', codes: [] } },
  { op: 'redo (the deletion is applied again)', mutate: () => NO_R5, expect: { kind: 'simulable', codes: ['undriven-driver', 'undriven-part'] } },
  { op: 'load a shortlist row (KAND-V2-2)', mutate: () => K2, expect: { kind: 'simulable', codes: [] } },
];

describe('UI-2 — the mutation → trigger table', () => {
  it('the loaded shortlist design is simulable and clean, so every row below starts from a known state', () => {
    const r = assessNetwork(K1, MODELS);
    expect(r.kind).toBe('simulable');
    expect(r.defects).toEqual([]);
    expect(NETWORK_READINESS_VERSION).toMatch(/^networkReadiness@\d+$/);
  });

  it.each(TABLE)('$op → $expect.kind', ({ from = K1, mutate, expect: want }) => {
    const next = mutate(from);
    // The mutation is real: the sim memo fires on a changed part list.
    expect(serial(next)).not.toBe(serial(from));
    const r = assessNetwork(next, MODELS);
    expect(r.kind).toBe(want.kind);
    if (r.kind === 'refused') {
      expect(r.cause).toBe(want.cause);
      expect(r.describe.length).toBeGreaterThan(20);
    }
    expect(codes(r)).toEqual(want.codes);
  });

  it('a refusal always carries a sentence, and a clean network carries none', () => {
    const refused = assessNetwork(deletePart(K1, GEN), MODELS);
    expect(refused.kind).toBe('refused');
    expect(refused.describe).toMatch(/generator/i);
    const clean = assessNetwork(K1, MODELS);
    expect(clean.describe).toBe('');
    const empty = assessNetwork([], MODELS);
    expect(empty.kind === 'refused' && empty.cause).toBe('empty');
  });

  it('a driver whose model has no measured impedance is a refusal that names the model (P4)', () => {
    const r = assessNetwork(K1, MODELS.filter((m) => m !== 'tweeter'));
    expect(r.kind).toBe('refused');
    expect(r.kind === 'refused' && r.cause).toBe('missing-impedance');
    expect(r.describe).toContain('tweeter');
  });
});

describe('UI-2 — the case, measured on casus 1', () => {
  const fi = casus1FilterFromParts('k1', K1, manifest, files);
  const grid = logspace(200, 20000, 96);
  const zOnGrid = Object.fromEntries(
    Object.entries(fi.driverZ).map(([m, z]) => [m, resampleImpedance(z.freq, z.magnitude, z.phaseDeg, grid).z]),
  );
  const solve = (parts: readonly VxpPart[]) => {
    const r = assessNetwork(parts, MODELS);
    if (r.kind !== 'simulable') throw new Error(r.describe);
    const sol = solveNetwork(r.netlist, grid, zOnGrid);
    const woofer = sol.drivers.find((d) => d.model === 'woofer')!;
    return { sol, wooferMag: sol.transfers[woofer.id].map((c) => Math.hypot(c.re, c.im)) };
  };

  it('removing R5 re-simulates: the woofer is exactly silent, and the status says so by name', () => {
    const base = solve(K1);
    expect(base.wooferMag.every((m) => m > 0)).toBe(true);
    const gone = solve(NO_R5);
    expect(gone.wooferMag.every((m) => m === 0)).toBe(true);
    const r = assessNetwork(NO_R5, MODELS);
    const silent = r.defects.filter((d) => d.code === 'undriven-driver');
    expect(silent.map((d) => d.part)).toEqual(['D']);
    expect(silent[0].text).toMatch(/woofer/);
    expect(r.describe).toMatch(/silent/);
  });

  it('THE FINDING: validateNetlist saw nothing wrong with that network, because its walk goes through ground', () => {
    const r = assessNetwork(NO_R5, MODELS);
    if (r.kind !== 'simulable') throw new Error(r.describe);
    const v = validateNetlist(r.netlist, MODELS);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('a wire that bridges the gap re-simulates with the woofer back; a wire one row beside it is byte-identical and is named', () => {
    const gone = solve(NO_R5);
    const bridged = solve(addWire(NO_R5, GAP_A, GAP_B));
    expect(bridged.wooferMag.every((m) => m > 0)).toBe(true);
    expect(JSON.stringify(bridged.sol.transfers)).not.toBe(JSON.stringify(gone.sol.transfers));

    const beside = addWire(NO_R5, { x: GAP_A.x, y: GAP_A.y + 1 }, { x: GAP_B.x, y: GAP_B.y + 1 });
    const missed = solve(beside);
    expect(JSON.stringify(missed.sol.transfers)).toBe(JSON.stringify(gone.sol.transfers));
    const r = assessNetwork(beside, MODELS);
    const dangling = r.defects.find((d) => d.code === 'dangling-wire');
    expect(dangling).toBeDefined();
    expect(dangling!.part).toBe(`wire ${GAP_A.x},${GAP_A.y + 1} → ${GAP_B.x},${GAP_B.y + 1}`);
    expect(r.describe).toMatch(/connects nothing/);
  });

  it('a wire across the generator is a refusal, not a silent all-zero simulation', () => {
    const shorted = addWire(K1, K1[GEN].wires[0], K1[GEN].wires[1]);
    const r = assessNetwork(shorted, MODELS);
    expect(r.kind === 'refused' && r.cause).toBe('shorted-generator');
    expect(r.describe).toMatch(/shorted/);
  });
});
