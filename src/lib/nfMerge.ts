/**
 * I-2 — THE NF/FF MERGE THE APP MAKES ITSELF, AND THE FILE IT WRITES.
 *
 * WHY THIS EXISTS BESIDE `nearField.ts` RATHER THAN INSIDE IT. `mergeNearFar`
 * is the splice: level, delay, crossfade, on a grid the caller supplies. It has
 * served the live per-branch merge in `App.tsx` since the two-way days and is
 * not touched here. What it does NOT do is any of the things that make a merge
 * a MEASUREMENT rather than a curve on screen:
 *
 *   - it does not say which of two dropped files is the near field;
 *   - it does not derive a splice band from the two validity limits;
 *   - it does not give the baffle-step model a phase, so the near-field half
 *     arrives with a magnitude correction and no matching phase;
 *   - it does not check itself;
 *   - and above all it produces nothing that can be SAVED. The live merge
 *     exists only in a memo. Nothing downstream can read where its low end
 *     came from, nothing can hand it to another tool, and re-opening the
 *     project re-derives it from settings that may have moved.
 *
 * So this module makes the merge a FILE: an FRD carrying the structured merge
 * block that M-1 introduced and P-1 taught the v1 side to read. From that
 * moment the merged response is an ordinary measurement with a stated validity,
 * and every window, anchor and gate downstream reads it through the path that
 * already exists — `declaredMergeValidity` on the v1 side, `mergedValidity` in
 * engine2. That is the whole point of writing a file instead of holding a
 * curve: the validity travels with the data.
 *
 * WHERE IT LIVES, AND WHY NOT IN `engine2/ingest/`. The block's READER lives
 * there, but a merged measurement is a measurement and not an engine feature:
 * it has to work with `engineV2Enabled` off, and nothing outside the UI entry
 * points may import `engine2/` (the toggle-regression scan). The FIELD NAMES
 * are the shared convention — P-1 already pinned both readers against the real
 * files — so this module writes names, and `nfMerge.test.ts` pins that both
 * readers read back what was written. Same division of labour as
 * `impedanceFloor.ts`, `phaseAdmission.ts` and `targetLevel.ts`.
 *
 * TWO MEASURED FINDINGS ARE BUILT INTO THIS FILE AND BOTH ARE PINNED IN THE
 * TEST — they are the reason some of it looks the way it does:
 *
 *  (1) M-1's mid merge applied the step model's minimum phase as
 *      `atan2(Im, Re)` of the LOG spectrum, where the minimum phase is `Im`.
 *      The merged MAGNITUDE is unaffected (the difference is inside the file's
 *      own 0.001 dB rounding), the phase below the splice is not. This module
 *      uses the project's own `minphase.ts`, which has always extracted `Im`.
 *      Repairing `Koan_M_merged.frd` means re-merging casus 1's mid and moving
 *      every corpus that rests on it, so it is MEASURED here and repaired
 *      nowhere — see the entry.
 *
 *  (2) A port that is summed into the near field is NOT negligible in the fit
 *      band. Sanders August merge summed half a port at g 0.41; reproducing it
 *      without that port lands 1.0–1.4 dB off in the level fit alone, because a
 *      600 mm downfiring port has organ-pipe resonances at 500–800 Hz. Hence
 *      `portWeight` has no default and refuses rather than assuming.
 */

import { logspace, resample } from './dsp.ts';
import { minimumPhaseDeg } from './minphase.ts';
import { fromPolar } from './complex.ts';
import { parseFrd } from './parsers/frd.ts';
import { parseTabular } from './parsers/tabular.ts';
import {
  baffleStepShelfDb,
  mergeNearFar,
  nearFieldMaxHz,
  sumRadiators,
  type MergeResult,
} from './nearField.ts';
import { SPLICE_KA_MARGIN, THIN_SPLICE_OCT } from './merger.ts';
import type { FrdMeasurement } from './types.ts';

/**
 * Estimator version. A behaviour change is a version bump — the same rule
 * every engine2 extractor carries, applied here because the block this module
 * writes is data other sessions will read back and compare.
 */
export const NF_MERGE_VERSION = 'nf-merge/1.0';

/**
 * Check 1's tolerance, and it is a CONVENTION, not a property of anything:
 * ±0.5 dB across the splice band is the figure Sander used in August and M-1
 * printed verbatim. Failing it colours the check and blocks nothing (F0 — the
 * designer judges, the app reports).
 */
export const SPLICE_CHECK_TOLERANCE_DB = 0.5;

/** Check 2 smooths the empirical step the same 1/6 octave M-1 smoothed it. */
export const STEP_CHECK_SMOOTHING_OCT = 1 / 6;

/**
 * Check 2's band starts a third of the way below the shelf corner — low enough
 * that the shelf is within 1.5 dB of its full depth and high enough that both
 * files still have honest data — and ends at the bottom of the splice band,
 * above which the merge is the far field and the step is no longer visible.
 * (M-1 checked 150–400 Hz by hand against a 440 Hz corner and a 500 Hz splice;
 * this is that band, derived.)
 */
export const STEP_CHECK_LOW_DIVISOR = 3;

/** Points per octave in check 2's readout. */
const STEP_CHECK_POINTS_PER_OCT = 6;

/**
 * The alternative step model check 2's note quotes: a SECOND-order shelf,
 * −depth/(1 + (f/f0)²). Published baffle-step formulas disagree by about 3×
 * and measurement agrees with none of them (`baffleStepShelfDb` says so at
 * length); quoting the spread as a computed number beats calling the first
 * order "a model" and leaving the reader to guess what that costs.
 */
function secondOrderShelfDb(freq: readonly number[], stepHz: number, depthDb: number): number[] {
  if (!(stepHz > 0) || !(depthDb > 0)) return freq.map(() => 0);
  return freq.map((f) => -depthDb / (1 + (f / stepHz) ** 2));
}

/* ------------------------------------------------------------------ *
 * 1 — Which of these two files is the near field?
 * ------------------------------------------------------------------ */

export type MeasurementShape =
  /** A window that bites inside the file's own data: a gated far field. */
  | 'gated'
  /** No window, or one whose floor lies below everything the file shows. */
  | 'ungated'
  /** Already an NF/FF merge — it says so in a `Merge = …` field. */
  | 'merged'
  /** Nothing in the header to go on. */
  | 'unknown';

export interface ShapeVerdict {
  shape: MeasurementShape;
  /** The numbers behind the verdict, in one sentence. */
  evidence: string;
  /**
   * Whether the app must ASK rather than act. True for everything except a
   * window that demonstrably gates the file's own data: 'ungated' is a near
   * field, a ground plane or an anechoic sweep, and a file name is a human's
   * note to themselves (the manifest's own doctrine — auto-detection is a
   * pre-fill, never a fact).
   */
  ask: boolean;
}

/**
 * What shape of measurement is this, from its header and its own data?
 *
 * THE DISCRIMINATOR IS DERIVED, NOT TYPED. A gate exists to keep a room
 * reflection out and costs everything below 1/T; a near field is taken at 5 mm
 * where nothing comes back, so ARTA's window is left at the record length. So
 * the question "is this file gated" is answered by the file against itself: is
 * 1/T inside the band this file shows? Casus 1's far fields read T = 2.521 ms
 * → 397 Hz against data from 20.5 Hz (gated); its near fields read
 * T = 993.7 ms → 1.006 Hz against data from 5.13 Hz (ungated). No threshold in
 * hertz appears anywhere, so no cabinet, driver or session can outgrow it.
 */
export function classifyMeasurementShape(text: string): ShapeVerdict {
  let frd: FrdMeasurement;
  try {
    frd = parseFrd(text);
  } catch {
    return { shape: 'unknown', evidence: 'the file could not be parsed as a response', ask: true };
  }
  const h = headerFields(text);
  const rightRaw = h.get('right window');
  const refRaw = h.get('reference time');
  const right = rightRaw === undefined ? null : firstNumber(rightRaw);
  const ref = refRaw === undefined ? null : firstNumber(refRaw);
  const merge = h.get('merge') ?? null;
  if (merge !== null) {
    return {
      shape: 'merged',
      evidence: `the header declares a ${merge} merge, so it is neither half — it is the result`,
      ask: false,
    };
  }
  const lowest = frd.freq[0];
  if (right === null || ref === null || !(right - ref > 0)) {
    return {
      shape: 'unknown',
      evidence: 'the header states no usable window (a reference time and a right window)',
      ask: true,
    };
  }
  const tMs = right - ref;
  const floorHz = 1000 / tMs;
  if (floorHz > lowest) {
    return {
      shape: 'gated',
      evidence:
        `T = ${right} − ${ref} = ${tMs.toFixed(3)} ms, so 1/T = ${floorHz.toFixed(1)} Hz — inside ` +
        `this file's own data, which starts at ${lowest.toFixed(1)} Hz. The window gates it.`,
      ask: false,
    };
  }
  return {
    shape: 'ungated',
    evidence:
      `T = ${right} − ${ref} = ${tMs.toFixed(3)} ms, so 1/T = ${floorHz.toFixed(2)} Hz — below ` +
      `everything this file shows (from ${lowest.toFixed(2)} Hz). Nothing here is gated, which a ` +
      `near field, a ground plane and an anechoic sweep all have in common.`,
    ask: true,
  };
}

/* ------------------------------------------------------------------ *
 * 2 — The splice band
 * ------------------------------------------------------------------ */

export interface SpliceBandSuggestion {
  /** [lo, hi] Hz, or null when the two limits leave no room. */
  band: [number, number] | null;
  /** The far field's own validity floor, Hz — the bottom. */
  farFloorHz: number | null;
  /** ka = 1 for this cone, Hz — the raw top before the margin. */
  nearMaxHz: number | null;
  /** Width in octaves, when there is a band. */
  widthOct: number | null;
  note: string;
}

/**
 * The widest band both limits allow: above what the gate supports, below where
 * the cone stops being a simple source.
 *
 * The top carries `SPLICE_KA_MARGIN` for the reason `merger.ts` states — a real
 * cone stops moving as one piece before ka = 1, and a derived ceiling that sits
 * within rounding distance of the refusal guarding it is not a ceiling. The
 * bottom is the far field's floor as given; this function does not decide which
 * convention produced it (1/T or 2/T), it takes the number its caller believes.
 *
 * A SUGGESTION, and shown as one. The designer may narrow or widen it, and
 * `checkTransition` in `nearField.ts` already says when a chosen band reaches
 * outside a limit — Sanders own August band (500–800 Hz) reaches above ka = 1
 * for a 255 cm² cone, which is a designer's judgement and not an error the app
 * gets to overrule.
 */
export function suggestSpliceBand(opts: {
  farFloorHz: number | null;
  sdCm2: number | null;
}): SpliceBandSuggestion {
  const nearMaxHz = opts.sdCm2 !== null && opts.sdCm2 > 0 ? nearFieldMaxHz(opts.sdCm2) : null;
  const farFloorHz = opts.farFloorHz !== null && opts.farFloorHz > 0 ? opts.farFloorHz : null;
  if (farFloorHz === null || nearMaxHz === null) {
    const missing =
      farFloorHz === null && nearMaxHz === null
        ? "the far field's validity floor and the cone area"
        : farFloorHz === null
          ? "the far field's validity floor"
          : 'the cone area (Sd)';
    return {
      band: null,
      farFloorHz,
      nearMaxHz,
      widthOct: null,
      note: `no band can be derived without ${missing} — state the splice band yourself, or supply it.`,
    };
  }
  const hi = nearMaxHz * SPLICE_KA_MARGIN;
  if (!(hi > farFloorHz)) {
    return {
      band: null,
      farFloorHz,
      nearMaxHz,
      widthOct: null,
      note:
        `no honest splice exists: the far field is only valid above ${Math.round(farFloorHz)} Hz ` +
        `and the near field only below ${Math.round(hi)} Hz (ka = 1 at ${Math.round(nearMaxHz)} Hz, ` +
        `× ${SPLICE_KA_MARGIN}) — measure further away, higher up, or outdoors.`,
    };
  }
  const widthOct = Math.log2(hi / farFloorHz);
  return {
    band: [farFloorHz, hi],
    farFloorHz,
    nearMaxHz,
    widthOct,
    note:
      `${Math.round(farFloorHz)}–${Math.round(hi)} Hz (${widthOct.toFixed(2)} oct): above the far ` +
      `field's own floor, below ${SPLICE_KA_MARGIN} × ka = 1 (${Math.round(nearMaxHz)} Hz).` +
      (widthOct < THIN_SPLICE_OCT
        ? ` ⚠ narrower than ${THIN_SPLICE_OCT} octave — a level fit across this has few points and a ` +
          `delay fit across it has almost no baseline.`
        : ''),
  };
}

/** The two spellings of one band. The app stores a centre and a width; the
 *  designer reads and types edges. One conversion, both directions, here. */
export const bandOf = (transitionHz: number, blendOct: number): [number, number] => [
  transitionHz * 2 ** (-blendOct / 2),
  transitionHz * 2 ** (blendOct / 2),
];
export const centreOf = (band: readonly [number, number]): { transitionHz: number; blendOct: number } => ({
  transitionHz: Math.sqrt(band[0] * band[1]),
  blendOct: Math.log2(band[1] / band[0]),
});

/* ------------------------------------------------------------------ *
 * 3 — The port's weight in Keele's sum
 * ------------------------------------------------------------------ */

export interface PortWeightResult {
  /** The weight the port's complex pressure carries, cone = 1. */
  weight: number;
  /** How it was built, for the block. */
  note: string;
}

/**
 * Keele's diameter-weighted sum divides each radiator's near-field pressure by
 * the reference cone's diameter: p_tot = Σ pᵢ·Dᵢ / D_cone. Diameter and area
 * are ONE quantity (D = 2√(S/π)), so this takes the diameter — the field the
 * project already stores — and reports the area beside it.
 *
 * `sharedBy` is the other half and has NO DEFAULT. A port shared by two woofers
 * contributes half of itself to each, which is exactly what Sanders August
 * header records: `0.5 x poort (g=0.41, 50/50 over beide woofers)`. Assuming 1
 * would double the port on a two-woofer cabinet and assuming 2 would halve it
 * on a one-woofer cabinet; both are silent factors on the entire low end, so
 * the field asks.
 */
export function portWeight(opts: {
  portDiaMm: number | null;
  coneDiaMm: number | null;
  sharedBy: number | null;
}): PortWeightResult | { weight: null; note: string } {
  const { portDiaMm, coneDiaMm, sharedBy } = opts;
  const missing: string[] = [];
  if (!(portDiaMm !== null && portDiaMm > 0)) missing.push('the port mouth diameter');
  if (!(coneDiaMm !== null && coneDiaMm > 0)) missing.push("the cone's own diameter (from Sd)");
  if (!(sharedBy !== null && sharedBy >= 1)) missing.push('how many drivers share this port');
  if (missing.length > 0) {
    return {
      weight: null,
      note: `the port cannot be weighted without ${missing.join(', ')} — nothing is assumed.`,
    };
  }
  const g = portDiaMm! / coneDiaMm!;
  const weight = g / sharedBy!;
  const areaCm2 = (Math.PI * (portDiaMm! / 20) ** 2).toFixed(1);
  return {
    weight,
    note:
      `1/${sharedBy} × port, D ${portDiaMm} mm (area ${areaCm2} cm² at the mic plane) against a cone ` +
      `of ${coneDiaMm!.toFixed(1)} mm, so g ${g.toFixed(3)} and weight ${weight.toFixed(3)}`,
  };
}

/* ------------------------------------------------------------------ *
 * 4 — The merge
 * ------------------------------------------------------------------ */

export interface NfMergeInput {
  /** The gated far field: the file, verbatim. */
  farText: string;
  farName: string;
  /** The near field of the cone. */
  nearText: string;
  nearName: string;
  /** Optional near field at the port mouth or passive radiator. */
  portText?: string | null;
  portName?: string | null;
  /** Its weight in Keele's sum, from `portWeight`. Required when `portText` is. */
  portWeight?: number | null;
  portNote?: string | null;
  /** The splice band, Hz. */
  spliceBandHz: [number, number];
  /** The baffle-step model put back into the half-space near field. */
  step: { hz: number; depthDb: number } | null;
  /** What the cabinet width alone would give, for the block's cross-check. */
  cabinetStepHz?: number | null;
}

export interface NfMergeResult {
  /** The merged response, on the far field's own grid. */
  freq: number[];
  spl: number[];
  phaseDeg: number[];
  /** The near-field half after the step model and before the level fit — check 1 reads it. */
  nearAdjDb: number[];
  /** The far field, on the same grid — check 1 reads it. */
  farDb: number[];
  fit: MergeResult;
  /** The far-field half's own window, verbatim from its header — the block
   *  quotes it so a reader can trace fine structure above the splice to 2/T.
   *  Null when the far field states none. */
  farWindow: { referenceTimeMs: number; rightWindowMs: number; taper: string | null } | null;
  /** How far apart the two headers put t = 0, and what that means. */
  timeReferenceNote: string;
  /** What a second-order shelf would have done differently, dB, over the step band. */
  stepModelSensitivityDb: number | null;
  notes: string[];
}

/**
 * Merge a near field onto a gated far field, on the FAR FIELD'S OWN GRID.
 *
 * The grid is the far field's because the merge IS the far field with its low
 * end replaced: keeping its points makes everything above the blend byte-
 * identical to the file it came from, which is a property worth having and one
 * the test asserts. The cost is that near-field points BELOW the far field's
 * first frequency are not carried, and `notes` says so with the number when it
 * happens rather than dropping honest data in silence.
 *
 * ORDER OF OPERATIONS, and it is the same order `merger.ts` argues for at
 * length: the step model goes onto the near-field half FIRST, and only then is
 * the level fitted. A near field has no baffle step and the far field does, so
 * the two halves are SUPPOSED to differ by that amount beforehand; fit first
 * and the difference is quietly absorbed into the level.
 */
export function mergeNearField(input: NfMergeInput): NfMergeResult | null {
  let far: FrdMeasurement;
  let near: FrdMeasurement;
  try {
    far = parseFrd(input.farText);
    near = parseFrd(input.nearText);
  } catch {
    return null;
  }
  const grid = far.freq;
  if (grid.length < 8) return null;
  const [lo, hi] = input.spliceBandHz;
  if (!(lo > 0 && hi > lo)) return null;

  const notes: string[] = [];
  const nearOn = resample(near.freq, near.spl, near.phase, grid, { clampEdges: true });
  if (near.freq[0] < grid[0]) {
    notes.push(
      `the near field reaches down to ${near.freq[0].toFixed(1)} Hz but the far field's grid starts ` +
        `at ${grid[0].toFixed(1)} Hz, so the merge starts there too — ` +
        `${Math.log2(grid[0] / near.freq[0]).toFixed(2)} octave of measured near field is not carried.`,
    );
  }

  /* Keele's COMPLEX sum of cone and port, weighted. Complex and not magnitude:
   * below the box tuning it is a subtraction of two similar numbers, where a
   * 1 dB error in either measurement swings the result badly. */
  let nearDb = nearOn.spl;
  let nearPh = nearOn.phaseDeg;
  if (input.portText) {
    const w = input.portWeight;
    if (!(w !== null && w !== undefined && w > 0)) {
      notes.push('a port measurement was given without a weight, so it was NOT summed — nothing is assumed.');
    } else {
      let port: FrdMeasurement;
      try {
        port = parseFrd(input.portText);
      } catch {
        return null;
      }
      const portOn = resample(port.freq, port.spl, port.phase, grid, { clampEdges: true });
      const summed = sumRadiators([
        { p: nearDb.map((v, i) => fromPolar(10 ** (v / 20), (nearPh[i] * Math.PI) / 180)), diameterMm: 1 },
        {
          p: portOn.spl.map((v, i) => fromPolar(10 ** (v / 20), (portOn.phaseDeg[i] * Math.PI) / 180)),
          diameterMm: w,
        },
      ]);
      if (summed) {
        nearDb = summed.map((c) => 20 * Math.log10(Math.hypot(c.re, c.im) || 1e-12));
        nearPh = summed.map((c) => (Math.atan2(c.im, c.re) * 180) / Math.PI);
        notes.push(`the port is summed into the near field at weight ${w.toFixed(3)} (Keele, complex).`);
      }
    }
  }

  /* The step model, MAGNITUDE AND PHASE. A magnitude correction without its
   * phase puts this branch degrees out against every other branch that carries
   * one, right where a three-way crosses. The phase is the minimum-phase
   * partner of the shelf, from the project's own `minphase.ts` — the one
   * implementation, which has always taken Im(FFT(cepstrum)) and not
   * atan2(Im, Re) of it (see the module docstring, finding 1). */
  let stepDb: number[] = grid.map(() => 0);
  let stepPh: number[] = grid.map(() => 0);
  let sensitivity: number | null = null;
  if (input.step && input.step.hz > 0 && input.step.depthDb > 0) {
    stepDb = baffleStepShelfDb(grid, input.step.hz, input.step.depthDb);
    stepPh = minimumPhaseDeg(grid, stepDb);
    const second = secondOrderShelfDb(grid, input.step.hz, input.step.depthDb);
    const from = input.step.hz / STEP_CHECK_LOW_DIVISOR;
    let worst = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < from || grid[i] > lo) continue;
      worst = Math.max(worst, Math.abs(second[i] - stepDb[i]));
    }
    sensitivity = worst;
  }
  const nearAdjDb = nearDb.map((v, i) => v + stepDb[i]);
  const nearAdjPh = nearPh.map((v, i) => v + stepPh[i]);

  const fit = mergeNearFar({
    freq: grid,
    farSpl: far.spl,
    farPhaseDeg: far.phase,
    nearSpl: nearAdjDb,
    nearPhaseDeg: nearAdjPh,
    transitionHz: Math.sqrt(lo * hi),
    blendOctaves: Math.log2(hi / lo),
    baffleStepHz: 0,
  });
  if (!fit) return null;

  if (Math.abs(Math.abs(fit.offsetDeg) - 180) < 45) {
    notes.push(
      `the constant phase offset after the delay fit is ${fit.offsetDeg.toFixed(0)}° — one of the two ` +
        `measurements looks INVERTED relative to the other, which is a wiring fact and not a fit parameter.`,
    );
  }

  return {
    freq: [...grid],
    spl: fit.spl,
    phaseDeg: fit.phaseDeg,
    nearAdjDb,
    farDb: [...far.spl],
    fit,
    farWindow: windowOf(input.farText),
    timeReferenceNote: timeReferenceNote(input.nearText, input.farText, fit),
    stepModelSensitivityDb: sensitivity,
    notes,
  };
}

/** Every `Name = value` line of a header, lower-cased keys. One reader for the
 *  three places below that need one; the BLOCK's readers live elsewhere. */
function headerFields(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of parseTabular(text).comments) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z .]*?)\s*=\s*(.+?)\s*$/);
    if (m) out.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  return out;
}

const firstNumber = (raw: string): number | null => {
  const m = raw.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const v = Number(m[0].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

/**
 * The far field's own window, as `Merge FF window` states it.
 *
 * ARTA writes `Right window = 5,021 ms, Tukey 0.25` — a locale decimal comma
 * and a field separator comma in one line. Neutralise the decimal ones first
 * (a comma between digits), and whatever is left really is a separator; the
 * same two-step `parseArtaHeader` does, for the same line.
 */
function windowOf(text: string): NfMergeResult['farWindow'] {
  const h = headerFields(text);
  const rightRaw = h.get('right window');
  const refRaw = h.get('reference time');
  if (rightRaw === undefined || refRaw === undefined) return null;
  const rightWindowMs = firstNumber(rightRaw);
  const referenceTimeMs = firstNumber(refRaw);
  if (rightWindowMs === null || referenceTimeMs === null) return null;
  const parts = rightRaw.replace(/(\d),(\d)/g, '$1.$2').split(',');
  const taper = parts.slice(1).find((p) => /[A-Za-z]/.test(p));
  return { referenceTimeMs, rightWindowMs, taper: taper ? taper.trim() : null };
}

/**
 * Do the two halves agree about where t = 0 is, and what does it mean if not?
 *
 * ARTA writes each measurement's own `Reference time`, and a near field taken
 * at 5 mm with the mic re-triggered has a different one from a far field at a
 * metre. The delay fit absorbs the difference — that is what it is for — but
 * then the fitted delay is NOT the acoustic-centre distance a reader might take
 * it for. Say so, with both numbers, rather than printing a delay that invites
 * the wrong reading.
 */
function timeReferenceNote(nearText: string, farText: string, fit: MergeResult): string {
  const refOf = (text: string): number | null => {
    const raw = headerFields(text).get('reference time');
    return raw === undefined ? null : firstNumber(raw);
  };
  const nr = refOf(nearText);
  const fr = refOf(farText);
  const fitted = `the fitted delay is ${(fit.delayUs / 1000).toFixed(4)} ms`;
  if (nr === null || fr === null) {
    return (
      `${fitted}; at least one half states no reference time, so the two time origins cannot be ` +
      `compared and the delay carries whatever difference there is. It is not an acoustic-centre distance.`
    );
  }
  if (Math.abs(nr - fr) < 1e-9) {
    return `${fitted}; both halves state the same reference time (${fr} ms), so the time origins close.`;
  }
  return (
    `${fitted}; the two halves state DIFFERENT reference times (near ${nr} ms, far ${fr} ms, a ` +
    `${(nr - fr).toFixed(3)} ms difference), so the time origins do not close and the fitted delay ` +
    `carries that difference. It is not an acoustic-centre distance.`
  );
}

/* ------------------------------------------------------------------ *
 * 5 — The three checks
 * ------------------------------------------------------------------ */

/**
 * One check's verdict. `ok: false` COLOURS and never blocks — the merge is
 * still written if the designer accepts it, because every one of these three
 * can fail for a reason the designer knows and the app does not (F0).
 */
export interface MergeCheck {
  id: 'splice-band' | 'step-shape' | 'sweep-untouched';
  title: string;
  /** The number this check is about, formatted. Never absent when it ran. */
  reading: string | null;
  ok: boolean | null;
  /** Why it reads what it reads, or why it did not run. */
  why: string;
}

/**
 * CHECK 1 — does the near-field half, after the step model and the level fit,
 * actually agree with the far field across the splice band?
 *
 * `|FF − (NF·model + level)|` on the fit band itself, reported as median, p95
 * and max, and passed on p95 (a single grid point of disagreement is a spike,
 * not a splice that is wrong). This is the check that catches a step model at
 * the wrong corner, a near field of the wrong driver, and a band that reaches
 * where one half is not honest.
 */
export function spliceBandCheck(m: NfMergeResult, band: readonly [number, number]): MergeCheck {
  const resid: number[] = [];
  for (let i = 0; i < m.freq.length; i++) {
    if (m.freq[i] < band[0] || m.freq[i] > band[1]) continue;
    resid.push(m.farDb[i] - (m.nearAdjDb[i] + m.fit.levelDb));
  }
  if (resid.length < 4) {
    return {
      id: 'splice-band',
      title: 'The two halves agree across the splice band',
      reading: null,
      ok: null,
      why: `only ${resid.length} grid points fall inside ${band[0]}–${band[1]} Hz — too few to judge.`,
    };
  }
  const abs = resid.map(Math.abs).sort((a, b) => a - b);
  const median = abs[abs.length >> 1];
  const p95 = abs[Math.floor(abs.length * 0.95)];
  const max = abs[abs.length - 1];
  const lo = Math.min(...resid);
  const hi = Math.max(...resid);
  return {
    id: 'splice-band',
    title: 'The two halves agree across the splice band',
    reading: `p95 ${p95.toFixed(2)} dB (median ${median.toFixed(2)}, max ${max.toFixed(2)})`,
    ok: p95 <= SPLICE_CHECK_TOLERANCE_DB,
    why:
      `|far − (near · step model + ${m.fit.levelDb.toFixed(2)} dB)| over ${band[0].toFixed(0)}–` +
      `${band[1].toFixed(0)} Hz on ${resid.length} points, spread ${lo.toFixed(2)}…${hi >= 0 ? '+' : ''}` +
      `${hi.toFixed(2)} dB; phase residual ${m.fit.residualDeg.toFixed(1)}° rms after the delay fit. ` +
      `±${SPLICE_CHECK_TOLERANCE_DB} dB is a convention, not a property of anything.`,
  };
}

/** One already-merged driver on the same baffle, for check 2. */
export interface StepPeer {
  name: string;
  /** The merged file's own curve. */
  mergedFreq: readonly number[];
  mergedSpl: readonly number[];
  /** The near field that went into it. */
  nearFreq: readonly number[];
  nearSpl: readonly number[];
  nearPhase: readonly number[];
  /** The level its own merge block states it applied. */
  spliceGainDb: number;
}

/**
 * CHECK 2 — is this step the same step the other drivers on this baffle got?
 *
 * A baffle step is a property of the CABINET, not of the driver, so two drivers
 * on one front must show the same one. The peer's EMPIRICAL step is recovered
 * from its own files — merged − near − the gain its block states — smoothed a
 * sixth of an octave, and compared point by point to the shelf this merge got.
 *
 * NOT APPLICABLE is a real answer and the common one: a first merge on a
 * cabinet has no peer, and the check says that instead of passing vacuously.
 */
export function stepShapeCheck(
  step: { hz: number; depthDb: number } | null,
  spliceLoHz: number,
  peers: readonly StepPeer[],
): MergeCheck {
  const title = 'The step matches the other merged drivers on this baffle';
  if (!step || !(step.hz > 0) || !(step.depthDb > 0)) {
    return { id: 'step-shape', title, reading: null, ok: null, why: 'no step model is applied, so there is no shape to compare.' };
  }
  if (peers.length === 0) {
    return {
      id: 'step-shape',
      title,
      reading: null,
      ok: null,
      why: 'no other driver on this baffle has been merged yet — nothing to compare against.',
    };
  }
  const from = step.hz / STEP_CHECK_LOW_DIVISOR;
  const to = spliceLoHz;
  if (!(to > from)) {
    return {
      id: 'step-shape',
      title,
      reading: null,
      ok: null,
      why: `the splice band starts at ${to.toFixed(0)} Hz, at or below ${from.toFixed(0)} Hz where the step would be read — no band to compare in.`,
    };
  }
  const n = Math.max(2, Math.round(Math.log2(to / from) * STEP_CHECK_POINTS_PER_OCT));
  const at = logspace(from, to, n);
  const smooth = (f: readonly number[], y: readonly number[], octaves: number, x: number): number => {
    const a = x * 2 ** (-octaves / 2);
    const b = x * 2 ** (octaves / 2);
    let s = 0;
    let c = 0;
    for (let i = 0; i < f.length; i++) if (f[i] >= a && f[i] <= b) { s += y[i]; c++; }
    return c > 0 ? s / c : NaN;
  };
  const mine = at.map((f) => baffleStepShelfDb([f], step.hz, step.depthDb)[0]);
  const lines: string[] = [];
  let worst = 0;
  let worstPeer = '';
  for (const p of peers) {
    const nearOn = resample(p.nearFreq, p.nearSpl, p.nearPhase, p.mergedFreq, { clampEdges: true });
    const empirical = p.mergedSpl.map((v, i) => v - nearOn.spl[i] - p.spliceGainDb);
    const d = at.map((f, i) => smooth(p.mergedFreq, empirical, STEP_CHECK_SMOOTHING_OCT, f) - mine[i]);
    const good = d.filter(Number.isFinite);
    if (good.length === 0) {
      lines.push(`${p.name}: no overlapping data in ${from.toFixed(0)}–${to.toFixed(0)} Hz`);
      continue;
    }
    const mean = good.reduce((a2, b2) => a2 + b2, 0) / good.length;
    const spread = Math.sqrt(good.reduce((a2, b2) => a2 + (b2 - mean) ** 2, 0) / good.length);
    const mx = Math.max(...good.map(Math.abs));
    if (mx > worst) { worst = mx; worstPeer = p.name; }
    lines.push(
      `${p.name}: empirical step − shelf ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} dB mean, ` +
        `${spread.toFixed(2)} dB spread, ${mx.toFixed(2)} dB worst`,
    );
  }
  if (worstPeer === '') {
    return { id: 'step-shape', title, reading: null, ok: null, why: lines.join('; ') };
  }
  return {
    id: 'step-shape',
    title,
    reading: `${worst.toFixed(2)} dB worst (${worstPeer})`,
    ok: worst <= SPLICE_CHECK_TOLERANCE_DB,
    why:
      `each peer's own step recovered as merged − near − its stated gain, smoothed ` +
      `${(STEP_CHECK_SMOOTHING_OCT * 12).toFixed(0)}/12 octave over ${from.toFixed(0)}–${to.toFixed(0)} Hz ` +
      `(${n} points): ${lines.join('; ')}. A difference here is the shelf model, not an error — it is a ` +
      `stated model and the published formulas disagree by about 3×.`,
  };
}

/** FNV-1a over the text, hex. Enough to see a file move; not a signature. */
export function textChecksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    if (text.charCodeAt(i) > 0xff) {
      h ^= text.charCodeAt(i) >>> 8;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * CHECK 3 — the impedance sweep is independent of all this, and unchanged.
 *
 * The merge is a response operation: it never reads the sweep and never writes
 * one. That is a structural fact and it stays true by construction — which is
 * exactly why it is worth CHECKING rather than asserting, because a structural
 * fact that nobody measures is how a silent coupling gets in. M-1's script
 * checked it with `git status`; here it is the file's bytes before and after.
 */
export function sweepUntouchedCheck(before: { name: string; raw: string } | null, after: { name: string; raw: string } | null): MergeCheck {
  const title = 'The impedance sweep is independent and unchanged';
  if (before === null && after === null) {
    return { id: 'sweep-untouched', title, reading: null, ok: null, why: 'this branch has no impedance measurement loaded — nothing to leave alone.' };
  }
  if (before === null || after === null) {
    return {
      id: 'sweep-untouched',
      title,
      reading: after === null ? 'gone' : 'appeared',
      ok: false,
      why: `the impedance measurement ${after === null ? 'disappeared' : 'appeared'} across the merge — it should have done neither.`,
    };
  }
  const cb = textChecksum(before.raw);
  const ca = textChecksum(after.raw);
  const same = cb === ca && before.name === after.name;
  return {
    id: 'sweep-untouched',
    title,
    reading: `${after.name}, ${after.raw.length} bytes, checksum ${ca}`,
    ok: same,
    why: same
      ? 'byte-identical before and after; the merge takes no impedance as input and produces none as output.'
      : `it changed: ${before.name}/${cb} became ${after.name}/${ca}. The merge cannot have done that.`,
  };
}

/* ------------------------------------------------------------------ *
 * 6 — Where the merged response may be believed
 * ------------------------------------------------------------------ */

export interface ValidFromSuggestion {
  hz: number | null;
  reason: string;
  /** True when the app cannot answer and the designer must state it. */
  mustBeStated: boolean;
}

/**
 * The floor the merged file will declare — DERIVED where it can be, UNKNOWN
 * where it cannot, and never a plausible number.
 *
 * Three cases and they are not symmetric:
 *
 *  - SEALED (or no reflex evidence): the cone is the whole radiator, so the
 *    merge is honest as far down as the near field itself reaches.
 *  - REFLEX WITH THE PORT SUMMED: same answer, and the reason says the port is
 *    in — which is exactly what Sanders August header records, and why his
 *    woofers declare 20.5 Hz rather than the ~80 he notes without it.
 *  - REFLEX WITHOUT THE PORT: UNKNOWN, and the designer states it. Not f_b and
 *    not a multiple of it: at the tuning the cone is at its MINIMUM and the
 *    port is carrying the output, so the cone-only error is largest exactly
 *    there and does not fall off in a direction a factor could capture. The
 *    app shows f_b, the near field's own reach and the far field's floor, and
 *    the designer decides — F0.
 */
export function suggestValidFrom(opts: {
  enclosure: 'sealed' | 'reflex' | 'unknown';
  boxTuneHz: number | null;
  portSummed: boolean;
  nearLowestHz: number;
  gridLowestHz: number;
  farFloorHz: number | null;
}): ValidFromSuggestion {
  const reach = Math.max(opts.nearLowestHz, opts.gridLowestHz);
  const carried = `the near field carries this branch down to ${reach.toFixed(1)} Hz`;
  if (opts.enclosure === 'reflex' && !opts.portSummed) {
    return {
      hz: null,
      reason:
        `reflex enclosure with the port NOT measured: below the tuning` +
        (opts.boxTuneHz !== null ? ` (f_b ${opts.boxTuneHz.toFixed(1)} Hz from the impedance)` : '') +
        ` the cone is at its minimum and the port carries the output, so the cone alone is not the ` +
        `system — and the error is largest at the tuning, not below it. State the floor yourself; ` +
        `${carried} and the far field's own floor is ` +
        `${opts.farFloorHz !== null ? `${opts.farFloorHz.toFixed(0)} Hz` : 'not stated'}.`,
      mustBeStated: true,
    };
  }
  if (opts.enclosure === 'reflex') {
    return {
      hz: reach,
      reason:
        `${carried} and the port is summed into it, so the merge is the whole radiating system` +
        (opts.boxTuneHz !== null ? ` through its tuning (f_b ${opts.boxTuneHz.toFixed(1)} Hz)` : '') +
        `; the far-field gate` +
        (opts.farFloorHz !== null ? ` (${opts.farFloorHz.toFixed(0)} Hz)` : '') +
        ` applies only above the splice.`,
      mustBeStated: false,
    };
  }
  return {
    hz: reach,
    reason:
      `${opts.enclosure === 'sealed' ? 'sealed enclosure: the cone is the whole radiator, and ' : ''}` +
      `${carried}; the far-field gate` +
      (opts.farFloorHz !== null ? ` (${opts.farFloorHz.toFixed(0)} Hz)` : '') +
      ` applies only above the splice.`,
    mustBeStated: false,
  };
}

/* ------------------------------------------------------------------ *
 * 7 — The file
 * ------------------------------------------------------------------ */

export interface MergedFileInput {
  merge: NfMergeResult;
  farName: string;
  nearName: string;
  portName?: string | null;
  portNote?: string | null;
  spliceBandHz: readonly [number, number];
  step: { hz: number; depthDb: number } | null;
  cabinetStepHz?: number | null;
  validFromHz: number;
  validFromReason: string;
  /** ISO date, `YYYY-MM-DD`. The caller owns the clock. */
  madeOn: string;
  /** A branch label for the first comment line ("woofer", "mid"). */
  branchLabel: string;
}

/**
 * THE MERGE BLOCK'S FIELD NAMES ARE THE CONVENTION, and they are the only part
 * of a merged file that anything reads.
 *
 * M-1 wrote them and taught `parseArtaHeader` to read them on the NAME, not on
 * prose; P-1 taught the v1 side the same names for the same reason, after a
 * prose line in one of these very blocks was read as a broken window statement
 * and blocked Optimize on all three of Sanders merged files. So this list is
 * duplicated nowhere: it is written here and read by two independent parsers,
 * and `nfMerge.test.ts` pins that both of them read back what this writes.
 *
 * `Merge date` is deliberately NOT a field of its own: an unparsed field is
 * decoration. The date and the MODEL-validated marker go inside `Merge status`,
 * which both readers already carry into every downstream note.
 */
export function renderMergeBlock(input: MergedFileInput): string[] {
  const { merge, step } = input;
  const band = input.spliceBandHz;
  const ffWindow = windowLineOf(merge);
  const stepLine =
    step === null
      ? 'none (the near-field half is used as measured, half space)'
      : `shelf ${step.depthDb} dB @ ${step.hz} Hz, first order (baffleStepShelfDb), minimum phase` +
        (input.cabinetStepHz !== null && input.cabinetStepHz !== undefined
          ? `; cabinet derivation ${input.cabinetStepHz.toFixed(1)} Hz`
          : '; no cabinet derivation (baffle width not stated)') +
        (merge.stepModelSensitivityDb !== null
          ? `; MODEL SENSITIVITY: a second-order shelf differs by up to ` +
            `${merge.stepModelSensitivityDb.toFixed(2)} dB below the splice, and a real diffraction ` +
            `model by more — the published formulas disagree by about 3x`
          : '');
  return [
    `* ${input.branchLabel} — NF/FF merge made by Crossover Studio (${NF_MERGE_VERSION})`,
    `* basis: ${input.nearName} (near field)${input.portName ? ` + ${input.portName} (port)` : ''} + ${input.farName} (gated far field)`,
    `* status: MODEL-validated — below the splice this is a near field plus a step MODEL, not a measurement at distance`,
    `* Merge = NF/FF`,
    `* Valid from = ${round1(input.validFromHz)} Hz`,
    `* Valid to = ${Math.round(merge.freq[merge.freq.length - 1])} Hz`,
    `* Merge NF source = ${input.nearName}`,
    `* Merge FF source = ${input.farName}`,
    `* Merge FF window = ${ffWindow}`,
    `* Merge splice band = ${round1(band[0])}-${round1(band[1])} Hz`,
    `* Merge splice fit = gain ${merge.fit.levelDb.toFixed(2)} dB, delay ${(merge.fit.delayUs / 1000).toFixed(4)} ms, ` +
      `offset ${merge.fit.offsetDeg.toFixed(1)} deg, phase residual ${merge.fit.residualDeg.toFixed(1)} deg rms`,
    `* Merge step model = ${stepLine}`,
    `* Merge port model = ${input.portName ? (input.portNote ?? 'summed, weight not recorded') : 'none (no port measurement was given)'}`,
    `* Merge prediction = none (no break-in or other model prediction applied)`,
    `* Merge floor reason = ${oneLine(input.validFromReason)}`,
    `* Merge status = MODEL-validated merge made by Crossover Studio on ${input.madeOn}; ${oneLine(merge.timeReferenceNote)}`,
  ];
}

const round1 = (v: number): string => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));

/** A block field is ONE line: a newline in it would end the field early and a
 *  `=` inside it would be read as the next field's name. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').replace(/=/g, ':').trim();

/** The far-field half's own window, in the form `Merge FF window` is parsed in. */
function windowLineOf(merge: NfMergeResult): string {
  const w = merge.farWindow;
  if (!w) return 'not stated in the far field s header';
  return (
    `reference ${w.referenceTimeMs} ms, right ${w.rightWindowMs} ms` +
    (w.taper ? `, ${w.taper}` : '')
  );
}

/**
 * The merged FRD, block and all, in the same layout ARTA writes and both
 * parsers read: comment lines, a column header, then `freq  spl  phase`.
 */
export function renderMergedFrd(input: MergedFileInput): string {
  const { merge } = input;
  const fmt = (v: number, d: number, w: number) => v.toFixed(d).padStart(w);
  const rows = merge.freq.map(
    (f, i) => `${fmt(f, 4, 12)}${fmt(merge.spl[i], 3, 10)}${fmt(merge.phaseDeg[i], 3, 10)}`,
  );
  return [...renderMergeBlock(input), 'Freq[Hz]  dBSPL  Phase[Deg]', ...rows].join('\n') + '\n';
}

/** `woofer_up_hor_0.txt` → `woofer_up_hor_0_merged.frd`. */
export function mergedFileName(farName: string): string {
  const base = farName.replace(/\.[A-Za-z0-9]+$/, '');
  return `${base}_merged.frd`;
}
