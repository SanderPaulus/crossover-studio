/**
 * V38 CONTROLE — IS DE ZOEKGLADDING OOK OP EEN GEGENEREERDE KANDIDAAT DRAGEND?
 *
 * `npx vite-node scripts/measure-v38-smoothing.ts` — twee waardetunes.
 * `V38_LIMIT=n` als rookproef.
 *
 * WAAROM DIT LOSSTAAT. Controle 0d van de ablatie meet dat dezelfde
 * her-polijsting op HUIDIG's topologie 2,45 dB beter uitkomt zodra
 * `errorSmoothOct` op 0 staat — 0,53 dB tegen 2,98 dB, met één sleutel verschil.
 * Dat is één meting op één topologie, en die topologie is nu juist de
 * uitzonderlijke: hij is met de hand ontworpen en draagt vallen die geen enkele
 * KAND-V2 heeft. Een bevinding die alleen daar geldt is een eigenschap van
 * HUIDIG en niet van de zoektocht.
 *
 * Dus dezelfde ene-sleutel-vergelijking op de twee GEGENEREERDE kandidaten, met
 * precies het zaad dat de v2-route ook gebruikt (ontwerpstap → synthese met
 * `corrections: 'lean'`, `leanTargetDb = targets.rippleDb`, geen EQ-banden).
 * De gegladde helft is al gemeten in `measure-v38-corrections-tuned.ts` met
 * `V38_EQ=0`; die getallen worden hier NIET overgeschreven maar opnieuw
 * gedraaid, zodat beide helften uit dezelfde run komen en de vergelijking geen
 * twee losse tabellen aan elkaar hoeft te knopen.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from '../src/lib/engine2/report.ts';
import { casus1FilterFromParts } from '../src/lib/engine2/casus1.fixture.ts';
import { optimizeNetworkValues } from '../src/lib/netOptimizer.ts';
import { designThreeWay, type Struct3Choice } from '../src/lib/threeWayDesign.ts';
import { synthesize, type SynthesisResult } from '../src/lib/synthesis.ts';
import { mergeSynthesizedSchematics } from '../src/lib/schematicEdit.ts';
import type { DriverFilterSpec } from '../src/lib/filters.ts';
import type { GriddedResponse } from '../src/lib/dsp.ts';
import { CASUS1_V2_SETTINGS, casus1Field } from '../src/lib/engine2/casus1V2.fixture.ts';
import {
  FLOOR,
  SETTINGS,
  TUNE_OPTS,
  chain,
  countParts,
  files,
  geometry,
  manifest,
  measure,
  partsOf,
  r2,
  tunerVectorOf,
  type Measured,
  type TunerVector,
} from './v38-bench.ts';

/** Onder deze dB telt een rasterpunt als dood — de waarde uit `threeWayChain.ts`. */
const ALIVE_DB = -300;
/** De twee vlakste rijen van het levende corpus — zie `measure-v38-corrections-tuned.ts`. */
const PAIRS: [number, number][] = [
  [396.7, 1719],
  [396.7, 2283.5],
];
/** Hoe dicht een kandidaatpositie bij een gevraagd paar moet liggen, in Hz. */
const MATCH_TOL_HZ = 1;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_v38_gladding.json');

const s = CASUS1_V2_SETTINGS;
const report = buildReport({
  manifest,
  files,
  filter: casus1FilterFromParts('HUIDIG', partsOf('HUIDIG'), manifest, files),
  geometry,
  settings: SETTINGS,
});
const field = casus1Field(report);
const chosen = PAIRS.map(([lo, hi]) => {
  const c = field.field.candidates.find(
    (x) =>
      Math.abs(x.crossings[0].hz - lo) < MATCH_TOL_HZ &&
      Math.abs(x.crossings[1].hz - hi) < MATCH_TOL_HZ,
  );
  if (!c) throw new Error(`het veld kent geen kandidaat op ${lo} / ${hi} Hz`);
  return c;
});

const synthOne = (
  spec: DriverFilterSpec,
  resp: GriddedResponse,
  zKey: string,
): SynthesisResult => {
  const idxs: number[] = [];
  for (let i = 0; i < chain.grid.length; i++) if (resp.spl[i] > ALIVE_DB) idxs.push(i);
  const sub = idxs.map((i) => chain.grid[i]);
  const z = chain.driverZ[zKey];
  return synthesize(spec, sub, idxs.map((i) => z[i]), {
    mode: s.synthMode,
    phasePriority: s.phasePriority,
    catalogSnap: s.catalogSnap,
    corrections: 'lean',
    leanTargetDb: s.targets.rippleDb,
    label: zKey,
    ...(s.synthMode === 'acoustic' ? { driverSplDb: idxs.map((i) => resp.spl[i]) } : {}),
  });
};

interface Row extends Measured {
  kandidaat: string;
  gladding: string;
  zaad_meting: Measured;
  onderdelen: number;
  vrij: number;
  evaluaties: number;
  kruispuntenHz: (number | null)[];
  tuner_voor: TunerVector;
  tuner_na: TunerVector;
  parts: unknown;
  seconden: number;
}

const LIMIT = Number(process.env.V38_LIMIT ?? '0');
const rows: Row[] = [];
for (const c of chosen) {
  const design = designThreeWay({
    w: chain.w,
    m: chain.m,
    t: chain.t,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    band: s.band,
    phasePriority: s.phasePriority,
    xoLowWindow: c.crossings[0].cageHz,
    xoHighWindow: c.crossings[1].cageHz,
    structureLow: c.crossings[0].alignment as Struct3Choice,
    structureHigh: c.crossings[1].alignment as Struct3Choice,
    breakupGuard: s.breakupGuard,
  });
  const seed = mergeSynthesizedSchematics([
    { components: synthOne(design.specs.woofer, chain.w, 'woofer').components, model: 'woofer' },
    { components: synthOne(design.specs.mid, chain.m, 'mid').components, model: 'mid' },
    { components: synthOne(design.specs.tweeter, chain.t, 'tweeter').components, model: 'tweeter' },
  ]).parts;
  const seedMetrics = measure(`${c.label} (zaad)`, seed);
  for (const gladding of ['1/12 okt (de standaard)', 'uit (errorSmoothOct 0)'] as const) {
    if (LIMIT > 0 && rows.length >= LIMIT) break;
    const t0 = Date.now();
    const net = optimizeNetworkValues(
      seed,
      [...chain.grid],
      chain.w,
      chain.t,
      chain.driverZ,
      { offsetMm: 0, trimDb: 0, inverted: design.tweeterInverted },
      {
        ...TUNE_OPTS,
        midBranch: { response: chain.m, adjust: { inverted: design.midInverted } },
        xoRangePairs: [c.crossings[0].cageHz, c.crossings[1].cageHz],
        xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
        ...(gladding.startsWith('uit') ? { errorSmoothOct: 0 } : {}),
      },
    );
    const seconds = (Date.now() - t0) / 1000;
    const row: Row = {
      kandidaat: c.label,
      gladding,
      zaad_meting: seedMetrics,
      onderdelen: countParts(net.parts),
      vrij: net.tuned,
      evaluaties: net.evaluations,
      ...measure(`${c.label} ${gladding}`, net.parts),
      kruispuntenHz: (net.after.xoHzPairs ?? []).map((v) => r2(v)),
      tuner_voor: tunerVectorOf(net.before),
      tuner_na: tunerVectorOf(net.after),
      parts: net.parts,
      seconden: Number(seconds.toFixed(0)),
    };
    rows.push(row);
    console.log(
      `${c.label} · gladding ${gladding.padEnd(24)} zaad ${row.zaad_meting.rms} → geleverd ` +
        `${row.rms} dB, ±${row.venster}, W-M ${row.wmFase}°, M-T ${row.mtFase}°, ` +
        `min|Z| ${row.minZ} Ω, EPDR ${row.epdr} Ω, diss ${row.dissipatiePct} %, ` +
        `xo ${row.kruispuntenHz.join('/')}  (${row.seconden} s)`,
    );
  }
}

const n = (v: number | null) => (v === null ? '—' : v.toFixed(2));
console.log('\n=== de zoekgladding op een GEGENEREERDE kandidaat ===');
console.log(
  '| kandidaat | gladding | RMS zaad | RMS geleverd | SPL ± | W-M fase (°) | M-T fase (°) | ' +
    'min \\|Z\\| (Ω) | vloer | EPDR (Ω) | dissipatie (%) | rippelpiek ruw / gegladd (dB) |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(
    `| ${r.kandidaat} | ${r.gladding} | ${n(r.zaad_meting.rms)} | ${n(r.rms)} | ${n(r.venster)} | ` +
      `${n(r.wmFase)} | ${n(r.mtFase)} | ${n(r.minZ)} | ` +
      `${r.haaltVloer === null ? '—' : r.haaltVloer ? 'ja' : '**nee**'} | ${n(r.epdr)} | ` +
      `${n(r.dissipatiePct)} | ${n(r.tuner_na.rippelPiekDb)} / ${n(r.tuner_na.rippelPiekGegladdDb)} |`,
  );
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _:
        'V38 — de zoekgladding als ENE sleutel, op de twee gegenereerde kandidaten. ' +
        'Documentatie, geen acceptatiewaarde.',
      opzet: {
        tuner: 'optimizeNetworkValues, WAARDEN-only (geen `staged`)',
        zaad: "de ontwerpstap plus synthese van de v2-route (corrections 'lean', geen EQ-banden)",
        vloer_ohm: FLOOR,
        opties: Object.keys(TUNE_OPTS).sort(),
      },
      rijen: rows,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`\ngeschreven: ${OUT}`);
