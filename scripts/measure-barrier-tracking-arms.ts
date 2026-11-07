/**
 * DE GEVOLGDE BARRIÈREBRON TEGEN DE HUIDIGE, ALS VOLLEDIGE KETENRUN (07-11-2026).
 *
 * Eén casus-1-kandidaat door de echte route (`handleV2Request`, kind
 * `v2Chain3One`), met de verklaring ongewijzigd op ÉÉN sleutel na:
 * `zFloorBarrierSource` = `'safety-extended-refined'` (wat de route afleidt) of
 * `'safety-extended-refined-tracked'`. Schrijft per (kandidaat, arm) een shard
 * met de wandklok, het evaluatietal, geleverd of geweigerd, de metingen, de
 * poortoordelen en een digest van de onderdelen. `BT_COMPARE=1` zet ze naast
 * elkaar. Raakt de engine niet.
 *
 *   BT_ONLY=<kandidaat> BT_ARM=refined|tracked npx vite-node scripts/measure-barrier-tracking-arms.ts
 *   BT_COMPARE=1 npx vite-node scripts/measure-barrier-tracking-arms.ts
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { VxpPart } from '../src/lib/parsers/vxp.ts';
import type { V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import {
  CASUS1_WOOFER_DC_OHM, casus1Files, casus1Filter, casus1Geometry, casus1Manifest, loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_BUILDABILITY, CASUS1_COIL_DCR_SETTINGS, CASUS1_CONTINUOUS_POWER_W, CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS, CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER, CASUS1_TARGET_CURVE, CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS, CASUS1_V2_GATES, CASUS1_V2_SEED, CASUS1_V2_SETTINGS, CASUS1_WINDOW_SETTINGS,
  casus1ChainInput, casus1Field, casus1V2Declaration, casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { handleV2Request, type V2Chain3Payload } from '../src/lib/engine2/optimizer/worker.ts';
import type { Chain3Input } from '../src/lib/threeWayChain.ts';

const DIR = 'test-fixtures/.barrier-arms';
if (process.env.BT_COMPARE) {
  const rows = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf-8')));
  rows.sort((a, b) => a.candidate - b.candidate || a.arm.localeCompare(b.arm));
  console.log('kand  arm       label                                          s      evals    geleverd  rms     ±      M-K            min|Z|  delen  zelfde netwerk');
  for (const r of rows) {
    const twin = rows.find((x) => x.candidate === r.candidate && x.arm !== r.arm);
    console.log(
      `${String(r.candidate).padStart(4)}  ${r.arm.padEnd(8)}  ${r.label.padEnd(45)}  ${String(r.seconds).padStart(6)}  ${String(r.evaluations).padStart(8)}  ` +
        `${(r.delivered ? 'ja' : 'NEE ' + r.refusal.kinds.join('+')).padEnd(8)}  ${String(r.rmsDb).padStart(5)}  ${String(r.windowPmDb).padStart(5)}  ` +
        `${r.phaseTracking.map((p: { meanAbsDeg: number }) => p.meanAbsDeg).join('/').padEnd(13)}  ${String(r.minZOhm).padStart(6)}  ${String(r.parts).padStart(5)}  ${twin ? (twin.partsDigest === r.partsDigest ? 'ja' : 'nee') : '—'}`,
    );
  }
  process.exit(0);
}
const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const report = buildReport({
  manifest, files, filter: casus1Filter('HUIDIG', manifest, files, golden), geometry: casus1Geometry(golden),
  settings: {
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER },
    ...CASUS1_WINDOW_SETTINGS, ...CASUS1_BUILDABILITY, ...CASUS1_LEVEL_WORK_SETTINGS,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM }, targetCurve: CASUS1_TARGET_CURVE,
    ...CASUS1_EXCURSION, ...CASUS1_COIL_DCR_SETTINGS,
  },
});
const facts = casus1V2Facts(report, manifest, files);
const field = casus1Field(report);
const gridded = casus1ChainInput(manifest, files, golden);
const ONLY = Number(process.env.BT_ONLY ?? 0);
const cand = field.field.candidates[ONLY];
const declaration = casus1V2Declaration(cand, gridded.safety);
const input: Chain3Input = {
  grid: [...gridded.grid], w: gridded.w, m: gridded.m, t: gridded.t, driverZ: gridded.driverZ,
  tAdjust: { offsetMm: 0, trimDb: 0, inverted: false }, midAdjust: {},
  xoLow: cand.crossings[0].hz, xoHigh: cand.crossings[1].hz,
  xoLowRange: cand.crossings[0].cageHz, xoHighRange: cand.crossings[1].cageHz, label: cand.label,
  settings: {
    ...CASUS1_V2_SETTINGS, safety: gridded.safety,
    structureLow: { kind: cand.crossings[0].alignment.kind, order: cand.crossings[0].alignment.order },
    structureHigh: { kind: cand.crossings[1].alignment.kind, order: cand.crossings[1].alignment.order },
    xoFloorPairs: cand.crossings.map((x) => x.windowHz[0]),
  } as unknown as Chain3Input['settings'],
};
const payload: V2Chain3Payload = {
  input,
  v2: {
    ...facts, gates: { ...CASUS1_V2_GATES }, budgets: { ...CASUS1_V2_BUDGETS },
    determinism: { seed: CASUS1_V2_SEED }, targetCurve: CASUS1_TARGET_CURVE, judgeBandHz: CASUS1_V2_BAND_HZ,
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
  },
  candidate: declaration,
};
const ARM = process.env.BT_ARM === 'tracked' ? 'tracked' : 'refined';
const stated = payload.candidate!.declaration.stated as Record<string, unknown>;
if (stated.zFloorBarrierSource !== 'safety-extended-refined')
  throw new Error(`de route leidt ${String(stated.zFloorBarrierSource)} af, niet safety-extended-refined`);
if (ARM === 'tracked') stated.zFloorBarrierSource = 'safety-extended-refined-tracked';
const out: Record<string, unknown>[] = [];
const t0 = Date.now();
handleV2Request(structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload }), (m: V2Response) => {
  if (m.kind === 'error') throw new Error(m.message);
  if (m.kind === 'done') out.push(m.data as Record<string, unknown>);
});
const d = out[0] as {
  result: { parts: VxpPart[]; notes?: string[]; net: { after: { rippleDb: number; phaseDeg: number }; evaluations: number; zFloorSourceNote?: string } };
  measurements: { response: { rmsDeviationDb: number; windowPlusMinusDb: number } | null; phaseTracking: { subject: string; meanAbsDeg: number }[] };
  gates: { gate: string; subject: string; value: number | null; active: boolean; pass: boolean }[];
  rejection: { kinds: string[]; reason: string } | null;
};
if (!d) throw new Error('geen resultaat');
const parts = d.rejection ? null : d.result.parts;
const stable = (x: unknown): string => JSON.stringify(x, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
const hash = (s: string): string => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const row = {
  candidate: ONLY,
  arm: ARM,
  label: cand.label,
  seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
  evaluations: d.result.net.evaluations,
  delivered: d.rejection === null,
  refusal: d.rejection ? { kinds: [...d.rejection.kinds], reason: d.rejection.reason } : null,
  rmsDb: d.measurements.response ? Number(d.measurements.response.rmsDeviationDb.toFixed(3)) : null,
  windowPmDb: d.measurements.response ? Number(d.measurements.response.windowPlusMinusDb.toFixed(3)) : null,
  phaseTracking: d.measurements.phaseTracking.map((p) => ({ subject: p.subject, meanAbsDeg: Number(p.meanAbsDeg.toFixed(2)) })),
  minZOhm: (() => { const v = d.gates.find((g) => g.gate === 'M-B/|Z|')?.value; return v == null ? null : Number(v.toFixed(3)); })(),
  gates: d.gates.filter((g) => g.active).map((g) => ({ gate: g.gate, subject: g.subject, pass: g.pass, value: g.value === null ? null : Number(g.value.toFixed(3)) })),
  parts: parts ? parts.filter((p) => p.type !== 'Driver' && p.type !== 'Generator' && !p.open && !p.shorted).length : null,
  partsDigest: parts ? hash(stable(parts)) : null,
  tuner: { rippleDb: Number(d.result.net.after.rippleDb.toFixed(3)), phaseDeg: Number(d.result.net.after.phaseDeg.toFixed(2)) },
  note: d.result.net.zFloorSourceNote ?? null,
};
mkdirSync(DIR, { recursive: true });
writeFileSync(`${DIR}/${ONLY}-${ARM}.json`, JSON.stringify(row, null, 1) + '\n');
console.log(`klaar: kandidaat ${ONLY} ${ARM} ${row.seconds} s, ${row.evaluations} evaluaties, ${row.delivered ? 'geleverd' : 'GEWEIGERD'}`);
