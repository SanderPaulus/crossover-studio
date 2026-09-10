import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadGolden,
  casus1Manifest,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1ExcursionSettings,
  casus1PowerRatings,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { DRIVER_THERMAL_VERSION } from '../src/lib/engine2/metrics/thermalLoad.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PATH = join(ROOT, 'test-fixtures', 'golden_refs_casus1.json');

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const ratings = casus1PowerRatings(golden);

/* Door de ENGINE gelezen en niet nagebouwd (V19): een parameterblok dat nergens
 * tegen de engine wordt gehouden is decoratie. En op ALLE DRIE de
 * referentiefilters, want dat is wat klasse A betekent — zij horen hetzelfde
 * getal te geven, en het script controleert dat in plaats van het aan te nemen. */
const perFilter = ['HUIDIG', 'KAND_A', 'KAND_B'].map((name) => {
  const rep = buildReport({
    manifest,
    files,
    filter: casus1Filter(name, manifest, files, golden),
    geometry: casus1Geometry(golden),
    settings: { ...casus1ExcursionSettings(golden), amplifierPowerW: 100 },
  });
  return { name, rows: rep.metrics.thermalLoad };
});

const refs = JSON.parse(readFileSync(PATH, 'utf-8')) as Record<string, unknown>;
const derived = refs.afgeleide_parameters as Record<string, Record<string, unknown>>;

for (const driver of Object.keys(ratings)) {
  const values = perFilter.map((f) => f.rows.find((r) => r.driver === driver)?.certifiedWatts ?? null);
  if (values.some((v) => v === null)) {
    console.log(`${driver}: M-M leverde geen gecertificeerde waarde — overgeslagen`);
    continue;
  }
  const spread = Math.max(...(values as number[])) - Math.min(...(values as number[]));
  if (spread > 1e-9) throw new Error(`${driver}: klasse A geschonden — ${spread} W spreiding over de drie filters`);
  const watts = values[0] as number;
  const fraction = perFilter[0].rows.find((r) => r.driver === driver)!.certifiedFraction!;
  const rating = ratings[driver];
  const target = derived[driver] ?? (derived[driver] = {});
  target.mm_gecertificeerde_fractie = Number(fraction.toFixed(6));
  target.mm_gecertificeerd_W = Number(watts.toFixed(4));
  target.mm_toelichting =
    `M-M (${DRIVER_THERMAL_VERSION}), klasse A: het aandeel van wat deze driver ONGEFILTERD zou opnemen ` +
    `dat door zijn eigen testfilter komt (orde ${rating.testFilterOrder} op ${rating.testFilterHz} Hz), maal ` +
    `de opgegeven ${rating.ratedPowerW} W. Geen netlist en geen zoektocht: op alle drie de referentiefilters ` +
    'hetzelfde getal, en dit script gooit als dat niet zo is. De GELEVERDE belasting en de verhouding hangen ' +
    'wél aan een netwerk en zijn klasse B; die staan hier niet.';
  console.log(`${driver}: fractie ${fraction.toFixed(6)} -> ${watts.toFixed(4)} W gecertificeerd (klasse A over 3 filters)`);
}

(derived._M_M_parameters as unknown) = {
  klasse: 'A',
  afhankelijkheid: 'meting',
  _:
    'V15 — de invoer waarop M-M rust. De weging is die van M-A (IEC 60268-1 zoals engine2 hem modelleert: ' +
    'roze met 1e-orde HP/LP op de normranden), het testfilter is een ideale Butterworth-hoogdoorlaat van de ' +
    'opgegeven orde en frequentie, en de noemer is DEZELFDE driver ongefilterd. Beide kanten van de ' +
    'vergelijking lezen die noemer, en dat maakt de verhouding robuust waar de absolute watt dat niet is.',
  weging: 'iecProgrammeWeight (IEC_60268_1_HP_HZ 40, IEC_60268_1_LP_HZ 5000, roze)',
  weging_voorbehoud:
    'Het spectrum van de app is een VEREENVOUDIGING van IEC 268-5; de absolute watt erft dat voorbehoud, ' +
    'de verhouding tussen twee filters op hetzelfde spectrum veel minder.',
  versie: DRIVER_THERMAL_VERSION,
  opgave_per_driver: ratings,
};

writeFileSync(PATH, JSON.stringify(refs, null, 1) + '\n', 'utf-8');
console.log('geschreven:', PATH);
