/**
 * V45 (A5e.2) — WAARTEGEN DE AMPLITUDETERM VLAK IS, ALS KEUZE VAN DE TUNER.
 *
 * DE BEVINDING WAAR DIT UIT VOORTKOMT. Sinds F3 kan een ontwerp een doelcurve
 * STELLEN, en tot V45 las precies één ding hem: het oordeel van de shortlist
 * (het venster en de RMS-afwijking van A5e.1). De ZOEKTOCHT las hem niet — haar
 * amplitudeterm is `bandStd`, de spreiding van de som rond haar eigen
 * bandgemiddelde, en dat is per definitie "horizontaal is perfect". Een ontwerp
 * werd dus GEZOCHT tegen vlak en GEOORDEELD tegen een plateau, en van die twee
 * heeft de zoektocht het hele iteratiebudget: zij wint, en het oordeel legt
 * alleen de nederlaag vast.
 *
 * WAT DIT BESTAND PINT, en wat elders staat. Hier staan de claims over de
 * TUNER: dat de default onaangeraakt is (P2 — élke v1-run leest wat hij las),
 * dat een genoemde referentie ZONDER curve niets verandert en niets verzint
 * (P4), dat een VLAKKE curve de identiteit is (want een mechanisme dat
 * aantoonbaar niets kan bewegen hoort niet in een run te staan alsof het iets
 * deed), en — de claim die de andere drie iets waard maakt — dat de referentie
 * de zoektocht werkelijk BEREIKT (V23).
 *
 * De handberekening van de curve zelf staat in
 * `requirements/targetCurve.test.ts`, de classificatie en de
 * kandidaatverklaring in `choiceKeyGuard.test.ts`, en wat de doelcurve op het
 * ECHTE casusboek met het niveauwerk doet in `goldenCasus1.test.ts` (de
 * verankerde gaps) en `frozenNetlistGates.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { isFlatTargetLevel, targetLevelAt } from '../../targetLevel.ts';
import { targetLevelCurveFor } from '../requirements/targetCurve.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;

/**
 * A voicing that is a REAL tilt across this grid, derived from the grid itself
 * and never typed: the corner sits at the geometric middle, so the bottom of
 * the band reads well under the flat part and the top reads near it.
 *
 * A curve that shifted the whole band alike would be indistinguishable from
 * flat to `bandStd` — it is level-invariant — and every claim below would be
 * vacuous.
 */
const STEP_HZ = Math.sqrt(V2_GRID[0] * V2_GRID[V2_GRID.length - 1]);
const DEPTH_DB = 6;
const TARGET = targetLevelCurveFor(
  { type: 'bass-plateau', plateauDepthDb: DEPTH_DB, stepHz: STEP_HZ },
  V2_GRID,
)!;

/** Short budget: every claim here is about the REFERENCE, not about quality. */
function run(extra: Partial<NetOptimizeOptions>) {
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    staged: { rippleDb: 1.5, phaseDeg: 8 },
    maxIterations: 120,
    ...extra,
  });
}

describe('V45 — de amplitudereferentie als keuze van de tuner', () => {
  it('de doelcurve is op deze fixture aantoonbaar niet vlak', () => {
    /* De premisse onder alles hieronder, geassert in plaats van aangenomen: op
     * dit raster moet de curve echt kantelen, anders zijn "hij verandert niets"
     * en "hij is aangesloten" niet te onderscheiden. */
    expect(isFlatTargetLevel(TARGET)).toBe(false);
    const ends = targetLevelAt(TARGET, [V2_GRID[0], V2_GRID[V2_GRID.length - 1]]);
    expect(ends[0] - ends[1]).toBeLessThan(-1);
  });

  it('P2 — afwezig en de historische referentie zijn byte-identieke runs', () => {
    /* De default is niet aangeraakt, en dat is de toggle-belofte in het klein:
     * élke v1-run, élke aanroeper die niets stelt, zoekt het veld dat hij altijd
     * zocht. Zou dit falen, dan is V45 geen v2-wijziging maar een
     * gedragswijziging die zich als er een voordoet. */
    const absent = run({});
    const legacy = run({ amplitudeReference: 'flat', amplitudeTargetDb: TARGET });
    expect(legacy.parts).toEqual(absent.parts);
    expect(legacy.after.rippleDb).toBe(absent.after.rippleDb);
    expect(legacy.after.phaseDeg).toBe(absent.after.phaseDeg);
  });

  it('P4 — een genoemde referentie zonder curve verandert NIETS en verzint er geen', () => {
    /* Precies wat een stille terugval niet doet. Er is geen doelcurve, dus er
     * is niets om vlak tegen te zijn, en de term meet wat hij altijd mat. Het
     * alternatief dat dit uitsluit is een implementatie die bij ontbrekende
     * data een voicing VERZINT — dezelfde fout als de analyse-grid-terugval die
     * V32 uit de poorten heeft gehaald. */
    const absent = run({});
    for (const bare of [
      { amplitudeReference: 'target' } as const,
      { amplitudeReference: 'target' as const, amplitudeTargetDb: null },
      { amplitudeReference: 'target' as const, amplitudeTargetDb: { freqHz: [], db: [] } },
    ]) {
      const r = run(bare);
      expect(r.parts).toEqual(absent.parts);
      expect(r.after.rippleDb).toBe(absent.after.rippleDb);
    }
  });

  it('P2 — een VLAKKE doelcurve is de identiteit, niet een gewapend mechanisme', () => {
    /* Een curve van nullen aftrekken is rekenkundig de identiteit, en dat zou
     * ook zonder deze test waar zijn. Wat hier gepind wordt is dat de tuner het
     * ook zo BEHANDELT — dat "een ontwerp dat de neutrale referentie stelt"
     * hetzelfde veld doorzoekt als "een ontwerp dat niets stelt", en dat die
     * gelijkheid een eigenschap van deze code is en niet van drijvende komma. */
    const absent = run({});
    const flatCurve = { freqHz: [...V2_GRID], db: V2_GRID.map(() => 0) };
    const stated = run({ amplitudeReference: 'target', amplitudeTargetDb: flatCurve });
    expect(stated.parts).toEqual(absent.parts);
    expect(stated.after.rippleDb).toBe(absent.after.rippleDb);
  });

  it('V23 — de referentie BEREIKT de zoektocht: er komt een ander netwerk uit', () => {
    /* De claim die de drie hierboven iets waard maakt. Zonder deze tegenproef
     * zijn zij alle drie even waar voor een sleutel die nergens op aangesloten
     * is — en dat is precies de toestand die V23 op vier budgetten tegelijk
     * aantrof. */
    const flat = run({});
    const voiced = run({ amplitudeReference: 'target', amplitudeTargetDb: TARGET });
    const values = (r: typeof flat): string =>
      JSON.stringify(
        r.parts.map((p) => [p.type, p.params.map((q) => [q.name, q.value])]),
      );
    expect(values(voiced)).not.toBe(values(flat));
  });

  it('de zoektocht meet de spreiding van (som MINUS doel), en dat is te zien', () => {
    /* De richting van het effect, en zij is de enige die er is. Vlakheid TEN
     * OPZICHTE VAN de voicing is wat er geoptimaliseerd wordt, dus het geleverde
     * netwerk hoort tegen de VOICING vlakker te liggen dan het netwerk dat tegen
     * horizontaal is gezocht — ook al leest het tegen horizontaal ruwer, wat het
     * doet en wat correct is.
     *
     * Gemeten op de tuner-eigen rapportage: `rippleDb` is de spreiding rond het
     * bandgemiddelde van de kromme die de term las. Een implementatie die de
     * sleutel accepteert en hem niet in het objectief stopt zou hier de twee
     * runs gelijk laten uitvallen. */
    const flat = run({});
    const voiced = run({ amplitudeReference: 'target', amplitudeTargetDb: TARGET });
    expect(voiced.after.rippleDb).not.toBe(flat.after.rippleDb);
    // ...and the voiced run really did land somewhere else, so the difference
    // is not one network reported two ways.
    expect(voiced.parts).not.toEqual(flat.parts);
  });
});
