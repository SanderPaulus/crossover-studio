/**
 * H-5 (veegronde a) — EEN WEG DIE EEN SERIECONDENSATOR DRAAGT, HOUDT ER EEN.
 *
 * DE VUISTREGEL EN WAT ER VAN OVERBLEEF. "De tweeter hangt altijd achter een
 * condensator" is de enige polariteitsloze beschermingsregel die de literatuur
 * onvoorwaardelijk stelt: zonder seriecondensator ziet de spreekspoel het volle
 * laag van de versterker, ook als de akoestische som er goed uitziet.
 *
 * DE ENUMERATIE KAN HEM NIET KWIJTRAKEN, en dat is nagegaan en niet aangenomen
 * (`scripts/measure-h5-series-c.ts`). De hoogdoorlaatladder van `synthesis.ts`
 * begint bij ÉLKE orde met een serie-C (`i % 2 === 0` op i = 0), en beide
 * ontwerpstappen zetten de hoogdoorlaat van de bovenste weg onvoorwaardelijk
 * aan (`specsFor` in `threeWayDesign.ts`, `baseSpecs` in `vfOptimizer.ts`).
 * Gemeten over het hele casusboek: 378 hoogdoorlaatbeschermde wegen op 192
 * bevroren netlists, NUL zonder serie-C.
 *
 * WAAR HET GAT WÉL ZAT: DE VERWIJDERING. De trapsgewijze snoei laat een
 * geopende serie-C voortleven als DRAAD, en de onderdelenaudit heeft op casus 1
 * aantoonbaar al een C uit een val gehaald (A5e.3b (c3) noemt de wees die
 * daarvan overbleef). Wat hen tegenhield was geen regel over bescherming maar
 * de eis dat een verwijdering de som, de paarfase en |Z| niet verplaatst — en
 * dat is precies de zin die F2 al over de poorten schreef: **"inert" wordt
 * gemeten op de som, de paarfase en Z, en geen van drieën is de vraag of deze
 * driver gelijkspanning overleeft.** Een tak die om een andere reden dood ligt
 * is akoestisch inert mét en zónder zijn condensator; hem weghalen kost dan
 * niets aan de som en alles aan de driver.
 *
 * DE REGEL NOEMT GEEN ENKELE WEG BIJ NAAM, EN ZIJ SLUIT ER ÉÉN UIT: de
 * LAAGSTE. Niet "de tweeter houdt een condensator" maar "elke weg BOVEN de
 * laagste die er een draagt, houdt er een" — N-weg-agnostisch (P6: geen
 * wegnaam, geen telling tot drie; de laagste weg komt uit `pickSlotsN`, de
 * slot-resolutie die de tuner al twee keer leest).
 *
 * DIE UITSLUITING IS GEMETEN EN NIET BEREDENEERD, en zij kostte de eerste
 * versie van dit bestand. Gesteld op ÉLKE weg viel de byte-referentie
 * `f4cRegression` meteen om: op de F4b2-fixture krijgt de LAAGSTE tak tijdens
 * de trapmethode een serie-C (`added: ["C3"]`) en raakt hij hem in dezelfde run
 * weer kwijt (`removed: ["R1","C3"]`). Dat is een CORRECTIE-element en geen
 * bescherming — de laagste weg heeft per constructie geen hoogdoorlaat — en zijn
 * verwijdering is juist. De bovenste tak van diezelfde fixture houdt zijn C1 in
 * élke opgeslagen run.
 *
 * Wat de uitsluiting NIET is: een gat. Een weg boven de laagste is de bovenste
 * weg van een paar (`DriverPair.upper` in de tuner — "the one that needs
 * protecting below the crossing") en krijgt van beide ontwerpstappen
 * onvoorwaardelijk een hoogdoorlaat. Gemeten over het hele casusboek: 378 zulke
 * wegen op 192 bevroren netlists, NUL zonder serie-C; de laagste weg draagt er
 * op 14 van de 192 wél een — dus de meting onderscheidt en keurt niet alles goed.
 *
 * HIJ IS EEN VETO EN GEEN FILTER, en dat is byte-beleid en geen smaak. Gevraagd
 * NA de kwaliteitsregels en na de poort, precies waar `gateViolation` al wordt
 * gevraagd: een verwijdering die de kwaliteitsregels toch al afwezen wordt
 * onveranderd afgewezen, en het aantal netwerkoplossingen beweegt niet. Wat er
 * verandert is uitsluitend een verwijdering die AANVAARD zou zijn en de laatste
 * serie-C van een weg zou strippen — en dat is op dit casusboek nooit gebeurd,
 * dus beide byte-referenties reproduceren.
 */

import { crossoverToNetlist } from './vxpNetwork.ts';
import { busTopologyOfNetlist } from './netOptimizer.ts';
import type { VxpPart, VxpCrossover } from './parsers/vxp.ts';

/** Versiestring — een gedragswijziging hier is een versiebump (A5e.5). */
export const SERIES_PROTECTION_VERSION = 'series-protection/1.0';

/**
 * Per weg: de ids van de SERIE-condensatoren die haar driver ziet.
 *
 * Gelezen door dezelfde bus-walk die `levelWork.ts` en de tuner lezen
 * (`busTopologyOfNetlist`) — één implementatie van "welke onderdelen liggen op
 * het pad naar deze driver", nooit een tweede (A3g). Open en kortgesloten
 * onderdelen tellen niet mee: `crossoverToNetlist` laat ze weg, dus een
 * gesnoeide serie-C is hier per constructie afwezig en dat is precies de
 * toestand die deze regel moet kunnen zien.
 *
 * Een netlist die niet te bouwen is levert een LEGE kaart op en geen
 * uitzondering: de aanroeper gebruikt hem om een stap te weigeren, en een
 * weigering mag nooit op een gooi stuklopen.
 */
export function seriesCapsByWay(parts: readonly VxpPart[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let bus: ReturnType<typeof busTopologyOfNetlist>;
  try {
    bus = busTopologyOfNetlist(crossoverToNetlist({ name: 'series-protection', parts: [...parts] } as VxpCrossover).netlist);
  } catch {
    return out;
  }
  for (const q of parts) {
    if (q.type !== 'Capacitor' || !q.partId) continue;
    if (q.open || q.shorted) continue;
    let models: string[];
    try {
      if (bus.positionOf(q.partId) !== 'series') continue;
      models = bus.driversOf(q.partId);
    } catch {
      continue;
    }
    for (const m of models) {
      const list = out.get(m);
      if (list) list.push(q.partId);
      else out.set(m, [q.partId]);
    }
  }
  return out;
}

/**
 * De wegen die hun LAATSTE seriecondensator zouden verliezen.
 *
 * `before` is de netlist zoals zij staat, `after` de netlist zoals de stap haar
 * zou achterlaten. Een weg telt alleen mee als zij er vóór de stap WÉL een had:
 * een weg zonder seriecondensator (de laagste) is niet het onderwerp van deze
 * regel en wordt er niet door geraakt.
 *
 * Leeg = de stap mag. Een lijst = de stap strip een bescherming, en de
 * aanroeper weigert hem met de wegen bij naam (F0 — een weigering zonder naam
 * is een weigering die niemand kan narekenen).
 */
export function waysLosingSeriesCap(
  before: readonly VxpPart[],
  after: readonly VxpPart[],
  lowestWay: string | null,
): string[] {
  const had = seriesCapsByWay(before);
  if (had.size === 0) return [];
  const keeps = seriesCapsByWay(after);
  const lost: string[] = [];
  for (const [model, caps] of had) {
    if (caps.length === 0) continue;
    /* De laagste weg is uitgesloten: haar seriecondensatoren zijn correctie en
     * geen bescherming, en `null` sluit niets uit — dan is er geen laagste weg
     * te bepalen en weigert deze regel niets dat zij niet kan verantwoorden. */
    if (lowestWay !== null && model === lowestWay) continue;
    if ((keeps.get(model) ?? []).length === 0) lost.push(model);
  }
  return lost.sort();
}

/**
 * De zin die een geweigerde verwijdering achterlaat.
 *
 * Eén huis, twee lezers (de trapsgewijze snoei en de onderdelenaudit), zodat
 * de twee paden niet elk hun eigen woorden krijgen voor dezelfde weigering.
 */
export function seriesProtectionRefusal(ways: readonly string[]): string {
  return (
    `removal would leave ${ways.join(' and ')} without a series capacitor — kept. ` +
    'A way that carries one keeps one: without it the voice coil sees the amplifier down to DC, ' +
    'and "inert" is measured on the sum, the pair phase and Z, none of which is that question (H-5).'
  );
}
