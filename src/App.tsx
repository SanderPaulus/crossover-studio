import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
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
  KA_TIERS,
  breakupCeilingHz,
  breakupHz,
  excursionFloorHz,
  lobingCeilingHz,
  type KaTier,
} from './lib/driverLimits.ts';
import {
  baffleStepHz,
  boxRolloff,
  centreToCentreMm,
  farFieldVerdict,
  listeningAngleDeg,
  nearestEdgeMm,
  pistonDiameterMm,
  rotationLevelOffsetDb,
  trueOffAxisDeg,
  unloadingRisk,
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
import { serializeVxp } from './lib/parsers/vxpExport.ts';
import type { VxpDriver } from './lib/parsers/vxp.ts';
import { tidySchematic } from './lib/tidyLayout.ts';
import {
  allSeries,
  bomFor,
  catalogSeries,
  customCatalogParts,
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
  const name = side === 'woofer' ? 'Woofer/mid' : side === 'mid' ? 'Mid' : 'Tweeter';
  const parts: string[] = [];
  if (spec.hp.enabled) parts.push(`HP ${spec.hp.kind}${spec.hp.order} @${Math.round(spec.hp.freq)}`);
  if (spec.lp.enabled) parts.push(`LP ${spec.lp.kind}${spec.lp.order} @${Math.round(spec.lp.freq)}`);
  const nEq = spec.eq.filter((b) => b.enabled).length;
  if (nEq > 0) parts.push(`${nEq} EQ`);
  return `${name}: ${parts.length > 0 ? parts.join(', ') : 'flat'}`;
}

/** Cabinet geometry + measurement context, as typed (strings so a field can be
 *  empty; every consumer treats absent as "criterion does not apply"). */
interface CabinetDriver {
  /** Offset from the measurement reference point, mm. +x right, +y up. */
  xMm: string;
  yMm: string;
  enclosure: Enclosure;
  /** Box corner: Fc for sealed, Fb for ported. */
  fbHz: string;
}
interface CabinetState {
  /** Microphone distance during the FRD sweeps, mm. */
  micDistanceMm: string;
  /** Fixed VERTICAL angle of the rig, degrees; + = mic above the reference
   *  plane. Usually 0 (mic level with the reference point). Signed on purpose:
   *  on a driver 380 mm low at 500 mm, ±10° swings the true angle 31°↔43°. */
  micElevationDeg: string;
  baffleWidthMm: string;
  baffleHeightMm: string;
  /** How far below the top of the baffle the reference point sits, mm. */
  refFromTopMm: string;
  /** Height of the reference point above the floor, mm. */
  refHeightMm: string;
  listenDistanceM: string;
  listenEarHeightMm: string;
  drivers: Record<BranchRole, CabinetDriver>;
}
const emptyCabinetDriver = (): CabinetDriver => ({
  xMm: '',
  yMm: '',
  enclosure: 'unknown',
  fbHz: '',
});
const emptyCabinet = (): CabinetState => ({
  micDistanceMm: '',
  micElevationDeg: '',
  baffleWidthMm: '',
  baffleHeightMm: '',
  refFromTopMm: '',
  refHeightMm: '',
  listenDistanceM: '',
  listenEarHeightMm: '',
  drivers: { low: emptyCabinetDriver(), mid: emptyCabinetDriver(), high: emptyCabinetDriver() },
});
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
    };
  }
  return {
    micDistanceMm: raw.micDistanceMm ?? '',
    micElevationDeg: raw.micElevationDeg ?? '',
    baffleWidthMm: raw.baffleWidthMm ?? '',
    baffleHeightMm: raw.baffleHeightMm ?? '',
    refFromTopMm: raw.refFromTopMm ?? '',
    refHeightMm: raw.refHeightMm ?? '',
    listenDistanceM: raw.listenDistanceM ?? '',
    listenEarHeightMm: raw.listenEarHeightMm ?? '',
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
  return { xMm: x, yMm: y };
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
    breakup: { hz: number; corroboratedByZ: boolean } | null;
    excursion: number | null;
  },
  beamMeasured: boolean,
): string {
  const cands: Array<[number, string]> = [];
  if (lim.beam !== null) cands.push([lim.beam, beamMeasured ? 'measured beaming' : 'beaming']);
  if (lim.lobe !== null) cands.push([lim.lobe, 'lobing']);
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
  const [verify, setVerify] = useState<{ name: string; raw: string; frd: Parsed & { hasPhase: boolean } } | null>(null);
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

  /** 3-way mode: all three RESPONSES loaded. The sim then sums via combineN;
   *  everything inherently two-way (crossover optimizers, synthesis, vxp
   *  export, integration score) is gated off with a message until trede 4. */
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
  const [designTab, setDesignTab] = useState<'import' | 'data' | 'filters' | 'network'>(() => {
    const t = localStorage.getItem('ads-ui-tab');
    return t === 'data' || t === 'filters' || t === 'network' ? t : 'import';
  });
  useEffect(() => {
    localStorage.setItem('ads-ui-tab', designTab);
  }, [designTab]);

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
  const [showPanels, setShowPanels] = useState<Record<PanelKey, boolean>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('ads-ui-panels') ?? '{}') as Partial<
        Record<PanelKey, boolean>
      >;
      return Object.fromEntries(
        PANEL_KEYS.map((k) => [k, raw[k] ?? true]),
      ) as Record<PanelKey, boolean>;
    } catch {
      return Object.fromEntries(PANEL_KEYS.map((k) => [k, true])) as Record<PanelKey, boolean>;
    }
  });
  useEffect(() => {
    localStorage.setItem('ads-ui-panels', JSON.stringify(showPanels));
  }, [showPanels]);

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
  /** Mid nominal size (inch) — sets the crossover CEILING via cone beaming
   *  (f ≈ c/π·d_eff; a MID property, per Gemini's window rules). '' = unknown
   *  → the free band falls back to the tweeter-anchored ceiling. */
  const [midSizeInch, setMidSizeInch] = useState('');
  /** Beaming-limited crossover ceiling (Hz): the UPPER bound of the sensible
   *  crossover window. Effective radiating diameter ≈ 0.82× nominal; beaming
   *  onsets at c/π·d, and a cone is practically usable to ~3× that (a 5" ⇒
   *  ~3200 Hz, matching the ~3000–3500 rule of thumb). null when size unknown. */
  const midXoCeiling = useMemo(() => {
    const inch = Number(midSizeInch);
    if (!(inch > 0)) return null;
    const dEff = inch * 0.0254 * 0.82;
    return Math.round((3 * 343) / (Math.PI * dEff));
  }, [midSizeInch]);
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
  /** How much spacing the design tolerates, in wavelengths. Genuinely
   *  contested (0.5 = no forward null … 1.2 = Saunisto's power-response
   *  optimum, which ACCEPTS a ±25° null), so the designer owns it. */
  const [ctcK, setCtcK] = useState('0.5');
  /** Cone breakup as an upper limit: cross at or below f_b / harmonic. */
  const [breakupLimitOn, setBreakupLimitOn] = useState(true);
  const [breakupHarmonic, setBreakupHarmonic] = useState('3');
  /** Datasheet numbers for the excursion floor — the level-aware version of
   *  "cross a tweeter at 2-3x Fs". Two fields per driver, and without them the
   *  criterion simply does not apply. */
  const [sdCm2, setSdCm2] = useState<Record<BranchRole, string>>({ low: '', mid: '', high: '' });
  const [xmaxMm, setXmaxMm] = useState<Record<BranchRole, string>>({ low: '', mid: '', high: '' });
  /** The SPL the excursion floor is computed FOR — a 1" dome is fine to 587 Hz
   *  at 90 dB and only to 829 Hz at 96 dB, and that is the whole point. */
  const [excursionSpl, setExcursionSpl] = useState('96');
  const wooferXoCeiling = useMemo(() => {
    const inch = Number(wooferSizeInch);
    if (!(inch > 0)) return null;
    const dEff = inch * 0.0254 * 0.82;
    return Math.round((3 * 343) / (Math.PI * dEff));
  }, [wooferSizeInch]);
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
  useEffect(() => {
    if (!wizardOpen) return;
    if (threeWay) setWizardWaysRaw(3);
    else if (woofer && tweeter && !midDrv) setWizardWaysRaw(2);
  }, [wizardOpen, threeWay, woofer, tweeter, midDrv]);
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
  const [targetRipple, setTargetRipple] = useState('1.5');
  /** Single-driver mode: sensitivity a correction may spend for flatness. */
  const [soloSensDb, setSoloSensDb] = useState('6');
  /** Single-driver mode: absolute target level instead of the relative budget
   *  (Sanders' floor idea — a fixed target cannot be gamed by moving the mean,
   *  and it sets how far the correctable band reaches in one number). */
  const [soloFloorOn, setSoloFloorOn] = useState(false);
  const [soloFloorDb, setSoloFloorDb] = useState('');
  const [targetPhase, setTargetPhase] = useState('10');

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
      `Added LCR trap @ ${Math.round(numOf(trapFreq, 0))} Hz on ${trapModel}: ${Lmh} mH · ${Cuf} µF · ${R} Ω. ` +
        (tidied
          ? 'Layout tidied — notches sorted by frequency. Fine-tune with ⚙ Optimize components.'
          : 'Fine-tune with ⚙ Optimize components; layout kept as-is (topology too exotic for the auto-placer).'),
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
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = [...(e.target.files ?? [])];
      e.target.value = '';
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
    // The demo playground ships the priced Jantzen/Mundorf catalog too, so
    // Snap to catalog and the BOM work out of the box — but NEVER overwrite
    // a catalog the user imported or edited themselves.
    if (!localStorage.getItem(CUSTOM_CATALOG_KEY)) {
      try {
        const imp = deserializeCatalog(demoCatalog);
        setCustomSeries(imp.series, imp.parts);
        localStorage.setItem(CUSTOM_CATALOG_KEY, serializeCatalog(imp.series, imp.parts));
        setPersistNote(
          `Demo catalog loaded — ${imp.parts.length} priced SKUs (snap, BOM and inspector use them)`,
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
        'File dialog returned no files. If you did select files, copy them to a local folder ' +
          '(e.g. Downloads) and try again.',
      );
      return;
    }
    setError(null);
    setVxpNote(`Reading ${files.length} file(s): ${files.map((f) => f.name).join(', ')}…`);
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
        `${vxpFile.name} — ${vxp.crossovers.length} crossover variant(s) · ` +
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
      setError("Pick VituixCAD's FILTERED woofer AND tweeter response (2 files) to compare phase.");
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
    if (!file) return;
    setError(null);
    try {
      const raw = await file.text();
      const frd = parseFrd(raw);
      const cls = classifyLevelProfile(frd.spl);
      setVerify({ name: file.name, raw, frd });
      if (frd.hasPhase && cls.kind === 'impedance') {
        setError(
          `"${file.name}" was loaded as the verification measurement, but its levels look ` +
            `like an impedance file (median ≈ ${cls.medianLevel.toFixed(1)} Ω) — the ` +
            `comparison below will be meaningless.`,
        );
      }
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

  const sim = useMemo(() => {
    // Single-driver mode: ONE loaded measurement is enough (validation flow:
    // measure a lone driver, rebuild the physical network in the editor,
    // compare sim vs measurement). The missing slot gets a silent ghost
    // branch so combine() and every downstream consumer keep their
    // two-branch shape; the UI hides the ghost's curves and scores.
    if (!woofer && !tweeter) return null;
    // 3-way: the mid branch joins the grid only when both outer branches are
    // loaded; a mid without them is IGNORED (banner explains) so the 2-way and
    // solo paths stay bit-identical to before the mid slot existed.
    const midIn = threeWay ? midDrv : null;
    const present = [woofer, midIn, tweeter].filter((d): d is Loaded => d !== null);
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
    let w = woofer ? toGrid(woofer) : silent();
    let t = tweeter ? toGrid(tweeter) : silent();
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

    const tAdj = { offsetMm: num(offsetMm, 0), trimDb: num(trimDb, 0), inverted };
    if (m) {
      // 3-way sum via the N-way core. The result keeps the 2-way CombineResult
      // SHAPE (woofer = low branch, tweeter = adjusted high branch) so every
      // combined-curve consumer keeps working; the mid branch rides alongside.
      const mAdj = {
        offsetMm: num(midOffsetMm, 0),
        trimDb: num(midTrimDb, 0),
        inverted: midInverted,
      };
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
  }, [woofer, midDrv, threeWay, tweeter, project, impedances, xoName, vFilters, vfBypass, phaseMode, fMinDeb, fMaxDeb, offsetMm, trimDb, inverted, midOffsetMm, midTrimDb, midInverted, schematic, networkActive]);

  const result = sim?.combined ?? null;

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
    const place = {
      low: placementOf(cabinet.drivers.low),
      mid: placementOf(cabinet.drivers.mid),
      high: placementOf(cabinet.drivers.high),
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
    const ctc = (a: BranchRole, b: BranchRole) =>
      place[a] && place[b] ? centreToCentreMm(place[a]!, place[b]!) : null;
    const baffle =
      baffleW > 0 && Number(cabinet.baffleHeightMm) > 0
        ? {
            widthMm: baffleW,
            heightMm: Number(cabinet.baffleHeightMm),
            refFromTopMm: Number(cabinet.refFromTopMm) || 0,
          }
        : null;
    return {
      place,
      trueAngles,
      diaOf,
      farField,
      /** Adjacent-pair spacing. In 2-way the single pair is low↔high. */
      ctcLow: threeWay ? ctc('low', 'mid') : ctc('low', 'high'),
      ctcHigh: threeWay ? ctc('mid', 'high') : null,
      baffleStep: baffleStepHz(baffleW),
      edgeOf: (role: BranchRole) =>
        place[role] && baffle ? nearestEdgeMm(place[role]!, baffle) : null,
      listenAngle: listeningAngleDeg(
        Number(cabinet.refHeightMm),
        Number(cabinet.listenEarHeightMm),
        Number(cabinet.listenDistanceM),
      ),
      boxOf: (role: BranchRole) => boxRolloff(cabinet.drivers[role].enclosure),
      unloadOf: (role: BranchRole) => unloadingRisk(cabinet.drivers[role].enclosure),
    };
  }, [cabinet, sdCm2, angleSets, threeWay]);

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
    // Vertical lobing from centre-to-centre spacing — geometry, no measurement.
    const kk = Number(ctcK) > 0 ? Number(ctcK) : 0.5;
    const wLobe = lobingCeilingHz(cabinetInfo.ctcLow ?? 0, kk);
    const mLobe = lobingCeilingHz(cabinetInfo.ctcHigh ?? 0, kk);
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
      Number.isFinite(spl) ? excursionFloorHz(Number(sdCm2[role]), Number(xmaxMm[role]), spl) : null;
    const midEx = exOf('mid');
    const twtEx = exOf('high');

    const lowCeil = minOpt(wBeam ?? wooferXoCeiling, wLobe, wBreak && breakupCeilingHz(wBreak.hz, harm));
    const highCeil = minOpt(mBeam ?? midXoCeiling, mLobe, mBreak && breakupCeilingHz(mBreak.hz, harm));
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
        low: { beam: wBeam, lobe: wLobe, breakup: wBreak, excursion: midEx },
        high: { beam: mBeam, lobe: mLobe, breakup: mBreak, excursion: twtEx },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threeWay, sim, result, phaseMode, angleSets, midHpFloor, wooferXoCeiling, midXoCeiling,
      tweeterHpFloor, kaTier, cabinetInfo, ctcK, breakupLimitOn, breakupHarmonic,
      sdCm2, xmaxMm, excursionSpl, impedances]);

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
    const tAdj = { offsetMm: num(offsetMm, 0), trimDb: num(trimDb, 0), inverted };
    if (threeWay) {
      // Three branch layers through the N-branch core. The mid's OWN angle
      // set is required — a mid-less sum would be silently wrong.
      if (!sets.mid || sets.mid.length === 0) return null;
      return computeDirectivityN([
        { angles: sets.woofer, h: sim.transfers?.woofer ?? null },
        {
          angles: sets.mid,
          h: sim.transfers?.mid ?? null,
          adjust: {
            offsetMm: num(midOffsetMm, 0),
            trimDb: num(midTrimDb, 0),
            inverted: midInverted,
          },
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
    items?: { label: string; text: string; done: boolean }[];
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

  /* ---- Project persistence (step 8) ---- */

  const AUTOSAVE_KEY = 'ads-autosave';
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
    setVerify(
      state.verifyFile
        ? { name: state.verifyFile.name, raw: state.verifyFile.raw, frd: parseFrd(state.verifyFile.raw) }
        : null,
    );
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
    setTargetRipple(d.targetRipple ?? '1.5');
    setSoloSensDb(d.soloSensDb ?? '6');
    setSoloFloorOn(d.soloFloorOn ?? false);
    setSoloFloorDb(d.soloFloorDb ?? '');
    setTargetPhase(d.targetPhase ?? '10');
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
    if (!file) return;
    setError(null);
    try {
      applyProject(deserializeProject(await file.text()));
      setPersistNote(`Loaded ${file.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    e.target.value = '';
  }

  // Restore autosave once on mount. A blob that fails to restore is moved
  // aside, NEVER deleted — a transient code bug must not destroy data.
  useEffect(() => {
    // Blank slate (fresh visit or after Reset) — guide the user in: auto-open
    // the wizard on its import step so the first thing they see is "load your
    // measurements", not an empty canvas. Cancel dismisses it.
    const openWizardForEmpty = () => {
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
      setPersistNote('Restored from autosave');
    } catch {
      try {
        localStorage.setItem(`${AUTOSAVE_KEY}-unreadable`, stored);
      } catch {
        // No room to keep it aside; leave the original in place instead.
        return;
      }
      localStorage.removeItem(AUTOSAVE_KEY);
      setPersistNote('Autosave could not be restored — kept aside as backup');
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
  }, [woofer, midDrv, tweeter, project, zStandalone, angleSets, fileNotes, verify, vFilters, xoName, offsetMm, trimDb, inverted, midOffsetMm, midTrimDb, midInverted, fMin, fMax, splMin, splMax, phasePriority, vfEqBands, phaseMode, dirWeight, ampTarget, sonogramMode, designs, activeDesignId, lastSavedId, networkActive, vfBypass, catalogSnap, breakupGuard, xoRangeOn, xoFreqHz, xoMarginHz, xoScanSteps, xo3Steps, hpLpPref, hpLpPrefLow, phaseMetricMode, acSlopeMid, acSlopeTweeter, acSlopeWoofer, acSlopeMidHp, xoLowFreqHz, xoLowMarginHz, midSizeInch, wooferSizeInch, kaTier, cabinet, ctcK, breakupLimitOn, breakupHarmonic, sdCm2, xmaxMm, excursionSpl, snapProfile, snapSeriesL, snapSeriesC, snapSeriesR, snapStacks, snapBoundToSeries, stagedOn, targetRipple, targetPhase, soloSensDb, soloFloorOn, soloFloorDb]);

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
      const tAdj = { offsetMm: num(offsetMm, 0), trimDb: num(trimDb, 0), inverted };
      const mAdj = { offsetMm: num(midOffsetMm, 0), trimDb: num(midTrimDb, 0), inverted: midInverted };
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
        xo3Steps,
        lowWin3,
        highWin3,
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
            (r.bomTotalEur !== null ? ` · €${Math.round(r.bomTotalEur)}` : '') +
            (r.zOk ? '' : ' · ⚠ amp-load');
          setNetOptNote(
            `3-way scan (${variants.length} candidate${variants.length > 1 ? 's' : ''}, ` +
              `alignment × polarity design step, two-pair tune) — winner ` +
              `xo ${win.label} · ${win.structureLabel}` +
              (win.net.after.avgDevDb !== undefined
                ? ` · avg ${win.net.after.avgDevDb.toFixed(2)} dB`
                : '') +
              ` · ${line(win)}` +
              ` — others: ${ranked.slice(1).map(line).join(' · ')}` +
              // A pin the physics could not honour must be LOUD (Sanders:
              // "soms moeten we dat kunnen bypassen met een expliciete
              // waarschuwing") — the pin IS the designer's bypass of every
              // derived rule, so a silently-missed pin reads as "de range
              // wordt genegeerd". Lead the note with it instead of burying it.
              (win.xoPinNote ? ` · ⚠ PIN: ${win.xoPinNote}` : '') +
              (win.net.snapNote ? ` · ${win.net.snapNote}` : '') +
              (win.net.safetyNote ? ` · ⚠ ${win.net.safetyNote}` : '') +
              (win.net.ampFloorNote ? ` · ⚠ ${win.net.ampFloorNote}` : ''),
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
      const saneFree: [number, number] | undefined = (() => {
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
        crossoverVariants(userXo ?? saneFree, xoScanSteps);
      const adjust = { offsetMm: num(offsetMm, 0), trimDb: num(trimDb, 0), inverted };
      // The whole scan runs in the optimizer WORKER (variants loop + the
      // truly-free rescue logic live there): the UI stays responsive, the
      // per-variant counter ticks via progress messages, and Cancel simply
      // terminates the worker.
      runChainScan(
        {
          base: { grid: [...grid], w, t, driverZ: zOnGrid, adjust, seed: defaultVFilters(), settings },
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
                    bomEur: rr.bomTotalEur,
                    winner: rr === win,
                    result: rr,
                  })),
                  active: win.label,
                }
              : null,
          );
          setNetOptDiff(null); // fresh design — an old tune-diff would lie
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
              (win.net.ampFloorNote ? ` · ⚠ ${win.net.ampFloorNote}` : ''),
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
        offsetMm: num(offsetMm, 0),
        trimDb: num(trimDb, 0),
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
      winner: boolean;
      result: ChainResult;
    }[];
    /** Label of the row currently loaded in Working. */
    active: string;
  } | null>(null);

  /** Scan-table sort: click a header to sort by that column (asc → desc →
   *  back to the RANKING order, which is the default and keeps 🏆 on top). */
  const [scanSort, setScanSort] = useState<{
    key: 'xo' | 'ripple' | 'avg' | 'phase' | 'bom';
    dir: 1 | -1;
  } | null>(null);

  function toggleScanSort(key: 'xo' | 'ripple' | 'avg' | 'phase' | 'bom') {
    setScanSort((s0) =>
      s0?.key !== key ? { key, dir: 1 } : s0.dir === 1 ? { key, dir: -1 } : null,
    );
  }

  /** Load a scan candidate's complete design (specs + synth + tuned network)
   *  into Working — same application as the winner gets, undo-able. */
  function applyScanCandidate(row: { label: string; result: ChainResult }) {
    const r = row.result;
    setVFilters((p) => ({ ...p, ...r.vf.specs }));
    setInverted(r.vf.inverted);
    setVfOpt(r.vf);
    synthFresh.current = true;
    setSynth({ mode: synthMode, woofer: r.synthWoofer, tweeter: r.synthTweeter });
    setWorkingDesign(r.parts);
    setVfBypass(true);
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
      adjust: { offsetMm: num(offsetMm, 0), trimDb: num(trimDb, 0), inverted },
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
                adjust: {
                  offsetMm: num(midOffsetMm, 0),
                  trimDb: num(midTrimDb, 0),
                  inverted: midInverted,
                },
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
  useEffect(() => {
    const stored = localStorage.getItem(CUSTOM_CATALOG_KEY);
    if (!stored) return;
    try {
      const imp = deserializeCatalog(stored);
      setCustomSeries(imp.series, imp.parts);
    } catch {
      // Unreadable custom catalog: leave it in place, run with built-ins.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  function saveCatalogParts(series: CatalogSeries[], parts: CatalogPart[]) {
    setCustomSeries(series, parts);
    if (series.length === 0 && parts.length === 0) {
      // An empty custom catalog would be rejected on the next load — built-ins
      // take over, so drop the stored blob instead of persisting an invalid one.
      localStorage.removeItem(CUSTOM_CATALOG_KEY);
    } else {
      localStorage.setItem(CUSTOM_CATALOG_KEY, serializeCatalog(series, parts));
    }
    setPersistNote(
      `Catalog updated — ${parts.length} exact SKUs active (snap, BOM and inspector use them)`,
    );
    setCatalogMgrOpen(false);
  }

  async function importCatalogFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const imp = deserializeCatalog(await file.text());
      setCustomSeries(imp.series, imp.parts);
      localStorage.setItem(CUSTOM_CATALOG_KEY, serializeCatalog(imp.series, imp.parts));
      setPersistNote(`Imported catalog ${file.name} — series available in the editor inspector`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    e.target.value = '';
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
    const exWoofer = woofer ? excessDelayMsOf(woofer.frd) : null;
    const exTweeter = tweeter ? excessDelayMsOf(tweeter.frd) : null;
    const earliestMs = Math.min(exWoofer ?? 0, exTweeter ?? 0);
    const delayUs = (ex: number | null) =>
      ex === null ? 0 : Math.round((ex - earliestMs) * 1000 * 10) / 10;
    const wooferDelayUs = delayUs(exWoofer);
    const tweeterDelayUs = delayUs(exTweeter);

    // Every VituixCAD crossover variant must have exactly ONE source (Generator),
    // else it rejects the file with "Amount of sources must be one". A tab that
    // is an incomplete network (e.g. an imported bare filter) has none — skip it
    // rather than poison the whole export.
    const genCount = (d: NetworkDesign) => d.parts.filter((p) => p.type === 'Generator').length;
    const exportable = designs.filter((d) => genCount(d) === 1);
    const skipped = designs.filter((d) => genCount(d) !== 1).map((d) => d.name);
    if (exportable.length === 0) {
      setPersistNote(
        `Nothing to export: a VituixCAD variant needs exactly one generator (source), and no tab ` +
          `qualifies${skipped.length ? ` (${skipped.join(', ')})` : ''}. Add a generator to the network first.`,
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

    const drivers: VxpDriver[] = models.map((model) => {
      const tw = isTweeterModel(model);
      const onAxis = tw ? tweeter : woofer;
      const angles = (tw ? angleSets?.tweeter : angleSets?.woofer) ?? [];
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
        responseDelay: tw ? tweeterDelayUs : wooferDelayUs,
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

    const bridge =
      `Minimum phase ON (VituixCAD reconstructs phase) — excess-phase delays: ` +
      `mid ${wooferDelayUs} µs / tweeter ${tweeterDelayUs} µs carry the inter-driver timing`;
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
          `Exported folder “${base}/” — ${vxpName} + ${dataFiles.length} measurement file` +
            `${dataFiles.length === 1 ? '' : 's'} (${variants}). ${bridge}. Open ${vxpName} in VituixCAD.` +
            skippedNote +
            (missing.length ? ` Note: no ${missing.join(', ')} on record.` : ''),
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
      `Exported ${vxpName} (${variants}). ${bridge}.${skippedNote} This browser can’t write folders — place the ` +
        `measurement files next to it manually: ${dataFiles.join(', ')}. ` +
        `(Chrome/Edge export the whole folder in one go.)`,
    );
  }

  async function importFilterFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const f = deserializeFilter(await file.text());
      // Layout travels with the file — a filter exported under an older
      // layout may carry cramped coordinates. Re-place it from the netlist
      // (electrically identical); exotic topologies keep their own drawing.
      const tidied = tidySchematic(f.parts);
      addDesign(f.name, tidied ?? f.parts); // new tab — imports never cost work
      setPersistNote(`Imported filter ${file.name}${tidied ? ' (layout tidied)' : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    e.target.value = '';
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
    if (!compareTabs || !networkActive || !sim || designs.length < 2 || threeWay)
      return { spl: [], phase: [], z: [] };
    if (Object.keys(impedances).length === 0) return { spl: [], phase: [], z: [] };
    const grid = sim.combined.freq;
    const zOnGrid = Object.fromEntries(
      Object.entries(impedances).map(([model, z]) => {
        const g = resample(z.freq, z.magnitude, z.phase, [...grid], { clampEdges: true });
        return [model, g.spl.map((mag, i) => fromPolar(mag, (g.phaseDeg[i] * Math.PI) / 180))];
      }),
    );
    const spl: Series[] = [];
    const phase: Series[] = [];
    const z: Series[] = [];
    designs
      .filter((d) => d.id !== activeDesignId)
      .forEach((d, i) => {
        try {
          const { netlist } = crossoverToNetlist({ name: d.name, parts: d.parts });
          const sol = solveNetwork(netlist, grid, zOnGrid);
          let w = sim.base.w;
          let t = sim.base.t;
          const { hW, hT } = slotTransfers(sol);
          if (hW) w = applyTransfer(w, hW);
          if (hT) t = applyTransfer(t, hT);
          const combined = combine(w, t, {
            offsetMm: num(offsetMm, 0),
            trimDb: num(trimDb, 0),
            inverted,
          });
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
          phase.push({
            ...style,
            id: `ghostp:${d.id}`,
            y: breakPhaseWraps(combined.relativePhaseDeg.slice()),
          });
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
  }, [compareTabs, networkActive, sim, threeWay, impedances, designs, activeDesignId, offsetMm, trimDb, inverted]);

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
    if (!tolOn || !sim || threeWay) return null;
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
    return toleranceBand(parts, grid, wEff, tEff, zGridWithSlots(impedances, grid), {
      offsetMm: num(offsetMm, 0),
      trimDb: num(trimDb, 0),
      inverted,
    }, tolPct);
  }, [tolOn, tolPct, sim, threeWay, project, xoName, networkActive, schematic, impedances, vfBypass, vFilters, offsetMm, trimDb, inverted]);

  /** Per-driver ACOUSTIC target curves for the SPL chart (Stefans vraag:
   *  "hoever volgt de respons per speaker het target?") — the ideal shape of
   *  the virtual target design (same source as the 🎯 Targets popup), placed
   *  with ONE shared level offset (pooled passband median vs the actual
   *  driver responses). Sharing the offset preserves the targets' RELATIVE
   *  levels: a branch playing 2 dB under its target SHOWS as 2 dB deviation
   *  instead of being re-anchored away. Tweeter trim rides into its target —
   *  the trim knob is a playback adjustment, not a build deviation. */
  const targetSeries: Series[] = useMemo(() => {
    if (!result || threeWay) return [];
    const defs = [
      { id: 'wtarget', label: 'Woofer target', spec: vFilters.woofer, drv: result.woofer, color: 'var(--viz-woofer)', trim: 0, loaded: !!woofer },
      { id: 'ttarget', label: 'Tweeter target', spec: vFilters.tweeter, drv: result.tweeter, color: 'var(--viz-tweeter)', trim: num(trimDb, 0), loaded: !!tweeter },
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
      y: shapes[k].map((s) => s + offset),
      defaultOff: true,
      secondary: true,
    }));
  }, [result, threeWay, vFilters, trimDb, woofer, tweeter]);

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
      // Build-tolerance envelope hugs the combined curve — drawn first so the
      // live curves stay on top.
      ...(tolBand
        ? ([
            {
              id: 'tolhi',
              label: `±${tolBand.tolPct}% build tolerance ↑`,
              color: 'var(--viz-tick)',
              dash: '3 3',
              width: 1.2,
              x: result.freq,
              y: tolBand.upperDb,
              secondary: true,
            },
            {
              id: 'tollo',
              label: `±${tolBand.tolPct}% build tolerance ↓`,
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
              label: `Measured — ${verify.name} (${verifyCompare.offsetDb >= 0 ? '+' : ''}${verifyCompare.offsetDb.toFixed(1)} dB)`,
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
        ? [{ id: 'w', label: threeWay ? 'Woofer' : 'Woofer/mid', color: 'var(--viz-woofer)', x: result.freq, y: maskSilent(result.woofer.spl) } satisfies Series]
        : []),
      ...(sim?.mid
        ? [{ id: 'm', label: 'Midrange', color: 'var(--viz-mid)', x: result.freq, y: maskSilent(sim.mid.spl) } satisfies Series]
        : []),
      ...(tweeter
        ? [{ id: 't', label: 'Tweeter', color: 'var(--viz-tweeter)', x: result.freq, y: maskSilent(result.tweeter.spl) } satisfies Series]
        : []),
      {
        id: 'c',
        // The active tab IS the live combined curve (never a ghost) — name it
        // so the count in the legend adds up against the design tabs.
        label:
          networkActive && activeDesign ? `Combined — ${activeDesign.name}` : 'Combined',
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
                ? 'Combined, tweeter inverted (null check M-T)'
                : 'Combined, tweeter inverted (null check)',
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
              label: 'Combined, woofer inverted (null check W-M)',
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
  }, [result, sim, threeWay, maskSilent, integration, tabGhosts, networkActive, activeDesign, tolBand, targetSeries, soloDriver, verifyCompare, verify]);

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
      const name = slot === 'woofer' ? (threeWay ? 'Woofer' : 'Woofer/mid') : slot === 'mid' ? 'Midrange' : 'Tweeter';
      if (spec.hp.enabled) {
        out.push({
          id: `${slot}:hp`,
          x: spec.hp.freq,
          y: yAt(curve, spec.hp.freq),
          color,
          kind: 'x',
          label: `${name} high-pass · ${Math.round(spec.hp.freq)} Hz — drag to move the knee`,
        });
      }
      if (spec.lp.enabled) {
        out.push({
          id: `${slot}:lp`,
          x: spec.lp.freq,
          y: yAt(curve, spec.lp.freq),
          color,
          kind: 'x',
          label: `${name} low-pass · ${Math.round(spec.lp.freq)} Hz — drag to move the knee`,
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
          label: `${name} EQ ${band.type ?? 'peak'} · ${Math.round(band.freq)} Hz · ${band.gainDb.toFixed(1)} dB · Q ${band.q} — drag = freq/gain, scroll = Q`,
        });
      });
    }
    return out.length > 0 ? out : undefined;
  }, [result, sim, threeWay, vFilters, vfBypass]);

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
        label: 'Woofer filter phase',
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
        label: 'Mid filter phase',
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
        label: 'Tweeter filter phase',
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
      const raw = combine(sim.base.w, sim.base.t, {
        offsetMm: num(offsetMm, 0),
        trimDb: num(trimDb, 0),
        inverted,
      });
      out.push({
        id: 'raw',
        label: 'Relative phase — raw drivers',
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
          label: 'Woofer phase (total)',
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
          label: 'Mid phase (total)',
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
          label: 'Tweeter phase (total)',
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
        const lowPts = pairScores.low.integ.points;
        const highPts = pairScores.high.integ.points;
        const cLow = pairScores.low.integ.overlapCentreHz;
        const cHigh = pairScores.high.integ.overlapCentreHz;
        const split = cLow !== null && cHigh !== null ? Math.sqrt(cLow * cHigh) : null;
        // Each pair's window as ONE CONTIGUOUS span (first..last overlap
        // point). The raw per-point |ΔdB| ≤ 20 test flickers at the window
        // edges — that drew bites and orphan islands in the line (Sanders'
        // report); interior points that briefly fail the test still carry a
        // perfectly meaningful relative phase.
        const spanOf = (pts: typeof lowPts): [number, number] | null => {
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
        const lowSpan = spanOf(lowPts);
        const highSpan = spanOf(highPts);
        const y: number[] = new Array(result.freq.length).fill(NaN);
        const cols: (string | null)[] = new Array(result.freq.length).fill(null);
        for (let i = 0; i < result.freq.length; i++) {
          const lowOn = lowSpan !== null && i >= lowSpan[0] && i <= lowSpan[1];
          const highOn = highSpan !== null && i >= highSpan[0] && i <= highSpan[1];
          const useLow =
            lowOn && (!highOn || (split !== null && result.freq[i] < split));
          if (useLow) {
            y[i] = wrapDeg(midPh[i] - result.woofer.phaseDeg[i]);
            cols[i] = TIER_COLOR[phaseTier(lowPts[i].phaseErrorDeg)];
          } else if (highOn) {
            y[i] = wrapDeg(result.tweeter.phaseDeg[i] - midPh[i]);
            cols[i] = TIER_COLOR[phaseTier(highPts[i].phaseErrorDeg)];
          }
        }
        out.push({
          id: 'pairalign',
          label: 'Relative phase — active pair',
          color: 'var(--viz-combined)',
          x: result.freq,
          y: breakWraps(y),
          pointColors: cols,
          width: 2.5,
        });
      }
      out.push({
        id: 'relmw',
        label: 'Mid phase relative to woofer',
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
        label: 'Tweeter phase relative to mid',
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
        label: 'Tweeter phase relative to woofer',
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
        label: 'VituixCAD (timing removed)',
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
        label: 'Measured phase residual (vs model)',
        color: 'var(--viz-ghost3)',
        x: result.freq,
        y: verifyCompare.phase.residualDeg,
        dash: '9 3',
        width: 2,
      });
    }
    return out;
  }, [result, integration, pairScores, sim, threeWay, offsetMm, trimDb, inverted, showPanels.phase, refResp, tabGhosts, woofer, tweeter, soloDriver, verifyCompare]);

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
                  <td>{it.text}</td>
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
          title="Stop the run — nothing is committed, your design stays as it was"
        >
          Cancel
        </button>
      )}
    </>
  );
  if (anyBusy) busyCardBodyRef.current = busyCardBody;

  return (
    <div className={`app-shell layout-${layoutMode}`}>
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
      {wizardOpen && (
        <Modal
          open
          onClose={() => setWizardOpen(false)}
          label="Design wizard"
          cardClass="targets-card wizard-card"
        >
          <div className="busy-title">🧙 Design wizard</div>
          <div className="wizard-steps">
            {wizardSteps.map((s, i) => (
              <span key={s.id} className={wizardPos >= 0 && i <= wizardPos ? 'done' : ''} />
            ))}
          </div>
          <p className="sub" style={{ width: '100%', margin: 0 }}>
            {wizardPos < 0
              ? 'First — load your measurements'
              : `Step ${wizardPos + 1} of ${wizardSteps.length} · ${wizardSteps[wizardPos].label}`}
          </p>

          <div className="wizard-body">
          {wizardStep === 0 && (
            <>
              <p>
                <strong>System type</strong> — what are we designing? The wizard then shows only
                the measurement slots that apply, and Next unlocks once the set is complete.
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
                        ? 'Flatten one driver (series traps, shelf groups, Zobel) — the validation flow'
                        : w === 2
                          ? 'Classic two-driver crossover design — the full optimizer chain'
                          : 'Three branches: sim, filters and network editor work; the 3-way optimizer is a later step'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="sub" style={{ marginBottom: '0.4rem' }}>
                <strong>Measurements</strong> — load a 0° FRD per driver; include the .ZMA
                impedance and any angle files in the SAME pick to unlock more (recognised by
                extension and filename).
              </p>
              {wizardWays === 2 && (
                <button
                  type="button"
                  className="primary"
                  onClick={loadDemo}
                  title="Load the bundled KOAN measurements (all angles + impedances + vxp variants) — instant playground"
                >
                  🎧 Load KOAN demo data
                </button>
              )}
              <p className="sub" style={{ marginBottom: '0.2rem' }}>
                {wizardWays === 2 ? '…or load your own:' : 'Load your measurements:'}
              </p>
              {wizardWays === 1 ? (
                <label className="file-button" style={{ display: 'block' }}>
                  {woofer || tweeter
                    ? `✓ Driver — ${(woofer ?? tweeter)!.name}`
                    : 'Driver — FRD (+ ZMA/LIMP, + angle files)'}
                  <input
                    type="file"
                    accept=".frd,.txt,.zma,.ZMA,.lim"
                    multiple
                    onChange={loadDriverFiles('woofer')}
                    style={{ display: 'none' }}
                  />
                </label>
              ) : (
                <>
                  <label className="file-button" style={{ display: 'block', marginBottom: '0.3rem' }}>
                    {woofer
                      ? `✓ ${wizardWays === 3 ? 'Woofer' : 'Woofer / mid'} — ${woofer.name}`
                      : `${wizardWays === 3 ? 'Woofer' : 'Woofer / mid'} — FRD (+ ZMA/LIMP, + angle files)`}
                    <input
                      type="file"
                      accept=".frd,.txt,.zma,.ZMA,.lim"
                      multiple
                      onChange={loadDriverFiles('woofer')}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {wizardWays === 3 && (
                    <label className="file-button" style={{ display: 'block', marginBottom: '0.3rem' }}>
                      {midDrv
                        ? `✓ Midrange — ${midDrv.name}`
                        : 'Midrange — FRD (+ ZMA/LIMP, + angle files)'}
                      <input
                        type="file"
                        accept=".frd,.txt,.zma,.ZMA,.lim"
                        multiple
                        onChange={loadDriverFiles('mid')}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                  <label className="file-button" style={{ display: 'block' }}>
                    {tweeter ? `✓ Tweeter — ${tweeter.name}` : 'Tweeter — FRD (+ ZMA/LIMP, + angle files)'}
                    <input
                      type="file"
                      accept=".frd,.txt,.zma,.ZMA,.lim"
                      multiple
                      onChange={loadDriverFiles('tweeter')}
                      style={{ display: 'none' }}
                    />
                  </label>
                </>
              )}
              {wizardMissing.length > 0 && (
                <p className="sub" style={{ marginTop: '0.4rem' }}>
                  Still needed for a {wizardWays}-way: <strong>{wizardMissing.join(', ')}</strong>.
                </p>
              )}
              {wizardOverloaded && (
                <p className="nl-warning" style={{ marginTop: '0.4rem' }}>
                  ⚠ More is loaded than a {wizardWays}-way — the app follows what is actually
                  loaded, never the declared choice. Switch the system type above, or remove the
                  extra driver in the Import tab (✕).
                </p>
              )}
              {wizardWays === 3 && wizardMissing.length === 0 && (
                <p className="sub" style={{ marginTop: '0.4rem' }}>
                  ✓ 3-way set complete — continue to Goals. Optimize runs the staged 2D scan:
                  LR4 targets + measured level trims per handover candidate, per-branch
                  synthesis, assembled two-pair tune (amp-load verdict gates the ranking).
                </p>
              )}
              <p className="sub">
                <strong>Impedances (.ZMA)</strong> unlock the passive build &amp; component tune;{' '}
                <strong>angle files</strong> unlock the amplitude target &amp; in-room weight in
                the Goals step. The full importer (VituixCAD projects, save/load) lives in the
                Import tab.
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
                    <strong>Timing check</strong>{' '}
                    <span className="sub">
                      — do the two phase measurements share a time reference? (Wrong timing
                      silently ruins the phase sum — it's the whole reason this tool exists.)
                    </span>
                  </p>
                  {timing.ref.verdict === 'plausible' ? (
                    <p className="sub" style={{ margin: 0 }}>
                      ✓ <strong>Plausible</strong> — the measured phase carries the real
                      inter-driver delay (Δ {timing.ref.deltaUs.toFixed(0)} µs ≈{' '}
                      {timing.ref.deltaMm.toFixed(1)} mm). Offset stays 0; nothing to enter.
                    </p>
                  ) : (
                    <>
                      <p className="nl-warning" style={{ margin: '0 0 0.3rem' }}>
                        ⚠ <strong>{timing.ref.verdict}</strong> — {timing.ref.message}
                      </p>
                      <p style={{ margin: 0 }}>
                        Physical offset between the drivers' acoustic centres (tweeter deeper =
                        positive){' '}
                        <input
                          type="number"
                          step={1}
                          value={offsetMm}
                          onChange={(e) => setOffsetMm(e.target.value)}
                          style={{ width: '5rem' }}
                        />{' '}
                        mm <span className="sub">= {delayUs.toFixed(0)} µs delay</span>
                      </p>
                      <p className="sub" style={{ margin: '0.2rem 0 0' }}>
                        Enter it from the physical driver spacing (the measured Δ ≈{' '}
                        {timing.ref.deltaMm.toFixed(1)} mm looks off, so don't trust it blindly).
                        The full timing sanity check + the measured/minimum phase toggle live in
                        the Setup tab.
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
                  <strong>Component catalog</strong>{' '}
                  <span className="sub">
                    — powers Snap to catalog &amp; the BOM. It lives OUTSIDE the project, so it
                    persists across a Reset (that's why the optimizer can still use one).
                  </span>
                </p>
                <p className="sub" style={{ margin: '0 0 0.3rem' }}>
                  {hasImportedCatalog()
                    ? `✓ An imported catalog is still loaded — ${allSeries().length} series` +
                      (customCatalogParts().length
                        ? ` · ${customCatalogParts().length} exact parts`
                        : '') +
                      (allSeries().some((sr) => sr.basePrice !== undefined) ||
                      customCatalogParts().some((pp) => pp.priceEur !== undefined)
                        ? ' · prices'
                        : '') +
                      '. Snap-to-catalog is available.'
                    : `No imported catalog — only the built-in library (${allSeries().length} series) for BOM matching & inspector suggestions. Import one to unlock Snap to catalog + real prices.`}
                </p>
                <label className="file-button" style={{ display: 'inline-block' }}>
                  {hasImportedCatalog() ? 'Replace catalog' : 'Import catalog (optional)'}
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

          {wizardStep === 1 && (
            <>
              <p>
                <strong>Goals</strong> — start with what "done" means. How simple should the
                filter be, and how do you weigh a flat response against tight phase? (Shared
                with ⚙ Settings — this is just the guided path.)
              </p>
              <label style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={stagedOn}
                  onChange={(e) => setStagedOn(e.target.checked)}
                />{' '}
                Staged design — stop escalating once the targets are met (fewest components)
              </label>
              {stagedOn && (
                <p>
                  Targets: ripple ≤{' '}
                  <input
                    type="number"
                    min={0.1}
                    max={6}
                    step={0.1}
                    value={targetRipple}
                    onChange={(e) => setTargetRipple(e.target.value)}
                    style={{ width: '4.5rem' }}
                  />{' '}
                  ±dB peak (as in the SPL strip)
                  {!soloDriver && (
                    <>
                      {' '}· phase ≤{' '}
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
              {soloDriver ? (
                <p className="sub">
                  Single-driver mode: relative phase does not exist, so the priority trade-off
                  doesn't apply — the solo engine optimises response flatness with cut-only
                  EQ/shelves.
                </p>
              ) : (
              <p style={{ marginBottom: '0.1rem' }}>What should the optimizer favour?</p>
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
                ).map(([key, val, label, hint]) => {
                  const bucket =
                    phasePriority < 40 ? 'flat' : phasePriority > 60 ? 'phase' : 'bal';
                  return (
                    <label key={key} style={{ display: 'block' }}>
                      <input
                        type="radio"
                        name="wiz-priority"
                        checked={bucket === key}
                        onChange={() => setPhasePriority(val)}
                      />{' '}
                      {label} <span className="sub">— {hint}</span>
                    </label>
                  );
                })}
              {!soloDriver && (
              <p className="sub">
                On real measurements a smooth response already buys most of the phase, so
                these differ less than you'd expect — fine control (any %) lives in ⚙ Settings.
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
                      <strong>Amplitude target</strong>{' '}
                      <span className="sub">— which curve the optimizer flattens</span>
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
                            ? 'flattening the 0–30° average'
                            : 'flattening the 0° axis'}
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
                          On-axis (0°){' '}
                          <span className="sub">
                            — flattest response dead ahead; off-axis falls where it falls. Best
                            for near-field or a fixed seat.
                          </span>
                        </label>
                        <label style={{ display: 'block', marginTop: '0.3rem' }}>
                          <input
                            type="radio"
                            name="wiz-amptarget"
                            checked={ampTarget === 'listeningWindow'}
                            onChange={() => setAmpTarget('listeningWindow')}
                          />{' '}
                          Listening window (0–30°){' '}
                          <span className="sub">
                            — averages the front arc, so a hair of on-axis flatness buys a
                            smoother tone across a normal seating spread.
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                  {/* --- In-room weight: its own section --- */}
                  <div
                    style={{
                      marginTop: '0.6rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid rgba(128,128,128,0.25)',
                    }}
                  >
                    <p style={{ margin: '0 0 0.2rem' }}>
                      <strong>In-room weight: {dirWeight}%</strong>{' '}
                      <span className="sub">(energy average)</span>
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
                      How much it ALSO smooths the energy average (the power response: every angle
                      summed ≈ the room's tonal balance). Higher = more even directivity /
                      smoother in-room sound, trading a little on-axis flatness. 0% = on-axis
                      only.
                    </p>
                  </div>
                </>
              ) : (
                <p className="sub" style={{ marginTop: '0.7rem' }}>
                  <strong>Amplitude target &amp; in-room weight</strong> unlock once you load
                  angle measurements (Import → per-driver angle FRDs). With only a 0° measurement
                  there is nothing off-axis to optimise, so these stay inert.
                </p>
              )}
            </>
          )}

          {wizardStep === 2 && (
            <>
              <p>
                <strong>Crossover</strong> — where the drivers hand over, and how steep the
                ACOUSTIC slopes are. On real measurements Auto usually wins; force a slope only
                when you have a reason — a placeholder driver, or a house alignment.
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
                    <strong>Tuning range</strong>{' '}
                    <span className="sub">
                      — the band the optimizer flattens &amp; scores over (the design scope)
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
                        · suggested{' '}
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
                          Use suggested
                        </button>
                      </>
                    ) : (
                      <span className="sub">✓ = your usable measured range</span>
                    )}
                  </p>
                  <p className="sub" style={{ margin: '0.1rem 0 0' }}>
                    Wider = the whole speaker is judged; narrower = focus the tuning on the
                    crossover (a full-band safety check still guards the rest).
                  </p>
                  {systemLevelDb && (
                    <p style={{ margin: '0.3rem 0 0' }}>
                      <strong>Target level ≈ {systemLevelDb.level} dB</strong>{' '}
                      <span className="sub">
                        — the passive system level, set by the {systemLevelDb.limiter} (the louder
                        driver is padded down to match; passive can't boost above this).
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
                Pin the acoustic crossover point
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
                  ? 'Pinned: the optimizer aims for this acoustic crossover (± margin) and picks the best design there.'
                  : tweeterHpFloor !== null && midXoCeiling !== null
                    ? `Free: the optimizer aims for the CENTRE of your driver window — ≈${Math.round(
                        Math.sqrt(tweeterHpFloor * Math.max(midXoCeiling, tweeterHpFloor * 1.2)),
                      )} Hz, the geometric mean of the 2×Fs tweeter floor (${tweeterHpFloor} Hz) and the ${midXoCeiling} Hz mid beaming ceiling. Pin only to override.`
                    : 'Free: the optimizer stays within a sensible band (≈2×Fs up to the mid beaming limit) and picks the best crossover there. Set the mid size below for a physically-exact window; pin only for a specific point.'}
              </p>
              {tweeterHpFloor !== null && (
                <p className="sub">HP floor {tweeterHpFloor} Hz (2×Fs) is applied automatically.</p>
              )}
              <p>
                Mid size (sets the beaming ceiling){' '}
                <select value={midSizeInch} onChange={(e) => setMidSizeInch(e.target.value)}>
                  <option value="">unknown</option>
                  {['3', '4', '5', '5.25', '6.5', '8'].map((v) => (
                    <option key={v} value={v}>
                      {v}"
                    </option>
                  ))}
                </select>
                {midXoCeiling !== null && (
                  <span className="sub"> · beaming ceiling ≈ {midXoCeiling} Hz</span>
                )}
              </p>
              <p className="sub" style={{ marginBottom: '0.15rem' }}>
                The next two look alike but are NOT the same thing — one is how you build it,
                the other is what comes out:
              </p>
              <p style={{ margin: '0 0 0.1rem' }}>
                <strong>HP/LP alignment</strong>{' '}
                <span className="sub">— the ELECTRICAL filter you build (topology &amp; part count; binding)</span>{' '}
                <select value={hpLpPref} onChange={(e) => setHpLpPref(e.target.value)}>
                  <option value="auto">Auto (library)</option>
                  {['LR2', 'LR4', 'BW2', 'BW3', 'BW4', 'BS2', 'BS3', 'BS4'].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </p>
              <p style={{ margin: '0 0 0.1rem' }}>
                <strong>Acoustic slopes</strong>{' '}
                <span className="sub">— the MEASURED roll-off of driver + filter together (the result)</span>
                <br />
                mid{' '}
                <select value={acSlopeMid} onChange={(e) => setAcSlopeMid(e.target.value)}>
                  <option value="auto">Auto</option>
                  {['12', '18', '24', '30', '36'].map((v) => (
                    <option key={v} value={v}>
                      {v} dB/oct
                    </option>
                  ))}
                </select>{' '}
                · tweeter{' '}
                <select value={acSlopeTweeter} onChange={(e) => setAcSlopeTweeter(e.target.value)}>
                  <option value="auto">Auto</option>
                  {['12', '18', '24', '30', '36'].map((v) => (
                    <option key={v} value={v}>
                      {v} dB/oct
                    </option>
                  ))}
                </select>
              </p>
              <p className="sub">
                Electrical order ≠ acoustic order: the driver already rolls off, so an electrical
                LR2 can MEASURE as an acoustic 4th order. Set the alignment when you care about the
                build (part count / a house alignment); set the acoustic slopes when you care about
                the summation result; leave either on Auto to let the measurement decide (often a
                touch better). Pinning both can over-constrain.
              </p>
            </>
          )}

          {wizardStep === 3 && (
            <>
              <p>
                <strong>Components</strong> — now turn the ideal design into parts you can buy:
                snap to your catalog, then choose quality tiers and brands.
              </p>
              <label
                style={{ display: 'block', opacity: hasImportedCatalog() ? 1 : 0.5 }}
                title={
                  hasImportedCatalog()
                    ? 'Snap the build + tuner to purchasable catalog values'
                    : 'Import a catalog first — without one there are no real parts to snap to, so the design keeps theoretically ideal (continuous) values'
                }
              >
                <input
                  type="checkbox"
                  checked={catalogSnap && hasImportedCatalog()}
                  disabled={!hasImportedCatalog()}
                  onChange={(e) => setCatalogSnap(e.target.checked)}
                />{' '}
                Snap to catalog (build + tuner end on purchasable values)
                {!hasImportedCatalog() && ' — import a catalog first'}
              </label>
              <p className="sub">
                Catalog: {allSeries().length} series
                {customCatalogParts().length > 0 && ` · ${customCatalogParts().length} exact parts`}
                {allSeries().some((sr) => sr.basePrice !== undefined) ||
                customCatalogParts().some((pp) => pp.priceEur !== undefined)
                  ? ' · prices loaded'
                  : ' · no prices yet'}
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
                  {label}
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
                  {label}{' '}
                  <select value={value} onChange={(e) => set(e.target.value)}>
                    <option value="auto">Auto (all series)</option>
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
                        ? "Bound series also HARD-limit the fit to their value range (series-path slots only), so the optimizer works within e.g. Alumen 1–10 µF and the rest of the network adapts. The result reports what the constraint cost vs an unconstrained fit."
                        : 'Pick a specific series above first — this constrains the fit to that series’ values.'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={snapBoundToSeries && anySeries}
                      disabled={!anySeries}
                      onChange={(e) => setSnapBoundToSeries(e.target.checked)}
                    />{' '}
                    Constrain the fit to the chosen series’ values (series-path only) — e.g.
                    dead-set on Alumen ⇒ the tweeter cap stays 1–10 µF and the network adapts
                  </label>
                );
              })()}
              <label style={{ display: 'block' }}>
                <input
                  type="checkbox"
                  checked={snapStacks}
                  onChange={(e) => setSnapStacks(e.target.checked)}
                />{' '}
                Allow 2-part stacks — a preferred tier/series stacks WITHIN itself before
                falling back; the result reports what stacking bought (fit % / €)
              </label>
              <p className="sub">
                Series choices are binding per type; a series that cannot cover a value falls
                back rather than breaking the fit.
              </p>
            </>
          )}

          {wizardStep === 4 && (
            <>
              <p>
                <strong>Review &amp; run</strong> — here's the plan. Optimize designs, builds and
                tunes the whole chain in one go.
              </p>
              {soloDriver ? (
                <p>
                  <strong>Single-driver mode</strong> — flatten the{' '}
                  {soloDriver === 'woofer' ? 'woofer/mid' : 'tweeter'} with cut-only EQ/shelves
                  (≤ {vfEqBands} bands), built as series traps / shelf groups (+ Zobel when the
                  impedance rises) and component-tuned against the measurement.
                  <br />
                  {stagedOn ? `Staged: target ≤ ${targetRipple} dB peak ripple` : 'Classic full-budget run'}
                  {soloFloorOn && soloFloorInfo
                    ? ` · flat at ${soloFloorInfo.floor} dB (reaches ${hz(soloFloorInfo.reach[0])}–${hz(soloFloorInfo.reach[1])})`
                    : ` · sensitivity budget ${soloSensDb} dB`}
                  <br />
                  {catalogSnap && hasImportedCatalog()
                    ? `Snap to catalog · profile ${snapProfile}`
                    : 'Theoretically ideal (continuous) component values — no snap'}
                </p>
              ) : (
              <p>
                {stagedOn
                  ? `Staged: targets ≤ ${targetRipple} dB / ${targetPhase}°`
                  : 'Classic full-budget run'}{' '}
                · priority {100 - phasePriority}/{phasePriority}
                <br />
                {xoRangeOn ? `Crossover pinned at ${xoFreqHz} ± ${xoMarginHz} Hz` : 'Crossover free'}
                {tweeterHpFloor !== null && ` · HP floor ${tweeterHpFloor} Hz`}
                <br />
                Alignment {hpLpPref === 'auto' ? 'Auto' : hpLpPref} · slopes mid{' '}
                {acSlopeMid === 'auto' ? 'Auto' : `${acSlopeMid} dB/oct`} / tweeter{' '}
                {acSlopeTweeter === 'auto' ? 'Auto' : `${acSlopeTweeter} dB/oct`}
                <br />
                {catalogSnap && hasImportedCatalog()
                  ? `Snap to catalog · profile ${snapProfile}`
                  : 'Theoretically ideal (continuous) component values — no snap'}
              </p>
              )}
              <p className="sub">
                Optimize runs the full chain: design →{' '}
                {soloDriver ? 'solo topology build' : 'passive build'} → component tune
                {catalogSnap && hasImportedCatalog() ? ' → catalog snap' : ''}.
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
                  ← Back
                </button>
              ) : (
                <button type="button" onClick={() => setWizardOpen(false)}>
                  Cancel
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
                      ? `Still needed for a ${wizardWays}-way: ${wizardMissing.join(', ')}`
                      : ''
                  }
                >
                  Next →
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
                  🚀 Optimize — design for me
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
          { id: 1, label: 'Design' },
          { id: 2, label: 'Drivers' },
          { id: 3, label: 'Measurement' },
          { id: 4, label: 'Verdict' },
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
            label="Compare wizard — model vs measurement"
            cardClass="targets-card wizard-card"
          >
            <div className="busy-title">🔬 Compare — model vs measurement</div>
            <div className="wizard-steps">
              {steps.map((st, i) => (
                <span key={st.id} className={i <= pos ? 'done' : ''} />
              ))}
            </div>
            <p className="sub" style={{ width: '100%', margin: 0 }}>
              Step {pos + 1} of {steps.length} · {steps[pos].label}
            </p>
            <div className="wizard-body">
              {cmpStep === 1 && (
                <>
                  <p>
                    <strong>Design</strong> — the comparison judges the simulated Combined of the
                    ACTIVE network tab, so that tab must be the design you actually built.
                  </p>
                  <Ok ok={designs.length > 0}>
                    A network design exists{activeDesign ? <> — active: <strong>{activeDesign.name}</strong></> : null}.
                    Import one (Network → Import filter / Import variant) or rebuild the physical
                    build with New from template + the editor.
                  </Ok>
                  <Ok ok={networkActive}>
                    "Use in simulation" is on — otherwise the sim shows the virtual filters, not
                    your network.
                  </Ok>
                  <p className="sub">
                    Rebuilding what is physically on the bench? Enter the MEASURED component values
                    in the inspector — that difference (design vs solder) is often the first thing
                    this comparison exposes.
                  </p>
                </>
              )}
              {cmpStep === 2 && (
                <>
                  <p>
                    <strong>Drivers</strong> — the simulation is measured drivers × your network,
                    so the driver files must be the same measurements the design was made with.
                  </p>
                  <Ok ok={!!woofer}>{threeWay ? 'Woofer' : 'Woofer/mid'} response (FRD){woofer ? ` — ${woofer.name}` : ''}</Ok>
                  <Ok ok={zLow}>{threeWay ? 'Woofer' : 'Woofer/mid'} impedance (ZMA/LIMP)</Ok>
                  {threeWay && (
                    <>
                      <Ok ok={!!midDrv}>Midrange response (FRD){midDrv ? ` — ${midDrv.name}` : ''}</Ok>
                      <Ok ok={zMidBr}>Midrange impedance (ZMA/LIMP)</Ok>
                    </>
                  )}
                  <Ok ok={!!tweeter}>Tweeter response (FRD){tweeter ? ` — ${tweeter.name}` : ''}</Ok>
                  <Ok ok={zTw}>Tweeter impedance (ZMA/LIMP)</Ok>
                  <p className="sub">
                    Single-driver validation (one driver through its network) is fine: load just
                    that driver and the app runs in solo mode.
                  </p>
                </>
              )}
              {cmpStep === 3 && (
                <>
                  <p>
                    <strong>Measurement</strong> — measure the BUILT system with the same rig as
                    the driver measurements (same gate, same mic position discipline), export as
                    FRD with phase, and load it here.
                  </p>
                  <Ok ok={!!verify}>
                    Verification measurement{verify ? ` — ${verify.name}` : ''}
                  </Ok>
                  <p>
                    <label className="file-button">
                      {verify ? 'Replace measurement…' : 'Load measurement (FRD)…'}
                      <input type="file" accept=".frd,.txt" onChange={loadVerification} />
                    </label>
                    {verify && (
                      <button
                        type="button"
                        onClick={() => setVerify(null)}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        Remove
                      </button>
                    )}
                  </p>
                  <p className="sub">
                    Level and mic distance do NOT need to match the sim — the comparison aligns
                    level (median) and fits the mic delay out of the phase, and shows both numbers
                    instead of hiding them.
                  </p>
                </>
              )}
              {cmpStep === 4 && (
                <>
                  <p>
                    <strong>Verdict</strong> — judged over the visible SPL range (zoom the chart to
                    change the band being graded).
                  </p>
                  {!verifyCompare ? (
                    <p className="sub">
                      No comparison yet — {verify ? 'the simulation has no result (check steps 1–2).' : 'load a verification measurement in step 3.'}
                    </p>
                  ) : (
                    <>
                      <p>
                        <strong>Magnitude</strong>: avg ±{verifyCompare.avgAbsDb.toFixed(2)} dB ·
                        P95 ±{verifyCompare.p95AbsDb.toFixed(2)} dB · worst{' '}
                        {verifyCompare.maxAt.deltaDb.toFixed(1)} dB at {hz(verifyCompare.maxAt.freqHz)}
                        {' '}(band {Math.round(verifyCompare.band[0])}–{Math.round(verifyCompare.band[1])} Hz,
                        level-aligned {verifyCompare.offsetDb >= 0 ? '+' : ''}
                        {verifyCompare.offsetDb.toFixed(1)} dB)
                      </p>
                      {verifyCompare.phase ? (
                        <p>
                          <strong>Phase</strong>: residual avg {verifyCompare.phase.avgAbsDeg.toFixed(1)}° ·
                          P95 {verifyCompare.phase.p95AbsDeg.toFixed(0)}° · fitted mic delay{' '}
                          {verifyCompare.phase.fittedDelayUs.toFixed(0)} µs
                          {verifyCompare.phase.looksInverted && (
                            <> · <strong>⚠ offset ≈ 180° — the build is likely wired INVERTED vs the sim</strong></>
                          )}
                        </p>
                      ) : (
                        <p className="sub">Measurement carries no phase column — magnitude verdict only.</p>
                      )}
                      <p className="sub">
                        The overlay lives in the SPL chart, the phase residual in the Phase chart —
                        flat at 0° means the model's phase is right where it matters.
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
                    ← Back
                  </button>
                ) : (
                  <button type="button" onClick={() => setCmpOpen(false)}>
                    Cancel
                  </button>
                )}
              </div>
              <div className="row">
                {pos < steps.length - 1 ? (
                  <button type="button" className="primary" onClick={() => setCmpStep(steps[pos + 1].id)}>
                    Next →
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
                    Done — show the charts
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
          label="Add LCR notch (trap)"
          cardClass="targets-card"
        >
          <div className="busy-title">➕ Add LCR notch (trap)</div>
          <p className="sub">
            A series L–C–R across the driver — a low-impedance path at the centre frequency that
            sucks out a peak. <strong>Depth</strong> sets R, <strong>Q</strong> sets the L/C ratio;
            the values follow from the measured impedance. It goes in live — fine-tune afterwards
            with ⚙ Optimize components.
          </p>
          <p>
            Driver{' '}
            <select value={trapModel} onChange={(e) => setTrapModel(e.target.value)}>
              {zModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </p>
          <p>
            Centre{' '}
            <input
              type="number"
              min={100}
              max={20000}
              step={50}
              value={trapFreq}
              onChange={(e) => setTrapFreq(e.target.value)}
              style={{ width: '6rem' }}
            />{' '}
            Hz · depth{' '}
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
                (|Z| ≈ {trapCompute.zmag} Ω at {trapFreq} Hz)
              </span>
            </p>
          ) : (
            <p className="sub">
              Enter a centre frequency and a <strong>negative</strong> depth (a cut) — passive can
              only notch a peak, not boost.
            </p>
          )}
          <div className="row" style={{ justifyContent: 'space-between', marginTop: '0.6rem' }}>
            <button type="button" onClick={() => setTrapOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!trapCompute}
              onClick={addNotchTrap}
            >
              Add trap
            </button>
          </div>
        </Modal>
      )}
      {showTargets && (
        <Modal
          open
          onClose={() => setShowTargets(false)}
          label="Design targets — virtual to acoustic"
          cardClass="targets-card"
        >
          <div className="busy-title">🎯 Design targets — virtual → acoustic</div>
          <p className="sub">
            The virtual target design the last passive build was fitted to (acoustic mode fits
            measured driver × filter against these ideal shapes).
          </p>
          <p>
            <strong>Woofer / mid target:</strong>{' '}
            {vFilters.woofer.lp.enabled
              ? `LP ${vFilters.woofer.lp.kind}${vFilters.woofer.lp.order} (${
                  vFilters.woofer.lp.order * 6
                } dB/oct electrical) @ ${Math.round(vFilters.woofer.lp.freq)} Hz`
              : 'no LP'}
            {vFilters.woofer.hp.enabled &&
              ` · HP ${vFilters.woofer.hp.kind}${vFilters.woofer.hp.order} @ ${Math.round(
                vFilters.woofer.hp.freq,
              )} Hz`}
            {vFilters.woofer.gainDb !== 0 && ` · gain ${vFilters.woofer.gainDb.toFixed(1)} dB`}
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
            <strong>Tweeter target:</strong>{' '}
            {vFilters.tweeter.hp.enabled
              ? `HP ${vFilters.tweeter.hp.kind}${vFilters.tweeter.hp.order} (${
                  vFilters.tweeter.hp.order * 6
                } dB/oct electrical) @ ${Math.round(vFilters.tweeter.hp.freq)} Hz`
              : 'no HP'}
            {vFilters.tweeter.lp.enabled &&
              ` · LP ${vFilters.tweeter.lp.kind}${vFilters.tweeter.lp.order} @ ${Math.round(
                vFilters.tweeter.lp.freq,
              )} Hz`}
            {vFilters.tweeter.gainDb !== 0 && ` · gain ${vFilters.tweeter.gainDb.toFixed(1)} dB`}
            {inverted && ' · polarity inverted'}
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
              <strong>Measured on the current sim:</strong> acoustic crossover ≈{' '}
              {Math.round(acousticSlopes.xo)} Hz
              {acousticSlopes.wooferDbPerOct !== null && (
                <>
                  {' '}
                  · mid falls ≈ {Math.abs(acousticSlopes.wooferDbPerOct).toFixed(0)} dB/oct above
                  it (≈ {ordinal(Math.max(1, Math.round(Math.abs(acousticSlopes.wooferDbPerOct) / 6)))}
                  -order acoustic)
                </>
              )}
              {acousticSlopes.tweeterDbPerOct !== null && (
                <>
                  {' '}
                  · tweeter falls ≈ {Math.abs(acousticSlopes.tweeterDbPerOct).toFixed(0)} dB/oct
                  below it (≈{' '}
                  {ordinal(Math.max(1, Math.round(Math.abs(acousticSlopes.tweeterDbPerOct) / 6)))}
                  -order acoustic)
                </>
              )}
            </p>
          )}
          <p className="sub">
            Electrical component count ≠ acoustic order: the driver's own rolloff and impedance
            stack on top of the network, and acoustic-mode synthesis exploits that. The measured
            slopes above are the real (acoustic) orders.
          </p>
          <button type="button" onClick={() => setShowTargets(false)}>
            Close
          </button>
        </Modal>
      )}
      <header className="topbar" title="Combined SPL & relative phase — woofer normalised to 0°, tweeter shown against it.">
        <h1>SD Acoustics - Crossover Studio</h1>
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
                  Timing <strong>{worst.verdict}</strong>
                </span>
              );
            })()
          ) : timing ? (
            <span
              className={`status-chip ${timing.ref.verdict === 'plausible' ? 'chip-ok' : 'chip-warn'}`}
              title={timing.ref.message}
            >
              <span className="chip-dot" />
              Timing <strong>{timing.ref.verdict}</strong>
            </span>
          ) : null}
          {combinedFlat && (
            <span
              className={`status-chip ${
                combinedFlat.score >= 85 ? 'chip-ok' : combinedFlat.score >= 70 ? 'chip-warn' : 'chip-bad'
              }`}
              title="Whole-range flatness of the combined response, 0–100 — from the AVERAGE deviation over the visible range, so one narrow dip can't dominate the verdict (the peak ±dB in the SPL strip still shows it)"
            >
              Response <strong>{combinedFlat.score.toFixed(0)}</strong>
            </span>
          )}
          {integration?.overlapCentreHz != null && (
            <span className="status-chip" title="Where the driver levels meet">
              Overlap <strong>{Math.round(integration.overlapCentreHz)} Hz</strong>
            </span>
          )}
          {pairScores &&
            pairScores.low.integ.overlapCentreHz != null &&
            pairScores.high.integ.overlapCentreHz != null && (
              <span
                className="status-chip"
                title="Where the driver levels meet, per adjacent pair: woofer-mid / mid-tweeter"
              >
                Overlap{' '}
                <strong>
                  {Math.round(pairScores.low.integ.overlapCentreHz)} /{' '}
                  {Math.round(pairScores.high.integ.overlapCentreHz)} Hz
                </strong>
              </span>
            )}
          {phaseStats && (
            <span
              className={`status-chip ${
                phaseStats.p95ErrorDeg <= 45 ? 'chip-ok' : phaseStats.p95ErrorDeg <= 90 ? 'chip-warn' : 'chip-bad'
              }`}
              title="95th-percentile phase error in the driver overlap — ≤45° sums fully, ≤90° still gains ≥3 dB, beyond that the drivers stop helping each other"
            >
              Fase P95 <strong>{phaseStats.p95ErrorDeg.toFixed(0)}°</strong>
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
                  worst <= 45 ? 'chip-ok' : worst <= 90 ? 'chip-warn' : 'chip-bad'
                }`}
                title="Worst pair's 95th-percentile phase error (woofer-mid vs mid-tweeter overlap windows)"
              >
                Fase P95 <strong>{worst.toFixed(0)}°</strong>
              </span>
            );
          })()}
        </div>
        <div className="theme-switch" role="group" aria-label="Layout">
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
              title={tip}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="theme-switch" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={theme === t ? 'active' : ''}
              onClick={() => setTheme(t)}
              title={`Theme: ${t === 'system' ? 'follow the OS' : t}`}
            >
              {t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMeasureGuideOpen(true)}
          title="Meetgids: waar richt je de mic op, hoe ver moet je erbij vandaan, en wat legt een hoeksweep werkelijk vast. De illustraties draaien op dezelfde geometrie als de optimizer."
        >
          📐 Measure
        </button>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          title="Handleiding: doorzoekbare uitleg van elke tab, de optimizer, de scores en de VituixCAD-uitwisseling"
        >
          ❓ Help
        </button>
      </header>

      <div
        ref={workspaceRef}
        className={`workspace${designTab === 'network' ? ' wide-left' : ''}`}
        style={
          paneFrac != null
            ? ({ '--pane-w': `${(paneFrac * 100).toFixed(3)}%` } as CSSProperties)
            : undefined
        }
      >
        <aside className="design-pane">
          <nav className="pane-tabs" aria-label="Design panels">
            {(
              [
                ['import', 'Import', 'Load measurements and projects, see what is imported per driver and attach notes to files'],
                ['data', 'Setup', 'View range, phase convention, tweeter adjustment, vxp variant and the timing sanity check'],
                ['filters', 'Filters', 'Virtual target filters (HP/LP/EQ per driver), the Optimize button and passive synthesis'],
                ['network', 'Network', 'The passive network editor: schematic, component tuning, catalog and BOM'],
              ] as const
            ).map(([id, label, tip]) => (
              <button
                key={id}
                type="button"
                className={designTab === id ? 'active' : ''}
                onClick={() => setDesignTab(id)}
                title={tip}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="pane-body">
            {designTab === 'import' && (
              <>
      <div className="panel">
        <div className="tool-groups">
          <div className="tool-group">
            <span className="tool-group-label">Measurements</span>
            <div className="tool-group-body files">
              <label title="FRD = frequency response (SPL + phase), ZMA = measured impedance. Select the 0° file plus all horizontal angle files and the .ZMA in one go — angles are recognised by filename.">
                {hasMidBranch ? 'Woofer' : 'Woofer / mid'} FRD + ZMA (multi-select all hor angles + impedance)
                <input type="file" accept=".frd,.txt,.zma,.ZMA,.lim" multiple onChange={loadDriverFiles('woofer')} />
              </label>
              <label title="3-way: the MIDDLE branch. FRD = frequency response (SPL + phase), ZMA = measured impedance — select the 0° file plus angle files and the .ZMA in one go. Needs a woofer AND a tweeter loaded to join the sum.">
                Midrange (3-way) FRD + ZMA (multi-select all hor angles + impedance)
                <input type="file" accept=".frd,.txt,.zma,.ZMA,.lim" multiple onChange={loadDriverFiles('mid')} />
                {midDrv && (
                  <span className="derived">
                    {' '}✓ {midDrv.name}{' '}
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
                      title="Remove the midrange branch (back to 2-way)"
                      aria-label="Remove the midrange branch"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </label>
              <label title="FRD = frequency response (SPL + phase), ZMA = measured impedance. Select the 0° file plus all horizontal angle files and the .ZMA in one go — angles are recognised by filename.">
                Tweeter FRD + ZMA (multi-select all hor angles + impedance)
                <input type="file" accept=".frd,.txt,.zma,.ZMA,.lim" multiple onChange={loadDriverFiles('tweeter')} />
              </label>
              <label title="Optional: import a VituixCAD project to simulate Stefan's crossover variants. Select the .vxp together with its .ZMA and response .txt files.">
                VituixCAD project (.vxp + .ZMA + response .txt — select together)
                <input
                  type="file"
                  accept=".vxp,.zma,.ZMA,.txt,.frd"
                  multiple
                  onChange={loadVituixFiles}
                />
              </label>
              <label title="Phase peer-comparison: in VituixCAD export the FILTERED woofer and tweeter responses (crossover applied), select BOTH here. The Phase chart then draws VituixCAD's relative phase (tweeter − woofer) in our convention as a dashed reference.">
                VituixCAD phase reference (filtered woofer + tweeter — select both)
                <input type="file" accept=".frd,.txt" multiple onChange={loadReference} />
                {refResp && <span className="derived"> ✓ {refResp.names}</span>}
              </label>
              <label title="Model vs measurement (the validation loop): measure the BUILT system, load that FRD here, and the SPL chart overlays it against the simulated combined — level-aligned, with the deviation numbers in the SPL strip. Load again to replace.">
                Verification measurement (built system, FRD)
                <input type="file" accept=".frd,.txt" onChange={loadVerification} />
                {verify && (
                  <span className="derived">
                    {' '}✓ {verify.name}{' '}
                    <button
                      type="button"
                      onClick={() => setVerify(null)}
                      title="Remove the verification measurement"
                      aria-label="Remove the verification measurement"
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
                title="Guided model-vs-measurement check: design, drivers, measurement, verdict — step by step"
              >
                🔬 Compare wizard
              </button>
              <button
                type="button"
                onClick={loadDemo}
                title="Load the bundled KOAN measurements (all angles + impedances + vxp variants) — instant playground"
              >
                Load KOAN demo data
              </button>
            </div>
          </div>
          <div className="tool-group">
            <span className="tool-group-label">Project</span>
            <div className="tool-group-body">
              <button
                type="button"
                onClick={saveProject}
                disabled={!woofer && !tweeter}
                title="Download everything (raw measurement files + design state) as one project file"
              >
                Save project
              </button>
              <label className="file-button" title="Restore a previously saved project file">
                Load project
                <input
                  type="file"
                  accept=".json,.adsproj"
                  onChange={loadProjectFromFile}
                  style={{ display: 'none' }}
                />
              </label>
              <button type="button" onClick={resetProject} title="Clear autosave and start fresh">
                Reset
              </button>
            </div>
          </div>
          <div className="tool-group">
            <span className="tool-group-label">Component catalog</span>
            <div className="tool-group-body">
              <label
                className="file-button"
                title="Import a component catalog (brands, series, E-grids, tiers, prices) — the optimizer's Snap to catalog and the BOM use it. A series with a built-in id overrides the built-in."
              >
                Import catalog
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
                title="Download the current catalog as an editable JSON template"
              >
                Export catalog
              </button>
              <button
                type="button"
                onClick={() => setCatalogMgrOpen(true)}
                title="Add, edit or remove exact SKUs (values, DCR/ESR, prices, tiers) without leaving the app — saved to the same catalog the optimizer and BOM use"
              >
                🗂 Manage…
              </button>
              <span className="derived">
                {allSeries().length} series
                {customCatalogParts().length > 0 && ` · ${customCatalogParts().length} exact parts`}
                {allSeries().some((s) => s.basePrice !== undefined) ||
                customCatalogParts().some((p) => p.priceEur !== undefined)
                  ? ' · prices loaded'
                  : ' · no prices yet'}
              </span>
            </div>
          </div>
        </div>
        {persistNote && <p className="filenames">{persistNote} · autosaves locally on every change</p>}
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
            {soloDriver && ' · single-driver mode'}
            {threeWay && ' · 3-way mode'}
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Imported files</h2>
        {(() => {
          interface Row {
            key: string;
            name: string;
            detail: string;
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
            if (loaded) {
              rows.push({
                key: `${slot}:${loaded.name}`,
                name: loaded.name,
                detail: 'FRD — SPL response (0°)',
              });
            }
            for (const a of angleSets?.[slot] ?? []) {
              if (loaded && a.name === loaded.name) continue;
              rows.push({ key: `${slot}:${a.name}`, name: a.name, detail: `FRD — ${a.hor}° hor` });
            }
            const z = zStandalone[zKey];
            if (z) {
              rows.push({ key: `${slot}:${z.file.name}`, name: z.file.name, detail: 'ZMA — impedance' });
            }
            if (rows.length > 0) groups.push({ title, colorVar, rows });
          };
          driverGroup('woofer', woofer, 'low', hasMidBranch ? 'Woofer' : 'Woofer / mid', '--viz-woofer');
          driverGroup('mid', midDrv, 'mid', 'Midrange', '--viz-mid');
          driverGroup('tweeter', tweeter, 'high', 'Tweeter', '--viz-tweeter');
          if (project) {
            const rows: Row[] = [
              {
                key: `vxp:${project.vxpFile.name}`,
                name: project.vxpFile.name,
                detail: `.vxp — ${project.vxp.crossovers.length} crossover variants`,
              },
            ];
            for (const [model, f] of Object.entries(project.impedanceFiles)) {
              rows.push({ key: `vxp:${f.name}`, name: f.name, detail: `ZMA — impedance (${model})` });
            }
            groups.push({ title: 'VituixCAD project', rows });
          }
          if (groups.length === 0) {
            return (
              <p className="sub" style={{ margin: 0 }}>
                Nothing imported yet — load driver files above, or hit "Load KOAN demo data".
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
                  </div>
                  <input
                    className="file-note"
                    placeholder="Add a note… (mic distance, smoothing, gate, which prototype)"
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
                    title="Free note for this file — autosaved and included in the project file"
                  />
                </div>
              ))}
            </div>
          ));
        })()}
      </div>
              </>
            )}

            {designTab === 'data' && !woofer && !tweeter && (
              <p className="sub pane-hint">
                No measurements yet — load them in the Import tab first.
              </p>
            )}
            {designTab === 'data' && (
              <>
      {(woofer || tweeter) && (
        <>
          <div className="panel controls">
            <fieldset>
              <legend>
                View range
                {rangeEditing && <span className="derived"> — simulation paused while editing</span>}
              </legend>
              <label title="Lower edge of the simulation grid AND the optimizer/metrics evaluation band. The sim pauses while you type; commits on Enter/blur. Zooming a chart and clicking 'use as view range' writes back here.">
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
              <label title="Upper edge of the simulation grid AND the optimizer/metrics evaluation band. The sim pauses while you type; commits on Enter/blur.">
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
              <label title="Y-axis floor of the SPL charts — empty = automatic">
                SPL min (dB)
                <input
                  type="number"
                  placeholder="auto"
                  value={splMin}
                  onChange={(e) => setSplMin(e.target.value)}
                />
              </label>
              <label title="Y-axis ceiling of the SPL charts — empty = automatic">
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
                Cabinet &amp; drivers
                <span className="derived">
                  {' '}
                  — what you know, so the app stops guessing
                </span>
              </legend>
              <p className="cabinet-note">
                Everything below is measured from the <strong>reference point</strong>: the spot
                the microphone was aimed at during the sweeps, and — on a turntable — the axis the
                cabinet turned around. Most people aim at the tweeter, so the tweeter sits at{' '}
                <strong>x 0, y 0</strong> and anything lower gets a <strong>negative y</strong>.
                Nothing here changes your measurements; it lets the app work out what those
                measurements actually captured.
              </p>
              <label title="Microphone distance during the FRD sweeps. This is what decides whether the angle files mean what they say: at close range a driver sitting well below the mic is already far off ITS OWN axis at nominal 0°, which exaggerates every off-axis difference and makes a woofer look like it beams far too low.">
                Mic distance (mm)
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={cabinet.micDistanceMm}
                  onChange={(e) => setCabinet((c) => ({ ...c, micDistanceMm: e.target.value }))}
                />
              </label>
              <label title="Fixed VERTICAL angle of the rig, degrees — positive means the microphone sat ABOVE the reference plane, negative below. Leave at 0 for the usual case: mic level with the point it is aimed at. Signed on purpose: on a driver 380 mm below the reference at 500 mm, ten degrees either way swings its true angle between 31° and 43°.">
                Mic elevation (°)
                <input
                  type="number"
                  min={-45}
                  max={45}
                  step={1}
                  placeholder="0"
                  value={cabinet.micElevationDeg}
                  onChange={(e) => setCabinet((c) => ({ ...c, micElevationDeg: e.target.value }))}
                />
              </label>
              {cabinetInfo.farField && (
                <span className={`derived${cabinetInfo.farField.ok ? '' : ' alert'}`}>
                  {cabinetInfo.farField.ok
                    ? `far field ok — ${cabinetInfo.farField.ratio.toFixed(1)}× the source`
                    : `only ${cabinetInfo.farField.ratio.toFixed(1)}× the source (${Math.round(
                        cabinetInfo.farField.sourceMm,
                      )} mm) — treat directivity as indicative`}
                </span>
              )}
              <label title="Baffle width. Reported only, never applied: a properly measured on-baffle response already contains the baffle step, so subtracting it again would count it twice. Useful for reading a response — that broad tilt is the cabinet, not the driver.">
                Baffle W (mm)
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={cabinet.baffleWidthMm}
                  onChange={(e) => setCabinet((c) => ({ ...c, baffleWidthMm: e.target.value }))}
                />
              </label>
              <label title="Baffle height — with the reference offset below it, this gives each driver's distance to the nearest edge, which is what actually shapes diffraction (more than the width does).">
                Baffle H (mm)
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={cabinet.baffleHeightMm}
                  onChange={(e) => setCabinet((c) => ({ ...c, baffleHeightMm: e.target.value }))}
                />
              </label>
              <label title="How far below the TOP of the baffle the measurement reference point sits — the point the mic was aimed at and, on a turntable, the rotation axis. Everything else is measured relative to it.">
                Reference point: mm below the baffle top
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={cabinet.refFromTopMm}
                  onChange={(e) => setCabinet((c) => ({ ...c, refFromTopMm: e.target.value }))}
                />
              </label>
              {cabinetInfo.baffleStep && (
                <span className="derived">
                  baffle step ≈ {Math.round(cabinetInfo.baffleStep)} Hz (already in your measurement)
                </span>
              )}
              <label title="Height of the reference point above the floor, and the listener's ear height and distance. Together they say at what vertical angle you actually sit — which is what turns a driver-spacing rule into a decision: a null at ±25° is harmless if you sit 2° off the axis.">
                Reference point: mm above the floor
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={cabinet.refHeightMm}
                  onChange={(e) => setCabinet((c) => ({ ...c, refHeightMm: e.target.value }))}
                />
              </label>
              <label title="Listening distance, metres.">
                Listen (m)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={cabinet.listenDistanceM}
                  onChange={(e) => setCabinet((c) => ({ ...c, listenDistanceM: e.target.value }))}
                />
              </label>
              <label title="Ear height above the floor, mm.">
                Ear height (mm)
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={cabinet.listenEarHeightMm}
                  onChange={(e) => setCabinet((c) => ({ ...c, listenEarHeightMm: e.target.value }))}
                />
              </label>
              {cabinetInfo.listenAngle !== null && (
                <span className="derived">
                  you sit {Math.abs(cabinetInfo.listenAngle).toFixed(1)}°{' '}
                  {cabinetInfo.listenAngle >= 0 ? 'below' : 'above'} the reference axis
                </span>
              )}
              {(
                [
                  ['low', hasMidBranch ? 'Woofer' : 'Woofer / mid', woofer],
                  ['mid', 'Midrange', midDrv],
                  ['high', 'Tweeter', tweeter],
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
                  const box = cabinetInfo.boxOf(role);
                  const edge = cabinetInfo.edgeOf(role);
                  const dia = cabinetInfo.diaOf(role);
                  return (
                    <div key={role} className="cabinet-driver">
                      <strong>{title}</strong>
                      <span
                        className="inline-num"
                        title="Position of this driver's centre relative to the measurement reference point: x to the right, y UP (so a driver below the reference has a negative y). Centre-to-centre spacing per pair — and with it the vertical-lobing ceiling — is derived from these, so you never type the same fact twice."
                      >
                        {'x '}
                        <input
                          type="number"
                          step={5}
                          placeholder="0"
                          value={d.xMm}
                          onChange={(e) => set({ xMm: e.target.value })}
                        />
                        {' right, y '}
                        <input
                          type="number"
                          step={5}
                          placeholder="0"
                          value={d.yMm}
                          onChange={(e) => set({ yMm: e.target.value })}
                        />
                        {' up (mm from the reference point)'}
                      </span>
                      <label title="Enclosure behind THIS driver. A sealed box is already a 2nd-order acoustic high-pass at its corner, so a 2nd-order electrical filter yields a 4th-order acoustic slope — on a low crossover that is the difference between one ~30 µF capacitor and a pair adding to ~90 µF. A port also means the box can radiate its own midrange through a pipe resonance.">
                        Box
                        <select
                          value={d.enclosure}
                          onChange={(e) => set({ enclosure: e.target.value as Enclosure })}
                        >
                          <option value="unknown">unknown</option>
                          <option value="sealed">sealed</option>
                          <option value="ported">ported</option>
                          <option value="open">open / dipole</option>
                        </select>
                      </label>
                      {d.enclosure !== 'unknown' && d.enclosure !== 'open' && (
                        <label title="Box corner frequency: Fc for a sealed box, Fb for a ported one.">
                          {d.enclosure === 'ported' ? 'Fb (Hz)' : 'Fc (Hz)'}
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={d.fbHz}
                            onChange={(e) => set({ fbHz: e.target.value })}
                          />
                        </label>
                      )}
                      <span
                        className="inline-num"
                        title="Cone area and linear excursion from the datasheet. Sd gives the effective piston diameter (the honest one for every beaming rule — nominal size includes a surround that does not radiate); Sd and Xmax together give the level-aware excursion floor."
                      >
                        {'Sd '}
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={sdCm2[role]}
                          onChange={(e) => setSdCm2((q) => ({ ...q, [role]: e.target.value }))}
                        />
                        {' cm² Xmax '}
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          value={xmaxMm[role]}
                          onChange={(e) => setXmaxMm((q) => ({ ...q, [role]: e.target.value }))}
                        />
                        {' mm'}
                      </span>
                      {cabinetInfo.place[role] &&
                        cabinetInfo.place[role]!.xMm === 0 &&
                        cabinetInfo.place[role]!.yMm === 0 && (
                          <span className="derived">
                            this driver IS the reference point — the mic was aimed here
                          </span>
                        )}
                      {dia && (
                        <span className="derived">effective Ø {Math.round(dia)} mm</span>
                      )}
                      {angles && (
                        <span className="derived">
                          your sweep really covers{' '}
                          {angles
                            .map((a) => `${a.nominal}°→${a.actual!.toFixed(0)}°`)
                            .join(', ')}
                        </span>
                      )}
                      {box.note && <span className="derived">{box.note}</span>}
                      {cabinetInfo.unloadOf(role) === 'high' && (
                        <span className="derived alert">
                          ported: excursion runs away below Fb — worth a steeper electrical
                          high-pass than a sealed box would need
                        </span>
                      )}
                      {edge !== null && (
                        <span className="derived">nearest baffle edge {Math.round(edge)} mm</span>
                      )}
                    </div>
                  );
                })}
            </fieldset>
            <fieldset>
              <legend>Driver phase</legend>
              <label title="Measured = the real measured phase incl. the true inter-driver time offset — the whole point of this tool. Minimum phase = reconstructed from magnitude (offsets discarded), only for apples-to-apples VituixCAD comparison.">
                Convention
                <select
                  value={phaseMode}
                  onChange={(e) => setPhaseMode(e.target.value as 'measured' | 'minimum')}
                >
                  <option value="measured">Measured (real timing)</option>
                  <option value="minimum">Minimum phase (VituixCAD-style)</option>
                </select>
              </label>
              {phaseMode === 'minimum' && (
                <span className="derived">
                  measured inter-driver timing discarded — comparison mode
                </span>
              )}
              {phaseMode === 'measured' && timing?.ref.verdict === 'plausible' && (
                <span className="derived">
                  auto: shared time reference plausible — real timing in use
                </span>
              )}
            </fieldset>
            {/* Inter-driver adjustments — nothing to adjust against in
                single-driver mode, so the whole fieldset hides. */}
            {!soloDriver && (
            <fieldset>
              <legend>Tweeter adjustment</legend>
              <label title="Simulate moving the tweeter physically (mm depth, + = recessed = extra delay). With measured phase and a shared time reference the real timing is already in the data — leave 0.">
                Offset (mm, + = recessed)
                <input
                  type="number"
                  step="0.5"
                  value={offsetMm}
                  onChange={(e) => setOffsetMm(e.target.value)}
                />
              </label>
              <label title="Level adjustment on the tweeter branch, dB">
                Level trim (dB)
                <input
                  type="number"
                  step="0.5"
                  value={trimDb}
                  onChange={(e) => setTrimDb(e.target.value)}
                />
              </label>
              <label
                className="check"
                title="Flip the tweeter 180° (swap + and −) — the classic move around an LR2 crossover"
              >
                <input
                  type="checkbox"
                  checked={inverted}
                  onChange={(e) => setInverted(e.target.checked)}
                />
                Invert polarity
              </label>
              <span className="derived" title="The mm offset expressed as time delay">= {delayUs.toFixed(0)} µs delay</span>
              {phaseMode === 'measured' &&
                timing?.ref.verdict === 'plausible' &&
                num(offsetMm, 0) !== 0 && (
                  <span className="nl-warning">
                    measured phase already carries the real timing — leave 0 unless you are
                    simulating a physical move
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
              <fieldset>
                <legend>Midrange adjustment</legend>
                <label title="Simulate moving the midrange physically (mm depth, + = recessed = extra delay). With measured phase and a shared time reference the real timing is already in the data — leave 0.">
                  Offset (mm, + = recessed)
                  <input
                    type="number"
                    step="0.5"
                    value={midOffsetMm}
                    onChange={(e) => setMidOffsetMm(e.target.value)}
                  />
                </label>
                <label title="Level adjustment on the midrange branch, dB">
                  Level trim (dB)
                  <input
                    type="number"
                    step="0.5"
                    value={midTrimDb}
                    onChange={(e) => setMidTrimDb(e.target.value)}
                  />
                </label>
                <label className="check" title="Flip the midrange 180° (swap + and −)">
                  <input
                    type="checkbox"
                    checked={midInverted}
                    onChange={(e) => setMidInverted(e.target.checked)}
                  />
                  Invert polarity
                </label>
              </fieldset>
            )}
            {project && project.vxp.crossovers.length > 0 && (
              <fieldset>
                <legend>Crossover (VituixCAD project)</legend>
                <label title="Simulate one of the crossover variants from the imported VituixCAD project (solved on the measured impedances). 'None' shows the raw drivers.">
                  Variant
                  <select value={xoName} onChange={(e) => setXoName(e.target.value)}>
                    <option value="none">None (raw drivers)</option>
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
          {sim?.xoError && <p className="error">Crossover error: {sim.xoError}</p>}
        </>
      )}

      {timing && (
        <div className="panel timing">
          <h2>Timing sanity check</h2>
          <div className={`verdict ${verdictClass(timing.ref.verdict)}`}>
            <strong>{verdictHeading(timing.ref.verdict)}</strong>
            <div style={{ marginTop: '0.4rem' }}>{timing.ref.message}</div>
          </div>
          <div className="stats">
            <Stat
              k="Woofer delay"
              v={`${timing.w.delayMs.toFixed(3)} ms`}
              sub={`R² ${timing.w.rSquared.toFixed(3)}`}
            />
            <Stat
              k="Tweeter delay"
              v={`${timing.t.delayMs.toFixed(3)} ms`}
              sub={`R² ${timing.t.rSquared.toFixed(3)}`}
            />
            <Stat
              k="Apparent mic distance"
              v={`${(timing.ref.apparentDistanceM.woofer * 100).toFixed(1)} / ${(
                timing.ref.apparentDistanceM.tweeter * 100
              ).toFixed(1)} cm`}
              sub="woofer / tweeter — incl. common latency"
            />
            <Stat
              k="Acoustic-centre Δ"
              v={`${timing.ref.deltaUs.toFixed(0)} µs ≈ ${timing.ref.deltaMm.toFixed(1)} mm`}
              sub="tweeter later = positive"
            />
          </div>
          {timing.ref.verdict === 'plausible' && (
            <p className="sub" style={{ margin: '0.75rem 0 0' }}>
              {excessBridge ? (
                <>
                  VituixCAD equivalent (Minimum phase ON): give the{' '}
                  <strong>{excessBridge.deltaUs >= 0 ? 'tweeter' : 'woofer/mid'}</strong> a Delay
                  of <strong>{Math.abs(excessBridge.deltaUs).toFixed(0)} µs</strong>, the other
                  driver 0 — this is the EXCESS-phase Δ (measured − minimum phase), the value a
                  minimum-phase reconstruction needs. NB: it can differ from the raw Δ above in
                  size AND sign (the raw fit absorbs each driver&apos;s minimum-phase slope).
                  The .vxp export fills this in automatically.
                </>
              ) : (
                <>VituixCAD equivalent: use the .vxp export — it derives the bridge delays.</>
              )}{' '}
              Only the DIFFERENCE matters — never enter the shared ~
              {(Math.min(timing.w.delayMs, timing.t.delayMs) * 1000).toFixed(0)} µs bulk delay.
            </p>
          )}
        </div>
      )}
              </>
            )}

            {designTab === 'filters' && !result && (
              <p className="sub pane-hint">
                Nothing to design yet — load measurements in the Import tab first.
              </p>
            )}
            {designTab === 'filters' && result && (
        <>
          <div className="panel">
            <h2>Virtual filters (target design)</h2>
            <div className="tool-groups" style={{ marginBottom: '1rem' }}>
              <div className="tool-group">
                <span className="tool-group-label">Design</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={runVfOptimize}
                    disabled={vfBusy}
                    title={
                      threeWay
                        ? '3-way: staged 2D scan — LR4 targets + measured level trims per (low, high) handover candidate, per-branch synthesis, assembled two-pair tune; the amp-load verdict gates the ranking. Winner lands in the Working tab.'
                        : soloDriver
                          ? 'Single-driver mode: flatten this driver — cut-only EQ/shelf design, built as series traps / shelf groups (+ gated Zobel) and component-tuned against the measurement (lands in the Working tab)'
                          : 'Design the crossover, build it as a passive network and simulate it — all in one go (lands in the Working tab)'
                    }
                  >
                    {vfBusy ? 'Optimizing + building…' : soloDriver ? 'Optimize — flatten driver' : 'Optimize — design for me'}
                  </button>
                  <select
                    value={synthMode}
                    onChange={(e) => setSynthMode(e.target.value as 'filter' | 'acoustic')}
                    title="What the passive build optimises for: the acoustic result on the measured driver, or an exact reproduction of the filter curve"
                  >
                    <option value="acoustic">Acoustic result (flatten measured driver)</option>
                    <option value="filter">Filter curve (reproduce target exactly)</option>
                  </select>
                </div>
              </div>
              <div className="tool-group">
                <span className="tool-group-label">Configure</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    className={showOptSettings ? 'active-toggle' : ''}
                    onClick={() => setShowOptSettings((s) => !s)}
                    title="Optimizer settings: priority, amplitude target, in-room weight, EQ bands"
                  >
                    ⚙ Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Start at the import gate (step 0) when there is no driver
                      // data yet — the wizard should take you from nothing to a
                      // built crossover, not assume measurements exist. One
                      // loaded driver is enough (single-driver mode).
                      setWizardStep(!woofer && !tweeter ? 0 : 1);
                      setWizardOpen(true);
                    }}
                    title="Design wizard: load measurements, then goals, priority, crossover point, acoustic slopes and component choices in one guided flow — ends with Optimize"
                  >
                    🧙 Wizard
                  </button>
                </div>
              </div>
              <div className="tool-group">
                <span className="tool-group-label">State</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={resetVirtualFilters}
                    disabled={vfBusy}
                    title="Filters back to the clean starting point — measurements and crossover selection stay"
                  >
                    Reset filters
                  </button>
                  <label title="Take the virtual filters out of the simulation, keeping their settings — auto-on when a built passive network replaces them">
                    <input
                      type="checkbox"
                      checked={vfBypass}
                      onChange={(e) => setVfBypass(e.target.checked)}
                    />{' '}
                    Bypass
                  </label>
                </div>
              </div>
            </div>
            {vfBusy && vfProgress && (
              <p className="derived" style={{ margin: '0 0 1rem' }}>
                {vfProgress.items
                  ? `scan ${vfProgress.round}/${vfProgress.items.length}`
                  : (vfProgress.label ?? `round ${vfProgress.round}`)}{' '}
                · {vfProgress.evals.toLocaleString('nl-NL')} network sims ·{' '}
                {vfProgress.rippleDb !== undefined && vfProgress.phaseDeg !== undefined
                  ? `${vfProgress.rippleDb.toFixed(2)} dB / ${vfProgress.phaseDeg.toFixed(1)}°`
                  : '…'}
              </p>
            )}
            {vfBypass && (
              <p className="derived" style={{ margin: '0 0 1rem' }}>
                virtual filters muted — passive network / raw drivers only
              </p>
            )}
            {showOptSettings && (
              <div className="row opt-settings" style={{ marginBottom: '1rem' }}>
                <span className="opt-settings-cap">Optimizer settings</span>
                {soloDriver && (
                  <>
                    <span className="derived" style={{ flexBasis: '100%' }}>
                      Single-driver mode — crossover settings (priority, phase, slopes, crossover
                      point, HP/LP) don't apply and are disabled; the solo engine designs cut-only
                      EQ/shelves within the EQ-band budget and the targets' ripple.
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
                      title="How much LEVEL the correction may give up. Passive filters can only cut, so flatness is paid for in efficiency — this is the budget for that payment. 6 dB ≈ a baffle-step's worth, right for a driver that will still get a crossover. A fullranger carrying the whole range is usually worth 10–20 dB: the further it may drop, the further up the band it can pull things flat."
                    >
                      May drop by
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
                        title="What that budget means in absolute terms: the driver's own median level over the evaluation band, and the level the correction may sink to."
                      >
                        → down to {(soloFloorInfo.median - num(soloSensDb, 6)).toFixed(0)} dB
                        (driver sits at {soloFloorInfo.median.toFixed(0)})
                      </span>
                    )}
                    <label
                      className="check"
                      title="Instead of 'may drop by N dB', name the level itself: the engine flattens everything down TO that level. Better-posed (a fixed target cannot be met by moving the average) and it tells you directly how far up the band the correction can reach."
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
                      or flatten to a fixed level
                    </label>
                    {soloFloorOn && (
                      <>
                        <label
                          className="inline-num"
                          title="Flatten down TO this level (dB, in your own measurement's scale — check the SPL chart). A lower target reaches further up the band but costs efficiency. Anything already below this level cannot be lifted and stays out of scope."
                        >
                          Flat at
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
                            title="The driver's own median level over the evaluation band, and how far a cut-only correction can reach at the target level you entered."
                          >
                            driver sits at {soloFloorInfo.median.toFixed(0)} dB · reaches{' '}
                            {hz(soloFloorInfo.reach[0])}–{hz(soloFloorInfo.reach[1])}
                          </span>
                        )}
                      </>
                    )}
                  </>
                )}
                <label title={soloDriver ? 'Single-driver mode: relative phase does not exist — the solo objective is response flatness only' : "The big trade-off: budget split between a flat response and flat phase. More phase = flatter phase but more amplitude ripple. Both ends are anchored (100% phase = 90/10 internally): with the response weight at true zero the optimizer would trade a wrecked response for a phase metric it can then game."}>
                  Priority: response {100 - phasePriority}% · phase {phasePriority}%
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
                <label title="How phase error is judged. Integration band = the panel's average + excursions over the WHOLE overlap window (flat across the handover, matches the numbers you read — Sanders keuze). Classic = overlap-weighted mean, centre-heavy (the old behaviour, kept as fallback).">
                  Phase metric
                  <select
                    value={phaseMetricMode}
                    onChange={(e) => setPhaseMetricMode(e.target.value as 'band' | 'overlap')}
                    disabled={!!soloDriver}
                  >
                    <option value="band">Integration band (avg + P95)</option>
                    <option value="overlap">Classic (overlap-weighted)</option>
                  </select>
                </label>
                <label>
                  Amplitude target
                  <select
                    value={ampTarget}
                    onChange={(e) => setAmpTarget(e.target.value as 'onAxis' | 'listeningWindow')}
                    disabled={!angleSets || !!soloDriver}
                    title={soloDriver ? 'Single-driver mode: directivity terms pair both drivers — on-axis only for now' : angleSets ? '' : 'Load angle measurements to enable'}
                  >
                    <option value="onAxis">On-axis (0°)</option>
                    <option value="listeningWindow">Listening window (0–30°)</option>
                  </select>
                </label>
                <label title={soloDriver ? 'Single-driver mode: directivity terms pair both drivers — disabled for now' : angleSets ? '' : 'Load angle measurements to enable'}>
                  In-room weight: {dirWeight}% (energy average)
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
                  title="Hard cap on EQ bands per driver the optimizer may spend — more bands = finer correction but a bigger search (and more passive components later)"
                >
                  EQ bands/driver for optimizer
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
                  <label title="Preferred alignment for the LOW (woofer-mid) handover — binding: the designer picks the foundation, the optimizer keeps knees, level and polarity free. Auto = free choice from the library.">
                    HP/LP preference (low xo)
                    <select value={hpLpPrefLow} onChange={(e) => setHpLpPrefLow(e.target.value)}>
                      <option value="auto">Auto (library)</option>
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
                <label title="Preferred HP/LP alignment — binding: the designer picks the foundation, the optimizer designs the best crossover on it (knees, level, polarity and EQ stay free). Auto = free choice from the library.">
                  {threeWay ? 'HP/LP preference (high xo)' : 'HP/LP preference'}
                  <select value={hpLpPref} onChange={(e) => setHpLpPref(e.target.value)} disabled={!!soloDriver}>
                    <option value="auto">Auto (library)</option>
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
                <label title="Target ACOUSTIC slope of the mid above the crossing — the measured rolloff (driver + filter), not the electrical order. Falling short costs more than being steeper. Auto = free.">
                  {threeWay ? 'Acoustic slope mid LP (high xo)' : 'Acoustic slope mid'}
                  <select value={acSlopeMid} onChange={(e) => setAcSlopeMid(e.target.value)} disabled={!!soloDriver}>
                    <option value="auto">Auto</option>
                    {['12', '18', '24', '30', '36'].map((v) => (
                      <option key={v} value={v}>
                        {v} dB/oct
                      </option>
                    ))}
                  </select>
                </label>
                <label title="Target ACOUSTIC slope of the tweeter below the crossing — the classic 'acoustic 4th order at the tweeter' rule is 24 dB/oct. Check the result in 🎯 Targets. Auto = free.">
                  Acoustic slope tweeter
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
                    <label title="3-way: target ACOUSTIC slope of the WOOFER above the low crossing (its LP flank). Auto = free.">
                      Acoustic slope woofer (low xo)
                      <select value={acSlopeWoofer} onChange={(e) => setAcSlopeWoofer(e.target.value)}>
                        <option value="auto">Auto</option>
                        {['12', '18', '24', '30', '36'].map((v) => (
                          <option key={v} value={v}>
                            {v} dB/oct
                          </option>
                        ))}
                      </select>
                    </label>
                    <label title="3-way: target ACOUSTIC slope of the MID below the low crossing (its HP flank) — the mid's second flank.">
                      Acoustic slope mid HP (low xo)
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
                <label title="Staged design (trapmethode): HP/LP structure first; EQ bands, Zobel/LCR networks and bypass caps are only added while the targets below are unmet — the fewest components that reach the goal, with a per-stage report.">
                  <input
                    type="checkbox"
                    checked={stagedOn}
                    onChange={(e) => setStagedOn(e.target.checked)}
                  />{' '}
                  Staged (fewest components)
                </label>
                {stagedOn && (
                  <span className="inline-num" title="'Good enough' targets: stop escalating once ripple (peak ±dB, the same number the SPL strip shows) AND average phase error (°) are both met — variable per project, this is the designer's call">
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
                <label title="Stopband leakage beside the crossover must stay ≥20 dB below the combined — cone-breakup phase cannot be filtered away, it can only be made irrelevant in level">
                  <input
                    type="checkbox"
                    checked={breakupGuard}
                    onChange={(e) => setBreakupGuard(e.target.checked)}
                    disabled={!!soloDriver}
                  />{' '}
                  Breakup guard (≥20 dB)
                </label>
                <label
                  style={{ opacity: hasImportedCatalog() ? 1 : 0.5 }}
                  title={
                    hasImportedCatalog()
                      ? 'Snap the passive build to purchasable catalog values, simulated with their real DCR/ESR — the fit error against real parts becomes visible instead of assumed away'
                      : 'Import a catalog first — without one there are no real parts to snap to, so the design keeps theoretically ideal (continuous) values'
                  }
                >
                  <input
                    type="checkbox"
                    checked={catalogSnap && hasImportedCatalog()}
                    disabled={!hasImportedCatalog()}
                    onChange={(e) => setCatalogSnap(e.target.checked)}
                  />{' '}
                  Snap to catalog{!hasImportedCatalog() && ' (needs import)'}
                </label>
                <label title="Pin the ACOUSTIC crossover: the frequency where the filtered drivers actually cross must land within frequency ± margin — in the design optimizer AND the component tuner. Margin 0 = exactly there (±2% search room remains).">
                  <input
                    type="checkbox"
                    checked={xoRangeOn}
                    onChange={(e) => setXoRangeOn(e.target.checked)}
                    disabled={!!soloDriver}
                  />{' '}
                  {threeWay ? 'Crossover points (low + high)' : 'Crossover point'}
                </label>
                {tweeterHpFloor !== null && (
                  <span
                    className="derived"
                    title="Hard floor for the tweeter's electrical HP knee: the classic ≥2×Fs rule, read from the measured impedance peak. Knee-domain — coexists with the crossover point."
                  >
                    HP floor {tweeterHpFloor} Hz (2×Fs)
                  </span>
                )}
                {threeWay && (
                  <label title="How many handover candidates the 3-way scan simulates PER crossing. Each candidate runs the full design chain inside its own slice of the search range, so the count is squared: 2 steps = 4 chains. Works pinned or unpinned — without a pin the range is the neighbourhood of the raw crossings.">
                    Scan steps per crossing
                    <select value={xo3Steps} onChange={(e) => setXo3Steps(Number(e.target.value))}>
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n} ({n * n} sim{n * n > 1 ? 's' : ''})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {threeWay && (
                  <label title="Woofer nominal size — sets the W-M handover's beaming CEILING (a cone is practically usable to ~3× its beaming onset), the mirror of the mid-size rule for the high crossing. With the 2×Fs floor from the measured mid impedance this gives the free scan a physics window instead of a guess.">
                    Woofer size (W-M ceiling)
                    <select value={wooferSizeInch} onChange={(e) => setWooferSizeInch(e.target.value)}>
                      <option value="">unknown</option>
                      {['5', '6.5', '8', '10', '12', '15'].map((v) => (
                        <option key={v} value={v}>
                          {v}"
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {threeWay && (
                  <label title="Directivity philosophy for the MEASURED beaming ceiling — the on-axis minus 30° difference at which a driver counts as beaming. Default is the empirical 4 dB, NOT the theoretically stricter ka = 2, and that is deliberate: the ka figures come from an ideal piston in an infinite baffle, while a real measured 0−30° difference at low frequency is mostly baffle diffraction. Measured on a real 3-way set, ka = 2 puts the woofer&apos;s ceiling at 304 Hz — below the mid&apos;s own 2×Fs floor — declaring an ordinary design impossible; 4 dB gives 628 Hz. The strict tiers stay available for a conservative philosophy or clean anechoic data. (For reference: &apos;−6 dB at 30°&apos; is ka = 4.43, past every published limit — that defines BEAMWIDTH, not a crossover ceiling.)">
                    Beaming limit
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
                    title="How many wavelengths of DRIVER SPACING the design tolerates. The spacing itself is derived from the driver positions you enter under Setup → Cabinet & drivers; two drivers half a wavelength apart already put a null in the vertical response. The sources genuinely disagree here and they optimise different things, so this is the designer's call."
                  >
                    {'Lobing k '}
                    <select value={ctcK} onChange={(e) => setCtcK(e.target.value)}>
                      <option value="0.25">0.25 — point source</option>
                      <option value="0.5">0.5 — no forward null</option>
                      <option value="1">1.0 — Dickason</option>
                      <option value="1.2">1.2 — Saunisto (power response)</option>
                    </select>
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
                      <span className="derived"> — enter driver positions to apply</span>
                    )}
                  </span>
                )}
                {threeWay && (
                  <label title="Cone breakup as an upper limit. A resonance at f_b is excited as the THIRD harmonic of a fundamental at f_b/3 (Purifi measured exactly this: breakups at 5 and 10 kHz produce HD3 peaks at 1.6 and 3.3 kHz), so the distortion penalty lands more than an octave BELOW the peak. A notch does not repair it — it attenuates the fundamental at the breakup, not the harmonics arriving there from lower fundamentals. NOTE: no published algorithm exists for finding breakup in an SPL curve; this is our own criterion, which is why it is switchable and the detected frequency is shown.">
                    Breakup ceiling
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
                      <option value="off">off</option>
                      <option value="3">f_b / 3 (HD3)</option>
                      <option value="5">f_b / 5 (HD5, hard cones)</option>
                    </select>
                  </label>
                )}
                {threeWay && (
                  <span
                    className="inline-num"
                    title="Excursion floor — the LEVEL-aware version of 'cross a tweeter at 2-3x Fs'. SPL = 108.4 + 20log(f²·Sd·Xmax) in half space, so a driver runs out of linear travel below f = sqrt(10^((L-108.4)/20)/(Sd·Xmax)). Both numbers come straight off the datasheet; without them the criterion simply does not apply. The level matters: a 1 inch dome is fine to 587 Hz at 90 dB and only to 829 Hz at 96 dB."
                  >
                    {'Sd/Xmax mid '}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={sdCm2.mid}
                      onChange={(e) => setSdCm2((p) => ({ ...p, mid: e.target.value }))}
                    />
                    {' cm² / '}
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={xmaxMm.mid}
                      onChange={(e) => setXmaxMm((p) => ({ ...p, mid: e.target.value }))}
                    />
                    {' mm · tweeter '}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={sdCm2.high}
                      onChange={(e) => setSdCm2((p) => ({ ...p, high: e.target.value }))}
                    />
                    {' cm² / '}
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={xmaxMm.high}
                      onChange={(e) => setXmaxMm((p) => ({ ...p, high: e.target.value }))}
                    />
                    {' mm @ '}
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
                {threeWay && physWin3 && (
                  <span
                    className="derived"
                    title="The free scan derives both handover windows from the measurements themselves: floor = 2×Fs (measured impedance) and where the upper driver reaches its own level; ceiling = the lower driver's MEASURED beaming onset from the angle files (size-formula fallback without them). A pin is the designer's explicit override of its axis — the scan then searches the pin, not this window, and warns loudly when the physics cannot deliver it."
                  >
                    {xoRangeOn ? (
                      <>W-M pinned · </>
                    ) : (
                      <>
                        W-M {Math.round(physWin3.low.floorHz ?? 250)}–
                        {Math.round(physWin3.low.ceilHz ?? 1200)} Hz
                        {bindingCeil(physWin3.limits.low, physWin3.lowCeilMeasured)}
                        {' · '}
                      </>
                    )}
                    {physWin3.low.ceilHz !== null &&
                      physWin3.low.floorHz !== null &&
                      physWin3.low.ceilHz <= physWin3.low.floorHz && (
                        <strong> ⚠ no room</strong>
                      )}
                    {xoRangeOn ? (
                      <>M-T pinned — pins override the derived windows</>
                    ) : (
                      <>
                        M-T {Math.round(physWin3.high.floorHz ?? 1200)}–
                        {Math.round(physWin3.high.ceilHz ?? 7000)} Hz
                        {bindingCeil(physWin3.limits.high, physWin3.highCeilMeasured)}
                        {physWin3.high.ceilHz !== null &&
                          physWin3.high.floorHz !== null &&
                          physWin3.high.ceilHz <= physWin3.high.floorHz && (
                            <strong> ⚠ no room</strong>
                          )}
                      </>
                    )}
                  </span>
                )}
                {xoRangeOn && threeWay && (
                  <span
                    className="inline-num"
                    title="3-way: the LOW handover (woofer→mid) — the acoustic crossing must land within frequency ± margin, in the design chain AND the component tuner."
                  >
                    {'low '}
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
                    title="The ACOUSTIC handover — where the filtered drivers actually cross — must land within frequency ± margin. The electrical knees stay free (with a hot tweeter they sit far above the acoustic crossing)."
                  >
                    {threeWay ? 'high ' : ''}
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
                          title="How many crossover candidates the scan simulates across the pinned range (evenly spaced, your pin always included). Every candidate runs the FULL design chain, so compute grows about linearly — the worker pool runs several at once, but 9 steps still takes a multiple of 3. More steps = a finer sweep of the handover region."
                        >
                          {[3, 5, 7, 9].map((n) => (
                            <option key={n} value={n}>
                              {n} steps
                            </option>
                          ))}
                        </select>
                        {xoScanSteps > 3 && (
                          <span className="derived"> ⏱ ~{Math.ceil(xoScanSteps / 3)}× runtime</span>
                        )}
                      </>
                    )}
                  </span>
                )}
                {vfEqBands > 4 && (
                  <span className="derived">
                    {vfEqBands} bands = {3 + 6 * vfEqBands} search dimensions — slower, may need a
                    second run
                  </span>
                )}
              </div>
            )}
            {vfError && <p className="error">{vfError}</p>}
            {vfOpt && (
              <p className="vf-opt-summary">
                Optimizer chose: LP {vfOpt.structure.wooferLpKind}
                {vfOpt.structure.wooferLpOrder} ({vfOpt.structure.wooferLpOrder * 6} dB/oct) @{' '}
                {Math.round(vfOpt.specs.woofer.lp.freq)} Hz · HP {vfOpt.structure.tweeterHpKind}
                {vfOpt.structure.tweeterHpOrder} ({vfOpt.structure.tweeterHpOrder * 6} dB/oct) @{' '}
                {Math.round(vfOpt.specs.tweeter.hp.freq)} Hz · tweeter{' '}
                {vfOpt.specs.tweeter.gainDb.toFixed(1)} dB · polarity{' '}
                {vfOpt.inverted ? 'inverted' : 'normal'} · EQ used:{' '}
                {vfOpt.bandsUsed.woofer}+{vfOpt.bandsUsed.tweeter} — ripple{' '}
                {vfOpt.before.responseStdDb.toFixed(2)} →{' '}
                <strong>{vfOpt.after.responseStdDb.toFixed(2)} dB</strong> · phase error{' '}
                {vfOpt.before.avgPhaseErrDeg.toFixed(0)}° →{' '}
                <strong>{vfOpt.after.avgPhaseErrDeg.toFixed(1)}°</strong> · score{' '}
                {vfOpt.before.integrationScore?.toFixed(0)} →{' '}
                <strong>{vfOpt.after.integrationScore?.toFixed(0)}</strong>
                {vfOpt.after.powerStdDb !== null && vfOpt.before.powerStdDb !== null && (
                  <>
                    {' '}· power ripple {vfOpt.before.powerStdDb.toFixed(2)} →{' '}
                    <strong>{vfOpt.after.powerStdDb.toFixed(2)} dB</strong>
                  </>
                )}
                {vfRunStats && (
                  <>
                    {' '}· {vfRunStats.rounds} rounds ·{' '}
                    {vfRunStats.evals.toLocaleString('nl-NL')} sims
                  </>
                )}
              </p>
            )}
            {vfOpt && vfOpt.stages.length > 0 && (
              <p
                className="vf-opt-summary sub"
                title="What each escalation stage of the staged design bought (ripple / phase after that stage)"
              >
                Stages:{' '}
                {vfOpt.stages
                  .map((s) => `${s.label} → ${s.rippleDb.toFixed(2)} dB / ${s.phaseDeg.toFixed(1)}°`)
                  .join('  ·  ')}
              </p>
            )}
            <div className={`vf-panel${vfCollapsed ? '' : ' open'}`}>
              <button
                type="button"
                className="vf-collapse-head"
                aria-expanded={!vfCollapsed}
                onClick={() => setVfCollapsed((c) => !c)}
                title={
                  vfCollapsed
                    ? 'Show the per-driver filter bands (HP/LP/EQ)'
                    : 'Hide the per-driver filter bands'
                }
              >
                <span className="vf-collapse-caret">{vfCollapsed ? '▸' : '▾'}</span>
                <span>Filter bands</span>
                {vfCollapsed && (
                  <span className="derived vf-collapse-summary">
                    {vfBypass ? 'muted · ' : ''}
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
                  Build mode is “Acoustic result”: EQ values here are seeds — a passive build
                  re-tunes each enabled band's freq/gain/Q to flatten the measured driver.
                  Switch to “Filter curve” to build exactly what you draw.
                </p>
              )}
              {!vfCollapsed && (
                <div className="vf-grid">
                  {/* Solo: only the loaded driver's block — the other slot
                      would edit a silent ghost. */}
                  {soloDriver !== 'tweeter' && (
                    <DriverFilterControls
                      title={threeWay ? 'Woofer' : 'Woofer / mid'}
                      accentVar="--viz-woofer"
                      spec={vFilters.woofer}
                      onChange={(woofer) => setVFilters((p) => ({ ...p, woofer }))}
                    />
                  )}
                  {threeWay && (
                    <DriverFilterControls
                      title="Midrange"
                      accentVar="--viz-mid"
                      spec={vFilters.mid}
                      onChange={(mid) => setVFilters((p) => ({ ...p, mid }))}
                    />
                  )}
                  {soloDriver !== 'woofer' && (
                    <DriverFilterControls
                      title="Tweeter"
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
            <div className="panel">
              <h2>Passive synthesis</h2>
              <p className="sub" style={{ marginBottom: '0.8rem' }}>
                {synthMode === 'filter'
                  ? 'Builds YOUR drawn curve: the HP/LP knees and EQ bands above are the target, reproduced with real components on the measured impedances.'
                  : 'Re-designs while building: real components are fitted so the MEASURED driver comes out flat against the ideal HP/LP shape. Enabled EQ bands only grant correction slots (their freq/gain/Q are re-tuned) — the result deliberately differs from the virtual sim above.'}
              </p>
              <div className="row" style={{ marginBottom: '0.9rem' }}>
                <select
                  value={synthMode}
                  onChange={(e) => setSynthMode(e.target.value as 'filter' | 'acoustic')}
                  title="What this build optimises for — same setting as the dropdown next to Optimize"
                >
                  <option value="acoustic">Acoustic result (flatten measured driver)</option>
                  <option value="filter">Filter curve (reproduce target exactly)</option>
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
                      ? "3-way: fits three branches on the measured impedances — woofer LP, mid BANDPASS (hp+lp), tweeter HP — and lands them as one network in a new 'Passive build' tab. Per-branch fits only: the assembled component tune (pairs) is a later step."
                      : soloDriver
                        ? "Single-driver mode: build the solo topology from the enabled cut bands (series traps / shelf groups + gated Zobel) with textbook seed values — lands in a new 'Solo build' tab; ⚙ Optimize components fits the values"
                        : "Fit real components and simulate the result — lands in a new 'Passive build' tab on the Network page. Follow up with ⚙ Optimize components there to tune the assembled sum (phase!)."
                  }
                >
                  Build passive filter
                </button>
                <span className="derived">
                  uses the priority setting from ⚙ Settings
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
                              ? 'Woofer'
                              : 'Woofer / mid'
                            : slot === 'mid'
                              ? 'Midrange (bandpass)'
                              : 'Tweeter'}{' '}
                          branch
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
                          fit: {r.rmsDb.toFixed(2)} dB / {r.rmsDeg.toFixed(1)}° RMS
                          {r.converged ? '' : ' (not converged — treat as rough)'}
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
                No network to edit yet — load measurements in the Import tab first.
              </p>
            )}
            {designTab === 'network' && result && (
        <>
          <div className="panel">
            <h2>Network editor (passive)</h2>
            <p className="sub" style={{ marginBottom: '0.8rem' }}>
              Drag parts, draw wires, edit values — the schematic IS the network: parts connect
              where their points touch, and every change re-solves live on the measured
              impedances. Inductors carry DCR, capacitors ESR. Drivers are a list (N-way ready);
              the summed result uses the mid/tweeter slots for now.
            </p>
            <div className="tool-groups" style={{ marginBottom: '0.8rem' }}>
              <div className="tool-group">
                <span className="tool-group-label">Start</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={importNetworkFromVariant}
                    disabled={!project || xoName === 'none'}
                    title={project ? 'Open the selected crossover variant in a new tab' : 'Load a vxp project first'}
                  >
                    Import variant {xoName !== 'none' ? `(${xoName})` : ''}
                  </button>
                  <label className="file-button" title="Open an exported .adsfilter.json in a new tab">
                    Import filter
                    <input
                      type="file"
                      accept=".json,.adsfilter"
                      onChange={importFilterFromFile}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <span
                    className="template-picker"
                    title="Start a fresh network in a new tab from a generic template — plausible starting values you tune from, the counterpart to Import and the optimizer"
                  >
                    <select
                      value={threeWay ? 3 : templateWays}
                      onChange={(e) => setTemplateWays(Number(e.target.value) as WayCount)}
                      disabled={threeWay}
                      title={
                        threeWay
                          ? '3-way mode: the template follows the loaded branch set (a 2-way template would silently skip the mid)'
                          : 'Number of ways — 3-way templates need all three branches loaded'
                      }
                    >
                      <option value={2}>2-way</option>
                      <option value={3} disabled={!threeWay}>
                        {threeWay ? '3-way' : '3-way (load three drivers)'}
                      </option>
                    </select>
                    <select
                      value={soloDriver ? 0 : templateOrder}
                      onChange={(e) => setTemplateOrder(Number(e.target.value) as FilterOrder)}
                      disabled={!supportsWayCount(templateWays) || !!soloDriver}
                      title={
                        soloDriver
                          ? 'Single-driver mode — only the blank scaffold applies (LP/HP templates need two branches)'
                          : threeWay
                            ? 'Filter order / slope per branch (mid = bandpass, twice the parts) — generic Butterworth-style seed values at 600 / 3000 Hz'
                            : 'Filter order / slope for both branches — generic Butterworth-style seed values'
                      }
                    >
                      {TEMPLATE_ORDERS.map((t) => (
                        <option key={t.order} value={t.order}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={startNetworkFromTemplate}
                      disabled={!supportsWayCount(templateWays)}
                    >
                      New from template
                    </button>
                  </span>
                </div>
              </div>
              <div className="tool-group">
                <span className="tool-group-label">Export</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={exportActiveFilter}
                    disabled={!activeDesign}
                    title="Download the active tab as a standalone .adsfilter.json — share it or bring it into another project"
                  >
                    Export filter
                  </button>
                  <button
                    type="button"
                    onClick={exportActiveVxp}
                    disabled={designs.length === 0 || threeWay}
                    title="Export ALL network tabs as a VituixCAD project folder — the .vxp (each tab a crossover variant CROSSOVER, CROSSOVER1, …) PLUS every measurement/impedance file, written together so VituixCAD opens it without hunting. Pick a folder when asked (Chrome/Edge). VituixCAD reconstructs the phase itself (MinimumPhase=True) and the tweeter carries the measured inter-driver Δ as a Delay, so its simulation matches ours."
                  >
                    Export .vxp
                  </button>
                </div>
              </div>
              <div className="tool-group">
                <span className="tool-group-label">Catalog</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={exportCatalog}
                    title="Download the component catalog as an editable JSON template — add your own brands/series and import it back"
                  >
                    Export
                  </button>
                  <label
                    className="file-button"
                    title="Import a component-catalog JSON: your series appear in the inspector next to the built-in ones (persisted across sessions)"
                  >
                    Import
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
                    title="Add, edit or remove exact SKUs (values, DCR/ESR, prices, tiers) without leaving the app"
                  >
                    🗂 Manage…
                  </button>
                </div>
              </div>
              <div className="tool-group">
                <span className="tool-group-label">Tools</span>
                <div className="tool-group-body">
                  <button
                    type="button"
                    onClick={runNetOptimize}
                    disabled={!activeDesign || netOptBusy || !sim || zModels.length === 0}
                    title={
                      threeWay
                        ? '3-way: re-fit the UNLOCKED component values against the measured three-branch sum — both adjacent crossings are guarded (valley, protection, dead-branch), phase is judged per pair'
                        : soloDriver
                          ? 'Single-driver mode: re-fit the UNLOCKED component values against the measured driver — objective is branch flatness (+ amp-load floor); crossover terms do not apply'
                          : 'Re-fit the UNLOCKED component values of the active tab against the measured response — 🔒 parts keep their value'
                    }
                  >
                    {netOptBusy ? 'Tuning…' : '⚙ Optimize components'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTrapModel(zModels[0] ?? 'mid');
                      setTrapOpen(true);
                    }}
                    disabled={!activeDesign || zModels.length === 0}
                    title="Add an LCR notch (series trap across a driver) to tame a peak — enter frequency, depth and Q; values follow from the measured impedance and the result shows live"
                  >
                    ➕ Add notch
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeDesign) return;
                      const tidied = tidySchematic(activeDesign.parts);
                      if (!tidied) {
                        setNetOptNote(
                          'Layout not tidied: topology too exotic for the auto-placer (bridge, shared series section, or open/shorted parts).',
                        );
                        return;
                      }
                      commitSchematic(tidied); // undo-able
                      setNetOptNote('Layout tidied — same netlist, fresh placement (Undo to revert).');
                    }}
                    disabled={!activeDesign}
                    title="Redraw this schematic from its netlist: series path as a bus, chains hanging down, branches stacked with air — electrically identical, undo-able. Fixes cramped layouts from older exports."
                  >
                    Tidy layout
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTargets(true)}
                    title="What was this network built FOR? The virtual target design (HP/LP kind, order, knees, EQ bands) plus the MEASURED acoustic slopes beside the crossing — electrical component count never equals acoustic order."
                  >
                    🎯 Targets
                  </button>
                </div>
              </div>
              <div className="tool-group">
                <span className="tool-group-label">Simulation</span>
                <div className="tool-group-body">
                  <label title="Feed the active tab's network into the simulation instead of the selected vxp variant — every edit re-solves live">
                    <input
                      type="checkbox"
                      checked={networkActive}
                      disabled={!schematic}
                      onChange={(e) => setNetworkActive(e.target.checked)}
                    />{' '}
                    Use in simulation
                  </label>
                  {designs.length > 1 && (
                    <label title="Show the other tabs' summed responses as dashed ghost curves in the SPL chart">
                      <input
                        type="checkbox"
                        checked={compareTabs}
                        onChange={(e) => setCompareTabs(e.target.checked)}
                      />{' '}
                      Compare tabs
                    </label>
                  )}
                  <label title="Worst-case envelope around the combined curve when every physical R/L/C lands within its tolerance — what building with real parts can do to this design. Numbers in the SPL strip; the tooltip there ranks the most sensitive parts.">
                    <input
                      type="checkbox"
                      checked={tolOn}
                      onChange={(e) => setTolOn(e.target.checked)}
                    />{' '}
                    Tolerance band ±
                    <select
                      value={tolPct}
                      onChange={(e) => setTolPct(Number(e.target.value))}
                      title="Component tolerance class: 2% (measured/selected parts), 5% (good film caps & air coils), 10% (electrolytics, budget parts)"
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
              <p className="derived" style={{ margin: '0 0 0.8rem' }}>
                {netOptNote}
              </p>
            )}
            {netOptDiff && netOptDiff.length > 0 && (
              <details className="tune-diff">
                <summary>{netOptDiff.length} value changes — old → new</summary>
                <table className="scan-table">
                  <thead>
                    <tr>
                      <th>part</th>
                      <th>old</th>
                      <th>new</th>
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
              <table
                className="scan-table scan-table-pick"
                title="Full-chain crossover scan — click a row to load that candidate's complete design (filters + tuned network) into Working; click a header to sort"
              >
                <thead>
                  <tr>
                    {(
                      [
                        ['xo', 'crossover'],
                        ['ripple', 'peak'],
                        ['avg', 'avg'],
                        ['phase', 'phase'],
                        ['bom', 'BOM'],
                      ] as const
                    ).map(([key, caption]) => (
                      <th
                        key={key}
                        className={scanSort?.key === key ? 'sorted' : ''}
                        onClick={() => toggleScanSort(key)}
                        title="Sort by this column — ascending, descending, then back to the ranking order (🏆 first)"
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
                          ? 'This candidate is loaded in Working'
                          : `Load the ${r.label} design into Working (undo-able)`
                      }
                    >
                      <td>
                        {r.winner ? '🏆 ' : ''}
                        {r.label}
                        {chainScan.active === r.label ? ' ◂' : ''}
                      </td>
                      <td title="Peak ±dB — the worst single spot (what the staged targets gate on)">
                        {r.rippleDb.toFixed(2)} dB
                      </td>
                      <td title="Whole-range average |deviation| — the number the ranking judges on: one narrow dip doesn't decide the winner">
                        {r.avgDevDb !== null ? `${r.avgDevDb.toFixed(2)} dB` : '—'}
                      </td>
                      <td>{r.phaseDeg.toFixed(1)}°</td>
                      <td>{r.bomEur !== null ? `€${Math.round(r.bomEur)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                          ? `Overwrite "${designs.find((d) => d.id === lastSavedId)?.name ?? ''}" with the active design and switch to it`
                          : lastSavedId === activeDesignId && lastSavedId !== null
                            ? 'This IS the saved filter — edits are live, nothing to save'
                            : 'No saved filter yet — use Save as new first'
                      }
                    >
                      💾 Save
                    </button>
                    <button
                      type="button"
                      className="design-tab-dup"
                      onClick={() => setSaveNameDraft(uniqueDesignName('Filter', designs))}
                      disabled={!activeDesignId}
                      title="Save the active design under a NEW name and switch to that saved tab — the tab you came from stays as a ghost to compare against"
                    >
                      Save as new
                    </button>
                  </>
                ) : (
                  <span className="design-tab-savename">
                    <input
                      autoFocus
                      value={saveNameDraft}
                      placeholder="Filter name"
                      onChange={(e) => setSaveNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveActiveDesign(saveNameDraft);
                        if (e.key === 'Escape') setSaveNameDraft(null);
                      }}
                    />
                    <button type="button" onClick={() => saveActiveDesign(saveNameDraft)} title="Save (Enter)">
                      ✓
                    </button>
                    <button type="button" onClick={() => setSaveNameDraft(null)} title="Cancel (Esc)">
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
                        BOM — {bom.rows.length} components ·{' '}
                        {bom.totalEur !== null
                          ? `≥ €${bom.totalEur.toFixed(2)} (${bom.pricedCount}/${bom.rows.length} priced)`
                          : 'no prices in catalog yet'}
                        {bom.unmatchedCount > 0 && ` · ${bom.unmatchedCount} without exact catalog match`}
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
                                    : 'no exact catalog value'}
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
                No network yet — "Build passive filter" drops the synthesised design here as a tab,
                or import the selected variant / start from a template (generator + drivers,
                unfiltered).
              </p>
            )}
          </div>
        </>
            )}
          </div>
        </aside>

        <div
          className="pane-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the design and chart panes — arrow keys adjust, Home resets"
          tabIndex={0}
          title="Drag to resize the panes — double-click to reset to automatic width"
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

        <main className="analysis-pane">
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

      {result && (
        <>
          <div className="panel-toggles">
            <span className="toggles-cap">Charts</span>
            {PANEL_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={`panel-toggle${showPanels[k] ? ' on' : ''}`}
                aria-pressed={showPanels[k]}
                title={
                  showPanels[k]
                    ? 'Hide this panel (skips its computation too)'
                    : 'Show this panel'
                }
                onClick={() => setShowPanels((p) => ({ ...p, [k]: !p[k] }))}
              >
                {showPanels[k] ? '✓ ' : ''}
                {PANEL_LABEL[k]}
              </button>
            ))}
          </div>

          {/* Only when the sim TRULY shows raw drivers: no active editor
              network, no live virtual filters, no vxp variant. The old
              vxp-only check kept shouting "RAW drivers" straight over an
              active Working network. */}
          {result &&
            !networkActive &&
            !(project && xoName !== 'none') &&
            (vfBypass ||
              (!isActive(vFilters.woofer) &&
                !isActive(vFilters.tweeter) &&
                !(threeWay && isActive(vFilters.mid)))) && (
              <div className="panel">
                <div className="verdict no-reference">
                  <strong>No filter in the simulation — you are looking at the RAW drivers.</strong>{' '}
                  Design one in the Filters tab (Optimize — design for me), activate a network in
                  the Network tab{project ? ', or pick a vxp variant in the Setup tab' : ''}.
                </div>
              </div>
            )}

          <div className={`panel${splPinned ? ' spl-sticky' : ''}`}>
            <div className="panel-head">
              <h2>SPL</h2>
              <button
                type="button"
                className={`pin-btn${splPinned ? ' on' : ''}`}
                aria-pressed={splPinned}
                // Icon-only: a tooltip is hover-only, so it is no label at all
                // for a keyboard or a screen reader.
                aria-label="Pin the SPL chart to the top"
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
                    <span className="strip-label">Response flatness</span>
                    <span
                      className={`strip-score ${
                        combinedFlat.score >= 85 ? 'ok' : combinedFlat.score >= 70 ? 'warn' : 'bad'
                      }`}
                      title="Whole-range flatness of the combined SPL over the currently VISIBLE range (zoom the SPL chart and this follows): 0–100 from the AVERAGE |deviation| vs the median level. Judges the entire range — one narrow dip barely moves it; the peak ±dB next to it still exposes that dip."
                    >
                      {combinedFlat.score.toFixed(0)}
                    </span>
                    <span
                      className="strip-item"
                      title="Deviation from the median level over the visible range: average (the whole-range number), 95th percentile, and the classic single-spot peak ±dB — a big gap between avg and peak means the trouble is local, not everywhere."
                    >
                      avg ±{combinedFlat.avgDevDb.toFixed(2)} · P95 ±
                      {combinedFlat.p95DevDb.toFixed(1)} · peak ±{combinedFlat.rippleDb.toFixed(1)}{' '}
                      dB
                    </span>
                    <span
                      className="strip-item"
                      title={`Share of the visible range within ±0.5 / ±1 / ±2 dB of the median level: ${combinedFlat.withinPct[0.5].toFixed(0)}% · ${combinedFlat.withinPct[1].toFixed(0)}% · ${combinedFlat.withinPct[2].toFixed(0)}%.`}
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
                        title={`The optimizer designs from ${Math.round(optimizerFloorHz)} Hz up; the score above judges everything you SEE. Below that floor the woofer runs into its own rolloff, and a cut-only passive network cannot lift it — it could only match it by throwing away sensitivity everywhere else (baffle-step territory, a deliberate designer's choice). Zoom the SPL chart to the design band to read the score the optimizer actually worked on.`}
                      >
                        designed from {Math.round(optimizerFloorHz)} Hz
                      </span>
                    )}
                  </>
                )}
                {tolBand && (
                  <span
                    className="strip-item"
                    title={`How far the combined response can drift when every physical R/L/C lands ±${tolBand.tolPct}% off its value. Worst = all errors aligned against you (the guarantee before soldering); RSS = statistically realistic with independent part errors. Most sensitive parts: ${tolBand.perPart.slice(0, 5).map((p) => `${p.id} (±${p.maxAbsDb.toFixed(2)} dB)`).join(', ')} — tight-tolerance (or measured) parts pay off there first.`}
                  >
                    build ±{tolBand.tolPct}%: worst ±{tolBand.worstHalfDb.toFixed(2)} · RSS ±
                    {tolBand.rssHalfDb.toFixed(2)} dB · sensitive{' '}
                    {tolBand.perPart.slice(0, 3).map((p) => p.id).join(', ')}
                  </span>
                )}
                {verifyCompare && (
                  <span
                    className={`strip-item${verifyCompare.maxAbsDb > 3 ? ' alert' : ''}`}
                    title={`Model vs measurement over ${Math.round(verifyCompare.band[0])}–${Math.round(verifyCompare.band[1])} Hz. The measurement was level-aligned by ${verifyCompare.offsetDb.toFixed(1)} dB (median — absolute calibration differs by nature). Worst deviation ${verifyCompare.maxAt.deltaDb.toFixed(1)} dB at ${Math.round(verifyCompare.maxAt.freqHz)} Hz${verifyCompare.phase ? `. Phase: fitted mic delay ${verifyCompare.phase.fittedDelayUs.toFixed(0)} µs removed, residual avg ${verifyCompare.phase.avgAbsDeg.toFixed(1)}° / P95 ${verifyCompare.phase.p95AbsDeg.toFixed(0)}°${verifyCompare.phase.looksInverted ? ' — offset near 180°: the build is likely wired INVERTED vs the sim' : ''}` : ''}`}
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
                        title="Summing sanity 0–100: overlap-weighted cos(ε/2) — how well the drivers add up as ONE source. High is NORMAL (45° error still scores 92); it only drops when the drivers actively fight: wrong polarity, a timing fault, or a crossover in a phase null. Deliberately in the background — steer the design on Response flatness and Phase flatness."
                      >
                        integration {integration.score.toFixed(0)}
                      </span>
                      <span
                        className="strip-item"
                        title="Overlap centre — the frequency where the driver levels meet (≈ the acoustic crossover point)."
                      >
                        overlap{' '}
                        {integration.overlapCentreHz !== null
                          ? `${Math.round(integration.overlapCentreHz)} Hz`
                          : '—'}
                      </span>
                      <span
                        className="strip-item"
                        title="Integration bandwidth — contiguous band around the overlap centre where the phase error stays ≤90°. Also drawn as the shaded zone in the phase chart."
                      >
                        {integration.bandwidth
                          ? `bandwidth ${Math.round(integration.bandwidth.fLo)}–${Math.round(
                              integration.bandwidth.fHi,
                            )} Hz · ${integration.bandwidth.octaves.toFixed(1)} oct`
                          : 'bandwidth none (>90° at the overlap centre)'}
                      </span>
                    </>
                  ) : (
                    <span className="strip-item alert">
                      no overlap within 20 dB — the drivers never meet, nothing to integrate
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
                      title={`Adjacent pair ${label === 'W-M' ? 'woofer-mid' : 'mid-tweeter'}: summing score (overlap-weighted cos(ε/2)) and where the levels meet`}
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
                        : 'no overlap'}
                    </span>
                  ))}
              </div>
            )}
            <Chart
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
              <span className="align-title">Combined-curve color = phase alignment:</span>
              {TIER_ORDER.map((c) => (
                <span key={c} className="legend-item">
                  <span className="legend-key" style={{ background: TIER_COLOR[c] }} />
                  {TIER_LABEL[c]}
                </span>
              ))}
            </div>
            )}
          </div>

          {directivity && (
            <div className="panel">
              <h2>Directivity (horizontal)</h2>
              <p className="sub" style={{ marginBottom: '0.8rem' }}>
                Same filter at every measured angle ({directivity.angles.join('/')}° hor, one side).
                Horizontal only — vertical lobing is not in this data.
              </p>
              {showPanels.directivity && (
              <>
              <Chart
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
                    label: 'Listening window (0–30°)',
                    color: 'var(--viz-tweeter)',
                    dash: '2 3',
                    width: 2,
                    x: directivity.freq,
                    y: directivity.listeningWindowDb,
                  },
                  {
                    id: 'pwr',
                    label: 'Energy average (hor)',
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
                    label: 'Directivity index (on-axis − energy average)',
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
                    <h3 style={{ margin: 0 }}>Sonogram</h3>
                    <label>
                      Scale{' '}
                      <select
                        title="Normalized: each frequency relative to its own 0° level (pure beamwidth). Absolute: relative to the loudest point (level and directivity together)."
                        value={sonogramMode}
                        onChange={(e) => setSonogramMode(e.target.value as SonogramMode)}
                      >
                        <option value="normalized">Normalized (0° = 0 dB per frequency)</option>
                        <option value="absolute">Absolute (rel. loudest point)</option>
                      </select>
                    </label>
                  </div>
                  <p className="sub" style={{ marginBottom: '0.6rem' }}>
                    Negative angles mirror the measured side (symmetry assumed). Dashed contour =
                    −6 dB beamwidth; gaps mean wider than the measured {Math.max(...directivity.angles)}°.
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

          {showPanels.transfer && sim?.transfers && result && (
            <div className="panel">
              <h2>Filter transfer (driver voltage vs source)</h2>
              <Chart
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
                    label: 'Mid filter',
                    color: 'var(--viz-mid)',
                    x: result.freq,
                    y: sim.transfers.mid!.map((h) => 20 * Math.log10(cAbs(h) || Number.MIN_VALUE)),
                  },
                  sim.transfers.tweeter && {
                    id: 'ht',
                    label: 'Tweeter filter',
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

          {systemZInfo && result && (
            <div className="panel">
              <h2>System impedance (amplifier load)</h2>
              <div className="score-strip">
                <span className="strip-label">Z min</span>
                <span
                  className={`strip-score ${
                    systemZInfo.minOhm >= 6.4 ? 'ok' : systemZInfo.minOhm >= 3.2 ? 'warn' : 'bad'
                  }`}
                  title="Lowest system impedance the amplifier sees — the only side that can hurt it (current/heat). IEC 60268-5: minimum ≥ 0.8× the rated impedance. Green ≥ 6.4 Ω (safe as an '8 Ω' speaker), orange ≥ 3.2 Ω ('4 Ω' territory — fine for most solid-state amps), red below that."
                >
                  {systemZInfo.minOhm.toFixed(1)} Ω
                </span>
                <span className="strip-item">@ {Math.round(systemZInfo.minHz)} Hz</span>
                <span
                  className="strip-item"
                  title="Load character AT the impedance minimum: arg(Z), negative = capacitive, positive = inductive. Low |Z| alone costs current/heat; low AND strongly capacitive (≲ −45°) is the combination marginal amplifiers (tube, some class-D) dislike most."
                >
                  {systemZInfo.minPhaseDeg > 0 ? '+' : ''}
                  {systemZInfo.minPhaseDeg.toFixed(0)}°{' '}
                  {Math.abs(systemZInfo.minPhaseDeg) < 15
                    ? '(resistive)'
                    : systemZInfo.minPhaseDeg < 0
                      ? '(capacitive)'
                      : '(inductive)'}
                </span>
                <span
                  className="strip-item"
                  title="Highest system impedance. High is HARMLESS — the amp simply delivers less current there. It only becomes audible with a high-output-impedance amplifier (tube amps): the response then follows this curve."
                >
                  max {systemZInfo.maxOhm >= 1000 ? '≥1k' : systemZInfo.maxOhm.toFixed(0)} Ω @{' '}
                  {Math.round(systemZInfo.maxHz)} Hz
                </span>
              </div>
              <Chart
                series={[
                  {
                    id: 'zin',
                    label: 'System |Z|',
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
                series={[
                  {
                    id: 'zphase',
                    label: 'Z phase (− = capacitive, + = inductive)',
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
                ? `${soloDriver === 'woofer' ? 'Woofer/mid' : 'Tweeter'} phase (total)`
                : threeWay
                  ? 'Relative phase per driver pair'
                  : 'Tweeter phase relative to woofer'}
            </h2>
            {phaseStats && (
              <div className="score-strip">
                <span className="strip-label">Phase flatness</span>
                <span
                  className="strip-score"
                  title="Flatness score 0–100 over the driver overlap (overlap-weighted) — how flat the relative phase stays where both drivers play."
                >
                  {phaseStats.score}
                </span>
                <span className="strip-item">{phaseStats.label}</span>
                <span
                  className="strip-item"
                  title="Average |relative phase| in the overlap region."
                >
                  avg {phaseStats.avgErrorDeg.toFixed(1)}°
                </span>
                <span
                  className="strip-item"
                  title="95th-percentile phase error — the worst 5% excluded."
                >
                  P95 {phaseStats.p95ErrorDeg.toFixed(0)}°
                </span>
                <span
                  className="strip-item"
                  title="Standard deviation of the phase error — the wobble."
                >
                  σ {phaseStats.stdDevDeg.toFixed(1)}°
                </span>
                <span
                  className="strip-item"
                  title="Share of the overlap region with the phase error within ±5 / ±10 / ±15°."
                >
                  ±5° {phaseStats.withinPct[5].toFixed(0)}% · ±10°{' '}
                  {phaseStats.withinPct[10].toFixed(0)}% · ±15°{' '}
                  {phaseStats.withinPct[15].toFixed(0)}%
                </span>
              </div>
            )}
            {pairScores && (
              <div className="score-strip">
                <span className="strip-label">Phase flatness</span>
                {(
                  [
                    ['woofer-mid', pairScores.low.stats] as const,
                    ['mid-tweeter', pairScores.high.stats] as const,
                  ]
                ).map(([label, st]) => (
                  <span
                    key={label}
                    className="strip-item"
                    title={`Relative-phase flatness over the ${label} overlap window: score 0–100, average and P95 |phase error|.`}
                  >
                    {label}{' '}
                    {st
                      ? `${st.score} · avg ${st.avgErrorDeg.toFixed(1)}° · P95 ${st.p95ErrorDeg.toFixed(0)}°`
                      : 'no overlap'}
                  </span>
                ))}
              </div>
            )}
            <Chart
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
                        label: `integration bandwidth ${integration.bandwidth.octaves.toFixed(1)} oct`,
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
                                label: `W-M bandwidth ${pairScores.low.integ.bandwidth.octaves.toFixed(1)} oct`,
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
                                label: `M-T bandwidth ${pairScores.high.integ.bandwidth.octaves.toFixed(1)} oct`,
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
                        label: `overlap ${Math.round(integration.overlapCentreHz)} Hz`,
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
              <span className="align-title">Zones &amp; line color = distance from 0°:</span>
              {TIER_ORDER.map((c) => (
                <span key={c} className="legend-item">
                  <span className="legend-key" style={{ background: TIER_COLOR[c] }} />
                  {TIER_LABEL[c]}
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
            <h2>Excess group delay (combined)</h2>
            <Chart
              series={[
                {
                  id: 'egd',
                  label: `Excess group delay (bulk ${timeDomain.egd.minDelayMs.toFixed(2)} ms removed)`,
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
            <h2>Step response &amp; ETC (IFFT of combined response)</h2>
            <p className="sub" style={{ marginBottom: '0.8rem' }}>
              Sanity check, not a measurement — band edges are tapered. t = 0 at the impulse peak
              (arrival {timeDomain.td.peakTimeMs.toFixed(2)} ms).
            </p>
            <Chart
              series={[
                {
                  id: 'step',
                  label: 'Step response (normalized)',
                  color: 'var(--viz-combined)',
                  x: timeDomain.td.timeMs,
                  y: timeDomain.td.step,
                },
                {
                  id: 'imp',
                  label: 'Impulse (normalized)',
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
                  label: 'ETC — energy-time curve',
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
          title="Click to activate, double-click to rename"
        >
          {design.name}
        </button>
      )}
      <button
        type="button"
        className="design-tab-close"
        onClick={() => {
          if (window.confirm(`Delete tab "${design.name}"?`)) onDelete();
        }}
        title={`Delete "${design.name}"`}
        aria-label={`Delete tab "${design.name}"`}
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
      return '✓ Shared time reference plausible';
    case 'suspect':
      return '✗ Time bases disagree';
    case 'unreliable':
      return '⚠ Cannot judge (fit not delay-like)';
  }
}
