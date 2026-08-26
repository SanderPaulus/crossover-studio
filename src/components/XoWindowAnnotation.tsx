import type { RangeAdvice } from '../lib/engine2/predesign/xoRangeAdvice.ts';
import { formatEdge } from '../lib/engine2/predesign/xoRangeAdvice.ts';
import type { RecommendedBandResult } from '../lib/engine2/predesign/recommendedBand.ts';
import type { SmoothingNotice } from '../lib/engine2/requirements/smoothingConsistency.ts';
import type { XoWindowResult, XoLimit } from '../lib/engine2/predesign/xoWindow.ts';

/**
 * F3b, DELIVERABLES 1 + 2 — A5d.3's feasible window, beside the fields it is
 * about. F3c added the recommended band under it and the smoothing line under
 * that.
 *
 * WHY THIS IS A COMPONENT AND NOT MORE JSX IN `App.tsx`. The toggle invariant
 * says that with engine v2 off this annotation does not exist — not that it is
 * empty, not that it is hidden: absent. A source scan can show that the value
 * it hangs off is null when the flag is off, but it cannot show that NOTHING
 * ELSE renders the markup. Pulling the annotation into one component with one
 * entry condition makes the claim testable at RUNTIME: render it with no
 * windows and assert the output contains no annotation element at all.
 *
 * THE SMOOTHING LINE LIVES HERE FOR THAT SAME REASON, and for no other. It is
 * not about crossover windows and it says so; what it shares with them is the
 * entry condition. A second v2-only surface in the dialog would be a second
 * place the toggle invariant has to be proved, and the proof that exists is
 * the one that renders THIS component and reads its output.
 *
 * It is presentation only. Every verdict, every sentence and every number
 * comes from `xoRangeAdvice.ts`, `recommendedBand.ts` and
 * `smoothingConsistency.ts`, so what the dialog says and what the tests assert
 * are the same strings.
 */

/** The one class name the annotation is identified by, shared with its test. */
export const XO_WINDOW_CLASS = 'v2-xo-window';

/** The recommended band's own class, so the F3c surface is queryable too. */
export const XO_RECOMMENDED_CLASS = 'v2-xo-recommended';

/** The smoothing consistency line's class. */
export const XO_SMOOTHING_CLASS = 'v2-smoothing-note';

/** The spacing-provenance marker on the zone line (F3c). */
export const XO_SPACING_CLASS = 'v2-xo-spacing';

export interface XoWindowPair {
  /** Which handover this is — the caller's own key, used for React and events. */
  key: string;
  window: XoWindowResult;
  advice: RangeAdvice;
  /**
   * The window minus the worst lobing zone (F3c, deliverable 1).
   *
   * Computed by the caller from the same window object, so the two can never
   * describe different windows.
   */
  recommended: RecommendedBandResult;
}

export interface XoWindowAnnotationProps {
  /**
   * The pairs to annotate, or NULL when the v2 reporting layer is off.
   *
   * Null rather than an empty array on purpose: "the engine is off" and "the
   * engine is on and found no pair" are different states, and only the first
   * one may render nothing at all. The second one is a project that has not
   * loaded two drivers yet, and the dialog says so elsewhere.
   */
  pairs: readonly XoWindowPair[] | null;
  onTakeOver: (key: string) => void;
  /** Take over one recommended SEGMENT — the index is into `recommended.segments`. */
  onTakeOverRecommended: (key: string, segment: number) => void;
  /**
   * The tuner-vs-acceptance smoothing line (F3c, deliverable 3), or null when
   * the two agree — and null also when the engine is off, which the `pairs`
   * guard above already settles.
   */
  smoothing: SmoothingNotice | null;
  t: (text: string, vars?: Record<string, string | number>) => string;
}

export function XoWindowAnnotation({
  pairs,
  onTakeOver,
  onTakeOverRecommended,
  smoothing,
  t,
}: XoWindowAnnotationProps) {
  if (!pairs) return null;

  // Printed at the precision the edges are COMPARED at. A floor shown as "397"
  // beside a window that starts at 396.7 invites the reader to wonder which of
  // the two the app means.
  const bind = (l: XoLimit | null) =>
    l
      ? `${formatEdge(Math.round(l.hz * 10) / 10)} Hz — ${l.rule}${l.uncalibrated ? ' (uncalibrated)' : ''}`
      : t('none');

  return (
    <span className={`derived ${XO_WINDOW_CLASS}`} style={{ flexBasis: '100%' }}>
      <b>{t('Engine v2 — feasible crossover window (A5d.3)')}</b>
      {pairs.map(({ key, window: w, advice, recommended }) => (
        <span key={key} style={{ display: 'block', marginTop: '0.25rem' }}>
          <strong>
            {w.lower} → {w.upper}
            {': '}
            {advice.windowHz
              ? `${formatEdge(advice.windowHz[0])}–${formatEdge(advice.windowHz[1])} Hz`
              : w.empty
                ? t('EMPTY')
                : t('not derivable')}
          </strong>
          {advice.windowHz && (
            <span style={{ opacity: 0.8 }}>
              {' · '}
              {t('floor')}: <span title={w.floorBy?.source}>{bind(w.floorBy)}</span>
              {' · '}
              {t('ceiling')}: <span title={w.ceilingBy?.source}>{bind(w.ceilingBy)}</span>
              {w.ceilingBy?.uncalibrated && (
                <span className="v2-uncal" title={w.ceilingBy.uncalibrated}>
                  {t('ceiling: breakup — uncalibrated')}
                </span>
              )}
            </span>
          )}
          {w.zones.length > 0 && (
            <span style={{ display: 'block', opacity: 0.75 }}>
              {/* F3c — the SPACING the zones were derived from, with its
                * source. Both the recommended band and the zone list hang off
                * this one number, and the same drivers at 382 mm and at
                * 261 mm produce worst-lobing zones an octave apart: a reader
                * comparing two bands has no way to tell which layout each one
                * belongs to unless the layout is printed beside them. */}
              {w.spacingMm !== null && (
                <span className={XO_SPACING_CLASS}>
                  {t('zones from c-t-c')} {Math.round(w.spacingMm)}
                  {' mm'}
                  {w.spacingSource ? `, ${w.spacingSource}` : ''}
                  {' · '}
                </span>
              )}
              {t('lobing zones')}:{' '}
              {w.zones
                .map(
                  (z) =>
                    `${z.kind === 'good' ? '✓' : '✗'} ${z.label} ${Math.round(z.hz[0])}–${Math.round(z.hz[1])} Hz${
                      z.outsideWindow ? ` (${t('outside the window')})` : ''
                    }`,
                )
                .join(' · ')}
            </span>
          )}
          {/* DELIVERABLE 1 + 2 (F3c) — the recommended band, UNDER the window
            * it was carved out of. Every segment is shown; none is called the
            * best one. Ranking them would be a taste judgement with a number
            * on it, which is A5e.1's parked decision and not this surface's
            * to take. */}
          {(recommended.segments.length > 0 || recommended.fallback) && (
            <span className={XO_RECOMMENDED_CLASS} style={{ display: 'block' }}>
              {recommended.segments.map((seg, i) => (
                <span key={i} style={{ display: 'block' }}>
                  {seg.summary}{' '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onTakeOverRecommended(key, i)}
                    title={t(
                      'Writes this band into the two fields as an ordinary change — you can edit them afterwards, and nothing is clamped during the run.',
                    )}
                  >
                    {recommended.segments.length > 1
                      ? `${t('take the recommended band')} (${formatEdge(seg.hz[0])}–${formatEdge(seg.hz[1])} Hz)`
                      : t('take the recommended band')}
                  </button>
                </span>
              ))}
              {recommended.fallback && recommended.message && (
                <span style={{ display: 'block' }}>
                  ⚠ {recommended.message}{' '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onTakeOverRecommended(key, 0)}
                    title={t(
                      'Writes the full window into the two fields as an ordinary change — nothing here is clamped either.',
                    )}
                  >
                    {t('take the recommended band')}
                  </button>
                </span>
              )}
              {recommended.uncalibrated.map((u, i) => (
                <span className="v2-uncal" key={i} title={u}>
                  {t('recommended band inherits an uncalibrated limit')}
                </span>
              ))}
            </span>
          )}
          {w.tensions.map((x, i) => (
            <strong key={i} style={{ display: 'block' }}>
              ⚠ {x}
            </strong>
          ))}
          {advice.warn && advice.message && (
            <span className="v2-xo-warn">
              ⚠ {advice.message}
              {advice.takeover && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onTakeOver(key)}
                    title={t(
                      'Writes the window edges into the two fields as an ordinary change — you can edit them afterwards, and nothing is clamped during the run.',
                    )}
                  >
                    {t('take the window as the range')}
                  </button>
                </>
              )}
            </span>
          )}
        </span>
      ))}
      {/* DELIVERABLE 3 (F3c) — visibility, and nothing else. No button, no
        * coupling: the two widths answer two different questions and are
        * allowed to differ. What is not allowed is for them to differ in
        * silence. */}
      {smoothing?.mismatch && smoothing.message && (
        <span className={XO_SMOOTHING_CLASS} style={{ display: 'block', opacity: 0.8 }}>
          {t('smoothing')}: {smoothing.message}
        </span>
      )}
    </span>
  );
}
