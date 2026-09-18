/**
 * H-3 — THE NETWORK TAB READS HYBRID MODE: the judgement strip, the tuner's
 * verdict sentence, and the template, against the STATED handover.
 *
 * WHAT H-2b LEFT OPEN, MEASURED FIRST (casebook H-3, step 1). With Hybrid
 * mode stated on a two-way set the shortlist judged the lean form correctly —
 * flank error, sums not judged — and the Network tab did not read the
 * statement at all: the "Response" chip scored the passive sum flat over the
 * whole visible band ("flatness 0"), the part audit printed "Qes ×2.93" beside
 * a stated maximum of 2.4 it never mentioned, ⚙ Optimize components tuned the
 * drawing to a sum without the active side, and "New from template" seeded a
 * textbook ladder against a nominal 8 Ω at 2.5 kHz. Four surfaces, one
 * statement, none of them reading it.
 *
 * WHAT THIS MODULE OWNS. The three READINGS the tab needs and nothing that
 * judges on its own: the strip's band (one rule, `leanJudgedBand`), the
 * sentence the source-resistance rule prints once a Q_es maximum is stated, the
 * flank chip's words, and the SEED of the lowest passive way — the stated
 * high-pass realised by the app's own acoustic synthesis on the measured way,
 * which is the H-2b route (`designChain.ts` builds the same spec for the design
 * step). The flank error itself is NOT re-measured here: the report already
 * judges the loaded netlist with `flankErrorDb` (`report.ts`, H-2b), the same
 * function the shortlist's worker reads, and the tab reads THAT — one
 * implementation, one number (A3g).
 *
 * The tune of a drawn network is not here either: it runs through the v2
 * worker's `v2TuneNetlist` route on the chain's own option assembly
 * (`assembledTuneOptions`, `designChain.ts`), so a button and a scan cannot
 * judge one design two ways.
 *
 * NO ENGINE IMPORT, on purpose: this is app-layer vocabulary, and the
 * toggle-regression scan lets only the UI entry points reach into `engine2/`.
 */

import type { Complex } from './complex.ts';
import { defaultHpLp, type DriverFilterSpec, type FilterKind, type HpLpSpec } from './filters.ts';
import { synthesize, type SynthesisResult, type SynthesizedComponent } from './synthesis.ts';
import { activeHighPass, handoverBandHz, leanJudgedBand, type FlankError } from './activeSide.ts';

/** Versiestring — a behaviour change here is a version bump (A5e.5). */
export const HYBRID_NETWORK_VERSION = 'hybrid-network-tab/1.0';

/** The stated shape the tab reads, in the terms `activeSide.ts` speaks. */
export interface StatedHandoverShape {
  hz: number;
  kind: FilterKind;
  order: 1 | 2 | 3 | 4;
}

/* ==================================================================== *
 * 1 — the strip: where the sum is judged on a hybrid, and where it is not
 * ==================================================================== */

/**
 * The band the flatness strip judges on a hybrid: the visible range with its
 * floor lifted to the bottom of the handover band (`leanJudgedBand`, the run's
 * own rule). Null range = nothing to judge in view, and the chip says so.
 */
export function hybridStripRange(
  visible: readonly [number, number],
  handoverHz: number,
): { range: [number, number] | null; floorHz: number } {
  return { range: leanJudgedBand(visible, handoverHz), floorHz: handoverBandHz(handoverHz)[0] };
}

/**
 * The sentence on the strip's sum figure. Below the floor the sum is the
 * passive network alone — on a lean-form hybrid there is nothing else there,
 * and on the measured form the drawing does not carry the active way either —
 * so what lies under the handover reads the same pinned sentence the shortlist
 * prints (`ACTIVE_SIDE_NOT_JUDGED`), handed in by the caller so the words have
 * one home.
 */
export function hybridStripNote(floorHz: number, judged: boolean, notJudgedSentence: string): string {
  const floor = `${floorHz.toFixed(0)} Hz (the bottom of the handover band, the lean form's rule)`;
  return judged
    ? `HYBRID MODE — judged from ${floor} upward. Below it: ${notJudgedSentence}.`
    : `HYBRID MODE — nothing judged: the visible range ends below ${floor}. ${notJudgedSentence}.`;
}

/* ==================================================================== *
 * 2 — the source-resistance rule names the stated Q_es maximum
 * ==================================================================== */

/**
 * What the part audit's Q_es reading means once a maximum is STATED.
 *
 * "Qes ×2.93" alone is a bare number; beside a stated 2.4 it is a failed
 * requirement, and the tab has to say which. Without a stated maximum the bare
 * number stands, and `failed` is null rather than false: nobody judged it (P4).
 */
export function describeQesFactor(
  qesFactor: number | null,
  statedMax: number | undefined,
): { text: string; failed: boolean | null } | null {
  if (qesFactor === null || !Number.isFinite(qesFactor)) return null;
  const factor = `Qes ×${qesFactor.toFixed(2)}`;
  if (statedMax === undefined || !Number.isFinite(statedMax)) return { text: factor, failed: null };
  const failed = qesFactor > statedMax;
  return {
    text: failed
      ? `${factor} against stated ${statedMax} — requirement FAILED`
      : `${factor} within stated ${statedMax}`,
    failed,
  };
}

/* ==================================================================== *
 * 3 — the flank chip
 * ==================================================================== */

/** The flank chip's words: the rms shape error and the level offset the DSP gain absorbs. */
export function describeFlank(e: FlankError | null, handoverHz: number): { value: string; title: string } {
  if (!e) {
    return {
      value: 'not read',
      title:
        `Target-flank error of the lowest passive way against the stated high-pass at ${handoverHz.toFixed(1)} Hz: ` +
        'not read — no solvable network under the handover band, or the band holds no grid point.',
    };
  }
  return {
    value: `${e.rmsDb.toFixed(2)} dB rms`,
    title:
      `Target-flank error (H-2b): the measured lowest passive way times THIS network against the same way ` +
      `times the stated high-pass at ${handoverHz.toFixed(1)} Hz, over ${e.bandHz[0].toFixed(0)}–${e.bandHz[1].toFixed(0)} Hz ` +
      `(${e.points} points). Shape error ${e.rmsDb.toFixed(2)} dB rms, largest ${e.maxAbsDb.toFixed(2)} dB; ` +
      `level ${e.levelDb >= 0 ? '+' : ''}${e.levelDb.toFixed(2)} dB against the target, which the DSP gain absorbs. ` +
      'The same function the shortlist judges its rows on, read from the v2 report of this design.',
  };
}

/* ==================================================================== *
 * 4 — the template: the lowest passive way seeded from the stated handover
 * ==================================================================== */

/**
 * What a template built WITHOUT a stated handover has to say about itself.
 * Printed, never silent: a textbook ladder against a nominal load is a starting
 * shape and not an acoustic design, and until H-3 nothing on the tab said so.
 */
export const TEMPLATE_NOMINAL_NOTE =
  'built against nominal impedance — state a handover or run Optimize for an acoustic design';

/**
 * THE SEED OF THE LOWEST PASSIVE WAY from the stated handover: the stated
 * high-pass — and the template's reference upper knee beside it — realised by
 * the app's acoustic synthesis on the MEASURED way (its response and its
 * impedance), as a bare ladder.
 *
 * This is the H-2b route's own spec: `designChain.ts` gives the lowest way
 * `hp: activeHighPass(handover)` in the design step and `synthesize` in
 * acoustic mode fits the ladder to the measured way. Here the same two run
 * without the design step, because a template is a seed and not a design:
 * corrections OFF (a bare ladder, as every template is), no catalogue snap, and
 * the values that come out are what the measured driver asks for at the stated
 * corner — not what an 8 Ω resistor would.
 *
 * The synthesis may refuse (a degenerate load); the caller then keeps the
 * textbook ladder and prints why (F0). Nothing here judges the seed: ⚙
 * Optimize components is the fitting step, as it always was.
 */
export function seedLowestPassiveWay(args: {
  handover: StatedHandoverShape;
  grid: readonly number[];
  driverZ: readonly Complex[];
  driverSplDb: readonly number[];
  /** The upper knee of this way (the template's reference low-pass); absent = the high-pass alone. */
  upperKnee?: HpLpSpec;
  phasePriority?: number;
  label?: string;
}): { components: SynthesizedComponent[]; result: SynthesisResult; note: string } {
  const spec: DriverFilterSpec = {
    gainDb: 0,
    hp: activeHighPass(args.handover),
    lp: args.upperKnee ?? defaultHpLp(args.grid[args.grid.length - 1]),
    eq: [],
  };
  const result = synthesize(spec, args.grid, args.driverZ, {
    mode: 'acoustic',
    driverSplDb: [...args.driverSplDb],
    corrections: 'off',
    catalogSnap: false,
    ...(args.phasePriority !== undefined ? { phasePriority: args.phasePriority } : {}),
    label: args.label ?? 'lowest passive way',
  });
  const knee = args.upperKnee?.enabled
    ? `; upper knee ${args.upperKnee.kind}${args.upperKnee.order} @ ${args.upperKnee.freq.toFixed(0)} Hz (template reference)`
    : '';
  return {
    components: result.components,
    result,
    note:
      `lowest passive way seeded to the stated acoustic ${args.handover.kind}${args.handover.order} high-pass at ` +
      `${args.handover.hz.toFixed(1)} Hz on the measured way (acoustic synthesis, bare ladder, fit ${result.rmsDb.toFixed(2)} dB rms)${knee}`,
  };
}
