/**
 * V47 — DE BESCHERMINGSMAAT VAN DE TUNER, LEESBAAR OP EEN BEVROREN NETLIST.
 *
 * EEN ADAPTER EN GEEN TWEEDE IMPLEMENTATIE. De regel zelf staat in
 * `lib/protectionDeficit.ts` en wordt door de TUNER aangeroepen; dit bestand
 * vertaalt alleen de wereld van het rapport (een opgeloste `NetworkAnalysis`
 * plus de kruispunten die de takken opleveren) naar de argumenten die zij
 * vraagt. Zonder deze laag zou elke lezer buiten de tuner de band en de vloer
 * zelf moeten uitschrijven, en dat is precies hoe één grootheid twee
 * beschrijvingen krijgt (V21, V32).
 *
 * WAAROM ER EEN LEZER BUITEN DE TUNER IS. V47 verving de zaadvergelijking op
 * `protSqDb` door de gestelde M-C-eis, en die twee zijn VERSCHILLENDE
 * grootheden: M-C leest één punt (de eigen resonantie), dit is een integraal
 * over de band onder het kruispunt. Of de absolute eis dekt wat de relatieve
 * dekte, is daarmee een MEETVRAAG — en zij kan alleen gesteld worden als beide
 * naast elkaar afleesbaar zijn. Het is een CONTROLEKOLOM in de vorm die V44
 * voor de fasematen gebruikt: gerapporteerd, nooit een poort, nooit een
 * sorteersleutel.
 */

import { protectionDeficitSqDb } from '../../protectionDeficit.ts';
import { abs as cabs } from '../../complex.ts';
import { dbAmp } from '../util.ts';
import type { Complex } from '../../complex.ts';
import type { Crossing, NetworkAnalysis } from './types.ts';

export interface PairProtection {
  lower: string;
  /** De weg waarvan de bescherming beoordeeld wordt: de BOVENSTE van het paar. */
  upper: string;
  /** Het akoestische kruispunt waar de band onder hangt, Hz. */
  xoHz: number;
  /** Gemiddeld kwadratisch tekort boven de vloer, dB². */
  sqDb: number;
}

/**
 * Het beschermingstekort per aangrenzend paar, plus de SOM — en de som is wat
 * de tuner in zijn veiligheidspoort vergelijkt (`metricsOn` telt de paren op).
 *
 * Leeg wanneer het netwerk geen oplosbare takoverdracht voor de bovenste weg
 * oplevert; dat is een afwezige meting en geen nul (F0).
 */
export function protectionByPair(
  analysis: NetworkAnalysis,
  crossings: readonly Crossing[],
): { pairs: PairProtection[]; sumSqDb: number | null } {
  const pairs: PairProtection[] = [];
  for (const c of crossings) {
    if (!Number.isFinite(c.fHz)) continue;
    const h = analysis.transferByModel[c.upper];
    if (!h) continue;
    /* Door `dbAmp` en niet met de hand: de eenheidsconversie heeft in engine2
     * één huis, en P6's whitelist voor conversies is geen vrijbrief om er een
     * tweede naast te zetten. De TUNER doet hem inline omdat hij niets uit
     * engine2 mag importeren (de toggle-invariant); wat de twee delen is de
     * REGEL in `protectionDeficit.ts`, niet de omrekening ernaartoe. */
    const magDb = h.map((z: Complex) => dbAmp(cabs(z)));
    pairs.push({
      lower: c.lower,
      upper: c.upper,
      xoHz: c.fHz,
      sqDb: protectionDeficitSqDb(analysis.grid, magDb, c.fHz),
    });
  }
  return {
    pairs,
    sumSqDb: pairs.length > 0 ? pairs.reduce((a, p) => a + p.sqDb, 0) : null,
  };
}
