/**
 * F3b ACCEPTANCE (a), THE RUNTIME HALF — with the toggle off the dialog draws
 * ZERO v2 annotation elements. F3c extends the same claim to the two surfaces
 * it added: the recommended band with its second take-over button, and the
 * smoothing consistency line.
 *
 * The source guard in `toggleRegression.test.ts` catches a structural leak: a
 * value that stops being null when reporting is off, a consumer that reaches
 * past the guard. It cannot catch the other failure — markup that renders on
 * some OTHER condition and happens to look like the annotation. Only rendering
 * can answer that, so this file renders.
 *
 * No DOM library and no new dependency: `renderToStaticMarkup` runs in plain
 * node, and the component is presentation-only by construction, so its output
 * is a pure function of its props. The queries are the same class names the
 * component uses — imported, never retyped, because a test that spells the
 * class itself keeps passing after the class is renamed.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  XO_RECOMMENDED_CLASS,
  XO_SMOOTHING_CLASS,
  XO_SPACING_CLASS,
  XO_WINDOW_CLASS,
  XoWindowAnnotation,
  type XoWindowPair,
} from './XoWindowAnnotation.tsx';
import { crossoverWindow } from '../lib/engine2/predesign/xoWindow.ts';
import { rangeAgainstWindow } from '../lib/engine2/predesign/xoRangeAdvice.ts';
import { recommendedBand } from '../lib/engine2/predesign/recommendedBand.ts';
import { smoothingConsistency } from '../lib/engine2/requirements/smoothingConsistency.ts';
import { WINDOW_SMOOTHING_OCTAVES, SPEED_OF_SOUND_M_S, MM_PER_M } from '../lib/engine2/constants.ts';

/** The identity translator: this suite asserts markup, not localisation. */
const t = (s: string) => s;

/** A spacing that puts the worst lobing zone at 500–700 Hz (see the band suite). */
const SPACING_MM = (SPEED_OF_SOUND_M_S / 1000) * MM_PER_M;

const pairFor = (
  key: string,
  floorHz: number | null,
  ceilingHz: number | null,
  range: [number, number] | null,
  spacingMm: number | null = null,
  spacingSource?: string,
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
    spacingMm,
    spacingSource,
  });
  return {
    key,
    window,
    advice: rangeAgainstWindow(range, window, 'W-M'),
    recommended: recommendedBand(window),
  };
};

const render = (
  pairs: readonly XoWindowPair[] | null,
  smoothing: ReturnType<typeof smoothingConsistency> | null = null,
): string =>
  renderToStaticMarkup(
    <XoWindowAnnotation
      pairs={pairs}
      onTakeOver={() => {}}
      onTakeOverRecommended={() => {}}
      smoothing={smoothing}
      t={t}
    />,
  );

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

  it('F3c: with the toggle off, the two NEW surfaces draw nothing either', () => {
    // `pairs === null` is the one entry condition, and the smoothing line sits
    // inside it for exactly this reason — a second v2-only surface elsewhere in
    // the dialog would be a second place this claim has to be proved.
    const html = render(null, smoothingConsistency(1 / 12));
    expect(html).toBe('');
    expect(html).not.toContain(XO_RECOMMENDED_CLASS);
    expect(html).not.toContain(XO_SMOOTHING_CLASS);
    expect(html).not.toContain('take the recommended band');
    // ...and neither query is vacuous.
    const on = render([pairFor('low', 400, 900, null, SPACING_MM)], smoothingConsistency(1 / 12));
    expect(on).toContain(XO_RECOMMENDED_CLASS);
    expect(on).toContain(XO_SMOOTHING_CLASS);
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
    // Nor a recommended band: there is no window to carve one out of.
    expect(html).not.toContain(XO_RECOMMENDED_CLASS);
  });

  it('an uncalibrated ceiling is marked where it is read, not in a footnote', () => {
    const window = crossoverWindow({
      lower: 'woofer',
      upper: 'mid',
      order: 4,
      validityFloorHz: 300,
      validityFloorSource: 'woofer far field',
      // A significant breakup is what brings the severity weighting in.
      lowerBreakups: [{ fHz: 1400, dB: 3.2 }],
      upperFsHz: null,
      lowerMinus6Hz: null,
      lowerMinus6AngleDeg: null,
      spacingMm: null,
    });
    const html = render([
      {
        key: 'low',
        window,
        advice: rangeAgainstWindow(null, window, 'W-M'),
        recommended: recommendedBand(window),
      },
    ]);
    expect(html).toContain('v2-uncal');
    expect(html).toContain('uncalibrated');
    // F3c: the band carved out of that ceiling carries the mark too.
    expect(html).toContain('recommended band inherits an uncalibrated limit');
  });
});

describe('(F3c) the recommended band and its take-over', () => {
  it('one segment: one line, one button, and the sentence is the engine’s', () => {
    const pair = pairFor('low', 600, 900, null, SPACING_MM);
    const html = render([pair]);
    expect(pair.recommended.segments).toHaveLength(1);
    expect(html).toContain('recommended: 700–900 Hz');
    expect(html).toContain('outside the worst lobing zone');
    expect(html.split('take the recommended band').length - 1).toBe(1);
    // Not retyped in the component: the line the dialog draws IS the string
    // the composition module produced, character for character.
    expect(html).toContain(pair.recommended.segments[0].summary);
  });

  it('two segments: BOTH are shown, each with its own button, neither called best', () => {
    const pair = pairFor('low', 400, 900, null, SPACING_MM);
    const html = render([pair]);
    expect(pair.recommended.segments).toHaveLength(2);
    expect(html).toContain('recommended: 400–500 Hz');
    expect(html).toContain('recommended: 700–900 Hz');
    // Two buttons, and each names the band it writes — otherwise a designer
    // with two of them cannot tell which one they are pressing.
    expect(html.split('take the recommended band').length - 1).toBe(2);
    expect(html).toContain('take the recommended band (400–500 Hz)');
    expect(html).toContain('take the recommended band (700–900 Hz)');
    expect(html).not.toContain('best');
  });

  it('the fallback renders the sentence and still offers the whole window', () => {
    const pair = pairFor('low', 520, 680, null, SPACING_MM);
    const html = render([pair]);
    expect(pair.recommended.fallback).toBe(true);
    expect(html).toContain('no part of the window escapes the worst lobing zone');
    expect(html).toContain('the edge furthest from 0.5·λ is the least bad');
    expect(html.split('take the recommended band').length - 1).toBe(1);
  });

  it('no lobing zone at all still recommends — the whole window, with no zone reason', () => {
    const pair = pairFor('low', 400, 600, null, null);
    const html = render([pair]);
    expect(html).toContain('recommended: 400–600 Hz');
    expect(html).not.toContain('worst lobing zone');
  });
});

describe('(F3c) the zones name the spacing they came from', () => {
  it('the spacing and its source are printed where the zones are read', () => {
    // The mix-up this exists for: the app derives c-t-c from the cabinet
    // layout, the casebook fixture carries its own, and the same drivers at
    // 382 mm and at 261 mm put the worst lobing zone an octave apart. Two
    // bands compared without their layouts is how an afternoon goes missing.
    const html = render([
      pairFor('low', 400, 900, null, 382, 'cabinet layout (vertical driver positions)'),
    ]);
    expect(html).toContain(XO_SPACING_CLASS);
    expect(html).toContain('zones from c-t-c 382 mm');
    expect(html).toContain('cabinet layout (vertical driver positions)');
  });

  it('a spacing with no stated source prints the number and claims nothing', () => {
    const html = render([pairFor('low', 400, 900, null, 382)]);
    expect(html).toContain('zones from c-t-c 382 mm');
    // No invented provenance: "we do not know where this came from" and "it
    // came from the cabinet layout" are different statements.
    expect(html).not.toContain('cabinet layout');
  });

  it('no spacing means no zones, and so no spacing line either', () => {
    const html = render([pairFor('low', 400, 900, null, null)]);
    expect(html).not.toContain(XO_SPACING_CLASS);
    expect(html).not.toContain('zones from c-t-c');
  });
});

describe('(F3c) the smoothing consistency line', () => {
  it('appears only on a mismatch', () => {
    const pairs = [pairFor('low', 400, 600, null)];
    const mismatch = render(pairs, smoothingConsistency(1 / 12));
    expect(mismatch).toContain(XO_SMOOTHING_CLASS);
    expect(mismatch).toContain('the tuner searches on 1/12 oct');
    expect(mismatch).toContain('acceptance judges on 1/6 oct');

    const agree = render(pairs, smoothingConsistency(WINDOW_SMOOTHING_OCTAVES));
    expect(agree).not.toContain(XO_SMOOTHING_CLASS);
    // And "not stated" says nothing either, which is not the same as agreeing.
    expect(render(pairs, smoothingConsistency(null))).not.toContain(XO_SMOOTHING_CLASS);
    expect(render(pairs, null)).not.toContain(XO_SMOOTHING_CLASS);
  });

  it('it is a line and nothing more: no button, no field, no coupling', () => {
    const html = render([pairFor('low', 400, 600, null)], smoothingConsistency(1 / 12));
    const line = html.slice(html.indexOf(XO_SMOOTHING_CLASS));
    expect(line).not.toContain('<button');
    expect(line).not.toContain('<input');
    expect(line).not.toContain('<select');
    expect(html).toContain('Neither setting moves the other');
  });

  it('it shows even for a project with no adjacent pair yet', () => {
    // Empty pairs means the engine is ON and this project has nothing to
    // annotate; the smoothing difference is still true and still worth saying.
    const html = render([], smoothingConsistency(1 / 12));
    expect(html).toContain(XO_SMOOTHING_CLASS);
  });
});
