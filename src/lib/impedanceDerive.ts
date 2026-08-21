/**
 * Deriving ONE driver's impedance from a measurement of N of them in parallel.
 *
 * WHY THIS EXISTS AS AN EXPLICIT STEP (aug 2026, Sanders' Koan 2951 dataset).
 * His two Satori WO24P-8 woofers are measured as a single parallel LIMP sweep,
 * and that is the RIGHT source: the acoustic load inside the box is only
 * correct when both cones are driven, so a solo measurement of one woofer
 * describes an enclosure that does not exist in the finished speaker. A solo
 * sweep is diagnosis, not input.
 *
 * But the network model wants each driver as its own part — two Driver parts
 * hanging off the same node, each with its own acoustic transfer and its own
 * z-offset — and it computes the parallel connection itself. Feeding the
 * parallel measurement to both parts would therefore halve the load a second
 * time. Hence the derivation, written down rather than assumed:
 *
 *     Z_single(f) = N · Z_parallel(f)
 *
 * Magnitude scales, phase does not: N identical complex impedances in parallel
 * are Z/N, so inverting that is a real multiply and leaves the argument alone.
 *
 * Everything here is pure and clock-free (the caller supplies the date), in
 * line with the rest of src/lib.
 */

import type { ZmaMeasurement } from './types.ts';

/** First line of a derived ZMA, and the marker `readParallelDerivation` finds. */
const DERIVED_PREFIX = '* Derived from a PARALLEL impedance measurement';

export interface ParallelDerivation {
  /** How many identical drivers were measured together. */
  n: number;
  /** The file the parallel sweep came from. */
  sourceName: string;
  /** ISO date (YYYY-MM-DD) the derivation was made — supplied by the caller,
   *  because lib code carries no wall clock. */
  derivedAt: string;
}

/**
 * |Z| of one driver from |Z| of N in parallel. Phase is returned unchanged by
 * the caller; it is not a parameter here precisely so that no one can
 * accidentally "correct" it.
 */
export function singleFromParallelMagnitude(
  magnitude: readonly number[],
  n: number,
): number[] | null {
  if (!Number.isInteger(n) || n < 1) return null;
  for (const m of magnitude) {
    // A non-positive magnitude is a broken or mis-decoded measurement; scaling
    // it would produce a confident nonsense load rather than an error.
    if (!(m > 0) || !Number.isFinite(m)) return null;
  }
  return magnitude.map((m) => m * n);
}

/**
 * The inverse, for round-trip checks and for predicting what the network
 * should show at its terminals: N identical single-driver impedances in
 * parallel.
 */
export function parallelFromSingleMagnitude(
  magnitude: readonly number[],
  n: number,
): number[] | null {
  if (!Number.isInteger(n) || n < 1) return null;
  for (const m of magnitude) {
    if (!(m > 0) || !Number.isFinite(m)) return null;
  }
  return magnitude.map((m) => m / n);
}

/**
 * Serialise a derived single-driver impedance as ZMA text, carrying its
 * provenance in the leading comments.
 *
 * Same doctrine as `limToZmaText`: everything downstream of the import
 * boundary — autosave, project file, VituixCAD folder export — is text, so the
 * conversion happens once, here, and the origin travels with the data instead
 * of living in someone's memory. `readParallelDerivation` reads it back, so the
 * file inventory can say "derived, not measured".
 */
export function derivedZmaText(m: ZmaMeasurement, d: ParallelDerivation): string | null {
  const mag = singleFromParallelMagnitude(m.magnitude, d.n);
  if (!mag) return null;
  const lines = [
    `${DERIVED_PREFIX} of ${d.n} drivers`,
    `* source="${d.sourceName}" n=${d.n} derived=${d.derivedAt}`,
    '* Z_single = n × Z_parallel (magnitude scaled, phase unchanged).',
    '* This is NOT a direct measurement of one driver. The parallel sweep is',
    '* the correct source: the acoustic load in the box is only right when',
    '* every cone is driven. A solo sweep is diagnosis, not input.',
    ...m.meta.rawComments.map((c) => `* ${c}`),
    '* freq(Hz) |Z|(ohm) phase(deg)',
  ];
  for (let i = 0; i < m.freq.length; i++) {
    lines.push(`${m.freq[i]} ${mag[i]} ${m.phase[i]}`);
  }
  return lines.join('\n') + '\n';
}

/** Read the provenance back out of a derived ZMA; null for a plain measurement. */
export function readParallelDerivation(text: string): ParallelDerivation | null {
  if (!text.startsWith(DERIVED_PREFIX)) return null;
  const m = /^\* source="([^"]*)" n=(\d+) derived=(\S+)/m.exec(text);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isInteger(n) || n < 1) return null;
  return { sourceName: m[1], n, derivedAt: m[3] };
}

export interface ReCheck {
  /** Lowest |Z| found, and where. */
  minOhm: number;
  atHz: number;
  /** Deviation from the stated Re, percent of Re (signed: + = measured higher). */
  deviationPct: number;
  /** 'ok' | 'high' (suspicious, warn) | 'impossible' (below Re — hard error). */
  verdict: 'ok' | 'high' | 'impossible';
  ok: boolean;
  note: string;
}

/**
 * Sanity-check a derived single-driver impedance against the driver's stated
 * DC resistance.
 *
 * The minimum of |Z| above resonance sits close to Re for a normal driver, so
 * a large gap means something outside the driver: lead resistance, contact
 * resistance in the clip, or a LIMP calibration that was never done. It can
 * also mean the derivation itself is wrong — a missing or doubled factor N
 * shows up here as exactly 2x or 0.5x, which is why this check belongs next to
 * the derivation and not somewhere downstream.
 *
 * Search starts above `fromHz` so the low-frequency resonance peaks, and any
 * sub-resonance noise, cannot supply the minimum.
 */
export function checkReAgainstZ(
  freq: readonly number[],
  magnitude: readonly number[],
  reOhm: number,
  opts: { highPct?: number; fromHz?: number } = {},
): ReCheck | null {
  const { highPct = 20, fromHz = 100 } = opts;
  if (!(reOhm > 0) || freq.length === 0 || freq.length !== magnitude.length) return null;
  let minOhm = Infinity;
  let atHz = 0;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < fromHz) continue;
    if (magnitude[i] > 0 && magnitude[i] < minOhm) {
      minOhm = magnitude[i];
      atHz = freq[i];
    }
  }
  if (!isFinite(minOhm)) return null;
  const deviationPct = ((minOhm - reOhm) / reOhm) * 100;
  /* ASYMMETRIC ON PURPOSE. A voice coil cannot present less than its own DC
   * resistance, so min |Z| BELOW Re is not a tolerance question — it is
   * physically impossible, and it is exactly what a forgotten or doubled factor
   * N produces (−50 % / +100 %). Above Re there is legitimate room: residual
   * damping and the start of the inductive rise put a WO24's minimum typically
   * 5–15 % above Re, so a symmetric 5 % band would fire on healthy data. */
  const verdict: ReCheck['verdict'] =
    minOhm < reOhm ? 'impossible' : deviationPct > highPct ? 'high' : 'ok';
  const where = `min |Z| ${minOhm.toFixed(2)} Ω at ${Math.round(atHz)} Hz vs Re ${reOhm.toFixed(2)} Ω ` +
    `(${deviationPct >= 0 ? '+' : ''}${deviationPct.toFixed(1)} %)`;
  const note =
    verdict === 'ok'
      ? where
      : verdict === 'impossible'
        ? `⚠ ${where} — a voice coil cannot go below its own DC resistance. Either the ` +
          `parallel-derivation factor is wrong (a forgotten n reads as −50 %), the stated ` +
          `Re is wrong, or the LIMP calibration is off`
        : `⚠ ${where} — higher than a healthy minimum usually sits (5–15 % above Re). ` +
          `Check the leads and the clip, the LIMP calibration, or whether n was applied ` +
          `twice (that reads as +100 %)`;
  return { minOhm, atHz, deviationPct, verdict, ok: verdict === 'ok', note };
}
