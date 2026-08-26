/**
 * A5d.3, THE COMPOSITION — the feasible window MINUS the worst lobing zone
 * (F3c, deliverable 1).
 *
 * `xoWindow.ts` derives the window and reports its preference zones side by
 * side, deliberately without resolving them: A5d.3 says conflicting zones are
 * shown rather than averaged away, because the conflict IS the design tension
 * of a driver combination. This module does the one composition that is not a
 * resolution — it subtracts the zone the field rules agree is bad.
 *
 * WHY SUBTRACTION IS ALLOWED WHERE AVERAGING IS NOT. The worst lobing zone is
 * not a preference among preferences: around half a wavelength of centre-to-
 * centre spacing the vertical response has a null in it, and no filter puts it
 * back. Removing that stretch from the recommendation states a fact about the
 * layout. Ranking the leftover stretches against each other would be a
 * different act entirely — a taste judgement with a number on it — and that is
 * A5e.1's parked decision, not ours. So ALL segments are shown, each with the
 * reasons its edges have, and the designer picks.
 *
 * NOTHING IS CLAMPED OR SKIPPED, here as everywhere on this surface. The
 * recommendation is a sentence and two field values behind a button; the scan
 * searches exactly what it was told, before and after.
 *
 * N-WAY BY CONSTRUCTION: it takes ONE window, which is one adjacent pair.
 * Nothing in it counts to two ways or to three.
 */

import {
  formatEdge,
  roundEdge,
  takeoverFor,
  windowEdges,
} from './xoRangeAdvice.ts';
import type { XoWindowResult, XoZone } from './xoWindow.ts';

/** Where one edge of a recommended segment came from. */
export type SegmentEdgeSource = 'window' | 'worst-zone';

export interface RecommendedSegment {
  /** The segment, at the same precision the window edges are printed at. */
  hz: [number, number];
  /** Provenance of the lower and the upper edge, in that order. */
  edgeFrom: [SegmentEdgeSource, SegmentEdgeSource];
  /**
   * Octaves between the segment's LOWER edge and f_s of the upper driver.
   *
   * The lower edge because that is the edge f_s threatens: a handover close
   * above a resonance asks the flank to attenuate where the driver is at its
   * least linear. Null when the upper driver's resonance is not known.
   */
  octavesAboveFs: number | null;
  /**
   * Octaves from the segment to the nearest FAVOURABLE lobing zone, 0 when it
   * overlaps one. Null when the layout implies no zones.
   */
  octavesToFavourable: number | null;
  /** The favourable zone that distance was measured to. */
  favourableHz: [number, number] | null;
  /** The sentence the dialog shows for this segment. */
  summary: string;
  /** The reasons its edges have, one sentence each — the sentence's tail. */
  reasons: string[];
  /** Field values that make `freq ± margin` this segment, exactly. */
  takeover: { freqHz: number; marginHz: number };
}

export interface RecommendedBandResult {
  /** The window it was carved out of, or null when there is none to carve. */
  windowHz: [number, number] | null;
  /** The zone that was subtracted, at printing precision. Null when none. */
  worstZoneHz: [number, number] | null;
  /** Zero, one or two segments. Empty means the zone covered the window. */
  segments: RecommendedSegment[];
  /** True when nothing survived the subtraction and the full window is offered. */
  fallback: boolean;
  /** The full window, offered on fallback. Null otherwise. */
  fallbackHz: [number, number] | null;
  /**
   * On fallback: the window edge furthest from 0.5·λ, in octaves — the least
   * bad place to hand over when every place is bad. Null otherwise.
   */
  leastBadEdgeHz: number | null;
  /**
   * What the recommendation EFFECTIVELY is: the segments, or the whole window
   * on fallback, or nothing when no window could be derived.
   *
   * The pre-start estimate counts against this rather than against `segments`,
   * and the difference is the fallback: a run counted against an empty segment
   * list would report every candidate as outside a band that does not exist.
   */
  effectiveHz: [number, number][];
  /**
   * Uncalibrated notes inherited from the limits that BIND the window.
   *
   * Inherited rather than restated: the band is a subset of a window whose
   * edges those limits set, so a recommendation drawn from an uncalibrated
   * ceiling is exactly as uncalibrated as the ceiling. Only the binding limits
   * travel — a non-binding limit shapes nothing, and copying its flag along
   * would turn the mark into decoration.
   */
  uncalibrated: string[];
  /** The line the dialog shows. Null when there is nothing to say. */
  message: string | null;
}

/** The label a good zone is printed under, and the range it covers. */
const zoneRange = (z: XoZone): [number, number] => [roundEdge(z.hz[0]), roundEdge(z.hz[1])];

/** Octave distance between two positive frequencies. */
const octavesBetween = (a: number, b: number): number | null =>
  a > 0 && b > 0 ? Math.abs(Math.log2(a / b)) : null;

/** Octaves from a segment to a zone: 0 when they overlap, the gap otherwise. */
function octavesToZone(seg: [number, number], zone: [number, number]): number | null {
  if (seg[1] >= zone[0] && seg[0] <= zone[1]) return 0;
  return seg[1] < zone[0] ? octavesBetween(zone[0], seg[1]) : octavesBetween(seg[0], zone[1]);
}

const OCTAVE_DECIMALS = 2;
const printOct = (oct: number): string => oct.toFixed(OCTAVE_DECIMALS);

/**
 * The recommended band for one adjacent pair.
 *
 * ABSENCE IS NOT A VERDICT (P4). A window that could not be derived produces
 * no segments, no fallback and no message: "we could not derive a window" and
 * "anywhere is fine" are different statements and the second one is not ours.
 */
export function recommendedBand(w: XoWindowResult | null | undefined): RecommendedBandResult {
  const none: RecommendedBandResult = {
    windowHz: null,
    worstZoneHz: null,
    segments: [],
    fallback: false,
    fallbackHz: null,
    leastBadEdgeHz: null,
    effectiveHz: [],
    uncalibrated: [],
    message: null,
  };
  if (!w) return none;
  const edges = windowEdges(w);
  if (!edges) return none;

  const [lo, hi] = edges;
  const uncalibrated = [w.floorBy?.uncalibrated, w.ceilingBy?.uncalibrated].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );

  const worstZone = w.zones.find((z) => z.kind === 'bad') ?? null;
  const worstZoneHz = worstZone ? zoneRange(worstZone) : null;
  const goodZones = w.zones.filter((z) => z.kind === 'good' && z.hz[1] > 0).map(zoneRange);

  /* ---- the subtraction, and it is the whole of the arithmetic ---- */
  const cuts: { hz: [number, number]; edgeFrom: [SegmentEdgeSource, SegmentEdgeSource] }[] = [];
  if (!worstZoneHz) {
    cuts.push({ hz: [lo, hi], edgeFrom: ['window', 'window'] });
  } else {
    const [bLo, bHi] = worstZoneHz;
    // Below the zone. Also the case where the zone sits entirely ABOVE the
    // window: the whole window is then below it and comes back in one piece.
    if (bLo > lo) {
      const top = Math.min(hi, bLo);
      cuts.push({ hz: [lo, top], edgeFrom: ['window', top === bLo && bLo < hi ? 'worst-zone' : 'window'] });
    }
    // Above the zone. Symmetrically, a zone entirely BELOW the window returns
    // the whole window here.
    if (bHi < hi) {
      const bottom = Math.max(lo, bHi);
      cuts.push({
        hz: [bottom, hi],
        edgeFrom: [bottom === bHi && bHi > lo ? 'worst-zone' : 'window', 'window'],
      });
    }
  }

  const fsHz = w.upperFsHz !== null && w.upperFsHz > 0 ? w.upperFsHz : null;

  const segments: RecommendedSegment[] = cuts.map((c) => {
    const octavesAboveFs = fsHz !== null ? Math.log2(c.hz[0] / fsHz) : null;
    let favourableHz: [number, number] | null = null;
    let octavesToFavourable: number | null = null;
    for (const g of goodZones) {
      const d = octavesToZone(c.hz, g);
      if (d === null) continue;
      if (octavesToFavourable === null || d < octavesToFavourable) {
        octavesToFavourable = d;
        favourableHz = g;
      }
    }

    const reasons: string[] = [];
    if (worstZoneHz) {
      reasons.push(
        `outside the worst lobing zone (${formatEdge(worstZoneHz[0])}–${formatEdge(worstZoneHz[1])} Hz)`,
      );
    }
    if (octavesAboveFs !== null) {
      reasons.push(
        `▲ ${printOct(octavesAboveFs)} oct above f_s of ${w.upper} (${formatEdge(roundEdge(fsHz!))} Hz)`,
      );
    }
    if (octavesToFavourable !== null && favourableHz) {
      const zoneText = `${formatEdge(favourableHz[0])}–${formatEdge(favourableHz[1])} Hz`;
      reasons.push(
        octavesToFavourable === 0
          ? `overlaps the favourable lobing zone (${zoneText})`
          : `${printOct(octavesToFavourable)} oct from the favourable lobing zone (${zoneText})`,
      );
    }
    const range = `${formatEdge(c.hz[0])}–${formatEdge(c.hz[1])} Hz`;
    return {
      hz: c.hz,
      edgeFrom: c.edgeFrom,
      octavesAboveFs,
      octavesToFavourable,
      favourableHz,
      reasons,
      summary: reasons.length ? `recommended: ${range} — ${reasons.join(', ')}` : `recommended: ${range}`,
      takeover: takeoverFor(c.hz),
    };
  });

  if (segments.length > 0) {
    return {
      windowHz: edges,
      worstZoneHz,
      segments,
      fallback: false,
      fallbackHz: null,
      leastBadEdgeHz: null,
      effectiveHz: segments.map((s) => s.hz),
      uncalibrated,
      message: segments.map((s) => s.summary).join(' · '),
    };
  }

  /* ---- the fallback: the zone swallowed the window whole ---- *
   *
   * Not an error and not an empty window — every crossing frequency here is
   * ALLOWED, they are merely all in the stretch where the two drivers a half
   * wavelength apart cancel off axis. The recommendation degrades to the full
   * window plus the one thing that is still true: the edge furthest from
   * 0.5·λ is the least bad, because 0.5·λ is where the null sits. Which edge
   * that is comes out of the octave distance, not out of a preference. */
  const anchor = worstZoneHz ? worstZoneHz[0] : null;
  const dLo = anchor !== null ? octavesBetween(lo, anchor) : null;
  const dHi = anchor !== null ? octavesBetween(hi, anchor) : null;
  const leastBadEdgeHz =
    dLo !== null && dHi !== null ? (dHi > dLo ? hi : lo) : null;
  const range = `${formatEdge(lo)}–${formatEdge(hi)} Hz`;
  return {
    windowHz: edges,
    worstZoneHz,
    segments: [],
    fallback: true,
    fallbackHz: [lo, hi],
    leastBadEdgeHz,
    effectiveHz: [[lo, hi]],
    uncalibrated,
    message:
      `recommended: ${range} (the whole window) — no part of the window escapes the worst lobing ` +
      'zone; the edge furthest from 0.5·λ is the least bad' +
      (leastBadEdgeHz !== null ? `, which here is ${formatEdge(leastBadEdgeHz)} Hz` : '') +
      '.',
  };
}
