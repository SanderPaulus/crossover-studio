/**
 * V48 — WELK NETWERK HET SERIESPOEL-PLAFOND BESCHRIJFT, ALS KEUZE VAN DE TUNER.
 *
 * DE BEVINDING WAAR DIT UIT VOORTKOMT. De A5d.6-inversie `bump-series-l` keert
 * het LF-budget om naar een plafond op de seriespoel van de laagste weg BIJ EEN
 * GEGEVEN PADWEERSTAND — en de padweerstand is een van de dingen die de tune
 * verplaatst. Het plafond wordt één keer opgelost, bij het ZAAD, en staat
 * daarna vast. V45 schreef dat gat op en beredeneerde dat het veilig was: meer
 * serieweerstand dempt de resonante helft, dus een plafond opgelost bij 0,5 Ω
 * is bij 3 Ω te streng en niet verkeerd. Dat klopt, en het laat de andere
 * richting weg. Een tune die de padweerstand VERLAAGT draagt een plafond dat
 * voor een beter gedempt netwerk is opgelost, en dan is het TOEGEEFLIJK.
 * Sanders browserrun van 01-09-2026 is de meting: twee van negen kandidaten
 * leverden 2,29 en 1,61 dB opslingering tegen een gestelde 1,4, en de
 * geleverde-netwerk-toets (V45) ving ze allebei. Vangen is verliezen — dat
 * waren legitieme kandidaten die met een plafond over hún eigen netwerk gestuurd
 * hadden kunnen worden in plaats van aan het eind weggegooid.
 *
 * WAT DIT BESTAND PINT, en wat elders staat. Hier staan de claims over de
 * TUNER, en zij worden bewust op een SYNTHETISCH plafond gedaan: de vraag is of
 * de tuner het plafond op het juiste moment en bij de juiste padweerstand
 * afleest, niet of de inversie klopt. Een echte inversie hier zou twee dingen
 * tegelijk toetsen en bij een fout niet zeggen welke van de twee.
 * De inversie zelf staat in `lfBumpBorder.test.ts` en
 * `boundInversions.test.ts`; wat zij op het ECHTE casusboek doet (en dat de
 * monotonie waar de kwantisering op rust gemeten is) in
 * `frozenNetlistGates.test.ts`; de classificatie en de kandidaatverklaring in
 * `choiceKeyGuard.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { H_PER_MH } from '../constants.ts';
import { v2DriverZ, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;

/* ------------------------------------------------------------------ *
 * De groep, afgeleid uit de fixture en nergens ingetypt
 * ------------------------------------------------------------------ */

const SEED = v2SeedParts();
const valOf = (id: string, name: string): number =>
  SEED.find((p) => p.partId === id)!.params.find((q) => q.name === name)!.value;

/** De vrije seriespoel van de lage weg, en de weerstand die met haar meebeweegt. */
const COIL_ID = 'L1';
const RES_ID = 'R1';
/** Wat een waardetune NIET verplaatst: de DCR van beide spoelen van deze weg. */
const PATH_R_BASE = valOf('L1', 'DCR') + valOf('L2', 'DCR');
const SEED_PATH_R = PATH_R_BASE + valOf(RES_ID, 'R');
/** Het zaadplafond: ruim boven de zaadspoel, zodat het zaad zelf toelaatbaar is. */
const SEED_CEILING_SI = valOf(COIL_ID, 'L') * H_PER_MH * 2;

/**
 * Het synthetische plafond, met exact de eigenschap die de echte inversie heeft
 * en die de hele sessie draagt: het STIJGT met de padweerstand. Meer
 * serieweerstand dempt de resonante helft, dus er past meer spoel in hetzelfde
 * budget. Evenredig gekozen zodat er niets in te typen valt — bij de
 * padweerstand van het zaad geeft hij per constructie precies het zaadplafond
 * terug, en elke afwijking ervan is dus zichtbaar als een BEWEGING en niet als
 * een ander getal.
 */
const asked: number[] = [];
const ceilingAt = (pathROhm: number): number | null => {
  asked.push(pathROhm);
  return SEED_CEILING_SI * (pathROhm / SEED_PATH_R);
};

function group(extra: Record<string, unknown> = {}) {
  return [
    {
      ids: [COIL_ID],
      maxSI: SEED_CEILING_SI,
      fixedSI: 0,
      label: 'mid series inductance',
      ...extra,
    },
  ] as NonNullable<NetOptimizeOptions['valueSumCeilings']>;
}

const tracked = (fn = ceilingAt) =>
  group({ resistanceIds: [RES_ID], pathRBaseOhm: PATH_R_BASE, ceilingAt: fn });

/** Kort budget: elke claim hier gaat over het PLAFOND, niet over kwaliteit. */
function run(extra: Partial<NetOptimizeOptions>) {
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    staged: { rippleDb: 1.5, phaseDeg: 8 },
    maxIterations: 120,
    ...extra,
  });
}

/** De tuner schrijft elke waarde weg op vier significante cijfers; dichter dan
 *  dat kan een geleverd onderdeel het punt dat gescoord is niet reproduceren. */
const WRITE_OUT_TOLERANCE = 1e-3;

const inductanceOf = (parts: readonly { partId?: string; params: { name: string; value: number }[] }[]): number =>
  parts.find((p) => p.partId === COIL_ID)!.params.find((q) => q.name === 'L')!.value;
const resistanceOf = (parts: readonly { partId?: string; params: { name: string; value: number }[] }[]): number =>
  parts.find((p) => p.partId === RES_ID)!.params.find((q) => q.name === 'R')!.value;

describe('V48 — het seriespoel-plafond volgt de tune', () => {
  it('de premisse: het synthetische plafond beweegt echt met de padweerstand', () => {
    /* Zonder deze assert zijn alle claims hieronder even waar voor een functie
     * die overal hetzelfde getal teruggeeft, en dan meten zij niets. */
    expect(ceilingAt(SEED_PATH_R)).toBeCloseTo(SEED_CEILING_SI, 12);
    expect(ceilingAt(SEED_PATH_R / 2)!).toBeLessThan(SEED_CEILING_SI);
    expect(ceilingAt(SEED_PATH_R * 2)!).toBeGreaterThan(SEED_CEILING_SI);
    asked.length = 0;
  });

  it('P2 — afwezig en `seed` zijn byte-identieke runs, ook met de tracker erbij', () => {
    /* De default is niet aangeraakt: élke v1-run en élke aanroeper die niets
     * stelt zoekt het veld dat hij altijd zocht. En de tweede helft is de
     * eigenlijke P2-claim — een groep die de tracker MEEDRAAGT maar niet
     * gelezen wordt kost niets. Zou dat falen, dan zou het wapenen zelf een
     * gedragswijziging zijn en was de vóór/ná-meting van V48 geen vergelijking
     * meer maar twee verschillende dingen. */
    const absent = run({ valueSumCeilings: group() });
    const seed = run({ valueSumCeilings: tracked(), seriesInductanceCeilingSource: 'seed' });
    expect(seed.parts).toEqual(absent.parts);
    expect(seed.after.rippleDb).toBe(absent.after.rippleDb);
    expect(seed.after.phaseDeg).toBe(absent.after.phaseDeg);
  });

  it('P4 — `tuned` zonder tracker verandert NIETS en verzint er geen', () => {
    /* Precies wat een stille terugval niet doet. Er is geen functie, dus er is
     * niets om bij de huidige padweerstand af te lezen, en het opgeloste
     * zaadplafond staat. Het alternatief dat dit uitsluit is een implementatie
     * die bij ontbrekende data een plafond VERZINT — dezelfde fout als de
     * analyse-grid-terugval die V32 uit de poorten heeft gehaald. */
    const absent = run({ valueSumCeilings: group() });
    const stated = run({ valueSumCeilings: group(), seriesInductanceCeilingSource: 'tuned' });
    expect(stated.parts).toEqual(absent.parts);
  });

  it('P4 — een tracker zonder antwoord laat het ZAADPLAFOND staan, nooit nul', () => {
    /* `null` betekent dat de metriek op de meegegeven metingen niets te
     * antwoorden had, en een plafond van nul zou daar "geen enkele spoel is
     * toegestaan" van maken — een ontwerpuitspraak op een dataprobleem. Het
     * zaadplafond staat dan, wat exact de toestand van vóór V48 is. */
    const absent = run({ valueSumCeilings: group() });
    const blind = run({
      valueSumCeilings: tracked(() => null),
      seriesInductanceCeilingSource: 'tuned',
    });
    expect(blind.parts).toEqual(absent.parts);
  });

  it('V48 — het plafond wordt afgelezen bij de padweerstand van het HUIDIGE netwerk', () => {
    /* DE DRAGENDE CLAIM. Niet "er is een functie aangeroepen" maar "hij is
     * aangeroepen bij padweerstanden die het ZAAD niet had". Zonder die tweede
     * helft is elke aflezing verenigbaar met een implementatie die het
     * zaadgetal doorgeeft, en dat is precies de toestand van vóór V48. */
    asked.length = 0;
    run({ valueSumCeilings: tracked(), seriesInductanceCeilingSource: 'tuned' });
    expect(asked.length).toBeGreaterThan(1);
    expect(new Set(asked.map((v) => v.toFixed(9))).size).toBeGreaterThan(1);
    /* Elke aflezing ligt boven de basis die een waardetune niet verplaatst — de
     * DCR van de spoelen — want de vrije weerstand kan alleen optellen. */
    for (const v of asked) expect(v).toBeGreaterThanOrEqual(PATH_R_BASE);
    /* De eerste aflezing IS de padweerstand van het zaad (het startpunt wordt
     * ook geëvalueerd), en er wordt daarna aantoonbaar hoger gelezen. */
    expect(Math.min(...asked)).toBeCloseTo(SEED_PATH_R, 9);
    expect(Math.max(...asked)).toBeGreaterThan(SEED_PATH_R);
  });

  it('V48 — het GELEVERDE netwerk staat onder het plafond van zijn EIGEN padweerstand', () => {
    /* De claim in de vorm waarin V48 hem nodig heeft, en de enige vorm die niet
     * van de richting van de zoektocht afhangt. Wat er misging is niet dat het
     * plafond de verkeerde waarde had maar dat het het verkeerde NETWERK
     * beschreef: opgelost bij het zaad, toegepast op iets anders. De toets
     * daarop is dus niet een getal maar een gelijkheid — de geleverde spoel
     * tegen het plafond bij de padweerstand die het geleverde netwerk zelf
     * draagt.
     *
     * De marge is de AFRONDING VAN HET WEGSCHRIJVEN en niets anders: de tuner
     * schrijft elke waarde weg op vier significante cijfers, dus de geleverde
     * spoel kan de laatste geprojecteerde waarde niet exacter reproduceren dan
     * dat. Gemeten op deze fixture: 0,9122 mH geleverd tegen een plafond van
     * 0,9124 mH bij een geleverde padweerstand van 1,551 Ω. */
    const tune = run({ valueSumCeilings: tracked(), seriesInductanceCeilingSource: 'tuned' });
    const deliveredPathR = PATH_R_BASE + resistanceOf(tune.parts);
    const ceilingThere = ceilingAt(deliveredPathR)!;
    const deliveredSI = inductanceOf(tune.parts) * H_PER_MH;
    expect(deliveredSI).toBeLessThanOrEqual(ceilingThere * (1 + WRITE_OUT_TOLERANCE));
    /* En hij staat er ook werkelijk TEGEN — een spoel die ver onder het plafond
     * eindigt zou de assert hierboven halen zonder dat het plafond iets deed. */
    expect(deliveredSI).toBeGreaterThan(ceilingThere * (1 - WRITE_OUT_TOLERANCE));
    /* Het plafond dat hier gehandhaafd is, is aantoonbaar NIET het zaadplafond. */
    expect(Math.abs(ceilingThere - SEED_CEILING_SI)).toBeGreaterThan(
      SEED_CEILING_SI * WRITE_OUT_TOLERANCE,
    );
  });

  it('V23 — het volgende plafond BEREIKT de zoektocht: een ander netwerk', () => {
    /* De claim die de vier hierboven iets waard maakt. Zonder deze tegenproef
     * zijn zij alle vier even waar voor een sleutel die nergens op aangesloten
     * is — de toestand die V23 op vier budgetten tegelijk aantrof.
     *
     * DE RICHTING OP DEZE FIXTURE IS DE CONSERVATIEVE, en dat wordt hier
     * opgeschreven in plaats van weggewerkt: de tune loopt hier NAAR EEN HOGERE
     * padweerstand (1,36 → 1,55 Ω), dus het zaadplafond was te STRENG en de
     * volgende arm krijgt meer ruimte en gebruikt hem (0,800 → 0,912 mH). Dat
     * is de richting die V45 al beredeneerde. De andere richting — een tune die
     * de padweerstand verlaagt, waar het zaadplafond TOEGEEFLIJK wordt en de
     * geleverde-netwerk-toets moet ingrijpen — is geen eigenschap van een
     * doelfunctie die je op een tweewegfixture kunt bestellen; zij is gemeten
     * op het echte veld, en dat bewijsmateriaal staat in
     * `scripts/measure-v48-ceiling-tracking.ts` en in casusboek V48. */
    const seed = run({ valueSumCeilings: tracked(), seriesInductanceCeilingSource: 'seed' });
    const tune = run({ valueSumCeilings: tracked(), seriesInductanceCeilingSource: 'tuned' });
    expect(tune.parts).not.toEqual(seed.parts);
    expect(inductanceOf(seed.parts) * H_PER_MH).toBeLessThanOrEqual(
      SEED_CEILING_SI * (1 + WRITE_OUT_TOLERANCE),
    );
    expect(inductanceOf(tune.parts)).toBeGreaterThan(inductanceOf(seed.parts));
  });
});
