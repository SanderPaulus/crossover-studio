/**
 * DE CORPORA VAN CASUS 1 ALS ADRESSEERBARE VERZAMELING, plus de LEESREGEL die
 * bij elke vóór/ná-vergelijking ertussen hoort.
 *
 * Waarom dit bestand bestaat (V47-nazorg, 01-09-2026). `compare-corpora.ts`
 * droeg de corpuskaart, het instellingenblok waarmee beide helften gemeten
 * worden en de statistiek eronder alle drie zelf. Zolang niemand anders die
 * tabel las was dat één implementatie met één lezer. Zodra een TEST dezelfde
 * getallen moet kunnen reproduceren zijn het er twee, en twee beschrijvingen
 * van één ding lopen uiteen — V21's les, en de reden dat `impedanceFloor.ts`,
 * `phaseAdmission.ts`, `targetLevel.ts` en `protectionDeficit.ts` bestaan.
 * Wat hier woont is dus precies wat beide lezers delen: welke netlist bij
 * welke kandidaat hoort, langs welk pad een netlist gemeten wordt, en hoe een
 * gemiddelde over twee ongelijke corpora gelezen moet worden.
 *
 * DE LEESREGEL, en zij is de aanleiding. Een corpusgemiddelde is een
 * gemiddelde over de netlists die het corpus TOEVALLIG bevat, en een eis die
 * netlists verwijdert verandert dat gemiddelde zonder één netwerk aan te
 * raken. Bij V47 las de W-M-fase daardoor als winst (25,3° → 13,1°) terwijl
 * de netlists die in BEIDE corpora staan er niet beter maar iets slechter op
 * werden, en de dissipatie als verlies terwijl diezelfde netlists verbeterden.
 * Beide keren was het compositie en geen aankoop. Daarom staat naast elk
 * corpusgemiddelde de GEPAARDE lezing: hetzelfde getal over uitsluitend de
 * kandidaten die beide corpora dragen, met het aantal paren erbij. Het
 * corpusgemiddelde beschrijft het VELD; de gepaarde delta beschrijft de
 * INGREEP, en alleen de tweede mag als verbetering of verslechtering gelezen
 * worden.
 *
 * Het leest van schijf en heet daarom `*.fixture.ts`: het wordt alleen door
 * tests en scripts geïmporteerd, nooit door de app (`browserSafe.test.ts`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1AmpMinLoadOhm,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
  type GoldenRefs,
} from './casus1.fixture.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
} from './casus1V2.fixture.ts';
import { buildReport, type EngineV2Report, type ReportSettings } from './report.ts';
import type { Manifest } from './ingest/manifest.ts';
import type { MeasurementFile } from './ingest/derive.ts';
import { ctcKey, type Geometry } from './metrics/types.ts';

/** Het vermogen waarbij M-A's wattkolom wordt afgelezen — een aanname van de
 *  vergelijking en geen projectgetal: de fractie zelf is schaalvrij. */
/* V50 — from its one home in the manifest; the literal 100 is gone. A corpus
 * comparison without a stated continuous power prints no watts at all (F0). */
const CORPUS_POWER_W: number = (() => {
  const w = CASUS1_CONTINUOUS_POWER_W;
  if (w === null) throw new Error('casus 1 states no continuous amplifier power (gestelde_eisen.versterker_continu_vermogen_W)');
  return w;
})();

/** De orde per paar waarmee élke corpusmeting haar rapport bouwt. Casus 1 is
 *  door de hele reeks LR4/LR4 getuned; hij staat hier zodat beide helften van
 *  een vergelijking hem gegarandeerd delen. */
const CORPUS_ORDER = 4;
/**
 * Het verticale waarnemingsvenster waarover de lobing-SYNTHESE (M-F-eind)
 * gemeten wordt, graden — hetzelfde venster als onder de klasse-B-referentie
 * `kandidaten.*.lobing_eind_dip_15gr` en als `goldenCasus1.test.ts` stelt.
 * Zonder venster staat de synthese UIT (het rapport zegt dat zelf), en dan is
 * de kolom in `compare-corpora.ts` leeg; sinds V47b staat zij erin omdat de
 * aandrijfeis het M-T-veld naar lagere kruispunten opent en dáár de verticale
 * som het eerst iets kost. Een instelling en geen oordeel: casus 1 stelt geen
 * lobinggrens (P4), en de synthese is per A4 de enige autoriteit over lobing.
 */
const CORPUS_VERTICAL_WINDOW_DEG: [number, number] = [-15, 15];

/** Wat de generator van één kandidaat opschreef, voor zover een vergelijking
 *  het leest. Alleen het LEVENDE corpus heeft dit: een gedateerd corpus is een
 *  verzameling bestanden en niets meer. */
export interface CorpusOutcome {
  label: string;
  geweigerd_door: string[];
  verwerping: {
    regels: string[];
    reden: string;
    geweigerde_tune: Record<string, number | null> | null;
  } | null;
  poorten: { poort: string; waarde: number | null; geslaagd: boolean }[];
}

/** Eén adresseerbaar corpus: onder welke netlist-sleutel elke kandidaat is
 *  bevroren. De KOPPELING is de kandidaat (een paar overnamefrequenties met
 *  hun orden) en nooit het bestandsnummer — `KAND-V2-3` en `V45-KAND-3` zijn
 *  de derde rij van twee verschillende shortlists en hebben niets met elkaar
 *  te maken. */
export interface Corpus {
  name: string;
  byCandidate: Map<string, string>;
  outcomes: CorpusOutcome[] | null;
  order: string[];
}

/**
 * De gedateerde corpora, onder de id die een aanroeper typt.
 *
 * Een kaart en geen keten `if`s, en het is dezelfde les die
 * `goldenClassification.test.ts` bij V33 heeft moeten leren: een met de hand
 * bijgehouden familielijst is wat er stukgaat zodra iemand een corpus toevoegt
 * en niet terugkomt. Eén regel per corpus, op één plek, naast het blok dat hij
 * noemt.
 */
export const DATED_CORPORA: Record<string, { block: string; name: string }> = {
  v30: { block: 'v30_corpus', name: 'V30' },
  v32: { block: 'v32_corpus', name: 'V32' },
  v33sweep: { block: 'v33_sweep_corpus', name: 'V33-sweep' },
  v33: { block: 'v33_corpus', name: 'V33' },
  v34: { block: 'v34_corpus', name: 'V34' },
  v37: { block: 'v37_corpus', name: 'V37' },
  v38fix: { block: 'v38fix_corpus', name: 'V38-fix' },
  v41: { block: 'v41_corpus', name: 'V41' },
  v42: { block: 'v42_corpus', name: 'V42' },
  v43: { block: 'v43_corpus', name: 'V43' },
  v44: { block: 'v44_corpus', name: 'V44' },
  v45: { block: 'v45_corpus', name: 'V45' },
  v47: { block: 'v47_corpus', name: 'V47' },
  v48: { block: 'v48_corpus', name: 'V48' },
  v49: { block: 'v49_corpus', name: 'V49' },
  v50: { block: 'v50_corpus', name: 'V50' },
  v51: { block: 'v51_corpus', name: 'V51' },
};

interface Herkomst {
  bestanden: { name: string; label: string }[];
  kandidaat_uitkomst: CorpusOutcome[];
}

export function loadHerkomst(): Herkomst {
  return JSON.parse(
    readFileSync(join(CASUS1_DIR, '..', 'casus1_v2_herkomst.json'), 'utf-8'),
  ) as Herkomst;
}

function datedCorpus(block: string, name: string, golden: GoldenRefs): Corpus {
  const b = (
    golden.manifest_en_geometrie as unknown as Record<
      string,
      { bestanden: { naam: string; kandidaat: string }[] } | undefined
    >
  )[block];
  if (!b) throw new Error(`the case book has no ${block} — nothing to compare against`);
  return {
    name,
    byCandidate: new Map(b.bestanden.map((x) => [x.kandidaat, x.naam])),
    outcomes: null,
    order: b.bestanden.map((x) => x.kandidaat),
  };
}

function liveCorpus(): Corpus {
  const herkomst = loadHerkomst();
  return {
    name: 'live',
    byCandidate: new Map(herkomst.bestanden.map((b) => [b.label, b.name.replace(/-/g, '_')])),
    outcomes: herkomst.kandidaat_uitkomst,
    order: herkomst.kandidaat_uitkomst.map((o) => o.label),
  };
}

export function corpusOf(id: string, golden: GoldenRefs = loadGolden()): Corpus {
  if (id === 'live') return liveCorpus();
  const d = DATED_CORPORA[id];
  if (d) return datedCorpus(d.block, d.name, golden);
  throw new Error(
    `unknown corpus "${id}" — use ${[...Object.keys(DATED_CORPORA), 'live'].join(', ')}`,
  );
}

/**
 * De meetbank: de manifest-, bestands- en geometrie-invoer één keer geladen,
 * plus het instellingenblok waarmee ÉLKE netlist van élke corpushelft gemeten
 * wordt.
 *
 * Sinds V45 gaat dat door de DOELCURVE van het ontwerp en niet door `flat`.
 * Beide helften van een vergelijking gaan door hetzelfde pad — dat is de regel
 * die deze vergelijking altijd al volgde — maar `venster` en `RMS` zijn
 * afwijkingen van een REFERENTIE, en die referentie is sinds A5e.2 niet
 * horizontaal. Wie de oude lezing nodig heeft neemt haar met
 * `targetCurve: FLAT_TARGET`.
 */
export interface CorpusBank {
  golden: GoldenRefs;
  manifest: Manifest;
  files: MeasurementFile[];
  geometry: Geometry;
  settings: ReportSettings;
  floorOhm: number | null;
  powerW: number;
  report(key: string): EngineV2Report;
}

export function corpusBank(golden: GoldenRefs = loadGolden()): CorpusBank {
  const manifest = casus1Manifest(golden);
  const files = casus1Files(manifest);
  const geometry = casus1Geometry(golden);
  const floorOhm = casus1AmpMinLoadOhm(golden);
  const settings: ReportSettings = {
    amplifierPowerW: CORPUS_POWER_W,
    orderByPair: {
      [ctcKey('woofer', 'mid')]: CORPUS_ORDER,
      [ctcKey('mid', 'tweeter')]: CORPUS_ORDER,
    },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: CASUS1_TARGET_CURVE,
    verticalWindowDeg: CORPUS_VERTICAL_WINDOW_DEG,
    ...(floorOhm !== null ? { ampMinLoadOhm: floorOhm } : {}),
    /* V49 — the excursion inputs, so the M-C column of a corpus comparison
     * reads the limit the gate actually judged on. */
    ...CASUS1_EXCURSION,
    /* V50 — the per-way M-C figure and the buildability inputs, for the same
     * reason: the columns read what the gate read. */
    ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
      ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
      : {}),
    ...CASUS1_BUILDABILITY,
    /* V51 — the wiring per way and the level-work requirement, so the
     * level-work column of a corpus comparison reads the rule the corpus was
     * generated under. Phase and dissipation do not read them (measured:
     * `corpusPairing.test.ts` is unchanged). */
    ...CASUS1_LEVEL_WORK_SETTINGS,
  };
  return {
    golden,
    manifest,
    files,
    geometry,
    settings,
    floorOhm,
    powerW: CORPUS_POWER_W,
    report: (key: string) =>
      buildReport({
        manifest,
        files,
        filter: casus1Filter(key, manifest, files, golden),
        geometry,
        settings,
      }),
  };
}

/**
 * Elke kandidaat die één van beide corpora kent, in de volgorde waarin het
 * NIEUWERE corpus ze draaide — zodat een tabel leest als één veld met gaten en
 * niet als twee lijsten. Een kandidaat die in het ene corpus staat en in het
 * andere niet is een RIJ en geen gat: dat is juist de bevinding.
 */
export function unionOfCandidates(before: Corpus, after: Corpus): string[] {
  const labels = [...after.order];
  for (const label of before.order) if (!labels.includes(label)) labels.push(label);
  return labels;
}

/** De kandidaten die BEIDE corpora dragen, in dezelfde volgorde. Dit is de
 *  verzameling waarover een gepaarde delta gaat. */
export function pairedCandidates(before: Corpus, after: Corpus): string[] {
  return unionOfCandidates(before, after).filter(
    (l) => before.byCandidate.has(l) && after.byCandidate.has(l),
  );
}

/** Eén kandidaat, twee metingen. */
export interface CorpusPair<T> {
  label: string;
  before: T;
  after: T;
}

/**
 * De afronding waarmee élke kolom van een corpusvergelijking wordt afgelezen.
 *
 * Zij staat hier en niet in het script omdat de gemiddelden erop rusten: zij
 * worden over de AFGERONDE rijen genomen, dus wie hem verandert verandert de
 * getallen in het casusboek. Eén regel, twee lezers.
 */
export function round2(v: number | null | undefined): number | null {
  return v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));
}

/** Het corpusgemiddelde: over alles wat gemeten kon worden, ongeacht of de
 *  andere helft die kandidaat kent. Beschrijft het VELD. */
export function mean(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => x !== null && x !== undefined && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export interface PairedDelta {
  before: number | null;
  after: number | null;
  /** Het aantal paren waarop deze twee getallen rusten — nooit weglaten: een
   *  gepaarde delta over één paar is een anekdote en hoort als zodanig te
   *  lezen. */
  n: number;
}

/**
 * DE GEPAARDE DELTA: hetzelfde gemiddelde, maar uitsluitend over de
 * kandidaten die in beide corpora een MEETBARE waarde hebben.
 *
 * Een paar waarvan één helft `null` is telt aan géén van beide kanten mee.
 * Anders zou de vergelijking opnieuw twee verschillende verzamelingen naast
 * elkaar zetten — precies het defect dat zij moet wegnemen, één laag dieper.
 */
export function pairedDelta<T>(
  pairs: CorpusPair<T>[],
  pick: (row: T) => number | null | undefined,
): PairedDelta {
  const b: number[] = [];
  const a: number[] = [];
  for (const p of pairs) {
    const vb = pick(p.before);
    const va = pick(p.after);
    if (vb === null || vb === undefined || !Number.isFinite(vb)) continue;
    if (va === null || va === undefined || !Number.isFinite(va)) continue;
    b.push(vb);
    a.push(va);
  }
  return { before: mean(b), after: mean(a), n: b.length };
}
