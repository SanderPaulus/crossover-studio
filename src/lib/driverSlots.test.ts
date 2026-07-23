import { describe, it, expect } from 'vitest';
import { isTweeterModel, pickSlots } from './driverSlots.ts';

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
