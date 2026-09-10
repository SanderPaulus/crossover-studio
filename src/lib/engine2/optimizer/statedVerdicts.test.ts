/**
 * U-5 — WHAT A STATED CROSSING DELIVERS, AS A TEST.
 *
 * The four kinds the metric procedure asks for, on one bench.
 *
 *  · HAND CALCULATION. A single resistive driver behind one series coil, read
 *    at exactly the frequency where the coil's reactance equals the driver's
 *    resistance: |H| = 1/√2 there, so the level relative to a passband taken
 *    two decades lower is −3.0103 dB and nothing about it is an opinion.
 *  · P4. No network, no passband, no sweep: the reading is UNKNOWN and says
 *    which input was missing. Never zero — "measured, and it is at passband
 *    level" is a different claim (F0).
 *  · NEW MEASUREMENT. The demand and the reading move independently: a limit
 *    that asks for more than the network delivers FALLS SHORT by exactly the
 *    difference, and one that asks for less is DELIVERED at a position the
 *    limit forbids. That second case is the finding U-5 exists to surface.
 *  · THE STATED/DERIVED SPLIT. A limit somebody stated goes into
 *    `missedStated` when it is missed and a derived one never does, and an
 *    armed gate that failed goes in whatever the crossings did.
 *
 * The fixture is synthetic on purpose: no measured set obliges you with a
 * driver whose passband-relative level at a chosen frequency is a round number.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromPolar, type Complex } from '../../complex.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../../parsers/vxp.ts';
import { freezeGateReference, type GateReference, type GateVerdict, type MeasuredSweep } from './gates.ts';
import { statedBreachVerdicts } from './statedVerdicts.ts';
import type { StatedCrossingMark, StatedLimitBreach } from '../predesign/statedCrossings.ts';

/* ------------------------------------------------------------------ *
 * One resistive driver behind one series coil
 * ------------------------------------------------------------------ */

const R_OHM = 8;
const L_MH = 0.4;
/** Where the coil's reactance equals the driver's resistance: |H| = 1/√2. */
const CORNER_HZ = R_OHM / (2 * Math.PI * (L_MH / 1000));
/** The level there, relative to a passband where the coil is invisible. */
const HALF_POWER_DB = -10 * Math.log10(2);

/** The passband: two decades under the corner, where |H| is 1 to six places. */
const PASSBAND_HZ: [number, number] = [10, 12];
/** A grid that HOLDS the corner exactly, so no interpolation is in the way. */
const GRID = [10, 11, 12, 100, 1000, CORNER_HZ, 8000, 20000];

const sweep = (): MeasuredSweep => ({
  grid: GRID,
  magnitude: GRID.map(() => R_OHM),
  phaseDeg: GRID.map(() => 0),
  validHz: [GRID[0], GRID[GRID.length - 1]],
});

const parts = (): VxpPart[] => [
  {
    type: 'Generator',
    partId: 'G1',
    params: [
      { name: 'Eg', value: 2.83, unit: 'V' },
      { name: 'Rg', value: 0.000001, unit: 'Ω' },
    ],
    wires: [{ x: 3, y: 4 }, { x: 3, y: 11 }],
  },
  { type: 'Ground', params: [], wires: [{ x: 3, y: 11 }] },
  {
    type: 'Inductor',
    partId: 'L1',
    params: [
      { name: 'L', value: L_MH, unit: 'mH' },
      { name: 'DCR', value: 0, unit: 'Ω' },
    ],
    wires: [{ x: 3, y: 4 }, { x: 10, y: 4 }],
  },
  { type: 'Driver', partId: 'D1', model: 'low', params: [], wires: [{ x: 10, y: 4 }, { x: 10, y: 11 }] },
  { type: 'Ground', params: [], wires: [{ x: 10, y: 11 }] },
];

const netlist = () => crossoverToNetlist({ name: 'u5-bench', parts: parts() } as VxpCrossover).netlist;

const onGrid: Record<string, readonly Complex[]> = { low: GRID.map(() => fromPolar(R_OHM, 0)) };
const branchDb: Record<string, readonly number[]> = { low: GRID.map(() => 0) };

const reference = (withSweep = true): GateReference =>
  freezeGateReference({
    netlist: netlist(),
    grid: [...GRID],
    driverZ: onGrid,
    branchDb,
    fsHz: {},
    validHz: { low: PASSBAND_HZ },
    ...(withSweep ? { sweeps: { low: sweep() } } : {}),
  });

/* ------------------------------------------------------------------ *
 * Marks
 * ------------------------------------------------------------------ */

const breach = (over: Partial<StatedLimitBreach> = {}): StatedLimitBreach => ({
  side: 'ceiling',
  rule: 'breakup',
  limitHz: 4000,
  octaves: 1,
  stated: false,
  source: 'a synthetic ceiling',
  uncalibrated: null,
  quantity: 'breakup-suppression-db',
  demandDb: 3,
  subject: 'low',
  subjectLabel: 'low',
  atHz: CORNER_HZ,
  sentence: 'the bench sentence',
  ...over,
});

const mark = (breaches: StatedLimitBreach[]): StatedCrossingMark => ({
  statedOn: '2026-09-10',
  outsideWindow: breaches.length > 0,
  perCrossing: [{ pairLabel: 'low→high', hz: 8000, insideWindow: breaches.length === 0, windowHz: [1000, 4000], breaches }],
  provenance: 'Stated by you (2026-09-10)',
});

const only = (r: ReturnType<typeof statedBreachVerdicts>) => r.perCrossing[0].breaches[0];

/* ================================================================== *
 * 1 — the hand calculation
 * ================================================================== */

/** |H| of one series coil into a resistive load, in dB — the closed form. */
const closedFormDb = (f: number): number =>
  20 * Math.log10(R_OHM / Math.hypot(R_OHM, 2 * Math.PI * f * (L_MH / 1000)));

describe('U-5 — the reading is the passband-relative level, by hand', () => {
  it('the reading IS the closed form of this network at the frequency it reports', () => {
    const v = only(statedBreachVerdicts(netlist(), reference(), mark([breach()]), []));
    expect(v.measuredDb).not.toBeNull();
    /* The passband is two decades under the corner, where the coil contributes
     * 5e-5 dB, so the relative reading IS the transfer there to within that.
     * The comparison is against algebra written out in this file, not against
     * anything the engine produced — and the residue is named rather than
     * absorbed into a loose tolerance. */
    expect(v.measuredDb!).toBeCloseTo(closedFormDb(v.readAtHz!), 3);
    expect(Math.abs(v.measuredDb! - closedFormDb(v.readAtHz!))).toBeLessThan(1e-4);
  });

  it('and that frequency is the half-power point: −3.01 dB, to a hundredth of a decibel', () => {
    const v = only(statedBreachVerdicts(netlist(), reference(), mark([breach()]), []));
    /* `atHz` is the nearest point of the ANALYSIS grid, which is a 240-point
     * log grid over the sweep rather than the frequencies this file names — so
     * it lands within half a cell of the corner and the reading with it. Half a
     * cell is 1.6 %, and at 3 dB per octave that is under a hundredth of a dB;
     * the claim is written at the precision the grid can actually carry. */
    expect(Math.abs(Math.log2(v.readAtHz! / CORNER_HZ))).toBeLessThan(0.03);
    expect(v.measuredDb!).toBeCloseTo(HALF_POWER_DB, 1);
    expect(Math.abs(v.measuredDb! - HALF_POWER_DB)).toBeLessThan(0.05);
  });

  it('the passband it is relative to is the FROZEN one, so the reading is the M-C convention', () => {
    /* The bench passband is two decades below the corner, where the coil is
     * invisible: the mean there is 0 dB to six places, which is why the
     * relative reading above IS the half-power point and not a number that
     * happens to be near it. */
    const ref = reference();
    expect(ref.frozenPassbandHz['low']).toEqual(PASSBAND_HZ);
  });
});

/* ================================================================== *
 * 2 — P4: absence is a state and never a zero
 * ================================================================== */

describe('U-5 — nothing to read is reported as nothing', () => {
  it('no network at all: the reading is unknown and the reason says so', () => {
    const v = only(statedBreachVerdicts(null, reference(), mark([breach()]), []));
    expect(v.measuredDb).toBeNull();
    expect(v.meets).toBeNull();
    expect(v.verdict).toMatch(/delivered no network at all/);
  });

  it('no measured sweep: the reading is unknown and names the missing input', () => {
    const v = only(statedBreachVerdicts(netlist(), reference(false), mark([breach()]), []));
    expect(v.measuredDb).toBeNull();
    expect(v.meets).toBeNull();
    expect(v.verdict).toMatch(/could NOT be read/);
  });

  it('a driver the network has no branch for reads nothing rather than something else’s level', () => {
    const v = only(
      statedBreachVerdicts(netlist(), reference(), mark([breach({ subject: 'tweeter', subjectLabel: 'tweeter' })]), []),
    );
    expect(v.measuredDb).toBeNull();
    expect(v.verdict).toMatch(/no passband is known for tweeter/);
  });

  it('ONE driver has ONE name in one paragraph, whatever the lookup key is', () => {
    /* Measured in the running app before it was written down: the pre-design
     * half named the report's driver (`low`) and the measured half the worker's
     * model (`mid`), one sentence apart, about one driver. `subjectLabel` is
     * never re-keyed and both halves print it. */
    const v = only(
      statedBreachVerdicts(
        netlist(),
        reference(),
        mark([breach({ subject: 'low', subjectLabel: 'the midrange' })]),
        [],
      ),
    );
    expect(v.measuredDb).not.toBeNull();
    expect(v.verdict).toContain('MEASURED on the delivered network: the midrange sits');
    expect(v.verdict).not.toContain(': low sits');
  });

  it('a FREQUENCY limit has nothing to measure, and that is the answer rather than a gap', () => {
    const v = only(
      statedBreachVerdicts(
        netlist(),
        reference(),
        mark([breach({ rule: 'directivity', quantity: 'hz', demandDb: null, subject: null, atHz: null })]),
        [],
      ),
    );
    expect(v.measuredDb).toBeNull();
    expect(v.meets).toBeNull();
    expect(v.verdict).toMatch(/frequency limit/);
  });
});

/* ================================================================== *
 * 3 — new measurement: the demand and the reading move independently
 * ================================================================== */

describe('U-5 — what the limit asks against what the network delivers', () => {
  it('a limit asking for less than the network delivers is DELIVERED, at a position it forbids', () => {
    const v = only(statedBreachVerdicts(netlist(), reference(), mark([breach({ demandDb: 3 })]), []));
    expect(v.meets).toBe(true);
    expect(v.verdict).toMatch(/DELIVERS what the limit was protecting/);
  });

  it('a limit asking for more FALLS SHORT by exactly the difference', () => {
    const v = only(statedBreachVerdicts(netlist(), reference(), mark([breach({ demandDb: 6 })]), []));
    expect(v.meets).toBe(false);
    /* 6 asked, 3.0103 delivered: short by 2.9897 dB, and the sentence prints
     * the same number the arithmetic gives. */
    expect(v.verdict).toContain(`${(6 + HALF_POWER_DB).toFixed(1)} dB`);
  });

  it('the reading does NOT move with the demand — two demands, one measurement', () => {
    const a = only(statedBreachVerdicts(netlist(), reference(), mark([breach({ demandDb: 3 })]), []));
    const b = only(statedBreachVerdicts(netlist(), reference(), mark([breach({ demandDb: 6 })]), []));
    expect(a.measuredDb).toBe(b.measuredDb);
    expect(a.meets).not.toBe(b.meets);
  });
});

/* ================================================================== *
 * 4 — stated stays stated
 * ================================================================== */

describe('U-5 — what a stated crossing MISSES, by name', () => {
  it('a DERIVED limit it falls short of is reported and is not a miss', () => {
    const r = statedBreachVerdicts(netlist(), reference(), mark([breach({ demandDb: 6, stated: false })]), []);
    expect(only(r).meets).toBe(false);
    expect(r.missedStated).toEqual([]);
  });

  it('a STATED limit it falls short of IS a miss, named by rule and frequency', () => {
    const r = statedBreachVerdicts(
      netlist(),
      reference(),
      mark([breach({ demandDb: 6, stated: true, rule: 'stated-max', limitHz: 4000 })]),
      [],
    );
    expect(r.missedStated).toEqual(['stated-max ceiling 4000 Hz']);
  });

  it('a STATED limit it DELIVERS is not a miss, although the position is still past it', () => {
    const r = statedBreachVerdicts(
      netlist(),
      reference(),
      mark([breach({ demandDb: 3, stated: true, rule: 'drive-stated', side: 'floor' })]),
      [],
    );
    expect(only(r).meets).toBe(true);
    expect(r.missedStated).toEqual([]);
  });

  it('a stated FREQUENCY limit is missed by definition — no reading could put it right', () => {
    const r = statedBreachVerdicts(
      netlist(),
      reference(),
      mark([
        breach({
          rule: 'stated-min',
          side: 'floor',
          limitHz: 2200,
          stated: true,
          quantity: 'hz',
          demandDb: null,
          subject: null,
          subjectLabel: null,
          atHz: null,
        }),
      ]),
      [],
    );
    expect(r.missedStated).toEqual(['stated-min floor 2200 Hz']);
  });

  it('an ARMED gate that failed is a stated requirement missed; an inactive one is not', () => {
    const gates: GateVerdict[] = [
      { gate: 'M-C', active: true, pass: false, value: -5, limit: -20, reason: 'x', parameters: {} } as GateVerdict,
      { gate: 'M-A', active: false, pass: true, value: null, limit: null, reason: 'y', parameters: {} } as GateVerdict,
    ];
    const r = statedBreachVerdicts(netlist(), reference(), mark([]), gates);
    expect(r.missedStated).toEqual(['M-C']);
  });
});

/* ================================================================== *
 * 5 — the worker keeps the network of a REFUSED stated candidate
 * ================================================================== */

/**
 * A SOURCE SCAN, the UI-1 idiom, because this exception cannot be reached
 * without a live chain run and a claim that only holds behind twenty minutes of
 * tuning is a claim nobody checks. Three lines implement it and all three have
 * to be there together: keeping the parts without judging them would hand over
 * a network with no verdicts beside it — the seed problem in another shape.
 */
const WORKER = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'worker.ts'),
  'utf-8',
);

describe('U-5 — the one exception to V31, in the worker', () => {
  it('a REFUSED stated candidate keeps the tune that was refused, never the seed', () => {
    expect(WORKER).toContain('const keep = statedMark ? (refused.fields.rejectedParts ?? []) : [];');
    expect(WORKER).toContain('parts: [...keep],');
    /* And the blanking is still the blanking for everything else: with no mark
     * `keep` is empty and both copies of the part list go, which is the claim
     * `casus1V2Refusal.test.ts` holds live. */
    expect(WORKER).toContain('net: { ...(delivered.net as object), parts: [...keep], rejectedParts: undefined },');
  });

  it('and it is still JUDGED IN FULL — gates and measurements both run on it', () => {
    /* The condition is widened by ONE disjunct and by nothing else: a
     * generated candidate has `statedKeptNetwork === false`, so what it reads
     * is `!rejection && collect.reference`, character for character what it
     * read before U-5 (P2). */
    expect(WORKER).toContain('if ((!rejection || statedKeptNetwork) && collect.reference) {');
    expect(WORKER).toContain('rejection && !statedKeptNetwork');
  });

  it('the verdicts are read on the network it hands over, and only for a stated candidate', () => {
    expect(WORKER).toContain('const stated = statedMark');
    expect(WORKER).toContain('statedBreachVerdicts(');
    expect(WORKER).toContain('const statedMark = network.stated ?? null;');
  });
});
