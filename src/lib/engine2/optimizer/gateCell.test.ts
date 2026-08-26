/**
 * F2b — the scan table's gate column, as a rule rather than as a screenshot.
 *
 * The requirement is that the column belongs to the SAME FAMILY as the ⚠Z
 * column beside it and adds no second warning logic. That is a property of
 * this reduction: every judgement it reports arrives as `GateVerdict.pass`,
 * already decided by the metric library, and the four cell shapes below are a
 * presentation choice on top of it.
 *
 * The case worth naming is `absent`. A row that did NOT come from a v2 run
 * must not read as a pass — it was never judged, and a green tick on an
 * unjudged design is the failure the column exists to prevent.
 */

import { describe, expect, it } from 'vitest';
import { gateCellState } from './gateCell.ts';
import type { GateVerdict } from './gates.ts';

const verdict = (over: Partial<GateVerdict>): GateVerdict => ({
  gate: 'M-A',
  metric: 'M-A',
  title: 'Dissipation in the filter resistors',
  subject: 'system',
  value: 0.2,
  unit: 'of amplifier power',
  limit: null,
  direction: 'max',
  active: false,
  pass: true,
  reason: '20.0 % — no limit set',
  specRef: 'A4 M-A',
  ...over,
});

describe('the scan table gate cell', () => {
  it('a row from a NON-v2 run is absent, never a pass', () => {
    const st = gateCellState(undefined);
    expect(st.kind).toBe('absent');
    expect(st.activeCount).toBe(0);
    expect(st.failed).toEqual([]);
    // Nothing to show, and nothing claimed.
    expect(st.detail).toEqual([]);
    expect(gateCellState(null).kind).toBe('absent');
  });

  it('a v2 run with no limit stated reports its VALUES and judges nothing', () => {
    const st = gateCellState({
      verdicts: [verdict({}), verdict({ gate: 'M-B/EPDR', metric: 'M-B', reason: '1.73 Ω — no limit set' })],
      violation: null,
    });
    expect(st.kind).toBe('noLimit');
    expect(st.activeCount).toBe(0);
    // P4's visible half: the numbers are still there for the designer who is
    // deciding what limit to set.
    expect(st.detail).toHaveLength(2);
    expect(st.detail[0]).toContain('20.0 %');
  });

  it('inside every stated limit counts the gates that were judging', () => {
    const st = gateCellState({
      verdicts: [
        verdict({ active: true, limit: 0.35, pass: true, reason: '20.0 % against a ceiling of 35.0 %' }),
        verdict({ gate: 'M-B/EPDR', metric: 'M-B', active: true, limit: 1.5, pass: true, reason: '1.73 Ω against a floor of 1.50 Ω' }),
        verdict({ gate: 'M-B/|Z|', metric: 'M-B' }), // reported, not judging
      ],
      violation: null,
    });
    expect(st.kind).toBe('pass');
    expect(st.activeCount).toBe(2);
    expect(st.failed).toEqual([]);
    // The tooltip lists the ACTIVE gates only: an unjudged value beside a
    // judged one invites reading the pass as covering both.
    expect(st.detail).toHaveLength(2);
  });

  it('a failure names the gates that failed, and carries the engine sentence', () => {
    const st = gateCellState({
      verdicts: [
        verdict({ active: true, limit: 0.05, pass: false, reason: '20.0 % exceeds the stated ceiling of 5.0 %' }),
        verdict({ gate: 'M-C', metric: 'M-C', subject: 'tweeter', active: true, limit: -18, pass: false, reason: '-6.0 dB exceeds the stated ceiling of -18.0 dB' }),
        verdict({ gate: 'M-B/EPDR', metric: 'M-B', active: true, limit: 1.5, pass: true, reason: '1.73 Ω against a floor of 1.50 Ω' }),
      ],
      violation: 'M-A: …; M-C (tweeter): …',
    });
    expect(st.kind).toBe('fail');
    expect(st.failed).toEqual(['M-A', 'M-C']);
    expect(st.activeCount).toBe(3);
    expect(st.violation).toContain('M-C (tweeter)');
    // The per-driver subject reaches the tooltip: "M-C failed" without saying
    // on which way sends the reader to the wrong branch.
    expect(st.detail.join('\n')).toContain('M-C (tweeter)');
  });

  it('the cell NEVER compares a value with a limit itself', () => {
    // The verdicts are the authority, even when they look wrong: this reduction
    // reports `pass`, it does not re-derive it. A cell that second-guessed the
    // metric library would be the second warning rule the requirement forbids.
    const st = gateCellState({
      verdicts: [verdict({ active: true, limit: 0.05, value: 0.9, pass: true, reason: 'as judged' })],
      violation: null,
    });
    expect(st.kind).toBe('pass');
    expect(st.failed).toEqual([]);
  });
});
