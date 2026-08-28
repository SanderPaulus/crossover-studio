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
/**
 * SANDERS REGEL, op één plek.
 *
 *   "Alles boven het minimum is goed. Alles eronder, maar binnen x procent,
 *    vind ik ok."  (25 aug 2026)
 *
 * Het getal dat de ontwerper intypt is wat zijn versterker aankan; erboven is
 * per definitie in orde. Eronder is het niet meteen fout — een geleverde last
 * die een paar tienden procent onder de rating landt is niet te onderscheiden
 * van een die er precies op zit zodra je hem bouwt.
 *
 * 2 %, en dat is een CONVENTIE en geen afgeleide waarheid. Gekozen op de
 * strakste tolerantieklasse die de app zelf aanbiedt (±2 % onderdelen): een
 * tekort kleiner dan dat verdwijnt in de bouwspreiding, dus het kan geen
 * ontwerpfout verbergen die je in de praktijk zou merken. Eén constante om te
 * verzetten als de ontwerper er anders over denkt.
 *
 * WAAROM HIER EN NIET DRIE KEER: de reparatiepas, de ranking en de scan-tabel
 * stelden alle drie dezelfde vraag met een eigen drempel — de reparatie met
 * 0,15 Ω speling, de ranking met een strikte vergelijking. Dat betekende dat
 * een netwerk gerepareerd kon heten en vervolgens doorgestreept worden. Eén
 * definitie, één plek.
 *
 * Marge BOVEN de rating blijft de keuze van de ontwerper, en het invoerveld is
 * waar hij die maakt: wie speling wil voor bouwtolerantie typt 3,5 in plaats
 * van 3,2. Die marge hier verzinnen zou responsiekwaliteit uitgeven — gemeten
 * op 1,2 dB en 11° voor één zo'n verhoging — aan een beslissing die niemand
 * heeft gevraagd.
 */
export const AMP_FLOOR_TOLERANCE = 0.02;

/** De laagste last die nog als "haalt de rating" telt. */
export function acceptedAmpFloor(ratedOhm: number): number {
  return ratedOhm * (1 - AMP_FLOOR_TOLERANCE);
}

/**
 * Numerieke ondergrens onder de speling — geen ontwerpmarge.
 *
 * De speling is een PERCENTAGE van de rating, dus zij loopt naar nul zodra de
 * rating dat doet. Detectie en acceptatie vergelijken drijvende-kommagetallen,
 * en een speling van nul maakt van "haalt hem precies" een muntworp.
 */
const AMP_FLOOR_SLACK_MIN_OHM = 1e-3;

/**
 * De speling waarmee de tuner met de vloer werkt: hoe ver een geleverd minimum
 * ONDER de rating mag landen en nog steeds "gehaald" heet.
 *
 * Eén definitie, één plek — de reden waarom `meetsAmpFloor` hier woont. De
 * tuner rekende hem tot V33 zelf uit, en sinds V33 vraagt óók een test hem op:
 * die meet het verschil tussen twee rasters waarop dezelfde eis gelezen kan
 * worden en houdt het tegen déze speling aan. Twee plekken die hetzelfde
 * percentage uitrekenen is precies hoe een netwerk gerepareerd kon heten en
 * daarna doorgestreept worden.
 */
export function ampFloorSlackOhm(ratedOhm: number): number {
  return Math.max(AMP_FLOOR_SLACK_MIN_OHM, ratedOhm - acceptedAmpFloor(ratedOhm));
}

/** Haalt dit geleverde minimum de rating? Absent/0 = geen rating, dus geen oordeel. */
export function meetsAmpFloor(zMinOhm: number | null | undefined, ratedOhm: number | null | undefined): boolean {
  if (!(typeof ratedOhm === 'number' && ratedOhm > 0)) return true;
  if (zMinOhm === null || zMinOhm === undefined) return true;
  return zMinOhm >= acceptedAmpFloor(ratedOhm);
}

/* ------------------------------------------------------------------ *
 * V33 — WHICH READING OF |Z| IS "THE SYSTEM'S SHORTEST IMPEDANCE"
 * ------------------------------------------------------------------ */

/**
 * The smallest modulus in a solved input impedance, and where it sits.
 *
 * WHY THIS IS A FUNCTION AND NOT A THREE-LINE LOOP. Two places ask this
 * question about the same network: the `M-B/|Z|` gate, which decides whether a
 * design may be offered, and — since V33 — the amp-floor barrier term, which
 * decides where the search aims. V30 and V32 were both about those two
 * answering on different data; V33 is about them answering with different
 * code. A loop written twice agrees until someone changes one of them, and the
 * whole casebook entry above `meetsAmpFloor` is about what that costs.
 *
 * So the tie-break is stated once: the FIRST index wins, strict `<`, no
 * epsilon. That matters more than it looks — a network with two equal minima
 * would otherwise report two different frequencies depending on which copy of
 * the loop ran, and `minZAtHz` is printed beside the ohms.
 *
 * Returns null for an empty array rather than Infinity: no samples is not a
 * measurement of an infinite impedance.
 */
export function minImpedanceAt(
  inputZ: readonly { re: number; im: number }[],
): { ohm: number; index: number } | null {
  if (inputZ.length === 0) return null;
  let index = 0;
  let ohm = Math.hypot(inputZ[0].re, inputZ[0].im);
  for (let i = 1; i < inputZ.length; i++) {
    const m = Math.hypot(inputZ[i].re, inputZ[i].im);
    if (m < ohm) {
      ohm = m;
      index = i;
    }
  }
  return { ohm, index };
}

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

export interface NominalVerdict {
  /** The nominal to hold the design to; null when the drivers support none. */
  nominalOhm: number | null;
  /** The weakest branch minimum the answer came from. */
  weakestOhm: number | null;
  line: string;
}

/**
 * The nominal AND what to say when there is none.
 *
 * ⚠ NULL IS AN ANSWER, NOT A MISSING VALUE. A set whose weakest branch sits
 * below 1.6 Ω supports no standard nominal at all — 2 Ω already demands 1.6 —
 * and the honest output is "these drivers cannot be sold as any standard
 * impedance", not a quiet fallback to the smallest one. Such sets exist (four
 * 4 Ω drivers in parallel is 1 Ω) and someone will load one; falling back
 * would hand them a floor of 1.6 Ω that their drivers can never meet, and the
 * design would then be blamed for the wiring.
 *
 * The same reasoning as everywhere else in this round: when the answer is
 * "this cannot be done", say that, rather than substituting the nearest thing
 * that computes.
 */
export function nominalVerdict(branchMinOhm: readonly number[]): NominalVerdict {
  const usable = branchMinOhm.filter((x) => Number.isFinite(x) && x > 0);
  if (usable.length === 0) {
    return { nominalOhm: null, weakestOhm: null, line: 'no impedance data — nothing to derive a nominal from' };
  }
  const weakestOhm = Math.min(...usable);
  const nominalOhm = claimableNominalOhm(weakestOhm);
  return {
    nominalOhm,
    weakestOhm,
    line:
      nominalOhm === null
        ? `weakest branch ${weakestOhm.toFixed(2)} Ω — below ${requiredMinOhm(NOMINAL_SERIES[0]).toFixed(1)} Ω, ` +
          `so these drivers support NO standard nominal impedance (${NOMINAL_SERIES[0]} Ω already ` +
          `requires ${requiredMinOhm(NOMINAL_SERIES[0]).toFixed(1)} Ω). That is a wiring decision, not a filter one.`
        : `weakest branch ${weakestOhm.toFixed(2)} Ω → hold this design to ${nominalOhm} Ω nominal ` +
          `(minimum ${requiredMinOhm(nominalOhm).toFixed(1)} Ω, IEC 60268-5)`,
  };
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
