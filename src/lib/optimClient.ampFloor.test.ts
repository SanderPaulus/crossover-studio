import { describe, it, expect, vi } from 'vitest';
import type { ChainInput, ChainResult } from './designChain.ts';
import type { ScanProgress } from './optimClient.ts';

/**
 * THE LIVE ⚠Z BADGE ASKS THE DESIGNER'S QUESTION, NOT ITS OWN.
 *
 * The scan's per-candidate warning used to compare the delivered minimum
 * against a hard-coded 2.5 Ω of its own. That was wrong twice over: it could
 * flag a candidate the final table then passed (the two disagreed about the
 * threshold), and it passed judgement at all when nobody had said what
 * amplifier was on the other end of the cable.
 *
 * Both directions are pinned here, because only one of them is visible in a
 * normal run: the badge that WRONGLY APPEARS is the one a designer notices,
 * and the badge that wrongly stays away is the one that quietly costs him a
 * blown output stage.
 *
 * The client talks to real Workers, so this drives a fake one — what is under
 * test is the badge decision, not the solver.
 */

const posted: { id: number; label: string }[] = [];
const made: FakeWorker[] = [];

class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(msg: { id: number; payload: { label: string } }) {
    posted.push({ id: msg.id, label: msg.payload.label });
  }
  terminate() {}
}

vi.stubGlobal(
  'Worker',
  class extends FakeWorker {
    constructor() {
      super();
      made.push(this);
    }
  },
);

const flush = () => new Promise((r) => setTimeout(r, 0));

/** A finished candidate carrying only the fields the badge path reads. */
function completion(label: string, zMinOhm: number): ChainResult {
  return {
    label,
    zOk: true,
    zMinOhm,
    rounds: 1,
    evaluations: 100,
    net: { evaluations: 100, after: { rippleDb: 1.2, phaseDeg: 8 } },
  } as unknown as ChainResult;
}

/**
 * Run one candidate to completion and return the badge the progress view got.
 *
 * `ampMinLoadOhm: undefined` IS the empty input field — the designer left it
 * blank, so there is no rating to judge against.
 */
async function badgeFor(ampMinLoadOhm: number | undefined, zMinOhm: number): Promise<string | undefined> {
  posted.length = 0;
  const { runChainScan } = await import('./optimClient.ts');

  let last: ScanProgress | undefined;
  const label = 'c1';
  // No `targets`: that keeps the single run off the rescue path, so exactly
  // one candidate is posted and the badge is the only thing moving.
  const scan = runChainScan(
    {
      base: { settings: { ampMinLoadOhm } } as unknown as Omit<ChainInput, 'xoRange'>,
      variants: [{ label }],
    },
    (d) => {
      last = d;
    },
  );

  for (let guard = 0; guard < 50 && posted.length === 0; guard++) await flush();
  expect(posted).toHaveLength(1);
  made[0].onmessage?.({ data: { id: posted[0].id, kind: 'done', data: completion(label, zMinOhm) } });
  await scan;

  // The progress emit is throttled (trailing, 80 ms) — wait for the tick that
  // carries the finished row rather than racing it.
  for (let guard = 0; guard < 40; guard++) {
    if (last?.items.find((i) => i.label === label)?.done) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  const row = last?.items.find((i) => i.label === label);
  expect(row?.done).toBe(true);
  return row?.warn;
}

describe('live ⚠Z badge in the crossover scan', () => {
  it('NO amplifier stated: a 2.4 Ω minimum is reported, not judged', async () => {
    // 2.4 Ω is below the 2.5 Ω the badge used to carry. Nobody asked for that
    // number, so nothing may warn about it.
    expect(await badgeFor(undefined, 2.4)).toBeUndefined();
  });

  it('amplifier rated 4 Ω: a 3.5 Ω minimum is flagged while the candidate lands', async () => {
    // 3.5 Ω against a stated 4 Ω is short by more than the build-tolerance
    // allowance, so the badge appears — the same verdict the final table gives.
    expect(await badgeFor(4.0, 3.5)).toBe('⚠Z');
  });

  it('the badge and the ranking cannot disagree: both go through one rule', async () => {
    const { meetsAmpFloor } = await import('./impedanceFloor.ts');
    // Just inside the tolerance the single rule allows: no badge, and the
    // ranking would pass it too.
    expect(meetsAmpFloor(3.95, 4.0)).toBe(true);
    expect(await badgeFor(4.0, 3.95)).toBeUndefined();
  });
});
