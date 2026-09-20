/**
 * CASUS 1h — KOAN 2951 AS A HYBRID: the woofer pair ACTIVE, mid and tweeter
 * PASSIVE (H-1, 17-09-2026).
 *
 * WHY IT EXISTS. Sander is putting the woofers on their own amplifier (Hypex
 * FA251) and keeping mid and tweeter passive. The mid then becomes the LOWEST
 * PASSIVE way and needs a high-pass towards the active side. That is a shape
 * this casebook did not have: the sum that judges a design contains a branch
 * that is not in the netlist. Every quantity that judges a SUM has to see it;
 * every ELECTRICAL quantity must not, because the main amplifier does not drive
 * it. Casus 1h is casus 1's measurements on a different split, so that a
 * difference between hybrid and fully passive is a ROUTE difference and not a
 * data difference — the rule casus 1b was built on.
 *
 * WHAT IT SHARES WITH CASUS 1, AND HOW. The measurement FILES are casus 1's,
 * read through casus 1's own manifest at the `'koan677'` set (a copy of a
 * measurement is a second file that can drift, I-2). The STATED REQUIREMENTS
 * are read through casus 1's own reader functions, handed casus 1h's reference
 * file: those readers only look at `manifest_en_geometrie.gestelde_eisen` and
 * `.driverkaart`, which casus 1h spells the same way — one reader per
 * requirement, three casus files.
 *
 * WHY `'koan677'` AND NOT THE `'m3'` STANDARD: the whole point of casus 1h is a
 * comparison against the LIVING casus-1 corpus, and that was raised on koan677.
 * Two halves through two measurement sets is not a comparison. What it costs is
 * known and measured; `manifest_en_geometrie.meetset_niet_m3` says it.
 *
 * IT READS FROM DISK, so it is only ever imported from tests and `scripts/`
 * (`browserSafe.test.ts` exempts `*.fixture.ts`; `toggleRegression.test.ts`
 * pins that nothing in the bundle imports one).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ActiveHandover, ModelBranchSettings } from '../activeSide.ts';
import { logspace, resample, resampleImpedance, type GriddedResponse } from '../dsp.ts';
import type { Complex } from '../complex.ts';
import type { ChainInput, ChainSettings } from '../designChain.ts';
import { defaultEq, defaultHpLp } from '../filters.ts';
import { AUTO_STRUCTS } from '../threeWayDesign.ts';
import { DEFAULT_EQ_BANDS_PER_DRIVER } from '../vfOptimizer.ts';
import { chainGridFrom, judgedBandFloor } from './predesign/judgedBand.ts';
import { runIngest } from './ingest/derive.ts';
import { buildCandidateField, type CandidateFieldResult } from './predesign/candidateField.ts';
import { windowFloorsFor } from './optimizer/scanRequest.ts';
import { fieldModeSettings } from './predesign/fieldMode.ts';
import type { GeneratedCandidate } from './predesign/candidates.ts';
import { statedInvertedForTwoWay, type PolarityArmPolicy } from './predesign/polarityArms.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './optimizer/candidateDeclaration.ts';
import { factsForWorker, type MeasurementFactsPayload } from './optimizer/measurementFacts.ts';
import { SILENT_GHOST_DB } from './casus1V2.fixture.ts';
import type { FilterKind } from '../filters.ts';
import { deserializeFilter } from '../filterFile.ts';
import { crossoverToNetlist } from '../vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../parsers/vxp.ts';
import type { WayWiring } from './ingest/wiring.ts';
import type { MeasurementFile } from './ingest/derive.ts';
import type { Manifest } from './ingest/manifest.ts';
import { buildReport, type EngineV2Report, type FilterInput, type ReportSettings } from './report.ts';
import { ctcKey, type Geometry } from './metrics/types.ts';
import { peakInputVolts } from './metrics/driveExcursion.ts';
import type { TargetCurve } from './requirements/targetCurve.ts';
import type { CoilDcrFit, CoilDcrModel } from '../coilDcr.ts';
import {
  casus1AmpMinLoadOhm,
  casus1BreakupDivisors,
  casus1BuildabilityOnSearch,
  casus1BuildabilitySettings,
  casus1CoilDcrFits,
  casus1CoilDcrModel,
  casus1CoilFamilyByDriver,
  casus1ContinuousPowerW,
  casus1ExcursionSettings,
  casus1Files,
  casus1Manifest,
  casus1MaxCrossingHzByPair,
  casus1MaxCrossovers,
  casus1MaxDriveOnFsDbByDriver,
  casus1MinCrossovers,
  casus1QesMultiplierMax,
  casus1RippleStopFromLowestCrossing,
  casus1TargetCurve,
  casus1ThermalDesignPowerW,
  casus1WiringByDriver,
  loadGolden,
  type Casus1MeasurementSet,
  type GoldenRefs,
} from './casus1.fixture.ts';

export const CASUS1H_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-fixtures', 'casus1h');
export const GOLDEN1H_PATH = join(CASUS1H_DIR, 'golden_refs_casus1h.json');

/** The casus-1h reference file. Loosely typed for the same reason casus 1b's is. */
export interface GoldenRefs1h {
  casus: string;
  toleranties: GoldenRefs['toleranties'];
  afgeleide_parameters: Record<string, Record<string, unknown>>;
  verankerde_gaps_dB: Record<string, unknown>;
  kruisvensters: Record<string, Record<string, unknown>>;
  kandidaten: Record<string, Record<string, unknown>>;
  manifest_en_geometrie: {
    bestanden_map: string;
    meetset: string;
    geometrie: {
      D_inch: Record<string, number>;
      z_offset_mm: Record<string, number>;
      ctc_mm: Record<string, number>;
      baffle_mm?: { breedte: number; hoogte: number };
      rotatiesymmetrisch: Record<string, boolean>;
    };
    netlists: Record<string, string>;
    actieve_zijde: Record<string, unknown>;
    gestelde_eisen: Record<string, unknown>;
    driverkaart: Record<string, unknown>;
  } & Record<string, unknown>;
}

export function loadGolden1h(): GoldenRefs1h {
  return JSON.parse(readFileSync(GOLDEN1H_PATH, 'utf-8')) as GoldenRefs1h;
}

/** Casus 1's stated-requirement readers, handed casus 1h's file (see casus 1b). */
const asCasus1 = (g: GoldenRefs1h): GoldenRefs => g as unknown as GoldenRefs;

const G1H = loadGolden1h();
const G1H_AS_1 = asCasus1(G1H);

/** The measurement set casus 1h reads, from its own manifest block — never typed. */
export const CASUS1H_SET: Casus1MeasurementSet = (() => {
  const s = G1H.manifest_en_geometrie.meetset;
  if (s !== 'm3' && s !== 'koan677' && s !== 'merged' && s !== 'gated') {
    throw new Error(`casus 1h: unknown measurement set "${s}"`);
  }
  return s;
})();

/**
 * The manifest — casus 1's own, at casus 1h's stated set.
 *
 * ALL THREE WAYS, and the woofer is in it on purpose: its MEASUREMENT feeds the
 * modelled active branch and its card feeds the weakest-link reading. What makes
 * it active is that no netlist of casus 1h holds an element for it.
 */
export function casus1hManifest(golden1: GoldenRefs = loadGolden()): Manifest {
  return casus1Manifest(golden1, CASUS1H_SET);
}

export function casus1hFiles(manifest: Manifest, golden1: GoldenRefs = loadGolden()): MeasurementFile[] {
  return casus1Files(manifest, golden1);
}

/** THE STATED HANDOVER TO THE ACTIVE SIDE — read from the manifest, never typed. */
export const CASUS1H_ACTIVE: ActiveHandover & { positionsHz: number[] } = (() => {
  const a = G1H.manifest_en_geometrie.actieve_zijde;
  const shape = a.doelvorm as { kind?: unknown; orde?: unknown } | undefined;
  const kind = shape?.kind;
  const order = shape?.orde;
  const active = a.actieve_weg;
  const passive = a.passieve_weg;
  const statedBy = a.gesteld_door;
  const positions = a.posities_hz;
  if (typeof active !== 'string' || typeof passive !== 'string') {
    throw new Error('casus 1h: actieve_zijde names no active/passive way');
  }
  if (kind !== 'LR' && kind !== 'BW' && kind !== 'BS') throw new Error(`casus 1h: unknown target shape "${String(kind)}"`);
  if (order !== 1 && order !== 2 && order !== 3 && order !== 4) throw new Error('casus 1h: actieve_zijde states no usable order');
  if (typeof statedBy !== 'string' || statedBy.length === 0) throw new Error('casus 1h: actieve_zijde has no attribution');
  if (!Array.isArray(positions) || positions.length === 0 || positions.some((p) => typeof p !== 'number' || !(p > 0))) {
    throw new Error('casus 1h: actieve_zijde states no usable positions');
  }
  return {
    passiveWay: passive,
    activeWay: active,
    /* The candidate positions are the handovers; `hz` on the stated block is the
     * one a report without a candidate is read at — the FIRST stated position,
     * so the pre-design reading is a stated number and never an invented one. */
    hz: positions[0] as number,
    kind: kind as FilterKind,
    order: order as 1 | 2 | 3 | 4,
    statedBy,
    positionsHz: [...(positions as number[])],
  };
})();

/** The ways the PASSIVE network holds, low to high — derived from the stated block. */
export const ACTIVE_WAY: string = CASUS1H_ACTIVE.activeWay;
export const PASSIVE_LOWEST_WAY: string = CASUS1H_ACTIVE.passiveWay;

/** The geometry of all three ways — casus 1's, from casus 1h's own block. */
export function casus1hGeometry(golden: GoldenRefs1h = G1H): Geometry {
  const g = golden.manifest_en_geometrie.geometrie;
  const z = g.z_offset_mm;
  return {
    ctcMm: {
      [ctcKey('woofer', 'mid')]: g.ctc_mm['woofer_mid'],
      [ctcKey('mid', 'tweeter')]: g.ctc_mm['mid_tweeter'],
    },
    ctcSource: {
      [ctcKey('woofer', 'mid')]: 'casebook geometry (golden_refs_casus1h.json, from casus 1)',
      [ctcKey('mid', 'tweeter')]: 'casebook geometry (golden_refs_casus1h.json, from casus 1)',
    },
    /* The two woofers are one WAY measured as one source; their own spacing is
     * still a real source separation (V20) and travels as an array spacing. */
    arraySpacingMm: { woofer: g.ctc_mm['woofer_woofer'] },
    waySources: {
      woofer: [
        { id: 'woofer boven', zMm: z['woofer_boven'] },
        { id: 'woofer onder', zMm: z['woofer_onder'] },
      ],
      mid: [{ id: 'mid', zMm: z['mid'] }],
      tweeter: [{ id: 'tweeter', zMm: z['tweeter'] }],
    },
    /* THE ACTIVE WAY NEEDS ITS ACOUSTIC CENTRE LIKE ANY OTHER, and this is
     * where forgetting it shows: without it M-F-final refuses to synthesise at
     * all ("acoustic-centre offsets are missing — woofer"), and the lobing dip
     * is decision column TWO of this session. That it is not in the netlist
     * changes nothing about where it radiates from. The pair's centre is the
     * midpoint of the two, exactly as casus 1 takes it. */
    zOffsetMm: {
      woofer: (z['woofer_boven'] + z['woofer_onder']) / 2,
      mid: z['mid'],
      tweeter: z['tweeter'],
    },
    rotationallySymmetric: {
      mid: g.rotatiesymmetrisch['mid'] ?? false,
      tweeter: g.rotatiesymmetrisch['tweeter'] ?? false,
      woofer: false,
    },
    ...(g.baffle_mm?.breedte !== undefined ? { baffleWidthMm: g.baffle_mm.breedte } : {}),
  };
}

/* ================================================================== *
 * The stated requirements, read once through casus 1's readers
 * ================================================================== */

export const CASUS1H_AMP_MIN_LOAD_OHM: number | null = casus1AmpMinLoadOhm(G1H_AS_1);
export const CASUS1H_MAX_DRIVE_ON_FS_DB_BY_DRIVER: Record<string, number> = casus1MaxDriveOnFsDbByDriver(G1H_AS_1);
export const CASUS1H_EXCURSION = casus1ExcursionSettings(G1H_AS_1);
export const CASUS1H_BUILDABILITY = casus1BuildabilitySettings(G1H_AS_1);
export const CASUS1H_BUILDABILITY_ON_SEARCH: boolean = casus1BuildabilityOnSearch(G1H_AS_1);
export const CASUS1H_CONTINUOUS_POWER_W: number | null = casus1ContinuousPowerW(G1H_AS_1);
export const CASUS1H_THERMAL_DESIGN_POWER_W: number | null = casus1ThermalDesignPowerW(G1H_AS_1);
export const CASUS1H_TARGET_CURVE: TargetCurve = casus1TargetCurve(G1H_AS_1);
export const CASUS1H_WIRING: Record<string, WayWiring> = casus1WiringByDriver(G1H_AS_1);
export const CASUS1H_MAX_CROSSING_HZ_BY_PAIR: Record<string, number> = casus1MaxCrossingHzByPair(G1H_AS_1);
export const CASUS1H_QES_MULTIPLIER_MAX: number | null = casus1QesMultiplierMax(G1H_AS_1);
export const CASUS1H_COIL_DCR: { model: CoilDcrModel | null; stated: boolean; missing: { way: string; family: string }[] } =
  casus1CoilDcrModel(G1H_AS_1);
export const CASUS1H_COIL_FAMILY_BY_DRIVER: Record<string, string> = casus1CoilFamilyByDriver(G1H_AS_1).familyByWay;
export const CASUS1H_COIL_DCR_SETTINGS: { coilDcrFamilyByDriver?: Record<string, string>; coilDcrFits?: readonly CoilDcrFit[] } =
  Object.keys(CASUS1H_COIL_FAMILY_BY_DRIVER).length > 0
    ? { coilDcrFamilyByDriver: { ...CASUS1H_COIL_FAMILY_BY_DRIVER }, coilDcrFits: casus1CoilDcrFits(G1H_AS_1).fits }
    : {};
export const CASUS1H_PEAK_INPUT_VOLTS: number | null =
  CASUS1H_EXCURSION.amplifierPeakPowerW !== undefined && CASUS1H_EXCURSION.amplifierNominalLoadOhm !== undefined
    ? peakInputVolts({ peakPowerW: CASUS1H_EXCURSION.amplifierPeakPowerW, nominalLoadOhm: CASUS1H_EXCURSION.amplifierNominalLoadOhm })
    : null;

/** The stated order on BOTH handovers — casus 1h states one shape for the whole design. */
export const CASUS1H_STATED_ORDER: number = CASUS1H_ACTIVE.order;

/**
 * The report settings EVERY casus-1h measuring surface spreads (the V42 rule).
 * `activeHandover` is what makes the report see a branch that is not in the
 * netlist; without it this is an ordinary three-way report on a two-way netlist.
 */
export const CASUS1H_REPORT_SETTINGS: ReportSettings = {
  ...(CASUS1H_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1H_CONTINUOUS_POWER_W } : {}),
  ...(Object.keys(CASUS1H_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
    ? { maxDriveOnFsDbByDriver: { ...CASUS1H_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
    : {}),
  ...(Object.keys(CASUS1H_MAX_CROSSING_HZ_BY_PAIR).length > 0 ? { maxCrossingHzByPair: { ...CASUS1H_MAX_CROSSING_HZ_BY_PAIR } } : {}),
  ...CASUS1H_BUILDABILITY,
  ...(Object.keys(CASUS1H_WIRING).length > 0 ? { wiringByDriver: { ...CASUS1H_WIRING } } : {}),
  orderByPair: {
    [ctcKey('woofer', 'mid')]: CASUS1H_STATED_ORDER,
    [ctcKey('mid', 'tweeter')]: CASUS1H_STATED_ORDER,
  },
  driverMinCrossoverByDriver: casus1MinCrossovers(G1H_AS_1),
  driverMaxCrossoverByDriver: casus1MaxCrossovers(G1H_AS_1),
  driverBreakupDivisorByDriver: casus1BreakupDivisors(G1H_AS_1),
  targetCurve: CASUS1H_TARGET_CURVE,
  /**
   * The vertical observation window the lobing SYNTHESIS (M-F-final) is
   * measured over, degrees — casus 1's own ±15° (`casus1Corpora.fixture.ts`),
   * carried so that the lobing column of the decision table is measured the
   * same way on both halves of the comparison. Without a window the synthesis
   * is OFF and the report says so; a setting and never a limit (P4).
   *
   * ON A HYBRID IT IS DECISION COLUMN TWO. The active handover sits between a
   * PAIR of woofers and one mid, and how far apart those sit decides where the
   * vertical sum starts to fall apart — which is exactly the question "at which
   * frequency do we hand over" has to answer.
   */
  verticalWindowDeg: [-15, 15],
  ...CASUS1H_EXCURSION,
  ...CASUS1H_COIL_DCR_SETTINGS,
  activeHandover: CASUS1H_ACTIVE,
};

/** A frozen casus-1h netlist (a file in `test-fixtures/casus1h/`), with the measured impedances. */
export function casus1hFilter(
  key: string,
  manifest: Manifest,
  files: readonly MeasurementFile[],
  golden: GoldenRefs1h = G1H,
): FilterInput {
  const name = golden.manifest_en_geometrie.netlists[key];
  if (!name) {
    throw new Error(
      `casus 1h has no netlist called ${key}; the file lists ${Object.keys(golden.manifest_en_geometrie.netlists).join(', ') || '(none yet)'}`,
    );
  }
  const parsed = deserializeFilter(readFileSync(join(CASUS1H_DIR, name), 'utf-8'));
  const { netlist } = crossoverToNetlist({ name, parts: [...parsed.parts] } as VxpCrossover);
  const driverZ: FilterInput['driverZ'] = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (f?.impedance) driverZ[e.driver] = { freq: f.impedance.freq, magnitude: f.impedance.magnitude, phaseDeg: f.impedance.phaseDeg };
  }
  return { name, netlist, driverZ };
}

/** The casus-1h report on a frozen netlist, or on no netlist at all. */
export function casus1hReport(
  key: string | null,
  manifest: Manifest = casus1hManifest(),
  files: readonly MeasurementFile[] = casus1hFiles(manifest),
  golden: GoldenRefs1h = G1H,
  settings: ReportSettings = CASUS1H_REPORT_SETTINGS,
): EngineV2Report {
  return buildReport({
    manifest,
    files,
    filter: key === null ? null : casus1hFilter(key, manifest, files, golden),
    geometry: casus1hGeometry(golden),
    settings,
  });
}

/**
 * H-1 — the project's own MERGE-FIT UNCERTAINTY, degrees, from its one home.
 *
 * Read and never typed (P6): the DSP target block turns it into the margin
 * below which a chosen polarity is decided by the merge fit rather than by the
 * loudspeaker. Null when the project states none, and then the block reports
 * the margin and judges it not at all (P4).
 */
export const CASUS1H_MERGE_FIT_UNCERTAINTY_DEG: number | null = (() => {
  const b = (G1H.manifest_en_geometrie as unknown as { merge_fit_onzekerheid?: { graden?: unknown } }).merge_fit_onzekerheid;
  const v = b?.graden;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
})();

/** The ripple stop band of a casus-1h run, from the stated margin (E-5b). */
export const CASUS1H_RIPPLE_STOP = casus1RippleStopFromLowestCrossing(G1H_AS_1);

/* ================================================================== *
 * One handover position at a time
 * ================================================================== */

/** The report settings of casus 1h with the active handover at a STATED position. */
export function casus1hSettingsAt(hz: number): ReportSettings {
  return { ...CASUS1H_REPORT_SETTINGS, activeHandover: { ...CASUS1H_ACTIVE, hz } };
}

/**
 * THE ACTIVE SIDE AT ONE STATED POSITION — the stated block and the three DSP
 * settings derived for it.
 *
 * Read off a report WITHOUT a netlist, which is the whole point: the derivation
 * is class A (measurements plus the stated shape), so it is the same answer for
 * every candidate at that position and no search can move it. One
 * implementation — `report.ts` — and every reader here goes through it.
 */
export function casus1hActiveAt(
  hz: number,
  manifest: Manifest = casus1hManifest(),
  files: readonly MeasurementFile[] = casus1hFiles(manifest),
): { handover: ActiveHandover; settings: ModelBranchSettings; report: EngineV2Report } {
  const report = casus1hReport(null, manifest, files, G1H, casus1hSettingsAt(hz));
  const a = report.activeSide;
  if (!a || !a.settings) {
    throw new Error(
      `casus 1h: the active side at ${hz} Hz could not be derived: ${a ? a.off.join('; ') : 'no stated block'}`,
    );
  }
  return { handover: a.stated, settings: a.settings, report };
}

/**
 * H-1 — THE REPORT ON A DELIVERED SET OF PARTS, at a stated handover.
 *
 * What it is FOR: the DSP gain a designer types in is a property of the network
 * that was built, not of the ideal the handover states — a real high-pass
 * ladder into a real driver impedance is lossy where an ideal filter is not,
 * and H-1 measured 2.3 to 3.2 dB of it. The report levels the modelled branch
 * against the delivered passive branch and publishes that gain; this is how the
 * generator asks it, straight off the parts, without writing a file first.
 *
 * WHAT IT IS NOT: a second pass. H-1 tried that — fix the gain, run, re-fit,
 * run again — and it did not converge (pass 1 asked -0.66 dB, its network asked
 * -3.87, pass 2's network asked -5.69), because the tuner absorbs part of any
 * level error into the passive branches. The level match belongs INSIDE the
 * evaluation, and since then it is there (`levelMatchDb`); this function only
 * READS the answer off a finished design.
 */
export function casus1hDeliveredReport(
  hz: number,
  parts: readonly VxpPart[],
  manifest: Manifest = casus1hManifest(),
  files: readonly MeasurementFile[] = casus1hFiles(manifest),
): EngineV2Report {
  const { netlist } = crossoverToNetlist({ name: 'casus1h-pass1', parts: [...parts] } as VxpCrossover);
  const driverZ: FilterInput['driverZ'] = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (f?.impedance) driverZ[e.driver] = { freq: f.impedance.freq, magnitude: f.impedance.magnitude, phaseDeg: f.impedance.phaseDeg };
  }
  const report = buildReport({
    manifest,
    files,
    filter: { name: 'casus1h-pass1', netlist, driverZ },
    geometry: casus1hGeometry(G1H),
    settings: casus1hSettingsAt(hz),
  });
  return report;
}

/* ================================================================== *
 * The chain grid and the judged band — derived, as casus 1's are
 * ================================================================== */

const GRID_TOP_HZ = 20000; // P6-OK: the top of the audio band, as casus 1
const JUDGE_TOP_HZ = 19500; // P6-OK: the highest way's ceiling inside the grid, as casus 1
const SAFETY_GRID_POINTS = 240; // the app's own safety-grid resolution (`runVfOptimize`)

/**
 * WHERE THE BAND AND THE GRID START on a hybrid.
 *
 * The same E-5 rule, on the ACTIVE way: it is the lowest way of the system, so
 * its validity floor starts the grid and the higher of that and its f_p starts
 * the judged band. That it is not in the netlist changes nothing about where
 * the loudspeaker plays — which is exactly the point of modelling it.
 */
const BAND_SOURCE = (() => {
  const report = casus1hReport(null);
  const f = judgedBandFloor(report);
  if (f === null) throw new Error('casus 1h: the lowest way has no on-axis band');
  return f;
})();
export const CASUS1H_V2_GRID: number[] = chainGridFrom(BAND_SOURCE.validityFloorHz, GRID_TOP_HZ);
export const CASUS1H_V2_BAND_HZ: [number, number] = [BAND_SOURCE.floorHz, JUDGE_TOP_HZ];
export const CASUS1H_V2_BAND_SOURCE = BAND_SOURCE;

/** The run seed — stated and recorded (A5e.4). */
export const CASUS1H_V2_SEED = 20260917;

/** The armed gates of a casus-1h run — spread at the use site (P4). */
export const CASUS1H_V2_GATES: {
  ampMinLoadOhm?: number;
  maxDriveOnFsDbByDriver?: Record<string, number>;
  peakInputVolts?: number;
  resistorClassW?: number;
  resistorPowerMargin?: number;
  resistorThermalPowerW?: number;
  coilClassA?: number;
} = {
  ...(CASUS1H_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS1H_AMP_MIN_LOAD_OHM } : {}),
  ...(Object.keys(CASUS1H_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
    ? { maxDriveOnFsDbByDriver: { ...CASUS1H_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
    : {}),
  ...(CASUS1H_PEAK_INPUT_VOLTS !== null ? { peakInputVolts: CASUS1H_PEAK_INPUT_VOLTS } : {}),
  ...(CASUS1H_BUILDABILITY_ON_SEARCH ? { ...CASUS1H_BUILDABILITY } : {}),
};

/**
 * The armed BUDGETS of a casus-1h run.
 *
 * M-D IS NOT HERE, and its absence is the measured half of this casus: the
 * LF-lift budget bounds what the REACTANCES of the passive filter may do to the
 * woofer pair's upper reflex peak, and on a hybrid there is no passive series
 * inductance between the amplifier and that pair at all. The quantity the
 * requirement bounds does not exist here. Q_es IS here, stated on the mid —
 * see `gestelde_eisen.qes_vermenigvuldiging_max_gesteld_door` for why that
 * differs from casus 1b.
 */
export const CASUS1H_V2_BUDGETS: { lfBumpBudgetDb?: number; qesMultiplierMax?: number } = {
  ...(CASUS1H_QES_MULTIPLIER_MAX !== null ? { qesMultiplierMax: CASUS1H_QES_MULTIPLIER_MAX } : {}),
};

/** The library the design step enumerates, as casus 1 restricts it (LR only, stated). */
export const CASUS1H_FIELD_ALIGNMENTS = AUTO_STRUCTS.filter((a) => a.kind === 'LR');

/** The two-way chain settings of a casus-1h run — casus 1b's, at casus 1h's band. */
export const CASUS1H_V2_SETTINGS: ChainSettings = {
  phasePriority: 0.5,
  eqBandsPerDriver: DEFAULT_EQ_BANDS_PER_DRIVER,
  synthMode: 'acoustic',
  band: CASUS1H_V2_BAND_HZ,
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
  ...(CASUS1H_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS1H_AMP_MIN_LOAD_OHM } : {}),
};

/** The single-part span of the LOWEST PASSIVE way's coil family (A5e.3b). */
export const CASUS1H_LOWEST_WAY_COIL_SPAN_H: number | null = (() => {
  const m = CASUS1H_COIL_DCR.model;
  if (!m) return null;
  const fam = m.familyByWay[PASSIVE_LOWEST_WAY];
  const fit = fam !== undefined ? m.fits[fam] : undefined;
  return fit ? fit.rangeH[1] : null;
})();

/**
 * THE FIELD OF CASUS 1h — an EXPLORATION over the ONE PASSIVE handover.
 *
 * The active handover is not in the field and cannot be: it is STATED, the
 * active side realises it in a processor, and a search that moved it would be
 * searching a filter this app does not program. What the field holds is the
 * mid→tweeter positions; the four stated active handovers are four RUNS of this
 * field, and the generator loops over them.
 */
export function casus1hField(
  report: EngineV2Report,
  /**
   * H-4 — THE POLARITY ARMS, when a caller asks for them.
   *
   * ABSENT IS THE IDENTITY and that is the whole of the parameter: no candidate
   * carries a polarity, the design step enumerates it as it always has, every
   * label is what it was, and `candidateFieldKey` — and therefore the recorded
   * run fingerprint of every corpus in this casus book — reproduces byte for
   * byte. Only `measure-h4-polarity.ts` passes one, because only a measurement
   * of both arms needs both arms; a regeneration that wants them states it.
   */
  polarityArms?: PolarityArmPolicy,
): CandidateFieldResult {
  /* The passive pair is the LAST window: the report's windows are in
   * `driversLowToHigh` order, and the first is woofer→mid — the handover the
   * active side owns. Read off the ORDER rather than by name (N-way agnostic).
   *
   * H-4 — AND THIS IS WHY NO POLARITY ARM CAN EVER BE SEEDED FOR THE ACTIVE
   * HANDOVER. It is not in the field, so the expansion never sees it: the
   * decision that the active side's polarity is class A (H-1, settled by the
   * cabinet's reversed-polarity null and not by this data) holds by
   * construction rather than by a rule somebody has to remember. */
  const wis = report.predesign.windowInputs.filter((w) => w.lower !== ACTIVE_WAY);
  return buildCandidateField({
    windowInputs: wis,
    perPair: wis.map(() => ({ statedOrder: CASUS1H_STATED_ORDER })),
    alignments: CASUS1H_FIELD_ALIGNMENTS,
    ...fieldModeSettings('exploration', { stepsPerAxis: 2, pairs: Math.max(1, wis.length) }),
    ...(polarityArms ? { polarityArms } : {}),
  });
}

/**
 * The declaration that travels beside one casus-1h candidate.
 *
 * Casus 1b's two-way shape, plus the SEVENTH chain key: the stated active
 * handover and the DSP settings derived for it. Both halves come from
 * `casus1hActiveAt`, so the value the chain states and the value the report
 * publishes are one object and not two derivations.
 */
export function casus1hV2Declaration(
  c: GeneratedCandidate,
  active: { handover: ActiveHandover; settings: ModelBranchSettings },
  safety?: { freqs: number[]; w: GriddedResponse; t: GriddedResponse; z: Record<string, Complex[]> },
) {
  const armCoilDcr = CASUS1H_COIL_DCR.stated;
  return {
    declaration: declareCandidateChoices({
      cages: c.crossings.map((x) => x.cageHz),
      windowFloorsHz: windowFloorsFor(c),
      multiWay: true,
      stated: {
        band: CASUS1H_V2_BAND_HZ,
        staged: CASUS1H_V2_SETTINGS.targets,
        ampTarget: CASUS1H_V2_SETTINGS.ampTarget,
        powerMetric: CASUS1H_V2_SETTINGS.powerMetric,
        phaseMetric: CASUS1H_V2_SETTINGS.phaseMetric,
        catalogSnap: CASUS1H_V2_SETTINGS.catalogSnap,
        breakupGuard: CASUS1H_V2_SETTINGS.breakupGuard,
        audit: { thresholds: { rSourceOhm: null } },
        rSourceProbeSource: 'safety',
        ...(CASUS1H_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS1H_AMP_MIN_LOAD_OHM } : {}),
        ...(safety ? { safety } : {}),
        zFloorStrict: true,
      },
      targetCurve: CASUS1H_TARGET_CURVE,
      ...(Object.keys(CASUS1H_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
        ? { driveOnFsLimitDbByDriver: { ...CASUS1H_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
        : {}),
      ...(CASUS1H_EXCURSION.driverCardByDriver !== undefined &&
      CASUS1H_EXCURSION.amplifierPeakPowerW !== undefined &&
      CASUS1H_EXCURSION.xmaxMarginFraction !== undefined
        ? { driveCeilingDerived: true }
        : {}),
      ...(armCoilDcr && Object.keys(CASUS1H_COIL_FAMILY_BY_DRIVER).length > 0
        ? {
            coilDcrFamilyByWay: { ...CASUS1H_COIL_FAMILY_BY_DRIVER },
            coilDcrFits: casus1CoilDcrFits(G1H_AS_1).fits,
            coilDcrCatalogLabel: casus1CoilDcrFits(G1H_AS_1).label,
          }
        : {}),
    }),
    chainDeclaration: declareCandidateChainChoices({
      stated: {},
      ...(armCoilDcr && CASUS1H_LOWEST_WAY_COIL_SPAN_H !== null
        ? { lowestWayCoilSpanH: CASUS1H_LOWEST_WAY_COIL_SPAN_H }
        : {}),
      activeSide: active,
    }),
    provenance: c.provenance,
    /* The HP flank of the TWEETER belongs to the passive handover; the mid's
     * own high-pass belongs to the ACTIVE one and carries the stated order. */
    orderByModel: { tweeter: c.crossings[c.crossings.length - 1].order, mid: active.handover.order },
  };
}

/** The measured facts across the border, the way the app sends them. */
export function casus1hV2Facts(
  report: EngineV2Report,
  manifest: Manifest,
  files: readonly MeasurementFile[],
): MeasurementFactsPayload {
  const modelByDriverId: Record<string, string> = {};
  /* The chain's own vocabulary: its low slot is `mid` and its high slot
   * `tweeter` (`canonicalModelForRole`), and the ACTIVE way keeps its own name
   * because no branch of the netlist carries it. */
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
 * The branch responses and impedances of a casus-1h run.
 *
 * Casus 1b's shape plus the ACTIVE way's measured response on both grids: the
 * mid is the chain's `w` (its low slot), the tweeter its `t`, and the woofer
 * travels as `activeMeasured` — a measurement with no branch, which is exactly
 * what a hybrid is.
 */
export function casus1hChainInput(
  manifest: Manifest,
  files: readonly MeasurementFile[],
  chainGrid: readonly number[] = CASUS1H_V2_GRID,
): {
  grid: readonly number[];
  w: GriddedResponse;
  t: GriddedResponse;
  activeMeasured: GriddedResponse;
  activeMeasuredSafety: GriddedResponse;
  driverZ: Record<string, Complex[]>;
  safety: { freqs: number[]; w: GriddedResponse; t: GriddedResponse; z: Record<string, Complex[]> };
} {
  const ingest = runIngest(manifest, files);
  const grid = chainGrid;
  const fullOf = (driver: string) => {
    const full = ingest.drivers.find((x) => x.driver === driver)?.onAxisFull;
    if (!full) throw new Error(`casus 1h has no on-axis sum for ${driver}`);
    return full;
  };
  const zOn = (g: readonly number[]): Record<string, Complex[]> => {
    const out: Record<string, Complex[]> = {};
    for (const e of manifest.entries) {
      if (e.kind !== 'Z') continue;
      /* The ACTIVE way's impedance is deliberately NOT handed to the chain: the
       * amplifier this design is for never sees it, and a driver impedance in
       * the map is an invitation for the solver to find a branch for it. */
      if (e.driver === ACTIVE_WAY) continue;
      const f = files.find((x) => x.entry.file === e.file);
      if (!f?.impedance) continue;
      out[e.driver] = resampleImpedance(f.impedance.freq, f.impedance.magnitude, f.impedance.phaseDeg, g).z;
    }
    return out;
  };
  const extents = [PASSIVE_LOWEST_WAY, 'tweeter', ACTIVE_WAY].map((d) => {
    const full = fullOf(d);
    return [full.grid[0], full.grid[full.grid.length - 1]] as [number, number];
  });
  const sGrid = logspace(Math.min(...extents.map((e) => e[0])), Math.max(...extents.map((e) => e[1])), SAFETY_GRID_POINTS);
  const curve = (driver: string, g: readonly number[]) => banded(g, fullOf(driver));
  return {
    grid,
    w: curve(PASSIVE_LOWEST_WAY, grid),
    t: curve('tweeter', grid),
    activeMeasured: curve(ACTIVE_WAY, grid),
    activeMeasuredSafety: curve(ACTIVE_WAY, sGrid),
    driverZ: zOn(grid),
    safety: { freqs: sGrid, w: curve(PASSIVE_LOWEST_WAY, sGrid), t: curve('tweeter', sGrid), z: zOn(sGrid) },
  };
}

/** THE VIRTUAL-FILTER SEED of a casus-1h run — casus 1b's, verbatim. */
export function casus1hSeed(): ChainInput['seed'] {
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

/** The ChainInput of one casus-1h candidate, as the generator and the live reproduction build it. */
export function casus1hChainInputFor(
  c: GeneratedCandidate,
  gridded: ReturnType<typeof casus1hChainInput>,
  seed: ChainInput['seed'],
  active: { handover: ActiveHandover; settings: ModelBranchSettings },
): ChainInput {
  const x = c.crossings[0];
  return {
    grid: [...gridded.grid],
    w: gridded.w,
    t: gridded.t,
    activeMeasured: gridded.activeMeasured,
    activeMeasuredSafety: gridded.activeMeasuredSafety,
    driverZ: gridded.driverZ,
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    seed,
    settings: {
      ...CASUS1H_V2_SETTINGS,
      safety: gridded.safety,
      structurePreference: { kind: x.alignment.kind as 'LR' | 'BW' | 'BS', order: x.alignment.order as 1 | 2 | 3 | 4 },
      /* H-4 — and the candidate's POLARITY when the field states one, on the
       * same terms as the alignment above it: the caller picks, the design
       * step builds on it. Spread, so a field without polarity arms leaves the
       * key absent and the design step descends both polarities exactly as it
       * always did (P2). */
      ...(c.polarity ? { statedInverted: statedInvertedForTwoWay(c.polarity) } : {}),
      activeSide: active,
    },
    xoRange: [x.cageHz[0], x.cageHz[1]],
    judgeWindow: { floorHz: x.windowHz[0], ceilHz: x.windowHz[1] },
  };
}
