/**
 * UI-5 — APPROVAL IN THE MERGE TOOL (Sander, 15-11-2026: "de accept merge knop is onduidelijk en
 * is per tabblad/per driver"). An approval is a copy of a driver's merge as it was. Until UI-5 that
 * copy stayed "✓ accepted" after the settings moved on, and export and "Use in project…" took the
 * old copy without a word; it could not be withdrawn; and the button sat at the bottom of a long
 * column, per driver. Now: a fingerprint per approval, stale copies are shown and left out, an
 * approval can be withdrawn, and one sticky bar in step 4 approves the driver on screen.
 *
 * Source scans in the UI-1 idiom (where the app renders and what it reads is the claim), plus the
 * fingerprint as a pure function. Comments are stripped first.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stableKey } from '../components/NfMergeTool.tsx';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SRC = strip(readFileSync('src/components/NfMergeTool.tsx', 'utf8'));

describe('UI-5 — the fingerprint', () => {
  it('ignores key order and empty values, and moves with every real value', () => {
    expect(stableKey({ a: 1, b: { c: 'x', d: '' } })).toBe(stableKey({ b: { d: undefined, c: 'x' }, a: 1, e: null }));
    expect(stableKey({ validFrom: '60' })).not.toBe(stableKey({ validFrom: '80' }));
    expect(stableKey({ list: [1, 2] })).not.toBe(stableKey({ list: [2, 1] }));
  });
  /* UI-7 (19-11-2026): the kernel version is part of the fingerprint. nf-merge 2.3 → 2.4 changed what
   * the output holds for a stated echo past the gate; an approval given under 2.3 must read "changed
   * since approval" and not carry a result the tool no longer produces. */
  it('the kernel version is in the key, first: an approval outlives neither a setting nor the arithmetic', () => {
    expect(SRC).toMatch(/return stableKey\(\{ kernel: NF_MERGE_V2_VERSION, c, port:/);
    expect(stableKey({ kernel: 'nf-merge/2.3', c: 1 })).not.toBe(stableKey({ kernel: 'nf-merge/2.4', c: 1 }));
  });
});

describe('UI-5 — approval in the tool', () => {
  it('every approval records the fingerprint it was made on, merge and far-only alike', () => {
    expect((SRC.match(/acceptedAt: new Date\(\)\.toISOString\(\), fp: approvalKey\(src\.stem\)/g) ?? []).length).toBe(2);
  });

  it('a stale or withdrawn approval is left out: export and "Use in project…" read only current copies', () => {
    expect(SRC).toMatch(/const currentAccepted[\s\S]{0,200}approvalOf\(stem\) === 'current'/);
    expect(SRC).toMatch(/const acceptedOf = \(way: MergeWay\): AcceptedSource\[\] =>\s+Object\.entries\(currentAccepted\)/);
    expect(SRC).toMatch(/merges=\{Object\.entries\(currentAccepted\)/);
    expect(SRC).toMatch(/<UsePanel acceptedOf=\{acceptedOf\} accepted=\{currentAccepted\}/);
    expect(SRC).not.toMatch(/merges=\{Object\.entries\(st\.accepted\)/);
    expect(SRC).toContain('const withdraw = (stem: string)');
  });

  it('ONE place approves: the sticky bar of step 4; the panels only say where it stands', () => {
    const bar = SRC.slice(SRC.indexOf('<div className="nfm-nav">'), SRC.indexOf('<span className="nfm-nav-steps">'));
    expect(bar).toContain("step === 'merge'");
    expect(bar).toMatch(/onClick=\{approve\}/);
    expect(bar).toContain("onClick={() => withdraw(stem)}");
    expect((SRC.match(/onClick=\{approve\}/g) ?? []).length).toBe(1);
    expect(SRC).not.toMatch(/onAccept/);
    expect(SRC).not.toContain("t('Accept merge')");
    expect(SRC).not.toContain("t('Accept far field')");
  });

  it('the tabs, the overview and step 5 show three states, far-only included', () => {
    expect(SRC).toContain("t('changed since approval')");
    expect(SRC).not.toMatch(/d\.kind !== 'far-only' && \(st\.accepted/);
    const s5 = SRC.slice(SRC.indexOf("{step === 'export' && ("), SRC.indexOf('<DriverOverview', SRC.indexOf("{step === 'export' && (")));
    expect(s5).toContain('className="nfm-approvals"');
    expect(s5).toMatch(/\[\.\.\.drivers, \.\.\.farOnly\]\.map/);
  });
});
