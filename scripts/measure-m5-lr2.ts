/**
 * M-5 — DE LR2-VRAAG BESLECHT OP DE HUIDIGE MEETBASIS.
 *
 * `npx vite-node scripts/measure-m5-lr2.ts` — seconden, geen ketenrun en geen
 * tune: de AFLEIDINGSTABEL en het veld dat eruit volgt.
 * `M5_RUN=1 npx vite-node scripts/measure-m5-lr2.ts` — één ketenrun per rij,
 * `M5_JOBS` tegelijk, elk als kindproces met zijn eigen shard.
 * `M5_ONLY=<sleutel>` draait er één, `M5_REDO=1` overschrijft een shard,
 * `M5_SETS=m3,koan677` kiest welke meetsets meedoen (default: allebei).
 * Schrijft `test-fixtures/casus1_m5_lr2.json`.
 *
 * TWEE MEETSETS, EN BEIDE ZIJN GESTELD (Sander, 20-09-2026). `'m3'` is de
 * huidige meetbasis en het M-4-precedent op precies deze vraag ("een nieuwe
 * kandidaat hoort op de huidige meetbasis te lopen"); `'koan677'` is de set
 * waarop `KAND-V2-1/2/3` GEZOCHT zijn, dus de enige waarop beide helften van
 * de paring op één zoekbasis staan. Zij verschillen in precies één ding — de
 * hermergde fase van de mid in de W-M-kruisband (M-3) — en dat is de band waar
 * LR2 leeft, dus de vraag KAN ervan afhangen. Wat er van BEIDE draaien te leren
 * valt, is of zij dat doet. De AFLEIDING hangt er niet van af, en dat wordt
 * hier nagemeten in plaats van aangenomen.
 *
 * DE VRAAG, EN ZIJ IS OUDER DAN DEZE SESSIE. M-1 (04-09-2026) liet de
 * woofer→mid-as zich onthouden op de orde en draaide LR2 naast LR4; het veld
 * antwoordde "dezelfde weigeringen met 1-2 dB slechtere RMS", en sindsdien
 * STELT élke casus-1-regeneratie orde 4. Dat is een run-instelling en geen
 * meting, en er zijn sindsdien vier dingen veranderd die precies op die
 * vergelijking drukken: de meetbasis (M-2b, de 67,7 L-set), de FASE van de mid
 * in de W-M-kruisband (M-3), de polariteit als uitontworpen arm in plaats van
 * een tie-break op ideale filters (H-4), en de garantie dat de enkelvoudige
 * driveromkering altijd meedraait (H-4b). De LR2-arm van M-1 droeg de
 * polariteit die die tie-break koos.
 *
 * WAT DIT SCRIPT IS EN NIET IS. Het is een MEETSESSIE: geen corpus wordt
 * geregenereerd, geen shortlist opnieuw gekozen, geen bestaande netlist
 * overschreven, geen eis en geen grens verplaatst. Wat het oplevert is de
 * tabel waarmee "LR2 is verworpen" een gemeten uitspraak wordt in plaats van
 * een gepinde run-instelling — en, als de AFLEIDING hem weigert, de grond
 * waarop. De afleiding wordt daarvoor niet versoepeld: als LR2 nergens wordt
 * toegelaten is dát het antwoord (P1 — de tabel of de afleiding beslist, nooit
 * de wens).
 *
 * DRIE TABELLEN.
 *
 *   1. DE AFLEIDING PER FLANK, per beschikbare LR-orde, onder de drie
 *      wapeningen (`m5-bench.ts`): welk venster die orde krijgt, of hij wordt
 *      toegelaten, en bij een weigering de GROND in de eenheid van de grens
 *      die hem weigert — hertz waar de grens een frequentie is, decibel waar
 *      hij een dB-regel is. Dat laatste is U-5's derde regel, hier toegepast
 *      op een ORDE in plaats van op een positie.
 *
 *   2. HET VELD: welke rijen daaruit volgen, met hun uitlijning, hun arm en
 *      hun soldeer-markering, en wat de run gaat kosten.
 *
 *   3. DE VERGELIJKING: elke gedraaide rij met haar volle vector, gepaard tegen
 *      de netlist die het levende corpus op DEZELFDE positie draagt
 *      (LR4/LR4, textbook). Beide helften door ÉÉN meetbank (`corpusBank`), de
 *      regel die `compare-corpora.ts` sinds V33 draagt: wat afgetrokken wordt
 *      moet door hetzelfde pad gemeten zijn.
 */

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DB_PER_OCTAVE_PER_ORDER } from '../src/lib/engine2/constants.ts';
import { handleV2Request, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import { crossoverWindow, type XoWindowResult } from '../src/lib/engine2/predesign/xoWindow.ts';
import { alignmentFor } from '../src/lib/engine2/predesign/candidates.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import { corpusBank } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import {
  CASUS1_COIL_DCR,
  CASUS1_COIL_FAMILY_BY_DRIVER,
  CASUS1_FIELD_ALIGNMENTS,
  CASUS1_LF_RESONANT_BUDGET_DB,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import {
  casus1CoilCatalogPath,
  casus1FilterFromParts,
  loadGolden,
  type Casus1MeasurementSet,
} from '../src/lib/engine2/casus1.fixture.ts';
import { coilDcrInventory } from '../src/lib/coilDcr.ts';
import { judgeResponse } from '../src/lib/engine2/requirements/response.ts';
import { buildReport, type EngineV2Report } from '../src/lib/engine2/report.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import { bomOf, loadCoilCatalog } from './bomColumn.ts';
import { casus1PayloadFor } from './h4-bench.ts';
import { M5_STATED_PER_AXIS_HZ, m5Bench, type M5Arming } from './m5-bench.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_m5_lr2.json');
const SHARDS = join(HERE, '..', 'test-fixtures', '.casus1-m5-shards');
const SELF = fileURLToPath(import.meta.url);
const ONLY = process.env.M5_ONLY ?? null;
const RUN = process.env.M5_RUN === '1' || ONLY !== null;

const f = (v: number | null | undefined, n = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(n);

/** De meetsets die meedoen. Een kindproces krijgt er precies één (`M5_SET`). */
const SETS: Casus1MeasurementSet[] = (process.env.M5_SET ?? process.env.M5_SETS ?? 'm3,koan677')
  .split(',')
  .map((x) => x.trim())
  .filter((x) => x.length > 0)
  .map((x) => {
    if (x !== 'm3' && x !== 'koan677' && x !== 'merged' && x !== 'gated')
      throw new Error(`${x} is geen meetset van casus 1 (m3 | koan677 | merged | gated)`);
    return x;
  });

const benches = new Map<Casus1MeasurementSet, ReturnType<typeof m5Bench>>();
const benchOf = (set: Casus1MeasurementSet) => {
  const hit = benches.get(set);
  if (hit) return hit;
  const made = m5Bench(set);
  benches.set(set, made);
  return made;
};

const b = benchOf(SETS[0]);
const wis = b.bench.report.predesign.windowInputs;
const ARMINGS: M5Arming[] = ['stated', 'bare', 'armed'];
const AVAILABLE = [...new Set(CASUS1_FIELD_ALIGNMENTS.map((a) => a.order))].sort((x, y) => x - y);

console.log(`\n=== M-5 — DE LR2-VRAAG, meetset(s) ${SETS.join(' + ')} ===`);

/* ================================================================== *
 * 1 — DE AFLEIDING PER FLANK
 * ================================================================== */

/**
 * WAT ÉÉN ORDE OP DEZE OVERNAME LEVERT WAAR DE GRENS HEM MEET.
 *
 * Een vloer van het soort `drive` of `drive-stated` is A5d.3(ii) OMGEKEERD: hij
 * vraagt een verzwakking op de resonantie van de bovenste weg en rekent die om
 * naar de laagste overname die haar bij deze orde haalt. De eerlijke lezing van
 * "waarom valt deze orde af" is daarom niet de vloer in hertz maar de DECIBELS
 * die de flank op zijn GUNSTIGSTE toegestane plek levert — het plafond van het
 * venster — tegen de decibels die de grens vraagt. Onder die lezing is een
 * weigering niet "de vloer ligt boven het plafond" maar "deze orde komt overal
 * in de toegestane band N dB tekort", en dat is een uitspraak over de flank in
 * plaats van over de volgorde van twee getallen.
 */
function dbGround(
  w: XoWindowResult,
  order: number,
  fsHz: number | null,
  needDb: number | null,
  atHz: number | null,
): { atHz: number; deliveredDb: number; needDb: number; shortDb: number } | null {
  if (fsHz === null || needDb === null || atHz === null || !(fsHz > 0) || !(atHz > 0)) return null;
  void w;
  const delivered = DB_PER_OCTAVE_PER_ORDER * order * Math.log2(atHz / fsHz);
  const need = Math.abs(needDb);
  return { atHz, deliveredDb: delivered, needDb: need, shortDb: need - delivered };
}

interface DerivationRow {
  paar: string;
  orde: number;
  uitlijning: string | null;
  venster_hz: [number | null, number | null];
  vloer_regel: string | null;
  plafond_regel: string | null;
  leeg: boolean;
  toegelaten: Record<M5Arming, boolean>;
  grond_hz: string | null;
  grond_db: { atHz: number; deliveredDb: number; needDb: number; shortDb: number } | null;
  eis_demand: { rule: string; exactOrder: number; minOrder: number; source: string } | null;
}

function derivationOf(bn: ReturnType<typeof m5Bench>): {
  rows: DerivationRow[];
  fields: Record<M5Arming, ReturnType<typeof bn.fieldOf>>;
} {
const derivation: DerivationRow[] = [];
const fields = Object.fromEntries(ARMINGS.map((a) => [a, bn.fieldOf(a)])) as Record<
  M5Arming,
  ReturnType<typeof bn.fieldOf>
>;
const wis = bn.bench.report.predesign.windowInputs;

for (let i = 0; i < wis.length; i++) {
  const wi = wis[i];
  const label = `${wi.lower}→${wi.upper}`;
  for (const order of AVAILABLE) {
    const w = crossoverWindow({ ...wi, order });
    const empty = w.empty || w.floorHz === null || w.ceilingHz === null || !(w.ceilingHz > w.floorHz);
    const stated = wi.upperStatedDriveLimitDb ?? null;
    const derived = wi.upperDriveCeilingDb ?? null;
    /* De dB-grond wordt gelezen op de grens die WERKELIJK bindt: het gestelde
     * getal waar de vloer `drive-stated` is, het afgeleide excursieplafond waar
     * hij `drive` is. Een grond die de andere leest zou een verzwakking
     * vergelijken met een eis die deze weg niet stelt (U-5's derde regel). */
    const rule = w.floorBy?.rule ?? null;
    const need = rule === 'drive-stated' ? stated : rule === 'drive' ? derived : null;
    const ceilingHz = w.ceilingHz ?? null;
    derivation.push({
      paar: label,
      orde: order,
      uitlijning: alignmentFor(CASUS1_FIELD_ALIGNMENTS, order).chosen
        ? `${alignmentFor(CASUS1_FIELD_ALIGNMENTS, order).chosen!.kind}${order}`
        : null,
      venster_hz: [w.floorHz, w.ceilingHz],
      vloer_regel: rule,
      plafond_regel: w.ceilingBy?.rule ?? null,
      leeg: empty,
      toegelaten: Object.fromEntries(
        ARMINGS.map((a) => [a, fields[a].orders[i].orders.includes(order) && !empty]),
      ) as Record<M5Arming, boolean>,
      grond_hz: empty
        ? `vloer ${f(w.floorHz, 1)} Hz (${rule}) ligt BOVEN plafond ${f(ceilingHz, 1)} Hz ` +
          `(${w.ceilingBy?.rule ?? '—'}) — ${f(Math.log2((w.floorHz ?? 1) / (ceilingHz ?? 1)), 2)} octaaf te hoog`
        : null,
      grond_db: dbGround(w, order, wi.upperFsHz, need, ceilingHz),
      eis_demand: (() => {
        const d = fields.armed.orders[i].flanks
          .flatMap((fl) => fl.demands)
          .sort((x, y) => y.minOrder - x.minOrder)[0];
        return d ? { rule: d.rule, exactOrder: d.exactOrder, minOrder: d.minOrder, source: d.source } : null;
      })(),
    });
  }
}
  return { rows: derivation, fields };
}

const bySet = new Map<Casus1MeasurementSet, ReturnType<typeof derivationOf>>();
for (const set of SETS) bySet.set(set, derivationOf(benchOf(set)));
const { rows: derivation, fields } = bySet.get(SETS[0])!;

/**
 * DE AFLEIDING IS EEN EIGENSCHAP VAN DE MEETSET, EN DIT IS DE CONTROLE DAT ZIJ
 * DAT HIER NIET IS.
 *
 * M-3 verving de mid door zijn hermergde tegenhanger, en dat bewoog de FASE in
 * de W-M-kruisband en de magnitude nergens (M-3's eigen tabel). Élke invoer van
 * `crossoverWindow` is een magnitude, een impedantie of een gestelde
 * geldigheid, dus de vensters horen identiek te zijn — en "horen" is niet
 * "zijn". Gooit met het verschil erbij, in plaats van een tabel af te drukken
 * die stilzwijgend over één van de twee gaat.
 */
if (SETS.length > 1) {
  const fingerprint = (rs: DerivationRow[]) =>
    rs.map((r) => `${r.paar}|${r.orde}|${f(r.venster_hz[0], 4)}|${f(r.venster_hz[1], 4)}|${r.vloer_regel}|${r.plafond_regel}|${r.leeg}|${ARMINGS.map((a) => r.toegelaten[a]).join('')}`).join('\n');
  const base = fingerprint(derivation);
  for (const set of SETS.slice(1)) {
    const other = fingerprint(bySet.get(set)!.rows);
    if (other !== base) {
      throw new Error(
        `de A5d.3-afleiding VERSCHILT tussen ${SETS[0]} en ${set}, en M-5 drukt haar af als één ` +
          'tabel. Dat is een bevinding en geen ruis: iets dat de vensters voedt is met de meetset ' +
          `meebewogen.\n--- ${SETS[0]} ---\n${base}\n--- ${set} ---\n${other}`,
      );
    }
  }
  console.log(
    `\n    De afleiding is op ${SETS.join(' en ')} IDENTIEK — venster, bindende regel en toelating ` +
      'per orde, nagemeten en niet aangenomen. Dat is wat M-3 voorspelt (hij bewoog de FASE van de ' +
      'mid en geen magnitude), en het betekent dat het antwoord van tabel 1 niet van de meetset afhangt.',
  );
}

console.log('\n--- 1. DE AFLEIDING PER FLANK (orde losgelaten) ---');
console.log(
  '    De drie wapeningen: [G]esteld = wat de fixture vandaag doet (orde 4 gesteld),\n' +
    '    [K]aal = orde losgelaten en niets gewapend, [A]pp = orde losgelaten en A5d.3(ii)\n' +
    "    gewapend met het gestelde M-C-getal, zoals `pairDerivationInputs` het doet.\n",
);
for (const r of derivation) {
  const mark = ARMINGS.map((a) => (r.toegelaten[a] ? 'JA ' : 'nee')).join(' ');
  console.log(
    `${r.paar.padEnd(14)} ${(r.uitlijning ?? `orde ${r.orde}`).padEnd(5)} ` +
      `venster ${f(r.venster_hz[0], 1).padStart(8)} – ${f(r.venster_hz[1], 1).padStart(8)} Hz ` +
      `(${(r.vloer_regel ?? '—').padEnd(12)} / ${(r.plafond_regel ?? '—').padEnd(11)})  ` +
      `G/K/A: ${mark}`,
  );
  if (r.grond_hz) console.log(`   ${' '.repeat(14)} GROND (hz): ${r.grond_hz}`);
  if (r.grond_db) {
    console.log(
      `   ${' '.repeat(14)} GROND (dB): op het plafond ${f(r.grond_db.atHz, 1)} Hz levert deze orde ` +
        `${f(r.grond_db.deliveredDb, 2)} dB op f_s tegen ${f(r.grond_db.needDb, 1)} dB gevraagd — ` +
        (r.grond_db.shortDb > 0 ? `${f(r.grond_db.shortDb, 2)} dB TEKORT` : `${f(-r.grond_db.shortDb, 2)} dB over`),
    );
  }
}
for (let i = 0; i < wis.length; i++) {
  const po = fields.armed.orders[i];
  console.log(`\n   ${po.pairLabel}: de gewapende afleiding laat [${po.orders.join(', ')}] toe.`);
  for (const fl of po.flanks)
    for (const d of fl.demands)
      console.log(`     eis ${fl.side} ${d.rule}: orde ${f(d.exactOrder, 3)} → ${d.minOrder} — ${d.source}`);
  for (const wtext of po.why) console.log(`     ${wtext}`);
}
for (const [a, fld] of Object.entries(fields))
  for (const ref of fld.field.refusals) console.log(`   [${a}] WEIGERING: ${ref}`);

/* ================================================================== *
 * 2 — HET VELD
 * ================================================================== */

console.log('\n--- 2. HET VELD (gestelde posities × toegelaten uitlijningen × polariteitsarmen) ---');
console.log(`    gestelde posities: ${M5_STATED_PER_AXIS_HZ.map((ax) => ax.join(' / ')).join('  |  ')} Hz`);
for (const c of b.stated) {
  console.log(
    `   ${c.crossings.map((x) => `${f(x.hz, 1)} ${x.alignment.kind}${x.alignment.order}`).join(' · ')}` +
      `  arm ${(c.polarity?.arm ?? 'vrij').padEnd(8)} ` +
      `omgepoold [${(c.polarity?.invertedWays ?? []).join('+') || '—'}]`,
  );
}
/* WAT ELKE GESTELDE POSITIE AAN MARGE HEEFT OP DE GRENS DIE HAAR VENSTERVLOER
 * ZET. De dB-grond hierboven leest op het PLAFOND — de gunstigste plek, wat de
 * eerlijke lezing is van een orde die overal tekortkomt. Een orde die wél wordt
 * toegelaten wordt echter gevraagd op de plek waar hij WERKELIJK komt te staan,
 * en dat is de gestelde positie; op de W-M-as is 253 Hz de laagste van de drie
 * en dus de krapste. */
for (const r of derivation) {
  if (r.leeg || r.uitlijning === null) continue;
  const i = wis.findIndex((w) => `${w.lower}→${w.upper}` === r.paar);
  const wi = wis[i];
  const rule = r.vloer_regel;
  const need =
    rule === 'drive-stated'
      ? (wi.upperStatedDriveLimitDb ?? null)
      : rule === 'drive'
        ? (wi.upperDriveCeilingDb ?? null)
        : null;
  if (need === null || wi.upperFsHz === null) continue;
  const at = M5_STATED_PER_AXIS_HZ[i] ?? [];
  const per = at
    .map((hz) => {
      const g = dbGround(crossoverWindow({ ...wi, order: r.orde }), r.orde, wi.upperFsHz, need, hz);
      return g ? `${f(hz, 1)} Hz: ${f(g.deliveredDb, 2)} dB (${g.shortDb > 0 ? `${f(g.shortDb, 2)} tekort` : `${f(-g.shortDb, 2)} over`})` : null;
    })
    .filter((x): x is string => x !== null);
  if (per.length)
    console.log(
      `   ${r.paar} ${r.uitlijning} op de gestelde posities, tegen ${f(Math.abs(need), 1)} dB (${rule}): ${per.join(' · ')}`,
    );
}

console.log(`\n   ${b.stated.length} rijen, dus ${b.stated.length} ketenruns.`);

/* ================================================================== *
 * 3 — DE RUNS
 * ================================================================== */

interface RunResult {
  key: string;
  label: string;
  set: string;
  lowHz: number;
  highHz: number;
  lowAlign: string;
  highAlign: string;
  arm: string;
  inverted: string[];
  seconds: number;
  delivered: boolean;
  refusal: { kinds: string[]; reason: string } | null;
  /** V31 — wat de GEWEIGERDE tune nog mat; null op een levering. */
  refusedTune: Record<string, number | null> | null;
  tuner: { rippleDb: number | null; phaseDeg: number | null; evaluations: number | null; tuned: number | null };
  parts: VxpPart[] | null;
  gates: { gate: string; subject: string; active: boolean; pass: boolean; value: number | null; limit: number | null }[];
}

const keyOf = (c: GeneratedCandidate): string => c.label;

/* DE SHARD DRAAGT DE MEETSET IN ZIJN NAAM, en dat is geen netheid. De twee sets
 * leveren IDENTIEKE labels (de vensters zijn identiek, dus het veld ook), dus
 * een shardnaam op het label alleen zou de ene set de uitslag van de andere
 * laten lezen — een verwisseling die nergens zou opvallen omdat beide kanten
 * plausibel zijn. Precies de A3h-val. */
const shardPath = (set: string, key: string) =>
  join(SHARDS, `${set}-${Buffer.from(key).toString('hex')}.json`);

function runOne(set: Casus1MeasurementSet, c: GeneratedCandidate): RunResult {
  const t0 = Date.now();
  const payload = casus1PayloadFor(c, benchOf(set).bench);
  const wire = structuredClone({ id: 1, kind: 'v2Chain3One', payload } as never);
  const got: Record<string, never>[] = [];
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') got.push(m.data as Record<string, never>);
  });
  const d = got[0] as unknown as {
    result: {
      parts: VxpPart[];
      net: { after: { rippleDb: number; phaseDeg: number }; evaluations?: number; tuned?: number };
    };
    gates: { gate: string; subject: string; active: boolean; pass: boolean; value: number | null; limit: number | null }[];
    rejection: { kinds: string[]; reason: string; rejectedTune?: Record<string, number | null> | null } | null;
  } | undefined;
  if (!d) throw new Error(`${c.label}: the worker returned no result`);
  return {
    key: keyOf(c),
    label: c.label,
    set,
    lowHz: c.crossings[0].hz,
    highHz: c.crossings[1].hz,
    lowAlign: `${c.crossings[0].alignment.kind}${c.crossings[0].alignment.order}`,
    highAlign: `${c.crossings[1].alignment.kind}${c.crossings[1].alignment.order}`,
    arm: c.polarity?.arm ?? 'vrij',
    inverted: [...(c.polarity?.invertedWays ?? [])],
    seconds: (Date.now() - t0) / 1000,
    delivered: d.rejection === null,
    refusal: d.rejection ? { kinds: [...d.rejection.kinds], reason: d.rejection.reason } : null,
    refusedTune: d.rejection ? ((d.rejection.rejectedTune ?? null) as Record<string, number | null> | null) : null,
    tuner: {
      rippleDb: d.result.net.after.rippleDb ?? null,
      phaseDeg: d.result.net.after.phaseDeg ?? null,
      evaluations: d.result.net.evaluations ?? null,
      tuned: d.result.net.tuned ?? null,
    },
    /* V31 — een verwerping draagt per constructie geen onderdelen, en dat is
     * het antwoord en geen lege lijst. */
    parts: d.rejection ? null : d.result.parts,
    gates: d.gates,
  };
}

if (ONLY) {
  if (SETS.length !== 1) throw new Error('M5_ONLY vraagt precies één M5_SET');
  const set = SETS[0];
  const c = benchOf(set).stated.find((x) => keyOf(x) === ONLY);
  if (!c) throw new Error(`M5_ONLY=${ONLY} matcht geen rij van het veld op ${set}`);
  mkdirSync(SHARDS, { recursive: true });
  const r = runOne(set, c);
  writeFileSync(shardPath(set, r.key), JSON.stringify(r, null, 2));
  console.log(`\n[${set}] ${r.key}: ${r.delivered ? 'geleverd' : 'GEWEIGERD'} in ${f(r.seconds, 0)} s`);
} else if (RUN) {
  const jobs = SETS.flatMap((set) => benchOf(set).stated.map((c) => ({ set, c })));
  const JOBS = Math.max(1, Number(process.env.M5_JOBS ?? Math.min(jobs.length, cpus().length)));
  mkdirSync(SHARDS, { recursive: true });
  console.log(`\n--- 3. DE RUNS — ${jobs.length} ketenruns over ${SETS.length} meetset(s), ${JOBS} tegelijk ---`);
  const results: RunResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: JOBS }, async () => {
      for (;;) {
        const i = next++;
        if (i >= jobs.length) return;
        const { set, c } = jobs[i];
        const p = shardPath(set, keyOf(c));
        if (!existsSync(p) || process.env.M5_REDO === '1') {
          await new Promise<void>((res, rej) => {
            const ch = spawn('npx', ['vite-node', SELF], {
              env: { ...process.env, M5_ONLY: keyOf(c), M5_RUN: '1', M5_SET: set, M5_SETS: set },
              stdio: 'inherit',
            });
            ch.on('exit', (code) => (code === 0 ? res() : rej(new Error(`[${set}] ${keyOf(c)} exited ${code}`))));
          });
        }
        results.push(JSON.parse(readFileSync(p, 'utf8')) as RunResult);
      }
    }),
  );
  results.sort(
    (x, y) =>
      x.set.localeCompare(y.set) ||
      x.lowHz - y.lowHz ||
      x.lowAlign.localeCompare(y.lowAlign) ||
      x.key.localeCompare(y.key),
  );

  /* ---------------------------------------------------------------- *
   * 4 — DE VERGELIJKING, beide helften door ÉÉN bank PER MEETSET
   * ---------------------------------------------------------------- */
  const golden = loadGolden();
  const catalog = loadCoilCatalog(casus1CoilCatalogPath(golden));
  const familyOfCoil = (id: string, parts: VxpPart[]): string | null => {
    const inv = coilDcrInventory(parts, CASUS1_COIL_DCR.model);
    const way = inv.coils.find((x) => x.id === id)?.ways[0];
    return way ? (CASUS1_COIL_FAMILY_BY_DRIVER[way] ?? null) : null;
  };

  interface Vector {
    crossingsHz: number[];
    rmsFullDb: number | null;
    windowFullDb: number | null;
    rmsJudgedDb: number | null;
    windowJudgedDb: number | null;
    judgedBandHz: [number, number] | null;
    mk: { paar: string; graden: number | null }[];
    resonantDb: number | null;
    liftDb: number | null;
    minZOhm: number | null;
    mc: { weg: string; db: number; grens: number | null; geslaagd: boolean }[];
    dissipatiePct: number | null;
    onderdelen: number;
    bomEur: number | null;
    bomOndergrens: boolean | null;
  }

  function vectorOf(bank: ReturnType<typeof corpusBank>, rep: EngineV2Report, parts: VxpPart[]): Vector {
    void bank;
    const full =
      rep.analysisGrid && rep.system.sumDb
        ? judgeResponse(rep.analysisGrid, rep.system.sumDb, CASUS1_TARGET_CURVE, CASUS1_V2_BAND_HZ)
        : null;
    const bom = catalog.length ? bomOf(catalog, parts, (id) => familyOfCoil(id, parts)) : null;
    return {
      crossingsHz: rep.crossings.map((c) => c.fHz),
      rmsFullDb: full?.rmsDeviationDb ?? null,
      windowFullDb: full?.windowPlusMinusDb ?? null,
      rmsJudgedDb: rep.system.response?.rmsDeviationDb ?? null,
      windowJudgedDb: rep.system.response?.windowPlusMinusDb ?? null,
      judgedBandHz: rep.system.response?.bandHz ?? null,
      mk: rep.system.phaseTracking.map((p) => ({ paar: `${p.lower}→${p.upper}`, graden: p.meanAbsDeg })),
      resonantDb: rep.metrics.lfBump[0]?.result.resonantDb ?? null,
      liftDb: rep.metrics.lfBump[0]?.result.liftDb ?? null,
      minZOhm: rep.gates.verdicts.find((v) => v.gate === 'M-B/|Z|')?.value ?? null,
      mc: rep.gates.verdicts
        .filter((v) => v.gate === 'M-C' && v.value !== null)
        .map((v) => ({ weg: v.subject, db: v.value as number, grens: v.limit, geslaagd: v.pass })),
      dissipatiePct: rep.metrics.dissipation ? rep.metrics.dissipation.totalFraction * 100 : null,
      onderdelen: parts.filter(
        (p) =>
          p.partId !== undefined &&
          !p.open &&
          !p.shorted &&
          (p.type === 'Inductor' || p.type === 'Capacitor' || p.type === 'Resistor'),
      ).length,
      bomEur: bom ? bom.eur : null,
      /* Een onderdeel zonder realisatie binnen ±5 % maakt de BOM een
       * ONDERGRENS, en dat reist mee in plaats van als een prijs te lezen. */
      bomOndergrens: bom ? bom.unrealised.length > 0 : null,
    };
  }

  /* DE TEGENHANGER, gepaard op KRUISPUNT en niet op volgnummer — de M-4-regel:
   * een volgnummer is een shortlistplaats en verspringt bij elke regeneratie. */
  const herkomst = JSON.parse(
    readFileSync(join(HERE, '..', 'test-fixtures', 'casus1_v2_herkomst.json'), 'utf8'),
  ) as { bestanden: { name: string; label: string }[] };
  const counterpartOf = (lowHz: number): string | null => {
    const hit = herkomst.bestanden.filter((x) => {
      const m = x.label.match(/woofer→mid ([\d.]+) /);
      return m !== null && Math.abs(Number(m[1]) - lowHz) < 0.05;
    });
    return hit.length === 1 ? hit[0].name.replace(/-/g, '_') : null;
  };
  const partsOfKey = (key: string): VxpPart[] =>
    (
      JSON.parse(
        readFileSync(join(HERE, '..', 'test-fixtures', 'casus1', `${key.replace(/_/g, '-')}.adsfilter.json`), 'utf8'),
      ) as { parts: VxpPart[] }
    ).parts;

  const perSet: Record<string, { tegenhangers: Record<string, Vector>; rijen: unknown[] }> = {};

  console.log('\n--- 4. DE VERGELIJKING ---');
  console.log(`    budget opslingering (M-D): ${f(CASUS1_LF_RESONANT_BUDGET_DB, 2)} dB`);

  for (const set of SETS) {
    const bank = corpusBank(golden, set);
    const refRows: Record<string, Vector> = {};
    for (const lowHz of M5_STATED_PER_AXIS_HZ[0]) {
      const key = counterpartOf(lowHz);
      if (!key) continue;
      refRows[key] = vectorOf(bank, bank.report(key), partsOfKey(key));
    }
    const rows = results
      .filter((r) => r.set === set)
      .map((r) => ({
        ...r,
        tegenhanger: counterpartOf(r.lowHz),
        vector: r.parts
          ? vectorOf(
              bank,
              buildReport({
                manifest: bank.manifest,
                files: bank.files,
                filter: casus1FilterFromParts(r.label, r.parts, bank.manifest, bank.files),
                geometry: bank.geometry,
                settings: bank.settings,
              }),
              r.parts,
            )
          : null,
      }));
    perSet[set] = { tegenhangers: refRows, rijen: rows };

    console.log(`\n================ MEETSET ${set} ================`);
    for (const lowHz of M5_STATED_PER_AXIS_HZ[0]) {
      const key = counterpartOf(lowHz);
      const ref = key ? refRows[key] : null;
      console.log(`\n  ### woofer→mid ${lowHz} Hz`);
      if (ref)
        console.log(
          `  ${'TEGENHANGER'.padEnd(11)} ${(key ?? '').padEnd(12)} LR4/LR4 textbook   ` +
            `rms ${f(ref.rmsJudgedDb, 3)}/${f(ref.rmsFullDb, 3)}  ±${f(ref.windowJudgedDb, 2)}  ` +
            `M-K ${ref.mk.map((x) => f(x.graden, 1)).join('/')}  opsl ${f(ref.resonantDb, 2)}  ` +
            `|Z| ${f(ref.minZOhm, 3)}  M-C ${ref.mc.map((x) => `${x.weg} ${f(x.db, 1)}`).join(' ')}  ` +
            `diss ${f(ref.dissipatiePct, 0)}%  n ${ref.onderdelen}  BOM ${f(ref.bomEur, 2)}`,
        );
      for (const r of rows.filter((x) => Math.abs(x.lowHz - lowHz) < 0.05)) {
        const mark = r.inverted.length ? r.inverted.map((w) => `${w} ⌀`).join('+') : '—';
        const head = `  ${r.lowAlign}/${r.highAlign} ${r.arm.padEnd(8)} [${mark.padEnd(17)}]`;
        if (!r.vector) {
          const t = r.refusedTune ?? {};
          console.log(
            `${head} GEWEIGERD (${r.refusal?.kinds.join('+')})  geweigerde tune: ` +
              `|Z| ${f(t.minZOhm as number, 3)}  rms ${f(t.rmsDeviationDb as number, 3)}  ` +
              `M-C ${f(t.driveOnFsDb as number, 2)}  rimpel ${f(t.rippleDb as number, 2)}  ${f(r.seconds, 0)} s`,
          );
          console.log(`      grond: ${r.refusal?.reason}`);
          continue;
        }
        const v = r.vector;
        console.log(
          `${head} geleverd   rms ${f(v.rmsJudgedDb, 3)}/${f(v.rmsFullDb, 3)}  ±${f(v.windowJudgedDb, 2)}  ` +
            `M-K ${v.mk.map((x) => f(x.graden, 1)).join('/')}  opsl ${f(v.resonantDb, 2)}  ` +
            `|Z| ${f(v.minZOhm, 3)}  M-C ${v.mc.map((x) => `${x.weg} ${f(x.db, 1)}`).join(' ')}  ` +
            `diss ${f(v.dissipatiePct, 0)}%  n ${v.onderdelen}  BOM ${f(v.bomEur, 2)}  ` +
            `xo ${v.crossingsHz.map((x) => f(x, 0)).join('/')}  ${f(r.seconds, 0)} s`,
        );
      }
    }
    const lr2 = rows.filter((r) => r.lowAlign === 'LR2');
    console.log(
      `\n  [${set}] ${rows.filter((r) => r.vector).length} van ${rows.length} rijen geleverd; ` +
        `LR2 op woofer→mid: ${lr2.filter((r) => r.vector).length} van ${lr2.length}.`,
    );
  }

  writeFileSync(
    OUT,
    `${JSON.stringify(
      {
        _wat:
          'M-5 — de LR2-vraag op de huidige meetbasis. MEETSESSIE: geen corpus geregenereerd, ' +
          'geen eis verplaatst, geen bestaande netlist aangeraakt. Zie scripts/measure-m5-lr2.ts.',
        _gemeten_op: new Date().toISOString().slice(0, 10),
        meetsets: SETS,
        gestelde_posities_hz: M5_STATED_PER_AXIS_HZ,
        beschikbare_orden: AVAILABLE,
        afleiding_is_meetsetonafhankelijk: SETS.length > 1,
        afleiding: derivation,
        veld: b.stated.map((c) => ({
          label: c.label,
          kruispunten: c.crossings.map((x) => ({ hz: x.hz, uitlijning: `${x.alignment.kind}${x.alignment.order}` })),
          arm: c.polarity?.arm ?? null,
          omgepoold: [...(c.polarity?.invertedWays ?? [])],
        })),
        per_meetset: perSet,
      },
      null,
      1,
    )}\n`,
    'utf8',
  );
  console.log(`\nwritten: ${OUT}`);
} else {
  console.log('\n(M5_RUN=1 om de rijen ook te DRAAIEN — één ketenrun per rij per meetset.)');
}
