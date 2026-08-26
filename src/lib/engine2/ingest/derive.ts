/**
 * A5.2 — THE DERIVATION PASS, and A5.4/A5e.5 — its cache.
 *
 * One entry point: give it a manifest and the parsed files, get back every
 * derived parameter each metric needs, each one carrying the validity interval
 * it was derived on and the version of the extractor that produced it.
 *
 * WHAT MAKES THIS RE-RUNNABLE RATHER THAN A ONE-OFF (A5.4). Replace a
 * measurement and the pass runs again; the RULES do not change, only the
 * numbers they derive. That is why nothing in here is allowed to remember a
 * frequency: a band that came out of the previous measurement set would
 * survive the replacement and quietly describe a speaker that no longer
 * exists.
 *
 * THE CACHE KEY IS THE VERSION TABLE (A5e.5). `estimatorFingerprint()` is part
 * of every key, so bumping any extractor's version invalidates every cached
 * derivation in one step. The alternative — invalidating by hand — is how a
 * V8 fix becomes a silent behaviour change.
 *
 * A5e IS NOT BEING DECIDED HERE. Aggregation, the target curve, the catalog
 * schema and the determinism policy stay open; where this pass would otherwise
 * have to assume one, it stops and says so.
 */

import { estimatorFingerprint } from '../version.ts';
import { interpLog, octaveTrend } from '../util.ts';
import type { Manifest, ManifestEntry } from './manifest.ts';
import { manifestDrivers } from './manifest.ts';
import {
  fitSemiInductance,
  resolveRe,
  scanImpedanceRipple,
  type ImpedanceClassification,
  type ImpedanceCurve,
  type ReEstimate,
  type SemiInductance,
  type ZRipple,
} from './impedance.ts';
import {
  combineAtAngle,
  directionalPersistence,
  directivityFromPair,
  passbandLevel,
  scanBreakups,
  scanDiffraction,
  scanGrid,
  type BreakupScan,
  type DiffractionScan,
  type DirectivityPair,
  type PassbandLevel,
  type Persistence,
  type SplCurve,
} from './spl.ts';
import {
  fitBaffleStep,
  intersectIntervals,
  keeleCeilingHz,
  validityOf,
  type BaffleStepFit,
  type ValidityInterval,
} from './validity.ts';

/** One parsed measurement, paired with the manifest entry that describes it. */
export interface MeasurementFile {
  entry: ManifestEntry;
  /** Set when `entry.kind === 'Z'`. */
  impedance?: ImpedanceCurve;
  /** Set for every response kind (NF / FF / GP). */
  response?: SplCurve;
}

/** Everything derived at one observation angle of one driver. */
export interface DerivedAngle {
  angleDeg: number;
  /** The files that were summed to make this response. */
  sources: string[];
  /** Band the sum could be evaluated on (intersection of the sources). */
  bandHz: [number, number];
  /** Why that band — which file clipped which edge. */
  bandReason: { low: string; high: string };
  /**
   * FALSE when NO detector could establish a floor and the band's bottom is
   * simply where the sweep starts.
   *
   * The distinction matters more than it looks. "Valid from 21 Hz" and "valid
   * from wherever this file happens to begin, because the header carried no
   * window fields" are different claims, and only the first is one this app is
   * entitled to make. Consumers must show which one they are looking at.
   */
  bandFloorKnown: boolean;
  /**
   * WHERE that floor came from (F3b): a file header, window metadata the
   * designer entered, the advisory FF/NF detector, or nowhere at all.
   *
   * `bandFloorKnown` answers "is there a floor"; this answers "whose floor is
   * it", and the two are different questions the moment a number can be typed.
   * A5d.4's anchored-gap block reads it: a way whose LEVEL was averaged over a
   * band with no derived floor is carrying a number whose bottom edge is an
   * accident of where a sweep starts, and that block turned an anchor around
   * once without anyone being able to see it from the block itself.
   */
  bandFloorProvenance: ValidityInterval['floorProvenance'];
  /** Lowest frequency at which fine structure may be believed (2/T). */
  fineDetailFromHz: number | null;
  grid: number[];
  db: number[];
  /**
   * UNWRAPPED phase of the same complex sum, degrees. Carried rather than
   * recomputed: the sum is where the phase came from, and a consumer that
   * rebuilt it from the dB alone would be inventing a minimum-phase response
   * for a driver that is not one.
   */
  phaseDeg: number[];
  /** Residual against the fractional-octave trend, dB. */
  residualDb: number[];
}

/**
 * The same complex sum WITHOUT the validity clip.
 *
 * Two different questions need two different bands, and conflating them was
 * wrong in both directions. A SCAN (breakup, ripple, level) must never look
 * outside the validity limits - that is A5b.1 and V8c. But WHERE TWO BRANCHES
 * CROSS is a property of the design, not a measurement claim: clipping the
 * data first does not make the handover move, it only makes the app compute a
 * different number and call it the crossover. So the crossing, the summed
 * response and the phase tracking are derived on everything the files hold,
 * and the report says out loud when a handover lands below the validity floor.
 */
export interface DerivedAngleFull {
  grid: number[];
  db: number[];
  phaseDeg: number[];
  /** The raw extent the files share, Hz. */
  extentHz: [number, number];
}

export interface DerivedDriver {
  driver: string;
  /* --- impedance (A5c) --- */
  re: ReEstimate | null;
  impedance: ImpedanceClassification | null;
  semiInductance: SemiInductance | null;
  impedanceRipple: ZRipple | null;
  /* --- responses (A5b) --- */
  angles: DerivedAngle[];
  /** The on-axis (smallest tagged angle) far-field derivation, if any. */
  onAxis: DerivedAngle | null;
  /** The same sum over the files' full extent - see `DerivedAngleFull`. */
  onAxisFull: DerivedAngleFull | null;
  nearField: DerivedAngle | null;
  /** Near-field validity ceiling (Keele), Hz — null without a tagged diameter. */
  nearFieldCeilingHz: number | null;
  breakups: BreakupScan | null;
  persistence: Persistence[];
  directivity: DirectivityPair[];
  diffraction: DiffractionScan | null;
  level: PassbandLevel | null;
  baffleStep: BaffleStepFit | null;
  /* --- bookkeeping --- */
  validity: { file: string; interval: ValidityInterval }[];
  notes: string[];
}

export interface IngestResult {
  sessionId: string;
  /** The estimator version table this derivation was made with. */
  fingerprint: string;
  drivers: DerivedDriver[];
  /** Anything that stopped a derivation, addressed to the designer. */
  problems: string[];
}

const extentOf = (f: readonly number[]): [number, number] => [f[0], f[f.length - 1]];

function freqOf(file: MeasurementFile): readonly number[] | null {
  if (file.impedance) return file.impedance.freq;
  if (file.response) return file.response.freq;
  return null;
}

/**
 * Run the derivation pass.
 *
 * The scan settings are threaded through as options rather than read from a
 * global: an extractor's settings are part of what produced a number, and a
 * number whose settings are invisible cannot be reproduced.
 */
/**
 * Settings the derivation pass reads.
 *
 * Every field optional, and absent means the extractor's own documented
 * behaviour — never a project number smuggled in through a default (P6/P4).
 */
export interface IngestOptions {
  trendOctaveFraction?: number;
  breakupMinDb?: number;
  mergeOctaves?: number;
  /**
   * DC resistances the designer measured, per driver id.
   *
   * It enters HERE rather than at the metric that reads it, because R_e is not
   * one metric's input: the alignment, the loss indicator, the voice-coil fit,
   * M-E and the Q_es inversion all hang off it. Supplied at the pass, every
   * one of them moves together; supplied at a metric, they disagree.
   */
  reOhmByDriver?: Record<string, number>;
  /** Quality limits the motional R_e fit may refuse on (A5c.1). */
  reFitMaxRelativeResidual?: number;
  reFitMaxBandSensitivityFraction?: number;
}

export function runIngest(
  manifest: Manifest,
  files: readonly MeasurementFile[],
  opts: IngestOptions = {},
): IngestResult {
  const problems: string[] = [];
  const byName = new Map(files.map((f) => [f.entry.file, f]));

  /**
   * The manifest entry as the LOADER left it.
   *
   * A header can only be parsed once the file has been read, so a loader that
   * tags first and parses later ends up with the window fields on the file's
   * copy of the entry and not on the manifest's. Reading through this helper
   * makes the two the same entry again — and it matters more than it looks:
   * without the header there is no gate floor, and without a gate floor every
   * band silently widens to the whole sweep.
   */
  const tagged = (e: ManifestEntry): ManifestEntry => {
    const f = byName.get(e.file);
    return f && f.entry.header && !e.header ? { ...e, header: f.entry.header } : e;
  };

  // ---- Pass 1: validity per file (far field gets a second look once the
  // advisory FF/NF detector has run, below).
  const validity = new Map<string, ValidityInterval>();
  for (const entry of manifest.entries) {
    const f = byName.get(entry.file);
    const freq = f ? freqOf(f) : null;
    if (!f || !freq) {
      problems.push(`${entry.file}: tagged in the manifest but not loaded - skipped.`);
      continue;
    }
    validity.set(entry.file, validityOf({ entry: tagged(entry), extent: extentOf(freq) }));
  }

  const drivers: DerivedDriver[] = [];
  for (const driver of manifestDrivers(manifest)) {
    const entries = manifest.entries.filter((e) => e.driver === driver);
    const notes: string[] = [];

    /* ---------------- impedance ---------------- */
    let re: ReEstimate | null = null;
    let cls: ImpedanceClassification | null = null;
    let semi: SemiInductance | null = null;
    let zRipple: ZRipple | null = null;
    const zEntry = entries.find((e) => e.kind === 'Z');
    const zCurve = zEntry ? byName.get(zEntry.file)?.impedance : undefined;
    if (zCurve) {
      /* R_e AND THE ALIGNMENT, resolved together to a FIXED DEPTH.
       *
       * The classify -> fit -> reclassify loop lives in `resolveRe`, in one
       * place, with its pass counter incremented at the call. It is here as a
       * single call rather than as three steps inline because a depth is only
       * fixed if there is exactly one piece of code that can change it. */
      const entered = opts.reOhmByDriver?.[driver];
      const resolved = resolveRe(zCurve, {
        ...(entered !== undefined ? { enteredOhm: entered } : {}),
        ...(opts.reFitMaxRelativeResidual !== undefined
          ? { maxRelativeResidual: opts.reFitMaxRelativeResidual }
          : {}),
        ...(opts.reFitMaxBandSensitivityFraction !== undefined
          ? { maxBandSensitivityFraction: opts.reFitMaxBandSensitivityFraction }
          : {}),
      });
      re = resolved.re;
      cls = resolved.classification;
      semi = fitSemiInductance(zCurve, re.ohm, cls.fundamentalHz);
      zRipple = scanImpedanceRipple(zCurve, { octaveFraction: opts.trendOctaveFraction });
      if (re.motionalProximityWarning) notes.push(re.motionalProximityWarning);
      if (re.reclassificationShift) notes.push(re.reclassificationShift);
      if (semi && !semi.valid) notes.push(`Voice-coil model: ${semi.reason}`);
    } else {
      notes.push(
        'No impedance measurement tagged for this driver - R_e, the resonances and everything ' +
          'derived from them stay unavailable.',
      );
    }

    /* ---------------- responses, grouped per angle ---------------- */
    const responseEntries = entries.filter((e) => e.kind !== 'Z');

    const buildAngle = (
      group: ManifestEntry[],
      angleDeg: number,
      clipToValidity = true,
    ): DerivedAngle | null => {
      const curves: SplCurve[] = [];
      const names: string[] = [];
      for (const e of group) {
        const r = byName.get(e.file)?.response;
        if (!r) continue;
        curves.push(r);
        names.push(e.file);
      }
      if (curves.length === 0) return null;
      const limits = intersectIntervals(
        group
          .filter((e) => validity.has(e.file))
          .map((e) => ({ name: e.file, interval: validity.get(e.file)! })),
      );
      // The band is the intersection of the validity intervals AND of the raw
      // extents - a file cannot be believed outside the frequencies it holds.
      let lo = clipToValidity ? limits.fromHz ?? -Infinity : -Infinity;
      let hi = clipToValidity ? limits.toHz ?? Infinity : Infinity;
      for (const c of curves) {
        lo = Math.max(lo, c.freq[0]);
        hi = Math.min(hi, c.freq[c.freq.length - 1]);
      }
      if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
      const grid = scanGrid([lo, hi]);
      const summed = combineAtAngle(curves, grid);
      if (!summed) return null;
      const trend = octaveTrend(grid, summed.db, opts.trendOctaveFraction);
      const fine = group
        .map((e) => validity.get(e.file)?.fineDetailFromHz ?? null)
        .reduce<number | null>((a, b) => (b === null ? a : a === null ? b : Math.max(a, b)), null);
      return {
        angleDeg,
        sources: names,
        bandHz: [lo, hi],
        bandReason: { low: limits.fromBy, high: limits.toBy },
        bandFloorKnown: clipToValidity && limits.fromHz !== null,
        bandFloorProvenance: clipToValidity ? limits.fromProvenance : 'none',
        fineDetailFromHz: fine,
        grid,
        db: summed.db,
        phaseDeg: summed.phaseDeg,
        residualDb: summed.db.map((v, i) => v - trend[i]),
      };
    };

    const angleKeys = [
      ...new Set(responseEntries.filter((e) => e.kind !== 'NF').map((e) => e.angleDeg ?? 0)),
    ].sort((a, b) => a - b);
    const groupAt = (a: number) =>
      responseEntries.filter((e) => e.kind !== 'NF' && (e.angleDeg ?? 0) === a);
    const nfGroup = responseEntries.filter((e) => e.kind === 'NF');

    /* -------- FF/NF baffle-step test (advisory), then a SECOND pass --------
     *
     * The rank order of A5b.1 is max(header floor, model detector), and the
     * model detector cannot run until the two sums exist - which need a band.
     * So the sums are built once on the header floor alone, the advisory test
     * runs on them, the validity map is updated, and everything below is built
     * AGAIN on the final intervals.
     *
     * The second pass is not tidiness. Without it the band a scan runs on and
     * the interval the report prints beside it come from different versions of
     * the same map, and the panel ends up quoting a floor the numbers were
     * never computed at.
     */
    const nearFieldFirst = nfGroup.length ? buildAngle(nfGroup, 0) : null;
    const onAxisFirst = angleKeys.length ? buildAngle(groupAt(angleKeys[0]), angleKeys[0]) : null;
    let baffle: BaffleStepFit | null = null;
    if (onAxisFirst && nearFieldFirst) {
      const lo = Math.max(onAxisFirst.bandHz[0], nearFieldFirst.bandHz[0]);
      const hi = Math.min(onAxisFirst.bandHz[1], nearFieldFirst.bandHz[1]);
      if (hi > lo) {
        baffle = fitBaffleStep(
          onAxisFirst.grid,
          onAxisFirst.db,
          nearFieldFirst.grid,
          nearFieldFirst.db,
          [lo, hi],
        );
        if (baffle === null) {
          notes.push(
            `FF/NF overlap ${lo.toFixed(0)}-${hi.toFixed(0)} Hz holds too few points to fit a ` +
              'baffle-step model - the advisory validity detector stays off (A5b.1ii).',
          );
        }
      } else {
        notes.push(
          'Far field and near field have no common valid band: the near-field ceiling sits below ' +
            'the far-field gate floor, so the FF/NF cross-check cannot run.',
        );
      }
      for (const e of entries.filter((x) => x.kind === 'FF' || x.kind === 'GP')) {
        const freq = byName.get(e.file) ? freqOf(byName.get(e.file)!) : null;
        if (!freq) continue;
        validity.set(e.file, validityOf({ entry: tagged(e), extent: extentOf(freq), ffnf: baffle }));
      }
    }

    const angles: DerivedAngle[] = [];
    for (const a of angleKeys) {
      const group = groupAt(a);
      const d = buildAngle(group, a);
      if (d) angles.push(d);
      else if (group.length > 0) {
        problems.push(
          `${driver} at ${a} deg: the tagged files have no common valid band - nothing derived there.`,
        );
      }
    }

    const nearField = nfGroup.length ? buildAngle(nfGroup, 0) : null;
    // KEELE's ceiling, not the near-field file's last sample. Without a tagged
    // diameter there IS no ceiling, and reporting the end of the sweep instead
    // would read as a derived limit while being nothing of the kind.
    const nfCeiling = nfGroup.length ? keeleCeilingHz(nfGroup[0].diameterInch) : null;
    const onAxis = angles.length ? angles[0] : null;
    const unclipped = angleKeys.length ? buildAngle(groupAt(angleKeys[0]), angleKeys[0], false) : null;
    const onAxisFull: DerivedAngleFull | null = unclipped
      ? {
          grid: unclipped.grid,
          db: unclipped.db,
          phaseDeg: unclipped.phaseDeg,
          extentHz: unclipped.bandHz,
        }
      : null;

    /* ---------------- scans on the on-axis sum ---------------- */
    let breakups: BreakupScan | null = null;
    let diffraction: DiffractionScan | null = null;
    let level: PassbandLevel | null = null;
    let persistence: Persistence[] = [];
    const directivity: DirectivityPair[] = [];
    if (onAxis) {
      breakups = scanBreakups(onAxis.db, onAxis.grid, {
        octaveFraction: opts.trendOctaveFraction,
        minDb: opts.breakupMinDb,
        fineDetailFromHz: onAxis.fineDetailFromHz,
        mergeOctaves: opts.mergeOctaves,
      });
      diffraction = scanDiffraction(
        { freq: onAxis.grid, spl: onAxis.db, phaseDeg: onAxis.grid.map(() => 0) },
        onAxis.bandHz,
        { octaveFraction: opts.trendOctaveFraction },
      );
      level = passbandLevel(onAxis.db, onAxis.grid, onAxis.bandHz);

      for (const off of angles.slice(1)) {
        // Compare on the on-axis grid: the two sums may have different valid
        // bands, and the difference is only defined where both exist.
        const offOn = onAxis.grid.map((f) => interpLog(off.grid, off.db, f));
        directivity.push(
          directivityFromPair(onAxis.db, offOn, onAxis.grid, off.angleDeg, {
            octaveFraction: opts.trendOctaveFraction,
          }),
        );
        const offResid = onAxis.grid.map((f) => interpLog(off.grid, off.residualDb, f));
        persistence = persistence.concat(
          directionalPersistence(breakups.peaks, onAxis.grid, offResid, off.angleDeg),
        );
      }
    }

    drivers.push({
      driver,
      re,
      impedance: cls,
      semiInductance: semi,
      impedanceRipple: zRipple,
      angles,
      onAxis,
      onAxisFull,
      nearField,
      nearFieldCeilingHz: nfCeiling,
      breakups,
      persistence,
      directivity,
      diffraction,
      level,
      baffleStep: baffle,
      validity: entries
        .filter((e) => validity.has(e.file))
        .map((e) => ({ file: e.file, interval: validity.get(e.file)! })),
      notes,
    });
  }

  return { sessionId: manifest.sessionId, fingerprint: estimatorFingerprint(), drivers, problems };
}

/* ------------------------------------------------------------------ *
 * The derived-parameter cache (A5.2 / A5e.5)
 * ------------------------------------------------------------------ */

/**
 * Cache key for one derivation.
 *
 * `contentKey` is whatever the caller can cheaply say about the FILES (names
 * plus sizes, a hash, a session revision counter). The version fingerprint is
 * appended here rather than left to the caller, because forgetting it is
 * exactly the failure this whole mechanism exists to prevent.
 */
export function derivedCacheKey(sessionId: string, contentKey: string): string {
  return `${sessionId} ${contentKey} ${estimatorFingerprint()}`;
}

export class DerivedCache {
  private store = new Map<string, IngestResult>();

  get(sessionId: string, contentKey: string): IngestResult | undefined {
    return this.store.get(derivedCacheKey(sessionId, contentKey));
  }

  set(sessionId: string, contentKey: string, value: IngestResult): void {
    this.store.set(derivedCacheKey(sessionId, contentKey), value);
  }

  /** Entries whose fingerprint no longer matches the current version table. */
  stale(): string[] {
    const fp = estimatorFingerprint();
    return [...this.store.keys()].filter((k) => !k.endsWith(fp));
  }

  /**
   * Drop everything an extractor bump invalidated. Called on start-up rather
   * than trusted to happen: a stale derivation is indistinguishable from a
   * fresh one once it is in the map.
   */
  evictStale(): number {
    const gone = this.stale();
    for (const k of gone) this.store.delete(k);
    return gone.length;
  }

  get size(): number {
    return this.store.size;
  }
}
