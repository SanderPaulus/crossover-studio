/**
 * DE BESCHERMING VAN DE BOVENSTE DRIVER, ALS ÉÉN REGEL MET TWEE LEZERS.
 *
 * V47 — dezelfde vorm en dezelfde reden als `impedanceFloor.ts`,
 * `phaseAdmission.ts` en `targetLevel.ts`: deze grootheid werd door de TUNER
 * berekend, binnen een closure in `metricsOn`, en was daarmee nergens anders
 * leesbaar. Zodra zij ook als KOLOM gerapporteerd moet worden zijn er twee
 * lezers, en twee implementaties van één grootheid is hoe twee beschrijvingen
 * van hetzelfde ding uit elkaar gaan lopen (V21, V32).
 *
 * WAT ZIJ MEET, en waarom zij NIET hetzelfde is als M-C. A4's M-C leest de
 * aandrijfspanning op ÉÉN punt — de eigen resonantie van de driver — tegen het
 * gemiddelde over haar doorlaatband. Dit is een INTEGRAAL: het gemiddelde
 * kwadratische tekort boven een vaste vloer, over de hele band onder
 * `xoF / PROTECTION_BAND_DIVISOR`. Twee grootheden die correleren en niet
 * samenvallen — op casus 1 ligt f_s van de tweeter (924 Hz) zelfs BOVEN
 * `xoF/3` van de lage kruisingen, dus daar meten zij niet eens over dezelfde
 * frequenties. Wie de een voor de ander aanziet, leest een eis die hij niet
 * gesteld heeft.
 *
 * DE GETALLEN ZIJN v1-ERFENIS EN GEEN PROJECTGETALLEN. Zij stonden als
 * `mag + 15` en `xoF / 3` in de tuner en zij zijn hier alleen BENOEMD, niet
 * herzien: de extractie mag geen enkel getal verplaatsen, en de byte-baselines
 * van `f4cRegression` en `workerRouteRegression` zijn wat dat afdwingt.
 */

/**
 * De vloer waaronder de elektrische aandrijving van de bovenste driver moet
 * blijven, dB. Erfenis uit v1 (`helpEn.ts` noemt hem in de gebruikershulp:
 * "well below the crossing the drive must be attenuated ≥ 15 dB").
 */
export const PROTECTION_FLOOR_DB = -15;

/**
 * Hoeveel onder het kruispunt de bescherming beoordeeld wordt: de band loopt
 * tot `xoF` gedeeld door dit getal. Erfenis uit v1 ("≤ crossing/3").
 */
export const PROTECTION_BAND_DIVISOR = 3;

/** Versiestring — gedragswijziging = bump = cache-invalidatie. */
export const PROTECTION_DEFICIT_VERSION = 'protection-deficit@1';

/**
 * Het gemiddelde kwadratische tekort van één tak boven de beschermingsvloer,
 * over de band onder het kruispunt. dB², en 0 wanneer er niets te beoordelen
 * valt (geen kruispunt, geen takoverdracht, of geen enkel rasterpunt in de
 * band) — dat is wat de tuner al deed en het is hier niet veranderd.
 *
 * `upperMagDb` is de MAGNITUDE van de elektrische overdracht van de bovenste
 * tak in dB, op hetzelfde raster als `freq`. De aanroeper levert hem, want de
 * tuner en het rapport lossen elk hun eigen netwerk op en dit bestand hoort
 * geen van beide te kennen.
 */
export function protectionDeficitSqDb(
  freq: readonly number[],
  upperMagDb: readonly number[],
  xoFHz: number | null,
): number {
  if (xoFHz === null) return 0;
  let acc = 0;
  let n = 0;
  for (let i = 0; i < freq.length; i++) {
    if (freq[i] > xoFHz / PROTECTION_BAND_DIVISOR) continue;
    const d = Math.max(0, upperMagDb[i] - PROTECTION_FLOOR_DB);
    acc += d * d;
    n++;
  }
  return n ? acc / n : 0;
}
