/**
 * F3c ACCEPTANCE, DELIVERABLE 3 — the line appears ONLY on a mismatch.
 *
 * The failure mode worth testing is not a crash. It is a line that is always
 * there (and so stops being read) or never there (and so proves nothing), and
 * neither of those looks wrong on screen. So: the widths that agree produce
 * NOTHING, the widths that differ produce the sentence, and the sentence
 * prints both widths the way the designer's own select box prints them.
 */

import { describe, expect, it } from 'vitest';
import { formatOctaves, smoothingConsistency } from './smoothingConsistency.ts';
import { WINDOW_SMOOTHING_OCTAVES } from '../constants.ts';

describe('the smoothing line', () => {
  it('appears when the tuner searches on a different width than acceptance judges on', () => {
    const n = smoothingConsistency(1 / 12);
    expect(n.mismatch).toBe(true);
    expect(n.message).toContain('the tuner searches on 1/12 oct');
    expect(n.message).toContain('acceptance judges on 1/6 oct');
    // The acceptance side is A5e.1's constant, not a number this module owns.
    expect(n.acceptanceOctaves).toBe(WINDOW_SMOOTHING_OCTAVES);
  });

  it('does NOT appear when the two agree — including through a localStorage round trip', () => {
    expect(smoothingConsistency(WINDOW_SMOOTHING_OCTAVES).mismatch).toBe(false);
    expect(smoothingConsistency(WINDOW_SMOOTHING_OCTAVES).message).toBeNull();
    // The dialog stores the preference as a decimal string; 1/6 comes back as
    // 0.16666666666666666 and must still read as the same width rather than as
    // a difference in the sixteenth decimal.
    const roundTripped = Number(String(WINDOW_SMOOTHING_OCTAVES));
    expect(smoothingConsistency(roundTripped).mismatch).toBe(false);
  });

  it('says nothing at all when the tuner width was not stated', () => {
    // "We did not read the tuner's width" and "the two agree" are different
    // statements, and only the first is true here.
    for (const v of [null, undefined, NaN]) {
      const n = smoothingConsistency(v);
      expect(n.mismatch).toBe(false);
      expect(n.message).toBeNull();
      expect(n.tunerOctaves).toBeNull();
    }
  });

  it('smoothing switched OFF is a mismatch, and is named as off rather than as zero', () => {
    const n = smoothingConsistency(0);
    expect(n.mismatch).toBe(true);
    expect(n.message).toContain('off (raw points)');
    expect(n.message).not.toContain('0.000 oct');
  });

  it('it never claims the two are coupled, because they are not', () => {
    const n = smoothingConsistency(1 / 24);
    expect(n.message).toContain('Neither setting moves the other');
  });
});

describe('the widths are printed the way the designer chose them', () => {
  it('fractions stay fractions', () => {
    expect(formatOctaves(1 / 24)).toBe('1/24 oct');
    expect(formatOctaves(1 / 12)).toBe('1/12 oct');
    expect(formatOctaves(1 / 6)).toBe('1/6 oct');
    expect(formatOctaves(1 / 3)).toBe('1/3 oct');
  });

  it('a width that is not a unit fraction falls back to a decimal rather than lying', () => {
    // 0.1 oct is not 1/10 of anything the menu offers; rounding it into "1/10
    // oct" would put a value in the sentence the designer never chose.
    expect(formatOctaves(0.1)).toBe('1/10 oct');
    expect(formatOctaves(0.09)).toBe('0.090 oct');
  });

  it('off and nonsense both print as off rather than as a width', () => {
    expect(formatOctaves(0)).toBe('off (raw points)');
    expect(formatOctaves(-1)).toBe('off (raw points)');
    expect(formatOctaves(NaN)).toBe('off (raw points)');
  });
});
