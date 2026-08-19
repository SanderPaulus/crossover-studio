/**
 * Band-restricted response statistics — ONE implementation, shared by every
 * engine and by the display.
 *
 * Why this file exists (jul 2026, after the solo-engine round): "how flat is
 * this response over this band" was implemented four separate times — in the
 * component tuner (bandStd/bandAvgDev/bandPeak/medianOf), in the solo design
 * engine (statsIn/medianLevel), in the chain ranking, and in responseStats for
 * the panel. Every guard therefore judged its own private notion of flatness,
 * and that is exactly the class of bug that cost the most: a correction could
 * improve the number its own stage measured while making the number the
 * DESIGNER reads worse. With a 3-way engine coming, three engines each growing
 * their own copy is not a risk worth taking.
 *
 * Deliberately NOT a policy layer: no thresholds, no scores, no opinions about
 * what is good. Just the numbers, so a caller can decide what to gate on.
 * Pure, allocation-light and free of RNG/wall-clock, like the rest of the lib.
 */

export interface BandStats {
  /** Points inside the band. 0 when the band misses the grid entirely. */
  count: number;
  /** Arithmetic mean level (dB). */
  mean: number;
  /** MEDIAN level (dB) — the level reference to use whenever a deep narrow
   *  notch must not drag the reference with it (sensitivity accounting, the
   *  Response-flatness score). */
  median: number;
  /** RMS deviation from `reference` — the smooth quantity search objectives
   *  minimize. Level-invariant when the reference is mean/median, which is
   *  precisely why it needs a companion (see `peakExcess`). */
  std: number;
  /** Mean |deviation| from `reference` — the whole-range verdict the chain
   *  ranking and the Response-flatness score judge on. */
  avgDev: number;
  /** ±(max−min)/2 over the band — the "ripple" the SPL strip shows and staged
   *  targets gate on. Outlier-driven by nature; never feed it to a smooth
   *  optimizer. */
  peak: number;
  /** Largest deviation ABOVE the reference (dB, ≥0). A narrow resonance barely
   *  moves `std` (it covers a few percent of the band) yet is the first thing
   *  a designer sees and hears — this is the term that makes it visible. */
  peakExcess: number;
  /** Largest deviation BELOW the reference (dB, ≥0). A cut-only network cannot
   *  lift a dip, so this is the honest floor under any flatness goal. */
  peakDeficit: number;
  min: number;
  max: number;
}

const EMPTY: BandStats = {
  count: 0,
  mean: 0,
  median: 0,
  std: 0,
  avgDev: 0,
  peak: 0,
  peakExcess: 0,
  peakDeficit: 0,
  min: 0,
  max: 0,
};

/** Indices of `freq` inside [lo, hi]. */
export function bandIndices(
  freq: readonly number[],
  band: readonly [number, number],
): number[] {
  const out: number[] = [];
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] >= band[0] && freq[i] <= band[1]) out.push(i);
  }
  return out;
}

/** Median of the levels inside the band (dB). */
export function bandMedian(
  freq: readonly number[],
  spl: readonly number[],
  band: readonly [number, number],
): number {
  const vals = bandIndices(freq, band).map((i) => spl[i]);
  if (vals.length === 0) return 0;
  vals.sort((a, b) => a - b);
  const m = vals.length >> 1;
  return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2;
}

/**
 * All band statistics in one pass.
 *
 * `reference` chooses what deviations are measured against:
 *  - 'mean'   — classic spread; what the two-way objective has always used.
 *  - 'median' — robust to a deep narrow notch; the display's choice.
 *  - a number — an ABSOLUTE target level, for goals of the form "be flat at
 *    104 dB". A fixed target cannot be met by moving the average, which is
 *    what makes it a well-posed goal for a cut-only network.
 */
export function bandStats(
  freq: readonly number[],
  spl: readonly number[],
  band: readonly [number, number],
  reference: 'mean' | 'median' | number = 'mean',
): BandStats {
  const ids = bandIndices(freq, band);
  const n = ids.length;
  if (n === 0) return EMPTY;

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const i of ids) {
    const v = spl[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;
  const median = bandMedian(freq, spl, band);
  const ref = reference === 'mean' ? mean : reference === 'median' ? median : reference;

  let sq = 0;
  let abs = 0;
  for (const i of ids) {
    const dv = spl[i] - ref;
    sq += dv * dv;
    abs += Math.abs(dv);
  }
  return {
    count: n,
    mean,
    median,
    std: Math.sqrt(sq / n),
    avgDev: abs / n,
    peak: max > min ? (max - min) / 2 : 0,
    peakExcess: Math.max(0, max - ref),
    peakDeficit: Math.max(0, ref - min),
    min,
    max,
  };
}

/**
 * Flatness for a SEARCH objective, with narrow resonances made visible.
 *
 * HARD LEARNED (Sanders, twice, on the solo engine): RMS flatness barely
 * notices a narrow resonance — a 20 dB spike over a few percent of the band
 * hardly moves `std` — so the value tuner and the catalog snap both eroded a
 * notch the design stage had correctly placed, each while "improving" their
 * own metric. Blending in the worst positive excursion makes every downstream
 * stage defend what the design stage won.
 *
 * `peakWeight` 0 reproduces plain `std` exactly, so a caller that must stay
 * bit-identical (the two-way objective, until measured otherwise) can opt out.
 */
export function flatnessObjective(
  stats: BandStats,
  peakWeight = 0,
): number {
  if (peakWeight <= 0) return stats.std;
  return Math.sqrt(stats.std * stats.std + peakWeight * stats.peakExcess * stats.peakExcess);
}

/**
 * The band a CUT-ONLY correction can actually work on: the requested band
 * minus dead EDGES, i.e. the outermost points that sit more than `depthDb`
 * below `reference` (median by default, or an absolute target level).
 *
 * Passive filters only cut, so a region further down than you can afford to
 * bring everything else is out of reach by definition. Only the outermost
 * reachable points bound the result — a dip in the MIDDLE is never carved out:
 * you live with those, and the score should keep showing them.
 *
 * Returns the requested band unchanged when trimming would leave less than an
 * octave (something is odd about the measurement — design it and report
 * honestly rather than hand back a sliver).
 */
/**
 * The LOWEST frequency where a driver has climbed to within `dropDb` of its
 * own passband median — "waar reikt hij tot niveau". The handover-floor
 * physics made measurable: passive filters only cut, so the UPPER driver of
 * a pair must already be at level at the crossing; below this point a
 * handover forces either a sag in the sum or padding the whole system down
 * to the driver's falling flank. Robbert's mid: Fs-floor says ≥353 Hz but
 * the response only reaches level around ~550 — this floor is the stricter,
 * honest one. Ghost/silent samples (≤ −300 dB) are ignored; null when the
 * response never comes within `dropDb` of its median (broken measurement).
 */
export function reachesLevelHz(
  freq: readonly number[],
  spl: readonly number[],
  dropDb = 6,
): number | null {
  const alive: number[] = [];
  for (let i = 0; i < freq.length; i++) if (spl[i] > -300) alive.push(i);
  if (alive.length < 8) return null;
  // Reference = the UPPER QUARTILE, not the median: a driver measured across
  // its whole range spends octaves on its rising and falling flanks, and a
  // plain median gets dragged off the passband by those tails (measured on
  // Robbert's mid: median-based "reaches level" said 157 Hz for a driver
  // that only comes up around ~550). The upper quartile IS the passband.
  const sorted = alive.map((i) => spl[i]).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.75)];
  for (const i of alive) {
    if (spl[i] >= ref - dropDb) return freq[i];
  }
  return null;
}

export function reachableBand(
  freq: readonly number[],
  spl: readonly number[],
  band: readonly [number, number],
  depthDb: number,
  reference: 'median' | number = 'median',
): [number, number] {
  const ids = bandIndices(freq, band);
  if (ids.length < 8) return [band[0], band[1]];
  const ref = reference === 'median' ? bandMedian(freq, spl, band) : reference;
  const thr = ref - depthDb;
  const alive = ids.filter((i) => spl[i] >= thr);
  if (alive.length < 8) return [band[0], band[1]];
  const lo = Math.max(band[0], freq[alive[0]]);
  const hi = Math.min(band[1], freq[alive[alive.length - 1]]);
  return hi > lo * 2 ? [lo, hi] : [band[0], band[1]];
}

/* ------------------------------------------------------------------ *
 * Power-response SHAPE (aug 2026, "van vlak naar glad")
 * ------------------------------------------------------------------ */

export type PowerMetricMode = 'smooth' | 'legacy';

export interface PowerShape {
  /** Std-dev of the DETRENDED energy average over the band (dB) — smoothness. */
  residualStdDb: number;
  /** Fitted 1st-order trend, dB per decade of frequency (negative = falling). */
  slopeDbPerDecade: number;
  /** Per-point residual after detrending (NaN outside the band). */
  residualDb: number[];
  /** Largest |residual| within [xo/ratio, xo·ratio] of each requested crossing
   *  — the DI "fold" a room EQ cannot undo; 0 when no crossing given. */
  foldDb: number;
  /** Per crossing, same order as `crossingsHz`. */
  foldPerXoDb: number[];
}

/**
 * The energy average (power response) of a correct loudspeaker is NOT flat:
 * a rising DI makes it fall with frequency. What the crossover owns is its
 * SMOOTHNESS — a fold at a handover (DI step) is passively unfixable and no
 * room EQ can repair it either — while the SLOPE is room/taste territory that
 * a room-correction system sets. So: fit a 1st-order line in (log10 f, dB)
 * over the band, judge the RESIDUAL (std + a fold term near each crossing),
 * report the slope, never penalise it. `legacy` reproduces the historical
 * std-of-the-raw-power (flatness) for A/B on existing projects.
 */
export function powerShape(
  freq: readonly number[],
  powerDb: readonly number[],
  band: [number, number],
  crossingsHz: readonly (number | null | undefined)[] = [],
  foldRatio = 1.6,
): PowerShape {
  const n = freq.length;
  const residualDb = new Array<number>(n).fill(NaN);
  let sx = 0, sy = 0, sxx = 0, sxy = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    if (freq[i] < band[0] || freq[i] > band[1] || !Number.isFinite(powerDb[i])) continue;
    const x = Math.log10(freq[i]);
    const y = powerDb[i];
    sx += x; sy += y; sxx += x * x; sxy += x * y; cnt++;
  }
  if (cnt < 3) return { residualStdDb: 0, slopeDbPerDecade: 0, residualDb, foldDb: 0, foldPerXoDb: crossingsHz.map(() => 0) };
  const den = cnt * sxx - sx * sx;
  const slope = den > 0 ? (cnt * sxy - sx * sy) / den : 0;
  const icpt = (sy - slope * sx) / cnt;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    if (freq[i] < band[0] || freq[i] > band[1] || !Number.isFinite(powerDb[i])) continue;
    const r = powerDb[i] - (icpt + slope * Math.log10(freq[i]));
    residualDb[i] = r;
    ss += r * r;
  }
  const residualStdDb = Math.sqrt(ss / cnt);
  const foldPerXoDb = crossingsHz.map((xo) => {
    if (xo == null || !(xo > 0)) return 0;
    let mx = 0;
    for (let i = 0; i < n; i++) {
      if (freq[i] < xo / foldRatio || freq[i] > xo * foldRatio || Number.isNaN(residualDb[i])) continue;
      mx = Math.max(mx, Math.abs(residualDb[i]));
    }
    return mx;
  });
  return { residualStdDb, slopeDbPerDecade: slope, residualDb, foldDb: foldPerXoDb.length ? Math.max(...foldPerXoDb) : 0, foldPerXoDb };
}

/* ------------------------------------------------------------------ *
 * Error smoothing for the search objectives (aug 2026)
 * ------------------------------------------------------------------ */

/**
 * Gaussian smoothing of a dB curve in log-frequency: sigma = `octaves`/2 so
 * that ±1σ spans the named width (1/12 oct ⇒ σ = 1/24 oct). Non-finite points
 * are skipped; the output keeps them as they were. Applied to MAGNITUDES only
 * — never to phase — and, in the optimizers, to the driver responses BEFORE
 * decimation to the ~150-point search grid: the diffraction ripple and
 * measurement noise a filter cannot fix would otherwise alias into the
 * objective through the decimated samples. Gates, staged targets and the
 * safety gate keep judging the raw full grid.
 */
export function smoothDbGaussian(
  freq: readonly number[],
  db: readonly number[],
  octaves: number,
): number[] {
  const n = freq.length;
  if (!(octaves > 0) || n < 3) return [...db];
  const sigma = octaves / 2;
  const reach = 3 * sigma;
  const lf = freq.map((f) => Math.log2(f));
  const out = new Array<number>(n);
  let lo = 0;
  for (let i = 0; i < n; i++) {
    while (lo < n && lf[lo] < lf[i] - reach) lo++;
    let s = 0;
    let w = 0;
    for (let j = lo; j < n && lf[j] <= lf[i] + reach; j++) {
      if (!Number.isFinite(db[j])) continue;
      const d = (lf[j] - lf[i]) / sigma;
      const g = Math.exp(-0.5 * d * d);
      s += g * db[j];
      w += g;
    }
    out[i] = w > 0 ? s / w : db[i];
  }
  return out;
}
