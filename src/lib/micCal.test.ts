/**
 * I-4 PIR-only — a microphone calibration file, and a merge without FRD exports.
 *
 * Casus 1's own file (test-fixtures/casus1_pir/MM1CDU_allein_00d.mic, JustOct format, Sander's MM1CDU
 * at 0°) is checked against the curve the session's FRD exports imply (FRD ÷ PIR): measured 14-11-2026,
 * the shapes agree within 0.014 dB from 10.6 Hz to 21.1 kHz, and only the file's first point (10 Hz)
 * differs, by 0.25 dB. With the FRD exports present the DERIVED curve is applied (it carries ARTA's
 * absolute level); the file is the check. Without them the file is applied, shape only, level relative.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseCalibration, micCorrectionAt, parseMicCal, type MicCal } from './micCal.ts';
import { exportPackage, gateOf, impulseOfItem, interpLog, loadSession, statedPirGate } from './mergeSession.ts';
import { isUncalibrated } from './mergeExport.ts';
import { mergeImpulsesV2 } from './nfMergeV2.ts';
import { prepareBranchUse } from './useInProject.ts';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');
const read = (d: string, n: string) => ({ name: n, bytes: new Uint8Array(readFileSync(join(FIX, d, n))) });
const pirs = readdirSync(join(FIX, 'casus1_pir')).filter((n) => n.endsWith('.pir')).map((n) => read('casus1_pir', n));
const withFrd = loadSession('augustus', [...pirs, ...['mid_hor_0.txt', 'mid_near.txt', 'woofer_down_near.txt', 'woofer_up_near.txt'].map((n) => read('casus1', n))]);
const pirOnly = loadSession('augustus', pirs);
const parsed = parseMicCal('MM1CDU_allein_00d.mic', readFileSync(join(FIX, 'casus1_pir', 'MM1CDU_allein_00d.mic'), 'latin1'));
if (!parsed.ok) throw new Error(parsed.reason);
const mic: MicCal = { id: 'mm1', ...parsed.cal };

describe('the calibration file, read', () => {
  it('JustOct (.mic): the rows, the title, the sensitivity; an all-zero phase column is no phase', () => {
    expect(mic.format).toBe('justoct');
    expect(mic.freq[0]).toBe(10);
    expect(mic.freq[mic.freq.length - 1]).toBe(21135);
    expect(mic.db[0]).toBe(-12.63);
    expect(interpLog(mic.freq, mic.db, 1000)).toBeCloseTo(0, 6);
    expect(mic.phaseDeg).toBeNull();
    expect(mic.title).toMatch(/^MM1CDU, allein/);
    expect(mic.sensitivityNote).toMatch(/5\.53/);
  });
  it('ARTA / REW text: comments with * or ", spaces, a phase column, the REW sensitivity line', () => {
    const r = parseMicCal('x.txt', '"REW calibration\n* Sens Factor =-1.2dB\n20 -1.0 5\n1000 0 0\n20000 2.5 -10\n');
    expect(r).toMatchObject({ ok: true, cal: { format: 'arta-rew', freq: [20, 1000, 20000], db: [-1, 0, 2.5], phaseDeg: [5, 0, -10], sensitivityNote: 'REW sensitivity factor -1.2 dB' } });
    if (r.ok) expect(micCorrectionAt(r.cal, 20)).toEqual({ db: 1, deg: -5 });
  });
  it('refuses with the line: a decimal comma, a frequency that does not increase, a half phase column', () => {
    expect(parseMicCal('a.txt', '20 -1,5\n1000 0\n')).toMatchObject({ ok: false, reason: expect.stringMatching(/line 1: a decimal comma/) });
    expect(parseMicCal('b.txt', '1000 0\n20 -1\n')).toMatchObject({ ok: false, reason: expect.stringMatching(/line 2: the frequency does not increase/) });
    expect(parseMicCal('c.txt', '20 -1 3\n1000 0\n')).toMatchObject({ ok: false, reason: expect.stringMatching(/phase column is given on some lines/) });
    expect(parseMicCal('d.txt', '# nothing\n')).toMatchObject({ ok: false });
  });
});

describe('casus 1: the file against the curve the FRD exports imply', () => {
  it('the shapes agree within 0.014 dB from 10.6 Hz to 21.1 kHz; only the first point (10 Hz) differs, 0.25 dB; the derived curve is applied', () => {
    const c = chooseCalibration(withFrd.calibration, mic);
    if (c.kind !== 'derived' || !c.check) throw new Error('expected the derived curve with a check');
    expect(c.check.maxDb).toBeLessThan(0.015);
    expect(c.check.edge).toMatch(/^10 Hz \(the file's first point\): 0\.24\d dB$/);
    expect(c.note).toMatch(/the derived curve is applied \(it carries the absolute level\)/);
  });
  it('without FRD exports the file is applied (level relative, said); without either, nothing, and why', () => {
    expect(pirOnly.calibration).toBeNull();
    const f = chooseCalibration(null, mic);
    expect(f.kind).toBe('file');
    if (f.kind === 'file') expect(f.note).toMatch(/LEVEL RELATIVE.*5\.53.*soundcard's input sensitivity is not known/);
    expect(chooseCalibration(null, null)).toMatchObject({ kind: 'none', reason: expect.stringMatching(/no calibration/) });
  });
});

describe('PIR-only: the window stated in the tool, and the export refused without calibration', () => {
  it('no FRD export: the header gate is refused, and a stated window needs all four values — nothing assumed', () => {
    const mid = pirOnly.sources.find((s) => s.stem === 'mid')!;
    expect(gateOf(mid.far!)).toMatchObject({ field: 'window' });
    const r = statedPirGate({ referenceMs: 8.75, leftMs: null, rightMs: 5.021, taper: null });
    expect(r).toMatchObject({ field: 'window', error: expect.stringMatching(/missing: left length .*Tukey taper/) });
    expect(statedPirGate({ referenceMs: 8.75, leftMs: 0, rightMs: 5.021, taper: 0.25 })).toEqual({ gate: { referenceMs: 8.75, leftMs: 0, rightMs: 5.021, rightTaper: 0.25 } });
  });
  it('the same window stated on the PIRs alone gives the SAME merge as the FRD route; the file calibrates it to the derived shape', () => {
    const run = (s: typeof withFrd, gate: Parameters<typeof mergeImpulsesV2>[0]['gate']) => {
      const src = s.sources.find((x) => x.stem === 'mid')!;
      return mergeImpulsesV2({
        far: impulseOfItem(src.far!, 'augustus', false),
        near: impulseOfItem(src.near!, 'augustus', false),
        gate,
        model: { kind: 'an4', f0Hz: 200 },
        echoes: [],
        sdCm2: null,
        fitBandHz: [300, 800],
        spliceBandHz: [400, 774],
        output: { fromHz: 20, toHz: 20000, pointsPerOctave: 48 },
      });
    };
    const g = gateOf(withFrd.sources.find((x) => x.stem === 'mid')!.far!);
    if (!('gate' in g)) throw new Error('no gate');
    const stated = statedPirGate({ referenceMs: g.gate.referenceMs, leftMs: g.gate.leftMs, rightMs: g.gate.rightMs, taper: g.gate.rightTaper });
    if (!('gate' in stated)) throw new Error(stated.error);
    const a = run(withFrd, g.gate);
    const b = run(pirOnly, stated.gate);
    expect(b.spl).toEqual(a.spl);
    expect(b.phaseDeg).toEqual(a.phaseDeg);
    // calibrated: by the file (PIR-only) vs by the derived curve — one constant level apart, the same shape
    const cal = withFrd.calibration!;
    const off = a.freq.map((f, i) => a.spl[i] + interpLog(cal.freq, cal.db, f) - (b.spl[i] + micCorrectionAt(mic, f).db));
    const inBand = off.filter((_, i) => a.freq[i] >= 11 && a.freq[i] <= 20000);
    expect(Math.max(...inBand) - Math.min(...inBand)).toBeLessThan(0.03);
  }, 60_000);
  it('an uncalibrated merge does not leave the tool: the export and "Use in project" refuse, with the reason', () => {
    const text = '* Merge = NF/FF\n* Merge calibration = none (the impulses\' own scale)\nFreq[Hz]  dBSPL  Phase[Deg]\n20 80 0\n1000 80 0\n';
    expect(isUncalibrated(text)).toBe(true);
    const r = exportPackage({ session: pirOnly, merges: [{ source: 'mid', fileName: 'mid_merged_v2.frd', text, way: 'mid' }], rig: { bottomAboveFloorMm: null, surface: null, surfaceOverhangMm: null, micDistanceMm: null, micHeightMm: null }, measuredObjectNote: '', targetNote: '', madeOn: '2026-11-14' });
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/^not calibrated: mid_merged_v2\.frd — choose a microphone calibration file/) });
    expect(prepareBranchUse('mid', [{ name: 'mid_merged_v2.frd', text }])).toMatchObject({ ok: false, reason: expect.stringMatching(/^not calibrated/) });
  });
});
