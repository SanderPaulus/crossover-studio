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
import { parseFrd } from './lib/parsers/frd.ts';
import { parseZma } from './lib/parsers/zma.ts';
import { parseLim, limToZmaText } from './lib/parsers/lim.ts';
import { classifyLevelProfile } from './lib/parsers/classify.ts';
import { compareMeasurement } from './lib/verification.ts';
import { parseVxp, type VxpCrossover, type VxpPart, type VxpProject } from './lib/parsers/vxp.ts';
import { estimateBulkDelay, assessSharedReference, assessPairTimeBase } from './lib/timing.ts';
import { logspace, resample, combine, combineN, offsetMmToDelayS, applyTransfer, type GriddedResponse } from './lib/dsp.ts';
import { computeIntegration } from './lib/integration.ts';
import { crossoverToNetlist } from './lib/vxpNetwork.ts';
import { solveNetwork } from './lib/network.ts';
import {
  canonicalModelForRole,
  isTweeterModel,
  pickSlots,
  pickSlotsN,
  withSlotAliasesN,
  type BranchRole,
} from './lib/driverSlots.ts';
import { estimateCoilDcr, validateNetlist } from './lib/netlistEdit.ts';
import {

  checkTransition,
  mergeNearFar,
  nearFieldMaxHz,
  nearToFarDb,
  sumRadiators,
} from './lib/nearField.ts';
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
import { BaffleView } from './components/BaffleView.tsx';
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
  setCustomSeries,
  type CatalogPart,
  type CatalogSeries,
  type SnapPrefs,
} from './lib/catalog.ts';
import {
  cancelOptimTasks,
  CancelledError,
  runChainScan,
  runNetOptimizeTask,
  runSoloChainTask,
  runVfRoundsTask,
  runChain3Scan,
} from './lib/optimClient.ts';
import { crossover3Variants, rankChain3Results } from './lib/threeWayChain.ts';
import { Z_FLOOR_OHM } from './lib/netOptimizer.ts';
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
import { type VfOptimizeResult, type StructChoice } from './lib/vfOptimizer.ts';
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
import Chart, { type ChartHandle, type Series } from './components/Chart.tsx';
import DriverFilterControls from './components/FilterControls.tsx';
import { LogoMark, LogoWord } from './components/Logo.tsx';
import demoMid from './lib/parsers/fixtures/mid_hor0_mettape.txt?raw';
import demoTweet from './lib/parsers/fixtures/tweet_hor0_mettape.txt?raw';
import { beamingCeilingHz, computeDirectivity, computeDirectivityN, type AngleResponse } from './lib/directivity.ts';
import { reachesLevelHz } from './lib/bandMetrics.ts';
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
    const g = resample(z.freq, z.magnitude, z.phase, [...grid], { clampEdges: true });
    out[model] = g.spl.map((mag, i) => fromPolar(mag, (g.phaseDeg[i] * Math.PI) / 180));
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
  /** Microphone distance during the FRD sweeps, mm. */
  micDistanceMm: string;
  /** Fixed VERTICAL angle of the rig, degrees; + = mic above the reference
   *  plane. Usually 0 (mic level with the reference point). Signed on purpose:
   *  on a driver 380 mm low at 500 mm, ±10° swings the true angle 31°↔43°. */
  micElevationDeg: string;
  /** The reflection-free window the operator ACTUALLY used, ms. Ground truth
   *  when known — it beats any prediction from geometry. '' = predict it. */
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
 * Name the criterion that actually SETS a handover ceiling. A window the
 * designer cannot attribute is a window he cannot act on: "572 Hz" invites
 * an argument, "572 Hz (lobing, 300 mm spacing)" invites a decision — move
 * the drivers closer, or accept the null and raise k.
 */
function bindingCeil(
  lim: {
    beam: number | null;
    lobe: number | null;
    /** Lobing of a MULTI-driver branch on its own spacing — a separate
     *  criterion from lobing against the neighbouring branch, and usually
     *  the lower of the two once a branch holds more than one driver. */
    arrayLobe: number | null;
    breakup: { hz: number; corroboratedByZ: boolean } | null;
    excursion: number | null;
  },
  beamMeasured: boolean,
  /** The driver this ceiling came from does not radiate from the front. The
   *  NUMBER still stands — a front sweep measures how fast the system falls
   *  off-axis, and that is a real reason to hand over below it — but calling
   *  it cone beaming would be wrong: most of it is the cabinet shadowing a
   *  driver that points elsewhere. Name what it is, do not drop the bound. */
  beamOffBaffle = false,
): string {
  const cands: Array<[number, string]> = [];
  if (lim.beam !== null)
    cands.push([
      lim.beam,
      beamMeasured
        ? beamOffBaffle
          ? 'measured directivity, off-baffle driver'
          : 'measured beaming'
        : 'beaming',
    ]);
  if (lim.lobe !== null) cands.push([lim.lobe, 'lobing']);
  if (lim.arrayLobe !== null) cands.push([lim.arrayLobe, 'array lobing']);
  if (lim.breakup)
    cands.push([
      lim.breakup.hz / 3,
      `breakup ${Math.round(lim.breakup.hz)} Hz${lim.breakup.corroboratedByZ ? '+Z' : ''}`,
    ]);
  if (cands.length === 0) return '';
  cands.sort((a, b) => a[0] - b[0]);
  return ` (${cands[0][1]})`;
}

function excessDelayMsOf(frd: Parsed): number | null {
  try {
    const lo = Math.max(500, frd.freq[0] * 1.05);
    const hi = Math.min(5000, frd.freq[frd.freq.length - 1] * 0.95);
    if (hi <= lo * 1.5) return null;
    const g = resample(frd.freq, frd.spl, frd.phase, logspace(lo, 20000, 400));
    const mp = minimumPhaseDeg(g.freq, g.spl);
    const excess = g.phaseDeg.map((p, i) => p - mp[i]);
    return estimateBulkDelay(g.freq, excess, [lo, hi]).delayMs;
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
  /** Breakup guard: stopband leakage beside the crossover must stay ≥20 dB
   *  down — resonance phase can't be filtered, only made irrelevant. */
  const [breakupGuard, setBreakupGuard] = useState(true);
  /** Optional crossover-range constraint for the optimizer (Hz). */
  const [xoRangeOn, setXoRangeOn] = useState(false);
  /** Crossover point the designer picks: centre frequency ± margin (Hz).
   *  Margin 0 = "exactly there" (a minimal ±2% keeps the search alive). */
  const [xoFreqHz, setXoFreqHz] = useState('2200');
  const [xoMarginHz, setXoMarginHz] = useState('400');
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
  const [xoLowFreqHz, setXoLowFreqHz] = useState('400');
  const [xoLowMarginHz, setXoLowMarginHz] = useState('150');
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
  const designShaped = useMemo(
    () =>
      networkActive ||
      (project != null && xoName !== 'none') ||
      (!vfBypass &&
        (isActive(vFilters.woofer) ||
          isActive(vFilters.tweeter) ||
          (threeWay && isActive(vFilters.mid)))),
    [networkActive, project, xoName, vfBypass, vFilters, threeWay],
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

  function commitSchematic(parts: VxpPart[]) {
    if (!activeDesign) return;
    setSchHistory((h) => [...h.slice(-49), activeDesign.parts]);
    setSchFuture([]); // a fresh edit invalidates the redo branch
    setDesigns((ds) => ds.map((d) => (d.id === activeDesign.id ? { ...d, parts } : d)));
  }

  function undoSchematic() {
    if (schHistory.length === 0 || !activeDesign) return;
    const prev = schHistory[schHistory.length - 1];
    setSchFuture((f) => [...f.slice(-49), activeDesign.parts]);
    setDesigns((ds) => ds.map((d) => (d.id === activeDesign.id ? { ...d, parts: prev } : d)));
    setSchHistory(schHistory.slice(0, -1));
  }

  function redoSchematic() {
    if (schFuture.length === 0 || !activeDesign) return;
    const next = schFuture[schFuture.length - 1];
    setSchHistory((h) => [...h.slice(-49), activeDesign.parts]);
    setDesigns((ds) => ds.map((d) => (d.id === activeDesign.id ? { ...d, parts: next } : d)));
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

  function setWorkingDesign(parts: VxpPart[]) {
    const existing = designs.find((d) => d.id === WORKING_ID);
    if (existing && activeDesignId === WORKING_ID) {
      setSchHistory((h) => [...h.slice(-49), existing.parts]);
    } else {
      setSchHistory([]);
    setSchFuture([]);
    }
    setDesigns((ds) =>
      ds.some((d) => d.id === WORKING_ID)
        ? ds.map((d) => (d.id === WORKING_ID ? { ...d, parts } : d))
        : [...ds, { id: WORKING_ID, name: 'Working', parts }],
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

  function loadDemo() {
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
        setCustomSeries(imp.series, imp.parts);
        localStorage.setItem(CUSTOM_CATALOG_KEY, serializeCatalog(imp.series, imp.parts));
        setPersistNote(
          t('Demo catalog loaded — {n} priced SKUs (snap, BOM and inspector use them)', { n: imp.parts.length }),
        );
      } catch {
        // Demo catalog fixture unreadable: run with built-ins.
      }
    }
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

  /** 3-way pins for the design chain (freq ± margin per handover). */
  const xoPinsValue = (): {
    low?: { freq: number; margin: number };
    high?: { freq: number; margin: number };
  } => {
    if (!xoRangeOn) return {};
    return {
      low: { freq: num(xoLowFreqHz, 400), margin: num(xoLowMarginHz, 150) },
      high: { freq: num(xoFreqHz, 2200), margin: num(xoMarginHz, 400) },
    };
  };

  /** Designer's crossover point as [lo, hi] for the optimizers: centre ±
   *  margin; a (near-)zero margin still leaves ±2% so the search stays
   *  non-degenerate ("exactly there"). Pins the ACOUSTIC crossing. */
  const xoRangeValue = (): [number, number] | undefined => {
    if (!xoRangeOn) return undefined;
    const f = num(xoFreqHz, 2200);
    const m = Math.max(num(xoMarginHz, 400), f * 0.02);
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
    const statedHz = gateLimitHz(Number(cabinet.gateMs));
    const reliable =
      statedHz !== null
        ? { fromHz: statedHz, gateMs: Number(cabinet.gateMs), stated: true }
        : predicted
          ? { fromHz: predicted.fromHz, gateMs: predicted.gateMs, stated: false }
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
    const out: Partial<Record<BranchRole, { frd: Parsed; report: string; ok: boolean }>> = {};
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
      const proposed =
        Number(slot.transitionHz) > 0
          ? Number(slot.transitionHz)
          : farMin !== null
            ? Math.min(nearMax * 0.8, Math.max(farMin * 1.3, 300))
            : 300;
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
        frd: { freq: [...g], spl: m.spl, phase: m.phaseDeg, hasPhase: true, meta: loaded.frd.meta },
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woofer, midDrv, tweeter, nearField, sdCm2, cabinet.micDistanceMm, cabinetInfo]);

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

  const sim = useMemo(() => {
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
    if (useEditor && Object.keys(impedances).length === 0) {
      xoError = 'Network editor needs measured impedances — add a .ZMA per driver (or load the demo).';
    }
    if ((useEditor || xo) && Object.keys(impedances).length > 0) {
      try {
        const netlist = crossoverToNetlist(useEditor ? schematic! : xo!).netlist;
        const zOnGrid = Object.fromEntries(
          Object.entries(impedances).map(([model, z]) => {
            const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
            return [model, g.spl.map((mag, i) => fromPolar(mag, (g.phaseDeg[i] * Math.PI) / 180))];
          }),
        );
        const sol = solveNetwork(netlist, grid, zOnGrid);
        // Map by SLOT, not a hard-coded model name — an imported vxp names its
        // drivers freely (e.g. "Woofer 12w8524" / "Tweeter r2604"), so matching
        // literal "mid"/"tweeter" silently applied NO filter and summed the raw
        // drivers (crossover looked like it landed way too high).
        if (m) {
          const { hW, hM, hT, ambiguous } = slotTransfersN(sol);
          if (ambiguous) {
            xoError = ambiguous;
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
        xoError = e instanceof Error ? e.message : String(e);
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
        base,
      };
    }

    return {
      combined: combine(w, t, tAdj),
      mid: null,
      transfers,
      systemZ,
      xoError,
      base,
    };
  }, [woofer, midDrv, threeWay, tweeter, project, impedances, xoName, vFilters, vfBypass, phaseMode, fMinDeb, fMaxDeb, offsetMm, trimDb, inverted, midOffsetMm, midTrimDb, midInverted, branchAdj, schematic, networkActive]);

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
      const g = resample(frd.freq, frd.spl, frd.phase, logspace(frd.freq[0] * 1.05, 20000, 400));
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
    for (const r of roles) {
      const frd = src[r];
      const pl = cabinetInfo.place[r];
      if (!frd || !pl) return null;
      const ms = excessDelayMsOf(frd);
      const geo = pathBreakdownMm(pl, R, elev);
      if (ms === null || geo === null) return null;
      arrival[r] = ms * 1e-3 * C_AIR_MM_S;
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
    return { depths, spread, unexplained, shallowest };
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
  const physWin3 = useMemo(() => {
    if (!threeWay || !sim?.mid || !result || !sim.base.m) return null;
    const grid = result.freq;
    const ad = angleResponsesOn(grid);
    const angleSets =
      ad?.mid && ad.mid.length > 0
        ? { woofer: ad.woofer, mid: ad.mid, tweeter: ad.tweeter }
        : undefined;
    const maxOpt = (...vs: (number | null | undefined)[]): number | null => {
      const xs = vs.filter((v): v is number => typeof v === 'number' && v > 0);
      return xs.length ? Math.max(...xs) : null;
    };
    const minOpt = (...vs: (number | null | undefined)[]): number | null => {
      const xs = vs.filter((v): v is number => typeof v === 'number' && v > 0);
      return xs.length ? Math.min(...xs) : null;
    };

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
    // Cone breakup: a resonance at f_b is excited as the Nth harmonic of f_b/N,
    // so the penalty lands more than an octave BELOW the peak.
    const harm = Number(breakupHarmonic) > 0 ? Number(breakupHarmonic) : 3;
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
    const lowCeil = minOpt(
      wBeam ?? wooferXoCeiling,
      wLobe,
      arrayOf('low'),
      wBreak && breakupCeilingHz(wBreak.hz, harm),
    );
    const highCeil = minOpt(
      mBeam ?? midXoCeiling,
      mLobe,
      arrayOf('mid'),
      mBreak && breakupCeilingHz(mBreak.hz, harm),
    );
    return {
      angleSets,
      low: {
        floorHz: maxOpt(midHpFloor, reachesLevelHz(grid, sim.base.m.spl), midEx),
        ceilHz: lowCeil,
      },
      lowCeilMeasured: wBeam !== null,
      high: {
        floorHz: maxOpt(tweeterHpFloor, reachesLevelHz(grid, sim.base.t.spl), twtEx),
        ceilHz: highCeil,
      },
      highCeilMeasured: mBeam !== null,
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
      sdCm2, xmaxMm, excursionSpl, impedances, cabinet]);

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

  const directivity = useMemo(() => {
    // À-la-carte: skip the per-angle solve entirely when neither consumer shows.
    if (!showPanels.directivity && !showPanels.sonogram) return null;
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
  }, [angleSets, result, sim, threeWay, phaseMode, offsetMm, trimDb, inverted, midOffsetMm, midTrimDb, midInverted, showPanels.directivity, showPanels.sonogram]);

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
  const [vfEqBands, setVfEqBands] = useState(2); // EQ bands the optimizer may use per driver
  const [dirWeight, setDirWeight] = useState(25); // % of amplitude budget on the energy average
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
        targetRipple,
        soloSensDb,
        soloFloorOn,
        soloFloorDb,
        targetPhase,
      },
    };
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
    setXoRangeOn(d.xoRangeOn ?? false);
    // Legacy lo/hi range migrates to centre ± margin.
    if (d.xoFreqHz !== undefined) {
      setXoFreqHz(d.xoFreqHz);
      setXoMarginHz(d.xoMarginHz ?? '400');
      setXoScanSteps(d.xoScanSteps ?? 3);
      setXo3Steps(d.xo3Steps ?? 2);
    } else if (d.xoRangeLo !== undefined || d.xoRangeHi !== undefined) {
      const lo = Number(d.xoRangeLo) || 1800;
      const hi = Number(d.xoRangeHi) || 3500;
      setXoFreqHz(String(Math.round((lo + hi) / 2)));
      setXoMarginHz(String(Math.round(Math.abs(hi - lo) / 2)));
    } else {
      setXoFreqHz('2200');
      setXoMarginHz('400');
    }
    setHpLpPref(d.hpLpPref ?? 'auto');
    setHpLpPrefLow(d.hpLpPrefLow ?? 'auto');
    setPhaseMetricMode(d.phaseMetric ?? 'band');
    setAcSlopeMid(d.acSlopeMid ?? '24');
    setAcSlopeTweeter(d.acSlopeTweeter ?? '12');
    setAcSlopeWoofer(d.acSlopeWoofer ?? '24');
    setAcSlopeMidHp(d.acSlopeMidHp ?? '24');
    setXoLowFreqHz(d.xoLowFreqHz ?? '400');
    setXoLowMarginHz(d.xoLowMarginHz ?? '150');
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
      applyProject(deserializeProject(await file.text()));
      setPersistNote(t('Loaded {name}', { name: file.name }));
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
    try {
      applyProject(deserializeProject(stored));
      setPersistNote(t('Restored from autosave'));
    } catch {
      try {
        localStorage.setItem(`${AUTOSAVE_KEY}-unreadable`, stored);
      } catch {
        // No room to keep it aside; leave the original in place instead.
        return;
      }
      localStorage.removeItem(AUTOSAVE_KEY);
      setUnreadableBackup(stored);
      setPersistNote(t('Autosave could not be restored — kept aside as backup'));
      openWizardForEmpty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave on every meaningful change.
  useEffect(() => {
    const t = setTimeout(() => {
      // Never overwrite a real autosave with an EMPTY session (e.g. a mount
      // where restore failed): only save once something is actually loaded.
      const s = snapshot();
      if (!s.woofer && !s.tweeter && !s.vxp && !s.impedances && (s.design.networkDesigns?.length ?? 0) === 0) return;
      try {
        localStorage.setItem(AUTOSAVE_KEY, serializeProject(s));
      } catch {
        // Quota exceeded — autosave silently unavailable; explicit save still works.
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woofer, midDrv, tweeter, project, zStandalone, angleSets, fileNotes, verifyList, verifyIx, vFilters, xoName, offsetMm, trimDb, inverted, midOffsetMm, midTrimDb, midInverted, fMin, fMax, splMin, splMax, phasePriority, vfEqBands, phaseMode, dirWeight, ampTarget, sonogramMode, designs, activeDesignId, lastSavedId, networkActive, vfBypass, catalogSnap, breakupGuard, xoRangeOn, xoFreqHz, xoMarginHz, xoScanSteps, xo3Steps, hpLpPref, hpLpPrefLow, phaseMetricMode, acSlopeMid, acSlopeTweeter, acSlopeWoofer, acSlopeMidHp, xoLowFreqHz, xoLowMarginHz, midSizeInch, wooferSizeInch, kaTier, cabinet, nearField, ctcK, seatTiming, breakupLimitOn, breakupHarmonic, sdCm2, xmaxMm, excursionSpl, snapProfile, snapSeriesL, snapSeriesC, snapSeriesR, snapStacks, snapBoundToSeries, stagedOn, targetRipple, targetPhase, soloSensDb, soloFloorOn, soloFloorDb]);

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
  function runVfOptimize() {
    // THREE-WAY path (trede 4c): the staged 2D chain — textbook LR4 targets
    // + measured level trims per (low, high) handover candidate, per-branch
    // synthesis on each branch's own band, assembled TWO-PAIR tune, and the
    // amplifier-load verdict as a ranking gate. Runs over the worker pool.
    if (threeWay && sim && sim.mid && midDrv && result) {
      if (Object.keys(impedances).length < 3) {
        setVfError('3-way design needs all three measured impedances (.ZMA per driver).');
        return;
      }
      const grid = result.freq;
      const zOnGrid = zGridWithSlots(impedances, grid);
      const band: [number, number] = [
        Math.max(200, grid[0] * 1.02),
        Math.min(grid[grid.length - 1] * 0.975, num(fMax, 20000)),
      ];
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
      const pins = xoPinsValue();
      const settings = {
        phasePriority: phasePriority / 100,
        targets: stagedOn
          ? { rippleDb: num(targetRipple, 1.5), phaseDeg: num(targetPhase, 10) }
          : undefined,
        acousticSlopes: acousticSlopesValue(),
        xoLowPin: pins.low,
        xoHighPin: pins.high,
        hpFloorHz: tweeterHpFloor ?? undefined,
        structureLow: parseHpLpPref(hpLpPrefLow),
        structureHigh: parseHpLpPref(hpLpPref),
        breakupGuard,
        eqBands: vfEqBands,
        directivityWeight: dirWeight / 100,
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
      const variants = crossover3Variants(
        sim.base.w,
        sim.base.m!,
        sim.base.t,
        pins,
        tweeterHpFloor ?? undefined,
        scanSteps3,
        lowWin3,
        highWin3,
      );
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
      const inputs = variants.map((v) => ({
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
        settings,
      }));
      setVfBusy(true);
      setVfError(null);
      setVfProgress(null);
      setChainScan(null);
      setNetOptDiff(null);
      runChain3Scan(inputs, (d) =>
        setVfProgress({ round: d.round, evals: d.evals, items: d.items }),
      )
        .then((results) => {
          const ranked = rankChain3Results(results, settings.targets, settings.phasePriority);
          const win = ranked[0];
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
          setNetworkActive(true);
          setVfBypass(true);
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
                  rows: ranked.map((rr) => ({
                    label: rr.label,
                    rippleDb: rr.net.after.rippleDb,
                    avgDevDb: rr.net.after.avgDevDb ?? null,
                    phaseDeg: rr.net.after.phaseDeg,
                    zMinOhm: rr.net.after.zMinOhm ?? null,
                    xoWindowOk: rr.xoWindowOk,
                    pairOverlapOct: rr.pairOverlapOct,
                    bomEur: rr.bomTotalEur,
                    winner: rr === win,
                    result: rr,
                  })),
                  active: win.label,
                }
              : null,
          );
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
          const zLow = win.zMinOhm !== null && win.zMinOhm < Z_FLOOR_OHM;
          const anySane = ranked.some((r) => r.zMinOhm !== null && r.zMinOhm >= Z_FLOOR_OHM);
          const zNote = !zLow
            ? ''
            : `⚠ amplifier load: the winner dips to ${win.zMinOhm!.toFixed(1)} Ω ` +
              `(floor ${Z_FLOOR_OHM} Ω)` +
              (anySane
                ? ' — a candidate with a sane load exists in the table; it ranks lower on flatness.'
                : ' — no candidate in this scan stayed above it, so this is a design-level ' +
                  'property of these drivers in this topology, not a tuning miss. Three branches ' +
                  'in parallel around a handover is the usual cause; check the Impedance panel.');
          /* Handover physics on the winner: same visibility rule as the Z
           * floor — a class the designer cannot read reorders silently. */
          const anyXoSane = ranked.some((r) => r.xoWindowOk !== false);
          const xoWinNote =
            win.xoWindowOk !== false
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
            win.xoPinNote ? `⚠ PIN: ${win.xoPinNote}` : '',
            win.net.snapNote ?? '',
            win.net.safetyNote ? `⚠ ${win.net.safetyNote}` : '',
            win.net.ampFloorNote ? `⚠ ${win.net.ampFloorNote}` : '',
          ].filter(Boolean);
          setNetOptNote(
            [
              `3-way scan — ${variants.length} candidate${variants.length > 1 ? 's' : ''} ` +
                `(alignment × polarity design step, two-pair tune)`,
              `winner  xo ${win.label} · ${win.structureLabel}` +
                (win.net.after.avgDevDb !== undefined
                  ? ` · avg ${win.net.after.avgDevDb.toFixed(2)} dB`
                  : ''),
              `        ${line(win)}`,
              ...ranked.slice(1).map((r, i) => `${i === 0 ? 'others  ' : '        '}${line(r)}`),
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
      const band: [number, number] = [
        grid[0] * 1.02,
        Math.min(grid[grid.length - 1] * 0.975, num(fMax, 20000)),
      ];
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
              targets: stagedOn ? { rippleDb: num(targetRipple, 1.5) } : undefined,
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
      const zg = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
      const zOnGrid = zg.spl.map((m, i) => fromPolar(m, (zg.phaseDeg[i] * Math.PI) / 180));
      const safety = (() => {
        const lo = Math.max(200, solo.frd.freq[0]);
        const hi = Math.min(20000, solo.frd.freq[solo.frd.freq.length - 1]);
        if (!(hi > lo * 1.5)) return undefined;
        const sGrid = logspace(lo, hi, 240);
        const sz = resample(z.freq, z.magnitude, z.phase, sGrid, { clampEdges: true });
        return {
          freqs: sGrid,
          d: resample(solo.frd.freq, solo.frd.spl, solo.frd.phase, sGrid),
          z: sz.spl.map((m, i) => fromPolar(m, (sz.phaseDeg[i] * Math.PI) / 180)),
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
            targets: stagedOn ? { rippleDb: num(targetRipple, 1.5) } : undefined,
            ...soloLevelGoal(),
            catalogSnap: catalogSnap && hasImportedCatalog(),
            snapPrefs: snapPrefsValue(),
            safety,
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
      ampTarget,
      cutOnly: true, // passive-only: EQ may never boost
      breakupGuard,
      structurePreference: parseHpLpPref(hpLpPref),
      targets: stagedOn
        ? { rippleDb: num(targetRipple, 1.5), phaseDeg: num(targetPhase, 10) }
        : undefined,
      hpFloorHz: tweeterHpFloor ?? undefined,
      phaseMetric: phaseMetricMode,
      acousticSlopes: acousticSlopesValue(),
      xoRange: xoRangeValue(),
      band: [
        Math.max(300, grid[0]),
        Math.min(grid[grid.length - 1] * 0.975, num(fMax, 20000)),
      ] as [number, number],
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
        ? { rippleDb: num(targetRipple, 1.5), phaseDeg: num(targetPhase, 10) }
        : undefined;
      const settings: ChainSettings = {
        phasePriority: phasePriority / 100,
        eqBandsPerDriver: vfEqBands,
        angleData,
        directivityWeight: dirWeight / 100,
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
        .then(({ results, totalRounds, totalSims }) => {
          // Winner: targets met first, then blended score at the priority.
          const ranked = rankChainResults(
            results,
            targets,
            phasePriority / 100,
            tweeterHpFloor ?? undefined,
          );
          const win = ranked[0];
          setVFilters((p) => ({ ...p, ...win.vf.specs }));
          setInverted(win.vf.inverted);
          setVfOpt(win.vf);
          setVfRunStats({ rounds: totalRounds, evals: totalSims });
          synthFresh.current = true;
          setSynth({ mode: synthMode, woofer: win.synthWoofer, tweeter: win.synthTweeter });
          setWorkingDesign(win.parts);
          setVfBypass(true); // the BUILT network is the result on screen
          setScanSort(null);
          setChainScan(
            results.length > 1
              ? {
                  rows: ranked.map((rr) => ({
                    label: rr.label,
                    rippleDb: rr.net.after.rippleDb,
                    avgDevDb: rr.net.after.avgDevDb ?? null,
                    phaseDeg: rr.net.after.phaseDeg,
                    zMinOhm: rr.net.after.zMinOhm ?? null,
                    xoWindowOk: rr.xoWindowOk,
                    pairOverlapOct: rr.overlapOct != null ? [rr.overlapOct] : null,
                    bomEur: rr.bomTotalEur,
                    winner: rr === win,
                    result: rr,
                  })),
                  active: win.label,
                }
              : null,
          );
          setNetOptDiff(null); // fresh design — an old tune-diff would lie
          // Same visibility rule as the three-way scan: a class the designer
          // cannot read reorders silently.
          const zLow2 = win.zMinOhm !== null && win.zMinOhm < Z_FLOOR_OHM;
          const anySane2 = ranked.some((r) => r.zMinOhm !== null && r.zMinOhm >= Z_FLOOR_OHM);
          const zNote2 = !zLow2
            ? ''
            : `\n⚠ amplifier load: the winner dips to ${win.zMinOhm!.toFixed(1)} Ω ` +
              `(floor ${Z_FLOOR_OHM} Ω)` +
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
              xoNote2,
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
      const zg = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
      const zOnGrid = zg.spl.map((m, i) => fromPolar(m, (zg.phaseDeg[i] * Math.PI) / 180));
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
        const g = resample(z.freq, z.magnitude, z.phase, grid, { clampEdges: true });
        return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
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

  const networkIssues = useMemo(() => {
    if (!schematic) return null;
    try {
      return validateNetlist(crossoverToNetlist(schematic).netlist, zModels);
    } catch (e) {
      return { errors: [e instanceof Error ? e.message : String(e)], warnings: [] };
    }
  }, [schematic, zModels]);

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
  /** Old → new component values of the last tune run ("⚙ Optimize
   *  components" / auto-tune) — makes the tuner inspectable: you see WHERE
   *  it found its gains instead of just "N components tuned" (Sanders wens,
   *  jul 2026). Cleared when a new design lands from the Optimize flow. */
  const [netOptDiff, setNetOptDiff] = useState<
    { id: string; from: number; to: number; unit: string }[] | null
  >(null);
  /** Crossover-scan results as STRUCTURED rows — rendered as a small table
   *  instead of one long note line (readability; Sanders UX-ronde). Each row
   *  carries its FULL chain result: clicking a row loads that candidate's
   *  design into Working (Sanders "keuzelijst") — the scan is a menu, not
   *  just a report. Session-only (not persisted). */
  const [chainScan, setChainScan] = useState<{
    rows: {
      label: string;
      rippleDb: number;
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
      /** 2-way and 3-way scans produce different result shapes; the table only
       *  displays numbers, so it carries either and the loader branches. */
      result: ChainResult | Chain3Result;
    }[];
    /** Label of the row currently loaded in Working. */
    active: string;
  } | null>(null);

  /** Scan-table sort: click a header to sort by that column (asc → desc →
   *  back to the RANKING order, which is the default and keeps 🏆 on top). */
  const [scanSort, setScanSort] = useState<{
    key: 'xo' | 'ripple' | 'avg' | 'phase' | 'ovl' | 'zmin' | 'bom';
    dir: 1 | -1;
  } | null>(null);

  function toggleScanSort(key: 'xo' | 'ripple' | 'avg' | 'phase' | 'ovl' | 'zmin' | 'bom') {
    setScanSort((s0) =>
      s0?.key !== key ? { key, dir: 1 } : s0.dir === 1 ? { key, dir: -1 } : null,
    );
  }

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
    setChainScan((c) => (c ? { ...c, active: row.label } : c));
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

  function runNetOptimize() {
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
      opts: {
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
        ampTarget,
        breakupGuard,
        staged: stagedOn
          ? { rippleDb: num(targetRipple, 1.5), phaseDeg: soloDriver ? 3600 : num(targetPhase, 10) }
          : undefined,
        // 3-way (trede 4a): the middle branch turns on the two-pair path.
        // The crossover pin and directivity terms are 2-way vocabulary and
        // stay off; acoustic slopes steer the TOP pair (mid/tweeter).
        midBranch:
          threeWay && sim.mid && midDrv
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
        band: [Math.max(300, grid[0]), Math.min(grid[grid.length - 1] * 0.975, num(fMax, 20000))],
        safety,
      },
    }, (stage) => setNetOptStages((p) => [...p, stage]))
      .then((r) => {
        if (!r.safetyNote) {
          commitSchematic(r.parts); // undo-able, sim follows live
          setNetworkActive(true);
          setNetOptDiff(diffTunedParts(seedParts, r.parts));
        }
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
      try {
        const imp = deserializeCatalog(stored);
        setCustomSeries(imp.series, imp.parts);
      } catch {
        // Unreadable custom catalog: leave it in place, run with built-ins.
      }
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
    if (
      hasImportedCatalog() &&
      !window.confirm('Replace the catalog now loaded with the demo catalog?')
    ) {
      return;
    }
    try {
      const imp = deserializeCatalog(demoCatalog);
      setCustomSeries(imp.series, imp.parts);
      localStorage.setItem(CUSTOM_CATALOG_KEY, serializeCatalog(imp.series, imp.parts));
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
    setCustomSeries(series, parts);
    setDisabledSeries(off);
    if (off.length > 0) localStorage.setItem(CATALOG_OFF_KEY, JSON.stringify(off));
    else localStorage.removeItem(CATALOG_OFF_KEY);
    if (series.length === 0 && parts.length === 0) {
      // An empty custom catalog would be rejected on the next load — built-ins
      // take over, so drop the stored blob instead of persisting an invalid one.
      localStorage.removeItem(CUSTOM_CATALOG_KEY);
    } else {
      localStorage.setItem(CUSTOM_CATALOG_KEY, serializeCatalog(series, parts));
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
      setCustomSeries(imp.series, imp.parts);
      localStorage.setItem(CUSTOM_CATALOG_KEY, serializeCatalog(imp.series, imp.parts));
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
    const present = (['low', 'mid', 'high'] as BranchRole[])
      .map((r) => exOf[r])
      .filter((v): v is number => v !== null);
    const earliestMs = present.length > 0 ? Math.min(...present) : 0;
    const delayUsFor = (role: BranchRole) => {
      const ex = exOf[role];
      return ex === null ? 0 : Math.round((ex - earliestMs) * 1000 * 10) / 10;
    };

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

    // Fallback (Firefox/Safari): download just the .vxp; the user places the
    // measurement files beside it manually.
    const blob = new Blob([xml], { type: 'application/xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = vxpName;
    a.click();
    URL.revokeObjectURL(a.href);
    setPersistNote(
      `${t('Exported {vxp} ({variants}).', { vxp: vxpName, variants })} ${bridge}.${skippedNote} ` +
        t('This browser can’t write folders — place the measurement files next to it manually: {list}. (Chrome/Edge export the whole folder in one go.)', { list: dataFiles.join(', ') }),
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
          const { netlist } = crossoverToNetlist({ name: d.name, parts: d.parts });
          const sol = solveNetwork(netlist, grid, zOnGrid);
          const { hW, hM, hT, ambiguous } = slotTransfersN(sol);
          if (ambiguous) return; // no guessing which branch is which
          const w = hW ? applyTransfer(sim.base.w, hW) : sim.base.w;
          const t = hT ? applyTransfer(sim.base.t, hT) : sim.base.t;
          // Three-way ghosts sum all three branches — same pipeline as the
          // live simulation, so a ghost cannot differ from the curve that tab
          // would draw if you switched to it.
          const n3 =
            threeWay && sim.base.m
              ? combineN([
                  { response: w },
                  { response: hM ? applyTransfer(sim.base.m, hM) : sim.base.m, adjust: branchAdj.mid },
                  { response: t, adjust: branchAdj.tweeter },
                ])
              : null;
          const combined = n3 ?? combine(w, t, branchAdj.tweeter);
          const style = {
            label: d.name,
            color: GHOST_COLORS[i % GHOST_COLORS.length],
            dash: GHOST_DASHES[i % GHOST_DASHES.length],
            width: 1.4,
            x: grid,
            // Comparison curves, not the subject — fold them in the legend.
            secondary: true,
          };
          spl.push({ ...style, id: `ghost:${d.id}`, y: combined.combinedSpl });
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
            y: sol.inputZ.map((c) => Math.min(cAbs(c), 1e4)),
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
        const { netlist } = crossoverToNetlist({ name: d.name, parts: d.parts });
        const sol = solveNetwork(netlist, grid, zOnGrid);
        base.zMinOhm = Math.min(...sol.inputZ.map((c) => cAbs(c)));
        const { hW, hM, hT, ambiguous } = slotTransfersN(sol);
        if (ambiguous) return { ...base, error: 'driver names ambiguous' };
        const w = hW ? applyTransfer(sim.base.w, hW) : sim.base.w;
        const t = hT ? applyTransfer(sim.base.t, hT) : sim.base.t;
        if (threeWay && sim.base.m) {
          const m = hM ? applyTransfer(sim.base.m, hM) : sim.base.m;
          const n3 = combineN([
            { response: w },
            { response: m, adjust: mAdj },
            { response: t, adjust: tAdj },
          ]);
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
          const r2 = combine(w, t, tAdj);
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
        <button
          type="button"
          className="busy-cancel"
          onClick={cancelOptimTasks}
          title={t('Stop the run — nothing is committed, your design stays as it was')}
        >
          {t('Cancel')}
        </button>
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
  if (systemZInfo && systemZInfo.minOhm < Z_FLOOR_OHM)
    issues.push({
      text: t('System impedance dips to {z} Ω — below the {floor} Ω amplifier floor.', { z: systemZInfo.minOhm.toFixed(1), floor: Z_FLOOR_OHM }),
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
        runVfOptimize();
      },
    },
    { id: 'wizard', label: t('Open the design wizard'), run: () => setWizardOpen(true) },
    { id: 'compare', label: t('Compare mode: model vs measurement'), hint: t('load the built speaker’s response'), run: () => setUiMode('compare') },
    { id: 'measure', label: t('Open the measuring guide'), hint: t('rig, distances, angles'), run: () => setMeasureGuideOpen(true) },
    { id: 'help', label: t('Open the manual'), run: () => setHelpOpen(true) },
    { id: 'targets', label: t('Show design targets'), hint: t('what the last build was fitted against'), run: () => setShowTargets(true) },
    { id: 'catalog', label: t('Open the catalog manager'), hint: t('SKUs, prices, series'), run: () => setCatalogMgrOpen(true) },
    { id: 'demo', label: t('Load the KOAN demo measurements'), run: () => loadDemo() },
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
              {wizardWays === 2 && (
                <button
                  type="button"
                  className="primary"
                  onClick={loadDemo}
                  title={t('Load the bundled KOAN measurements (all angles + impedances + vxp variants) — instant playground')}
                >
                  🎧 {t('Load KOAN demo data')}
                </button>
              )}
              <p className="sub" style={{ marginBottom: '0.2rem' }}>
                {wizardWays === 2 ? t('…or load your own:') : t('Load your measurements:')}
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
                    runVfOptimize();
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
          {combinedFlat && (
            <span
              className={`status-chip ${
                !designShaped
                  ? 'chip-neutral'
                  : combinedFlat.score >= 85 ? 'chip-ok' : combinedFlat.score >= 70 ? 'chip-warn' : 'chip-bad'
              }`}
              title={`${!designShaped ? t('RAW DRIVERS — no crossover is shaping the sum yet, so this is just where you start from, not a problem. It colours once a design exists.') + '\n\n' : ''}${t("Whole-range flatness of the combined response, 0–100 — from the AVERAGE deviation over the visible range, so one narrow dip can't dominate the verdict (the peak ±dB in the SPL strip still shows it)")}`}
            >
              {t('Response')} <strong>{combinedFlat.score.toFixed(0)}</strong>
            </span>
          )}
          {integration?.overlapCentreHz != null && (
            <span
              className="status-chip"
              title={t("Where the two drivers' levels meet in the current sim — the acoustic crossover point. Neutral by design: a location, not a verdict.")}
            >
              {t('Overlap')} <strong>{Math.round(integration.overlapCentreHz)} Hz</strong>
            </span>
          )}
          {pairScores &&
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
          {phaseStats && (
            <span
              className={`status-chip ${
                !designShaped
                  ? 'chip-neutral'
                  : phaseStats.p95ErrorDeg <= 45 ? 'chip-ok' : phaseStats.p95ErrorDeg <= 90 ? 'chip-warn' : 'chip-bad'
              }`}
              title={`${!designShaped ? t('RAW DRIVERS — no crossover yet, so this is the starting point, not a fault. It colours once a design exists.') + '\n\n' : ''}${t('95th-percentile phase error in the driver overlap — ≤45° sums fully, ≤90° still gains ≥3 dB, beyond that the drivers stop helping each other')}`}
            >
              {t('Phase P95')} <strong>{phaseStats.p95ErrorDeg.toFixed(0)}°</strong>
            </span>
          )}
          {pairScores && (pairScores.low.stats || pairScores.high.stats) && (() => {
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
                title={`${!designShaped ? 'RAW DRIVERS — no crossover yet, so this is the starting point, not a fault. It colours once a design exists.\n\n' : ''}Worst pair's 95th-percentile phase error (woofer-mid vs mid-tweeter overlap windows)`}
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
                      {role === 'mid' && midDrv && (
                        <span className="derived">
                          ✓ {midDrv.name}{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setMidDrv(null);
                              setZStandalone((prev) => {
                                const next = { ...prev };
                                delete next.mid;
                                return next;
                              });
                              setAngleSets((prev) => {
                                if (!prev) return prev;
                                const { mid: _drop, ...rest } = prev;
                                return rest.woofer.length + rest.tweeter.length > 0 ? rest : null;
                              });
                            }}
                            title={t('Remove the midrange branch (back to 2-way)')}
                            aria-label={t('Remove the midrange branch (back to 2-way)')}
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
                title={t('Load the bundled KOAN measurements (all angles + impedances + vxp variants) — instant playground')}
              >
                {t('Load KOAN demo data')}
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
                onClick={() => {
                  if (window.confirm(t('Discard the backup? This cannot be undone.'))) {
                    localStorage.removeItem('ads-autosave-unreadable');
                    setUnreadableBackup(null);
                  }
                }}
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
                const micUit = eerlijk
                  ? t('honest down to ≈ {hz} Hz', { hz: Math.round(eerlijk.fromHz) })
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
              {phaseMode === 'measured' &&
                timing?.ref.verdict === 'plausible' &&
                num(offsetMm, 0) !== 0 && (
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
            <div className="tool-groups" style={{ marginBottom: '1rem' }}>
              <div className="tool-group">
                <span className="tool-group-label">{t('Design')}</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={runVfOptimize}
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
                  <label title={t('How many handover candidates the 3-way scan simulates PER crossing. Each candidate runs the full design chain inside its own slice of the search range, so the count is squared: 2 steps = 4 chains. Works pinned or unpinned — without a pin the range is the neighbourhood of the raw crossings.')}>
                    {t('Handover candidates to try')}
                    <select value={xo3Steps} onChange={(e) => setXo3Steps(Number(e.target.value))}>
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n} ({n * n} sim{n * n > 1 ? 's' : ''})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {threeWay && physWin3 && (
                  <span
                    className="derived"
                    style={{ flexBasis: '100%' }}
                    title={t("The free scan derives both handover windows from the measurements themselves: floor = 2×Fs (measured impedance) and where the upper driver reaches its own level; ceiling = the lower driver's MEASURED beaming onset from the angle files (size-formula fallback without them). A pin is the designer's explicit override of its axis — the scan then searches the pin, not this window, and warns loudly when the physics cannot deliver it.")}
                  >
                    {/* One line per handover, each naming the criterion that
                        BINDS. The old single dense line hid exactly that: a
                        window you cannot attribute is a window you cannot act
                        on, and it is the binding rule that tells you which
                        knob (or which driver) to change. */}
                    {(['low', 'high'] as const).map((side) => {
                      const w = physWin3[side];
                      const naam = side === 'low' ? 'W-M' : 'M-T';
                      if (xoRangeOn) {
                        return (
                          <span key={side} style={{ display: 'block' }}>
                            {naam}: {t('pinned — your pin overrides the derived window')}
                          </span>
                        );
                      }
                      const geen =
                        w.ceilHz !== null && w.floorHz !== null && w.ceilHz <= w.floorHz;
                      return (
                        <span key={side} style={{ display: 'block' }}>
                          {naam} {Math.round(w.floorHz ?? (side === 'low' ? 250 : 1200))}–
                          {Math.round(w.ceilHz ?? (side === 'low' ? 1200 : 7000))} Hz
                          {bindingCeil(
                            physWin3.limits[side],
                            side === 'low' ? physWin3.lowCeilMeasured : physWin3.highCeilMeasured,
                            // W-M's ceiling comes from the woofer, M-T's from the mid.
                            cabinetInfo.offBaffle.includes(side === 'low' ? 'low' : 'mid'),
                          )}
                          {geen && <strong> ⚠ {t('no room — these two cannot meet')}</strong>}
                        </span>
                      );
                    })}
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
                          <span className="derived"> ⏱ ~{Math.ceil(xoScanSteps / 3)}× {t('runtime')}</span>
                        )}
                      </>
                    )}
                  </span>
                )}
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
                    {t('Stay this far below cone breakup')}
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
                    title={t('Export ALL network tabs as a VituixCAD project folder — the .vxp (each tab a crossover variant CROSSOVER, CROSSOVER1, …) PLUS every measurement/impedance file, written together so VituixCAD opens it without hunting. Pick a folder when asked (Chrome/Edge). VituixCAD reconstructs the phase itself (MinimumPhase=True) and every driver carries its measured excess-phase delay (earliest driver 0), so its simulation matches ours — two-way and three-way alike.')}
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
            {chainScan && (
              /* The success moment of a multi-minute run deserves its own
                 visual register — one green line that says it worked, where
                 the result lives, and that the table below is a MENU, before
                 the eye hits eight columns of numbers. */
              <p className="result-good">
                ✓ {t('Design ready — the winner is loaded in the')} <strong>Working</strong>{' '}
                {t('tab and every chart shows it. The rows below are the full candidates: click one to try it, 💾 Save keeps the one you trust.')}
              </p>
            )}
            {chainScan && (
              <table
                className="scan-table scan-table-pick"
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
                  </tr>
                </thead>
                <tbody>
                  {[...chainScan.rows]
                    .sort((a, b) => {
                      if (!scanSort) return 0; // ranking order (stable sort)
                      const v = (r: typeof a): number =>
                        scanSort.key === 'xo'
                          ? parseFloat(r.label)
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
                                  : (r.bomEur ?? Number.POSITIVE_INFINITY);
                      return (v(a) - v(b)) * scanSort.dir;
                    })
                    .map((r) => (
                    <tr
                      key={r.label}
                      className={`${r.winner ? 'winner' : ''}${chainScan.active === r.label ? ' active' : ''}`}
                      onClick={() => applyScanCandidate(r)}
                      title={
                        chainScan.active === r.label
                          ? t('This candidate is loaded in Working')
                          : t('Load the {label} design into Working (undo-able)', { label: r.label })
                      }
                    >
                      <td>
                        {r.winner ? '🏆 ' : ''}
                        {r.label}
                        {chainScan.active === r.label ? ' ◂' : ''}
                      </td>
                      <td title={t('Peak ±dB — the worst single spot (what the staged targets gate on)')}>
                        {r.rippleDb.toFixed(2)} dB
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
                          r.zMinOhm !== null && r.zMinOhm < Z_FLOOR_OHM ? 'scan-z-low' : undefined
                        }
                        title={
                          r.zMinOhm === null
                            ? t('Minimum system impedance was not measured for this candidate')
                            : r.zMinOhm < Z_FLOOR_OHM
                              ? t('The amplifier sees {z} Ω at its worst — below the {floor} Ω floor, so this candidate ranks below every one with a sane load, however flat it is', { z: r.zMinOhm.toFixed(1), floor: Z_FLOOR_OHM })
                              : t('Minimum system impedance the amplifier sees (floor {floor} Ω)', { floor: Z_FLOOR_OHM })
                        }
                      >
                        {r.zMinOhm !== null
                          ? `${r.zMinOhm < Z_FLOOR_OHM ? '⚠ ' : ''}${r.zMinOhm.toFixed(1)} Ω`
                          : '—'}
                      </td>
                      <td>{r.bomEur !== null ? `€${Math.round(r.bomEur)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                            r.zMinOhm !== null && r.zMinOhm < Z_FLOOR_OHM ? 'scan-z-low' : undefined
                          }
                          title={t('Minimum system impedance (amplifier floor {floor} Ω)', { floor: Z_FLOOR_OHM })}
                        >
                          {r.zMinOhm !== null
                            ? `${r.zMinOhm < Z_FLOOR_OHM ? '⚠ ' : ''}${r.zMinOhm.toFixed(1)} Ω`
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
                    onDelete={() => deleteDesign(d.id)}
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
                {networkIssues && (networkIssues.errors.length > 0 || networkIssues.warnings.length > 0) && (
                  <div className="nl-issues">
                    {networkIssues.errors.map((m) => (
                      <p key={m} className="error">{m}</p>
                    ))}
                    {networkIssues.warnings.map((m) => (
                      <p key={m} className="nl-warning">{m}</p>
                    ))}
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
                  <strong>{t('No filter in the simulation — you are looking at the RAW drivers.')}</strong>{' '}
                  {t('Design one in the Filters tab (Optimize — design for me), activate a network in the Network tab')}
                  {project ? t(', or pick a vxp variant in the Setup tab') : ''}.
                </div>
              </div>
            )}

          <div className={`panel${splPinned ? ' spl-sticky' : ''}`}>
            <div className="panel-head">
              <h2>SPL</h2>
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
                  </>
                )}
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
            <div className="panel">
              <h2>{t('Directivity (horizontal)')}</h2>
              <p className="sub" style={{ marginBottom: '0.8rem' }}>
                {t('Same filter at every measured angle ({angles}° hor, one side).', { angles: directivity.angles.join('/') })}{' '}
                {Number(cabinet.baffleWidthMm) > Number(cabinet.baffleHeightMm)
                  ? t('Horizontal only — but this baffle is wider than tall, so that IS the plane its drivers lobe in: this data captures it.')
                  : t('Horizontal only — vertical lobing is not in this data.')}
              </p>
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
            <div className="panel">
              <h2>{t('Filter transfer (driver voltage vs source)')}</h2>
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
            <div className="panel">
              <h2>{t('System impedance (amplifier load)')}</h2>
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
          <div className="panel">
            <h2>
              {soloDriver
                ? t('{drv} phase (total)', { drv: soloDriver === 'woofer' ? t('Woofer/mid') : t('Tweeter') })
                : threeWay
                  ? t('Relative phase per driver pair')
                  : t('Tweeter phase relative to woofer')}
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
          <div className="panel">
            <h2>{t('Excess group delay (combined)')}</h2>
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

          <div className="panel">
            <h2>{t('Step response & ETC (IFFT of combined response)')}</h2>
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
          className="design-tab-name"
          onClick={onSelect}
          onDoubleClick={() => {
            setDraft(design.name);
            setEditing(true);
          }}
          title={t('Click to activate, double-click to rename')}
        >
          {design.name}
        </button>
      )}
      <button
        type="button"
        className="design-tab-close"
        onClick={() => {
          if (window.confirm(t('Delete tab "{name}"?', { name: design.name }))) onDelete();
        }}
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
