/**
 * THE BEFORE/AFTER TABLE BETWEEN TWO FROZEN CORPORA, MEASURED AS FILES.
 *
 * Run with `npx vite-node scripts/compare-corpora.ts [vóór] [ná]`, AFTER
 * `generate-casus1-v2-candidates.ts` and `record-casus1-v2-references.ts`.
 * Seconds, not minutes: it runs no chain and tunes nothing.
 *
 * WHY IT TAKES ARGUMENTS NOW. This was `compare-v30-v32-corpus.ts`, and its
 * "after" half was hard-wired to the LIVE corpus — which meant that the moment
 * V33 regenerated that corpus, the script stopped reproducing the V32 table it
 * was written for and silently started producing a different one. A comparison
 * that cannot be re-run is not evidence; it is a paragraph someone typed once.
 * So both halves are named, every dated corpus stays addressable, and the
 * default is the newest comparison.
 *
 *   corpora: `v30` · `v32` · `v33sweep` · `v33` · `v34` · `v37` · `v38fix` · `v41` ·
 *            `v42` · `v43` · `v44` · `v45` · `v47` · `v48` · `v49` · `live`   (de kaart
 *            staat in `casus1Corpora.fixture.ts`; deze regel is de leesbare kopie ervan)
 *   default: `v49` → `live`   (casebook V50; `v48 live` was de V47b-tabel, `v47 v48` de V48-tabel)
 *   V32's own table: `npx vite-node scripts/compare-corpora.ts v30 v32`
 *   V33's own table: `npx vite-node scripts/compare-corpora.ts v32 v33`
 *   V33's two arms:  `npx vite-node scripts/compare-corpora.ts v33sweep v33`
 *   V34's own table: `npx vite-node scripts/compare-corpora.ts v33 v34`
 *   V37's own table: `npx vite-node scripts/compare-corpora.ts v34 v37`
 *   V38-fix's table: `npx vite-node scripts/compare-corpora.ts v37 v38fix`
 *   V41's own table: `npx vite-node scripts/compare-corpora.ts v38fix v41`
 *   V42's own table: `npx vite-node scripts/compare-corpora.ts v41 v42`
 *
 * WHY A FILE COMPARISON AND NOT TWO RUNS. `measure-v30-floor-goal.ts` ran the
 * same field twice and switched one option between the arms, because V30's
 * change WAS an option a caller could turn off. V32's was not, and V33's is one
 * a candidate states rather than a knob on the field — so the "before" arm is
 * not a run but the corpus that was frozen before the repair, sitting in the
 * repository. Both halves then go through exactly the same `buildReport` path,
 * so the "after" numbers are not a run's self-report: they are the measurement
 * anyone else can repeat from the repository.
 *
 * THE PAIRING IS BY CANDIDATE, NOT BY FILE NUMBER. `KAND-V2-3` and
 * `V32-KAND-3` are the third row of two different shortlists and have nothing
 * to do with each other; what pairs them is the candidate they were tuned for
 * (a pair of handover frequencies and orders). Those live in
 * `manifest_en_geometrie.v30_corpus` / `.v32_corpus` for the dated corpora and
 * in `casus1_v2_herkomst.json` for the live one. A candidate present in one
 * corpus and absent from the other is a ROW, not a gap: that is the finding.
 *
 * SINCE V45 BOTH HALVES ARE JUDGED AGAINST THE DESIGN'S TARGET CURVE, and that
 * has a consequence a reader has to be told rather than left to discover. The
 * `venster` and `RMS` columns are deviations from a REFERENCE, and A5e.2 gave
 * casus 1 a reference that is not horizontal (`CASUS1_TARGET_CURVE`). Both
 * halves go through it, which is the rule this script has always followed — so
 * the pair is honest — but the "before" column no longer reproduces the number
 * the V44 table printed for the same netlist, because that one was taken
 * against flat. The netlists did not move; the question did. Anyone who needs
 * the old reading takes it with `targetCurve: FLAT_TARGET`, and the casebook
 * records both.
 *
 * (This is the V33 rename's lesson one column along: a comparison script that
 * quietly changes what it measures produces a table that looks like the table
 * it was written for and is not.)
 *
 * SINDS DE V47-NAZORG STAAT NAAST ÉLK CORPUSGEMIDDELDE DE GEPAARDE DELTA, en
 * dat is de leesregel van deze hele tabel. Een corpusgemiddelde is een
 * gemiddelde over de netlists die het corpus TOEVALLIG bevat; een gewapende
 * eis verwijdert netlists, en dan verandert dat gemiddelde zonder dat er één
 * netwerk bewogen heeft. De gepaarde delta neemt hetzelfde getal over
 * uitsluitend de kandidaten die BEIDE corpora dragen, met het aantal paren
 * erbij. HET CORPUSGEMIDDELDE BESCHRIJFT HET VELD, DE GEPAARDE DELTA DE
 * INGREEP, en alleen de tweede mag als verbetering of verslechtering gelezen
 * worden. Twee gemeten gevallen, in tegengestelde richting: `v45 live` las
 * fase als winst (25,3° → 13,1°) terwijl gepaard 11,96° → 13,06°, en
 * dissipatie als verlies (60,4 % → 62,2 %) terwijl gepaard 69,05 % → 62,23 %.
 * `v30 v32` is de scherpste demonstratie en is volledig gedateerd: daar is
 * élke gepaarde delta EXACT nul — V32 veranderde geen ontwerp en trok er drie
 * in — terwijl de corpusgemiddelden acht procentpunten bewegen.
 * `corpusPairing.test.ts` reproduceert beide.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  casus1Filter,
  casus1LfResonantBudgetDb,
  casus1MaxDriveOnFsDb,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  corpusBank,
  corpusOf,
  mean,
  pairedDelta,
  round2,
  unionOfCandidates,
  type CorpusPair,
} from '../src/lib/engine2/casus1Corpora.fixture.ts';
import { type EngineV2Report } from '../src/lib/engine2/report.ts';
import { impedanceReferenceFrom } from '../src/lib/engine2/optimizer/impedanceReference.ts';
import type { MeasuredSweep } from '../src/lib/engine2/optimizer/gates.ts';
import { buildAnalysis } from '../src/lib/engine2/metrics/analysis.ts';
import { protectionByPair } from '../src/lib/engine2/metrics/protection.ts';
import { meetsAmpFloor } from '../src/lib/impedanceFloor.ts';
import { busTopology } from '../src/lib/netOptimizer.ts';
import { deserializeFilter } from '../src/lib/filterFile.ts';
import { CASUS1_DIR } from '../src/lib/engine2/casus1.fixture.ts';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import { decompose } from './v38-groups.ts';

/* DE CORPUSKAART, HET INSTELLINGENBLOK EN DE STATISTIEK WONEN SINDS DE
 * V47-NAZORG IN `casus1Corpora.fixture.ts` — dit script is er de ene lezer van
 * en `corpusPairing.test.ts` de andere. Zolang deze tabel de enige lezer was,
 * was een kopie hier geen kopie; zodra een test dezelfde getallen moet kunnen
 * reproduceren zijn twee beschrijvingen van één ding het begin van uiteenlopen
 * (V21). Wat hier blijft staan is wat alléén deze tabel doet: de kolommen. */
const golden = loadGolden();
const bank = corpusBank(golden);
const { manifest, files, settings: SETTINGS, floorOhm: FLOOR } = bank;

const [beforeId = 'v49', afterId = 'live'] = process.argv.slice(2);
const before = corpusOf(beforeId, golden);
const after = corpusOf(afterId, golden);

interface Row {
  minZ: number | null;
  atHz: number | null;
  splWindow: number | null;
  rms: number | null;
  /** M-K — DE MAAT, sinds V44: het gemiddelde |relatieve fase| over de punten
   *  die een fase-oordeel mogen dragen (binnen de meetgeldigheid van beide
   *  takken, beide takken boven de stille-geestvloer, binnen het
   *  overlapvenster). Dit is wat de eis `phase-tracking` leest, wat de
   *  zoektocht uitgeeft en wat het paneel afdrukt — dus staat hij vooraan. */
  wmPhase: number | null;
  mtPhase: number | null;
  /** CONTROLEKOLOM 1 — wat het rapport tot V43 afdrukte: ±1 octaaf rond het
   *  kruispunt, geknipt op meetgeldigheid (A5.5). */
  wmPhaseOctave: number | null;
  mtPhaseOctave: number | null;
  /** CONTROLEKOLOM 2 — wat de TUNER tot V43 las: elk punt binnen het
   *  overlapvenster, ongeknipt op meetgeldigheid en zonder vloer onder de
   *  stille geest.
   *
   *  DRIE KOLOMMEN EN NIET TWEE, en alle drie uit hetzelfde rapport. Tot V43
   *  stonden hier twee kolommen waarvan de tweede de TUNER apart bevroeg, op
   *  het KETENRASTER — nodig zolang die twee verschillende grootheden lazen.
   *  Sinds V44 leest de tuner M-K, dus een aparte tunerkolom zou dezelfde
   *  grootheid op een ander raster afdrukken, en V40 heeft dat rasterverschil
   *  gemeten op hoogstens anderhalve graad. Eén rapport, drie namen, één
   *  raster — en de tunerrun per netlist is daarmee vervallen. */
  wmPhaseOverlap: number | null;
  mtPhaseOverlap: number | null;
  clearsFloor: boolean | null;
  /** V36 — M-A's fraction as a percentage, and the WATTS in the largest single
   *  discrete resistor at the assumed power. A column, never a criterion: this
   *  script ranks nothing and no threshold anywhere compares against it. */
  dissPct: number | null;
  largestRw: number | null;
  /**
   * V50 — BOUWBAARHEID. `hottestAllowedW` is wat de heetste weerstand MAG
   * verstoken (klasse × marge) en `resistorOver` of hij eroverheen gaat —
   * gelezen uit het M-A/part-oordeel en nooit hier vergeleken. `coilPeakA` is
   * de piekstroom door de drukste spoel bij de piekingang (M-L), met de spoel
   * bij naam; casus 1 stelt geen spoelklasse, dus dat is een kolom.
   */
  hottestAllowedW: number | null;
  resistorOver: boolean | null;
  coilPeakA: number | null;
  coilId: string | null;
  /** V50 — of ÉÉN M-C-oordeel van dit rapport (per weg, tegen zijn EIGEN grens) faalde. */
  driveOver: boolean | null;
  /** V38-fix — de rest van de vector waarmee V38 zijn armen vergeleek, zodat
   *  deze tabel en het casusboek in dezelfde eenheden staan: EPDR (M-B), de
   *  Q_es-vermenigvuldiging van de laagste weg (M-E) en de grootste smalle
   *  piek die de venstergladding wegneemt (A5e.1). */
  epdr: number | null;
  qesMult: number | null;
  /**
   * V47 — M-C op de SLECHTST BESCHERMDE weg, dB.
   *
   * De aandrijfspanning op de eigen resonantie van een hoogdoorlaatbeschermde
   * weg tegen het dB-gemiddelde over haar doorlaatband (A4, F1-conventie). Het
   * MAXIMUM over de beschermde wegen en niet de tweeter bij naam: de poort
   * oordeelt élke beschermde weg, en nergens in dit project mag een script
   * weten wat een "tweeter" is.
   *
   * Sinds V47 is dit een GESTELDE EIS en dus geen kolom-zonder-oordeel: de
   * corpusregel eronder zet de grens ernaast en telt hoeveel netlists eroverheen
   * gaan, vóór en ná — dezelfde vorm als het LF-budget.
   */
  driveDb: number | null;
  /**
   * V47 — CONTROLEKOLOM, in de vorm die V44 voor de fasematen invoerde:
   * gerapporteerd, nooit een poort, nooit een sorteersleutel.
   *
   * `protSqDb` is de maat waarop de volle-band-veiligheidspoort tot V47 tegen
   * het ZAAD vergeleek — het gemiddelde kwadratische tekort boven de
   * beschermingsvloer, over de band onder het kruispunt, gesommeerd over de
   * paren. Sinds V47 vervangt de gestelde M-C-eis die vergelijking op de
   * v2-route, en M-C is een ANDERE grootheid: één punt (de eigen resonantie)
   * tegen een integraal over een band. Zij kunnen dus uiteenlopen, en of de
   * absolute eis dekt wat de relatieve dekte is een MEETVRAAG. Deze kolom is
   * hoe zij gesteld kan worden; zij beantwoordt haar niet.
   */
  protSqDb: number | null;
  /**
   * V47b — M-C PER WEG, naast het maximum hierboven.
   *
   * De poort oordeelt élke hoogdoorlaatbeschermde weg en het maximum zegt niet
   * WELKE weg de eis raakt: op KAND_B is dat de mid en niet de tweeter (V47).
   * De wegen komen uit de oordelen van het rapport en worden nergens bij naam
   * gezocht; de cel drukt ze af in de volgorde waarin het rapport ze oordeelt.
   */
  driveByWay: { way: string; db: number }[];
  /**
   * V47b — DE VERTICALE LOBING-SYNTHESE (M-F-eind): de diepste dip van de som
   * over het verticale venster, in het kruisgebied, dB. `null` waar de
   * synthese UIT staat (het rapport zegt dan zelf waarom, `lobingFinalOff`).
   * Een kolom en geen oordeel: casus 1 stelt geen lobinggrens, en A4 verbiedt
   * een poort op een λ-fractie (V20) — dit is de synthese, niet een fractie.
   */
  lobingDipDb: number | null;
  narrowPeakDb: number | null;
  narrowPeakHz: number | null;
  /**
   * V41 — WELKE CORRECTIEGROEPEN DE SYNTHESESTAP WERKELIJK GEKOCHT HEEFT.
   *
   * Geteld uit de GELEVERDE netlist door `decompose` (de decompositie van V38,
   * één implementatie en inmiddels vier lezers), niet afgelezen van een
   * ontwerpintentie. De klassen zijn precies die welke géén filterpool zijn:
   * val, gedempte val, Zobel, shunt-shelf, serie-niveauweerstand,
   * shunt-niveauweerstand. Dat is de vraag die V38 als beslispunt B en C open
   * liet — het veld droeg er nul van de eerste vier op tien netlists, en de
   * twee instellingen die dat bepaalden werden overgeërfd.
   *
   * EEN KOLOM EN GEEN CRITERIUM. Méér correctiegroepen is niet beter: het zijn
   * shunts, en een shunt kost dissipatie en belastingimpedantie. De twee
   * kolommen ernaast (`dissPct`, `minZ`) zeggen of ze betaald zijn, en casus 1
   * stelt geen dissipatiegrens (P4).
   */
  groups: Record<string, number>;
  /**
   * V42 — DE DOELGROOTHEID VAN DEZE SESSIE en de knop die haar stuurt.
   *
   * `bultDb` is `lfBump().extraDb`: het extra niveau dat het elektrische filter
   * rond de bovenste reflexpiek bovenop de kale driver legt — precies de
   * grootheid waarin het gestelde budget is uitgedrukt, zodat de vóór/ná-kolom
   * en de eis dezelfde eenheid hebben.
   *
   * `seriesLmH` is de TOTALE seriespoel van de weg waarop M-D oordeelt, want
   * dat is de grootheid die de A5d.6-inversie begrenst. Twee kolommen en niet
   * één: de eerste zegt of de eis gehaald is, de tweede waarom.
   */
  bultDb: number | null;
  seriesLmH: number | null;
  /**
   * V43 — DE BULT ONTLEED, en `opslingeringDb` is sinds V43 de doelgrootheid.
   *
   * `liftDb` is wat het RESISTIEVE EQUIVALENT van hetzelfde netwerk in zijn
   * eentje aan het laag doet; `opslingeringDb` is wat de reactanties daar
   * bovenop leggen. Zij tellen per constructie op tot `bultDb`, dus de oude
   * kolom blijft leesbaar naast de twee nieuwe. Het GESTELDE budget staat sinds
   * V43 op `opslingeringDb`: de lift is niveauwerk en hoort bij A5e.2.
   */
  liftDb: number | null;
  opslingeringDb: number | null;
}

/* De afronding zelf woont sinds de V47-nazorg in `casus1Corpora.fixture.ts`:
 * de corpusgemiddelden worden over de AFGERONDE rijen genomen, dus zij is
 * onderdeel van de getallen en niet van de opmaak. */
const r2 = round2;

/* V44 — DE TUNERRUN PER NETLIST IS HIER VERVALLEN, en dat is een gevolg van de
 * ingreep en geen bezuiniging.
 *
 * Tot V43 stond hier `tunerPhaseOf`: het vroeg de tuner om `pairPhaseDeg` van
 * het ZAAD (één onderdeel vrij, budget op het minimum), omdat de tuner een
 * ANDERE grootheid las dan het rapport en die tegenspraak nu juist de open
 * bevinding was (V40). Sinds V44 lezen beide M-K — één functie, twee lezers —
 * dus zo'n run zou dezelfde grootheid op een ander RASTER afdrukken, en V40
 * heeft dat rasterverschil gemeten op hoogstens anderhalve graad. De drie
 * fasekolommen komen daarom alle drie uit hetzelfde rapport: de maat, en de
 * twee die zij vervangt als controle. Scheelt ook een tunerrun per netlist. */

/**
 * V41 — de niet-poolgroepen van één bevroren netlist, per rol geteld.
 *
 * Leest hetzelfde bestand dat `measure` hieronder rapporteert, en telt met
 * `decompose` uit `v38-groups.ts`. Geen tweede definitie van "wat een val is":
 * die staat daar, is door de ablatie van V38 gebruikt, en een script dat er
 * hier een eigen versie van maakt is precies waar V21 over ging.
 */
const CORRECTION_ROLES = [
  'trap',
  'damped-trap',
  'zobel',
  'shunt-shelf',
  'series-pad',
  'shunt-pad',
] as const;

function correctionGroupsOf(key: string): Record<string, number> {
  const name = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists[key];
  const parts: VxpPart[] = deserializeFilter(
    readFileSync(join(CASUS1_DIR, name), 'utf-8'),
  ).parts;
  const out: Record<string, number> = {};
  for (const role of CORRECTION_ROLES) out[role] = 0;
  for (const g of decompose(parts)) {
    if (out[g.role] !== undefined) out[g.role]++;
  }
  return out;
}

/** De correctiegroepen als één cel: alleen wat er IS, of een liggend streepje. */
const groupCell = (g: Record<string, number> | undefined): string => {
  if (!g) return '—';
  const parts = CORRECTION_ROLES.filter((r) => (g[r] ?? 0) > 0).map((r) => `${r}×${g[r]}`);
  return parts.length ? parts.join(' ') : 'geen';
};

/**
 * V42 — de totale seriespoel van de weg waarop M-D oordeelt, mH.
 *
 * De WEG wordt afgeleid en niet benoemd: `rep.metrics.lfBump[0].driver` is de
 * weg waarvoor de metriek een bult berekent, en dat is per definitie dezelfde
 * weg die de inversie begrenst. Nergens in dit script staat het woord
 * "woofer". De spoelen komen uit `busTopology` — de bus-wandeling van de app
 * zelf — en niet uit een tweede mening over wat "in serie" betekent.
 */
function seriesInductanceMH(key: string, driver: string | null): number | null {
  if (driver === null) return null;
  const name = (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists[key];
  const parts: VxpPart[] = deserializeFilter(
    readFileSync(join(CASUS1_DIR, name), 'utf-8'),
  ).parts;
  const bus = busTopology(parts);
  let total = 0;
  let seen = 0;
  for (const p of parts) {
    if (p.type !== 'Inductor' || p.partId === undefined || p.open || p.shorted) continue;
    if (!bus.driversOf(p.partId).includes(driver)) continue;
    total += p.params.find((q) => q.name === 'L')?.value ?? 0;
    seen++;
  }
  return seen > 0 ? total : null;
}

/**
 * `protSqDb` van een bevroren netlist, op de sweep waarop élke elektrische
 * grootheid sinds V32 gelezen wordt.
 *
 * De ANALYSE wordt hier opgebouwd zoals `report.ts` haar opbouwt (de
 * impedantiereferentie plus `buildAnalysis`) omdat het rapport zijn
 * takoverdrachten niet doorgeeft; de MAAT komt uit `protectionByPair`, en die
 * roept de regel van de tuner aan. Eén implementatie van de grootheid, één van
 * de netwerkoplossing — en geen enkel getal in dit bestand.
 */
function protectionOf(key: string, rep: EngineV2Report): number | null {
  const filter = casus1Filter(key, manifest, files, golden);
  const sweeps: Record<string, MeasuredSweep> = {};
  for (const [driver, z] of Object.entries(filter.driverZ)) {
    sweeps[driver] = {
      grid: z.freq,
      magnitude: z.magnitude,
      phaseDeg: z.phaseDeg,
      validHz: [z.freq[0], z.freq[z.freq.length - 1]],
    };
  }
  const ref = impedanceReferenceFrom(sweeps);
  if (!ref) return null;
  try {
    const analysis = buildAnalysis(filter.netlist, ref.grid, ref.driverZ);
    return protectionByPair(analysis, rep.crossings).sumSqDb;
  } catch {
    return null;
  }
}

function measure(key: string): Row {
  const rep = bank.report(key);
  const pt = rep.system.phaseTracking;
  const wm = pt.find((p) => p.lower === 'woofer');
  const mt = pt.find((p) => p.lower === 'mid');
  const z = rep.metrics.epdr?.minZOhm ?? null;
  return {
    minZ: r2(z),
    atHz: r2(rep.metrics.epdr?.minZAtHz),
    splWindow: r2(rep.system.response?.windowPlusMinusDb),
    rms: r2(rep.system.response?.rmsDeviationDb),
    wmPhase: r2(wm?.meanAbsDeg ?? null),
    mtPhase: r2(mt?.meanAbsDeg ?? null),
    wmPhaseOctave: r2(wm?.control.octaveClipped.meanAbsDeg ?? null),
    mtPhaseOctave: r2(mt?.control.octaveClipped.meanAbsDeg ?? null),
    wmPhaseOverlap: r2(wm?.control.overlapWindow.meanAbsDeg ?? null),
    mtPhaseOverlap: r2(mt?.control.overlapWindow.meanAbsDeg ?? null),
    clearsFloor: z === null || FLOOR === null ? null : meetsAmpFloor(z, FLOOR),
    dissPct: r2((rep.metrics.dissipation?.totalFraction ?? NaN) * 100),
    largestRw: r2(rep.metrics.dissipation?.elements.find((e) => !e.parasitic)?.watts ?? null),
    ...(() => {
      const r = rep.gates.verdicts.find((x) => x.gate === 'M-A/part');
      const l = rep.gates.verdicts.find((x) => x.gate === 'M-L');
      const mc = rep.gates.verdicts.filter((x) => x.gate === 'M-C' && x.active && x.value !== null);
      return {
        hottestAllowedW: r?.limit ?? null,
        resistorOver: r && r.active && r.value !== null ? !r.pass : null,
        coilPeakA: r2(l?.value ?? null),
        coilId: (l?.parameters?.element as string | undefined) ?? null,
        driveOver: mc.length > 0 ? mc.some((x) => !x.pass) : null,
      };
    })(),
    epdr: r2(rep.metrics.epdr?.minOhm),
    /* M-E van de LAAGSTE weg: de Thévenin-rij waarvan de doorlaatband het
     * laagst begint. Afgeleid, niet bij naam gezocht — nergens in dit project
     * mag een script weten wat een "woofer" is. */
    qesMult: r2(
      [...rep.metrics.thevenin].sort((a, b) => (a.atHz ?? Infinity) - (b.atHz ?? Infinity))[0]
        ?.qMultiplier ?? null,
    ),
    /* Het maximum over de M-C-oordelen van dit rapport — de wegen die het
     * hoogdoorlaatbeschermd noemt, precies de verzameling die de poort
     * oordeelt. Geen wegnaam, geen tweede afleiding. */
    driveDb: (() => {
      const v = rep.gates.verdicts
        .filter((x) => x.gate === 'M-C' && x.value !== null)
        .map((x) => x.value as number);
      return v.length ? r2(Math.max(...v)) : null;
    })(),
    /* De beschermingsmaat van de tuner, gelezen door de adapter die de REGEL
     * uit `protectionDeficit.ts` aanroept — dezelfde functie die de tuner zelf
     * aanroept, want een controlekolom die de grootheid nábouwt controleert
     * niets. Het netwerk wordt opgelost zoals `report.ts` het oplost. */
    protSqDb: r2(protectionOf(key, rep)),
    driveByWay: rep.gates.verdicts
      .filter((x) => x.gate === 'M-C' && x.value !== null)
      .map((x) => ({ way: x.subject, db: r2(x.value as number)! })),
    lobingDipDb: r2(
      rep.metrics.lobingFinal?.worstDipInCrossoverDb ?? rep.metrics.lobingFinal?.worstDipDb ?? null,
    ),
    narrowPeakDb: r2(rep.system.response?.narrowPeaks[0]?.db ?? null),
    narrowPeakHz: r2(rep.system.response?.narrowPeaks[0]?.fHz ?? null),
    groups: correctionGroupsOf(key),
    bultDb: r2(rep.metrics.lfBump[0]?.result.extraDb ?? null),
    seriesLmH: r2(seriesInductanceMH(key, rep.metrics.lfBump[0]?.driver ?? null)),
    liftDb: r2(rep.metrics.lfBump[0]?.result.liftDb ?? null),
    opslingeringDb: r2(rep.metrics.lfBump[0]?.result.resonantDb ?? null),
  };
}

const outcomeByCandidate = new Map((after.outcomes ?? []).map((o) => [o.label, o]));

/* Every candidate either corpus knows about, in the order the newer one ran
 * them — so the table reads as a field with holes rather than as two lists. */
const labels: string[] = unionOfCandidates(before, after);

const num = (v: number | null) => (v === null ? '—' : v.toFixed(2));
/** M-C per weg als één cel: `mid −42,61 / tweeter −25,08`, in de volgorde van
 *  het rapport. Geen weg wordt hier bij naam gezocht. */
const wayCell = (ways: { way: string; db: number }[] | undefined) =>
  !ways ? '—' : ways.length ? ways.map((w) => `${w.way} ${num(w.db)}`).join(' / ') : '—';
const short = (label: string) =>
  label.replace(/woofer→mid /, '').replace(/ LR4 · mid→tweeter /, ' · ').replace(/ LR4$/, '');

console.log(`vóór: ${beforeId}   ná: ${afterId}   gestelde vloer: ${FLOOR ?? '—'} Ω`);
console.log(
  /* The pipes in `|Z|` are ESCAPED, because this line is pasted into the case
   * book as a Markdown table and an unescaped one silently opens two extra
   * columns — which is exactly what happened to the V34 table before anyone
   * looked at the rendered file. */
  '| kandidaat (W-M · M-T) | min \\|Z\\| vóór | min \\|Z\\| ná | @ Hz ná | vloer vóór → ná | ' +
    'SPL ± vóór → ná | W-M fase M-K vóór → ná | W-M fase octaaf (ctl) vóór → ná | ' +
    'W-M fase overlap (ctl) vóór → ná | M-T fase M-K vóór → ná | ' +
    'M-T fase octaaf (ctl) vóór → ná | M-T fase overlap (ctl) vóór → ná | RMS vóór → ná | ' +
    'dissipatie % vóór → ná | grootste R (W) vóór → ná | toegestaan W (V50) | spoel piek A vóór → ná | EPDR vóór → ná | ' +
    'Q_es× vóór → ná | M-C dB vóór → ná | M-C per weg vóór → ná | protSq dB² (ctl) vóór → ná | ' +
    'M-F-eind dB vóór → ná | smalste piek ná (dB @ Hz) | correctiegroepen vóór → ná | ' +
    'LF-bult dB vóór → ná | lift dB vóór → ná | opslingering dB vóór → ná | ' +
    'serie-L mH vóór → ná |',
);
console.log(
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
);

let beforeClears = 0;
let afterClears = 0;
const gone: string[] = [];
const arrived: string[] = [];
/** Elke gemeten rij, per helft — voor het corpusgemiddelde onderaan. */
const measuredBefore: Row[] = [];
const measuredAfter: Row[] = [];
/** De kandidaten die BEIDE corpora dragen, met hun twee metingen — voor de
 *  GEPAARDE delta naast elk corpusgemiddelde (V47-nazorg). Hij wordt hier
 *  verzameld en niet achteraf gereconstrueerd: de koppeling is de kandidaat,
 *  en die staat op dit punt in de lus nog naast beide rijen. */
const pairs: CorpusPair<Row>[] = [];
for (const label of labels) {
  const bKey = before.byCandidate.get(label);
  const aKey = after.byCandidate.get(label);
  const b = bKey ? measure(bKey) : null;
  const a = aKey ? measure(aKey) : null;
  if (b) measuredBefore.push(b);
  if (a) measuredAfter.push(a);
  if (b && a) pairs.push({ label, before: b, after: a });
  if (b?.clearsFloor) beforeClears++;
  if (a?.clearsFloor) afterClears++;
  if (b && !a) gone.push(label);
  if (a && !b) arrived.push(label);
  const outcome = outcomeByCandidate.get(label);
  const afterCell = (v: number | null) =>
    a ? num(v) : outcome?.verwerping ? '**verworpen**' : 'geen netlist';
  console.log(
    `| ${short(label)} | ${num(b?.minZ ?? null)} | ${afterCell(a?.minZ ?? null)} | ` +
      `${a ? num(a.atHz) : '—'} | ` +
      `${b ? (b.clearsFloor ? '**ja**' : 'nee') : '—'} → ${a ? (a.clearsFloor ? '**ja**' : 'nee') : '—'} | ` +
      `${num(b?.splWindow ?? null)} → ${afterCell(a?.splWindow ?? null)} | ` +
      `${num(b?.wmPhase ?? null)} → ${afterCell(a?.wmPhase ?? null)} | ` +
      `${num(b?.wmPhaseOctave ?? null)} → ${afterCell(a?.wmPhaseOctave ?? null)} | ` +
      `${num(b?.wmPhaseOverlap ?? null)} → ${afterCell(a?.wmPhaseOverlap ?? null)} | ` +
      `${num(b?.mtPhase ?? null)} → ${afterCell(a?.mtPhase ?? null)} | ` +
      `${num(b?.mtPhaseOctave ?? null)} → ${afterCell(a?.mtPhaseOctave ?? null)} | ` +
      `${num(b?.mtPhaseOverlap ?? null)} → ${afterCell(a?.mtPhaseOverlap ?? null)} | ` +
      `${num(b?.rms ?? null)} → ${afterCell(a?.rms ?? null)} | ` +
      `${num(b?.dissPct ?? null)} → ${afterCell(a?.dissPct ?? null)} | ` +
      `${num(b?.largestRw ?? null)} → ${afterCell(a?.largestRw ?? null)} | ` +
      `${num(a?.hottestAllowedW ?? b?.hottestAllowedW ?? null)} | ` +
      `${num(b?.coilPeakA ?? null)} → ${afterCell(a?.coilPeakA ?? null)} | ` +
      `${num(b?.epdr ?? null)} → ${afterCell(a?.epdr ?? null)} | ` +
      `${num(b?.qesMult ?? null)} → ${afterCell(a?.qesMult ?? null)} | ` +
      `${num(b?.driveDb ?? null)} → ${afterCell(a?.driveDb ?? null)} | ` +
      `${wayCell(b?.driveByWay)} → ${a ? wayCell(a.driveByWay) : afterCell(null)} | ` +
      `${num(b?.protSqDb ?? null)} → ${afterCell(a?.protSqDb ?? null)} | ` +
      `${num(b?.lobingDipDb ?? null)} → ${afterCell(a?.lobingDipDb ?? null)} | ` +
      `${a && a.narrowPeakDb !== null ? `${num(a.narrowPeakDb)} @ ${num(a.narrowPeakHz)}` : '—'} | ` +
      `${groupCell(b?.groups)} → ${a ? groupCell(a.groups) : outcome?.verwerping ? '**verworpen**' : 'geen netlist'} | ` +
      `${num(b?.bultDb ?? null)} → ${afterCell(a?.bultDb ?? null)} | ` +
      `${num(b?.liftDb ?? null)} → ${afterCell(a?.liftDb ?? null)} | ` +
      `${num(b?.opslingeringDb ?? null)} → ${afterCell(a?.opslingeringDb ?? null)} | ` +
      `${num(b?.seriesLmH ?? null)} → ${afterCell(a?.seriesLmH ?? null)} |`,
  );
}

const beforeSize = before.byCandidate.size;
const afterSize = after.byCandidate.size;
console.log('');
console.log(`bevroren: ${beforeSize} vóór → ${afterSize} ná`);
console.log(
  `haalt de vloer ALS BESTAND: ${beforeClears} van ${beforeSize} vóór → ` +
    `${afterClears} van ${afterSize} ná`,
);
/* V36 — het corpusgemiddelde, uit de rijen die hierboven al gemeten zijn.
 * Opnieuw `measure()` aanroepen zou elke netlist een tweede keer oplossen voor
 * een gemiddelde, en dat is precies het patroon dat A3g elders verbiedt. */
const avg = (xs: (number | null)[]) => mean(xs);
const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1));

/**
 * V47-NAZORG — DE GEPAARDE DELTA, EN ZIJ STAAT SINDS 01-09-2026 NAAST ÉLK
 * CORPUSGEMIDDELDE HIERONDER.
 *
 * Een corpusgemiddelde is een gemiddelde over de netlists die het corpus
 * TOEVALLIG bevat. Een eis die netlists verwijdert verandert het dus zonder
 * één netwerk aan te raken, en het verschil leest dan als een aankoop terwijl
 * het compositie is. Bij V47 gebeurde dat twee keer en in beide richtingen:
 * de W-M-fase las als winst (25,3° → 13,1°) doordat de twee slechtste netlists
 * het veld verlieten — gepaard verslechterde zij van 11,97° naar 13,06° — en
 * de dissipatie las als verlies (60,4 % → 62,2 %) terwijl diezelfde vier
 * netlists van 69,1 % naar 62,2 % gingen. De entry ving de eerste met een
 * alinea eronder en de tweede helemaal niet; een leesregel die van een alinea
 * afhangt is geen leesregel.
 *
 * Het corpusgemiddelde beschrijft dus het VELD en de gepaarde delta de
 * INGREEP, en alleen de tweede mag als verbetering of verslechtering gelezen
 * worden. Het AANTAL PAREN staat er altijd bij: een delta over één paar is een
 * anekdote en hoort als zodanig te lezen. De statistiek zelf zit in
 * `casus1Corpora.fixture.ts`, zodat `corpusPairing.test.ts` haar kan
 * reproduceren in plaats van nábouwen.
 */
const paired = (pick: (r: Row) => number | null, unit = ''): string => {
  const d = pairedDelta(pairs, pick);
  /* TWEE decimalen en niet één, anders dan het corpusgemiddelde ernaast: een
   * gepaarde delta is per constructie klein — dat is juist wat zij laat zien —
   * en op één decimaal verdwijnt het verschil tussen "niets bewogen" en "iets
   * de verkeerde kant op". De W-M-fase van V47 is het geval: 11,97 → 13,06. */
  const p2 = (v: number | null) => (v === null ? '—' : v.toFixed(2));
  return (
    `${p2(d.before)}${unit} → ${p2(d.after)}${unit} ` +
    `(${d.n} ${d.n === 1 ? 'paar' : 'paren'})`
  );
};
console.log(
  `dissipatie (M-A) gemiddeld: ${fmt(avg(measuredBefore.map((r) => r.dissPct)))} % vóór → ` +
    `${fmt(avg(measuredAfter.map((r) => r.dissPct)))} % ná; grootste enkele weerstand gemiddeld ` +
    `${fmt(avg(measuredBefore.map((r) => r.largestRw)))} W → ` +
    `${fmt(avg(measuredAfter.map((r) => r.largestRw)))} W bij ${SETTINGS.amplifierPowerW} W. ` +
    `Gepaard: ${paired((r) => r.dissPct, ' %')} en ${paired((r) => r.largestRw, ' W')}. ` +
    'De fractie is een kolom en geen oordeel: casus 1 stelt geen dissipatiegrens (P4).',
);
/* V50 — de weerstandseis als corpusregel (M-A/part): de heetste weerstand tegen
 * klasse × marge, en de piekstroom per spoel als kolom (M-L, geen klasse
 * gesteld). De grens wordt uit het OORDEEL gelezen en nooit hier vergeleken. */
{
  const allowed = [...measuredAfter, ...measuredBefore].find((r) => r.hottestAllowedW !== null)?.hottestAllowedW ?? null;
  const over = (rows: Row[]) => rows.filter((r) => r.resistorOver === true).length;
  const judged = (rows: Row[]) => rows.filter((r) => r.resistorOver !== null).length;
  console.log(
    allowed === null
      ? 'M-A/part (V50): geen weerstandsklasse met marge gesteld, dus de watt hierboven is een kolom en geen eis (P4).'
      : `M-A/part (V50): toegestaan ${allowed.toFixed(1)} W per weerstand (klasse × marge, bij ` +
        `${SETTINGS.amplifierPowerW} W continu): ${over(measuredBefore)} van ${judged(measuredBefore)} eroverheen vóór, ` +
        `${over(measuredAfter)} van ${judged(measuredAfter)} ná. Een POORT in het rapport; of zij ook de ZOEKTOCHT ` +
        'wapent staat in gestelde_eisen.bouwbaarheid_op_de_zoektocht.',
  );
  console.log(
    `M-L (V50): piekstroom door de drukste spoel gemiddeld ${fmt(avg(measuredBefore.map((r) => r.coilPeakA)))} A vóór → ` +
      `${fmt(avg(measuredAfter.map((r) => r.coilPeakA)))} A ná bij de piekingang. Gepaard: ${paired((r) => r.coilPeakA, ' A')}. ` +
      'Een kolom, geen oordeel: casus 1 stelt geen spoelklasse (de C-Coil-documentatie noemt geen verzadigingsstroom).',
  );
}
/* V44 — DRIE fasematen als corpusgemiddelde, met naam en in volgorde: de maat
 * eerst, de twee die zij vervangt erachter. Zij oordelen niets meer — geen
 * poort, geen eis, geen sorteersleutel leest ze — maar zij blijven staan omdat
 * hun onderlinge tegenspraak het bewijsmateriaal onder V44 is: verdwijnt zij
 * ooit, dan is er aan een van beide iets veranderd zonder dat iemand het
 * besloot, en dat hoort zichtbaar te zijn. */
console.log(
  `W-M fase gemiddeld: M-K ${fmt(avg(measuredBefore.map((r) => r.wmPhase)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.wmPhase)))}°, controle octaafgeknipt ` +
    `${fmt(avg(measuredBefore.map((r) => r.wmPhaseOctave)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.wmPhaseOctave)))}°, controle overlapvenster ` +
    `${fmt(avg(measuredBefore.map((r) => r.wmPhaseOverlap)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.wmPhaseOverlap)))}°. ` +
    `Gepaard: M-K ${paired((r) => r.wmPhase, '°')}, octaafgeknipt ` +
    `${paired((r) => r.wmPhaseOctave, '°')}, overlapvenster ` +
    `${paired((r) => r.wmPhaseOverlap, '°')}.`,
);
console.log(
  `M-T fase gemiddeld: M-K ${fmt(avg(measuredBefore.map((r) => r.mtPhase)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.mtPhase)))}°, controle octaafgeknipt ` +
    `${fmt(avg(measuredBefore.map((r) => r.mtPhaseOctave)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.mtPhaseOctave)))}°, controle overlapvenster ` +
    `${fmt(avg(measuredBefore.map((r) => r.mtPhaseOverlap)))}° → ` +
    `${fmt(avg(measuredAfter.map((r) => r.mtPhaseOverlap)))}°. ` +
    `Gepaard: M-K ${paired((r) => r.mtPhase, '°')}, octaafgeknipt ` +
    `${paired((r) => r.mtPhaseOctave, '°')}, overlapvenster ` +
    `${paired((r) => r.mtPhaseOverlap, '°')}. ` +
    'De twee controlekolommen zijn de maten die tot V43 in deze tabel stonden; ' +
    'zie casusboek V40 voor waarom geen van beide de luidspreker beschreef.',
);
/* V41 — het CORPUSTOTAAL per correctierol, want dat is de vraag van
 * beslispunt B en C in één regel: koopt de synthese ze nu wel. Per rol, want
 * "meer groepen" zegt niets — een Zobel en een niveauweerstand zijn niet
 * hetzelfde soort aankoop, en alleen de eerste vier zijn wat V38 miste. */
const roleTotals = (rows: Row[]) => {
  const t: Record<string, number> = {};
  for (const role of CORRECTION_ROLES) t[role] = 0;
  for (const r of rows) for (const role of CORRECTION_ROLES) t[role] += r.groups[role] ?? 0;
  return t;
};
{
  const tb = roleTotals(measuredBefore);
  const ta = roleTotals(measuredAfter);
  /* Een TELLING en geen gemiddelde, maar zij lijdt aan precies hetzelfde:
   * twaalf gedempte vallen over zeven netlists tegen zes over vier zegt niets
   * over de synthesestap. Vandaar dezelfde gepaarde lezing eronder, op de
   * netlists die beide corpora dragen. */
  const pb = roleTotals(pairs.map((p) => p.before));
  const pa = roleTotals(pairs.map((p) => p.after));
  console.log(
    'correctiegroepen over het corpus (' +
      CORRECTION_ROLES.map((r) => `${r} ${tb[r]}→${ta[r]}`).join(', ') +
      `) over ${measuredBefore.length} → ${measuredAfter.length} netlists. ` +
      'Gepaard (' +
      CORRECTION_ROLES.map((r) => `${r} ${pb[r]}→${pa[r]}`).join(', ') +
      `) over ${pairs.length} paren. ` +
      'Een kolom, geen oordeel: een correctiegroep is een shunt en kost dissipatie en |Z|.',
  );
}
/* V42 — de doelgrootheid als corpusregel, met het gestelde budget ernaast.
 * Het budget wordt GELEZEN uit het manifest en nooit hier geschreven (P6). */
{
  const budget = casus1LfResonantBudgetDb(golden);
  const overCount = (rows: Row[]) =>
    budget === null
      ? null
      : rows.filter((r) => r.opslingeringDb !== null && r.opslingeringDb > budget).length;
  console.log(
    `LF-bult (M-D) gemiddeld: ${fmt(avg(measuredBefore.map((r) => r.bultDb)))} dB vóór → ` +
      `${fmt(avg(measuredAfter.map((r) => r.bultDb)))} dB ná, ontleed in lift ` +
      `${fmt(avg(measuredBefore.map((r) => r.liftDb)))} → ${fmt(avg(measuredAfter.map((r) => r.liftDb)))} dB ` +
      `en opslingering ${fmt(avg(measuredBefore.map((r) => r.opslingeringDb)))} → ` +
      `${fmt(avg(measuredAfter.map((r) => r.opslingeringDb)))} dB; totale serie-L van de laagste weg ` +
      `${fmt(avg(measuredBefore.map((r) => r.seriesLmH)))} → ` +
      `${fmt(avg(measuredAfter.map((r) => r.seriesLmH)))} mH. ` +
      `Gepaard: bult ${paired((r) => r.bultDb, ' dB')}, lift ${paired((r) => r.liftDb, ' dB')}, ` +
      `opslingering ${paired((r) => r.opslingeringDb, ' dB')}, serie-L ` +
      `${paired((r) => r.seriesLmH, ' mH')}. ` +
      (budget === null
        ? 'Geen budget gesteld, dus dit is een kolom en geen eis (P4).'
        : `Gesteld budget ${budget} dB OP DE OPSLINGERING (V43): ${overCount(measuredBefore)} van ` +
          `${measuredBefore.length} eroverheen vóór, ${overCount(measuredAfter)} van ` +
          `${measuredAfter.length} ná. De LIFT wordt hier nog steeds niet door DIT budget ` +
          'geoordeeld: hij is ankerdomein, en dat domein heeft sinds V45 zijn eigen mechanismen ' +
          '(de doelcurve die de zoektocht stuurt, en de Q_es-grens op de serieweerstand die de ' +
          'lift veroorzaakt) in plaats van een tweede budget op deze grootheid — A5e.2, ' +
          'gesloten.'),
  );
}
/* V47 — de tweede GESTELDE eis met een corpusregel, in dezelfde vorm als het
 * LF-budget hierboven en om dezelfde reden: een kolom zonder haar grens laat
 * de lezer niet zien of het veld erdoorheen kwam. De grens wordt GELEZEN uit
 * het manifest en nooit hier geschreven (P6). */
{
  const ceiling = casus1MaxDriveOnFsDb(golden);
  /* V50 — PER WEG tegen zijn EIGEN grens (gesteld op de tweeter, afgeleid op
   * de mid): gelezen uit de oordelen, niet hier tegen één getal gelegd. */
  const overCount = (rows: Row[]) =>
    ceiling === null
      ? null
      : rows.filter((r) => r.driveOver === true).length;
  console.log(
    `M-C op de slechtst beschermde weg gemiddeld: ${fmt(avg(measuredBefore.map((r) => r.driveDb)))} dB ` +
      `vóór → ${fmt(avg(measuredAfter.map((r) => r.driveDb)))} dB ná. ` +
      `Gepaard: ${paired((r) => r.driveDb, ' dB')}. ` +
      (ceiling === null
        ? 'Geen grens gesteld, dus dit is een kolom en geen eis (P4).'
        : `Gestelde grens ${ceiling} dB op de tweeter (V47, sinds V50 PER WEG; de mid oordeelt op de ` +
          `afgeleide excursiegrens alleen): ${overCount(measuredBefore)} van ` +
          `${measuredBefore.length} netlists met een falend M-C-oordeel vóór, ${overCount(measuredAfter)} van ` +
          `${measuredAfter.length} ná. Anders dan het LF-budget is dit een POORT: hij begrenst ` +
          'niet alleen de zoektocht maar veroordeelt ook een geleverd netwerk, en op de v2-route ' +
          'vervangt hij de zaadvergelijking van de volle-band-veiligheidspoort.'),
  );
}
/* V47 — DE CONTROLEKOLOM ALS CORPUSREGEL, en de vraag die zij stelt.
 * `protSqDb` is wat de zaadvergelijking mat en M-C is wat de gestelde eis
 * meet; zij vallen niet samen. HUIDIG is de ijk aan beide kanten — de eis is
 * er van afgeleid — dus de vraag is of een netlist die M-C haalt ook op
 * protSqDb niet slechter is dan HUIDIG. Een netlist waar dat NIET zo is, is
 * een bevinding: dan dekt "f_s alleen" niet wat de relatieve regel dekte. */
{
  const huidig = measure('HUIDIG');
  const worse = (rows: Row[]) =>
    huidig.protSqDb === null
      ? null
      : rows.filter((r) => r.protSqDb !== null && r.protSqDb > huidig.protSqDb!).length;
  const live = (rows: Row[]) => rows.filter((r) => r.protSqDb !== null && r.protSqDb > 0).length;
  console.log(
    `protSq (controle, GEEN poort) gemiddeld: ${fmt(avg(measuredBefore.map((r) => r.protSqDb)))} dB² ` +
      `vóór → ${fmt(avg(measuredAfter.map((r) => r.protSqDb)))} dB² ná; gepaard ` +
      `${paired((r) => r.protSqDb, ' dB²')}; HUIDIG ` +
      `${fmt(huidig.protSqDb)} dB². Boven nul: ${live(measuredBefore)} van ${measuredBefore.length} ` +
      `vóór, ${live(measuredAfter)} van ${measuredAfter.length} ná; slechter dan HUIDIG: ` +
      `${worse(measuredBefore)} → ${worse(measuredAfter)}. ` +
      'DIT IS DE MAAT DIE DE ZAADVERGELIJKING LAS en niet de maat waarop de eis staat, en op deze ' +
      'casus liggen zij op de TWEETER niet eens over dezelfde frequenties: protSq integreert onder ' +
      'xo/3 en M-C leest f_s, dus f_s valt pas in de band bij een kruispunt boven 3·f_s — hoger ' +
      'dan dit veld ooit kruist. Een netlist die M-C haalt en hier slechter is dan HUIDIG zou ' +
      'zeggen dat "f_s alleen" niet dekt wat de relatieve regel dekte; nul boven nul zegt dat de ' +
      'relatieve maat op geleverde netwerken inert is (V47).',
  );
}
/* V47b — de verticale lobing-synthese als corpusregel: een kolom, geen oordeel.
 * Casus 1 stelt geen lobinggrens, en de synthese is per A4 de enige autoriteit
 * over lobing (de λ-fracties rangschikken niets, V20). Zij staat hier omdat de
 * aandrijfeis het M-T-veld naar lagere kruispunten opent en dáár de verticale
 * som het eerst iets kost. */
{
  const off = (rows: Row[]) => rows.filter((r) => r.lobingDipDb === null).length;
  console.log(
    `verticale lobing-synthese (M-F-eind, diepste dip in het kruisgebied) gemiddeld: ` +
      `${fmt(avg(measuredBefore.map((r) => r.lobingDipDb)))} dB vóór → ` +
      `${fmt(avg(measuredAfter.map((r) => r.lobingDipDb)))} dB ná; gepaard ` +
      `${paired((r) => r.lobingDipDb, ' dB')}; synthese UIT op ${off(measuredBefore)} → ` +
      `${off(measuredAfter)} netlists. Een kolom, geen oordeel: casus 1 stelt geen lobinggrens (P4).`,
  );
}
console.log(`uit de shortlist gevallen: ${gone.length}${gone.length ? ` — ${gone.map(short).join('; ')}` : ''}`);
console.log(`nieuw in de shortlist: ${arrived.length}${arrived.length ? ` — ${arrived.map(short).join('; ')}` : ''}`);

/* The run's own account only exists for the LIVE corpus — a dated one is a set
 * of files and nothing more, and inventing a rejection list for it would be a
 * claim about a run nobody can re-read. */
if (after.outcomes) {
  const refused = after.outcomes.filter((o) => o.verwerping !== null);
  console.log(
    `\nkandidaten die GEEN netwerk leverden: ${refused.length} van ${after.outcomes.length}`,
  );
  for (const o of refused) {
    const t = o.verwerping!.geweigerde_tune;
    console.log(
      `  ${short(o.label)} — geweigerd door ${o.verwerping!.regels.join(', ') || '(geen categorie)'}; ` +
        `de geweigerde tune stond op ${t?.minZOhm?.toFixed(2) ?? '—'} Ω / ` +
        `±${t?.windowPlusMinusDb?.toFixed(2) ?? '—'} dB / RMS ${t?.rmsDeviationDb?.toFixed(2) ?? '—'} dB`,
    );
    console.log(`      reden: ${o.verwerping!.reden}`);
  }
  const gateRefused = after.outcomes.filter(
    (o) => o.verwerping === null && o.geweigerd_door.length > 0,
  );
  console.log(`\nkandidaten die een netwerk leverden dat een POORT weigerde: ${gateRefused.length}`);
  for (const o of gateRefused) {
    const z = o.poorten.find((p) => p.poort === 'M-B/|Z|');
    console.log(`  ${short(o.label)} — ${o.geweigerd_door.join(', ')}; min |Z| ${z?.waarde ?? '—'} Ω`);
  }
}
