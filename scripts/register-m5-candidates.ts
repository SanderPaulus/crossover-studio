/**
 * M-5 — DE GELEVERDE LR2- EN POLARITEITSARMEN BEVRIEZEN, NAAST HET LEVENDE CORPUS.
 *
 * `npx vite-node scripts/register-m5-candidates.ts` — seconden, GEEN ketenrun:
 * het geleverde netwerk staat in de shard die `measure-m5-lr2.ts` schreef, en
 * A5e.4 belooft wel dat een herhaling het byte-identiek teruggeeft maar dat is
 * geen reden om er uren voor uit te trekken.
 *
 * WAT HIJ DOET, en de vorm is die van `register-m4-candidates.ts` en
 * `register-a5e3-arm.ts`: hij KOPIEERT, hij verplaatst niet, en hij overschrijft
 * nooit. Het levende corpus van M-2b staat er ongewijzigd naast; deze komen
 * ERBIJ.
 *
 *   1. `M5-KAND-<n>.adsfilter.json` per GELEVERDE rij, genummerd in een
 *      deterministische volgorde (kruispunt, dan uitlijning, dan arm) zodat
 *      twee runs dezelfde nummers geven.
 *   2. de manifestregels (`manifest_en_geometrie.netlists`) plus het corpusblok
 *      `manifest_en_geometrie.m5_corpus`, zodat élke guard die "élke bevroren
 *      netlist" zegt ze meeneemt. Dat is de hele reden om ze te registreren in
 *      plaats van ze los op schijf te laten staan: een netlist die het manifest
 *      niet noemt is een WEES.
 *   3. `casus1_m5_herkomst.json` — waar zij vandaan komen, in de vorm van
 *      `casus1_v2_herkomst.json`: documentatie, geen acceptatiewaarde.
 *
 * WAT HIJ NIET DOET: de klasse-B-referenties. Die schrijft
 * `record-casus1-v2-references.ts`, dat de M5-familie sinds deze sessie kent —
 * dezelfde arbeidsdeling die A5e.3-veld en M-4 kozen, en om dezelfde reden: één
 * bouwer van klasse-B-blokken, niet twee.
 *
 * WELKE MEETSET BEVROREN WORDT, en het is er ÉÉN. M-5 draait beide sets
 * (`m3` en `koan677`), maar wat in het casusboek als BEWIJSMATERIAAL landt is
 * de run op de HUIDIGE meetbasis — het M-4-precedent, en de reden dat de
 * klasse-B-referenties van dit boek sinds M-3 op de standaard gemeten worden.
 * De koan677-helft blijft in `casus1_m5_lr2.json` staan als tweede kolom van de
 * tabel; zij is een meting en geen ontwerp, en twee netlists per rij bevriezen
 * zou de vraag "welke is de M5-netlist" opnieuw openen.
 *
 * DE VOLGORDE IS BINDEND (de C-2-regel), en zij is die van M-4:
 *
 *     measure-m5-lr2  →  register-m5-candidates  →
 *     record-casus1-v2-references  →  record-casus1-m3-references
 *
 * De laatste stap is GEEN keuze: de v2-recorder herschrijft élk klasse-B-blok
 * van het levende corpus vanaf nul en `record-casus1-m3-references.ts` zet de
 * M-3-bruggen er idempotent weer in.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CASUS1_DIR } from '../src/lib/engine2/casus1.fixture.ts';
import { CASUS1_M5_STATED_ON, CASUS1_M5_STATED_PER_AXIS_HZ } from '../src/lib/engine2/casus1V2.fixture.ts';
import { deserializeFilter, serializeFilter } from '../src/lib/filterFile.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHARDS = join(HERE, '..', 'test-fixtures', '.casus1-m5-shards');
const GOLDEN = join(HERE, '..', 'test-fixtures', 'golden_refs_casus1.json');
const HERKOMST = join(HERE, '..', 'test-fixtures', 'casus1_m5_herkomst.json');
const TABLE = join(HERE, '..', 'test-fixtures', 'casus1_m5_lr2.json');

/** De meetset waarvan de leveringen bevroren worden — zie de kop. */
const FREEZE_SET = process.env.M5_FREEZE_SET ?? 'm3';

interface Shard {
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
  refusedTune: Record<string, number | null> | null;
  tuner: { rippleDb: number | null; phaseDeg: number | null; evaluations: number | null; tuned: number | null };
  parts: VxpPart[] | null;
  gates: { gate: string; subject: string; active: boolean; pass: boolean; value: number | null; limit: number | null }[];
}

/**
 * DE VOLGORDE WAARIN GENUMMERD WORDT, en zij is een DAAD en geen gevolg.
 *
 * Kruispunt, dan uitlijning, dan de omgepoolde wegen alfabetisch: drie sleutels
 * die alle drie een eigenschap van het ONTWERP zijn en geen van drie een
 * eigenschap van de run (een volgorde op looptijd of op shardnaam zou per
 * machine verspringen, en een nummer dat verspringt is geen naam).
 */
const orderKey = (s: Shard): string =>
  `${s.lowHz.toFixed(3).padStart(12, '0')}|${s.lowAlign}|${s.highAlign}|${[...s.inverted].sort().join('+')}`;

function main(): void {
  if (!existsSync(SHARDS)) throw new Error(`geen shards in ${SHARDS} — draai measure-m5-lr2.ts eerst`);
  const shards = readdirSync(SHARDS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(SHARDS, f), 'utf-8')) as Shard)
    .filter((s) => s.set === FREEZE_SET);
  if (shards.length === 0) throw new Error(`geen shards voor meetset ${FREEZE_SET}`);

  const golden = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as Record<string, unknown>;
  const man = golden.manifest_en_geometrie as {
    netlists: Record<string, string>;
    m5_corpus?: unknown;
  };

  const delivered = shards.filter((s) => s.delivered && s.parts).sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
  const refused = shards.filter((s) => !s.delivered).sort((a, b) => orderKey(a).localeCompare(orderKey(b)));

  const written: { naam: string; key: string; label: string; lowHz: number; uitlijning: string; arm: string; omgepoold: string[] }[] = [];
  const outcomes: Record<string, unknown> = {};

  delivered.forEach((s, i) => {
    const naam = `M5-KAND-${i + 1}`;
    const key = `M5_KAND_${i + 1}`;
    const file = `${naam}.adsfilter.json`;
    const path = join(CASUS1_DIR, file);
    /* OVERSCHRIJFT NOOIT, en een afwijkend bestaand bestand is een FOUT en geen
     * aanleiding om te overschrijven (`register-m4-candidates.ts`): een bevroren
     * netlist is bewijsmateriaal. Vergeleken op de ONDERDELEN en niet op de
     * bytes, want `serializeFilter` stempelt een `savedAt` dat per run verschilt. */
    if (existsSync(path)) {
      const have = deserializeFilter(readFileSync(path, 'utf-8')).parts;
      if (JSON.stringify(have) !== JSON.stringify(s.parts)) {
        throw new Error(
          `${file} bestaat al en zijn onderdelen VERSCHILLEN van de shard. Een bevroren netlist is ` +
            'bewijsmateriaal; verwijder hem met de hand als dat werkelijk de bedoeling is.',
        );
      }
      console.log(`${file}: staat al op schijf en is identiek — met rust gelaten`);
    } else {
      writeFileSync(path, serializeFilter({ name: naam, parts: [...s.parts!] }), 'utf-8');
      console.log(`wrote ${file}  ← ${s.label}`);
    }
    man.netlists[key] = file;
    written.push({
      naam,
      key,
      label: s.label,
      lowHz: s.lowHz,
      uitlijning: `${s.lowAlign}/${s.highAlign}`,
      arm: s.arm,
      omgepoold: [...s.inverted],
    });
    outcomes[key] = {
      bevroren: true,
      label: s.label,
      kruispunt_hz: [s.lowHz, s.highHz],
      uitlijning: `${s.lowAlign}/${s.highAlign}`,
      arm: s.arm,
      omgepoolde_wegen: [...s.inverted],
      looptijd_s: s.seconds,
      onderdelen: s.parts!.length,
      tuner_rimpel_dB: s.tuner.rippleDb,
      tuner_fase_graden: s.tuner.phaseDeg,
      evaluaties: s.tuner.evaluations,
      poorten: s.gates.map((g) => ({
        poort: g.gate,
        onderwerp: g.subject,
        gewapend: g.active,
        geslaagd: g.pass,
        waarde: g.value,
        grens: g.limit,
      })),
    };
  });

  /* DE WEIGERINGEN KRIJGEN GEEN BESTAND EN WEL EEN REGEL. V31 wist de
   * onderdelen voordat het resultaat de worker verlaat, dus er IS geen netwerk
   * om te bevriezen — en de grond waarop een arm sneuvelt is precies wat de
   * tabel moet dragen, dus hij staat in de herkomst met wat de geweigerde tune
   * nog mat. */
  const refusedRows = refused.map((s) => ({
    label: s.label,
    kruispunt_hz: [s.lowHz, s.highHz],
    uitlijning: `${s.lowAlign}/${s.highAlign}`,
    arm: s.arm,
    omgepoolde_wegen: [...s.inverted],
    looptijd_s: s.seconds,
    regels: s.refusal?.kinds ?? [],
    reden: s.refusal?.reason ?? null,
    geweigerde_tune: s.refusedTune,
  }));

  man.m5_corpus = {
    _:
      'M-5 — DE LR2- EN POLARITEITSARMEN DIE GELEVERD HEBBEN, bevroren naast het levende corpus van ' +
      'M-2b (dat is NIET aangeraakt). Elke netlist hier is een GESTELDE positie van dat corpus ' +
      '(U-5) met de orde LOSGELATEN en met zijn polariteitsarm GESTELD (H-4), gedraaid op de ' +
      `meetset ${FREEZE_SET}. Dit is een ONTWERP-corpus en geen meetobject: elke netlist hier is ` +
      'door dezelfde gewapende poorten gekomen als het levende corpus. Waar zij vandaan komen staat ' +
      'in casus1_m5_herkomst.json, de tabel in casus1_m5_lr2.json.',
    meetset: FREEZE_SET,
    gesteld_op: CASUS1_M5_STATED_ON,
    gestelde_posities_hz: CASUS1_M5_STATED_PER_AXIS_HZ,
    bestanden: written.map((w) => ({
      naam: w.key,
      bestand: man.netlists[w.key],
      label: w.label,
      uitlijning: w.uitlijning,
      arm: w.arm,
      omgepoolde_wegen: w.omgepoold,
    })),
    geweigerd: refusedRows.map((r) => ({ label: r.label, regels: r.regels })),
  };

  writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`, 'utf-8');
  console.log(`\nmanifest_en_geometrie.netlists noemt nu ${Object.keys(man.netlists).length} netlists`);

  const table = existsSync(TABLE)
    ? (JSON.parse(readFileSync(TABLE, 'utf-8')) as { _gemeten_op?: string; meetsets?: string[] })
    : {};

  writeFileSync(
    HERKOMST,
    `${JSON.stringify(
      {
        _:
          'M-5 — WAAR DE BEVROREN LR2- EN POLARITEITSARMEN VANDAAN KOMEN. DOCUMENTATIE, geen ' +
          'acceptatiewaarde: wat acceptatie is, zijn de bevroren bestanden en hun klasse-B-referenties ' +
          'in golden_refs_casus1.json. Zie scripts/register-m5-candidates.ts.',
        gegenereerd_op_commit: execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim(),
        gemeten_op: table._gemeten_op ?? new Date().toISOString().slice(0, 10),
        meetsets_gedraaid: table.meetsets ?? [FREEZE_SET],
        meetset_bevroren: FREEZE_SET,
        meetset_waarom:
          'de huidige meetbasis, het M-4-precedent: M-5 wekt niets opnieuw op maar draait NIEUWE ' +
          'kandidaten, en een nieuwe kandidaat hoort op de huidige meetbasis te lopen. De ' +
          'koan677-helft is WEL gedraaid en staat in casus1_m5_lr2.json — zij is de set waarop het ' +
          'levende corpus GEZOCHT is, dus de enige waarop beide helften van de paring op één ' +
          'zoekbasis staan, en zij is daarom een kolom van de tabel en geen tweede bevriezing.',
        gestelde_posities_hz: CASUS1_M5_STATED_PER_AXIS_HZ,
        gesteld_op: CASUS1_M5_STATED_ON,
        gesteld_waarom:
          'de drie woofer→mid-posities zijn die van KAND-V2-1/2/3 en de mid→tweeter-positie draagt ' +
          'élke kandidaat van dat veld, dus elke M-5-rij heeft een tegenhanger die alleen in de ' +
          'UITLIJNING en de POLARITEIT van haar verschilt. De orde is LOSGELATEN: niet gesteld, maar ' +
          'afgeleid door A5d.3 met het gestelde M-C-getal gewapend zoals de app hem wapent.',
        bestanden: written,
        kandidaat_uitkomst: outcomes,
        geweigerd: refusedRows,
      },
      null,
      1,
    )}\n`,
    'utf-8',
  );
  console.log(`wrote ${HERKOMST}`);
  console.log(`\n${written.length} geleverd en bevroren, ${refusedRows.length} geweigerd (geen bestand — V31).`);
  console.log('\nHIERNA, en de volgorde is bindend:');
  console.log('  npx vite-node scripts/record-casus1-v2-references.ts');
  console.log('  npx vite-node scripts/record-casus1-m3-references.ts   ← zet de M-3-bruggen terug');
}

main();
