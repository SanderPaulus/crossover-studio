/**
 * C-2 — HET CASUS-1-VELD ONDER DE DRIE BESLUITEN, VÓÓR DE REGENERATIE — seconden,
 * geen ketenrun en geen tune.
 *
 * `npx vite-node scripts/measure-c2-field.ts`
 *
 * Drie tabellen, en zij zijn de vóórmeting waarop de laatste regeneratie van casus 1
 * rust:
 *
 *  (1) HET VELD, VÓÓR EN NÁ. De A5e.3c-vorm (`positionPolicy` afwezig = `'spread'`,
 *      budget 24) tegen de C-2-vorm (`'two-sided'`, budget 16): posities per as, het
 *      afgeleide en het geleverde aantal, en de kooi van élke positie met de octaven
 *      die zij boven en onder haar positie draagt — de kolom die het besluit toetst,
 *      want tweezijdig betekent dat die twee gelijk zijn.
 *  (2) DE VERKLARING. Welke waarde de kandidaatverklaring voor de twee C-2-sleutels
 *      aflegt (`zFloorBarrierSource`, `seriesInductanceBound`), zodat de run die
 *      straks draait leesbaar is zonder de generator te lezen.
 *  (3) DE ZOEKDOOS, HARD TEGEN ZACHT. Op élke bevroren netlist van het levende
 *      corpus: het plafond dat `bump-series-l` oplevert, waar het terechtkomt
 *      (`valueCeilings` of `valueSoftCeilings`), en of de sompoort projecteert of
 *      scoort. Dat is de mechanische helft van E-4's leesregel.
 *
 * Schrijft niets. Dit script stelt niets en wijzigt niets.
 */

import { buildReport, type EngineV2Report, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { buildCandidateField } from '../src/lib/engine2/predesign/candidateField.ts';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1ExcursionSettings,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  casus1MaxDriveOnFsDbByDriver,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_FIELD_ALIGNMENTS,
  CASUS1_FIELD_CHAIN_BUDGET,
  CASUS1_FIELD_POSITION_POLICY,
  CASUS1_FIELD_STATED_ORDER,
  CASUS1_TARGET_CURVE,
  CASUS1_WINDOW_SETTINGS,
  casus1Field,
  casus1V2Declaration,
} from '../src/lib/engine2/casus1V2.fixture.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);

const settings: ReportSettings = {
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: CASUS1_TARGET_CURVE,
  ...casus1ExcursionSettings(golden),
  ...(Object.keys(casus1MaxDriveOnFsDbByDriver(golden)).length > 0
    ? { maxDriveOnFsDbByDriver: casus1MaxDriveOnFsDbByDriver(golden) }
    : {}),
  ...CASUS1_WINDOW_SETTINGS,
};
const report: EngineV2Report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings,
});

const f1 = (v: number) => v.toFixed(1);
const f3 = (v: number) => v.toFixed(3);

/* ---------------- (1) het veld, vóór en ná ---------------- */
const before = buildCandidateField({
  windowInputs: report.predesign.windowInputs,
  perPair: report.predesign.windowInputs.map(() => ({ statedOrder: CASUS1_FIELD_STATED_ORDER })),
  alignments: CASUS1_FIELD_ALIGNMENTS,
  chainBudget: 24,
});
const after = casus1Field(report);

for (const [name, f] of [
  ['A5e.3c — spread, budget 24', before],
  [`C-2 — ${CASUS1_FIELD_POSITION_POLICY}, budget ${CASUS1_FIELD_CHAIN_BUDGET}`, after],
] as const) {
  console.log(`\n=== (1) HET VELD — ${name} ===`);
  console.log(`veld ${f.field.parameters.derivedSize} afgeleid → ${f.field.parameters.deliveredSize} geleverd; spacing ${f3(f.field.parameters.minSpacingOctaves as number)} oct`);
  for (const ax of f.field.axes) {
    for (const p of ax.positionsByOrder) {
      const w = ax.window[String(p.order)];
      console.log(`  ${ax.pairLabel} orde ${p.order}: venster ${f1(w.floorHz ?? NaN)}–${f1(w.ceilingHz ?? NaN)} Hz (${w.floorBy?.rule} / ${w.ceilingBy?.rule}); ${p.derivedCount} afgeleid → ${p.count} geleverd`);
      console.log(`     posities: ${p.hz.map(f1).join(' / ')}`);
    }
  }
  console.log('  | as | positie Hz | kooi Hz | oct onder | oct boven | tweezijdig |');
  console.log('  | --- | --- | --- | --- | --- | --- |');
  const seen = new Set<string>();
  for (const c of f.field.candidates) {
    for (const x of c.crossings) {
      const k = `${x.pairLabel}@${x.hz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const down = x.hz > x.cageHz[0] ? Math.log2(x.hz / x.cageHz[0]) : 0;
      const up = x.cageHz[1] > x.hz ? Math.log2(x.cageHz[1] / x.hz) : 0;
      console.log(`  | ${x.pairLabel} | ${f1(x.hz)} | ${f1(x.cageHz[0])}–${f1(x.cageHz[1])} | ${f3(down)} | ${f3(up)} | ${x.twoSided ? 'JA' : 'NEE'} |`);
    }
  }
  for (const n of f.field.notes) console.log(`  · ${n}`);
}

/* ---------------- (2) de verklaring ---------------- */
console.log('\n=== (2) DE VERKLARING VAN EEN C-2-KANDIDAAT ===');
const c0 = after.field.candidates[0];
const decl = casus1V2Declaration(c0).declaration;
for (const k of ['zFloorBarrier', 'zFloorBarrierSource', 'seriesInductanceCeilingSource', 'seriesInductanceBound'] as const) {
  const v = (decl.stated as Record<string, unknown>)[k];
  const ab = decl.absent.find((a) => a.key === k);
  console.log(`  ${k}: ${v !== undefined ? JSON.stringify(v) : `ABSENT — ${ab?.why.slice(0, 90) ?? '(niet gemeld)'}`}`);
}
console.log(`  kandidaat 1 van ${after.field.candidates.length}: ${c0.label}`);
