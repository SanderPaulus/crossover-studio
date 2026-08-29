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
 *   corpora: `v30` · `v32` · `v33sweep` · `v33` · `v34` · `v37` · `v38fix` · `v41` ·
 *            `v42` · `live`
 *   default: `v42` → `live`   (casebook V43)
 *   V32's own table: `npx vite-node scripts/compare-corpora.ts v30 v32`
 *   V33's own table: `npx vite-node scripts/compare-corpora.ts v32 v33`
 *   V33's two arms:  `npx vite-node scripts/compare-corpora.ts v33sweep v33`
 *   V34's own table: `npx vite-node scripts/compare-corpora.ts v33 v34`
 *   V37's own table: `npx vite-node scripts/compare-corpora.ts v34 v37`
 *   V38-fix's table: `npx vite-node scripts/compare-corpora.ts v37 v38fix`
 *   V41's own table: `npx vite-node scripts/compare-corpora.ts v38fix v41`
 *   V42's own table: `npx vite-node scripts/compare-corpora.ts v41 v42`
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
  casus1LfResonantBudgetDb,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import { busTopology, optimizeNetworkValues } from '../src/lib/netOptimizer.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { CASUS1_DIR } from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import { decompose } from './v38-groups.ts';

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
  v37: { block: 'v37_corpus', name: 'V37' },
  v38fix: { block: 'v38fix_corpus', name: 'V38-fix' },
  v41: { block: 'v41_corpus', name: 'V41' },
  v42: { block: 'v42_corpus', name: 'V42' },
};

const corpusOf = (id: string): Corpus => {
  if (id === 'live') return liveCorpus();
  const d = DATED[id];
  if (d) return datedCorpus(d.block, d.name);
  throw new Error(`unknown corpus "${id}" — use ${[...Object.keys(DATED), 'live'].join(', ')}`);
};

const [beforeId = 'v42', afterId = 'live'] = process.argv.slice(2);
const before = corpusOf(beforeId);
const after = corpusOf(afterId);

interface Row {
  minZ: number | null;
  atHz: number | null;
  splWindow: number | null;
  rms: number | null;
  /** De RAPPORT-maat: `system.phaseTracking`, één octaaf rond het kruispunt,
   *  geknipt op meetgeldigheid en met zijn dekking erbij (A5.5). */
  wmPhase: number | null;
  mtPhase: number | null;
  /** De TUNER-maat: `pairPhaseDeg` uit `netOptimizer`, de grootheid waarop de
   *  zoektocht zijn fasebudget uitgeeft. V38 mat dat de twee op HUIDIG's zaad
   *  overeenkomen (22,28° tegen 23,83°) en op het geleverde netwerk in
   *  TEGENGESTELDE richting uiteenlopen (9,65° tegen 47,68°). Zolang dat zo is
   *  is één fasekolom een half antwoord, en welke van de twee de luidspreker
   *  beschrijft is open (V40). Vandaar twee kolommen, met naam. */
  wmPhaseTuner: number | null;
  mtPhaseTuner: number | null;
  clearsFloor: boolean | null;
  /** V36 — M-A's fraction as a percentage, and the WATTS in the largest single
   *  discrete resistor at the assumed power. A column, never a criterion: this
   *  script ranks nothing and no threshold anywhere compares against it. */
  dissPct: number | null;
  largestRw: number | null;
  /** V38-fix — de rest van de vector waarmee V38 zijn armen vergeleek, zodat
   *  deze tabel en het casusboek in dezelfde eenheden staan: EPDR (M-B), de
   *  Q_es-vermenigvuldiging van de laagste weg (M-E) en de grootste smalle
   *  piek die de venstergladding wegneemt (A5e.1). */
  epdr: number | null;
  qesMult: number | null;
  narrowPeakDb: number | null;
  narrowPeakHz: number | null;
  /**
   * V41 — WELKE CORRECTIEGROEPEN DE SYNTHESESTAP WERKELIJK GEKOCHT HEEFT.
   *
   * Geteld uit de GELEVERDE netlist door `decompose` (de decompositie van V38,
   * één implementatie en inmiddels vier lezers), niet afgelezen van een
   * ontwerpintentie. De klassen zijn precies die welke géén filterpool zijn:
   * val, gedempte val, Zobel, shunt-shelf, serie-niveauweerstand,
   * shunt-niveauweerstand. Dat is de vraag die V38 als beslispunt B en C open
   * liet — het veld droeg er nul van de eerste vier op tien netlists, en de
   * twee instellingen die dat bepaalden werden overgeërfd.
   *
   * EEN KOLOM EN GEEN CRITERIUM. Méér correctiegroepen is niet beter: het zijn
   * shunts, en een shunt kost dissipatie en belastingimpedantie. De twee
   * kolommen ernaast (`dissPct`, `minZ`) zeggen of ze betaald zijn, en casus 1
   * stelt geen dissipatiegrens (P4).
   */
  groups: Record<string, number>;
  /**
   * V42 — DE DOELGROOTHEID VAN DEZE SESSIE en de knop die haar stuurt.
   *
   * `bultDb` is `lfBump().extraDb`: het extra niveau dat het elektrische filter
   * rond de bovenste reflexpiek bovenop de kale driver legt — precies de
   * grootheid waarin het gestelde budget is uitgedrukt, zodat de vóór/ná-kolom
   * en de eis dezelfde eenheid hebben.
   *
   * `seriesLmH` is de TOTALE seriespoel van de weg waarop M-D oordeelt, want
   * dat is de grootheid die de A5d.6-inversie begrenst. Twee kolommen en niet
   * één: de eerste zegt of de eis gehaald is, de tweede waarom.
   */
  bultDb: number | null;
  seriesLmH: number | null;
  /**
   * V43 — DE BULT ONTLEED, en `opslingeringDb` is sinds V43 de doelgrootheid.
   *
   * `liftDb` is wat het RESISTIEVE EQUIVALENT van hetzelfde netwerk in zijn
   * eentje aan het laag doet; `opslingeringDb` is wat de reactanties daar
   * bovenop leggen. Zij tellen per constructie op tot `bultDb`, dus de oude
   * kolom blijft leesbaar naast de twee nieuwe. Het GESTELDE budget staat sinds
   * V43 op `opslingeringDb`: de lift is niveauwerk en hoort bij A5e.2.
   */
  liftDb: number | null;
  opslingeringDb: number | null;
}

const r2 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));

/* ---- de TUNER-maat op een BESTAND (V38-fix) --------------------------- *
 *
 * `NetOptimizeResult.before` is de volle-raster-metriek van het ZAAD, gemeten
 * door de tuner zelf vóórdat hij iets verplaatst. Eén onderdeel blijft vrij en
 * het budget staat op het minimum: de tuner weigert een netwerk waarin álles
 * op slot zit ("nothing for the optimizer to move"), en `before` hangt niet af
 * van wat de zoektocht daarna doet. Gemeten 0,5 s per netlist.
 *
 * WAAROM NIET NAGEBOUWD. De fasemaat van de tuner nog een keer uitrekenen in
 * dit script zou een tweede implementatie van een metriek zijn, en dat is
 * precies wat dit project elders verbiedt — V21 ging erover. Dus wordt de
 * tuner gevraagd, met de opties waarmee de v2-route hem vraagt.
 *
 * GEEN `staged`, `safety` of `audit`: die verplaatsen of verwijderen
 * onderdelen, en dit is een MÉTING van een bestand. */
const v2chain = casus1ChainInput(manifest, files, golden);

function tunerPhaseOf(key: string): { wm: number | null; mt: number | null } {
  const name = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists[key];
  const parts: VxpPart[] = deserializeFilter(
    readFileSync(join(CASUS1_DIR, name), 'utf-8'),
  ).parts;
  let freed = false;
  const pinned = parts.map((p) => {
    if (p.partId === undefined || p.type === 'Driver' || p.type === 'Generator') return p;
    if (!freed) {
      freed = true;
      return p;
    }
    return { ...p, locked: true };
  });
  try {
    const r = optimizeNetworkValues(
      pinned,
      [...v2chain.grid],
      v2chain.w,
      v2chain.t,
      v2chain.driverZ,
      { offsetMm: 0, trimDb: 0, inverted: false },
      {
        midBranch: { response: v2chain.m, adjust: {} },
        band: CASUS1_V2_BAND_HZ,
        phaseMetric: CASUS1_V2_SETTINGS.phaseMetric,
        maxIterations: 1,
      },
    );
    const pp = r.before.pairPhaseDeg ?? [];
    return { wm: r2(pp[0] ?? null), mt: r2(pp[1] ?? null) };
  } catch {
    // Een netlist die de tuner niet kan oplossen levert geen fasemaat, en dat
    // is een leeg vakje en geen nul.
    return { wm: null, mt: null };
  }
}

/**
 * V41 — de niet-poolgroepen van één bevroren netlist, per rol geteld.
 *
 * Leest hetzelfde bestand dat `measure` hieronder rapporteert, en telt met
 * `decompose` uit `v38-groups.ts`. Geen tweede definitie van "wat een val is":
 * die staat daar, is door de ablatie van V38 gebruikt, en een script dat er
 * hier een eigen versie van maakt is precies waar V21 over ging.
 */
const CORRECTION_ROLES = [
  'trap',
  'damped-trap',
  'zobel',
  'shunt-shelf',
  'series-pad',
  'shunt-pad',
] as const;

function correctionGroupsOf(key: string): Record<string, number> {
  const name = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists[key];
  const parts: VxpPart[] = deserializeFilter(
    readFileSync(join(CASUS1_DIR, name), 'utf-8'),
  ).parts;
  const out: Record<string, number> = {};
  for (const role of CORRECTION_ROLES) out[role] = 0;
  for (const g of decompose(parts)) {
    if (out[g.role] !== undefined) out[g.role]++;
  }
  return out;
}

/** De correctiegroepen als één cel: alleen wat er IS, of een liggend streepje. */
const groupCell = (g: Record<string, number> | undefined): string => {
  if (!g) return '—';
  const parts = CORRECTION_ROLES.filter((r) => (g[r] ?? 0) > 0).map((r) => `${r}×${g[r]}`);
  return parts.length ? parts.join(' ') : 'geen';
};

/**
 * V42 — de totale seriespoel van de weg waarop M-D oordeelt, mH.
 *
 * De WEG wordt afgeleid en niet benoemd: `rep.metrics.lfBump[0].driver` is de
 * weg waarvoor de metriek een bult berekent, en dat is per definitie dezelfde
 * weg die de inversie begrenst. Nergens in dit script staat het woord
 * "woofer". De spoelen komen uit `busTopology` — de bus-wandeling van de app
 * zelf — en niet uit een tweede mening over wat "in serie" betekent.
 */
function seriesInductanceMH(key: string, driver: string | null): number | null {
  if (driver === null) return null;
  const name = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists[key];
  const parts: VxpPart[] = deserializeFilter(
    readFileSync(join(CASUS1_DIR, name), 'utf-8'),
  ).parts;
  const bus = busTopology(parts);
  let total = 0;
  let seen = 0;
  for (const p of parts) {
    if (p.type !== 'Inductor' || p.partId === undefined || p.open || p.shorted) continue;
    if (!bus.driversOf(p.partId).includes(driver)) continue;
    total += p.params.find((q) => q.name === 'L')?.value ?? 0;
    seen++;
  }
  return seen > 0 ? total : null;
}

function measure(key: string): Row {
  const rep = buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: SETTINGS,
  });
  const pt = rep.system.phaseTracking;
  const tuner = tunerPhaseOf(key);
  const z = rep.metrics.epdr?.minZOhm ?? null;
  return {
    minZ: r2(z),
    atHz: r2(rep.metrics.epdr?.minZAtHz),
    splWindow: r2(rep.system.response?.windowPlusMinusDb),
    rms: r2(rep.system.response?.rmsDeviationDb),
    wmPhase: r2(pt.find((p) => p.lower === 'woofer')?.meanAbsDeg ?? null),
    mtPhase: r2(pt.find((p) => p.lower === 'mid')?.meanAbsDeg ?? null),
    wmPhaseTuner: tuner.wm,
    mtPhaseTuner: tuner.mt,
    clearsFloor: z === null || FLOOR === null ? null : meetsAmpFloor(z, FLOOR),
    dissPct: r2((rep.metrics.dissipation?.totalFraction ?? NaN) * 100),
    largestRw: r2(rep.metrics.dissipation?.elements.find((e) => !e.parasitic)?.watts ?? null),
    epdr: r2(rep.metrics.epdr?.minOhm),
    /* M-E van de LAAGSTE weg: de Thévenin-rij waarvan de doorlaatband het
     * laagst begint. Afgeleid, niet bij naam gezocht — nergens in dit project
     * mag een script weten wat een "woofer" is. */
    qesMult: r2(
      [...rep.metrics.thevenin].sort((a, b) => (a.atHz ?? Infinity) - (b.atHz ?? Infinity))[0]
        ?.qMultiplier ?? null,
    ),
    narrowPeakDb: r2(rep.system.response?.narrowPeaks[0]?.db ?? null),
    narrowPeakHz: r2(rep.system.response?.narrowPeaks[0]?.fHz ?? null),
    groups: correctionGroupsOf(key),
    bultDb: r2(rep.metrics.lfBump[0]?.result.extraDb ?? null),
    seriesLmH: r2(seriesInductanceMH(key, rep.metrics.lfBump[0]?.driver ?? null)),
    liftDb: r2(rep.metrics.lfBump[0]?.result.liftDb ?? null),
    opslingeringDb: r2(rep.metrics.lfBump[0]?.result.resonantDb ?? null),
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
    'SPL ± vóór → ná | RMS vóór → ná | W-M fase RAPPORT vóór → ná | ' +
    'W-M fase TUNER vóór → ná | M-T fase RAPPORT vóór → ná | M-T fase TUNER vóór → ná | ' +
    'dissipatie % vóór → ná | grootste R (W) vóór → ná | EPDR vóór → ná | ' +
    'Q_es× vóór → ná | smalste piek ná (dB @ Hz) | correctiegroepen vóór → ná | ' +
    'LF-bult dB vóór → ná | lift dB vóór → ná | opslingering dB vóór → ná | ' +
    'serie-L mH vóór → ná |',
);
console.log(
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
);

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
      `${num(b?.wmPhaseTuner ?? null)} → ${afterCell(a?.wmPhaseTuner ?? null)} | ` +
      `${num(b?.mtPhase ?? null)} → ${afterCell(a?.mtPhase ?? null)} | ` +
      `${num(b?.mtPhaseTuner ?? null)} → ${afterCell(a?.mtPhaseTuner ?? null)} | ` +
      `${num(b?.dissPct ?? null)} → ${afterCell(a?.dissPct ?? null)} | ` +
      `${num(b?.largestRw ?? null)} → ${afterCell(a?.largestRw ?? null)} | ` +
      `${num(b?.epdr ?? null)} → ${afterCell(a?.epdr ?? null)} | ` +
      `${num(b?.qesMult ?? null)} → ${afterCell(a?.qesMult ?? null)} | ` +
      `${a && a.narrowPeakDb !== null ? `${num(a.narrowPeakDb)} @ ${num(a.narrowPeakHz)}` : '—'} | ` +
      `${groupCell(b?.groups)} → ${a ? groupCell(a.groups) : outcome?.verwerping ? '**verworpen**' : 'geen netlist'} | ` +
      `${num(b?.bultDb ?? null)} → ${afterCell(a?.bultDb ?? null)} | ` +
      `${num(b?.liftDb ?? null)} → ${afterCell(a?.liftDb ?? null)} | ` +
      `${num(b?.opslingeringDb ?? null)} → ${afterCell(a?.opslingeringDb ?? null)} | ` +
      `${num(b?.seriesLmH ?? null)} → ${afterCell(a?.seriesLmH ?? null)} |`,
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
/* V38-fix — de twee fasematen naast elkaar als CORPUSGEMIDDELDE, want het
 * verschil tussen hen is een open bevinding (V40) en geen afrondingsverschil.
 * Twee kolommen die uiteenlopen zijn een vraag; één kolom is een antwoord dat
 * niemand gegeven heeft. */
console.log(
  `W-M fase gemiddeld: RAPPORT ${fmt(avg(measuredBefore.map((r) => r.wmPhase)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.wmPhase)))}°, TUNER ` +
    `${fmt(avg(measuredBefore.map((r) => r.wmPhaseTuner)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.wmPhaseTuner)))}°. ` +
    `M-T fase gemiddeld: RAPPORT ${fmt(avg(measuredBefore.map((r) => r.mtPhase)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.mtPhase)))}°, TUNER ` +
    `${fmt(avg(measuredBefore.map((r) => r.mtPhaseTuner)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.mtPhaseTuner)))}°. ` +
    'Welke van de twee de luidspreker beschrijft is open (V40).',
);
/* V41 — het CORPUSTOTAAL per correctierol, want dat is de vraag van
 * beslispunt B en C in één regel: koopt de synthese ze nu wel. Per rol, want
 * "meer groepen" zegt niets — een Zobel en een niveauweerstand zijn niet
 * hetzelfde soort aankoop, en alleen de eerste vier zijn wat V38 miste. */
const roleTotals = (rows: Row[]) => {
  const t: Record<string, number> = {};
  for (const role of CORRECTION_ROLES) t[role] = 0;
  for (const r of rows) for (const role of CORRECTION_ROLES) t[role] += r.groups[role] ?? 0;
  return t;
};
{
  const tb = roleTotals(measuredBefore);
  const ta = roleTotals(measuredAfter);
  console.log(
    'correctiegroepen over het corpus (' +
      CORRECTION_ROLES.map((r) => `${r} ${tb[r]}→${ta[r]}`).join(', ') +
      `) over ${measuredBefore.length} → ${measuredAfter.length} netlists. ` +
      'Een kolom, geen oordeel: een correctiegroep is een shunt en kost dissipatie en |Z|.',
  );
}
/* V42 — de doelgrootheid als corpusregel, met het gestelde budget ernaast.
 * Het budget wordt GELEZEN uit het manifest en nooit hier geschreven (P6). */
{
  const budget = casus1LfResonantBudgetDb(golden);
  const overCount = (rows: Row[]) =>
    budget === null
      ? null
      : rows.filter((r) => r.opslingeringDb !== null && r.opslingeringDb > budget).length;
  console.log(
    `LF-bult (M-D) gemiddeld: ${fmt(avg(measuredBefore.map((r) => r.bultDb)))} dB vóór → ` +
      `${fmt(avg(measuredAfter.map((r) => r.bultDb)))} dB ná, ontleed in lift ` +
      `${fmt(avg(measuredBefore.map((r) => r.liftDb)))} → ${fmt(avg(measuredAfter.map((r) => r.liftDb)))} dB ` +
      `en opslingering ${fmt(avg(measuredBefore.map((r) => r.opslingeringDb)))} → ` +
      `${fmt(avg(measuredAfter.map((r) => r.opslingeringDb)))} dB; totale serie-L van de laagste weg ` +
      `${fmt(avg(measuredBefore.map((r) => r.seriesLmH)))} → ` +
      `${fmt(avg(measuredAfter.map((r) => r.seriesLmH)))} mH. ` +
      (budget === null
        ? 'Geen budget gesteld, dus dit is een kolom en geen eis (P4).'
        : `Gesteld budget ${budget} dB OP DE OPSLINGERING (V43): ${overCount(measuredBefore)} van ` +
          `${measuredBefore.length} eroverheen vóór, ${overCount(measuredAfter)} van ` +
          `${measuredAfter.length} ná. De LIFT wordt hier niet geoordeeld — dat is ankerdomein ` +
          '(A5e.2).'),
  );
}
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
