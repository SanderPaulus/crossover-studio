/**
 * U-5b — THE RANGE FORM IS SUGAR FOR THE LIST, AS A TEST.
 *
 * The defect this file guards was not that the app computed something wrong.
 * It was that a form said one thing and the run did another: `2300 ± 100 Hz in
 * 9 steps` reached NOTHING on the v2 route — every candidate carries its own
 * cage and its own judge window, and the step count feeds a number an
 * exploration discards — so nine positions were asked for and the derived
 * field's own three ran instead, in a band nobody had pinned, with nothing
 * anywhere saying so. Measured before it was repaired
 * (`scripts/measure-u5b-range.ts`).
 *
 * Five groups.
 *
 *  1. THE EXPANSION BY HAND, on round numbers: nine steps across ± 100 Hz are
 *     25 Hz apart, both edges included, the centre in the middle.
 *  2. WHAT IT REFUSES TO INVENT (P4/A3h): an unreadable centre, a margin that
 *     is not a width and a count that is not a count each produce a REPORTED
 *     problem and no position at all — never a frequency from somewhere else.
 *  3. NOTHING PINNED IS THE FIELD IT ALWAYS WAS (P2), byte for byte.
 *  4. THE ONE GUARD THE SESSION IS FOR, and it runs over BOTH forms: every
 *     stated position reaches the field as its own candidate at its own
 *     frequency, and every one of them comes back out of the shortlist —
 *     delivered, refused with a reason, or pointed at a twin. Never fewer.
 *  5. THE APP USES IT — a source scan, the UI-1 idiom.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCandidateField, candidateFieldKey } from './candidateField.ts';
import { WINDOW_SMOOTHING_OCTAVES } from '../constants.ts';
import {
  describeStatedPositions,
  expandStatedRange,
  mergeStatedCrossings,
  parseStatedCrossings,
  type StatedRangeInput,
} from './statedCrossings.ts';
import { stableJson } from '../optimizer/determinism.ts';
import { buildShortlist, type ShortlistInput } from '../optimizer/shortlist.ts';
import type { CandidateMeasurements } from '../requirements/requirements.ts';
import type { TopologyDescriptor } from '../optimizer/diversity.ts';
import type { VxpPart } from '../../parsers/vxp.ts';
import {
  CASUS1B_FIELD_ALIGNMENTS,
  CASUS1B_STATED_ORDER,
  casus1bReport,
} from '../casus1b.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', '..', '..', 'App.tsx'), 'utf-8');

/* THE SCREENSHOT: the pin Sander typed and the step count he chose. */
const CENTRE = 2300;
const MARGIN = 100;
const STEPS = 9;
const LABEL = 'L→U';

const range = (over: Partial<StatedRangeInput> = {}): StatedRangeInput => ({
  centreHz: CENTRE,
  marginHz: MARGIN,
  steps: STEPS,
  ...over,
});

/* ================================================================== *
 * 1 — the expansion by hand
 * ================================================================== */

describe('U-5b — nine steps across ± 100 Hz, by hand', () => {
  it('is nine positions 25 Hz apart, both edges included and the centre in the middle', () => {
    const ex = expandStatedRange(range(), LABEL);
    expect(ex.problems).toEqual([]);
    expect(ex.hz).toEqual([2200, 2225, 2250, 2275, 2300, 2325, 2350, 2375, 2400]);
    // The two edges ARE the two edges — the only reading of the sentence the
    // designer typed in which "± 100" means ± 100.
    expect(ex.hz[0]).toBe(CENTRE - MARGIN);
    expect(ex.hz[ex.hz.length - 1]).toBe(CENTRE + MARGIN);
    expect(ex.hz[(STEPS - 1) / 2]).toBe(CENTRE);
    // Nine asked, nine delivered. That is the whole session in one assert.
    expect(ex.hz).toHaveLength(STEPS);
    expect(ex.notes.join(' ')).toContain('9 STATED position(s)');
  });

  it('the spacing is HERTZ and not octaves, which is what the designer wrote', () => {
    const ex = expandStatedRange(range(), LABEL);
    const gaps = ex.hz.slice(1).map((h, i) => h - ex.hz[i]);
    // Every gap the same in hertz; a logarithmic layout would grow them.
    expect(new Set(gaps.map((g) => g.toFixed(6))).size).toBe(1);
    expect(gaps[0]).toBeCloseTo((2 * MARGIN) / (STEPS - 1), 9);
  });

  it('N means N: an EVEN count straddles the stated centre and says so', () => {
    const ex = expandStatedRange(range({ steps: 4 }), LABEL);
    expect(ex.hz).toHaveLength(4);
    // Not raised to five to keep the centre in — asking for four and running
    // five is the same class of defect as asking for nine and running three.
    expect(ex.hz).not.toContain(CENTRE);
    expect(ex.notes.join(' ')).toContain('even count');
  });

  it('a margin of ZERO is one position, and a count over it is answered rather than obeyed', () => {
    const ex = expandStatedRange(range({ marginHz: 0 }), LABEL);
    expect(ex.hz).toEqual([CENTRE]);
    expect(ex.notes.join(' ')).toContain('that band is a single point');
    // And the ±2 % search room a PIN leaves itself is not borrowed: a stated
    // position is a position, not a band.
    expect(ex.hz).toHaveLength(1);
  });

  it('one step is the centre alone, and an unstated margin is read as exactly there', () => {
    expect(expandStatedRange(range({ steps: 1 }), LABEL).hz).toEqual([CENTRE]);
    const noMargin = expandStatedRange(range({ marginHz: null, steps: 5 }), LABEL);
    expect(noMargin.hz).toEqual([CENTRE]);
    expect(noMargin.notes.join(' ')).toContain('states no margin');
  });

  it('positions that round onto one frequency are ONE position, and the count says so', () => {
    /* Eleven steps across ± 0.2 Hz land inside the tenth of a hertz the edges
     * are printed at, so several of them ARE one crossing. Arithmetic, not a
     * thinning — and it is still said out loud. */
    const ex = expandStatedRange(range({ marginHz: 0.2, steps: 11 }), LABEL);
    expect(ex.hz.length).toBeLessThan(11);
    expect(new Set(ex.hz).size).toBe(ex.hz.length);
    expect(ex.notes.join(' ')).toContain('one position, not several');
  });
});

/* ================================================================== *
 * 2 — what it refuses to invent
 * ================================================================== */

describe('U-5b — an unreadable field stands in for nothing (P4, A3h)', () => {
  it('no centre frequency: a problem, no position, and no number from anywhere else', () => {
    for (const centreHz of [null, 0, -1, Number.NaN]) {
      const ex = expandStatedRange(range({ centreHz }), LABEL);
      expect(ex.hz, String(centreHz)).toEqual([]);
      expect(ex.problems.join(' '), String(centreHz)).toContain('centre frequency');
    }
    /* The pin fields carry v1 legacy defaults — a frequency from another
     * project (audit §7) — so "empty means nothing" is the whole guard. */
    expect(expandStatedRange(range({ centreHz: null }), LABEL).problems.join(' ')).toContain(
      'not a statement about this one',
    );
  });

  it('a margin that is not a width, and a count that is not a count, are refused with the reason', () => {
    expect(expandStatedRange(range({ marginHz: -50 }), LABEL).hz).toEqual([]);
    expect(expandStatedRange(range({ marginHz: -50 }), LABEL).problems.join(' ')).toContain('not a width');
    expect(expandStatedRange(range({ steps: 0 }), LABEL).hz).toEqual([]);
    expect(expandStatedRange(range({ steps: Number.NaN }), LABEL).problems.join(' ')).toContain(
      'not a count',
    );
  });
});

/* ================================================================== *
 * 3 — nothing pinned is the field it always was
 * ================================================================== */

const CASUS1B = casus1bReport(null);
const PAIR_LABELS = CASUS1B.predesign.windowInputs.map((wi) => `${wi.lower}→${wi.upper}`);

const casus1bField = (statedPerAxisHz?: number[][]) =>
  buildCandidateField({
    windowInputs: CASUS1B.predesign.windowInputs,
    alignments: CASUS1B_FIELD_ALIGNMENTS,
    perPair: CASUS1B.predesign.windowInputs.map(() => ({ statedOrder: CASUS1B_STATED_ORDER })),
    minSpacingOctaves: WINDOW_SMOOTHING_OCTAVES,
    ...(statedPerAxisHz ? { statedPerAxisHz, statedOn: '2026-09-11' } : {}),
  });

describe('U-5b — nothing pinned and nothing typed is byte for byte the field it was', () => {
  it('the merge returns the parse untouched when no handover carries a range', () => {
    const parsed = parseStatedCrossings('', PAIR_LABELS);
    const merged = mergeStatedCrossings({
      parsed,
      ranges: PAIR_LABELS.map(() => null),
      pairLabels: PAIR_LABELS,
    });
    expect(merged.perAxisHz).toEqual(parsed.perAxisHz);
    expect(merged.problems).toEqual(parsed.problems);
    expect(merged.complete).toBe(parsed.complete);
    expect(merged.notes).toEqual([]);
  });

  it('and the run fingerprint of that field is identical to the pre-U-5b one', () => {
    const before = stableJson(candidateFieldKey(casus1bField().field));
    const merged = mergeStatedCrossings({
      parsed: parseStatedCrossings('', PAIR_LABELS),
      ranges: PAIR_LABELS.map(() => null),
      pairLabels: PAIR_LABELS,
    });
    const after = stableJson(
      candidateFieldKey(casus1bField(merged.complete ? merged.perAxisHz : undefined).field),
    );
    expect(after).toBe(before);
    // And the tegenproef: pinning something IS a different field, or the
    // assert above would also hold for a merge that never does anything.
    const pinned = mergeStatedCrossings({
      parsed: parseStatedCrossings('', PAIR_LABELS),
      ranges: PAIR_LABELS.map(() => range()),
      pairLabels: PAIR_LABELS,
    });
    expect(pinned.complete).toBe(true);
    expect(stableJson(candidateFieldKey(casus1bField(pinned.perAxisHz).field))).not.toBe(before);
  });

  it('a handover with NO field of its own is reported, never filled from a neighbour', () => {
    /* The pin form has a field for the lowest handover and one for the
     * highest, which is not every handover of a four-way. */
    const labels = ['A→B', 'B→C', 'C→D'];
    const merged = mergeStatedCrossings({
      parsed: parseStatedCrossings('', labels),
      ranges: [range(), null, range({ centreHz: 5000 })],
      pairLabels: labels,
    });
    expect(merged.complete).toBe(false);
    expect(merged.perAxisHz[1]).toEqual([]);
    expect(merged.problems.join(' ')).toContain('B→C');
  });
});

/* ================================================================== *
 * 4 — THE GUARD: every stated position, both forms, all the way through
 * ================================================================== */

const cap = (uF: number): VxpPart => ({
  type: 'Capacitor',
  partId: 'C1',
  params: [{ name: 'C', value: uF, unit: 'uF' }],
  wires: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
});

const measurements = (rms: number): CandidateMeasurements => ({
  response: {
    windowPlusMinusDb: 1,
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
    smoothingOctaves: WINDOW_SMOOTHING_OCTAVES,
    notes: [],
  },
  phaseTracking: [{ subject: 'low|high', meanAbsDeg: 5 }],
});

const topo: TopologyDescriptor = {
  flanks: [
    { way: 'low', side: 'lp', kind: 'LR', order: 4 },
    { way: 'high', side: 'hp', kind: 'LR', order: 4 },
  ],
  inverted: [],
};

/** Every stated candidate of a field, handed to the shortlist as it ran. */
const shortlistOf = (
  statedPerAxisHz: number[][],
  outcome: (hz: number, i: number) => Partial<ShortlistInput<string>> = () => ({}),
) => {
  const field = casus1bField(statedPerAxisHz).field;
  const inputs: ShortlistInput<string>[] = field.candidates.map((c, i) => ({
    label: c.label,
    parts: [cap(1 + i)],
    result: c.label,
    topology: topo,
    measurements: measurements(0.5),
    gates: [],
    ...(c.stated
      ? {
          stated: {
            statedOn: c.stated.statedOn,
            outsideWindow: c.stated.outsideWindow,
            perCrossing: c.stated.perCrossing.map((x) => ({
              pairLabel: x.pairLabel,
              hz: x.hz,
              insideWindow: x.insideWindow,
              breaches: [],
            })),
            missedStated: [],
          },
        }
      : {}),
    ...outcome(c.crossings[0].hz, i),
  }));
  return { field, shortlist: buildShortlist(inputs, 'engine=2.0.0 seed=1 status=completed') };
};

describe('U-5b — every stated position reaches the worker and comes back, both forms', () => {
  const asked = [1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700];

  const forms: [string, number[][]][] = [
    [
      'the LIST form',
      mergeStatedCrossings({
        parsed: parseStatedCrossings(asked.join(', '), PAIR_LABELS),
        ranges: PAIR_LABELS.map(() => null),
        pairLabels: PAIR_LABELS,
      }).perAxisHz,
    ],
    [
      'the RANGE form',
      mergeStatedCrossings({
        parsed: parseStatedCrossings('', PAIR_LABELS),
        ranges: PAIR_LABELS.map(() => ({ centreHz: 2300, marginHz: 400, steps: 9 })),
        pairLabels: PAIR_LABELS,
      }).perAxisHz,
    ],
  ];

  it.each(forms)('%s puts all nine positions in the field, at exactly those frequencies', (_name, perAxis) => {
    expect(perAxis[0]).toEqual(asked);
    const field = casus1bField(perAxis).field;
    const stated = field.candidates.filter((c) => c.stated);
    expect(stated).toHaveLength(asked.length);
    expect(stated.map((c) => c.crossings[0].hz).sort((a, b) => a - b)).toEqual(asked);
    /* PAST THE GENERATOR'S SPACING RULE, which is the half of U-5 the range
     * form now inherits: these nine are far closer together than the
     * derivation's own minimum spacing, and not one of them is merged away. */
    const spacingHz = asked[1] - asked[0];
    expect(Math.log2((asked[0] + spacingHz) / asked[0])).toBeLessThan(WINDOW_SMOOTHING_OCTAVES);
    // And past the chain budget: it thins positions the derivation offered.
    expect(field.parameters.statedSize).toBe(asked.length);
  });

  it.each(forms)('%s: all nine come back out of the shortlist, none silently fewer', (_name, perAxis) => {
    const { shortlist } = shortlistOf(perAxis);
    expect(shortlist.stated).toHaveLength(asked.length);
    for (const e of shortlist.stated) expect(e.describe.length).toBeGreaterThan(0);
  });

  it.each(forms)('%s: a REFUSED stated position is still listed, with its reason', (_name, perAxis) => {
    const { shortlist } = shortlistOf(perAxis, (hz) =>
      hz >= 2500 ? { rejection: { kinds: ['gate'], reason: 'M-C on the upper way' } } : {},
    );
    expect(shortlist.stated).toHaveLength(asked.length);
    const refused = shortlist.stated.filter((e) => e.refusal !== null);
    expect(refused).toHaveLength(asked.filter((h) => h >= 2500).length);
    for (const e of refused) expect(e.describe).toContain('REFUSED');
    // And never in the other lane: one candidate, one place (U-5).
    expect(shortlist.rejected).toEqual([]);
  });

  it.each(forms)('%s: identical networks are GROUPED and never removed (F0)', (_name, perAxis) => {
    const { shortlist } = shortlistOf(perAxis, () => ({ parts: [cap(3.3)] }));
    // Every one of them still there …
    expect(shortlist.stated).toHaveLength(asked.length);
    // … and all but the first pointing at the first.
    expect(shortlist.stated.filter((e) => e.sameNetworkAs !== null)).toHaveLength(asked.length - 1);
    expect(shortlist.stated[0].sameNetworkAs).toBeNull();
    expect(shortlist.stated[1].describe).toContain('SAME network as');
    expect(shortlist.notes.join(' ')).toContain('delivered a network IDENTICAL');
  });

  it('nine DIFFERENT networks are nine answers, and nothing is grouped', () => {
    const { shortlist } = shortlistOf(forms[1][1]);
    expect(shortlist.stated.filter((e) => e.sameNetworkAs !== null)).toEqual([]);
    expect(shortlist.notes.join(' ')).not.toContain('delivered a network IDENTICAL');
    /* MEASURED IN THE RUNNING APP before this was written: nine positions a
     * quarter of a percent apart delivered nine different networks (1.46 to
     * 1.99 dB, 4.9 to 13.3 degrees) — so the identical-network reading stays
     * silent, which is the honest answer and not a broken guard. */
    for (const e of shortlist.stated) expect(e.describe).not.toContain('SAME network as');
  });

  it('the topology-class reading is ONE note and not a sentence on every row', () => {
    /* On one band every stated position usually lands in the same class, so
     * saying it on each of nine rows is nine times the same observation. Said
     * once it answers the question a designer has: different shapes, or the
     * same shape at different values? Measured in the app first — all nine
     * came back LR4. */
    const { shortlist } = shortlistOf(forms[1][1]);
    expect(shortlist.stated.filter((e) => e.sameClassAs !== null)).toHaveLength(asked.length - 1);
    for (const e of shortlist.stated) expect(e.describe).not.toContain('topology class');
    expect(shortlist.notes.join(' ')).toContain('are in ONE topology class');
  });

  it('the two forms are ONE set per handover, and a frequency in both counts once', () => {
    const merged = mergeStatedCrossings({
      parsed: parseStatedCrossings('2000, 2300', PAIR_LABELS),
      ranges: PAIR_LABELS.map(() => range()),
      pairLabels: PAIR_LABELS,
    });
    expect(merged.perAxisHz[0]).toEqual([2000, 2200, 2225, 2250, 2275, 2300, 2325, 2350, 2375, 2400]);
    expect(merged.notes.join(' ')).toContain('named by both and counted once');
    // Ten, not eleven: 2300 is in both lists and is one crossing.
    expect(merged.perAxisHz[0]).toHaveLength(10);
  });

  it('the notice before the scan reads the positions out, and says what they cost', () => {
    const merged = mergeStatedCrossings({
      parsed: parseStatedCrossings('', PAIR_LABELS),
      ranges: PAIR_LABELS.map(() => range()),
      pairLabels: PAIR_LABELS,
    });
    const notice = describeStatedPositions(PAIR_LABELS, merged.perAxisHz);
    expect(notice).toContain('2200, 2225, 2250, 2275, 2300, 2325, 2350, 2375, 2400 Hz');
    expect(notice).toContain('9 candidate(s)');
    expect(describeStatedPositions(PAIR_LABELS, null)).toBeNull();
    expect(describeStatedPositions(PAIR_LABELS, [[]])).toBeNull();
  });
});

/* ================================================================== *
 * 5 — the app uses it
 * ================================================================== */

describe('U-5b — the app expands the form it shows', () => {
  it('BOTH routes merge the pin into the stated list before they build the field', () => {
    expect((APP.match(/mergeStatedCrossings\(\{/g) ?? []).length).toBe(2);
    expect((APP.match(/ranges: v2StatedRanges\(wis\.length\),/g) ?? []).length).toBe(2);
    expect((APP.match(/\.\.\.\(stated\.complete \? \{ statedPerAxisHz: stated\.perAxisHz \} : \{\}\)/g) ?? []).length).toBe(2);
  });

  it('the pin reaches the field through that ONE helper and nowhere else', () => {
    /* `xoRangeValue()` is the v1 pin and stays what it was; the stated
     * expansion is the only path from the crossover-point fields into a v2
     * candidate, so there is one answer to "what did the form ask for". */
    const helper = APP.slice(APP.indexOf('const v2StatedRanges = ('), APP.indexOf('const v2StatedRanges = (') + 1200);
    expect(helper).toContain('if (!xoRangeOn || pairCount < 1) return none;');
    expect(helper).toContain('scanSteps3 : scanSteps2');
    expect(helper).toContain('numOrNull(xoFreqHz)');
    expect(helper).toContain('numOrNull(xoLowFreqHz)');
  });

  it('BOTH routes read the stated positions out in the notice before the scan starts', () => {
    expect((APP.match(/describeStatedPositions\(/g) ?? []).length).toBe(2); // one per route
    expect((APP.match(/const notice = \[statedLine, estimate\.message\]/g) ?? []).length).toBe(2);
    // And the notice appears for them even when every one is inside a window.
    expect((APP.match(/if \(notice !== ''\) \{/g) ?? []).length).toBe(2);
  });

  it('the form prints the positions it will run, from the same expansion the run takes', () => {
    expect(APP).toContain('const v2StatedRangeLines = useMemo(');
    expect(APP).toContain('expandStatedRange(r, label)');
    expect(APP).toContain('{v2StatedRangeLines.map((l, i) => (');
  });
});
