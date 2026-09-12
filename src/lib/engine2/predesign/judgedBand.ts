/**
 * E-5 — WHERE A v2 RUN MAY BE JUDGED, AND ON WHAT GRID IT LOOKS.
 *
 * THE THING THIS MODULE EXISTS TO STOP BEING WRITTEN FOUR TIMES. Since M-1 the
 * casus-1 fixture derives the judged band and the chain grid from the
 * measurement set instead of typing them; casus 1b and casus 2 copied the same
 * eleven lines verbatim when they were added. Three copies of one rule is the
 * A3g shape this project keeps paying for, and E-5 found the fourth reader by
 * discovering that the APP has neither derivation and therefore runs the same
 * engine on a different question.
 *
 * WHAT THE RULE IS, AND WHY THE INTERSECTION IS THE WRONG ANSWER.
 *
 * The app's judged band has always been `intersectValidity` — the frequencies
 * where EVERY contributing source may be believed (issue #14, A3d). That is the
 * right question about one measurement and the wrong one about a SUM. On any
 * three-way with a gated tweeter the intersection floor is the tweeter's gate
 * floor: 455 Hz on casus 1. Below it the sum is carried entirely by the woofer
 * and the mid, whose merged measurements are valid to 20.5 Hz, and the tweeter
 * contributes nothing there — its own high-pass is 100 dB down. Vetoing the
 * bass because the tweeter cannot be believed in it judges the loudspeaker by
 * the one way that is not playing.
 *
 * So the floor belongs to the LOWEST way, twice over:
 *
 *   · its VALIDITY floor, because below that there is no measurement; and
 *   · its f_p — the in-box resonance — because below that a reflex system rolls
 *     off on its own and no crossover can flatten it. Judging there would make
 *     every candidate pay for the box.
 *
 * The GRID starts at the validity floor and NOT at f_p, and that distinction is
 * load-bearing: `isHighPassProtected` probes half an octave under the lowest
 * way's passband floor, which it reads off the grid's floor. With the grid
 * starting at f_p that probe lands in the reflex impedance dip and the woofer
 * reads as high-pass protected — M-1 measured it refusing eight candidates of
 * eight. The long form of that argument is in `casus1V2.fixture.ts`, where it
 * was first written down.
 *
 * WHAT THIS MODULE DOES NOT DECIDE. The band's CEILING. Each casus fixture
 * states its own (`JUDGE_TOP_HZ`), and the app narrows the intersection top by
 * the designer's view range; both are properties of the caller and neither is
 * in dispute. E-5 is about the floor, and this module answers exactly that.
 */

import { logspace } from '../../dsp.ts';
import type { EngineV2Report } from '../report.ts';

/**
 * The resolution precedent every casus grid keeps: 96 points over 200–20 000 Hz
 * (`f4b2_v2_worker_baseline.json`). Stated so a run on a grid that reaches
 * lower is a run at the same points per octave and not a coarser one.
 */
export const PRECEDENT_GRID_POINTS = 96; // P6-OK: a resolution precedent, not a band
export const PRECEDENT_GRID_HZ: readonly [number, number] = [200, 20000]; // P6-OK: the resolution precedent, not a band

/** Points per octave of the precedent — what `chainGridFrom` preserves. */
export const PRECEDENT_POINTS_PER_OCTAVE =
  PRECEDENT_GRID_POINTS / Math.log2(PRECEDENT_GRID_HZ[1] / PRECEDENT_GRID_HZ[0]);

/**
 * Where the judged band and the chain grid start, and why.
 *
 * The same shape all three casus fixtures called `BAND_SOURCE`, so that what a
 * fixture records in its provenance block and what the app puts in a run note
 * are the same object rather than two descriptions of one rule.
 */
export interface JudgedBandFloor {
  /** The lowest way, as the report names it. */
  lowest: string;
  /** Its A5b.1 validity floor — where the chain GRID starts. */
  validityFloorHz: number;
  /** Its in-box resonance, or null when no impedance was classified. */
  fpHz: number | null;
  /** The higher of the two — where the judged BAND starts. */
  floorHz: number;
  /** Where the validity floor itself came from (header, merge block, …). */
  provenance: string;
}

/**
 * The floor, from a report.
 *
 * Null when the report has no lowest way with an on-axis band — the honest
 * state, and the caller then keeps whatever floor it had and says so. The three
 * fixtures throw instead, because for them a missing band is a broken fixture
 * rather than a project in progress; that difference is theirs to keep.
 */
export function judgedBandFloor(report: EngineV2Report): JudgedBandFloor | null {
  const lowest = report.driversLowToHigh[0];
  if (lowest === undefined) return null;
  const d = report.ingest.drivers.find((x) => x.driver === lowest);
  if (!d?.onAxis) return null;
  const validityFloorHz = d.onAxis.bandHz[0];
  const fpHz = d.impedance?.fundamentalHz ?? null;
  const floorHz = fpHz !== null ? Math.max(validityFloorHz, fpHz) : validityFloorHz;
  return { lowest, validityFloorHz, fpHz, floorHz, provenance: d.onAxis.bandFloorProvenance };
}

/**
 * The chain grid from the validity floor to a stated top, at the precedent's
 * points per octave.
 *
 * The point count is ROUNDED, exactly as the three fixtures round it, so a grid
 * built here is the grid they built.
 */
export function chainGridFrom(validityFloorHz: number, topHz: number): number[] {
  return logspace(
    validityFloorHz,
    topHz,
    Math.round(PRECEDENT_POINTS_PER_OCTAVE * Math.log2(topHz / validityFloorHz)),
  );
}

/**
 * One sentence a run can print about where it looked and where it judged.
 *
 * It names the RULE that set the floor and not only the number, for the reason
 * U-3e established one layer up: a floor that is a convention and a floor that
 * is a measurement look identical once they are both just hertz.
 */
export function describeJudgedFloor(f: JudgedBandFloor, gridFloorHz: number): string {
  const by =
    f.fpHz !== null && f.floorHz > f.validityFloorHz
      ? `the in-box resonance of ${f.lowest} (f_p ${f.fpHz.toFixed(1)} Hz)`
      : `the measurement validity floor of ${f.lowest} (${f.validityFloorHz.toFixed(1)} Hz, ${f.provenance})`;
  return (
    `Engine v2 judges from ${f.floorHz.toFixed(1)} Hz, set by ${by}, and looks from ` +
    `${gridFloorHz.toFixed(1)} Hz. Both are derived from the measurement set rather than from the ` +
    'plot range: the intersection of every source\'s validity would put the floor at the highest ' +
    'way\'s gate, where the lowest way is the only one playing (E-5).'
  );
}
