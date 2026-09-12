/**
 * E-2 — THE v2 PANEL CARRIES THE "NOT SIMULATED" TAG ITSELF (UI-2 leftover).
 *
 * UI-2 tagged every chart heading when the drawing could not be simulated
 * and left the v2 panel untagged: a full report, judging a network nobody
 * could simulate, beside a chip that said "Not simulated". Rendered here the
 * way `xoWindowAnnotation.test.tsx` renders — `renderToStaticMarkup` in plain
 * node, the panel being presentation-only — with the claim on both sides:
 * the tag appears with the prop and does not without it.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EngineV2Panel, V2_STALE_TAG_CLASS } from './EngineV2Panel.tsx';
import { notSimulatedTag } from '../lib/networkReadiness.ts';
import { buildReport } from '../lib/engine2/report.ts';
import { casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden } from '../lib/engine2/casus1.fixture.ts';
import { FLAT_TARGET } from '../lib/engine2/requirements/targetCurve.ts';
import { NO_SUBJECT } from '../lib/engine2/capability.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry: casus1Geometry(golden),
  settings: { targetCurve: FLAT_TARGET },
});

describe('the v2 panel and the not-simulated state', () => {
  it('without the prop: no tag, no dimming', () => {
    const html = renderToStaticMarkup(<EngineV2Panel report={report} />);
    expect(html).not.toContain(V2_STALE_TAG_CLASS);
    expect(html).not.toContain('sim-stale');
    expect(html).not.toContain('network not simulated');
  });

  it('with the prop: the same tag the charts carry, in the head, and the panel dimmed', () => {
    const tag = notSimulatedTag('previous', 'Not simulable: the network has no generator.');
    const html = renderToStaticMarkup(<EngineV2Panel report={report} notSimulated={tag} />);
    expect(html).toContain(`class="${V2_STALE_TAG_CLASS}"`);
    expect(html).toContain('previous state — network not simulated');
    expect(html).toMatch(/class="panel v2-panel sim-stale"/);
    // The refusal itself is the tooltip's first line.
    expect(html).toContain('Not simulable: the network has no generator.');
  });
});

/**
 * E-5 — THE PANEL SURVIVES A PROJECT WITH ONE MEASURED WAY.
 *
 * Sander removed angle and impedance files from the inventory and the render
 * died with "Cannot read properties of undefined (reading 'title')" and a black
 * screen. The capability grid read `cells.find(…)!` for every metric in the
 * register, and a metric whose SUBJECT does not exist — every pair metric on a
 * one-way project — had no cell at all. Reproduced here by taking files away,
 * which is what the inventory's remove button does.
 */
describe('E-5 — a report with fewer ways than metrics still renders', () => {
  const reportWith = (drivers: string[]) =>
    buildReport({
      manifest: { ...manifest, entries: manifest.entries.filter((e) => drivers.includes(e.driver)) },
      files: files.filter((f) => drivers.includes(f.entry.driver)),
      filter: null,
      geometry: casus1Geometry(golden),
      settings: { targetCurve: FLAT_TARGET },
    });

  it('one way, and no way at all, both render — with the reason on the screen', () => {
    for (const set of [['woofer'], []]) {
      const r = reportWith(set);
      const html = renderToStaticMarkup(<EngineV2Panel report={r} />);
      expect(html.length, JSON.stringify(set)).toBeGreaterThan(1000);
      expect(html, JSON.stringify(set)).toContain(NO_SUBJECT);
      expect(html, JSON.stringify(set)).toMatch(/no adjacent pair|no measured way/);
    }
  });

  it('and the three-way panel is unchanged — no extra column, same markup (P2)', () => {
    const html = renderToStaticMarkup(<EngineV2Panel report={reportWith(['woofer', 'mid', 'tweeter'])} />);
    expect(html).not.toContain(NO_SUBJECT);
  });
});
