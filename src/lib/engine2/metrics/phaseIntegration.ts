/**
 * M-K · FASE-INTEGRATIE PER KRUISGEBIED — de maat, en de twee die zij vervangt.
 *
 * De grootheid is ongewijzigd sinds F1: het gemiddelde |relatieve fase| tussen
 * twee aangrenzende takken. Wat V44 verandert is WELKE PUNTEN meetellen; de
 * drie gronden en hun herkomst staan in `lib/phaseAdmission.ts`, en die functie
 * is de enige plek waar zij beslist worden. Deze module is de engine2-lezer
 * ervan: zij levert de maat per driverpaar, met de twee HISTORISCHE maten
 * ernaast als benoemde controlekolommen.
 *
 * WAAROM DE TWEE OUDE MATEN BLIJVEN. Dat zij het oneens waren is zelf een
 * bewaakte eigenschap (V40): op `V38FIX_KAND_5` las de tuner 59,15° en het
 * rapport 17,83° over hetzelfde netwerk. Wie één van beide weghaalt, haalt het
 * bewijsmateriaal weg waarmee een stille wijziging aan de andere zichtbaar zou
 * worden. Zij dragen geen oordeel meer — geen poort, geen eis, geen
 * sorteersleutel — en heten daarom `control`.
 *
 * DE TWEE CONTROLEKOLOMMEN, met naam:
 *   · `octaveClipped` — wat `system.phaseTracking` tot V44 afdrukte: ±N octaaf
 *     rond het kruispunt, geknipt op meetgeldigheid, ONGEWOGEN. Zijn defect is
 *     gemeten: hij middelt fase mee waar één tak allang weg is en de som hem
 *     niet voelt (op `V28_KAND_1` M-T dertien punten van gemiddeld 146°).
 *   · `overlapWindow` — wat `pairPhaseDeg` in de tuner afdrukte: elk punt waar
 *     de takken binnen het overlapvenster liggen, zónder knip op
 *     meetgeldigheid en zonder geestvloer. Zijn defect is even gemeten: 911 van
 *     de 1048 extra punten op casus 1 lagen onder de meetgeldigheidsvloer.
 *
 * P6: geen frequentie in dit bestand. `CONTROL_WINDOW_OCTAVES` is een
 * VENSTERBREEDTE in octaven en bestaat uitsluitend om de historische kolom
 * reproduceerbaar te houden; de maat zelf gebruikt hem niet.
 */

import { admitPhasePoints, type PhaseBranchInput, type PhaseRejection } from '../../phaseAdmission.ts';
import { inOverlapWindow } from '../../integration.ts';
import { wrapDeg } from '../../dsp.ts';
import { coverageOf, type Coverage } from '../ingest/validity.ts';

/**
 * MAJOR: dezelfde naam, een andere puntenverzameling, en dus een ander getal.
 * 1.0 was de ongeversioneerde F1-vorm (±1 octaaf geknipt op meetgeldigheid).
 * Een cache van vóór deze versie beantwoordt de nieuwe vraag niet.
 */
export const PHASE_INTEGRATION_VERSION = 'phase-integration/2.0';

/**
 * De breedte van het historische octaafvenster, ALLEEN voor de controlekolom.
 *
 * Zij stond tot V44 in `report.ts` en stuurde daar de maat. Zij stuurt nu
 * niets: de toelating meet het overnamegebied rechtstreeks (grond (c)), en
 * deze constante houdt uitsluitend de oude kolom reproduceerbaar.
 */
export const CONTROL_WINDOW_OCTAVES = 1;

export interface PhasePairBranch extends PhaseBranchInput {
  /** Naam van de weg — reist mee zodat een melding hem kan noemen. */
  driver: string;
}

export interface PhaseIntegrationInput {
  freq: readonly number[];
  lower: PhasePairBranch;
  upper: PhasePairBranch;
  crossingHz: number;
  overlapWindowDb: number;
  silentFloorDb: number | null;
}

export interface PhaseControlColumn {
  meanAbsDeg: number | null;
  bandHz: [number, number] | null;
  n: number;
}

export interface PhaseIntegrationResult {
  lower: string;
  upper: string;
  crossingHz: number;
  /** DE MAAT (M-K): gemiddelde |Δφ| over de toegelaten punten. */
  meanAbsDeg: number | null;
  bandHz: [number, number] | null;
  n: number;
  /** Waarom punten afvielen, per grond, en welke gronden gewapend waren. */
  rejected: Record<PhaseRejection, number>;
  grounds: { validity: boolean; silence: boolean; level: boolean };
  /** Hoeveel van het raster de maat beslaat, met herkomst van beide randen. */
  coverage: Coverage;
  /** De twee historische maten, met naam. Zij oordelen niets. */
  control: {
    octaveClipped: PhaseControlColumn & { intendedHz: [number, number] };
    overlapWindow: PhaseControlColumn;
  };
}

/** Het ongewogen gemiddelde |Δφ| over een gegeven puntenverzameling. */
function meanOver(
  freq: readonly number[],
  a: readonly number[],
  b: readonly number[],
  keep: (i: number) => boolean,
): PhaseControlColumn {
  let sum = 0;
  let n = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < freq.length; i++) {
    if (!keep(i)) continue;
    sum += Math.abs(wrapDeg(a[i] - b[i]));
    n++;
    if (freq[i] < lo) lo = freq[i];
    if (freq[i] > hi) hi = freq[i];
  }
  return n > 0 ? { meanAbsDeg: sum / n, bandHz: [lo, hi], n } : { meanAbsDeg: null, bandHz: null, n: 0 };
}

export function phaseIntegration(input: PhaseIntegrationInput): PhaseIntegrationResult {
  const { freq, lower, upper, crossingHz, overlapWindowDb, silentFloorDb } = input;

  const admitted = admitPhasePoints(freq, lower, upper, { overlapWindowDb, silentFloorDb });

  /* CONTROLEKOLOM 1 — het historische octaafvenster, geknipt op de
   * meetgeldigheid van beide takken, precies zoals `report.ts` het tot V44
   * bouwde. De bedoelde randen reizen mee, want de dekking is het getal dat
   * zei hoeveel van dat venster de meetgeldigheid overliet (V15). */
  const intendedLo = crossingHz / 2 ** CONTROL_WINDOW_OCTAVES;
  const intendedHi = crossingHz * 2 ** CONTROL_WINDOW_OCTAVES;
  const validLo = Math.max(lower.validHz?.[0] ?? -Infinity, upper.validHz?.[0] ?? -Infinity);
  const validHi = Math.min(lower.validHz?.[1] ?? Infinity, upper.validHz?.[1] ?? Infinity);
  const clipLo = Math.max(intendedLo, validLo);
  const clipHi = Math.min(intendedHi, validHi);
  const octaveClipped = meanOver(
    freq,
    lower.phaseDeg,
    upper.phaseDeg,
    (i) => freq[i] >= clipLo && freq[i] <= clipHi,
  );

  /* CONTROLEKOLOM 2 — het kale overlapvenster: één relatieve toets, geen knip
   * op meetgeldigheid en geen geestvloer. Dit is wat de tuner tot V44 las. */
  const overlapWindow = meanOver(freq, lower.phaseDeg, upper.phaseDeg, (i) =>
    inOverlapWindow(Math.abs(lower.db[i] - upper.db[i]), overlapWindowDb),
  );

  return {
    lower: lower.driver,
    upper: upper.driver,
    crossingHz,
    meanAbsDeg: admitted.meanAbsDeg,
    bandHz: admitted.bandHz,
    n: admitted.n,
    rejected: admitted.rejected,
    grounds: admitted.grounds,
    /* DE DEKKING VAN M-K, en waartegen zij gemeten wordt is een besluit.
     *
     * NIET tegen het octaafvenster: dat is sinds V44 geen bedoeling meer, en een
     * breuk tegen een venster dat de maat niet gebruikt zou een getal opleveren
     * dat alleen maar klein is. NIET tegen het hele raster: dan meet zij hoe
     * smal een overnamegebied is, wat een eigenschap van het ontwerp is en niet
     * van de meting.
     *
     * WEL tegen het OVERLAPVENSTER — het gebied waar de twee takken elkaar
     * werkelijk overnemen, door grond (c) van dit netwerk afgelezen. Dat is wat
     * M-K wil beoordelen; de dekking zegt hoeveel daarvan de meetgeldigheid en
     * de geestvloer overlieten. Dezelfde vraag die V15 stelde, op de band die
     * V44 ervoor in de plaats zette: een dekking onder de honderd betekent dat
     * er overnamegebied is waarover deze meetset geen uitspraak draagt. */
    coverage: coverageOf(
      overlapWindow.bandHz ?? [freq[0], freq[freq.length - 1]],
      admitted.bandHz
        ? {
            fromHz: admitted.bandHz[0],
            toHz: admitted.bandHz[1],
            fromBy: 'measurement validity / silent floor',
            toBy: 'measurement validity / silent floor',
          }
        : {
            fromHz: null,
            toHz: null,
            fromBy: 'measurement validity / silent floor',
            toBy: 'measurement validity / silent floor',
          },
    ),
    control: {
      octaveClipped: { ...octaveClipped, intendedHz: [intendedLo, intendedHi] },
      overlapWindow,
    },
  };
}
