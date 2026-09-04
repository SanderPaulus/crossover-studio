/**
 * A5e.5 (estimator versioning) and A5.3 / P4 (the capability matrix).
 *
 * These two are tested together because they are the two halves of "no number
 * appears without saying where it came from": the version says which estimator
 * produced it, and the capability matrix says why another one produced nothing.
 *
 * The version half is the one that rots quietly. A registry that lists an
 * estimator no module exports, or a module whose id nothing knows about, still
 * produces a fingerprint and still invalidates a cache — just not the right
 * one. So the two are cross-checked rather than trusted.
 */

import { describe, expect, it } from 'vitest';
import { ESTIMATOR_VERSIONS, estimatorFingerprint, estimatorVersion, stamp } from './version.ts';
import { DerivedCache, runIngest } from './ingest/derive.ts';
import {
  EXTRACTOR_FFNF,
  EXTRACTOR_HEADER,
  EXTRACTOR_NEARFIELD,
} from './ingest/validity.ts';
import {
  EXTRACTOR_RE,
  EXTRACTOR_RESONANCE,
  EXTRACTOR_SEMI_L,
  EXTRACTOR_Z_RIPPLE,
} from './ingest/impedance.ts';
import {
  EXTRACTOR_BREAKUP,
  EXTRACTOR_DIFFRACTION,
  EXTRACTOR_DIRECTIVITY,
  EXTRACTOR_LEVEL,
} from './ingest/spl.ts';
import { buildCapabilityMatrix, isActive } from './capability.ts';
import { METRIC_DECLARATIONS } from './metrics/registry.ts';
import type { MetricContext } from './metrics/types.ts';
import { casus1Files, casus1Manifest, loadGolden } from './casus1.fixture.ts';

/** Every id an extractor module actually exports. */
const EXPORTED_IDS = [
  EXTRACTOR_HEADER,
  EXTRACTOR_NEARFIELD,
  EXTRACTOR_FFNF,
  EXTRACTOR_RE,
  EXTRACTOR_RESONANCE,
  EXTRACTOR_SEMI_L,
  EXTRACTOR_Z_RIPPLE,
  EXTRACTOR_BREAKUP,
  EXTRACTOR_DIFFRACTION,
  EXTRACTOR_DIRECTIVITY,
  EXTRACTOR_LEVEL,
];

describe('estimator versioning (A5e.5)', () => {
  it('the registry and the modules agree on exactly which extractors exist', () => {
    expect([...EXPORTED_IDS].sort()).toEqual(Object.keys(ESTIMATOR_VERSIONS).sort());
  });

  it('every version is <major>.<minor>, and every stamp carries the registry value', () => {
    for (const id of EXPORTED_IDS) {
      expect(estimatorVersion(id)).toMatch(/^\d+\.\d+$/);
      expect(stamp(id)).toEqual({ id, version: ESTIMATOR_VERSIONS[id] });
    }
  });

  it('the fingerprint names every extractor, and is stable within a build', () => {
    const fp = estimatorFingerprint();
    for (const id of EXPORTED_IDS) expect(fp).toContain(`${id}@`);
    expect(estimatorFingerprint()).toBe(fp);
  });

  it('a derived result carries the stamp of the extractor that made it', () => {
    // M-1: the GATED set — the claim is about the header extractor's stamp on a gated far field.
    const manifest = casus1Manifest(undefined, 'gated');
    const ingest = runIngest(manifest, casus1Files(manifest));
    const w = ingest.drivers.find((d) => d.driver === 'woofer')!;
    expect(w.re!.estimator.id).toBe(EXTRACTOR_RE);
    expect(w.impedance!.estimator.id).toBe(EXTRACTOR_RESONANCE);
    expect(w.breakups!.estimator.id).toBe(EXTRACTOR_BREAKUP);
    expect(w.diffraction!.estimator.id).toBe(EXTRACTOR_DIFFRACTION);
    // The validity interval names the detectors in the order they were applied.
    const ff = w.validity.find((v) => v.file.includes('hor_0'))!.interval;
    expect(ff.estimators.map((e) => e.id)).toContain(EXTRACTOR_HEADER);
    expect(ingest.fingerprint).toBe(estimatorFingerprint());
  });

  describe('the derived-parameter cache invalidates on a version bump', () => {
    const value = { sessionId: 's', fingerprint: 'x', drivers: [], problems: [] };

    it('hits on the same session, content and fingerprint', () => {
      const c = new DerivedCache();
      c.set('s1', 'files-abc', value);
      expect(c.get('s1', 'files-abc')).toBe(value);
      expect(c.get('s1', 'files-def')).toBeUndefined();
      expect(c.get('s2', 'files-abc')).toBeUndefined();
    });

    it('misses - and can be evicted - once the fingerprint no longer matches', () => {
      const c = new DerivedCache();
      // An entry written under an older version table: same session, same
      // files, different estimator versions. This is exactly the V8-fix case,
      // and the entry must not be readable.
      const stale = `s1 files-abc z-re@0.9;${estimatorFingerprint()}-old`;
      (c as unknown as { store: Map<string, unknown> }).store.set(stale, value);
      expect(c.get('s1', 'files-abc')).toBeUndefined();
      expect(c.stale()).toEqual([stale]);
      expect(c.evictStale()).toBe(1);
      expect(c.size).toBe(0);
    });

    it('a REAL derivation cached under the pre-F3b table expires, and the new one replaces it', () => {
      /* THE FIRST PRODUCTION EXERCISE OF A5e.5.
       *
       * Every cache test above works on a synthetic value, which proves the
       * key arithmetic and nothing else. This one runs the actual derivation
       * pass, stores it under the fingerprint the app carried BEFORE the R_e
       * estimator was rebuilt, and shows the two things a version bump has to
       * do: the old entry becomes unreadable, and the fresh derivation is the
       * NEW number rather than the cached old one.
       *
       * "Zonder dit worden V8-verbeteringen stille gedragswijzigingen" — this
       * is the V8d improvement, so this is the test that says it was not
       * silent. */
      const m = casus1Manifest();
      const fresh = runIngest(m, casus1Files(m));
      const woofer = fresh.drivers.find((d) => d.driver === 'woofer')!;

      // What the pre-F3b pass would have produced for R_e: the direct reading.
      const beforeBump = {
        ...fresh,
        fingerprint: estimatorFingerprint().replace('z-re@1.1', 'z-re@1.0'),
        drivers: [{ ...woofer, re: { ...woofer.re!, ohm: woofer.re!.directOhm } }],
      };
      expect(beforeBump.fingerprint).not.toBe(estimatorFingerprint());

      const c = new DerivedCache();
      const staleKey = `casus1 files-v1 ${beforeBump.fingerprint}`;
      (c as unknown as { store: Map<string, unknown> }).store.set(staleKey, beforeBump);

      // 1. It is gone as far as any reader is concerned.
      expect(c.get('casus1', 'files-v1')).toBeUndefined();
      expect(c.stale()).toEqual([staleKey]);
      expect(c.evictStale()).toBe(1);
      expect(c.size).toBe(0);

      // 2. And what replaces it is a different number, not the same one under
      //    a new label — otherwise the bump proved nothing.
      c.set('casus1', 'files-v1', fresh);
      const after = c.get('casus1', 'files-v1')!.drivers.find((d) => d.driver === 'woofer')!;
      expect(after.re!.source).toBe('motional-fit');
      expect(after.re!.ohm).not.toBeCloseTo(beforeBump.drivers[0].re!.ohm, 2);
      expect(after.re!.estimator.version).toBe('1.1');
    });

    it('leaves current entries alone when stale ones are evicted', () => {
      const c = new DerivedCache();
      c.set('s1', 'files-abc', value);
      (c as unknown as { store: Map<string, unknown> }).store.set('s1 files-xyz old-fingerprint', value);
      expect(c.evictStale()).toBe(1);
      expect(c.get('s1', 'files-abc')).toBe(value);
    });
  });
});

describe('capability matrix (A5.3 / P4)', () => {
  const golden = loadGolden();
  const manifest = casus1Manifest(golden);
  const ingest = runIngest(manifest, casus1Files(manifest));

  /** A context with no filter, no geometry and no settings — the empty project. */
  const bare: MetricContext = {
    ingest,
    analysis: null,
    geometry: {},
    settings: {},
    crossings: [],
    driversLowToHigh: ['woofer', 'mid', 'tweeter'],
  };

  it('is generated from the declarations - one cell per metric per subject', () => {
    const m = buildCapabilityMatrix(bare);
    expect(m.metrics).toEqual(METRIC_DECLARATIONS.map((d) => d.id));
    for (const decl of METRIC_DECLARATIONS) {
      const cells = m.cells.filter((c) => c.metric === decl.id);
      expect(cells.length).toBeGreaterThan(0);
      const expected = decl.scope === 'system' ? 1 : decl.scope === 'driver' ? 3 : 2;
      expect(cells).toHaveLength(expected);
    }
  });

  it('P4: with nothing entered, everything that needs input is OFF - with a reason', () => {
    const m = buildCapabilityMatrix(bare);
    const off = m.cells.filter((c) => !c.active);
    expect(off.length).toBeGreaterThan(0);
    for (const c of off) {
      expect(c.reasons.length).toBeGreaterThan(0);
      for (const r of c.reasons) expect(r.length).toBeGreaterThan(10);
    }
    // No filter means no network metric, and the reason says exactly that.
    expect(isActive(m, 'M-A', 'system')).toBe(false);
    expect(m.describeOff.join(' ')).toContain('no filter is loaded');
    // No geometry means no interim lobing.
    expect(isActive(m, 'M-F-interim', 'woofer|mid')).toBe(false);
    expect(m.describeOff.join(' ')).toContain('centre-to-centre');
  });

  it('P4: M-G is off for the pair whose lower driver has no off-axis measurement', () => {
    // The example A5.3 gives, on the dataset it was written about: the mid was
    // measured at 30 degrees, the woofer and tweeter were not.
    const m = buildCapabilityMatrix(bare);
    expect(isActive(m, 'M-G', 'woofer|mid')).toBe(false);
    expect(
      m.cells.find((c) => c.metric === 'M-G' && c.subject === 'woofer|mid')!.reasons.join(' '),
    ).toContain('off-axis measurement for the lower driver');
    // ...and the mid-tweeter pair, whose lower driver DOES have one, is only
    // held back by the missing crossing - not by the data.
    const mt = m.cells.find((c) => c.metric === 'M-G' && c.subject === 'mid|tweeter')!;
    expect(mt.reasons.join(' ')).not.toContain('off-axis');
    expect(mt.reasons.join(' ')).toContain('do not cross');
  });

  it('carries the intended role and the uncalibrated marking into every cell', () => {
    const m = buildCapabilityMatrix(bare);
    expect(m.cells.find((c) => c.metric === 'M-A')!.role).toBe('gate');
    expect(m.cells.find((c) => c.metric === 'M-J')!.role).toBe('report');
    // M-H ships with an explicitly uncalibrated component, and the marking has
    // to survive all the way to the cell the panel renders.
    const h = m.cells.find((c) => c.metric === 'M-H')!;
    expect(h.uncalibrated).toContain('uncalibrated');
    expect(h.specRef).toBe('A4 M-H');
  });

  it('every declaration is complete - A4 refuses a metric with an empty field', () => {
    for (const d of METRIC_DECLARATIONS) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.quantity.length).toBeGreaterThan(0);
      expect(d.formula.length).toBeGreaterThan(0);
      expect(d.specRef).toMatch(/^A\d/);
      expect(d.needs.length).toBeGreaterThan(0);
      for (const n of d.needs) expect(n.describe.length).toBeGreaterThan(10);
    }
  });
});
