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
 * DE VOLUMETRANSFORMATIE STAAT ERNAAST EN IS APART GEMARKEERD. Sander stelde op
 * 12-09-2026 het netto volume van de testkast (53,2 L), dat van de echte kast
 * (67,7 L) en dat de POORT ONGEWIJZIGD blijft. Daarmee volgt de afstemming daar
 * uit de natuurkunde en hoeft niets aangenomen te worden. De transformatie zelf
 * woont in `ventedBoxTransform.ts`; hier staat alleen de wiring. Elk
 * getransformeerd bestand draagt MODEL TRANSFORM in zijn kop, en het verre veld
 * boven de splice blijft onaangeroerde meting.
 *
 * ZIJ LEEST VAN SCHIJF, dus alleen tests en `scripts/` importeren haar.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from '../parsers/frd.ts';
import { parseLim } from '../parsers/lim.ts';
import { resampleImpedance } from '../dsp.ts';
import { abs, arg, cplx, mul, type Complex } from '../complex.ts';
import {
  VENTED_BOX_TRANSFORM_VERSION,
  blockedImpedance,
  fitBlockedImpedance,
  fitPortConeRatio,
  samePortInVolume,
  volumeTransfer,
  type BlockedFit,
  type DriverFacts,
  type PortConeFit,
  type VentedBox,
} from '../ventedBoxTransform.ts';
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
 * DE SPLICE-BAND, EN ZIJ IS BIJ M-2 VERPLAATST OP SANDERS EIGEN GRENS.
 *
 * Augustus en M-1 gebruikten 500–800 Hz. Sander stelde op 12-09-2026 dat het
 * VERRE veld betrouwbaar is tot 400 Hz, dus dat daar gesplicet mag worden, en
 * dat is aantoonbaar beter — gemeten op alle zes de kandidaatbanden:
 *
 *   band        W1 p95 / max      W2 p95 / max
 *   400–550     0,96 / 1,19 dB    1,45 / 1,79 dB
 *   455–576     1,09 / 1,31       1,23 / 1,45
 *   500–800     1,49 / 2,55       3,50 / 4,22     ← augustus
 *
 * Op W2 halveert het residu en de piekfout gaat van 4,22 naar 1,79 dB. De
 * reden staat in `suggestSpliceBand` zelf: 800 Hz reikt boven 0,95 × ka = 1
 * (606 Hz) van een 255 cm²-conus, waar een nabij veld de conus niet meer als
 * één bron vertegenwoordigt. Het niveaufit van W2 wisselt daar ook van teken
 * (+2,75 → −0,81 dB), wat op zichzelf al zegt dat de oude band in de problemen
 * zat.
 *
 * BEIDE RANDEN ZIJN GETALLEN DIE HET PROJECT AL STELT: 400 Hz is Sanders
 * 1/T-grens van het gepoorte verre veld (de gate leest 397 Hz), en 550 Hz is
 * het geldigheidsplafond van de woofer dat élk manifest van deze casus noemt.
 * Niets is hier gekozen om het residu te laten zakken.
 */
export const SPLICE_BAND_HZ: readonly [number, number] = [400, 550];

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

/* ==================================================================== *
 * M-2 — DE VOLUMETRANSFORMATIE NAAR DE ECHTE KAST
 *
 * De kast meet zichzelf op twee plaatsen en de driver valt er grotendeels uit;
 * `ventedBoxTransform.ts` draagt de natuurkunde en de motivering. Hier staat
 * uitsluitend de WIRING naar de gemeten bestanden van deze sessie, plus de twee
 * volumes die Sander gesteld heeft.
 * ==================================================================== */

/** Netto volume van de testkast, litres. Gesteld door Sander op 12-09-2026. */
export const TEST_VOLUME_L = 53.2;
/** Netto volume van de echte Koan-kast, litres. Gesteld door Sander. */
export const REAL_VOLUME_L = 67.7;

/**
 * `R_e` per driver, Ω. Datasheet, en de motionele fit van augustus landt er
 * onafhankelijk op (2,896 Ω voor het paar is 5,79 per driver).
 */
export const RE_PER_DRIVER_OHM = 5.8;
/** Krachtfactor per driver, Tm. Datasheet. */
export const BL_TM = 10.45;

/**
 * De band waarop de poort/conus-verhouding gefit wordt. De onderkant is waar het
 * nabije veld nog signaal heeft; de bovenkant is waar de poortbijdrage onder een
 * tiende zakt en er niets meer te fitten valt — daarboven meet men buismodes en
 * ruis, en het residu loopt dan op zonder dat de fit slechter wordt.
 */
export const PORT_FIT_BAND_HZ: readonly [number, number] = [8, 70];

/** De HF-staart waarop `Z_b` gefit wordt: daar is de motionele term verwaarloosbaar. */
export const BLOCKED_FIT_BAND_HZ: readonly [number, number] = [3000, 15000];

const DEG = Math.PI / 180;

/** Eén FRD als frequentie, dB en graden — de vorm die de fits vragen. */
function frdOf(file: string) {
  const m = parseFrd(readNew(file));
  return { freq: m.freq, spl: m.spl, phase: m.phase };
}

/** De gemeten parallelle sweep als complexe impedantie op haar eigen raster. */
export function koanMeasuredImpedance(): { freq: number[]; z: Complex[] } {
  const b = readFileSync(join(KOAN_2026_09_DIR, PARALLEL_LIM));
  const m = parseLim(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  return {
    freq: m.freq,
    z: m.freq.map((_, i) => cplx(m.magnitude[i] * Math.cos(m.phase[i] * DEG), m.magnitude[i] * Math.sin(m.phase[i] * DEG))),
  };
}

export interface KoanBoxFit {
  /** De kast zoals de poort/conus-verhouding haar meet. */
  box: VentedBox;
  fit: PortConeFit;
  /** De afstemming uit het impedantiezadel — een ONAFHANKELIJKE tweede route. */
  saddleHz: number;
  /** Het verschil tussen de twee routes, als fractie. */
  agreement: number;
  blocked: BlockedFit;
}

/**
 * DE KAST UIT HAAR EIGEN METINGEN. `f_b` en `Q_l` uit de poort/conus-verhouding,
 * waarin geen drivergrootheid voorkomt; `Z_b` uit de HF-staart. De afstemming
 * uit het impedantiezadel staat ernaast als tweede, onafhankelijke route, en
 * `agreement` is het verschil — een lezer hoort te zien hoe goed de twee het
 * eens zijn voordat hij de transformatie gebruikt.
 */
export function fitKoanBox(): KoanBoxFit {
  const cone = frdOf(KOAN_2026_09_WAYS[0].nearFile);
  const port = frdOf(PORT_FILE);
  const g = PORT_MOUTH_DIA_MM / CONE_DIA_MM;
  const [lo, hi] = PORT_FIT_BAND_HZ;
  const ratio: { freqHz: number; value: Complex }[] = [];
  for (const [i, f] of cone.freq.entries()) {
    if (f < lo || f > hi) continue;
    const a = Math.pow(10, (port.spl[i] - cone.spl[i]) / 20) * g;
    let ph = port.phase[i] - cone.phase[i];
    while (ph > 180) ph -= 360;
    while (ph < -180) ph += 360;
    ratio.push({ freqHz: f, value: cplx(a * Math.cos(ph * DEG), a * Math.sin(ph * DEG)) });
  }
  const fit = fitPortConeRatio(ratio, { tuningHz: [20, 40], leakageQ: [1, 15], scale: [0.3, 5] });
  if (!fit) throw new Error('fitKoanBox: te weinig punten in de poortfitband.');

  const z = koanMeasuredImpedance();
  const [blo, bhi] = BLOCKED_FIT_BAND_HZ;
  const tail = z.freq
    .map((f, i) => ({ freqHz: f, magnitudeOhm: 2 * abs(z.z[i]) }))
    .filter((t) => t.freqHz >= blo && t.freqHz <= bhi);
  const blocked = fitBlockedImpedance(tail, RE_PER_DRIVER_OHM, { coefficient: [5e-4, 0.03], exponent: [0.5, 1] });
  if (!blocked) throw new Error('fitKoanBox: te weinig punten in de HF-staart.');

  const saddleHz = koanBoxTuneHz().fbHz;
  return {
    box: { volumeL: TEST_VOLUME_L, tuningHz: fit.tuningHz, leakageQ: fit.leakageQ },
    fit,
    saddleHz,
    agreement: Math.abs(fit.tuningHz - saddleHz) / saddleHz,
    blocked,
  };
}

/** Wat de driverkaart aan de transformatie bijdraagt, en het is drie getallen. */
export function koanDriverFacts(): DriverFacts {
  return { sdM2: SD_CM2 * 1e-4, blTm: BL_TM, count: PORT_SHARED_BY };
}

/**
 * Eén nabij veld naar het frame van de echte kast, als FRD-TEKST op hetzelfde
 * raster. De kop van het bronbestand blijft staan en er komt één regel bij die
 * zegt wat er gebeurd is; de datarijen zijn de enige die bewegen.
 *
 * De impedantie wordt op het NF-raster geïnterpoleerd met vlakke randen. Onder
 * 10 Hz is dat een gehouden waarde, en dat is zichtbaar gemaakt in de regel:
 * de merge draagt daar toch niets, want het raster van het verre veld begint op
 * 20,5 Hz.
 */
export function transformNearFieldText(
  file: string,
  channel: 'cone' | 'port',
  boxFit: KoanBoxFit,
  toVolumeL: number,
): string {
  const src = readNew(file);
  const m = parseFrd(src);
  const to = samePortInVolume(boxFit.box, toVolumeL);
  const z = koanMeasuredImpedance();
  const zOn = resampleImpedance(z.freq, z.z.map(abs), z.z.map((c) => (arg(c) * 180) / Math.PI), m.freq);
  /* `clamped` is hier WAAR en dat is bedoeld: het NF-raster begint op 5,1 Hz en
   * de sweep op 10,1, dus onder 10 Hz wordt de impedantie vlak gehouden. De
   * merge draagt daar niets — het raster van het verre veld begint op 20,5 Hz. */
  const driver = koanDriverFacts();

  const spl: number[] = [];
  const phase: number[] = [];
  for (const [i, f] of m.freq.entries()) {
    const zOne = mul(cplx(driver.count), zOn.z[i]);
    const zb = blockedImpedance(f, RE_PER_DRIVER_OHM, boxFit.blocked);
    const t = volumeTransfer(f, zOne, zb, boxFit.box, to, driver);
    const h = channel === 'cone' ? t.cone : t.port;
    spl.push(m.spl[i] + 20 * Math.log10(abs(h)));
    let p = m.phase[i] + (arg(h) * 180) / Math.PI;
    while (p > 180) p -= 360;
    while (p < -180) p += 360;
    phase.push(p);
  }

  const head = src
    .split('\n')
    .filter((l) => l.trimStart().startsWith('*'))
    .concat([
      `* TRANSFORMED to ${toVolumeL} L by Crossover Studio (${VENTED_BOX_TRANSFORM_VERSION}), channel ${channel}`,
      `* basis: ${file} measured in ${boxFit.box.volumeL} L, f_b ${boxFit.box.tuningHz.toFixed(2)} Hz, Q_l ${boxFit.box.leakageQ.toFixed(2)}`,
      `* target: ${toVolumeL} L with the SAME port, so f_b ${to.tuningHz.toFixed(2)} Hz and Q_l ${to.leakageQ.toFixed(2)}`,
      `* box measured itself: f_b from the port/cone ratio ${boxFit.fit.tuningHz.toFixed(2)} Hz against ${boxFit.saddleHz.toFixed(2)} Hz from the impedance saddle (${(boxFit.agreement * 100).toFixed(1)} % apart); Z_b = R_e ${RE_PER_DRIVER_OHM} + ${boxFit.blocked.coefficient.toFixed(5)} (jw)^${boxFit.blocked.exponent.toFixed(3)}, tail residual ${boxFit.blocked.residualDb.toFixed(3)} dB`,
      `* MODEL: this is a model transform, not a measurement in the real cabinet. Below 10 Hz the impedance is held flat; the merge carries nothing there.`,
    ]);
  const fmt = (v: number, d: number, w: number) => v.toFixed(d).padStart(w);
  const rows = m.freq.map((f, i) => `${fmt(f, 4, 12)}${fmt(spl[i], 3, 10)}${fmt(phase[i], 3, 10)}`);
  return [...head, 'Freq[Hz]  dBSPL  Phase[Deg]', ...rows].join('\n') + '\n';
}

/** De merge van één weg IN HET FRAME VAN DE ECHTE KAST. */
export function buildKoanTransformedMerge(way: KoanWay, boxFit: KoanBoxFit, toVolumeL: number): KoanMergeBuild {
  const farText = readCasus1(way.farFile);
  const nearText = transformNearFieldText(way.nearFile, 'cone', boxFit, toVolumeL);
  const portText = transformNearFieldText(PORT_FILE, 'port', boxFit, toVolumeL);
  const pw = koanPortWeight();
  const gate = readGateHeader(farText);
  if (gate.kind !== 'parsed') throw new Error(`${way.farFile}: geen leesbaar venster (${gate.kind}).`);
  const farFloorHz = dataFloorFromGateMs(gate.gateMs, gate.alpha ?? DEFAULT_GATE_TAPER_ALPHA);
  if (farFloorHz === null) throw new Error(`${way.farFile}: venster gelezen maar geen vloer.`);

  const merge = mergeNearField({
    farText,
    farName: way.farFile,
    nearText,
    nearName: `${way.nearFile} → ${toVolumeL} L`,
    portText,
    portName: `${PORT_FILE} → ${toVolumeL} L`,
    portWeight: pw.weight,
    portNote: pw.note,
    spliceBandHz: [SPLICE_BAND_HZ[0], SPLICE_BAND_HZ[1]],
    step: { hz: STEP.hz, depthDb: STEP.depthDb },
    cabinetStepHz: CABINET_STEP_HZ,
  });
  if (merge === null) throw new Error(`${way.label}: de getransformeerde merge leverde niets.`);

  const to = samePortInVolume(boxFit.box, toVolumeL);
  const validFromHz = merge.freq[0];
  const validFromReason =
    `the near field carries this branch down to ${validFromHz.toFixed(1)} Hz and the port is summed into it, ` +
    `so the merge is the whole radiating system through its tuning (f_b ${to.tuningHz.toFixed(1)} Hz MODELLED for ${toVolumeL} L); ` +
    `the far-field gate (${farFloorHz.toFixed(0)} Hz) applies only above the splice. ` +
    `MODEL TRANSFORM from ${boxFit.box.volumeL} L with the same port; the far field above the splice is UNTOUCHED measurement. ` +
    NF_CONDITION_NOTE;

  const outFile = `${way.farFile.replace(/\.[A-Za-z0-9]+$/, '')}_koan${String(toVolumeL).replace('.', '')}_merged.frd`;
  const text = renderMergedFrd({
    merge,
    farName: way.farFile,
    nearName: `${way.nearFile} transformed to ${toVolumeL} L`,
    portName: `${PORT_FILE} transformed to ${toVolumeL} L`,
    portNote: pw.note,
    spliceBandHz: SPLICE_BAND_HZ,
    step: { hz: STEP.hz, depthDb: STEP.depthDb },
    cabinetStepHz: CABINET_STEP_HZ,
    validFromHz,
    validFromReason,
    madeOn: MADE_ON,
    branchLabel: `${way.label} — ${toVolumeL} L (MODEL TRANSFORM)`,
  });
  return { way, farFloorHz, merge, validFromHz, validFromReason, outFile, text };
}
