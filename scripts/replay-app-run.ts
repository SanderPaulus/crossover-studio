/**
 * E-2 — REPLAY AN APP RUN IN THE REPOSITORY (the V48 gap).
 *
 *   npx vite-node scripts/replay-app-run.ts <export.json> [--set merged|gated|demo] [--run]
 *
 * The export is what the app's "Export run (JSON)" button writes after a v2
 * run (`runExport.ts`): the stated requirements, the run settings, the FIELD
 * settings (mode, budget, alignments, the per-pair derivation inputs), the
 * window inputs and order derivations the field stood on, every candidate
 * (label, position, cage, order, alignment, window), the run stamp and the
 * shortlist. This script rebuilds the field twice and says, candidate by
 * candidate, whether the repository derives the same one.
 *
 *  LAYER 1 — FROM THE EXPORT ALONE. The generator re-run on the exported
 *  window inputs with the exported settings. A pure function of the block, so
 *  this reproduces exactly or the block is short of something; the stamp's
 *  `choices` component is recomputed and compared.
 *
 *  LAYER 2 — FROM THE REPOSITORY'S MEASUREMENT SET. The report is rebuilt on
 *  casus 1's own files (`--set merged`, the standard since M-1, or `gated`,
 *  the session of 22-08-2026 the demo bundle in the app is a resampling of)
 *  with the exported report settings re-keyed from the app's driver ids to
 *  the repository's, the field is derived from THAT with the exported field
 *  settings and the repository's own measured curves for the natural-slope
 *  fit, and the two fields are compared. Where candidates differ, the window
 *  inputs that made them differ are named pair by pair. This is the replay
 *  proper: the app on its measurement set against the repository on its own.
 *
 *  `--set demo` — the DEMO BUNDLE the app ships (`src/demo3way.ts`: the same
 *  session resampled to 500 points, the woofer pair complex-summed), taken
 *  through the app's own adapter (`buildEngineV2Input`) exactly as the browser
 *  takes it. On the same files the repository must derive the same candidates
 *  to the last digit; against `gated` the resampling moves the breakup heights
 *  by hundredths of a dB and the positions by a few tenths of a hertz, and
 *  the script says so field by field. Measured 06-09-2026 (E-2).
 *
 *  `--run` — tune every replayed candidate through `handleV2Request`, the way
 *  the corpus generator does, with the exported gates, budgets, seed, target
 *  curve and chain declaration, and print the shortlist beside the exported
 *  one. Hours for a full field, minutes for an exploration. Bytes are not
 *  promised across machines (V46, A5e.4): what is compared is which labels
 *  qualified, and the tolerance classes do the rest.
 *
 * WHAT IS COMPARED IS CANDIDATES, NOT BYTES. A field is labels, positions,
 * orders and alignments, and a field is a field on any machine.
 */

import { readFileSync } from 'node:fs';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import { buildReport, type ReportSettings } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { buildCandidateField, type PairDerivationInput } from '../src/lib/engine2/predesign/candidateField.ts';
import { describeFieldMode } from '../src/lib/engine2/predesign/fieldMode.ts';
import {
  RUN_EXPORT_FORMAT,
  compareCandidates,
  compareWindowInputs,
  exportedCandidates,
  fieldChoicesDigest,
  replayField,
  type RunExport,
} from '../src/lib/engine2/optimizer/runExport.ts';
import { digest, stableJson, stampRun, resolveDeterminism } from '../src/lib/engine2/optimizer/determinism.ts';
import { gateSettingsKey } from '../src/lib/engine2/optimizer/gates.ts';
import { budgetSettingsKey } from '../src/lib/engine2/optimizer/bounds.ts';
import { measurementFactsKey } from '../src/lib/engine2/optimizer/measurementFacts.ts';
import { buildShortlist, type ShortlistInput } from '../src/lib/engine2/optimizer/shortlist.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import { casus1ChainInput, casus1V2Declaration, casus1V2Facts, CASUS1_V2_SETTINGS } from '../src/lib/engine2/casus1V2.fixture.ts';
import type { Chain3Input, Chain3Result } from '../src/lib/threeWayChain.ts';
import type { GeneratedCandidate } from '../src/lib/engine2/predesign/candidates.ts';
import { buildEngineV2Input, type AdapterBranch, type AdapterGeometry, type AdapterResponse } from '../src/lib/engine2/appAdapter.ts';
import type { Manifest } from '../src/lib/engine2/ingest/manifest.ts';
import type { MeasurementFile } from '../src/lib/engine2/ingest/derive.ts';
import { KOAN_3WAY_DEMO } from '../src/demo3way.ts';
import { parseFrd } from '../src/lib/parsers/frd.ts';
import { parseZma } from '../src/lib/parsers/zma.ts';
import { logspace, resample } from '../src/lib/dsp.ts';

/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: npx vite-node scripts/replay-app-run.ts <export.json> [--set merged|gated] [--run]');
  process.exit(2);
}
const setArg = args.find((a) => a.startsWith('--set='))?.slice('--set='.length) ?? (args.includes('--set') ? args[args.indexOf('--set') + 1] : 'merged');
const SET: 'merged' | 'gated' | 'demo' = setArg === 'gated' ? 'gated' : setArg === 'demo' ? 'demo' : 'merged';
const RUN = args.includes('--run');

const exp = JSON.parse(readFileSync(file, 'utf-8')) as RunExport;
if (exp.format !== RUN_EXPORT_FORMAT) {
  console.error(`not a run export: format ${String(exp.format)} (expected ${RUN_EXPORT_FORMAT})`);
  process.exit(2);
}

const line = (s = '') => console.log(s);
const head = (s: string) => {
  line();
  line(`=== ${s}`);
};

head(`run export ${file}`);
line(`engine ${exp.engine.label} ${exp.engine.version}, exported ${exp.exportedAt}, session "${exp.session}"`);
line(`field mode ${exp.field.mode}: ${exp.field.candidates.length} candidates, budget ${exp.field.settings.chainBudget}, ` +
  `policies ${exp.field.settings.positionPolicy ?? 'spread'} / ${exp.field.settings.alignmentPolicy ?? 'every-order'}, ` +
  `alignments ${exp.field.settings.alignments.map((a) => `${a.kind}${a.order}`).join(',')}`);
line(`stamp ${exp.stamp ? `${exp.stamp.status} — ${exp.stamp.fingerprint}` : 'none (exported before the run ended)'}`);
line(`drivers ${JSON.stringify(exp.drivers.idsByRole)}; files: ${exp.drivers.files.map((f) => `${f.driver}/${f.kind}${f.angleDeg !== undefined ? `@${f.angleDeg}` : ''}=${f.file}`).join(', ')}`);
line(`gates ${stableJson(gateSettingsKey(exp.run.gates))}`);
line(`budgets ${stableJson(budgetSettingsKey(exp.run.budgets))}`);
line(`determinism ${stableJson(exp.run.determinism)}; target curve ${stableJson(exp.run.targetCurve ?? null)}; judge band ${stableJson(exp.run.judgeBandHz ?? null)}`);
for (const p of exp.field.perPair) {
  line(`  ${p.pair}: stated order ${p.statedOrder ?? '—'}, M-C ${p.maxDriveOnFsDb ?? '—'} dB, slopes ${p.lowerTargetSlopeDbPerOct ?? '—'}/${p.upperTargetSlopeDbPerOct ?? '—'} dB/oct, curves ${p.lowerCurveGiven ? 'L' : '-'}${p.upperCurveGiven ? 'U' : '-'}`);
}

/* ------------------------------------------------------------------ *
 * Layer 1 — the field from the export alone
 * ------------------------------------------------------------------ */

head('layer 1 — the field from the export alone');
const replayed = replayField(exp);
line(describeFieldMode(replayed));
const cmp1 = compareCandidates(exp.field.candidates, exportedCandidates(replayed));
line(`candidates: ${cmp1.matched.length} matched, ${cmp1.missing.length} missing, ${cmp1.extra.length} extra, ${cmp1.changed.length} changed → ${cmp1.same ? 'SAME' : 'DIFFERENT'}`);
for (const c of cmp1.changed) line(`  changed ${c.label}: ${c.what.join('; ')}`);
for (const l of cmp1.missing) line(`  missing ${l}`);
for (const l of cmp1.extra) line(`  extra ${l}`);
const choicesRecorded = exp.stamp?.components.find((c) => c.name === 'choices')?.value ?? null;
const choicesReplayed = fieldChoicesDigest(replayed);
line(`choices digest: export key ${digest(exp.field.key)}, replay ${choicesReplayed}` +
  (choicesRecorded ? `, stamp ${choicesRecorded} → ${choicesReplayed === choicesRecorded ? 'SAME' : 'DIFFERENT'}` : ''));

/* ------------------------------------------------------------------ *
 * Layer 2 — the field from the repository's measurement set
 * ------------------------------------------------------------------ */

head(`layer 2 — the field from the repository's casus-1 set (${SET})`);
const golden = loadGolden();

/* The app keys its settings by ITS driver ids (the netlist's model names, or
 * the role names without a filter); the repository's casus-1 manifests key by
 * 'woofer', 'mid', 'tweeter' and the demo bundle through the adapter by the
 * role names. Re-key everything through the role map the export carries. */
const REPO_ID: Record<'low' | 'mid' | 'high', string> =
  SET === 'demo' ? { low: 'low', mid: 'mid', high: 'high' } : { low: 'woofer', mid: 'mid', high: 'tweeter' };
const appToRepo: Record<string, string> = {};
for (const role of ['low', 'mid', 'high'] as const) {
  const id = exp.drivers.idsByRole[role];
  if (id !== undefined) appToRepo[id] = REPO_ID[role];
}
const rekey = (id: string): string => appToRepo[id] ?? id;
const rekeyRecord = <T,>(r: Record<string, T> | undefined): Record<string, T> | undefined =>
  r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [rekey(k), v])) : undefined;
const rekeyPair = <T,>(r: Record<string, T> | undefined): Record<string, T> | undefined =>
  r
    ? Object.fromEntries(
        Object.entries(r).map(([k, v]) => {
          const [a, b] = k.split('|');
          return [b !== undefined ? ctcKey(rekey(a), rekey(b)) : k, v];
        }),
      )
    : undefined;
const rs = exp.reportSettings;
const settings: ReportSettings = {
  ...rs,
  ...(rekeyPair(rs.orderByPair) ? { orderByPair: rekeyPair(rs.orderByPair)! } : {}),
  ...(rekeyPair(rs.maxCrossingHzByPair) ? { maxCrossingHzByPair: rekeyPair(rs.maxCrossingHzByPair)! } : {}),
  ...(rekeyRecord(rs.reOhmByDriver) ? { reOhmByDriver: rekeyRecord(rs.reOhmByDriver)! } : {}),
  ...(rekeyRecord(rs.maxDriveOnFsDbByDriver) ? { maxDriveOnFsDbByDriver: rekeyRecord(rs.maxDriveOnFsDbByDriver)! } : {}),
  ...(rekeyRecord(rs.driverCardByDriver) ? { driverCardByDriver: rekeyRecord(rs.driverCardByDriver)! } : {}),
  ...(rekeyRecord(rs.responseDriveByDriver) ? { responseDriveByDriver: rekeyRecord(rs.responseDriveByDriver)! } : {}),
  ...(rekeyRecord(rs.wiringByDriver) ? { wiringByDriver: rekeyRecord(rs.wiringByDriver)! } : {}),
  ...(rekeyRecord(rs.coilDcrFamilyByDriver) ? { coilDcrFamilyByDriver: rekeyRecord(rs.coilDcrFamilyByDriver)! } : {}),
};
/* The woofer's meter reading is a casus-1 fact the app carries in its A5a
 * block; when the export has none the repository's own is used and said. */
if (!settings.reOhmByDriver?.[REPO_ID.low]) {
  settings.reOhmByDriver = { ...(settings.reOhmByDriver ?? {}), [REPO_ID.low]: CASUS1_WOOFER_DC_OHM };
  line(`note: the export states no measured R_e for the lowest way; the repository's ${CASUS1_WOOFER_DC_OHM} Ω is used`);
}
/* THE MEASUREMENT SET. The two casus-1 manifests come from the fixture; the
 * demo bundle goes through the app's adapter, branch by branch, as
 * `App.tsx`'s `buildV2Report` builds it — no filter (so the ids are the role
 * names, as in the browser without a design), the exported geometry (or the
 * demo cabinet's when the export predates the field), the exported report
 * settings keyed by role. */
const demoBranches = (): AdapterBranch[] => {
  const D = KOAN_3WAY_DEMO;
  const asResponse = (name: string, raw: string): AdapterResponse => {
    const f = parseFrd(raw);
    return { name, freq: f.freq, spl: f.spl, phaseDeg: f.phase, comments: f.meta.rawComments };
  };
  const branch = (role: 'low' | 'mid' | 'high', b: typeof D.low | typeof D.mid | typeof D.high): AdapterBranch => {
    const z = parseZma(b.impedance.raw);
    return {
      role,
      onAxis: asResponse(b.angles[0].file.name, b.angles[0].file.raw),
      offAxis: b.angles.map((a) => ({ hor: a.hor, response: asResponse(a.file.name, a.file.raw) })),
      nearField: 'nearCone' in b && b.nearCone ? [asResponse(b.nearCone.name, b.nearCone.raw)] : [],
      impedance: { name: b.impedance.name, freq: z.freq, magnitude: z.magnitude, phaseDeg: z.phase },
    };
  };
  return [branch('low', D.low), branch('mid', D.mid), branch('high', D.high)];
};
const demoGeometry = (): AdapterGeometry => {
  const c = KOAN_3WAY_DEMO.cabinet;
  const num = (v: string): number | undefined => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const count = (role: 'low' | 'mid' | 'high') => { const n = Number(c.drivers[role].count); return Number.isFinite(n) && n >= 1 ? n : undefined; };
  return {
    verticalMm: { low: num(c.drivers.low.yMm), mid: num(c.drivers.mid.yMm), high: num(c.drivers.high.yMm) },
    arraySpacingMm: { low: (count('low') ?? 1) > 1 ? num(c.drivers.low.spacingMm) : undefined, mid: undefined, high: undefined },
    sourceCount: { low: count('low'), mid: count('mid'), high: count('high') },
    baffleWidthMm: num(c.baffleWidthMm),
  };
};
let manifest: Manifest;
let files: MeasurementFile[];
let report: ReturnType<typeof buildReport>;
if (SET === 'demo') {
  const geometry = exp.geometry ?? demoGeometry();
  if (!exp.geometry) line("note: the export carries no geometry (written before E-2 carried it); the demo cabinet's is used");
  const built = buildEngineV2Input({ sessionId: exp.session, branches: demoBranches(), filter: null, geometry, settings });
  manifest = built.input.manifest;
  files = [...built.input.files];
  report = buildReport(built.input);
} else {
  manifest = casus1Manifest(golden, SET);
  files = casus1Files(manifest);
  report = buildReport({ manifest, files, filter: casus1Filter('HUIDIG', manifest, files, golden), geometry: casus1Geometry(golden), settings });
}
const wis = report.predesign.windowInputs;
line(`windows: ${wis.map((w) => `${w.lower}→${w.upper}`).join(', ')}`);

/* The measured curves for the natural-slope fit of A5d.3(i): the chain input
 * of the fixture on the casus-1 sets; on the demo bundle the on-axis files
 * resampled to a log grid, as the app's sim base is. The fit decides the
 * exact order only, never a position. */
const gridded = SET === 'demo' ? null : casus1ChainInput(manifest, files, golden);
const demoCurve = (driver: string) => {
  const b = driver === 'low' ? KOAN_3WAY_DEMO.low : driver === 'mid' ? KOAN_3WAY_DEMO.mid : driver === 'high' ? KOAN_3WAY_DEMO.high : null;
  if (!b) return null;
  const f = parseFrd(b.angles[0].file.raw);
  const grid = logspace(Math.max(f.freq[0], 10), Math.min(f.freq[f.freq.length - 1], 20000), 500);
  const g = resample(f.freq, f.spl, f.phase, grid);
  return { freq: grid, db: g.spl };
};
const curveOf = (driver: string) => {
  if (!gridded) return demoCurve(driver);
  const g = driver === 'woofer' ? gridded.w : driver === 'mid' ? gridded.m : driver === 'tweeter' ? gridded.t : null;
  return g ? { freq: g.freq, db: g.spl } : null;
};
const perPair: PairDerivationInput[] = wis.map((wi, i) => {
  const p = exp.field.perPair[i];
  return {
    statedOrder: p?.statedOrder ?? null,
    maxDriveOnFsDb: p?.maxDriveOnFsDb ?? null,
    breakupSuppressionDb: p?.breakupSuppressionDb ?? null,
    lowerTargetSlopeDbPerOct: p?.lowerTargetSlopeDbPerOct ?? null,
    upperTargetSlopeDbPerOct: p?.upperTargetSlopeDbPerOct ?? null,
    lowerCurve: p?.lowerCurveGiven ? curveOf(wi.lower) : null,
    upperCurve: p?.upperCurveGiven ? curveOf(wi.upper) : null,
  };
});
const repoField = buildCandidateField({
  windowInputs: wis,
  perPair,
  alignments: exp.field.settings.alignments,
  ...(exp.field.settings.chainBudget !== null ? { chainBudget: exp.field.settings.chainBudget } : {}),
  minSpacingOctaves: exp.field.settings.minSpacingOctaves,
  ...(exp.field.settings.positionPolicy !== undefined ? { positionPolicy: exp.field.settings.positionPolicy } : {}),
  ...(exp.field.settings.alignmentPolicy !== undefined ? { alignmentPolicy: exp.field.settings.alignmentPolicy } : {}),
});
line(describeFieldMode(repoField.field));

/* Labels carry the app's driver ids; compare on the repository's. */
const exportedOnRepoIds = exp.field.candidates.map((c) => ({
  label: c.crossings.map((x) => `${rekey(x.lower)}→${rekey(x.upper)} ${c.label.split(' · ')[c.crossings.indexOf(x)]?.split(' ').slice(1).join(' ') ?? ''}`).join(' · '),
  crossings: c.crossings.map((x) => ({ ...x, lower: rekey(x.lower), upper: rekey(x.upper), pair: `${rekey(x.lower)}→${rekey(x.upper)}` })),
}));
const labelsRenamed = exportedOnRepoIds.some((c, i) => c.label !== exp.field.candidates[i].label);
if (labelsRenamed) line('note: the app named its drivers differently; labels are compared on the repository\'s ids');
const cmp2 = compareCandidates(exportedOnRepoIds, exportedCandidates(repoField.field));
line(`candidates: ${cmp2.matched.length} matched, ${cmp2.missing.length} missing, ${cmp2.extra.length} extra, ${cmp2.changed.length} changed → ${cmp2.same ? 'SAME' : 'DIFFERENT'}`);
for (const c of cmp2.changed) line(`  changed ${c.label}: ${c.what.join('; ')}`);
for (const l of cmp2.missing) line(`  missing ${l}`);
for (const l of cmp2.extra) line(`  extra ${l}`);
const wisRenamed = exp.field.windowInputs.map((w) => ({ ...w, lower: rekey(w.lower), upper: rekey(w.upper) }));
const wdiff = compareWindowInputs(wisRenamed, wis);
line(`window inputs: ${wdiff.length === 0 ? 'identical' : `${wdiff.length} differences`}`);
for (const d of wdiff) line(`  ${d}`);
for (const a of repoField.field.axes) {
  line(`  ${a.pairLabel}: orders ${a.orders.join(',')} at ${a.positionsByOrder.map((p) => p.hz.join('/')).join(' | ')} Hz`);
}

/* ------------------------------------------------------------------ *
 * --run — tune the replayed candidates the way the corpus generator does
 * ------------------------------------------------------------------ */

if (RUN && !gridded) {
  head('--run is only available on the casus-1 sets (merged, gated): the demo bundle has no chain input in the repository');
}
if (RUN && gridded) {
  head('--run — tuning the replayed candidates through handleV2Request');
  const facts = casus1V2Facts(report, manifest, files);
  const rows: ShortlistInput<Chain3Result>[] = [];
  const t0 = Date.now();
  repoField.field.candidates.forEach((c: GeneratedCandidate, n: number) => {
    const input: Chain3Input = {
      grid: [...gridded.grid],
      w: gridded.w,
      m: gridded.m,
      t: gridded.t,
      driverZ: gridded.driverZ,
      tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
      midAdjust: {},
      xoLow: c.crossings[0].hz,
      xoHigh: c.crossings[c.crossings.length - 1].hz,
      xoLowRange: c.crossings[0].cageHz,
      xoHighRange: c.crossings[c.crossings.length - 1].cageHz,
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
        gates: { ...exp.run.gates },
        budgets: { ...exp.run.budgets },
        determinism: { ...exp.run.determinism },
        ...(exp.run.targetCurve ? { targetCurve: exp.run.targetCurve } : {}),
        ...(exp.run.judgeBandHz ? { judgeBandHz: exp.run.judgeBandHz } : {}),
        ...(exp.run.amplifierPowerW !== undefined ? { amplifierPowerW: exp.run.amplifierPowerW } : {}),
      },
      candidate: casus1V2Declaration(c, gridded.safety),
    };
    const tc = Date.now();
    const wire = structuredClone({ id: n, kind: 'v2Chain3One' as const, payload });
    const collected: { result: Chain3Result; measurements: ShortlistInput<Chain3Result>['measurements']; topology: ShortlistInput<Chain3Result>['topology']; gates: ShortlistInput<Chain3Result>['gates']; rejection: ShortlistInput<Chain3Result>['rejection'] }[] = [];
    handleV2Request(wire, (m: V2Response) => {
      if (m.kind === 'error') throw new Error(m.message);
      if (m.kind === 'done') collected.push(m.data as (typeof collected)[number]);
    });
    const done = collected[0];
    if (!done) throw new Error(`candidate ${c.label} produced nothing`);
    rows.push({
      label: c.label,
      parts: done.result.parts,
      result: done.result,
      topology: done.topology,
      measurements: done.measurements,
      gates: done.gates,
      disqualified: done.result.disqualified,
      ...(done.rejection ? { rejection: done.rejection } : {}),
    });
    line(`  ${n + 1}/${repoField.field.candidates.length} ${c.label}: ${done.rejection ? `REFUSED (${done.rejection.kinds.join(',')})` : `delivered, ${done.result.parts.length} parts`} in ${((Date.now() - tc) / 1000).toFixed(0)} s`);
  });
  const stamp = stampRun(
    {
      determinism: resolveDeterminism(exp.run.determinism),
      design: 'replay',
      measurements: stableJson({ set: SET }),
      gates: stableJson(gateSettingsKey(exp.run.gates)),
      bounds: stableJson(budgetSettingsKey(exp.run.budgets)),
      tuning: 'replay',
      choices: exp.field.key,
      facts: stableJson(measurementFactsKey(facts)),
    },
    'completed',
  );
  const shortlist = buildShortlist(rows, stamp.fingerprint, {
    ...(exp.run.targetCurve ? { targetCurve: exp.run.targetCurve } : {}),
  });
  line(`shortlist: ${shortlist.rows.map((r) => r.label).join(' | ') || '(nothing qualified)'}`);
  line(`refused: ${shortlist.rejected.map((r) => `${r.label} [${r.kinds.join(',')}]`).join(' | ') || 'none'}`);
  if (exp.shortlist) {
    line(`app shortlist: ${exp.shortlist.rows.join(' | ') || '(nothing qualified)'}`);
    line(`app refused: ${exp.shortlist.rejected.map((r) => `${r.label} [${r.kinds.join(',')}]`).join(' | ') || 'none'}`);
  }
  line(`total ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

head('verdict');
line(`layer 1 (the block suffices): ${cmp1.same ? 'SAME' : 'DIFFERENT'}`);
line(`layer 2 (the repository derives the same candidates on the ${SET} set): ${cmp2.same ? 'SAME' : 'DIFFERENT'}`);
process.exit(cmp1.same && cmp2.same ? 0 : 1);
