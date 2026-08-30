/**
 * V44 — WELKE PUNTEN EEN FASE-OORDEEL DRAGEN, ALS KEUZE VAN DE TUNER.
 *
 * DE BEVINDING WAAR DIT UIT VOORTKOMT (V40). De app droeg twee fasematen die op
 * hetzelfde netwerk in tegengestelde richting bewogen. Zij bleken dezelfde
 * FORMULE over twee verschillende PUNTENVERZAMELINGEN, en beide verzamelingen
 * hadden een gemeten defect: de tuner middelde 911 punten mee die onder de
 * meetgeldigheidsvloer van de bestanden zelf lagen plus 14 waar beide takken
 * dood waren, het rapport middelde punten mee waar één tak dertig dB weg was en
 * zijn fase de som niet kon bewegen. `lib/phaseAdmission.ts` is de derde
 * verzameling: drie gronden tegelijk, elk een bestaande doctrine.
 *
 * WAT DIT BESTAND PINT, en wat elders staat. Hier staan de claims over de
 * TUNER: dat de default onaangeraakt is (P2 — élke v1-run leest wat hij las),
 * dat een genoemde toelating zónder data NIETS verandert (P4 — de gronden
 * onthouden zich, zij vallen niet terug), en dat de toelating de zoektocht
 * werkelijk BEREIKT (V23 — zonder die tegenproef zijn de andere claims even
 * waar voor een sleutel die nergens op aangesloten is).
 *
 * De handberekening staat in `metrics/phaseIntegration.test.ts`, de
 * classificatie en de kandidaatverklaring in `choiceKeyGuard.test.ts`, en wat
 * de maat op het ECHTE corpus doet in `frozenNetlistGates.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { admitPhasePoints } from '../../phaseAdmission.ts';
import { DEFAULT_OVERLAP_WINDOW_DB } from '../../integration.ts';
import { applyTransfer, combine, type GriddedResponse } from '../../dsp.ts';
import { solveNetwork } from '../../network.ts';
import { crossoverToNetlist } from '../../vxpNetwork.ts';
import type { VxpCrossover, VxpPart } from '../../parsers/vxp.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;

/**
 * Een geldige band die een ECHT stuk van dit raster afsnijdt, afgeleid uit het
 * raster zelf en nooit ingetypt: de onderste vijfde en de bovenste vijfde eraf.
 * Een band die het hele raster beslaat zou niets weren en elke claim hieronder
 * vacuüm maken.
 */
const N = V2_GRID.length;
const VALID: [number, number] = [V2_GRID[Math.floor(N / 5)], V2_GRID[Math.floor((4 * N) / 5)]];

/** Kort budget: elke claim gaat over de MAAT, niet over de kwaliteit ernaast. */
function run(extra: Partial<NetOptimizeOptions>) {
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    staged: { rippleDb: 1.5, phaseDeg: 8 },
    maxIterations: 120,
    ...extra,
  });
}

/** De twee gefilterde takken van een geleverd netwerk, zoals de tuner ze ziet. */
function branchesOf(parts: readonly VxpPart[]): { lower: GriddedResponse; upper: GriddedResponse } {
  const netlist = crossoverToNetlist({ name: 'v44', parts: [...parts] } as VxpCrossover).netlist;
  const sol = solveNetwork(netlist, V2_GRID, driverZ);
  const pick = (model: string, base: GriddedResponse): GriddedResponse => {
    const d = sol.drivers.find((x) => x.model === model);
    const h = d ? sol.transfers[d.id] : null;
    return h ? applyTransfer(base, h) : base;
  };
  const c = combine(pick('mid', wBase), pick('tweeter', tBase), ADJUST);
  return { lower: c.woofer, upper: c.tweeter };
}

describe('V44 — de fase-toelating als keuze van de tuner', () => {
  it('P2 — afwezig en de historische toelating zijn byte-identieke runs', () => {
    /* De default is niet aangeraakt, en dat is de toggle-belofte in het klein:
     * élke v1-run, élke aanroeper die niets stelt, leest hetzelfde getal als
     * voorheen. Zou dit falen, dan is V44 geen v2-wijziging maar een
     * gedragswijziging die zich als er een voordoet. */
    const absent = run({});
    const legacy = run({ phaseAdmission: 'overlap' });
    expect(legacy.parts).toEqual(absent.parts);
    expect(legacy.after.phaseDeg).toBe(absent.after.phaseDeg);
    expect(legacy.after.rippleDb).toBe(absent.after.rippleDb);
  });

  it('P4 — een genoemde toelating zonder data verandert NIETS en valt niet terug', () => {
    /* Precies wat een stille terugval NIET doet. Zonder geldige band en zonder
     * geestvloer heeft alleen grond (c) iets te lezen, en die grond ÍS het
     * historische overlapvenster — dus dezelfde punten, dezelfde run. Het
     * alternatief dat dit uitsluit is een implementatie die bij ontbrekende
     * data een band VERZINT (de analyse-grid-terugval die V32 uit de poorten
     * heeft gehaald). */
    const bare = run({ phaseAdmission: 'measured' });
    const legacy = run({ phaseAdmission: 'overlap' });
    expect(bare.parts).toEqual(legacy.parts);
    expect(bare.after.phaseDeg).toBe(legacy.after.phaseDeg);

    const empty = run({ phaseAdmission: 'measured', phaseAdmissionFacts: {} });
    expect(empty.parts).toEqual(legacy.parts);
  });

  it('de toelating BEREIKT de zoektocht — er komt aantoonbaar een ander netwerk uit', () => {
    /* De dragende claim. Zonder haar zijn alle andere even waar voor een sleutel
     * die nergens op aangesloten is (V23), en dat is het geval dat dit project
     * vier keer eerder heeft aangetroffen. */
    const historic = run({ phaseAdmission: 'overlap' });
    const measured = run({
      phaseAdmission: 'measured',
      phaseAdmissionFacts: { validBandHz: VALID },
    });
    expect(measured.parts).not.toEqual(historic.parts);
  });

  it('de gerapporteerde fase IS het gemiddelde over exact de toegelaten punten', () => {
    /* Identiteit per constructie, en zij is de reden dat er één functie is: de
     * tuner rapporteert geen tweede mening over `admitPhasePoints`, hij
     * rapporteert wat die functie toelaat. Met `phaseMetric: 'band'` is de
     * tunerwaarde het ONGEWOGEN gemiddelde over één paar, dus precies wat
     * `admitPhasePoints` teruggeeft. */
    const r = run({
      phaseAdmission: 'measured',
      phaseMetric: 'band',
      phaseAdmissionFacts: { validBandHz: VALID },
    });
    const { lower, upper } = branchesOf(r.parts);
    const direct = admitPhasePoints(
      V2_GRID,
      { db: lower.spl, phaseDeg: lower.phaseDeg, validHz: VALID },
      { db: upper.spl, phaseDeg: upper.phaseDeg, validHz: VALID },
      { overlapWindowDb: DEFAULT_OVERLAP_WINDOW_DB, silentFloorDb: null },
    );
    expect(direct.n).toBeGreaterThan(0);
    expect(r.after.phaseDeg).toBeCloseTo(direct.meanAbsDeg!, 9);

    /* …en het is aantoonbaar een STRIKTE deelverzameling van het historische
     * venster, want anders zou "toegelaten" en "in de overlap" hetzelfde zijn. */
    const all = admitPhasePoints(
      V2_GRID,
      { db: lower.spl, phaseDeg: lower.phaseDeg, validHz: null },
      { db: upper.spl, phaseDeg: upper.phaseDeg, validHz: null },
      { overlapWindowDb: DEFAULT_OVERLAP_WINDOW_DB, silentFloorDb: null },
    );
    expect(direct.n).toBeLessThan(all.n);
    for (let i = 0; i < V2_GRID.length; i++) {
      if (direct.admitted[i]) expect(all.admitted[i]).toBe(true);
    }
  });

  it('een andere geldige band levert een ander oordeel — de band is niet decoratief', () => {
    const narrow = run({
      phaseAdmission: 'measured',
      phaseAdmissionFacts: { validBandHz: VALID },
    });
    const wide = run({
      phaseAdmission: 'measured',
      phaseAdmissionFacts: { validBandHz: [V2_GRID[0], V2_GRID[N - 1]] },
    });
    expect(wide.after.phaseDeg).not.toBe(narrow.after.phaseDeg);
  });
});
