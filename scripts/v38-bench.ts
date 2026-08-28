/**
 * V38 — DE MEETBANK die stap 2 en stap 3 DELEN.
 *
 * Eén bestand, want de wattenval van de ablatie en de rest van de
 * transplantatie moeten in dezelfde eenheden staan. Twee scripts die elk hun
 * eigen tuner-opties samenstellen leveren twee tabellen op die niet mogen
 * worden afgetrokken, en de aftrekking IS de opdracht.
 *
 * Wat hier NIET in staat: een oordeel. Er wordt niets gerangschikt, niets
 * gedrempeld en geen enkele grens vergeleken behalve de gestelde
 * versterkervloer, die uit het casusboek gelezen wordt en niet hier woont (P6).
 */

import {
  CASUS1_WOOFER_DC_OHM,
  CASUS1_DIR,
  casus1AmpMinLoadOhm,
  casus1Files,
  casus1FilterFromParts,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
  type GoldenRefs,
} from '../src/lib/engine2/casus1.fixture.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import {
  CASUS1_AMP_MIN_LOAD_OHM,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import type { NetOptimizeResult } from '../src/lib/netOptimizer.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';

export const golden: GoldenRefs = loadGolden();
export const manifest = casus1Manifest(golden);
export const files = casus1Files(manifest);
export const geometry = casus1Geometry(golden);
export const FLOOR = casus1AmpMinLoadOhm(golden);

export const SETTINGS: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: FLAT_TARGET,
  ...(FLOOR !== null ? { ampMinLoadOhm: FLOOR } : {}),
};

/** De parts van een netlist uit het casusboek. */
export function partsOf(key: string): VxpPart[] {
  const name = golden.manifest_en_geometrie.netlists[key];
  if (!name) throw new Error(`casus 1 kent geen netlist ${key}`);
  return deserializeFilter(readFileSync(join(CASUS1_DIR, name), 'utf-8')).parts;
}

export const chain = casus1ChainInput(manifest, files, golden);

/**
 * De opgeloste R_e per model, uit de OPNAMEPAS.
 *
 * Dezelfde bron waaruit de worker hem haalt (F4b lek 1: één R_e, één
 * herkomst). Zonder deze deelt de V37-noemer nergens door — dat is geen
 * terugval maar een lege term, en de tuner meldt het.
 */
export const reOhmByModel: Record<string, number> = (() => {
  const rep = buildReport({
    manifest,
    files,
    filter: casus1FilterFromParts('HUIDIG', partsOf('HUIDIG'), manifest, files),
    geometry,
    settings: SETTINGS,
  });
  const out: Record<string, number> = {};
  for (const d of rep.ingest.drivers) if (d.re) out[d.driver] = d.re.ohm;
  return out;
})();

/**
 * DE TUNER-OPTIES, één keer.
 *
 * Zij zijn die van de v2-route (`CASUS1_V2_SETTINGS`) op drie punten na, en
 * elk van de drie is een besluit:
 *
 *  - GEEN `staged`. Dat zet de trapmethode aan, en die SNOEIT en ESCALEERT
 *    onderdelen. Een ablatie waarin de tuner het weggehaalde onderdeel terug
 *    mag zetten meet niets, en een transplantatie waarin hij er onderdelen bij
 *    mag zetten meet niet meer de topologie die getransplanteerd is.
 *
 *    DAT MAAKT DE TOPOLOGIE NOG NIET VAST, en dat is bij V38 gemeten in plaats
 *    van aangenomen: de ONDERDELENAUDIT staat wél gewapend (`audit`, V26 rij 33
 *    — elke bescherming die deze app standaard aanzet blijft aan) en die
 *    verwijdert componenten die zij zinloos acht. Op twee van de vier
 *    transplantatie-armen haalde zij `C·L10` weg, een vierde-orde-pool in de
 *    tweetertak. Elk script schrijft daarom de GELEVERDE netlist mee, zodat per
 *    arm na te meten is wat er verdwenen is — een Δ tussen twee armen die
 *    stilzwijgend ook een audit-verwijdering bevat, is geen groepsbijdrage.
 *  - GEEN `branchTargets`. Die leiband komt uit de ontwerpstap van de keten;
 *    die stap draait hier niet, want er wordt geen topologie gesynthetiseerd.
 *  - GEEN `gateViolation`-hook. Een hook die de tune in zijn geheel weigert
 *    levert het ZAAD terug (V31/V33), en een arm die zijn zaad teruggeeft is
 *    geen meetpunt maar een lege regel. De poort oordeelt NA afloop met
 *    `buildReport`, precies zoals `compare-corpora.ts` het doet. De gestelde
 *    versterkervloer stuurt wél: zij wapent de reparatiepas
 *    (`ampMinLoadOhm`) én is zoekdoel (`zFloorBarrier` op `'safety'`, V30/V33).
 */
export const TUNE_OPTS = {
  midBranch: { response: chain.m, adjust: {} },
  zFloorStrict: true,
  phasePriority: CASUS1_V2_SETTINGS.phasePriority,
  breakupGuard: CASUS1_V2_SETTINGS.breakupGuard,
  powerMetric: CASUS1_V2_SETTINGS.powerMetric,
  powerFoldWeight: CASUS1_V2_SETTINGS.powerFoldWeight,
  costWeight: CASUS1_V2_SETTINGS.costWeight,
  dissipationWeight: CASUS1_V2_SETTINGS.dissipationWeight,
  directivityWeight: CASUS1_V2_SETTINGS.directivityWeight,
  ampTarget: CASUS1_V2_SETTINGS.ampTarget,
  phaseMetric: CASUS1_V2_SETTINGS.phaseMetric,
  catalogSnap: CASUS1_V2_SETTINGS.catalogSnap,
  band: CASUS1_V2_SETTINGS.band,
  safety: chain.safety,
  audit: CASUS1_V2_SETTINGS.audit,
  rSourceProbeSource: CASUS1_V2_SETTINGS.rSourceProbeSource,
  dissipationReferenceSource: 're' as const,
  dissipationReferenceReOhm: reOhmByModel,
  ...(CASUS1_AMP_MIN_LOAD_OHM !== null
    ? {
        ampMinLoadOhm: CASUS1_AMP_MIN_LOAD_OHM,
        zFloorBarrier: true,
        zFloorBarrierSource: 'safety' as const,
      }
    : {}),
};

/**
 * DE VOLLE VECTOR PER NETWERK, en waarom hij vol moet zijn.
 *
 * Eén kolom (RMS) laat niet zien of een her-polijsting die op RMS wegloopt
 * ergens anders iets terugkreeg. Dan is "de doelfunctie loopt weg" geen
 * bevinding maar een half afgelezen tabel: een tuner die 2 dB vlakheid inruilt
 * voor 30 graden fase doet zijn werk, en een tuner die op élke gewogen as
 * verliest doet iets anders. Dus staat hier alles wat de scalar weegt én alles
 * wat het casusboek als kolom kent.
 *
 * ÉÉN GROOTHEID VERDIENT EEN AANTEKENING. `rms` is `rmsDeviationDb` van
 * `judgeResponse`: de RMS-afwijking van de doelcurve, gerefereerd aan het
 * bandgemiddelde — dus de STANDAARDDEVIATIE van de som over de band. Dat is
 * dezelfde grootheid als `bandStd` in `netOptimizer.ts`, en `bandStd` IS de
 * amplitudeterm van de zoektocht. Dezelfde vlakke doelcurve, dezelfde
 * niveauvrijheid, dezelfde statistiek. Ze verschillen op twee punten, en die
 * twee zijn de naad: de zoektocht rekent op een GEDECIMEERD raster met
 * 1/12-octaaf gegladde magnitudes, de acceptatie op het volle raster ONGEGLAD
 * (A5e.1: het venster wordt gegladd, de RMS niet). De bandgrenzen verschillen
 * ook, en daarom reist `splBandHz` mee.
 */
export interface Measured {
  rms: number | null;
  venster: number | null;
  vensterMaxHz: number | null;
  vensterMinHz: number | null;
  /** De band waarover `judgeResponse` oordeelde — naast de band van de tuner. */
  bandHz: [number, number] | null;
  /** De grootste smalle piek die de gladding wegnam, en waar (A5e.1). */
  smallePiekDb: number | null;
  smallePiekHz: number | null;
  wmFase: number | null;
  mtFase: number | null;
  /**
   * De band waarop élk fasepaar werkelijk geoordeeld is, en hoeveel van de
   * bedoelde band dat was (A5.5).
   *
   * Meegenomen omdat het bij V38 dragend bleek: HUIDIG kruist W-M onder de
   * meetgeldigheidsvloer, dus dat oordeel dekt 43 % van de bedoelde ±1 octaaf
   * en kijkt uitsluitend BOVEN het kruispunt. Een fasegetal zonder zijn dekking
   * is precies de referentie-zonder-band die V15 afschafte.
   */
  fasePaden: { paar: string; xoHz: number | null; bandHz: [number, number]; dekkingPct: number | null }[];
  minZ: number | null;
  minZBijHz: number | null;
  haaltVloer: boolean | null;
  epdr: number | null;
  dissipatiePct: number | null;
  grootsteRW: number | null;
  /** M-E: Q_es-vermenigvuldiging van de laagste weg (V37's referentie). */
  qesMult: number | null;
}

export const r2 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));

export function measure(name: string, parts: readonly VxpPart[]): Measured {
  const rep = buildReport({
    manifest,
    files,
    filter: casus1FilterFromParts(name, parts, manifest, files),
    geometry,
    settings: SETTINGS,
  });
  const pt = rep.system.phaseTracking;
  const z = rep.metrics.epdr?.minZOhm ?? null;
  const resp = rep.system.response;
  const peak = resp?.narrowPeaks[0] ?? null;
  /* M-E van de LAAGSTE weg: de Thévenin-rij waarvan de doorlaatband het
   * laagst begint. Afgeleid, niet bij naam gezocht — nergens in dit project
   * mag een script weten wat een "woofer" is. */
  const lowest = [...rep.metrics.thevenin].sort(
    (a, b) => (a.atHz ?? Infinity) - (b.atHz ?? Infinity),
  )[0];
  return {
    rms: r2(resp?.rmsDeviationDb),
    venster: r2(resp?.windowPlusMinusDb),
    vensterMaxHz: r2(resp?.windowMaxAtHz),
    vensterMinHz: r2(resp?.windowMinAtHz),
    bandHz: resp ? [r2(resp.bandHz[0]) ?? 0, r2(resp.bandHz[1]) ?? 0] : null,
    smallePiekDb: r2(peak?.db),
    smallePiekHz: r2(peak?.fHz),
    wmFase: r2(pt.find((p) => p.lower === 'woofer')?.meanAbsDeg ?? null),
    mtFase: r2(pt.find((p) => p.lower === 'mid')?.meanAbsDeg ?? null),
    fasePaden: pt.map((p) => ({
      paar: `${p.lower}→${p.upper}`,
      xoHz: r2(p.crossingHz),
      bandHz: [r2(p.bandHz[0]) ?? 0, r2(p.bandHz[1]) ?? 0],
      dekkingPct: r2(p.coverage.fraction * 100),
    })),
    minZ: r2(z),
    minZBijHz: r2(rep.metrics.epdr?.minZAtHz),
    haaltVloer: z === null || FLOOR === null ? null : meetsAmpFloor(z, FLOOR),
    epdr: r2(rep.metrics.epdr?.minOhm),
    dissipatiePct: r2((rep.metrics.dissipation?.totalFraction ?? NaN) * 100),
    grootsteRW: r2(rep.metrics.dissipation?.elements.find((e) => !e.parasitic)?.watts ?? null),
    qesMult: r2(lowest?.qMultiplier ?? null),
  };
}

/**
 * WAT DE TUNER ZELF ZAG, vóór en ná — in zijn eigen eenheden.
 *
 * `NetOptimizeResult.before` is de volle-raster-metriek van het ZAAD en
 * `after` die van het geleverde netwerk, allebei door hetzelfde `report()`-pad
 * binnen de tuner. Dit is de enige plek waar de vraag "wat kocht de
 * her-polijsting en wat betaalde zij" beantwoord kan worden zonder de
 * doelfunctie na te bouwen — en haar nabouwen zou een tweede implementatie van
 * de scalar zijn, wat dit project elders verbiedt.
 *
 * `powerStdDb`, `powerFoldDb` en `powerSlopeDbDec` staan erbij omdat de
 * gewogen scalar ze KENT; op deze bank zijn ze leeg, en dat is zelf een
 * meting: `directivityWeight` is 0 in `CASUS1_V2_SETTINGS` én er reist geen
 * `angleData` mee, dus de in-room-term weegt nul. Een as die niets weegt kan
 * ook niets teruggekocht hebben.
 */
export interface TunerVector {
  rippelPiekDb: number | null;
  rippelPiekGegladdDb: number | null;
  gemAfwDb: number | null;
  faseDeg: number | null;
  paarFaseDeg: (number | null)[] | null;
  zMinOhm: number | null;
  powerStdDb: number | null;
  powerFoldDb: number | null;
  powerSlopeDbDec: number | null;
  dissRatio: number | null;
  rSourceOhm: number | null;
  xoHzPairs: (number | null)[] | null;
  paarOverlapOct: (number | null)[] | null;
}

const r3 = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(3));

export function tunerVectorOf(
  m: NetOptimizeResult['before'] | NetOptimizeResult['after'],
): TunerVector {
  const a = m as NetOptimizeResult['after'];
  return {
    rippelPiekDb: r3(m.rippleDb),
    rippelPiekGegladdDb: r3(a.ripplePeakSmoothedDb),
    gemAfwDb: r3(m.avgDevDb),
    faseDeg: r3(m.phaseDeg),
    paarFaseDeg: m.pairPhaseDeg ? m.pairPhaseDeg.map((v) => r3(v)) : null,
    zMinOhm: r3(m.zMinOhm),
    powerStdDb: r3(m.powerStdDb),
    powerFoldDb: r3(a.powerFoldDb),
    powerSlopeDbDec: r3(a.powerSlopeDbDec),
    dissRatio: r3(a.dissRatio),
    rSourceOhm: r3(m.rSourceOhm),
    xoHzPairs: m.xoHzPairs ? m.xoHzPairs.map((v) => r3(v)) : null,
    paarOverlapOct: a.pairOverlapOct ? a.pairOverlapOct.map((v) => r3(v)) : null,
  };
}

/** Onderdelen die elektrisch nog meedoen (een geableerde groep telt niet mee). */
export const countParts = (ps: readonly VxpPart[]): number =>
  ps.filter(
    (p) =>
      p.partId !== undefined &&
      p.type !== 'Driver' &&
      p.type !== 'Generator' &&
      p.shorted !== true &&
      p.open !== true,
  ).length;
