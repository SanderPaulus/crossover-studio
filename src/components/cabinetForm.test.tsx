/**
 * UI-11 — "Your cabinet" is ONE form, with three entrances (22-11-2026).
 *
 * The cabinet fields were drawn three times (guided cards, expert ledger, the merge tool's
 * step 2), and the third copy did not know what the driver card knew: it asked a pair in
 * the side walls which of the two is the UPPER one (Sander: "mijn maat heeft 2 woofers,
 * ieder aan 1 zijkant"). These claims pin that every field now has one implementation
 * (`CabinetForm.tsx`), that the two App renderings and the merge tool MOUNT it rather than
 * redraw it, that the reference-point commit is one pure rule, and that "upper or lower"
 * is asked only where a pair stacks — the one rule `pairStacks`, shared with the height
 * reader.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { CABINET_FORM_VERSION, CabinetBoxFields, DriverCountFields, DriverMountingFields, DriverPositionFields, DriverSdField, refDeeperThanBaffle } from './CabinetForm.tsx';
import { applyRefFromTop, emptyCabinet, type CabinetState } from '../lib/cabinetState.ts';
import { pairStacks, sourceAboveBottomMm, type CabinetGeometryForMerge } from '../lib/mergeSession.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, '..', 'App.tsx'), 'utf8');
const TOOL = readFileSync(join(HERE, 'NfMergeTool.tsx'), 'utf8');
const FORM = readFileSync(join(HERE, 'CabinetForm.tsx'), 'utf8');

/** The demo cabinet of casus 1, as "Your cabinet" holds it (strings; reference point 244 mm below the top). */
const koan = (): CabinetState => {
  const c = emptyCabinet();
  c.baffleWidthMm = '260';
  c.baffleHeightMm = '1124';
  c.refFromTopMm = '244';
  c.refDriver = 'high';
  c.drivers.mid = { ...c.drivers.mid, yMm: '-66' };
  c.drivers.low = { ...c.drivers.low, yMm: '-448.4', count: '2', spacingMm: '275.75' };
  return c;
};
const geomOf = (c: CabinetState): CabinetGeometryForMerge => {
  const n = (v: string) => (v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const one = (r: 'low' | 'mid' | 'high') => ({ yMm: n(c.drivers[r].yMm), count: n(c.drivers[r].count), spacingMm: n(c.drivers[r].spacingMm), facingFront: c.drivers[r].facing === 'front', opposed: c.drivers[r].opposed });
  return { baffleWidthMm: n(c.baffleWidthMm), baffleHeightMm: n(c.baffleHeightMm), refFromTopMm: n(c.refFromTopMm), drivers: { low: one('low'), mid: one('mid'), high: one('high') } };
};
const row = (label: string, fields: React.ReactNode, note?: React.ReactNode) => (
  <div className="row" key={label}>
    <b>{label}</b>
    {fields}
    {note ? <i>{note}</i> : null}
  </div>
);

describe('UI-11 — the reference-point commit is one pure rule', () => {
  it('moving the reference marker shifts every stored y by the delta, keeps the reference driver at 0,0 and a first entry shifts nothing', () => {
    const c = koan();
    const moved = applyRefFromTop(c, '254'); // the marker 10 mm deeper: the drivers' below-top readings must not change
    expect(moved.refFromTopMm).toBe('254');
    expect(moved.drivers.mid.yMm).toBe('-56'); // −66 + 10: below the top it still reads 310 mm
    expect(moved.drivers.low.yMm).toBe('-438.4');
    expect(moved.drivers.high.yMm).toBe(''); // the reference driver IS the point
    expect(applyRefFromTop(c, '244')).toBe(c); // the same value: the same object
    const fresh = { ...emptyCabinet(), drivers: { ...emptyCabinet().drivers, mid: { ...emptyCabinet().drivers.mid, yMm: '-66' } } };
    expect(applyRefFromTop(fresh, '244').drivers.mid.yMm).toBe('-66'); // first-time entry: the offsets were already reference-relative
  });
  it('a reference point deeper than the baffle is tall is the one impossibility the box can see', () => {
    expect(refDeeperThanBaffle(koan())).toBe(false);
    expect(refDeeperThanBaffle({ ...koan(), refFromTopMm: '1200' })).toBe(true);
    expect(refDeeperThanBaffle({ ...koan(), baffleHeightMm: '' })).toBe(false); // nothing to compare with
  });
});

describe('UI-11 — the fields render from the state, and write through the setter they are given', () => {
  it('the box: the origin select, the front panel and the reference point, each row through the caller’s renderer', () => {
    const c = koan();
    const html = renderToStaticMarkup(<CabinetBoxFields cabinet={c} setCabinet={() => {}} onCommitRefTop={() => {}} row={row} frontNote="step ≈ 442 Hz" />);
    expect(html).toContain('<option value="high" selected="">');
    expect(html).toContain('value="260"');
    expect(html).toContain('value="1124"');
    expect(html).toContain('value="244"');
    expect(html).toContain('step ≈ 442 Hz');
    expect((html.match(/<div class="row">/g) ?? []).length).toBe(3);
    // the ledger's narrow layout: one field per row, the same five controls
    const narrow = renderToStaticMarkup(<CabinetBoxFields cabinet={c} setCabinet={() => {}} onCommitRefTop={() => {}} row={row} layout="narrow" />);
    expect((narrow.match(/<div class="row">/g) ?? []).length).toBe(5);
    expect((narrow.match(/<input/g) ?? []).length).toBe((html.match(/<input/g) ?? []).length);
    expect((narrow.match(/<select/g) ?? []).length).toBe(1);
    // the merge tool's variant: no origin select, no height above the floor
    const lean = renderToStaticMarkup(<CabinetBoxFields cabinet={c} setCabinet={() => {}} onCommitRefTop={() => {}} row={row} showMicAimed={false} showAboveFloor={false} />);
    expect(lean).not.toContain('<select');
    expect(lean).not.toContain('above the floor');
    expect((lean.match(/<div class="row">/g) ?? []).length).toBe(2);
  });
  it('the driver: count and spacing, the position as a ruler reads it (below the top), mounting with the opposed-pair tick only for a non-front pair, and S_d', () => {
    const c = koan();
    const count = renderToStaticMarkup(<DriverCountFields d={c.drivers.low} set={() => {}} />);
    expect(count).toContain('value="2"');
    expect(count).toContain('value="275.75"');
    expect(renderToStaticMarkup(<DriverCountFields d={c.drivers.mid} set={() => {}} />)).not.toContain('mm apart');
    const pos = renderToStaticMarkup(<DriverPositionFields cabinet={c} role="mid" set={() => {}} />);
    expect(pos).toContain('value="310"'); // 244 − (−66): the ruler reading, not the stored y
    expect(pos).toContain('mm below the top');
    expect(renderToStaticMarkup(<DriverPositionFields cabinet={c} role="high" set={() => {}} />)).toContain('the mic was aimed here');
    const front = renderToStaticMarkup(<DriverMountingFields d={c.drivers.low} set={() => {}} />);
    expect(front).toContain('<option value="front" selected="">');
    expect(front).not.toContain('opposed pair');
    const side = renderToStaticMarkup(<DriverMountingFields d={{ ...c.drivers.low, facing: 'left' }} set={() => {}} />);
    expect(side).toContain('opposed pair');
    expect(renderToStaticMarkup(<DriverSdField value="255" onChange={() => {}} />)).toContain('value="255"');
  });
});

describe('UI-11 — "upper or lower" is asked only where a pair stacks: one rule, two readers', () => {
  it('a front pair on a tall baffle stacks; a pair in the side walls, an opposed pair, or a pair on a wide baffle does not', () => {
    const c = koan();
    expect(pairStacks(geomOf(c), 'low')).toBe(true);
    expect(pairStacks(geomOf(c), 'mid')).toBe(false); // one driver is no pair
    const side = { ...c, drivers: { ...c.drivers, low: { ...c.drivers.low, facing: 'left' as const } } };
    expect(pairStacks(geomOf(side), 'low')).toBe(false);
    const opposed = { ...c, drivers: { ...c.drivers, low: { ...c.drivers.low, facing: 'left' as const, opposed: true } } };
    expect(pairStacks(geomOf(opposed), 'low')).toBe(false);
    expect(pairStacks(geomOf({ ...c, baffleWidthMm: '2000' }), 'low')).toBe(false);
  });
  it('the height reader is the second reader: a non-stacking pair sits at the pair’s centre and needs no member; a stacking one needs it and offsets by half the spacing', () => {
    const c = koan();
    const side = { ...c, drivers: { ...c.drivers, low: { ...c.drivers.low, facing: 'left' as const } } };
    const h = sourceAboveBottomMm({ kind: 'cabinet', way: 'low', member: null }, geomOf(side));
    expect('mm' in h && h.mm).toBeCloseTo(1124 - 244 - 448.4, 6);
    expect('mm' in h && h.from).toContain('does not stack');
    const need = sourceAboveBottomMm({ kind: 'cabinet', way: 'low', member: null }, geomOf(c));
    expect('missing' in need && need.missing.join(' ')).toContain('upper or lower');
    const upper = sourceAboveBottomMm({ kind: 'cabinet', way: 'low', member: 'upper' }, geomOf(c));
    expect('mm' in upper && upper.mm).toBeCloseTo(1124 - 244 - 448.4 + 275.75 / 2, 6);
    // the rule inside the reader IS `pairStacks` — no second spelling of it
    const lib = readFileSync(join(HERE, '..', 'lib', 'mergeSession.ts'), 'utf8');
    expect((lib.match(/d\.facingFront && !d\.opposed && geom\.baffleWidthMm !== null/g) ?? []).length).toBe(1);
    expect(lib).toContain('const stacked = pairStacks(geom, p.way);');
  });
  it('the merge tool asks the member only behind `pairStacks`, and says why a non-stacking pair is not asked', () => {
    expect(TOOL).toMatch(/const stacks = pairStacks\(props\.geometry, w\);/);
    expect(TOOL).toMatch(/\{stacks && members >= 2 \? mergeRow\(\s*t\('member of the pair'\)/);
    expect(TOOL).toContain("Number(pd.count) > 1 && !stacks ? t('this pair does not stack, so both sit at the pair’s centre height — no upper or lower') : undefined");
  });
});

describe('UI-11 — three entrances mount the one form; none redraws a field', () => {
  it('App.tsx mounts the box fields twice (guided cards, expert ledger) and the driver fields once per card, and draws none of them itself', () => {
    expect((APP.match(/<CabinetBoxFields/g) ?? []).length).toBe(2);
    expect((APP.match(/<DriverCountFields d=\{d\} set=\{set\} \/>/g) ?? []).length).toBe(1);
    expect((APP.match(/<DriverPositionFields cabinet=\{cabinet\} role=\{role\} set=\{set\} \/>/g) ?? []).length).toBe(2); // the reference driver's and the other branch
    expect((APP.match(/<DriverMountingFields d=\{d\} set=\{set\} \/>/g) ?? []).length).toBe(1);
    expect((APP.match(/<DriverSdField value=\{sdCm2\[role\]\}/g) ?? []).length).toBe(1);
    for (const gone of ["cab('baffleWidthMm')", "cab('baffleHeightMm')", "cab('refHeightMm')", 'value={cabinet.baffleWidthMm}', 'value={cabinet.refDriver}', 'value={d.count}', 'value={d.spacingMm}', 'value={d.xMm}', 'value={d.facing}', 'checked={d.opposed}', 'refTopVeld', 'function commitRefTop']) {
      expect(APP.includes(gone), `App.tsx still draws ${gone}`).toBe(false);
    }
    expect(APP).toContain('const commitRefTop = useCallback((v: string) => setCabinet((c) => applyRefFromTop(c, v)), []);');
    // the reference driver is 0,0 by definition, and the geometry the merge tool reads says so (seen in the browser:
    // the tweeter, the mic's aim, read "without the height" while its height is the reference height itself)
    expect(APP).toContain("yMm: r === cabinet.refDriver ? 0 : n(d.yMm),");
  });
  it('the merge tool mounts the same components on the project’s own state, and has no link to "the full form" left to offer', () => {
    expect(TOOL).toContain("import { CabinetBoxFields, DriverCountFields, DriverMountingFields, DriverPositionFields, DriverSdField, type CabinetRow, type SetCabinet } from './CabinetForm.tsx';");
    expect(TOOL).toMatch(/cabinet: CabinetState;\s*setCabinet: SetCabinet;/);
    expect(TOOL).not.toMatch(/onCabinet|onOpenCabinet|Open the full/);
    expect(APP).not.toMatch(/openCabinetFromMerge|mergeCabinetPatch|CabinetPatchForMerge/);
  });
  it('the component imports nothing from engine2 and carries its version', () => {
    expect(FORM).not.toMatch(/from '\.\.\/lib\/engine2/);
    expect(CABINET_FORM_VERSION).toBe('cabinet-form/1.0');
  });
});
