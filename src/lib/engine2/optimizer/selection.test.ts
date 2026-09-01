/**
 * UI-1 — THE UI LAYER, AS A TEST.
 *
 * The finding this file exists for: from `handleV2Request` onwards, NOTHING
 * was covered. The worker's route has `workerRouteRegression`, the shortlist
 * has `shortlist.test.ts`, the refusal has `wholesaleRejection.test.ts` and a
 * live run of its own — and what the app then DID with the shortlist was
 * untested from the first v2 delivery to this one. It did the wrong thing for
 * that whole time: it loaded `rankChain3Results(results)[0]`, the v1 ranking,
 * which knows nothing about a gate, a requirement or a refused tune, and which
 * therefore handed the Working tab a candidate the v2 route had thrown away —
 * a candidate whose part list V31 had already blanked. An empty netlist landed
 * in the Working tab under a green line reading "Design ready".
 *
 * Not a component test. `selectFromShortlist` is the whole decision, extracted
 * so that it is a value rather than a sequence of `setState` calls (the V32
 * form: one implementation, testable without a browser). What `App.tsx` still
 * owns is applying the answer — and applying it is the same three lines the
 * scan table has always used.
 *
 * The shortlists here are built by `buildShortlist` from synthetic candidates
 * rather than written by hand: the rule under test reads real rows, real
 * refusals and a real empty list, and a hand-built object could drift from
 * what the selection actually receives.
 */

import { describe, expect, it } from 'vitest';
import { buildShortlist, type ShortlistInput } from './shortlist.ts';
import { selectFromShortlist } from './selection.ts';
import type { CandidateMeasurements } from '../requirements/requirements.ts';
import type { GateVerdict } from './gates.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import type { TopologyDescriptor } from './diversity.ts';

const cap = (id: string, uF: number): VxpPart => ({
  type: 'Capacitor',
  partId: id,
  params: [{ name: 'C', value: uF, unit: 'uF' }],
  wires: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
});

const measurements = (window: number, rms: number): CandidateMeasurements => ({
  response: {
    windowPlusMinusDb: window,
    windowMaxAtHz: 1000,
    windowMinAtHz: 2000,
    rmsDeviationDb: rms,
    narrowPeaks: [],
    bandHz: [200, 8000],
    coverage: {
      intendedHz: [200, 8000],
      evaluatedHz: [200, 8000],
      fraction: 1,
      flagged: false,
      limitedBy: { low: 'fixture', high: 'fixture' },
      describe: 'full',
    },
    smoothingOctaves: 1 / 6,
    notes: [],
  },
  phaseTracking: [{ subject: 'low|high', meanAbsDeg: 3 }],
});

const topo = (order: number): TopologyDescriptor => ({
  flanks: [
    { way: 'low', side: 'lp', kind: 'LR', order },
    { way: 'high', side: 'hp', kind: 'LR', order },
  ],
  inverted: [],
});

const failingGate: GateVerdict = {
  gate: 'M-B/EPDR',
  metric: 'M-B',
  title: 'EPDR of the amplifier load',
  subject: 'system',
  value: 0.8,
  unit: 'Ω',
  limit: 1.6,
  direction: 'min',
  active: true,
  pass: false,
  withinToleranceOnly: false,
  reason: '0.80 Ω falls below the stated floor of 1.60 Ω',
  specRef: 'A4 M-B',
};

/** A candidate that delivered a network. `result` carries the label back. */
const ok = (
  label: string,
  order: number,
  uF: number,
  rms: number,
  gates: GateVerdict[] = [],
): ShortlistInput<string> => ({
  label,
  parts: [cap(`C-${label}`, uF)],
  result: label,
  topology: topo(order),
  measurements: measurements(1.0, rms),
  gates,
});

/**
 * A candidate whose tune was refused wholesale — the V31 shape as the worker
 * actually hands it over: a rejection AND an empty part list, because
 * `runCandidate` blanks both copies before the result leaves.
 */
const refused = (label: string, reason: string): ShortlistInput<string> => ({
  ...ok(label, 2, 9.9, 0.01),
  parts: [],
  rejection: { kinds: ['protection'], reason, rejectedTune: { 'L1.L': 3.005 } },
});

const RUN = 'engine=2.0.0 seed=20260826 status=completed';
const build = (field: ShortlistInput<string>[], size = 10) =>
  buildShortlist(field, RUN, {
    requirements: { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 },
    size,
  });

describe('UI-1: which design the Working tab holds after a v2 run', () => {
  it('with no run at all, nothing is selected and it says the tab is untouched', () => {
    const s = selectFromShortlist<string>(null);
    expect(s.kind).toBe('none');
    if (s.kind !== 'none') throw new Error('unreachable');
    expect(s.cause).toBe('no-run');
    expect(s.describe).toContain('what was there before');
  });

  it('a finished run loads SHORTLIST #1, and it is the row the list itself put first', () => {
    // Deliberately handed to the builder out of order: the selection must take
    // the first row of the DELIVERED list, not the first candidate the field
    // happened to hold. `b` is the flattest, so `b` is row one.
    const sl = build([ok('a', 2, 4.0, 0.60), ok('b', 2, 4.1, 0.41), ok('c', 4, 12.0, 0.55)]);
    expect(sl.rows[0].label).toBe('b');

    const s = selectFromShortlist(sl);
    expect(s.kind).toBe('design');
    if (s.kind !== 'design') throw new Error('unreachable');
    expect(s.label).toBe('b');
    expect(s.how).toBe('default');
    // The NETWORK, not a seed and not a label: what lands in the Working tab
    // is this row's own part list.
    expect(s.parts).toBe(sl.rows[0].parts);
    expect(s.parts.map((p) => p.partId)).toEqual(['C-b']);
    expect(s.result).toBe('b');
    // "First" is presentation and the sentence has to say so — A5e.1 is
    // explicit that the choice is the human's.
    expect(s.describe).toContain('a view and not a verdict');
  });

  it('asking for row k loads row k — every row on the list, not only the first', () => {
    const sl = build([ok('a', 2, 4.0, 0.60), ok('b', 2, 4.1, 0.41), ok('c', 4, 12.0, 0.55)]);
    expect(sl.rows.length).toBeGreaterThan(1);
    for (const row of sl.rows) {
      const s = selectFromShortlist(sl, row.label);
      expect(s.kind).toBe('design');
      if (s.kind !== 'design') throw new Error('unreachable');
      expect(s.label).toBe(row.label);
      expect(s.parts).toBe(row.parts);
      expect(s.how).toBe('requested');
    }
  });

  it('a REFUSED candidate is not loadable, and the refusing rule says so (V31)', () => {
    const sl = build([
      ok('a', 2, 4.0, 0.60),
      refused('r', 'the delivered network drives the tweeter above the stated limit on its own resonance'),
    ]);
    // It is on the list as a refusal and it is NOT a row — the precondition
    // that makes the rest of this claim meaningful.
    expect(sl.rejected.map((r) => r.label)).toEqual(['r']);
    expect(sl.rows.map((r) => r.label)).not.toContain('r');

    const s = selectFromShortlist(sl, 'r');
    expect(s.kind).toBe('none');
    if (s.kind !== 'none') throw new Error('unreachable');
    expect(s.cause).toBe('refused');
    // The rule's own sentence, not a shrug — and the category with it.
    expect(s.describe).toContain('above the stated limit on its own resonance');
    expect(s.describe).toContain('protection');
    // The counter-proof: the very same shortlist still loads its real row, so
    // "not loadable" is a property of the refusal and not of this list.
    const good = selectFromShortlist(sl, 'a');
    expect(good.kind).toBe('design');
  });

  it('an EMPTY shortlist loads nothing, and says the v1 winner is not a fallback', () => {
    // Every candidate fails a gate, so nothing is feasible — the state Sander's
    // run would have been in had one more requirement bitten.
    const sl = build([
      ok('a', 2, 4.0, 0.60, [failingGate]),
      ok('b', 2, 4.1, 0.41, [failingGate]),
    ]);
    expect(sl.rows).toHaveLength(0);
    expect(sl.consideredCount).toBe(2);

    const s = selectFromShortlist(sl);
    expect(s.kind).toBe('none');
    if (s.kind !== 'none') throw new Error('unreachable');
    expect(s.cause).toBe('nothing-feasible');
    expect(s.describe).toContain('0 of 2 qualified');
    /* THE CLAIM THAT MATTERS. The bug was not that nothing loaded — it was
     * that something else did. The sentence has to rule the v1 ranking out by
     * name, because "nothing qualified" and "so here is the v1 winner" were
     * both true on screen at the same time. */
    expect(s.describe).toContain('v1 ranking');
    expect(s.describe).toContain('not a fallback');
  });

  it('a label nobody has is not silently the first row', () => {
    const sl = build([ok('a', 2, 4.0, 0.60)]);
    const s = selectFromShortlist(sl, 'nope');
    expect(s.kind).toBe('none');
    if (s.kind !== 'none') throw new Error('unreachable');
    expect(s.cause).toBe('unknown-label');
    expect(s.describe).toContain('nope');
  });

  it('a row with no components loads NOTHING — the mechanism of the bug, guarded', () => {
    /* This is the state that reached the Working tab: a part list of length
     * zero, applied anyway, with `networkActive` set behind it. It should be
     * unreachable through the shortlist — a refusal never becomes a row — so
     * the guard is built by hand here, on purpose. If it ever fires in the app
     * it is a bug report, and the sentence says that rather than dressing it
     * up as a design decision. */
    const sl = build([ok('a', 2, 4.0, 0.60)]);
    const hollow = {
      ...sl,
      rows: [{ ...sl.rows[0], parts: [] as readonly VxpPart[] }],
    };
    const s = selectFromShortlist(hollow);
    expect(s.kind).toBe('none');
    if (s.kind !== 'none') throw new Error('unreachable');
    expect(s.cause).toBe('empty-network');
    expect(s.describe).toContain('No generator');
    expect(s.describe).toContain('bug report');
  });

  it('selection is a READ: it neither reorders nor filters the list it was given', () => {
    /* A5e.1 forbids a second opinion about which designs exist, and this is
     * the one module downstream of the shortlist that could quietly hold one.
     * Selecting every row in turn must leave the list byte-identical. */
    const sl = build([ok('a', 2, 4.0, 0.60), ok('b', 2, 4.1, 0.41), ok('c', 4, 12.0, 0.55)]);
    const before = JSON.stringify(sl);
    selectFromShortlist(sl);
    for (const r of sl.rows) selectFromShortlist(sl, r.label);
    selectFromShortlist(sl, 'nope');
    expect(JSON.stringify(sl)).toBe(before);
  });
});
