/**
 * V32 — WHERE AN IMPEDANCE-DOMAIN GATE JUDGES.
 *
 * THE FINDING THIS MODULE EXISTS FOR. Three of the ten frozen `KAND-V2-*`
 * netlists PASSED `M-B/|Z|` in their own chain run at 2.594–2.606 Ω and MISSED
 * the same stated floor when the file was measured afterwards, at 2.358–2.447 Ω.
 * Neither reading was wrong; they looked at different places. The minima sit at
 * 82.1–83.7 Hz and the chain's analysis grid starts at 200 Hz, because that is
 * where this measurement set's FAR FIELD begins.
 *
 * For a response requirement that floor is right — a response nobody measured
 * is a response nobody may judge. For an IMPEDANCE requirement it is wrong, and
 * `netOptimizer.ts` already says so in its own words beside `band`:
 *
 *     "the amplifier-load floor and its repair pass deliberately keep working
 *      on the FULL grid regardless: they are impedance criteria, and an
 *      impedance measurement has no gate"
 *
 * The tuner obeyed that rule. The v2 gate reference was never held to it. Two
 * judgements about one requirement, on two grids, and the one that got printed
 * was the more lenient of the two.
 *
 * ── ONE RULE, TWO CALLERS, AND THAT IS THE WHOLE POINT ────────────────────
 *
 * `report.ts` built this grid inline and the worker never built it at all. Both
 * now call `impedanceReferenceFrom`, so "the gate verdict and the file
 * measurement say the same thing" is an IDENTITY rather than a coincidence that
 * holds until someone edits one of the two. `frozenNetlistGates.test.ts` still
 * asserts it end to end, because a shared function can still be handed
 * different sweeps.
 *
 * ── WHAT THE GRID IS, AND THE ONE UNCOMFORTABLE PART ──────────────────────
 *
 * The extent is the UNION of the drivers' own sweeps: every frequency where at
 * least one branch was measured. It has to be the union rather than the
 * intersection, because the intersection on casus 1 is 200 Hz–20 kHz — the
 * blindness V32 is about, arrived at from the other side.
 *
 * That means a branch is read OUTSIDE its own sweep, held flat at its nearest
 * measured value. On casus 1 the tweeter's sweep starts at 199.95 Hz, so below
 * that its impedance is an extrapolation. This is not hidden and it is not
 * silently accepted: every such band is listed in `heldFlat` and stated in
 * `notes`, in the same words `report.ts` has used since F1. A reader deciding
 * whether to trust a verdict at 82 Hz is entitled to know that one of the three
 * branches was not measured there.
 *
 * It is also not the same failure as F4b2's leak. There, a whole driver had NO
 * data under the band being inverted, and the inversion answered anyway with a
 * ceiling of a thousand henries. Here the drivers that carry the load at 82 Hz —
 * the woofer down to 10 Hz, the mid down to 20 Hz — are measured, and the branch
 * that is not is the one a series capacitor has already taken out of the
 * picture. The absence is named rather than reasoned away, which is the most
 * this layer can honestly do.
 *
 * WHEN NOTHING CROSSES, NOTHING IS JUDGED. There is no fallback to the chain's
 * analysis grid and there must not be one: falling back would restore exactly
 * the verdict this module exists to withdraw, and it would do it silently. The
 * caller decides what its measured sweep IS — a synthetic fixture may honestly
 * declare its own curves to be it — but no caller gets a judgement out of a
 * sweep that never arrived.
 */

import type { Complex } from '../../complex.ts';
import { logspace, resampleImpedance } from '../../dsp.ts';
import { ANALYSIS_GRID_POINTS } from '../constants.ts';

/**
 * One driver's measured impedance, on the grid the measurement itself uses.
 *
 * The same shape `MeasurementFactsPayload.impedanceByModel` carries across the
 * worker border, and deliberately so: this is the fact that crosses, and a
 * second vocabulary for it would be a translation layer to drift in.
 */
export interface MeasuredSweep {
  grid: readonly number[];
  magnitude: readonly number[];
  phaseDeg: readonly number[];
  /**
   * The sweep's own extent — which for an impedance IS its A5b.1 validity.
   *
   * `factsForWorker` puts it that way and gives the reason: an impedance
   * measurement carries no gate, so there is no narrower interval to derive and
   * no wider one to claim.
   */
  validHz: [number, number];
}

/** A band a branch was read over without having been measured there. */
export interface HeldFlatBand {
  model: string;
  /** Below this frequency the branch is held flat; null when it is not. */
  belowHz: number | null;
  /** Above this frequency the branch is held flat; null when it is not. */
  aboveHz: number | null;
}

export interface ImpedanceReference {
  grid: number[];
  /** Every model's impedance on `grid`, keyed the way the netlist keys it. */
  driverZ: Record<string, readonly Complex[]>;
  /** Each model's own measured extent, carried so a reader can see the gap. */
  validHz: Record<string, [number, number]>;
  /** Every branch read outside its own sweep, and where. Empty is the good case. */
  heldFlat: HeldFlatBand[];
  /** One sentence per extrapolated branch, in `report.ts`'s own words. */
  notes: string[];
  /** The extent and where it came from, for a gate's `parameters` block. */
  span: string;
}

/**
 * The impedance judgement grid, or null when there is nothing to build it from.
 *
 * The resolution is `ANALYSIS_GRID_POINTS`, which is the report's — not a
 * separate choice. A gate that judged the same network at a different
 * resolution from the panel beside it would be a smaller version of the very
 * disagreement this module ends.
 */
export function impedanceReferenceFrom(
  sweeps: Readonly<Record<string, MeasuredSweep>>,
): ImpedanceReference | null {
  const models = Object.keys(sweeps).sort();
  if (models.length === 0) return null;

  let lo = Infinity;
  let hi = -Infinity;
  for (const m of models) {
    const s = sweeps[m];
    if (s.grid.length < 2 || !(s.validHz[1] > s.validHz[0])) return null;
    lo = Math.min(lo, s.validHz[0]);
    hi = Math.max(hi, s.validHz[1]);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return null;

  const grid = logspace(lo, hi, ANALYSIS_GRID_POINTS);
  const driverZ: Record<string, readonly Complex[]> = {};
  const validHz: Record<string, [number, number]> = {};
  const heldFlat: HeldFlatBand[] = [];
  const notes: string[] = [];
  for (const m of models) {
    const s = sweeps[m];
    driverZ[m] = resampleImpedance(s.grid, s.magnitude, s.phaseDeg, grid).z;
    validHz[m] = [s.validHz[0], s.validHz[1]];
    const below = s.validHz[0] > grid[0] ? s.validHz[0] : null;
    const above = s.validHz[1] < grid[grid.length - 1] ? s.validHz[1] : null;
    if (below !== null || above !== null) {
      heldFlat.push({ model: m, belowHz: below, aboveHz: above });
      // The wording is `report.ts`'s, unchanged since F1. Two surfaces saying
      // the same thing in two sets of words is how a reader comes to believe
      // they are two different findings.
      notes.push(
        `${m}: its impedance sweep is narrower than the analysis grid, so the edges are held ` +
          'flat. Every electrical number outside its own sweep is an extrapolation.',
      );
    }
  }

  return {
    grid,
    driverZ,
    validHz,
    heldFlat,
    notes,
    span:
      `${grid[0].toFixed(0)}-${grid[grid.length - 1].toFixed(0)} Hz, the drivers' own measured ` +
      'impedance sweeps (an impedance measurement has no gate)',
  };
}
