/**
 * B-1 — WHICH IMPEDANCE MODEL EACH MEASURED SWEEP SUPPORTS.
 *
 * `npx vite-node scripts/measure-b1-motional-model.ts` — seconds, no chain run
 * and no tune.
 *
 * THE QUESTION. The motional R_e fit (`motionalFit.ts`) carries a HALF-POWER
 * LEAK term `K·(jω)^n` beside R_e and the resonance branches. It is there
 * because casus 1 needs it: real motors on real sweeps leave structure that a
 * bare second-order model pushes into R_e. Casus 2 is the counter-case that a
 * real casus cannot provide — the model that generated it KNOWS n, and on the
 * woofer the fit read 15 % away from it while publishing no doubt at all
 * (casus 2 finding B2).
 *
 * WHAT THIS PRINTS. Per sweep of every casus in the book, both arms side by
 * side: R_e, the relative RMS residual, the leak term's own relative size at
 * the top of the fit band, the exponent and whether the sweep could identify
 * it, and the resulting f/Q of the fundamental branch. Where a ground truth
 * exists (casus 2) it stands beside each arm, so "the extractor finds the
 * input back" is a reading and not a claim. Then two more tables: what else
 * sits inside the HF fit's own band (the motional tail — the corrected cause
 * of casus 2 finding B1), and the DOWNSTREAM counterfactual, measured by
 * feeding each arm's R_e in as the reading.
 *
 * THE TERM IS KEPT ON EVERY SWEEP, AND THIS IS THE MEASUREMENT THAT SAYS SO.
 * Casus 2 settles it: the leak arm returns the model's own R_e on all three
 * ways and the bare arm misses it by an order more than that casus allows R_e
 * to move. There is no model chooser — model (b) NESTS model (a), so the
 * residual ratio can never be below 1, and the term absorbs whatever the
 * branches leave behind, so its own size is no better. Both quantities are
 * printed anyway, because seeing them is how a reader checks that.
 *
 * Writes `test-fixtures/casus1_b1_modelkeuze.json`; `motionalModel.test.ts`
 * reproduces it from a fresh measurement.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  casus1bFiles,
  casus1bManifest,
  CASUS1B_REPORT_SETTINGS,
  casus1bGeometry,
  loadGolden1b,
} from '../src/lib/engine2/casus1b.fixture.ts';
import {
  CASUS2_REPORT_SETTINGS,
  casus2Files,
  casus2Geometry,
  casus2Manifest,
  casus2Truth,
  loadGolden2,
} from '../src/lib/engine2/casus2.fixture.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import type { XoWindowResult } from '../src/lib/engine2/predesign/xoWindow.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import {
  leakImpedanceAt,
  motionalImpedanceAt,
  type MotionalModelArm,
  type MotionalReFit,
} from '../src/lib/engine2/ingest/motionalFit.ts';

const num = (v: number | null, d = 4): string => (v === null ? '—' : v.toFixed(d));
const pct = (v: number | null, d = 3): string => (v === null ? '—' : `${(v * 100).toFixed(d)} %`);

interface ArmRow {
  model: string;
  R_e_ohm: number;
  residu: number;
  lek_fractie_bandtop: number;
  /** The leak term's magnitude at the top of the fit band, ohms. */
  lek_ohm_bandtop: number;
  n: number | null;
  k: number | null;
  fundamenteel_hz: number | null;
  fundamenteel_Q: number | null;
}

interface Row {
  casus: string;
  weg: string;
  band_hz: [number, number];
  gekozen: string;
  reden: string;
  exponent_geidentificeerd: boolean;
  exponent_bandspreiding_pct: number;
  exponent_op_primaire_band: number;
  exponent_reden: string;
  residu_verhouding: number;
  identificeerbaar: boolean;
  armen: { tweede_orde: ArmRow; plus_lek: ArmRow };
  grondwaarheid_n: number | null;
  /** How far each arm's exponent sits from the ground truth, percent. */
  n_afwijking_pct: { tweede_orde: number | null; plus_lek: number | null };
  R_e_verschil_ohm: number;
  aanvaard: boolean;
  weigering: string | null;
}

/** The fundamental branch of an arm: the one nearest the fit's own lowest seed. */
function fundamentalOf(arm: MotionalModelArm, fundamentalHz: number | null): {
  fHz: number | null;
  q: number | null;
} {
  if (fundamentalHz === null || arm.branches.length === 0) return { fHz: null, q: null };
  let best = arm.branches[0];
  for (const b of arm.branches) {
    if (Math.abs(b.fHz - fundamentalHz) < Math.abs(best.fHz - fundamentalHz)) best = b;
  }
  return { fHz: best.fHz, q: best.q };
}

function armRow(arm: MotionalModelArm, fundamentalHz: number | null, topHz: number): ArmRow {
  const f = fundamentalOf(arm, fundamentalHz);
  return {
    model: arm.model,
    R_e_ohm: arm.reOhm,
    residu: arm.relativeResidual,
    lek_fractie_bandtop: arm.leakFractionAtBandTop,
    lek_ohm_bandtop: leakImpedanceAt(arm.coefficientK, arm.exponentN, topHz).mag,
    n: arm.exponentN,
    k: arm.coefficientK,
    fundamenteel_hz: f.fHz,
    fundamenteel_Q: f.q,
  };
}

function rowsOf(casus: string, report: EngineV2Report, truthN: Record<string, number>): Row[] {
  const out: Row[] = [];
  for (const d of report.ingest.drivers) {
    const fit: MotionalReFit | null | undefined = d.re?.fit;
    if (!fit) continue;
    const fHz = d.impedance?.fundamentalHz ?? null;
    const gt = truthN[d.driver] ?? null;
    const bare = armRow(fit.arms.secondOrder, fHz, fit.bandHz[1]);
    const leak = armRow(fit.arms.plusLeak, fHz, fit.bandHz[1]);
    const dev = (n: number | null): number | null =>
      n === null || gt === null ? null : ((n - gt) / gt) * 100;
    out.push({
      casus,
      weg: d.driver,
      band_hz: fit.bandHz,
      gekozen: fit.model,
      reden: fit.modelReason,
      exponent_geidentificeerd: fit.exponent.identified,
      exponent_bandspreiding_pct: fit.exponent.bandSpreadFraction * 100,
      exponent_op_primaire_band: fit.exponent.onPrimaryBand,
      exponent_reden: fit.exponent.reason,
      residu_verhouding: fit.residualRatio,
      identificeerbaar:
        fit.arms.plusLeak.leakFractionAtBandTop > fit.arms.plusLeak.relativeResidual,
      armen: { tweede_orde: bare, plus_lek: leak },
      grondwaarheid_n: gt,
      n_afwijking_pct: { tweede_orde: dev(bare.n), plus_lek: dev(leak.n) },
      R_e_verschil_ohm: Math.abs(leak.R_e_ohm - bare.R_e_ohm),
      aanvaard: fit.accepted,
      weigering: fit.refusal,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Casus 1 — both measurement sets, so the finding cannot be an artefact
 * of the merge (M-1)
 * ------------------------------------------------------------------ */

const g1 = loadGolden();
function casus1Rows(set: Casus1MeasurementSet): Row[] {
  const manifest = casus1Manifest(g1, set);
  const files = casus1Files(manifest);
  const report = buildReport({
    manifest,
    files,
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
  return rowsOf(`casus 1 (${set})`, report, {});
}

/* Casus 1b — casus 1's mid and tweeter as a two-way. Same files, a second
 * reader: if the choice moved between the two, it would be a property of the
 * project and not of the sweep. */
const g1b = loadGolden1b();
const m1b = casus1bManifest(g1b);
const casus1bReportRows = rowsOf(
  'casus 1b',
  buildReport({
    manifest: m1b,
    files: casus1bFiles(m1b),
    filter: null,
    geometry: casus1bGeometry(g1b),
    settings: CASUS1B_REPORT_SETTINGS,
  }),
  {},
);

/* Casus 2 — the only one with an answer. */
const g2 = loadGolden2();
const truth2 = casus2Truth(g2);
const truthN: Record<string, number> = {};
for (const [way, d] of Object.entries(truth2.drivers)) {
  const n = (d as Record<string, unknown>).semi_inductantie_n;
  if (typeof n === 'number') truthN[way] = n;
}
const m2 = casus2Manifest(g2);
const casus2Rows = rowsOf(
  'casus 2',
  buildReport({
    manifest: m2,
    files: casus2Files(m2),
    filter: null,
    geometry: casus2Geometry(g2),
    settings: CASUS2_REPORT_SETTINGS,
  }),
  truthN,
);

const rows = [
  ...casus1Rows('merged'),
  ...casus1Rows('gated'),
  ...casus1bReportRows,
  ...casus2Rows,
];

/* ------------------------------------------------------------------ *
 * Print
 * ------------------------------------------------------------------ */

console.log('\nB-1 — THE TWO MODELS, ON EVERY SWEEP IN THE BOOK\n');
console.log('  (a) second order            Z = R_e + Σ branches');
console.log('  (b) second order + leak     Z = R_e + K·(jω)^n + Σ branches\n');
console.log(
  'The leak term is KEPT everywhere; casus 2 is what settles that (its (b) R_e is the model',
);
console.log(
  "input, its (a) R_e is 0.08-0.23 Ω off). What the sweep DOES decide is whether the term's",
);
console.log('exponent is a measurement — the fit\'s own band test, column "n id?".\n');

const H = [
  'casus',
  'weg',
  'band Hz',
  'gekozen',
  'lek@top',
  'residu(b)',
  'residu(a)',
  'ratio',
  'R_e (a)',
  'R_e (b)',
  'ΔR_e Ω',
  'n (b)',
  'n id?',
  'n spread',
  'n GT',
  'Δn (b)',
];
console.log(H.join(' | '));
console.log(H.map((h) => '-'.repeat(h.length)).join('-|-'));
for (const r of rows) {
  console.log(
    [
      r.casus,
      r.weg,
      `${r.band_hz[0].toFixed(1)}–${r.band_hz[1].toFixed(1)}`,
      r.gekozen === 'second-order' ? '(a) 2e orde' : '(b) +lek',
      pct(r.armen.plus_lek.lek_fractie_bandtop),
      pct(r.armen.plus_lek.residu),
      pct(r.armen.tweede_orde.residu),
      r.residu_verhouding.toFixed(3),
      num(r.armen.tweede_orde.R_e_ohm, 4),
      num(r.armen.plus_lek.R_e_ohm, 4),
      r.R_e_verschil_ohm.toFixed(4),
      num(r.armen.plus_lek.n, 4),
      r.exponent_geidentificeerd ? 'yes' : 'NO',
      `${r.exponent_bandspreiding_pct.toFixed(1)} %`,
      r.grondwaarheid_n === null ? '—' : r.grondwaarheid_n.toFixed(2),
      r.n_afwijking_pct.plus_lek === null ? '—' : `${r.n_afwijking_pct.plus_lek.toFixed(2)} %`,
    ].join(' | '),
  );
}

console.log('\nTHE FUNDAMENTAL BRANCH — what the model choice does to f and Q\n');
const H2 = ['casus', 'weg', 'f (a) Hz', 'f (b) Hz', 'Δf %', 'Q (a)', 'Q (b)', 'ΔQ %'];
console.log(H2.join(' | '));
console.log(H2.map((h) => '-'.repeat(h.length)).join('-|-'));
for (const r of rows) {
  const a = r.armen.tweede_orde;
  const b = r.armen.plus_lek;
  const rel = (x: number | null, y: number | null): string =>
    x === null || y === null || y === 0 ? '—' : `${(((x - y) / y) * 100).toFixed(3)} %`;
  console.log(
    [
      r.casus,
      r.weg,
      num(a.fundamenteel_hz, 3),
      num(b.fundamenteel_hz, 3),
      rel(a.fundamenteel_hz, b.fundamenteel_hz),
      num(a.fundamenteel_Q, 4),
      num(b.fundamenteel_Q, 4),
      rel(a.fundamenteel_Q, b.fundamenteel_Q),
    ].join(' | '),
  );
}

console.log('\nTHE REASON PER SWEEP\n');
for (const r of rows) {
  console.log(`  ${r.casus} / ${r.weg}: ${r.reden}`);
  console.log(`      EXPONENT — ${r.exponent_reden}`);
  if (!r.aanvaard) console.log(`      REFUSED — ${r.weigering}`);
}

/* ------------------------------------------------------------------ *
 * STEP 4 — WHAT THE MODEL CHOICE COSTS DOWNSTREAM
 *
 * The fit has exactly ONE behavioural output: R_e. (Its branches are reported;
 * M-C reads Small's Q_ms off the MEASURED curve, not off the fit.) But R_e is
 * not an inert number — Small's half-power level is √(Z_max·R_e), so the model
 * choice reaches Q_ms, then x/V, then the M-C ceiling, then the M-C gate and
 * the A5d.3(ii) drive floor of the crossover windows. This section measures
 * that chain by feeding each arm's R_e in as the reading, per way.
 *
 * On every sweep in the book the leak model is CHOSEN, so this table is a
 * counterfactual: what the second-order arm would have cost. It is the price
 * list a future sweep that does choose (a) will be read against.
 * ------------------------------------------------------------------ */

interface DownstreamRow {
  casus: string;
  weg: string;
  R_e_b_ohm: number;
  R_e_a_ohm: number;
  Q_ms_b: number | null;
  Q_ms_a: number | null;
  Q_ms_verschil_pct: number | null;
  xV_b: number | null;
  xV_a: number | null;
  plafond_b_dB: number | null;
  plafond_a_dB: number | null;
  plafond_verschil_dB: number | null;
  venstervloer_b_hz: number | null;
  venstervloer_a_hz: number | null;
  venstervloer_regel: string | null;
}

function downstream(
  casus: string,
  build: (reOhmByDriver: Record<string, number>) => EngineV2Report,
  armRows: Row[],
): DownstreamRow[] {
  const byWayB: Record<string, number> = {};
  const byWayA: Record<string, number> = {};
  for (const r of armRows) {
    byWayB[r.weg] = r.armen.plus_lek.R_e_ohm;
    byWayA[r.weg] = r.armen.tweede_orde.R_e_ohm;
  }
  const rb = build(byWayB);
  const ra = build(byWayA);
  const out: DownstreamRow[] = [];
  for (const r of armRows) {
    const way = r.weg;
    const exB = rb.metrics.driveExcursion?.find((x) => x.driver === way) ?? null;
    const exA = ra.metrics.driveExcursion?.find((x) => x.driver === way) ?? null;
    /* The window whose FLOOR this way sets: the pair whose UPPER way it is —
     * A5d.3(ii) reads the upper driver's resonance and its M-C ceiling. */
    const winB = rb.predesign?.windows?.find((w: XoWindowResult) => w.upper === way) ?? null;
    const winA = ra.predesign?.windows?.find((w: XoWindowResult) => w.upper === way) ?? null;
    const qb = exB?.electromechanical?.qms ?? null;
    const qa = exA?.electromechanical?.qms ?? null;
    out.push({
      casus,
      weg: way,
      R_e_b_ohm: byWayB[way],
      R_e_a_ohm: byWayA[way],
      Q_ms_b: qb,
      Q_ms_a: qa,
      Q_ms_verschil_pct: qb !== null && qa !== null && qb !== 0 ? ((qa - qb) / qb) * 100 : null,
      xV_b: exB?.xPerVoltMmPerV ?? null,
      xV_a: exA?.xPerVoltMmPerV ?? null,
      plafond_b_dB: exB?.ceiling.ceilingDbReInput ?? null,
      plafond_a_dB: exA?.ceiling.ceilingDbReInput ?? null,
      plafond_verschil_dB:
        exB && exA ? exA.ceiling.ceilingDbReInput - exB.ceiling.ceilingDbReInput : null,
      venstervloer_b_hz: winB?.floorHz ?? null,
      venstervloer_a_hz: winA?.floorHz ?? null,
      venstervloer_regel: winB?.floorBy?.rule ?? null,
    });
  }
  return out;
}

const c1Manifest = casus1Manifest(g1);
const c1Files = casus1Files(c1Manifest);
const C1_ORDER = 4; // casus 1 states order 4 on both handovers (manifest, A5d.3)
const c1Base = {
  orderByPair: {
    [ctcKey('woofer', 'mid')]: C1_ORDER,
    [ctcKey('mid', 'tweeter')]: C1_ORDER,
  },
  targetCurve: casus1TargetCurve(g1),
  ...casus1ExcursionSettings(g1),
  ...(Object.keys(casus1MaxDriveOnFsDbByDriver(g1)).length > 0
    ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(g1) }
    : {}),
};
const down1 = downstream(
  'casus 1',
  (reOhmByDriver) =>
    buildReport({
      manifest: c1Manifest,
      files: c1Files,
      filter: null,
      geometry: casus1Geometry(g1),
      settings: { ...c1Base, reOhmByDriver },
    }),
  rows.filter((r) => r.casus === 'casus 1 (merged)'),
);
const down2 = downstream(
  'casus 2',
  (reOhmByDriver) =>
    buildReport({
      manifest: m2,
      files: casus2Files(m2),
      filter: null,
      geometry: casus2Geometry(g2),
      settings: { ...CASUS2_REPORT_SETTINGS, reOhmByDriver },
    }),
  rows.filter((r) => r.casus === 'casus 2'),
);
const downRows = [...down1, ...down2];

/* ------------------------------------------------------------------ *
 * THE OTHER ESTIMATOR OF THE SAME EXPONENT — casus 2 finding B1
 *
 * `z-semi-inductance` fits |Z − R_e| = K·ω^n on log-log a DECADE above the
 * highest motional resonance, and on casus 2 it reads +12.6 / +9.6 / +44.2 %
 * away from the value the model was built with. The casebook's stated cause
 * for that is that the fit does not subtract R_e; the source does subtract it
 * (`Math.hypot(re - reOhm, im)`), so that cause is wrong and this measures the
 * real one: what ELSE is inside |Z − R_e| in that band.
 *
 * A resonance branch does not stop at its skirt. One decade above f_s a
 * Q = 1.6 branch still contributes a REACTANCE of the opposite sign to the
 * coil's, and a contribution that shrinks faster than the coil grows tilts the
 * log-log slope UPWARD — which is the direction and roughly the size of every
 * deviation the casebook records.
 * ------------------------------------------------------------------ */

interface HfRow {
  casus: string;
  weg: string;
  band_hz: [number, number];
  geldig: boolean;
  n_hf: number;
  n_motioneel: number | null;
  grondwaarheid_n: number | null;
  /** At the BOTTOM of the HF band, where the tail is biggest. */
  lek_ohm: number;
  motionele_staart_ohm: number;
  staart_fractie: number;
  /** The same at the top of the band, so the reader sees it shrink. */
  lek_ohm_top: number;
  motionele_staart_ohm_top: number;
  staart_fractie_top: number;
}

function hfRows(casus: string, report: EngineV2Report, truthN: Record<string, number>): HfRow[] {
  const out: HfRow[] = [];
  for (const d of report.ingest.drivers) {
    const si = d.semiInductance;
    const fit = d.re?.fit;
    if (!si || !fit) continue;
    const at = (fHz: number): { lek: number; staart: number } => {
      const lek = leakImpedanceAt(fit.arms.plusLeak.coefficientK, fit.arms.plusLeak.exponentN, fHz).mag;
      const m = motionalImpedanceAt(fit.arms.plusLeak.branches, fHz);
      return { lek, staart: Math.hypot(m.re, m.im) };
    };
    const lo = at(si.fitBandHz[0]);
    const hi = at(si.fitBandHz[1]);
    out.push({
      casus,
      weg: d.driver,
      band_hz: si.fitBandHz,
      geldig: si.valid,
      n_hf: si.n,
      n_motioneel: fit.exponentN,
      grondwaarheid_n: truthN[d.driver] ?? null,
      lek_ohm: lo.lek,
      motionele_staart_ohm: lo.staart,
      staart_fractie: lo.lek > 0 ? lo.staart / lo.lek : 0,
      lek_ohm_top: hi.lek,
      motionele_staart_ohm_top: hi.staart,
      staart_fractie_top: hi.lek > 0 ? hi.staart / hi.lek : 0,
    });
  }
  return out;
}

const hf = [
  ...hfRows('casus 1', buildReport({
    manifest: c1Manifest,
    files: c1Files,
    filter: null,
    geometry: casus1Geometry(g1),
    settings: c1Base,
  }), {}),
  ...hfRows('casus 2', buildReport({
    manifest: m2,
    files: casus2Files(m2),
    filter: null,
    geometry: casus2Geometry(g2),
    settings: CASUS2_REPORT_SETTINGS,
  }), truthN),
];

console.log('\nTHE HF EXPONENT — what else is inside |Z − R_e| in its fit band (casus 2 B1)\n');
const H4 = [
  'casus',
  'weg',
  'HF-band Hz',
  'geldig',
  'n HF',
  'n motioneel',
  'n GT',
  'lek Ω @lo',
  'staart Ω @lo',
  'staart/lek @lo',
  'staart/lek @hi',
];
console.log(H4.join(' | '));
console.log(H4.map((h) => '-'.repeat(h.length)).join('-|-'));
for (const r of hf) {
  console.log(
    [
      r.casus,
      r.weg,
      `${r.band_hz[0].toFixed(0)}–${r.band_hz[1].toFixed(0)}`,
      r.geldig ? 'yes' : 'NO',
      r.n_hf.toFixed(4),
      num(r.n_motioneel, 4),
      r.grondwaarheid_n === null ? '—' : r.grondwaarheid_n.toFixed(2),
      r.lek_ohm.toFixed(4),
      r.motionele_staart_ohm.toFixed(4),
      pct(r.staart_fractie, 2),
      pct(r.staart_fractie_top, 2),
    ].join(' | '),
  );
}

console.log('\nSTEP 4 — WHAT MODEL (a) WOULD COST DOWNSTREAM (counterfactual)\n');
const H3 = [
  'casus',
  'weg',
  'R_e (b)',
  'R_e (a)',
  'Q_ms (b)',
  'Q_ms (a)',
  'ΔQ_ms',
  'x/V (b)',
  'x/V (a)',
  'plafond (b)',
  'plafond (a)',
  'Δplafond',
  'vloer (b)',
  'vloer (a)',
  'regel',
];
console.log(H3.join(' | '));
console.log(H3.map((h) => '-'.repeat(h.length)).join('-|-'));
for (const r of downRows) {
  console.log(
    [
      r.casus,
      r.weg,
      r.R_e_b_ohm.toFixed(4),
      r.R_e_a_ohm.toFixed(4),
      num(r.Q_ms_b, 4),
      num(r.Q_ms_a, 4),
      r.Q_ms_verschil_pct === null ? '—' : `${r.Q_ms_verschil_pct.toFixed(2)} %`,
      num(r.xV_b, 5),
      num(r.xV_a, 5),
      num(r.plafond_b_dB, 3),
      num(r.plafond_a_dB, 3),
      r.plafond_verschil_dB === null ? '—' : `${r.plafond_verschil_dB.toFixed(3)} dB`,
      num(r.venstervloer_b_hz, 1),
      num(r.venstervloer_a_hz, 1),
      r.venstervloer_regel ?? '—',
    ].join(' | '),
  );
}

const out = join(CASUS1_DIR, '..', 'casus1_b1_modelkeuze.json');
writeFileSync(
  out,
  `${JSON.stringify(
    {
      _:
        'B-1 — de twee impedantiemodellen per sweep, geschreven door ' +
        'scripts/measure-b1-motional-model.ts. Beide armen staan er altijd in; de lekterm wordt op ' +
        'élke sweep GEHOUDEN en casus 2 is wat dat vaststelt (haar lek-arm levert de model-R_e ' +
        'terug, haar kale arm zit er 0,08–0,23 Ω naast tegen een klasse van 0,03 Ω).',
      geen_modelkiezer:
        'Model (b) NEST model (a), dus de residuverhouding is nooit onder 1 en zou de term altijd ' +
        'houden; en de lekterm ABSORBEERT wat de takken niet verklaren, dus zijn eigen grootte is ' +
        'even misleidend — gemeten op een sweep met één ongeseede mode: een spoel van 0,10 % van ' +
        '|Z| gefit op 8,95 %, 93× te groot, met een residuverhouding van 1,434. Beide getallen ' +
        'staan er wél in, want ze zien is hoe een lezer dit narekent.',
      exponent_criterium:
        'De EXPONENT wordt alleen gepubliceerd als hij niet van de fitband afhangt: de spreiding ' +
        'van n over de vergelijkingsbanden, tegen dezelfde limiet die deze fit al voor R_e ' +
        'publiceert. Geen nieuwe constante en geen extra solve. De grondwaarheid van casus 2 geeft ' +
        'die toets gelijk op alle drie haar wegen.',
      rijen: rows,
      hf_exponent: {
        _:
          'De TWEEDE schatter van dezelfde exponent (z-semi-inductance, casus 2 B1). Wat er naast ' +
          'de spoel in |Z − R_e| zit binnen zijn fitband: de motionele staart, die met de frequentie ' +
          'sneller krimpt dan de spoel groeit en de log-log-helling dus omhoog kantelt. Gemeten, ' +
          'NIET gerepareerd — de exponent bereikt geen poort, grens, venster of metriek.',
        rijen: hf,
      },
      stroomafwaarts: {
        _:
          'STAP 4 — wat model (a) downstream zou kosten. De fit heeft één gedragsuitvoer: R_e. ' +
          'Small leest het halfvermogensniveau op √(Z_max·R_e), dus de modelkeuze bereikt Q_ms, ' +
          'x/V, het M-C-plafond en de A5d.3(ii)-aandrijfvloer van het kruisvenster. Gemeten door ' +
          'de R_e van elke arm als lezing in te voeren.',
        rijen: downRows,
      },
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwritten: ${out}\n`);
