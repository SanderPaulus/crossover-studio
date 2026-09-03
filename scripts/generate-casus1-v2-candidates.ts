/**
 * F4d — HOW THE `KAND-V2-*` FIXTURES WERE MADE.
 *
 * Run with `npx vite-node scripts/generate-casus1-v2-candidates.ts`.
 *
 * WHY A SCRIPT AND NOT A TEST. F4a established that casus 1 has no class-C
 * references — every candidate reference in `golden_refs_casus1.json` is a
 * metric on a NETLIST FILE, never on the outcome of a search — and V19 says
 * why: v2 begins to generate its own candidates at F4d, and a reference that
 * pins a property of the v1 search goes red the moment it does. The obvious
 * shortcut, "let the golden suite run the scan and assert on what comes out",
 * would create exactly the class-C references F4a spent a session removing.
 *
 * So the v2 candidates are frozen the same way the v1 ones are: run once, by
 * hand, written to disk as `.adsfilter.json`, and referenced from
 * `manifest_en_geometrie.netlists`. Their metrics are then class B — functions
 * of the measurement set and a netlist file, reproducible by anyone with the
 * repository, with nothing about a search in them.
 *
 * WHAT IS DOCUMENTATION AND WHAT IS ACCEPTANCE. The `v2_herkomst` block this
 * writes — commit, seed, run fingerprint, the generator's parameters and every
 * candidate's provenance — is DOCUMENTATION. It says where these netlists came
 * from so a later reader can regenerate them. It is not an acceptance value and
 * nothing asserts on it. What IS acceptance is that the frozen netlists
 * reproduce their metrics (the golden suite) and that a live run through the
 * worker route still delivers them byte for byte (`casus1V2Candidates.test.ts`).
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawn } from 'node:child_process';
import { cpus } from 'node:os';
import {
  CASUS1_WOOFER_DC_OHM,
  CASUS1_DIR,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { describeTargetCurve } from '../src/lib/engine2/requirements/targetCurve.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { candidateFieldKey } from '../src/lib/engine2/predesign/candidateField.ts';
import { greyValues } from '../src/lib/engine2/optimizer/choices.ts';
import { stableJson, stampRun } from '../src/lib/engine2/optimizer/determinism.ts';
import { gateSettingsKey } from '../src/lib/engine2/optimizer/gates.ts';
import { budgetSettingsKey } from '../src/lib/engine2/optimizer/bounds.ts';
import { measurementFactsKey } from '../src/lib/engine2/optimizer/measurementFacts.ts';
import { buildShortlist, type ShortlistInput } from '../src/lib/engine2/optimizer/shortlist.ts';
import { handleV2Request, type V2Chain3Payload, type V2LevelWorkColumn, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import type { Chain3Input, Chain3Result } from '../src/lib/threeWayChain.ts';
import type { GriddedResponse } from '../src/lib/dsp.ts';
import { serializeFilter } from '../src/lib/filterFile.ts';
import {
  CASUS1_AMP_MIN_LOAD_OHM,
  CASUS1_LF_RESONANT_BUDGET_DB,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_GRID,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
  CASUS1_BUILDABILITY,
  CASUS1_BUILDABILITY_ON_SEARCH,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_MAX_DRIVE_ON_FS_DB,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_QES_MULTIPLIER_MAX,
  CASUS1_TARGET_CURVE,
  CASUS1_LOWEST_WAY_LEVEL_WORK_FORBIDDEN,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_THERMAL_DESIGN_POWER_W,
  CASUS1_WIRING,
} from '../src/lib/engine2/casus1V2.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_MANIFEST = join(HERE, '..', 'test-fixtures', 'casus1_v2_herkomst.json');

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const report = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: {
    /* V50 — the continuous power from its one home (the literal 100 is gone),
     * the per-way M-C figure, and the buildability inputs the report judges
     * with whatever the search arms. */
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
      ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
      : {}),
    ...CASUS1_BUILDABILITY,
    /* V51 — the wiring per way and the level-work requirement, for the report's
     * own block; the requirement reaches the SEARCH through the candidate's
     * chain declaration and not through here. */
    ...CASUS1_LEVEL_WORK_SETTINGS,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: CASUS1_TARGET_CURVE,
    /* V49 — the excursion inputs. The report derives a ceiling per driver from
     * them and `casus1V2Facts` carries it to the worker as a measured fact, so
     * every candidate is judged on the STRICTER of that ceiling and the stated
     * figure. Left out, the run would judge on the stated figure alone — a
     * different route than the app's. */
    ...CASUS1_EXCURSION,
  },
});

/* V32 — THE MEASURED FACTS NOW CROSS THE BORDER, as they do in the app.
 *
 * This script used to send an empty `v2` fact payload, and until V32 that was
 * invisible: the worker fell back, said so in notes nobody read, and every gate
 * judged on the chain's 200 Hz grid anyway. Since V32 the electrical gates
 * judge on the drivers' own measured sweeps and refuse to judge at all without
 * them, so an empty payload would answer V32 by switching `M-B/|Z|` off.
 * `casus1V2Facts` is `App.tsx`'s own bridge — see the note there. */
const facts = casus1V2Facts(report, manifest, files);

const field = casus1Field(report);
console.log(
  `field: ${field.field.candidates.length} candidates ` +
    `(derived ${field.field.parameters.derivedSize})`,
);
for (const a of field.field.axes) {
  console.log(`  ${a.pairLabel}: orders ${a.orders.join(',')} at ${a.positionsByOrder.map((p) => p.hz.join('/')).join(' | ')} Hz`);
}

const gridded: {
  grid: readonly number[];
  w: GriddedResponse;
  m: GriddedResponse;
  t: GriddedResponse;
  driverZ: Record<string, import('../src/lib/complex.ts').Complex[]>;
  safety: ReturnType<typeof casus1ChainInput>['safety'];
} = casus1ChainInput(manifest, files, golden);

/** What the worker hands back on `done` — one name, so the collector below and
 *  every read off it describe the same shape. */
type DoneData = {
  result: Chain3Result;
  measurements: ShortlistInput<Chain3Result>['measurements'];
  topology: ShortlistInput<Chain3Result>['topology'];
  gates: ShortlistInput<Chain3Result>['gates'];
  rejection: ShortlistInput<Chain3Result>['rejection'];
  /** V51 — the level-work column: requirement, X, delivered inventory, plateau. */
  levelWork: V2LevelWorkColumn;
  notes: string[];
};

const rows: ShortlistInput<Chain3Result>[] = [];
const perCandidate: Record<string, unknown> = {};
/**
 * The last payload built, kept so the recorded measurement setup is READ OFF
 * the run rather than restated from memory.
 *
 * V27 recorded two wrong setups before the definitive one — protections
 * unarmed (`min |Z|` 0.00 Ω) and `synthMode: 'filter'` where the app runs
 * `'acoustic'` — and neither was visible in what the manifest wrote down. A
 * setup nobody can read back off the artefact is a setup that gets remembered
 * wrong; so the block below is derived, and if the payload changes shape the
 * record changes with it instead of quietly staying true-sounding.
 */
let lastPayload: V2Chain3Payload | null = null;
/** Per candidate: what it delivered and what every gate said about it. */
const outcomes: {
  label: string;
  rimpel_dB: number;
  fase_graden: number;
  poorten: { poort: string; onderwerp: string; gewapend: boolean; geslaagd: boolean; waarde: number | null; grens: number | null }[];
  geweigerd_door: string[];
  door_de_ketenzelf_gediskwalificeerd: string[];
  /* WHY THIS CANDIDATE SHIPPED WHAT IT SHIPPED (V30).
   *
   * Added because a run whose tune is thrown away wholesale — by the
   * full-band safety gate, or by the v2 gate hook — returns its SEED, and
   * from the delivered metrics alone that is indistinguishable from a tune
   * that simply landed there. The tell is structural: `ampFloorRepair` is set
   * on every completed pass and absent on the early return. Recording it was
   * what turned "the barrier changed nothing" into "the barrier's result was
   * rejected downstream", which are different findings. */
  pas: {
    /** Het AANTAL componentwaarden dat vrij was om te bewegen — een telling,
     *  geen vlag. Stond hier tot V37 als `boolean | null`, en de cast die hem
     *  vulde was even fout; `scripts/` viel toen buiten `tsc -b`. */
    tuned: number;
    evaluaties: number;
    safetyNote: string | null;
    safetyKinds: string[] | null;
    ampFloorNote: string | null;
    ampFloorRepair: string | null;
    vroege_terugkeer: boolean;
    /* V33 — waar de barrière zijn tekort las, in de woorden van de tuner
     * zelf. Een run die niet zegt op welke band hij mikte, is een run
     * waarvan je de uitkomst niet kunt lezen: dat is precies wat V32 en V33
     * allebei waren. */
    vloerbron: string | null;
  };
  /** V42 — wat de A5d.6-inversie over de seriespoel van deze weg zei, in de
   *  woorden van de run zelf. `null` = geen enkele notitie over de LF-lift,
   *  wat betekent dat er een plafond was en dat het niets bijzonders te melden
   *  had; een notitie erin betekent dat er GEEN grens kwam, of dat er iets aan
   *  de verdeling over meerdere spoelen uit te leggen viel. */
  lf_bult_plafond: string[] | null;
  /* V31 — een kandidaat die niets geleverd heeft, en de regel die hem
   * weigerde. `null` = hij leverde wél een netwerk. De cijfers eronder gaan
   * over de tune die geweigerd IS en die niemand gaat bouwen. */
  verwerping: {
    regels: string[];
    reden: string;
    geweigerde_tune: Record<string, number | null> | null;
  } | null;
  /* V51 — het NIVEAUWERK op de laagste weg: de eis waaronder deze kandidaat
   * liep, hoeveel de configuratie VRAAGT (X, de A5d.4-gap tot het anker met
   * het plateau erin), en wat het geleverde — of geweigerde — netwerk daar
   * werkelijk draagt. X is het getal van de sessie, ook op een verwerping. */
  niveauwerk: {
    eis: 'none' | 'allowed' | null;
    laagste_weg: string | null;
    anker: string | null;
    gevraagd_X_dB: number | null;
    geleverd_serie_R: { id: string; ohm: number }[] | null;
    geleverd_shunt_pad: { id: string; ohm: number }[] | null;
    geleverd_geen: boolean | null;
    plateau_beoordeeld: boolean;
    plateau_toelichting: string;
  };
}[] = [];
/* ------------------------------------------------------------------ *
 * V47 — DE VIJFTIEN KETENRUNS OVER DE CORES, IN PLAATS VAN ACHTER ELKAAR
 * ------------------------------------------------------------------ *
 *
 * WAAROM. Tot V47 draaide deze lus sequentieel op ÉÉN kern, en de prijs stond
 * in CLAUDE.md: 4 u 23 bij V41, 4 u 52 bij V43, 5 u 56 bij V45. Op een machine
 * met achttien kernen is dat geen rekentijd maar wachttijd — zeventien kernen
 * stonden stil. De wandkloktijd wordt hiermee de duurste ENKELE kandidaat in
 * plaats van hun som.
 *
 * WAAROM HET MAG. Elke kandidaat is een eigen `handleV2Request` met een eigen
 * seed, en er is geen enkele module-scope mutable state in `netOptimizer.ts` of
 * in `engine2/` — nagegaan en niet aangenomen. Twee kandidaten kunnen elkaars
 * uitkomst dus niet zien, en dat is precies waarom sequentieel en parallel
 * hetzelfde veld moeten opleveren. A5e.4 blijft gelden zoals V46 hem
 * preciseerde: byte-identiek per (machine, runtime), en een kind draait op
 * dezelfde machine en dezelfde runtime als zijn ouder.
 *
 * HOE. Het script roept ZICHZELF aan met `V2_ONLY=<n>`, één proces per
 * kandidaat, met hoogstens `V2_JOBS` tegelijk (default: kernen − 4, zodat de
 * machine bruikbaar blijft). Het kind schrijft zijn eigen shard-bestand en het
 * ouderproces voegt ze samen in KANDIDAATVOLGORDE — nooit in de volgorde
 * waarin zij klaar kwamen, want dan zou de shortlist van de planning afhangen.
 *
 * `V2_SEQUENTIAL=1` DRAAIT DE OUDE WEG, in één proces en in kandidaatvolgorde.
 * Hij is er niet voor de nostalgie: hij is de ARM waartegen een parallelle run
 * afgezet kan worden, en zonder hem zou "parallel levert hetzelfde veld" een
 * bewering zijn in plaats van een meting.
 */
const SHARD_DIR = join(HERE, '..', 'test-fixtures', '.casus1-v2-shards');
const ONLY = process.env.V2_ONLY ? Number(process.env.V2_ONLY) : null;
/**
 * Hoeveel kandidaten tegelijk. ALLE KERNEN, en dat is een gestelde keuze en
 * geen ondergrens: elke kandidaat is één rekenkern lang bezig en er zijn er
 * vijftien, dus op een machine met achttien kernen draait het hele veld in één
 * golf en is de wandkloktijd de duurste ENKELE kandidaat. `V2_JOBS` overschrijft
 * hem — `V2_JOBS=1` geeft de sequentiële volgorde zonder het sequentiële pad.
 */
const JOBS = Math.max(1, Number(process.env.V2_JOBS ?? cpus().length));
const SELF = fileURLToPath(import.meta.url);

/** Wat één kandidaat oplevert, in de vorm waarin hij een shard-bestand wordt. */
interface Shard {
  label: string;
  row: {
    label: string;
    parts: unknown;
    /* CARRIED, NEVER READ. `buildShortlist` draagt `result` ongelezen door en
     * niets stroomafwaarts leest hem; wat wél gelezen wordt is `parts`, en dat
     * is een vlakke lijst die een JSON-rondgang zonder verlies overleeft. */
    result: unknown;
    topology: unknown;
    measurements: unknown;
    gates: unknown;
    disqualified: unknown;
    rejection: unknown;
  };
  outcome: unknown;
  seconds: number;
}

/** De payload van één kandidaat — gescheiden van het DRAAIEN ervan, omdat de
 *  vingerafdruk hem nodig heeft zonder dat er een run bij hoort. */
function payloadFor(c: (typeof field.field.candidates)[number]): V2Chain3Payload {
  const input: Chain3Input = {
    grid: [...gridded.grid],
    w: gridded.w,
    m: gridded.m,
    t: gridded.t,
    driverZ: gridded.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: c.crossings[0].hz,
    xoHigh: c.crossings[1].hz,
    xoLowRange: c.crossings[0].cageHz,
    xoHighRange: c.crossings[1].cageHz,
    label: c.label,
    settings: {
      ...CASUS1_V2_SETTINGS,
      safety: gridded.safety,
      structureLow: { kind: c.crossings[0].alignment.kind, order: c.crossings[0].alignment.order },
      structureHigh: { kind: c.crossings[1].alignment.kind, order: c.crossings[1].alignment.order },
      xoFloorPairs: c.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  const payload: V2Chain3Payload = {
    input,
    v2: {
      ...facts,
      /* THE GATE SIDE OF THE SAME PATH THE APP TAKES.
       *
       * `App.tsx` fills `v2ScanSettings.gates.ampMinLoadOhm` from the A5a field
       * and `settings.ampMinLoadOhm` from the same state, and this fixture does
       * both for the same reason: one arms the repair pass, the other arms the
       * verdict. Spread rather than assigned, so an unstated floor arms nothing
       * — which is what casus 1 looked like before the floor was stated, and
       * what any other casus without one still looks like. */
      gates: { ...CASUS1_V2_GATES },
      /* V42 — THE ONE BUDGET THIS CASUS STATES.
       *
       * Same path as the floor above and the same P4 rule: spread, so an
       * unstated budget arms no inversion at all. The difference is what it
       * arms — not a gate but the `bump-series-l` inversion, which turns the
       * stated decibels into a ceiling on the lowest way's series inductance.
       * M-D has no gate id (A4 lists it under the reporting metrics), so this
       * bounds the SEARCH and condemns no delivered network. */
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: CASUS1_V2_BAND_HZ,
      /* V50 — the continuous power on the wire: the shortlist's watt column
       * (V36) and, when the resistor class is armed on the search, the power
       * M-A/part judges at. */
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    },
    candidate: casus1V2Declaration(c, gridded.safety),
  };
  return payload;
}

/** Eén kandidaat draaien — dezelfde code voor de sequentiële en de shard-weg. */
function runCandidate(c: (typeof field.field.candidates)[number], n: number): Shard {
  const payload = payloadFor(c);
  lastPayload = payload;
  const t0 = Date.now();
  const wire = structuredClone({ id: n, kind: 'v2Chain3One' as const, payload });
  /* THE CALLBACK'S RESULT, COLLECTED IN AN ARRAY AND NOT IN A `let`.
   *
   * V37 — the shape a `let` needs here is one TypeScript cannot follow: it
   * narrows the variable to `null` at its declaration and never widens it
   * again for an assignment made inside a callback, so the guard below narrows
   * it to `never` and every field read off it was an error the build did not
   * see (`scripts/` was outside `tsc -b` until V37). An array is assigned
   * through a method the compiler does understand. */
  const collected: DoneData[] = [];
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data as DoneData);
  });
  const done = collected[0];
  if (!done) throw new Error(`candidate ${c.label} produced nothing`);
  /* WHAT EACH CANDIDATE DID, gate verdicts included.
   *
   * Recorded for every candidate and not only for the survivors, because the
   * question a reader of a shortlist actually has is about the ones that are
   * NOT there. Before the floor was stated this block would have been dull —
   * every gate absent, nothing refused. With a gate armed it is the difference
   * between "the field was ten" and "the field was fifteen and five were
   * refused, by this gate, at these ohms". */
  const armed = done.gates.filter((v) => v.active);
  const failed = armed.filter((v) => !v.pass);
  const outcome = {
    label: c.label,
    rimpel_dB: Number(done.result.net.after.rippleDb.toFixed(2)),
    fase_graden: Number(done.result.net.after.phaseDeg.toFixed(1)),
    poorten: done.gates.map((v) => ({
      poort: v.gate,
      onderwerp: v.subject,
      gewapend: v.active,
      geslaagd: v.pass,
      waarde: v.value === null ? null : Number(v.value.toFixed(3)),
      grens: v.limit,
    })),
    geweigerd_door: failed.map((v) => `${v.gate} (${v.subject})`),
    door_de_ketenzelf_gediskwalificeerd: [...(done.result.disqualified ?? [])],
    /* READ OFF THE RESULT TYPE, NOT THROUGH A CAST. V37 — `tuned` was cast to
     * `boolean` here and it is a COUNT of the values that were free to move;
     * the recorded field said `true`/`false` about a number. `scripts/` was
     * outside `tsc -b` until V37, so the compiler never saw it. */
    pas: {
      tuned: done.result.net.tuned,
      evaluaties: done.result.net.evaluations,
      safetyNote: done.result.net.safetyNote ?? null,
      safetyKinds: done.result.net.safetyKinds ?? null,
      ampFloorNote: done.result.net.ampFloorNote ?? null,
      ampFloorRepair: done.result.net.ampFloorRepair ?? null,
      vroege_terugkeer: !('ampFloorRepair' in (done.result.net as object)),
      vloerbron: done.result.net.zFloorSourceNote ?? null,
    },
    /* ---- V42: KREEG DEZE KANDIDAAT WERKELIJK EEN PLAFOND? ----------------
     *
     * De notities van de run stonden tot V42 in `DoneData` en werden nergens
     * opgeschreven — een kanaal zonder lezer, en precies op de claim waar deze
     * sessie over gaat. Een gesteld budget dat op een gegeven zaad GEEN grens
     * oplevert is namelijk geen theoretisch geval: `maxSeriesInductanceFromBump`
     * geeft `null` zodra het budget al zonder spoel overschreden wordt, en dat
     * gebeurt bij deze drivers boven ongeveer 2 Ω padweerstand (V12, hier
     * nagemeten: 2,86 mH bij 0 Ω, 2,43 bij 0,5, 1,81 bij 1,0, geen grens bij
     * 2,0). Zonder deze regel is "het budget is gewapend" niet te onderscheiden
     * van "het budget deed niets", en dat verschil is de hele oplevering. */
    lf_bult_plafond: (() => {
      const applied = done.notes.filter((n) => /LF-lift/i.test(n));
      return applied.length > 0 ? applied : null;
    })(),
    verwerping: done.rejection
      ? {
          regels: [...done.rejection.kinds],
          reden: done.rejection.reason,
          /* V47 — `driveOnFsDb` staat hierin: M-C van het GEWEIGERDE netwerk,
           * gemeten door de worker vóórdat hij de onderdelen wist. Zonder die
           * kolom is niet te zien of een weigering een ontwerp heeft gekost dat
           * de gestelde eis wél haalde. */
          geweigerde_tune: (done.rejection.rejectedTune ?? null) as Record<
            string,
            number | null
          > | null,
        }
      : null,
    niveauwerk: {
      eis: done.levelWork.requirement,
      laagste_weg: done.levelWork.lowestWay,
      anker: done.levelWork.anchor,
      gevraagd_X_dB: done.levelWork.askedDb === null ? null : Number(done.levelWork.askedDb.toFixed(3)),
      geleverd_serie_R: done.levelWork.delivered?.seriesResistors.map((r) => ({ id: r.id, ohm: Number(r.ohm.toFixed(3)) })) ?? null,
      geleverd_shunt_pad: done.levelWork.delivered?.shuntPads.map((r) => ({ id: r.id, ohm: Number(r.ohm.toFixed(3)) })) ?? null,
      geleverd_geen: done.levelWork.delivered?.none ?? null,
      plateau_beoordeeld: done.levelWork.plateau.judged,
      plateau_toelichting: done.levelWork.plateau.note,
    },
  };
  console.log(
    `  [${n}/${field.field.candidates.length}] ${c.label} → ` +
      (done.rejection
        ? `NO NETWORK — refused by ${done.rejection.kinds.join(', ') || 'a wholesale gate'}; the ` +
          `refused tune was at ${done.rejection.rejectedTune?.minZOhm?.toFixed(2) ?? '—'} Ω / ` +
          `±${done.rejection.rejectedTune?.windowPlusMinusDb?.toFixed(2) ?? '—'} dB`
        : `${done.result.net.after.rippleDb.toFixed(2)} dB / ${done.result.net.after.phaseDeg.toFixed(1)}°` +
          `  min|Z| ${(done.gates.find((v) => v.gate === 'M-B/|Z|')?.value ?? NaN).toFixed(2)} Ω` +
          `  ${failed.length ? `REFUSED by ${failed.map((v) => v.gate).join(', ')}` : 'gates ok'}`) +
      `  (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  return {
    label: c.label,
    row: {
      label: c.label,
      parts: done.result.parts,
      result: done.result,
      topology: done.topology,
      measurements: done.measurements,
      gates: done.gates,
      disqualified: done.result.disqualified,
      rejection: done.rejection,
    },
    outcome,
    seconds: (Date.now() - t0) / 1000,
  };
}

/* ---- child mode: één kandidaat, één shard-bestand, klaar ---------------- */
if (ONLY !== null) {
  const c = field.field.candidates[ONLY - 1];
  if (!c) throw new Error(`V2_ONLY=${ONLY} is buiten het veld van ${field.field.candidates.length}`);
  mkdirSync(SHARD_DIR, { recursive: true });
  writeFileSync(
    join(SHARD_DIR, `cand-${String(ONLY).padStart(3, '0')}.json`),
    JSON.stringify(runCandidate(c, ONLY)),
    'utf-8',
  );
  process.exit(0);
}

/* ---- de oude weg, als arm om tegen af te zetten ------------------------- */
if (process.env.V2_SEQUENTIAL === '1') {
  console.log(`sequentieel: ${field.field.candidates.length} kandidaten in één proces`);
  let i = 0;
  for (const c of field.field.candidates) {
    const shard = runCandidate(c, ++i);
    rows.push(shard.row as unknown as ShortlistInput<Chain3Result>);
    outcomes.push(shard.outcome as (typeof outcomes)[number]);
    perCandidate[c.label] = { provenance: c.provenance, crossings: c.crossings };
  }
} else {
/* ---- parent mode: de kandidaten over de kernen, dan samenvoegen --------- */
  const count = field.field.candidates.length;
  console.log(`parallel: ${count} kandidaten, ${JOBS} tegelijk op ${cpus().length} kernen`);
  rmSync(SHARD_DIR, { recursive: true, force: true });
  mkdirSync(SHARD_DIR, { recursive: true });
  const t0 = Date.now();
  let next = 0;
  let finished = 0;
  await new Promise<void>((resolve, reject) => {
    const start = () => {
      if (next >= count) {
        if (finished === count) resolve();
        return;
      }
      const n = ++next;
      const child = spawn('npx', ['vite-node', SELF], {
        cwd: join(HERE, '..'),
        env: { ...process.env, V2_ONLY: String(n), V2_JOBS: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      child.stdout.on('data', (b: Buffer) => (out += b.toString()));
      child.stderr.on('data', (b: Buffer) => (out += b.toString()));
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`kandidaat ${n} faalde (exit ${code}):\n${out}`));
          return;
        }
        finished++;
        /* Alleen de eigen samenvattingsregel van het kind, want de rest van
         * zijn uitvoer is de veldkop die élk kind opnieuw afdrukt. */
        for (const line of out.split('\n')) if (line.startsWith('  [')) console.log(line);
        start();
      });
    };
    for (let i = 0; i < Math.min(JOBS, count); i++) start();
  });
  console.log(`alle ${count} kandidaten klaar in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  /* SAMENVOEGEN IN KANDIDAATVOLGORDE en nooit in de volgorde waarin zij klaar
   * kwamen: de shortlist kiest op spreiding, en een veld waarvan de volgorde
   * van de planning afhangt zou per run een andere shortlist geven. */
  for (let n = 1; n <= count; n++) {
    const shard = JSON.parse(
      readFileSync(join(SHARD_DIR, `cand-${String(n).padStart(3, '0')}.json`), 'utf-8'),
    ) as Shard;
    rows.push(shard.row as unknown as ShortlistInput<Chain3Result>);
    outcomes.push(shard.outcome as (typeof outcomes)[number]);
    const c = field.field.candidates[n - 1];
    perCandidate[c.label] = { provenance: c.provenance, crossings: c.crossings };
  }
  /* De vingerafdruk leest de LAATSTE payload, en die is voor élke kandidaat
   * gelijk op de kandidaatverklaring na. Hij wordt hier gebouwd zonder te
   * draaien — payloadbouw is gratis, en de alternatieven (hem uit een shard
   * terugserialiseren, of de laatste kandidaat nog eens draaien) zijn allebei
   * duurder en minder eerlijk. */
  lastPayload = payloadFor(field.field.candidates[count - 1]);
}

/* ---- the run stamp, built exactly as `optimClient.ts` builds it ---------- */
const lastPayloadForStamp = lastPayload;
const v2Facts = facts;
const stamp = stampRun(
  {
    determinism: { seed: CASUS1_V2_SEED, seedSource: 'project', budgetEvaluations: null, budgetSource: "the tuner's own policy", starts: 1, startsSource: 'default' },
    design: stableJson({ variants: field.field.candidates.map((c) => [c.label, c.crossings[0].hz, c.crossings[1].hz]) }),
    measurements: stableJson({ grid: [CASUS1_V2_GRID[0], CASUS1_V2_GRID[CASUS1_V2_GRID.length - 1], CASUS1_V2_GRID.length] }),
    /* V32 — the ARMED gates, read off the payload. This said `{}` until V32
     * while the run armed the stated floor: a fingerprint that records "no
     * gate" for a gated run is the A5e.4 promise broken quietly. */
    gates: stableJson(gateSettingsKey(lastPayload?.v2.gates ?? {})),
    bounds: stableJson(budgetSettingsKey({})),
    tuning: stableJson(CASUS1_V2_SETTINGS),
    facts: stableJson(measurementFactsKey(v2Facts)),
    /* THE FIELD, AND THE GREY VALUES THE FIELD'S CHOICES SWITCH ON (V30).
     *
     * `candidateFieldKey` covers what was searched. It does not cover a number
     * that lives inside `netOptimizer.ts`, was tuned there for a different
     * purpose, and becomes load-bearing the moment a candidate arms the choice
     * that reads it — `AMP_FLOOR_BARRIER_WEIGHT`, once `zFloorBarrier` is
     * stated. Read off the last payload's declaration rather than restated,
     * and identical for every candidate in this field, so the ingredient is
     * stable across candidate order. */
    choices: stableJson({
      veld: candidateFieldKey(field.field),
      grijze_waarden: greyValues(lastPayloadForStamp?.candidate?.declaration.stated),
    }),
  },
  'completed',
);

const shortlist = buildShortlist(rows, stamp.fingerprint, { targetCurve: CASUS1_TARGET_CURVE });
console.log(`shortlist: ${shortlist.rows.length} of ${shortlist.consideredCount} considered`);

const written: { name: string; label: string }[] = [];
shortlist.rows.forEach((row, i) => {
  const name = `KAND-V2-${i + 1}`;
  const file = `${name}.adsfilter.json`;
  writeFileSync(
    join(CASUS1_DIR, file),
    serializeFilter({ name, parts: [...row.parts] }),
    'utf-8',
  );
  written.push({ name, label: row.label });
  console.log(`  wrote ${file}  ← ${row.label}`);
});

const commit = execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim();

/* ---- the measurement setup, read off the run (F4d-nazorg, controle 2) ---- *
 *
 * Every field here answers a question V27's two failed setups made concrete:
 * WHICH synthesis, WHICH gates, WHICH budgets, WHICH protections. Absent is
 * written as absent with its reason, never omitted — an omitted key reads as
 * an oversight and P4 says absence is a state. */
if (!lastPayload) throw new Error('no payload was built, so no setup can be recorded');
const declaredStated = Object.keys(lastPayload.candidate?.declaration.stated ?? {}).sort();
const meetopstelling = {
  _:
    'De opstelling waarmee deze netlists zijn opgewekt, afgelezen van de laatste payload en niet ' +
    'overgeschreven uit het geheugen. V27 noteert twee foute opstellingen vóór de definitieve; ' +
    'geen van beide was terug te lezen uit wat het manifest opschreef.',
  synthMode: CASUS1_V2_SETTINGS.synthMode,
  synthMode_waarom:
    "de eigen standaard van de app. Op 'filter' leverde dezelfde keten 31,4 dB rimpel tegen " +
    "5,2 dB op 'acoustic' (V27); een fixture die niet de synthese van de app draait, meet de app niet.",
  v2_poorten_gewapend: Object.keys(lastPayload.v2.gates ?? {}).sort(),
  v2_poorten_bron: {
    ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
      ? {
          'M-C': {
            sleutel: 'maxDriveOnFsDbByDriver',
            bron: 'gesteld, PER WEG (V50)',
            waarde_dB_per_weg: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER },
            waarde_dB: CASUS1_MAX_DRIVE_ON_FS_DB,
            waar:
              'manifest_en_geometrie.gestelde_eisen.drive_op_fs_max_dB_per_weg (V50) — de tweeter ' +
              'draagt de −20-conventie van tweeter_drive_op_fs_max_dB, de mid draagt GEEN gesteld ' +
              'getal en wordt op de afgeleide excursiegrens alleen geoordeeld. Het reist langs het ' +
              'A5a-pad van de app: v2.gates.maxDriveOnFsDbByDriver voor het oordeel, en de gestelde ' +
              'grens laat de kandidaat `protectionRule: stated` verklaren, waarmee de zaadvergelijking ' +
              'van de volle-band-veiligheidspoort vervalt (V47).',
            regel:
              'driveVoltageOnResonance (src/lib/engine2/metrics/electrical.ts) op de gemeten ' +
              'sweep (V32), per hoogdoorlaatbeschermde weg, met de doorlaatband uit de eigen ' +
              'kruispunten (F1-conventie).',
            /* V49 — de tweede helft van dezelfde poort: het excursie-afgeleide
             * plafond per driver, als ACHTSTE feit op de wire, en de STRENGSTE van
             * beide oordeelt. Afgelezen van de payload, niet overgeschreven. */
            excursie_plafond_re_ingang_dB: facts.driveCeilingDbByModel ?? null,
            excursie_regel:
              'M-C v2.0 (V49): plafond = 20·log10(V_toegestaan/V_piek) per driver uit ' +
              'driverkaart + versterkerpiek + gemeten sweep (metrics/driveExcursion.ts); de ' +
              'poort leest per weg de STRENGSTE van dit plafond (passband-relatief gemaakt) en ' +
              'het gestelde dB-getal (effectiveDriveLimit).',
          },
        }
      : {}),
    ...(CASUS1_BUILDABILITY_ON_SEARCH && CASUS1_BUILDABILITY.resistorClassW !== undefined
      ? {
          'M-A/part': {
            sleutel: 'resistorClassW × resistorPowerMargin bij resistorThermalPowerW',
            bron: 'gesteld (V50), gewapend op de zoektocht sinds V51',
            klasse_W: CASUS1_BUILDABILITY.resistorClassW,
            marge: CASUS1_BUILDABILITY.resistorPowerMargin ?? null,
            toegestaan_W:
              CASUS1_BUILDABILITY.resistorPowerMargin !== undefined
                ? CASUS1_BUILDABILITY.resistorClassW * CASUS1_BUILDABILITY.resistorPowerMargin
                : null,
            oordeelt_bij_W: CASUS1_THERMAL_DESIGN_POWER_W ?? CASUS1_CONTINUOUS_POWER_W,
            waar:
              'manifest_en_geometrie.gestelde_eisen.weerstandsklasse_W, .weerstandsmarge, ' +
              '.thermisch_ontwerpvermogen_W (V51: het gemiddelde luistervermogen waarbij de watt per ' +
              'weerstand geoordeeld wordt; het continue vermogen blijft de wattkolom) en ' +
              '.bouwbaarheid_op_de_zoektocht.gewapend.',
            regel:
              'resistorLoads (metrics/buildability.ts) op M-A\'s eigen elementen bij het thermisch ' +
              'ontwerpvermogen; het element met de MINSTE marge tegen klasse × marge (gates.ts, ' +
              'resistorVerdict).',
          },
        }
      : {}),
    ...(CASUS1_AMP_MIN_LOAD_OHM !== null
      ? {
          'M-B/|Z|': {
            sleutel: 'ampMinLoadOhm',
            bron: 'gesteld',
            waarde_ohm: CASUS1_AMP_MIN_LOAD_OHM,
            waar:
              'manifest_en_geometrie.gestelde_eisen.versterkervloer_ohm — het ENIGE ' +
              'voorkomen van dit getal. Het reist langs het A5a-pad van de app: ' +
              'settings.ampMinLoadOhm voor de reparatiepas, v2.gates.ampMinLoadOhm voor het ' +
              'oordeel.',
            regel:
              'meetsAmpFloor (src/lib/impedanceFloor.ts), inclusief haar meettolerantie — ' +
              'een projectconventie, geen eigenschap van de versterker.',
          },
        }
      : {}),
  },
  v2_poorten_waarom:
    (CASUS1_AMP_MIN_LOAD_OHM !== null
      ? 'M-B/|Z| is GEWAPEND op de gestelde versterkervloer; zie `v2_poorten_bron`. '
      : 'Geen versterkervloer gesteld, dus M-B/|Z| oordeelt niet. ') +
    (Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
      ? `M-C is GEWAPEND PER WEG (V50): een gesteld getal op ${Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).join(', ')}; ` +
        'elke andere hoogdoorlaatbeschermde weg (op casus 1 de mid) wordt op de afgeleide ' +
        'excursiegrens van V49 alleen geoordeeld. '
      : 'M-C draagt geen gesteld getal: alleen een afgeleid plafond (V49) oordeelt, waar het er is. ') +
    (CASUS1_BUILDABILITY_ON_SEARCH
      ? `M-A/part is GEWAPEND op de zoektocht (V51): klasse ${CASUS1_BUILDABILITY.resistorClassW} W × marge ` +
        `${CASUS1_BUILDABILITY.resistorPowerMargin} bij ${CASUS1_THERMAL_DESIGN_POWER_W ?? CASUS1_CONTINUOUS_POWER_W} W ` +
        (CASUS1_THERMAL_DESIGN_POWER_W !== null ? 'thermisch ontwerpvermogen (het continue vermogen blijft de wattkolom). ' : 'continu. ')
      : 'M-A/part is NIET gewapend op de zoektocht (V50, gestelde_eisen.bouwbaarheid_op_de_zoektocht): ' +
        'de weerstandseis is gesteld en het rapport oordeelt ermee op elke bevroren netlist, maar ' +
        'de generator wapent haar pas als Sander dat besluit — zie de sanity op HUIDIG daar. ') +
    'M-L rapporteert de piekstroom per spoel bij de piekingang en oordeelt niets: casus 1 stelt ' +
    'geen spoelklasse (de C-Coil-documentatie noemt geen verzadigingsstroom, V50). ' +
    'M-A (dissipatiefractie) en M-B/EPDR blijven ONGEWAPEND: casus 1 stelt daar niets ' +
    'voor, en leeg veld = geen oordeel (P4). Een afwezige grens is geen poort die altijd ' +
    'slaagt — hij rapporteert zijn waarde en oordeelt niets.',
  bouwbaarheid: {
    weerstandsklasse_W: CASUS1_BUILDABILITY.resistorClassW ?? null,
    weerstandsmarge: CASUS1_BUILDABILITY.resistorPowerMargin ?? null,
    spoelklasse_A: CASUS1_BUILDABILITY.coilClassA ?? null,
    continu_vermogen_W: CASUS1_CONTINUOUS_POWER_W,
    /* V51 — het vermogen waarbij M-A/part OORDEELT: het thermisch
     * ontwerpvermogen als het gesteld is, anders het continue (V50). */
    thermisch_ontwerpvermogen_W: CASUS1_THERMAL_DESIGN_POWER_W,
    oordeelt_bij_W: lastPayload.v2.gates.resistorThermalPowerW ?? lastPayload.v2.gates.amplifierPowerW ?? CASUS1_CONTINUOUS_POWER_W,
    piekingang_V: lastPayload.v2.gates.peakInputVolts ?? null,
    gewapend_op_de_zoektocht: CASUS1_BUILDABILITY_ON_SEARCH,
    waar: 'manifest_en_geometrie.gestelde_eisen.weerstandsklasse_*, .spoelklasse_*, .versterker_continu_vermogen_W, .thermisch_ontwerpvermogen_W, .bouwbaarheid_op_de_zoektocht',
  },
  /* ---- V51: MAG DE LAAGSTE WEG NIVEAUWERK DRAGEN ------------------------
   *
   * Het TIENDE besluit in dit blok, en het derde op ketenniveau naast het
   * V41-paar: gelezen vóórdat de tuner bestaat, want de trim van de laagste
   * weg wordt in de ONTWERPstap gezet en het pad in de SYNTHESEstap gelegd.
   * Afgelezen van de ketenverklaring, want het is een keuze-sleutel. */
  niveauwerk_laagste_weg: lastPayload.candidate?.chainDeclaration.stated.lowestWayLevelWork ?? null,
  niveauwerk_laagste_weg_waarom:
    (lastPayload.candidate?.chainDeclaration.stated.lowestWayLevelWork ?? null) === 'none'
      ? 'DE LAAGSTE WEG DRAAGT GEEN NIVEAUWERK: geen weerstand in haar serie-pad en geen weerstand ' +
        'die alleen van dat pad naar massa hangt (levelWork.ts). De ontwerpstap trimt haar met 0 dB ' +
        'en stelt er geen shelf-pad op voor; haar synthese legt geen L-pad, geen top-octaaf-hold en ' +
        'geen shelf-pad; de tuner maakt nooit een weerstand aan. Wat het niveau dan nog regelt is ' +
        'de baffle step en de tilt van de laagdoorlaatspoel. Kan een kandidaat zijn rimpeldoel ' +
        'daardoor niet halen, dan komt hij terug als V31-verwerping met X: hoeveel dB niveauwerk ' +
        'deze configuratie op de laagste weg VRAAGT (de A5d.4-gap tot het anker, plateau ' +
        'meegerekend). De vuistregel erachter: nooit een pad op de woofer (warmte, impedantie, ' +
        'demping); pad de mid of de tweeter. GESTELD in ' +
        'manifest_en_geometrie.gestelde_eisen.geen_niveauwerk_op_laagste_weg (V51).'
      : 'Niet gesteld: de laagste weg wordt tot de stilste weg getrimd en gepad om dat te ' +
        'realiseren — de vóór-arm van V51, en wat elke v1-run leest (P4: absent, nooit een ' +
        'gesteld "allowed").',
  niveauwerk_laagste_weg_herkomst:
    CASUS1_LOWEST_WAY_LEVEL_WORK_FORBIDDEN
      ? 'GESTELD door de ontwerper, gelezen uit `manifest_en_geometrie.gestelde_eisen` — niet ' +
        'afgeleid en nergens als default in `src/lib/engine2/` (P6). Motivering en meetgeometrie ' +
        'staan bij `geen_niveauwerk_motivering` en `driverkaart.woofer.schakeling`.'
      : 'NIET GESTELD.',
  schakeling_per_weg: CASUS1_WIRING,
  schakeling_waarom:
    'Per weg het aantal gelijke drivers en de schakeling zoals GEMETEN en zoals GEWENST ' +
    '(driverkaart.<weg>.schakeling). Rapportage en geen oordeel: de afleiding parallel<->serie ' +
    '(SPL -/+20 log N, fase gelijk, Z x/: N^2, ingest/wiring.ts) is op deze casus de identiteit ' +
    'en wordt niet toegepast — het wooferpaar is parallel gemeten en parallel gewenst.',
  v2_budgetten_gewapend: Object.keys(lastPayload.v2.budgets ?? {}).sort(),
  v2_budgetten_waarom:
    CASUS1_LF_RESONANT_BUDGET_DB !== null
      ? `M-D IS GEWAPEND, met bron GESTELD: ${CASUS1_LF_RESONANT_BUDGET_DB} dB uit ` +
        '`manifest_en_geometrie.gestelde_eisen.lf_opslingering_budget_dB`, langs hetzelfde pad ' +
        'als de versterkervloer en met dezelfde P4-regel (leeg veld = geen inversie). Hij wapent ' +
        'GEEN poort: M-D heeft geen poort-id in `GATE_IDS` en staat in A4 onder de rapporterende ' +
        'metrieken. Wat hij doet is de A5d.6-inversie `bump-series-l` van invoer voorzien, en ' +
        'die levert een PLAFOND op de seriespoel van de laagste weg — opgelost op de gemeten ' +
        'Z-piek en het gemeten nabije veld, bij de padweerstand van het zaad. Sinds V42 is dat ' +
        'plafond een SOM over de vrije seriespoelen van de weg en niet alleen een grens per ' +
        'component: zeven van de acht V41-netlists droegen twee spoelen in serie en ontsnapten ' +
        'daarmee aan de per-component-versie. SINDS V43 is de GROOTHEID de resonante component ' +
        '(`lfBump().resonantDb`) en niet de som van lift en opslingering, en daarmee levert de ' +
        'inversie ALTIJD een plafond: bij L = 0 is de opslingering per definitie nul, dus het ' +
        'budget kan niet op zijn vóór er een spoel bestaat. Op `extraDb` gebeurde dat op zes van ' +
        'de negen bevroren netlists. Het evaluatiebudget komt nog steeds van de tuner zelf (zie ' +
        'de vingerafdruk: `budget=tuner`).'
      : 'LEEG. De A5d.6-inversies begrenzen waarden; op deze route is er geen gesteld budget dat ' +
        'de zoektocht inperkt. Het evaluatiebudget komt van de tuner zelf (zie de vingerafdruk: ' +
        '`budget=tuner`).',
  /* V42 — het gestelde budget zelf, naast de lijst met gewapende namen. Een
   * naam zonder waarde laat de lezer raden waar de grens lag. Sinds V43 heet
   * het veld naar de GROOTHEID die het begrenst; op `extraDb` heette het
   * `lf_bult_budget_dB` en stond het op 2,5. */
  lf_opslingering_budget_dB: CASUS1_LF_RESONANT_BUDGET_DB,
  lf_opslingering_budget_herkomst:
    CASUS1_LF_RESONANT_BUDGET_DB !== null
      ? 'GESTELD door de ontwerper, gelezen uit `manifest_en_geometrie.gestelde_eisen` — niet ' +
        'afgeleid en nergens als default in `src/lib/engine2/` (P6).'
      : 'NIET GESTELD: geen inversie, geen plafond, en de bult wordt alleen gerapporteerd (P4).',
  beschermingen_via_kandidaat: declaredStated,
  beschermingen_waarom:
    'De beschermingen zijn KEUZE-sleutels (V26 rijen 31, 33, 14, 2) en bereiken de tuner sinds ' +
    'F4d uitsluitend via de verklaring van de kandidaat. `safety`, `staged` en `audit` staan ' +
    'hier omdat de eerste versie van deze fixture ze wegliet en daarmee een dode kortsluiting ' +
    'opleverde die de keten niet zag (V27). `rSourceDisqualifyOhm` STOND hier tot V34 en staat ' +
    'er nu niet meer, en dat is geen weglating maar de verklaring zelf — zie ' +
    '`bronweerstandsgrens_waarom` hieronder.',
  /* ---- V34: DE BRONWEERSTANDSPROBE, EN ZIJN TWEE GRENZEN ---------------- *
   *
   * Twee velden, twee besluiten, precies zoals V30 en V33 er twee zijn: WAAR
   * de probe leest, en WELKE grens hij vergeleken wordt met. Beide afgelezen
   * van de verklaring, want beide zijn keuze-sleutels. */
  probe_raster: lastPayload.candidate?.declaration.stated.rSourceProbeSource ?? null,
  probe_raster_waarom:
    {
      safety:
        'De bronweerstandsprobe leest op het VEILIGHEIDSRASTER. Op het ketenraster landde hij ' +
        'op `grid[24] = 640,2 Hz`, en dat is de BOVENRAND van zijn eigen zoekvenster en geen ' +
        'resonantie: dit wooferpaar is bassreflex en zijn twee impedantiepieken liggen op 17 en ' +
        '51 Hz, allebei onder een raster dat op 200 Hz begint. De bewaking die daarvoor bestond ' +
        '(ISSUE #14) verwierp alleen index 0. Gemeten: op 640 Hz lezen de drie v1-baselines ' +
        '0,50/0,47/0,68 Ω, op de echte piek 3,98/4,59/2,55 Ω (V34).',
      grid:
        'De probe leest het EVALUATIERASTER, zoals altijd — de vóór-arm van V34, met de ' +
        'historische randregel.',
    }[lastPayload.candidate?.declaration.stated.rSourceProbeSource ?? 'grid'],
  bronweerstandsgrens:
    lastPayload.candidate?.declaration.stated.rSourceDisqualifyOhm ?? null,
  bronweerstandsgrens_waarom:
    lastPayload.candidate?.declaration.absent.find((a) => a.key === 'rSourceDisqualifyOhm')?.why ??
    'GESTELD — zie `bronweerstandsgrens`.',
  bronweerstandsgrens_herkomst:
    'Casus 1 stelt in `manifest_en_geometrie.gestelde_eisen` GEEN bronweerstandsgrens, dus de ' +
    'kandidaat draagt er geen en er wordt niets op gediskwalificeerd (P4). Tot V34 stond hier ' +
    '2,0 Ω — de UI-default van de app, in een fixture getypt, langs precies het pad dat F0 voor ' +
    '`ampMinLoadOhm` heeft opgeruimd. `withDeclaredSourceLimit` in de worker zorgt dat de keten ' +
    'die afwezigheid ook honoreert in plaats van terug te vallen op haar eigen default.',
  /* ---- V37: WAT DE DISSIPATIETERM DEELT ---------------------------------
   *
   * Eén veld, één besluit, in dezelfde vorm als V30, V33 en V34: niet WAAR de
   * probe leest (dat is `probe_raster`) maar WAARDOOR de teller gedeeld wordt.
   * Afgelezen van de verklaring, want het is een keuze-sleutel. */
  dissipatie_noemer:
    lastPayload.candidate?.declaration.stated.dissipationReferenceSource ?? null,
  dissipatie_noemer_waarom:
    {
      re:
        'De dissipatieterm deelt door de OPGELOSTE R_e van de laagste weg — het getal dat M-E ' +
        'publiceert en dat de Q_es-inversie gebruikt, opgelost door de ingestpas (A5c.1) en ' +
        'meegedragen door `measurementFacts`. De term bestaat om de serie-R-route naar ' +
        'niveauregeling af te remmen en de schade daarvan is Q_es-vermenigvuldiging, ' +
        '`1 + R_source/R_e`, met R_e de DC-weerstand (A3j rij 23, A4 M-E). Tot V37 deelde hij ' +
        'door `Re(Z)` BIJ de probe, en sinds V34 zit die probe op de impedantiepiek van het ' +
        'wooferpaar: gemeten 19,31 Ω tegen een gemeten R_e van 3,05 Ω, een factor 6,33 die tot ' +
        '40,1 kwadrateert. Geen terugval: zonder opgeloste R_e is er geen verhouding en meldt ' +
        'de run welke invoer ontbrak.',
      probe:
        'De dissipatieterm deelt door `Re(Z)` bij de probe — de vóór-arm van V37, en de ' +
        'default die elke v1-run leest.',
    }[lastPayload.candidate?.declaration.stated.dissipationReferenceSource ?? 'probe'],
  /* ---- V38-fix: WELKE KROMME DE AMPLITUDETERM MEET -----------------------
   *
   * Eén veld, één besluit, in dezelfde vorm als V30, V33, V34 en V37. Niet
   * hoevéél moeite de zoektocht doet (dat is polish) maar WAARVAN zijn
   * amplitudeterm de spreiding is. Afgelezen van de verklaring, want het is
   * sinds V38-fix een keuze-sleutel. */
  zoekmaat_gladding_oct:
    lastPayload.candidate?.declaration.stated.errorSmoothOct ?? null,
  zoekmaat_waarom:
    (lastPayload.candidate?.declaration.stated.errorSmoothOct ?? null) === 0
      ? 'DE ZOEKTOCHT MEET DE SOM DIE ZIJ BEOORDEELD WORDT — geen gladding. `smoothMag` in ' +
        '`netOptimizer.ts` gladt de MAGNITUDE van elke driverrespons met `errorSmoothOct`, laat ' +
        'zijn FASE staan en sommeert de takken daarna complex, terwijl élk oordeel — ' +
        '`judgeResponse`, het SPL-venster, de trapdoelen, elke poort — de ONGEGLADDE som leest. ' +
        'Op dit ketenraster reikt de gladdingskern over de bandrand heen naar de stille geest op ' +
        '20 000 Hz (−400 dB, buiten de beoordeelde band) en trekt het laatste punt BINNEN de ' +
        'band van 130,95 naar 43,67 dB: de amplitudeterm stond daardoor op 10,22 dB waar de ' +
        'echte som er 1,85 heeft. Gemeten kostte die ene sleutel 0,55–2,45 dB geleverde ' +
        'vlakheid op drie topologieën (V38, V38-fix). Gladden NA de sommatie repareert het niet ' +
        '— nagemeten op élke bevroren netlist, de geest zit ook in de som — dus 0 en geen ' +
        'smallere breedte. Het OORDEEL blijft gegladd op 1/6 octaaf (A5e.1): dat is een andere ' +
        'vraag, en zij wordt op de SOM gesteld nadat die bestaat.'
      : 'De zoektocht gladt de drivermagnitudes vóór de sommatie — de vóór-arm van V38-fix, en ' +
        'de default die elke v1-run leest.',
  /* ---- V44: WELKE PUNTEN EEN FASE-OORDEEL DRAGEN -------------------------
   *
   * Eén veld, één besluit, in dezelfde vorm als V30, V33, V34, V37 en V38-fix.
   * Niet hoe fase GEWOGEN wordt (dat is `phaseMetric`, en dat veld staat er al)
   * maar over welke PUNTEN het gemiddelde genomen wordt. Afgelezen van de
   * verklaring, want het is sinds V44 een keuze-sleutel. */
  fase_toelating: lastPayload.candidate?.declaration.stated.phaseAdmission ?? null,
  fase_toelating_waarom:
    (lastPayload.candidate?.declaration.stated.phaseAdmission ?? null) === 'measured'
      ? 'HET FASE-OORDEEL RUST OP DE PUNTEN DIE HET MOGEN DRAGEN — drie gronden tegelijk, elk ' +
        'een bestaande doctrine. (a) Binnen de meetgeldigheid van BEIDE takken: over het hele ' +
        'casusboek telde de oude tunerverzameling 1048 punten mee die het rapport niet zag, ' +
        'waarvan 911 onder de vloer die de meetbestanden ZELF in hun kop opgeven (V15, lek 2). ' +
        '(b) Beide takken boven de stille-geestvloer: 14 punten waar BEIDE takken dood waren en ' +
        'het faseverschil dus uitsluitend van de filters kwam — op HUIDIG is dat 20 kHz met ' +
        '−475 en −462 dB, |Δ| = 13,1 dB, dus ruim binnen elk RELATIEF venster (V38-fix). (c) ' +
        '|niveauverschil na filter| ≤ het overlapvenster: het bestaande tuner-criterium, want ' +
        'fase waar de som hem niet voelt telt niet — de oude rapportmaat middelde op ' +
        'V28_KAND_1 M-T dertien punten van gemiddeld 146° mee en las 90,7° waar de som 29,7° ' +
        'zag. De ±1-OCTAAFBAND is als toelating VERVALLEN: grond (c) leest het overnamegebied ' +
        'van het geleverde netwerk af in plaats van het met een octaafregel te benaderen. Geen ' +
        'van de drie gronden stelt een frequentie of een grens — de geldige band komt uit de ' +
        'opnamepas, de geestvloer is de conventie van wie het raster bouwde, en het ' +
        'overlapvenster woonde al in `integration.ts` (V40, V44).'
      : 'Het fase-oordeel rust op elk punt binnen het overlapvenster, ongeknipt op ' +
        'meetgeldigheid — de vóór-arm van V44, en de default die elke v1-run leest.',
  /* ---- V41: WAT DE ONTWERP- EN SYNTHESESTAP MOCHTEN BOUWEN ---------------
   *
   * Twee velden, één besluit, in dezelfde vorm als V30, V33, V34, V37 en
   * V38-fix — maar één laag hoger: deze twee worden gelezen vóórdat de tuner
   * bestaat, dus zij bepalen wat de topologie KAN zijn en niet welke waarden
   * zij krijgt. Afgelezen van de ketenverklaring, want sinds V41 zijn het
   * keuze-sleutels op de v2-route. */
  eq_budget_per_tak: lastPayload.candidate?.chainDeclaration.stated.eqBands ?? null,
  eq_budget_waarom:
    'De ontwerpstap mag zoveel snijdende EQ-banden per tak voorstellen. Tot V41 stelde de ' +
    'v2-fixture hem NIET, en ongesteld is in `designThreeWay` een stille NUL — geen enkele band, ' +
    'terwijl een EQ-band de enige weg is waarlangs `deriveTopology` een val op een gemeten ' +
    'breakup kan voorstellen, en een waardetune er nooit een kan maken die de ontwerpstap niet ' +
    'voorstelde. De app zelf staat op dit getal en heeft daar altijd op gestaan (V38 ' +
    'beslispunt C). Afwezig las als een besluit om élke correctie te verbieden, en dat besluit ' +
    'heeft niemand genomen — het omgekeerde van P4.',
  lean_drempel_db: lastPayload.candidate?.chainDeclaration.stated.leanTargetDb ?? null,
  lean_drempel_waarom:
    'De fitfout van de kale HP/LP-ladder waaronder de synthesestap besluit dat er geen ' +
    'correctienetwerk nodig is (Zobel, Fs-val, top-octaaf-hold). Dit is de EIGEN standaard van ' +
    '`synthesize`. Tot V41 was het geen sleutel maar een AFLEIDING binnen de keten uit ' +
    '`targets.rippleDb` — het stopdoel van de trapmethode, 2,5 dB, vijf keer zo ruim — en over ' +
    'het hele veld haalde de kale ladder die drempel op 45 van de 45 takken en deze op 0 van de ' +
    '45 (V38 beslispunt B). De twee ANDERE lezers van `targets.rippleDb` zijn oordelen (de ' +
    'trapmethode zelf en de v1-rangschikking) en zijn niet aangeraakt: alleen de synthese-lezing ' +
    'beweegt.',
  /* ---- V45: WAARTEGEN DE AMPLITUDETERM VLAK IS, EN DE Q_es-GRENS ---------
   *
   * Twee velden, twee besluiten, in dezelfde vorm als V30, V33, V34, V37,
   * V38-fix en V44. Het EERSTE is een keuze-sleutel en wordt van de verklaring
   * afgelezen; het TWEEDE is een gesteld budget en staat in `v2_budgetten_...`
   * hierboven — het krijgt hier zijn eigen regel omdat een lezer moet kunnen
   * zien WELKE grootheid begrensd is en waardoor de inversie deelt. */
  amplitude_referentie:
    lastPayload.candidate?.declaration.stated.amplitudeReference ?? null,
  amplitude_referentie_waarom:
    (lastPayload.candidate?.declaration.stated.amplitudeReference ?? null) === 'target'
      ? 'DE ZOEKTOCHT MEET DE VLAKHEID TEN OPZICHTE VAN DE DOELCURVE, niet ten opzichte van ' +
        'horizontaal. `bandStd` is de spreiding van de som rond haar eigen bandgemiddelde, dus ' +
        'zonder deze sleutel is "perfect" per definitie een rechte lijn — en dan werd een ' +
        'ontwerp GEZOCHT tegen vlak en GEOORDEELD tegen een plateau (A5e.1 leest de doelcurve ' +
        'al sinds F3). Van die twee heeft de zoektocht het hele iteratiebudget: zij wint, en het ' +
        'oordeel legt alleen de nederlaag vast. De curve zelf reist als POLISH mee — hij is de ' +
        'voicing van het ONTWERP en geen mening van de kandidaat (A5e.2, V45).'
      : 'De zoektocht meet vlakheid ten opzichte van horizontaal — de vóór-arm van V45, en de ' +
        'default die elke v1-run leest.',
  /* V47 — WELKE REGEL EEN ONBESCHERMDE BOVENSTE DRIVER VERBIEDT. Het ACHTSTE
   * besluit in dit blok, naast V30/V33, V34, V37, V38-fix, het V41-paar, V44 en
   * V45 — en het eerste dat een POORT wapent in plaats van alleen de zoektocht
   * te sturen. */
  beschermingsregel: lastPayload.candidate?.declaration.stated.protectionRule ?? null,
  beschermingsregel_waarom:
    (lastPayload.candidate?.declaration.stated.protectionRule ?? null) === 'stated'
      ? 'DE GESTELDE EIS OORDEELT, EN DE ZAADVERGELIJKING VERVALT. De volle-band-veiligheidspoort ' +
        'weigerde een tune in zijn geheel zodra haar beschermingstekort meer dan 3 dB-kwadraat ' +
        'boven dat van het ZAAD lag — een afstand tot een netwerk dat niemand tegen het doel van ' +
        'deze run heeft gelegd (V31), dus wat zij toestond bewoog mee met wat het zaad droeg. Met ' +
        `een gestelde grens (${CASUS1_MAX_DRIVE_ON_FS_DB} dB) oordeelt M-C ABSOLUUT, op élk punt ` +
        'waar een pas een netwerk accepteert, en een run die niets toelaatbaars vindt komt terug ' +
        'als weigering met de gemeten waarde en de eis. GEMETEN BIJ V47, en de meting keerde de ' +
        'verwachting om: de vier V45-kandidaten die de zaadregel weigerde meten absoluut -3,43 ' +
        'tot -12,29 dB, dus zij ving daar echte schendingen; waar zij faalde is de andere kant ' +
        'op, want datzelfde veld LEVERDE twee netlists op -14,38 en -15,10 dB omdat hun zaad ' +
        'even slecht was.'
      : 'De zaadvergelijking van de volle-band-veiligheidspoort staat — de historische regel, en ' +
        'wat elke v1-run leest. Zonder gestelde grens is er niets absoluuts om naar te wijken, ' +
        'en een vergelijking met het zaad is dan beter dan geen vergelijking (P4).',
  /* V48 — WELK NETWERK HET SERIESPOEL-PLAFOND BESCHRIJFT. Het NEGENDE besluit
   * in dit blok, naast V30/V33, V34, V37, V38-fix, het V41-paar, V44, V45 en
   * V47 — en het eerste dat over een BOUND gaat in plaats van over een term,
   * een poort of een raster. */
  plafond_bron:
    lastPayload.candidate?.declaration.stated.seriesInductanceCeilingSource ?? null,
  plafond_bron_waarom:
    (lastPayload.candidate?.declaration.stated.seriesInductanceCeilingSource ?? null) === 'tuned'
      ? 'HET A5d.6-PLAFOND OP DE SERIESPOEL WORDT AFGELEZEN BIJ HET NETWERK DAT GEËVALUEERD ' +
        'WORDT, niet bij het zaad. `bump-series-l` keert het LF-budget om naar een plafond BIJ ' +
        'EEN GEGEVEN PADWEERSTAND, en de tune verplaatst die padweerstand — dus tot V48 begrensde ' +
        'de zoekdoos een netwerk dat de zoektocht al verlaten had. V45 schreef dat op als open ' +
        'punt en beredeneerde het als veilig, en in ÉÉN richting klopt dat: een tune die de ' +
        'padweerstand VERHOOGT loopt onder een te streng plafond, want meer serieweerstand dempt ' +
        'de resonante helft. De andere richting is het defect. Gemeten op Sanders browserrun van ' +
        '01-09-2026: twee van negen kandidaten leverden 2,29 en 1,61 dB opslingering tegen een ' +
        'gestelde 1,4, en de geleverde-netwerk-toets van V45 ving ze allebei — terecht, maar ' +
        'vangen is verliezen. De inversie wordt daarvoor niet aangeraakt en het budget niet ' +
        'verplaatst; wat verandert is bij WELKE padweerstand hij gesteld wordt, gememoïseerd op ' +
        'een naar beneden afgeronde korrel zodat een te streng plafond de enige fout blijft die ' +
        'hij kan maken (V48).'
      : 'Het plafond is één keer opgelost, bij de padweerstand van het zaad, en staat voor de ' +
        'hele tune — de vóór-arm van V48, en de default die elke v1-run leest.',
  doelcurve: describeTargetCurve(CASUS1_TARGET_CURVE),
  doelcurve_herkomst:
    'De DIEPTE is gesteld (`gestelde_eisen.basplateau_offset_dB`) en de OVERGANG is afgeleid ' +
    '(`baffleStepHz` van de gemeten kastbreedte in `geometrie.baffle_mm`). Twee halves uit twee ' +
    'verschillende soorten bron, en dat is P6: een frequentie in dit project komt uit ' +
    'projectdata, een voicing-diepte komt van een ontwerper. Zie ' +
    '`gestelde_eisen.basplateau_waarom_niet_gemeten` voor waarom de diepte op deze meetset ' +
    'niet te MÉTEN is.',
  qes_grens: CASUS1_QES_MULTIPLIER_MAX,
  qes_grens_waarom:
    CASUS1_QES_MULTIPLIER_MAX !== null
      ? 'GESTELD door de ontwerper, gelezen uit `manifest_en_geometrie.gestelde_eisen`. Hij ' +
        'wapent de A5d.6-inversie `qes-series-r`: een plafond op de TOTALE serieweerstand van de ' +
        'laagste weg, `R_s <= R_e * (q - 1)`, met de DCR van de spoelen eerst van het plafond ' +
        'af. Geen poort — M-E heeft geen poort-id, dus het budget begrenst de ZOEKTOCHT en ' +
        'veroordeelt geen geleverde netlist. Hij bestaat om de weerstandsvlucht af te knippen ' +
        'die V43 mat toen het opslingeringsbudget de spoel begrensde: dissipatie 46,1 → 52,5 %, ' +
        'pads tot 5,80 Ω, Q_es maal 3 (V45).'
      : 'NIET GESTELD: geen inversie, geen plafond, en M-E wordt alleen gerapporteerd (P4).',
  dissipatiegewicht: CASUS1_V2_SETTINGS.dissipationWeight,
  dissipatiegewicht_waarom:
    'GRIJS (A3j): overgenomen uit v1, expliciet gesteld door de kandidaat, nooit stil op nul. ' +
    'De waarde is de app-standaard en V37 heeft haar NIET aangeraakt — eerst de noemer, dan pas ' +
    'de vraag of het gewicht klopt; een gewicht ophogen om een verkeerd gemeten grootheid te ' +
    'compenseren is de fout twee keer maken.',
  audittier_ohm: CASUS1_V2_SETTINGS.audit.thresholds.rSourceOhm,
  audittier_waarom:
    'NULL, en null is hier een waarde: de onderdelenaudit DRAAIT (zij is een bescherming), maar ' +
    'haar bronweerstandstier is niet gesteld. Die tier draagt een oordeel en geen rapportage — ' +
    'een onderdeel dat de tier overschrijdt heet `earned` en wordt dus NIET verwijderd, en de ' +
    'catalogus-snap begrenst er het DCR-budget per tak mee. Casus 1 stelt hem niet, dus hij ' +
    'oordeelt niets (V34, P4).',
  /* IS THE FLOOR A ZOEKDOEL OR ONLY A VETO (V30)? Read off the declaration,
   * because it is a CHOICE key and may only reach the tuner from there. The
   * grey value beside it is the number that choice hands the search — an
   * inherited v1 constant, labelled as one. */
  /* V33 — WAAR dat zoekdoel gemeten wordt, naast de vraag OF het er is.
   * Twee sleutels, twee regels in dit blok: V30 ging over het eerste en V33
   * over het tweede, en ze samenvoegen zou verbergen welke van de twee bewoog. */
  vloer_zoekdoel_bron: lastPayload.candidate?.declaration.stated.zFloorBarrierSource ?? null,
  vloer_zoekdoel_bron_waarom:
    {
      safety:
        'De barrièreterm leest zijn tekort op het VEILIGHEIDSRASTER van de tuner — dezelfde ' +
        'uitgestrektheid als de gemeten sweep waarop M-B/|Z| oordeelt, dezelfde lezer ' +
        '(`minImpedanceAt`), grover raster. Tot V33 las hij het EVALUATIERASTER, waarvan de ' +
        'bodem de verre-veldspan is: de zoektocht mikte dan op een minimum boven 200 Hz terwijl ' +
        'de poort er sinds V32 een op de volle sweep handhaafde, en op deze casus kostte dat ' +
        'vijf van de vijftien kandidaten hun hele waardetune (V33). Hoever deze lezing van de ' +
        'poortlezing af ligt is gemeten en staat in `manifest_en_geometrie.v33_barriere_raster`.',
      sweep:
        'De barrièreterm leest zijn tekort op het POORTRASTER zelf — hetzelfde raster en ' +
        'dezelfde driverimpedanties waarop M-B/|Z| oordeelt (`impedanceReferenceFrom` → ' +
        '`minImpedanceAt`), dus doel en poort zien per constructie één getal. Dit is de dure ' +
        'arm van V33: ruim tien minuten per ketenrun tegen één op het veiligheidsraster.',
      grid: 'De barrière leest het EVALUATIERASTER, zoals altijd — de vóór-arm van V33.',
    }[lastPayload.candidate?.declaration.stated.zFloorBarrierSource ?? 'grid'],
  vloer_is_zoekdoel:
    lastPayload.candidate?.declaration.stated.zFloorBarrier === true,
  vloer_is_zoekdoel_waarom:
    lastPayload.candidate?.declaration.stated.zFloorBarrier === true
      ? 'GEWAPEND. Sinds V30 is `zFloorBarrier` een keuze-sleutel en wapent de kandidaat hem ' +
        'zodra er een vloer gesteld is: de barrièreterm zit in élke volle tune, dus de ' +
        'zoektocht voelt de vloer terwijl zij kiest in plaats van erna. De reparatiepas ' +
        'erachter is onveranderd.'
      : 'NIET gewapend: de vloer is dan een veto plus een reparatiepas achteraf, en de ' +
        'zoektocht die de topologie en de waarden kiest weet niet dat er een vloer is (V30).',
  grijze_waarden: greyValues(lastPayload.candidate?.declaration.stated),
  grijze_waarden_waarom:
    'Getallen die geen optie zijn en niet v2-afgeleid, maar die een gestelde keuze wél aan de ' +
    'zoektocht meegeeft. Zij reizen mét hun herkomst in de vingerafdruk, want een overgenomen ' +
    'constante en een afgeleide grootheid zijn hetzelfde getal en een andere bewering ' +
    '(V21, V22, V25).',
  oordeelband_hz: lastPayload.v2.judgeBandHz,
  seed: lastPayload.v2.determinism?.seed ?? null,
};
writeFileSync(
  OUT_MANIFEST,
  `${JSON.stringify(
    {
      _: 'F4d — DOCUMENTATIE, geen acceptatiewaarde. Zie scripts/generate-casus1-v2-candidates.ts.',
      gegenereerd_op_commit: commit,
      gegenereerd_op_commit_betekenis:
        'De HEAD van de boom waarin dit script DRAAIDE — dus de commit vóór de commit waarin ' +
        'deze fixtures landen. Dat kan niet anders: het script schrijft de bestanden en de ' +
        'commit legt ze vast, in die volgorde. Wie wil reproduceren moet dus deze commit ' +
        'uitchecken PLUS de bronwijzigingen van de eerstvolgende, of eenvoudiger: de commit ' +
        'nemen waarin de fixtures staan. Bij de F4d-nazorg stond hier 40bdf23 (de V20-commit) ' +
        'terwijl de fixtures bij d70c67b lagen, en dat leek een fout tot het opnieuw draaien ' +
        'de netlists byte-identiek teruggaf.',
      seed: CASUS1_V2_SEED,
      /* V46 — DE MACHINE EN DE RUNTIME WAAROP DIT VELD IS OPGEWEKT.
       *
       * V15's procesregel, één laag verder: een referentie die van een
       * parameter afhangt legt die parameter vast, en een BYTE-referentie hangt
       * meetbaar af van machine en runtime. Gemeten bij V46: alleen de
       * Node-versie wijzigen op dezelfde machine (26 -> 22) verplaatst het zaad
       * al op het vijfde significante cijfer en de simplex daarna naar een ánder
       * lokaal optimum. Zonder dit veld leest een reproductie die elders faalt
       * als een regressie, terwijl zij een legitiem ander corpus is (A5e.4, zoals
       * gepreciseerd bij V46). */
      opgenomen_op: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        v8: process.versions.v8,
        _:
          'A5e.4 is byte-identiek PER (machine, runtime); over machines heen geldt ' +
          'equivalentie binnen de tolerantieklassen. Reproduceert dit corpus elders niet ' +
          'byte-voor-byte, dan is dat geen regressie — regenereren daar levert een eigen, ' +
          'even geldig corpus. Wat wél overal moet reproduceren zijn de klasse-A/B-' +
          'referenties: dat is rekenwerk op bevroren netlists en dat is de laag die CI ' +
          'draait (casusboek V46).',
      },
      run_vingerafdruk: stamp.fingerprint,
      grid: { van_hz: CASUS1_V2_GRID[0], tot_hz: CASUS1_V2_GRID[CASUS1_V2_GRID.length - 1], punten: CASUS1_V2_GRID.length },
      oordeelband_hz: CASUS1_V2_BAND_HZ,
      settings: CASUS1_V2_SETTINGS,
      meetopstelling,
      generator_parameters: field.field.parameters,
      /* Het veld is groter dan de bevroren verzameling, en dat verschil hoort
       * genoemd: de generator levert `deliveredSize` kandidaten, de shortlist
       * laat er `bestanden.length` door. Tot de V28-opschorting waren die twee
       * gelijk (9 van 9) en was er niets te zien; sinds het veld vijftien telt
       * weigert de shortlist er werkelijk een aantal, en een lezer die alleen
       * de bestanden telt zou concluderen dat de generator er tien maakte. */
      shortlist: {
        overwogen: field.field.candidates.length,
        geweigerd_door_een_poort: outcomes.filter((o) => o.geweigerd_door.length > 0).length,
        /* V31 — de derde uitgang. Een kandidaat die niets leverde is niet
         * "door een poort geweigerd": er was geen ontwerp om te beoordelen. */
        leverde_geen_netwerk: outcomes.filter((o) => o.verwerping !== null).length,
        bevroren: written.length,
        _:
          'Zie `buildShortlist`: toelaatbaar gebied plus spreiding, en een poortweigering is ' +
          'een van de twee manieren om buiten het toelaatbaar gebied te vallen (de andere is ' +
          'een gestelde eis). Rangschikt niets (A5e.1). `bevroren` kan lager zijn dan ' +
          '`overwogen − geweigerd_door_een_poort`: de spreiding kiest daarna nog.',
      },
      verwerpingen: shortlist.rejected,
      kandidaat_uitkomst: outcomes,
      referentie_kruispunt_hz: field.referenceCrossingHz,
      orde_afleiding: field.orders.map((o) => ({ paar: o.pairLabel, orden: o.orders, waarom: o.why })),
      bestanden: written,
      kandidaat_herkomst: perCandidate,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`wrote ${OUT_MANIFEST}`);
