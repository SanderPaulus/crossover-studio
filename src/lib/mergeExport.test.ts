/**
 * I-4 fase 4 — the export: one phase convention and one grid per set, said in every file and in the
 * manifest; and export → import numerically identical (startprompt acceptance 6).
 *
 * The accepted merges are casus 1's August set (`test-fixtures/koan_2026-11_merge_v2/`): the woofer
 * pair for the low branch, the mid for the mid branch. The "original grid" claims run the kernel on
 * the far field's own export grid, as the tool does at accept time.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrd } from './parsers/frd.ts';
import { exportPackage, gateOf, impulseOfItem, loadSession, type MergeWay } from './mergeSession.ts';
import { mergeImpulsesV2 } from './nfMergeV2.ts';
import { addHeaderLines, applyPhaseConvention, phaseZeroMsOf, readMergePackage, readMergePackageZip } from './mergeExport.ts';
import { prepareBranchUse } from './useInProject.ts';
import { unzipStore, zipStore } from './zip.ts';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');
const merged = (n: string) => ({ name: n, text: readFileSync(join(FIX, 'koan_2026-11_merge_v2', n), 'utf8') });
const wDown = merged('woofer_down_merged_v2.frd');
const wUp = merged('woofer_up_merged_v2.frd');
const mid = merged('mid_merged_v2.frd');
const read = (dir: string, n: string) => ({ name: n, bytes: new Uint8Array(readFileSync(join(FIX, dir, n))) });
const session = loadSession('augustus', [
  ...readdirSync(join(FIX, 'casus1_pir')).filter((n) => n.endsWith('.pir')).map((n) => read('casus1_pir', n)),
  ...['woofer_down_hor_0.txt', 'woofer_up_hor_0.txt', 'mid_hor_0.txt', 'woofer_down_near.txt', 'woofer_up_near.txt', 'mid_near.txt'].map((n) => read('casus1', n)),
  read('casus1', 'woofers_parallel__1_.lim'),
]);
// a synthetic rig: the package writes what it is given; this is not a claim about casus 1's set-up
const rig = { bottomAboveFloorMm: 500, surface: 'table' as const, surfaceOverhangMm: null, micDistanceMm: 1000, micHeightMm: 1380 };
const accepted: { source: string; fileName: string; text: string; way: MergeWay; status: string }[] = [
  { source: 'woofer down', fileName: wDown.name, text: wDown.text, way: 'low', status: 'flags' },
  { source: 'woofer up', fileName: wUp.name, text: wUp.text, way: 'low', status: 'flags' },
  { source: 'mid', fileName: mid.name, text: mid.text, way: 'mid', status: 'explained' },
];
const pack = (over: Partial<Parameters<typeof exportPackage>[0]> = {}) => {
  const r = exportPackage({ session, merges: accepted, rig, measuredObjectNote: 'testkast', targetNote: 'doelkast', madeOn: '2026-11-14', ...over });
  if (!r.ok) throw new Error(r.reason);
  return r.files;
};
const asZip = (files: { name: string; data: string }[]) => zipStore(files.map((f) => ({ name: `augustus/${f.name}`, data: f.data })));

describe('fase 4 — export → import is numerically identical', () => {
  it('the default set (as measured, merge grid) writes the accepted files unchanged, byte for byte', () => {
    const files = pack();
    for (const a of accepted) expect(files.find((f) => f.name === a.fileName)!.data).toBe(a.text);
  });

  it('a dropped package gives every branch EXACTLY what "Use in project" gives it — text and numbers', () => {
    const pkg = readMergePackageZip(asZip(pack()));
    if (!pkg.ok) throw new Error(pkg.reason);
    expect(pkg.session).toBe('augustus');
    expect(pkg.notes).toEqual([]);
    for (const way of ['low', 'mid'] as const) {
      const direct = prepareBranchUse(way, accepted.filter((a) => a.way === way).map((a) => ({ name: a.fileName, text: a.text })));
      const imported = prepareBranchUse(way, pkg.files.filter((f) => f.way === way));
      if (!direct.ok || !imported.ok) throw new Error('prepare failed');
      expect(imported.file).toEqual(direct.file);
      expect(imported.frd.freq).toEqual(direct.frd.freq);
      expect(imported.frd.spl).toEqual(direct.frd.spl);
      expect(imported.frd.phase).toEqual(direct.frd.phase);
    }
    expect(pkg.files.map((f) => [f.source, f.way, f.status])).toEqual(accepted.map((a) => [a.source, a.way, a.status]));
  });

  it('every other set is read back as the very text it holds, and the convention is said', () => {
    for (const phase of [{ kind: 'reference' as const, ms: 9.0 }, { kind: 'minphase' as const }]) {
      const files = pack({ phase });
      const pkg = readMergePackageZip(asZip(files));
      if (!pkg.ok) throw new Error(pkg.reason);
      for (const f of pkg.files) expect(f.text).toBe(files.find((x) => x.name === f.name)!.data);
      expect(pkg.notes.join(' ')).toMatch(/not the convention the merge was made in/);
    }
  });

  it('the reader refuses what is not the tool\'s package, with a reason', () => {
    expect(readMergePackageZip(new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false });
    expect(readMergePackage([{ name: 'x.frd', data: '' }])).toEqual({ ok: false, reason: 'no manifest.json — not a merge-tool export package' });
    const files = pack();
    const noFile = files.filter((f) => f.name !== mid.name);
    expect(readMergePackage(noFile)).toEqual({ ok: false, reason: `${mid.name} is listed in manifest.json but not in the package` });
    const unzipped = unzipStore(asZip(files));
    expect(unzipped.map((e) => e.name)).toEqual(files.map((f) => `augustus/${f.name}`));
  });
});

describe('fase 4 — one phase convention per set, said in every file and the manifest', () => {
  it('at a reference point: every file shifted by the same Δt, phase(f) + 360·f·Δt, and the header says from where', () => {
    const t0 = phaseZeroMsOf(mid.text)!;
    expect(t0).toBeCloseTo(8.75, 9);
    const refMs = 9.1;
    const files = pack({ phase: { kind: 'reference', ms: refMs } });
    for (const a of accepted) {
      const out = files.find((f) => f.name === a.fileName)!.data;
      expect(out).toMatch(/^\* Merge export phase = at a reference point: t = 0 at 9\.1000 ms .* the same shift for every file of this set$/m);
      const before = parseFrd(a.text);
      const after = parseFrd(out);
      expect(after.freq).toEqual(before.freq);
      expect(after.spl).toEqual(before.spl);
      for (let i = 0; i < before.freq.length; i += 37) {
        const want = before.phase[i] + 360 * before.freq[i] * (refMs - t0) * 1e-3;
        const d = ((after.phase[i] - want + 540) % 360 + 360) % 360 - 180;
        expect(Math.abs(d)).toBeLessThan(0.0011);
      }
    }
    const man = JSON.parse(files.find((f) => f.name === 'manifest.json')!.data);
    expect(man.phase_convention).toBe('at a reference point: t = 0 at 9.1000 ms on the session time base');
    expect(applyPhaseConvention(mid.text, { kind: 'reference', ms: null })).toMatchObject({ ok: false });
  });

  it('minimum phase only when asked, with the warning in the file, the manifest and the read-me', () => {
    const files = pack({ phase: { kind: 'minphase' } });
    expect(files.find((f) => f.name === mid.name)!.data).toMatch(/^\* Merge export phase = MINIMUM PHASE, .*MEASURED TIMING IS GONE/m);
    expect(JSON.parse(files.find((f) => f.name === 'manifest.json')!.data).phase_convention).toMatch(/^MINIMUM PHASE/);
    expect(files.find((f) => f.name === 'leesmij.txt')!.data).toMatch(/WARNING: minimum phase/);
  });
});

describe('fase 4 — the grid: the merge grid, or the far field\'s own grid computed by the kernel', () => {
  it('casus 1 mid on its FRD export\'s grid is the SAME merge (same fit), and the package writes that file', () => {
    const src = session.sources.find((s) => s.stem === 'mid')!;
    const g = gateOf(src.far!);
    if (!('gate' in g)) throw new Error('no gate');
    const base = {
      far: impulseOfItem(src.far!, 'augustus', false),
      near: impulseOfItem(src.near!, 'augustus', false),
      gate: g.gate,
      model: { kind: 'an4' as const, f0Hz: 200 },
      echoes: [],
      sdCm2: null,
      fitBandHz: [300, 800] as [number, number],
      spliceBandHz: [400, 774] as [number, number],
      output: { fromHz: 20, toHz: 20000, pointsPerOctave: 48 },
    };
    const grid = parseFrd(src.far!.frdText!).freq.filter((f) => f > 0 && f < base.far.sampleRate / 2);
    const log = mergeImpulsesV2(base);
    const orig = mergeImpulsesV2({ ...base, output: { ...base.output, grid } });
    expect(orig.fit).toEqual(log.fit);
    expect(orig.freq).toEqual(grid);
    const row = (r: typeof orig) => r.freq.map((f, i) => `${f.toFixed(4)} ${r.spl[i].toFixed(3)} ${r.phaseDeg[i].toFixed(3)}`).join('\n');
    const textOriginal = addHeaderLines(`* Merge = NF/FF\n* Merge gate = reference 8.7500 ms\nFreq[Hz]  dBSPL  Phase[Deg]\n${row(orig)}\n`, ['Merge grid = the far field\'s own export grid']);
    const files = pack({ grid: 'original', merges: [{ ...accepted[2], textOriginal }] });
    const out = parseFrd(files[0].data);
    expect(out.freq.length).toBe(grid.length);
    expect(JSON.parse(files.find((f) => f.name === 'manifest.json')!.data).grid).toMatch(/far field's own export grid/);
  }, 60_000);

  it('no original-grid file (a far field without FRD export) is a reason, not a silent fallback', () => {
    const r = exportPackage({ session, merges: [accepted[2]], rig, measuredObjectNote: '', targetNote: '', madeOn: '2026-11-14', grid: 'original' });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.reason).toMatch(/no merge on the far field's own grid/);
  });
});
