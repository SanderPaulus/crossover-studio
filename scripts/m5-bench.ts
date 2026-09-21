/**
 * M-5 — DE MEETBANK VAN DE LR2-VRAAG: één veld, drie lezers.
 *
 * WAAROM EEN EIGEN MODULE, en waarom zij zo klein is. M-5 verandert aan de bank
 * van H-4 precies ÉÉN ding: het VELD. Dezelfde meetset, hetzelfde rapport,
 * dezelfde poorten, dezelfde budgetten, dezelfde seed, hetzelfde raster,
 * dezelfde spoelfamilies, dezelfde `phasePriority` van 0,5 waarmee het levende
 * corpus is opgewekt — en dezelfde payloadbouwer (`casus1PayloadFor`), want de
 * V38-bank-les zegt dat twee lezers die elk hun eigen opties samenstellen twee
 * tabellen leveren die niet mogen worden afgetrokken, en de aftrekking IS de
 * vraag. Alles wat hier staat gaat dus over het veld en over niets anders.
 *
 * WAT ER AAN HET VELD ANDERS IS, en beide helften zijn gesteld:
 *
 *   · DE ORDE IS LOSGELATEN. `casus1Field` stelt orde 4 op beide overnames
 *     (A5e.3-veld, na M-1's LR2-weerlegging); hier is `statedOrder` NULL en
 *     beslist de A5d.3-afleiding welke orden toegelaten zijn. Dat is het hele
 *     onderwerp van de sessie: de weerlegging stamt van een andere meetbasis,
 *     van vóór de M-3-midfase en van vóór H-4, en sindsdien was LR2 niet meer
 *     gemeten maar gepind.
 *
 *   · DE AFLEIDING WORDT GEWAPEND ZOALS DE APP HAAR WAPENT. Dat is geen
 *     verruiming maar een REPARATIE van een asymmetrie die deze sessie heeft
 *     gemeten: `pairDerivationInputs` (E-3b) geeft A5d.3(ii) het gestelde
 *     M-C-getal van de bovenste weg mee, en élke casus-fixture van dit boek
 *     geeft `perPair` alleen een `statedOrder`. Zolang orde 4 GESTELD is
 *     verandert dat niets — de verzameling is {gesteld} ∪ {geëist} en beide
 *     zijn 4 — dus het is nooit opgevallen; zodra de orde wordt losgelaten
 *     beslist het alles. Gemeten, niet aangenomen: `measure-m5-lr2.ts` drukt
 *     alle drie de wapeningen naast elkaar af.
 *
 *   · ELKE POLARITEITSARM WORDT GEBOUWD (`bothArms`, H-4). Een gestelde positie
 *     krijgt beide armen onvoorwaardelijk (U-5's regel, H-4's vierde regel),
 *     en `'both'` zegt daarnaast dat de marge hier niets mag dunnen: M-5 vraagt
 *     wat een arm WAARD is, en dat is een vraag over élke rij.
 *
 * DE MEETSET IS EEN ARGUMENT, en de default is de STANDAARD — de M-4-reden,
 * woordelijk: de live ketenruns zijn sinds M-3 op `'koan677'` gepind omdat het
 * M-2b-CORPUS daarop is opgewekt, maar M-5 wekt niets opnieuw op en draait
 * NIEUWE kandidaten, en een nieuwe kandidaat hoort op de huidige meetbasis te
 * lopen. De prijs is dezelfde als bij M-4 en staat in de entry: de M-5-armen en
 * hun tegenhangers zijn dan op twee verschillende sets GEZOCHT, dus de
 * vergelijkingstabel leest beide helften op ÉÉN bank en de aftrekking gaat over
 * de netlists en niet over de zoektochten. De andere set is bereikbaar omdat de
 * vraag ervan af KAN hangen: M-3 repareerde de fase van de mid in precies de
 * W-M-kruisband waar LR2 leeft.
 */

import {
  CASUS1_FIELD_ALIGNMENTS,
  CASUS1_FIELD_CHAIN_BUDGET,
  CASUS1_FIELD_POSITION_POLICY,
  CASUS1_M5_STATED_ON,
  CASUS1_M5_STATED_PER_AXIS_HZ,
  assertM5PositionsAreTheLiveCorpus,
  casus1M5PerPair,
  type Casus1M5Arming,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import type { Casus1MeasurementSet } from '../src/lib/engine2/casus1.fixture.ts';
import {
  buildCandidateField,
  type CandidateFieldResult,
} from '../src/lib/engine2/predesign/candidateField.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import { bothArms, casus1Bench } from './h4-bench.ts';

/* De twee gestelde run-parameters wonen in de FIXTURE (casus 1's eigen huis) en
 * worden hier alleen doorgegeven — de M-4-vorm, zodat een guard ze kan lezen
 * zonder een script te importeren. */
export const M5_STATED_PER_AXIS_HZ = CASUS1_M5_STATED_PER_AXIS_HZ;
export const M5_STATED_ON = CASUS1_M5_STATED_ON;

/** Welke meetset een M-5-run leest; de standaard tenzij de aanroeper iets zegt. */
export function m5SetFromEnv(fallback: Casus1MeasurementSet = 'm3'): Casus1MeasurementSet {
  const v = process.env.M5_SET;
  if (v === undefined || v === '') return fallback;
  if (v !== 'm3' && v !== 'koan677' && v !== 'merged' && v !== 'gated') {
    throw new Error(`M5_SET=${v} is geen meetset van casus 1 (m3 | koan677 | merged | gated)`);
  }
  return v;
}

/**
 * DE DRIE WAPENINGEN VAN DE AFLEIDING — doorgegeven uit de fixture.
 *
 * Zij wonen in `casus1V2.fixture.ts` (casus 1's eigen huis) zodat een GUARD ze
 * kan lezen zonder een script te importeren, en worden hier alleen
 * doorgegeven: twee implementaties van "welke orden laat de afleiding toe"
 * zouden een tabel en haar test uit elkaar laten lopen (A3g).
 */
export type M5Arming = Casus1M5Arming;
export const m5PerPair = casus1M5PerPair;

export interface M5Bench {
  set: Casus1MeasurementSet;
  bench: ReturnType<typeof casus1Bench>;
  /** Het veld per wapening — dezelfde posities, een andere verzameling orden. */
  fieldOf: (arming: M5Arming) => CandidateFieldResult;
  /** De rijen die M-5 DRAAIT: de gestelde kandidaten van de gewapende afleiding. */
  stated: GeneratedCandidate[];
}

export function m5Bench(set: Casus1MeasurementSet = m5SetFromEnv()): M5Bench {
  assertM5PositionsAreTheLiveCorpus();
  const bench = casus1Bench(set);
  const wis = bench.report.predesign.windowInputs;
  const fieldOf = (arming: M5Arming): CandidateFieldResult =>
    buildCandidateField({
      windowInputs: wis,
      perPair: m5PerPair(wis, arming),
      alignments: CASUS1_FIELD_ALIGNMENTS,
      chainBudget: CASUS1_FIELD_CHAIN_BUDGET,
      positionPolicy: CASUS1_FIELD_POSITION_POLICY,
      statedPerAxisHz: M5_STATED_PER_AXIS_HZ,
      statedOn: M5_STATED_ON,
      polarityArms: bothArms(bench.marginFor),
    });
  const armed = fieldOf('armed');
  /* ALLEEN DE GESTELDE HELFT DRAAIT. Het afgeleide veld staat er omdat
   * `buildCandidateField` het bouwt en omdat de afleidingstabel het leest, maar
   * de vraag van M-5 gaat over DRIE posities met een tegenhanger in het levende
   * corpus — de rest zou een regeneratie zijn, en dit is een meetsessie. */
  const stated = armed.field.candidates.filter((c) => c.stated !== undefined && c.stated !== null);
  return { set, bench, fieldOf, stated };
}
