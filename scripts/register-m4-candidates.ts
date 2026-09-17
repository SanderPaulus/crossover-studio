/**
 * M-4 — DE TWEE FASE-PRIORITEITSNETLISTS BEVRIEZEN, NAAST HUN TEGENHANGERS.
 *
 * `npx vite-node scripts/register-m4-candidates.ts` — seconden, GEEN ketenrun:
 * het geleverde netwerk staat in de shard die `measure-m4-phase-priority.ts`
 * schreef, en A5e.4 belooft wel dat een herhaling het byte-identiek teruggeeft
 * maar dat is geen reden om er drie kwartier voor uit te trekken.
 *
 * WAT HIJ DOET, en de vorm is die van `register-a5e3-arm.ts`: hij KOPIEERT, hij
 * verplaatst niet, en hij overschrijft nooit. Het levende corpus van M-2b staat
 * er ongewijzigd naast; deze twee komen ERBIJ.
 *
 *   1. `KAND-V2-<n>F.adsfilter.json` per gestelde positie, gepaard op KRUISPUNT
 *      met de netlist die het levende corpus daar al draagt. De `F` is
 *      fase-prioriteit, en de naam zegt daarmee waarin de twee verschillen —
 *      één schuif, geen ander veld, geen andere eis.
 *   2. de manifestregels (`manifest_en_geometrie.netlists`), zodat élke guard
 *      die "élke bevroren netlist" zegt ze meeneemt. Dat is de hele reden om ze
 *      te registreren in plaats van ze los op schijf te laten staan: een
 *      `KAND-V2-*`-bestand dat het manifest niet noemt is een WEES, en
 *      `casus1V2Candidates.test.ts` valt daarop om.
 *   3. `casus1_m4_herkomst.json` — waar zij vandaan komen, in de vorm van
 *      `casus1_v2_herkomst.json`: documentatie, geen acceptatiewaarde.
 *
 * WAT HIJ NIET DOET: de klasse-B-referenties. Die schrijft
 * `record-casus1-v2-references.ts`, dat de familie sinds M-4 kent — dezelfde
 * arbeidsdeling die A5e.3-veld voor de arm koos, en om dezelfde reden: één
 * bouwer van klasse-B-blokken, niet twee.
 *
 * DE VOLGORDE IS BINDEND (de C-2-regel), en deze sessie heeft hem gemeten:
 *
 *     measure-m4-phase-priority  →  register-m4-candidates  →
 *     record-casus1-v2-references  →  record-casus1-m3-references
 *
 * De laatste stap is GEEN keuze. `record-casus1-v2-references.ts` herschrijft
 * élk klasse-B-blok van het levende corpus vanaf nul en gooit daarmee de
 * M-3-bruggen (`_waarden_M2b_tot_M3`) en de M-3-zin in `klasse_toelichting`
 * weg; `record-casus1-m3-references.ts` zet ze er idempotent weer in. Dat is
 * een bestaande valstrik en niet iets dat M-4 introduceert — wie de v2-recorder
 * vandaag alléén draait, verliest die bruggen stil.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CASUS1_DIR } from '../src/lib/engine2/casus1.fixture.ts';
import { deserializeFilter, serializeFilter } from '../src/lib/filterFile.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import { M4_PHASE_PRIORITY, M4_STATED_ON, M4_STATED_PER_AXIS_HZ } from './m4-bench.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHARDS = join(HERE, '..', 'test-fixtures', '.casus1-m4-shards');
const GOLDEN = join(HERE, '..', 'test-fixtures', 'golden_refs_casus1.json');
const HERKOMST = join(HERE, '..', 'test-fixtures', 'casus1_m4_herkomst.json');

/**
 * De PAARING, op kruispunt en niet op volgnummer.
 *
 * `KAND_V2_1` staat op woofer→mid 362,3 Hz en `KAND_V2_2` op 518,8 Hz — gelezen
 * uit het manifest en hier niet overgetypt, want een volgnummer is een
 * shortlistplaats en die verspringt bij elke regeneratie. De F-naam volgt de
 * tegenhanger die op HETZELFDE kruispunt staat; vindt het script er geen, dan
 * stopt het in plaats van een nummer te verzinnen.
 */
function counterpartOf(golden: Record<string, unknown>, lowHz: number): string {
  const man = (golden.manifest_en_geometrie as { v2_herkomst?: unknown; netlists: Record<string, string> });
  const herkomst = JSON.parse(
    readFileSync(join(HERE, '..', 'test-fixtures', 'casus1_v2_herkomst.json'), 'utf-8'),
  ) as { bestanden: { name: string; label: string }[] };
  const hit = herkomst.bestanden.filter((b) => {
    const m = b.label.match(/woofer→mid ([\d.]+) /);
    return m !== null && Math.abs(Number(m[1]) - lowHz) < 0.05;
  });
  if (hit.length !== 1) {
    throw new Error(
      `the live corpus holds ${hit.length} netlists at woofer→mid ${lowHz} Hz; M-4 pairs on the ` +
        'crossing and cannot name a phase-priority variant without exactly one counterpart',
    );
  }
  const key = hit[0].name.replace(/-/g, '_');
  if (!man.netlists[key]) throw new Error(`the manifest does not name ${key}`);
  return key;
}

interface Shard {
  low_hz: number;
  high_hz: number;
  label: string;
  provenance: string;
  phase_priority: number;
  runtime_s: number;
  delivered: boolean;
  refusal: { kinds: string[]; reason: string } | null;
  parts: VxpPart[] | null;
  tuner: { rippleDb: number; phaseDeg: number; tuned: number; evaluations: number };
  gates: { gate: string; subject: string; active: boolean; pass: boolean; value: number | null; limit: number | null }[];
  notes: string[];
}

function main(): void {
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as Record<string, unknown>;
  const netlists = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists;

  const lows = M4_STATED_PER_AXIS_HZ[0];
  const written: { name: string; key: string; counterpart: string; label: string; lowHz: number }[] = [];
  const outcomes: Record<string, unknown> = {};

  for (const lowHz of lows) {
    const shardPath = join(SHARDS, `${lowHz}.json`);
    if (!existsSync(shardPath)) {
      throw new Error(`no shard for ${lowHz} Hz — run measure-m4-phase-priority.ts first`);
    }
    const shard = JSON.parse(readFileSync(shardPath, 'utf-8')) as Shard;
    const counterpart = counterpartOf(golden, lowHz);
    const name = `${counterpart.replace(/_/g, '-')}F`;
    const key = `${counterpart}F`;
    const file = `${name}.adsfilter.json`;
    const path = join(CASUS1_DIR, file);

    if (!shard.delivered || !shard.parts) {
      console.log(
        `${lowHz} Hz: REFUSED (${shard.refusal?.kinds.join(', ')}) — nothing to freeze. ` +
          `${shard.refusal?.reason ?? ''}`,
      );
      outcomes[key] = {
        bevroren: false,
        reden: shard.refusal?.reason ?? 'geen netwerk',
        regels: shard.refusal?.kinds ?? [],
      };
      continue;
    }

    /* OVERSCHRIJFT NOOIT, en een afwijkend bestaand bestand is een FOUT en geen
     * aanleiding om te overschrijven (`register-a5e3-arm.ts`, `freeze-live-
     * corpus.ts`): een bevroren netlist is bewijsmateriaal. Vergeleken op de
     * ONDERDELEN en niet op de bytes, want `serializeFilter` stempelt een
     * `savedAt` dat per run verschilt. */
    if (existsSync(path)) {
      const have = deserializeFilter(readFileSync(path, 'utf-8')).parts;
      if (JSON.stringify(have) !== JSON.stringify(shard.parts)) {
        throw new Error(
          `${file} already exists and its parts DIFFER from the shard. A frozen netlist is ` +
            'evidence; delete it by hand if that is really what you mean.',
        );
      }
      console.log(`${file}: already on disk and identical — left alone`);
    } else {
      writeFileSync(path, serializeFilter({ name, parts: [...shard.parts] }), 'utf-8');
      console.log(`wrote ${file}  ← ${shard.label}`);
    }

    netlists[key] = file;
    written.push({ name, key, counterpart, label: shard.label, lowHz });
    outcomes[key] = {
      bevroren: true,
      tegenhanger: counterpart,
      kruispunt_hz: [shard.low_hz, shard.high_hz],
      looptijd_s: shard.runtime_s,
      onderdelen: shard.parts.length,
      tuner_rimpel_dB: shard.tuner.rippleDb,
      tuner_fase_graden: shard.tuner.phaseDeg,
      evaluaties: shard.tuner.evaluations,
      poorten: shard.gates.map((g) => ({
        poort: g.gate,
        onderwerp: g.subject,
        gewapend: g.active,
        geslaagd: g.pass,
        waarde: g.value,
        grens: g.limit,
      })),
      herkomst: shard.provenance,
    };
  }

  writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`, 'utf-8');
  console.log(`\nmanifest_en_geometrie.netlists now names ${Object.keys(netlists).length} netlists`);

  const fase = JSON.parse(
    readFileSync(join(HERE, '..', 'test-fixtures', 'casus1_m4_fase.json'), 'utf-8'),
  ) as { meetset: string; seed: number; gemeten_op: string };

  writeFileSync(
    HERKOMST,
    `${JSON.stringify(
      {
        _:
          'M-4 — WAAR DE TWEE FASE-PRIORITEITSNETLISTS VANDAAN KOMEN. DOCUMENTATIE, geen ' +
          'acceptatiewaarde: wat acceptatie is, zijn de bevroren bestanden en hun ' +
          'klasse-B-referenties in golden_refs_casus1.json. Zie ' +
          'scripts/register-m4-candidates.ts.',
        gegenereerd_op_commit: execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim(),
        gemeten_op: fase.gemeten_op,
        meetset: fase.meetset,
        meetset_waarom:
          'de STANDAARD van vandaag, en niet de `koan677` waarop het M-2b-corpus is opgewekt. ' +
          'M-4 wekt niets opnieuw op maar draait twee NIEUWE kandidaten, en een nieuwe kandidaat ' +
          'hoort op de huidige meetbasis te lopen. Gevolg, en het staat in de entry: de ' +
          'F-netlists en hun tegenhangers zijn op twee verschillende sets GEZOCHT, dus de ' +
          'vergelijkingstabel leest beide helften op één bank (de standaard) en de aftrekking ' +
          'gaat over de netlists en niet over de zoektochten.',
        seed: fase.seed,
        phase_priority: M4_PHASE_PRIORITY,
        phase_priority_bron: `gesteld door Sander, ${M4_STATED_ON} — fase-prioriteit, respons 25 % / fase 75 %`,
        gestelde_kruispunten_hz: M4_STATED_PER_AXIS_HZ,
        gesteld_op: M4_STATED_ON,
        gesteld_waarom:
          'beide woofer→mid-posities en de ene mid→tweeter-positie komen uit het M-2b-veld ZELF ' +
          '(KAND-V2-1 en KAND-V2-2 staan erop, en 2251,4 Hz draagt élke kandidaat van dat veld). ' +
          'Zij zijn dus niet nieuw; wat nieuw is, is dat zij bij naam gevraagd worden (U-5) in ' +
          'plaats van uit een raster te vallen, zodat de vergelijking over één factor gaat.',
        bestanden: written.map((w) => ({ name: w.name, key: w.key, tegenhanger: w.counterpart, label: w.label })),
        kandidaat_uitkomst: outcomes,
      },
      null,
      1,
    )}\n`,
    'utf-8',
  );
  console.log(`wrote ${HERKOMST}`);
  console.log('\nNEXT, and the order is binding:');
  console.log('  npx vite-node scripts/record-casus1-v2-references.ts');
  console.log('  npx vite-node scripts/record-casus1-m3-references.ts   ← restores the M-3 bridges');
}

main();
