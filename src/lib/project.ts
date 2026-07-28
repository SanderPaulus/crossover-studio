import type { DriverFilterSpec } from './filters.ts';
import type { VxpCrossover, VxpPart } from './parsers/vxp.ts';

/** One network-editor tab: a named schematic design. */
export interface NetworkDesign {
  id: string;
  name: string;
  parts: VxpPart[];
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
export const PROJECT_VERSION = 1;

export interface StoredFile {
  name: string;
  raw: string;
}

export interface StoredAngleFile extends StoredFile {
  hor: number;
}

export interface ProjectDesign {
  vFilters: { woofer: DriverFilterSpec; tweeter: DriverFilterSpec };
  xoName: string;
  offsetMm: string;
  trimDb: string;
  inverted: boolean;
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
  /** Optional: preferred HP/LP alignment for the optimizer ('auto' = free). */
  hpLpPref?: string;
  /** Optional: phase metric for the optimizers — 'band' (panel avg + P95,
   *  default) or 'overlap' (classic weighted mean, the fallback). */
  phaseMetric?: 'band' | 'overlap';
  /** Optional: target acoustic slopes beside the crossing ('auto' = free). */
  acSlopeMid?: string;
  acSlopeTweeter?: string;
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
  /** Optional: staged design (stop escalating once targets met), default true. */
  stagedOn?: boolean;
  targetRipple?: string;
  targetPhase?: string;
}

export interface ProjectState {
  woofer?: StoredFile;
  tweeter?: StoredFile;
  /** Keyed by driver model name used in the crossover ("mid", "tweeter"). */
  impedances?: Record<string, StoredFile>;
  vxp?: StoredFile;
  /** Optional since v1 files predating it: per-driver angle response sets. */
  angleFiles?: { woofer: StoredAngleFile[]; tweeter: StoredAngleFile[] };
  /** Free-text notes per imported file, keyed "group:filename" (optional). */
  fileNotes?: Record<string, string>;
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
    if (w.length + t.length > 0) angleFiles = { woofer: w, tweeter: t };
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
    angleFiles,
    tweeter: file(d['tweeter']),
    impedances: Object.keys(impedances).length ? impedances : undefined,
    vxp: file(d['vxp']),
    fileNotes,
    design,
  };
}
