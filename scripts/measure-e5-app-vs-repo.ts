/**
 * E-5 — WHY THE APP'S TUNER DOES NOT BUILD THE REFLEX-PEAK TRAP, MEASURED.
 *
 * Run with `npx vite-node scripts/measure-e5-app-vs-repo.ts` — seconds, no
 * chain run and no tune. `E5_RUN=1` adds one FULL chain run per arm on one
 * candidate (minutes to half an hour each), which is the only way to see
 * whether the delivery KEEPS what the seed was given.
 *
 * THE QUESTION. Sander ran the full field on the Koan 67.7 L set with every
 * requirement stated and got 0 of 4: every candidate refused by M-D with
 * 2.32–12.34 dB of resonant amplification against a stated 1.4 — while the
 * C-2 corpus in this repository holds ten netlists on comparable handovers that
 * meet the same budget, every one of them carrying a damped series-LC trap on
 * the reflex peak. Same engine, same promise, two outcomes.
 *
 * WHY THIS SCRIPT IS ON CASUS 1 AND NOT ON THE 67.7 L SET. Because the answer
 * is not about the data. The two arms below differ in exactly two numbers —
 * where the chain LOOKS and where it JUDGES — and everything else, the
 * measurement set included, is the same object. A comparison across two
 * measurement sets could not tell "the app asks a different question" from
 * "the new woofer is harder", which is precisely the confusion this measures
 * its way out of. What the 67.7 L set answers is the end-to-end check, and
 * that is a browser run (casebook E-5).
 *
 * WHAT IT MEASURES, in four arms:
 *
 *   A  repo grid + repo band   — what every fixture has run since M-1
 *   B  repo grid + app band    — the validity INTERSECTION as the floor
 *   C  app grid  + repo band   — the derived floor on the plot grid
 *   D  app grid  + app band    — what the app ran until E-5
 *
 * and per arm, per candidate: the cut-only EQ bands the design step places on
 * the lowest way, whether the synthesis turned one of them into a damped trap
 * near the measured reflex peak, and M-D on the seed network.
 *
 * THE TRAP IS NOT THE `Fs` TRAP. `synthesis.ts` has a slot called "Fs trap" and
 * it is gated on `spec.hp.enabled` — the lowest way has no high pass, so that
 * door is shut on every route and always was. The trap the corpus carries comes
 * in through an EQ BAND: the design step places a cut-only peak at the sum's
 * worst positive excursion INSIDE THE JUDGED BAND, and the synthesis builds a
 * series L-C-R across the driver for it. So the judged band decides whether the
 * trap can exist at all, and the grid decides whether the band can be seen.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1FilterFromParts,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import {
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_LF_RESONANT_BUDGET_DB,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BAND_SOURCE,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_GRID,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_TARGET_CURVE,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { corpusBank } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import { logspace, type GriddedResponse } from '../src/lib/dsp.ts';
import { designThreeWay } from '../src/lib/threeWayDesign.ts';
import { mergeSynthesizedSchematics } from '../src/lib/schematicEdit.ts';
import { synthesize } from '../src/lib/synthesis.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import type { Chain3Input, Chain3Result } from '../src/lib/threeWayChain.ts';
import type { DriverFilterSpec } from '../src/lib/filters.ts';
import type { VxpCrossover } from '../src/lib/parsers/vxp.ts';

/* ---------------- the two frames, as named constants ------------------- */

/** The app's plot-grid floor: `max(the fMin field, the lowest measurement)`, and
 *  the fMin field's own fallback is this number (`App.tsx`). P6-OK: it is the
 *  app's v1 default being MEASURED here, not a project number being used. */
const APP_GRID_FLOOR_HZ = 200;
/** The app's grid resolution (`GRID_N` in `App.tsx`). */
const APP_GRID_POINTS = 600;
/** The app's judged-band floor on casus 1: the tweeter's gate, 2/T tapered.
 *  Read off the report below rather than typed — this is only the fallback for
 *  a set where no source is gated. */
const APP_BAND_FLOOR_FALLBACK_HZ = 455;
/** Where the synthesis' alive-mask sits (`ALIVE_DB` in `threeWayChain.ts`). */
const ALIVE_DB = -300;
/** How far from f_p a shunt L-C resonance still counts as "on the reflex peak".
 *  Half an octave either way — wide enough to catch a trap the refine moved,
 *  narrow enough that a crossover-region notch cannot be mistaken for one. */
const TRAP_WINDOW_OCTAVES = 0.5;

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const reportSettings = {
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  ...casus1ExcursionSettings(golden),
  ...CASUS1_COIL_DCR_SETTINGS,
  targetCurve: CASUS1_TARGET_CURVE,
};

/** The tweeter's validity floor — the app's judged-band floor on this set. */
const appBandFloorHz = (() => {
  const r = buildReport({ manifest, files, filter: null, geometry, settings: reportSettings });
  const highest = r.driversLowToHigh[r.driversLowToHigh.length - 1];
  const d = r.ingest.drivers.find((x) => x.driver === highest);
  return d?.onAxis ? d.onAxis.bandHz[0] : APP_BAND_FLOOR_FALLBACK_HZ;
})();

/**
 * The EQ budget per branch the v2 ROUTE itself declares — read off the
 * declaration rather than restated here. It is the one door to a trap on the
 * lowest way (`chainChoices.ts` says so at the top of its own file), so a
 * number typed in beside it would be the fixture measuring something the route
 * does not run (V27's lesson, and V41's).
 */
const EQ_BANDS_PER_BRANCH = (() => {
  const r = buildReport({
    manifest,
    files,
    filter: casus1Filter('HUIDIG', manifest, files, golden),
    geometry,
    settings: reportSettings,
  });
  const c = casus1Field(r).field.candidates[0];
  const n = casus1V2Declaration(c, casus1ChainInput(manifest, files, golden).safety).chainDeclaration
    ?.stated.eqBands;
  if (typeof n !== 'number') throw new Error('E-5: the route declares no EQ budget to measure with');
  return n;
})();

const APP_GRID = logspace(APP_GRID_FLOOR_HZ, CASUS1_V2_GRID[CASUS1_V2_GRID.length - 1], APP_GRID_POINTS);
const repoFrame = casus1ChainInput(manifest, files, golden);
const facts = casus1V2Facts(
  buildReport({ manifest, files, filter: casus1Filter('HUIDIG', manifest, files, golden), geometry, settings: reportSettings }),
  manifest,
  files,
);
const appFrame = casus1ChainInput(manifest, files, golden, APP_GRID);

interface Arm {
  id: string;
  what: string;
  frame: typeof repoFrame;
  band: [number, number];
}
const ARMS: Arm[] = [
  { id: 'A', what: 'repo grid + repo band', frame: repoFrame, band: [CASUS1_V2_BAND_HZ[0], CASUS1_V2_BAND_HZ[1]] },
  { id: 'B', what: 'repo grid + app  band', frame: repoFrame, band: [appBandFloorHz, CASUS1_V2_BAND_HZ[1]] },
  { id: 'C', what: 'app  grid + repo band', frame: appFrame, band: [CASUS1_V2_BAND_HZ[0], CASUS1_V2_BAND_HZ[1]] },
  { id: 'D', what: 'app  grid + app  band', frame: appFrame, band: [appBandFloorHz, CASUS1_V2_BAND_HZ[1]] },
];

/** The handovers to measure on. Sanders four positions where casus 1's own
 *  window admits them, plus the two the C-2 corpus actually delivered on. */
const CANDIDATES: { label: string; low: number; high: number }[] = [
  { label: '204 · 2251', low: 204, high: 2250.6 },
  { label: '335 · 2251', low: 334.9, high: 2250.6 },
  { label: '550 · 2251', low: 549.7, high: 2250.6 },
];

/* ---------------- the seed of one candidate in one arm ----------------- */

interface SeedRow {
  arm: string;
  candidate: string;
  wooferEq: string[];
  trapHz: number | null;
  trapDampedBy: 'R' | 'coil DCR' | null;
  lowestWaySeriesMh: number;
  mdExtraDb: number | null;
  mdResonantDb: number | null;
}

function seedOf(arm: Arm, cand: (typeof CANDIDATES)[number]): SeedRow {
  const { frame } = arm;
  const design = designThreeWay({
    w: frame.w,
    m: frame.m,
    t: frame.t,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: cand.low,
    xoHigh: cand.high,
    band: arm.band,
    phasePriority: CASUS1_V2_SETTINGS.phasePriority,
    structureLow: { kind: 'LR', order: 4 },
    structureHigh: { kind: 'LR', order: 4 },
    eqBandsPerBranch: EQ_BANDS_PER_BRANCH,
    lowestWayLevelWork: 'none',
  });
  const synthOne = (spec: DriverFilterSpec, resp: GriddedResponse, key: string, lowest: boolean) => {
    const idxs: number[] = [];
    for (let i = 0; i < frame.grid.length; i++) if (resp.spl[i] > ALIVE_DB) idxs.push(i);
    return synthesize(
      spec,
      idxs.map((i) => frame.grid[i]),
      idxs.map((i) => frame.driverZ[key][i]),
      {
        mode: CASUS1_V2_SETTINGS.synthMode,
        phasePriority: CASUS1_V2_SETTINGS.phasePriority,
        corrections: 'auto',
        label: key,
        driverSplDb: idxs.map((i) => resp.spl[i]),
        ...(lowest ? { noLevelWork: true } : {}),
      },
    );
  };
  const parts = mergeSynthesizedSchematics([
    { components: synthOne(design.specs.woofer, frame.w, 'woofer', true).components, model: 'woofer' },
    { components: synthOne(design.specs.mid, frame.m, 'mid', false).components, model: 'mid' },
    { components: synthOne(design.specs.tweeter, frame.t, 'tweeter', false).components, model: 'tweeter' },
  ]).parts;
  const report = buildReport({
    manifest,
    files,
    filter: casus1FilterFromParts(`E5-${arm.id}`, parts, manifest, files),
    geometry,
    settings: reportSettings,
  });
  const bump = report.metrics.lfBump[0] ?? null;
  const trap = trapNear(parts, CASUS1_V2_BAND_SOURCE.fpHz);
  return {
    arm: `${arm.id} ${arm.what}`,
    candidate: cand.label,
    wooferEq: design.specs.woofer.eq
      .filter((b) => b.enabled)
      .map((b) => `${b.type ?? 'peak'}@${b.freq.toFixed(1)}Hz ${b.gainDb.toFixed(2)}dB q${b.q.toFixed(2)}`),
    trapHz: trap?.f0Hz ?? null,
    trapDampedBy: trap?.dampedBy ?? null,
    lowestWaySeriesMh: seriesInductanceMh(parts),
    mdExtraDb: bump ? Number(bump.result.extraDb.toFixed(3)) : null,
    mdResonantDb: bump && bump.result.resonantDb !== null ? Number(bump.result.resonantDb.toFixed(3)) : null,
  };
}

/* ---------------- reading a netlist: the trap and the coil -------------- */

type Part = VxpCrossover['parts'][number];

/** The lowest way's parts: the ones the schematic merge left UNPREFIXED
 *  (`mergeSynthesizedSchematics` prefixes every branch after the first). */
function lowestWayParts(parts: readonly Part[]): Part[] {
  return parts.filter((p) => !String(p.partId ?? '').includes('·'));
}

function valueOf(p: Part, name: string): number | null {
  const v = p.params?.find((x) => x.name === name)?.value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * A shunt L-C(-R) resonance on the lowest way within half an octave of f_p.
 *
 * Read off the DRAWING and not off a role name: the schematic places a notch
 * rung as adjacent L, C and (when it survived the audit) R at the same x, so an
 * L immediately followed by a C on the same branch IS the trap. Its resonance
 * is `1/(2π√(LC))` and its damping is either the R beside it or — when the part
 * audit removed that R — the coil's own DCR, which is a different design and has
 * to read differently.
 */
function trapNear(parts: readonly Part[], fpHz: number | null): { f0Hz: number; dampedBy: 'R' | 'coil DCR' } | null {
  if (fpHz === null) return null;
  const own = lowestWayParts(parts);
  for (let i = 0; i + 1 < own.length; i++) {
    if (own[i].type !== 'Inductor' || own[i + 1].type !== 'Capacitor') continue;
    const lMh = valueOf(own[i], 'L');
    const cUf = valueOf(own[i + 1], 'C');
    if (lMh === null || cUf === null || lMh <= 0 || cUf <= 0) continue;
    const f0 = 1 / (2 * Math.PI * Math.sqrt((lMh * 1e-3) * (cUf * 1e-6)));
    if (Math.abs(Math.log2(f0 / fpHz)) > TRAP_WINDOW_OCTAVES) continue;
    const next = own[i + 2];
    return { f0Hz: f0, dampedBy: next?.type === 'Resistor' ? 'R' : 'coil DCR' };
  }
  return null;
}

/** Total series inductance on the lowest way, mH — the grandeur M-D bounds. */
function seriesInductanceMh(parts: readonly Part[]): number {
  let sum = 0;
  for (const p of lowestWayParts(parts)) {
    if (p.type !== 'Inductor') continue;
    const l = valueOf(p, 'L');
    if (l !== null) sum += l;
  }
  return Number(sum.toFixed(3));
}

/* ---------------- what the frozen corpus actually delivered ------------- */

function corpusRows(): { key: string; trapHz: number | null; dampedBy: string | null; seriesMh: number; resonantDb: number | null; extraDb: number | null }[] {
  const bank = corpusBank(golden);
  const out: ReturnType<typeof corpusRows> = [];
  for (const key of Object.keys(golden.manifest_en_geometrie.netlists)) {
    if (!/^KAND_V2_\d+$/.test(key)) continue;
    const r = bank.report(key);
    const bump = r.metrics.lfBump[0] ?? null;
    /* The netlist as it sits on disk — `frozenNetlistGates.test.ts` reads it
     * the same way, through the case book's own manifest entry. */
    const parts = deserializeFilter(
      readFileSync(join(CASUS1_DIR, golden.manifest_en_geometrie.netlists[key]), 'utf-8'),
    ).parts as Part[];
    const trap = trapNear(parts, CASUS1_V2_BAND_SOURCE.fpHz);
    out.push({
      key,
      trapHz: trap ? Number(trap.f0Hz.toFixed(1)) : null,
      dampedBy: trap?.dampedBy ?? null,
      seriesMh: seriesInductanceMh(parts),
      resonantDb: bump && bump.result.resonantDb !== null ? Number(bump.result.resonantDb.toFixed(3)) : null,
      extraDb: bump ? Number(bump.result.extraDb.toFixed(3)) : null,
    });
  }
  return out;
}

/* ---------------- optionally: one live chain run per arm ---------------- */

function liveRun(arm: Arm, cand: (typeof CANDIDATES)[number]): { label: string; rippleDb: number; phaseDeg: number; trapHz: number | null; seriesMh: number; refused: string[] } {
  const { frame } = arm;
  const input: Chain3Input = {
    grid: [...frame.grid],
    w: frame.w,
    m: frame.m,
    t: frame.t,
    driverZ: frame.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: cand.low,
    xoHigh: cand.high,
    label: `E5-${arm.id}-${cand.label}`,
    settings: {
      ...CASUS1_V2_SETTINGS,
      band: arm.band,
      safety: frame.safety,
      structureLow: { kind: 'LR', order: 4 },
      structureHigh: { kind: 'LR', order: 4 },
    } as unknown as Chain3Input['settings'],
  };
  const payload: V2Chain3Payload = {
    input,
    v2: {
      ...facts,
      gates: { ...CASUS1_V2_GATES },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: arm.band,
    },
  };
  const collected: { result: Chain3Result; gates: { gate: string; subject: string; active: boolean; pass: boolean }[] }[] = [];
  handleV2Request(structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload }), (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data as (typeof collected)[number]);
  });
  const done = collected[0];
  if (!done) throw new Error(`arm ${arm.id} delivered nothing`);
  const parts = (done.result.parts ?? []) as Part[];
  return {
    label: `${arm.id} ${cand.label}`,
    rippleDb: Number(done.result.net.after.rippleDb.toFixed(3)),
    phaseDeg: Number(done.result.net.after.phaseDeg.toFixed(1)),
    trapHz: trapNear(parts, CASUS1_V2_BAND_SOURCE.fpHz)?.f0Hz ?? null,
    seriesMh: seriesInductanceMh(parts),
    refused: done.gates.filter((v) => v.active && !v.pass).map((v) => `${v.gate} (${v.subject})`),
  };
}

/* ---------------- output ------------------------------------------------ */

console.log('E-5 — the app frame against the repo frame, on casus 1\'s merged set');
console.log('');
console.log(`repo grid  ${repoFrame.grid[0].toFixed(1)}–${repoFrame.grid[repoFrame.grid.length - 1].toFixed(0)} Hz, ${repoFrame.grid.length} points`);
console.log(`app  grid  ${appFrame.grid[0].toFixed(1)}–${appFrame.grid[appFrame.grid.length - 1].toFixed(0)} Hz, ${appFrame.grid.length} points`);
console.log(`repo band  ${CASUS1_V2_BAND_HZ[0].toFixed(1)}–${CASUS1_V2_BAND_HZ[1]} Hz  (floor: the lowest way's f_p, ${CASUS1_V2_BAND_SOURCE.fpHz?.toFixed(1)} Hz)`);
console.log(`app  band  ${appBandFloorHz.toFixed(1)}–${CASUS1_V2_BAND_HZ[1]} Hz  (floor: the validity INTERSECTION, i.e. the highest way's gate)`);
console.log(`M-D budget ${CASUS1_LF_RESONANT_BUDGET_DB} dB on the RESONANT half (V43)`);
console.log('');

const rows: SeedRow[] = [];
for (const arm of ARMS) for (const c of CANDIDATES) rows.push(seedOf(arm, c));

const pad = (s: string, n: number) => s.padEnd(n);
console.log('THE SEED — what the design and synthesis steps hand the tuner');
console.log(
  pad('arm', 24) + pad('candidate', 13) + pad('trap on f_p', 22) + pad('serie-L mH', 12) +
  pad('M-D extra', 11) + pad('resonant', 10) + 'EQ on the lowest way',
);
for (const r of rows) {
  console.log(
    pad(r.arm, 24) +
      pad(r.candidate, 13) +
      pad(r.trapHz === null ? 'none' : `${r.trapHz.toFixed(1)} Hz, ${r.trapDampedBy}`, 22) +
      pad(r.lowestWaySeriesMh.toFixed(2), 12) +
      pad(r.mdExtraDb === null ? '—' : r.mdExtraDb.toFixed(2), 11) +
      pad(r.mdResonantDb === null ? '—' : r.mdResonantDb.toFixed(2), 10) +
      (r.wooferEq.join(' | ') || 'none'),
  );
}

console.log('');
console.log('THE DELIVERED CORPUS (C-2, frozen) — what a tune does with the trap it was given');
console.log(pad('netlist', 14) + pad('trap on f_p', 22) + pad('serie-L mH', 12) + pad('M-D extra', 11) + 'resonant (budget ' + CASUS1_LF_RESONANT_BUDGET_DB + ')');
const corpus = corpusRows();
for (const c of corpus) {
  console.log(
    pad(c.key, 14) +
      pad(c.trapHz === null ? 'none' : `${c.trapHz.toFixed(1)} Hz, ${c.dampedBy}`, 22) +
      pad(c.seriesMh.toFixed(2), 12) +
      pad(c.extraDb === null ? '—' : c.extraDb.toFixed(2), 11) +
      (c.resonantDb === null ? '—' : c.resonantDb.toFixed(2)),
  );
}
const withTrap = corpus.filter((c) => c.trapHz !== null).length;
console.log(`  → ${withTrap} of ${corpus.length} delivered netlists carry a damped trap within half an octave of f_p.`);

const live = process.env.E5_RUN === '1' ? ARMS.map((a) => liveRun(a, CANDIDATES[1])) : [];
if (live.length > 0) {
  console.log('');
  console.log('ONE LIVE CHAIN RUN PER ARM (E5_RUN=1)');
  console.log(pad('arm', 18) + pad('ripple dB', 11) + pad('phase °', 10) + pad('trap', 14) + pad('serie-L mH', 12) + 'refused by');
  for (const r of live) {
    console.log(
      pad(r.label, 18) +
        pad(r.rippleDb.toFixed(2), 11) +
        pad(r.phaseDeg.toFixed(1), 10) +
        pad(r.trapHz === null ? 'none' : `${r.trapHz.toFixed(1)} Hz`, 14) +
        pad(r.seriesMh.toFixed(2), 12) +
        (r.refused.join(', ') || 'nothing'),
    );
  }
}

const out = join(process.cwd(), 'test-fixtures', 'casus1_e5_app_vs_repo.json');
writeFileSync(
  out,
  JSON.stringify(
    {
      _wat: 'E-5 — de app-frame tegen de repo-frame op casus 1s gemergde set; twee getallen verschillen (raster en band), de meetset niet.',
      frames: {
        repo_grid: { van_hz: repoFrame.grid[0], tot_hz: repoFrame.grid[repoFrame.grid.length - 1], punten: repoFrame.grid.length },
        app_grid: { van_hz: appFrame.grid[0], tot_hz: appFrame.grid[appFrame.grid.length - 1], punten: appFrame.grid.length },
        repo_band_hz: CASUS1_V2_BAND_HZ,
        app_band_hz: [appBandFloorHz, CASUS1_V2_BAND_HZ[1]],
        band_bron: CASUS1_V2_BAND_SOURCE,
      },
      md_budget_resonant_db: CASUS1_LF_RESONANT_BUDGET_DB,
      zaad: rows,
      corpus: corpus,
      ...(live.length > 0 ? { live } : {}),
    },
    null,
    2,
  ) + '\n',
);
console.log('');
console.log(`wrote ${out}`);
