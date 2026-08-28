/**
 * V38 STAP 3b — WAT DE ONTBREKENDE TOPOLOGIE WAARD IS NA HET TUNEN.
 *
 * `V38_EQ=<n> npx vite-node scripts/measure-v38-corrections-tuned.ts` — vier
 * waardetunes per EQ-budget, gemeten ~790 s per stuk. `V38_LIMIT=n` als
 * rookproef. Draai hem twee keer, met `V38_EQ=0` (wat de v2-route stelt) en
 * `V38_EQ=2` (wat de app zelf stelt); dat is de 2×2 van de tabel.
 *
 * TWEE OORZAKEN, ONAFHANKELIJK VAN ELKAAR, en dit script meet ze samen omdat
 * ze allebei op dezelfde plek uitkomen — het gesynthetiseerde zaad.
 *
 *  (1) DE LEAN-DREMPEL. `threeWayChain.ts` stelt
 *      `corrections = (s.targets ? 'lean' : 'auto')` en
 *      `leanTargetDb = s.targets?.rippleDb`. De v2-route stelt targets, dus
 *      lean, en haar drempel is 2,5 dB — de eigen standaard van `synthesize`
 *      is 0,5 dB. `measure-v38-corrections.ts` meet dat de kale ladder op
 *      45 van de 45 takken onder 2,5 dB komt en op 0 van de 45 onder 0,5 dB:
 *      er wordt dus nooit een Zobel, een Fs-val of een top-octaaf-hold
 *      gekocht.
 *  (2) HET EQ-BUDGET. Een val op een BREAKUP komt in `deriveTopology` langs
 *      precies één weg: een EQ-band in de spec. Het budget daarvoor is
 *      `Chain3Settings.eqBands`, en `CASUS1_V2_SETTINGS` stelt hem niet — dus
 *      nul. De app zelf staat op TWEE (`vfEqBands`, `App.tsx`). Zonder band
 *      geen notch-rung, en zonder notch-rung kan geen enkele tune er een
 *      maken: de waardetune verplaatst waarden op een vaste topologie.
 *
 * WAAROM DE LEVERING EN NIET HET ZAAD. Een seed draagt geen claim over wat er
 * geleverd wordt — dat is de les die de horizonpost over het synthese-verlies
 * optekende, waar ontwerp → synthese → levering als keten werd gelezen terwijl
 * het middelste getal een zaad is. Dus gaat elk zaad hier door dezelfde
 * waardetune, met dezelfde kooi, dezelfde vloer en dezelfde beschermingen als
 * de ablatiereeks, en wordt het GELEVERDE netwerk gemeten.
 *
 * DE TUNE IS WAARDEN-ONLY (geen `staged`), net als in stap 2 en 3. Met de
 * trapmethode aan zou de snoeipas de gekochte correctie er weer uit kunnen
 * halen en de escalatiepas er een bij kunnen zetten, en dan meet dit niet meer
 * het verschil tussen de zaden.
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
import { decompose } from './v38-groups.ts';

/** Onder deze dB telt een rasterpunt als dood — de waarde uit `threeWayChain.ts`. */
const ALIVE_DB = -300;

/**
 * De kandidaten die hier gemeten worden, als POSITIE-PAAR en niet als naam.
 *
 * De twee vlakste rijen van het levende corpus (`compare-corpora.ts v34 live`:
 * 1,76 en 1,75 dB RMS). Gekozen omdat de vraag van V38 het GAT naar HUIDIG is
 * en dat gat het kleinst is bij de beste rij — een correctie die daar niets
 * toevoegt, voegt nergens iets toe. Twee en niet vijftien, omdat elke rij twee
 * waardetunes van dertien minuten kost; welke twee het zijn staat hier zodat
 * iemand het kan betwisten.
 */
const PAIRS: [number, number][] = [
  [396.7, 1719],
  [396.7, 2283.5],
];
/** Hoe dicht een kandidaatpositie bij een gevraagd paar moet liggen, in Hz. */
const MATCH_TOL_HZ = 1;

/**
 * Het EQ-budget per tak voor deze run.
 *
 * Default 0, want dat is wat de v2-route vandaag stelt (`CASUS1_V2_SETTINGS`
 * noemt `eqBands` niet). `V38_EQ=2` is wat de app zelf stelt.
 */
const EQ_BANDS = Number(process.env.V38_EQ ?? '0');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(
  HERE,
  '..',
  'test-fixtures',
  `casus1_v38_correcties_getuned_eq${EQ_BANDS}.json`,
);

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
  corrections: 'auto' | 'lean',
): SynthesisResult => {
  const idxs: number[] = [];
  for (let i = 0; i < chain.grid.length; i++) if (resp.spl[i] > ALIVE_DB) idxs.push(i);
  const sub = idxs.map((i) => chain.grid[i]);
  const z = chain.driverZ[zKey];
  return synthesize(spec, sub, idxs.map((i) => z[i]), {
    mode: s.synthMode,
    phasePriority: s.phasePriority,
    catalogSnap: s.catalogSnap,
    corrections,
    leanTargetDb: s.targets.rippleDb,
    label: zKey,
    ...(s.synthMode === 'acoustic' ? { driverSplDb: idxs.map((i) => resp.spl[i]) } : {}),
  });
};

interface Row extends Measured {
  kandidaat: string;
  eq_banden: number;
  beleid: 'lean (v2-route)' | 'auto';
  zaad_onderdelen: number;
  zaad_rollen: string;
  zaad_meting: Measured;
  geleverd_onderdelen: number;
  vrij: number;
  evaluaties: number;
  kruispuntenHz: (number | null)[];
  degeneratie: string[];
  tuner_voor: TunerVector;
  tuner_na: TunerVector;
  bandNote: string;
  infeasible: string | null;
  parts: unknown;
  seconden: number;
}

const fmtRoles = (parts: readonly ReturnType<typeof partsOf>[number][]) => {
  const out: Record<string, number> = {};
  for (const g of decompose(parts)) out[g.role] = (out[g.role] ?? 0) + 1;
  return (
    Object.entries(out)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}×${v}`)
      .join(', ') || '—'
  );
};

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
    eqBandsPerBranch: EQ_BANDS,
  });
  console.log(
    `${c.label} — EQ-banden per tak: ${EQ_BANDS}; ontworpen: ` +
      (['woofer', 'mid', 'tweeter'] as const)
        .map((k) => {
          const bands = design.specs[k].eq.filter((b) => b.enabled && b.gainDb !== 0);
          return `${k} ${bands.length}${
            bands.length
              ? ` (${bands
                  .map(
                    (b) =>
                      `${b.type ?? 'peak'} ${b.freq.toFixed(0)} Hz ${b.gainDb.toFixed(1)} dB Q${b.q.toFixed(2)}`,
                  )
                  .join('; ')})`
              : ''
          }`;
        })
        .join(' | '),
  );
  for (const beleid of ['lean (v2-route)', 'auto'] as const) {
    if (LIMIT > 0 && rows.length >= LIMIT) break;
    const mode = beleid === 'auto' ? 'auto' : 'lean';
    const branches = [
      { r: synthOne(design.specs.woofer, chain.w, 'woofer', mode), model: 'woofer' },
      { r: synthOne(design.specs.mid, chain.m, 'mid', mode), model: 'mid' },
      { r: synthOne(design.specs.tweeter, chain.t, 'tweeter', mode), model: 'tweeter' },
    ];
    const seed = mergeSynthesizedSchematics(
      branches.map((b) => ({ components: b.r.components, model: b.model })),
    ).parts;
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
      },
    );
    const seconds = (Date.now() - t0) / 1000;
    const row: Row = {
      kandidaat: c.label,
      eq_banden: EQ_BANDS,
      beleid,
      zaad_onderdelen: countParts(seed),
      zaad_rollen: fmtRoles(seed),
      zaad_meting: measure(`${c.label} ${beleid} (zaad)`, seed),
      geleverd_onderdelen: countParts(net.parts),
      vrij: net.tuned,
      evaluaties: net.evaluations,
      ...measure(`${c.label} ${beleid}`, net.parts),
      kruispuntenHz: (net.after.xoHzPairs ?? []).map((v) => r2(v)),
      degeneratie: branches
        .map((b) => b.r.degenerateLoad?.reason)
        .filter((x): x is string => typeof x === 'string'),
      tuner_voor: tunerVectorOf(net.before),
      tuner_na: tunerVectorOf(net.after),
      bandNote: net.bandNote,
      infeasible: net.infeasible ?? null,
      parts: net.parts,
      seconden: Number(seconds.toFixed(0)),
    };
    rows.push(row);
    console.log(
      `${c.label} · eq${EQ_BANDS} · ${beleid.padEnd(16)} zaad ${row.zaad_onderdelen} onderdelen (${row.zaad_rollen}) ` +
        `RMS ${row.zaad_meting.rms} → geleverd ${row.rms} dB, ±${row.venster}, ` +
        `W-M ${row.wmFase}°, M-T ${row.mtFase}°, min|Z| ${row.minZ} Ω, EPDR ${row.epdr} Ω, ` +
        `diss ${row.dissipatiePct} %, Qes× ${row.qesMult}, ` +
        `xo ${row.kruispuntenHz.join('/')}  (${row.seconden} s)`,
    );
  }
}

const n = (v: number | null) => (v === null ? '—' : v.toFixed(2));
console.log(`\n=== zaad-topologie en levering, EQ-budget ${EQ_BANDS} ===`);
console.log(
  '| kandidaat | EQ-banden | beleid | zaad-onderdelen | rollen in het zaad | RMS zaad | RMS geleverd | ' +
    'SPL ± | smalste piek (dB @ Hz) | W-M fase (°) | M-T fase (°) | min \\|Z\\| (Ω) | vloer | ' +
    'EPDR (Ω) | dissipatie (%) | grootste R (W) | Q_es× |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(
    `| ${r.kandidaat} | ${r.eq_banden} | ${r.beleid} | ${r.zaad_onderdelen} | ${r.zaad_rollen} | ` +
      `${n(r.zaad_meting.rms)} | ${n(r.rms)} | ${n(r.venster)} | ` +
      `${r.smallePiekDb === null ? '—' : `${n(r.smallePiekDb)} @ ${n(r.smallePiekHz)}`} | ` +
      `${n(r.wmFase)} | ${n(r.mtFase)} | ` +
      `${n(r.minZ)} | ${r.haaltVloer === null ? '—' : r.haaltVloer ? 'ja' : '**nee**'} | ` +
      `${n(r.epdr)} | ${n(r.dissipatiePct)} | ${n(r.grootsteRW)} | ${n(r.qesMult)} |`,
  );
}

console.log('\n=== dezelfde armen in de EENHEDEN VAN DE TUNER ===');
console.log(
  '| kandidaat | EQ | beleid | rippelpiek voor → na (dB) | gegladd na (dB) | ' +
    'gem. afw. voor → na (dB) | fase voor → na (°) | R_source na (Ω) | dissRatio na |',
);
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const a = r.tuner_voor;
  const b = r.tuner_na;
  console.log(
    `| ${r.kandidaat} | ${r.eq_banden} | ${r.beleid} | ${n(a.rippelPiekDb)} → ${n(b.rippelPiekDb)} | ` +
      `${n(b.rippelPiekGegladdDb)} | ${n(a.gemAfwDb)} → ${n(b.gemAfwDb)} | ` +
      `${n(a.faseDeg)} → ${n(b.faseDeg)} | ${n(b.rSourceOhm)} | ${n(b.dissRatio)} |`,
  );
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _:
        'V38 stap 3b — wat de ontbrekende topologie waard is NA de waardetune. ' +
        'Documentatie, geen acceptatiewaarde.',
      opzet: {
        tuner: 'optimizeNetworkValues, WAARDEN-only (geen `staged`)',
        eq_banden_per_tak: EQ_BANDS,
        eq_banden_herkomst:
          EQ_BANDS === 0
            ? 'wat de v2-route stelt: CASUS1_V2_SETTINGS noemt `eqBands` niet'
            : 'gesteld voor deze meting; de app zelf staat op 2 (vfEqBands in App.tsx)',
        leanTargetDb_v2: s.targets.rippleDb,
        vloer_ohm: FLOOR,
        opties: Object.keys(TUNE_OPTS).sort(),
        kandidaten: PAIRS,
      },
      rijen: rows,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`\ngeschreven: ${OUT}`);
