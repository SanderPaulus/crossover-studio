/**
 * THE BEFORE/AFTER TABLE BETWEEN TWO FROZEN CORPORA, MEASURED AS FILES.
 *
 * Run with `npx vite-node scripts/compare-corpora.ts [vóór] [ná]`, AFTER
 * `generate-casus1-v2-candidates.ts` and `record-casus1-v2-references.ts`.
 * Seconds, not minutes: it runs no chain and tunes nothing.
 *
 * WHY IT TAKES ARGUMENTS NOW. This was `compare-v30-v32-corpus.ts`, and its
 * "after" half was hard-wired to the LIVE corpus — which meant that the moment
 * V33 regenerated that corpus, the script stopped reproducing the V32 table it
 * was written for and silently started producing a different one. A comparison
 * that cannot be re-run is not evidence; it is a paragraph someone typed once.
 * So both halves are named, every dated corpus stays addressable, and the
 * default is the newest comparison.
 *
 *   corpora: `v30` · `v32` · `v33sweep` · `v33` · `v34` · `live`
 *   default: `v34` → `live`   (casebook V37)
 *   V32's own table: `npx vite-node scripts/compare-corpora.ts v30 v32`
 *   V33's own table: `npx vite-node scripts/compare-corpora.ts v32 v33`
 *   V33's two arms:  `npx vite-node scripts/compare-corpora.ts v33sweep v33`
 *   V34's own table: `npx vite-node scripts/compare-corpora.ts v33 v34`
 *
 * WHY A FILE COMPARISON AND NOT TWO RUNS. `measure-v30-floor-goal.ts` ran the
 * same field twice and switched one option between the arms, because V30's
 * change WAS an option a caller could turn off. V32's was not, and V33's is one
 * a candidate states rather than a knob on the field — so the "before" arm is
 * not a run but the corpus that was frozen before the repair, sitting in the
 * repository. Both halves then go through exactly the same `buildReport` path,
 * so the "after" numbers are not a run's self-report: they are the measurement
 * anyone else can repeat from the repository.
 *
 * THE PAIRING IS BY CANDIDATE, NOT BY FILE NUMBER. `KAND-V2-3` and
 * `V32-KAND-3` are the third row of two different shortlists and have nothing
 * to do with each other; what pairs them is the candidate they were tuned for
 * (a pair of handover frequencies and orders). Those live in
 * `manifest_en_geometrie.v30_corpus` / `.v32_corpus` for the dated corpora and
 * in `casus1_v2_herkomst.json` for the live one. A candidate present in one
 * corpus and absent from the other is a ROW, not a gap: that is the finding.
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

interface Outcome {
  label: string;
  geweigerd_door: string[];
  verwerping: {
    regels: string[];
    reden: string;
    geweigerde_tune: Record<string, number | null> | null;
  } | null;
  poorten: { poort: string; waarde: number | null; geslaagd: boolean }[];
}

const herkomst = JSON.parse(
  readFileSync(join(HERE, '..', 'test-fixtures', 'casus1_v2_herkomst.json'), 'utf-8'),
) as {
  bestanden: { name: string; label: string }[];
  kandidaat_uitkomst: Outcome[];
};

/** One addressable corpus: which netlist key each candidate was frozen as. */
interface Corpus {
  name: string;
  byCandidate: Map<string, string>;
  /** The run's own account, when this corpus is the live one. */
  outcomes: Outcome[] | null;
  order: string[];
}

const datedCorpus = (block: string, name: string): Corpus => {
  const b = (
    golden.manifest_en_geometrie as unknown as Record<
      string,
      { bestanden: { naam: string; kandidaat: string }[] } | undefined
    >
  )[block];
  if (!b) throw new Error(`the case book has no ${block} — nothing to compare against`);
  return {
    name,
    byCandidate: new Map(b.bestanden.map((x) => [x.kandidaat, x.naam])),
    outcomes: null,
    order: b.bestanden.map((x) => x.kandidaat),
  };
};

const liveCorpus = (): Corpus => ({
  name: 'live',
  byCandidate: new Map(herkomst.bestanden.map((b) => [b.label, b.name.replace(/-/g, '_')])),
  outcomes: herkomst.kandidaat_uitkomst,
  order: herkomst.kandidaat_uitkomst.map((o) => o.label),
});

/**
 * The dated corpora, by the id a caller types.
 *
 * A map rather than a chain of `if`s, and it is the same lesson twice in one
 * session: a hand-maintained family list is what `goldenClassification.test.ts`
 * had to give up at V33, after a corpus was added at V32 and nobody came back.
 * One line per corpus, in one place, next to the block it names.
 */
const DATED: Record<string, { block: string; name: string }> = {
  v30: { block: 'v30_corpus', name: 'V30' },
  v32: { block: 'v32_corpus', name: 'V32' },
  v33sweep: { block: 'v33_sweep_corpus', name: 'V33-sweep' },
  v33: { block: 'v33_corpus', name: 'V33' },
  v34: { block: 'v34_corpus', name: 'V34' },
};

const corpusOf = (id: string): Corpus => {
  if (id === 'live') return liveCorpus();
  const d = DATED[id];
  if (d) return datedCorpus(d.block, d.name);
  throw new Error(`unknown corpus "${id}" — use ${[...Object.keys(DATED), 'live'].join(', ')}`);
};

const [beforeId = 'v34', afterId = 'live'] = process.argv.slice(2);
const before = corpusOf(beforeId);
const after = corpusOf(afterId);

interface Row {
  minZ: number | null;
  atHz: number | null;
  splWindow: number | null;
  rms: number | null;
  wmPhase: number | null;
  mtPhase: number | null;
  clearsFloor: boolean | null;
  /** V36 — M-A's fraction as a percentage, and the WATTS in the largest single
   *  discrete resistor at the assumed power. A column, never a criterion: this
   *  script ranks nothing and no threshold anywhere compares against it. */
  dissPct: number | null;
  largestRw: number | null;
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
    dissPct: r2((rep.metrics.dissipation?.totalFraction ?? NaN) * 100),
    largestRw: r2(rep.metrics.dissipation?.elements.find((e) => !e.parasitic)?.watts ?? null),
  };
}

const outcomeByCandidate = new Map((after.outcomes ?? []).map((o) => [o.label, o]));

/* Every candidate either corpus knows about, in the order the newer one ran
 * them — so the table reads as a field with holes rather than as two lists. */
const labels: string[] = [...after.order];
for (const label of before.order) if (!labels.includes(label)) labels.push(label);

const num = (v: number | null) => (v === null ? '—' : v.toFixed(2));
const short = (label: string) =>
  label.replace(/woofer→mid /, '').replace(/ LR4 · mid→tweeter /, ' · ').replace(/ LR4$/, '');

console.log(`vóór: ${beforeId}   ná: ${afterId}   gestelde vloer: ${FLOOR ?? '—'} Ω`);
console.log(
  /* The pipes in `|Z|` are ESCAPED, because this line is pasted into the case
   * book as a Markdown table and an unescaped one silently opens two extra
   * columns — which is exactly what happened to the V34 table before anyone
   * looked at the rendered file. */
  '| kandidaat (W-M · M-T) | min \\|Z\\| vóór | min \\|Z\\| ná | @ Hz ná | vloer vóór → ná | ' +
    'SPL ± vóór → ná | RMS vóór → ná | W-M fase vóór → ná | M-T fase vóór → ná | ' +
    'dissipatie % vóór → ná | grootste R (W) vóór → ná |',
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|');

let beforeClears = 0;
let afterClears = 0;
const gone: string[] = [];
const arrived: string[] = [];
/** Elke gemeten rij, per helft — voor het corpusgemiddelde onderaan. */
const measuredBefore: Row[] = [];
const measuredAfter: Row[] = [];
for (const label of labels) {
  const bKey = before.byCandidate.get(label);
  const aKey = after.byCandidate.get(label);
  const b = bKey ? measure(bKey) : null;
  const a = aKey ? measure(aKey) : null;
  if (b) measuredBefore.push(b);
  if (a) measuredAfter.push(a);
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
      `${num(b?.mtPhase ?? null)} → ${afterCell(a?.mtPhase ?? null)} | ` +
      `${num(b?.dissPct ?? null)} → ${afterCell(a?.dissPct ?? null)} | ` +
      `${num(b?.largestRw ?? null)} → ${afterCell(a?.largestRw ?? null)} |`,
  );
}

const beforeSize = before.byCandidate.size;
const afterSize = after.byCandidate.size;
console.log('');
console.log(`bevroren: ${beforeSize} vóór → ${afterSize} ná`);
console.log(
  `haalt de vloer ALS BESTAND: ${beforeClears} van ${beforeSize} vóór → ` +
    `${afterClears} van ${afterSize} ná`,
);
/* V36 — het corpusgemiddelde, uit de rijen die hierboven al gemeten zijn.
 * Opnieuw `measure()` aanroepen zou elke netlist een tweede keer oplossen voor
 * een gemiddelde, en dat is precies het patroon dat A3g elders verbiedt. */
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1));
console.log(
  `dissipatie (M-A) gemiddeld: ${fmt(avg(measuredBefore.map((r) => r.dissPct)))} % vóór → ` +
    `${fmt(avg(measuredAfter.map((r) => r.dissPct)))} % ná; grootste enkele weerstand gemiddeld ` +
    `${fmt(avg(measuredBefore.map((r) => r.largestRw)))} W → ` +
    `${fmt(avg(measuredAfter.map((r) => r.largestRw)))} W bij ${SETTINGS.amplifierPowerW} W. ` +
    'Een kolom, geen oordeel: casus 1 stelt geen dissipatiegrens (P4).',
);
console.log(`uit de shortlist gevallen: ${gone.length}${gone.length ? ` — ${gone.map(short).join('; ')}` : ''}`);
console.log(`nieuw in de shortlist: ${arrived.length}${arrived.length ? ` — ${arrived.map(short).join('; ')}` : ''}`);

/* The run's own account only exists for the LIVE corpus — a dated one is a set
 * of files and nothing more, and inventing a rejection list for it would be a
 * claim about a run nobody can re-read. */
if (after.outcomes) {
  const refused = after.outcomes.filter((o) => o.verwerping !== null);
  console.log(
    `\nkandidaten die GEEN netwerk leverden: ${refused.length} van ${after.outcomes.length}`,
  );
  for (const o of refused) {
    const t = o.verwerping!.geweigerde_tune;
    console.log(
      `  ${short(o.label)} — geweigerd door ${o.verwerping!.regels.join(', ') || '(geen categorie)'}; ` +
        `de geweigerde tune stond op ${t?.minZOhm?.toFixed(2) ?? '—'} Ω / ` +
        `±${t?.windowPlusMinusDb?.toFixed(2) ?? '—'} dB / RMS ${t?.rmsDeviationDb?.toFixed(2) ?? '—'} dB`,
    );
    console.log(`      reden: ${o.verwerping!.reden}`);
  }
  const gateRefused = after.outcomes.filter(
    (o) => o.verwerping === null && o.geweigerd_door.length > 0,
  );
  console.log(`\nkandidaten die een netwerk leverden dat een POORT weigerde: ${gateRefused.length}`);
  for (const o of gateRefused) {
    const z = o.poorten.find((p) => p.poort === 'M-B/|Z|');
    console.log(`  ${short(o.label)} — ${o.geweigerd_door.join(', ')}; min |Z| ${z?.waarde ?? '—'} Ω`);
  }
}
