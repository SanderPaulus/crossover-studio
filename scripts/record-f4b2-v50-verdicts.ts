/**
 * V50 — RECORD THE `verdicts_sinds_V50` BLOCK OF `f4b2_v2_baseline.json`.
 *
 * `npx vite-node scripts/record-f4b2-v50-verdicts.ts` — two short tuner runs on
 * the two-way fixture (the F4b2 parameters), seconds.
 *
 * WHY A SEPARATE BLOCK AND NOT A RE-RECORDING. V50 put two gates on every
 * verdict list (`M-A/part`, `M-L`). The V32 block pins the four gate ids it was
 * recorded on and keeps doing so — `f4cRegression.test.ts` compares it on those
 * four — while this block pins all six. Overwriting the V32 block would have
 * thrown away the claim that V32's verdicts have not moved since V32 in order
 * to record that V50 added two rows; two dated blocks keep both claims (the
 * shape V32 chose when it split the network half from the verdict half).
 *
 * The NETWORK half (`runs`) is NOT touched: the same runs deliver byte-identical
 * networks, and the test asserts that separately.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectEngine } from '../src/lib/engine2/facade.ts';
import { stableJson } from '../src/lib/engine2/optimizer/determinism.ts';
import { runV2Optimization } from '../src/lib/engine2/optimizer/run.ts';
import {
  v2DriverZ,
  v2GateReference,
  v2Responses,
  v2SeedParts,
  V2_GRID,
} from '../src/lib/engine2/optimizer/v2.fixture.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const PATH = join(HERE, '..', 'test-fixtures', 'f4b2_v2_baseline.json');

const baseline = JSON.parse(readFileSync(PATH, 'utf-8')) as {
  parameters: { starts: number; budgetEvaluations: number };
  seeds: number[];
  verdicts_sinds_V50?: unknown;
} & Record<string, unknown>;

const ON = selectEngine(true);
const reference = v2GateReference();
const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();
/* The same weight and choice the test states — a block recorded under other
 * settings would pin a different run. */
const WEIGHT = { phasePriority: 0.35 };
const CHOICE = { staged: { rippleDb: 0.8, phaseDeg: 8 } };

const runs: Record<string, unknown> = {};
for (const seed of baseline.seeds) {
  const r = runV2Optimization({
    selection: ON,
    seedParts: v2SeedParts(),
    grid: V2_GRID,
    wBase,
    tBase,
    driverZ,
    adjust: { offsetMm: 0, trimDb: 0, inverted: false },
    determinism: {
      seed,
      starts: baseline.parameters.starts,
      budgetEvaluations: baseline.parameters.budgetEvaluations,
    },
    gateReference: reference,
    weights: WEIGHT,
    choices: CHOICE,
  });
  runs[String(seed)] = JSON.parse(
    stableJson(
      r.candidates.map((c) => ({
        label: c.label,
        start: c.start,
        gatesFrozen: c.gatesFrozen,
        gatesDerived: c.gatesDerived,
      })),
    ),
  );
  console.log(`seed ${seed}: ${r.candidates.length} candidates, ${r.candidates[0]?.gatesFrozen.length ?? 0} gates each`);
}

baseline.verdicts_sinds_V50 = {
  _:
    'V50 — the verdict half with the two buildability gates (M-A/part, M-L) on every list, ' +
    'unarmed on this fixture (no class, no continuous power, no amplifier peak) and saying so. ' +
    'Recorded beside verdicts_sinds_V32, which keeps pinning the four gate ids it was recorded on. ' +
    'The network half (runs) is untouched.',
  stand: 'V50',
  runs,
};
writeFileSync(PATH, JSON.stringify(baseline, null, 1) + '\n');
console.log(`wrote verdicts_sinds_V50 to ${PATH}`);
