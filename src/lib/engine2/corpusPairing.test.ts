/**
 * DE LEESREGEL ONDER ELKE VÓÓR/NÁ-TABEL: EEN CORPUSGEMIDDELDE IS GEEN DELTA.
 *
 * Waarom dit bestand bestaat (V47-nazorg, 01-09-2026). `compare-corpora.ts`
 * drukt per grootheid een gemiddelde over het "vóór"-corpus en een gemiddelde
 * over het "ná"-corpus af. Die twee corpora bevatten niet dezelfde netlists —
 * dat is juist wat een gewapende eis DOET — dus het verschil ertussen draagt
 * twee dingen tegelijk: wat er met de overlevende ontwerpen gebeurde, en wie
 * er vertrok. Bij V47 leverde dat twee keer een verkeerde lezing op, en de
 * twee wijzen tegengesteld:
 *
 *   - de W-M-fase las als WINST (25,3° → 13,1°) terwijl de netlists die in
 *     BEIDE corpora staan er iets op ACHTERUIT gingen (11,96° → 13,06°); de
 *     winst zat volledig in het vertrek van de twee netlists die de nieuwe eis
 *     overschreden, en dat waren precies de twee met de slechtste fase;
 *   - de dissipatie las als VERLIES (60,4 % → 62,2 %) terwijl diezelfde vier
 *     overlevenden van 69,05 % naar 62,23 % gingen.
 *
 * De entry ving de eerste met een alinea eronder en de tweede helemaal niet.
 * Een leesregel die van een alinea afhangt is geen leesregel, dus staat de
 * GEPAARDE delta sinds deze sessie naast élk corpusgemiddelde in dat script,
 * en staat hij hier als test.
 *
 * WAT DEZE TEST WÉL EN NIET DEELT MET HET SCRIPT. Gedeeld zijn de twee plekken
 * waar zij ongemerkt uiteen kunnen lopen: het MEETPAD (`corpusBank` — dezelfde
 * doelcurve, dezelfde orden, dezelfde vloer, dezelfde afronding) en de
 * STATISTIEK (`pairedDelta`, dus dezelfde behandeling van een half-leeg paar).
 * Eigen aan deze test zijn de twee aflezingen uit het rapport; dat zijn
 * dezelfde twee die het script in zijn rij zet.
 *
 * GEEN KETENRUN EN GEEN ENKELE TUNE: beide corpushelften zijn bevroren
 * bestanden in de repo, en dit is de meting die iedereen erop kan herhalen.
 *
 * TWEE VERGELIJKINGEN, EN DE TWEEDE IS DE ANKERPROEF. V45 → levend is het
 * geval waar de misleiding zat; V30 → V32 is het tegenovergestelde en hij is
 * VOLLEDIG GEDATEERD, dus hij kan niet verouderen: V32 heeft geen enkel
 * ontwerp veranderd en alleen drie netlists ingetrokken, dus daar hóórt elke
 * gepaarde delta exact nul te zijn terwijl de corpusgemiddelden acht
 * procentpunten bewegen. Zonder die tweede helft zou "de twee lezingen
 * verschillen" niet te onderscheiden zijn van "de gepaarde lezing is een
 * andere manier om hetzelfde te zeggen".
 *
 * HERANKERD BIJ V48 (02-09-2026), EN PRECIES ZOALS VOORSPELD. De "ná"-helft van
 * de eerste vergelijking was het LEVENDE corpus, met de aantekening dat de
 * eerstvolgende regeneratie die getallen zou veranderen en dat het blok dan op
 * het dan bevroren V47-corpus herankerd hoorde te worden. V48 regenereert, dus
 * dat is gebeurd: `v45 → v47` in plaats van `v45 → live`, met dezelfde getallen
 * — het V47-corpus IS byte voor byte het veld dat hier "levend" heette, alleen
 * onder een naam die de volgende regeneratie niet overschrijft. Dezelfde
 * herankering die V43 op `v42_bult_bevinding` toepaste, en om dezelfde reden:
 * een bevinding die naar "het levende corpus" wijst wordt stil onwaar.
 *
 * BEIDE VERGELIJKINGEN ZIJN NU VOLLEDIG GEDATEERD en kunnen dus niet meer
 * verouderen. Dat is winst en geen verlies: wat deze test bewijst is een
 * eigenschap van de LEESREGEL — dat een corpusgemiddelde en een gepaarde delta
 * tegengesteld kunnen wijzen — en die eigenschap heeft geen levend veld nodig.
 */

import { describe, expect, it } from 'vitest';
import {
  corpusBank,
  corpusOf,
  mean,
  pairedCandidates,
  pairedDelta,
  round2,
  unionOfCandidates,
  type Corpus,
  type CorpusPair,
} from './casus1Corpora.fixture.ts';

/**
 * De marge waarmee de getallen van de tabellen gereproduceerd worden — wat
 * `toBeCloseTo(x, 1)` toelaat, hier benoemd omdat de laatste test hem gebruikt.
 *
 * Dit is GEEN tolerantieklasse uit het referentiebestand en hoort er ook geen
 * te zijn: die klassen dekken een fysische grootheid met meetonzekerheid, en
 * dit is de reproductie van een tabel die uit bevroren bestanden is gerekend.
 * Wat er nog wél in beweegt zijn de laatste cijfers van een
 * drijvende-komma-som op een andere runtime (V46), en dat is ordes kleiner.
 */
const REPRO_MARGIN = 0.05;

/** De twee aflezingen waarop V47's misleiding zat, per netlist — dezelfde twee
 *  die `compare-corpora.ts` in zijn rij zet, op dezelfde afronding. */
interface Row {
  /** M-K op het onderste paar: het gemiddelde |relatieve fase| over de punten
   *  die een fase-oordeel mogen dragen (V44). */
  wmPhase: number | null;
  /** M-A als percentage: de fractie van het versterkervermogen die in de
   *  weerstanden verdwijnt. */
  dissPct: number | null;
}

const PHASE = (r: Row) => r.wmPhase;
const DISS = (r: Row) => r.dissPct;

const bank = corpusBank();

function measure(key: string): Row {
  const rep = bank.report(key);
  const wm = rep.system.phaseTracking.find((p) => p.lower === 'woofer');
  const fraction = rep.metrics.dissipation?.totalFraction;
  return {
    wmPhase: round2(wm?.meanAbsDeg ?? null),
    dissPct: round2(fraction === undefined || fraction === null ? null : fraction * 100),
  };
}

/** Eén vergelijking, opgebouwd zoals het script haar opbouwt: de vereniging
 *  van beide corpora aflopen, per kandidaat meten wat er te meten valt, en de
 *  paren onderweg verzamelen in plaats van ze achteraf te reconstrueren. */
function compare(beforeId: string, afterId: string) {
  const before: Corpus = corpusOf(beforeId);
  const after: Corpus = corpusOf(afterId);
  const measuredBefore: Row[] = [];
  const measuredAfter: Row[] = [];
  const pairs: CorpusPair<Row>[] = [];
  for (const label of unionOfCandidates(before, after)) {
    const bKey = before.byCandidate.get(label);
    const aKey = after.byCandidate.get(label);
    const b = bKey ? measure(bKey) : null;
    const a = aKey ? measure(aKey) : null;
    if (b) measuredBefore.push(b);
    if (a) measuredAfter.push(a);
    if (b && a) pairs.push({ label, before: b, after: a });
  }
  return {
    before,
    after,
    pairs,
    corpus: (pick: (r: Row) => number | null) => ({
      before: mean(measuredBefore.map(pick)),
      after: mean(measuredAfter.map(pick)),
    }),
    paired: (pick: (r: Row) => number | null) => pairedDelta(pairs, pick),
  };
}

const v47 = compare('v45', 'v47');
const v32 = compare('v30', 'v32');
/* V51b — het UITERSTE van de leesregel, volledig gedateerd: het V51-corpus is
 * één netlist en het V50-corpus draagt haar niet, dus V50 → V51 heeft GEEN
 * ENKEL PAAR. Elk corpusgemiddelde over die stap is dan compositie en niets
 * anders, en de gepaarde lezing hoort dat te ZEGGEN (n = 0, geen getal) in
 * plaats van een gemiddelde over niets af te drukken. Herankerd bij V51b op
 * twee gedateerde corpora, zoals V43 op `v42_bult_bevinding` deed. */
const v51 = compare('v50', 'v51');

describe('de gepaarde delta naast het corpusgemiddelde (V47-nazorg)', () => {
  it('koppelt op KANDIDAAT, en het V47-veld is een deelverzameling van het V45-veld', () => {
    /* Zeven vóór, vier ná, en alle vier de overlevenden stonden er al: er is
     * NIETS bijgekomen. Dat maakt deze vergelijking het scherpst mogelijke
     * geval — het hele verschil tussen de twee lezingen zit in wie vertrok. */
    expect(v47.before.byCandidate.size).toBe(7);
    expect(v47.after.byCandidate.size).toBe(4);
    const paired = pairedCandidates(v47.before, v47.after);
    expect(paired).toHaveLength(4);
    expect([...paired].sort()).toEqual([...v47.after.byCandidate.keys()].sort());
    expect(v47.pairs.map((p) => p.label).sort()).toEqual([...paired].sort());
  });

  it('W-M fase: het corpusgemiddelde leest als winst, de gepaarde delta als verlies', () => {
    const c = v47.corpus(PHASE);
    const d = v47.paired(PHASE);

    expect(c.before).toBeCloseTo(25.31, 1);
    expect(c.after).toBeCloseTo(13.06, 1);
    expect(d.n).toBe(4);
    expect(d.before).toBeCloseTo(11.96, 1);
    expect(d.after).toBeCloseTo(13.06, 1);

    /* DE CLAIM, en zij is een richtingsclaim en geen getal: dezelfde
     * grootheid, dezelfde twee corpora, en de twee lezingen wijzen
     * TEGENGESTELD. Wie de corpusregel als resultaat van de ingreep leest,
     * schrijft een verbetering toe aan een mechanisme dat haar niet geleverd
     * heeft. */
    expect(c.after!).toBeLessThan(c.before!);
    expect(d.after!).toBeGreaterThan(d.before!);
  });

  it('dissipatie: het corpusgemiddelde leest als verlies, de gepaarde delta als winst', () => {
    const c = v47.corpus(DISS);
    const d = v47.paired(DISS);

    expect(c.before).toBeCloseTo(60.36, 1);
    expect(c.after).toBeCloseTo(62.23, 1);
    expect(d.n).toBe(4);
    expect(d.before).toBeCloseTo(69.05, 1);
    expect(d.after).toBeCloseTo(62.23, 1);

    /* De spiegel van de fase-claim: hier wijst het corpusgemiddelde omhoog en
     * de gepaarde delta omlaag. Twee grootheden, twee richtingen, één oorzaak
     * — de compositie van het veld. */
    expect(c.after!).toBeGreaterThan(c.before!);
    expect(d.after!).toBeLessThan(d.before!);
  });

  it('het hele verschil zit in de VÓÓR-helft, want elke ná-netlist is gepaard', () => {
    /* De controle die de twee claims hierboven aan elkaar knoopt: omdat er
     * niets is bijgekomen, is het gepaarde ná-gemiddelde per constructie
     * hetzelfde getal als het corpusgemiddelde ná. Alles wat verschilt staat
     * dus aan de kant van het corpus dat netlists verloor, en dat is precies
     * de bewering die de gepaarde kolom doet. */
    for (const pick of [PHASE, DISS]) {
      const c = v47.corpus(pick);
      const d = v47.paired(pick);
      expect(d.after).toBeCloseTo(c.after!, 6);
      expect(d.before).not.toBeCloseTo(c.before!, 1);
    }
  });

  it('V30 → V32: geen ontwerp bewoog, dus élke gepaarde delta is EXACT nul', () => {
    /* De ankerproef, volledig op gedateerde corpora en dus onverouderbaar.
     * V32 heeft geen enkel ontwerp veranderd: zeven van de tien V30-netlists
     * zijn er byte-identiek in overgenomen en drie zijn ingetrokken omdat zij
     * de vloer misten op een gebied waar de oude poort niet keek. Precies daar
     * hoort de gepaarde delta nul te zijn — en het corpusgemiddelde is dat
     * aantoonbaar niet. */
    expect(v32.before.byCandidate.size).toBe(10);
    expect(v32.after.byCandidate.size).toBe(7);
    expect(v32.pairs).toHaveLength(7);

    for (const pick of [PHASE, DISS]) {
      const c = v32.corpus(pick);
      const d = v32.paired(pick);
      expect(d.n).toBe(7);
      expect(d.after! - d.before!).toBe(0);
      expect(Math.abs(c.after! - c.before!)).toBeGreaterThan(1);
    }

    /* En de bewegende helft met naam, zodat een lezer ziet hoe groot het
     * compositie-effect hier is: bijna acht procentpunten dissipatie en drie
     * graden fase, alle twee volledig opgewekt door drie vertrekkende
     * netlists. */
    expect(v32.corpus(DISS).before).toBeCloseTo(19.16, 1);
    expect(v32.corpus(DISS).after).toBeCloseTo(26.97, 1);
    expect(v32.corpus(PHASE).before).toBeCloseTo(17.34, 1);
    expect(v32.corpus(PHASE).after).toBeCloseTo(20.39, 1);
  });

  it('V50 → V51: geen enkel paar, dus de gepaarde lezing zegt n = 0 en drukt GEEN delta af', () => {
    expect(v51.before.byCandidate.size).toBe(7);
    expect(v51.after.byCandidate.size).toBe(1);
    expect(pairedCandidates(v51.before, v51.after)).toHaveLength(0);
    expect(v51.pairs).toHaveLength(0);
    for (const pick of [PHASE, DISS]) {
      const d = v51.paired(pick);
      expect(d.n).toBe(0);
      expect(d.before).toBeNull();
      expect(d.after).toBeNull();
      // ...terwijl het corpusgemiddelde er aan beide kanten wél staat: dat IS het compositie-effect zonder één paar eronder.
      const c = v51.corpus(pick);
      expect(c.before).not.toBeNull();
      expect(c.after).not.toBeNull();
    }
  });

  it('een paar waarvan één helft niets meet telt aan GEEN van beide kanten mee', () => {
    /* Anders zou de gepaarde delta opnieuw twee verschillende verzamelingen
     * naast elkaar zetten — het defect dat zij moet wegnemen, één laag dieper.
     * Met de tegenproef ernaast: hetzelfde paar mét waarde telt wél mee. */
    const half: CorpusPair<Row>[] = [
      { label: 'a', before: { wmPhase: 10, dissPct: null }, after: { wmPhase: 20, dissPct: 50 } },
      { label: 'b', before: { wmPhase: 30, dissPct: 10 }, after: { wmPhase: 40, dissPct: 30 } },
    ];
    const d = pairedDelta(half, DISS);
    expect(d.n).toBe(1);
    expect(d.before).toBe(10);
    expect(d.after).toBe(30);

    const both = pairedDelta(half, PHASE);
    expect(both.n).toBe(2);
    expect(both.before).toBe(20);
    expect(both.after).toBe(30);
  });

  it('de marge is scherp genoeg om de twee lezingen te onderscheiden', () => {
    /* Nagemeten dat hij kán falen: het verschil dat deze test moet zien is de
     * afstand tussen het corpusgemiddelde en de gepaarde lezing, en die is
     * twee ordes groter dan de marge waarmee hij vergelijkt. Een test die dat
     * niet vastlegt kan groen blijven op een marge die beide lezingen
     * doorlaat. */
    const gap = Math.abs(v47.corpus(PHASE).before! - v47.paired(PHASE).before!);
    expect(gap).toBeGreaterThan(REPRO_MARGIN * 100);
  });
});
