/**
 * E-6 (V52, B-5 = B) — ONE PHASE PRIORITY, THREE READERS.
 *
 * Until E-6 the design step and the synthesis read the DECLARED
 * `phasePriority` (always `DEFAULT_PHASE_PRIORITY`, because the app never gave
 * the slider to the declaration), while the tuner read the RAW
 * `input.settings.phasePriority`: the worker built `network.weights` from the
 * payload before the declaration was applied, and the hook spreads those
 * weights last. A run with the slider on 75 % designed on 50/50 and tuned on
 * 25/75 (U-9, N1; measured on seven routes in `docs/E-6_meting.md`).
 *
 * Since E-6 the worker builds those weights from the declared chain input, and
 * the slider is gone. Three claims:
 *
 *  1. SOURCE SCAN. `worker.ts` never reads `input.settings.phasePriority`, and
 *     both tuner-weight literals read `chainInput.settings.phasePriority`.
 *  2. THROUGH THE REAL ROUTE (`handleV2Request`, payload through
 *     `structuredClone`). With observers on the three readers, whatever the
 *     raw setting holds (0.25, 0.75), the design step, the synthesis and the
 *     tuner all receive DEFAULT_PHASE_PRIORITY — on the three-way scan, the
 *     two-way drawn-network tune (⚙) and the three-way minimise (✂). The
 *     observer on the tuner throws, so nothing is tuned.
 *  3. P2. A payload WITHOUT a candidate carries no declaration, and then the
 *     tuner reads the caller's own setting, as before E-6.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as designMod from '../../threeWayDesign.ts';
import * as synthMod from '../../synthesis.ts';
import * as netMod from '../../netOptimizer.ts';
import * as minMod from '../../minimize.ts';
import { DEFAULT_PHASE_PRIORITY } from '../../netOptimizer.ts';
import { logspace, resample, type GriddedResponse } from '../../dsp.ts';
import { cplx, fromPolar } from '../../complex.ts';
import { parseFrd } from '../../parsers/frd.ts';
import { parseZma } from '../../parsers/zma.ts';
import { AUTO_STRUCTS } from '../../threeWayDesign.ts';
import { filterTemplate } from '../../filterTemplates.ts';
import type { Chain3Input } from '../../threeWayChain.ts';
import type { ChainInput } from '../../designChain.ts';
import { declareCandidateChainChoices, declareCandidateChoices } from './candidateDeclaration.ts';
import { buildCandidateField } from '../predesign/candidateField.ts';
import type { XoWindowInput } from '../predesign/xoWindow.ts';
import { handleV2Request } from './worker.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = readFileSync(join(HERE, 'worker.ts'), 'utf-8');
const FIX = join(HERE, '..', '..', 'parsers', 'fixtures');

/* ------------------------------------------------------------------ *
 * 1 — the source scan
 * ------------------------------------------------------------------ */

/** Code only: the reasons in the comments cite the old reader by name. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('E-6 — the tuner weight is read from the declared chain input', () => {
  it('worker.ts never reads the raw `input.settings.phasePriority`', () => {
    expect(code(WORKER)).not.toMatch(/input\.settings\.phasePriority/);
  });
  it('both tuner-weight literals read `chainInput.settings.phasePriority`, and nothing else sets it', () => {
    const c = code(WORKER);
    expect(c.match(/phasePriority: chainInput\.settings\.phasePriority,/g)?.length).toBe(2);
    /* The third place reads the network it was handed; it must stay that. */
    expect(c).toContain('phasePriority: network.weights.phasePriority,');
    expect(c.match(/phasePriority:/g)?.length).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * 2/3 — through the real route, with observers
 * ------------------------------------------------------------------ */

const SENTINEL = 'E6-OBSERVER-STOP';
let seen = { design: [] as number[], synth: [] as number[], tuner: [] as number[] };
let on = false;
const restore: (() => void)[] = [];

function patch(mod: object, name: string, wrap: (o: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown) {
  const d = Object.getOwnPropertyDescriptor(mod, name)!;
  const orig = (mod as Record<string, unknown>)[name] as (...a: unknown[]) => unknown;
  const fn = wrap(orig);
  Object.defineProperty(mod, name, { configurable: true, enumerable: true, get: () => fn });
  restore.push(() => Object.defineProperty(mod, name, d));
}

beforeAll(() => {
  patch(designMod, 'designThreeWay', (o) => (input: unknown) => {
    if (on) seen.design.push((input as { phasePriority: number }).phasePriority);
    return o(input);
  });
  patch(synthMod, 'synthesize', (o) => (...a: unknown[]) => {
    if (on) seen.synth.push((a[a.length - 1] as { phasePriority?: number }).phasePriority ?? 0.5);
    return o(...a);
  });
  patch(netMod, 'optimizeNetworkValues', (o) => (...a: unknown[]) => {
    if (on) {
      seen.tuner.push((a[6] as { phasePriority?: number }).phasePriority ?? DEFAULT_PHASE_PRIORITY);
      throw new Error(SENTINEL);
    }
    return o(...a);
  });
  patch(minMod, 'minimizeNetwork', (o) => (...a: unknown[]) => {
    if (on) {
      seen.tuner.push((a[6] as { tuneOpts?: { phasePriority?: number } }).tuneOpts?.phasePriority ?? DEFAULT_PHASE_PRIORITY);
      throw new Error(SENTINEL);
    }
    return o(...a);
  });
});
afterAll(() => {
  for (const r of restore) r();
});

function observe(kind: string, payload: unknown) {
  seen = { design: [], synth: [], tuner: [] };
  on = true;
  try {
    handleV2Request(structuredClone({ id: 1, kind, payload }) as never, () => {});
  } catch {
    /* the sentinel, or the error message it becomes */
  } finally {
    on = false;
  }
  expect(seen.tuner.length, `${kind}: the tuner observer did not fire`).toBeGreaterThan(0);
  return seen;
}

/* The three-way scan on the small parsers fixture (`chainChoices.test.ts`). */
const PGRID = logspace(210, 19000, 64);
const pFrd = (n: string): GriddedResponse => {
  const f = parseFrd(readFileSync(join(FIX, n), 'utf-8'));
  return resample(f.freq, f.spl, f.phase, PGRID);
};
const pZ = (n: string) => {
  const z = parseZma(readFileSync(join(FIX, n), 'utf-8'));
  const g = resample(z.freq, z.magnitude, z.phase, PGRID, { clampEdges: true });
  return g.spl.map((m, i) => fromPolar(m, (g.phaseDeg[i] * Math.PI) / 180));
};
const WIN: XoWindowInput[] = [
  { lower: 'woofer', upper: 'mid', order: 4, validityFloorHz: 400, validityFloorSource: 'E-6', upperFsHz: null, lowerBreakups: [], lowerMinus6Hz: 800, lowerMinus6AngleDeg: 30, spacingMm: null },
  { lower: 'mid', upper: 'tweeter', order: 4, validityFloorHz: 2000, validityFloorSource: 'E-6', upperFsHz: null, lowerBreakups: [], lowerMinus6Hz: 4000, lowerMinus6AngleDeg: 30, spacingMm: null },
];
function scan3(raw: number) {
  const c = buildCandidateField({ windowInputs: WIN, perPair: [{ statedOrder: 4 }, { statedOrder: 4 }], alignments: AUTO_STRUCTS, minSpacingOctaves: 1 }).field.candidates[0];
  const input: Chain3Input = {
    grid: [...PGRID],
    w: pFrd('mid_hor0_mettape.txt'),
    m: pFrd('mid_hor0_mettape.txt'),
    t: pFrd('tweet_hor0_mettape.txt'),
    driverZ: { woofer: pZ('mid_Backwavecone_sheep75gram.ZMA'), mid: pZ('mid_Backwavecone_sheep75gram.ZMA'), tweeter: pZ('tweeter.ZMA') },
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    xoLowRange: c.crossings[0].cageHz,
    xoHighRange: c.crossings[1].cageHz,
    label: c.label,
    settings: {
      phasePriority: raw,
      synthMode: 'filter',
      band: [250, 18000],
      targets: { rippleDb: 2.5, phaseDeg: 15 },
      catalogSnap: false,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  return {
    input,
    v2: { gates: {}, budgets: {}, determinism: { seed: 41, budgetEvaluations: 80 } },
    candidate: {
      declaration: declareCandidateChoices({ cages: c.crossings.map((x) => x.cageHz), windowFloorsHz: c.crossings.map((x) => x.windowHz[0]), multiWay: true, stated: { band: [250, 18000], zFloorStrict: true } }),
      /* The app's form: the declaration is built without the slider. */
      chainDeclaration: declareCandidateChainChoices({ stated: {} }),
      provenance: 'E-6',
      orderByModel: { mid: 4, tweeter: 4 },
    },
  };
}

/* The drawn networks (`drawnTune3.test.ts`, and its two-way counterpart). */
const DGRID = logspace(60, 16000, 72);
const flat: GriddedResponse = { freq: [...DGRID], spl: DGRID.map(() => 88), phaseDeg: DGRID.map(() => 0) };
const z8 = DGRID.map(() => cplx(8, 0));
const BAND: [number, number] = [80, 14000];
const v2Drawn = {
  gates: {},
  budgets: {},
  determinism: { seed: 7, budgetEvaluations: 400 },
  judgeBandHz: BAND,
};
const drawnCandidate = (withCandidate: boolean) =>
  withCandidate
    ? {
        candidate: {
          declaration: declareCandidateChoices({ cages: [null, null], windowFloorsHz: [null, null], multiWay: true, stated: { band: BAND, zFloorStrict: true } }),
          chainDeclaration: declareCandidateChainChoices({ stated: {} }),
          provenance: 'E-6 — a drawn network',
        },
      }
    : {};
function drawn3(raw: number, minimize: boolean, withCandidate = true) {
  return {
    input: {
      grid: [...DGRID], w: flat, m: flat, t: flat,
      driverZ: { woofer: z8, mid: z8, tweeter: z8 },
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      midAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      xoLow: 0, xoHigh: 0, label: 'drawn 3-way',
      settings: { phasePriority: raw, synthMode: 'acoustic', band: BAND, targets: { rippleDb: 2.5, phaseDeg: 15 }, xoFloorPairs: [null, null] },
    },
    parts: filterTemplate({ order: 2, wayCount: 3, models: [] }).parts,
    label: 'drawn 3-way',
    v2: v2Drawn,
    ...drawnCandidate(withCandidate),
    ...(minimize ? { minimize: { targets: { rippleDb: 2.5, phaseDeg: 15 } } } : {}),
  };
}
function drawn2(raw: number) {
  const input: ChainInput = {
    grid: [...DGRID],
    w: flat,
    t: flat,
    driverZ: { mid: z8, tweeter: z8 },
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    seed: { woofer: { hp: { enabled: false, kind: 'LR', order: 2, freq: 200 }, lp: { enabled: true, kind: 'LR', order: 2, freq: 2500 } }, tweeter: { hp: { enabled: true, kind: 'LR', order: 2, freq: 2500 }, lp: { enabled: false, kind: 'LR', order: 2, freq: 20000 } } },
    settings: { phasePriority: raw, synthMode: 'acoustic', band: BAND, targets: { rippleDb: 2.5, phaseDeg: 15 } },
  } as unknown as ChainInput;
  return {
    input,
    parts: filterTemplate({ order: 2, wayCount: 2, models: [] }).parts,
    label: 'drawn 2-way',
    v2: v2Drawn,
    ...drawnCandidate(true),
  };
}

describe('E-6 — the three readers receive one number, through handleV2Request', () => {
  it.each([0.25, 0.75])('three-way scan, raw setting %s: design step, synthesis and tuner all read the engine’s 50/50', (raw) => {
    const s = observe('v2Chain3One', scan3(raw));
    expect(s.design.length).toBeGreaterThan(0);
    expect(s.synth.length).toBeGreaterThan(0);
    expect(new Set([...s.design, ...s.synth, ...s.tuner])).toEqual(new Set([DEFAULT_PHASE_PRIORITY]));
  }, 120_000);

  it.each([0.25, 0.75])('⚙ two-way drawn tune, raw setting %s: the tuner reads the engine’s 50/50', (raw) => {
    expect(observe('v2TuneNetlist', drawn2(raw)).tuner).toEqual([DEFAULT_PHASE_PRIORITY]);
  });

  it.each([0.25, 0.75])('✂ three-way minimise, raw setting %s: the tuner options read the engine’s 50/50', (raw) => {
    expect(observe('v2TuneNetlist3', drawn3(raw, true)).tuner).toEqual([DEFAULT_PHASE_PRIORITY]);
  });

  it('P2 — without a candidate there is no declaration, and the tuner reads the caller’s own setting', () => {
    expect(observe('v2TuneNetlist3', drawn3(0.25, false, false)).tuner).toEqual([0.25]);
  });
});
