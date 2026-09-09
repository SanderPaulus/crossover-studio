import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLE_BEARABLE_ROWS,
  DEMO_ROLES,
  bundleCarries,
  demoBundleState,
  readableValidity,
  type DemoBundle,
  type DemoFile,
} from './demoBundle.ts';
import { KOAN_2WAY_DEMO, KOAN_2WAY_STATED } from '../demo2way.ts';
import { KOAN_3WAY_BUNDLE } from '../demo3way.ts';
import { DEFAULT_GATE_TAPER_ALPHA, dataFloorFromGateMs, readGateHeader, readMergeBlock } from './xoWindow.ts';
import { declaredMergeValidity } from './sourceMeta.ts';
import { parseArtaHeader } from './engine2/ingest/manifest.ts';
import { parseTabular } from './parsers/tabular.ts';
import { V2_INPUT_REGISTER, rowsOfClass } from './v2InputRegister.ts';
import { V2_SETTING_KEYS, statedMark, clearStatedBy, restoreV2Settings } from './v2Settings.ts';
import { V2_MEASUREMENT_KEYS } from './v2Measurement.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf-8');

/** Every bundle the app can load. A new demo joins both guards by being here. */
const BUNDLES: readonly DemoBundle[] = [KOAN_2WAY_DEMO, KOAN_3WAY_BUNDLE];

/** Every measurement file of a bundle: on-axis, off-axis, near fields. Not the
 *  impedances — a sweep has no window and states its validity by existing. */
function measurementFiles(b: DemoBundle): { role: string; kind: string; file: DemoFile }[] {
  const out: { role: string; kind: string; file: DemoFile }[] = [];
  for (const r of DEMO_ROLES) {
    const br = b.branches[r];
    if (!br) continue;
    br.angles.forEach((a, i) => out.push({ role: r, kind: i === 0 ? 'on-axis' : `${a.hor}°`, file: a.file }));
    if (br.nearCone) out.push({ role: r, kind: 'near cone', file: br.nearCone });
    if (br.nearPort) out.push({ role: r, kind: 'near port', file: br.nearPort });
  }
  return out;
}

/**
 * THE APP'S OWN DECISION, reproduced from the two readers it actually uses.
 * `sourceMeta` in `App.tsx` takes a declared merge block first (P-1) and the
 * ARTA window second (A3h), and `refuseIfUnverified` refuses the run for any
 * source that comes back `verified: false`. This is that branch, and nothing
 * else: not a looser test, and not a stricter one.
 */
function appVerdict(raw: string, dataFromHz: number, dataToHz: number): { verified: boolean; floorHz: number | null; via: string } {
  const mb = readMergeBlock(raw);
  if (mb) {
    const mv = declaredMergeValidity(mb, { fromHz: dataFromHz, toHz: dataToHz }).validity;
    return { verified: mv.fromHz !== null, floorHz: mv.fromHz, via: 'merge block' };
  }
  const gr = readGateHeader(raw);
  if (gr.kind !== 'parsed') return { verified: false, floorHz: null, via: `gate ${gr.kind}` };
  return {
    verified: true,
    floorHz: dataFloorFromGateMs(gr.gateMs, gr.alpha ?? DEFAULT_GATE_TAPER_ALPHA),
    via: 'gate header',
  };
}

const rowsOf = (raw: string) =>
  raw
    .split('\n')
    .filter((l) => l.trim() !== '' && !/^\s*[*;#]/.test(l) && /^\s*[\d.+-]/.test(l))
    .join('\n');

const extentOf = (raw: string): [number, number] => {
  const { rows } = parseTabular(raw);
  return [rows[0][0], rows[rows.length - 1][0]];
};

/* ==================================================================== *
 * GUARD 1 — a demo may not block its own route
 * ==================================================================== */

describe('U-3 guard 1 — every demo measurement file states a validity the app can read', () => {
  /* THE CLAIM AND WHY IT IS WORTH A TEST. The two-way demo shipped twelve
   * headerless exports for a year and a half, so `readGateHeader` answered
   * `absent` on all twelve, so `refuseIfUnverified` refused to optimise with
   * the app's own honest message. Nothing was broken — the app was right — and
   * nothing failed, because no test ever asked a bundle what its files say. */
  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: every file states a window or a merge floor', (_id, b) => {
    const files = measurementFiles(b);
    expect(files.length).toBeGreaterThan(0);
    for (const { role, kind, file } of files) {
      const [lo, hi] = extentOf(file.raw);
      const v = appVerdict(file.raw, lo, hi);
      expect(v, `${b.id} ${role} ${kind} (${file.name}) — ${v.via}`).toMatchObject({ verified: true });
      expect(v.floorHz, `${b.id} ${role} ${kind}: a verified source has a floor`).not.toBeNull();
    }
  });

  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: the ON-AXIS file of every filled way is verified, so Optimize is not refused', (_id, b) => {
    for (const r of DEMO_ROLES) {
      const onAxis = demoBundleState(b).onAxis[r];
      if (!onAxis) continue;
      const [lo, hi] = extentOf(onAxis.raw);
      expect(appVerdict(onAxis.raw, lo, hi).verified, `${b.id} ${r}: ${onAxis.name}`).toBe(true);
    }
  });

  /* THE COUNTER-PROOF. Without it, "all green" cannot be told apart from a
   * check that cannot fire. The 2023 prototype exports are still in the repo as
   * parser and optimizer fixtures, and they are exactly what this guard exists
   * to catch — every one of them fails it. */
  it('the counter-proof: the 2023 prototype exports fail this guard, all twelve', () => {
    const dir = join(ROOT, 'src', 'lib', 'parsers', 'fixtures');
    const names = [0, 15, 30, 45, 60, 75].flatMap((h) => [`mid_hor${h}_mettape.txt`, `tweet_hor${h}_mettape.txt`]);
    expect(names).toHaveLength(12);
    for (const n of names) {
      const raw = readFileSync(join(dir, n), 'utf-8');
      const [lo, hi] = extentOf(raw);
      const v = appVerdict(raw, lo, hi);
      expect(v, `${n} should state nothing`).toMatchObject({ verified: false, via: 'gate absent' });
      expect(readableValidity(raw)).toBe(false);
    }
  });

  /* One convention, three readers: the v1 pair the app consults, engine2's
   * field-name parser, and the three lines `demoBundle.ts` carries so that
   * bundle code needs neither (it may not import `engine2/`). They must agree
   * on every file of every bundle, or the shared convention has drifted. */
  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: the v1 readers, engine2 and the bundle rule agree file by file', (_id, b) => {
    for (const { role, kind, file } of measurementFiles(b)) {
      const [lo, hi] = extentOf(file.raw);
      const app = appVerdict(file.raw, lo, hi).verified;
      const { comments } = parseTabular(file.raw);
      const h = parseArtaHeader(comments);
      const e2 = h.merge ? h.statedValidity?.fromHz !== undefined : h.rightWindowMs !== undefined;
      expect(readableValidity(file.raw), `${b.id} ${role} ${kind}: bundle rule vs app`).toBe(app);
      expect(e2, `${b.id} ${role} ${kind}: engine2 vs app`).toBe(app);
    }
  });

  /* The merged midrange is the one file that is NOT a gated export, and its
   * floor is read rather than derived. Pinning the number keeps a later
   * re-merge from moving it silently: 60 Hz is what casus 1b's casebook
   * records as the mid's far-field floor (`FF_vloer`, source `merge-block`). */
  it('the two-way midrange is a declared NF/FF merge, valid from a stated 60 Hz', () => {
    const onAxis = demoBundleState(KOAN_2WAY_DEMO).onAxis.low!;
    const mb = readMergeBlock(onAxis.raw);
    expect(mb?.kind).toBe('NF/FF');
    expect(mb?.validFromHz).toBe(60);
    expect(mb?.spliceBandHz).toEqual([500, 800]);
    const [lo, hi] = extentOf(onAxis.raw);
    expect(appVerdict(onAxis.raw, lo, hi)).toMatchObject({ verified: true, floorHz: 60, via: 'merge block' });
  });

  /* The two bundles are the same loudspeaker measured in the same session, so
   * four of the two-way's files are the three-way's files. They are copies —
   * each bundle is its own chunk and neither should drag the other in — and a
   * copy of a measurement is a file that can drift, so the copies are pinned. */
  it('the four shared measurements are byte-identical in their data to the three-way bundle', () => {
    const two = join(ROOT, 'src', 'lib', 'parsers', 'fixtures', 'koan-2way');
    const three = join(ROOT, 'src', 'lib', 'parsers', 'fixtures', 'koan-3way');
    for (const n of ['mid-hor30.txt', 'tweeter-hor0.txt', 'mid-near.txt']) {
      expect(rowsOf(readFileSync(join(two, n), 'utf-8')), n).toBe(rowsOf(readFileSync(join(three, n), 'utf-8')));
    }
    for (const n of ['mid.zma', 'tweeter.zma']) {
      expect(readFileSync(join(two, n), 'utf-8'), n).toBe(readFileSync(join(three, n), 'utf-8'));
    }
  });
});

/* ==================================================================== *
 * GUARD 2 — carried lands, uncarried shows empty
 * ==================================================================== */

describe('U-3 guard 2 — a bundle’s register fields land in the project state, and its silences show empty', () => {
  it('every bearable row id is a real register row', () => {
    const ids = new Set(V2_INPUT_REGISTER.map((r) => r.id));
    for (const id of BUNDLE_BEARABLE_ROWS) expect(ids.has(id), id).toBe(true);
  });

  /* THE STATE IS COMPLETE. This is the half that stops a previous demo owning
   * anything: a loader can only assign what the state names, and a key that is
   * missing is a key nobody clears. */
  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: every role, every settings key and every measurement field is present', (_id, b) => {
    const s = demoBundleState(b);
    for (const r of DEMO_ROLES) {
      expect(Object.hasOwn(s.onAxis, r)).toBe(true);
      expect(Object.hasOwn(s.impedance, r)).toBe(true);
      expect(s.angles[r]).toBeInstanceOf(Array);
      expect(s.nearField[r]).toMatchObject({ cone: expect.anything() === undefined ? null : s.nearField[r].cone });
      expect(typeof s.sdCm2[r]).toBe('string');
      expect(typeof s.xmaxMm[r]).toBe('string');
      expect(typeof s.sizeInch[r]).toBe('string');
      for (const k of V2_MEASUREMENT_KEYS) expect(typeof s.v2Measurement[r][k], `${r}.${k}`).toBe('string');
    }
    for (const k of V2_SETTING_KEYS) expect(typeof s.engineV2[k], k).toBe('string');
  });

  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: what it carries is non-empty, what it does not carry is empty and not absent', (_id, b) => {
    const s = demoBundleState(b);
    const carries = bundleCarries(b);
    for (const id of BUNDLE_BEARABLE_ROWS) {
      expect(typeof carries[id], `${id} has no verdict`).toBe('boolean');
    }
    /* The settings block is the sharpest form of both halves: a row it carries
     * has a value in the state, a row it does not is '' — never undefined. */
    const settingRows: [string, (typeof V2_SETTING_KEYS)[number]][] = [
      ['maxDriveOnFsDb', 'maxDriveOnFsDb'],
      ['amplifierPeakPowerW', 'amplifierPeakPowerW'],
      ['amplifierNominalLoadOhm', 'amplifierNominalLoadOhm'],
      ['xmaxMarginFraction', 'xmaxMarginFraction'],
      ['amplifierPowerW', 'amplifierPowerW'],
      ['resistorClassW', 'resistorClassW'],
      ['resistorPowerMargin', 'resistorPowerMargin'],
      ['coilClassA', 'coilClassA'],
      ['resistorThermalPowerW', 'resistorThermalPowerW'],
      ['lowestWayLevelWork', 'lowestWayLevelWork'],
      ['lowestWaySeriesRMaxOhm', 'lowestWaySeriesRMaxOhm'],
    ];
    for (const [row, key] of settingRows) {
      if (carries[row]) expect(s.engineV2[key].trim(), `${b.id} ${row}`).not.toBe('');
      else expect(s.engineV2[key], `${b.id} ${row} must be empty, not absent`).toBe('');
    }
  });

  /* THE TWO-WAY BUNDLE'S NUMBERS ARE THE CASEBOOK'S. Read from
   * `golden_refs_casus1b.json` rather than retyped, so a requirement that moves
   * there fails here instead of leaving the demo quietly a version behind — the
   * V33 lesson (a script with its half pinned to a stale source makes a
   * different table and says nothing). */
  it('the two-way bundle states exactly what casus 1b states', () => {
    const g = JSON.parse(
      readFileSync(join(ROOT, 'test-fixtures', 'casus1b', 'golden_refs_casus1b.json'), 'utf-8'),
    ) as { manifest_en_geometrie: { gestelde_eisen: Record<string, unknown>; driverkaart: Record<string, unknown>; geometrie: Record<string, Record<string, number>> } };
    const eis = g.manifest_en_geometrie.gestelde_eisen;
    const kaart = g.manifest_en_geometrie.driverkaart;
    const geo = g.manifest_en_geometrie.geometrie;
    const s = demoBundleState(KOAN_2WAY_DEMO);
    const num = (v: string) => Number(v);

    expect(s.ampMinLoadOhm).toBe(eis.versterkervloer_ohm);
    expect(num(s.engineV2.amplifierPeakPowerW)).toBe(eis.versterker_piekvermogen_W);
    expect(num(s.engineV2.amplifierNominalLoadOhm)).toBe(eis.versterker_nominale_last_ohm);
    expect(num(s.engineV2.xmaxMarginFraction)).toBe(eis.xmax_marge);
    expect(num(s.engineV2.amplifierPowerW)).toBe(eis.versterker_continu_vermogen_W);
    expect(num(s.engineV2.resistorClassW)).toBe(eis.weerstandsklasse_W);
    expect(num(s.engineV2.resistorPowerMargin)).toBe(eis.weerstandsmarge);
    expect(num(s.engineV2.resistorThermalPowerW)).toBe(eis.thermisch_ontwerpvermogen_W);

    /* What casus 1b leaves unstated the bundle leaves empty. `spoelklasse_A` is
     * null with casus 1's finding attached (the C-Coil documentation names no
     * saturation current), and the two woofer-bound budgets are explicitly not
     * carried — so they are not stated here either (P4). */
    expect(eis.spoelklasse_A).toBeNull();
    expect(s.engineV2.coilClassA).toBe('');
    expect(Object.keys(eis.niet_overgenomen as Record<string, unknown>)).toEqual(
      expect.arrayContaining(['lf_opslingering_budget_dB', 'qes_vermenigvuldiging_max', 'geen_niveauwerk_op_laagste_weg']),
    );
    expect(s.engineV2.lfBumpBudgetDb).toBe('');
    expect(s.engineV2.qesMultiplierMax).toBe('');
    expect(s.engineV2.lowestWayLevelWork).toBe('');

    /* The M-C figure is stated PER WAY (V50), so the single field stays empty
     * and the tweeter carries the convention. */
    const perWay = eis.drive_op_fs_max_dB_per_weg as Record<string, number | null>;
    expect(s.engineV2.maxDriveOnFsDb).toBe('');
    expect(num(s.v2Measurement.high.driveOnFsMaxDb)).toBe(perWay.tweeter);
    expect(perWay.mid).toBeNull();
    expect(s.v2Measurement.low.driveOnFsMaxDb).toBe('');

    /* The driver cards, way by way — the mid is the app's LOW role. */
    const mid = kaart.mid as Record<string, number>;
    const tw = kaart.tweeter as Record<string, number>;
    expect(num(s.sdCm2.low)).toBe(mid.S_d_cm2);
    expect(num(s.xmaxMm.low)).toBe(mid.X_max_mm);
    expect(num(s.v2Measurement.low.blTm)).toBe(mid.Bl_Tm);
    expect(num(s.v2Measurement.low.mmsG)).toBe(mid.M_ms_g);
    expect(num(s.sdCm2.high)).toBe(tw.S_d_cm2);
    expect(num(s.xmaxMm.high)).toBe(tw.X_max_mm);
    expect(num(s.v2Measurement.high.blTm)).toBe(tw.Bl_Tm);
    expect(num(s.v2Measurement.high.mmsG)).toBe(tw.M_ms_g);

    /* The drive voltage is NOT documented, so route 2 of M-C stays off rather
     * than assuming 2.83 V — the bundle repeats that silence exactly. */
    expect((kaart as { ff_meetspanning_V: unknown }).ff_meetspanning_V).toBeNull();
    for (const r of DEMO_ROLES) expect(s.v2Measurement[r].driveVoltageV).toBe('');
    expect(num(s.cabinet.micDistanceMm!)).toBe((kaart as { ff_mic_afstand_mm: number }).ff_mic_afstand_mm);

    /* Coil families and wiring, both ways, from the same block. */
    const fam = (kaart.spoelfamilie as { per_weg: Record<string, string> }).per_weg;
    expect(s.v2Measurement.low.coilFamily).toBe(fam.mid);
    expect(s.v2Measurement.high.coilFamily).toBe(fam.tweeter);
    for (const [role, key] of [['low', 'mid'], ['high', 'tweeter']] as const) {
      const w = (kaart[key] as { schakeling: { gemeten: string; gewenst: string } }).schakeling;
      expect(s.v2Measurement[role].wiringMeasured).toBe(w.gemeten);
      expect(s.v2Measurement[role].wiringDesired).toBe(w.gewenst);
    }

    /* Geometry: the two ways sit where the casebook puts them, and the baffle
     * is the one it records. */
    expect(num(s.cabinet.drivers!.low!.yMm!)).toBe(geo.z_offset_mm.mid);
    expect(num(s.cabinet.drivers!.high!.yMm!)).toBe(geo.z_offset_mm.tweeter);
    expect(num(s.cabinet.drivers!.high!.yMm!) - num(s.cabinet.drivers!.low!.yMm!)).toBeCloseTo(geo.ctc_mm.mid_tweeter, 6);
    expect(num(s.cabinet.baffleWidthMm!)).toBe(geo.baffle_mm.breedte);
    expect(num(s.cabinet.baffleHeightMm!)).toBe(geo.baffle_mm.hoogte);
    expect(s.v2Measurement.low.rotSym).toBe('yes');
    expect(s.v2Measurement.high.rotSym).toBe('yes');

    /* A5e.2: a stated plateau offset of 0 dB IS the flat reference (M-1). */
    expect(eis.basplateau_offset_dB).toBe(0);
    expect(s.targetCurve).toEqual({ type: 'flat' });

    /* And the gate stays EMPTY: every file states its own window, and A3h
     * forbids a global field standing in for a file's own property. */
    expect(s.cabinet.gateMs).toBe('');
  });

  /* The three-way bundle states no requirements at all, and says so with empty
   * blocks rather than missing ones. That is not a defect to fix here — it is
   * what the three-way demo has always put in the app, measured rather than
   * assumed, and step 1 of U-3 recorded it. */
  it('the three-way bundle states no requirement, and every judgement row reads empty', () => {
    const s = demoBundleState(KOAN_3WAY_BUNDLE);
    const carries = bundleCarries(KOAN_3WAY_BUNDLE);
    const judgement = rowsOfClass('judgement')
      .map((r) => r.id)
      .filter((id) => BUNDLE_BEARABLE_ROWS.includes(id));
    expect(judgement.length).toBeGreaterThan(10);
    for (const id of judgement) expect(carries[id], `3-way ${id}`).toBe(false);
    for (const k of V2_SETTING_KEYS) expect(s.engineV2[k], k).toBe('');
    expect(s.ampMinLoadOhm).toBeNull();
    expect(s.targetCurve).toBeNull();
  });

  /* The two-way bundle is the one that carries requirements, and this counts
   * them: the step-1 table said nine of thirty-six bearable rows and zero of
   * fifteen judgement rows. A drop here is a bundle that quietly stopped
   * stating something. */
  it('the two-way bundle carries the rows step 1 said it must', () => {
    const carries = bundleCarries(KOAN_2WAY_DEMO);
    const carried = BUNDLE_BEARABLE_ROWS.filter((id) => carries[id]);
    const judgement = rowsOfClass('judgement')
      .map((r) => r.id)
      .filter((id) => BUNDLE_BEARABLE_ROWS.includes(id));
    const judgementCarried = judgement.filter((id) => carries[id]);
    expect(judgement).toHaveLength(15);
    expect(judgementCarried).toHaveLength(10);
    expect(carried).toHaveLength(26);
    /* THE TEN IT DOES NOT CARRY, BY NAME AND NOT BY COUNT — the V47/V48 lesson:
     * a complement grows with the register, so an exact set fails when a row
     * arrives, which is when someone should look. Each of the ten is a silence
     * casus 1b keeps on purpose:
     *   driveVoltageV        — not documented, so M-C's acoustic route stays off
     *   nearFieldPort        — a closed pod has no port
     *   measuredRe           — nobody put a meter on these; the sweep decides
     *   acousticCentre       — flush-mounted, so the cabinet position is right
     *   nominalSize          — S_d gives the piston diameter
     *   maxDriveOnFsDb       — stated PER WAY instead (V50)
     *   coilClassA           — the C-Coil documentation names no saturation current
     *   lowestWayLevelWork   — the rule is woofer-bound; this lowest way MAY be padded
     *   lowestWaySeriesRMaxOhm — the same rule's V51b variant, withdrawn at M-1
     *   plateauDepthDb       — the voicing is flat, so there is no depth to state
     */
    expect(BUNDLE_BEARABLE_ROWS.filter((id) => !carries[id]).sort()).toEqual(
      [
        'acousticCentre',
        'coilClassA',
        'driveVoltageV',
        'lowestWaySeriesRMaxOhm',
        'lowestWayLevelWork',
        'maxDriveOnFsDb',
        'measuredRe',
        'nearFieldPort',
        'nominalSize',
        'plateauDepthDb',
      ].sort(),
    );
  });
});

/* ==================================================================== *
 * The loader actually calls it, and says whose numbers these are
 * ==================================================================== */

describe('U-3 — the app loads both demos through the one applier', () => {
  /* A SOURCE SCAN, the UI-1 idiom: the pure function above is tested without a
   * browser, and what a function test cannot reach is whether the app CALLS it.
   * That is exactly what went wrong before — the state existed, the loader did
   * not assign it. */
  it('both loaders go through applyDemoBundle, and it assigns what the two-way loader used to leave behind', () => {
    expect(APP).toContain('function applyDemoBundle(');
    expect(APP).toMatch(/applyDemoBundle\(mod\.KOAN_2WAY_DEMO, mod\.KOAN_2WAY_STATED\)/);
    expect(APP).toMatch(/applyDemoBundle\(mod\.KOAN_3WAY_BUNDLE, null\)/);
    const body = APP.slice(APP.indexOf('function applyDemoBundle('), APP.indexOf('async function loadDemo2Way()'));
    /* The four the old two-way loader never touched — leaving the three-way
     * demo's near fields, standalone impedances, verify list and file notes on
     * a two-way project. */
    for (const setter of ['setNearField(', 'setZStandalone(', 'setVerifyList(', 'setVerifyIx(', 'setFileNotes(']) {
      expect(body, setter).toContain(setter);
    }
    /* And the blocks a bundle states. */
    for (const setter of ['setEngineV2Settings(', 'setV2Meas(', 'setEngineV2StatedBy(', 'setCabinet(', 'setSdCm2(', 'setXmaxMm(']) {
      expect(body, setter).toContain(setter);
    }
    /* No second copy of the old two-way loader anywhere. */
    expect(APP).not.toContain('mettape');
  });

  it('the amplifier floor is a preference: written only when the viewer has none', () => {
    const body = APP.slice(APP.indexOf('function applyDemoBundle('), APP.indexOf('async function loadDemo2Way()'));
    expect(body).toMatch(/localStorage\.getItem\('ads-amp-min-load'\) === null/);
  });

  /* WHOSE NUMBERS. A demo states eight requirements about a real loudspeaker;
   * marking them "stated by you" would put them in the viewer's mouth. */
  it('a demo value is marked with the demo’s name, and the first edit makes it the viewer’s', () => {
    const s = demoBundleState(KOAN_2WAY_DEMO);
    const at = { amplifierPeakPowerW: KOAN_2WAY_STATED.on };
    const by = { amplifierPeakPowerW: KOAN_2WAY_STATED.by };
    expect(statedMark(s.engineV2, at, 'amplifierPeakPowerW', by)).toBe(
      `stated by ${KOAN_2WAY_STATED.by} on ${KOAN_2WAY_STATED.on}`,
    );
    // The same value with nobody named is the viewer's, as it always was.
    expect(statedMark(s.engineV2, at, 'amplifierPeakPowerW', {})).toBe(`stated by you on ${KOAN_2WAY_STATED.on}`);
    // And an edit drops the name.
    expect(clearStatedBy(by, 'amplifierPeakPowerW')).toEqual({});
    // An empty field is marked at all times by nothing.
    expect(statedMark(s.engineV2, at, 'lfBumpBudgetDb', by)).toBeNull();
  });

  it('the attribution survives a project round trip, and a project without it reads as the viewer’s', () => {
    const s = demoBundleState(KOAN_2WAY_DEMO);
    const stored = Object.fromEntries(V2_SETTING_KEYS.map((k) => [k, s.engineV2[k]]));
    const at = Object.fromEntries(V2_SETTING_KEYS.filter((k) => s.engineV2[k] !== '').map((k) => [k, KOAN_2WAY_STATED.on]));
    const by = Object.fromEntries(V2_SETTING_KEYS.filter((k) => s.engineV2[k] !== '').map((k) => [k, KOAN_2WAY_STATED.by]));
    const back = restoreV2Settings(stored, at, by);
    expect(back.settings.amplifierPeakPowerW).toBe('160');
    expect(back.statedBy.amplifierPeakPowerW).toBe(KOAN_2WAY_STATED.by);
    expect(restoreV2Settings(stored, at, undefined).statedBy).toEqual({});
  });
});
