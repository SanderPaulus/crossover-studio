import type { BranchRole } from './driverSlots.ts';
import type { DriverFilterSpec } from './filters.ts';
import type { VxpCrossover, VxpPart } from './parsers/vxp.ts';

/** One network-editor tab: a named schematic design. */
export interface NetworkDesign {
  id: string;
  name: string;
  parts: VxpPart[];
  /**
   * The evaluation band this design was produced on, Hz (step B2).
   *
   * ABSENT means one of two things, and they read the same to the user for the
   * same reason: either the design predates validity bands, or it was made on
   * a source whose band was unknown. Both were computed against an unknown
   * band, so both stay visible and both carry the mark. A result that was
   * derived under an assumption nobody can name must not pass silently as
   * valid just because it is already on the screen.
   */
  bandAtDesign?: { fromHz: number; toHz: number };
}

/**
 * Project persistence — one JSON file (or autosave blob) holding everything:
 * the RAW measurement files plus the design state.
 *
 * Raw file text is stored verbatim and re-parsed on load, so the parsers stay
 * the single source of truth and old projects keep working when parsing
 * improves. Version field guards the design-state shape.
 */

export const PROJECT_FORMAT = 'acoustic-design-studio-project';
/**
 * v2 (aug 2026, phase-4 trede 2b): storage speaks branch ROLES. Standalone
 * per-branch impedances moved from the model-named `impedances` record (where
 * the LOW branch was keyed 'mid' — the 2-way-era overload that collides with
 * a real middle branch) into role-keyed `zByRole`; `impedances` now carries
 * only vxp model-named files. v1 files migrate on read, are never rewritten.
 */
export const PROJECT_VERSION = 2;

export interface StoredFile {
  name: string;
  raw: string;
}

export interface StoredAngleFile extends StoredFile {
  hor: number;
}

export interface ProjectDesign {
  /** `mid` optional: only present when a middle branch is loaded (3-way). */
  vFilters: { woofer: DriverFilterSpec; tweeter: DriverFilterSpec; mid?: DriverFilterSpec };
  xoName: string;
  offsetMm: string;
  trimDb: string;
  inverted: boolean;
  /** 3-way: the middle branch's own adjust (the tweeter fields above stay the
   *  high branch's — per-branch adjust is the combineN generalization). */
  midOffsetMm?: string;
  midTrimDb?: string;
  midInverted?: boolean;
  fMin: string;
  fMax: string;
  splMin: string;
  splMax: string;
  phasePriority: number;
  vfEqBands: number;
  /** Optional since v1 files predating it; default 'measured'. */
  phaseMode?: 'measured' | 'minimum';
  /** Optional: amplitude budget share for the energy average (%, default 25). */
  dirWeight?: number;
  /** Optional: which curve the optimizer flattens (default 'onAxis'). */
  ampTarget?: 'onAxis' | 'listeningWindow';
  /** Optional: sonogram color reference (default 'normalized'). */
  sonogramMode?: 'normalized' | 'absolute';
  /** Optional: network-editor tabs (step 6) and which one is active. */
  networkDesigns?: NetworkDesign[];
  activeDesignId?: string;
  /** Target of the "💾 Save" (overwrite) button — the last saved filter tab. */
  lastSavedDesignId?: string;
  /** Legacy (pre-tabs): single editable schematic — migrated to one tab on load. */
  schematic?: VxpCrossover;
  networkActive?: boolean;
  /** Optional: virtual filters muted in the sim (settings kept), default false. */
  vfBypass?: boolean;
  /** Optional: passive-honest optimizer (EQ cut-only), default true. */
  vfCutOnly?: boolean;
  /** Optional: snap the passive build to catalog parts (off by default). */
  catalogSnap?: boolean;
  /** Optional: breakup guard (stopband ≥20 dB down), default true. */
  breakupGuard?: boolean;
  /** Optional: crossover-point constraint for the optimizer (off by default). */
  xoRangeOn?: boolean;
  /** Legacy (pre-jul 2026): explicit lo/hi range — migrated to freq ± margin. */
  xoRangeLo?: string;
  xoRangeHi?: string;
  /** Crossover point as centre frequency + symmetric margin (Hz). */
  xoFreqHz?: string;
  xoMarginHz?: string;
  /** Crossover-scan candidate count across the pinned range (odd, 3..11). */
  xoScanSteps?: number;
  /** 3-way scan: candidate steps PER crossing (1..3 → 1/4/9 chains). Applies
   *  pinned or not — every candidate gets its own slice either way. */
  xo3Steps?: number;
  /** Optional: preferred HP/LP alignment for the optimizer ('auto' = free).
   *  In 3-way this is the HIGH (mid-tweeter) crossing; `hpLpPrefLow` is the
   *  woofer-mid one. */
  hpLpPref?: string;
  hpLpPrefLow?: string;
  /** Optional: phase metric for the optimizers — 'band' (panel avg + P95,
   *  default) or 'overlap' (classic weighted mean, the fallback). */
  phaseMetric?: 'band' | 'overlap';
  /** Optional: target acoustic slopes beside the crossing ('auto' = free). */
  acSlopeMid?: string;
  acSlopeTweeter?: string;
  /** 3-way: LOW-pair slopes (woofer LP / mid HP) and the low handover pin. */
  acSlopeWoofer?: string;
  acSlopeMidHp?: string;
  xoLowFreqHz?: string;
  xoLowMarginHz?: string;
  /** Optional: component-wizard snap preferences. */
  snapProfile?: string;
  snapSeriesL?: string;
  snapSeriesC?: string;
  snapSeriesR?: string;
  /** Optional: allow 2-part stacks in the snap (default true). */
  snapStacks?: boolean;
  /** Optional: value window — a bound series also hard-bounds the fit of
   *  series-path slots to its value range (default false). */
  snapBoundToSeries?: boolean;
  /** Optional: mid nominal size (inch) — sets the crossover ceiling via cone
   *  beaming. '' / absent = unknown. */
  midSizeInch?: string;
  /** 3-way: woofer nominal size (inch) — the W-M handover's beaming ceiling,
   *  the mirror of midSizeInch. '' / absent = unknown. */
  wooferSizeInch?: string;
  /** Directivity philosophy for the measured beaming ceiling (ka tier). */
  kaTier?: string;
  /** How many wavelengths of driver spacing the design tolerates. */
  ctcK?: string;
  /** Opt-in: re-time branches from the measuring to the listening distance. */
  seatTiming?: boolean;
  /**
   * Cabinet geometry + measurement context: driver positions relative to the
   * measurement reference point, mic distance, baffle size, enclosure per
   * driver, listening position. All strings ('' = not entered); every consumer
   * treats absent as "this criterion does not apply".
   */
  cabinet?: {
    micDistanceMm?: string;
    micElevationDeg?: string;
    gateMs?: string;
    baffleWidthMm?: string;
    baffleHeightMm?: string;
    /** Front-to-back, mm — the panel width for a side-firing driver. */
    cabinetDepthMm?: string;
    refFromTopMm?: string;
    refHeightMm?: string;
    listenDistanceM?: string;
    listenEarHeightMm?: string;
    /** Driver the mic was aimed at; that one is the reference point (0,0). */
    refDriver?: string;
    drivers?: Partial<
      Record<
        'low' | 'mid' | 'high',
        {
          xMm?: string;
          yMm?: string;
          enclosure?: string;
          fbHz?: string;
          /** Identical drivers in this branch (dual woofers etc.); absent = 1. */
          count?: string;
          /** Centre-to-centre spacing between them, mm; only used when count > 1. */
          spacingMm?: string;
          /** Acoustic centre behind the baffle plane, mm; absent = on it. */
          depthMm?: string;
          /** 'front' | 'rear' | 'left' | 'right' | 'up' | 'down'; absent = front. */
          facing?: string;
          /** Sloped/stepped baffle: degrees aimed further up. */
          tiltDeg?: string;
          /** count > 1 drivers on both opposing panels (force cancelling). */
          opposed?: boolean;
        }
      >
    >;
  };
  /** Cone-breakup upper limit: off, or cross at f_b / harmonic. */
  breakupLimitOn?: boolean;
  breakupHarmonic?: string;
  /** Datasheet numbers for the excursion floor, per branch role, and the SPL
   *  it is computed for. Absent = the criterion does not apply. */
  sdCm2?: Partial<Record<'low' | 'mid' | 'high', string>>;
  xmaxMm?: Partial<Record<'low' | 'mid' | 'high', string>>;
  excursionSpl?: string;
  /** Optional: staged design (stop escalating once targets met), default true. */
  stagedOn?: boolean;
  targetRipple?: string;
  targetPhase?: string;
  /** Single-driver mode: how much sensitivity (dB) a correction may spend to
   *  buy flatness. Default 6; a fullranger carrying the whole range is worth
   *  more (Sanders' 12W8524: ~10 dB scores far better whole-range). */
  soloSensDb?: string;
  /** Single-driver mode: use an ABSOLUTE target level (Sanders' floor idea)
   *  instead of the relative sensitivity budget, and the level itself (dB in
   *  the loaded FRD's own scale). */
  soloFloorOn?: boolean;
  soloFloorDb?: string;
}

export interface ProjectState {
  woofer?: StoredFile;
  /** 3-way: the middle branch's response (v2+). */
  mid?: StoredFile;
  tweeter?: StoredFile;
  /** vxp-project impedances, keyed by the REAL driver model names. Until v1
   *  this record also carried the standalone per-branch ZMAs under the
   *  synthesis vocabulary ('mid' = low branch!) — those live in `zByRole`
   *  since v2; v1 files migrate on read. */
  impedances?: Record<string, StoredFile>;
  /** Standalone per-branch impedances, keyed by branch ROLE (v2+). */
  zByRole?: Partial<Record<BranchRole, StoredFile>>;
  vxp?: StoredFile;
  /** Optional since v1 files predating it: per-driver angle response sets.
   *  `mid` optional (v2+, 3-way). */
  angleFiles?: { woofer: StoredAngleFile[]; tweeter: StoredAngleFile[]; mid?: StoredAngleFile[] };
  /** Free-text notes per imported file, keyed "group:filename" (optional). */
  fileNotes?: Record<string, string>;
  /** Optional: measured response of the BUILT system, overlaid against the
   *  simulation (the VALIDATIE.md loop). Kept as the ACTIVE one of the list
   *  below so an older reader still finds it. */
  verifyFile?: StoredFile;
  /** Every loaded verification measurement (Compare mode keeps several —
   *  build v1, build v2 — as tabs). `verifyActive` indexes into it. Absent on
   *  files from before Compare mode: `verifyFile` alone is then the list. */
  verifyFiles?: StoredFile[];
  verifyActive?: number;
  /** Optional: near-field measurements per branch role, plus their splice
   *  settings. The files are stored raw like every other measurement so a
   *  project stays self-contained. */
  nearField?: Partial<
    Record<
      'low' | 'mid' | 'high',
      {
        cone?: StoredFile;
        port?: StoredFile;
        portDiaMm?: string;
        transitionHz?: string;
        blendOctaves?: string;
        stepOn?: boolean;
        stepDepthDb?: string;
      }
    >
  >;
  design: ProjectDesign;
}

export class ProjectError extends Error {}

export function serializeProject(state: ProjectState): string {
  return JSON.stringify(
    {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      savedAt: new Date().toISOString(),
      ...state,
    },
    null,
    1,
  );
}

export function deserializeProject(text: string): ProjectState {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new ProjectError('Not valid JSON — is this a Crossover Studio project file?');
  }
  if (typeof doc !== 'object' || doc === null) throw new ProjectError('Not a project object.');
  const d = doc as Record<string, unknown>;
  if (d['format'] !== PROJECT_FORMAT) {
    throw new ProjectError('Not a Crossover Studio project file (format marker missing).');
  }
  if (typeof d['version'] !== 'number' || d['version'] > PROJECT_VERSION) {
    throw new ProjectError(
      `Project version ${String(d['version'])} is newer than this app understands ` +
        `(${PROJECT_VERSION}) — update the app.`,
    );
  }
  const design = d['design'] as ProjectDesign | undefined;
  if (!design || typeof design !== 'object' || !design.vFilters) {
    throw new ProjectError('Project file has no design state.');
  }

  const file = (v: unknown): StoredFile | undefined => {
    if (typeof v !== 'object' || v === null) return undefined;
    const f = v as Record<string, unknown>;
    return typeof f['name'] === 'string' && typeof f['raw'] === 'string'
      ? { name: f['name'], raw: f['raw'] }
      : undefined;
  };

  const impedancesIn = d['impedances'] as Record<string, unknown> | undefined;
  const impedances: Record<string, StoredFile> = {};
  if (impedancesIn && typeof impedancesIn === 'object') {
    for (const [k, v] of Object.entries(impedancesIn)) {
      const f = file(v);
      if (f) impedances[k] = f;
    }
  }

  // Standalone per-branch impedances by ROLE (v2+), plus the v1 migration:
  // without a vxp, v1 stored the standalone ZMAs in `impedances` under the
  // synthesis vocabulary — 'mid' meaning the LOW branch. Migrate those keys to
  // roles on read; a vxp project's model-named record is never touched (a real
  // vxp driver may legitimately be CALLED "mid" — KOAN's is).
  const zByRole: Partial<Record<BranchRole, StoredFile>> = {};
  const zByRoleIn = d['zByRole'] as Record<string, unknown> | undefined;
  if (zByRoleIn && typeof zByRoleIn === 'object') {
    for (const role of ['low', 'mid', 'high'] as const) {
      const f = file(zByRoleIn[role]);
      if (f) zByRole[role] = f;
    }
  }
  if (d['version'] === 1 && !d['vxp']) {
    if (impedances['mid']) {
      zByRole.low = impedances['mid'];
      delete impedances['mid'];
    }
    if (impedances['tweeter']) {
      zByRole.high = impedances['tweeter'];
      delete impedances['tweeter'];
    }
  }

  const angleFile = (v: unknown): StoredAngleFile | undefined => {
    const f = file(v);
    if (!f) return undefined;
    const hor = (v as Record<string, unknown>)['hor'];
    return typeof hor === 'number' && Number.isFinite(hor) ? { ...f, hor } : undefined;
  };
  const angleFilesIn = d['angleFiles'] as Record<string, unknown> | undefined;
  let angleFiles: ProjectState['angleFiles'];
  if (angleFilesIn && typeof angleFilesIn === 'object') {
    const side = (k: string): StoredAngleFile[] =>
      Array.isArray(angleFilesIn[k])
        ? (angleFilesIn[k] as unknown[]).map(angleFile).filter((f): f is StoredAngleFile => !!f)
        : [];
    const w = side('woofer');
    const t = side('tweeter');
    const m = side('mid');
    if (w.length + t.length + m.length > 0) {
      angleFiles = { woofer: w, tweeter: t, ...(m.length > 0 ? { mid: m } : {}) };
    }
  }

  const notesIn = d['fileNotes'] as Record<string, unknown> | undefined;
  let fileNotes: Record<string, string> | undefined;
  if (notesIn && typeof notesIn === 'object') {
    const entries = Object.entries(notesIn).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '',
    );
    if (entries.length > 0) fileNotes = Object.fromEntries(entries);
  }

  return {
    woofer: file(d['woofer']),
    mid: file(d['mid']),
    angleFiles,
    tweeter: file(d['tweeter']),
    impedances: Object.keys(impedances).length ? impedances : undefined,
    zByRole: Object.keys(zByRole).length ? zByRole : undefined,
    vxp: file(d['vxp']),
    fileNotes,
    verifyFile: file(d['verifyFile']),
    verifyFiles: Array.isArray(d['verifyFiles'])
      ? (d['verifyFiles'] as unknown[]).map(file).filter((f): f is StoredFile => f !== undefined)
      : undefined,
    verifyActive:
      typeof d['verifyActive'] === 'number' && Number.isInteger(d['verifyActive']) && d['verifyActive'] >= 0
        ? d['verifyActive']
        : undefined,
    nearField: (d['nearField'] as ProjectState['nearField']) ?? undefined,
    design,
  };
}
