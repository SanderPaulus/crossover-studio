/**
 * THE GATES, RUN ON EVERY FROZEN NETLIST IN THE CASE BOOK.
 *
 * F4d-nazorg, controle 2. Until now the gates were exercised on synthetic
 * networks (`gateEnforcement.test.ts`), on one casus-1 filter
 * (`gateReport.test.ts`) and inside optimiser runs. The nine — now fifteen —
 * `KAND-V2-*` netlists arrived as FILES and nothing ever put the whole set in
 * front of the gate machinery. A frozen artefact that no gate ever looks at is
 * an artefact whose defects nobody finds until someone builds it.
 *
 * So: every entry of `manifest_en_geometrie.netlists`, no exceptions and no
 * list of its own. A netlist added to the case book joins this test by being
 * added there; there is no second place to remember.
 *
 * ── WHAT THIS TEST CAN AND CANNOT CLAIM, said plainly ──────────────────────
 *
 * The brief asked for "een bevroren netlist die een poort niet haalt breekt de
 * suite". On casus 1 that sentence is, today, unfalsifiable — and the reason
 * is the finding rather than an excuse. Casus 1 states NO amplifier rating, NO
 * dissipation ceiling, NO EPDR floor and NO M-C limit, so all four gates are
 * OFF (P4: an absent limit is not a gate that always passes, it is a gate that
 * reports its value and judges nothing). V27 already writes this down as the
 * first of the two things its comparison table exposed: `min |Z|` of 0.00 Ω on
 * KAND-V2-2 is not a bug, it is a missing project setting.
 *
 * Adding a threshold here to make the sentence bite would be inventing the
 * project setting that is missing, in a test file, which is the one thing
 * F0/P4 and this session's brief both forbid. So the test is split in two:
 *
 *   1. THE STANDING CLAIM. Every gate runs on every frozen netlist, produces a
 *      VALUE, and reports itself absent with its reason. That can fail — a
 *      netlist whose metric cannot be evaluated returns null and breaks it.
 *
 *   2. THE PROOF THAT IT BITES. The same harness, on the same files, with a
 *      limit taken from the FIELD'S OWN MEASURED VALUES — the least favourable
 *      reading in the set. No number is written in this file. When a project
 *      does state a limit, these netlists are judged by it, and the netlist at
 *      the other extreme fails. Without part 2, part 1 is a test that has never
 *      shown it can go red.
 */

import { describe, expect, it } from 'vitest';
import {
  casus1Files,
  casus1Filter,
  casus1Geometry,
  casus1Manifest,
  loadGolden,
} from './casus1.fixture.ts';
import { buildReport, type ReportSettings } from './report.ts';
import { ctcKey } from './metrics/types.ts';
import { GATE_IDS, type GateVerdict } from './optimizer/gates.ts';

const golden = loadGolden();
const manifest = casus1Manifest(golden);
const files = casus1Files(manifest);
const geometry = casus1Geometry(golden);

/** Every frozen netlist the case book names — v1 baselines and v2 candidates alike. */
const NETLIST_KEYS = Object.keys(
  (golden.manifest_en_geometrie as { netlists: Record<string, string> }).netlists,
);

/**
 * The orders the case book states for casus 1's two handovers.
 *
 * Needed because M-C's passband is derived from where the branches cross, and
 * the crossover window's floor moves with the order. Stated here for the same
 * reason every other casus-1 test states it: a band without its parameters is
 * not a measurement (V15).
 */
const BASE: ReportSettings = {
  amplifierPowerW: 100,
  orderByPair: { [ctcKey('woofer', 'mid')]: 4, [ctcKey('mid', 'tweeter')]: 4 },
};

const report = (key: string, settings: ReportSettings = BASE) =>
  buildReport({
    manifest,
    files,
    filter: casus1Filter(key, manifest, files, golden),
    geometry,
    settings,
  });

/** Every frozen netlist, judged once, reused by every case below. */
const FIELD: { key: string; verdicts: GateVerdict[]; anyActive: boolean }[] = NETLIST_KEYS.map(
  (key) => {
    const r = report(key);
    return { key, verdicts: r.gates.verdicts, anyActive: r.gates.anyActive };
  },
);

describe('every gate runs on every frozen netlist', () => {
  it('the field is not empty, and it contains the v2 candidates as well as the baselines', () => {
    // A scan over an empty list passes silently, which is how a guard comes to
    // be green for a year without ever having run.
    expect(NETLIST_KEYS.length).toBeGreaterThan(0);
    expect(NETLIST_KEYS.some((k) => k.startsWith('KAND_V2'))).toBe(true);
    expect(NETLIST_KEYS).toContain('HUIDIG');
  });

  it('each netlist gets a verdict for every gate id A4 declares', () => {
    for (const { key, verdicts } of FIELD) {
      const ids = new Set(verdicts.map((v) => v.gate));
      for (const id of GATE_IDS) {
        // M-C is per driver and only exists for the ways that HAVE a
        // resonance in play, so its absence is a statement about the design
        // rather than a missing verdict. The three system gates are not
        // optional.
        if (id === 'M-C') continue;
        expect(ids, `${key} has no ${id} verdict`).toContain(id);
      }
    }
  });

  it('every gate produces a VALUE on every frozen netlist — the metric is evaluable', () => {
    for (const { key, verdicts } of FIELD) {
      for (const v of verdicts) {
        expect(v.value, `${key}: ${v.gate} on ${v.subject} produced no value`).not.toBeNull();
      }
    }
  });

  it('with casus 1\'s own settings every gate is OFF, and says so rather than passing', () => {
    /* This is the honest form of "no frozen netlist fails a gate" on this
     * case: none fails because none is judged. The assertion is on `active`
     * and on the sentence, NOT on `pass` — a reader who sees only a green
     * `pass` column cannot tell a design that cleared a limit from a design
     * nobody measured against one. */
    for (const { key, verdicts, anyActive } of FIELD) {
      expect(anyActive, `${key} has an armed gate — casus 1 states none`).toBe(false);
      for (const v of verdicts) {
        expect(v.active).toBe(false);
        expect(v.limit).toBeNull();
        expect(v.reason, `${key}: ${v.gate}`).toContain('no limit set');
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * The proof that the harness bites — thresholds from the field itself
 * ------------------------------------------------------------------ */

/** One gate's reading across the whole frozen field. */
const readings = (gate: string, subject?: string): { key: string; value: number }[] =>
  FIELD.flatMap(({ key, verdicts }) =>
    verdicts
      .filter((v) => v.gate === gate && (subject === undefined || v.subject === subject))
      .filter((v) => v.value !== null)
      .map((v) => ({ key, value: v.value as number })),
  );

/**
 * Arm one gate at a limit taken from the field, and report who fails.
 *
 * The limit is a MEASURED value of one of these very netlists, so no number
 * appears in this file and none is invented: the gate still judges out of the
 * measurements, exactly as it does in the app. What is being demonstrated is
 * the machinery, not a project policy.
 */
const judgeWith = (settings: ReportSettings, gate: string) =>
  NETLIST_KEYS.map((key) => ({
    key,
    verdict: report(key, { ...BASE, ...settings }).gates.verdicts.find((v) => v.gate === gate)!,
  }));

describe('a stated limit DOES judge these files — the counter-proof', () => {
  it('M-A: armed at the least dissipative netlist, the most dissipative one fails', () => {
    const vals = readings('M-A');
    expect(vals.length).toBe(NETLIST_KEYS.length);
    const lowest = vals.reduce((a, b) => (b.value < a.value ? b : a));
    const highest = vals.reduce((a, b) => (b.value > a.value ? b : a));
    // Without a spread there is nothing to separate, and "everything passes"
    // would be true for a gate that never compared anything.
    expect(highest.value).toBeGreaterThan(lowest.value);

    const judged = judgeWith({ maxDissipationFraction: lowest.value }, 'M-A');
    for (const { key, verdict } of judged) expect(verdict.active, key).toBe(true);
    expect(judged.find((j) => j.key === highest.key)!.verdict.pass).toBe(false);
    expect(judged.find((j) => j.key === lowest.key)!.verdict.pass).toBe(true);
    // ...and the suite would have broken on it: the violation sentence names it.
    const rep = report(highest.key, { ...BASE, maxDissipationFraction: lowest.value });
    expect(rep.gates.violation).not.toBeNull();
    expect(rep.gates.violation).toContain('M-A');
  });

  it('M-B/EPDR: armed at the highest EPDR in the field, the lowest one fails', () => {
    const vals = readings('M-B/EPDR');
    const lowest = vals.reduce((a, b) => (b.value < a.value ? b : a));
    const highest = vals.reduce((a, b) => (b.value > a.value ? b : a));
    expect(highest.value).toBeGreaterThan(lowest.value);

    const judged = judgeWith({ minEpdrOhm: highest.value }, 'M-B/EPDR');
    expect(judged.find((j) => j.key === lowest.key)!.verdict.pass).toBe(false);
    expect(judged.find((j) => j.key === highest.key)!.verdict.pass).toBe(true);
  });

  it('M-B/|Z|: armed at the strongest load in the field, the weakest one fails', () => {
    const vals = readings('M-B/|Z|');
    const lowest = vals.reduce((a, b) => (b.value < a.value ? b : a));
    const highest = vals.reduce((a, b) => (b.value > a.value ? b : a));
    expect(highest.value).toBeGreaterThan(lowest.value);

    const judged = judgeWith({ ampMinLoadOhm: highest.value }, 'M-B/|Z|');
    const worst = judged.find((j) => j.key === lowest.key)!.verdict;
    expect(worst.pass).toBe(false);
    // The |Z| floor is the one gate with a tolerance, and the failure has to
    // be a real one rather than a rounding: the strongest load in the field
    // passes on the same limit.
    expect(judged.find((j) => j.key === highest.key)!.verdict.pass).toBe(true);
  });

  it('M-C: armed at the quietest drive on the tweeter resonance, the loudest one fails', () => {
    const vals = readings('M-C', 'tweeter');
    expect(vals.length).toBeGreaterThan(0);
    const quietest = vals.reduce((a, b) => (b.value < a.value ? b : a));
    const loudest = vals.reduce((a, b) => (b.value > a.value ? b : a));
    expect(loudest.value).toBeGreaterThan(quietest.value);

    const judged = NETLIST_KEYS.map((key) => ({
      key,
      verdict: report(key, { ...BASE, maxDriveOnFsDb: quietest.value }).gates.verdicts.find(
        (v) => v.gate === 'M-C' && v.subject === 'tweeter',
      )!,
    })).filter((j) => j.verdict !== undefined);
    expect(judged.find((j) => j.key === loudest.key)!.verdict.pass).toBe(false);
    expect(judged.find((j) => j.key === quietest.key)!.verdict.pass).toBe(true);
  });
});
