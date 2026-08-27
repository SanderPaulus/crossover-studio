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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHOICE_KEYS,
  GREY_KEYS,
  POLISH_KEYS,
  declarationCoverage,
  declarationKey,
} from './choices.ts';
import { declareCandidateChoices } from './candidateDeclaration.ts';

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
    expect(keys.length).toBe(37);
    expect(CHOICE_KEYS.length + GREY_KEYS.length + POLISH_KEYS.length).toBe(37);
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
});
