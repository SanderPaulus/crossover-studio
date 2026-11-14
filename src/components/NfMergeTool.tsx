/**
 * I-4 — the NF/FF-MERGE TOOL, a page of its own at `#/merge` (B-4 revision, Sander 13-11-2026).
 *
 * The one place where a near field and a far field are merged, and it works WITHOUT a project: drop a
 * measuring session (impulses .pir + their FRD exports + impedances), state the set-up, merge each
 * source, accept, export. The tool keeps its own sessions (IndexedDB, `mergeStore.ts`). A project is
 * reached through one button, "Use in project…", which hands it exactly the merged FRD files an
 * import of the export package would; the project shows a compact provenance card per branch and
 * holds no merge input.
 *
 * No guessed input: a driver's height comes from the optimizer's cabinet geometry or from the
 * measured object's own geometry, and when either is missing the tool asks (`sourceAboveBottomMm`).
 * Every decision lives in `lib/mergeSession.ts` (tested); this component renders it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Chart, { type Series } from './Chart.tsx';
import { t } from '../lib/i18n.ts';
import { parseFrd } from '../lib/parsers/frd.ts';
import { chooseCalibration, micCorrectionAt, parseMicCal, type MicCal } from '../lib/micCal.ts';
import { an4F0, GUIDE_STEPS, KNEE_RISE_DEG, proposeBandsGuide, proposeWindowSteps, sessionReferenceMs, type GuideStep, type WindowProposal } from '../lib/mergeGuide.ts';
import { envelope } from '../lib/fft.ts';
import { zipStore } from '../lib/zip.ts';
import {
  FIT_RESIDUAL_FLAG_DEG,
  MergeV2Error,
  NF_MERGE_V2_VERSION,
  arrivalMs,
  mergeImpulsesV2,
  planeEchoDelayS,
  type EchoTerm,
  type Gate,
  type MergeV2Input,
  type MergeV2Result,
  type NearToFarModel,
  type PlaneEcho,
} from '../lib/nfMergeV2.ts';
import { renderMergedFrdV2 } from '../lib/nfMergeV2Block.ts';
import { addHeaderLines, gridText, phaseConventionText, phaseZeroMsOf, type ExportGrid, type ExportPhase } from '../lib/mergeExport.ts';
import { branchFileName, confirmBranchUse, USE_CONFIRM_WAIT_MS, type Prepared, type UseStatus } from '../lib/useInProject.ts';
import {
  checksOf,
  chosenGate,
  echoesForSource,
  exportPackage,
  statedPirGate,
  proposeWay,
  stemOf,
  type RoleOverrides,
  directPeakMs,
  gateAfterArrivalMs,
  gateOf,
  impulseOfItem,
  interpLog,
  kaOneHz,
  loadSession,
  reflectionReachMm,
  setupStatus,
  sourceAboveBottomMm,
  statusOf,
  type CabinetGeometryForMerge,
  type DroppedFile,
  type LoadedSession,
  type MergeStatus,
  type MergeWay,
  type PlanesStated,
  type RigSetup,
  type SessionSource,
  type SourcePlacement,
  type Surface,
} from '../lib/mergeSession.ts';
import { convertLowEnd, loadValidity, LOAD_RATIO_TOL_DB, LOAD_RATIO_TOL_DEG, type BoxSpec, type MeasuredObject } from '../lib/measuredObject.ts';
import {
  deleteMergeSession,
  listMergeSessions,
  loadMergeSession,
  newSessionId,
  saveMergeSession,
  type MergeSessionSummary, listMicCals, saveMicCal, deleteMicCal, listSetups, saveSetup, type StoredSetup } from '../lib/mergeStore.ts';

export type MergeRole = MergeWay;
/** A merged file as the project receives it (and as the export package carries it). */
export interface AcceptedSource {
  source: string;
  name: string;
  text: string;
  session: string;
  /** The tool's session id, so the project's card can open it again. Absent on files from before B-4. */
  sessionId?: string;
  status?: MergeStatus;
}
export interface NfMergeToolProps {
  /** The optimizer's cabinet geometry, as far as the project states it (nulls where it does not). */
  geometry: CabinetGeometryForMerge;
  sdCm2: Record<MergeWay, number | null>;
  /** What the project currently uses, per branch — shown so the designer sees what a button replaces. */
  inProject: Record<MergeWay, AcceptedSource[]>;
  /** Applies the merge to a branch and says whether it could (I-4 B-4 nazorg: never silent). */
  onUse: (way: MergeWay, sources: AcceptedSource[]) => Prepared;
  /** The name of each branch's current response, so "done" is read back from the project, not assumed. */
  responseNames: Record<MergeWay, string | null>;
  /** The session the address asks for (`#/merge/<id>`), if any. */
  openId: string | null;
  onOpenId: (id: string | null) => void;
}

/** A form value committed on blur, so a merge is not recomputed on every keystroke. */
function Field(p: { value: string; onCommit: (v: string) => void; width?: number; placeholder?: string; title?: string; ariaLabel?: string }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      defaultValue={p.value}
      key={p.value}
      placeholder={p.placeholder ?? '—'}
      title={p.title}
      aria-label={p.ariaLabel}
      style={{ width: `${p.width ?? 5}em` }}
      onBlur={(e) => e.target.value !== p.value && p.onCommit(e.target.value.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
const num = (s: string): number | null => {
  const v = Number(s.replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
};

/** Per source, everything the designer states. Nothing is pre-filled from a file name. */
interface SourceConfig {
  way: MergeWay | '';
  member: '' | 'single' | 'upper' | 'lower';
  /** Height above the measured object's bottom — only for an object with its own geometry. */
  ownHeight: string;
  /** '' = the header's window; otherwise a shorter right length, ms (PIR route only). */
  windowRight: string;
  /** I-4 PIR-only: the window STATED here when the far field has no FRD export — all four, no default. */
  pirRef?: string;
  pirLeft?: string;
  pirRight?: string;
  pirTaper?: string;
  /** I-4 B-4 guide, step 3: which window — the proposal taken over, the FRD header's, or set by hand. */
  winMode?: '' | 'header' | 'proposal' | 'self';
  /** The driver sits in its own pod: AN4's d is the pod's diameter (mm), not the baffle width. */
  inPod?: boolean;
  podDiameter?: string;
  /** The cone area (cm²) when the design states none: asked once, in step 1. */
  sdCm2?: string;
  port: string;
  portWeight: string;
  portWeightStatus: 'stated' | 'provisional';
  /** The port mouth's height above the object's bottom (its own geometry). */
  portHeightAboveBottom: string;
  model: 'an4' | 'shelf' | 'none';
  f0: string;
  shelfHz: string;
  shelfDb: string;
  fitLo: string;
  fitHi: string;
  spliceLo: string;
  spliceHi: string;
  validFrom: string;
  validFromReason: string;
  reason: string;
}
const blankConfig = (): SourceConfig => ({
  way: '',
  member: '',
  ownHeight: '',
  windowRight: '',
  port: '',
  portWeight: '',
  portWeightStatus: 'provisional',
  portHeightAboveBottom: '',
  model: 'an4',
  f0: '',
  shelfHz: '',
  shelfDb: '',
  fitLo: '',
  fitHi: '',
  spliceLo: '',
  spliceHi: '',
  validFrom: '',
  validFromReason: '',
  reason: '',
});

interface ToolAccepted {
  name: string;
  text: string;
  status: MergeStatus;
  way: MergeWay;
  acceptedAt: string;
  /** I-4 fase 4 — the same merge on the far field's own export grid, or null with why. */
  textOriginal?: string | null;
  originalNote?: string | null;
}
interface ObjectState {
  kind: '' | 'target' | 'other';
  label: string;
  baffle: 'identical' | 'own';
  baffleW: string;
  baffleH: string;
  volume: string;
  load: 'sealed' | 'vented';
  fb: string;
  targetVolume: string;
  targetLoad: 'sealed' | 'vented';
  targetSamePort: boolean;
  targetFb: string;
  fs: string;
  qts: string;
  vas: string;
  count: string;
  qL: string;
  tolDb: string;
  tolDeg: string;
  lowEnd: 'mark' | 'convert';
}
interface RigState {
  bottom: string;
  surface: Surface | '';
  overhang: string;
  /** The overhang stated as unknown (counts as stated; reflections then unchecked). */
  overhangUnknown?: boolean;
  /** B-4 nazorg — the overhang stated as a bound: "at most X mm" (the exact figure to follow). */
  overhangMax?: string;
  micDist: string;
  micHeight: string;
}
/** What the tool stores per session beside its files. */
interface ToolState {
  rig: RigState;
  planes: PlanesStated;
  obj: ObjectState;
  cfg: Record<string, SourceConfig>;
  accepted: Record<string, ToolAccepted>;
  /** I-4 PIR-only: the microphone calibration file chosen for this session ('' = none). */
  calId?: string;
  /** I-4 B-4 guide. */
  step?: GuideStep;
  /** Step 1: the confirmed role per file (absent = the name's proposal), and whether it was confirmed. */
  roles?: RoleOverrides;
  rolesConfirmed?: boolean;
  /** Step 2: the single planes question and, for "yes", the planes stated. */
  planeQ?: '' | 'no' | 'yes' | 'unknown';
  planeList?: { kind: keyof PlanesStated; mm: string }[];
}
const blankState = (): ToolState => ({
  rig: { bottom: '', surface: '', overhang: '', micDist: '', micHeight: '' },
  planes: { ceiling: null, sideWall: null, wallBehindCabinet: null, wallBehindMic: null },
  obj: {
    kind: '',
    label: '',
    baffle: 'identical',
    baffleW: '',
    baffleH: '',
    volume: '',
    load: 'vented',
    fb: '',
    targetVolume: '',
    targetLoad: 'vented',
    targetSamePort: true,
    targetFb: '',
    fs: '',
    qts: '',
    vas: '',
    count: '',
    qL: '',
    tolDb: String(LOAD_RATIO_TOL_DB),
    tolDeg: String(LOAD_RATIO_TOL_DEG),
    lowEnd: 'mark',
  },
  cfg: {},
  accepted: {},
});
/** A stored state merged over the blank one, so a field added later opens empty instead of undefined. */
function restoreState(x: unknown, sources: readonly SessionSource[]): ToolState {
  const b = blankState();
  const s = (x && typeof x === 'object' ? x : {}) as Partial<ToolState>;
  const cfg: Record<string, SourceConfig> = {};
  for (const src of sources) cfg[src.stem] = { ...blankConfig(), ...(s.cfg?.[src.stem] ?? {}) };
  return {
    rig: { ...b.rig, ...(s.rig ?? {}) },
    planes: { ...b.planes, ...(s.planes ?? {}) },
    obj: { ...b.obj, ...(s.obj ?? {}) },
    cfg,
    accepted: s.accepted ?? {},
    // B-4 guide: these were dropped on reload (calId among them — a chosen calibration did not survive)
    calId: s.calId ?? '',
    step: s.step ?? 'files',
    roles: s.roles ?? {},
    rolesConfirmed: s.rolesConfirmed ?? false,
    planeQ: s.planeQ ?? '',
    planeList: s.planeList ?? [],
  };
}

/** B-4 guide: C and D against the PIRs agree when the paths differ by no more than this (the near field's own
 *  few millimetres to the cone are not subtracted). A convention, shown with the numbers. */
const ARRIVAL_CHECK_MM = 50;
/** How long one slice of the window proposal may hold the main thread before the page gets a turn (ms). */
const PROPOSAL_SLICE_MS = 30;
const STEP_LABEL: Record<GuideStep, string> = { files: 'Files', setup: 'Set-up', window: 'Window', merge: 'Merge per driver', export: 'Export' };

const STATUS_LABEL: Record<MergeStatus, string> = {
  explained: 'explained',
  flags: 'flags',
  unchecked: 'not checked for reflections',
};

interface Computed {
  input: MergeV2Input | null;
  result: MergeV2Result | null;
  error: string | null;
  notes: string[];
  proposalNote: string;
  fit: [number, number] | null;
  splice: [number, number] | null;
  heightMm: number | null;
  heightFrom: string;
  echoes: EchoTerm[];
  window: { source: 'header' | 'chosen' | 'stated'; headerRightMs: number; oneOverTHz: number } | null;
}

interface Current {
  id: string;
  name: string;
  files: DroppedFile[];
  loaded: LoadedSession;
}

export default function NfMergeTool(props: NfMergeToolProps) {
  const [sessions, setSessions] = useState<MergeSessionSummary[]>([]);
  /* I-4 PIR-only — microphone calibration files: uploaded once, kept by the tool, chosen per session. */
  const [cals, setCals] = useState<MicCal[]>([]);
  const [calError, setCalError] = useState<string | null>(null);
  const refreshCals = () =>
    listMicCals()
      .then(setCals)
      .catch((e) => setCalError(String(e)));
  useEffect(() => {
    void refreshCals();
  }, []);
  const onCalFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setCalError(null);
    const bytes = new Uint8Array(await f.arrayBuffer());
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('latin1').decode(bytes); // JustOct writes ANSI (the ° in its header)
    }
    const r = parseMicCal(f.name, text);
    if (!r.ok) {
      setCalError(r.reason);
      return;
    }
    const id = `${f.name}-${Date.now().toString(36)}`;
    await saveMicCal({ id, ...r.cal });
    await refreshCals();
  };
  const [current, setCurrent] = useState<Current | null>(null);
  const [st, setSt] = useState<ToolState>(blankState);
  const [tab, setTab] = useState<string>('');
  const [reflectionModel, setReflectionModel] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);

  const refreshList = () =>
    listMergeSessions()
      .then(setSessions)
      .catch((e) => setStoreError(String(e)));
  useEffect(() => {
    void refreshList();
  }, []);

  /* the address opens a stored session */
  useEffect(() => {
    if (!props.openId || props.openId === current?.id) return;
    void loadMergeSession(props.openId).then((rec) => {
      if (!rec) {
        setStoreError(t('No stored session “{id}”.', { id: props.openId ?? '' }));
        return;
      }
      const loaded = loadSession(rec.name, rec.files);
      setCurrent({ id: rec.id, name: rec.name, files: rec.files, loaded });
      setSt(restoreState(rec.state, loaded.sources));
      setTab(loaded.sources.find((x) => x.kind === 'driver')?.stem ?? '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.openId]);

  /* the tool keeps its sessions itself: every stated change is saved, debounced */
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!current) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveMergeSession({ id: current.id, name: current.name, savedAt: new Date().toISOString(), version: 1, files: current.files, state: st })
        .then(refreshList)
        .catch((e) => setStoreError(String(e)));
    }, 600);
  }, [st, current]);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const dropped = await Promise.all([...files].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    const first = files[0] as File & { webkitRelativePath?: string };
    // A folder names the session; loose files get a dated name (the session is not a file).
    const name = first.webkitRelativePath?.split('/')[0] || `session-${new Date().toISOString().slice(0, 10)}`;
    const loaded = loadSession(name, dropped);
    const id = newSessionId(name, new Date());
    setCurrent({ id, name, files: dropped, loaded });
    setSt(restoreState(null, loaded.sources));
    setTab(loaded.sources.find((x) => x.kind === 'driver')?.stem ?? '');
    props.onOpenId(id);
  };
  const setC = (stem: string, patch: Partial<SourceConfig>) => setSt((s) => ({ ...s, cfg: { ...s.cfg, [stem]: { ...blankConfig(), ...s.cfg[stem], ...patch } } }));
  const goto = (step: GuideStep) => setSt((s) => ({ ...s, step }));
  const setRig = (patch: Partial<RigState>) => setSt((s) => ({ ...s, rig: { ...s.rig, ...patch } }));
  const setObj = (patch: Partial<ObjectState>) => setSt((s) => ({ ...s, obj: { ...s.obj, ...patch } }));

  /* step 1: the confirmed roles re-read the files; without any, the names' proposal stands */
  const session = useMemo(
    () => (current ? (Object.keys(st.roles ?? {}).length ? loadSession(current.name, current.files, st.roles) : current.loaded) : null),
    [current, st.roles],
  );
  const { rig, planes, obj } = st;
  const cfg = useMemo(() => {
    const out: Record<string, SourceConfig> = { ...st.cfg };
    for (const src of session?.sources ?? []) if (!out[src.stem]) out[src.stem] = blankConfig();
    return out;
  }, [st.cfg, session]);
  const rigSetup: RigSetup = {
    bottomAboveFloorMm: num(rig.bottom),
    surface: rig.surface || null,
    surfaceOverhangMm: rig.overhangUnknown || rig.overhangMax !== undefined ? null : num(rig.overhang),
    surfaceOverhangUnknown: !!rig.overhangUnknown,
    surfaceOverhangMaxMm: rig.overhangMax !== undefined ? num(rig.overhangMax) : null,
    micDistanceMm: num(rig.micDist),
    micHeightMm: num(rig.micHeight),
  };
  const sstat = setupStatus(rigSetup, planes);
  const chosenCal = cals.find((c) => c.id === st.calId) ?? null;
  const calChoice = chooseCalibration(session?.calibration ?? null, chosenCal);
  const drivers = session?.sources.filter((s) => s.kind === 'driver') ?? [];
  const farOnly = session?.sources.filter((s) => s.kind === 'far-only') ?? [];
  const ownGeometry = obj.kind === 'other' && obj.baffle === 'own';

  /** S_d: the design's for that way, else the one stated here (step 1). */
  const sdOf = (c: SourceConfig): number | null => (c.way ? props.sdCm2[c.way] : null) ?? num(c.sdCm2 ?? '');
  const placementOf = (c: SourceConfig): SourcePlacement =>
    ownGeometry ? { kind: 'own', aboveBottomMm: num(c.ownHeight) } : { kind: 'cabinet', way: c.way || null, member: c.member || null };

  const compute = (src: SessionSource, c: SourceConfig, withEchoes: boolean): Computed => {
    const notes: string[] = [];
    const out: Computed = { input: null, result: null, error: null, notes, proposalNote: '', fit: null, splice: null, heightMm: null, heightFrom: '', echoes: [], window: null };
    if (!session || !src.far || !src.near) return { ...out, error: 'no far and near field for this source' };
    const g0 = gateOf(src.far);
    let gate: Gate;
    let route: 'pir' | 'frd';
    const statedMode = (c.winMode === 'proposal' || c.winMode === 'self') && !!src.far.pir;
    if ('error' in g0 || statedMode) {
      if (!src.far.pir) return { ...out, error: 'error' in g0 ? `${g0.field}: ${g0.error}` : 'window: an FRD export is already gated — its header window is the only one' };
      const sg = statedPirGate({ referenceMs: num(c.pirRef ?? ''), leftMs: num(c.pirLeft ?? ''), rightMs: num(c.pirRight ?? ''), taper: num(c.pirTaper ?? '') });
      if ('error' in sg) return { ...out, error: `${sg.field}: ${sg.error}` };
      gate = sg.gate;
      route = 'pir';
      out.window = { source: 'stated', headerRightMs: sg.gate.rightMs, oneOverTHz: 1000 / sg.gate.rightMs };
    } else {
      const cg = chosenGate(g0.gate, g0.route, num(c.windowRight));
      if ('error' in cg) return { ...out, error: `${cg.field}: ${cg.error}` };
      out.window = { source: cg.source, headerRightMs: cg.headerRightMs, oneOverTHz: cg.oneOverTHz };
      gate = cg.gate;
      route = g0.route;
    }
    const g = { route };
    const far = impulseOfItem(src.far, session.name, g.route === 'frd');
    const near = impulseOfItem(src.near, session.name, false);
    const sd = sdOf(c);
    /* B-4 guide: no silent proposal — a band is used only once it is stated or taken over (step 3) */
    const prop = proposeBandsGuide(1000 / gate.rightMs, sd);
    out.proposalNote = 'reason' in prop ? prop.reason : `proposed: ${prop.note}`;
    const fit: [number, number] | null = num(c.fitLo) !== null && num(c.fitHi) !== null ? [num(c.fitLo)!, num(c.fitHi)!] : null;
    const splice: [number, number] | null = num(c.spliceLo) !== null && num(c.spliceHi) !== null ? [num(c.spliceLo)!, num(c.spliceHi)!] : null;
    out.fit = fit;
    out.splice = splice;
    if (!fit || !splice) return { ...out, error: 'fit band: not stated — take over the proposal in step 3 (Window), or set it there' };
    const model: NearToFarModel | null =
      c.model === 'none'
        ? { kind: 'none' }
        : c.model === 'an4'
          ? num(c.f0) !== null
            ? { kind: 'an4', f0Hz: num(c.f0)! }
            : null
          : num(c.shelfHz) !== null && num(c.shelfDb) !== null
            ? { kind: 'shelf', hz: num(c.shelfHz)!, depthDb: num(c.shelfDb)! }
            : null;
    if (!model) return { ...out, error: c.model === 'an4' ? 'model: state f0 for the AN4 form' : 'model: state the shelf corner and depth' };
    let echoes: EchoTerm[] = [];
    if (withEchoes) {
      const h = sourceAboveBottomMm(placementOf(c), props.geometry);
      if ('missing' in h) return { ...out, error: `height: the tool needs ${h.missing.join('; ')}` };
      if (rigSetup.bottomAboveFloorMm === null) return { ...out, error: 'set-up: state the cabinet bottom above the floor' };
      out.heightMm = rigSetup.bottomAboveFloorMm + h.mm;
      out.heightFrom = h.from;
      if (rigSetup.micHeightMm !== null && rigSetup.micDistanceMm !== null) {
        const e = echoesForSource({ sourceHeightMm: out.heightMm, rig: rigSetup, planes, fitTopHz: fit[1] });
        echoes = e.echoes;
        notes.push(...e.notes);
      }
    }
    out.echoes = echoes;
    const portSrc = c.port ? session.sources.find((s) => s.stem === c.port) : undefined;
    let port: MergeV2Input['port'] = null;
    if (portSrc?.near) {
      const w = num(c.portWeight);
      if (w === null) return { ...out, error: 'port weight: state it (Keele, from the mouth diameter) — no default' };
      let portEchoes: EchoTerm[] = [];
      const ph = num(c.portHeightAboveBottom);
      if (withEchoes && echoes.some((e) => e.kind === 'plane')) {
        if (ph === null || rigSetup.bottomAboveFloorMm === null) return { ...out, error: "port height: the cone states a plane, so the port needs its own height (its own image) — state the mouth's height above the object's bottom" };
        portEchoes = echoesForSource({ sourceHeightMm: rigSetup.bottomAboveFloorMm + ph, rig: rigSetup, planes, fitTopHz: fit[1] }).echoes;
      }
      port = { impulse: impulseOfItem(portSrc.near, session.name, false), weight: w, echoes: portEchoes };
    }
    const input: MergeV2Input = {
      far,
      near,
      port,
      gate,
      model,
      echoes,
      sdCm2: sd,
      fitBandHz: fit,
      spliceBandHz: splice,
      output: { fromHz: 20, toHz: Math.min(20000, far.sampleRate / 2.2), pointsPerOctave: 48 },
    };
    out.input = input;
    try {
      out.result = mergeImpulsesV2(input);
    } catch (e) {
      out.error = e instanceof MergeV2Error ? `${e.field}: ${e.message}` : String(e);
    }
    return out;
  };

  const computed = useMemo(() => {
    const m = new Map<string, Computed>();
    for (const d of drivers) if (cfg[d.stem]) m.set(d.stem, compute(d, cfg[d.stem], true));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, cfg, rig, planes, obj.kind, obj.baffle, props.geometry, props.sdCm2]);
  const active = drivers.find((d) => d.stem === tab) ?? null;
  const cur = active ? computed.get(active.stem) ?? null : null;
  const bare = useMemo(
    () => (active && cur?.echoes.some((e) => e.kind === 'plane') && !reflectionModel ? compute(active, cfg[active.stem], false) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, cur, reflectionModel],
  );
  const statusFor = (stem: string): MergeStatus | null => {
    const r = computed.get(stem)?.result;
    return r ? statusOf(r, sstat) : null;
  };

  /* ---- measured object and the validity for the target ---- */
  const validity = useMemo(() => {
    if (obj.kind !== 'other') return obj.kind === 'target' ? { fromHz: null as number | null, note: t('the session measured the target cabinet: no load limit'), ratio: null } : null;
    const load = (kind: 'sealed' | 'vented', fb: string, same: boolean): BoxSpec['load'] =>
      kind === 'sealed'
        ? { kind: 'sealed' }
        : { kind: 'vented', port: same ? { kind: 'same-as-other' } : { kind: 'measured', fbHz: num(fb) ?? NaN, source: 'stated', ...(num(obj.qL) !== null ? { qL: num(obj.qL)! } : {}) } };
    const measured: MeasuredObject = {
      kind: 'other',
      label: obj.label || t('measured object'),
      baffle: obj.baffle === 'identical' ? 'identical' : { widthMm: num(obj.baffleW) ?? NaN, heightMm: num(obj.baffleH) ?? NaN },
      box: { netVolumeL: num(obj.volume) ?? NaN, load: load(obj.load, obj.fb, false) },
    };
    const target: BoxSpec = { netVolumeL: num(obj.targetVolume) ?? NaN, load: load(obj.targetLoad, obj.targetFb, obj.targetLoad === 'vented' && obj.targetSamePort) };
    const ts = num(obj.fs) !== null && num(obj.vas) !== null ? { fsHz: num(obj.fs)!, vasL: num(obj.vas)!, count: num(obj.count) ?? 1, ...(num(obj.qts) !== null ? { qts: num(obj.qts)! } : {}) } : null;
    const v = loadValidity({ target, setup: { session: session?.name ?? '', object: measured }, ts, tolDb: num(obj.tolDb) ?? undefined, tolDeg: num(obj.tolDeg) ?? undefined });
    return { fromHz: v.fromHz, note: v.note, ratio: v.ratio };
  }, [obj, session]);

  /* ---- accept: the merge becomes part of the tool's session ---- */
  const accept = (src: SessionSource, c: SourceConfig, comp: Computed) => {
    if (!session || !comp.result || !comp.input || !c.way) return;
    const input = comp.input;
    const finish = (raw: NonNullable<Computed['result']>) => {
    let result = raw;
    if (calChoice.kind === 'derived' && session.calibration && input.far.timeBase === 'session' && src.far?.pir) {
      const cal = session.calibration;
      result = { ...result, spl: result.freq.map((f, i) => result.spl[i] + interpLog(cal.freq, cal.db, f)) };
    } else if (calChoice.kind === 'file' && src.far?.pir) {
      const mc = calChoice.cal;
      result = {
        ...result,
        spl: result.freq.map((f, i) => result.spl[i] + micCorrectionAt(mc, f).db),
        phaseDeg: result.freq.map((f, i) => {
          const p = result.phaseDeg[i] + micCorrectionAt(mc, f).deg;
          return ((p + 540) % 360) - 180;
        }),
      };
    }
    if (validity?.ratio && validity.fromHz !== null && obj.lowEnd === 'convert') {
      const cv = convertLowEnd(result.freq, result.spl, result.phaseDeg, validity.ratio, validity.fromHz);
      result = { ...result, spl: cv.spl, phaseDeg: cv.phaseDeg };
    }
    const w = comp.window;
    const text = renderMergedFrdV2({
      branchLabel: src.label,
      input: input,
      result,
      nearName: src.near!.name,
      farName: src.far!.name,
      portName: input.port ? session.sources.find((s) => s.stem === c.port)?.near?.name ?? null : null,
      validFromHz: num(c.validFrom)!,
      validFromReason: c.validFromReason || t('stated in the merge tool'),
      referenceNote:
        `${input.gate.referenceMs.toFixed(4)} ms on the ${session.timeBaseShared ? 'session' : 'file'} time base (${w?.source === 'stated' ? 'the reference STATED in the merge tool: no FRD export' : "the phase zero of the far field's FRD export"})` +
        (w ? `; window ${w.source === 'header' ? 'from the header' : w.source === 'stated' ? `STATED in the merge tool (no FRD export), left ${input.gate.leftMs} ms, right ${input.gate.rightMs} ms, Tukey ${input.gate.rightTaper}` : `CHOSEN shorter than the header's ${w.headerRightMs} ms`}, 1/T = ${w.oneOverTHz.toFixed(1)} Hz` : ''),
      madeOn: new Date().toISOString().slice(0, 10),
      measuredObjectNote: obj.kind === 'other' ? `${obj.label || 'measured object'}, baffle ${obj.baffle}, ${obj.volume} L ${obj.load}` : obj.kind === 'target' ? 'the target cabinet' : null,
      targetValidFromHz: validity?.fromHz ?? null,
      targetValidityNote: validity ? `${validity.note} This file: ${obj.lowEnd === 'convert' ? 'CONVERTED with the model ratio below the limit' : 'MARKED below the limit'}.` : null,
      calibrationNote: !src.far?.pir ? 'as exported by the measuring program (FRD route: the file is already calibrated)' : calChoice.kind === 'none' ? null : calChoice.note,
      portWeightNote: input.port ? (c.portWeightStatus === 'provisional' ? 'PROVISIONAL' : 'stated') : null,
      acceptReason: comp.result!.flags.length > 0 ? c.reason : null,
    });
    return text;
    };
    const text = finish(comp.result);
    /* I-4 fase 4 — the same merge on the far field's OWN export grid, computed by the kernel on those
     * frequencies (the output stage evaluates one fit on any grid): the export's "original grid", never
     * an interpolation. Null, with the reason kept, when the far field came without an FRD export. */
    let textOriginal: string | null = null;
    let originalNote: string | null = null;
    if (src.far?.frdText) {
      try {
        const fs = input.far.sampleRate;
        const g = parseFrd(src.far.frdText).freq.filter((f) => f > 0 && f < fs / 2);
        const r2 = mergeImpulsesV2({ ...input, output: { ...input.output, grid: g } });
        textOriginal = addHeaderLines(finish(r2), [`Merge grid = the far field's own export grid (${src.far.frdName ?? 'its FRD'}, ${g.length} points), computed by the merge on those frequencies`]);
      } catch (e) {
        originalNote = e instanceof Error ? e.message : String(e);
      }
    } else originalNote = 'the far field came without an FRD export';
    const name = `${src.stem.replace(/\s+/g, '_')}_merged_v2.frd`;
    setSt((s) => ({ ...s, accepted: { ...s.accepted, [src.stem]: { name, text, textOriginal, originalNote, status: statusOf(comp.result!, sstat), way: c.way as MergeWay, acceptedAt: new Date().toISOString() } } }));
  };
  const acceptedOf = (way: MergeWay): AcceptedSource[] =>
    Object.entries(st.accepted)
      .filter(([, a]) => a.way === way)
      .map(([source, a]) => ({ source, name: a.name, text: a.text, session: current!.name, sessionId: current!.id, status: a.status }));

  /* ---- B-4 guide: the session's phase zero, heights, AN4, and the window proposal per driver ---- */
  const sessionRef = useMemo(() => {
    if (!session) return null;
    const fars = session.sources.filter((x) => x.kind === 'driver' && x.far?.pir);
    const hdr = fars.map((x) => gateOf(x.far!)).find((g) => !('error' in g) && g.route === 'pir');
    const peaks = fars.map((x) => arrivalMs(impulseOfItem(x.far!, session.name, false)));
    return sessionReferenceMs(hdr && !('error' in hdr) ? hdr.gate.referenceMs : null, peaks);
  }, [session]);
  const heightAboveFloor = (c: SourceConfig): { mm: number; from: string } | { missing: string[] } => {
    const h = sourceAboveBottomMm(placementOf(c), props.geometry);
    if ('missing' in h) return h;
    if (rigSetup.bottomAboveFloorMm === null) return { missing: ['A: the cabinet bottom above the floor (step 2)'] };
    return { mm: rigSetup.bottomAboveFloorMm + h.mm, from: h.from };
  };
  const f0Proposal = (c: SourceConfig) =>
    c.inPod ? an4F0(num(c.podDiameter ?? ''), 'the pod diameter') : an4F0(ownGeometry ? num(obj.baffleW) : props.geometry.baffleWidthMm, 'the baffle width');
  const [proposals, setProposals] = useState<Record<string, { key: string; res: WindowProposal | { reason: string } }>>({});
  const [proposalBusy, setProposalBusy] = useState<{ stem: string; merges: number } | null>(null);
  const proposalInputs = (src: SessionSource) => {
    const c = cfg[src.stem];
    if (!session || !src.far?.pir || !src.near || !sessionRef) return { reason: !src.far?.pir ? 'an FRD-only far field is already gated: only its header window exists' : 'no session reference' } as const;
    const f0 = f0Proposal(c);
    if ('reason' in f0) return { reason: f0.reason } as const;
    const h = heightAboveFloor(c);
    const unknown = st.planeQ === 'unknown';
    if ('missing' in h && !unknown) return { reason: `height above the floor: ${h.missing.join('; ')}` } as const;
    const sd = sdOf(c);
    const key = JSON.stringify([src.stem, sessionRef.ms, f0.f0Hz, sd, 'mm' in h ? h.mm : null, rigSetup, planes, st.planeQ]);
    return { key, f0, sd, heightMm: 'mm' in h ? h.mm : null, unknown } as const;
  };
  useEffect(() => {
    if (st.step !== 'window' || !session) return;
    const src = drivers.find((d) => d.stem === tab);
    if (!src) return;
    const inp = proposalInputs(src);
    if ('reason' in inp) {
      setProposals((p) => ({ ...p, [src.stem]: { key: 'reason', res: { reason: inp.reason ?? '' } } }));
      return;
    }
    if (proposals[src.stem]?.key === inp.key) return;
    setProposalBusy({ stem: src.stem, merges: 0 });
    /* The scan is one full merge per window end (~0.3 s each; casus 1's mid needs 67), so it runs in
     * slices: the page stays usable and says how far it is. */
    let h = 0;
    let cancelled = false;
    const steps = proposeWindowSteps({
        far: impulseOfItem(src.far!, session.name, false),
        near: impulseOfItem(src.near!, session.name, false),
        referenceMs: sessionRef!.ms,
        model: { kind: 'an4', f0Hz: inp.f0.f0Hz },
        sdCm2: inp.sd,
        sourceHeightMm: inp.heightMm,
        rig: rigSetup,
        planes,
        planesUnknown: inp.unknown,
      });
    const slice = () => {
      if (cancelled) return;
      const until = performance.now() + PROPOSAL_SLICE_MS;
      let merges = 0;
      for (;;) {
        const r = steps.next();
        if (r.done) {
          setProposals((p) => ({ ...p, [src.stem]: { key: inp.key, res: r.value } }));
          setProposalBusy(null);
          return;
        }
        merges++;
        if (performance.now() >= until) break;
      }
      setProposalBusy((b) => (b && b.stem === src.stem ? { stem: src.stem, merges: b.merges + merges } : b));
      h = window.setTimeout(slice, 0);
    };
    h = window.setTimeout(slice, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.step, tab, session, sessionRef, cfg, rig, planes, st.planeQ, obj.baffleW, props.geometry, props.sdCm2]);
  const takeOver = (stem: string, pr: WindowProposal, f0Hz: number) =>
    setC(stem, {
      winMode: 'proposal',
      pirRef: pr.gate.referenceMs.toFixed(4),
      pirLeft: pr.gate.leftMs.toFixed(4),
      pirRight: pr.gate.rightMs.toFixed(4),
      pirTaper: String(pr.gate.rightTaper),
      model: 'an4',
      f0: f0Hz.toFixed(1),
      fitLo: pr.fitHz[0].toFixed(1),
      fitHi: pr.fitHz[1].toFixed(1),
      spliceLo: pr.spliceHz[0].toFixed(1),
      spliceHi: pr.spliceHz[1].toFixed(1),
    });
  /* step 2: the single planes question becomes the per-plane answers the echo model reads */
  const setPlaneQ = (q: ToolState['planeQ'], list: ToolState['planeList'] = st.planeList ?? []) =>
    setSt((s) => {
      const all = (kind: 'farther' | 'unknown'): PlanesStated => ({ ceiling: { kind }, sideWall: { kind }, wallBehindCabinet: { kind }, wallBehindMic: { kind } });
      let p: PlanesStated = { ceiling: null, sideWall: null, wallBehindCabinet: null, wallBehindMic: null };
      if (q === 'no') p = all('farther');
      else if (q === 'unknown') p = all('unknown');
      else if (q === 'yes') {
        p = all('farther');
        for (const e of list) p = { ...p, [e.kind]: { kind: 'measured', mm: num(e.mm) ?? NaN } };
      }
      return { ...s, planeQ: q, planeList: list, planes: p };
    });

  /* ---- render helpers ---- */
  const activeGate = active?.far ? gateOf(active.far) : null;
  /* ---- B-4 guide: step state, step 1's confirmation, step 2's set-ups and checks ---- */
  const step: GuideStep = st.step ?? 'files';
  const stepDone: Record<GuideStep, boolean> = {
    files: !!st.rolesConfirmed,
    setup: sstat.complete,
    window: drivers.length > 0 && drivers.every((d) => !!cfg[d.stem].winMode && num(cfg[d.stem].fitLo) !== null),
    merge: Object.keys(st.accepted).length > 0,
    export: false,
  };
  const confirmRoles = () =>
    setSt((s) => {
      const roles: RoleOverrides = { ...(s.roles ?? {}) };
      for (const f of current?.files ?? []) {
        if (roles[f.name] || !/\.(pir|frd|txt)$/i.test(f.name)) continue;
        const pr = stemOf(f.name);
        if (pr.role === 'unknown') continue;
        roles[f.name] = { role: /\b(port|poort|vent|reflex|pr)\b/.test(pr.stem) ? 'port' : pr.role, stem: pr.stem };
      }
      const nextCfg = { ...s.cfg };
      for (const d of drivers) {
        const c = { ...blankConfig(), ...nextCfg[d.stem] };
        const pw = proposeWay(d.stem);
        if (!c.way && pw) nextCfg[d.stem] = { ...c, way: pw.way, member: c.member || (pw.member ?? '') };
      }
      return { ...s, roles, cfg: nextCfg, rolesConfirmed: true };
    });
  const [setups, setSetups] = useState<StoredSetup[]>([]);
  const [setupName, setSetupName] = useState('');
  const refreshSetups = () => listSetups().then(setSetups).catch((e) => setStoreError(String(e)));
  useEffect(() => {
    void refreshSetups();
  }, []);
  type SetupData = { rig: RigState; planeQ: ToolState['planeQ']; planeList: ToolState['planeList'] };
  const loadSetup = (id: string) => {
    const x = setups.find((y) => y.id === id);
    if (!x) return;
    const d = x.data as SetupData;
    setSt((s) => ({ ...s, rig: { ...s.rig, ...d.rig } }));
    setPlaneQ(d.planeQ ?? '', d.planeList ?? []);
    setSetupName(x.name);
  };
  const saveCurrentSetup = () => {
    const data: SetupData = { rig: st.rig, planeQ: st.planeQ ?? '', planeList: st.planeList ?? [] };
    void saveSetup({ id: `${setupName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`, name: setupName.trim(), savedAt: new Date().toISOString(), data }).then(refreshSetups);
  };
  /* the blue circles: c·T/2 for the window in use (or the header's), around cabinet and mic */
  const reachForDrawing = (() => {
    const g = cur?.input?.gate ?? (activeGate && !('error' in activeGate) ? activeGate.gate : null);
    const far = cur?.input?.far ?? (active?.far?.pir ? impulseOfItem(active.far, session?.name ?? '', false) : null);
    return g && far ? reflectionReachMm(gateAfterArrivalMs(g, far)) / 1000 : null;
  })();
  /* C and D against the PIRs: the far field arrives later than the near field by its path */
  const arrivalCheck = (() => {
    if (!session?.timeBaseShared || rigSetup.micDistanceMm === null || rigSetup.micHeightMm === null) return null;
    const rows: string[] = [];
    let worst = 0;
    for (const d of drivers) {
      if (!d.far?.pir || !d.near?.pir) continue;
      const h = heightAboveFloor(cfg[d.stem]);
      if (!('mm' in h)) continue;
      const pathMm = Math.hypot(rigSetup.micDistanceMm, rigSetup.micHeightMm - h.mm);
      const measuredMm = (directPeakMs(d.far.pir) - directPeakMs(d.near.pir)) * 343;
      worst = Math.max(worst, Math.abs(measuredMm - pathMm));
      rows.push(t('{d}: path {p} mm from C, D and the height; the PIRs say {m} mm', { d: d.label, p: pathMm.toFixed(0), m: measuredMm.toFixed(0) }));
    }
    if (rows.length === 0) return null;
    return { ok: worst <= ARRIVAL_CHECK_MM, text: `${worst <= ARRIVAL_CHECK_MM ? '✓' : '!'} ${rows.join(' · ')}${worst > ARRIVAL_CHECK_MM ? ' — ' + t('more than {x} mm apart: check C, D or the driver heights', { x: ARRIVAL_CHECK_MM }) : ''}` };
  })();

  return (
    <section className="nf-merge-tool" id="nf-merge-tool">
      <header className="nfm-head-bar">
        <h2>
          {t('NF/FF merge')} <span className="derived">{NF_MERGE_V2_VERSION}</span>
        </h2>
        <a href="#/" className="nfm-back">
          {t('← back to the design')}
        </a>
      </header>
      <p className="derived">
        {t('A tool of its own: it works without a project and keeps its sessions itself. Drop a session’s impulses (.pir) with their FRD exports — the window comes from the export’s header — and the impedances. Merge, accept, export; “Use in project…” hands the project the merged files, exactly as importing the export package would.')}
      </p>
      {storeError && <p className="derived alert">{storeError}</p>}

      <div className="nfm-layout">
        <aside className="nfm-sessions">
          <strong>{t('Sessions')}</strong>
          <label className="dropzone">
            <span className="dz-icon" aria-hidden="true">⬇</span>
            <span className="dz-text">
              <strong>{t('New session')}</strong>
              <span>{t('.pir + their .frd/.txt exports + .zma/.lim')}</span>
            </span>
            <input type="file" multiple accept=".pir,.frd,.txt,.zma,.lim" onChange={(e) => void onFiles(e.target.files)} />
          </label>
          <ul>
            {sessions.map((s) => (
              <li key={s.id} className={s.id === current?.id ? 'active' : ''}>
                <a href={`#/merge/${s.id}`}>{s.name}</a>
                <span className="derived"> · {t('{n} file(s)', { n: s.files })} · {s.savedAt.slice(0, 16).replace('T', ' ')}</span>{' '}
                <button
                  type="button"
                  className="icon"
                  aria-label={t('Delete session {s}', { s: s.name })}
                  onClick={() =>
                    void deleteMergeSession(s.id).then(() => {
                      if (s.id === current?.id) {
                        setCurrent(null);
                        props.onOpenId(null);
                      }
                      return refreshList();
                    })
                  }
                >
                  ✕
                </button>
              </li>
            ))}
            {sessions.length === 0 && <li className="derived">{t('No stored sessions yet.')}</li>}
          </ul>
          <strong>{t('Microphone calibration')}</strong>
          <label className="dropzone nfm-cal-drop">
            <span className="dz-text">
              <strong>{t('Add a calibration file')}</strong>
              <span>{t('ARTA / REW / JustOct text: frequency, dB, optional phase')}</span>
            </span>
            <input type="file" accept=".mic,.txt,.cal,.frd" aria-label={t('calibration file')} onChange={(e) => void onCalFile(e.target.files)} />
          </label>
          {calError && <p className="derived alert" role="alert">{calError}</p>}
          <ul>
            {cals.map((c) => (
              <li key={c.id}>
                {c.name}
                <span className="derived">
                  {' '}
                  · {c.freq.length} {t('points')}, {c.freq[0]}–{c.freq[c.freq.length - 1]} Hz{c.phaseDeg ? ` · ${t('with phase')}` : ''}
                  {c.sensitivityNote ? ` · ${c.sensitivityNote}` : ''}
                </span>{' '}
                <button type="button" className="icon" aria-label={t('Delete calibration {s}', { s: c.name })} onClick={() => void deleteMicCal(c.id).then(refreshCals)}>
                  ✕
                </button>
              </li>
            ))}
            {cals.length === 0 && <li className="derived">{t('No calibration files yet.')}</li>}
          </ul>
        </aside>

        {session && current && (
          <div className="nfm-main">
            {/* B-4 guide: head and step bar, on every screen */}
            <div className="nfm-guide-head">
              <strong>{t('NF/FF merge · session {s}', { s: session.name })}</strong>
              <span className="derived">
                {t('{n} impulse(s)', { n: session.items.filter((i) => i.pir).length })} · {calChoice.kind === 'none' ? t('no calibration') : calChoice.kind === 'derived' ? t('calibration from the FRD exports') : calChoice.cal.name} ·{' '}
                {session.timeBaseShared ? `${t('time base')} ✓` : t('time base not shared')}
              </span>
            </div>
            <ol className="nfm-steps">
              {GUIDE_STEPS.map((k, i) => {
                const at = GUIDE_STEPS.indexOf(step);
                const state = k === step ? 'active' : stepDone[k] ? 'done' : i < at ? 'done' : 'todo';
                return (
                  <li key={k} className={`nfm-step nfm-step-${state}`}>
                    <button type="button" disabled={state === 'todo'} onClick={() => goto(k)} aria-current={k === step ? 'step' : undefined}>
                      <span className="nfm-step-num">{state === 'done' ? '✓' : i + 1}</span> {t(STEP_LABEL[k])}
                    </button>
                  </li>
                );
              })}
            </ol>

            {step === 'files' && (
              <div className="nfm-stepbody">
                <h3>{t('Files')}</h3>
                <p className="derived">{t('The tool proposes a role and a driver for every file, from its name and its content. Confirm them in one list.')}</p>
                <table className="nfm-roles">
                  <thead>
                    <tr>
                      <th>{t('file')}</th>
                      <th>{t('role')}</th>
                      <th>{t('driver')}</th>
                      <th>{t('content')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.files.map((f) => {
                      const lower = f.name.toLowerCase();
                      if (!/\.(pir|frd|txt)$/.test(lower)) {
                        return (
                          <tr key={f.name}>
                            <td>{f.name}</td>
                            <td colSpan={3} className="derived">
                              {/\.(zma|lim)$/.test(lower) ? t('impedance') : t('not read by this tool')}
                            </td>
                          </tr>
                        );
                      }
                      const prop = stemOf(f.name);
                      const o = st.roles?.[f.name];
                      const role = o?.role ?? (prop.role === 'unknown' ? '' : /\b(port|poort|vent|reflex|pr)\b/.test(prop.stem) ? 'port' : prop.role);
                      const stem = o?.stem ?? prop.stem;
                      const item = session.items.find((i) => i.name === f.name || i.frdName === f.name);
                      const isExport = !!item && item.frdName === f.name && !!item.pir && item.name !== f.name;
                      const setRole = (patch: Partial<{ role: string; stem: string }>) =>
                        setSt((s) => ({ ...s, rolesConfirmed: false, roles: { ...(s.roles ?? {}), [f.name]: { role: (patch.role ?? role ?? 'far') as 'near' | 'far' | 'port' | 'ignore', stem: patch.stem ?? stem } } }));
                      return (
                        <tr key={f.name}>
                          <td>{f.name}</td>
                          <td>
                            {isExport ? (
                              <span className="derived">{t('FRD export of {p}', { p: item!.name })}</span>
                            ) : (
                              <>
                                <select value={role} onChange={(e) => setRole({ role: e.target.value })} aria-label={t('role of {f}', { f: f.name })}>
                                  <option value="">—</option>
                                  <option value="near">{t('near field')}</option>
                                  <option value="far">{t('far field')}</option>
                                  <option value="port">{t('port')}</option>
                                  <option value="ignore">{t('ignore')}</option>
                                </select>{' '}
                                {!o && role && <span className="nfm-proposed">{t('proposed')}</span>}
                              </>
                            )}
                          </td>
                          <td>
                            {!isExport && (
                              <Field value={stem} onCommit={(v) => setRole({ stem: v })} width={10} ariaLabel={t('driver of {f}', { f: f.name })} />
                            )}
                          </td>
                          <td className="derived">{item?.pir && item.name === f.name ? t('impulse, peak at {ms} ms', { ms: directPeakMs(item.pir).toFixed(2) }) : t('FRD text')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <h4>{t('Which driver of the design each one is')}</h4>
                <ul className="nfm-wayprops">
                  {drivers.map((d) => {
                    const c = cfg[d.stem];
                    const pw = proposeWay(d.stem);
                    const pair = (props.geometry.drivers[(c.way || pw?.way || 'low') as MergeWay].count ?? 1) >= 2;
                    const nearPk = d.near?.pir ? directPeakMs(d.near.pir) : null;
                    const farPk = d.far?.pir ? directPeakMs(d.far.pir) : null;
                    return (
                      <li key={d.stem}>
                        <strong>{d.label}</strong>{' '}
                        <select value={c.way} onChange={(e) => setC(d.stem, { way: e.target.value as MergeWay | '' })} aria-label={t('which driver')}>
                          <option value="">—</option>
                          <option value="low">{t('low')}</option>
                          <option value="mid">{t('mid')}</option>
                          <option value="high">{t('high')}</option>
                        </select>{' '}
                        {pair && (
                          <select value={c.member} onChange={(e) => setC(d.stem, { member: e.target.value as SourceConfig['member'] })} aria-label={t('member of the pair')}>
                            <option value="">—</option>
                            <option value="upper">{t('upper')}</option>
                            <option value="lower">{t('lower')}</option>
                          </select>
                        )}{' '}
                        {c.way && props.sdCm2[c.way] === null && (
                          <>
                            {' '}
                            S_d <Field value={c.sdCm2 ?? ''} onCommit={(v) => setC(d.stem, { sdCm2: v })} ariaLabel={t('cone area of {d}', { d: d.label })} /> cm²{' '}
                            <span className="derived">{t('(the design states none; needed for ka = 1)')}</span>
                          </>
                        )}{' '}
                        {!c.way && pw && (
                          <span className="nfm-proposed">
                            {t('proposed')}: {t(pw.way)}
                            {pw.member ? ` · ${t(pw.member)}` : ''}
                          </span>
                        )}
                        {nearPk !== null && farPk !== null && nearPk >= farPk && (
                          <span className="nl-warning"> {t('the near field peaks later ({n} ms) than the far field ({f} ms): are the roles swapped?', { n: nearPk.toFixed(2), f: farPk.toFixed(2) })}</span>
                        )}
                      </li>
                    );
                  })}
                  {farOnly.map((f) => (
                    <li key={f.stem} className="derived">
                      {f.label}: {t('far field only, no merge needed')}
                    </li>
                  ))}
                </ul>
                <button type="button" className="nfm-primary" onClick={confirmRoles}>
                  {t('Take over the proposals and confirm')}
                </button>{' '}
                {st.rolesConfirmed && <span className="derived">✓ {t('confirmed')}</span>}
                <div className="nfm-tile nfm-cal">
                <strong>{t('Calibration')}</strong>{' '}
                <select value={st.calId ?? ''} onChange={(e) => setSt((s) => ({ ...s, calId: e.target.value }))} aria-label={t('calibration for this session')}>
                  <option value="">{t('no file')}</option>
                  {cals.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>{' '}
                <span className={calChoice.kind === 'none' ? 'nl-warning' : 'derived'}>
                  {calChoice.kind === 'none'
                    ? t('{r} — merging and fitting work; export and “Use in project” refuse.', { r: calChoice.reason })
                    : calChoice.kind === 'derived'
                      ? t('from the session’s FRD exports (applied).') + (calChoice.check ? ' ' + t('Check against {f}: shapes agree within {d} dB ({lo}–{hi} Hz){e}.', { f: chosenCal!.name, d: calChoice.check.maxDb.toFixed(3), lo: calChoice.check.from, hi: calChoice.check.to, e: calChoice.check.edge ? `; ${calChoice.check.edge}` : '' }) : '')
                      : t('{f} (applied): shape only, level relative — the soundcard’s input sensitivity is not known.', { f: calChoice.cal.name })}
                </span>
              </div>
              </div>
            )}

            {step === 'setup' && (
              <div className="nfm-stepbody nfm-setup-step">
                <div className="nfm-setup-drawing">
                  <SetupDrawing reachM={reachForDrawing} />
                  <p className="derived">{t('The tool works out per driver where floor and table top give a reflection, and whether it falls in the window. That is why these four measures.')}</p>
                </div>
                <div className="nfm-setup-form">
                  <h3>{t('How was the measurement set up?')}</h3>
                  <p className="derived">{t('Four measures, once per set-up. The tool keeps them.')}</p>
                  <p>
                    {t('Earlier set-up')}{' '}
                    <select value="" onChange={(e) => loadSetup(e.target.value)} aria-label={t('earlier set-up')}>
                      <option value="">{t('— choose, or fill in a new one —')}</option>
                      {setups.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name} — {x.savedAt.slice(0, 10)}
                        </option>
                      ))}
                    </select>
                  </p>
                  <p className="nfm-abcd">
                    <span className="nfm-letter">A</span> {t('Cabinet bottom above the floor')} <Field value={rig.bottom} onCommit={(v) => setRig({ bottom: v, surface: num(v) === 0 ? 'floor' : num(v) !== null ? 'table' : '' })} ariaLabel={t('A: cabinet bottom above the floor')} /> mm
                    <br />
                    <span className="derived">{t('Standing on the floor: fill in 0.')}</span>
                  </p>
                  {rig.surface !== 'floor' && (
                    <p className="nfm-abcd">
                      <span className="nfm-letter">B</span> {t('Table top reaches beyond the baffle')}{' '}
                      <select
                        value={rig.overhangUnknown ? 'unknown' : rig.overhangMax !== undefined ? 'at-most' : rig.overhang === '' ? '' : 'measured'}
                        aria-label={t('B: overhang stated as')}
                        onChange={(e) =>
                          setRig(
                            e.target.value === 'unknown'
                              ? { overhangUnknown: true, overhang: '', overhangMax: undefined }
                              : e.target.value === 'at-most'
                                ? { overhangUnknown: false, overhang: '', overhangMax: rig.overhangMax ?? '' }
                                : { overhangUnknown: false, overhangMax: undefined, overhang: e.target.value === 'measured' ? rig.overhang || ' ' : '' },
                          )
                        }
                      >
                        <option value="">—</option>
                        <option value="measured">{t('a measure')}</option>
                        <option value="at-most">{t('at most …')}</option>
                        <option value="unknown">{t('don’t know')}</option>
                      </select>{' '}
                      {rig.overhangMax !== undefined && (
                        <>
                          <Field value={rig.overhangMax} onCommit={(v) => setRig({ overhangMax: v })} ariaLabel={t('B: overhang at most')} /> mm
                        </>
                      )}
                      {!rig.overhangUnknown && rig.overhangMax === undefined && rig.overhang !== '' && (
                        <>
                          <Field value={rig.overhang.trim()} onCommit={(v) => setRig({ overhang: v === '' ? ' ' : v })} ariaLabel={t('B: overhang')} /> mm
                        </>
                      )}
                      <br />
                      <span className="derived">{t('With “don’t know” the floor is not taken into account.')}</span>
                    </p>
                  )}
                  <p className="nfm-abcd">
                    <span className="nfm-letter">C</span> {t('Microphone to the baffle')} <Field value={rig.micDist} onCommit={(v) => setRig({ micDist: v })} ariaLabel={t('C: microphone to the baffle')} /> mm
                  </p>
                  <p className="nfm-abcd">
                    <span className="nfm-letter">D</span> {t('Microphone above the floor')} <Field value={rig.micHeight} onCommit={(v) => setRig({ micHeight: v })} ariaLabel={t('D: microphone above the floor')} /> mm
                    <br />
                    <span className="derived">{t('C and D are checked against the arrival times in your PIRs.')}</span>
                  </p>
                  {arrivalCheck && <p className={arrivalCheck.ok ? 'derived' : 'nl-warning'}>{arrivalCheck.text}</p>}
                  <h4>{t('Is there anything inside the blue circles?')}</h4>
                  <div className="nfm-planeq" role="radiogroup" aria-label={t('planes')}>
                    {(['no', 'yes', 'unknown'] as const).map((q) => (
                      <label key={q}>
                        <input type="radio" name="planeq" checked={st.planeQ === q} onChange={() => setPlaneQ(q, q === 'yes' && (st.planeList ?? []).length === 0 ? [{ kind: 'wallBehindMic', mm: '' }] : st.planeList)} />{' '}
                        {q === 'no' ? t('No, only floor and table') : q === 'yes' ? t('Yes: wall, ceiling or furniture') : t('Don’t know')}
                      </label>
                    ))}
                  </div>
                  {st.planeQ === 'yes' && (
                    <ul className="nfm-planelist">
                      {(st.planeList ?? []).map((e, i) => (
                        <li key={i}>
                          <select
                            value={e.kind}
                            aria-label={t('kind of plane')}
                            onChange={(ev) => setPlaneQ('yes', (st.planeList ?? []).map((x, j) => (j === i ? { ...x, kind: ev.target.value as keyof PlanesStated } : x)))}
                          >
                            <option value="ceiling">{t('ceiling (height above the floor)')}</option>
                            <option value="sideWall">{t('wall or furniture beside the path (distance)')}</option>
                            <option value="wallBehindCabinet">{t('wall behind the cabinet (distance)')}</option>
                            <option value="wallBehindMic">{t('wall behind the microphone (distance)')}</option>
                          </select>{' '}
                          <Field value={e.mm} onCommit={(v) => setPlaneQ('yes', (st.planeList ?? []).map((x, j) => (j === i ? { ...x, mm: v } : x)))} ariaLabel={t('plane distance')} /> mm{' '}
                          <button type="button" className="icon" aria-label={t('remove plane')} onClick={() => setPlaneQ('yes', (st.planeList ?? []).filter((_, j) => j !== i))}>
                            ✕
                          </button>
                        </li>
                      ))}
                      <li>
                        <button type="button" onClick={() => setPlaneQ('yes', [...(st.planeList ?? []), { kind: 'sideWall', mm: '' }])}>
                          {t('+ another plane')}
                        </button>
                      </li>
                    </ul>
                  )}
                  {st.planeQ === 'unknown' && <p className="derived">{t('The merges of this session will be called “not checked for reflections”.')}</p>}
                  <p className="derived nfm-heights">
                    {ownGeometry ? t('Driver heights above the measured object’s bottom (its own geometry)') : t('Driver heights from your design')}:{' '}
                    {drivers.map((d, i) => {
                      const h = heightAboveFloor(cfg[d.stem]);
                      return (
                        <span key={d.stem}>
                          {i > 0 ? ' · ' : ''}
                          {d.label}{' '}
                          {ownGeometry && <Field value={cfg[d.stem].ownHeight} onCommit={(v) => setC(d.stem, { ownHeight: v })} ariaLabel={t('height of {d} above the object’s bottom', { d: d.label })} />}
                          {ownGeometry ? ' mm → ' : ''}
                          {'mm' in h ? `${h.mm.toFixed(0)} mm ${t('above the floor')}` : t('— {m}', { m: h.missing.join('; ') })}
                        </span>
                      );
                    })}
                  </p>
                  {!sstat.complete && <p className="derived alert">{t('Still missing: {m}.', { m: sstat.missing.join('; ') })}</p>}
                  <p>
                    <Field value={setupName} onCommit={setSetupName} width={18} placeholder={t('name, e.g. test cabinet on table — Aug 2026')} ariaLabel={t('set-up name')} />{' '}
                    <button type="button" disabled={!setupName.trim()} onClick={saveCurrentSetup}>
                      {t('Keep this set-up')}
                    </button>
                  </p>
                  <div className="nfm-tile">
                <strong>{t('Measured object')}</strong>{' '}
                <select value={obj.kind} onChange={(e) => setObj({ kind: e.target.value as ObjectState['kind'] })} aria-label={t('Measured object')}>
                  <option value="">—</option>
                  <option value="target">{t('the target cabinet (optimizer)')}</option>
                  <option value="other">{t('another object')}</option>
                </select>
                {obj.kind === 'other' && (
                  <span className="nfm-obj">
                    <Field value={obj.label} onCommit={(v) => setObj({ label: v })} width={7} placeholder={t('name')} ariaLabel={t('name')} /> {t('baffle')}{' '}
                    <select value={obj.baffle} onChange={(e) => setObj({ baffle: e.target.value as 'identical' | 'own' })} aria-label={t('baffle')}>
                      <option value="identical">{t('identical to the target')}</option>
                      <option value="own">{t('own geometry')}</option>
                    </select>
                    {obj.baffle === 'own' && (
                      <>
                        {' '}
                        <Field value={obj.baffleW} onCommit={(v) => setObj({ baffleW: v })} ariaLabel={t('baffle width')} /> ×{' '}
                        <Field value={obj.baffleH} onCommit={(v) => setObj({ baffleH: v })} ariaLabel={t('baffle height')} /> mm
                      </>
                    )}{' '}
                    {t('net volume')} <Field value={obj.volume} onCommit={(v) => setObj({ volume: v })} ariaLabel={t('net volume')} /> L{' '}
                    <select value={obj.load} onChange={(e) => setObj({ load: e.target.value as 'sealed' | 'vented' })} aria-label={t('load')}>
                      <option value="vented">{t('vented')}</option>
                      <option value="sealed">{t('sealed')}</option>
                    </select>
                    {obj.load === 'vented' && (
                      <>
                        {' '}f_b <Field value={obj.fb} onCommit={(v) => setObj({ fb: v })} ariaLabel="f_b" /> Hz Q_l <Field value={obj.qL} onCommit={(v) => setObj({ qL: v })} ariaLabel="Q_l" />
                      </>
                    )}
                    {' · '}
                    {t('target')} <Field value={obj.targetVolume} onCommit={(v) => setObj({ targetVolume: v })} ariaLabel={t('target volume')} /> L{' '}
                    <select value={obj.targetLoad} onChange={(e) => setObj({ targetLoad: e.target.value as 'sealed' | 'vented' })} aria-label={t('target load')}>
                      <option value="vented">{t('vented')}</option>
                      <option value="sealed">{t('sealed')}</option>
                    </select>
                    {obj.targetLoad === 'vented' && (
                      <label>
                        {' '}
                        <input type="checkbox" checked={obj.targetSamePort} onChange={(e) => setObj({ targetSamePort: e.target.checked })} /> {t('same port')}
                      </label>
                    )}
                    {' · T/S '}f_s <Field value={obj.fs} onCommit={(v) => setObj({ fs: v })} ariaLabel="f_s" /> Q_ts{' '}
                    <Field value={obj.qts} onCommit={(v) => setObj({ qts: v })} ariaLabel="Q_ts" /> V_as <Field value={obj.vas} onCommit={(v) => setObj({ vas: v })} ariaLabel="V_as" /> L ×{' '}
                    <Field value={obj.count} onCommit={(v) => setObj({ count: v })} ariaLabel={t('driver count')} width={3} />
                  </span>
                )}
              </div>
              <div className="nfm-tile">
                <strong>{t('Valid for the target')}</strong>{' '}
                {validity ? (
                  <>
                    <span className={validity.fromHz === null && obj.kind === 'other' ? 'derived alert' : 'derived'}>{validity.note}</span>{' '}
                    ±<Field value={obj.tolDb} onCommit={(v) => setObj({ tolDb: v })} width={3} ariaLabel={t('level tolerance')} /> dB ±
                    <Field value={obj.tolDeg} onCommit={(v) => setObj({ tolDeg: v })} width={3} ariaLabel={t('phase tolerance')} />°{' '}
                    <select value={obj.lowEnd} onChange={(e) => setObj({ lowEnd: e.target.value as 'mark' | 'convert' })} aria-label={t('below the limit')}>
                      <option value="mark">{t('below: mark as measured object')}</option>
                      <option value="convert">{t('below: convert with the model ratio')}</option>
                    </select>
                  </>
                ) : (
                  <span className="derived">{t('state the measured object')}</span>
                )}
              </div>
                </div>
              </div>
            )}

            {(step === 'window' || step === 'merge') && (
              <>
            {/* driver tabs: steps 3 and 4 */}
            <div className="nfm-tabs" role="tablist">
              {drivers.map((d) => {
                const s = statusFor(d.stem);
                return (
                  <button key={d.stem} type="button" role="tab" aria-selected={d.stem === tab} className={`nfm-tab${d.stem === tab ? ' active' : ''}`} onClick={() => setTab(d.stem)}>
                    {d.label} <span className={`nfm-status nfm-${s ?? 'none'}`}>{s ? t(STATUS_LABEL[s]) : '—'}</span>
                    {st.accepted[d.stem] && <span className="nfm-accepted"> ✓ {t('accepted')}</span>}
                  </button>
                );
              })}
            </div>
            {farOnly.map((f) => (
              <p key={f.stem} className="derived">
                {f.label}: {t('far field only, no merge needed')}
              </p>
            ))}


              </>
            )}
            {step === 'window' && active && (
              <WindowStep
                key={active.stem}
                src={active}
                c={cfg[active.stem]}
                busy={proposalBusy?.stem === active.stem ? proposalBusy.merges : null}
                proposal={proposals[active.stem]?.res ?? null}
                f0={f0Proposal(cfg[active.stem])}
                headerGate={activeGate && !('error' in activeGate) && activeGate.route === 'pir' ? activeGate.gate : null}
                sd={sdOf(cfg[active.stem])}
                sessionName={session.name}
                cur={cur}
                setC={(p) => setC(active.stem, p)}
                onTakeOver={(pr, f0Hz) => takeOver(active.stem, pr, f0Hz)}
                onGoto={goto}
              />
            )}

            {step === 'merge' && active && (
              <>
                <p className="nfm-window">
                  <strong>{t('Window')}</strong>{' '}
                  {cur?.window
                    ? t('{src}, T = {tt} ms, 1/T = {hz} Hz', {
                        src: cur.window.source === 'header' ? t('from the FRD header') : cfg[active.stem].winMode === 'proposal' ? t('the proposal, taken over') : t('set by hand'),
                        tt: (1000 / cur.window.oneOverTHz).toFixed(3),
                        hz: cur.window.oneOverTHz.toFixed(1),
                      })
                    : t('not set')}{' '}
                  <button type="button" className="linkish" onClick={() => goto('window')}>
                    {t('change in step 3')}
                  </button>
                </p>
                <div className="nfm-body">
                  <WorkPanel
                    key={active.stem}
                    src={active}
                    c={cfg[active.stem]}
                    comp={cur}
                    session={session}
                    ownGeometry={ownGeometry}
                    geometry={props.geometry}
                    setC={(p) => setC(active.stem, p)}
                    setupComplete={sstat.complete}
                    accepted={st.accepted[active.stem] ?? null}
                    onAccept={() => cur && accept(active, cfg[active.stem], cur)}
                    onGoto={goto}
                  />
                  <Charts comp={cur} bare={bare} reflectionModel={reflectionModel} setReflectionModel={setReflectionModel} sd={sdOf(cfg[active.stem])} targetFromHz={validity?.fromHz ?? null} />
                </div>
              </>
            )}

            {step === 'export' && (
              <div className="nfm-stepbody">
                <ExportPanel
                  session={session}
                  merges={Object.entries(st.accepted).map(([source, a]) => ({ source, fileName: a.name, text: a.text, textOriginal: a.textOriginal ?? null, way: a.way, status: a.status }))}
                  rig={rigSetup}
                  measuredObjectNote={obj.kind === 'other' ? `${obj.label}, ${obj.volume} L ${obj.load}` : obj.kind === 'target' ? 'the target cabinet' : 'not stated'}
                  targetNote={obj.kind === 'other' ? `${obj.targetVolume} L ${obj.targetLoad}` : 'the measured object'}
                  onClose={() => goto('merge')}
                />
                <UsePanel acceptedOf={acceptedOf} accepted={st.accepted} inProject={props.inProject} onUse={props.onUse} responseNames={props.responseNames} />
              </div>
            )}

            <div className="nfm-nav">
              <button type="button" disabled={GUIDE_STEPS.indexOf(step) === 0} onClick={() => goto(GUIDE_STEPS[GUIDE_STEPS.indexOf(step) - 1])}>
                {t('← previous')}
              </button>
              {GUIDE_STEPS.indexOf(step) < GUIDE_STEPS.length - 1 && (
                <button type="button" className="nfm-primary" onClick={() => goto(GUIDE_STEPS[GUIDE_STEPS.indexOf(step) + 1])}>
                  {t('next →')}
                </button>
              )}
            </div>
          </div>
        )}
        {!session && <p className="derived nfm-empty">{t('Open a stored session on the left, or drop a new one.')}</p>}
      </div>
    </section>
  );
}


/**
 * B-4 guide, step 2 — the side view of the set-up (Sander's board, guide_opstelling_zijaanzicht.svg):
 * cabinet on a table, the drivers as blocks "positions from your design", the microphone, the direct
 * path and the floor reflection, the measures A–D, and two circles of radius c·T/2 around cabinet and
 * mic. The radius label is this session's own (the window in use), never the drawing's example.
 */
function SetupDrawing({ reachM }: { reachM: number | null }) {
  const label = reachM !== null ? t('only what stands inside counts ({x} m)', { x: reachM.toFixed(2) }) : t('only what stands inside counts (c·T/2)');
  return (
    <svg className="nfm-drawing" width="560" height="420" viewBox="0 0 560 420" role="img" aria-label={t('Side view of the set-up: cabinet on a table, microphone on a stand, the measures A to D and the floor reflection')} fontFamily="system-ui, sans-serif">
<rect x="0" y="0" width="560" height="420" fill="#ffffff"/><circle cx="215" cy="192.3" r="154.8" fill="#eef4fd" fillOpacity="0.55" stroke="#93b4ea" strokeDasharray="5 4"/><circle cx="395.0" cy="111.6" r="154.8" fill="#eef4fd" fillOpacity="0.55" stroke="#93b4ea" strokeDasharray="5 4"/><text x="543.8" y="15.6" fontSize="11" fill="#3b6fc4" textAnchor="end">{label}</text><line x1="10" x2="550" y1="360" y2="360" stroke="#374151" strokeWidth="2"/><line x1="14" x2="6" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="28" x2="20" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="42" x2="34" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="56" x2="48" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="70" x2="62" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="84" x2="76" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="98" x2="90" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="112" x2="104" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="126" x2="118" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="140" x2="132" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="154" x2="146" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="168" x2="160" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="182" x2="174" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="196" x2="188" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="210" x2="202" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="224" x2="216" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="238" x2="230" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="252" x2="244" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="266" x2="258" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="280" x2="272" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="294" x2="286" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="308" x2="300" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="322" x2="314" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="336" x2="328" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="350" x2="342" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="364" x2="356" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="378" x2="370" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="392" x2="384" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="406" x2="398" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="420" x2="412" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="434" x2="426" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="448" x2="440" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="462" x2="454" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="476" x2="468" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="490" x2="482" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="504" x2="496" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="518" x2="510" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="532" x2="524" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><line x1="546" x2="538" y1="360" y2="368" stroke="#9ca3af" strokeWidth="1"/><text x="14" y="384" fontSize="12" fill="#6b7280">{t('floor')}</text><rect x="64" y="270.0" width="171.0" height="8" fill="#d6c3a5" stroke="#a8916d"/><rect x="76" y="278.0" width="8" height="82.0" fill="#d6c3a5" stroke="#a8916d"/><rect x="217" y="278.0" width="8" height="82.0" fill="#d6c3a5" stroke="#a8916d"/><rect x="90" y="144.0" width="125" height="126.0" fill="#e5e7eb" stroke="#4b5563" strokeWidth="1.5"/><text x="152.5" y="166.0" textAnchor="middle" fontSize="12" fill="#374151">{t('cabinet (side view)')}</text><rect x="209" y="151.5" width="10" height="32" rx="3" fill="#2a78d6"/><rect x="209" y="201.1" width="10" height="32" rx="3" fill="#2a78d6"/><text x="203" y="145.5" textAnchor="end" fontSize="11" fill="#2a78d6">{t('drivers: positions from your design')}</text><line x1="219" y1="217.1" x2="389.0" y2="115.6" stroke="#4a3aa7" strokeWidth="1.5"/><polyline points="219,217.1 280.7,360 389.0,115.6" fill="none" stroke="#b45309" strokeWidth="1.5" strokeDasharray="5 4"/><text x="288.7" y="352" fontSize="11" fill="#b45309">{t('floor reflection')}</text><line x1="395.0" x2="395.0" y1="121.6" y2="360" stroke="#4b5563" strokeWidth="2"/><line x1="379.0" x2="411.0" y1="360" y2="360" stroke="#4b5563" strokeWidth="3"/><rect x="381.0" y="107.6" width="22" height="9" rx="4" fill="#111827"/><text x="407.0" y="101.6" fontSize="12" fill="#374151">{t('mic')}</text><line x1="40" x2="40" y1="270.0" y2="360.0" stroke="#1a1a1a" strokeWidth="1.2"/><line x1="35" x2="45" y1="270.0" y2="270.0" stroke="#1a1a1a"/><line x1="35" x2="45" y1="360.0" y2="360.0" stroke="#1a1a1a"/><rect x="29" y="304.0" width="22" height="22" rx="5" fill="#1a1a1a"/><text x="40" y="319.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">A</text><line x1="215" x2="215" y1="240.0" y2="300.0" stroke="#9ca3af" strokeDasharray="2 3"/><line x1="215.0" x2="235.0" y1="300" y2="300" stroke="#1a1a1a" strokeWidth="1.2"/><line x1="215.0" x2="215.0" y1="295" y2="305" stroke="#1a1a1a"/><line x1="235.0" x2="235.0" y1="295" y2="305" stroke="#1a1a1a"/><rect x="214.0" y="289" width="22" height="22" rx="5" fill="#1a1a1a"/><text x="225.0" y="304.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">B</text><line x1="215" x2="215" y1="390" y2="144.0" stroke="#9ca3af" strokeDasharray="2 3"/><line x1="395.0" x2="395.0" y1="390" y2="372" stroke="#9ca3af" strokeDasharray="2 3"/><line x1="215.0" x2="395.0" y1="398" y2="398" stroke="#1a1a1a" strokeWidth="1.2"/><line x1="215.0" x2="215.0" y1="393" y2="403" stroke="#1a1a1a"/><line x1="395.0" x2="395.0" y1="393" y2="403" stroke="#1a1a1a"/><rect x="294.0" y="387" width="22" height="22" rx="5" fill="#1a1a1a"/><text x="305.0" y="402.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">C</text><line x1="443.0" x2="443.0" y1="111.6" y2="360.0" stroke="#1a1a1a" strokeWidth="1.2"/><line x1="438.0" x2="448.0" y1="111.6" y2="111.6" stroke="#1a1a1a"/><line x1="438.0" x2="448.0" y1="360.0" y2="360.0" stroke="#1a1a1a"/><rect x="432.0" y="224.8" width="22" height="22" rx="5" fill="#1a1a1a"/><text x="443.0" y="240.3" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">D</text>
    </svg>
  );
}


/**
 * B-4 guide, step 3 — the window (Sander's board 2). Left: the ETC of this driver's far field, 0 = the
 * direct sound, with the proposed window (flank darker), the end of the FRD header's window (dashed,
 * when there is one) and the first known reflection. Right: the Window card (proposed from the
 * measurement: take over, the FRD header's, or set by hand), the residual-versus-end check, and the
 * Fit card (proposed; nothing to fill in, "Advanced" folded).
 */
function WindowStep(p: {
  src: SessionSource;
  c: SourceConfig;
  /** Merges done so far while the proposal is being worked out; null when it is not. */
  busy: number | null;
  proposal: WindowProposal | { reason: string } | null;
  f0: { f0Hz: number; note: string } | { reason: string };
  headerGate: Gate | null;
  sd: number | null;
  sessionName: string;
  cur: Computed | null;
  setC: (patch: Partial<SourceConfig>) => void;
  onTakeOver: (pr: WindowProposal, f0Hz: number) => void;
  onGoto: (step: GuideStep) => void;
}) {
  const { c, setC } = p;
  const far = useMemo(() => (p.src.far?.pir ? impulseOfItem(p.src.far, p.sessionName, false) : null), [p.src, p.sessionName]);
  const etc = useMemo(() => {
    if (!far) return null;
    const env = envelope(far.samples);
    const fs = far.sampleRate;
    const peak = arrivalMs(far);
    let top = 0;
    for (let i = 0; i < env.length; i++) top = Math.max(top, env[i]);
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < env.length; i++) {
      const tms = (i / fs) * 1000 - peak;
      if (tms < -3 || tms > 12) continue;
      x.push(tms);
      y.push(Math.max(-80, 20 * Math.log10(env[i] / top)));
    }
    return { x, y, peak };
  }, [far]);
  const pr = p.proposal && !('reason' in p.proposal) ? p.proposal : null;
  const f0 = 'reason' in p.f0 ? null : p.f0;
  const bands: { from: number; to: number; color: string; opacity?: number; label?: string }[] = [];
  const markers: { x: number; color?: string; label?: string }[] = [];
  if (etc && pr) {
    const g = pr.gate;
    const begin = g.referenceMs - g.leftMs - etc.peak;
    const end = g.referenceMs + g.rightMs - etc.peak;
    const flank = g.referenceMs + g.rightMs * (1 - g.rightTaper) - etc.peak;
    bands.push({ from: begin, to: flank, color: '#3498db', opacity: 0.12, label: t('window (proposed)') }, { from: flank, to: end, color: '#3498db', opacity: 0.28, label: t('Tukey flank') });
    if (pr.reflection) markers.push({ x: pr.reflection.ms, color: '#111827', label: `${t(pr.reflection.label)} ${pr.reflection.ms.toFixed(2)} ms` });
    if (pr.knee) markers.push({ x: pr.knee.endAfterPeakMs, color: '#c0392b', label: t('knee') });
  }
  if (etc && p.headerGate) markers.push({ x: p.headerGate.referenceMs + p.headerGate.rightMs - etc.peak, color: '#7f8c8d', label: t('FRD header end') });
  const fromHeader = () => {
    if (!p.headerGate) return;
    const b = proposeBandsGuide(1000 / p.headerGate.rightMs, p.sd);
    setC({
      winMode: 'header',
      windowRight: '',
      ...(f0 ? { model: 'an4' as const, f0: f0.f0Hz.toFixed(1) } : {}),
      ...('reason' in b ? {} : { fitLo: b.fitHz[0].toFixed(1), fitHi: b.fitHz[1].toFixed(1), spliceLo: b.spliceHz[0].toFixed(1), spliceHi: b.spliceHz[1].toFixed(1) }),
    });
  };
  const bySelf = () =>
    setC({
      winMode: 'self',
      pirRef: c.pirRef || (pr ? pr.gate.referenceMs.toFixed(4) : p.headerGate?.referenceMs.toFixed(4) ?? ''),
      pirLeft: c.pirLeft || (pr ? pr.gate.leftMs.toFixed(4) : ''),
      pirRight: c.pirRight || (pr ? pr.gate.rightMs.toFixed(4) : ''),
      pirTaper: c.pirTaper || (pr ? String(pr.gate.rightTaper) : ''),
    });
  const scanSeries: Series[] = pr ? [{ id: 'scan', label: t('residual (°) against the window end'), color: '#8e44ad', x: pr.scan.map((q) => q.endAfterPeakMs), y: pr.scan.map((q) => q.deg) }] : [];
  const used = p.cur?.window;
  return (
    <div className="nfm-window-step">
      <div className="nfm-chart nfm-etc-big">
        <strong>{t('ETC of the far field (0 = direct sound)')}</strong>
        {etc ? (
          <Chart series={[{ id: 'etc', label: 'ETC', color: '#b45309', x: etc.x, y: etc.y }]} xDomain={[-3, 12]} xScale="linear" xUnit="ms" yDomain={[-60, 0]} yTickStep={20} yUnit="dB" height={300} xBands={bands} xMarkers={markers} />
        ) : (
          <p className="derived">{t('An FRD-only far field is already gated: there is no impulse to show.')}</p>
        )}
        <p className="derived">{t('The window cuts the direct sound out of the measurement, before the first reflection.')}</p>
      </div>
      <div className="nfm-cards">
        <div className="nfm-card">
          <h4>
            {t('Window')} <span className="nfm-proposed">{t('proposed from the measurement')}</span>
          </h4>
          {p.busy !== null && (
            <p className="derived" role="status">
              {t('Working out the proposal: one merge per window end')} — {p.busy} {t('done')}. {t('The page stays usable meanwhile.')}
            </p>
          )}
          {p.proposal && 'reason' in p.proposal && <p className="nl-warning">{p.proposal.reason}</p>}
          {pr && (
            <>
              <p>
                {t('begin {b} ms before the peak · end {e} ms after it · Tukey {k}', { b: pr.gate.referenceMs - pr.gate.leftMs - pr.peakMs < 0 ? (pr.peakMs - (pr.gate.referenceMs - pr.gate.leftMs)).toFixed(2) : '0', e: pr.endAfterPeakMs.toFixed(2), k: pr.gate.rightTaper })}
                <br />
                <strong>
                  T = {pr.tMs.toFixed(3)} ms · 1/T = {pr.oneOverTHz.toFixed(0)} Hz
                </strong>
              </p>
              <p className="derived">{t('Why here: {w}.', { w: pr.why })}</p>
              {pr.question && <p className="nl-warning">{t(pr.question)}</p>}
            </>
          )}
          <p>
            <button type="button" className="nfm-primary" disabled={!pr || !f0} onClick={() => pr && f0 && p.onTakeOver(pr, f0.f0Hz)}>
              {t('Take over the proposal')}
            </button>{' '}
            <button type="button" disabled={!p.headerGate} onClick={fromHeader} title={p.headerGate ? '' : t('no FRD export with a window header')}>
              {t('Window from the FRD header')}
            </button>{' '}
            <button type="button" disabled={!p.src.far?.pir} onClick={bySelf}>
              {t('Set it yourself')}
            </button>
          </p>
          {c.winMode === 'self' && (
            <p>
              {t('reference')} <Field value={c.pirRef ?? ''} onCommit={(v) => setC({ pirRef: v })} ariaLabel={t('window reference')} /> ms · {t('left')}{' '}
              <Field value={c.pirLeft ?? ''} onCommit={(v) => setC({ pirLeft: v })} ariaLabel={t('window left')} /> ms · {t('right')} <Field value={c.pirRight ?? ''} onCommit={(v) => setC({ pirRight: v })} ariaLabel={t('window right')} /> ms ·{' '}
              {t('Tukey')} <Field value={c.pirTaper ?? ''} onCommit={(v) => setC({ pirTaper: v })} ariaLabel={t('window taper')} />
            </p>
          )}
          <p className={used ? 'derived' : 'derived alert'}>
            {used
              ? t('In use: {m}, T = {tt} ms, 1/T = {hz} Hz', {
                  m: c.winMode === 'proposal' ? t('the proposal') : c.winMode === 'self' ? t('set by hand') : t('the FRD header'),
                  tt: (1000 / used.oneOverTHz).toFixed(3),
                  hz: used.oneOverTHz.toFixed(1),
                })
              : c.winMode
                ? p.cur?.error ?? ''
                : t('No window chosen yet.')}
          </p>
          {pr && pr.scan.length > 1 && (
            <div className="nfm-scan">
              <strong>{t('Check: residual against the window end')}</strong>
              <Chart
                series={scanSeries}
                xDomain={[pr.scan[0].endAfterPeakMs, pr.scan[pr.scan.length - 1].endAfterPeakMs]}
                xScale="linear"
                xUnit="ms"
                yDomain={[0, Math.max(5, Math.ceil(Math.max(...pr.scan.map((q) => q.deg)) + 1))]}
                yUnit="°"
                yTickStep={2}
                height={140}
                xMarkers={[{ x: pr.endAfterPeakMs, color: '#2a78d6', label: t('proposed end') }, ...(pr.knee ? [{ x: pr.knee.endAfterPeakMs, color: '#c0392b', label: t('knee') }] : [])]}
              />
              <p className="derived">{t('The knee: the last end before the residual rises more than {d}° above its lowest so far (a convention).', { d: KNEE_RISE_DEG })}</p>
            </div>
          )}
        </div>
        <div className="nfm-card">
          <h4>
            {t('Fit')} <span className="nfm-proposed">{t('proposed, nothing to fill in')}</span>
          </h4>
          <p>
            {t('model near → far')}: AN4 f0 {f0 ? `${f0.f0Hz.toFixed(0)} Hz` : '—'}
            <br />
            <span className="derived">{f0 ? f0.note : 'reason' in p.f0 ? p.f0.reason : ''}</span>
          </p>
          <p className="nfm-pod">
            <label className="nfm-inline-check">
              <input type="checkbox" checked={!!c.inPod} onChange={(e) => setC({ inPod: e.target.checked })} /> {t('this driver sits in its own pod')}
            </label>
            {c.inPod && (
              <>
                {' · '}
                {t('pod diameter')} <Field value={c.podDiameter ?? ''} onCommit={(v) => setC({ podDiameter: v })} ariaLabel={t('pod diameter')} /> mm
              </>
            )}
          </p>
          {pr && (
            <p>
              {t('fit band')} {pr.fitHz[0].toFixed(0)}–{pr.fitHz[1].toFixed(0)} Hz ({t('1/T to ka = 1')}) · {t('handover')} {pr.spliceHz[0].toFixed(0)}–{pr.spliceHz[1].toFixed(0)} Hz
            </p>
          )}
          <details>
            <summary>{t('Advanced: set it yourself ▸')}</summary>
            <p>
              <select value={c.model} onChange={(e) => setC({ model: e.target.value as SourceConfig['model'] })} aria-label={t('model')}>
                <option value="an4">{t('AN4 form')}</option>
                <option value="shelf">{t('shelf')}</option>
                <option value="none">{t('none')}</option>
              </select>{' '}
              {c.model === 'an4' && (
                <>
                  f0 <Field value={c.f0} onCommit={(v) => setC({ f0: v })} ariaLabel="f0" /> Hz
                </>
              )}
              {c.model === 'shelf' && (
                <>
                  <Field value={c.shelfDb} onCommit={(v) => setC({ shelfDb: v })} ariaLabel={t('shelf depth')} /> dB @ <Field value={c.shelfHz} onCommit={(v) => setC({ shelfHz: v })} ariaLabel={t('shelf corner')} /> Hz
                </>
              )}
            </p>
            <p>
              {t('fit band')} <Field value={c.fitLo} onCommit={(v) => setC({ fitLo: v })} ariaLabel={t('fit band low')} />–
              <Field value={c.fitHi} onCommit={(v) => setC({ fitHi: v })} ariaLabel={t('fit band high')} /> Hz · {t('handover')}{' '}
              <Field value={c.spliceLo} onCommit={(v) => setC({ spliceLo: v })} ariaLabel={t('handover low')} />–
              <Field value={c.spliceHi} onCommit={(v) => setC({ spliceHi: v })} ariaLabel={t('handover high')} /> Hz
            </p>
          </details>
          <p>
            <button type="button" className="linkish" onClick={() => p.onGoto('merge')}>
              {t('to step 4: merge →')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function WorkPanel(p: {
  src: SessionSource;
  c: SourceConfig;
  comp: Computed | null;
  session: LoadedSession;
  ownGeometry: boolean;
  geometry: CabinetGeometryForMerge;
  setC: (patch: Partial<SourceConfig>) => void;
  setupComplete: boolean;
  accepted: ToolAccepted | null;
  onAccept: () => void;
  onGoto: (step: GuideStep) => void;
}) {
  const { src, c, comp, session, setC } = p;
  const r = comp?.result ?? null;
  const ports = session.sources.filter((s) => s.kind === 'port');
  const icon = { ok: '✓', info: 'i', bad: '!' } as const;
  const canAccept = !!r && p.setupComplete && !!c.way && num(c.validFrom) !== null && (r.flags.length === 0 || c.reason.trim() !== '');
  /* B-4 guide: what steps 1–3 fixed is shown here, read-only, with the way back */
  const back = (step: GuideStep, n: number) => (
    <button type="button" className="linkish" onClick={() => p.onGoto(step)}>
      {t('change in step {n}', { n })}
    </button>
  );
  return (
    <div className="nfm-work">
      <h4>{t('Sources')}</h4>
      <p className="derived">
        {t('near field')}: {src.near?.name} · {t('far field')}: {src.far?.name}
      </p>
      <p>
        {t('which driver')}: <strong>{c.way ? t(c.way) : '—'}</strong>
        {c.member ? ` · ${t(c.member)}` : ''} {back('files', 1)}
      </p>
      <p className="derived">
        {comp?.heightMm != null ? t('{h} mm above the floor, from {from}', { h: comp.heightMm.toFixed(0), from: t(comp.heightFrom) }) : ''}
      </p>
      {ports.length > 0 && (
        <p>
          {t('port')}{' '}
          <select value={c.port} onChange={(e) => setC({ port: e.target.value })} aria-label={t('port')}>
            <option value="">{t('none')}</option>
            {ports.map((pt) => (
              <option key={pt.stem} value={pt.stem}>
                {pt.near?.name}
              </option>
            ))}
          </select>
          {c.port && (
            <>
              {' × '}
              <Field value={c.portWeight} onCommit={(v) => setC({ portWeight: v })} ariaLabel={t('port weight')} />{' '}
              <select value={c.portWeightStatus} onChange={(e) => setC({ portWeightStatus: e.target.value as 'stated' | 'provisional' })} aria-label={t('port weight status')}>
                <option value="provisional">{t('provisional')}</option>
                <option value="stated">{t('stated')}</option>
              </select>{' '}
              {t('mouth above the object’s bottom')} <Field value={c.portHeightAboveBottom} onCommit={(v) => setC({ portHeightAboveBottom: v })} ariaLabel={t('mouth above the object’s bottom')} /> mm
            </>
          )}
        </p>
      )}
      <h4>{t('Model and fit')}</h4>
      <p>
        {c.model === 'an4' ? `AN4 f0 ${c.f0 || '—'} Hz` : c.model === 'shelf' ? `shelf ${c.shelfDb || '—'} dB @ ${c.shelfHz || '—'} Hz` : t('none')} · {t('fit band')} {c.fitLo || '—'}–{c.fitHi || '—'} Hz · {t('handover')} {c.spliceLo || '—'}–
        {c.spliceHi || '—'} Hz {back('window', 3)}
      </p>
      <p className="derived">{t('free: gain and delay; fixed: 0° or 180°')}</p>
      <h4>{t('Result')}</h4>
      {comp?.error && <p className="derived alert">{comp.error}</p>}
      {r && (
        <>
          <p>
            τ {r.fit.delayMs.toFixed(3)} ms · {t('gain')} {r.fit.gainDb.toFixed(2)} dB · {t('residual')} {r.fit.residualRmsDeg.toFixed(2)}° / {r.fit.residualRmsDb.toFixed(2)} dB · {t('polarity')} {r.fit.polarityDeg}°{' '}
            <span className={`nfm-verdict ${r.fit.residualRmsDeg <= FIT_RESIDUAL_FLAG_DEG && r.flags.length === 0 ? 'ok' : 'bad'}`}>
              {r.fit.residualRmsDeg <= FIT_RESIDUAL_FLAG_DEG && r.flags.length === 0 ? t('explained') : t('not explained')}
            </span>
          </p>
          <h4>{t('Checks')}</h4>
          <ul className="nfm-checks">
            {checksOf(r, FIT_RESIDUAL_FLAG_DEG).map((ch) => (
              <li key={ch.id} className={`nfm-check-${ch.icon}`}>
                <span className="nfm-icon">{icon[ch.icon]}</span> {ch.text}
              </li>
            ))}
            {comp?.notes.map((n, i) => (
              <li key={`n${i}`} className="nfm-check-info">
                <span className="nfm-icon">i</span> {n}
              </li>
            ))}
          </ul>
          <p>
            {t('valid from')} <Field value={c.validFrom} onCommit={(v) => setC({ validFrom: v })} ariaLabel={t('valid from')} /> Hz{' '}
            <Field value={c.validFromReason} onCommit={(v) => setC({ validFromReason: v })} width={18} placeholder={t('why (stated)')} ariaLabel={t('valid from reason')} />
          </p>
          {r.flags.length > 0 && (
            <p>
              {t('reason')} <Field value={c.reason} onCommit={(v) => setC({ reason: v })} width={22} placeholder={t('required to accept with flags')} ariaLabel={t('reason')} />
            </p>
          )}
          <button type="button" className="nfm-primary" disabled={!canAccept} onClick={p.onAccept} title={canAccept ? '' : t('needs: the set-up stated, which driver, a stated "valid from", and a reason when there are flags')}>
            {r.flags.length > 0 ? t('Accept anyway, with reason…') : t('Accept merge')}
          </button>{' '}
          {p.accepted && <span className="derived">✓ {t('accepted')} — {t('export and “Use in project…” are in step 5')}</span>}
        </>
      )}
    </div>
  );
}

/**
 * Step 5 — "Use in project…": choose the branch, hand it the accepted merges of that way. The button
 * always says busy, done or failed-with-reason (I-4 B-4 nazorg); "done" is read back from the project.
 */
function UsePanel(p: {
  acceptedOf: (way: MergeWay) => AcceptedSource[];
  accepted: Record<string, ToolAccepted>;
  inProject: Record<MergeWay, AcceptedSource[]>;
  onUse: (way: MergeWay, sources: AcceptedSource[]) => Prepared;
  responseNames: Record<MergeWay, string | null>;
}) {
  const ways = [...new Set(Object.values(p.accepted).map((a) => a.way))];
  const [useWay, setUseWay] = useState<MergeWay | ''>('');
  const way = (useWay || ways[0] || '') as MergeWay | '';
  const toUse = way ? p.acceptedOf(way) : [];
  const [use, setUse] = useState<UseStatus>({ kind: 'idle' });
  const useStarted = useRef(0);
  const [useTick, setUseTick] = useState(0);
  useEffect(() => {
    if (use.kind !== 'busy') return;
    const next = confirmBranchUse(use, { responseName: p.responseNames[use.way], recordedSources: p.inProject[use.way].length }, Date.now() - useStarted.current);
    if (next.kind !== 'busy') {
      setUse(next);
      return;
    }
    const h = setTimeout(() => setUseTick((n) => n + 1), Math.max(50, USE_CONFIRM_WAIT_MS - (Date.now() - useStarted.current) + 10));
    return () => clearTimeout(h);
  }, [use, useTick, p.responseNames, p.inProject]);
  const runUse = () => {
    if (!way) {
      setUse({ kind: 'error', way: null, reason: 'no branch chosen' });
      return;
    }
    useStarted.current = Date.now();
    setUse({ kind: 'busy', way, file: branchFileName(way, toUse) });
    let res: Prepared;
    try {
      res = p.onUse(way, toUse);
    } catch (e) {
      res = { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    if (!res.ok) setUse({ kind: 'error', way, reason: res.reason });
  };
  if (ways.length === 0) return <p className="derived">{t('Nothing accepted yet: accept a merge in step 4 first.')}</p>;
  return (
    <div className="nfm-use">
      <h4>{t('Use in project…')}</h4>
      {t('branch')}{' '}
      <select value={way} onChange={(e) => setUseWay(e.target.value as MergeWay)} aria-label={t('branch to use in')}>
        <option value="low">{t('low')}</option>
        <option value="mid">{t('mid')}</option>
        <option value="high">{t('high')}</option>
      </select>{' '}
      <span className="derived">
        {toUse.length > 1
          ? t('{n} accepted merges of this session go to this branch, summed complex: {list}', { n: toUse.length, list: toUse.map((a) => a.source).join(' + ') })
          : toUse.length === 1
            ? t('this merge becomes the branch response')
            : t('no accepted merge for this branch')}
        {way && p.inProject[way].length > 0 ? ` · ${t('replaces what the project uses now: {list}', { list: p.inProject[way].map((a) => a.source).join(' + ') })}` : ''}
      </span>{' '}
      <button type="button" className="nfm-primary" disabled={use.kind === 'busy' || toUse.length === 0} onClick={runUse}>
        {use.kind === 'busy' ? t('Using…') : t('Use in project')}
      </button>
      <UseStatusLine status={use} />
    </div>
  );
}

/**
 * I-4 B-4 nazorg — what "Use in project" did, always in words: busy, done (with where it landed and
 * a way there), or failed with the reason. Idle says nothing. Exported for the test that pins it.
 */
export function UseStatusLine({ status }: { status: UseStatus }) {
  if (status.kind === 'idle') return null;
  if (status.kind === 'busy')
    return (
      <p className="derived nfm-use-status" role="status" aria-live="polite">
        {t('Busy — handing {file} to the project’s {way} branch…', { file: status.file, way: t(status.way) })}
      </p>
    );
  if (status.kind === 'done')
    return (
      <p className="nfm-use-status nfm-use-done" role="status" aria-live="polite">
        ✓ {t('Done — the project’s {way} branch now uses {file}.', { way: t(status.way), file: status.file })} <a href="#/">{t('Go to the design →')}</a>
      </p>
    );
  return (
    <p className="nfm-use-status nl-warning" role="alert">
      ✕ {t('Not used in the project: {reason}', { reason: status.reason })}
    </p>
  );
}

/* ------------------------------------------------------------------ */

function Charts(p: { comp: Computed | null; bare: Computed | null; reflectionModel: boolean; setReflectionModel: (v: boolean) => void; sd: number | null; targetFromHz: number | null }) {
  const comp = p.comp;
  const r = comp?.result;
  const inp = comp?.input;
  if (!r || !inp || !comp.fit || !comp.splice) return <div className="nfm-charts" />;
  const grid = r.freq;
  const mask = grid.map((f) => f >= 20 && f <= 3000);
  const top = Math.max(...r.spl.filter((_, i) => mask[i]));
  const norm = (a: number[]) => a.map((v, i) => (mask[i] ? v - top : NaN));
  const arrival = arrivalMs(inp.far);
  const afterArr = gateAfterArrivalMs(inp.gate, inp.far);
  const gateHz = 1000 / afterArr;
  const ka = p.sd ? kaOneHz(p.sd) : null;
  const markers = [
    { x: gateHz, label: '1/T' },
    ...(ka ? [{ x: ka, label: 'ka = 1' }] : []),
    ...(p.targetFromHz ? [{ x: p.targetFromHz, label: t('target limit'), color: '#c0392b' }] : []),
  ];
  const spl: Series[] = [
    { id: 'pred', label: t('near field + model'), color: '#2980b9', x: grid, y: norm(r.predictionDb), dash: '5 3' },
    { id: 'far', label: t('far field, gated as used'), color: '#7f8c8d', x: grid, y: norm(r.farGatedDb) },
    { id: 'res', label: t('result'), color: '#2c3e50', x: grid, y: norm(r.spl), width: 3 },
  ];
  const toArrival = (ph: number[]) =>
    ph.map((v, i) => {
      if (grid[i] < 150 || grid[i] > 2000) return NaN;
      const x = v + 360 * grid[i] * ((arrival - inp.gate.referenceMs) / 1000);
      return ((((x + 180) % 360) + 360) % 360) - 180;
    });
  const phase: Series[] = [
    { id: 'pp', label: t('near field + model (fitted τ)'), color: '#2980b9', x: grid, y: toArrival(r.predictionPhaseDeg), dash: '5 3' },
    { id: 'fp', label: t('far field, gated'), color: '#7f8c8d', x: grid, y: toArrival(r.farGatedPhaseDeg) },
  ];
  const resSrc = !p.reflectionModel && p.bare?.result ? p.bare.result : r;
  const residual: Series[] = [
    { id: 'rdeg', label: '°', color: '#8e44ad', x: resSrc.fit.residual.freq, y: resSrc.fit.residual.deg },
    { id: 'rdb', label: 'dB', color: '#16a085', x: resSrc.fit.residual.freq, y: resSrc.fit.residual.db, axis: 'y2' },
  ];
  const env = envelope(inp.far.samples);
  const fs = inp.far.sampleRate;
  const peak = Math.max(...Array.from(env));
  const tx: number[] = [];
  const ty: number[] = [];
  for (let i = 0; i < env.length; i++) {
    const tms = (i / fs) * 1000 - arrival;
    if (tms < -3 || tms > 12) continue;
    tx.push(tms);
    ty.push(Math.max(-80, 20 * Math.log10(env[i] / peak)));
  }
  const winLo = inp.gate.referenceMs - inp.gate.leftMs - arrival;
  const winHi = inp.gate.referenceMs + inp.gate.rightMs - arrival;
  const taperLo = inp.gate.referenceMs + inp.gate.rightMs * (1 - inp.gate.rightTaper) - arrival;
  const found = r.echoesFound ?? [];
  const predicted = comp.echoes.filter((e): e is PlaneEcho => e.kind === 'plane').map((e) => ({ label: e.label, ms: planeEchoDelayS(e) * 1000 }));
  const hasPlane = predicted.length > 0;
  return (
    <div className="nfm-charts">
      <div className="nfm-chart">
        <strong>{t('SPL, normalised to the result')}</strong>
        <Chart
          series={spl}
          xDomain={[20, 3000]}
          yDomain={[-40, 5]}
          yTickStep={10}
          yUnit="dB"
          height={220}
          xBands={[
            { from: comp.fit[0], to: comp.fit[1], color: '#3498db', opacity: 0.1, label: t('fit band') },
            { from: comp.splice[0], to: comp.splice[1], color: '#3498db', opacity: 0.22 },
          ]}
          xMarkers={markers}
        />
      </div>
      <div className="nfm-chart">
        <strong>{t('Phase, delay removed, relative to the direct arrival')}</strong>
        <Chart series={phase} xDomain={[150, 2000]} yDomain={[-180, 180]} yTickStep={45} yUnit="°" height={200} xBands={[{ from: comp.fit[0], to: comp.fit[1], color: '#3498db', opacity: 0.12 }]} />
      </div>
      <div className="nfm-chart">
        <strong>{t('Residual in the fit band')}</strong>{' '}
        <label className={`nfm-inline-check${hasPlane ? '' : ' derived'}`}>
          <input type="checkbox" checked={p.reflectionModel} disabled={!hasPlane} onChange={(e) => p.setReflectionModel(e.target.checked)} /> {t('reflection model')}
        </label>
        <Chart
          series={residual}
          xDomain={[comp.fit[0], comp.fit[1]]}
          yDomain={[-30, 30]}
          yTickStep={10}
          yUnit="°"
          y2={{ domain: [-3, 3], tickStep: 1, unit: 'dB' }}
          height={180}
          bands={[
            { from: FIT_RESIDUAL_FLAG_DEG, to: 30, color: '#e74c3c', opacity: 0.12 },
            { from: -30, to: -FIT_RESIDUAL_FLAG_DEG, color: '#e74c3c', opacity: 0.12 },
          ]}
          yReference={0}
        />
        <p className="derived">{t('rms {d}° / {b} dB', { d: resSrc.fit.residualRmsDeg.toFixed(2), b: resSrc.fit.residualRmsDb.toFixed(2) })}</p>
      </div>
      <div className="nfm-chart">
        <strong>{t('ETC of the far field (0 = direct sound)')}</strong>
        <Chart
          series={[{ id: 'etc', label: 'ETC', color: '#2c3e50', x: tx, y: ty }]}
          xDomain={[-3, 12]}
          xScale="linear"
          xUnit="ms"
          yDomain={[-60, 0]}
          yTickStep={10}
          yUnit="dB"
          height={180}
          xBands={[
            { from: winLo, to: taperLo, color: '#27ae60', opacity: 0.1, label: t('window') },
            { from: taperLo, to: winHi, color: '#27ae60', opacity: 0.22, label: t('taper') },
          ]}
          xMarkers={[
            ...found.map((e) => ({ x: e.afterDirectMs, label: `${e.afterDirectMs.toFixed(2)}`, color: e.modelled ? '#27ae60' : '#c0392b' })),
            ...predicted.map((e) => ({ x: e.ms, label: `▲ ${e.label}`, color: '#8e44ad' })),
          ]}
        />
        <ul className="nfm-echoes">
          {found.map((e) => (
            <li key={e.afterDirectMs}>
              {e.afterDirectMs.toFixed(2)} ms · {e.levelDb.toFixed(1)} dB ·{' '}
              {!e.insideGate ? t('outside the window') : e.windowWeight < 1 ? t('in the taper flank (window weight {w})', { w: e.windowWeight.toFixed(2) }) : t('inside the window')}
              {e.modelled ? ` · ${t('modelled')}` : ''}
            </li>
          ))}
        </ul>
        <p className="derived">{t('Outside the window they do not count; an unmodelled echo inside the window above −20 dB is flagged.')}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ExportPanel(p: {
  session: LoadedSession;
  merges: { source: string; fileName: string; text: string; textOriginal: string | null; way: MergeWay; status: MergeStatus }[];
  rig: RigSetup;
  measuredObjectNote: string;
  targetNote: string;
  onClose: () => void;
}) {
  /* I-4 fase 4 — one phase convention and one grid for the whole set, both written into every file
   * and the manifest. The default (as measured, merge grid) writes the files unchanged: the round trip
   * to the design is the text "Use in project" hands it. */
  const [phaseKind, setPhaseKind] = useState<ExportPhase['kind']>('measured');
  const [refMs, setRefMs] = useState('');
  const [grid, setGrid] = useState<ExportGrid>('log48');
  const phase: ExportPhase = phaseKind === 'reference' ? { kind: 'reference', ms: num(refMs) } : phaseKind === 'minphase' ? { kind: 'minphase' } : { kind: 'measured' };
  const res = exportPackage({ session: p.session, merges: p.merges, rig: p.rig, measuredObjectNote: p.measuredObjectNote, targetNote: p.targetNote, madeOn: new Date().toISOString().slice(0, 10), phase, grid });
  const pkg = res.ok ? res.files : [];
  const zero = p.merges.map((m) => phaseZeroMsOf(m.text)).find((v) => v !== null) ?? null;
  const download = () => {
    const zip = zipStore(pkg.map((f) => ({ name: `${p.session.name}/${f.name}`, data: f.data })));
    const url = URL.createObjectURL(new Blob([zip.slice().buffer], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.session.name}_merge_v2.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const head = pkg[0]?.data.split('\n').filter((l) => l.startsWith('*')).join('\n') ?? '';
  return (
    <div className="nfm-export" role="dialog" aria-label={t('Export session')}>
      <h4>{t('Export session “{s}”', { s: p.session.name })}</h4>
      <p className="nfm-warn">{t('Baffle step and diffraction are in these files (full space): do not also switch on the diffraction tool in VituixCAD. Below the splice point it is the near field plus a model.')}</p>
      <p>
        {t('Phase convention')}{' '}
        <select value={phaseKind} onChange={(e) => setPhaseKind(e.target.value as ExportPhase['kind'])} aria-label={t('Phase convention')}>
          <option value="measured">{t('as measured: t = 0 on the session time base')}</option>
          <option value="reference">{t('at a reference point')}</option>
          <option value="minphase">{t('minimum phase, with a warning')}</option>
        </select>
        {phaseKind === 'reference' && (
          <>
            {' '}
            {t('t = 0 at')} <Field value={refMs} onCommit={setRefMs} ariaLabel={t('reference point, ms on the session time base')} placeholder={zero !== null ? t('gate reference {z}', { z: zero.toFixed(4) }) : ''} /> {t('ms on the session time base')}
          </>
        )}{' '}
        {t('Grid')}{' '}
        <select value={grid} onChange={(e) => setGrid(e.target.value as ExportGrid)} aria-label={t('Grid')}>
          <option value="log48">{t('log 1/48 octave (the merge grid; what the design uses)')}</option>
          <option value="original">{t("the far field's own export grid")}</option>
        </select>
      </p>
      {phaseKind === 'minphase' && <p className="nl-warning">{t('Minimum phase: the measured timing between the sources is NOT in these files. Do not sum them to judge a crossover.')}</p>}
      <p className="derived">
        {t('This set: phase {ph}; grid {g}.', { ph: phaseConventionText(phase), g: gridText(grid) })}
      </p>
      {!res.ok && <p className="nl-warning" role="alert">{t('Cannot export: {reason}', { reason: res.reason })}</p>}
      <ul>
        {pkg.map((f) => (
          <li key={f.name}>{f.name}</li>
        ))}
      </ul>
      {p.merges.length === 0 && <p className="derived alert">{t('Nothing accepted from this session yet.')}</p>}
      {head && <pre className="nfm-head">{head}</pre>}
      <button type="button" disabled={p.merges.length === 0 || !res.ok} onClick={download}>
        {t('Download package (.zip)')}
      </button>{' '}
      <button type="button" onClick={p.onClose}>
        {t('Close')}
      </button>
    </div>
  );
}
