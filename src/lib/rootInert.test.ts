import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { holdRootInert, rootInertHolders } from './rootInert.ts';

/**
 * U-8 — ONE OWNER FOR `#root`'s `inert`.
 *
 * The bug this exists against is not hypothetical arithmetic: two surfaces
 * (a base-ui modal since F3b, the run overlay since U-8) each set the
 * attribute on mount and removed it on unmount, so the first one to close
 * revived the whole page underneath a dialog that was still up. The count
 * below is the whole mechanism, and the last claim is the one that would have
 * caught it.
 *
 * The suite runs in a plain node environment (`vitest.config.ts`), so there is
 * no `#root` and the module's own no-`#root` branch is what runs. A minimal
 * stand-in is installed for the counting claims — it tests the count and who
 * writes the attribute, which is what this module owns; that `inert` takes an
 * element OUT OF HIT-TESTING is a browser fact and was measured in the
 * browser, on the live app, with the number written down in `rootInert.ts`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

interface FakeRoot {
  attrs: Set<string>;
}

/** Install a `document` with one `#root`; returns it and the uninstall. */
function withFakeRoot(): { root: FakeRoot; restore: () => void } {
  const root: FakeRoot = { attrs: new Set() };
  const el = {
    setAttribute: (k: string) => void root.attrs.add(k),
    removeAttribute: (k: string) => void root.attrs.delete(k),
  };
  const g = globalThis as unknown as { document?: unknown };
  const had = 'document' in g;
  const before = g.document;
  g.document = { getElementById: (id: string) => (id === 'root' ? el : null) };
  return {
    root,
    restore: () => {
      if (had) g.document = before;
      else delete g.document;
    },
  };
}

let cleanup: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanup.splice(0).reverse()) c();
});

describe('U-8 — #root inert is held by a count, not by whoever moved last', () => {
  it('sets the attribute for the first holder and clears it for the last', () => {
    const { root, restore } = withFakeRoot();
    cleanup.push(restore);
    expect(rootInertHolders()).toBe(0);
    const release = holdRootInert();
    expect(root.attrs.has('inert')).toBe(true);
    expect(rootInertHolders()).toBe(1);
    release();
    expect(root.attrs.has('inert')).toBe(false);
    expect(rootInertHolders()).toBe(0);
  });

  it('THE BUG: the first surface to close does not revive the page for the second', () => {
    const { root, restore } = withFakeRoot();
    cleanup.push(restore);
    const modal = holdRootInert();
    const overlay = holdRootInert();
    expect(rootInertHolders()).toBe(2);
    modal(); // the modal closes while the run overlay is still up
    expect(root.attrs.has('inert')).toBe(true);
    overlay();
    expect(root.attrs.has('inert')).toBe(false);
  });

  it('ignores a second release from the same holder', () => {
    const { root, restore } = withFakeRoot();
    cleanup.push(restore);
    const a = holdRootInert();
    const b = holdRootInert();
    a();
    a(); // React can unmount a caller mid-flight; this must not decrement twice
    expect(rootInertHolders()).toBe(1);
    expect(root.attrs.has('inert')).toBe(true);
    b();
    expect(rootInertHolders()).toBe(0);
    expect(root.attrs.has('inert')).toBe(false);
  });

  it('is a no-op without a #root, and its release is safe to call', () => {
    // The node environment the suite runs in, and any host that mounts the
    // app elsewhere: a caller must never have to branch on it.
    expect(typeof document).toBe('undefined');
    const release = holdRootInert();
    expect(rootInertHolders()).toBe(0);
    expect(() => release()).not.toThrow();
    expect(rootInertHolders()).toBe(0);
  });

  it('is the ONE writer of that attribute in the app', () => {
    // A third surface that sets it by hand puts the bug back; this is the
    // scan that says so. Test files and this module are the exemptions.
    const files = ['src/App.tsx', 'src/components/Modal.tsx'];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, `${f} sets inert by hand`).not.toMatch(/setAttribute\(\s*['"]inert['"]/);
      expect(src, `${f} clears inert by hand`).not.toMatch(/removeAttribute\(\s*['"]inert['"]/);
    }
    // …and both go through this module.
    for (const f of files) {
      expect(readFileSync(join(ROOT, f), 'utf8')).toContain('holdRootInert');
    }
  });
});
