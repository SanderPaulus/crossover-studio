import type { RangeAdvice } from '../lib/engine2/predesign/xoRangeAdvice.ts';
import { formatEdge } from '../lib/engine2/predesign/xoRangeAdvice.ts';
import type { XoWindowResult, XoLimit } from '../lib/engine2/predesign/xoWindow.ts';

/**
 * F3b, DELIVERABLES 1 + 2 — A5d.3's feasible window, beside the fields it is
 * about.
 *
 * WHY THIS IS A COMPONENT AND NOT MORE JSX IN `App.tsx`. The toggle invariant
 * says that with engine v2 off this annotation does not exist — not that it is
 * empty, not that it is hidden: absent. A source scan can show that the value
 * it hangs off is null when the flag is off, but it cannot show that NOTHING
 * ELSE renders the markup. Pulling the annotation into one component with one
 * entry condition makes the claim testable at RUNTIME: render it with no
 * windows and assert the output contains no annotation element at all.
 *
 * It is presentation only. Every verdict, every sentence and every number
 * comes from `xoRangeAdvice.ts`, so what the dialog says and what the tests
 * assert are the same strings.
 */

/** The one class name the annotation is identified by, shared with its test. */
export const XO_WINDOW_CLASS = 'v2-xo-window';

export interface XoWindowPair {
  /** Which handover this is — the caller's own key, used for React and events. */
  key: string;
  window: XoWindowResult;
  advice: RangeAdvice;
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
  t: (text: string, vars?: Record<string, string | number>) => string;
}

export function XoWindowAnnotation({ pairs, onTakeOver, t }: XoWindowAnnotationProps) {
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
      {pairs.map(({ key, window: w, advice }) => (
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
    </span>
  );
}
