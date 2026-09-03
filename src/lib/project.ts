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
  /**
   * A5e.2 (F3) — the TARGET CURVE this design is voiced against.
   *
   * On the DESIGN and not on the project, deliberately: two voicings of the
   * same loudspeaker have to exist side by side and be compared. A
   * project-wide curve would turn "which voicing do I want" into a setting you
   * toggle back and forth, which is the comparison it should have made easy.
   *
   * ABSENT MEANS FLAT, and old projects therefore load unchanged. That is not
   * the P4 absent-means-off rule: a target curve is not a limit that judges a
   * design, it is the reference the judgement is measured against, and "no
   * reference" is not a coherent state for a window requirement. Flat is the
   * neutral reference and it is reported as such.
   *
   * `tilt` and `hold-current` exist in the vocabulary and are REFUSED by the
   * engine rather than approximated — see `engine2/requirements/targetCurve.ts`.
   *
   * UI-1 — `bass-plateau` was added to the engine's vocabulary at V45 and NOT
   * here, so a design could not have stored one even once something offered to
   * set it. Only the STATED half is persisted: A5e.2 gives the shape two
   * parameters from opposite sources on purpose, and the transition frequency
   * is the MEASURED baffle step of the cabinet front. Storing that too would
   * freeze a measurement into the design and leave it stale the moment the
   * cabinet width is corrected; it is derived on read, from the cabinet form
   * and from nothing else (P6).
   */
  targetCurve?: {
    type: 'flat' | 'bass-plateau' | 'tilt' | 'hold-current';
    /** `bass-plateau` — how far below the flat part, in dB. Stated; no default. */
    plateauDepthDb?: number;
    tiltDbPerDecade?: number;
    tiltPivotHz?: number;
  };
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
          /**
           * How this branch's drivers are described (step A3).
           *
           * 'array' (or ABSENT, which means the same thing) — one measurement
           * stands for `count` identical drivers at `spacingMm`. Everything
           * written before this field existed is this, so the absence of the
           * field IS the migration: nothing to rewrite, nothing to interpret.
           *
           * 'discrete' — each driver is its own source with its own measurement
           * and position; `count` must be 1 and `spacingMm` is meaningless
           * (the positions carry it).
           *
           * DELIBERATELY NOT A VERSION BUMP. An older app reading a file that
           * carries this field simply ignores it, and 'array' is exactly what
           * it would have done anyway — so a project stays openable in both
           * directions. The version only has to move when a file genuinely
           * cannot be read by an older app, which is step A7 (the netlist).
           */
          sourceMode?: 'array' | 'discrete';
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
  /**
   * Engine v2 (experimental) — the F1 reporting layer, spec A6/Deliverable 1.
   *
   * ABSENT MEANS OFF, and that is not a default in the P4 sense: it is the
   * absence of an opt-in. A project written before the toggle existed, or by a
   * user who never touched it, must behave exactly as it always did — see
   * `engine2/facade.ts` for the invariant and the regression that proves it.
   */
  engineV2Enabled?: boolean;
  /**
   * The project settings the v2 layer reads. Strings like every other numeric
   * field here; EMPTY MEANS THE SETTING IS ABSENT (P4), which is why none of
   * them has a default anywhere in the code.
   *
   * REPORTING (F1)
   * `verticalWindowDeg` — the observation angles M-F-final synthesises over,
   * comma-separated degrees (e.g. "-15, 15").
   * `amplifierPowerW`  — the power M-A converts its scale-free fraction into
   * watts with. Without it the fraction is still reported.
   *
   * GATES (F2, Deliverable 2). Absent = the gate is OFF: its value is still
   * shown in the report, with "no limit set" beside it. The suggestion text in
   * the UI is a GHOST — a placeholder that is never a value.
   * `maxDissipationPct` — M-A, the largest share of amplifier power that may
   * be burnt in the filter resistors. Entered as a percentage, held as a
   * fraction by the engine.
   * `minEpdrOhm`        — M-B, the EPDR floor. Beside, and independent of,
   * `ampMinLoadOhm`, which stays the plain |Z| floor (the simple mode A4
   * keeps). Both are judged by one rule.
   * `maxDriveOnFsDb`    — M-C, the largest drive voltage on a driver's own
   * resonance relative to its passband. Applies to every way the CIRCUIT
   * high-passes, derived from the branch transfers rather than from a list.
   *
   * SEARCH-SPACE BUDGETS (F2, Deliverable 4, spec A5d.6). Absent = that bound
   * is off and the search box is exactly the app's own.
   * `lfBumpBudgetDb`    — how much extra low-frequency lift the filter may add
   * over the bare box; inverted into a maximum series inductance.
   * `qesMultiplierMax`  — the largest factor the source resistance may
   * multiply Q_es by; inverted into a maximum total series resistance.
   * `dampingMarginDb`   — how much attenuation a way may spend on top of its
   * measured sensitivity gap; inverted into a maximum pad resistance.
   *
   * DETERMINISM (F2, Deliverable 1, spec A5e.4).
   * `runSeed`           — absent = the published default, which is REPORTED.
   * A seed is the one setting where absent-means-off would be wrong: off would
   * mean "not reproducible".
   * `runBudgetEvals`    — evaluations per starting point; absent = the tuner's
   * own policy, i.e. exactly what a v1 run does.
   */
  engineV2?: {
    verticalWindowDeg?: string;
    amplifierPowerW?: string;
    /**
     * A5e.1 (F3) — the TASTE REQUIREMENTS. Acceptance limits on the outcome,
     * not weights and not gates: they filter the delivered field, they never
     * touch the search, and the relaxation ladder may widen them visibly.
     * Empty = that requirement is not being asked (P4).
     */
    splWindowPlusMinusDb?: string;
    maxPhaseTrackingDeg?: string;
    /** How many designs the shortlist holds. Empty = the published default. */
    shortlistSize?: string;
    maxDissipationPct?: string;
    minEpdrOhm?: string;
    maxDriveOnFsDb?: string;
    lfBumpBudgetDb?: string;
    qesMultiplierMax?: string;
    dampingMarginDb?: string;
    runSeed?: string;
    runBudgetEvals?: string;
    /**
     * V49 (M-C v2.0) — the amplifier's brief PEAK power and the load it is
     * specified into, plus the fraction of X_max a design may use. Together
     * with the driver cards they turn M-C's limit from a stated decibel into
     * a derived property of the driver. Empty = absent, and M-C is then judged
     * on `maxDriveOnFsDb` alone (or on nothing).
     */
    amplifierPeakPowerW?: string;
    amplifierNominalLoadOhm?: string;
    xmaxMarginFraction?: string;
    /**
     * V50 — BUILDABILITY: the resistor class (W continuous) the project
     * builds with and the fraction of it a resistor may run at (M-A/part),
     * and the saturation current class of its cored coils (M-L). Empty =
     * absent: the figures are still reported, nothing judges them.
     */
    resistorClassW?: string;
    resistorPowerMargin?: string;
    coilClassA?: string;
  };
  /**
   * A5a (F3b) — per-branch MEASUREMENT metadata for the v2 layer, keyed by
   * branch role. Strings, empty = absent, additive: a project written before
   * F3b has no field and loads unchanged.
   *
   * It sits beside `engineV2` rather than inside it because these are facts
   * about the MEASUREMENT SESSION, not settings of an engine — a DC resistance
   * read off a meter and the window a gate was taken with stay true whichever
   * engine reads them. They are only consumed by the v2 layer today, and the
   * form that collects them is behind the same toggle for that reason.
   */
  v2Measurement?: Partial<
    Record<
      BranchRole,
      {
        zMm?: string;
        rotSym?: string;
        reOhm?: string;
        refTimeMs?: string;
        rightWindowMs?: string;
        floorHz?: string;
        windowNote?: string;
        /**
         * V49 (M-C v2.0) — the two datasheet numbers the excursion route needs
         * beside the Sd/Xmax the Setup tab already holds: force factor (T·m)
         * and moving mass (g). Empty = absent; M-C v2.0 stays off for the
         * branch and names the field.
         */
        blTm?: string;
        mmsG?: string;
        /** V49 — the drive voltage (V rms) the on-axis far field was taken at,
         *  when documented. With the mic distance on the cabinet form it arms
         *  the ACOUSTIC counter-proof of M-C v2.0. */
        driveVoltageV?: string;
        /** V50 — the stated M-C figure for this way, dB re its passband;
         *  overrides the single `engineV2.maxDriveOnFsDb`. Empty = none per way. */
        driveOnFsMaxDb?: string;
      }
    >
  >;
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
