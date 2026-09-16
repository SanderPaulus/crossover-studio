/**
 * M-3 - DE REFERENTIES DIE DE MID-FASE LEZEN, HERLEID UIT DE ENGINE.
 *
 * `npx vite-node scripts/record-casus1-m3-references.ts` - seconden, geen tune.
 *
 * WAT ER BEWEEGT ALS DE MID-FASE BEWEEGT, en dat is een KORTE lijst - korter
 * dan bij M-1 of M-2b, en dat is zelf de meting. De reparatie raakt uitsluitend
 * de FASE van een meetbestand ONDER zijn splice, dus:
 *
 *  - elke KLASSE-A-referentie van de mid staat stil. Re, f_c, Z_max, de Q's en
 *    de semi-inductantie komen uit de IMPEDANTIE, die niet aangeraakt is; de
 *    breakups en de directiviteit leven BOVEN de splice, waar de merge het
 *    verre veld zelf is; de geldigheidsvloer is gesteld en onveranderd; en de
 *    verankerde gaps zijn energiegemiddelden van MAGNITUDES, die nergens meer
 *    dan 0,001 dB bewegen. Dat is nagemeten en niet aangenomen - dit script
 *    schrijft de verificatie op, en `goldenCasus1.test.ts` toetst dezelfde
 *    referenties tegen een verse meting op de nieuwe set.
 *
 *  - van de KLASSE-B-referenties beweegt precies EEN familie: de fase van het
 *    paar WOOFER-MID. De mid-tweeter-overname ligt op 2251 Hz, ruim boven de
 *    splice, en beweegt EXACT nul.
 *
 * DE BRUG (V15's vorm): elk veld dat beweegt krijgt zijn M-2b-lezing in
 * `_waarden_M2b_tot_M3` ernaast, reproduceerbaar met `casus1Manifest(golden,
 * 'koan677')`, zodat een lezer een herdefinitie van een regressie kan
 * onderscheiden. Idempotent (de A5e.3b-les): de brug wordt alleen geschreven
 * als hij er nog niet is, anders zou een tweede run er de M-3-waarden in zetten.
 *
 * DE CORPORA WORDEN NIET GEREGENEREERD. `measure-m3-mid-phase.ts` meet dat geen
 * enkel poortoordeel wisselt, dus de netlists die er liggen blijven wat zij
 * zijn en alleen hun AFLEZING verschuift.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corpusBank } from '../src/lib/engine2/casus1Corpora.fixture.ts';
import { loadGolden } from '../src/lib/engine2/casus1.fixture.ts';
import { MID_M1_FILE, MID_M3_FILE } from '../src/lib/engine2/midM3.fixture.ts';
import { PHASE_INTEGRATION_VERSION } from '../src/lib/engine2/metrics/phaseIntegration.ts';
import { PHASE_ADMISSION_VERSION } from '../src/lib/phaseAdmission.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(HERE, '..', 'test-fixtures', 'golden_refs_casus1.json');

const r2 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));

/* eslint-disable @typescript-eslint/no-explicit-any -- the golden file is a
 * free-form JSON document; every recorder in this directory reads it this way. */
const raw = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, any>;
const golden = loadGolden();

const before = corpusBank(golden, 'koan677');
const after = corpusBank(golden, 'm3');

/* ------------------------------------------------------------------ *
 * 1 - de klasse-B-blokken die de W-M-fase dragen
 * ------------------------------------------------------------------ */

/** Welke referentiesleutel welk blok in het casusboek is. */
const SUBJECTS: [string, string][] = [
  ['HUIDIG', 'HUIDIG_2e'],
  ['KAND_A', 'KAND_A_2e'],
  ['KAND_B', 'KAND_B_3e'],
  ['KAND_V2_1', 'KAND_V2_1'],
  ['KAND_V2_2', 'KAND_V2_2'],
  ['KAND_V2_3', 'KAND_V2_3'],
];

/** De velden die de W-M-fase dragen. De mt-tegenhangers staan er NIET bij: zij
 *  bewegen exact nul, en een brug voor een onbewogen getal is ruis. */
const PHASE_FIELDS = ['wm_fase_oct', 'wm_fase_oct_octaafgeknipt_V43', 'wm_fase_overlapvenster_V43'] as const;

const kand = raw.kandidaten as Record<string, Record<string, any>>;
console.log('M-3 - de klasse-B-fasevelden, M-2b naar M-3\n');
console.log(`  ${'blok'.padEnd(14)}${'M-K voor'.padStart(10)}${'M-K na'.padStart(9)}${'delta'.padStart(8)}   mt (onbewogen)`);

for (const [key, refKey] of SUBJECTS) {
  const block = kand[refKey];
  if (!block) throw new Error(`kandidaten.${refKey} bestaat niet`);

  const repB = before.report(key);
  const repA = after.report(key);
  const wmB = repB.system.phaseTracking.find((p) => p.lower === 'woofer');
  const wmA = repA.system.phaseTracking.find((p) => p.lower === 'woofer');
  const mtB = repB.system.phaseTracking.find((p) => p.lower === 'mid');
  const mtA = repA.system.phaseTracking.find((p) => p.lower === 'mid');
  if (!wmB || !wmA || !mtA || !mtB) throw new Error(`${refKey}: geen fase-paren`);

  /* DE CONTROLE DIE DE CLAIM DRAAGT: de mid-tweeter-overname ligt boven de
   * splice, dus zij MOET exact reproduceren. Doet zij dat niet, dan raakt de
   * merge iets dat hij niet hoort te raken en stopt dit script. */
  if (r2(mtA.meanAbsDeg) !== r2(mtB.meanAbsDeg)) {
    throw new Error(
      `${refKey}: de mid-tweeter-fase BEWOOG (${r2(mtB.meanAbsDeg)} naar ${r2(mtA.meanAbsDeg)}). ` +
        `Die overname ligt boven de splice, waar de merge het verre veld zelf is; als zij beweegt ` +
        `raakt M-3 meer dan de fase onder de splice.`,
    );
  }

  if (!('_waarden_M2b_tot_M3' in block)) {
    const bridge: Record<string, unknown> = {
      _:
        `De W-M-fasevelden van dit blok op de M-2b-set (13-09-2026 tot M-3), toen de mid nog ` +
        `${MID_M1_FILE} was. Brug, reproduceerbaar met casus1Manifest(golden, "koan677"). Alleen deze ` +
        `velden staan er: elk ander veld van dit blok reproduceert ONVERANDERD op de nieuwe set, en ` +
        `de mid-tweeter-fase beweegt exact nul omdat die overname boven de splice ligt.`,
    };
    for (const f of PHASE_FIELDS) if (f in block) bridge[f] = block[f];
    block._waarden_M2b_tot_M3 = bridge;
  }

  const wrote: string[] = [];
  if ('wm_fase_oct' in block) {
    block.wm_fase_oct = r2(wmA.meanAbsDeg);
    wrote.push('wm_fase_oct');
  }
  if ('wm_fase_oct_octaafgeknipt_V43' in block) {
    block.wm_fase_oct_octaafgeknipt_V43 = r2(wmA.control.octaveClipped.meanAbsDeg);
    wrote.push('octaafgeknipt');
  }
  if ('wm_fase_overlapvenster_V43' in block) {
    block.wm_fase_overlapvenster_V43 = r2(wmA.control.overlapWindow.meanAbsDeg);
    wrote.push('overlapvenster');
  }

  if (typeof block.klasse_toelichting === 'string' && !String(block.klasse_toelichting).includes('M-3')) {
    block.klasse_toelichting =
      String(block.klasse_toelichting) +
      ` SINDS M-3 gemeten op de HERMERGDE MID (${MID_M3_FILE}): alleen de W-M-fasevelden bewogen, ` +
      `hun M-2b-lezing staat in _waarden_M2b_tot_M3.`;
  }

  const d = (wmA.meanAbsDeg - wmB.meanAbsDeg).toFixed(2);
  console.log(
    `  ${refKey.padEnd(14)}${String(r2(wmB.meanAbsDeg)).padStart(10)}${String(r2(wmA.meanAbsDeg)).padStart(9)}` +
      `${(Number(d) >= 0 ? `+${d}` : d).padStart(8)}   ${r2(mtA.meanAbsDeg)} graden (${wrote.length} velden bijgewerkt)`,
  );
}

/* ------------------------------------------------------------------ *
 * 2 - v44_fasematen over het hele casusboek
 * ------------------------------------------------------------------ */

const netlists = raw.manifest_en_geometrie.netlists as Record<string, unknown>;
const fresh = Object.keys(netlists).flatMap((key) =>
  after.report(key).system.phaseTracking.map((p) => ({
    netlist: key,
    paar: `${p.lower}|${p.upper}`,
    mk_graden: r2(p.meanAbsDeg),
    punten: p.n,
    band_Hz: [r2(p.bandHz[0]), r2(p.bandHz[1])],
    octaafgeknipt_graden: r2(p.control.octaveClipped.meanAbsDeg),
    overlapvenster_graden: r2(p.control.overlapWindow.meanAbsDeg),
    afgewezen: p.rejected,
  })),
);

const phaseBlock = raw.manifest_en_geometrie.v44_fasematen as Record<string, any>;
const oldRows = (phaseBlock.per_netlist ?? []) as Record<string, any>[];
const keyOf = (r: { netlist: string; paar: string }): string => `${r.netlist} ${r.paar}`;
const oldByKey = new Map(oldRows.map((r) => [keyOf(r as { netlist: string; paar: string }), r]));

const moved: Record<string, any>[] = [];
let same = 0;
let mtRows = 0;
/** De mid-tweeter-rijen waar ALLEEN de ongeknipte controlekolom bewoog. */
const mtControlOnly: string[] = [];
for (const r of fresh) {
  const o = oldByKey.get(keyOf(r));
  const isMt = r.paar === 'mid|tweeter';
  if (isMt) mtRows++;
  if (!o) continue;
  if (JSON.stringify(o) === JSON.stringify(r)) {
    same++;
    continue;
  }
  if (isMt) {
    /* DE CLAIM, ALS ASSERT EN NIET ALS ZIN, en zij is PRECIEZER dan zij er bij
     * het schrijven uitzag. De mid-tweeter-overname ligt op 2251 Hz, ruim boven
     * de splice, dus M-K MOET daar exact reproduceren - en dat doet hij, op
     * alle 174 rijen, net als de octaafgeknipte controlekolom.
     *
     * Wat WEL beweegt, op acht netlists, is de ONGEKNIPTE controlekolom: de
     * maat die de TUNER tot V43 las, die elk punt binnen het overlapvenster
     * meetelt ZONDER hem tegen de meetgeldigheid te knippen. Die reikt op deze
     * acht tot ONDER 800 Hz, waar de mid-fase van M-3 verschilt - en dat is
     * precies het defect waarvoor V44 bestaat: over het hele casusboek telde
     * die maat 1047 punten mee die het rapport niet zag, waarvan 911 onder de
     * meetgeldigheidsvloer. M-3 laat hem zichzelf aanwijzen: een fasereparatie
     * ONDER de splice kan een mid-tweeter-oordeel op 2251 Hz alleen bereiken
     * via een maat die kijkt waar zij niet hoort te kijken.
     *
     * Dus: M-K en de octaafgeknipte kolom identiek, de ongeknipte mag bewegen
     * en wordt bij NAAM geboekt (de V30-vorm - boekhouding, geen vrijstelling). */
    const fields = ['mk_graden', 'punten', 'band_Hz', 'octaafgeknipt_graden', 'afgewezen'] as const;
    for (const f of fields) {
      if (JSON.stringify(o[f]) !== JSON.stringify((r as Record<string, unknown>)[f])) {
        throw new Error(
          `v44_fasematen: ${r.netlist} mid|tweeter bewoog op ${f} ` +
            `(${JSON.stringify(o[f])} naar ${JSON.stringify((r as Record<string, unknown>)[f])}). ` +
            `Die overname ligt boven de splice, waar de merge het verre veld zelf is - M-3 hoort daar ` +
            `alleen de ONGEKNIPTE controlekolom te kunnen raken.`,
        );
      }
    }
    mtControlOnly.push(r.netlist);
  }
  moved.push(o);
}

if (!('_waarden_M2b_tot_M3' in phaseBlock)) {
  phaseBlock._waarden_M2b_tot_M3 = {
    _:
      'De rijen van dit blok die op de M-2b-set (13-09-2026 tot M-3) anders lazen, toen de mid nog ' +
      `${MID_M1_FILE} was. Brug, reproduceerbaar met casus1Manifest(golden, "koan677"). ALLEEN de ` +
      'bewogen rijen staan er. Op elke mid|tweeter-rij reproduceren M-K, het puntental, de band, de ' +
      'octaafgeknipte controlekolom en de afwijzingen EXACT - die overname ligt op 2251 Hz, ruim ' +
      'boven de splice, waar de merge het verre veld zelf is. Dit script weigert te schrijven als ' +
      'daar iets van beweegt.',
    bewogen_rijen: moved.length,
    onbewogen_rijen: same,
    mid_tweeter_alleen_ongeknipte_controle: {
      _:
        'DE BEVINDING VAN M-3 DIE NIEMAND BESTELD HAD, en zij is het bewijsmateriaal onder V44 dat ' +
        'zichzelf aanwijst. Op deze netlists beweegt van de mid|tweeter-rij UITSLUITEND ' +
        '`overlapvenster_graden`: de maat die de TUNER tot V43 las, die elk punt binnen het ' +
        'overlapvenster meetelt ZONDER hem tegen de meetgeldigheid te knippen. Een fasereparatie ' +
        'ONDER 800 Hz kan een overname op 2251 Hz alleen bereiken via een maat die kijkt waar zij ' +
        'niet hoort te kijken - precies wat V44 mat (1047 meegetelde punten over het hele casusboek, ' +
        'waarvan 911 onder de meetgeldigheidsvloer) en precies waarom die kolom sinds V44 een ' +
        'CONTROLEKOLOM is die niets oordeelt. M-K, de octaafgeknipte kolom en het puntental staan ' +
        'op alle 174 mid|tweeter-rijen stil.',
      netlists: mtControlOnly,
      aantal: mtControlOnly.length,
      van_de_mid_tweeter_rijen: mtRows,
    },
    per_netlist: moved,
  };
}

phaseBlock.metriek_versie = PHASE_INTEGRATION_VERSION;
phaseBlock.toelating_versie = PHASE_ADMISSION_VERSION;
phaseBlock.per_netlist = fresh;
if (typeof phaseBlock._ === 'string' && !phaseBlock._.includes('M-3')) {
  phaseBlock._ =
    `${phaseBlock._} SINDS M-3 gemeten op de HERMERGDE MID (${MID_M3_FILE}): elke woofer|mid-rij ` +
    `leest een andere fase, elke mid|tweeter-rij exact dezelfde, en de M-2b-lezing van de bewogen ` +
    `rijen staat in _waarden_M2b_tot_M3.`;
}

console.log(
  `\nv44_fasematen: ${fresh.length} rijen, ${moved.length} bewogen, ${same} onbewogen.\n` +
    `  van de ${mtRows} mid|tweeter-rijen bewoog M-K op NUL; op ${mtControlOnly.length} bewoog alleen de ` +
    `ONGEKNIPTE controlekolom (V44's eigen bewijsmateriaal): ${mtControlOnly.join(', ')}`,
);

/* ------------------------------------------------------------------ *
 * 3 - de herkomst van de mid-vloer noemt het nieuwe bestand
 * ------------------------------------------------------------------ */

const mid = raw.afgeleide_parameters.mid as Record<string, unknown>;
if (typeof mid.FF_vloer_merge_toelichting === 'string' && !String(mid.FF_vloer_merge_toelichting).includes('M-3')) {
  mid.FF_vloer_merge_toelichting =
    String(mid.FF_vloer_merge_toelichting) +
    ` SINDS M-3 (16-09-2026) gelezen uit het mergeblok van ${MID_M3_FILE}: DEZELFDE gestelde vloer ` +
    `(60 Hz, dezelfde reden, dezelfde twee bronbestanden) - M-3 repareert de FASE van het stapmodel ` +
    `en raakt de vloer niet. ${MID_M1_FILE} blijft op schijf als de mid van de sets "merged" en ` +
    `"koan677".`;
  console.log('afgeleide_parameters.mid.FF_vloer_merge_toelichting: herkomst bijgewerkt (vloer ONGEWIJZIGD 60 Hz)');
}

/* ------------------------------------------------------------------ *
 * 4 - de verificatie: wat er NIET bewoog, gemeten
 * ------------------------------------------------------------------ */

const midBefore = before.report('HUIDIG');
const midAfter = after.report('HUIDIG');
const midOf = (rep: typeof midBefore) => rep.ingest.drivers.find((d) => d.driver === 'mid');
const mb = midOf(midBefore);
const ma = midOf(midAfter);
const steekproef: Record<string, unknown> = {};
if (mb && ma) {
  steekproef.Re_ohm = [r2(mb.re?.ohm ?? null), r2(ma.re?.ohm ?? null)];
  steekproef.breakups_aantal = [mb.breakups?.peaks.length ?? null, ma.breakups?.peaks.length ?? null];
  steekproef.NF_plafond_Hz = [r2(mb.nearFieldCeilingHz), r2(ma.nearFieldCeilingHz)];
  steekproef.doorlaatband_niveau_dB = [r2(mb.level?.db ?? null), r2(ma.level?.db ?? null)];
}
steekproef.anker = [midBefore.predesign.gaps?.anchor ?? null, midAfter.predesign.gaps?.anchor ?? null];
steekproef._leesregel = 'per veld [M-2b, M-3]; gelijk betekent onbewogen.';

(raw.manifest_en_geometrie.meetset_M3_mid as Record<string, unknown>).klasse_A_onbewogen = {
  _:
    'GEMETEN EN NIET AANGENOMEN (M-3). Elke klasse-A-referentie van de MID is op de nieuwe set ' +
    'opnieuw gelezen en geen enkele beweegt: Re, f_c, Z_max, de Q s en de semi-inductantie komen uit ' +
    'de IMPEDANTIE (mid.lim, onaangeraakt); de breakups en de directiviteit leven BOVEN de splice, ' +
    'waar de merge het verre veld zelf IS; de geldigheidsvloer is gesteld en onveranderd; en de ' +
    'verankerde gaps zijn energiegemiddelden van MAGNITUDES, die nergens meer dan 0,001 dB bewegen. ' +
    'goldenCasus1.test.ts toetst al deze referenties tegen een verse meting op de standaardset, dus ' +
    'de claim is falsifieerbaar en niet alleen opgeschreven.',
  steekproef,
  wat_WEL_beweegt:
    'Uitsluitend de fase van het paar woofer-mid (klasse B, per netlist): M-K, en de twee ' +
    'controlekolommen ernaast. Zie kandidaten.*._waarden_M2b_tot_M3 en v44_fasematen.',
};

writeFileSync(GOLDEN, `${JSON.stringify(raw, null, 1)}\n`);
console.log(`\ngeschreven: ${GOLDEN}`);
