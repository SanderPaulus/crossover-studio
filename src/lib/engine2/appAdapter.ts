/**
 * THE ADAPTER: app state -> engine-v2 report input.
 *
 * The engine speaks manifests, driver ids and validity intervals. The app
 * speaks branches, roles and loaded files. Something has to translate, and
 * this is the only place that does — a second translation, however small,
 * would let the panel and the metrics disagree about which measurement
 * belongs to which driver, which is the one mistake this whole layer exists
 * to make impossible.
 *
 * THE DRIVER VOCABULARY IS THE NETLIST'S. A manifest driver id must be the
 * same string the netlist calls its Driver part's model, because that is what
 * lets a metric hold a driver's measurement and its branch of the circuit at
 * once. So the ids are resolved from the netlist through the app's existing
 * slot picker, and only fall back to role names when no filter is loaded.
 *
 * NOTHING HERE INVENTS DATA. A branch without an impedance file gets no
 * impedance entry, and the capability matrix says so; it does not get a
 * nominal 8 ohm. Same for angles, near fields and geometry: absent stays
 * absent all the way to the screen (P4).
 */

import { pickSlotsN, type BranchRole } from '../driverSlots.ts';
import type { Netlist } from '../network.ts';
import { parseArtaHeader, type Manifest, type ManifestEntry } from './ingest/manifest.ts';
import type { MeasurementFile } from './ingest/derive.ts';
import type { WayWiring } from './ingest/wiring.ts';
import type { FilterInput, EngineV2ReportInput, ReportSettings } from './report.ts';
import {
  ctcKey,
  sourcesFromArray,
  type DriverCard,
  type Geometry,
  type WaySourcePosition,
} from './metrics/types.ts';

/** A response file as the app holds it after parsing. */
export interface AdapterResponse {
  name: string;
  freq: readonly number[];
  spl: readonly number[];
  phaseDeg: readonly number[];
  /** The file's own comment lines — where the ARTA window fields live. */
  comments: readonly string[];
}

/** An impedance file as the app holds it after parsing. */
export interface AdapterImpedance {
  name: string;
  freq: readonly number[];
  magnitude: readonly number[];
  phaseDeg: readonly number[];
}

/** Everything the app knows about one branch. */
export interface AdapterBranch {
  role: BranchRole;
  onAxis: AdapterResponse | null;
  /** Off-axis responses, each with its horizontal angle. */
  offAxis: readonly { hor: number; response: AdapterResponse }[];
  /** Near-field responses (one per cone; several are summed by the engine). */
  nearField: readonly AdapterResponse[];
  impedance: AdapterImpedance | null;
  /** Effective radiating diameter in inches — Keele's ceiling needs it. */
  diameterInch?: number;
  /** Microphone distance of the near field in mm, when it was recorded. */
  nearFieldMicMm?: number;
  /**
   * DC resistance the designer measured with a meter, ohms.
   *
   * It travels on the BRANCH rather than in the settings because the app
   * speaks roles and the engine speaks driver ids; folding it in here is what
   * keeps the resolution in one place (see the note at the top of this file).
   */
  measuredReOhm?: number;
  /**
   * Window metadata the designer entered for this branch's GATED far-field
   * measurements (A5b.1(i) / F3b).
   *
   * Per branch rather than per file, because that is the granularity the app's
   * loader offers today: one on-axis response plus its angle set, all taken in
   * one session with one window. It reaches the engine per ENTRY, which is
   * where A5 wants it, and the header still wins wherever a file has one — so
   * a set where only some files lost their headers behaves correctly.
   */
  manualWindow?: ManifestEntry['manualWindow'];
  /**
   * V49 — the DRIVER CARD the designer copied off the datasheet: X_max, S_d,
   * Bl, M_ms and how many identical drivers this branch wires in parallel.
   * Travels on the branch for the same reason `measuredReOhm` does — the app
   * speaks roles, the engine speaks driver ids, and the re-keying happens in
   * one place. Absent fields switch M-C v2.0 off for this way, by name.
   */
  driverCard?: DriverCard;
  /**
   * V49 — the drive voltage (V rms) and mic distance (mm) the on-axis far
   * field was taken at, when the designer documented them. The ACOUSTIC route
   * of M-C v2.0 needs both; a header cannot supply either.
   */
  responseDrive?: { driveVoltageV: number; micDistanceMm: number; source?: string };
  /**
   * V50 — the stated M-C figure for THIS way, dB re its passband. Re-keyed
   * from role to driver id here, into `ReportSettings.maxDriveOnFsDbByDriver`,
   * exactly as R_e and the driver card are. Absent = none per way.
   */
  driveOnFsMaxDb?: number;
  /**
   * V51 — the WIRING of this way: how many identical drivers, as measured and
   * as intended (`ingest/wiring.ts`). Re-keyed from role to driver id into
   * `ReportSettings.wiringByDriver`, exactly as the driver card is. Absent =
   * not stated, and the level-work block says so.
   */
  wiring?: WayWiring;
  /**
   * A5e.3 — the COIL FAMILY this way is wound with (the id `coilDcr.ts` fits
   * per brand, series and gauge). Re-keyed from role to driver id into
   * `ReportSettings.coilDcrFamilyByDriver`, exactly as the wiring is. Absent =
   * not stated: lossless coils, and the report says so.
   */
  coilFamily?: string;
}

/** Cabinet geometry, already parsed to numbers by the caller. */
export interface AdapterGeometry {
  /** Vertical position of each branch's acoustic centre, mm. */
  verticalMm: Partial<Record<BranchRole, number>>;
  /** Internal spacing of an array inside a branch, mm. */
  arraySpacingMm: Partial<Record<BranchRole, number>>;
  /**
   * How many radiators the branch has (V20). The cabinet form already holds
   * it, and it is the field that turns a spacing into POSITIONS: N sources,
   * `arraySpacingMm` apart, symmetric about the acoustic centre. Absent or 1 =
   * a single source, which is the ordinary case.
   */
  sourceCount?: Partial<Record<BranchRole, number>>;
  /** Whether a branch radiates rotationally symmetrically. */
  rotationallySymmetric?: Partial<Record<BranchRole, boolean>>;
  baffleWidthMm?: number;
}

export interface AdapterInput {
  /** Identifies the measurement session these files belong to (A5.2/F5). */
  sessionId: string;
  branches: readonly AdapterBranch[];
  /** The active filter tab, already converted to a netlist; null = none loaded. */
  filter: { name: string; netlist: Netlist } | null;
  geometry: AdapterGeometry;
  settings: ReportSettings;
}

/**
 * Resolve each branch's driver id.
 *
 * With a filter loaded the ids come from the netlist, through the same slot
 * picker the rest of the app uses — so a project whose low driver is literally
 * named "mid" (which one of them is) lands in the right place. Without a
 * filter the role name is used, which is only ever consumed by the ingest pass
 * and the capability matrix, neither of which cares what a driver is called.
 */
export function resolveDriverIds(
  branches: readonly AdapterBranch[],
  netlist: Netlist | null,
): { ids: Partial<Record<BranchRole, string>>; ambiguous: string | null } {
  const ids: Partial<Record<BranchRole, string>> = {};
  for (const b of branches) ids[b.role] = b.role;
  if (!netlist) return { ids, ambiguous: null };

  const drivers = netlist.elements.filter(
    (e): e is Extract<typeof e, { kind: 'driver' }> => e.kind === 'driver',
  );
  const slots = pickSlotsN(drivers);
  if (slots.ambiguous) return { ids, ambiguous: slots.ambiguous };
  if (slots.woofer) ids.low = slots.woofer.model;
  if (slots.mid) ids.mid = slots.mid.model;
  if (slots.tweeter) ids.high = slots.tweeter.model;
  return { ids, ambiguous: null };
}

const responseFile = (
  entry: Omit<ManifestEntry, 'header'>,
  r: AdapterResponse,
): MeasurementFile => ({
  entry: { ...entry, header: parseArtaHeader([...r.comments]) },
  response: { freq: r.freq, spl: r.spl, phaseDeg: r.phaseDeg },
});

/** Manual window metadata, only where the designer actually stated something. */
const manualWindowTag = (b: AdapterBranch): Pick<ManifestEntry, 'manualWindow'> => {
  const m = b.manualWindow;
  if (!m) return {};
  const stated =
    m.referenceTimeMs !== undefined || m.rightWindowMs !== undefined || m.validityFloorHz !== undefined;
  return stated ? { manualWindow: m } : {};
};

export interface AdapterResult {
  input: EngineV2ReportInput;
  /** Driver id per branch — the panel labels rows with these. */
  driverIds: Partial<Record<BranchRole, string>>;
  /** Set when the netlist's drivers could not be told apart (surfaced, not guessed). */
  ambiguous: string | null;
}

export function buildEngineV2Input(args: AdapterInput): AdapterResult {
  const { ids, ambiguous } = resolveDriverIds(args.branches, args.filter?.netlist ?? null);

  const entries: ManifestEntry[] = [];
  const files: MeasurementFile[] = [];
  const push = (e: ManifestEntry, f: MeasurementFile) => {
    entries.push(e);
    files.push(f);
  };

  for (const b of args.branches) {
    const driver = ids[b.role] ?? b.role;
    if (b.impedance) {
      const entry: ManifestEntry = { file: b.impedance.name, driver, kind: 'Z' };
      push(entry, {
        entry,
        impedance: {
          freq: b.impedance.freq,
          magnitude: b.impedance.magnitude,
          phaseDeg: b.impedance.phaseDeg,
        },
      });
    }
    if (b.onAxis) {
      const entry: ManifestEntry = {
        file: b.onAxis.name,
        driver,
        kind: 'FF',
        angleDeg: 0,
        ...manualWindowTag(b),
      };
      push(entry, responseFile(entry, b.onAxis));
    }
    for (const off of b.offAxis) {
      // 0 degrees in the angle set IS the on-axis file; adding it twice would
      // sum the same measurement into itself and gain 6 dB.
      if (off.hor === 0) continue;
      const entry: ManifestEntry = {
        file: off.response.name,
        driver,
        kind: 'FF',
        angleDeg: off.hor,
        ...manualWindowTag(b),
      };
      push(entry, responseFile(entry, off.response));
    }
    for (const nf of b.nearField) {
      const entry: ManifestEntry = {
        file: nf.name,
        driver,
        kind: 'NF',
        ...(b.diameterInch !== undefined ? { diameterInch: b.diameterInch } : {}),
        ...(b.nearFieldMicMm !== undefined ? { micDistanceMm: b.nearFieldMicMm } : {}),
      };
      push(entry, responseFile(entry, nf));
    }
  }

  const manifest: Manifest = { sessionId: args.sessionId, entries };

  let filter: FilterInput | null = null;
  if (args.filter) {
    const driverZ: FilterInput['driverZ'] = {};
    for (const b of args.branches) {
      const driver = ids[b.role] ?? b.role;
      if (!b.impedance) continue;
      driverZ[driver] = {
        freq: b.impedance.freq,
        magnitude: b.impedance.magnitude,
        phaseDeg: b.impedance.phaseDeg,
      };
    }
    filter = { name: args.filter.name, netlist: args.filter.netlist, driverZ };
  }

  // Geometry, keyed by DRIVER ID rather than role, and only where the app
  // actually holds a number.
  const geometry: Geometry = {};
  const z: Record<string, number> = {};
  const arrays: Record<string, number> = {};
  const sources: Record<string, WaySourcePosition[]> = {};
  const symmetric: Record<string, boolean> = {};
  for (const b of args.branches) {
    const driver = ids[b.role] ?? b.role;
    const v = args.geometry.verticalMm[b.role];
    if (v !== undefined) z[driver] = v;
    const a = args.geometry.arraySpacingMm[b.role];
    if (a !== undefined && a > 0) arrays[driver] = a;
    /* THE ARRAY, AS POSITIONS (V20).
     *
     * Only built where BOTH the count and the spacing are known, because a
     * spacing without a count cannot say how many radiators it separates, and
     * inventing the second one is the N = 2 assumption V20 forbids. A branch
     * with one source needs no entry at all: the report falls back to its
     * acoustic centre, which is the same thing said with fewer fields. */
    const n = args.geometry.sourceCount?.[b.role];
    if (v !== undefined && a !== undefined && a > 0 && n !== undefined && n > 1) {
      sources[driver] = sourcesFromArray(driver, v, n, a);
    }
    const s = args.geometry.rotationallySymmetric?.[b.role];
    if (s !== undefined) symmetric[driver] = s;
  }
  if (Object.keys(z).length) geometry.zOffsetMm = z;
  if (Object.keys(arrays).length) geometry.arraySpacingMm = arrays;
  if (Object.keys(sources).length) geometry.waySources = sources;
  if (Object.keys(symmetric).length) geometry.rotationallySymmetric = symmetric;
  if (args.geometry.baffleWidthMm !== undefined) geometry.baffleWidthMm = args.geometry.baffleWidthMm;

  // Centre-to-centre between ADJACENT branches, from the vertical positions.
  // Derived rather than entered: the positions are already in the project, and
  // asking for the same distance twice is how the two end up disagreeing.
  const ordered: BranchRole[] = (['low', 'mid', 'high'] as const).filter((r) =>
    args.branches.some((b) => b.role === r),
  );
  const ctc: Record<string, number> = {};
  const ctcSource: Record<string, string> = {};
  for (let i = 0; i + 1 < ordered.length; i++) {
    const a = args.geometry.verticalMm[ordered[i]];
    const b = args.geometry.verticalMm[ordered[i + 1]];
    if (a === undefined || b === undefined) continue;
    const key = ctcKey(ids[ordered[i]] ?? ordered[i], ids[ordered[i + 1]] ?? ordered[i + 1]);
    ctc[key] = Math.abs(b - a);
    // The provenance travels WITH the number (F3c). A spacing read off a
    // cabinet layout and one carried by a measurement set are different facts
    // that look identical once they are both just millimetres.
    ctcSource[key] = 'cabinet layout (vertical driver positions)';
  }
  if (Object.keys(ctc).length) {
    geometry.ctcMm = ctc;
    geometry.ctcSource = ctcSource;
  }

  // Measured DC resistances, re-keyed from roles to driver ids. A5c.1's
  // hierarchy puts them above both sweep derivations, and the derivation pass
  // is where that is applied — so they belong in the settings the report hands
  // it, not in a second lookup at the metric that reads R_e.
  const reByDriver: Record<string, number> = { ...(args.settings.reOhmByDriver ?? {}) };
  for (const b of args.branches) {
    if (b.measuredReOhm === undefined || !(b.measuredReOhm > 0)) continue;
    reByDriver[ids[b.role] ?? b.role] = b.measuredReOhm;
  }
  /* V49 — the driver cards and the documented response drive, re-keyed from
   * roles to driver ids exactly like R_e above. A card with nothing on it is
   * left out rather than passed as an empty object: absent is a state the
   * capability matrix can name, an empty card is not. */
  const cards: Record<string, DriverCard> = { ...(args.settings.driverCardByDriver ?? {}) };
  const drives: NonNullable<ReportSettings['responseDriveByDriver']> = {
    ...(args.settings.responseDriveByDriver ?? {}),
  };
  for (const b of args.branches) {
    const id = ids[b.role] ?? b.role;
    const c = b.driverCard;
    if (c && Object.values(c).some((v) => v !== undefined && v !== '')) cards[id] = c;
    if (b.responseDrive && b.responseDrive.driveVoltageV > 0 && b.responseDrive.micDistanceMm > 0) {
      drives[id] = b.responseDrive;
    }
  }
  /* V50 — the per-way stated M-C figures, re-keyed like the rest. */
  const driveByDriver: Record<string, number> = { ...(args.settings.maxDriveOnFsDbByDriver ?? {}) };
  for (const b of args.branches) {
    if (b.driveOnFsMaxDb === undefined || !Number.isFinite(b.driveOnFsMaxDb)) continue;
    driveByDriver[ids[b.role] ?? b.role] = b.driveOnFsMaxDb;
  }
  /* V51 — the wiring per way, re-keyed like the rest. */
  const wiringByDriver: Record<string, WayWiring> = { ...(args.settings.wiringByDriver ?? {}) };
  for (const b of args.branches) {
    if (!b.wiring) continue;
    wiringByDriver[ids[b.role] ?? b.role] = b.wiring;
  }
  /* A5e.3 — the coil family per way, re-keyed like the rest. */
  const coilFamilyByDriver: Record<string, string> = { ...(args.settings.coilDcrFamilyByDriver ?? {}) };
  for (const b of args.branches) {
    if (!b.coilFamily) continue;
    coilFamilyByDriver[ids[b.role] ?? b.role] = b.coilFamily;
  }
  const settings: ReportSettings = {
    ...args.settings,
    ...(Object.keys(coilFamilyByDriver).length > 0 ? { coilDcrFamilyByDriver: coilFamilyByDriver } : {}),
    ...(Object.keys(wiringByDriver).length > 0 ? { wiringByDriver } : {}),
    ...(Object.keys(driveByDriver).length > 0 ? { maxDriveOnFsDbByDriver: driveByDriver } : {}),
    ...(Object.keys(reByDriver).length > 0 ? { reOhmByDriver: reByDriver } : {}),
    ...(Object.keys(cards).length > 0 ? { driverCardByDriver: cards } : {}),
    ...(Object.keys(drives).length > 0 ? { responseDriveByDriver: drives } : {}),
  };

  return {
    input: { manifest, files, filter, geometry, settings },
    driverIds: ids,
    ambiguous,
  };
}
