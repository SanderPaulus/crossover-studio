/**
 * GUIDED RESULT — the compact summary a guided run reads in place of the full
 * Engine v2 panel. The claims: every STATED gate is a line with its verdict and
 * none is folded; an unmet requirement says NOT met; unstated gates are named,
 * not hidden; the bottom of the judged band is said in plain words; the full
 * panel is still there behind one fold; and expert is untouched (App scan).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuidedV2Summary, guidedVerdict } from './GuidedV2Summary.tsx';
import { EngineV2Panel } from './EngineV2Panel.tsx';
import { buildReport } from '../lib/engine2/report.ts';
import type { GateVerdict } from '../lib/engine2/optimizer/gates.ts';
import { casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden } from '../lib/engine2/casus1.fixture.ts';
import { FLAT_TARGET } from '../lib/engine2/requirements/targetCurve.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const base = { manifest, files, geometry: casus1Geometry(golden) };
const loaded = buildReport({
  ...base,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  settings: { targetCurve: FLAT_TARGET, ampMinLoadOhm: 2.6 },
});
const render = (report = loaded) =>
  renderToStaticMarkup(
    <GuidedV2Summary report={report}>
      <EngineV2Panel report={report} />
    </GuidedV2Summary>,
  );

describe('the guided result summary', () => {
  it('every stated gate is one line with its verdict, outside the fold', () => {
    const html = render();
    const [top] = html.split('<details');
    const stated = loaded.gates.verdicts.filter((v) => v.active);
    expect(stated.length).toBeGreaterThan(0);
    expect(top).toContain('Load on the amplifier (lowest impedance)');
    expect(top.match(/<li>/g)!.length).toBeGreaterThanOrEqual(stated.length);
  });

  it('the four verdicts are kept apart, and an unmet one reads NOT met', () => {
    const v = (o: Partial<GateVerdict>) => ({ value: 1, pass: true, withinToleranceOnly: false, ...o }) as GateVerdict;
    expect(guidedVerdict(v({}))).toBe('met');
    expect(guidedVerdict(v({ withinToleranceOnly: true }))).toBe('tolerance');
    expect(guidedVerdict(v({ pass: false }))).toBe('failed');
    expect(guidedVerdict(v({ value: null }))).toBe('unjudged');
    const failing = buildReport({
      ...base,
      filter: casus1Filter('HUIDIG', manifest, files, golden),
      settings: { targetCurve: FLAT_TARGET, ampMinLoadOhm: 50 },
    });
    const [top] = render(failing).split('<details');
    expect(top).toContain('NOT met');
  });

  it('unstated gates are named, not dropped', () => {
    const [top] = render().split('<details');
    expect(top).toContain('Not judged, because you stated no limit');
    expect(top).toContain('Power lost in resistors');
  });

  it('the bottom of the judged band is said in plain words', () => {
    const bottom = Math.round(loaded.system.splBandHz![0]);
    expect(render()).toContain(`Below ${bottom} Hz the measurements are not valid`);
  });

  it('the full panel is still there, behind one fold', () => {
    const html = render();
    const [top, fold] = html.split('<details');
    expect(fold).toContain('Hard gates');
    expect(top).not.toContain('Capability matrix');
  });

  it('no network: says so and judges nothing', () => {
    const bare = buildReport({ ...base, filter: null, settings: { targetCurve: FLAT_TARGET } });
    const [top] = render(bare).split('<details');
    expect(top).toContain('No design is loaded');
    expect(top).not.toContain('Your requirements');
  });

  it('App: guided gets the summary, expert keeps the full panel', () => {
    const app = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
    expect(app).toMatch(/uiMode === 'guided' \? \(\s*<GuidedV2Summary/);
    expect(app.match(/<EngineV2Panel\b/g)!.length).toBe(2);
  });
});
