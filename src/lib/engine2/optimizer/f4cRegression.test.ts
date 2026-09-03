/**
 * F4c ACCEPTANCE — the border moved, the behaviour did not.
 *
 * F4c narrows what a v2 caller may inherit (`run.ts`'s `tuneOptions` is now the
 * polish half only) and makes the search choices and the grey weights cross
 * NAMED. That is a claim about plumbing, and a claim about plumbing is worth
 * exactly as much as the proof that it changed nothing else.
 *
 * THE BASELINE IS A FILE, and that is the whole point of this file's shape.
 *
 * The first version of this test computed its own baseline: it ran the F4b2
 * CALL SHAPE against the current build and compared it to the F4c call shape.
 * That proves the two shapes agree — which is worth something — but it is not a
 * regression. Both sides move together: a change that altered the delivered
 * network would alter both and the test would stay green. A baseline that is
 * recomputed from the code it is meant to police polices nothing.
 *
 * So the delivered networks are stored in `test-fixtures/f4b2_v2_baseline.json`
 * and read back. From here on any change to the tuner, the chain, the bounds or
 * the search box shows up as a diff against a file that predates it.
 *
 * HOW THE FIXTURE WAS PRODUCED, stated because it is not what the obvious
 * recipe would have been. F4a–F4c were never committed separately — HEAD is
 * still F3c — so there is no F4b2 commit to check out and `git stash` cannot
 * separate the F4c edits from the F4a/F4b/F4b2 edits that sit in the same
 * uncommitted files. The fixture is therefore generated on the F4c tree through
 * the F4b2 CALL SHAPE, and that reproduces the F4b2 network exactly for a reason
 * that can be read off three lines of `run.ts`: the two spreads F4c added are
 * `...(input.choices ?? {})` and `...(input.weights ?? {})`, and on the old
 * shape both inputs are `undefined`, so both contribute nothing. Nothing else
 * F4c touched can reach the network — the narrowed `Omit<>` is erased at
 * runtime, the `choices` fingerprint ingredient is not the network, and the
 * unstated-weight note is prose.
 *
 * BOTH SHAPES ARE PINNED TO THE FILE below, not to each other, so that argument
 * does not have to be taken on trust: if it were wrong, the old shape would
 * disagree with the fixture and say so.
 *
 * TWO SEEDS, because one seed proves one path through the search is unchanged
 * and says nothing about the others. They are asserted to deliver DIFFERENT
 * networks from each other first — otherwise "both unchanged" could be
 * satisfied by a search that ignores its seed, and the regression would be
 * measuring nothing.
 *
 *
 * ── V46: DEZE REPRODUCTIE IS NIET PORTABLE, EN DAT IS GEMETEN ─────────────
 *
 * De vergelijkingen hieronder dragen de tag `[bytes]` en draaien daarom NIET
 * op CI (`npm run test:ci`). Zij vergelijken een LIVE herberekend netwerk
 * byte-voor-byte met een opgeslagen fixture, en zo'n fixture hangt af van de
 * machine en de runtime waarop hij is opgenomen — hier darwin/arm64 onder
 * Node 26, en het fixturebestand zegt dat sinds V46 zelf (`opgenomen_op`).
 *
 * De meting: alleen de RUNTIME wijzigen op dezelfde machine (Node 26 -> 22)
 * verplaatst het ZAAD — een vast netwerk, zonder enige zoektocht — al op het
 * vijfde significante cijfer, en de simplex loopt daarna naar een ander lokaal
 * optimum: L1 3,005 -> 3,034 mH. Afronden repareert dat niet; dat is een ander
 * ontwerp, en een vergelijking die het doorlaat bewaakt niets meer.
 *
 * A5e.4 IS GEPRECISEERD EN NIET GESCHONDEN: byte-identiek geldt per (machine,
 * runtime); over machines heen geldt equivalentie binnen de tolerantieklassen.
 * Deze test blijft de VERPLICHTE lokale acceptatie vóór elke commit — zij is
 * niet zwakker geworden, alleen niet overal draaibaar. Wat CI in plaats
 * hiervan bewaakt en waarom dat de natuurkunde dekt, staat in
 * `ciLayer.test.ts`; die bewaakt ook dat deze tag niet stil groeit.
 * ── V32 SPLIT THIS FILE IN TWO, AND KEPT THE STRONGER HALF WHOLE ──────────
 *
 * V32 moved WHERE an electrical gate measures: off this fixture's response grid
 * (210–19 000 Hz) and onto the drivers' own measured impedance sweeps. On THIS
 * run no gate is armed, so the hook never fires and the search cannot have
 * moved — and it did not: the delivered network is still byte-identical to the
 * stored F4b2 one, on both seeds. What did move is the VERDICTS, which now
 * report a dissipation integral and a |Z| minimum taken over a different span.
 *
 * Re-recording the whole file would have thrown away the claim that matters
 * ("F4c and V32 changed no network") to accommodate a change to a report. So
 * the comparison is split: `runs` still pins the network and is untouched
 * F4b2, and `verdicts_sinds_V32` pins the verdicts beside it. Two claims, two
 * blocks, and neither can be updated by accident while the other is asserted.
 */

import { describe, expect, it } from 'vitest';
import { selectEngine } from '../facade.ts';
import { stableJson } from './determinism.ts';
import { runV2Optimization, type V2OptimizeResult } from './run.ts';
import { v2DriverZ, v2GateReference, v2Responses, v2SeedParts, V2_GRID } from './v2.fixture.ts';
import type { NetOptimizeOptions } from '../../netOptimizer.ts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'test-fixtures',
  'f4b2_v2_baseline.json',
);

interface Baseline {
  stand: string;
  parameters: { starts: number; budgetEvaluations: number };
  seeds: number[];
  runs: Record<string, unknown>;
  /** V32 — the verdict half, recorded beside the untouched F4b2 network half. */
  verdicts_sinds_V32?: { stand: string; runs: Record<string, unknown> };
  /**
   * V50 — the verdict half again, now with the two buildability gates on every
   * list. The V32 block is NOT re-recorded: it still pins the four gate ids it
   * was recorded on, and this block pins all six. Two dated blocks rather than
   * one overwritten, for the reason V32 gave when it split the file.
   */
  verdicts_sinds_V50?: { stand: string; runs: Record<string, unknown> };
}

const BASELINE = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as Baseline;

const ON = selectEngine(true);
const reference = v2GateReference();
const { wBase, tBase } = v2Responses();
const driverZ = v2DriverZ();

/**
 * The values F4b2's v2 route carried — one grey weight and one choice.
 *
 * Deliberately one of each: a weight alone would leave the choice half of the
 * split unexercised, and the choice half is the one the compiler now guards.
 */
const WEIGHT = { phasePriority: 0.35 };
const CHOICE = { staged: { rippleDb: 0.8, phaseDeg: 8 } };

/**
 * The run parameters come from the FIXTURE, not from this file.
 *
 * A baseline generated at 140 evaluations and compared against a run at 200
 * would fail for a reason that has nothing to do with F4c, and the failure
 * would look like a behaviour change. The numbers live with the numbers they
 * produced.
 */
const base = (seed: number) => ({
  selection: ON,
  seedParts: v2SeedParts(),
  grid: V2_GRID,
  wBase,
  tBase,
  driverZ,
  adjust: { offsetMm: 0, trimDb: 0, inverted: false },
  determinism: {
    seed,
    starts: BASELINE.parameters.starts,
    budgetEvaluations: BASELINE.parameters.budgetEvaluations,
  },
  gateReference: reference,
});

/** The F4b2 shape: everything in one bag, inherited wholesale. */
function oldShape(seed: number): V2OptimizeResult {
  const legacy = { ...WEIGHT, ...CHOICE } as unknown as NetOptimizeOptions;
  return runV2Optimization({
    ...base(seed),
    // The call F4c's type no longer permits, reconstructed on purpose: the
    // regression has to compare against what the code did, not against a
    // tidied-up account of it.
    tuneOptions: legacy as never,
  });
}

/** The F4c shape: the same values, named by class. */
function newShape(seed: number): V2OptimizeResult {
  return runV2Optimization({ ...base(seed), weights: WEIGHT, choices: CHOICE });
}

/**
 * Everything about the delivered NETWORK that a behaviour change would move.
 *
 * The gate verdicts are deliberately not in here since V32 — they are a report
 * ABOUT this network, taken over a span V32 moved, and folding them in would
 * make "the network is unchanged" untestable without re-recording it. They have
 * their own comparison below.
 */
const delivered = (r: V2OptimizeResult): string =>
  stableJson({
    candidates: r.candidates.map((c) => ({
      label: c.label,
      start: c.start,
      parts: c.parts,
      after: c.net.after,
      before: c.net.before,
      tuned: c.net.tuned,
      evaluations: c.net.evaluations,
      removed: c.net.removed,
      added: c.net.added,
    })),
    rejected: r.rejected,
    searchBox: r.searchBox,
  });

/** The verdict half — V32's own block, pinned separately. */
/**
 * The verdicts, optionally restricted to a set of gate ids — the ids a dated
 * block was RECORDED on. A block from before V50 knows four gates; comparing
 * it against six would fail on the two it never saw rather than on a change
 * to the four it pins.
 */
const verdictsOf = (r: V2OptimizeResult, gateIds?: ReadonlySet<string>): string =>
  stableJson(
    r.candidates.map((c) => ({
      label: c.label,
      start: c.start,
      gatesFrozen: gateIds ? c.gatesFrozen.filter((v) => gateIds.has(v.gate)) : c.gatesFrozen,
      gatesDerived: gateIds ? c.gatesDerived.filter((v) => gateIds.has(v.gate)) : c.gatesDerived,
    })),
  );

/** The gate ids a stored verdict block was recorded on — read off the block itself. */
const gateIdsIn = (block: unknown): Set<string> => {
  const ids = new Set<string>();
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (typeof o.gate === 'string' && typeof o.metric === 'string') ids.add(o.gate);
      Object.values(o).forEach(walk);
    }
  };
  walk(block);
  return ids;
};

/** The stored F4b2 network for one seed, serialised the same way. */
const storedFor = (seed: number): string => {
  const run = BASELINE.runs[String(seed)] as { candidates: Record<string, unknown>[] };
  expect(run, `the baseline holds no run for seed ${seed}`).toBeTruthy();
  return stableJson({
    ...run,
    candidates: run.candidates.map((c) => {
      const { gatesFrozen: _f, gatesDerived: _d, ...rest } = c as Record<string, unknown>;
      return rest;
    }),
  });
};

/** The stored V32 verdicts for one seed. */
const storedVerdictsFor = (seed: number): string => {
  const v = BASELINE.verdicts_sinds_V32?.runs?.[String(seed)];
  expect(v, `the baseline holds no V32 verdicts for seed ${seed}`).toBeTruthy();
  return stableJson(v);
};

/** The stored V50 verdicts for one seed — all six gates. */
const storedV50VerdictsFor = (seed: number): string => {
  const v = BASELINE.verdicts_sinds_V50?.runs?.[String(seed)];
  expect(v, `the baseline holds no V50 verdicts for seed ${seed}`).toBeTruthy();
  return stableJson(v);
};

describe('F4c — naming the choices changed no network', () => {
  const seeds = [4242, 99] as const;

  it('the baseline file is the one this test thinks it is', () => {
    // A fixture that failed to load, or that was regenerated against a
    // different parameter set, would make every assertion below meaningless.
    expect(BASELINE.stand).toBe('F4b2');
    expect(BASELINE.seeds).toEqual([...seeds]);
    expect(Object.keys(BASELINE.runs).sort()).toEqual([...seeds].map(String).sort());
    // V32's half is a separate block with its own stand, so a reader can never
    // mistake a re-recorded verdict for a re-recorded network.
    expect(BASELINE.verdicts_sinds_V32?.stand).toBe('V32');
    expect(Object.keys(BASELINE.verdicts_sinds_V32?.runs ?? {}).sort()).toEqual(
      [...seeds].map(String).sort(),
    );
    expect(BASELINE.verdicts_sinds_V50?.stand).toBe('V50');
    expect(Object.keys(BASELINE.verdicts_sinds_V50?.runs ?? {}).sort()).toEqual(
      [...seeds].map(String).sort(),
    );
    // The V32 block knows four gates, the V50 block six — and that is the
    // difference between them, not a re-recording.
    expect([...gateIdsIn(BASELINE.verdicts_sinds_V32)].sort()).toEqual(['M-A', 'M-B/EPDR', 'M-B/|Z|', 'M-C']);
    expect([...gateIdsIn(BASELINE.verdicts_sinds_V50)].sort()).toEqual(
      ['M-A', 'M-A/part', 'M-B/EPDR', 'M-B/|Z|', 'M-C', 'M-L'],
    );
  });

  it('the two seeds genuinely search different ground', () => {
    // Without this the regression below could be satisfied by a search that
    // never looks at its seed, and "unchanged on two seeds" would mean
    // "unchanged on one seed, twice". Asserted on the STORED runs, so it is a
    // property of the baseline rather than of today's build.
    expect(storedFor(seeds[0])).not.toBe(storedFor(seeds[1]));
    expect(storedFor(seeds[0]).length).toBeGreaterThan(1000);
  });

  it.each(seeds)('[bytes] seed %i: the F4c shape reproduces the STORED F4b2 network', (seed) => {
    expect(delivered(newShape(seed))).toBe(storedFor(seed));
  });

  it.each(seeds)('[bytes] seed %i: so does the F4b2 shape — the fixture pins both', (seed) => {
    /* This is what keeps the header's argument honest rather than asserted. If
     * one of F4c's edits could reach the network through the old call shape,
     * this is where it would show. */
    expect(delivered(oldShape(seed))).toBe(storedFor(seed));
  });

  it.each(seeds)('[bytes] seed %i: the VERDICTS reproduce their own V32 block', (seed) => {
    /* The half V32 moved, pinned so it cannot move again unnoticed. It is a
     * separate assertion from the network above on purpose: "the design is
     * unchanged" and "the report about it is unchanged" are two claims, and
     * V32 is the delivery that made them come apart. */
    expect(verdictsOf(newShape(seed), gateIdsIn(BASELINE.verdicts_sinds_V32))).toBe(storedVerdictsFor(seed));
  });

  it.each(seeds)('[bytes] seed %i: and ALL SIX verdicts reproduce the V50 block', (seed) => {
    /* V50 added two gates to every verdict list. The V32 block above still
     * pins its four; this pins the two new ones beside them, unarmed on this
     * fixture (no class, no power, no peak) and saying so. */
    expect(verdictsOf(newShape(seed))).toBe(storedV50VerdictsFor(seed));
  });

  it('the verdicts are taken on the MEASURED SWEEP, not on this fixture grid', () => {
    /* V32's claim, made falsifiable here rather than left to the header. The
     * fixture's response grid stops at 19 kHz and starts at 210 Hz; the drivers'
     * own sweeps run wider, and every electrical verdict now says where it was
     * taken. Without this assertion the block above would keep reproducing even
     * if the reference quietly fell back to the response grid. */
    const v = newShape(seeds[0]).candidates[0].gatesFrozen.find((g) => g.gate === 'M-B/|Z|');
    expect(v, 'no |Z| verdict at all').toBeTruthy();
    const span = String(v!.parameters?.judged_on ?? '');
    expect(span).toContain('impedance');
    const lo = Number(span.split('-')[0]);
    expect(Number.isFinite(lo)).toBe(true);
    expect(lo).toBeLessThan(V2_GRID[0]);
  });

  it('the FINGERPRINT does move, and that is correct rather than a regression', () => {
    /* The one thing F4c deliberately changes. `choices` is a new ingredient, so
     * a run that stated its candidate and a run that inherited it are no longer
     * indistinguishable — which is the entire reason the ingredient exists. The
     * NETWORK is identical (asserted above); the STAMP is not, and a reader
     * comparing an old fingerprint to a new one deserves to be told that. */
    expect(newShape(seeds[0]).fingerprint).not.toBe(oldShape(seeds[0]).fingerprint);
    const names = newShape(seeds[0]).fingerprintComponents.map((c) => c.name);
    expect(names).toContain('choices');
  });

  it('an unstated weight is reported rather than assumed', () => {
    // P4's shape, applied to the grey class: leaving a weight to the tuner is a
    // decision, and a decision nobody can see is the thing F4c is about.
    const r = runV2Optimization({ ...base(4242), choices: CHOICE });
    expect(r.notes.join(' ')).toContain("Weights left to the tuner's own defaults");
    expect(r.notes.join(' ')).toContain('phasePriority');
    // ...and stating it silences exactly that name.
    const stated = runV2Optimization({ ...base(4242), choices: CHOICE, weights: WEIGHT });
    const line = stated.notes.find((n) => n.includes("Weights left to the tuner's own defaults"));
    expect(line ?? '').not.toContain('phasePriority');
  });
});
