/**
 * THE VITUIXCAD PHASE BRIDGE — one implementation, since V41 two callers.
 *
 * WHAT THE BRIDGE IS. The app designs on the REAL MEASURED phase, which already
 * contains the inter-driver arrival-time Δ. VituixCAD, exported with
 * `MinimumPhase=True`, RECONSTRUCTS each driver's phase from its magnitude and
 * then adds whatever `Delay` the file gives it. So the number that makes the two
 * programs agree is not the raw bulk delay of the measured phase — that is
 * contaminated by each driver's own minimum-phase slope — but the EXCESS-phase
 * delay: measured phase minus reconstructed minimum phase, fitted as a pure
 * delay.
 *
 * MEASURED, ON THE KOAN SET, and the two answers have opposite signs: the raw Δ
 * says the tweeter arrives 47 µs LATER, the excess Δ says it arrives 50 µs
 * EARLIER — which is what a tweeter sitting ~17 mm proud of the mid physically
 * does. The excess-based bridge reproduced the app's own measured simulation
 * within ~2° where the raw-Δ bridge was ~78° out. That is the whole reason this
 * function is not `estimateBulkDelay` with different arguments.
 *
 * WHY IT LIVES HERE SINCE V41. It was a local function inside `App.tsx`, which
 * made the export bridge unreachable from a script — and V40 needs exactly that:
 * three netlists exported to VituixCAD so the two phase measures can be
 * adjudicated by a third party. Copying twelve lines into a script would have
 * put a second implementation of the bridge beside the first, which is the
 * failure mode this project keeps a whole family of notes about (V21). Behaviour
 * is unchanged: the app imports the same function it used to define.
 */

import { logspace, resample } from './dsp.ts';
import { minimumPhaseDeg } from './minphase.ts';
import { estimateBulkDelay } from './timing.ts';

/** A parsed FRD: frequency, level and measured phase on the file's own grid. */
export interface MeasuredResponseFile {
  freq: number[];
  spl: number[];
  phase: number[];
}

/**
 * The excess-phase bulk delay of one measured response, in MILLISECONDS.
 *
 * `null` when it cannot be measured, and the guards are not decoration:
 *
 *  · the reconstruction grid must stay INSIDE the file, because `resample`
 *    refuses to extrapolate. An ARTA export ending at 19 999.5 Hz against a
 *    fixed 20 000 Hz top threw, was caught, and every consumer silently had
 *    nothing (Sanders' set);
 *  · a file too narrow to hold the fit band gets `null` rather than a fit
 *    through octaves it does not cover.
 */
export function excessDelayMsOf(frd: MeasuredResponseFile): number | null {
  try {
    const lo = Math.max(500, frd.freq[0] * 1.05);
    const hi = Math.min(5000, frd.freq[frd.freq.length - 1] * 0.95);
    if (hi <= lo * 1.5) return null;
    const top = Math.min(20000, frd.freq[frd.freq.length - 1]);
    const g = resample(frd.freq, frd.spl, frd.phase, logspace(lo, top, 400));
    const mp = minimumPhaseDeg(g.freq, g.spl);
    const excess = g.phaseDeg.map((p, i) => p - mp[i]);
    return estimateBulkDelay(g.freq, excess, [lo, hi]).delayMs;
  } catch {
    return null;
  }
}

/**
 * The per-driver `Delay` values a VituixCAD export carries, in MICROSECONDS.
 *
 * NORMALISED so the earliest driver gets 0 and every later one a POSITIVE
 * delay, over whatever set of drivers is present — which for two drivers is
 * exactly the arithmetic the two-way export always did. A driver whose excess
 * delay could not be measured gets 0 rather than being dropped: the file needs
 * a number, and 0 is the honest "no offset known" rather than an invented one.
 */
export function bridgeDelaysUs(
  excessMsByKey: Record<string, number | null>,
): Record<string, number> {
  const present = Object.values(excessMsByKey).filter((v): v is number => v !== null);
  const earliest = present.length > 0 ? Math.min(...present) : 0;
  const out: Record<string, number> = {};
  for (const [key, ex] of Object.entries(excessMsByKey)) {
    out[key] = ex === null ? 0 : Math.round((ex - earliest) * 1000 * 10) / 10;
  }
  return out;
}
