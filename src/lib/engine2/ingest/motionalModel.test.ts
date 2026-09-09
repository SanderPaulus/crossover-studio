/**
 * B-1 — THE HALF-POWER LEAK TERM, TESTED INSTEAD OF ASSUMED.
 *
 * The term `K·(jω)^n` sat in the R_e fit unconditionally, so nobody had ever
 * measured whether it belongs — and casus 2 published an exponent 15 % away
 * from the value its own model was built with, without a word of doubt (casus
 * 2 finding B2).
 *
 * Both models are fitted on every sweep now and both are reported. THE TERM IS
 * KEPT EVERYWHERE, and that is a measurement rather than a habit: casus 2 is
 * the only place that can settle it, and there the leak arm returns the model's
 * own R_e while the bare arm misses it by an order more than that casus allows.
 * The choice could not be made from one sweep in any case — the term absorbs
 * whatever the branches cannot explain, so neither its size nor the residual it
 * buys is evidence of a coil, and this file measures that too.
 *
 * WHAT THE SWEEP CAN DECIDE is narrower and is exactly what B2 asked for:
 * whether the term's EXPONENT is a measurement or a nuisance, answered by the
 * fit's own band test. That is the one live decision here, so it is the one
 * pinned in BOTH directions — a clean coil sweep publishes it, and the same
 * sweep with one unmodelled mode withholds it. Without that pair, "the
 * exponent is published where it is right" and "the test never fires" are the
 * same green.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveRe, type ImpedanceCurve } from './impedance.ts';
import {
  fitMotionalRe,
  leakImpedanceAt,
  type MotionalReFit,
} from './motionalFit.ts';
import { RE_FIT_MAX_BAND_SENSITIVITY_FRACTION } from '../constants.ts';
import {
  CASUS1_DIR,
  casus1ExcursionSettings,
  casus1Files,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  casus1TargetCurve,
  loadGolden,
  type Casus1MeasurementSet,
} from '../casus1.fixture.ts';
import {
  CASUS2_REPORT_SETTINGS,
  casus2Files,
  casus2Geometry,
  casus2Manifest,
  casus2Truth,
  loadGolden2,
} from '../casus2.fixture.ts';
import { buildReport, type EngineV2Report } from '../report.ts';

/* ------------------------------------------------------------------ *
 * A synthetic sweep of exactly the form the fit assumes
 * ------------------------------------------------------------------ */

interface Branch {
  r: number;
  f: number;
  q: number;
}

/**
 * `leak` is the coil as the MODEL carries it — K·(jω)^n, stated by the ohms it
 * reaches at 10 kHz, which is how a datasheet states it. `null` builds a sweep
 * with no coil at all.
 */
function synthetic(o: {
  re: number;
  leak: { ohmAt10k: number; n: number } | null;
  branches: Branch[];
  fromHz: number;
  toHz: number;
  points: number;
}): ImpedanceCurve {
  const k =
    o.leak === null ? null : o.leak.ohmAt10k / Math.pow(2 * Math.PI * 10000, o.leak.n);
  const freq: number[] = [];
  const magnitude: number[] = [];
  const phaseDeg: number[] = [];
  for (let i = 0; i < o.points; i++) {
    const f = o.fromHz * Math.pow(o.toHz / o.fromHz, i / (o.points - 1));
    const l = leakImpedanceAt(k, o.leak?.n ?? null, f);
    let re = o.re + l.re;
    let im = l.im;
    for (const b of o.branches) {
      const d = b.q * (f / b.f - b.f / f);
      const den = 1 + d * d;
      re += b.r / den;
      im += (-b.r * d) / den;
    }
    freq.push(f);
    magnitude.push(Math.hypot(re, im));
    phaseDeg.push((Math.atan2(im, re) * 180) / Math.PI);
  }
  return { freq, magnitude, phaseDeg };
}

/** The fit, taken the way `estimateRe` takes it: seeded from the classification. */
function fitOf(curve: ImpedanceCurve): MotionalReFit {
  const resolved = resolveRe(curve);
  const fit = resolved.re.fit;
  if (!fit) throw new Error('the synthetic sweep produced no fit');
  return fit;
}

/* ------------------------------------------------------------------ *
 * Every sweep in the casebook, through the reports that read them
 * ------------------------------------------------------------------ */

const g1 = loadGolden();
/* The classes the casebook publishes, read and never typed here. Each quantity
 * takes the class the casebook gives it: R_e in ohms, the fit's own residual
 * and the leak fraction in `fit_kwaliteit_pct`, the exponent and its spread in
 * `exponent_pct`. */
const TOL = g1.toleranties as unknown as Record<string, number>;
const OHM_TOL = TOL.ohm;
const FIT_TOL_PCT = TOL.fit_kwaliteit_pct;
const EXPONENT_TOL_PCT = TOL.exponent_pct;
function casus1(set: Casus1MeasurementSet): EngineV2Report {
  const manifest = casus1Manifest(g1, set);
  return buildReport({
    manifest,
    files: casus1Files(manifest),
    filter: null,
    geometry: casus1Geometry(g1),
    settings: {
      targetCurve: casus1TargetCurve(g1),
      ...casus1ExcursionSettings(g1),
      ...(Object.keys(casus1MaxDriveOnFsDbByDriver(g1)).length > 0
        ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(g1) }
        : {}),
    },
  });
}

const g2 = loadGolden2();
const m2 = casus2Manifest(g2);
const CASUS2 = buildReport({
  manifest: m2,
  files: casus2Files(m2),
  filter: null,
  geometry: casus2Geometry(g2),
  settings: CASUS2_REPORT_SETTINGS,
});

const BOOK: { casus: string; report: EngineV2Report }[] = [
  { casus: 'casus 1 (merged)', report: casus1('merged') },
  { casus: 'casus 1 (gated)', report: casus1('gated') },
  { casus: 'casus 2', report: CASUS2 },
];

function fitsOf(report: EngineV2Report): { way: string; fit: MotionalReFit }[] {
  const out: { way: string; fit: MotionalReFit }[] = [];
  for (const d of report.ingest.drivers) {
    if (d.re?.fit) out.push({ way: d.driver, fit: d.re.fit });
  }
  return out;
}

describe('B-1 — the half-power leak term, tested instead of assumed', () => {
  /* ---------------------------------------------------------------- *
   * THE LIVE DECISION, BOTH WAYS. The model itself is not chosen — the
   * header measures why it cannot be — so the decision this file has to
   * pin in both directions is the one the sweep CAN make: whether the
   * exponent is a measurement. Without the pair below, every other
   * claim here is also true of a test that never fires.
   * ---------------------------------------------------------------- */

  it('a clean coil sweep IDENTIFIES the exponent, and it is the value built in', () => {
    /* Nothing here but R_e, one resonance and the coil — the model the fit
     * assumes, exactly. The exponent must then be a property of the sweep and
     * not of the band it was asked on, and it must be 0.7. */
    const curve = synthetic({
      re: 6,
      leak: { ohmAt10k: 12, n: 0.7 },
      branches: [{ r: 40, f: 40, q: 6 }],
      fromHz: 5,
      toHz: 200,
      points: 400,
    });
    const fit = fitOf(curve);
    expect(fit.exponent.identified).toBe(true);
    expect(fit.exponent.bandSpreadFraction).toBeLessThan(1e-6);
    expect(fit.exponentN).not.toBeNull();
    expect(fit.exponentN!).toBeCloseTo(0.7, 6);
    expect(fit.coefficientK).not.toBeNull();
  });

  it('ONE unmodelled mode and the same exponent stops being a measurement', () => {
    /* The identical sweep with one thing added: a second resonance at 3 Ω on a
     * 6 Ω coil — 1.5·R_e, UNDER the 1.6·R_e bar a crest must clear to be
     * classified, so the fit is never seeded with it and no arm can absorb it.
     * A mode the classification does not see is what leaves a real sweep a
     * residual floor, and this is the smallest honest way to put one there.
     *
     * The leak term then soaks it up, and the fit has to say so: the exponent
     * swings across the comparison bands and is withheld. THIS PAIR IS THE
     * WHOLE FILE — without it, "the exponent is published where it is right"
     * and "the test never fires" are the same green. */
    const curve = synthetic({
      re: 6,
      leak: { ohmAt10k: 12, n: 0.7 },
      branches: [
        { r: 40, f: 40, q: 6 },
        { r: 2, f: 120, q: 9 },
      ],
      fromHz: 5,
      toHz: 200,
      points: 400,
    });
    /* The premise, asserted rather than assumed: the second mode is invisible
     * to the classification, so the fit gets exactly one seed. */
    const resolved = resolveRe(curve);
    expect(resolved.classification.motionalPeaks).toHaveLength(1);
    const fit = fitOf(curve);
    expect(fit.exponent.identified).toBe(false);
    expect(fit.exponent.bandSpreadFraction).toBeGreaterThan(
      RE_FIT_MAX_BAND_SENSITIVITY_FRACTION,
    );
    expect(fit.exponentN).toBeNull();
    expect(fit.coefficientK).toBeNull();
    /* And the value is still VISIBLE — withheld from the published field, not
     * thrown away, so a reader can see what was rejected and why. */
    expect(Number.isFinite(fit.exponent.onPrimaryBand)).toBe(true);
    expect(fit.exponent.reason).toContain('NUISANCE');
  });

  it('the leak term is a SPONGE, which is why residual and term size cannot choose', () => {
    /* The measurement that decided there is no model chooser. The coil here
     * contributes 0.10 % of |Z| at the top of the fit band and the fitted term
     * reads 8.95 % — ninety-three times too big — because it is standing in
     * for the unmodelled mode. Any criterion built on the term's size, or on
     * what it bought in residual, would call that evidence of a coil. */
    const truthOhmAt10k = 0.2;
    const n = 0.7;
    const curve = synthetic({
      re: 6,
      leak: { ohmAt10k: truthOhmAt10k, n },
      branches: [
        { r: 40, f: 40, q: 6 },
        { r: 3, f: 120, q: 9 },
      ],
      fromHz: 5,
      toHz: 200,
      points: 400,
    });
    const fit = fitOf(curve);
    const topHz = fit.bandHz[1];
    const truthK = truthOhmAt10k / Math.pow(2 * Math.PI * 10000, n);
    const truthAtTop = leakImpedanceAt(truthK, n, topHz).mag;
    const fittedAtTop = leakImpedanceAt(
      fit.arms.plusLeak.coefficientK,
      fit.arms.plusLeak.exponentN,
      topHz,
    ).mag;
    expect(fittedAtTop / truthAtTop).toBeGreaterThan(50);
    expect(fit.arms.plusLeak.leakFractionAtBandTop).toBeGreaterThan(0.05);
    /* And it bought a residual improvement, so the ratio calls it earned. */
    expect(fit.residualRatio).toBeGreaterThan(1.2);
    /* The exponent test is the one that is not fooled. */
    expect(fit.exponent.identified).toBe(false);
  });

  it('the bare model ABSTAINS on the coil parameters — null, never zero (F0)', () => {
    const curve = synthetic({
      re: 6,
      leak: null,
      branches: [{ r: 40, f: 40, q: 6 }],
      fromHz: 5,
      toHz: 200,
      points: 400,
    });
    const fit = fitOf(curve);
    expect(fit.arms.secondOrder.coefficientK).toBeNull();
    expect(fit.arms.secondOrder.exponentN).toBeNull();
    /* And the arm the fit publishes is the leak one, on every sweep — the
     * bare arm is the counterfactual and never the answer. */
    expect(fit.model).toBe('second-order-plus-leak');
  });

  /* ---------------------------------------------------------------- *
   * WHAT THE CHOICE DID TO THE CASEBOOK: nothing.
   * ---------------------------------------------------------------- */

  it.each(BOOK)('$casus: every sweep keeps the leak term, and its value is the old one', ({ report }) => {
    const fits = fitsOf(report);
    expect(fits.length).toBeGreaterThan(0);
    for (const { way, fit } of fits) {
      expect(`${way}: ${fit.model}`).toBe(`${way}: second-order-plus-leak`);
      /* The byte claim, in place: the published R_e IS the leak arm's, to the
       * last bit. `z-re` went 1.1 → 1.2 for a shape that grew, not a number
       * that moved. */
      expect(fit.reOhm).toBe(fit.arms.plusLeak.reOhm);
      expect(fit.branches).toEqual(fit.arms.plusLeak.branches);
      expect(fit.exponent.onPrimaryBand).toBe(fit.arms.plusLeak.exponentN);
      /* The published exponent is the primary band's ONLY when it survived the
       * band test; otherwise null. Both halves, so neither can rot. */
      expect(fit.exponentN).toBe(fit.exponent.identified ? fit.arms.plusLeak.exponentN : null);
      expect(fit.coefficientK).toBe(
        fit.exponent.identified ? fit.arms.plusLeak.coefficientK : null,
      );
    }
  });

  it.each(BOOK)('$casus: the nested model can never fit worse, so the ratio is ≥ 1', ({ report }) => {
    for (const { way, fit } of fitsOf(report)) {
      expect(`${way}: ${fit.residualRatio >= 1}`).toBe(`${way}: true`);
      expect(fit.arms.secondOrder.relativeResidual).toBeGreaterThanOrEqual(
        fit.arms.plusLeak.relativeResidual,
      );
      /* The bare arm has no term to have a fraction of. */
      expect(fit.arms.secondOrder.leakFractionAtBandTop).toBe(0);
    }
  });

  it.each(BOOK)('$casus: the leak arm always reads the LOWER R_e, so the term is not free', ({ report }) => {
    for (const { way, fit } of fitsOf(report)) {
      /* The leak term's real part is positive and grows with frequency, so a
       * model carrying it needs less R_e to reach the same |Z|. That makes the
       * bare arm's R_e an UPPER bound and the difference a real quantity, not
       * fitting noise — which is why casus 2 can judge the two. */
      expect(`${way}: ${fit.arms.plusLeak.reOhm <= fit.arms.secondOrder.reOhm}`).toBe(
        `${way}: true`,
      );
      /* And on every sweep in the book the two stay inside the spread this fit
       * already allows R_e across its own comparison bands — so the term is
       * not rescuing a fit that would otherwise be refused. */
      const spread = Math.abs(fit.arms.plusLeak.reOhm - fit.arms.secondOrder.reOhm);
      expect(spread / fit.reOhm).toBeLessThanOrEqual(RE_FIT_MAX_BAND_SENSITIVITY_FRACTION);
    }
  });

  /* ---------------------------------------------------------------- *
   * THE GROUND TRUTH — the only place that can say which model is right
   * ---------------------------------------------------------------- */

  it('casus 2: the leak term is LOAD-BEARING on a pure second-order peak', () => {
    /* The tweeter is a single sealed resonance and nothing else, so a bare
     * second-order model looks like the honest one. It is not: the sweep runs
     * to 4483 Hz, the coil is a quarter of |Z| up there, and a model without
     * it lets the branch absorb the coil's rise. The model KNOWS Q_ms = 1.6,
     * and that is what makes this measurable rather than arguable. */
    const truth = casus2Truth(g2);
    const tw = CASUS2.ingest.drivers.find((d) => d.driver === 'tweeter')!;
    const fit = tw.re!.fit!;
    const gtQ = (truth.drivers.tweeter as Record<string, number>).Q_ms;
    const gtF = (truth.drivers.tweeter as Record<string, number>).f_s_hz;
    const nearest = (f: number, bs: readonly { fHz: number; q: number }[]) =>
      bs.reduce((a, b) => (Math.abs(b.fHz - f) < Math.abs(a.fHz - f) ? b : a));
    const withLeak = nearest(gtF, fit.arms.plusLeak.branches);
    const bare = nearest(gtF, fit.arms.secondOrder.branches);
    const off = (q: number) => Math.abs(q / gtQ - 1) * 100;
    /* The leak model finds the input back; the bare model is 8 % away — the
     * tolerance class for Q is 7 %, so it would be a FINDING. */
    expect(off(withLeak.q)).toBeLessThan(0.01);
    expect(off(bare.q)).toBeGreaterThan(7);
    expect(fit.model).toBe('second-order-plus-leak');
  });

  it('casus 2: the exponent the chosen model publishes is the model input, on the sealed ways', () => {
    const truth = casus2Truth(g2);
    for (const way of ['mid', 'tweeter']) {
      const fit = CASUS2.ingest.drivers.find((d) => d.driver === way)!.re!.fit!;
      const gt = (truth.drivers[way] as Record<string, number>).semi_inductantie_n;
      /* Published BECAUSE it is identified, and exact BECAUSE it is real.
       * The two halves are one claim: the band test lets through the value the
       * model was built with, on both ways where the model has one. */
      expect(`${way}: ${fit.exponent.identified}`).toBe(`${way}: true`);
      expect(`${way}: ${fit.exponentN !== null}`).toBe(`${way}: true`);
      expect(Math.abs(fit.exponentN! / gt - 1) * 100).toBeLessThan(0.001);
    }
  });

  it('casus 2: the vented way is where the MODEL runs out, not the leak term (B2)', () => {
    /* B2 records the woofer's exponent 15 % away and blames a coil too small
     * to see. This measures both halves of that and refutes it: the term is
     * a fifth of |Z| at the band top — identifiable, and chosen — while the
     * residual on the vented way is two orders above the sealed ways, because
     * a vented alignment is a COUPLED fourth-order system and this model is a
     * sum of independent second-order branches. The exponent absorbs the
     * difference. */
    const woofer = CASUS2.ingest.drivers.find((d) => d.driver === 'woofer')!.re!.fit!;
    const mid = CASUS2.ingest.drivers.find((d) => d.driver === 'mid')!.re!.fit!;
    const tweeter = CASUS2.ingest.drivers.find((d) => d.driver === 'tweeter')!.re!.fit!;
    expect(woofer.model).toBe('second-order-plus-leak');
    expect(woofer.arms.plusLeak.leakFractionAtBandTop).toBeGreaterThan(0.05);
    /* The sealed ways are fitted EXACTLY — the model generated them. */
    expect(mid.relativeResidual).toBeLessThan(1e-6);
    expect(tweeter.relativeResidual).toBeLessThan(1e-6);
    /* The vented one is not, by four orders of magnitude. */
    expect(woofer.relativeResidual).toBeGreaterThan(1e-2);
    /* THE REPAIR: the exponent that was 15 % off is no longer published. The
     * band test catches it (8.9 % against a 6 % limit) and the fit abstains,
     * while the two sealed ways keep theirs. */
    expect(woofer.exponent.identified).toBe(false);
    expect(woofer.exponentN).toBeNull();
    expect(mid.exponentN).not.toBeNull();
    expect(tweeter.exponentN).not.toBeNull();
  });

  /* ---------------------------------------------------------------- *
   * A5e.4 — the choice is deterministic
   * ---------------------------------------------------------------- */

  it('the same sweep gives the same choice and the same numbers, twice', () => {
    const curve = synthetic({
      re: 6,
      leak: { ohmAt10k: 12, n: 0.7 },
      branches: [{ r: 40, f: 40, q: 6 }],
      fromHz: 5,
      toHz: 200,
      points: 400,
    });
    const a = fitOf(curve);
    const b = fitOf(curve);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the fit REFUSES both arms together when the band cannot carry the richer one', () => {
    /* A band that can only carry the bare model could compare nothing, so the
     * sample count is judged on the RICHER model and both arms go together.
     * Five samples against six parameters — the bare model would fit (four
     * parameters), and it must not be offered on its own. */
    const curve = synthetic({
      re: 6,
      leak: { ohmAt10k: 12, n: 0.7 },
      branches: [{ r: 40, f: 40, q: 6 }],
      fromHz: 30,
      toHz: 60,
      points: 5,
    });
    const short = fitMotionalRe({
      freq: curve.freq,
      magnitude: curve.magnitude,
      phaseDeg: curve.phaseDeg,
      fundamentalHz: 40,
      seeds: [{ fHz: 40, ohm: 46, q: 6 }],
      startReOhm: 6,
    });
    expect(short).toBeNull();
    /* The tegenproef: one more sample and the SAME call fits. Without it,
     * "returns null" is not distinguishable from a broken input. */
    const enough = synthetic({
      re: 6,
      leak: { ohmAt10k: 12, n: 0.7 },
      branches: [{ r: 40, f: 40, q: 6 }],
      fromHz: 30,
      toHz: 60,
      points: 6,
    });
    const ok = fitMotionalRe({
      freq: enough.freq,
      magnitude: enough.magnitude,
      phaseDeg: enough.phaseDeg,
      fundamentalHz: 40,
      seeds: [{ fHz: 40, ohm: 46, q: 6 }],
      startReOhm: 6,
    });
    expect(ok).not.toBeNull();
  });

  /* ---------------------------------------------------------------- *
   * The measurement file reproduces from a fresh reading
   * ---------------------------------------------------------------- */

  it('the recorded B-1 measurement reproduces, row for row', () => {
    const path = join(CASUS1_DIR, '..', 'casus1_b1_modelkeuze.json');
    const rec = JSON.parse(readFileSync(path, 'utf8')) as {
      rijen: {
        casus: string;
        weg: string;
        gekozen: string;
        residu_verhouding: number;
        exponent_geidentificeerd: boolean;
        exponent_bandspreiding_pct: number;
        exponent_op_primaire_band: number;
        armen: {
          tweede_orde: { R_e_ohm: number; residu: number };
          plus_lek: { R_e_ohm: number; residu: number; lek_fractie_bandtop: number };
        };
      }[];
    };
    const fresh = new Map<string, MotionalReFit>();
    for (const { casus, report } of BOOK) {
      for (const { way, fit } of fitsOf(report)) fresh.set(`${casus}/${way}`, fit);
    }
    let seen = 0;
    for (const row of rec.rijen) {
      const fit = fresh.get(`${row.casus}/${row.weg}`);
      if (!fit) continue; // casus 1b reads the same files through its own manifest
      seen++;
      expect(`${row.casus}/${row.weg}: ${row.gekozen}`).toBe(
        `${row.casus}/${row.weg}: ${fit.model}`,
      );
      /* AGAINST THE CASUS'S OWN TOLERANCE CLASSES, not against nine decimals.
       * V46 measured that a float result is reproducible per (machine,
       * runtime) and not across them, and this is an iterative fit read on a
       * second platform in CI. The verdicts below are exact — a boolean and a
       * string do not drift — and the numbers are held to the class the
       * casebook publishes for them. */
      expect(Math.abs(row.armen.plus_lek.R_e_ohm - fit.arms.plusLeak.reOhm)).toBeLessThanOrEqual(
        OHM_TOL,
      );
      expect(
        Math.abs(row.armen.tweede_orde.R_e_ohm - fit.arms.secondOrder.reOhm),
      ).toBeLessThanOrEqual(OHM_TOL);
      const near = (a: number, b: number): number =>
        b === 0 ? Math.abs(a) : Math.abs(a / b - 1) * 100;
      expect(near(row.armen.plus_lek.residu, fit.arms.plusLeak.relativeResidual)).toBeLessThanOrEqual(
        FIT_TOL_PCT,
      );
      expect(
        near(row.armen.tweede_orde.residu, fit.arms.secondOrder.relativeResidual),
      ).toBeLessThanOrEqual(FIT_TOL_PCT);
      expect(
        near(row.armen.plus_lek.lek_fractie_bandtop, fit.arms.plusLeak.leakFractionAtBandTop),
      ).toBeLessThanOrEqual(FIT_TOL_PCT);
      /* The exponent verdict is the field this file exists for; a recorded
       * value nothing checks is decoration (V19). */
      expect(`${row.casus}/${row.weg}: ${row.exponent_geidentificeerd}`).toBe(
        `${row.casus}/${row.weg}: ${fit.exponent.identified}`,
      );
      expect(
        near(row.exponent_bandspreiding_pct, fit.exponent.bandSpreadFraction * 100),
      ).toBeLessThanOrEqual(EXPONENT_TOL_PCT);
      expect(
        near(row.exponent_op_primaire_band, fit.exponent.onPrimaryBand),
      ).toBeLessThanOrEqual(EXPONENT_TOL_PCT);
    }
    /* Casus 1 twice (two measurement sets) and casus 2 once. */
    expect(seen).toBe(9);
  });

  it('the fit still refuses on a sweep the model does not describe', () => {
    /* P4 and V8e together: the model choice must not have become a way to
     * always find SOMETHING. A curve with a resonance the branch model cannot
     * follow still has to come back refused, whichever arm wins. */
    const curve = synthetic({
      re: 6,
      leak: { ohmAt10k: 12, n: 0.7 },
      branches: [{ r: 40, f: 40, q: 6 }],
      fromHz: 5,
      toHz: 200,
      points: 400,
    });
    const wrecked: ImpedanceCurve = {
      freq: curve.freq,
      magnitude: curve.magnitude.map((m, i) => m * (1 + 0.5 * Math.sin(i / 3))),
      phaseDeg: curve.phaseDeg,
    };
    const fit = fitMotionalRe({
      freq: wrecked.freq,
      magnitude: wrecked.magnitude,
      phaseDeg: wrecked.phaseDeg,
      fundamentalHz: 40,
      seeds: [{ fHz: 40, ohm: 46, q: 6 }],
      startReOhm: 6,
    });
    expect(fit).not.toBeNull();
    expect(fit!.accepted).toBe(false);
    expect(fit!.refusal).toContain('does not describe this impedance');
    /* Both arms still reported — a refusal is not a reason to hide the
     * comparison that produced it. */
    expect(fit!.arms.secondOrder.relativeResidual).toBeGreaterThan(0);
    expect(fit!.arms.plusLeak.relativeResidual).toBeGreaterThan(0);
  });
});
