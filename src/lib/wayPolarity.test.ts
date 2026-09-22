import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  WAY_POLARITY_VERSION,
  describeWayPolarity,
  setWayPolarity,
  wayPolarities,
  type NetlistDriver,
  type WayPolarityInput,
} from './wayPolarity.ts';

const ROLES3 = ['woofer', 'mid', 'tweeter'] as const;

const drv = (partIndex: number, inverted: boolean): NetlistDriver => ({ partIndex, inverted });

const read = (o: Partial<WayPolarityInput> = {}) =>
  wayPolarities({
    roles: [...ROLES3],
    adjustFlags: [false, false],
    netlistDrivers: null,
    ...o,
  });

describe('U-7 — the effective polarity of one way', () => {
  /* ---- the XOR, by hand ------------------------------------------------ */

  it('is the XOR of the two carriers, on all four combinations', () => {
    // No netlist: the flag alone.
    expect(read({ adjustFlags: [false, true] }).map((w) => w.effective)).toEqual([false, false, true]);
    // Netlist alone.
    const nl = [drv(0, false), drv(1, true), drv(2, false)];
    expect(read({ netlistDrivers: nl }).map((w) => w.effective)).toEqual([false, true, false]);
    // Both on the SAME way cancel — the 360° that U-3d met head on.
    expect(
      read({ netlistDrivers: nl, adjustFlags: [true, false] }).map((w) => w.effective),
    ).toEqual([false, false, false]);
    // Both, on different ways.
    expect(
      read({ netlistDrivers: nl, adjustFlags: [false, true] }).map((w) => w.effective),
    ).toEqual([false, true, true]);
  });

  it('names the carrier that actually holds each way', () => {
    const ways = read({ netlistDrivers: [drv(0, false), null, null], adjustFlags: [true, false] });
    expect(ways.map((w) => w.carrier)).toEqual(['netlist', 'adjust', 'adjust']);
    // No netlist at all: the lowest way has no carrier, the others have the box.
    expect(read().map((w) => w.carrier)).toEqual(['none', 'adjust', 'adjust']);
  });

  it('flags a SPLIT — the sum and the export disagree', () => {
    const split = read({ netlistDrivers: [null, drv(7, true), null], adjustFlags: [true, false] });
    expect(split[1].split).toBe(true);
    // ... and the effective value is normal while the export would say reversed.
    expect(split[1].effective).toBe(false);
    expect(split[1].netlist).toBe(true);
    // The two single-carrier cases are NOT splits — without this the flag would
    // fire on every reversed way and say nothing.
    expect(read({ netlistDrivers: [null, drv(7, true), null] })[1].split).toBe(false);
    expect(read({ adjustFlags: [true, false] })[1].split).toBe(false);
  });

  /* ---- the lowest way -------------------------------------------------- */

  it('has no adjustment carrier for the lowest way, and says why', () => {
    const [low] = read();
    expect(low.settable).toBe(false);
    expect(low.why).toMatch(/reference/);
    expect(setWayPolarity(read(), [false, false], 0, true)).toEqual({
      kind: 'refused',
      why: low.why,
    });
  });

  it('CAN set the lowest way once a netlist part drives it', () => {
    const ways = read({ netlistDrivers: [drv(3, false), null, null] });
    expect(ways[0].settable).toBe(true);
    expect(setWayPolarity(ways, [false, false], 0, true)).toEqual({
      kind: 'netlist',
      partIndex: 3,
      inverted: true,
      adjustFlags: [false, false],
      normalised: false,
    });
  });

  it('READS a netlist it cannot edit, and says why it cannot write it', () => {
    // An imported .vxp variant: the bit is applied to the sum, so it must be
    // reported — a knob that showed 'normal' here would be lying about the
    // curve on screen — but there is no part index to stamp.
    const ways = read({ netlistDrivers: [null, { partIndex: null, inverted: true }, null] });
    expect(ways[1].effective).toBe(true);
    expect(ways[1].carrier).toBe('netlist');
    expect(ways[1].settable).toBe(false);
    expect(ways[1].why).toMatch(/\.vxp variant/);
    const plan = setWayPolarity(ways, [false, false], 1, false);
    expect(plan.kind).toBe('refused');
  });

  /* ---- the write plan -------------------------------------------------- */

  it('writes the flag when no part drives the way', () => {
    const ways = read();
    expect(setWayPolarity(ways, [false, false], 1, true)).toEqual({
      kind: 'adjust',
      adjustFlags: [true, false],
    });
    // ... and only that way's flag moves.
    expect(setWayPolarity(ways, [false, true], 1, true)).toEqual({
      kind: 'adjust',
      adjustFlags: [true, true],
    });
  });

  it('writes the PART and clears that way’s flag in one plan', () => {
    const ways = read({ netlistDrivers: [null, drv(9, true), null], adjustFlags: [true, false] });
    const plan = setWayPolarity(ways, [true, false], 1, true);
    expect(plan).toEqual({
      kind: 'netlist',
      partIndex: 9,
      inverted: true,
      adjustFlags: [false, false],
      normalised: true,
    });
  });

  /**
   * THE CLAIM THE WHOLE DESIGN RESTS ON: a press produces the effective value
   * it was asked for, from EVERY starting state. Applying half the plan would
   * land 180° out, which is why it is one value.
   */
  it('lands on the asked-for effective value from every starting state', () => {
    for (const partBit of [false, true]) {
      for (const flag of [false, true]) {
        for (const want of [false, true]) {
          const flags = [flag, false];
          const ways = read({ netlistDrivers: [null, drv(4, partBit), null], adjustFlags: flags });
          const plan = setWayPolarity(ways, flags, 1, want);
          expect(plan.kind).toBe('netlist');
          if (plan.kind !== 'netlist') continue;
          // Re-read the state the caller will be in after applying BOTH halves.
          const after = wayPolarities({
            roles: [...ROLES3],
            adjustFlags: plan.adjustFlags,
            netlistDrivers: [null, drv(4, plan.inverted), null],
          });
          expect(after[1].effective).toBe(want);
          expect(after[1].split).toBe(false);
        }
      }
    }
  });

  it('leaves every OTHER way exactly where it was', () => {
    const flags = [true, true];
    const nl = [drv(0, true), drv(1, false), drv(2, true)];
    const before = wayPolarities({ roles: [...ROLES3], adjustFlags: flags, netlistDrivers: nl });
    const plan = setWayPolarity(before, flags, 2, false);
    expect(plan.kind).toBe('netlist');
    if (plan.kind !== 'netlist') return;
    const after = wayPolarities({
      roles: [...ROLES3],
      adjustFlags: plan.adjustFlags,
      netlistDrivers: nl.map((d, i) => (i === 2 ? drv(2, plan.inverted) : d)),
    });
    expect(after.slice(0, 2).map((w) => w.effective)).toEqual(
      before.slice(0, 2).map((w) => w.effective),
    );
  });

  /**
   * VIA 'adjust' — the caller that may not edit a drawing (H-4b's follow)
   * still lands on the effective value it asked for, THROUGH the netlist bit.
   */
  it('reaches the asked-for effective value through the box alone', () => {
    for (const partBit of [false, true]) {
      for (const want of [false, true]) {
        const flags = [false, false];
        const ways = read({ netlistDrivers: [null, drv(4, partBit), null], adjustFlags: flags });
        const plan = setWayPolarity(ways, flags, 1, want, 'adjust');
        expect(plan.kind).toBe('adjust');
        if (plan.kind !== 'adjust') continue;
        const after = wayPolarities({
          roles: [...ROLES3],
          adjustFlags: plan.adjustFlags,
          netlistDrivers: [null, drv(4, partBit), null],
        });
        expect(after[1].effective).toBe(want);
        // The DRAWING is untouched — that is the whole point of this mode.
        expect(after[1].netlist).toBe(partBit);
        // And a split, when it made one, is visible rather than hidden.
        expect(after[1].split).toBe(after[1].netlist === true && after[1].adjust);
      }
    }
  });

  it('refuses a HELD way on both write paths, not just the knob’s', () => {
    // Hybrid mode's active side: "not chosen here" is a statement about the
    // WAY, so the follow's box-only path may not slip past it either.
    const held = ['the DSP owns this one', null, null];
    const ways = wayPolarities({
      roles: [...ROLES3],
      adjustFlags: [false, false],
      netlistDrivers: [drv(0, false), drv(1, false), drv(2, false)],
      readOnly: held,
    });
    expect(ways[0].settable).toBe(false);
    expect(ways[0].why).toBe('the DSP owns this one');
    expect(setWayPolarity(ways, [false, false], 0, true).kind).toBe('refused');
    expect(setWayPolarity(ways, [false, false], 0, true, 'adjust').kind).toBe('refused');
    // ... and the ways beside it are untouched by the hold.
    expect(ways[1].settable).toBe(true);
    expect(setWayPolarity(ways, [false, false], 1, true, 'adjust').kind).toBe('adjust');
  });

  /* ---- N-way and P6 ---------------------------------------------------- */

  it('is N-way: two ways and four ways read by the same rule', () => {
    const two = wayPolarities({
      roles: ['woofer', 'tweeter'],
      adjustFlags: [true],
      netlistDrivers: null,
    });
    expect(two.map((w) => w.effective)).toEqual([false, true]);
    const four = wayPolarities({
      roles: ['w', 'lm', 'um', 't'],
      adjustFlags: [false, true, true],
      netlistDrivers: null,
    });
    expect(four.map((w) => w.effective)).toEqual([false, false, true, true]);
    expect(four.map((w) => w.settable)).toEqual([false, true, true, true]);
  });

  it('names no way: the module never matches on a role', () => {
    const src = readFileSync(new URL('./wayPolarity.ts', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const name of ['woofer', 'tweeter', "'mid'", 'midInverted']) {
      expect(code).not.toContain(name);
    }
  });

  /* ---- the sentence ---------------------------------------------------- */

  it('describes the state and where it lives, and judges nothing', () => {
    const [, mid] = read({ netlistDrivers: [null, drv(1, true), null] });
    expect(describeWayPolarity(mid)).toMatch(/REVERSED/);
    expect(describeWayPolarity(mid)).toMatch(/driver part/);
    const [, boxed] = read({ adjustFlags: [true, false] });
    expect(describeWayPolarity(boxed)).toMatch(/adjustment box/);
    expect(describeWayPolarity(boxed)).toMatch(/nothing to export/);
    const [, split] = read({ netlistDrivers: [null, drv(1, true), null], adjustFlags: [true, false] });
    expect(describeWayPolarity(split)).toMatch(/does not show what you hear/);
  });

  it('carries a version string', () => {
    expect(WAY_POLARITY_VERSION).toBe('way-polarity/1.0');
  });
});

/* ====================================================================== *
 * THE APP HALF — a bronscan, because a unit test cannot say whether the
 * app RENDERS the knob or still renders the checkbox beside it. Two
 * controls over one state is exactly what U-7 removes.
 * ====================================================================== */

const APP = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

describe('U-7 — the knob in the app', () => {
  it('replaced both polarity checkboxes — there is no second control', () => {
    // The two that stood in the adjustment fieldsets.
    expect(APP).not.toContain('checked={inverted}');
    expect(APP).not.toContain('checked={midInverted}');
    // Nothing else writes the flags from a control any more: the only two
    // callers of the raw setters are the knob's writer and the loaders.
    const direct = APP.match(/onChange=\{\(e\) => \{?\s*set(?:Mid)?Inverted\(e\.target\.checked\)/g);
    expect(direct).toBeNull();
  });

  it('renders the knob in both adjustment fieldsets and in the strip', () => {
    // The way above the lowest (mid on a 3-way) and the top way.
    expect(APP).toContain('{polarityKnob(1)}');
    expect(APP).toContain('{polarityKnob(threeWay ? 2 : 1)}');
    // ... and every way, compact, beside the curves it changes.
    expect(APP).toContain('wayPolarity.map((_w, i) => polarityKnob(i, true))');
  });

  it('writes through the plan, and the netlist half through the undo-able edit', () => {
    const fn = APP.slice(APP.indexOf('const pressWayPolarity'), APP.indexOf('const pressWayPolarity') + 900);
    expect(fn).toContain('setWayPolarity(');
    // The netlist half is an ordinary schematic edit: undo-able, and it lands
    // on the WORKING design, so a loaded frozen candidate is copied rather
    // than written back (the fixture on disk is never touched by the app).
    expect(fn).toContain('commitSchematic(setPartProps(activeDesign.parts, plan.partIndex');
    // BOTH halves of the plan are applied — writing the part without clearing
    // the box lands 180° from what the knob says.
    expect(fn).toContain('writeInvertedFlags(plan.adjustFlags)');
  });

  /**
   * THE CLAIM THAT THE SIMULATION DID NOT MOVE. `branchAdj` is what reaches
   * `combine`/`combineN`, and U-7 does not touch it: the knob reads the two
   * carriers and writes one of them, and opening a project changes nothing.
   */
  it('leaves the simulation path exactly as it was', () => {
    const adj = APP.slice(APP.indexOf('const branchAdj = useMemo'), APP.indexOf('const branchAdj = useMemo') + 700);
    expect(adj).toContain('inverted,');
    expect(adj).toContain('inverted: midInverted,');
    // Not re-pointed at the effective value, which would change every
    // existing project's sum on open.
    expect(adj).not.toContain('wayPolarity');
    expect(adj).not.toContain('effective');
  });

  it('points the textbook labels at the EFFECTIVE state, not at the boxes', () => {
    const rel = APP.slice(APP.indexOf('const handoverRelative = useMemo'), APP.indexOf('const handoverRelative = useMemo') + 260);
    expect(rel).toContain('relativeBitsOf(effectiveFlags)');
    expect(rel).not.toContain('relativeBitsOf(invertedFlags)');
  });

  it('lets the H-4b follow reach the box and never the drawing', () => {
    const w = APP.slice(APP.indexOf('const writeHandoverRelative'), APP.indexOf('const writeHandoverRelative') + 1200);
    expect(w).toContain("'adjust'");
    // A change in the band form may not edit a network somebody drew (UI-2).
    expect(w).not.toContain('commitSchematic');
  });

  it('holds the active side read-only in Hybrid mode, and says whose it is', () => {
    const h = APP.slice(APP.indexOf('const polarityHeld = useMemo'), APP.indexOf('const polarityHeld = useMemo') + 1100);
    expect(h).toContain('v2ActiveSide.roles?.active');
    expect(h).toContain('DSP target block');
    expect(h).toContain('null measurement in the cabinet');
  });

  it('is what the EXPORT reads: one field, written by the knob', () => {
    const exp = readFileSync(new URL('./parsers/vxpExport.ts', import.meta.url), 'utf8');
    // The export reads the part's own bit — the field the knob settles into.
    expect(exp).toContain('part.inverted');
    // And `setPartProps` is the one writer of that field.
    const edit = readFileSync(new URL('./schematicEdit.ts', import.meta.url), 'utf8');
    expect(edit).toContain("'model' | 'inverted' | 'locked' | 'catalog'");
  });

  it('styles the knob as a STATE, and the split as the warning', () => {
    expect(CSS).toContain('.pol-knob.on');
    expect(CSS).toContain('.pol-knob.split');
    // A reversed way is an ordinary design choice; only the split — where the
    // export and the sum disagree — earns the alarm colour.
    const split = CSS.slice(CSS.indexOf('.pol-knob.split'), CSS.indexOf('.pol-knob.split') + 120);
    expect(split).toContain('var(--bad)');
  });
});
