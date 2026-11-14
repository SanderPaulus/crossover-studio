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
  directPeakMs,
  gateAfterArrivalMs,
  gateOf,
  impulseOfItem,
  interpLog,
  kaOneHz,
  loadSession,
  proposeBands,
  reflectionReachMm,
  setupStatus,
  sourceAboveBottomMm,
  statusOf,
  type CabinetGeometryForMerge,
  type DroppedFile,
  type LoadedSession,
  type MergeStatus,
  type MergeWay,
  type PlaneAnswer,
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
  type MergeSessionSummary, listMicCals, saveMicCal, deleteMicCal } from '../lib/mergeStore.ts';

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
  return { rig: { ...b.rig, ...(s.rig ?? {}) }, planes: { ...b.planes, ...(s.planes ?? {}) }, obj: { ...b.obj, ...(s.obj ?? {}) }, cfg, accepted: s.accepted ?? {} };
}

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
  const [exportOpen, setExportOpen] = useState(false);
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
  const setC = (stem: string, patch: Partial<SourceConfig>) => setSt((s) => ({ ...s, cfg: { ...s.cfg, [stem]: { ...s.cfg[stem], ...patch } } }));
  const setRig = (patch: Partial<RigState>) => setSt((s) => ({ ...s, rig: { ...s.rig, ...patch } }));
  const setObj = (patch: Partial<ObjectState>) => setSt((s) => ({ ...s, obj: { ...s.obj, ...patch } }));
  const setPlanes = (f: (p: PlanesStated) => PlanesStated) => setSt((s) => ({ ...s, planes: f(s.planes) }));

  const session = current?.loaded ?? null;
  const { rig, planes, obj, cfg } = st;
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

  const placementOf = (c: SourceConfig): SourcePlacement =>
    ownGeometry ? { kind: 'own', aboveBottomMm: num(c.ownHeight) } : { kind: 'cabinet', way: c.way || null, member: c.member || null };

  const compute = (src: SessionSource, c: SourceConfig, withEchoes: boolean): Computed => {
    const notes: string[] = [];
    const out: Computed = { input: null, result: null, error: null, notes, proposalNote: '', fit: null, splice: null, heightMm: null, heightFrom: '', echoes: [], window: null };
    if (!session || !src.far || !src.near) return { ...out, error: 'no far and near field for this source' };
    const g0 = gateOf(src.far);
    let gate: Gate;
    let route: 'pir' | 'frd';
    if ('error' in g0) {
      if (!(src.far.pir && !src.far.frdText)) return { ...out, error: `${g0.field}: ${g0.error}` };
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
    const sd = c.way ? props.sdCm2[c.way] : null;
    const prop = proposeBands(gateAfterArrivalMs(gate, far), sd);
    out.proposalNote = prop.note;
    const fit: [number, number] | null = num(c.fitLo) !== null && num(c.fitHi) !== null ? [num(c.fitLo)!, num(c.fitHi)!] : prop.fitHz;
    const splice: [number, number] | null = num(c.spliceLo) !== null && num(c.spliceHi) !== null ? [num(c.spliceLo)!, num(c.spliceHi)!] : prop.spliceHz;
    out.fit = fit;
    out.splice = splice;
    if (!fit || !splice) return { ...out, error: 'fit band: ' + prop.note };
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

  /* ---- render helpers ---- */
  const plane = (k: keyof PlanesStated, label: string, reachMm: number | null) => {
    const a = planes[k];
    const kind = a?.kind ?? '';
    return (
      <span className="inline-num" key={k}>
        {t(label) + ' '}
        <select
          value={kind}
          aria-label={t(label)}
          onChange={(e) => {
            const v = e.target.value;
            const next: PlaneAnswer = v === '' ? null : v === 'farther' ? { kind: 'farther' } : v === 'unknown' ? { kind: 'unknown' } : { kind: 'measured', mm: a?.kind === 'measured' ? a.mm : NaN };
            setPlanes((p) => ({ ...p, [k]: next }));
          }}
        >
          <option value="">—</option>
          <option value="measured">{t('distance')}</option>
          <option value="farther">{reachMm ? t('farther than {x} m', { x: (reachMm / 1000).toFixed(2) }) : t('farther than X')}</option>
          <option value="unknown">{t('unknown')}</option>
        </select>
        {a?.kind === 'measured' && (
          <>
            {' '}
            <Field value={Number.isFinite(a.mm) ? String(a.mm) : ''} onCommit={(v) => setPlanes((p) => ({ ...p, [k]: { kind: 'measured', mm: num(v) ?? NaN } }))} ariaLabel={t(label)} /> mm
          </>
        )}
      </span>
    );
  };

  const reach = cur?.input ? reflectionReachMm(gateAfterArrivalMs(cur.input.gate, cur.input.far)) : null;
  const activeGate = active?.far ? gateOf(active.far) : null;

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

        {session && (
          <div className="nfm-main">
            {/* 1. set-up bar */}
            <div className="nfm-setup">
              <div className="nfm-tile">
                <strong>{t('Measuring session')}</strong> {session.name} · {t('{n} impulse(s)', { n: session.items.filter((i) => i.pir).length })}
              </div>
              <div className="nfm-tile">
                <strong>{t('Time base')}</strong>{' '}
                {session.timeBaseShared ? `✓ ${t('dual-channel, shared')}` : <span className="derived">{t('not shared — the delay is fitted only')}</span>}
              </div>
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
              <div className="nfm-tile">
                <strong>{t('Set-up (required)')}</strong> {t('cabinet bottom above the floor')}{' '}
                <Field value={rig.bottom} onCommit={(v) => setRig({ bottom: v })} ariaLabel={t('cabinet bottom above the floor')} /> mm · {t('on')}{' '}
                <select value={rig.surface} onChange={(e) => setRig({ surface: e.target.value as Surface | '' })} aria-label={t('surface')}>
                  <option value="">—</option>
                  <option value="floor">{t('the floor')}</option>
                  <option value="table">{t('a table')}</option>
                  <option value="stand">{t('a stand')}</option>
                </select>
                {rig.surface && rig.surface !== 'floor' && (
                  <>
                    {' '}
                    {t('overhang')}{' '}
                    <select
                      value={rig.overhangUnknown ? 'unknown' : rig.overhangMax !== undefined ? 'at-most' : rig.overhang === '' ? '' : 'measured'}
                      aria-label={t('overhang stated as')}
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
                      <option value="measured">{t('distance')}</option>
                      <option value="at-most">{t('at most')}</option>
                      <option value="unknown">{t('unknown')}</option>
                    </select>
                    {rig.overhangMax !== undefined && (
                      <>
                        {' '}
                        <Field value={rig.overhangMax} onCommit={(v) => setRig({ overhangMax: v })} ariaLabel={t('overhang at most')} /> mm
                      </>
                    )}
                    {!rig.overhangUnknown && rig.overhangMax === undefined && rig.overhang !== '' && (
                      <>
                        {' '}
                        <Field value={rig.overhang.trim()} onCommit={(v) => setRig({ overhang: v === '' ? ' ' : v })} ariaLabel={t('overhang')} /> mm
                      </>
                    )}
                  </>
                )}{' '}
                · {t('mic to baffle')} <Field value={rig.micDist} onCommit={(v) => setRig({ micDist: v })} ariaLabel={t('mic to baffle')} /> mm · {t('mic above the floor')}{' '}
                <Field value={rig.micHeight} onCommit={(v) => setRig({ micHeight: v })} ariaLabel={t('mic above the floor')} /> mm
              </div>
              <div className="nfm-tile">
                <strong>{t('Planes')}</strong>{' '}
                <span className="derived">
                  {reach ? t('only planes within c·T/2 = {x} m of the cabinet or the mic reflect inside the window', { x: (reach / 1000).toFixed(2) }) : ''}
                </span>{' '}
                {plane('ceiling', 'ceiling (height above floor)', reach)}
                {plane('sideWall', 'side wall (distance)', reach)}
                {plane('wallBehindCabinet', 'wall behind the cabinet', reach)}
                {plane('wallBehindMic', 'wall behind the mic', reach)}
              </div>
              {!sstat.complete && (
                <p className="derived alert">{t('Set-up incomplete: {m}. A merge cannot be accepted until the set-up is stated ("unknown" counts as stated).', { m: sstat.missing.join('; ') })}</p>
              )}
            </div>

            {/* 2. driver tabs */}
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

            {active && cfg[active.stem] && (
              <>
                {/* the window this merge uses, always said, with 1/T */}
                <div className="nfm-window">
                  <strong>{t('Window')}</strong>{' '}
                  {activeGate && !('error' in activeGate) ? (
                    <>
                      <span title={t('From the header of the far field’s FRD export. Left and right are LENGTHS from the reference (V60).')}>
                        {t('header: left {l} ms · reference {r} ms · right {rt} ms · Tukey {a}', {
                          l: activeGate.gate.leftMs,
                          r: activeGate.gate.referenceMs.toFixed(3),
                          rt: activeGate.gate.rightMs,
                          a: activeGate.gate.rightTaper,
                        })}
                      </span>
                      {' · '}
                      {t('used')}{' '}
                      <select
                        aria-label={t('window used')}
                        value={cfg[active.stem].windowRight === '' ? 'header' : 'chosen'}
                        disabled={activeGate.route === 'frd'}
                        title={activeGate.route === 'frd' ? t('the far field is an FRD export: it is already gated, a shorter window needs its .pir') : ''}
                        onChange={(e) => setC(active.stem, { windowRight: e.target.value === 'header' ? '' : String(activeGate.gate.rightMs) })}
                      >
                        <option value="header">{t('the header window')}</option>
                        <option value="chosen">{t('a shorter window')}</option>
                      </select>
                      {cfg[active.stem].windowRight !== '' && (
                        <>
                          {' '}
                          {t('right')} <Field value={cfg[active.stem].windowRight} onCommit={(v) => setC(active.stem, { windowRight: v })} ariaLabel={t('chosen right window')} /> ms
                        </>
                      )}
                      {cur?.window && (
                        <span className="nfm-window-used">
                          {' '}
                          →{' '}
                          {cur.window.source === 'header'
                            ? t('header window, T = {t} ms, 1/T = {hz} Hz', { t: cur.window.headerRightMs, hz: cur.window.oneOverTHz.toFixed(1) })
                            : t('CHOSEN, T = {t} ms (header {h} ms), 1/T = {hz} Hz', {
                                t: (1000 / cur.window.oneOverTHz).toFixed(3),
                                h: cur.window.headerRightMs,
                                hz: cur.window.oneOverTHz.toFixed(1),
                              })}
                        </span>
                      )}
                    </>
                  ) : active.far?.pir && !active.far.frdText ? (
                    <>
                      <span title={t('No FRD export for this far field: the window is stated here, all four values, no default. Left and right are LENGTHS from the reference (V60); the reference is the phase zero.')}>
                        {t('stated (no FRD export):')}{' '}
                        {t('reference')} <Field value={cfg[active.stem].pirRef ?? ''} onCommit={(v) => setC(active.stem, { pirRef: v })} ariaLabel={t('window reference')} /> ms ·{' '}
                        {t('left')} <Field value={cfg[active.stem].pirLeft ?? ''} onCommit={(v) => setC(active.stem, { pirLeft: v })} ariaLabel={t('window left')} /> ms ·{' '}
                        {t('right')} <Field value={cfg[active.stem].pirRight ?? ''} onCommit={(v) => setC(active.stem, { pirRight: v })} ariaLabel={t('window right')} /> ms ·{' '}
                        {t('Tukey')} <Field value={cfg[active.stem].pirTaper ?? ''} onCommit={(v) => setC(active.stem, { pirTaper: v })} ariaLabel={t('window taper')} />
                      </span>{' '}
                      <span className="derived">{t('(direct-sound peak at {ms} ms on this PIR — information, not filled in)', { ms: directPeakMs(active.far.pir).toFixed(3) })}</span>
                      {cur?.window ? (
                        <span className="nfm-window-used">
                          {' '}
                          → {t('STATED, T = {t} ms, 1/T = {hz} Hz', { t: cur.window.headerRightMs, hz: cur.window.oneOverTHz.toFixed(1) })}
                        </span>
                      ) : cur?.error ? (
                        <span className="derived alert"> {cur.error}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="derived alert">{activeGate && 'error' in activeGate ? `${activeGate.field}: ${activeGate.error}` : '—'}</span>
                  )}
                </div>
                <div className="nfm-body">
                  <WorkPanel
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
                    onExport={() => setExportOpen(true)}
                    acceptedOf={acceptedOf}
                    inProject={props.inProject}
                    onUse={props.onUse}
                    responseNames={props.responseNames}
                  />
                  <Charts comp={cur} bare={bare} reflectionModel={reflectionModel} setReflectionModel={setReflectionModel} sd={cfg[active.stem].way ? props.sdCm2[cfg[active.stem].way as MergeWay] : null} targetFromHz={validity?.fromHz ?? null} />
                </div>
              </>
            )}

            {exportOpen && current && (
              <ExportPanel
                session={session}
                merges={Object.entries(st.accepted).map(([source, a]) => ({ source, fileName: a.name, text: a.text, textOriginal: a.textOriginal ?? null, way: a.way, status: a.status }))}
                rig={rigSetup}
                measuredObjectNote={obj.kind === 'other' ? `${obj.label}, ${obj.volume} L ${obj.load}` : obj.kind === 'target' ? 'the target cabinet' : 'not stated'}
                targetNote={obj.kind === 'other' ? `${obj.targetVolume} L ${obj.targetLoad}` : 'the measured object'}
                onClose={() => setExportOpen(false)}
              />
            )}
          </div>
        )}
        {!session && <p className="derived nfm-empty">{t('Open a stored session on the left, or drop a new one.')}</p>}
      </div>
    </section>
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
  onExport: () => void;
  acceptedOf: (way: MergeWay) => AcceptedSource[];
  inProject: Record<MergeWay, AcceptedSource[]>;
  onUse: (way: MergeWay, sources: AcceptedSource[]) => Prepared;
  responseNames: Record<MergeWay, string | null>;
}) {
  const { src, c, comp, session, setC } = p;
  const r = comp?.result ?? null;
  const ports = session.sources.filter((s) => s.kind === 'port');
  const icon = { ok: '✓', info: 'i', bad: '!' } as const;
  const canAccept = !!r && p.setupComplete && !!c.way && num(c.validFrom) !== null && (r.flags.length === 0 || c.reason.trim() !== '');
  const [useOpen, setUseOpen] = useState(false);
  const [useWay, setUseWay] = useState<MergeWay | ''>('');
  const way = (useWay || p.accepted?.way || '') as MergeWay | '';
  const toUse = way ? p.acceptedOf(way) : [];
  /* I-4 B-4 nazorg — the button always says busy, done or failed-with-reason; "done" is read back
   * from the project (the branch's response IS the file), never assumed from having called it. */
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
  const pair = !p.ownGeometry && !!c.way && (p.geometry.drivers[c.way as MergeWay].count ?? 1) >= 2;
  return (
    <div className="nfm-work">
      <h4>{t('Sources')}</h4>
      <p className="derived">
        {t('near field')}: {src.near?.name} · {t('far field')}: {src.far?.name}
      </p>
      <span className="inline-num">
        {t('which driver')}{' '}
        <select value={c.way} onChange={(e) => setC({ way: e.target.value as MergeWay | '' })} aria-label={t('which driver')}>
          <option value="">—</option>
          <option value="low">{t('low')}</option>
          <option value="mid">{t('mid')}</option>
          <option value="high">{t('high')}</option>
        </select>
      </span>{' '}
      {pair && (
        <span className="inline-num">
          {t('member of the pair')}{' '}
          <select value={c.member} onChange={(e) => setC({ member: e.target.value as SourceConfig['member'] })} aria-label={t('member of the pair')}>
            <option value="">—</option>
            <option value="upper">{t('upper')}</option>
            <option value="lower">{t('lower')}</option>
          </select>
        </span>
      )}
      {p.ownGeometry && (
        <span className="inline-num">
          {t("height above the object's bottom")} <Field value={c.ownHeight} onCommit={(v) => setC({ ownHeight: v })} ariaLabel={t("height above the object's bottom")} /> mm
        </span>
      )}
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
      <h4>{t('Model near → far')}</h4>
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
      <h4>{t('Fit')}</h4>
      <p>
        {t('fit band')} <Field value={c.fitLo} onCommit={(v) => setC({ fitLo: v })} placeholder={comp?.fit ? comp.fit[0].toFixed(0) : '—'} ariaLabel={t('fit band low')} />–
        <Field value={c.fitHi} onCommit={(v) => setC({ fitHi: v })} placeholder={comp?.fit ? comp.fit[1].toFixed(0) : '—'} ariaLabel={t('fit band high')} /> Hz · {t('handover')}{' '}
        <Field value={c.spliceLo} onCommit={(v) => setC({ spliceLo: v })} placeholder={comp?.splice ? comp.splice[0].toFixed(0) : '—'} ariaLabel={t('handover low')} />–
        <Field value={c.spliceHi} onCommit={(v) => setC({ spliceHi: v })} placeholder={comp?.splice ? comp.splice[1].toFixed(0) : '—'} ariaLabel={t('handover high')} /> Hz
      </p>
      <p className="derived">
        {comp?.proposalNote} · {t('free: gain and delay; fixed: 0° or 180°')}
      </p>
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
          <button type="button" disabled={!canAccept} onClick={p.onAccept} title={canAccept ? '' : t('needs: the set-up stated, which driver, a stated "valid from", and a reason when there are flags')}>
            {r.flags.length > 0 ? t('Accept anyway, with reason…') : t('Accept merge')}
          </button>{' '}
          <button type="button" onClick={p.onExport}>
            {t('Export session…')}
          </button>{' '}
          {p.accepted && (
            <button type="button" onClick={() => setUseOpen((v) => !v)}>
              {t('Use in project…')}
            </button>
          )}
          {p.accepted && useOpen && (
            <div className="nfm-use">
              {t('branch')}{' '}
              <select value={way} onChange={(e) => setUseWay(e.target.value as MergeWay)} aria-label={t('branch to use in')}>
                <option value="low">{t('low')}</option>
                <option value="mid">{t('mid')}</option>
                <option value="high">{t('high')}</option>
              </select>{' '}
              <span className="derived">
                {toUse.length > 1
                  ? t('{n} accepted merges of this session go to this branch, summed complex: {list}', { n: toUse.length, list: toUse.map((a) => a.source).join(' + ') })
                  : t('this merge becomes the branch response')}
                {way && p.inProject[way].length > 0 ? ` · ${t('replaces what the project uses now: {list}', { list: p.inProject[way].map((a) => a.source).join(' + ') })}` : ''}
              </span>{' '}
              <button type="button" disabled={use.kind === 'busy'} onClick={runUse}>
                {use.kind === 'busy' ? t('Using…') : t('Use in project')}
              </button>
              <UseStatusLine status={use} />
            </div>
          )}
        </>
      )}
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
        <label className={hasPlane ? '' : 'derived'}>
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
