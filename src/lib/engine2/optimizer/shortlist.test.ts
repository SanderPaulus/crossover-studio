/**
 * A5e.1 — THE SHORTLIST: the feasible region, spread and stamped.
 *
 * Built on synthetic candidates rather than on real chain runs, because what
 * is under test here is the SELECTION — which designs come out, in which
 * order, under which stamp — and a real run would bury that under twenty
 * minutes of tuning.
 */

import { describe, expect, it } from 'vitest';
import { buildShortlist, SHORTLIST_SELECTION_VERSION, type ShortlistInput } from './shortlist.ts';
import { stableJson } from './determinism.ts';
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

const measurements = (window: number, rms: number, phase: number): CandidateMeasurements => ({
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
  phaseTracking: [{ subject: 'low|high', meanAbsDeg: phase }],
});

const topo = (order: number, inverted = false): TopologyDescriptor => ({
  flanks: [
    { way: 'low', side: 'lp', kind: 'LR', order },
    { way: 'high', side: 'hp', kind: 'LR', order },
  ],
  inverted: inverted ? ['high'] : [],
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

function candidate(
  label: string,
  order: number,
  uF: number,
  m: CandidateMeasurements,
  gates: GateVerdict[] = [],
  inverted = false,
): ShortlistInput<string> {
  return {
    label,
    parts: [cap('C1', uF)],
    result: label,
    topology: topo(order, inverted),
    measurements: m,
    gates,
  };
}

const RUN = 'engine=2.0.0-F1 seed=4242 status=completed';

describe('the shortlist', () => {
  it('delivers everything that meets every requirement, spread over topologies', () => {
    const field = [
      candidate('a', 2, 4.0, measurements(1.0, 0.4, 3)),
      candidate('b', 2, 4.1, measurements(1.1, 0.5, 3)),
      candidate('c', 4, 12.0, measurements(1.2, 0.6, 4)),
    ];
    const s = buildShortlist(field, RUN, {
      requirements: { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 },
      size: 2,
    });
    expect(s.feasibleCount).toBe(3);
    expect(s.rows).toHaveLength(2);
    // Two shapes, not two clones — the spreading reached the fourth-order one
    // even though both second-order designs sort ahead of it.
    expect(new Set(s.rows.map((r) => r.orderSignature)).size).toBe(2);
    expect(s.label).toBeNull();
  });

  it('a GATE failure keeps a candidate out, whatever its requirements read', () => {
    const field = [
      candidate('good', 2, 4.0, measurements(1.0, 0.4, 3)),
      // Perfect on every taste requirement, and refused: the load is the load.
      candidate('hostile', 2, 4.2, measurements(0.2, 0.1, 1), [failingGate]),
    ];
    const s = buildShortlist(field, RUN, {
      requirements: { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 },
    });
    expect(s.rows.map((r) => r.label)).toEqual(['good']);
    expect(s.feasibleCount).toBe(1);
  });

  it('sorts by RMS — and the sort is PRESENTATION, not the selection', () => {
    const field = [
      candidate('worst', 2, 4.0, measurements(1.4, 0.9, 3)),
      candidate('best', 2, 40.0, measurements(1.3, 0.2, 3)),
      candidate('middle', 2, 12.0, measurements(1.2, 0.5, 3)),
    ];
    const s = buildShortlist(field, RUN, {
      requirements: { splWindowPlusMinusDb: 1.5 },
      size: 3,
    });
    expect(s.rows.map((r) => r.label)).toEqual(['best', 'middle', 'worst']);
    // Every row carries the numbers that produced it, so re-sorting in a UI
    // needs no second computation and can change nothing about the contents.
    for (const r of s.rows) expect(r.measurements.response).not.toBeNull();
  });

  it('with NO requirement stated everything is feasible, and nothing is judged', () => {
    const field = [
      candidate('a', 2, 4.0, measurements(9, 9, 90)),
      candidate('b', 4, 40.0, measurements(8, 8, 80)),
    ];
    const s = buildShortlist(field, RUN, {});
    expect(s.feasibleCount).toBe(2);
    expect(s.rows).toHaveLength(2);
    for (const r of s.rows) {
      expect(r.requirements.verdicts.every((v) => !v.active)).toBe(true);
    }
  });

  it('when nothing is feasible it says WHICH requirement was missed, and by how much', () => {
    const field = [
      candidate('a', 2, 4.0, measurements(1.0, 0.4, 7.1)),
      candidate('b', 2, 4.2, measurements(1.1, 0.5, 8.4)),
    ];
    // Phase is out of reach for everything; the window is comfortable.
    const s = buildShortlist(field, RUN, {
      requirements: { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 },
      relaxation: { maxRungs: 0 },
    });
    expect(s.rows).toHaveLength(0);
    const diag = s.diagnosis.join(' ');
    expect(diag).toContain('phase tracking');
    expect(diag).toContain('missed by');
    expect(diag).toContain('the SPL window: met');
  });

  it('the LADDER label travels with the rows it produced', () => {
    const field = [
      candidate('a', 2, 4.0, measurements(2.2, 0.9, 3)),
      candidate('b', 4, 12.0, measurements(2.3, 1.0, 3)),
    ];
    const s = buildShortlist(field, RUN, {
      requirements: { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 },
      size: 2,
    });
    expect(s.rows.length).toBeGreaterThan(0);
    expect(s.label).toContain('you asked for');
    expect(s.relaxation.steps.every((st) => st.requirement === 'spl-window')).toBe(true);
    // Every delivered row's verdict still remembers what was ORIGINALLY asked.
    const win = s.rows[0].requirements.verdicts.find((v) => v.requirement === 'spl-window')!;
    expect(win.statedLimit).toBe(1.5);
    expect(win.limit!).toBeGreaterThan(1.5);
  });

  /* ================= the two-stage stamp ================= */

  describe('the two-stage stamp', () => {
    const field = () => [
      candidate('a', 2, 4.0, measurements(1.0, 0.4, 3)),
      candidate('b', 4, 12.0, measurements(1.2, 0.6, 4)),
    ];
    const reqs = { splWindowPlusMinusDb: 1.5, maxPhaseTrackingDeg: 5 };

    it('same requirements on the same run: byte-identical', () => {
      const a = buildShortlist(field(), RUN, { requirements: reqs });
      const b = buildShortlist(field(), RUN, { requirements: reqs });
      expect(stableJson(b.rows.map((r) => r.label))).toBe(stableJson(a.rows.map((r) => r.label)));
      expect(b.stamp.shortlistFingerprint).toBe(a.stamp.shortlistFingerprint);
      expect(b.stamp.runFingerprint).toBe(a.stamp.runFingerprint);
    });

    it('DIFFERENT requirements: same run fingerprint, different shortlist stamp', () => {
      // The whole point of two stages. The requirements never touched the
      // search, so the run is the same run; the selection plainly changed, so
      // the shortlist says so.
      const a = buildShortlist(field(), RUN, { requirements: reqs });
      const b = buildShortlist(field(), RUN, {
        requirements: { ...reqs, splWindowPlusMinusDb: 1.1 },
      });
      expect(b.stamp.runFingerprint).toBe(a.stamp.runFingerprint);
      expect(b.stamp.shortlistFingerprint).not.toBe(a.stamp.shortlistFingerprint);
    });

    it('every ingredient of the shortlist stamp moves it', () => {
      const base = buildShortlist(field(), RUN, { requirements: reqs, size: 2 });
      const variants = [
        ['run', buildShortlist(field(), 'a different run', { requirements: reqs, size: 2 })],
        ['requirements', buildShortlist(field(), RUN, { requirements: { splWindowPlusMinusDb: 9 }, size: 2 })],
        ['size', buildShortlist(field(), RUN, { requirements: reqs, size: 1 })],
        [
          'target',
          buildShortlist(field(), RUN, {
            requirements: reqs,
            size: 2,
            targetCurve: { type: 'tilt' },
          }),
        ],
      ] as const;
      for (const [name, v] of variants) {
        expect(
          v.stamp.shortlistFingerprint,
          `changing the ${name} did not move the shortlist stamp`,
        ).not.toBe(base.stamp.shortlistFingerprint);
      }
      // The relaxation is an ingredient too, checked where it actually moves.
      const relaxed = buildShortlist(
        [candidate('a', 2, 4.0, measurements(2.2, 0.9, 3))],
        RUN,
        { requirements: reqs, size: 1 },
      );
      expect(relaxed.stamp.shortlistFingerprint).not.toBe(base.stamp.shortlistFingerprint);
      expect(base.stamp.components.map((c) => c.name).sort()).toEqual([
        'relaxation',
        'requirements',
        'run',
        'selection',
        'size',
        'target',
      ]);
    });

    it('carries the selection version, so an old stamp cannot pass for a new one', () => {
      const s = buildShortlist(field(), RUN, { requirements: reqs });
      expect(s.stamp.selectionVersion).toBe(SHORTLIST_SELECTION_VERSION);
      expect(s.stamp.shortlistFingerprint).toContain(SHORTLIST_SELECTION_VERSION);
    });
  });

  it('an unimplemented target curve is REPORTED, not silently treated as flat', () => {
    const s = buildShortlist(field2(), RUN, { targetCurve: { type: 'tilt' } });
    expect(s.notes.join(' ')).toContain('not implemented');
  });

  /* ================================================================== *
   * V36 — what a design BURNS, as a column
   * ================================================================== */

  describe('V36 — the dissipation column', () => {
    /**
     * WHY THIS BLOCK IS THREE CLAIMS AND NOT ONE. "The column is carried
     * through" is easy to satisfy and easy to satisfy WRONGLY: a column that
     * quietly participated in the selection would still be carried through. So
     * the load-bearing claim is the third one — a candidate that burns
     * absurdly more than the others comes out in exactly the same place, and
     * the whole list is byte-identical to the one without any dissipation at
     * all. That is A5e.1 as a measurement instead of as a promise.
     */
    const burn = (fraction: number, watts: number | null) => ({
      totalFraction: fraction,
      largestResistor: { id: 'R1', ohm: 3.3, fraction },
      largestResistorWatts: watts,
      powerW: watts === null ? null : 100,
    });

    it('is carried through untouched, exactly as `gates` is', () => {
      const s = buildShortlist(
        [{ ...candidate('a', 2, 4.0, measurements(1.0, 0.4, 3)), dissipation: burn(0.23, 17.9) }],
        RUN,
        {},
      );
      expect(s.rows[0].dissipation).toEqual(burn(0.23, 17.9));
    });

    it('is `null` — never invented — on a candidate that carries none', () => {
      /* An absent column is not a design that burns nothing. Every v1 caller
       * and the two-way route (TODO(F2c)) hand over no dissipation at all, and
       * a 0 there would read as "measured, and it is zero". */
      const s = buildShortlist([candidate('a', 2, 4.0, measurements(1.0, 0.4, 3))], RUN, {});
      expect(s.rows[0].dissipation).toBeNull();
    });

    it('decides NOTHING: the same field with wild dissipation gives the same list', () => {
      const base = field2().concat([
        candidate('b', 2, 4.1, measurements(1.1, 0.5, 3)),
        candidate('c', 4, 12.0, measurements(1.2, 0.6, 4)),
      ]);
      const strip = (x: ReturnType<typeof buildShortlist<string>>) =>
        stableJson({
          rows: x.rows.map((r) => [r.label, r.topologyClass, r.requirements.feasible]),
          feasible: x.feasibleCount,
          stamp: x.stamp.shortlistFingerprint,
        });
      const plain = buildShortlist(base, RUN, { size: 3 });
      /* The worst burner is put FIRST in the field and given the best RMS's
       * neighbour, so a column that leaked into either the spreading or the
       * ordering would have to move it. */
      const loaded = buildShortlist(
        base.map((c, i) => ({ ...c, dissipation: burn(i === 0 ? 0.95 : 0.01, i === 0 ? 95 : 1) })),
        RUN,
        { size: 3 },
      );
      expect(strip(loaded)).toBe(strip(plain));
      expect(loaded.rows.map((r) => r.dissipation?.totalFraction)).toEqual([0.95, 0.01, 0.01]);
    });
  });
});

function field2(): ShortlistInput<string>[] {
  return [candidate('a', 2, 4.0, measurements(1.0, 0.4, 3))];
}
