import { describe, it, expect } from 'vitest';
import { isTweeterModel, pickSlots, withSlotAliases } from './driverSlots.ts';

describe('driver slot mapping', () => {
  it('recognises the tweeter slot by name, incl. freely-named vxp drivers', () => {
    expect(isTweeterModel('tweeter')).toBe(true);
    expect(isTweeterModel('Tweeter r2604-83200')).toBe(true);
    expect(isTweeterModel('HT 25')).toBe(true);
    expect(isTweeterModel('Hochtöner')).toBe(true);
    expect(isTweeterModel('mid')).toBe(false);
    expect(isTweeterModel('Woofer 12w8524')).toBe(false);
    expect(isTweeterModel('12w')).toBe(false);
  });

  it('maps a 2-way set to slots regardless of literal model names', () => {
    // KOAN-style names
    expect(pickSlots([{ model: 'mid' }, { model: 'tweeter' }])).toEqual({
      woofer: { model: 'mid' },
      tweeter: { model: 'tweeter' },
    });
    // The Robbert vxp names — the bug: these are NOT "mid"/"tweeter".
    const robbert = pickSlots([
      { model: 'Tweeter r2604-83200' },
      { model: 'Woofer 12w8524' },
    ]);
    expect(robbert.tweeter).toEqual({ model: 'Tweeter r2604-83200' });
    expect(robbert.woofer).toEqual({ model: 'Woofer 12w8524' });
  });

  it('ignores a helper "woofer+tweeter parallel" measurement driver', () => {
    const slots = pickSlots([
      { model: 'Woofer+tweeter parallel' }, // matches "tweeter" but is a sum
      { model: 'Tweeter r2604' },
      { model: 'Woofer 12w' },
    ]);
    expect(slots.tweeter).toEqual({ model: 'Tweeter r2604' });
    expect(slots.woofer).toEqual({ model: 'Woofer 12w' });
  });
});

describe('withSlotAliases — model-keyed maps also resolve by mid/tweeter slot', () => {
  it('adds mid/tweeter aliases for a vxp-style model-keyed map', () => {
    // The Robbert bug: impedances keyed by model, but synthesis + the design
    // chain address driverZ.mid / driverZ.tweeter → undefined → crash.
    const z = { 'Woofer 12w8524': [1, 2], 'Tweeter r2604-83200': [3, 4] };
    const out = withSlotAliases(z);
    expect(out.mid).toBe(z['Woofer 12w8524']); // same reference, not a copy
    expect(out.tweeter).toBe(z['Tweeter r2604-83200']);
    // originals untouched
    expect(out['Woofer 12w8524']).toBe(z['Woofer 12w8524']);
  });

  it('is a no-op when the map is already slot-keyed', () => {
    const z = { mid: [1], tweeter: [2] };
    const out = withSlotAliases(z);
    expect(out).toEqual({ mid: [1], tweeter: [2] });
    expect(Object.keys(out).sort()).toEqual(['mid', 'tweeter']);
  });

  it('never overwrites an existing mid/tweeter entry', () => {
    const z = { mid: [1], 'Tweeter r2604': [2] };
    const out = withSlotAliases(z);
    expect(out.mid).toEqual([1]); // kept
    expect(out.tweeter).toBe(z['Tweeter r2604']); // aliased
  });
});
