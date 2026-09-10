/**
 * CASUS 1b — KOAN 2951's MID AND TWEETER AS A TWO-WAY (E-3, 06-09-2026).
 *
 * WHY IT EXISTS. E-3 mapped the two-way route finding by finding and found the
 * route without a fixture: every claim about it had been made on the parsers'
 * small mid/tweeter files (`optimizer/v2.fixture.ts`), never on a case with
 * stated requirements. Casus 1b is casus 1 without its woofers — the mid in
 * its closed pod (f_c 88.8 Hz) as the LOWEST way, the waveguide tweeter above
 * it — with every requirement of casus 1 that is stated on the system or on
 * those two drivers, and the plateau at 0 dB. It is NOT new ground truth: the
 * same measurements on the other chain, so that a difference between the
 * three-way and the two-way route is a ROUTE difference and not a data
 * difference. The requirements bound to the WOOFER are deliberately not carried
 * (`gestelde_eisen.niet_overgenomen` says which and why).
 *
 * WHAT IT SHARES WITH CASUS 1, AND HOW. The measurement FILES are casus 1's
 * (`test-fixtures/casus1/`, read through `loadMeasurement` — a copy of a
 * measurement is a second file that can drift), the M-1 merge of the mid
 * included. The STATED REQUIREMENTS are read through casus 1's own reader
 * functions, handed casus 1b's reference file: those readers only look at
 * `manifest_en_geometrie.gestelde_eisen` and `.driverkaart`, which casus 1b
 * spells the same way — one reader per requirement, two casus files. What is
 * casus 1b's OWN lives in `test-fixtures/casus1b/`: its reference file, the
 * derived reference netlist HUIDIG-MT (`scripts/derive-casus1b-huidig-mt.ts`)
 * and the frozen candidates of its exploration.
 *
 * IT READS FROM DISK, so it is only ever imported from tests and `scripts/`
 * (`browserSafe.test.ts` exempts `*.fixture.ts`; `toggleRegression.test.ts`
 * pins that nothing in the bundle imports one).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logspace, resample, resampleImpedance, type GriddedResponse } from '../dsp.ts';
import type { Complex } from '../complex.ts';
import { deserializeFilter } from '../filterFile.ts';
import { crossoverToNetlist } from '../vxpNetwork.ts';
import type { VxpCrossover } from '../parsers/vxp.ts';
import type { ChainInput, ChainSettings } from '../designChain.ts';
import { defaultEq, defaultHpLp } from '../filters.ts';
import { AUTO_STRUCTS } from '../threeWayDesign.ts';
import { DEFAULT_EQ_BANDS_PER_DRIVER } from '../vfOptimizer.ts';
import type { WayWiring } from './ingest/wiring.ts';
import { runIngest, type MeasurementFile } from './ingest/derive.ts';
import type { Manifest, ManifestEntry, MeasurementKind } from './ingest/manifest.ts';
import { buildReport, type EngineV2Report, type FilterInput, type ReportSettings } from './report.ts';
import { ctcKey, type Geometry } from './metrics/types.ts';
import { peakInputVolts } from './metrics/driveExcursion.ts';
import { buildCandidateField, type CandidateFieldResult } from './predesign/candidateField.ts';
import { windowFloorsFor } from './optimizer/scanRequest.ts';
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
  casus1MaxCrossingHzByPair,
  casus1MaxDriveOnFsDbByDriver,
  casus1TargetCurve,
  casus1ThermalDesignPowerW,
  casus1WiringByDriver,
  loadMeasurement,
  type Casus1MeasurementSet,
  type GoldenRefs,
} from './casus1.fixture.ts';
import { SILENT_GHOST_DB } from './casus1V2.fixture.ts';

export const CASUS1B_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-fixtures', 'casus1b');
export const GOLDEN1B_PATH = join(CASUS1B_DIR, 'golden_refs_casus1b.json');

/** One file tag of the casus-1b manifest, in the shape casus 1 uses. */
interface FileTag {
  drv: string;
  typ: string;
  hoek?: number;
  vervangt?: string;
}

/**
 * The casus-1b reference file. Loosely typed on purpose: the blocks the
 * recorder writes (class A/B numbers) are read by the tests as records, and
 * the stated-requirement blocks are read through casus 1's readers, which take
 * the casus-1 type and only touch the subtrees casus 1b spells the same way.
 */
export interface GoldenRefs1b {
  casus: string;
  toleranties: GoldenRefs['toleranties'];
  afgeleide_parameters: Record<string, Record<string, unknown>>;
  verankerde_gaps_dB: Record<string, unknown>;
  kruisvensters: Record<string, Record<string, unknown>>;
  kandidaten: Record<string, Record<string, unknown>>;
  /* The class-C baseline block is deliberately NOT typed here: no source file
   * may read it (`goldenClassification.test.ts` scans for the key). */
  manifest_en_geometrie: {
    bestanden_map: string;
    bestanden: Record<string, FileTag>;
    gemergde_set?: { bestanden?: Record<string, FileTag & { vervangt: string }> };
    ff_headers: Record<string, number>;
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
  } & Record<string, unknown>;
}

export function loadGolden1b(): GoldenRefs1b {
  return JSON.parse(readFileSync(GOLDEN1B_PATH, 'utf-8')) as GoldenRefs1b;
}

/**
 * Casus 1's stated-requirement readers, handed casus 1b's file. They read
 * `manifest_en_geometrie.gestelde_eisen` and `.driverkaart` and nothing else,
 * and casus 1b spells both blocks the way casus 1 does — so one reader per
 * requirement serves two casus files, and a requirement that moves in one file
 * cannot be read differently from the other.
 */
const asCasus1 = (g: GoldenRefs1b): GoldenRefs => g as unknown as GoldenRefs;

/**
 * The manifest, from the reference file's own tags. `'merged'` (default) takes
 * the M-1 merge of the mid in the place of its gated on-axis file, exactly as
 * casus 1's manifest does; `'gated'` is the 22-08-2026 session as measured.
 * The files live in casus 1's directory (`bestanden_map`).
 */
export function casus1bManifest(golden: GoldenRefs1b = loadGolden1b(), set: Casus1MeasurementSet = 'merged'): Manifest {
  const g = golden.manifest_en_geometrie;
  if (g.bestanden_map !== 'casus1') throw new Error(`casus 1b: bestanden_map is ${g.bestanden_map}; the loader reads casus 1's directory`);
  const merged = set === 'merged' ? (g.gemergde_set?.bestanden ?? {}) : {};
  const replacedBy = new Map<string, [string, FileTag]>();
  for (const [file, tag] of Object.entries(merged)) {
    if (!(tag.vervangt in g.bestanden)) throw new Error(`casus 1b gemergde_set: ${file} replaces ${tag.vervangt}, which the manifest does not list`);
    replacedBy.set(tag.vervangt, [file, tag]);
  }
  const entries: ManifestEntry[] = Object.entries(g.bestanden).map(([gatedFile, gatedTag]) => {
    const swap = replacedBy.get(gatedFile);
    const [file, tag] = swap ?? [gatedFile, gatedTag];
    const kind = tag.typ as MeasurementKind;
    const entry: ManifestEntry = { file, driver: tag.drv, kind };
    if (tag.hoek !== undefined) entry.angleDeg = tag.hoek;
    if (kind === 'NF') {
      const d = g.geometrie.D_inch[tag.drv];
      if (d !== undefined) entry.diameterInch = d;
    }
    return entry;
  });
  return { sessionId: set === 'merged' ? 'koan2951-2026-08-22-casus1b-M1-merge' : 'koan2951-2026-08-22-casus1b', entries };
}

/** The measurement files, read from casus 1's directory. */
export function casus1bFiles(manifest: Manifest): MeasurementFile[] {
  return manifest.entries.map(loadMeasurement);
}

/** The geometry of the two ways, from the reference file's own block. */
export function casus1bGeometry(golden: GoldenRefs1b = loadGolden1b()): Geometry {
  const g = golden.manifest_en_geometrie.geometrie;
  return {
    ctcMm: { [ctcKey('mid', 'tweeter')]: g.ctc_mm['mid_tweeter'] },
    ctcSource: { [ctcKey('mid', 'tweeter')]: 'casebook geometry (golden_refs_casus1b.json, from casus 1)' },
    waySources: {
      mid: [{ id: 'mid', zMm: g.z_offset_mm['mid'] }],
      tweeter: [{ id: 'tweeter', zMm: g.z_offset_mm['tweeter'] }],
    },
    zOffsetMm: { mid: g.z_offset_mm['mid'], tweeter: g.z_offset_mm['tweeter'] },
    rotationallySymmetric: {
      mid: g.rotatiesymmetrisch['mid'] ?? false,
      tweeter: g.rotatiesymmetrisch['tweeter'] ?? false,
    },
    ...(g.baffle_mm?.breedte !== undefined ? { baffleWidthMm: g.baffle_mm.breedte } : {}),
  };
}

/** A frozen casus-1b netlist (a file in `test-fixtures/casus1b/`), with the measured impedances. */
export function casus1bFilter(
  key: string,
  manifest: Manifest,
  files: readonly MeasurementFile[],
  golden: GoldenRefs1b = loadGolden1b(),
): FilterInput {
  const name = golden.manifest_en_geometrie.netlists[key];
  if (!name) {
    throw new Error(`casus 1b has no netlist called ${key}; the file lists ${Object.keys(golden.manifest_en_geometrie.netlists).join(', ')}`);
  }
  const parsed = deserializeFilter(readFileSync(join(CASUS1B_DIR, name), 'utf-8'));
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
 * The stated requirements, read once
 * ================================================================== */

const G1B = loadGolden1b();
const G1B_AS_1 = asCasus1(G1B);

/** The order the designer states on the one handover (casus 1's order, carried). */
export const CASUS1B_STATED_ORDER: number = (() => {
  const o = (G1B.kruisvensters.parameters as { orde?: unknown } | undefined)?.orde;
  if (typeof o !== 'number') throw new Error('casus 1b states no order (kruisvensters.parameters.orde)');
  return o;
})();
export const CASUS1B_AMP_MIN_LOAD_OHM: number | null = casus1AmpMinLoadOhm(G1B_AS_1);
export const CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER: Record<string, number> = casus1MaxDriveOnFsDbByDriver(G1B_AS_1);
export const CASUS1B_EXCURSION = casus1ExcursionSettings(G1B_AS_1);
export const CASUS1B_BUILDABILITY = casus1BuildabilitySettings(G1B_AS_1);
export const CASUS1B_BUILDABILITY_ON_SEARCH: boolean = casus1BuildabilityOnSearch(G1B_AS_1);
export const CASUS1B_CONTINUOUS_POWER_W: number | null = casus1ContinuousPowerW(G1B_AS_1);
export const CASUS1B_THERMAL_DESIGN_POWER_W: number | null = casus1ThermalDesignPowerW(G1B_AS_1);
export const CASUS1B_TARGET_CURVE: TargetCurve = casus1TargetCurve(G1B_AS_1);
export const CASUS1B_WIRING: Record<string, WayWiring> = casus1WiringByDriver(G1B_AS_1);
export const CASUS1B_MAX_CROSSING_HZ_BY_PAIR: Record<string, number> = casus1MaxCrossingHzByPair(G1B_AS_1);
export const CASUS1B_COIL_DCR: { model: CoilDcrModel | null; stated: boolean; missing: { way: string; family: string }[] } = casus1CoilDcrModel(G1B_AS_1);
export const CASUS1B_COIL_FAMILY_BY_DRIVER: Record<string, string> = casus1CoilFamilyByDriver(G1B_AS_1).familyByWay;
export const CASUS1B_COIL_DCR_SETTINGS: { coilDcrFamilyByDriver?: Record<string, string>; coilDcrFits?: readonly CoilDcrFit[] } =
  Object.keys(CASUS1B_COIL_FAMILY_BY_DRIVER).length > 0
    ? { coilDcrFamilyByDriver: { ...CASUS1B_COIL_FAMILY_BY_DRIVER }, coilDcrFits: casus1CoilDcrFits(G1B_AS_1).fits }
    : {};
export const CASUS1B_PEAK_INPUT_VOLTS: number | null =
  CASUS1B_EXCURSION.amplifierPeakPowerW !== undefined && CASUS1B_EXCURSION.amplifierNominalLoadOhm !== undefined
    ? peakInputVolts({ peakPowerW: CASUS1B_EXCURSION.amplifierPeakPowerW, nominalLoadOhm: CASUS1B_EXCURSION.amplifierNominalLoadOhm })
    : null;

/**
 * The report settings EVERY casus-1b measuring surface spreads — the V42 rule
 * (one definition, so the guards, the recorder, the generator and the live
 * reproduction cannot disagree about what the project stated).
 */
export const CASUS1B_REPORT_SETTINGS: ReportSettings = {
  ...(CASUS1B_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1B_CONTINUOUS_POWER_W } : {}),
  ...(Object.keys(CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0 ? { maxDriveOnFsDbByDriver: { ...CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER } } : {}),
  ...(Object.keys(CASUS1B_MAX_CROSSING_HZ_BY_PAIR).length > 0 ? { maxCrossingHzByPair: { ...CASUS1B_MAX_CROSSING_HZ_BY_PAIR } } : {}),
  ...CASUS1B_BUILDABILITY,
  ...(Object.keys(CASUS1B_WIRING).length > 0 ? { wiringByDriver: { ...CASUS1B_WIRING } } : {}),
  orderByPair: { [ctcKey('mid', 'tweeter')]: CASUS1B_STATED_ORDER },
  targetCurve: CASUS1B_TARGET_CURVE,
  ...CASUS1B_EXCURSION,
  ...CASUS1B_COIL_DCR_SETTINGS,
};

/** The casus-1b report on a frozen netlist, or on no netlist at all (the field needs none). */
export function casus1bReport(
  key: string | null,
  manifest: Manifest = casus1bManifest(G1B),
  files: readonly MeasurementFile[] = casus1bFiles(manifest),
  golden: GoldenRefs1b = G1B,
): EngineV2Report {
  return buildReport({
    manifest,
    files,
    filter: key === null ? null : casus1bFilter(key, manifest, files, golden),
    geometry: casus1bGeometry(golden),
    settings: CASUS1B_REPORT_SETTINGS,
  });
}

/* ================================================================== *
 * The chain grid and the judged band — derived, as casus 1's are
 * ================================================================== */

/** The resolution precedent (`f4b2_v2_worker_baseline.json`): 96 points over 200–20 000 Hz. */
const PRECEDENT_GRID_POINTS = 96;
const PRECEDENT_GRID_HZ: [number, number] = [200, 20000]; // P6-OK: the resolution precedent, not a band
const GRID_TOP_HZ = 20000; // P6-OK: the top of the audio band, as casus 1
const JUDGE_TOP_HZ = 19500; // P6-OK: the highest way's ceiling inside the grid, as casus 1
const SAFETY_GRID_POINTS = 240; // the app's own safety-grid resolution (`runVfOptimize`)

/**
 * WHERE THE BAND AND THE GRID START — casus 1's M-1 derivation, on casus 1b's
 * lowest way: the floor of the judged band is the higher of the lowest way's
 * validity floor and its f_p (here the mid's f_c: a closed pod rolls off on its
 * own below it), the grid starts at the validity floor and keeps the precedent
 * resolution. Read once from a report without a netlist — class A.
 */
const BAND_SOURCE = (() => {
  const report = casus1bReport(null);
  const lowest = report.driversLowToHigh[0];
  const d = report.ingest.drivers.find((x) => x.driver === lowest);
  if (!d?.onAxis) throw new Error(`casus 1b: the lowest way (${lowest}) has no on-axis band`);
  const validityFloorHz = d.onAxis.bandHz[0];
  const fpHz = d.impedance?.fundamentalHz ?? null;
  const floorHz = fpHz !== null ? Math.max(validityFloorHz, fpHz) : validityFloorHz;
  return { lowest, validityFloorHz, fpHz, floorHz, provenance: d.onAxis.bandFloorProvenance };
})();
const pointsPerOctave = PRECEDENT_GRID_POINTS / Math.log2(PRECEDENT_GRID_HZ[1] / PRECEDENT_GRID_HZ[0]);
export const CASUS1B_V2_GRID: number[] = logspace(
  BAND_SOURCE.validityFloorHz,
  GRID_TOP_HZ,
  Math.round(pointsPerOctave * Math.log2(GRID_TOP_HZ / BAND_SOURCE.validityFloorHz)),
);
export const CASUS1B_V2_BAND_HZ: [number, number] = [BAND_SOURCE.floorHz, JUDGE_TOP_HZ];
export const CASUS1B_V2_BAND_SOURCE = BAND_SOURCE;

/** The run seed — stated and recorded (A5e.4). */
export const CASUS1B_V2_SEED = 20260906;

/**
 * The two-way chain settings of a casus-1b run: the app's own two-way defaults
 * (`runVfOptimize`, the two-way branch), the stated floor in both of its homes,
 * and the source-resistance tiers UNSTATED exactly as casus 1 states them
 * (V34, P4). `eqBandsPerDriver` is the app's control default and the value the
 * candidate's chain declaration states (V41); it is here because
 * `ChainSettings` requires it, and the declaration overwrites it with the same
 * number on the route (`withDeclaredChainChoicesTwoWay`).
 */
export const CASUS1B_V2_SETTINGS: ChainSettings = {
  phasePriority: 0.5,
  eqBandsPerDriver: DEFAULT_EQ_BANDS_PER_DRIVER,
  synthMode: 'acoustic',
  band: CASUS1B_V2_BAND_HZ,
  targets: { rippleDb: 2.5, phaseDeg: 15 },
  breakupGuard: true,
  ampTarget: 'onAxis',
  phaseMetric: 'band',
  powerMetric: 'smooth',
  catalogSnap: false,
  cutOnly: true,
  dissipationWeight: 0.05,
  powerFoldWeight: 0.5,
  costWeight: 0.0015,
  directivityWeight: 0,
  audit: { thresholds: { rSourceOhm: null as unknown as number } },
  ...(CASUS1B_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS1B_AMP_MIN_LOAD_OHM } : {}),
};

/** The armed gates of a casus-1b run — spread at the use site (P4). */
export const CASUS1B_V2_GATES: {
  ampMinLoadOhm?: number;
  maxDriveOnFsDbByDriver?: Record<string, number>;
  peakInputVolts?: number;
  resistorClassW?: number;
  resistorPowerMargin?: number;
  resistorThermalPowerW?: number;
  coilClassA?: number;
} = {
  ...(CASUS1B_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS1B_AMP_MIN_LOAD_OHM } : {}),
  ...(Object.keys(CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0 ? { maxDriveOnFsDbByDriver: { ...CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER } } : {}),
  ...(CASUS1B_PEAK_INPUT_VOLTS !== null ? { peakInputVolts: CASUS1B_PEAK_INPUT_VOLTS } : {}),
  ...(CASUS1B_BUILDABILITY_ON_SEARCH ? { ...CASUS1B_BUILDABILITY } : {}),
};
/** No budget is carried to casus 1b: the two casus-1 budgets are woofer-bound (`niet_overgenomen`). */
export const CASUS1B_V2_BUDGETS: { lfBumpBudgetDb?: number; qesMultiplierMax?: number } = {};

/* ================================================================== *
 * The field, the declaration, the facts, the chain input
 * ================================================================== */

/** The library the two-way design step enumerates, restricted as casus 1 restricts it (LR only, stated). */
export const CASUS1B_FIELD_ALIGNMENTS = AUTO_STRUCTS.filter((a) => a.kind === 'LR');

/**
 * THE FIELD OF CASUS 1b — an EXPLORATION (E-2): the generator's centre-first
 * positions, one alignment per handover (the stated order), the exploration
 * chain budget. One pair, so the product is the pair's own positions. The
 * budget and the two policies travel in `field.parameters` and hence in the run
 * fingerprint.
 */
export function casus1bField(report: EngineV2Report): CandidateFieldResult {
  const wis = report.predesign.windowInputs;
  return buildCandidateField({
    windowInputs: wis,
    perPair: wis.map(() => ({ statedOrder: CASUS1B_STATED_ORDER })),
    alignments: CASUS1B_FIELD_ALIGNMENTS,
    ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: Math.max(1, wis.length) }),
  });
}

/** The single-part span of the LOWEST way's stated coil family, henry (A5e.3b) — null without a family. */
export const CASUS1B_LOWEST_WAY_COIL_SPAN_H: number | null = (() => {
  const m = CASUS1B_COIL_DCR.model;
  if (!m) return null;
  const fam = m.familyByWay[BAND_SOURCE.lowest];
  const fit = fam !== undefined ? m.fits[fam] : undefined;
  return fit ? fit.rangeH[1] : null;
})();

/**
 * The declaration that travels beside one casus-1b candidate — the two-way
 * shape of `casus1V2Declaration`: ONE cage, ONE window floor, and the chain
 * declaration with nothing stated (the app's EQ default and `synthesize`'s own
 * lean threshold derive, V41), no level-work rule (casus 1b states none, P4)
 * and the coil-span ceiling of the lowest way's stated family (A5e.3b).
 */
export function casus1bV2Declaration(
  c: GeneratedCandidate,
  safety?: { freqs: number[]; w: GriddedResponse; t: GriddedResponse; z: Record<string, Complex[]> },
) {
  const armCoilDcr = CASUS1B_COIL_DCR.stated;
  return {
    declaration: declareCandidateChoices({
      cages: c.crossings.map((x) => x.cageHz),
      /* U-5 — the one rule for the handover floor: its own window floor, or the
       * bottom of its cage for a STATED position below that floor. The identity
       * for every derived candidate (`windowFloorsFor`). */
      windowFloorsHz: windowFloorsFor(c),
      multiWay: true,
      stated: {
        band: CASUS1B_V2_BAND_HZ,
        staged: CASUS1B_V2_SETTINGS.targets,
        ampTarget: CASUS1B_V2_SETTINGS.ampTarget,
        powerMetric: CASUS1B_V2_SETTINGS.powerMetric,
        phaseMetric: CASUS1B_V2_SETTINGS.phaseMetric,
        catalogSnap: CASUS1B_V2_SETTINGS.catalogSnap,
        breakupGuard: CASUS1B_V2_SETTINGS.breakupGuard,
        audit: { thresholds: { rSourceOhm: null } },
        rSourceProbeSource: 'safety',
        ...(CASUS1B_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS1B_AMP_MIN_LOAD_OHM } : {}),
        ...(safety ? { safety } : {}),
        zFloorStrict: true,
      },
      targetCurve: CASUS1B_TARGET_CURVE,
      ...(Object.keys(CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0 ? { driveOnFsLimitDbByDriver: { ...CASUS1B_MAX_DRIVE_ON_FS_DB_BY_DRIVER } } : {}),
      ...(CASUS1B_EXCURSION.driverCardByDriver !== undefined && CASUS1B_EXCURSION.amplifierPeakPowerW !== undefined && CASUS1B_EXCURSION.xmaxMarginFraction !== undefined
        ? { driveCeilingDerived: true }
        : {}),
      ...(armCoilDcr && Object.keys(CASUS1B_COIL_FAMILY_BY_DRIVER).length > 0
        ? { coilDcrFamilyByWay: { ...CASUS1B_COIL_FAMILY_BY_DRIVER }, coilDcrFits: casus1CoilDcrFits(G1B_AS_1).fits, coilDcrCatalogLabel: casus1CoilDcrFits(G1B_AS_1).label }
        : {}),
    }),
    chainDeclaration: declareCandidateChainChoices({
      stated: {},
      ...(armCoilDcr && CASUS1B_LOWEST_WAY_COIL_SPAN_H !== null ? { lowestWayCoilSpanH: CASUS1B_LOWEST_WAY_COIL_SPAN_H } : {}),
    }),
    provenance: c.provenance,
    /* The HP flank of the tweeter belongs to the one handover; the mid (the
     * lowest way) has no high-pass flank of its own on a two-way. */
    orderByModel: { tweeter: c.crossings[c.crossings.length - 1].order },
  };
}

/** The measured facts across the border, the way the app sends them (`factsForWorker`). */
export function casus1bV2Facts(report: EngineV2Report, manifest: Manifest, files: readonly MeasurementFile[]): MeasurementFactsPayload {
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

/**
 * The two branch responses and the two impedances on the chain grid, and the
 * full-band SAFETY set over the drivers' whole measured extent — the two-way
 * shape of `casus1ChainInput`. The mid is the chain's `w` (its low way, keyed
 * `mid` in the impedance map: `canonicalModelForRole('low', false)`), the
 * tweeter its `t`.
 */
export function casus1bChainInput(
  manifest: Manifest,
  files: readonly MeasurementFile[],
  chainGrid: readonly number[] = CASUS1B_V2_GRID,
): {
  grid: readonly number[];
  w: GriddedResponse;
  t: GriddedResponse;
  driverZ: Record<string, Complex[]>;
  safety: { freqs: number[]; w: GriddedResponse; t: GriddedResponse; z: Record<string, Complex[]> };
} {
  const ingest = runIngest(manifest, files);
  const grid = chainGrid;
  const fullOf = (driver: string) => {
    const full = ingest.drivers.find((x) => x.driver === driver)?.onAxisFull;
    if (!full) throw new Error(`casus 1b has no on-axis sum for ${driver}`);
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
  const extents = ['mid', 'tweeter'].map((d) => {
    const full = fullOf(d);
    return [full.grid[0], full.grid[full.grid.length - 1]] as [number, number];
  });
  const sGrid = logspace(Math.min(...extents.map((e) => e[0])), Math.max(...extents.map((e) => e[1])), SAFETY_GRID_POINTS);
  const curve = (driver: string, g: readonly number[]) => {
    const full = fullOf(driver);
    return banded(g, { grid: full.grid, db: full.db, phaseDeg: full.phaseDeg });
  };
  return {
    grid,
    w: curve('mid', grid),
    t: curve('tweeter', grid),
    driverZ: zOn(grid),
    safety: { freqs: sGrid, w: curve('mid', sGrid), t: curve('tweeter', sGrid), z: zOn(sGrid) },
  };
}

/**
 * THE VIRTUAL-FILTER SEED of a casus-1b run — the app's own two-way defaults
 * (`defaultVFilters` in `App.tsx`, the woofer and tweeter halves), restated
 * here because the app's function lives inside a React component. The seed is
 * a STARTING POINT and nothing more: the design step enumerates the structure
 * (bound to the candidate's alignment), moves the knees inside the cage and
 * places its own EQ; what the seed decides is where that search starts, so it
 * is stated and recorded (A5e.4, the V27 rule that a run fixture runs the app's
 * own settings and not a minimal set).
 */
export function casus1bSeed(): ChainInput['seed'] {
  return {
    woofer: {
      gainDb: 0,
      hp: defaultHpLp(200),
      lp: { ...defaultHpLp(2000), kind: 'LR' as const, order: 4 as const },
      eq: [defaultEq(1000, 0, 1), defaultEq(4000, 0, 1)],
    },
    tweeter: {
      gainDb: 0,
      hp: { ...defaultHpLp(2900), kind: 'LR' as const, order: 2 as const },
      lp: defaultHpLp(20000),
      eq: [defaultEq(6500, -10, 0.5), defaultEq(10000, 0, 1)],
    },
  };
}

/** The ChainInput of one casus-1b candidate, as the generator and the live reproduction build it. */
export function casus1bChainInputFor(
  c: GeneratedCandidate,
  gridded: ReturnType<typeof casus1bChainInput>,
  seed: ChainInput['seed'],
): ChainInput {
  const x = c.crossings[0];
  return {
    grid: [...gridded.grid],
    w: gridded.w,
    t: gridded.t,
    driverZ: gridded.driverZ,
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    seed,
    settings: {
      ...CASUS1B_V2_SETTINGS,
      safety: gridded.safety,
      /* The candidate's alignment binds the design step's structure enumeration
       * (V26 row 39 on the two-way chain: `structurePreference` is the
       * BINDING choice of `vfOptimizer`). */
      structurePreference: { kind: x.alignment.kind as 'LR' | 'BW' | 'BS', order: x.alignment.order as 1 | 2 | 3 | 4 },
    },
    /* The candidate's CAGE is the acoustic-crossing pin of this chain, and the
     * window it is judged against (a cage is bookkeeping, a window a promise;
     * the exploration's cage is one spacing wide, `candidates.ts`). */
    xoRange: [x.cageHz[0], x.cageHz[1]],
    judgeWindow: { floorHz: x.windowHz[0], ceilHz: x.windowHz[1] },
  };
}
