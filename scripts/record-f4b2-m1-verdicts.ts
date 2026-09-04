/**
 * M-1 — RECORD THE `verdicts_sinds_M1` BLOCK OF `f4b2_v2_baseline.json`.
 *
 * `npx vite-node scripts/record-f4b2-m1-verdicts.ts` — two short tuner runs on
 * the two-way fixture (the F4b2 parameters), seconds.
 *
 * WHY A THIRD DATED BLOCK. M-1 repaired `isHighPassProtected` (the filter's
 * transfer into a resistive load, threshold one order over the probe), and on
 * this fixture that removes ONE row from the derived verdict lists: `M-C` on
 * the LOWEST way, which carries no high pass and — per V49 — gets no
 * requirement; it had been classified protected by the driver's own impedance
 * peak, the same artefact that refused 52 of 115 casus-1 candidates. The V32
 * and V50 blocks keep pinning what they pinned on the subjects they carry
 * (`f4cRegression.test.ts` compares them minus that one row and asserts the
 * row is the only difference); this block pins the corrected set in full. The
 * NETWORK half (`runs`) is not touched: the same runs deliver byte-identical
 * networks, asserted separately.
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
  verdicts_sinds_M1?: unknown;
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

baseline.verdicts_sinds_M1 = {
  _:
    'M-1 — the verdict half after the repair of the high-pass-protection rule (filter transfer ' +
    'into a resistive load, threshold one order over the probe): the derived lists no longer ' +
    'carry M-C on the lowest way of this fixture, which has no high pass. All six gates, unarmed ' +
    'here. Recorded beside verdicts_sinds_V32 and verdicts_sinds_V50, which keep pinning what they ' +
    'pinned minus that one row. The network half (runs) is untouched.',
  stand: 'M-1',
  runs,
};
writeFileSync(PATH, JSON.stringify(baseline, null, 1) + '\n');
console.log(`wrote verdicts_sinds_M1 to ${PATH}`);
