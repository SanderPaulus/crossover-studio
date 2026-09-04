/**
 * A5.1 — THE MANIFEST: what every measurement file IS.
 *
 * The whole of P6 rests on this one step. A rule that says "clip the breakup
 * scan on the validity limits" is only executable if the app knows that this
 * file is a gated far-field sweep of the mid at 30° and that one is a
 * near-field of the woofer — and it must know it for measurements that do not
 * exist yet, without a code change (A5, "Nieuwe metingen moeten door dezelfde
 * regels verwerkt worden").
 *
 * So the manifest is DATA, not a switch statement. A driver is a free string
 * (nothing here counts to three — N-way agnostic), a kind is one of four
 * measurement geometries, and everything else is optional context that
 * switches capabilities on when present.
 *
 * AUTO-DETECTION IS A PRE-FILL, NEVER A FACT. Header fields (window times,
 * reference time, sample rate) are read from the file and are authoritative,
 * because ARTA wrote them. Driver/kind/angle guessed from a FILE NAME are a
 * suggestion the user confirms — a filename is a human's note to themselves,
 * and silently trusting one is how a tweeter ends up analysed as a woofer.
 * `suggestTags` therefore returns suggestions with the evidence that produced
 * them, and `manifestFromSuggestions` marks every field it filled in.
 */

import { MS_PER_S } from '../constants.ts';

/**
 * Measurement geometry. These four are the ones A5.1 names; the set is closed
 * because each one implies a DIFFERENT validity rule (a near field has no gate
 * floor, a gated far field does, impedance has neither).
 */
export type MeasurementKind = 'Z' | 'NF' | 'FF' | 'GP';

export const MEASUREMENT_KIND_LABEL: Readonly<Record<MeasurementKind, string>> = {
  Z: 'impedance',
  NF: 'near field',
  FF: 'far field (gated)',
  GP: 'ground plane',
};

/**
 * The ARTA/LIMP export header, as far as we can read it.
 *
 * Every field is optional: a file that has passed through another tool may
 * carry none of them, and the correct response to that is a capability that
 * stays off with a stated reason, not an invented number.
 */
export interface ArtaHeader {
  sourceFile?: string;
  sampleRateHz?: number;
  impulseLength?: number;
  fftLength?: number;
  /** Left window edge, ms from the start of the impulse record. */
  leftWindowMs?: number;
  /** Right window edge, ms. */
  rightWindowMs?: number;
  /** The impulse's t=0 reference, ms. */
  referenceTimeMs?: number;
  /** Taper on the right flank, e.g. `{ kind: 'Tukey', alpha: 0.25 }`. */
  rightTaper?: { kind: string; alpha?: number };
  smoothing?: string;
  scaleType?: string;
  /**
   * THE NUMBER EVERYTHING ELSE HANGS ON (A5b.1i): the effective window length
   * T = right window − reference time, in ms. Not the nominal right window:
   * the reference time is where the impulse actually starts, so the response
   * was only observed for the difference.
   */
  effectiveWindowMs?: number;
  /**
   * M-1 — validity THE FILE ITSELF STATES (`Valid from = … Hz`, `Valid to =
   * … Hz`). Read for every file, HONOURED only on a declared merge (see
   * `merge`): on a gated far field the header window is the floor and
   * A5b.1(i) says nothing may relax it, so a stated number there is kept as
   * data and never becomes a floor.
   */
  statedValidity?: { fromHz?: number; toHz?: number };
  /**
   * M-1 — THE MERGE BLOCK of an NF/FF-merged response file. Present when the
   * header carries `Merge = …`; the fields beside it say what the file was
   * made of, so a reader can trace every number under the splice to the
   * near field and the step model it came from. A file that carries this
   * block is NOT a gated measurement below its splice, and `validity.ts`
   * takes a different path for it.
   */
  merge?: MergeBlock;
  /** Every header line, verbatim — the audit trail. */
  raw: string[];
}

/**
 * What an NF/FF-merged file says about itself (M-1). Every field except `kind`
 * is optional: a merge made by another tool may state only its validity, and
 * the right response to a missing field is a note, not a guess.
 */
export interface MergeBlock {
  /** `NF/FF` — the only kind so far; kept as a string so a later merge kind is data. */
  kind: string;
  nfSource?: string;
  ffSource?: string;
  /** The ARTA window of the FAR-FIELD half, above the splice: fine structure there from 2/T. */
  ffWindow?: { referenceTimeMs?: number; rightWindowMs?: number; effectiveWindowMs?: number };
  /** The band the splice was fitted and crossfaded in, Hz. */
  spliceBandHz?: [number, number];
  /** The level the near-field half was shifted by to meet the far field, dB. */
  spliceGainDb?: number;
  /** The pure delay fitted and removed from the near-field half, ms. */
  spliceDelayMs?: number;
  stepModel?: string;
  portModel?: string;
  prediction?: string;
  floorReason?: string;
  /** e.g. "PLACEHOLDER tot groundplane" — travels into every note downstream. */
  status?: string;
}

/** One tagged measurement file. */
export interface ManifestEntry {
  /** File name as loaded — the key everything else refers to. */
  file: string;
  /**
   * Which driver this measures. FREE STRING on purpose: 'woofer', 'mid',
   * 'tweeter', 'woofer_up', 'sub-left' are all fine, and nothing in engine2
   * ever enumerates them or counts them.
   */
  driver: string;
  kind: MeasurementKind;
  /** Off-axis angle in degrees; absent on Z and on untagged responses. */
  angleDeg?: number;
  /**
   * Effective radiating DIAMETER in inches — the only input Keele's near-field
   * ceiling needs. Absent = the ceiling cannot be computed and the near-field
   * capability says so instead of guessing a driver size.
   */
  diameterInch?: number;
  /** Microphone distance in mm (near field: the Keele 0.11·radius check). */
  micDistanceMm?: number;
  /** Drive voltage in volts, when documented. */
  driveVoltageV?: number;
  /** Parsed header, when the file carried one. */
  header?: ArtaHeader;
  /**
   * WINDOW METADATA THE DESIGNER TYPED (F3b, spec decision 2).
   *
   * A5b.1(i) makes the header floor the hard, automatic, binding limit — and
   * a file that has passed through another tool carries no header at all. The
   * app's answer used to be "the floor is UNKNOWN and everything that needs it
   * stays off", which is honest and useless: the designer usually knows the
   * gate, because they set it.
   *
   * SO THIS IS A FALLBACK, NEVER AN OVERRIDE. It applies only where the header
   * supplies nothing, and `floorProvenance` on the resulting interval says
   * which of the two spoke. A typed number that could silently replace a
   * measured one would put A5b.1's "nothing may relax this" in the hands of
   * whoever last edited a field.
   *
   * Two forms, because the designer may know either. Give the two times and
   * the app derives T exactly as it does from a header; or give the floor
   * itself, for a measurement whose window is only known through its result.
   */
  manualWindow?: {
    /** The impulse's t=0 reference, ms. */
    referenceTimeMs?: number;
    /** Right window edge, ms. */
    rightWindowMs?: number;
    /** The hard validity floor itself, Hz — the shortcut form. */
    validityFloorHz?: number;
    /** Where the designer got these numbers. Shown with the provenance. */
    note?: string;
  };
  /** Which fields were filled by auto-detection rather than typed. */
  autoDetected?: readonly (keyof ManifestEntry)[];
}

/** The manifest for one measurement session. */
export interface Manifest {
  /** Opaque id of the measurement session these files belong to (A5.2). */
  sessionId: string;
  entries: readonly ManifestEntry[];
}

/* ------------------------------------------------------------------ *
 * Header parsing
 * ------------------------------------------------------------------ */

/**
 * First number in a string, accepting `,` as a decimal separator.
 *
 * ARTA writes locale decimals: "Reference time = 2,5 ms" next to
 * "Tukey 0.25" in the same line. So a comma between digits is a decimal point
 * and everything else is punctuation.
 */
export function parseLooseNumber(text: string): number | undefined {
  const m = text.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return undefined;
  const v = Number(m[0].replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

const FIELD = /^([A-Za-z][A-Za-z .]*?)\s*=\s*(.+)$/;

/**
 * Read what we can from a measurement's comment lines.
 *
 * Matching is by FIELD NAME, case-insensitively, on lines of the form
 * `Name = value`. Unknown fields are ignored but kept in `raw` — an ARTA
 * version that renames something must not be able to make this throw.
 */
export function parseArtaHeader(comments: readonly string[]): ArtaHeader {
  const h: ArtaHeader = { raw: [...comments] };
  const merge: Partial<MergeBlock> = {};
  for (const line of comments) {
    const m = line.match(FIELD);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    switch (key) {
      case 'source file':
        h.sourceFile = value;
        break;
      case 'sample rate':
        h.sampleRateHz = parseLooseNumber(value);
        break;
      case 'impulse length':
        h.impulseLength = parseLooseNumber(value);
        break;
      case 'fft length':
        h.fftLength = parseLooseNumber(value);
        break;
      case 'left window':
        h.leftWindowMs = parseLooseNumber(value);
        break;
      case 'right window': {
        h.rightWindowMs = parseLooseNumber(value);
        // "5,021 ms, Tukey 0.25" holds BOTH kinds of comma in one line: a
        // locale decimal point and a field separator. Neutralise the decimal
        // ones first (a comma flanked by digits), and whatever commas are left
        // really are separators.
        const parts = value.replace(/(\d),(\d)/g, '$1.$2').split(',');
        const taper = parts.slice(1).find((p) => /[A-Za-z]/.test(p));
        if (taper) {
          const words = taper.trim().split(/\s+/);
          h.rightTaper = { kind: words[0], alpha: parseLooseNumber(words.slice(1).join(' ')) };
        }
        break;
      }
      case 'reference time':
        h.referenceTimeMs = parseLooseNumber(value);
        break;
      case 'smoothing':
        h.smoothing = value;
        break;
      case 'scale type':
        h.scaleType = value;
        break;
      /* ---- M-1: the stated validity and the merge block ---------------- *
       * Field names, not prose (UI-1): `Valid from = 20.5 Hz` is read, "geldig
       * vanaf 20,5 Hz" in a comment is not. The merge fields are collected
       * whether or not `Merge = …` itself has been seen yet — the block may
       * come in any order — and only kept when it has. */
      case 'valid from':
        h.statedValidity = { ...(h.statedValidity ?? {}), fromHz: parseLooseNumber(value) };
        break;
      case 'valid to':
        h.statedValidity = { ...(h.statedValidity ?? {}), toHz: parseLooseNumber(value) };
        break;
      case 'merge':
        merge.kind = value;
        break;
      case 'merge nf source':
        merge.nfSource = value;
        break;
      case 'merge ff source':
        merge.ffSource = value;
        break;
      case 'merge ff window': {
        const ref = value.match(/reference\s*(-?\d+(?:[.,]\d+)?)/i);
        const right = value.match(/right\s*(-?\d+(?:[.,]\d+)?)/i);
        const referenceTimeMs = ref ? parseLooseNumber(ref[1]) : undefined;
        const rightWindowMs = right ? parseLooseNumber(right[1]) : undefined;
        const t =
          referenceTimeMs !== undefined && rightWindowMs !== undefined ? rightWindowMs - referenceTimeMs : undefined;
        merge.ffWindow = {
          ...(referenceTimeMs !== undefined ? { referenceTimeMs } : {}),
          ...(rightWindowMs !== undefined ? { rightWindowMs } : {}),
          ...(t !== undefined && t > 0 ? { effectiveWindowMs: t } : {}),
        };
        break;
      }
      case 'merge splice band': {
        // Unsigned on purpose: "500-800 Hz" is a band, and its dash is not a minus.
        const nums = value.match(/\d+(?:[.,]\d+)?/g)?.map((s) => Number(s.replace(',', '.'))) ?? [];
        if (nums.length >= 2 && nums[0] > 0 && nums[1] > nums[0]) merge.spliceBandHz = [nums[0], nums[1]];
        break;
      }
      case 'merge splice fit': {
        const gain = value.match(/gain\s*(-?\d+(?:[.,]\d+)?)/i);
        const delay = value.match(/delay\s*(-?\d+(?:[.,]\d+)?)/i);
        if (gain) merge.spliceGainDb = parseLooseNumber(gain[1]);
        if (delay) merge.spliceDelayMs = parseLooseNumber(delay[1]);
        break;
      }
      case 'merge step model':
        merge.stepModel = value;
        break;
      case 'merge port model':
        merge.portModel = value;
        break;
      case 'merge prediction':
        merge.prediction = value;
        break;
      case 'merge floor reason':
        merge.floorReason = value;
        break;
      case 'merge status':
        merge.status = value;
        break;
      default:
        break;
    }
  }
  if (merge.kind !== undefined) h.merge = merge as MergeBlock;
  if (h.rightWindowMs !== undefined && h.referenceTimeMs !== undefined) {
    const t = h.rightWindowMs - h.referenceTimeMs;
    if (t > 0) h.effectiveWindowMs = t;
  }
  return h;
}

/** Effective window in seconds, or null when the header does not say. */
export function effectiveWindowSeconds(h: ArtaHeader | undefined): number | null {
  if (!h || h.effectiveWindowMs === undefined) return null;
  return h.effectiveWindowMs / MS_PER_S;
}

/** Where a window figure came from. The header always outranks the designer. */
export type WindowProvenance = 'header' | 'manual-window' | 'manual-floor';

export interface EffectiveWindow {
  /** Effective window length T, ms. Null for the manual-floor form. */
  windowMs: number | null;
  /** The hard floor this implies, Hz — set directly by the manual-floor form. */
  directFloorHz: number | null;
  provenance: WindowProvenance;
  /** One sentence, ready for the report. */
  describe: string;
}

/**
 * The effective window for one measurement, and WHO said so.
 *
 * Order is the whole content of this function: the header first, because ARTA
 * wrote it and A5b.1(i) says nothing may relax it; the designer's numbers only
 * where the header is silent. There is no branch in which a typed value
 * displaces a measured one.
 */
export function effectiveWindowOf(entry: ManifestEntry): EffectiveWindow | null {
  const fromHeader = entry.header?.effectiveWindowMs;
  if (fromHeader !== undefined && fromHeader > 0) {
    return {
      windowMs: fromHeader,
      directFloorHz: null,
      provenance: 'header',
      describe:
        `header window ${fromHeader.toFixed(3)} ms ` +
        `(${entry.header?.rightWindowMs} − ${entry.header?.referenceTimeMs})`,
    };
  }
  const m = entry.manualWindow;
  if (!m) return null;
  const note = m.note ? ` — ${m.note}` : '';
  if (m.referenceTimeMs !== undefined && m.rightWindowMs !== undefined) {
    const t = m.rightWindowMs - m.referenceTimeMs;
    if (t > 0) {
      return {
        windowMs: t,
        directFloorHz: null,
        provenance: 'manual-window',
        describe:
          `window ${t.toFixed(3)} ms entered by hand (${m.rightWindowMs} − ${m.referenceTimeMs}); ` +
          `this file's header carries no window fields${note}`,
      };
    }
  }
  if (m.validityFloorHz !== undefined && m.validityFloorHz > 0) {
    return {
      windowMs: null,
      directFloorHz: m.validityFloorHz,
      provenance: 'manual-floor',
      describe:
        `validity floor ${m.validityFloorHz.toFixed(0)} Hz entered by hand; this file's header ` +
        `carries no window fields${note}`,
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Tag suggestion (a pre-fill for the tag form — never a fact)
 * ------------------------------------------------------------------ */

export interface TagSuggestion {
  driver?: string;
  kind?: MeasurementKind;
  angleDeg?: number;
  /** Why — shown next to the pre-filled field so the user can check it. */
  evidence: string[];
}

/**
 * Suggest tags from a file name (and the header's `Source file`, which is the
 * same kind of evidence: a human's note).
 *
 * `knownDrivers` are the driver ids already in the manifest or the netlist —
 * matching against those instead of a built-in vocabulary is what keeps this
 * N-way agnostic and project-independent. With no known drivers the driver
 * suggestion is simply absent, and the user types it once.
 */
export function suggestTags(
  fileName: string,
  header?: ArtaHeader,
  knownDrivers: readonly string[] = [],
): TagSuggestion {
  const hay = `${fileName} ${header?.sourceFile ?? ''}`.toLowerCase();
  const evidence: string[] = [];
  const out: TagSuggestion = { evidence };

  const driver = knownDrivers
    .filter((d) => d.length > 0 && hay.includes(d.toLowerCase()))
    // Longest match wins: 'woofer_up' beats 'woofer' on "woofer_up_near.txt".
    .sort((a, b) => b.length - a.length)[0];
  if (driver) {
    out.driver = driver;
    evidence.push(`name contains "${driver}"`);
  }

  if (/\.lim$|\.zma$/i.test(fileName)) {
    out.kind = 'Z';
    evidence.push('impedance file extension');
  } else if (/near|\bnf\b/.test(hay)) {
    out.kind = 'NF';
    evidence.push('name says near field');
  } else if (/ground.?plane|\bgp\b/.test(hay)) {
    out.kind = 'GP';
    evidence.push('name says ground plane');
  } else if (/hor|ver|deg|axis|\bff\b/.test(hay)) {
    out.kind = 'FF';
    evidence.push('name says an axis/angle');
  }

  // An angle is only meaningful on a response; "hor_30" / "hor30" / "30deg".
  if (out.kind === 'FF' || out.kind === 'GP') {
    const a = hay.match(/(?:hor|ver|deg|axis)[_\s-]*(\d{1,3})|(\d{1,3})[_\s-]*deg/);
    const raw = a ? (a[1] ?? a[2]) : undefined;
    if (raw !== undefined) {
      out.angleDeg = Number(raw);
      evidence.push(`name carries an angle (${raw}°)`);
    }
  }

  if (header?.effectiveWindowMs !== undefined) {
    evidence.push(
      `header window ${header.effectiveWindowMs.toFixed(3)} ms ` +
        `(${header.rightWindowMs} − ${header.referenceTimeMs})`,
    );
  }
  return out;
}

/**
 * Build a manifest entry from a suggestion plus whatever the user supplied,
 * recording which fields came from the machine.
 *
 * The user's value always wins. That is not politeness — the suggestion is
 * derived from a filename, and the tag form exists precisely because filenames
 * lie.
 */
export function entryFromSuggestion(
  file: string,
  suggestion: TagSuggestion,
  user: Partial<ManifestEntry> & Pick<ManifestEntry, 'driver' | 'kind'>,
  header?: ArtaHeader,
): ManifestEntry {
  const auto: (keyof ManifestEntry)[] = [];
  if (user.driver === suggestion.driver && suggestion.driver !== undefined) auto.push('driver');
  if (user.kind === suggestion.kind && suggestion.kind !== undefined) auto.push('kind');
  if (user.angleDeg !== undefined && user.angleDeg === suggestion.angleDeg) auto.push('angleDeg');
  return { ...user, file, header, autoDetected: auto };
}

/** Every distinct driver id in the manifest, in first-seen order. */
export function manifestDrivers(m: Manifest): string[] {
  const seen: string[] = [];
  for (const e of m.entries) if (!seen.includes(e.driver)) seen.push(e.driver);
  return seen;
}

/** All entries for one driver. */
export function entriesFor(m: Manifest, driver: string): ManifestEntry[] {
  return m.entries.filter((e) => e.driver === driver);
}
