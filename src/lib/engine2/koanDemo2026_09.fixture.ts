/**
 * M-2 — DE KOAN-FRAME DEMO-SET, MODEL-GETRANSFORMEERD (12-09-2026).
 *
 * WAT DIT IS, EN WAT HET NIET IS. Dit is GEEN meetbasis. De meetbasis van
 * casus 1 blijft M-1: de augustusmeting in de testkast van 53,2 L, met beide
 * woofers parallel aangedreven. Deze set is diezelfde meting, per brontype
 * vermenigvuldigd met een modeldelta naar het frame van de ECHTE kast van
 * 67,7 L met f_b 27,7 Hz, plus de mid en de tweeter die daar ongewijzigd
 * geldig zijn. Zij is bedoeld voor filterontwikkeling in het Koan-frame en
 * voor niets anders.
 *
 * DE SCHEIDING STAAT PER BRON EN NIET PER SET, want zij loopt er dwars
 * doorheen. De tweeter zit in een waveguide en de mid in een bolvormige pod;
 * die definiëren hun eigen diffractie, dus zij zijn in de Koan geldig zonder
 * enige transformatie en het manifest noemt ze MEETDATA. De twee woofers en de
 * poort zitten in de kast zelf, dus zij zijn getransformeerd. Een set die
 * zichzelf in zijn geheel "model" of in zijn geheel "meting" zou noemen liegt
 * over de helft van zijn bronnen; `KoanDemoSource.status` draagt het per bron
 * en `koanDemoStatusOf` leest het uit het manifest in plaats van het hier over
 * te typen.
 *
 * DE VERVANGREGEL. Deze set blijft niet naast de meetbasis bestaan. De eerste
 * meetsessie aan de echte Koan met BEIDE woofers parallel aangedreven —
 * drie nabije velden, de parallelle ZMA, en de meetspanning genoteerd —
 * VERVANGT haar. Het manifest zegt het zelf in `flags.status`, en
 * `koanDemo2026_09.test.ts` pint die zin zodat zij niet stil kan verdwijnen.
 *
 * WAAROM ZIJ GEEN LAADBARE DEMOBUNDEL IS. Geen enkel bestand in deze set
 * stelt een geldigheid die de app kan lezen: `readGateHeader` antwoordt
 * `absent` op vijf van de zes en `unparseable` op de tweeter, en
 * `readMergeBlock` levert overal `null`. Een `DemoBundle` hiervan zou precies
 * de U-3-fout herhalen — een demo die zijn eigen route blokkeert, want
 * `refuseIfUnverified` weigert dan te optimaliseren — en guard 1 van
 * `demoBundle.test.ts` zou er terecht op vallen. De koppen repareren is geen
 * optie: een `Valid from` terugschrijven in een bestand dat er nooit een droeg
 * is een meting verzinnen (A3h), en op een MODEL-getransformeerd bestand zou
 * het een geldigheid verzinnen voor data die geen meting is. Daarom is dit een
 * FIXTURE-dataset met een loader en een loader-test, en geen demoknop. Wat
 * eraan ontbreekt is een eigenschap van de DATA en staat als bevinding in de
 * M-2-entry.
 *
 * ZIJ LEEST VAN SCHIJF, dus zij wordt alleen uit tests en `scripts/`
 * geïmporteerd (`browserSafe.test.ts` zondert `*.fixture.ts` uit;
 * `toggleRegression.test.ts` pint dat niets in de bundel er een importeert).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { combineN, resample, type GriddedResponse } from '../dsp.ts';
import { parseFrd } from '../parsers/frd.ts';
import { parseZma } from '../parsers/zma.ts';
import type { ZmaMeasurement } from '../types.ts';

/**
 * De gedateerde naam draagt de status, en dat is opzet: wie deze map opent
 * ziet in de naam al dat het een modeltransformatie is en uit welke maand.
 */
export const KOAN_DEMO_2026_09_NAME = 'koan_demo_2026-09_modeltransform';

export const KOAN_DEMO_2026_09_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'test-fixtures',
  KOAN_DEMO_2026_09_NAME,
);

/**
 * De band waarop de loader-test oordeelt, en de tolerantie. Beide komen uit
 * `verification.rule` van het manifest zelf en staan hier als benoemde
 * constante omdat de test ze leest; `koanDemoVerification` controleert dat de
 * zin in het manifest ze nog steeds noemt.
 */
export const LOADER_TEST_BAND_HZ: readonly [number, number] = [20, 500];
/** dB. De eis uit `verification.rule`. */
export const LOADER_TEST_TOLERANCE_DB = 0.1;

/** Wat een bron over zijn eigen herkomst zegt. Uit het manifest, nooit geraden. */
export type KoanDemoStatus = 'meetdata' | 'model-transformed';

/** Eén bron uit het manifest, met zijn bestanden en zijn status. */
export interface KoanDemoSource {
  /** `T`, `M`, `W1`, `W2` of `PORT`. */
  id: string;
  model: string;
  /** Verticale positie ten opzichte van de meetas, mm. */
  zOffsetMm: number;
  /** Bestandsnaam van de respons, relatief aan de map. */
  frd: string;
  /** Bestandsnaam van de impedantie, of `null` als deze bron er geen draagt. */
  zma: string | null;
  /** De statuszin zoals het manifest hem schrijft, verbatim. */
  statusText: string;
  /** Diezelfde zin, geclassificeerd. */
  status: KoanDemoStatus;
}

/** Het manifest zoals het op schijf staat. Alleen de velden die wij lezen. */
export interface KoanDemoManifest {
  name: string;
  frame: string;
  drivers: {
    id: string;
    model: string;
    z_offset_mm: number;
    frd: string;
    zma?: string;
    status: string;
  }[];
  loads: { W_parallel_zma: string; accuracy: string };
  flags: {
    w_validity_ceiling_hz: number;
    status: string;
    duct_modes_hz: number[];
    optimizer_rule: string;
    drive_voltage: string;
  };
  measured_in: string;
  verification: { loader_test_reference: string; rule: string };
  frame_note: string;
  assumption: string;
}

export function loadKoanDemoManifest(): KoanDemoManifest {
  return JSON.parse(
    readFileSync(join(KOAN_DEMO_2026_09_DIR, 'manifest.json'), 'utf8'),
  ) as KoanDemoManifest;
}

/**
 * De statuszin van een bron geclassificeerd. Het manifest schrijft hem voluit
 * ("MEETDATA (M-1), geldig >400 Hz" / "MODEL-TRANSFORMED naar 67.7 L (basis
 * M-1)"); dit leest welke van de twee het is en GOOIT op alles daarbuiten,
 * zodat een derde soort niet stil als meting doorgaat.
 */
export function koanDemoStatusOf(statusText: string): KoanDemoStatus {
  if (statusText.startsWith('MEETDATA')) return 'meetdata';
  if (statusText.startsWith('MODEL-TRANSFORMED')) return 'model-transformed';
  throw new Error(
    `koanDemoStatusOf: onbekende status "${statusText}" — een bron is MEETDATA of MODEL-TRANSFORMED, en een derde soort moet hier benoemd worden voordat hij meetelt.`,
  );
}

/** De vijf bronnen, in de volgorde waarin het manifest ze noemt. */
export function koanDemoSources(
  manifest: KoanDemoManifest = loadKoanDemoManifest(),
): KoanDemoSource[] {
  return manifest.drivers.map((d) => ({
    id: d.id,
    model: d.model,
    zOffsetMm: d.z_offset_mm,
    frd: d.frd,
    zma: d.zma ?? null,
    statusText: d.status,
    status: koanDemoStatusOf(d.status),
  }));
}

/**
 * De bronnen die samen de LAAGSTE WEG vormen: beide woofers en de poort.
 *
 * STRUCTUREEL AFGELEID EN NIET UIT PROZA. Een bron die zijn EIGEN impedantie
 * draagt is een eigen weg; de bronnen zonder eigen `zma` worden gevoed door de
 * gedeelde last die het manifest in `loads.W_parallel_zma` aanwijst, en dat
 * zijn precies de twee woofers en de poort. Op de zin in `verification.rule`
 * zoeken zou dezelfde fout zijn die P-1 in de v1-vensterlezer vond: proza
 * lezen waar een veld het antwoord draagt. Nergens op een wegnaam gezocht, dus
 * N-weg-agnostisch.
 */
export function koanDemoWooferWaySourceIds(
  manifest: KoanDemoManifest = loadKoanDemoManifest(),
): string[] {
  const shared = manifest.drivers.filter((d) => d.zma === undefined);
  if (shared.length < 2) {
    throw new Error(
      `koanDemoWooferWaySourceIds: ${shared.length} bron(nen) zonder eigen impedantie — de gedeelde last ${manifest.loads.W_parallel_zma} hoort er minstens twee te voeden.`,
    );
  }
  return shared.map((d) => d.id);
}

/** Het ruwe bestand van een bron, verbatim zoals het op schijf staat. */
export function readKoanDemoFile(file: string): string {
  return readFileSync(join(KOAN_DEMO_2026_09_DIR, file), 'utf8');
}

/**
 * Eén respons als `GriddedResponse` op haar EIGEN raster. De omweg langs
 * `resample` is er voor de fase: die komt gewikkeld uit het bestand en moet
 * ontwikkeld zijn voordat er complex mee gesommeerd wordt.
 */
export function loadKoanDemoResponse(file: string): GriddedResponse {
  const m = parseFrd(readKoanDemoFile(file));
  if (!m.hasPhase) {
    throw new Error(`loadKoanDemoResponse: ${file} draagt geen fasekolom — complex sommeren kan niet.`);
  }
  return resample(m.freq, m.spl, m.phase, m.freq);
}

/** De impedantie van een bron, geparsed. */
export function loadKoanDemoImpedance(file: string): ZmaMeasurement {
  return parseZma(readKoanDemoFile(file));
}

/**
 * De referentiecurve van de loader-test. Zij is GEEN bron en GEEN meetdata —
 * haar eigen kop zegt dat — maar per constructie de complexe som van de drie
 * wooferweg-bronnen, en daarmee het enige waartegen mapping, eenheden en
 * tekens te toetsen zijn.
 */
export function loadKoanDemoReferenceSum(
  manifest: KoanDemoManifest = loadKoanDemoManifest(),
): GriddedResponse {
  return loadKoanDemoResponse(manifest.verification.loader_test_reference);
}

/** Het resultaat van de loader-test, met het getal erbij. */
export interface KoanDemoLoaderTest {
  /** Aantal getoetste rasterpunten binnen de band. */
  points: number;
  /** Grootste |Δ| in dB tussen de som en de referentie. */
  worstDb: number;
  /** De frequentie waar die afwijking zit, Hz. */
  worstHz: number;
  /** Gemiddelde Δ in dB — een niveaufout zou hier staan en nergens anders. */
  meanDb: number;
  /** Grootste |Δ| in graden; een tekenfout zou hier staan. */
  worstPhaseDeg: number;
  /** Haalt de som de tolerantie uit het manifest? */
  pass: boolean;
}

/**
 * DE LOADER-TEST. Zij toetst de LOADER en niet de data: de bronnen zijn een
 * voorspelling en kunnen hierdoor niet gevalideerd worden. Wat zij wél
 * vaststelt is dat mapping, eenheden en tekens kloppen — dat wij dezelfde drie
 * bestanden op dezelfde manier optellen als degene die de referentie maakte.
 *
 * De som loopt door `combineN`, de eigen N-weg-sommatie van de app, en niet
 * door een tweede optelling hier: een loader-test die zijn eigen sommatie
 * meebrengt toetst die sommatie en niet de loader (A3g).
 */
export function runKoanDemoLoaderTest(
  manifest: KoanDemoManifest = loadKoanDemoManifest(),
): KoanDemoLoaderTest {
  const sources = koanDemoSources(manifest);
  const ids = koanDemoWooferWaySourceIds(manifest);
  const parts = ids.map((id) => {
    const s = sources.find((x) => x.id === id);
    if (!s) throw new Error(`runKoanDemoLoaderTest: bron ${id} staat niet in het manifest.`);
    return loadKoanDemoResponse(s.frd);
  });
  const ref = loadKoanDemoReferenceSum(manifest);
  const sum = combineN(parts.map((response) => ({ response })));

  const [lo, hi] = LOADER_TEST_BAND_HZ;
  let worstDb = 0;
  let worstHz = 0;
  let worstPhaseDeg = 0;
  let total = 0;
  let points = 0;
  for (const [i, f] of sum.freq.entries()) {
    if (f < lo || f > hi) continue;
    const d = sum.combinedSpl[i] - ref.spl[i];
    let dp = sum.combinedPhaseDeg[i] - ref.phaseDeg[i];
    while (dp > 180) dp -= 360;
    while (dp < -180) dp += 360;
    if (Math.abs(d) > Math.abs(worstDb)) {
      worstDb = d;
      worstHz = f;
    }
    if (Math.abs(dp) > Math.abs(worstPhaseDeg)) worstPhaseDeg = dp;
    total += d;
    points++;
  }
  if (points === 0) {
    throw new Error(
      `runKoanDemoLoaderTest: geen enkel rasterpunt in ${lo}–${hi} Hz — de bestanden dekken de toetsband niet.`,
    );
  }
  return {
    points,
    worstDb: Math.abs(worstDb),
    worstHz,
    meanDb: total / points,
    worstPhaseDeg: Math.abs(worstPhaseDeg),
    pass: Math.abs(worstDb) <= LOADER_TEST_TOLERANCE_DB,
  };
}
