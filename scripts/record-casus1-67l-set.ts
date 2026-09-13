/**
 * M-2b — DE 67,7 L-MEETSET, GEREGISTREERD IN HET CASUSBOEK UIT DE BESTANDEN.
 *
 * `npx vite-node scripts/record-casus1-67l-set.ts` — seconden.
 *
 * Schrijft `manifest_en_geometrie.meetset_2026_09_67L`: welk bestand welk
 * bestand van 22-08 vervangt, in welke MAP het woont, en PER BESTAND de
 * parameters — teruggelezen door de eigen parser van de engine uit het blok dat
 * elk bestand draagt, nooit hier overgetypt. Dat is V15's regel (een referentie
 * die van een parameter afhangt legt hem vast) toegepast op de meetset zelf, en
 * het is ook waarom het blok gegenereerd wordt: een parameterblok dat kan
 * wegdrijven van het bestand dat het beschrijft, drijft weg.
 *
 * De vijf bestanden zijn DATA die de fixture leest (`casus1Manifest`, set
 * `'koan677'`); dit script registreert alleen wat zij zeggen.
 *
 * WAT ER NIET VERHUIST, en dat is de helft van wat dit blok vastlegt: de MID en
 * de TWEETER blijven wat zij waren. Een gesloten pod en een waveguide voelen
 * het kastvolume niet, dus er valt niets te transformeren (M-2), en de
 * meetspanning is ongedocumenteerd zodat er ook niets te herijken valt. De
 * SWEEP van de woofer verhuist wél van sessie (22-08 naar 11-09) maar NIET van
 * frame: hij is de gemeten 53,2 L-testkast en wordt niet getransformeerd.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArtaHeader } from '../src/lib/engine2/ingest/manifest.ts';
import { parseTabular } from '../src/lib/parsers/tabular.ts';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseLim } from '../src/lib/parsers/lim.ts';
import { readGateHeader } from '../src/lib/xoWindow.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'test-fixtures');
const GOLDEN = join(FIXTURES, 'golden_refs_casus1.json');

/** De map waarin de hermeting en de merges die eruit volgen wonen (M-2). */
const MAP = 'koan_2026-09_testkast';

interface Swap {
  drv: string;
  typ: 'FF' | 'NF' | 'Z';
  hoek?: number;
  vervangt: string;
  map: string;
  gemaakt_door: string;
}

/** De vijf vervangingen: de hele WOOFERHELFT, en niets anders. */
const SET: Record<string, Swap> = {
  'woofer_up_hor_0_koan677_merged.frd': {
    drv: 'woofer',
    typ: 'FF',
    hoek: 0,
    vervangt: 'woofer_up_hor_0.txt',
    map: MAP,
    gemaakt_door:
      'scripts/merge-koan-2026-09-woofers.ts (M-2): het nabije veld van 11-09 en de poort, ' +
      'getransformeerd van 53,2 naar 67,7 L door ventedBoxTransform.ts, gespliced op het ' +
      'BESTAANDE gepoorte verre veld woofer_up_hor_0.txt door nfMerge.ts van de app',
  },
  'woofer_down_hor_0_koan677_merged.frd': {
    drv: 'woofer',
    typ: 'FF',
    hoek: 0,
    vervangt: 'woofer_down_hor_0.txt',
    map: MAP,
    gemaakt_door: 'scripts/merge-koan-2026-09-woofers.ts (M-2), zie woofer_up',
  },
  'woofer_up_near.txt': {
    drv: 'woofer',
    typ: 'NF',
    vervangt: 'woofer_up_near.txt',
    map: MAP,
    gemaakt_door: 'Sander Somers, hermeting 11-09-2026 — ARTA, ongepoort (right window 1000 ms)',
  },
  'woofer_down_near.txt': {
    drv: 'woofer',
    typ: 'NF',
    vervangt: 'woofer_down_near.txt',
    map: MAP,
    gemaakt_door: 'Sander Somers, hermeting 11-09-2026',
  },
  'woofers_parallel.lim': {
    drv: 'woofer',
    typ: 'Z',
    vervangt: 'woofers_parallel__1_.lim',
    map: MAP,
    gemaakt_door: 'Sander Somers, hermeting 11-09-2026 — ARTA LIMP, beide woofers parallel aangedreven',
  },
};

const raw = JSON.parse(readFileSync(GOLDEN, 'utf-8')) as Record<string, Record<string, unknown>>;
const geo = raw.manifest_en_geometrie as Record<string, unknown>;

const parameters: Record<string, unknown> = {};
for (const [file, tag] of Object.entries(SET)) {
  const path = join(FIXTURES, tag.map, file);
  if (tag.typ === 'Z') {
    const b = readFileSync(path);
    const z = parseLim(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    parameters[file] = {
      vervangt: tag.vervangt,
      soort: 'impedantiesweep (ARTA LIMP, binair)',
      bereik_Hz: [z.freq[0], z.freq[z.freq.length - 1]],
      punten: z.freq.length,
      frame: 'GEMETEN 53,2 L testkast — NIET getransformeerd; zie sweep_frame hieronder',
    };
    continue;
  }
  const text = readFileSync(path, 'latin1');
  const h = parseArtaHeader(parseTabular(text).comments);
  const f = parseFrd(text);
  if (tag.typ === 'NF') {
    const gate = readGateHeader(text);
    parameters[file] = {
      vervangt: tag.vervangt,
      soort: 'nabij veld (ARTA, ongepoort)',
      venster: gate.kind === 'parsed' ? { gate_ms: gate.gateMs, alpha: gate.alpha ?? null } : gate.kind,
      bereik_Hz: [f.freq[0], f.freq[f.freq.length - 1]],
      rijen: f.freq.length,
    };
    continue;
  }
  if (!h.merge) throw new Error(`${file}: geen mergeblok`);
  if (h.statedValidity?.fromHz === undefined) throw new Error(`${file}: geen "Valid from"`);
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

geo.meetset_2026_09_67L = {
  _:
    'M-2b (13-09-2026) - DE 67,7 L-MEETSET, en zij is de v2-set van casus 1. De WOOFERHELFT van de ' +
    'M-1-set is vervangen door de hermeting van 11-09-2026 in het frame van de ECHTE kast: de twee ' +
    'per-driver NF/FF-merges (nabij veld + poort, getransformeerd van 53,2 naar 67,7 L, gespliced op ' +
    'het bestaande gepoorte verre veld), de nabije velden waaruit zij gebouwd zijn, en de parallelle ' +
    'sweep van diezelfde sessie. De MID en de TWEETER blijven wat zij waren: een gesloten pod en een ' +
    'waveguide voelen het kastvolume niet, dus er valt niets te transformeren (M-2). De fixture leest ' +
    'deze set standaard (casus1Manifest, set "koan677"); "merged" blijft bestaan als de GEDATEERDE ' +
    'M-1-set waarop het C-2-corpus en elke referentie van voor M-2b gemeten is, en "gated" voor v1 en ' +
    'voor de tests die de header-vloer zelf toetsen. Klasse A: projectinvoer, nergens een functie van ' +
    'behalve van de meetsessie en van de merge en de transformatie die de app erop deed.',
  klasse: 'A',
  afhankelijkheid: 'meting',
  status:
    'MODEL-VALIDATED onder de splice, MEETDATA erboven. De VLAG "PLACEHOLDER tot groundplane/hermeting ' +
    'na inspelen" die de M-1-set droeg is hiermee VERVALLEN: de hermeting is er en de poortmeting die ' +
    'I-2 miste bestaat. Wat ervoor in de plaats komt is niet "af" maar GEDATEERD EN BEGRENSD, met drie ' +
    'benoemde foutbalken. (1) MODELTRANSFORMATIE: onder de splice is dit een nabij veld plus een ' +
    'stapmodel plus een volumetransformatie, geen meting op afstand in de echte kast. (2) ' +
    'AANDRIJFTOESTAND van de nabije velden: gemeten met EEN woofer aangedreven en de andere passief ' +
    'in dezelfde kast; STATED, NOT CORRECTED (Sander Somers, 12-09-2026). De som van conus en poort ' +
    'is daar veel minder gevoelig voor dan elk van beide apart, en elk mergebestand draagt de zin in ' +
    'zijn eigen "Merge floor reason". (3) B_l-GEVOELIGHEID: de hele transformatie hangt aan een ' +
    'datasheetgetal (10,45 Tm) dat hier niet na te rekenen is; bij +/-10 % daarop beweegt de respons ' +
    '2,3 dB rond 30 Hz, 0,4-0,7 dB onder 27 Hz en MINDER DAN 0,2 dB boven 60 Hz. De kruisband ligt ' +
    'volledig in dat laatste gebied.',
  gesteld_door: 'Sander Somers, 12-09-2026 (de twee volumes, de ongewijzigde poort, en het besluit niet te hermeten)',
  map: MAP,
  bestanden: SET,
  meetset_parameters: {
    _:
      'V15-PARAMETERBLOK, GELEZEN uit het blok van elk bestand door parseArtaHeader / readGateHeader / ' +
      'parseLim (scripts/record-casus1-67l-set.ts) en niet overgetypt; goldenClassification.test.ts ' +
      'houdt de engine eraan. De twee merges: splice-band 400-550 Hz (M-2 verplaatste hem van de ' +
      'augustusband 500-800, en dat is aantoonbaar beter: op W2 halveert het residu en gaat de ' +
      'piekfout van 4,22 naar 1,79 dB), shelf 6 dB @ 440 Hz als minimumfase op de NF-helft, poort ' +
      'gewogen op 0,205 per driver (Keele, g 0,41 over twee woofers), geldig vanaf 20,5 Hz.',
    ...parameters,
  },
  sweep_frame: {
    _:
      'DE SWEEP IS NIET GETRANSFORMEERD EN DE RESPONS WEL, en elke lezer hoort dat te weten. Dit blok ' +
      'legt vast wat dat per lezer betekent; het is een BEPERKING van de set en geen open taak.',
    respons_frame: '67,7 L (MODEL TRANSFORM uit de gemeten 53,2 L)',
    last_frame: '53,2 L (GEMETEN, 11-09-2026, beide woofers parallel aangedreven)',
    waarom_niet_getransformeerd:
      'GEMETEN EN NIET NAGELATEN (M-2): Z_mech afgelezen als Bl^2/(Z - Z_b) en de gemodelleerde ' +
      'kastlast eraf laat de driver als een klein verschil van twee grote getallen (2,0 van de 7,9 ohm ' +
      'bij het zadel; kastlast 53,9 van de 54,4), en de uitkomst is ONFYSISCH: de mechanische ' +
      'weerstand van de driver wordt onder 30 Hz negatief (-5,3 bij 14,8 Hz, -14,0 bij 24,9). Bij ' +
      '+/-10 % op B_l beweegt de getransformeerde impedantie 4,75 ohm op de bovenste piek. De functie ' +
      'bestaat en is getest (ventedBoxTransform.transformImpedance); wat niet werkt is haar op DEZE ' +
      'meting loslaten.',
    f_p:
      'f_p = 52,37 Hz, de BOVENSTE reflexpiek van de GEMETEN 53,2 L-sweep, en dat is precies dezelfde ' +
      'frequentie als op de 22-08-sweep (beide rasters leggen hem op 52,37). In de ECHTE kast ligt hij ' +
      'LAGER: dezelfde poort in 67,7 L stemt af op f_b 26,30 in plaats van 29,67 Hz, dus de hele ' +
      'reflexstructuur schuift mee omlaag. De GEOORDEELDE BAND begint dus op een f_p die bij de ' +
      'testkast hoort en niet bij de kast waarvoor de respons geldt: zij is daarmee CONSERVATIEF (de ' +
      'band begint hoger dan nodig) en nooit permissief.',
    per_lezer: {
      'M-B/|Z| (versterkervloer)':
        'LEEST DE GEMETEN SWEEP, en dat is het goede antwoord: een versterker ziet de last die de ' +
        'DRIVERS in hun kast presenteren, en de enige last die hier gemeten is, is die van de testkast. ' +
        'Het minimum ligt bovendien op 152,7 Hz - ver boven het gebied waar het volume iets doet.',
      'M-D (opslingering, lfBump)':
        'LEEST BEIDE: de RESPONS (nabij veld, 67,7 L) en de IMPEDANTIE (53,2 L). Daar zit de mismatch, ' +
        'en zij zit waar de metriek kijkt - rond f_p. De opslingering is een VERHOUDING tussen twee ' +
        'lezingen van hetzelfde netwerk op hetzelfde raster, dus een gemeenschappelijke verschuiving ' +
        'valt eruit weg; wat overblijft is dat de reflexpiek van de last 3,4 Hz hoger staat dan die van ' +
        'de respons. GEMETEN op HUIDIG: resonantDb -0,939 (M-1) -> -1,223 (M-2b).',
      'M-E (Q_es-vermenigvuldiging)':
        'LEEST ALLEEN DE IMPEDANTIE en is dus volledig in het 53,2 L-frame. Q_es schaalt met de ' +
        'bronweerstand en niet met het volume, dus dit is geen mismatch maar de juiste lezing.',
      'M-C (aandrijving op f_s)':
        'LEEST DE IMPEDANTIE voor f_s en de RESPONS voor de doorlaatband. Op de woofer is M-C ' +
        'inactief (geen hoogdoorlaat), dus de mismatch bereikt geen oordeel.',
      'de geoordeelde band':
        'BEGINT OP f_p UIT DE IMPEDANTIE (52,37 Hz) - zie f_p hierboven: conservatief.',
      'het ketenraster':
        'BEGINT OP DE GELDIGHEIDSVLOER VAN DE RESPONS (20,5 Hz), dus volledig in het 67,7 L-frame.',
    },
    waar_het_niets_doet:
      'Boven 100 Hz doet de transformatie vrijwel niets en boven 300 Hz meetbaar niets (0,005 dB). De ' +
      'hele kruisband van de woofer ligt daarin, dus voor het FILTERONTWERP draagt deze mismatch geen ' +
      'foutbalk; zij raakt de basafstemming en niet de overname.',
  },
  byte_status_van_wat_NIET_verhuist: {
    _:
      'GEMETEN EN NIET AANGENOMEN (M-2b). De demoset koan_demo_2026-09_67L draagt ook een mid en een ' +
      'tweeter; deze regels zeggen hoe die zich verhouden tot wat casus 1 leest, zodat niemand ze voor ' +
      'elkaar aanziet.',
    'tweeter (demoset) tegen tweeter_hor_0.txt':
      'IDENTIEK in de data: max |dSPL| 0,000 dB en max |dfase| 0,000 graden over alle 13640 rijen. ' +
      'Zelfde meting, andere kop. Casus 1 blijft tweeter_hor_0.txt lezen.',
    'tweeter.zma (demoset) tegen tweeter.lim':
      'ZELFDE METING, andere vorm: max |dZ| 5,0e-5 ohm en max |dfase| 5,0e-4 graden - de afronding van ' +
      'de ZMA-tekst. Casus 1 blijft de binaire LIMP lezen.',
    'mid.zma (demoset) tegen mid.lim': 'ZELFDE METING: max |dZ| 5,0e-5 ohm, max |dfase| 5,0e-4 graden.',
    'mid.frd (demoset) tegen Koan_M_merged.frd':
      'NIET DEZELFDE MERGE, en daarom leest casus 1 hem NIET. Boven 800 Hz zijn zij bit-identiek ' +
      '(0,000 dB / 0,000 graden); eronder lopen zij uiteen tot 1,94 dB en 78,9 graden, want het is een ' +
      'ANDERE merge van dezelfde metingen: shelf 6 dB @ 520 Hz met de splice gefit in 700-1200 Hz en ' +
      'een crossfade op 700 Hz, tegen M-1\'s shelf @ 440 Hz gefit in 500-800. Zijn kop stelt zijn ' +
      'geldigheid bovendien in PROZA, dus geen van beide lezers van de app haalt er een vloer uit ' +
      '(readMergeBlock null, readGateHeader absent) - hem invoeren zou de mid zijn geldigheidsvloer ' +
      'kosten en daarmee de verankerde gaps blokkeren (UI-1). Casus 1 houdt Koan_M_merged.frd.',
    'woofer_pair_hor0.frd (demoset) tegen de twee per-driver merges':
      'DEZELFDE DATA IN EEN ANDERE VORM: het paarbestand IS de complexe som van ' +
      'woofer_up_hor_0_koan677_merged.frd en woofer_down_hor_0_koan677_merged.frd, nagemeten op max ' +
      '|dSPL| 5,0e-4 dB en max |dfase| 5,0e-4 graden (de afdrukafronding van het bestand zelf). De ' +
      'DEMO draagt het paar als een bestand omdat een demobundel een bestand per driverblok wil (V13); ' +
      'CASUS 1 draagt de twee apart, omdat zijn manifest en zijn lobing-metriek twee bronnen op twee ' +
      'afstanden kennen (V20).',
  },
};

writeFileSync(GOLDEN, `${JSON.stringify(raw, null, 1)}\n`);
console.log(`meetset_2026_09_67L: ${Object.keys(SET).length} bestanden uit ${MAP}`);
for (const [file, p] of Object.entries(parameters)) {
  const q = p as { vervangt: string; geldig_van_Hz?: number; punten?: number; rijen?: number };
  console.log(
    `  ${file}\n      vervangt ${q.vervangt}` +
      (q.geldig_van_Hz !== undefined ? `, geldig vanaf ${q.geldig_van_Hz} Hz` : '') +
      `, ${q.rijen ?? q.punten} punten`,
  );
}
