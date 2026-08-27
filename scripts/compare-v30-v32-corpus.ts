/**
 * V31/V32 — THE BEFORE/AFTER TABLE, MEASURED AS FILES.
 *
 * Run with `npx vite-node scripts/compare-v30-v32-corpus.ts`, AFTER
 * `generate-casus1-v2-candidates.ts` and `record-casus1-v2-references.ts`.
 * Seconds, not minutes: it runs no chain and tunes nothing.
 *
 * WHY THIS IS A DIFFERENT SHAPE FROM V30's MEASUREMENT SCRIPT.
 * `measure-v30-floor-goal.ts` ran the same field twice and switched one option
 * between the arms, because V30's change WAS an option. V32's is not — an
 * electrical gate judges on the measured sweep now, full stop, and there is no
 * flag that puts it back. So the "before" arm is not a run: it is the corpus
 * that was frozen before the repair, sitting in the repository as
 * `V30-KAND-*.adsfilter.json`, and the comparison is between two sets of files.
 *
 * That also makes it the honest comparison. Both halves go through exactly the
 * same `buildReport` path the frozen netlists always go through, so the "after"
 * numbers are not a run's self-report — they are the same measurement anyone
 * else can repeat from the repository.
 *
 * THE PAIRING IS BY CANDIDATE, NOT BY FILE NUMBER. `KAND-V2-3` and
 * `V30-KAND-3` are the third row of two different shortlists and have nothing
 * to do with each other; what pairs them is the candidate they were tuned for
 * (a pair of handover frequencies and orders). Those live in
 * `manifest_en_geometrie.v30_corpus` for the old corpus and in
 * `casus1_v2_herkomst.json` for the new one. A candidate present in one corpus
 * and absent from the other is a ROW, not a gap: that is the finding.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1AmpMinLoadOhm,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { meetsAmpFloor } from '../src/lib/impedanceFloor.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const FLOOR = casus1AmpMinLoadOhm(golden);

const SETTINGS: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: FLAT_TARGET,
  ...(FLOOR !== null ? { ampMinLoadOhm: FLOOR } : {}),
};

const herkomst = JSON.parse(
  readFileSync(join(HERE, '..', 'test-fixtures', 'casus1_v2_herkomst.json'), 'utf-8'),
) as {
  bestanden: { name: string; label: string }[];
  kandidaat_uitkomst: {
    label: string;
    geweigerd_door: string[];
    verwerping: { regels: string[]; reden: string; geweigerde_tune: Record<string, number | null> | null } | null;
    poorten: { poort: string; waarde: number | null; geslaagd: boolean }[];
  }[];
};

const v30 = (
  golden.manifest_en_geometrie as unknown as {
    v30_corpus: { bestanden: { naam: string; kandidaat: string }[] };
  }
).v30_corpus.bestanden;

interface Row {
  minZ: number | null;
  atHz: number | null;
  splWindow: number | null;
  rms: number | null;
  wmPhase: number | null;
  mtPhase: number | null;
  clearsFloor: boolean | null;
}

const r2 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));

function measure(key: string): Row {
  const rep = buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: SETTINGS,
  });
  const pt = rep.system.phaseTracking;
  const z = rep.metrics.epdr?.minZOhm ?? null;
  return {
    minZ: r2(z),
    atHz: r2(rep.metrics.epdr?.minZAtHz),
    splWindow: r2(rep.system.response?.windowPlusMinusDb),
    rms: r2(rep.system.response?.rmsDeviationDb),
    wmPhase: r2(pt.find((p) => p.lower === 'woofer')?.meanAbsDeg ?? null),
    mtPhase: r2(pt.find((p) => p.lower === 'mid')?.meanAbsDeg ?? null),
    clearsFloor: z === null || FLOOR === null ? null : meetsAmpFloor(z, FLOOR),
  };
}

/** Candidate label -> the netlist key that corpus froze for it, if any. */
const beforeByCandidate = new Map(v30.map((b) => [b.kandidaat, b.naam]));
const afterByCandidate = new Map(
  herkomst.bestanden.map((b) => [b.label, b.name.replace(/-/g, '_')]),
);
const outcomeByCandidate = new Map(herkomst.kandidaat_uitkomst.map((o) => [o.label, o]));

/* Every candidate either corpus knows about, in the order the new field ran
 * them — so the table reads as a field with holes rather than as two lists. */
const labels: string[] = [];
for (const o of herkomst.kandidaat_uitkomst) labels.push(o.label);
for (const b of v30) if (!labels.includes(b.kandidaat)) labels.push(b.kandidaat);

const num = (v: number | null) => (v === null ? '—' : v.toFixed(2));
const short = (label: string) =>
  label.replace(/woofer→mid /, '').replace(/ LR4 · mid→tweeter /, ' · ').replace(/ LR4$/, '');

console.log(`gestelde vloer: ${FLOOR ?? '—'} Ω`);
console.log(
  '| kandidaat (W-M · M-T) | min |Z| vóór | min |Z| ná | @ Hz ná | vloer vóór → ná | ' +
    'SPL ± vóór → ná | RMS vóór → ná | W-M fase vóór → ná | M-T fase vóór → ná |',
);
console.log('|---|---|---|---|---|---|---|---|---|');

let beforeClears = 0;
let afterClears = 0;
const gone: string[] = [];
const arrived: string[] = [];
for (const label of labels) {
  const bKey = beforeByCandidate.get(label);
  const aKey = afterByCandidate.get(label);
  const b = bKey ? measure(bKey) : null;
  const a = aKey ? measure(aKey) : null;
  if (b?.clearsFloor) beforeClears++;
  if (a?.clearsFloor) afterClears++;
  if (b && !a) gone.push(label);
  if (a && !b) arrived.push(label);
  const outcome = outcomeByCandidate.get(label);
  const afterCell = (v: number | null) =>
    a ? num(v) : outcome?.verwerping ? '**verworpen**' : 'geen netlist';
  console.log(
    `| ${short(label)} | ${num(b?.minZ ?? null)} | ${afterCell(a?.minZ ?? null)} | ` +
      `${a ? num(a.atHz) : '—'} | ` +
      `${b ? (b.clearsFloor ? '**ja**' : 'nee') : '—'} → ${a ? (a.clearsFloor ? '**ja**' : 'nee') : '—'} | ` +
      `${num(b?.splWindow ?? null)} → ${afterCell(a?.splWindow ?? null)} | ` +
      `${num(b?.rms ?? null)} → ${afterCell(a?.rms ?? null)} | ` +
      `${num(b?.wmPhase ?? null)} → ${afterCell(a?.wmPhase ?? null)} | ` +
      `${num(b?.mtPhase ?? null)} → ${afterCell(a?.mtPhase ?? null)} |`,
  );
}

console.log('');
console.log(`bevroren: ${v30.length} vóór → ${herkomst.bestanden.length} ná`);
console.log(
  `haalt de vloer ALS BESTAND: ${beforeClears} van ${v30.length} vóór → ` +
    `${afterClears} van ${herkomst.bestanden.length} ná`,
);
console.log(`uit de shortlist gevallen: ${gone.length}${gone.length ? ` — ${gone.map(short).join('; ')}` : ''}`);
console.log(`nieuw in de shortlist: ${arrived.length}${arrived.length ? ` — ${arrived.map(short).join('; ')}` : ''}`);

const refused = herkomst.kandidaat_uitkomst.filter((o) => o.verwerping !== null);
console.log(`\nV31 — kandidaten die GEEN netwerk leverden: ${refused.length} van ${herkomst.kandidaat_uitkomst.length}`);
for (const o of refused) {
  const t = o.verwerping!.geweigerde_tune;
  console.log(
    `  ${short(o.label)} — geweigerd door ${o.verwerping!.regels.join(', ') || '(geen categorie)'}; ` +
      `de geweigerde tune stond op ${t?.minZOhm?.toFixed(2) ?? '—'} Ω / ` +
      `±${t?.windowPlusMinusDb?.toFixed(2) ?? '—'} dB / RMS ${t?.rmsDeviationDb?.toFixed(2) ?? '—'} dB`,
  );
}
const gateRefused = herkomst.kandidaat_uitkomst.filter(
  (o) => o.verwerping === null && o.geweigerd_door.length > 0,
);
console.log(`\nkandidaten die een netwerk leverden dat een POORT weigerde: ${gateRefused.length}`);
for (const o of gateRefused) {
  const z = o.poorten.find((p) => p.poort === 'M-B/|Z|');
  console.log(`  ${short(o.label)} — ${o.geweigerd_door.join(', ')}; min |Z| ${z?.waarde ?? '—'} Ω`);
}
