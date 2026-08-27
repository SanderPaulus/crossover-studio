/**
 * V30 — WHAT THE FLOOR COSTS WHEN IT BECOMES A SEARCH GOAL.
 *
 * Run with `npx vite-node scripts/measure-v30-floor-goal.ts`. Thirty chain
 * runs (fifteen candidates × two arms), measured 40–80 s each: budget half an
 * hour and run it once.
 *
 * WHY A SEPARATE SCRIPT FROM THE GENERATOR. The generator freezes a corpus; it
 * runs one arm and writes netlists. This runs BOTH arms of the same field and
 * writes no netlist at all, because the interesting rows are the candidates a
 * gate refuses — and a refused candidate never becomes a file. Measuring the
 * price of the floor only on the survivors would measure the survivors.
 *
 * THE TWO ARMS, and the only difference between them:
 *
 *   vóór  — `zFloorBarrier: false` stated on the candidate. The stated floor
 *           still arms the M-B/|Z| GATE and still arms the repair pass; it is
 *           simply not in the objective. This is what the route did before
 *           V30, reproduced rather than remembered.
 *   ná    — `zFloorBarrier: true`. Same field, same seed, same protections,
 *           same gate. The barrier term is in every full tune.
 *
 * Everything else — grid, band, seed, protections, safety set — comes from
 * `casus1V2.fixture.ts`, so the two arms and the frozen corpus cannot be run
 * with different settings by accident.
 *
 * WHAT IT MEASURES PER CANDIDATE. The gate verdicts as the run delivered them
 * (a typed pass result, not a string match — A3g), and then the full report
 * metrics on the DELIVERED parts: min |Z|, SPL window, RMS flatness and phase
 * tracking per pair. The last four go through exactly the same `buildReport`
 * path the frozen netlists go through, via `casus1FilterFromParts`.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1FilterFromParts,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type EngineV2Report, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { FLAT_TARGET } from '../src/lib/engine2/requirements/targetCurve.ts';
import { buildShortlist, type ShortlistInput } from '../src/lib/engine2/optimizer/shortlist.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import type { Chain3Input, Chain3Result } from '../src/lib/threeWayChain.ts';
import {
  CASUS1_AMP_MIN_LOAD_OHM,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
} from '../src/lib/engine2/casus1V2.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_v30_vloer_vergelijking.json');

if (CASUS1_AMP_MIN_LOAD_OHM === null) {
  throw new Error(
    'casus 1 states no amplifier floor, so there is no before/after to measure: both arms would ' +
      'be the unarmed arm. See manifest_en_geometrie.gestelde_eisen.',
  );
}
const FLOOR = CASUS1_AMP_MIN_LOAD_OHM;

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);
const REPORT_SETTINGS: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
  reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
  targetCurve: FLAT_TARGET,
  ampMinLoadOhm: FLOOR,
};
const seedReport = buildReport({
  manifest,
  files,
  filter: casus1Filter('HUIDIG', manifest, files, golden),
  geometry,
  settings: REPORT_SETTINGS,
});

const field = casus1Field(seedReport);
/** Smoke-run escape hatch: `V30_LIMIT=1` runs one candidate per arm. Not a
 *  measurement — the shortlist and the byte-identity count are meaningless on
 *  a slice, and the JSON it writes says so by being obviously short. */
const LIMIT = Number(process.env.V30_LIMIT ?? 0);
if (LIMIT > 0) field.field.candidates.length = Math.min(LIMIT, field.field.candidates.length);
const gridded = casus1ChainInput(manifest, files, golden);
console.log(`field: ${field.field.candidates.length} candidates, floor ${FLOOR} Ω`);

/** The report metrics that answer "what did the floor cost", on delivered parts. */
function metricsOfParts(label: string, parts: Chain3Result['parts']) {
  const rep: EngineV2Report = buildReport({
    manifest,
    files,
    filter: casus1FilterFromParts(label, parts, manifest, files),
    geometry,
    settings: REPORT_SETTINGS,
  });
  const pt = rep.system.phaseTracking;
  const r2 = (v: number | null | undefined) =>
    v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(2));
  return {
    minZ_ohm: r2(rep.metrics.epdr?.minZOhm),
    minEPDR_ohm: r2(rep.metrics.epdr?.minOhm),
    spl_venster_pm_dB: r2(rep.system.response?.windowPlusMinusDb),
    rms_vlakheid_dB: r2(rep.system.response?.rmsDeviationDb),
    wm_fase_oct: r2(pt.find((p) => p.lower === 'woofer')?.meanAbsDeg ?? null),
    mt_fase_oct: r2(pt.find((p) => p.lower === 'mid')?.meanAbsDeg ?? null),
  };
}

type Arm = { armed: boolean; naam: 'voor' | 'na' };
const ARMS: Arm[] = [
  { armed: false, naam: 'voor' },
  { armed: true, naam: 'na' },
];

type Row = {
  label: string;
  arm: 'voor' | 'na';
  rimpel_dB: number;
  fase_graden: number;
  ampFloorRepair: string | null;
  pas: Record<string, unknown>;
  poort_MB_Z: { gewapend: boolean; geslaagd: boolean; waarde: number | null; grens: number | null };
  geweigerd_door: string[];
  gediskwalificeerd: string[];
  metrieken: ReturnType<typeof metricsOfParts>;
  partsHash: string;
};

/** A cheap stable digest of the delivered values — "is this the same network?" */
const partsHash = (parts: Chain3Result['parts']): string => {
  const s = JSON.stringify(
    [...parts].map((p) => [p.partId, p.type, p.params.map((q) => [q.name, q.value])]),
  );
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
};

const rows: Row[] = [];
const shortlists: Record<string, { overwogen: number; bevroren: number; labels: string[] }> = {};

for (const arm of ARMS) {
  const slInput: ShortlistInput<Chain3Result>[] = [];
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
    /* THE ONE DIFFERENCE BETWEEN THE ARMS. Stated on the candidate, because
     * that is the only door a choice key may come through on this route — and
     * stating it explicitly is also what makes the "vóór" arm reproducible
     * after the derivation defaults it to true. */
    const declared = casus1V2Declaration(c, gridded.safety);
    declared.declaration.stated.zFloorBarrier = arm.armed;
    const payload: V2Chain3Payload = {
      input,
      v2: {
        gates: { ampMinLoadOhm: FLOOR },
        budgets: {},
        determinism: { seed: CASUS1_V2_SEED },
        targetCurve: FLAT_TARGET,
        judgeBandHz: CASUS1_V2_BAND_HZ,
      },
      candidate: declared,
    };
    const t0 = Date.now();
    const wire = structuredClone({ id: n, kind: 'v2Chain3One' as const, payload });
    let out: {
      result: Chain3Result;
      measurements: ShortlistInput<Chain3Result>['measurements'];
      topology: ShortlistInput<Chain3Result>['topology'];
      gates: ShortlistInput<Chain3Result>['gates'];
      notes: string[];
    } | null = null;
    handleV2Request(wire, (msg: V2Response) => {
      if (msg.kind === 'error') throw new Error(msg.message);
      if (msg.kind === 'done') out = msg.data as typeof out;
    });
    if (!out) throw new Error(`candidate ${c.label} produced nothing`);
    const done = out as NonNullable<typeof out>;
    const zGate = done.gates.find((v) => v.gate === 'M-B/|Z|');
    const failed = done.gates.filter((v) => v.active && !v.pass);
    const row: Row = {
      label: c.label,
      arm: arm.naam,
      rimpel_dB: Number(done.result.net.after.rippleDb.toFixed(2)),
      fase_graden: Number(done.result.net.after.phaseDeg.toFixed(1)),
      /* WHY THIS RUN SHIPPED WHAT IT SHIPPED — the pass outcomes, typed, not a
       * string match on prose (A3g). The first smoke run made the need
       * obvious: a barrier-armed tune came back byte-identical to an unarmed
       * one, and the reason was not that the barrier did nothing but that the
       * FULL-BAND SAFETY GATE threw the whole tune away and the function
       * returned its seed — visible only as the presence of `safetyNote` and
       * the ABSENCE of `ampFloorRepair` on the returned object. A comparison
       * that recorded only the delivered metrics would have called those two
       * runs "the same result". */
      ampFloorRepair: (done.result.net as { ampFloorRepair?: string }).ampFloorRepair ?? null,
      pas: {
        tuned: (done.result.net as { tuned?: boolean }).tuned ?? null,
        evaluaties: (done.result.net as { evaluations?: number }).evaluations ?? null,
        infeasible: (done.result.net as { infeasible?: unknown }).infeasible ?? null,
        safetyNote: (done.result.net as { safetyNote?: string }).safetyNote ?? null,
        safetyKinds: (done.result.net as { safetyKinds?: string[] }).safetyKinds ?? null,
        ampFloorNote: (done.result.net as { ampFloorNote?: string }).ampFloorNote ?? null,
        /* The tell that the tune was rejected wholesale rather than merely
         * failing its repair: `ampFloorRepair` is set on every completed pass
         * and is absent on the early return. */
        vroege_terugkeer: !('ampFloorRepair' in (done.result.net as object)),
      },
      poort_MB_Z: {
        gewapend: zGate?.active ?? false,
        geslaagd: zGate?.pass ?? false,
        waarde: zGate?.value === null || zGate?.value === undefined ? null : Number(zGate.value.toFixed(3)),
        grens: zGate?.limit ?? null,
      },
      geweigerd_door: failed.map((v) => `${v.gate} (${v.subject})`),
      gediskwalificeerd: [...(done.result.disqualified ?? [])],
      metrieken: metricsOfParts(`${c.label} [${arm.naam}]`, done.result.parts),
      partsHash: partsHash(done.result.parts),
    };
    rows.push(row);
    console.log(
      `  [${arm.naam}][${n}/${field.field.candidates.length}] ${c.label} → ` +
        `min|Z| ${(row.poort_MB_Z.waarde ?? NaN).toFixed(2)} Ω  ` +
        `${row.rimpel_dB.toFixed(2)} dB / ${row.fase_graden.toFixed(1)}°  ` +
        `SPL ±${row.metrieken.spl_venster_pm_dB} RMS ${row.metrieken.rms_vlakheid_dB}  ` +
        `repair=${row.ampFloorRepair ?? 'EARLY-RETURN'}  ` +
        `${(row.pas.safetyNote as string | null) ? 'SAFETY-REJECT ' : ''}` +
        `${failed.length ? `REFUSED by ${failed.map((v) => v.gate).join(', ')}` : 'gates ok'}  ` +
        `#${row.partsHash} (${((Date.now() - t0) / 1000).toFixed(0)} s)`,
    );
    slInput.push({
      label: c.label,
      parts: done.result.parts,
      result: done.result,
      topology: done.topology,
      measurements: done.measurements,
      gates: done.gates,
      disqualified: done.result.disqualified,
    });
  }
  const sl = buildShortlist(slInput, `v30-${arm.naam}`, { targetCurve: FLAT_TARGET });
  shortlists[arm.naam] = {
    overwogen: sl.consideredCount,
    bevroren: sl.rows.length,
    labels: sl.rows.map((r) => r.label),
  };
  console.log(`  ${arm.naam}: shortlist ${sl.rows.length} of ${sl.consideredCount}`);
}

const byLabel = new Map<string, { voor?: Row; na?: Row }>();
for (const r of rows) {
  const e = byLabel.get(r.label) ?? {};
  e[r.arm] = r;
  byLabel.set(r.label, e);
}
const identical = [...byLabel.values()].filter(
  (e) => e.voor && e.na && e.voor.partsHash === e.na.partsHash,
).length;

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      _:
        'V30 — de vloer als zoekdoel, vóór en ná, op hetzelfde veld met dezelfde seed. ' +
        'DOCUMENTATIE en meetverslag, geen acceptatiewaarde: niets assert op dit bestand. ' +
        'Opgewekt door scripts/measure-v30-floor-goal.ts.',
      gegenereerd_op_commit: execSync('git rev-parse HEAD', { cwd: join(HERE, '..') }).toString().trim(),
      gestelde_vloer_ohm: FLOOR,
      seed: CASUS1_V2_SEED,
      oordeelband_hz: CASUS1_V2_BAND_HZ,
      veld: field.field.candidates.length,
      shortlists,
      netwerk_byte_identiek_tussen_de_armen: identical,
      rijen: rows,
    },
    null,
    1,
  )}\n`,
  'utf-8',
);
console.log(`\nwrote ${OUT}`);
console.log(`identical networks between the arms: ${identical} of ${byLabel.size}`);

/* ---- the before/after table, for the casebook ------------------------- */
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2));
console.log('');
console.log(
  `| kandidaat | min \\|Z\\| vóór | min \\|Z\\| ná | vloer vóór | vloer ná | SPL ± vóór | SPL ± ná | RMS vóór | RMS ná | W-M fase vóór | W-M fase ná | M-T fase vóór | M-T fase ná | zelfde netwerk |`,
);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
for (const [label, e] of byLabel) {
  const a = e.voor;
  const b = e.na;
  console.log(
    `| ${label} | ${num(a?.poort_MB_Z.waarde)} | ${num(b?.poort_MB_Z.waarde)} | ` +
      `${a?.poort_MB_Z.geslaagd ? '**ja**' : 'nee'} | ${b?.poort_MB_Z.geslaagd ? '**ja**' : 'nee'} | ` +
      `${num(a?.metrieken.spl_venster_pm_dB)} | ${num(b?.metrieken.spl_venster_pm_dB)} | ` +
      `${num(a?.metrieken.rms_vlakheid_dB)} | ${num(b?.metrieken.rms_vlakheid_dB)} | ` +
      `${num(a?.metrieken.wm_fase_oct)} | ${num(b?.metrieken.wm_fase_oct)} | ` +
      `${num(a?.metrieken.mt_fase_oct)} | ${num(b?.metrieken.mt_fase_oct)} | ` +
      `${a && b && a.partsHash === b.partsHash ? 'ja' : 'nee'} |`,
  );
}
