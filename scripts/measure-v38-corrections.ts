/**
 * V38 STAP 1b — WAAROM DE KETEN GEEN VAL BOUWT: de lean-drempel gemeten.
 *
 * `npx vite-node scripts/measure-v38-corrections.ts` — ontwerp- en
 * synthesestap voor élke kandidaat van het veld, geen enkele tune. Minuten.
 *
 * DE VONDST DIE DIT SCRIPT NAMEET. De diff-tabel van stap 1 zegt dat HUIDIG,
 * KAND-A en KAND-B alle drie dezelfde drie niet-kern-groepen dragen (een val in
 * de woofertak, een gedempte val in de middentak, een shunt-shelf op de
 * tweeter) en dat géén enkele KAND-V2 er ook maar één van heeft. De synthese
 * KAN ze bouwen — dat is precies wat `corrections: 'auto'` doet (Zobel,
 * Fs-val, stopband-val, top-octaaf-hold). Zij bouwt ze op de v2-route alleen
 * niet, en de reden staat in `threeWayChain.ts`:
 *
 *     corrections: (s.targets ? 'lean' : 'auto'),
 *     leanTargetDb: s.targets?.rippleDb,
 *
 * `'lean'` fit eerst de kale ladder en koopt alleen correcties als die fit
 * `leanTargetDb` MIST. De eigen standaard van `synthesize` is 0,5 dB; de
 * v2-route geeft er `targets.rippleDb` aan mee, en dat is 2,5 dB — vijf keer
 * zo ruim. Wat dit script meet is per tak: haalt de kale ladder die 2,5 dB, en
 * wat er bij 'auto' wél gebouwd zou zijn.
 *
 * HET MEET EN HET BESLUIT NIET. Er wordt niets getuned, geen netlist
 * geschreven en geen kandidaat aanbevolen: de uitkomst is een kolom voor de
 * beslislijst van stap 4.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from '../src/lib/engine2/report.ts';
import { casus1FilterFromParts } from '../src/lib/engine2/casus1.fixture.ts';
import { designThreeWay, type Struct3Choice } from '../src/lib/threeWayDesign.ts';
import { synthesize, type SynthesisResult } from '../src/lib/synthesis.ts';
import { mergeSynthesizedSchematics } from '../src/lib/schematicEdit.ts';
import type { DriverFilterSpec } from '../src/lib/filters.ts';
import type { GriddedResponse } from '../src/lib/dsp.ts';
import { CASUS1_V2_SETTINGS, casus1Field } from '../src/lib/engine2/casus1V2.fixture.ts';
import { SETTINGS, chain, files, geometry, manifest, partsOf } from './v38-bench.ts';
import { decompose } from './v38-groups.ts';

/** Onder deze dB telt een rasterpunt als dood — de waarde uit `threeWayChain.ts`. */
const ALIVE_DB = -300;
/** De eigen standaard van `synthesize` voor de lean-drempel, dB. */
const SYNTHESIS_LEAN_DEFAULT_DB = 0.5;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_v38_correcties.json');

const report = buildReport({
  manifest,
  files,
  filter: casus1FilterFromParts('HUIDIG', partsOf('HUIDIG'), manifest, files),
  geometry,
  settings: SETTINGS,
});
const field = casus1Field(report);
const s = CASUS1_V2_SETTINGS;

const synthOne = (
  spec: DriverFilterSpec,
  resp: GriddedResponse,
  zKey: string,
  corrections: 'auto' | 'lean' | 'off',
  leanTargetDb: number,
): SynthesisResult => {
  const idxs: number[] = [];
  for (let i = 0; i < chain.grid.length; i++) if (resp.spl[i] > ALIVE_DB) idxs.push(i);
  const sub = idxs.map((i) => chain.grid[i]);
  const z = chain.driverZ[zKey];
  const zSub = idxs.map((i) => z[i]);
  return synthesize(spec, sub, zSub, {
    mode: s.synthMode,
    phasePriority: s.phasePriority,
    catalogSnap: s.catalogSnap,
    corrections,
    leanTargetDb,
    label: zKey,
    ...(s.synthMode === 'acoustic' ? { driverSplDb: idxs.map((i) => resp.spl[i]) } : {}),
  });
};

interface BranchRow {
  tak: string;
  kaal_rms_dB: number;
  kaal_onderdelen: number;
  auto_rms_dB: number;
  auto_onderdelen: number;
  /** Wat de v2-route levert bij `leanTargetDb = targets.rippleDb`. */
  lean_v2_onderdelen: number;
  /** Wat dezelfde tak zou leveren bij de eigen standaard van `synthesize`. */
  lean_default_onderdelen: number;
  kale_ladder_haalt_v2_drempel: boolean;
  kale_ladder_haalt_standaard: boolean;
}

interface CandRow {
  kandidaat: string;
  xoHz: number[];
  takken: BranchRow[];
  rollen_lean_v2: Record<string, number>;
  rollen_auto: Record<string, number>;
}

const roleCount = (
  branches: { components: SynthesisResult['components']; model: string }[],
): Record<string, number> => {
  const parts = mergeSynthesizedSchematics(branches).parts;
  const out: Record<string, number> = {};
  for (const g of decompose(parts)) out[g.role] = (out[g.role] ?? 0) + 1;
  return out;
};

const rows: CandRow[] = [];
for (const c of field.field.candidates) {
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
    /* Dezelfde vertaling die `generate-casus1-v2-candidates.ts` doet: de
     * uitlijningsbibliotheek van de kandidaat IS die van de ontwerpstap
     * (`AUTO_STRUCTS`), dus de cast bevestigt wat de generator al garandeert. */
    structureLow: c.crossings[0].alignment as Struct3Choice,
    structureHigh: c.crossings[1].alignment as Struct3Choice,
    breakupGuard: s.breakupGuard,
  });
  const branches: { spec: DriverFilterSpec; resp: GriddedResponse; key: string }[] = [
    { spec: design.specs.woofer, resp: chain.w, key: 'woofer' },
    { spec: design.specs.mid, resp: chain.m, key: 'mid' },
    { spec: design.specs.tweeter, resp: chain.t, key: 'tweeter' },
  ];
  const takken: BranchRow[] = [];
  const leanV2: { components: SynthesisResult['components']; model: string }[] = [];
  const auto: { components: SynthesisResult['components']; model: string }[] = [];
  for (const b of branches) {
    const bare = synthOne(b.spec, b.resp, b.key, 'off', s.targets.rippleDb);
    const full = synthOne(b.spec, b.resp, b.key, 'auto', s.targets.rippleDb);
    const lean = synthOne(b.spec, b.resp, b.key, 'lean', s.targets.rippleDb);
    const leanDef = synthOne(b.spec, b.resp, b.key, 'lean', SYNTHESIS_LEAN_DEFAULT_DB);
    takken.push({
      tak: b.key,
      kaal_rms_dB: Number(bare.rmsDb.toFixed(3)),
      kaal_onderdelen: bare.components.length,
      auto_rms_dB: Number(full.rmsDb.toFixed(3)),
      auto_onderdelen: full.components.length,
      lean_v2_onderdelen: lean.components.length,
      lean_default_onderdelen: leanDef.components.length,
      kale_ladder_haalt_v2_drempel: bare.rmsDb <= s.targets.rippleDb,
      kale_ladder_haalt_standaard: bare.rmsDb <= SYNTHESIS_LEAN_DEFAULT_DB,
    });
    leanV2.push({ components: lean.components, model: b.key });
    auto.push({ components: full.components, model: b.key });
  }
  rows.push({
    kandidaat: c.label,
    xoHz: c.crossings.map((x) => Number(x.hz.toFixed(1))),
    takken,
    rollen_lean_v2: roleCount(leanV2),
    rollen_auto: roleCount(auto),
  });
  console.log(
    `${c.label}  ` +
      takken
        .map(
          (t) =>
            `${t.tak}: kaal ${t.kaal_rms_dB.toFixed(2)} dB ${t.kale_ladder_haalt_v2_drempel ? '≤' : '>'} ` +
              `${s.targets.rippleDb} ⇒ ${t.lean_v2_onderdelen} onderdelen (auto zou ${t.auto_onderdelen} zijn, ` +
              `fit ${t.auto_rms_dB.toFixed(2)} dB)`,
        )
        .join('  |  '),
  );
}

/* ---- de samenvatting ---------------------------------------------------- */
console.log(
  `\n=== de lean-drempel op het hele veld (${rows.length} kandidaten × 3 takken) ===`,
);
console.log(
  `de v2-route stelt leanTargetDb = targets.rippleDb = ${s.targets.rippleDb} dB; ` +
    `de eigen standaard van synthesize is ${SYNTHESIS_LEAN_DEFAULT_DB} dB.`,
);
const all = rows.flatMap((r) => r.takken);
const passV2 = all.filter((t) => t.kale_ladder_haalt_v2_drempel).length;
const passDef = all.filter((t) => t.kale_ladder_haalt_standaard).length;
console.log(
  `kale ladder onder ${s.targets.rippleDb} dB: ${passV2} van ${all.length} takken — ` +
    `zoveel takken kopen dus GEEN correctie.`,
);
console.log(
  `kale ladder onder ${SYNTHESIS_LEAN_DEFAULT_DB} dB: ${passDef} van ${all.length} takken.`,
);
const worse = all.filter((t) => t.auto_onderdelen > t.lean_v2_onderdelen).length;
console.log(
  `takken waar 'auto' MEER onderdelen zou bouwen dan de v2-route levert: ${worse} van ${all.length}.`,
);

console.log('\n| kandidaat | tak | kale fit (dB) | onder 2,5? | onder 0,5? | onderdelen lean(v2) | onderdelen auto | auto-fit (dB) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  for (const t of r.takken) {
    console.log(
      `| ${r.kandidaat} | ${t.tak} | ${t.kaal_rms_dB.toFixed(2)} | ` +
        `${t.kale_ladder_haalt_v2_drempel ? 'ja' : 'nee'} | ` +
        `${t.kale_ladder_haalt_standaard ? 'ja' : 'nee'} | ${t.lean_v2_onderdelen} | ` +
        `${t.auto_onderdelen} | ${t.auto_rms_dB.toFixed(2)} |`,
    );
  }
}

console.log('\n=== rolverdeling van het GESYNTHETISEERDE (ongetunede) netwerk, per beleid ===');
console.log('| kandidaat | lean (v2-route) | auto |');
console.log('|---|---|---|');
const fmtRoles = (r: Record<string, number>) =>
  Object.entries(r)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}×${v}`)
    .join(', ') || '—';
for (const r of rows) {
  console.log(`| ${r.kandidaat} | ${fmtRoles(r.rollen_lean_v2)} | ${fmtRoles(r.rollen_auto)} |`);
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _:
        'V38 stap 1b — wat de lean-drempel van de synthese op de v2-route doet. Documentatie, ' +
        'geen acceptatiewaarde.',
      leanTargetDb_v2: s.targets.rippleDb,
      leanTargetDb_standaard: SYNTHESIS_LEAN_DEFAULT_DB,
      herkomst:
        "threeWayChain.ts: corrections = (s.targets ? 'lean' : 'auto'), leanTargetDb = s.targets?.rippleDb",
      kandidaten: rows,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`\ngeschreven: ${OUT}`);
