/**
 * WELKE PUNTEN EEN FASE-OORDEEL MOGEN DRAGEN — één regel, meerdere lezers.
 *
 * Tot V44 droeg de app TWEE fasematen die op hetzelfde netwerk in tegengestelde
 * richting bewogen, en beide waren dezelfde formule (gemiddelde |relatieve
 * fase|) over een andere PUNTENVERZAMELING. V40 mat dat verschil uit; deze
 * module is wat eruit volgde. De formule is niet veranderd. De TOELATING wel.
 *
 * DRIE GRONDEN, ALLE DRIE TEGELIJK, en elk is een bestaande doctrine — er is
 * hier geen nieuwe natuurkunde bedacht:
 *
 *   (a) BINNEN DE MEETGELDIGHEID VAN BEIDE TAKKEN. V15's les, en de reden dat
 *       `system.phaseTracking` sinds F1 clipt: een gemiddelde over data die de
 *       meting zelf buiten haar geldige band legt, is een uitspraak over de
 *       reconstructie en niet over de luidspreker. Gemeten op casus 1: 911 van
 *       de 1048 punten die de tunermaat extra meetelde vielen hieronder.
 *
 *   (b) BEIDE TAKKEN BOVEN DE STILLE-GEESTVLOER. V38-fix' les. Buiten haar
 *       gemeten uitgestrektheid draagt een tak de geestwaarde met fase 0; twee
 *       even dode takken liggen per definitie binnen élk RELATIEF niveauvenster,
 *       dus zo'n punt kwam binnen en droeg uitsluitend het faseverschil van de
 *       FILTERS. Op HUIDIG was dat 20 kHz met beide takken op −475 en −462 dB.
 *       **Waar (a) gewapend is voegt (b) niets toe** — de geldige band ligt per
 *       constructie binnen de gemeten uitgestrektheid, en dat is op casus 1
 *       nagemeten in plaats van aangenomen. (b) is de grond die overblijft
 *       wanneer (a) ONTBREEKT, en dat is precies de v1-route: die krijgt geen
 *       meetgeldigheid mee en zou anders de stille geest opnieuw middelen.
 *
 *   (c) |NIVEAUVERSCHIL NA FILTER| ≤ HET OVERLAPVENSTER. Het bestaande
 *       tuner-criterium, ongewijzigd overgenomen uit `integration.ts` en dáár
 *       gehuisvest: fase waar de som hem niet voelt, telt niet. Een tak die
 *       20 dB onder de andere ligt draagt een tiende van de amplitude en kan de
 *       som niet breken, hoe hij ook staat. Gemeten op casus 1: de rapportmaat
 *       middelde op `V28_KAND_1` M-T dertien zulke punten van gemiddeld 146°
 *       mee, en las daardoor 90,7° waar de som 29,7° zag.
 *
 * WAT ER VERVALT: de ±1-OCTAAFBAND rond het kruispunt. Zij was een BENADERING
 * van "waar de twee takken elkaar overnemen", en (c) meet dat gebied
 * rechtstreeks — op het geleverde netwerk, in plaats van op een octaafregel om
 * het kruispunt heen. Echte, geldige punten die buiten dat octaaf vielen (123
 * op casus 1) horen er daarmee bij, en punten binnen dat octaaf waar één tak
 * allang weg is, vallen eruit.
 *
 * P6. Geen enkele frequentie en geen enkele grens staat in dit bestand. De
 * geldige band komt per tak van de aanroeper (uit de opnamepas), de
 * geestvloer is de conventie van de aanroeper, en het overlapvenster woont in
 * `integration.ts` — waar het al woonde.
 *
 * DE V32-VORM. Deze functie heeft twee lezers: de rapportlaag
 * (`engine2/report.ts`, via `metrics/phaseIntegration.ts`) en de tuner
 * (`netOptimizer.ts`, achter de keuze-sleutel `phaseAdmission`). Dat is
 * bewust dezelfde vorm als `minImpedanceAt` in `impedanceFloor.ts`: twee
 * implementaties die tot drie decimalen overeenkomen is precies de toestand
 * die V32 aantrof, en de enige manier om hem niet opnieuw te bereiken is één
 * functie.
 */

import { wrapDeg } from './dsp.ts';
import { inOverlapWindow } from './integration.ts';

/**
 * MAJOR-versie omdat de grootheid onder dezelfde naam een andere
 * puntenverzameling meet — dezelfde afweging als `lobing-lambda/2.0`. Een
 * cache van vóór deze versie beantwoordt de nieuwe vraag niet en vervalt.
 */
export const PHASE_ADMISSION_VERSION = 'phase-admission/1.0';

/** Waaróm een punt niet meetelt. De volgorde is de volgorde van de toets. */
export type PhaseRejection = 'validity' | 'silence' | 'level';

export interface PhaseBranchInput {
  /** Niveau van de GEFILTERDE tak, dB. */
  db: readonly number[];
  /** Fase van de GEFILTERDE tak, graden. */
  phaseDeg: readonly number[];
  /**
   * De meetgeldige band van deze tak. `null` = niet meegegeven, en dan
   * ONTHOUDT grond (a) zich voor deze tak (P4: afwezig is geen grens die
   * altijd slaagt, maar ook geen grens die altijd faalt — hij is er niet).
   */
  validHz: readonly [number, number] | null;
}

export interface PhaseAdmissionOptions {
  /** Het overlapvenster in dB. Hoort bij `integration.ts`; hier een argument. */
  overlapWindowDb: number;
  /**
   * De geestwaarde van de aanroeper in dB, of `null` wanneer die aanroeper
   * geen geestconventie kent (dan is grond (b) niet gewapend).
   */
  silentFloorDb: number | null;
}

export interface PhaseAdmissionResult {
  /** Per rasterpunt: telt hij mee? */
  admitted: boolean[];
  /** Het gemiddelde |relatieve fase| over de toegelaten punten. */
  meanAbsDeg: number | null;
  /** Hoeveel punten dat waren. */
  n: number;
  /** De band die zij beslaan, of `null` bij nul punten. */
  bandHz: [number, number] | null;
  /** Hoeveel punten elke grond afwees. Een punt telt bij de EERSTE grond. */
  rejected: Record<PhaseRejection, number>;
  /** Welke gronden gewapend waren — de capability-helft van A5.3. */
  grounds: { validity: boolean; silence: boolean; level: boolean };
}

/**
 * Het gemiddelde |relatieve fase| over de punten die alle drie de gronden
 * doorstaan.
 *
 * N-weg-agnostisch: dit oordeelt over ÉÉN paar takken. Wie N wegen heeft roept
 * hem per aangrenzend paar aan — precies zoals de tuner zijn overlapvensters al
 * per paar bouwde.
 */
export function admitPhasePoints(
  freq: readonly number[],
  lower: PhaseBranchInput,
  upper: PhaseBranchInput,
  opts: PhaseAdmissionOptions,
): PhaseAdmissionResult {
  const n = freq.length;
  const admitted = new Array<boolean>(n).fill(false);
  const rejected: Record<PhaseRejection, number> = { validity: 0, silence: 0, level: 0 };
  const grounds = {
    validity: lower.validHz !== null || upper.validHz !== null,
    silence: opts.silentFloorDb !== null,
    level: true,
  };

  let sum = 0;
  let count = 0;
  let lo = Infinity;
  let hi = -Infinity;

  const inValid = (f: number, b: PhaseBranchInput): boolean =>
    b.validHz === null || (f >= b.validHz[0] && f <= b.validHz[1]);

  for (let i = 0; i < n; i++) {
    const f = freq[i];
    /* (a) meetgeldigheid van BEIDE takken. */
    if (!inValid(f, lower) || !inValid(f, upper)) {
      rejected.validity++;
      continue;
    }
    /* (b) BEIDE takken boven de geestvloer, dus afwijzen zodra ér één op of
     * onder staat. Strikt boven: de geestwaarde zelf is de stilte, niet de
     * onderrand van iets levends. Eén dode en één levende tak zou grond (c)
     * sowieso al wegsturen (de geest ligt honderden dB lager), dus dit
     * verandert de TOELATING niet — het verandert welke grond de afwijzing op
     * zijn naam krijgt, en dat is precies wat een leesbare reden waard is. */
    if (
      opts.silentFloorDb !== null &&
      (lower.db[i] <= opts.silentFloorDb || upper.db[i] <= opts.silentFloorDb)
    ) {
      rejected.silence++;
      continue;
    }
    /* (c) het overlapvenster — één regel, en zij staat in `integration.ts`. */
    if (!inOverlapWindow(Math.abs(lower.db[i] - upper.db[i]), opts.overlapWindowDb)) {
      rejected.level++;
      continue;
    }
    admitted[i] = true;
    sum += Math.abs(wrapDeg(lower.phaseDeg[i] - upper.phaseDeg[i]));
    count++;
    if (f < lo) lo = f;
    if (f > hi) hi = f;
  }

  return {
    admitted,
    meanAbsDeg: count > 0 ? sum / count : null,
    n: count,
    bandHz: count > 0 ? [lo, hi] : null,
    rejected,
    grounds,
  };
}
