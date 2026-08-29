/**
 * V43 — M-D's LIFT, SPLIT INTO ITS TWO MECHANISMS.
 *
 * `extraDb` adds up two things a designer treats differently: the BROAD lift
 * series resistance produces on its own (it attenuates the low-|Z| reference
 * more than the high-|Z| peak) and the NARROW amplification reactance adds
 * against the motional peak. V42 measured that on casus 1 the first one eats
 * the whole stated budget above roughly 1.7 Ω of path resistance, before any
 * coil exists — so a budget meant for the second was being spent by the first.
 *
 * The split is a difference against the network's own RESISTIVE EQUIVALENT:
 * same topology, same values, every reactance replaced by its own series
 * resistance. Two files' worth of claims live here because they are one
 * mechanism — the transform and the metric that reads it.
 *
 * EVERYTHING IS SYNTHETIC AND PURELY REAL ON PURPOSE. With a real-valued load
 * and one near-field point inside the band, all three maxima are the same grid
 * point and the whole metric collapses to one line of algebra per curve. A
 * consistent error in the engine reproduces a fixture just as faithfully as a
 * correct one; it cannot reproduce a line worked out on paper.
 */

import { describe, expect, it } from 'vitest';
import { cplx, type Complex } from '../../complex.ts';
import type { Netlist } from '../../network.ts';
import { buildAnalysis } from './analysis.ts';
import { lfBump, LF_BUMP_VERSION } from './acoustic.ts';
import { resistiveEquivalent, RESISTIVE_EQUIVALENT_VERSION } from './resistiveEquivalent.ts';

/* ------------------------------------------------------------------ *
 * The synthetic bench
 * ------------------------------------------------------------------ */

/** Three frequencies: one below the band, the band point, and the reference. */
const GRID = [40, 50, 150];
/** A purely REAL load: high at the "resonance", low at the reference. */
const Z_AT: Record<number, number> = { 40: 20, 50: 30, 150: 6 };
const LOAD: Complex[] = GRID.map((f) => cplx(Z_AT[f], 0));

/** Near field: flat, so the bare box contributes exactly zero lift. */
const NF_GRID = [40, 50, 150];
const NF_DB = [0, 0, 0];

/** Generator series resistance — small, but it IS in the divider, so it is in
 *  the hand calculation too rather than being waved away. */
const RG = 1e-6;

/** Generator -> coil (L, DCR) -> driver. The whole network. */
const chain = (henry: number, dcrOhm: number): Netlist => ({
  nodeCount: 3,
  elements: [
    { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: RG },
    { kind: 'L', id: 'L1', nodes: [1, 2], value: henry, seriesR: dcrOhm },
    { kind: 'driver', id: 'D', model: 'load', nodes: [2, 0], inverted: false },
  ],
});

/** M-D over exactly one band point, normalised at 150 Hz. */
const BAND: [number, number] = [49, 51];
const REFERENCE = 150;

const measure = (henry: number, dcrOhm: number) => {
  const netlist = chain(henry, dcrOhm);
  const a = buildAnalysis(netlist, GRID, { load: LOAD });
  const eq = a.resistiveEquivalent();
  return lfBump(NF_GRID, NF_DB, GRID, a.transferByModel.load, 50, {
    overrideBandHz: BAND,
    overrideReferenceHz: REFERENCE,
    resistiveHEl: eq.transferByModel.load,
  })!;
};

/** |H| in dB for the series chain, worked out on paper. */
const hDb = (f: number, henry: number, dcrOhm: number): number => {
  const z = Z_AT[f];
  const re = z + RG + dcrOhm;
  const im = 2 * Math.PI * f * henry;
  return 20 * Math.log10(z / Math.hypot(re, im));
};

/* ------------------------------------------------------------------ *
 * 1 — the hand calculation
 * ------------------------------------------------------------------ */

describe('V43 — the decomposition against a hand calculation', () => {
  const HENRY = 1e-3;
  const DCR = 0.5;

  it('reads the loaded, resistive and bare maxima the paper says it should', () => {
    const r = measure(HENRY, DCR);

    // The bare box is flat, so its lift over the band is exactly zero.
    expect(r.bareDb).toBeCloseTo(0, 12);

    // Loaded: the chain WITH its reactance, normalised at 150 Hz.
    const loaded = hDb(50, HENRY, DCR) - hDb(150, HENRY, DCR);
    expect(r.extraDb).toBeCloseTo(loaded, 6);

    // Resistive equivalent: the same chain with the coil replaced by its DCR.
    const resistive = hDb(50, 0, DCR) - hDb(150, 0, DCR);
    expect(r.liftDb).toBeCloseTo(resistive, 6);
    expect(r.resonantDb).toBeCloseTo(loaded - resistive, 6);

    /* The numbers, so a reader can check them without running anything:
     * loaded 0.6417 dB, resistive 0.5514 dB, resonant 0.0903 dB. */
    expect(r.extraDb).toBeCloseTo(0.6417, 3);
    expect(r.liftDb!).toBeCloseTo(0.5514, 3);
    expect(r.resonantDb!).toBeCloseTo(0.0903, 3);
  });

  it('the split ADDS UP — it is a decomposition, not two measurements', () => {
    /* By construction: all three maxima are taken over one band in one pass, so
     * the two halves cannot fail to reproduce the number they came from. This
     * is the assert that makes the old `extraDb` references the bridge to the
     * new ones. */
    for (const [henry, dcr] of [
      [0, 0.5],
      [1e-3, 0.5],
      [4e-3, 0],
      [2e-3, 1.5],
    ] as const) {
      const r = measure(henry, dcr);
      expect(r.liftDb! + r.resonantDb!).toBeCloseTo(r.extraDb, 12);
    }
  });

  it('with NO reactance at all the resonant half is exactly zero', () => {
    /* The identity case, and it is the sharpest one: a chain whose only element
     * is a resistor IS its own resistive equivalent, so the two curves are the
     * same curve and the whole lift is resistive. */
    const r = measure(0, 0.8);
    /* `toBeCloseTo` and not `toBe`, and the reason is worth a line: the solver
     * stamps a coil as `1/(R + jωL)` and a resistor as `1/R`, and in binary
     * floating point `0.8/(0.8·0.8)` is not `1/0.8`. The two curves are the
     * same curve to fifteen digits; asserting bit-equality would be asserting
     * an accident of the stamping order. */
    expect(r.resonantDb!).toBeCloseTo(0, 12);
    expect(r.liftDb!).toBeCloseTo(r.extraDb, 12);
  });
});

/* ------------------------------------------------------------------ *
 * 2 — P2: the metric without the new input is the metric it was
 * ------------------------------------------------------------------ */

describe('V43 — no resistive curve, no split', () => {
  it('leaves extraDb bit-identical and reports the two halves as null', () => {
    const a = buildAnalysis(chain(1e-3, 0.5), GRID, { load: LOAD });
    const withSplit = measure(1e-3, 0.5);
    const without = lfBump(NF_GRID, NF_DB, GRID, a.transferByModel.load, 50, {
      overrideBandHz: BAND,
      overrideReferenceHz: REFERENCE,
    })!;
    // The number every existing reference is expressed in has not moved.
    expect(without.extraDb).toBe(withSplit.extraDb);
    expect(without.bareDb).toBe(withSplit.bareDb);
    expect(without.atHz).toBe(withSplit.atHz);
    // NULL and never 0: a zero reads as "measured, and it is nothing".
    expect(without.liftDb).toBeNull();
    expect(without.resonantDb).toBeNull();
    expect(without.resistiveAtHz).toBeNull();
  });

  it('a resistive curve that carries nothing is refused, with the reason', () => {
    /* A branch that collapses in the resistive limit reads −Infinity, and the
     * honest answer is "not measured" — never a silent 0, and never a lift of
     * a thousand decibels. */
    const a = buildAnalysis(chain(1e-3, 0.5), GRID, { load: LOAD });
    const dead: Complex[] = GRID.map(() => cplx(0, 0));
    const r = lfBump(NF_GRID, NF_DB, GRID, a.transferByModel.load, 50, {
      overrideBandHz: BAND,
      overrideReferenceHz: REFERENCE,
      resistiveHEl: dead,
    })!;
    expect(r.liftDb).toBeNull();
    expect(r.resonantDb).toBeNull();
    expect(r.notes.join(' ')).toContain('cannot be split');
  });
});

/* ------------------------------------------------------------------ *
 * 3 — NEW MEASUREMENT: move one thing, watch the right half move
 * ------------------------------------------------------------------ */

describe('V43 — a new measurement moves the half it belongs to', () => {
  it('a bigger coil moves the resonant half and leaves the resistive half EXACTLY alone', () => {
    /* This is the claim the whole split exists for. The resistive equivalent
     * does not contain the coil, so growing it cannot touch the lift — not
     * "hardly", exactly. */
    const small = measure(1e-3, 0.5);
    const big = measure(4e-3, 0.5);
    expect(big.liftDb).toBe(small.liftDb);
    expect(big.resonantDb!).toBeGreaterThan(small.resonantDb!);
    expect(big.extraDb).toBeGreaterThan(small.extraDb);
  });

  it('more series resistance moves the resistive half', () => {
    const lean = measure(1e-3, 0.5);
    const padded = measure(1e-3, 2.0);
    expect(padded.liftDb!).toBeGreaterThan(lean.liftDb!);
    /* And the counter-proof that the two halves are not the same number under
     * two names: the same change moves them in OPPOSITE directions. Series
     * resistance damps the peak the coil works against, so what the coil still
     * adds on top of it shrinks. */
    expect(padded.resonantDb!).toBeLessThan(lean.resonantDb!);
  });
});

/* ------------------------------------------------------------------ *
 * 4 — the transform itself
 * ------------------------------------------------------------------ */

describe('V43 — the resistive equivalent is a transform, not a model', () => {
  const netlist: Netlist = {
    nodeCount: 5,
    elements: [
      { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: RG },
      { kind: 'L', id: 'Lwith', nodes: [1, 2], value: 1e-3, seriesR: 0.42 },
      { kind: 'C', id: 'Cshunt', nodes: [2, 0], value: 47e-6, seriesR: 0.02 },
      { kind: 'L', id: 'Lideal', nodes: [2, 3], value: 2e-3 },
      { kind: 'R', id: 'Rpad', nodes: [3, 4], value: 3.3 },
      { kind: 'driver', id: 'D', model: 'load', nodes: [4, 0], inverted: false },
    ],
  };

  it('a coil with DCR becomes a resistor of that DCR, keeping its id', () => {
    const eq = resistiveEquivalent(netlist);
    const r = eq.netlist.elements.find((e) => e.id === 'Lwith')!;
    expect(r.kind).toBe('R');
    expect((r as { value: number }).value).toBe(0.42);
    expect(eq.dcrIds).toEqual(['Lwith']);
  });

  it('a coil with no DCR becomes a SHORT — its nodes merge and it leaves', () => {
    const eq = resistiveEquivalent(netlist);
    expect(eq.shortedIds).toEqual(['Lideal']);
    expect(eq.netlist.elements.find((e) => e.id === 'Lideal')).toBeUndefined();
    // Nodes 2 and 3 were joined, so the pad now hangs off the coil's own node.
    const pad = eq.netlist.elements.find((e) => e.id === 'Rpad')!;
    const coil = eq.netlist.elements.find((e) => e.id === 'Lwith')!;
    expect(pad.nodes[0]).toBe(coil.nodes[1]);
    // ...and the node count shrank by exactly the one merge.
    expect(eq.netlist.nodeCount).toBe(netlist.nodeCount - 1);
  });

  it('a capacitor becomes an OPEN branch and leaves — its ESR cannot matter', () => {
    /* The resistive limit of a capacitor is an open circuit. Substituting its
     * ESR instead would turn every series capacitor into a near-short, which is
     * the opposite limit. */
    const eq = resistiveEquivalent(netlist);
    expect(eq.openedIds).toEqual(['Cshunt']);
    expect(eq.netlist.elements.find((e) => e.id === 'Cshunt')).toBeUndefined();
  });

  it('ground stays node 0 when something is shorted to it', () => {
    /* A merge that renamed ground would leave the solve without a reference —
     * silently, because the matrix is still solvable. */
    const shortedToGround: Netlist = {
      nodeCount: 3,
      elements: [
        { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: RG },
        { kind: 'R', id: 'Rs', nodes: [1, 2], value: 1 },
        { kind: 'L', id: 'Lshunt', nodes: [2, 0], value: 1e-3 },
        { kind: 'driver', id: 'D', model: 'load', nodes: [2, 0], inverted: false },
      ],
    };
    const eq = resistiveEquivalent(shortedToGround);
    const src = eq.netlist.elements.find((e) => e.id === 'G')!;
    expect(src.nodes[1]).toBe(0);
    // The driver is now across nothing, and the transform SAYS so rather than
    // handing back a branch that radiates zero.
    expect(eq.shortedDriverIds).toEqual(['D']);
    expect(eq.notes.join(' ')).toContain('both terminals on one node');
  });

  it('a driver shorted in the resistive limit gets no split from the analysis', () => {
    const shortedToGround: Netlist = {
      nodeCount: 3,
      elements: [
        { kind: 'source', id: 'G', nodes: [1, 0], volts: 2.83, seriesR: RG },
        { kind: 'R', id: 'Rs', nodes: [1, 2], value: 1 },
        { kind: 'L', id: 'Lshunt', nodes: [2, 0], value: 1e-3 },
        { kind: 'driver', id: 'D', model: 'load', nodes: [2, 0], inverted: false },
      ],
    };
    const a = buildAnalysis(shortedToGround, GRID, { load: LOAD });
    expect(a.resistiveEquivalent().shortedDriverModels).toEqual(['load']);
  });

  it('the second solve happens at most once per analysis', () => {
    /* It is a whole extra MNA pass. Memoised, and the identity of the returned
     * object is the cheapest proof that it is. */
    const a = buildAnalysis(chain(1e-3, 0.5), GRID, { load: LOAD });
    expect(a.resistiveEquivalent()).toBe(a.resistiveEquivalent());
  });

  it('both halves carry a version', () => {
    expect(LF_BUMP_VERSION).toBe('lf-bump/1.1');
    expect(RESISTIVE_EQUIVALENT_VERSION).toBe('resistive-equivalent/1.0');
  });
});
