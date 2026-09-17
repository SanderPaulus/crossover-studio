/**
 * M-4 — DE MEETBANK VAN DE FASE-HERTUNE: één payload, twee armen, twee lezers.
 *
 * WAAROM EEN EIGEN MODULE. M-4 heeft twee scripts die exact dezelfde run moeten
 * beschrijven — `measure-m4-phase-priority.ts` DRAAIT de twee gestelde
 * kandidaten, `register-m4-candidates.ts` BEVRIEST wat eruit kwam — en de
 * V38-bank-les zegt waarom dat één bouwer moet zijn: twee scripts die elk hun
 * eigen opties samenstellen leveren twee tabellen die niet mogen worden
 * afgetrokken, en de aftrekking IS de vraag.
 *
 * WAT ER PRECIES ÉÉN FACTOR ANDERS IS. Alles hieronder is de M-2b-run zoals de
 * generator hem draaide — dezelfde meetset (de standaard, sinds M-3 `'m3'`),
 * dezelfde poorten, dezelfde budgetten, dezelfde seed, hetzelfde raster,
 * dezelfde vensterinvoer, dezelfde spoelfamilies — op TWEE dingen na, en beide
 * zijn gesteld en gedateerd:
 *
 *   · de KRUISPUNTEN zijn GESTELD (U-5) in plaats van afgeleid: woofer→mid op
 *     362,3 en 518,8 Hz, mid→tweeter op 2251,4 Hz. Alle drie zijn posities die
 *     het AFGELEIDE veld van M-2b zelf droeg, dus de kandidaten zijn niet
 *     nieuw — wat nieuw is, is dat zij bij naam gevraagd worden in plaats van
 *     uit een raster te vallen. Een drieweg heeft BEIDE assen nodig: een
 *     deelverzameling is geen verzameling (U-5).
 *
 *   · `phasePriority` staat op {@link M4_PHASE_PRIORITY} in plaats van op de
 *     0,5 van de fixture, en sinds M-4 reist dat getal als GESTELDE
 *     ketensleutel mee (`CHAIN_CHOICE_KEYS`) in plaats van in een spread.
 *
 * DE MEETSET IS DE STANDAARD EN NIET `'koan677'`, en dat is een besluit met een
 * reden. De twee live ketenruns zijn sinds M-3 op `'koan677'` gepind omdat het
 * M-2b-corpus daarop is OPGEWEKT; M-4 wekt niets opnieuw op maar draait twee
 * NIEUWE kandidaten, en een nieuwe kandidaat hoort op de huidige meetbasis te
 * lopen. De prijs staat in de entry: de F-netlists en hun M-2b-tegenhangers
 * zijn daardoor op twee verschillende sets gezocht, en de vergelijkingstabel
 * leest beide helften daarom op de STANDAARD (`corpusBank`, één bank).
 */

import type { Complex } from '../src/lib/complex.ts';
import type { GriddedResponse } from '../src/lib/dsp.ts';
import type { Chain3Input } from '../src/lib/threeWayChain.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import type { V2Chain3Payload } from '../src/lib/engine2/optimizer/worker.ts';
import type { MeasurementFactsPayload } from '../src/lib/engine2/optimizer/measurementFacts.ts';
import { statedMarkForWorker } from '../src/lib/engine2/optimizer/scanRequest.ts';
import {
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  casus1V2Declaration,
  CASUS1_M4_PHASE_PRIORITY,
  CASUS1_M4_STATED_ON,
  CASUS1_M4_STATED_PER_AXIS_HZ,
} from '../src/lib/engine2/casus1V2.fixture.ts';

/* De drie gestelde run-parameters wonen in de FIXTURE (casus 1's eigen huis) en
 * worden hier alleen doorgegeven, zodat een guard ze kan lezen zonder een
 * script te importeren. */
export const M4_PHASE_PRIORITY = CASUS1_M4_PHASE_PRIORITY;
export const M4_STATED_ON = CASUS1_M4_STATED_ON;
export const M4_STATED_PER_AXIS_HZ = CASUS1_M4_STATED_PER_AXIS_HZ;

/** Wat de bank aan gemeten materiaal nodig heeft om één payload te bouwen. */
export interface M4Gridded {
  grid: readonly number[];
  w: GriddedResponse;
  m: GriddedResponse;
  t: GriddedResponse;
  driverZ: Record<string, Complex[]>;
  safety: {
    freqs: number[];
    w: GriddedResponse;
    m: GriddedResponse;
    t: GriddedResponse;
    z: Record<string, Complex[]>;
  };
}

/**
 * De payload van één M-4-kandidaat.
 *
 * Woordelijk `payloadFor` uit `generate-casus1-v2-candidates.ts` — dezelfde
 * velden, dezelfde spreads, dezelfde P4-regel dat een niet-gestelde eis niets
 * wapent — met de twee gestelde factoren erbovenop. Wie de twee naast elkaar
 * legt moet ze kunnen aftrekken, dus zij worden niet geparafraseerd.
 */
export function m4PayloadFor(
  c: GeneratedCandidate,
  gridded: M4Gridded,
  facts: MeasurementFactsPayload,
  phasePriority: number,
): V2Chain3Payload {
  const input: Chain3Input = {
    grid: [...gridded.grid],
    w: gridded.w,
    m: gridded.m,
    t: gridded.t,
    driverZ: gridded.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    xoLowRange: c.crossings[0].cageHz,
    xoHighRange: c.crossings[1].cageHz,
    label: c.label,
    settings: {
      ...CASUS1_V2_SETTINGS,
      /* M-4 — de gestelde schuif. Hij staat OOK in de ketensettings en niet
       * alleen in de verklaring, om de reden die `withDeclaredChainChoices`
       * zelf geeft: de verklaring overschrijft de settings, dus de twee horen
       * hetzelfde te zeggen en een payload die ze laat verschillen is een
       * payload waarvan niemand kan zien welke won. */
      phasePriority,
      safety: gridded.safety,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  const declared = casus1V2Declaration(c, gridded.safety, { phasePriority });
  return {
    input,
    v2: {
      ...facts,
      gates: { ...CASUS1_V2_GATES },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: CASUS1_V2_BAND_HZ,
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    },
    candidate: {
      ...declared,
      /* U-5 — de gestelde markering. Casus 1's driver-ids ZIJN de modelnamen
       * van de worker, dus de hersleuteling is hier de identiteit; zij loopt
       * toch door dezelfde brug, want een casus waar zij dat niet is hoort
       * langs deze regel te komen en niet langs een kopie ervan. */
      ...(c.stated ? { stated: statedMarkForWorker(c.stated, (id) => id) } : {}),
    },
  };
}
