import { describe, expect, it } from 'vitest';
import { runPooled } from './pool.ts';

describe('runPooled', () => {
  it('keeps input order, never exceeds the pool size, and lets a free lane take the next item', async () => {
    // Durations chosen so lane 0's first item is the SLOW one: with static
    // "i % size" assignment item 2 (→ lane 0) would wait behind item 0 while
    // lane 1 sits idle; a real queue hands item 2 to lane 1 as soon as it is
    // free.
    const durations = [50, 5, 5, 5];
    let inFlight = 0;
    let maxInFlight = 0;
    const startedOn: number[] = [];
    const out = await runPooled(durations, 2, (ms, slot, i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      startedOn[i] = slot;
      return new Promise<string>((res) =>
        setTimeout(() => {
          inFlight--;
          res(`item${i}`);
        }, ms),
      );
    });
    expect(out).toEqual(['item0', 'item1', 'item2', 'item3']);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    // Items 1, 2 and 3 all ran on lane 1 while lane 0 was busy with item 0.
    expect(startedOn[0]).toBe(0);
    expect(startedOn[1]).toBe(1);
    expect(startedOn[2]).toBe(1);
    expect(startedOn[3]).toBe(1);
  });

  it('handles more lanes than items and an empty list', async () => {
    expect(await runPooled([1, 2], 8, async (x) => x * 2)).toEqual([2, 4]);
    expect(await runPooled([], 4, async (x: number) => x)).toEqual([]);
  });
});
