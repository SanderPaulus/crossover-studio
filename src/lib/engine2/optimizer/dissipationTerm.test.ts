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
 * WAT HIER NIET STAAT. Of de term GROOT genoeg is — dat is een gewichtsvraag en
 * dus een besluit, en het gewicht is bij V36 noch bij V37 aangeraakt.
 *
 * WAT ER SINDS V37 WEL BIJ STAAT (het tweede blok): waardóór hij deelt. V36 legde
 * vast dat de noemer de PIEKHOOGTE was en niet R_e, en dat is nog steeds waar
 * voor de DEFAULT — de eerste claims hieronder pinnen dat. V37 geeft er een
 * tweede waarde naast die de v2-route stelt, en de claims daarover staan in het
 * blok onderaan.
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

  it('...en op de DEFAULT is die noemer de PIEKHOOGTE, niet de DC-weerstand', () => {
    /* De bevinding die V36 opwierp, en zij staat nog steeds — voor de DEFAULT.
     * De term heet `(R_source/R_e)²` en zijn reden van bestaan is
     * Q_es-vermenigvuldiging, die op de DC-weerstand rust; met
     * `dissipationReferenceSource` afwezig deelt hij door `Re(Z)` BIJ de probe,
     * en sinds V34 zit die probe op een impedantiepiek. V37 verplaatst niet
     * deze default maar geeft er een tweede waarde naast (zie het blok
     * hieronder): een v1-run leest hier nog exact hetzelfde getal. De factor
     * wordt uit de kromme zelf afgeleid en nooit ingetypt: de piek gedeeld door
     * de aflezing op het onderste rasterpunt. */
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

/* ================================================================== *
 * V37 — de noemer van die verhouding, als KEUZE
 * ================================================================== */

/**
 * DE R_e DIE DEZE FIXTURE KAN LEVEREN, afgeleid en nooit ingetypt.
 *
 * De tweewegfixture draagt geen meetset en dus geen opgeloste R_e uit de
 * A5c.1-hiërarchie. Wat zij wél heeft is de impedantiekromme van de laagste weg,
 * en de directe lage-frequentie-aflezing daarvan is precies wat `estimateRe`
 * teruggeeft wanneer er niets is opgelost — de terugval die `worker.ts` benoemt.
 * Goed genoeg voor deze claims, want zij gaan over WELKE noemer gebruikt wordt
 * en niet over hoe die noemer is opgelost.
 */
const LOW_RE_OHM = v2Safety().z[LOW][0].re;

describe('V37 — waar de dissipatieterm zijn noemer vandaan haalt', () => {
  it('P2 — afwezig en `probe` zijn byte-identieke runs, en alleen een gestelde bron geeft een noot', () => {
    /* Een mechanisme dat er alléén maar ís mag niets kosten. `'probe'` is de
     * historische aflezing, dus een v1-run en een run die haar met naam en
     * toenaam stelt moeten hetzelfde netwerk opleveren — anders is V37 geen
     * uitbreiding maar een gedragswijziging die zich als er een voordoet. */
    const absent = run({ safety, rSourceProbeSource: 'safety' });
    const stated = run({
      safety,
      rSourceProbeSource: 'safety',
      dissipationReferenceSource: 'probe',
    });
    expect(stated.parts).toEqual(absent.parts);
    expect(stated.after.dissRatio).toBe(absent.after.dissRatio);
    expect(absent.dissipationRefNote).toBeUndefined();
    expect(stated.dissipationRefNote).toContain('AT the probe frequency');
  });

  it('`re` BEREIKT de zoektocht — er komt aantoonbaar een ander netwerk uit', () => {
    /* De dragende claim, en zonder haar zijn de andere drie even waar voor een
     * sleutel die nergens op aangesloten is (V23). De noemer wordt op deze
     * fixture een factor kleiner, de verhouding dus groter, en het kwadraat
     * daarvan verplaatst de doelfunctie genoeg om een ander optimum te leveren.
     *
     * Het gewicht staat hier hoger dan de 0,05 van de app, en dat is gemeten en
     * niet gekozen: op deze fixture is de term bij 0,05 zó klein dat hij niets
     * verplaatst, en een test die dán groen wordt bewijst niet dat het kanaal
     * werkt maar dat het niemand opvalt. */
    const opts = { safety, rSourceProbeSource: 'safety' as const, dissipationWeight: 5 };
    const onProbe = run(opts);
    const onRe = run({
      ...opts,
      dissipationReferenceSource: 're',
      dissipationReferenceReOhm: { [LOW]: LOW_RE_OHM },
    });
    expect(onRe.after.dissRatio).toBeTypeOf('number');
    expect(onRe.parts, 'de gestelde noemer bereikt de zoektocht niet').not.toEqual(onProbe.parts);
  });

  it('de verhouding IS `R_source / R_e` — de teller onveranderd, de noemer de gestelde', () => {
    /* Exact tot negen decimalen, en de twee helften worden apart nagerekend:
     * de TELLER blijft de Thevenin-weerstand bij de probe (waar die gelezen
     * wordt is V34 en verandert hier niet), en de NOEMER is de R_e die de
     * aanroeper meegaf. Geen enkel getal staat in dit bestand. */
    const r = run({
      safety,
      rSourceProbeSource: 'safety',
      dissipationReferenceSource: 're',
      dissipationReferenceReOhm: { [LOW]: LOW_RE_OHM },
    });
    const rs = sourceResistanceOhm(r.parts, {
      grid: safety.freqs,
      driverZ: safety.z,
      edgeRule: 'both',
    });
    expect(rs).not.toBeNull();
    expect(r.after.dissRatio!).toBeCloseTo(rs! / LOW_RE_OHM, 9);

    /* ...en dat is aantoonbaar NIET de aflezing die de default gebruikt, anders
     * zou de gelijkheid hierboven ook waar zijn zonder de sleutel. */
    const probe = sourceProbeIndex(safety.freqs, safety.z[LOW], undefined, 'both')!;
    const peak = Math.max(0.5, safety.z[LOW][probe.idx].re);
    expect(Math.abs(peak - LOW_RE_OHM) / LOW_RE_OHM).toBeGreaterThan(0.5);
  });

  it('een gestelde `re` zonder R_e voor de laagste weg levert GEEN verhouding, en meldt welke invoer ontbrak', () => {
    /* De V32/V33/V34-regel, voor de derde keer en om dezelfde reden. Geen
     * stille terugval naar de piekhoogte: dan zou de term precies het getal
     * gebruiken dat V37 heeft ingetrokken, op de ene plek waar niemand kijkt.
     * Twee gevallen, want zij zien er van buiten hetzelfde uit en zijn het
     * niet: helemaal geen kaart, en een kaart die de VERKEERDE weg noemt. */
    const none = run({
      safety,
      rSourceProbeSource: 'safety',
      dissipationReferenceSource: 're',
    });
    expect(none.after.dissRatio).toBeUndefined();
    expect(none.dissipationRefNote).toContain('none reached this run');
    expect(none.dissipationRefNote).toContain('NOT fall back');

    const wrongWay = run({
      safety,
      rSourceProbeSource: 'safety',
      dissipationReferenceSource: 're',
      dissipationReferenceReOhm: { __not_a_driver__: LOW_RE_OHM },
    });
    expect(wrongWay.after.dissRatio).toBeUndefined();

    /* De tegenproef: dezelfde run mét de juiste weg LEVERT er wel een, dus de
     * afwezigheid hierboven is een weigering en geen kapotte opstelling. */
    expect(
      run({
        safety,
        rSourceProbeSource: 'safety',
        dissipationReferenceSource: 're',
        dissipationReferenceReOhm: { [LOW]: LOW_RE_OHM },
      }).after.dissRatio,
    ).toBeTypeOf('number');
  });

  it('...en zonder probe is er ook op `re` geen verhouding — de teller blijft V34s aflezing', () => {
    /* De noemer is een tweede vraag en geen vervanging van de eerste. Wordt de
     * probe geweigerd, dan is er geen R_source om te delen, en dan helpt een
     * perfect opgeloste R_e niet. Anders zou V37 stilzwijgend een teller
     * hebben teruggebracht die V34 juist heeft ingetrokken. */
    const r = run({
      rSourceProbeSource: 'safety',
      dissipationReferenceSource: 're',
      dissipationReferenceReOhm: { [LOW]: LOW_RE_OHM },
    });
    expect(r.after.dissRatio).toBeUndefined();
    expect(r.rSourceProbeNote).toContain('nothing was probed');
  });
});
