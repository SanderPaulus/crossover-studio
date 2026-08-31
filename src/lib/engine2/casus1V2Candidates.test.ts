/**
 * F4d — THE FROZEN v2 CANDIDATES OF CASUS 1.
 *
 * The `KAND-V2-*.adsfilter.json` files in `test-fixtures/casus1/` are the
 * shortlist of the run `scripts/generate-casus1-v2-candidates.ts` performed, and
 * they are frozen for exactly the reason the three v1 candidates are: F4a
 * established that casus 1 has NO class-C references — no reference in the file
 * depends on what a search found — and V19 says why that matters precisely now.
 * Writing "what the v2 run produced" into the reference file would create the
 * first one, on the day v2 started producing things.
 *
 * So the netlists are FILES, their metrics are class B (a function of the
 * measurement set and a netlist), and this file checks three separate claims:
 *
 *  1. THE METRICS REPRODUCE. Same discipline as the three baselines: the metric
 *     library, run on a file that does not move.
 *  2. THE COMPARISON IS HONEST. The v2 candidates and the v1 baselines are put
 *     through the same assembly and shown side by side. Nothing is ranked — and
 *     what the table shows is NOT flattering to the candidates, which is
 *     recorded rather than tidied (casebook V27).
 *  3. THE RUN REPRODUCES THEM. One live pass through the real worker route
 *     delivers the stored network byte for byte.
 *
 * COST, STATED BECAUSE IT IS REAL AND BECAUSE IT CHANGED. Claim 3 runs one full
 * casus-1 chain, and since V33 that is ELEVEN MINUTES rather than the 37–72 s
 * the F4d follow-up measured — plus a second live run for the refusal below.
 * The factor is not a regression: V33 put the amp-load barrier on the same
 * measured impedance sweep the `M-B/|Z|` gate enforces, so the objective now
 * solves the network on the analysis-resolution grid at every evaluation
 * instead of on the decimated one (measured on one candidate, both arms: 44.0 s
 * against 669.8 s at 88 008 against 86 399 evaluations). It is the price of the
 * goal and the limit reading one number, it is paid here because this file is
 * where the corpus is accepted, and it is written down rather than discovered.
 * TWO candidates run live and the rest are read from disk. A regression nobody
 * runs because it is slow protects nothing; the discipline is
 * `workerRouteRegression.test.ts`'s and the reasoning is the same.
 *
 * FIFTEEN CANDIDATES, FEWER FILES — and the gap between those two numbers is
 * where the interesting part of this casus now lives. The F4d follow-up
 * suspended the F3c recommended-band excision (casebook V28): the zone it cut is
 * a λ fraction on one centre-to-centre distance, and V20a reserves every lobing
 * judgement for the vertical synthesis. The mid→tweeter axis went from three
 * positions to five, so the FIELD went from nine to fifteen — and the shortlist,
 * which passed nine of nine when the field was nine, has refused candidates ever
 * since. What is frozen is the shortlist, as it always was, and the counts are
 * READ from the provenance block rather than written here: they have moved at
 * V28, V30, V32 and V33, and a number in a comment moves later than the thing it
 * describes.
 *
 * These are therefore different FILES under the same discipline, which is
 * precisely why no reference had to be declared invalid: the references hang on
 * files, and the files were replaced.
 *
 * The DETERMINISM claim proper — two runs, one seed, byte-identical, through
 * `handleV2Request` — is proved in `optimizer/candidateRoute.test.ts` on a
 * cheap fixture, because it is a claim about the ROUTE and not about casus 1.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_DIR,
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import {
  CASUS1_AMP_MIN_LOAD_OHM,
  CASUS1_V2_BUDGETS,
  CASUS1_MAX_DRIVE_ON_FS_DB,
  CASUS1_V2_GATES,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_GRID,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
  CASUS1_QES_MULTIPLIER_MAX,
  CASUS1_TARGET_CURVE,
} from './casus1V2.fixture.ts';
import { buildReport, type EngineV2Report } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import { SEARCH_SMOOTHING_OCTAVES } from './constants.ts';
import { SYNTHESIS_LEAN_DEFAULT_DB } from '../synthesis.ts';
import { DEFAULT_EQ_BANDS_PER_DRIVER } from '../vfOptimizer.ts';
import { compareDesigns } from './predesign/comparison.ts';
import { stableJson } from './optimizer/determinism.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from './optimizer/worker.ts';
import type { Chain3Input, Chain3Result } from '../threeWayChain.ts';

const golden = loadGolden();
const TOL = golden.toleranties;
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const HERKOMST = JSON.parse(
  readFileSync(join(CASUS1_DIR, '..', 'casus1_v2_herkomst.json'), 'utf-8'),
) as {
  seed: number;
  run_vingerafdruk: string;
  gegenereerd_op_commit: string;
  bestanden: { name: string; label: string }[];
  generator_parameters: { derivedSize: number; deliveredSize: number };
  shortlist: { overwogen: number; bevroren: number; leverde_geen_netwerk: number };
  /** V31 — the candidates that delivered no network, and the rule that refused each. */
  verwerpingen: {
    label: string;
    kinds: string[];
    reason: string;
    rejectedTune?: Record<string, number | null>;
  }[];
  meetopstelling: {
    synthMode: string;
    v2_poorten_gewapend: string[];
    v2_poorten_waarom: string;
    /** V32/V47 — per gewapende poort: de sleutel, de gestelde waarde en waar
     *  zij vandaan komt. Een naam zonder getal laat de lezer raden. */
    v2_poorten_bron: Record<string, unknown>;
    v2_budgetten_gewapend: string[];
    v2_budgetten_waarom: string;
    beschermingen_via_kandidaat: string[];
    vloer_is_zoekdoel: boolean;
    /** V33 — and WHERE that goal is measured. */
    vloer_zoekdoel_bron: string | null;
    vloer_zoekdoel_bron_waarom: string;
    /** V34 — where the source-resistance probe reads, and the two limits it is
     *  compared against. `null` on either limit is casus 1 stating none. */
    probe_raster: string | null;
    probe_raster_waarom: string;
    bronweerstandsgrens: number | null;
    bronweerstandsgrens_waarom: string;
    bronweerstandsgrens_herkomst: string;
    audittier_ohm: number | null;
    audittier_waarom: string;
    /** V37 — and WHAT the dissipation term divides by. A choice key of its own:
     *  not where the probe reads (that is `probe_raster`) but which quantity
     *  its reading is a ratio OF. */
    dissipatie_noemer: string | null;
    dissipatie_noemer_waarom: string;
    /** V38-fix — WELKE KROMME de amplitudeterm van de zoektocht meet. Niet
     *  hoeveel moeite hij doet (polish) maar waarvan hij de spreiding is. */
    zoekmaat_gladding_oct: number | null;
    zoekmaat_waarom: string;
    /** V47 — WELKE REGEL een onbeschermde bovenste driver verbiedt: de
     *  vergelijking met het zaad, of de gestelde absolute eis. */
    beschermingsregel: string | null;
    beschermingsregel_waarom: string;
    /** V44 — WELKE PUNTEN het fase-oordeel dragen. Niet hoe fase gewogen wordt
     *  (dat is `fasemaat`) maar over welke punten het gemiddelde gaat. */
    fase_toelating: string | null;
    fase_toelating_waarom: string;
    /** V41 — wat de ONTWERP- en SYNTHESESTAP mochten bouwen. Eén laag hoger dan
     *  alle bovenstaande: deze twee worden gelezen vóórdat de tuner bestaat,
     *  dus zij bepalen wat de topologie KAN zijn en niet welke waarden zij
     *  krijgt. */
    eq_budget_per_tak: number | null;
    eq_budget_waarom: string;
    lean_drempel_db: number | null;
    lean_drempel_waarom: string;
    /** V45 — WAARTEGEN de amplitudeterm vlak is (keuze), plus de doelcurve die
     *  hij leest en de gestelde Q_es-grens. Niet WELKE som (dat is `ampTarget`)
     *  maar wat er als vlak telt voor die som. */
    amplitude_referentie: string | null;
    amplitude_referentie_waarom: string;
    doelcurve: string;
    doelcurve_herkomst: string;
    qes_grens: number | null;
    qes_grens_waarom: string;
    dissipatiegewicht: number;
    dissipatiegewicht_waarom: string;
    seed: number;
  };
};

/* THE LIVE CORPUS, anchored. `startsWith('KAND_V2')` was safe while nothing
 * else began with those letters and is a trap now that the case book holds
 * dated corpora — the same trap `record-casus1-v2-references.ts` documents at
 * length. Anchored here too, so the two agree about what "the live corpus"
 * means. */
const V2_KEYS = Object.keys(golden.manifest_en_geometrie.netlists).filter((k) =>
  /^KAND_V2_\d+$/.test(k),
);

const report = (key: string): EngineV2Report =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings: {
      amplifierPowerW: 100,
      orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
      reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
      targetCurve: CASUS1_TARGET_CURVE,
    },
  });

describe('the frozen v2 candidates are files, and the file says where they came from', () => {
  it('every generated netlist is listed in the manifest and readable', () => {
    expect(V2_KEYS.length).toBe(HERKOMST.bestanden.length);
    for (const key of V2_KEYS) {
      const name = golden.manifest_en_geometrie.netlists[key];
      expect(name).toMatch(/^KAND-V2-\d+\.adsfilter\.json$/);
      expect(readFileSync(join(CASUS1_DIR, name), 'utf-8').length).toBeGreaterThan(100);
    }
  });

  it('NO ORPHANS: every KAND-V2 file on disk is a netlist the case book names', () => {
    /* THE HOLE A SHRINKING CORPUS OPENED, and it opened it for real.
     *
     * Until V32 every regeneration produced the same number of netlists, so
     * `KAND-V2-8..10` from the previous run were simply overwritten. V32's
     * field delivers seven where the last one delivered ten, the recorder
     * prunes the manifest entries — and the three FILES stayed on disk,
     * unreferenced, byte-identical to a dated corpus under a name that says
     * they are live. Nothing failed; a reader browsing the directory would
     * have found three designs the case book has withdrawn.
     *
     * So the directory is the assertion, not the manifest: a file that no
     * entry names is an orphan, and an orphan is deleted rather than
     * explained. The dated corpora are excluded by having their own prefix —
     * that is what a dated name is FOR. */
    const named = new Set(Object.values(golden.manifest_en_geometrie.netlists));
    const onDisk = readdirSync(CASUS1_DIR).filter((f) => /^KAND-V2-\d+\.adsfilter\.json$/.test(f));
    expect(onDisk.length, 'no KAND-V2 files on disk at all').toBeGreaterThan(0);
    for (const f of onDisk) {
      expect(named, `${f} is on disk but no manifest entry names it — delete it or name it`)
        .toContain(f);
    }
    expect(onDisk.length).toBe(V2_KEYS.length);
  });

  it('the provenance block is DOCUMENTATION and says so', () => {
    /* Nothing here is an acceptance value. It exists so a later reader can
     * regenerate these files and know what they are comparing against. */
    expect(HERKOMST.seed).toBe(CASUS1_V2_SEED);
    expect(HERKOMST.gegenereerd_op_commit).toMatch(/^[0-9a-f]{40}$/);
    expect(HERKOMST.run_vingerafdruk).toContain(`seed=${CASUS1_V2_SEED}`);
    // The `choices` ingredient is what F4d added on this route: a run over a
    // different candidate field must not stamp the same.
    expect(HERKOMST.run_vingerafdruk).toMatch(/choices=[0-9a-f]{8}/);
    /* Derived rather than typed: the field size has already changed once
     * (nine → fifteen at V28) and a hard-coded count turns a legitimate
     * regeneration into a test edit. What must hold is that the manifest, the
     * files on disk and the generator's own bookkeeping agree. */
    expect(HERKOMST.generator_parameters.deliveredSize).toBe(HERKOMST.shortlist.overwogen);
    expect(HERKOMST.shortlist.bevroren).toBe(HERKOMST.bestanden.length);
    expect(HERKOMST.shortlist.bevroren).toBeLessThanOrEqual(HERKOMST.shortlist.overwogen);
    expect(HERKOMST.generator_parameters.derivedSize).toBeGreaterThanOrEqual(
      HERKOMST.generator_parameters.deliveredSize,
    );
  });

  it('the provenance block names the MEASUREMENT SETUP — synthesis, gates, budgets', () => {
    /* F4d-nazorg, controle 2. V27 records two wrong setups before the
     * definitive one: protections unarmed (min |Z| 0.00 Ω) and
     * `synthMode: 'filter'` where the app runs `'acoustic'`. Neither was
     * readable back off what the manifest wrote down, so both had to be
     * reconstructed from memory. These four assertions make the setup part of
     * the artefact instead. */
    const m = HERKOMST.meetopstelling;
    expect(m.synthMode).toBe(CASUS1_V2_SETTINGS.synthMode);
    // Absent is written as absent WITH its reason, never omitted — P4. An
    // omitted key reads as an oversight.
    expect(Array.isArray(m.v2_poorten_gewapend)).toBe(true);
    expect(m.v2_poorten_waarom).toMatch(/P4/);
    expect(Array.isArray(m.v2_budgetten_gewapend)).toBe(true);
    expect(m.v2_budgetten_waarom.length).toBeGreaterThan(0);
    // The protections V27's first pass left out are named, and they are named
    // by being READ OFF the declaration rather than restated.
    for (const k of ['safety', 'staged', 'audit']) {
      expect(m.beschermingen_via_kandidaat, `${k} is not declared`).toContain(k);
    }
    /* V34 — AND ONE OF THEM IS DECLARED BY BEING ABSENT, which is a different
     * statement from being forgotten and has to read as one. Casus 1 states no
     * source-resistance requirement, so the candidate carries no
     * disqualification limit; until V34 the fixture typed the app's 2.0 Ω UI
     * default into itself and the chain would have fallen back to the same
     * number anyway. Both halves are asserted: the key is NOT in the stated
     * list, and the reason it is not is recorded with P4 named. */
    expect(m.beschermingen_via_kandidaat).not.toContain('rSourceDisqualifyOhm');
    expect(m.bronweerstandsgrens).toBe(null);
    expect(m.bronweerstandsgrens_waarom).toMatch(/P4/);
    expect(m.bronweerstandsgrens_herkomst).toMatch(/V34/);
    /* ...and the audit tier beside it: `null` is a value, and it means the
     * audit runs while its source-resistance tier judges nothing. */
    expect(m.audittier_ohm).toBe(null);
    expect(m.audittier_waarom).toMatch(/P4/);
    /* WHERE the probe reads, which is the other half of V34 and a choice key of
     * its own — read off the declaration, like the floor's two lines above. */
    expect(m.beschermingen_via_kandidaat).toContain('rSourceProbeSource');
    expect(m.probe_raster).toBe('safety');
    expect(m.probe_raster_waarom).toMatch(/640,2 Hz/);
    expect(m.seed).toBe(CASUS1_V2_SEED);
    /* V30 and V33, and they are two lines because they are two decisions: IS
     * the stated floor a search goal, and WHERE is that goal measured. A run
     * that recorded only the first would look identical before and after V33,
     * which is exactly the confusion the second line exists to end. */
    expect(m.vloer_is_zoekdoel).toBe(CASUS1_AMP_MIN_LOAD_OHM !== null);
    expect(m.vloer_zoekdoel_bron).toBe(CASUS1_AMP_MIN_LOAD_OHM !== null ? 'safety' : null);
    expect(m.vloer_zoekdoel_bron_waarom).toMatch(/V33/);
    /* V37 — WHAT that probe's reading is a ratio of, which is a third decision
     * beside the two above and is recorded as one. The term is named
     * `R_source/R_e` and divided by the impedance PEAK until V37; on this casus
     * that is 19.31 Ω against a metered 3.05 Ω, squared. Two lines again: the
     * quantity, and the weight it is multiplied by — the weight is GREY and
     * deliberately untouched, and a record that showed only the repair would
     * read as though the weight had been tuned to fit. */
    expect(m.beschermingen_via_kandidaat).toContain('dissipationReferenceSource');
    expect(m.dissipatie_noemer).toBe('re');
    expect(m.dissipatie_noemer_waarom).toMatch(/V37/);
    expect(m.dissipatiegewicht).toBe(CASUS1_V2_SETTINGS.dissipationWeight);
    expect(m.dissipatiegewicht_waarom).toMatch(/A3j/);
    /* V45 — het ZEVENDE en ACHTSTE besluit, en zij horen bij elkaar zonder
     * hetzelfde te zijn. `amplitude_referentie` is de keuze-sleutel: waartegen
     * de amplitudeterm vlak is. `doelcurve` is de POLISH ernaast — de voicing
     * van het ontwerp zelf, met beide helften van haar herkomst, want een
     * curve zonder haar diepte én haar overgang is geen curve (V15). */
    expect(m.beschermingen_via_kandidaat).toContain('amplitudeReference');
    expect(m.amplitude_referentie).toBe('target');
    expect(m.amplitude_referentie_waarom).toMatch(/V45/);
    expect(m.doelcurve).toContain('bass-plateau');
    // De twee helften komen uit twee soorten bron, en de tekst zegt welke.
    expect(m.doelcurve_herkomst).toMatch(/GESTELD|gesteld/);
    expect(m.doelcurve_herkomst).toMatch(/AFGELEID|afgeleid/);
    expect(m.doelcurve_herkomst).toMatch(/P6/);
    /* En de Q_es-grens, die GEEN keuze-sleutel is maar een gesteld budget —
     * dezelfde soort invoer als de vloer en het opslingeringsbudget, dus hij
     * hoort ook in `v2_budgetten_gewapend` te staan en niet alleen hier. */
    expect(m.qes_grens).toBe(CASUS1_QES_MULTIPLIER_MAX);
    expect(m.qes_grens_waarom).toMatch(/V45/);
    if (CASUS1_QES_MULTIPLIER_MAX !== null) {
      expect(m.v2_budgetten_gewapend).toContain('qesMultiplierMax');
    }
    /* V38-fix — WELKE KROMME de amplitudeterm meet, en het is een vierde
     * besluit naast de drie hierboven. Tot V38-fix stond `errorSmoothOct` als
     * POLISH geclassificeerd en erfde de v2-route hem uit de keten: de
     * zoektocht mat de spreiding van een som van gegladde magnitudes met
     * ongemoeide fase, terwijl elk oordeel de ongegladde som leest. Op dit
     * ketenraster trok die gladding de stille geest van net buiten de band
     * over de bandrand heen. Nul is hier "meet de kromme die beoordeeld
     * wordt", geen casus-1-getal — en dat verschil is precies waarom het veld
     * ERBIJ staat in plaats van in de code. */
    expect(m.beschermingen_via_kandidaat).toContain('errorSmoothOct');
    expect(m.zoekmaat_gladding_oct).toBe(SEARCH_SMOOTHING_OCTAVES);
    expect(m.zoekmaat_waarom).toMatch(/V38-fix/);
    /* V47 — WELKE REGEL een onbeschermde bovenste driver verbiedt, en het is
     * het eerste besluit in dit blok dat een POORT wapent in plaats van alleen
     * de zoektocht te sturen. Twee regels, want het zijn twee dingen: de
     * gestelde grens (die M-C oordeelt op élke hoogdoorlaatbeschermde weg) en
     * de keuze-sleutel die daaruit volgt (die de zaadvergelijking van de
     * volle-band-veiligheidspoort laat vervallen). Een verslag dat alleen het
     * eerste noteerde zou niet laten zien dat er ook iets IS WEGGEHAALD. */
    expect(m.beschermingen_via_kandidaat).toContain('protectionRule');
    expect(m.beschermingsregel).toBe(CASUS1_MAX_DRIVE_ON_FS_DB !== null ? 'stated' : null);
    expect(m.beschermingsregel_waarom).toMatch(/V47|zaadvergelijking/);
    if (CASUS1_MAX_DRIVE_ON_FS_DB !== null) {
      expect(m.v2_poorten_gewapend).toContain('maxDriveOnFsDb');
      /* En de eis staat met naam en waarde in `v2_poorten_bron`, net als de
       * vloer: een gewapende poortnaam zonder zijn getal laat de lezer raden
       * waar de grens lag. */
      expect(JSON.stringify(m.v2_poorten_bron)).toContain('maxDriveOnFsDb');
    }
    /* V44 — het zevende besluit, en het corrigeert een aanname die er al stond:
     * `fasemaat` (`phaseMetric`) leek de sleutel die de fasemaat stelt, en hij
     * stelt alleen de WEGING. Beide waarden ervan middelen over het
     * overlapvenster; welke PUNTEN dat venster bevat was tot V43 nergens een
     * keuze en verschilde per lezer — de tuner en het rapport lazen twee
     * verschillende verzamelingen over hetzelfde netwerk. Beide velden staan er
     * dus, en zij zijn twee verschillende besluiten. */
    expect(m.fase_toelating).toBe('measured');
    expect(m.fase_toelating_waarom).toMatch(/V44/);
    expect(m.beschermingen_via_kandidaat).toContain('phaseAdmission');
    /* V41 — het vijfde en zesde besluit, en het eerste paar dat BOVEN de tuner
     * zit. `eqBands` was ongesteld en dat is in `designThreeWay` een stille
     * nul: het veld kon geen enkele val op een gemeten breakup dragen omdat de
     * ontwerpstap er nooit een voorstelde. `leanTargetDb` was geen sleutel maar
     * een afleiding uit het stopdoel van de trapmethode, vijf keer zo ruim als
     * de eigen standaard van `synthesize`, en daardoor slaagde de kale ladder
     * altijd. Beide waarden zijn ENGINE-standaarden en geen casus-1-getallen —
     * ze worden hieronder uit hun eigen huis gelezen en niet overgetypt, want
     * dat is precies het verschil dat P6 bewaakt. */
    expect(m.eq_budget_per_tak).toBe(DEFAULT_EQ_BANDS_PER_DRIVER);
    expect(m.eq_budget_waarom).toMatch(/V38/);
    expect(m.lean_drempel_db).toBe(SYNTHESIS_LEAN_DEFAULT_DB);
    expect(m.lean_drempel_waarom).toMatch(/V41|synthesize/);
    // En de afleiding is aantoonbaar NIET het stopdoel dat de keten gebruikte.
    expect(m.lean_drempel_db).not.toBe(CASUS1_V2_SETTINGS.targets.rippleDb);
  });

  it('the candidate metrics are CLASS B, and the reference file says so', () => {
    for (const key of V2_KEYS) {
      const block = (golden.kandidaten as unknown as Record<string, Record<string, unknown>>)[key];
      expect(block, `${key} has no reference block`).toBeTruthy();
      expect(block.klasse).toBe('B');
      expect(block.afhankelijkheid).toBe('meting+netlist');
    }
  });
});

describe('the metrics on the frozen netlists reproduce', () => {
  const REF = golden.kandidaten as unknown as Record<string, Record<string, number>>;
  it.each(V2_KEYS)('%s', (key) => {
    const r = report(key);
    const ref = REF[key];
    const near = (got: number | null | undefined, want: number, tol: number, what: string) => {
      expect(got, `${key}: ${what} was not computed`).not.toBeNull();
      expect(Math.abs(got! - want), `${key}: ${what}`).toBeLessThanOrEqual(tol);
    };
    near(r.metrics.epdr?.minZOhm, ref.minZ, TOL.ohm, 'min |Z|');
    near(r.metrics.epdr?.minOhm, ref.minEPDR, TOL.ohm, 'min EPDR');
    near(
      (r.metrics.dissipation?.totalFraction ?? NaN) * 100,
      ref.dissipatie_pct,
      TOL.procentpunten,
      'dissipation',
    );
    /* V36 — de WATT in de grootste enkele weerstand, naast de fractie. Het
     * veld dat de drie v1-kandidaten sinds F1 dragen en het v2-corpus niet:
     * een ontwerp met 23 % dissipatie stond in het casusboek zonder dat ergens
     * te lezen was dat er 17,9 W in één weerstand zit. Op procent, want dat is
     * de tolerantieklasse waarin de v1-kandidaten hun watt al dragen
     * (`goldenCasus1.test.ts`, `TOL.watt_pct`). */
    const largestW = r.metrics.dissipation?.elements.find((e) => !e.parasitic)?.watts ?? null;
    expect(largestW, `${key}: geen grootste weerstand gemeten`).not.toBeNull();
    expect(ref.grootste_R_W_bij_100W, `${key}: geen watt-referentie`).toBeTypeOf('number');
    expect(
      (Math.abs(largestW! - ref.grootste_R_W_bij_100W) / ref.grootste_R_W_bij_100W) * 100,
      `${key}: watt in the largest resistor`,
    ).toBeLessThanOrEqual(TOL.watt_pct);
    near(r.system.response?.rmsDeviationDb, ref.rms_vlakheid_dB, TOL.dB, 'RMS flatness');
    near(r.system.response?.windowPlusMinusDb, ref.spl_venster_pm_dB, TOL.dB, 'SPL window');
  });
});

describe('the comparison block on casus 1', () => {
  const table = compareDesigns([
    { label: 'HUIDIG', origin: 'baseline', report: report('HUIDIG') },
    { label: 'KAND-A', origin: 'baseline', report: report('KAND_A') },
    { label: 'KAND-B', origin: 'baseline', report: report('KAND_B') },
    ...V2_KEYS.map((k) => ({
      label: k.replace(/_/g, '-'),
      origin: 'v2-candidate' as const,
      report: report(k),
    })),
  ]);

  it('holds every design, baselines first, ranked by nothing', () => {
    expect(table.rows).toHaveLength(3 + V2_KEYS.length);
    expect(table.rows.slice(0, 3).map((r) => r.origin)).toEqual(['baseline', 'baseline', 'baseline']);
    expect(table.rows.slice(3).every((r) => r.origin === 'v2-candidate')).toBe(true);
    expect(table.note).toMatch(/Nothing in this table is ranked/);
  });

  it('every cell is present with its unit, or absent with its reason', () => {
    for (const row of table.rows) {
      for (const col of table.columns) {
        const c = row.cells[col.key];
        if (c.value === null) expect(c.absentReason!.length).toBeGreaterThan(20);
        else expect(c.unit.length).toBeGreaterThan(0);
      }
    }
  });
});

/* ================================================================== *
 * The live run — one candidate, through the route the app takes
 * ================================================================== */

/**
 * `[live]` IS A SCHEDULING TAG, NOT A CATEGORY OF TEST (V43).
 *
 * The two cases below are the only ones in the whole suite that run a real
 * chain — one delivering candidate and one refused one — and at V42 they cost
 * 1427 s and 653 s. That is roughly ninety-nine per cent of the wall clock of
 * `vitest run`, and a suite nobody runs during development protects nothing.
 *
 * So `npm run test:fast` filters this tag out and everything else stays. The
 * tag changes WHEN these run, never WHETHER: `npm test` is unchanged, and the
 * project rule is that the full run is mandatory before any commit that
 * touches the search and after any change to the corpus — which is exactly
 * what these two cases check. Anything tagged here has to be a live chain run;
 * a test tagged to make it stop failing would be the thing the tag exists to
 * prevent.
 *
 * ── V46: EN DE BINNENSTE DRAAGT OOK `[bytes]` ─────────────────────────────
 *
 * Twee tags op één geval, en zij zeggen twee verschillende dingen. `[live]`
 * is PLANNING: dit kost twintig minuten, dus het draait niet tijdens het
 * werk. `[bytes]` is DRAAGWIJDTE: deze vergelijking is niet portable, want zij
 * legt een live herberekend netwerk byte-voor-byte naast een bevroren bestand
 * dat op darwin/arm64 onder Node 26 is opgewekt (`casus1_v2_herkomst.json`,
 * `opgenomen_op`, dat de generator sinds V46 zelf schrijft). Alleen de
 * Node-versie wijzigen verplaatst het resultaat al meetbaar — V46 mat
 * L1 3,005 -> 3,034 mH op dezelfde machine.
 *
 * Beide tags filteren hem uit de CI-laag, en dat is geen dubbelop maar het
 * juiste antwoord op twee vragen. Zie `ciLayer.test.ts`, die bewaakt dat geen
 * van beide tags stil groeit.
 */
describe('[live] the run still delivers the frozen netlist', () => {
  it('[bytes] one candidate, live through handleV2Request, byte for byte', () => {
    const rep = report('HUIDIG');
    const field = casus1Field(rep);
    const gridded = casus1ChainInput(manifest, files, golden);
    /* The candidate whose FILE this compares against. Picked by the label the
     * provenance block records rather than by position, so a reordering of the
     * shortlist cannot silently make this compare two different designs. */
    const target = HERKOMST.bestanden[0];
    const c = field.field.candidates.find((x) => x.label === target.label);
    expect(c, `the field no longer holds ${target.label}`).toBeTruthy();

    const input: Chain3Input = {
      grid: [...gridded.grid],
      w: gridded.w,
      m: gridded.m,
      t: gridded.t,
      driverZ: gridded.driverZ,
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      midAdjust: {},
      xoLow: c!.crossings[0].hz,
      xoHigh: c!.crossings[1].hz,
      xoLowRange: c!.crossings[0].cageHz,
      xoHighRange: c!.crossings[1].cageHz,
      label: c!.label,
      settings: {
        ...CASUS1_V2_SETTINGS,
        safety: gridded.safety,
        structureLow: { kind: c!.crossings[0].alignment.kind, order: c!.crossings[0].alignment.order },
        structureHigh: { kind: c!.crossings[1].alignment.kind, order: c!.crossings[1].alignment.order },
        xoFloorPairs: c!.crossings.map((x) => x.windowHz[0]),
      } as unknown as Chain3Input['settings'],
    };
    /* THE GATES THIS RUN ARMS MUST BE THE GATES THE GENERATOR ARMED.
     *
     * They used to be none, and that was right while casus 1 stated no limits:
     * the generator armed none either, so the two runs matched by having
     * nothing. Since the floor was stated the generator arms `M-B/|Z|`, and an
     * armed gate is not a passive observer — `gateViolation` can refuse a step
     * the search was about to take, which changes the path. Reproducing a
     * frozen netlist through "the real route" with a different set of gates is
     * reproducing a different route, and this test failed exactly that way at
     * V30 rather than quietly comparing two designs.
     *
     * Read from the same one home as everything else (P6), and checked against
     * what the provenance block recorded, so the two cannot drift. */
    /* V47 — GELEZEN UIT `CASUS1_V2_GATES` EN NIET HIER OPNIEUW GEBOUWD, en de
     * regel eronder is precies waarom. Deze regel stelde het blok zelf samen
     * uit `CASUS1_AMP_MIN_LOAD_OHM`, en dat is de V42-val een tweede keer: toen
     * V47 M-C wapende armde de generator twee poorten en dit blok één, dus deze
     * reproductie zou een ANDERE route hebben gedraaid dan de route die de
     * netlist maakte. De assert eronder ving het — en de reparatie is dezelfde
     * die `casus1V2.fixture.ts` in zijn eigen kop voorschrijft: één definitie,
     * gespreid op de gebruiksplek, zodat een ongestelde eis niets wapent (P4). */
    const armedGates = { ...CASUS1_V2_GATES };
    expect(Object.keys(armedGates).sort()).toEqual([...HERKOMST.meetopstelling.v2_poorten_gewapend].sort());
    /* V32 — AND THE MEASURED FACTS MUST BE THE FACTS THE GENERATOR SENT.
     *
     * Same argument as the gates one line up, and it became load-bearing for
     * the same reason: since V32 an electrical gate judges on the drivers' own
     * impedance sweep and refuses to judge at all without it. A reproduction
     * run that withheld the sweep would not reproduce a route with a silent
     * gate — it would run a route with NO gate. */
    const payload: V2Chain3Payload = {
      input,
      v2: {
        ...casus1V2Facts(rep, manifest, files),
        gates: armedGates,
        /* V42 — the budgets the GENERATOR arms, from the one place that
         * defines them. This said `{}` until V42 armed a budget, and the run
         * this test reproduces then differed from the run that made the
         * record — see `CASUS1_V2_BUDGETS`. */
        budgets: { ...CASUS1_V2_BUDGETS },
        determinism: { seed: CASUS1_V2_SEED },
        targetCurve: CASUS1_TARGET_CURVE,
        judgeBandHz: CASUS1_V2_BAND_HZ,
      },
      candidate: casus1V2Declaration(c!, gridded.safety),
    };
    const wire = structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload });
    let out: Chain3Result | null = null;
    let notes: string[] = [];
    handleV2Request(wire, (m: V2Response) => {
      if (m.kind === 'error') throw new Error(m.message);
      if (m.kind === 'done') {
        const d = m.data as { result: Chain3Result; notes?: string[] };
        out = d.result;
        notes = d.notes ?? [];
      }
    });
    expect(out).toBeTruthy();

    /* V34 — THE RUN SAYS WHERE THE SOURCE-RESISTANCE PROBE READ, AND AT WHICH
     * FREQUENCY.
     *
     * Free to assert on a run that is happening anyway, and it is the only
     * place the worker's own hand-off of `rSourceProbeNote` into the notes is
     * exercised end to end. It matters because the ohms are unreadable without
     * the hertz: this app disqualified on a number taken at 640.2 Hz — the top
     * of the probe's own search window — for four deliveries without a single
     * surface saying so. */
    const noteText = notes.join(' ');
    expect(noteText).toContain('The source-resistance probe read over');
    expect(noteText).toContain('safety grid');
    expect(noteText).toMatch(/probed \S+ at [\d.]+ Hz/);
    // ...and it landed BELOW the chain grid, which is the whole point of the
    // move — read off the note rather than restated.
    const at = Number(/probed \S+ at ([\d.]+) Hz/.exec(noteText)?.[1] ?? NaN);
    expect(at).toBeLessThan(CASUS1_V2_GRID[0]);

    const stored = JSON.parse(
      readFileSync(join(CASUS1_DIR, `${target.name}.adsfilter.json`), 'utf-8'),
    ) as { parts: unknown[] };
    expect(stableJson((out as unknown as Chain3Result).parts)).toBe(stableJson(stored.parts));
    // ...and the netlist is a real one, so two empty arrays cannot pass.
    expect(stored.parts.length).toBeGreaterThan(6);
  }, 900_000);

  /* ---------------------------------------------------------------- *
   * V31/V33 — the candidate a wholesale rule actually refuses
   * ---------------------------------------------------------------- */

  it('a candidate a WHOLESALE rule refuses comes back as a REFUSAL, with no network', () => {
    /* THE EXPENSIVE HALF OF V31, and it has to be this route.
     * `wholesaleRejection.test.ts` proves what the shortlist does with a
     * refusal; only a live run proves that a refusal is what the worker
     * produces, on a candidate that genuinely trips the full-band safety gate.
     * Constructing one synthetically would be constructing the answer.
     *
     * WHICH candidate comes from the provenance block — documentation, used
     * here to pick a subject rather than to assert a value. If a regeneration
     * ever leaves the field with no refusals at all, that is a finding and this
     * test says so instead of quietly passing on nothing. */
    expect(
      HERKOMST.verwerpingen.length,
      'no candidate in the frozen field was refused wholesale, so this test has no subject — ' +
        'if that is genuinely the new state, say so in the case book rather than deleting this',
    ).toBeGreaterThan(0);
    expect(HERKOMST.shortlist.leverde_geen_netwerk).toBe(HERKOMST.verwerpingen.length);

    const recorded = HERKOMST.verwerpingen[0];
    const rep = report('HUIDIG');
    const field = casus1Field(rep);
    const gridded = casus1ChainInput(manifest, files, golden);
    const c = field.field.candidates.find((x) => x.label === recorded.label);
    expect(c, `the field no longer holds ${recorded.label}`).toBeTruthy();

    const input: Chain3Input = {
      grid: [...gridded.grid],
      w: gridded.w,
      m: gridded.m,
      t: gridded.t,
      driverZ: gridded.driverZ,
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      midAdjust: {},
      xoLow: c!.crossings[0].hz,
      xoHigh: c!.crossings[1].hz,
      xoLowRange: c!.crossings[0].cageHz,
      xoHighRange: c!.crossings[1].cageHz,
      label: c!.label,
      settings: {
        ...CASUS1_V2_SETTINGS,
        safety: gridded.safety,
        structureLow: { kind: c!.crossings[0].alignment.kind, order: c!.crossings[0].alignment.order },
        structureHigh: { kind: c!.crossings[1].alignment.kind, order: c!.crossings[1].alignment.order },
        xoFloorPairs: c!.crossings.map((x) => x.windowHz[0]),
      } as unknown as Chain3Input['settings'],
    };
    const payload: V2Chain3Payload = {
      input,
      v2: {
        ...casus1V2Facts(rep, manifest, files),
        gates: { ...CASUS1_V2_GATES },
        /* V42 — see the note at the other payload in this file. This is the
         * site that FAILED: the record says this candidate was refused, and a
         * re-run without the armed budget delivered a network instead. */
        budgets: { ...CASUS1_V2_BUDGETS },
        determinism: { seed: CASUS1_V2_SEED },
        targetCurve: CASUS1_TARGET_CURVE,
        judgeBandHz: CASUS1_V2_BAND_HZ,
      },
      candidate: casus1V2Declaration(c!, gridded.safety),
    };
    interface Refused {
      result: Chain3Result;
      rejection: {
        kinds: string[];
        reason: string;
        rejectedTune: Record<string, number | null> | null;
        note: string;
      } | null;
      gates: unknown[];
      measurements: { response: unknown; phaseTracking: unknown[] };
      notes: string[];
    }
    let out: Refused | null = null;
    handleV2Request(
      structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload }),
      (m: V2Response) => {
        if (m.kind === 'error') throw new Error(m.message);
        if (m.kind === 'done') out = m.data as Refused;
      },
    );
    expect(out).toBeTruthy();
    const done = out as unknown as Refused;

    // 1. It comes back AS A REFUSAL, and the reason is the rule that refused it.
    expect(done.rejection, 'the run delivered a network where a refusal was recorded').toBeTruthy();
    expect(done.rejection!.kinds).toEqual(recorded.kinds);
    expect(done.rejection!.kinds.length).toBeGreaterThan(0);
    expect(done.rejection!.reason).toBe(recorded.reason);
    /* The reason is the tuner's own sentence about its own rule, not ours, and
     * the CATEGORY is what a caller may act on (A3g). Since V33 there are two
     * families that can throw a whole tune away — the full-band safety gate and
     * an active gate refusing the value tune — and the shortlist deliberately
     * does not distinguish them, so this asserts the vocabulary rather than one
     * member of it. A category outside the set means someone invented one. */
    const KINDS = ['crossing', 'valley', 'protection', 'load', 'gate'];
    for (const k of done.rejection!.kinds) {
      expect(KINDS, `unknown refusal category "${k}"`).toContain(k);
    }
    expect(done.rejection!.reason.length).toBeGreaterThan(20);

    // 2. ITS SEED IS IN NO OUTPUT AS A NETWORK. Not in `parts`, not anywhere
    //    under `net` — a serialisation of the whole result may contain no part
    //    list at all.
    expect(done.result.parts).toEqual([]);
    // `net.parts` is the SECOND copy of the same list — the chain hands its own
    // up while the tuner keeps the one it built. The first run of this test
    // found the seed alive there, which is why the assertion below serialises
    // the whole result instead of checking the field one expects.
    expect(done.result.net.parts).toEqual([]);
    expect((done.result.net as { rejectedParts?: unknown }).rejectedParts).toBeUndefined();
    const everything = JSON.stringify(done);
    for (const marker of ['"partId"', '"wires"', '"Capacitor"', '"Inductor"']) {
      expect(everything, `a part list survived: ${marker}`).not.toContain(marker);
    }
    // ...and nothing was measured under this candidate's label either: the
    // numbers would have been the seed's.
    expect(done.measurements.response).toBeNull();
    expect(done.measurements.phaseTracking).toEqual([]);
    expect(done.gates).toEqual([]);

    // 3. What WAS refused is reported, so the cost of the veto is visible.
    const t = done.rejection!.rejectedTune;
    expect(t, 'the refused tune was not measured').toBeTruthy();
    expect(t!.minZOhm).toBeCloseTo(recorded.rejectedTune!.minZOhm as number, 6);
    expect(t!.windowPlusMinusDb).toBeCloseTo(
      recorded.rejectedTune!.windowPlusMinusDb as number,
      6,
    );
    // The note says why nothing is delivered, in the F0 terms this rests on.
    expect(done.rejection!.note).toContain('delivers no network');
    expect(done.notes.join(' ')).toContain('Refusing rule:');
  }, 900_000);
});

/* ================================================================== *
 * V43 — de tag die het tweelagenbeleid draagt, bewaakt
 * ================================================================== */

/* The block's own title must NOT carry the tag — `test:fast` filters on the
 * test NAME, so a guard called after the thing it guards filters itself out
 * and stops guarding. Found the hard way, in the run that added it. */
describe('the live-run tag is a schedule, not a hiding place', () => {
  /* `npm run test:fast` filters `[live]` out so that development has a suite
   * that finishes in minutes instead of in forty. That is only defensible as
   * long as the tag stays on the two cases it was measured for. This scan is
   * what stops it from spreading: a third tagged case has to be a deliberate
   * act with this list edited, and the edit is where someone asks whether the
   * case really is a live chain run. */
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

  /** Every `describe`/`it` title in `src/` that carries the tag. */
  const tagged = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(full)) continue;
        for (const line of readFileSync(full, 'utf-8').split('\n')) {
          const m = /^\s*(?:describe|it)(?:\.\w+)?\(\s*['"`](\[live\][^'"`]*)/.exec(line);
          if (m) out.push(m[1]);
        }
      }
    };
    walk(SRC);
    return out.sort();
  };

  it('exactly one block carries it, and it is the live chain run', () => {
    expect(tagged()).toEqual(['[live] the run still delivers the frozen netlist']);
  });

  it('and the walker really walks — a scan that finds nothing is always green', () => {
    /* The counter-proof every scan in this project carries: without it, a
     * broken walker and an empty tag set are the same result. */
    let files = 0;
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(full)) files++;
      }
    };
    walk(SRC);
    expect(files).toBeGreaterThan(100);
  });
});
