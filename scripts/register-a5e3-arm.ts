/**
 * A5e.3-veld — DE ARM `m1+dcr` ALS GEDATEERD BLOK.
 *
 * `npx vite-node scripts/register-a5e3-arm.ts` — seconden, geen tune.
 *
 * WAAROM DIT SCRIPT BESTAAT NAAST `freeze-live-corpus.ts`. Dat script bevriest
 * het LEVENDE corpus onder een gedateerde naam vóór een regeneratie, en het
 * leest daarvoor `casus1_v2_herkomst.json`. Bij M-1 leverde het veld niets:
 * het levende corpus is LEEG en er valt niets te bevriezen. Wat er wél ligt is
 * het GELEVERDE netwerk van de A5e.3-arm `m1+dcr` (`scripts/measure-m1-
 * diagnose-arms.ts`, `test-fixtures/casus1_m1_diagnose/m1+dcr.json`): de
 * kandidaat 429,1·1994,6 uit het M-1-veld, met M-1's instellingen plus het
 * DCR-model op het VOORSTEL van de families — de enige netlist die de M-1-
 * instellingen ooit geleverd hebben, en de "vóór"-helft van de vraag die de
 * A5e.3-veld-regeneratie beantwoordt. Dit script zet haar op dezelfde voet als
 * elk gedateerd corpus: één bestand onder een gedateerde naam, een manifest-
 * regel, en een corpusblok met de kandidaat waar zij vandaan kwam. De
 * KLASSE-B-referenties schrijft de recorder (`record-casus1-v2-references.ts`
 * schrijft sinds A5e.3-veld ook het blok van een gedateerde netlist die nooit
 * geleefd heeft), en de reden staat daar in `DATED_REASON`.
 *
 * KOPIËREN, NOOIT VERPLAATSEN, en nooit een bestaand blok overschrijven —
 * dezelfde twee regels als het bevriesscript.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { serializeFilter } from '../src/lib/filterFile.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'test-fixtures');
const CASUS1 = join(FIXTURES, 'casus1');
const GOLDEN = join(FIXTURES, 'golden_refs_casus1.json');
/** De arm die geregistreerd wordt, en de naam waaronder — de `-KAND`-conventie van `freeze-live-corpus.ts`. */
const ARM = 'm1+dcr';
const PREFIX = 'A5E3ARM-KAND';
const BLOCK = 'a5e3_arm_corpus';

const arm = JSON.parse(readFileSync(join(FIXTURES, 'casus1_m1_diagnose', `${ARM}.json`), 'utf-8')) as {
  arm: string;
  label: string;
  what: string;
  settings: Record<string, unknown>;
  seconds: number;
  deliveredParts: VxpPart[] | null;
  refusal: unknown;
  tuned: number;
  evaluations: number;
};
if (!arm.deliveredParts) throw new Error(`arm ${ARM} leverde geen netwerk; er is niets te registreren`);

const raw = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as {
  manifest_en_geometrie: { netlists: Record<string, string> } & Record<string, unknown>;
};
if (raw.manifest_en_geometrie[BLOCK] !== undefined) throw new Error(`${BLOCK} bestaat al — weigert te overschrijven`);
const name = `${PREFIX}-1`;
const file = `${name}.adsfilter.json`;
const key = `${PREFIX.replace(/-/g, '_')}_1`;
if (existsSync(join(CASUS1, file))) throw new Error(`${file} bestaat al — weigert`);
if (raw.manifest_en_geometrie.netlists[key] !== undefined) throw new Error(`${key} staat al in het manifest — weigert`);

writeFileSync(join(CASUS1, file), serializeFilter({ name, parts: [...arm.deliveredParts] }), 'utf-8');
raw.manifest_en_geometrie.netlists[key] = file;
const commit = (() => {
  try {
    return execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim();
  } catch {
    return 'unknown';
  }
})();
raw.manifest_en_geometrie[BLOCK] = {
  _:
    'HET GEDATEERDE A5E3ARM-CORPUS: het GELEVERDE netwerk van de A5e.3-arm m1+dcr, met de kandidaat waar het ' +
    'vandaan kwam. Geen regeneratie maar één ketenrun (scripts/measure-m1-diagnose-arms.ts, M1_ARM=m1+dcr), en ' +
    'geregistreerd omdat het levende corpus bij M-1 leeg was: er viel niets te bevriezen, en dit is de enige netlist ' +
    'die de M-1-instellingen ooit geleverd hebben. DOCUMENTATIE, geen acceptatiewaarde.',
  reden:
    'HET GEDATEERDE A5E3ARM-CORPUS. Eén netlist: kandidaat 429,1 LR4 · 1994,6 LR4 uit het M-1-veld (de kandidaat ' +
    'die M-1 verliesvrij op 1,23 ohm weigerde), met M-1\'s instellingen (gemergede set, plateau 0 dB, ' +
    'lowestWayLevelWork none, oordeelband vanaf f_p, M-1-raster) PLUS het DCR-model op het toen nog VOORGESTELDE ' +
    'familieblok (woofer 1,4 mm, mid en tweeter 1,0 mm lucht) - dezelfde families die Sander bij A5e.3-veld gesteld ' +
    'heeft. Geleverd op 2,62 ohm zonder R of pad op de woofer (0,94 ohm puur koper). Bewaard als de "voor"-helft van ' +
    'de A5e.3-veld-vergelijking: dezelfde fysica, het M-1-veld (k maal f_s als vloer, LR2 en LR4, geen budget) in ' +
    'plaats van het A5e.3-veld. Meetobject, GEEN ontwerp: mag niet gebouwd worden.',
  arm: ARM,
  arm_bestand: `casus1_m1_diagnose/${ARM}.json`,
  arm_instellingen: arm.settings,
  seconden: arm.seconds,
  tuned: arm.tuned,
  evaluaties: arm.evaluations,
  geregistreerd_op_commit: commit,
  bestanden: [{ naam: key, was: ARM, kandidaat: arm.label }],
};
writeFileSync(GOLDEN, `${JSON.stringify(raw, null, 1)}\n`);
console.log(`registered ${ARM} as ${file} (${key}, ${BLOCK}) — ${arm.label}`);
