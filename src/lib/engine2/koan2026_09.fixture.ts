/**
 * M-2 — DE HERMETING VAN 11-09-2026, EN DE WOOFERMERGE DIE ERUIT VOLGT.
 *
 * WAAROM DIT BESTAAT. De augustusmerge van casus 1 kon niet gereproduceerd
 * worden en zijn eigen kop zei waarom: `LF = eigen nearfield + 0.5 x poort
 * (g=0.41)`, terwijl die poortmeting in de repo niet bestond — bevinding I-2,
 * die daar als open punt bleef staan omdat er een verzinnen verboden is. Sander
 * heeft hem op 11-09-2026 gemeten, samen met nieuwe nabije velden per conus en
 * een nieuwe parallelle impedantiesweep. Sinds M-2 is de merge dus een
 * MEETBARE bewerking in plaats van een recept met een ontbrekend ingrediënt.
 *
 * DIT IS DE MEETBASIS VAN CASUS 1 NIET. Casus 1 leest onveranderd M-1. Deze
 * map is een eigen, gedateerde meetset in het frame van de TESTKAST, en wat
 * hier gebeurt verplaatst geen enkele golden reference en geen enkel corpus.
 *
 * ÉÉN HUIS, TWEE LEZERS: `scripts/merge-koan-2026-09-woofers.ts` schrijft de
 * bestanden en `koan2026_09.test.ts` reproduceert ze. De constanten en de
 * bouwstap staan daarom hier en niet in het script — anders zou de test de
 * merge natoetsen die zij zelf opnieuw samenstelt, en dat toetst niets (A3g).
 *
 * ============================================================================
 * DE TOESTAND WAARIN DE NABIJE VELDEN GEMETEN ZIJN
 * ============================================================================
 * Met ÉÉN woofer aangedreven en de andere passief in dezelfde kast. Gemeten op
 * drie onafhankelijke manieren, alle drie binnen die ene sessie:
 *
 *  (1) De parallelcombinatie van de twee losse impedantiesweeps leest bij
 *      28,56 Hz 24,96 Ω waar de parallelle sweep van diezelfde avond 4,00 Ω
 *      meet: 15,90 dB. Boven 80 Hz komen zij binnen 0,6 dB overeen. De extra
 *      piek van 49,9 Ω is de niet-aangedreven conus als passieve radiator.
 *  (2) Het conusminimum hoort bij f_b te liggen. De augustus-NF legt het op
 *      29,30 Hz bij f_b 31,31; deze NF op 26,37 en 25,63 Hz bij f_b 30,40.
 *  (3) De poort hoort bij f_b te maximeren. Deze poort-NF piekt op 41,02 Hz.
 *
 * SANDER HEEFT OP 12-09-2026 BESLOTEN dat er niet opnieuw gemeten wordt en dat
 * hiermee gewerkt wordt. Dat besluit wordt hier uitgevoerd en niet verzwegen:
 * `NF_CONDITION_NOTE` reist mee in `Merge floor reason` van élk geschreven
 * bestand, dus élke lezer stroomafwaarts krijgt haar mee. Niet gecorrigeerd —
 * een modelfactor bovenop een meting in de verkeerde toestand is precies de
 * plausibel-foute laag die A3h verbiedt (F0: de app rapporteert, de ontwerper
 * oordeelt).
 *
 * WAT DE MERGE ER TOCH BRUIKBAAR MAAKT, en het is een MÉTING en geen hoop: de
 * SOM van conus en poort is veel minder gevoelig voor de aandrijftoestand dan
 * elk van beide apart, want waar de conus ontlaadt neemt de poort over. Het
 * conusminimum schuift vier hertz en de poortpiek elf, en de merge komt onder
 * de splice op bijna elk punt binnen 0,5 dB van de augustusmerge uit, met
 * 2,04 dB bij 149 Hz als grootste uitschieter. `koan2026_09.test.ts` pint dat.
 *
 * GEEN VOLUMETRANSFORMATIE. Deze bestanden staan in het frame van de testkast
 * zoals gemeten. De stap naar de echte kast van 67,7 L mist twee dingen: het
 * netto volume van de testkast, waarover de manifesten (53,2 L) en Sander
 * (51 L) elkaar tegenspreken, en de poortgeometrie in de nieuwe kast, zonder
 * welke f_b daar niet volgt.
 *
 * ZIJ LEEST VAN SCHIJF, dus alleen tests en `scripts/` importeren haar.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../parsers/frd.ts';
import { parseLim } from '../parsers/lim.ts';
import { DEFAULT_GATE_TAPER_ALPHA, dataFloorFromGateMs, readGateHeader } from '../xoWindow.ts';
import {
  mergeNearField,
  mergedFileName,
  portWeight,
  renderMergedFrd,
  suggestValidFrom,
  type NfMergeResult,
} from '../nfMerge.ts';

/** De map met de ruwe hermeting en de merges die eruit volgen. */
export const KOAN_2026_09_NAME = 'koan_2026-09_testkast';
export const KOAN_2026_09_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'test-fixtures',
  KOAN_2026_09_NAME,
);
/** Het VERRE veld is het bestaande en komt uit casus 1; het is niet aangeraakt. */
export const CASUS1_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-fixtures', 'casus1');

/* ==================================================================== *
 * Benoemde constanten — elk met zijn herkomst
 * ==================================================================== */

/**
 * De splice-band die Sander in augustus gebruikte en die M-1 verbatim overnam.
 * NIET de afgeleide band: `suggestSpliceBand` levert 455–576 Hz en zegt zelf
 * dat 800 Hz boven 0,95 × ka = 1 van een 255 cm²-conus reikt. Dat is een
 * ontwerpersoordeel en geen fout die de app mag overrulen (F0).
 */
export const SPLICE_BAND_HZ: readonly [number, number] = [500, 800];

/**
 * Het baffle-step-MODEL van casus 1: eerste-orde shelf, 6 dB op 440 Hz, als
 * minimumfase op de NF-helft. Gesteld bij M-1, hier onveranderd. Het is een
 * MODEL — de teardrop-vorm is nooit gemeten.
 */
export const STEP = { hz: 440, depthDb: 6 } as const;

/** De gemeten kastbreedte van casus 1, mm; levert de kruiscontrole op de step. */
export const CABINET_WIDTH_MM = 260;
/** c / (π · breedte) — wat de kastbreedte alleen zou geven. */
export const CABINET_STEP_HZ = 343000 / (Math.PI * CABINET_WIDTH_MM);

/** D = 2·√(S/π) met S_d 255 cm² per driver uit de driverkaart: 180,2 mm. */
export const CONE_DIA_MM = 2 * Math.sqrt(255 / Math.PI) * 10;

/**
 * De mondmiddellijn van de poort, mm. TERUGGEREKEND uit Sanders augustuskop,
 * die `g=0.41, 50/50 over beide woofers` noteert: 0,41 × 180,2 ≈ 74 mm. Het is
 * dus zijn gestelde weging in de eenheid die `portWeight` vraagt, en geen
 * tweede meting. Zodra de mond gemeten is hoort dit getal daaruit te komen.
 */
export const PORT_MOUTH_DIA_MM = 74;

/** Beide woofers delen één poort, dus elk draagt de helft ervan. */
export const PORT_SHARED_BY = 2;

/** S_d per driver, cm², uit de driverkaart van casus 1. */
export const SD_CM2 = 255;

/** De datum die in `Merge status` van elk geschreven bestand komt. */
export const MADE_ON = '2026-09-12';

/**
 * De aandrijftoestand van de nabije velden, in één regel, meegedragen in
 * `Merge floor reason` van élk geschreven bestand. Zie de kop van dit bestand
 * voor de drie metingen waarop zij rust. Eén regel, geen `=`, want een
 * blokveld is één regel en een `=` erin zou als de volgende veldnaam lezen.
 */
export const NF_CONDITION_NOTE =
  'NF CONDITION: measured 11-09-2026 with ONE woofer driven and the other passive in the same box. ' +
  'Measured three ways: the two per-driver sweeps combined in parallel read 24.96 ohm at 28.56 Hz where ' +
  'the same session s parallel sweep measures 4.00 ohm, a 15.90 dB difference; the cone minimum sits 4-5 Hz ' +
  'below f_b; the port peak sits 0.43 oct above f_b. In service both woofers are driven, so below roughly ' +
  '80 Hz the cone velocities are NOT the operating ones. STATED, NOT CORRECTED, by the designer s decision ' +
  'of 12-09-2026; the sum of cone and port is far less sensitive to this than either part alone.';

/* ==================================================================== *
 * De wegen
 * ==================================================================== */

export interface KoanWay {
  label: string;
  /** Bestaand ver veld uit casus 1. */
  farFile: string;
  /** Nieuw nabij veld uit de hermeting. */
  nearFile: string;
}

export const KOAN_2026_09_WAYS: readonly KoanWay[] = Object.freeze([
  { label: 'woofer boven (W1)', farFile: 'woofer_up_hor_0.txt', nearFile: 'woofer_up_near.txt' },
  { label: 'woofer onder (W2)', farFile: 'woofer_down_hor_0.txt', nearFile: 'woofer_down_near.txt' },
]);

/** Het nieuwe poort-nabijveld: het bestand dat I-2 miste. */
export const PORT_FILE = 'port_near.txt';
/** De nieuwe parallelle sweep — de enige die de bedrijfstoestand meet. */
export const PARALLEL_LIM = 'woofers_parallel.lim';

/* ==================================================================== *
 * Lezen en bouwen
 * ==================================================================== */

export const readNew = (name: string): string => readFileSync(join(KOAN_2026_09_DIR, name), 'utf8');
export const readCasus1 = (name: string): string => readFileSync(join(CASUS1_DIR, name), 'utf8');

/** De poortweging uit de geometrie; gooit liever dan iets aan te nemen. */
export function koanPortWeight(): { weight: number; note: string } {
  const pw = portWeight({ portDiaMm: PORT_MOUTH_DIA_MM, coneDiaMm: CONE_DIA_MM, sharedBy: PORT_SHARED_BY });
  if (pw.weight === null) throw new Error(`de poort kan niet gewogen worden: ${pw.note}`);
  return { weight: pw.weight, note: pw.note };
}

/**
 * f_b uit de NIEUWE parallelle sweep: het zadel tussen de twee reflexpieken.
 * Afgelezen en niet getypt, zodat een andere sweep een ander getal geeft.
 */
export function koanBoxTuneHz(): { fbHz: number; ohm: number } {
  const b = readFileSync(join(KOAN_2026_09_DIR, PARALLEL_LIM));
  const m = parseLim(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  const lo = m.freq.map((f, i) => ({ f, z: m.magnitude[i] })).filter((r) => r.f > 18 && r.f < 60);
  let best: { f: number; z: number } | null = null;
  for (let i = 1; i < lo.length - 1; i++) {
    if (lo[i].z < lo[i - 1].z && lo[i].z <= lo[i + 1].z && (best === null || lo[i].z < best.z)) best = lo[i];
  }
  if (!best) throw new Error(`${PARALLEL_LIM}: geen reflexzadel in 18–60 Hz — is dit een parallelle sweep?`);
  return { fbHz: best.f, ohm: best.z };
}

export interface KoanMergeBuild {
  way: KoanWay;
  /** De vloer van het VERRE veld, uit zijn eigen kop. */
  farFloorHz: number;
  merge: NfMergeResult;
  validFromHz: number;
  validFromReason: string;
  /** De naam waaronder het merge-bestand geschreven wordt. */
  outFile: string;
  /** De volledige bestandsinhoud, klaar om te schrijven of te vergelijken. */
  text: string;
}

/**
 * DE MERGE VAN ÉÉN WEG. Deze functie IS de bewerking: het script schrijft haar
 * uitvoer weg en de test vergelijkt haar met wat er op schijf staat.
 */
export function buildKoanMerge(way: KoanWay): KoanMergeBuild {
  const farText = readCasus1(way.farFile);
  const nearText = readNew(way.nearFile);
  const portText = readNew(PORT_FILE);
  const pw = koanPortWeight();

  const gate = readGateHeader(farText);
  if (gate.kind !== 'parsed') {
    throw new Error(
      `${way.farFile}: de kop stelt geen leesbaar venster (${gate.kind}) — de merge kan zijn vloer niet afleiden.`,
    );
  }
  /* `dataFloorFromGateMs` geeft `null` op een venster dat geen lengte heeft. Dat
   * kan hier niet gebeuren — `gate.kind === 'parsed'` hierboven garandeert een
   * positieve `gateMs` — maar het wordt afgevangen in plaats van weggecast: een
   * merge zonder vloer van het verre veld heeft geen splice-onderkant. */
  const farFloorHz = dataFloorFromGateMs(gate.gateMs, gate.alpha ?? DEFAULT_GATE_TAPER_ALPHA);
  if (farFloorHz === null) {
    throw new Error(`${way.farFile}: venster gelezen (${gate.gateMs} ms) maar er volgt geen vloer uit.`);
  }

  const merge = mergeNearField({
    farText,
    farName: way.farFile,
    nearText,
    nearName: way.nearFile,
    portText,
    portName: PORT_FILE,
    portWeight: pw.weight,
    portNote: pw.note,
    spliceBandHz: [SPLICE_BAND_HZ[0], SPLICE_BAND_HZ[1]],
    step: { hz: STEP.hz, depthDb: STEP.depthDb },
    cabinetStepHz: CABINET_STEP_HZ,
  });
  if (merge === null) throw new Error(`${way.label}: de merge leverde niets — een van de bestanden parseert niet.`);

  const near = parseFrd(nearText);
  const vf = suggestValidFrom({
    enclosure: 'reflex',
    boxTuneHz: koanBoxTuneHz().fbHz,
    portSummed: true,
    nearLowestHz: near.freq[0],
    gridLowestHz: merge.freq[0],
    farFloorHz,
  });
  /* In een LOKALE const, niet als `vf.hz`: TypeScript verliest de narrowing van
   * een property zodra er een functie tussen de controle en het gebruik staat,
   * en `renderMergedFrd` hieronder is die functie. */
  const validFromHz = vf.hz;
  if (validFromHz === null) throw new Error(`${way.label}: de geldigheidsvloer moet gesteld worden — ${vf.reason}`);

  const validFromReason = `${vf.reason} ${NF_CONDITION_NOTE}`;
  const outFile = mergedFileName(way.farFile);
  const text = renderMergedFrd({
    merge,
    farName: way.farFile,
    nearName: way.nearFile,
    portName: PORT_FILE,
    portNote: pw.note,
    spliceBandHz: SPLICE_BAND_HZ,
    step: { hz: STEP.hz, depthDb: STEP.depthDb },
    cabinetStepHz: CABINET_STEP_HZ,
    validFromHz,
    validFromReason,
    madeOn: MADE_ON,
    branchLabel: way.label,
  });
  return { way, farFloorHz, merge, validFromHz, validFromReason, outFile, text };
}
