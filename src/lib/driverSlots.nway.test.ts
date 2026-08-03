import { describe, expect, it } from 'vitest';
import { pickSlots, pickSlotsN } from './driverSlots.ts';

const d = (model: string) => ({ model });

describe('pickSlotsN', () => {
  it('two drivers: exactly the historical 2-way behavior, name-agnostic low', () => {
    // KOAN's low driver is literally called "mid" — pinned: in a 2-way it is
    // the LOW branch, never the mid slot.
    const drivers = [d('mid'), d('tweeter')];
    const n = pickSlotsN(drivers);
    const two = pickSlots(drivers);
    expect(n.woofer?.model).toBe('mid');
    expect(n.mid).toBeUndefined();
    expect(n.tweeter?.model).toBe('tweeter');
    expect(n.woofer?.model).toBe(two.woofer?.model);
    expect(n.tweeter?.model).toBe(two.tweeter?.model);
    expect(n.ambiguous).toBeUndefined();
  });

  it('three drivers: tweeter by name, mid by name, the rest is the woofer', () => {
    const n = pickSlotsN([d('Woofer 12w8524'), d('Midrange m15cf'), d('Tweeter r2604')]);
    expect(n.woofer?.model).toBe('Woofer 12w8524');
    expect(n.mid?.model).toBe('Midrange m15cf');
    expect(n.tweeter?.model).toBe('Tweeter r2604');
    expect(n.ambiguous).toBeUndefined();
  });

  it('refuses to guess when names cannot separate woofer from mid', () => {
    const neither = pickSlotsN([d('driver A'), d('driver B'), d('Tweeter r2604')]);
    expect(neither.ambiguous).toContain('mid');
    expect(neither.woofer).toBeUndefined();

    const both = pickSlotsN([d('mid one'), d('mid two'), d('Tweeter r2604')]);
    expect(both.ambiguous).toBeTruthy();
  });

  it('keeps helper parallel measurements out of the slots', () => {
    const n = pickSlotsN([d('woofer+tweeter parallel'), d('mid m15'), d('woofer 12w'), d('tweeter')]);
    expect(n.woofer?.model).toBe('woofer 12w');
    expect(n.mid?.model).toBe('mid m15');
    expect(n.tweeter?.model).toBe('tweeter');
  });

  it('more than three real drivers is refused, not truncated', () => {
    const n = pickSlotsN([d('w1'), d('w2'), d('mid'), d('tweeter')]);
    expect(n.ambiguous).toContain('not supported');
  });

  it('single driver: solo, low slot', () => {
    const n = pickSlotsN([d('fullrange frs8')]);
    expect(n.woofer?.model).toBe('fullrange frs8');
    expect(n.tweeter).toBeUndefined();
    expect(n.mid).toBeUndefined();
  });
});
