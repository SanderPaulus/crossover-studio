/**
 * GOLDEN SNAPSHOT of a summation — the instrument for proving that a refactor
 * changed nothing.
 *
 * Captures the COMPLEX output (Re/Im, not dB) across the whole grid: every
 * branch, the sum, and the sum at several observation angles. dB and degrees
 * would hide exactly the differences worth catching — a level converted to dB
 * has already thrown away a sign, and a phase in degrees has already been
 * wrapped.
 *
 * ⚠ THE POLARITY OF THIS TEST IS THE OPPOSITE OF A WEIGHT SWEEP, AND BOTH
 * BELONG IN THIS CODEBASE. Do not "tidy" one into the other.
 *
 *   - In a weight sweep (merger test 10, the costWeight curve) byte-identical
 *     output is the FAILURE: it means the knob is not wired to anything. There
 *     the assertion is "these must differ".
 *   - Here byte-identical output is the PROOF: two paths that describe the same
 *     physics must produce the same numbers, and there is no physical reason
 *     why routing three sources through an adapter would move a single bit.
 *
 * If a diff shows up, report it — do not introduce a tolerance. Floating-point
 * REORDERING is the only legitimate explanation for a difference in this kind
 * of refactor, and it has to be pointed at (which sum, which term order), not
 * averaged away with an epsilon. An epsilon here would hide the one class of
 * bug the snapshot exists to catch: a branch quietly summed twice, an adjust
 * applied in a different order, a band edge landing one sample over.
 */

import { combineN, type BranchAdjust, type GriddedResponse } from './dsp.ts';

export interface ComplexTrace {
  re: number[];
  im: number[];
}

export interface SumSnapshot {
  label: string;
  freq: number[];
  /** Per branch, after its adjust, complex. */
  branches: { label: string; trace: ComplexTrace }[];
  /** The complex sum on axis. */
  sum: ComplexTrace;
  /** The complex sum at each observation angle (0° included). */
  angles: { hor: number; trace: ComplexTrace }[];
}

const toComplex = (r: GriddedResponse): ComplexTrace => ({
  re: r.spl.map((db, i) => 10 ** (db / 20) * Math.cos((r.phaseDeg[i] * Math.PI) / 180)),
  im: r.spl.map((db, i) => 10 ** (db / 20) * Math.sin((r.phaseDeg[i] * Math.PI) / 180)),
});

const sumToComplex = (spl: readonly number[], deg: readonly number[]): ComplexTrace => ({
  re: spl.map((db, i) => 10 ** (db / 20) * Math.cos((deg[i] * Math.PI) / 180)),
  im: spl.map((db, i) => 10 ** (db / 20) * Math.sin((deg[i] * Math.PI) / 180)),
});

export interface SnapshotInput {
  label: string;
  /** On-axis branches, in the order they are summed. */
  branches: { label: string; response: GriddedResponse; adjust?: BranchAdjust }[];
  /** Optional per-angle branch sets — same branch order, one entry per angle. */
  angleSets?: { hor: number; branches: { response: GriddedResponse; adjust?: BranchAdjust }[] }[];
}

/** Run a summation and record everything about it. */
export function captureSum(input: SnapshotInput): SumSnapshot {
  const on = combineN(input.branches.map((b) => ({ response: b.response, adjust: b.adjust })));
  const angles = (input.angleSets ?? []).map((set) => {
    const r = combineN(set.branches);
    return { hor: set.hor, trace: sumToComplex(r.combinedSpl, r.combinedPhaseDeg) };
  });
  return {
    label: input.label,
    freq: [...on.freq],
    branches: on.branches.map((b, i) => ({
      label: input.branches[i].label,
      trace: toComplex(b),
    })),
    sum: sumToComplex(on.combinedSpl, on.combinedPhaseDeg),
    angles,
  };
}

export interface SnapshotDiff {
  identical: boolean;
  /** Largest absolute difference found anywhere, in linear pressure units. */
  worstAbs: number;
  /** Where it was found. */
  worstAt: string;
  /** Human-readable findings — empty when identical. */
  report: string[];
}

function diffTrace(a: ComplexTrace, b: ComplexTrace, where: string, freq: readonly number[]) {
  let worst = 0;
  let at = '';
  let count = 0;
  const n = Math.min(a.re.length, b.re.length);
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(a.re[i] - b.re[i], a.im[i] - b.im[i]);
    if (d !== 0) {
      count++;
      if (d > worst) {
        worst = d;
        at = `${where} @ ${freq[i]?.toFixed(2) ?? i} Hz`;
      }
    }
  }
  return { worst, at, count, n };
}

/**
 * Compare two snapshots BIT FOR BIT.
 *
 * No tolerance parameter, on purpose: see the header. A caller that wants to
 * tolerate something has to say so at the call site, in a sentence, with a
 * reason.
 */
export function diffSnapshots(a: SumSnapshot, b: SumSnapshot): SnapshotDiff {
  const report: string[] = [];
  let worstAbs = 0;
  let worstAt = '';
  const note = (d: ReturnType<typeof diffTrace>) => {
    if (d.count === 0) return;
    report.push(`${d.at}: ${d.count}/${d.n} points differ, worst ${d.worst.toExponential(3)}`);
    if (d.worst > worstAbs) {
      worstAbs = d.worst;
      worstAt = d.at;
    }
  };

  if (a.freq.length !== b.freq.length) {
    report.push(`grid length ${a.freq.length} vs ${b.freq.length}`);
  } else {
    for (let i = 0; i < a.freq.length; i++) {
      if (a.freq[i] !== b.freq[i]) {
        report.push(`grid differs at index ${i}: ${a.freq[i]} vs ${b.freq[i]}`);
        break;
      }
    }
  }
  if (a.branches.length !== b.branches.length) {
    report.push(`branch count ${a.branches.length} vs ${b.branches.length}`);
  } else {
    a.branches.forEach((br, i) => {
      note(diffTrace(br.trace, b.branches[i].trace, `branch ${br.label}`, a.freq));
    });
  }
  note(diffTrace(a.sum, b.sum, 'sum', a.freq));
  if (a.angles.length !== b.angles.length) {
    report.push(`angle count ${a.angles.length} vs ${b.angles.length}`);
  } else {
    a.angles.forEach((an, i) => {
      note(diffTrace(an.trace, b.angles[i].trace, `sum @ ${an.hor}°`, a.freq));
    });
  }

  return { identical: report.length === 0, worstAbs, worstAt, report };
}
