import type { ReactNode } from 'react';
import { t } from '../lib/i18n.ts';

/*
 * STRUCTURAL TYPES, NOT engine2 IMPORTS. Only the four UI entry points may
 * import `engine2/` (the motor-boundary invariant, `toggleRegression.test.ts`),
 * and this component reads a handful of fields — so it states the shape it
 * reads. `EngineV2Report` satisfies it; App.tsx passes that object unchanged.
 */
type GateId = 'M-A' | 'M-B/EPDR' | 'M-B/|Z|' | 'M-C' | 'M-A/part' | 'M-L';
export interface GateVerdict {
  gate: GateId;
  subject: string;
  value: number | null;
  limit: number | null;
  direction: 'max' | 'min';
  active: boolean;
  pass: boolean;
  withinToleranceOnly: boolean;
  reason: string;
}
export interface GuidedReport {
  subject: { network: string | null };
  problems: readonly string[];
  gates: { verdicts: readonly GateVerdict[] };
  system: {
    splWindowDb: number | null;
    splBandHz: [number, number] | null;
    phaseTracking: readonly { lower: string; upper: string; meanAbsDeg: number }[];
  };
}

/**
 * GUIDED RESULT — the Engine v2 report, read for someone who asked five
 * questions and wants to know whether the design does what they asked.
 *
 * The full report (`EngineV2Panel`) is written for a designer reading every
 * metric with its coverage, and on a guided run it was a page of text. This
 * summary shows three things, in this order:
 *
 *  1. Every STATED requirement, one line each, with the measured value and a
 *     verdict: met / met only on tolerance / NOT met / not judged.
 *  2. Three key figures: response flatness, phase tracking per handover and
 *     the lowest impedance the amplifier sees.
 *  3. Where the design is NOT judged: below the bottom of the valid band, in
 *     plain words.
 *
 * Everything else sits behind a single "All details" fold that holds the
 * unchanged full panel. Nothing is dropped (F0): a requirement that is NOT met
 * is never folded, the "no network" and "not simulated" states keep their own
 * line, and the report's notes are counted where the eye lands.
 *
 * Presentation only: no state of its own and no computation beyond picking
 * figures out of `buildReport`'s object.
 */

export const GUIDED_SUMMARY_VERSION = 'guided-summary/1.0';

/** Plain-language name per gate id; the subject is appended for per-way gates. */
export function gateLabel(v: Pick<GateVerdict, 'gate' | 'subject'>): string {
  switch (v.gate) {
    case 'M-B/|Z|':
      return t('Load on the amplifier (lowest impedance)');
    case 'M-B/EPDR':
      return t('Load on the amplifier (EPDR)');
    case 'M-C':
      return t('Protection of the {drv} at its resonance', { drv: v.subject });
    case 'M-A':
      return t('Power lost in resistors');
    case 'M-A/part':
      return t('Hottest resistor');
    case 'M-L':
      return t('Peak current through a coil');
  }
}

/** A gate value or limit in the unit the gate speaks. */
export function gateFigure(x: number | null, gate: GateVerdict['gate']): string {
  if (x === null || !Number.isFinite(x)) return '—';
  if (gate === 'M-A') return `${(x * 100).toFixed(1)} %`;
  if (gate === 'M-A/part') return `${x.toFixed(1)} W`;
  if (gate === 'M-L') return `${x.toFixed(2)} A`;
  if (gate === 'M-C') return `${x.toFixed(1)} dB`;
  return `${x.toFixed(2)} Ω`;
}

export type GuidedVerdict = 'met' | 'tolerance' | 'failed' | 'unjudged';

/** The four states of a stated gate — the panel's own reading, never two collapsed into one. */
export function guidedVerdict(v: GateVerdict): GuidedVerdict {
  if (v.value === null) return 'unjudged';
  if (!v.pass) return 'failed';
  if (v.withinToleranceOnly) return 'tolerance';
  return 'met';
}

const VERDICT_CLASS: Record<GuidedVerdict, string> = {
  met: 'v2-on',
  tolerance: 'v2-on v2-tolerance',
  failed: 'v2-fail',
  unjudged: 'v2-unjudged',
};

function verdictText(v: GuidedVerdict): string {
  if (v === 'met') return t('met');
  if (v === 'tolerance') return t('met, only within tolerance');
  if (v === 'failed') return t('NOT met');
  return t('not judged');
}

export interface GuidedV2SummaryProps {
  report: GuidedReport;
  /** The same "not simulated" tag the full panel carries. */
  notSimulated?: { label: string; title: string } | null;
  /** Who stated each gate's limit, per gate id (U-9 fase 3). */
  limitProvenance?: Readonly<Record<string, string>>;
  /**
   * Whether the loaded design is made of REAL parts: how many of its passive
   * parts carry a catalogue attribution, out of how many, and — when none do —
   * why (no catalogue loaded, or the snap switched off). Null = no network.
   */
  parts?: { total: number; catalog: number; why: string | null } | null;
  /** The full panel, shown inside the details fold. */
  children: ReactNode;
}

/** The parts line: buildable, partly, or ideal values — with the reason. */
export function partsLine(p: { total: number; catalog: number; why: string | null }): { text: string; ok: boolean } {
  if (p.catalog === p.total) {
    return { text: t('All {n} parts are real catalogue parts — this list can be ordered.', { n: p.total }), ok: true };
  }
  if (p.catalog === 0) {
    return {
      text:
        t('Ideal values: none of the {n} parts is a catalogue part, so this is not yet a list you can order.', { n: p.total }) +
        (p.why ? ` ${p.why}` : ''),
      ok: false,
    };
  }
  return {
    text: t('{k} of {n} parts are real catalogue parts; the other {m} carry ideal values.', {
      k: p.catalog,
      n: p.total,
      m: p.total - p.catalog,
    }),
    ok: false,
  };
}

export function GuidedV2Summary({ report, notSimulated = null, limitProvenance = {}, parts = null, children }: GuidedV2SummaryProps) {
  const { gates, system } = report;
  const stated = gates.verdicts.filter((v) => v.active);
  const unstated = [...new Set(gates.verdicts.filter((v) => !v.active).map((v) => gateLabel(v)))];
  const zMin = gates.verdicts.find((v) => v.gate === 'M-B/|Z|')?.value ?? null;
  const bottom = system.splBandHz?.[0] ?? null;
  const notes = report.problems.length;

  return (
    <div className={`panel v2-panel guided-v2-summary${notSimulated ? ' sim-stale' : ''}`}>
      <div className="v2-head">
        <h3>
          {t('How this design does')}
          {notSimulated && (
            <span className="stale-tag" title={notSimulated.title}>
              ⚠ {notSimulated.label}
            </span>
          )}
        </h3>
      </div>

      {report.subject.network === null ? (
        <p className="v2-problem">
          {t('No design is loaded, so there is nothing to judge yet. Pick a design from the list above.')}
        </p>
      ) : (
        <>
          <h4 className="guided-sub">{t('Your requirements')}</h4>
          {stated.length === 0 ? (
            <p className="v2-muted">{t('You stated no requirements, so nothing below judges this design.')}</p>
          ) : (
            <ul className="guided-reqs">
              {stated.map((v, i) => {
                const verdict = guidedVerdict(v);
                return (
                  <li key={i}>
                    <span className="guided-req-name">{gateLabel(v)}</span>{' '}
                    <span className="guided-req-fig">
                      {gateFigure(v.value, v.gate)} {v.direction === 'max' ? '≤' : '≥'} {gateFigure(v.limit, v.gate)}
                    </span>{' '}
                    <span className={VERDICT_CLASS[verdict]} title={verdict === 'met' ? limitProvenance[v.gate] : v.reason}>
                      {verdictText(verdict)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {/* `gates.violation` is not repeated here: the failing line above already
              says NOT met, with the same sentence as its tooltip, and the full
              panel in the fold prints it verbatim. */}
          {unstated.length > 0 && (
            <p className="v2-muted">
              {t('Not judged, because you stated no limit: {list}.', { list: unstated.join(', ') })}
            </p>
          )}

          <h4 className="guided-sub">{t('Key figures')}</h4>
          <ul className="guided-figs">
            <li>
              {t('Response flatness')}:{' '}
              <b>{system.splWindowDb === null ? '—' : `± ${system.splWindowDb.toFixed(1)} dB`}</b>
            </li>
            {system.phaseTracking.map((p) => (
              <li key={`${p.lower}-${p.upper}`}>
                {t('Phase tracking {lo} → {hi}', { lo: p.lower, hi: p.upper })}:{' '}
                <b>{Number.isFinite(p.meanAbsDeg) ? `${p.meanAbsDeg.toFixed(1)}°` : '—'}</b>
              </li>
            ))}
            <li>
              {t('Lowest impedance the amplifier sees')}: <b>{gateFigure(zMin, 'M-B/|Z|')}</b>
            </li>
          </ul>

          {parts && (
            <p className={`guided-parts ${partsLine(parts).ok ? 'v2-on' : 'v2-unjudged'}`}>{partsLine(parts).text}</p>
          )}

          {bottom !== null && (
            <p className="guided-bass-note">
              {t('Below {hz} Hz the measurements are not valid, so the design is not judged there. To design the bass too, add a near-field measurement and merge it with the far field.', { hz: Math.round(bottom) })}
            </p>
          )}
        </>
      )}

      <details className="guided-details">
        <summary>
          {notes > 0
            ? t('All details (full Engine v2 report, {n} notes)', { n: notes })
            : t('All details (full Engine v2 report)')}
        </summary>
        {children}
      </details>
    </div>
  );
}
