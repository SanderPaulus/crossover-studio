/**
 * CASUS 1 AS A v2 RUN — one definition, shared by the generator script and the
 * acceptance test.
 *
 * `casus1.fixture.ts` turns the files on disk into an engine-v2 REPORT input.
 * This turns the same files into a CHAIN input, which is a different shape and
 * a different set of decisions: a grid, a judged band, the tuner settings, and
 * the silent-ghost banding a three-way union grid needs.
 *
 * It lives beside the engine and not inside either consumer for the reason
 * `casus1.fixture.ts` gives for itself: two copies of a fixture are two chances
 * for them to disagree about what casus 1 is. Here that would be worse than
 * usual — the generator writes netlists to disk and the test asserts a live run
 * reproduces them, so a drift between the two would look like a regression in
 * the engine.
 *
 * IT READS FROM DISK, so it is only ever imported from tests and from
 * `scripts/`. `browserSafe.test.ts` knows `*.fixture.ts` as an exception and
 * `toggleRegression.test.ts` pins that nothing in the bundle imports one.
 *
 * EVERY PARAMETER IS STATED HERE AND RECORDED IN `casus1_v2_herkomst.json`.
 * V15's process rule, applied to a run instead of to a metric: a result that
 * depends on a band, a grid or a set of tuner settings records them, or it is
 * not reproducible and therefore not a reference.
 */

import { logspace, resample, resampleImpedance, type GriddedResponse } from '../dsp.ts';
import type { Complex } from '../complex.ts';
import { runIngest } from './ingest/derive.ts';
import type { Manifest } from './ingest/manifest.ts';
import type { MeasurementFile } from './ingest/derive.ts';
import { buildReport, type EngineV2Report } from './report.ts';
import { buildCandidateField, type CandidateFieldResult } from './predesign/candidateField.ts';
import {
  declareCandidateChainChoices,
  declareCandidateChoices,
} from './optimizer/candidateDeclaration.ts';
import type { GeneratedCandidate } from './predesign/candidates.ts';
import { AUTO_STRUCTS } from '../threeWayDesign.ts';
import {
  casus1AmpMinLoadOhm,
  casus1BuildabilityOnSearch,
  casus1BuildabilitySettings,
  casus1ContinuousPowerW,
  casus1ExcursionSettings,
  casus1LfResonantBudgetDb,
  casus1LowestWayLevelWorkForbidden,
  casus1LowestWaySeriesRMaxOhm,
  casus1LowestWayLevelWorkRule,
  casus1MaxDriveOnFsDb,
  casus1MaxDriveOnFsDbByDriver,
  casus1QesMultiplierMax,
  casus1TargetCurve,
  casus1ThermalDesignPowerW,
  casus1WiringByDriver,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  CASUS1_WOOFER_DC_OHM,
  loadGolden,
  type GoldenRefs,
} from './casus1.fixture.ts';
import type { WayWiring } from './ingest/wiring.ts';
import type { LowestWayLevelWork } from '../levelWork.ts';
import { peakInputVolts } from './metrics/driveExcursion.ts';
import type { TargetCurve } from './requirements/targetCurve.ts';
import {
  factsForWorker,
  type MeasurementFactsPayload,
} from './optimizer/measurementFacts.ts';

/**
 * How a branch reads OUTSIDE its own measured extent on a union grid.
 *
 * The app's own convention for a three-way: a branch that was not measured
 * there contributes silence rather than an extrapolation, so the sum carries
 * only real contributions. The number is the app's (`designSolve`), restated
 * here rather than imported so this fixture does not reach into a test.
 */
export const SILENT_GHOST_DB = -400;

/**
 * The analysis grid the chain runs on — a RESOLUTION choice, not a band (the
 * same reasoning `ANALYSIS_GRID_POINTS` carries); 96 points over 200–20 000 Hz
 * is the precedent `f4b2_v2_worker_baseline.json` set, and it is stated so a
 * baseline made on 96 can never be compared against a run on 200.
 *
 * M-1 — THE JUDGED BAND AND THE CHAIN GRID ARE DERIVED FROM THE MERGED SET.
 *
 * Until M-1 the grid read `logspace(200, 20000, 96)` and the band `[397, 19500]`:
 * 397 Hz was the woofer's gate floor and 200 Hz where the far-field span began,
 * both properties of the GATED session. On the merged set the woofer is valid
 * from 20.5 Hz, and a candidate may now hand over at 124 Hz — below a 200 Hz
 * grid the tuner would not even see its own crossing. So both are derived:
 *
 *   · THE FLOOR of the judged band is the higher of the lowest way's validity
 *     floor and its f_p — the upper reflex peak, which is where the case book
 *     already puts the bottom of the bass plateau
 *     (`gestelde_eisen._basplateau_2_5_tot_M1`: "de band [f_p, W-M-overname]").
 *     Below f_p a reflex system rolls off on its own and no crossover can
 *     flatten that; judging it would make every candidate pay for the box.
 *   · THE CEILING stays where it was (the highest way's ceiling, inside the
 *     grid).
 *   · THE GRID starts at the lowest way's VALIDITY floor (not at f_p) and keeps
 *     the RESOLUTION the precedent set (96 points over 200–20 000 Hz), so a run
 *     on it is a run at the same points per octave and not a coarser one.
 *
 * WHY THE GRID STARTS BELOW THE BAND, and it was measured before it was
 * written: the gate evaluator reads the lowest way's PASSBAND floor off the
 * grid floor (`passbandOf` clamps to the validity band the facts carry, and the
 * facts are clipped to the grid), and `isHighPassProtected` probes the branch
 * transfer half an octave UNDER that floor. With the grid starting AT f_p — the
 * upper reflex peak — that probe lands in the reflex impedance DIP, where the
 * driver's own impedance pulls the transfer down 2.5–3.9 dB against a rule
 * threshold of 1.0 dB, and the woofer reads as "high-pass protected": M-C then
 * judges it at f_p (+2.9 dB against a derived −7.6) and refuses every candidate
 * of the field (the first M-1 regeneration: eight of eight refused on the
 * woofer). With the grid at the validity floor the same probe lands at
 * 10–14 Hz, reads −0.2..−1.2 dB, and the woofer is what V49 says it is: no
 * high pass, no requirement — for the FROZEN netlists. The SEED of a 201 Hz
 * LR2 candidate still read +3.2 dB at 20–29 Hz (the series coil resonating
 * with the woofer's lower motional peak at 16.5 Hz), so the rule itself was
 * corrected at M-1: `isHighPassProtected` reads the filter's transfer into a
 * RESISTIVE load (the passband-median |Z| of the way), where the driver's own
 * resonances cannot masquerade as a high pass, and its threshold is one
 * filter order over the probe distance instead of a typed 1 dB, which an
 * LC-ladder resonance in a low pass could clear. The grid still starts at the
 * validity floor: that is where the facts say the way is valid, and the probe
 * of the rule needs the room.
 *
 * Read once at module load from the HUIDIG report — the band is class A (a
 * property of the measurement set), any netlist gives the same one.
 */
const PRECEDENT_GRID_POINTS = 96;
const PRECEDENT_GRID_HZ: [number, number] = [200, 20000]; // P6-OK: the resolution precedent, not a band
const GRID_TOP_HZ = 20000; // P6-OK: the top of the audio band, as before
const JUDGE_TOP_HZ = 19500; // P6-OK: the highest way's ceiling inside the grid, as before
const BAND_SOURCE = (() => {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden);
  const files = casus1Files(manifest);
  const report = buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry: casus1Geometry(golden),
    settings: { reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM } },
  });
  const lowest = report.driversLowToHigh[0];
  const d = report.ingest.drivers.find((x) => x.driver === lowest);
  if (!d?.onAxis) throw new Error(`casus 1: the lowest way (${lowest}) has no on-axis band`);
  const validityFloorHz = d.onAxis.bandHz[0];
  const fpHz = d.impedance?.fundamentalHz ?? null;
  const floorHz = fpHz !== null ? Math.max(validityFloorHz, fpHz) : validityFloorHz;
  return { lowest, validityFloorHz, fpHz, floorHz, provenance: d.onAxis.bandFloorProvenance };
})();
const pointsPerOctave = PRECEDENT_GRID_POINTS / Math.log2(PRECEDENT_GRID_HZ[1] / PRECEDENT_GRID_HZ[0]);
export const CASUS1_V2_GRID: number[] = logspace(
  BAND_SOURCE.validityFloorHz,
  GRID_TOP_HZ,
  Math.round(pointsPerOctave * Math.log2(GRID_TOP_HZ / BAND_SOURCE.validityFloorHz)),
);

/**
 * The band the SPL window and the RMS deviation are judged on — see the block
 * above: from the lowest way's f_p (or its validity floor, whichever is
 * higher) to the highest way's ceiling, clipped to the grid.
 */
export const CASUS1_V2_BAND_HZ: [number, number] = [BAND_SOURCE.floorHz, JUDGE_TOP_HZ];
/** Where the floor came from, for the record the generator writes. */
export const CASUS1_V2_BAND_SOURCE = BAND_SOURCE;

/** The run seed. Stated rather than defaulted, and recorded (A5e.4, P4 amendment). */
export const CASUS1_V2_SEED = 20260827;

/**
 * The tuner settings the run was made with — the APP'S OWN DEFAULTS, not a
 * minimal set.
 *
 * THE FIRST VERSION OF THIS BLOCK WAS MINIMAL AND IT WAS WRONG, and the mistake
 * is worth keeping written down because it is the whole reason a comparison
 * table exists. It left out `targets` (the staged pass's goal), `safety` (the
 * full-band ban on degeneration) and the audit thresholds, on the reasoning
 * that "every extra armed mechanism is a second thing that could explain a
 * difference between two runs". That reasoning is right for a REGRESSION and
 * exactly backwards for a PROPOSAL: those three are protections, and a tuner
 * without them delivers networks that are flat on the judged band and
 * degenerate outside it. Measured, on the first pass: min |Z| of 0.00 Ω — a
 * dead short — with the chain reporting a perfectly ordinary 1.90 dB of ripple,
 * because the ripple was measured where the network still worked.
 *
 * V26 row 31 says it in one line: `safety` is the "volle-band-verbod op
 * degeneratie". A candidate generated by A5d and tuned without it is not a
 * proposal about where the handover belongs; it is a proposal plus an
 * unprotected search, and comparing THAT against three designs made with the
 * protections on would have compared the wrong two things.
 *
 * So: the same values the app puts in `settings` on an ordinary three-way run,
 * with the app's own defaults where the designer states nothing.
 *
 * `ampMinLoadOhm` USED TO BE ABSENT HERE, and its absence was correct while the
 * project stated nothing: P4, and the F0 doctrine that an empty field is not a
 * judgement. It is stated now (`manifest_en_geometrie.gestelde_eisen`), so it
 * appears — READ from there rather than written here, because a project number
 * that exists in two places is a project number that will one day differ
 * between them. It goes in beside the rest for the same reason the app puts it
 * in both places: `settings.ampMinLoadOhm` is what the repair pass works
 * against, and `v2.gates.ampMinLoadOhm` (set by the caller, not here) is what
 * judges the delivered network. A floor that only judges arrives too late.
 */
export const CASUS1_AMP_MIN_LOAD_OHM: number | null = casus1AmpMinLoadOhm();

/**
 * V42/V43 — the stated LF budget, read from the manifest for the same reason
 * the floor above is: it is a project number and it has one home.
 *
 * IT DOES NOT BELONG IN `CASUS1_V2_SETTINGS`, and that is the difference from
 * the floor. `ampMinLoadOhm` goes to two places at once because it arms two
 * mechanisms — the chain's repair pass and the run's verdict. A lift budget
 * arms neither: it is an input to `invertBudgets`, which lives on the v2 side
 * only, so it travels in `v2.budgets.lfBumpBudgetDb` and nowhere else. A copy
 * in the chain settings would be a number with no reader.
 *
 * SINCE V43 IT IS ON THE RESONANT HALF of M-D's lift, and 1.4 dB rather than
 * V42's 2.5 — the manifest field is `lf_opslingering_budget_dB` and carries the
 * derivation. The transport key kept its name on purpose; see the fixture
 * helper and the manifest's `..._invoerpunt`.
 */
export const CASUS1_LF_RESONANT_BUDGET_DB: number | null = casus1LfResonantBudgetDb();

/**
 * V42 — THE ARMED GATES AND BUDGETS OF A CASUS-1 v2 RUN, in one place.
 *
 * WHY THIS EXISTS, and it is not tidiness. The generator and the acceptance
 * test each built this block themselves, and the moment V42 armed a budget in
 * the generator the test stopped reproducing the run it asserts about: it
 * re-ran a candidate the record says was REFUSED, without the budget that
 * refused it, got a network back, and failed. That is the same failure V27
 * wrote down — a run fixture that differs from the route it claims to measure —
 * and the fix is the one this file already applies to everything else: one
 * definition, two consumers.
 *
 * Spread at the use site (`gates: { ...CASUS1_V2_GATES }`) so an unstated
 * requirement arms nothing at all, which is what P4 asks for and what a casus
 * without these numbers still looks like.
 */
/**
 * V47 — the stated maximum drive on a driver's own resonance, read from the
 * manifest for the same reason the amplifier floor is: one home per project
 * number.
 *
 * It is the SECOND armed gate on this casus, and the first one since the floor.
 * Unlike the LF budget and the Q_es ceiling it condemns a delivered network
 * (M-C has a gate id), and unlike the floor it also decides which protection
 * rule the tuner's full-band safety gate applies — see `protectionRule` in
 * `casus1V2Declaration`.
 */
export const CASUS1_MAX_DRIVE_ON_FS_DB: number | null = casus1MaxDriveOnFsDb();

/**
 * V49 — THE EXCURSION INPUTS of casus 1 (driver cards, amplifier peak, X_max
 * margin, and the response drive when documented), read from the manifest for
 * the same reason every stated requirement above is.
 *
 * They belong in the REPORT SETTINGS and nowhere on the wire: the report
 * derives a ceiling per driver from them, and THAT crosses to the worker as a
 * measured fact (`factsForWorker` → `driveCeilingDbByModel`), beside the stated
 * `maxDriveOnFsDb` in `CASUS1_V2_GATES`. Spread into every casus-1 report so
 * the guards, the recorder, the generator and the live reproductions cannot
 * disagree about whether the ceiling was armed.
 */
export const CASUS1_EXCURSION = casus1ExcursionSettings();

/**
 * V50 — the stated M-C figure PER WAY, read from the manifest. Casus 1 states
 * the −20 dB convention for the tweeter only and leaves the mid to the
 * excursion-derived ceiling; the single figure (`CASUS1_MAX_DRIVE_ON_FS_DB`)
 * stays as the number that convention refers to, but it no longer travels as
 * `maxDriveOnFsDb` — that key would judge every protected way with it (V47),
 * which is what V50 ends.
 */
export const CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER: Record<string, number> = casus1MaxDriveOnFsDbByDriver();

/**
 * V50 — the CONTINUOUS amplifier power, from its one home in the manifest. It
 * reaches the run as `v2.amplifierPowerW` (the column, V36) and the worker
 * folds it into the gate object for M-A/part.
 */
export const CASUS1_CONTINUOUS_POWER_W: number | null = casus1ContinuousPowerW();

/**
 * V50 — the buildability inputs (resistor class + margin, coil class), and
 * whether they are ARMED ON THE SEARCH. The report and the guards judge with
 * them on every frozen netlist regardless; the run arms them only when the
 * manifest's decision field says so — see `casus1BuildabilityOnSearch`.
 */
export const CASUS1_BUILDABILITY = casus1BuildabilitySettings();
export const CASUS1_BUILDABILITY_ON_SEARCH: boolean = casus1BuildabilityOnSearch();

/**
 * V51 — the THERMAL DESIGN POWER the resistor gate judges at (10 W on casus 1,
 * stated as the average listening power), read from its one home. It travels
 * inside `CASUS1_BUILDABILITY` as `resistorThermalPowerW`, so every report
 * and every armed run judges M-A/part at it; the continuous rating stays what
 * the watt column prints at.
 */
export const CASUS1_THERMAL_DESIGN_POWER_W: number | null = casus1ThermalDesignPowerW();

/**
 * V51 — whether casus 1 FORBIDS level work on its lowest way
 * (`gestelde_eisen.geen_niveauwerk_op_laagste_weg`). It reaches the chain as
 * the third chain-level choice key (`lowestWayLevelWork: 'none'`) through the
 * candidate's chain declaration, and the report as `lowestWayLevelWork`.
 */
export const CASUS1_LOWEST_WAY_LEVEL_WORK_FORBIDDEN: boolean = casus1LowestWayLevelWorkForbidden();

/**
 * V51b — the stated MAXIMUM total series resistance on the lowest way
 * (`gestelde_eisen.max_serie_R_laagste_weg_ohm`), and THE RULE the two produce
 * together: a stated maximum narrows the prohibition to "no pad, series
 * resistance up to this" (`{ kind: 'series-r-max', maxOhm }`); without one the
 * prohibition stands (`'none'`); with neither, undefined (P4). Every casus-1
 * measuring surface spreads `CASUS1_LOWEST_WAY_LEVEL_WORK` so none of them can
 * disagree about which rule the corpus was generated under.
 */
export const CASUS1_LOWEST_WAY_SERIES_R_MAX_OHM: number | null = casus1LowestWaySeriesRMaxOhm();
export const CASUS1_LOWEST_WAY_LEVEL_WORK: LowestWayLevelWork | undefined = casus1LowestWayLevelWorkRule();

/**
 * V51 — the wiring per way from the driver card (the woofer pair: two,
 * measured parallel, wanted parallel). REPORT input only: the transform in
 * `ingest/wiring.ts` is the identity on this casus and is not applied.
 */
export const CASUS1_WIRING: Record<string, WayWiring> = casus1WiringByDriver();

/**
 * V51 — the report settings the level-work block reads, spread into every
 * casus-1 report for the same reason `casus1ExcursionSettings` is: the guards,
 * the recorder, the generator and the live reproductions must not disagree
 * about what the project stated.
 */
export const CASUS1_LEVEL_WORK_SETTINGS: {
  wiringByDriver?: Record<string, WayWiring>;
  lowestWayLevelWork?: LowestWayLevelWork;
} = {
  ...(Object.keys(CASUS1_WIRING).length > 0 ? { wiringByDriver: { ...CASUS1_WIRING } } : {}),
  ...(CASUS1_LOWEST_WAY_LEVEL_WORK !== undefined ? { lowestWayLevelWork: CASUS1_LOWEST_WAY_LEVEL_WORK } : {}),
};

/** V50 — the peak input voltage the coil gate reads currents at (V49's amplifier peak). */
export const CASUS1_PEAK_INPUT_VOLTS: number | null =
  CASUS1_EXCURSION.amplifierPeakPowerW !== undefined && CASUS1_EXCURSION.amplifierNominalLoadOhm !== undefined
    ? peakInputVolts({
        peakPowerW: CASUS1_EXCURSION.amplifierPeakPowerW,
        nominalLoadOhm: CASUS1_EXCURSION.amplifierNominalLoadOhm,
      })
    : null;

export const CASUS1_V2_GATES: {
  ampMinLoadOhm?: number;
  maxDriveOnFsDb?: number;
  maxDriveOnFsDbByDriver?: Record<string, number>;
  peakInputVolts?: number;
  resistorClassW?: number;
  resistorPowerMargin?: number;
  coilClassA?: number;
} = {
  ...(CASUS1_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS1_AMP_MIN_LOAD_OHM } : {}),
  ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
    ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
    : {}),
  ...(CASUS1_PEAK_INPUT_VOLTS !== null ? { peakInputVolts: CASUS1_PEAK_INPUT_VOLTS } : {}),
  ...(CASUS1_BUILDABILITY_ON_SEARCH ? { ...CASUS1_BUILDABILITY } : {}),
};

/**
 * V45 (A5e.2) — the stated Q_es multiplication ceiling, read from the manifest
 * for the same reason the two above are: it is a project number with one home.
 *
 * It arms the A5d.6 inversion `qes-series-r`, which is a ceiling on the TOTAL
 * series resistance of the lowest way's path — the mechanism that has existed
 * since F2 and that casus 1 never stated an input for. Like the LF budget and
 * unlike the amp floor it belongs in `v2.budgets` and nowhere else: it is an
 * input to `invertBudgets`, which lives on the v2 side only, so a copy in the
 * chain settings would be a number with no reader.
 */
export const CASUS1_QES_MULTIPLIER_MAX: number | null = casus1QesMultiplierMax();

/**
 * V45 — the design's own TARGET CURVE, built by the fixture helper from the
 * stated depth and the MEASURED baffle step. See `casus1TargetCurve`.
 *
 * It is not a budget and not a gate, so it travels in its own field
 * (`v2.targetCurve`) and in the report settings — two readers of one object:
 * A5d.4(a)'s anchored gaps and, since V45, the tuner's amplitude term.
 */
export const CASUS1_TARGET_CURVE: TargetCurve = casus1TargetCurve();

export const CASUS1_V2_BUDGETS: { lfBumpBudgetDb?: number; qesMultiplierMax?: number } = {
  ...(CASUS1_LF_RESONANT_BUDGET_DB !== null
    ? { lfBumpBudgetDb: CASUS1_LF_RESONANT_BUDGET_DB }
    : {}),
  ...(CASUS1_QES_MULTIPLIER_MAX !== null
    ? { qesMultiplierMax: CASUS1_QES_MULTIPLIER_MAX }
    : {}),
};

export const CASUS1_V2_SETTINGS = {
  phasePriority: 0.5,
  /* 'acoustic', which is the app's own default — and the second thing the first
   * pass got wrong. On 'filter' the same chain, started from the baseline's own
   * crossings, delivered 31.4 dB of ripple against 5.2 dB on 'acoustic', drifted
   * the handovers from 360/2250 to 856/3848 and left a 0.00 Ω load. A fixture
   * that does not run the app's own synthesis is not measuring the app. */
  synthMode: 'acoustic' as const,
  band: CASUS1_V2_BAND_HZ,
  /** The staged pass's goal — the app's `targetRipple` / `targetPhase` defaults. */
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
  /**
   * THE SOURCE-RESISTANCE TIERS: NEITHER IS STATED, AND THAT IS THE STATEMENT
   * (V34, P4).
   *
   * This block used to read `rSourceDisqualifyOhm: 2.0` and
   * `audit.thresholds.rSourceOhm: 1.0`, with the comment "the app's own
   * defaults for the source-resistance tiers". Every other project number in
   * this fixture is READ from `manifest_en_geometrie.gestelde_eisen` — the amp
   * floor is, and the note above `CASUS1_AMP_MIN_LOAD_OHM` says why — and these
   * two were not, because there was nothing to read: casus 1 states no
   * source-resistance requirement. What stood here was a UI default typed into
   * a fixture, which is exactly the pattern F0 removed for `ampMinLoadOhm`.
   *
   * WHY IT MATTERED, MEASURED. Until V34 the probe read the chain grid, where
   * it landed on the top of its own search window (640.2 Hz) rather than on the
   * woofer's resonance, and there every candidate scores well under 2 Ω. Read
   * where the quantity actually lives, the three v1 baselines score 3.98, 4.59
   * and 2.55 Ω — so an unasked-for 2.0 Ω limit would disqualify all three,
   * including the designer's own best filter. Repairing the probe without
   * withdrawing the default would have made the field worse than leaving both
   * alone; that is why V34 is one entry and not two.
   *
   * `rSourceDisqualifyOhm` is therefore simply ABSENT: `declareCandidateChoices`
   * files it with the P4 reason, and `withDeclaredSourceLimit` in the worker
   * makes the chain honour that instead of falling back to its own default.
   * The audit still RUNS — it is a protection, and V26 row 33 is why every
   * protection this app arms by default stays armed — but its source-resistance
   * tier is stated `null`: no limit, because nobody stated one. `null` and not
   * absent, because an absent `audit` would switch the whole part audit off.
   */
  audit: { thresholds: { rSourceOhm: null } },
  /**
   * V34 — the probe reads the full-band safety grid, not the chain grid.
   *
   * Stated here rather than left to the derivation for the same reason
   * `zFloorBarrierSource` is stated on the runs the comparison table is built
   * from: a before/after measurement has to be a run somebody can ask for. The
   * derivation in `declareCandidateChoices` would reach the same value on this
   * casus, and `choiceKeyGuard.test.ts` pins that it does.
   */
  rSourceProbeSource: 'safety' as const,
  /* Spread rather than assigned, so an unstated floor leaves the KEY absent
   * instead of present-and-undefined. `declareCandidateChoices` distinguishes
   * those two: undefined becomes an ABSENT declaration with the P4 reason, and
   * a missing key is the silent inheritance F4d ended. */
  ...(CASUS1_AMP_MIN_LOAD_OHM !== null ? { ampMinLoadOhm: CASUS1_AMP_MIN_LOAD_OHM } : {}),
};

/**
 * Points on the FULL-BAND safety grid.
 *
 * A resolution choice, and the same one the app makes (`logspace(lo, hi, 240)`
 * in `runVfOptimize`). The safety set exists to watch what the network does
 * OUTSIDE the judged band, so it gets its own grid over the drivers' whole
 * measured extent rather than the analysis grid. @p6-style rationale: a count,
 * not a frequency.
 */
const SAFETY_GRID_POINTS = 240;

/**
 * The candidate field for casus 1.
 *
 * The designer's stated order is 4 on both handovers — the same order the
 * casebook's own window references carry (`kruisvensters.*_orde4`) and the same
 * one every other casus-1 test states. Stating it keeps the field to positions
 * only; with 'auto' the derivation abstains and every buildable order becomes
 * its own candidate, which is correct and is 63 chains.
 */
/**
 * M-1 — THE FIELD: LR4 AND LR2 ON THE WOOFER→MID AXIS, LR4 ON MID→TWEETER.
 *
 * Sander asked to see the LR2 variant beside LR4 on the lower handover: with
 * the plateau flat and the woofer valid from 20.5 Hz the window opens down to
 * k·f_s of the mid (124 Hz at order 4, 178 Hz at order 2), and whether a
 * second-order handover there clears the amplifier floor without series
 * resistance is the question of the session. So on that axis the derivation
 * is left to ABSTAIN — no order stated, no rule armed — and A5d.3's own rule
 * for that state applies: every buildable order is its own candidate. The
 * library handed in is the app's two LR alignments only (`AUTO_STRUCTS`
 * filtered), which is a DESIGNER'S restriction and recorded as one: the
 * Butterworth-3 and Bessel-4 entries were not asked for, and A5d.3 prefers
 * symmetric LR flanks anyway. The upper handover keeps the stated order 4 the
 * casebook's window references carry.
 */
export const CASUS1_FIELD_ALIGNMENTS = AUTO_STRUCTS.filter((a) => a.kind === 'LR');

export function casus1Field(report: EngineV2Report): CandidateFieldResult {
  return buildCandidateField({
    windowInputs: report.predesign.windowInputs,
    perPair: report.predesign.windowInputs.map((_, i) => (i === 0 ? {} : { statedOrder: 4 })),
    alignments: CASUS1_FIELD_ALIGNMENTS,
  });
}

/**
 * The declaration that travels beside one casus-1 candidate.
 *
 * It states every protection the run arms, which is the point: `safety`,
 * `audit`, `staged` and `rSourceDisqualifyOhm` are CHOICE keys (V26 rows 31,
 * 33, 14 and 2), so on the v2 route they may only reach the tuner through the
 * candidate. The first version of this fixture proved why by leaving three of
 * them out — see the note on `CASUS1_V2_SETTINGS`.
 *
 * SINCE V34 ONE OF THEM IS STATED BY BEING ABSENT. `rSourceDisqualifyOhm` is
 * not listed below, and that is the declaration: casus 1 states no
 * source-resistance requirement, so the candidate carries none and nothing is
 * disqualified on it (P4). `rSourceProbeSource` takes its place — where the
 * probe reads is a choice this candidate does make.
 */
export function casus1V2Declaration(
  c: GeneratedCandidate,
  safety?: {
    freqs: number[];
    w: GriddedResponse;
    m: GriddedResponse;
    t: GriddedResponse;
    z: Record<string, Complex[]>;
  },
) {
  return {
    declaration: declareCandidateChoices({
      cages: c.crossings.map((x) => x.cageHz),
      windowFloorsHz: c.crossings.map((x) => x.windowHz[0]),
      multiWay: true,
      stated: {
        band: CASUS1_V2_BAND_HZ,
        staged: CASUS1_V2_SETTINGS.targets,
        ampTarget: CASUS1_V2_SETTINGS.ampTarget,
        powerMetric: CASUS1_V2_SETTINGS.powerMetric,
        phaseMetric: CASUS1_V2_SETTINGS.phaseMetric,
        catalogSnap: CASUS1_V2_SETTINGS.catalogSnap,
        breakupGuard: CASUS1_V2_SETTINGS.breakupGuard,
        audit: CASUS1_V2_SETTINGS.audit,
        rSourceProbeSource: CASUS1_V2_SETTINGS.rSourceProbeSource,
        ...(CASUS1_AMP_MIN_LOAD_OHM !== null
          ? { ampMinLoadOhm: CASUS1_AMP_MIN_LOAD_OHM }
          : {}),
        ...(safety ? { safety } : {}),
        zFloorStrict: true,
      },
      /* V45 — the design's voicing, so the candidate can declare WHAT the
       * amplitude term is flat against. The curve itself travels as polish
       * beside that choice; this is only what lets the declaration derive
       * `amplitudeReference` instead of leaving the search flattening toward
       * horizontal while the shortlist judges against a plateau. */
      targetCurve: CASUS1_TARGET_CURVE,
      /* V47 — the design's stated drive limit, so the candidate can declare
       * WHICH RULE forbids an unprotected upper driver. The limit itself does
       * not travel this way: it is a gate and it crosses as
       * `v2.gates.maxDriveOnFsDb`. This is only what lets the declaration
       * derive `protectionRule` instead of leaving the safety gate comparing
       * against a seed while a stated requirement judges the result. */
      ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
        ? { driveOnFsLimitDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
        : {}),
      /* V49 — and whether an excursion ceiling exists for this casus: with the
       * cards, the peak and the margin all stated the report derives one per
       * driver, and that is an absolute rule too. Read from the same manifest
       * block; on casus 1 the stated figure already derives 'stated', so this
       * changes nothing today and keeps the declaration honest the day the
       * figure is dropped. */
      ...(CASUS1_EXCURSION.driverCardByDriver !== undefined &&
      CASUS1_EXCURSION.amplifierPeakPowerW !== undefined &&
      CASUS1_EXCURSION.xmaxMarginFraction !== undefined
        ? { driveCeilingDerived: true }
        : {}),
      /* V48 — the design's stated LF budget, so the candidate can declare
       * WHICH NETWORK the series-inductance ceiling describes. The budget
       * itself crosses as `v2.budgets.lfBumpBudgetDb`; this is only what lets
       * the declaration derive `seriesInductanceCeilingSource` instead of
       * leaving the search bounded by a ceiling solved for its seed. */
      ...(CASUS1_V2_BUDGETS.lfBumpBudgetDb !== undefined
        ? { lfBumpBudgetDb: CASUS1_V2_BUDGETS.lfBumpBudgetDb }
        : {}),
    }),
    /* V41 — the two settings the DESIGN and SYNTHESIS steps read, which run
     * before the tuner exists. Nothing is stated here, so the derivation
     * applies: the app's own EQ budget and `synthesize`'s own lean threshold.
     * Stating them here instead would put two more app defaults in a fixture,
     * which is the pattern V34 removed for the source-resistance tiers.
     *
     * V51 — and the THIRD chain key, derived from the project's stated
     * requirement: with `geen_niveauwerk_op_laagste_weg` stated the candidate
     * declares `lowestWayLevelWork: 'none'`; unstated it is ABSENT (P4). Read
     * from the manifest, never written here.
     *
     * V51b — with `max_serie_R_laagste_weg_ohm` stated as well, the derivation
     * declares `{ kind: 'series-r-max', maxOhm }` instead: the narrower
     * statement wins (`declareCandidateChainChoices`). */
    chainDeclaration: declareCandidateChainChoices({
      stated: {},
      ...(CASUS1_LOWEST_WAY_LEVEL_WORK_FORBIDDEN ? { lowestWayLevelWorkForbidden: true } : {}),
      ...(CASUS1_LOWEST_WAY_SERIES_R_MAX_OHM !== null ? { lowestWaySeriesRMaxOhm: CASUS1_LOWEST_WAY_SERIES_R_MAX_OHM } : {}),
    }),
    provenance: c.provenance,
    orderByModel: { mid: c.crossings[0].order, tweeter: c.crossings[1].order },
  };
}

/**
 * V32 — THE MEASURED FACTS, ACROSS THE BORDER, THE WAY THE APP SENDS THEM.
 *
 * This fixture used to send NONE. That was invisible while every gate judged on
 * the chain's analysis grid: the worker fell back to its own R_e, to the whole
 * grid for validity, and to its own resonance classification, said so in the
 * notes, and nobody read the notes. V32 makes it load-bearing — with no
 * impedance sweep in the payload no electrical gate judges at all, so a fixture
 * that sends nothing would answer V32 by turning `M-B/|Z|` off, which is worse
 * than the leniency it replaces.
 *
 * So the whole payload crosses, through `factsForWorker` — the app's own bridge
 * (`App.tsx`, `v2Facts`) — and not a hand-picked half of it. Sending only the
 * sweep while withholding the validity interval that belongs to the same
 * measurement is exactly the incoherence F4b's leak 2 was about.
 *
 * `modelByDriverId` is the IDENTITY on this casus, and it is built rather than
 * written: the manifest names its drivers `woofer`/`mid`/`tweeter` and the
 * netlists use the same names as models. On a project where those two
 * vocabularies differ, `driverSlots.ts` is the bridge and this map is where it
 * would be used.
 */
export function casus1V2Facts(
  report: EngineV2Report,
  manifest: Manifest,
  files: readonly MeasurementFile[],
): MeasurementFactsPayload {
  const modelByDriverId: Record<string, string> = {};
  for (const d of report.ingest.drivers) modelByDriverId[d.driver] = d.driver;
  const sweepByDriverId: Record<
    string,
    { freq: readonly number[]; magnitude: readonly number[]; phaseDeg: readonly number[] }
  > = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (!f?.impedance) continue;
    sweepByDriverId[e.driver] = {
      freq: f.impedance.freq,
      magnitude: f.impedance.magnitude,
      phaseDeg: f.impedance.phaseDeg,
    };
  }
  return {
    ...factsForWorker(report, modelByDriverId, sweepByDriverId),
    /* V44 — this fixture BUILDS the chain grid and bands every branch to its
     * own measured extent (`banded`, below), so it is the party that knows what
     * stands for silence here. Stating it arms ground (b) of the phase
     * admission; leaving it out would make that ground abstain on the one run
     * where the ghost demonstrably exists. On this casus it removes nothing
     * that ground (a) does not already remove — measured in
     * `frozenNetlistGates.test.ts`, not assumed — because the validity band
     * lies inside the measured extent by construction. */
    silentFloorDb: SILENT_GHOST_DB,
  };
}

/** Band a response to its own measured extent — silence outside it. */
function banded(
  grid: readonly number[],
  src: { grid: readonly number[]; db: readonly number[]; phaseDeg: readonly number[] },
): GriddedResponse {
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
 * The three branch responses and the three impedances, on the chain grid.
 *
 * The responses are the ingest pass's UNCLIPPED complex sums (`onAxisFull`),
 * for the reason V13 established: the woofer is one way measured as two files,
 * and the pressure that matters is their complex sum. Unclipped because where
 * two branches CROSS is a property of the design rather than a measurement
 * claim — the clipped band belongs to the scans, not to the chain.
 */
export function casus1ChainInput(
  manifest: Manifest,
  files: readonly MeasurementFile[],
  golden: GoldenRefs = loadGolden(),
  /**
   * M-1 — the chain grid, when a caller needs one other than the fixture's:
   * `frozenNetlistGates.test.ts` keeps the V38-fix finding on the chain it was
   * measured on (200–20 000 Hz, 96 points). Default: `CASUS1_V2_GRID`.
   */
  chainGrid: readonly number[] = CASUS1_V2_GRID,
): {
  grid: readonly number[];
  w: GriddedResponse;
  m: GriddedResponse;
  t: GriddedResponse;
  driverZ: Record<string, Complex[]>;
  safety: {
    freqs: number[];
    w: GriddedResponse;
    m: GriddedResponse;
    t: GriddedResponse;
    z: Record<string, Complex[]>;
  };
} {
  void golden;
  const ingest = runIngest(manifest, files);
  const grid = chainGrid;
  const curve = (driver: string): GriddedResponse => {
    const d = ingest.drivers.find((x) => x.driver === driver);
    const full = d?.onAxisFull;
    if (!full) throw new Error(`casus 1 has no on-axis sum for ${driver}`);
    return banded(grid, { grid: full.grid, db: full.db, phaseDeg: full.phaseDeg });
  };
  const driverZ: Record<string, Complex[]> = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (!f?.impedance) continue;
    driverZ[e.driver] = resampleImpedance(
      f.impedance.freq,
      f.impedance.magnitude,
      f.impedance.phaseDeg,
      grid,
    ).z;
  }
  /* THE SAFETY SET (V26 row 31): the same three branches and the same
   * impedances over the drivers' WHOLE measured extent, on their own grid. The
   * tuner watches it for degeneration outside the judged band — which is
   * precisely where an unprotected search hides its damage. Built here so the
   * script and the acceptance test cannot arm different protections. */
  const extents = ['woofer', 'mid', 'tweeter'].map((d) => {
    const full = ingest.drivers.find((x) => x.driver === d)?.onAxisFull;
    if (!full) throw new Error(`casus 1 has no on-axis sum for ${d}`);
    return [full.grid[0], full.grid[full.grid.length - 1]] as [number, number];
  });
  const sLo = Math.min(...extents.map((e) => e[0]));
  const sHi = Math.max(...extents.map((e) => e[1]));
  const sGrid = logspace(sLo, sHi, SAFETY_GRID_POINTS);
  const sCurve = (driver: string): GriddedResponse => {
    const full = ingest.drivers.find((x) => x.driver === driver)!.onAxisFull!;
    return banded(sGrid, { grid: full.grid, db: full.db, phaseDeg: full.phaseDeg });
  };
  const sZ: Record<string, Complex[]> = {};
  for (const e of manifest.entries) {
    if (e.kind !== 'Z') continue;
    const f = files.find((x) => x.entry.file === e.file);
    if (!f?.impedance) continue;
    sZ[e.driver] = resampleImpedance(
      f.impedance.freq,
      f.impedance.magnitude,
      f.impedance.phaseDeg,
      sGrid,
    ).z;
  }
  const safety = {
    freqs: sGrid,
    w: sCurve('woofer'),
    m: sCurve('mid'),
    t: sCurve('tweeter'),
    z: sZ,
  };
  return { grid, w: curve('woofer'), m: curve('mid'), t: curve('tweeter'), driverZ, safety };
}
