/**
 * U-5b — WHAT THE CROSSOVER-POINT FORM REACHES, AND WHAT IT NOW RUNS.
 *
 * The measurement that opened the session and the acceptance that closes it,
 * in one script, because they are the same table read twice.
 *
 * THE FINDING. On the v2 route the crossover point (`centre ± margin`, N
 * steps) reached NOTHING. Every generated candidate carries its own cage and
 * its own judge window, `candidateDeclaration.ts` states `xoRangePairs` from
 * that cage, and `ChainInput.xoRange` overrides `settings.xoRange` — so the
 * pin was overwritten before the worker saw it. The step count fed
 * `stepsPerAxis`, which `fieldModeSettings('exploration')` discards outright.
 * A designer who pinned 2300 ± 100 Hz in 9 steps got the derived field: a
 * handful of window positions, none of them near 2300, with nothing anywhere
 * on the screen saying so.
 *
 * THE REPAIR. The range form is SUGAR for the U-5 list: it expands into N
 * stated positions and takes that same path — past the window, past the
 * generator's spacing rules, attributed to the designer, one chain run each.
 *
 * Seconds, no chain run and no tune: everything here is pre-design.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseZma } from '../src/lib/parsers/zma.ts';
import {
  buildEngineV2Input,
  type AdapterBranch,
  type AdapterGeometry,
  type AdapterResponse,
} from '../src/lib/engine2/appAdapter.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import {
  buildCandidateField,
  candidateFieldKey,
} from '../src/lib/engine2/predesign/candidateField.ts';
import { pairDerivationInputs } from '../src/lib/engine2/optimizer/scanRequest.ts';
import { fieldModeSettings } from '../src/lib/engine2/predesign/fieldMode.ts';
import {
  describeStatedPositions,
  expandStatedRange,
  mergeStatedCrossings,
  parseStatedCrossings,
} from '../src/lib/engine2/predesign/statedCrossings.ts';
import { crossoverVariants } from '../src/lib/designChain.ts';
import { stableJson } from '../src/lib/engine2/optimizer/determinism.ts';
import { KOAN_2WAY_DEMO } from '../src/demo2way.ts';
import { AUTO_STRUCTS } from '../src/lib/threeWayDesign.ts';
import type { ReportSettings } from '../src/lib/engine2/report.ts';

/* THE SCREENSHOT, as constants: the crossover point Sander pinned and the step
 * count he chose. They are a REPRODUCTION of one run and not a project
 * setting, which is why they live here and not in a fixture (P6). */
const PIN_CENTRE_HZ = 2300;
const PIN_MARGIN_HZ = 100;
const PIN_STEPS = 9;
/** What the app's "steps per axis" select would hand the FULL field. */
const FULL_STEPS_PER_AXIS = PIN_STEPS;

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'demo_u5b_range.json');

const line = (s = '') => console.log(s);

/* ---- the two-way demo bundle, through the app's own adapter -------------- */

const D = KOAN_2WAY_DEMO;
const asResponse = (name: string, raw: string): AdapterResponse => {
  const f = parseFrd(raw);
  return { name, freq: f.freq, spl: f.spl, phaseDeg: f.phase, comments: f.meta.rawComments };
};
const branchOf = (role: 'low' | 'high'): AdapterBranch => {
  const b = D.branches[role]!;
  const z = parseZma(b.impedance.raw);
  return {
    role,
    onAxis: asResponse(b.angles[0].file.name, b.angles[0].file.raw),
    offAxis: b.angles.map((a) => ({ hor: a.hor, response: asResponse(a.file.name, a.file.raw) })),
    nearField: b.nearCone ? [asResponse(b.nearCone.name, b.nearCone.raw)] : [],
    impedance: { name: b.impedance.name, freq: z.freq, magnitude: z.magnitude, phaseDeg: z.phase },
  };
};
const numOf = (v: string | undefined): number | undefined =>
  v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;

const cab = D.cabinet!;
const drv = cab.drivers!;
const geometry: AdapterGeometry = {
  verticalMm: { low: numOf(drv.low?.yMm), high: numOf(drv.high?.yMm) },
  arraySpacingMm: {},
  sourceCount: { low: 1, high: 1 },
  baffleWidthMm: numOf(cab.baffleWidthMm),
};
const settings: ReportSettings = {
  driverCardByDriver: {
    low: { sdCm2: Number(D.sdCm2!.low) },
    high: { sdCm2: Number(D.sdCm2!.high) },
  },
};

const built = buildEngineV2Input({
  sessionId: 'u5b',
  branches: [branchOf('low'), branchOf('high')],
  filter: null,
  geometry,
  settings,
});
const report = buildReport(built.input);
const wis = report.predesign.windowInputs;
const labels = wis.map((wi) => `${wi.lower}→${wi.upper}`);
const perPair = pairDerivationInputs({ windowInputs: wis, curveOfDriverId: () => null });

const fieldOf = (mode: 'exploration' | 'full', statedPerAxisHz?: number[][]) =>
  buildCandidateField({
    windowInputs: wis,
    alignments: AUTO_STRUCTS,
    ...fieldModeSettings(mode, { stepsPerAxis: FULL_STEPS_PER_AXIS, pairs: wis.length }),
    perPair,
    ...(statedPerAxisHz ? { statedPerAxisHz, statedOn: 'the reproduction' } : {}),
  });

const positionsOf = (f: ReturnType<typeof fieldOf>) =>
  f.field.candidates.map((c) => ({
    label: c.label,
    stated: Boolean(c.stated),
    hz: c.crossings.map((x) => x.hz),
    alignment: c.crossings.map((x) => `${x.alignment.kind}${x.alignment.order}`),
  }));

/* ---- 1. what the form says, and what the run did ------------------------- */

line(`THE HANDOVERS: ${labels.join(', ')}`);
const windowOfAxis = (f: ReturnType<typeof fieldOf>, i: number): [number | null, number | null] => {
  /* One window per ORDER; the axis's positions all sit in the one their own
   * order implies, so the readout takes the order the candidates were built
   * at rather than inventing a second derivation. */
  const a = f.field.axes[i];
  const order = a.orders[0];
  const w = order === undefined ? undefined : a.window[String(order)];
  return [w?.floorHz ?? null, w?.ceilingHz ?? null];
};
for (let i = 0; i < wis.length; i++) {
  const [lo, hi] = windowOfAxis(fieldOf('exploration'), i);
  line(`  ${labels[i]}: window ${lo ?? '—'}–${hi ?? '—'} Hz (order ${fieldOf('exploration').field.axes[i].orders.join('/')})`);
}
line();
line(`THE FORM: crossover point ${PIN_CENTRE_HZ} ± ${PIN_MARGIN_HZ} Hz, ${PIN_STEPS} steps.`);
line();
line('WHAT THE v1 ROUTE WOULD DO WITH IT (crossoverVariants — slices of the pinned band):');
const v1 = crossoverVariants([PIN_CENTRE_HZ - PIN_MARGIN_HZ, PIN_CENTRE_HZ + PIN_MARGIN_HZ], PIN_STEPS);
for (const v of v1) {
  line(`   ${v.label.padEnd(10)} cage ${v.xoRange ? `${v.xoRange[0].toFixed(1)}–${v.xoRange[1].toFixed(1)}` : '—'}`);
}
line();
line('WHAT THE v2 ROUTE DID WITH IT BEFORE U-5b — nothing. The derived field, unchanged:');
const before = fieldOf('exploration');
for (const c of positionsOf(before)) {
  line(`   ${c.hz.map((h) => h.toFixed(1)).join(' · ').padEnd(24)} ${c.alignment.join(' · ')}`);
}
line(
  `   ${before.field.candidates.length} candidates ran where ${PIN_STEPS} were asked for, and not ` +
    'one of them is in the pinned band.',
);

/* ---- 2. what it runs since U-5b ----------------------------------------- */

line();
line('WHAT IT RUNS SINCE U-5b — the range expanded, then the same path as the typed list:');
const ranges = labels.map((_, i) =>
  i === labels.length - 1
    ? { centreHz: PIN_CENTRE_HZ, marginHz: PIN_MARGIN_HZ, steps: PIN_STEPS }
    : null,
);
const expanded = expandStatedRange(ranges[labels.length - 1]!, labels[labels.length - 1]);
for (const n of expanded.problems) line(`   ! ${n}`);
for (const n of expanded.notes) line(`   · ${n}`);
const merged = mergeStatedCrossings({
  parsed: parseStatedCrossings('', labels),
  ranges,
  pairLabels: labels,
});
line(`   complete: ${merged.complete}`);
const after = fieldOf('exploration', merged.perAxisHz);
const statedRows = positionsOf(after).filter((c) => c.stated);
for (const c of statedRows) {
  line(`   STATED ${c.hz.map((h) => h.toFixed(1)).join(' · ').padEnd(17)} ${c.alignment.join(' · ')}`);
}
line(
  `   ${statedRows.length} stated candidates for ${PIN_STEPS} asked positions` +
    `${statedRows.length === PIN_STEPS ? ' — what was asked for is what runs.' : ' — MISMATCH.'}`,
);
line();
line('THE NOTICE THE DESIGNER READS BEFORE THE SCAN STARTS:');
line(`   ${describeStatedPositions(labels, merged.perAxisHz)}`);

/* ---- 3. the union with the typed list ------------------------------------ */

line();
line('BOTH FORMS AT ONCE — the list and the range are one set per handover:');
const bothMerged = mergeStatedCrossings({
  parsed: parseStatedCrossings(`2000, ${PIN_CENTRE_HZ}`, labels),
  ranges,
  pairLabels: labels,
});
line(`   ${labels[labels.length - 1]}: ${bothMerged.perAxisHz[labels.length - 1].join(', ')} Hz`);
for (const n of bothMerged.notes.slice(-1)) line(`   · ${n}`);

/* ---- 4. P2: nothing pinned is the field it always was --------------------- */

line();
line('P2 — WITH NOTHING PINNED AND NOTHING TYPED, THE FIELD IS BYTE-IDENTICAL:');
const none = mergeStatedCrossings({
  parsed: parseStatedCrossings('', labels),
  ranges: labels.map(() => null),
  pairLabels: labels,
});
const plain = fieldOf('exploration');
const keyBefore = stableJson(candidateFieldKey(plain.field));
const keyNone = stableJson(
  candidateFieldKey(fieldOf('exploration', none.complete ? none.perAxisHz : undefined).field),
);
line(`   complete: ${none.complete} (nothing stated) · field key identical: ${keyBefore === keyNone}`);
const keyAfter = stableJson(candidateFieldKey(after.field));
line(`   and with the pin on it is another field: ${keyBefore !== keyAfter}`);

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _wat: 'U-5b — de crossover-range-invoer gemeten: wat het formulier zegt en wat de run doet.',
      _bron: 'scripts/measure-u5b-range.ts, op de tweewegdemo (src/demo2way.ts) door de adapter van de app',
      _gemeten_op: new Date().toISOString().slice(0, 10),
      formulier: { centrum_hz: PIN_CENTRE_HZ, marge_hz: PIN_MARGIN_HZ, stappen: PIN_STEPS },
      overnames: labels,
      venster_hz: before.field.axes.map((_, i) => windowOfAxis(before, i)),
      v1_route_slices: v1.map((v) => ({ label: v.label, kooi: v.xoRange ?? null })),
      voor_u5b_afgeleid_veld: positionsOf(before),
      expansie: { posities_hz: expanded.hz, notities: expanded.notes, problemen: expanded.problems },
      na_u5b_gestelde_kandidaten: statedRows,
      unie_met_de_lijst: bothMerged.perAxisHz,
      p2_niets_gesteld_is_hetzelfde_veld: keyBefore === keyNone,
      p2_wel_gesteld_is_een_ander_veld: keyBefore !== keyAfter,
    },
    null,
    2,
  )}\n`,
);
line();
line(`written: ${OUT}`);
