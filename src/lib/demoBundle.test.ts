import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUNDLE_BEARABLE_ROWS,
  BUNDLE_CARRIED_ROWS,
  DEMO_ROLES,
  bundleCarries,
  demoBundleState,
  readableValidity,
  stateFieldFilled,
  stateFields,
  type DemoBundle,
  type DemoFile,
} from './demoBundle.ts';
import { KOAN_2WAY_DEMO } from '../demo2way.ts';
import { KOAN_3WAY_BUNDLE } from '../demo3way.ts';
import { DEFAULT_GATE_TAPER_ALPHA, dataFloorFromGateMs, readGateHeader, readMergeBlock } from './xoWindow.ts';
import { declaredMergeValidity } from './sourceMeta.ts';
import { parseArtaHeader } from './engine2/ingest/manifest.ts';
import { parseTabular } from './parsers/tabular.ts';
import { V2_INPUT_REGISTER, rowsOfClass } from './v2InputRegister.ts';
import { V2_JUDGEMENT_KEYS, V2_SETTING_KEYS, type V2SettingKey } from './v2Settings.ts';
import { V2_MEASUREMENT_KEYS, type V2MeasurementMeta } from './v2Measurement.ts';
import { RUN_EXPORT_FORMAT } from './engine2/optimizer/runExport.ts';
import { EXPLORATION_CHAIN_BUDGET } from './engine2/constants.ts';
import type { BranchRole } from './driverSlots.ts';

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
 * GUARD 2 — carried lands, uncarried shows empty, and the content is pinned
 * ==================================================================== */

describe('U-3b guard 2 — a bundle carries measurements and geometry, and every other field of the state is empty', () => {
  it('every bearable row id and every carried row id is a real register row', () => {
    const ids = new Set(V2_INPUT_REGISTER.map((r) => r.id));
    for (const id of BUNDLE_BEARABLE_ROWS) expect(ids.has(id), id).toBe(true);
    for (const id of BUNDLE_CARRIED_ROWS) expect(ids.has(id), id).toBe(true);
  });

  /* THE RULE IS A SUBSET OF THE SHAPE. `BUNDLE_BEARABLE_ROWS` is what the type
   * can hold; `BUNDLE_CARRIED_ROWS` is what a demo is allowed to hold. Every
   * row the rule allows must be one the shape can carry, and the rule must be
   * strictly smaller — a rule as wide as the shape forbids nothing. */
  it('the U-3b rule is a strict subset of what the shape can carry, and holds every REQUIRED row', () => {
    for (const id of BUNDLE_CARRIED_ROWS) expect(BUNDLE_BEARABLE_ROWS, id).toContain(id);
    expect(BUNDLE_CARRIED_ROWS.length).toBeLessThan(BUNDLE_BEARABLE_ROWS.length);
    for (const r of rowsOfClass('required')) expect(BUNDLE_CARRIED_ROWS, r.id).toContain(r.id);
    // …and it holds NO judgement row: that is the whole of what U-3b removed.
    for (const r of rowsOfClass('judgement')) expect(BUNDLE_CARRIED_ROWS, r.id).not.toContain(r.id);
  });

  /* THE STATE IS COMPLETE. This is the half that stops a previous demo owning
   * anything: a loader can only assign what the state names, and a key that is
   * missing is a key nobody clears. Since U-3b it is checked over the WHOLE
   * flattened state rather than block by block, so a block added to
   * `DemoBundleState` without a line in `stateFields` fails here. */
  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: every role, every settings key and every measurement field is present', (_id, b) => {
    const s = demoBundleState(b);
    for (const r of DEMO_ROLES) {
      expect(Object.hasOwn(s.onAxis, r)).toBe(true);
      expect(Object.hasOwn(s.impedance, r)).toBe(true);
      expect(s.angles[r]).toBeInstanceOf(Array);
      expect(typeof s.sdCm2[r]).toBe('string');
      expect(typeof s.xmaxMm[r]).toBe('string');
      expect(typeof s.sizeInch[r]).toBe('string');
      for (const k of V2_MEASUREMENT_KEYS) expect(typeof s.v2Measurement[r][k], `${r}.${k}`).toBe('string');
    }
    for (const k of V2_SETTING_KEYS) expect(typeof s.engineV2[k], k).toBe('string');
    /* The flat enumeration must reach all of it: every settings key, every
     * measurement field of every role and every cabinet field, or the two
     * claims below are claims about a subset nobody named. */
    const paths = new Set(stateFields(s).map((f) => f.path));
    for (const k of V2_SETTING_KEYS) expect(paths.has(`engineV2.${k}`), k).toBe(true);
    for (const r of DEMO_ROLES) {
      for (const k of V2_MEASUREMENT_KEYS) expect(paths.has(`v2Measurement.${r}.${k}`), `${r}.${k}`).toBe(true);
      expect(paths.has(`cabinet.drivers.${r}.yMm`), r).toBe(true);
    }
    for (const k of ['micDistanceMm', 'micElevationDeg', 'gateMs', 'baffleWidthMm', 'baffleHeightMm', 'cabinetDepthMm', 'refFromTopMm', 'refHeightMm', 'listenDistanceM', 'listenEarHeightMm', 'refDriver']) {
      expect(paths.has(`cabinet.${k}`), k).toBe(true);
    }
  });

  /* HALF ONE — LOSSLESS. Every value the bundle states arrives in the state,
   * verbatim. Read off the BUNDLE rather than off a list, so a field added to
   * a bundle and forgotten in `demoBundleState` fails here. */
  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: what the bundle states arrives in the state, verbatim', (_id, b) => {
    const s = demoBundleState(b);
    for (const r of DEMO_ROLES) {
      const br = b.branches[r];
      expect(s.onAxis[r]?.name ?? null, `onAxis.${r}`).toBe(br?.angles[0]?.file.name ?? null);
      expect(s.angles[r].length, `angles.${r}`).toBe(br?.angles.length ?? 0);
      expect(s.impedance[r]?.name ?? null, `impedance.${r}`).toBe(br?.impedance.name ?? null);
      expect(s.nearField[r].cone?.name ?? null, `nf.cone.${r}`).toBe(br?.nearCone?.name ?? null);
      expect(s.nearField[r].port?.name ?? null, `nf.port.${r}`).toBe(br?.nearPort?.name ?? null);
      expect(s.sdCm2[r], `sd.${r}`).toBe(b.sdCm2[r] ?? '');
      expect(s.xmaxMm[r], `xmax.${r}`).toBe(b.xmaxMm[r] ?? '');
      expect(s.sizeInch[r], `size.${r}`).toBe(b.sizeInch[r] ?? '');
      for (const k of V2_MEASUREMENT_KEYS) {
        expect(s.v2Measurement[r][k], `${r}.${k}`).toBe(b.v2Measurement[r]?.[k] ?? '');
      }
    }
    for (const k of V2_SETTING_KEYS) expect(s.engineV2[k], k).toBe(b.engineV2[k] ?? '');
    expect(s.cabinet).toEqual(b.cabinet);
    expect(s.ampMinLoadOhm).toBe(b.ampMinLoadOhm);
    expect(s.targetCurve).toEqual(b.targetCurve);
    expect(s.ways).toBe(DEMO_ROLES.filter((r) => b.branches[r] !== undefined).length);
  });

  /* HALF TWO — NOTHING INVENTED, over the WHOLE state and not a chosen list.
   * Every filled field of the state has to be a field the bundle actually
   * states; the ones it does not state read '' or null. The mapping from a
   * path back to the bundle is deliberately mechanical. */
  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: no field of the state holds a value the bundle does not state', (_id, b) => {
    const s = demoBundleState(b);
    const filled = stateFields(s).filter(stateFieldFilled);
    expect(filled.length).toBeGreaterThan(10);
    for (const f of filled) {
      const p = f.path.split('.');
      let stated: unknown;
      if (p[0] === 'engineV2') stated = b.engineV2[p[1] as V2SettingKey];
      else if (p[0] === 'v2Measurement') stated = b.v2Measurement[p[1] as BranchRole]?.[p[2] as keyof V2MeasurementMeta];
      else if (p[0] === 'cabinet' && p[1] === 'drivers') stated = (b.cabinet.drivers?.[p[2] as BranchRole] as Record<string, unknown> | undefined)?.[p[3]];
      else if (p[0] === 'cabinet') stated = (b.cabinet as Record<string, unknown>)[p[1]];
      else if (p[0] === 'sdCm2' || p[0] === 'xmaxMm' || p[0] === 'sizeInch') stated = b[p[0]][p[1] as BranchRole];
      else continue; // file slots, ways, ampMinLoadOhm, targetCurve — covered above
      expect(stated, `${f.path} holds ${String(f.value)} but the bundle states nothing there`).not.toBe(undefined);
      expect(String(stated), f.path).toBe(String(f.value));
    }
  });

  /* HALF THREE — NOTHING THAT JUDGES, and no unattributed statement. A demo
   * states no requirement, so every judgement key is '' and the amplifier
   * floor and the voicing are null. The second clause is the one that would
   * catch a bundle stating something WITHOUT saying whose it is: with the
   * `stated` argument gone from the applier there is no way to attribute a
   * value at all, so a stated judgement key could only be unattributed. */
  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: it judges nothing — every judgement key empty, no floor, no voicing', (_id, b) => {
    const s = demoBundleState(b);
    for (const k of V2_JUDGEMENT_KEYS) expect(s.engineV2[k], `${b.id} ${k}`).toBe('');
    for (const k of V2_SETTING_KEYS) expect(s.engineV2[k], `${b.id} ${k}`).toBe('');
    expect(s.ampMinLoadOhm, b.id).toBeNull();
    expect(s.targetCurve, b.id).toBeNull();
    for (const r of DEMO_ROLES) {
      expect(s.v2Measurement[r].driveOnFsMaxDb, `${b.id} ${r}`).toBe('');
      expect(s.xmaxMm[r], `${b.id} ${r}`).toBe('');
    }
    // A gate override is a statement about a FILE that no field may make (A3h).
    expect(s.cabinet.gateMs, b.id).toBe('');
  });

  /* THE CONTENT LIST, PINNED BY NAME. A row that ever sneaks back in is red
   * here, which is the whole reason this list exists rather than a count —
   * the V47/V48 lesson: a count moves with the register, a name does not. */
  it.each(BUNDLES.map((b) => [b.id, b] as const))('%s: what it carries is within the U-3b rule', (_id, b) => {
    const carries = bundleCarries(b);
    for (const id of BUNDLE_BEARABLE_ROWS) expect(typeof carries[id], `${id} has no verdict`).toBe('boolean');
    const carried = BUNDLE_BEARABLE_ROWS.filter((id) => carries[id]);
    for (const id of carried) expect(BUNDLE_CARRIED_ROWS, `${b.id} carries ${id}`).toContain(id);
    // Every REQUIRED row really is carried: a bundle that judges nothing must
    // still be a bundle a run can start from.
    for (const r of rowsOfClass('required')) expect(carries[r.id], `${b.id} ${r.id}`).toBe(true);
  });

  it('the exact carried set of each bundle, by name', () => {
    /* The two-way is a closed pod with a merged midrange: no port near field,
     * and a splice band and a validity floor that travel inside the merged
     * file. The three-way is a reflex box with a port near field and no merged
     * response, so it is the mirror image. Both lists are the seven REQUIRED
     * rows plus exactly those facts about their own loudspeaker. */
    expect(BUNDLE_BEARABLE_ROWS.filter((id) => bundleCarries(KOAN_2WAY_DEMO)[id]).sort()).toEqual(
      ['baffle-width', 'impedance', 'mergeValidFrom', 'nearFieldCone', 'positions', 'responses', 'sd', 'spliceBand', 'validity', 'ways'].sort(),
    );
    expect(BUNDLE_BEARABLE_ROWS.filter((id) => bundleCarries(KOAN_3WAY_BUNDLE)[id]).sort()).toEqual(
      ['baffle-width', 'impedance', 'nearFieldCone', 'nearFieldPort', 'positions', 'responses', 'sd', 'validity', 'ways'].sort(),
    );
  });

  /* THE GEOMETRY IS THE CASEBOOK'S, read rather than retyped, so a number that
   * moves there fails here instead of leaving the demo quietly a version
   * behind — the V33 lesson. The two-way is casus 1b's; the three-way's is
   * Sander's own entry for this cabinet, which casus 1's manifest names as the
   * SOURCE of its baffle block, so it is pinned against itself and not against
   * the manifest's z-offsets (they differ by up to 15 mm; see `demo2way.ts`). */
  it('the two-way bundle’s geometry is exactly what casus 1b records', () => {
    const g = JSON.parse(
      readFileSync(join(ROOT, 'test-fixtures', 'casus1b', 'golden_refs_casus1b.json'), 'utf-8'),
    ) as { manifest_en_geometrie: { driverkaart: Record<string, unknown>; geometrie: Record<string, Record<string, number>> } };
    const geo = g.manifest_en_geometrie.geometrie;
    const kaart = g.manifest_en_geometrie.driverkaart;
    const s = demoBundleState(KOAN_2WAY_DEMO);
    const num = (v: string) => Number(v);

    expect(num(s.cabinet.drivers!.low!.yMm!)).toBe(geo.z_offset_mm.mid);
    expect(num(s.cabinet.drivers!.high!.yMm!)).toBe(geo.z_offset_mm.tweeter);
    expect(num(s.cabinet.drivers!.high!.yMm!) - num(s.cabinet.drivers!.low!.yMm!)).toBeCloseTo(geo.ctc_mm.mid_tweeter, 6);
    expect(num(s.cabinet.baffleWidthMm!)).toBe(geo.baffle_mm.breedte);
    expect(num(s.cabinet.baffleHeightMm!)).toBe(geo.baffle_mm.hoogte);
    expect(num(s.cabinet.micDistanceMm!)).toBe((kaart as { ff_mic_afstand_mm: number }).ff_mic_afstand_mm);
    expect(num(s.sdCm2.low)).toBe((kaart.mid as Record<string, number>).S_d_cm2);
    expect(num(s.sdCm2.high)).toBe((kaart.tweeter as Record<string, number>).S_d_cm2);

    /* THE REFERENCE POINT IS NEW AT U-3b AND IS THE FIX. Casus 1b states none,
     * so the bundle stated none, so the app's drawing fell back to
     * `Number(refFromTopMm) || 0` and put the tweeter 65 mm ABOVE the top of a
     * 1124 mm panel. It is the same cabinet's mic aim, and the counter-proof
     * is that both drivers now land INSIDE the panel. */
    const top = num(s.cabinet.refFromTopMm!);
    const height = num(s.cabinet.baffleHeightMm!);
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(height);
    for (const r of ['low', 'high'] as const) {
      const belowTop = top - num(s.cabinet.drivers![r]!.yMm!);
      expect(belowTop, `${r} sits on the panel`).toBeGreaterThan(0);
      expect(belowTop, `${r} sits on the panel`).toBeLessThan(height);
    }
    expect(num(s.cabinet.refHeightMm!)).toBeGreaterThan(0);
  });

  it('the three-way bundle’s geometry is its own cabinet entry, and every driver sits on the panel', () => {
    const s = demoBundleState(KOAN_3WAY_BUNDLE);
    const num = (v: string) => Number(v);
    const top = num(s.cabinet.refFromTopMm!);
    const height = num(s.cabinet.baffleHeightMm!);
    for (const r of DEMO_ROLES) {
      const belowTop = top - num(s.cabinet.drivers![r]!.yMm!);
      expect(belowTop, `${r} sits on the panel`).toBeGreaterThan(0);
      expect(belowTop, `${r} sits on the panel`).toBeLessThan(height);
    }
    // The woofer PAIR is two radiators; without the count and the spacing the
    // app reads one cone and the array's own lobing ceiling disappears.
    expect(s.cabinet.drivers!.low!.count).toBe('2');
    expect(Number(s.cabinet.drivers!.low!.spacingMm)).toBeGreaterThan(0);
  });
});

/* ==================================================================== *
 * The loader actually calls it, and states nothing on anyone's behalf
 * ==================================================================== */

describe('U-3b — the app loads both demos through the one applier, and neither states anything', () => {
  /* A SOURCE SCAN, the UI-1 idiom: the pure function above is tested without a
   * browser, and what a function test cannot reach is whether the app CALLS it.
   * That is exactly what went wrong before — the state existed, the loader did
   * not assign it. */
  it('both loaders go through applyDemoBundle, and it assigns what the two-way loader used to leave behind', () => {
    expect(APP).toContain('function applyDemoBundle(');
    expect(APP).toMatch(/applyDemoBundle\(mod\.KOAN_2WAY_DEMO\)/);
    expect(APP).toMatch(/applyDemoBundle\(mod\.KOAN_3WAY_BUNDLE\)/);
    const body = APP.slice(APP.indexOf('function applyDemoBundle('), APP.indexOf('async function loadDemo2Way()'));
    /* The five the old two-way loader never touched — leaving the three-way
     * demo's near fields, standalone impedances, verify list and file notes on
     * a two-way project. */
    for (const setter of ['setNearField(', 'setZStandalone(', 'setVerifyList(', 'setVerifyIx(', 'setFileNotes(']) {
      expect(body, setter).toContain(setter);
    }
    /* And the blocks a bundle assigns whether it states them or not. */
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

  /* U-3b — NOBODY IS QUOTED. U-3 gave the applier a `stated` argument so a
   * demo's eight requirements could be marked with the demo's name instead of
   * "stated by you". With no bundle stating anything the argument could only
   * ever be null, so it is gone and both maps are cleared outright. The
   * mechanism it used stays where it is and is pinned by `v2Settings.test.ts`:
   * a project written before U-3b still carries its attribution. */
  it('the applier attributes nothing: both maps are cleared, and the stated argument is gone', () => {
    const body = APP.slice(APP.indexOf('function applyDemoBundle('), APP.indexOf('async function loadDemo2Way()'));
    expect(body).toContain('setEngineV2StatedAt({})');
    expect(body).toContain('setEngineV2StatedBy({})');
    expect(APP).toContain('function applyDemoBundle(bundle: DemoBundle): void');
    expect(APP).not.toMatch(/applyDemoBundle\([^)]*,\s*(null|mod\.)/);
  });
});

/* ==================================================================== *
 * U-3b — THE DEMO STORY: a bare bundle RUNS, and judges nothing
 * ==================================================================== */

describe('U-3b — the bare-bundle exploration, as it came out of the browser', () => {
  /* A RECORDED RUN AND NOT A FIXTURE WRITTEN TODAY. `casus1_u3b_kale_demo_run.json`
   * is the export of an exploration on the three-way demo in a fresh browser
   * with nothing typed into any field — the run this app is FOR, on the
   * material a newcomer opens. 900 s in a headless Chrome, six of fifteen
   * derived candidates, six qualified.
   *
   * The E-2 export beside it (`casus1_e2_verkenning_run.json`) stays exactly
   * where it is: it was made on the same bundle with requirements typed in by
   * hand, `scanRequest.test.ts` reproduces its `run` block key by key, and
   * `replay-app-run.ts --set demo` still says SAME on both layers for it. Two
   * dated records of the same demo, one judged and one not. */
  const RUN = JSON.parse(
    readFileSync(join(ROOT, 'test-fixtures', 'casus1_u3b_kale_demo_run.json'), 'utf-8'),
  ) as {
    format: string;
    run: { gates?: Record<string, unknown>; budgets?: Record<string, unknown>; requirements?: unknown };
    field: { parameters: Record<string, number | string>; candidates: { label: string }[] };
    shortlist: { rows: unknown[] };
    stamp: { status: string; fingerprint: string };
  };

  it('a demo loaded and run with nothing typed arms NOTHING — P4 over the whole app', () => {
    expect(RUN.format).toBe(RUN_EXPORT_FORMAT);
    expect(RUN.run.gates ?? {}).toEqual({});
    expect(RUN.run.budgets ?? {}).toEqual({});
    expect(RUN.run.requirements ?? null).toBeNull();
  });

  it('and it still RUNS: the exploration field, six candidates, six qualified', () => {
    expect(RUN.field.parameters.chainBudget).toBe(EXPLORATION_CHAIN_BUDGET);
    expect(RUN.field.parameters.positionPolicy).toBe('centre-first');
    expect(RUN.field.parameters.alignmentPolicy).toBe('one');
    expect(RUN.field.candidates).toHaveLength(6);
    expect(RUN.shortlist.rows).toHaveLength(6);
    expect(RUN.stamp.status).toBe('completed');
  });

  /* WHAT THE STRIPPING COST, MEASURED RATHER THAN ASSUMED. The low→mid
   * handover is where it was (415.8 / 466.7 Hz): its window floor is the
   * woofer's own gate and no requirement moved it. The mid→high handover DID
   * move, and honestly — with no X_max, no Bl and no M_ms the tweeter has no
   * derived excursion ceiling and no stated dB figure, so A5d.3's drive floor
   * cannot arm and the window falls back to k·f_s. A demo that states nothing
   * gets the window that states nothing. */
  it('the handover positions are the ones a bundle that states nothing produces', () => {
    const labels = RUN.field.candidates.map((c) => c.label);
    for (const l of labels) expect(l).toMatch(/^low→mid (415\.8|466\.7) LR4 · mid→high (1532\.6|1720\.3|1931) LR4$/);
    /* The counter-proof, from the E-2 export of the same bundle WITH the
     * requirements typed in: the same low→mid pair, a different mid→high set.
     * Without it "the positions are these" cannot be told from "the positions
     * never depended on anything". */
    const e2 = JSON.parse(
      readFileSync(join(ROOT, 'test-fixtures', 'casus1_e2_verkenning_run.json'), 'utf-8'),
    ) as { field: { candidates: { label: string }[] }; run: { gates?: Record<string, unknown> } };
    const at = (ls: string[], side: 'low→mid' | 'mid→high') =>
      [...new Set(ls.map((l) => l.split(' · ').find((p) => p.startsWith(side))!))].sort();
    expect(at(labels, 'low→mid')).toEqual(at(e2.field.candidates.map((c) => c.label), 'low→mid'));
    expect(at(labels, 'mid→high')).not.toEqual(at(e2.field.candidates.map((c) => c.label), 'mid→high'));
    expect(Object.keys(e2.run.gates ?? {}).length).toBeGreaterThan(0);
  });
});
