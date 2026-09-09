/**
 * U-3 — A DEMO BUNDLE, AND THE PROJECT STATE IT PRODUCES.
 *
 * WHY THIS FILE EXISTS. The two demos were two different KINDS of thing. The
 * three-way one is a data module (`demo3way.ts`) with a loader beside it; the
 * two-way one was twelve `?raw` imports and forty lines of `setState` inlined
 * in `App.tsx`. A bundle that only exists inside a React component cannot be
 * read by a test, and what could not be read had drifted twice over:
 *
 *   1. Its twelve measurement files carried NO header at all, so
 *      `readGateHeader` answered `absent` on every one of them, so
 *      `refuseIfUnverified` refused to optimise — a demo that blocked its own
 *      route, with the app's own honest message.
 *   2. It stated none of the requirements the v2 route has learned to read
 *      since E-3, and neither does the three-way one: between them the two
 *      bundles carried nine and eleven of the thirty-six register rows a
 *      bundle can carry, and ZERO of the fifteen judgement rows.
 *
 * So a bundle is DATA here, in one shape, and `demoBundleState` turns it into
 * the values the loader assigns. That function is the whole point: it is pure,
 * both loaders call it, and the two guards in `demoBundle.test.ts` read it.
 *
 * "EMPTY, NOT ABSENT" IS A RULE AND NOT A DETAIL. Every state block this
 * returns is COMPLETE: every branch role, every v2 settings key, every
 * measurement field, with '' where the bundle says nothing. A loader that
 * assigned only the keys a bundle happens to carry would leave whatever the
 * previous demo put there — which is exactly what the two-way loader did with
 * near fields, standalone impedances, the verify list and the file notes, none
 * of which it ever cleared.
 *
 * No engine import and no file reading: this is bundle code, it ships in the
 * browser, and `browserSafe.test.ts` holds it to that.
 */

import type { BranchRole } from './driverSlots.ts';
import type { NetworkDesign, ProjectDesign } from './project.ts';
import { V2_SETTING_KEYS, type V2SettingKey, type V2Settings } from './v2Settings.ts';
import { emptyV2Meas, type V2MeasurementMeta } from './v2Measurement.ts';

/** Every branch role, in the order the app fills them. */
export const DEMO_ROLES: readonly BranchRole[] = ['low', 'mid', 'high'];

/** One measurement file as it ships: the name the app shows, and its text. */
export interface DemoFile {
  name: string;
  raw: string;
}

/** One way of a bundle. `angles[0]` is the on-axis file and is required. */
export interface DemoBranch {
  /** 0° file first; `hor` in degrees. */
  angles: { hor: number; file: DemoFile }[];
  impedance: DemoFile;
  nearCone?: DemoFile;
  nearPort?: DemoFile;
}

/** The cabinet/rig block, in the shape the project file stores it. */
export type DemoCabinet = NonNullable<ProjectDesign['cabinet']>;
/** The v2 settings a bundle STATES; every other key resolves to ''. */
export type DemoEngineV2 = NonNullable<ProjectDesign['engineV2']>;
/** The A5a measurement facts a bundle states, per role. */
export type DemoV2Measurement = Partial<Record<BranchRole, Partial<V2MeasurementMeta>>>;
/** The voicing, in the shape a design stores it. */
export type DemoTargetCurve = NonNullable<NetworkDesign['targetCurve']>;

/**
 * A demo bundle: a whole measurement SESSION plus everything the designer of
 * that session stated about it. Every block is required in the TYPE and may be
 * empty in the VALUE — a bundle that states no requirements says so with an
 * empty block, not by leaving the field out, so a reader never has to wonder
 * whether a missing block means "nothing stated" or "nobody got round to it".
 */
export interface DemoBundle {
  /** Stable id — the guards and the loader name a bundle by it. */
  id: string;
  /** What the app shows when it has loaded. */
  label: string;
  /**
   * Where the measurements come from and when, in one sentence each. A demo is
   * evidence about a real loudspeaker; a bundle that cannot say whose
   * measurements these are should not ship.
   */
  provenance: { source: string; measured: string; note?: string };
  /** The ways this bundle fills. A role that is absent stays empty in the app. */
  branches: Partial<Record<BranchRole, DemoBranch>>;
  cabinet: DemoCabinet;
  /** Datasheet cone area and one-way X_max per role; '' where not stated. */
  sdCm2: Partial<Record<BranchRole, string>>;
  xmaxMm: Partial<Record<BranchRole, string>>;
  /** Nominal cone size in inches per role, for the beaming ceiling; '' = S_d decides. */
  sizeInch: Partial<Record<BranchRole, string>>;
  engineV2: DemoEngineV2;
  v2Measurement: DemoV2Measurement;
  /**
   * The amplifier's minimum load, Ω. It is the OWNER'S PREFERENCE and not
   * project data (it describes a rack, not a loudspeaker), so the loader only
   * writes it when the viewer has none of their own — the same rule the demo
   * catalogue has always followed. `null` = the bundle states none.
   */
  ampMinLoadOhm: number | null;
  /** The voicing of the design; `null` = the bundle states none, so flat. */
  targetCurve: DemoTargetCurve | null;
}

/* ==================================================================== *
 * The state a bundle produces
 * ==================================================================== */

/** One near-field slot as a bundle states it. */
export interface DemoNearFieldSlot {
  cone: DemoFile | null;
  port: DemoFile | null;
}

/**
 * The values a loader assigns, complete. Every record covers every role and
 * every key: '' and `null` are what a bundle's silence looks like, and the
 * loader assigns them so a previous demo cannot leave anything behind.
 */
export interface DemoBundleState {
  id: string;
  label: string;
  /** The on-axis file per role, or null — what goes in the measurement slot. */
  onAxis: Record<BranchRole, DemoFile | null>;
  /** The whole angle set per role; empty where the bundle fills no such way. */
  angles: Record<BranchRole, { hor: number; file: DemoFile }[]>;
  impedance: Record<BranchRole, DemoFile | null>;
  nearField: Record<BranchRole, DemoNearFieldSlot>;
  cabinet: DemoCabinet;
  sdCm2: Record<BranchRole, string>;
  xmaxMm: Record<BranchRole, string>;
  sizeInch: Record<BranchRole, string>;
  engineV2: V2Settings;
  v2Measurement: Record<BranchRole, V2MeasurementMeta>;
  ampMinLoadOhm: number | null;
  targetCurve: DemoTargetCurve | null;
  /** How many ways the bundle fills — 2 or 3; the loader needs no other test. */
  ways: number;
}

const byRole = <T,>(f: (r: BranchRole) => T): Record<BranchRole, T> =>
  ({ low: f('low'), mid: f('mid'), high: f('high') }) as Record<BranchRole, T>;

/**
 * Turn a bundle into the project state it produces — pure, total, and the one
 * place both loaders read.
 */
export function demoBundleState(b: DemoBundle): DemoBundleState {
  const branch = (r: BranchRole) => b.branches[r];
  const engineV2 = Object.fromEntries(
    V2_SETTING_KEYS.map((k) => [k, (b.engineV2 as Partial<Record<V2SettingKey, string>>)[k] ?? '']),
  ) as V2Settings;

  return {
    id: b.id,
    label: b.label,
    onAxis: byRole((r) => branch(r)?.angles[0]?.file ?? null),
    angles: byRole((r) => branch(r)?.angles ?? []),
    impedance: byRole((r) => branch(r)?.impedance ?? null),
    nearField: byRole((r) => ({ cone: branch(r)?.nearCone ?? null, port: branch(r)?.nearPort ?? null })),
    cabinet: b.cabinet,
    sdCm2: byRole((r) => b.sdCm2[r] ?? ''),
    xmaxMm: byRole((r) => b.xmaxMm[r] ?? ''),
    sizeInch: byRole((r) => b.sizeInch[r] ?? ''),
    engineV2,
    v2Measurement: byRole((r) => ({ ...emptyV2Meas(), ...(b.v2Measurement[r] ?? {}) })),
    ampMinLoadOhm: b.ampMinLoadOhm,
    targetCurve: b.targetCurve,
    ways: DEMO_ROLES.filter((r) => branch(r) !== undefined).length,
  };
}

/* ==================================================================== *
 * What a bundle carries, in the register's own vocabulary
 * ==================================================================== */

/**
 * The I-1 register rows a demo BUNDLE can carry at all. The rest are the
 * viewer's own preference, a run control with a published default, or a v1
 * knob — none of them belongs to a measurement session, and a bundle that set
 * them would be stating something on the designer's behalf.
 *
 * `ampMinLoadOhm` is on the list and is the one row a bundle states WITHOUT
 * writing it unconditionally: see `DemoBundle.ampMinLoadOhm`.
 */
export const BUNDLE_BEARABLE_ROWS: readonly string[] = Object.freeze([
  // required
  'responses', 'validity', 'impedance', 'ways', 'positions', 'sd', 'baffle-width',
  // nice
  'blTm', 'mmsG', 'xmaxMm', 'driveVoltageV', 'coilFamily',
  'nearFieldCone', 'nearFieldPort', 'spliceBand', 'mergeValidFrom', 'measuredRe',
  'rotSym', 'acousticCentre', 'wiring', 'nominalSize',
  // judgement
  'ampMinLoadOhm', 'maxDriveOnFsDb', 'driveOnFsMaxDb-per-way',
  'amplifierPeakPowerW', 'amplifierNominalLoadOhm', 'xmaxMarginFraction',
  'amplifierPowerW', 'resistorClassW', 'resistorPowerMargin', 'coilClassA',
  'resistorThermalPowerW', 'lowestWayLevelWork', 'lowestWaySeriesRMaxOhm',
  'targetCurve', 'plateauDepthDb',
]);

/**
 * U-3b — WHAT A DEMO BUNDLE MAY CARRY, AS DATA.
 *
 * A demo is GENERIC PRACTICE MATERIAL (Sander, 09-09-2026): measurements and
 * geometry that have to work, and nothing that judges. Until U-3b the two-way
 * bundle carried casus 1b's whole requirement sheet — ten of the fifteen
 * judgement rows — so loading it pre-armed eight gates with somebody else's
 * numbers about somebody else's amplifier, and the panel reported judgements
 * the viewer never made. That is P4 broken at the screen rather than in the
 * engine, the same failure E-2 removed from the placeholders.
 *
 * So the list below is the rule: it is what a demo bundle is ALLOWED to carry,
 * where `BUNDLE_BEARABLE_ROWS` above says what the SHAPE can hold. The two are
 * deliberately different, and the guard reads both — every bundle's carried
 * set must be a subset of this one, every REQUIRED row must be in it, and each
 * bundle's exact set is pinned BY NAME beside it so a field that ever sneaks
 * back in is a red test. Which of the optional four a given bundle carries is
 * a fact about its loudspeaker (a closed pod has no port; only a merged
 * response declares a splice band), not about this rule.
 *
 * WHAT IS ON IT AND WHY, one line each:
 *  · responses / validity / impedance / ways — the measurement session itself.
 *  · nearFieldCone / nearFieldPort — also measurement files, with their own
 *    stated validity; they are ingredients, not statements about a design.
 *  · spliceBand / mergeValidFrom — the merged file's own declared block. It
 *    travels INSIDE the file, so a merged response cannot be shipped without
 *    it, and reading it back is how the branch gets its floor at all.
 *  · positions / baffle-width — the geometry a window is derived from.
 *  · sd — the one datasheet number kept: it gives the effective piston
 *    diameter, and with it the beaming ceiling. X_max is off the list because
 *    it JUDGES (the excursion floor, M-C's allowed voltage on f_s).
 */
export const BUNDLE_CARRIED_ROWS: readonly string[] = Object.freeze([
  'responses', 'validity', 'impedance', 'ways', 'positions', 'sd', 'baffle-width',
  'nearFieldCone', 'nearFieldPort', 'spliceBand', 'mergeValidFrom',
]);

/**
 * Which bearable rows a bundle actually states, and — for the ones it does not
 * — that the state it produces holds an EMPTY value there rather than no value
 * at all. The second half is the claim that matters: an absent key is a key the
 * previous demo still owns.
 */
export function bundleCarries(b: DemoBundle): Record<string, boolean> {
  const s = demoBundleState(b);
  const some = (f: (r: BranchRole) => boolean) => DEMO_ROLES.some(f);
  const filled = (v: string | undefined) => typeof v === 'string' && v.trim() !== '';
  const meas = (k: keyof V2MeasurementMeta) => some((r) => filled(s.v2Measurement[r][k]));
  const setting = (k: V2SettingKey) => filled(s.engineV2[k]);
  const cabDriver = (k: 'xMm' | 'yMm' | 'depthMm') =>
    some((r) => filled((s.cabinet.drivers?.[r] as Record<string, string> | undefined)?.[k]));
  /* The splice band and the stated validity floor of a MERGE travel inside the
   * merged file, not beside it: a merge made elsewhere carries its own block,
   * and that block is what `readMergeBlock` reads. So the bundle carries them
   * when one of its on-axis files declares them. */
  const declares = (field: RegExp) =>
    some((r) => {
      const raw = s.onAxis[r]?.raw;
      return raw !== undefined && /^\s*[*;#]*\s*Merge\s*=/im.test(raw) && field.test(raw);
    });

  return {
    responses: some((r) => s.onAxis[r] !== null),
    validity: DEMO_ROLES.every((r) => s.onAxis[r] === null || readableValidity(s.onAxis[r]!.raw)),
    impedance: some((r) => s.impedance[r] !== null),
    ways: s.ways >= 2,
    positions: cabDriver('yMm'),
    sd: some((r) => filled(s.sdCm2[r])),
    'baffle-width': filled(s.cabinet.baffleWidthMm),
    blTm: meas('blTm'),
    mmsG: meas('mmsG'),
    xmaxMm: some((r) => filled(s.xmaxMm[r])),
    driveVoltageV: meas('driveVoltageV'),
    coilFamily: meas('coilFamily'),
    nearFieldCone: some((r) => s.nearField[r].cone !== null),
    nearFieldPort: some((r) => s.nearField[r].port !== null),
    spliceBand: declares(/^\s*[*;#]*\s*Merge splice band\s*=/im),
    mergeValidFrom: declares(/^\s*[*;#]*\s*Valid from\s*=/im),
    measuredRe: meas('reOhm'),
    rotSym: meas('rotSym'),
    acousticCentre: meas('zMm') || cabDriver('depthMm'),
    wiring: meas('wiringMeasured') || meas('wiringDesired'),
    nominalSize: some((r) => filled(s.sizeInch[r])),
    ampMinLoadOhm: s.ampMinLoadOhm !== null,
    maxDriveOnFsDb: setting('maxDriveOnFsDb'),
    'driveOnFsMaxDb-per-way': meas('driveOnFsMaxDb'),
    amplifierPeakPowerW: setting('amplifierPeakPowerW'),
    amplifierNominalLoadOhm: setting('amplifierNominalLoadOhm'),
    xmaxMarginFraction: setting('xmaxMarginFraction'),
    amplifierPowerW: setting('amplifierPowerW'),
    resistorClassW: setting('resistorClassW'),
    resistorPowerMargin: setting('resistorPowerMargin'),
    coilClassA: setting('coilClassA'),
    resistorThermalPowerW: setting('resistorThermalPowerW'),
    lowestWayLevelWork: setting('lowestWayLevelWork'),
    lowestWaySeriesRMaxOhm: setting('lowestWaySeriesRMaxOhm'),
    targetCurve: s.targetCurve !== null,
    plateauDepthDb: s.targetCurve?.type === 'bass-plateau' && s.targetCurve.plateauDepthDb !== undefined,
  };
}

/**
 * Does this file state a validity a reader can find? By FIELD NAME, the shared
 * convention of `readMergeBlock` (v1) and `parseArtaHeader` (engine2) — an ARTA
 * window, or a declared merge with a stated floor. Deliberately its own three
 * lines rather than an import of either reader: this is bundle code, it may
 * not reach into `engine2/`, and the v1 reader answers a wider question (it
 * also reports WHY a header could not be read). The guard pins this function
 * against both real readers on the real files.
 */
export function readableValidity(raw: string): boolean {
  const head = raw.slice(0, 8000);
  const merged = /^\s*[*;#]*\s*Merge\s*=\s*\S/im.test(head);
  if (merged) return /^\s*[*;#]*\s*Valid from\s*=\s*[\d.,]+/im.test(head);
  return /^\s*[*;#]*\s*Right window\s*=\s*[\d.,]+/im.test(head);
}

/* ==================================================================== *
 * U-3b — every scalar the state holds, as one flat list
 * ==================================================================== */

/** One field of the project state a bundle produces: where it is, and what
 *  it holds. `null` is a slot with no file; '' is a stated-nothing. */
export interface DemoStateField {
  /** Dotted path, e.g. `cabinet.drivers.low.yMm` or `engineV2.minEpdrOhm`. */
  path: string;
  value: string | number | boolean | null;
  /** True where the value is a file slot rather than a typed field. */
  slot?: boolean;
}

/**
 * EVERY SCALAR OF THE STATE, FLAT — the shape the widened U-3b guard walks.
 *
 * The U-3 guard checked the state key by key with a hand-written list per
 * block, which proves what the list happens to name. This enumerates the whole
 * thing instead, so the two claims it has to carry are claims about ALL of it:
 * what the bundle states arrives (lossless), and what it does not state is ''
 * or `null` rather than a value nobody typed. A block added to `DemoBundleState`
 * without a line here fails the completeness check beside it.
 */
export function stateFields(s: DemoBundleState): DemoStateField[] {
  const out: DemoStateField[] = [];
  const put = (path: string, value: string | number | boolean | null, slot = false) =>
    out.push(slot ? { path, value, slot } : { path, value });

  for (const r of DEMO_ROLES) {
    put(`onAxis.${r}`, s.onAxis[r]?.name ?? null, true);
    put(`angles.${r}`, s.angles[r].length === 0 ? null : s.angles[r].map((a) => a.hor).join(','), true);
    put(`impedance.${r}`, s.impedance[r]?.name ?? null, true);
    put(`nearField.${r}.cone`, s.nearField[r].cone?.name ?? null, true);
    put(`nearField.${r}.port`, s.nearField[r].port?.name ?? null, true);
    put(`sdCm2.${r}`, s.sdCm2[r]);
    put(`xmaxMm.${r}`, s.xmaxMm[r]);
    put(`sizeInch.${r}`, s.sizeInch[r]);
    for (const k of Object.keys(s.v2Measurement[r]).sort()) {
      put(`v2Measurement.${r}.${k}`, s.v2Measurement[r][k as keyof V2MeasurementMeta]);
    }
  }
  const cab = s.cabinet as Record<string, unknown>;
  for (const k of Object.keys(cab).sort()) {
    if (k === 'drivers') continue;
    put(`cabinet.${k}`, (cab[k] as string | undefined) ?? '');
  }
  for (const r of DEMO_ROLES) {
    const d = (s.cabinet.drivers?.[r] ?? {}) as Record<string, unknown>;
    for (const k of ['xMm', 'yMm', 'enclosure', 'fbHz', 'count', 'spacingMm', 'depthMm', 'facing', 'tiltDeg', 'opposed']) {
      const v = d[k];
      put(`cabinet.drivers.${r}.${k}`, v === undefined ? '' : (v as string | boolean));
    }
  }
  for (const k of Object.keys(s.engineV2).sort()) put(`engineV2.${k}`, s.engineV2[k as V2SettingKey]);
  put('ampMinLoadOhm', s.ampMinLoadOhm);
  put('targetCurve', s.targetCurve === null ? null : s.targetCurve.type);
  put('ways', s.ways);
  return out;
}

/**
 * A state field that holds SOMETHING. The three ways a bundle can be silent —
 * `null` (no file, no floor, no voicing), '' (nothing typed) and `false` (an
 * unticked box) — all read as silence, and nothing else does. `0` does NOT:
 * a typed zero is a statement, which is exactly what U-3b removed from the
 * three-way demo's mic elevation.
 */
export const stateFieldFilled = (f: DemoStateField): boolean =>
  f.value !== null && f.value !== '' && f.value !== false;
