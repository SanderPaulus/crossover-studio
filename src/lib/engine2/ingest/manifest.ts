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
  /** Every header line, verbatim — the audit trail. */
  raw: string[];
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
      default:
        break;
    }
  }
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
