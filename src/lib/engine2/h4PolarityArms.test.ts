/**
 * H-4 — de armen bereiken de ontwerpstappen, en absent is de identiteit.
 *
 * `polarityArms.test.ts` toetst het VELD; dit bestand toetst wat er met een arm
 * gebeurt zodra hij een run wordt. Drie soorten claims, in de vorm die dit
 * project sinds V23 voor elke nieuwe sleutel eist:
 *
 *   P2   een gestelde polariteit die gelijk is aan wat de enumeratie zelf koos
 *        levert HETZELFDE ontwerp, veld voor veld — de sleutel kost niets;
 *   V23  de GESPIEGELDE arm levert aantoonbaar een ANDER ontwerp, want anders
 *        zijn de andere claims even waar voor een sleutel die nergens op
 *        aangesloten is;
 *   P4/H-1 de ACTIEVE overname kan per constructie geen arm krijgen: zij staat
 *        niet in het veld, dus de expansie ziet haar nooit.
 *
 * Plus de BRONSCANS op de twee ketens en op `App.tsx` — het UI-1-idioom, want
 * een functietest kan niet zeggen of de route de sleutel doorgeeft, en juist
 * dát is waar een polariteit tussen twee stappen verloren gaat (U-3d).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { designThreeWay } from '../threeWayDesign.ts';
import { optimizeVirtualFilters } from '../vfOptimizer.ts';
import { topologyClassKey } from './optimizer/diversity.ts';
import {
  polarityArmsOf,
  statedInvertedForTwoWay,
  statedPolarityForThreeWay,
} from './predesign/polarityArms.ts';
import { loadGolden, casus1Manifest, casus1Files } from './casus1.fixture.ts';
import { CASUS1_V2_SETTINGS, casus1ChainInput } from './casus1V2.fixture.ts';
import { ACTIVE_WAY, PASSIVE_LOWEST_WAY, casus1hActiveAt, casus1hField, casus1hFiles, casus1hManifest } from './casus1h.fixture.ts';
import { casus1bChainInput, casus1bFiles, casus1bManifest, casus1bSeed } from './casus1b.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comment-free source — a scan about CODE must not be satisfied by prose. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const S = CASUS1_V2_SETTINGS as unknown as Record<string, unknown>;

describe('H-4 — the three-way design step honours a stated polarity', () => {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden);
  const files = casus1Files(manifest);
  const g = casus1ChainInput(manifest, files, golden);
  const base = {
    w: g.w,
    m: g.m,
    t: g.t,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: 285.1,
    xoHigh: 2251.4,
    band: S.band as [number, number],
    phasePriority: S.phasePriority as number,
    xoLowWindow: [253, 321] as [number, number],
    xoHighWindow: [2200, 2304] as [number, number],
    hpFloorHz: S.hpFloorHz as number,
    structureLow: { kind: 'LR', order: 4 } as const,
    structureHigh: { kind: 'LR', order: 4 } as const,
    breakupGuard: S.breakupGuard as boolean,
    eqBandsPerBranch: S.eqBands as number,
  };
  const free = designThreeWay(base);

  it('P2 — stating what the enumeration chose delivers the same design, field for field', () => {
    const bound = designThreeWay({
      ...base,
      statedPolarity: { midInverted: free.midInverted, tweeterInverted: free.tweeterInverted },
    });
    expect(bound.fx).toBe(free.fx);
    expect(bound.xoLow).toBe(free.xoLow);
    expect(bound.xoHigh).toBe(free.xoHigh);
    expect(JSON.stringify(bound.specs)).toBe(JSON.stringify(free.specs));
  });

  it('V23 — the MIRRORED arm is a different design, not the same one with a sign', () => {
    const mirrored = designThreeWay({
      ...base,
      statedPolarity: { midInverted: !free.midInverted, tweeterInverted: free.tweeterInverted },
    });
    expect(mirrored.midInverted).toBe(!free.midInverted);
    expect(mirrored.fx).not.toBe(free.fx);
    /* The knees are REFINED against the arm's own phase targets, so what comes
     * out is a design and not a relabelling; on this candidate they land apart. */
    expect(
      mirrored.xoLow !== free.xoLow ||
        mirrored.xoHigh !== free.xoHigh ||
        JSON.stringify(mirrored.specs) !== JSON.stringify(free.specs),
    ).toBe(true);
  });

  it('the two arms are in DIFFERENT topology classes, so a shortlist cannot treat them as clones', () => {
    const cs = [
      { pairLabel: 'woofer→mid', lower: 'woofer', upper: 'mid', hz: 285.1, alignment: { kind: 'LR', order: 4 } },
      { pairLabel: 'mid→tweeter', lower: 'mid', upper: 'tweeter', hz: 2251.4, alignment: { kind: 'LR', order: 4 } },
    ] as never;
    const arms = polarityArmsOf(cs, [true, false]);
    const flanks = [
      { way: 'mid', side: 'hp' as const, kind: 'LR', order: 4 },
      { way: 'woofer', side: 'lp' as const, kind: 'LR', order: 4 },
    ];
    const keys = arms.map((a) => topologyClassKey({ flanks, inverted: a.invertedWays }));
    expect(new Set(keys).size).toBe(arms.length);
  });
});

describe('H-4 — the two-way design step honours a stated polarity', () => {
  const manifest = casus1bManifest();
  const files = casus1bFiles(manifest);
  const g = casus1bChainInput(manifest, files);
  const opts = {
    phasePriority: 0.5,
    band: [400, 18000] as [number, number],
    eqBandsPerDriver: 0,
    maxIterations: 60,
    structurePreference: { kind: 'LR', order: 4 } as const,
  };
  const adjust = { offsetMm: 0, trimDb: 0, inverted: false };
  const free = optimizeVirtualFilters(g.grid, g.w, g.t, casus1bSeed(), adjust, opts);

  it('P2 — stating what the descent chose delivers the same design', () => {
    const bound = optimizeVirtualFilters(g.grid, g.w, g.t, casus1bSeed(), adjust, {
      ...opts,
      statedInverted: free.inverted,
    });
    expect(bound.inverted).toBe(free.inverted);
    expect(bound.objective).toBe(free.objective);
    expect(JSON.stringify(bound.specs)).toBe(JSON.stringify(free.specs));
  });

  it('V23 — the mirrored arm reaches the search and comes out different', () => {
    const mirrored = optimizeVirtualFilters(g.grid, g.w, g.t, casus1bSeed(), adjust, {
      ...opts,
      statedInverted: !free.inverted,
    });
    expect(mirrored.inverted).toBe(!free.inverted);
    expect(mirrored.objective).not.toBe(free.objective);
  });
});

describe('H-4 — the ACTIVE handover can never get an arm (H-1 stands by construction)', () => {
  it('casus 1h: the field names only passive ways, so the expansion never sees the active one', () => {
    const manifest = casus1hManifest();
    const files = casus1hFiles(manifest);
    const active = casus1hActiveAt(400, manifest, files);
    const f = casus1hField(active.report);
    expect(f.field.candidates.length).toBeGreaterThan(0);
    for (const c of f.field.candidates) {
      for (const x of c.crossings) {
        expect(x.lower).not.toBe(ACTIVE_WAY);
        expect(x.upper).not.toBe(ACTIVE_WAY);
      }
      /* And the lowest way this field can ever invert is the lowest PASSIVE
       * one — the reference of the accumulation, which is never in the set. */
      const arms = polarityArmsOf(c.crossings, c.crossings.map(() => true));
      for (const a of arms) {
        expect(a.invertedWays).not.toContain(ACTIVE_WAY);
        expect(a.invertedWays).not.toContain(PASSIVE_LOWEST_WAY);
      }
    }
  });
});

describe('H-4 — the routes carry the polarity (source scans)', () => {
  it('both chains forward a stated polarity to their design step, spread so absent is absent', () => {
    const three = code('lib/threeWayChain.ts');
    expect(three).toContain('...(s.statedPolarity ? { statedPolarity: s.statedPolarity } : {})');
    const two = code('lib/designChain.ts');
    expect(two).toContain('...(s.statedInverted !== undefined ? { statedInverted: s.statedInverted } : {})');
  });

  it('both design steps bind their enumeration to it, and enumerate both without it', () => {
    const d3 = code('lib/threeWayDesign.ts');
    expect(d3).toContain('input.statedPolarity ? [input.statedPolarity.midInverted] : [false, true]');
    expect(d3).toContain('for (const midInverted of midPolarities)');
    expect(d3).toContain('for (const tweeterInverted of tweeterPolarities)');
    const vf = code('lib/vfOptimizer.ts');
    expect(vf).toContain('statedInverted === undefined ? [adjust.inverted, !adjust.inverted] : [statedInverted]');
    expect(vf).toContain('for (const inverted of polarities)');
  });

  it('the app states it from the CANDIDATE on both routes, and reads a margin on both', () => {
    const app = code('App.tsx');
    expect(app).toContain('statedPolarity: statedPolarityForThreeWay(cand.polarity)');
    expect(app).toContain('statedInverted: statedInvertedForTwoWay(cand.polarity)');
    /* Both routes must READ the margin, or the mode can never seed an arm and
     * the whole expansion is unreachable from the app. */
    expect(app.split('polarityMarginReader(polarityBranchOf)').length - 1).toBe(2);
  });

  it('the three fixtures state it too, so a regenerated corpus can carry arms', () => {
    for (const p of ['lib/engine2/casus1b.fixture.ts', 'lib/engine2/casus1h.fixture.ts'])
      expect(code(p)).toContain('statedInverted: statedInvertedForTwoWay(c.polarity)');
    for (const p of ['../scripts/generate-casus1-v2-candidates.ts', '../scripts/generate-casus2-v2-candidates.ts'])
      expect(code(p)).toContain('statedPolarity: statedPolarityForThreeWay(c.polarity)');
  });
});

describe('H-4 — the translation the app uses is the module’s, not a copy', () => {
  it('neither route spells the accumulation itself', () => {
    const app = code('App.tsx');
    expect(app).not.toMatch(/midInverted:\s*cand/);
    expect(app).not.toMatch(/tweeterInverted:\s*cand/);
  });

  it('and the two translators agree with each other on a one-handover arm', () => {
    const cs = [
      { pairLabel: 'mid→tweeter', lower: 'mid', upper: 'tweeter', hz: 2251.4, alignment: { kind: 'LR', order: 4 } },
    ] as never;
    for (const a of polarityArmsOf(cs, [true])) {
      expect(statedInvertedForTwoWay(a)).toBe(statedPolarityForThreeWay(a).midInverted);
    }
  });
});
