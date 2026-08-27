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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
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
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { buildCandidateField, candidateFieldKey } from '../src/lib/engine2/predesign/candidateField.ts';
import { declareCandidateChoices } from '../src/lib/engine2/optimizer/candidateDeclaration.ts';
import { stableJson, stampRun } from '../src/lib/engine2/optimizer/determinism.ts';
import { gateSettingsKey } from '../src/lib/engine2/optimizer/gates.ts';
import { budgetSettingsKey } from '../src/lib/engine2/optimizer/bounds.ts';
import { measurementFactsKey } from '../src/lib/engine2/optimizer/measurementFacts.ts';
import { buildShortlist, type ShortlistInput } from '../src/lib/engine2/optimizer/shortlist.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import { AUTO_STRUCTS } from '../src/lib/threeWayDesign.ts';
import type { Chain3Input, Chain3Result } from '../src/lib/threeWayChain.ts';
import type { GriddedResponse } from '../src/lib/dsp.ts';
import { serializeFilter } from '../src/lib/filterFile.ts';
import {
  CASUS1_AMP_MIN_LOAD_OHM,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_GRID,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
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
    amplifierPowerW: 100,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: FLAT_TARGET,
  },
});

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
}[] = [];
let n = 0;
for (const c of field.field.candidates) {
  n++;
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
      /* THE GATE SIDE OF THE SAME PATH THE APP TAKES.
       *
       * `App.tsx` fills `v2ScanSettings.gates.ampMinLoadOhm` from the A5a field
       * and `settings.ampMinLoadOhm` from the same state, and this fixture does
       * both for the same reason: one arms the repair pass, the other arms the
       * verdict. Spread rather than assigned, so an unstated floor arms nothing
       * — which is what casus 1 looked like before the floor was stated, and
       * what any other casus without one still looks like. */
      gates: {
        ...(CASUS1_AMP_MIN_LOAD_OHM !== null
          ? { ampMinLoadOhm: CASUS1_AMP_MIN_LOAD_OHM }
          : {}),
      },
      budgets: {},
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: FLAT_TARGET,
      judgeBandHz: CASUS1_V2_BAND_HZ,
    },
    candidate: casus1V2Declaration(c, gridded.safety),
  };
  lastPayload = payload;
  const t0 = Date.now();
  const wire = structuredClone({ id: n, kind: 'v2Chain3One' as const, payload });
  let out: {
    result: Chain3Result;
    measurements: ShortlistInput<Chain3Result>['measurements'];
    topology: ShortlistInput<Chain3Result>['topology'];
    gates: ShortlistInput<Chain3Result>['gates'];
    notes: string[];
  } | null = null;
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') out = m.data as typeof out;
  });
  if (!out) throw new Error(`candidate ${c.label} produced nothing`);
  const done = out as NonNullable<typeof out>;
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
  outcomes.push({
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
  });
  console.log(
    `  [${n}/${field.field.candidates.length}] ${c.label} → ` +
      `${done.result.net.after.rippleDb.toFixed(2)} dB / ${done.result.net.after.phaseDeg.toFixed(1)}°` +
      `  min|Z| ${(done.gates.find((v) => v.gate === 'M-B/|Z|')?.value ?? NaN).toFixed(2)} Ω` +
      `  ${failed.length ? `REFUSED by ${failed.map((v) => v.gate).join(', ')}` : 'gates ok'}` +
      `  (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  rows.push({
    label: c.label,
    parts: done.result.parts,
    result: done.result,
    topology: done.topology,
    measurements: done.measurements,
    gates: done.gates,
    disqualified: done.result.disqualified,
  });
  perCandidate[c.label] = { provenance: c.provenance, crossings: c.crossings };
}

/* ---- the run stamp, built exactly as `optimClient.ts` builds it ---------- */
const v2Facts = {};
const stamp = stampRun(
  {
    determinism: { seed: CASUS1_V2_SEED, seedSource: 'project', budgetEvaluations: null, budgetSource: "the tuner's own policy", starts: 1, startsSource: 'default' },
    design: stableJson({ variants: field.field.candidates.map((c) => [c.label, c.crossings[0].hz, c.crossings[1].hz]) }),
    measurements: stableJson({ grid: [CASUS1_V2_GRID[0], CASUS1_V2_GRID[CASUS1_V2_GRID.length - 1], CASUS1_V2_GRID.length] }),
    gates: stableJson(gateSettingsKey({})),
    bounds: stableJson(budgetSettingsKey({})),
    tuning: stableJson(CASUS1_V2_SETTINGS),
    facts: stableJson(measurementFactsKey(v2Facts)),
    choices: stableJson(candidateFieldKey(field.field)),
  },
  'completed',
);

const shortlist = buildShortlist(rows, stamp.fingerprint, { targetCurve: FLAT_TARGET });
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
  v2_poorten_bron:
    CASUS1_AMP_MIN_LOAD_OHM !== null
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
      : {},
  v2_poorten_waarom:
    (CASUS1_AMP_MIN_LOAD_OHM !== null
      ? 'M-B/|Z| is GEWAPEND op de gestelde versterkervloer; zie `v2_poorten_bron`. '
      : 'Geen versterkervloer gesteld, dus M-B/|Z| oordeelt niet. ') +
    'M-A (dissipatiefractie), M-B/EPDR en M-C blijven ONGEWAPEND: casus 1 stelt daar niets ' +
    'voor, en leeg veld = geen oordeel (P4). Een afwezige grens is geen poort die altijd ' +
    'slaagt — hij rapporteert zijn waarde en oordeelt niets.',
  v2_budgetten_gewapend: Object.keys(lastPayload.v2.budgets ?? {}).sort(),
  v2_budgetten_waarom:
    'LEEG. De A5d.6-inversies begrenzen waarden; op deze route is er geen gesteld budget dat ' +
    'de zoektocht inperkt. Het evaluatiebudget komt van de tuner zelf (zie de vingerafdruk: ' +
    '`budget=tuner`).',
  beschermingen_via_kandidaat: declaredStated,
  beschermingen_waarom:
    'De beschermingen zijn KEUZE-sleutels (V26 rijen 31, 33, 14, 2) en bereiken de tuner sinds ' +
    'F4d uitsluitend via de verklaring van de kandidaat. `safety`, `staged`, `audit` en ' +
    '`rSourceDisqualifyOhm` staan hier omdat de eerste versie van deze fixture ze wegliet en ' +
    'daarmee een dode kortsluiting opleverde die de keten niet zag (V27).',
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
        bevroren: written.length,
        _:
          'Zie `buildShortlist`: toelaatbaar gebied plus spreiding, en een poortweigering is ' +
          'een van de twee manieren om buiten het toelaatbaar gebied te vallen (de andere is ' +
          'een gestelde eis). Rangschikt niets (A5e.1). `bevroren` kan lager zijn dan ' +
          '`overwogen − geweigerd_door_een_poort`: de spreiding kiest daarna nog.',
      },
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
