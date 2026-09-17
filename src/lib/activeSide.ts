/**
 * H-1 — THE STATED HANDOVER TO AN ACTIVE SIDE, AND THE MODELLED BRANCH THAT
 * STANDS IN FOR IT.
 *
 * WHAT IT IS. A hybrid loudspeaker: the lowest way (or ways) is driven by its
 * own amplifier through a DSP filter, the ways above it share one amplifier and
 * one passive network. The passive design is then a question that cannot be
 * asked of the passive network alone — the sum a listener hears contains a
 * branch that is not in the netlist — and every number that judges a SUM
 * (ripple, M-K, lobing, the target curve) has to be able to see it.
 *
 * WHAT THIS MODULE OWNS, AND WHAT IT DELIBERATELY DOES NOT.
 *   · the STATED block itself: the handover frequency, the acoustic target
 *     shape, and who stated it. Nothing here has a default (P4): a project
 *     that states no active side gets exactly the app it always had;
 *   · the two target shapes that follow from it — the HIGH-PASS the lowest
 *     PASSIVE way must realise, and the LOW-PASS the active side must realise;
 *   · the transfer of the MODELLED branch, as one function with one
 *     implementation (A3g);
 *   · the DERIVATION of the three DSP settings the model needs (gain, delay,
 *     polarity) from the measurements and the stated shapes alone — class A,
 *     deterministic, and fixed before any search runs so that no search can
 *     move them.
 *
 * It does NOT own the active side's own protection, excursion or level limits.
 * Those belong to the active amplifier and its DSP, not to the passive network
 * this app designs, and inventing them here would be inventing a second design.
 *
 * WHY IT LIVES IN `src/lib/` AND NOT IN `engine2/`. The same reason
 * `impedanceFloor.ts`, `phaseAdmission.ts`, `targetLevel.ts` and
 * `rippleTargetBand.ts` live here: the CHAIN (`designChain`, `vfOptimizer`,
 * `netOptimizer`) has to read it, and nothing outside the UI entry points may
 * import `engine2/` — that is the dependency arrow the toggle invariant rests
 * on.
 *
 * THE MEASURED SET IS ASSUMED TIME-ALIGNED, and that assumption is this
 * project's own: every casus-1 chain run states `offsetMm: 0` on every branch,
 * because the files share one ARTA reference time. The delay derived here is
 * therefore not a path length — it is the time shift that lines the modelled
 * branch up with the passive one GIVEN those measurements, and its uncertainty
 * is the uncertainty of the merge fits underneath them (M-4). The final value
 * belongs in the cabinet, on a reversed-polarity null; the block says so.
 */

import type { Complex } from './complex.ts';
import { cplx, mul } from './complex.ts';
import type { FilterKind, HpLpSpec } from './filters.ts';
import { evalHpLp } from './filters.ts';
import type { GriddedResponse } from './dsp.ts';

/**
 * How far either side of the stated handover the level match and the delay fit
 * are read, in OCTAVES.
 *
 * A margin and not a frequency (P6): it is the region where both flanks are
 * within a few dB of each other and the sum is therefore decided, and it is the
 * same half octave `rippleTargetBand.ts` uses for the same kind of reason.
 */
export const HANDOVER_MATCH_OCTAVES = 0.5;

/**
 * How finely the delay is searched, in steps per period of the handover.
 *
 * A PROBE resolution, not a project number: what the answer is worth is decided
 * by the merge-fit uncertainty underneath the measurements (M-4 measured 8-12
 * degrees of it), which at 450 Hz is 0.05-0.07 ms — two orders above this step.
 */
const DELAY_STEPS_PER_PERIOD = 4000;

/**
 * How far the delay is searched, in PERIODS of the handover, either way.
 *
 * HALF A PERIOD AND NOT MORE, and the bound is a statement rather than a
 * convenience. A delay of one whole period more sums identically on axis at the
 * handover and differently everywhere else; nothing in a one-octave on-axis fit
 * can tell the two apart, so a search that ranged further would be picking
 * between them on rounding. The measured set shares one time reference (every
 * casus-1 chain run states `offsetMm: 0`), so the physical answer is the one
 * nearest zero, and half a period either way is exactly the interval that holds
 * exactly one of each family.
 */
const DELAY_SEARCH_PERIODS = 0.5;

/** Versiestring — a behaviour change here is a version bump (A5e.5). */
export const ACTIVE_SIDE_VERSION = 'active-handover/1.0';

/**
 * THE STATED BLOCK. One handover, one shape, one attribution.
 *
 * `shape` is the ACOUSTIC target of BOTH flanks, which is what an alignment is:
 * naming LR4 at 450 Hz says the passive way must arrive at an acoustic LR4
 * high-pass there and the active side at its low-pass mirror. It is stated once
 * and read twice rather than stated twice, so the two halves cannot disagree.
 */
export interface ActiveHandover {
  /** Driver id of the LOWEST PASSIVE way — the way that gets the high-pass. */
  passiveWay: string;
  /** Driver id of the way the ACTIVE side drives — the modelled branch. */
  activeWay: string;
  /** The stated acoustic handover, Hz. */
  hz: number;
  /** The stated acoustic target shape of both flanks. */
  kind: FilterKind;
  order: 1 | 2 | 3 | 4;
  /** Who stated it and when. Never derived, never defaulted. */
  statedBy: string;
}

/** The three DSP settings the modelled branch carries. */
export interface ModelBranchSettings {
  gainDb: number;
  /** Positive = the active side is DELAYED relative to the passive ways. */
  delayMs: number;
  inverted: boolean;
}

/** Everything needed to evaluate the modelled branch's transfer. */
export interface ModelBranchSpec extends ModelBranchSettings {
  kind: FilterKind;
  order: 1 | 2 | 3 | 4;
  hz: number;
}

/** The HIGH-PASS target the lowest passive way must realise. */
export function activeHighPass(h: Pick<ActiveHandover, 'hz' | 'kind' | 'order'>): HpLpSpec {
  return { enabled: true, kind: h.kind, order: h.order, freq: h.hz };
}

/** The LOW-PASS mirror the active side must realise. */
export function activeLowPass(h: Pick<ActiveHandover, 'hz' | 'kind' | 'order'>): HpLpSpec {
  return { enabled: true, kind: h.kind, order: h.order, freq: h.hz };
}

/** The band the level match and the delay fit are read over, Hz. */
export function handoverBandHz(hz: number): [number, number] {
  return [hz / 2 ** HANDOVER_MATCH_OCTAVES, hz * 2 ** HANDOVER_MATCH_OCTAVES];
}

/**
 * THE MODELLED BRANCH'S TRANSFER — one implementation, several readers.
 *
 * `LP(f) · 10^(g/20) · e^(−j2πfτ) · (inverted ? −1 : +1)`, which is exactly
 * what a DSP crossover applies and nothing more. The delay is a pure phase
 * slope; it is NOT an `offsetMm`, because an offset in this app is a statement
 * about where a driver sits and this is a statement about what a processor does.
 */
export function modelBranchTransfer(spec: ModelBranchSpec, freq: readonly number[]): Complex[] {
  const g = 10 ** (spec.gainDb / 20) * (spec.inverted ? -1 : 1);
  const tau = spec.delayMs / 1000;
  const lp: HpLpSpec = { enabled: true, kind: spec.kind, order: spec.order, freq: spec.hz };
  return freq.map((f) => {
    const w = -2 * Math.PI * f * tau;
    return mul(mul(evalHpLp(lp, 'lp', f), cplx(g)), cplx(Math.cos(w), Math.sin(w)));
  });
}

/** The modelled branch as a gridded response: the measured way times its transfer. */
export function modelBranchResponse(
  measured: GriddedResponse,
  spec: ModelBranchSpec,
): GriddedResponse {
  const h = modelBranchTransfer(spec, measured.freq);
  const out: GriddedResponse = { freq: [...measured.freq], spl: [], phaseDeg: [] };
  for (let i = 0; i < measured.freq.length; i++) {
    const m = h[i];
    const mag = Math.hypot(m.re, m.im);
    out.spl.push(measured.spl[i] + 20 * Math.log10(Math.max(mag, 1e-30)));
    /* The polarity rides in the transfer's sign, so its 180° arrives through
     * the same atan2 as everything else rather than as a second addition. */
    out.phaseDeg.push(measured.phaseDeg[i] + (Math.atan2(m.im, m.re) * 180) / Math.PI);
  }
  return out;
}

/**
 * H-1 — THE LEVEL MATCH, and it is the one rule every evaluation applies.
 *
 * How many dB the modelled branch has to move to sit at the same level as the
 * passive branch it hands over to, over the handover band. Energy means, both
 * sides, so the answer is the same number the panel would read off the two
 * curves.
 *
 * WHY IT IS RE-DERIVED PER EVALUATION AND NOT FIXED BEFORE THE SEARCH — and
 * this is a measurement, not a preference. H-1 first fixed the gain before the
 * run, class A, on the passive way at the shape the handover STATES. A real
 * high-pass ladder into a real driver impedance is lossy where an ideal filter
 * is not, so the delivered branch came back 2.3-3.2 dB under that, and a sum
 * judged with the active side 3 dB too loud is a sum about a loudspeaker
 * nobody will build. Closing the loop with a SECOND PASS did not help: pass 1
 * asked -0.66 dB, its delivered network asked -3.87, pass 2's delivered network
 * asked -5.69. The tuner absorbs part of the level error into the passive
 * branches every time, so the iteration chases its own tail.
 *
 * A LEVEL MATCH IS NOT A SEARCH PARAMETER. It is the same normalisation
 * `bandStd` already performs on the sum — absolute level is not what a
 * crossover is judged on — applied to the one branch whose level lives in a
 * processor instead of in the netlist. Every candidate gets it by the same
 * rule, so no candidate can choose a flattering one; what a candidate CAN
 * still not do is hide a droop, because the window and the RMS see the shape.
 *
 * THE DELAY AND THE POLARITY ARE NOT LEVELLED and stay fixed before the search:
 * those a search genuinely could abuse, and they are the physical alignment.
 */
export function levelMatchDb(
  active: GriddedResponse,
  passive: GriddedResponse,
  bandHz: readonly [number, number],
): number | null {
  const a = meanDbIn(active, bandHz);
  const p = meanDbIn(passive, bandHz);
  return a === null || p === null ? null : p - a;
}

/** Energy mean of a response over a band, dB. Null when the band holds no point. */
function meanDbIn(g: GriddedResponse, band: readonly [number, number]): number | null {
  let acc = 0;
  let n = 0;
  for (let i = 0; i < g.freq.length; i++) {
    if (g.freq[i] < band[0] || g.freq[i] > band[1]) continue;
    if (!Number.isFinite(g.spl[i])) continue;
    acc += 10 ** (g.spl[i] / 10);
    n++;
  }
  return n > 0 ? 10 * Math.log10(acc / n) : null;
}

/** What a derivation could not answer, and which input was missing. */
export interface ModelBranchDerivation {
  settings: ModelBranchSettings | null;
  /** Peak-to-peak flatness of the ideal-shape sum over the handover band, dB. */
  handoverWindowDb: number | null;
  /** What the OTHER polarity would have scored — the tegenproef, always present. */
  otherPolarityWindowDb: number | null;
  /**
   * THE QUANTITY THE FIT MAXIMISED: how far the summed level sits above the
   * level the same two branches make with the modelled one REVERSED, averaged
   * over the handover band, dB. Deep = in phase.
   */
  nullMarginDb?: number | null;
  /** The same for the polarity that was not chosen, at ITS own best delay. */
  otherPolarityNullMarginDb?: number | null;
  otherPolarityDelayMs?: number | null;
  /** The band the match and the fit were read over. */
  bandHz: [number, number];
  /** Empty when everything was derivable; otherwise what was missing, by name. */
  off: string[];
}

/**
 * DERIVE THE THREE DSP SETTINGS from the measurements and the stated shapes
 * alone — class A, and that is the point of deriving them here rather than in
 * the chain.
 *
 * GAIN levels the two branches over the handover band: with both flanks at
 * their stated shape the two are the same number of dB down there, so matching
 * them there matches their passbands, and it is the region that decides the sum.
 *
 * DELAY and POLARITY are read off the IDEAL shapes, before any network exists.
 * That is deliberate: a delay fitted on the delivered network would be a knob
 * the search could move, and then the sum a candidate was judged on would
 * depend on a number the candidate chose. Fixed first, judged after. What the
 * DELIVERED network would prefer is a READING and belongs in the target block.
 *
 * The polarity is chosen by MEASUREMENT (which one sums flatter over the
 * handover band) and never from the alignment's textbook rule: LR2 wants a
 * reversal and LR4 does not, but a real pair of measured drivers with a fitted
 * delay does not always agree with the textbook, and the tegenproef — what the
 * other polarity scored — travels with the answer so a reader can see by how
 * much.
 */
export function deriveModelBranch(
  h: ActiveHandover,
  activeMeasured: GriddedResponse | null,
  passiveMeasured: GriddedResponse | null,
): ModelBranchDerivation {
  const bandHz = handoverBandHz(h.hz);
  if (!passiveMeasured) {
    return {
      settings: null,
      handoverWindowDb: null,
      otherPolarityWindowDb: null,
      bandHz,
      off: [`no measured on-axis response for the passive way "${h.passiveWay}"`],
    };
  }
  /* The passive side AT ITS STATED SHAPE — the thing the model has to meet
   * while no network exists yet. */
  const hp = activeHighPass(h);
  const passive: GriddedResponse = { freq: [...passiveMeasured.freq], spl: [], phaseDeg: [] };
  for (let i = 0; i < passiveMeasured.freq.length; i++) {
    const t = evalHpLp(hp, 'hp', passiveMeasured.freq[i]);
    passive.spl.push(passiveMeasured.spl[i] + 20 * Math.log10(Math.max(Math.hypot(t.re, t.im), 1e-30)));
    passive.phaseDeg.push(passiveMeasured.phaseDeg[i] + (Math.atan2(t.im, t.re) * 180) / Math.PI);
  }
  return fitModelBranch(h, activeMeasured, passive);
}

/**
 * THE FIT ITSELF, against whatever the passive side actually is.
 *
 * Two readers and one implementation (A3g): `deriveModelBranch` hands it the
 * passive way at its STATED shape — the class-A answer, fixed before any search
 * — and the report hands it the DELIVERED branch of a loaded netlist, which is
 * the reading that says what the built network would have preferred. The
 * difference between the two is the honest measure of how far the realisation
 * sits from the target, and it only means that because both come out of the
 * same function.
 */
export function fitModelBranch(
  h: ActiveHandover,
  activeMeasured: GriddedResponse | null,
  passive: GriddedResponse | null,
): ModelBranchDerivation {
  const bandHz = handoverBandHz(h.hz);
  const off: string[] = [];
  if (!activeMeasured) off.push(`no measured on-axis response for the active way "${h.activeWay}"`);
  if (!passive) off.push(`no passive-side response to meet for "${h.passiveWay}"`);
  if (!activeMeasured || !passive) {
    return { settings: null, handoverWindowDb: null, otherPolarityWindowDb: null, bandHz, off };
  }
  if (activeMeasured.freq.length !== passive.freq.length) {
    off.push('the active and passive responses are not on the same grid');
    return { settings: null, handoverWindowDb: null, otherPolarityWindowDb: null, bandHz, off };
  }

  const unity: ModelBranchSpec = { kind: h.kind, order: h.order, hz: h.hz, gainDb: 0, delayMs: 0, inverted: false };
  /**
   * THE GAIN LEVELS THE TWO SHAPED BRANCHES over the handover band.
   *
   * SHAPED and not measured, and the difference is not cosmetic: what decides
   * whether the sum is flat through the handover is where the two FILTERED
   * branches sit, and on a real pair of drivers — one rolling off into the
   * handover, the other rising out of it — matching the unshaped levels is a
   * different number. Measured on casus 1h: about one dB different at every
   * stated position.
   *
   * In exact arithmetic the two flanks of one alignment are mirror images about
   * the handover, so on a grid that is log-symmetric about it the shaped answer
   * IS the unshaped one; on an arbitrary grid the included points are not quite
   * symmetric and the two differ by hundredths of a dB. The unit test builds a
   * symmetric grid for exactly that reason, so its hand calculation stays a
   * hand calculation.
   */
  const lvlPassive = meanDbIn(passive, bandHz);
  const lvlActive = meanDbIn(modelBranchResponse(activeMeasured, unity), bandHz);
  if (lvlPassive === null || lvlActive === null) {
    off.push(`the handover band ${bandHz[0].toFixed(1)}–${bandHz[1].toFixed(1)} Hz holds no grid point`);
    return { settings: null, handoverWindowDb: null, otherPolarityWindowDb: null, bandHz, off };
  }
  const gainDb = lvlPassive - lvlActive;

  /**
   * WHAT THE FIT MINIMISES: minus the REVERSED-POLARITY NULL MARGIN.
   *
   * For a candidate delay and polarity the two branches sum to `A + P`; flip
   * the modelled branch and they sum to `A - P`. The margin between those two
   * levels is deepest exactly where the branches are IN PHASE, so maximising it
   * is aligning them — and it is the same measurement Sander makes in the
   * cabinet to set the final delay ("de omgepoolde-nul-methode"). That the fit
   * and the verification are the one criterion is the point of choosing it.
   *
   * THE FIRST VERSION MINIMISED THE PEAK-TO-PEAK OF THE SUM instead, and the
   * measurement threw it out: on casus 1h the answer jumped from -0.905 ms at
   * 362.3 Hz to +0.140 ms at 400 Hz, a third of a period between two adjacent
   * handovers, because a flatness criterion over one octave is shallow and a
   * slight tilt moves its minimum a long way. A null is sharp where a sum is
   * flat, which is why the ear-and-microphone method uses it.
   *
   * Returned NEGATED so the search below minimises, like every other fit here.
   */
  const nullMarginOf = (delayMs: number, inverted: boolean): number => {
    const spec: ModelBranchSpec = { ...unity, gainDb, delayMs, inverted };
    const activeR = modelBranchResponse(activeMeasured, spec);
    let acc = 0;
    let n = 0;
    for (let i = 0; i < activeR.freq.length; i++) {
      const f = activeR.freq[i];
      if (f < bandHz[0] || f > bandHz[1]) continue;
      const a = 10 ** (activeR.spl[i] / 20);
      const p = 10 ** (passive.spl[i] / 20);
      const pa = (activeR.phaseDeg[i] * Math.PI) / 180;
      const pp = (passive.phaseDeg[i] * Math.PI) / 180;
      const sRe = a * Math.cos(pa) + p * Math.cos(pp);
      const sIm = a * Math.sin(pa) + p * Math.sin(pp);
      const dRe = p * Math.cos(pp) - a * Math.cos(pa);
      const dIm = p * Math.sin(pp) - a * Math.sin(pa);
      const sum = 20 * Math.log10(Math.max(Math.hypot(sRe, sIm), 1e-30));
      const rev = 20 * Math.log10(Math.max(Math.hypot(dRe, dIm), 1e-30));
      acc += sum - rev;
      n++;
    }
    return n > 0 ? -acc / n : Number.POSITIVE_INFINITY;
  };

  /** The peak-to-peak of the two-branch sum over the handover band, dB — the
   *  quantity a reader wants to SEE beside the fit, and never the one it is
   *  fitted on (see `nullMarginOf`). */
  const windowOf = (delayMs: number, inverted: boolean): number => {
    const spec: ModelBranchSpec = { ...unity, gainDb, delayMs, inverted };
    const active = modelBranchResponse(activeMeasured, spec);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < active.freq.length; i++) {
      const f = active.freq[i];
      if (f < bandHz[0] || f > bandHz[1]) continue;
      const a = 10 ** (active.spl[i] / 20);
      const p = 10 ** (passive.spl[i] / 20);
      const pa = (active.phaseDeg[i] * Math.PI) / 180;
      const pp = (passive.phaseDeg[i] * Math.PI) / 180;
      const re = a * Math.cos(pa) + p * Math.cos(pp);
      const im = a * Math.sin(pa) + p * Math.sin(pp);
      const db = 20 * Math.log10(Math.max(Math.hypot(re, im), 1e-30));
      if (db < lo) lo = db;
      if (db > hi) hi = db;
    }
    return Number.isFinite(lo) && hi > lo ? hi - lo : Number.POSITIVE_INFINITY;
  };

  let best: { delayMs: number; inverted: boolean; window: number } | null = null;
  const perPolarity = new Map<boolean, { delayMs: number; window: number }>();
  const periodMs = 1000 / h.hz;
  const spanMs = DELAY_SEARCH_PERIODS * periodMs;
  const steps = Math.round(2 * DELAY_SEARCH_PERIODS * DELAY_STEPS_PER_PERIOD);
  for (const inverted of [false, true]) {
    let bestHere: { delayMs: number; window: number } | null = null;
    for (let k = 0; k <= steps; k++) {
      const delayMs = -spanMs + (2 * spanMs * k) / steps;
      const window = nullMarginOf(delayMs, inverted);
      /* Strictly better, so a tie keeps the EARLIER delay — and the sweep runs
       * from the most negative upward, which would bias towards early. The tie
       * that matters is between ±equal delays, and it is broken by magnitude
       * below rather than by sweep order. */
      if (!bestHere || window < bestHere.window - 1e-12) bestHere = { delayMs, window };
      else if (bestHere && Math.abs(window - bestHere.window) <= 1e-12 && Math.abs(delayMs) < Math.abs(bestHere.delayMs)) {
        bestHere = { delayMs, window };
      }
    }
    if (bestHere) {
      perPolarity.set(inverted, bestHere);
      if (!best || bestHere.window < best.window) best = { ...bestHere, inverted };
    }
  }
  if (!best) {
    off.push('the delay fit found no finite sum over the handover band');
    return { settings: null, handoverWindowDb: null, otherPolarityWindowDb: null, bandHz, off };
  }
  const other = perPolarity.get(!best.inverted) ?? null;
  return {
    settings: { gainDb, delayMs: best.delayMs, inverted: best.inverted },
    /* REPORTED and not fitted: the SPL window at the setting the null margin
     * chose, and the same reading for the polarity it did not choose. Two
     * numbers a reader can compare, from a criterion neither of them steered. */
    handoverWindowDb: windowOf(best.delayMs, best.inverted),
    otherPolarityWindowDb: other ? windowOf(other.delayMs, !best.inverted) : null,
    nullMarginDb: -best.window,
    otherPolarityNullMarginDb: other ? -other.window : null,
    otherPolarityDelayMs: other ? other.delayMs : null,
    bandHz,
    off,
  };
}
