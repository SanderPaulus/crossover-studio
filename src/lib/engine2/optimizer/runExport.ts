/**
 * E-2 — AN APP RUN, EXPORTED SO THE REPOSITORY CAN REPLAY IT (the V48 gap).
 *
 * V48 measured two of nine candidates of Sander's browser run of 01-09-2026
 * over the stated LF budget — and nothing in the repository could rebuild
 * that field: the fingerprint said WHICH inputs it was made of, not what they
 * were. This block is the export the run stamp needs beside it: the stated
 * requirements and the run settings, the FIELD SETTINGS (mode, budget,
 * alignments, the per-pair derivation inputs), the derived window inputs and
 * order derivations the field stood on, and the candidates themselves —
 * labels, positions, cages, orders, alignments. From that
 * `scripts/replay-app-run.ts` rebuilds the field in the generator and says,
 * candidate by candidate, whether the repository derives the same one.
 *
 * TWO LAYERS OF REPLAY, deliberately.
 *
 *  1. FROM THE EXPORT ALONE (`replayField`): the generator is re-run on the
 *     exported window inputs and order derivations with the exported
 *     settings. This is a pure function of the block, so it reproduces the
 *     candidates exactly — which proves that the block SUFFICES: nothing the
 *     field depended on was left out. The `choices` component of the stamp
 *     is the hash of this field, and the replay recomputes it.
 *  2. FROM THE REPOSITORY'S MEASUREMENT SET (the script): the report is
 *     rebuilt on the repository's own casus-1 files with the exported report
 *     settings, the field is derived from THAT, and the two fields are
 *     compared — candidates first, and where they differ, the window inputs
 *     that made them differ. That is the replay proper: the app on its
 *     measurement set against the repository on its own.
 *
 * WHAT IS NOT PROMISED (V46, A5e.4): bytes. The candidates are labels,
 * positions, orders and alignments — a field is a field on any machine — but
 * a NETWORK tuned on that field reproduces byte-for-byte only per (machine,
 * runtime). The optional `--run` of the script tunes the candidates and
 * reports the shortlist it gets, and the comparison there is equivalence
 * within the tolerance classes, never bytes.
 *
 * Everything in the block is plain data: no function, no class, no curve —
 * the measured responses are the measurement set's and are referenced by
 * file name, never copied.
 */

import { digest, stableJson, type DeterminismSettings, type V2RunStamp } from './determinism.ts';
import type { GateSettings } from './gates.ts';
import type { BudgetSettings } from './bounds.ts';
import type { ChainChoiceDeclaration } from './chainChoices.ts';
import type { TargetCurve } from '../requirements/targetCurve.ts';
import type { ReportSettings } from '../report.ts';
import type { AdapterGeometry } from '../appAdapter.ts';
import type { XoWindowInput } from '../predesign/xoWindow.ts';
import type { PairOrderResult } from '../predesign/flankOrder.ts';
import {
  generateCandidates,
  type Alignment,
  type AlignmentPolicy,
  type CandidateField,
  type PositionPolicy,
} from '../predesign/candidates.ts';
import { candidateFieldKey, type CandidateFieldResult, type PairDerivationInput } from '../predesign/candidateField.ts';
import { statedCandidates } from '../predesign/statedCrossings.ts';
import { fieldModeOfParameters, type FieldMode } from '../predesign/fieldMode.ts';
import { ENGINE_V2_LABEL, ENGINE_V2_VERSION } from '../version.ts';

export const RUN_EXPORT_FORMAT = 'crossover-studio-run/1';

/** One handover of one exported candidate — the fingerprint's own shape, plus the driver names. */
export interface ExportedCrossing {
  pair: string;
  lower: string;
  upper: string;
  hz: number;
  cage: [number, number];
  order: number;
  alignment: string;
  window: [number, number];
}

export interface ExportedCandidate {
  label: string;
  crossings: ExportedCrossing[];
}

/** The per-pair derivation inputs, minus the measured curves (referenced, not copied). */
export interface ExportedPerPair {
  pair: string;
  statedOrder: number | null;
  maxDriveOnFsDb: number | null;
  breakupSuppressionDb: number | null;
  lowerTargetSlopeDbPerOct: number | null;
  upperTargetSlopeDbPerOct: number | null;
  /** Whether a measured curve was handed to the natural-slope fit of A5d.3(i). */
  lowerCurveGiven: boolean;
  upperCurveGiven: boolean;
}

export interface RunExportField {
  mode: FieldMode;
  settings: {
    chainBudget: number | null;
    minSpacingOctaves: number;
    positionPolicy?: PositionPolicy;
    alignmentPolicy?: AlignmentPolicy;
    alignments: Alignment[];
    /** The designer's "steps per axis", which the full mode raises to the number of pairs. */
    stepsPerAxis: number;
    /**
     * U-5 — the crossings the DESIGNER stated, one list per handover.
     *
     * PRESENT ONLY WHEN ANY WERE STATED, so a run without them exports exactly
     * as it did before U-5 and every recorded block still replays. It has to be
     * in the block for the same reason the two E-2 policies are: layer 1 of the
     * replay rebuilds the field FROM THE BLOCK ALONE, and a field it cannot
     * rebuild is a block that does not carry what the field depended on — which
     * is the one thing layer 1 exists to prove.
     */
    statedPerAxisHz?: number[][];
    /** U-5 — when they stated them; the attribution each stated candidate carries. */
    statedOn?: string;
  };
  perPair: ExportedPerPair[];
  /** The window inputs the field stood on — the report's `predesign.windowInputs`. */
  windowInputs: XoWindowInput[];
  /** The order derivation per pair, as the field read it. */
  orders: PairOrderResult[];
  referenceCrossingHz: (number | null)[];
  candidates: ExportedCandidate[];
  parameters: CandidateField['parameters'];
  refusals: string[];
  /** `stableJson(candidateFieldKey(field))` — what the stamp's `choices` component hashes. */
  key: string;
}

export interface RunExportRun {
  gates: GateSettings;
  budgets: BudgetSettings;
  determinism: DeterminismSettings;
  targetCurve?: TargetCurve;
  judgeBandHz?: [number, number];
  amplifierPowerW?: number;
  chainDeclaration: ChainChoiceDeclaration;
  /** The tuning-key ingredients (phase priority, staged targets, band, snap, slopes). */
  tuning: Record<string, unknown>;
  /** The three key strings the stamp hashed, as digests — the stamp names them; this repeats them beside the block. */
  keys: { design: string; measurement: string; tuning: string; candidateField: string };
}

/** `ReportSettings` without the one function-valued field. */
export type ExportedReportSettings = Omit<ReportSettings, 'programmeWeight'>;

export interface RunExport {
  format: typeof RUN_EXPORT_FORMAT;
  exportedAt: string;
  engine: { version: string; label: string };
  session: string;
  drivers: {
    idsByRole: Partial<Record<'low' | 'mid' | 'high', string>>;
    files: { driver: string; kind: string; file: string; angleDeg?: number }[];
  };
  reportSettings: ExportedReportSettings;
  /**
   * The cabinet geometry the report was built with (vertical positions,
   * array spacing and count, symmetry, baffle width), keyed by ROLE as the
   * app holds it — what the adapter turns into centre-to-centre spacings and
   * source positions. Optional: an export written before it was carried lacks
   * it, and a replay then says which geometry it used instead.
   */
  geometry?: AdapterGeometry;
  field: RunExportField;
  run: RunExportRun;
  /** Null until the run has ended. */
  stamp: V2RunStamp | null;
  shortlist: {
    fingerprint: string;
    feasibleCount: number;
    consideredCount: number;
    rows: string[];
    rejected: { label: string; kinds: string[] }[];
  } | null;
}

/* ------------------------------------------------------------------ *
 * Building the block
 * ------------------------------------------------------------------ */

/** The candidates of a field in the exported shape. */
export function exportedCandidates(field: CandidateField): ExportedCandidate[] {
  return field.candidates.map((c) => ({
    label: c.label,
    crossings: c.crossings.map((x) => ({
      pair: x.pairLabel,
      lower: x.lower,
      upper: x.upper,
      hz: x.hz,
      cage: [x.cageHz[0], x.cageHz[1]],
      order: x.order,
      alignment: `${x.alignment.kind}${x.alignment.order}`,
      window: [x.windowHz[0], x.windowHz[1]],
    })),
  }));
}

/** The per-pair inputs in the exported shape: everything but the curves, which are flagged. */
export function exportedPerPair(windowInputs: readonly XoWindowInput[], perPair: readonly PairDerivationInput[]): ExportedPerPair[] {
  return windowInputs.map((wi, i) => {
    const p = perPair[i] ?? {};
    return {
      pair: `${wi.lower}→${wi.upper}`,
      statedOrder: p.statedOrder ?? null,
      maxDriveOnFsDb: p.maxDriveOnFsDb ?? null,
      breakupSuppressionDb: p.breakupSuppressionDb ?? null,
      lowerTargetSlopeDbPerOct: p.lowerTargetSlopeDbPerOct ?? null,
      upperTargetSlopeDbPerOct: p.upperTargetSlopeDbPerOct ?? null,
      lowerCurveGiven: !!p.lowerCurve,
      upperCurveGiven: !!p.upperCurve,
    };
  });
}

export function buildFieldExport(
  result: CandidateFieldResult,
  windowInputs: readonly XoWindowInput[],
  perPair: readonly PairDerivationInput[],
  settings: RunExportField['settings'],
): RunExportField {
  const field = result.field;
  return {
    mode: fieldModeOfParameters(field.parameters),
    settings: {
      chainBudget: settings.chainBudget,
      minSpacingOctaves: settings.minSpacingOctaves,
      ...(settings.positionPolicy !== undefined ? { positionPolicy: settings.positionPolicy } : {}),
      ...(settings.alignmentPolicy !== undefined ? { alignmentPolicy: settings.alignmentPolicy } : {}),
      alignments: settings.alignments.map((a) => ({ kind: a.kind, order: a.order })),
      stepsPerAxis: settings.stepsPerAxis,
      ...(settings.statedPerAxisHz !== undefined
        ? { statedPerAxisHz: settings.statedPerAxisHz.map((a) => [...a]) }
        : {}),
      ...(settings.statedOn !== undefined ? { statedOn: settings.statedOn } : {}),
    },
    perPair: exportedPerPair(windowInputs, perPair),
    windowInputs: windowInputs.map((w) => ({ ...w })),
    orders: result.orders,
    referenceCrossingHz: result.referenceCrossingHz,
    candidates: exportedCandidates(field),
    parameters: { ...field.parameters },
    refusals: [...field.refusals],
    key: stableJson(candidateFieldKey(field)),
  };
}

/** The engine mark every export carries. */
export const runExportEngine = (): RunExport['engine'] => ({ version: ENGINE_V2_VERSION, label: ENGINE_V2_LABEL });

/* ------------------------------------------------------------------ *
 * Replaying the block
 * ------------------------------------------------------------------ */

/**
 * Layer 1 — the field from the export alone.
 *
 * The generator re-run on the exported window inputs and order derivations
 * with the exported settings. Pure, so it reproduces exactly; what it proves
 * is that the block carries everything the field depended on.
 */
export function replayField(exp: RunExport): CandidateField {
  const f = exp.field;
  const pairs = f.windowInputs.map((windowInput, i) => ({
    windowInput,
    orders: f.orders[i],
    statedOrder: f.perPair[i]?.statedOrder ?? null,
  }));
  const derived = generateCandidates(pairs, {
    alignments: f.settings.alignments,
    ...(f.settings.chainBudget !== null ? { chainBudget: f.settings.chainBudget } : {}),
    minSpacingOctaves: f.settings.minSpacingOctaves,
    ...(f.settings.positionPolicy !== undefined ? { positionPolicy: f.settings.positionPolicy } : {}),
    ...(f.settings.alignmentPolicy !== undefined ? { alignmentPolicy: f.settings.alignmentPolicy } : {}),
  });
  /* U-5 — and the STATED half, appended exactly as `buildCandidateField` does.
   * Not a second implementation of the merge: both call `statedCandidates` on
   * the same pairs with the same spacing, and the block carries the positions
   * and the date so the replay can reach the same candidates. Absent = the
   * derived field, byte for byte. */
  const statedIn = f.settings.statedPerAxisHz;
  if (!statedIn || statedIn.length !== pairs.length || statedIn.some((a) => a.length === 0)) {
    return derived;
  }
  const stated = statedCandidates(pairs, statedIn, {
    alignments: f.settings.alignments,
    ...(f.settings.alignmentPolicy !== undefined ? { alignmentPolicy: f.settings.alignmentPolicy } : {}),
    spacingOctaves: f.settings.minSpacingOctaves,
    statedOn: f.settings.statedOn ?? 'date not recorded',
  });
  if (stated.candidates.length === 0) return derived;
  return {
    ...derived,
    candidates: [...derived.candidates, ...stated.candidates],
    refusals: [...derived.refusals, ...stated.refusals],
    notes: [...derived.notes, ...stated.notes],
    parameters: { ...derived.parameters, statedSize: stated.candidates.length },
  };
}

/** The stamp's `choices` component value for a field — `digest` of the field key, as the stamp computes it. */
export const fieldChoicesDigest = (field: CandidateField): string => digest(stableJson(candidateFieldKey(field)));

export interface CandidateComparison {
  same: boolean;
  /** Labels in the export that the replay did not produce. */
  missing: string[];
  /** Labels the replay produced that the export does not hold. */
  extra: string[];
  /** Labels present on both sides whose crossings differ, with what differs. */
  changed: { label: string; what: string[] }[];
  /** Labels present on both sides and identical in every field. */
  matched: string[];
}

/** Candidate by candidate: labels, positions, cages, orders, alignments, windows. */
export function compareCandidates(want: readonly ExportedCandidate[], got: readonly ExportedCandidate[]): CandidateComparison {
  const byLabel = new Map(got.map((c) => [c.label, c]));
  const missing: string[] = [];
  const changed: CandidateComparison['changed'] = [];
  const matched: string[] = [];
  for (const w of want) {
    const g = byLabel.get(w.label);
    if (!g) {
      missing.push(w.label);
      continue;
    }
    const what: string[] = [];
    if (w.crossings.length !== g.crossings.length) what.push(`${w.crossings.length} vs ${g.crossings.length} crossings`);
    w.crossings.forEach((x, i) => {
      const y = g.crossings[i];
      if (!y) return;
      for (const k of ['pair', 'hz', 'order', 'alignment'] as const) {
        if (x[k] !== y[k]) what.push(`${x.pair} ${k}: ${x[k]} vs ${y[k]}`);
      }
      for (const k of ['cage', 'window'] as const) {
        if (x[k][0] !== y[k][0] || x[k][1] !== y[k][1]) what.push(`${x.pair} ${k}: ${x[k].join('–')} vs ${y[k].join('–')}`);
      }
    });
    if (what.length) changed.push({ label: w.label, what });
    else matched.push(w.label);
  }
  const wanted = new Set(want.map((c) => c.label));
  const extra = got.filter((c) => !wanted.has(c.label)).map((c) => c.label);
  return { same: missing.length === 0 && extra.length === 0 && changed.length === 0, missing, extra, changed, matched };
}

/**
 * Where two sets of window inputs differ, field by field and pair by pair —
 * the diagnosis that goes with a candidate mismatch in layer 2.
 */
export function compareWindowInputs(want: readonly XoWindowInput[], got: readonly XoWindowInput[]): string[] {
  const out: string[] = [];
  if (want.length !== got.length) out.push(`${want.length} vs ${got.length} pairs`);
  const n = Math.min(want.length, got.length);
  for (let i = 0; i < n; i++) {
    const a = want[i] as unknown as Record<string, unknown>;
    const b = got[i] as unknown as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      const sa = stableJson(a[k] ?? null);
      const sb = stableJson(b[k] ?? null);
      if (sa !== sb) out.push(`${a.lower}→${a.upper} ${k}: ${sa} vs ${sb}`);
    }
  }
  return out;
}
