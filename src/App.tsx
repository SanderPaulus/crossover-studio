import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { t, setLang, currentLang, subscribeLang, LANGS } from './lib/i18n.ts';
import { meetsAmpFloor } from './lib/impedanceFloor.ts';
/** Same translator under a name nothing shadows: inside the optimizer
 *  handlers `t` is the TWEETER response (a long-standing local), so a
 *  t('…') there is a type error waiting to happen. */
const tx = t;
import { parseFrd } from './lib/parsers/frd.ts';
import { parseZma } from './lib/parsers/zma.ts';
import { parseLim, limToZmaText } from './lib/parsers/lim.ts';
import { classifyLevelProfile } from './lib/parsers/classify.ts';
import { compareMeasurement } from './lib/verification.ts';
import { parseVxp, type VxpCrossover, type VxpPart, type VxpProject } from './lib/parsers/vxp.ts';
import { estimateBulkDelay, assessSharedReference, assessPairTimeBase } from './lib/timing.ts';
import { logspace, resample, resampleImpedance, combine, combineN, offsetMmToDelayS, applyTransfer, type GriddedResponse, type CombineResult, type CombineNResult } from './lib/dsp.ts';
import { solveDesign } from './lib/designSolve.ts';
import { beginScanRun, endScanRun, putScanRow, listScanRuns, listScanRows, dropScanRun, pickResumable } from './lib/scanStore.ts';
import { computeIntegration } from './lib/integration.ts';
import { crossoverToNetlist } from './lib/vxpNetwork.ts';
import { assessNetwork, type NetworkReadiness } from './lib/networkReadiness.ts';
import { solveNetwork, type Netlist } from './lib/network.ts';
import { peakInputVolts } from './lib/engine2/metrics/driveExcursion.ts';
import type { WayWiring } from './lib/engine2/ingest/wiring.ts';
import {
  canonicalModelForRole,
  isTweeterModel,
  pickSlots,
  pickSlotsN,
  withSlotAliasesN,
  type BranchRole,
} from './lib/driverSlots.ts';
import { estimateCoilDcr } from './lib/netlistEdit.ts';
import {

  checkTransition,
  mergeNearFar,
  nearFieldMaxHz,
  nearToFarDb,
  sumRadiators,
} from './lib/nearField.ts';
import {
  gatedFarFieldValidity,
  intersectValidity,
  nearFieldValidity,
  nearFieldMergedValidity,
  NEARFIELD_MERGED_FLOOR_HZ,
  type SourceMeta,
} from './lib/sourceMeta.ts';
import {
  KA_TIERS,
  breakupCeilingHz,
  breakupHz,
  excursionFloorHz,
  lobingCeilingHz,
  lobingKFor,
  type KaTier,
} from './lib/driverLimits.ts';
import {
  candidateCentres,
  deriveXoWindow,
  gateMsFromHeader,
  readGateHeader,
  type GateHeaderResult,
  dataFloorFromGateMs,
  DEFAULT_GATE_TAPER_ALPHA,
  DEFAULT_XO_WINDOW_THRESHOLDS,
  type XoWindowThresholds,
} from './lib/xoWindow.ts';
import {
  baffleStepHz,
  boxRolloff,
  boxTuningFromZ,
  C_AIR_MM_S,
  centreToCentreMm,
  depthForExcessMm,
  pathBreakdownMm,
  radiatingPanelWidthMm,
  listeningDelayShiftUs,
  measuringDistanceVerdict,
  farFieldVerdict,
  floorBounceGate,
  gateLimitHz,
  listeningAngleDeg,
  nearestEdgeMm,
  opposedAnglesDeg,
  pistonDiameterMm,
  rotationLevelOffsetDb,
  trueOffAxisDeg,
  unloadingRisk,
  type DriverFacing,
  type DriverPlacement,
  type Enclosure,
} from './lib/cabinet.ts';
import {
  mergeSynthesizedSchematics,
  nextPartId,
  normalizeOrigin,
} from './lib/schematicEdit.ts';
import SchematicEditor from './components/SchematicEditor.tsx';
import NumberFlow from '@number-flow/react';
import { Modal } from './components/Modal.tsx';
import { HelpPanel } from './components/HelpPanel.tsx';
import { MeasuringGuide } from './components/MeasuringGuide.tsx';
import { EngineV2Panel } from './components/EngineV2Panel.tsx';
import { selectEngine } from './lib/engine2/facade.ts';
import { buildReport } from './lib/engine2/report.ts';
import {
  buildEngineV2Input,
  resolveDriverIds,
  type AdapterBranch,
  type AdapterImpedance,
  type AdapterResponse,
} from './lib/engine2/appAdapter.ts';
import { ctcKey } from './lib/engine2/metrics/types.ts';
import {
  candidatesOutsideWindows,
  rangeAgainstWindow,
  takeoverFor,
  type RangeAdvice,
} from './lib/engine2/predesign/xoRangeAdvice.ts';
import {
  recommendedBand,
  type RecommendedBandResult,
} from './lib/engine2/predesign/recommendedBand.ts';
import { factsForWorker } from './lib/engine2/optimizer/measurementFacts.ts';
import {
  smoothingConsistency,
  type SmoothingNotice,
} from './lib/engine2/requirements/smoothingConsistency.ts';
import type { XoWindowResult } from './lib/engine2/predesign/xoWindow.ts';
import {
  buildCandidateField,
  candidateFieldKey,
} from './lib/engine2/predesign/candidateField.ts';
import type { GeneratedCandidate } from './lib/engine2/predesign/candidates.ts';
import { compareFloors, type FloorComparison } from './lib/engine2/predesign/floorComparison.ts';
import {
  declareCandidateChainChoices,
  declareCandidateChoices,
} from './lib/engine2/optimizer/candidateDeclaration.ts';
import { seriesRMaxOhmOf, type LowestWayLevelWork } from './lib/levelWork.ts';
import { chainDeclarationKey } from './lib/engine2/optimizer/chainChoices.ts';
import { AUTO_STRUCTS } from './lib/threeWayDesign.ts';
import { DEFAULT_RUN_SEED, SEARCH_SMOOTHING_OCTAVES } from './lib/engine2/constants.ts';
import { stableJson, type V2RunStamp } from './lib/engine2/optimizer/determinism.ts';
import type { GateVerdict } from './lib/engine2/optimizer/gates.ts';
import { gateCellState } from './lib/engine2/optimizer/gateCell.ts';
import {
  buildShortlist,
  type Shortlist,
  type ShortlistInput,
} from './lib/engine2/optimizer/shortlist.ts';
import { selectFromShortlist } from './lib/engine2/optimizer/selection.ts';
import {
  FLAT_TARGET,
  describeTargetCurve,
  type TargetCurve,
} from './lib/engine2/requirements/targetCurve.ts';
import { BaffleView } from './components/BaffleView.tsx';
import { XoWindowAnnotation, type XoWindowPair } from './components/XoWindowAnnotation.tsx';
import { CatalogManager } from './components/CatalogManager.tsx';
import { helpSectionForTab } from './lib/help.ts';
import { fileSafeName } from './lib/filenames.ts';
import {
  filterTemplate,
  supportsWayCount,
  TEMPLATE_ORDERS,
  type FilterOrder,
  type WayCount,
} from './lib/filterTemplates.ts';
import { deserializeFilter, serializeFilter } from './lib/filterFile.ts';
import { buildReportHtml, type ReportRow, type ReportSection } from './lib/report.ts';
import { serializeVxp } from './lib/parsers/vxpExport.ts';
import { zipStore } from './lib/zip.ts';
import type { VxpDriver } from './lib/parsers/vxp.ts';
import { tidySchematic } from './lib/tidyLayout.ts';
import {
  allSeries,
  bomFor,
  catalogSeries,
  customCatalogParts,
  disabledSeries,
  setDisabledSeries,
  formatCatalogPart,
  hasImportedCatalog,
  catalogParts,
  setCustomSeries,
  type CatalogPart,
  type CatalogSeries,
  type SnapPrefs,
} from './lib/catalog.ts';
import { fitCoilDcrFamilies } from './lib/coilDcr.ts';
import {
  cancelOptimTasks,
  CancelledError,
  runChainScan,
  runNetOptimizeTask,
  runMinimizeTask,
  runSoloChainTask,
  runVfRoundsTask,
  runChain3Scan,
  runChain3ScanV2,
  type V2Chain3Item,
  stopKeepingResults,
  type ScanProgress,
  scanStopped,
  poolSize,
} from './lib/optimClient.ts';
import { crossover3Variants, rankChain3Results, variantsFromPoints, type Chain3Input, type Chain3Variant, deliveredLabel } from './lib/threeWayChain.ts';
import {
  optimizeNetworkValues,
  type NetOptimizeOptions,
} from './lib/netOptimizer.ts';
import type { MinimizeResult } from './lib/minimize.ts';
import {
  sourceResistanceOhm,
  type NetworkAudit,
  DEFAULT_R_SOURCE_DISQUALIFY_OHM,
  DEFAULT_R_SOURCE_TIER_OHM,
} from './lib/partAudit.ts';
import type { Chain3Result } from './lib/threeWayChain.ts';
import { buildSoloNetwork, optimizeSoloFilter, reachableBandFor } from './lib/soloOptimizer.ts';
import { crossoverVariants, rankChainResults, type ChainResult, type ChainSettings } from './lib/designChain.ts';
import { deserializeCatalog, serializeCatalog } from './lib/catalogFile.ts';
import { fromPolar, abs as cAbs, mul as cMul, type Complex } from './lib/complex.ts';
import {
  evalDriverFilter,
  isActive,
  defaultHpLp,
  defaultEq,
  type DriverFilterSpec,
  type FilterKind,
} from './lib/filters.ts';
import { synthesize, formatComponent, type SynthesisResult, type SynthesizedComponent } from './lib/synthesis.ts';
import { computePhaseStats } from './lib/phaseStats.ts';
import { computeResponseStats } from './lib/responseStats.ts';
import { toleranceBand } from './lib/tolerance.ts';
import { DEFAULT_EQ_BANDS_PER_DRIVER, type VfOptimizeResult, type StructChoice } from './lib/vfOptimizer.ts';
import { toTimeDomain, excessGroupDelay } from './lib/timeDomain.ts';
import {
  serializeProject,
  deserializeProject,
  type NetworkDesign,
  type ProjectDesign,
  type ProjectState,
  type StoredFile,
} from './lib/project.ts';
import { minimumPhaseDeg } from './lib/minphase.ts';
import { bridgeDelaysUs, excessDelayMsOf } from './lib/vituixBridge.ts';
import Chart, { type ChartHandle, type Series } from './components/Chart.tsx';
import DriverFilterControls from './components/FilterControls.tsx';
import { LogoMark, LogoWord } from './components/Logo.tsx';
import demoMid from './lib/parsers/fixtures/mid_hor0_mettape.txt?raw';
import demoTweet from './lib/parsers/fixtures/tweet_hor0_mettape.txt?raw';
import { beamingCeilingHz, computeDirectivity, computeDirectivityN, type AngleResponse, diMatchHz } from './lib/directivity.ts';
import { reachesLevelHz, powerShape } from './lib/bandMetrics.ts';
import { beamwidth6dBHalfAngle, buildSonogram, type SonogramMode } from './lib/sonogram.ts';
import Sonogram from './components/Sonogram.tsx';
import { angleFromFilename } from './lib/angles.ts';
import demoMidZma from './lib/parsers/fixtures/mid_Backwavecone_sheep75gram.ZMA?raw';
import demoTweetZma from './lib/parsers/fixtures/tweeter.ZMA?raw';
import demoVxp from './lib/parsers/fixtures/KOAN 2951 Prototype 140826.vxp?raw';
import demoCatalog from './lib/parsers/fixtures/gemini-catalog-v6.json?raw';
import demoMid15 from './lib/parsers/fixtures/mid_hor15_mettape.txt?raw';
import demoMid30 from './lib/parsers/fixtures/mid_hor30_mettape.txt?raw';
import demoMid45 from './lib/parsers/fixtures/mid_hor45_mettape.txt?raw';
import demoMid60 from './lib/parsers/fixtures/mid_hor60_mettape.txt?raw';
import demoMid75 from './lib/parsers/fixtures/mid_hor75_mettape.txt?raw';
import demoTweet15 from './lib/parsers/fixtures/tweet_hor15_mettape.txt?raw';
import demoTweet30 from './lib/parsers/fixtures/tweet_hor30_mettape.txt?raw';
import demoTweet45 from './lib/parsers/fixtures/tweet_hor45_mettape.txt?raw';
import demoTweet60 from './lib/parsers/fixtures/tweet_hor60_mettape.txt?raw';
import demoTweet75 from './lib/parsers/fixtures/tweet_hor75_mettape.txt?raw';

type Parsed = ReturnType<typeof parseFrd>;
type ParsedZma = ReturnType<typeof parseZma>;

const ordinal = (n: number): string =>
  n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

/** 'LR4' → {kind:'LR', order:4}; 'auto' (or anything unparsable) → undefined. */
function parseHpLpPref(pref: string): StructChoice | undefined {
  const m = /^(LR|BW|BS)([1-4])$/.exec(pref);
  if (!m) return undefined;
  return { kind: m[1] as FilterKind, order: Number(m[2]) as 1 | 2 | 3 | 4 };
}
interface Loaded {
  name: string;
  raw: string;
  frd: Parsed;
}

/** Minimal typing for the Chromium File System Access API (folder export). */
interface FsWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FsFileHandle {
  createWritable(): Promise<FsWritable>;
}
interface FsDirHandle {
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
}
interface AngleEntry {
  hor: number;
  name: string;
  raw: string;
  frd: Parsed;
}
interface AngleSets {
  woofer: AngleEntry[];
  tweeter: AngleEntry[];
  /** 3-way: the middle branch's angle set (stored; directivity pairing is a
   *  later step). */
  mid?: AngleEntry[];
}
interface ProjectData {
  vxp: VxpProject;
  vxpFile: StoredFile;
  /** Measured impedance per driver model name used in the crossover. */
  impedances: Record<string, ParsedZma>;
  impedanceFiles: Record<string, StoredFile>;
}

const GRID_N = 600;

/**
 * Display-only phase-error tiers for line coloring and zones. Finer than the
 * physical 45/90/120° anchors in integration.ts (which keep driving the
 * score): green is reserved for ≤15° so a "really tight" crossover looks
 * different from a merely acceptable one. Status colors from the dataviz
 * status palette — fixed, never themed. Meaning is never color-alone: the
 * alignment legend pairs each color with its ° range.
 */
type PhaseTier = 'tight' | 'good' | 'ok' | 'marginal' | 'destructive';

const TIER_ORDER: PhaseTier[] = ['tight', 'good', 'ok', 'marginal', 'destructive'];

const TIER_BOUNDS: Record<Exclude<PhaseTier, 'destructive'>, number> = {
  tight: 15,
  good: 45,
  ok: 90,
  marginal: 120,
};

function phaseTier(errorDeg: number): PhaseTier {
  const e = Math.abs(errorDeg);
  if (e <= TIER_BOUNDS.tight) return 'tight';
  if (e <= TIER_BOUNDS.good) return 'good';
  if (e <= TIER_BOUNDS.ok) return 'ok';
  if (e <= TIER_BOUNDS.marginal) return 'marginal';
  return 'destructive';
}

const TIER_COLOR: Record<PhaseTier, string> = {
  tight: '#0ca30c',
  good: '#84a80b',
  ok: '#fab219',
  marginal: '#ec835a',
  destructive: '#d03b3b',
};

const TIER_LABEL: Record<PhaseTier, string> = {
  tight: '≤15° — tight',
  good: '≤45° — full summing',
  ok: '≤90° — ≥3 dB gain',
  marginal: '≤120° — no gain',
  destructive: '>120° — cancelling',
};

/** Toggleable analysis panels (any combination visible; OFF = not computed). */
type PanelKey = 'directivity' | 'sonogram' | 'transfer' | 'impedance' | 'phase' | 'time';

const PANEL_KEYS: PanelKey[] = ['directivity', 'sonogram', 'transfer', 'impedance', 'phase', 'time'];
/** What Compare mode shows: the SPL overlay (always on) and the phase residual. */
const COMPARE_PANELS: Record<PanelKey, boolean> = {
  directivity: false, sonogram: false, transfer: false, impedance: false, phase: true, time: false,
};
type VerifyEntry = { name: string; raw: string; frd: Parsed & { hasPhase: boolean } };

/* Labels the command palette and the 1–5 shortcuts share with the step bar and
 * the expert tabs — one naming, or the palette becomes a second map. */
const GUIDED_STEP_LABEL: Record<'import' | 'drivers' | 'data' | 'filters' | 'network', string> = {
  import: 'Your project',
  data: 'Your cabinet',
  drivers: 'Your drivers',
  filters: 'Design it',
  network: 'Your build',
};
const EXPERT_TAB_LABEL: Record<'import' | 'drivers' | 'data' | 'filters' | 'network', string> = {
  import: 'Import',
  data: 'Setup',
  drivers: 'Setup (drivers)',
  filters: 'Filters',
  network: 'Network',
};

/* Facing directions as short summary labels — t()-keys, one place. */
const FACING_LABEL: Record<string, string> = {
  front: 'front-firing',
  rear: 'rear-firing',
  left: 'left-firing',
  right: 'right-firing',
  up: 'up-firing',
  down: 'down-firing',
};

const PANEL_LABEL: Record<PanelKey, string> = {
  directivity: 'Directivity',
  sonogram: 'Sonogram',
  transfer: 'Filter transfer',
  impedance: 'Impedance',
  phase: 'Phase',
  time: 'Time domain',
};

/** Value that trails `value` by `ms`, and FREEZES entirely while `hold` is
 *  true — the inputs feel instant, the heavy simulation only sees committed
 *  values: nothing propagates while the field has focus, and after blur the
 *  final value lands once. No half-typed "1" of "19500" ever reaches it. */
function useDebounced<T>(value: T, ms: number, hold = false): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (hold) return;
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms, hold]);
  return debounced;
}

type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'ads-theme';

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  });
  useEffect(() => {
    if (theme === 'system') {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem(THEME_KEY);
    } else {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(THEME_KEY, theme);
    }
  }, [theme]);
  return [theme, setTheme];
}

/** Silent ghost level for the missing branch in single-driver mode: at
 *  −400 dB the branch contributes 1e-20 in amplitude — the combined result IS
 *  the solo branch, while every two-branch consumer keeps its shape. Far below
 *  the −60 dB phase-mask and the 20 dB integration-overlap window, so the
 *  ghost never draws a phase line and never counts as overlap. */
const SILENT_GHOST_DB = -400;

/* ------------------------------------------------------------------ *
 * V1 PIN DEFAULTS — LEGACY, and the toggle invariant is why they stay
 * ------------------------------------------------------------------ */

/**
 * The crossover-pin starting values and load fallbacks the v1 route has always
 * used. Every one of them is a FREQUENCY that came out of one project.
 *
 * WHY THIS IS A P6 VIOLATION. P6 (spec A2) forbids a literal frequency in
 * engine or metric code: everything is derived from project data or is an
 * explicit project setting. These steer a design — `xoLowPin` and `xoHighPin`
 * cage the structure search — and they are neither derived nor stated. The
 * audit records the sharpest case (`docs/audit_engineV2_optimizerV1_grens.md`
 * §7): the low default gives 250–550 Hz, while the A5d.3 measurement-validity
 * floor for that pair on the casebook set is 396.7 Hz, so the range begins
 * 147 Hz BELOW the lowest frequency the app itself trusts.
 *
 * WHY THEY ARE STILL HERE. The toggle invariant says that with `engineV2Enabled`
 * off the app is byte-identical to the app before engine2 existed, and
 * `toggleRegression.test.ts` proves it. Deriving these on the v1 route would
 * change v1 behaviour, which is the one thing this project does not do. So they
 * are collected, named, and pinned by `p6Lint.test.ts` — which refuses a
 * frequency literal in a `useState` or fallback position ANYWHERE ELSE in this
 * file, and snapshots this block so nothing can be added to it quietly.
 *
 * They are v1 heritage. They are not a default for anything v2 does: the v2
 * route takes its pin from the A5d.3 windows and the F3c recommended band, and
 * where there is no window there is NO pin and the run says so — it does not
 * fall back to this block.
 *
 * THE DAY THIS BLOCK GOES is the day v2 becomes the default and the invariant
 * it protects stops existing. Until then, removing it is a regression of that
 * guarantee rather than a tidy-up.
 *
 * @p6-legacy v1-pin-defaults
 */
const V1_PIN_DEFAULTS_LEGACY = {
  /** Upper (mid-tweeter on a 3-way) pin centre, Hz, as a field string. */
  highFreqHz: '2200',
  /** Upper pin half-width, Hz, as a field string. */
  highMarginHz: '400',
  /** Lower (woofer-mid) pin centre, Hz, as a field string. */
  lowFreqHz: '400',
  /** Lower pin half-width, Hz, as a field string. */
  lowMarginHz: '150',
  /** Migration fallback for a stored design that predates centre ± margin. */
  legacyRangeLoHz: 1800,
  /** Migration fallback for a stored design that predates centre ± margin. */
  legacyRangeHiHz: 3500,
} as const;

/** Compact frequency label: 9335 → "9.3 kHz", 245 → "245 Hz". */
const hz = (f: number): string =>
  f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`;

/**
 * Simulation counter in the busy card. It arrives in jumps of thousands per
 * progress message; rolling the digits makes a long run read as work in
 * progress rather than a number that redraws. nl-NL grouping as before.
 *
 * Deliberately NOT applied to the elapsed clock or the "N/M done" counter:
 * a digit animating every single second for three minutes is motion the
 * designer has to keep ignoring, and the round counter moves twice a run.
 */
function SimCount({ value }: { value: number }) {
  // aria-label because NumberFlow paints its digits as shadow-DOM spans with
  // no readable text: without this the busy card's live region announces
  // "0/3 done · sims · best dB / °" — every number missing.
  return (
    <NumberFlow value={value} locales="nl-NL" aria-label={value.toLocaleString('nl-NL')} />
  );
}

/** Best-so-far ripple/phase. These only move when the optimizer actually
 *  improves, so the roll IS the signal — it marks the moment of progress.
 *  en-US on purpose: a decimal DOT, matching every other toFixed() readout. */
function BestMetric({ value, digits }: { value: number; digits: number }) {
  return (
    <NumberFlow
      value={value}
      locales="en-US"
      format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }}
      aria-label={value.toFixed(digits)}
    />
  );
}

/** Map a solved network's drivers to the woofer/tweeter voltage transfers by
 *  SLOT (not hard-coded model name), so an imported vxp with freely-named
 *  drivers still gets its crossover applied. */
function slotTransfers(sol: {
  drivers: { id: string; model: string }[];
  transfers: Record<string, Complex[]>;
}): { hW: Complex[] | null; hT: Complex[] | null } {
  const { woofer, tweeter } = pickSlots(sol.drivers);
  return {
    hW: woofer ? sol.transfers[woofer.id] ?? null : null,
    hT: tweeter ? sol.transfers[tweeter.id] ?? null : null,
  };
}

/** 3-way variant: resolve the solved network's drivers to low/mid/high via
 *  pickSlotsN. Ambiguous names refuse with the message (surfaced as the sim's
 *  crossover error) rather than guessing which branch is which. */
/**
 * How a finished scan row reads — and it may not read like a success when it
 * is not one.
 *
 * TWO THINGS WENT WRONG HERE AT ONCE (Sanders run, aug 2026, "de resultaten
 * begrijp ik niet omwille alle meldingen van de amp load"):
 *
 * 1. Every rejected candidate was flagged `⚠Z`, because `zOk` is not an
 *    impedance verdict at all — it is `!safetyNote && the repair did not
 *    fail`, and the safety gate rejects on FOUR different physical failures.
 *    A vanished crossing reported itself as an amplifier-load problem and
 *    sent the designer to the wrong panel. The category now comes from
 *    `safetyKinds`, recorded by the engine where the decision is made.
 *
 * 2. A rejected tune returns the SEED (`tuned: 0`, `after` = `before`), and
 *    the row showed those seed numbers behind a green ✓. Five of five in his
 *    run — so the whole scan read as five finished designs when not one of
 *    them had a tune that survived. It says "seed" now, because that is what
 *    the numbers describe.
 */
/**
 * Hand the browser two frames so a state change actually reaches the screen
 * before a long synchronous block starts.
 *
 * WHY IT IS NEEDED (Sander, aug 2026: "ik klikte op Optimize en er gebeurt
 * niets… oh nu pas"): a click handler runs to completion before React paints.
 * The three-way setup — grids, banded angle sets, the safety grid, one input
 * object per candidate — is hundreds of milliseconds to ten seconds of work,
 * and every bit of it used to run BEFORE `setVfBusy(true)` could show the busy
 * card. The button looked dead for exactly as long as the machine was busiest.
 *
 * Two frames rather than one: the first lets React commit, the second lets the
 * compositor put it on screen.
 *
 * ⚠ AND A TIMEOUT BESIDE THEM, because requestAnimationFrame DOES NOT FIRE IN
 * A HIDDEN OR UNFOCUSED WINDOW. Without it this helper made things worse than
 * the delay it was written for: click Optimize, switch to another window to
 * say "nothing is happening" — and nothing was, because the scan was parked on
 * a frame that would never arrive until you came back. A late card is a
 * cosmetic complaint; a run that does not start is not.
 *
 * (The same lesson is already written down for the landing page: a hidden page
 * delivers no IntersectionObserver callbacks either. I rebuilt it anyway.)
 *
 * Whichever comes first wins: paint when visible, 250 ms when not.
 */
const nextPaint = (): Promise<void> =>
  new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    setTimeout(finish, 250);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });

function scanRowVerdict(r: Chain3Result): { text: string; warn?: string } {
    const nums = `${r.net.after.rippleDb.toFixed(2)} dB/${r.net.after.phaseDeg.toFixed(1)}°`;
    const kinds = r.net.safetyKinds ?? [];
    const LABEL: Record<string, string> = {
      crossing: t('⚠ crossing lost'),
      valley: t('⚠ crossing hole'),
      protection: t('⚠ tweeter'),
      load: t('⚠ amp load'),
    };
    if (kinds.length > 0) {
      // The tune was thrown away: these are the seed's numbers.
      return { text: `${t('seed')} ${nums}`, warn: kinds.map((k) => LABEL[k]).join(' ') };
    }
    if (r.net.ampFloorRepair === 'failed' || r.net.ampFloorRepair === 'refused') {
      return { text: `✓ ${nums}`, warn: t('⚠ amp load') };
    }
    // zOk false with no kinds and no repair verdict should not happen; say
    // so rather than inventing a category.
    if (!r.zOk) return { text: `✓ ${nums}`, warn: t('⚠ rejected') };
    return { text: `✓ ${nums}` };
}

/**
 * F2b — the scan table's GATE cell, as text.
 *
 * The DECISION lives in `gateCellState` (pure, tested, and free of any
 * comparison of its own); this wrapper only chooses words and a glyph. The
 * same family as the ⚠Z column beside it, and deliberately not a second
 * warning rule.
 */
function gateCell(entry?: { verdicts: GateVerdict[]; violation: string | null }): {
  text: string;
  title: string;
  bad: boolean;
} {
  const st = gateCellState(entry);
  const detail = st.detail.join('\n');
  switch (st.kind) {
    case 'absent':
      return {
        text: '—',
        title: t('This candidate did not come from an engine-v2 run, so no gate judged it.'),
        bad: false,
      };
    case 'noLimit':
      return {
        text: t('no limit'),
        title: `${t('Engine v2 ran this candidate, but no gate limit is set — every gate reports its value and judges nothing (P4).')}\n${detail}`,
        bad: false,
      };
    case 'fail':
      return { text: `⚠ ${st.failed.join(' ')}`, title: `${st.violation ?? ''}\n${detail}`, bad: true };
    default:
      return { text: `✓ ${st.activeCount}`, title: `${t('Inside every stated gate.')}\n${detail}`, bad: false };
  }
}

function slotTransfersN(sol: {
  drivers: { id: string; model: string }[];
  transfers: Record<string, Complex[]>;
}): { hW: Complex[] | null; hM: Complex[] | null; hT: Complex[] | null; ambiguous?: string } {
  const slots = pickSlotsN(sol.drivers);
  if (slots.ambiguous) return { hW: null, hM: null, hT: null, ambiguous: slots.ambiguous };
  return {
    hW: slots.woofer ? sol.transfers[slots.woofer.id] ?? null : null,
    hM: slots.mid ? sol.transfers[slots.mid.id] ?? null : null,
    hT: slots.tweeter ? sol.transfers[slots.tweeter.id] ?? null : null,
  };
}

/**
 * Complex driver impedances resampled onto `grid`, keyed BOTH by each driver's
 * own model name AND by its mid/tweeter SLOT. Synthesized networks use models
 * 'mid'/'tweeter', vxp-imported networks use the real model names, and the
 * design chain hardcodes `driverZ.mid`/`.tweeter` — so a single map keyed both
 * ways resolves for every consumer. Without the slot aliases, a project loaded
 * from a .vxp (impedances keyed "Woofer 12w8524"/"Tweeter r2604-83200") left
 * `driverZ.mid` undefined and the synthesis crashed ("reading '<xo index>'").
 */
function zGridWithSlots(
  impedances: Record<string, ParsedZma>,
  grid: readonly number[],
): Record<string, Complex[]> {
  const out: Record<string, Complex[]> = {};
  for (const [model, z] of Object.entries(impedances)) {
    out[model] = resampleImpedance(z.freq, z.magnitude, z.phase, grid).z;
  }
  return withSlotAliasesN(out);
}

/**
 * Excess-phase delay of a driver: measured phase minus its minimum-phase
 * reconstruction, fitted as a pure delay (ms). THE bridge quantity for any
 * minimum-phase consumer (VituixCAD's Delay field sits ON TOP of its own
 * reconstruction). Not interchangeable with the raw bulk-delay fit: that one
 * is contaminated by each driver's minimum-phase slope — measured on KOAN the
 * raw Δ says tweeter +47 µs LATER while the excess Δ says 50 µs EARLIER (the
 * tweeter physically sits ~17 mm proud of the mid), and only the excess-based
 * bridge reproduces the measured relative phase (~2° vs ~78° error).
 */
/**
 * Passive-only migration for restored projects/autosaves: EQ boosts clamp to
 * 0 dB (the UI no longer accepts them, and a passive build never realises
 * them), and a positive driver gain is normalised away by shifting BOTH
 * branch gains down by the common excess — clamping one side alone would
 * silently shift the woofer/tweeter balance a legacy design relied on.
 */
function sanitizePassiveSpecs(specs: {
  woofer: DriverFilterSpec;
  tweeter: DriverFilterSpec;
  mid?: DriverFilterSpec;
}): {
  woofer: DriverFilterSpec;
  tweeter: DriverFilterSpec;
  mid?: DriverFilterSpec;
} {
  // The common shift spans ALL branches present, so the inter-branch balance
  // of a legacy design stays exactly intact.
  const shift = Math.max(specs.woofer.gainDb, specs.tweeter.gainDb, specs.mid?.gainDb ?? 0, 0);
  const fix = (s: DriverFilterSpec): DriverFilterSpec => ({
    ...s,
    gainDb: Math.round((s.gainDb - shift) * 10) / 10,
    eq: s.eq.map((b) => (b.gainDb > 0 ? { ...b, gainDb: 0 } : b)),
  });
  return {
    woofer: fix(specs.woofer),
    tweeter: fix(specs.tweeter),
    ...(specs.mid ? { mid: fix(specs.mid) } : {}),
  };
}

/** Break a phase polyline at ±180° wrap seams (NaN gap) instead of drawing
 *  vertical jumps. Mutates and returns the array. */
function breakPhaseWraps(arr: number[]): number[] {
  for (let i = 1; i < arr.length; i++) {
    if (Math.abs(arr[i] - arr[i - 1]) > 180) arr[i - 1] = NaN;
  }
  return arr;
}

const wrapPhaseDeg = (d: number): number => {
  let v = d % 360;
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return v;
};

/**
 * The 3-way phase headline as ONE stitched line: mid-vs-woofer inside the W-M
 * overlap window, tweeter-vs-mid inside the M-T one, a gap in between (nothing
 * hands over there). A pair's relative phase is meaningless outside its own
 * window, so one line can honestly carry both.
 *
 * Shared by the live curve and the comparison ghosts on purpose. Two consumers
 * each re-deriving "which pair owns this frequency" is exactly the bug family
 * this codebase keeps paying for — a ghost drawn on a different stitching rule
 * than the live line is not a comparison.
 */
function stitchPairPhase(
  lowPh: readonly number[],
  midPh: readonly number[],
  highPh: readonly number[],
  freq: readonly number[],
  low: { points: { cls: unknown; phaseErrorDeg: number }[]; overlapCentreHz: number | null },
  high: { points: { cls: unknown; phaseErrorDeg: number }[]; overlapCentreHz: number | null },
): { y: number[]; colors: (string | null)[] } {
  // Each pair's window as ONE CONTIGUOUS span (first..last overlap point). The
  // raw per-point |ΔdB| ≤ 20 test flickers at the edges — that drew bites and
  // orphan islands; interior points that briefly fail it still carry a
  // perfectly meaningful relative phase.
  const spanOf = (pts: { cls: unknown }[]): [number, number] | null => {
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].cls !== null) {
        if (lo < 0) lo = i;
        hi = i;
      }
    }
    return lo >= 0 ? [lo, hi] : null;
  };
  const lowSpan = spanOf(low.points);
  const highSpan = spanOf(high.points);
  // Where both pairs claim a frequency, the geometric mean of the two overlap
  // centres decides: below it the low pair owns the handover.
  const split =
    low.overlapCentreHz !== null && high.overlapCentreHz !== null
      ? Math.sqrt(low.overlapCentreHz * high.overlapCentreHz)
      : null;
  const y: number[] = new Array(freq.length).fill(NaN);
  const colors: (string | null)[] = new Array(freq.length).fill(null);
  for (let i = 0; i < freq.length; i++) {
    const lowOn = lowSpan !== null && i >= lowSpan[0] && i <= lowSpan[1];
    const highOn = highSpan !== null && i >= highSpan[0] && i <= highSpan[1];
    if (lowOn && (!highOn || (split !== null && freq[i] < split))) {
      y[i] = wrapPhaseDeg(midPh[i] - lowPh[i]);
      colors[i] = TIER_COLOR[phaseTier(low.points[i].phaseErrorDeg)];
    } else if (highOn) {
      y[i] = wrapPhaseDeg(highPh[i] - midPh[i]);
      colors[i] = TIER_COLOR[phaseTier(high.points[i].phaseErrorDeg)];
    }
  }
  return { y, colors };
}

/** Old → new value rows for the tune-diff table: L/C/R parts matched by
 *  partId whose value param moved. Values stay in the schematic's display
 *  units (mH/µF/Ω). Removed/added parts are already named in the note. */
function diffTunedParts(
  seed: readonly VxpPart[],
  tuned: readonly VxpPart[],
): { id: string; from: number; to: number; unit: string }[] {
  const PARAMS: Record<string, { name: string; unit: string }> = {
    Inductor: { name: 'L', unit: 'mH' },
    Capacitor: { name: 'C', unit: 'µF' },
    Resistor: { name: 'R', unit: 'Ω' },
  };
  const valueOf = (p: VxpPart): { v: number; unit: string } | null => {
    const meta = PARAMS[p.type];
    if (!meta || p.partId === undefined || p.open || p.shorted) return null;
    const v = p.params.find((q) => q.name === meta.name)?.value;
    return v === undefined ? null : { v, unit: meta.unit };
  };
  const seedVal = new Map<string, { v: number; unit: string }>();
  for (const p of seed) {
    const sv = valueOf(p);
    if (sv && p.partId) seedVal.set(p.partId, sv);
  }
  const rows: { id: string; from: number; to: number; unit: string }[] = [];
  for (const p of tuned) {
    const tv = valueOf(p);
    if (!tv || !p.partId) continue;
    const sv = seedVal.get(p.partId);
    if (!sv || sv.unit !== tv.unit) continue;
    if (Math.abs(tv.v - sv.v) <= Math.abs(sv.v) * 5e-4) continue; // unchanged
    rows.push({ id: p.partId, from: sv.v, to: tv.v, unit: tv.unit });
  }
  return rows;
}

/** One-line summary of a driver's virtual filter, for the collapsed header. */
function filterSummaryLine(spec: DriverFilterSpec, side: 'woofer' | 'mid' | 'tweeter'): string {
  const name = side === 'woofer' ? t('Woofer/mid') : side === 'mid' ? t('Mid') : t('Tweeter');
  const parts: string[] = [];
  if (spec.hp.enabled) parts.push(`HP ${spec.hp.kind}${spec.hp.order} @${Math.round(spec.hp.freq)}`);
  if (spec.lp.enabled) parts.push(`LP ${spec.lp.kind}${spec.lp.order} @${Math.round(spec.lp.freq)}`);
  const nEq = spec.eq.filter((b) => b.enabled).length;
  if (nEq > 0) parts.push(`${nEq} EQ`);
  return `${name}: ${parts.length > 0 ? parts.join(', ') : t('flat')}`;
}

/** One branch's near-field material: the cone measurement, an optional port or
 *  passive-radiator measurement, and the splice settings. */
interface NearFieldSlot {
  cone: StoredFile | null;
  port: StoredFile | null;
  /** Effective diameter of the port mouth, mm — its weight in Keele's sum. */
  portDiaMm: string;
  /** Blend centre, Hz. Empty = the app proposes one. */
  transitionHz: string;
  blendOctaves: string;
  /** Put the baffle step back into the half-space near field. */
  stepOn: boolean;
  stepDepthDb: string;
}
const emptyNearField = (): NearFieldSlot => ({
  cone: null,
  port: null,
  portDiaMm: '',
  transitionHz: '',
  blendOctaves: '1',
  stepOn: true,
  stepDepthDb: '6',
});

/**
 * Per-branch measurement metadata for engine v2 (A5a, F3b).
 *
 * Strings throughout and '' means ABSENT, exactly like the cabinet form beside
 * it: these feed a layer whose whole discipline is that a missing input turns
 * a metric off with a reason rather than substituting a default (P4).
 */
interface V2MeasurementMeta {
  /** Acoustic centre on the vertical axis, mm. '' = use the cabinet position. */
  zMm: string;
  /** '', 'yes' or 'no' — three states, because "not stated" is one of them. */
  rotSym: string;
  /** DC resistance measured with a meter, Ω. Outranks both sweep derivations. */
  reOhm: string;
  /** Manual window: the impulse's t=0 reference, ms. */
  refTimeMs: string;
  /** Manual window: the right window edge, ms. */
  rightWindowMs: string;
  /** Or the hard validity floor itself, Hz — for a window known by its result. */
  floorHz: string;
  /** Where the designer got these numbers. Travels with the provenance. */
  windowNote: string;
  /** V49 — force factor Bl, T·m, from the datasheet. '' = absent. */
  blTm: string;
  /** V49 — moving mass M_ms, g, from the datasheet. '' = absent. */
  mmsG: string;
  /** V49 — the drive voltage (V rms) the on-axis far field was taken at. '' = not documented. */
  driveVoltageV: string;
  /** V50 — the stated M-C figure for THIS way, dB re its passband. '' = none
   *  per way; the single field decides, and blank there = the derived ceiling
   *  alone (or nothing). */
  driveOnFsMaxDb: string;
  /** V51 — how the way's N identical drivers (count on the cabinet form) were
   *  wired when MEASURED: '', 'parallel' or 'series'. '' = not stated. */
  wiringMeasured: string;
  /** V51 — how the design intends to wire them. '' = not stated. */
  wiringDesired: string;
  /** A5e.3 — the COIL FAMILY this way is wound with (brand|series|gauge, the
   *  id `coilDcr.ts` fits per family on the loaded catalogue). '' = not
   *  stated: the way's coils are lossless in every judgement, and the report
   *  says so as a deviation from any build. Never a default (P6). */
  coilFamily: string;
}

const emptyV2Meas = (): V2MeasurementMeta => ({
  zMm: '',
  rotSym: '',
  reOhm: '',
  refTimeMs: '',
  rightWindowMs: '',
  floorHz: '',
  windowNote: '',
  blTm: '',
  mmsG: '',
  driveVoltageV: '',
  driveOnFsMaxDb: '',
  wiringMeasured: '',
  wiringDesired: '',
  coilFamily: '',
});

/** Cabinet geometry + measurement context, as typed (strings so a field can be
 *  empty; every consumer treats absent as "criterion does not apply"). */
interface CabinetDriver {
  /** Offset from the measurement reference point, mm. +x right, +y up. */
  xMm: string;
  yMm: string;
  enclosure: Enclosure;
  /** Box corner: Fc for sealed, Fb for ported. */
  fbHz: string;
  /** How many IDENTICAL drivers make up this branch ('' or '1' = one). Dual
   *  woofers are ordinary (MTM, 2.5-way), and the count is not cosmetic: n
   *  drivers displace n times the air, so the excursion floor drops by √n —
   *  while each cone still beams as itself, which is why Sd stays the single
   *  driver's datasheet value instead of being pre-multiplied. */
  count: string;
  /** Centre-to-centre spacing BETWEEN those drivers, mm. Only meaningful when
   *  count > 1: it sets where the array's own vertical lobing starts, which is
   *  a different (and usually lower) ceiling than cone beaming. */
  spacingMm: string;
  /** How far the acoustic centre sits behind the baffle plane, mm. '' = 0 =
   *  on the baffle, which is what a normal front-mounted driver effectively
   *  is. A side-firing woofer's centre is typically half a cabinet back, and
   *  that is hundreds of microseconds of pure geometry. */
  depthMm: string;
  /** Which way the driver radiates. Side-firing woofers are an ordinary
   *  design; without this the app judges their angle, their baffle and their
   *  arrival time against the front panel they are not on. */
  facing: DriverFacing;
  /** Sloped/stepped baffle: degrees this driver is aimed further UP. */
  tiltDeg: string;
  /** count > 1 drivers sit on BOTH opposing panels, firing away from each
   *  other — how side-mounted woofers are normally built (force cancelling). */
  opposed: boolean;
}
interface CabinetState {
  /**
   * Microphone distance during the FRD sweeps, mm.
   *
   * ⚠ ONE GLOBAL NUMBER FOR EVERY SWEEP, AND THAT IS NOT WHAT A DATASET LOOKS
   * LIKE. Sanders Koan measurements were taken in two sessions with different
   * geometry — session 1 with the mic 935 mm high, session 2 at 1000 mm
   * distance and 1387 mm high — and this field can only hold one of them. It
   * surfaced through the gate: the 4.5 ms sitting in `gateMs` was session 1's
   * mid window, standing in for branches measured in session 2 (see A3h).
   *
   * The gate half is fixed — a file states its own window. This half cannot be
   * fixed the same way: ARTA writes no distance into the export, so it needs a
   * field PER SOURCE rather than a better parser. It is not cosmetic — mic
   * distance feeds `trueOffAxisDeg`, the rig path excess, the derived mounting
   * depth and the far-field verdict, so getting it wrong moves physics and not
   * just a band.
   *
   * Deliberately left as is until A5 (positions per source), where the per-
   * source record exists to put it on. Written down here so A5 meets it.
   */
  micDistanceMm: string;
  /** Fixed VERTICAL angle of the rig, degrees; + = mic above the reference
   *  plane. Usually 0 (mic level with the reference point). Signed on purpose:
   *  on a driver 380 mm low at 500 mm, ±10° swings the true angle 31°↔43°. */
  micElevationDeg: string;
  /** The reflection-free window the operator used, ms — a claim about the RIG,
   *  for the cabinet ledger's "honest down to" line.
   *
   *  A3h: it no longer stands in for a file that states no window. A window
   *  belongs to a sweep, not to a project — Sanders 4.5 ms was the mid gate
   *  from an earlier session at 935 mm and silently became the data floor for
   *  two branches measured at 1 m through a 5.021 ms window. The files decide
   *  their own validity now, and where they all agree the ledger reads them
   *  rather than this field. '' = predict from geometry. */
  gateMs: string;
  baffleWidthMm: string;
  baffleHeightMm: string;
  /** Front-to-back, mm. Only needed once a driver fires sideways: then THAT
   *  is the width of the panel it radiates from. */
  cabinetDepthMm: string;
  /** How far below the top of the baffle the reference point sits, mm. */
  refFromTopMm: string;
  /** Height of the reference point above the floor, mm. */
  refHeightMm: string;
  listenDistanceM: string;
  listenEarHeightMm: string;
  /** Which driver the microphone was aimed at, if any. That driver IS the
   *  reference point, so its offset is 0,0 BY DEFINITION — the app should
   *  know it rather than ask for it (Sander: "de tweeter is toch de
   *  reference? dan hoef ik toch geen offset in te vullen?"). '' = the mic
   *  was aimed at some other spot and every driver has a real offset. */
  refDriver: '' | BranchRole;
  drivers: Record<BranchRole, CabinetDriver>;
}
const emptyCabinetDriver = (): CabinetDriver => ({
  xMm: '',
  yMm: '',
  enclosure: 'unknown',
  fbHz: '',
  count: '',
  spacingMm: '',
  depthMm: '',
  facing: 'front',
  tiltDeg: '',
  opposed: false,
});
const emptyCabinet = (): CabinetState => ({
  micDistanceMm: '',
  micElevationDeg: '',
  gateMs: '',
  baffleWidthMm: '',
  baffleHeightMm: '',
  cabinetDepthMm: '',
  refFromTopMm: '',
  refHeightMm: '',
  listenDistanceM: '',
  listenEarHeightMm: '',
  refDriver: '',
  drivers: { low: emptyCabinetDriver(), mid: emptyCabinetDriver(), high: emptyCabinetDriver() },
});
const FACINGS: readonly DriverFacing[] = ['front', 'rear', 'left', 'right', 'up', 'down'];
/** A stored facing, or 'front' — an unknown value must read as the ordinary
 *  case, never crash a restore. */
const asFacing = (v: string | undefined): DriverFacing =>
  FACINGS.find((f) => f === v) ?? 'front';

/** Restore a cabinet block from a project/autosave, filling every gap with the
 *  empty default — an older file simply has no geometry, and that must read as
 *  "not entered", never as a zero position at the reference point. */
function mergeCabinet(raw: ProjectDesign['cabinet']): CabinetState {
  const base = emptyCabinet();
  if (!raw) return base;
  const roles: BranchRole[] = ['low', 'mid', 'high'];
  const drivers = { ...base.drivers };
  for (const r of roles) {
    const d = raw.drivers?.[r];
    if (!d) continue;
    const enc = d.enclosure;
    drivers[r] = {
      xMm: d.xMm ?? '',
      yMm: d.yMm ?? '',
      enclosure:
        enc === 'sealed' || enc === 'ported' || enc === 'open' ? (enc as Enclosure) : 'unknown',
      fbHz: d.fbHz ?? '',
      count: d.count ?? '',
      spacingMm: d.spacingMm ?? '',
      depthMm: d.depthMm ?? '',
      facing: asFacing(d.facing),
      tiltDeg: d.tiltDeg ?? '',
      opposed: d.opposed === true,
    };
  }
  return {
    micDistanceMm: raw.micDistanceMm ?? '',
    micElevationDeg: raw.micElevationDeg ?? '',
    gateMs: raw.gateMs ?? '',
    baffleWidthMm: raw.baffleWidthMm ?? '',
    baffleHeightMm: raw.baffleHeightMm ?? '',
    cabinetDepthMm: raw.cabinetDepthMm ?? '',
    refFromTopMm: raw.refFromTopMm ?? '',
    refHeightMm: raw.refHeightMm ?? '',
    listenDistanceM: raw.listenDistanceM ?? '',
    listenEarHeightMm: raw.listenEarHeightMm ?? '',
    refDriver:
      raw.refDriver === 'low' || raw.refDriver === 'mid' || raw.refDriver === 'high'
        ? raw.refDriver
        : '',
    drivers,
  };
}

/** A driver's placement, or null when it has not been entered. Both numbers
 *  must be present — half a position is not a position. */
function placementOf(d: CabinetDriver): DriverPlacement | null {
  const x = Number(d.xMm);
  const y = Number(d.yMm);
  if (d.xMm.trim() === '' || d.yMm.trim() === '' || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  const depth = Number(d.depthMm);
  const tilt = Number(d.tiltDeg);
  return {
    xMm: x,
    yMm: y,
    depthMm: d.depthMm.trim() !== '' && Number.isFinite(depth) ? depth : 0,
    facing: d.facing ?? 'front',
    tiltDeg: d.tiltDeg.trim() !== '' && Number.isFinite(tilt) ? tilt : 0,
    // Opposed only means anything with more than one driver in the branch.
    opposed: d.opposed === true && Number(d.count) > 1,
  };
}


/**
 * Source resistance of the network a candidate would ACTUALLY build.
 *
 * `audit.rSourceOhm` is frozen at gate 4, before the shrink ladder and the
 * catalog snap — and both of those still move this number. Measured on Sanders
 * 562/2270 candidate: the audit reads 2.0002 Ω (and the row was struck through)
 * while the delivered network measures 1.64 Ω, inside the 2.0 Ω limit. Column,
 * glyph and ranking all read this one so they cannot disagree about a row.
 */
const rSrcDelivered = (r: {
  net: { after: { rSourceOhm?: number | null } };
}): number | null => r.net.after.rSourceOhm ?? null;

/** A driver's own PASSBAND: where it plays within 10 dB of its upper-quartile
 *  level. File extent is useless (FRDs run from 5 Hz), and a delay fitted
 *  through octaves with no output is not a delay. */
function passBandOf(frd: Parsed): [number, number] | null {
  const sorted = [...frd.spl].sort((x, y) => x - y);
  const ref = sorted[Math.floor(sorted.length * 0.75)] - 10;
  let lo = -1;
  let hi = -1;
  for (let i = 0; i < frd.freq.length; i++) {
    if (frd.spl[i] >= ref) {
      if (lo < 0) lo = i;
      hi = i;
    }
  }
  return lo >= 0 && hi > lo ? [frd.freq[lo], frd.freq[hi]] : null;
}

/** Excess-phase bulk delay fitted INSIDE the driver's own passband (clamped
 *  to 200–10 000 Hz where the FFT minimum-phase reconstruction is trustworthy),
 *  with the fit's R². Used for the measured mounting depth: a woofer fitted over
 *  500–5000 Hz is judged mostly outside its band (Sanders pair: 675 µs there
 *  vs ~700 µs in band). The VituixCAD bridge keeps `excessDelayMsOf` — its
 *  KOAN values are pinned and the two agree within a few µs on normal drivers. */
function excessDelayInBand(
  frd: Parsed,
  /** Optional ceiling on the fit band, Hz — a multi-driver branch measured
   *  off its own axis interferes with itself above c/(2·Δpath), and excess
   *  phase through a comb is not a delay (Sanders woofer pair: 674–785 µs
   *  depending on how much of 1.5–7 kHz the band included). */
  maxHz = Infinity,
): { delayMs: number; rSquared: number; band: [number, number] } | null {
  try {
    const pb = passBandOf(frd);
    if (!pb) return null;
    const lo = Math.max(pb[0], 200, frd.freq[0] * 1.05) * 1.2;
    const hi = Math.min(pb[1], 10000, maxHz, frd.freq[frd.freq.length - 1] * 0.95) * 0.85;
    if (hi <= lo * 1.5) return null;
    const top = Math.min(20000, frd.freq[frd.freq.length - 1]);
    const g = resample(frd.freq, frd.spl, frd.phase, logspace(Math.max(frd.freq[0] * 1.05, lo / 4), top, 400));
    const mp = minimumPhaseDeg(g.freq, g.spl);
    const excess = g.phaseDeg.map((p, i) => p - mp[i]);
    const r = estimateBulkDelay(g.freq, excess, [lo, hi]);
    return { delayMs: r.delayMs, rSquared: r.rSquared, band: [lo, hi] };
  } catch {
    return null;
  }
}

/** Parse a numeric field, falling back when blank/invalid (module-level twin
 *  of the component's `num`, usable before that const is initialised). */
function numOf(s: string, fallback: number): number {
  const v = Number(s);
  return s.trim() !== '' && Number.isFinite(v) ? v : fallback;
}

/** Linear interpolation of ys at x over a sorted xs (edges clamped). */
function interpAt(xs: readonly number[], ys: readonly number[], x: number): number | null {
  if (xs.length === 0) return null;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 1; i < xs.length; i++)
    if (xs[i] >= x) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + t * (ys[i] - ys[i - 1]);
    }
  return ys[ys.length - 1];
}

/** A driver's HOT terminal — the one NOT on the ground net — via union-find
 *  over coincident points plus wire fusion. Used to hang an LCR trap on it. */
function driverHotPoint(
  parts: readonly VxpPart[],
  model: string,
): { x: number; y: number } | null {
  const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
  const parent = new Map<string, string>();
  const add = (k: string) => {
    if (!parent.has(k)) parent.set(k, k);
  };
  const find = (k: string): string => {
    while (parent.get(k) !== k) k = parent.get(k)!;
    return k;
  };
  const union = (a: string, b: string) => {
    add(a);
    add(b);
    parent.set(find(a), find(b));
  };
  // Coincident points share a key, so they are already one node.
  for (const p of parts) for (const w of p.wires) add(key(w));
  // A wire fuses all of its own points into one net.
  for (const p of parts)
    if (p.type === 'Wire')
      for (let i = 1; i < p.wires.length; i++) union(key(p.wires[0]), key(p.wires[i]));
  const groundRoots = new Set<string>();
  for (const p of parts)
    if (p.type === 'Ground' && p.wires[0]) groundRoots.add(find(key(p.wires[0])));
  const drv = parts.find(
    (p) => p.type === 'Driver' && (p as { model?: string }).model === model,
  );
  if (!drv || drv.wires.length < 2) return null;
  const [t0, t1] = drv.wires;
  if (!groundRoots.has(find(key(t0)))) return t0;
  if (!groundRoots.has(find(key(t1)))) return t1;
  return t0;
}

export default function App() {
  const [theme, setTheme] = useTheme();
  /* Language: module-level store (registered dictionaries, english-as-key
   * t()); subscribing HERE re-renders the whole app on a switch, which is
   * exactly what a language switch should do. */
  const uiLang = useSyncExternalStore(subscribeLang, currentLang);
  const [woofer, setWoofer] = useState<Loaded | null>(null);
  const [tweeter, setTweeter] = useState<Loaded | null>(null);
  /** 3-way: the MIDDLE branch's response. The `woofer`/`tweeter` states are
   *  the low/high branch ROLES (name-agnostic — KOAN's low driver is called
   *  "mid"); this is the third role, phase-4 trede 2b. */
  const [midDrv, setMidDrv] = useState<Loaded | null>(null);
  const [project, setProject] = useState<ProjectData | null>(null);
  /** VituixCAD phase reference: its FILTERED woofer + tweeter responses, so we
   *  can draw its relative phase (tweeter − woofer) in OUR convention. */
  /** Measured response of the BUILT system, for the model-vs-measurement
   *  overlay (VALIDATIE.md loop). Persisted with the project. */
  /** Verification measurements of the BUILT system. Compare mode keeps a
   *  LIST (build v1, build v2, …) so "did it get better?" is one click; the
   *  active entry is what every chart and verdict reads. Same-named file
   *  reloads replace in place — "reload replaces" was the single-slot rule
   *  and it still holds per name. */
  const [verifyList, setVerifyList] = useState<VerifyEntry[]>([]);
  const [verifyIx, setVerifyIx] = useState(0);
  const verify: VerifyEntry | null =
    verifyList.length > 0 ? verifyList[Math.min(verifyIx, verifyList.length - 1)] : null;
  const setVerify = (v: VerifyEntry | null) => {
    if (v === null) {
      setVerifyList([]);
      setVerifyIx(0);
      return;
    }
    setVerifyList((l) => {
      const i = l.findIndex((e) => e.name === v.name);
      const next = i >= 0 ? l.map((e, j) => (j === i ? v : e)) : [...l, v];
      // Idempotent side effect: the same result under a StrictMode double call.
      setVerifyIx(i >= 0 ? i : next.length - 1);
      return next;
    });
  };
  const removeVerify = (ix: number) => {
    setVerifyList((l) => l.filter((_, j) => j !== ix));
    setVerifyIx((cur) => (cur > ix ? cur - 1 : cur === ix ? Math.max(0, cur - 1) : cur));
  };
  const [refResp, setRefResp] = useState<{ woofer: Parsed; tweeter: Parsed; names: string } | null>(
    null,
  );
  /** Standalone per-branch impedances (ZMA in the driver file dialogs), keyed
   *  by branch ROLE — storage speaks roles since trede 2b; model names belong
   *  to the netlist. The vxp project is NOT required for solving/synthesis. */
  const [zStandalone, setZStandalone] = useState<
    Partial<Record<BranchRole, { file: StoredFile; zma: ParsedZma }>>
  >({});

  /** Any middle-branch DATA exists (response or impedance) — drives labels
   *  and the "mid not in play yet" warning. */
  const hasMidBranch = !!midDrv || !!zStandalone.mid;

  /** 3-way mode: all three RESPONSES loaded. The sim then sums via combineN.
   *  Everything downstream now speaks pairs; what stays two-way is only what
   *  is inherently a single-pair quantity (the overall integration score —
   *  `pairScores` reports per adjacent pair instead). */
  const threeWay = !!(woofer && midDrv && tweeter);
  /** Mid data without a full 3-way cannot be placed — say so loudly and keep
   *  it out of the sim AND the solver map (signalling, never a silent guess).
   *  Publishing the mid Z while !threeWay would shift the 2-way canonical
   *  keys under a running design — exactly the quiet wrongness to avoid. */
  const midIgnored = hasMidBranch && !threeWay;

  /** All measured impedances by model: vxp-project ones + standalone ZMAs
   *  published under their role's canonical model name (standalone wins on
   *  collision — the file you just picked is the truth). Outside 3-way mode
   *  this yields exactly the historical 'mid'/'tweeter' keys, and the mid
   *  branch's Z stays out entirely (see midIgnored). */
  const impedances = useMemo(() => {
    const out: Record<string, ParsedZma> = { ...(project?.impedances ?? {}) };
    for (const [role, v] of Object.entries(zStandalone)) {
      if (!v) continue;
      if (role === 'mid' && !threeWay) continue;
      out[canonicalModelForRole(role as BranchRole, threeWay)] = v.zma;
    }
    return out;
  }, [project, zStandalone, threeWay]);

  /** Reverse bridge for file-level consumers (map export): the standalone Z
   *  entry whose canonical model name matches a netlist model, if any. */
  const zStandaloneForModel = (model: string) => {
    for (const role of ['low', 'mid', 'high'] as const) {
      if (canonicalModelForRole(role, threeWay) === model) return zStandalone[role];
    }
    return undefined;
  };

  /** The ≥2×Fs rule from a measured impedance: a hard floor for a branch's
   *  HP knee. Null without a pronounced resonance peak (≥1.4× the plateau
   *  just above it) inside [lo, hi] — the driver-family's plausible Fs range. */
  const fsFloorFrom = (z: ParsedZma | undefined, lo: number, hi: number): number | null => {
    if (!z) return null;
    let fPk = 0;
    let zPk = 0;
    for (let i = 0; i < z.freq.length; i++) {
      if (z.freq[i] < lo || z.freq[i] > hi) continue;
      if (z.magnitude[i] > zPk) {
        zPk = z.magnitude[i];
        fPk = z.freq[i];
      }
    }
    if (!fPk) return null;
    let ref = 0;
    let n = 0;
    for (let i = 0; i < z.freq.length; i++) {
      if (z.freq[i] >= fPk * 2.5 && z.freq[i] <= fPk * 4) {
        ref += z.magnitude[i];
        n++;
      }
    }
    if (!n || zPk < 1.4 * (ref / n)) return null;
    return Math.round(2 * fPk);
  };
  /** Tweeter HP floor: an explicit crossover range overrides it (the
   *  designer's own call). */
  const tweeterHpFloor = useMemo(
    () => fsFloorFrom(impedances['tweeter'], 300, 3000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [impedances],
  );
  /** 3-way: the same ≥2×Fs rule for the MID's HP knee — the physics floor of
   *  the W-M handover (Robbert's mid: Fs 176 Hz ⇒ floor 353 Hz, exactly the
   *  region the tuner kept preferring over the level-based anchor). */
  const midHpFloor = useMemo(
    () => (threeWay ? fsFloorFrom(impedances['mid'], 60, 1500) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [impedances, threeWay],
  );
  const [angleSets, setAngleSets] = useState<AngleSets | null>(null);
  const [xoName, setXoName] = useState<string>('none');
  const [error, setError] = useState<string | null>(null);
  /** Free-text notes per imported file ("group:filename"), saved with the project. */
  const [fileNotes, setFileNotes] = useState<Record<string, string>>({});

  // Virtual filters, pre-seeded with Sander's proposed target design:
  // tweeter LR2 HP @ 2.9 kHz + notch 6.5 kHz −10 dB Q 0.5; mid LR4 LP @ 2 kHz.
  // Factory so a reset hands out FRESH objects, never shared references.
  const defaultVFilters = () => ({
    woofer: {
      gainDb: 0,
      hp: defaultHpLp(200),
      lp: { ...defaultHpLp(2000), kind: 'LR' as const, order: 4 as const },
      eq: [defaultEq(1000, 0, 1), defaultEq(4000, 0, 1)],
    },
    // 3-way middle branch: a bandpass is simply hp+lp both enabled — the spec
    // model already carries both. Neutral LR4 seeds, disabled until used.
    mid: {
      gainDb: 0,
      hp: { ...defaultHpLp(400), kind: 'LR' as const, order: 4 as const },
      lp: { ...defaultHpLp(3000), kind: 'LR' as const, order: 4 as const },
      eq: [defaultEq(1500, 0, 1), defaultEq(5000, 0, 1)],
    },
    tweeter: {
      gainDb: 0,
      hp: { ...defaultHpLp(2900), kind: 'LR' as const, order: 2 as const },
      lp: defaultHpLp(20000),
      eq: [defaultEq(6500, -10, 0.5), defaultEq(10000, 0, 1)],
    },
  });
  const [vFilters, setVFilters] = useState<{
    woofer: DriverFilterSpec;
    mid: DriverFilterSpec;
    tweeter: DriverFilterSpec;
  }>(defaultVFilters);

  // View controls. The inputs update instantly; the simulation follows the
  // DEBOUNCED values so half-typed numbers never reach it.
  const [fMin, setFMin] = useState('200');
  const [fMax, setFMax] = useState('20000');
  // While a range field has focus the simulation freezes on the last
  // committed values; blur (or Enter) releases the new ones.
  const [rangeEditing, setRangeEditing] = useState(false);
  const fMinDeb = useDebounced(fMin, 150, rangeEditing);
  const fMaxDeb = useDebounced(fMax, 150, rangeEditing);
  const [splMin, setSplMin] = useState(''); // empty = auto
  const [splMax, setSplMax] = useState('');

  /** Chart "use as view range": promote a zoomed X-window to the committed
   *  range (which is also the optimizer/metrics evaluation band). */
  const commitViewRange = (lo: number, hi: number) => {
    setFMin(String(Math.round(lo)));
    setFMax(String(Math.round(hi)));
  };

  /**
   * Layout mode: 'auto' follows window width (split ≥1000 px — the CSS media
   * query owns the number), 'split' and 'stacked' force the two-pane / classic
   * single-column layout. Persisted.
   */
  const [layoutMode, setLayoutMode] = useState<'auto' | 'split' | 'stacked'>(() => {
    const m = localStorage.getItem('ads-ui-layout');
    return m === 'split' || m === 'stacked' ? m : 'auto';
  });
  useEffect(() => {
    localStorage.setItem('ads-ui-layout', layoutMode);
  }, [layoutMode]);

  /**
   * Draggable divider between the design pane and the charts: the left pane's
   * share of the workspace (0–1), null = automatic (the CSS clamp defaults).
   *
   * A FRACTION, not pixels — hard learned by measuring: a width dragged on a
   * wide monitor (704 px) followed the app into an 800 px window, where the
   * `calc(100% - 346px)` guard was all that stood between the charts and
   * nothing. The SPL chart ended up 263 × 93 px with a 144 px score strip
   * above it. A share scales with the window, so the preference means the
   * same thing on both screens.
   *
   * During a drag the CSS variable is written straight to the DOM node so the
   * whole app doesn't re-render per mouse move; state is committed on release.
   */
  const [paneFrac, setPaneFrac] = useState<number | null>(() => {
    const f = Number(localStorage.getItem('ads-ui-panefrac') ?? NaN);
    if (Number.isFinite(f) && f > 0.1 && f < 0.9) return f;
    // Migrate the legacy px setting against the current window (the workspace
    // spans the full width), so an existing split is not silently discarded.
    const px = Number(localStorage.getItem('ads-ui-panew') ?? NaN);
    if (Number.isFinite(px) && px >= 240 && window.innerWidth > 0) {
      return Math.min(0.8, Math.max(0.2, px / window.innerWidth));
    }
    return null;
  });
  useEffect(() => {
    localStorage.removeItem('ads-ui-panew');
    if (paneFrac == null) localStorage.removeItem('ads-ui-panefrac');
    else localStorage.setItem('ads-ui-panefrac', paneFrac.toFixed(4));
  }, [paneFrac]);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  /** ⚙ preferences popover: a plain <details>, closed on any click outside
   *  and on Esc — the cheap disclosure pattern; it holds three switches, not a
   *  dialog's worth of focus management. */
  const prefsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = prefsRef.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && prefsRef.current?.open) prefsRef.current.open = false;
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const startPaneDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ws = workspaceRef.current;
    if (!ws) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const rect = ws.getBoundingClientRect();
    let frac: number | null = null;
    const move = (ev: PointerEvent) => {
      // Keep both panes usable: left ≥260 px, charts ≥340 px (+6 px splitter).
      const w = Math.max(260, Math.min(ev.clientX - rect.left, rect.width - 346));
      frac = w / rect.width;
      ws.style.setProperty('--pane-w', `${(frac * 100).toFixed(3)}%`);
    };
    const done = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', done);
      el.removeEventListener('pointercancel', done);
      if (frac != null) setPaneFrac(frac);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', done);
    el.addEventListener('pointercancel', done);
  };

  /** Active tab of the left design pane (persisted: reopen where you left off). */
  const [designTab, setDesignTab] = useState<
    'import' | 'drivers' | 'data' | 'filters' | 'network'
  >(() => {
    const t = localStorage.getItem('ads-ui-tab');
    return t === 'drivers' || t === 'data' || t === 'filters' || t === 'network' ? t : 'import';
  });
  useEffect(() => {
    localStorage.setItem('ads-ui-tab', designTab);
  }, [designTab]);

  /**
   * Guided vs Expert.
   *
   * The tool exists so that someone who does not know how to build a filter
   * still ends up with speakers — and at the same time a pro must be able to
   * work properly. Those are not the same interface, and the dividing line is
   * NOT "easy versus hard". It is:
   *
   *   facts about YOUR speaker      -> a beginner can answer these
   *   overrides on MY reasoning     -> only someone who knows better can
   *
   * Which drivers, how many, where on the baffle, how you measured, how loud
   * you want to play: all answerable, and all things the app cannot derive.
   * Alignment preference, acoustic slopes, phase metric, tier profiles, staged
   * targets, crossover pins: overrides, every one of them, and the app already
   * has a defensible answer for each.
   *
   * Guided therefore shows FEWER KNOBS BUT NOT LESS DIAGNOSIS — a first build
   * fails on measurement mistakes and unsafe loads, so the verdicts stay.
   *
   * Default: guided for someone new, expert for a session that already has
   * work in it (changing a working setup out from under someone is its own
   * kind of bug).
   */
  const [uiMode, setUiMode] = useState<'guided' | 'expert' | 'compare'>(() => {
    const m = localStorage.getItem('ads-ui-mode');
    if (m === 'guided' || m === 'expert' || m === 'compare') return m;
    return localStorage.getItem('ads-autosave') ? 'expert' : 'guided';
  });
  useEffect(() => {
    localStorage.setItem('ads-ui-mode', uiMode);
  }, [uiMode]);

  /** Pin the SPL chart to the top of the analysis pane while the rest scrolls. */
  /** Build-tolerance band on the SPL chart (±% on every physical R/L/C,
   *  worst-case envelope; see lib/tolerance.ts). Opt-in — it costs 2N+1
   *  network solves per sim change. Persisted. */
  const [tolOn, setTolOn] = useState<boolean>(() => localStorage.getItem('ads-ui-tolband') === 'on');
  useEffect(() => {
    localStorage.setItem('ads-ui-tolband', tolOn ? 'on' : 'off');
  }, [tolOn]);
  const [tolPct, setTolPct] = useState<number>(() => {
    const v = Number(localStorage.getItem('ads-ui-tolpct'));
    return v === 2 || v === 10 ? v : 5;
  });
  useEffect(() => {
    localStorage.setItem('ads-ui-tolpct', String(tolPct));
  }, [tolPct]);

  const [splPinned, setSplPinned] = useState<boolean>(
    () => localStorage.getItem('ads-ui-splpin') !== 'off',
  );
  useEffect(() => {
    localStorage.setItem('ads-ui-splpin', splPinned ? 'on' : 'off');
  }, [splPinned]);

  /**
   * À-la-carte analysis panels: any combination can be visible at once, and
   * whatever is OFF is not computed either (the heavy memos below gate on
   * these). SPL and the integration score always stay on. Persisted.
   */
  const [showPanelsPref, setShowPanels] = useState<Record<PanelKey, boolean>>(() => {
    /* Fresh users start with a CALM set: SPL (always on) + phase + impedance —
     * the three that answer "is this design good?". Directivity, sonogram,
     * transfer and time domain stay one visible, clickable chip away; seven
     * dense panels at once was the single biggest first-impression overload.
     * A stored choice (ANY stored choice) wins completely — existing users
     * see exactly what they left behind. */
    const FRESH_DEFAULT: Record<PanelKey, boolean> = Object.fromEntries(
      PANEL_KEYS.map((k) => [k, k === 'phase' || k === 'impedance']),
    ) as Record<PanelKey, boolean>;
    try {
      const stored = localStorage.getItem('ads-ui-panels');
      if (stored === null) return FRESH_DEFAULT;
      const raw = JSON.parse(stored) as Partial<Record<PanelKey, boolean>>;
      return Object.fromEntries(
        PANEL_KEYS.map((k) => [k, raw[k] ?? true]),
      ) as Record<PanelKey, boolean>;
    } catch {
      return FRESH_DEFAULT;
    }
  });
  useEffect(() => {
    localStorage.setItem('ads-ui-panels', JSON.stringify(showPanelsPref));
  }, [showPanelsPref]);
  /* Compare mode shows only what the comparison is about — SPL with the
     overlay and the phase residual — regardless of the stored preference; the
     preference itself is left alone so leaving the mode restores it. */
  const showPanels: Record<PanelKey, boolean> =
    uiMode === 'compare' ? COMPARE_PANELS : showPanelsPref;

  // Tweeter adjustment
  const [offsetMm, setOffsetMm] = useState('0');
  const [trimDb, setTrimDb] = useState('0');
  const [inverted, setInverted] = useState(false);
  /** 3-way: the middle branch's own adjust (the fields above stay the high
   *  branch's — per-branch adjust is the combineN generalization). */
  const [midOffsetMm, setMidOffsetMm] = useState('0');
  const [midTrimDb, setMidTrimDb] = useState('0');
  const [midInverted, setMidInverted] = useState(false);

  /**
   * Driver phase convention. 'measured' (default) uses the real measured
   * phase incl. acoustic-centre offsets — the whole point of this tool.
   * 'minimum' reconstructs phase from magnitude, VituixCAD-style
   * (MinimumPhase=True, offsets 0) — for apples-to-apples comparison.
   */
  const [phaseMode, setPhaseMode] = useState<'measured' | 'minimum'>('measured');

  /** Bypass the virtual filters in the sim. Auto-on when a synthesised
   *  passive network is imported into the editor (it replaces them — leaving
   *  them on would filter twice); also handy for A/B: target vs. passive. */
  const [vfBypass, setVfBypass] = useState(false);
  /** Collapse the per-driver filter-band editor. Follows the bypass state
   *  from ANY source (manual toggle, Build, optimizer): muted sliders do
   *  nothing, so they only cost space (Sanders besluit, tweede ronde — his
   *  earlier "it wiped my filters" read is defused by the summary line in the
   *  collapsed header, which must stay). Manually expandable via the header
   *  while bypassed. */
  const [vfCollapsed, setVfCollapsed] = useState(false);
  useEffect(() => {
    setVfCollapsed(vfBypass);
  }, [vfBypass]);
  /** Optimizer settings collapsed by default — the button is the workflow. */
  const [showOptSettings, setShowOptSettings] = useState(false);
  // Passive-only doctrine (Sander, jul 2026): this tool designs PASSIVE
  // filters exclusively, so EQ is cut-only EVERYWHERE — the former
  // "Passive-honest (EQ cut-only)" toggle is gone and the optimizer always
  // runs cutOnly. (Its "off" mode was, per its own tooltip, for active
  // designs.) The freed-boost tuning nuance from July is deliberately
  // sacrificed for consistency: manual inputs clamp to ≤0 dB, so an
  // optimizer emitting boost bands would land values the UI cannot edit.
  /** Snap the passive build to purchasable catalog parts (real DCR/ESR).
   *  Default on: with a catalog imported you clearly intend to build with real
   *  parts. Only ever effective when a catalog is imported — the engine calls
   *  guard with hasImportedCatalog(), so without one the design stays at
   *  theoretically ideal (continuous) values. */
  const [catalogSnap, setCatalogSnap] = useState(true);
  /** A5e.3 — bumped whenever the catalogue module state is replaced, so the
   *  coil-family fits (a memo over `catalogParts()`) follow an import. */
  const [catalogRev, setCatalogRev] = useState(0);
  const applyCatalogSeries = (series: CatalogSeries[], parts: CatalogPart[] = []) => {
    setCustomSeries(series, parts);
    setCatalogRev((r) => r + 1);
  };
  /** Breakup guard: stopband leakage beside the crossover must stay ≥20 dB
   *  down — resonance phase can't be filtered, only made irrelevant. */
  const [breakupGuard, setBreakupGuard] = useState(true);
  /**
   * ENGINE V2 (experimental) — off unless the designer turns it on (P4).
   *
   * One flag, read in exactly one place (`selectEngine`). F1 switches on the
   * reporting panel and nothing else, and `engine2/toggleRegression.test.ts`
   * proves a reference optimisation run is byte-identical with and without the
   * v2 modules loaded. F2+ will hook the optimiser onto the SAME flag through
   * the same façade, so this stays one decision rather than a dozen.
   */
  /** THE MINIMUM LOAD YOUR AMPLIFIER IS RATED FOR (Ω) — null until you say.
   *
   *  There used to be a built-in 2.5 Ω here, and it came from one amplifier
   *  (a NAD M10 V2). A tube amp, a PA amp and a Purifi module want three
   *  different answers, and the app cannot see which one is on the other end
   *  of the cable — so it asks, and a blank means the engine holds the design
   *  to nothing. The delivered minimum is measured and shown either way.
   *
   *  A PREFERENCE, not project data: it describes the owner's rack, not this
   *  loudspeaker, so it lives in localStorage next to the other engine
   *  thresholds and survives Reset. */
  const [ampMinLoadOhm, setAmpMinLoadOhm] = useState<number | null>(() => {
    const raw = localStorage.getItem('ads-amp-min-load');
    if (raw === null || raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  });
  // DECLARED HERE, above the engine-v2 report memo, because that memo reads it:
  // the plain |Z| floor is one of M-B's two independently settable limits and
  // the report has to be able to show it. Moved rather than duplicated — the
  // same number in two places is how the two come to disagree.

  const [engineV2Enabled, setEngineV2Enabled] = useState(false);
  /**
   * The v2 project settings. EMPTY = ABSENT, everywhere and always (P4): the
   * metric that needs it stays off, the gate that needs it is not judging, the
   * budget that needs it does not narrow the search box. The placeholders in
   * the fields below are GHOSTS — suggestions a reader can see and the engine
   * never receives.
   */
  const [engineV2Settings, setEngineV2Settings] = useState<{
    verticalWindowDeg: string;
    amplifierPowerW: string;
    maxDissipationPct: string;
    minEpdrOhm: string;
    maxDriveOnFsDb: string;
    lfBumpBudgetDb: string;
    qesMultiplierMax: string;
    dampingMarginDb: string;
    runSeed: string;
    runBudgetEvals: string;
    splWindowPlusMinusDb: string;
    maxPhaseTrackingDeg: string;
    shortlistSize: string;
    /** V49 — the amplifier's brief peak, the load it is specified into, and
     *  the X_max fraction: what turns M-C's limit into a derived one. */
    amplifierPeakPowerW: string;
    amplifierNominalLoadOhm: string;
    xmaxMarginFraction: string;
    /** V50 — buildability: the resistor class (W), the fraction of it a
     *  resistor may run at, and the cored-coil current class (A). */
    resistorClassW: string;
    resistorPowerMargin: string;
    coilClassA: string;
    /** V51 — the THERMAL DESIGN POWER (average listening power, W) M-A/part
     *  judges at; blank = at the continuous amplifier power (V50). */
    resistorThermalPowerW: string;
    /** V51 — '' (not stated), 'none': the lowest way may carry no level
     *  work (no series resistor, no shunt pad), or 'series-r-max' (V51b):
     *  series resistance up to the maximum below, no pad. A topology
     *  requirement on the search, and a chain-level choice key. */
    lowestWayLevelWork: string;
    /** V51b — the maximum total series resistance (Ω, discrete R plus coil
     *  DCR) on the lowest way; read only with 'series-r-max'. */
    lowestWaySeriesRMaxOhm: string;
  }>({
    verticalWindowDeg: '',
    amplifierPowerW: '',
    maxDissipationPct: '',
    minEpdrOhm: '',
    maxDriveOnFsDb: '',
    lfBumpBudgetDb: '',
    qesMultiplierMax: '',
    dampingMarginDb: '',
    runSeed: '',
    runBudgetEvals: '',
    splWindowPlusMinusDb: '',
    maxPhaseTrackingDeg: '',
    shortlistSize: '',
    amplifierPeakPowerW: '',
    amplifierNominalLoadOhm: '',
    xmaxMarginFraction: '',
    resistorClassW: '',
    resistorPowerMargin: '',
    coilClassA: '',
    resistorThermalPowerW: '',
    lowestWayLevelWork: '',
    lowestWaySeriesRMaxOhm: '',
  });
  /**
   * A5a — PER-MEASUREMENT-SESSION METADATA THE ENGINE NEEDS AND NOBODY COULD
   * TYPE (F3b).
   *
   * Four things the v2 layer declares as inputs and the app had no field for:
   *
   *  · `zMm` — the acoustic centre on the vertical axis. The cabinet form
   *    already carries a driver's baffle position, and that is what M-F-final
   *    has been using; it is the right number for a flush-mounted set and the
   *    wrong one the moment a driver sits in a pod or behind a waveguide.
   *    Empty = fall back to the cabinet position, which is what it did before.
   *  · `rotSym` — whether the branch radiates rotationally symmetrically.
   *    M-F-final's point-source assumption rests on it, and the app never
   *    supplied it, so the metric has been carrying "not rotationally
   *    symmetric" for every driver on every set — including waveguides the
   *    designer knows are.
   *  · `reOhm` — a DC resistance measured with a meter. Above BOTH sweep
   *    derivations in A5c.1's hierarchy, because it is a measurement of the
   *    quantity itself.
   *  · the window fields — reference time and right window, or the validity
   *    floor directly, for files whose headers carry neither (A5b.1(i)).
   *    A FALLBACK, never an override: a file with a header ignores them.
   *
   * EVERY FIELD IS A STRING AND EMPTY MEANS ABSENT (P4). Nothing here has a
   * default, and a blank field must reach the engine as a missing key rather
   * than as a zero — a rotational-symmetry flag defaulting to `false` is
   * exactly the silent assumption this block exists to remove.
   */
  const [v2Meas, setV2Meas] = useState<Record<BranchRole, V2MeasurementMeta>>({
    low: emptyV2Meas(),
    mid: emptyV2Meas(),
    high: emptyV2Meas(),
  });
  const setV2MeasField = (role: BranchRole, key: keyof V2MeasurementMeta, value: string) =>
    setV2Meas((v) => ({ ...v, [role]: { ...v[role], [key]: value } }));

  /** Optional crossover-range constraint for the optimizer (Hz). */
  const [xoRangeOn, setXoRangeOn] = useState(false);
  /** Crossover point the designer picks: centre frequency ± margin (Hz).
   *  Margin 0 = "exactly there" (a minimal ±2% keeps the search alive). */
  const [xoFreqHz, setXoFreqHz] = useState<string>(V1_PIN_DEFAULTS_LEGACY.highFreqHz);
  const [xoMarginHz, setXoMarginHz] = useState<string>(V1_PIN_DEFAULTS_LEGACY.highMarginHz);
  /** Scan candidates across the pinned range (odd, 3..11; Sanders idee):
   *  more steps = a finer sweep, compute grows ~linearly (pool absorbs some). */
  const [xoScanSteps, setXoScanSteps] = useState(3);
  /** Preferred HP/LP alignment (strong prior for the structure search);
   *  'auto' = free enumeration over the alignment library. In 3-way this is
   *  the HIGH (mid-tweeter) crossing — same convention as acSlopeMid/Tweeter,
   *  which have always meant the top pair. */
  const [hpLpPref, setHpLpPref] = useState('auto');
  /** 3-way: alignment preference for the LOW (woofer-mid) crossing. Two
   *  handovers are two independent foundations to choose. */
  const [hpLpPrefLow, setHpLpPrefLow] = useState('auto');
  /** 3-way scan: candidate steps PER CROSSING (1/2/3 → 1/4/9 full chains).
   *  Independent of the crossover pin — every candidate is caged in its own
   *  slice either way, so "how many" is always a meaningful cost knob. */
  const [xo3Steps, setXo3Steps] = useState(2);
  /** 3-way scan strategy: 'axes' = sweep W-M (M-T held at its anchor), then
   *  M-T with the best W-M, then a local 3×3 refinement (skipped when the two
   *  sweeps show no coupling) — finer per axis for far fewer chains than a
   *  grid of the same resolution; 'grid' = the classic corners grid. */
  const [scan3Mode, setScan3Mode] = useState<'axes' | 'grid'>(() =>
    localStorage.getItem('ads-scan3-mode') === 'grid' ? 'grid' : 'axes',
  );
  /**
   * How many crossover candidates the scan actually explores.
   *
   * GUIDED gets the thorough setting regardless (Sanders point, and it is the
   * right way round): a beginner will not pin a crossover point and has no
   * knobs to improve the result afterwards, so the one thing the app CAN do
   * for him is search wider. It also matches what was measured — the pre-build
   * ranking does not predict the final one (xo 1900 looked worst before the
   * build and came back best), which is exactly why breadth pays. The cost is
   * runtime, and a run already shows a live per-candidate table with a Cancel.
   *
   * Expert keeps its dropdown: there, the designer can pin, re-run and judge.
   */
  const scanSteps2 = uiMode === 'guided' ? 9 : xoScanSteps;
  const scanSteps3 = uiMode === 'guided' ? 3 : xo3Steps;
  /** Staged design ("trapmethode"): HP/LP first, every next layer (EQ,
   *  Zobel/LCR, bypass-C) only while the targets are unmet — fewest
   *  components that reach the goal. */
  const [stagedOn, setStagedOn] = useState(true);
  /** Phase metric for both optimizers: 'band' = the panel's avg + P95 over
   *  the overlap window (what the user reads); 'overlap' = classic weighted
   *  mean, kept as an easy fallback. */
  const [phaseMetricMode, setPhaseMetricMode] = useState<'band' | 'overlap'>('band');
  /** Target ACOUSTIC slopes beside the crossing (dB/oct, 'auto' = free) —
   *  the "akoestisch 4e orde bij de tweeter"-knop. */
  const [acSlopeMid, setAcSlopeMid] = useState('24');
  const [acSlopeTweeter, setAcSlopeTweeter] = useState('12');
  /** 3-way: the LOW handover's own pin and slope targets (Sanders: "een
   *  3-weg heeft twee akoestische flanken op de mid" — the mid has an HP
   *  flank at the low crossing AND an LP flank at the high one, and the
   *  woofer's LP flank needs its own knob too). The existing xoFreqHz/
   *  acSlopeMid/acSlopeTweeter keep steering the HIGH (mid-tweeter) pair. */
  const [xoLowFreqHz, setXoLowFreqHz] = useState<string>(V1_PIN_DEFAULTS_LEGACY.lowFreqHz);
  const [xoLowMarginHz, setXoLowMarginHz] = useState<string>(V1_PIN_DEFAULTS_LEGACY.lowMarginHz);
  const [acSlopeWoofer, setAcSlopeWoofer] = useState('24');
  const [acSlopeMidHp, setAcSlopeMidHp] = useState('24');
  /** Datasheet numbers for the excursion floor — the level-aware version of
   *  "cross a tweeter at 2-3x Fs". Two fields per driver, and without them the
   *  criterion simply does not apply. */
  const [sdCm2, setSdCm2] = useState<Record<BranchRole, string>>({ low: '', mid: '', high: '' });
  const [xmaxMm, setXmaxMm] = useState<Record<BranchRole, string>>({ low: '', mid: '', high: '' });
  /** The SPL the excursion floor is computed FOR — a 1" dome is fine to 587 Hz
   *  at 90 dB and only to 829 Hz at 96 dB, and that is the whole point. */
  const [excursionSpl, setExcursionSpl] = useState('96');
  /** Mid nominal size (inch) — sets the crossover CEILING via cone beaming
   *  (f ≈ c/π·d_eff; a MID property, per Gemini's window rules). '' = unknown
   *  → the free band falls back to the tweeter-anchored ceiling. */
  const [midSizeInch, setMidSizeInch] = useState('');
  /** Beaming-limited crossover ceiling (Hz): the UPPER bound of the sensible
   *  crossover window. Effective radiating diameter ≈ 0.82× nominal; beaming
   *  onsets at c/π·d, and a cone is practically usable to ~3× that (a 5" ⇒
   *  ~3200 Hz, matching the ~3000–3500 rule of thumb). null when size unknown. */
  const midXoCeiling = useMemo(() => {
    // Sd first: the datasheet Sd gives the true effective piston, so once it
    // is entered on the Drivers step the size dropdown would be the same fact
    // typed twice — and less precisely (the 0.82×nominal approximation).
    // In 2-way this ceiling belongs to the LOW branch (KOAN's low driver is
    // literally a mid); in 3-way to the actual middle branch.
    const dia = pistonDiameterMm(Number(sdCm2[threeWay ? 'mid' : 'low']));
    if (dia !== null) return Math.round((3 * 343) / (Math.PI * (dia / 1000)));
    const inch = Number(midSizeInch);
    if (!(inch > 0)) return null;
    const dEff = inch * 0.0254 * 0.82;
    return Math.round((3 * 343) / (Math.PI * dEff));
  }, [midSizeInch, sdCm2, threeWay]);
  /** 3-way: woofer nominal size (inch) — the W-M handover's beaming CEILING,
   *  the exact mirror of the mid-size rule above. '' = unknown. */
  const [wooferSizeInch, setWooferSizeInch] = useState('');
  /** Directivity philosophy for the measured beaming ceiling. Default is the
   *  empirical 4 dB, NOT the theoretically stricter ka = 2 — measured on a real
   *  3-way set the tight tiers fire on baffle diffraction and declare an
   *  ordinary design impossible (see KA_TIERS). */
  const [kaTier, setKaTier] = useState<KaTier>('measured');
  /**
   * Cabinet geometry + measurement context — the facts the designer KNOWS and
   * the app would otherwise infer. One object rather than fifteen useStates:
   * it is one thing conceptually, and it persists as one field.
   *
   * Driver positions are relative to the MEASUREMENT REFERENCE POINT (where the
   * mic was aimed / the turntable axis), +x right and +y up. Centre-to-centre
   * per pair is DERIVED from these — asking for it separately would be the same
   * fact typed twice, and positions additionally reveal which driver was
   * off-axis during the sweep.
   */
  const [cabinet, setCabinet] = useState<CabinetState>(() => emptyCabinet());
  /** Box corner read from the measured Z, per branch — the Fc/Fb field's
   *  answer is already in the ZMA when the driver was measured in its box
   *  (sealed: the in-box resonance peak; ported: the saddle between the twin
   *  peaks). A suggestion and a cross-check, never silently applied. */
  const boxTuneFromZ = useMemo(() => {
    const aliased = withSlotAliasesN(impedances);
    const of = (role: BranchRole) => {
      const z = aliased[canonicalModelForRole(role, threeWay)];
      // A dome tweeter is its own sealed rear chamber — the card states it
      // instead of asking, so the derivation must not wait for a dropdown.
      const enc = role === 'high' ? 'sealed' : cabinet.drivers[role].enclosure;
      return z ? boxTuningFromZ(z.freq, z.magnitude, enc) : null;
    };
    return { low: of('low'), mid: of('mid'), high: of('high') };
  }, [impedances, threeWay, cabinet]);
  /**
   * Near-field low-end merge, per branch. A gated indoor far field runs out
   * around 200–290 Hz and a three-way's woofer-mid crossover lives at
   * 300–500 Hz, so the region that needs the most care is the one the gate
   * cannot support. Only the low and mid branches get a slot: a tweeter has no
   * low-end problem worth splicing.
   */
  const [nearField, setNearField] = useState<Record<BranchRole, NearFieldSlot>>(() => ({
    low: emptyNearField(),
    mid: emptyNearField(),
    high: emptyNearField(),
  }));
  /** How much spacing the design tolerates, in wavelengths. Genuinely
   *  contested (0.5 = no forward null … 1.2 = Saunisto's power-response
   *  optimum, which ACCEPTS a ±25° null), so the designer owns it. */
  // 'auto' resolves the strictness per pair from the driver geometry
  // (lobingKFor); restores of older projects keep their stored numeric value.
  const [ctcK, setCtcK] = useState('auto');
  /** Physics-window thresholds for the free "Design for me" scan (xoWindow.ts,
   *  rules 2–5): array k, centre-to-centre λ-divisor, breakup divisor, fs·K.
   *  A preference, not project data — stored beside the UI preferences. */
  const [xoWinThr, setXoWinThr] = useState<XoWindowThresholds>(() => {
    try {
      const raw = localStorage.getItem('ads-xo-window');
      if (raw) {
        const o = JSON.parse(raw) as Partial<XoWindowThresholds>;
        // The first cut shipped λ/1.5 as the default (hours, one session);
        // it is now axis-aware 'auto'. A stored 1.5 was never a choice.
        if (o.ctcLambdaDiv === 1.5) o.ctcLambdaDiv = 'auto';
        return { ...DEFAULT_XO_WINDOW_THRESHOLDS, ...o };
      }
    } catch {
      /* corrupt preference: defaults */
    }
    return DEFAULT_XO_WINDOW_THRESHOLDS;
  });
  const setXoWinThrField = (k: keyof XoWindowThresholds, v: number | 'auto') => {
    setXoWinThr((prev) => {
      const next = {
        ...prev,
        [k]: v === 'auto' ? 'auto' : Number.isFinite(v) && v > 0 ? v : DEFAULT_XO_WINDOW_THRESHOLDS[k],
      };
      try {
        localStorage.setItem('ads-xo-window', JSON.stringify(next));
      } catch {
        /* quota */
      }
      return next;
    });
  };
  /** Opt-in: re-time the branches from the MEASURING distance to the LISTENING
   *  distance (see listeningDelayShiftUs). Off by default — it changes the sum,
   *  and "measured phase is the truth" stays the default reading of the data. */
  const [seatTiming, setSeatTiming] = useState(false);
  /** Cone breakup as an upper limit: cross at or below f_b / harmonic. */
  const [breakupLimitOn, setBreakupLimitOn] = useState(true);
  const [breakupHarmonic, setBreakupHarmonic] = useState('3');
  const wooferXoCeiling = useMemo(() => {
    // Same rule as midXoCeiling: entered Sd beats the nominal-size dropdown.
    const dia = pistonDiameterMm(Number(sdCm2.low));
    if (dia !== null) return Math.round((3 * 343) / (Math.PI * (dia / 1000)));
    const inch = Number(wooferSizeInch);
    if (!(inch > 0)) return null;
    const dEff = inch * 0.0254 * 0.82;
    return Math.round((3 * 343) / (Math.PI * dEff));
  }, [wooferSizeInch, sdCm2]);
  /** Wizard "think-along": suggested tuning range = the optimizer's evaluation
   *  band. The USABLE span where both drivers have data — floored at 200 Hz (a
   *  mid/tweeter tuning floor; raw FRDs often carry an unreliable sub-100 Hz
   *  tail) and capped at 20 kHz. */
  /** The solo level goal as the engine wants it: either an absolute target
   *  level, or the relative sensitivity budget. One place so the design stage
   *  and the component tuner can never disagree. */
  const soloLevelGoal = (): { targetLevelDb?: number; sensitivityBudgetDb?: number } => {
    if (soloFloorOn && soloFloorInfo) return { targetLevelDb: soloFloorInfo.floor };
    return { sensitivityBudgetDb: num(soloSensDb, 6) };
  };

  const suggestedBand = useMemo((): [number, number] | null => {
    if (!woofer || !tweeter) return null;
    const wf = woofer.frd.freq;
    const tf = tweeter.frd.freq;
    const lo = Math.max(200, Math.round(Math.max(wf[0], tf[0])));
    const hi = Math.round(Math.min(wf[wf.length - 1], tf[tf.length - 1], 20000));
    return hi > lo ? [lo, hi] : null;
  }, [woofer, tweeter]);
  /** Wizard "think-along": the passive SYSTEM level. Passive can't boost, so
   *  the level is set by the LEAST sensitive (limiting) driver — the louder one
   *  is padded down to match. Mean passband SPL per driver, take the min. */
  const systemLevelDb = useMemo((): { level: number; limiter: string } | null => {
    if (!woofer || !tweeter) return null;
    const meanIn = (l: Loaded, lo: number, hi: number): number | null => {
      const f = l.frd.freq;
      const y = l.frd.spl;
      let s = 0;
      let n = 0;
      for (let i = 0; i < f.length; i++)
        if (f[i] >= lo && f[i] <= hi) {
          s += y[i];
          n++;
        }
      return n ? s / n : null;
    };
    const wl = meanIn(woofer, 300, 1500);
    const tl = meanIn(tweeter, 3000, 10000);
    if (wl == null || tl == null) return null;
    return { level: Math.round(Math.min(wl, tl) * 10) / 10, limiter: wl <= tl ? 'woofer' : 'tweeter' };
  }, [woofer, tweeter]);
  /** Component wizard: tier profile + binding series per kind for the snap. */
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  /** Declared system type in the wizard (Sanders voorstel, aug 2026): intent
   *  FIRST, then only the applicable measurement slots, and Next blocks until
   *  the declared set is complete. GUIDANCE ONLY — the engine keeps inferring
   *  its mode from what is actually loaded (one source of truth); a mismatch
   *  is surfaced as a note, never silently resolved. */
  const [wizardWays, setWizardWaysRaw] = useState<1 | 2 | 3>(() => {
    const v = Number(localStorage.getItem('ads-wizard-ways'));
    return v === 1 || v === 3 ? (v as 1 | 3) : 2;
  });
  const setWizardWays = (w: 1 | 2 | 3) => {
    setWizardWaysRaw(w);
    localStorage.setItem('ads-wizard-ways', String(w));
  };
  // Data wins over a stale stored choice: opening the wizard with a full
  // 3-way loaded declares 3-way, with exactly the two outer branches 2-way.
  // Only when the wizard OPENS — never on data changes while it is open.
  // Live re-evaluation flipped the choice under the user's hands: with 3-way
  // chosen, dropping the woofer before the mid made "woofer+tweeter, no mid"
  // true for a moment, the wizard snapped to 2-way and the Midrange slot
  // vanished mid-session (Sanders report). Loading a midrange while 2-way is
  // chosen still promotes to 3-way: data may add a slot, never take one away.
  useEffect(() => {
    if (!wizardOpen) return;
    if (threeWay) setWizardWaysRaw(3);
    else if (woofer && tweeter && !midDrv) setWizardWaysRaw(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardOpen]);
  useEffect(() => {
    if (wizardOpen && midDrv && wizardWays !== 3) setWizardWaysRaw(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardOpen, midDrv]);

  /* First-run welcome card. Keyed on "no autosave AND never dismissed": an
   * existing autosave means a returning user, and the flag means they chose to
   * look around — either way the card must never nag twice. */
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => !localStorage.getItem('ads-autosave') && !localStorage.getItem('ads-welcomed'),
  );

  /* Reference-height edits must not move the DRIVERS (Sanders report: "als ik
   * die aanpas zie ik ook de drivers verplaatsen"). Driver y is STORED
   * relative to the reference point (the whole engine speaks that
   * convention), but the fields ASK for mm-below-top — physical, ruler-
   * measured facts. Correcting where the reference sits therefore shifts the
   * stored offsets by the same delta, so every driver keeps the below-top
   * position the user actually typed; only the reference marker moves.
   * Commit-on-blur (the view-range focus-freeze pattern) so the delta is
   * computed ONCE between two stable values — per-keystroke shifting would
   * make the outcome depend on how you type ("260" vs clear-then-type).
   * First-time entry (old field empty) shifts nothing: the offsets were
   * entered reference-relative back then, and are already the truth. */
  const [refTopDraft, setRefTopDraft] = useState<string | null>(null);
  function commitRefTop() {
    if (refTopDraft === null) return;
    const v = refTopDraft;
    setRefTopDraft(null);
    setCabinet((c) => {
      if (v === c.refFromTopMm) return c;
      const oldTop = Number(c.refFromTopMm);
      const newTop = Number(v);
      const delta =
        c.refFromTopMm.trim() !== '' &&
        v.trim() !== '' &&
        Number.isFinite(oldTop) &&
        Number.isFinite(newTop)
          ? newTop - oldTop
          : 0;
      const shift = (d: CabinetDriver, role: BranchRole): CabinetDriver =>
        delta === 0 ||
        role === c.refDriver || // the reference driver IS the point: stays 0,0
        d.yMm.trim() === '' ||
        !Number.isFinite(Number(d.yMm))
          ? d
          : { ...d, yMm: String(Math.round((Number(d.yMm) + delta) * 10) / 10) };
      return {
        ...c,
        refFromTopMm: v,
        drivers: {
          low: shift(c.drivers.low, 'low'),
          mid: shift(c.drivers.mid, 'mid'),
          high: shift(c.drivers.high, 'high'),
        },
      };
    });
  }

  /* Keyboard-first layer (Linear/Figma): command palette, shortcuts overlay,
   * issues list, held reference trace. The key listener binds ONCE and routes
   * through a ref so it always sees fresh closures. */
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [palQuery, setPalQuery] = useState('');
  const [palIx, setPalIx] = useState(0);
  /* IN-APP CONFIRMATION, never window.confirm (aug 2026, Sanders "ik kan geen
   * netwerken meer verwijderen"). A browser dialog can be switched off for the
   * page — Chrome offers "prevent this page from creating additional dialogs"
   * after a few in a row — and from then on confirm() returns false with
   * nothing shown, so the action silently stops working. Exactly the class of
   * silent failure this codebase keeps paying for; and the app already owns a
   * modal every other popup goes through. */
  const [confirmAsk, setConfirmAsk] = useState<{
    text: string;
    confirmLabel: string;
    onYes: () => void;
  } | null>(null);
  const askConfirm = (text: string, confirmLabel: string, onYes: () => void) =>
    setConfirmAsk({ text, confirmLabel, onYes });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [heldTrace, setHeldTrace] = useState<{ x: number[]; y: number[] } | null>(null);
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  function dismissWelcome(next?: 'demo' | 'wizard') {
    localStorage.setItem('ads-welcomed', '1');
    setWelcomeOpen(false);
    if (next === 'demo') loadDemo();
    else if (next === 'wizard') {
      // "I have measurements" means "help me load them": open on the
      // measurements GATE (step 0), not on the default Goals step — a fresh
      // user has nothing loaded yet, so Goals would be a form about nothing.
      setWizardStep(0);
      setWizardOpen(true);
    }
  }
  /** The declared set's measurement checklist; Next blocks while incomplete. */
  const wizardMissing: string[] = (() => {
    if (wizardWays === 1) return woofer || tweeter ? [] : ['driver response (FRD)'];
    const out: string[] = [];
    if (!woofer) out.push('woofer response');
    if (wizardWays === 3 && !midDrv) out.push('midrange response');
    if (!tweeter) out.push('tweeter response');
    return out;
  })();
  /** More loaded than declared — surfaced, never silently resolved. */
  const wizardOverloaded =
    wizardWays === 1 ? !!(woofer && tweeter) || !!midDrv : wizardWays === 2 ? !!midDrv : false;
  /** Compare wizard: guided model-vs-measurement validation (VALIDATIE.md). */
  const [cmpOpen, setCmpOpen] = useState(false);
  const [cmpStep, setCmpStep] = useState(1);
  /** In-app manual; opens on the section matching the active design tab. */
  const [helpOpen, setHelpOpen] = useState(false);
  const [measureGuideOpen, setMeasureGuideOpen] = useState(false);
  const [catalogMgrOpen, setCatalogMgrOpen] = useState(false);
  const [snapProfile, setSnapProfile] = useState('auto');
  const [snapSeriesL, setSnapSeriesL] = useState('auto');
  const [snapSeriesC, setSnapSeriesC] = useState('auto');
  const [snapSeriesR, setSnapSeriesR] = useState('auto');
  const [snapStacks, setSnapStacks] = useState(true);
  /** Value window: a bound series also HARD-bounds the continuous fit of
   *  series-path slots of that kind to the series' value range. */
  const [snapBoundToSeries, setSnapBoundToSeries] = useState(false);
  /* Reachable on ORDINARY drivers, on purpose. The target is the escalation
     ladder's STOP condition, not a ceiling: EQ bands are added only while it
     is unmet, and the prune sweep runs only when it IS met. So a target the
     drivers cannot reach gives the opposite of what tightening it suggests —
     the ladder keeps adding parts, nothing is ever pruned, and the goal is
     missed anyway. 1.5 dB was calibrated on the KOAN's top-tier drivers
     (0.88 dB / 3.6° delivered); anything less than that would be priced out
     of its own default. */
  const [targetRipple, setTargetRipple] = useState('2.5');
  /** Single-driver mode: sensitivity a correction may spend for flatness. */
  const [soloSensDb, setSoloSensDb] = useState('6');
  /** Single-driver mode: absolute target level instead of the relative budget
   *  (Sanders' floor idea — a fixed target cannot be gamed by moving the mean,
   *  and it sets how far the correctable band reaches in one number). */
  const [soloFloorOn, setSoloFloorOn] = useState(false);
  const [soloFloorDb, setSoloFloorDb] = useState('');
  const [targetPhase, setTargetPhase] = useState('15');

  /** Editable schematic networks (step 6), as TABS: every design lives in its
   *  own tab (imports and passive builds open a new one), the active tab is
   *  what the editor shows and the sim runs. The schematic IS the network —
   *  parts connect where grid points coincide; the netlist is derived. When
   *  active it replaces the vxp variant; virtual filters still stack. */
  const [designs, setDesigns] = useState<NetworkDesign[]>([]);
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [networkActive, setNetworkActive] = useState(false);
  const [schHistory, setSchHistory] = useState<VxpPart[][]>([]); // per active tab
  const [schFuture, setSchFuture] = useState<VxpPart[][]>([]); // redo stack
  const [compareTabs, setCompareTabs] = useState(true);

  const activeDesign = useMemo(
    () => designs.find((d) => d.id === activeDesignId) ?? null,
    [designs, activeDesignId],
  );
  /**
   * A5e.2 — the voicing the ACTIVE design is judged and searched against.
   *
   * One expression, several readers since V45: the shortlist's window and RMS,
   * the anchored gaps (A5d.4a), and the tuner's amplitude term through the
   * candidate declaration. They used to read it from two places; two copies of
   * one voicing is two chances for a design to be searched against one curve
   * and judged against another, which is exactly the split V45 closed.
   *
   * Absent = flat, which is the neutral reference and not a guess — a design
   * that has never stated a voicing means "judge me horizontal".
   */
  const activeTargetCurve: TargetCurve = useMemo(() => {
    const stored = activeDesign?.targetCurve as TargetCurve | undefined;
    if (!stored) return FLAT_TARGET;
    if (stored.type !== 'bass-plateau') return stored;
    /* UI-1 — THE MEASURED HALF IS DERIVED HERE AND STORED NOWHERE.
     *
     * A5e.2 gives `bass-plateau` two parameters from opposite sources, and the
     * split is the point: the DEPTH is a voicing decision no measurement can
     * produce, and the TRANSITION is the baffle step of the cabinet front and
     * nothing else (P6). So the design stores the depth and this reads the
     * step off the cabinet form, through the one function that owns it. A
     * stored step would be a measurement frozen into a design, stale the
     * moment the width is corrected and invisible when it went stale.
     *
     * No width, no step, and then `targetOffsetsDb` produces NO offsets and
     * names what was missing — which is what P4 asks for and is a great deal
     * better than a plateau at a corner nobody measured. */
    const step = baffleStepHz(Number(cabinet.baffleWidthMm));
    return step === null ? stored : { ...stored, stepHz: step };
  }, [activeDesign, cabinet.baffleWidthMm]);
  const schematic: VxpCrossover | null = useMemo(
    () => (activeDesign ? { name: activeDesign.name, parts: activeDesign.parts } : null),
    [activeDesign],
  );

  /* Is anything actually SHAPING the summed response — an active editor
   * network, a vxp variant, or live virtual filters? One definition, shared by
   * the topbar chips and the raw-drivers verdict panel (two consumers with two
   * private definitions is the bug family this codebase keeps paying for).
   * Raw drivers score terribly on every design metric by nature, and a red
   * alarm the user did nothing to cause reads as "the app is broken" instead
   * of "get started" — so pre-design, the chips go neutral, values intact. */
  /**
   * UI-1 — A NETWORK TAB THAT IS ACTIVE AND EMPTY.
   *
   * `setWorkingDesign` sets `networkActive` unconditionally, which is right
   * for every design it is normally handed and wrong for a part list of
   * length zero — and a part list of length zero DID reach it (see the
   * selection block in `runVfOptimize`). The result was an app in a state it
   * has no word for: the Working tab said "No generator — add a source
   * element" while every chart summed the unfiltered drivers and four status
   * badges scored that sum as though it were a design.
   *
   * Kept as its own flag rather than folded into `designShaped`, because the
   * two empty states are different sentences to a reader: "you have not made a
   * design yet" and "a design was loaded and it has nothing in it". The first
   * is where everyone starts; the second is a bug or an empty shortlist.
   */
  const emptyNetworkLoaded = useMemo(
    () => networkActive && !!activeDesign && activeDesign.parts.length === 0,
    [networkActive, activeDesign],
  );

  const designShaped = useMemo(
    () =>
      (networkActive && !emptyNetworkLoaded) ||
      (project != null && xoName !== 'none') ||
      (!vfBypass &&
        (isActive(vFilters.woofer) ||
          isActive(vFilters.tweeter) ||
          (threeWay && isActive(vFilters.mid)))),
    [networkActive, emptyNetworkLoaded, project, xoName, vfBypass, vFilters, threeWay],
  );

  /* One visible answer to "which crossover am I looking at right now?" — the
   * single most confusing thing about the virtual/passive split. Mirrors the
   * actual sim precedence (editor network > vxp variant > virtual filters >
   * raw drivers) so it can never disagree with the charts. */
  const simSource: string = useMemo(() => {
    if (networkActive && activeDesign)
      return t('passive network “{name}”', { name: activeDesign.name });
    if (project && xoName !== 'none') return t('VituixCAD variant “{name}”', { name: xoName });
    if (
      !vfBypass &&
      (isActive(vFilters.woofer) ||
        isActive(vFilters.tweeter) ||
        (threeWay && isActive(vFilters.mid)))
    )
      return t('the virtual filter design (Filters tab)');
    return t('raw drivers — no crossover yet');
    // uiLang is a real dependency: t() reads the module-level language, and a
    // cached memo would otherwise keep serving the previous language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkActive, activeDesign, project, xoName, vfBypass, vFilters, threeWay, uiLang]);

  /**
   * UI-2 — EVERY NETWORK MUTATION LANDS HERE, and nowhere else.
   *
   * An edit, an undo and a redo all replace the active tab's part list through
   * this one function. What happens next is not decided here: the `schematic`
   * memo follows the part list, `readiness` (below) says whether the drawing
   * can be simulated and what is wrong with it, and the sim memo either solves
   * it or refuses with that reason. Three callers, one path — the V32 shape —
   * so an undo cannot reach the charts by a different road than the edit it
   * undoes. The history bookkeeping is the only thing that differs per caller.
   */
  function replaceActiveParts(parts: VxpPart[]) {
    if (!activeDesign) return;
    setDesigns((ds) => ds.map((d) => (d.id === activeDesign.id ? { ...d, parts } : d)));
  }

  function commitSchematic(parts: VxpPart[]) {
    if (!activeDesign) return;
    setSchHistory((h) => [...h.slice(-49), activeDesign.parts]);
    setSchFuture([]); // a fresh edit invalidates the redo branch
    replaceActiveParts(parts);
  }

  function undoSchematic() {
    if (schHistory.length === 0 || !activeDesign) return;
    const prev = schHistory[schHistory.length - 1];
    setSchFuture((f) => [...f.slice(-49), activeDesign.parts]);
    replaceActiveParts(prev);
    setSchHistory(schHistory.slice(0, -1));
  }

  function redoSchematic() {
    if (schFuture.length === 0 || !activeDesign) return;
    const next = schFuture[schFuture.length - 1];
    setSchHistory((h) => [...h.slice(-49), activeDesign.parts]);
    replaceActiveParts(next);
    setSchFuture(schFuture.slice(0, -1));
  }

  /* ---- Add LCR notch (series trap across a driver) — popup on the Network
   *  tab. Depth → R, Q → L/C ratio, values from the measured impedance at f0
   *  (same design as the synthesis notch). Inserts live + undoable. ---- */
  const [trapOpen, setTrapOpen] = useState(false);
  const [trapModel, setTrapModel] = useState('mid');
  const [trapFreq, setTrapFreq] = useState('5500');
  const [trapDepth, setTrapDepth] = useState('-6');
  const [trapQ, setTrapQ] = useState('3');
  const trapCompute = useMemo(() => {
    const f0 = numOf(trapFreq, 0);
    const q = Math.max(numOf(trapQ, 3), 0.2);
    const depth = numOf(trapDepth, -6);
    const z = impedances[trapModel];
    if (!z || !(f0 > 0) || depth >= -0.1) return null;
    const zmag = interpAt(z.freq, z.magnitude, f0);
    if (zmag == null || !(zmag > 0)) return null;
    const w0 = 2 * Math.PI * f0;
    const a = 10 ** (depth / 20); // depth < 0 → a < 1 (a cut)
    const Rn = Math.max((a / (1 - a)) * zmag, 0.2);
    const X = Rn * q; // characteristic impedance √(L/C)
    const Lh = X / w0;
    const Cf = 1 / (X * w0);
    return {
      Lh,
      Lmh: Math.round(Lh * 1e3 * 1000) / 1000,
      Cuf: Math.round(Cf * 1e6 * 100) / 100,
      R: Math.round(Rn * 100) / 100,
      zmag: Math.round(zmag * 100) / 100,
    };
  }, [trapModel, trapFreq, trapDepth, trapQ, impedances]);

  function addNotchTrap() {
    if (!activeDesign || !trapCompute) return;
    const hot = driverHotPoint(activeDesign.parts, trapModel);
    if (!hot) {
      setNetOptNote(`Could not locate the ${trapModel} driver in this network.`);
      setTrapOpen(false);
      return;
    }
    const y = hot.y;
    // Column pick: BEFORE the driver first (signal flow reads generator →
    // filter → driver, so a trap right of the driver looks "after" it —
    // Sanders klacht), walking left per grid unit into the gap between the
    // last series element and the driver; rightward as fallback. A column is
    // usable when (a) no existing POINT sits in its y-range — wires connect
    // at coincident points, so landing on occupied coordinates would silently
    // MERGE parts (two traps became one) — and (b) no horizontal component
    // BODY on the bus row spans it (hanging a trap off a part body reads as
    // nonsense; hanging off a wire is normal).
    const pointNear = (cx: number) =>
      activeDesign.parts.some((p) => p.wires.some((w) => w.x === cx && w.y >= y - 1 && w.y <= y + 16));
    const bodySpans = (cx: number) =>
      activeDesign.parts.some(
        (p) =>
          p.type !== 'Wire' &&
          p.type !== 'Ground' &&
          p.wires.length === 2 &&
          p.wires[0].y === y &&
          p.wires[1].y === y &&
          Math.min(p.wires[0].x, p.wires[1].x) < cx &&
          cx < Math.max(p.wires[0].x, p.wires[1].x),
      );
    const candidates: number[] = [];
    for (let dx = 3; dx <= 24; dx++) candidates.push(hot.x - dx); // before the driver
    for (let k = 1; k <= 12; k++) candidates.push(hot.x + 7 * k); // fallback: right
    const tx = candidates.find((c) => c >= 2 && !pointNear(c) && !bodySpans(c)) ?? hot.x + 7 * 13;
    const { Lmh, Cuf, R, Lh } = trapCompute;
    const ps: VxpPart[] = [...activeDesign.parts];
    const idL = nextPartId(ps, 'Inductor');
    ps.push({
      type: 'Inductor',
      partId: idL,
      params: [
        { name: 'L', value: Lmh, unit: 'mH' },
        { name: 'DCR', value: Math.round(estimateCoilDcr(Lh) * 1000) / 1000, unit: 'Ω' },
      ],
      wires: [{ x: tx, y }, { x: tx, y: y + 5 }],
    });
    const idC = nextPartId(ps, 'Capacitor');
    ps.push({
      type: 'Capacitor',
      partId: idC,
      params: [
        { name: 'C', value: Cuf, unit: 'uF' },
        { name: 'ESR', value: 0, unit: 'Ω' },
      ],
      wires: [{ x: tx, y: y + 5 }, { x: tx, y: y + 10 }],
    });
    const idR = nextPartId(ps, 'Resistor');
    ps.push({
      type: 'Resistor',
      partId: idR,
      params: [{ name: 'R', value: R, unit: 'Ω' }],
      wires: [{ x: tx, y: y + 10 }, { x: tx, y: y + 15 }],
    });
    ps.push({ type: 'Ground', params: [], wires: [{ x: tx, y: y + 15 }] });
    ps.push({ type: 'Wire', params: [], wires: [{ x: hot.x, y }, { x: tx, y }] });
    // Auto-tidy (Sanders wens): the fresh trap lands in a redrawn layout with
    // same-node notches sorted by frequency, immediately. tidySchematic is
    // conservative — exotic topologies return null and the manual placement
    // stays. One commit = one undo step reverts trap AND redraw together.
    const tidied = tidySchematic(ps);
    commitSchematic(tidied ?? ps);
    setTrapOpen(false);
    setNetOptNote(
      t('Added LCR trap @ {hz} Hz on {model}: {l} mH · {c} µF · {r} Ω.', { hz: Math.round(numOf(trapFreq, 0)), model: trapModel, l: Lmh, c: Cuf, r: R }) + ' ' +
        (tidied
          ? t('Layout tidied — notches sorted by frequency. Fine-tune with ⚙ Optimize components.')
          : t('Fine-tune with ⚙ Optimize components; layout kept as-is (topology too exotic for the auto-placer).')),
    );
  }

  /** The scratch tab that Optimize / Build always writes into. Saving a
   *  filter snapshots it into a normal tab; Working keeps being overwritten. */
  const WORKING_ID = 'working';
  /** Current evaluation band, readable from writers declared above the memo. */
  const evalBandRef = useRef<{ fromHz: number; toHz: number } | null>(null);

  function setWorkingDesign(parts: VxpPart[]) {
    const existing = designs.find((d) => d.id === WORKING_ID);
    if (existing && activeDesignId === WORKING_ID) {
      setSchHistory((h) => [...h.slice(-49), existing.parts]);
    } else {
      setSchHistory([]);
    setSchFuture([]);
    }
    // B2: stamp the band this design was produced on. A tab without the stamp
    // was computed against a band nobody can name any more, and says so.
    const stamp = evalBandRef.current
      ? { bandAtDesign: { fromHz: evalBandRef.current.fromHz, toHz: evalBandRef.current.toHz } }
      : {};
    setDesigns((ds) =>
      ds.some((d) => d.id === WORKING_ID)
        ? ds.map((d) => (d.id === WORKING_ID ? { ...d, parts, ...stamp } : d))
        : [...ds, { id: WORKING_ID, name: 'Working', parts, ...stamp }],
    );
    setActiveDesignId(WORKING_ID);
    setNetworkActive(true);
  }

  /** Save the active design under a chosen name and SWITCH to the saved tab
   *  (Sanders wens: opslaan = actief worden) — the tab you came from stays
   *  behind as a ghost in the compare overlay. */
  const [saveNameDraft, setSaveNameDraft] = useState<string | null>(null);
  /** Classic Save/Save-as split (Sanders wens): "💾 Save" overwrites the LAST
   *  saved filter tab, "Save as new" opens the name input. Persisted so the
   *  Save target survives a reload. */
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  function saveActiveDesign(name: string) {
    if (!activeDesign) return;
    const id = `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    setDesigns((ds) => [
      ...ds,
      {
        id,
        name: uniqueDesignName(name.trim() || 'Filter', ds),
        parts: structuredClone(activeDesign.parts),
        /* UI-1 — THE VOICING TRAVELS WITH THE DESIGN (A5e.2).
         *
         * It hangs on the design precisely so two voicings of one loudspeaker
         * can sit side by side and be compared, and Save-as-new is how the
         * second one comes to exist. Dropping it here would have made every
         * saved copy silently flat — the comparison this decision exists to
         * make easy, quietly impossible. */
        ...(activeDesign.targetCurve
          ? { targetCurve: structuredClone(activeDesign.targetCurve) }
          : {}),
      },
    ]);
    setActiveDesignId(id);
    setLastSavedId(id);
    setSchHistory([]);
    setSchFuture([]);
    setNetworkActive(true);
    setSaveNameDraft(null);
  }

  /** "💾 Save": overwrite the last-saved filter tab with the active design and
   *  switch to it. Disabled in the UI when there is no target yet, or when the
   *  target IS the active tab (a tab edits live — nothing to save then). */
  function overwriteLastSaved() {
    if (!activeDesign || !lastSavedId || lastSavedId === activeDesignId) return;
    const parts = structuredClone(activeDesign.parts);
    setDesigns((ds) => ds.map((d) => (d.id === lastSavedId ? { ...d, parts } : d)));
    setActiveDesignId(lastSavedId);
    setSchHistory([]);
    setSchFuture([]);
    setNetworkActive(true);
  }

  /** New tab (auto-unique name), activated, driving the sim. */
  function addDesign(name: string, parts: VxpPart[]) {
    const id = `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    setDesigns((ds) => [...ds, { id, name: uniqueDesignName(name, ds), parts }]);
    setActiveDesignId(id);
    setSchHistory([]);
    setSchFuture([]);
    setNetworkActive(true);
  }

  function selectDesign(id: string) {
    if (id === activeDesignId) return;
    setActiveDesignId(id);
    setSchHistory([]);
    setSchFuture([]);
  }

  function renameDesign(id: string, name: string) {
    const clean = name.trim();
    if (clean === '') return;
    setDesigns((ds) => ds.map((d) => (d.id === id ? { ...d, name: clean } : d)));
  }

  function deleteDesign(id: string) {
    const rest = designs.filter((d) => d.id !== id);
    setDesigns(rest);
    if (lastSavedId === id) setLastSavedId(null);
    if (activeDesignId === id) {
      setActiveDesignId(rest.length > 0 ? rest[rest.length - 1].id : null);
      setSchHistory([]);
    setSchFuture([]);
      if (rest.length === 0) setNetworkActive(false);
    }
  }

  /**
   * Per-driver response loader. Multi-select all horizontal angle files at
   * once: the angle is read from the filename (hor15 / 15deg / deg15); the 0°
   * (or unmarked) file becomes the main response, the full set feeds the
   * directivity view. A fresh selection replaces that driver's previous set.
   */
  function loadDriverFiles(side: 'woofer' | 'mid' | 'tweeter') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files ?? [])];
      e.target.value = '';
      void loadDriverFileList(side, files);
    };
  }

  /* Shared by the file input AND drag-and-drop on the driver card: an OS
   * multi-select dialog is the most error-prone picker there is, and dropping
   * the files you already have open in a folder is how people actually work. */
  async function loadDriverFileList(side: 'woofer' | 'mid' | 'tweeter', files: File[]) {
    {
      if (files.length === 0) return;
      setError(null);
      // Content-vs-extension sanity (roadmap jul 2026): the parser is chosen
      // by extension while FRD and ZMA share the same three columns, so a
      // misnamed file loads cleanly into the WRONG slot — ohms in the dB
      // column, no error, just a driver at ~7 dB. Warn loudly on a confident
      // level-profile mismatch but still load as asked: signalling, never a
      // second silent decision.
      const warnings: string[] = [];
      try {
        // ZMA files in the same selection become this driver's impedance —
        // no vxp project needed for solving/synthesis. Stored by branch ROLE;
        // the canonical model name is derived where the solver map is built.
        const role: BranchRole = side === 'woofer' ? 'low' : side === 'mid' ? 'mid' : 'high';
        const zmaFiles = files.filter((f) => f.name.toLowerCase().endsWith('.zma'));
        for (const f of zmaFiles) {
          const raw = await f.text();
          const zma = parseZma(raw);
          const cls = classifyLevelProfile(zma.magnitude);
          if (cls.kind === 'spl') {
            warnings.push(
              `"${f.name}" is named .zma but its levels look like an SPL response ` +
                `(median ≈ ${cls.medianLevel.toFixed(0)}) — the solver would see a ` +
                `~${cls.medianLevel.toFixed(0)} Ω driver. If this is a response file, ` +
                `rename it to .frd and reload.`,
            );
          }
          setZStandalone((prev) => ({ ...prev, [role]: { file: { name: f.name, raw }, zma } }));
        }
        // LIMP's binary .lim (ARTA) is converted to ZMA text ONCE, here at the
        // boundary: everything downstream (autosave, project files, the
        // VituixCAD folder export) stores raw files as text and re-parses them
        // on restore. The stored raw IS the converted text — re-parsing it
        // keeps raw and in-memory data provably identical.
        const limFiles = files.filter((f) => f.name.toLowerCase().endsWith('.lim'));
        for (const f of limFiles) {
          const lim = parseLim(await f.arrayBuffer());
          const raw = limToZmaText(lim, f.name);
          const zma = parseZma(raw);
          const name = f.name.replace(/\.lim$/i, '.zma');
          setZStandalone((prev) => ({ ...prev, [role]: { file: { name, raw }, zma } }));
        }
        const frdOnly = files.filter(
          (f) => !/\.(zma|lim)$/i.test(f.name),
        );
        if (frdOnly.length === 0) {
          // Impedance-only selection: still surface any .zma warnings.
          if (warnings.length > 0) setError(warnings.join(' '));
          return;
        }
        const byHor = new Map<number, AngleEntry>();
        for (const f of frdOnly) {
          const raw = await f.text();
          const hor = angleFromFilename(f.name) ?? 0;
          const frd = parseFrd(raw);
          // Only 3-column files can be a misnamed ZMA (parseZma demands
          // phase), which also keeps 2-column normalized target curves out
          // of this check's reach.
          if (frd.hasPhase) {
            const cls = classifyLevelProfile(frd.spl);
            if (cls.kind === 'impedance') {
              warnings.push(
                `"${f.name}" was loaded as a response, but its levels look like an ` +
                  `impedance measurement (median ≈ ${cls.medianLevel.toFixed(1)} Ω, all ` +
                  `positive) — as SPL that is a driver at ~${cls.medianLevel.toFixed(0)} dB. ` +
                  `If this is a ZMA/LIMP export, rename it to .zma (or load the .lim) so ` +
                  `it lands in the impedance slot.`,
              );
            }
          }
          byHor.set(hor, { hor, name: f.name, raw, frd });
        }
        const entries = [...byHor.values()].sort((a, b) => a.hor - b.hor);
        const axis = entries.find((a) => a.hor === 0) ?? entries[0];
        const loaded: Loaded = { name: axis.name, raw: axis.raw, frd: axis.frd };
        if (side === 'woofer') setWoofer(loaded);
        else if (side === 'mid') setMidDrv(loaded);
        else setTweeter(loaded);
        setAngleSets((prev) => {
          const mid = side === 'mid' ? entries : prev?.mid ?? [];
          const next = {
            woofer: side === 'woofer' ? entries : prev?.woofer ?? [],
            tweeter: side === 'tweeter' ? entries : prev?.tweeter ?? [],
            ...(mid.length > 0 ? { mid } : {}),
          };
          return next.woofer.length + next.tweeter.length + mid.length > 0 ? next : null;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      if (warnings.length > 0) setError(warnings.join(' '));
    }
  }

  /* Page-wide drop on the import step (Sanders idee): drop ANYTHING on "Your
   * Project" and the app sorts it. Unambiguous types route straight to their
   * loader — a .vxp batch, or one JSON/HTML with a Crossover Studio format
   * marker (project / catalog / filter). Measurement files cannot be routed
   * without guessing WHICH driver they belong to, so those open a one-question
   * chooser instead — dropping on a driver card directly skips the question.
   * A mixed batch is refused with a reason: one wrong guess that silently
   * lands in the wrong slot costs more than the question ever will. */
  const [dropPick, setDropPick] = useState<File[] | null>(null);
  const [pageDropArmed, setPageDropArmed] = useState(false);
  const pageDropDepth = useRef(0);
  async function routeDroppedFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    const isMeas = (f: File) => /\.(frd|zma|lim|txt)$/i.test(f.name);
    if (files.some((f) => f.name.toLowerCase().endsWith('.vxp'))) {
      // The vxp loader WANTS the whole set at once (.vxp + .ZMA + .txt) —
      // a folder-contents drop is exactly its select-together semantics.
      await loadVituixFileList(files);
      return;
    }
    if (files.length === 1 && /\.(json|adsfilter|html?)$/i.test(files[0].name)) {
      const f = files[0];
      const text = await f.text();
      if (text.includes('acoustic-design-studio-project')) return loadProjectFile(f);
      if (text.includes('acoustic-design-studio-catalog')) return importCatalogFile(f);
      if (text.includes('acoustic-design-studio-filter')) return importFilterFile(f);
      setError(
        t('"{name}" carries no Crossover Studio format marker — not a saved project, catalog or filter file.', { name: f.name }),
      );
      return;
    }
    if (files.every(isMeas)) {
      setDropPick(files);
      return;
    }
    setError(
      t('Mixed drop — drop measurement files (FRD/ZMA/LIM), or a .vxp set, or ONE project/catalog/filter file at a time.'),
    );
  }
  function pageDropHandlers() {
    return {
      onDragEnter: (e: React.DragEvent) => {
        if (designTab !== 'import' || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        pageDropDepth.current += 1;
        setPageDropArmed(true);
      },
      onDragOver: (e: React.DragEvent) => {
        if (designTab !== 'import' || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
      },
      onDragLeave: () => {
        pageDropDepth.current = Math.max(0, pageDropDepth.current - 1);
        if (pageDropDepth.current === 0) setPageDropArmed(false);
      },
      onDrop: (e: React.DragEvent) => {
        const handledByCard = e.defaultPrevented; // a driver card took it first
        pageDropDepth.current = 0;
        setPageDropArmed(false);
        if (designTab !== 'import' || handledByCard) return;
        e.preventDefault();
        void routeDroppedFiles([...e.dataTransfer.files]);
      },
    };
  }

  /* Drop-target plumbing for the driver cards. dragenter/leave fire for every
   * child crossed, so a counter — not a boolean — tracks "still inside". */
  const [dropSide, setDropSide] = useState<'woofer' | 'mid' | 'tweeter' | null>(null);
  const [cmpDropArmed, setCmpDropArmed] = useState(false);
  const dropDepth = useRef(0);
  function dropHandlers(side: 'woofer' | 'mid' | 'tweeter') {
    return {
      onDragEnter: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dropDepth.current += 1;
        setDropSide(side);
      },
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: () => {
        dropDepth.current = Math.max(0, dropDepth.current - 1);
        if (dropDepth.current === 0) setDropSide(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        dropDepth.current = 0;
        setDropSide(null);
        void loadDriverFileList(side, [...e.dataTransfer.files]);
      },
    };
  }

  /** The classic 2-way demo: the 2023 KOAN prototype (mid + tweeter, vxp variants). */
  function loadDemo2Way() {
    setError(null);
    setWoofer({ name: 'mid_hor0_mettape.txt (demo)', raw: demoMid, frd: parseFrd(demoMid) });
    // The demo is the 2-way KOAN set — a leftover mid branch would turn it
    // into an accidental 3-way.
    setMidDrv(null);
    setTweeter({ name: 'tweet_hor0_mettape.txt (demo)', raw: demoTweet, frd: parseFrd(demoTweet) });
    const entry = (hor: number, raw: string): AngleEntry => ({
      hor,
      name: `hor${hor} (demo)`,
      raw,
      frd: parseFrd(raw),
    });
    setAngleSets({
      woofer: [
        entry(0, demoMid), entry(15, demoMid15), entry(30, demoMid30),
        entry(45, demoMid45), entry(60, demoMid60), entry(75, demoMid75),
      ],
      tweeter: [
        entry(0, demoTweet), entry(15, demoTweet15), entry(30, demoTweet30),
        entry(45, demoTweet45), entry(60, demoTweet60), entry(75, demoTweet75),
      ],
    });
    setProject({
      vxp: parseVxp(demoVxp),
      vxpFile: { name: 'KOAN 2951 Prototype 140826.vxp', raw: demoVxp },
      impedances: { mid: parseZma(demoMidZma), tweeter: parseZma(demoTweetZma) },
      impedanceFiles: {
        mid: { name: 'mid_Backwavecone_sheep75gram.ZMA', raw: demoMidZma },
        tweeter: { name: 'tweeter.ZMA', raw: demoTweetZma },
      },
    });
    /* The demo is a whole MEASUREMENT SESSION, not just two curves: the
       cabinet it was measured on and how the mic stood belong to it. Without
       them half the app has nothing to reason with — the true sweep angles,
       the honest low limit, the baffle step, the lobing ceiling and the
       rig/driver split of the delay all need these numbers, and a new user
       cannot invent them. Facts only: everything here is the real KOAN
       prototype.

       The mounting depths ARE filled in (Sanders call, and the better one):
       leaving them blank to "protect the cross-check" only showed a gap,
       while filling them makes the card demonstrate the check passing —
       "measured depth 17.3 mm … Your 17.3 mm agrees" says more about how
       this app thinks than an empty field ever could. The listening
       position stays blank: that is Sanders room, not the loudspeaker. */
    setCabinet({
      ...emptyCabinet(),
      micDistanceMm: '500',
      baffleWidthMm: '260',
      baffleHeightMm: '1150',
      // The mic was aimed midway between the two drivers, so neither is the
      // reference: they sit symmetrically at ±65 mm, and the rig's share of
      // the inter-driver delay cancels exactly.
      refDriver: '',
      refFromTopMm: '238',
      refHeightMm: '980',
      drivers: {
        ...emptyCabinet().drivers,
        // Depth 0 is not "unknown" here: the tweeter is the shallowest of
        // the two, so it is the zero the other is measured from.
        high: { ...emptyCabinetDriver(), xMm: '0', yMm: '65', depthMm: '0' },
        low: {
          ...emptyCabinetDriver(),
          xMm: '0',
          yMm: '-65',
          // What the measurement itself derives once the rig's share is
          // removed — a 5" cone's acoustic centre sits at its voice coil,
          // well behind the flange, so the mid is the deeper of the two.
          depthMm: '17.3',
          // Its own sealed chamber; 89 Hz is what its measured impedance says,
          // and the app proposes exactly that from the ZMA.
          enclosure: 'sealed',
          fbHz: '89',
        },
      },
    });
    // Datasheet numbers: BlieSMa T25T-6 and SB Acoustics Satori MW13TX-4.
    // Xmax is the ONE-WAY figure — both datasheets quote peak-to-peak (2 mm
    // and 10 mm), and entering those would make the excursion floor read a
    // factor √2 too optimistic.
    setSdCm2({ low: '70', mid: '', high: '5.7' });
    setXmaxMm({ low: '5', mid: '', high: '1' });
    // The demo playground ships the priced Jantzen/Mundorf catalog too, so
    // Snap to catalog and the BOM work out of the box — but NEVER overwrite
    // a catalog the user imported or edited themselves.
    if (!localStorage.getItem(CUSTOM_CATALOG_KEY)) {
      try {
        const imp = deserializeCatalog(demoCatalog);
        applyCatalogSeries(imp.series, imp.parts);
        void storeCompressed(CUSTOM_CATALOG_KEY, serializeCatalog(imp.series, imp.parts), t('The catalog'));
        setPersistNote(
          t('Demo catalog loaded — {n} priced SKUs (snap, BOM and inspector use them)', { n: imp.parts.length }),
        );
      } catch {
        // Demo catalog fixture unreadable: run with built-ins.
      }
    }
  }

  /**
   * The 3-WAY demo (KOAN 2951, Aug 2026 — Sander's finished cabinet: woofer
   * pair, mid, tweeter, angles, near fields, LIMP impedances, and the cabinet/
   * rig he entered). Same speaker as the classic KOAN demo, three years on.
   * The measurement module is a dynamic import so its ~300 kB only loads on
   * click.
   */
  async function loadDemo3Way() {
    setError(null);
    setPersistNote(t('Loading the 3-way demo…'));
    let mod: typeof import('./demo3way.ts');
    try {
      mod = await import('./demo3way.ts');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    const D = mod.KOAN_3WAY_DEMO;
    const loaded = (f: { name: string; raw: string }): Loaded => ({
      name: `${f.name} (demo)`,
      raw: f.raw,
      frd: parseFrd(f.raw),
    });
    const entries = (b: { angles: readonly { hor: number; file: { name: string; raw: string } }[] }): AngleEntry[] =>
      b.angles.map((a) => ({ hor: a.hor, name: `${a.file.name} (demo)`, raw: a.file.raw, frd: parseFrd(a.file.raw) }));
    setWoofer(loaded(D.low.angles[0].file));
    setMidDrv(loaded(D.mid.angles[0].file));
    setTweeter(loaded(D.high.angles[0].file));
    setAngleSets({ woofer: entries(D.low), tweeter: entries(D.high), mid: entries(D.mid) });
    // No VituixCAD project here — the impedances are standalone, by role.
    setProject(null);
    setZStandalone({
      low: { file: { name: D.low.impedance.name, raw: D.low.impedance.raw }, zma: parseZma(D.low.impedance.raw) },
      mid: { file: { name: D.mid.impedance.name, raw: D.mid.impedance.raw }, zma: parseZma(D.mid.impedance.raw) },
      high: { file: { name: D.high.impedance.name, raw: D.high.impedance.raw }, zma: parseZma(D.high.impedance.raw) },
    });
    // Near fields: cones on the two low branches, the port next to the
    // woofers. The port DIAMETER is deliberately left blank — Sander has not
    // entered it, and a guessed number would silently shape the low end;
    // without it the cone alone is spliced and the port file simply waits.
    setNearField({
      low: {
        ...emptyNearField(),
        cone: D.low.nearCone ? { name: D.low.nearCone.name, raw: D.low.nearCone.raw } : null,
        port: D.low.nearPort ? { name: D.low.nearPort.name, raw: D.low.nearPort.raw } : null,
      },
      mid: {
        ...emptyNearField(),
        cone: D.mid.nearCone ? { name: D.mid.nearCone.name, raw: D.mid.nearCone.raw } : null,
      },
      high: emptyNearField(),
    });
    setCabinet({
      ...emptyCabinet(),
      ...D.cabinet,
      drivers: {
        low: { ...emptyCabinetDriver(), ...D.cabinet.drivers.low },
        mid: { ...emptyCabinetDriver(), ...D.cabinet.drivers.mid },
        high: { ...emptyCabinetDriver(), ...D.cabinet.drivers.high },
      },
    });
    setSdCm2({ ...D.sdCm2 });
    setXmaxMm({ ...D.xmaxMm });
    setVerifyList([]);
    setVerifyIx(0);
    setFileNotes({});
    if (!localStorage.getItem(CUSTOM_CATALOG_KEY)) {
      try {
        const imp = deserializeCatalog(demoCatalog);
        applyCatalogSeries(imp.series, imp.parts);
        void storeCompressed(CUSTOM_CATALOG_KEY, serializeCatalog(imp.series, imp.parts), t('The catalog'));
      } catch {
        // Demo catalog fixture unreadable: run with built-ins.
      }
    }
    setPersistNote(t('3-way demo loaded — {label}: woofer pair, mid, tweeter, 0–60°, near fields and the measured cabinet', { label: D.label }));
  }

  /** "The demo" = the 3-way (Sanders' finished KOAN, Aug 2026). The 2023
   *  2-way prototype stays reachable as its own button. */
  function loadDemo() {
    void loadDemo3Way();
  }

  /**
   * Load a VituixCAD .vxp together with its .ZMA impedance files (multi-select
   * — the vxp only REFERENCES the ZMAs by filename, it does not contain
   * them). ZMAs are matched to driver models via the basename in the vxp;
   * already-loaded impedances are kept as fallback for models not re-supplied.
   */
  const [vxpNote, setVxpNote] = useState<string | null>(null);

  async function loadVituixFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length === 0) {
      // A change event with zero files: either a cancel, or the browser
      // failed to hand over the selection (seen on network/virtual volumes).
      setVxpNote(
        t('File dialog returned no files. If you did select files, copy them to a local folder (e.g. Downloads) and try again.'),
      );
      return;
    }
    await loadVituixFileList(files);
  }

  /** Shared by the file input and the page-wide drop on the import step. */
  async function loadVituixFileList(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setVxpNote(t('Reading {n} file(s): {names}…', { n: files.length, names: files.map((f) => f.name).join(', ') }));
    try {
      let vxpFile: StoredFile | null = project?.vxpFile ?? null;
      const zmaFiles: StoredFile[] = [];
      const frdFiles: StoredFile[] = [];
      for (const f of files) {
        const raw = await f.text();
        const lower = f.name.toLowerCase();
        if (lower.endsWith('.vxp')) vxpFile = { name: f.name, raw };
        else if (lower.endsWith('.zma')) zmaFiles.push({ name: f.name, raw });
        else frdFiles.push({ name: f.name, raw });
      }
      if (!vxpFile) {
        throw new Error('No .vxp file in the selection — pick the project file plus its ZMA files.');
      }
      const vxp = parseVxp(vxpFile.raw);

      const impedances: Record<string, ParsedZma> = {};
      const impedanceFiles: Record<string, StoredFile> = {};
      const status: string[] = [];

      let twDrv: (typeof vxp.drivers)[number] | undefined;
      let wfDrv: (typeof vxp.drivers)[number] | undefined;
      for (const d of vxp.drivers) {
        const parts: string[] = [];
        // First match wins — a vxp can carry a helper "woofer+tweeter parallel"
        // driver whose name matches both patterns; it must not clobber the real
        // tweeter/woofer slots.
        if (isTweeterModel(d.model)) twDrv ??= d;
        else wfDrv ??= d;

        // Impedance: from this selection, else keep what was already loaded.
        const wanted = d.impedanceFileName?.toLowerCase();
        const supplied = zmaFiles.find((z) => z.name.toLowerCase() === wanted);
        const chosen = supplied ?? project?.impedanceFiles[d.model];
        if (chosen) {
          impedances[d.model] = parseZma(chosen.raw);
          impedanceFiles[d.model] = chosen;
          parts.push('Z ✓');
        } else {
          parts.push(`Z MISSING (expects ${d.impedanceFileName ?? '?'})`);
        }

        // Responses: the vxp names its measurement files — auto-assign the
        // on-axis one to the right driver slot, and collect ALL horizontal
        // angles that are in the selection for the directivity view.
        const angleEntries: AngleEntry[] = [];
        for (const r of d.responses) {
          if (r.ver !== 0) continue;
          const af = frdFiles.find((f) => f.name.toLowerCase() === r.fileName.toLowerCase());
          if (af) angleEntries.push({ hor: r.hor, name: af.name, raw: af.raw, frd: parseFrd(af.raw) });
        }
        if (angleEntries.length >= 2 && angleEntries.some((a) => a.hor === 0)) {
          const side = isTweeterModel(d.model) ? 'tweeter' : 'woofer';
          setAngleSets((prev) => ({
            woofer: side === 'woofer' ? angleEntries : prev?.woofer ?? [],
            tweeter: side === 'tweeter' ? angleEntries : prev?.tweeter ?? [],
          }));
          parts.push(`${angleEntries.length} angles ✓`);
        }
        const resp = d.responses.find((r) => r.hor === 0 && r.ver === 0) ?? d.responses[0];
        const frd = frdFiles.find((f) => f.name.toLowerCase() === resp?.fileName.toLowerCase());
        if (frd) {
          const loaded: Loaded = { name: frd.name, raw: frd.raw, frd: parseFrd(frd.raw) };
          if (isTweeterModel(d.model)) setTweeter(loaded);
          else setWoofer(loaded);
          parts.push(`FRD ✓ (${resp!.fileName}, ${resp!.hor}°)`);
        } else {
          parts.push(
            (isTweeterModel(d.model) ? tweeter : woofer)
              ? 'FRD kept'
              : `FRD missing (add ${resp?.fileName ?? '?'} to the selection or load it manually)`,
          );
        }

        status.push(`${d.model}: ${parts.join(', ')}`);
      }

      setProject({ vxp, vxpFile, impedances, impedanceFiles });
      // Auto-select the first crossover variant so the import immediately shows
      // the actual crossover (not the raw drivers summed) — otherwise the SPL
      // reads as "no filter" until you pick a variant in Setup.
      setXoName(vxp.crossovers[0]?.name ?? 'none');
      // 1:1 with the import: honour the vxp's OWN per-driver acoustic settings
      // (phase convention, inter-driver Z-offset + response delay, relative
      // polarity) so the app reproduces VituixCAD exactly. These EXPLICIT
      // project values must win over the app's timing-based auto-behaviours —
      // so skip the phase auto-switch and the offset auto-fill for this load.
      phaseAutoSkip.current = true;
      offsetAutoSkip.current = true;
      let applied = '';
      if (twDrv && wfDrv) {
        // Phase convention + polarity come from the project; the offset does NOT.
        //
        // Hard-learned (Robbert vxp, jul 2026): the driver PART carries a Z
        // (tweeter Z = −65 mm), but VituixCAD does NOT turn that Z into an
        // inter-driver TIME offset on the axial result — its own exported
        // filtered responses show ~0 mm (5 µs) inter-driver delay, not 65 mm.
        // Meanwhile our measured FRDs ALREADY carry the real inter-driver
        // timing (Robbert: 141 µs ≈ 48 mm, R²=0.985, shared reference). So
        // deriving an offset from Z double-counts — verified against the real
        // measured acoustic sum: +65 mm was the WORST fit (7 dB), and the
        // integration jump it produced was the overlap metric being gamed by a
        // wrapped delay, not a real improvement. Keep offset 0 and let the
        // measured phase speak; the Z stays a geometry hint, not a delay.
        const mode = twDrv.minimumPhase || wfDrv.minimumPhase ? 'minimum' : 'measured';
        const inv = !!twDrv.inverted !== !!wfDrv.inverted;
        setPhaseMode(mode);
        setOffsetMm('0');
        setInverted(inv);
        applied = ` · applied from vxp: ${mode} phase, tweeter offset 0 mm (Z not applied as delay — measured phase already carries the timing)${
          inv ? ', tweeter inverted' : ''
        }`;
      } else {
        setPhaseMode('minimum');
      }
      setVxpNote(
        `${vxpFile.name} — ${t('{n} crossover variant(s)', { n: vxp.crossovers.length })} · ` +
          status.join(' · ') +
          applied,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Load VituixCAD's FILTERED woofer + tweeter responses (2 .frd/.txt files)
   *  as a phase reference — the app then draws their relative phase in our
   *  convention next to the live curve. Tweeter picked by filename. */
  async function loadReference(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (files.length < 2) {
      setError(t("Pick VituixCAD's FILTERED woofer AND tweeter response (2 files) to compare phase."));
      return;
    }
    setError(null);
    try {
      const parsed = await Promise.all(
        files.slice(0, 2).map(async (f) => ({ name: f.name, frd: parseFrd(await f.text()) })),
      );
      const tw = parsed.find((p) => isTweeterModel(p.name)) ?? parsed[1];
      const wf = parsed.find((p) => p !== tw) ?? parsed[0];
      setRefResp({ woofer: wf.frd, tweeter: tw.frd, names: `${wf.name} + ${tw.name}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Load the measured response of the BUILT system for the model-vs-
   *  measurement overlay. One file; loading again replaces it. */
  async function loadVerification(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await loadVerificationFile(file);
  }

  async function loadVerificationFile(file: File) {
    setError(null);
    try {
      const raw = await file.text();
      const frd = parseFrd(raw);
      const cls = classifyLevelProfile(frd.spl);
      setVerify({ name: file.name, raw, frd });
      if (frd.hasPhase && cls.kind === 'impedance') {
        setError(
          t('"{name}" was loaded as the verification measurement, but its levels look like an impedance file (median ≈ {z} Ω) — the comparison below will be meaningless.', { name: file.name, z: cls.medianLevel.toFixed(1) }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Load one near-field measurement into a branch's slot. Kept as raw text
   *  like every other measurement so the project file stays self-contained. */
  async function loadNearField(
    e: React.ChangeEvent<HTMLInputElement>,
    role: BranchRole,
    which: 'cone' | 'port',
  ) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const raw = await file.text();
      const frd = parseFrd(raw);
      if (!frd.hasPhase) {
        setError(
          t('"{name}" carries no phase. A near-field splice without phase would plant an unknown delay step at the crossover — measure it with a timing reference.', { name: file.name }),
        );
      }
      const cls = classifyLevelProfile(frd.spl);
      if (cls.kind === 'impedance') {
        setError(
          t('"{name}" looks like an impedance file (median ≈ {z} Ω), not a response.', { name: file.name, z: cls.medianLevel.toFixed(1) }),
        );
      }
      setNearField((n) => ({ ...n, [role]: { ...n[role], [which]: { name: file.name, raw } } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const num = (s: string, fallback: number) => {
    const v = Number(s);
    return s.trim() !== '' && Number.isFinite(v) ? v : fallback;
  };

  /** Component-wizard snap prefs; undefined when everything is on Auto. */
  const snapPrefsValue = (): SnapPrefs | undefined => {
    const seriesByKind: SnapPrefs['seriesByKind'] = {};
    if (snapSeriesL !== 'auto') seriesByKind.L = snapSeriesL;
    if (snapSeriesC !== 'auto') seriesByKind.C = snapSeriesC;
    if (snapSeriesR !== 'auto') seriesByKind.R = snapSeriesR;
    const hasSeries = Object.keys(seriesByKind).length > 0;
    // The value window only bites when a series is actually bound.
    const bound = snapBoundToSeries && hasSeries;
    if (snapProfile === 'auto' && !hasSeries && snapStacks) return undefined;
    return {
      profile: snapProfile as SnapPrefs['profile'],
      ...(hasSeries ? { seriesByKind } : {}),
      ...(snapStacks ? {} : { allowStacks: false }),
      ...(bound ? { boundToSeries: true } : {}),
    };
  };

  /** Target acoustic slopes for both optimizers ('auto' selections drop out).
   *  3-way adds the LOW pair's flanks (woofer LP / mid HP). */
  const acousticSlopesValue = ():
    | { mid?: number; tweeter?: number; low?: { lower?: number; upper?: number } }
    | undefined => {
    const mid = acSlopeMid === 'auto' ? undefined : Number(acSlopeMid);
    const tweeter = acSlopeTweeter === 'auto' ? undefined : Number(acSlopeTweeter);
    const lowLower = threeWay && acSlopeWoofer !== 'auto' ? Number(acSlopeWoofer) : undefined;
    const lowUpper = threeWay && acSlopeMidHp !== 'auto' ? Number(acSlopeMidHp) : undefined;
    const low = lowLower || lowUpper ? { lower: lowLower, upper: lowUpper } : undefined;
    return mid || tweeter || low ? { mid, tweeter, ...(low ? { low } : {}) } : undefined;
  };

  /* ------------------------------------------------------------------ *
   * ENGINE V2 (experimental) — the F1 reporting layer.
   *
   * One flag, read once, through the façade. Everything below is inert while
   * `reporting` is false: the memo returns null and no engine2 code runs at
   * all, which is the app-level half of the byte-identity guarantee that
   * `engine2/toggleRegression.test.ts` proves on the library side.
   *
   * The measurement set is handed over exactly as the project holds it —
   * nothing is filled in. A branch without an impedance file simply has none,
   * and the capability matrix says which metrics that switches off (P4).
   * ------------------------------------------------------------------ */
  const engineSelection = useMemo(() => selectEngine(engineV2Enabled), [engineV2Enabled]);

  /**
   * The v2 gate limits and budgets, parsed ONCE.
   *
   * EMPTY IS ABSENT (P4). Not "empty is zero", and not "empty is a sensible
   * default": a gate whose field is blank must reach the engine as a MISSING
   * KEY, so the report can say "no limit set" rather than render a limit
   * nobody typed. `undefined` is the only value that carries that meaning
   * through, so every field goes through here.
   *
   * One memo rather than one parse per consumer: the report panel and the
   * scan must judge a design against the same numbers, and two parsers of the
   * same text field is how they come to disagree about a decimal comma.
   */
  const engineV2Gates = useMemo(() => {
    const stated = (raw: string, scale = 1): number | undefined => {
      if (raw.trim() === '') return undefined;
      const v = Number(raw);
      return Number.isFinite(v) ? v * scale : undefined;
    };
    return {
      // M-A is entered as a percentage and held as a fraction: the field
      // speaks the designer's language, the engine speaks A4's.
      maxDissipationFraction: stated(engineV2Settings.maxDissipationPct, 1 / 100),
      minEpdrOhm: stated(engineV2Settings.minEpdrOhm),
      maxDriveOnFsDb: stated(engineV2Settings.maxDriveOnFsDb),
      lfBumpBudgetDb: stated(engineV2Settings.lfBumpBudgetDb),
      qesMultiplierMax: stated(engineV2Settings.qesMultiplierMax),
      dampingMarginDb: stated(engineV2Settings.dampingMarginDb),
      runSeed: stated(engineV2Settings.runSeed),
      runBudgetEvals: stated(engineV2Settings.runBudgetEvals),
      // A5e.1 — TASTE requirements. Same absent-means-absent rule, and
      // deliberately kept apart from the gates above: these filter the
      // delivered field and the ladder may widen them; a gate never is.
      splWindowPlusMinusDb: stated(engineV2Settings.splWindowPlusMinusDb),
      maxPhaseTrackingDeg: stated(engineV2Settings.maxPhaseTrackingDeg),
      shortlistSize: stated(engineV2Settings.shortlistSize),
      /* V49 — M-C v2.0's three stated inputs. They reach the REPORT as
       * settings (the ceiling is derived there) and never the scan payload
       * directly: what crosses to the worker is the derived ceiling, as a
       * measured fact (`factsForWorker`). */
      amplifierPeakPowerW: stated(engineV2Settings.amplifierPeakPowerW),
      amplifierNominalLoadOhm: stated(engineV2Settings.amplifierNominalLoadOhm),
      xmaxMarginFraction: stated(engineV2Settings.xmaxMarginFraction),
      /* V50 — buildability. Gate settings, read by the report AND by the
       * scan; the continuous power they judge at is `amplifierPowerW`, which
       * already reaches both. */
      resistorClassW: stated(engineV2Settings.resistorClassW),
      resistorPowerMargin: stated(engineV2Settings.resistorPowerMargin),
      coilClassA: stated(engineV2Settings.coilClassA),
      /* V51 — the thermal design power M-A/part judges at (blank = at the
       * continuous rating), and the level-work requirement on the lowest way.
       * The second is a CHOICE and not a number: '' is absent (P4) and never a
       * stated "allowed"; only 'none' reaches the engine. */
      resistorThermalPowerW: stated(engineV2Settings.resistorThermalPowerW),
      /* V51b — 'series-r-max' needs its number: without one the state cannot
       * be stated (a maximum without a figure binds nothing) and it reads as
       * absent, which the form flags. One type, one home (`levelWork.ts`). */
      lowestWayLevelWork: ((): LowestWayLevelWork | undefined => {
        if (engineV2Settings.lowestWayLevelWork === 'none') return 'none';
        if (engineV2Settings.lowestWayLevelWork === 'series-r-max') {
          const max = stated(engineV2Settings.lowestWaySeriesRMaxOhm);
          return max !== undefined && max >= 0 ? { kind: 'series-r-max', maxOhm: max } : undefined;
        }
        return undefined;
      })(),
    };
  }, [engineV2Settings]);

  /**
   * V50 — the STATED M-C figure per way, keyed by ROLE; re-keyed to driver ids
   * by the adapter (report) and to models by the scan. Empty = none per way,
   * and the single `maxDriveOnFsDb` field then judges every protected way.
   */
  const driveOnFsMaxDbByRole = useMemo(() => {
    const out: Partial<Record<BranchRole, number>> = {};
    for (const role of ['low', 'mid', 'high'] as const) {
      const raw = v2Meas[role].driveOnFsMaxDb;
      if (raw.trim() === '') continue;
      const v = Number(raw);
      if (Number.isFinite(v)) out[role] = v;
    }
    return out;
  }, [v2Meas]);

  /**
   * A5e.3 — the loaded catalogue's coil fits (one per brand, series and
   * gauge), and the coil family per way as stated in the measurement block.
   * The fits are what a stated family resolves to, in the report and in the
   * scan; the family per way travels keyed by role here and is re-keyed to
   * driver id (report) or model (scan) where it is read. Re-fitted when the
   * catalogue changes: the fit is closed-form and takes milliseconds.
   */
  const coilDcrFits = useMemo(() => fitCoilDcrFamilies(catalogParts()), [catalogRev]);
  const coilCatalogLabel = useMemo(
    () => `loaded catalogue (${catalogParts().filter((p) => p.kind === 'L').length} coils, ${coilDcrFits.length} families)`,
    [coilDcrFits],
  );
  const coilFamilyByRole = useMemo(() => {
    const out: Partial<Record<BranchRole, string>> = {};
    for (const role of ['low', 'mid', 'high'] as const) {
      const raw = v2Meas[role].coilFamily.trim();
      if (raw !== '') out[role] = raw;
    }
    return out;
  }, [v2Meas]);

  /**
   * UI-1 — THE v2 REPORT AS A FUNCTION OF A NETWORK, not of the active tab.
   *
   * It was a memo over the active design and nothing else, which is what the
   * panel needs and not what the shortlist column needs: M-F-final (the
   * vertical lobing synthesis) is a property of a NETWORK, and the shortlist
   * has ten of them. Building a second, smaller lobing path beside this one
   * would be two implementations of one metric — the failure mode this
   * codebase has paid for repeatedly — so the whole report becomes a function
   * of the netlist instead, and `engineV2Report` is that function applied to
   * the active design.
   *
   * Everything else — measurements, geometry, gates, target curve — is the
   * same for every candidate, because it describes the LOUDSPEAKER and not the
   * filter. That is precisely why the dependency list below no longer mentions
   * `designs` or `activeDesignId`.
   */
  const buildV2Report = useMemo(() => (
    net: { name: string; parts: readonly VxpPart[] } | null,
  ) => {
    if (!engineSelection.reporting) return null;
    try {
      const asResponse = (name: string, frd: Parsed): AdapterResponse => ({
        name,
        freq: frd.freq,
        spl: frd.spl,
        phaseDeg: frd.phase,
        comments: frd.meta.rawComments,
      });
      const parseStored = (f: StoredFile | null): AdapterResponse | null => {
        if (!f) return null;
        try {
          return asResponse(f.name, parseFrd(f.raw));
        } catch {
          return null;
        }
      };
      const zFor = (role: BranchRole): AdapterImpedance | null => {
        const standalone = zStandalone[role];
        const model = canonicalModelForRole(role, threeWay);
        const zma = standalone?.zma ?? impedances[model];
        if (!zma) return null;
        return {
          name: standalone?.file.name ?? `${model} impedance`,
          freq: zma.freq,
          magnitude: zma.magnitude,
          phaseDeg: zma.phase,
        };
      };
      const sizeInch = (role: BranchRole): number | undefined => {
        const raw = role === 'low' ? wooferSizeInch : role === 'mid' ? midSizeInch : '';
        const v = Number(raw);
        return raw !== '' && Number.isFinite(v) && v > 0 ? v : undefined;
      };
      const loadedFor = (role: BranchRole): Loaded | null =>
        role === 'low' ? woofer : role === 'mid' ? midDrv : tweeter;
      const anglesFor = (role: BranchRole): AngleEntry[] =>
        (role === 'low' ? angleSets?.woofer : role === 'mid' ? angleSets?.mid : angleSets?.tweeter) ?? [];

      /* A5a metadata the designer typed, per branch (F3b). Every field is
       * optional and '' reaches the engine as a MISSING KEY rather than a
       * zero — the manual window in particular must be absent, not empty, or
       * a blank field would look like a stated window of length nothing. */
      const stated = (raw: string): number | undefined => {
        if (raw.trim() === '') return undefined;
        const v = Number(raw);
        return Number.isFinite(v) ? v : undefined;
      };
      const manualWindowFor = (role: BranchRole) => {
        const m = v2Meas[role];
        const ref = stated(m.refTimeMs);
        const right = stated(m.rightWindowMs);
        const floor = stated(m.floorHz);
        if (ref === undefined && right === undefined && floor === undefined) return undefined;
        return {
          ...(ref !== undefined ? { referenceTimeMs: ref } : {}),
          ...(right !== undefined ? { rightWindowMs: right } : {}),
          ...(floor !== undefined && floor > 0 ? { validityFloorHz: floor } : {}),
          ...(m.windowNote.trim() !== '' ? { note: m.windowNote.trim() } : {}),
        };
      };

      const roles: BranchRole[] = threeWay ? ['low', 'mid', 'high'] : ['low', 'high'];
      const branches: AdapterBranch[] = [];
      for (const role of roles) {
        const loaded = loadedFor(role);
        const nf = parseStored(nearField[role]?.cone ?? null);
        const z = zFor(role);
        if (!loaded && !z && !nf) continue;
        const re = stated(v2Meas[role].reOhm);
        const mw = manualWindowFor(role);
        /* V49 — the DRIVER CARD: Sd and Xmax from the Setup tab (driver facts
         * the app already holds), Bl and M_ms from the v2 measurement block,
         * the parallel count from the cabinet form. Every field absent stays
         * absent; a card with nothing on it is not sent at all. */
        const xmax = stated(xmaxMm[role]);
        const sd = stated(sdCm2[role]);
        const bl = stated(v2Meas[role].blTm);
        const mms = stated(v2Meas[role].mmsG);
        const count = Number(cabinet.drivers[role]?.count ?? '');
        const card = {
          ...(xmax !== undefined && xmax > 0 ? { xMaxMm: xmax } : {}),
          ...(sd !== undefined && sd > 0 ? { sdCm2: sd } : {}),
          ...(bl !== undefined && bl > 0 ? { blTm: bl } : {}),
          ...(mms !== undefined && mms > 0 ? { mmsG: mms } : {}),
          ...(Number.isFinite(count) && count > 1 ? { parallelCount: count } : {}),
          source: 'Setup tab (Sd, Xmax) and the Engine v2 measurement block (Bl, M_ms)',
        };
        const driveV = stated(v2Meas[role].driveVoltageV);
        const micMm = Number(cabinet.micDistanceMm);
        branches.push({
          role,
          onAxis: loaded ? asResponse(loaded.name, loaded.frd) : null,
          offAxis: anglesFor(role).map((a) => ({ hor: a.hor, response: asResponse(a.name, a.frd) })),
          nearField: nf ? [nf] : [],
          impedance: z,
          diameterInch: sizeInch(role),
          ...(re !== undefined && re > 0 ? { measuredReOhm: re } : {}),
          ...(mw ? { manualWindow: mw } : {}),
          ...(Object.keys(card).length > 1 ? { driverCard: card } : {}),
          /* V50 — the stated M-C figure for this way, re-keyed to the driver
           * id by the adapter like R_e and the card. */
          ...(driveOnFsMaxDbByRole[role] !== undefined ? { driveOnFsMaxDb: driveOnFsMaxDbByRole[role] } : {}),
          /* V51 — the way's wiring: the count from the cabinet form, the two
           * wirings from the measurement block. Only complete statements
           * travel; a half-stated wiring is absent. */
          ...((): { wiring?: WayWiring } => {
            const meas = v2Meas[role].wiringMeasured;
            const want = v2Meas[role].wiringDesired;
            const ok = (v: string): v is 'parallel' | 'series' => v === 'parallel' || v === 'series';
            if (!ok(meas) || !ok(want)) return {};
            const n = Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1;
            return { wiring: { count: n, measured: meas, desired: want, source: 'cabinet form (count) and the Engine v2 measurement block (wiring)' } };
          })(),
          /* A5e.3 — the coil family of this way, re-keyed to the driver id by
           * the adapter like the wiring. Empty = not stated. */
          ...(v2Meas[role].coilFamily.trim() !== '' ? { coilFamily: v2Meas[role].coilFamily.trim() } : {}),
          ...(driveV !== undefined && driveV > 0 && Number.isFinite(micMm) && micMm > 0
            ? {
                responseDrive: {
                  driveVoltageV: driveV,
                  micDistanceMm: micMm,
                  source: 'Engine v2 measurement block (drive voltage) and the cabinet form (mic distance)',
                },
              }
            : {}),
        });
      }
      if (branches.length === 0) return null;

      let filter: { name: string; netlist: Netlist } | null = null;
      if (net && net.parts.length > 0) {
        try {
          const { netlist } = crossoverToNetlist({ name: net.name, parts: [...net.parts] } as VxpCrossover);
          filter = { name: net.name, netlist };
        } catch {
          filter = null;
        }
      }

      const mm = (v: string | undefined): number | undefined => {
        if (!v) return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      /* The ACOUSTIC CENTRE, when the designer entered one, otherwise the
       * baffle position the cabinet form already holds. Those are the same
       * number on a flush-mounted driver and different ones on a pod or a
       * waveguide, and M-F-final wants the first. */
      const centreMm = (role: BranchRole): number | undefined =>
        stated(v2Meas[role].zMm) ?? mm(cabinet.drivers[role]?.yMm);
      /* How many radiators the branch has, from the cabinet form. Absent or
       * unparseable = absent, never a default of one: a way whose count was
       * never entered is a way whose count is unknown (P4). */
      const countOf = (role: BranchRole): number | undefined => {
        const n = Number(cabinet.drivers[role]?.count ?? '');
        return Number.isFinite(n) && n >= 1 ? n : undefined;
      };
      const symOf = (role: BranchRole): boolean | undefined =>
        v2Meas[role].rotSym === 'yes' ? true : v2Meas[role].rotSym === 'no' ? false : undefined;
      const symmetric: Partial<Record<BranchRole, boolean>> = {};
      for (const role of roles) {
        const v = symOf(role);
        if (v !== undefined) symmetric[role] = v;
      }
      const geometry = {
        verticalMm: {
          low: centreMm('low'),
          mid: centreMm('mid'),
          high: centreMm('high'),
        },
        rotationallySymmetric: symmetric,
        arraySpacingMm: {
          low: Number(cabinet.drivers.low?.count ?? '') > 1 ? mm(cabinet.drivers.low?.spacingMm) : undefined,
          mid: Number(cabinet.drivers.mid?.count ?? '') > 1 ? mm(cabinet.drivers.mid?.spacingMm) : undefined,
          high: Number(cabinet.drivers.high?.count ?? '') > 1 ? mm(cabinet.drivers.high?.spacingMm) : undefined,
        },
        /* V20: the same cabinet field the spacing comes from, passed on as a
         * COUNT. Without it the adapter cannot turn a spacing into positions,
         * and the lobing fractions fall back to one source per way. */
        sourceCount: {
          low: countOf('low'),
          mid: countOf('mid'),
          high: countOf('high'),
        },
        baffleWidthMm: mm(cabinet.baffleWidthMm),
      };

      // The assumed acoustic order per handover, from the slope settings the
      // project already carries: order = slope / 6 dB per octave. 'auto' means
      // the designer has not chosen, so the window drops its f_s floor and
      // says so rather than assuming one.
      const orderFrom = (a: string, b: string): number | undefined => {
        const vals = [a, b].filter((x) => x !== 'auto').map(Number).filter((x) => Number.isFinite(x) && x > 0);
        if (vals.length === 0) return undefined;
        return Math.max(1, Math.min(4, Math.round(Math.max(...vals) / 6)));
      };
      const ids = resolveDriverIds(branches, filter?.netlist ?? null).ids;
      const orderByPair: Record<string, number> = {};
      if (threeWay) {
        const lowOrder = orderFrom(acSlopeWoofer, acSlopeMidHp);
        if (lowOrder !== undefined) orderByPair[ctcKey(ids.low ?? 'low', ids.mid ?? 'mid')] = lowOrder;
      }
      const highOrder = orderFrom(acSlopeMid, acSlopeTweeter);
      if (highOrder !== undefined) {
        orderByPair[ctcKey(threeWay ? ids.mid ?? 'mid' : ids.low ?? 'low', ids.high ?? 'high')] = highOrder;
      }

      const angles = engineV2Settings.verticalWindowDeg
        .split(/[,;\s]+/)
        .map(Number)
        .filter((v) => Number.isFinite(v));
      const power = Number(engineV2Settings.amplifierPowerW);
      /* The parsed limits, from the ONE memo above. The plain |Z| floor is not
       * duplicated into it: that is the amplifier rating the project already
       * carries, and one number in two places is how the two come to
       * disagree. `runSeed`/`runBudgetEvals` belong to the RUN, not to the
       * report, so they are dropped here rather than rendered as limits. */
      const {
        runSeed: _seed,
        runBudgetEvals: _evals,
        // The taste requirements belong to the SHORTLIST, not to the report:
        // the panel shows what a design measures, and a requirement judges a
        // FIELD of designs. Passing them here would put an acceptance limit on
        // a panel that has no field to apply it to.
        splWindowPlusMinusDb: _win,
        maxPhaseTrackingDeg: _phase,
        shortlistSize: _n,
        ...limits
      } = engineV2Gates;
      void _seed;
      void _evals;
      void _win;
      void _phase;
      void _n;
      const gateAndBudget = {
        ...limits,
        ...(ampMinLoadOhm !== null ? { ampMinLoadOhm } : {}),
      };

      const built = buildEngineV2Input({
        sessionId: xoName || t('unnamed session'),
        branches,
        filter,
        geometry,
        settings: {
          ...(angles.length > 0 ? { verticalWindowDeg: angles } : {}),
          ...(engineV2Settings.amplifierPowerW !== '' && Number.isFinite(power) && power > 0
            ? { amplifierPowerW: power }
            : {}),
          ...(Object.keys(orderByPair).length > 0 ? { orderByPair } : {}),
          /* A5e.2/V45 — the design's voicing, so the panel judges its window
           * and its RMS against the same curve the scan searches against, and
           * so A5d.4(a) can take the anchor AFTER baffle step. One expression,
           * every reader (`activeTargetCurve`). */
          targetCurve: activeTargetCurve,
          ...Object.fromEntries(
            Object.entries(gateAndBudget).filter(([, v]) => v !== undefined),
          ),
          /* A5e.3 — the loaded catalogue's coil fits, so a stated family per
           * way can be resolved to a DCR model in the report. Only when some
           * way states one: without a family there is nothing to resolve. */
          ...(coilDcrFits.length > 0 ? { coilDcrFits } : {}),
        },
      });
      return {
        report: buildReport(built.input),
        ambiguous: built.ambiguous,
        error: null as string | null,
        /* F4b — the driver ids the report labels its rows with, per ROLE.
         * Three vocabularies meet here: storage speaks roles, the report speaks
         * the netlist's model names, and the worker speaks the canonical model
         * names its `driverZ` is keyed by. Carrying the map out of the memo is
         * what lets `factsForWorker` translate between the last two without
         * anything guessing. */
        driverIds: built.driverIds,
      };
    } catch (e) {
      return {
        report: null,
        ambiguous: null,
        error: (e as Error).message,
        driverIds: {} as Partial<Record<BranchRole, string>>,
      };
    }
  }, [
    engineSelection,
    woofer,
    midDrv,
    tweeter,
    threeWay,
    angleSets,
    nearField,
    zStandalone,
    impedances,
    cabinet,
    midSizeInch,
    wooferSizeInch,
    acSlopeMid,
    acSlopeTweeter,
    acSlopeWoofer,
    acSlopeMidHp,
    engineV2Settings,
    engineV2Gates,
    ampMinLoadOhm,
    xoName,
    v2Meas,
    activeTargetCurve,
  ]);

  /** The panel's report: the function above, applied to the design on screen. */
  const engineV2Report = useMemo(() => {
    const active = designs.find((d) => d.id === activeDesignId);
    return buildV2Report(active ? { name: active.name, parts: active.parts } : null);
  }, [buildV2Report, designs, activeDesignId]);

  /**
   * 3-way pins for the design chain (freq ± margin per handover).
   *
   * F4b — WHERE A PIN COMES FROM WHEN THE FIELD DOES NOT SAY.
   *
   * The designer's typed value always wins; this is only about the case where
   * a field holds nothing usable. On the v1 route that falls back to
   * `V1_PIN_DEFAULTS_LEGACY`, which is where it has always fallen back and
   * where it must keep falling back — the toggle invariant is a claim about
   * v1 behaviour, not an aspiration.
   *
   * On the v2 route it does NOT. Audit §7: those literals are project numbers
   * that steer a design without being derived or stated, and the low one puts
   * the range 147 Hz below the measurement-validity floor the same app
   * computes. So the v2 route falls back to the A5d.3 window through the F3c
   * recommended band — the number the reporting layer already derived from the
   * measurements — and where there is no window it produces NO PIN and says
   * so. A silent 400 Hz is the failure this replaces.
   *
   * Reads `v2Recommended`, which is declared further down the component body;
   * every call site of this function runs after that declaration.
   */
  const xoPinsValue = (): {
    low?: { freq: number; margin: number };
    high?: { freq: number; margin: number };
    /** What was substituted, or refused, and why. Empty on the ordinary path. */
    notes: string[];
  } => {
    if (!xoRangeOn) return { notes: [] };
    const notes: string[] = [];
    const useV2Pins = engineSelection.optimizer === 'v2';

    /** The recommended band as a pin, or null when no window could be derived. */
    const fromWindow = (side: 'low' | 'high'): { freq: number; margin: number } | null => {
      const rec = v2Recommended(side);
      const seg = rec?.effectiveHz[0] ?? null;
      if (!seg || !(seg[1] > seg[0])) return null;
      return { freq: (seg[0] + seg[1]) / 2, margin: (seg[1] - seg[0]) / 2 };
    };

    const pinFor = (
      side: 'low' | 'high',
      freqField: string,
      marginField: string,
      legacyFreq: string,
      legacyMargin: string,
    ): { freq: number; margin: number } | undefined => {
      const f = num(freqField, NaN);
      const m = num(marginField, NaN);
      if (Number.isFinite(f) && f > 0 && Number.isFinite(m)) return { freq: f, margin: m };
      if (!useV2Pins) {
        return { freq: num(freqField, Number(legacyFreq)), margin: num(marginField, Number(legacyMargin)) };
      }
      const derived = fromWindow(side);
      if (derived) {
        notes.push(
          `${side === 'low' ? 'Lower' : 'Upper'} handover: no range stated, so the pin comes from ` +
            `the A5d.3 window (${Math.round(derived.freq - derived.margin)}–` +
            `${Math.round(derived.freq + derived.margin)} Hz) rather than from a v1 default.`,
        );
        return derived;
      }
      notes.push(
        `${side === 'low' ? 'Lower' : 'Upper'} handover: no range stated and no A5d.3 window could ` +
          'be derived, so this handover is NOT pinned. The v1 default is deliberately not used ' +
          'here — it is a frequency from another project (audit §7).',
      );
      return undefined;
    };

    const low = pinFor(
      'low',
      xoLowFreqHz,
      xoLowMarginHz,
      V1_PIN_DEFAULTS_LEGACY.lowFreqHz,
      V1_PIN_DEFAULTS_LEGACY.lowMarginHz,
    );
    const high = pinFor(
      'high',
      xoFreqHz,
      xoMarginHz,
      V1_PIN_DEFAULTS_LEGACY.highFreqHz,
      V1_PIN_DEFAULTS_LEGACY.highMarginHz,
    );
    return {
      ...(low ? { low } : {}),
      ...(high ? { high } : {}),
      notes,
    };
  };

  /** Designer's crossover point as [lo, hi] for the optimizers: centre ±
   *  margin; a (near-)zero margin still leaves ±2% so the search stays
   *  non-degenerate ("exactly there"). Pins the ACOUSTIC crossing. */
  const xoRangeValue = (): [number, number] | undefined => {
    if (!xoRangeOn) return undefined;
    // Same legacy fallbacks as the 3-way pin, and for the same reason: this is
    // the TWO-WAY route, which is still v1 in full (TODO(F2c) in `facade.ts`).
    // The v2 pin derivation lives in `xoPinsValue`; when the two-way route is
    // wired to v2 this one follows it there.
    const f = num(xoFreqHz, Number(V1_PIN_DEFAULTS_LEGACY.highFreqHz));
    const m = Math.max(num(xoMarginHz, Number(V1_PIN_DEFAULTS_LEGACY.highMarginHz)), f * 0.02);
    return [f - m, f + m];
  };


  /** Single-driver mode: exactly one measurement loaded. The sim runs on that
   *  branch alone (silent ghost in the other slot); everything inherently
   *  two-driver — relative phase, integration, timing, the crossover
   *  optimizers — hides or disables. 'woofer' | 'tweeter' names the solo slot. */
  const soloDriver = woofer && !tweeter ? 'woofer' : tweeter && !woofer ? 'tweeter' : null;

  /**
   * The wizard's steps for THIS design, as a list — the progress dots, the
   * "Step x of y" line and both nav buttons all read from it. Solo drops the
   * Crossover step (nothing to cross), and it used to be skipped with index
   * arithmetic while the header still counted to four: a solo user walked
   * three steps and was told "Step 3 of 4", with the skipped dot filled in.
   * A list also makes the N-way growth a one-line change (a 3-way design
   * needs a second crossover step) instead of another off-by-one.
   * `id` stays the number the content blocks below switch on.
   */
  const wizardSteps = useMemo(
    () =>
      [
        // The facts the optimizer's physics windows run on (mic distance,
        // front, reference height, driver positions, Sd/Xmax, chamber). The
        // wizard used to jump from the files straight to Goals and skip them
        // (Sanders: "maar de kast en de driver specs dan?").
        { id: 5, label: 'Cabinet & drivers' },
        { id: 1, label: 'Goals' },
        // Solo has nothing to cross; 3-way derives its 2D candidates from the
        // measured pair crossings (the Crossover step is 2-way vocabulary).
        ...(soloDriver || threeWay ? [] : [{ id: 2, label: 'Crossover' }]),
        { id: 3, label: 'Components' },
        { id: 4, label: 'Review & run' },
      ] as const,
    [soloDriver, threeWay],
  );
  /** Where we are in that list; −1 is the "load measurements" gate (step 0). */
  const wizardPos = wizardSteps.findIndex((s) => s.id === wizardStep);
  // A driver added or removed while the wizard is open changes the step list
  // under it. Without this the solo run would land on the Crossover step it is
  // supposed to skip, and the header would read the gate copy.
  useEffect(() => {
    if (wizardStep > 0 && wizardPos < 0) setWizardStep(wizardSteps[0].id);
  }, [wizardStep, wizardPos, wizardSteps]);

  /**
   * Everything the entered geometry lets us SAY, in one place.
   *
   * The rule that keeps this from becoming a form nobody fills in: each field
   * has to change a number the app shows. Positions give centre-to-centre and
   * the true measurement angles; distance gives the far-field verdict; the
   * enclosure gives the acoustic order the box already provides. Nothing here
   * touches measured data — it bounds windows, cross-checks and warns.
   */
  const cabinetInfo = useMemo(() => {
    const micMm = Number(cabinet.micDistanceMm);
    const micElev = Number(cabinet.micElevationDeg) || 0;
    /**
     * The chosen reference driver IS the origin, so its offset is 0,0 — here,
     * not just in the form. Hiding its inputs while still READING whatever was
     * typed before the choice was made is the same silent-mismatch bug this
     * project keeps hunting: Sander picked "the tweeter" and the app went on
     * placing it at the -50 he had entered a minute earlier, which put it on
     * the bottom edge of the baffle in the drawing and in every edge- and
     * spacing-derived number.
     */
    const placeOf = (role: BranchRole) =>
      cabinet.refDriver === role
        ? // The reference driver IS the origin — but only of x and y. Where
          // the mic was aimed says nothing about how far behind the baffle
          // plane its acoustic centre sits, nor which way it radiates, so
          // those stay its own (a hard-coded 0 here silently dropped a depth
          // the designer had typed).
          {
            xMm: 0,
            yMm: 0,
            depthMm: Number(cabinet.drivers[role].depthMm) || 0,
            facing: cabinet.drivers[role].facing ?? 'front',
            tiltDeg: Number(cabinet.drivers[role].tiltDeg) || 0,
          }
        : placementOf(cabinet.drivers[role]);
    const place = {
      low: placeOf('low'),
      mid: placeOf('mid'),
      high: placeOf('high'),
    };
    const angleListOf = (role: BranchRole): number[] => {
      const set =
        role === 'low' ? angleSets?.woofer : role === 'mid' ? angleSets?.mid : angleSets?.tweeter;
      return set ? [...new Set(set.map((a) => a.hor))].sort((a, b) => a - b) : [];
    };
    /** What a nominal sweep REALLY captured for this driver. Null unless both
     *  a position and a mic distance are known. */
    const trueAngles = (role: BranchRole) => {
      const p = place[role];
      if (!p || !(micMm > 0)) return null;
      const list = angleListOf(role);
      if (list.length === 0) return null;
      return list.map((nominal) => ({
        nominal,
        actual: trueOffAxisDeg(p, micMm, nominal, micElev),
        // An opposed pair has no single answer, and averaging would be a
        // fiction — report both, or nothing.
        opposed: opposedAnglesDeg(p, micMm, nominal, micElev),
        levelDb: rotationLevelOffsetDb(p, micMm, nominal, micElev),
      }));
    };
    const diaOf = (role: BranchRole) => pistonDiameterMm(Number(sdCm2[role]));
    const biggestDriverMm = Math.max(
      ...(['low', 'mid', 'high'] as BranchRole[]).map((r) => diaOf(r) ?? 0),
    );
    const baffleW = Number(cabinet.baffleWidthMm);
    const farField = farFieldVerdict(micMm, {
      driverDiameterMm: biggestDriverMm,
      baffleWidthMm: baffleW > 0 ? baffleW : undefined,
    });
    // How low the measurement can honestly claim to reach. A stated gate wins
    // over the predicted floor bounce — the operator knows what window was used.
    const predicted = floorBounceGate(micMm, Number(cabinet.refHeightMm), micElev);
    /* A3h: the FILES know their own window, and when they agree that beats
     * anything typed into this form — the ledger describes the measurements,
     * so it should read them. The typed field is the fallback, and it is only
     * a claim about the rig; it no longer feeds any validity band. */
    const fileGates = [woofer, midDrv, tweeter]
      .map((x) => (x ? readGateHeader(x.raw) : null))
      .filter((g): g is Extract<GateHeaderResult, { kind: 'parsed' }> => g?.kind === 'parsed')
      .map((g) => g.gateMs);
    const agreed =
      fileGates.length > 0 && Math.max(...fileGates) - Math.min(...fileGates) < 0.01 * Math.max(...fileGates)
        ? fileGates[0]
        : null;
    const statedHz = gateLimitHz(agreed ?? Number(cabinet.gateMs));
    const reliable =
      statedHz !== null
        ? { fromHz: statedHz, gateMs: agreed ?? Number(cabinet.gateMs), stated: true, fromFiles: agreed !== null }
        : predicted
          ? { fromHz: predicted.fromHz, gateMs: predicted.gateMs, stated: false, fromFiles: false }
          : null;
    const ctc = (a: BranchRole, b: BranchRole) =>
      place[a] && place[b] ? centreToCentreMm(place[a]!, place[b]!) : null;
    const boxDepth = Number(cabinet.cabinetDepthMm);
    const baffle =
      baffleW > 0 && Number(cabinet.baffleHeightMm) > 0
        ? {
            widthMm: baffleW,
            heightMm: Number(cabinet.baffleHeightMm),
            depthMm: boxDepth > 0 ? boxDepth : undefined,
            refFromTopMm: Number(cabinet.refFromTopMm) || 0,
          }
        : null;
    /** Any driver that is not on the front changes what several of these
     *  numbers even MEAN — the readouts say so rather than quietly answering
     *  a different question. */
    const offBaffle = (['low', 'mid', 'high'] as BranchRole[]).filter(
      (r) => (place[r]?.facing ?? 'front') !== 'front',
    );
    return {
      place,
      trueAngles,
      diaOf,
      farField,
      /** Adjacent-pair spacing. In 2-way the single pair is low↔high. */
      ctcLow: threeWay ? ctc('low', 'mid') : ctc('low', 'high'),
      ctcHigh: threeWay ? ctc('mid', 'high') : null,
      /** The AXIS each pair lobes in (dx/dy of the separation) — feeds the
       *  auto lobing strictness: horizontal separation nulls sweep across the
       *  seats (strict), vertical goes to floor/ceiling (Dickason). */
      ctcLowVec: (() => {
        const [a2, b2] = threeWay ? (['low', 'mid'] as const) : (['low', 'high'] as const);
        return place[a2] && place[b2]
          ? { dxMm: place[b2]!.xMm - place[a2]!.xMm, dyMm: place[b2]!.yMm - place[a2]!.yMm }
          : null;
      })(),
      ctcHighVec:
        threeWay && place.mid && place.high
          ? { dxMm: place.high.xMm - place.mid.xMm, dyMm: place.high.yMm - place.mid.yMm }
          : null,
      reliable,
      baffleStep: baffleStepHz(baffleW),
      offBaffle,
      /** Baffle step for the panel THIS driver radiates from. A side-firing
       *  woofer's baffle is the side panel, so its width is the cabinet depth
       *  — on the narrow cabinets that use side woofers that is a factor of
       *  two, which makes the front baffle's number simply the wrong one. */
      baffleStepOf: (role: BranchRole) => {
        const p = place[role];
        if (!p || !(baffleW > 0)) return null;
        const w = radiatingPanelWidthMm(p.facing, {
          widthMm: baffleW,
          heightMm: Number(cabinet.baffleHeightMm),
          depthMm: boxDepth > 0 ? boxDepth : undefined,
        });
        return w === null ? null : baffleStepHz(w);
      },
      edgeOf: (role: BranchRole) =>
        place[role] && baffle ? nearestEdgeMm(place[role]!, baffle) : null,
      listenAngle: listeningAngleDeg(
        Number(cabinet.refHeightMm),
        Number(cabinet.listenEarHeightMm),
        Number(cabinet.listenDistanceM),
      ),
      boxOf: (role: BranchRole) =>
        boxRolloff(
          cabinet.drivers[role].enclosure,
          Number(cabinet.drivers[role].fbHz) > 0 ? Number(cabinet.drivers[role].fbHz) : undefined,
        ),
      unloadOf: (role: BranchRole) => unloadingRisk(cabinet.drivers[role].enclosure),
    };
  }, [cabinet, sdCm2, angleSets, threeWay]);

  /** Where a MULTI-driver branch starts lobing on its own spacing. This is a
   *  different ceiling from cone beaming: two woofers 200 mm apart interfere
   *  vertically long before either cone becomes directional, and that is the
   *  quantitative reason a dual-woofer branch wants to hand over lower. Uses
   *  the same k the user picked for the driver-to-driver rule. */
  const arrayLobe = useMemo(() => {
    // Array axis follows the baffle: wider than tall (a centre) stacks its
    // drivers side by side — those nulls sweep ACROSS the seats, so auto is
    // strict there; a tower's vertical stack gets Dickason. Unknown baffle =
    // strict (auto may never be laxer than the old default when it cannot
    // know the axis).
    const w2 = Number(cabinet.baffleWidthMm);
    const h2 = Number(cabinet.baffleHeightMm);
    const horiz = w2 > 0 && h2 > 0 ? w2 > h2 : true;
    const kArr =
      ctcK === 'auto'
        ? lobingKFor(horiz ? 1 : 0, horiz ? 0 : 1)
        : Number(ctcK) > 0
          ? Number(ctcK)
          : 0.5;
    const out: Partial<Record<BranchRole, number | null>> = {};
    for (const role of ['low', 'mid', 'high'] as BranchRole[]) {
      const d = cabinet.drivers[role];
      out[role] = Number(d.count) > 1 ? lobingCeilingHz(Number(d.spacingMm), kArr) : null;
    }
    return out as Record<BranchRole, number | null>;
  }, [cabinet, ctcK]);

  /**
   * Near-field merge per branch: the driver's effective response, with its low
   * end taken from the near-field measurement where the gate can no longer
   * support the far field.
   *
   * Done HERE, at the source, so everything downstream — grid span, sim,
   * optimizer, charts, scores — sees one response and needs no knowledge of
   * where its low end came from. The merged FRD simply reaches lower.
   */
  const merged = useMemo(() => {
    const out: Partial<Record<BranchRole, { frd: Parsed; report: string; ok: boolean; spliceHz?: number }>> = {};
    const src: [BranchRole, Loaded | null][] = [
      ['low', woofer],
      ['mid', midDrv],
      ['high', tweeter],
    ];
    const micMm = Number(cabinet.micDistanceMm);
    for (const [role, loaded] of src) {
      const slot = nearField[role];
      if (!loaded || !slot.cone) continue;
      const sd = Number(sdCm2[role]);
      const nearMax = nearFieldMaxHz(sd);
      const scaleDb = nearToFarDb(sd, micMm);
      if (nearMax === null || scaleDb === null) {
        out[role] = {
          frd: loaded.frd,
          ok: false,
          report: 'needs Sd for this driver and the mic distance — without them the near field cannot be scaled',
        };
        continue;
      }
      let cone: Parsed;
      let port: Parsed | null = null;
      try {
        cone = parseFrd(slot.cone.raw);
        if (slot.port) port = parseFrd(slot.port.raw);
      } catch (err) {
        out[role] = { frd: loaded.frd, ok: false, report: String(err) };
        continue;
      }
      // One grid spanning the near field's low end up through the far field.
      const lo = Math.max(5, cone.freq[0]);
      const hi = Math.min(loaded.frd.freq[loaded.frd.freq.length - 1], 20000);
      if (!(hi > lo * 4)) {
        out[role] = { frd: loaded.frd, ok: false, report: 'near-field and far-field ranges barely overlap' };
        continue;
      }
      const g = logspace(lo, hi, GRID_N);
      const onGrid = (p: Parsed) => resample(p.freq, p.spl, p.phase, g, { clampEdges: true });
      const gc = onGrid(cone);
      const gf = onGrid(loaded.frd);
      // Keele's diameter-weighted COMPLEX sum of cone + port.
      let nearSpl = gc.spl;
      let nearPhase = gc.phaseDeg;
      const portDia = Number(slot.portDiaMm);
      if (port && portDia > 0) {
        const dia = (Math.sqrt((sd * 1e-4) / Math.PI) * 2 * 1000) || 1;
        const gp = onGrid(port);
        const summed = sumRadiators([
          { p: gc.spl.map((v, i) => fromPolar(10 ** (v / 20), (gc.phaseDeg[i] * Math.PI) / 180)), diameterMm: dia },
          { p: gp.spl.map((v, i) => fromPolar(10 ** (v / 20), (gp.phaseDeg[i] * Math.PI) / 180)), diameterMm: portDia },
        ]);
        if (summed) {
          nearSpl = summed.map((c) => 20 * Math.log10(Math.hypot(c.re, c.im) || 1e-12));
          nearPhase = summed.map((c) => (Math.atan2(c.im, c.re) * 180) / Math.PI);
        }
      }
      // Half-space scaling to the far-field distance.
      nearSpl = nearSpl.map((v) => v + scaleDb);
      const farMin = cabinetInfo.reliable?.fromHz ?? null;
      /* PROPOSED SPLICE. Aim just under the near field's ka = 1 limit and
       * comfortably above the gate's own floor, because the useful overlap
       * between the two is narrow by nature.
       *
       * The floor used to be a flat 300 Hz (`Math.max(farMin * 1.3, 300)`).
       * Two reasons it moved to 500 (Sanders, aug 2026): below 500 Hz a gated
       * indoor far field is gate-limited, so a fit down there is fitting the
       * gate; and the baffle step sits at 380–440 Hz on this cabinet, which
       * would then land INSIDE the fit band — where it is exactly the
       * difference the diffraction step is supposed to account for, and would
       * be absorbed into the level instead.
       *
       * On the 3-way demo this changes nothing in practice: Sd 255 cm² puts
       * ka = 1 at 606 Hz, so the proposal was already 0.8 × 606 = 485 Hz, not
       * 300. The 300 only ever bound on drivers with a much lower ka limit. */
      const SPLICE_FLOOR_HZ = 500;
      const proposed =
        Number(slot.transitionHz) > 0
          ? Number(slot.transitionHz)
          : farMin !== null
            ? Math.min(nearMax * 0.8, Math.max(farMin * 1.3, SPLICE_FLOOR_HZ))
            : SPLICE_FLOOR_HZ;
      const check = checkTransition(proposed, nearMax, farMin);
      const m = mergeNearFar({
        freq: g,
        farSpl: gf.spl,
        farPhaseDeg: gf.phaseDeg,
        nearSpl,
        nearPhaseDeg: nearPhase,
        transitionHz: proposed,
        blendOctaves: Number(slot.blendOctaves) || 1,
        baffleStepHz: slot.stepOn ? (cabinetInfo.baffleStep ?? 0) : 0,
        baffleStepDepthDb: Number(slot.stepDepthDb) || 6,
      });
      if (!m) {
        out[role] = { frd: loaded.frd, ok: false, report: 'merge failed on this grid' };
        continue;
      }
      const bits = [
        `spliced at ${Math.round(proposed)} Hz`,
        `level ${m.levelDb >= 0 ? '+' : ''}${m.levelDb.toFixed(1)} dB`,
        `delay ${m.delayUs.toFixed(0)} µs`,
        `residual ${m.residualDeg.toFixed(1)}°`,
      ];
      if (Math.abs(Math.abs(m.offsetDeg) - 180) < 45) bits.push('⚠ near field looks INVERTED');
      if (m.residualDeg > 25) bits.push('⚠ the two halves disagree — check the splice frequency');
      if (!check.ok) bits.push(`⚠ ${check.note}`);
      out[role] = {
        ok: check.ok,
        report: bits.join(' · '),
        spliceHz: proposed,
        frd: { freq: [...g], spl: m.spl, phase: m.phaseDeg, hasPhase: true, meta: loaded.frd.meta },
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woofer, midDrv, tweeter, nearField, sdCm2, cabinet.micDistanceMm, cabinetInfo]);

  /**
   * WHAT EACH BRANCH'S RESPONSE IS, AND WHERE IT MAY BE BELIEVED (step B2).
   *
   * Derived, never stored: everything needed is already in the project, so
   * there is nothing to migrate and nothing that can go stale. Near-field bands
   * follow from Sd (always in the driver definition) and impedance is valid
   * throughout, so in practice the ONLY thing that can be missing is the gate
   * length of a gated far field — and that is the one source of 'unverified'.
   *
   * A derived flag also cannot quietly disappear when some other field is
   * edited: it clears exactly when the gate becomes known, which is the point.
   */
  const sourceMeta = useMemo(() => {
    const out: Partial<Record<BranchRole, { name: string; meta: SourceMeta }>> = {};
    const src: [BranchRole, Loaded | null][] = [
      ['low', woofer],
      ['mid', midDrv],
      ['high', tweeter],
    ];
    const topOf = (l: Loaded) => l.frd.freq[l.frd.freq.length - 1];
    for (const [role, l] of src) {
      if (!l) continue;
      const m = merged[role];
      if (m?.ok && m.spliceHz) {
        /* Spliced: the low end comes from the near field, which is valid well
         * below anything the gate could reach.
         *
         * THE RANGE TO MEASURE AGAINST IS THE MERGED RESPONSE, not the raw
         * far-field file. Found by the containment check on the 3-way demo: the
         * near field is honest from 15 Hz while the far-field FRD starts at
         * 20.5, so testing the band against the far-field file made a
         * legitimate band look like a contradiction — and would have LENGTHENED
         * the ghost past its own data, which is the one direction that must
         * never happen.
         *
         * Clamped at construction rather than checked afterwards: a band that
         * cannot leave its data is better than one that is caught leaving it
         * (same reasoning as the single pistonRadiusM). */
        const near = nearFieldValidity(Number(sdCm2[role]));
        const mf = m.frd.freq;
        const mergedLo = mf[0];
        const mergedHi = mf[mf.length - 1];
        /* A near-field branch gets NO gate floor: at ~5 mm the direct sound is
         * tens of dB above anything the room returns, so 2/T does not describe
         * this measurement. `nearFieldMergedValidity` has no gate parameter at
         * all, so that cannot be wired in later by accident; a window stated in
         * the near-field header is reported as ignored instead of used. */
        const nfCone = nearField[role]?.cone;
        const nfGate = nfCone ? gateMsFromHeader(nfCone.raw) : null;
        const nfv = nearFieldMergedValidity({
          spliceHz: m.spliceHz,
          fromHz: Math.max(near?.fromHz ?? NEARFIELD_MERGED_FLOOR_HZ, mergedLo),
          toHz: Math.min(topOf(l), mergedHi),
          ignoredGateMs: nfGate,
        });
        out[role] = {
          name: role,
          meta: {
            dataSource: 'nearfield-merged',
            validity: nfv.validity,
            derivation: m.report,
            verified: true,
            ...(nfv.notes.length > 0 ? { notes: nfv.notes } : {}),
          },
        };
        continue;
      }
      /* The file's own header wins over the cabinet's single global field —
       * and it can finally be read: ARTA writes "Right window = 5,021 ms,
       * Tukey 0.25", never the word "gate". Ten of Sanders far-field exports
       * stated their window and were read as stating nothing, so a 4.5 ms
       * typed into the cabinet stood in for a measured 5.021 and put the
       * evaluation band 53 Hz too high. The header names the TAPER too, so
       * stop assuming that as well. */
      /* A3h — A GLOBAL FIELD MAY NOT STAND IN FOR A FILE'S OWN PROPERTY.
       * The window belongs to the sweep, not to the project: Sanders 4.5 ms
       * was the mid gate from a first session at 935 mm, and it silently
       * became the floor for two branches measured at 1 m with a 5.021 ms
       * window. So the file wins when it states one, and when it does not the
       * app ASKS instead of substituting something reasonable. */
      const gr = readGateHeader(l.raw);
      if (gr.kind !== 'parsed') {
        out[role] = {
          name: role,
          meta: {
            dataSource: 'gated-farfield',
            validity: { fromHz: null, toHz: topOf(l), reason: 'gate length unknown' },
            verified: false,
            unverifiedReason:
              gr.kind === 'unparseable'
                ? `${role}: the window in "${l.name}" could not be read — ${gr.why}. The line is: ` +
                  `"${gr.line}". This is an import problem, not a property of your measurement; ` +
                  `send me this header and it can be read.`
                : `${role}: "${l.name}" states no measurement window, so there is no way to know ` +
                  `how low it is honest. Re-export it with the window in the header (ARTA writes ` +
                  `"Right window = … ms" by itself), or measure ground plane, where the question ` +
                  `does not arise.`,
          },
        };
        continue;
      }
      const gateMs = gr.gateMs;
      const gateAlpha = gr.alpha ?? DEFAULT_GATE_TAPER_ALPHA;
      const band = gatedFarFieldValidity(gateMs, topOf(l), gateAlpha)!;
      out[role] = {
        name: role,
        meta: { dataSource: 'gated-farfield', validity: band, verified: true },
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woofer, midDrv, tweeter, merged, sdCm2, nearField]);

  /** Sources that cannot be judged — they display, but they may not be fitted on. */
  const unverifiedSources = useMemo(
    () => Object.values(sourceMeta).filter((v) => v && v.meta.verified === false),
    [sourceMeta],
  );

  /**
   * The band a run may be judged on: the intersection of every contributing
   * source's validity, narrowed by the view range — never the data's extent
   * (issue #14).
   */
  const evalBand = useMemo(() => {
    const list = Object.values(sourceMeta).filter(
      (v): v is { name: string; meta: SourceMeta } => !!v,
    );
    if (list.length === 0) return null;
    const req: [number, number] | undefined =
      num(fMinDeb, 0) > 0 && num(fMaxDeb, 0) > 0 ? [num(fMinDeb, 200), num(fMaxDeb, 20000)] : undefined;
    return intersectValidity(list, req);
  }, [sourceMeta, fMinDeb, fMaxDeb]);
  useEffect(() => {
    evalBandRef.current = evalBand ? { fromHz: evalBand.fromHz, toHz: evalBand.toHz } : null;
  }, [evalBand]);

  /** A branch as the rest of the app should see it: merged when a near-field
   *  splice is configured and worked, untouched otherwise. */
  const effective = (l: Loaded | null, role: BranchRole): Loaded | null =>
    l && merged[role]?.ok ? { ...l, frd: merged[role]!.frd } : l;

  /**
   * The measure→listen re-timing, as extra offset in MM per branch (the unit
   * BranchAdjust speaks). Only meaningful with measured phase: minimum-phase
   * mode has already thrown the arrival times away, and the offset knob is
   * carrying the excess-Δ there.
   */
  const seatShiftRaw = useMemo(() => {
    const R = Number(cabinet.micDistanceMm);
    const L = Number(cabinet.listenDistanceM) * 1000;
    if (!(R > 0) || !(L > 0)) return null;
    const us = listeningDelayShiftUs(
      { low: cabinetInfo.place.low, mid: cabinetInfo.place.mid, high: cabinetInfo.place.high },
      R,
      L,
      Number(cabinet.micElevationDeg) || 0,
    );
    if (!us) return null;
    const mm = (v: number) => (v / 1e6) * C_AIR_MM_S;
    return { low: mm(us.low ?? 0), mid: mm(us.mid ?? 0), high: mm(us.high ?? 0), us };
    // Computed WHENEVER the geometry is known — the verdict below needs it even
    // when the correction itself is switched off, because the useful question
    // is "is my measuring distance good enough", not "how do I patch it".
  }, [cabinet, cabinetInfo]);

  /** Applied only on request, and only where arrival times still exist. */
  const seatShiftMm = useMemo(
    () => (seatTiming && phaseMode === 'measured' ? seatShiftRaw : null),
    [seatTiming, phaseMode, seatShiftRaw],
  );

  /**
   * THE branch adjustments — one definition, used by the simulation and by
   * every engine that runs on it. Seat re-timing (seatShiftMm) is folded in
   * here rather than at each call site: a simulation that shows the listening
   * position while the optimizers design for the microphone is exactly the
   * "two consumers, two definitions" split this codebase keeps paying for.
   * Relative to the LOW branch, which is the reference `combine` sums against.
   */
  const branchAdj = useMemo(() => {
    const relHigh = seatShiftMm ? seatShiftMm.high - seatShiftMm.low : 0;
    const relMid = seatShiftMm ? seatShiftMm.mid - seatShiftMm.low : 0;
    return {
      tweeter: {
        offsetMm: num(offsetMm, 0) + relHigh,
        trimDb: num(trimDb, 0),
        inverted,
      },
      mid: {
        offsetMm: num(midOffsetMm, 0) + relMid,
        trimDb: num(midTrimDb, 0),
        inverted: midInverted,
      },
    };
  }, [seatShiftMm, offsetMm, trimDb, inverted, midOffsetMm, midTrimDb, midInverted]);

  /**
   * UI-2 — CAN THE DRAWING BE SIMULATED, AND IF NOT, WHY NOT.
   *
   * One answer for three readers: the sim memo (solve or refuse), the Network
   * tab (print it under the editor) and the status badges (score nothing on a
   * network that was not simulated). Computed on the DRAWING, before anything
   * is solved, from the same part list every mutation replaces — so a wire
   * that connects nothing, a driver with no path to the generator or a deleted
   * generator is named the moment it happens, instead of the sim silently
   * falling back to the raw drivers (what happened until UI-2).
   */
  const readiness: NetworkReadiness | null = useMemo(
    () => (schematic ? assessNetwork(schematic.parts, Object.keys(impedances)) : null),
    [schematic, impedances],
  );

  const simRaw = useMemo(() => {
    // Single-driver mode: ONE loaded measurement is enough (validation flow:
    // measure a lone driver, rebuild the physical network in the editor,
    // compare sim vs measurement). The missing slot gets a silent ghost
    // branch so combine() and every downstream consumer keep their
    // two-branch shape; the UI hides the ghost's curves and scores.
    if (!woofer && !tweeter) return null;
    // Near-field-merged where configured: the branch's low end then comes from
    // a measurement the gate can actually support.
    const wIn = effective(woofer, 'low');
    const tIn = effective(tweeter, 'high');
    // 3-way: the mid branch joins the grid only when both outer branches are
    // loaded; a mid without them is IGNORED (banner explains) so the 2-way and
    // solo paths stay bit-identical to before the mid slot existed.
    const midIn = threeWay ? effective(midDrv, 'mid') : null;
    const present = [wIn, midIn, tIn].filter((d): d is Loaded => d !== null);
    // Grid span: 2-way keeps the historical INTERSECTION of the measured
    // ranges (bit-compat). 3-way spans the UNION (trede 4b, per-branch
    // bands): Robbert's tweeter FRD starts at 640 Hz, and an intersection
    // grid would hide the woofer-mid handover (~300-600 Hz) entirely. A
    // branch outside its own measured range counts as SILENT below — the
    // honest floor: the sum then carries only real contributions, and the
    // tuner's driver-protection guard still watches the ELECTRICAL drive
    // there, which is what actually endangers a tweeter.
    const lo = threeWay
      ? Math.max(num(fMinDeb, 200), Math.min(...present.map((d) => d.frd.freq[0])))
      : Math.max(num(fMinDeb, 200), ...present.map((d) => d.frd.freq[0]));
    const hi = threeWay
      ? Math.min(
          num(fMaxDeb, 20000),
          Math.max(...present.map((d) => d.frd.freq[d.frd.freq.length - 1])),
        )
      : Math.min(
          num(fMaxDeb, 20000),
          ...present.map((d) => d.frd.freq[d.frd.freq.length - 1]),
        );
    if (!(hi > lo)) return null;
    const grid = logspace(lo, hi, GRID_N);
    const silent = () => ({
      freq: grid,
      spl: grid.map(() => SILENT_GHOST_DB),
      phaseDeg: grid.map(() => 0),
    });
    /** Resample onto the grid; outside the driver's own measured range the
     *  branch is the silent ghost (3-way only — 2-way grids never extend
     *  past a measurement by construction). */
    const banded = (l: Loaded): GriddedResponse => {
      const f0 = l.frd.freq[0];
      const f1 = l.frd.freq[l.frd.freq.length - 1];
      const g = resample(l.frd.freq, l.frd.spl, l.frd.phase, grid, { clampEdges: true });
      return {
        freq: grid,
        spl: g.spl.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? SILENT_GHOST_DB : v)),
        phaseDeg: g.phaseDeg.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? 0 : v)),
      };
    };
    const toGrid = (l: Loaded): GriddedResponse =>
      threeWay ? banded(l) : resample(l.frd.freq, l.frd.spl, l.frd.phase, grid);
    let w = wIn ? toGrid(wIn) : silent();
    let t = tIn ? toGrid(tIn) : silent();
    let m = midIn ? toGrid(midIn) : null;

    // VituixCAD-style comparison mode: throw away the measured phase and
    // reconstruct minimum phase from magnitude (drivers then sum with zero
    // inter-driver time offset — exactly what MinimumPhase=True does).
    if (phaseMode === 'minimum') {
      w = { ...w, phaseDeg: minimumPhaseDeg(grid, w.spl) };
      t = { ...t, phaseDeg: minimumPhaseDeg(grid, t.spl) };
      if (m) m = { ...m, phaseDeg: minimumPhaseDeg(grid, m.spl) };
    }
    // Raw gridded responses (phase convention applied, nothing else) — the
    // starting point for the compare-overlay of other design tabs.
    const base = { w, m, t };

    // Apply the selected passive crossover: solve the network on the measured
    // impedances, then fold each driver's voltage transfer into its response.
    let transfers: {
      woofer: Complex[] | null;
      mid?: Complex[] | null;
      tweeter: Complex[] | null;
    } | null = null;
    let systemZ: Complex[] | null = null;
    let xoError: string | null = null;
    const xo =
      project && xoName !== 'none'
        ? project.vxp.crossovers.find((c) => c.name === xoName)
        : undefined;
    // The editable schematic (when switched on) replaces the vxp variant.
    const useEditor = networkActive && schematic !== null;
    /* UI-2 — THE EDITOR NETWORK IS SOLVED OR REFUSED, NEVER SILENTLY REPLACED.
     *
     * Until UI-2 a solver throw on the editor network set `xoError` and let the
     * RAW drivers through as the sum — every chart and badge then described
     * a design that was not on screen, and the one line that said so lived on
     * the Setup tab. Now `readiness` decides before the solve: a refused drawing
     * produces no network at all and the memo says why; the display layer keeps
     * the previous simulated state on screen, marked as such. The vxp-variant
     * path (`xo`) is untouched and still reports through `xoError`. */
    let refused: Extract<NetworkReadiness, { kind: 'refused' }> | null = null;
    if (useEditor) {
      if (!readiness) {
        refused = { kind: 'refused', cause: 'empty', describe: 'Nothing to simulate: the network holds no components.', defects: [] };
      } else if (readiness.kind === 'refused') {
        refused = readiness;
      }
    }
    const refuse = (why: string) => {
      refused = { kind: 'refused', cause: 'malformed', describe: `Not simulable: ${why}`, defects: readiness?.defects ?? [] };
    };
    if ((useEditor && !refused) || (!useEditor && xo && Object.keys(impedances).length > 0)) {
      try {
        const netlist =
          useEditor && readiness && readiness.kind === 'simulable'
            ? readiness.netlist
            : crossoverToNetlist(xo!).netlist;
        const zOnGrid = Object.fromEntries(
          Object.entries(impedances).map(([model, z]) => {
            return [model, resampleImpedance(z.freq, z.magnitude, z.phase, grid).z];
          }),
        );
        const sol = solveNetwork(netlist, grid, zOnGrid);
        // Map by SLOT, not a hard-coded model name — an imported vxp names its
        // drivers freely (e.g. "Woofer 12w8524" / "Tweeter r2604"), so matching
        // literal "mid"/"tweeter" silently applied NO filter and summed the raw
        // drivers (crossover looked like it landed way too high).
        if (useEditor && sol.inputZ.some((c) => !Number.isFinite(c.re) || !Number.isFinite(c.im))) {
          refuse('the solver produced non-finite values for this network.');
        } else if (m) {
          const { hW, hM, hT, ambiguous } = slotTransfersN(sol);
          if (ambiguous) {
            if (useEditor) refuse(ambiguous);
            else xoError = ambiguous;
          } else {
            if (hW) w = applyTransfer(w, hW);
            if (hM) m = applyTransfer(m, hM);
            if (hT) t = applyTransfer(t, hT);
            transfers = { woofer: hW, mid: hM, tweeter: hT };
            systemZ = sol.inputZ;
          }
        } else {
          const { hW, hT } = slotTransfers(sol);
          if (hW) w = applyTransfer(w, hW);
          if (hT) t = applyTransfer(t, hT);
          transfers = { woofer: hW, tweeter: hT };
          systemZ = sol.inputZ;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (useEditor) refuse(msg);
        else xoError = msg;
      }
    }

    // Virtual (target) filters stack on top of whatever passive network runs —
    // unless bypassed (auto-on when a synthesised passive replaces them, else
    // that same filtering would apply twice).
    const stack = (prev: Complex[] | null, extra: Complex[]): Complex[] =>
      prev ? prev.map((c, i) => cMul(c, extra[i])) : extra;
    if (!vfBypass && isActive(vFilters.woofer)) {
      const h = evalDriverFilter(vFilters.woofer, grid);
      w = applyTransfer(w, h);
      transfers = { ...(transfers ?? { woofer: null, tweeter: null }), woofer: stack(transfers?.woofer ?? null, h) };
    }
    if (!vfBypass && m && isActive(vFilters.mid)) {
      const h = evalDriverFilter(vFilters.mid, grid);
      m = applyTransfer(m, h);
      transfers = { ...(transfers ?? { woofer: null, tweeter: null }), mid: stack(transfers?.mid ?? null, h) };
    }
    if (!vfBypass && isActive(vFilters.tweeter)) {
      const h = evalDriverFilter(vFilters.tweeter, grid);
      t = applyTransfer(t, h);
      transfers = { ...(transfers ?? { woofer: null, tweeter: null }), tweeter: stack(transfers?.tweeter ?? null, h) };
    }

    /* Seat re-timing (opt-in, see seatShiftMm): the oblique mic-to-driver path
     * shrinks with distance, so a sum aligned at the microphone is not aligned
     * at the listening seat. Applied RELATIVE TO THE LOW branch, because that
     * is the reference `combine` already sums against — an overall delay is
     * inaudible, only the differences are. Positive offsetMm = arrives later. */
    const tAdj = branchAdj.tweeter;
    if (m) {
      // 3-way sum via the N-way core. The result keeps the 2-way CombineResult
      // SHAPE (woofer = low branch, tweeter = adjusted high branch) so every
      // combined-curve consumer keeps working; the mid branch rides alongside.
      const mAdj = branchAdj.mid;
      const n3 = combineN([
        { response: w },
        { response: m, adjust: mAdj },
        { response: t, adjust: tAdj },
      ]);
      // The null check keeps its 2-way meaning: same sum, tweeter flipped —
      // that nulls the M-T handover ONLY (at the W-M crossing the tweeter
      // contributes nothing). The W-M handover gets its OWN check with the
      // WOOFER flipped (Sanders: "woofer/mid zou deze ook moeten weergeven");
      // deliberately not the mid — the mid is shared between both pairs, so
      // flipping it would null both crossings at once and read ambiguous.
      const n3inv = combineN([
        { response: w },
        { response: m, adjust: mAdj },
        { response: t, adjust: { ...tAdj, inverted: !tAdj.inverted } },
      ]);
      const n3invLow = combineN([
        { response: w, adjust: { inverted: true } },
        { response: m, adjust: mAdj },
        { response: t, adjust: tAdj },
      ]);
      const wrap = (d: number) => {
        let v = d % 360;
        if (v > 180) v -= 360;
        if (v < -180) v += 360;
        return v;
      };
      const midB = n3.branches[1];
      const tB = n3.branches[2];
      return {
        combined: {
          freq: grid,
          woofer: w,
          tweeter: tB,
          combinedSpl: n3.combinedSpl,
          combinedPhaseDeg: n3.combinedPhaseDeg,
          invertedSpl: n3inv.combinedSpl,
          invertedLowSpl: n3invLow.combinedSpl,
          relativePhaseDeg: tB.phaseDeg.map((p, i) => wrap(p - w.phaseDeg[i])),
        },
        mid: midB,
        transfers,
        systemZ,
        xoError,
        refused,
        base,
      };
    }

    return {
      combined: combine(w, t, tAdj),
      mid: null,
      transfers,
      systemZ,
      xoError,
      refused,
      base,
    };
  }, [woofer, midDrv, threeWay, tweeter, project, impedances, xoName, vFilters, vfBypass, phaseMode, fMinDeb, fMaxDeb, offsetMm, trimDb, inverted, midOffsetMm, midTrimDb, midInverted, branchAdj, schematic, networkActive, readiness]);

  /**
   * UI-2 — WHAT THE CHARTS SHOW WHILE THE NETWORK CANNOT BE SIMULATED.
   *
   * A refused drawing produces no network. The charts then keep the LAST
   * simulated state — dimmed, tagged "previous state", and with the reason
   * printed on the Network tab and in the topbar — rather than a blank page
   * or, worse, the raw drivers scored as though they were the design. F0: no
   * verdict is not green, and a frozen chart says that it is frozen.
   *
   * The previous state is only reused while it describes the same drivers,
   * impedances and design tab; anything else and there IS no previous state,
   * and the memo's own raw-driver sum shows, tagged the same way.
   */
  const lastGoodSimRef = useRef<{
    sim: NonNullable<typeof simRaw>;
    woofer: typeof woofer;
    midDrv: typeof midDrv;
    tweeter: typeof tweeter;
    impedances: typeof impedances;
    designId: string | null;
  } | null>(null);
  useEffect(() => {
    if (simRaw && !simRaw.refused) {
      lastGoodSimRef.current = { sim: simRaw, woofer, midDrv, tweeter, impedances, designId: activeDesignId };
    }
  }, [simRaw, woofer, midDrv, tweeter, impedances, activeDesignId]);
  const simStale: { refusal: Extract<NetworkReadiness, { kind: 'refused' }>; showing: 'previous' | 'raw' } | null =
    useMemo(() => {
      if (!simRaw?.refused) return null;
      const prev = lastGoodSimRef.current;
      const reusable =
        prev !== null &&
        prev.woofer === woofer &&
        prev.midDrv === midDrv &&
        prev.tweeter === tweeter &&
        prev.impedances === impedances &&
        prev.designId === activeDesignId;
      return { refusal: simRaw.refused, showing: reusable ? 'previous' : 'raw' };
    }, [simRaw, woofer, midDrv, tweeter, impedances, activeDesignId]);
  const sim = simStale?.showing === 'previous' ? lastGoodSimRef.current!.sim : simRaw;
  const staleTag = simStale ? (
    <span
      className="stale-tag"
      title={`${simStale.refusal.describe}\n\n${
        simStale.showing === 'previous'
          ? t('These curves are the LAST network that could be simulated, not the one in the editor. Fix the network and they update.')
          : t('Nothing has been simulated yet for this network; these are the raw drivers. Fix the network and the curves appear.')
      }`}
    >
      ⚠ {simStale.showing === 'previous' ? t('previous state — network not simulated') : t('raw drivers — network not simulated')}
    </span>
  ) : null;
  const panelClass = simStale ? 'panel sim-stale' : 'panel';

  const result = sim?.combined ?? null;

  /**
   * What the guided route counts as "this step is done".
   *
   * Deliberately generous: a tick means "you have given me enough to work
   * with", not "this is perfect". The step stays open, the checks inside the
   * panel keep nagging about quality (timing, far field, gate). A tick that
   * demands perfection would just stop a beginner at step one.
   */
  const guidedDone = useMemo(() => {
    /* A tick answers "did this step's PURPOSE happen", not "was a field
       touched" (Sanders: ticks that come for free say nothing — the old
       criteria turned the whole route green on load, because `result` exists
       the moment measurements do). Still deliberately achievable: the step
       stays open and the checks inside keep nagging about quality. */
    const roles: BranchRole[] = ['low', 'mid', 'high'];
    const loaded: Record<BranchRole, boolean> = { low: !!woofer, mid: !!midDrv, high: !!tweeter };
    const zAliased = withSlotAliasesN(impedances);
    return {
      // Files: every loaded driver has BOTH a response and an impedance — the
      // route ends in a passive build, and without Z nothing can be built.
      files:
        !!(woofer || tweeter) &&
        roles.every((r) => !loaded[r] || !!zAliased[canonicalModelForRole(r, threeWay)]),
      // Cabinet: the numbers that anchor everything else — mic distance
      // (honest range, rig split), the front panel (drawing, edges, step)
      // and the height above the floor (floor bounce).
      cabinet:
        Number(cabinet.micDistanceMm) > 0 &&
        Number(cabinet.baffleWidthMm) > 0 &&
        Number(cabinet.baffleHeightMm) > 0 &&
        Number(cabinet.refHeightMm) > 0,
      // Drivers: every loaded driver has a position (the reference driver is
      // 0,0 by definition). Datasheet numbers stay optional — the card says
      // so — but geometry is what this step exists for.
      drivers:
        !!(woofer || tweeter) &&
        roles.every(
          (r) =>
            !loaded[r] ||
            cabinet.refDriver === r ||
            cabinet.drivers[r].xMm.trim() !== '' ||
            cabinet.drivers[r].yMm.trim() !== '',
        ),
      // Design: a network with real filter parts exists — a bare template
      // (generator + drivers) has not designed anything yet.
      design: designs.some(
        (d) => d.parts.filter((p) => /Inductor|Capacitor|Resistor/.test(p.type)).length > 0,
      ),
      // Build: the ACTIVE design is buyable — every part finds a catalog
      // value (single or stack). An unmatched value is the honest nag: that
      // shopping list cannot be ordered yet.
      build: (() => {
        const act = designs.find((d) => d.id === activeDesignId);
        if (!act || act.parts.length <= 2) return false;
        const rows = bomFor(act.parts).rows;
        return rows.length > 0 && rows.every((r) => r.match || r.stackMatch);
      })(),
    };
  }, [woofer, midDrv, tweeter, threeWay, impedances, cabinet, designs, activeDesignId]);


  /** Single-driver mode, floor control: the driver's own median level over the
   *  evaluation band, the level the engine would target by default, and — for
   *  the entered floor — how far a cut-only correction can then reach.
   *  Sanders' point: "floor at X → flat up to Y kHz" is the relationship the
   *  designer actually reasons about, so show it live. */
  const soloFloorInfo = useMemo(() => {
    if (!soloDriver || !sim || !result) return null;
    const d = soloDriver === 'woofer' ? sim.base.w : sim.base.t;
    const freqs = result.freq;
    const band: [number, number] = [
      freqs[0] * 1.02,
      Math.min(freqs[freqs.length - 1] * 0.975, num(fMax, 20000)),
    ];
    const vals = freqs
      .map((f, i) => (f >= band[0] && f <= band[1] ? d.spl[i] : null))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (vals.length < 8) return null;
    const median = vals[Math.floor(vals.length / 2)];
    const entered = soloFloorDb.trim() === '' ? null : Number(soloFloorDb);
    const floor = entered !== null && Number.isFinite(entered) ? entered : Math.round(median - 10);
    const reach = reachableBandFor(freqs, d.spl, band, floor);
    return { median, floor, suggested: Math.round(median - 10), reach };
  }, [soloDriver, sim, result, fMax, soloFloorDb]);


  const timing = useMemo(() => {
    if (!woofer || !tweeter) return null;
    const band = (frd: Parsed): [number, number] => [
      Math.max(500, frd.freq[0]),
      Math.min(5000, frd.freq[frd.freq.length - 1]),
    ];
    try {
      const w = estimateBulkDelay(woofer.frd.freq, woofer.frd.phase, band(woofer.frd));
      const t = estimateBulkDelay(tweeter.frd.freq, tweeter.frd.phase, band(tweeter.frd));
      return { w, t, ref: assessSharedReference(w, t) };
    } catch {
      return null;
    }
  }, [woofer, tweeter]);

  /* THREE-WAY time-base check, per ADJACENT pair, on EXCESS phase.
   * The 2-way check compares woofer↔tweeter over a fixed 500–5000 Hz band on
   * RAW phase; in a 3-way those two barely overlap (the mid carries the
   * middle) and raw phase absorbs each driver's own rolloff rotation, so it
   * reports "unreliable" even when the files share a clock. Measured on
   * Robbert's set: raw phase gave the mid 304 µs (200–800) vs 8 µs (5–8k) —
   * one driver, two travel times — while EXCESS phase gives −21 µs with
   * R² = 1.000 in every sub-band, and M-T Δ ≈ 33 µs (11 mm), plain baffle
   * geometry. Reproducibility across bands IS the fingerprint of a shared
   * clock; an independent time base yields an arbitrary offset. */
  const timing3 = useMemo(() => {
    if (!threeWay || !woofer || !midDrv || !tweeter) return null;
    /** Excess-phase bulk-delay fit of one driver over [lo, hi]. */
    const fit = (frd: Parsed, lo: number, hi: number) => {
      // Grid top clamped to the file (an ARTA export ends at 19 999.5 Hz and
      // resample refuses to extrapolate — same trap as excessDelayMsOf).
      const top = Math.min(20000, frd.freq[frd.freq.length - 1]);
      const g = resample(frd.freq, frd.spl, frd.phase, logspace(frd.freq[0] * 1.05, top, 400));
      const mp = minimumPhaseDeg(g.freq, g.spl);
      const excess = g.phaseDeg.map((p, i) => p - mp[i]);
      return estimateBulkDelay(g.freq, excess, [lo, hi]);
    };
    /** A driver's own PASSBAND: within 10 dB of its upper-quartile level.
     *  File extent is useless here — these FRDs run from 5 Hz, and fitting a
     *  delay through a region with no output is what produced R² = 0.101. */
    const playBand = (frd: Parsed): [number, number] | null => {
      const sorted = [...frd.spl].sort((x, y) => x - y);
      const ref = sorted[Math.floor(sorted.length * 0.75)] - 10;
      let lo = -1;
      let hi = -1;
      for (let i = 0; i < frd.freq.length; i++) {
        if (frd.spl[i] >= ref) {
          if (lo < 0) lo = i;
          hi = i;
        }
      }
      return lo >= 0 && hi > lo ? [frd.freq[lo], frd.freq[hi]] : null;
    };
    /** Fit band of one pair: the overlap of both passbands, clamped to the
     *  region where an excess-phase fit is meaningful — the minimum-phase
     *  reconstruction is FFT-based and its outermost octaves are edge effect,
     *  not driver behaviour. */
    const pairBand = (a: Parsed, b: Parsed): [number, number] | null => {
      const pa = playBand(a);
      const pb = playBand(b);
      if (!pa || !pb) return null;
      const lo = Math.max(pa[0], pb[0], 200) * 1.2;
      const hi = Math.min(pa[1], pb[1], 10000) * 0.85;
      return hi > lo * 2 ? [lo, hi] : null;
    };
    const one = (
      lower: Parsed,
      upper: Parsed,
      names: { lower: string; upper: string },
    ) => {
      const band = pairBand(lower, upper);
      if (!band) return null;
      try {
        /* Search the WIDEST clean sub-band rather than trusting one guess.
         * A delay is band-independent by definition, so the honest question
         * is "where is the phase delay-like for BOTH?" — near a driver's own
         * rolloff knee it never is (Robbert's tweeter: R² 0.68 from 768 Hz,
         * 0.95 from 3 kHz). Trimming the low edge in fixed steps keeps this
         * deterministic, and the verdict reports the band it settled on. */
        let bestPair: ReturnType<typeof assessPairTimeBase> | null = null;
        let bestWorstR2 = -1;
        for (const k of [1, 1.5, 2.5, 4]) {
          const lo = band[0] * k;
          if (band[1] <= lo * 2) break;
          const sub: [number, number] = [lo, band[1]];
          const l = fit(lower, sub[0], sub[1]);
          const u = fit(upper, sub[0], sub[1]);
          const res = assessPairTimeBase({ lower: l, upper: u, band: sub, names });
          const worstR2 = Math.min(l.rSquared, u.rSquared);
          if (worstR2 > bestWorstR2) {
            bestWorstR2 = worstR2;
            bestPair = res;
          }
          if (res.verdict !== 'unreliable') return res;
        }
        return bestPair;
      } catch {
        return null;
      }
    };
    return {
      low: one(woofer.frd, midDrv.frd, { lower: 'woofer', upper: 'mid' }),
      high: one(midDrv.frd, tweeter.frd, { lower: 'mid', upper: 'tweeter' }),
    };
  }, [threeWay, woofer, midDrv, tweeter]);

  /** Excess-phase bridge Δ (tweeter − woofer, µs): the value a minimum-phase
   *  consumer (VituixCAD, our export) needs to reproduce the measured relative
   *  phase. Positive = tweeter later. Distinct from timing.ref.deltaUs (raw). */
  const excessBridge = useMemo(() => {
    if (!woofer || !tweeter) return null;
    const w = excessDelayMsOf(woofer.frd);
    const t = excessDelayMsOf(tweeter.frd);
    return w !== null && t !== null ? { deltaUs: (t - w) * 1000 } : null;
  }, [woofer, tweeter]);

  /**
   * How much of the MEASURED inter-driver delay is the measuring rig?
   *
   * Sanders question, and it needed the position fields to be answerable: an
   * arrival time is total path ÷ c, and that path is the driver's acoustic
   * centre PLUS the plain oblique distance from a mic at finite range to a
   * driver at a different height. The first is a driver property; the second
   * belongs to the tripod and shrinks as you step back. Reporting the sum as
   * "the tweeter sits 17 mm proud" quietly credits the rig for part of it.
   */
  const delayGeometry = useMemo(() => {
    const R = Number(cabinet.micDistanceMm);
    if (!(R > 0)) return null;
    const elev = Number(cabinet.micElevationDeg) || 0;
    const geo = (role: BranchRole) => {
      const pl = cabinetInfo.place[role];
      return pl ? pathBreakdownMm(pl, R, elev) : null;
    };
    const pairOf = (lo: BranchRole, hi: BranchRole) => {
      const a2 = geo(lo);
      const b2 = geo(hi);
      if (a2 === null || b2 === null) return null;
      // Same sign convention as the timing panel: upper driver later = +.
      // Split three ways, because only the remainder is a DRIVER property:
      // the rig share shrinks if you step back, and the mounting share is
      // already explained by where the cabinet puts the cone. Charging a
      // side-firing woofer's half-cabinet depth to its acoustic centre is
      // what makes an ordinary speaker trip the timing check.
      const mm = b2.totalMm - a2.totalMm;
      const rigMm = b2.rigMm - a2.rigMm;
      const mountMm = b2.mountingMm - a2.mountingMm;
      return {
        mm,
        us: (mm / C_AIR_MM_S) * 1e6,
        rigMm,
        rigUs: (rigMm / C_AIR_MM_S) * 1e6,
        mountMm,
        mountUs: (mountMm / C_AIR_MM_S) * 1e6,
      };
    };
    return {
      distanceMm: R,
      pair: threeWay ? pairOf('mid', 'high') : pairOf('low', 'high'),
      lowMid: threeWay ? pairOf('low', 'mid') : null,
      /** Roles that radiate from another panel — their share of a measured
       *  delay is geometry the app can name instead of blaming the driver. */
      offBaffle: cabinetInfo.offBaffle,
    };
  }, [cabinet, threeWay, cabinetInfo]);

  /**
   * MEASURED mounting depth per driver, mm — the inverse of the split above,
   * and the answer to "you already know where the mid is, so work out how deep
   * the tweeter sits yourself".
   *
   * An arrival time is rig + mounting + acoustic centre. The rig share follows
   * from the positions and the mic distance, and the last two together are
   * exactly what `depthMm` means (how far the acoustic centre sits behind the
   * baffle plane). So subtract the rig from the measured excess delay and what
   * is left IS the depth — no ruler involved, and better than one, because a
   * ruler cannot find an acoustic centre.
   *
   * RELATIVE by nature: a delay measurement only ever gives differences, so the
   * shallowest driver is 0 and the rest are behind it. That is also all the
   * physics needs.
   *
   * Excess phase, not raw: the raw bulk fit absorbs each driver's own
   * minimum-phase slope and on KOAN even has the opposite sign.
   */
  const measuredDepth = useMemo(() => {
    const R = Number(cabinet.micDistanceMm);
    // Trust gate: the time base must be shared. In 3-way that is the
    // per-pair EXCESS-phase verdict (timing3) — the raw woofer↔tweeter check
    // is the documented false alarm there, and gating on it hid the measured
    // depth on every 3-way set (Sanders: "ik zie nergens de z offset").
    const timeBaseOk = threeWay
      ? !!timing3 &&
        [timing3.low, timing3.high].some((p) => p !== null) &&
        [timing3.low, timing3.high].every((p) => p === null || p.verdict === 'plausible')
      : !!timing && timing.ref.verdict === 'plausible';
    if (!(R > 0) || !timing || !timeBaseOk) return null;
    const elev = Number(cabinet.micElevationDeg) || 0;
    const roles: BranchRole[] = threeWay ? ['low', 'mid', 'high'] : ['low', 'high'];
    const src: Record<BranchRole, Parsed | null> = {
      low: woofer?.frd ?? null,
      mid: midDrv?.frd ?? null,
      high: tweeter?.frd ?? null,
    };
    // Measured arrival path per driver, and the share the tripod explains.
    const arrival: Partial<Record<BranchRole, number>> = {};
    const rig: Partial<Record<BranchRole, number>> = {};
    let weakFit: BranchRole | null = null;
    for (const r of roles) {
      const frd = src[r];
      const pl = cabinetInfo.place[r];
      if (!frd || !pl) return null;
      // In-band fit: a delay is only a delay where the driver plays. For a
      // branch of several drivers, also stay below the frequency where the
      // units start to interfere at the microphone (their paths differ by
      // Δ = |d(y+s/2) − d(y−s/2)|; first null at c/(2Δ)) — above it the pair's
      // excess phase is comb structure, not arrival time. Vertical stacking
      // is assumed (a horizontal pair on the reference axis has Δ ≈ 0 and the
      // cap vanishes by itself).
      const cnt = Number(cabinet.drivers[r].count) || 1;
      const sp = Number(cabinet.drivers[r].spacingMm) || 0;
      let cap = Infinity;
      if (cnt >= 2 && sp > 0) {
        const dUp = Math.hypot(R, pl.yMm + sp / 2, pl.xMm);
        const dDn = Math.hypot(R, pl.yMm - sp / 2, pl.xMm);
        const dPath = Math.abs(dUp - dDn);
        if (dPath > 1) cap = 0.7 * (C_AIR_MM_S / (2 * dPath));
      }
      const fit = excessDelayInBand(frd, cap);
      const geo = pathBreakdownMm(pl, R, elev);
      if (fit === null || geo === null) return null;
      if (fit.rSquared < 0.98 && weakFit === null) weakFit = r;
      arrival[r] = fit.delayMs * 1e-3 * C_AIR_MM_S;
      rig[r] = geo.rigMm;
    }
    // A delay measurement carries one unknown constant (electronic latency),
    // so depths are only ever RELATIVE. Pin it by putting the shallowest
    // driver on the baffle: that is the one with the least path left over
    // once its own rig share is removed.
    const leftover = roles.map((r) => arrival[r]! - rig[r]!);
    const k = Math.min(...leftover);
    const depths: Partial<Record<BranchRole, number>> = {};
    const unexplained: BranchRole[] = [];
    for (const r of roles) {
      // SOLVE, don't subtract: the depth contributes less than its own length
      // at close range, so subtracting would read 150 mm as 133.
      // By construction k ≤ arrival − rig for every driver, so the target can
      // never be below this driver's own rig share — but `a - (a - b)` is not
      // bit-exactly `b`, and one ulp under the boundary would raise a
      // contradiction warning on a perfectly sound set. Clamp on the identity,
      // not as a fudge.
      const target = Math.max(rig[r]!, arrival[r]! - k);
      const d = depthForExcessMm(cabinetInfo.place[r]!, R, target, elev);
      // No depth explains this arrival: the tripod's own share already
      // accounts for MORE delay than was measured, which would put the cone
      // in front of the baffle. A real contradiction between the typed
      // position and the measurement — say so instead of vanishing.
      if (d === null) unexplained.push(r);
      else depths[r] = d;
    }
    const solved = Object.values(depths) as number[];
    // Worth acting on? Under a millimetre is noise in a phase fit.
    const spread = solved.length > 0 ? Math.max(...solved) : 0;
    // Which driver the others are counted from — named, so a readout can say
    // "12.2 mm behind the tweeter" instead of leaving a bare 0 to interpret.
    const shallowest = (Object.keys(depths) as BranchRole[]).reduce(
      (best, r) => (depths[r]! < depths[best]! ? r : best),
      (Object.keys(depths) as BranchRole[])[0],
    );
    // Plausibility: a dome tweeter is normally the SHALLOWEST driver (a
    // cone's acoustic centre sits at the voice coil, centimetres back). A
    // woofer reading shallower than the tweeter by more than a centimetre
    // is far more often a rig error than a fact — the woofer's typed
    // position, the mic distance, or a mic that was re-aimed for the woofer
    // sweep (Sanders: "ik kan me niet voorstellen dat de mid 34,6 mm achter
    // de woofer zit"). Say so instead of presenting the anchor as truth.
    const suspicious =
      depths.high !== undefined &&
      shallowest === 'low' &&
      depths.high - depths.low! > 10;
    return { depths, spread, unexplained, shallowest, suspicious, weakFit };
  }, [cabinet, timing, timing3, threeWay, woofer, midDrv, tweeter, cabinetInfo]);

  /**
   * Auto phase convention: freshly loaded measurements that pass the shared-
   * time-reference check carry real inter-driver timing — design on it.
   * Runs on every new measurement pair (manual load, demo, vxp), so a
   * plausible verdict overrides the vxp loader's Minimum default; Minimum
   * stays only where measured timing can't be trusted (or by manual choice).
   * Skipped once after a project/autosave restore: the saved choice wins.
   */
  const phaseAutoSkip = useRef(false);
  useEffect(() => {
    const skip = phaseAutoSkip.current;
    phaseAutoSkip.current = false;
    if (skip || !timing) return;
    if (timing.ref.verdict === 'plausible') setPhaseMode('measured');
  }, [timing]);

  /**
   * Auto-fill the tweeter offset per phase convention (stays editable — the
   * fill happens only when the convention or the measurements change):
   * measured phase carries the real timing IN the phase, so the knob belongs
   * at 0; minimum phase throws that timing away, so the knob must carry the
   * EXCESS-phase Δ (measured − minimum phase) — the raw bulk-delay Δ is
   * contaminated by the drivers' minimum-phase slopes and on KOAN even has
   * the opposite sign (+16.2 mm raw vs −17.2 mm excess). Falls back to the
   * raw Δ when the excess fit is unavailable. Skipped on project restore.
   */
  const offsetAutoSkip = useRef(false);
  useEffect(() => {
    const skip = offsetAutoSkip.current;
    offsetAutoSkip.current = false;
    if (skip || !timing || timing.ref.verdict !== 'plausible') return;
    const bridgeMm = excessBridge ? excessBridge.deltaUs * 0.343 : timing.ref.deltaMm;
    setOffsetMm(phaseMode === 'minimum' ? bridgeMm.toFixed(1) : '0');
  }, [phaseMode, timing, excessBridge]);

  // 3-way: the crossing score is a PAIR property (low-mid, mid-high) — the
  // 2-way woofer↔tweeter overlap is meaningless there, so `integration` stays
  // null and `pairScores` carries the two ADJACENT pairs instead (trede 4b).
  const integration = useMemo(
    () => (result && !threeWay ? computeIntegration(result) : null),
    [result, threeWay],
  );

  /* Free-axis physics windows for the 3-way scan, derived from MEASUREMENTS
   * (Sanders: "het doel is dat de optimizer dit verzint"): floor = 2×Fs AND
   * where the upper driver reaches its own level; ceiling = the lower
   * driver's measured beaming onset from the loaded angle sets (size-formula
   * fallback). What the designer read off the charts by hand, the scan now
   * derives itself — measured on Robbert: W-M [353…631], M-T [1310…7000
   * (mid beams at 8022)], exactly the hand-derived advice. Also carries the
   * banded angle sets that arm the in-room weight. */
  /**
   * A5d.3's FEASIBLE WINDOWS, mapped onto the scan dialog's two handovers.
   *
   * `predesign.windows` is one entry per ADJACENT PAIR in low-to-high order —
   * N-way, nothing counts to three. The dialog names two of them on a 3-way
   * ("low" = W-M, "high" = M-T) and one on a 2-way, so the mapping is by
   * position and the last pair is always the one the "high" fields control.
   *
   * Null with the toggle off. That is not laziness: this is v2 reporting, and
   * with the engine off the dialog must be what it always was, to the pixel.
   */
  const v2Windows = useMemo((): { low: XoWindowResult | null; high: XoWindowResult | null } | null => {
    if (!engineSelection.reporting) return null;
    const ws = engineV2Report?.report?.predesign.windows ?? [];
    if (ws.length === 0) return null;
    return threeWay
      ? { low: ws[0] ?? null, high: ws[1] ?? null }
      : { low: null, high: ws[ws.length - 1] ?? null };
  }, [engineSelection.reporting, engineV2Report, threeWay]);

  /** The search range the designer stated for one handover, or null if unpinned. */
  const v2RangeFor = (side: 'low' | 'high'): [number, number] | null => {
    if (!xoRangeOn) return null;
    if (side === 'low') {
      if (!threeWay) return null;
      const f = num(xoLowFreqHz, 0);
      const m = num(xoLowMarginHz, 0);
      return f > 0 ? [f - m, f + m] : null;
    }
    const f = num(xoFreqHz, 0);
    const m = num(xoMarginHz, 0);
    return f > 0 ? [f - m, f + m] : null;
  };

  const v2PairLabel = (side: 'low' | 'high'): string => {
    const w = v2Windows?.[side];
    if (w) return `${w.lower} → ${w.upper}`;
    return side === 'low' ? 'W-M' : threeWay ? 'M-T' : 'crossover';
  };

  /** One handover's verdict against its window. Null with the toggle off. */
  const v2Advice = (side: 'low' | 'high'): RangeAdvice | null => {
    const w = v2Windows?.[side];
    if (!w) return null;
    return rangeAgainstWindow(v2RangeFor(side), w, v2PairLabel(side));
  };

  /**
   * The annotation's input, or NULL when the reporting layer is off.
   *
   * Null and empty are different states and only the first renders nothing:
   * `v2Windows` null means the engine is off, while a project with fewer than
   * two loaded branches is on and simply has no adjacent pair yet.
   */
  /**
   * The recommended band for one handover (F3c, deliverable 1).
   *
   * Derived from the SAME window object the annotation draws, so the window
   * and the band it is carved out of can never describe different windows.
   * Null with the toggle off, by the same guard as everything else here.
   */
  const v2Recommended = (side: 'low' | 'high'): RecommendedBandResult | null => {
    const w = v2Windows?.[side];
    if (!w) return null;
    return recommendedBand(w);
  };

  const v2WindowPairs: XoWindowPair[] | null = !v2Windows
    ? null
    : (['low', 'high'] as const).flatMap((side) => {
        const window = v2Windows[side];
        const advice = v2Advice(side);
        const recommended = v2Recommended(side);
        return window && advice && recommended
          ? [{ key: side, window, advice, recommended }]
          : [];
      });


  /**
   * Take the feasible window over as the search range (F3b, deliverable 2).
   *
   * An ORDINARY FIELD CHANGE and nothing more: it writes the two numbers the
   * designer would have typed, and they stay editable afterwards. Nothing
   * clamps during the run, before it or after it — the app makes the
   * disagreement visible and then does exactly what it was told.
   */
  const takeOverV2Window = (side: 'low' | 'high') => {
    const t = v2Advice(side)?.takeover;
    if (!t) return;
    if (side === 'low') {
      setXoLowFreqHz(String(t.freqHz));
      setXoLowMarginHz(String(t.marginHz));
    } else {
      setXoFreqHz(String(t.freqHz));
      setXoMarginHz(String(t.marginHz));
    }
  };

  /**
   * Take one recommended SEGMENT over as the search range (F3c, deliverable 2).
   *
   * The same ordinary field change the window take-over is, and it writes the
   * band the annotation printed: `effectiveHz` is the segments, or the whole
   * window on the fallback, so index 0 is always something real.
   */
  const takeOverV2Recommended = (side: 'low' | 'high', segment: number) => {
    const band = v2Recommended(side)?.effectiveHz[segment];
    if (!band) return;
    const tk = takeoverFor(band);
    if (side === 'low') {
      setXoLowFreqHz(String(tk.freqHz));
      setXoLowMarginHz(String(tk.marginHz));
    } else {
      setXoFreqHz(String(tk.freqHz));
      setXoMarginHz(String(tk.marginHz));
    }
  };

  /**
   * The pre-start estimate (F3b, deliverable 3), when one is pending.
   *
   * Held as state rather than computed in the dialog because it is counted on
   * the ACTUAL candidate list the scan built — a second, reactive construction
   * of the same grid would be a second opinion about what is about to run, and
   * the two would eventually disagree.
   */
  const [v2PreStart, setV2PreStart] = useState<{ message: string; proceed: () => void } | null>(null);

  const physWin3 = useMemo(() => {
    if (!threeWay || !sim?.mid || !result || !sim.base.m) return null;
    const grid = result.freq;
    const ad = angleResponsesOn(grid);
    const angleSets =
      ad?.mid && ad.mid.length > 0
        ? { woofer: ad.woofer, mid: ad.mid, tweeter: ad.tweeter }
        : undefined;

    // --- upper limits of the LOWER driver of each pair ---------------------
    // Beaming, MEASURED, at the chosen ka tier (see KA_TIERS).
    const kaThr = KA_TIERS[kaTier].diff30Db;
    const wBeam = angleSets ? beamingCeilingHz(angleSets.woofer, kaThr) : null;
    const mBeam = angleSets ? beamingCeilingHz(angleSets.mid, kaThr) : null;
    // Lobing from centre-to-centre spacing — geometry, no measurement. The
    // strictness k resolves PER PAIR when set to auto: the axis of the
    // separation decides which published anchor applies (lobingKFor — a
    // centre's side-by-side woofers stay strict, a stacked mid/tweeter gets
    // Dickason). Sanders' question, verbatim: "de engine ziet toch dat de
    // woofers naast elkaar liggen?"
    const kOf = (vec: { dxMm: number; dyMm: number } | null): number =>
      ctcK === 'auto'
        ? vec
          ? lobingKFor(vec.dxMm, vec.dyMm)
          : 0.5
        : Number(ctcK) > 0
          ? Number(ctcK)
          : 0.5;
    const wLobe = lobingCeilingHz(cabinetInfo.ctcLow ?? 0, kOf(cabinetInfo.ctcLowVec));
    const mLobe = lobingCeilingHz(cabinetInfo.ctcHigh ?? 0, kOf(cabinetInfo.ctcHighVec));
    const zMagOf = (role: BranchRole): number[] | undefined => {
      try {
        const z = zGridWithSlots(impedances, grid)[canonicalModelForRole(role, threeWay)];
        return z ? z.map((c) => Math.hypot(c.re, c.im)) : undefined;
      } catch {
        return undefined;
      }
    };
    const breakOf = (role: BranchRole, spl: readonly number[]) => {
      if (!breakupLimitOn) return null;
      const reach = reachesLevelHz(grid, spl);
      return breakupHz(grid, spl, {
        zMag: zMagOf(role),
        searchFromHz: Math.max(300, (reach ?? 0) * 2),
      });
    };
    const wBreak = breakOf('low', sim.base.w.spl);
    const mBreak = breakOf('mid', sim.base.m.spl);

    // --- lower limits of the UPPER driver of each pair ---------------------
    const spl = Number(excursionSpl);
    const exOf = (role: BranchRole) =>
      Number.isFinite(spl)
        ? excursionFloorHz(Number(sdCm2[role]), Number(xmaxMm[role]), spl, {
            count: Number(cabinet.drivers[role].count) || 1,
          })
        : null;
    const midEx = exOf('mid');
    const twtEx = exOf('high');

    // A branch built from SEVERAL drivers lobes on its OWN spacing too, and
    // that ceiling is independent of cone beaming: two woofers 205 mm apart
    // interfere vertically at 837 Hz however small each cone is. It belongs in
    // the window for the same reason the driver-to-driver spacing does.
    // Array strictness: same axis rule as arrayLobe — a centre's side-by-side
    // pair stays strict under auto, a tower's vertical stack gets Dickason.
    const wBaf = Number(cabinet.baffleWidthMm);
    const hBaf = Number(cabinet.baffleHeightMm);
    const horizArr = wBaf > 0 && hBaf > 0 ? wBaf > hBaf : true;
    const kArr2 =
      ctcK === 'auto'
        ? lobingKFor(horizArr ? 1 : 0, horizArr ? 0 : 1)
        : Number(ctcK) > 0
          ? Number(ctcK)
          : 0.5;
    const arrayOf = (role: BranchRole) =>
      Number(cabinet.drivers[role].count) > 1
        ? lobingCeilingHz(Number(cabinet.drivers[role].spacingMm), kArr2)
        : null;
    /* ---- The window is the INTERSECTION of every limiter (xoWindow.ts) ----
     * Rule 1 (data floor) from each branch's gate — the FRD header when the
     * exporter wrote one, else the cabinet's gate field — or its near-field
     * splice when the branch is spliced; the pair takes the least reliable of
     * its two branches. Rules 2–6 as measured/derived above; rule 7 (a pin)
     * replaces 2–6 but never 1. Every rule keeps its number for the readout. */
    const dataFloorOf = (role: BranchRole, l: Loaded | null): { hz: number | null; label: string } => {
      /* WHICH RULE APPLIES IS THE BRANCH'S dataSource, read from the one place
       * that decides it (sourceMeta) rather than re-derived here. Two sites
       * answering "is this branch spliced?" separately is how the same fact
       * ends up with two values — the family of bug A3g exists to close. */
      const src = sourceMeta[role]?.meta.dataSource;
      // A spliced branch carries its own low end from the near field, so the
      // gate no longer limits it — but a handover must not sit INSIDE the
      // splice blend, where the sum hangs on the merge's level and delay
      // fit. Its floor is the TOP of the blend: splice × 2^(blend/2)
      // (Sanders: "skip wat niet betrouwbaar is" — 300 Hz / 1 oct → 424 Hz).
      // NB this is a different number from the branch's VALIDITY floor (15 Hz):
      // where a response may be believed and where a crossover may sit are two
      // questions, and the merge is honest ground for the first, not the second.
      const sp = src === 'nearfield-merged' && merged[role]?.ok ? merged[role]!.spliceHz : undefined;
      if (sp !== undefined) {
        const blend = Number(nearField[role].blendOctaves) || 1;
        const hz = sp * Math.pow(2, blend / 2);
        return { hz, label: `above the near-field splice blend (${Math.round(sp)} Hz ± ${blend / 2} oct) = ${Math.round(hz)} Hz` };
      }
      // Gated far field, and ONLY here: 2/T is a statement about a window that
      // has to keep a room reflection out. The file's own header wins over the
      // cabinet's global field, and it names its taper — the effective
      // (coherent) duration sets the floor, not the nominal gate length.
      // A3h: the file's own window or nothing — no global stand-in.
      const gr = l ? readGateHeader(l.raw) : null;
      const g = gr?.kind === 'parsed' ? gr.gateMs : null;
      const alpha = (gr?.kind === 'parsed' ? gr.alpha : null) ?? DEFAULT_GATE_TAPER_ALPHA;
      const hz = dataFloorFromGateMs(g, alpha);
      return {
        hz,
        label: g
          ? `data floor 2/${((1 - alpha / 2) * g).toFixed(1)} ms ` +
            `(${g.toFixed(1)} ms from the file header, Tukey ${alpha}) = ${Math.round(hz ?? 0)} Hz`
          : 'data floor (this measurement states no window)',
      };
    };
    const pairFloor = (a: { hz: number | null; label: string }, b: { hz: number | null; label: string }) => {
      const xs = [a, b].filter((x) => x.hz !== null) as { hz: number; label: string }[];
      if (xs.length === 0) return { hz: null, label: '' };
      return xs.reduce((m, x) => (x.hz > m.hz ? x : m));
    };
    const dfLow = pairFloor(dataFloorOf('low', woofer), dataFloorOf('mid', midDrv));
    const dfHigh = pairFloor(dataFloorOf('mid', midDrv), dataFloorOf('high', tweeter));
    const pinsNow = xoPinsValue();
    const userWin = (pin?: { freq: number; margin: number }): [number, number] | null =>
      pin ? [pin.freq - Math.max(0, pin.margin), pin.freq + Math.max(0, pin.margin)] : null;
    const midFsHz = midHpFloor ? midHpFloor / 2 : null;
    const twFsHz = tweeterHpFloor ? tweeterHpFloor / 2 : null;
    const spacingOf = (role: BranchRole) =>
      Number(cabinet.drivers[role].count) > 1 ? Number(cabinet.drivers[role].spacingMm) || null : null;
    const winLow = deriveXoWindow(
      {
        dataFloorHz: dfLow.hz,
        dataFloorLabel: dfLow.label,
        arraySpacingMm: spacingOf('low'),
        ctcMm: cabinetInfo.ctcLow ?? null,
        ctcVec: cabinetInfo.ctcLowVec ?? null,
        breakupHz: wBreak?.hz ?? null,
        fsHz: midFsHz,
        excursionHz: midEx,
        reachHz: reachesLevelHz(grid, sim.base.m.spl),
        beamingHz: wBeam ?? wooferXoCeiling,
        beamingMeasured: wBeam !== null,
        userWindow: userWin(pinsNow.low),
        rails: [150, 2000],
      },
      xoWinThr,
    );
    const winHigh = deriveXoWindow(
      {
        dataFloorHz: dfHigh.hz,
        dataFloorLabel: dfHigh.label,
        arraySpacingMm: spacingOf('mid'),
        ctcMm: cabinetInfo.ctcHigh ?? null,
        ctcVec: cabinetInfo.ctcHighVec ?? null,
        breakupHz: mBreak?.hz ?? null,
        fsHz: twFsHz,
        excursionHz: twtEx,
        reachHz: reachesLevelHz(grid, sim.base.t.spl),
        beamingHz: mBeam ?? midXoCeiling,
        beamingMeasured: mBeam !== null,
        userWindow: userWin(pinsNow.high),
        rails: [1200, 12000],
      },
      xoWinThr,
    );
    // Rule 9: the directivity-match anchor per pair (null without angle sets).
    const diAnchor = angleSets
      ? {
          low: diMatchHz(angleSets.woofer, angleSets.mid, [150, 2000]),
          high: diMatchHz(angleSets.mid, angleSets.tweeter, [1200, 12000]),
        }
      : { low: null, high: null };
    return {
      angleSets,
      low: { floorHz: winLow.floorHz, ceilHz: winLow.ceilHz },
      lowCeilMeasured: wBeam !== null,
      high: { floorHz: winHigh.floorHz, ceilHz: winHigh.ceilHz },
      highCeilMeasured: mBeam !== null,
      /** The full derivation per handover: every limiter, the binding one,
       *  data-floor clamps and the banner text. */
      win: { low: winLow, high: winHigh },
      /** Where the lower driver's DI meets the upper's (Hz) — seeded as a
       *  candidate when inside the window, shown either way. */
      diAnchor,
      /** Every criterion's own number, so the panel can say WHICH one binds —
       *  a window the designer cannot attribute is a window he cannot act on. */
      limits: {
        low: { beam: wBeam, lobe: wLobe, arrayLobe: arrayOf('low'), breakup: wBreak, excursion: midEx },
        high: { beam: mBeam, lobe: mLobe, arrayLobe: arrayOf('mid'), breakup: mBreak, excursion: twtEx },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threeWay, sim, result, phaseMode, angleSets, midHpFloor, wooferXoCeiling, midXoCeiling,
      tweeterHpFloor, kaTier, cabinetInfo, ctcK, breakupLimitOn, breakupHarmonic,
      sdCm2, xmaxMm, excursionSpl, impedances, cabinet, xoWinThr, merged, nearField, woofer, midDrv, tweeter,
      xoRangeOn, xoLowFreqHz, xoLowMarginHz, xoFreqHz, xoMarginHz]);

  /**
   * AUDIT §6.3 — the two measurement floors, held against each other (F4d).
   *
   * Reactive rather than run-scoped, and that is the point: the disagreement is
   * a property of the MEASUREMENTS and the designer should see it before
   * pressing scan, not in the notes afterwards. It resolves nothing — see
   * `floorComparison.ts` for why resolving it would be the mistake.
   */
  const v2Floors = useMemo((): FloorComparison[] => {
    if (!engineSelection.reporting || !v2Windows) return [];
    return (['low', 'high'] as const).flatMap((side) => {
      const w2 = v2Windows[side];
      const w1 = physWin3?.win[side];
      if (!w2 && !w1) return [];
      const rec = w2 ? recommendedBand(w2) : null;
      const band = rec?.effectiveHz.length
        ? ([
            Math.min(...rec.effectiveHz.map((seg) => seg[0])),
            Math.max(...rec.effectiveHz.map((seg) => seg[1])),
          ] as [number, number])
        : null;
      return [
        compareFloors(
          w2 ? `${w2.lower} → ${w2.upper}` : side === 'low' ? 'W-M' : 'M-T',
          w2 && w2.floorHz !== null
            ? {
                layer: 'Engine v2 (A5d.3)',
                hz: w2.floorHz,
                source: w2.floorBy?.source ?? 'no binding floor limit',
                subject: w2.floorBy?.rule ?? 'unattributed',
              }
            : null,
          w1 && w1.floorHz !== null
            ? {
                layer: 'the v1 physics window',
                hz: w1.floorHz,
                source: w1.floorBy?.label ?? 'no binding floor limit',
                subject: w1.floorBy?.rule ?? 'unattributed',
              }
            : null,
          band,
        ),
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineSelection.reporting, v2Windows, physWin3]);


  /* The SAME physics window for the TWO-WAY pair (woofer↔tweeter). The
   * three-way scan has derived its search space from the measurements since
   * August; the two-way scan never got it and still searches an unbounded
   * neighbourhood of the raw crossing — the open roadmap item "Fs-vloer voor
   * de HP-knie in de vfOptimizer-bounds", generalised: floor = 2×Fs AND
   * where the tweeter reaches its own level AND its excursion floor; ceiling
   * = the woofer's measured beaming onset, its lobing limit against the
   * tweeter (auto-k by axis), its own array spacing, and its breakup/N.
   * Reported as ONE window and used both to judge the delivered crossing and
   * to bound the free scan. */
  const physWin2 = useMemo(() => {
    if (threeWay || soloDriver || !sim || !result) return null;
    const grid = result.freq;
    const ad = angleResponsesOn(grid);
    const maxOpt = (...vs: (number | null | undefined)[]): number | null => {
      const xs = vs.filter((v): v is number => typeof v === 'number' && v > 0);
      return xs.length ? Math.max(...xs) : null;
    };
    const minOpt = (...vs: (number | null | undefined)[]): number | null => {
      const xs = vs.filter((v): v is number => typeof v === 'number' && v > 0);
      return xs.length ? Math.min(...xs) : null;
    };
    const wBeam = ad ? beamingCeilingHz(ad.woofer, KA_TIERS[kaTier].diff30Db) : null;
    const kk =
      ctcK === 'auto'
        ? cabinetInfo.ctcLowVec
          ? lobingKFor(cabinetInfo.ctcLowVec.dxMm, cabinetInfo.ctcLowVec.dyMm)
          : 0.5
        : Number(ctcK) > 0
          ? Number(ctcK)
          : 0.5;
    const wLobe = lobingCeilingHz(cabinetInfo.ctcLow ?? 0, kk);
    const wBaf = Number(cabinet.baffleWidthMm);
    const hBaf = Number(cabinet.baffleHeightMm);
    const horizArr = wBaf > 0 && hBaf > 0 ? wBaf > hBaf : true;
    const kArr = ctcK === 'auto' ? lobingKFor(horizArr ? 1 : 0, horizArr ? 0 : 1) : kk;
    const arrLow =
      Number(cabinet.drivers.low.count) > 1
        ? lobingCeilingHz(Number(cabinet.drivers.low.spacingMm), kArr)
        : null;
    const harm = Number(breakupHarmonic) > 0 ? Number(breakupHarmonic) : 3;
    let wBreak: { hz: number } | null = null;
    if (breakupLimitOn) {
      try {
        const z = zGridWithSlots(impedances, grid)[canonicalModelForRole('low', false)];
        const reach = reachesLevelHz(grid, sim.base.w.spl);
        wBreak = breakupHz(grid, sim.base.w.spl, {
          zMag: z ? z.map((c) => Math.hypot(c.re, c.im)) : undefined,
          searchFromHz: Math.max(300, (reach ?? 0) * 2),
        });
      } catch {
        wBreak = null;
      }
    }
    const splRef = Number(excursionSpl);
    const twtEx = Number.isFinite(splRef)
      ? excursionFloorHz(Number(sdCm2.high), Number(xmaxMm.high), splRef, {
          count: Number(cabinet.drivers.high.count) || 1,
        })
      : null;
    return {
      floorHz: maxOpt(tweeterHpFloor, reachesLevelHz(grid, sim.base.t.spl), twtEx),
      ceilHz: minOpt(
        wBeam ?? wooferXoCeiling,
        wLobe,
        arrLow,
        wBreak && breakupCeilingHz(wBreak.hz, harm),
      ),
      ceilMeasured: wBeam !== null,
      limits: { beam: wBeam, lobe: wLobe, arrayLobe: arrLow, breakup: wBreak, excursion: twtEx },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threeWay, soloDriver, sim, result, phaseMode, kaTier, cabinetInfo, ctcK, cabinet,
      breakupLimitOn, breakupHarmonic, impedances, excursionSpl, sdCm2, xmaxMm,
      tweeterHpFloor, wooferXoCeiling]);

  /** Per-adjacent-pair integration + phase flatness (3-way only). Silent
   *  ghost regions (per-branch bands) drop out of the overlap window on
   *  their own — the weights die with the level. */
  const pairScores = useMemo(() => {
    if (!threeWay || !sim?.mid || !result) return null;
    const zero = { offsetMm: 0, trimDb: 0, inverted: false };
    const mk = (lo: GriddedResponse, hi: GriddedResponse) => {
      const r = combine(lo, hi, zero);
      const integ = computeIntegration(r);
      return { integ, stats: computePhaseStats(r.relativePhaseDeg, integ.points) };
    };
    return {
      low: mk(result.woofer, sim.mid),
      high: mk(sim.mid, result.tweeter),
    };
  }, [threeWay, sim, result]);

  /**
   * Verdict on the MEASURING DISTANCE itself. The residual the correction
   * would remove, expressed in degrees at the highest handover — because a
   * time shift is only as harmful as the frequency it lands on. Same 1/R
   * geometry as the far-field criterion, so this tends to agree with "3× the
   * largest dimension": measuring far enough fixes both, and the correction
   * is the fallback for when the room (or a tall cabinet) will not allow it.
   */
  const measureVerdict = useMemo(() => {
    if (!seatShiftRaw) return null;
    const hz =
      pairScores?.high.integ.overlapCentreHz ??
      integration?.overlapCentreHz ??
      pairScores?.low.integ.overlapCentreHz ??
      null;
    if (!hz) return null;
    // Worst pair, relative to the low branch — the same reference the sum uses.
    const worstUs = Math.max(
      Math.abs((seatShiftRaw.us.high ?? 0) - (seatShiftRaw.us.low ?? 0)),
      threeWay ? Math.abs((seatShiftRaw.us.mid ?? 0) - (seatShiftRaw.us.low ?? 0)) : 0,
    );
    const v = measuringDistanceVerdict(worstUs, hz);
    return v ? { ...v, hz, worstUs } : null;
  }, [seatShiftRaw, pairScores, integration, threeWay]);

  /** The SPL chart's live visible x-range (Hz), zoom/pan included — mirrored
   *  up from the chart so the ±dB read-out tracks exactly what you see. */
  const [splViewX, setSplViewX] = useState<[number, number] | null>(null);
  const onSplVisibleX = useCallback((lo: number, hi: number) => {
    setSplViewX((prev) => (prev && prev[0] === lo && prev[1] === hi ? prev : [lo, hi]));
  }, []);

  /** Amplitude counterpart to the summing score: whole-range flatness stats of
   *  the COMBINED SPL across the VISIBLE SPL range (tracks the chart zoom).
   *  Score/avg/P95 judge the entire range; the peak ±dB rides along as the
   *  classic single number — that one can be dominated by one narrow spot,
   *  which is exactly why it no longer stands alone (Sanders wens, jul 2026). */
  /** The optimizer's own low band edge, when the Response score above it
   *  judges territory the optimizer never designed on. Null when they agree
   *  (nothing to warn about) — see the strip item for the reasoning. */
  const optimizerFloorHz = useMemo(() => {
    if (!result) return null;
    const floor = Math.max(200, result.freq[0] * 1.02);
    const visibleLo = splViewX ? splViewX[0] : result.freq[0];
    return visibleLo < floor / 1.05 ? floor : null;
  }, [result, splViewX]);

  const combinedFlat = useMemo(() => {
    if (!result) return null;
    const lo = splViewX ? splViewX[0] : result.freq[0];
    const hi = splViewX ? splViewX[1] : result.freq[result.freq.length - 1];
    return computeResponseStats(result.freq, result.combinedSpl, lo, hi);
  }, [result, splViewX]);

  /** Model vs measurement (VALIDATIE.md loop): the loaded verification FRD
   *  against the simulated combined, level-aligned and delay-fitted over the
   *  VISIBLE range — the overlay and the strip judge the same band. */
  const verifyCompare = useMemo(() => {
    if (!result || !verify) return null;
    const lo = splViewX ? splViewX[0] : result.freq[0];
    const hi = splViewX ? splViewX[1] : result.freq[result.freq.length - 1];
    return compareMeasurement(result.freq, result.combinedSpl, result.combinedPhaseDeg, verify.frd, [lo, hi]);
  }, [result, verify, splViewX]);

  /** Every loaded measurement against the same sim and band — Compare mode's
   *  "did v2 beat v1" table. Same function, same band as the active overlay,
   *  so a row cannot flatter itself with a different yardstick. */
  const verifyAll = useMemo(() => {
    if (!result || verifyList.length === 0) return null;
    const lo = splViewX ? splViewX[0] : result.freq[0];
    const hi = splViewX ? splViewX[1] : result.freq[result.freq.length - 1];
    return verifyList.map((v) => {
      try {
        return compareMeasurement(result.freq, result.combinedSpl, result.combinedPhaseDeg, v.frd, [lo, hi]);
      } catch {
        return null;
      }
    });
  }, [result, verifyList, splViewX]);

  /** The loudest and quietest spot of the combined curve, marked in the chart.
   *  Straight from `combinedFlat`, so the dots sit exactly where the peak ±dB
   *  in the strip comes from and follow the same band (and the same zoom).
   *  NB: with a view range that reaches into a driver's rolloff the dip is the
   *  rolloff, not a design fault — it marks the range you asked to be judged. */
  const splExtremes = useMemo(() => {
    if (!combinedFlat) return undefined;
    const { peak, dip } = combinedFlat;
    return [
      {
        x: peak.freqHz,
        y: peak.splDb,
        label: `max ${peak.splDb.toFixed(1)} dB`,
        title: `Loudest point of the combined response in this range: ${peak.splDb.toFixed(
          1,
        )} dB at ${hz(peak.freqHz)} — ${peak.devDb >= 0 ? '+' : ''}${peak.devDb.toFixed(
          1,
        )} dB against the median level`,
        place: 'above' as const,
      },
      {
        x: dip.freqHz,
        y: dip.splDb,
        label: `min ${dip.splDb.toFixed(1)} dB`,
        title: `Quietest point of the combined response in this range: ${dip.splDb.toFixed(
          1,
        )} dB at ${hz(dip.freqHz)} — ${dip.devDb.toFixed(1)} dB against the median level`,
        place: 'below' as const,
      },
    ];
  }, [combinedFlat]);

  /** Measured ACOUSTIC slopes beside the crossing (dB/oct, least squares over
   *  ~1 octave). The electrical parts don't reveal the acoustic order — the
   *  driver's own rolloff stacks on top of the filter; this is the number
   *  the "acoustic 4th order at the tweeter" rule of thumb is about. */
  const acousticSlopes = useMemo(() => {
    if (!result || integration?.overlapCentreHz == null) return null;
    const xo = integration.overlapCentreHz;
    const slope = (spl: readonly number[], lo: number, hi: number): number | null => {
      let n = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let sxy = 0;
      for (let i = 0; i < result.freq.length; i++) {
        const f = result.freq[i];
        if (f < lo || f > hi) continue;
        const x = Math.log2(f);
        n++;
        sx += x;
        sy += spl[i];
        sxx += x * x;
        sxy += x * spl[i];
      }
      if (n < 4) return null;
      return (n * sxy - sx * sy) / (n * sxx - sx * sx);
    };
    return {
      xo,
      tweeterDbPerOct: slope(result.tweeter.spl, xo / 2.2, xo / 1.15),
      wooferDbPerOct: slope(result.woofer.spl, xo * 1.15, xo * 2.2),
    };
  }, [result, integration]);
  /** Design-targets popup (Network toolbar). */
  const [showTargets, setShowTargets] = useState(false);

  /** Angle responses resampled onto a grid, phase convention applied. In
   *  3-way the grid spans the UNION of the drivers' measurement ranges, so
   *  each angle file gets the same banded treatment as the 0° sim branches:
   *  clamped resample + silent ghost outside its own measured range — a
   *  plain resample would throw on the first tweeter angle file (measures
   *  from ~640 Hz) and silently null the whole directivity computation. */
  function angleResponsesOn(grid: readonly number[]) {
    if (!angleSets) return null;
    const toGrid = (frd: Parsed) => {
      const g = threeWay
        ? resample(frd.freq, frd.spl, frd.phase, [...grid], { clampEdges: true })
        : resample(frd.freq, frd.spl, frd.phase, [...grid]);
      const withPhase =
        phaseMode === 'minimum'
          ? { ...g, phaseDeg: minimumPhaseDeg(grid, g.spl, { sampleRate: 192000, fftSize: 32768 }) }
          : g;
      if (!threeWay) return withPhase;
      const f0 = frd.freq[0];
      const f1 = frd.freq[frd.freq.length - 1];
      return {
        freq: withPhase.freq,
        spl: withPhase.spl.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? SILENT_GHOST_DB : v)),
        phaseDeg: withPhase.phaseDeg.map((v, i) => (grid[i] < f0 || grid[i] > f1 ? 0 : v)),
      };
    };
    try {
      return {
        woofer: angleSets.woofer.map((a): AngleResponse => ({ hor: a.hor, response: toGrid(a.frd) })),
        tweeter: angleSets.tweeter.map((a): AngleResponse => ({ hor: a.hor, response: toGrid(a.frd) })),
        mid: angleSets.mid?.map((a): AngleResponse => ({ hor: a.hor, response: toGrid(a.frd) })),
      };
    } catch {
      return null;
    }
  }

  const directivityCore = useMemo(() => {
    // À-la-carte: skip the per-angle solve entirely when neither consumer shows.
    if (!angleSets || !result || !sim) return null;
    const sets = angleResponsesOn(result.freq);
    if (!sets) return null;
    const tAdj = branchAdj.tweeter;
    if (threeWay) {
      // Three branch layers through the N-branch core. The mid's OWN angle
      // set is required — a mid-less sum would be silently wrong.
      if (!sets.mid || sets.mid.length === 0) return null;
      return computeDirectivityN([
        { angles: sets.woofer, h: sim.transfers?.woofer ?? null },
        {
          angles: sets.mid,
          h: sim.transfers?.mid ?? null,
          adjust: branchAdj.mid,
        },
        { angles: sets.tweeter, h: sim.transfers?.tweeter ?? null, adjust: tAdj },
      ]);
    }
    return computeDirectivity(
      sets.woofer,
      sets.tweeter,
      sim.transfers?.woofer ?? null,
      sim.transfers?.tweeter ?? null,
      tAdj,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angleSets, result, sim, threeWay, phaseMode, offsetMm, trimDb, inverted, midOffsetMm, midTrimDb, midInverted]);
  /** Panels only: same result, gated on the chips (a hidden panel is not computed twice). */
  const directivity = showPanels.directivity || showPanels.sonogram ? directivityCore : null;
  /** Power-response trend of the LIVE design (point A3): slope in dB/decade,
   *  smoothness and fold — shown in the SPL strip whatever panels are on,
   *  with a warning when the slope RISES (> +1 dB/dec): that is almost always
   *  a level or measurement error (a swapped file, a +10 dB tweeter), not a
   *  design choice — and it carries no fx weight, the slope is free. */
  const powerTrend = useMemo(() => {
    if (!directivityCore) return null;
    const xs = threeWay
      ? [pairScores?.low?.integ.overlapCentreHz ?? null, pairScores?.high?.integ.overlapCentreHz ?? null]
      : [integration?.overlapCentreHz ?? null];
    const f = directivityCore.freq;
    return powerShape(f, directivityCore.powerDb, [Number(fMin) || f[0], Number(fMax) || f[f.length - 1]], xs);
  }, [directivityCore, threeWay, pairScores, integration, fMin, fMax]);


  const [sonogramMode, setSonogramMode] = useState<SonogramMode>('normalized');
  const sonogram = useMemo(
    () =>
      showPanels.sonogram && directivity
        ? {
            data: buildSonogram(directivity, sonogramMode),
            beamwidth: beamwidth6dBHalfAngle(directivity),
          }
        : null,
    [directivity, sonogramMode, showPanels.sonogram],
  );

  const timeDomain = useMemo(() => {
    if (!showPanels.time || !result) return null;
    try {
      const td = toTimeDomain(result.freq, result.combinedSpl, result.combinedPhaseDeg);
      const egd = excessGroupDelay(result.freq, result.combinedPhaseDeg);
      return { td, egd };
    } catch {
      return null;
    }
  }, [result, showPanels.time]);

  const phaseStats = useMemo(
    () => (result && integration ? computePhaseStats(result.relativePhaseDeg, integration.points) : null),
    [result, integration],
  );

  interface SynthState {
    woofer?: SynthesisResult;
    mid?: SynthesisResult;
    tweeter?: SynthesisResult;
    mode: 'filter' | 'acoustic';
    error?: string;
  }
  const [synth, setSynth] = useState<SynthState | null>(null);
  const [synthMode, setSynthMode] = useState<'filter' | 'acoustic'>('acoustic');
  const [phasePriority, setPhasePriority] = useState(50); // % of budget to phase
  // Results describe a specific target — invalidate when the knobs move.
  // Exception: the optimizer flow sets new vFilters AND builds for them in
  // one go; that build is fresh, not stale (the ref skips one invalidation).
  const synthFresh = useRef(false);
  useEffect(() => {
    if (synthFresh.current) {
      synthFresh.current = false;
      return;
    }
    setSynth(null);
  }, [vFilters, synthMode, phasePriority]);

  const [vfOpt, setVfOpt] = useState<VfOptimizeResult | null>(null);
  const [vfBusy, setVfBusy] = useState(false);
  const [vfError, setVfError] = useState<string | null>(null);
  /** Live multi-round progress: proof of work while the solver grinds. */
  const [vfProgress, setVfProgress] = useState<{
    round: number;
    evals: number;
    rippleDb?: number;
    phaseDeg?: number;
    /** Live phase label (vf-rounds path). */
    label?: string;
    /** Scan path: one STABLE row per candidate — rendered as a fixed table. */
    items?: { label: string; text: string; done: boolean; warn?: string }[];
    /**
     * Which ROUND of an axis-by-axis scan is running.
     *
     * `total` is a STRING because the number of rounds is not fixed: the third
     * (a local refinement) runs only when the two axes turn out coupled, so it
     * reads "2–3" until that is decided and "3" once it is. Printing "1/3"
     * would be a promise the scan cannot keep — and the alternative the user
     * actually hit is worse: the candidate counter's denominator grows 7 → 14
     * → 23 as rounds are earned, which without this line reads as a target
     * running away from you.
     */
    round3?: { label: string; n: number; total: string };
  } | null>(null);
  /** Coarse stage of a standalone component tune ("value tune", "snap", …). */
  /** Component-tune progress à la the scan card (Sanders wens): the PLANNED
   *  stage pipeline (fixed rows, card never changes size) + the fired-stage
   *  history from the worker. A stage the pipeline passed without firing
   *  (conditional: escalation, amp-floor repair) shows as skipped. */
  const [netOptPlan, setNetOptPlan] = useState<string[] | null>(null);
  const [netOptStages, setNetOptStages] = useState<string[]>([]);
  /** Elapsed seconds while the busy overlay is up — part of the totals line. */
  const [busyElapsed, setBusyElapsed] = useState(0);
  /** Completed-run stats: the LAST round's progress update gets batched away
   *  with finish()'s cleanup, so without this the user only ever sees
   *  "round N−1" ("ik zie maar 1 ronde"). */
  const [vfRunStats, setVfRunStats] = useState<{ rounds: number; evals: number } | null>(null);
  // EQ bands the optimizer may use per driver. The default has one home since
  // V41 (`vfOptimizer.ts`), because the v2 candidate states the same number.
  const [vfEqBands, setVfEqBands] = useState(DEFAULT_EQ_BANDS_PER_DRIVER);
  const [dirWeight, setDirWeight] = useState(25); // % of amplitude budget on the energy average
  /** Power-response metric: 'smooth' (detrended residual + DI fold, slope
   *  free — the crossover owns smoothness, the room owns the slope) or
   *  'legacy' (std of the raw energy average, pre-aug-2026, for A/B). Both
   *  a preference: localStorage. */
  /** DI-distance weight in the 3-way structure search (threeWayDesign):
   *  wDI · log2(knee / DI anchor)² per handover with an anchor. Default 0.3. */
  const [diWeight, setDiWeight] = useState<number>(() => {
    const v = Number(localStorage.getItem('ads-di-weight'));
    return Number.isFinite(v) && v >= 0 && localStorage.getItem('ads-di-weight') !== null ? v : 0.3;
  });
  /** Error smoothing for the search objectives (oct): 0 = off (legacy raw
   *  points), 1/24, 1/12 (default), 1/6. Preference (localStorage). */
  const [errorSmoothOct, setErrorSmoothOct] = useState<number>(() => {
    const raw = localStorage.getItem('ads-err-smooth');
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : 1 / 12;
  });

  /**
   * The tuner-vs-acceptance smoothing line (F3c, deliverable 3).
   *
   * Behind the SAME flag as every other v2 surface in the dialog, and null
   * when the two widths agree. It READS `errorSmoothOct` and changes nothing
   * about it: visibility, not coupling. It sits here rather than beside the
   * window block because it has to be declared after the state it reads, and
   * a `useState` moved up the file to please a comment is a worse trade.
   */
  const v2Smoothing: SmoothingNotice | null = !engineSelection.reporting
    ? null
    : smoothingConsistency(
        /* V38-fix — the line has to name the width the RUN will search on, not
         * the one the preference holds. With the v2 optimiser selected the
         * candidate states its own (`declareCandidateChoices`), and stating a
         * width the search does not use would turn F3c's visibility line into
         * the silent disagreement it exists to prevent.
         *
         * ONE CASE OVERSTATES, and it is named rather than hidden: when no
         * A5d.3 window can be derived, the v2 route falls back to the v1
         * candidate generator, no declaration travels, and the run searches on
         * the preference after all. That fallback already announces itself
         * loudly in the run notes at the moment it happens — which is where a
         * reader is, and this line is rendered before the run. */
        engineSelection.optimizer === 'v2' ? SEARCH_SMOOTHING_OCTAVES : errorSmoothOct,
      );
  /** Source-resistance limit at the low driver (Ω): above it a candidate
   *  loses a ranking class and a staged structure move is not "safe" (point
   *  4). Yellow from half the limit in the strip. Default 1.0. */
  /** Hard tier (fix 1): a candidate with this much source resistance in front
   *  of the low driver is DISQUALIFIED (visible, struck through). Default 2 Ω. */
  /** Dissipation weight (fix 3a): soft fx penalty on series resistance in
   *  front of the lowest branch, (Rs/Re)² × weight. Default 0.05, 0 = legacy. */
  const [dissipationWeight, setDissipationWeight] = useState<number>(() => {
    const raw = localStorage.getItem('ads-diss-weight');
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : 0.05;
  });
  const [rSourceDisqOhm, setRSourceDisqOhm] = useState<number>(() => {
    const raw = localStorage.getItem('ads-rsource-disq');
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_R_SOURCE_DISQUALIFY_OHM;
  });
  const [rSourceLimitOhm, setRSourceLimitOhm] = useState<number>(() => {
    const raw = localStorage.getItem('ads-rsource-limit');
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_R_SOURCE_TIER_OHM;
  });
  /** B1 — BOM cap per channel (EUR; 0 = off): class loss in the ranking above
   *  it, shown in the strip. A design decision, not a weight. */
  const [bomCapEur, setBomCapEur] = useState<number>(() => {
    const raw = localStorage.getItem('ads-bom-cap');
    const v = raw === null ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  });
  /** D — room correction present (Dirac etc.): the RIPPLE target may widen
   *  (default 2.5 → 3.5 dB) because on-axis residual ripple is corrected by
   *  the room system; PHASE targets stay — driver integration across a
   *  handover is set passively and no room correction repairs it. */
  const [roomCorrection, setRoomCorrection] = useState<boolean>(() => localStorage.getItem('ads-room-corr') === '1');
  const [roomRippleDb, setRoomRippleDb] = useState<number>(() => {
    const v = Number(localStorage.getItem('ads-room-ripple'));
    return Number.isFinite(v) && v > 0 ? v : 3.5;
  });
  /** Effective staged RIPPLE target: widened to roomRippleDb when room
   *  correction is present (never narrowed); phase target untouched. */
  const rippleTargetEff = (): number => {
    const base = num(targetRipple, 2.5);
    return roomCorrection ? Math.max(base, roomRippleDb) : base;
  };
  /** Catalog-snap cost pressure (B2). Was NEVER wired from the UI/chains
   *  before aug 2026 — the tuner silently ran its 0.0015 default. */
  const [costWeight, setCostWeight] = useState<number>(() => {
    const raw = localStorage.getItem('ads-cost-weight');
    const v = raw === null ? NaN : Number(raw);
    // Default 0.015 (B2 curve on the KOAN set: BOM 165 → 160 € with the best
    // peak; 0.05+ lands in another basin at 165 €). The tuner's own default
    // stays 0.0015 for legacy callers.
    return Number.isFinite(v) && v >= 0 ? v : 0.015;
  });
  const [powerMetric, setPowerMetric] = useState<'smooth' | 'legacy'>(() =>
    localStorage.getItem('ads-power-metric') === 'legacy' ? 'legacy' : 'smooth',
  );
  const [powerFoldWeight, setPowerFoldWeight] = useState<number>(() => {
    const v = Number(localStorage.getItem('ads-power-fold'));
    return Number.isFinite(v) && v > 0 ? v : 0.5;
  });
  const [ampTarget, setAmpTarget] = useState<'onAxis' | 'listeningWindow'>('onAxis');

  /**
   * Guided is meant to BE the standard setting (Sanders point). It is not
   * knob-free — the wizard writes these same values, and forcing defaults
   * would mean the wizard's own choice does not stick — so the honest form is
   * not a silent override but VISIBILITY: anything steering the run that is
   * not at its standard value is named on the guided design step, in plain
   * language, one click from being put back.
   *
   * That also covers the settings the wizard does NOT show (breakup guard,
   * directivity weight, ka tier): an expert experiment can no longer steer a
   * guided run from behind the curtain.
   */
  const nonStandard = (
    [
      ['priority', phasePriority !== 50, `priority ${100 - phasePriority}/${phasePriority}`, () => setPhasePriority(50)],
      ['staged', !stagedOn, 'staged targets off', () => setStagedOn(true)],
      ['ripple', targetRipple !== '2.5', `ripple target ${targetRipple} dB`, () => setTargetRipple('2.5')],
      ['phase', targetPhase !== '15', `phase target ${targetPhase}°`, () => setTargetPhase('15')],
      ['pin', xoRangeOn, `crossover pinned at ${xoFreqHz} ± ${xoMarginHz} Hz`, () => setXoRangeOn(false)],
      ['align', hpLpPref !== 'auto', `alignment forced to ${hpLpPref}`, () => setHpLpPref('auto')],
      ['alignLow', hpLpPrefLow !== 'auto', `low alignment forced to ${hpLpPrefLow}`, () => setHpLpPrefLow('auto')],
      ['guard', !breakupGuard, 'breakup guard off', () => setBreakupGuard(true)],
      ['dir', dirWeight !== 25, `in-room weight ${dirWeight}%`, () => setDirWeight(25)],
      ['ka', kaTier !== 'measured', `beaming tier ${kaTier}`, () => setKaTier('measured')],
      ['ctc', ctcK !== 'auto', `lobing k ${ctcK}`, () => setCtcK('auto')],
      ['eq', vfEqBands !== 2, `${vfEqBands} EQ bands per driver`, () => setVfEqBands(2)],
      ['slopeMid', acSlopeMid !== '24', `mid slope ${acSlopeMid}`, () => setAcSlopeMid('24')],
      ['slopeTw', acSlopeTweeter !== '12', `tweeter slope ${acSlopeTweeter}`, () => setAcSlopeTweeter('12')],
      ['slopeWf', acSlopeWoofer !== '24', `woofer slope ${acSlopeWoofer}`, () => setAcSlopeWoofer('24')],
      ['slopeMidHp', acSlopeMidHp !== '24', `mid HP slope ${acSlopeMidHp}`, () => setAcSlopeMidHp('24')],
      ['metric', phaseMetricMode !== 'band', `phase metric ${phaseMetricMode}`, () => setPhaseMetricMode('band')],
      ['ampT', ampTarget !== 'onAxis', 'amplitude target = listening window', () => setAmpTarget('onAxis')],
      ['snap', !catalogSnap, 'catalog snap off', () => setCatalogSnap(true)],
      ['breakLim', !breakupLimitOn, 'breakup limit off', () => setBreakupLimitOn(true)],
      ['profile', snapProfile !== 'auto', `component profile ${snapProfile}`, () => setSnapProfile('auto')],
      ['stacks', !snapStacks, 'stacking off', () => setSnapStacks(true)],
      ['sL', snapSeriesL !== 'auto', 'coil series bound', () => setSnapSeriesL('auto')],
      ['sC', snapSeriesC !== 'auto', 'cap series bound', () => setSnapSeriesC('auto')],
      ['sR', snapSeriesR !== 'auto', 'resistor series bound', () => setSnapSeriesR('auto')],
    ] as const
  ).filter(([, off]) => off);
  const resetToStandard = () => nonStandard.forEach(([, , , undo]) => undo());

  /* ---- Project persistence (step 8) ---- */

  const AUTOSAVE_KEY = 'ads-autosave';
  /* BROWSER STORAGE IS SMALL, AND IT USED TO FAIL IN SILENCE (aug 2026,
   * Sanders "de selectie van de catalogus bestanden werken niet meer").
   *
   * His project autosaves to 7.8 MB — three ARTA exports of 13 640 points
   * each, five angle sets per driver, plus impedances — and Chrome hands a
   * site about 5 MB of localStorage. So the write threw QuotaExceededError,
   * the catch was empty ("autosave silently unavailable"), and from then on
   * NOTHING persisted: the catalog import lived in memory until the next
   * reload and then vanished, which reads exactly like a broken importer.
   *
   * Two changes. Storing COMPRESSED (gzip, ~8x on measurement text) puts a
   * project of this size back inside the budget, and a failed write now says
   * so instead of being swallowed. */
  const STORE_GZIP_PREFIX = 'gz:';
  const canCompress = typeof CompressionStream !== 'undefined';
  async function packForStorage(text: string): Promise<string> {
    if (!canCompress) return text;
    const cs = new CompressionStream('gzip');
    const blob = await new Response(
      new Blob([text]).stream().pipeThrough(cs),
    ).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    // Chunked: String.fromCharCode(...bytes) blows the argument limit on MBs.
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return STORE_GZIP_PREFIX + btoa(bin);
  }
  async function unpackFromStorage(raw: string): Promise<string> {
    if (!raw.startsWith(STORE_GZIP_PREFIX)) return raw;
    const bin = atob(raw.slice(STORE_GZIP_PREFIX.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    return await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
  }
  /** True when the browser refused to store something — surfaced, never swallowed. */
  const [storageFull, setStorageFull] = useState<string | null>(null);
  async function storeCompressed(key: string, text: string, what: string): Promise<boolean> {
    try {
      localStorage.setItem(key, await packForStorage(text));
      setStorageFull((f) => (f && f.includes(what) ? null : f));
      return true;
    } catch {
      setStorageFull(
        t(
          '{what} could not be stored — this browser\'s storage is full ({mb} MB of data). Your work is safe in this tab, but it will NOT survive a reload: save the project to a file.',
          { what, mb: (text.length / 1048576).toFixed(1) },
        ),
      );
      return false;
    }
  }
  /** A set-aside autosave that failed to restore once. Surfaced with a retry
   *  and a download instead of living silently in localStorage — a backup
   *  nobody can reach is not a backup (Sanders: "alles is ineens weg"). */
  const [unreadableBackup, setUnreadableBackup] = useState<string | null>(() => {
    try {
      return localStorage.getItem('ads-autosave-unreadable');
    } catch {
      return null;
    }
  });
  const retryUnreadableBackup = () => {
    const raw = localStorage.getItem('ads-autosave-unreadable');
    if (!raw) return;
    try {
      applyProject(deserializeProject(raw));
      localStorage.removeItem('ads-autosave-unreadable');
      setUnreadableBackup(null);
      setPersistNote(t('Backup restored — it is your live session again and autosaves from here.'));
    } catch (err) {
      setError(
        t('The backup still cannot be loaded ({reason}). Download it and send it along — the file itself is a normal project file.', {
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  };
  const downloadUnreadableBackup = () => {
    const raw = localStorage.getItem('ads-autosave-unreadable');
    if (!raw) return;
    const blob = new Blob([raw], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'crossover-studio-autosave-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const [persistNote, setPersistNote] = useState<string | null>(null);

  function snapshot(): ProjectState {
    const zByRole: NonNullable<ProjectState['zByRole']> = {};
    for (const role of ['low', 'mid', 'high'] as const) {
      const v = zStandalone[role];
      if (v) zByRole[role] = v.file;
    }
    return {
      woofer: woofer ? { name: woofer.name, raw: woofer.raw } : undefined,
      mid: midDrv ? { name: midDrv.name, raw: midDrv.raw } : undefined,
      tweeter: tweeter ? { name: tweeter.name, raw: tweeter.raw } : undefined,
      // v2: `impedances` carries only the vxp's model-named files; the
      // standalone per-branch ZMAs live role-keyed in `zByRole`.
      impedances: project ? { ...project.impedanceFiles } : undefined,
      zByRole: Object.keys(zByRole).length > 0 ? zByRole : undefined,
      vxp: project ? project.vxpFile : undefined,
      angleFiles: angleSets
        ? {
            woofer: angleSets.woofer.map((a) => ({ hor: a.hor, name: a.name, raw: a.raw })),
            tweeter: angleSets.tweeter.map((a) => ({ hor: a.hor, name: a.name, raw: a.raw })),
            ...(angleSets.mid && angleSets.mid.length > 0
              ? { mid: angleSets.mid.map((a) => ({ hor: a.hor, name: a.name, raw: a.raw })) }
              : {}),
          }
        : undefined,
      fileNotes: Object.keys(fileNotes).length > 0 ? fileNotes : undefined,
      verifyFile: verify ? { name: verify.name, raw: verify.raw } : undefined,
      verifyFiles:
        verifyList.length > 0 ? verifyList.map((v) => ({ name: v.name, raw: v.raw })) : undefined,
      verifyActive: verifyList.length > 0 ? Math.min(verifyIx, verifyList.length - 1) : undefined,
      nearField: (() => {
        const out: NonNullable<ProjectState['nearField']> = {};
        for (const r of ['low', 'mid', 'high'] as BranchRole[]) {
          const n = nearField[r];
          if (!n.cone && !n.port) continue;
          out[r] = {
            ...(n.cone ? { cone: n.cone } : {}),
            ...(n.port ? { port: n.port } : {}),
            portDiaMm: n.portDiaMm,
            transitionHz: n.transitionHz,
            blendOctaves: n.blendOctaves,
            stepOn: n.stepOn,
            stepDepthDb: n.stepDepthDb,
          };
        }
        return Object.keys(out).length ? out : undefined;
      })(),
      design: {
        vFilters,
        xoName,
        offsetMm,
        trimDb,
        inverted,
        midOffsetMm,
        midTrimDb,
        midInverted,
        fMin,
        fMax,
        splMin,
        splMax,
        phasePriority,
        vfEqBands,
        phaseMode,
        dirWeight,
        ampTarget,
        sonogramMode,
        networkDesigns: designs.length > 0 ? designs : undefined,
        activeDesignId: activeDesignId ?? undefined,
        lastSavedDesignId: lastSavedId ?? undefined,
        networkActive,
        vfBypass,
        catalogSnap,
        breakupGuard,
        xoRangeOn,
        xoFreqHz,
        xoMarginHz,
        xoScanSteps,
        xo3Steps,
        hpLpPref,
        hpLpPrefLow,
        phaseMetric: phaseMetricMode,
        acSlopeMid,
        acSlopeTweeter,
        acSlopeWoofer,
        acSlopeMidHp,
        xoLowFreqHz,
        xoLowMarginHz,
        midSizeInch,
        wooferSizeInch,
        kaTier,
        cabinet,
        ctcK,
        seatTiming,
        breakupLimitOn,
        breakupHarmonic,
        sdCm2,
        xmaxMm,
        excursionSpl,
        snapProfile,
        snapSeriesL,
        snapSeriesC,
        snapSeriesR,
        snapStacks,
        snapBoundToSeries,
        stagedOn,
        engineV2Enabled,
        engineV2: { ...engineV2Settings },
        v2Measurement: {
          low: { ...v2Meas.low },
          mid: { ...v2Meas.mid },
          high: { ...v2Meas.high },
        },
        targetRipple,
        soloSensDb,
        soloFloorOn,
        soloFloorDb,
        targetPhase,
      },
    };
  }

  /**
   * 4D(b): the gate floor became taper-aware, which moves the xo windows of
   * every project made before it. Say so on open rather than applying it
   * silently — the numbers a designer remembers should not change without a
   * sentence explaining why.
   */
  function gateFloorShiftNote(gateMs: number | null): string | null {
    if (!gateMs || !(gateMs > 0)) return null;
    const before = 2000 / gateMs;
    const after = dataFloorFromGateMs(gateMs) ?? before;
    if (Math.abs(after - before) < 1) return null;
    return (
      `Gate floor moved ${Math.round(before)} → ${Math.round(after)} Hz: the ` +
      `${gateMs.toFixed(2)} ms gate is tapered (Tukey ${DEFAULT_GATE_TAPER_ALPHA} on the right), ` +
      `so its coherent duration is ${((1 - DEFAULT_GATE_TAPER_ALPHA / 2) * gateMs).toFixed(2)} ms. ` +
      `Crossover windows below that frequency were resting on resolution the measurement does ` +
      `not have.`
    );
  }

  function applyProject(state: ProjectState) {
    phaseAutoSkip.current = true; // restored phaseMode wins over the auto-switch
    offsetAutoSkip.current = true; // restored offset wins over the auto-fill
    const toLoaded = (f?: StoredFile): Loaded | null =>
      f ? { name: f.name, raw: f.raw, frd: parseFrd(f.raw) } : null;
    setWoofer(toLoaded(state.woofer));
    setMidDrv(toLoaded(state.mid));
    setTweeter(toLoaded(state.tweeter));
    if (state.vxp && state.impedances) {
      const impedances: Record<string, ParsedZma> = {};
      for (const [model, f] of Object.entries(state.impedances)) {
        impedances[model] = parseZma(f.raw);
      }
      setProject({
        vxp: parseVxp(state.vxp.raw),
        vxpFile: state.vxp,
        impedances,
        impedanceFiles: state.impedances,
      });
    } else {
      setProject(null);
    }
    // Standalone per-branch ZMAs by ROLE (v2 format; v1 files arrive here
    // already migrated by deserializeProject).
    const zRestored: typeof zStandalone = {};
    for (const role of ['low', 'mid', 'high'] as const) {
      const f = state.zByRole?.[role];
      if (f) zRestored[role] = { file: f, zma: parseZma(f.raw) };
    }
    setZStandalone(zRestored);
    if (state.angleFiles) {
      const toEntries = (files: { hor: number; name: string; raw: string }[]): AngleEntry[] =>
        files.map((f) => ({ ...f, frd: parseFrd(f.raw) }));
      const mid = toEntries(state.angleFiles.mid ?? []);
      setAngleSets({
        woofer: toEntries(state.angleFiles.woofer ?? []),
        tweeter: toEntries(state.angleFiles.tweeter ?? []),
        ...(mid.length > 0 ? { mid } : {}),
      });
    } else {
      setAngleSets(null);
    }
    setFileNotes(state.fileNotes ?? {});
    {
      // The list is authoritative when present; older files carry one slot.
      const files = state.verifyFiles ?? (state.verifyFile ? [state.verifyFile] : []);
      const parsed: VerifyEntry[] = [];
      for (const f of files) {
        try {
          parsed.push({ name: f.name, raw: f.raw, frd: parseFrd(f.raw) });
        } catch {
          // A measurement that no longer parses is dropped, not fatal.
        }
      }
      setVerifyList(parsed);
      setVerifyIx(Math.min(state.verifyActive ?? 0, Math.max(0, parsed.length - 1)));
    }
    setNearField(() => {
      const base: Record<BranchRole, NearFieldSlot> = {
        low: emptyNearField(),
        mid: emptyNearField(),
        high: emptyNearField(),
      };
      for (const r of ['low', 'mid', 'high'] as BranchRole[]) {
        const n = state.nearField?.[r];
        if (!n) continue;
        base[r] = {
          cone: n.cone ?? null,
          port: n.port ?? null,
          portDiaMm: n.portDiaMm ?? '',
          transitionHz: n.transitionHz ?? '',
          blendOctaves: n.blendOctaves ?? '1',
          stepOn: n.stepOn ?? true,
          stepDepthDb: n.stepDepthDb ?? '6',
        };
      }
      return base;
    });
    const d = state.design;
    const saneVf = sanitizePassiveSpecs(d.vFilters);
    setVFilters({ ...saneVf, mid: saneVf.mid ?? defaultVFilters().mid });
    setXoName(d.xoName);
    setOffsetMm(d.offsetMm);
    setTrimDb(d.trimDb);
    setInverted(d.inverted);
    setMidOffsetMm(d.midOffsetMm ?? '0');
    setMidTrimDb(d.midTrimDb ?? '0');
    setMidInverted(d.midInverted ?? false);
    setFMin(d.fMin);
    setFMax(d.fMax);
    setSplMin(d.splMin);
    setSplMax(d.splMax);
    setPhasePriority(d.phasePriority);
    setVfEqBands(d.vfEqBands);
    setPhaseMode(d.phaseMode ?? 'measured');
    setDirWeight(d.dirWeight ?? 25);
    setAmpTarget(d.ampTarget ?? 'onAxis');
    setSonogramMode(d.sonogramMode ?? 'normalized');
    // Tabs; a legacy single-schematic file becomes one tab.
    const restored: NetworkDesign[] =
      d.networkDesigns ??
      (d.schematic ? [{ id: 'legacy', name: 'Network', parts: d.schematic.parts }] : []);
    setDesigns(restored);
    setActiveDesignId(
      restored.some((x) => x.id === d.activeDesignId)
        ? d.activeDesignId!
        : restored.length > 0
          ? restored[restored.length - 1].id
          : null,
    );
    setSchHistory([]);
    setSchFuture([]);
    setLastSavedId(restored.some((x) => x.id === d.lastSavedDesignId) ? d.lastSavedDesignId! : null);
    setNetworkActive((d.networkActive ?? false) && restored.length > 0);
    setVfBypass(d.vfBypass ?? false);
    // d.vfCutOnly is ignored: the tool is passive-only, cut-only is not optional.
    setCatalogSnap(d.catalogSnap ?? true);
    setBreakupGuard(d.breakupGuard ?? true);
    // Absent means OFF, and it always will: the experimental engine is an
    // opt-in, so a project that never mentions it must open exactly as it did
    // before the flag existed.
    setEngineV2Enabled(d.engineV2Enabled === true);
    setEngineV2Settings({
      verticalWindowDeg: d.engineV2?.verticalWindowDeg ?? '',
      amplifierPowerW: d.engineV2?.amplifierPowerW ?? '',
      maxDissipationPct: d.engineV2?.maxDissipationPct ?? '',
      minEpdrOhm: d.engineV2?.minEpdrOhm ?? '',
      maxDriveOnFsDb: d.engineV2?.maxDriveOnFsDb ?? '',
      lfBumpBudgetDb: d.engineV2?.lfBumpBudgetDb ?? '',
      qesMultiplierMax: d.engineV2?.qesMultiplierMax ?? '',
      dampingMarginDb: d.engineV2?.dampingMarginDb ?? '',
      runSeed: d.engineV2?.runSeed ?? '',
      runBudgetEvals: d.engineV2?.runBudgetEvals ?? '',
      splWindowPlusMinusDb: d.engineV2?.splWindowPlusMinusDb ?? '',
      maxPhaseTrackingDeg: d.engineV2?.maxPhaseTrackingDeg ?? '',
      shortlistSize: d.engineV2?.shortlistSize ?? '',
      amplifierPeakPowerW: d.engineV2?.amplifierPeakPowerW ?? '',
      amplifierNominalLoadOhm: d.engineV2?.amplifierNominalLoadOhm ?? '',
      xmaxMarginFraction: d.engineV2?.xmaxMarginFraction ?? '',
      resistorClassW: d.engineV2?.resistorClassW ?? '',
      resistorPowerMargin: d.engineV2?.resistorPowerMargin ?? '',
      coilClassA: d.engineV2?.coilClassA ?? '',
      resistorThermalPowerW: d.engineV2?.resistorThermalPowerW ?? '',
      lowestWayLevelWork: d.engineV2?.lowestWayLevelWork ?? '',
      lowestWaySeriesRMaxOhm: d.engineV2?.lowestWaySeriesRMaxOhm ?? '',
    });
    // A5a metadata (F3b). Additive: a project from before F3b has no block and
    // every field falls back to '', which is what "not stated" means (P4).
    const meas = d.v2Measurement;
    const restoreMeas = (role: BranchRole): V2MeasurementMeta => ({
      ...emptyV2Meas(),
      ...(meas?.[role] ?? {}),
    });
    setV2Meas({ low: restoreMeas('low'), mid: restoreMeas('mid'), high: restoreMeas('high') });
    setXoRangeOn(d.xoRangeOn ?? false);
    // Legacy lo/hi range migrates to centre ± margin.
    if (d.xoFreqHz !== undefined) {
      setXoFreqHz(d.xoFreqHz);
      setXoMarginHz(d.xoMarginHz ?? V1_PIN_DEFAULTS_LEGACY.highMarginHz);
      setXoScanSteps(d.xoScanSteps ?? 3);
      setXo3Steps(d.xo3Steps ?? 2);
    } else if (d.xoRangeLo !== undefined || d.xoRangeHi !== undefined) {
      const lo = Number(d.xoRangeLo) || V1_PIN_DEFAULTS_LEGACY.legacyRangeLoHz;
      const hi = Number(d.xoRangeHi) || V1_PIN_DEFAULTS_LEGACY.legacyRangeHiHz;
      setXoFreqHz(String(Math.round((lo + hi) / 2)));
      setXoMarginHz(String(Math.round(Math.abs(hi - lo) / 2)));
    } else {
      setXoFreqHz(V1_PIN_DEFAULTS_LEGACY.highFreqHz);
      setXoMarginHz(V1_PIN_DEFAULTS_LEGACY.highMarginHz);
    }
    setHpLpPref(d.hpLpPref ?? 'auto');
    setHpLpPrefLow(d.hpLpPrefLow ?? 'auto');
    setPhaseMetricMode(d.phaseMetric ?? 'band');
    setAcSlopeMid(d.acSlopeMid ?? '24');
    setAcSlopeTweeter(d.acSlopeTweeter ?? '12');
    setAcSlopeWoofer(d.acSlopeWoofer ?? '24');
    setAcSlopeMidHp(d.acSlopeMidHp ?? '24');
    setXoLowFreqHz(d.xoLowFreqHz ?? V1_PIN_DEFAULTS_LEGACY.lowFreqHz);
    setXoLowMarginHz(d.xoLowMarginHz ?? V1_PIN_DEFAULTS_LEGACY.lowMarginHz);
    setMidSizeInch(d.midSizeInch ?? '');
    setWooferSizeInch(d.wooferSizeInch ?? '');
    setKaTier((d.kaTier as KaTier) in KA_TIERS ? (d.kaTier as KaTier) : 'measured');
    setCabinet(mergeCabinet(d.cabinet));
    setCtcK(d.ctcK ?? '0.5');
    setSeatTiming(d.seatTiming ?? false);
    setBreakupLimitOn(d.breakupLimitOn ?? true);
    setBreakupHarmonic(d.breakupHarmonic ?? '3');
    setSdCm2({ low: d.sdCm2?.low ?? '', mid: d.sdCm2?.mid ?? '', high: d.sdCm2?.high ?? '' });
    setXmaxMm({ low: d.xmaxMm?.low ?? '', mid: d.xmaxMm?.mid ?? '', high: d.xmaxMm?.high ?? '' });
    setExcursionSpl(d.excursionSpl ?? '96');
    setSnapProfile(d.snapProfile ?? 'auto');
    setSnapSeriesL(d.snapSeriesL ?? 'auto');
    setSnapSeriesC(d.snapSeriesC ?? 'auto');
    setSnapSeriesR(d.snapSeriesR ?? 'auto');
    setSnapStacks(d.snapStacks ?? true);
    setSnapBoundToSeries(d.snapBoundToSeries ?? false);
    setStagedOn(d.stagedOn ?? true);
    setTargetRipple(d.targetRipple ?? '2.5');
    setSoloSensDb(d.soloSensDb ?? '6');
    setSoloFloorOn(d.soloFloorOn ?? false);
    setSoloFloorDb(d.soloFloorDb ?? '');
    setTargetPhase(d.targetPhase ?? '15');
  }

  function saveProject() {
    const blob = new Blob([serializeProject(snapshot())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${new Date().toISOString().slice(0, 10)}-acoustic-design.adsproj.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function loadProjectFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await loadProjectFile(file);
  }

  async function loadProjectFile(file: File) {
    setError(null);
    try {
      const state = deserializeProject(await file.text());
      applyProject(state);
      // 4D(b): if this project's crossover windows move because the gate floor
      // is now taper-aware, say so on open. Never silently.
      const gm = Number(state.design?.cabinet?.gateMs);
      const shift = gateFloorShiftNote(Number.isFinite(gm) && gm > 0 ? gm : null);
      setPersistNote(
        `${t('Loaded {name}', { name: file.name })}${shift ? ` · ⚠ ${shift}` : ''}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Restore autosave once on mount. A blob that fails to restore is moved
  // aside, NEVER deleted — a transient code bug must not destroy data.
  useEffect(() => {
    // Blank slate (fresh visit or after Reset) — guide the user in: auto-open
    // the wizard on its import step so the first thing they see is "load your
    // measurements", not an empty canvas. Cancel dismisses it.
    // TRUE first contact is the exception: there the welcome card is the
    // conductor (it routes INTO the wizard on request) — opening both at once
    // stacks two dialogs, which is exactly the four-onboarding-surfaces-and-
    // no-regie problem the card exists to solve.
    const openWizardForEmpty = () => {
      if (!localStorage.getItem('ads-welcomed')) return;
      setWizardStep(0);
      setWizardOpen(true);
    };
    const stored = localStorage.getItem(AUTOSAVE_KEY);
    if (!stored) {
      openWizardForEmpty();
      return;
    }
    // Async because the payload may be gzipped (see packForStorage); plain
    // text from before that change still reads through unchanged.
    void (async () => {
      let text: string;
      try {
        text = await unpackFromStorage(stored);
      } catch {
        text = stored;
      }
      try {
        applyProject(deserializeProject(text));
        setPersistNote(t('Restored from autosave'));
      } catch {
        try {
          localStorage.setItem(`${AUTOSAVE_KEY}-unreadable`, stored);
        } catch {
          // No room to keep it aside; leave the original in place instead.
          return;
        }
        localStorage.removeItem(AUTOSAVE_KEY);
        setUnreadableBackup(text);
        setPersistNote(t('Autosave could not be restored — kept aside as backup'));
        openWizardForEmpty();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave on every meaningful change.
  useEffect(() => {
    const timer = setTimeout(() => {
      // Never overwrite a real autosave with an EMPTY session (e.g. a mount
      // where restore failed): only save once something is actually loaded.
      const s = snapshot();
      if (!s.woofer && !s.tweeter && !s.vxp && !s.impedances && (s.design.networkDesigns?.length ?? 0) === 0) return;
      void storeCompressed(AUTOSAVE_KEY, serializeProject(s), t('Autosave'));
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woofer, midDrv, tweeter, project, zStandalone, angleSets, fileNotes, verifyList, verifyIx, vFilters, xoName, offsetMm, trimDb, inverted, midOffsetMm, midTrimDb, midInverted, fMin, fMax, splMin, splMax, phasePriority, vfEqBands, phaseMode, dirWeight, ampTarget, sonogramMode, designs, activeDesignId, lastSavedId, networkActive, vfBypass, catalogSnap, breakupGuard, xoRangeOn, xoFreqHz, xoMarginHz, xoScanSteps, xo3Steps, hpLpPref, hpLpPrefLow, phaseMetricMode, acSlopeMid, acSlopeTweeter, acSlopeWoofer, acSlopeMidHp, xoLowFreqHz, xoLowMarginHz, midSizeInch, wooferSizeInch, kaTier, cabinet, nearField, ctcK, seatTiming, breakupLimitOn, breakupHarmonic, sdCm2, xmaxMm, excursionSpl, snapProfile, snapSeriesL, snapSeriesC, snapSeriesR, snapStacks, snapBoundToSeries, stagedOn, engineV2Enabled, engineV2Settings, v2Meas, targetRipple, targetPhase, soloSensDb, soloFloorOn, soloFloorDb]);

  function resetProject() {
    localStorage.removeItem(AUTOSAVE_KEY);
    window.location.reload();
  }

  /** Back to the clean starting point: filters off, optimizer state cleared.
   *  Measurements, crossover selection and physical offsets stay untouched. */
  function resetVirtualFilters() {
    setVFilters(defaultVFilters());
    setInverted(false);
    setVfOpt(null);
    setVfRunStats(null);
    setVfError(null);
  }

  /**
   * One click, the real best: run the optimizer in ROUNDS, each seeded with
   * the best result so far (what repeated manual clicks used to do), until a
   * round no longer improves ≥1%, with a round/time cap. Between rounds the
   * UI paints a live counter (round + total network simulations), so a long
   * run reads as work, not a hang.
   */
  /**
   * B2 ENFORCEMENT. Loading and showing data whose band is unknown is fine —
   * refusing to open a project is worse than a weak band. Fitting on it is
   * not: there the band is the difference between a measurement and a number.
   *
   * Returns the message to show, or null when the run may proceed.
   */
  function refuseIfUnverified(): string | null {
    if (unverifiedSources.length === 0) return null;
    return unverifiedSources.map((s) => s!.meta.unverifiedReason).join(' · ');
  }

  /**
   * `runOpts.acknowledgedWindowNotice` — the designer has already seen the
   * pre-start estimate for this run and said start anyway (F3b, deliverable 3).
   */
  async function runVfOptimize(runOpts: { acknowledgedWindowNotice?: boolean } = {}) {
    const refusal = refuseIfUnverified();
    if (refusal) {
      setVfError(`Cannot optimise yet — ${refusal}`);
      return;
    }
    // THREE-WAY path (trede 4c): the staged 2D chain — textbook LR4 targets
    // + measured level trims per (low, high) handover candidate, per-branch
    // synthesis on each branch's own band, assembled TWO-PAIR tune, and the
    // amplifier-load verdict as a ranking gate. Runs over the worker pool.
    if (threeWay && sim && sim.mid && midDrv && result) {
      if (Object.keys(impedances).length < 3) {
        setVfError('3-way design needs all three measured impedances (.ZMA per driver).');
        return;
      }
      /* SHOW THE CARD BEFORE THE SETUP, not after it. Everything below this
       * line is synchronous main-thread work, and until it finishes React
       * cannot paint — so the busy card used to appear only once the heavy
       * part was already done. Every cheap refusal above has already run, so
       * nothing can strand the overlay here; a throw further down is caught at
       * the call site, which clears it. */
      setVfBusy(true);
      setVfError(null);
      setVfProgress(null);
      await nextPaint();
      const grid = result.freq;
      const zOnGrid = zGridWithSlots(impedances, grid);
      /* THE COST FUNCTION IS EVALUATED ON THE VALIDITY BAND (issue #14, A3d).
       *
       * This used to be derived from the GRID, which meant candidates were
       * generated from 508 Hz (the data floor) while their scores were computed
       * from 204 Hz — a fifth of the log bandwidth of ranking weight resting on
       * data the measurement's own gate says is not there. A candidate could
       * win by being better in a region that does not exist.
       *
       * No fallback to the grid: without a validity band there is nothing to
       * optimise ON, and refuseIfUnverified above has already stopped the run. */
      const band: [number, number] = evalBand
        ? [evalBand.fromHz, evalBand.toHz]
        : [Math.max(200, grid[0] * 1.02), Math.min(grid[grid.length - 1] * 0.975, num(fMax, 20000))];
      const safety = (() => {
        const present = [woofer, midDrv, tweeter].filter((d): d is Loaded => d !== null);
        const lo = Math.max(200, Math.min(...present.map((d) => d.frd.freq[0])));
        const hi = Math.min(20000, Math.max(...present.map((d) => d.frd.freq[d.frd.freq.length - 1])));
        if (!(hi > lo * 1.5)) return undefined;
        const sGrid = logspace(lo, hi, 240);
        const bandedOn = (l: Loaded): GriddedResponse => {
          const g = resample(l.frd.freq, l.frd.spl, l.frd.phase, sGrid, { clampEdges: true });
          const f0 = l.frd.freq[0];
          const f1 = l.frd.freq[l.frd.freq.length - 1];
          return {
            freq: sGrid,
            spl: g.spl.map((v, i) => (sGrid[i] < f0 || sGrid[i] > f1 ? SILENT_GHOST_DB : v)),
            phaseDeg: g.phaseDeg.map((v, i) => (sGrid[i] < f0 || sGrid[i] > f1 ? 0 : v)),
          };
        };
        return {
          freqs: sGrid,
          w: bandedOn(woofer!),
          t: bandedOn(tweeter!),
          m: bandedOn(midDrv),
          z: zGridWithSlots(impedances, sGrid),
        };
      })();
      // The design on screen is the bar: measure it BEFORE the scan overwrites
      // Working, so the table can say "no candidate beat what you had".
      setScanReference(
        activeDesign && networkActive
          ? measureReferenceDesign([...activeDesign.parts], grid, zOnGrid, safety)
          : null,
      );
      // Rule 1 beats rule 7 (xoWindow.ts): a pin that dips under the data
      // floor is clamped to it — the physWin3 banner already says so — and the
      // clamped pin is what the chain cages and judges against.
      /* WHICH ENGINE THIS SCAN RUNS ON, decided once and read from here down.
       * It used to be settled two hundred lines lower, which was fine while the
       * only thing it changed was where the candidates were sent; since F4d it
       * also decides who MAKES them, and the first thing that depends on it is
       * the pin two lines below. */
      const useV2 = engineSelection.optimizer === 'v2';
      const pinsRaw = xoPinsValue();
      // F4b — a substituted or refused pin is a fact about the run, so it is
      // reported rather than left to be inferred from the delivered crossings.
      setV2RunNotes(
        useV2
          ? [
              /* UI-1 — WHICH VOICING THIS RUN SEARCHED AGAINST, said out loud
               * at the top of its own notes. Since V45 the target curve steers
               * the AMPLITUDE TERM as well as the window and the RMS, so it is
               * the most consequential setting in the run that leaves no trace
               * in a number; two runs that differ only in it look identical
               * everywhere except in the stamp. `describeTargetCurve` is the
               * one function that knows the vocabulary — including which half
               * of a stated plateau failed to arrive. */
              `Voicing (A5e.2): ${describeTargetCurve(activeTargetCurve)}. Every window, RMS and ` +
                'amplitude term in this run is measured against it.',
              ...pinsRaw.notes,
            ]
          : [],
      );
      /* THE v1 DATA-FLOOR CLAMP, AND WHY IT IS NOW v1-ONLY (F4d, audit §6.3).
       *
       * A pin that dips under the v1 data floor is REPLACED here by the v1
       * window — a substitution the designer sees only as a banner about
       * something else. Measured live on the KOAN project: a recommended
       * 396.7–448.5 Hz became 707–728 Hz, after which the pre-start estimate
       * correctly reported four of four candidates outside the A5d.3 window.
       * The estimate was right and the cause was here.
       *
       * The two floors are both defensible and they answer DIFFERENT questions
       * — where a response may be believed (A5b.1, the measurement's own
       * window) and where a handover may sit (the near-field/far-field splice
       * blend). What was not defensible is one of them winning because it comes
       * first in the pipeline. So on the v2 route nothing is clamped: the
       * candidates are generated against the A5d.3 floor and the v1 floor is
       * reported beside it as a counter-judgement the designer reads
       * (`floorComparison.ts`, and the block below). On the v1 route this is
       * byte-identical to what it always did. */
      const clampPin = (
        pin: { freq: number; margin: number } | undefined,
        win: { floorHz: number | null; ceilHz: number | null; userClampedByData: boolean } | undefined,
      ) => {
        if (useV2) return pin;
        if (!pin || !win || !win.userClampedByData || win.floorHz === null) return pin;
        const lo = win.floorHz;
        const hi = Math.max(win.ceilHz ?? lo, lo * 1.02);
        return { freq: (lo + hi) / 2, margin: (hi - lo) / 2 };
      };
      const pins = {
        low: clampPin(pinsRaw.low, physWin3?.win.low),
        high: clampPin(pinsRaw.high, physWin3?.win.high),
      };
      const settings = {
        phasePriority: phasePriority / 100,
        targets: stagedOn
          ? { rippleDb: rippleTargetEff(), phaseDeg: num(targetPhase, 10) }
          : undefined,
        acousticSlopes: acousticSlopesValue(),
        xoLowPin: pins.low,
        xoHighPin: pins.high,
        hpFloorHz: tweeterHpFloor ?? undefined,
        structureLow: parseHpLpPref(hpLpPrefLow),
        structureHigh: parseHpLpPref(hpLpPref),
        breakupGuard,
        eqBands: vfEqBands,
        // Directivity into the structure search (3-way): anchors from the
        // measured angle sets, weight from settings; without angle data the
        // structure choice stays on-axis and the ⚙ readout says so.
        diAnchorHz: physWin3?.angleSets ? physWin3.diAnchor : undefined,
        diWeight,
        // (fix 2) PHYSICS floors per handover — fs·K / excursion / reach of
        // the upper driver, never the data floor: bound for design + tune,
        // and the delivery is judged against them (warn ≤5 % under, else
        // disqualified).
        xoFloorPairs: (['low', 'high'] as const).map((side) => {
          const w = physWin3?.win[side];
          if (!w) return null;
          const fl = w.limits.filter((l) => l.side === 'floor' && (l.rule === 'fs' || l.rule === 'excursion' || l.rule === 'reach') && !l.overridden);
          return fl.length ? Math.max(...fl.map((l) => l.hz)) : null;
        }),
        rSourceDisqualifyOhm: rSourceDisqOhm,
        directivityWeight: dirWeight / 100,
        powerMetric,
        powerFoldWeight,
        errorSmoothOct,
      costWeight,
        dissipationWeight,
        ampMinLoadOhm: ampMinLoadOhm ?? undefined,
        audit: {
          thresholds: { rSourceOhm: rSourceLimitOhm },
          fbHz: Number(cabinet.drivers.low.fbHz) > 0 ? Number(cabinet.drivers.low.fbHz) : undefined,
        },
        ampTarget,
        phaseMetric: phaseMetricMode,
        synthMode,
        catalogSnap: catalogSnap && hasImportedCatalog(),
        snapPrefs: snapPrefsValue(),
        band,
        safety,
      };
      const tAdj = branchAdj.tweeter;
      const mAdj = branchAdj.mid;
      // Banded per-branch angle sets (same treatment as the 0° branches) —
      // arms the in-room weight; without the mid's own set the term stays off.
      const angleSets3 = physWin3?.angleSets;
      const lowWin3 = physWin3?.low ?? { floorHz: midHpFloor, ceilHz: wooferXoCeiling };
      const highWin3 = physWin3?.high ?? { floorHz: tweeterHpFloor, ceilHz: midXoCeiling };
      // Warm start: the crossings of whatever design is in the sim right now
      // (the pair chips' overlap centres) — tried as an extra candidate when
      // they fall inside the windows.
      const warm3 = designShaped && pairScores
        ? {
            low: pairScores.low?.integ.overlapCentreHz ?? null,
            high: pairScores.high?.integ.overlapCentreHz ?? null,
          }
        : undefined;
      /* ================================================================ *
       * F4d — WHO MAKES THE CANDIDATES
       *
       * On the v1 route: `crossover3Variants`, unchanged, byte for byte.
       *
       * On the v2 route: the A5d pre-design layer. The audit's §6.1 said v2
       * "kan vetoën en rapporteren, het kan niet voorstellen" — this is where
       * it starts proposing. Positions are spread evenly in OCTAVE distance
       * across the recommended band (the A5d.3 window minus the worst lobing
       * zone), their number derived from the band's width and the smoothing the
       * acceptance judgement runs on, and the order per flank comes from the
       * A5d.3 derivation. Nothing lands outside a feasible window, which is why
       * the pre-start estimate below reports 0 of N on this route.
       *
       * The budget is the designer's own cost knob — the same "candidate steps
       * per axis" that means steps² chains on the v1 grid — and when the
       * derivation offers more than that, POSITIONS are thinned and never
       * ORDERS, with the thinning reported. A position is a sample; an order is
       * a choice.
       * ================================================================ */
      const v2Generated = (() => {
        if (!useV2) return null;
        const wis = engineV2Report?.report?.predesign.windowInputs ?? [];
        if (wis.length === 0) {
          /* NO WINDOWS, SO NO FIELD — and the fallback to the v1 generator is
           * said out loud rather than taken quietly. This is the state where a
           * designer would otherwise get v1 candidates under a v2 stamp and
           * have no way to tell: the report could not be built, or it holds
           * fewer than two branches, and either way A5d has nothing to propose
           * from. Absence is not a verdict (P4), and neither is it a licence. */
          setV2RunNotes((prev) => [
            ...prev,
            'No A5d.3 windows could be derived, so the v2 candidate generator produced nothing and ' +
              'the candidates below come from the v1 generator instead. That is a fallback, not a ' +
              'v2 field: check that the report panel has a window for each adjacent pair.',
          ]);
          return null;
        }
        const slopes = settings.acousticSlopes;
        const curveOfDriver = (driver: string) => {
          const role = (['low', 'mid', 'high'] as const).find(
            (r) => engineV2Report?.driverIds?.[r] === driver,
          );
          const g =
            role === 'low' ? sim.base.w : role === 'mid' ? sim.base.m : role === 'high' ? sim.base.t : null;
          return g ? { freq: g.freq, db: g.spl } : null;
        };
        return buildCandidateField({
          windowInputs: wis,
          alignments: AUTO_STRUCTS,
          chainBudget: Math.max(1, Math.round(scanSteps3)) ** wis.length,
          perPair: wis.map((wi, i) => ({
            /* The order the designer stated for this handover — read from the
             * SAME place the window already reads it (`orderByPair`, derived
             * from the acoustic slope settings), not from a second parse of
             * the alignment fields. A window computed at one order and a
             * candidate generated at another would be two answers to one
             * question. `NaN` is what the window treats as "not stated". */
            statedOrder: Number.isFinite(wi.order) ? wi.order : null,
            // M-C's stated limit arms A5d.3(ii). Absent = not armed (P4);
            // nothing here invents a protection budget. V50: the UPPER way's
            // own figure first, the single field as the fallback — the same
            // order the gate reads (`statedDriveLimitDb`).
            maxDriveOnFsDb: (() => {
              const role = (['low', 'mid', 'high'] as const).find(
                (r) => engineV2Report?.driverIds?.[r] === wi.upper,
              );
              const perWay = role ? driveOnFsMaxDbByRole[role] : undefined;
              return perWay ?? engineV2Gates.maxDriveOnFsDb ?? null;
            })(),
            lowerTargetSlopeDbPerOct:
              (i === 0 && wis.length > 1 ? slopes?.low?.lower : slopes?.mid) ?? null,
            upperTargetSlopeDbPerOct:
              (i === 0 && wis.length > 1 ? slopes?.low?.upper : slopes?.tweeter) ?? null,
            lowerCurve: curveOfDriver(wi.lower),
            upperCurve: curveOfDriver(wi.upper),
          })),
        });
      })();
      if (useV2) {
        /* V26 ROW 38 — the chain grid's lower edge, stated instead of silent.
         *
         * The grid is built from the measurement extents and the designer's
         * fMin field, whose fallback is a v1 project number. F4b2 measured what
         * that cost: the LF-lift inversion, evaluated on that grid, delivered a
         * ceiling of a thousand henries, and F4b2 closed it by crossing the
         * driver's own sweep. What is left is not a leak but a silence — the
         * search still runs on a grid whose bottom edge nobody attributed.
         *
         * F4d states it rather than moves it, and the reason is scope: the grid
         * is `sim`, which every plot on this screen draws from, so moving it
         * would change the reporting surfaces too. The judged BAND is clipped
         * to measurement validity already (audit §5), so nothing is scored down
         * there; this note is about where the search may look. */
        const gridFloor = grid[0];
        const lowestWindowFloor = v2Generated
          ? Math.min(
              ...v2Generated.field.axes.flatMap((a) =>
                Object.values(a.window).map((w) => w.floorHz ?? Infinity),
              ),
            )
          : Infinity;
        const gridNote =
          Number.isFinite(lowestWindowFloor) && gridFloor < lowestWindowFloor
            ? [
                `The analysis grid starts at ${Math.round(gridFloor)} Hz while the lowest A5d.3 ` +
                  `window floor is ${Math.round(lowestWindowFloor)} Hz. No candidate was placed ` +
                  'below that floor and the judged band is clipped to measurement validity, so ' +
                  'nothing is scored down there — but the grid edge itself comes from the ' +
                  'measurement extents and the fMin field rather than from a derived floor, and ' +
                  'that is stated here rather than left to be noticed (casebook V26 row 38).',
              ]
            : [];
        const lines = [
          ...gridNote,
          ...v2Floors.flatMap((f) => [f.message, f.warning].filter((x): x is string => !!x)),
          ...(v2Generated?.orders.flatMap((o) => [...o.why, ...o.notes]) ?? []),
          ...(v2Generated?.field.axes.flatMap((a) => a.notes) ?? []),
          ...(v2Generated?.field.refusals ?? []),
          ...(v2Generated?.field.notes ?? []),
        ];
        if (lines.length > 0) setV2RunNotes((prev) => [...prev, ...lines]);
      }
      const v2Candidates: GeneratedCandidate[] = v2Generated?.field.candidates ?? [];
      const variants = v2Generated
        ? v2Candidates.map((c) => ({
            label: c.label,
            xoLow: c.crossings[0].hz,
            xoHigh: c.crossings[c.crossings.length - 1].hz,
            xoLowRange: c.crossings[0].cageHz,
            xoHighRange: c.crossings[c.crossings.length - 1].cageHz,
          }))
        : crossover3Variants(
            sim.base.w,
            sim.base.m!,
            sim.base.t,
            pins,
            tweeterHpFloor ?? undefined,
            scanSteps3,
            lowWin3,
            highWin3,
            warm3,
            physWin3?.diAnchor,
          );
      /* DELIVERABLE 3 — the pre-start estimate.
       *
       * Counted on the candidate list that is ABOUT TO RUN, not on a
       * reactive reconstruction of it: two constructions of the same grid is
       * two opinions about what is about to happen, and the estimate is only
       * worth anything if it is about the real thing.
       *
       * It STOPS NOTHING. No candidate is skipped, none is clamped, and
       * "start anyway" is an ordinary button rather than a confirmation of
       * something dangerous — a crossing outside the window is a design the
       * measurements say will be fighting its drivers, which is a thing a
       * designer sometimes does on purpose and always wants to know first.
       * The setup above runs again on "start anyway"; that is a few hundred
       * milliseconds, and the alternative is a preview that can drift from
       * the run it previews. */
      if (v2Windows && !runOpts.acknowledgedWindowNotice) {
        const estimate = candidatesOutsideWindows(
          variants.map((v) => ({ label: v.label, hz: [v.xoLow, v.xoHigh] })),
          /* F3c: the estimate counts against the recommended band as well,
           * as a SECOND and weaker line. `effectiveHz` rather than the
           * segments, so the fallback (worst zone over the whole window)
           * counts as "the whole window is recommended" instead of as "no
           * band exists". Informative either way: "start anyway" stays the
           * ordinary button it was. */
          [
            {
              pairLabel: v2PairLabel('low'),
              window: v2Windows.low,
              recommendedHz: v2Recommended('low')?.effectiveHz ?? null,
            },
            {
              pairLabel: v2PairLabel('high'),
              window: v2Windows.high,
              recommendedHz: v2Recommended('high')?.effectiveHz ?? null,
            },
          ],
        );
        if (estimate.message) {
          setVfBusy(false);
          setV2PreStart({
            message: estimate.message,
            proceed: () => {
              setV2PreStart(null);
              void runVfOptimize({ acknowledgedWindowNotice: true }).catch((e) => {
                setVfBusy(false);
                setVfError(String((e as Error).message ?? e));
              });
            },
          });
          return;
        }
      }

      // What the DELIVERED crossings are judged against in the ranking: a pin
      // is the designer's promise; a measured physics window is the drivers'.
      // The candidate cage stays bookkeeping — see judgeWindows in the chain.
      //
      // A DEGENERATE window (floor at or above ceiling — "no room") judges
      // NOTHING: every crossing fails a window that does not exist, which is
      // how Sanders' ka-2 run came back with a warning glyph on all nine
      // rows. The scan already falls back to the level anchors for its
      // candidates; the broken premise must be said out loud instead
      // (signaleren, nooit een tweede stille beslissing).
      const sane = (win: { floorHz?: number | null; ceilHz?: number | null } | null) =>
        win && win.floorHz != null && win.ceilHz != null && win.floorHz >= win.ceilHz
          ? null
          : win;
      const judgeWindows = {
        low: pins.low
          ? { floorHz: pins.low.freq - pins.low.margin, ceilHz: pins.low.freq + pins.low.margin }
          : sane(lowWin3),
        high: pins.high
          ? { floorHz: pins.high.freq - pins.high.margin, ceilHz: pins.high.freq + pins.high.margin }
          : sane(highWin3),
      };
      const brokenWindows = (
        [
          ['W-M', lowWin3, pins.low],
          ['M-T', highWin3, pins.high],
        ] as const
      )
        .filter(([, w2, pin]) => !pin && w2 && sane(w2) === null)
        .map(
          ([naam, w2]) =>
            `⚠ ${naam} physics window has NO ROOM (${Math.round(w2!.floorHz!)}–` +
            `${Math.round(w2!.ceilHz!)} Hz) — the scan fell back to the level-crossing ` +
            `anchors and the delivered crossings cannot be judged on this axis. Check the ` +
            `Driver limits (the measured 4 dB beaming tier is the default for a reason), ` +
            `or pin this crossing yourself.`,
        );
      /* ONE CONSTRUCTION OF A CHAIN INPUT, used by both scan modes.
       *
       * On the v2 route the candidate overrides two things in `settings` and
       * nothing else: the ALIGNMENT per handover (its derived order, so the
       * design step's enumeration is bound to what A5d.3 asked for — V26 row
       * 39, where 'auto' left the order undeclared) and the handover FLOORS,
       * which become the A5d.3 window floors instead of the v1 physics floors.
       * The second is the whole of audit §6.3 in one line: the floor that
       * steers is stated, and the other one is reported beside it. */
      const chainInputFor = (v: Chain3Variant, cand?: GeneratedCandidate): Chain3Input => {
        const alignmentOf = (i: number): StructChoice | undefined => {
          const x = cand?.crossings[i];
          return x ? { kind: x.alignment.kind as FilterKind, order: x.alignment.order as 1 | 2 | 3 | 4 } : undefined;
        };
        const perCandidate = cand
          ? {
              structureLow: alignmentOf(0) ?? settings.structureLow,
              structureHigh: alignmentOf(cand.crossings.length - 1) ?? settings.structureHigh,
              xoFloorPairs: cand.crossings.map((x) => x.windowHz[0]),
            }
          : {};
        return {
          grid: [...grid],
          w: sim.base.w,
          m: sim.base.m!,
          t: sim.base.t,
          driverZ: zOnGrid,
          angleData: angleSets3,
          tAdjust: tAdj,
          midAdjust: mAdj,
          xoLow: v.xoLow,
          xoHigh: v.xoHigh,
          xoLowRange: v.xoLowRange,
          xoHighRange: v.xoHighRange,
          judgeWindows,
          label: v.label,
          settings: { ...settings, ...perCandidate },
        };
      };
      /* V41 — the CHAIN-level half of the declaration, built once because it is
       * a property of the RUN and not of one handover pair: `eqBands` bounds
       * what the design step may propose on every branch and `leanTargetDb`
       * what the synthesis step will build on every branch. The designer's own
       * EQ setting is stated (it is a setting they can see and change); the
       * lean threshold is not a setting anywhere, so the derivation supplies
       * `synthesize`'s own default rather than the staged pass's stop goal. */
      const chainDecl = declareCandidateChainChoices({
        stated: { eqBands: settings.eqBands },
        /* V51 — the third chain key, derived from the stated requirement:
         * 'none' when the designer forbids level work on the lowest way,
         * ABSENT otherwise (never a stated 'allowed' — P4). V51b — a stated
         * maximum derives the capped state instead. */
        ...(engineV2Gates.lowestWayLevelWork === 'none' ? { lowestWayLevelWorkForbidden: true } : {}),
        ...(seriesRMaxOhmOf(engineV2Gates.lowestWayLevelWork) !== null
          ? { lowestWaySeriesRMaxOhm: seriesRMaxOhmOf(engineV2Gates.lowestWayLevelWork)! }
          : {}),
      });
      /* A5e.3 — the coil family per way keyed by MODEL, what the worker's
       * `driverZ` is keyed by (the same re-keying the M-C figures use). */
      const coilFamilyByModel: Record<string, string> = Object.fromEntries(
        (Object.entries(coilFamilyByRole) as [BranchRole, string][]).map(([r, v]) => [canonicalModelForRole(r, threeWay), v]),
      );
      /** The A5d declaration that travels beside one generated candidate. */
      const declarationFor = (cand: GeneratedCandidate, input: Chain3Input) => ({
        declaration: declareCandidateChoices({
          cages: cand.crossings.map((x) => x.cageHz),
          windowFloorsHz: cand.crossings.map((x) => x.windowHz[0]),
          multiWay: true,
          stated: {
            band: input.settings.band,
            acousticSlopes: input.settings.acousticSlopes,
            staged: input.settings.targets,
            ampTarget: input.settings.ampTarget,
            powerMetric: input.settings.powerMetric,
            phaseMetric: input.settings.phaseMetric,
            catalogSnap: input.settings.catalogSnap,
            snapPrefs: input.settings.snapPrefs,
            breakupGuard: input.settings.breakupGuard,
            safety: input.settings.safety,
            audit: input.settings.audit,
            loadFloor: input.settings.loadFloor,
            ampMinLoadOhm: input.settings.ampMinLoadOhm,
            rSourceDisqualifyOhm: input.settings.rSourceDisqualifyOhm,
            // The chain sets this itself, with a stated reason ("the seed here
            // is OUR OWN synthesis"). Restated rather than inherited: the value
            // is identical, and F4c's whole point is that a value nobody names
            // is indistinguishable from a decision.
            zFloorStrict: true,
          },
          /* A5e.2/V45 — the design's own voicing, so the candidate can declare
           * WHAT the amplitude term is flat against. The same object the
           * shortlist judges the window and the RMS against; handing the
           * declaration a different one would be the split V45 closed. */
          targetCurve: activeTargetCurve,
          /* V47 — the design's stated drive limit, so the candidate can declare
           * WHICH RULE forbids an unprotected upper driver. The limit itself
           * does not travel here: it is a gate and it crosses in
           * `v2.gates.maxDriveOnFsDb`, judged by the same machinery the panel
           * reads. Absent leaves the historic seed comparison in force (P4). */
          ...(engineV2Gates.maxDriveOnFsDb !== undefined
            ? { driveOnFsLimitDb: engineV2Gates.maxDriveOnFsDb }
            : {}),
          /* V50 — and the per-way figures, keyed by model like the gate. */
          ...(Object.keys(driveOnFsMaxDbByRole).length > 0
            ? {
                driveOnFsLimitDbByDriver: Object.fromEntries(
                  (Object.entries(driveOnFsMaxDbByRole) as [BranchRole, number][]).map(([r, v]) => [
                    canonicalModelForRole(r, threeWay),
                    v,
                  ]),
                ),
              }
            : {}),
          /* V49 — and whether the report derived an EXCURSION ceiling for any
           * way (M-C v2.0). That is an absolute requirement too, so the
           * candidate declares `protectionRule: 'stated'` on it even without a
           * stated dB figure. The ceilings themselves cross as a measured fact
           * in `v2Facts`, never through the declaration. */
          ...((engineV2Report?.report?.metrics.driveExcursion.length ?? 0) > 0
            ? { driveCeilingDerived: true }
            : {}),
          /* V48 — the design's stated LF-lift budget, so the candidate can
           * declare WHICH NETWORK the series-inductance ceiling describes. The
           * budget itself does not travel here: it crosses as
           * `v2.budgets.lfBumpBudgetDb` and is what `invertBudgets` inverts.
           * Absent leaves the ceiling solved at the seed (P4). */
          ...(engineV2Gates.lfBumpBudgetDb !== undefined
            ? { lfBumpBudgetDb: engineV2Gates.lfBumpBudgetDb }
            : {}),
          /* A5e.3 — the coil family per way, keyed by MODEL like the M-C
           * figures, and the loaded catalogue's fits, so the candidate can
           * declare WHAT PHYSICS its coils are judged on. Nothing stated =
           * nothing handed over = absent with the P4 reason. */
          ...(Object.keys(coilFamilyByModel).length > 0
            ? { coilDcrFamilyByWay: coilFamilyByModel, coilDcrFits, coilDcrCatalogLabel: coilCatalogLabel }
            : {}),
        }),
        chainDeclaration: chainDecl,
        provenance: cand.provenance,
        // V26 row 39: the HP flank of each way, keyed by model. The mid's high
        // pass belongs to the low handover and the tweeter's to the high one —
        // the convention `parseHpLpPref` documents.
        orderByModel: {
          mid: cand.crossings[0].order,
          tweeter: cand.crossings[cand.crossings.length - 1].order,
        },
      });
      const itemFor = (v: Chain3Variant, cand?: GeneratedCandidate) => {
        const input = chainInputFor(v, cand);
        return { input, ...(cand ? { candidate: declarationFor(cand, input) } : {}) };
      };
      const inputs = variants.map((v, i) => itemFor(v, v2Candidates[i]));
      /* THE AXIS-BY-AXIS SCAN IS A v1 CANDIDATE STRATEGY (F4d).
       *
       * It sweeps one handover with the other held at a level/DI anchor and
       * then refines around the pair — a way of GENERATING candidates, and on
       * the v2 route generation belongs to A5d. Running it there would put v1
       * candidates through the v2 tuner and undo the whole delivery, silently,
       * because the mode is a remembered UI setting rather than something the
       * designer picks per run. So it is skipped on the v2 route and said out
       * loud, rather than quietly producing the v1 field under a v2 stamp. */
      const axesOnV2 = useV2 && scan3Mode === 'axes' && !!v2Generated;
      if (axesOnV2) {
        setV2RunNotes((prev) => [
          ...prev,
          'The axis-by-axis scan was not used: it is a v1 way of GENERATING candidates (sweep one ' +
            'handover against an anchor, then refine), and on the v2 route the field comes from ' +
            'A5d. The candidates below are the generated field; switch the optimiser to v1 to use ' +
            'the axis sweep.',
        ]);
      }
      setVfBusy(true);
      setVfError(null);
      setVfProgress(null);
      setChainScan(null);
      setNetOptDiff(null);
      // A stamp on a table the run did not produce is worse than none.
      setV2Run(null);
      setV2Shortlist(null);
      setShortlistSort(null);
      /* UI-1 — and the row that WAS loaded is no longer a row of any list.
       * The design itself stays in the Working tab (a run in flight may not
       * take it away); what is cleared is the claim that it came from this
       * run's shortlist. */
      setShortlistPick(null);
      /* ---- Axis-by-axis scan (Sanders' proposal): W-M sweep with M-T held
       * at its anchor → M-T sweep with the best W-M → local 3×3 refinement
       * around the pair. Finer per axis than the corners grid for a
       * fraction of the chains (7+7+9 vs 49), and the refinement MEASURES
       * the coupling through the shared mid instead of assuming it away —
       * skipped when the two sweeps land within half a step of their aims.
       * Progress rows from finished rounds stay in the busy table. */
      const inputOf = (v: Chain3Variant) => chainInputFor(v);
      const rankAll = (rs: Chain3Result[]) =>
        rankChain3Results(rs, settings.targets, settings.phasePriority, angleSets3 ? settings.directivityWeight : 0, rSourceLimitOhm, bomCapEur, ampMinLoadOhm ?? 0);

      /* ---- F2b: WHICH ENGINE THIS SCAN RUNS ON --------------------------
       * The façade decides, once, here. With v2 selected the candidates go to
       * the v2 worker, which enforces the gates inside the polish and hands
       * back a verdict per candidate; with v1 selected this is the call the
       * app has always made, unchanged and unwrapped.
       *
       * The gate verdicts and the run stamp are collected as the rounds land,
       * so a partial field still carries the status that says it is partial. */
      /* F4b — THE MEASURED FACTS THAT CROSS THE BORDER (audit §4, leaks 1 and 2).
       *
       * `reOhmByModel` existed in the payload since F2 and was read by the
       * worker since F2, and nothing ever filled it: the worker fell back to
       * `estimateRe(curve)` with no options, which cannot run the motional fit
       * and therefore always produced the direct low-frequency reading. On the
       * casebook woofer that is 3.81 Ω against a resolved 2.90 Ω, with the
       * panel showing one number and the bound dividing by the other (V21).
       * The A5b.1 validity intervals never crossed at all, so the frozen
       * passbands were the whole analysis grid (V22).
       *
       * ONE SOURCE OF TRUTH: the ingest pass resolved both, this hands them
       * over, and the worker consumes rather than re-derives. The keys are
       * translated from the report's driver ids to the canonical model names
       * the worker's `driverZ` uses — the same bridge `driverSlots.ts` is for.
       * A missing report is not patched over: the worker's fallback is still
       * there, it says so in the notes, and the run fingerprint records it. */
      const v2Facts = (() => {
        const rep = engineV2Report?.report;
        if (!rep) return {};
        const modelByDriverId: Record<string, string> = {};
        /* F4b2 — the raw impedance sweeps, keyed the way the REPORT keys its
         * drivers. They go with the facts because A4 M-D evaluates around f_p,
         * which for a woofer sits below the chain's analysis grid entirely:
         * inverting on that grid does not refuse, it publishes a ceiling of a
         * thousand henries (V25). The report does not keep the curve — it keeps
         * the classification of it — so it is handed over from here, where it
         * was read from disk in the first place. */
        const sweepByDriverId: Record<
          string,
          { freq: readonly number[]; magnitude: readonly number[]; phaseDeg: readonly number[] }
        > = {};
        for (const role of ['low', 'mid', 'high'] as const) {
          const id = engineV2Report?.driverIds?.[role];
          if (id === undefined) continue;
          modelByDriverId[id] = canonicalModelForRole(role, threeWay);
          const zma =
            zStandalone[role]?.zma ?? impedances[canonicalModelForRole(role, threeWay)];
          if (zma) {
            sweepByDriverId[id] = {
              freq: zma.freq,
              magnitude: zma.magnitude,
              phaseDeg: zma.phase,
            };
          }
        }
        return factsForWorker(rep, modelByDriverId, sweepByDriverId);
      })();
      const v2GatesByLabel: Record<string, { verdicts: GateVerdict[]; violation: string | null }> = {};
      const v2Field: ShortlistInput<Chain3Result>[] = [];
      let v2Stamp: V2RunStamp | null = null;
      const v2ScanSettings = useV2
        ? {
            gates: {
              ...(engineV2Gates.maxDissipationFraction !== undefined
                ? { maxDissipationFraction: engineV2Gates.maxDissipationFraction }
                : {}),
              ...(engineV2Gates.minEpdrOhm !== undefined ? { minEpdrOhm: engineV2Gates.minEpdrOhm } : {}),
              ...(engineV2Gates.maxDriveOnFsDb !== undefined
                ? { maxDriveOnFsDb: engineV2Gates.maxDriveOnFsDb }
                : {}),
              /* V50 — the per-way figures, keyed by MODEL (what the worker's
               * `driverZ` is keyed by), and the buildability inputs. The peak
               * input the coil gate reads at is derived here from the same two
               * V49 fields the report derives it from. */
              ...(Object.keys(driveOnFsMaxDbByRole).length > 0
                ? {
                    maxDriveOnFsDbByDriver: Object.fromEntries(
                      (Object.entries(driveOnFsMaxDbByRole) as [BranchRole, number][]).map(([r, v]) => [
                        canonicalModelForRole(r, threeWay),
                        v,
                      ]),
                    ),
                  }
                : {}),
              ...(engineV2Gates.resistorClassW !== undefined ? { resistorClassW: engineV2Gates.resistorClassW } : {}),
              ...(engineV2Gates.resistorPowerMargin !== undefined
                ? { resistorPowerMargin: engineV2Gates.resistorPowerMargin }
                : {}),
              ...(engineV2Gates.coilClassA !== undefined ? { coilClassA: engineV2Gates.coilClassA } : {}),
              /* V51 — the thermal design power the resistor gate judges at on
               * the search, when stated. */
              ...(engineV2Gates.resistorThermalPowerW !== undefined
                ? { resistorThermalPowerW: engineV2Gates.resistorThermalPowerW }
                : {}),
              ...(engineV2Gates.amplifierPeakPowerW !== undefined &&
              engineV2Gates.amplifierPeakPowerW > 0 &&
              engineV2Gates.amplifierNominalLoadOhm !== undefined &&
              engineV2Gates.amplifierNominalLoadOhm > 0
                ? {
                    peakInputVolts: peakInputVolts({
                      peakPowerW: engineV2Gates.amplifierPeakPowerW,
                      nominalLoadOhm: engineV2Gates.amplifierNominalLoadOhm,
                    }),
                  }
                : {}),
              ...(ampMinLoadOhm !== null ? { ampMinLoadOhm } : {}),
            },
            budgets: {
              ...(engineV2Gates.lfBumpBudgetDb !== undefined
                ? { lfBumpBudgetDb: engineV2Gates.lfBumpBudgetDb }
                : {}),
              ...(engineV2Gates.qesMultiplierMax !== undefined
                ? { qesMultiplierMax: engineV2Gates.qesMultiplierMax }
                : {}),
              ...(engineV2Gates.dampingMarginDb !== undefined
                ? { dampingMarginDb: engineV2Gates.dampingMarginDb }
                : {}),
            },
            determinism: {
              ...(engineV2Gates.runSeed !== undefined ? { seed: engineV2Gates.runSeed } : {}),
              ...(engineV2Gates.runBudgetEvals !== undefined
                ? { budgetEvaluations: engineV2Gates.runBudgetEvals }
                : {}),
            },
            // F4b — the resolved R_e per driver with the source that produced
            // it, and the A5b.1 validity interval per driver. See `v2Facts`.
            ...v2Facts,
            // A5e.2 — the design's own target curve, or flat when it has
            // never stated one. On the DESIGN, so two voicings can sit side by
            // side and be compared.
            targetCurve: activeTargetCurve,
            // The band the window and the RMS are judged on: the same
            // evaluation band the tuner used, which is already clipped to
            // measurement validity (A5.5).
            judgeBandHz: settings.band,
            /* V36 — the power the shortlist's dissipation column turns M-A's
             * scale-free fraction into watts at. Reporting only: it steers
             * nothing and is not in the fingerprint. Read from the SAME field
             * the report panel reads, so the two surfaces cannot print watts at
             * two different powers; absent when the designer stated none, and
             * then there are no watts at all rather than watts at a default. */
            ...(() => {
              const w = Number(engineV2Settings.amplifierPowerW);
              return engineV2Settings.amplifierPowerW !== '' && Number.isFinite(w) && w > 0
                ? { amplifierPowerW: w }
                : {};
            })(),
            // Stable identities for the fingerprint. Each is a hash INPUT, so
            // what matters is that it changes when the thing it names changes
            // — never that a human can read it.
            designKey: stableJson({ variants: variants.map((v) => [v.label, v.xoLow, v.xoHigh]) }),
            measurementKey: stableJson({
              grid: [grid[0], grid[grid.length - 1], grid.length],
              w: sim.base.w.spl,
              m: sim.base.m!.spl,
              t: sim.base.t.spl,
            }),
            tuningKey: stableJson({
              phasePriority: settings.phasePriority,
              targets: settings.targets,
              band: settings.band,
              catalogSnap: settings.catalogSnap,
              acousticSlopes: settings.acousticSlopes,
              /* V41 — what the design and synthesis steps were allowed to
               * build. Field-wide rather than per candidate, so it rides with
               * the run's tuning identity instead of inside the candidate-field
               * key; two runs that differ only in the EQ budget or the lean
               * threshold are two different runs and may not stamp alike. */
              chainChoices: chainDeclarationKey(chainDecl),
            }),
            /* F4d — WHAT was searched. The fingerprint has had a `choices`
             * ingredient since F4c and it was always empty on this route,
             * because the function that fills it is not the one the app calls.
             * Empty was accurate while v1 chose the candidates; the moment the
             * field is a v2 derivation, two runs over two different fields
             * would stamp identically without this. */
            ...(v2Generated
              ? { candidateFieldKey: stableJson(candidateFieldKey(v2Generated.field)) }
              : {}),
          }
        : null;

      const scan3 = (
        ins: V2Chain3Item[],
        onProgress: (d: ScanProgress) => void,
      ): Promise<Chain3Result[]> => {
        if (!useV2 || !v2ScanSettings) return runChain3Scan(ins.map((i) => i.input), onProgress);
        return runChain3ScanV2(ins, v2ScanSettings, onProgress).then((r) => {
          /* F4b — the worker's own notes get a screen.
           *
           * `collect.notes` has existed since F2 and nothing ever rendered it,
           * which is precisely how leak 3 survived: a channel with no reader is
           * a channel that reports nothing. The notes are per candidate and
           * mostly identical across a field of them (they describe the
           * MEASUREMENT SET, not the design), so they are de-duplicated —
           * forty copies of one sentence is a different way of being unread. */
          const workerNotes = new Set<string>();
          for (const c of r.candidates) {
            for (const n of c.notes) workerNotes.add(n);
            v2GatesByLabel[c.result.label] = { verdicts: c.gates, violation: c.violation };
            // Every candidate the scan produced, feasible or not — the
            // shortlist decides feasibility, and it cannot decide it over a
            // field it was never shown.
            v2Field.push({
              label: c.result.label,
              parts: c.result.parts,
              result: c.result,
              topology: c.topology,
              measurements: c.measurements,
              gates: c.gates,
              // V36 — what it burns, measured by the worker that already
              // solved it. A column, never a criterion.
              dissipation: c.dissipation,
              disqualified: c.result.disqualified,
              /* V31 — a candidate whose tune was refused wholesale carries no
               * network. It still goes into the field: the shortlist is what
               * lists it as a refusal, and a field it never saw is a field it
               * cannot report on. */
              ...(c.rejection ? { rejection: c.rejection } : {}),
            });
          }
          setV2RunNotes((prev) => {
            const seen = new Set(prev);
            return [...prev, ...[...workerNotes].filter((n) => !seen.has(n))];
          });
          // The LAST stamp wins, and for the axis-by-axis scan that is the
          // right one: a run that was stopped in round two is aborted, whatever
          // round one reported.
          v2Stamp = r.stamp;
          return r.candidates.map((c) => c.result);
        });
      };
      /* This run's identity for the crash store (scanStore.ts). Marked
       * `running` here and `done` only once the results are committed, so a
       * run that never gets there is recognisable afterwards as interrupted —
       * which is precisely the run worth offering back. */
      const runId = `scan-${Date.now()}`;
      let scanSeq = 0;
      void beginScanRun({
        runId,
        at: Date.now(),
        status: 'running',
        planned: scan3Mode === 'axes' && !axesOnV2 ? null : inputs.length,
        label:
          scan3Mode === 'axes' && !axesOnV2
            ? 'axis-by-axis scan'
            : `${inputs.length}-candidate scan`,
      });
      const runAxes = async (): Promise<Chain3Result[]> => {
        const nPts = 1 + 2 * Math.max(1, Math.min(3, scanSteps3)); // 3/5/7
        const clampSpan = (w: { floorHz: number | null; ceilHz: number | null } | null | undefined, rail: [number, number]): [number, number] => {
          const lo = Math.max(rail[0], w?.floorHz ?? rail[0]);
          const hi = Math.min(rail[1], w?.ceilHz ?? rail[1]);
          return hi > lo * 1.03 ? [lo, hi] : [lo, lo * 1.03];
        };
        const lowSpan = pins.low
          ? ([pins.low.freq - pins.low.margin, pins.low.freq + pins.low.margin] as [number, number])
          : clampSpan(lowWin3, [250, 2000]);
        const highSpan0 = pins.high
          ? ([pins.high.freq - pins.high.margin, pins.high.freq + pins.high.margin] as [number, number])
          : clampSpan(highWin3, [Math.max(1200, tweeterHpFloor ?? 0), 12000]);
        const highSpan: [number, number] = [Math.max(highSpan0[0], lowSpan[0] * 2.5), Math.max(highSpan0[1], lowSpan[0] * 2.5 * 1.03)];
        const pts = (span: [number, number], warm?: number | null) => candidateCentres(span[0], span[1], nPts, warm);
        const inside = (v: number | null | undefined, sp: [number, number]) =>
          typeof v === 'number' && v >= sp[0] && v <= sp[1] ? v : null;
        const midOf = (sp: [number, number]) => Math.sqrt(sp[0] * sp[1]);
        // Anchors for the axis being HELD: pin → DI match → warm start → log-mid.
        // (point 5a) The held M-T sits on the DI anchor — clamped INTO the
        // window when the match lies just outside it (Sanders' set: DI match
        // 3.5 kHz vs breakup ceiling 3.1 kHz) — then warm start, then log-mid.
        const clampIn = (v: number | null | undefined, sp: [number, number]) =>
          typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(sp[1], Math.max(sp[0], v)) : null;
        const highAnchor = pins.high ? pins.high.freq : clampIn(physWin3?.diAnchor.high, highSpan) ?? inside(warm3?.high, highSpan) ?? midOf(highSpan);
        const merged: Chain3Result[] = [];
        const doneItems: { label: string; text: string; done: boolean; warn?: string }[] = [];
        let doneEvals = 0;
        const runRound = async (vs: Chain3Variant[], phase?: { label: string; n: number; total: string }) => {
          const rs = await scan3(vs.map((v) => ({ input: inputOf(v) })), (d) =>
            setVfProgress({ round: doneItems.filter((x) => x.done).length + d.round, evals: doneEvals + d.evals, items: [...doneItems, ...d.items], round3: phase }),
          );
          for (const r of rs) doneItems.push({ label: r.label, ...scanRowVerdict(r), done: true });
          /* Each finished candidate goes to disk NOW. A sleeping laptop cost
           * Sander 18 of these once; from here on an interruption costs the
           * chain that was in flight and nothing behind it. Never awaited on
           * the critical path — a failing store may not stall a scan. */
          for (const r of rs) void putScanRow(runId, scanSeq++, r);
          doneEvals += rs.reduce((a, r) => a + r.net.evaluations, 0);
          merged.push(...rs);
          return rs;
        };
        const stepRatio = (sp: [number, number]) => Math.pow(sp[1] / sp[0], 1 / Math.max(1, nPts - 1));
        // Round 1 — W-M sweep.
        const r1 = await runRound(variantsFromPoints(pts(lowSpan, warm3?.low), [highAnchor], lowSpan, highSpan, 'W-M sweep'), { label: 'W-M sweep', n: 1, total: '2–3' });
        // "Stop and keep what finished" must not be undone by the next round:
        // starting one respawns the workers this just killed.
        if (r1.length === 0 || scanStopped()) return merged;
        const w1 = rankAll(r1)[0];
        const bestLow = w1.net.after.xoHzPairs?.[0] ?? w1.xoLow;
        // Round 2 — M-T sweep with the best W-M held (delivered value, not aim).
        const r2 = await runRound(variantsFromPoints([bestLow], pts(highSpan, warm3?.high), lowSpan, highSpan, 'M-T sweep'), { label: 'M-T sweep', n: 2, total: '2–3' });
        const w2 = rankAll(r2.length ? r2 : r1)[0];
        if (scanStopped()) return merged;
        const bestHigh = w2.net.after.xoHzPairs?.[1] ?? w2.xoHigh;
        // Round 3 — local refinement, only if the sweeps show coupling: did
        // the M-T sweep move the W-M off round 1's best, or its own delivery
        // off its aim, by more than half a step?
        const rL = Math.sqrt(stepRatio(lowSpan));
        const rH = Math.sqrt(stepRatio(highSpan));
        const dLow = w2.net.after.xoHzPairs?.[0] ?? w2.xoLow;
        const drift = Math.abs(Math.log(dLow / bestLow)) > Math.log(rL) || Math.abs(Math.log(bestHigh / w2.xoHigh)) > Math.log(rH);
        if (drift && nPts >= 5) {
          const around = (c: number, r: number, sp: [number, number]) =>
            [c / r, c, c * r].map((v) => Math.min(sp[1], Math.max(sp[0], v)));
          await runRound(variantsFromPoints(around(bestLow, rL, lowSpan), around(bestHigh, rH, highSpan), lowSpan, highSpan, 'refine'), { label: 'refine', n: 3, total: '3' });
        }
        return merged;
      };
      (scan3Mode === 'axes' && !axesOnV2
        ? runAxes()
        : scan3(inputs, (d) =>
            setVfProgress({ round: d.round, evals: d.evals, items: d.items }),
          ).then((rs) => {
            for (const r of rs) void putScanRow(runId, scanSeq++, r);
            return rs;
          }))
        .then((results) => {
          /* F2b: the run stamp lands with the results, or not at all. An
           * ABORTED run keeps its status here — A5e.4 asks for it explicitly
           * so a partial field can never read as a whole one, and the status
           * is an ingredient of the fingerprint rather than a label beside
           * it, so the two can never compare equal either. */
          /* A5e.1 — the FEASIBLE REGION, built here on the main thread from
           * the field the workers produced. Deliberately not in the worker: a
           * shortlist is a statement about a SET of candidates, and every
           * worker only ever sees one.
           *
           * UI-1 — held in a LOCAL as well as in state, because the selection
           * below has to read it in this same tick and `setV2Shortlist` will
           * not have landed yet. Reading it back out of state here is how the
           * app would come to load one list while displaying another. */
          const shortlist = v2Stamp
            ? buildShortlist(v2Field, v2Stamp.fingerprint, {
                requirements: {
                  ...(engineV2Gates.splWindowPlusMinusDb !== undefined
                    ? { splWindowPlusMinusDb: engineV2Gates.splWindowPlusMinusDb }
                    : {}),
                  ...(engineV2Gates.maxPhaseTrackingDeg !== undefined
                    ? { maxPhaseTrackingDeg: engineV2Gates.maxPhaseTrackingDeg }
                    : {}),
                },
                targetCurve: v2ScanSettings?.targetCurve,
                ...(engineV2Gates.shortlistSize !== undefined
                  ? { size: Math.max(1, Math.round(engineV2Gates.shortlistSize)) }
                  : {}),
              })
            : null;
          if (v2Stamp) {
            setV2Run({ stamp: v2Stamp, gatesByLabel: { ...v2GatesByLabel } });
            setV2Shortlist(shortlist);
            setShortlistPick(null);
          }
          // "Stop and use what finished" can land before the first candidate
          // does. Ranking an empty field would crash; committing nothing and
          // saying why is the honest outcome — the design stays as it was.
          const partial = scanStopped();
          if (results.length === 0) {
            setNetOptNote(
              tx('Stopped before any candidate finished — nothing was changed. Your design is exactly as it was.'),
            );
            return;
          }
          const ranked = rankChain3Results(
            results,
            settings.targets,
            settings.phasePriority,
            angleSets3 ? settings.directivityWeight : 0,
            rSourceLimitOhm,
            bomCapEur,
            ampMinLoadOhm ?? 0,
          );
          const win = ranked[0];
          /* ---- UI-1: WHAT LANDS IN THE WORKING TAB --------------------------
           *
           * On the v2 route: the SHORTLIST decides, and if it delivers nothing
           * then nothing is loaded. On the v1 route: `win`, exactly as before
           * and byte for byte — `shortlist` is null there and this branch is
           * not entered, which is what keeps the toggle invariant.
           *
           * WHY THIS EXISTS. Until UI-1 both routes ended here, at
           * `setWorkingDesign(win.parts)` — the v1 ranking, which has no gate,
           * no requirement and no notion of a wholesale refusal. On the v2
           * route it could and did crown a candidate v2 had thrown away, and
           * V31 blanks a refused candidate's part list before it leaves the
           * worker. So `win.parts` was `[]`, `setWorkingDesign` set
           * `networkActive` behind it anyway, the Working tab said "No
           * generator — add a source element", every chart summed the
           * unfiltered drivers, and one green line read "Design ready — the
           * winner is loaded in the Working tab". See `selection.ts`. */
          const selection = shortlist ? selectFromShortlist(shortlist) : null;
          if (selection) {
            if (selection.kind === 'design') {
              applyScanCandidate({ label: selection.label, result: selection.result });
              setShortlistPick(selection.label);
            } else {
              /* NOTHING IS LOADED, and the design on screen stays exactly as it
               * was. Falling back to `win` here is the whole bug. */
              setShortlistPick(null);
            }
          } else {
            setVFilters((prev) => ({ ...prev, ...win.specs }));
            // The design step CHOSE the polarities; the sim must sum the design
            // that was actually fitted, so the checkboxes follow it.
            setMidInverted(win.midInverted);
            setInverted(win.tweeterInverted);
            setSynth({
              mode: synthMode,
              woofer: win.synthWoofer,
              mid: win.synthMid,
              tweeter: win.synthTweeter,
            });
            setWorkingDesign(win.parts);
            setNetOptAudit(win.net.audit ?? null);
            setNetworkActive(true);
            setVfBypass(true);
          }
          setVfOpt(null);
          setVfRunStats(null);
          // De scan-tabel werkt nu OOK in 3-weg (Sander: "bij de 2-weg kreeg
          // ik alle opties te zien, maar nu niet"). Hij stond hier op null,
          // dus de kandidaten leefden alleen als proza in de note -- terwijl
          // juist bij drie takken de prijsverschillen tussen kandidaten groot
          // zijn en je ze wilt kunnen proberen.
          setScanSort(null);
          setChainScan(
            results.length > 1
              ? {
                  /* UI-1 — ON THE v2 ROUTE THERE IS NO WINNER HERE. This table
                   * is the v1 reading of the same field: a ranking that has no
                   * gate, no requirement and no notion of a refused tune. It
                   * stays visible, because a second reading of one's own field
                   * is worth having; it may not crown anything, and its `active`
                   * row is whatever the SHORTLIST loaded — which is often not
                   * its own top row and is sometimes nothing at all. */
                  rows: ranked.map((rr) => chain3ScanRow(rr, shortlist ? null : win)),
                  active: shortlist
                    ? selection?.kind === 'design'
                      ? selection.label
                      : ''
                    : win.label,
                }
              : null,
          );
          /* Committed — so this run is history, not a rescue. Everything the
           * store holds for it can go: the results now live in the design
           * tabs and the scan table, and keeping a second copy would make the
           * next crash offer back something the user already has. */
          void endScanRun(runId);
          // DELIVERED handovers, not just the candidate label: a design can
          // meet every flatness target while its crossings sit an octave off
          // the knees it was built on, and that is invisible in the numbers.
          const crossings = (r: typeof win): string => {
            const xo = r.net.after.xoHzPairs;
            if (!xo || xo.length !== 2) return '';
            const f = (v: number | null) => (v == null ? '—' : `${Math.round(v)}`);
            return ` · crosses ${f(xo[0])}/${f(xo[1])} Hz`;
          };
          const line = (r: typeof win): string =>
            `${r.label}: ${r.net.after.rippleDb.toFixed(2)} dB/${r.net.after.phaseDeg.toFixed(1)}°` +
            (r.net.after.pairPhaseDeg && r.net.after.pairPhaseDeg.length === 2
              ? ` (W-M ${r.net.after.pairPhaseDeg[0].toFixed(1)}° · M-T ${r.net.after.pairPhaseDeg[1].toFixed(1)}°)`
              : '') +
            crossings(r) +
            (r.pairOverlapOct !== null
              ? ` · ovl ${r.pairOverlapOct.map((o) => (o === null ? '—' : o.toFixed(1))).join('/')} oct`
              : '') +
            (r.xoWindowOk === false ? ' · ⚠ xo window' : '') +
            (r.zMinOhm !== null ? ` · Z ${r.zMinOhm.toFixed(1)} Ω` : '') +
            (r.bomTotalEur !== null ? ` · €${Math.round(r.bomTotalEur)}` : '') +
            (r.zOk ? '' : ' · ⚠ amp-load');
          // ONE LINE PER FACT. This was a single run-on sentence of ~600
          // characters carrying the winner, every loser, prices and warnings;
          // the reader had to parse prose to find the one ⚠ that mattered.
          // NB the 3-way path sets chainScan to null, so unlike the 2-way scan
          // there is no results table — nothing may be dropped here, only
          // structured.
          /* A ranking gate whose verdict is invisible is half a feature: when
           * EVERY candidate sits under the floor the gate reorders nothing and
           * the designer silently gets an amp-hostile load anyway. Say it, and
           * say whether it was the only option. */
          /* UI-1 — THE WARNINGS BELONG TO THE DESIGN THAT WAS LOADED.
           *
           * On the v1 route that is `win` and nothing changes. On the v2 route
           * it is the shortlist row this run put in the Working tab, and when
           * the shortlist delivered nothing there is no design to warn about —
           * so the reader gets the shortlist's own diagnosis instead of an
           * amplifier-load warning about a network nobody has. */
          const loaded: Chain3Result | null =
            shortlist ? (selection?.kind === 'design' ? selection.result : null) : win;
          const zLow =
            loaded !== null &&
            ampMinLoadOhm !== null && loaded.zMinOhm !== null && !meetsAmpFloor(loaded.zMinOhm, ampMinLoadOhm);
          const anySane = ranked.some(
            (r) => r.zMinOhm !== null && ampMinLoadOhm !== null && meetsAmpFloor(r.zMinOhm, ampMinLoadOhm),
          );
          const zNote = !zLow
            ? ''
            : `⚠ amplifier load: the loaded design dips to ${loaded!.zMinOhm!.toFixed(1)} Ω ` +
              `(your amplifier is rated to ${ampMinLoadOhm!.toFixed(1)} Ω)` +
              (anySane
                ? ' — a candidate with a sane load exists in the table; it ranks lower on flatness.'
                : ' — no candidate in this scan stayed above it, so this is a design-level ' +
                  'property of these drivers in this topology, not a tuning miss. Three branches ' +
                  'in parallel around a handover is the usual cause; check the Impedance panel.');
          /* Handover physics on the winner: same visibility rule as the Z
           * floor — a class the designer cannot read reorders silently. */
          const anyXoSane = ranked.some((r) => r.xoWindowOk !== false);
          const xoWinNote =
            loaded === null || loaded.xoWindowOk !== false
              ? ''
              : `⚠ handover: a delivered crossing sits outside its physics window` +
                (anyXoSane
                  ? ' — an in-window candidate exists in the table; it ranks lower on flatness.'
                  : ' — no candidate stayed inside; the drivers or the window settings disagree ' +
                    'with every reachable design. Check the ⚙ window readout.');
          const waarschuwingen = [
            ...brokenWindows,
            zNote,
            xoWinNote,
            loaded?.xoPinNote ? `⚠ PIN: ${loaded.xoPinNote}` : '',
            loaded?.net.snapNote ?? '',
            loaded?.net.safetyNote ? `⚠ ${loaded.net.safetyNote}` : '',
            loaded?.net.ampFloorNote ? `⚠ ${loaded.net.ampFloorNote}` : '',
          ].filter(Boolean);
          setNetOptNote(
            [
              // Honest count: in axis mode (and after an early stop) the number
              // that RAN is not the number that was planned.
              `3-way scan — ${results.length} candidate${results.length > 1 ? 's' : ''} ` +
                `(alignment × polarity design step, two-pair tune)` +
                (partial
                  ? ` — ⏹ STOPPED EARLY: this is the best of the ${results.length} that finished, the rest was never computed`
                  : ''),
              /* UI-1 — THE HEADLINE IS THE SHORTLIST ON THE v2 ROUTE.
               *
               * "winner" is a v1 word and it was being printed over a v2 run
               * that had no winner, only a feasible region and a first row.
               * Worse, on a run where nothing qualified it printed the v1
               * ranking's top candidate — the one v2 had refused — under that
               * word, beside a shortlist saying "0 of 9 qualified". */
              ...(shortlist
                ? [
                    `shortlist  ${shortlist.rows.length} design${shortlist.rows.length === 1 ? '' : 's'} ` +
                      `of ${shortlist.consideredCount} candidates meet every requirement and every gate` +
                      (shortlist.rejected.length > 0
                        ? ` · ${shortlist.rejected.length} delivered no network at all (refused)`
                        : ''),
                    selection?.kind === 'design'
                      ? `loaded     ${selection.label}${loaded ? ` · ${loaded.structureLabel}` : ''}` +
                        (loaded?.net.after.avgDevDb !== undefined
                          ? ` · avg ${loaded.net.after.avgDevDb.toFixed(2)} dB`
                          : '')
                      : `loaded     NOTHING — ${selection?.describe ?? ''}`,
                    ...(loaded ? [`        ${line(loaded)}`] : []),
                    ...shortlist.diagnosis.map((d) => `        ${d}`),
                  ]
                : [
                    `winner  xo ${win.label} · ${win.structureLabel}` +
                      (win.net.after.avgDevDb !== undefined
                        ? ` · avg ${win.net.after.avgDevDb.toFixed(2)} dB`
                        : ''),
                    `        ${line(win)}`,
                    ...ranked.slice(1).map((r, i) => `${i === 0 ? 'others  ' : '        '}${line(r)}`),
                  ]),
              ...waarschuwingen,
            ].join('\n'),
          );
          setDesignTab('network');
        })
        .catch((e) => {
          if (!(e instanceof CancelledError)) setVfError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          setVfProgress(null);
          setVfBusy(false);
        });
      return;
    }
    // SINGLE-DRIVER path: its own engine (soloOptimizer) — flatten the one
    // measured driver with cut-only EQ/shelves, build the SOLO topology
    // (series traps / shelf groups / gated Zobel) and solo-tune the result.
    if (soloDriver && result) {
      const solo = (soloDriver === 'woofer' ? woofer : tweeter)!;
      const model = soloDriver === 'woofer' ? 'mid' : 'tweeter';
      const spec = vFilters[soloDriver];
      const grid = result.freq;
      // NB: no 300 Hz clamp here (unlike the two-way flow) — a fullranger
      // measured from 110 Hz must be designed from 110 Hz.
      // Same rule as the 3-way chain: the cost function lives on the validity
      // band. A fullranger measured from 110 Hz is still designed from 110 Hz —
      // that floor now comes from its gate rather than from the grid.
      const band: [number, number] = evalBand
        ? [evalBand.fromHz, evalBand.toHz]
        : [grid[0] * 1.02, Math.min(grid[grid.length - 1] * 0.975, num(fMax, 20000))];
      const z = impedances[model];
      setVfBusy(true);
      setVfError(null);
      setVfProgress(null);
      setChainScan(null);
      if (!z) {
        // No impedance → design the virtual filter only (mirrors the classic
        // no-impedance vf flow; fast enough to run synchronously).
        setTimeout(() => {
          try {
            const d = resample(solo.frd.freq, solo.frd.spl, solo.frd.phase, grid);
            const r = optimizeSoloFilter(grid, d, spec, {
              eqBands: vfEqBands,
              band,
              targets: stagedOn ? { rippleDb: rippleTargetEff() } : undefined,
              ...soloLevelGoal(),
            });
            setVFilters((p) => ({ ...p, [soloDriver]: r.spec }));
            setVfBypass(false); // virtual result — must be audible in the sim
            setNetOptDiff(null);
            setNetOptNote(
              `solo design (virtual — load a .ZMA to build it) — designed ` +
                `${hz(r.designBand[0])}–${hz(r.designBand[1])}: peak ` +
                `${r.inBandBefore.ripplePeakDb.toFixed(2)} → ${r.inBandAfter.ripplePeakDb.toFixed(2)} dB · ` +
                r.stages.map((s) => s.label).join(' → ') +
                (r.sensitivityCostDb > 0.2
                  ? ` · costs ${r.sensitivityCostDb.toFixed(1)} dB sensitivity`
                  : '') +
                (r.dipLimit
                  ? ` · ⓘ outside that band the driver is too far down to reach ` +
                    `(${r.dipLimit.db.toFixed(0)} dB dip at ${hz(r.dipLimit.hz)})`
                  : ''),
            );
          } catch (e) {
            setVfError(e instanceof Error ? e.message : String(e));
          } finally {
            setVfBusy(false);
          }
        }, 30);
        return;
      }
      const d = resample(solo.frd.freq, solo.frd.spl, solo.frd.phase, grid);
      const zOnGrid = resampleImpedance(z.freq, z.magnitude, z.phase, grid).z;
      const safety = (() => {
        const lo = Math.max(200, solo.frd.freq[0]);
        const hi = Math.min(20000, solo.frd.freq[solo.frd.freq.length - 1]);
        if (!(hi > lo * 1.5)) return undefined;
        const sGrid = logspace(lo, hi, 240);
        return {
          freqs: sGrid,
          d: resample(solo.frd.freq, solo.frd.spl, solo.frd.phase, sGrid),
          z: resampleImpedance(z.freq, z.magnitude, z.phase, sGrid).z,
        };
      })();
      runSoloChainTask(
        {
          grid: [...grid],
          d,
          z: zOnGrid,
          model,
          seed: spec,
          settings: {
            eqBands: vfEqBands,
            band,
            targets: stagedOn ? { rippleDb: rippleTargetEff() } : undefined,
            ...soloLevelGoal(),
            catalogSnap: catalogSnap && hasImportedCatalog(),
            snapPrefs: snapPrefsValue(),
            safety,
            ampMinLoadOhm: ampMinLoadOhm ?? undefined,
          },
        },
        (p) =>
          setVfProgress({
            round: p.round ?? 0,
            evals: p.evals,
            rippleDb: p.rippleDb,
            items: [
              {
                label: 'solo',
                text:
                  p.stage === 'design'
                    ? 'design'
                    : p.stage === 'synthesis'
                      ? 'build topology'
                      : p.detail
                        ? `tune (${p.detail})`
                        : 'tune',
                done: false,
              },
            ],
          }),
      )
        .then((r) => {
          setVFilters((p) => ({ ...p, [soloDriver]: r.vf.spec }));
          setVfOpt(null); // two-way result panel — stale for a solo run
          setSynth(null);
          setVfRunStats({ rounds: 1, evals: r.vf.evaluations + r.net.evaluations });
          setWorkingDesign(r.parts);
          setVfBypass(true); // the BUILT network is the result on screen
          setNetOptDiff(null);
          setNetOptNote(
            `solo chain — ${r.structure.join(' · ') || 'no correction needed'} — ` +
              // Both numbers on the SAME band (the one designed on): a
              // whole-range "before" against an in-band "after" would flatter
              // the run by exactly the size of the unreachable region.
              `designed ${hz(r.vf.designBand[0])}–${hz(r.vf.designBand[1])}: ` +
              `peak ${r.vf.inBandBefore.ripplePeakDb.toFixed(2)} → ${r.net.after.rippleDb.toFixed(2)} dB` +
              (r.net.after.avgDevDb !== undefined
                ? ` · avg ${r.net.after.avgDevDb.toFixed(2)} dB`
                : '') +
              (r.vf.sensitivityCostDb > 0.2
                ? ` · costs ${r.vf.sensitivityCostDb.toFixed(1)} dB sensitivity`
                : '') +
              // Say what was left out and why — cut-only cannot lift a dip, so
              // a mediocre whole-range score is physics, not a failed run.
              (r.vf.dipLimit
                ? ` · ⓘ outside that band the driver is too far down to reach ` +
                  `(${r.vf.dipLimit.db.toFixed(0)} dB dip at ${hz(r.vf.dipLimit.hz)}) — ` +
                  `passive cuts can only cut, so that part sets the whole-range score`
                : '') +
              (r.bomTotalEur !== null ? ` · BOM €${Math.round(r.bomTotalEur)}` : '') +
              (r.net.snapNote ? ` · ${r.net.snapNote}` : '') +
              (r.net.safetyNote ? ` · ⚠ ${r.net.safetyNote}` : '') +
              (r.net.ampFloorNote ? ` · ⚠ ${r.net.ampFloorNote}` : ''),
          );
        })
        .catch((e) => {
          if (!(e instanceof CancelledError))
            setVfError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          setVfProgress(null);
          setVfBusy(false);
        });
      return;
    }
    if (!woofer || !tweeter || !result) return;
    setVfBusy(true);
    setVfError(null);
    setVfProgress(null);
    setChainScan(null);

    const grid = result.freq;
    const w = resample(woofer.frd.freq, woofer.frd.spl, woofer.frd.phase, grid);
    const t = resample(tweeter.frd.freq, tweeter.frd.spl, tweeter.frd.phase, grid);
    const angleData = angleResponsesOn(grid) ?? undefined;
    // The optimizer targets what you look at: the view range is the
    // evaluation band (top edge backed off 2.5% from the grid edge).
    const opts = {
      phasePriority: phasePriority / 100,
      eqBandsPerDriver: vfEqBands,
      angleData,
      directivityWeight: dirWeight / 100,
      powerMetric,
      powerFoldWeight,
      errorSmoothOct,
      costWeight,
      dissipationWeight,
      ampMinLoadOhm: ampMinLoadOhm ?? undefined,
      audit: {
        thresholds: { rSourceOhm: rSourceLimitOhm },
        fbHz: Number(cabinet.drivers.low.fbHz) > 0 ? Number(cabinet.drivers.low.fbHz) : undefined,
      },
      ampTarget,
      cutOnly: true, // passive-only: EQ may never boost
      breakupGuard,
      structurePreference: parseHpLpPref(hpLpPref),
      targets: stagedOn
        ? { rippleDb: rippleTargetEff(), phaseDeg: num(targetPhase, 10) }
        : undefined,
      hpFloorHz: tweeterHpFloor ?? undefined,
      phaseMetric: phaseMetricMode,
      acousticSlopes: acousticSlopesValue(),
      xoRange: xoRangeValue(),
      // Validity band, not the grid (A3d). The old Math.max(300, …) was a
      // stand-in for "below this the measurement cannot be trusted"; the
      // validity band says exactly that, from the gate, per measurement — so
      // keeping both would be two floors for one fact.
      band: (evalBand
        ? [evalBand.fromHz, evalBand.toHz]
        : [Math.max(300, grid[0]), Math.min(grid[grid.length - 1] * 0.975, num(fMax, 20000))]) as [
        number,
        number,
      ],
    };

    /* ---- FULL-CHAIN CROSSOVER SCAN (with measured impedances) ----
     * The vf-stage ranking does NOT predict the built-and-tuned ranking
     * (measured on KOAN: xo 1900±200 looked worst at the vf stage, became
     * the best assembled result 0.33 dB/3.5°, while the 2100 pin ended
     * 0.94 dB/12.5°). So each crossover-point candidate runs the WHOLE
     * chain — design rounds → synthesis → assembled tune — and the final
     * results compete. Deterministic: same input → same output. ---- */
    if (Object.keys(impedances).length > 0) {
      const zOnGrid = zGridWithSlots(impedances, grid);
      const safety = (() => {
        const lo = Math.max(200, woofer.frd.freq[0], tweeter.frd.freq[0]);
        const hi = Math.min(
          20000,
          woofer.frd.freq[woofer.frd.freq.length - 1],
          tweeter.frd.freq[tweeter.frd.freq.length - 1],
        );
        if (!(hi > lo * 1.5)) return undefined;
        const sGrid = logspace(lo, hi, 240);
        return {
          freqs: sGrid,
          w: resample(woofer.frd.freq, woofer.frd.spl, woofer.frd.phase, sGrid),
          t: resample(tweeter.frd.freq, tweeter.frd.spl, tweeter.frd.phase, sGrid),
          z: zGridWithSlots(impedances, sGrid),
        };
      })();
      const targets = stagedOn
        ? { rippleDb: rippleTargetEff(), phaseDeg: num(targetPhase, 10) }
        : undefined;
      const settings: ChainSettings = {
        phasePriority: phasePriority / 100,
        eqBandsPerDriver: vfEqBands,
        angleData,
        directivityWeight: dirWeight / 100,
        powerMetric,
        powerFoldWeight,
        errorSmoothOct,
      costWeight,
        dissipationWeight,
        ampMinLoadOhm: ampMinLoadOhm ?? undefined,
        audit: {
          thresholds: { rSourceOhm: rSourceLimitOhm },
          fbHz: Number(cabinet.drivers.low.fbHz) > 0 ? Number(cabinet.drivers.low.fbHz) : undefined,
        },
        ampTarget,
        cutOnly: true, // passive-only: EQ may never boost
        breakupGuard,
        structurePreference: parseHpLpPref(hpLpPref),
        targets,
        hpFloorHz: tweeterHpFloor ?? undefined,
        phaseMetric: phaseMetricMode,
        acousticSlopes: acousticSlopesValue() ?? undefined,
        band: opts.band,
        synthMode,
        catalogSnap: catalogSnap && hasImportedCatalog(),
        snapPrefs: snapPrefsValue(),
        safety,
      };
      // Mutable on purpose: an unpinned run starts as one free chain and, once
      // its crossing is known, appends two pinned follow-ups around it — a
      // single chain has no competition and one bad basin then simply wins
      // (measured: Positie-run, phase 3.4° → 11.7° with nothing to beat it).
      // Free run: BOUND the crossover to a sensible band [2×Fs, ~1.5×] so it
      // can't roam to extremes — measured on KOAN, the flatness objective is
      // flat across a wide xo range and lands arbitrarily (1644 too low,
      // 3172/3251/3723 too high, from tiny settings changes). The xoRange
      // penalty is ZERO inside the band (vfOptimizer.xoPenalty) and quadratic
      // outside — so a LOW ceiling both narrows the band AND makes an extreme
      // overshoot expensive (at 1.7× the soft penalty let 3172 slip past 3053;
      // at 1.5× the ceiling is ~2700 and 3172 costs a real penalty). Free
      // within a sane band, not a hard pin — one chain, not a slow spread. A
      // user pin overrides it; no Fs floor (no impedance) → truly free.
      const userXo = xoRangeValue();
      /* The MEASURED window bounds the free scan when it exists — the same
       * move the three-way scan made in August, and the open roadmap item
       * ("Fs-vloer voor de HP-knie in de vfOptimizer-bounds") generalised:
       * floor = 2×Fs / reach / excursion, ceiling = measured beaming, lobing,
       * array spacing and breakup/N. The old tweeter-anchored estimate stays
       * the fallback when nothing has been measured yet. */
      const measuredFree: [number, number] | undefined =
        physWin2 && physWin2.floorHz != null && physWin2.ceilHz != null &&
        physWin2.ceilHz > physWin2.floorHz * 1.05
          ? [physWin2.floorHz, physWin2.ceilHz]
          : undefined;
      const saneFree: [number, number] | undefined = (() => {
        if (measuredFree) return measuredFree;
        if (tweeterHpFloor === null) return undefined;
        const floor = tweeterHpFloor; // tweeter: ≥2×Fs
        // Mid beaming ceiling when the mid size is known (the physically-right
        // upper bound); else fall back to a tweeter-anchored estimate.
        const ceil = Math.max(midXoCeiling ?? floor * 1.7, floor * 1.2);
        // Aim at the CENTRE of the driver window (its geometric mean — for KOAN
        // + 5" that is ~2400 Hz, exactly the sweet spot), with ±~0.28 oct room
        // so the metric can fine-tune without drifting to an extreme edge.
        const centre = Math.sqrt(floor * ceil);
        return [centre / 1.22, centre * 1.22];
      })();
      // Scan THREE crossover candidates across the driver window (like a pin
      // does), not one chain — Sander measured that a pinned 2100±200 runs far
      // more sims and comes back with a better filter (SPL AND phase), because
      // it explores 3× wider. Give the free run the same breadth automatically.
      // No band at all (no impedance floor) → one truly-free chain (+ rescue).
      const variants: { label: string; xoRange?: [number, number] }[] =
        crossoverVariants(userXo ?? saneFree, scanSteps2);
      const adjust = branchAdj.tweeter;
      // The whole scan runs in the optimizer WORKER (variants loop + the
      // truly-free rescue logic live there): the UI stays responsive, the
      // per-variant counter ticks via progress messages, and Cancel simply
      // terminates the worker.
      runChainScan(
        {
          base: {
            grid: [...grid],
            w,
            t,
            driverZ: zOnGrid,
            adjust,
            seed: defaultVFilters(),
            settings,
            // A pin is the designer's promise; the measured window is the
            // drivers'. A degenerate window judges nothing (three-way lesson).
            judgeWindow: userXo
              ? { floorHz: userXo[0], ceilHz: userXo[1] }
              : measuredFree
                ? { floorHz: measuredFree[0], ceilHz: measuredFree[1] }
                : null,
          },
          variants,
          targets,
        },
        (d) => setVfProgress(d),
      )
        .then(({ results, totalRounds, totalSims, stoppedEarly, requested }) => {
          // Stopped before anything landed: commit nothing and say so (same
          // rule as the three-way scan) — the design stays as it was.
          if (results.length === 0) {
            setNetOptNote(
              tx('Stopped before any candidate finished — nothing was changed. Your design is exactly as it was.'),
            );
            return;
          }
          // Winner: targets met first, then blended score at the priority.
          const ranked = rankChainResults(
            results,
            targets,
            phasePriority / 100,
            tweeterHpFloor ?? undefined,
            rSourceLimitOhm,
            rSourceDisqOhm,
            bomCapEur,
            ampMinLoadOhm ?? 0,
          );
          const win = ranked[0];
          setVFilters((p) => ({ ...p, ...win.vf.specs }));
          setInverted(win.vf.inverted);
          setVfOpt(win.vf);
          setVfRunStats({ rounds: totalRounds, evals: totalSims });
          synthFresh.current = true;
          setSynth({ mode: synthMode, woofer: win.synthWoofer, tweeter: win.synthTweeter });
          setWorkingDesign(win.parts);
          setNetOptAudit(win.net.audit ?? null);
          setVfBypass(true); // the BUILT network is the result on screen
          setScanSort(null);
          setChainScan(
            results.length > 1
              ? {
                  rows: ranked.map((rr) => {
                    const aim = rr.xoRange ? Math.sqrt(rr.xoRange[0] * rr.xoRange[1]) : null;
                    const dl = deliveredLabel([aim], [rr.net.after.xoHz ?? null], ['xo']);
                    return {
                      label: rr.label,
                      delivered: dl.text,
                      target: rr.label,
                      unrealisable: dl.unrealisable,
                      rippleDb: rr.net.after.rippleDb,
                      peakSmoothedDb: rr.net.after.ripplePeakSmoothedDb ?? null,
                      powerSlopeDbDec: rr.net.after.powerSlopeDbDec ?? null,
                      rSourceOhm: rSrcDelivered(rr),
                      disqualified: [
                        /* A3g: whatever the CHAIN gave up on comes first — the
                         * table may not be gentler than the engine. Read from
                         * `rr.disqualified` and not from `net.infeasible`
                         * alone: since the degenerate-load refusal the chain
                         * carries reasons the tuner never saw (a branch that
                         * shorts the amplifier is refused at the synthesis
                         * output, before any tune), and rebuilding the list
                         * here would silently drop them — a candidate ranked
                         * last with no reason on screen is the exact failure
                         * this column exists to prevent. */
                        ...(rr.disqualified ?? (rr.net.infeasible ? [rr.net.infeasible] : [])),
                        ...(rSrcDelivered(rr) != null && rSourceDisqOhm > 0 && rSrcDelivered(rr)! >= rSourceDisqOhm
                          ? [`source resistance at the low driver ${rSrcDelivered(rr)!.toFixed(2)} Ω ≥ ${rSourceDisqOhm.toFixed(1)} Ω`]
                          : []),
                      ],
                      xoFloorVerdict: null,
                      avgDevDb: rr.net.after.avgDevDb ?? null,
                      phaseDeg: rr.net.after.phaseDeg,
                      zMinOhm: rr.net.after.zMinOhm ?? null,
                      xoWindowOk: rr.xoWindowOk,
                      pairOverlapOct: rr.overlapOct != null ? [rr.overlapOct] : null,
                      bomEur: rr.bomTotalEur,
                      winner: rr === win,
                      result: rr,
                    };
                  }),
                  active: win.label,
                }
              : null,
          );
          setNetOptDiff(null); // fresh design — an old tune-diff would lie
          // Same visibility rule as the three-way scan: a class the designer
          // cannot read reorders silently.
          const zLow2 =
            ampMinLoadOhm !== null && win.zMinOhm !== null && !meetsAmpFloor(win.zMinOhm, ampMinLoadOhm);
          const anySane2 = ranked.some(
            (r) => r.zMinOhm !== null && ampMinLoadOhm !== null && meetsAmpFloor(r.zMinOhm, ampMinLoadOhm),
          );
          const zNote2 = !zLow2
            ? ''
            : `\n⚠ amplifier load: the winner dips to ${win.zMinOhm!.toFixed(1)} Ω ` +
              `(your amplifier is rated to ${ampMinLoadOhm!.toFixed(1)} Ω)` +
              (anySane2
                ? ' — a candidate with a sane load exists in the table; it ranks lower on flatness.'
                : ' — no candidate stayed above it; check the Impedance panel.');
          const xoNote2 =
            win.xoWindowOk !== false
              ? ''
              : `\n⚠ handover: the delivered crossing (${
                  win.net.after.xoHz ? Math.round(win.net.after.xoHz) : '—'
                } Hz) sits outside its window` +
                (ranked.some((r) => r.xoWindowOk !== false)
                  ? ' — an in-window candidate exists in the table; it ranks lower on flatness.'
                  : ' — no candidate stayed inside; check the Driver limits or pin the crossing.');
          const partialNote = stoppedEarly
            ? `\n⏹ stopped early — ranked the ${results.length} candidate${results.length > 1 ? 's' : ''} that finished, of ${requested}; the rest was never computed`
            : '';
          setNetOptNote(
            (results.length > 1
              ? `crossover scan — winner xo ${win.label}`
              : `peak ${win.net.after.rippleDb.toFixed(2)} dB` +
                (win.net.after.avgDevDb !== undefined
                  ? ` · avg ${win.net.after.avgDevDb.toFixed(2)} dB`
                  : '') +
                ` / ${win.net.after.phaseDeg.toFixed(1)}°` +
                (win.bomTotalEur !== null ? ` · BOM €${Math.round(win.bomTotalEur)}` : '')) +
              (win.net.snapNote ? ` · ${win.net.snapNote}` : '') +
              (win.net.valueWindowNote ? ` · ${win.net.valueWindowNote}` : '') +
              (win.net.safetyNote ? ` · ⚠ ${win.net.safetyNote}` : '') +
              (win.net.ampFloorNote ? ` · ⚠ ${win.net.ampFloorNote}` : '') +
              zNote2 +
              xoNote2 +
              partialNote,
          );
        })
        .catch((e) => {
          if (!(e instanceof CancelledError))
            setVfError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          setVfProgress(null);
          setVfBusy(false);
        });
      return;
    }

    /* ---- No measured impedances: virtual-filter rounds only (no build). ----
     * Quality beats speed here (Sander): the real stop is "a round no longer
     * pays", with a hard ROUND cap as the bound. Deliberately NO wall-clock
     * budget — deterministic across machines. ---- */
    const MAX_ROUNDS = 12;

    // Two starting points, no manual "Reset filters" needed: the user's
    // current design (respected as seed, guarded against regression) AND a
    // clean slate (fresh exploration — an already-optimized seed converges
    // instantly and would otherwise just confirm itself). Best one wins.
    // The clean-slate exploration seed runs as a PRIORITY CLUSTER (setpoint
    // ±5%): a 5% priority nudge kicks the search into a different, often better
    // basin (Sander's 50→55% flip), and ranking the cluster on the setpoint
    // yardstick lets the optimizer land there itself instead of the user
    // hunting with the slider. Only the fresh explorer clusters (+2 runs); the
    // current-design seed and the re-seed rounds stay single runs.
    // The round LOOP itself runs in the optimizer worker (runVfRounds): the
    // per-round counter ticks via progress messages, Cancel terminates.
    const clean = defaultVFilters();
    const currentIsClean = !isActive(vFilters.woofer) && !isActive(vFilters.tweeter);
    const seedQueue: { specs: typeof vFilters; inv: boolean; cluster?: boolean }[] = currentIsClean
      ? [{ specs: vFilters, inv: inverted, cluster: true }]
      : [
          { specs: vFilters, inv: inverted },
          { specs: clean, inv: false, cluster: true },
        ];
    runVfRoundsTask(
      {
        grid: [...grid],
        w,
        t,
        opts,
        seedQueue,
        // Shared branch adjustment (seat re-timing included) — the optimizer
        // must design for the same listener the simulation draws.
        offsetMm: branchAdj.tweeter.offsetMm,
        trimDb: branchAdj.tweeter.trimDb,
        maxRounds: MAX_ROUNDS,
      },
      (d) => setVfProgress(d),
    )
      .then(({ best, round, totalEvals }) => {
        setVFilters((p) => ({ ...p, ...best.specs }));
        setInverted(best.inverted);
        setVfOpt(best);
        setVfRunStats({ rounds: round, evals: totalEvals });
        // Optimizer results must be visible: lift a bypass that would hide them.
        setVfBypass(false);
        // One click does it all: build the passive filter from the best result
        // and simulate it (lands in a build tab, bypass back on) — then the
        // component tuner polishes the ASSEMBLED network (next render, when the
        // sim reflects the fresh build).
        runSynthesis(best.specs);
        setPendingNetTune(true);
      })
      .catch((e) => {
        if (!(e instanceof CancelledError)) setVfError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setVfProgress(null);
        setVfBusy(false);
      });
  }

  /**
   * Synthesise a passive network from virtual-filter specs (defaults to the
   * live ones; the optimizer passes its fresh result) and drop it in the
   * WORKING tab, driving the sim. The virtual filters it replaces are
   * bypassed — leaving them on would filter twice.
   */
  function runSynthesis(specsIn?: { woofer: DriverFilterSpec; tweeter: DriverFilterSpec }) {
    // SINGLE-DRIVER path: build the solo topology from the current virtual
    // filter (series traps / shelf groups / gated Zobel — buildSoloNetwork),
    // untouched values; ⚙ Optimize components is the fitting step. The
    // two-way branch synthesis cannot serve here (its shunt corrections do
    // nothing against an ideal voltage source without a ladder).
    if (soloDriver) {
      if (!result) return;
      const model = soloDriver === 'woofer' ? 'mid' : 'tweeter';
      const z = impedances[model];
      if (!z) {
        setSynth({ mode: synthMode, error: `No measured impedance for "${model}" — add its .ZMA.` });
        return;
      }
      const grid = result.freq;
      const zOnGrid = resampleImpedance(z.freq, z.magnitude, z.phase, grid).z;
      const spec = {
        ...vFilters[soloDriver],
        eq: vFilters[soloDriver].eq.map((b) => ({ ...b, gainDb: Math.min(0, b.gainDb) })),
      };
      const { parts, structure } = buildSoloNetwork(spec, grid, zOnGrid, model);
      addDesign('Solo build', parts);
      setDesignTab('network');
      setNetworkActive(true);
      setVfBypass(true); // the network replaces the virtual filter in the sim
      setSynth({ mode: synthMode });
      setNetOptNote(
        `solo build — ${structure.join(' · ') || 'no enabled cut bands: bare generator + driver'}` +
          ' — textbook seed values; run ⚙ Optimize components to fit them',
      );
      return;
    }
    if (!result || !woofer || !tweeter || Object.keys(impedances).length === 0) return;
    const specs = specsIn ?? vFilters;
    // Optimizer flow: vFilters are being replaced in the same batch — this
    // build belongs to the NEW filters, don't let the invalidation wipe it.
    if (specsIn) synthFresh.current = true;
    try {
      const grid = result.freq;
      const zFor = (model: string) => {
        const z = impedances[model];
        if (!z) throw new Error(`No measured impedance for "${model}".`);
        return resampleImpedance(z.freq, z.magnitude, z.phase, grid).z;
      };
      // RAW driver responses (no filters applied) for acoustic-mode targets.
      // 3-way: the grid spans the UNION of the branch ranges, so a branch's
      // raw SPL must clamp at its own measurement edges — synthBanded then
      // slices exactly the measured sub-grid, so the clamped points are never
      // actually fitted (same pattern as the verification overlay).
      const rawSpl = (l: Loaded) =>
        resample(l.frd.freq, l.frd.spl, l.frd.phase, grid, threeWay ? { clampEdges: true } : undefined).spl;
      const opts = (l: Loaded) => ({
        mode: synthMode,
        phasePriority: phasePriority / 100,
        catalogSnap: catalogSnap && hasImportedCatalog(),
        // Staged design: Zobel/LCR/top-octave hold only when the bare HP/LP
        // ladder demonstrably falls short (trede 2 van de trapmethode).
        corrections: (stagedOn ? 'lean' : 'auto') as 'lean' | 'auto',
        // Per-branch FIT rms (dB), a different metric from the combined-response
        // ±dB target — kept decoupled at its calibrated value so switching the
        // user target to peak-±dB doesn't silently loosen the lean gate.
        leanTargetDb: 0.5,
        snapPrefs: snapPrefsValue(),
        ...(synthMode === 'acoustic' ? { driverSplDb: rawSpl(l) } : {}),
      });
      // Passives cannot boost: shift all driver gains down by the highest
      // one, preserving the RELATIVE balance with only attenuation. EQ bands
      // are clamped to attenuation too — the UI already prevents entering a
      // boost, this also catches any legacy positive band.
      // 3-way (trede 3): the middle branch is a spec with BOTH knees enabled —
      // deriveTopology cascades HP into LP on one series path (bandpass).
      // The optimizer never passes specsIn in 3-way (gated until trede 4), so
      // the mid spec always comes from the live vFilters.
      const midSpec = threeWay && midDrv ? vFilters.mid : null;
      // 3-way per-branch bands (trede 4b): each branch is synthesised on the
      // SLICE of the grid its own measurement covers — fitting against
      // silent-ghost points would poison the level/median logic. The result
      // arrays are padded back to the full grid with NaN so the SynthChart
      // simply draws gaps outside the branch's band.
      const subIdxFor = (l: Loaded): number[] => {
        const f0 = l.frd.freq[0];
        const f1 = l.frd.freq[l.frd.freq.length - 1];
        const idxs: number[] = [];
        for (let i = 0; i < grid.length; i++) if (grid[i] >= f0 && grid[i] <= f1) idxs.push(i);
        return idxs;
      };
      const synthBanded = (
        spec: DriverFilterSpec,
        l: Loaded,
        zModel: string,
      ): SynthesisResult => {
        const idxs = subIdxFor(l);
        if (!threeWay || idxs.length === grid.length) {
          return synthesize(spec, grid, zFor(zModel), opts(l));
        }
        const sub = idxs.map((i) => grid[i]);
        const zg = zFor(zModel);
        const zSub = idxs.map((i) => zg[i]);
        const o = opts(l);
        const r = synthesize(spec, sub, zSub, {
          ...o,
          ...(o.driverSplDb ? { driverSplDb: idxs.map((i) => o.driverSplDb![i]) } : {}),
        });
        const padC = (arr: Complex[]): Complex[] => {
          const out: Complex[] = grid.map(() => ({ re: NaN, im: NaN }));
          idxs.forEach((gi, k) => (out[gi] = arr[k]));
          return out;
        };
        const padN = (arr: number[] | undefined): number[] | undefined => {
          if (!arr) return undefined;
          const out = grid.map(() => NaN);
          idxs.forEach((gi, k) => (out[gi] = arr[k]));
          return out;
        };
        return {
          ...r,
          achieved: padC(r.achieved),
          target: padC(r.target),
          acousticAchievedDb: padN(r.acousticAchievedDb),
          acousticTargetDb: padN(r.acousticTargetDb),
        };
      };
      const gShift = Math.max(specs.woofer.gainDb, specs.tweeter.gainDb, midSpec?.gainDb ?? 0, 0);
      const shifted = (specIn: DriverFilterSpec): DriverFilterSpec => ({
        ...specIn,
        gainDb: Math.round((specIn.gainDb - gShift) * 10) / 10,
        eq: specIn.eq.map((b) => ({ ...b, gainDb: Math.min(0, b.gainDb) })),
      });
      // Canonical model name of the LOW branch shifts with the branch set.
      const lowKey = threeWay ? 'woofer' : 'mid';
      const out: SynthState = { mode: synthMode };
      if (isActive(specs.woofer))
        out.woofer = synthBanded(shifted(specs.woofer), woofer, lowKey);
      if (midSpec && isActive(midSpec) && midDrv)
        out.mid = synthBanded(shifted(midSpec), midDrv, 'mid');
      if (isActive(specs.tweeter))
        out.tweeter = synthBanded(shifted(specs.tweeter), tweeter, 'tweeter');
      if (!out.woofer && !out.mid && !out.tweeter)
        out.error = 'No active virtual filter blocks to synthesise.';
      setSynth(out);
      if (!out.error) {
        const branches: { components: SynthesizedComponent[]; model: string }[] = [];
        if (out.woofer) branches.push({ components: out.woofer.components, model: lowKey });
        if (out.mid) branches.push({ components: out.mid.components, model: 'mid' });
        if (out.tweeter) branches.push({ components: out.tweeter.components, model: 'tweeter' });
        const parts = mergeSynthesizedSchematics(branches).parts;
        if (specsIn) {
          // Optimizer flow (Optimize — design for me): the fixed Working tab.
          setWorkingDesign(parts);
        } else {
          // Manual "Build passive filter": a fresh tab each time (nothing is
          // overwritten, builds accumulate to compare) and jump to the editor.
          addDesign('Passive build', parts);
          setDesignTab('network');
          if (threeWay) {
            setNetOptNote(
              '3-way build — three per-branch fits (woofer LP · mid bandpass · tweeter HP). ' +
                'Run ⚙ Optimize components to tune the assembled sum (both crossings guarded).',
            );
          }
        }
        setVfBypass(true);
      }
    } catch (e) {
      setSynth({ mode: synthMode, error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Driver models with measured impedance available for the network editor. */
  const zModels = useMemo(() => Object.keys(impedances), [impedances]);

  // Imports open a NEW tab — peeking at a variant never costs you work.
  function importNetworkFromVariant() {
    const xo = project && xoName !== 'none' ? project.vxp.crossovers.find((c) => c.name === xoName) : undefined;
    if (!xo) return;
    addDesign(xoName, normalizeOrigin(xo.parts));
  }

  // "New from template" picker: generic starting network next to Import.
  const [templateWays, setTemplateWays] = useState<WayCount>(2);
  const [templateOrder, setTemplateOrder] = useState<FilterOrder>(2);
  function startNetworkFromTemplate() {
    // Single-driver mode: scaffold only the loaded slot — a ghost driver part
    // would just block the solve with a missing-impedance error.
    const fallback = soloDriver ? [soloDriver === 'woofer' ? 'mid' : 'tweeter'] : ['mid', 'tweeter'];
    let models = zModels.length > 0 ? zModels : fallback;
    // 3-way: the branch order matters (LP / bandpass / HP), so resolve the
    // models through pickSlotsN instead of trusting zModels' load order. In
    // 3-way mode the models are the canonical woofer/mid/tweeter names, so
    // this always resolves; an exotic set falls back to the blank scaffold.
    let order = templateOrder;
    if (threeWay) {
      const slots = pickSlotsN(models.map((m) => ({ model: m })));
      if (slots.woofer && slots.mid && slots.tweeter) {
        models = [slots.woofer.model, slots.mid.model, slots.tweeter.model];
      } else {
        order = 0;
      }
    }
    const xo = filterTemplate({ order, wayCount: threeWay ? 3 : templateWays, models });
    addDesign(xo.name || 'New network', normalizeOrigin(xo.parts));
  }

  /** Manual "Build passive filter" runs the synchronous synthesis — the
   *  flag paints the busy overlay before the solver blocks the thread. */
  const [synthBusy, setSynthBusy] = useState(false);
  /** Passive-in-the-loop: re-fit the ACTIVE tab's unlocked component values
   *  against the measured combined response. 🔒 parts keep their value. */
  const [netOptBusy, setNetOptBusy] = useState(false);
  // Elapsed ticker for the busy overlay's totals line (restarts per run).
  const anyBusy = vfBusy || netOptBusy || synthBusy;
  useEffect(() => {
    if (!anyBusy) {
      setBusyElapsed(0);
      return;
    }
    const t0 = Date.now();
    const iv = setInterval(() => setBusyElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [anyBusy]);
  /** Overlay visibility with a short LINGER: busy-flag handoffs (vf-rounds →
   *  synchronous build → assembled tune) have one-frame gaps that made the
   *  popup blink for milliseconds (Sanders glitch-melding). Show immediately,
   *  hide only when no busy flag returns within 250 ms. */
  const [overlayVisible, setOverlayVisible] = useState(false);
  /** Frozen busy-card body shown during the close-linger (see render). */
  const busyCardBodyRef = useRef<ReactNode>(null);
  useEffect(() => {
    if (anyBusy) {
      setOverlayVisible(true);
      return;
    }
    const t = setTimeout(() => setOverlayVisible(false), 250);
    return () => clearTimeout(t);
  }, [anyBusy]);

  const [netOptNote, setNetOptNote] = useState<string | null>(null);
  /**
   * F2b — the last v2 scan's run stamp and its per-candidate gate verdicts.
   *
   * Null whenever the last scan ran on v1, which is the honest default: a
   * fingerprint on a table that was not produced by the run it names is worse
   * than no fingerprint. Cleared at the start of every scan.
   */
  const [v2Run, setV2Run] = useState<{
    stamp: V2RunStamp;
    /** Keyed by candidate label — the same labels the scan table rows carry. */
    gatesByLabel: Record<string, { verdicts: GateVerdict[]; violation: string | null }>;
  } | null>(null);
  /**
   * F3 — the SHORTLIST the last v2 scan produced: the feasible region, spread
   * over topologies, with its own two-stage stamp. Null when the last scan ran
   * on v1 or produced nothing.
   */
  const [v2Shortlist, setV2Shortlist] = useState<Shortlist<Chain3Result> | null>(null);
  /**
   * F4b — what the v2 run SUBSTITUTED or REFUSED before it started.
   *
   * Today that is the pin: on the v2 route an unstated handover is pinned from
   * the A5d.3 window, or not pinned at all, and neither may happen silently
   * (audit §7). A run that quietly used a v1 default frequency looks exactly
   * like a run that was told to use it.
   */
  const [v2RunNotes, setV2RunNotes] = useState<string[]>([]);
  /** Which shortlist column the table is sorted on. Presentation only. */
  const [shortlistSort, setShortlistSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  /**
   * UI-1 — the shortlist row currently loaded in the Working tab, by label.
   *
   * Null means nothing from this shortlist is loaded, which after a run with
   * an empty feasible region is the correct and deliberate state: the design
   * on screen is whatever was there before, and the v1 ranking's winner is not
   * a substitute for a list that came out empty (`selection.ts`).
   */
  const [shortlistPick, setShortlistPick] = useState<string | null>(null);
  /**
   * UI-1 — M-F-FINAL PER SHORTLIST ROW: the vertical lobing synthesis.
   *
   * The one lobing quantity that is allowed to carry a judgement (V20a). The
   * four λ-fractions next door are reported and never ranked, because for a
   * way with N sources there is no single distance that summarises the pair;
   * the vertical synthesis has no such problem — it sums the actual sources at
   * their actual heights through the actual filter.
   *
   * A COLUMN AND NOT A CRITERION. Nothing filters, spreads, sorts or gates on
   * it: A5e.1 forbids a second opinion about which designs exist, and casus 1
   * states no lobing limit, so per P4 there is nothing to judge. What it is
   * for is the question a number in a table answers and prose does not — this
   * design is 0.4 dB flatter and collapses three dB harder at 15°.
   *
   * Computed through `buildV2Report`, the same path the panel uses, so a row
   * and the panel can never print two different dips for one network. One
   * report per row, on a list of ten, only when the list changes.
   */
  const shortlistLobing = useMemo(() => {
    const out: Record<string, { dipDb: number; atHz: number } | null> = {};
    if (!v2Shortlist) return out;
    for (const r of v2Shortlist.rows) {
      let v: { dipDb: number; atHz: number } | null = null;
      try {
        const l = buildV2Report({ name: r.label, parts: r.parts })?.report?.metrics.lobingFinal;
        if (l && l.worstDipInCrossoverDb !== null && l.worstInCrossoverAtHz !== null) {
          v = { dipDb: l.worstDipInCrossoverDb, atHz: l.worstInCrossoverAtHz };
        }
      } catch {
        // A row whose report cannot be built shows an empty cell, exactly as a
        // row with no crossover region does. It may not show a zero: 0.0 dB of
        // vertical deviation is what a coplanar or single-source set reports,
        // and that is the arithmetic of a missing input rather than a result.
        v = null;
      }
      out[r.label] = v;
    }
    return out;
  }, [v2Shortlist, buildV2Report]);
  /** Old → new component values of the last tune run ("⚙ Optimize
   *  components" / auto-tune) — makes the tuner inspectable: you see WHERE
   *  it found its gains instead of just "N components tuned" (Sanders wens,
   *  jul 2026). Cleared when a new design lands from the Optimize flow. */
  const [netOptDiff, setNetOptDiff] = useState<
    { id: string; from: number; to: number; unit: string }[] | null
  >(null);
  /** GATE 4 report of the last component tune (partAudit.ts): per part the
   *  absolute deltas without it and the verdict — the physical answer to
   *  "does this part do anything", including for parts the tune kept. */
  const [netOptAudit, setNetOptAudit] = useState<NetworkAudit | null>(null);
  /** C — the minimize ("afslank") pass report for the active design. Never
   *  applied silently: the user reads BOM before/after + deltas and chooses
   *  "Apply as new tab". */
  const [minimizeReport, setMinimizeReport] = useState<{ base: string; r: MinimizeResult } | null>(null);
  const [minimizeBusy, setMinimizeBusy] = useState(false);
  function runMinimize() {
    if (minimizeBusy || !activeDesign || !sim || Object.keys(impedances).length === 0) return;
    const grid = sim.combined.freq;
    const zOnGrid = zGridWithSlots(impedances, grid);
    const present = [woofer, threeWay ? midDrv : null, tweeter].filter((d): d is Loaded => d !== null);
    const safety = (() => {
      if (present.length === 0) return undefined;
      const lo = Math.max(200, ...present.map((d) => d.frd.freq[0]));
      const hi = Math.min(20000, ...present.map((d) => d.frd.freq[d.frd.freq.length - 1]));
      if (!(hi > lo * 1.5)) return undefined;
      const sGrid = logspace(lo, hi, 240);
      const silent = { freq: sGrid, spl: sGrid.map(() => -400), phaseDeg: sGrid.map(() => 0) };
      return {
        freqs: sGrid,
        w: woofer ? resample(woofer.frd.freq, woofer.frd.spl, woofer.frd.phase, sGrid) : silent,
        t: tweeter ? resample(tweeter.frd.freq, tweeter.frd.spl, tweeter.frd.phase, sGrid) : silent,
        m: threeWay && midDrv ? resample(midDrv.frd.freq, midDrv.frd.spl, midDrv.frd.phase, sGrid) : undefined,
        z: zGridWithSlots(impedances, sGrid),
      };
    })();
    const tuneOpts = buildNetOptOpts(grid, safety);
    const targets = { rippleDb: rippleTargetEff(), phaseDeg: soloDriver ? 3600 : num(targetPhase, 10) };
    setMinimizeBusy(true);
    setNetOptStages([]);
    setNetOptPlan(['minimize: baseline', 'minimize: removal rounds', 'minimize: substitution']);
    setNetOptBusy(true);
    runMinimizeTask(
      {
        parts: [...activeDesign.parts],
        grid: [...grid],
        w: sim.base.w,
        t: sim.base.t,
        z: zOnGrid,
        adjust: branchAdj.tweeter,
        opts: {
          targets,
          rSourceLimitOhm,
          fbHz: Number(cabinet.drivers.low.fbHz) > 0 ? Number(cabinet.drivers.low.fbHz) : undefined,
          tuneOpts,
        },
      },
      (stage) => setNetOptStages((p) => [...p, stage]),
    )
      .then((r) => setMinimizeReport({ base: activeDesign.name, r }))
      .catch((e) => setNetOptNote(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        setMinimizeBusy(false);
        setNetOptBusy(false);
      });
  }
  /** Crossover-scan results as STRUCTURED rows — rendered as a small table
   *  instead of one long note line (readability; Sanders UX-ronde). Each row
   *  carries its FULL chain result: clicking a row loads that candidate's
   *  design into Working (Sanders "keuzelijst") — the scan is a menu, not
   *  just a report. Session-only (not persisted). */
  const [chainScan, setChainScan] = useState<{
    rows: {
      label: string;
      rippleDb: number;
      /** Peak of the error-smoothed sum (what the search judged); shown in the
       *  column, the raw rippleDb in the tooltip. */
      peakSmoothedDb: number | null;
      /** Fitted power-response slope of the delivered design (dB/decade). */
      powerSlopeDbDec: number | null;
      /** Source resistance at the low driver (Ω) from the part audit; null = unknown. */
      rSourceOhm: number | null;
      /** Disqualification reasons (fix 1/2); empty = in the race. */
      disqualified: string[];
      /** Per-pair physics-floor verdict (3-way). */
      xoFloorVerdict: ('ok' | 'warn' | 'fail' | null)[] | null;
      /** Whole-range avg |deviation| — the number the ranking judges on. */
      avgDevDb: number | null;
      phaseDeg: number;
      bomEur: number | null;
      /** Delivered minimum system |Zin| — what the amplifier sees. Shown
       *  because the ranking now judges it: a criterion you cannot read is a
       *  criterion you cannot argue with. null for 2-way rows. */
      zMinOhm: number | null;
      /** Physics verdict on the delivered handovers (3-way; null = unjudged
       *  or 2-way row) + the delivered overlap width per pair in octaves. */
      xoWindowOk: boolean | null;
      pairOverlapOct: (number | null)[] | null;
      winner: boolean;
      /** LABEL = MEASURED HANDOVER (Sanders' rule 8): the row is named after
       *  the crossing the tuned network actually DELIVERS, not after the
       *  candidate it aimed at. `target` keeps the aim (and stays the row key);
       *  `unrealisable` marks a delivery more than ⅓ octave off its aim — a
       *  diagnosis (the window or the topology binds), not cosmetics. */
      delivered: string;
      target: string;
      unrealisable: boolean;
      /** 2-way and 3-way scans produce different result shapes; the table only
       *  displays numbers, so it carries either and the loader branches. */
      result: ChainResult | Chain3Result;
    }[];
    /** Label of the row currently loaded in Working. */
    active: string;
  } | null>(null);

  /**
   * Candidates recovered from a scan that never finished (scanStore.ts).
   *
   * Offered rather than applied: they are somebody's interrupted work, and
   * silently repopulating a table the user did not ask for would be a second
   * surprise on top of the crash. Null = nothing to offer.
   */
  const [rescued, setRescued] = useState<{ runId: string; label: string; rows: Chain3Result[] } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const runs = await listScanRuns();
      if (runs.length === 0) return;
      const counts: Record<string, number> = {};
      for (const r of runs) counts[r.runId] = (await listScanRows<Chain3Result>(r.runId)).length;
      const { resume, drop } = pickResumable(runs, counts);
      for (const id of drop) void dropScanRun(id);
      if (!resume || !alive) return;
      const rows = await listScanRows<Chain3Result>(resume.runId);
      if (alive && rows.length > 0) setRescued({ runId: resume.runId, label: resume.label, rows });
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** The design that was on screen when the scan started — the row every
   *  candidate has to beat. Measured, never ranked. */
  type ScanReference = {
    name: string;
    peakDb: number;
    avgDevDb: number | null;
    phaseDeg: number;
    zMinOhm: number | null;
    rSourceOhm: number | null;
    bomEur: number | null;
    partCount: number;
  };
  const [scanReference, setScanReference] = useState<ScanReference | null>(null);

  /** Scan-table sort: click a header to sort by that column (asc → desc →
   *  back to the RANKING order, which is the default and keeps 🏆 on top). */
  /** B3 — Pareto view of the scan: BOM on x, a quality measure on y, the
   *  non-dominated candidates marked; click loads. The knee is a human
   *  decision, not a weight. */
  const [paretoY, setParetoY] = useState<'peak' | 'avg' | 'phase'>('peak');
  const [scanSort, setScanSort] = useState<{
    key: 'xo' | 'ripple' | 'avg' | 'phase' | 'ovl' | 'zmin' | 'rs' | 'bom';
    dir: 1 | -1;
  } | null>(null);

  function toggleScanSort(key: 'xo' | 'ripple' | 'avg' | 'phase' | 'ovl' | 'zmin' | 'rs' | 'bom') {
    setScanSort((s0) =>
      s0?.key !== key ? { key, dir: 1 } : s0.dir === 1 ? { key, dir: -1 } : null,
    );
  }

  /**
   * One scan row from one candidate — ONE mapping, two callers (the commit
   * after a scan, and the rescue of an interrupted one). Two copies of this
   * would be the A6b mistake again: a rescued row measured differently from
   * the row it replaces.
   */
  const chain3ScanRow = (rr: Chain3Result, win: Chain3Result | null) => {
                    // In a sweep round the HELD axis is an anchor, not an aim:
                    // only the swept axis can be "not realisable".
                    // (point 5b) The WINNER is judged on BOTH axes regardless of
                    // the round it came from — a missed delivery on the held
                    // axis must not stay invisible on the design you get.
                    const heldLow = rr !== win && /\(M-T sweep\)/.test(rr.label);
                    const heldHigh = rr !== win && /\(W-M sweep\)/.test(rr.label);
                    const dl = deliveredLabel(
                      [heldLow ? null : rr.xoLow, heldHigh ? null : rr.xoHigh],
                      rr.net.after.xoHzPairs ?? [null, null],
                      ['W-M', 'M-T'],
                    );
                    return {
                      label: rr.label,
                      delivered: dl.text,
                      target: rr.label,
                      unrealisable: dl.unrealisable,
                      rippleDb: rr.net.after.rippleDb,
                      peakSmoothedDb: rr.net.after.ripplePeakSmoothedDb ?? null,
                      powerSlopeDbDec: rr.net.after.powerSlopeDbDec ?? null,
                      // The DELIVERED figure — the audit's is frozen before the
                      // shrink ladder and the snap, so the column and the
                      // ranking would disagree about the same row.
                      rSourceOhm: rSrcDelivered(rr),
                      disqualified: rr.disqualified ?? [],
                      xoFloorVerdict: rr.xoFloorVerdict ?? null,
                      avgDevDb: rr.net.after.avgDevDb ?? null,
                      phaseDeg: rr.net.after.phaseDeg,
                      zMinOhm: rr.net.after.zMinOhm ?? null,
                      xoWindowOk: rr.xoWindowOk,
                      pairOverlapOct: rr.pairOverlapOct,
                      bomEur: rr.bomTotalEur,
                      winner: rr === win,
                      result: rr,
                    };
  };

  /** Load a scan candidate's complete design (specs + synth + tuned network)
   *  into Working — same application as the winner gets, undo-able. */
  function applyScanCandidate(row: { label: string; result: ChainResult | Chain3Result }) {
    const r = row.result;
    if ('vf' in r) {
      // 2-way: the candidate carries a virtual-filter result.
      setVFilters((p) => ({ ...p, ...r.vf.specs }));
      setInverted(r.vf.inverted);
      setVfOpt(r.vf);
      synthFresh.current = true;
      setSynth({ mode: synthMode, woofer: r.synthWoofer, tweeter: r.synthTweeter });
    } else {
      // 3-way: specs per branch plus the polarity the structure search chose.
      // Apply exactly what the winner gets — same fields, same order — or a
      // loaded row would simulate something other than what was fitted.
      setVFilters((p) => ({ ...p, ...r.specs }));
      setMidInverted(r.midInverted);
      setInverted(r.tweeterInverted);
      synthFresh.current = true;
      setSynth({
        mode: synthMode,
        woofer: r.synthWoofer,
        mid: r.synthMid,
        tweeter: r.synthTweeter,
      });
      setVfOpt(null);
      setVfRunStats(null);
      setNetworkActive(true);
    }
    setWorkingDesign(r.parts);
    setVfBypass(true);
    setNetOptDiff(null);
    // The candidate's own part audit (poort 4) travels with it: which parts
    // earned their place, which are inert — the "why 23 parts" question.
    setNetOptAudit(r.net.audit ?? null);
    setChainScan((c) => (c ? { ...c, active: row.label } : c));
  }
  /**
   * UI-1 — load a shortlist row into the Working tab and every chart.
   *
   * The DECISION is `selectFromShortlist` (one implementation, tested without
   * a browser); this only applies its answer, through exactly the same
   * `applyScanCandidate` the scan table has always used — same fields, same
   * order — so a shortlist row and a scan row cannot land differently.
   *
   * A refused candidate reaches here only if something makes one clickable,
   * which the rendering deliberately does not; it is handled anyway, because a
   * guard at the decision is worth more than a guard at every call site.
   */
  function loadShortlistRow(label: string) {
    const sel = selectFromShortlist(v2Shortlist, label);
    if (sel.kind === 'design') {
      applyScanCandidate({ label: sel.label, result: sel.result });
      setShortlistPick(sel.label);
    }
    setNetOptNote(sel.describe);
  }

  /** One-click chain: after Optimize→Build lands in Working, auto-run the
   *  component tuner ON THE ASSEMBLY — branch syntheses are judged per
   *  branch, only the tuner judges the built SUM (phase included). */
  const [pendingNetTune, setPendingNetTune] = useState(false);
  useEffect(() => {
    if (!pendingNetTune || netOptBusy) return;
    if (!activeDesign || !sim) return;
    setPendingNetTune(false);
    runNetOptimize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNetTune, sim, activeDesign, netOptBusy]);

  /** The tuner options as the ⚙ settings define them — shared by Optimize
   *  components and the minimize pass so the two judge the same way. */
  /** What the design you ALREADY HAVE scores, on the scan's own yardstick.
   *
   *  WHY (aug 2026, Sanders: "van alle pogingen hebben we maar 1 goede… ik vind
   *  dit een kwalijke zaak"): a scan that ranks only its own candidates will
   *  always crown one, even when every single one is worse than the network
   *  the designer already built. His hand-made filter beat all nineteen rows
   *  on source resistance and price, and nothing on screen said so — he had to
   *  find that out by hand. So the table carries a REFERENCE row, measured
   *  through the same pipeline (one solve, no tuning: the metrics come from
   *  `before`, so the reference cannot flatter itself with another yardstick).
   *
   *  Measured only, never ranked: it does not compete, it judges the winner. */
  function measureReferenceDesign(
    parts: readonly VxpPart[],
    grid: readonly number[],
    zOnGrid: Record<string, readonly Complex[]>,
    safety: NetOptimizeOptions['safety'],
  ): ScanReference | null {
    if (!sim) return null;
    const rlc = parts.filter((p) => /^(Resistor|Inductor|Capacitor)$/.test(p.type));
    if (rlc.length === 0) return null;
    try {
      const fb = Number(cabinet.drivers.low.fbHz) > 0 ? Number(cabinet.drivers.low.fbHz) : undefined;
      const r = optimizeNetworkValues(
        // One free part so the tuner accepts the network; maxIterations 1 plus
        // reading `before` means nothing it does can reach the numbers.
        parts.map((p, i) => (p === rlc[rlc.length - 1] && i >= 0 ? { ...p, locked: false } : p)),
        grid,
        sim.base.w,
        sim.base.t,
        zOnGrid,
        branchAdj.tweeter,
        {
          ...buildNetOptOpts(grid, safety),
          maxIterations: 1,
          catalogSnap: false,
          staged: undefined,
          audit: { enabled: false },
        },
      );
      const bom = bomFor([...parts]);
      return {
        name: activeDesign?.name ?? 'current design',
        peakDb: r.before.rippleDb,
        avgDevDb: r.before.avgDevDb ?? null,
        phaseDeg:
          r.before.pairPhaseDeg && r.before.pairPhaseDeg.length > 0
            ? Math.max(...r.before.pairPhaseDeg)
            : r.before.phaseDeg,
        zMinOhm: r.before.zMinOhm ?? null,
        rSourceOhm: sourceResistanceOhm([...parts], { grid, driverZ: zOnGrid, fbHz: fb }),
        bomEur: bom.totalEur,
        partCount: rlc.length,
      };
    } catch {
      return null;
    }
  }

  const buildNetOptOpts = (grid: readonly number[], safety: NetOptimizeOptions['safety']): NetOptimizeOptions => ({
        // Single-driver mode: "0 driver pairs" — the tuner drops every
        // crossing-anchored term and judges branch flatness (+ amp floor).
        solo: !!soloDriver,
        // Floor mode: the tuner may spend down to the target level, no further.
        soloSensitivityDb:
          soloFloorOn && soloFloorInfo
            ? Math.max(0, soloFloorInfo.median - soloFloorInfo.floor)
            : num(soloSensDb, 6),
        soloTargetLevelDb: soloFloorOn && soloFloorInfo ? soloFloorInfo.floor : undefined,
        phasePriority: phasePriority / 100,
        angleData: angleResponsesOn(grid) ?? undefined,
        directivityWeight: dirWeight / 100,
        powerMetric,
        powerFoldWeight,
        errorSmoothOct,
      costWeight,
        dissipationWeight,
        ampTarget,
        breakupGuard,
        staged: stagedOn
          ? { rippleDb: rippleTargetEff(), phaseDeg: soloDriver ? 3600 : num(targetPhase, 10) }
          : undefined,
        // 3-way (trede 4a): the middle branch turns on the two-pair path.
        // The crossover pin and directivity terms are 2-way vocabulary and
        // stay off; acoustic slopes steer the TOP pair (mid/tweeter).
        midBranch:
          threeWay && sim?.mid && midDrv
            ? {
                response: sim.base.m!,
                adjust: branchAdj.mid,
              }
            : undefined,
        xoRange: soloDriver || threeWay ? undefined : xoRangeValue() ?? undefined,
        xoRangePairs:
          threeWay && xoRangeOn
            ? (() => {
                const pr = (pin?: { freq: number; margin: number }): [number, number] | null =>
                  pin
                    ? [
                        pin.freq - Math.max(pin.margin, pin.freq * 0.02),
                        pin.freq + Math.max(pin.margin, pin.freq * 0.02),
                      ]
                    : null;
                const pins = xoPinsValue();
                return [pr(pins.low), pr(pins.high)];
              })()
            : undefined,
        phaseMetric: phaseMetricMode,
        acousticSlopes: soloDriver ? undefined : acousticSlopesValue() ?? undefined,
        catalogSnap: catalogSnap && hasImportedCatalog(),
        snapPrefs: snapPrefsValue(),
        band: (evalBand
          ? [evalBand.fromHz, evalBand.toHz]
          : [Math.max(300, grid[0]), Math.min(grid[grid.length - 1] * 0.975, num(fMax, 20000))]) as [
          number,
          number,
        ],
        safety,
        ampMinLoadOhm: ampMinLoadOhm ?? undefined,
        // Gate 4: the source-resistance verdict is taken at the low branch's
        // box tuning when the designer entered one; otherwise at its Z peak.
        audit: {
          thresholds: { rSourceOhm: rSourceLimitOhm },
          fbHz: Number(cabinet.drivers.low.fbHz) > 0 ? Number(cabinet.drivers.low.fbHz) : undefined,
        },
      
  });

  function runNetOptimize() {
    const refusal = refuseIfUnverified();
    if (refusal) {
      // Shown WHERE THE BUTTON IS. setError paints the banner on the import
      // step, so a refusal raised from the Network tab would look like a
      // button that does nothing — the exact silent failure this whole step
      // exists to remove.
      setNetOptNote(`⚠ ${t('Cannot tune yet')} — ${refusal}`);
      setError(`Cannot tune yet — ${refusal}`);
      return;
    }
    // Guard against programmatic double-starts (the button is disabled while
    // busy, but a second overlapping run would interleave stage labels).
    if (netOptBusy) return;
    if (!activeDesign || !sim || Object.keys(impedances).length === 0) return;
    const seedParts = [...activeDesign.parts];
    setNetOptBusy(true);
    setNetOptNote(null);
    setNetOptDiff(null);
    setNetOptStages([]);
    setNetOptPlan([
      'value tune',
      ...(stagedOn ? ['prune sweep', 'escalation'] : []),
      'drift check',
      'cap shrink ladder',
      'amp-load floor',
      ...(catalogSnap && hasImportedCatalog() ? ['catalog snap'] : []),
    ]);
    setChainScan(null);
    const grid = sim.combined.freq;
    const zOnGrid = zGridWithSlots(impedances, grid);
    // Full-measurement-band safety data: the view range is the design
    // scope, but the tuner's fundamentals (crossing, valley, protection)
    // must hold on the WHOLE measurement — a zoomed view must not let a
    // branch die out of sight.
    const safety = (() => {
      // Solo: the safety grid covers the one measured driver; the ghost slot
      // stays silent (only the pair-independent fundamentals — amp-load
      // floor — gate there). 3-way: the mid rides along on the safety grid.
      const present = [woofer, threeWay ? midDrv : null, tweeter].filter(
        (d): d is Loaded => d !== null,
      );
      if (present.length === 0) return undefined;
      const lo = Math.max(200, ...present.map((d) => d.frd.freq[0]));
      const hi = Math.min(20000, ...present.map((d) => d.frd.freq[d.frd.freq.length - 1]));
      if (!(hi > lo * 1.5)) return undefined;
      const sGrid = logspace(lo, hi, 240);
      const silent = { freq: sGrid, spl: sGrid.map(() => -400), phaseDeg: sGrid.map(() => 0) };
      return {
        freqs: sGrid,
        w: woofer ? resample(woofer.frd.freq, woofer.frd.spl, woofer.frd.phase, sGrid) : silent,
        t: tweeter ? resample(tweeter.frd.freq, tweeter.frd.spl, tweeter.frd.phase, sGrid) : silent,
        ...(threeWay && midDrv
          ? { m: resample(midDrv.frd.freq, midDrv.frd.spl, midDrv.frd.phase, sGrid) }
          : {}),
        z: zGridWithSlots(impedances, sGrid),
      };
    })();
    // Off the main thread: the tuner runs in the optimizer worker — the UI
    // stays live and the busy overlay's Cancel button can terminate the run.
    runNetOptimizeTask({
      parts: seedParts,
      grid: [...grid],
      w: sim.base.w,
      t: sim.base.t,
      z: zOnGrid,
      adjust: branchAdj.tweeter,
      opts: buildNetOptOpts(grid, safety),
    }, (stage) => setNetOptStages((p) => [...p, stage]))
      .then((r) => {
        if (!r.safetyNote) {
          commitSchematic(r.parts); // undo-able, sim follows live
          setNetworkActive(true);
          setNetOptDiff(diffTunedParts(seedParts, r.parts));
        }
        setNetOptAudit(r.audit ?? null);
        setNetOptNote(
          r.safetyNote
            ? `⚠ ${r.safetyNote}` + (r.ampFloorNote ? ` · ${r.ampFloorNote}` : '')
            : `${r.tuned} components tuned (${r.evaluations.toLocaleString('nl-NL')} sims) — ` +
                `peak ${r.before.rippleDb.toFixed(2)} → ${r.after.rippleDb.toFixed(2)} dB` +
                (r.before.avgDevDb !== undefined && r.after.avgDevDb !== undefined
                  ? ` · avg ${r.before.avgDevDb.toFixed(2)} → ${r.after.avgDevDb.toFixed(2)} dB`
                  : '') +
                // Solo: relative phase does not exist — don't report a fake 0°.
                (soloDriver ? '' : ` · phase ${r.before.phaseDeg.toFixed(1)}° → ${r.after.phaseDeg.toFixed(1)}°`) +
                (r.removed.length > 0 ? ` · pruned: ${r.removed.join(', ')}` : '') +
                (r.audit && r.audit.entries.some((e) => e.applied)
                  ? ` · audit removed inert: ${r.audit.entries.filter((e) => e.applied).map((e) => e.label).join(', ')}`
                  : '') +
                (r.audit?.rSourceWarn && r.audit.rSourceTunedOhm !== null
                  ? ` · ⚠ source R at the low driver ${r.audit.rSourceTunedOhm.toFixed(2)} Ω @ ${Math.round(r.audit.rSourceAtHz ?? 0)} Hz (Qes ×${(r.audit.qesFactor ?? 1).toFixed(2)})`
                  : '') +
                (r.added.length > 0 ? ` · bypass-C added: ${r.added.join(', ')}` : '') +
                (r.snapNote ? ` · ${r.snapNote}` : '') +
                (r.valueWindowNote ? ` · ${r.valueWindowNote}` : '') +
                (r.ampFloorNote ? ` · ⚠ ${r.ampFloorNote}` : ''),
        );
      })
      .catch((e) => {
        if (!(e instanceof CancelledError)) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setNetOptBusy(false));
  }

  /** User-imported catalog series survive across sessions and projects. */
  const CUSTOM_CATALOG_KEY = 'ads-custom-catalog';
  /** Series switched OFF — a preference, so it lives beside the catalog
   *  rather than inside it: re-importing a catalog must not resurrect stock
   *  you rejected, and an exported catalog stays a description of what
   *  exists rather than of what one person happens to like. */
  const CATALOG_OFF_KEY = 'ads-catalog-off';
  useEffect(() => {
    // Order matters: the off-list is resolved against the loaded series.
    const stored = localStorage.getItem(CUSTOM_CATALOG_KEY);
    if (stored) {
      void (async () => {
        try {
          const imp = deserializeCatalog(await unpackFromStorage(stored));
          applyCatalogSeries(imp.series, imp.parts);
        } catch {
          // Unreadable custom catalog: leave it in place, run with built-ins.
        }
      })();
    }
    try {
      const off = JSON.parse(localStorage.getItem(CATALOG_OFF_KEY) ?? '[]');
      if (Array.isArray(off)) setDisabledSeries(off.filter((x) => typeof x === 'string'));
    } catch {
      // Unreadable preference: everything stays in use.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Load the priced demo catalog on its own. It used to arrive ONLY with
   * "Load KOAN demo data", so anyone who cleared it, or who loaded their own
   * project, had no way back to a priced library — and the catalog is what
   * makes snapping and the BOM mean anything. Replacing an imported one is a
   * real loss of the user's own work, so that case asks first.
   */
  function loadDemoCatalog() {
    if (hasImportedCatalog()) {
      askConfirm(
        t('Replace the catalog now loaded with the demo catalog?'),
        t('Replace'),
        () => loadDemoCatalogNow(),
      );
      return;
    }
    loadDemoCatalogNow();
  }
  function loadDemoCatalogNow() {
    try {
      const imp = deserializeCatalog(demoCatalog);
      applyCatalogSeries(imp.series, imp.parts);
      void storeCompressed(CUSTOM_CATALOG_KEY, serializeCatalog(imp.series, imp.parts), t('The catalog'));
      setPersistNote(
        t('Demo catalog loaded — {n} priced SKUs (snap, BOM and inspector use them)', { n: imp.parts.length }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function exportCatalog() {
    const blob = new Blob([serializeCatalog(allSeries(), customCatalogParts())], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'components.adscatalog.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Commit the catalog manager's edited catalog (custom series + exact
   *  SKUs): same persistence path as a file import. */
  function saveCatalogParts(series: CatalogSeries[], parts: CatalogPart[], off: string[] = []) {
    applyCatalogSeries(series, parts);
    setDisabledSeries(off);
    if (off.length > 0) localStorage.setItem(CATALOG_OFF_KEY, JSON.stringify(off));
    else localStorage.removeItem(CATALOG_OFF_KEY);
    if (series.length === 0 && parts.length === 0) {
      // An empty custom catalog would be rejected on the next load — built-ins
      // take over, so drop the stored blob instead of persisting an invalid one.
      localStorage.removeItem(CUSTOM_CATALOG_KEY);
    } else {
      void storeCompressed(CUSTOM_CATALOG_KEY, serializeCatalog(series, parts), t('The catalog'));
    }
    setPersistNote(
      t('Catalog updated — {n} exact SKUs active', { n: parts.length }) +
        (off.length > 0 ? ` · ${t('{n} series switched off', { n: off.length })}` : '') +
        ` ${t('(snap, BOM and inspector use them)')}`,
    );
    setCatalogMgrOpen(false);
  }

  async function importCatalogFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await importCatalogFile(file);
  }

  async function importCatalogFile(file: File) {
    setError(null);
    try {
      const imp = deserializeCatalog(await file.text());
      applyCatalogSeries(imp.series, imp.parts);
      void storeCompressed(CUSTOM_CATALOG_KEY, serializeCatalog(imp.series, imp.parts), t('The catalog'));
      setPersistNote(t('Imported catalog {name} — series available in the editor inspector', { name: file.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Design report: the active design as ONE standalone, printable HTML file
   * that this app can also read back (Sanders idea — no second format, the
   * `.adsfilter` payload rides along hidden inside it).
   *
   * The charts and the schematic are NOT redrawn: it captures the SVG the app
   * has already rendered, so the report cannot disagree with the screen the
   * designer exported it from. Two consequences handled here: the captured
   * markup styles itself through CSS variables (resolved in the LIGHT theme,
   * because paper is white), and the legend is a DOM element beside the SVG,
   * so it travels as data.
   */
  function exportReport() {
    if (!activeDesign) return;
    const root = document.documentElement;
    // Resolve the palette as it looks on paper, whatever the app is wearing.
    const themeBefore = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'light');
    const cs = getComputedStyle(root);
    const cssVars = [
      'viz-grid', 'viz-axis', 'viz-tick', 'viz-woofer', 'viz-mid', 'viz-tweeter',
      'viz-combined', 'viz-null', 'viz-ghost1', 'viz-ghost2', 'viz-ghost3', 'viz-ghost4',
    ]
      .map((n) => `--${n}:${cs.getPropertyValue(`--${n}`).trim()};`)
      .join(' ');

    const sections: ReportSection[] = [];
    const summary: ReportRow[] = [];
    const push = (label: string, value: string | null | undefined, note?: string) => {
      if (value) summary.push({ label, value, ...(note ? { note } : {}) });
    };
    push('Design', activeDesign.name);
    push('Drivers', threeWay ? 'three-way' : soloDriver ? 'single driver' : 'two-way');
    if (combinedFlat)
      push(
        'Response flatness',
        `${Math.round(combinedFlat.score)} / 100`,
        `avg ±${combinedFlat.avgDevDb.toFixed(2)} · P95 ±${combinedFlat.p95DevDb.toFixed(
          2,
        )} · peak ±${combinedFlat.peak.devDb.toFixed(2)} dB`,
      );
    if (pairScores) {
      const pp = (n: string, p: typeof pairScores.low) =>
        push(
          `${n} handover`,
          p.integ.overlapCentreHz ? `${Math.round(p.integ.overlapCentreHz)} Hz` : '—',
          p.stats
            ? `phase avg ${p.stats.avgErrorDeg.toFixed(1)}° · P95 ${p.stats.p95ErrorDeg.toFixed(
                0,
              )}°${p.integ.bandwidth ? ` · overlap ${p.integ.bandwidth.octaves.toFixed(1)} oct` : ''}`
            : undefined,
        );
      pp('Woofer–mid', pairScores.low);
      pp('Mid–tweeter', pairScores.high);
    } else if (integration) {
      push(
        'Crossover',
        integration.overlapCentreHz ? `${Math.round(integration.overlapCentreHz)} Hz` : '—',
        phaseStats
          ? `phase avg ${phaseStats.avgErrorDeg.toFixed(1)}° · P95 ${phaseStats.p95ErrorDeg.toFixed(0)}°`
          : undefined,
      );
    }
    if (systemZInfo)
      push(
        'System impedance',
        `min ${systemZInfo.minOhm.toFixed(1)} Ω @ ${Math.round(systemZInfo.minHz)} Hz`,
        `max ${systemZInfo.maxOhm.toFixed(0)} Ω`,
      );
    if (tolBand)
      push(
        `Build tolerance ±${tolPct}%`,
        `worst ±${tolBand.worstHalfDb.toFixed(2)} dB`,
        `RSS ±${tolBand.rssHalfDb.toFixed(2)} dB · sensitive ${tolBand.perPart
          .slice(0, 3)
          .map((q) => q.id)
          .join(', ')}`,
      );
    if (timing) push('Timing', timing.ref.verdict);
    push('View range', `${num(fMin, 200)}–${num(fMax, 20000)} Hz`);
    sections.push({ title: 'Summary', rows: summary });

    // Every VISIBLE chart panel, in the order they appear on screen: the
    // à-la-carte panel choice therefore decides what the report contains.
    for (const panel of Array.from(document.querySelectorAll('.analysis-pane .panel'))) {
      const svgEl = panel.querySelector('.chart-plot svg') ?? panel.querySelector('svg');
      if (!svgEl) continue;
      const heading = panel.querySelector('h2, h3')?.textContent?.trim() || 'Chart';
      const legend = Array.from(panel.querySelectorAll('.legend-item'))
        .filter((li) => !li.classList.contains('off'))
        .map((li) => ({
          label: li.textContent?.trim() || '',
          color:
            (li.querySelector('.legend-key') as HTMLElement | null)?.style.background ||
            (li.querySelector('line') as SVGLineElement | null)?.getAttribute('stroke') ||
            'currentColor',
        }))
        .filter((l) => l.label !== '');
      sections.push({ title: heading, svg: svgEl.outerHTML, legend });
    }

    // The editor canvas (`.sch-canvas`) in the Network tab, or a read-only
    // schematic elsewhere — whichever is on screen.
    const schSvg = document.querySelector('svg.sch-canvas, .schematic svg');
    if (schSvg) sections.push({ title: 'Schematic', svg: schSvg.outerHTML, pageBreak: true });

    const bom = bomFor(activeDesign.parts);
    if (bom.rows.length > 0) {
      const unit = (row: (typeof bom.rows)[number]) =>
        row.kind === 'L'
          ? `${Number((row.value * 1e3).toPrecision(4))} mH`
          : row.kind === 'C'
            ? `${Number((row.value * 1e6).toPrecision(4))} µF`
            : `${Number(row.value.toPrecision(4))} Ω`;
      sections.push({
        title:
          `Bill of materials — ${bom.rows.length} components` +
          (bom.totalEur !== null
            ? ` · ${bom.pricedCount < bom.rows.length ? '≥ ' : ''}€${bom.totalEur.toFixed(2)} (${bom.pricedCount}/${bom.rows.length} priced)`
            : ''),
        rows: bom.rows.map((row) => ({
          label: row.partId,
          value: unit(row),
          note: row.match
            ? `${row.match.brand} ${row.match.series} — ${formatCatalogPart(row.match)}`
            : row.stackMatch
              ? row.stackMatch.label
              : 'no exact catalog value',
        })),
      });
    }

    root.setAttribute('data-theme', themeBefore ?? '');
    if (themeBefore === null) root.removeAttribute('data-theme');

    const html = buildReportHtml({
      title: `${activeDesign.name} — crossover design`,
      // 'none' is the vxp-variant placeholder, not a name anybody wrote.
      subtitle: xoName && xoName !== 'none' ? `VituixCAD variant: ${xoName}` : undefined,
      savedAt: new Date().toISOString().slice(0, 10),
      sections,
      cssVars,
      payloadJson: serializeFilter(activeDesign),
    });
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileSafeName(activeDesign.name, 'design')}-report.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    setPersistNote(
      t('Report exported — printable (A4), and it is also a filter file: Import filter accepts it back.'),
    );
  }

  function exportActiveFilter() {
    if (!activeDesign) return;
    const blob = new Blob([serializeFilter(activeDesign)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileSafeName(activeDesign.name, 'filter')}.adsfilter.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Export the network(s) as a VituixCAD .vxp project — the inverse of the
   * importer. Every tab becomes a crossover variant (CROSSOVER, CROSSOVER1, …),
   * exactly how VituixCAD stores Stefan's variants. Our parts already carry
   * VituixCAD grid coordinates, so each block re-serialises directly; DRIVER
   * blocks point at the loaded measurement/impedance file names.
   *
   * Measured-phase fidelity: in 'measured' mode we emit MinimumPhase=False with
   * NO Z/delay offset — the inter-driver Δ lives in the response files, so
   * VituixCAD reads the same phase the app designed on. Adding a delay on top
   * would double-count it. Only in 'minimum' mode do we hand VituixCAD the
   * tweeter Z offset it needs to reconstruct that Δ.
   */
  async function exportActiveVxp() {
    if (designs.length === 0) return;
    // VituixCAD reconstructs each driver's phase from its magnitude
    // (MinimumPhase=True); the Delay we hand it sits ON TOP of that
    // reconstruction. The correct bridge value is therefore the EXCESS-phase
    // delay (measured phase − minimum phase, fitted as a pure delay) — NOT the
    // raw bulk-delay Δ, which is contaminated by each driver's minimum-phase
    // slope. Measured on KOAN: raw Δ says tweeter +47 µs LATER, excess says
    // tweeter 50 µs EARLIER (it physically sits ~17 mm proud of the mid, as
    // Sander knew) — and the excess-based bridge reproduces our measured sim
    // within ~2° where the raw-Δ bridge was ~78° off. Delays are normalized so
    // the earliest driver gets 0 and the later one a POSITIVE delay.
    // Per ROLE, so a three-way exports its middle branch too: the normalisation
    // is over every loaded driver (earliest gets 0), which for two drivers is
    // exactly the old arithmetic.
    const exOf: Record<BranchRole, number | null> = {
      low: woofer ? excessDelayMsOf(woofer.frd) : null,
      mid: midDrv ? excessDelayMsOf(midDrv.frd) : null,
      high: tweeter ? excessDelayMsOf(tweeter.frd) : null,
    };
    // The normalisation lives in `vituixBridge.ts` since V41, so the script
    // that exports a frozen netlist for V40 hands VituixCAD the same numbers
    // this button does. Same arithmetic, one implementation.
    const delaysUs = bridgeDelaysUs(exOf);
    const delayUsFor = (role: BranchRole) => delaysUs[role] ?? 0;

    // Every VituixCAD crossover variant must have exactly ONE source (Generator),
    // else it rejects the file with "Amount of sources must be one". A tab that
    // is an incomplete network (e.g. an imported bare filter) has none — skip it
    // rather than poison the whole export.
    const genCount = (d: NetworkDesign) => d.parts.filter((p) => p.type === 'Generator').length;
    const exportable = designs.filter((d) => genCount(d) === 1);
    const skipped = designs.filter((d) => genCount(d) !== 1).map((d) => d.name);
    if (exportable.length === 0) {
      setPersistNote(
        t('Nothing to export: a VituixCAD variant needs exactly one generator (source), and no tab qualifies{skipped}. Add a generator to the network first.', { skipped: skipped.length ? ` (${skipped.join(', ')})` : '' }),
      );
      return;
    }

    // Distinct driver models across the exportable tabs, in first-seen order —
    // the DRIVER header is shared by every crossover variant in a vxp.
    const models: string[] = [];
    for (const d of exportable)
      for (const p of d.parts)
        if (p.type === 'Driver' && p.model && !models.includes(p.model)) models.push(p.model);

    // Filenames must be identical in the .vxp reference AND on disk, so we clean
    // once and use the result for both. Strip the demo suffix; ensure responses
    // carry an extension VituixCAD recognises.
    const clean = (n: string) => n.replace(/\s*\(demo\)\s*$/i, '').trim() || 'file';
    const asResponse = (n: string) => (/\.[a-z0-9]+$/i.test(n) ? n : `${n}.txt`);

    // Collect the raw text of every file we reference, keyed by its final name.
    // `place` deduplicates identical files but disambiguates a name clash between
    // DIFFERENT files, so two drivers can never silently share one response file.
    const files = new Map<string, string>();
    const missing: string[] = [];
    const place = (name: string, raw: string): string => {
      const existing = files.get(name);
      if (existing === undefined || existing === raw) {
        files.set(name, raw);
        return name;
      }
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let i = 2;
      let cand = `${stem}_${i}${ext}`;
      while (files.has(cand) && files.get(cand) !== raw) cand = `${stem}_${++i}${ext}`;
      files.set(cand, raw);
      return cand;
    };

    /* Model → ROLE via the same slot mapping the solver uses, so the export
     * survives a three-way (and refuses to guess): a mid exported as a woofer
     * would carry the wrong response, the wrong angle set and the wrong delay.
     * Two drivers resolve exactly as isTweeterModel did before. */
    const slotsN = pickSlotsN(models.map((model) => ({ model })));
    const roleOfModel = (model: string): BranchRole | null => {
      if (slotsN.ambiguous) return isTweeterModel(model) ? 'high' : 'low';
      if (slotsN.tweeter?.model === model) return 'high';
      if (slotsN.mid?.model === model) return 'mid';
      if (slotsN.woofer?.model === model) return 'low';
      return null;
    };
    const respOf: Record<BranchRole, typeof woofer> = { low: woofer, mid: midDrv, high: tweeter };
    const anglesOf = (role: BranchRole) =>
      (role === 'high' ? angleSets?.tweeter : role === 'mid' ? angleSets?.mid : angleSets?.woofer) ??
      [];
    const drivers: VxpDriver[] = models.map((model) => {
      const role = roleOfModel(model) ?? 'low';
      const onAxis = respOf[role];
      const angles = anglesOf(role);
      const src =
        angles.length > 0
          ? angles.map((a) => ({ name: asResponse(clean(a.name)), hor: a.hor, raw: a.raw }))
          : onAxis
            ? [{ name: asResponse(clean(onAxis.name)), hor: 0, raw: onAxis.raw }]
            : [];
      if (src.length === 0) missing.push(`${model} responses`);
      const responses = src.map((s) => ({ fileName: place(s.name, s.raw), hor: s.hor, ver: 0 }));
      const zStore = zStandaloneForModel(model)?.file ?? project?.impedanceFiles[model];
      let zName: string | undefined;
      if (zStore) {
        zName = place(clean(zStore.name), zStore.raw);
      } else {
        missing.push(`${model} impedance`);
      }
      return {
        model,
        // VituixCAD simulates the phase itself; each driver carries its
        // excess-phase delay (relative to the earliest driver) so the
        // reconstruction reproduces our measured relative phase.
        minimumPhase: true,
        inverted: false,
        responseDelay: delayUsFor(role),
        z: 0,
        impedanceFile: zName,
        impedanceFileName: zName,
        responses,
      };
    });

    // The active tab leads (becomes CROSSOVER, the variant VituixCAD opens on),
    // the rest follow. Only exportable tabs (exactly one source) are included.
    const activeExportable = activeDesign && genCount(activeDesign) === 1 ? activeDesign : null;
    const ordered = activeExportable
      ? [activeExportable, ...exportable.filter((d) => d.id !== activeExportable.id)]
      : exportable;
    const crossovers = ordered.map((d) => ({ name: 'CROSSOVER', parts: d.parts }));

    const names = ordered.map((d) => d.name).join(', ');
    const xml = serializeVxp(
      { drivers, crossovers },
      {
        description: `Exported from SD Acoustics Crossover Studio — ${names}`,
        // Active tab sits in slot 0 (CROSSOVER); <Variant> is the 0-based slot number.
        activeVariant: 0,
        // Carry the app's view range into VituixCAD's analysis/plot range.
        xMin: numOf(fMin, 300),
        xMax: numOf(fMax, 20000),
      },
    );
    const base = fileSafeName(ordered[0]?.name ?? 'design', 'design');
    const vxpName = `${base}.vxp`;
    files.set(vxpName, xml);

    // Name the delays by the roles that were actually exported, so a three-way
    // reads honestly instead of borrowing the two-way's "mid / tweeter".
    const bridge =
      `Minimum phase ON (VituixCAD reconstructs phase) — excess-phase delays: ` +
      (['low', 'mid', 'high'] as BranchRole[])
        .filter((r) => respOf[r] !== null && respOf[r] !== undefined)
        .map(
          (r) =>
            `${r === 'low' ? 'woofer' : r === 'mid' ? 'mid' : 'tweeter'} ${delayUsFor(r)} µs`,
        )
        .join(' / ') +
      ' carry the inter-driver timing';
    const variants =
      ordered.length > 1 ? `${ordered.length} variants (${names})` : '1 variant';
    const skippedNote = skipped.length
      ? ` Skipped ${skipped.join(', ')} (no single generator).`
      : '';
    const dataFiles = [...files.keys()].filter((n) => n !== vxpName);

    // Preferred path (Chromium): write the whole folder so the .vxp AND its
    // measurement files land together — VituixCAD opens it without hunting.
    const picker = (
      window as unknown as {
        showDirectoryPicker?: (o?: { mode?: string }) => Promise<FsDirHandle>;
      }
    ).showDirectoryPicker;
    if (picker) {
      try {
        const parent = await picker({ mode: 'readwrite' });
        const dir = await parent.getDirectoryHandle(base, { create: true });
        for (const [name, data] of files) {
          const fh = await dir.getFileHandle(name, { create: true });
          const w = await fh.createWritable();
          await w.write(data);
          await w.close();
        }
        setPersistNote(
          t('Exported folder “{base}/” — {vxp} + {n} measurement file(s) ({variants}). {bridge}. Open {vxp} in VituixCAD.', { base, vxp: vxpName, n: dataFiles.length, variants, bridge }) +
            skippedNote +
            (missing.length ? ` ${t('Note: no {list} on record.', { list: missing.join(', ') })}` : ''),
        );
        return;
      } catch (err) {
        // User cancelled the folder picker — silently stop, no fallback download.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Any other failure falls through to the single-file download below.
      }
    }

    // Fallback (Safari/Firefox have no directory picker, or the folder write
    // failed): ONE ZIP that unpacks into exactly the same folder. The
    // measurement files have to travel with the .vxp — without them
    // VituixCAD opens with "N/N frequency response files not found", which is
    // the whole reason the folder export exists. Handing over a bare .vxp plus
    // a list of files to copy by hand is that chore, not a fallback.
    const zip = zipStore([...files].map(([name, data]) => ({ name: `${base}/${name}`, data })));
    const blob = new Blob([zip as BlobPart], { type: 'application/zip' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    setPersistNote(
      t('Exported {zip} — {vxp} + {n} measurement file(s) ({variants}). {bridge}. Unpack it and open {vxp} in VituixCAD.', { zip: `${base}.zip`, vxp: vxpName, n: dataFiles.length, variants, bridge }) +
        skippedNote +
        (missing.length ? ` ${t('Note: no {list} on record.', { list: missing.join(', ') })}` : ''),
    );
  }

  async function importFilterFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await importFilterFile(file);
  }

  async function importFilterFile(file: File) {
    setError(null);
    try {
      const f = deserializeFilter(await file.text());
      // Layout travels with the file — a filter exported under an older
      // layout may carry cramped coordinates. Re-place it from the netlist
      // (electrically identical); exotic topologies keep their own drawing.
      const tidied = tidySchematic(f.parts);
      addDesign(f.name, tidied ?? f.parts); // new tab — imports never cost work
      setPersistNote(t('Imported filter {name}', { name: file.name }) + (tidied ? ` ${t('(layout tidied)')}` : ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // SPL y-domain: top from the loudest visible trace; bottom anchored to the
  // COMBINED passband level minus a fixed ~50 dB window (not the raw min — the
  // drivers' deep rolloff tails, ~30 dB at the band edges, dragged the floor to
  // 25 dB and wasted half the chart). 5 dB rounding, manual override wins.
  const splDomain: [number, number] = useMemo(() => {
    let lo = 60;
    let hi = 110;
    if (result) {
      const vals = [...result.woofer.spl, ...result.tweeter.spl, ...result.combinedSpl];
      const passTop = Math.max(...result.combinedSpl); // passband reference
      hi = Math.ceil((Math.max(...vals) + 3) / 5) * 5;
      lo = Math.floor((passTop - 50) / 5) * 5;
    }
    return [num(splMin, lo), num(splMax, hi)];
  }, [result, splMin, splMax]);

  const xDomain: [number, number] = result
    ? [result.freq[0], result.freq[result.freq.length - 1]]
    : [num(fMinDeb, 200), num(fMaxDeb, 20000)];

  /** Compare-overlay: combined SPL AND relative phase of every non-active
   *  design tab, computed through the same pipeline (network solve on
   *  measured Z, same tweeter adjustments) — one solve per tab feeds both
   *  charts. Muted dashed "ghosts" behind the live curves. */
  const GHOST_DASHES = ['7 4', '2 3', '10 3 2 3', '4 4'];
  // Distinct muted hue per ghost: with identical grays the legend chips were
  // indistinguishable — dash patterns only help inside the chart itself.
  const GHOST_COLORS = ['var(--viz-ghost1)', 'var(--viz-ghost2)', 'var(--viz-ghost3)', 'var(--viz-ghost4)'];
  /**
   * NaN outside the intersection of every source's validity — the chart draws
   * a gap rather than a line, which is the honest shape for "we do not know".
   */
  function maskOutsideValidity(y: readonly number[], grid: readonly number[]): number[] {
    const lo = evalBandRef.current?.fromHz ?? null;
    const hi = evalBandRef.current?.toHz ?? null;
    if (lo === null || hi === null) return [...y];
    return y.map((v, i) => (grid[i] < lo || grid[i] > hi ? NaN : v));
  }

  const tabGhosts: { spl: Series[]; phase: Series[]; z: Series[] } = useMemo(() => {
    if (!compareTabs || !networkActive || !sim || designs.length < 2)
      return { spl: [], phase: [], z: [] };
    if (Object.keys(impedances).length === 0) return { spl: [], phase: [], z: [] };
    const grid = sim.combined.freq;
    const zOnGrid = zGridWithSlots(impedances, grid);
    const spl: Series[] = [];
    const phase: Series[] = [];
    const z: Series[] = [];
    designs
      .filter((d) => d.id !== activeDesignId)
      .forEach((d, i) => {
        try {
          // Three-way ghosts sum all three branches — the SAME solve the
          // compare table runs (solveDesign, A6b), so a ghost cannot differ
          // from the row that describes it, nor from the curve that tab would
          // draw if you switched to it.
          const solved = solveDesign({
            design: d,
            grid,
            driverZ: zOnGrid,
            base: sim.base,
            threeWay,
            adjust: { mid: branchAdj.mid, tweeter: branchAdj.tweeter },
          });
          if (solved.ambiguous || !solved.sum) return; // no guessing which branch is which
          const n3 = threeWay && sim.base.m ? (solved.sum as CombineNResult) : null;
          const combined = solved.sum;
          const style = {
            label: d.name,
            color: GHOST_COLORS[i % GHOST_COLORS.length],
            dash: GHOST_DASHES[i % GHOST_DASHES.length],
            width: 1.4,
            x: grid,
            // Comparison curves, not the subject — fold them in the legend.
            secondary: true,
          };
          /* A3b — A GHOST IS DRAWN ON ITS VALIDITY, not on its file range.
           *
           * The live curve can carry a mark saying "this part is outside the
           * band"; a muted dashed comparison line cannot, and a ghost that
           * looks authoritative where the measurement is not is exactly what
           * step 4 forbids. So a ghost simply stops where the design's own
           * sources stop being believable. It can only ever get SHORTER:
           * validity ⊆ file range is an invariant (assertValidityContained),
           * and a ghost growing past its data would mean that broke. */
          const ghostY = maskOutsideValidity(combined.combinedSpl, grid);
          spl.push({ ...style, id: `ghost:${d.id}`, y: ghostY });
          // Phase ghost: in 3-way the headline is the stitched active-pair
          // line, and each tab gets its OWN overlap windows — a tab that hands
          // over elsewhere should show that, not borrow the live design's
          // split. Muted, so no tier colours here.
          let phaseY: number[];
          if (n3) {
            const [bLow, bMid, bHigh] = n3.branches;
            const flat = { offsetMm: 0, trimDb: 0, inverted: false };
            const integOf = (a: GriddedResponse, b: GriddedResponse) =>
              computeIntegration(combine(a, b, flat));
            phaseY = breakPhaseWraps(
              stitchPairPhase(
                bLow.phaseDeg,
                bMid.phaseDeg,
                bHigh.phaseDeg,
                grid,
                integOf(bLow, bMid),
                integOf(bMid, bHigh),
              ).y,
            );
          } else {
            phaseY = breakPhaseWraps(
              (combined as { relativePhaseDeg: number[] }).relativePhaseDeg.slice(),
            );
          }
          phase.push({ ...style, id: `ghostp:${d.id}`, y: phaseY });
          z.push({
            ...style,
            id: `ghostz:${d.id}`,
            y: solved.inputZ.map((c) => Math.min(cAbs(c), 1e4)),
          });
        } catch {
          // Unsolvable tab (work in progress) — simply no ghost for it.
        }
      });
    return { spl, phase, z };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareTabs, networkActive, sim, threeWay, impedances, designs, activeDesignId, branchAdj]);

  /**
   * Compare every saved design on NUMBERS, not on curve shapes. The ghost
   * overlay shows form; this answers "which one do I build" — Response score,
   * worst-pair phase, the amplifier's minimum load, component count and BOM
   * total, side by side. Same table pattern as the crossover scan.
   *
   * One solve per tab, on the SAME pipeline the live simulation uses (measured
   * impedances, the branch adjustments as set), so a row cannot flatter a tab
   * by measuring it differently.
   */
  const tabCompare = useMemo(() => {
    if (!sim || designs.length < 2 || !result) return null;
    if (Object.keys(impedances).length === 0) return null;
    const grid = sim.combined.freq;
    const zOnGrid = zGridWithSlots(impedances, grid);
    const lo = splViewX ? splViewX[0] : grid[0];
    const hi = splViewX ? splViewX[1] : grid[grid.length - 1];
    const tAdj = branchAdj.tweeter;
    const mAdj = branchAdj.mid;
    const rows = designs.map((d) => {
      const base = {
        id: d.id,
        name: d.name,
        active: d.id === activeDesignId,
        parts: d.parts.filter((p) => /Inductor|Capacitor|Resistor/.test(p.type)).length,
        bomEur: null as number | null,
        score: null as number | null,
        avgDb: null as number | null,
        peakDb: null as number | null,
        phaseDeg: null as number | null,
        p95Deg: null as number | null,
        zMinOhm: null as number | null,
        error: null as string | null,
      };
      try {
        const bom = bomFor(d.parts);
        base.bomEur = bom.totalEur;
        // ONE solve, shared with the ghost overlay (solveDesign, A6b) — a row
        // and the curve it describes cannot be measured differently.
        const solved = solveDesign({
          design: d,
          grid,
          driverZ: zOnGrid,
          base: sim.base,
          threeWay,
          adjust: { mid: mAdj, tweeter: tAdj },
        });
        base.zMinOhm = Math.min(...solved.inputZ.map((c) => cAbs(c)));
        if (solved.ambiguous || !solved.sum) return { ...base, error: 'driver names ambiguous' };
        if (threeWay && sim.base.m) {
          const n3 = solved.sum as CombineNResult;
          const st = computeResponseStats(grid, n3.combinedSpl, lo, hi);
          if (st) {
            base.score = st.score;
            base.avgDb = st.avgDevDb;
            base.peakDb = st.peak.devDb;
          }
          // Coupled pairs: report the WORSE handover, the same rule every gate
          // in the engine uses — an average would hide one bad crossing.
          const pair = (a: GriddedResponse, b: GriddedResponse) => {
            const r = combine(a, b, { offsetMm: 0, trimDb: 0, inverted: false });
            const ig = computeIntegration(r);
            return computePhaseStats(r.relativePhaseDeg, ig.points);
          };
          const ps = [pair(n3.branches[0], n3.branches[1]), pair(n3.branches[1], n3.branches[2])]
            .filter((x): x is NonNullable<typeof x> => x !== null);
          if (ps.length > 0) {
            base.phaseDeg = Math.max(...ps.map((x) => x.avgErrorDeg));
            base.p95Deg = Math.max(...ps.map((x) => x.p95ErrorDeg));
          }
        } else {
          const r2 = solved.sum as CombineResult;
          const st = computeResponseStats(grid, r2.combinedSpl, lo, hi);
          if (st) {
            base.score = st.score;
            base.avgDb = st.avgDevDb;
            base.peakDb = st.peak.devDb;
          }
          const ig = computeIntegration(r2);
          const ph = computePhaseStats(r2.relativePhaseDeg, ig.points);
          if (ph) {
            base.phaseDeg = ph.avgErrorDeg;
            base.p95Deg = ph.p95ErrorDeg;
          }
        }
        return base;
      } catch {
        // A tab that is still work in progress simply has no numbers yet.
        return { ...base, error: 'not solvable' };
      }
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, result, designs, activeDesignId, impedances, splViewX, threeWay,
      branchAdj]);

  /** System-impedance display data: |Z| curve + min/max markers. High |Z| is
   *  harmless (an easy load); only the MINIMUM matters for the amplifier —
   *  tiers follow IEC 60268-5's 0.8×nominal floor (6.4 Ω = 8 Ω-safe,
   *  3.2 Ω = 4 Ω territory, below that amp-unfriendly). */
  const systemZInfo = useMemo(() => {
    if (!showPanels.impedance || !sim?.systemZ) return null;
    const freq = sim.combined.freq;
    // Cap the open-network blow-up (~1/G_LEAK) so the chart scale stays sane.
    const mags = sim.systemZ.map((c) => Math.min(cAbs(c), 1e4));
    // Load character: arg(Z) — negative = capacitive, positive = inductive.
    // Low |Z| alone is current/heat; low AND capacitive is the combination
    // marginal amplifiers dislike (Sanders 15–20 kHz question, jul 2026).
    const phase = sim.systemZ.map((c) => (Math.atan2(c.im, c.re) * 180) / Math.PI);
    let minI = 0;
    let maxI = 0;
    mags.forEach((m, i) => {
      if (m < mags[minI]) minI = i;
      if (m > mags[maxI]) maxI = i;
    });
    return {
      mags,
      phase,
      minOhm: mags[minI],
      minHz: freq[minI],
      minPhaseDeg: phase[minI],
      maxOhm: mags[maxI],
      maxHz: freq[maxI],
    };
  }, [showPanels.impedance, sim]);

  /** Build-tolerance envelope for the ACTIVE passive network — the same part
   *  source, virtual-filter stacking and adjustment the sim uses, so the band
   *  hugs the exact combined curve on screen. Null while off or without a
   *  solvable network. */
  /** Group delay of the SUM at three fixed points (500 Hz / 2 kHz / 8 kHz),
   *  bulk (mic flight) removed by subtracting the in-band median — display
   *  only, never an objective term (point 6d). Central difference of the
   *  unwrapped combined phase: GD = −(dφ/360)/df. */
  const sumGroupDelay = useMemo(() => {
    if (!result || !result.combinedPhaseDeg) return null;
    const f = result.freq;
    const ph = result.combinedPhaseDeg;
    const n = f.length;
    if (n < 5) return null;
    const lo = Number(fMin) || f[0];
    const hi = Number(fMax) || f[n - 1];
    const gd = new Array<number>(n).fill(NaN);
    for (let i = 1; i < n - 1; i++) {
      const df = f[i + 1] - f[i - 1];
      if (!(df > 0)) continue;
      gd[i] = (-(ph[i + 1] - ph[i - 1]) / 360 / df) * 1000; // ms
    }
    const inBand = gd.filter((v, i) => Number.isFinite(v) && f[i] >= lo && f[i] <= hi).sort((a, b) => a - b);
    if (inBand.length < 3) return null;
    const med = inBand[Math.floor(inBand.length / 2)];
    const at = (hz: number): number | null => {
      if (hz < lo || hz > hi) return null;
      let b = -1;
      for (let i = 1; i < n - 1; i++) if (Number.isFinite(gd[i]) && (b < 0 || Math.abs(f[i] - hz) < Math.abs(f[b] - hz))) b = i;
      return b >= 0 ? gd[b] - med : null;
    };
    return { at500: at(500), at2k: at(2000), at8k: at(8000), medianMs: med };
  }, [result, fMin, fMax]);

  const tolBand = useMemo(() => {
    // 3-weg mag hier NIET meer uit: de tolerantieband is dé check die een
    // rekenkundig optimum scheidt van een bouwbaar filter, en juist een
    // 3-weg draagt de meeste onderdelen. Hem uitzetten beantwoordde stil een
    // andere vraag dan er gesteld werd.
    if (!tolOn || !sim) return null;
    const xo =
      project && xoName !== 'none' ? project.vxp.crossovers.find((c) => c.name === xoName) : undefined;
    const parts = networkActive && schematic ? schematic.parts : xo?.parts;
    if (!parts || Object.keys(impedances).length === 0) return null;
    const grid = sim.combined.freq;
    // Virtual filters multiply per driver just like in the sim; order vs the
    // network transfer is irrelevant, so pre-applying them here is exact.
    let wEff = sim.base.w;
    let tEff = sim.base.t;
    if (!vfBypass && isActive(vFilters.woofer)) {
      wEff = applyTransfer(wEff, evalDriverFilter(vFilters.woofer, grid));
    }
    if (!vfBypass && isActive(vFilters.tweeter)) {
      tEff = applyTransfer(tEff, evalDriverFilter(vFilters.tweeter, grid));
    }
    let mEff = sim.base.m ?? null;
    if (mEff && !vfBypass && isActive(vFilters.mid)) {
      mEff = applyTransfer(mEff, evalDriverFilter(vFilters.mid, grid));
    }
    return toleranceBand(
      parts,
      grid,
      wEff,
      tEff,
      zGridWithSlots(impedances, grid),
      branchAdj.tweeter,
      tolPct,
      threeWay && mEff
        ? {
            response: mEff,
            adjust: branchAdj.mid,
          }
        : undefined,
    );
  }, [tolOn, tolPct, sim, threeWay, project, xoName, networkActive, schematic, impedances, vfBypass, vFilters, branchAdj]);

  /** Per-driver ACOUSTIC target curves for the SPL chart (Stefans vraag:
   *  "hoever volgt de respons per speaker het target?") — the ideal shape of
   *  the virtual target design (same source as the 🎯 Targets popup), placed
   *  with ONE shared level offset (pooled passband median vs the actual
   *  driver responses). Sharing the offset preserves the targets' RELATIVE
   *  levels: a branch playing 2 dB under its target SHOWS as 2 dB deviation
   *  instead of being re-anchored away. Tweeter trim rides into its target —
   *  the trim knob is a playback adjustment, not a build deviation. */
  const targetSeries: Series[] = useMemo(() => {
    if (!result) return [];
    const defs = [
      { id: 'wtarget', label: t('Woofer target'), spec: vFilters.woofer, drv: result.woofer, color: 'var(--viz-woofer)', trim: 0, loaded: !!woofer },
      // The mid rides on the same rule: its target is the bandpass SHAPE, and
      // its trim is part of it because `sim.mid` already carries the adjust.
      ...(threeWay && sim?.mid
        ? [{ id: 'mtarget', label: t('Midrange target'), spec: vFilters.mid, drv: sim.mid, color: 'var(--viz-mid)', trim: num(midTrimDb, 0), loaded: !!midDrv }]
        : []),
      { id: 'ttarget', label: t('Tweeter target'), spec: vFilters.tweeter, drv: result.tweeter, color: 'var(--viz-tweeter)', trim: num(trimDb, 0), loaded: !!tweeter },
    ].filter((d) => d.loaded && isActive(d.spec));
    if (defs.length === 0) return [];
    const shapes = defs.map((d) => {
      // ACOUSTIC target = the ideal HP/LP alignment shape (+ gain) ONLY.
      // EQ bands and shelves are deliberately excluded: in acoustic mode
      // they are TOOLS that flatten the driver, not part of the goal —
      // drawing them made the target deviate from the measured branch
      // exactly where the driver isn't flat (Stefans "dan zit het er ver
      // naast": double-counting, hard geleerd jul 2026).
      const h = evalDriverFilter({ ...d.spec, eq: [] }, result.freq);
      return h.map((c) => 20 * Math.log10(Math.hypot(c.re, c.im) || 1e-12) + d.trim);
    });
    // One shared offset: pooled median of (measured − shape) over each
    // shape's own passband (within 3 dB of its top).
    const pool: number[] = [];
    defs.forEach((d, k) => {
      const shape = shapes[k];
      const top = Math.max(...shape);
      for (let i = 0; i < shape.length; i++) {
        // Outside its own measured band a branch sits on the silent ghost; it
        // carries no level, so anchoring on it would drag every target down.
        if (d.drv.spl[i] <= SILENT_GHOST_DB + 100) continue;
        if (shape[i] >= top - 3 && Number.isFinite(d.drv.spl[i])) pool.push(d.drv.spl[i] - shape[i]);
      }
    });
    if (pool.length < 8) return [];
    pool.sort((a, b) => a - b);
    const offset = pool[Math.floor(pool.length / 2)];
    return defs.map((d, k) => ({
      id: d.id,
      label: d.label,
      color: d.color,
      dash: '2 4',
      width: 1.6,
      x: result.freq,
      // A target outside the branch's own measured band is a goal for data
      // that does not exist — the gap is the honest drawing (same rule the
      // branch curves themselves follow).
      y: shapes[k].map((s, i) => (d.drv.spl[i] <= SILENT_GHOST_DB + 100 ? NaN : s + offset)),
      defaultOff: true,
      secondary: true,
    }));
  }, [result, sim, threeWay, vFilters, trimDb, midTrimDb, woofer, midDrv, tweeter, uiLang]);

  /** Mask silent-ghost regions (per-branch bands, 3-way) to chart gaps. A
   *  real branch never sits below −300 dB; the ghost lives at −400 and a
   *  filtered ghost only sinks further. */
  const maskSilent = useCallback(
    (spl: readonly number[]): number[] =>
      threeWay ? spl.map((v) => (v <= SILENT_GHOST_DB + 100 ? NaN : v)) : [...spl],
    [threeWay],
  );

  const splSeries: Series[] = useMemo(() => {
    if (!result) return [];
    // Color the combined curve by phase-alignment tier inside the overlap
    // region; outside it the phase is irrelevant and the base color remains.
    const alignColors = integration
      ? integration.points.map((p) => (p.cls ? TIER_COLOR[phaseTier(p.phaseErrorDeg)] : null))
      : undefined;
    return [
      ...tabGhosts.spl,
      // Held reference (REW "hold trace"): a frozen copy of the combined
      // curve from the moment the user pressed Hold — the honest before/after
      // while hand-tuning. Drawn early so the live curves stay on top.
      ...(heldTrace
        ? ([
            {
              id: 'held',
              label: t('Held reference'),
              color: 'var(--viz-tick)',
              dash: '8 4',
              width: 1.6,
              x: heldTrace.x,
              y: heldTrace.y,
            },
          ] as Series[])
        : []),
      // Build-tolerance envelope hugs the combined curve — drawn first so the
      // live curves stay on top.
      ...(tolBand
        ? ([
            {
              id: 'tolhi',
              label: t('±{pct}% build tolerance ↑', { pct: tolBand.tolPct }),
              color: 'var(--viz-tick)',
              dash: '3 3',
              width: 1.2,
              x: result.freq,
              y: tolBand.upperDb,
              secondary: true,
            },
            {
              id: 'tollo',
              label: t('±{pct}% build tolerance ↓', { pct: tolBand.tolPct }),
              color: 'var(--viz-tick)',
              dash: '3 3',
              width: 1.2,
              x: result.freq,
              y: tolBand.lowerDb,
              secondary: true,
            },
          ] satisfies Series[])
        : []),
      // Acoustic per-driver targets (legend-opt-in) under the live curves.
      ...targetSeries,
      // Model-vs-measurement overlay: the measured build, level-aligned.
      ...(verifyCompare && verify
        ? [
            {
              id: 'verify',
              label: t('Measured — {name} ({db} dB)', { name: verify.name, db: `${verifyCompare.offsetDb >= 0 ? '+' : ''}${verifyCompare.offsetDb.toFixed(1)}` }),
              color: 'var(--viz-ghost3)',
              dash: '9 3',
              width: 2.2,
              x: result.freq,
              y: verifyCompare.alignedSpl,
            } satisfies Series,
          ]
        : []),
      // Single-driver mode: the ghost branch sits at −400 dB — skip its curve
      // and the (two-driver) polarity null check instead of drawing noise.
      // 3-way per-branch bands: outside its own measured range a branch sits
      // at the silent ghost — masked to a gap instead of a −400 dB cliff.
      ...(woofer
        ? [{ id: 'w', label: t(threeWay ? 'Woofer' : 'Woofer/mid'), color: 'var(--viz-woofer)', x: result.freq, y: maskSilent(result.woofer.spl) } satisfies Series]
        : []),
      ...(sim?.mid
        ? [{ id: 'm', label: t('Midrange'), color: 'var(--viz-mid)', x: result.freq, y: maskSilent(sim.mid.spl) } satisfies Series]
        : []),
      ...(tweeter
        ? [{ id: 't', label: t('Tweeter'), color: 'var(--viz-tweeter)', x: result.freq, y: maskSilent(result.tweeter.spl) } satisfies Series]
        : []),
      {
        id: 'c',
        // The active tab IS the live combined curve (never a ghost) — name it
        // so the count in the legend adds up against the design tabs.
        label:
          networkActive && activeDesign ? t('Combined — {name}', { name: activeDesign.name }) : t('Combined'),
        color: 'var(--viz-combined)',
        x: result.freq,
        y: result.combinedSpl,
        pointColors: alignColors,
        width: 2.5,
      },
      ...(soloDriver
        ? []
        : [
            {
              id: 'n',
              // 3-way: this flip only nulls the M-T handover — say so, and add
              // the W-M twin below (woofer flipped; the shared mid stays put).
              label: threeWay
                ? t('Combined, tweeter inverted (null check M-T)')
                : t('Combined, tweeter inverted (null check)'),
              color: 'var(--viz-null)',
              x: result.freq,
              y: result.invertedSpl,
              dash: '5 4',
            } satisfies Series,
          ]),
      ...(threeWay && sim && 'invertedLowSpl' in sim.combined
        ? [
            {
              id: 'nlow',
              label: t('Combined, woofer inverted (null check W-M)'),
              color: 'var(--viz-null)',
              x: result.freq,
              y: sim.combined.invertedLowSpl,
              // Same null-family color, DIFFERENT dash: pattern carries the
              // distinction (the CVD doctrine — color is never the only carrier).
              dash: '2 3',
            } satisfies Series,
          ]
        : []),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, sim, threeWay, maskSilent, integration, tabGhosts, networkActive, activeDesign, tolBand, targetSeries, soloDriver, verifyCompare, verify, heldTrace, uiLang]);

  /**
   * Design handles ON the SPL chart (UI-fase D): drag the crossover knees and
   * EQ dots right where you look. Only for the virtual filters — with vfBypass
   * (passive network active) they disappear, because they would edit filters
   * that are not in the simulation.
   */
  const splHandles: ChartHandle[] | undefined = useMemo(() => {
    if (!result || vfBypass) return undefined;
    const yAt = (curve: readonly number[], f: number): number => {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < result.freq.length; i++) {
        const d = Math.abs(Math.log10(result.freq[i]) - Math.log10(f));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return curve[best];
    };
    const out: ChartHandle[] = [];
    const slots = threeWay ? (['woofer', 'mid', 'tweeter'] as const) : (['woofer', 'tweeter'] as const);
    for (const slot of slots) {
      const spec = vFilters[slot];
      const curve =
        slot === 'woofer'
          ? result.woofer.spl
          : slot === 'mid'
            ? (sim?.mid?.spl ?? result.woofer.spl)
            : result.tweeter.spl;
      const color = `var(--viz-${slot})`;
      const name = t(slot === 'woofer' ? (threeWay ? 'Woofer' : 'Woofer/mid') : slot === 'mid' ? 'Midrange' : 'Tweeter');
      if (spec.hp.enabled) {
        out.push({
          id: `${slot}:hp`,
          x: spec.hp.freq,
          y: yAt(curve, spec.hp.freq),
          color,
          kind: 'x',
          label: t('{name} high-pass · {hz} Hz — drag to move the knee', { name, hz: Math.round(spec.hp.freq) }),
        });
      }
      if (spec.lp.enabled) {
        out.push({
          id: `${slot}:lp`,
          x: spec.lp.freq,
          y: yAt(curve, spec.lp.freq),
          color,
          kind: 'x',
          label: t('{name} low-pass · {hz} Hz — drag to move the knee', { name, hz: Math.round(spec.lp.freq) }),
        });
      }
      spec.eq.forEach((band, i) => {
        if (!band.enabled) return;
        out.push({
          id: `${slot}:eq${i}`,
          x: band.freq,
          y: yAt(curve, band.freq),
          color,
          kind: 'xy',
          label: t('{name} EQ {type} · {hz} Hz · {db} dB · Q {q} — drag = freq/gain, scroll = Q', { name, type: band.type ?? 'peak', hz: Math.round(band.freq), db: band.gainDb.toFixed(1), q: band.q }),
        });
      });
    }
    return out.length > 0 ? out : undefined;
  }, [result, sim, threeWay, vFilters, vfBypass, uiLang]);

  const moveSplHandle = (id: string, x: number, dyUnits: number) => {
    const [slot, part] = id.split(':') as ['woofer' | 'mid' | 'tweeter', string];
    const f = Math.round(Math.min(20000, Math.max(20, x)));
    setVFilters((p) => {
      const spec = { ...p[slot] };
      if (part === 'hp') spec.hp = { ...spec.hp, freq: f };
      else if (part === 'lp') spec.lp = { ...spec.lp, freq: f };
      else if (part.startsWith('eq')) {
        const i = Number(part.slice(2));
        const band = spec.eq[i];
        if (!band) return p;
        // Cut only: a passive network cannot boost, so EQ bands stay ≤ 0 dB.
        const gain = Math.min(0, Math.max(-30, band.gainDb + dyUnits));
        const eq = spec.eq.slice();
        eq[i] = { ...band, freq: f, gainDb: Math.round(gain * 10) / 10 };
        spec.eq = eq;
      }
      return { ...p, [slot]: spec };
    });
  };

  const wheelSplHandle = (id: string, factor: number) => {
    const [slot, part] = id.split(':') as ['woofer' | 'mid' | 'tweeter', string];
    if (!part.startsWith('eq')) return;
    const i = Number(part.slice(2));
    setVFilters((p) => {
      const spec = { ...p[slot] };
      const band = spec.eq[i];
      if (!band) return p;
      const q = Math.min(12, Math.max(0.2, band.q * factor));
      const eq = spec.eq.slice();
      eq[i] = { ...band, q: Math.round(q * 100) / 100 };
      spec.eq = eq;
      return { ...p, [slot]: spec };
    });
  };

  const phaseSeries: Series[] = useMemo(() => {
    if (!showPanels.phase || !result) return [];
    const breakWraps = breakPhaseWraps;
    const wrapDeg = (d: number) => {
      let v = d % 360;
      if (v > 180) v -= 360;
      if (v < -180) v += 360;
      return v;
    };
    // Compare-overlay ghosts first, so the live curves draw on top of them —
    // same tabs, same dashes as in the SPL chart.
    const out: Series[] = [...tabGhosts.phase];
    // The phase each active filter chain ADDS per driver (arg of the total
    // transfer: passive network × virtual filters) — "the selected filters".
    const transfers = sim?.transfers;
    const filterPhase = (h: Complex[] | null | undefined): number[] | null =>
      h ? h.map((c) => (Math.atan2(c.im, c.re) * 180) / Math.PI) : null;
    const fw = filterPhase(transfers?.woofer);
    const fm = filterPhase(transfers?.mid);
    const ft = filterPhase(transfers?.tweeter);
    // Filter-phase-per-branch starts legend-hidden (Sanders keuze, jul 2026):
    // the per-driver TOTAL curves below are the default reading; what the
    // network alone adds is opt-in detail.
    if (fw) {
      out.push({
        id: 'fw',
        label: t('Woofer filter phase'),
        color: 'var(--viz-woofer)',
        x: result.freq,
        y: breakWraps(fw),
        dash: '5 3',
        width: 1.6,
        defaultOff: true,
      });
    }
    if (fm) {
      out.push({
        id: 'fm',
        label: t('Mid filter phase'),
        color: 'var(--viz-mid)',
        x: result.freq,
        y: breakWraps(fm),
        dash: '5 3',
        width: 1.6,
        defaultOff: true,
      });
    }
    if (ft) {
      out.push({
        id: 'ft',
        label: t('Tweeter filter phase'),
        color: 'var(--viz-tweeter)',
        x: result.freq,
        y: breakWraps(ft),
        dash: '5 3',
        width: 1.6,
        defaultOff: true,
      });
    }
    // Raw-driver reference (same offset/trim/polarity, no filters): the
    // distance to the main curve is exactly what the filters contribute.
    // Meaningless against a silent ghost — skipped in single-driver mode.
    // (2-way only: the 3-way pair curves below carry their own meaning.)
    if (!soloDriver && !threeWay && sim && (fw || ft)) {
      const raw = combine(sim.base.w, sim.base.t, branchAdj.tweeter);
      out.push({
        id: 'raw',
        label: t('Relative phase — raw drivers'),
        color: 'var(--viz-tick)',
        x: result.freq,
        y: breakWraps(raw.relativePhaseDeg.map(wrapDeg)),
        dash: '2 3',
        width: 1.4,
      });
    }
    // Per-driver TOTAL phase, ON by default (Sanders keuze: dit is de
    // standaard-aflezing; de filter-fase-per-tak hierboven is de opt-in en
    // de legend-chips zijn de enige toggle). Uses result.woofer/
    // .tweeter.phaseDeg DIRECTLY — the exact arrays the relative curve is the
    // difference of, so these render wherever that one does. Hard geleerd
    // (twee rondes "geen lijnen"): rebuilding the totals from base + a
    // re-unwrapped filter arg turned to noise where a branch's |H| underflows
    // (unwrap random-walks on numeric dust) and breakPhaseWraps then cut the
    // whole line. Both curves get the SAME reference subtracted (~1-octave
    // moving average of the combined system phase), so their DIFFERENCE — the
    // relative curve — is untouched: where it sits at 0°, these two lie
    // exactly on top of each other (Stefans check). A branch >60 dB below the
    // sum is masked out: it contributes nothing and its phase means nothing.
    {
      const cp = result.combinedPhaseDeg;
      const n = cp.length;
      const octaves = Math.log2(result.freq[n - 1] / result.freq[0]);
      const half = Math.max(2, Math.round(n / octaves / 2)); // ≈ half an octave
      const pre = new Array<number>(n + 1).fill(0);
      for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + cp[i];
      const ref = cp.map((_, i) => {
        const a = Math.max(0, i - half);
        const b = Math.min(n - 1, i + half);
        return (pre[b + 1] - pre[a]) / (b - a + 1);
      });
      const disp = (drv: { spl: number[]; phaseDeg: number[] }): number[] =>
        drv.phaseDeg.map((p, i) =>
          drv.spl[i] < result.combinedSpl[i] - 60 ? NaN : p - ref[i],
        );
      // Ghost branch (single-driver mode) is fully NaN-masked anyway — skip
      // its series so the legend stays honest.
      // 3-way: defaultOff — with three totals PLUS the pair curves the panel
      // drowned (Sanders: "een berg lijnen over elkaar"); the stitched
      // active-pair line below is the default reading there. 2-way keeps the
      // totals on (Stefans check, Sanders eindkeuze) — the legend toggles.
      const totOff = threeWay ? { defaultOff: true } : {};
      if (woofer) {
        out.push({
          id: 'wtot',
          label: t('Woofer phase (total)'),
          color: 'var(--viz-woofer)',
          x: result.freq,
          y: breakWraps(disp(result.woofer).map(wrapDeg)),
          dash: '9 4',
          width: 1.6,
          ...totOff,
        });
      }
      if (sim?.mid) {
        out.push({
          id: 'mtot',
          label: t('Mid phase (total)'),
          color: 'var(--viz-mid)',
          x: result.freq,
          y: breakWraps(disp(sim.mid).map(wrapDeg)),
          dash: '9 4',
          width: 1.6,
          ...totOff,
        });
      }
      if (tweeter) {
        out.push({
          id: 'ttot',
          label: t('Tweeter phase (total)'),
          color: 'var(--viz-tweeter)',
          x: result.freq,
          y: breakWraps(disp(result.tweeter).map(wrapDeg)),
          dash: '9 4',
          width: 1.6,
          ...totOff,
        });
      }
    }
    // Same alignment coloring as the SPL combined curve: the phase line itself
    // shows how far off it is — but only in the overlap region where it counts.
    const alignColors = integration
      ? integration.points.map((p) => (p.cls ? TIER_COLOR[phaseTier(p.phaseErrorDeg)] : null))
      : undefined;
    // The relative curve is the headline in 2-way mode; against a silent
    // ghost it is pure noise — single-driver mode leads with the total phase.
    // 3-way: the woofer↔tweeter difference means nothing (they never cross) —
    // the ADJACENT pairs are the design quantity, so those two curves lead.
    if (threeWay && sim?.mid) {
      const midPh = sim.mid.phaseDeg;
      // Per-branch bands: relative phase against a silent-ghost region is
      // noise — mask where either branch has no measured data.
      const alive = (spl: readonly number[], i: number) => spl[i] > SILENT_GHOST_DB + 100;
      /* ONE stitched headline (Sanders aug 2026: "een berg lijnen over
       * elkaar"): a pair's relative phase only means anything inside its OWN
       * overlap window, so one line can carry both — mid-vs-woofer inside the
       * W-M window, tweeter-vs-mid inside the M-T one, a gap in between
       * (nothing hands over there). Tier-colored per point like the 2-way
       * headline. The two full per-pair curves stay available behind their
       * legend chips (defaultOff — the legend IS the toggle). */
      if (pairScores) {
        const st = stitchPairPhase(
          result.woofer.phaseDeg,
          midPh,
          result.tweeter.phaseDeg,
          result.freq,
          pairScores.low.integ,
          pairScores.high.integ,
        );
        out.push({
          id: 'pairalign',
          label: t('Relative phase — active pair'),
          color: 'var(--viz-combined)',
          x: result.freq,
          y: breakWraps(st.y),
          pointColors: st.colors,
          width: 2.5,
        });
      }
      out.push({
        id: 'relmw',
        label: t('Mid phase relative to woofer'),
        color: 'var(--viz-mid)',
        x: result.freq,
        y: breakWraps(
          midPh.map((p, i) =>
            alive(sim.mid!.spl, i) && alive(result.woofer.spl, i)
              ? wrapDeg(p - result.woofer.phaseDeg[i])
              : NaN,
          ),
        ),
        width: 2.2,
        defaultOff: true,
      });
      out.push({
        id: 'reltm',
        label: t('Tweeter phase relative to mid'),
        color: 'var(--viz-tweeter)',
        x: result.freq,
        y: breakWraps(
          result.tweeter.phaseDeg.map((p, i) =>
            alive(result.tweeter.spl, i) && alive(sim.mid!.spl, i)
              ? wrapDeg(p - midPh[i])
              : NaN,
          ),
        ),
        width: 2.2,
        defaultOff: true,
      });
    } else if (!soloDriver) {
      out.push({
        id: 'rel',
        label: t('Tweeter phase relative to woofer'),
        color: 'var(--viz-tweeter)',
        x: result.freq,
        y: breakWraps(result.relativePhaseDeg.slice()),
        pointColors: alignColors,
        width: 2.5,
      });
    }
    // VituixCAD reference: its filtered tweeter − woofer, computed the SAME way
    // (unwrap-resample onto our grid, then wrapped difference) so it's a true
    // peer of the curve above. NB: VituixCAD's export has the inter-driver
    // timing removed (drivers time-aligned to ~0 mm), which is exactly why it
    // diverges from our measured-phase curve — hence the label.
    if (refResp && !soloDriver && !threeWay) {
      const rw = resample(refResp.woofer.freq, refResp.woofer.spl, refResp.woofer.phase, result.freq);
      const rt = resample(refResp.tweeter.freq, refResp.tweeter.spl, refResp.tweeter.phase, result.freq);
      out.push({
        id: 'refphase',
        label: t('VituixCAD (timing removed)'),
        color: 'var(--viz-tick)',
        x: result.freq,
        y: breakWraps(rt.phaseDeg.map((p, i) => wrapDeg(p - rw.phaseDeg[i]))),
        dash: '8 4',
        width: 1.8,
      });
    }
    // Model-vs-measurement phase residual: what remains of (measured −
    // simulated) phase after the fitted mic delay + constant offset are
    // removed. Flat at 0° = the model's phase is right; structure = where it
    // is not. Works in solo mode too — that IS the validation flow.
    if (verifyCompare?.phase) {
      out.push({
        id: 'verifres',
        label: t('Measured phase residual (vs model)'),
        color: 'var(--viz-ghost3)',
        x: result.freq,
        y: verifyCompare.phase.residualDeg,
        dash: '9 3',
        width: 2,
      });
    }
    return out;
  }, [result, integration, pairScores, sim, threeWay, branchAdj, showPanels.phase, refResp, tabGhosts, woofer, tweeter, soloDriver, verifyCompare, uiLang]);

  /** "How far off is the phase" zones behind the relative-phase curve. */
  const phaseBands = useMemo(
    () => [
      { from: -15, to: 15, color: TIER_COLOR.tight, opacity: 0.11 },
      { from: 15, to: 45, color: TIER_COLOR.good, opacity: 0.08 },
      { from: -45, to: -15, color: TIER_COLOR.good, opacity: 0.08 },
      { from: 45, to: 90, color: TIER_COLOR.ok, opacity: 0.07 },
      { from: -90, to: -45, color: TIER_COLOR.ok, opacity: 0.07 },
      { from: 90, to: 120, color: TIER_COLOR.marginal, opacity: 0.06 },
      { from: -120, to: -90, color: TIER_COLOR.marginal, opacity: 0.06 },
      { from: 120, to: 180, color: TIER_COLOR.destructive, opacity: 0.05 },
      { from: -180, to: -120, color: TIER_COLOR.destructive, opacity: 0.05 },
    ],
    [],
  );

  const delayUs = offsetMmToDelayS(num(offsetMm, 0)) * 1e6;

  /** Candidates that already produced a result in the running scan — the
   *  number the "use what finished" button offers to keep. */
  const scanDoneCount = vfProgress?.items?.filter((i) => i.done).length ?? 0;

  // Busy-card body, built during render and snapshotted for the close-linger.
  const busyCardBody = (
    <>
      <div className="busy-spinner" />
      <div className="busy-title">
        {vfBusy
          ? 'Optimizing crossover…'
          : netOptBusy
            ? 'Tuning components on the assembled network…'
            : 'Building passive network…'}
      </div>
      {vfBusy && vfProgress?.items ? (
        // Scan view: one STABLE row per candidate + a totals line — the
        // card never changes size while stages tick underneath.
        <>
          {vfProgress.round3 && (
            /* WHICH ROUND, and how many there are. Without it the candidate
               counter's denominator grows underneath you (7 → 14 → 23) as
               rounds are earned, which reads as a target running away. The
               total stays "2–3" until the third round is decided: it runs only
               when the two axes prove coupled, so a fixed "of 3" would be a
               promise the scan cannot keep. */
            <p className="busy-round" title={t('The third round is a local refinement and runs only when the two axes turn out coupled — until then the total is 2 or 3.')}>
              {vfProgress.round3.label} — {t('round {n} of {total}', { n: String(vfProgress.round3.n), total: vfProgress.round3.total })}
            </p>
          )}
          <table className="busy-scan">
            <tbody>
              {vfProgress.items.map((it) => (
                <tr key={it.label} className={it.done ? 'done' : ''}>
                  <td>{it.label}</td>
                  <td>
                    {it.text}
                    {it.warn && <span className="scan-warn"> {it.warn}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="busy-totals">
            {vfProgress.round}/{vfProgress.items.length} done ·{' '}
            <SimCount value={vfProgress.evals} /> sims
            {vfProgress.rippleDb !== undefined && vfProgress.phaseDeg !== undefined && (
              <>
                {' · best '}
                <BestMetric value={vfProgress.rippleDb} digits={2} /> dB /{' '}
                <BestMetric value={vfProgress.phaseDeg} digits={1} />°
              </>
            )}
            {` · ${Math.floor(busyElapsed / 60)}:${String(busyElapsed % 60).padStart(2, '0')}`}
          </div>
        </>
      ) : !vfBusy && netOptBusy && netOptPlan ? (
        // Component-tune view: the SAME stable-card pattern as the scan — one
        // fixed row per pipeline stage, states tick underneath (Sanders wens).
        <>
          <table className="busy-scan">
            <tbody>
              {netOptPlan.map((st) => {
                // Order-agnostic on purpose: stages fire in rounds and revisit
                // earlier labels (drift catches, ladder retunes), so "later
                // stage started ⇒ this one was skipped" would lie. A stage is
                // simply pending until it fires.
                const cur = netOptStages[netOptStages.length - 1];
                const state = st === cur ? 'active' : netOptStages.includes(st) ? 'done' : 'pending';
                return (
                  <tr key={st} className={state === 'done' ? 'done' : ''}>
                    <td>{st}</td>
                    <td>{state === 'active' ? 'running…' : state === 'done' ? '✓' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="busy-totals">
            {`${Math.floor(busyElapsed / 60)}:${String(busyElapsed % 60).padStart(2, '0')}`}
          </div>
        </>
      ) : (
        <div className="busy-detail">
          {vfBusy && vfProgress ? (
            <>
              {`round ${vfProgress.round} · `}
              <SimCount value={vfProgress.evals} /> network sims
              {vfProgress.rippleDb !== undefined && vfProgress.phaseDeg !== undefined && (
                <>
                  {' · best '}
                  <BestMetric value={vfProgress.rippleDb} digits={2} /> dB /{' '}
                  <BestMetric value={vfProgress.phaseDeg} digits={1} />°
                </>
              )}
            </>
          ) : vfBusy ? (
            'searching structures and EQ stages — runs in the background, the app stays live'
          ) : netOptBusy ? (
            'value fit, prune/escalate, debris sweep'
          ) : (
            'fitting real component values on the measured impedances'
          )}
          {anyBusy && busyElapsed > 0 ? ` · ${Math.floor(busyElapsed / 60)}:${String(busyElapsed % 60).padStart(2, '0')}` : ''}
        </div>
      )}
      {(vfBusy || netOptBusy) && (
        <div className="busy-actions">
          {/* A scan with finished candidates has something worth keeping.
              Cancel throws the whole field away, which is the wrong price for
              "I have seen enough" (Sander: "stel dat ik door wil met de 3
              complete uitkomsten"). This stops the compute and ranks what
              landed; the note says it was a partial field. */}
          {vfBusy && scanDoneCount > 0 && (
            <button
              type="button"
              className="busy-keep"
              onClick={stopKeepingResults}
              title={t('Stop searching and rank the candidates that already finished — the best of those is loaded, the rest is never computed. The scan table shows which ones ran.')}
            >
              {scanDoneCount === 1
                ? t('Use the 1 finished result')
                : t('Use the {n} finished results', { n: scanDoneCount })}
            </button>
          )}
          <button
            type="button"
            className="busy-cancel"
            onClick={cancelOptimTasks}
            title={t('Stop the run — nothing is committed, your design stays as it was')}
          >
            {t('Cancel')}
          </button>
        </div>
      )}
    </>
  );
  if (anyBusy) busyCardBodyRef.current = busyCardBody;

  /** Per-driver facts (position, enclosure, datasheet numbers, how many).
   *  Lives in step 1 "Your drivers" — these are properties of the DRIVER,
   *  while the baffle, the reference point and the mic rig belong to the
   *  cabinet in step 2. Held as a variable because the two blocks render
   *  in different tabs. */
  /** The baffle drawn from the numbers already typed, or a nudge toward the
   *  two that are missing. Rendered beside the driver cards. */
  const baffleDrawing = (() => {
    const w = Number(cabinet.baffleWidthMm);
    const h = Number(cabinet.baffleHeightMm);
    if (!(w > 0) || !(h > 0)) {
      return (
        <p className="derived driver-facts-draw">
          Add the baffle size on the cabinet step and this becomes a scale drawing of your front panel —
          the quickest way to see whether the positions you typed are the ones you meant.
        </p>
      );
    }
    const roles: [BranchRole, string][] = [
      ['high', t('Tweeter')],
      ['mid', t('Midrange')],
      ['low', t(hasMidBranch ? 'Woofer' : 'Woofer / mid')],
    ];
    return (
      <div className="driver-facts-draw">
        <BaffleView
          widthMm={w}
          heightMm={h}
          horizontal={w > h}
          refFromTopMm={Number(cabinet.refFromTopMm) || 0}
          drivers={roles
            .filter(([r]) => (r === 'low' ? !!woofer : r === 'mid' ? !!midDrv : !!tweeter))
            .map(([r, label]) => ({
              role: r,
              label,
              xMm: cabinet.refDriver === r ? 0 : Number(cabinet.drivers[r].xMm) || 0,
              yMm: cabinet.refDriver === r ? 0 : Number(cabinet.drivers[r].yMm) || 0,
              sdCm2: Number(sdCm2[r]) || 0,
              count: Number(cabinet.drivers[r].count) || 1,
              spacingMm: Number(cabinet.drivers[r].spacingMm) || 0,
            }))}
        />
        {(() => {
          // Zeg WAAROM de tekening leeg oogt in plaats van een lege doos te
          // tonen: zonder Sd is er geen echte conusmaat, en met alle posities
          // op nul liggen de drivers op elkaar. Allebei zijn het ontbrekende
          // getallen, geen fout in de tekening.
          const rollen = (['low', 'mid', 'high'] as BranchRole[]).filter((r) =>
            r === 'low' ? !!woofer : r === 'mid' ? !!midDrv : !!tweeter,
          );
          const zonderSd = rollen.filter((r) => !(Number(sdCm2[r]) > 0)).length;
          // The REFERENCE driver has no typed offset and never will: it is
          // 0,0 by definition, and the cabinet step already fixed its height
          // (so far below the top of the front panel). Counting it as
          // "without a position" claimed the app knew less than it does.
          const teTypen = rollen.filter((r) => cabinet.refDriver !== r);
          const zonderPos = teTypen.filter(
            (r) => !cabinet.drivers[r].xMm && !cabinet.drivers[r].yMm,
          ).length;
          const mist = [
            zonderSd > 0
              ? t('{n} Sd yet — those cones are dashed placeholders', {
                  n: zonderSd === rollen.length ? t('no') : `${zonderSd}`,
                })
              : '',
            zonderPos > 0 && zonderPos === teTypen.length
              ? teTypen.length === 1
                ? t('the other driver has no offset yet, so it sits on the reference point')
                : t('those offsets are still 0, so they sit on the reference point')
              : zonderPos > 0
                ? t('{n} without a position', { n: zonderPos })
                : '',
          ].filter(Boolean);
          return (
            <p className="derived">
              {mist.length === 0
                ? t('drawn to scale from the numbers on the left')
                : `${t('to scale —')} ${mist.join(' · ')}`}
            </p>
          );
        })()}
      </div>
    );
  })();

  const driverFacts = (
    <>
                {/* Top-down, the way the speaker stands in front of you
                    (Sanders wens): tweeter, then mid, then the woofers. The
                    cards then read in the same order as the drawing beside
                    them and as the cabinet itself. */}
                {(
                  [
                    ['high', t('Tweeter'), tweeter],
                    ['mid', t('Midrange'), midDrv],
                    ['low', t(hasMidBranch ? 'Woofer' : 'Woofer / mid'), woofer],
                  ] as [BranchRole, string, unknown][]
                )
                  .filter(([, , loaded]) => !!loaded)
                  .map(([role, title]) => {
                    const d = cabinet.drivers[role];
                    const set = (patch: Partial<CabinetDriver>) =>
                      setCabinet((c) => ({
                        ...c,
                        drivers: { ...c.drivers, [role]: { ...c.drivers[role], ...patch } },
                      }));
                    const angles = cabinetInfo.trueAngles(role);
                    const baffleFor = cabinetInfo.baffleStepOf(role);
                    /* Distance from the top of the front panel down to the
                       measurement reference point: the offset that turns a
                       ruler reading into this app's y. Null = not known yet. */
                    const fromTopBase =
                      Number(cabinet.refFromTopMm) > 0 ? Number(cabinet.refFromTopMm) : null;
                    const box = cabinetInfo.boxOf(role);
                    const edge = cabinetInfo.edgeOf(role);
                    const dia = cabinetInfo.diaOf(role);
                    // "Moeten we hier niet een bypass-vinkje voor?" (Sanders).
                    // Leeglaten ÍS al de bypass — elke consument behandelt een
                    // leeg veld als "criterium niet van toepassing". Wat ontbrak
                    // is dat je dat kunt ZIEN: een leeg veld zei niet of je er
                    // nog niet aan toe was of het bewust oversloeg, en al
                    // helemaal niet wát je ermee uitzet. Een apart vinkje zou een
                    // derde toestand toevoegen aan iets met er al twee, met als
                    // risico precies de stille fout: aangevinkt, vergeten, en
                    // later je afvragen waarom een criterium nooit vuurt.
                    const uit: string[] = [];
                    if (!(Number(sdCm2[role]) > 0) || !(Number(xmaxMm[role]) > 0)) {
                      uit.push(t('excursion floor'));
                    }
                    if (!(Number(sdCm2[role]) > 0)) uit.push(t('cone size for the beaming rules'));
                    if (cabinet.refDriver !== role && !d.xMm && !d.yMm)
                    uit.push(t('driver spacing, lobing and edge distance'));
                    if (d.enclosure === 'unknown') uit.push(t('what the box itself already filters'));
                    const samenvatting = [
                      Number(d.count) > 1 ? `${d.count}×` : '',
                      d.xMm || d.yMm
                        ? t('at {x}, {y} mm', { x: d.xMm || 0, y: d.yMm || 0 })
                        : t('no position'),
                      d.facing !== 'front'
                        ? `${t(FACING_LABEL[d.facing])}${d.opposed && Number(d.count) > 1 ? ` (${t('pair')})` : ''}`
                        : '',
                      Number(d.tiltDeg) ? t('tilt {deg}°', { deg: d.tiltDeg }) : '',
                      d.enclosure !== 'unknown' ? t(d.enclosure) : '',
                      Number(sdCm2[role]) > 0
                        ? `Sd ${sdCm2[role]} cm²`
                        : t('no datasheet numbers'),
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <details
                        key={role}
                        className="cabinet-driver"
                        open
                        style={
                          {
                            /* The same colour the driver's curve wears in every
                               chart and in the drawing — one identity across
                               the app. Colour reinforces, the name carries. */
                            '--drv-color':
                              role === 'high'
                                ? 'var(--viz-tweeter)'
                                : role === 'mid'
                                  ? 'var(--viz-mid)'
                                  : 'var(--viz-woofer)',
                          } as CSSProperties
                        }
                      >
                        {/* Was één doorlopende regel met invoervelden ertussen
                            ("Woofer x [ ] right, y [ ] up (mm ...)"), wat leest
                            als een zin met gaten in plaats van als een formulier
                            (Sanders: "ik vind het toch rommelig met de drivers").
                            Nu een gelabeld raster: één onderwerp per regel, label
                            links, en het AANTAL bij de naam -- dat hoort bij de
                            identiteit van de tak, niet bij zijn afmetingen. */}
                        {/* Inklapbaar: een ingevulde driver hoeft geen ruimte te
                            blijven vragen. NOOIT kaal ingeklapt — de samenvatting
                            in de kop is de voorwaarde, anders leest dichtklappen
                            als dataverlies (de les uit Filter bands). */}
                        <summary className="cd-head">
                          <strong>{title}</strong>
                          <span
                            className="inline-num"
                            title={t("How many IDENTICAL drivers make up this branch. Dual woofers displace twice the air, so the excursion floor drops by √2 — but each cone still beams as itself, so Sd below stays the SINGLE driver's datasheet number. With more than one, their centre-to-centre spacing sets where the array's own vertical lobing starts, which is usually a lower ceiling than cone beaming.")}
                          >
                            {'× '}
                            <input
                              type="number"
                              min={1}
                              step={1}
                              placeholder="1"
                              value={d.count}
                              onChange={(e) => set({ count: e.target.value })}
                            />
                            {Number(d.count) > 1 ? ' ' + t('drivers, spaced') + ' ' : ' ' + t('driver')}
                            {Number(d.count) > 1 && (
                              <>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={d.spacingMm}
                                  onChange={(e) => set({ spacingMm: e.target.value })}
                                />
                                {' ' + t('mm apart')}
                              </>
                            )}
                          </span>
                          <span className="cd-summary">{samenvatting}</span>
                        </summary>
                        <div className="cd-grid">
                          <span className="cd-label">{t('Position')}</span>
                          {cabinet.refDriver === role ? (
                            /* Deze driver ÍS het referentiepunt, dus 0,0 is
                               geen invoer maar een gevolg. Ernaar vragen
                               nodigt uit tot de enige fout die het niet kan
                               zijn -- Sander typte hier -50 voor de tweeter
                               waar de microfoon nou juist op stond. */
                            <span className="cd-fields">
                              <span className="cd-pre" />
                              <em>
                                {t('0, 0 — the mic was aimed here, so this driver defines the origin')}
                                {(() => {
                                  // Its height is not unknown, it was fixed on the cabinet
                                  // step. Saying so beats making the designer go and look.
                                  const top = Number(cabinet.refFromTopMm);
                                  const floor = Number(cabinet.refHeightMm);
                                  const bits = [
                                    top > 0 ? t('{mm} mm below the top', { mm: Math.round(top) }) : '',
                                    floor > 0 ? t('{mm} mm above the floor', { mm: Math.round(floor) }) : '',
                                  ].filter(Boolean);
                                  return bits.length > 0 ? ` (${bits.join(', ')})` : '';
                                })()}
                              </em>
                            </span>
                          ) : (
                          <span
                            className="cd-fields"
                            title={t("Where this driver's centre sits on the front panel, measured the way a ruler measures it: across from the centre line, and DOWN from the top. The app converts to its internal origin (the measurement reference point) using the reference height you gave on the cabinet step, so you never type the same fact twice — and centre-to-centre spacing per pair, with it the vertical-lobing ceiling, is derived from these.")}
                          >
                            <span className="cd-pre">x</span>
                            <input
                              type="number"
                              step={5}
                              placeholder="0"
                              value={d.xMm}
                              onChange={(e) => set({ xMm: e.target.value })}
                            />
                            {fromTopBase !== null ? ' ' + t('mm from the centre line') + ' · ' : ' mm · y '}
                            {/* Measured from the TOP of the front panel, because that
                                is where a ruler starts (Sanders). Storage keeps the
                                reference-point origin — every geometry function, the
                                project format and the tests are written in it — so
                                this is a pure input conversion: down-from-top =
                                refFromTop − y. Without a reference height there is
                                nothing to convert with, and the field falls back to
                                the raw y with the unit text saying so. */}
                            <input
                              type="number"
                              step={5}
                              placeholder="0"
                              value={
                                fromTopBase !== null
                                  ? d.yMm.trim() === ''
                                    ? ''
                                    : String(
                                        Math.round((fromTopBase - Number(d.yMm)) * 10) / 10,
                                      )
                                  : d.yMm
                              }
                              onChange={(e) => {
                                if (fromTopBase === null) {
                                  set({ yMm: e.target.value });
                                  return;
                                }
                                const v = e.target.value;
                                if (v.trim() === '' || !Number.isFinite(Number(v))) {
                                  set({ yMm: v.trim() === '' ? '' : d.yMm });
                                  return;
                                }
                                set({ yMm: String(Math.round((fromTopBase - Number(v)) * 10) / 10) });
                              }}
                            />
                            {fromTopBase !== null ? ' ' + t('mm below the top') : ' mm'}
                            <span className="cd-hint">
                              {fromTopBase !== null
                                ? t('as a ruler measures it — across from the centre line, down from the top of the front panel')
                                : t('from the reference point · y up — add the reference height on the cabinet step to measure from the top instead')}
                            </span>
                          </span>
                          )}

                        {angles && (
                          <span className="derived">
                            {t('your sweep really covers')}{' '}
                            {angles
                              .map((a) =>
                                a.opposed
                                  ? `${a.nominal}°→${a.opposed.nearDeg.toFixed(0)}°/${a.opposed.farDeg.toFixed(0)}°`
                                  : `${a.nominal}°→${a.actual!.toFixed(0)}°`,
                              )
                              .join(', ')}
                            {angles.some((a) => a.opposed) &&
                              ' ' + t('— two figures because the pair fires both ways; a sweep measures their sum')}
                          </span>
                        )}
                        {edge !== null && (
                          <span className="derived">
                            {t('nearest baffle edge {mm} mm', { mm: Math.round(edge) })}
                          </span>
                        )}
                        {Number(d.count) > 1 && (
                          <span className="derived">
                            {t('excursion floor drops ×{f}', { f: (1 / Math.sqrt(Number(d.count))).toFixed(2) })}
                            {arrayLobe[role]
                              ? ` · ${t('array lobing from {hz} Hz', { hz: Math.round(arrayLobe[role]!) })}${
                                  Number(cabinet.baffleWidthMm) > Number(cabinet.baffleHeightMm)
                                    ? ' ' + t('— ACROSS the seats: this baffle is wider than tall')
                                    : ' ' + t('— vertically, and you sit on that axis')
                                }`
                              : ` · ${t('enter the spacing for the array lobing ceiling')}`}
                          </span>
                        )}
                          <span className="cd-label">{t('Mounting')}</span>
                          <span
                            className="cd-fields"
                            title={t("Which panel this driver radiates from, and how far its acoustic centre sits behind the baffle plane. Side-firing woofers are an ordinary design, and without this the app judges the driver against a front baffle it is not on: it would read ~0° off-axis when it is really 90°, take the baffle step from the wrong panel width, and charge half a cabinet of mounting depth (hundreds of µs) to the driver's acoustic centre — which is what makes a perfectly normal speaker trip the timing check.")}
                          >
                            <span className="cd-pre" />
                            <select
                              value={d.facing}
                              onChange={(e) => set({ facing: e.target.value as DriverFacing })}
                            >
                              <option value="front">{t('fires forward')}</option>
                              <option value="rear">{t('fires backward')}</option>
                              <option value="left">{t('fires left')}</option>
                              <option value="right">{t('fires right')}</option>
                              <option value="up">{t('fires up')}</option>
                              <option value="down">{t('fires down')}</option>
                            </select>
                            {' · ' + t('depth') + ' '}
                            <input
                              type="number"
                              min={0}
                              step={5}
                              placeholder="0"
                              value={d.depthMm}
                              onChange={(e) => set({ depthMm: e.target.value })}
                            />
                            {' mm · ' + t('tilt') + ' '}
                            <input
                              type="number"
                              step={1}
                              placeholder="0"
                              value={d.tiltDeg}
                              onChange={(e) => set({ tiltDeg: e.target.value })}
                            />
                            {'°'}
                            {Number(d.count) > 1 && d.facing !== 'front' && (
                              <label
                                className="cd-inline-check"
                                title={t('These drivers sit on BOTH opposing panels, firing away from each other — the force-cancelling arrangement side-mounted woofers are normally built in. They then have two different true angles, and a sweep measures their sum.')}
                              >
                                <input
                                  type="checkbox"
                                  checked={d.opposed}
                                  onChange={(e) => set({ opposed: e.target.checked })}
                                />{' '}
                                {t('opposed pair')}
                              </label>
                            )}
                            <span className="cd-hint">
                              {/* ACOUSTIC centre, and say so: "0 for a flush-mounted
                                  driver" invited the flange reading — a flush-mounted
                                  cone's centre still sits its cone depth back, which is
                                  exactly what confused the measured-depth readout. */}
                              {d.facing === 'front'
                                ? t('acoustic centre behind the baffle — a flush-mounted cone still sits its cone depth back · tilt + = aimed up')
                                : t('acoustic centre from the front, along the cabinet · tilt + = aimed up')}
                            </span>
                          </span>

                        {measuredDepth?.depths[role] !== undefined && (
                          <span className="derived">
                            {/* The derivation lives under the timing panel on the
                                cabinet step, which is the wrong place to read it:
                                the field it answers is HERE. Same complaint as
                                having to go and look up the reference height. */}
                            {(() => {
                              const m = measuredDepth.depths[role]!;
                              const typed = d.depthMm.trim() !== '' ? Number(d.depthMm) : null;
                              const off = typed !== null ? Math.abs(typed - m) : null;
                              // Always phrase it as a RELATION between two named
                              // drivers. Anchoring one at 0 and calling it "the
                              // shallowest" reads as "unknown" — Sander expected
                              // the tweeter's own number and found a bare 0.
                              const anchor = measuredDepth.shallowest;
                              const anchorName =
                                anchor === 'high'
                                  ? t('the tweeter')
                                  : anchor === 'mid'
                                    ? t('the midrange')
                                    : hasMidBranch
                                      ? t('the woofer')
                                      : t('the woofer/mid');
                              const deepest = measuredDepth.spread;
                              return (
                                <>
                                  {role === anchor ? (
                                    <>
                                      <strong>{t('measured: this is the shallowest driver')}</strong>
                                      {t(', so it is the 0 the others are counted from')}
                                      {deepest >= 0.05
                                        ? ` ${t('— they sit up to {mm} mm behind it.', { mm: deepest.toFixed(1) })}`
                                        : '.'}
                                    </>
                                  ) : (
                                    <>
                                      <strong>{t('measured depth {mm} mm', { mm: m.toFixed(1) })}</strong>{' '}
                                      {t('behind {anchor}, from the delay with the rig removed.', { anchor: anchorName })}
                                    </>
                                  )}
                                  {off !== null && (
                                    <>
                                      {' '}
                                      {off <= Math.max(1, 0.1 * Math.max(typed!, m))
                                        ? t('Your {mm} mm agrees.', { mm: typed!.toFixed(1) })
                                        : t('You typed {mm} mm — one of the two is wrong.', { mm: typed!.toFixed(1) })}
                                    </>
                                  )}{' '}
                                  <button
                                    type="button"
                                    className="link-btn"
                                    onClick={() => set({ depthMm: m.toFixed(1) })}
                                    title={t('Write the measured depth into the field above. It fixes the geometry (true off-axis angle, centre-to-centre spacing), but note that the timing split then explains itself by construction and stops being an independent check.')}
                                  >
                                    {t('use it')}
                                  </button>
                                </>
                              );
                            })()}
                          </span>
                        )}
                        {measuredDepth?.depths[role] !== undefined && measuredDepth.suspicious && (
                          <span className="derived alert">
                            ⚠{' '}
                            {t('Physically unusual: the woofer reads as the shallowest driver, {mm} mm in front of the tweeter — a dome is normally the shallowest, a cone’s acoustic centre sits at the voice coil. This is a rig reading far more often than a fact: check the woofer’s position and the mic distance, and that the mic stayed put and aimed at the same point for the woofer sweep. Until then, do not use these depths.', {
                              mm: (measuredDepth.depths.high! - measuredDepth.depths.low!).toFixed(1),
                            })}
                            {measuredDepth.weakFit !== null
                              ? ` ${t('(The delay fit of the {drv} is also not cleanly delay-like.)', { drv: measuredDepth.weakFit === 'low' ? t('woofer') : measuredDepth.weakFit === 'mid' ? t('midrange') : t('tweeter') })}`
                              : ''}
                          </span>
                        )}
                        {d.facing !== 'front' && (
                          <span className="derived alert">
                            {t("{facing}: a front turntable sweep cannot measure this driver's own directivity — the numbers above are the SYSTEM turning, not the cone. Near-field is the honest route for its response, and its baffle is the {panel} panel", {
                              facing: t(FACING_LABEL[d.facing]),
                              panel:
                                d.facing === 'left' || d.facing === 'right'
                                  ? t('side')
                                  : t('top/bottom'),
                            })}
                            {baffleFor !== null
                              ? `, ${t('step around {hz} Hz', { hz: Math.round(baffleFor) })}`
                              : ''}
                            .
                          </span>
                        )}
                        {/* A5a — MEASUREMENT metadata for engine v2 (F3b).
                          *
                          * Behind the toggle, and that is a deliberate choice
                          * rather than caution: with the engine off the app
                          * must be byte-identical, and these fields feed
                          * nothing else. They are per MEASUREMENT SESSION, so
                          * they sit in the geometry form beside the cabinet
                          * facts they belong with rather than in the optimizer
                          * options, which are settings of a search. */}
                        {engineSelection.reporting && (
                          <>
                            <span className="cd-label">{t('Engine v2 — measurement')}</span>
                            <span
                              className="cd-fields"
                              title={t("Facts about the MEASUREMENT this driver's derived parameters come from (spec A5a). Every field is optional and blank means absent — the metric that needs it then stays off with a reason, which is the whole point of this layer.")}
                            >
                              <span className="cd-pre" />
                              <span
                                className="inline-num"
                                title={t("Acoustic centre on the VERTICAL axis, mm — what the vertical lobing synthesis (M-F-final) places this source at. Blank = the baffle position above, which is the same number for a flush-mounted driver and the wrong one for a pod or a waveguide. Without it for EVERY way, M-F-final stays off rather than reporting the coplanar 0.0 dB.")}
                              >
                                {t('acoustic centre z') + ' '}
                                <input
                                  type="number"
                                  step={1}
                                  placeholder={cabinet.drivers[role]?.yMm || '—'}
                                  value={v2Meas[role].zMm}
                                  onChange={(e) => setV2MeasField(role, 'zMm', e.target.value)}
                                  style={{ width: '5rem' }}
                                />
                                {' mm'}
                              </span>{' '}
                              <span
                                className="inline-num"
                                title={t("Does this branch radiate rotationally symmetrically about its axis? M-F-final treats every source as a point at its acoustic centre, and that assumption is weakest where the radiation is not symmetric. Left unstated the metric says so as a limitation — it does not assume either answer.")}
                              >
                                {t('rotationally symmetric') + ' '}
                                <select
                                  value={v2Meas[role].rotSym}
                                  onChange={(e) => setV2MeasField(role, 'rotSym', e.target.value)}
                                >
                                  <option value="">{t('not stated')}</option>
                                  <option value="yes">{t('yes')}</option>
                                  <option value="no">{t('no')}</option>
                                </select>
                              </span>{' '}
                              <span
                                className="inline-num"
                                title={t("DC resistance measured with a meter, Ω. This OUTRANKS both sweep derivations: it is a measurement of the quantity itself, while everything read off an impedance sweep is inference. It moves M-E, the Q_es search bound, the vented loss indicator and the sealed alignment together, because all of them divide by it. Blank = the engine derives it and shows which way.")}
                              >
                                {t('measured R_e') + ' '}
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder={t('derived')}
                                  value={v2Meas[role].reOhm}
                                  onChange={(e) => setV2MeasField(role, 'reOhm', e.target.value)}
                                  style={{ width: '4.5rem' }}
                                />
                                {' Ω'}
                              </span>{' '}
                              {/* V49 — the two datasheet numbers M-C v2.0 needs
                                  beside the Sd/Xmax above: with them, the measured
                                  resonance (f_s, Z_max, Q_ms from the sweep) and the
                                  amplifier peak, the drive limit on the resonance is
                                  DERIVED from excursion instead of stated. */}
                              <span
                                className="inline-num"
                                title={t("Force factor Bl from the datasheet, T·m. With M_ms, the measured Z_max, f_s and Q_ms of the sweep this gives the cone displacement per volt on the resonance (M-C v2.0, electromechanical route). Blank = that route is off for this driver and the stated dB figure alone judges it.")}
                              >
                                {t('Bl') + ' '}
                                <input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  placeholder="—"
                                  value={v2Meas[role].blTm}
                                  onChange={(e) => setV2MeasField(role, 'blTm', e.target.value)}
                                  style={{ width: '4rem' }}
                                />
                                {' T·m'}
                              </span>{' '}
                              <span
                                className="inline-num"
                                title={t("Moving mass M_ms from the datasheet, g. See Bl.")}
                              >
                                {t('M_ms') + ' '}
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="—"
                                  value={v2Meas[role].mmsG}
                                  onChange={(e) => setV2MeasField(role, 'mmsG', e.target.value)}
                                  style={{ width: '4rem' }}
                                />
                                {' g'}
                              </span>{' '}
                              <span
                                className="inline-num"
                                title={t("The drive voltage (V rms) the on-axis far field was measured at, when you documented it. A header cannot say it. With the mic distance on the cabinet form and Sd it arms the ACOUSTIC counter-proof of M-C v2.0 — a second reading of the displacement per volt from the measured SPL, which overestimates under any loading (waveguide, cabinet front) and whose ratio to the electromechanical route is the mounting's own loading, measured. Blank = that route is off, with the reason shown.")}
                              >
                                {t('measured at') + ' '}
                                <input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  placeholder="—"
                                  value={v2Meas[role].driveVoltageV}
                                  onChange={(e) => setV2MeasField(role, 'driveVoltageV', e.target.value)}
                                  style={{ width: '4rem' }}
                                />
                                {' V'}
                              </span>{' '}
                              {/* V50 — the stated M-C figure PER WAY. The 18-dB
                                  convention is a dome rule (thermal, distortion);
                                  a cone's limit on its resonance is excursion,
                                  which V49 derives — so state the convention for
                                  the way it belongs to and leave the others to the
                                  derived ceiling. */}
                              <span
                                className="inline-num"
                                title={t("Max drive on f_s for THIS way, dB relative to its passband (M-C, V50). Overrides the single 'Max drive on f_s dB' field for this way. Blank here AND blank there = no stated figure: the excursion-derived ceiling alone judges this way (or nothing, when no ceiling could be derived).")}
                              >
                                {t('max drive on f_s') + ' '}
                                <input
                                  type="number"
                                  max={0}
                                  placeholder="—"
                                  value={v2Meas[role].driveOnFsMaxDb}
                                  onChange={(e) => setV2MeasField(role, 'driveOnFsMaxDb', e.target.value)}
                                  style={{ width: '4.5rem' }}
                                />
                                {' dB'}
                              </span>{' '}
                              {/* V51 — the WIRING of the way: how its N identical
                                  drivers (the count on the cabinet form) were
                                  connected when measured, and how the design
                                  intends to connect them. Reported per way; the
                                  parallel↔series derivation (SPL ±20·log N, Z
                                  ×/÷N²) exists and is applied only when the two
                                  differ — and it assumes equal drivers. */}
                              <span
                                className="inline-num"
                                title={t("How this way's identical drivers were wired when MEASURED (V51). With the count on the cabinet form and the intended wiring beside it the report says what series wiring would deliver of the way's surplus over the anchor without a resistor (20·log N dB). Not stated = the report says so and derives nothing.")}
                              >
                                {t('measured wiring') + ' '}
                                <select
                                  value={v2Meas[role].wiringMeasured}
                                  onChange={(e) => setV2MeasField(role, 'wiringMeasured', e.target.value)}
                                >
                                  <option value="">{t('not stated')}</option>
                                  <option value="parallel">{t('parallel')}</option>
                                  <option value="series">{t('series')}</option>
                                </select>
                              </span>{' '}
                              <span
                                className="inline-num"
                                title={t("How the design INTENDS to wire this way's identical drivers (V51). Differs from the measured wiring = the measured response describes a build nobody intends; the engine reports the derived difference (equal drivers assumed) rather than applying it silently.")}
                              >
                                {t('intended wiring') + ' '}
                                <select
                                  value={v2Meas[role].wiringDesired}
                                  onChange={(e) => setV2MeasField(role, 'wiringDesired', e.target.value)}
                                >
                                  <option value="">{t('not stated')}</option>
                                  <option value="parallel">{t('parallel')}</option>
                                  <option value="series">{t('series')}</option>
                                </select>
                              </span>{' '}
                              {/* A5e.3 — the COIL FAMILY of this way. The search
                                  and every gate then judge each coil with the DCR
                                  that family has at its inductance (fitted on the
                                  loaded catalogue); not stated = lossless coils,
                                  reported as a deviation from any build. */}
                              <span
                                className="inline-num"
                                title={t("Which coil family (brand, series, wire gauge) this way is wound with (A5e.3). Every continuous coil on the way is then judged — in the search, in every gate and inversion, in the report — with the DCR that family has at the coil's inductance, fitted on the loaded catalogue (DCR ∝ L^k per family). Not stated = the way's coils are lossless, which no built loudspeaker is; the report says so. Needs an imported catalogue with coil DCR data.")}
                              >
                                {t('coil family') + ' '}
                                <select
                                  value={v2Meas[role].coilFamily}
                                  onChange={(e) => setV2MeasField(role, 'coilFamily', e.target.value)}
                                >
                                  <option value="">{coilDcrFits.length > 0 ? t('not stated (lossless)') : t('no catalogue with coil DCR loaded')}</option>
                                  {coilDcrFits.map((f) => (
                                    <option key={f.family} value={f.family}>
                                      {`${f.label} · ${(f.rangeH[0] * 1e3).toPrecision(2)}–${(f.rangeH[1] * 1e3).toPrecision(3)} mH · ${f.ohmAt1mH.toFixed(2)} Ω @ 1 mH`}
                                    </option>
                                  ))}
                                  {v2Meas[role].coilFamily !== '' && !coilDcrFits.some((f) => f.family === v2Meas[role].coilFamily) && (
                                    <option value={v2Meas[role].coilFamily}>{`${v2Meas[role].coilFamily} (${t('not in the loaded catalogue')})`}</option>
                                  )}
                                </select>
                              </span>
                            </span>
                            <span className="cd-label">{t('Window (no header)')}</span>
                            <span
                              className="cd-fields"
                              title={t("Window metadata for this branch's GATED far-field files, for measurements whose headers carry none. A FALLBACK, never an override: a file that has the fields in its header uses those, and nothing you type here can relax a measured gate floor (spec A5b.1(i)). Give the two times and the app derives the effective window exactly as it does from a header, or give the validity floor itself. The panel shows which of the two spoke.")}
                            >
                              <span className="cd-pre" />
                              {t('reference time') + ' '}
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                placeholder="—"
                                value={v2Meas[role].refTimeMs}
                                onChange={(e) => setV2MeasField(role, 'refTimeMs', e.target.value)}
                                style={{ width: '4.5rem' }}
                              />
                              {' ms · ' + t('right window') + ' '}
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                placeholder="—"
                                value={v2Meas[role].rightWindowMs}
                                onChange={(e) => setV2MeasField(role, 'rightWindowMs', e.target.value)}
                                style={{ width: '4.5rem' }}
                              />
                              {' ms · ' + t('or floor') + ' '}
                              <input
                                type="number"
                                min={0}
                                step={10}
                                placeholder="—"
                                value={v2Meas[role].floorHz}
                                onChange={(e) => setV2MeasField(role, 'floorHz', e.target.value)}
                                style={{ width: '5rem' }}
                              />
                              {' Hz '}
                              <input
                                type="text"
                                placeholder={t('where these came from')}
                                value={v2Meas[role].windowNote}
                                onChange={(e) => setV2MeasField(role, 'windowNote', e.target.value)}
                                style={{ width: '10rem' }}
                              />
                            </span>
                          </>
                        )}
                          {role === 'high' ? (
                            <>
                              <span className="cd-label">{t('Chamber')}</span>
                              <span className="cd-fields">
                                <span className="cd-pre" />
                                <em>
                                  {t('a dome is its own sealed rear chamber — nothing to choose')}
                                  {boxTuneFromZ.high
                                    ? `; ${t('resonance ≈ {hz} Hz from your impedance (the 2×Fs crossover floor reads this)', { hz: Math.round(boxTuneFromZ.high.hz) })}`
                                    : ''}
                                </em>
                              </span>
                            </>
                          ) : (
                            <>
                          <span className="cd-label">{t('Chamber')}</span>
                          <span className="cd-fields">
                            <span className="cd-pre" />
                            <select
                              value={d.enclosure}
                              onChange={(e) => set({ enclosure: e.target.value as Enclosure })}
                              title={t('The volume behind THIS driver — per driver on purpose: a 3-way routinely runs a sealed mid chamber inside a ported cabinet, so one answer for the whole box would be wrong. A sealed chamber is already a 2nd-order acoustic high-pass at its corner, so a 2nd-order electrical filter yields a 4th-order acoustic slope — on a low crossover that is the difference between one ~30 µF capacitor and a pair adding to ~90 µF. A port also means the box can radiate its own midrange through a pipe resonance.')}
                            >
                              <option value="unknown">{t('unknown')}</option>
                              <option value="sealed">{t('sealed')}</option>
                              <option value="ported">{t('ported')}</option>
                              <option value="open">{t('open / dipole')}</option>
                            </select>
                            {d.enclosure !== 'unknown' && d.enclosure !== 'open' && (
                              <>
                                {d.enclosure === 'ported' ? ' Fb ' : ' Fc '}
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={d.fbHz}
                                  onChange={(e) => set({ fbHz: e.target.value })}
                                />
                                {' Hz'}
                              </>
                            )}
                            <span className="cd-hint">
                              {t('the volume behind THIS driver — one cabinet can hold different chambers')}
                            </span>
                          </span>
                          {(() => {
                            // The measurement already carries the corner: an in-box
                            // ZMA's resonance IS Fc (sealed) and the saddle between
                            // its twin peaks IS Fb (ported). Offer it, never apply it
                            // silently — and with a value typed it turns into the
                            // cross-check role this panel prefers.
                            const bt = boxTuneFromZ[role];
                            if (!bt) return null;
                            const typed = d.fbHz.trim() !== '' ? Number(d.fbHz) : null;
                            const off =
                              typed !== null && typed > 0
                                ? Math.abs(typed - bt.hz) / Math.max(typed, bt.hz)
                                : null;
                            return (
                              <span className="derived">
                                {t('your impedance measurement suggests {kind} ≈ {hz} Hz (valid if the ZMA was taken in this box).', { kind: bt.kind, hz: Math.round(bt.hz) })}
                                {off !== null && (
                                  <>
                                    {' '}
                                    {off <= 0.15
                                      ? t('Your {hz} Hz agrees.', { hz: typed! })
                                      : t('You typed {hz} Hz — one of the two is wrong.', { hz: typed! })}
                                  </>
                                )}{' '}
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => set({ fbHz: String(Math.round(bt.hz)) })}
                                >
                                  {t('use it')}
                                </button>
                              </span>
                            );
                          })()}
                            </>
                          )}

                        {role !== 'high' && box.note && (
                          <span className="derived">{box.note}</span>
                        )}
                        {role !== 'high' && cabinetInfo.unloadOf(role) === 'high' && (
                          <span className="derived alert">
                            {t('ported: excursion runs away below Fb')}
                            {Number(d.fbHz) > 0 ? ` ≈ ${Math.round(Number(d.fbHz))} Hz` : ''}{' '}
                            {t('— worth a steeper electrical high-pass than a sealed box would need')}
                          </span>
                        )}
                          <span className="cd-label">{t('Datasheet')}</span>
                          <span
                            className="cd-fields"
                            title={t('Cone area and linear excursion from the datasheet, for ONE driver. Sd gives the effective piston diameter (the honest one for every beaming rule — nominal size includes a surround that does not radiate); Sd and Xmax together give the level-aware excursion floor.')}
                          >
                            <span className="cd-pre">Sd</span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={sdCm2[role]}
                              onChange={(e) => setSdCm2((q) => ({ ...q, [role]: e.target.value }))}
                            />
                            {' cm² · Xmax '}
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={xmaxMm[role]}
                              onChange={(e) => setXmaxMm((q) => ({ ...q, [role]: e.target.value }))}
                            />
                            {' mm'}
                          </span>
                        {dia && (
                          <span className="derived">
                            {t('effective Ø {mm} mm', { mm: Math.round(dia) })}
                          </span>
                        )}
                        {uit.length > 0 && (
                          <span className="derived">
                            {t('leaving these blank is fine — it switches off:') + ' '}
                            {uit.join(' · ')}
                          </span>
                        )}
                        </div>
                      </details>
                    );
                  })}
    </>
  );

  /* ─── Command palette, shortcuts overlay, issues list, held trace ─────────
   * Keyboard-first layer (Linear/Figma pattern): ⌘K reaches every action,
   * "?" teaches every key, and the issues chip is a DRC-style single list of
   * everything currently wrong (KiCad pattern). All UI-layer — each action
   * calls the same handlers the buttons call. */

  const issues: { text: string; where: string }[] = [];
  if (simStale)
    issues.push({
      text: simStale.refusal.describe,
      where: t('Network tab — the status line under the editor'),
    });
  else if (networkActive && readiness && readiness.kind === 'simulable' && readiness.defects.length > 0)
    issues.push({
      text: readiness.describe,
      where: t('Network tab — the status line under the editor names each part'),
    });
  if (error)
    issues.push({ text: error, where: t('Import tab — the banner above the file slots') });
  if (midIgnored)
    issues.push({
      text: t('Midrange files are loaded but the set is not a full 3-way — the mid is NOT in the summed response.'),
      where: t('Import tab — load a woofer AND a tweeter as well, or clear the mid slot'),
    });
  if (!threeWay && timing && timing.ref.verdict !== 'plausible')
    issues.push({
      text: t('Timing {verdict}: the two sweeps may not share a time reference, which silently ruins every phase number.', { verdict: timing.ref.verdict }),
      where: t('Topbar Timing chip — hover it for the full verdict; 📐 Measure explains the shared-clock rig'),
    });
  if (threeWay && timing3) {
    for (const p of [timing3.low, timing3.high]) {
      if (p && p.verdict !== 'plausible')
        issues.push({
          text: `${t('Pair time-base {verdict}:', { verdict: p.verdict })} ${p.message.split('\n')[0]}`,
          where: t('Topbar Timing chip — hover for both pairs'),
        });
    }
  }
  /* Only an amplifier the designer named can be "too low for": without a
   * stated rating the minimum is a fact on the Impedance panel, not a fault. */
  if (ampMinLoadOhm !== null && systemZInfo && systemZInfo.minOhm < ampMinLoadOhm)
    issues.push({
      text: t('System impedance dips to {z} Ω — below the {floor} Ω your amplifier is rated for.', { z: systemZInfo.minOhm.toFixed(1), floor: ampMinLoadOhm.toFixed(1) }),
      where: t('System impedance panel — the Z min marker shows where; the optimizer repairs this when it can'),
    });

  const canQuickSave = !!activeDesignId && !!lastSavedId && lastSavedId !== activeDesignId;

  function holdCurrentTrace() {
    if (!result) return;
    setHeldTrace({ x: [...result.freq], y: [...result.combinedSpl] });
  }

  const gotoKeys: (typeof designTab)[] =
    uiMode === 'guided'
      ? ['import', 'data', 'drivers', 'filters', 'network']
      : ['import', 'data', 'filters', 'network'];

  type PaletteAction = { id: string; label: string; hint?: string; run: () => void };
  const paletteActions: PaletteAction[] = [
    ...gotoKeys.map((tab, i) => ({
      id: `go-${tab}`,
      label: t('Go to: {step}', {
        step: t(uiMode === 'guided' ? GUIDED_STEP_LABEL[tab] : EXPERT_TAB_LABEL[tab]),
      }),
      hint: `${i + 1}`,
      run: () => setDesignTab(tab),
    })),
    {
      id: 'optimize',
      label: soloDriver ? t('Optimize — flatten driver') : t('Optimize — design for me'),
      hint: t('the one-button designer'),
      run: () => {
        setDesignTab('filters');
        void runVfOptimize().catch((e) => {
          setVfBusy(false);
          setVfError(e instanceof Error ? e.message : String(e));
        });
      },
    },
    { id: 'wizard', label: t('Open the design wizard'), run: () => setWizardOpen(true) },
    { id: 'compare', label: t('Compare mode: model vs measurement'), hint: t('load the built speaker’s response'), run: () => setUiMode('compare') },
    { id: 'measure', label: t('Open the measuring guide'), hint: t('rig, distances, angles'), run: () => setMeasureGuideOpen(true) },
    { id: 'help', label: t('Open the manual'), run: () => setHelpOpen(true) },
    { id: 'targets', label: t('Show design targets'), hint: t('what the last build was fitted against'), run: () => setShowTargets(true) },
    { id: 'catalog', label: t('Open the catalog manager'), hint: t('SKUs, prices, series'), run: () => setCatalogMgrOpen(true) },
    { id: 'demo', label: t('Load the KOAN demo measurements'), hint: t('3-way, Aug 2026: woofer pair + mid + tweeter, angles, near fields, cabinet'), run: () => loadDemo() },
    { id: 'demo2', label: t('Load the 2-way demo (KOAN prototype 2023)'), hint: t('mid + tweeter, angles, VituixCAD variants'), run: () => loadDemo2Way() },
    {
      id: 'hold',
      label: heldTrace ? t('Clear the held reference curve') : t('Hold the combined curve as reference'),
      hint: t('freeze a copy in the SPL chart to compare against (REW: hold trace)'),
      run: () => (heldTrace ? setHeldTrace(null) : holdCurrentTrace()),
    },
    ...PANEL_KEYS.map((k) => ({
      id: `panel-${k}`,
      label: t(showPanels[k] ? 'Hide chart: {name}' : 'Show chart: {name}', {
        name: t(PANEL_LABEL[k]),
      }),
      run: () => setShowPanels((p) => ({ ...p, [k]: !p[k] })),
    })),
    {
      id: 'theme',
      label: theme === 'dark' ? t('Theme: switch to light') : t('Theme: switch to dark'),
      run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    },
    { id: 'save', label: t('💾 Save (overwrite last saved filter)'), hint: '⌘S', run: () => { if (canQuickSave) overwriteLastSaved(); } },
    { id: 'shortcuts', label: t('Keyboard shortcuts'), hint: '?', run: () => setShortcutsOpen(true) },
    ...(issues.length > 0
      ? [{ id: 'issues', label: t('Show current issues ({n})', { n: issues.length }), run: () => setIssuesOpen(true) }]
      : []),
  ];
  const palFiltered = paletteActions.filter((a) => {
    const q = palQuery.trim().toLowerCase();
    return !q || a.label.toLowerCase().includes(q) || (a.hint ?? '').toLowerCase().includes(q);
  });
  function runPaletteAction(a: PaletteAction) {
    setPaletteOpen(false);
    setPalQuery('');
    setPalIx(0);
    a.run();
  }

  /* Global keys, bound once via a ref so the listener always sees the latest
   * closures (the Chart wheel pattern). Typing fields and open dialogs are
   * left alone — digits in a value field must stay digits. */
  keyRef.current = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement | null;
    const typing =
      tgt instanceof HTMLInputElement ||
      tgt instanceof HTMLTextAreaElement ||
      tgt instanceof HTMLSelectElement ||
      (tgt?.isContentEditable ?? false);
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setPaletteOpen((o) => !o);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      // Always swallow ⌘S: the browser's save-page dialog is never what a
      // user of this app means by "save".
      e.preventDefault();
      if (canQuickSave) overwriteLastSaved();
      return;
    }
    if (typing || document.querySelector('[role="dialog"]')) return;
    if (e.key === '?') {
      e.preventDefault();
      setShortcutsOpen(true);
      return;
    }
    if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-5]$/.test(e.key)) {
      const target = gotoKeys[Number(e.key) - 1];
      if (target) setDesignTab(target);
    }
  };

  /* COMPARE MODE — the VALIDATIE.md loop as a workspace instead of a popup.
     Three things, top to bottom, each reading live state: the design the
     charts simulate, the measurements of the built speaker (a list — v1, v2 —
     because "did it get better?" is the question), and the verdict. The
     charts on the right are the SPL overlay and the phase residual only. */
  const comparePane = (
    <div className="panel compare-pane">
      <h2>🔬 {t('Compare — model vs measurement')}</h2>
      <p className="sub">
        {t('Open the project you designed with, load the measured response of the BUILT speaker, and read where the two differ. Level and mic distance are aligned for you and shown as numbers — the shape is what you judge.')}
      </p>

      <div className="cmp-step">
        <h3>1 · {t('Design')}</h3>
        {!result ? (
          <p className="sub">{t('No project open yet.')}</p>
        ) : (
          <p className="sub sim-source">
            {t('Charts show:')} <strong>{simSource}</strong>
            {activeDesign && networkActive
              ? ` — ${t('{n} parts', { n: activeDesign.parts.filter((pp) => pp.type === 'Inductor' || pp.type === 'Capacitor' || pp.type === 'Resistor').length })}`
              : ''}
          </p>
        )}
        {result && designs.length > 0 && !networkActive && (
          <p className="sub alert">
            {t('The network is not in the simulation — switch it on, or the charts compare against the virtual filters.')}{' '}
            <button type="button" className="link-btn" onClick={() => setNetworkActive(true)}>
              {t('Use in simulation')}
            </button>
          </p>
        )}
        <div className="row">
          <label className="file-button">
            {t('Load project')}
            <input type="file" accept=".json,.adsproj" onChange={loadProjectFromFile} style={{ display: 'none' }} />
          </label>
          {designs.length > 1 && (
            <select value={activeDesignId ?? ''} onChange={(e) => selectDesign(e.target.value)} title={t('Which saved design the charts simulate')}>
              {designs.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <p className="error">⚠ {error}</p>}
      <div className="cmp-step">
        <h3>2 · {t('Measurements of the built speaker')}</h3>
        <label
          className={`dropzone${cmpDropArmed ? ' drop-armed' : ''}`}
          onDragEnter={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setCmpDropArmed(true); } }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setCmpDropArmed(false); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCmpDropArmed(false);
            for (const f of [...e.dataTransfer.files]) void loadVerificationFile(f);
          }}
        >
          <span className="dz-icon" aria-hidden="true">⬇</span>
          <span className="dz-text">
            <strong>{t('Drop FRD files here')}</strong>
            <span>{t('the measured response of the BUILT speaker, with phase, same rig as the driver files — or click to browse; several at once is fine')}</span>
          </span>
          <input
            type="file"
            accept=".frd,.txt"
            multiple
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              for (const f of files) void loadVerificationFile(f);
            }}
          />
        </label>
        {verifyList.length > 0 && (
          <div className="design-tabs cmp-tabs">
            {verifyList.map((v, i) => (
              <span key={v.name} className={`design-tab${i === Math.min(verifyIx, verifyList.length - 1) ? ' active' : ''}`}>
                <button type="button" className="design-tab-name" onClick={() => setVerifyIx(i)} title={t('Show this measurement in the charts')}>
                  {v.name}
                </button>
                <button type="button" className="design-tab-close" onClick={() => removeVerify(i)} title={t('Remove this measurement')} aria-label={t('Remove {name}', { name: v.name })}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="cmp-step">
        <h3>3 · {t('Verdict')}</h3>
        {!verifyCompare ? (
          <p className="sub">
            {t('No comparison yet —')} {verify ? t('the simulation has no result (open a project first).') : t('load a measurement above.')}
          </p>
        ) : (
          <>
            <div className="stats">
              <Stat k={t('Level offset')} v={`${verifyCompare.offsetDb >= 0 ? '+' : ''}${verifyCompare.offsetDb.toFixed(1)} dB`} sub={t('added to the measurement — absolute calibration differs, the shape does not')} />
              <Stat k={t('Magnitude')} v={`±${verifyCompare.avgAbsDb.toFixed(2)} dB`} sub={`P95 ±${verifyCompare.p95AbsDb.toFixed(2)} · ${t('worst')} ${verifyCompare.maxAt.deltaDb.toFixed(1)} dB ${t('at')} ${hz(verifyCompare.maxAt.freqHz)}`} />
              {verifyCompare.phase ? (
                <Stat k={t('Phase residual')} v={`${verifyCompare.phase.avgAbsDeg.toFixed(1)}°`} sub={`P95 ${verifyCompare.phase.p95AbsDeg.toFixed(0)}° · ${t('fitted mic delay')} ${verifyCompare.phase.fittedDelayUs.toFixed(0)} µs`} />
              ) : (
                <Stat k={t('Phase residual')} v="—" sub={t('measurement carries no phase column')} />
              )}
              <Stat k={t('Band')} v={`${Math.round(verifyCompare.band[0])}–${Math.round(verifyCompare.band[1])} Hz`} sub={t('the visible SPL range — zoom the chart to change it')} />
            </div>
            {verifyCompare.phase?.looksInverted && (
              <p className="sub alert">⚠ {t('offset ≈ 180° — the build is likely wired INVERTED vs the sim')}</p>
            )}
            {verifyAll && verifyList.length > 1 && (
              <table className="scan-table scan-table-pick" title={t('Every measurement against the same simulation and band; click a row to show it')}>
                <thead>
                  <tr>
                    <th>{t('measurement')}</th>
                    <th>{t('avg')}</th>
                    <th>P95</th>
                    <th>{t('worst')}</th>
                    <th>{t('phase')}</th>
                    <th>{t('level')}</th>
                  </tr>
                </thead>
                <tbody>
                  {verifyList.map((v, i) => {
                    const c = verifyAll[i];
                    const active = i === Math.min(verifyIx, verifyList.length - 1);
                    return (
                      <tr key={v.name} className={active ? 'active' : ''} onClick={() => setVerifyIx(i)}>
                        <td>{v.name}{active ? ' ◂' : ''}</td>
                        <td>{c ? `±${c.avgAbsDb.toFixed(2)} dB` : '—'}</td>
                        <td>{c ? `±${c.p95AbsDb.toFixed(2)}` : '—'}</td>
                        <td>{c ? `${c.maxAt.deltaDb.toFixed(1)} @ ${hz(c.maxAt.freqHz)}` : '—'}</td>
                        <td>{c?.phase ? `${c.phase.avgAbsDeg.toFixed(1)}°` : '—'}</td>
                        <td>{c ? `${c.offsetDb >= 0 ? '+' : ''}${c.offsetDb.toFixed(1)} dB` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="sub">
              {t("The overlay lives in the SPL chart, the phase residual in the Phase chart — flat at 0° means the model's phase is right where it matters.")}
            </p>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={`app-shell layout-${layoutMode} mode-${uiMode}`}>
      {overlayVisible && (
        <div className="busy-overlay" role="status" aria-live="polite">
          {/* During the 250 ms close-linger (anyBusy false) the card renders
              its FROZEN last body — swapping to fallback text for a few
              frames read as a flicker (Sanders tweede melding). */}
          <div className="busy-card">{anyBusy ? busyCardBody : busyCardBodyRef.current}</div>
        </div>
      )}
      {helpOpen && (
        <HelpPanel initialId={helpSectionForTab(designTab)} onClose={() => setHelpOpen(false)} />
      )}
      <MeasuringGuide open={measureGuideOpen} onClose={() => setMeasureGuideOpen(false)} />
      {catalogMgrOpen && (
        <CatalogManager onClose={() => setCatalogMgrOpen(false)} onSave={saveCatalogParts} />
      )}
      {paletteOpen && (
        <Modal
          open
          onClose={() => {
            setPaletteOpen(false);
            setPalQuery('');
            setPalIx(0);
          }}
          label="Command palette"
          cardClass="palette-card"
        >
          <input
            autoFocus
            className="palette-input"
            placeholder={t('Type a command… (navigate, optimize, toggle charts, theme)')}
            value={palQuery}
            onChange={(e) => {
              setPalQuery(e.target.value);
              setPalIx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setPalIx((i) => Math.min(i + 1, palFiltered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setPalIx((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && palFiltered[palIx]) {
                runPaletteAction(palFiltered[palIx]);
              } else if (e.key === 'Escape') {
                setPaletteOpen(false);
                setPalQuery('');
                setPalIx(0);
              }
            }}
          />
          <ul className="palette-list">
            {palFiltered.length === 0 && (
              <li className="palette-none">{t('No matching command')}</li>
            )}
            {palFiltered.map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={i === palIx ? 'sel' : ''}
                  onMouseEnter={() => setPalIx(i)}
                  onClick={() => runPaletteAction(a)}
                >
                  <span>{a.label}</span>
                  {a.hint && <small>{a.hint}</small>}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {confirmAsk && (
        <Modal
          open
          onClose={() => setConfirmAsk(null)}
          label={confirmAsk.text}
          cardClass="shortcuts-card confirm-card"
        >
          <p>{confirmAsk.text}</p>
          <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" onClick={() => setConfirmAsk(null)}>
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="danger"
              autoFocus
              onClick={() => {
                const go = confirmAsk.onYes;
                setConfirmAsk(null);
                go();
              }}
            >
              {confirmAsk.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
      {shortcutsOpen && (
        <Modal open onClose={() => setShortcutsOpen(false)} label="Keyboard shortcuts" cardClass="shortcuts-card">
          <div className="busy-title">{t('Keyboard shortcuts')}</div>
          <div className="shortcut-cols">
            <dl>
              <dt>{t('Everywhere')}</dt>
              <dd><kbd>⌘K</kbd> {t('command palette — every action, searchable')}</dd>
              <dd><kbd>?</kbd> {t('this overview')}</dd>
              <dd><kbd>1</kbd>–<kbd>5</kbd> {t('jump between the steps / tabs')}</dd>
              <dd><kbd>⌘S</kbd> {t('save (overwrite the last-saved filter)')}</dd>
              <dd><kbd>Esc</kbd> {t('close any popup')}</dd>
            </dl>
            <dl>
              <dt>{t('Charts')}</dt>
              <dd><kbd>scroll</kbd> {t('zoom')} · <kbd>⇧scroll</kbd> {t('vertical zoom')}</dd>
              <dd><kbd>drag</kbd> {t('pan')} · <kbd>double-click</kbd> {t('reset')}</dd>
              <dd><kbd>{t('click legend chip')}</kbd> {t('show / hide that curve')}</dd>
              <dd><kbd>{t('drag dot')}</kbd> {t('move a filter knee or EQ band')} · <kbd>{t('scroll on dot')}</kbd> {t('its Q')}</dd>
            </dl>
            <dl>
              <dt>{t('Network editor')}</dt>
              <dd><kbd>Esc</kbd> {t('cancel tool')} · <kbd>Del</kbd> {t('remove part')} · <kbd>R</kbd> {t('rotate')}</dd>
              <dd><kbd>⌘Z</kbd> {t('undo')} · <kbd>⇧⌘Z</kbd> / <kbd>⌘Y</kbd> {t('redo')}</dd>
              <dd><kbd>↑</kbd>/<kbd>↓</kbd> {t('in a value field: step through E12 values')}</dd>
            </dl>
          </div>
        </Modal>
      )}
      {issuesOpen && (
        <Modal open onClose={() => setIssuesOpen(false)} label="Current issues" cardClass="shortcuts-card">
          <div className="busy-title">⚠ {t('Current issues')}</div>
          {issues.length === 0 ? (
            <p className="sub">{t('Nothing wrong right now.')}</p>
          ) : (
            <ul className="issues-list">
              {issues.map((it, i) => (
                <li key={i}>
                  <p>{it.text}</p>
                  <p className="sub">→ {it.where}</p>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
      {dropPick && (
        /* Page-wide drop of measurement files: the one question the app
           cannot answer itself. Never guess the driver — a response that
           silently lands in the wrong slot is the classic silent failure. */
        <Modal
          open
          onClose={() => setDropPick(null)}
          label="Which driver are these measurements for?"
          cardClass="targets-card welcome-card"
        >
          <div className="busy-title">{t('Which driver are these for?')}</div>
          <p className="sub" style={{ width: '100%', margin: 0 }}>
            {dropPick.length === 1 ? t('1 file') : t('{n} files', { n: dropPick.length })}:{' '}
            {dropPick.map((f) => f.name).join(', ').slice(0, 140)}
            {dropPick.map((f) => f.name).join(', ').length > 140 ? '…' : ''}
            <br />
            {t('(Tip: drop directly on a driver card to skip this question.)')}
          </p>
          <div className="welcome-choices">
            {(
              [
                ['tweeter', 'Tweeter'],
                ['mid', 'Midrange (3-way)'],
                ['woofer', hasMidBranch ? 'Woofer' : 'Woofer / mid'],
              ] as const
            ).map(([side, label]) => (
              <button
                key={side}
                type="button"
                onClick={() => {
                  const files = dropPick;
                  setDropPick(null);
                  void loadDriverFileList(side, files);
                }}
              >
                {t(label)}
              </button>
            ))}
            {dropPick.length === 1 && /\.(frd|txt)$/i.test(dropPick[0].name) && (
              <button
                type="button"
                onClick={() => {
                  const f = dropPick[0];
                  setDropPick(null);
                  void loadVerificationFile(f);
                }}
              >
                {t('Verification measurement')}
                <small>{t('the measured response of the BUILT system, for the model-vs-measurement overlay')}</small>
              </button>
            )}
          </div>
        </Modal>
      )}
      {/* First-run welcome: the app already HAS four onboarding surfaces
          (demo, wizard, help, measuring guide) — this card is the missing
          conductor. It only ever shows when there is no autosave and it has
          never been dismissed, so returning users never see it. */}
      {welcomeOpen && (
        <Modal
          open
          onClose={() => dismissWelcome()}
          label="Welcome"
          cardClass="targets-card welcome-card"
        >
          <div className="busy-title">{t('Design a crossover from measurements')}</div>
          <p className="sub" style={{ width: '100%', margin: 0 }}>
            {t('Load a frequency response and impedance per driver, and the app works out the crossover: filter shapes, component values, and a parts list you can order. No filter knowledge needed to start.')}
          </p>
          <div className="welcome-choices">
            <button
              type="button"
              className="welcome-primary"
              onClick={() => dismissWelcome('demo')}
            >
              🎧 {t('Explore with the demo speaker')}
              <small>
                {t('A complete real measurement set (responses, impedances, angles, cabinet) — see the whole flow work before you own a microphone.')}
              </small>
            </button>
            <button type="button" onClick={() => dismissWelcome('wizard')}>
              📁 {t('I have measurements')}
              <small>{t('The wizard walks you through loading them and checks nothing is missing.')}</small>
            </button>
          </div>
          <button type="button" className="welcome-skip" onClick={() => dismissWelcome()}>
            {t('Just let me look around')}
          </button>
        </Modal>
      )}
      {wizardOpen && (
        <Modal
          open
          onClose={() => setWizardOpen(false)}
          label="Design wizard"
          cardClass="targets-card wizard-card"
        >
          <div className="busy-title">🧙 {t('Design wizard')}</div>
          <div className="wizard-steps">
            {wizardSteps.map((s, i) => (
              <span key={s.id} className={wizardPos >= 0 && i <= wizardPos ? 'done' : ''} />
            ))}
          </div>
          <p className="sub" style={{ width: '100%', margin: 0 }}>
            {wizardPos < 0
              ? t('First — load your measurements')
              : `${t('Step {x} of {y}', { x: wizardPos + 1, y: wizardSteps.length })} · ${t(wizardSteps[wizardPos].label)}`}
          </p>

          <div className="wizard-body">
          {wizardStep === 0 && (
            <>
              <p>
                <strong>{t('System type')}</strong>{' '}
                {t('— what are we designing? The wizard then shows only the measurement slots that apply, and Next unlocks once the set is complete.')}
              </p>
              <div className="row" style={{ marginBottom: '0.5rem' }}>
                {([
                  [1, '1-way (single driver)'],
                  [2, '2-way'],
                  [3, '3-way'],
                ] as const).map(([w, label]) => (
                  <button
                    key={w}
                    type="button"
                    className={wizardWays === w ? 'active-toggle' : ''}
                    aria-pressed={wizardWays === w}
                    onClick={() => setWizardWays(w)}
                    title={
                      w === 1
                        ? t('Flatten one driver (series traps, shelf groups, Zobel) — the validation flow')
                        : w === 2
                          ? t('Classic two-driver crossover design — the full optimizer chain')
                          : t('Three branches: sim, filters and network editor work; the 3-way optimizer is a later step')
                    }
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
              <p className="sub" style={{ marginBottom: '0.4rem' }}>
                <strong>{t('Measurements')}</strong>{' '}
                {t('— load a 0° FRD per driver; include the .ZMA impedance and any angle files in the SAME pick to unlock more (recognised by extension and filename).')}
              </p>
              {wizardWays === 3 && (
                <button
                  type="button"
                  className="primary"
                  onClick={loadDemo}
                  title={t('Load the 3-way KOAN 2951 session of Aug 2026: woofer pair (measured together), mid and tweeter at 0–60°, near-field cones + port, LIMP impedances, and the cabinet/rig as entered — the full three-branch flow, no VituixCAD project needed')}
                >
                  🎧 {t('Load KOAN demo data')}
                </button>
              )}
              {wizardWays === 2 && (
                <button
                  type="button"
                  className="primary"
                  onClick={loadDemo2Way}
                  title={t('Load the bundled 2023 KOAN prototype measurements (mid + tweeter, all angles + impedances + vxp variants) — instant playground')}
                >
                  🎧 {t('Load 2-way demo (KOAN prototype 2023)')}
                </button>
              )}
              <p className="sub" style={{ marginBottom: '0.2rem' }}>
                {wizardWays !== 1 ? t('…or load your own:') : t('Load your measurements:')}
              </p>
              {/* Same dropzone idiom as the Import step's driver cards — the
                  wizard is the beginner's surface, so it must not be the one
                  place where dragging a file does nothing (Sanders screenshot).
                  Same handlers, same colour identity, same status line. */}
              {/* Always the same three slots, TOP-DOWN like the Import cards
                  and the cabinet drawing (tweeter, midrange, woofer). Showing
                  only the declared set was the trap: in 2-way the second slot
                  was the tweeter, and midrange files dropped "in the middle"
                  landed on it (Sanders: mid and tweeter ended up identical).
                  The system choice now only decides which slots are REQUIRED;
                  a slot the choice does not need says so instead of hiding. */}
              <div className="wiz-slots">
                {(
                  wizardWays === 1
                    ? ([['woofer', 'Driver', woofer ?? tweeter, 'var(--viz-woofer)', true]] as const)
                    : ([
                        ['tweeter', 'Tweeter', tweeter, 'var(--viz-tweeter)', true],
                        ['mid', 'Midrange', midDrv, 'var(--viz-mid)', wizardWays === 3],
                        ['woofer', wizardWays === 3 ? 'Woofer' : 'Woofer / mid', woofer, 'var(--viz-woofer)', true],
                      ] as const)
                ).map(([slot, label, drv, color, required]) => {
                  const hasZ =
                    slot === 'woofer'
                      ? !!withSlotAliasesN(impedances)[canonicalModelForRole('low', threeWay)]
                      : slot === 'mid'
                        ? !!impedances['mid']
                        : !!impedances['tweeter'];
                  return (
                    <label
                      key={slot}
                      className={`dropzone wiz-slot${dropSide === slot ? ' drop-armed' : ''}${required || drv ? '' : ' wiz-slot-optional'}`}
                      style={{ '--drv-color': color } as CSSProperties}
                      {...dropHandlers(slot)}
                    >
                      <span className="dz-icon" aria-hidden="true">{drv ? '✓' : '⬇'}</span>
                      <span className="dz-text">
                        <strong>
                          {t(label)}
                          {drv ? ` — ${drv.name}` : required ? '' : ` (${t('3-way only')})`}
                        </strong>
                        <span>
                          {dropSide === slot
                            ? t('⬇ drop to load')
                            : drv
                              ? `${t('✓ response')}${hasZ ? ' · Z' : ` · ${t('no impedance yet')}`}`
                              : required
                                ? t('Drop FRD + ZMA files here — or click to browse')
                                : t('Not needed for a 2-way — drop a midrange here and it becomes a 3-way')}
                        </span>
                      </span>
                      <input
                        type="file"
                        accept=".frd,.txt,.zma,.ZMA,.lim"
                        multiple
                        onChange={loadDriverFiles(slot)}
                      />
                    </label>
                  );
                })}
              </div>
              {wizardMissing.length > 0 && (
                <p className="sub" style={{ marginTop: '0.4rem' }}>
                  {t('Still needed for a {n}-way:', { n: wizardWays })}{' '}
                  <strong>{wizardMissing.map((m) => t(m)).join(', ')}</strong>.
                </p>
              )}
              {wizardOverloaded && (
                <p className="nl-warning" style={{ marginTop: '0.4rem' }}>
                  {t('⚠ More is loaded than a {n}-way — the app follows what is actually loaded, never the declared choice. Switch the system type above, or remove the extra driver in the Import tab (✕).', { n: wizardWays })}
                </p>
              )}
              {wizardWays === 3 && wizardMissing.length === 0 && (
                <p className="sub" style={{ marginTop: '0.4rem' }}>
                  {t('✓ 3-way set complete — continue to Goals. Optimize runs the staged 2D scan: LR4 targets + measured level trims per handover candidate, per-branch synthesis, assembled two-pair tune (amp-load verdict gates the ranking).')}
                </p>
              )}
              <p className="sub">
                <strong>{t('Impedances (.ZMA)')}</strong>{' '}
                {t('unlock the passive build & component tune;')}{' '}
                <strong>{t('angle files')}</strong>{' '}
                {t('unlock the amplitude target & in-room weight in the Goals step. The full importer (VituixCAD projects, save/load) lives in the Import tab.')}
              </p>
              {timing && (
                <div
                  style={{
                    marginTop: '0.6rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid rgba(128,128,128,0.25)',
                  }}
                >
                  <p style={{ margin: '0 0 0.2rem' }}>
                    <strong>{t('Timing check')}</strong>{' '}
                    <span className="sub">
                      {t("— do the two phase measurements share a time reference? (Wrong timing silently ruins the phase sum — it's the whole reason this tool exists.)")}
                    </span>
                  </p>
                  {timing.ref.verdict === 'plausible' ? (
                    <p className="sub" style={{ margin: 0 }}>
                      ✓ <strong>{t('Plausible')}</strong>{' '}
                      {t('— the measured phase carries the real inter-driver delay (Δ {us} µs ≈ {mm} mm). Offset stays 0; nothing to enter.', { us: timing.ref.deltaUs.toFixed(0), mm: timing.ref.deltaMm.toFixed(1) })}
                    </p>
                  ) : (
                    <>
                      <p className="nl-warning" style={{ margin: '0 0 0.3rem' }}>
                        ⚠ <strong>{timing.ref.verdict}</strong> — {timing.ref.message}
                      </p>
                      <p style={{ margin: 0 }}>
                        {t("Physical offset between the drivers' acoustic centres (tweeter deeper = positive)")}{' '}
                        <input
                          type="number"
                          step={1}
                          value={offsetMm}
                          onChange={(e) => setOffsetMm(e.target.value)}
                          style={{ width: '5rem' }}
                        />{' '}
                        mm{' '}
                        <span className="sub">
                          {t('= {us} µs delay', { us: delayUs.toFixed(0) })}
                        </span>
                      </p>
                      <p className="sub" style={{ margin: '0.2rem 0 0' }}>
                        {t("Enter it from the physical driver spacing (the measured Δ ≈ {mm} mm looks off, so don't trust it blindly). The full timing sanity check + the measured/minimum phase toggle live in the Setup tab.", { mm: timing.ref.deltaMm.toFixed(1) })}
                      </p>
                    </>
                  )}
                </div>
              )}
              <div
                style={{
                  marginTop: '0.6rem',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid rgba(128,128,128,0.25)',
                }}
              >
                <p style={{ margin: '0 0 0.2rem' }}>
                  <strong>{t('Component catalog')}</strong>{' '}
                  <span className="sub">
                    {t("— powers catalog snapping & the BOM. It lives OUTSIDE the project, so it persists across a Reset (that's why the optimizer can still use one).")}
                  </span>
                </p>
                <p className="sub" style={{ margin: '0 0 0.3rem' }}>
                  {hasImportedCatalog()
                    ? t('✓ An imported catalog is still loaded — {n} series', { n: allSeries().length }) +
                      (customCatalogParts().length
                        ? ` · ${t('{n} exact parts', { n: customCatalogParts().length })}`
                        : '') +
                      (allSeries().some((sr) => sr.basePrice !== undefined) ||
                      customCatalogParts().some((pp) => pp.priceEur !== undefined)
                        ? ` · ${t('prices')}`
                        : '') +
                      t('. Snap-to-catalog is available.')
                    : t('No imported catalog — only the built-in library ({n} series) for BOM matching & inspector suggestions. Import one to unlock catalog snapping + real prices.', { n: allSeries().length })}
                </p>
                <label className="file-button" style={{ display: 'inline-block' }}>
                  {hasImportedCatalog() ? t('Replace catalog') : t('Import catalog (optional)')}
                  <input
                    type="file"
                    accept=".json,.adscatalog"
                    onChange={importCatalogFromFile}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </>
          )}

          {wizardStep === 5 && (() => {
            const Ok = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
              <p style={{ margin: '0.15rem 0' }}>
                {ok ? '✅' : '⬜'} {children}
              </p>
            );
            const roles = (
              [
                { role: 'high', label: 'Tweeter', on: !!tweeter },
                { role: 'mid', label: 'Midrange', on: !!midDrv },
                { role: 'low', label: hasMidBranch ? 'Woofer' : 'Woofer / mid', on: !!woofer },
              ] as { role: BranchRole; label: string; on: boolean }[]
            ).filter((r) => r.on);
            const goTo = (tab: 'data' | 'drivers') => {
              setWizardOpen(false);
              setDesignTab(tab);
            };
            const num = (v: string) => Number(v) > 0;
            return (
              <>
                <p>
                  <strong>{t('Cabinet & drivers')}</strong>{' '}
                  {t('— what you already know about the speaker. None of this touches the measurements: it feeds the windows the optimizer searches in (beaming, lobing, excursion), the true angle each driver was measured at, and the split of the timing between rig and driver. Without it the app falls back to size formulas and a guessed 500 mm — it still designs, it just knows less.')}
                </p>
                <p className="sub" style={{ margin: '0.4rem 0 0.2rem' }}>
                  <strong>{t('The cabinet and how you measured')}</strong>
                </p>
                <Ok ok={num(cabinet.micDistanceMm)}>
                  {t('Mic distance')}{num(cabinet.micDistanceMm) ? ` — ${cabinet.micDistanceMm} mm` : ''} —{' '}
                  <span className="sub">{t('honest low limit, far-field verdict, rig share of the timing')}</span>
                </Ok>
                <Ok ok={num(cabinet.baffleWidthMm) && num(cabinet.baffleHeightMm)}>
                  {t('Front panel width and height')}{num(cabinet.baffleWidthMm) && num(cabinet.baffleHeightMm) ? ` — ${cabinet.baffleWidthMm} × ${cabinet.baffleHeightMm} mm` : ''} —{' '}
                  <span className="sub">{t('baffle step, edge distances, the drawing')}</span>
                </Ok>
                <Ok ok={num(cabinet.refHeightMm)}>
                  {t('Reference point above the floor')}{num(cabinet.refHeightMm) ? ` — ${cabinet.refHeightMm} mm` : ''} —{' '}
                  <span className="sub">{t('floor bounce: how low the measurement is worth anything')}</span>
                </Ok>
                <Ok ok={num(cabinet.refFromTopMm)}>
                  {t('Reference point below the top')}{num(cabinet.refFromTopMm) ? ` — ${cabinet.refFromTopMm} mm` : ''} —{' '}
                  <span className="sub">{t('so driver positions can be entered as measured from the top')}</span>
                </Ok>
                <p style={{ margin: '0.3rem 0 0.6rem' }}>
                  <button type="button" onClick={() => goTo('data')}>
                    {t('Open Your cabinet →')}
                  </button>
                </p>
                <p className="sub" style={{ margin: '0.4rem 0 0.2rem' }}>
                  <strong>{t('Per driver')}</strong>
                </p>
                {roles.map(({ role, label }) => {
                  const d = cabinet.drivers[role];
                  const posOk = cabinet.refDriver === role || d.xMm.trim() !== '' || d.yMm.trim() !== '';
                  const dataOk = num(sdCm2[role]) && num(xmaxMm[role]);
                  return (
                    <Ok key={role} ok={posOk}>
                      <strong>{t(label)}</strong>: {t('position')} {posOk ? '✓' : '—'}
                      {' · '}Sd/Xmax {dataOk ? '✓' : `— (${t('optional; unlocks the level-aware excursion floor')})`}
                    </Ok>
                  );
                })}
                <p style={{ margin: '0.3rem 0 0' }}>
                  <button type="button" onClick={() => goTo('drivers')}>
                    {t('Open Your drivers →')}
                  </button>
                </p>
                <p className="sub" style={{ marginTop: '0.6rem' }}>
                  {t('Filling these in closes the wizard; come back with "Walk me through it" on the Design step — it reopens here until the list is green, then at Goals.')}
                </p>
              </>
            );
          })()}

          {wizardStep === 1 && (
            <>
              <p>
                <strong>{t('Goals')}</strong>{' '}
                {t('— start with what "done" means. How simple should the filter be, and how do you weigh a flat response against tight phase? (Shared with ⚙ Settings — this is just the guided path.)')}
              </p>
              <label style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={stagedOn}
                  onChange={(e) => setStagedOn(e.target.checked)}
                />{' '}
                {t('Staged design — stop escalating once the targets are met (fewest components)')}
              </label>
              {stagedOn && (
                <p>
                  {t('Targets: ripple ≤')}{' '}
                  <input
                    type="number"
                    min={0.1}
                    max={6}
                    step={0.1}
                    value={targetRipple}
                    onChange={(e) => setTargetRipple(e.target.value)}
                    style={{ width: '4.5rem' }}
                  />{' '}
                  {t('±dB peak (as in the SPL strip)')}
                  {!soloDriver && (
                    <>
                      {' '}· {t('phase ≤')}{' '}
                      <input
                        type="number"
                        min={1}
                        max={90}
                        step={1}
                        value={targetPhase}
                        onChange={(e) => setTargetPhase(e.target.value)}
                        style={{ width: '4.5rem' }}
                      />{' '}
                      °
                    </>
                  )}
                </p>
              )}
              {stagedOn && (
                <p className="sub" style={{ marginTop: '-0.3rem' }}>
                  {/* The trade in one place, in the direction that actually
                      surprises people: tighter does NOT cap complexity, it
                      raises it (Sanders). */}
                  {t('These are a')} <strong>{t('stopping point')}</strong>
                  {t(', not a limit. Tighter numbers make a')}{' '}
                  <strong>{t('more complex and more expensive')}</strong>{' '}
                  {t('filter — the app keeps adding EQ bands and parts while the target is unmet, and it only strips the parts it does not need once the target IS met. Looser numbers stop sooner and build simpler, but may leave performance on the table that a band or two would have been free to take. For reference, on top-tier drivers this engine delivers about 0.9 dB / 4°; on ordinary drivers or a rough cabinet, 2–3 dB is a realistic place to stop.')}
                </p>
              )}
              {soloDriver ? (
                <p className="sub">
                  {t("Single-driver mode: relative phase does not exist, so the priority trade-off doesn't apply — the solo engine optimises response flatness with cut-only EQ/shelves.")}
                </p>
              ) : (
              <p style={{ marginBottom: '0.1rem' }}>{t('What should the optimizer favour?')}</p>
              )}
              {!soloDriver &&
                (
                  [
                    ['flat', 25, 'Flattest on-axis response', 'the tightest ±dB straight ahead'],
                    ['bal', 50, 'Balanced', 'equal weight — a good default'],
                    [
                      'phase',
                      75,
                      'Tightest phase & off-axis',
                      'best driver phase-tracking / vertical spread (often near-free)',
                    ],
                  ] as const
                ).map(([key, val, label, hint]) => (
                  /* Checked only on an EXACT match. The old version bucketed
                     (<40 / 40-60 / >60), so a slider left at 45/55 in expert
                     showed "Balanced — equal weight" while 45/55 is what
                     actually ran: the screen said one thing and the optimizer
                     did another. A value between the presets now selects
                     nothing, and the line below states it. */
                  <label key={key} style={{ display: 'block' }}>
                    <input
                      type="radio"
                      name="wiz-priority"
                      checked={phasePriority === val}
                      onChange={() => setPhasePriority(val)}
                    />{' '}
                    {t(label)}{' '}
                    <span className="sub">
                      — {t(hint)} ({100 - val}/{val})
                    </span>
                  </label>
                ))}
              {!soloDriver && ![25, 50, 75].includes(phasePriority) && (
                <p className="sub">
                  {t('Currently')}{' '}
                  <strong>
                    {t('response {r}% · phase {p}%', { r: 100 - phasePriority, p: phasePriority })}
                  </strong>{' '}
                  {t('— set on the slider in ⚙ Settings, so none of the three above is selected. Pick one to replace it.')}
                </p>
              )}
              {!soloDriver && (
              <p className="sub">
                {t("On real measurements a smooth response already buys most of the phase, so these differ less than you'd expect — fine control (any %) lives in ⚙ Settings.")}
              </p>
              )}
              {angleSets ? (
                <>
                  {/* --- Amplitude target: its own section, with a live illustration --- */}
                  <div
                    style={{
                      marginTop: '0.7rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid rgba(128,128,128,0.25)',
                    }}
                  >
                    <p style={{ margin: '0 0 0.3rem' }}>
                      <strong>{t('Amplitude target')}</strong>{' '}
                      <span className="sub">{t('— which curve the optimizer flattens')}</span>
                    </p>
                    <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                        {(() => {
                          const win = ampTarget === 'listeningWindow';
                          const rays = [
                            { deg: 0, x: 136, y: 96 },
                            { deg: 15, x: 132.3, y: 67.5 },
                            { deg: 30, x: 121.3, y: 41 },
                            { deg: 45, x: 103.8, y: 18.2 },
                            { deg: 60, x: 81, y: 0.7 },
                          ];
                          return (
                            <svg viewBox="0 0 150 116" width="150" height="116" aria-hidden="true">
                              {win && (
                                <polygon
                                  points="26,96 136,96 132.3,67.5 121.3,41"
                                  fill="var(--accent)"
                                  opacity="0.18"
                                />
                              )}
                              {rays.map((r) => {
                                const hot = win ? r.deg <= 30 : r.deg === 0;
                                return (
                                  <line
                                    key={r.deg}
                                    x1={26}
                                    y1={96}
                                    x2={r.x}
                                    y2={r.y}
                                    stroke={hot ? 'var(--accent)' : 'currentColor'}
                                    strokeOpacity={hot ? 1 : 0.25}
                                    strokeWidth={hot ? 2 : 1}
                                  />
                                );
                              })}
                              <rect x="11" y="82" width="18" height="28" rx="3" fill="currentColor" opacity="0.3" />
                              <circle cx="21" cy="96" r="6.5" fill="currentColor" opacity="0.55" />
                              <text x="138" y="99" fontSize="8" fill="currentColor" opacity="0.55">0°</text>
                              <text x="123" y="38" fontSize="8" fill="currentColor" opacity="0.55">30°</text>
                              <text x="70" y="8" fontSize="8" fill="currentColor" opacity="0.55">60°</text>
                            </svg>
                          );
                        })()}
                        <p className="sub" style={{ margin: '0.1rem 0 0' }}>
                          {ampTarget === 'listeningWindow'
                            ? t('flattening the 0–30° average')
                            : t('flattening the 0° axis')}
                        </p>
                      </div>
                      <div style={{ flex: '1 1 12rem' }}>
                        <label style={{ display: 'block' }}>
                          <input
                            type="radio"
                            name="wiz-amptarget"
                            checked={ampTarget === 'onAxis'}
                            onChange={() => setAmpTarget('onAxis')}
                          />{' '}
                          {t('On-axis (0°)')}{' '}
                          <span className="sub">
                            {t('— flattest response dead ahead; off-axis falls where it falls. Best for near-field or a fixed seat.')}
                          </span>
                        </label>
                        <label style={{ display: 'block', marginTop: '0.3rem' }}>
                          <input
                            type="radio"
                            name="wiz-amptarget"
                            checked={ampTarget === 'listeningWindow'}
                            onChange={() => setAmpTarget('listeningWindow')}
                          />{' '}
                          {t('Listening window (0–30°)')}{' '}
                          <span className="sub">
                            {t('— averages the front arc, so a hair of on-axis flatness buys a smoother tone across a normal seating spread.')}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                  {/* --- Weight for in-room sound: its own section --- */}
                  <div
                    style={{
                      marginTop: '0.6rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid rgba(128,128,128,0.25)',
                    }}
                  >
                    <p style={{ margin: '0 0 0.2rem' }}>
                      <strong>{t('Weight for in-room sound: {pct}%', { pct: dirWeight })}</strong>{' '}
                      <span className="sub">{t('(energy average)')}</span>
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={dirWeight}
                      onChange={(e) => setDirWeight(Number(e.target.value))}
                      style={{ width: '11rem', accentColor: 'var(--accent)', verticalAlign: 'middle' }}
                    />
                    <p className="sub" style={{ margin: '0.2rem 0 0' }}>
                      {t("How much it ALSO smooths the energy average (the power response: every angle summed ≈ the room's tonal balance). Higher = more even directivity / smoother in-room sound, trading a little on-axis flatness. 0% = on-axis only.")}
                    </p>
                  </div>
                </>
              ) : (
                <p className="sub" style={{ marginTop: '0.7rem' }}>
                  <strong>{t('Amplitude target & in-room weight')}</strong>{' '}
                  {t('unlock once you load angle measurements (Import → per-driver angle FRDs). With only a 0° measurement there is nothing off-axis to optimise, so these stay inert.')}
                </p>
              )}
            </>
          )}

          {wizardStep === 2 && (
            <>
              <p>
                <strong>{t('Crossover')}</strong>{' '}
                {t('— where the drivers hand over, and how steep the ACOUSTIC slopes are. On real measurements Auto usually wins; force a slope only when you have a reason — a placeholder driver, or a house alignment.')}
              </p>
              {suggestedBand && (
                <div
                  style={{
                    marginBottom: '0.5rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '1px solid rgba(128,128,128,0.25)',
                  }}
                >
                  <p style={{ margin: '0 0 0.2rem' }}>
                    <strong>{t('Tuning range')}</strong>{' '}
                    <span className="sub">
                      {t('— the band the optimizer flattens & scores over (the design scope)')}
                    </span>
                  </p>
                  <p style={{ margin: 0 }}>
                    <input
                      type="number"
                      min={20}
                      max={5000}
                      step={10}
                      value={fMin}
                      onChange={(e) => setFMin(e.target.value)}
                      style={{ width: '5.5rem' }}
                    />{' '}
                    –{' '}
                    <input
                      type="number"
                      min={1000}
                      max={40000}
                      step={100}
                      value={fMax}
                      onChange={(e) => setFMax(e.target.value)}
                      style={{ width: '6rem' }}
                    />{' '}
                    Hz{' '}
                    {fMin !== String(suggestedBand[0]) || fMax !== String(suggestedBand[1]) ? (
                      <>
                        · {t('suggested')}{' '}
                        <strong>
                          {suggestedBand[0]}–{suggestedBand[1]} Hz
                        </strong>{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setFMin(String(suggestedBand[0]));
                            setFMax(String(suggestedBand[1]));
                          }}
                        >
                          {t('Use suggested')}
                        </button>
                      </>
                    ) : (
                      <span className="sub">{t('✓ = your usable measured range')}</span>
                    )}
                  </p>
                  <p className="sub" style={{ margin: '0.1rem 0 0' }}>
                    {t('Wider = the whole speaker is judged; narrower = focus the tuning on the crossover (a full-band safety check still guards the rest).')}
                  </p>
                  {systemLevelDb && (
                    <p style={{ margin: '0.3rem 0 0' }}>
                      <strong>{t('Target level ≈ {db} dB', { db: systemLevelDb.level })}</strong>{' '}
                      <span className="sub">
                        {t("— the passive system level, set by the {limiter} (the louder driver is padded down to match; passive can't boost above this).", { limiter: systemLevelDb.limiter })}
                      </span>
                    </p>
                  )}
                </div>
              )}
              <label style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={xoRangeOn}
                  onChange={(e) => setXoRangeOn(e.target.checked)}
                />{' '}
                {t('Pin the acoustic crossover point')}
              </label>
              {xoRangeOn && (
                <p>
                  <input
                    type="number"
                    min={300}
                    max={12000}
                    step={100}
                    value={xoFreqHz}
                    onChange={(e) => setXoFreqHz(e.target.value)}
                    style={{ width: '5.5rem' }}
                  />{' '}
                  Hz ±{' '}
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={50}
                    value={xoMarginHz}
                    onChange={(e) => setXoMarginHz(e.target.value)}
                    style={{ width: '5rem' }}
                  />{' '}
                  Hz
                </p>
              )}
              <p className="sub">
                {xoRangeOn
                  ? t('Pinned: the optimizer aims for this acoustic crossover (± margin) and picks the best design there.')
                  : tweeterHpFloor !== null && midXoCeiling !== null
                    ? t('Free: the optimizer aims for the CENTRE of your driver window — ≈{mid} Hz, the geometric mean of the 2×Fs tweeter floor ({floor} Hz) and the {ceil} Hz mid beaming ceiling. Pin only to override.', {
                        mid: Math.round(
                          Math.sqrt(tweeterHpFloor * Math.max(midXoCeiling, tweeterHpFloor * 1.2)),
                        ),
                        floor: tweeterHpFloor,
                        ceil: midXoCeiling,
                      })
                    : t('Free: the optimizer stays within a sensible band (≈2×Fs up to the mid beaming limit) and picks the best crossover there. Set the mid size below for a physically-exact window; pin only for a specific point.')}
              </p>
              {tweeterHpFloor !== null && (
                <p className="sub">
                  {t('The tweeter is kept above {floor} Hz automatically — twice its own resonance, read from your impedance measurement.', { floor: tweeterHpFloor })}
                </p>
              )}
              {(() => {
                // Sd (Drivers step) already fixes the effective piston, and it
                // beats the nominal-size approximation — so once it is entered,
                // asking for the size again would be the same fact typed twice.
                const dia = pistonDiameterMm(Number(sdCm2[threeWay ? 'mid' : 'low']));
                if (dia !== null && midXoCeiling !== null) {
                  return (
                    <p>
                      {t('Beaming ceiling ≈ {hz} Hz', { hz: midXoCeiling })}{' '}
                      <span className="sub">
                        {t('— from the Sd you entered (effective piston Ø {mm} mm); no need to pick a nominal size', { mm: Math.round(dia) })}
                      </span>
                    </p>
                  );
                }
                return (
                  <p>
                    {t('Mid size (sets the beaming ceiling)')}{' '}
                    <select value={midSizeInch} onChange={(e) => setMidSizeInch(e.target.value)}>
                      <option value="">{t('unknown')}</option>
                      {['3', '4', '5', '5.25', '6.5', '8'].map((v) => (
                        <option key={v} value={v}>
                          {v}"
                        </option>
                      ))}
                    </select>
                    {midXoCeiling !== null && (
                      <span className="sub"> · {t('beaming ceiling ≈ {hz} Hz', { hz: midXoCeiling })}</span>
                    )}
                  </p>
                );
              })()}
              <p className="sub" style={{ marginBottom: '0.15rem' }}>
                {t('The next two look alike but are NOT the same thing — one is how you build it, the other is what comes out:')}
              </p>
              <p style={{ margin: '0 0 0.1rem' }}>
                <strong>{t('HP/LP alignment')}</strong>{' '}
                <span className="sub">{t('— the ELECTRICAL filter you build (topology & part count; binding)')}</span>{' '}
                <select value={hpLpPref} onChange={(e) => setHpLpPref(e.target.value)}>
                  <option value="auto">{t('Auto (library)')}</option>
                  {['LR2', 'LR4', 'BW2', 'BW3', 'BW4', 'BS2', 'BS3', 'BS4'].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </p>
              <p style={{ margin: '0 0 0.1rem' }}>
                <strong>{t('Acoustic slopes')}</strong>{' '}
                <span className="sub">{t('— the MEASURED roll-off of driver + filter together (the result)')}</span>
                <br />
                {t('mid')}{' '}
                <select value={acSlopeMid} onChange={(e) => setAcSlopeMid(e.target.value)}>
                  <option value="auto">{t('Auto')}</option>
                  {['12', '18', '24', '30', '36'].map((v) => (
                    <option key={v} value={v}>
                      {v} dB/oct
                    </option>
                  ))}
                </select>{' '}
                · {t('tweeter')}{' '}
                <select value={acSlopeTweeter} onChange={(e) => setAcSlopeTweeter(e.target.value)}>
                  <option value="auto">{t('Auto')}</option>
                  {['12', '18', '24', '30', '36'].map((v) => (
                    <option key={v} value={v}>
                      {v} dB/oct
                    </option>
                  ))}
                </select>
              </p>
              <p className="sub">
                {t('Electrical order ≠ acoustic order: the driver already rolls off, so an electrical LR2 can MEASURE as an acoustic 4th order. Set the alignment when you care about the build (part count / a house alignment); set the acoustic slopes when you care about the summation result; leave either on Auto to let the measurement decide (often a touch better). Pinning both can over-constrain.')}
              </p>
            </>
          )}

          {wizardStep === 3 && (
            <>
              <p>
                <strong>{t('Components')}</strong>{' '}
                {t('— now turn the ideal design into parts you can buy: snap to your catalog, then choose quality tiers and brands.')}
              </p>
              <label
                style={{ display: 'block', opacity: hasImportedCatalog() ? 1 : 0.5 }}
                title={
                  hasImportedCatalog()
                    ? t('Snap the build + tuner to purchasable catalog values')
                    : t('Import a catalog first — without one there are no real parts to snap to, so the design keeps theoretically ideal (continuous) values')
                }
              >
                <input
                  type="checkbox"
                  checked={catalogSnap && hasImportedCatalog()}
                  disabled={!hasImportedCatalog()}
                  onChange={(e) => setCatalogSnap(e.target.checked)}
                />{' '}
                {t('Use real catalog parts (build + tuner end on purchasable values)')}
                {!hasImportedCatalog() && t(' — import a catalog first')}
              </label>
              <p className="sub">
                {t('Catalog: {n} series', { n: allSeries().length })}
                {customCatalogParts().length > 0 &&
                  ` · ${t('{n} exact parts', { n: customCatalogParts().length })}`}
                {allSeries().some((sr) => sr.basePrice !== undefined) ||
                customCatalogParts().some((pp) => pp.priceEur !== undefined)
                  ? ` · ${t('prices loaded')}`
                  : ` · ${t('no prices yet')}`}
              </p>
              {(
                [
                  ['auto', 'Auto — no tier preference'],
                  ['position', 'Position (doctrine): series-path premium · shunt/notch budget'],
                  ['budget', 'Budget — cheapest tiers everywhere'],
                  ['balanced', 'Balanced — standard tier everywhere'],
                  ['premium', 'Premium — best tiers everywhere'],
                ] as const
              ).map(([v, label]) => (
                <label key={v} style={{ display: 'block' }}>
                  <input
                    type="radio"
                    name="snap-profile"
                    checked={snapProfile === v}
                    onChange={() => setSnapProfile(v)}
                  />{' '}
                  {t(label)}
                </label>
              ))}
              {(
                [
                  ['L', 'Coils', snapSeriesL, setSnapSeriesL],
                  ['C', 'Capacitors', snapSeriesC, setSnapSeriesC],
                  ['R', 'Resistors', snapSeriesR, setSnapSeriesR],
                ] as const
              ).map(([kind, label, value, set]) => (
                <label key={kind} style={{ display: 'block' }}>
                  {t(label)}{' '}
                  <select value={value} onChange={(e) => set(e.target.value)}>
                    <option value="auto">{t('Auto (all series)')}</option>
                    {catalogSeries(kind).map((sr) => (
                      <option key={sr.id} value={sr.id}>
                        {sr.brand} {sr.series}
                        {sr.tier ? ` · ${sr.tier}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {(() => {
                const anySeries =
                  snapSeriesL !== 'auto' || snapSeriesC !== 'auto' || snapSeriesR !== 'auto';
                return (
                  <label
                    style={{ display: 'block', opacity: anySeries ? 1 : 0.5 }}
                    title={
                      anySeries
                        ? t('Bound series also HARD-limit the fit to their value range (series-path slots only), so the optimizer works within e.g. Alumen 1–10 µF and the rest of the network adapts. The result reports what the constraint cost vs an unconstrained fit.')
                        : t('Pick a specific series above first — this constrains the fit to that series’ values.')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={snapBoundToSeries && anySeries}
                      disabled={!anySeries}
                      onChange={(e) => setSnapBoundToSeries(e.target.checked)}
                    />{' '}
                    {t('Constrain the fit to the chosen series’ values (series-path only) — e.g. dead-set on Alumen ⇒ the tweeter cap stays 1–10 µF and the network adapts')}
                  </label>
                );
              })()}
              <label style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={snapStacks}
                  onChange={(e) => setSnapStacks(e.target.checked)}
                />{' '}
                {t('Allow 2-part stacks — a preferred tier/series stacks WITHIN itself before falling back; the result reports what stacking bought (fit % / €)')}
              </label>
              <p className="sub">
                {t('Series choices are binding per type; a series that cannot cover a value falls back rather than breaking the fit.')}
              </p>
            </>
          )}

          {wizardStep === 4 && (
            <>
              <p>
                <strong>{t('Review & run')}</strong>{' '}
                {t("— here's the plan. Optimize designs, builds and tunes the whole chain in one go.")}
              </p>
              {soloDriver ? (
                <p>
                  <strong>{t('Single-driver mode')}</strong>{' '}
                  {t('— flatten the {drv} with cut-only EQ/shelves (≤ {n} bands), built as series traps / shelf groups (+ Zobel when the impedance rises) and component-tuned against the measurement.', { drv: soloDriver === 'woofer' ? t('woofer/mid') : t('tweeter'), n: vfEqBands })}
                  <br />
                  {stagedOn
                    ? t('Staged: target ≤ {r} dB peak ripple', { r: targetRipple })
                    : t('Classic full-budget run')}
                  {soloFloorOn && soloFloorInfo
                    ? ` · ${t('flat at {db} dB (reaches {lo}–{hi})', { db: soloFloorInfo.floor, lo: hz(soloFloorInfo.reach[0]), hi: hz(soloFloorInfo.reach[1]) })}`
                    : ` · ${t('sensitivity budget {db} dB', { db: soloSensDb })}`}
                  <br />
                  {catalogSnap && hasImportedCatalog()
                    ? t('catalog parts · profile {p}', { p: snapProfile })
                    : t('Theoretically ideal (continuous) component values — no snap')}
                </p>
              ) : (
              <p>
                {stagedOn
                  ? t('Staged: targets ≤ {r} dB / {p}°', { r: targetRipple, p: targetPhase })
                  : t('Classic full-budget run')}{' '}
                · {t('priority {r}/{p}', { r: 100 - phasePriority, p: phasePriority })}
                <br />
                {xoRangeOn
                  ? t('Crossover pinned at {f} ± {m} Hz', { f: xoFreqHz, m: xoMarginHz })
                  : t('Crossover free')}
                {tweeterHpFloor !== null && ` · ${t('HP floor {f} Hz', { f: tweeterHpFloor })}`}
                <br />
                {t('Alignment {a} · slopes mid {m} / tweeter {tw}', {
                  a: hpLpPref === 'auto' ? t('Auto') : hpLpPref,
                  m: acSlopeMid === 'auto' ? t('Auto') : `${acSlopeMid} dB/oct`,
                  tw: acSlopeTweeter === 'auto' ? t('Auto') : `${acSlopeTweeter} dB/oct`,
                })}
                <br />
                {catalogSnap && hasImportedCatalog()
                  ? t('catalog parts · profile {p}', { p: snapProfile })
                  : t('Theoretically ideal (continuous) component values — no snap')}
              </p>
              )}
              <p className="sub">
                {t('Optimize runs the full chain: design →')}{' '}
                {soloDriver ? t('solo topology build') : t('passive build')} → {t('component tune')}
                {catalogSnap && hasImportedCatalog() ? ` → ${t('catalog snap')}` : ''}.
              </p>
            </>
          )}

          </div>

          <div className="wizard-foot">
            <div className="row">
              {wizardPos > 0 ? (
                <button
                  type="button"
                  // Walk the list, never ±1 on the id: which steps exist is a
                  // property of the design (solo has no crossover step).
                  onClick={() => setWizardStep(wizardSteps[wizardPos - 1].id)}
                >
                  ← {t('Back')}
                </button>
              ) : (
                <button type="button" onClick={() => setWizardOpen(false)}>
                  {t('Cancel')}
                </button>
              )}
            </div>
            <div className="row">
              {wizardPos < wizardSteps.length - 1 ? (
                <button
                  type="button"
                  className="primary"
                  onClick={() => setWizardStep(wizardSteps[wizardPos + 1]?.id ?? wizardSteps[0].id)}
                  disabled={wizardStep === 0 && wizardMissing.length > 0}
                  title={
                    wizardStep === 0 && wizardMissing.length > 0
                      ? `${t('Still needed for a {n}-way:', { n: wizardWays })} ${wizardMissing.map((m) => t(m)).join(', ')}`
                      : ''
                  }
                >
                  {t('Next')} →
                </button>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    setWizardOpen(false);
                    // Land on the design cockpit, not wherever the wizard was
                    // launched from (e.g. Import): the Filters tab shows the
                    // "Optimizer chose…" summary + curves; Network is one click
                    // away for the built schematic + BOM.
                    setDesignTab('filters');
                    void runVfOptimize().catch((e) => {
                      setVfBusy(false);
                      setVfError(e instanceof Error ? e.message : String(e));
                    });
                  }}
                  disabled={vfBusy || !result}
                >
                  🚀 {t('Optimize — design for me')}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
      {cmpOpen && (() => {
        // Guided model-vs-measurement validation. A CHECKLIST, not a flow
        // that does things for you: every step reads live app state, so a
        // step you completed elsewhere is simply already green.
        const steps = [
          { id: 1, label: t('Design') },
          { id: 2, label: t('Drivers') },
          { id: 3, label: t('Measurement') },
          { id: 4, label: t('Verdict') },
        ];
        const pos = steps.findIndex((st) => st.id === cmpStep);
        const zLow = !!impedances[canonicalModelForRole('low', threeWay)];
        const zMidBr = !!impedances['mid'] && threeWay;
        const zTw = !!impedances['tweeter'];
        const Ok = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
          <p style={{ margin: '0.15rem 0' }}>
            {ok ? '✅' : '⬜'} {children}
          </p>
        );
        return (
          <Modal
            open
            onClose={() => setCmpOpen(false)}
            label={t('Compare wizard — model vs measurement')}
            cardClass="targets-card wizard-card"
          >
            <div className="busy-title">🔬 {t('Compare — model vs measurement')}</div>
            <div className="wizard-steps">
              {steps.map((st, i) => (
                <span key={st.id} className={i <= pos ? 'done' : ''} />
              ))}
            </div>
            <p className="sub" style={{ width: '100%', margin: 0 }}>
              {t('Step {a} of {b}', { a: pos + 1, b: steps.length })} · {steps[pos].label}
            </p>
            <div className="wizard-body">
              {cmpStep === 1 && (
                <>
                  <p>
                    <strong>{t('Design')}</strong>{' '}
                    {t('— the comparison judges the simulated Combined of the ACTIVE network tab, so that tab must be the design you actually built.')}
                  </p>
                  <Ok ok={designs.length > 0}>
                    {t('A network design exists')}{activeDesign ? <> — {t('active:')} <strong>{activeDesign.name}</strong></> : null}.{' '}
                    {t('Import one (Network → Import filter / Import variant) or rebuild the physical build with New from template + the editor.')}
                  </Ok>
                  <Ok ok={networkActive}>
                    {t('"Use in simulation" is on — otherwise the sim shows the virtual filters, not your network.')}
                  </Ok>
                  <p className="sub">
                    {t('Rebuilding what is physically on the bench? Enter the MEASURED component values in the inspector — that difference (design vs solder) is often the first thing this comparison exposes.')}
                  </p>
                </>
              )}
              {cmpStep === 2 && (
                <>
                  <p>
                    <strong>{t('Drivers')}</strong>{' '}
                    {t('— the simulation is measured drivers × your network, so the driver files must be the same measurements the design was made with.')}
                  </p>
                  <Ok ok={!!woofer}>{threeWay ? t('Woofer') : t('Woofer/mid')} {t('response (FRD)')}{woofer ? ` — ${woofer.name}` : ''}</Ok>
                  <Ok ok={zLow}>{threeWay ? t('Woofer') : t('Woofer/mid')} {t('impedance (ZMA/LIMP)')}</Ok>
                  {threeWay && (
                    <>
                      <Ok ok={!!midDrv}>{t('Midrange')} {t('response (FRD)')}{midDrv ? ` — ${midDrv.name}` : ''}</Ok>
                      <Ok ok={zMidBr}>{t('Midrange')} {t('impedance (ZMA/LIMP)')}</Ok>
                    </>
                  )}
                  <Ok ok={!!tweeter}>{t('Tweeter')} {t('response (FRD)')}{tweeter ? ` — ${tweeter.name}` : ''}</Ok>
                  <Ok ok={zTw}>{t('Tweeter')} {t('impedance (ZMA/LIMP)')}</Ok>
                  <p className="sub">
                    {t('Single-driver validation (one driver through its network) is fine: load just that driver and the app runs in solo mode.')}
                  </p>
                </>
              )}
              {cmpStep === 3 && (
                <>
                  <p>
                    <strong>{t('Measurement')}</strong>{' '}
                    {t('— measure the BUILT system with the same rig as the driver measurements (same gate, same mic position discipline), export as FRD with phase, and load it here.')}
                  </p>
                  <Ok ok={!!verify}>
                    {t('Verification measurement')}{verify ? ` — ${verify.name}` : ''}
                  </Ok>
                  <p>
                    <label className="file-button">
                      {verify ? t('Replace measurement…') : t('Load measurement (FRD)…')}
                      <input type="file" accept=".frd,.txt" onChange={loadVerification} />
                    </label>
                    {verify && (
                      <button
                        type="button"
                        onClick={() => removeVerify(Math.min(verifyIx, verifyList.length - 1))}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        {t('Remove')}
                      </button>
                    )}
                  </p>
                  <p className="sub">
                    {t('Level and mic distance do NOT need to match the sim — the comparison aligns level (median) and fits the mic delay out of the phase, and shows both numbers instead of hiding them.')}
                  </p>
                </>
              )}
              {cmpStep === 4 && (
                <>
                  <p>
                    <strong>{t('Verdict')}</strong>{' '}
                    {t('— judged over the visible SPL range (zoom the chart to change the band being graded).')}
                  </p>
                  {!verifyCompare ? (
                    <p className="sub">
                      {t('No comparison yet —')} {verify ? t('the simulation has no result (check steps 1–2).') : t('load a verification measurement in step 3.')}
                    </p>
                  ) : (
                    <>
                      <p>
                        <strong>{t('Magnitude')}</strong>: {t('avg')} ±{verifyCompare.avgAbsDb.toFixed(2)} dB ·
                        P95 ±{verifyCompare.p95AbsDb.toFixed(2)} dB · {t('worst')}{' '}
                        {verifyCompare.maxAt.deltaDb.toFixed(1)} dB {t('at')} {hz(verifyCompare.maxAt.freqHz)}
                        {' '}({t('band')} {Math.round(verifyCompare.band[0])}–{Math.round(verifyCompare.band[1])} Hz,
                        {t('level-aligned')} {verifyCompare.offsetDb >= 0 ? '+' : ''}
                        {verifyCompare.offsetDb.toFixed(1)} dB)
                      </p>
                      {verifyCompare.phase ? (
                        <p>
                          <strong>{t('Phase')}</strong>: {t('residual avg')} {verifyCompare.phase.avgAbsDeg.toFixed(1)}° ·
                          P95 {verifyCompare.phase.p95AbsDeg.toFixed(0)}° · {t('fitted mic delay')}{' '}
                          {verifyCompare.phase.fittedDelayUs.toFixed(0)} µs
                          {verifyCompare.phase.looksInverted && (
                            <> · <strong>⚠ {t('offset ≈ 180° — the build is likely wired INVERTED vs the sim')}</strong></>
                          )}
                        </p>
                      ) : (
                        <p className="sub">{t('Measurement carries no phase column — magnitude verdict only.')}</p>
                      )}
                      <p className="sub">
                        {t("The overlay lives in the SPL chart, the phase residual in the Phase chart — flat at 0° means the model's phase is right where it matters.")}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="wizard-foot">
              <div className="row">
                {pos > 0 ? (
                  <button type="button" onClick={() => setCmpStep(steps[pos - 1].id)}>
                    ← {t('Back')}
                  </button>
                ) : (
                  <button type="button" onClick={() => setCmpOpen(false)}>
                    {t('Cancel')}
                  </button>
                )}
              </div>
              <div className="row">
                {pos < steps.length - 1 ? (
                  <button type="button" className="primary" onClick={() => setCmpStep(steps[pos + 1].id)}>
                    {t('Next')} →
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    // The button PROMISES charts, so it delivers them: the
                    // phase residual lives in the Phase panel (which may be
                    // toggled off), and in stacked layout the charts sit
                    // below the fold — enable and scroll instead of hoping.
                    onClick={() => {
                      if (verifyCompare?.phase) setShowPanels((p) => ({ ...p, phase: true }));
                      setCmpOpen(false);
                      // Instant, not smooth: in stacked layout this can be a
                      // multi-thousand-px jump, and smooth scrolling pauses
                      // entirely in a backgrounded tab (rAF throttling).
                      setTimeout(() => {
                        document
                          .querySelector('.analysis-pane .panel')
                          ?.scrollIntoView({ block: 'start' });
                      }, 60);
                    }}
                  >
                    {t('Done — show the charts')}
                  </button>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}
      {trapOpen && (
        <Modal
          open
          onClose={() => setTrapOpen(false)}
          label={t('Add LCR notch (trap)')}
          cardClass="targets-card"
        >
          <div className="busy-title">➕ {t('Add LCR notch (trap)')}</div>
          <p className="sub">
            {t('A series L–C–R across the driver — a low-impedance path at the centre frequency that sucks out a peak.')}{' '}
            <strong>{t('Depth')}</strong> {t('sets R,')} <strong>Q</strong>{' '}
            {t('sets the L/C ratio; the values follow from the measured impedance. It goes in live — fine-tune afterwards with ⚙ Optimize components.')}
          </p>
          <p>
            {t('Driver')}{' '}
            <select value={trapModel} onChange={(e) => setTrapModel(e.target.value)}>
              {zModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </p>
          <p>
            {t('Centre')}{' '}
            <input
              type="number"
              min={100}
              max={20000}
              step={50}
              value={trapFreq}
              onChange={(e) => setTrapFreq(e.target.value)}
              style={{ width: '6rem' }}
            />{' '}
            Hz · {t('depth')}{' '}
            <input
              type="number"
              max={0}
              step={0.5}
              value={trapDepth}
              onChange={(e) => setTrapDepth(e.target.value)}
              style={{ width: '4.5rem' }}
            />{' '}
            dB · Q{' '}
            <input
              type="number"
              min={0.2}
              step={0.1}
              value={trapQ}
              onChange={(e) => setTrapQ(e.target.value)}
              style={{ width: '4rem' }}
            />
          </p>
          {trapCompute ? (
            <p>
              →{' '}
              <strong>
                {trapCompute.Lmh} mH · {trapCompute.Cuf} µF · {trapCompute.R} Ω
              </strong>{' '}
              <span className="sub">
                (|Z| ≈ {trapCompute.zmag} Ω {t('at')} {trapFreq} Hz)
              </span>
            </p>
          ) : (
            <p className="sub">
              {t('Enter a centre frequency and a')} <strong>{t('negative')}</strong>{' '}
              {t('depth (a cut) — passive can only notch a peak, not boost.')}
            </p>
          )}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.6rem' }}>
            <button type="button" onClick={() => setTrapOpen(false)}>
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!trapCompute}
              onClick={addNotchTrap}
            >
              {t('Add trap')}
            </button>
          </div>
        </Modal>
      )}
      {showTargets && (
        <Modal
          open
          onClose={() => setShowTargets(false)}
          label={t('Design targets — virtual to acoustic')}
          cardClass="targets-card"
        >
          <div className="busy-title">🎯 {t('Design targets — virtual → acoustic')}</div>
          <p className="sub">
            {t('The virtual target design the last passive build was fitted to (acoustic mode fits measured driver × filter against these ideal shapes).')}
          </p>
          <p>
            <strong>{t('Woofer / mid target:')}</strong>{' '}
            {vFilters.woofer.lp.enabled
              ? `LP ${vFilters.woofer.lp.kind}${vFilters.woofer.lp.order} (${
                  vFilters.woofer.lp.order * 6
                } dB/oct electrical) @ ${Math.round(vFilters.woofer.lp.freq)} Hz`
              : t('no LP')}
            {vFilters.woofer.hp.enabled &&
              ` · HP ${vFilters.woofer.hp.kind}${vFilters.woofer.hp.order} @ ${Math.round(
                vFilters.woofer.hp.freq,
              )} Hz`}
            {vFilters.woofer.gainDb !== 0 && ` · ${t('gain')} ${vFilters.woofer.gainDb.toFixed(1)} dB`}
            {vFilters.woofer.eq.filter((b) => b.enabled).length > 0 && (
              <>
                <br />
                EQ:{' '}
                {vFilters.woofer.eq
                  .filter((b) => b.enabled)
                  .map(
                    (b) =>
                      `${b.type ?? 'peak'} ${Math.round(b.freq)} Hz ${b.gainDb.toFixed(1)} dB Q${b.q.toFixed(1)}`,
                  )
                  .join(' · ')}
              </>
            )}
          </p>
          <p>
            <strong>{t('Tweeter target:')}</strong>{' '}
            {vFilters.tweeter.hp.enabled
              ? `HP ${vFilters.tweeter.hp.kind}${vFilters.tweeter.hp.order} (${
                  vFilters.tweeter.hp.order * 6
                } dB/oct electrical) @ ${Math.round(vFilters.tweeter.hp.freq)} Hz`
              : t('no HP')}
            {vFilters.tweeter.lp.enabled &&
              ` · LP ${vFilters.tweeter.lp.kind}${vFilters.tweeter.lp.order} @ ${Math.round(
                vFilters.tweeter.lp.freq,
              )} Hz`}
            {vFilters.tweeter.gainDb !== 0 && ` · ${t('gain')} ${vFilters.tweeter.gainDb.toFixed(1)} dB`}
            {inverted && ` · ${t('polarity inverted')}`}
            {vFilters.tweeter.eq.filter((b) => b.enabled).length > 0 && (
              <>
                <br />
                EQ:{' '}
                {vFilters.tweeter.eq
                  .filter((b) => b.enabled)
                  .map(
                    (b) =>
                      `${b.type ?? 'peak'} ${Math.round(b.freq)} Hz ${b.gainDb.toFixed(1)} dB Q${b.q.toFixed(1)}`,
                  )
                  .join(' · ')}
              </>
            )}
          </p>
          {acousticSlopes && (
            <p>
              <strong>{t('Measured on the current sim:')}</strong> {t('acoustic crossover')} ≈{' '}
              {Math.round(acousticSlopes.xo)} Hz
              {acousticSlopes.wooferDbPerOct !== null && (
                <>
                  {' '}
                  · {t('mid falls ≈ {n} dB/oct above it (≈ {ord}-order acoustic)', { n: Math.abs(acousticSlopes.wooferDbPerOct).toFixed(0), ord: ordinal(Math.max(1, Math.round(Math.abs(acousticSlopes.wooferDbPerOct) / 6))) })}
                </>
              )}
              {acousticSlopes.tweeterDbPerOct !== null && (
                <>
                  {' '}
                  · {t('tweeter falls ≈ {n} dB/oct below it (≈ {ord}-order acoustic)', { n: Math.abs(acousticSlopes.tweeterDbPerOct).toFixed(0), ord: ordinal(Math.max(1, Math.round(Math.abs(acousticSlopes.tweeterDbPerOct) / 6))) })}
                </>
              )}
            </p>
          )}
          <p className="sub">
            {t("Electrical component count ≠ acoustic order: the driver's own rolloff and impedance stack on top of the network, and acoustic-mode synthesis exploits that. The measured slopes above are the real (acoustic) orders.")}
          </p>
          <button type="button" onClick={() => setShowTargets(false)}>
            {t('Close')}
          </button>
        </Modal>
      )}
      <header className="topbar" title={t('Combined SPL & relative phase — woofer normalised to 0°, tweeter shown against it.')}>
        <div className="tb-left">
          <h1 className="brand">
            <LogoMark size={40} className="brand-mark" />
            <span className="brand-text">
              <span className="brand-sub">SD Acoustics</span>
              <LogoWord />
            </span>
          </h1>
          {/* THE primary choice of the app — where am I? — so it sits first,
              reads as one segmented control and is visibly heavier than the
              utility buttons on the right. Preferences (layout, language,
              theme) moved behind ⚙: they are set once, and as eight permanent
              buttons they gave the mode switch the same weight as a theme
              toggle. */}
          <div className="mode-switch" role="tablist" aria-label={t('Mode')}>
            {(
              [
                ['guided', '🧭', 'Guided', 'A numbered route from measurements to a shopping list. The app decides the crossover, the filter shapes and the parts; you supply the facts about your speaker. Every check and warning stays visible.'],
                ['expert', '🛠', 'Expert', 'Everything: alignment preference, acoustic slopes, phase metric, crossover pins, component tiers, the network editor. Overrides on top of the same engine.'],
                ['compare', '🔬', 'Compare', 'Model versus measurement: open the project you designed with, load the response of the BUILT speaker, and see where the two differ — level and mic distance are aligned for you, the shape is what you judge.'],
              ] as const
            ).map(([m, icon, label, tip]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={uiMode === m}
                className={uiMode === m ? 'active' : ''}
                onClick={() => setUiMode(m)}
                title={t(tip)}
              >
                <span className="mode-icon" aria-hidden="true">{icon}</span>
                {t(label)}
              </button>
            ))}
          </div>
        </div>
        <div className="status-chips">
          {simStale && (
            <span className="status-chip chip-bad" title={simStale.refusal.describe}>
              <span className="chip-dot" />
              {t('Not simulated')} <strong>{simStale.showing === 'previous' ? t('previous state shown') : t('raw drivers shown')}</strong>
            </span>
          )}
          {/* 3-way: the PER-PAIR excess-phase verdict (see timing3) — the
              2-way woofer↔tweeter/raw-phase check is a false alarm here. The
              chip shows the worst pair; the tooltip carries both. */}
          {threeWay && timing3 && (timing3.low || timing3.high) ? (
            (() => {
              const pairs = [timing3.low, timing3.high].filter(
                (p): p is NonNullable<typeof p> => p !== null,
              );
              const rank = { plausible: 0, suspect: 1, unreliable: 2 } as const;
              const worst = pairs.reduce((a, b) => (rank[b.verdict] > rank[a.verdict] ? b : a));
              return (
                <span
                  className={`status-chip ${worst.verdict === 'plausible' ? 'chip-ok' : 'chip-warn'}`}
                  title={`Time base per adjacent pair, judged on EXCESS phase (measured − minimum-phase) over a band where both drivers play — the raw-phase check absorbs each driver's own rolloff and misreads a healthy set as broken.\n\n${pairs.map((p) => p.message).join('\n\n')}`}
                >
                  <span className="chip-dot" />
                  {t('Timing')} <strong>{worst.verdict}</strong>
                </span>
              );
            })()
          ) : timing ? (
            <span
              className={`status-chip ${timing.ref.verdict === 'plausible' ? 'chip-ok' : 'chip-warn'}`}
              title={timing.ref.message}
            >
              <span className="chip-dot" />
              {t('Timing')} <strong>{timing.ref.verdict}</strong>
            </span>
          ) : null}
          {combinedFlat && !simStale && (
            <span
              className={`status-chip ${
                !designShaped
                  ? 'chip-neutral'
                  : combinedFlat.score >= 85 ? 'chip-ok' : combinedFlat.score >= 70 ? 'chip-warn' : 'chip-bad'
              }`}
              title={`${!designShaped ? (emptyNetworkLoaded ? t('NO NETWORK LOADED — the design tab that is active holds no components, so this figure describes the unfiltered drivers and judges nothing. A score on nothing is not a verdict.') : t('RAW DRIVERS — no crossover is shaping the sum yet, so this is just where you start from, not a problem. It colours once a design exists.')) + '\n\n' : ''}${t("Whole-range flatness of the combined response, 0–100 — from the AVERAGE deviation over the visible range, so one narrow dip can't dominate the verdict (the peak ±dB in the SPL strip still shows it)")}`}
            >
              {t('Response')} <strong>{combinedFlat.score.toFixed(0)}</strong>
            </span>
          )}
          {integration?.overlapCentreHz != null && !simStale && (
            <span
              className="status-chip"
              title={t("Where the two drivers' levels meet in the current sim — the acoustic crossover point. Neutral by design: a location, not a verdict.")}
            >
              {t('Overlap')} <strong>{Math.round(integration.overlapCentreHz)} Hz</strong>
            </span>
          )}
          {pairScores &&
            !simStale &&
            pairScores.low.integ.overlapCentreHz != null &&
            pairScores.high.integ.overlapCentreHz != null && (
              <span
                className="status-chip"
                title={t('Where the driver levels meet, per adjacent pair: woofer-mid / mid-tweeter')}
              >
                {t('Overlap')}{' '}
                <strong>
                  {Math.round(pairScores.low.integ.overlapCentreHz)} /{' '}
                  {Math.round(pairScores.high.integ.overlapCentreHz)} Hz
                </strong>
              </span>
            )}
          {phaseStats && !simStale && (
            <span
              className={`status-chip ${
                !designShaped
                  ? 'chip-neutral'
                  : phaseStats.p95ErrorDeg <= 45 ? 'chip-ok' : phaseStats.p95ErrorDeg <= 90 ? 'chip-warn' : 'chip-bad'
              }`}
              title={`${!designShaped ? (emptyNetworkLoaded ? t('NO NETWORK LOADED — the design tab that is active holds no components, so this figure describes the unfiltered drivers and judges nothing.') : t('RAW DRIVERS — no crossover yet, so this is the starting point, not a fault. It colours once a design exists.')) + '\n\n' : ''}${t('95th-percentile phase error in the driver overlap — ≤45° sums fully, ≤90° still gains ≥3 dB, beyond that the drivers stop helping each other')}`}
            >
              {t('Phase P95')} <strong>{phaseStats.p95ErrorDeg.toFixed(0)}°</strong>
            </span>
          )}
          {pairScores && !simStale && (pairScores.low.stats || pairScores.high.stats) && (() => {
            const worst = Math.max(
              pairScores.low.stats?.p95ErrorDeg ?? 0,
              pairScores.high.stats?.p95ErrorDeg ?? 0,
            );
            return (
              <span
                className={`status-chip ${
                  !designShaped
                    ? 'chip-neutral'
                    : worst <= 45 ? 'chip-ok' : worst <= 90 ? 'chip-warn' : 'chip-bad'
                }`}
                title={`${!designShaped ? (emptyNetworkLoaded ? 'NO NETWORK LOADED — the design tab that is active holds no components, so this figure describes the unfiltered drivers and judges nothing.\n\n' : 'RAW DRIVERS — no crossover yet, so this is the starting point, not a fault. It colours once a design exists.\n\n') : ''}Worst pair's 95th-percentile phase error (woofer-mid vs mid-tweeter overlap windows)`}
              >
                Phase P95 <strong>{worst.toFixed(0)}°</strong>
              </span>
            );
          })()}
          {issues.length > 0 && (
            /* DRC pattern (KiCad): everything currently wrong, one list, with
               a "where to look" per item — instead of warnings scattered
               across four panels. */
            <button
              type="button"
              className="status-chip chip-warn chip-issues"
              onClick={() => setIssuesOpen(true)}
              title={t('Everything the app is currently warning about, in one list — click')}
            >
              ⚠{' '}
              <strong>
                {issues.length === 1 ? t('1 issue') : t('{n} issues', { n: issues.length })}
              </strong>
            </button>
          )}
        </div>
        <div className="tb-right">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title={t('Command palette — every action, searchable (⌘K / Ctrl+K); press ? for all shortcuts')}
          >
            ⌘K
          </button>
          <button
            type="button"
            onClick={() => setMeasureGuideOpen(true)}
            title={t('Measuring guide: where to aim the mic, how far back to stand, and what a turntable sweep really captures. The illustrations run on the same geometry the optimizer uses.')}
          >
            📐 {t('Measure')}
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title={t('Manual: searchable explanation of every tab, the optimizer, the scores and the VituixCAD exchange')}
          >
            ❓ {t('Help')}
          </button>
          <details className="prefs-menu" ref={prefsRef}>
            <summary title={t('Preferences: layout, language, theme')} aria-label={t('Preferences')}>⚙</summary>
            <div className="prefs-pop">
              <div className="prefs-row">
                <span>{t('Layout')}</span>
                <div className="theme-switch" role="group" aria-label={t('Layout')}>
                  {(
                    [
                      ['auto', 'Auto', 'Follow window width: split when it fits, stacked when narrow'],
                      ['split', 'Split', 'Always two panes: design left, charts right'],
                      ['stacked', 'Stacked', 'Always the classic single-column stack'],
                    ] as const
                  ).map(([m, label, tip]) => (
                    <button
                      key={m}
                      type="button"
                      className={layoutMode === m ? 'active' : ''}
                      onClick={() => setLayoutMode(m)}
                      title={t(tip)}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="prefs-row">
                <span>{t('Language')}</span>
                <div className="theme-switch" role="group" aria-label={t('Language')}>
                  {LANGS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={uiLang === l.id ? 'active' : ''}
                      onClick={() => setLang(l.id)}
                      title={t('Interface language — anything not translated yet falls back to English')}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="prefs-row">
                <span>{t('Theme')}</span>
                <div className="theme-switch" role="group" aria-label={t('Theme')}>
                  {(['system', 'light', 'dark'] as const).map((th) => (
                    <button
                      key={th}
                      type="button"
                      className={theme === th ? 'active' : ''}
                      onClick={() => setTheme(th)}
                      title={
                        th === 'system'
                          ? t('Theme: follow the OS')
                          : th === 'light'
                            ? t('Theme: light')
                            : t('Theme: dark')
                      }
                    >
                      {th === 'system' ? t('Auto') : th === 'light' ? t('Light') : t('Dark')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </div>
      </header>

      {uiMode === 'guided' && (
        /* GUIDED: a numbered route with a completion mark per step. It lives
           ABOVE the workspace as one fixed, centred bar — wayfinding must not
           move. When it sat inside the design pane it jumped between the
           centred form steps and the left-anchored chart steps (Sanders
           report): the one element that tells you where you are was the one
           element that kept moving. Later steps stay clickable on purpose:
           blocking them would hide what is coming, and a locked button
           teaches nothing about why. */
        <nav className="pane-steps step-bar" aria-label={t('Design steps')}>
          {(
            [
              ['import', 'Your project', guidedDone.files, 'Load your measurement files, and save or reopen a project.'],
              ['data', 'Your cabinet', guidedDone.cabinet, 'The box and how you measured it. Do this before the drivers: it fixes the reference point everything else is measured from.'],
              ['drivers', 'Your drivers', guidedDone.drivers, 'Where each driver sits in that box, what is behind it, and its cone area and travel from the datasheet.'],
              ['filters', 'Design it', guidedDone.design, 'One button. The app picks the crossover points, the filter shapes and the parts, and shows what it chose.'],
              ['network', 'Your build', guidedDone.build, 'The schematic and the shopping list.'],
            ] as const
          ).map(([id, label, done, tip], i) => (
            <button
              key={id}
              type="button"
              className={`${designTab === id ? 'active' : ''}${done ? ' step-done' : ''}`}
              onClick={() => setDesignTab(id)}
              title={t(tip)}
            >
              <span className="step-num" aria-hidden="true">
                {done ? '✓' : i + 1}
              </span>
              {t(label)}
            </button>
          ))}
        </nav>
      )}

      <div
        ref={workspaceRef}
        className={`workspace${designTab === 'network' && uiMode !== 'compare' ? ' wide-left' : ''}${
          uiMode === 'guided' &&
          (designTab === 'import' || designTab === 'data' || designTab === 'drivers')
            ? ' focus-form'
            : ''
        }`}
        style={
          paneFrac != null
            ? ({ '--pane-w': `${(paneFrac * 100).toFixed(3)}%` } as CSSProperties)
            : undefined
        }
      >
        <aside
          className={`design-pane${pageDropArmed && !dropSide ? ' drop-page-armed' : ''}`}
          data-drop-hint={t('⬇ Drop files — measurements go to a driver of your choice; a .vxp set, saved project, catalog or filter file loads straight away')}
          {...pageDropHandlers()}
        >
          {uiMode !== 'expert' ? null : (
<nav className="pane-tabs" aria-label={t('Design panels')}>
              {(
              [
                ['import', 'Project', 'Load measurements, catalogs and projects; save your work'],
                ['data', 'Setup', 'View range, cabinet and mic geometry, phase convention, tweeter adjustment, vxp variant and the timing sanity check'],
                ['drivers', 'Drivers', 'Per-driver facts: position in the cabinet, enclosure, Sd/Xmax and how many'],
                ['filters', 'Filters', 'Virtual target filters (HP/LP/EQ per driver), the Optimize button and passive synthesis'],
                ['network', 'Network', 'The passive network editor: schematic, component tuning, catalog and BOM'],
              ] as const
            ).map(([id, label, tip]) => (
              <button
                key={id}
                type="button"
                className={designTab === id ? 'active' : ''}
                onClick={() => setDesignTab(id)}
                title={t(tip)}
              >
                {t(label)}
              </button>
            ))}
            </nav>
          )}
          {/* Keyed per step in guided mode so the eased entry actually fires
              (@starting-style needs an insertion); expert keeps one stable
              element — tab switching is frequent there, and frequent actions
              earn no animation. */}
          <div className="pane-body" key={uiMode === 'guided' ? designTab : uiMode}>
            {uiMode === 'compare' ? comparePane : (
            <>
            {designTab === 'import' && (
              <>
      <div className="panel">
        <div className="tool-groups">
          <div className="tool-group">
            <span className="tool-group-label">{t('Measurements')}</span>
            <div className="tool-group-body files">
              {/* One card per driver, same colour identity as the charts,
                  the drawing and the driver step — and a completion status in
                  the title bar so "what is still missing" needs no hunting. */}
              {(
                [
                  ['high', 'Tweeter', 'tweeter', tweeter, 'var(--viz-tweeter)'],
                  ['mid', 'Midrange (3-way)', 'mid', midDrv, 'var(--viz-mid)'],
                  ['low', hasMidBranch ? 'Woofer' : 'Woofer / mid', 'woofer', woofer, 'var(--viz-woofer)'],
                ] as const
              ).map(([role, title, slotKey, loadedDrv, color]) => {
                const angleCount =
                  (role === 'high'
                    ? angleSets?.tweeter
                    : role === 'mid'
                      ? angleSets?.mid
                      : angleSets?.woofer
                  )?.length ?? 0;
                const hasZ = !!withSlotAliasesN(impedances)[canonicalModelForRole(role, threeWay)];
                return (
                  <div
                    key={role}
                    className={`drv-section${dropSide === slotKey ? ' drop-armed' : ''}`}
                    style={{ '--drv-color': color } as CSSProperties}
                    {...dropHandlers(slotKey)}
                  >
                    <div className="drv-section-head">
                      {t(title)}
                      <span className="drv-section-status">
                        {dropSide === slotKey
                          ? t('⬇ drop to load')
                          : loadedDrv
                            ? `${t('✓ response')}${angleCount > 1 ? ` · ${t('{n} angles', { n: angleCount })}` : ''}${hasZ ? ' · Z' : ` · ${t('no impedance yet')}`}`
                            : t('no files yet — or drop them here')}
                        {/* B2: a source whose validity band could not be
                            established is marked HERE, where the file is, not
                            only where a run refuses. It still loads and
                            displays — refusing to open a project is worse than
                            a weak band — but it cannot be fitted on. */}
                        {sourceMeta[role]?.meta.verified === false && (
                          <span className="src-unverified" title={sourceMeta[role]!.meta.unverifiedReason}>
                            {' '}⚠ {t('unverified')}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="drv-section-body">
                      {/* The drop target must be SEEN, not discovered (Sander):
                          the zone IS the browse button — one affordance, two
                          entries (drag or click). */}
                      <label
                        className="dropzone"
                        title={
                          role === 'mid'
                            ? t('3-way: the MIDDLE branch. FRD = frequency response (SPL + phase), ZMA = measured impedance — select the 0° file plus angle files and the .ZMA in one go. Needs a woofer AND a tweeter loaded to join the sum.')
                            : t('FRD = frequency response (SPL + phase), ZMA = measured impedance. Select the 0° file plus all horizontal angle files and the .ZMA in one go — angles are recognised by filename.')
                        }
                      >
                        <span className="dz-icon" aria-hidden="true">⬇</span>
                        <span className="dz-text">
                          <strong>{t('Drop FRD + ZMA files here')}</strong>
                          <span>
                            {t('response + all horizontal angles + impedance in one go — or click to browse')}
                          </span>
                        </span>
                        <input
                          type="file"
                          accept=".frd,.txt,.zma,.ZMA,.lim"
                          multiple
                          onChange={loadDriverFiles(slotKey)}
                        />
                      </label>
                      {/* Same summary line on EVERY card — a name and a ✕
                          that removes the whole branch (response, angles,
                          impedance). It used to exist on the mid card only,
                          which made the tweeter card look collapsed next to
                          it (Sanders question). */}
                      {loadedDrv && (
                        <span className="derived">
                          ✓ {loadedDrv.name}{' '}
                          <button
                            type="button"
                            onClick={() => {
                              if (slotKey === 'woofer') setWoofer(null);
                              else if (slotKey === 'mid') setMidDrv(null);
                              else setTweeter(null);
                              setZStandalone((prev) => {
                                const next = { ...prev };
                                delete next[role];
                                return next;
                              });
                              setAngleSets((prev) => {
                                if (!prev) return prev;
                                const next = { ...prev, [slotKey]: [] as AngleEntry[] };
                                if (slotKey === 'mid') delete next.mid;
                                return next.woofer.length + next.tweeter.length + (next.mid?.length ?? 0) > 0 ? next : null;
                              });
                            }}
                            title={
                              slotKey === 'mid'
                                ? t('Remove the midrange branch (back to 2-way)')
                                : t('Remove this branch — its response, angle files and impedance')
                            }
                            aria-label={t('Remove {name}', { name: loadedDrv.name })}
                          >
                            ✕
                          </button>
                        </span>
                      )}
                      {role !== 'high' &&
                        !!loadedDrv &&
                        (() => {
                          const slot = nearField[role];
                          const set = (patch: Partial<NearFieldSlot>) =>
                            setNearField((n) => ({ ...n, [role]: { ...n[role], ...patch } }));
                          const nfMax = nearFieldMaxHz(Number(sdCm2[role]));
                          const rep = merged[role];
                          return (
                            <div className="nf-slot">
                              <strong>{t('Near field — the low end the gate cannot reach')}</strong>

                      <label
                        className="file-button"
                        title={t('Near-field measurement of the CONE: microphone 5 mm from the centre of the dust cap. This is what gives the branch a low end the gate cannot reach. Export with phase.')}
                      >
                        {slot.cone ? `${t('Cone:')} ${slot.cone.name}` : t('Load cone near field…')}
                        <input
                          type="file"
                          accept=".frd,.txt"
                          onChange={(e) => loadNearField(e, role, 'cone')}
                        />
                      </label>
                      {slot.cone && (
                        <button
                          type="button"
                          className="icon"
                          aria-label={t('Remove the {title} cone near-field measurement', { title })}
                          onClick={() => set({ cone: null })}
                        >
                          ✕
                        </button>
                      )}
                      {slot.cone && (
                        <>
                          <label
                            className="file-button"
                            title={t('Optional: near-field measurement at the PORT mouth (or passive radiator). It is summed with the cone COMPLEX and weighted by its diameter — below the box tuning the two largely cancel, which a magnitude-only sum cannot represent.')}
                          >
                            {slot.port ? `${t('Port:')} ${slot.port.name}` : t('Load port near field…')}
                            <input
                              type="file"
                              accept=".frd,.txt"
                              onChange={(e) => loadNearField(e, role, 'port')}
                            />
                          </label>
                          {slot.port && (
                            <span className="inline-num" title={t('Effective diameter of the port mouth, mm. A rectangular vent: the diameter of a circle with the same area. This is its weight in the sum.')}>
                              {t('port Ø') + ' '}
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={slot.portDiaMm}
                                onChange={(e) => set({ portDiaMm: e.target.value })}
                              />
                              {' mm'}
                              <button
                                type="button"
                                className="icon"
                                aria-label={t('Remove the {title} port near-field measurement', { title })}
                                onClick={() => set({ port: null })}
                              >
                                ✕
                              </button>
                            </span>
                          )}
                          <span className="inline-num" title={t('Splice centre and how wide the crossfade is. Leave the frequency empty and the app proposes one that sits inside both validity limits: above what the gate supports, below where the cone stops being a simple source (ka = 1).')}>
                            {t('splice at') + ' '}
                            <input
                              type="number"
                              min={0}
                              step={10}
                              placeholder="auto"
                              value={slot.transitionHz}
                              onChange={(e) => set({ transitionHz: e.target.value })}
                            />
                            {' ' + t('Hz, blend') + ' '}
                            <input
                              type="number"
                              min={0.25}
                              max={3}
                              step={0.25}
                              value={slot.blendOctaves}
                              onChange={(e) => set({ blendOctaves: e.target.value })}
                            />
                            {' oct'}
                          </span>
                          <label title={t('A near-field measurement is a half-space result throughout, but a real cabinet loses up to 6 dB at low frequency as it radiates into full space. Without this the spliced low end reads too high. Deliberately an adjustable shelf rather than a diffraction model: the published formulas disagree by about 3x and measurement disagrees with all of them.')}>
                            <input
                              type="checkbox"
                              checked={slot.stepOn}
                              onChange={(e) => set({ stepOn: e.target.checked })}
                            />
                            {' ' + t('baffle step back in')}
                          </label>
                          {nfMax !== null && (
                            <span className="derived">
                              {t('near field valid below ≈ {hz} Hz (ka = 1)', { hz: Math.round(nfMax) })}
                              {cabinetInfo.reliable
                                ? ` · ${t('far field above ≈ {hz} Hz', { hz: Math.round(cabinetInfo.reliable.fromHz) })}`
                                : ` · ${t('enter the mic distance and reference height for the far-field limit')}`}
                            </span>
                          )}
                          {rep && (
                            <span className={`derived${rep.ok ? '' : ' alert'}`}>{rep.report}</span>
                          )}
                        </>
                      )}
                            </div>
                          );
                        })()}
                    </div>
                  </div>
                );
              })}
              <p className="drop-anywhere-hint">
                {t('⬇ Dropping works on this whole step — a .vxp set, saved project, catalog or filter file lands in the right place by itself; measurements ask which driver they belong to.')}
              </p>
              {/* Hidden-input labels (the Load-project pattern), NOT bare native
                  inputs: the browser's own "Choose files / No file chosen" text
                  follows the BROWSER language and is untranslatable — the one
                  string t() can never reach. */}
              <label title={t("Optional: import a VituixCAD project to simulate crossover variants. Select the .vxp together with its .ZMA and response .txt files.")}>
                {t('VituixCAD project (.vxp + .ZMA + response .txt — select together)')}{' '}
                <span className="file-button">
                  {t('Choose files…')}
                  <input
                    type="file"
                    accept=".vxp,.zma,.ZMA,.txt,.frd"
                    multiple
                    onChange={loadVituixFiles}
                    style={{ display: 'none' }}
                  />
                </span>
              </label>
              <label title={t("Phase peer-comparison: in VituixCAD export the FILTERED woofer and tweeter responses (crossover applied), select BOTH here. The Phase chart then draws VituixCAD's relative phase (tweeter − woofer) in our convention as a dashed reference.")}>
                {t('VituixCAD phase reference (filtered woofer + tweeter — select both)')}{' '}
                <span className="file-button">
                  {t('Choose files…')}
                  <input
                    type="file"
                    accept=".frd,.txt"
                    multiple
                    onChange={loadReference}
                    style={{ display: 'none' }}
                  />
                </span>
                {refResp && <span className="derived"> ✓ {refResp.names}</span>}
              </label>
              <label title={t('Model vs measurement (the validation loop): measure the BUILT system, load that FRD here, and the SPL chart overlays it against the simulated combined — level-aligned, with the deviation numbers in the SPL strip. Load again to replace.')}>
                {t('Verification measurement (built system, FRD)')}{' '}
                <span className="file-button">
                  {t('Choose file…')}
                  <input
                    type="file"
                    accept=".frd,.txt"
                    onChange={loadVerification}
                    style={{ display: 'none' }}
                  />
                </span>
                {verify && (
                  <span className="derived">
                    {' '}✓ {verify.name}{' '}
                    <button
                      type="button"
                      onClick={() => removeVerify(Math.min(verifyIx, verifyList.length - 1))}
                      title={t('Remove the verification measurement')}
                      aria-label={t('Remove the verification measurement')}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => {
                  setCmpStep(1);
                  setCmpOpen(true);
                }}
                title={t('Guided model-vs-measurement check: design, drivers, measurement, verdict — step by step')}
              >
                🔬 {t('Compare wizard')}
              </button>
              <button
                type="button"
                onClick={loadDemo}
                title={t('Load the 3-way KOAN 2951 session of Aug 2026: woofer pair (measured together), mid and tweeter at 0–60°, near-field cones + port, LIMP impedances, and the cabinet/rig as entered — the full three-branch flow, no VituixCAD project needed')}
              >
                {t('Load KOAN demo data')}
              </button>
              <button
                type="button"
                onClick={loadDemo2Way}
                title={t('Load the bundled 2023 KOAN prototype measurements (mid + tweeter, all angles + impedances + vxp variants) — instant playground')}
              >
                {t('Load 2-way demo (KOAN prototype 2023)')}
              </button>
            </div>
          </div>
          <div className="tool-group">
            <span className="tool-group-label">{t('Project')}</span>
            <div className="tool-group-body">
              <button
                type="button"
                onClick={saveProject}
                disabled={!woofer && !tweeter}
                title={t('Download everything (raw measurement files + design state) as one project file')}
              >
                {t('Save project')}
              </button>
              <label className="file-button" title={t('Restore a previously saved project file')}>
                {t('Load project')}
                <input
                  type="file"
                  accept=".json,.adsproj"
                  onChange={loadProjectFromFile}
                  style={{ display: 'none' }}
                />
              </label>
              <button type="button" onClick={resetProject} title={t('Clear autosave and start fresh')}>
                {t('Reset')}
              </button>
            </div>
          </div>
          {/* NOT expert-only (Sanders "ook na een reset moet dit makkelijk te
              vinden zijn"): guided mode hid this group entirely, and guided is
              exactly where you land after a Reset. The catalog is also the one
              thing a Reset does NOT clear, which is worth saying out loud
              right next to the Reset button. */}
          <div className="tool-group">
            <span className="tool-group-label">{t('Component catalog')}</span>
            <div className="tool-group-body">
              <label
                className="file-button"
                title={t("Import a component catalog (brands, series, E-grids, tiers, prices) — the optimizer's catalog snapping and the BOM use it. A series with a built-in id overrides the built-in.")}
              >
                {t('Import catalog')}
                <input
                  type="file"
                  accept=".json,.adscatalog.json"
                  onChange={importCatalogFromFile}
                  style={{ display: 'none' }}
                />
              </label>
              <button
                type="button"
                onClick={exportCatalog}
                title={t('Download the current catalog as an editable JSON template')}
              >
                {t('Export catalog')}
              </button>
              <button
                type="button"
                onClick={() => setCatalogMgrOpen(true)}
                title={t('Add, edit or remove exact SKUs (values, DCR/ESR, prices, tiers) without leaving the app — saved to the same catalog the optimizer and BOM use')}
              >
                🗂 {t('Manage…')}
              </button>
              <button
                type="button"
                onClick={loadDemoCatalog}
                title={t('Load the priced Jantzen/Mundorf demo catalog on its own — without the KOAN measurements. Snapping and the BOM need a priced catalog to mean anything, and this is the quickest way back to one.')}
              >
                🎧 {t('Demo catalog')}
              </button>
              <span className="derived" style={{ flexBasis: '100%' }}>
                {hasImportedCatalog()
                  ? t('A catalog is loaded — it lives outside the project, so Reset keeps it.') + ' '
                  : t('Built-in library only — import one, or take the demo catalog, to unlock snapping and real prices.') + ' '}
                {t('{n} series', { n: allSeries().length })}
                {disabledSeries().length > 0 && (
                  <>
                    {' ('}
                    <strong>{t('{n} switched off', { n: disabledSeries().length })}</strong>
                    {')'}
                  </>
                )}
                {customCatalogParts().length > 0 &&
                  ` · ${t('{n} exact parts', { n: customCatalogParts().length })}`}
                {allSeries().some((s) => s.basePrice !== undefined) ||
                customCatalogParts().some((p) => p.priceEur !== undefined)
                  ? ` · ${t('prices loaded')}`
                  : ` · ${t('no prices yet')}`}
              </span>
            </div>
          </div>
        </div>
        {/* De bestandsINVENTARIS gaat over bestanden, dus hij hoort bij
            "Your project" -- niet bij wat je van een driver weet (Sander). */}
      <div className="panel">
        <h2>{t('Imported files')}</h2>
        {(() => {
          interface Row {
            key: string;
            name: string;
            detail: string;
            /** Take this one file out again (Sanders: a wrong .lim came back
             *  with a restored backup and there was no way to remove it). */
            remove?: () => void;
          }
          interface Group {
            title: string;
            colorVar?: string;
            rows: Row[];
          }
          const groups: Group[] = [];
          const driverGroup = (
            slot: 'woofer' | 'mid' | 'tweeter',
            loaded: Loaded | null,
            zKey: BranchRole,
            title: string,
            colorVar: string,
          ) => {
            const rows: Row[] = [];
            const setLoaded = slot === 'woofer' ? setWoofer : slot === 'mid' ? setMidDrv : setTweeter;
            const dropAngles = (keep: (a: AngleEntry) => boolean) =>
              setAngleSets((prev) => {
                if (!prev) return prev;
                const next = { ...prev, [slot]: (prev[slot] ?? []).filter(keep) };
                if (slot === 'mid' && next.mid && next.mid.length === 0) delete next.mid;
                return next.woofer.length + next.tweeter.length + (next.mid?.length ?? 0) > 0 ? next : null;
              });
            if (loaded) {
              rows.push({
                key: `${slot}:${loaded.name}`,
                name: loaded.name,
                detail: t('FRD — SPL response (0°)'),
                // The 0° file IS the driver: removing it removes the branch's
                // response and, with it, its angle set (angles without an axis
                // have nothing to be relative to).
                remove: () => {
                  setLoaded(null);
                  dropAngles(() => false);
                },
              });
            }
            for (const a of angleSets?.[slot] ?? []) {
              if (loaded && a.name === loaded.name) continue;
              rows.push({
                key: `${slot}:${a.name}`,
                name: a.name,
                detail: `FRD — ${a.hor}° hor`,
                remove: () => dropAngles((e) => e.name !== a.name),
              });
            }
            const z = zStandalone[zKey];
            if (z) {
              // A LIMP .lim is converted to ZMA text once, at import, and
              // stored under a .zma name (everything downstream — autosave,
              // project file, VituixCAD folder export — is text). The
              // converter writes its provenance as the first comment line;
              // read it back so the inventory says what was actually loaded
              // (Sanders: "in werkelijkheid is dit een lim-bestand").
              const lim = /^\* Converted from LIMP binary "([^"]+)"/.exec(z.file.raw);
              rows.push({
                key: `${slot}:${z.file.name}`,
                name: lim ? lim[1] : z.file.name,
                detail: lim
                  ? t('LIMP .lim — impedance (stored as {name})', { name: z.file.name })
                  : t('ZMA — impedance'),
                remove: () =>
                  setZStandalone((prev) => {
                    const next = { ...prev };
                    delete next[zKey];
                    return next;
                  }),
              });
            }
            if (rows.length > 0) groups.push({ title, colorVar, rows });
          };
          // Top-down everywhere (Sanders rule): tweeter, mid, woofers.
          driverGroup('tweeter', tweeter, 'high', t('Tweeter'), '--viz-tweeter');
          driverGroup('mid', midDrv, 'mid', t('Midrange'), '--viz-mid');
          driverGroup('woofer', woofer, 'low', t(hasMidBranch ? 'Woofer' : 'Woofer / mid'), '--viz-woofer');
          if (project) {
            const rows: Row[] = [
              {
                key: `vxp:${project.vxpFile.name}`,
                name: project.vxpFile.name,
                detail: t('.vxp — {n} crossover variants', { n: project.vxp.crossovers.length }),
              },
            ];
            for (const [model, f] of Object.entries(project.impedanceFiles)) {
              rows.push({
                key: `vxp:${f.name}`,
                name: f.name,
                detail: t('ZMA — impedance ({model})', { model }),
              });
            }
            groups.push({ title: t('VituixCAD project'), rows });
          }
          if (groups.length === 0) {
            return (
              <p className="sub" style={{ margin: 0 }}>
                {t('Nothing imported yet — load driver files above, or hit "Load KOAN demo data".')}
              </p>
            );
          }
          return groups.map((g) => (
            <div key={g.title} className="file-group">
              <h3>
                {g.colorVar && (
                  <span className="legend-key" style={{ background: `var(${g.colorVar})` }} />
                )}
                {g.title}
              </h3>
              {g.rows.map((r) => (
                <div key={r.key} className="file-row">
                  <div className="file-row-head">
                    <span className="file-name">{r.name}</span>
                    <span className="file-kind">{r.detail}</span>
                    {r.remove && (
                      <button
                        type="button"
                        className="file-remove"
                        onClick={r.remove}
                        title={t('Remove this file from the project (drop the right one on the driver card to replace it)')}
                        aria-label={t('Remove {name}', { name: r.name })}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <input
                    className="file-note"
                    placeholder={t('Add a note… (mic distance, smoothing, gate, which prototype)')}
                    value={fileNotes[r.key] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFileNotes((p) => {
                        const next = { ...p };
                        if (v) next[r.key] = v;
                        else delete next[r.key];
                        return next;
                      });
                    }}
                    title={t('Free note for this file — autosaved and included in the project file')}
                  />
                </div>
              ))}
            </div>
          ));
        })()}
      </div>
        {storageFull && (
          <div className="verdict mismatch" style={{ margin: '0.6rem 0' }}>
            <strong>⚠ {storageFull}</strong>{' '}
            <button type="button" onClick={saveProject}>
              {t('Save project')}
            </button>
          </div>
        )}
        {unreadableBackup && (
          <div className="verdict mismatch" style={{ margin: '0.6rem 0' }}>
            <strong>{t('There is a saved backup of an earlier session that could not be loaded automatically')}</strong>{' '}
            ({Math.round(unreadableBackup.length / 1024)} kB).{' '}
            {t('It holds everything that was in the app at the time — measurements, filters, networks. Try loading it again (a temporary glitch during a code update is the usual cause), or download it as a project file.')}
            <div className="row" style={{ marginTop: '0.4rem' }}>
              <button type="button" className="primary" onClick={retryUnreadableBackup}>
                {t('Load the backup')}
              </button>
              <button type="button" onClick={downloadUnreadableBackup}>
                {t('Download backup (.json)')}
              </button>
              <button
                type="button"
                onClick={() =>
                  askConfirm(t('Discard the backup? This cannot be undone.'), t('Discard'), () => {
                    localStorage.removeItem('ads-autosave-unreadable');
                    setUnreadableBackup(null);
                  })
                }
              >
                {t('Discard')}
              </button>
            </div>
          </div>
        )}
        {persistNote && <p className="filenames">{persistNote} · {t('autosaves locally on every change')}</p>}
        {vxpNote && <p className="filenames">{vxpNote}</p>}
        {/* One banner for parse failures AND content warnings — the old
            hardcoded "Parse error:" prefix lied for anything that wasn't one
            (the vxp-pick hint, the impedance-as-response warning). */}
        {error && <p className="error">⚠ {error}</p>}
        {midIgnored && (
          <p className="error">
            ⚠ Midrange data loaded, but 3-way mode needs a woofer FRD, a midrange FRD and a
            tweeter FRD ({[
              !woofer && 'woofer response',
              !midDrv && 'midrange response',
              !tweeter && 'tweeter response',
            ]
              .filter(Boolean)
              .join(', ')}{' '}
            missing) — the midrange is NOT in the sim yet. Load what's missing, or remove the
            midrange (✕ in the Import tab).
          </p>
        )}
        {(woofer || tweeter) && (
          <p className="filenames">
            {[woofer?.name, midDrv?.name, tweeter?.name].filter(Boolean).join(' · ')}
            {zModels.length > 0 && ` · Z ✓ (${zModels.join(', ')})`}
            {soloDriver && ` · ${t('single-driver mode')}`}
            {threeWay && ` · ${t('3-way mode')}`}
          </p>
        )}
      </div>

              </>
            )}

            {designTab === 'drivers' && (
              <>
        {/* Stap 2 "Your drivers": alles wat je over de DRIVERS weet.
            Laden en bewaren is stap 1 "Your project", de kast is stap 3.
            Ze stonden alle drie op één tab en dat werd een zootje. */}
        {!woofer && !tweeter && (
          <p className="pane-hint">
            {t('Load a driver in step 1 first — then this is where you tell the app what you know about it.')}
          </p>
        )}
        {/* De feiten over de DRIVERS staan bij de drivers: dit is stap 1,
            waar hun metingen ook binnenkomen. De kast, het referentiepunt en
            de meetopstelling horen bij stap 2 "Your cabinet". De stapnamen
            zeiden dat al, alleen de indeling niet (Sanders opmerking). */}
        {(woofer || midDrv || tweeter) && (
          <fieldset className="cabinet-block">
            <legend>
              {t('What you know about them')}
              <span className="legend-sub"> {t('— from the datasheet and a ruler')}</span>
            </legend>
            {/* De tekening staat HIER en niet bij de kast: hij beantwoordt
                "staan mijn drivers waar ik denk", en dat zijn de getallen die
                je op dit scherm intypt. Een verwisselde x/y of een komma-slip
                zie je meteen; teruglezen van "y = -380" helpt daar niet. */}
            {/* The WRAPPER is the container-query anchor: in split layout a
                1600 px window can hold a 420 px design pane, so a viewport
                media query never fires while the cards are being crushed —
                the pane, not the window, is the width that matters here. */}
            <div className="driver-facts-wrap">
              <div className="driver-facts">
                <div className="driver-facts-fields">{driverFacts}</div>
                {baffleDrawing}
              </div>
            </div>
          </fieldset>
        )}
              </>
            )}
            {designTab === 'data' && !woofer && !tweeter && (
              <p className="sub pane-hint">
                {t('No measurements yet — load them in the Import tab first.')}
              </p>
            )}
            {designTab === 'data' && (
              <>
      {(woofer || tweeter) && (
        <>
          <div className="panel controls">
            <fieldset>
              <legend>
                {t('View range')}
                {rangeEditing && (
                  <span className="derived"> {t('— simulation paused while editing')}</span>
                )}
              </legend>
              <label title={t("Lower edge of the simulation grid AND the optimizer/metrics evaluation band. The sim pauses while you type; commits on Enter/blur. Zooming a chart and clicking 'use as view range' writes back here.")}>
                f min (Hz)
                <input
                  type="number"
                  value={fMin}
                  onChange={(e) => setFMin(e.target.value)}
                  onFocus={() => setRangeEditing(true)}
                  onBlur={() => setRangeEditing(false)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </label>
              <label title={t('Upper edge of the simulation grid AND the optimizer/metrics evaluation band. The sim pauses while you type; commits on Enter/blur.')}>
                f max (Hz)
                <input
                  type="number"
                  value={fMax}
                  onChange={(e) => setFMax(e.target.value)}
                  onFocus={() => setRangeEditing(true)}
                  onBlur={() => setRangeEditing(false)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </label>
              <label title={t('Y-axis floor of the SPL charts — empty = automatic')}>
                SPL min (dB)
                <input
                  type="number"
                  placeholder="auto"
                  value={splMin}
                  onChange={(e) => setSplMin(e.target.value)}
                />
              </label>
              <label title={t('Y-axis ceiling of the SPL charts — empty = automatic')}>
                SPL max (dB)
                <input
                  type="number"
                  placeholder="auto"
                  value={splMax}
                  onChange={(e) => setSplMax(e.target.value)}
                />
              </label>
            </fieldset>
            <fieldset>
              <legend>
                {t('Cabinet & measurement')}
                <span className="derived">
                  {' '}
                  {t('— the box and how you measured it (the drivers themselves are the next step)')}
                </span>
              </legend>
              <p className="cabinet-note">
                {t('Everything below is measured from the')} <strong>{t('reference point')}</strong>
                {t(': the spot the microphone was aimed at during the sweeps, and — on a turntable — the axis the cabinet turned around. Most people aim at the tweeter, so the tweeter sits at')}{' '}
                <strong>x 0, y 0</strong> {t('and anything lower gets a')}{' '}
                <strong>{t('negative y')}</strong>
                {t('. Nothing here changes your measurements; it lets the app work out what those measurements actually captured.')}
              </p>
              {/* Gepromoveerd uit de prototype-ronde (Sanders keuze):
                  CARDS in guided, LEDGER in expert.

                  Cards leidt met de UITKOMST ("je sweeps zijn eerlijk tot
                  220 Hz") en zet de knop erbij; de velden staan eronder voor
                  wie ze wil veranderen. Een beginner wil niet weten dat er
                  500 mm staat, hij wil weten wat dat hem kost.

                  Ledger toont alles tegelijk met het gevolg op dezelfde
                  regel -- wie deze getallen zelf intypt wil ze naast elkaar
                  kunnen vergelijken, niet uitklappen. */}
              {(() => {
                const veld = (
                  val: string,
                  set: (v: string) => void,
                  step = 10,
                  ph?: string,
                ) => (
                  <input
                    type="number"
                    min={0}
                    step={step}
                    placeholder={ph}
                    value={val}
                    onChange={(e) => set(e.target.value)}
                  />
                );
                const cab = (k: keyof CabinetState) => (v: string) =>
                  setCabinet((c) => ({ ...c, [k]: v }));
                /* Reference height: draft while focused, commit on blur/Enter
                   (Esc discards). See commitRefTop for why this field must
                   not write through per keystroke like the others. */
                const refTopVeld = () => (
                  <input
                    type="number"
                    step={5}
                    value={refTopDraft ?? cabinet.refFromTopMm}
                    onChange={(e) => setRefTopDraft(e.target.value)}
                    onBlur={commitRefTop}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') {
                        setRefTopDraft(null);
                        e.currentTarget.blur();
                      }
                    }}
                    title={t('How far below the top of the front panel the reference point sits. Correcting this moves the REFERENCE MARKER only — drivers keep the below-top positions you typed.')}
                  />
                );
                const eerlijk = cabinetInfo.reliable;
                const teLaag =
                  eerlijk && Number(fMin) > 0 && Number(fMin) < eerlijk.fromHz * 0.95;
                const knop = eerlijk ? (
                  <button type="button" onClick={() => setFMin(String(Math.round(eerlijk.fromHz)))}>
                    {t('use {hz} Hz as f min', { hz: Math.round(eerlijk.fromHz) })}
                  </button>
                ) : null;
                /* Say where the number came from. The whole 508-vs-455 episode
                 * was invisible because this line quoted a figure without ever
                 * naming its source (A3h). */
                const micUit = eerlijk
                  ? t('honest down to ≈ {hz} Hz', { hz: Math.round(eerlijk.fromHz) }) +
                    (eerlijk.fromFiles
                      ? ' ' + t("(the {ms} ms window your files state)", { ms: eerlijk.gateMs.toFixed(2) })
                      : eerlijk.stated
                        ? ' ' + t('(the Gate you typed here — your files state none)')
                        : ' ' + t('(predicted from the geometry — no window stated anywhere)'))
                  : t('enter the mic distance to find out how low this measurement carries');
                const stapUit = cabinetInfo.baffleStep
                  ? t('baffle step ≈ {hz} Hz', { hz: Math.round(cabinetInfo.baffleStep) })
                  : '';
                const zitUit =
                  cabinetInfo.listenAngle !== null
                    ? t('you sit {deg}° {dir} the reference axis', {
                        deg: Math.abs(cabinetInfo.listenAngle).toFixed(1),
                        dir: cabinetInfo.listenAngle >= 0 ? t('below') : t('above'),
                      })
                    : '';
                const mis =
                  Number(cabinet.baffleHeightMm) > 0 &&
                  Number(cabinet.refFromTopMm) > Number(cabinet.baffleHeightMm);

                if (uiMode === 'guided') {
                  const kaart = (
                    icoon: string,
                    titel: string,
                    antwoord: React.ReactNode,
                    velden: React.ReactNode,
                  ) => (
                    <details className="cab-card">
                      <summary>
                        <span className="cab-card-icon" aria-hidden="true">
                          {icoon}
                        </span>
                        <span className="cab-card-body">
                          <span className="cab-card-title">{titel}</span>
                          <span className="cab-card-answer">{antwoord}</span>
                        </span>
                        <span className="cab-card-more">{t('change the numbers')}</span>
                      </summary>
                      <div className="cab-card-fields">{velden}</div>
                    </details>
                  );
                  return (
                    <div className="cab-cards">
                      {kaart(
                        '📏',
                        t('How far the mic stood'),
                        <>
                          {micUit}
                          {teLaag && (
                            <>
                              {' ' + t('— your view range starts lower than that.') + ' '}
                              {knop}
                            </>
                          )}
                        </>,
                        <>
                          <span className="cd-label">{t('Distance')}</span>
                          <span className="cd-fields">
                            {veld(cabinet.micDistanceMm, cab('micDistanceMm'))} mm
                          </span>
                          <span className="cd-label">{t('Elevation')}</span>
                          <span className="cd-fields">
                            {veld(cabinet.micElevationDeg, cab('micElevationDeg'), 1, '0')} °
                          </span>
                          <span className="cd-label">{t('Gate used')}</span>
                          <span className="cd-fields">
                            {veld(cabinet.gateMs, cab('gateMs'), 0.1, t('predict'))} ms
                          </span>
                        </>,
                      )}
                      {kaart(
                        '▭',
                        t('The box'),
                        stapUit ? (
                          <>
                            {t('A {mm} mm wide baffle puts its step around', { mm: cabinet.baffleWidthMm })}{' '}
                            <b>{Math.round(cabinetInfo.baffleStep!)} Hz</b>{' '}
                            {t('— that broad tilt in your measurement is the cabinet, not the driver.')}
                          </>
                        ) : (
                          t('Add the baffle size and the app can tell the cabinet apart from the driver — and draw your front panel on the next step.')
                        ),
                        <>
                          <span className="cd-label">{t('Mic aimed at')}</span>
                          <span className="cd-fields">
                            <select
                              value={cabinet.refDriver}
                              onChange={(e) =>
                                setCabinet((c) => ({
                                  ...c,
                                  refDriver: e.target.value as '' | BranchRole,
                                }))
                              }
                            >
                              <option value="">{t('another spot on the baffle')}</option>
                              <option value="high">{t('the tweeter')}</option>
                              <option value="mid">{t('the midrange')}</option>
                              <option value="low">{t('the woofer')}</option>
                            </select>
                            <span className="cd-hint">
                              {t('that driver becomes 0,0 — you never type its own offset')}
                            </span>
                          </span>
                          <span className="cd-label">{t('Front panel')}</span>
                          <span className="cd-fields">
                            {t('width') + ' '}
                            {veld(cabinet.baffleWidthMm, cab('baffleWidthMm'))}
                            {' × ' + t('height') + ' '}
                            {veld(cabinet.baffleHeightMm, cab('baffleHeightMm'))} mm
                          </span>
                          <span className="cd-label">{t('Reference point')}</span>
                          <span className="cd-fields">
                            {refTopVeld()} {t('mm below the top')} ·{' '}
                            {veld(cabinet.refHeightMm, cab('refHeightMm'))} {t('mm above the floor')}
                          </span>
                          {mis && (
                            <span className="derived alert" style={{ gridColumn: '1 / -1' }}>
                              {t('the reference point cannot sit {ref} mm below the top of a {h} mm front panel — one of the two is the other field', { ref: cabinet.refFromTopMm, h: cabinet.baffleHeightMm })}
                            </span>
                          )}
                        </>,
                      )}
                      {kaart(
                        '🪑',
                        t('Where you listen'),
                        zitUit ||
                          t('Add your seat and ear height, and a driver-spacing rule becomes a statement about YOUR room.'),
                        <>
                          <span className="cd-label">{t('Distance')}</span>
                          <span className="cd-fields">
                            {veld(cabinet.listenDistanceM, cab('listenDistanceM'), 0.1)} m
                          </span>
                          <span className="cd-label">{t('Ear height')}</span>
                          <span className="cd-fields">
                            {veld(cabinet.listenEarHeightMm, cab('listenEarHeightMm'))} mm
                          </span>
                        </>,
                      )}
                    </div>
                  );
                }

                const rij = (k: string, v: React.ReactNode, o?: React.ReactNode) => (
                  <div className="lg-row">
                    <span className="lg-k">{k}</span>
                    <span className="lg-v">{v}</span>
                    <span className="lg-o">{o}</span>
                  </div>
                );
                return (
                  <div className="lg">
                    <div className="lg-sec">{t('How you measured')}</div>
                    {rij(
                      t('Mic distance'),
                      <>{veld(cabinet.micDistanceMm, cab('micDistanceMm'))} mm</>,
                      cabinetInfo.farField
                        ? t('{ratio}× the source — {verdict}', { ratio: cabinetInfo.farField.ratio.toFixed(1), verdict: cabinetInfo.farField.ok ? t('far field') : t('close') })
                        : '',
                    )}
                    {rij(
                      t('Mic elevation'),
                      <>{veld(cabinet.micElevationDeg, cab('micElevationDeg'), 1, '0')} °</>,
                    )}
                    {rij(
                      t('Gate used'),
                      <>{veld(cabinet.gateMs, cab('gateMs'), 0.1, 'predict')} ms</>,
                      <>
                        {micUit} {teLaag && knop}
                      </>,
                    )}
                    <div className="lg-sec">{t('The cabinet')}</div>
                    {rij(
                      t('Mic was aimed at'),
                      <select
                        value={cabinet.refDriver}
                        onChange={(e) =>
                          setCabinet((c) => ({ ...c, refDriver: e.target.value as '' | BranchRole }))
                        }
                      >
                        <option value="">{t('another spot on the baffle')}</option>
                        <option value="high">{t('the tweeter')}</option>
                        <option value="mid">{t('the midrange')}</option>
                        <option value="low">{t('the woofer')}</option>
                      </select>,
                      cabinet.refDriver ? t('that driver is 0,0 — you do not type its offset') : '',
                    )}
                    {rij(
                      t('Front panel width'),
                      <>{veld(cabinet.baffleWidthMm, cab('baffleWidthMm'))} mm</>,
                      stapUit,
                    )}
                    {rij(
                      t('Front panel height'),
                      <>{veld(cabinet.baffleHeightMm, cab('baffleHeightMm'))} mm</>,
                    )}
                    {rij(
                      t('Cabinet depth'),
                      <>{veld(cabinet.cabinetDepthMm, cab('cabinetDepthMm'))} mm</>,
                      cabinetInfo.offBaffle.length > 0
                        ? t('the panel a side-firing driver radiates from')
                        : t('only needed for side-firing drivers'),
                    )}
                    {rij(
                      t('Reference point, below top'),
                      <>{refTopVeld()} mm</>,
                      mis ? (
                        <strong className="alert">{t('deeper than the baffle is tall')}</strong>
                      ) : (
                        ''
                      ),
                    )}
                    {rij(
                      t('Reference point, above floor'),
                      <>{veld(cabinet.refHeightMm, cab('refHeightMm'))} mm</>,
                    )}
                    <div className="lg-sec">{t('Where you listen')}</div>
                    {rij(
                      t('Distance'),
                      <>{veld(cabinet.listenDistanceM, cab('listenDistanceM'), 0.1)} m</>,
                      zitUit,
                    )}
                    {rij(
                      t('Ear height'),
                      <>{veld(cabinet.listenEarHeightMm, cab('listenEarHeightMm'))} mm</>,
                    )}
                  </div>
                );
              })()}
              {/* De driverfeiten zijn verhuisd naar stap 1 "Your drivers":
                  positie, Sd/Xmax, aantal en kasttype gaan over de DRIVER, de
                  velden hierboven over de KAST en de meetopstelling. De
                  stapnamen zeiden dat al; alleen de indeling niet (Sander). */}
            </fieldset>
            <fieldset className={uiMode === 'guided' ? 'expert-only' : undefined}>
              <legend>{t('Driver phase')}</legend>
              <label title={t('Measured = the real measured phase incl. the true inter-driver time offset — the whole point of this tool. Minimum phase = reconstructed from magnitude (offsets discarded), only for apples-to-apples VituixCAD comparison.')}>
                {t('Convention')}
                <select
                  value={phaseMode}
                  onChange={(e) => setPhaseMode(e.target.value as 'measured' | 'minimum')}
                >
                  <option value="measured">{t('Measured (real timing)')}</option>
                  <option value="minimum">{t('Minimum phase (VituixCAD-style)')}</option>
                </select>
              </label>
              {phaseMode === 'minimum' && (
                <span className="derived">
                  {t('measured inter-driver timing discarded — comparison mode')}
                </span>
              )}
              {phaseMode === 'measured' && timing?.ref.verdict === 'plausible' && (
                <span className="derived">
                  {t('auto: shared time reference plausible — real timing in use')}
                </span>
              )}
            </fieldset>
            {/* Inter-driver adjustments — nothing to adjust against in
                single-driver mode, so the whole fieldset hides. */}
            {!soloDriver && (
            <fieldset className={uiMode === 'guided' ? 'expert-only' : undefined}>
              <legend>{t('Tweeter adjustment')}</legend>
              <label title={t('Simulate moving the tweeter physically (mm depth, + = recessed = extra delay). With measured phase and a shared time reference the real timing is already in the data — leave 0.')}>
                {t('Offset (mm, + = recessed)')}
                <input
                  type="number"
                  step="0.5"
                  value={offsetMm}
                  onChange={(e) => setOffsetMm(e.target.value)}
                />
              </label>
              <label title={t('Level adjustment on the tweeter branch, dB')}>
                {t('Level trim (dB)')}
                <input
                  type="number"
                  step="0.5"
                  value={trimDb}
                  onChange={(e) => setTrimDb(e.target.value)}
                />
              </label>
              <label
                className="check"
                title={t('Flip the tweeter 180° (swap + and −) — the classic move around an LR2 crossover')}
              >
                <input
                  type="checkbox"
                  checked={inverted}
                  onChange={(e) => setInverted(e.target.checked)}
                />
                {t('Invert polarity')}
              </label>
              <span className="derived" title={t('The mm offset expressed as time delay')}>
                {t('= {us} µs delay', { us: delayUs.toFixed(0) })}
              </span>
              {phaseMode === 'measured' && num(offsetMm, 0) !== 0 && (
                <span className="nl-warning">
                  {t('measured phase already carries the real timing — leave 0 unless you are simulating a physical move')}
                </span>
              )}
              {phaseMode === 'minimum' && timing?.ref.verdict === 'plausible' && (
                <span className="derived">
                  auto-filled from the excess-phase Δ (
                  {(excessBridge ? excessBridge.deltaUs * 0.343 : timing.ref.deltaMm).toFixed(1)}{' '}
                  mm) — minimum phase discards the measured timing, and the raw Δ (
                  {timing.ref.deltaMm.toFixed(1)} mm) is contaminated by the drivers&apos; own
                  minimum-phase slopes
                </span>
              )}
            </fieldset>
            )}
            {threeWay && (
              <fieldset className={uiMode === 'guided' ? 'expert-only' : undefined}>
                <legend>{t('Midrange adjustment')}</legend>
                <label title={t('Simulate moving the midrange physically (mm depth, + = recessed = extra delay). With measured phase and a shared time reference the real timing is already in the data — leave 0.')}>
                  {t('Offset (mm, + = recessed)')}
                  <input
                    type="number"
                    step="0.5"
                    value={midOffsetMm}
                    onChange={(e) => setMidOffsetMm(e.target.value)}
                  />
                </label>
                {phaseMode === 'measured' && num(midOffsetMm, 0) !== 0 && (
                  <span className="nl-warning">
                    {t('measured phase already carries the real timing — leave 0 unless you are simulating a physical move')}
                  </span>
                )}
                <label title={t('Level adjustment on the midrange branch, dB')}>
                  {t('Level trim (dB)')}
                  <input
                    type="number"
                    step="0.5"
                    value={midTrimDb}
                    onChange={(e) => setMidTrimDb(e.target.value)}
                  />
                </label>
                <label className="check" title={t('Flip the midrange 180° (swap + and −)')}>
                  <input
                    type="checkbox"
                    checked={midInverted}
                    onChange={(e) => setMidInverted(e.target.checked)}
                  />
                  {t('Invert polarity')}
                </label>
              </fieldset>
            )}
            {project && project.vxp.crossovers.length > 0 && (
              <fieldset>
                <legend>{t('Crossover (VituixCAD project)')}</legend>
                <label title={t("Simulate one of the crossover variants from the imported VituixCAD project (solved on the measured impedances). 'None' shows the raw drivers.")}>
                  {t('Variant')}
                  <select value={xoName} onChange={(e) => setXoName(e.target.value)}>
                    <option value="none">{t('None (raw drivers)')}</option>
                    {project.vxp.crossovers.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            )}
          </div>
          {sim?.xoError && <p className="error">{t('Crossover error:')} {sim.xoError}</p>}
        </>
      )}

      {timing && (
        <div className="panel timing">
          <h2>{t('Timing sanity check')}</h2>
          <div className={`verdict ${verdictClass(timing.ref.verdict)}`}>
            <strong>{verdictHeading(timing.ref.verdict)}</strong>
            <div style={{ marginTop: '0.4rem' }}>{timing.ref.message}</div>
          </div>
          <div className="stats">
            <Stat
              k={t('Woofer delay')}
              v={`${timing.w.delayMs.toFixed(3)} ms`}
              sub={`R² ${timing.w.rSquared.toFixed(3)}`}
            />
            <Stat
              k={t('Tweeter delay')}
              v={`${timing.t.delayMs.toFixed(3)} ms`}
              sub={`R² ${timing.t.rSquared.toFixed(3)}`}
            />
            <Stat
              k={t('Apparent mic distance')}
              v={`${(timing.ref.apparentDistanceM.woofer * 100).toFixed(1)} / ${(
                timing.ref.apparentDistanceM.tweeter * 100
              ).toFixed(1)} cm`}
              sub={t('woofer / tweeter — incl. common latency')}
            />
            <Stat
              k={t('Acoustic-centre Δ')}
              v={`${timing.ref.deltaUs.toFixed(0)} µs ≈ ${timing.ref.deltaMm.toFixed(1)} mm`}
              sub={t('tweeter later = positive')}
            />
          </div>
          {delayGeometry?.pair && (
            <p className="sub" style={{ margin: '0.75rem 0 0' }}>
              {/* An arrival time is total path ÷ c, and that path is two
                  unrelated things: the driver's acoustic centre (the same
                  wherever you stand) and the oblique mic-to-driver distance
                  (the tripod's, and it shrinks as you step back). Reporting
                  the sum as a driver property credits the rig for part of it
                  — Sanders question, answerable since the positions exist. */}
              {(() => {
                const totalUs = excessBridge ? excessBridge.deltaUs : timing.ref.deltaUs;
                const p = delayGeometry.pair!;
                const acUs = totalUs - p.us;
                const mm = Math.abs(p.rigMm);
                const dir = p.rigMm >= 0 ? t('further from') : t('closer to');
                // Mounting depth only earns a sentence when there IS one: on a
                // normal flush-mounted pair it is 0 and would be noise.
                const mounted = Math.abs(p.mountUs) >= 1;
                return (
                  <>
                    <strong>{t('Split of that Δ:')}</strong>{' '}
                    {t('{us} µs is the measuring RIG — at {dist} mm the upper driver sits {mm} mm {dir} the microphone than the lower one, purely because they are at different heights.', { us: p.rigUs.toFixed(1), dist: Math.round(delayGeometry.distanceMm), mm: mm.toFixed(2), dir })}
                    {mounted && (
                      <>
                        {' '}
                        {t('Another')} <strong>{p.mountUs.toFixed(1)} µs</strong>{' '}
                        {t('is MOUNTING DEPTH: the cabinet puts one cone further back')}
                        {delayGeometry.offBaffle.length > 0
                          ? ` ${t('({drivers} does not radiate from the front baffle)', { drivers: delayGeometry.offBaffle.join(', ') })}`
                          : ''}
                        {t(', which the drawing already explains and the drivers should not be blamed for.')}
                      </>
                    )}{' '}
                    {t('The remaining')} <strong>{acUs.toFixed(1)} µs</strong>{' '}
                    {t('is the acoustic centres, and only that part is a property of the drivers.')}
                    {excessBridge
                      ? ` ${t('(Taken from the excess-phase Δ, the honest one for depth.)')}`
                      : ''}{' '}
                    {t('The rig share shrinks with distance — which is why a sum aligned at the microphone is not aligned at the seat.')}
                    {delayGeometry.lowMid && (
                      <> {t('Woofer→mid rig share:')} {delayGeometry.lowMid.rigUs.toFixed(1)} µs
                      {Math.abs(delayGeometry.lowMid.mountUs) >= 1
                        ? `, ${t('mounting')} ${delayGeometry.lowMid.mountUs.toFixed(1)} µs`
                        : ''}
                      .</>
                    )}
                  </>
                );
              })()}
            </p>
          )}
          {measuredDepth && measuredDepth.unexplained.length > 0 && (
            <p className="sub alert" style={{ margin: '0.35rem 0 0' }}>
              <strong>⚠ {t('Position and measurement disagree.')}</strong>{' '}
              {t('For {drivers}, the oblique path from a mic at {dist} mm to a driver at that height already accounts for MORE delay than the measurement found — no mounting depth can explain the rest, because that would put the cone in front of the baffle. Check the height you typed, or the time reference of the sweeps.', {
                drivers: measuredDepth.unexplained
                  .map((r) => (r === 'high' ? t('the tweeter') : r === 'mid' ? t('the midrange') : t('the woofer')))
                  .join(` ${t('and')} `),
                dist: Math.round(Number(cabinet.micDistanceMm)),
              })}
            </p>
          )}
          {measuredDepth && measuredDepth.spread >= 1 && (
            <p className="sub" style={{ margin: '0.35rem 0 0' }}>
              {/* The inverse of the split above: the measurement can tell you
                  the depth instead of you measuring it with a ruler — and it
                  finds the ACOUSTIC centre, which a ruler cannot. */}
              <strong>{t('Measured mounting depth:')}</strong>{' '}
              {(['high', 'mid', 'low'] as BranchRole[])
                .filter((r) => measuredDepth.depths[r] !== undefined)
                .map((r) => {
                  const naam =
                    r === 'high'
                      ? t('tweeter')
                      : r === 'mid'
                        ? t('midrange')
                        : hasMidBranch
                          ? t('woofer')
                          : t('woofer/mid');
                  return `${naam} ${measuredDepth.depths[r]!.toFixed(1)} mm`;
                })
                .join(' · ')}{' '}
              {t("behind the shallowest. Derived from the excess-phase delay with the rig's own geometry removed, so it is what the drivers actually do rather than what the drawing says.")}{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() =>
                  setCabinet((c) => ({
                    ...c,
                    drivers: Object.fromEntries(
                      (['low', 'mid', 'high'] as BranchRole[]).map((r) => [
                        r,
                        measuredDepth.depths[r] === undefined
                          ? c.drivers[r]
                          : { ...c.drivers[r], depthMm: measuredDepth.depths[r]!.toFixed(1) },
                      ]),
                    ) as Record<BranchRole, CabinetDriver>,
                  }))
                }
                title={t('Write these into the Mounting depth fields. Note what it costs: the timing split then explains itself by construction, so the residual stops being an independent check on your measurement. It still sharpens the geometry — true off-axis angle, centre-to-centre spacing — which does not depend on the delay at all.')}
              >
                {t('use as mounting depth')}
              </button>
              {(['low', 'mid', 'high'] as BranchRole[]).some(
                (r) => Number(cabinet.drivers[r].depthMm) > 0,
              ) && (
                <>
                  {' '}
                  {t('With a depth already entered this is a CROSS-CHECK: if the two disagree, either the drawing or the measurement is wrong.')}
                </>
              )}
            </p>
          )}
          {measureVerdict && (
            <p
              className="sub"
              style={{ margin: '0.35rem 0 0' }}
              title={t('The residual the seat correction would remove, expressed in degrees at the highest handover — a time shift is only as harmful as the frequency it lands on. Same 1/R geometry as the far-field rule, so measuring far enough away fixes both at once.')}
            >
              <strong>
                {measureVerdict.verdict === 'fine'
                  ? t('✓ Measuring distance is far enough')
                  : measureVerdict.verdict === 'marginal'
                    ? t('△ Measuring distance is borderline')
                    : t('⚠ Measuring distance is shaping the design')}
              </strong>{' '}
              {t('— moving from the microphone to the listening seat would shift the branches by')}{' '}
              {measureVerdict.worstUs.toFixed(1)} µs, {t('which is')}{' '}
              <strong>{measureVerdict.deg.toFixed(1)}°</strong> {t('at the')}{' '}
              {Math.round(measureVerdict.hz)} Hz {t('handover')}.{' '}
              {measureVerdict.verdict === 'fine'
                ? t('Nothing to correct — leave the re-timing off.')
                : t('Measuring further away fixes this at the source (it is the same geometry the far-field rule describes); the re-timing below is the fallback when the room or a tall cabinet will not allow it.')}
            </p>
          )}
          {seatShiftMm && (
            <p className="sub" style={{ margin: '0.35rem 0 0' }}>
              {t('Seat re-timing ACTIVE: branches shifted by')}{' '}
              {(['low', 'mid', 'high'] as const)
                .filter((r) => threeWay || r !== 'mid')
                .map((r) => `${r} ${(seatShiftMm.us[r] ?? 0).toFixed(1)} µs`)
                .join(' · ')}{' '}
              {t('— the sum now shows the listening position, not the microphone.')}
            </p>
          )}
          <label
            className="check"
            style={{ margin: '0.5rem 0 0' }}
            title={t('Re-time each branch from the MEASURING distance to the LISTENING distance. The oblique path from a mic at close range to a driver at a different height is longer than it will be at the seat, so a sum aligned at the microphone drifts. Needs driver positions, mic distance and listening distance; measured phase only (minimum phase has already discarded the arrival times).')}
          >
            <input
              type="checkbox"
              checked={seatTiming}
              onChange={(e) => setSeatTiming(e.target.checked)}
              disabled={phaseMode !== 'measured'}
            />{' '}
            {t('Re-time to the listening distance')}
            {phaseMode !== 'measured' && ` ${t('(measured phase only)')}`}
            {seatTiming && !seatShiftMm && phaseMode === 'measured' && (
              <span className="derived">
                {' '}
                {t('— needs driver positions, mic distance and listening distance (Cabinet)')}
              </span>
            )}
          </label>
          {timing.ref.verdict === 'plausible' && (
            <p className="sub" style={{ margin: '0.75rem 0 0' }}>
              {excessBridge ? (
                <>
                  {t('VituixCAD equivalent (Minimum phase ON): give the')}{' '}
                  <strong>{excessBridge.deltaUs >= 0 ? t('tweeter') : t('woofer/mid')}</strong>{' '}
                  {t('a Delay of')} <strong>{Math.abs(excessBridge.deltaUs).toFixed(0)} µs</strong>
                  {t(', the other driver 0 — this is the EXCESS-phase Δ (measured − minimum phase), the value a minimum-phase reconstruction needs. NB: it can differ from the raw Δ above in size AND sign (the raw fit absorbs each driver’s minimum-phase slope). The .vxp export fills this in automatically.')}
                </>
              ) : (
                <>{t('VituixCAD equivalent: use the .vxp export — it derives the bridge delays.')}</>
              )}{' '}
              {t('Only the DIFFERENCE matters — never enter the shared ~{us} µs bulk delay.', { us: (Math.min(timing.w.delayMs, timing.t.delayMs) * 1000).toFixed(0) })}
            </p>
          )}
        </div>
      )}
              </>
            )}

            {designTab === 'filters' && !result && (
              <p className="sub pane-hint">
                {t('Nothing to design yet — load measurements in the Import tab first.')}
              </p>
            )}
            {designTab === 'filters' && result && (
        <>
          <div className="panel">
            <h2>{uiMode === 'guided' ? t('Design the filter') : t('Virtual filters (target design)')}</h2>
            <p
              className="sub sim-source"
              title={t("The sim's precedence: an active editor network wins over a vxp variant, which wins over the virtual filters, which win over raw drivers. Every chart on the right shows THIS.")}
            >
              {t('Charts show:')} <strong>{simSource}</strong>
            </p>
            {uiMode === 'guided' && (
              <p className="sub">
                {t('One button. The app works out where the drivers should hand over to each other, what shape each filter needs and which real parts to buy — using your measurements, not rules of thumb. It builds and measures')}{' '}
                <strong>{t('nine complete designs')}</strong>{' '}
                {t('across the crossover range your drivers allow and keeps the best — the widest search it offers, because here you are not going to hand-tune one. Expect several minutes; you can watch each candidate come in, and cancel at any time.')}
              </p>
            )}
            {uiMode === 'guided' && nonStandard.length > 0 && (
              /* Guided should BE the standard setting. It is not knob-free —
                 the wizard writes these same values — so the honest form is
                 not a silent override but naming what deviates, one click
                 from being put back. This also catches the settings the
                 wizard never shows, which could otherwise steer a guided run
                 from behind the curtain. */
              <p className="sub" style={{ marginTop: '-0.4rem' }}>
                <strong>{t('Not at the standard settings:')}</strong>{' '}
                {nonStandard.map(([, , label]) => label).join(' · ')}.{' '}
                <button type="button" className="link-btn" onClick={resetToStandard}>
                  {t('use the standard settings')}
                </button>
              </p>
            )}
            {/* DELIVERABLE 3 — the pre-start estimate, and it is a NOTICE.
              * "Start anyway" is an ordinary button, not a confirmation of
              * something dangerous: a crossing outside the feasible window is
              * a design the measurements say will be fighting its drivers,
              * which a designer sometimes chooses on purpose. Nothing is
              * skipped and nothing is clamped either way. */}
            {v2PreStart && (
              <div className="v2-prestart">
                <b>⚠ {t('Before the scan starts')}</b>
                <p>{v2PreStart.message}</p>
                <div className="v2-prestart-actions">
                  <button type="button" onClick={v2PreStart.proceed}>
                    {t('Start anyway')}
                  </button>
                  <button type="button" onClick={() => setV2PreStart(null)}>
                    {t('Cancel — let me change the range')}
                  </button>
                </div>
              </div>
            )}
            <div className="tool-groups" style={{ marginBottom: '1rem' }}>
              <div className="tool-group">
                <span className="tool-group-label">{t('Design')}</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={() => void runVfOptimize()}
                    disabled={vfBusy}
                    title={
                      threeWay
                        ? t('3-way: staged 2D scan — LR4 targets + measured level trims per (low, high) handover candidate, per-branch synthesis, assembled two-pair tune; the amp-load verdict gates the ranking. Winner lands in the Working tab.')
                        : soloDriver
                          ? t('Single-driver mode: flatten this driver — cut-only EQ/shelf design, built as series traps / shelf groups (+ gated Zobel) and component-tuned against the measurement (lands in the Working tab)')
                          : t('Design the crossover, build it as a passive network and simulate it — all in one go (lands in the Working tab)')
                    }
                  >
                    {vfBusy
                      ? t('Optimizing + building…')
                      : soloDriver
                        ? t('Optimize — flatten driver')
                        : t('Optimize — design for me')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Start at the import gate (step 0) when there is no driver
                      // data yet — the wizard should take you from nothing to a
                      // built crossover, not assume measurements exist. One
                      // loaded driver is enough (single-driver mode).
                      setWizardStep(
                        !woofer && !tweeter ? 0 : guidedDone.cabinet && guidedDone.drivers ? 1 : 5,
                      );
                      setWizardOpen(true);
                    }}
                    title={t('Design wizard: load measurements, then goals, priority, crossover point, acoustic slopes and component choices in one guided flow — ends with Optimize')}
                  >
                    {uiMode === 'guided' ? `🧙 ${t('Walk me through it')}` : `🧙 ${t('Wizard')}`}
                  </button>
                  <select
                    className={uiMode === 'guided' ? 'expert-only' : undefined}
                    value={synthMode}
                    onChange={(e) => setSynthMode(e.target.value as 'filter' | 'acoustic')}
                    title={t('What the passive build optimises for: the acoustic result on the measured driver, or an exact reproduction of the filter curve')}
                  >
                    <option value="acoustic">{t('Acoustic result (flatten measured driver)')}</option>
                    <option value="filter">{t('Filter curve (reproduce target exactly)')}</option>
                  </select>
                </div>
              </div>
              <div className={`tool-group${uiMode === 'guided' ? ' expert-only' : ''}`}>
                <span className="tool-group-label">{t('Configure')}</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    className={showOptSettings ? 'active-toggle' : ''}
                    onClick={() => setShowOptSettings((s) => !s)}
                    title={t('Optimizer settings: priority, amplitude target, in-room weight, EQ bands')}
                  >
                    ⚙ {t('Settings')}
                  </button>
                </div>
              </div>
              <div className={`tool-group${uiMode === 'guided' ? ' expert-only' : ''}`}>
                <span className="tool-group-label">{t('State')}</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={resetVirtualFilters}
                    disabled={vfBusy}
                    title={t('Filters back to the clean starting point — measurements and crossover selection stay')}
                  >
                    {t('Reset filters')}
                  </button>
                  <label title={t('Take the virtual filters out of the simulation, keeping their settings — auto-on when a built passive network replaces them')}>
                    <input
                      type="checkbox"
                      checked={vfBypass}
                      onChange={(e) => setVfBypass(e.target.checked)}
                    />{' '}
                    {t('Bypass')}
                  </label>
                </div>
              </div>
            </div>
            {vfBusy && vfProgress && (
              <p className="derived" style={{ margin: '0 0 1rem' }}>
                {vfProgress.items
                  ? t('scan {a}/{b}', { a: vfProgress.round, b: vfProgress.items.length })
                  : (vfProgress.label ?? t('round {n}', { n: vfProgress.round }))}{' '}
                · {vfProgress.evals.toLocaleString('nl-NL')} {t('network sims')} ·{' '}
                {vfProgress.rippleDb !== undefined && vfProgress.phaseDeg !== undefined
                  ? `${vfProgress.rippleDb.toFixed(2)} dB / ${vfProgress.phaseDeg.toFixed(1)}°`
                  : '…'}
              </p>
            )}
            {vfBypass && uiMode === 'expert' && (
              <p className="derived" style={{ margin: '0 0 1rem' }}>
                {t('virtual filters muted — passive network / raw drivers only')}
              </p>
            )}
            {showOptSettings && (
              <div className="row opt-settings" style={{ marginBottom: '1rem' }}>
                <span className="opt-settings-cap">{t('Optimizer settings')}</span>
                {soloDriver && (
                  <>
                    <span className="derived" style={{ flexBasis: '100%' }}>
                      {t("Single-driver mode — crossover settings (priority, phase, slopes, crossover point, HP/LP) don't apply and are disabled; the solo engine designs cut-only EQ/shelves within the EQ-band budget and the targets' ripple.")}
                    </span>
                    {/* HOW FAR MAY IT DROP — the one control that decides how
                        much this engine can do. It used to be called
                        "sensitivity budget", which is jargon: Sanders read a
                        panel that contained the answer twice and still asked
                        for "een invoerveld voor hoe laag hij mag zakken". The
                        label now says exactly that, and the readout shows the
                        absolute level it works out to. */}
                    <label
                      className="inline-num"
                      title={t("How much LEVEL the correction may give up. Passive filters can only cut, so flatness is paid for in efficiency — this is the budget for that payment. 6 dB ≈ a baffle-step's worth, right for a driver that will still get a crossover. A fullranger carrying the whole range is usually worth 10–20 dB: the further it may drop, the further up the band it can pull things flat.")}
                    >
                      {t('May drop by')}
                      <input
                        type="number"
                        min={0}
                        max={40}
                        step={0.5}
                        value={soloSensDb}
                        disabled={soloFloorOn}
                        onChange={(e) => setSoloSensDb(e.target.value)}
                      />{' '}
                      dB
                    </label>
                    {!soloFloorOn && soloFloorInfo && (
                      <span
                        className="derived"
                        title={t("What that budget means in absolute terms: the driver's own median level over the evaluation band, and the level the correction may sink to.")}
                      >
                        {t('→ down to {a} dB (driver sits at {b})', { a: (soloFloorInfo.median - num(soloSensDb, 6)).toFixed(0), b: soloFloorInfo.median.toFixed(0) })}
                      </span>
                    )}
                    <label
                      className="check"
                      title={t("Instead of 'may drop by N dB', name the level itself: the engine flattens everything down TO that level. Better-posed (a fixed target cannot be met by moving the average) and it tells you directly how far up the band the correction can reach.")}
                    >
                      <input
                        type="checkbox"
                        checked={soloFloorOn}
                        onChange={(e) => {
                          setSoloFloorOn(e.target.checked);
                          if (e.target.checked && soloFloorDb.trim() === '' && soloFloorInfo) {
                            setSoloFloorDb(String(soloFloorInfo.suggested));
                          }
                        }}
                      />{' '}
                      {t('or flatten to a fixed level')}
                    </label>
                    {soloFloorOn && (
                      <>
                        <label
                          className="inline-num"
                          title={t("Flatten down TO this level (dB, in your own measurement's scale — check the SPL chart). A lower target reaches further up the band but costs efficiency. Anything already below this level cannot be lifted and stays out of scope.")}
                        >
                          {t('Flat at')}
                          <input
                            type="number"
                            step={1}
                            value={soloFloorDb}
                            placeholder={soloFloorInfo ? String(soloFloorInfo.suggested) : ''}
                            onChange={(e) => setSoloFloorDb(e.target.value)}
                          />{' '}
                          dB
                        </label>
                        {soloFloorInfo && (
                          <span
                            className="derived"
                            title={t("The driver's own median level over the evaluation band, and how far a cut-only correction can reach at the target level you entered.")}
                          >
                            {t('driver sits at {a} dB · reaches {b}–{c}', { a: soloFloorInfo.median.toFixed(0), b: hz(soloFloorInfo.reach[0]), c: hz(soloFloorInfo.reach[1]) })}
                          </span>
                        )}
                      </>
                    )}
                  </>
                )}
                <span className="opt-group-cap">{t('Goals & weighting')}</span>
                <label title={soloDriver ? t('Single-driver mode: relative phase does not exist — the solo objective is response flatness only') : t('The big trade-off: budget split between a flat response and flat phase. More phase = flatter phase but more amplitude ripple. Both ends are anchored (100% phase = 90/10 internally): with the response weight at true zero the optimizer would trade a wrecked response for a phase metric it can then game.')}>
                  {t('Priority: response {a}% · phase {b}%', { a: 100 - phasePriority, b: phasePriority })}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={phasePriority}
                    onChange={(e) => setPhasePriority(Number(e.target.value))}
                    disabled={!!soloDriver}
                    style={{ width: '14rem', accentColor: 'var(--accent)' }}
                  />
                </label>
                <label title={t("How phase error is judged. Integration band = the panel's average + excursions over the WHOLE overlap window (flat across the handover, matches the numbers you read). Classic = overlap-weighted mean, centre-heavy (the old behaviour, kept as fallback).")}>
                  {t('Phase metric')}
                  <select
                    value={phaseMetricMode}
                    onChange={(e) => setPhaseMetricMode(e.target.value as 'band' | 'overlap')}
                    disabled={!!soloDriver}
                  >
                    <option value="band">{t('Integration band (avg + P95)')}</option>
                    <option value="overlap">{t('Classic (overlap-weighted)')}</option>
                  </select>
                </label>
                <label>
                  {t('Amplitude target')}
                  <select
                    value={ampTarget}
                    onChange={(e) => setAmpTarget(e.target.value as 'onAxis' | 'listeningWindow')}
                    disabled={!angleSets || !!soloDriver}
                    title={soloDriver ? t('Single-driver mode: directivity terms pair both drivers — on-axis only for now') : angleSets ? '' : t('Load angle measurements to enable')}
                  >
                    <option value="onAxis">{t('On-axis (0°)')}</option>
                    <option value="listeningWindow">{t('Listening window (0–30°)')}</option>
                  </select>
                </label>
                <label title={soloDriver ? t('Single-driver mode: directivity terms pair both drivers — disabled for now') : angleSets ? '' : t('Load angle measurements to enable')}>
                  {t('Weight for in-room sound: {n}% (energy average)', { n: dirWeight })}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={dirWeight}
                    onChange={(e) => setDirWeight(Number(e.target.value))}
                    disabled={!angleSets || !!soloDriver}
                    style={{ width: '11rem', accentColor: 'var(--accent)' }}
                  />
                </label>
                <label
                  className="inline-num"
                  title={t("How the energy average is judged. Smooth (default): the trend of the power response (dB/decade) is fitted and left FREE — a rising DI makes it fall, and the slope is your room correction's business — and only the RESIDUAL counts: its std plus a fold term near each crossing (a DI step no room EQ can undo). Legacy: std of the raw power response (flatness), the pre-Aug-2026 behaviour, for A/B on existing projects.")}
                >
                  {t('Power response')}
                  <select
                    value={powerMetric}
                    onChange={(e) => {
                      const v = e.target.value === 'legacy' ? 'legacy' : 'smooth';
                      setPowerMetric(v);
                      localStorage.setItem('ads-power-metric', v);
                    }}
                    disabled={!angleSets || !!soloDriver}
                  >
                    <option value="smooth">{t('smooth (slope free, fold penalised)')}</option>
                    <option value="legacy">{t('legacy (flat)')}</option>
                  </select>
                  {powerMetric === 'smooth' && (
                    <>
                      {' '}{t('fold ×')}
                      <input
                        type="number"
                        min={0}
                        max={3}
                        step={0.1}
                        value={powerFoldWeight}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const nv = Number.isFinite(v) && v >= 0 ? v : 0.5;
                          setPowerFoldWeight(nv);
                          localStorage.setItem('ads-power-fold', String(nv));
                        }}
                        style={{ width: '3.6rem' }}
                        title={t('Weight of the DI-fold term (max |residual| within ×/÷1.6 of a crossing) as a share of the in-room weight. Default 0.5.')}
                      />
                    </>
                  )}
                </label>
                <label
                  className="inline-num"
                  title={t('Smoothing of the on-axis and energy-average magnitudes the SEARCH judges (Gaussian in log-f, applied before decimation to the inner grid). Diffraction ripple and measurement noise no filter can fix stop steering the search. Off = legacy raw points. Gates, staged targets and the safety gate always judge the raw full grid; the scan table shows the smoothed peak with the raw peak as tooltip.')}
                >
                  {t('Error smoothing')}
                  <select
                    value={String(errorSmoothOct)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setErrorSmoothOct(v);
                      localStorage.setItem('ads-err-smooth', String(v));
                    }}
                  >
                    <option value="0">{t('off (legacy)')}</option>
                    <option value={String(1 / 24)}>1/24 oct</option>
                    <option value={String(1 / 12)}>1/12 oct</option>
                    <option value={String(1 / 6)}>1/6 oct</option>
                  </select>
                </label>
                <label
                  className="inline-num"
                  title={t("Source resistance the LOW driver sees at its box tuning (real part of the Thevenin impedance looking back from its terminals): series R and coil DCR in the woofer branch add to Re and raise Qes — damping and efficiency lost, invisible to every response metric. Above this limit a scan candidate loses a ranking class (same mechanism as the Z floor) and a staged prune/escalation move that pushes it over is not accepted. Yellow from half the limit. Model estimate outside the measured band.")}
                >
                  {t('Source R limit')}
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={rSourceLimitOhm}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const nv = Number.isFinite(v) && v >= 0 ? v : 1.0;
                      setRSourceLimitOhm(nv);
                      localStorage.setItem('ads-rsource-limit', String(nv));
                    }}
                    style={{ width: '3.6rem' }}
                  />{' '}Ω
                  {' · '}{t('disqualify ≥')}
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={rSourceDisqOhm}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const nv = Number.isFinite(v) && v >= 0 ? v : 2.0;
                      setRSourceDisqOhm(nv);
                      localStorage.setItem('ads-rsource-disq', String(nv));
                    }}
                    style={{ width: '3.6rem' }}
                    title={t('Hard tier: a candidate with at least this much source resistance in front of the low driver is disqualified from the ranking — it stays in the table, struck through, with the reason. 0 = off.')}
                  />{' '}Ω
                </label>
                <label
                  className="inline-num"
                  title={t("The minimum load your AMPLIFIER is rated for, from its own spec sheet. Leave EMPTY and the engine holds the design to nothing — the delivered impedance minimum is still measured and shown, it just does not decide anything. Filled: a design that dips below it is repaired if that is possible, loses a ranking class if it is not, and every refusal says the number came from you. There is deliberately no default: a tube amp, a PA amp and a class-D module want different answers and this app cannot see which one you own.")}
                >
                  {t('Amplifier min load')}
                  <input
                    type="number"
                    min={0}
                    max={16}
                    step={0.1}
                    placeholder={t('not set')}
                    value={ampMinLoadOhm ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === '') {
                        setAmpMinLoadOhm(null);
                        localStorage.removeItem('ads-amp-min-load');
                        return;
                      }
                      const v = Number(raw);
                      const nv = Number.isFinite(v) && v > 0 ? v : null;
                      setAmpMinLoadOhm(nv);
                      if (nv === null) localStorage.removeItem('ads-amp-min-load');
                      else localStorage.setItem('ads-amp-min-load', String(nv));
                    }}
                    style={{ width: '3.6rem' }}
                  />{' '}Ω
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                    {ampMinLoadOhm === null
                      ? t('— empty: no floor is applied, the minimum is only reported')
                      : t('— designs below it are repaired, or lose a ranking class')}
                  </span>
                </label>
                <label
                  className="inline-num"
                  title={t('Dissipation term: a soft objective penalty on series resistance in front of the LOWEST branch — weight × (Rs/Re)² at the level reference (Fb or the Z peak). Steers the tuner away from matching levels by burning power in the woofer branch (efficiency and damping), before the hard tiers have to act. 0 = off (legacy).')}
                >
                  {t('Dissipation weight')}
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.01}
                    value={dissipationWeight}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const nv = Number.isFinite(v) && v >= 0 ? v : 0.05;
                      setDissipationWeight(nv);
                      localStorage.setItem('ads-diss-weight', String(nv));
                    }}
                    style={{ width: '3.6rem' }}
                  />
                </label>
                {threeWay && (
                  <label
                    className="inline-num"
                    title={t("Directivity in the STRUCTURE search (3-way): each handover pays weight × log2(knee / DI anchor)², the anchor being where the lower driver's DI meets the upper's (from the angle sets). In the literature directivity match is the first crossover criterion, not an afterthought of the tuner. 0 = off.")}
                  >
                    {t('DI anchor weight')}
                    <input
                      type="number"
                      min={0}
                      max={3}
                      step={0.1}
                      value={diWeight}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        const nv = Number.isFinite(v) && v >= 0 ? v : 0.3;
                        setDiWeight(nv);
                        localStorage.setItem('ads-di-weight', String(nv));
                      }}
                      style={{ width: '3.6rem' }}
                    />
                    {!physWin3?.angleSets && (
                      <span className="derived"> {t('structure choice on-axis — load angle data for directivity steering')}</span>
                    )}
                    {physWin3?.angleSets && physWin3.diAnchor.low === null && physWin3.diAnchor.high === null && (
                      <span className="derived"> {t('no DI match found in the measured band — structure choice on-axis')}</span>
                    )}
                  </label>
                )}
                <span className="opt-group-cap">{t('Filter shape')}</span>
                <label
                  className="inline-num"
                  title={t('Hard cap on EQ bands per driver the optimizer may spend — more bands = finer correction but a bigger search (and more passive components later)')}
                >
                  {t('Correction bands per driver (max)')}
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={1}
                    value={vfEqBands}
                    onChange={(e) =>
                      setVfEqBands(Math.max(0, Math.min(8, Math.round(Number(e.target.value)))))
                    }
                  />
                </label>
                {threeWay && (
                  <label title={t('Preferred alignment for the LOW (woofer-mid) handover — binding: the designer picks the foundation, the optimizer keeps knees, level and polarity free. Auto = free choice from the library.')}>
                    {t('HP/LP preference (low xo)')}
                    <select value={hpLpPrefLow} onChange={(e) => setHpLpPrefLow(e.target.value)}>
                      <option value="auto">{t('Auto (library)')}</option>
                      <option value="LR2">LR2 (12 dB/oct)</option>
                      <option value="LR4">LR4 (24 dB/oct)</option>
                      <option value="BW2">BW2 (12 dB/oct)</option>
                      <option value="BW3">BW3 (18 dB/oct)</option>
                      <option value="BW4">BW4 (24 dB/oct)</option>
                      <option value="BS2">Bessel 2 (12 dB/oct)</option>
                      <option value="BS3">Bessel 3 (18 dB/oct)</option>
                      <option value="BS4">Bessel 4 (24 dB/oct)</option>
                    </select>
                  </label>
                )}
                <label title={t('Preferred HP/LP alignment — binding: the designer picks the foundation, the optimizer designs the best crossover on it (knees, level, polarity and EQ stay free). Auto = free choice from the library.')}>
                  {threeWay ? t('HP/LP preference (high xo)') : t('HP/LP preference')}
                  <select value={hpLpPref} onChange={(e) => setHpLpPref(e.target.value)} disabled={!!soloDriver}>
                    <option value="auto">{t('Auto (library)')}</option>
                    <option value="LR2">LR2 (12 dB/oct)</option>
                    <option value="LR4">LR4 (24 dB/oct)</option>
                    <option value="BW2">BW2 (12 dB/oct)</option>
                    <option value="BW3">BW3 (18 dB/oct)</option>
                    <option value="BW4">BW4 (24 dB/oct)</option>
                    <option value="BS2">Bessel 2 (12 dB/oct)</option>
                    <option value="BS3">Bessel 3 (18 dB/oct)</option>
                    <option value="BS4">Bessel 4 (24 dB/oct)</option>
                  </select>
                </label>
                <label title={t('Target ACOUSTIC slope of the mid above the crossing — the measured rolloff (driver + filter), not the electrical order. Falling short costs more than being steeper. Auto = free.')}>
                  {threeWay ? t('Acoustic slope mid LP (high xo)') : t('Acoustic slope mid')}
                  <select value={acSlopeMid} onChange={(e) => setAcSlopeMid(e.target.value)} disabled={!!soloDriver}>
                    <option value="auto">Auto</option>
                    {['12', '18', '24', '30', '36'].map((v) => (
                      <option key={v} value={v}>
                        {v} dB/oct
                      </option>
                    ))}
                  </select>
                </label>
                <label title={t("Target ACOUSTIC slope of the tweeter below the crossing — the classic 'acoustic 4th order at the tweeter' rule is 24 dB/oct. Check the result in 🎯 Targets. Auto = free.")}>
                  {t('Acoustic slope tweeter')}
                  <select value={acSlopeTweeter} onChange={(e) => setAcSlopeTweeter(e.target.value)} disabled={!!soloDriver}>
                    <option value="auto">Auto</option>
                    {['12', '18', '24', '30', '36'].map((v) => (
                      <option key={v} value={v}>
                        {v} dB/oct
                      </option>
                    ))}
                  </select>
                </label>
                {threeWay && (
                  <>
                    <label title={t('3-way: target ACOUSTIC slope of the WOOFER above the low crossing (its LP flank). Auto = free.')}>
                      {t('Acoustic slope woofer (low xo)')}
                      <select value={acSlopeWoofer} onChange={(e) => setAcSlopeWoofer(e.target.value)}>
                        <option value="auto">Auto</option>
                        {['12', '18', '24', '30', '36'].map((v) => (
                          <option key={v} value={v}>
                            {v} dB/oct
                          </option>
                        ))}
                      </select>
                    </label>
                    <label title={t("3-way: target ACOUSTIC slope of the MID below the low crossing (its HP flank) — the mid's second flank.")}>
                      {t('Acoustic slope mid HP (low xo)')}
                      <select value={acSlopeMidHp} onChange={(e) => setAcSlopeMidHp(e.target.value)}>
                        <option value="auto">Auto</option>
                        {['12', '18', '24', '30', '36'].map((v) => (
                          <option key={v} value={v}>
                            {v} dB/oct
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <span className="opt-group-cap">{t('Targets')}</span>
                <label title={t('Staged design (step method): HP/LP structure first; EQ bands, Zobel/LCR networks and bypass caps are only added while the targets below are unmet — the fewest components that reach the goal, with a per-stage report.')}>
                  <input
                    type="checkbox"
                    checked={stagedOn}
                    onChange={(e) => setStagedOn(e.target.checked)}
                  />{' '}
                  {t('Use as few components as possible')}
                </label>
                {stagedOn && (
                  <span className="inline-num" title={t("'Good enough' targets: stop escalating once ripple (peak ±dB, the same number the SPL strip shows) AND average phase error (°) are both met — variable per project, this is the designer's call")}>
                    ≤{' '}
                    <input
                      type="number"
                      min={0.1}
                      max={6}
                      step={0.1}
                      value={targetRipple}
                      onChange={(e) => setTargetRipple(e.target.value)}
                    />{' '}
                    ±dB
                    {/* Solo: no relative phase, so no phase target. */}
                    {!soloDriver && (
                      <>
                        {' '}·{' '}
                        <input
                          type="number"
                          min={1}
                          max={90}
                          step={1}
                          value={targetPhase}
                          onChange={(e) => setTargetPhase(e.target.value)}
                        />
                        °
                      </>
                    )}
                  </span>
                )}
                {stagedOn && (
                  <span className="derived" style={{ flexBasis: '100%' }}>
                    {t('a stopping point, not a limit — tighter means more parts and more money (it keeps escalating while unmet, and only prunes once met); looser stops sooner and builds simpler, but may leave performance on the table')}
                  </span>
                )}
                <label
                  title={t('This system plays behind room correction (Dirac Live etc.). The RIPPLE target may then be wider — on-axis residual ripple is corrected by the room system — while the PHASE targets stay exactly as they are: phase tracking across a handover is set passively and no room correction repairs it. Amplitude corrects the room; driver integration does not.')}
                >
                  <input
                    type="checkbox"
                    checked={roomCorrection}
                    onChange={(e) => {
                      setRoomCorrection(e.target.checked);
                      localStorage.setItem('ads-room-corr', e.target.checked ? '1' : '0');
                    }}
                  />{' '}
                  {t('Room correction present')}
                  {roomCorrection && (
                    <>
                      {' · '}{t('ripple target')}{' '}
                      <input
                        type="number"
                        min={1}
                        max={8}
                        step={0.5}
                        value={roomRippleDb}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const nv = Number.isFinite(v) && v > 0 ? v : 3.5;
                          setRoomRippleDb(nv);
                          localStorage.setItem('ads-room-ripple', String(nv));
                        }}
                        style={{ width: '4rem' }}
                      />{' '}dB
                    </>
                  )}
                </label>
                {roomCorrection && (
                  <span className="derived" style={{ flexBasis: '100%' }}>
                    {t('amplitude corrects the room, driver integration does not — ripple target now {r} dB, phase target unchanged', { r: rippleTargetEff().toFixed(1) })}
                  </span>
                )}
                <label
                  className="inline-num"
                  title={t('B2 — cost pressure in the catalog snap: candidate score ×(1 + w·ΣEUR). A tiebreak between near-equal purchasable realisations, never a quality trade. Until Aug 2026 this knob was not wired from the UI — the tuner silently ran 0.0015.')}
                >
                  {t('Snap cost pressure')}
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.0005}
                    value={costWeight}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const nv = Number.isFinite(v) && v >= 0 ? v : 0.015;
                      setCostWeight(nv);
                      localStorage.setItem('ads-cost-weight', String(nv));
                    }}
                    style={{ width: '5rem' }}
                  />
                </label>
                <label
                  className="inline-num"
                  title={t('B1 — BOM cap per channel. Above it a scan candidate loses a ranking class (same mechanism as the Z floor and the source-R limit) — a decision, not a weight. 0 = off. Unpriced candidates are never punished; missing prices show as [NO PRICE].')}
                >
                  {t('BOM cap per channel')} €
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={10}
                    value={bomCapEur}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const nv = Number.isFinite(v) && v >= 0 ? v : 0;
                      setBomCapEur(nv);
                      localStorage.setItem('ads-bom-cap', String(nv));
                    }}
                    style={{ width: '5rem' }}
                  />
                  {bomCapEur === 0 && <span className="derived"> {t('off')}</span>}
                </label>
                <span className="opt-group-cap">{t('Safety nets')}</span>
                <label title={t('Stopband leakage beside the crossover must stay ≥20 dB below the combined — cone-breakup phase cannot be filtered away, it can only be made irrelevant in level')}>
                  <input
                    type="checkbox"
                    checked={breakupGuard}
                    onChange={(e) => setBreakupGuard(e.target.checked)}
                    disabled={!!soloDriver}
                  />{' '}
                  {t('Keep cone breakup ≥20 dB down')}
                </label>
                <span className="opt-group-cap">{t('Engine')}</span>
                <label title={t('Engine v2 (experimental) — spec F1/F2. Switches on the measurement-ingest pass, the metric library, the pre-design blocks AND the hard gates: M-A dissipation, M-B EPDR beside the plain |Z| floor, M-C drive on a driver’s resonance. Turning it on arms no limit by itself — every gate and every budget below is blank until you state one. With it off the app behaves exactly as it always has.')}>
                  <input
                    type="checkbox"
                    checked={engineV2Enabled}
                    onChange={(e) => setEngineV2Enabled(e.target.checked)}
                  />{' '}
                  {t('Engine v2 (experimental) — metrics + hard gates')}
                </label>
                {engineV2Enabled && (
                  <>
                    <label title={t('Observation angles the vertical-lobing synthesis (M-F) evaluates, in degrees off the reference axis. Comma separated, e.g. "-15, 15". Empty = the metric stays off and says so.')}>
                      {t('Vertical window °')}
                      <input
                        type="text"
                        value={engineV2Settings.verticalWindowDeg}
                        placeholder="-15, 15"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, verticalWindowDeg: e.target.value }))
                        }
                        style={{ width: '6rem' }}
                      />
                    </label>
                    <label title={t('Amplifier power the dissipation metric (M-A) converts its fraction into watts with. Empty = only the fraction is reported, which is scale-free anyway.')}>
                      {t('Amplifier power W')}
                      <input
                        type="number"
                        min={0}
                        value={engineV2Settings.amplifierPowerW}
                        placeholder="100"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, amplifierPowerW: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>

                    {/* ---- F2: the GATES (A4 M-A/M-B/M-C, spec A2 P2/P4) ----
                      * Every one of these is blank by default and blank means
                      * ABSENT, not zero and not a default: the gate is off,
                      * the report still shows what the design reads, and it
                      * says "no limit set" beside it. The `placeholder` text
                      * is a GHOST — a suggestion the designer can see and the
                      * engine never receives (P4). Type nothing and nothing
                      * judges the design. */}
                    <span className="opt-group-cap">{t('Engine v2 — hard gates')}</span>
                    <label title={t('M-A — the largest share of the amplifier power that may be burnt in the filter resistors, IEC-weighted. A hard gate: no candidate and no polish step may exceed it, whatever it wins elsewhere. Empty = no limit; the percentage is still reported.')}>
                      {t('Max dissipation %')}
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={engineV2Settings.maxDissipationPct}
                        placeholder="35"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, maxDissipationPct: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>
                    <label title={t('M-B — the EPDR floor in ohms: |Z|/(2·cos²φ), the resistance that would cost the output devices the same peak dissipation as this reactive load does. Independent of the amplifier rating above, which stays the plain |Z| floor; both are judged by one rule. Empty = no limit.')}>
                      {t('Min EPDR Ω')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={engineV2Settings.minEpdrOhm}
                        placeholder="1.6"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, minEpdrOhm: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>
                    <label title={t('M-C — the largest drive voltage on a driver’s own resonance, in dB relative to that way’s passband (so −18 means "at least 18 dB down"). Applies to every way the CIRCUIT high-passes, derived from the branch transfers rather than from a list of names. Empty = no limit.')}>
                      {t('Max drive on f_s dB')}
                      <input
                        type="number"
                        max={0}
                        value={engineV2Settings.maxDriveOnFsDb}
                        placeholder="-18"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, maxDriveOnFsDb: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>
                    {/* ---- V49: M-C v2.0 — the limit DERIVED from excursion ----
                      * Three stated numbers, none defaulted. With all three
                      * and a driver card (Sd/Xmax on the Setup tab, Bl/M_ms in
                      * the per-branch measurement block) the report derives a
                      * ceiling per way from the measured resonance, and the
                      * STRICTER of that ceiling and the stated dB figure
                      * judges. The ghosts below are what is customary, never
                      * a value. */}
                    <label title={t('M-C v2.0 — the amplifier\'s brief PEAK power (e.g. its IHF dynamic rating), W. With the nominal load beside it this sets the peak input voltage √2·√(P·R) the excursion requirement is judged at: on that voltage every high-passed way must keep its cone within X_max × margin on its own resonance. Empty = no derived limit; the stated dB figure alone judges.')}>
                      {t('Amplifier peak power W')}
                      <input
                        type="number"
                        min={0}
                        value={engineV2Settings.amplifierPeakPowerW}
                        placeholder="160"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, amplifierPeakPowerW: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>
                    <label title={t('M-C v2.0 — the load the peak power is specified into, Ω. Together with the peak power it gives the peak input voltage. Empty = no derived limit.')}>
                      {t('Nominal load Ω')}
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={engineV2Settings.amplifierNominalLoadOhm}
                        placeholder="8"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, amplifierNominalLoadOhm: e.target.value }))
                        }
                        style={{ width: '4rem' }}
                      />
                    </label>
                    <label title={t('M-C v2.0 — the fraction of X_max a design may use on the resonance. X_max is a geometric figure (coil overhang); distortion rises quickly above it, and manufacturers define it differently, so a fraction below 1 is customary. Empty = no derived limit.')}>
                      {t('X_max margin')}
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={engineV2Settings.xmaxMarginFraction}
                        placeholder="0.8"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, xmaxMarginFraction: e.target.value }))
                        }
                        style={{ width: '4rem' }}
                      />
                    </label>

                    {/* ---- V50: BUILDABILITY — the parts on the schematic have
                      * to be buyable. Two gates: the watts in each resistor
                      * against the class it is built with (times the margin),
                      * and the peak current through each cored coil against
                      * its saturation figure. With the catalogue snap ON a
                      * rated SKU is judged on its own rating instead. Blank =
                      * the figures are still shown, nothing judges. */}
                    <label title={t('M-A/part (V50) — the power rating of the resistor series you build with, W continuous (e.g. 10 W for MOX/Superes, 20 W for MResist Supreme). Every discrete resistor is judged against this class × the margin, at the continuous amplifier power above; a resistor snapped to a rated catalogue part is judged on that part\'s rating instead. Blank = no allowance, nothing judged, watts still shown.')}>
                      {t('Resistor class W')}
                      <input
                        type="number"
                        min={0}
                        value={engineV2Settings.resistorClassW}
                        placeholder="10"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, resistorClassW: e.target.value }))
                        }
                        style={{ width: '4rem' }}
                      />
                    </label>
                    <label title={t('M-A/part (V50) — the fraction of its rating a filter resistor may run at. A resistor inside a closed cabinet without airflow runs hot at half its rating; how much of that you accept is your decision, so there is no default. Blank = no allowance, nothing judged.')}>
                      {t('Resistor margin')}
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={engineV2Settings.resistorPowerMargin}
                        placeholder="0.5"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, resistorPowerMargin: e.target.value }))
                        }
                        style={{ width: '4rem' }}
                      />
                    </label>
                    <label title={t('M-L (V50) — the saturation / maximum current of the CORED coils you build with, A. The peak current through every coil at the amplifier\'s peak input (peak power × nominal load, above) is judged against it; a coil snapped to a rated catalogue part is judged on that rating instead. Air-cored coils have no saturation current and are never judged. Blank = nothing judged, the currents are still shown.')}>
                      {t('Coil current class A')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={engineV2Settings.coilClassA}
                        placeholder="—"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, coilClassA: e.target.value }))
                        }
                        style={{ width: '4rem' }}
                      />
                    </label>
                    {/* V51 — the THERMAL DESIGN POWER: thermal load is a mean
                      * over the listening time, and the amplifier's continuous
                      * rating above is what it CAN deliver, not what the
                      * design runs at. Blank = the gate judges at the rating
                      * (V50); the watt column keeps printing at the rating. */}
                    <label title={t('M-A/part (V51) — the average listening power, W, the per-resistor watts are JUDGED at. Blank = judged at the amplifier power above (V50). The watts shown in the M-A column stay at the amplifier power either way; the gate row says which power it read.')}>
                      {t('Thermal design power W')}
                      <input
                        type="number"
                        min={0}
                        value={engineV2Settings.resistorThermalPowerW}
                        placeholder="10"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, resistorThermalPowerW: e.target.value }))
                        }
                        style={{ width: '4rem' }}
                      />
                    </label>
                    {/* V51 — the TOPOLOGY requirement on the lowest way. A
                      * choice, not a limit: it reaches the design and synthesis
                      * steps, which then place no pad there; a candidate that
                      * cannot reach its ripple goal without one comes back as a
                      * refusal naming how much level work the configuration
                      * asks (the A5d.4 gap to the anchor). */}
                    <label title={t("V51 — 'none': the LOWEST way may carry no level work — no resistor in its series path and no shunt pad on it; what remains is the coil's DCR. The rule of thumb: never pad the woofer (heat, impedance, damping), pad the mid or tweeter instead. The report shows how far the lowest way sits above the anchor (that is the level work the configuration asks), what series wiring would deliver of it and what the baffle step does by itself. Not stated = the search keeps its own behaviour (the lowest way is trimmed down to the quietest way with a pad).")}>
                      {t('Level work on lowest way')}
                      <select
                        value={engineV2Settings.lowestWayLevelWork}
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, lowestWayLevelWork: e.target.value }))
                        }
                      >
                        <option value="">{t('not stated')}</option>
                        <option value="none">{t('none (no series R, no shunt pad)')}</option>
                        <option value="series-r-max">{t('series R up to a maximum, no pad')}</option>
                      </select>
                    </label>
                    {/* V51b — the maximum that makes 'series-r-max' a statement:
                      * the TOTAL series resistance the lowest way's driver may
                      * see in its path, discrete resistors plus coil DCR. An
                      * air-core coil with that DCR is that resistor. */}
                    {engineV2Settings.lowestWayLevelWork === 'series-r-max' && (
                      <label title={t("V51b — the maximum TOTAL series resistance on the lowest way, Ω: discrete resistors plus every series coil's DCR. The search may place and value one plain series resistor up to it (no L-pad, no shunt pad, no bypassed pad); a candidate whose impedance floor asks more comes back as a refusal naming how much. An air-core coil whose DCR is this value does the same as the resistor — a build choice, not an engine decision. Empty = the state cannot be stated and reads as not stated.")}>
                        {t('Max series R on lowest way (Ω)')}
                        <input
                          type="number"
                          step="0.1"
                          min={0}
                          value={engineV2Settings.lowestWaySeriesRMaxOhm}
                          placeholder="—"
                          onChange={(e) =>
                            setEngineV2Settings((v) => ({ ...v, lowestWaySeriesRMaxOhm: e.target.value }))
                          }
                          style={{ width: '4rem' }}
                        />
                        {engineV2Gates.lowestWayLevelWork === undefined && (
                          <span className="v2-warn"> {t('no maximum — reads as not stated')}</span>
                        )}
                      </label>
                    )}

                    {/* ---- F2: the SEARCH-SPACE BUDGETS (spec A5d.6) ----
                      * These do not judge a design; they are inverted through
                      * the measured impedance and near field into ceilings on
                      * component values, so the search never visits ground the
                      * budget forbids. Blank = that bound is off and the box
                      * is exactly the app's own. */}
                    <span className="opt-group-cap">{t('Engine v2 — search-space budgets')}</span>
                    <label title={t('How much extra low-frequency lift the filter and the source impedance may add on top of the bare driver-in-box behaviour (M-D). Inverted through the measured impedance peak and near field into a maximum series inductance. Empty = no bound.')}>
                      {t('LF lift budget dB')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={engineV2Settings.lfBumpBudgetDb}
                        placeholder="2.5"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, lfBumpBudgetDb: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>
                    <label title={t('The largest factor the filter’s source resistance may multiply Q_es by (M-E). Inverted exactly into a maximum TOTAL series resistance in the lowest path: R_s ≤ R_e·(q−1). Needs the driver’s measured DC resistance. Empty = no bound.')}>
                      {t('Max Q_es ×')}
                      <input
                        type="number"
                        min={1}
                        step={0.1}
                        value={engineV2Settings.qesMultiplierMax}
                        placeholder="1.5"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, qesMultiplierMax: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>
                    <label title={t('How much attenuation a way may spend ON TOP OF its measured sensitivity gap to the anchor (A5d.4). Inverted into a maximum pad resistance against that way’s own passband impedance. Empty = no bound.')}>
                      {t('Damping margin dB')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={engineV2Settings.dampingMarginDb}
                        placeholder="0.5"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, dampingMarginDb: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>

                    {/* ---- F3: the REQUIREMENTS (spec A5e.1) ----
                      * Acceptance limits on the OUTCOME, and the third kind of
                      * number in this panel: a gate protects the hardware and
                      * is never relaxed, a budget shapes the search box, and a
                      * requirement decides which finished designs you are
                      * shown. Blank = not asked. There is no weight here and
                      * there is none anywhere else either — the engine returns
                      * everything that qualifies and you pick. */}
                    <span className="opt-group-cap">{t('Engine v2 — requirements')}</span>
                    <label title={t('The SPL window you will accept, in ±dB against the target curve, judged peak-to-peak on the 1/6-octave-smoothed system response. Narrow features fall outside this judgement on purpose: narrow peaks are reported in their own column, narrow dips are forgiven. Empty = not asked; the value is still shown.')}>
                      {t('SPL window ±dB')}
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={engineV2Settings.splWindowPlusMinusDb}
                        placeholder="1.5"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, splWindowPlusMinusDb: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>
                    <label title={t('The largest phase-tracking error you will accept in a crossover region, in degrees — mean |Δφ| over ±1 octave, clipped to measurement validity. Judged PER handover: a three-way that tracks well at one and badly at the other has not met it. Empty = not asked.')}>
                      {t('Max phase error °')}
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={engineV2Settings.maxPhaseTrackingDeg}
                        placeholder="5"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, maxPhaseTrackingDeg: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>
                    <label title={t('How many designs the shortlist holds. They are spread over topology classes first (order per flank, polarity included) and then over normalised component space — different designs, not variations of one. Empty = 10.')}>
                      {t('Shortlist size')}
                      <input
                        type="number"
                        min={1}
                        value={engineV2Settings.shortlistSize}
                        placeholder="10"
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, shortlistSize: e.target.value }))
                        }
                        style={{ width: '5rem' }}
                      />
                    </label>
                    {/* ---- A5e.2 — THE VOICING (UI-1) ----
                      * The fourth kind of number in this panel and the only one
                      * that is not a limit: a gate protects the hardware, a
                      * budget shapes the search box, a requirement decides which
                      * finished designs you are shown — and this decides what
                      * "flat" MEANS for all three of them.
                      *
                      * V45 gave the engine `bass-plateau`, made the curve steer
                      * the search as well as the verdict, and closed A5e.2 on
                      * it. What V45 did NOT do was give anyone a way to state
                      * one: the app read `activeDesign.targetCurve` in four
                      * places and wrote it in none, the persistence type did not
                      * know the shape, and this line printed "Target curve:
                      * flat" as a fact about every run ever made. Sander went
                      * looking for the field and there was no field.
                      *
                      * ON THE DESIGN AND NOT ON THE PROJECT (A5e.2): two
                      * voicings of one loudspeaker have to sit side by side and
                      * be compared, so this control writes to the design tab
                      * that is open and Save-as-new keeps a voicing with it. */}
                    <span className="opt-group-cap">{t('Engine v2 — voicing (A5e.2)')}</span>
                    <label title={t('The reference every window, RMS and search judges against. FLAT is the neutral reference, not a missing answer. BASS PLATEAU is the on-axis voicing of a speaker meant to stand near a wall: the bass sits deliberately below the flat part, and the wall fills it back in. It hangs on the DESIGN, so two voicings of one loudspeaker can be compared side by side.')}>
                      {t('Target curve')}
                      <select
                        value={activeTargetCurve.type}
                        disabled={!activeDesign}
                        onChange={(e) => {
                          const type = e.target.value as TargetCurve['type'];
                          if (!activeDesign) return;
                          setDesigns((ds) =>
                            ds.map((d) =>
                              d.id !== activeDesign.id
                                ? d
                                : type === 'flat'
                                  ? { ...d, targetCurve: { type: 'flat' } }
                                  : {
                                      ...d,
                                      targetCurve: {
                                        ...(d.targetCurve ?? {}),
                                        type,
                                      },
                                    },
                            ),
                          );
                        }}
                      >
                        <option value="flat">{t('flat')}</option>
                        <option value="bass-plateau">{t('bass plateau')}</option>
                      </select>
                    </label>
                    {activeTargetCurve.type === 'bass-plateau' && (
                      <label title={t('How far BELOW the flat part the bass is meant to sit, in dB — a positive depth. STATED: it is a decision about where this loudspeaker will stand and no measurement can produce it. The TRANSITION is not asked for here: it is the baffle step of your cabinet front, derived from the width in the Cabinet form and from nothing else. Empty = the curve produces no offsets and says which half was missing.')}>
                        {t('Bass plateau depth dB')}
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={
                            activeTargetCurve.plateauDepthDb === undefined
                              ? ''
                              : String(activeTargetCurve.plateauDepthDb)
                          }
                          placeholder="2.5"
                          onChange={(e) => {
                            if (!activeDesign) return;
                            const raw = e.target.value;
                            const v = Number(raw);
                            setDesigns((ds) =>
                              ds.map((d) => {
                                if (d.id !== activeDesign.id) return d;
                                const base = { ...(d.targetCurve ?? {}), type: 'bass-plateau' as const };
                                // An empty field is ABSENT, never zero: a
                                // plateau of 0 dB is a stated voicing that
                                // happens to be flat, and "not stated yet" is
                                // a different thing to say (P4).
                                if (raw.trim() === '' || !Number.isFinite(v) || v < 0) {
                                  const { plateauDepthDb: _drop, ...rest } = base;
                                  void _drop;
                                  return { ...d, targetCurve: rest };
                                }
                                return { ...d, targetCurve: { ...base, plateauDepthDb: v } };
                              }),
                            );
                          }}
                          style={{ width: '5rem' }}
                        />
                      </label>
                    )}
                    <span className="derived" style={{ fontSize: '0.85em' }}>
                      {t('Target curve')}: {describeTargetCurve(activeTargetCurve)}
                      {!activeDesign && ` — ${t('open a design tab to state one')}`}
                    </span>

                    {/* ---- F2: determinism (spec A5e.4) ---- */}
                    <span className="opt-group-cap">{t('Engine v2 — run')}</span>
                    <label title={t('The run seed. Same input and same seed give a byte-identical result. This is the ONE setting where blank does not mean off: blank uses the published default and reports it, because "no seed" would mean "not reproducible".')}>
                      {t('Run seed')}
                      <input
                        type="number"
                        value={engineV2Settings.runSeed}
                        placeholder={String(DEFAULT_RUN_SEED)}
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, runSeed: e.target.value }))
                        }
                        style={{ width: '7rem' }}
                      />
                    </label>
                    <label title={t('Objective evaluations the search may spend per starting point. Empty = the tuner’s own policy, exactly as a v1 run. A budget bounds effort, never what counts as acceptable.')}>
                      {t('Budget (evals)')}
                      <input
                        type="number"
                        min={0}
                        value={engineV2Settings.runBudgetEvals}
                        placeholder={t('tuner')}
                        onChange={(e) =>
                          setEngineV2Settings((v) => ({ ...v, runBudgetEvals: e.target.value }))
                        }
                        style={{ width: '6rem' }}
                      />
                    </label>
                  </>
                )}
                <span className="opt-group-cap">{t('Components')}</span>
                <label
                  style={{ opacity: hasImportedCatalog() ? 1 : 0.5 }}
                  title={
                    hasImportedCatalog()
                      ? t('Snap the passive build to purchasable catalog values, simulated with their real DCR/ESR — the fit error against real parts becomes visible instead of assumed away')
                      : t('Import a catalog first — without one there are no real parts to snap to, so the design keeps theoretically ideal (continuous) values')
                  }
                >
                  <input
                    type="checkbox"
                    checked={catalogSnap && hasImportedCatalog()}
                    disabled={!hasImportedCatalog()}
                    onChange={(e) => setCatalogSnap(e.target.checked)}
                  />{' '}
                  {t('Use real catalog parts')}{!hasImportedCatalog() && ` ${t('(needs import)')}`}
                </label>
                <span className="opt-group-cap">{t('Crossover')}</span>
                <label title={t('Pin the ACOUSTIC crossover: the frequency where the filtered drivers actually cross must land within frequency ± margin — in the design optimizer AND the component tuner. Margin 0 = exactly there (±2% search room remains).')}>
                  <input
                    type="checkbox"
                    checked={xoRangeOn}
                    onChange={(e) => setXoRangeOn(e.target.checked)}
                    disabled={!!soloDriver}
                  />{' '}
                  {threeWay ? t('Crossover points (low + high)') : t('Crossover point')}
                </label>
                {tweeterHpFloor !== null && (
                  <span
                    className="derived"
                    title={t("Hard floor for the tweeter's electrical HP knee: the classic ≥2×Fs rule, read from the measured impedance peak. Knee-domain — coexists with the crossover point.")}
                  >
                    {t('tweeter kept above {n} Hz (2× its measured resonance)', { n: tweeterHpFloor })}
                  </span>
                )}
                {threeWay && (
                  <label title={t('How the 3-way scan searches the two handovers. Axis by axis: sweep W-M (M-T held at its anchor), then M-T with the best W-M, then a local 3×3 refinement around the pair (skipped when the sweeps show no coupling) — finer per axis for far fewer chains than a grid of the same resolution. Grid: every corner combination.')}>
                    {t('Scan strategy')}
                    <select
                      value={scan3Mode}
                      onChange={(e) => {
                        const v = e.target.value === 'grid' ? 'grid' : 'axes';
                        setScan3Mode(v);
                        localStorage.setItem('ads-scan3-mode', v);
                      }}
                    >
                      <option value="axes">{t('axis by axis (W-M sweep → M-T sweep → refine)')}</option>
                      <option value="grid">{t('grid (corners)')}</option>
                    </select>
                  </label>
                )}
                {threeWay && (
                  <label title={scan3Mode === 'axes'
                    ? t('Points per axis for the sweeps: 3/5/7 — the W-M sweep runs that many chains, the M-T sweep as many again, the refinement up to 9 more.')
                    : t('How many handover candidates the 3-way scan simulates PER crossing. Each candidate runs the full design chain inside its own slice of the search range, so the count is squared: 2 steps = 4 chains. Works pinned or unpinned — without a pin the range is the neighbourhood of the raw crossings.')}>
                    {scan3Mode === 'axes' ? t('Points per axis') : t('Handover candidates to try')}
                    <select value={xo3Steps} onChange={(e) => setXo3Steps(Number(e.target.value))}>
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {scan3Mode === 'axes'
                            ? `${1 + 2 * n} (${2 * (1 + 2 * n)}–${2 * (1 + 2 * n) + 9} sims)`
                            : `${n} (${n * n} sim${n * n > 1 ? 's' : ''})`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {threeWay && physWin3 && (
                  <span
                    className="derived"
                    style={{ flexBasis: '100%' }}
                    title={t('The free scan searches the INTERSECTION of every physical limit: data floor (2/gate, or the near-field splice), array lobing of a multi-driver branch, centre-to-centre spacing (λ/N), the lower driver\'s breakup / N and its measured beaming, K× the upper driver\'s in-situ fs, its excursion floor, and where it reaches level. Each edge names the rule that set it. A pin replaces the physics rules but never the data floor.')}
                  >
                    {(['low', 'high'] as const).map((side) => {
                      const w = physWin3.win[side];
                      const naam = side === 'low' ? 'W-M' : 'M-T';
                      const fmt = (l: { hz: number; label: string } | null) =>
                        l ? `${l.label} → ${Math.round(l.hz)} Hz` : t('rail');
                      const others = w.limits.filter(
                        (l) => l !== w.floorBy && l !== w.ceilBy && l.rule !== 'user',
                      );
                      return (
                        <span key={side} style={{ display: 'block' }}>
                          <strong>
                            {naam} {Math.round(w.floorHz ?? 0)}–{Math.round(w.ceilHz ?? 0)} Hz
                          </strong>
                          {' · '}
                          {t('floor')}: {fmt(w.floorBy)} · {t('ceiling')}: {fmt(w.ceilBy)}
                          {others.length > 0 && (
                            <span style={{ opacity: 0.75 }}>
                              {' · '}
                              {t('also')}:{' '}
                              {others
                                .map((l) => `${l.label} ${Math.round(l.hz)}${l.overridden ? ` (${t('overridden by your pin')})` : ''}`)
                                .join(' · ')}
                            </span>
                          )}
                          {physWin3.diAnchor[side] !== null && (
                            <span style={{ display: 'block', opacity: 0.85 }}>
                              {t('DI match')} ≈ {Math.round(physWin3.diAnchor[side]!)} Hz
                              {' — '}
                              {w.floorHz !== null && w.ceilHz !== null &&
                              physWin3.diAnchor[side]! >= w.floorHz &&
                              physWin3.diAnchor[side]! <= w.ceilHz
                                ? t('inside the window, seeded as a candidate')
                                : t('outside the window (shown, not seeded)')}
                            </span>
                          )}
                          {w.banner && (
                            <strong style={{ display: 'block' }}>
                              ⚠ {w.banner}
                            </strong>
                          )}
                        </span>
                      );
                    })}
                    <span style={{ display: 'block', marginTop: '0.2rem' }}>
                      {t('thresholds')}:{' '}
                      <span className="inline-num" title={t('Rule 2 — array lobing ceiling = k · c / spacing of a multi-driver branch. 0.5 = the spacing reaches λ/2 (first forward null).')}>
                        {t('array k')}{' '}
                        <input type="number" min={0.25} max={1.5} step={0.05} value={xoWinThr.arrayK} onChange={(e) => setXoWinThrField('arrayK', Number(e.target.value))} style={{ width: '3.6rem' }} />
                      </span>{' '}
                      <span className="inline-num" title={t('Rule 3 — centre-to-centre ceiling: the spacing between the two drivers of a handover may not exceed λ/N. Auto = by axis: a vertical stack λ/1 (its first null lands at ±30° vertical — floor and ceiling, not the listening plane), side by side λ/2 (the null would sit in the listening plane), mixed in between.')}>
                        λ/
                        <select
                          value={xoWinThr.ctcLambdaDiv === 'auto' ? 'auto' : String(xoWinThr.ctcLambdaDiv)}
                          onChange={(e) => setXoWinThrField('ctcLambdaDiv', e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
                        >
                          <option value="auto">{t('auto (by axis)')}</option>
                          {['1', '1.2', '1.5', '2', '3'].map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </span>{' '}
                      <span className="inline-num" title={t('Rule 4 — breakup margin: set under Driver limits ("Breakup margin — candidate window").')}>
                        {t('breakup')} /{xoWinThr.breakupDiv}
                      </span>{' '}
                      <span className="inline-num" title={t('Rule 5 — resonance floor: the upper driver\'s handover sits at least K × its in-situ fs (from the ZMA). 2 with an Fs LCR trap in the design, 3 without.')}>
                        fs ×
                        <input type="number" min={1} max={5} step={0.5} value={xoWinThr.fsK} onChange={(e) => setXoWinThrField('fsK', Number(e.target.value))} style={{ width: '3.6rem' }} />
                      </span>
                    </span>
                  </span>
                )}
                {xoRangeOn && threeWay && (
                  <span
                    className="inline-num"
                    title={t('3-way: the LOW handover (woofer→mid) — the acoustic crossing must land within frequency ± margin, in the design chain AND the component tuner.')}
                  >
                    {t('low') + ' '}
                    <input
                      type="number"
                      min={150}
                      max={2000}
                      step={50}
                      value={xoLowFreqHz}
                      onChange={(e) => setXoLowFreqHz(e.target.value)}
                    />
                    {' Hz ± '}
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      step={25}
                      value={xoLowMarginHz}
                      onChange={(e) => setXoLowMarginHz(e.target.value)}
                    />{' '}
                    Hz
                  </span>
                )}
                {xoRangeOn && (
                  <span
                    className="inline-num"
                    title={t('The ACOUSTIC handover — where the filtered drivers actually cross — must land within frequency ± margin. The electrical knees stay free (with a hot tweeter they sit far above the acoustic crossing).')}
                  >
                    {threeWay ? t('high') + ' ' : ''}
                    <input
                      type="number"
                      min={300}
                      max={12000}
                      step={100}
                      value={xoFreqHz}
                      onChange={(e) => setXoFreqHz(e.target.value)}
                    />
                    {' Hz ± '}
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      step={50}
                      value={xoMarginHz}
                      onChange={(e) => setXoMarginHz(e.target.value)}
                    />{' '}
                    Hz
                    {/* Candidate count: 2-way sweeps ONE axis from here; 3-way
                        has its own per-crossing control above (two axes, and
                        it must work unpinned too). */}
                    {!threeWay && (
                      <>
                        {' · '}
                        <select
                          value={xoScanSteps}
                          onChange={(e) => setXoScanSteps(Number(e.target.value))}
                          title={t('How many crossover candidates the scan simulates across the pinned range (evenly spaced, your pin always included). Every candidate runs the FULL design chain, so compute grows about linearly — the worker pool runs several at once, but 9 steps still takes a multiple of 3. More steps = a finer sweep of the handover region.')}
                        >
                          {[3, 5, 7, 9].map((n) => (
                            <option key={n} value={n}>
                              {t('{n} steps', { n })}
                            </option>
                          ))}
                        </select>
                        {xoScanSteps > 3 && (
                          <span className="derived"> ⏱ ~{Math.max(1, Math.ceil(xoScanSteps / poolSize()))}× {t('runtime')}</span>
                        )}
                      </>
                    )}
                  </span>
                )}
                {/* DELIVERABLES 1 + 2 — the A5d.3 window beside the fields
                  * it is about.
                  *
                  * The markup lives in `XoWindowAnnotation` so the toggle
                  * invariant is testable at runtime rather than only by
                  * reading this file: one component, one entry condition, and
                  * `pairs === null` renders nothing at all. It sits BESIDE the
                  * physics annotation above rather than replacing it — two
                  * different derivations of "where may this crossing go", and
                  * the app has no business quietly picking one. */}
                <XoWindowAnnotation
                  pairs={v2WindowPairs}
                  onTakeOver={(key) => takeOverV2Window(key as 'low' | 'high')}
                  onTakeOverRecommended={(key, segment) =>
                    takeOverV2Recommended(key as 'low' | 'high', segment)
                  }
                  smoothing={v2Smoothing}
                  t={t}
                />
                <span className="opt-group-cap">{t('Driver limits')}</span>
                {threeWay && !physWin3?.lowCeilMeasured &&
                  pistonDiameterMm(Number(sdCm2.low)) === null && (
                  <label title={t("Woofer nominal size — sets the W-M handover's beaming CEILING (a cone is practically usable to ~3× its beaming onset), the mirror of the mid-size rule for the high crossing. With the 2×Fs floor from the measured mid impedance this gives the free scan a physics window instead of a guess.")}>
                    {t('Woofer size (W-M ceiling)')}
                    <select value={wooferSizeInch} onChange={(e) => setWooferSizeInch(e.target.value)}>
                      <option value="">{t('unknown')}</option>
                      {['5', '6.5', '8', '10', '12', '15'].map((v) => (
                        <option key={v} value={v}>
                          {v}"
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {threeWay && (
                  <label title={t("Directivity philosophy for the MEASURED beaming ceiling — the on-axis minus 30° difference at which a driver counts as beaming. Default is the empirical 4 dB, NOT the theoretically stricter ka = 2, and that is deliberate: the ka figures come from an ideal piston in an infinite baffle, while a real measured 0−30° difference at low frequency is mostly baffle diffraction. Measured on a real 3-way set, ka = 2 puts the woofer's ceiling at 304 Hz — below the mid's own 2×Fs floor — declaring an ordinary design impossible; 4 dB gives 628 Hz. The strict tiers stay available for a conservative philosophy or clean anechoic data. (For reference: '−6 dB at 30°' is ka = 4.43, past every published limit — that defines BEAMWIDTH, not a crossover ceiling.)")}>
                    {t('When a cone counts as beaming')}
                    <select value={kaTier} onChange={(e) => setKaTier(e.target.value as KaTier)}>
                      {(Object.keys(KA_TIERS) as KaTier[]).map((k) => (
                        <option key={k} value={k}>
                          {k} — ka {KA_TIERS[k].ka} ({KA_TIERS[k].diff30Db} dB)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {threeWay && (
                  <span
                    className="inline-num"
                    title={t("How many wavelengths of DRIVER SPACING the design tolerates. The spacing itself is derived from the driver positions you enter under Setup → Cabinet & drivers; two drivers half a wavelength apart already put a null in the vertical response. The sources genuinely disagree here and they optimise different things, so this is the designer's call.")}
                  >
                    {t('Lobing: how strict') + ' '}
                    <select value={ctcK} onChange={(e) => setCtcK(e.target.value)}>
                      <option value="auto">{t('auto — from driver geometry')}</option>
                      <option value="0.25">{t('0.25 — point source')}</option>
                      <option value="0.5">{t('0.5 — no forward null')}</option>
                      <option value="1">1.0 — Dickason</option>
                      <option value="1.2">{t('1.2 — Saunisto (power response)')}</option>
                    </select>
                    {ctcK === 'auto' && (
                      <span
                        className="derived"
                        title={t("Resolved per pair from the positions you entered: horizontally separated drivers lobe ACROSS the seats (strict, k 0.5 — no forward null); vertically separated ones lobe toward floor and ceiling, where Dickason's k 1.0 is the published anchor. Mixed axes interpolate. The explicit values remain as overrides.")}
                      >
                        {' '}
                        {(
                          [
                            ['W-M', cabinetInfo.ctcLowVec],
                            ['M-T', cabinetInfo.ctcHighVec],
                          ] as const
                        )
                          .filter(([, v]) => v !== null)
                          .map(([naam, v]) => {
                            const k2 = lobingKFor(v!.dxMm, v!.dyMm);
                            const as2 =
                              Math.abs(v!.dyMm) >= Math.abs(v!.dxMm) ? t('vertical') : t('horizontal');
                            return `${naam} k ${k2.toFixed(2)} (${as2})`;
                          })
                          .join(' · ') || t('enter driver positions to resolve')}
                      </span>
                    )}
                    {cabinetInfo.ctcLow !== null || cabinetInfo.ctcHigh !== null ? (
                      <span className="derived">
                        {' '}
                        c-t-c{' '}
                        {cabinetInfo.ctcLow !== null ? `W-M ${Math.round(cabinetInfo.ctcLow)}` : ''}
                        {cabinetInfo.ctcHigh !== null
                          ? ` · M-T ${Math.round(cabinetInfo.ctcHigh)}`
                          : ''}{' '}
                        mm
                      </span>
                    ) : (
                      <span className="derived"> — {t('enter driver positions to apply')}</span>
                    )}
                  </span>
                )}
                {threeWay && (
                  <label title={t('Cone breakup as an upper limit. A resonance at f_b is excited as the THIRD harmonic of a fundamental at f_b/3 (Purifi measured exactly this: breakups at 5 and 10 kHz produce HD3 peaks at 1.6 and 3.3 kHz), so the distortion penalty lands more than an octave BELOW the peak. A notch does not repair it — it attenuates the fundamental at the breakup, not the harmonics arriving there from lower fundamentals. NOTE: no published algorithm exists for finding breakup in an SPL curve; this is our own criterion, which is why it is switchable and the detected frequency is shown.')}>
                    {t('Breakup margin — driver card & limits (harmonic)')}
                    <select
                      value={breakupLimitOn ? breakupHarmonic : 'off'}
                      onChange={(e) => {
                        if (e.target.value === 'off') setBreakupLimitOn(false);
                        else {
                          setBreakupLimitOn(true);
                          setBreakupHarmonic(e.target.value);
                        }
                      }}
                    >
                      <option value="off">{t('off')}</option>
                      <option value="3">f_b / 3 (HD3)</option>
                      <option value="5">{t('f_b / 5 (HD5, hard cones)')}</option>
                    </select>
                  </label>
                )}
                {threeWay && (
                  <label
                    className="inline-num"
                    title={t("Breakup margin — candidate WINDOW (3-way scan): the ceiling of a handover sits at the lower driver's first breakup / N. This is a second, deliberately milder margin than the harmonic one above: the card/limits margin (f_b/3) says where the distortion penalty of a breakup lands (third harmonic), the window margin (default 1.8) says how close a handover may come to the breakup itself. Two numbers, two questions.")}
                  >
                    {t('Breakup margin — candidate window')} /
                    <input
                      type="number"
                      min={1}
                      max={4}
                      step={0.1}
                      value={xoWinThr.breakupDiv}
                      onChange={(e) => setXoWinThrField('breakupDiv', Number(e.target.value))}
                      style={{ width: '3.6rem' }}
                    />
                  </label>
                )}
                {threeWay && (
                  <span
                    className="inline-num"
                    title={t("The LEVEL this design must reach — the level-aware version of 'cross a tweeter at 2-3x Fs'. SPL = 108.4 + 20log(f²·Sd·Xmax) in half space, so a driver runs out of linear travel below f = sqrt(10^((L-108.4)/20)/(Sd·Xmax)) and the crossover floor moves up with the level you ask for. Sd and Xmax themselves are DRIVER FACTS and live on the Setup tab; this is the only part of the criterion that is a design decision.")}
                  >
                    {t('Design for') + ' '}
                    <input
                      type="number"
                      min={70}
                      max={120}
                      step={1}
                      value={excursionSpl}
                      onChange={(e) => setExcursionSpl(e.target.value)}
                    />
                    {' dB'}
                  </span>
                )}
                {threeWay && (
                  <span className="derived" style={{ flexBasis: '100%' }}>
                    {sdCm2.mid && sdCm2.high
                      ? `${t('excursion floor: mid')} ${Math.round(
                          excursionFloorHz(Number(sdCm2.mid), Number(xmaxMm.mid), Number(excursionSpl), {
                            count: Number(cabinet.drivers.mid.count) || 1,
                          }) ?? 0,
                        )} Hz · ${t('tweeter')} ${Math.round(
                          excursionFloorHz(Number(sdCm2.high), Number(xmaxMm.high), Number(excursionSpl), {
                            count: Number(cabinet.drivers.high.count) || 1,
                          }) ?? 0,
                        )} ${t('Hz — from the Sd/Xmax on the Setup tab')}`
                      : t('enter Sd and Xmax per driver on the Setup tab to use this criterion')}
                  </span>
                )}
                {vfEqBands > 4 && (
                  <span className="derived">
                    {t('{a} bands = {b} search dimensions — slower, may need a second run', { a: vfEqBands, b: 3 + 6 * vfEqBands })}
                  </span>
                )}
              </div>
            )}
            {vfError && <p className="error">{vfError}</p>}
            {vfOpt && uiMode === 'guided' && (
              /* Success register for the guided flow: after minutes of
                 optimizing, the first line must say it worked and where to go
                 next — the technical summary below stays for the curious. */
              <p className="result-good">
                ✓ {t('Design ready — the charts on the right show it now.')}{' '}
                <strong>{t('Next: Your build')}</strong> {t('has the schematic and the parts list.')}
              </p>
            )}
            {vfOpt && (
              <p className="vf-opt-summary">
                {t('Optimizer chose:')} LP {vfOpt.structure.wooferLpKind}
                {vfOpt.structure.wooferLpOrder} ({vfOpt.structure.wooferLpOrder * 6} dB/oct) @{' '}
                {Math.round(vfOpt.specs.woofer.lp.freq)} Hz · HP {vfOpt.structure.tweeterHpKind}
                {vfOpt.structure.tweeterHpOrder} ({vfOpt.structure.tweeterHpOrder * 6} dB/oct) @{' '}
                {Math.round(vfOpt.specs.tweeter.hp.freq)} Hz · {t('tweeter')}{' '}
                {vfOpt.specs.tweeter.gainDb.toFixed(1)} dB · {t('polarity')}{' '}
                {vfOpt.inverted ? t('inverted') : t('normal')} · {t('EQ used:')}{' '}
                {vfOpt.bandsUsed.woofer}+{vfOpt.bandsUsed.tweeter} — {t('ripple')}{' '}
                {vfOpt.before.responseStdDb.toFixed(2)} →{' '}
                <strong>{vfOpt.after.responseStdDb.toFixed(2)} dB</strong> · {t('phase error')}{' '}
                {vfOpt.before.avgPhaseErrDeg.toFixed(0)}° →{' '}
                <strong>{vfOpt.after.avgPhaseErrDeg.toFixed(1)}°</strong> · {t('score')}{' '}
                {vfOpt.before.integrationScore?.toFixed(0)} →{' '}
                <strong>{vfOpt.after.integrationScore?.toFixed(0)}</strong>
                {vfOpt.after.powerStdDb !== null && vfOpt.before.powerStdDb !== null && (
                  <>
                    {' '}· {t('power ripple')} {vfOpt.before.powerStdDb.toFixed(2)} →{' '}
                    <strong>{vfOpt.after.powerStdDb.toFixed(2)} dB</strong>
                  </>
                )}
                {vfRunStats && (
                  <>
                    {' '}· {vfRunStats.rounds} {t('rounds')} ·{' '}
                    {vfRunStats.evals.toLocaleString('nl-NL')} {t('sims')}
                  </>
                )}
              </p>
            )}
            {vfOpt && vfOpt.stages.length > 0 && (
              <p
                className="vf-opt-summary sub"
                title={t('What each escalation stage of the staged design bought (ripple / phase after that stage)')}
              >
                {t('Stages:')}{' '}
                {vfOpt.stages
                  .map((s) => `${s.label} → ${s.rippleDb.toFixed(2)} dB / ${s.phaseDeg.toFixed(1)}°`)
                  .join('  ·  ')}
              </p>
            )}
            <div
              className={`vf-panel${vfCollapsed ? '' : ' open'}${
                uiMode === 'guided' ? ' expert-only' : ''
              }`}
            >
              <button
                type="button"
                className="vf-collapse-head"
                aria-expanded={!vfCollapsed}
                onClick={() => setVfCollapsed((c) => !c)}
                title={
                  vfCollapsed
                    ? t('Show the per-driver filter bands (HP/LP/EQ)')
                    : t('Hide the per-driver filter bands')
                }
              >
                <span className="vf-collapse-caret">{vfCollapsed ? '▸' : '▾'}</span>
                <span>{t('Filter bands')}</span>
                {vfCollapsed && (
                  <span className="derived vf-collapse-summary">
                    {vfBypass ? t('muted') + ' · ' : ''}
                    {soloDriver
                      ? filterSummaryLine(vFilters[soloDriver], soloDriver)
                      : [
                          threeWay
                            ? filterSummaryLine(vFilters.woofer, 'woofer').replace(/^Woofer\/mid/, 'Woofer')
                            : filterSummaryLine(vFilters.woofer, 'woofer'),
                          ...(threeWay ? [filterSummaryLine(vFilters.mid, 'mid')] : []),
                          filterSummaryLine(vFilters.tweeter, 'tweeter'),
                        ].join(' — ')}
                  </span>
                )}
              </button>
              {!vfCollapsed && synthMode === 'acoustic' && (
                <p className="derived vf-mode-hint">
                  {t("Build mode is “Acoustic result”: EQ values here are seeds — a passive build re-tunes each enabled band's freq/gain/Q to flatten the measured driver. Switch to “Filter curve” to build exactly what you draw.")}
                </p>
              )}
              {!vfCollapsed && (
                <div className="vf-grid">
                  {/* Solo: only the loaded driver's block — the other slot
                      would edit a silent ghost. */}
                  {soloDriver !== 'tweeter' && (
                    <DriverFilterControls
                      title={threeWay ? t('Woofer') : t('Woofer / mid')}
                      accentVar="--viz-woofer"
                      spec={vFilters.woofer}
                      onChange={(woofer) => setVFilters((p) => ({ ...p, woofer }))}
                    />
                  )}
                  {threeWay && (
                    <DriverFilterControls
                      title={t('Midrange')}
                      accentVar="--viz-mid"
                      spec={vFilters.mid}
                      onChange={(mid) => setVFilters((p) => ({ ...p, mid }))}
                    />
                  )}
                  {soloDriver !== 'woofer' && (
                    <DriverFilterControls
                      title={t('Tweeter')}
                      accentVar="--viz-tweeter"
                      spec={vFilters.tweeter}
                      onChange={(tweeter) => setVFilters((p) => ({ ...p, tweeter }))}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {zModels.length > 0 && (
            <div className={`panel${uiMode === 'guided' ? ' expert-only' : ''}`}>
              <h2>{t('Passive synthesis')}</h2>
              <p className="sub" style={{ marginBottom: '0.8rem' }}>
                {synthMode === 'filter'
                  ? t('Builds YOUR drawn curve: the HP/LP knees and EQ bands above are the target, reproduced with real components on the measured impedances.')
                  : t('Re-designs while building: real components are fitted so the MEASURED driver comes out flat against the ideal HP/LP shape. Enabled EQ bands only grant correction slots (their freq/gain/Q are re-tuned) — the result deliberately differs from the virtual sim above.')}
              </p>
              <div className="row" style={{ marginBottom: '0.9rem' }}>
                <select
                  value={synthMode}
                  onChange={(e) => setSynthMode(e.target.value as 'filter' | 'acoustic')}
                  title={t('What this build optimises for — same setting as the dropdown next to Optimize')}
                >
                  <option value="acoustic">{t('Acoustic result (flatten measured driver)')}</option>
                  <option value="filter">{t('Filter curve (reproduce target exactly)')}</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    // Yield a frame so the busy overlay paints before the
                    // synchronous solver blocks the thread.
                    setSynthBusy(true);
                    setTimeout(() => {
                      try {
                        runSynthesis();
                      } finally {
                        setSynthBusy(false);
                      }
                    }, 30);
                  }}
                  disabled={synthBusy}
                  title={
                    threeWay
                      ? t("3-way: fits three branches on the measured impedances — woofer LP, mid BANDPASS (hp+lp), tweeter HP — and lands them as one network in a new 'Passive build' tab. Per-branch fits only: the assembled component tune (pairs) is a later step.")
                      : soloDriver
                        ? t("Single-driver mode: build the solo topology from the enabled cut bands (series traps / shelf groups + gated Zobel) with textbook seed values — lands in a new 'Solo build' tab; ⚙ Optimize components fits the values")
                        : t("Fit real components and simulate the result — lands in a new 'Passive build' tab on the Network page. Follow up with ⚙ Optimize components there to tune the assembled sum (phase!).")
                  }
                >
                  {t('Build passive filter')}
                </button>
                <span className="derived">
                  {t('uses the priority setting from ⚙ Settings')}
                </span>
              </div>
              {synth?.error && <p className="error">{synth.error}</p>}
              {synth && !synth.error && (
                <div className="vf-grid" style={{ marginTop: '1rem' }}>
                  {(['woofer', 'mid', 'tweeter'] as const).map((slot) => {
                    const r = synth[slot];
                    if (!r) return null;
                    return (
                      <div key={slot} className="synth-result">
                        <h3>
                          <span
                            className="legend-key"
                            style={{ background: `var(--viz-${slot})` }}
                          />
                          {slot === 'woofer'
                            ? synth.mid
                              ? t('Woofer')
                              : t('Woofer / mid')
                            : slot === 'mid'
                              ? t('Midrange (bandpass)')
                              : t('Tweeter')}{' '}
                          {t('branch')}
                        </h3>
                        <table>
                          <tbody>
                            {r.components.map((c) => (
                              <tr key={c.id}>
                                <td className="synth-role">
                                  {c.role}
                                  {c.catalogLabel && (
                                    <span className="derived"> — {c.catalogLabel}</span>
                                  )}
                                </td>
                                <td className="synth-value">{formatComponent(c)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="synth-fit">
                          {t('fit:')} {r.rmsDb.toFixed(2)} dB / {r.rmsDeg.toFixed(1)}° RMS
                          {r.converged ? '' : ` ${t('(not converged — treat as rough)')}`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              {synth && !synth.error && (synth.woofer || synth.tweeter) && result && (
                <SynthChart synth={synth} freq={result.freq} xDomain={xDomain} />
              )}
            </div>
          )}
        </>
            )}

            {designTab === 'network' && !result && (
              <p className="sub pane-hint">
                {t('No network to edit yet — load measurements in the Import tab first.')}
              </p>
            )}
            {designTab === 'network' && result && (
        <>
          <div className="panel">
            <h2>{t('Network editor (passive)')}</h2>
            <p
              className="sub sim-source"
              title={t("The sim's precedence: an active editor network wins over a vxp variant, which wins over the virtual filters, which win over raw drivers. Every chart on the right shows THIS.")}
            >
              {t('Charts show:')} <strong>{simSource}</strong>
            </p>
            <p className="sub" style={{ marginBottom: '0.8rem' }}>
              {t('Drag parts, draw wires, edit values — the schematic IS the network: parts connect where their points touch, and every change re-solves live on the measured impedances. Inductors carry DCR, capacitors ESR.')}
            </p>
            <div className="tool-groups" style={{ marginBottom: '0.8rem' }}>
              <div className={`tool-group${uiMode === 'guided' ? ' expert-only' : ''}`}>
                <span className="tool-group-label">{t('Start')}</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={importNetworkFromVariant}
                    disabled={!project || xoName === 'none'}
                    title={project ? t('Open the selected crossover variant in a new tab') : t('Load a vxp project first')}
                  >
                    {t('Import variant')} {xoName !== 'none' ? `(${xoName})` : ''}
                  </button>
                  <label className="file-button" title={t('Open an exported .adsfilter.json in a new tab')}>
                    {t('Import filter')}
                    <input
                      type="file"
                      accept=".json,.adsfilter"
                      onChange={importFilterFromFile}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <span
                    className="template-picker"
                    title={t('Start a fresh network in a new tab from a generic template — plausible starting values you tune from, the counterpart to Import and the optimizer')}
                  >
                    <select
                      value={threeWay ? 3 : templateWays}
                      onChange={(e) => setTemplateWays(Number(e.target.value) as WayCount)}
                      disabled={threeWay}
                      title={
                        threeWay
                          ? t('3-way mode: the template follows the loaded branch set (a 2-way template would silently skip the mid)')
                          : t('Number of ways — 3-way templates need all three branches loaded')
                      }
                    >
                      <option value={2}>{t('2-way')}</option>
                      <option value={3} disabled={!threeWay}>
                        {threeWay ? t('3-way') : t('3-way (load three drivers)')}
                      </option>
                    </select>
                    <select
                      value={soloDriver ? 0 : templateOrder}
                      onChange={(e) => setTemplateOrder(Number(e.target.value) as FilterOrder)}
                      disabled={!supportsWayCount(templateWays) || !!soloDriver}
                      title={
                        soloDriver
                          ? t('Single-driver mode — only the blank scaffold applies (LP/HP templates need two branches)')
                          : threeWay
                            ? t('Filter order / slope per branch (mid = bandpass, twice the parts) — generic Butterworth-style seed values at 600 / 3000 Hz')
                            : t('Filter order / slope for both branches — generic Butterworth-style seed values')
                      }
                    >
                      {TEMPLATE_ORDERS.map((tp) => (
                        <option key={tp.order} value={tp.order}>
                          {t(tp.label)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={startNetworkFromTemplate}
                      disabled={!supportsWayCount(templateWays)}
                    >
                      {t('New from template')}
                    </button>
                  </span>
                </div>
              </div>
              <div className={`tool-group${uiMode === 'guided' ? ' expert-only' : ''}`}>
                <span className="tool-group-label">{t('Export')}</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={exportActiveFilter}
                    disabled={!activeDesign}
                    title={t('Download the active tab as a standalone .adsfilter.json — share it or bring it into another project')}
                  >
                    {t('Export filter')}
                  </button>
                  <button
                    type="button"
                    onClick={exportActiveVxp}
                    disabled={designs.length === 0}
                    title={t('Export ALL network tabs as a VituixCAD project folder — the .vxp (each tab a crossover variant CROSSOVER, CROSSOVER1, …) PLUS every measurement/impedance file, written together so VituixCAD opens it without hunting. Chrome/Edge ask for a folder and write it there; Safari/Firefox download the same folder as one .zip. VituixCAD reconstructs the phase itself (MinimumPhase=True) and every driver carries its measured excess-phase delay (earliest driver 0), so its simulation matches ours — two-way and three-way alike.')}
                  >
                    {t('Export .vxp')}
                  </button>
                  <button
                    type="button"
                    onClick={exportReport}
                    disabled={!activeDesign}
                    title={t('Export this design as a printable HTML report (A4): summary, the charts you have open, the schematic and the BOM with prices. The file is ALSO a filter file — Import filter reads it back, so a report can be mailed, printed and compared.')}
                  >
                    {t('Export report')}
                  </button>
                </div>
              </div>
              <div className={`tool-group${uiMode === 'guided' ? ' expert-only' : ''}`}>
                <span className="tool-group-label">{t('Catalog')}</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={exportCatalog}
                    title={t('Download the component catalog as an editable JSON template — add your own brands/series and import it back')}
                  >
                    {t('Export')}
                  </button>
                  <label
                    className="file-button"
                    title={t('Import a component-catalog JSON: your series appear in the inspector next to the built-in ones (persisted across sessions)')}
                  >
                    {t('Import')}
                    <input
                      type="file"
                      accept=".json,.adscatalog"
                      onChange={importCatalogFromFile}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setCatalogMgrOpen(true)}
                    title={t('Add, edit or remove exact SKUs (values, DCR/ESR, prices, tiers) without leaving the app')}
                  >
                    🗂 {t('Manage…')}
                  </button>
                </div>
              </div>
              <div className={`tool-group${uiMode === 'guided' ? ' expert-only' : ''}`}>
                <span className="tool-group-label">{t('Tools')}</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={runNetOptimize}
                    disabled={!activeDesign || netOptBusy || !sim || zModels.length === 0}
                    title={
                      threeWay
                        ? t('3-way: re-fit the UNLOCKED component values against the measured three-branch sum — both adjacent crossings are guarded (valley, protection, dead-branch), phase is judged per pair')
                        : soloDriver
                          ? t('Single-driver mode: re-fit the UNLOCKED component values against the measured driver — objective is branch flatness (+ amp-load floor); crossover terms do not apply')
                          : t('Re-fit the UNLOCKED component values of the active tab against the measured response — 🔒 parts keep their value')
                    }
                  >
                    {netOptBusy ? t('Tuning…') : `⚙ ${t('Optimize components')}`}
                  </button>
                  <button
                    type="button"
                    onClick={runMinimize}
                    disabled={!activeDesign || !sim || netOptBusy || Object.keys(impedances).length === 0}
                    title={t("Minimal network: remove the most expensive part poort 4 did not mark EARNED, retune, keep while the staged targets, the fundamentals (crossing, valley, tweeter protection, leak, Z floor) and the source-R limit hold; then try cheaper catalog parts within 25 % of each value. Reports BOM before/after and the quality deltas — nothing is applied until you say so.")}
                  >
                    {minimizeBusy ? t('Minimizing…') : `✂ ${t('Minimize network')}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTrapModel(zModels[0] ?? 'mid');
                      setTrapOpen(true);
                    }}
                    disabled={!activeDesign || zModels.length === 0}
                    title={t('Add an LCR notch (series trap across a driver) to tame a peak — enter frequency, depth and Q; values follow from the measured impedance and the result shows live')}
                  >
                    ➕ {t('Add notch')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeDesign) return;
                      const tidied = tidySchematic(activeDesign.parts);
                      if (!tidied) {
                        setNetOptNote(
                          t('Layout not tidied: topology too exotic for the auto-placer (bridge, shared series section, or open/shorted parts).'),
                        );
                        return;
                      }
                      commitSchematic(tidied); // undo-able
                      setNetOptNote(t('Layout tidied — same netlist, fresh placement (Undo to revert).'));
                    }}
                    disabled={!activeDesign}
                    title={t('Redraw this schematic from its netlist: series path as a bus, chains hanging down, branches stacked with air — electrically identical, undo-able. Fixes cramped layouts from older exports.')}
                  >
                    {t('Tidy layout')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTargets(true)}
                    title={t('What was this network built FOR? The virtual target design (HP/LP kind, order, knees, EQ bands) plus the MEASURED acoustic slopes beside the crossing — electrical component count never equals acoustic order.')}
                  >
                    🎯 {t('Targets')}
                  </button>
                </div>
              </div>
              <div className={`tool-group${uiMode === 'guided' ? ' expert-only' : ''}`}>
                <span className="tool-group-label">{t('Simulation')}</span>
                <div className="tool-group-body">
                  <label title={t("Feed the active tab's network into the simulation instead of the selected vxp variant — every edit re-solves live")}>
                    <input
                      type="checkbox"
                      checked={networkActive}
                      disabled={!schematic}
                      onChange={(e) => setNetworkActive(e.target.checked)}
                    />{' '}
                    {t('Use in simulation')}
                  </label>
                  {designs.length > 1 && (
                    <label title={t("Show the other tabs' summed responses as dashed ghost curves in the SPL chart")}>
                      <input
                        type="checkbox"
                        checked={compareTabs}
                        onChange={(e) => setCompareTabs(e.target.checked)}
                      />{' '}
                      {t('Compare tabs')}
                    </label>
                  )}
                  <label title={t('Worst-case envelope around the combined curve when every physical R/L/C lands within its tolerance — what building with real parts can do to this design. Numbers in the SPL strip; the tooltip there ranks the most sensitive parts.')}>
                    <input
                      type="checkbox"
                      checked={tolOn}
                      onChange={(e) => setTolOn(e.target.checked)}
                    />{' '}
                    {t('Tolerance band')} ±
                    <select
                      value={tolPct}
                      onChange={(e) => setTolPct(Number(e.target.value))}
                      title={t('Component tolerance class: 2% (measured/selected parts), 5% (good film caps & air coils), 10% (electrolytics, budget parts)')}
                    >
                      <option value={2}>2%</option>
                      <option value={5}>5%</option>
                      <option value={10}>10%</option>
                    </select>
                  </label>
                </div>
              </div>
            </div>
            {netOptNote && (
              <p className="derived" style={{ margin: '0 0 0.8rem', whiteSpace: 'pre-line' }}>
                {netOptNote}
              </p>
            )}
            {netOptDiff && netOptDiff.length > 0 && (
              <details className="tune-diff">
                <summary>{t('{n} value changes — old → new', { n: netOptDiff.length })}</summary>
                <table className="scan-table">
                  <thead>
                    <tr>
                      <th>{t('part')}</th>
                      <th>{t('old')}</th>
                      <th>{t('new')}</th>
                      <th>Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {netOptDiff.map((d) => {
                      const pct = ((d.to - d.from) / Math.abs(d.from)) * 100;
                      return (
                        <tr key={d.id}>
                          <td>{d.id}</td>
                          <td>
                            {Number(d.from.toPrecision(3))} {d.unit}
                          </td>
                          <td>
                            {Number(d.to.toPrecision(3))} {d.unit}
                          </td>
                          <td>
                            {pct > 0 ? '+' : ''}
                            {Math.abs(pct) >= 100 ? pct.toFixed(0) : pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
            )}
            {minimizeReport && (() => {
              const r = minimizeReport.r;
              const eur = (v: number | null) => (v === null ? t('[NO PRICE]') : `€${Math.round(v)}`);
              const saved = r.bomBeforeEur !== null && r.bomAfterEur !== null ? r.bomBeforeEur - r.bomAfterEur : null;
              return (
                <details className="tune-audit" open>
                  <summary>
                    ✂ {t('Minimal network for "{name}": BOM {b} → {a} ({s}) · peak {p0} → {p1} dB · phase {q0} → {q1}° · R src {r0} → {r1} Ω', {
                      name: minimizeReport.base,
                      b: eur(r.bomBeforeEur),
                      a: eur(r.bomAfterEur),
                      s: saved !== null ? `−€${Math.round(saved)}` : '—',
                      p0: r.before.peakDb.toFixed(2),
                      p1: r.after.peakDb.toFixed(2),
                      q0: r.before.phaseDeg.toFixed(1),
                      q1: r.after.phaseDeg.toFixed(1),
                      r0: r.before.rSourceOhm?.toFixed(2) ?? '—',
                      r1: r.after.rSourceOhm?.toFixed(2) ?? '—',
                    })}
                  </summary>
                  <p className="sub">{t('Stopped: {why}. Targets {r} dB / {p}° kept at every step; nothing has been applied to the design.', { why: r.stop, r: rippleTargetEff().toFixed(1), p: num(targetPhase, 10) })}</p>
                  {r.steps.length > 0 ? (
                    <table className="scan-table">
                      <thead><tr><th>{t('step')}</th><th>{t('part')}</th><th>€</th><th>{t('peak')}</th><th>{t('phase')}</th><th>R src</th><th>{t('why')}</th></tr></thead>
                      <tbody>
                        {r.steps.map((st, i) => (
                          <tr key={i}>
                            <td>{st.kind === 'remove' ? t('removed') : t('substituted')}</td>
                            <td>{st.label}</td>
                            <td>{st.savingEur !== null ? `−€${st.savingEur.toFixed(2)}` : t('[NO PRICE]')}</td>
                            <td>{st.after.peakDb.toFixed(2)} dB</td>
                            <td>{st.after.phaseDeg.toFixed(1)}°</td>
                            <td>{st.after.rSourceOhm?.toFixed(2) ?? '—'} Ω</td>
                            <td>{st.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="sub">{t('No part could be removed or swapped without breaking a target or a fundamental — this network is already minimal for these goals.')}</p>
                  )}
                  {r.suggestions.length > 0 && (
                    <p className="sub">💡 {t('Two-for-one suggestions (not applied):')} {r.suggestions.join(' · ')}</p>
                  )}
                  {r.steps.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        addDesign(`${minimizeReport.base} · minimal`, r.parts);
                        setMinimizeReport(null);
                      }}
                    >
                      {t('Apply as new tab')}
                    </button>
                  )}
                </details>
              );
            })()}
            {netOptAudit && netOptAudit.entries.length > 0 && (
              <details className="tune-diff part-audit">
                <summary>
                  {t('Part audit — {n} parts: {i} inert · {e} earned · {g} grey', {
                    n: netOptAudit.entries.length,
                    i: netOptAudit.entries.filter((e) => e.verdict === 'inert').length,
                    e: netOptAudit.entries.filter((e) => e.verdict === 'earned').length,
                    g: netOptAudit.entries.filter((e) => e.verdict === 'grey').length,
                  })}
                  {netOptAudit.rSourceTunedOhm !== null && (
                    <span className={netOptAudit.rSourceWarn ? 'audit-warn' : 'audit-ok'}>
                      {' · '}
                      {t('source R at the low driver {r} Ω @ {f} Hz', {
                        r: netOptAudit.rSourceTunedOhm.toFixed(2),
                        f: Math.round(netOptAudit.rSourceAtHz ?? 0),
                      })}
                      {netOptAudit.qesFactor !== null ? ` (Qes ×${netOptAudit.qesFactor.toFixed(2)})` : ''}
                      {netOptAudit.rSourceAtGridEdge ? ` — ${t('taken at the grid edge — the box tuning lies below the view range; widen it for the value at resonance')}` : ''}
                    </span>
                  )}
                </summary>
                <p className="derived" style={{ margin: '0.3rem 0 0.5rem' }}>
                  {t('Each part opened/shorted WITHOUT retuning, measured against the full network: max |ΔSPL| of the sum (200 Hz–15 kHz, 1/6-oct smoothed), the P95 change of the relative phase where the drivers hand over, and the change of the system Z minimum. Inert = removable whether or not the targets are met (locked parts are only reported); earned = it demonstrably works; grey = the numbers are yours to judge. The ratio is |Z of the part| against |Z it sees| over the band where its branch is within 12 dB of the sum — a shunt part is inert when ≫ 1, a series part when ≪ 1.')}
                </p>
                <table className="scan-table">
                  <thead>
                    <tr>
                      <th>{t('part')}</th>
                      <th>{t('function')}</th>
                      <th>ΔSPL</th>
                      <th>Δφ</th>
                      <th>ΔZmin</th>
                      <th>{t('ratio')}</th>
                      <th>€</th>
                      <th>{t('verdict')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {netOptAudit.entries.map((e) => (
                      <tr key={e.ids.join('+')} className={`audit-${e.verdict}`} title={e.reasons.join('\n')}>
                        <td>
                          {e.label}
                          {e.locked ? ' 🔒' : ''}
                        </td>
                        <td>{e.role}</td>
                        <td>{e.dA.toFixed(2)} dB</td>
                        <td>{e.dP.toFixed(1)}°</td>
                        <td>
                          {e.dZmin >= 0 ? '+' : ''}
                          {e.dZmin.toFixed(2)} Ω
                        </td>
                        <td>
                          {e.ratio
                            ? `${e.ratio.median >= 100 ? e.ratio.median.toFixed(0) : e.ratio.median >= 10 ? e.ratio.median.toFixed(1) : e.ratio.median.toFixed(2)}× (${e.ratio.kind})`
                            : '—'}
                        </td>
                        <td>{e.costEur !== null ? `€${e.costEur.toFixed(2)}` : '—'}</td>
                        <td>
                          {e.applied
                            ? t('inert — removed')
                            : e.verdict === 'inert'
                              ? e.locked
                                ? t('inert (locked)')
                                : t('inert')
                              : e.verdict === 'earned'
                                ? t('earned')
                                : t('grey')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            {rescued && !chainScan && !vfBusy && (
              /* A scan that died with finished candidates in it. Offered, not
                 applied: the user did not ask for this table to come back, and
                 quietly repopulating it would be a second surprise after the
                 first one. */
              <p className="result-good">
                ⭯{' '}
                {t('{n} candidates survived from a scan that was interrupted ({label}). They are complete designs — nothing was lost but the one still running.', {
                  n: String(rescued.rows.length),
                  label: rescued.label,
                })}{' '}
                <button
                  type="button"
                  onClick={() => {
                    const ranked = rankChain3Results(
                      rescued.rows,
                      stagedOn ? { rippleDb: rippleTargetEff(), phaseDeg: num(targetPhase, 10) } : undefined,
                      phasePriority / 100,
                      dirWeight / 100,
                      rSourceLimitOhm,
                      bomCapEur,
                      ampMinLoadOhm ?? 0,
                    );
                    // No winner crown: this field is partial, and a crown on a
                    // partial field is the "ranking is not approving" mistake
                    // this session already wrote down twice.
                    setScanSort(null);
                    setChainScan({ rows: ranked.map((rr) => chain3ScanRow(rr, null)), active: '' });
                    void dropScanRun(rescued.runId);
                    setRescued(null);
                  }}
                >
                  {t('Show them')}
                </button>{' '}
                <button
                  type="button"
                  onClick={() => {
                    void dropScanRun(rescued.runId);
                    setRescued(null);
                  }}
                >
                  {t('Discard')}
                </button>
              </p>
            )}
            {chainScan && !v2Shortlist && (
              /* The success moment of a multi-minute run deserves its own
                 visual register — one green line that says it worked, where
                 the result lives, and that the table below is a MENU, before
                 the eye hits eight columns of numbers. */
              <p className="result-good">
                ✓ {t('Design ready — the winner is loaded in the')} <strong>Working</strong>{' '}
                {t('tab and every chart shows it. The rows below are the full candidates: click one to try it, 💾 Save keeps the one you trust.')}
              </p>
            )}
            {/* UI-1 — ON THE v2 ROUTE THE SENTENCE IS ABOUT THE SHORTLIST.
                The line above said "the winner is loaded in the Working tab"
                over a run whose Working tab was empty, because the winner it
                meant was the v1 ranking's and that candidate had been refused.
                Two states now, and the second one is the whole point: a run
                that qualified nothing says so, and says that nothing was
                loaded — rather than quietly showing a design that failed. */}
            {v2Shortlist &&
              (shortlistPick !== null ? (
                <p className="result-good">
                  ✓ {t('Shortlist ready —')} <strong>{shortlistPick}</strong>{' '}
                  {t('is loaded in the')} <strong>Working</strong>{' '}
                  {t('tab and every chart shows it. Click any shortlist row to load that design instead; 💾 Save keeps the one you trust.')}
                </p>
              ) : (
                <p className="result-warn">
                  ⚠{' '}
                  {t('No design was loaded: {n} of {m} candidates meet the requirements you stated. The Working tab is untouched — the v1 ranking below has no knowledge of your gates or requirements, so its top row is not a stand-in for an empty shortlist.', {
                    n: String(v2Shortlist.rows.length),
                    m: String(v2Shortlist.consideredCount),
                  })}
                </p>
              ))}
            {chainScan && scanReference && (() => {
              /* THE HONEST VERDICT. A scan always crowns one of its own rows —
                 so it must also be able to say that none of them was worth the
                 run. Judged on the axes a designer would not trade away: peak,
                 worst-pair phase, and the source resistance the amplifier
                 sees. Only candidates still in the race count. */
              const live = chainScan.rows.filter((r) => r.disqualified.length === 0);
              const beats = live.filter(
                (r) =>
                  r.rippleDb <= scanReference.peakDb + 0.05 &&
                  r.phaseDeg <= scanReference.phaseDeg + 0.5 &&
                  (r.rSourceOhm === null ||
                    scanReference.rSourceOhm === null ||
                    r.rSourceOhm <= scanReference.rSourceOhm + 0.1),
              );
              if (beats.length > 0) return null;
              return (
                <p className="result-warn">
                  ⚠{' '}
                  {t(
                    'No candidate beat the design you already had ({name}: {peak} dB · {phase}° · R src {rs}). Keep it — or widen the search (crossover window, more steps, targets), because this run found nothing better.',
                    {
                      name: scanReference.name,
                      peak: scanReference.peakDb.toFixed(2),
                      phase: scanReference.phaseDeg.toFixed(1),
                      rs: scanReference.rSourceOhm !== null ? `${scanReference.rSourceOhm.toFixed(2)} Ω` : '—',
                    },
                  )}
                </p>
              );
            })()}
            {(() => {
              /* UI-1 — ON THE v2 ROUTE THE PARETO PLOTS THE SHORTLIST.
               *
               * "Cost vs quality — the knee is yours to pick" is a picture of a
               * CHOICE, and on the v2 route the choice is the shortlist. It was
               * plotting the v1 ranking's field instead: every candidate the
               * scan produced, gates and requirements and refusals included, so
               * the cheapest point on the knee was regularly a design the run
               * had already thrown away. Same rows, same builder
               * (`chain3ScanRow`), so a point and a shortlist row cannot print
               * two different prices for one design. */
              const paretoRows = v2Shortlist
                ? v2Shortlist.rows.map((r) => chain3ScanRow(r.result, null))
                : chainScan?.rows;
              if (!paretoRows || paretoRows.filter((r) => r.bomEur !== null).length < 2) return null;
              // B3 — Pareto scatter. y = chosen quality (lower is better), x = BOM.
              const yOf = (r: (typeof paretoRows)[number]): number | null =>
                paretoY === 'peak' ? r.rippleDb : paretoY === 'avg' ? r.avgDevDb : r.phaseDeg;
              const pts = paretoRows
                .map((r) => ({ r, x: r.bomEur!, y: yOf(r) }))
                .filter((p): p is { r: (typeof paretoRows)[number]; x: number; y: number } => p.r.bomEur !== null && p.y !== null && Number.isFinite(p.y));
              if (pts.length < 2) return null;
              const dominated = (p: typeof pts[number]) =>
                pts.some((q) => q !== p && q.x <= p.x && q.y <= p.y && (q.x < p.x || q.y < p.y));
              const front = pts.filter((p) => !dominated(p) && !p.r.disqualified?.length);
              const W = 520, H = 200, ml = 44, mr = 12, mt = 10, mb = 28;
              const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
              const x0 = Math.min(...xs) * 0.95, x1 = Math.max(...xs) * 1.05;
              const y0 = Math.min(...ys) * 0.9, y1 = Math.max(...ys) * 1.08;
              const X = (v: number) => ml + ((v - x0) / (x1 - x0 || 1)) * (W - ml - mr);
              const Y = (v: number) => mt + (1 - (v - y0) / (y1 - y0 || 1)) * (H - mt - mb);
              const frontSorted = [...front].sort((a, b) => a.x - b.x);
              const yLabel = paretoY === 'peak' ? t('peak ±dB') : paretoY === 'avg' ? t('avg dev dB') : t('phase °');
              return (
                <div className="pareto" style={{ margin: '0.4rem 0' }}>
                  <div className="row" style={{ alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
                    <strong>{t('Cost vs quality — the knee is yours to pick')}</strong>
                    <select value={paretoY} onChange={(e) => setParetoY(e.target.value as 'peak' | 'avg' | 'phase')} title={t('Quality measure on the vertical axis')}>
                      <option value="peak">{t('peak ±dB')}</option>
                      <option value="avg">{t('avg dev dB')}</option>
                      <option value="phase">{t('phase °')}</option>
                    </select>
                    <span className="derived">{t('{n} non-dominated of {m} priced — filled = Pareto front, ◂ = loaded, ✗ = disqualified; click a point to load it', { n: front.length, m: pts.length })}</span>
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: `${W}px`, height: 'auto', display: 'block' }} role="img" aria-label={t('Pareto scatter of BOM versus quality')}>
                    <line x1={ml} y1={H - mb} x2={W - mr} y2={H - mb} stroke="var(--viz-axis, #888)" />
                    <line x1={ml} y1={mt} x2={ml} y2={H - mb} stroke="var(--viz-axis, #888)" />
                    <text x={W - mr} y={H - 8} textAnchor="end" fontSize="10" fill="var(--muted, #999)">BOM €</text>
                    <text x={ml + 4} y={mt + 10} fontSize="10" fill="var(--muted, #999)">{yLabel}</text>
                    {[0, 0.5, 1].map((f) => (
                      <text key={`x${f}`} x={X(x0 + f * (x1 - x0))} y={H - 10} textAnchor="middle" fontSize="9" fill="var(--muted, #999)">{Math.round(x0 + f * (x1 - x0))}</text>
                    ))}
                    {[0, 0.5, 1].map((f) => (
                      <text key={`y${f}`} x={ml - 4} y={Y(y0 + f * (y1 - y0)) + 3} textAnchor="end" fontSize="9" fill="var(--muted, #999)">{(y0 + f * (y1 - y0)).toFixed(paretoY === 'phase' ? 0 : 2)}</text>
                    ))}
                    {frontSorted.length > 1 && (
                      <polyline points={frontSorted.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} fill="none" stroke="var(--accent, #4d8df0)" strokeDasharray="3 3" />
                    )}
                    {pts.map((p) => {
                      const onFront = front.includes(p);
                      const dq = !!p.r.disqualified?.length;
                      const active = v2Shortlist
                        ? shortlistPick === p.r.label
                        : chainScan?.active === p.r.label;
                      return (
                        <g
                          key={p.r.label}
                          style={{ cursor: 'pointer' }}
                          onClick={() =>
                            v2Shortlist ? loadShortlistRow(p.r.label) : applyScanCandidate(p.r)
                          }
                        >
                          <title>{`${p.r.delivered} · €${Math.round(p.x)} · ${yLabel} ${p.y.toFixed(2)}${dq ? ' · ✗' : ''}${onFront ? ' · Pareto' : ''}`}</title>
                          <circle cx={X(p.x)} cy={Y(p.y)} r={onFront ? 6 : 4.5} fill={onFront ? 'var(--accent, #4d8df0)' : 'transparent'} stroke={dq ? 'var(--bad, #d55)' : 'var(--accent, #4d8df0)'} strokeWidth={active ? 2.5 : 1.2} />
                          {dq && <text x={X(p.x)} y={Y(p.y) + 3.5} textAnchor="middle" fontSize="9" fill="var(--bad, #d55)">✗</text>}
                          {active && <text x={X(p.x) + 8} y={Y(p.y) + 3.5} fontSize="10" fill="var(--fg, #ddd)">◂</text>}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })()}
            {chainScan && v2Shortlist && (
              /* UI-1 — WHAT THIS TABLE IS ON THE v2 ROUTE, said above it.
               *
               * It is the v1 ranking over the same field: one weighted order,
               * with no knowledge of a gate, a requirement or a refused tune.
               * It stays — a second reading of one's own field is worth having
               * — but it may not present itself as the run's verdict, and it
               * did: it crowned a row with 🏆, called it "winner" in the note,
               * and struck others through with ✗ on a source-resistance rule
               * the v2 route withdrew at V34, marking as failures exactly the
               * designs the shortlist above had passed. */
              <div className="v1-reading">
                <h4>{t('v1 reading — not the route that made this run')}</h4>
                <p className="sub">
                  {t('The same candidates, ordered by the v1 ranking: one weighted score over flatness, phase, price and load. It knows nothing about your gates, your requirements or a candidate whose tune was refused, so it crowns nothing here and its disqualification marks are shown as v1 notes rather than as verdicts. The shortlist above is what this run decided.')}
                </p>
              </div>
            )}
            {chainScan && (
              <table
                className={`scan-table scan-table-pick${v2Shortlist ? ' scan-table-v1-reading' : ''}`}
                title={t("Full-chain crossover scan — click a row to load that candidate's complete design (filters + tuned network) into Working; click a header to sort")}
              >
                <thead>
                  <tr>
                    {(
                      [
                        ['xo', t('crossover')],
                        ['ripple', t('peak')],
                        ['avg', t('avg')],
                        ['phase', t('phase')],
                        ['ovl', t('overlap')],
                        ['zmin', 'Z min'],
                        ['rs', 'R src'],
                        ['bom', 'BOM'],
                      ] as const
                    ).map(([key, caption]) => (
                      <th
                        key={key}
                        className={scanSort?.key === key ? 'sorted' : ''}
                        onClick={() => toggleScanSort(key)}
                        title={t('Sort by this column — ascending, descending, then back to the ranking order (🏆 first)')}
                      >
                        {caption}
                        {scanSort?.key === key ? (scanSort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                    {/* F2b — the gate column exists ONLY for a table an
                        engine-v2 run produced. Not "empty when off": absent,
                        so with the toggle off the table is the one the app
                        always drew. Not sortable, on purpose — a hard gate is
                        a pass/fail, and sorting on it would invite reading it
                        as a ranking. */}
                    {v2Run && (
                      <th title={t('Hard gates (A4 M-A/M-B/M-C) on the delivered network of this candidate. Every candidate is judged, not only the winner.')}>
                        {t('gate')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {scanReference && (
                    <tr
                      className="scan-reference"
                      title={t('The design that was on screen when the scan started, measured through the same pipeline. It does not compete — it is the bar every candidate has to clear.')}
                    >
                      <td>
                        {t('◆ your design before this run')}
                        <span style={{ opacity: 0.6 }}> ({scanReference.name})</span>
                      </td>
                      <td>{scanReference.peakDb.toFixed(2)} dB</td>
                      <td>{scanReference.avgDevDb !== null ? `${scanReference.avgDevDb.toFixed(2)} dB` : '—'}</td>
                      <td>{scanReference.phaseDeg.toFixed(1)}°</td>
                      <td>—</td>
                      <td>{scanReference.zMinOhm !== null ? `${scanReference.zMinOhm.toFixed(1)} Ω` : '—'}</td>
                      <td>{scanReference.rSourceOhm !== null ? `${scanReference.rSourceOhm.toFixed(2)} Ω` : '—'}</td>
                      <td>{scanReference.bomEur !== null ? `€${Math.round(scanReference.bomEur)}` : '—'}</td>
                      {v2Run && (
                        <td title={t('The design from before this run — it did not go through the gates.')}>—</td>
                      )}
                    </tr>
                  )}
                  {[...chainScan.rows]
                    .sort((a, b) => {
                      if (!scanSort) return 0; // ranking order (stable sort)
                      const v = (r: typeof a): number =>
                        scanSort.key === 'xo'
                          ? parseFloat(r.delivered.replace(/^[^\d]*/, ''))
                          : scanSort.key === 'ripple'
                            ? r.rippleDb
                            : scanSort.key === 'avg'
                              ? (r.avgDevDb ?? Number.POSITIVE_INFINITY)
                              : scanSort.key === 'phase'
                                ? r.phaseDeg
                                : scanSort.key === 'ovl'
                                  ? (r.pairOverlapOct
                                      ? Math.max(...r.pairOverlapOct.map((o) => o ?? 0))
                                      : Number.POSITIVE_INFINITY)
                                  : scanSort.key === 'zmin'
                                  ? -(r.zMinOhm ?? Number.NEGATIVE_INFINITY) // higher is better
                                  : scanSort.key === 'rs'
                                    ? (r.rSourceOhm ?? Number.POSITIVE_INFINITY)
                                    : (r.bomEur ?? Number.POSITIVE_INFINITY);
                      return (v(a) - v(b)) * scanSort.dir;
                    })
                    .map((r) => (
                    <tr
                      key={r.label}
                      className={`${r.winner ? 'winner' : ''}${chainScan.active === r.label ? ' active' : ''}${r.disqualified.length > 0 && !v2Shortlist ? ' disqualified' : ''}`}
                      onClick={() => applyScanCandidate(r)}
                      title={
                        chainScan.active === r.label
                          ? t('This candidate is loaded in Working')
                          : t('Load the {label} design into Working (undo-able)', { label: r.label })
                      }
                    >
                      <td
                        className={r.unrealisable ? 'scan-z-low' : undefined}
                        title={
                          (r.unrealisable
                            ? t('Target not realisable: the tuned network crosses more than ⅓ octave from the candidate it aimed at — the window or the topology binds. ')
                            : '') +
                          (r.disqualified.length > 0
                            ? v2Shortlist
                              ? /* UI-1 — the reason is kept and the VERDICT is
                                   withdrawn. The v1 chain's rules are not this
                                   run's rules; the source-resistance limit in
                                   particular was withdrawn on the v2 route at
                                   V34, and it struck out designs the shortlist
                                   passed. */
                                `${t('v1 note (not applied on this route)')}: ${r.disqualified.join('; ')}. `
                              : `${t('DISQUALIFIED')}: ${r.disqualified.join('; ')}. `
                            : '') +
                          (r.xoFloorVerdict?.some((v) => v === 'warn') ? t('Delivered within 5 % under a physics floor (fs·K / excursion / reach). ') : '') +
                          t('Named after the DELIVERED acoustic crossing; aimed at {target}', { target: r.target }) +
                          (r.powerSlopeDbDec !== null
                            ? ` · ${t('power slope {s} dB/dec', { s: (r.powerSlopeDbDec >= 0 ? '+' : '') + r.powerSlopeDbDec.toFixed(1) })}${r.powerSlopeDbDec > 1 ? ' ⚠' : ''}`
                            : '')
                        }
                      >
                        {r.winner ? '🏆 ' : ''}
                        {r.disqualified.length > 0 && !v2Shortlist ? '✗ ' : r.unrealisable ? '⚠ ' : r.xoFloorVerdict?.some((v) => v === 'warn') ? '△ ' : ''}
                        {r.delivered}
                        <span style={{ opacity: 0.6 }}> {t('(aim')} {r.target.replace(/ Hz$/, '')})</span>
                        {chainScan.active === r.label ? ' ◂' : ''}
                      </td>
                      <td
                        title={
                          r.peakSmoothedDb !== null && Math.abs(r.peakSmoothedDb - r.rippleDb) > 0.005
                            ? t('Peak ±dB of the error-smoothed sum (what the search judged); raw peak {raw} dB — the worst single raw spot, what the staged targets gate on', { raw: r.rippleDb.toFixed(2) })
                            : t('Peak ±dB — the worst single spot (what the staged targets gate on)')
                        }
                      >
                        {(r.peakSmoothedDb ?? r.rippleDb).toFixed(2)} dB
                      </td>
                      <td title={t("Whole-range average |deviation| — the number the ranking judges on: one narrow dip doesn't decide the winner")}>
                        {r.avgDevDb !== null ? `${r.avgDevDb.toFixed(2)} dB` : '—'}
                      </td>
                      <td>{r.phaseDeg.toFixed(1)}°</td>
                      <td
                        className={r.xoWindowOk === false ? 'scan-z-low' : undefined}
                        title={
                          r.pairOverlapOct === null
                            ? t('Delivered overlap width per pair (2-way rows do not carry it)')
                            : r.xoWindowOk === false
                              ? t('A delivered crossing sits OUTSIDE its physics window (pin or measured beaming/lobing bound) — off-axis this is a different loudspeaker, so it ranks below every candidate inside the window')
                              : t('Delivered overlap width per pair, octaves (W-M / M-T) — how long both cones carry a region together; the phase-coherent integration bandwidth')
                        }
                      >
                        {r.pairOverlapOct !== null
                          ? `${r.xoWindowOk === false ? '⚠ ' : ''}${r.pairOverlapOct
                              .map((o) => (o === null ? '—' : o.toFixed(1)))
                              .join('/')} oct`
                          : '—'}
                      </td>
                      <td
                        className={
                          ampMinLoadOhm !== null && r.zMinOhm !== null && !meetsAmpFloor(r.zMinOhm, ampMinLoadOhm)
                            ? 'scan-z-low'
                            : undefined
                        }
                        title={
                          r.zMinOhm === null
                            ? t('Minimum system impedance was not measured for this candidate')
                            : ampMinLoadOhm === null
                              ? t('Minimum system impedance the amplifier sees. No rating entered, so nothing is ranked on it — put your amplifier’s minimum load in ⚙ Settings to have candidates judged on it.')
                              : !meetsAmpFloor(r.zMinOhm, ampMinLoadOhm)
                                ? t('The amplifier sees {z} Ω at its worst — below the {floor} Ω you entered for it, so this candidate ranks below every one with a load it can drive, however flat it is', { z: r.zMinOhm.toFixed(1), floor: ampMinLoadOhm.toFixed(1) })
                                : t('Minimum system impedance the amplifier sees (you rated it to {floor} Ω)', { floor: ampMinLoadOhm.toFixed(1) })
                        }
                      >
                        {r.zMinOhm !== null
                          ? `${ampMinLoadOhm !== null && !meetsAmpFloor(r.zMinOhm, ampMinLoadOhm) ? '⚠ ' : ''}${r.zMinOhm.toFixed(1)} Ω`
                          : '—'}
                      </td>
                      <td
                        className={r.rSourceOhm !== null && r.rSourceOhm >= rSourceLimitOhm ? 'scan-z-low' : undefined}
                        title={
                          r.rSourceOhm === null
                            ? t('Source resistance at the low driver — not measured for this candidate')
                            : t('Source resistance the low driver sees at its box tuning (real part, model estimate outside the measured band). Tiers: yellow ≥ {w} Ω, ranking class lost ≥ {l} Ω, disqualified ≥ {d} Ω', { w: (0.5 * rSourceLimitOhm).toFixed(1), l: rSourceLimitOhm.toFixed(1), d: rSourceDisqOhm.toFixed(1) })
                        }
                      >
                        {r.rSourceOhm !== null
                          ? `${r.rSourceOhm >= rSourceDisqOhm ? '✗ ' : r.rSourceOhm >= rSourceLimitOhm ? '⚠ ' : r.rSourceOhm >= 0.5 * rSourceLimitOhm ? '△ ' : ''}${r.rSourceOhm.toFixed(2)} Ω`
                          : '—'}
                      </td>
                      <td>{r.bomEur !== null ? `€${Math.round(r.bomEur)}` : '—'}</td>
                      {v2Run && (() => {
                        const g = gateCell(v2Run.gatesByLabel[r.label]);
                        return (
                          <td className={g.bad ? 'scan-z-low' : undefined} title={g.title}>
                            {g.text}
                          </td>
                        );
                      })()}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* F2b — when the façade selects v2 but the table came from a v1
                route, SAY SO. The two-way scan still runs on the v1 worker
                (see TODO(F2c) below); a table with no gate column and no
                stamp is already truthful, but silence about WHY invites the
                reader to assume the gates ran and found nothing. */}
            {engineSelection.optimizer === 'v2' && chainScan && !v2Run && (
              <p className="sub">
                {t('Engine v2 is on, but this scan ran on the v1 engine — so no gate judged these candidates.')}{' '}
                {t('The gates run on the three-way scan; the two-way route is not wired to them yet.')}
              </p>
            )}
            {v2RunNotes.length > 0 && (
              <div className="sub">
                {v2RunNotes.map((n, i) => (
                  <p className="sub" key={i}>
                    {n}
                  </p>
                ))}
              </div>
            )}
            {/* F3 — THE SHORTLIST (A5e.1).
                The feasible region, spread over topology classes, ordered by
                RMS flatness. Sorting is presentation: every column re-sorts
                and none of them changes which designs are in the list. */}
            {v2Shortlist && (
              <div className="shortlist">
                <h4>
                  {t('Shortlist')}{' '}
                  <span className="derived">
                    {t('{n} of {m} candidates qualified', {
                      n: String(v2Shortlist.feasibleCount),
                      m: String(v2Shortlist.consideredCount),
                    })}
                  </span>
                </h4>
                {v2Shortlist.label && (
                  <p className="sub nl-warning">⚠ {v2Shortlist.label}</p>
                )}
                {v2Shortlist.diagnosis.length > 0 && (
                  <div className="sub">
                    <strong>{t('Nothing qualified.')}</strong>
                    <ul style={{ margin: '0.3rem 0 0 1rem' }}>
                      {v2Shortlist.diagnosis.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {v2Shortlist.rows.length > 0 && (() => {
                  const COLS = [
                    ['rms', t('RMS'), (r: (typeof v2Shortlist.rows)[number]) => r.measurements.response?.rmsDeviationDb ?? null, (v: number) => `${v.toFixed(2)} dB`],
                    ['window', t('window'), (r: (typeof v2Shortlist.rows)[number]) => r.measurements.response?.windowPlusMinusDb ?? null, (v: number) => `±${v.toFixed(2)} dB`],
                    /* M-K since V44 — the WORST handover, on the admitted
                     * points. This is the number the `phase-tracking`
                     * requirement judges, so it comes first. */
                    ['phase', t('phase'), (r: (typeof v2Shortlist.rows)[number]) => r.measurements.phaseTracking.reduce((a, b) => Math.max(a, b.meanAbsDeg), 0), (v: number) => `${v.toFixed(1)}°`],
                    /* …and the CONTROL column behind it, with its own name:
                     * what the historic overlap-window set read on that same
                     * network. Null on any row that did not arm the admission,
                     * so it is blank rather than misleading. It judges nothing;
                     * it exists because every casebook entry from V30 to V43
                     * quoted that measure, and a figure that MOVED should read
                     * as a redefinition instead of a regression (V40/V44). */
                    ['phase-ctl', t('phase (overlap window)'), (r: (typeof v2Shortlist.rows)[number]) => {
                      const c = r.measurements.phaseTracking
                        .map((p) => p.controlDeg)
                        .filter((v): v is number => v !== undefined);
                      return c.length > 0 ? Math.max(...c) : null;
                    }, (v: number) => `${v.toFixed(1)}°`],
                    ['zmin', 'Z min', (r: (typeof v2Shortlist.rows)[number]) => r.result.zMinOhm, (v: number) => `${v.toFixed(1)} Ω`],
                    ['epdr', 'EPDR', (r: (typeof v2Shortlist.rows)[number]) => r.gates.find((g) => g.gate === 'M-B/EPDR')?.value ?? null, (v: number) => `${v.toFixed(2)} Ω`],
                    ['diss', t('dissipation'), (r: (typeof v2Shortlist.rows)[number]) => r.gates.find((g) => g.gate === 'M-A')?.value ?? null, (v: number) => `${(v * 100).toFixed(0)} %`],
                    /* V36 — the WATTS in the largest single resistor, beside
                     * the fraction that has been here since F3. The fraction
                     * says how much of the amplifier the filter eats; this says
                     * whether the part exists. On casus 1 they read 23 % and
                     * 17.9 W, and only the second is a number anybody can take
                     * to a supplier. Blank when no amplifier power is stated —
                     * a fraction is scale-free and a watt is not. */
                    ['rmax', t('largest R'), (r: (typeof v2Shortlist.rows)[number]) => r.dissipation?.largestResistorWatts ?? null, (v: number) => `${v.toFixed(1)} W`],
                    ['vfs', 'V@fs', (r: (typeof v2Shortlist.rows)[number]) => { const mc = r.gates.filter((g) => g.gate === 'M-C' && g.value !== null); return mc.length ? Math.max(...mc.map((g) => g.value!)) : null; }, (v: number) => `${v.toFixed(1)} dB`],
                    ['peak', t('peak'), (r: (typeof v2Shortlist.rows)[number]) => r.measurements.response?.narrowPeaks[0]?.db ?? null, (v: number) => `+${v.toFixed(1)} dB`],
                    /* UI-1 — M-F-FINAL: the vertical lobing synthesis, per row.
                       The only lobing quantity that may carry a judgement (V20a),
                       and a COLUMN and not a criterion: nothing filters, sorts or
                       gates on it. Empty when the row has no crossover region to
                       synthesise over — never 0.0 dB, which is what a coplanar or
                       single-source set reports and is the arithmetic of a missing
                       input rather than a result. */
                    ['lobing', t('vert. dip'), (r: (typeof v2Shortlist.rows)[number]) => shortlistLobing[r.label]?.dipDb ?? null, (v: number) => `${v.toFixed(1)} dB`],
                    /* UI-1 — the price of THIS design. It was only ever on the
                       v1 table, so on the v2 route the one list a designer picks
                       from was the one list with no cost in it. Read from the
                       row's own chain result — the same number the v1 table
                       prints — and it sorts like every other column. */
                    ['bom', 'BOM', (r: (typeof v2Shortlist.rows)[number]) => r.result.bomTotalEur, (v: number) => `€${Math.round(v)}`],
                  ] as const;
                  const sorted = [...v2Shortlist.rows];
                  if (shortlistSort) {
                    const col = COLS.find((c) => c[0] === shortlistSort.key);
                    if (col) {
                      sorted.sort((a, b) => {
                        const va = col[2](a) ?? Number.POSITIVE_INFINITY;
                        const vb = col[2](b) ?? Number.POSITIVE_INFINITY;
                        return (va - vb) * shortlistSort.dir;
                      });
                    }
                  }
                  return (
                    <div className="v2-scroll">
                      <table className="scan-table">
                        <thead>
                          <tr>
                            <th>{t('design')}</th>
                            <th title={t('Order per flank, with polarity — the class the spreading kept apart')}>{t('topology')}</th>
                            {COLS.map(([key, caption]) => (
                              <th
                                key={key}
                                className={shortlistSort?.key === key ? 'sorted' : ''}
                                onClick={() =>
                                  setShortlistSort((cur) =>
                                    cur?.key === key
                                      ? cur.dir === 1
                                        ? { key, dir: -1 }
                                        : null
                                      : { key, dir: 1 },
                                  )
                                }
                                title={t('Sort by this column. Sorting is presentation — it never changes which designs are on the shortlist.')}
                              >
                                {caption}
                                {shortlistSort?.key === key ? (shortlistSort.dir === 1 ? ' ▲' : ' ▼') : ''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((r) => (
                            /* UI-1 — A SHORTLIST ROW IS A DESIGN YOU CAN LOAD.
                               It carries the tuned NETWORK (`parts`), not a seed
                               and not a label: it has done since F3, and until
                               UI-1 nothing on this table could reach it. Clicking
                               loads that network into Working and every chart —
                               the same application the scan table's rows get. */
                            <tr
                              key={r.label}
                              className={shortlistPick === r.label ? 'active' : ''}
                              onClick={() => loadShortlistRow(r.label)}
                              title={
                                shortlistPick === r.label
                                  ? t('This design is loaded in the Working tab')
                                  : t('Load this design into the Working tab and every chart')
                              }
                            >
                              <td>
                                {r.label}
                                {shortlistPick === r.label ? ' ◂' : ''}
                              </td>
                              <td title={r.topologyClass} className="derived">{r.orderSignature}</td>
                              {COLS.map(([key, , read, fmt]) => {
                                const v = read(r);
                                return <td key={key}>{v === null ? '—' : fmt(v)}</td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
                <p className="sub">
                  {t('Everything here meets every requirement and every gate you set. The order is RMS flatness against the target curve — a view, not a verdict. The choice is yours.')}{' '}
                  <code title={v2Shortlist.stamp.components.map((c) => `${c.name}=${c.value} — ${c.describe}`).join('\n')}>
                    {v2Shortlist.stamp.shortlistFingerprint}
                  </code>
                </p>
                {/* V31 — THE CANDIDATES THAT DELIVERED NOTHING.
                    They have existed on the shortlist object since V31 and
                    nothing has ever rendered them, which is one of the two
                    reasons the empty Working tab was unexplainable: the
                    candidate the v1 table crowned was one of THESE, and this
                    was the only place that knew it. Listed with the rule that
                    refused each of them, and deliberately NOT clickable —
                    there is no network to load. */}
                {v2Shortlist.rejected.length > 0 && (
                  <div className="shortlist-refused">
                    <h5>
                      {t('Refused — no network at all')}{' '}
                      <span className="derived">
                        {t('{n} of {m} candidates', {
                          n: String(v2Shortlist.rejected.length),
                          m: String(v2Shortlist.consideredCount),
                        })}
                      </span>
                    </h5>
                    <p className="sub">
                      {t('Their tune was refused wholesale, so what came back from the tuner is a seed nobody judged — not a proposal (V31). These rows cannot be loaded, and they are not near-misses: nobody looked at a design here.')}
                    </p>
                    <ul>
                      {v2Shortlist.rejected.map((r) => (
                        <li key={r.label}>
                          <strong>{r.label}</strong>{' '}
                          <span className="derived">[{r.kinds.join(', ') || t('uncategorised')}]</span>{' '}
                          {r.reason}
                          {r.rejectedTune && Object.keys(r.rejectedTune).length > 0 && (
                            <span className="derived">
                              {' '}
                              — {t('the refused tune had reached')}{' '}
                              {Object.entries(r.rejectedTune)
                                .map(([k, v]) => `${k} ${v === null ? '—' : v}`)
                                .join(' · ')}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {v2Shortlist.notes.map((n, i) => (
                  <p className="v2-muted" key={i}>{n}</p>
                ))}
              </div>
            )}
            {/* F2b — the run stamp, under the table it belongs to.
                A5e.4 asks for the seed and the fingerprint to be visible at
                the result, and for an ABORTED run to say so rather than let a
                partial field read as a whole one. */}
            {v2Run && chainScan && (
              <p className={`sub${v2Run.stamp.status === 'aborted' ? ' nl-warning' : ''}`}>
                {v2Run.stamp.status === 'aborted'
                  ? `⚠ ${t('ABORTED')} — ${v2Run.stamp.abortReason}`
                  : t('Engine v2 run, completed.')}{' '}
                {t('seed')} <code>{v2Run.stamp.determinism.seed}</code>
                {v2Run.stamp.determinism.seedSource === 'default' && ` (${t('default')})`} ·{' '}
                <code title={v2Run.stamp.components.map((c) => `${c.name}=${c.value} — ${c.describe}`).join('\n')}>
                  {v2Run.stamp.fingerprint}
                </code>
              </p>
            )}
            {tabCompare && tabCompare.length > 1 && (
              <details className="tab-compare">
                <summary>
                  {t('Compare {n} designs — score · phase · Z · parts · BOM', { n: tabCompare.length })}
                </summary>
                <table
                  className="scan-table scan-table-pick"
                  title={t('Every saved design measured through the same pipeline as the live simulation. The ghost curves show shape; this shows the numbers. Click a row to switch to that design.')}
                >
                  <thead>
                    <tr>
                      <th>{t('design')}</th>
                      <th>{t('response')}</th>
                      <th>{t('avg / peak')}</th>
                      <th>{t('phase')}</th>
                      <th>Z min</th>
                      <th>{t('parts')}</th>
                      <th>BOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabCompare.map((r) => (
                      <tr
                        key={r.id}
                        className={r.active ? 'active' : ''}
                        onClick={() => selectDesign(r.id)}
                        title={r.active ? t('This design is open') : t('Switch to {name}', { name: r.name })}
                      >
                        <td>
                          {r.name}
                          {r.active ? ' ◂' : ''}
                        </td>
                        <td>{r.error ? '—' : r.score !== null ? Math.round(r.score) : '—'}</td>
                        <td>
                          {r.avgDb !== null && r.peakDb !== null
                            ? `±${r.avgDb.toFixed(2)} / ±${r.peakDb.toFixed(2)} dB`
                            : r.error ?? '—'}
                        </td>
                        <td title={threeWay ? t('Worst of the two handovers') : undefined}>
                          {r.phaseDeg !== null
                            ? `${r.phaseDeg.toFixed(1)}° · P95 ${Math.round(r.p95Deg ?? 0)}°`
                            : '—'}
                        </td>
                        <td
                          className={
                            ampMinLoadOhm !== null && r.zMinOhm !== null && !meetsAmpFloor(r.zMinOhm, ampMinLoadOhm)
                              ? 'scan-z-low'
                              : undefined
                          }
                          title={
                            ampMinLoadOhm === null
                              ? t('Minimum system impedance the amplifier sees. No rating entered, so nothing is ranked on it — put your amplifier’s minimum load in ⚙ Settings to have candidates judged on it.')
                              : t('Minimum system impedance (you rated your amplifier to {floor} Ω)', { floor: ampMinLoadOhm.toFixed(1) })
                          }
                        >
                          {r.zMinOhm !== null
                            ? `${ampMinLoadOhm !== null && !meetsAmpFloor(r.zMinOhm, ampMinLoadOhm) ? '⚠ ' : ''}${r.zMinOhm.toFixed(1)} Ω`
                            : '—'}
                        </td>
                        <td>{r.parts}</td>
                        <td>{r.bomEur !== null ? `€${Math.round(r.bomEur)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            {designs.length > 0 && (
              <div className="design-tabs">
                {designs.map((d) => (
                  <DesignTab
                    key={d.id}
                    design={d}
                    active={d.id === activeDesignId}
                    onSelect={() => selectDesign(d.id)}
                    onRename={(name) => renameDesign(d.id, name)}
                    onDelete={() =>
                      askConfirm(
                        t('Delete tab "{name}"? This cannot be undone.', { name: d.name }),
                        t('Delete'),
                        () => deleteDesign(d.id),
                      )
                    }
                  />
                ))}
                {saveNameDraft === null ? (
                  <>
                    <button
                      type="button"
                      className="design-tab-dup"
                      onClick={overwriteLastSaved}
                      disabled={!activeDesignId || !lastSavedId || lastSavedId === activeDesignId}
                      title={
                        lastSavedId && lastSavedId !== activeDesignId
                          ? t('Overwrite "{name}" with the active design and switch to it (⌘S)', { name: designs.find((d) => d.id === lastSavedId)?.name ?? '' })
                          : lastSavedId === activeDesignId && lastSavedId !== null
                            ? t('This IS the saved filter — edits are live, nothing to save')
                            : t('No saved filter yet — use Save as new first')
                      }
                    >
                      💾 {t('Save')}
                      {lastSavedId && lastSavedId !== activeDesignId && (
                        /* The overwrite TARGET, visible without hovering: a
                           save button whose destination is a secret reads as
                           dangerous, and users route around dangerous. */
                        <span className="save-target">
                          {' → '}
                          {(designs.find((d) => d.id === lastSavedId)?.name ?? '').slice(0, 14)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="design-tab-dup"
                      onClick={() => setSaveNameDraft(uniqueDesignName('Filter', designs))}
                      disabled={!activeDesignId}
                      title={t('Save the active design under a NEW name and switch to that saved tab — the tab you came from stays as a ghost to compare against')}
                    >
                      {t('Save as new')}
                    </button>
                  </>
                ) : (
                  <span className="design-tab-savename">
                    <input
                      autoFocus
                      value={saveNameDraft}
                      placeholder={t('Filter name')}
                      onChange={(e) => setSaveNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveActiveDesign(saveNameDraft);
                        if (e.key === 'Escape') setSaveNameDraft(null);
                      }}
                    />
                    <button type="button" onClick={() => saveActiveDesign(saveNameDraft)} title={t('Save (Enter)')}>
                      ✓
                    </button>
                    <button type="button" onClick={() => setSaveNameDraft(null)} title={t('Cancel (Esc)')}>
                      ×
                    </button>
                  </span>
                )}
              </div>
            )}
            {schematic ? (
              <>
                <SchematicEditor
                  parts={schematic.parts}
                  models={zModels}
                  onChange={commitSchematic}
                  onUndo={undoSchematic}
                  canUndo={schHistory.length > 0}
                  onRedo={redoSchematic}
                  canRedo={schFuture.length > 0}
                />
                {/* UI-2 — the simulation status of THIS drawing, right under
                    the editor: solved as drawn (with every defect by name), or
                    refused with the reason. This is the place where, until
                    UI-2, a disconnected woofer and a wire that touched nothing
                    both printed nothing at all. */}
                {readiness && (
                  <div
                    className={`sim-status ${
                      readiness.kind === 'refused' ? 'refused' : readiness.defects.length > 0 ? 'defects' : 'clean'
                    }`}
                  >
                    <p className="sim-status-head">
                      {readiness.kind === 'refused'
                        ? readiness.describe
                        : readiness.defects.length > 0
                          ? readiness.describe
                          : t('Simulated as drawn — every part has a path to the generator.')}
                      {!networkActive ? ` ${t('(“Use in simulation” is off, so the charts show something else.)')}` : ''}
                    </p>
                    {readiness.defects.map((d) => (
                      <p key={`${d.code}:${d.part}`}>{d.text}</p>
                    ))}
                    {simStale && (
                      <p>
                        {simStale.showing === 'previous'
                          ? t('The charts keep the PREVIOUS simulated state, dimmed and tagged, until this is fixed.')
                          : t('The charts show the raw drivers, dimmed and tagged, until this is fixed.')}
                      </p>
                    )}
                  </div>
                )}
                {(() => {
                  const bom = bomFor(schematic.parts);
                  if (bom.rows.length === 0) return null;
                  return (
                    <details className="bom">
                      <summary>
                        BOM — {t('{n} components', { n: bom.rows.length })} ·{' '}
                        {bom.totalEur !== null
                          ? // "≥" only when rows are missing a price — with
                            // everything priced the total is exact, and a
                            // hedge on an exact number reads as doubt.
                            `${bom.pricedCount < bom.rows.length ? '≥ ' : ''}€${bom.totalEur.toFixed(2)} (${bom.pricedCount}/${bom.rows.length} ${t('priced')})`
                          : t('no prices in catalog yet')}
                        {bom.unmatchedCount > 0 && ` · ${t('{n} without exact catalog match', { n: bom.unmatchedCount })}`}
                      </summary>
                      <table>
                        <tbody>
                          {bom.rows.map((row) => (
                            <tr key={row.partId}>
                              <td className="synth-role">{row.partId}</td>
                              <td className="synth-value">
                                {row.kind === 'L'
                                  ? `${Number((row.value * 1e3).toPrecision(4))} mH`
                                  : row.kind === 'C'
                                    ? `${Number((row.value * 1e6).toPrecision(4))} µF`
                                    : `${Number(row.value.toPrecision(4))} Ω`}
                              </td>
                              <td className="synth-role">
                                {row.match
                                  ? `${row.match.brand} ${row.match.series} — ${formatCatalogPart(row.match)}`
                                  : row.stackMatch
                                    ? row.stackMatch.label
                                    : t('no exact catalog value')}
                              </td>
                              <td className="synth-value">
                                {row.match?.priceEur !== undefined
                                  ? `€${row.match.priceEur.toFixed(2)}`
                                  : row.stackMatch?.priceEur !== undefined
                                    ? `€${row.stackMatch.priceEur.toFixed(2)}`
                                    : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  );
                })()}
              </>
            ) : (
              <p className="sub">
                {t('No network yet — "Build passive filter" drops the synthesised design here as a tab, or import the selected variant / start from a template (generator + drivers, unfiltered).')}
              </p>
            )}
          </div>
        </>
            )}
            </>
            )}
            {uiMode === 'guided' &&
              designTab !== 'network' &&
              (() => {
                /* Wayfinding's second question — "where can I go?" — answered
                   at the place you arrive when the step is filled in: the
                   bottom. Named, not generic: "Next" alone predicts nothing. */
                const order = ['import', 'data', 'drivers', 'filters', 'network'] as const;
                const labels: Record<(typeof order)[number], string> = {
                  import: 'Your project',
                  data: 'Your cabinet',
                  drivers: 'Your drivers',
                  filters: 'Design it',
                  network: 'Your build',
                };
                const next = order[order.indexOf(designTab) + 1];
                return (
                  <div className="step-next-row">
                    <button type="button" className="step-next" onClick={() => setDesignTab(next)}>
                      {t('Next: {step} →', { step: t(labels[next]) })}
                    </button>
                  </div>
                );
              })()}
          </div>
        </aside>

        <div
          className="pane-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('Resize the design and chart panes — arrow keys adjust, Home resets')}
          tabIndex={0}
          title={t('Drag to resize the panes — double-click to reset to automatic width')}
          onPointerDown={startPaneDrag}
          onDoubleClick={() => setPaneFrac(null)}
          onKeyDown={(e) => {
            // A drag handle that only responds to a pointer is a control the
            // keyboard cannot reach at all; 2% a press matches the drag's feel.
            const step = e.key === 'ArrowLeft' ? -0.02 : e.key === 'ArrowRight' ? 0.02 : 0;
            if (step !== 0) {
              e.preventDefault();
              const ws = workspaceRef.current;
              const cur =
                paneFrac ??
                (ws
                  ? (ws.firstElementChild?.getBoundingClientRect().width ?? 0) /
                    ws.getBoundingClientRect().width
                  : 0.4);
              setPaneFrac(Math.min(0.6, Math.max(0.2, cur + step)));
            } else if (e.key === 'Home') {
              e.preventDefault();
              setPaneFrac(null);
            }
          }}
        />

        <main
          className="analysis-pane"
          key={uiMode === 'guided' ? designTab : 'expert'}
        >
      {!woofer && !tweeter ? (
        <p className="sub pane-hint">
          Load driver measurements (Import tab) to start simulating — one driver is enough
          (single-driver mode) — or hit "Load KOAN demo data".
        </p>
      ) : null}

      {(woofer || tweeter) && !result && (
        <div className="panel">
          <div className="verdict mismatch">
            <strong>Nothing to simulate: the view range is invalid.</strong> f min must be below
            f max, inside the measured range (
            {Math.ceil(Math.max(...[woofer, tweeter].filter(Boolean).map((d) => d!.frd.freq[0])))}–
            {Math.floor(
              Math.min(...[woofer, tweeter].filter(Boolean).map((d) => d!.frd.freq.at(-1) ?? 20000)),
            )}{' '}
            Hz). Fix “f min” / “f max” in the Setup tab — everything returns instantly.
          </div>
        </div>
      )}

      {!result && (
        /* The biggest empty surface in the app deserves the Linear treatment:
           say what will appear here, and offer exactly the two actions that
           make it appear. */
        <div className="panel panel-empty pane-welcome">
          <h2>{t('The charts appear here')}</h2>
          <p className="sub">
            {t('Load a frequency response per driver and this pane fills with the summed SPL, the phase alignment between the drivers, and everything else the design needs.')}
          </p>
          <div className="row">
            <button type="button" className="empty-cta" onClick={() => loadDemo()}>
              🎧 {t('Load the demo measurements')}
            </button>
            <button type="button" className="empty-cta" onClick={() => setWizardOpen(true)}>
              📁 {t('Load your own (wizard) →')}
            </button>
          </div>
        </div>
      )}
      {result && (
        <>
          {uiMode !== 'compare' && (
          <div className="panel-toggles">
            <span className="toggles-cap">{t('Charts')}</span>
            {PANEL_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={`panel-toggle${showPanels[k] ? ' on' : ''}`}
                aria-pressed={showPanels[k]}
                title={
                  showPanels[k]
                    ? t('Hide this panel (skips its computation too)')
                    : t('Show this panel')
                }
                onClick={() => setShowPanels((p) => ({ ...p, [k]: !p[k] }))}
              >
                {showPanels[k] ? '✓ ' : ''}
                {t(PANEL_LABEL[k])}
              </button>
            ))}
          </div>
          )}

          {/* Only when the sim TRULY shows raw drivers: no active editor
              network, no live virtual filters, no vxp variant. Shares the
              designShaped definition with the topbar chips — the old inline
              copy of this condition is exactly the two-consumers-two-
              definitions trap. */}
          {result && !designShaped && (
              <div className="panel">
                <div className="verdict no-reference">
                  {emptyNetworkLoaded ? (
                    <>
                      <strong>{t('No network loaded — the active design tab holds no components.')}</strong>{' '}
                      {t('Everything on screen is the RAW drivers summed, and every score beside it judges that and not a design. Load a shortlist row, switch to a saved design tab, or build a network in the Network tab.')}
                    </>
                  ) : (
                    <>
                      <strong>{t('No filter in the simulation — you are looking at the RAW drivers.')}</strong>{' '}
                      {t('Design one in the Filters tab (Optimize — design for me), activate a network in the Network tab')}
                      {project ? t(', or pick a vxp variant in the Setup tab') : ''}.
                    </>
                  )}
                </div>
              </div>
            )}

          {simStale && (
            <div className="panel">
              <div className="verdict no-reference">
                <strong>{simStale.refusal.describe}</strong>{' '}
                {simStale.showing === 'previous'
                  ? t('The charts below keep the previous simulated state, dimmed, until the network in the editor can be solved again.')
                  : t('The charts below show the raw drivers, dimmed, until the network in the editor can be solved.')}
              </div>
            </div>
          )}
          <div className={`panel${splPinned ? ' spl-sticky' : ''}${simStale ? ' sim-stale' : ''}`}>
            <div className="panel-head">
              <h2>SPL{staleTag}</h2>
              <button
                type="button"
                className={`pin-btn${heldTrace ? ' on' : ''}`}
                aria-pressed={!!heldTrace}
                aria-label={heldTrace ? t('Clear the held reference curve') : t('Hold the combined curve as a reference')}
                onClick={() => (heldTrace ? setHeldTrace(null) : holdCurrentTrace())}
                title={
                  heldTrace
                    ? 'A frozen copy of the combined curve is drawn as a grey dashed reference. Click to clear it.'
                    : 'Freeze a copy of the current combined curve in the chart — the honest before/after while you tune. (REW calls this hold trace.)'
                }
              >
                ⭯
              </button>
              <button
                type="button"
                className={`pin-btn${splPinned ? ' on' : ''}`}
                aria-pressed={splPinned}
                // Icon-only: a tooltip is hover-only, so it is no label at all
                // for a keyboard or a screen reader.
                aria-label={t('Pin the SPL chart to the top')}
                onClick={() => setSplPinned((p) => !p)}
                title={
                  splPinned
                    ? 'SPL is pinned: it stays put while the other charts scroll underneath. Click to let it scroll along.'
                    : 'Pin the SPL chart to the top while you scroll through the other charts.'
                }
              >
                📌
              </button>
            </div>
            {(combinedFlat || integration) && (
              <div className="score-strip">
                {combinedFlat && (
                  <>
                    <span className="strip-label">{t('Response flatness')}</span>
                    <span
                      className={`strip-score ${
                        combinedFlat.score >= 85 ? 'ok' : combinedFlat.score >= 70 ? 'warn' : 'bad'
                      }`}
                      title={t('Whole-range flatness of the combined SPL over the currently VISIBLE range (zoom the SPL chart and this follows): 0–100 from the AVERAGE |deviation| vs the median level. Judges the entire range — one narrow dip barely moves it; the peak ±dB next to it still exposes that dip.')}
                    >
                      {combinedFlat.score.toFixed(0)}
                    </span>
                    <span
                      className="strip-item"
                      title={t('Deviation from the median level over the visible range: average (the whole-range number), 95th percentile, and the classic single-spot peak ±dB — a big gap between avg and peak means the trouble is local, not everywhere.')}
                    >
                      avg ±{combinedFlat.avgDevDb.toFixed(2)} · P95 ±
                      {combinedFlat.p95DevDb.toFixed(1)} · peak ±{combinedFlat.rippleDb.toFixed(1)}{' '}
                      dB
                    </span>
                    <span
                      className="strip-item"
                      title={t('Share of the visible range within ±0.5 / ±1 / ±2 dB of the median level: {a}% · {b}% · {c}%.', { a: combinedFlat.withinPct[0.5].toFixed(0), b: combinedFlat.withinPct[1].toFixed(0), c: combinedFlat.withinPct[2].toFixed(0) })}
                    >
                      ±1 dB {combinedFlat.withinPct[1].toFixed(0)}%
                    </span>
                    {/* HONEST BAND ATTRIBUTION. The score judges the VISIBLE
                        range; the optimizer designs from a floor (200 Hz).
                        Measured on Robbert: the same design scores avg ±1.04
                        over 200 Hz–18 kHz and ±1.84 over 20 Hz–20 kHz — the
                        whole difference is the woofer's own rolloff below
                        200 Hz, which no CUT-ONLY passive network can lift.
                        Two watchdogs on two different bands is exactly the
                        bug family bandMetrics was extracted for: say it. */}
                    {optimizerFloorHz !== null && (
                      <span
                        className="strip-item"
                        title={t("The optimizer designs from {hz} Hz up; the score above judges everything you SEE. Below that floor the woofer runs into its own rolloff, and a cut-only passive network cannot lift it — it could only match it by throwing away sensitivity everywhere else (baffle-step territory, a deliberate designer's choice). Zoom the SPL chart to the design band to read the score the optimizer actually worked on.", { hz: Math.round(optimizerFloorHz) })}
                      >
                        {t('designed from {hz} Hz', { hz: Math.round(optimizerFloorHz) })}
                      </span>
                    )}
                    {/* B2: the band a run may be judged on, and where each edge
                        came from. An optimiser that cannot say which band it
                        worked on is not auditable (issue #14) — and an
                        unverified source is named here rather than quietly
                        included. */}
                    {evalBand && (
                      <span
                        className={`strip-item${evalBand.unverified.length > 0 ? ' alert' : ''}`}
                        title={evalBand.describe}
                      >
                        {evalBand.unverified.length > 0 ? '⚠ ' : ''}
                        {t('valid {lo}–{hi} Hz', {
                          lo: String(Math.round(evalBand.fromHz)),
                          hi: String(Math.round(evalBand.toHz)),
                        })}
                      </span>
                    )}
                  </>
                )}
                {sumGroupDelay && (
                  <span
                    className="strip-item"
                    title={t('Group delay of the summed response at three fixed points, with the bulk delay (mic flight, {m} ms median) removed — display only, never optimised. Literature reads a passive multi-way at ~0.5–1.5 ms excess GD in the crossover region; large steps between the three points mean phase rotation across a handover.', { m: sumGroupDelay.medianMs.toFixed(2) })}
                  >
                    {t('excess GD')} 500 Hz {sumGroupDelay.at500 !== null ? `${(sumGroupDelay.at500 * 1000).toFixed(0)} µs` : '—'} · 2 kHz{' '}
                    {sumGroupDelay.at2k !== null ? `${(sumGroupDelay.at2k * 1000).toFixed(0)} µs` : '—'} · 8 kHz{' '}
                    {sumGroupDelay.at8k !== null ? `${(sumGroupDelay.at8k * 1000).toFixed(0)} µs` : '—'}
                  </span>
                )}
                {bomCapEur > 0 && (() => {
                  const bom = schematic ? bomFor(schematic.parts) : null;
                  const tot = bom?.totalEur ?? null;
                  const over = tot !== null && tot > bomCapEur;
                  return (
                    <span
                      className={`strip-item${over ? ' alert' : ''}`}
                      title={t('BOM cap per channel (B1): above it a candidate loses a ranking class. Priced rows only; unpriced parts are listed as [NO PRICE] in the BOM.')}
                    >
                      {over ? '⚠ ' : ''}BOM {tot !== null ? `€${Math.round(tot)}` : '[NO PRICE]'} / {t('cap')} €{bomCapEur}
                      {bom && bom.unmatchedCount > 0 ? ` · ${bom.unmatchedCount} [NO PRICE]` : ''}
                    </span>
                  );
                })()}
                {powerTrend && (
                  <span
                    className={`strip-item${powerTrend.slopeDbPerDecade > 1 ? ' alert' : ''}`}
                    title={t('Trend of the horizontal energy average over the visible band (dB per decade). Reported only — the slope carries NO weight in the optimizer (a rising DI makes it fall; the slope is your room correction\'s business). A RISING slope (> +1 dB/dec) almost always means a level or measurement error — a swapped driver file, a tweeter measured too hot — not a design choice.')}
                  >
                    {powerTrend.slopeDbPerDecade > 1 ? '⚠ ' : ''}
                    {t('power slope {s} dB/dec', { s: (powerTrend.slopeDbPerDecade >= 0 ? '+' : '') + powerTrend.slopeDbPerDecade.toFixed(1) })}
                    {powerTrend.slopeDbPerDecade > 1 ? ` — ${t('rising: check levels/files (no fx influence)')}` : ''}
                  </span>
                )}
                {threeWay && pairScores?.low?.integ.overlapCentreHz != null && pairScores?.high?.integ.overlapCentreHz != null && (() => {
                  const oct = Math.log2(pairScores.high!.integ.overlapCentreHz! / pairScores.low!.integ.overlapCentreHz!);
                  const narrow = oct < 2.3;
                  return (
                    <span
                      className={`strip-item${narrow ? ' alert' : ''}`}
                      title={t('Mid band = log2(M-T crossing / W-M crossing). Below ~2.3 octaves the midrange carries too little of the spectrum for its filters to settle: consider a lower W-M or a higher M-T.')}
                    >
                      {narrow ? '△ ' : ''}{t('mid band {o} oct', { o: oct.toFixed(1) })}
                      {narrow ? ` — ${t('narrow: consider a lower W-M or a higher M-T')}` : ''}
                    </span>
                  );
                })()}
                {netOptAudit && netOptAudit.rSourceTunedOhm !== null && netOptAudit.rSourceTunedOhm >= 0.5 * rSourceLimitOhm && (() => {
                  // Point 4: source resistance at the low driver as a strip item,
                  // naming the parts that carry it (largest |ΔR_source| when
                  // removed). Yellow from half the limit, red over it.
                  const rs = netOptAudit.rSourceTunedOhm;
                  const culprits = [...netOptAudit.entries]
                    .filter((e) => e.dRsource !== null && Math.abs(e.dRsource) >= 0.1 && e.ids.length === 1)
                    .sort((a, b) => Math.abs(b.dRsource!) - Math.abs(a.dRsource!))
                    .slice(0, 3)
                    .map((e) => `${e.label} (${e.dRsource! >= 0 ? '−' : '+'}${Math.abs(e.dRsource!).toFixed(2)} Ω)`);
                  const over = rs > rSourceLimitOhm;
                  return (
                    <span
                      className={`strip-item${over ? ' alert' : ''}`}
                      title={t("Real part of the impedance the LOW driver sees looking back into the network at its box tuning ({hz} Hz) — a model estimate outside the measured band. It adds to Re: Qes × {q}. Above the limit ({lim} Ω) a scan candidate loses a ranking class and structure moves that push it over are refused. Parts listed: the largest change in this number when the part is removed.", { hz: Math.round(netOptAudit.rSourceAtHz ?? 0), q: (netOptAudit.qesFactor ?? 1).toFixed(2), lim: rSourceLimitOhm.toFixed(1) })}
                    >
                      {over ? '⚠ ' : '△ '}
                      {t('source R at the low driver {r} Ω (Qes ×{q})', { r: rs.toFixed(2), q: (netOptAudit.qesFactor ?? 1).toFixed(2) })}
                      {culprits.length > 0 ? ` — ${culprits.join(', ')}` : ''}
                    </span>
                  );
                })()}
                {tolBand && (
                  <span
                    className="strip-item"
                    title={t('How far the combined response can drift when every physical R/L/C lands ±{pct}% off its value. Worst = all errors aligned against you (the guarantee before soldering); RSS = statistically realistic with independent part errors. Most sensitive parts: {parts} — tight-tolerance (or measured) parts pay off there first.', { pct: tolBand.tolPct, parts: tolBand.perPart.slice(0, 5).map((p) => `${p.id} (±${p.maxAbsDb.toFixed(2)} dB)`).join(', ') })}
                  >
                    {t('build ±{pct}%: worst ±{w} · RSS ±{r} dB · sensitive {parts}', {
                      pct: tolBand.tolPct,
                      w: tolBand.worstHalfDb.toFixed(2),
                      r: tolBand.rssHalfDb.toFixed(2),
                      parts: tolBand.perPart.slice(0, 3).map((p) => p.id).join(', '),
                    })}
                  </span>
                )}
                {verifyCompare && (
                  <span
                    className={`strip-item${verifyCompare.maxAbsDb > 3 ? ' alert' : ''}`}
                    title={t('Model vs measurement over {lo}–{hi} Hz. The measurement was level-aligned by {off} dB (median — absolute calibration differs by nature). Worst deviation {d} dB at {f} Hz', { lo: Math.round(verifyCompare.band[0]), hi: Math.round(verifyCompare.band[1]), off: verifyCompare.offsetDb.toFixed(1), d: verifyCompare.maxAt.deltaDb.toFixed(1), f: Math.round(verifyCompare.maxAt.freqHz) }) + (verifyCompare.phase ? t('. Phase: fitted mic delay {us} µs removed, residual avg {a}° / P95 {p}°', { us: verifyCompare.phase.fittedDelayUs.toFixed(0), a: verifyCompare.phase.avgAbsDeg.toFixed(1), p: verifyCompare.phase.p95AbsDeg.toFixed(0) }) + (verifyCompare.phase.looksInverted ? t(' — offset near 180°: the build is likely wired INVERTED vs the sim') : '') : '')}
                  >
                    meas Δ avg ±{verifyCompare.avgAbsDb.toFixed(2)} · P95 ±
                    {verifyCompare.p95AbsDb.toFixed(2)} · worst {verifyCompare.maxAt.deltaDb.toFixed(1)} dB @{' '}
                    {hz(verifyCompare.maxAt.freqHz)}
                    {verifyCompare.phase &&
                      ` · fase ${verifyCompare.phase.avgAbsDeg.toFixed(1)}°/${verifyCompare.phase.p95AbsDeg.toFixed(0)}°`}
                    {verifyCompare.phase?.looksInverted && ' · ⚠ inverted?'}
                  </span>
                )}
                {!soloDriver &&
                  integration &&
                  (integration.score !== null ? (
                    <>
                      <span
                        className={`strip-item${integration.score < 75 ? ' alert' : ''}`}
                        title={t('Summing sanity 0–100: overlap-weighted cos(ε/2) — how well the drivers add up as ONE source. High is NORMAL (45° error still scores 92); it only drops when the drivers actively fight: wrong polarity, a timing fault, or a crossover in a phase null. Deliberately in the background — steer the design on Response flatness and Phase flatness.')}
                      >
                        {t('integration')} {integration.score.toFixed(0)}
                      </span>
                      <span
                        className="strip-item"
                        title={t('Overlap centre — the frequency where the driver levels meet (≈ the acoustic crossover point).')}
                      >
                        {t('overlap')}{' '}
                        {integration.overlapCentreHz !== null
                          ? `${Math.round(integration.overlapCentreHz)} Hz`
                          : '—'}
                      </span>
                      <span
                        className="strip-item"
                        title={t('Integration bandwidth — contiguous band around the overlap centre where the phase error stays ≤90°. Also drawn as the shaded zone in the phase chart.')}
                      >
                        {integration.bandwidth
                          ? t('bandwidth {lo}–{hi} Hz · {oct} oct', { lo: Math.round(integration.bandwidth.fLo), hi: Math.round(integration.bandwidth.fHi), oct: integration.bandwidth.octaves.toFixed(1) })
                          : t('bandwidth none (>90° at the overlap centre)')}
                      </span>
                    </>
                  ) : (
                    <span className="strip-item alert">
                      {t('no overlap within 20 dB — the drivers never meet, nothing to integrate')}
                    </span>
                  ))}
                {pairScores &&
                  (
                    [
                      ['W-M', pairScores.low] as const,
                      ['M-T', pairScores.high] as const,
                    ]
                  ).map(([label, ps]) => (
                    <span
                      key={label}
                      className={`strip-item${
                        ps.integ.score !== null && ps.integ.score < 75 ? ' alert' : ''
                      }`}
                      title={t('Adjacent pair {pair}: summing score (overlap-weighted cos(ε/2)) and where the levels meet', { pair: label === 'W-M' ? t('woofer-mid') : t('mid-tweeter') })}
                    >
                      {label}{' '}
                      {ps.integ.score !== null
                        ? `${ps.integ.score.toFixed(0)} · ${
                            ps.integ.overlapCentreHz !== null
                              ? `${Math.round(ps.integ.overlapCentreHz)} Hz`
                              : '—'
                          }${
                            ps.integ.bandwidth
                              ? ` · ${ps.integ.bandwidth.octaves.toFixed(1)} oct`
                              : ''
                          }`
                        : t('no overlap')}
                    </span>
                  ))}
              </div>
            )}
            <Chart
              storageKey="spl"
              series={splSeries}
              xDomain={xDomain}
              yDomain={splDomain}
              yTickStep={5}
              yUnit="dB"
              height={320}
              onXRangeCommit={commitViewRange}
              onVisibleXChange={onSplVisibleX}
              points={splExtremes}
              handles={splHandles}
              onHandleMove={moveSplHandle}
              onHandleWheel={wheelSplHandle}
            />
            {splHandles && (
              <p className="sub handle-hint">
                Dots = your virtual filters: drag a hollow dot to move a crossover knee, drag a
                solid dot for EQ freq/gain, scroll on it for Q.
              </p>
            )}
            {/* Alignment coloring compares two drivers — nothing to color solo. */}
            {!soloDriver && (
            <div className="align-legend">
              <span className="align-title">{t('Combined-curve color = phase alignment:')}</span>
              {TIER_ORDER.map((c) => (
                <span key={c} className="legend-item">
                  <span className="legend-key" style={{ background: TIER_COLOR[c] }} />
                  {t(TIER_LABEL[c])}
                </span>
              ))}
            </div>
            )}
          </div>

          {directivity && (
            <div className={panelClass}>
              <h2>{t('Directivity (horizontal)')}{staleTag}</h2>
              <p className="sub" style={{ marginBottom: '0.8rem' }}>
                {t('Same filter at every measured angle ({angles}° hor, one side).', { angles: directivity.angles.join('/') })}{' '}
                {Number(cabinet.baffleWidthMm) > Number(cabinet.baffleHeightMm)
                  ? t('Horizontal only — but this baffle is wider than tall, so that IS the plane its drivers lobe in: this data captures it.')
                  : t('Horizontal only — vertical lobing is not in this data.')}
              </p>
              {(() => {
                // Power-response SHAPE readout (aug 2026): slope is reported,
                // never steered; a RISING slope is flagged — that is almost
                // always a level/measurement error, not a design choice.
                const xs = threeWay
                  ? [pairScores?.low?.integ.overlapCentreHz ?? null, pairScores?.high?.integ.overlapCentreHz ?? null]
                  : [integration?.overlapCentreHz ?? null];
                const shp = powerShape(
                  directivity.freq,
                  directivity.powerDb,
                  [Number(fMin) || directivity.freq[0], Number(fMax) || directivity.freq[directivity.freq.length - 1]],
                  xs,
                );
                const rising = shp.slopeDbPerDecade > 1;
                return (
                  <p className="sub" style={{ marginBottom: '0.6rem' }} title={t('Fitted 1st-order trend of the energy average over the visible band (dB per decade) — reported, not optimised: the slope is room/taste territory (a rising DI makes it fall). The residual after detrending is what the in-room weight judges: its std, plus the largest fold within ×/÷1.6 of each crossing.')}>
                    {t('Power response: slope {s} dB/dec · smoothness (residual std) {r} dB · fold at crossings {f} dB', {
                      s: (shp.slopeDbPerDecade >= 0 ? '+' : '') + shp.slopeDbPerDecade.toFixed(1),
                      r: shp.residualStdDb.toFixed(2),
                      f: shp.foldDb.toFixed(2),
                    })}
                    {rising && (
                      <strong> ⚠ {t('rising power response — almost always a level or measurement error, not a design choice')}</strong>
                    )}
                  </p>
                );
              })()}
              {showPanels.directivity && (
              <>
              <Chart
                storageKey="directivity"
                series={[
                  ...directivity.angles.map((a, i) => ({
                    id: `a${a}`,
                    label: `${a}°`,
                    color: a === 0 ? 'var(--viz-combined)' : 'var(--viz-tick)',
                    width: a === 0 ? 2.5 : 1.2,
                    x: directivity.freq,
                    y: directivity.combinedByAngle[i],
                  })),
                  {
                    id: 'lw',
                    label: t('Listening window (0–30°)'),
                    color: 'var(--viz-tweeter)',
                    dash: '2 3',
                    width: 2,
                    x: directivity.freq,
                    y: directivity.listeningWindowDb,
                  },
                  {
                    id: 'pwr',
                    label: t('Energy average (hor)'),
                    color: 'var(--viz-woofer)',
                    dash: '6 4',
                    width: 2.5,
                    x: directivity.freq,
                    y: directivity.powerDb,
                  },
                ]}
                xDomain={xDomain}
                yDomain={splDomain}
                yTickStep={5}
                yUnit="dB"
                height={300}
              />
              <Chart
                series={[
                  {
                    id: 'di',
                    label: t('Directivity index (on-axis − energy average)'),
                    color: 'var(--viz-tweeter)',
                    x: directivity.freq,
                    y: directivity.diDb,
                  },
                ]}
                xDomain={xDomain}
                yDomain={[-6, 12]}
                yTickStep={3}
                yUnit="dB"
                height={200}
                yReference={0}
              />
              </>
              )}
              {sonogram && (
                <>
                  <div className="row" style={{ margin: '1rem 0 0.4rem' }}>
                    <h3 style={{ margin: 0 }}>{t('Sonogram')}</h3>
                    <label>
                      {t('Scale')}{' '}
                      <select
                        title={t('Normalized: each frequency relative to its own 0° level (pure beamwidth). Absolute: relative to the loudest point (level and directivity together).')}
                        value={sonogramMode}
                        onChange={(e) => setSonogramMode(e.target.value as SonogramMode)}
                      >
                        <option value="normalized">{t('Normalized (0° = 0 dB per frequency)')}</option>
                        <option value="absolute">{t('Absolute (rel. loudest point)')}</option>
                      </select>
                    </label>
                  </div>
                  <p className="sub" style={{ marginBottom: '0.6rem' }}>
                    {t('Negative angles mirror the measured side (symmetry assumed). Dashed contour = −6 dB beamwidth; gaps mean wider than the measured {deg}°.', { deg: Math.max(...directivity.angles) })}
                  </p>
                  <Sonogram
                    data={sonogram.data}
                    beamwidthDeg={sonogram.beamwidth}
                    xDomain={xDomain}
                  />
                </>
              )}
            </div>
          )}

          {/* Empty states: a ticked panel with no data used to vanish without a
              trace — the user can't tell a missing feature from a missing
              prerequisite. An empty panel is free teaching space: what appears
              here, and what it needs. */}
          {(showPanels.directivity || showPanels.sonogram) && !directivity && result && (
            <div className="panel panel-empty">
              <h2>
                {showPanels.sonogram
                  ? t('Directivity & sonogram (horizontal)')
                  : t('Directivity (horizontal)')}
              </h2>
              <p className="sub">
                {t("Appears once angle measurements are loaded — select the 15/30/45°… sweeps together with each driver's 0° file on the Import tab")}
                {threeWay ? t(' (all three drivers need a set)') : ''}
                {t('. It shows how the design behaves off-axis: the sound that reaches you via the walls. The demo set includes a full set of angles.')}
              </p>
              <button type="button" className="empty-cta" onClick={() => setDesignTab('import')}>
                {t('Open {place} →', { place: uiMode === 'guided' ? t('Your project') : t('the Import tab') })}
              </button>
            </div>
          )}

          {showPanels.transfer && sim?.transfers && result && (
            <div className={panelClass}>
              <h2>{t('Filter transfer (driver voltage vs source)')}{staleTag}</h2>
              <Chart
                storageKey="transfer"
                series={[
                  sim.transfers.woofer && {
                    id: 'hw',
                    label: threeWay ? 'Woofer filter' : 'Woofer/mid filter',
                    color: 'var(--viz-woofer)',
                    x: result.freq,
                    y: sim.transfers.woofer.map((h) => 20 * Math.log10(cAbs(h) || Number.MIN_VALUE)),
                  },
                  (sim.transfers.mid ?? null) && {
                    id: 'hm',
                    label: t('Mid filter'),
                    color: 'var(--viz-mid)',
                    x: result.freq,
                    y: sim.transfers.mid!.map((h) => 20 * Math.log10(cAbs(h) || Number.MIN_VALUE)),
                  },
                  sim.transfers.tweeter && {
                    id: 'ht',
                    label: t('Tweeter filter'),
                    color: 'var(--viz-tweeter)',
                    x: result.freq,
                    y: sim.transfers.tweeter.map((h) => 20 * Math.log10(cAbs(h) || Number.MIN_VALUE)),
                  },
                ].filter((s): s is NonNullable<typeof s> => s !== null)}
                xDomain={xDomain}
                yDomain={[-50, 5]}
                yTickStep={5}
                yUnit="dB"
                height={260}
              />
            </div>
          )}

          {showPanels.transfer && !sim?.transfers && result && (
            <div className="panel panel-empty">
              <h2>{t('Filter transfer (driver voltage vs source)')}</h2>
              <p className="sub">
                {t('Appears once a crossover network runs in the sim — build one (Optimize, or Build passive filter on the Filters tab), draw one on the Network tab, or pick a VituixCAD variant. It shows the electrical filter each driver actually receives.')}
              </p>
              <button type="button" className="empty-cta" onClick={() => setDesignTab('filters')}>
                {t('Open {place} →', { place: uiMode === 'guided' ? t('Design it') : t('the Filters tab') })}
              </button>
            </div>
          )}

          {showPanels.impedance && !systemZInfo && result && (
            <div className="panel panel-empty">
              <h2>{t('System impedance (amplifier load)')}</h2>
              <p className="sub">
                {t('Appears once a passive network with measured impedances runs in the sim. It shows the load your amplifier sees — the side of a design a response chart cannot show, and the reason a "flat" crossover can still be a bad one.')}
              </p>
              <button type="button" className="empty-cta" onClick={() => setDesignTab('filters')}>
                {t('Open {place} →', { place: uiMode === 'guided' ? t('Design it') : t('the Filters tab') })}
              </button>
            </div>
          )}

          {systemZInfo && result && (
            <div className={panelClass}>
              <h2>{t('System impedance (amplifier load)')}{staleTag}</h2>
              <div className="score-strip">
                <span className="strip-label">Z min</span>
                <span
                  className={`strip-score ${
                    systemZInfo.minOhm >= 6.4 ? 'ok' : systemZInfo.minOhm >= 3.2 ? 'warn' : 'bad'
                  }`}
                  title={t("Lowest system impedance the amplifier sees — the only side that can hurt it (current/heat). IEC 60268-5: minimum ≥ 0.8× the rated impedance. Green ≥ 6.4 Ω (safe as an '8 Ω' speaker), orange ≥ 3.2 Ω ('4 Ω' territory — fine for most solid-state amps), red below that.")}
                >
                  {systemZInfo.minOhm.toFixed(1)} Ω
                </span>
                <span className="strip-item">@ {Math.round(systemZInfo.minHz)} Hz</span>
                <span
                  className="strip-item"
                  title={t('Load character AT the impedance minimum: arg(Z), negative = capacitive, positive = inductive. Low |Z| alone costs current/heat; low AND strongly capacitive (≲ −45°) is the combination marginal amplifiers (tube, some class-D) dislike most.')}
                >
                  {systemZInfo.minPhaseDeg > 0 ? '+' : ''}
                  {systemZInfo.minPhaseDeg.toFixed(0)}°{' '}
                  {Math.abs(systemZInfo.minPhaseDeg) < 15
                    ? t('(resistive)')
                    : systemZInfo.minPhaseDeg < 0
                      ? t('(capacitive)')
                      : t('(inductive)')}
                </span>
                <span
                  className="strip-item"
                  title={t('Highest system impedance. High is HARMLESS — the amp simply delivers less current there. It only becomes audible with a high-output-impedance amplifier (tube amps): the response then follows this curve.')}
                >
                  max {systemZInfo.maxOhm >= 1000 ? '≥1k' : systemZInfo.maxOhm.toFixed(0)} Ω @{' '}
                  {Math.round(systemZInfo.maxHz)} Hz
                </span>
              </div>
              <Chart
                storageKey="impedance"
                series={[
                  {
                    id: 'zin',
                    label: t('System |Z|'),
                    color: 'var(--viz-combined)',
                    width: 2.5,
                    x: result.freq,
                    y: systemZInfo.mags,
                  },
                  ...tabGhosts.z,
                ]}
                xDomain={xDomain}
                yDomain={[0, Math.min(200, Math.max(20, Math.ceil((systemZInfo.maxOhm * 1.1) / 10) * 10))]}
                yTickStep={systemZInfo.maxOhm <= 36 ? 5 : systemZInfo.maxOhm <= 90 ? 10 : 25}
                yUnit="Ω"
                height={240}
                xMarkers={[{ x: systemZInfo.minHz, color: 'var(--viz-tick)', label: 'Z min' }]}
              />
              <Chart
                storageKey="impedance-phase"
                series={[
                  {
                    id: 'zphase',
                    label: t('Z phase (− = capacitive, + = inductive)'),
                    color: 'var(--viz-combined)',
                    dash: '5 3',
                    width: 2,
                    x: result.freq,
                    y: systemZInfo.phase,
                  },
                ]}
                xDomain={xDomain}
                yDomain={[-90, 90]}
                yTickStep={30}
                yUnit="°"
                height={150}
                xMarkers={[{ x: systemZInfo.minHz, color: 'var(--viz-tick)', label: 'Z min' }]}
              />
            </div>
          )}

          {showPanels.phase && (
          <div className={panelClass}>
            <h2>
              {soloDriver
                ? t('{drv} phase (total)', { drv: soloDriver === 'woofer' ? t('Woofer/mid') : t('Tweeter') })
                : threeWay
                  ? t('Relative phase per driver pair')
                  : t('Tweeter phase relative to woofer')}
              {staleTag}
            </h2>
            {phaseStats && (
              <div className="score-strip">
                <span className="strip-label">{t('Phase flatness')}</span>
                <span
                  className="strip-score"
                  title={t('Flatness score 0–100 over the driver overlap (overlap-weighted) — how flat the relative phase stays where both drivers play.')}
                >
                  {phaseStats.score}
                </span>
                <span className="strip-item">{phaseStats.label}</span>
                <span
                  className="strip-item"
                  title={t('Average |relative phase| in the overlap region.')}
                >
                  avg {phaseStats.avgErrorDeg.toFixed(1)}°
                </span>
                <span
                  className="strip-item"
                  title={t('95th-percentile phase error — the worst 5% excluded.')}
                >
                  P95 {phaseStats.p95ErrorDeg.toFixed(0)}°
                </span>
                <span
                  className="strip-item"
                  title={t('Standard deviation of the phase error — the wobble.')}
                >
                  σ {phaseStats.stdDevDeg.toFixed(1)}°
                </span>
                <span
                  className="strip-item"
                  title={t('Share of the overlap region with the phase error within ±5 / ±10 / ±15°.')}
                >
                  ±5° {phaseStats.withinPct[5].toFixed(0)}% · ±10°{' '}
                  {phaseStats.withinPct[10].toFixed(0)}% · ±15°{' '}
                  {phaseStats.withinPct[15].toFixed(0)}%
                </span>
              </div>
            )}
            {pairScores && (
              <div className="score-strip">
                <span className="strip-label">{t('Phase flatness')}</span>
                {(
                  [
                    ['woofer-mid', pairScores.low.stats] as const,
                    ['mid-tweeter', pairScores.high.stats] as const,
                  ]
                ).map(([label, st]) => (
                  <span
                    key={label}
                    className="strip-item"
                    title={t('Relative-phase flatness over the {pair} overlap window: score 0–100, average and P95 |phase error|.', { pair: t(label) })}
                  >
                    {t(label)}{' '}
                    {st
                      ? `${st.score} · avg ${st.avgErrorDeg.toFixed(1)}° · P95 ${st.p95ErrorDeg.toFixed(0)}°`
                      : t('no overlap')}
                  </span>
                ))}
              </div>
            )}
            <Chart
              storageKey="phase"
              series={phaseSeries}
              xDomain={xDomain}
              yDomain={[-180, 180]}
              yTickStep={45}
              yUnit="°"
              height={280}
              yReference={0}
              referenceLabel={soloDriver ? '0°' : 'woofer 0°'}
              bands={soloDriver ? [] : phaseBands}
              xBands={
                integration?.bandwidth
                  ? [
                      {
                        from: integration.bandwidth.fLo,
                        to: integration.bandwidth.fHi,
                        color: 'var(--viz-combined)',
                        opacity: 0.08,
                        label: t('integration bandwidth {oct} oct', { oct: integration.bandwidth.octaves.toFixed(1) }),
                      },
                    ]
                  : pairScores
                    ? [
                        ...(pairScores.low.integ.bandwidth
                          ? [
                              {
                                from: pairScores.low.integ.bandwidth.fLo,
                                to: pairScores.low.integ.bandwidth.fHi,
                                color: 'var(--viz-mid)',
                                opacity: 0.08,
                                label: t('W-M bandwidth {oct} oct', { oct: pairScores.low.integ.bandwidth.octaves.toFixed(1) }),
                              },
                            ]
                          : []),
                        ...(pairScores.high.integ.bandwidth
                          ? [
                              {
                                from: pairScores.high.integ.bandwidth.fLo,
                                to: pairScores.high.integ.bandwidth.fHi,
                                color: 'var(--viz-tweeter)',
                                opacity: 0.08,
                                label: t('M-T bandwidth {oct} oct', { oct: pairScores.high.integ.bandwidth.octaves.toFixed(1) }),
                              },
                            ]
                          : []),
                      ]
                    : undefined
              }
              xMarkers={
                integration?.overlapCentreHz
                  ? [
                      {
                        x: integration.overlapCentreHz,
                        label: t('overlap {hz} Hz', { hz: Math.round(integration.overlapCentreHz) }),
                      },
                    ]
                  : pairScores
                    ? [
                        ...(pairScores.low.integ.overlapCentreHz
                          ? [
                              {
                                x: pairScores.low.integ.overlapCentreHz,
                                label: `W-M ${Math.round(pairScores.low.integ.overlapCentreHz)} Hz`,
                              },
                            ]
                          : []),
                        ...(pairScores.high.integ.overlapCentreHz
                          ? [
                              {
                                x: pairScores.high.integ.overlapCentreHz,
                                label: `M-T ${Math.round(pairScores.high.integ.overlapCentreHz)} Hz`,
                              },
                            ]
                          : []),
                      ]
                    : undefined
              }
              onXRangeCommit={commitViewRange}
            />
            {/* Tier zones read the RELATIVE phase — hidden with it in solo mode. */}
            {!soloDriver && (
            <div className="align-legend">
              <span className="align-title">{t('Zones & line color = distance from 0°:')}</span>
              {TIER_ORDER.map((c) => (
                <span key={c} className="legend-item">
                  <span className="legend-key" style={{ background: TIER_COLOR[c] }} />
                  {t(TIER_LABEL[c])}
                </span>
              ))}
            </div>
            )}
          </div>
          )}
        </>
      )}

      {timeDomain && result && (
        <>
          <div className={panelClass}>
            <h2>{t('Excess group delay (combined)')}{staleTag}</h2>
            <Chart
              series={[
                {
                  id: 'egd',
                  label: t('Excess group delay (bulk {ms} ms removed)', { ms: timeDomain.egd.minDelayMs.toFixed(2) }),
                  color: 'var(--viz-combined)',
                  x: timeDomain.egd.freq,
                  y: timeDomain.egd.egdMs,
                },
              ]}
              xDomain={xDomain}
              yDomain={[
                -0.2,
                Math.min(
                  8,
                  Math.max(1, Math.ceil(Math.max(...timeDomain.egd.egdMs.filter((_, i) => timeDomain.egd.freq[i] >= 300)) * 2) / 2),
                ),
              ]}
              yTickStep={0.5}
              yUnit="ms"
              height={240}
              yReference={0}
            />
          </div>

          <div className={panelClass}>
            <h2>{t('Step response & ETC (IFFT of combined response)')}{staleTag}</h2>
            <p className="sub" style={{ marginBottom: '0.8rem' }}>
              {t('Sanity check, not a measurement — band edges are tapered. t = 0 at the impulse peak (arrival {ms} ms).', { ms: timeDomain.td.peakTimeMs.toFixed(2) })}
            </p>
            <Chart
              series={[
                {
                  id: 'step',
                  label: t('Step response (normalized)'),
                  color: 'var(--viz-combined)',
                  x: timeDomain.td.timeMs,
                  y: timeDomain.td.step,
                },
                {
                  id: 'imp',
                  label: t('Impulse (normalized)'),
                  color: 'var(--viz-tweeter)',
                  dash: '4 4',
                  x: timeDomain.td.timeMs,
                  y: timeDomain.td.impulse,
                },
              ]}
              xDomain={[timeDomain.td.timeMs[0], timeDomain.td.timeMs[timeDomain.td.timeMs.length - 1]]}
              xScale="linear"
              xUnit="ms"
              yDomain={[-1.1, 1.1]}
              yTickStep={0.5}
              yUnit=""
              height={240}
              yReference={0}
            />
            <Chart
              series={[
                {
                  id: 'etc',
                  label: t('ETC — energy-time curve'),
                  color: 'var(--viz-woofer)',
                  x: timeDomain.td.timeMs,
                  y: timeDomain.td.etcDb,
                },
              ]}
              xDomain={[timeDomain.td.timeMs[0], timeDomain.td.timeMs[timeDomain.td.timeMs.length - 1]]}
              xScale="linear"
              xUnit="ms"
              yDomain={[-60, 0]}
              yTickStep={10}
              yUnit="dB"
              height={220}
            />
          </div>
        </>
      )}

      {engineSelection.reporting && engineV2Report && (
        engineV2Report.report ? (
          <EngineV2Panel
            report={engineV2Report.report}
            ambiguous={engineV2Report.ambiguous}
            floors={v2Floors}
          />
        ) : (
          <div className="panel v2-panel">
            <div className="v2-head">
              <h3>{engineSelection.label}</h3>
              <div className="v2-stamp">{engineSelection.version}</div>
            </div>
            <p className="v2-problem">
              {t('The v2 report could not be built: {msg}', { msg: engineV2Report.error ?? '' })}
            </p>
          </div>
        )
      )}
      {engineSelection.reporting && !engineV2Report && (
        <div className="panel v2-panel">
          <div className="v2-head">
            <h3>{engineSelection.label}</h3>
            <div className="v2-stamp">{engineSelection.version}</div>
          </div>
          <p className="v2-muted">
            {t('Load at least one driver measurement or impedance sweep — the v2 pass derives everything from the files, so with none there is nothing to derive.')}
          </p>
        </div>
      )}

        </main>
      </div>
    </div>
  );
}

function SynthChart({
  synth,
  freq,
  xDomain,
}: {
  synth: {
    woofer?: SynthesisResult;
    mid?: SynthesisResult;
    tweeter?: SynthesisResult;
    mode: 'filter' | 'acoustic';
  };
  freq: readonly number[];
  xDomain: [number, number];
}) {
  const dbOf = (h: Complex) => 20 * Math.log10(cAbs(h) || 1e-9);
  const acoustic = synth.mode === 'acoustic';

  const series: Series[] = [];
  for (const slot of ['woofer', 'mid', 'tweeter'] as const) {
    const r = synth[slot];
    if (!r) continue;
    const color = `var(--viz-${slot})`;
    const label = slot === 'woofer' ? (synth.mid ? 'Woofer' : 'Woofer/mid') : slot === 'mid' ? 'Midrange' : 'Tweeter';
    if (acoustic && r.acousticAchievedDb && r.acousticTargetDb) {
      series.push(
        { id: `${slot}-t`, label: `${label} target shape`, color, dash: '5 4', x: freq, y: r.acousticTargetDb },
        { id: `${slot}-a`, label: `${label} result (driver × filter)`, color, x: freq, y: r.acousticAchievedDb },
      );
    } else {
      series.push(
        { id: `${slot}-t`, label: `${label} target`, color, dash: '5 4', x: freq, y: r.target.map(dbOf) },
        { id: `${slot}-a`, label: `${label} achieved`, color, x: freq, y: r.achieved.map(dbOf) },
      );
    }
  }

  let yDomain: [number, number] = [-50, 5];
  if (acoustic) {
    const vals = series.flatMap((s) => s.y.filter((v) => Number.isFinite(v)));
    const hi = Math.ceil((Math.max(...vals) + 2) / 5) * 5;
    yDomain = [hi - 50, hi];
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <Chart
        series={series}
        xDomain={xDomain}
        yDomain={yDomain}
        yTickStep={5}
        yUnit="dB"
        height={260}
      />
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

/** One network-design tab: click = activate, double-click = rename inline. */
function DesignTab({
  design,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  design: NetworkDesign;
  active: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(design.name);
  return (
    <span className={`design-tab${active ? ' active' : ''}`}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onRename(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(design.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={`design-tab-name${design.bandAtDesign ? '' : ' band-unknown'}`}
          onClick={onSelect}
          onDoubleClick={() => {
            setDraft(design.name);
            setEditing(true);
          }}
          title={
            `${t('Click to activate, double-click to rename')} · ` +
            (design.bandAtDesign
              ? `computed on ${Math.round(design.bandAtDesign.fromHz)}–${Math.round(
                  design.bandAtDesign.toHz,
                )} Hz`
              : 'computed against an unknown validity band — it predates validity bands, or the ' +
                'source it was made on had no gate length. It stays visible, but do not read it ' +
                'as verified.')
          }
        >
          {design.name}
        </button>
      )}
      <button
        type="button"
        className="design-tab-close"
        onClick={() => onDelete()}
        title={t('Delete "{name}"', { name: design.name })}
        aria-label={t('Delete tab "{name}"', { name: design.name })}
      >
        ×
      </button>
    </span>
  );
}

/** "Synth", "Synth 2", "Synth 3" … — first free variant of a tab name. */
function uniqueDesignName(base: string, existing: readonly NetworkDesign[]): string {
  const taken = new Set(existing.map((d) => d.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const name = `${base} ${i}`;
    if (!taken.has(name)) return name;
  }
}

function verdictClass(v: 'plausible' | 'suspect' | 'unreliable'): string {
  return v === 'plausible' ? 'ok' : v === 'suspect' ? 'mismatch' : 'no-reference';
}

function verdictHeading(v: 'plausible' | 'suspect' | 'unreliable'): string {
  switch (v) {
    case 'plausible':
      return t('✓ Shared time reference plausible');
    case 'suspect':
      return t('✗ Time bases disagree');
    case 'unreliable':
      return t('⚠ Cannot judge (fit not delay-like)');
  }
}
