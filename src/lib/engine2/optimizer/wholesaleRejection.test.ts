/**
 * V31 — A REFUSED TUNE COMES BACK AS A REFUSAL, NOT AS A SEED.
 *
 * THE FINDING. Four of fifteen v2 candidates came back byte-identical to their
 * unarmed arm. Not because the barrier did nothing: the full-band safety gate
 * refused the whole tune and `optimizeNetworkValues` returned the SEED. On one
 * of them the refused tune had lifted the amplifier load from 0.035 Ω to 1.8 Ω,
 * and what reached the shortlist was the 0.035 Ω — a network failing two
 * requirements swapped for one failing a single requirement far worse, wearing
 * the candidate's label and ready to build.
 *
 * WHAT IS AND IS NOT UNDER TEST HERE. The safety gate is not changed and is not
 * questioned: a tune that worsens tweeter protection must not be delivered.
 * What V31 changes is what happens NEXT — a candidate with no acceptable tune
 * delivers nothing and says which rule refused it, instead of falling back onto
 * a design nobody judged.
 *
 * THIS FILE IS THE CHEAP HALF: the shortlist's behaviour and the ladder's
 * immunity, on hand-built inputs, in milliseconds. The expensive half — the
 * casus-1 candidate that actually triggers the gate, live through
 * `handleV2Request` — lives in `casus1V2Candidates.test.ts`, beside the run it
 * is about.
 */

import { describe, expect, it } from 'vitest';
import type { VxpPart } from '../../parsers/vxp.ts';
import { buildShortlist, type ShortlistInput } from './shortlist.ts';
import type { GateVerdict } from './gates.ts';
import type { CandidateMeasurements } from '../requirements/requirements.ts';
import type { TopologyDescriptor } from './diversity.ts';

/** A part list distinct enough for `componentVector` to tell two rows apart. */
const partsWith = (uf: number): VxpPart[] => [
  {
    type: 'Capacitor',
    partId: 'C1',
    params: [
      { name: 'C', value: uf, unit: 'uF' },
      { name: 'ESR', value: 0.02, unit: 'Ω' },
    ],
    wires: [{ x: 3, y: 4 }, { x: 9, y: 4 }],
  },
  {
    type: 'Inductor',
    partId: 'L1',
    params: [
      { name: 'L', value: uf / 10, unit: 'mH' },
      { name: 'DCR', value: 0.16, unit: 'Ω' },
    ],
    wires: [{ x: 3, y: 4 }, { x: 12, y: 4 }],
  },
];

const topology = (order: number): TopologyDescriptor => ({
  flanks: [{ way: 'high', side: 'hp', kind: 'LR', order }],
  inverted: [],
});

const measured = (rms: number, window: number): CandidateMeasurements => ({
  response: {
    windowPlusMinusDb: window,
    rmsDeviationDb: rms,
    peaks: [],
    bandHz: [200, 20000],
    coverage: { fromHz: 200, toHz: 20000, fromBy: 'test', toBy: 'test', clipped: false },
  } as unknown as CandidateMeasurements['response'],
  phaseTracking: [{ subject: 'low|high', meanAbsDeg: 10 }],
});

const passingGate = (): GateVerdict[] => [
  {
    gate: 'M-B/|Z|',
    metric: 'M-B',
    title: 'Minimum |Z| the amplifier sees (simple mode)',
    subject: 'system',
    value: 4,
    unit: 'Ω',
    limit: 3,
    direction: 'min',
    active: true,
    pass: true,
    withinToleranceOnly: false,
    reason: '4.00 Ω against a floor of 3.00 Ω',
    specRef: 'A4 M-B (simple mode)',
  },
];

const ok = (label: string, rms: number, order: number): ShortlistInput<string> => ({
  label,
  parts: partsWith(order * 2 + rms),
  result: label,
  topology: topology(order),
  measurements: measured(rms, rms),
  gates: passingGate(),
});

/**
 * A candidate whose tune was refused wholesale.
 *
 * Note what it still carries: the SEED's parts and the seed's measurements, in
 * the arguments, exactly as the pre-V31 world handed them over. The shortlist
 * has to refuse it on the strength of `rejection` alone — if it needed the
 * caller to blank the other fields first, the guarantee would live in the
 * caller and not here.
 */
const refused = (label: string, rms: number): ShortlistInput<string> => ({
  label,
  parts: partsWith(99),
  result: label,
  topology: topology(2),
  measurements: measured(rms, rms),
  gates: passingGate(),
  rejection: {
    kinds: ['protection'],
    reason: 'safety gate: tune rejected on the full measurement band — tweeter protection got worse.',
    rejectedTune: { minZOhm: 1.8, windowPlusMinusDb: 3.1, rmsDeviationDb: 1.9 },
  },
});

describe('V31 — a candidate that delivered nothing is not a row', () => {
  it('it is excluded from the rows even though its numbers would have won', () => {
    /* The refused candidate carries the BEST rms in the field. Before V31 it
     * would have sorted first — with the seed's numbers, under this label. */
    const sl = buildShortlist([refused('refused', 0.1), ok('a', 2, 2), ok('b', 3, 4)], 'fp');
    expect(sl.rows.map((r) => r.label)).not.toContain('refused');
    expect(sl.rows.map((r) => r.label).sort()).toEqual(['a', 'b']);
    expect(sl.consideredCount).toBe(3);
    expect(sl.feasibleCount).toBe(2);
  });

  it('it appears as a REJECTION, with the rule that refused it', () => {
    const sl = buildShortlist([refused('refused', 0.1), ok('a', 2, 2)], 'fp');
    expect(sl.rejected).toHaveLength(1);
    expect(sl.rejected[0].label).toBe('refused');
    expect(sl.rejected[0].kinds).toEqual(['protection']);
    expect(sl.rejected[0].reason).toContain('tweeter protection');
    // ...and what the refused tune had reached, as reporting.
    expect(sl.rejected[0].rejectedTune?.minZOhm).toBe(1.8);
    expect(sl.rejected[0].rejectedTune?.windowPlusMinusDb).toBe(3.1);
    // The note says it out loud, because a `rejected` array nobody renders is
    // the same silence in a different shape.
    expect(sl.notes.join(' ')).toContain('delivered no network at all');
  });

  it('the rejection carries NO network — not a row, not parts, not a result', () => {
    const sl = buildShortlist([refused('refused', 0.1), ok('a', 2, 2)], 'fp');
    const serialised = JSON.stringify(sl.rejected);
    // The seed's distinctive component value must appear nowhere in what is
    // published about a refused candidate.
    expect(serialised).not.toContain('99');
    expect(serialised).not.toContain('Capacitor');
    expect(Object.keys(sl.rejected[0])).toEqual(
      expect.not.arrayContaining(['parts', 'result', 'measurements']),
    );
  });

  it('THE LADDER DOES NOT REACH IT — safety is a protection, not a taste (A5e.1)', () => {
    /* Every candidate but the refused one fails a stated requirement, so the
     * ladder has to move to find anything. It must not find THIS one however
     * far it moves: there is no design to relax a limit around. */
    const sl = buildShortlist([refused('refused', 0.1), ok('a', 9, 2), ok('b', 9.5, 4)], 'fp', {
      requirements: { splWindowPlusMinusDb: 1 },
    });
    expect(sl.relaxation.steps.length).toBeGreaterThan(0);
    expect(sl.rows.map((r) => r.label)).not.toContain('refused');
    expect(sl.rejected.map((r) => r.label)).toEqual(['refused']);
  });

  it('with NOTHING feasible, the diagnosis does not offer the seed as a near miss', () => {
    const sl = buildShortlist([refused('refused', 0.1)], 'fp', {
      requirements: { splWindowPlusMinusDb: 0.001 },
      relaxation: { maxRungs: 0 },
    });
    expect(sl.rows).toHaveLength(0);
    expect(sl.feasibleCount).toBe(0);
    // The diagnosis answers "what came closest". A refused candidate came
    // nowhere close to anything — it never produced a design — so it may not
    // be the answer, and the text says so instead.
    const text = sl.diagnosis.join(' ');
    expect(text).toContain('delivered nothing to miss with');
    expect(text).toContain('tweeter protection');
  });

  it('a field with no rejections is unchanged — the mechanism costs nothing (P2)', () => {
    const plain = [ok('a', 2, 2), ok('b', 3, 4)];
    const withNulls = plain.map((c) => ({ ...c, rejection: null }));
    expect(JSON.stringify(buildShortlist(withNulls, 'fp').rows)).toBe(
      JSON.stringify(buildShortlist(plain, 'fp').rows),
    );
    expect(buildShortlist(plain, 'fp').rejected).toEqual([]);
    expect(buildShortlist(plain, 'fp').notes.join(' ')).not.toContain('delivered no network');
  });
});
