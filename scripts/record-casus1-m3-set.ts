/**
 * M-3 — DE HERMERGDE MID, GEREGISTREERD IN HET CASUSBOEK UIT HET BESTAND.
 *
 * `npx vite-node scripts/record-casus1-m3-set.ts` — seconden.
 *
 * Schrijft `manifest_en_geometrie.meetset_M3_mid`: welk bestand welk bestand
 * vervangt en de parameters PER BESTAND, teruggelezen door de eigen parser van
 * de engine uit het blok dat het bestand draagt — nooit hier overgetypt. Zelfde
 * regel en zelfde reden als `record-casus1-67l-set.ts` een sessie eerder
 * (V15: een referentie die van een parameter afhangt legt hem vast).
 *
 * WAT ER VERHUIST IS EEN BEWERKING EN GEEN MEETSESSIE. De bronnen zijn
 * ONVERANDERD: `mid_near.txt` en `mid_hor_0.txt`, beide van 22-08-2026, en
 * `mid.lim` wordt niet aangeraakt. Wat er verhuist is de fasewiskunde van het
 * stapmodel — I-2's bevinding, hier gerepareerd — en verder niets: dezelfde
 * splice-band, dezelfde shelf, dezelfde gestelde geldigheidsvloer.
 *
 * DE M-1-MID BLIJFT. `Koan_M_merged.frd` blijft op schijf en blijft de mid van
 * de sets `'merged'` en `'koan677'`, want dát is wat élke referentie van vóór
 * M-3 reproduceerbaar houdt als gedateerde brug.
 *
 * DE VOLGORDE IS BINDEND (de C-2-regel): merge -> dit script -> de recorder
 * (`record-casus1-m3-references.ts`). Dit script herschrijft het hele
 * `meetset_M3_mid`-blok, dus wat de recorder eraan toevoegt zou het weggooien —
 * `KEPT_BY_THE_RECORDER` hieronder draagt die sleutels expliciet door, zodat de
 * volgorde een VOORKEUR is en geen valstrik. Wie er een sleutel bij zet, zet
 * hem ook in die lijst.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArtaHeader } from '../src/lib/engine2/ingest/manifest.ts';
import { parseTabular } from '../src/lib/parsers/tabular.ts';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import {
  MID_FAR_FILE,
  MID_M1_FILE,
  MID_M3_FILE,
  MID_NEAR_FILE,
  deltaBands,
  m1MidResponse,
} from '../src/lib/engine2/midM3.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'test-fixtures');
const GOLDEN = join(FIXTURES, 'golden_refs_casus1.json');
const CASUS1 = join(FIXTURES, 'casus1');

const raw = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, Record<string, unknown>>;
const geo = raw.manifest_en_geometrie;

/** Sleutels van `meetset_M3_mid` die de RECORDER schrijft en dit script niet
 *  mag wissen. Zie de volgorde-noot in de kop. */
const KEPT_BY_THE_RECORDER = ['klasse_A_onbewogen'] as const;
const kept: Record<string, unknown> = {};
{
  const existing = geo.meetset_M3_mid as Record<string, unknown> | undefined;
  if (existing) for (const k of KEPT_BY_THE_RECORDER) if (k in existing) kept[k] = existing[k];
}

const text = readFileSync(join(CASUS1, MID_M3_FILE), 'utf8');
const h = parseArtaHeader(parseTabular(text).comments);
const f = parseFrd(text);
if (!h.merge) throw new Error(`${MID_M3_FILE}: geen mergeblok`);
if (h.statedValidity?.fromHz === undefined) throw new Error(`${MID_M3_FILE}: geen "Valid from"`);

const old = m1MidResponse();
const rows = deltaBands(f.freq, { spl: f.spl, phase: f.phase }, { spl: old.spl, phase: old.phase });

const r4 = (v: number): number => Number(v.toFixed(4));
const r2 = (v: number): number => Number(v.toFixed(2));

geo.meetset_M3_mid = {
  _:
    'M-3 (16-09-2026) - DE HERMERGDE MID, en zij is de v2-set van casus 1. Het ENIGE bestand dat ' +
    'verhuist is de on-axis merge van de mid: I-2 mat dat M-1 de minimumfase van het stapmodel als ' +
    'atan2(Im, Re) van het LOG-spectrum nam waar de minimumfase Im IS, en deze set is diezelfde merge ' +
    'door de route die de app sinds I-2 zelf gebruikt (nfMerge.ts, dat minphase.ts leest). De BRONNEN ' +
    'zijn onveranderd (mid_near.txt en mid_hor_0.txt, 22-08-2026) en de splice-band, de shelf en de ' +
    'gestelde geldigheidsvloer zijn die van M-1, zodat er precies EEN factor beweegt. De wooferhelft ' +
    'is de 67,7 L-set van M-2b ongewijzigd, de tweeter de M-1-set ongewijzigd. De fixture leest deze ' +
    'set standaard (casus1Manifest, set "m3"); "koan677" blijft bestaan als de GEDATEERDE M-2b-set ' +
    'waarop het M-2b-corpus en elke referentie van voor M-3 gemeten is, "merged" als de M-1-set en ' +
    '"gated" voor v1 en voor de tests die de header-vloer zelf toetsen. Klasse A: projectinvoer, ' +
    'nergens een functie van behalve van de meetsessie en van de merge die de app erop deed.',
  klasse: 'A',
  afhankelijkheid: 'meting',
  status:
    'MODEL-VALIDATED onder de splice, MEETDATA erboven - dezelfde status als de M-1-merge die zij ' +
    'vervangt, want het zijn dezelfde twee metingen. Wat VERVALT is de fasefout van het stapmodel; ' +
    'wat BLIJFT is dat de mid onder 500 Hz een nabij veld plus een MODEL is en geen meting op ' +
    'afstand, en dat de shelf (6 dB @ 440 Hz) gesteld is en nooit gemeten.',
  gesteld_door:
    'de reparatie is afgeleid (nfMerge.ts); de splice-band, de shelf en de geldigheidsvloer zijn ' +
    'Sanders/M-1s gestelde waarden, hier onveranderd herhaald en door assertM1ModelMatches() tegen ' +
    'het M-1-bestand gehouden.',
  bestanden: {
    [MID_M3_FILE]: {
      drv: 'mid',
      typ: 'FF',
      hoek: 0,
      vervangt: MID_FAR_FILE,
      gemaakt_door:
        'scripts/merge-casus1-mid-m3.ts (M-3): dezelfde twee bestanden als M-1, gemergd door ' +
        'nfMerge.ts - de eigen merge-module van de app, die de minimumfase uit minphase.ts leest.',
    },
  },
  parameters: {
    [MID_M3_FILE]: {
      vervangt: MID_FAR_FILE,
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
    },
  },
  fasedelta_M1_naar_M3: {
    _:
      'WAT DE REPARATIE VERPLAATST, gemeten op het gedeelde raster, in de banden waarin I-2 de fout ' +
      'mat. De MAGNITUDE beweegt nergens meer dan 0,0007 dB - binnen de 0,001 dB-afronding van de ' +
      'bestanden zelf, en precies waarom dit vier sessies onopgemerkt bleef. De FASE loopt op naarmate ' +
      'je zakt, en is boven 800 Hz exact nul omdat de merge daar HET VERRE VELD IS.',
    per_band: rows.map((r) => ({
      van_Hz: r.from,
      tot_Hz: r.to,
      n: r.n,
      dB_rms: r4(r.dbRms),
      dB_max: r4(r.dbMax),
      graden_rms: r2(r.degRms),
      graden_max: r2(r.degMax),
    })),
    leesregel:
      'De 18-29 graden die I-2 noemt liggen ONDER 150 Hz. Over de W-M-kruisband (253-519 Hz op het ' +
      'M-2b-corpus) is de fout 1,9-7,0 graden rms, en dat is de ordegrootte waarmee M-K daar beweegt.',
  },
  ...kept,
  wat_NIET_verhuist: {
    _: 'GEMETEN EN NIET AANGENOMEN (M-3).',
    [MID_NEAR_FILE]: 'ONGEWIJZIGD, 22-08-2026 - de bron van de merge.',
    [MID_FAR_FILE]: 'ONGEWIJZIGD, 22-08-2026 - de andere bron; boven de splice IS de merge dit bestand.',
    'mid.lim': 'ONGEWIJZIGD - een merge raakt geen impedantie (controle 3 van nfMerge).',
    'mid_hor_30.txt': 'ONGEWIJZIGD - de 30-graden-respons is gepoort en niet gemergd; de directiviteit leest hem.',
    [MID_M1_FILE]:
      'BLIJFT OP SCHIJF en blijft de mid van de sets "merged" en "koan677". Dat is wat elke ' +
      'referentie van voor M-3 reproduceerbaar houdt als gedateerde brug; hem vervangen zou de ' +
      'bruggen weggooien waartegen deze sessie haar eigen getallen legt.',
    'de wooferhelft': 'DE 67,7 L-SET VAN M-2b, ongewijzigd.',
    'de tweeter': 'DE M-1-SET, ongewijzigd.',
  },
};

writeFileSync(GOLDEN, `${JSON.stringify(raw, null, 1)}\n`);
console.log(`meetset_M3_mid: ${MID_M3_FILE} vervangt ${MID_FAR_FILE}, geldig vanaf ${h.statedValidity.fromHz} Hz, ${f.freq.length} rijen`);
for (const r of rows) {
  console.log(`  ${`${r.from}–${r.to} Hz`.padEnd(14)} ${r2(r.degRms).toFixed(2).padStart(6)}° rms  ${r4(r.dbMax).toFixed(4)} dB max`);
}
