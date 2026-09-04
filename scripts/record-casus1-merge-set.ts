/**
 * M-1 — THE MERGED MEASUREMENT SET, RECORDED IN THE CASE BOOK FROM THE FILES.
 *
 * `npx vite-node scripts/record-casus1-merge-set.ts` — seconds.
 *
 * Writes `manifest_en_geometrie.gemergde_set`: which merged file replaces
 * which gated one, and PER FILE the merge parameters — read back through the
 * engine's own parser from the block each file carries, never typed here. That
 * is V15's rule (a reference that depends on a parameter records it) applied
 * to the measurement set itself, and it is also why the block is generated: a
 * parameter block that could drift from the file it describes is a block that
 * will. `goldenClassification.test.ts` holds the engine to it.
 *
 * The three merged files are DATA the fixture reads (`casus1Manifest`,
 * default set `'merged'`); this script only records what they say.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArtaHeader } from '../src/lib/engine2/ingest/manifest.ts';
import { parseTabular } from '../src/lib/parsers/tabular.ts';
import { parseFrd } from '../src/lib/parsers/frd.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'test-fixtures');
const CASUS1 = join(FIXTURES, 'casus1');
const GOLDEN = join(FIXTURES, 'golden_refs_casus1.json');

/** The three merges and the gated on-axis file each replaces (M-1). */
const MERGED: Record<string, { drv: string; typ: 'FF'; hoek: number; vervangt: string; gemaakt_door: string }> = {
  'Koan_W_up_merged_ingespeeld_mild.frd': {
    drv: 'woofer',
    typ: 'FF',
    hoek: 0,
    vervangt: 'woofer_up_hor_0.txt',
    gemaakt_door: 'Sander Somers (augustus-pipeline), blok toegevoegd met scripts/annotate-casus1-merge.ts',
  },
  'Koan_W_down_merged_ingespeeld_mild.frd': {
    drv: 'woofer',
    typ: 'FF',
    hoek: 0,
    vervangt: 'woofer_down_hor_0.txt',
    gemaakt_door: 'Sander Somers (augustus-pipeline), blok toegevoegd met scripts/annotate-casus1-merge.ts',
  },
  'Koan_M_merged.frd': {
    drv: 'mid',
    typ: 'FF',
    hoek: 0,
    vervangt: 'mid_hor_0.txt',
    gemaakt_door: 'scripts/merge-casus1-mid.ts (M-1): dezelfde stappen als de woofer-merge, door mergeNearFar van de app',
  },
};

const raw = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as Record<string, Record<string, unknown>>;
const geo = raw.manifest_en_geometrie as Record<string, unknown>;

const parameters: Record<string, unknown> = {};
for (const [file, tag] of Object.entries(MERGED)) {
  const text = readFileSync(join(CASUS1, file), 'latin1');
  const h = parseArtaHeader(parseTabular(text).comments);
  const f = parseFrd(text);
  if (!h.merge) throw new Error(`${file}: no merge block`);
  if (h.statedValidity?.fromHz === undefined) throw new Error(`${file}: no "Valid from"`);
  parameters[file] = {
    vervangt: tag.vervangt,
    merge: h.merge.kind,
    geldig_van_Hz: h.statedValidity.fromHz,
    geldig_tot_Hz: h.statedValidity.toHz ?? null,
    NF_bron: h.merge.nfSource ?? null,
    FF_bron: h.merge.ffSource ?? null,
    FF_venster_ms: h.merge.ffWindow?.effectiveWindowMs ?? null,
    FF_venster_referentietijd_ms: h.merge.ffWindow?.referenceTimeMs ?? null,
    FF_venster_rechter_ms: h.merge.ffWindow?.rightWindowMs ?? null,
    splice_band_Hz: h.merge.spliceBandHz ?? null,
    splice_gain_dB: h.merge.spliceGainDb ?? null,
    splice_delay_ms: h.merge.spliceDelayMs ?? null,
    step_model: h.merge.stepModel ?? null,
    poortmodel: h.merge.portModel ?? null,
    predictie: h.merge.prediction ?? null,
    vloer_reden: h.merge.floorReason ?? null,
    status: h.merge.status ?? null,
    bereik_Hz: [f.freq[0], f.freq[f.freq.length - 1]],
    rijen: f.freq.length,
  };
}

geo.gemergde_set = {
  _:
    'M-1 (04-09-2026) - DE GEMERGEDE MEETSET voor de v2-route. De on-axis ver-veldbestanden van de ' +
    'woofers en de mid zijn vervangen door hun NF/FF-merges; elk mergebestand draagt een ' +
    'gestructureerd blok (Merge = NF/FF, Valid from = ... Hz, Merge ... = ...) dat parseArtaHeader ' +
    'leest en waarop validity.ts een eigen pad neemt: de vloer komt uit het blok, de adviserende ' +
    'FF/NF-detector onthoudt zich, fijnstructuur vanaf 2/T van de ver-veldhelft. De rest van het ' +
    'manifest (impedanties, nabije velden, mid 30 graden, tweeter) is de sessie van 22-08-2026 ' +
    'ongewijzigd. De fixture leest deze set standaard (casus1Manifest, set "merged"); de gepoorte ' +
    'set blijft bestaan voor v1 (byte-identiek) en voor de tests die de header-vloer zelf toetsen ' +
    '(set "gated"). Klasse A: projectinvoer, nergens een functie van behalve van de meetsessie en van ' +
    'de merge die Sander en het mid-script erop deden.',
  klasse: 'A',
  afhankelijkheid: 'meting',
  status:
    'PLACEHOLDER tot groundplane/hermeting na inspelen. De wooferbestanden dragen een inspeel-PREDICTIE ' +
    '(Cms +5,2 %, mild: delta <= 0,07 dB / 1,1 graad op 20 Hz, 0 boven 150 Hz) en geen meting; de LF ' +
    'onder de splice is nabij veld plus modelstap (shelf 6 dB @ 440 Hz) plus poortmodel. Elke ' +
    'klasse-A-referentie op deze set draagt dit woord in haar parameterblok.',
  bestanden: MERGED,
  merge_parameters: {
    _:
      'V15-PARAMETERBLOK, GELEZEN uit het blok van elk bestand door parseArtaHeader (scripts/' +
      'record-casus1-merge-set.ts) en niet overgetypt; goldenClassification.test.ts houdt de engine ' +
      'eraan. De woofers: Sanders augustus-pipeline (eigen nabij veld + 1/2 poort g 0,41, shelf 6 dB @ ' +
      '440 Hz met diffractie-kruiscontrole <= 0,6 dB / <= 5 graden in 250-500 Hz, splice gefit in ' +
      '500-800 Hz, inspeel-predictie mild). De mid: scripts/merge-casus1-mid.ts, dezelfde stappen ' +
      '(shelf 6 dB @ 440 Hz als minimum-fase op het NF-deel, geen poort - gesloten pod -, splice ' +
      'gefit in 500-800 Hz door mergeNearFar van de app), geldig vanaf 60 Hz uit de pod (f_c 88,8 Hz).',
    ...parameters,
  },
};

writeFileSync(GOLDEN, `${JSON.stringify(raw, null, 1)}\n`);
console.log(`gemergde_set: ${Object.keys(MERGED).length} bestanden`);
for (const [file, p] of Object.entries(parameters)) {
  const q = p as { geldig_van_Hz: number; splice_gain_dB: number | null; splice_delay_ms: number | null };
  console.log(`  ${file}: geldig vanaf ${q.geldig_van_Hz} Hz, splice gain ${q.splice_gain_dB} dB / delay ${q.splice_delay_ms} ms`);
}
