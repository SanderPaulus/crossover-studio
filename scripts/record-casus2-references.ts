/**
 * CASUS 2 — DE REFERENTIES SCHRIJVEN: GRONDWAARHEID NAAST EXTRACTIE.
 *
 * `npx vite-node scripts/record-casus2-references.ts` — seconden, geen tune.
 *
 * WAT DIT ANDERS DOET DAN DE RECORDERS VAN CASUS 1 EN 1b. Daar is een
 * klasse-A-referentie een GEMETEN getal dat vastgelegd wordt zodat een latere
 * engine ernaast kan meten. Hier is er een derde kolom: het getal dat het MODEL
 * kende voordat er iets gemeten werd. Elke klasse-A-rij die een grondwaarheid
 * HEEFT draagt haar naast de extractie, met het verschil en de tolerantieklasse
 * waarin dat verschil valt — dus "de extractor vindt de invoer terug" is een
 * assert en geen bewering, en een extractor die ernaast zit zegt dat zelf.
 *
 * DE AFWIJKINGEN WORDEN NIET GEREPAREERD. Stap 4 van `casus-toevoegen`: een
 * afwijking is een BEVINDING met een nummer in het casusboek, en pas daarna
 * eventueel een reparatie. Dit script schrijft ze op (`bevindingen`) en oordeelt
 * niet; `goldenCasus2.test.ts` pint ze zodat zij niet stil kunnen verdwijnen of
 * groeien.
 *
 * Schrijft `afgeleide_parameters`, `verankerde_gaps_dB`, `kruisvensters` en —
 * als er netlists op schijf staan — `kandidaten` in
 * `test-fixtures/casus2/golden_refs_casus2.json`. Draai hem ná de generator.
 */

import { readdirSync, writeFileSync } from 'node:fs';
import {
  CASUS2_DIR,
  CASUS2_REPORT_SETTINGS,
  CASUS2_STATED_ORDER,
  GOLDEN2_PATH,
  casus2Files,
  casus2Manifest,
  casus2Report,
  casus2Truth,
  loadGolden2,
  type GoldenRefs2,
} from '../src/lib/engine2/casus2.fixture.ts';
import type { EngineV2Report } from '../src/lib/engine2/report.ts';
import {
  RE_FIT_BAND_MULTIPLE_OF_FUNDAMENTAL,
  RE_FIT_SENSITIVITY_BAND_MULTIPLES,
} from '../src/lib/engine2/constants.ts';

const goldenOnDisk = loadGolden2();

/* The ground truth, and the project input derived from it — refreshed by
 * `sync-casus2-project-input.ts`, which runs BEFORE this script. */
const golden = goldenOnDisk;
const truth = casus2Truth(golden);
const manifest = casus2Manifest(golden);
const files = casus2Files(manifest);

/* ------------------------------------------------------------------ *
 * The comparison: one row per quantity that HAS a ground truth
 * ------------------------------------------------------------------ */

type ToleranceClass = 'frequenties_pct' | 'ohm' | 'Q_pct' | 'exponent_pct' | 'dB';

interface Row {
  grootheid: string;
  weg: string;
  /**
   * `acceptatie` — the extractor and the model answer the SAME question, so a
   * difference outside the tolerance is a finding about the extractor.
   * `controle` — they answer two different questions on purpose (a second
   * estimator of the same quantity, a peak height that also carries the voice
   * coil, an approximation the engine itself flags). Recorded, never asserted.
   */
  soort: 'acceptatie' | 'controle';
  grondwaarheid: number;
  extractie: number;
  schatter: string;
  eenheid: string;
  klasse: ToleranceClass;
  /** Absolute for `ohm` and `dB`, relative (%) for the rest. */
  verschil: number;
  toegestaan: number;
  binnen: boolean;
}

const T = golden.toleranties as unknown as Record<string, number>;
const ALLOWED: Record<ToleranceClass, number> = {
  frequenties_pct: T.frequenties_pct,
  ohm: T.ohm,
  Q_pct: T.Q_pct,
  exponent_pct: T.exponent_pct,
  dB: T.dB,
};
const ABSOLUTE: ReadonlySet<ToleranceClass> = new Set<ToleranceClass>(['ohm', 'dB']);

/**
 * B-1 — AN EXTRACTOR THAT DECLINES TO ANSWER.
 *
 * A row whose ground truth exists but whose extractor abstained is neither
 * inside nor outside a tolerance: there is nothing to compare. Dropping it
 * would make the table shorter and quieter, which is the one thing this file
 * must not do — the abstention IS the result, and it has to be as visible as
 * a deviation was. So it gets its own list, with the reason the estimator
 * gave, in the estimator's own words.
 */
interface Abstention {
  grootheid: string;
  weg: string;
  grondwaarheid: number;
  schatter: string;
  eenheid: string;
  reden: string;
}
const onthoudingen: Abstention[] = [];
function abstain(
  grootheid: string,
  weg: string,
  grondwaarheid: number,
  schatter: string,
  eenheid: string,
  reden: string,
): void {
  onthoudingen.push({
    grootheid,
    weg,
    grondwaarheid: Number(grondwaarheid.toPrecision(9)),
    schatter,
    eenheid,
    reden,
  });
}

const rows: Row[] = [];
function compare(
  grootheid: string,
  weg: string,
  grondwaarheid: number,
  extractie: number,
  schatter: string,
  eenheid: string,
  klasse: ToleranceClass,
  soort: 'acceptatie' | 'controle' = 'acceptatie',
): void {
  const abs = ABSOLUTE.has(klasse);
  const verschil = abs ? extractie - grondwaarheid : (extractie / grondwaarheid - 1) * 100;
  rows.push({
    grootheid,
    weg,
    soort,
    grondwaarheid: Number(grondwaarheid.toPrecision(9)),
    extractie: Number(extractie.toPrecision(9)),
    schatter,
    eenheid,
    klasse,
    verschil: Number(verschil.toPrecision(4)),
    toegestaan: ALLOWED[klasse],
    binnen: Math.abs(verschil) <= ALLOWED[klasse],
  });
}

const report: EngineV2Report = casus2Report(null);
const perDriver: Record<string, Record<string, unknown>> = {};

for (const d of report.ingest.drivers) {
  const gt = truth.drivers[d.driver] as Record<string, unknown>;
  const box = gt.kast as Record<string, unknown>;
  const imp = d.impedance;
  const re = d.re;
  const fit = re?.fit ?? null;
  /* The model's own motional resistance R_es = Bl²/R_ms: the height of the
   * motional branch, without R_e and without the voice-coil inductance. It is
   * what the FIT reports per branch, so it is the honest counterpart. */
  const Bl = gt.Bl_Tm as number;
  const Rms = gt.R_ms_Ns_per_m as number;
  const ResTruth = (Bl * Bl) / Rms;

  /* ---- R_e: the fit, and the direct reading beside it ---------------- */
  if (re) {
    compare('R_e', d.driver, gt.R_e_ohm as number, re.ohm, `A5c.1 hierarchy → ${re.source}`, 'Ω', 'ohm');
    if (re.directOhm !== undefined) {
      /* CONTROL: the direct reading is a DIFFERENT estimator, and casus S1
       * established that it reads the motional skirt as resistance. On this
       * casus the model says by how much. */
      compare('R_e (directe aflezing)', d.driver, gt.R_e_ohm as number, re.directOhm, 'z-re direct low-frequency median', 'Ω', 'ohm', 'controle');
    }
  }

  /* ---- the resonance, per box kind ----------------------------------- */
  if (box.soort === 'gesloten') {
    compare('f_c', d.driver, box.f_c_hz as number, imp!.fundamentalHz!, 'z-resonance peak', 'Hz', 'frequenties_pct');
    compare('Q_mc', d.driver, box.Q_mc as number, imp!.sealed!.qmc ?? NaN, "z-resonance Small's Q on the sealed fundamental", '—', 'Q_pct');
    compare('Q_ec', d.driver, box.Q_ec as number, imp!.sealed!.qec ?? NaN, 'z-resonance', '—', 'Q_pct');
    if (fit?.branches?.[0]) {
      compare('f_c (motionele fit)', d.driver, box.f_c_hz as number, fit.branches[0].fHz, 'z-re motional fit branch', 'Hz', 'frequenties_pct');
      compare('Q_mc (motionele fit)', d.driver, box.Q_mc as number, fit.branches[0].q, 'z-re motional fit branch', '—', 'Q_pct');
      compare('R_es (motionele fit)', d.driver, ResTruth, fit.branches[0].rOhm, 'z-re motional fit branch', 'Ω', 'Q_pct');
    }
  } else if (box.soort === 'reflex') {
    compare('f_b (kastafstemming)', d.driver, box.f_b_hz as number, imp!.reflex!.fbHz, 'z-resonance reflex dip', 'Hz', 'frequenties_pct');
    /* CONTROL: √(f_L·f_H) equals f_b only in a LOSSLESS box, and the engine
     * carries it as its own cross-check (`sqrtCheckError`) rather than as the
     * tuning. The model has Q_l = 7, so the two must differ; how much is what
     * this row records. */
    compare('f_b (√(f_L·f_H)-controle)', d.driver, box.f_b_hz as number, imp!.reflex!.sqrtCheckHz, 'z-resonance √ check', 'Hz', 'frequenties_pct', 'controle');
  } else {
    compare('f_s', d.driver, gt.f_s_hz as number, imp!.fundamentalHz!, 'z-resonance peak', 'Hz', 'frequenties_pct');
    compare('Q_ms', d.driver, gt.Q_ms as number, imp!.sealed!.qmc ?? NaN, "z-resonance Small's Q", '—', 'Q_pct');
    compare('Q_es', d.driver, gt.Q_es as number, imp!.sealed!.qec ?? NaN, 'z-resonance', '—', 'Q_pct');
    if (fit?.branches?.[0]) {
      compare('f_s (motionele fit)', d.driver, gt.f_s_hz as number, fit.branches[0].fHz, 'z-re motional fit branch', 'Hz', 'frequenties_pct');
      compare('Q_ms (motionele fit)', d.driver, gt.Q_ms as number, fit.branches[0].q, 'z-re motional fit branch', '—', 'Q_pct');
      compare('R_es (motionele fit)', d.driver, ResTruth, fit.branches[0].rOhm, 'z-re motional fit branch', 'Ω', 'Q_pct');
    }
  }
  /* Z_max: the model's own peak height, WITHOUT the voice-coil inductance the
   * crest also carries. Recorded as a comparison rather than hidden, because
   * the bias it shows is a real property of reading a peak off a sweep. */
  const res = gt.excursie_op_impedantiepiek as Record<string, number>;
  const zPeak = imp?.peaks?.find((p) => Math.abs(p.fHz - (imp.fundamentalHz ?? 0)) < 1e-6);
  if (zPeak) {
    /* The model's own |Z| maximum, found on the same circuit — so this row is
     * an ACCEPTANCE: both sides are the crest of the same curve, coil and all.
     * The free-air `Z_max_zonder_spoel_ohm` is a different quantity and is
     * recorded per driver rather than compared. */
    compare('Z_max op de kruin', d.driver, res.Z_max_ohm, zPeak.ohm, 'z-resonance peak height', 'Ω', 'Q_pct');
    compare('f van de |Z|-kruin', d.driver, res.f0_hz, zPeak.fHz, 'z-resonance peak', 'Hz', 'frequenties_pct');
  }

  /* ---- the semi-inductance exponent, from BOTH estimators ------------- */
  if (d.semiInductance) {
    compare('semi-inductantie n (HF-fit)', d.driver, gt.semi_inductantie_n as number, d.semiInductance.n, 'z-semi-inductance', '—', 'exponent_pct');
  }
  if (fit) {
    /* B-1 — the fit publishes this exponent only where the sweep can identify
     * one. Where it cannot, the row is an ABSTENTION and not a deviation: the
     * estimator declined, and that is the answer. */
    if (fit.exponentN !== null) {
      compare('semi-inductantie n (motionele fit)', d.driver, gt.semi_inductantie_n as number, fit.exponentN, 'z-re motional fit', '—', 'exponent_pct');
    } else {
      abstain('semi-inductantie n (motionele fit)', d.driver, gt.semi_inductantie_n as number, 'z-re motional fit', '—', fit.exponent.reason);
    }
  }

  /* ---- breakups: each stated resonance against its nearest peak -------- */
  const found = d.breakups?.peaks ?? [];
  for (const b of gt.breakups as { hz: number; hoogte_dB: number; Q: number }[]) {
    const near = found.reduce<{ fHz: number; dB: number } | null>(
      (best, p) => (best === null || Math.abs(p.fHz - b.hz) < Math.abs(best.fHz - b.hz) ? p : best),
      null,
    );
    if (near) compare(`breakup ${b.hz} Hz`, d.driver, b.hz, near.fHz, 'spl-breakup', 'Hz', 'frequenties_pct');
  }

  /* ---- the near-field ceiling: Keele on the stated diameter ----------- */
  if (d.nearFieldCeilingHz !== null && d.nearFieldCeilingHz !== undefined) {
    compare('NF-plafond (Keele)', d.driver, 4311 / (gt.diameter_inch as number), d.nearFieldCeilingHz, 'validity-nearfield', 'Hz', 'frequenties_pct');
  }

  /* ---- the excursion derivation --------------------------------------- */
  const ex = report.metrics.driveExcursion?.find((x) => x.driver === d.driver);
  if (ex?.electromechanical) {
    /* The model's x/V at ITS OWN resonance; the extractor reads it at the
     * resonance it FOUND, so the two agree only as far as that frequency does
     * — which is exactly what the frequency rows above say. */
    compare('x/V op de resonantie', d.driver, res.x_per_V_mm_per_V, ex.electromechanical.xPerVoltMmPerV, 'drive-excursion route 1 (electromechanical)', 'mm/V', 'Q_pct');
  }

  perDriver[d.driver] = {
    klasse: 'A',
    afhankelijkheid: 'meting',
    R_e_ohm: re?.ohm ?? null,
    R_e_bron: re?.source ?? null,
    R_e_direct_ohm: re?.directOhm ?? null,
    R_e_grondwaarheid_ohm: gt.R_e_ohm,
    impedantie_soort: imp?.type ?? null,
    fundamenteel_hz: imp?.fundamentalHz ?? null,
    reflex: imp?.reflex ?? null,
    gesloten: imp?.sealed ?? null,
    motionele_fit: fit
      ? {
          R_e: fit.reOhm,
          n: fit.exponentN,
          k: fit.coefficientK,
          band_hz: fit.bandHz,
          residu: fit.relativeResidual,
          takken: fit.branches,
          /* B-1 (V15) — the model this fit ran on, and the arm it did not
           * publish. A reference that does not say which model produced it
           * cannot be re-measured against a later engine. */
          model: fit.model,
          model_reden: fit.modelReason,
          residu_verhouding: fit.residualRatio,
          arm_tweede_orde: {
            R_e: fit.arms.secondOrder.reOhm,
            residu: fit.arms.secondOrder.relativeResidual,
          },
          exponent_geidentificeerd: fit.exponent.identified,
          exponent_op_primaire_band: fit.exponent.onPrimaryBand,
          exponent_bandspreiding_fractie: fit.exponent.bandSpreadFraction,
          exponent_banden: fit.exponent.samples,
          exponent_reden: fit.exponent.reason,
        }
      : null,
    semi_inductantie_n: d.semiInductance?.n ?? null,
    semi_inductantie_band_hz: d.semiInductance?.fitBandHz ?? null,
    semi_inductantie_n_grondwaarheid: gt.semi_inductantie_n,
    breakups: (d.breakups?.peaks ?? []).map((p) => [Number(p.fHz.toFixed(1)), Number(p.dB.toFixed(2))]),
    breakups_grondwaarheid: gt.breakups,
    breakups_opmerking:
      'De dB-kolom van de extractor is de hoogte boven de TREND, de dB-kolom van de grondwaarheid de piekwinst van de ' +
      'resonantie zelf. Twee grootheden; alleen de FREQUENTIES worden vergeleken.',
    NF_plafond_hz: d.nearFieldCeilingHz ?? null,
    directiviteit_min6_30gr_hz: d.directivity?.[0]?.minus6Hz ?? null,
    baffle_step_fit_hz: d.baffleStep?.f0Hz ?? null,
    baffle_step_fit_diepte_dB: d.baffleStep?.depthDb ?? null,
    baffle_step_grondwaarheid_hz: truth.geometrie.baffle_step_hz,
    baffle_step_grondwaarheid_diepte_dB: truth.geometrie.baffle_step_diepte_dB,
    bandgemiddeld_niveau_dB: d.level?.db ?? null,
    gevoeligheid_grondwaarheid_dB: gt.gevoeligheid_dB_1m_2V83,
    niveau_opmerking:
      'Het bandgemiddelde niveau is een energiegemiddelde over de BEOORDEELDE band en de gevoeligheid is het ' +
      'doorlaatbandplateau van het model. Twee grootheden, geen acceptatie: de eerste draagt de eigen afval van de ' +
      'driver en de baffle-step, de tweede niet.',
    geldigheid_ver_veld_hz: d.onAxis?.bandHz ?? null,
    geldigheid_bron: d.onAxis?.bandFloorProvenance ?? null,
    fijnstructuur_vanaf_hz: d.onAxis?.fineDetailFromHz ?? null,
    excursie: ex
      ? {
          f0_hz: ex.f0Hz,
          x_per_V_mm_per_V: ex.electromechanical?.xPerVoltMmPerV ?? null,
          x_per_V_grondwaarheid_mm_per_V: res.x_per_V_mm_per_V,
          f0_grondwaarheid_hz: res.f0_hz,
          plafond_re_ingang_dB: ex.ceiling?.ceilingDbReInput ?? null,
          route2_x_per_V_mm_per_V: ex.acoustic && 'xPerVoltMmPerV' in ex.acoustic ? ex.acoustic.xPerVoltMmPerV : null,
          route2_verhouding: ex.acoustic && 'ratioToElectromechanical' in ex.acoustic ? ex.acoustic.ratioToElectromechanical : null,
          route2_uit: ex.acoustic && 'off' in ex.acoustic ? ex.acoustic.off : null,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ *
 * The gate: the chosen window time, exactly
 * ------------------------------------------------------------------ */
const gateRow = report.ingest.drivers[0].onAxis!;
compare('geldigheidsvloer 1/T', 'alle ver-velden', truth.poort.geldigheidsvloer_hz, gateRow.bandHz[0], 'validity-header', 'Hz', 'frequenties_pct');
compare('fijnstructuur 2/T', 'alle ver-velden', truth.poort.fijnstructuur_hz, gateRow.fineDetailFromHz ?? NaN, 'validity-header', 'Hz', 'frequenties_pct');

/* ------------------------------------------------------------------ *
 * The windows, and what the model says their edges should be
 * ------------------------------------------------------------------ */
const windows = report.predesign.windows;
const wm = windows.find((w) => w.lower === 'woofer' && w.upper === 'mid')!;
const mt = windows.find((w) => w.lower === 'mid' && w.upper === 'tweeter')!;
const kruisvensters: Record<string, unknown> = {
  parameters: {
    klasse: 'A',
    afhankelijkheid: 'meting',
    orde: CASUS2_STATED_ORDER,
    _: 'De orde is GESTELD (A5d.3 verkiest symmetrische LR-flanken); de vensters worden per orde opnieuw afgeleid.',
  },
  woofer_mid_orde4: {
    klasse: 'A',
    afhankelijkheid: 'meting',
    venster: [wm.floorHz ?? null, wm.ceilingHz ?? null],
    vloer_bindend: wm.floorBy?.rule ?? null,
    plafond_bindend: wm.ceilingBy?.rule ?? null,
    grenzen: wm.limits.map((l) => ({ kant: l.side, regel: l.rule, hz: l.hz })),
  },
  mid_tweeter_orde4: {
    klasse: 'A',
    afhankelijkheid: 'meting',
    venster: [mt.floorHz ?? null, mt.ceilingHz ?? null],
    vloer_bindend: mt.floorBy?.rule ?? null,
    plafond_bindend: mt.ceilingBy?.rule ?? null,
    grenzen: mt.limits.map((l) => ({ kant: l.side, regel: l.rule, hz: l.hz })),
  },
};

/* ------------------------------------------------------------------ *
 * The anchor and the gaps
 * ------------------------------------------------------------------ */
const gaps = report.predesign.gaps;
const verankerde_gaps_dB: Record<string, unknown> = {
  klasse: 'A',
  afhankelijkheid: 'meting',
  anker: gaps?.anchor ?? null,
  anker_reden: gaps?.anchorReason ?? null,
  per_weg: (gaps?.ways ?? []).map((w) => ({ weg: w.driver, gap_dB: w.gapToAnchorDb, budget_dB: w.budgetDb })),
  anker_grondwaarheid:
    'De woofer, want het model geeft hem de LAAGSTE gevoeligheid (' +
    Object.entries(truth.drivers)
      .map(([w, d]) => `${w} ${(d.gevoeligheid_dB_1m_2V83 as number).toFixed(2)}`)
      .join(', ') +
    ' dB) en het anker is per definitie de stilste weg.',
  geblokkeerd: report.predesign.gapsBlocked ?? null,
};

/* ------------------------------------------------------------------ *
 * The class-B blocks, when netlists exist
 * ------------------------------------------------------------------ */
/**
 * The manifest's netlist list is SYNCHRONISED WITH THE DIRECTORY, not typed.
 * The shortlist can shrink between regenerations, and a `KAND-V2-*` file left
 * behind under a live name is the orphan hole casus 1 documented (V32); a
 * manifest entry with no file is its mirror. One source — what the generator
 * actually wrote — and the class-B blocks below follow it.
 */
const KAND_FILE = /^KAND-V2-(\d+)\.adsfilter\.json$/;
const netlists: Record<string, string> = Object.fromEntries(
  readdirSync(CASUS2_DIR)
    .map((f) => [f, KAND_FILE.exec(f)] as const)
    .filter((x): x is readonly [string, RegExpExecArray] => x[1] !== null)
    .sort((a, b) => Number(a[1][1]) - Number(b[1][1]))
    /* The capture group, not `match(/\d+/)`: the first run of digits in
     * `KAND-V2-1.adsfilter.json` is the 2 of "V2", so an unanchored match maps
     * every file to the same key and five of the six vanish. Caught by the
     * orphan guard, which is what it is for. */
    .map(([f, m]) => [`KAND_V2_${m[1]}`, f]),
);
golden.manifest_en_geometrie.netlists = netlists;
const kandidaten: Record<string, unknown> = {
  _parameters: {
    klasse: 'A',
    afhankelijkheid: 'meting',
    band_hz: [CASUS2_REPORT_SETTINGS.targetCurve ? 'doelcurve' : 'vlak'],
    _: 'De metrieken hieronder zijn per netlist gemeten met CASUS2_REPORT_SETTINGS — dezelfde instellingen die de generator en de guards spreiden (de V42-regel).',
  },
};
for (const key of Object.keys(netlists)) {
  const r = casus2Report(key, manifest, files, golden);
  const m = r.metrics;
  const lowest = r.driversLowToHigh[0];
  const bump = m.lfBump.find((x) => x.driver === lowest)?.result ?? null;
  const thev = m.thevenin.find((x) => x.driver === lowest) ?? null;
  kandidaten[key] = {
    klasse: 'B',
    afhankelijkheid: 'meting+netlist',
    min_Z_ohm: m.epdr?.minZOhm ?? null,
    min_Z_bij_hz: m.epdr?.minZAtHz ?? null,
    EPDR_min_ohm: m.epdr?.minOhm ?? null,
    dissipatiefractie: m.dissipation?.totalFraction ?? null,
    dissipatie_W: m.dissipation?.totalWatts ?? null,
    lf_bult_dB: bump?.extraDb ?? null,
    lf_opslingering_dB: bump?.resonantDb ?? null,
    lf_lift_dB: bump?.liftDb ?? null,
    Qes_mult: thev?.qMultiplier ?? null,
    fase_M_K: (r.system?.phaseTracking ?? []).map((p) => ({ paar: `${p.lower}->${p.upper}`, graden: p.meanAbsDeg })),
    netlist: r.subject.network,
  };
}

/* ------------------------------------------------------------------ *
 * Write
 * ------------------------------------------------------------------ */
const buiten = rows.filter((r) => !r.binnen);
const buitenAcceptatie = buiten.filter((r) => r.soort === 'acceptatie');
const key = (r: Row) => `${r.grootheid} · ${r.weg}`;

/**
 * THE DEVIATIONS, NAMED — step 4 of `casus-toevoegen`: an extractor that misses
 * its ground truth is a FINDING with a number in the casebook, and only after
 * that, perhaps, a repair. Nothing here is corrected. The set is pinned exactly
 * by `goldenCasus2.test.ts`, so it can neither grow nor shrink in silence.
 */
/**
 * B-1 — WAT DEZE TABEL VROEGER ZEI, EN WAAROM ZIJ HET NIET MEER ZEGT.
 *
 * Een bevinding die verdwijnt omdat zij gerepareerd is, moet net zo zichtbaar
 * zijn als toen zij er stond: anders leest een latere lezer een tabel die
 * altijd al klopte. Deze regels worden nooit herschreven en nooit gewist; er
 * komt er hoogstens één bij.
 */
const ERRATA: { datum: string; sleutel: string; was: string; is: string }[] = [
  {
    datum: '2026-09-09',
    sleutel: 'semi-inductantie n (motionele fit) · woofer',
    was:
      'C-2 (08-09-2026) noteerde deze rij als ACCEPTATIE-bevinding B2: grondwaarheid 0,7, extractie ' +
      '0,594660298, −15,05 % tegen 5 % toegestaan, met als reden dat de fitband (5–177 Hz) de ' +
      'spoelbijdrage tot "enkele honderdsten van een ohm" beperkt en de parameter daar niet ' +
      'identificeerbaar is.',
    is:
      'B-1 (09-09-2026) heeft beide helften nagemeten. De REDEN was onjuist: de spoelbijdrage is op de ' +
      'bandtop 10,3 % van |Z| (0,83 Ω), niet honderdsten — de term is groot genoeg om gezien te worden ' +
      'en wordt ook gekozen. Wat er wél gebeurt is dat een REFLEXKAST een gekoppeld vierde-orde systeem ' +
      'is en dit model een som van onafhankelijke tweede-orde takken: het residu op deze weg is 2,455 % ' +
      'tegen 0,000 % op de twee gesloten wegen, en de exponent absorbeert het verschil. De CONCLUSIE ' +
      'stond en is nu gewapend: de exponent is op deze weg geen meting, en de fit zegt dat sinds ' +
      'z-re 1.2 zelf — zij verschuift 8,9 % over de vergelijkingsbanden tegen een limiet van 6 %, dus ' +
      'zij wordt niet meer gepubliceerd. De rij staat daarom onder `onthoudingen` en niet meer onder ' +
      '`bevindingen`. Het GETAL is niet bewogen: 0,5947 op de primaire band, te lezen in ' +
      '`motionele_fit.exponent_op_primaire_band`.',
  },
];

const BEVINDING_REDEN: Record<string, string> = {
  'semi-inductantie n (HF-fit) · woofer':
    'C-2/B1, HERZIEN BIJ B-1 (09-09-2026) — TWEE SCHATTERS VOOR EEN GROOTHEID, EN DE GRONDWAARHEID ZEGT ' +
    'WELKE. De afwijking staat; de VERKLARING die C-2 erbij schreef is gemeten en onjuist gebleken. Zij ' +
    'zei dat `z-semi-inductance` R_e niet aftrekt — de bron doet dat wel (`Math.hypot(re - reOhm, im)`). ' +
    'Wat er WEL in |Z − R_e| zit binnen zijn fitband is de MOTIONELE STAART, en die is er niet klein: ' +
    'gemeten op deze weg 59 % van de spoelbijdrage aan de onderkant van de band en 0,2 % aan de ' +
    'bovenkant (scripts/measure-b1-motional-model.ts). Een bijdrage die met de frequentie sneller krimpt ' +
    'dan de spoel groeit kantelt de log-log-helling omhoog, en dat is de richting en de orde van alle ' +
    'drie de afwijkingen. De motionele fit, die de takken expliciet meemodelleert, leest n op de twee ' +
    'gesloten wegen tot in het zevende cijfer goed. Niet gerepareerd: welke van de twee de ' +
    'rapportagewaarde hoort te zijn is een besluit over de schatter en niet over deze casus, en de ' +
    'exponent bereikt geen poort, grens, venster of metriek — nagegaan bij B-1, twee lezers en beide ' +
    'zijn rapportage.',
  'semi-inductantie n (HF-fit) · mid':
    'C-2/B1, HERZIEN BIJ B-1 — dezelfde schatter en dezelfde richting als op de woofer, en dezelfde ' +
    'gecorrigeerde oorzaak: de motionele staart binnen de HF-fitband, hier 13 % van de spoelbijdrage aan ' +
    'de onderkant. De motionele fit leest n op deze weg tot in het zevende cijfer goed.',
  'semi-inductantie n (HF-fit) · tweeter':
    'C-2/B1, HERZIEN BIJ B-1 — dezelfde schatter, dezelfde richting, en dit is het uiterste van de drie: ' +
    '+44 %. Het is ook de weg waar de gecorrigeerde oorzaak het scherpst te zien is: de fitband begint ' +
    'een decade boven f_s = 1500 Hz, dus 15–20 kHz, en de motionele staart is dáár nog 27 % van de ' +
    'spoelbijdrage aan de onderkant en 17 % aan de bovenkant — waar zij op de andere twee wegen ' +
    'bovenaan onder de procent is. Eén decade is voor een Q = 1,6 tak niet genoeg.',
  'x/V op de resonantie · woofer':
    'C-2/B3 — DE MAAT VAN EEN BENADERING DIE DE ENGINE ZELF BENOEMT. M-C route 1 leest Small\'s Q_ms op de ' +
    'BOVENSTE piek van het reflexpaar en behandelt een tweegradensysteem als één — de engine schrijft dat ' +
    'als `qmsSource` bij elk oordeel. Deze casus meet hoe groot die benadering is: +43 %, en in de ' +
    'CONSERVATIEVE richting (de engine denkt dat de conus méér beweegt dan het model zegt, dus haar ' +
    'plafond is strenger dan nodig). Op de twee gesloten wegen is dezelfde route exact. Niet ' +
    'gerepareerd: een reflex-eigen excursieroute is een metriekwijziging (A5e/engine2-metriek), en de ' +
    'richting maakt haar niet dringend.',
};
const out: GoldenRefs2 = {
  ...golden,
  manifest_en_geometrie: { ...golden.manifest_en_geometrie, grondwaarheid: truth },
  afgeleide_parameters: ({
    _extractie_parameters: {
      klasse: 'A',
      afhankelijkheid: 'meting',
      _: 'De parameters waarop élke rij hieronder rust (R3): welke band, welke middeling, welk raster. Zij komen uit de rapportinstellingen die iedere casus-2-meetplek spreidt.',
      impedantie_sweep_hz: [truth.bemonstering.zFromHz, truth.bemonstering.zToHz],
      impedantie_punten: truth.bemonstering.zPoints,
      ver_veld_raster: `lineair, ${truth.bemonstering.sampleRateHz}/${truth.bemonstering.fftLength} Hz per punt, ${truth.bemonstering.ffFirstHz}–${truth.bemonstering.ffLastHz} Hz`,
      poort_ms: truth.poort,
      orde_per_overname: CASUS2_STATED_ORDER,
      doelcurve: JSON.stringify(CASUS2_REPORT_SETTINGS.targetCurve ?? null),
      /* B-1 — the impedance model every Q, R_e and exponent row below rests
       * on, and how it was chosen. Named here rather than assumed, because
       * "the fit" stopped being one model on 09-09-2026. */
      motioneel_model:
        'z-re 1.2: Z = R_e + K·(jω)^n + Σ takken. Beide modellen (mét en zónder de half-machts ' +
        'lekterm) worden op elke sweep gefit en beide staan in het driverblok; de lekterm wordt ' +
        'ALTIJD gehouden, en deze casus is waarom — haar lek-arm levert de model-R_e terug en de kale ' +
        'arm zit er 0,08–0,23 Ω naast, tegen een tolerantieklasse van 0,03 Ω. De EXPONENT wordt alleen ' +
        'gepubliceerd waar zij niet van de fitband afhangt (dezelfde limiet die deze fit voor R_e ' +
        'publiceert).',
      /* Read from the constants, never typed: a band multiple written out here
       * is a second copy that goes stale on the next change (P6/V15). */
      motioneel_model_primaire_band: RE_FIT_BAND_MULTIPLE_OF_FUNDAMENTAL,
      motioneel_model_vergelijkingsbanden: [...RE_FIT_SENSITIVITY_BAND_MULTIPLES],
    },
    extractie_tegen_grondwaarheid: {
      klasse: 'A',
      afhankelijkheid: 'meting',
      _: 'ELKE grootheid waarvan het model het antwoord kent, met de extractie ernaast. `binnen` is het oordeel in de tolerantieklasse die de rij noemt; `verschil` is absoluut voor ohm en dB en relatief (%) voor de rest. `soort` scheidt ACCEPTATIE (dezelfde vraag, dus een verschil is een bevinding) van CONTROLE (met opzet twee vragen: een tweede schatter, een piekhoogte die ook de spoel draagt, een benadering die de engine zelf als controle meedraagt).',
      rijen: rows,
      totaal: rows.length,
      acceptatierijen: rows.filter((r) => r.soort === 'acceptatie').length,
      controlerijen: rows.filter((r) => r.soort === 'controle').length,
      binnen_tolerantie: rows.length - buiten.length,
      buiten_tolerantie: buiten.length,
      buiten: buiten.map((r) => `${r.soort.toUpperCase()} — ${r.grootheid} (${r.weg}, ${r.schatter}): ${r.extractie} tegen ${r.grondwaarheid} ${r.eenheid}, ${r.verschil} tegen ${r.toegestaan} toegestaan`),
      bevindingen: buitenAcceptatie.map((r) => ({
        sleutel: key(r),
        grondwaarheid: r.grondwaarheid,
        extractie: r.extractie,
        verschil: r.verschil,
        klasse: r.klasse,
        toegestaan: r.toegestaan,
        schatter: r.schatter,
        reden: BEVINDING_REDEN[key(r)] ?? 'GEEN REDEN OPGESCHREVEN — een afwijking zonder verklaring is een openstaande vraag, geen referentie. Zet haar in BEVINDING_REDEN in scripts/record-casus2-references.ts.',
      })),
      controle_afwijkingen: buiten
        .filter((r) => r.soort === 'controle')
        .map((r) => `${key(r)}: ${r.verschil} — met opzet een andere vraag, zie de rij zelf`),
      /* B-1 — where the extractor declined. Not inside a tolerance and not
       * outside one: there is nothing to compare, and that is the result. */
      onthoudingen,
      onthoudingen_toelichting:
        'Grootheden waarvan het model het antwoord kent en waarop de schatter zich ONTHOUDT. Geen ' +
        'oordeel en geen afwijking — er valt niets te vergelijken. `reden` is de zin die de schatter ' +
        'zelf meegeeft, niet een samenvatting ervan.',
      errata: ERRATA,
    },
    ...perDriver,
  } as unknown as GoldenRefs2['afgeleide_parameters']),
  verankerde_gaps_dB,
  kruisvensters: kruisvensters as GoldenRefs2['kruisvensters'],
  kandidaten: kandidaten as GoldenRefs2['kandidaten'],
};
writeFileSync(GOLDEN2_PATH, `${JSON.stringify(out, null, 1)}\n`);

console.log(
  `casus 2: ${rows.length} vergelijkingen (${rows.filter((r) => r.soort === 'acceptatie').length} acceptatie, ` +
    `${rows.filter((r) => r.soort === 'controle').length} controle), ${rows.length - buiten.length} binnen tolerantie, ` +
    `${buitenAcceptatie.length} ACCEPTATIE-bevindingen, ${buiten.length - buitenAcceptatie.length} controle-afwijkingen, ` +
    `${onthoudingen.length} onthouding${onthoudingen.length === 1 ? '' : 'en'}.`,
);
for (const o of onthoudingen) {
  console.log(`ONTHOUDING — ${o.grootheid} (${o.weg}): grondwaarheid ${o.grondwaarheid} ${o.eenheid}; ${o.reden}`);
}
console.log('| grootheid | weg | grondwaarheid | extractie | verschil | klasse | binnen |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  const d = ABSOLUTE.has(r.klasse) ? `${r.verschil > 0 ? '+' : ''}${r.verschil} ${r.eenheid}` : `${r.verschil > 0 ? '+' : ''}${r.verschil} %`;
  console.log(`| ${r.grootheid} | ${r.weg} | ${r.grondwaarheid} | ${r.extractie} | ${d} | ${r.klasse} ${r.toegestaan} | ${r.binnen ? 'ja' : '**NEE**'} |`);
}
const onDisk = readdirSync(CASUS2_DIR).filter((f) => /^KAND-V2-\d+\.adsfilter\.json$/.test(f));
console.log(`netlists: ${Object.keys(netlists).length} in het manifest, ${onDisk.length} op schijf`);
