/**
 * M-3 — CASUS 1's MID, RE-MERGED THROUGH THE APP'S OWN ROUTE.
 *
 * WHAT THIS REPAIRS, AND WHY IT IS ONLY THIS. I-2 measured that
 * `scripts/merge-casus1-mid.ts` (M-1) applied the step model's minimum phase as
 * `atan2(Im, Re)` of the LOG spectrum, where the minimum phase IS `Im`. The
 * quantity it computed runs from ~175 deg at 20 Hz to ~140 deg at 800 Hz where
 * the shelf's real minimum phase is 3.6-12.6 deg, so the merged file carries a
 * phase error that grows as you go down: 26.7 deg rms at 20-40 Hz, 14.2 at
 * 80-150, 1.9 at 300-500, and 0.00 above 800 Hz where the merge IS the far
 * field. The MAGNITUDE was never affected (I-2 measured 0.0005 dB worst, inside
 * the file's own 0.001 dB rounding), which is exactly why nothing caught it.
 *
 * `nfMerge.ts` — the module the app itself merges with since I-2 — calls the
 * project's own `minphase.ts`, which has always taken `Im`. So the repair is
 * not a new calculation: it is running casus 1's mid through the route that
 * already exists and that `nfMerge.test.ts` already pins.
 *
 * ONE FACTOR MOVES, AND THE CONSTANTS BELOW ARE WHY THEY ARE HERE RATHER THAN
 * DERIVED AFRESH. Splice band, step model and validity floor are M-1's, stated
 * again here with their provenance, and `assertM1ModelMatches` reads M-1's own
 * block back off disk and refuses if any of them has drifted. An arm that
 * changed the band while repairing the phase would measure both at once, and
 * this project has paid for that before.
 *
 * WHAT IS DELIBERATELY NOT REPAIRED:
 *
 *  - THE VALIDITY FLOOR STAYS AT M-1's STATED 60 Hz. The app's own
 *    `suggestValidFrom` would answer ~20.5 Hz for a sealed enclosure (the cone
 *    is the whole radiator, so the merge is honest as far as the near field
 *    reaches). That is a wider claim than M-1 was willing to make about these
 *    same files, and the files have not changed — only the arithmetic applied
 *    to one of them. Widening a validity floor is a decision about a
 *    MEASUREMENT; this session changes a phase. The derived alternative is
 *    printed by the writer so the difference is visible rather than lost.
 *
 *  - THE SPLICE BAND STAYS AT 500-800 Hz. M-2b moved the WOOFER's band to
 *    400-550 on measured grounds: 800 Hz reaches above 0.95 x ka = 1 for a
 *    255 cm2 cone (606 Hz), where a near field no longer represents the cone as
 *    one source. The mid is a 4-inch cone and its own Keele ceiling is 1107 Hz,
 *    so 500-800 lies entirely inside it and there is nothing to repair.
 *
 * THE M-1 FILE IS KEPT. `Koan_M_merged.frd` stays on disk and stays the mid of
 * set `'merged'` and of set `'koan677'`, which is what makes every reference
 * recorded before M-3 reproducible as a dated bridge. Same shape as M-2b: the
 * new file takes the old one's PLACE in a new set, and nothing is overwritten.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrd } from '../parsers/frd.ts';
import { parseTabular } from '../parsers/tabular.ts';
import { parseArtaHeader } from './ingest/manifest.ts';
import { DEFAULT_GATE_TAPER_ALPHA, dataFloorFromGateMs, readGateHeader } from '../xoWindow.ts';
import { baffleStepHz } from '../cabinet.ts';
import {
  mergeNearField,
  mergedFileName,
  renderMergedFrd,
  suggestValidFrom,
  type NfMergeResult,
} from '../nfMerge.ts';
import { CASUS1_DIR } from './koan2026_09.fixture.ts';

/** The gated far field of the mid — unchanged since 22-08-2026. */
export const MID_FAR_FILE = 'mid_hor_0.txt';
/** Its near field, in the sealed pod — unchanged since 22-08-2026. */
export const MID_NEAR_FILE = 'mid_near.txt';
/** M-1's merge of those same two files, kept as the dated bridge. */
export const MID_M1_FILE = 'Koan_M_merged.frd';
/** What M-3 writes, named by the app's own convention (`mergedFileName`). */
export const MID_M3_FILE = mergedFileName(MID_FAR_FILE);

/**
 * The splice band, M-1's, unchanged. 500 Hz is above the far field's own gate
 * floor (397 Hz) and 800 Hz is below the mid's Keele ceiling (1107 Hz), so
 * both halves are honest across it. See the header for why this is not moved.
 */
export const SPLICE_BAND_HZ: readonly [number, number] = [500, 800];

/**
 * Casus 1's baffle-step MODEL: first-order shelf, 6 dB at 440 Hz, applied as
 * minimum phase to the near-field half. Stated by Sander for the woofers
 * ("same baffle"), carried to the mid by M-1, unchanged here. It is a MODEL —
 * the teardrop shape was never measured — and `renderMergeBlock` prints what a
 * second-order shelf would have done differently beside it.
 */
export const STEP = { hz: 440, depthDb: 6 } as const;

/** Casus 1's measured baffle width, mm — the step's cross-check. */
export const CABINET_WIDTH_MM = 260;

/**
 * What the width ALONE would give, through the project's own `baffleStepHz`
 * (Elliott's 115/W): 442.3 Hz. It is a comment field in the block and nothing
 * computes with it.
 *
 * A FINDING, MEASURED AND NOT REPAIRED HERE: `koan2026_09.fixture.ts` (M-2)
 * answers the same question with `c / (pi * W)` = 419.9 Hz, and the two woofer
 * files of the current set carry that number while every other place in this
 * casebook — A5e.2's shelf corner, V45's anchor measurement, V51's plateau
 * check — carries 442. Those are two published formulas for one quantity, which
 * is the disagreement `baffleStepHz` warns about in its own doc comment; the
 * mid uses the project's function because that is the one answer the rest of
 * the engine reads. Reconciling the woofer blocks means rewriting files the
 * C-2 and M-2b corpora were recorded on, for a field nothing computes with, so
 * it is reported here and left alone.
 */
export const CABINET_STEP_HZ = baffleStepHz(CABINET_WIDTH_MM);

/**
 * The stated validity floor, M-1's, unchanged — see the header. The REASON is
 * carried forward from M-1's own block rather than recomputed: the argument is
 * about the near field's reach and raggedness, those files have not moved, and
 * a second implementation of "raggedness" here would be a second answer to a
 * question that already has one (A3g).
 */
export const VALID_FROM_HZ = 60;

/** The date `Merge status` carries in the written file. */
export const MADE_ON = '2026-09-16';

/**
 * UTF-8, and that is M-2's precedent rather than a new choice: the two 67.7 L
 * woofer merges are written that way by the same `renderMergedFrd`, whose first
 * prose line carries an em dash. Casus 1's own sources are pure ASCII with CRLF
 * endings (measured), so utf8 and latin1 agree on them; writing latin1 would
 * turn that em dash into a CONTROL CHARACTER, which is worse than the mojibake
 * `loadMeasurement`'s latin1 read already shows on the woofers.
 */
const read = (name: string): string => readFileSync(join(CASUS1_DIR, name), 'utf8');

/** M-1's header, as both parsers read it: the merge block plus its stated validity. */
export function m1MidHeader(): {
  block: NonNullable<ReturnType<typeof parseArtaHeader>['merge']>;
  validFromHz: number | null;
} {
  const header = parseArtaHeader(parseTabular(read(MID_M1_FILE)).comments);
  if (!header.merge) throw new Error(`${MID_M1_FILE}: no merge block — the dated bridge is gone`);
  return { block: header.merge, validFromHz: header.statedValidity?.fromHz ?? null };
}

/**
 * THE GUARD THAT KEEPS THIS AN ARM AND NOT A REWRITE: every constant above that
 * M-1 also stated must still read the same out of M-1's own file. Band, step
 * and floor are pinned; a drift in any of them means M-3 would be measuring two
 * changes at once and it refuses instead.
 */
export function assertM1ModelMatches(): { stepDepthDb: number; stepHz: number; bandHz: [number, number]; validFromHz: number } {
  const { block, validFromHz: stated } = m1MidHeader();
  const band = block.spliceBandHz;
  if (!band) throw new Error(`${MID_M1_FILE}: the block states no splice band`);
  const m = /shelf\s+(\d+(?:[.,]\d+)?)\s*dB\s*@\s*(\d+(?:[.,]\d+)?)/i.exec(block.stepModel ?? '');
  if (!m) throw new Error(`${MID_M1_FILE}: the block states no shelf`);
  const stepDepthDb = Number(m[1].replace(',', '.'));
  const stepHz = Number(m[2].replace(',', '.'));
  const validFromHz = stated ?? NaN;
  const same =
    stepDepthDb === STEP.depthDb &&
    stepHz === STEP.hz &&
    band[0] === SPLICE_BAND_HZ[0] &&
    band[1] === SPLICE_BAND_HZ[1] &&
    validFromHz === VALID_FROM_HZ;
  if (!same) {
    throw new Error(
      `${MID_M1_FILE} states shelf ${stepDepthDb} dB @ ${stepHz} Hz, band ${band[0]}-${band[1]} Hz, ` +
        `valid from ${validFromHz} Hz; M-3 repeats shelf ${STEP.depthDb} dB @ ${STEP.hz} Hz, band ` +
        `${SPLICE_BAND_HZ[0]}-${SPLICE_BAND_HZ[1]} Hz, valid from ${VALID_FROM_HZ} Hz. ` +
        `M-3 repairs the step model's PHASE and nothing else, so these must agree.`,
    );
  }
  return { stepDepthDb, stepHz, bandHz: [band[0], band[1]], validFromHz };
}

export interface MidM3Build {
  merge: NfMergeResult;
  /** The far field's own 1/T floor — what the block quotes beside the splice. */
  farFloorHz: number;
  validFromHz: number;
  validFromReason: string;
  /** What `suggestValidFrom` would answer for this sealed pod, for the record. */
  derivedValidFromHz: number | null;
  derivedValidFromReason: string;
  outFile: string;
  text: string;
}

/**
 * The merge itself. One implementation, two readers: the writer script and
 * `midM3.test.ts` (A3g) — the shape M-2 established for the woofers.
 */
export function buildM3MidMerge(): MidM3Build {
  assertM1ModelMatches();

  const farText = read(MID_FAR_FILE);
  const nearText = read(MID_NEAR_FILE);

  const gate = readGateHeader(farText);
  if (gate.kind !== 'parsed') {
    throw new Error(`${MID_FAR_FILE}: the header states no readable window (${gate.kind})`);
  }
  const farFloorHz = dataFloorFromGateMs(gate.gateMs, gate.alpha ?? DEFAULT_GATE_TAPER_ALPHA);
  if (farFloorHz === null) {
    throw new Error(`${MID_FAR_FILE}: window read (${gate.gateMs} ms) but no floor follows from it`);
  }

  const merge = mergeNearField({
    farText,
    farName: MID_FAR_FILE,
    nearText,
    nearName: MID_NEAR_FILE,
    /* No port: the mid sits in a SEALED pod. Nothing invented (P4). */
    spliceBandHz: [SPLICE_BAND_HZ[0], SPLICE_BAND_HZ[1]],
    step: { hz: STEP.hz, depthDb: STEP.depthDb },
    cabinetStepHz: CABINET_STEP_HZ,
  });
  if (merge === null) throw new Error('M-3: the mid merge produced nothing — one of the files does not parse');

  const near = parseFrd(nearText);
  const derived = suggestValidFrom({
    enclosure: 'sealed',
    boxTuneHz: null,
    portSummed: false,
    nearLowestHz: near.freq[0],
    gridLowestHz: merge.freq[0],
    farFloorHz,
  });

  /* THE FLOOR IS M-1's, STATED, AND THE FILE SAYS SO IN ITS OWN REASON — beside
   * what the app would have derived, so a reader can see the two and does not
   * have to take either on trust. */
  const validFromReason =
    `STATED, carried unchanged from ${MID_M1_FILE} (M-1) because M-3 re-merges the SAME two files and ` +
    `changes only the step model s phase: "${m1MidHeader().block.floorReason ?? 'no reason recorded'}". ` +
    `For the record, this app s own derivation for a sealed enclosure would answer ` +
    `${derived.hz === null ? 'nothing' : `${derived.hz.toFixed(1)} Hz`} — the cone is the whole radiator, so it ` +
    `reads the merge as honest as far as the near field reaches; the stated floor is the narrower claim and is kept.`;

  const text = renderMergedFrd({
    merge,
    farName: MID_FAR_FILE,
    nearName: MID_NEAR_FILE,
    spliceBandHz: SPLICE_BAND_HZ,
    step: { hz: STEP.hz, depthDb: STEP.depthDb },
    cabinetStepHz: CABINET_STEP_HZ,
    validFromHz: VALID_FROM_HZ,
    validFromReason,
    madeOn: MADE_ON,
    branchLabel: 'mid',
  });

  return {
    merge,
    farFloorHz,
    validFromHz: VALID_FROM_HZ,
    validFromReason,
    derivedValidFromHz: derived.hz,
    derivedValidFromReason: derived.reason,
    outFile: MID_M3_FILE,
    text,
  };
}

/* ------------------------------------------------------------------ *
 * The phase delta: what the repair actually moved
 * ------------------------------------------------------------------ */

/** The bands the delta is reported in — I-2's ruler, so the two are comparable. */
export const DELTA_BANDS: readonly (readonly [number, number])[] = Object.freeze([
  [20, 40],
  [40, 80],
  [80, 150],
  [150, 300],
  [300, 500],
  [500, 800],
  [800, 20000],
]);

export interface DeltaRow {
  from: number;
  to: number;
  n: number;
  dbRms: number;
  dbMax: number;
  degRms: number;
  degMax: number;
}

/**
 * Old against new, band by band, on the shared grid. Phase differences are
 * wrapped to (-180, 180] before they are squared: an unwrapped difference of
 * 359 deg is a difference of one.
 */
export function deltaBands(
  grid: readonly number[],
  a: { spl: readonly number[]; phase: readonly number[] },
  b: { spl: readonly number[]; phase: readonly number[] },
): DeltaRow[] {
  return DELTA_BANDS.map(([from, to]) => {
    let n = 0;
    let sd = 0;
    let mx = 0;
    let sp = 0;
    let mp = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < from || grid[i] > to) continue;
      const d = a.spl[i] - b.spl[i];
      let p = a.phase[i] - b.phase[i];
      p = ((((p + 180) % 360) + 360) % 360) - 180;
      n++;
      sd += d * d;
      mx = Math.max(mx, Math.abs(d));
      sp += p * p;
      mp = Math.max(mp, Math.abs(p));
    }
    return {
      from,
      to,
      n,
      dbRms: n ? Math.sqrt(sd / n) : 0,
      dbMax: mx,
      degRms: n ? Math.sqrt(sp / n) : 0,
      degMax: mp,
    };
  }).filter((r) => r.n > 0);
}

/** The M-1 mid as it sits on disk — the "before" half of every delta. */
export function m1MidResponse(): { freq: number[]; spl: number[]; phase: number[] } {
  const m = parseFrd(read(MID_M1_FILE));
  return { freq: m.freq, spl: m.spl, phase: m.phase };
}
