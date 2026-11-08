import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refinePlan } from './refineRun.ts';

const row = [
  { pair: 'woofer→mid', hz: 466.7, window: [397, 549] as const },
  { pair: 'mid→tweeter', hz: 2116.5, window: [1555, 2287] as const },
];

describe('refine around one design', () => {
  it('three positions on the asked handover, the others stay', () => {
    const p = refinePlan(row, 0, 1 / 6)!;
    expect(p.perAxisHz[1]).toEqual([2116.5]);
    expect(p.perAxisHz[0]).toEqual([415.8, 466.7, 523.9]);
    expect(p.droppedHz).toEqual([]);
  });

  it('a position outside the window is dropped and reported', () => {
    const p = refinePlan(row, 1, 1 / 6)!;
    expect(p.perAxisHz[1]).toEqual([1885.6, 2116.5]);
    expect(p.droppedHz.length).toBe(1);
    expect(p.perAxisHz[0]).toEqual([466.7]);
  });

  it('no such handover, no plan', () => {
    expect(refinePlan(row, 2, 1 / 6)).toBeNull();
  });

  it('the app runs ONLY the stated positions, and the row stops the click from loading', () => {
    const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf-8');
    expect(APP.match(/\.\.\.\(runOpts\.refine \? \{ statedOnly: true \} : \{\}\),/g)?.length).toBe(4);
    expect(APP).toContain('e.stopPropagation();\n              refineAround(label, i);');
    expect(APP).toContain("setV2Field('fieldMode', id)");
  });
});
