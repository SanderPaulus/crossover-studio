/**
 * F4b — THE MEASURED FACTS THAT CROSS THE v2/v1 BORDER.
 *
 * WHAT THIS MODULE IS FOR.
 *
 * `docs/audit_engineV2_optimizerV1_grens.md` §4 recorded two leaks with the
 * same shape: engine v2 derives a fact, the fact does not cross the worker
 * boundary, and the worker quietly re-derives a WORSE one.
 *
 *  · R_e (§4, leak 1). A5c.1 ranks three sources — a meter reading the designer
 *    entered, the motional fit, the direct low-frequency reading — and
 *    `resolveRe` in the ingest pass is the one place that walks that ranking.
 *    The worker's own `estimateRe(curve)` cannot even run the fit (it has no
 *    classified resonances to seed it), so it always produced the direct
 *    reading. On casus 1's woofer that is 3.81 Ω against a resolved 2.90 Ω, and
 *    the M-E bound `R_s ≤ R_e·(q−1)` was therefore 32 % too generous while the
 *    panel beside it showed the right number.
 *
 *  · Measurement validity (§4, leak 2). The A5b.1 interval — 1/T from the gate,
 *    clipped to the extent of the files — was replaced by the whole analysis
 *    grid, so the frozen passbands and every budget inversion also judged
 *    frequencies the measurement itself says are not there.
 *
 * ONE SOURCE OF TRUTH, AND IT IS THE REPORTING LAYER. The repair is not to
 * teach the worker to resolve R_e: two implementations of one hierarchy is how
 * they end up disagreeing, which is exactly the state F4b found. The ingest
 * pass resolves, this module carries, and the worker consumes — and when
 * nothing is carried the worker still has its fallback, says so, and the run
 * fingerprint records that it happened.
 *
 * WHY THE KEY LIVES HERE AND NOT IN `worker.ts`. `optimClient.ts` builds the
 * run stamp on the MAIN thread and needs the key as a value. Importing a value
 * from `worker.ts` would pull the whole worker module into the main bundle and,
 * worse, run its entry guard: on a browser main thread `self` is `window` and
 * `window.postMessage` is a function, so the import would install an
 * `onmessage` handler on the page. A type-only import is erased and is safe;
 * a value import is not. Hence this module, which holds no chain and no tuner.
 */

import type { EngineV2Report } from '../report.ts';

/**
 * The measured facts a v2 payload carries, per driver MODEL.
 *
 * Keyed by the model name the NETLIST uses, because that is what the worker's
 * `driverZ` is keyed by — not by the branch role the app stores measurements
 * under, and not by the driver id the report labels its rows with. Those three
 * vocabularies exist and `driverSlots.ts` is the bridge between the first two;
 * `factsForWorker` below is the bridge to the third.
 */
export interface MeasurementFactsPayload {
  /**
   * The RESOLVED R_e per model, ohms — whatever the A5c.1 hierarchy chose.
   *
   * Not "the entered value": the worker does not rank anything and must not,
   * or there would be two implementations of one hierarchy. Absent per model =
   * nothing was resolved for it and the worker falls back, visibly.
   */
  reOhmByModel?: Record<string, number>;
  /**
   * Which source produced the value above, in the words the report uses.
   *
   * Travels beside it rather than being inferred: 2.90 Ω from a meter and
   * 2.90 Ω from a motional fit are the same bound and a different claim.
   */
  reSourceByModel?: Record<string, string>;
  /** The A5b.1 validity interval per model, Hz. Absent = the grid, visibly. */
  validHzByModel?: Record<string, [number, number]>;
  /**
   * F4b2 — the FUNDAMENTAL in-box resonance per model, Hz (A5c.2/A5c.3).
   *
   * M-C reads the drive voltage at it and M-D derives its whole evaluation band
   * from it. The worker can classify an impedance itself, and did — but only
   * from the curve it holds, which sits on the chain's analysis grid. A woofer's
   * resonance is below that grid's lower edge, so the classification either
   * finds nothing or finds a cone mode and calls it f_s (V8b, the exact mistake
   * A5c.2's phase test exists to prevent).
   *
   * So the resonance crosses as a FACT, resolved once by the ingest pass on the
   * full sweep. Absent per model = the worker classifies its own curve and says
   * so, exactly as it does for R_e.
   */
  fundamentalHzByModel?: Record<string, number>;
  /**
   * F4b2 — the NEAR-FIELD curve per model, with its own validity interval.
   *
   * The one fact on this border that has to cross as a CURVE rather than as a
   * number. A4 M-D asks how much low-frequency lift a series inductor adds over
   * the bare box, and that is answered point by point against the measured near
   * field — there is no summary of it that the inversion could work from.
   *
   * `validHz` travels WITH the curve, in the shape F4b's leak 2 established: a
   * band is part of a measurement, not a property of whatever grid it landed
   * on. Absent per model = the LF-lift budget produces no bound, visibly.
   */
  nearFieldByModel?: Record<
    string,
    { grid: readonly number[]; db: readonly number[]; validHz: [number, number] }
  >;
  /**
   * F4b2 — the driver's OWN impedance sweep, with its validity interval.
   *
   * The worker already holds a driver impedance, so carrying a second copy
   * needs an argument. Here it is, and it is about COVERAGE rather than
   * precision. The worker's copy sits on the CHAIN's analysis grid, whose lower
   * edge is the far-field measurement span — at least 200 Hz in the running app
   * (`App.tsx`, the sim grid). A4 M-D evaluates over [0.7·f_p, 2.2·f_p], which
   * on casus 1's woofer is 36.7–115.2 Hz: entirely below that grid.
   *
   * Inverting there does not refuse. It reads no lift at any inductance,
   * doubles its bracket to the limit, and publishes a ceiling of 1 048 576 mH —
   * a thousand henries offered as a search bound. That is the failure mode this
   * project exists to prevent, and it is why the sweep crosses on its own grid
   * and why there is NO fallback to the analysis-grid copy: an inversion with
   * no data under its band must produce no bound, not a large one.
   */
  impedanceByModel?: Record<
    string,
    {
      grid: readonly number[];
      magnitude: readonly number[];
      phaseDeg: readonly number[];
      validHz: [number, number];
    }
  >;
}

/**
 * Which source each fact actually came from, per driver model.
 *
 * Produced by the worker while it builds its facts, and reported. A run that
 * divided by a resolved R_e and a run that divided by the worker's last resort
 * are different runs, and A5e.4 does not let two different runs wear the same
 * fingerprint however similar their numbers look.
 */
export interface MeasurementProvenance {
  re: Record<string, 'resolved' | 'worker-fallback'>;
  validHz: Record<string, 'measured' | 'grid-fallback'>;
  /** F4b2 — 'absent' is not a failure, it is a driver with no near field. */
  nearField: Record<string, 'measured' | 'absent'>;
  /** F4b2 — the driver's own sweep, or nothing. Never the analysis-grid copy. */
  impedanceSweep: Record<string, 'measured' | 'absent'>;
  /** F4b2 — the resonance: resolved by the ingest pass, or classified here. */
  fundamental: Record<string, 'resolved' | 'worker-fallback'>;
}

/**
 * The payload's facts as a fingerprint ingredient.
 *
 * Built from the PAYLOAD rather than from what the worker derived, and that is
 * not a shortcut: the payload decides the provenance completely — a model with
 * an entry runs on the resolved fact, a model without one falls back — so the
 * two agree by construction, and the stamp can be built where it already is.
 * Values are rounded to a fixed precision so two payloads that mean the same
 * thing cannot fingerprint differently over a float's last digit.
 */
export function measurementFactsKey(v2: MeasurementFactsPayload): Record<string, unknown> {
  const re: Record<string, unknown> = {};
  for (const model of Object.keys(v2.reOhmByModel ?? {}).sort()) {
    re[model] = {
      ohm: Number(v2.reOhmByModel![model].toPrecision(9)),
      source: v2.reSourceByModel?.[model] ?? 'unstated',
    };
  }
  const valid: Record<string, unknown> = {};
  for (const model of Object.keys(v2.validHzByModel ?? {}).sort()) {
    const b = v2.validHzByModel![model];
    valid[model] = [Number(b[0].toPrecision(9)), Number(b[1].toPrecision(9))];
  }
  /* The near field is a CURVE, and the fingerprint has to move when it moves —
   * a summary that ignored the samples would let two different measurements
   * fingerprint alike. The whole curve goes in; the ingredient is digested
   * afterwards, so the cost is one pass over a few hundred numbers per run. */
  const fundamental: Record<string, unknown> = {};
  for (const model of Object.keys(v2.fundamentalHzByModel ?? {}).sort()) {
    fundamental[model] = Number(v2.fundamentalHzByModel![model].toPrecision(9));
  }
  const nearField: Record<string, unknown> = {};
  for (const model of Object.keys(v2.nearFieldByModel ?? {}).sort()) {
    const nf = v2.nearFieldByModel![model];
    nearField[model] = {
      valid: [Number(nf.validHz[0].toPrecision(9)), Number(nf.validHz[1].toPrecision(9))],
      grid: nf.grid.map((f) => Number(f.toPrecision(9))),
      db: nf.db.map((v) => Number(v.toPrecision(9))),
    };
  }
  const impedance: Record<string, unknown> = {};
  for (const model of Object.keys(v2.impedanceByModel ?? {}).sort()) {
    const z = v2.impedanceByModel![model];
    impedance[model] = {
      valid: [Number(z.validHz[0].toPrecision(9)), Number(z.validHz[1].toPrecision(9))],
      grid: z.grid.map((f) => Number(f.toPrecision(9))),
      mag: z.magnitude.map((v) => Number(v.toPrecision(9))),
      ph: z.phaseDeg.map((v) => Number(v.toPrecision(9))),
    };
  }
  return { re, valid, fundamental, nearField, impedance };
}

/**
 * The report's own facts, keyed the way the worker needs them.
 *
 * `modelByDriverId` maps a driver id as the REPORT knows it (the netlist's
 * model name, or the branch role when there is no netlist to read one from) to
 * the model key the worker's `driverZ` uses. The app builds it from the
 * adapter's `driverIds` and `canonicalModelForRole`; nothing here guesses, and
 * a driver with no mapping is left out rather than published under a name the
 * worker will not find.
 *
 * A driver whose R_e could not be resolved at all contributes no entry, which
 * is the honest state: the worker then falls back and says so. That is
 * deliberately not the same as contributing the direct reading here — the
 * report already prefers the direct reading when the fit refuses, so an absent
 * entry means "the ingest pass produced nothing", not "the fit was refused".
 */
export function factsForWorker(
  report: EngineV2Report,
  modelByDriverId: Readonly<Record<string, string>>,
  /**
   * The raw impedance sweep per REPORT driver id.
   *
   * Passed in rather than read off the report, because the report does not keep
   * it: `DerivedDriver` holds the CLASSIFICATION of an impedance (R_e, the
   * alignment, the resonances) and not the curve it was classified from. The
   * caller has the sweeps — it handed them to the adapter in the first place —
   * so asking for them here is cheaper and more honest than teaching the report
   * to carry a curve nothing in it reads.
   */
  sweepByDriverId: Readonly<
    Record<string, { freq: readonly number[]; magnitude: readonly number[]; phaseDeg: readonly number[] }>
  > = {},
): MeasurementFactsPayload {
  const reOhmByModel: Record<string, number> = {};
  const reSourceByModel: Record<string, string> = {};
  const validHzByModel: Record<string, [number, number]> = {};
  const fundamentalHzByModel: Record<string, number> = {};
  const nearFieldByModel: NonNullable<MeasurementFactsPayload['nearFieldByModel']> = {};
  const impedanceByModel: NonNullable<MeasurementFactsPayload['impedanceByModel']> = {};

  for (const d of report.ingest.drivers) {
    const model = modelByDriverId[d.driver];
    if (model === undefined) continue;
    if (d.re && Number.isFinite(d.re.ohm) && d.re.ohm > 0) {
      reOhmByModel[model] = d.re.ohm;
      reSourceByModel[model] = d.re.sourceText;
    }
    // F4b2 — the resonance the ingest pass settled on the FULL sweep, which is
    // the one thing the worker's own classification cannot see from the chain's
    // grid.
    const f0 = d.impedance?.fundamentalHz;
    if (f0 !== null && f0 !== undefined && Number.isFinite(f0) && f0 > 0) {
      fundamentalHzByModel[model] = f0;
    }

    // The FAR-FIELD validity band, which is what a passband is judged on. The
    // near-field band answers a different question (how high the near field may
    // be believed) and travels with the near-field curve below.
    const band = d.onAxis?.bandHz;
    if (band && Number.isFinite(band[0]) && Number.isFinite(band[1]) && band[1] > band[0]) {
      validHzByModel[model] = [band[0], band[1]];
    }

    // F4b2 — the near field, with its OWN band. Only when there is a curve to
    // send: a driver with no near-field measurement contributes nothing, and
    // the LF-lift budget then produces no bound and says which input was
    // missing. That is the whole of P4 here.
    const nf = d.nearField;
    if (nf && nf.grid.length > 0 && nf.bandHz[1] > nf.bandHz[0]) {
      nearFieldByModel[model] = {
        grid: [...nf.grid],
        db: [...nf.db],
        validHz: [nf.bandHz[0], nf.bandHz[1]],
      };
    }

    // F4b2 — the sweep, on its OWN grid. Its validity is its extent: an
    // impedance measurement carries no gate, so there is no interval to derive
    // beyond the frequencies it actually holds.
    const sweep = sweepByDriverId[d.driver];
    if (sweep && sweep.freq.length > 1) {
      impedanceByModel[model] = {
        grid: [...sweep.freq],
        magnitude: [...sweep.magnitude],
        phaseDeg: [...sweep.phaseDeg],
        validHz: [sweep.freq[0], sweep.freq[sweep.freq.length - 1]],
      };
    }
  }

  return {
    ...(Object.keys(reOhmByModel).length > 0 ? { reOhmByModel, reSourceByModel } : {}),
    ...(Object.keys(validHzByModel).length > 0 ? { validHzByModel } : {}),
    ...(Object.keys(fundamentalHzByModel).length > 0 ? { fundamentalHzByModel } : {}),
    ...(Object.keys(nearFieldByModel).length > 0 ? { nearFieldByModel } : {}),
    ...(Object.keys(impedanceByModel).length > 0 ? { impedanceByModel } : {}),
  };
}
