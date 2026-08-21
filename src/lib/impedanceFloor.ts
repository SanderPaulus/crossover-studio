/**
 * THE AMPLIFIER-LOAD FLOOR, DERIVED RATHER THAN TYPED.
 *
 * Two questions live here and they are NOT the same one:
 *
 *   1. What nominal impedance may this design claim?  (a SYSTEM property)
 *   2. How low may |Z| go, and does that depend on frequency?
 *
 * ------------------------------------------------------------------
 * 1. NOMINAL IS A SYSTEM QUANTITY
 * ------------------------------------------------------------------
 * IEC 60268-5 defines rated impedance for the loudspeaker AS A WHOLE — it is
 * what goes on the plate and what the amplifier meets — and requires the
 * minimum modulus over the working range to stay at or above 80 % of it.
 *
 * A BRANCH has no nominal impedance. It has an input impedance that only
 * governs inside its own passband, and reading a nominal off it is a category
 * error: a branch can sit low in its stopband without the system noticing at
 * all. The two usually agree, which is exactly what makes the mistake
 * survivable long enough to matter somewhere else.
 *
 * So the claim comes from the SYSTEM minimum over the whole band, and the
 * per-branch analysis stays what it is — a DIAGNOSIS of which branch sets that
 * minimum (impedanceDiag.ts), never a limit.
 *
 * ------------------------------------------------------------------
 * 2. THE LIMIT IS ABOUT CURRENT, AND ONLY ITS SHAPE IS EMPIRICAL
 * ------------------------------------------------------------------
 * PRIMARY REASON, and it depends on no musical taste whatsoever: at a given
 * drive voltage the current is I = U/|Z|. An output stage and its supply run
 * out of CURRENT, not out of impedance — that is what the safe operating area,
 * the rail sag and the protection circuit all respond to. Halving the
 * impedance doubles the current for the same volume setting.
 *
 * SHAPE, and this part is empirical and should be argued as such: whether a
 * given dip matters depends on how much voltage the programme actually asks
 * for there. Up to roughly 1 kHz music is close to equal energy per octave
 * (the pink-noise assumption behind EIA-426 and behind loudspeaker power
 * testing generally), so the band-limited drive voltage is flat and the floor
 * has to be flat with it. Above that the long-term average falls; measured
 * corpora put it near −6 dB/octave.
 *
 * We relax the floor by HALF that slope (−3 dB/oct) and cap the total
 * relaxation at a factor two. Both choices are deliberately timid: the falling
 * average is a long-term statistic and a single loud cymbal is not, so a floor
 * that tracked the average exactly would license a dip that real material can
 * still find. The cap keeps the line meaningful at 20 kHz instead of letting
 * it decay to nothing.
 *
 * Everything above is parameterised and pinned by tests, so the reasoning can
 * be attacked on its merits rather than by arguing about a constant.
 */

/** IEC 60268-5: the minimum modulus may not fall below this fraction. */
export const IEC_MIN_FRACTION = 0.8;

/** The nominal values a loudspeaker is actually sold as. */
export const NOMINAL_SERIES = [2, 4, 6, 8, 16] as const;

/**
 * The largest nominal impedance this design may honestly claim.
 *
 * Rounded DOWN through the series on purpose: the question is what may be
 * printed on the plate, and rounding up prints something the design does not
 * meet. Null when the minimum is below even the smallest standard value.
 */
export function claimableNominalOhm(systemMinOhm: number): number | null {
  let best: number | null = null;
  for (const v of NOMINAL_SERIES) {
    if (IEC_MIN_FRACTION * v <= systemMinOhm) best = v;
  }
  return best;
}

/** What a claimed nominal requires of the minimum. */
export function requiredMinOhm(nominalOhm: number): number {
  return IEC_MIN_FRACTION * nominalOhm;
}

export interface FloorShape {
  /** Below this the floor is flat — programme energy is flat per octave. */
  kneeHz: number;
  /** dB per octave the floor relaxes above the knee (positive = relaxes). */
  slopeDbOct: number;
  /** Never relax by more than this factor, however high the frequency. */
  maxRelax: number;
}

/**
 * Deliberately conservative — half the measured programme slope, capped at a
 * factor two. See the header for why timid is the right direction here.
 */
export const DEFAULT_FLOOR_SHAPE: FloorShape = {
  kneeHz: 1000,
  slopeDbOct: 3,
  maxRelax: 2,
};

/**
 * How much the floor may relax at a frequency: 1 at and below the knee,
 * growing to at most `maxRelax`.
 *
 * Returned as a DIVISOR so the caller writes `floor / relaxAt(f)` and the
 * direction cannot be got backwards by accident.
 */
export function relaxAt(hz: number, shape: FloorShape = DEFAULT_FLOOR_SHAPE): number {
  if (!(hz > shape.kneeHz)) return 1;
  const oct = Math.log2(hz / shape.kneeHz);
  const factor = Math.pow(10, (shape.slopeDbOct * oct) / 20);
  return Math.min(shape.maxRelax, factor);
}

export interface FloorCurve {
  /** The nominal the limit is written against. */
  nominalOhm: number;
  /** floor[i] for the frequency at the same index. */
  floorOhm: number[];
  /** The flat part — what IEC asks for outright. */
  baseOhm: number;
  line: string;
}

/**
 * The frequency-dependent floor for a stated nominal.
 *
 * NOT derived from the delivered design: that would be circular, since any
 * minimum can claim the nominal it happens to support. The nominal to hold a
 * design to comes from what the DRIVERS can support — see
 * {@link nominalFromDrivers} — while {@link claimableNominalOhm} answers the
 * separate question of what the finished design may be sold as.
 */
export function floorCurve(
  freq: readonly number[],
  nominalOhm: number,
  shape: FloorShape = DEFAULT_FLOOR_SHAPE,
): FloorCurve {
  const baseOhm = requiredMinOhm(nominalOhm);
  const floorOhm = freq.map((f) => baseOhm / relaxAt(f, shape));
  return {
    nominalOhm,
    baseOhm,
    floorOhm,
    line:
      `${nominalOhm} Ω nominal → ${baseOhm.toFixed(1)} Ω up to ${shape.kneeHz} Hz (IEC 60268-5, ` +
      `80 % of nominal), relaxing ${shape.slopeDbOct} dB/oct above it to at most ` +
      `${(baseOhm / shape.maxRelax).toFixed(1)} Ω — the limit is on CURRENT (I = U/|Z|), and ` +
      `programme voltage falls above ~${shape.kneeHz} Hz`,
  };
}

/**
 * The nominal a design should be HELD to, from the driver data alone.
 *
 * The drivers set what is reachable before any filter exists, and a limit has
 * to come from something the design cannot move — otherwise it grades its own
 * homework. Each branch contributes the minimum it presents in its own working
 * region; the system can be no better than its weakest, so the smallest wins.
 *
 * Note this is NOT the bare parallel of every branch: that state (all branches
 * conducting everywhere) never exists in a crossed-over system and would set a
 * floor no design could be expected to meet.
 */
export function nominalFromDrivers(branchMinOhm: readonly number[]): number | null {
  const usable = branchMinOhm.filter((x) => Number.isFinite(x) && x > 0);
  if (usable.length === 0) return null;
  return claimableNominalOhm(Math.min(...usable));
}

export interface FloorVerdict {
  ok: boolean;
  /** Worst shortfall in ohms (0 when clear), and where. */
  shortOhm: number;
  atHz: number;
  /** The floor that applied there — quoted so the verdict can be argued with. */
  floorThereOhm: number;
  minThereOhm: number;
  line: string;
}

/** Does this |Z| curve clear the floor, and if not, by how much and where. */
export function checkFloor(
  freq: readonly number[],
  zMagOhm: readonly number[],
  curve: FloorCurve,
  band: [number, number] = [20, 20000],
): FloorVerdict {
  let shortOhm = 0;
  let atHz = 0;
  let floorThereOhm = curve.baseOhm;
  let minThereOhm = Infinity;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < band[0] || freq[i] > band[1]) continue;
    const deficit = curve.floorOhm[i] - zMagOhm[i];
    if (deficit > shortOhm) {
      shortOhm = deficit;
      atHz = freq[i];
      floorThereOhm = curve.floorOhm[i];
      minThereOhm = zMagOhm[i];
    }
  }
  const ok = shortOhm <= 0;
  return {
    ok,
    shortOhm: Math.max(0, shortOhm),
    atHz,
    floorThereOhm,
    minThereOhm,
    line: ok
      ? `clears the ${curve.nominalOhm} Ω floor everywhere`
      : `${minThereOhm.toFixed(2)} Ω at ${Math.round(atHz)} Hz, against a floor of ` +
        `${floorThereOhm.toFixed(2)} Ω there — ${shortOhm.toFixed(2)} Ω short`,
  };
}
