/**
 * F3b ACCEPTANCE (a), THE RUNTIME HALF — with the toggle off the dialog draws
 * ZERO v2 annotation elements.
 *
 * The source guard in `toggleRegression.test.ts` catches a structural leak: a
 * value that stops being null when reporting is off, a consumer that reaches
 * past the guard. It cannot catch the other failure — markup that renders on
 * some OTHER condition and happens to look like the annotation. Only rendering
 * can answer that, so this file renders.
 *
 * No DOM library and no new dependency: `renderToStaticMarkup` runs in plain
 * node, and the component is presentation-only by construction, so its output
 * is a pure function of its props. The query is the same class name the
 * component uses — imported, never retyped, because a test that spells the
 * class itself keeps passing after the class is renamed.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { XO_WINDOW_CLASS, XoWindowAnnotation, type XoWindowPair } from './XoWindowAnnotation.tsx';
import { crossoverWindow } from '../lib/engine2/predesign/xoWindow.ts';
import { rangeAgainstWindow } from '../lib/engine2/predesign/xoRangeAdvice.ts';

/** The identity translator: this suite asserts markup, not localisation. */
const t = (s: string) => s;

const pairFor = (
  key: string,
  floorHz: number | null,
  ceilingHz: number | null,
  range: [number, number] | null,
): XoWindowPair => {
  const window = crossoverWindow({
    lower: 'woofer',
    upper: 'mid',
    order: 4,
    validityFloorHz: floorHz,
    validityFloorSource: 'woofer far field',
    upperFsHz: null,
    lowerBreakups: [],
    lowerMinus6Hz: ceilingHz,
    lowerMinus6AngleDeg: 30,
    spacingMm: null,
  });
  return { key, window, advice: rangeAgainstWindow(range, window, 'W-M') };
};

const render = (pairs: readonly XoWindowPair[] | null): string =>
  renderToStaticMarkup(<XoWindowAnnotation pairs={pairs} onTakeOver={() => {}} t={t} />);

describe('(a) the window annotation does not exist with the toggle off', () => {
  it('no pairs at all: the rendered output is EMPTY, not merely hidden', () => {
    const html = render(null);
    expect(html).toBe('');
    // The query the deliverable names, on the class the component owns.
    expect(html).not.toContain(XO_WINDOW_CLASS);
    expect(html).not.toContain('v2-xo-warn');
    expect(html).not.toContain('take the window as the range');
  });

  it('...and the query is not vacuous: with a pair, it finds exactly one', () => {
    // A test that asserts "no matches" is worth nothing until it has been shown
    // to match when it should. Same reason the import scan asserts it walked
    // the tree.
    const html = render([pairFor('low', 400, 600, [450, 550])]);
    expect(html).toContain(XO_WINDOW_CLASS);
    expect(html.split(XO_WINDOW_CLASS).length - 1).toBe(1);
    expect(html).toContain('400–600 Hz');
  });

  it('an empty pair list is NOT the same as the engine being off', () => {
    // Absent means the flag is off; empty means the flag is on and this
    // project has no adjacent pair yet. The second still carries the heading,
    // so a designer can tell "nothing found" from "not looking".
    const html = render([]);
    expect(html).toContain(XO_WINDOW_CLASS);
    expect(html).toContain('feasible crossover window');
  });
});

describe('what the annotation renders when it does render', () => {
  it('a range inside its window carries no warning and no take-over button', () => {
    const html = render([pairFor('low', 400, 600, [450, 550])]);
    expect(html).not.toContain('v2-xo-warn');
    expect(html).not.toContain('take the window as the range');
    // The binding limits are named where they are read.
    expect(html).toContain('validity');
    expect(html).toContain('directivity');
  });

  it('a range outside it carries both, and the sentence comes from the engine', () => {
    const pair = pairFor('low', 400, 600, [250, 550]);
    const html = render([pair]);
    expect(html).toContain('v2-xo-warn');
    expect(html).toContain('take the window as the range');
    // Not a second wording invented in the component: the advice module owns
    // every verdict sentence, so the dialog and the tests cannot drift apart.
    expect(html).toContain('Nothing is being clamped');
    expect(pair.advice.message).toContain('Nothing is being clamped');
  });

  it('an EMPTY window says so and offers nothing to take over', () => {
    const html = render([pairFor('low', 900, 500, [400, 600])]);
    expect(html).toContain('EMPTY');
    expect(html).toContain('driver or layout problem');
    expect(html).not.toContain('take the window as the range');
  });

  it('an uncalibrated ceiling is marked where it is read, not in a footnote', () => {
    const window = crossoverWindow({
      lower: 'woofer',
      upper: 'mid',
      order: 4,
      validityFloorHz: 300,
      validityFloorSource: 'woofer far field',
      upperFsHz: null,
      // A significant breakup is what brings the severity weighting in.
      lowerBreakups: [{ fHz: 1400, dB: 3.2 }],
      lowerMinus6Hz: null,
      lowerMinus6AngleDeg: null,
      spacingMm: null,
    });
    const html = render([
      { key: 'low', window, advice: rangeAgainstWindow(null, window, 'W-M') },
    ]);
    expect(html).toContain('v2-uncal');
    expect(html).toContain('uncalibrated');
  });
});
