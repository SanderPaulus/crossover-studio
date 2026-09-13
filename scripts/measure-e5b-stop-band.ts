/**
 * E-5b — WHAT THE RIPPLE STOP-GOAL COSTS, AND WHAT NARROWING ITS BAND BUYS.
 *
 * `E5B_ONLY=<n> npx vite-node scripts/measure-e5b-stop-band.ts` — ONE full
 * chain run per arm on casus 1's merged set, through `handleV2Request` exactly
 * as the generator does. `E5B_ARM=judged|from-lowest-crossing` runs one arm;
 * without it both run, in order, so the before/after is one measurement on one
 * machine. `E5B_DRY=1` prints the payload difference and runs nothing.
 *
 * WHY IT EXISTS. E-5 measured that a three-way candidate costs the app more
 * than 55 minutes and OFFERED AN EXPLANATION IT HAD NOT MEASURED: that the
 * staged pass's 2.5 dB ripple target is unreachable once the judged band
 * reaches the bass, so the escalation ladder never stops early. This script is
 * what that explanation should have rested on, and the first thing it
 * establishes is that the explanation is wrong on casus 1 — see the entry.
 *
 * THE ARMS DIFFER IN ONE KEY. `rippleTargetBand` is a CHOICE (F4c): `'judged'`
 * is the historic reading, `'from-lowest-crossing'` is what Sander stated on
 * 13-09-2026. Everything else — the field, the seed, the gates, the budgets,
 * the grid, the judged band — is the same object in both arms, so a difference
 * between them is the key and nothing else.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CASUS1_WOOFER_DC_OHM,
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from '../src/lib/engine2/casus1.fixture.ts';
import {
  CASUS1_BUILDABILITY,
  CASUS1_COIL_DCR_SETTINGS,
  CASUS1_CONTINUOUS_POWER_W,
  CASUS1_EXCURSION,
  CASUS1_LEVEL_WORK_SETTINGS,
  CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER,
  CASUS1_TARGET_CURVE,
  CASUS1_V2_BAND_HZ,
  CASUS1_V2_BUDGETS,
  CASUS1_V2_GATES,
  CASUS1_V2_SEED,
  CASUS1_V2_SETTINGS,
  CASUS1_WINDOW_SETTINGS,
  casus1ChainInput,
  casus1Field,
  casus1V2Declaration,
  casus1V2Facts,
} from '../src/lib/engine2/casus1V2.fixture.ts';
import { buildReport } from '../src/lib/engine2/report.ts';
import { ctcKey } from '../src/lib/engine2/metrics/types.ts';
import { handleV2Request, type V2Chain3Payload, type V2Response } from '../src/lib/engine2/optimizer/worker.ts';
import { rippleStopBand, RIPPLE_STOP_MARGIN_OCTAVES } from '../src/lib/rippleTargetBand.ts';
import type { Chain3Input, Chain3Result } from '../src/lib/threeWayChain.ts';
import type { RippleTargetBand } from '../src/lib/netOptimizer.ts';
import type { ChoiceDeclaration } from '../src/lib/engine2/optimizer/choices.ts';
import type { GateVerdict } from '../src/lib/engine2/optimizer/gates.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'test-fixtures', 'casus1_e5b_stopband.json');

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
    ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    ...(Object.keys(CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER).length > 0
      ? { maxDriveOnFsDbByDriver: { ...CASUS1_MAX_DRIVE_ON_FS_DB_BY_DRIVER } }
      : {}),
    ...CASUS1_WINDOW_SETTINGS,
    ...CASUS1_BUILDABILITY,
    ...CASUS1_LEVEL_WORK_SETTINGS,
    orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
    reOhmByDriver: { woofer: CASUS1_WOOFER_DC_OHM },
    targetCurve: CASUS1_TARGET_CURVE,
    ...CASUS1_EXCURSION,
    ...CASUS1_COIL_DCR_SETTINGS,
  },
});
const facts = casus1V2Facts(report, manifest, files);
const field = casus1Field(report);
const gridded = casus1ChainInput(manifest, files, golden);

/** Which candidate. Default the FIRST, so a bare run is reproducible. */
const ONLY = Math.max(0, Number(process.env.E5B_ONLY ?? 0));
const cand = field.field.candidates[ONLY];
if (!cand) throw new Error(`E-5b: no candidate ${ONLY} in a field of ${field.field.candidates.length}`);

function payloadFor(arm: RippleTargetBand): V2Chain3Payload {
  const declaration = casus1V2Declaration(cand, gridded.safety);
  const stop = rippleStopBand(
    [cand.crossings[0].hz],
    [CASUS1_V2_BAND_HZ[0], CASUS1_V2_BAND_HZ[1]],
  );
  const input: Chain3Input = {
    grid: [...gridded.grid],
    w: gridded.w,
    m: gridded.m,
    t: gridded.t,
    driverZ: gridded.driverZ,
    tAdjust: { offsetMm: 0, trimDb: 0, inverted: false },
    midAdjust: {},
    xoLow: cand.crossings[0].hz,
    xoHigh: cand.crossings[1].hz,
    xoLowRange: cand.crossings[0].cageHz,
    xoHighRange: cand.crossings[1].cageHz,
    label: cand.label,
    settings: {
      ...CASUS1_V2_SETTINGS,
      safety: gridded.safety,
      structureLow: { kind: cand.crossings[0].alignment.kind, order: cand.crossings[0].alignment.order },
      structureHigh: { kind: cand.crossings[1].alignment.kind, order: cand.crossings[1].alignment.order },
      xoFloorPairs: cand.crossings.map((x) => x.windowHz[0]),
    } as unknown as Chain3Input['settings'],
  };
  return {
    input,
    v2: {
      ...facts,
      gates: { ...CASUS1_V2_GATES },
      budgets: { ...CASUS1_V2_BUDGETS },
      determinism: { seed: CASUS1_V2_SEED },
      targetCurve: CASUS1_TARGET_CURVE,
      judgeBandHz: CASUS1_V2_BAND_HZ,
      ...(CASUS1_CONTINUOUS_POWER_W !== null ? { amplifierPowerW: CASUS1_CONTINUOUS_POWER_W } : {}),
    },
    /* THE ONE KEY THE ARMS DIFFER IN, stated on the declaration so the run
     * records it in its own fingerprint rather than receiving it in silence. */
    candidate: {
      ...declaration,
      declaration: {
        ...declaration.declaration,
        stated: {
          ...declaration.declaration.stated,
          rippleTargetBand: arm,
          ...(arm === 'from-lowest-crossing' && stop ? { rippleTargetBandHz: stop } : {}),
        },
      } as ChoiceDeclaration,
    },
  };
}

interface ArmRow {
  arm: RippleTargetBand;
  seconds: number;
  evaluations: number;
  tuned: number;
  rippleDb: number;
  phaseDeg: number;
  zMinOhm: number | null;
  parts: number;
  removed: string[];
  added: string[];
  refusedBy: string[];
}

function runArm(arm: RippleTargetBand): ArmRow {
  const payload = payloadFor(arm);
  const wire = structuredClone({ id: 1, kind: 'v2Chain3One' as const, payload });
  const collected: { result: Chain3Result; gates: GateVerdict[] }[] = [];
  const t0 = Date.now();
  handleV2Request(wire, (m: V2Response) => {
    if (m.kind === 'error') throw new Error(m.message);
    if (m.kind === 'done') collected.push(m.data as (typeof collected)[number]);
  });
  const seconds = (Date.now() - t0) / 1000;
  const done = collected[0];
  if (!done) throw new Error(`E-5b: arm ${arm} produced nothing`);
  const net = done.result.net;
  return {
    arm,
    seconds: Number(seconds.toFixed(1)),
    evaluations: net.evaluations,
    tuned: net.tuned,
    rippleDb: Number(net.after.rippleDb.toFixed(3)),
    phaseDeg: Number(net.after.phaseDeg.toFixed(1)),
    zMinOhm: net.after.zMinOhm === null || net.after.zMinOhm === undefined ? null : Number(net.after.zMinOhm.toFixed(3)),
    parts: done.result.parts?.length ?? 0,
    removed: [...(net.removed ?? [])],
    added: [...(net.added ?? [])],
    refusedBy: done.gates.filter((v) => v.active && !v.pass).map((v) => `${v.gate} (${v.subject})`),
  };
}

const stop = rippleStopBand([cand.crossings[0].hz], [CASUS1_V2_BAND_HZ[0], CASUS1_V2_BAND_HZ[1]]);
console.log(`E-5b — the ripple stop-goal's band, on ${cand.label}`);
console.log(`  judged band   ${CASUS1_V2_BAND_HZ[0].toFixed(1)}–${CASUS1_V2_BAND_HZ[1]} Hz`);
console.log(
  `  stop band     ${stop ? `${stop[0].toFixed(1)}–${stop[1]} Hz` : 'none'} ` +
    `(lowest stated crossing ${cand.crossings[0].hz.toFixed(1)} Hz minus ${RIPPLE_STOP_MARGIN_OCTAVES} octave)`,
);
console.log(`  stop goal     ripple ≤ ${CASUS1_V2_SETTINGS.targets.rippleDb} dB, phase ≤ ${CASUS1_V2_SETTINGS.targets.phaseDeg}°`);
console.log(`  grid          ${gridded.grid.length} points from ${gridded.grid[0].toFixed(1)} Hz`);

if (process.env.E5B_DRY === '1') {
  const statedOf = (arm: RippleTargetBand): Record<string, unknown> =>
    (payloadFor(arm).candidate?.declaration.stated ?? {}) as Record<string, unknown>;
  const a = statedOf('judged');
  const b = statedOf('from-lowest-crossing');
  console.log('  DRY — the two declarations differ in:');
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = JSON.stringify(a[k]);
    const y = JSON.stringify(b[k]);
    if (x !== y) console.log(`    ${k}: ${x} → ${y}`);
  }
  process.exit(0);
}

const ARMS: RippleTargetBand[] =
  process.env.E5B_ARM === 'judged'
    ? ['judged']
    : process.env.E5B_ARM === 'from-lowest-crossing'
      ? ['from-lowest-crossing']
      : ['judged', 'from-lowest-crossing'];

const rows: ArmRow[] = [];
for (const arm of ARMS) {
  console.log(`\n  running arm ${arm} …`);
  const r = runArm(arm);
  rows.push(r);
  console.log(
    `    ${r.seconds.toFixed(0)} s · ${r.evaluations} evaluations · ${r.tuned} free values · ` +
      `ripple ${r.rippleDb.toFixed(2)} dB · phase ${r.phaseDeg.toFixed(1)}° · ` +
      `min |Z| ${r.zMinOhm === null ? '—' : r.zMinOhm.toFixed(2) + ' Ω'} · ${r.parts} parts` +
      (r.refusedBy.length > 0 ? ` · REFUSED by ${r.refusedBy.join(', ')}` : ''),
  );
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      _wat: 'E-5b — één casus-1-kandidaat door de keten, met en zonder de gestelde stopband. Alles behalve die ene sleutel is hetzelfde object.',
      kandidaat: cand.label,
      oordeelband_hz: CASUS1_V2_BAND_HZ,
      stopband_hz: stop,
      stopband_marge_octaaf: RIPPLE_STOP_MARGIN_OCTAVES,
      stopdoel: CASUS1_V2_SETTINGS.targets,
      raster_punten: gridded.grid.length,
      armen: rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(`\nwrote ${OUT}`);
