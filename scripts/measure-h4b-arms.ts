/**
 * H-4b — WHAT THE ARMEN-GARANTIE COSTS, measured on the three-way demo bundle.
 *
 * H-4 gated every mirrored polarity arm on the pre-design phase reading, and
 * the entry recorded what that meant on the demo: "verkenning = 6 runs, 0
 * gespiegeld" — the reversed mid was never simulated at all. Sander stated on
 * 20-09-2026 that a three-way session must always simulate it, and H-4b makes
 * the single-driver reversal unconditional.
 *
 * This script is the PRICE, in the form this project accepts one: not a
 * sentence in a session log but a run anyone can repeat. It builds the BARE
 * demo field exactly as `App.tsx` does — the demo bundle through the app's own
 * adapter, the report's own window inputs, the same per-pair derivation inputs
 * and the same per-crossing phase reading — and counts the field in four
 * modes: exploration and full, before and after the guarantee.
 *
 * NO CHAIN RUN AND NO TUNE: a field is a field, and its SIZE is what the
 * guarantee changes. The wall-clock price is that size times the per-run cost
 * this casebook has already measured in the browser, and the table prints both
 * so neither is mistaken for the other.
 *
 *   npx vite-node scripts/measure-h4b-arms.ts
 */

import { writeFileSync } from 'node:fs';

import { buildEngineV2Input, type AdapterBranch, type AdapterGeometry, type AdapterResponse } from '../src/lib/engine2/appAdapter.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { AUTO_STRUCTS } from '../src/lib/threeWayDesign.ts';
import { buildCandidateField } from '../src/lib/engine2/predesign/candidateField.ts';
import { fieldModeSettings, describeFieldMode } from '../src/lib/engine2/predesign/fieldMode.ts';
import {
  polarityMarginReader,
  singleReversalMask,
  type PolarityBranch,
} from '../src/lib/engine2/predesign/polarityArms.ts';
import { pairDerivationInputs } from '../src/lib/engine2/optimizer/scanRequest.ts';
import { KOAN_3WAY_DEMO } from '../src/demo3way.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseZma } from '../src/lib/parsers/zma.ts';
import { logspace, resample, type GriddedResponse } from '../src/lib/dsp.ts';

/** The analysis grid the app's sim base runs on for the demo bundle. */
const GRID_POINTS = 500;

/**
 * THE PER-RUN WALL CLOCK, from this casebook's own browser measurements — not
 * measured here, and labelled so it cannot be read as if it were. U-1
 * (09-09-2026) ran the bare three-way demo exploration at 902 s for 6 runs;
 * U-3b (09-09-2026) at 900 s for 6. Both on the same machine, both bare.
 */
const BROWSER_SECONDS_PER_RUN = 900 / 6;

const out = (s: string) => console.log(s);

/* ------------------------------------------------------------------ *
 * The demo bundle through the app's adapter, as `buildV2Report` builds it
 * ------------------------------------------------------------------ */

const asResponse = (name: string, raw: string): AdapterResponse => {
  const f = parseFrd(raw);
  return { name, freq: f.freq, spl: f.spl, phaseDeg: f.phase, comments: f.meta.rawComments };
};

const branches = (): AdapterBranch[] => {
  const D = KOAN_3WAY_DEMO;
  const branch = (role: 'low' | 'mid' | 'high', b: typeof D.low | typeof D.mid | typeof D.high): AdapterBranch => {
    const z = parseZma(b.impedance.raw);
    return {
      role,
      onAxis: asResponse(b.angles[0].file.name, b.angles[0].file.raw),
      offAxis: b.angles.map((a) => ({ hor: a.hor, response: asResponse(a.file.name, a.file.raw) })),
      nearField: 'nearCone' in b && b.nearCone ? [asResponse(b.nearCone.name, b.nearCone.raw)] : [],
      impedance: { name: b.impedance.name, freq: z.freq, magnitude: z.magnitude, phaseDeg: z.phase },
    };
  };
  return [branch('low', D.low), branch('mid', D.mid), branch('high', D.high)];
};

const geometry = (): AdapterGeometry => {
  const c = KOAN_3WAY_DEMO.cabinet;
  const num = (v: string): number | undefined => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const count = (role: 'low' | 'mid' | 'high') => {
    const n = Number(c.drivers[role].count);
    return Number.isFinite(n) && n >= 1 ? n : undefined;
  };
  return {
    verticalMm: { low: num(c.drivers.low.yMm), mid: num(c.drivers.mid.yMm), high: num(c.drivers.high.yMm) },
    arraySpacingMm: { low: (count('low') ?? 1) > 1 ? num(c.drivers.low.spacingMm) : undefined, mid: undefined, high: undefined },
    sourceCount: { low: count('low'), mid: count('mid'), high: count('high') },
    baffleWidthMm: num(c.baffleWidthMm),
  };
};

/** The bare demo states NOTHING (U-3b): no gates, no budgets, no requirements. */
const built = buildEngineV2Input({
  sessionId: 'h4b-demo',
  branches: branches(),
  filter: null,
  geometry: geometry(),
  settings: {},
});
const report = buildReport(built.input);
const wis = report.predesign.windowInputs;

/** The measured curve of one role, on the grid the app's sim base uses. */
const griddedOf = (role: 'low' | 'mid' | 'high'): GriddedResponse => {
  const b = role === 'low' ? KOAN_3WAY_DEMO.low : role === 'mid' ? KOAN_3WAY_DEMO.mid : KOAN_3WAY_DEMO.high;
  const f = parseFrd(b.angles[0].file.raw);
  const grid = logspace(Math.max(f.freq[0], 10), Math.min(f.freq[f.freq.length - 1], 20000), GRID_POINTS);
  return resample(f.freq, f.spl, f.phase, grid);
};
const GRIDDED = { low: griddedOf('low'), mid: griddedOf('mid'), high: griddedOf('high') } as const;

const roleOfDriver = (driver: string): 'low' | 'mid' | 'high' | null =>
  (['low', 'mid', 'high'] as const).find((r) => built.driverIds[r] === driver) ?? null;

/* The app's `polarityBranchOf`: the same branches the design step sums, each
 * way's adjustment relative to the lowest. The bare demo adjusts nothing. */
const branchOf = (driver: string): PolarityBranch | null => {
  const role = roleOfDriver(driver);
  return role ? { response: GRIDDED[role], adjust: {} } : null;
};
const marginFor = polarityMarginReader(branchOf);

const perPair = pairDerivationInputs({
  windowInputs: wis,
  curveOfDriverId: (driver: string) => {
    const role = roleOfDriver(driver);
    return role ? { freq: GRIDDED[role].freq, db: GRIDDED[role].spl } : null;
  },
});

/* ------------------------------------------------------------------ *
 * The four fields
 * ------------------------------------------------------------------ */

const STEPS_PER_AXIS = 2; // the app's own default for a bare project

function build(mode: 'exploration' | 'full', withReading: boolean, arms: 'textbook' | 'both' = 'both') {
  const settings = fieldModeSettings(
    mode,
    { stepsPerAxis: STEPS_PER_AXIS, pairs: wis.length },
    withReading ? marginFor : undefined,
    withReading ? arms : undefined,
  );
  return buildCandidateField({ windowInputs: wis, alignments: AUTO_STRUCTS, ...settings, perPair });
}

/** H-4's behaviour: the same policy with the guarantee taken back out. */
function buildPreH4b(mode: 'exploration' | 'full') {
  const settings = fieldModeSettings(mode, { stepsPerAxis: STEPS_PER_AXIS, pairs: wis.length }, marginFor, 'both');
  const pa = settings.polarityArms;
  return buildCandidateField({
    windowInputs: wis,
    alignments: AUTO_STRUCTS,
    ...settings,
    ...(pa ? { polarityArms: { ...pa, guarantee: 'none' as const } } : {}),
    perPair,
  });
}

out('H-4b — DE PRIJS VAN DE ARMEN-GARANTIE OP DE DRIEWEGDEMO');
out('');
out(`handovers: ${wis.map((w) => `${w.lower}→${w.upper}`).join(', ')}  (${wis.length})`);
out(`single-driver reversal mask over ${wis.length} handovers: 0b${singleReversalMask(wis.length).toString(2)}`);
out('');

const rows: { mode: string; label: string; n: number; mirrored: number }[] = [];
const record = (mode: string, label: string, f: ReturnType<typeof build>) => {
  const mirrored = f.field.candidates.filter((c: GeneratedCandidate) => c.polarity?.arm === 'mirror').length;
  rows.push({ mode, label, n: f.field.candidates.length, mirrored });
  return f;
};

const expNoRead = record('exploration', 'geen fasereading (de pre-H-4-stand)', build('exploration', false));
const expPre = record('exploration', 'H-4: alleen de marge', buildPreH4b('exploration'));
const expPost = record('exploration', 'H-4b: garantie + marge', build('exploration', true));
const fullPre = record('full', 'H-4: beide armen overal', buildPreH4b('full'));
const fullPost = record('full', 'H-4b: idem (de garantie beslist niets)', build('full', true));
/* H-5 — DE STANDAARD SINDS 24-09-2026. De textbook-keuze spiegelt niets, in
 * BEIDE modi: de verkenning valt terug op wat het veld afleidde en het volle
 * veld ook. `both` hierboven is H-4b ongewijzigd en blijft bereikbaar. */
const expTb = record('exploration', 'H-5: textbook (de standaard)', build('exploration', true, 'textbook'));
const fullTb = record('full', 'H-5: textbook (de standaard)', build('full', true, 'textbook'));

out('| modus | arm-beleid | kandidaten | gespiegeld | wandklok (s, uit U-1/U-3b) |');
out('| --- | --- | ---: | ---: | ---: |');
for (const r of rows) {
  out(`| ${r.mode} | ${r.label} | ${r.n} | ${r.mirrored} | ${Math.round(r.n * BROWSER_SECONDS_PER_RUN)} |`);
}
out('');
out(`DE PRIJS: verkenning ${expPre.field.candidates.length} → ${expPost.field.candidates.length} runs ` +
  `(${Math.round(expPre.field.candidates.length * BROWSER_SECONDS_PER_RUN)} → ` +
  `${Math.round(expPost.field.candidates.length * BROWSER_SECONDS_PER_RUN)} s bij ` +
  `${BROWSER_SECONDS_PER_RUN.toFixed(0)} s per run, GEMETEN IN DE BROWSER BIJ U-1/U-3b en hier niet opnieuw).`);
out(`Het VOLLE veld beweegt niet: ${fullPre.field.candidates.length} → ${fullPost.field.candidates.length}.`);
out('');
out(`H-5 — DE STANDAARD: verkenning ${expPost.field.candidates.length} → ${expTb.field.candidates.length} runs ` +
  `(${Math.round(expPost.field.candidates.length * BROWSER_SECONDS_PER_RUN)} → ` +
  `${Math.round(expTb.field.candidates.length * BROWSER_SECONDS_PER_RUN)} s), vol veld ` +
  `${fullPost.field.candidates.length} → ${fullTb.field.candidates.length}. ` +
  `Gespiegeld onder de standaard: ${expTb.field.candidates.filter((c: GeneratedCandidate) => c.polarity?.arm === 'mirror').length}.`);
out('DE LABELS VAN DE VERKENNING ONDER DE STANDAARD (H-5):');
for (const c of expTb.field.candidates) out(`  ${c.label}`);
out('');

out('DE LABELS VAN DE VERKENNING (H-4b):');
for (const c of expPost.field.candidates) out(`  ${c.label}`);
out('');
out('DE VELDREGEL:');
out(`  ${describeFieldMode(expPost.field)}`);
out('');
out('DE NOTITIES VAN HET VELD:');
for (const n of expPost.field.notes) out(`  · ${n}`);

writeFileSync(
  'test-fixtures/demo_h4b_armen.json',
  `${JSON.stringify(
    {
      _: 'H-4b — de prijs van de armen-garantie op de driewegdemo. Geschreven door scripts/measure-h4b-arms.ts; geen ketenrun en geen tune.',
      gemeten_op: new Date().toISOString().slice(0, 10),
      handovers: wis.map((w) => `${w.lower}→${w.upper}`),
      stappen_per_as: STEPS_PER_AXIS,
      wandklok_s_per_run: {
        waarde: BROWSER_SECONDS_PER_RUN,
        herkomst:
          'GEMETEN IN DE BROWSER bij U-1 (902 s / 6 runs) en U-3b (900 s / 6) op de kale driewegdemo, ' +
          'niet door dit script. Het script telt kandidaten; de wandklok is die telling maal dit getal.',
      },
      velden: rows,
      labels_verkenning: expPost.field.candidates.map((c: GeneratedCandidate) => c.label),
      veldregel: describeFieldMode(expPost.field),
      notities: expPost.field.notes,
      h5_standaard: {
        _: 'H-5 (24-09-2026) — de textbook-keuze is de standaard: zij spiegelt niets, in beide modi. `both` hierboven is H-4b ongewijzigd en blijft bereikbaar als gestelde run-keuze.',
        verkenning_kandidaten: expTb.field.candidates.length,
        verkenning_gespiegeld: expTb.field.candidates.filter((c: GeneratedCandidate) => c.polarity?.arm === 'mirror').length,
        vol_veld_kandidaten: fullTb.field.candidates.length,
        labels_verkenning: expTb.field.candidates.map((c: GeneratedCandidate) => c.label),
        veldregel: describeFieldMode(expTb.field),
      },
      geen_fasereading: {
        _: 'De pre-H-4-stand: zonder reading zaait geen enkele modus een arm, en het veld is byte voor byte wat het vóór H-4 was.',
        kandidaten: expNoRead.field.candidates.length,
      },
    },
    null,
    1,
  )}\n`,
);
out('geschreven: test-fixtures/demo_h4b_armen.json');
