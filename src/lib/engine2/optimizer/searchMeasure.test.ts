/**
 * V38-fix — WAT DE ZOEKTOCHT MEET, EN WAAROM DAT EEN KEUZE IS.
 *
 * DE BEVINDING WAAR DIT UIT VOORTKOMT. De v1-tuner gladt met `errorSmoothOct`
 * de MAGNITUDE van elke driverrespons vóór de decimatie, laat zijn FASE
 * ongemoeid, en sommeert de takken daarna complex (`smoothMag` in
 * `netOptimizer.ts`). De amplitudeterm van de zoektocht is de spreiding van DIE
 * som; élk oordeel dat erna komt — `judgeResponse`, het SPL-venster, de
 * trapdoelen, alle poorten — leest de ONGEGLADDE som. Op casus 1 kostte dat
 * verschil 0,55 tot 2,45 dB geleverde vlakheid, op drie topologieën, met één
 * sleutel als enige verschil (casusboek V38).
 *
 * WAT DIT BESTAND PINT, en wat elders staat. Hier staan de claims over de
 * TUNER: dat de default onaangeraakt is (P2 — élke v1-run leest wat hij las),
 * dat 0 de zoektocht werkelijk bereikt (V23 — zonder die tegenproef zijn de
 * andere claims even waar voor een sleutel die nergens op is aangesloten), en
 * de naad zelf: met gladding aan rapporteert de tuner twee verschillende
 * pieken, met 0 één.
 *
 * DE GROOTTE van die naad is geen eigenschap van de sleutel maar van het
 * ontwerp en van het RASTER, en zij wordt daarom op het echte corpus geassert
 * (`frozenNetlistGates.test.ts`, V38-fix). Daar staat ook het mechanisme dat de
 * meting opleverde en dat V38's eigen verklaring corrigeert: de 43 dB komt niet
 * van de ontkoppeling van magnitude en fase maar van de STILLE GEEST net buiten
 * de beoordeelde band, waar de gladdingskern overheen reikt. Op deze
 * tweewegfixture bestaat die geest niet — het raster loopt niet voorbij de
 * gemeten uitgestrektheid — en precies daarom is dit bestand de plek voor de
 * kleine, structurele helft en niet voor de grote.
 *
 * DE CLASSIFICATIE (keuze, nooit meer polish) en de verklaring van de kandidaat
 * staan in `choiceKeyGuard.test.ts`, waar élke keuze-sleutel zijn claims heeft.
 *
 * WAT DEZE SESSIE NIET AANRAAKT: `smoothMag` zelf, `WINDOW_SMOOTHING_OCTAVES`
 * (A5e.1 — dat is het OORDEEL en niet de zoekmaat) en de fasematen. De naad
 * tussen zoeken en oordelen blijft een genoteerde bevinding.
 */

import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { smoothDbGaussian } from '../../bandMetrics.ts';
import { applyTransfer, combineN, type GriddedResponse } from '../../dsp.ts';
import { solveNetwork } from '../../network.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../../parsers/vxp.ts';
import { SEARCH_SMOOTHING_OCTAVES } from '../constants.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;

/**
 * De historische zoekgladding: de default van `netOptimizer.ts` en de
 * beginwaarde van het keuzevak in de app.
 *
 * Uitgeschreven en niet geïmporteerd, met opzet: dit is de waarde waarvan
 * beweerd wordt dat zij ONVERANDERD is, en een assert die haar uit dezelfde
 * bron leest als de code die zij bewaakt beweegt mee met een wijziging. Vandaar
 * ook de eerste test: hij houdt dit getal tegen de default zelf.
 */
const LEGACY_SMOOTH_OCT = 1 / 12;

/** Kort budget: elke claim gaat over de MAAT, niet over de kwaliteit van het
 *  netwerk dat eromheen ontstaat. */
function run(extra: Partial<NetOptimizeOptions>) {
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    staged: { rippleDb: 1.5, phaseDeg: 8 },
    maxIterations: 120,
    ...extra,
  });
}

/**
 * De SOM van een geleverd netwerk, complex, op het volle raster.
 *
 * Hetzelfde product dat de simulatie toont en dat `judgeResponse` beoordeelt:
 * gemeten druk per weg maal de elektrische overdracht van zijn tak. Hier
 * nagebouwd uit dezelfde bouwstenen die de worker gebruikt, want de vraag van
 * dit bestand is nu juist wat er gebeurt als je die som gladt in plaats van
 * zijn ingrediënten.
 */
function summedOf(parts: readonly VxpPart[]): GriddedResponse {
  const netlist = crossoverToNetlist({ name: 'v38fix', parts: [...parts] } as VxpCrossover).netlist;
  const sol = solveNetwork(netlist, V2_GRID, driverZ);
  const branches: { response: GriddedResponse }[] = [];
  for (const [model, response] of [
    ['mid', wBase],
    ['tweeter', tBase],
  ] as const) {
    const d = sol.drivers.find((x) => x.model === model);
    const h = d ? sol.transfers[d.id] : null;
    if (h) branches.push({ response: applyTransfer(response, h) });
  }
  const c = combineN(branches);
  return { freq: c.freq, spl: c.combinedSpl, phaseDeg: c.combinedPhaseDeg };
}

/** Piek-vlakheid ±dB over een band — dezelfde definitie als `bandPeak` in de
 *  tuner, die haar niet exporteert. */
function peakOver(freq: readonly number[], spl: readonly number[], band: [number, number]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] < band[0] || freq[i] > band[1]) continue;
    if (spl[i] < lo) lo = spl[i];
    if (spl[i] > hi) hi = spl[i];
  }
  return Number.isFinite(lo) && hi > lo ? (hi - lo) / 2 : 0;
}

/** De band die de tuner zelf afleidt wanneer de aanroeper er geen stelt. */
const DEFAULT_BAND: [number, number] = [V2_GRID[0] * 1.02, V2_GRID[V2_GRID.length - 1] * 0.975];

describe('V38-fix — de zoekmaat als keuze', () => {
  it('P2 — afwezig en de historische breedte zijn byte-identieke runs', () => {
    /* De default is niet aangeraakt, en dat is de hele toggle-belofte in het
     * klein: élke v1-run, élke aanroeper die niets stelt, leest hetzelfde
     * getal als voorheen. Zou dit falen, dan is V38-fix geen v2-wijziging maar
     * een gedragswijziging die zich als er een voordoet. */
    const absent = run({});
    const legacy = run({ errorSmoothOct: LEGACY_SMOOTH_OCT });
    expect(legacy.parts).toEqual(absent.parts);
    expect(legacy.after.rippleDb).toBe(absent.after.rippleDb);
  });

  it('0 BEREIKT de zoektocht — er komt aantoonbaar een ander netwerk uit', () => {
    /* De dragende claim. Zonder haar zijn alle andere even waar voor een
     * sleutel die nergens op aangesloten is (V23), en dat is precies het geval
     * dat dit project drie keer eerder heeft aangetroffen. */
    const smoothed = run({});
    const raw = run({ errorSmoothOct: SEARCH_SMOOTHING_OCTAVES });
    expect(raw.tuned).toBeGreaterThan(0);
    expect(raw.parts, 'de zoekmaat bereikt de zoektocht niet').not.toEqual(smoothed.parts);
  });

  it('met gladding AAN zijn de zoekmaat en de oordeelsmaat twee getallen; met 0 zijn ze er één', () => {
    /* DE NAAD, in de eenheden van de tuner zelf. Hij rapporteert beide: `rippleDb`
     * in `after` is de piek van de ECHTE som van het geleverde netwerk — het
     * getal waarop élk oordeel rust — en `ripplePeakSmoothedDb` is dezelfde
     * piek zoals de ZOEKTOCHT hem zag. Zolang die twee uiteenlopen zoekt de
     * tuner naar iets anders dan waarop hij afgerekend wordt.
     *
     * De GROOTTE van dat verschil is een eigenschap van het ontwerp en van het
     * raster, niet van de sleutel, en zij wordt daarom niet hier geassert maar
     * op het echte corpus (`frozenNetlistGates.test.ts`, V38-fix): daar is zij
     * op élke bevroren netlist groter dan het volledige piek-tot-dal-bereik van
     * de echte som. Op deze tweewegfixture is zij klein — het raster loopt niet
     * voorbij de gemeten uitgestrektheid, dus er is geen stille geest waar de
     * gladdingskern overheen kan reiken. Dat verschil tussen de twee fixtures
     * IS het mechanisme, en daarom staat hier alleen de identiteit. */
    const smoothed = run({});
    expect(smoothed.after.ripplePeakSmoothedDb).toBeTypeOf('number');
    expect(smoothed.after.ripplePeakSmoothedDb).not.toBe(smoothed.after.rippleDb);

    const raw = run({ errorSmoothOct: SEARCH_SMOOTHING_OCTAVES });
    expect(raw.after.ripplePeakSmoothedDb).toBe(raw.after.rippleDb);
  });

  it('gladden-ná-sommatie is een ANDERE kromme dan gladden-vóór — het verschil is de ontkoppeling', () => {
    /* De ontkoppeling van magnitude en fase bestaat en is hier meetbaar: gladt
     * men de takken en sommeert men daarna, dan hoort de gegladde magnitude
     * niet meer bij de fase waarmee zij wordt opgeteld, en de som is een andere
     * kromme dan wanneer men de SOM gladt. Dit bestand pint dat zij verschillen;
     * hoevéél is opnieuw een eigenschap van het ontwerp.
     *
     * WAAROM DIT ERTOE DOET VOOR DE REPARATIE. Op deze fixture is de
     * ontkoppeling het enige verschil, en zij is klein — 0,02 tegen 0,03 dB
     * afwijking van de echte som, nagemeten. Op casus 1 is zij ook klein —
     * hoogstens 6 % van de echte rimpelpiek, op tachtig bevroren netlists — en
     * staat er 43 dB naast dat de gladding uit een ANDERE bron haalt (de stille
     * geest over de bandrand). Dat is samen het antwoord op de vraag waarmee
     * deze sessie begon: gladden-ná-sommatie neemt alleen deze kleine
     * ontkoppeling weg en laat de grote post staan, dus zij is geen reparatie
     * en zij is niet gebouwd. */
    const smoothed = run({});
    const sum = summedOf(smoothed.parts);
    const rawPeak = peakOver(sum.freq, sum.spl, DEFAULT_BAND);
    const afterSumPeak = peakOver(
      sum.freq,
      smoothDbGaussian(sum.freq, sum.spl, LEGACY_SMOOTH_OCT),
      DEFAULT_BAND,
    );
    const beforeSumPeak = smoothed.after.ripplePeakSmoothedDb!;

    expect(afterSumPeak).not.toBe(rawPeak);
    expect(beforeSumPeak).not.toBe(afterSumPeak);
    /* ...en allebei blijven zij op deze fixture binnen een fractie van de echte
     * som, want er is geen dood rasterpunt om overheen te reiken. Zonder deze
     * helft leest het blok als "gladding is hier ook al rampzalig", en dat is
     * juist niet wat er gemeten is. */
    expect(Math.abs(afterSumPeak - rawPeak)).toBeLessThan(rawPeak);
    expect(Math.abs(beforeSumPeak - rawPeak)).toBeLessThan(rawPeak);
  });
});
