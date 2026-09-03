/**
 * F4c GUARDS — the classification is complete, and it is enforced.
 *
 * Two claims, and neither survives as a review rule:
 *
 *  1. COMPLETENESS. `CHOICE_KEYS ∪ GREY_KEYS ∪ POLISH_KEYS` is exactly the key
 *     set of `NetOptimizeOptions`. A key added upstream lands in none of the
 *     three lists and fails here, rather than defaulting to "inherit" — which
 *     is how 33 of the 37 came to be inherited in the first place.
 *
 *  2. NO SMUGGLING. Inside `engine2/` a choice key may not arrive through a
 *     spread of `tuneOptions`. Same technique as `noAppWideFloor.test.ts`: the
 *     rule is a scan, because a rule that is only written down is a rule that
 *     is only written down.
 *
 * The key set is read out of the SOURCE rather than out of a type, because a
 * type is erased at runtime and a test that enumerated a hand-written copy of
 * the interface would be asserting that two lists agree, both of which it
 * wrote.
 */

import { describe, expect, it } from 'vitest';
import { FLAT_TARGET } from '../requirements/targetCurve.ts';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHOICE_KEYS,
  GREY_KEYS,
  POLISH_KEYS,
  declarationCoverage,
  declarationKey,
  greyValues,
} from './choices.ts';
import { AMP_FLOOR_BARRIER_WEIGHT } from '../../netOptimizer.ts';
import { SEARCH_SMOOTHING_OCTAVES } from '../constants.ts';
import {
  declareCandidateChainChoices,
  declareCandidateChoices,
} from './candidateDeclaration.ts';
import { CHAIN_CHOICE_KEYS, chainDeclarationCoverage } from './chainChoices.ts';
import { withDeclaredSourceLimit } from './worker.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE2 = join(HERE, '..');
const NET_OPTIMIZER = join(ENGINE2, '..', 'netOptimizer.ts');

/** Every top-level property name of `NetOptimizeOptions`, read from the source. */
function optionKeys(): string[] {
  const text = readFileSync(NET_OPTIMIZER, 'utf-8');
  const start = text.indexOf('export interface NetOptimizeOptions {');
  expect(start, 'NetOptimizeOptions has moved or been renamed').toBeGreaterThan(0);
  const open = text.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end).toBeGreaterThan(open);
  const body = text.slice(open + 1, end).split('\n');
  const keys: string[] = [];
  let nest = 0;
  for (const line of body) {
    const trimmed = line.trim();
    if (nest === 0) {
      const m = /^([A-Za-z_$][\w$]*)\??\s*:/.exec(trimmed);
      if (m) keys.push(m[1]);
    }
    nest += (line.match(/[{[]/g) ?? []).length - (line.match(/[}\]]/g) ?? []).length;
    if (nest < 0) nest = 0;
  }
  return keys;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name) && !/\.test\.ts$|\.fixture\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe('F4c — every tuner option has a class', () => {
  const keys = optionKeys();

  it('the scan really reads the interface', () => {
    // A parser that found nothing would make every assertion below vacuous.
    expect(keys.length).toBeGreaterThan(30);
    expect(keys).toContain('phasePriority');
    expect(keys).toContain('valueSumCeilings');
    // Nested object members must NOT have been picked up as top-level keys.
    expect(keys).not.toContain('nominalOhm');
    expect(keys).not.toContain('rippleDb');
  });

  it('choice + grey + polish is exactly the option set — no key defaults to "inherit"', () => {
    const classified = [...CHOICE_KEYS, ...GREY_KEYS, ...POLISH_KEYS];
    // No key is filed twice.
    expect(new Set(classified).size, 'a key is in two classes').toBe(classified.length);

    const unclassified = keys.filter((k) => !classified.includes(k as never));
    expect(
      unclassified,
      'these tuner options have no class. A new option is a DECISION — choice, grey or polish — ' +
        `and until it has one the v2 route would inherit it silently:\n${unclassified.join('\n')}`,
    ).toEqual([]);

    const stale = classified.filter((k) => !keys.includes(k));
    expect(stale, `classified keys that no longer exist upstream:\n${stale.join('\n')}`).toEqual([]);

    // The count is stated so a reader can check it against the casebook table.
    // 37 at F4c; 38 since V30 added `zFloorBarrier` as a choice; 39 since V31
    // added `rejectedTuneReport` as instrumentation; 41 since V33 added
    // `zFloorBarrierSource` (choice — which band the goal is measured over) and
    // `zFloorBarrierImpedance` (polish — the measurement that band comes from);
    // 42 since V34 added `rSourceProbeSource` (choice — which frequency a hard
    // limit is compared at); 44 since V37 added `dissipationReferenceSource`
    // (choice — WHAT the dissipation term divides by) and
    // `dissipationReferenceReOhm` (polish — the resolved R_e it divides by).
    // V38-fix adds NO key and reclassifies one: `errorSmoothOct` moves from
    // polish to choice, so the total stays 44 and the split becomes 30/5/9.
    // V41 adds no key HERE either, and that is the point of it being a
    // separate list: `eqBands` and `leanTargetDb` are `Chain3Settings` keys,
    // read by the design and synthesis steps before the tuner exists. They may
    // never appear among the tuner's own options, because a value that reaches
    // the tuner arrives too late to put a component in the network.
    // 46 since V44 added `phaseAdmission` (choice — WHICH POINTS a phase
    // judgement may rest on) and `phaseAdmissionFacts` (polish — the validity
    // band and ghost convention those grounds read). Same pair shape as V33,
    // V34 and V37, and the split becomes 31/5/10.
    // 48 since V45 added `amplitudeReference` (choice — WHAT COUNTS AS FLAT:
    // horizontal, or the design's stated voicing) and `amplitudeTargetDb`
    // (polish — the target curve of that design, sampled). The fifth pair of
    // the same shape, and the split becomes 32/5/11.
    // 49 since V47 added `protectionRule` (choice — WHICH RULE forbids an
    // unprotected upper driver: the distance to the seed, or a stated absolute
    // requirement). It is the FIRST of these that arrives WITHOUT a polish
    // companion, and the absence is the argument: the quantity the stated rule
    // defers to is already on the wire as `v2.gates.maxDriveOnFsDb`, evaluated
    // by the same gate machinery the shortlist reads. Adding a second copy
    // beside it would be the very thing every other pair here avoids. Split
    // becomes 33/5/11.
    // 50 since V48 added `seriesInductanceCeilingSource` (choice — WHICH
    // NETWORK the A5d.6 series-inductance ceiling describes: the one the
    // search started from, or the one it is building). The SECOND to arrive
    // without a polish companion, and for the same kind of reason as V47's:
    // the measured near field and sweep the inversion re-reads travel inside
    // `valueSumCeilings`, which has been polish since F2 precisely because it
    // is data the run already holds. Split becomes 34/5/11.
    expect(keys.length).toBe(50);
    expect(CHOICE_KEYS.length + GREY_KEYS.length + POLISH_KEYS.length).toBe(50);
    expect([CHOICE_KEYS.length, GREY_KEYS.length, POLISH_KEYS.length]).toEqual([34, 5, 11]);
    for (const k of CHAIN_CHOICE_KEYS) {
      expect(classified as readonly string[], `${k} is a chain key, not a tuner option`).not.toContain(k);
    }
    // V31: instrumentation, never a choice — the key may not silently migrate
    // into the class whose values are only allowed to come from a candidate.
    expect(POLISH_KEYS).toContain('rejectedTuneReport');
    expect(CHOICE_KEYS as readonly string[]).not.toContain('rejectedTuneReport');
    expect(CHOICE_KEYS).toContain('zFloorBarrier');
    /* V33 — the pair, and the split between them is the claim. WHICH band the
     * amp-load goal is measured over decides what the search calls good, so it
     * is a choice and may only come from a candidate. WHAT is on that band is
     * the run's own measured sweep, handed over by the caller that already
     * holds it — the `gateViolation` argument, and the same class. A migration
     * either way would be a decision, so it breaks the build. */
    expect(CHOICE_KEYS).toContain('zFloorBarrierSource');
    expect(POLISH_KEYS).toContain('zFloorBarrierImpedance');
    expect(CHOICE_KEYS as readonly string[]).not.toContain('zFloorBarrierImpedance');
    expect(POLISH_KEYS as readonly string[]).not.toContain('zFloorBarrierSource');
    /* V34 — the same split, one quantity along, and the same reason it may not
     * drift: WHERE the source-resistance probe reads decides which frequency
     * `rSourceDisqualifyOhm` is compared at, and on casus 1 that decides
     * whether the designer's own best filter passes or is thrown away. A
     * migration into polish would make that a tuning detail. */
    expect(CHOICE_KEYS).toContain('rSourceProbeSource');
    expect(POLISH_KEYS as readonly string[]).not.toContain('rSourceProbeSource');
    expect(GREY_KEYS as readonly string[]).not.toContain('rSourceProbeSource');
    // ...and it stays beside the limit it qualifies, which is also a choice.
    expect(CHOICE_KEYS).toContain('rSourceDisqualifyOhm');
    /* V37 — the third pair, and the split is the same claim a third time.
     * WHAT the dissipation term divides by defines the quantity a weighted term
     * measures: `1 + R_source/R_e` is Q_es multiplication (A3j row 23, A4 M-E),
     * and `Re(Z)` at the probe is a different number — on casus 1, 19.31 Ω
     * against a metered 3.05 Ω, squared to 40.1. A migration into polish would
     * make "which quantity the objective measures" a tuning detail. The R_e
     * itself is the run's own resolved fact, handed over by the caller that
     * already holds it, and may never become a choice: a candidate that carried
     * its own R_e would be a second opinion about the A5c.1 hierarchy, which
     * has one implementation on purpose (F4b leak 1). */
    expect(CHOICE_KEYS).toContain('dissipationReferenceSource');
    expect(POLISH_KEYS).toContain('dissipationReferenceReOhm');
    expect(POLISH_KEYS as readonly string[]).not.toContain('dissipationReferenceSource');
    expect(GREY_KEYS as readonly string[]).not.toContain('dissipationReferenceSource');
    expect(CHOICE_KEYS as readonly string[]).not.toContain('dissipationReferenceReOhm');
    // ...and it stays beside the WEIGHT it qualifies, which is grey (A3j).
    expect(GREY_KEYS).toContain('dissipationWeight');
    /* V38-fix — the one RECLASSIFICATION in this list, and the only reason it
     * is not a pair like the three above is that there is nothing to hand over
     * beside it: the width is the whole statement.
     *
     * It was filed POLISH at F4c on a description of the code that was true —
     * it smooths the search error measure and leaves gates and targets on the
     * raw grid — and on an assumption about that description that was not: that
     * a resolution knob cannot decide which network wins. Measured, one key at
     * a time, it decided it by 0.55 to 2.45 dB on three separate topologies,
     * which is the entire distance between the generated field and the
     * designer's own filter (casebook V38, V38-fix). What the amplitude term is
     * a statistic OF is the same class of question as `band`: it names the
     * quantity, not the effort spent on it.
     *
     * A migration back into polish would restore exactly the state the
     * measurement ended, so it breaks the build in both directions. */
    expect(CHOICE_KEYS).toContain('errorSmoothOct');
    expect(POLISH_KEYS as readonly string[]).not.toContain('errorSmoothOct');
    expect(GREY_KEYS as readonly string[]).not.toContain('errorSmoothOct');
    /* V44 — the fourth pair, and the split between them is the same claim as
     * V33's, V34's and V37's. WHICH POINTS a phase judgement may rest on
     * decides what the search calls good and what the requirement accepts, so
     * it is a choice and may only come from a candidate. WHAT those grounds
     * read — the validity band from the ingest pass, the caller's ghost
     * convention — is the run's own measurement, handed over by the caller that
     * already holds it. `phaseAdmissionFacts` may never become a choice: a
     * candidate that brought its own validity band would be a second opinion
     * about A5b.1, which has one implementation on purpose. A migration either
     * way breaks the build. */
    expect(CHOICE_KEYS).toContain('phaseAdmission');
    expect(POLISH_KEYS as readonly string[]).not.toContain('phaseAdmission');
    expect(GREY_KEYS as readonly string[]).not.toContain('phaseAdmission');
    expect(POLISH_KEYS).toContain('phaseAdmissionFacts');
    expect(CHOICE_KEYS as readonly string[]).not.toContain('phaseAdmissionFacts');
    expect(GREY_KEYS as readonly string[]).not.toContain('phaseAdmissionFacts');
    /* And the two are INDEPENDENT of `phaseMetric`, which is the correction V40
     * turned up: both of that key's values average over the overlap window, so
     * it names the WEIGHTING and can state no admission at all. Two keys, two
     * questions — collapsing them would make one of the two unavailable. */
    expect(CHOICE_KEYS).toContain('phaseMetric');
    /* V45 — the FIFTH pair, same shape and same split. WHAT COUNTS AS FLAT
     * decides what the search calls good, so it is a choice and may only come
     * from a candidate; WHAT the voicing IS, is the design's own target-curve
     * object, handed over by the side that holds it. `amplitudeTargetDb` may
     * never become a choice: a candidate that brought its own voicing would be
     * a second opinion about which loudspeaker is being designed, and the whole
     * reason A5e.2 hangs the curve on the DESIGN is so that two voicings can be
     * compared rather than toggled. A migration either way breaks the build. */
    expect(CHOICE_KEYS).toContain('amplitudeReference');
    expect(POLISH_KEYS as readonly string[]).not.toContain('amplitudeReference');
    expect(GREY_KEYS as readonly string[]).not.toContain('amplitudeReference');
    expect(POLISH_KEYS).toContain('amplitudeTargetDb');
    expect(CHOICE_KEYS as readonly string[]).not.toContain('amplitudeTargetDb');
    expect(GREY_KEYS as readonly string[]).not.toContain('amplitudeTargetDb');
    /* And it is INDEPENDENT of `ampTarget`, whose name is unfortunately close.
     * That one picks WHICH SUM is flattened (on-axis or listening window); this
     * one picks what counts as flat for whichever sum that is. Two keys, two
     * questions — collapsing them would make one of the two unavailable, which
     * is exactly the correction V40 turned up for `phaseMetric`. */
    expect(CHOICE_KEYS).toContain('ampTarget');
    /* V47 — the SIXTH of these, and the first WITHOUT a polish companion. The
     * absence is the argument: what `'stated'` defers to is `maxDriveOnFsDb`,
     * which is already on the wire as a GATE and is evaluated by the same gate
     * machinery the shortlist reads. A polish key carrying a second copy of it
     * would be exactly what the five pairs above each avoid.
     *
     * It may never migrate. WHICH RULE forbids an unprotected upper driver
     * decides what the search may deliver at all — the same family as
     * `rSourceDisqualifyOhm` and `ampMinLoadOhm`, both of which are choices —
     * and the two rules do not order the same designs. */
    expect(CHOICE_KEYS).toContain('protectionRule');
    expect(POLISH_KEYS as readonly string[]).not.toContain('protectionRule');
    expect(GREY_KEYS as readonly string[]).not.toContain('protectionRule');
    /* And it is INDEPENDENT of `safety`, which is also a choice and whose name
     * is close enough to invite the collapse. That one decides WHETHER the
     * full-band set is watched at all; this one decides what the watching
     * compares against. Folding them together would make "watch the full band
     * against a stated requirement" unsayable. */
    expect(CHOICE_KEYS).toContain('safety');
    expect(CHOICE_KEYS.length).toBe(34);
    expect(GREY_KEYS.length).toBe(5);
    expect(POLISH_KEYS.length).toBe(11);
  });

  /* V48 — WHICH NETWORK THE SERIES-INDUCTANCE CEILING DESCRIBES, and it may
   * never migrate.
   *
   * A choice by the same test the six before it pass: it decides which
   * QUANTITY bounds the search. `bump-series-l` inverts the LF budget into a
   * ceiling on the lowest way's series inductance AT A GIVEN PATH RESISTANCE,
   * and a value tune moves that resistance — so `'seed'` and `'tuned'` are
   * bounds on two different networks, not a coarse and a fine reading of one.
   *
   * IT IS INDEPENDENT OF `valueSumCeilings`, which is polish and stays polish.
   * That key carries the group and its measured inputs — data the run already
   * holds, which is the F2 argument for filing it there. This one says which
   * network the number in that group is supposed to describe. Folding them
   * together would make "hand over the measurements but keep the seed's
   * ceiling" unsayable, and that is exactly the arm V48's before/after needs. */
  it('V48 — the ceiling source is a choice, and its data stays polish', () => {
    expect(CHOICE_KEYS).toContain('seriesInductanceCeilingSource');
    expect(POLISH_KEYS as readonly string[]).not.toContain('seriesInductanceCeilingSource');
    expect(GREY_KEYS as readonly string[]).not.toContain('seriesInductanceCeilingSource');
    expect(POLISH_KEYS).toContain('valueSumCeilings');
    expect(CHOICE_KEYS as readonly string[]).not.toContain('valueSumCeilings');
  });
});

describe('F4c — no choice key arrives through a tuneOptions spread', () => {
  it('engine2 never spreads tuneOptions into a choice key', () => {
    /* What this forbids, concretely: a line inside `engine2/` that spreads
     * `tuneOptions` (or `input.tuneOptions`) and a line that names a choice key
     * as coming out of it. The narrow form is what makes the scan usable —
     * `...(input.tuneOptions ?? {})` in `run.ts` is legitimate and stays, because
     * the TYPE already forbids a choice key from being in there. What would not
     * be legitimate is reaching around that type. */
    const offenders: string[] = [];
    let scanned = 0;
    for (const file of walk(ENGINE2)) {
      const rel = relative(ENGINE2, file);
      if (rel === join('optimizer', 'choices.ts')) continue;
      const lines = readFileSync(file, 'utf-8').split('\n');
      scanned++;
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, ' ');
        if (!/tuneOptions/.test(code)) return;
        for (const key of CHOICE_KEYS) {
          // `tuneOptions.<choiceKey>` or `tuneOptions?.<choiceKey>` — reaching
          // past the type rather than through it.
          if (new RegExp(`tuneOptions\\??\\.\\s*${key}\\b`).test(code)) {
            offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
          }
        }
      });
    }
    expect(
      offenders,
      'a choice key is being read out of tuneOptions. On the v2 route a choice may only come ' +
        `from the candidate (see choices.ts):\n${offenders.join('\n')}`,
    ).toEqual([]);
    expect(scanned).toBeGreaterThan(10);
  });

  it('the run path spreads choices and weights AFTER the inherited options', () => {
    // Order is the whole mechanism: polish first, then the named choice and
    // weight objects, so an inherited value can never win over a stated one.
    const run = readFileSync(join(HERE, 'run.ts'), 'utf-8');
    const inherited = run.indexOf('...(input.tuneOptions ?? {})');
    const choices = run.indexOf('...(input.choices ?? {})');
    const weights = run.indexOf('...(input.weights ?? {})');
    expect(inherited).toBeGreaterThan(0);
    expect(choices).toBeGreaterThan(inherited);
    expect(weights).toBeGreaterThan(choices);
  });

  it('the worker states its choices, and names the ones it cannot state yet', () => {
    // The other half of the same claim, on the route the app actually takes.
    const worker = readFileSync(join(HERE, 'worker.ts'), 'utf-8');
    expect(worker).toContain('const stated: Partial<CandidateChoices>');
    // The F4c sentence still exists, and since F4d it is reachable ONLY on a
    // route with no A5d candidate — the two-way chain, which is still v1
    // (TODO(F2c)). A payload that carries a candidate can never print it.
    expect(worker).toContain('still inherited from the v1 chain, not v2-derived');
    // ...and they are merged into what the hook returns, or naming them would
    // be a comment rather than a mechanism.
    expect(worker).toContain('...stated,');
    expect(worker).toContain('...weights,');
  });
});

/* ================================================================== *
 * F4d — the declaration covers the key set, so nothing can be inherited
 * ================================================================== */

describe('F4d — a generated candidate declares every choice key', () => {
  /** A declaration built the way `App.tsx` builds one, with nothing stated. */
  const bare = () =>
    declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: {},
    });

  /** A full-band safety set — three points is enough to BE one; nothing here
   *  reads it, the declaration only asks whether it exists (V34). */
  const SAFETY = {
    freqs: [20, 200, 20000],
    w: { freq: [20, 200, 20000], spl: [80, 80, 80], phaseDeg: [0, 0, 0] },
    t: { freq: [20, 200, 20000], spl: [80, 80, 80], phaseDeg: [0, 0, 0] },
    z: { woofer: [{ re: 6, im: 0 }, { re: 6, im: 0 }, { re: 6, im: 0 }] },
  };

  /** ...and one with everything the designer can state, filled in. */
  const full = () =>
    declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: {
        band: [200, 18000],
        acousticSlopes: { mid: 24 },
        staged: { rippleDb: 2.5, phaseDeg: 15 },
        ampTarget: 'onAxis',
        powerMetric: 'smooth',
        phaseMetric: 'band',
        catalogSnap: false,
        snapPrefs: { profile: 'auto' },
        breakupGuard: true,
        audit: {},
        safety: SAFETY,
        ampMinLoadOhm: 3.2,
        rSourceDisqualifyOhm: 2,
        zFloorStrict: true,
      },
    });

  it('stated + absent + delegated is EXACTLY the choice-key set, both ways round', () => {
    for (const d of [bare(), full()]) {
      const cover = declarationCoverage(d);
      expect(cover.missing, `keys nothing declares:\n${cover.missing.join('\n')}`).toEqual([]);
      expect(cover.duplicated, `keys declared twice:\n${cover.duplicated.join('\n')}`).toEqual([]);
      expect(cover.complete).toBe(true);
    }
  });

  it('the coverage check can actually fail — a hole is detected rather than assumed away', () => {
    // A guard nobody has watched fail is a guard nobody should trust.
    const d = bare();
    const holed = { ...d, absent: d.absent.filter((a) => a.key !== 'xoRange') };
    expect(declarationCoverage(holed).missing).toEqual(['xoRange']);
    const doubled = { ...d, delegated: [...d.delegated, { key: 'xoRange' as const, to: 'x', why: 'y' }] };
    expect(declarationCoverage(doubled).duplicated).toContain('xoRange');
  });

  it('a setting the designer never filled in becomes an ABSENT declaration with the P4 reason', () => {
    /* The distinction the whole shape exists for: an omitted key reads as an
     * oversight, while "you stated no amplifier floor, so nothing judges the
     * load" is the P4 doctrine said out loud at the border. */
    const d = bare();
    const why = (k: string) => d.absent.find((a) => a.key === k)?.why ?? '';
    expect(why('ampMinLoadOhm')).toMatch(/P4/);
    expect(why('band')).toMatch(/absent is absent/);
    expect(d.stated.ampMinLoadOhm).toBeUndefined();
    // ...and a filled-in one really does land in `stated`.
    expect(full().stated.ampMinLoadOhm).toBe(3.2);
    expect(full().absent.some((a) => a.key === 'ampMinLoadOhm')).toBe(false);
  });

  it('V30 — a stated floor arms the barrier; no floor leaves it ABSENT, never false', () => {
    /* The derivation, and both halves of it. A floor that exists but does not
     * steer is what V30 measured and what this rule ends; a barrier armed
     * without a floor would have nothing to be short of, so it is absent with
     * the P4 reason rather than a `false` nobody chose. */
    expect(full().stated.zFloorBarrier).toBe(true);
    expect(full().absent.some((a) => a.key === 'zFloorBarrier')).toBe(false);

    const d = bare();
    expect(d.stated.zFloorBarrier).toBeUndefined();
    const why = d.absent.find((a) => a.key === 'zFloorBarrier')?.why ?? '';
    expect(why).toMatch(/P4/);
    expect(why).toMatch(/nothing for the search to aim at/);

    // ...and an explicit value still wins over the derivation, which is what
    // makes the entry's before/after a run someone can ASK for.
    const off = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { ampMinLoadOhm: 3.2, zFloorBarrier: false },
    });
    expect(off.stated.zFloorBarrier).toBe(false);
    expect(off.absent.some((a) => a.key === 'zFloorBarrier')).toBe(false);
  });

  it('V33 — an armed barrier states WHERE it aims; an unarmed one states nothing', () => {
    /* The second half of V30's derivation. A barrier that steers must steer at
     * a band that covers what will be enforced, and since V32 that is the
     * drivers' whole measured extent — so the two are derived together and
     * neither is a default anyone has to remember. `'safety'` and not
     * `'sweep'`: same reader, same extent, coarser grid, and a chain run of one
     * minute instead of eleven. Absent when the barrier is not armed, for the
     * same P4 reason `zFloorBarrier` itself is: naming a band for a term nobody
     * switched on reads as a decision about where to aim. */
    expect(full().stated.zFloorBarrierSource).toBe('safety');
    expect(full().absent.some((a) => a.key === 'zFloorBarrierSource')).toBe(false);

    const d = bare();
    expect(d.stated.zFloorBarrierSource).toBeUndefined();
    const why = d.absent.find((a) => a.key === 'zFloorBarrierSource')?.why ?? '';
    expect(why).toMatch(/P4/);
    expect(why).toMatch(/barrier is not armed/);

    // An explicit source still wins, so the before/after V33 rests on is a run
    // that can be asked for rather than a build that has to be patched.
    const onGrid = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { ampMinLoadOhm: 3.2, zFloorBarrierSource: 'grid' },
    });
    expect(onGrid.stated.zFloorBarrier).toBe(true);
    expect(onGrid.stated.zFloorBarrierSource).toBe('grid');
    expect(onGrid.absent.some((a) => a.key === 'zFloorBarrierSource')).toBe(false);

    // ...and the source moves the fingerprint, or the choice would be a label.
    const a = JSON.stringify(declarationKey(full(), {}));
    const b = JSON.stringify(declarationKey(onGrid, {}));
    expect(a).not.toBe(b);
  });

  it('V34 — a candidate with a safety set probes on it; without one it states nothing', () => {
    /* The derivation, and it is derived from a fact rather than chosen: the
     * probe asks about the low driver's box tuning, and on a measurement set
     * whose analysis grid starts above that resonance the question is only
     * answerable on the full-band safety grid. Casus 1 measured what the other
     * reading costs — the probe landed on grid[24] = 640.2 Hz, the top of its
     * own search window, and the three v1 baselines read 0.50/0.47/0.68 Ω there
     * against 3.98/4.59/2.55 Ω at the woofer's real peak. */
    expect(full().stated.rSourceProbeSource).toBe('safety');
    expect(full().absent.some((a) => a.key === 'rSourceProbeSource')).toBe(false);

    /* No safety set ⇒ ABSENT with the reason, and the reason names the
     * consequence: the tuner reads its own grid, which is the pre-V34 reading.
     * Not a stated `'grid'` — nobody decided that, and a stated default is how
     * an inherited value comes to look like a choice. */
    const d = bare();
    expect(d.stated.rSourceProbeSource).toBeUndefined();
    const why = d.absent.find((a) => a.key === 'rSourceProbeSource')?.why ?? '';
    expect(why).toMatch(/P4/);
    expect(why).toMatch(/no full-band safety set/);

    // An explicit source still wins over the derivation, so V34's before/after
    // is a run someone can ask for.
    const onGrid = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { safety: SAFETY, rSourceProbeSource: 'grid' },
    });
    expect(onGrid.stated.rSourceProbeSource).toBe('grid');
    expect(onGrid.absent.some((a) => a.key === 'rSourceProbeSource')).toBe(false);

    // ...and the source moves the fingerprint, or the choice would be a label.
    expect(JSON.stringify(declarationKey(full(), {}))).not.toBe(
      JSON.stringify(declarationKey(onGrid, {})),
    );
  });

  it('V37 — every candidate states WHAT the dissipation term divides by, and it is R_e', () => {
    /* THE ONE UNCONDITIONAL DERIVATION IN THIS MODULE, and the asymmetry is the
     * claim. V30, V33 and V34 all hang on another setting — no floor, no
     * barrier; no barrier, no band; no safety set, no wider grid to probe on.
     * V37 hangs on nothing, because the question it answers is not conditional:
     * `dissipationWeight` is GREY, so a v2 candidate always states it and the
     * term is always live, and a live term always measures something.
     *
     * WHICH something is settled by what the term is for. A3j row 23 and A4 M-E
     * both define the damage as Q_es multiplication, `1 + R_source/R_e` on the
     * DC resistance — so the candidate names R_e, in both arms, with and
     * without a safety set. */
    expect(full().stated.dissipationReferenceSource).toBe('re');
    expect(bare().stated.dissipationReferenceSource).toBe('re');
    for (const d of [full(), bare()]) {
      expect(d.absent.some((a) => a.key === 'dissipationReferenceSource')).toBe(false);
      expect(d.delegated.some((g) => g.key === 'dissipationReferenceSource')).toBe(false);
    }

    /* P4 IS ANSWERED ONE LAYER DOWN, and this assert is what says so out loud:
     * the candidate carries no R_e and may not, because whether one was
     * RESOLVED is a measured fact and not a designer setting. The tuner reports
     * the absence (`dissipationRefNote`) and produces no ratio. */
    expect(Object.keys(full().stated)).not.toContain('dissipationReferenceReOhm');

    // An explicit source still wins, so V37's before/after is a run someone can
    // ask for rather than a build that has to be patched.
    const onProbe = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { dissipationReferenceSource: 'probe' },
    });
    expect(onProbe.stated.dissipationReferenceSource).toBe('probe');

    // ...and it moves the fingerprint, or the choice would be a label.
    expect(JSON.stringify(declarationKey(bare(), {}))).not.toBe(
      JSON.stringify(declarationKey(onProbe, {})),
    );
  });

  it('V38-fix — every candidate states WHAT CURVE the amplitude term measures, and it is the sum', () => {
    /* THE SECOND UNCONDITIONAL DERIVATION, for the same shape of reason as
     * V37's: the question is not conditional. Every candidate is judged on the
     * amplitude of its complex sum — `judgeResponse`'s RMS deviation, the SPL
     * window, the staged targets and every gate read that one curve — so every
     * candidate has to say which curve its SEARCH minimises the spread of.
     *
     * ZERO IS NOT A CASUS-1 NUMBER, and the difference matters because a v2
     * default that was one would be P6's exact failure. It is "measure the
     * curve that will be judged". The width above it, 1/12 octave, is the app's
     * historical preference and stays the tuner's default: this states what the
     * v2 route measures, it does not change what anybody else measures. */
    expect(full().stated.errorSmoothOct).toBe(SEARCH_SMOOTHING_OCTAVES);
    expect(bare().stated.errorSmoothOct).toBe(SEARCH_SMOOTHING_OCTAVES);
    for (const d of [full(), bare()]) {
      expect(d.absent.some((a) => a.key === 'errorSmoothOct')).toBe(false);
      expect(d.delegated.some((g) => g.key === 'errorSmoothOct')).toBe(false);
    }

    /* An explicit width still wins, so V38-fix's before/after is a run someone
     * can ask for rather than a build that has to be patched — the same
     * property V30, V33, V34 and V37 each rest on. */
    const smoothed = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { errorSmoothOct: 1 / 12 },
    });
    expect(smoothed.stated.errorSmoothOct).toBe(1 / 12);
    expect(smoothed.absent.some((a) => a.key === 'errorSmoothOct')).toBe(false);

    // ...and the width moves the fingerprint, or the choice would be a label.
    expect(JSON.stringify(declarationKey(bare(), {}))).not.toBe(
      JSON.stringify(declarationKey(smoothed, {})),
    );
  });

  it('V44 — every candidate states WHICH POINTS a phase judgement rests on', () => {
    /* THE THIRD UNCONDITIONAL DERIVATION, same shape as V37's and V38-fix's:
     * the question is not conditional. Every candidate is judged on phase — the
     * `phase-tracking` requirement reads it per handover, the objective carries
     * it under `phasePriority`, and the panel prints it — so every candidate has
     * to say which points that judgement rests on.
     *
     * 'MEASURED' IS NOT A CASUS-1 NUMBER. It states no frequency and no limit;
     * the three grounds are the measurement's own validity band, the caller's
     * own ghost convention, and the overlap window that already lived in
     * `integration.ts`. */
    expect(full().stated.phaseAdmission).toBe('measured');
    expect(bare().stated.phaseAdmission).toBe('measured');
    for (const d of [full(), bare()]) {
      expect(d.absent.some((a) => a.key === 'phaseAdmission')).toBe(false);
      expect(d.delegated.some((g) => g.key === 'phaseAdmission')).toBe(false);
    }

    /* An explicit admission still wins, so V44's before/after is a run someone
     * can ask for rather than a build that has to be patched — the property
     * V30, V33, V34, V37 and V38-fix each rest on. */
    const historic = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { phaseAdmission: 'overlap' },
    });
    expect(historic.stated.phaseAdmission).toBe('overlap');
    expect(historic.absent.some((a) => a.key === 'phaseAdmission')).toBe(false);

    // ...and it moves the fingerprint, or the choice would be a label.
    expect(JSON.stringify(declarationKey(bare(), {}))).not.toBe(
      JSON.stringify(declarationKey(historic, {})),
    );
  });

  it('V45 — the candidate states WHAT THE AMPLITUDE TERM IS FLAT AGAINST, or files it absent', () => {
    /* DERIVED, like V30's `zFloorBarrier`, and from the same finding one axis
     * along: a reference that exists but does not steer changes nothing. Three
     * states and not two, which is why the input is the CURVE and not a flag.
     *
     * (a) A design with an evaluable voicing arms it. */
    const voiced = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: {},
      targetCurve: { type: 'bass-plateau', plateauDepthDb: 2.5, stepHz: 442 },
    });
    expect(voiced.stated.amplitudeReference).toBe('target');
    expect(voiced.absent.some((a) => a.key === 'amplitudeReference')).toBe(false);

    /* (b) No curve at all ⇒ ABSENT with the P4 reason, never a stated 'flat'.
     * A stated flat would read as "somebody decided the voicing must not
     * steer", and with no voicing stated nobody decided anything. */
    expect(bare().stated.amplitudeReference).toBeUndefined();
    expect(bare().absent.find((a) => a.key === 'amplitudeReference')?.why ?? '')
      .toMatch(/P4/);

    /* (c) A FLAT curve ⇒ also absent, and for a different reason that the text
     * has to give: subtracting it is the identity, so arming the mechanism
     * would put a key in the run that provably cannot move anything (V23). */
    const neutral = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: {},
      targetCurve: FLAT_TARGET,
    });
    expect(neutral.stated.amplitudeReference).toBeUndefined();
    expect(neutral.absent.find((a) => a.key === 'amplitudeReference')?.why ?? '')
      .toContain('identity');

    /* (d) A stated shape whose parameters never arrived is a THIRD sentence:
     * a curve nothing can sample steers nothing, and that is a report about the
     * data rather than about the voicing. */
    const unusable = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: {},
      targetCurve: { type: 'bass-plateau', plateauDepthDb: 2.5 },
    });
    expect(unusable.stated.amplitudeReference).toBeUndefined();
    expect(unusable.absent.find((a) => a.key === 'amplitudeReference')?.why ?? '')
      .toContain('cannot be evaluated');
    // The three reasons are three different sentences, or a reader cannot tell
    // which of the three states produced the absence.
    const why = (d: ReturnType<typeof declareCandidateChoices>): string =>
      d.absent.find((a) => a.key === 'amplitudeReference')!.why;
    expect(new Set([why(bare()), why(neutral), why(unusable)]).size).toBe(3);

    /* An explicit value still wins, so V45's before/after is a run someone can
     * ask for — the property V30, V33, V34, V37, V38-fix and V44 each rest on. */
    const forcedFlat = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { amplitudeReference: 'flat' },
      targetCurve: { type: 'bass-plateau', plateauDepthDb: 2.5, stepHz: 442 },
    });
    expect(forcedFlat.stated.amplitudeReference).toBe('flat');
    expect(forcedFlat.absent.some((a) => a.key === 'amplitudeReference')).toBe(false);

    // ...and it moves the fingerprint, or the choice would be a label.
    expect(JSON.stringify(declarationKey(voiced, {}))).not.toBe(
      JSON.stringify(declarationKey(forcedFlat, {})),
    );
  });

  it('V47 — the candidate states WHICH RULE forbids an unprotected upper driver', () => {
    /* DERIVED, like V30's `zFloorBarrier` and V45's `amplitudeReference`, and
     * from the same finding: a stated requirement that another rule silently
     * overrides decides nothing.
     *
     * (a) A design that states a drive limit arms the stated rule. */
    const limited = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: {},
      driveOnFsLimitDb: -25,
    });
    expect(limited.stated.protectionRule).toBe('stated');
    expect(limited.absent.some((a) => a.key === 'protectionRule')).toBe(false);

    /* (b) No limit ⇒ ABSENT with the P4 reason, and NEVER a stated 'seed'. The
     * tuner then reads its own default, which IS the seed comparison — named as
     * absent rather than inherited in silence, and kept because a comparison to
     * the seed without a requirement still beats no comparison at all. */
    expect(bare().stated.protectionRule).toBeUndefined();
    const why = bare().absent.find((a) => a.key === 'protectionRule')?.why ?? '';
    expect(why).toMatch(/P4/);
    expect(why).toContain('seed');

    /* An explicit value still wins, so V47's before/after is a run someone can
     * ask for — the property V30, V33, V34, V37, V38-fix, V44 and V45 rest on. */
    const forced = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { protectionRule: 'seed' },
      driveOnFsLimitDb: -25,
    });
    expect(forced.stated.protectionRule).toBe('seed');
    expect(forced.absent.some((a) => a.key === 'protectionRule')).toBe(false);

    // ...and it moves the fingerprint, or the choice would be a label.
    expect(JSON.stringify(declarationKey(limited, {}))).not.toBe(
      JSON.stringify(declarationKey(forced, {})),
    );

    /* THE LIMIT ITSELF DOES NOT TRAVEL AS A TUNER OPTION, and that is the shape
     * that distinguishes this key from the five pairs above: the number is a
     * GATE (`v2.gates.maxDriveOnFsDb`), so the declaration names the RULE and
     * nothing else. A candidate that also carried the decibels would be a
     * second copy of a stated requirement. */
    expect(Object.keys(limited.stated)).not.toContain('maxDriveOnFsDb');
  });

  it('V48 — the candidate states WHICH NETWORK the series-inductance ceiling describes', () => {
    /* DERIVED, like V45's `amplitudeReference` and V47's `protectionRule`, and
     * from the same finding one rule along: a bound solved for a network the
     * search has already left stops describing what it bounds.
     *
     * (a) A design that states an LF budget arms the tracking ceiling. */
    const budgeted = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: {},
      lfBumpBudgetDb: 1.4,
    });
    expect(budgeted.stated.seriesInductanceCeilingSource).toBe('tuned');
    expect(budgeted.absent.some((a) => a.key === 'seriesInductanceCeilingSource')).toBe(false);

    /* (b) No budget ⇒ ABSENT with the P4 reason, and NEVER a stated 'seed'.
     * With nothing stated there is no inversion, no ceiling and nothing for a
     * tune to move underneath — so naming the seed reading would claim somebody
     * chose which network the ceiling should describe. */
    expect(bare().stated.seriesInductanceCeilingSource).toBeUndefined();
    const why = bare().absent.find((a) => a.key === 'seriesInductanceCeilingSource')?.why ?? '';
    expect(why).toMatch(/P4/);
    expect(why).toContain('LF-lift budget');

    /* An explicit value still wins, so V48's before/after is a run someone can
     * ask for — and on this key that property is not a courtesy but the whole
     * measurement: the two arms of `measure-v48-ceiling-tracking.ts` differ in
     * this one word and in nothing else. */
    const forced = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { seriesInductanceCeilingSource: 'seed' },
      lfBumpBudgetDb: 1.4,
    });
    expect(forced.stated.seriesInductanceCeilingSource).toBe('seed');
    expect(forced.absent.some((a) => a.key === 'seriesInductanceCeilingSource')).toBe(false);

    // ...and it moves the fingerprint, or the choice would be a label.
    expect(JSON.stringify(declarationKey(budgeted, {}))).not.toBe(
      JSON.stringify(declarationKey(forced, {})),
    );

    /* THE BUDGET ITSELF DOES NOT TRAVEL AS A TUNER OPTION, the same shape V47
     * has: the decibels are `v2.budgets.lfBumpBudgetDb`, inverted by
     * `invertBudgets`, and the declaration names the RULE and nothing else. */
    expect(Object.keys(budgeted.stated)).not.toContain('lfBumpBudgetDb');
  });

  it('V34 — an unstated source-resistance limit is ABSENT, and the worker makes the chain honour it', () => {
    /* Two halves, and the second is the one that was missing. `put()` has
     * always filed an unstated `rSourceDisqualifyOhm` as absent with the P4
     * reason — but the chain resolves that key OUTSIDE the tuner
     * (`runThreeWayChain`'s own default), where `choices.ts` does not reach, so
     * "absent" still produced a 2.0 Ω limit in the search and in the ranking's
     * disqualification list. */
    const d = bare();
    expect(d.stated.rSourceDisqualifyOhm).toBeUndefined();
    expect(d.absent.find((a) => a.key === 'rSourceDisqualifyOhm')?.why ?? '').toMatch(/P4/);

    const base = { settings: { rSourceDisqualifyOhm: 2.0 }, other: 1 };
    // Absent in the declaration ⇒ an explicit `null` on the wire: no limit,
    // rather than the chain's historical default.
    expect(withDeclaredSourceLimit(base, d).settings.rSourceDisqualifyOhm).toBe(null);
    // Stated ⇒ the stated value, whatever the chain input happened to carry.
    expect(withDeclaredSourceLimit(base, full()).settings.rSourceDisqualifyOhm).toBe(2);
    const other = declareCandidateChoices({
      cages: [[400, 500], [1500, 2000]],
      windowFloorsHz: [397, 1294],
      multiWay: true,
      stated: { rSourceDisqualifyOhm: 1.25 },
    });
    expect(withDeclaredSourceLimit(base, other).settings.rSourceDisqualifyOhm).toBe(1.25);
    // NO declaration ⇒ the identity, which is what keeps every v1 caller and
    // every candidate-less v2 payload byte-identical.
    expect(withDeclaredSourceLimit(base, undefined)).toBe(base);
  });

  it('V30 — the barrier weight rides in the fingerprint as a GREY VALUE, with its provenance', () => {
    /* 1200 is a v1 constant tuned for the repair pass. A v2 run that arms the
     * barrier is steered by it, so it must be visible in the stamp and it must
     * arrive labelled — an inherited constant and a derived one are the same
     * number and a different claim (V21, V22, V25). */
    const armed = greyValues(full().stated);
    expect(armed.zFloorBarrierWeight?.value).toBe(AMP_FLOOR_BARRIER_WEIGHT);
    expect(armed.zFloorBarrierWeight?.origin).toMatch(/niet v2-afgeleid/);
    // Not recorded when nothing reads it: an unarmed barrier hands the search
    // no number, and a fingerprint that carried it anyway would say it did.
    expect(greyValues(bare().stated)).toEqual({});
    // ...and it really does move the fingerprint.
    const withGrey = JSON.stringify(declarationKey(full(), {}));
    const withoutBarrier = JSON.stringify(
      declarationKey({ ...full(), stated: { ...full().stated, zFloorBarrier: false } }, {}),
    );
    expect(withGrey).not.toBe(withoutBarrier);
    expect(withGrey).toContain('zFloorBarrierWeight');
    expect(withoutBarrier).not.toContain('zFloorBarrierWeight');
  });

  it('the candidate states its OWN two keys: the cages and the A5d.3 floors', () => {
    const d = bare();
    expect(d.stated.xoRangePairs).toEqual([[400, 500], [1500, 2000]]);
    // Audit §6.3 in one assertion: the floor that steers is the A5d.3 window
    // floor, not the v1 physics floor.
    expect(d.stated.xoFloorPairs).toEqual([397, 1294]);
    const floorWhy = d.absent.find((a) => a.key === 'xoFloorPairs');
    expect(floorWhy).toBeUndefined();
  });

  it('every absent and delegated key carries a REASON, and a reason is a sentence', () => {
    const d = bare();
    for (const a of d.absent) expect(a.why.length, `${a.key} has a stub reason`).toBeGreaterThan(40);
    for (const g of d.delegated) {
      expect(g.why.length, `${g.key} has a stub reason`).toBeGreaterThan(40);
      expect(g.to.length).toBeGreaterThan(3);
    }
  });

  it('branchTargets is DELEGATED to the design step and not re-derived (V21, one layer up)', () => {
    const d = bare();
    const bt = d.delegated.find((g) => g.key === 'branchTargets');
    expect(bt?.to).toMatch(/design step/);
    expect(bt?.why).toMatch(/second implementation of chain logic/);
  });

  it('the declaration is a fingerprint ingredient, and the REASONS move it', () => {
    /* A key that moves from delegated to absent is a different run even when no
     * value changed, because something else is deciding it now. */
    const a = JSON.stringify(declarationKey(bare(), {}));
    const b = JSON.stringify(declarationKey(full(), {}));
    expect(a).not.toBe(b);
    const d = bare();
    const reworded = {
      ...d,
      delegated: d.delegated.map((g) =>
        g.key === 'branchTargets' ? { ...g, to: 'somewhere else entirely' } : g,
      ),
    };
    expect(JSON.stringify(declarationKey(reworded, {}))).not.toBe(a);
  });

  /* ================================================================== *
   * V41 — the two keys A3j's guarantee did not reach
   * ================================================================== */

  it('V41 — the chain-level list is covered, and it says out loud that it is a SUBSET', () => {
    /* The completeness claim here is deliberately narrower than the one above,
     * and the narrowness is the honest part. `CHOICE_KEYS` covers ALL of
     * `NetOptimizeOptions`; this list covers two keys of `Chain3Settings` and
     * makes no claim about the other thirty. V38 recorded the whole layer as a
     * gap (beslispunt D) and V39 owns it; V41 closes the two keys a
     * MEASUREMENT condemned, which is the standard row 11 of the A3j table
     * sets — a classification moves when a measurement moves it, not on
     * suspicion. */
    const cover = chainDeclarationCoverage(declareCandidateChainChoices({ stated: {} }));
    expect(cover.complete).toBe(true);
    expect(cover.missing).toEqual([]);
    expect(cover.duplicated).toEqual([]);

    // The coverage check can actually fail — otherwise "complete" above is a
    // property of an empty rule rather than of the declaration.
    const holed = chainDeclarationCoverage({
      stated: { eqBands: 2 },
      absent: [],
    });
    expect(holed.complete).toBe(false);
    /* V51 — the third key is missing here as well; a key with an ABSENT state
     * still has to be declared in one. */
    expect(holed.missing).toEqual(['leanTargetDb', 'lowestWayLevelWork']);
  });

  it('V41 — neither chain key may migrate into the tuner\'s own classification', () => {
    /* The mirror of the "never migrate back" pins V33, V34, V37 and V38-fix
     * each carry, pointed the other way: these two are not tuner options and a
     * future refactor that made them so would move the decision to a stage that
     * runs after the topology is fixed. `eqBands` decides what `deriveTopology`
     * may PROPOSE and `leanTargetDb` whether `synthesize` BUILDS it; the value
     * tune only moves numbers between the components those two chose. */
    for (const k of CHAIN_CHOICE_KEYS) {
      expect(CHOICE_KEYS as readonly string[]).not.toContain(k);
      expect(GREY_KEYS as readonly string[]).not.toContain(k);
      expect(POLISH_KEYS as readonly string[]).not.toContain(k);
    }
    // And the list is exactly the list: a fourth key is a decision somebody has
    // to write down, not something that arrives with a rename. V51 wrote the
    // third down (`lowestWayLevelWork`): whether the LOWEST way may carry level
    // work, decided before the tuner exists and therefore a chain key.
    expect([...CHAIN_CHOICE_KEYS].sort()).toEqual(['eqBands', 'leanTargetDb', 'lowestWayLevelWork']);
  });
});
