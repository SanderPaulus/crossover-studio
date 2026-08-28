/**
 * V36 — WAAR DE DISSIPATIETERM ZIJN PROBE LEEST, EN WAT DISSIPATIE NOG BEWAAKT.
 *
 * DE VRAAG WAARMEE DE SESSIE BEGON, en het antwoord was geen van de twee die
 * verwacht werden. De doelfunctie telt bij elke evaluatie
 * `dissipationWeight · (R_source/re)²` op, met beide aflezingen bij de
 * bronweerstandsprobe. V34 verlegde die probe op de v2-route naar het
 * veiligheidsraster, en de vraag was of de term daardoor (a) is INGETROKKEN —
 * dan botst dat met A3j, want een grijze sleutel wordt expliciet overgenomen en
 * nooit stil op nul gezet — of (b) DOOD is door een randweigering, want dan
 * leest het doel het ene raster terwijl het oordeel het andere leest, de vorm
 * van V33 in een vierde gedaante.
 *
 * GEMETEN: geen van beide. De term LEEFT en hij leest hetzelfde raster als elke
 * andere lezer van diezelfde probe — `probeOn` in `netOptimizer.ts` is één
 * plek met vijf lezers, en de dissipatieterm is er één van. Wat de meting
 * daarnaast opleverde is de reden dat dit bestand bestaat: de term is te klein
 * om iets te beslissen. Op het levende casus-1-corpus draagt hij hoogstens
 * 0,34 % van de objectiefwaarde tegen een uitdagingsdrempel van 1 %, en dat
 * gold vóór V34 net zo goed. De getallen staan in
 * `scripts/measure-v36-dissipation.ts` en in
 * `manifest_en_geometrie.v36_dissipatie`; hier staan de claims die eronder
 * moeten blijven staan.
 *
 * WAT HIER NIET STAAT. Of de term GROOT genoeg is, en of hij de goede noemer
 * gebruikt. Het eerste is een gewichtsvraag en dus een besluit; het tweede is
 * V37. Dit bestand legt vast WELK getal de term vandaag leest, zodat een
 * reparatie zichtbaar faalt in plaats van stil te schuiven.
 */

import { describe, expect, it } from 'vitest';
import { optimizeNetworkValues, type NetOptimizeOptions } from '../../netOptimizer.ts';
import { sourceProbeIndex, sourceResistanceOhm } from '../../partAudit.ts';
import { GREY_KEYS } from './choices.ts';
import { v2DriverZ, v2Responses, v2Safety, v2SeedParts, V2_GRID } from './v2.fixture.ts';

const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
const safety = v2Safety();
const ADJUST = { offsetMm: 0, trimDb: 0, inverted: false } as const;

/**
 * De LAAGSTE weg, zoals de impedantiekaart hem noemt.
 *
 * Op de tweewegroute heet hij `woofer` in het zaad en `mid` in de
 * impedantiekaart (`canonicalModelForRole`) — dezelfde afbeelding die
 * `worker.ts` maakt. Als constante, omdat élke assert hieronder over dezelfde
 * weg gaat en een tweede spelling ervan een tweede claim zou zijn.
 */
const LOW = 'mid';

/** Een kort budget: elke claim hieronder gaat over een AFLEZING, niet over de
 *  kwaliteit van het netwerk eromheen. */
function run(extra: Partial<NetOptimizeOptions>) {
  return optimizeNetworkValues(v2SeedParts(), V2_GRID, wBase, tBase, driverZ, ADJUST, {
    phasePriority: 0.5,
    staged: { rippleDb: 1.5, phaseDeg: 8 },
    maxIterations: 120,
    ...extra,
  });
}

describe('V36 — de dissipatieterm leest de probe die de kandidaat stelt', () => {
  it('`dissipationWeight` is een GRIJZE sleutel, dus hij wordt expliciet gesteld', () => {
    /* A3j als assert, en het is de helft van de vraag waarmee deze sessie
     * begon: als de term stilzwijgend op nul zou staan, zou een gewicht dat
     * "overgenomen uit v1" heet in werkelijkheid uitgezet zijn. Hij staat in
     * GREY en nergens anders; `choiceKeyGuard.test.ts` bewaakt dat de drie
     * lijsten samen de sleutelverzameling volledig dekken. */
    expect(GREY_KEYS).toContain('dissipationWeight');
  });

  it('hij is NIET ingetrokken: de v2-route levert een dissipatieverhouding af', () => {
    const r = run({ safety, rSourceProbeSource: 'safety' });
    expect(r.tuned).toBeGreaterThan(0);
    expect(r.after.dissRatio, 'de term is stil weggevallen — gedaante (a)').toBeTypeOf('number');
    expect(r.after.dissRatio!).toBeGreaterThan(0);
  });

  it('...en hij is niet dood door een randweigering — hij leest wat de kandidaat stelt', () => {
    /* Gedaante (b) zou zo zijn: de term valt weg door een weigering die niemand
     * genomen heeft. Op deze tweewegfixture is het ketenraster voor déze probe
     * werkelijk onbruikbaar — de piek van de laagste weg ligt op `grid[0]`, en
     * die rand wordt door élke randregel geweigerd, ook de historische
     * (ISSUE #14). Dát is wat de v2-route repareert door de bron te STELLEN: op
     * het veiligheidsraster is er een echte binnenpiek, en daar leeft de term.
     * Beide helften staan er, want "hij leest de gestelde bron" is pas een
     * claim als de andere bron aantoonbaar iets anders doet (V23). */
    const onChainGrid = sourceProbeIndex(V2_GRID, driverZ[LOW], undefined, 'first');
    expect(onChainGrid?.idx, 'de fixture heeft geen randgeval meer op de laagste weg').toBe(0);
    expect(onChainGrid?.inBand).toBe(false);
    expect(run({ safety, rSourceProbeSource: 'grid' }).after.dissRatio).toBeUndefined();

    const onSafety = sourceProbeIndex(safety.freqs, safety.z[LOW], undefined, 'both');
    expect(onSafety?.inBand, 'het veiligheidsraster probet niet meer binnen de band').toBe(true);
    expect(run({ safety, rSourceProbeSource: 'safety' }).after.dissRatio).toBeTypeOf('number');
  });

  it('de verhouding IS de aflezing op dat raster — teller én noemer', () => {
    /* Exact tot negen decimalen: een term die een ander raster leest kan deze
     * gelijkheid niet halen. De twee grootheden worden nagerekend zoals
     * `metricsOn` ze samenstelt — R_source bij de probe, gedeeld door de reële
     * impedantie van de laagste weg BIJ DIEZELFDE probe — op het netwerk dat de
     * run afleverde. Geen enkel getal staat in dit bestand. */
    const r = run({ safety, rSourceProbeSource: 'safety' });
    const zl = safety.z[LOW];
    const probe = sourceProbeIndex(safety.freqs, zl, undefined, 'both');
    expect(probe?.inBand).toBe(true);
    const rs = sourceResistanceOhm(r.parts, {
      grid: safety.freqs,
      driverZ: safety.z,
      edgeRule: 'both',
    });
    expect(rs).not.toBeNull();
    const re = Math.max(0.5, zl[probe!.idx].re);
    expect(r.after.dissRatio!).toBeCloseTo(rs! / re, 9);
  });

  it('...en die noemer is de PIEKHOOGTE, niet de DC-weerstand (V37, opgeworpen)', () => {
    /* De bevinding die V36 opwerpt en niet repareert. De term heet
     * `(R_source/R_e)²` en zijn reden van bestaan is Q_es-vermenigvuldiging,
     * die op de DC-weerstand rust — maar hij deelt door `Re(Z)` BIJ de probe,
     * en sinds V34 zit die probe op een impedantiepiek. Vastgelegd als een feit
     * over de code van vandaag, met de factor afgeleid uit de kromme zelf en
     * nooit ingetypt: de piek gedeeld door de aflezing op het onderste
     * rasterpunt. Een reparatie moet hier zichtbaar op stuklopen. */
    const zl = safety.z[LOW];
    const probe = sourceProbeIndex(safety.freqs, zl, undefined, 'both');
    const peak = Math.max(0.5, zl[probe!.idx].re);
    const nearDc = Math.max(0.5, zl[0].re);
    expect(peak / nearDc, 'de fixture heeft geen piek meer op de laagste weg').toBeGreaterThan(1.5);
  });

  it('een genoemde bron zonder data probet niets, en dan is er GEEN verhouding', () => {
    /* De V32/V33/V34-regel, toegepast op de term. Geen stille terugval naar het
     * evaluatieraster: dan zou de term het getal gebruiken dat de kandidaat
     * juist heeft ingetrokken, op de ene plek waar niemand kijkt. */
    const r = run({ rSourceProbeSource: 'safety' });
    expect(r.after.dissRatio).toBeUndefined();
    expect(r.rSourceProbeNote).toContain('nothing was probed');
  });
});
