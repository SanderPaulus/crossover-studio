import { describe, it, expect } from 'vitest';
import { angleFromFilename } from './angles.ts';

describe('angleFromFilename', () => {
  it('recognises the common patterns', () => {
    expect(angleFromFilename('mid_hor15_mettape.txt')).toBe(15);
    expect(angleFromFilename('tweet_hor0_mettape.txt')).toBe(0);
    expect(angleFromFilename('driver 30deg.frd')).toBe(30);
    expect(angleFromFilename('driver_deg45.txt')).toBe(45);
    expect(angleFromFilename('HOR-60.txt')).toBe(60);
  });

  it('returns null for unmarked or nonsense names', () => {
    expect(angleFromFilename('woofer.frd')).toBeNull();
    expect(angleFromFilename('measurement_final2.txt')).toBeNull(); // no marker
    expect(angleFromFilename('hor999.txt')).toBeNull(); // > 180°
  });
});
