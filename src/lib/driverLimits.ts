/**
 * Driver band limits — "which frequencies can this driver actually cope with",
 * derived from measurements and geometry rather than from convention.
 *
 * There is no single published rule for choosing a crossover frequency. What
 * exists is a STACK OF INDEPENDENT INEQUALITIES, each putting a floor or a
 * ceiling on the answer; the design window is their intersection. This module
 * collects the ones that are computable from what this app has (0° FRD, angle
 * FRDs, impedance, baffle geometry) plus two optional datasheet numbers.
 *
 * Everything here is DECISION-LEVEL: these bound the search windows and are
 * reported to the designer. None of it belongs in an optimiser objective —
 * the anchor lesson (see the amplifier-load note in netOptimizer) is that objective terms
 * perturb the deterministic search path even when they are physically right.
 */

/** Speed of sound, m/s, at 20 °C — the value the cited sources use. */
const C_AIR = 343;

/* ------------------------------------------------------------------ *
 * 1. Cone breakup → upper limit
 * ------------------------------------------------------------------ */

export interface BreakupResult {
  /** Frequency of the breakup peak, Hz. */
  hz: number;
  /** How far it stands above the local trend, dB. */
  prominenceDb: number;
  /** True when the measured impedance shows a matching wiggle. */
  corroboratedByZ: boolean;
}

/**
 * Locate the first cone-breakup resonance in a measured on-axis response.
 *
 * A cone radiates as a piston until bending waves reach the rim out of phase
 * with the coil; above that it has modal resonances — sharp, high-Q peaks in
 * the response, and ringing in the decay.
 *
 * Detection is deviation from a ±½-OCTAVE LOCAL TREND, deliberately not from
 * any whole-band reference: on a response that climbs 50 dB across its range,
 * a band-wide median just points at "wherever the curve is highest" (measured,
 * and it is why an earlier attempt at this was reverted). A breakup is a LOCAL
 * excess.
 *
 * Corroboration: a pistonic driver has a smooth inductive impedance rise;
 * modal behaviour puts ripple on it at the same frequency. Both curves showing
 * something at once is the practitioners' test for "resonance, not baffle
 * diffraction". It is reported, never required — plenty of real breakups are
 * mechanically damped enough to barely move the impedance.
 *
 * NOTE — there is NO published algorithm or threshold for detecting breakup
 * from an SPL or impedance curve (the rigorous route is laser vibrometry:
 * Klippel's accumulated-acceleration level diverging from SPL). This is our
 * own criterion, which is exactly why it must stay visible and overridable in
 * the UI rather than silently steering a design.
 */
export function breakupHz(
  freq: readonly number[],
  spl: readonly number[],
  opts: { minProminenceDb?: number; searchFromHz?: number; zMag?: readonly number[] } = {},
): BreakupResult | null {
  const { minProminenceDb = 3, searchFromHz = 0, zMag } = opts;
  const n = freq.length;
  if (n < 16) return null;

  const trend = localTrend(freq, spl, 0.5);
  let best: { i: number; dev: number } | null = null;
  for (let i = 0; i < n; i++) {
    if (freq[i] < searchFromHz) continue;
    if (Number.isNaN(trend[i]) || !(spl[i] > -300)) continue;
    const dev = spl[i] - trend[i];
    if (dev < minProminenceDb) continue;
    // Must be a genuine local maximum of the deviation, not a shoulder.
    if (!isLocalMax(freq, spl, trend, i)) continue;
    if (!best || dev > best.dev) best = { i, dev };
  }
  if (!best) return null;

  let corroborated = false;
  if (zMag && zMag.length === n) {
    const zTrend = localTrend(freq, zMag, 0.5);
    const lo = freq[best.i] / 2 ** (1 / 3);
    const hi = freq[best.i] * 2 ** (1 / 3);
    for (let j = 0; j < n; j++) {
      if (freq[j] < lo || freq[j] > hi) continue;
      if (Number.isNaN(zTrend[j]) || !(zMag[j] > 0)) continue;
      // 2 % of the local |Z| is a wiggle you can see; below that it is noise.
      if (Math.abs(zMag[j] - zTrend[j]) > 0.02 * zTrend[j]) {
        corroborated = true;
        break;
      }
    }
  }

  return { hz: freq[best.i], prominenceDb: best.dev, corroboratedByZ: corroborated };
}

/**
 * The crossover ceiling a breakup imposes: f ≤ f_b / 3.
 *
 * This is NOT an arbitrary "stay an octave or two below". A resonance at f_b
 * is excited as the THIRD HARMONIC of a fundamental at f_b/3 (and the fifth of
 * f_b/5), so the distortion penalty appears more than an octave below the peak
 * itself. Measured independently by Purifi (aluminium cone breaking up at
 * 5 kHz and 10 kHz produces HD3 peaks at 1.6 kHz and 3.3 kHz — exactly f_b/3),
 * on the Dayton RS180, and by audiohorn.net.
 *
 * A notch does not repair it: the notch attenuates the fundamental AT the
 * breakup, not the harmonics arriving there from lower fundamentals — the cone
 * still rings.
 *
 * `harmonic` = 3 is the defensible default; 5 clears HD5 as well and is the
 * conservative choice for a hard metal cone.
 */
export function breakupCeilingHz(breakup: number, harmonic = 3): number {
  return breakup / harmonic;
}

/* ------------------------------------------------------------------ *
 * 2. Beaming → upper limit, calibrated on ka
 * ------------------------------------------------------------------ */

/**
 * How directional a flat circular piston is, expressed the way we can MEASURE
 * it: the on-axis minus 30° difference at a given ka = πdf/c.
 *
 * From D(θ) = 2·J₁(ka·sinθ)/(ka·sinθ), evaluated at θ = 30°. The tiers are the
 * thresholds the literature actually names:
 *
 *   ka = 1     the piston "starts to become directional"
 *   ka = 2     the industry limit — "any given woofer or midrange driver
 *              should not be operated above ka = 2" (Acoustic Frontiers)
 *   ka = 3.83  first off-axis null reaches 90°; also ≈ the patented
 *              "maximum usable frequency" (US 10,231,049)
 *
 * Worth knowing, because the intuition is wrong: "−6 dB at 30°" is ka = 4.43 —
 * far PAST every published limit. That figure is the definition of BEAMWIDTH
 * (IEC 60268-5 §23.4.1 coverage angle), not a crossover ceiling. At the ka = 2
 * limit a driver is only 1.1 dB down at 30°.
 *
 * DEFAULT IS `measured` (4 dB), NOT the theoretically "correct" ka = 2 — and
 * that is the single most important thing on this page.
 *
 * The piston formula assumes a rigid piston in an INFINITE BAFFLE. A real
 * measured 0° − 30° difference at low frequency is dominated by baffle
 * diffraction, not by cone directivity, so the tight tiers fire long before the
 * cone is actually beaming. Measured on a real 3-way set (a big woofer, Fs
 * 73 Hz, still at full output to 7 kHz):
 *
 *      threshold    woofer ceiling    mid ceiling
 *      ka=1  0.27       150 Hz           233 Hz
 *      ka=2  1.11       304 Hz          1376 Hz
 *            2 dB       373 Hz          1403 Hz
 *            3 dB       586 Hz          7802 Hz
 *            4 dB       628 Hz          8035 Hz
 *
 * At ka = 2 the woofer "beams" from 304 Hz — below the mid's own 2×Fs floor of
 * 353 Hz, so the tool declares a perfectly ordinary 3-way impossible. And note
 * the mid between 2 and 3 dB: one decibel of threshold moves the ceiling by a
 * factor 5.6, because at low thresholds any diffraction wobble satisfies the
 * persistence test. The 4 dB figure is not a rounder number — it is the one
 * that survives contact with measured data, which is why it was the historical
 * default and is the default again.
 *
 * The strict tiers stay available: they are correct for a piston, and a
 * designer who wants a conservative directivity philosophy (or who has clean
 * anechoic data) can choose them deliberately.
 */
export const KA_TIERS = {
  measured: { ka: 3.7, diff30Db: 4 },
  conservative: { ka: 1, diff30Db: 0.27 },
  standard: { ka: 2, diff30Db: 1.11 },
  aggressive: { ka: 3.83, diff30Db: 4.34 },
} as const;

export type KaTier = keyof typeof KA_TIERS;

/** Piston-theory beaming ceiling from geometry alone — the fallback for when
 *  no angle measurements exist. `d` is the EFFECTIVE piston diameter (cone +
 *  about half the surround), not the nominal driver size. */
export function beamingCeilingFromSize(effectiveDiameterM: number, tier: KaTier = 'standard'): number {
  return (KA_TIERS[tier].ka * C_AIR) / (Math.PI * effectiveDiameterM);
}

/* ------------------------------------------------------------------ *
 * 3. Centre-to-centre spacing → vertical lobing ceiling
 * ------------------------------------------------------------------ */

/**
 * The ceiling that driver SPACING puts on a crossover frequency.
 *
 * Two drivers a distance d apart interfere; with matched phase the first
 * off-axis null sits at sin θ = λ/(2d), so a forward-hemisphere null can only
 * exist once d ≥ λ/2. This is pure geometry — no measurement at all — and it
 * is the quantitative reason 3-ways cross where they do: the woofer and mid
 * are the farthest-apart adjacent pair, so it bites hardest on the LOW
 * crossover (300 mm spacing ⇒ 572 Hz at k = 0.5).
 *
 * LR4's famous "zero lobing error" is a statement about the inter-driver PHASE
 * only. It centres the lobe; it does not remove these nulls.
 *
 * `k` is genuinely contested and the sources are optimising different things —
 * so it is a setting, not a constant:
 *   0.25  point-source rule of thumb (no null at all)
 *   0.5   no forward null can exist (Linkwitz-attributed; ±90°)
 *   1.0   Vance Dickason, Loudspeaker Design Cookbook (main lobe ≥ ±30°)
 *   1.2   Saunisto — maximises power-response/DI smoothness, ACCEPTING a
 *         ±25° null. Directly contradicts the directivity-matching school.
 */
export function lobingCeilingHz(spacingMm: number, k = 0.5): number | null {
  if (!(spacingMm > 0)) return null;
  return (k * C_AIR) / (spacingMm / 1000);
}

/**
 * The lobing strictness the GEOMETRY itself argues for — Sanders' question
 * made the gap obvious: "de engine ziet toch dat de woofers naast elkaar
 * liggen?" One global k cannot distinguish the two situations that matter:
 *
 * - HORIZONTAL separation (a centre's side-by-side woofers): the nulls sweep
 *   ACROSS the seated listening window — every listener on the couch sits at
 *   a different angle. Strict: k 0.5, no forward null may exist.
 * - VERTICAL separation (a stacked mid/tweeter, a tower's woofer pair): the
 *   nulls go to floor and ceiling; listeners spread horizontally, barely
 *   vertically. Dickason's k 1.0 is the published anchor for exactly this
 *   (Saunisto goes further still, accepting a ±25° null for power response).
 *
 * Mixed axes interpolate on the vertical fraction. This never invents beyond
 * the published anchors — it picks WHICH anchor by the axis the pair actually
 * lobes in, it is shown next to the setting, and the explicit values remain
 * as overrides. Unknown geometry (no separation) falls back to strict.
 */
export function lobingKFor(dxMm: number, dyMm: number): number {
  const d = Math.hypot(dxMm, dyMm);
  if (!(d > 0)) return 0.5;
  return 0.5 + 0.5 * (Math.abs(dyMm) / d);
}

/** Where the first vertical null lands, for reporting: sin θ = kλ/(2d) with
 *  matched phase. Returns null when no forward null exists (d < λ/2). */
export function firstNullAngleDeg(spacingMm: number, freqHz: number): number | null {
  const lambda = C_AIR / freqHz;
  const d = spacingMm / 1000;
  const s = lambda / (2 * d);
  if (!(s <= 1)) return null;
  return (Math.asin(s) * 180) / Math.PI;
}

/* ------------------------------------------------------------------ *
 * 4. IEC 60268-5 §21.2 effective frequency range
 * ------------------------------------------------------------------ */

/**
 * The STANDARD's definition of a driver's usable band, and the only one here
 * that is not somebody's rule of thumb.
 *
 * IEC 60268-5 §21.2: the range where the on-axis response "is not more than
 * 10 dB below the sound pressure level averaged over a bandwidth of one octave
 * in the region of maximum sensitivity", and — the part that matters most for
 * us — "sharp troughs in the response curve, narrower than 1/9 octave at the
 * −10 dB level shall be neglected in determining the frequency limits".
 *
 * That trough rule is exactly the failure this codebase already fights
 * elsewhere: one narrow suck-out must not truncate a driver's declared band.
 *
 * (IEC's "rated" frequency range, by contrast, is declared by the manufacturer
 * and explicitly "not subject to measurement" — which is why datasheet numbers
 * are not reproducible. This is the measured one.)
 */
export function effectiveBandIec(
  freq: readonly number[],
  spl: readonly number[],
  dropDb = 10,
): [number, number] | null {
  const n = freq.length;
  const alive: number[] = [];
  for (let i = 0; i < n; i++) if (spl[i] > -300 && Number.isFinite(spl[i])) alive.push(i);
  if (alive.length < 12) return null;

  // Region of maximum sensitivity: the one-octave window with the highest mean.
  let ref = -Infinity;
  for (const i of alive) {
    const hi = freq[i] * 2;
    let sum = 0;
    let cnt = 0;
    for (const j of alive) {
      if (freq[j] >= freq[i] && freq[j] <= hi) {
        sum += spl[j];
        cnt++;
      }
    }
    if (cnt >= 4 && sum / cnt > ref) ref = sum / cnt;
  }
  if (!Number.isFinite(ref)) return null;

  const thr = ref - dropDb;
  const inBand = alive.map((i) => spl[i] >= thr);
  // Neglect troughs narrower than 1/9 octave — interior gaps only.
  for (let a = 0; a < inBand.length; a++) {
    if (inBand[a]) continue;
    let b = a;
    while (b < inBand.length && !inBand[b]) b++;
    const before = a > 0;
    const after = b < inBand.length;
    if (before && after) {
      const width = freq[alive[b - 1]] / freq[alive[a]];
      if (width <= 2 ** (1 / 9)) for (let k = a; k < b; k++) inBand[k] = true;
    }
    a = b - 1;
  }

  // The LONGEST CONTIGUOUS run, not simply first-to-last: the standard defines
  // the range as one where the response is not more than 10 dB down, so a hole
  // that survived the 1/9-octave rule genuinely terminates it. (Bracketing
  // first-to-last would silently declare a band straddling a dead octave.)
  let best: [number, number] | null = null;
  let bestSpan = 0;
  for (let a = 0; a < inBand.length; a++) {
    if (!inBand[a]) continue;
    let b = a;
    while (b + 1 < inBand.length && inBand[b + 1]) b++;
    const span = freq[alive[b]] / freq[alive[a]];
    if (b > a && span > bestSpan) {
      bestSpan = span;
      best = [freq[alive[a]], freq[alive[b]]];
    }
    a = b;
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * 5. Excursion → lower limit (needs two datasheet numbers)
 * ------------------------------------------------------------------ */

/**
 * The frequency below which a driver runs out of linear travel for a target
 * SPL — the quantitative version of the vague "cross at 2–3× Fs".
 *
 *   SPL_rms(r) = K + 20·log10(f²·Vd / r),   Vd = Sd · x_peak  [m³]
 *   K = 108.4 dB  half space (driver in a large baffle)
 *   K = 102.4 dB  full space (free field)
 *
 * so  f_min = √( 10^((L−K)/20) · r / (Sd · Xmax) ).
 *
 * Validated against a published figure: Linkwitz gives the ScanSpeak
 * D2905/9700 (Sd 8.5 cm², Xmax 0.5 mm) as "SPL = 101 dB at 1400 Hz, 1 m, free
 * field" — this formula returns 100.8 dB.
 *
 * The LEVEL-dependence is the whole point, and it is what a bare Fs multiple
 * cannot express: the same 1" dome is fine to 587 Hz at 90 dB but only to
 * 829 Hz at 96 dB.
 */
export function excursionFloorHz(
  sdCm2: number,
  xmaxMm: number,
  targetSplDb: number,
  opts: { distanceM?: number; halfSpace?: boolean; count?: number } = {},
): number | null {
  const { distanceM = 1, halfSpace = true, count = 1 } = opts;
  if (!(sdCm2 > 0) || !(xmaxMm > 0)) return null;
  // `count` identical drivers sharing the branch displace `count` times the
  // volume, so the floor drops by √count (four woofers buy one octave, not
  // four). Sd stays the SINGLE cone's datasheet value on purpose: the same
  // number feeds the piston diameter, and each cone beams as itself — an
  // array adds interference lobes, it does not grow the cone. Folding the
  // count into Sd would make the excursion floor right and the beaming
  // ceiling wrong, which is how a dual-woofer design quietly gets a
  // directivity estimate for a driver that does not exist.
  const n = count > 0 ? count : 1;
  const vd = n * (sdCm2 * 1e-4) * (xmaxMm * 1e-3); // m³
  const k = halfSpace ? 108.4 : 102.4;
  return Math.sqrt((10 ** ((targetSplDb - k) / 20) * distanceM) / vd);
}

/* ------------------------------------------------------------------ *
 * shared helpers
 * ------------------------------------------------------------------ */

/** Median of a ±`octaves`-octave window around every point — the local trend
 *  a resonance stands out from. Median, not mean: a narrow peak must not drag
 *  its own reference up with it. */
function localTrend(
  freq: readonly number[],
  y: readonly number[],
  octaves: number,
): number[] {
  const n = freq.length;
  const out = new Array<number>(n).fill(NaN);
  const lo = 2 ** -octaves;
  const hi = 2 ** octaves;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(y[i]) || y[i] <= -300) continue;
    const win: number[] = [];
    for (let j = 0; j < n; j++) {
      if (freq[j] >= freq[i] * lo && freq[j] <= freq[i] * hi && Number.isFinite(y[j]) && y[j] > -300) {
        win.push(y[j]);
      }
    }
    if (win.length < 4) continue;
    win.sort((a, b) => a - b);
    out[i] = win[Math.floor(win.length / 2)];
  }
  return out;
}

/** Is the deviation-from-trend a real local maximum over ±⅓ octave? */
function isLocalMax(
  freq: readonly number[],
  y: readonly number[],
  trend: readonly number[],
  i: number,
): boolean {
  const dev = y[i] - trend[i];
  const lo = freq[i] / 2 ** (1 / 3);
  const hi = freq[i] * 2 ** (1 / 3);
  for (let j = 0; j < freq.length; j++) {
    if (j === i || freq[j] < lo || freq[j] > hi) continue;
    if (Number.isNaN(trend[j])) continue;
    if (y[j] - trend[j] > dev) return false;
  }
  return true;
}
