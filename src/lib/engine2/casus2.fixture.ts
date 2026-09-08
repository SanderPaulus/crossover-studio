/**
 * CASUS 2 — DE SYNTHETISCHE DRIEWEG MET GRONDWAARHEID (C-2, 08-09-2026).
 *
 * WAAROM ZIJ BESTAAT. A7 noemt synthetische grondwaarheid als onderdeel van de
 * teststrategie; casus S1 (F3b) leverde die voor ÉÉN schatter op ÉÉN kromme, en
 * casus 1 en 1b zijn echte metingen waar geen enkel getal een bekend antwoord
 * heeft. Twee schatters die het eens worden is consensus en geen validatie:
 * maken zij dezelfde systematische fout, dan zwijgen zij samen. Casus 2 is de
 * eerste VOLLEDIGE casus waar élk getal vóór de meting gekozen is, dus waar
 * élke extractie een antwoord heeft om naast te leggen.
 *
 * WAT ER GEGENEREERD IS EN WAT NIET. `scripts/casus2-model.ts` draagt het
 * model — T/S per driver, de reflexkast van de woofer en de gesloten pod van de
 * mid, de kolvenrichtingskarakteristiek, de baffle-step uit een gestelde
 * frontbreedte, de gekozen poort en de GEDOCUMENTEERDE meetspanning — en
 * `scripts/generate-casus2-measurements.ts` maakt er elf bestanden van plus
 * `grondwaarheid.json`. Dit bestand rekent daar niets van na: het LEEST de
 * grondwaarheid uit het referentiebestand, precies zoals het de gestelde eisen
 * leest, en de vergelijking met de extractie staat in `goldenCasus2.test.ts`.
 *
 * WAT ZIJ MET CASUS 1 DEELT. Alleen LEZERS, nooit getallen. De
 * eisen-lezers van casus 1 (`casus1AmpMinLoadOhm`, `casus1ExcursionSettings`,
 * …) kijken uitsluitend naar `manifest_en_geometrie.gestelde_eisen` en
 * `.driverkaart`, en casus 2 spelt beide blokken hetzelfde — dus één lezer per
 * eis bedient drie casusbestanden, en een eis die in de ene beweegt kan in de
 * andere niet anders gelezen worden. Dat is dezelfde constructie die casus 1b
 * bij E-3 kreeg.
 *
 * ELK GETAL IS ANDERS DAN CASUS 1, met opzet: één 8 Ω-woofer in plaats van een
 * parallel paar, een kleiner front (210 tegen 260 mm), andere c-t-c (195/96
 * tegen 261/129,2), andere gevoeligheden, een andere poort (4,0 tegen 2,521 ms)
 * en andere spoelfamilies. Een synthetische casus die toevallig in de buurt van
 * de echte ligt kan een schatter die op de echte is afgeregeld niet betrappen.
 *
 * ZIJ LEEST VAN SCHIJF, dus zij wordt alleen uit tests en `scripts/`
 * geïmporteerd (`browserSafe.test.ts` zondert `*.fixture.ts` uit;
 * `toggleRegression.test.ts` pint dat niets in de bundel er een importeert).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, resampleImpedance, type GriddedResponse } from '../dsp.ts';
import type { Complex } from '../complex.ts';
import { deserializeFilter } from '../filterFile.ts';
import { crossoverToNetlist } from '../vxpNetwork.ts';
import type { VxpCrossover } from '../parsers/vxp.ts';
import { parseFrd } from '../parsers/frd.ts';
import { parseZma } from '../parsers/zma.ts';
import { defaultEq, defaultHpLp } from '../filters.ts';
import { AUTO_STRUCTS } from '../threeWayDesign.ts';
import type { WayWiring } from './ingest/wiring.ts';
import { runIngest, type MeasurementFile } from './ingest/derive.ts';
import { parseArtaHeader, type Manifest, type ManifestEntry, type MeasurementKind } from './ingest/manifest.ts';
import { buildReport, type EngineV2Report, type FilterInput, type ReportSettings } from './report.ts';
import { ctcKey, type Geometry } from './metrics/types.ts';
import { peakInputVolts } from './metrics/driveExcursion.ts';
import { buildCandidateField, type CandidateFieldResult } from './predesign/candidateField.ts';
import { fieldModeSettings } from './predesign/fieldMode.ts';
import type { GeneratedCandidate } from './predesign/candidates.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './optimizer/candidateDeclaration.ts';
import { factsForWorker, type MeasurementFactsPayload } from './optimizer/measurementFacts.ts';
import type { TargetCurve } from './requirements/targetCurve.ts';
import type { CoilDcrFit, CoilDcrModel } from '../coilDcr.ts';
import {
  casus1AmpMinLoadOhm,
  casus1BuildabilityOnSearch,
  casus1BuildabilitySettings,
  casus1CoilDcrFits,
  casus1CoilDcrModel,
  casus1CoilFamilyByDriver,
  casus1ContinuousPowerW,
  casus1ExcursionSettings,
  casus1LfResonantBudgetDb,
  casus1LowestWayLevelWorkRule,
  casus1MaxCrossingHzByPair,
  casus1MaxDriveOnFsDbByDriver,
  casus1QesMultiplierMax,
  casus1TargetCurve,
  casus1ThermalDesignPowerW,
  casus1WiringByDriver,
  type GoldenRefs,
} from './casus1.fixture.ts';
import { SILENT_GHOST_DB } from './casus1V2.fixture.ts';
import type { LowestWayLevelWork } from '../levelWork.ts';

export const CASUS2_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-fixtures', 'casus2');
export const GOLDEN2_PATH = join(CASUS2_DIR, 'golden_refs_casus2.json');

/** One file tag of the casus-2 manifest, in the shape casus 1 uses. */
interface FileTag {
  drv: string;
  typ: string;
  hoek?: number;
}

/** The casus-2 reference file. Loosely typed for the same reason casus 1b's is. */
export interface GoldenRefs2 {
  casus: string;
  toleranties: GoldenRefs['toleranties'];
  afgeleide_parameters: Record<string, Record<string, unknown>>;
  verankerde_gaps_dB: Record<string, unknown>;
  kruisvensters: Record<string, Record<string, unknown>>;
  kandidaten: Record<string, Record<string, unknown>>;
  manifest_en_geometrie: {
    bestanden_map: string;
    bestanden: Record<string, FileTag>;
    ff_headers: Record<string, unknown>;
    geometrie: {
      D_inch: Record<string, number>;
      z_offset_mm: Record<string, number>;
      ctc_mm: Record<string, number>;
      baffle_mm?: { breedte: number; hoogte: number };
      rotatiesymmetrisch: Record<string, boolean>;
    };
    netlists: Record<string, string>;
    gestelde_eisen: Record<string, unknown>;
    driverkaart: Record<string, unknown>;
    /** THE MODEL the files were generated from — project input, not a derivation. */
    grondwaarheid: Casus2Truth;
  } & Record<string, unknown>;
}

/** The ground truth, as `generate-casus2-measurements.ts` writes it. */
export interface Casus2Truth {
  drivers: Record<string, Record<string, unknown>>;
  geometrie: {
    baffle_mm: { breedte: number; hoogte: number };
    baffle_step_hz: number;
    baffle_step_diepte_dB: number;
    ctc_mm: Record<string, number>;
    z_offset_mm: Record<string, number>;
  };
  poort: {
    referenceTimeMs: number;
    rightWindowMs: number;
    effectieve_venstertijd_ms: number;
    geldigheidsvloer_hz: number;
    fijnstructuur_hz: number;
  };
  meetcondities: { voltsRms: number; micDistanceMm: number };
  versterker: { peakPowerW: number; continuousPowerW: number; nominalLoadOhm: number };
  bemonstering: Record<string, unknown>;
  bestanden: string[];
}

export function loadGolden2(): GoldenRefs2 {
  return JSON.parse(readFileSync(GOLDEN2_PATH, 'utf-8')) as GoldenRefs2;
}

/** Casus 1's stated-requirement readers, handed casus 2's file (the casus-1b construction). */
const asCasus1 = (g: GoldenRefs2): GoldenRefs => g as unknown as GoldenRefs;

/** The ground truth of the model, read and never recomputed. */
export function casus2Truth(golden: GoldenRefs2 = loadGolden2()): Casus2Truth {
  return golden.manifest_en_geometrie.grondwaarheid;
}

/** The manifest, from the reference file's own tags. */
export function casus2Manifest(golden: GoldenRefs2 = loadGolden2()): Manifest {
  const g = golden.manifest_en_geometrie;
  const entries: ManifestEntry[] = Object.entries(g.bestanden).map(([file, tag]) => {
    const kind = tag.typ as MeasurementKind;
    const entry: ManifestEntry = { file, driver: tag.drv, kind };
    if (tag.hoek !== undefined) entry.angleDeg = tag.hoek;
    if (kind === 'NF') {
      const d = g.geometrie.D_inch[tag.drv];
      if (d !== undefined) entry.diameterInch = d;
    }
    return entry;
  });
  return { sessionId: 'casus2-synthetic-2026-09-08', entries };
}

/**
 * One measurement file. The impedances are ZMA text and not binary ARTA `.lim`:
 * a synthetic sweep has no reason to be written in a proprietary binary, and
 * ZMA is the format the app already reads and exports.
 */
export function loadCasus2Measurement(entry: ManifestEntry): MeasurementFile {
  const text = readFileSync(join(CASUS2_DIR, entry.file), 'utf-8');
  if (entry.kind === 'Z') {
    const z = parseZma(text);
    return { entry, impedance: { freq: z.freq, magnitude: z.magnitude, phaseDeg: z.phase } };
  }
  const f = parseFrd(text);
  return {
    entry: { ...entry, header: parseArtaHeader(f.meta.rawComments) },
    response: { freq: f.freq, spl: f.spl, phaseDeg: f.phase },
  };
}

export function casus2Files(manifest: Manifest): MeasurementFile[] {
  return manifest.entries.map(loadCasus2Measurement);
}

/** The geometry of the three ways, from the reference file's own block. */
export function casus2Geometry(golden: GoldenRefs2 = loadGolden2()): Geometry {
  const g = golden.manifest_en_geometrie.geometrie;
  return {
    ctcMm: {
      [ctcKey('woofer', 'mid')]: g.ctc_mm['woofer_mid'],
      [ctcKey('mid', 'tweeter')]: g.ctc_mm['mid_tweeter'],
    },
    ctcSource: {
      [ctcKey('woofer', 'mid')]: 'casus 2 model geometry (casus2-model.ts, CASUS2_CTC_MM)',
      [ctcKey('mid', 'tweeter')]: 'casus 2 model geometry (casus2-model.ts, CASUS2_CTC_MM)',
    },
    waySources: {
      woofer: [{ id: 'woofer', zMm: g.z_offset_mm['woofer'] }],
      mid: [{ id: 'mid', zMm: g.z_offset_mm['mid'] }],
      tweeter: [{ id: 'tweeter', zMm: g.z_offset_mm['tweeter'] }],
    },
    zOffsetMm: { woofer: g.z_offset_mm['woofer'], mid: g.z_offset_mm['mid'], tweeter: g.z_offset_mm['tweeter'] },
    rotationallySymmetric: {
      woofer: g.rotatiesymmetrisch['woofer'] ?? false,
      mid: g.rotatiesymmetrisch['mid'] ?? false,
      tweeter: g.rotatiesymmetrisch['tweeter'] ?? false,
    },
    ...(g.baffle_mm?.breedte !== undefined ? { baffleWidthMm: g.baffle_mm.breedte } : {}),
  };
}

/** A frozen casus-2 netlist, with the measured impedances. */
export function casus2Filter(
  key: string,
  manifest: Manifest,
  files: readonly MeasurementFile[],
  golden: GoldenRefs2 = loadGolden2(),
): FilterInput {
  const name = golden.manifest_en_geometrie.netlists[key];
  if (!name) {
    throw new Error(`casus 2 has no netlist called ${key}; the file lists ${Object.keys(golden.manifest_en_geometrie.netlists).join(', ')}`);
  }
  const parsed = deserializeFilter(readFileSync(join(CASUS2_DIR, name), 'utf-8'));
  const { netlist } = crossoverToNetlist({ name, parts: [...parsed.parts] } as VxpCrossover);
  const driverZ: FilterInput['driverZ'] = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (f?.impedance) driverZ[e.driver] = { freq: f.impedance.freq, magnitude: f.impedance.magnitude, phaseDeg: f.impedance.phaseDeg };
  }
  return { name, netlist, driverZ };
}

/* ================================================================== *
 * The stated requirements, read once — through casus 1's readers
 * ================================================================== */

const G2 = loadGolden2();
const G2_AS_1 = asCasus1(G2);

export const CASUS2_AMP_MIN_LOAD_OHM: number | null = casus1AmpMinLoadOhm(G2_AS_1);
export const CASUS2_LF_RESONANT_BUDGET_DB: number | null = casus1LfResonantBudgetDb(G2_AS_1);
export const CASUS2_QES_MULTIPLIER_MAX: number | null = casus1QesMultiplierMax(G2_AS_1);
export const CASUS2_MAX_DRIVE_ON_FS_DB_BY_DRIVER: Record<string, number> = casus1MaxDriveOnFsDbByDriver(G2_AS_1);
export const CASUS2_MAX_CROSSING_HZ_BY_PAIR: Record<string, number> = casus1MaxCrossingHzByPair(G2_AS_1);
export const CASUS2_EXCURSION = casus1ExcursionSettings(G2_AS_1);
export const CASUS2_BUILDABILITY = casus1BuildabilitySettings(G2_AS_1);
export const CASUS2_BUILDABILITY_ON_SEARCH: boolean = casus1BuildabilityOnSearch(G2_AS_1);
export const CASUS2_CONTINUOUS_POWER_W: number | null = casus1ContinuousPowerW(G2_AS_1);
export const CASUS2_THERMAL_DESIGN_POWER_W: number | null = casus1ThermalDesignPowerW(G2_AS_1);
export const CASUS2_TARGET_CURVE: TargetCurve = casus1TargetCurve(G2_AS_1);
export const CASUS2_WIRING: Record<string, WayWiring> = casus1WiringByDriver(G2_AS_1);
export const CASUS2_LOWEST_WAY_LEVEL_WORK: LowestWayLevelWork | undefined = casus1LowestWayLevelWorkRule(G2_AS_1);
/* A5e.3 — the coil families, through casus 1's readers. The catalogue path in
 * the manifest is REPO-RELATIVE and casus 1's reader resolves it two levels up
 * from `test-fixtures/casus1`; casus 2's own directory sits at the same depth,
 * so the same reader lands on the same file. One reader, one catalogue, three
 * casus files. */
export const CASUS2_COIL_DCR: { model: CoilDcrModel | null; stated: boolean; missing: { way: string; family: string }[] } =
  casus1CoilDcrModel(G2_AS_1);
export const CASUS2_COIL_FAMILY_BY_DRIVER: Record<string, string> = casus1CoilFamilyByDriver(G2_AS_1).familyByWay;
export const CASUS2_COIL_DCR_FITS: { fits: CoilDcrFit[]; label: string } = casus1CoilDcrFits(G2_AS_1);
export const CASUS2_COIL_DCR_SETTINGS: { coilDcrFamilyByDriver?: Record<string, string>; coilDcrFits?: readonly CoilDcrFit[] } =
  Object.keys(CASUS2_COIL_FAMILY_BY_DRIVER).length > 0
    ? { coilDcrFamilyByDriver: { ...CASUS2_COIL_FAMILY_BY_DRIVER }, coilDcrFits: CASUS2_COIL_DCR_FITS.fits }
    : {};
export const CASUS2_PEAK_INPUT_VOLTS: number | null =
  CASUS2_EXCURSION.amplifierPeakPowerW !== undefined && CASUS2_EXCURSION.amplifierNominalLoadOhm !== undefined
    ? peakInputVolts({ peakPowerW: CASUS2_EXCURSION.amplifierPeakPowerW, nominalLoadOhm: CASUS2_EXCURSION.amplifierNominalLoadOhm })
    : null;

/** The order the field is built at — STATED, as casus 1 states one (A5d.3 prefers symmetric LR flanks). */
export const CASUS2_STATED_ORDER = 4;

/** The report settings EVERY casus-2 measuring surface spreads (the V42 rule). */
export const CASUS2_REPORT_SETTINGS: ReportSettings = {
  ...(CASUS2_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS2_CONTINUOUS_POWER_W } : {}),
  ...(Object.keys(CASUS2_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0 ? { maxDriveOnFsDbByDriver: { ...CASUS2_MAX_DRIVE_ON_FS_DB_BY_DRIVER } } : {}),
  ...(Object.keys(CASUS2_MAX_CROSSING_HZ_BY_PAIR).length > 0 ? { maxCrossingHzByPair: { ...CASUS2_MAX_CROSSING_HZ_BY_PAIR } } : {}),
  ...CASUS2_BUILDABILITY,
  ...(Object.keys(CASUS2_WIRING).length > 0 ? { wiringByDriver: { ...CASUS2_WIRING } } : {}),
  ...(CASUS2_LOWEST_WAY_LEVEL_WORK !== undefined ? { lowestWayLevelWork: CASUS2_LOWEST_WAY_LEVEL_WORK } : {}),
  orderByPair: {
    [ctcKey('woofer', 'mid')]: CASUS2_STATED_ORDER,
    [ctcKey('mid', 'tweeter')]: CASUS2_STATED_ORDER,
  },
  targetCurve: CASUS2_TARGET_CURVE,
  ...CASUS2_EXCURSION,
  ...CASUS2_COIL_DCR_SETTINGS,
};

/** The casus-2 report on a frozen netlist, or on no netlist at all. */
export function casus2Report(
  key: string | null,
  manifest: Manifest = casus2Manifest(G2),
  files: readonly MeasurementFile[] = casus2Files(manifest),
  golden: GoldenRefs2 = G2,
  settings: ReportSettings = CASUS2_REPORT_SETTINGS,
): EngineV2Report {
  return buildReport({
    manifest,
    files,
    filter: key === null ? null : casus2Filter(key, manifest, files, golden),
    geometry: casus2Geometry(golden),
    settings,
  });
}

/* ================================================================== *
 * The chain grid and the judged band — derived, as casus 1's are
 * ================================================================== */

const PRECEDENT_GRID_POINTS = 96;
const PRECEDENT_GRID_HZ: [number, number] = [200, 20000]; // P6-OK: the resolution precedent, not a band
const GRID_TOP_HZ = 20000; // P6-OK: the top of the audio band, as casus 1
const JUDGE_TOP_HZ = 19500; // P6-OK: the highest way's ceiling inside the grid, as casus 1
const SAFETY_GRID_POINTS = 240;

/**
 * The floor of the judged band and of the chain grid — casus 1's M-1
 * derivation, on casus 2's lowest way: the band floor is the higher of the
 * lowest way's validity floor and its box tuning (a vented box unloads the cone
 * below f_b), and the grid starts at the validity floor.
 *
 * On this casus both come out ROUND, which is the point of a chosen gate: the
 * validity floor is 1/T = 250 Hz on the nose.
 */
const BAND_SOURCE = (() => {
  const report = casus2Report(null);
  const lowest = report.driversLowToHigh[0];
  const d = report.ingest.drivers.find((x) => x.driver === lowest);
  if (!d?.onAxis) throw new Error(`casus 2: the lowest way (${lowest}) has no on-axis band`);
  const validityFloorHz = d.onAxis.bandHz[0];
  const fpHz = d.impedance?.fundamentalHz ?? null;
  const floorHz = fpHz !== null ? Math.max(validityFloorHz, fpHz) : validityFloorHz;
  return { lowest, validityFloorHz, fpHz, floorHz, provenance: d.onAxis.bandFloorProvenance };
})();
const pointsPerOctave = PRECEDENT_GRID_POINTS / Math.log2(PRECEDENT_GRID_HZ[1] / PRECEDENT_GRID_HZ[0]);
export const CASUS2_V2_GRID: number[] = logspace(
  BAND_SOURCE.validityFloorHz,
  GRID_TOP_HZ,
  Math.round(pointsPerOctave * Math.log2(GRID_TOP_HZ / BAND_SOURCE.validityFloorHz)),
);
export const CASUS2_V2_BAND_HZ: [number, number] = [BAND_SOURCE.floorHz, JUDGE_TOP_HZ];
export const CASUS2_V2_BAND_SOURCE = BAND_SOURCE;

/** The run seed — stated and recorded (A5e.4). Different from casus 1's and casus 1b's. */
export const CASUS2_V2_SEED = 20260908;

/** The tuner settings of a casus-2 run — the app's own defaults, as casus 1 states them (V27). */
export const CASUS2_V2_SETTINGS = {
  phasePriority: 0.5,
  synthMode: 'acoustic' as const,
  band: CASUS2_V2_BAND_HZ,
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  breakupGuard: true,
  ampTarget: 'onAxis' as const,
  phaseMetric: 'band' as const,
  powerMetric: 'smooth' as const,
  catalogSnap: false,
  dissipationWeight: 0.05,
  powerFoldWeight: 0.5,
  costWeight: 0.0015,
  directivityWeight: 0,
  /* The source-resistance tiers are UNSTATED here for the same reason as on
   * casus 1 (V34, P4): this project states no source-resistance requirement,
   * so nothing is disqualified on one. The audit still RUNS. */
  audit: { thresholds: { rSourceOhm: null } },
  rSourceProbeSource: 'safety' as const,
  ...(CASUS2_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS2_AMP_MIN_LOAD_OHM } : {}),
};

/** The armed gates — spread at the use site (P4). */
export const CASUS2_V2_GATES: {
  ampMinLoadOhm?: number;
  maxDriveOnFsDbByDriver?: Record<string, number>;
  peakInputVolts?: number;
  resistorClassW?: number;
  resistorPowerMargin?: number;
  resistorThermalPowerW?: number;
  coilClassA?: number;
} = {
  ...(CASUS2_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS2_AMP_MIN_LOAD_OHM } : {}),
  ...(Object.keys(CASUS2_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0 ? { maxDriveOnFsDbByDriver: { ...CASUS2_MAX_DRIVE_ON_FS_DB_BY_DRIVER } } : {}),
  ...(CASUS2_PEAK_INPUT_VOLTS !== null ? { peakInputVolts: CASUS2_PEAK_INPUT_VOLTS } : {}),
  ...(CASUS2_BUILDABILITY_ON_SEARCH ? { ...CASUS2_BUILDABILITY } : {}),
};

/** The armed budgets — spread at the use site (P4). */
export const CASUS2_V2_BUDGETS: { lfBumpBudgetDb?: number; qesMultiplierMax?: number } = {
  ...(CASUS2_LF_RESONANT_BUDGET_DB !== null ? { lfBumpBudgetDb: CASUS2_LF_RESONANT_BUDGET_DB } : {}),
  ...(CASUS2_QES_MULTIPLIER_MAX !== null ? { qesMultiplierMax: CASUS2_QES_MULTIPLIER_MAX } : {}),
};

/* ================================================================== *
 * The field, the declaration, the facts, the chain input
 * ================================================================== */

/** The library the design step enumerates, restricted to LR as casus 1 restricts it. */
export const CASUS2_FIELD_ALIGNMENTS = AUTO_STRUCTS.filter((a) => a.kind === 'LR');

/**
 * THE FIELD OF CASUS 2 — an EXPLORATION (E-2): the centre-first positions, one
 * alignment per handover (the stated order), the exploration chain budget of 8.
 *
 * An exploration and not a full field, because what casus 2 has to show is that
 * the route DELIVERS designs on measurements it has never seen — not that it
 * finds the best one. Eight chains is what E-2 stated that question is worth.
 */
export function casus2Field(report: EngineV2Report): CandidateFieldResult {
  const wis = report.predesign.windowInputs;
  return buildCandidateField({
    windowInputs: wis,
    perPair: wis.map(() => ({ statedOrder: CASUS2_STATED_ORDER })),
    alignments: CASUS2_FIELD_ALIGNMENTS,
    ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: Math.max(1, wis.length) }),
  });
}

/** The single-part span of the LOWEST way's stated coil family, henry (A5e.3b). */
export const CASUS2_LOWEST_WAY_COIL_SPAN_H: number | null = (() => {
  const m = CASUS2_COIL_DCR.model;
  if (!m) return null;
  const fam = m.familyByWay[BAND_SOURCE.lowest];
  const fit = fam !== undefined ? m.fits[fam] : undefined;
  return fit ? fit.rangeH[1] : null;
})();

/** The declaration that travels beside one casus-2 candidate — casus 1's three-way shape. */
export function casus2V2Declaration(
  c: GeneratedCandidate,
  safety?: { freqs: number[]; w: GriddedResponse; m: GriddedResponse; t: GriddedResponse; z: Record<string, Complex[]> },
) {
  const armCoilDcr = CASUS2_COIL_DCR.stated;
  return {
    declaration: declareCandidateChoices({
      cages: c.crossings.map((x) => x.cageHz),
      windowFloorsHz: c.crossings.map((x) => x.windowHz[0]),
      multiWay: true,
      stated: {
        band: CASUS2_V2_BAND_HZ,
        staged: CASUS2_V2_SETTINGS.targets,
        ampTarget: CASUS2_V2_SETTINGS.ampTarget,
        powerMetric: CASUS2_V2_SETTINGS.powerMetric,
        phaseMetric: CASUS2_V2_SETTINGS.phaseMetric,
        catalogSnap: CASUS2_V2_SETTINGS.catalogSnap,
        breakupGuard: CASUS2_V2_SETTINGS.breakupGuard,
        audit: CASUS2_V2_SETTINGS.audit,
        rSourceProbeSource: CASUS2_V2_SETTINGS.rSourceProbeSource,
        ...(CASUS2_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS2_AMP_MIN_LOAD_OHM } : {}),
        ...(safety ? { safety } : {}),
        zFloorStrict: true,
      },
      targetCurve: CASUS2_TARGET_CURVE,
      ...(Object.keys(CASUS2_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
        ? { driveOnFsLimitDbByDriver: { ...CASUS2_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
        : {}),
      ...(CASUS2_EXCURSION.driverCardByDriver !== undefined &&
      CASUS2_EXCURSION.amplifierPeakPowerW !== undefined &&
      CASUS2_EXCURSION.xmaxMarginFraction !== undefined
        ? { driveCeilingDerived: true }
        : {}),
      ...(CASUS2_V2_BUDGETS.lfBumpBudgetDb !== undefined ? { lfBumpBudgetDb: CASUS2_V2_BUDGETS.lfBumpBudgetDb } : {}),
      ...(armCoilDcr && Object.keys(CASUS2_COIL_FAMILY_BY_DRIVER).length > 0
        ? {
            coilDcrFamilyByWay: { ...CASUS2_COIL_FAMILY_BY_DRIVER },
            coilDcrFits: CASUS2_COIL_DCR_FITS.fits,
            coilDcrCatalogLabel: CASUS2_COIL_DCR_FITS.label,
          }
        : {}),
    }),
    chainDeclaration: declareCandidateChainChoices({
      stated: {},
      ...(armCoilDcr && CASUS2_LOWEST_WAY_COIL_SPAN_H !== null ? { lowestWayCoilSpanH: CASUS2_LOWEST_WAY_COIL_SPAN_H } : {}),
    }),
    provenance: c.provenance,
    orderByModel: { mid: c.crossings[0].order, tweeter: c.crossings[1].order },
  };
}

/** The measured facts across the border, the way the app sends them. */
export function casus2V2Facts(
  report: EngineV2Report,
  manifest: Manifest,
  files: readonly MeasurementFile[],
): MeasurementFactsPayload {
  const modelByDriverId: Record<string, string> = {};
  for (const d of report.ingest.drivers) modelByDriverId[d.driver] = d.driver;
  const sweepByDriverId: Record<string, { freq: readonly number[]; magnitude: readonly number[]; phaseDeg: readonly number[] }> = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (!f?.impedance) continue;
    sweepByDriverId[e.driver] = { freq: f.impedance.freq, magnitude: f.impedance.magnitude, phaseDeg: f.impedance.phaseDeg };
  }
  return { ...factsForWorker(report, modelByDriverId, sweepByDriverId), silentFloorDb: SILENT_GHOST_DB };
}

/** Band a response to its own measured extent — silence outside it. */
function banded(grid: readonly number[], src: { grid: readonly number[]; db: readonly number[]; phaseDeg: readonly number[] }): GriddedResponse {
  const g = resample(src.grid, src.db, src.phaseDeg, grid, { clampEdges: true });
  const f0 = src.grid[0];
  const f1 = src.grid[src.grid.length - 1];
  return {
    freq: [...grid],
    spl: g.spl.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? SILENT_GHOST_DB : v)),
    phaseDeg: g.phaseDeg.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? 0 : v)),
  };
}

/** The three branch responses and the three impedances, on the chain grid, plus the safety set. */
export function casus2ChainInput(
  manifest: Manifest,
  files: readonly MeasurementFile[],
  chainGrid: readonly number[] = CASUS2_V2_GRID,
): {
  grid: readonly number[];
  w: GriddedResponse;
  m: GriddedResponse;
  t: GriddedResponse;
  driverZ: Record<string, Complex[]>;
  safety: { freqs: number[]; w: GriddedResponse; m: GriddedResponse; t: GriddedResponse; z: Record<string, Complex[]> };
} {
  const ingest = runIngest(manifest, files);
  const grid = chainGrid;
  const fullOf = (driver: string) => {
    const full = ingest.drivers.find((x) => x.driver === driver)?.onAxisFull;
    if (!full) throw new Error(`casus 2 has no on-axis sum for ${driver}`);
    return full;
  };
  const zOn = (g: readonly number[]): Record<string, Complex[]> => {
    const out: Record<string, Complex[]> = {};
    for (const e of manifest.entries) {
      if (e.kind !== 'Z') continue;
      const f = files.find((x) => x.entry.file === e.file);
      if (!f?.impedance) continue;
      out[e.driver] = resampleImpedance(f.impedance.freq, f.impedance.magnitude, f.impedance.phaseDeg, g).z;
    }
    return out;
  };
  const curve = (driver: string, g: readonly number[]): GriddedResponse => {
    const full = fullOf(driver);
    return banded(g, { grid: full.grid, db: full.db, phaseDeg: full.phaseDeg });
  };
  const extents = ['woofer', 'mid', 'tweeter'].map((d) => {
    const full = fullOf(d);
    return [full.grid[0], full.grid[full.grid.length - 1]] as [number, number];
  });
  const sGrid = logspace(Math.min(...extents.map((e) => e[0])), Math.max(...extents.map((e) => e[1])), SAFETY_GRID_POINTS);
  return {
    grid,
    w: curve('woofer', grid),
    m: curve('mid', grid),
    t: curve('tweeter', grid),
    driverZ: zOn(grid),
    safety: { freqs: sGrid, w: curve('woofer', sGrid), m: curve('mid', sGrid), t: curve('tweeter', sGrid), z: zOn(sGrid) },
  };
}

/**
 * THE VIRTUAL-FILTER SEED of a casus-2 run — the app's own three-way defaults,
 * restated here because the app's function lives inside a React component. A
 * STARTING POINT and nothing more (A5e.4/V27: stated and recorded).
 */
export function casus2Seed() {
  return {
    woofer: { gainDb: 0, hp: defaultHpLp(20), lp: { ...defaultHpLp(400), kind: 'LR' as const, order: 4 as const }, eq: [defaultEq(1000, 0, 1)] },
    mid: { gainDb: 0, hp: { ...defaultHpLp(400), kind: 'LR' as const, order: 4 as const }, lp: { ...defaultHpLp(2500), kind: 'LR' as const, order: 4 as const }, eq: [defaultEq(1000, 0, 1), defaultEq(6500, 0, 1)] },
    tweeter: { gainDb: 0, hp: { ...defaultHpLp(2500), kind: 'LR' as const, order: 4 as const }, lp: defaultHpLp(20000), eq: [defaultEq(10000, 0, 1)] },
  };
}
