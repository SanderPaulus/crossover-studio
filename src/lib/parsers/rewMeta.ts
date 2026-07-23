import type { RewMetadata } from '../types.ts';

/**
 * Extract the metadata we care about from a REW export's comment lines.
 *
 * IMPORTANT: the exact wording of REW's header fields varies between versions,
 * and a plain FRD/ZMA text export does not always carry an explicit timing
 * value at all. So this extractor is deliberately conservative — it only claims
 * a `timingOffsetMs` when a comment line pairs a timing keyword with a value
 * *and* a time unit. When nothing is found, `timingOffsetMs` stays undefined
 * and the app must fall back to a user-entered value and/or the phase-derived
 * estimate in `timing.ts`. Either way, the sanity-check is the real safeguard;
 * this parser is only a convenience.
 */

const VERSION_RE = /REW\s+V?([\d]+(?:\.[\d]+)*)/i;

// A timing keyword, then anything, then a signed decimal, then a time unit.
// Keywords are ones REW actually uses around the impulse-response t=0 reference.
const TIMING_RE =
  /(t\s*=\s*0|timing|time\s+ref(?:erence)?|offset|delay)\b[^\-\d]*(-?\d+(?:\.\d+)?)\s*(ms|msec|milliseconds?|s|sec|seconds?|samples?)\b/i;

function toMilliseconds(value: number, unit: string): number | undefined {
  const u = unit.toLowerCase();
  if (u.startsWith('ms') || u.startsWith('mil')) return value;
  if (u === 's' || u.startsWith('sec')) return value * 1000;
  // "samples" needs a sample rate we don't reliably have here; skip rather than
  // guess. A caller that knows fs can convert separately.
  return undefined;
}

export function parseRewMetadata(comments: string[]): RewMetadata {
  const meta: RewMetadata = { rawComments: comments };

  for (const line of comments) {
    if (!meta.rewVersion) {
      const v = line.match(VERSION_RE);
      if (v) meta.rewVersion = v[1];
    }

    if (meta.timingOffsetMs === undefined) {
      const t = line.match(TIMING_RE);
      if (t) {
        const ms = toMilliseconds(Number(t[2]), t[3]);
        if (ms !== undefined) {
          meta.timingOffsetMs = ms;
          meta.timingOffsetSource = line;
        }
      }
    }
  }

  return meta;
}
