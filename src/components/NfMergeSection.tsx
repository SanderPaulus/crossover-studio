/**
 * I-4 fase 3 — the NF/FF merge SECTION (Measurements › Merge), after the approved B-2 sketch
 * (docs: B-2_schets_merge_sectie.md). The ONE place where near and far field are merged; the design
 * branches only load the result and show where it came from. Every decision lives in
 * `lib/mergeSession.ts` (tested); this component renders it.
 */
import { useMemo, useState } from 'react';
import Chart, { type Series } from './Chart.tsx';
import { t } from '../lib/i18n.ts';
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
  type MergeV2Input,
  type MergeV2Result,
  type NearToFarModel,
  type PlaneEcho,
} from '../lib/nfMergeV2.ts';
import { renderMergedFrdV2 } from '../lib/nfMergeV2Block.ts';
import {
  checksOf,
  echoesForSource,
  exportPackage,
  gateAfterArrivalMs,
  gateOf,
  impulseOfItem,
  interpLog,
  kaOneHz,
  loadSession,
  proposeBands,
  reflectionReachMm,
  setupStatus,
  statusOf,
  type LoadedSession,
  type MergeStatus,
  type PlaneAnswer,
  type PlanesStated,
  type RigSetup,
  type SessionSource,
  type Surface,
} from '../lib/mergeSession.ts';
import { convertLowEnd, loadValidity, LOAD_RATIO_TOL_DB, LOAD_RATIO_TOL_DEG, type BoxSpec, type MeasuredObject } from '../lib/measuredObject.ts';

export type MergeRole = 'low' | 'mid' | 'high';
export interface AcceptedSource {
  source: string;
  name: string;
  text: string;
  session: string;
}
export interface NfMergeSectionProps {
  /** Per design branch: the acoustic centre above the cabinet bottom, and the spacing of a pair (optimizer). */
  optimizerHeights: Record<MergeRole, { centerAboveBottomMm: number | null; spacingMm: number | null }>;
  sdCm2: Record<MergeRole, number | null>;
  accepted: Record<MergeRole, AcceptedSource[]>;
  onAccept: (role: MergeRole, sources: AcceptedSource[]) => void;
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

interface SourceConfig {
  role: MergeRole | '';
  port: string;
  portWeight: string;
  portWeightStatus: 'stated' | 'provisional';
  portHeightAboveBottom: string;
  model: 'an4' | 'shelf' | 'none';
  f0: string;
  shelfHz: string;
  shelfDb: string;
  fitLo: string;
  fitHi: string;
  spliceLo: string;
  spliceHi: string;
  height: string;
  validFrom: string;
  validFromReason: string;
  reason: string;
}
const blankConfig = (s: SessionSource): SourceConfig => ({
  role: /woof|bas|low/.test(s.stem) ? 'low' : /mid/.test(s.stem) ? 'mid' : /tweet|high|hoog/.test(s.stem) ? 'high' : '',
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
  height: '',
  validFrom: '',
  validFromReason: '',
  reason: '',
});

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
}

export default function NfMergeSection(props: NfMergeSectionProps) {
  const [session, setSession] = useState<LoadedSession | null>(null);
  const [rig, setRig] = useState({ bottom: '', surface: '' as Surface | '', overhang: '', micDist: '', micHeight: '' });
  const [planes, setPlanes] = useState<PlanesStated>({ ceiling: null, sideWall: null, wallBehindCabinet: null, wallBehindMic: null });
  const [obj, setObj] = useState({
    kind: '' as '' | 'target' | 'other',
    label: '',
    baffle: 'identical' as 'identical' | 'own',
    baffleW: '',
    baffleH: '',
    volume: '',
    load: 'vented' as 'sealed' | 'vented',
    fb: '',
    targetVolume: '',
    targetLoad: 'vented' as 'sealed' | 'vented',
    targetSamePort: true,
    targetFb: '',
    fs: '',
    qts: '',
    vas: '',
    count: '',
    qL: '',
    tolDb: String(LOAD_RATIO_TOL_DB),
    tolDeg: String(LOAD_RATIO_TOL_DEG),
    lowEnd: 'mark' as 'mark' | 'convert',
  });
  const [cfg, setCfg] = useState<Record<string, SourceConfig>>({});
  const [tab, setTab] = useState<string>('');
  const [reflectionModel, setReflectionModel] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const dropped = await Promise.all([...files].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    const first = files[0] as File & { webkitRelativePath?: string };
    // A folder names the session; loose files get a dated name (the session is not a file).
    const folder = first.webkitRelativePath?.split('/')[0] || `session-${new Date().toISOString().slice(0, 10)}`;
    const s = loadSession(folder, dropped);
    setSession(s);
    const next: Record<string, SourceConfig> = {};
    for (const src of s.sources) next[src.stem] = cfg[src.stem] ?? blankConfig(src);
    const port = s.sources.find((x) => x.kind === 'port');
    if (port) for (const src of s.sources) if (next[src.stem].role === 'low' && src.kind === 'driver' && !next[src.stem].port) next[src.stem].port = port.stem;
    setCfg(next);
    setTab(s.sources.find((x) => x.kind === 'driver')?.stem ?? '');
  };
  const setC = (stem: string, patch: Partial<SourceConfig>) => setCfg((c) => ({ ...c, [stem]: { ...c[stem], ...patch } }));

  const rigSetup: RigSetup = {
    bottomAboveFloorMm: num(rig.bottom),
    surface: rig.surface || null,
    surfaceOverhangMm: num(rig.overhang),
    micDistanceMm: num(rig.micDist),
    micHeightMm: num(rig.micHeight),
  };
  const sstat = setupStatus(rigSetup, planes);
  const drivers = session?.sources.filter((s) => s.kind === 'driver') ?? [];
  const farOnly = session?.sources.filter((s) => s.kind === 'far-only') ?? [];

  /** The source's acoustic centre above the floor: stated, else the optimizer's position. */
  const heightOf = (src: SessionSource, c: SourceConfig): { mm: number | null; from: string } => {
    const bottom = rigSetup.bottomAboveFloorMm;
    if (num(c.height) !== null && bottom !== null) return { mm: bottom + num(c.height)!, from: 'stated' };
    if (!c.role || bottom === null) return { mm: null, from: 'missing' };
    const o = props.optimizerHeights[c.role];
    if (o.centerAboveBottomMm === null) return { mm: null, from: 'missing' };
    const sign = /\b(up|boven|top)\b/.test(src.stem) ? 1 : /\b(down|onder|bottom)\b/.test(src.stem) ? -1 : 0;
    const off = sign !== 0 && o.spacingMm ? (sign * o.spacingMm) / 2 : 0;
    return { mm: bottom + o.centerAboveBottomMm + off, from: 'optimizer' };
  };

  const compute = (src: SessionSource, c: SourceConfig, withEchoes: boolean): Computed => {
    const notes: string[] = [];
    const out: Computed = { input: null, result: null, error: null, notes, proposalNote: '', fit: null, splice: null, heightMm: null, heightFrom: '', echoes: [] };
    if (!session || !src.far || !src.near) return { ...out, error: 'no far and near field for this source' };
    const g = gateOf(src.far);
    if ('error' in g) return { ...out, error: `${g.field}: ${g.error}` };
    const far = impulseOfItem(src.far, session.name, g.route === 'frd');
    const near = impulseOfItem(src.near, session.name, false);
    const sd = c.role ? props.sdCm2[c.role] : null;
    const prop = proposeBands(gateAfterArrivalMs(g.gate, far), sd);
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
    const h = heightOf(src, c);
    out.heightMm = h.mm;
    out.heightFrom = h.from;
    let echoes: EchoTerm[] = [];
    if (withEchoes && h.mm !== null && rigSetup.micHeightMm && rigSetup.micDistanceMm) {
      const e = echoesForSource({ sourceHeightMm: h.mm, rig: rigSetup, planes, fitTopHz: fit[1] });
      echoes = e.echoes;
      notes.push(...e.notes);
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
        if (ph === null || rigSetup.bottomAboveFloorMm === null) return { ...out, error: "port height: the cone states a plane, so the port needs its own height (its own image) — state the mouth's height above the cabinet bottom" };
        portEchoes = echoesForSource({ sourceHeightMm: rigSetup.bottomAboveFloorMm + ph, rig: rigSetup, planes, fitTopHz: fit[1] }).echoes;
      }
      port = { impulse: impulseOfItem(portSrc.near, session.name, false), weight: w, echoes: portEchoes };
    }
    const input: MergeV2Input = {
      far,
      near,
      port,
      gate: g.gate,
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

  // all driver sources, recomputed only when committed inputs change
  const computed = useMemo(() => {
    const m = new Map<string, Computed>();
    for (const d of drivers) if (cfg[d.stem]) m.set(d.stem, compute(d, cfg[d.stem], true));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, cfg, rig, planes, props.optimizerHeights, props.sdCm2]);
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

  /* ---- accept ---- */
  const accept = (src: SessionSource, c: SourceConfig, comp: Computed) => {
    if (!session || !comp.result || !comp.input || !c.role) return;
    let result = comp.result;
    if (session.calibration && comp.input.far.timeBase === 'session' && src.far?.pir) {
      const cal = session.calibration;
      result = { ...result, spl: result.freq.map((f, i) => result.spl[i] + interpLog(cal.freq, cal.db, f)) };
    }
    if (validity?.ratio && validity.fromHz !== null && obj.lowEnd === 'convert') {
      const cv = convertLowEnd(result.freq, result.spl, result.phaseDeg, validity.ratio, validity.fromHz);
      result = { ...result, spl: cv.spl, phaseDeg: cv.phaseDeg };
    }
    const text = renderMergedFrdV2({
      branchLabel: src.label,
      input: comp.input,
      result,
      nearName: src.near!.name,
      farName: src.far!.name,
      portName: comp.input.port ? session.sources.find((s) => s.stem === c.port)?.near?.name ?? null : null,
      validFromHz: num(c.validFrom)!,
      validFromReason: c.validFromReason || t('stated in the merge section'),
      referenceNote: `${comp.input.gate.referenceMs.toFixed(4)} ms on the ${session.timeBaseShared ? 'session' : 'file'} time base (the phase zero of the far field's FRD export)`,
      madeOn: new Date().toISOString().slice(0, 10),
      measuredObjectNote: obj.kind === 'other' ? `${obj.label || 'measured object'}, baffle ${obj.baffle}, ${obj.volume} L ${obj.load}` : obj.kind === 'target' ? 'the target cabinet' : null,
      targetValidFromHz: validity?.fromHz ?? null,
      targetValidityNote: validity ? `${validity.note} This file: ${obj.lowEnd === 'convert' ? 'CONVERTED with the model ratio below the limit' : 'MARKED below the limit'}.` : null,
      calibrationNote: session.calibration?.note ?? null,
      portWeightNote: comp.input.port ? (c.portWeightStatus === 'provisional' ? 'PROVISIONAL' : 'stated') : null,
      acceptReason: comp.result.flags.length > 0 ? c.reason : null,
    });
    const name = `${src.stem.replace(/\s+/g, '_')}_merged_v2.frd`;
    const rest = props.accepted[c.role].filter((a) => a.source !== src.stem);
    props.onAccept(c.role, [...rest, { source: src.stem, name, text, session: session.name }]);
  };

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

  const activeGate = active?.far ? gateOf(active.far) : null;
  const reach = cur?.input ? reflectionReachMm(gateAfterArrivalMs(cur.input.gate, cur.input.far)) : null;

  return (
    <section className="nf-merge-v2" id="nf-merge-section">
      <h3>
        {t('NF/FF merge')} <span className="derived">{NF_MERGE_V2_VERSION}</span>
      </h3>
      <p className="derived">
        {t('The one place where a near field and a far field are merged. Drop a session’s impulses (.pir) together with their FRD exports — the window comes from the export’s header — and the impedance. The design branches load the result and show where it came from.')}
      </p>
      <label className="dropzone">
        <span className="dz-icon" aria-hidden="true">⬇</span>
        <span className="dz-text">
          <strong>{t('Drop a measuring session here')}</strong>
          <span>{t('.pir + their .frd/.txt exports + .zma/.lim — or click to choose files')}</span>
        </span>
        <input type="file" multiple accept=".pir,.frd,.txt,.zma,.lim" onChange={(e) => void onFiles(e.target.files)} />
      </label>

      {session && (
        <>
          {/* 1. set-up bar */}
          <div className="nfm-setup">
            <div className="nfm-tile">
              <strong>{t('Measuring session')}</strong> {session.name} · {t('{n} impulse(s)', { n: session.items.filter((i) => i.pir).length })}
            </div>
            <div className="nfm-tile">
              <strong>{t('Time base')}</strong>{' '}
              {session.timeBaseShared ? `✓ ${t('dual-channel, shared')}` : <span className="derived">{t('not shared — the delay is fitted only')}</span>}
            </div>
            <div className="nfm-tile">
              <strong>{t('Window')}</strong>{' '}
              {activeGate && !('error' in activeGate) ? (
                <span title={t('From the header of the far field’s FRD export. Left and right are LENGTHS from the reference (V60).')}>
                  {t('left {l} ms · reference {r} ms · right {rt} ms · Tukey {a}', {
                    l: activeGate.gate.leftMs,
                    r: activeGate.gate.referenceMs.toFixed(3),
                    rt: activeGate.gate.rightMs,
                    a: activeGate.gate.rightTaper,
                  })}
                </span>
              ) : (
                <span className="derived alert">{activeGate && 'error' in activeGate ? `${activeGate.field}: ${activeGate.error}` : '—'}</span>
              )}
            </div>
            <div className="nfm-tile">
              <strong>{t('Measured object')}</strong>{' '}
              <select value={obj.kind} onChange={(e) => setObj({ ...obj, kind: e.target.value as typeof obj.kind })} aria-label={t('Measured object')}>
                <option value="">—</option>
                <option value="target">{t('the target cabinet (optimizer)')}</option>
                <option value="other">{t('another object')}</option>
              </select>
              {obj.kind === 'other' && (
                <span className="nfm-obj">
                  <Field value={obj.label} onCommit={(v) => setObj({ ...obj, label: v })} width={7} placeholder={t('name')} ariaLabel={t('name')} />{' '}
                  {t('baffle')}{' '}
                  <select value={obj.baffle} onChange={(e) => setObj({ ...obj, baffle: e.target.value as 'identical' | 'own' })}>
                    <option value="identical">{t('identical to the target')}</option>
                    <option value="own">{t('own geometry')}</option>
                  </select>
                  {obj.baffle === 'own' && (
                    <>
                      {' '}
                      <Field value={obj.baffleW} onCommit={(v) => setObj({ ...obj, baffleW: v })} ariaLabel={t('baffle width')} /> ×{' '}
                      <Field value={obj.baffleH} onCommit={(v) => setObj({ ...obj, baffleH: v })} ariaLabel={t('baffle height')} /> mm
                    </>
                  )}{' '}
                  {t('net volume')} <Field value={obj.volume} onCommit={(v) => setObj({ ...obj, volume: v })} ariaLabel={t('net volume')} /> L{' '}
                  <select value={obj.load} onChange={(e) => setObj({ ...obj, load: e.target.value as 'sealed' | 'vented' })}>
                    <option value="vented">{t('vented')}</option>
                    <option value="sealed">{t('sealed')}</option>
                  </select>
                  {obj.load === 'vented' && (
                    <>
                      {' '}f_b <Field value={obj.fb} onCommit={(v) => setObj({ ...obj, fb: v })} ariaLabel="f_b" /> Hz Q_l <Field value={obj.qL} onCommit={(v) => setObj({ ...obj, qL: v })} ariaLabel="Q_l" />
                    </>
                  )}
                  {' · '}
                  {t('target')} <Field value={obj.targetVolume} onCommit={(v) => setObj({ ...obj, targetVolume: v })} ariaLabel={t('target volume')} /> L{' '}
                  <select value={obj.targetLoad} onChange={(e) => setObj({ ...obj, targetLoad: e.target.value as 'sealed' | 'vented' })}>
                    <option value="vented">{t('vented')}</option>
                    <option value="sealed">{t('sealed')}</option>
                  </select>
                  {obj.targetLoad === 'vented' && (
                    <label>
                      {' '}
                      <input type="checkbox" checked={obj.targetSamePort} onChange={(e) => setObj({ ...obj, targetSamePort: e.target.checked })} /> {t('same port')}
                    </label>
                  )}
                  {' · T/S '}f_s <Field value={obj.fs} onCommit={(v) => setObj({ ...obj, fs: v })} ariaLabel="f_s" /> Q_ts{' '}
                  <Field value={obj.qts} onCommit={(v) => setObj({ ...obj, qts: v })} ariaLabel="Q_ts" /> V_as <Field value={obj.vas} onCommit={(v) => setObj({ ...obj, vas: v })} ariaLabel="V_as" /> L ×{' '}
                  <Field value={obj.count} onCommit={(v) => setObj({ ...obj, count: v })} ariaLabel={t('driver count')} width={3} />
                </span>
              )}
            </div>
            <div className="nfm-tile">
              <strong>{t('Valid for the target')}</strong>{' '}
              {validity ? (
                <>
                  <span className={validity.fromHz === null && obj.kind === 'other' ? 'derived alert' : 'derived'}>{validity.note}</span>{' '}
                  ±<Field value={obj.tolDb} onCommit={(v) => setObj({ ...obj, tolDb: v })} width={3} ariaLabel={t('level tolerance')} /> dB ±
                  <Field value={obj.tolDeg} onCommit={(v) => setObj({ ...obj, tolDeg: v })} width={3} ariaLabel={t('phase tolerance')} />°{' '}
                  <select value={obj.lowEnd} onChange={(e) => setObj({ ...obj, lowEnd: e.target.value as 'mark' | 'convert' })} aria-label={t('below the limit')}>
                    <option value="mark">{t('below: mark as measured object')}</option>
                    <option value="convert">{t('below: convert with the model ratio')}</option>
                  </select>
                </>
              ) : (
                <span className="derived">{t('state the measured object')}</span>
              )}
            </div>
            <div className="nfm-tile">
              <strong>{t('Set-up (required)')}</strong>{' '}
              {t('cabinet bottom above the floor')} <Field value={rig.bottom} onCommit={(v) => setRig({ ...rig, bottom: v })} ariaLabel={t('cabinet bottom above the floor')} /> mm ·{' '}
              {t('on')}{' '}
              <select value={rig.surface} onChange={(e) => setRig({ ...rig, surface: e.target.value as Surface | '' })} aria-label={t('surface')}>
                <option value="">—</option>
                <option value="floor">{t('the floor')}</option>
                <option value="table">{t('a table')}</option>
                <option value="stand">{t('a stand')}</option>
              </select>
              {rig.surface && rig.surface !== 'floor' && (
                <>
                  {' '}
                  {t('overhang')} <Field value={rig.overhang} onCommit={(v) => setRig({ ...rig, overhang: v })} ariaLabel={t('overhang')} /> mm
                </>
              )}{' '}
              · {t('mic to baffle')} <Field value={rig.micDist} onCommit={(v) => setRig({ ...rig, micDist: v })} ariaLabel={t('mic to baffle')} /> mm · {t('mic above the floor')}{' '}
              <Field value={rig.micHeight} onCommit={(v) => setRig({ ...rig, micHeight: v })} ariaLabel={t('mic above the floor')} /> mm
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
            {!sstat.complete && <p className="derived alert">{t('Set-up incomplete: {m}. A merge cannot be accepted until the set-up is stated ("unknown" counts as stated).', { m: sstat.missing.join('; ') })}</p>}
          </div>

          {/* 2. driver tabs */}
          <div className="nfm-tabs" role="tablist">
            {drivers.map((d) => {
              const st = statusFor(d.stem);
              return (
                <button key={d.stem} type="button" role="tab" aria-selected={d.stem === tab} className={`nfm-tab${d.stem === tab ? ' active' : ''}`} onClick={() => setTab(d.stem)}>
                  {d.label} <span className={`nfm-status nfm-${st ?? 'none'}`}>{st ? t(STATUS_LABEL[st]) : '—'}</span>
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
            <div className="nfm-body">
              <WorkPanel
                src={active}
                c={cfg[active.stem]}
                comp={cur}
                session={session}
                setC={(p) => setC(active.stem, p)}
                setupComplete={sstat.complete}
                status={statusFor(active.stem)}
                onAccept={() => cur && accept(active, cfg[active.stem], cur)}
                onExport={() => setExportOpen(true)}
              />
              <Charts comp={cur} bare={bare} reflectionModel={reflectionModel} setReflectionModel={setReflectionModel} sd={cfg[active.stem].role ? props.sdCm2[cfg[active.stem].role as MergeRole] : null} targetFromHz={validity?.fromHz ?? null} />
            </div>
          )}

          {exportOpen && (
            <ExportPanel
              session={session}
              accepted={props.accepted}
              rig={rigSetup}
              measuredObjectNote={obj.kind === 'other' ? `${obj.label}, ${obj.volume} L ${obj.load}` : obj.kind === 'target' ? 'the target cabinet' : 'not stated'}
              targetNote={obj.kind === 'other' ? `${obj.targetVolume} L ${obj.targetLoad}` : 'the measured object'}
              onClose={() => setExportOpen(false)}
            />
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function WorkPanel(p: {
  src: SessionSource;
  c: SourceConfig;
  comp: Computed | null;
  session: LoadedSession;
  setC: (patch: Partial<SourceConfig>) => void;
  setupComplete: boolean;
  status: MergeStatus | null;
  onAccept: () => void;
  onExport: () => void;
}) {
  const { src, c, comp, session, setC } = p;
  const r = comp?.result ?? null;
  const ports = session.sources.filter((s) => s.kind === 'port');
  const icon = { ok: '✓', info: 'i', bad: '!' } as const;
  const canAccept = !!r && p.setupComplete && !!c.role && num(c.validFrom) !== null && (r.flags.length === 0 || c.reason.trim() !== '');
  return (
    <div className="nfm-work">
      <h4>{t('Sources')}</h4>
      <p className="derived">
        {t('near field')}: {src.near?.name} · {t('far field')}: {src.far?.name}
      </p>
      <span className="inline-num">
        {t('branch')}{' '}
        <select value={c.role} onChange={(e) => setC({ role: e.target.value as MergeRole | '' })} aria-label={t('branch')}>
          <option value="">—</option>
          <option value="low">{t('low')}</option>
          <option value="mid">{t('mid')}</option>
          <option value="high">{t('high')}</option>
        </select>
      </span>{' '}
      <span className="inline-num">
        {t('height above the cabinet bottom')} <Field value={c.height} onCommit={(v) => setC({ height: v })} placeholder={comp?.heightFrom === 'optimizer' ? t('optimizer') : '—'} ariaLabel={t('height above the cabinet bottom')} /> mm{' '}
        <span className="derived">{comp?.heightMm != null ? t('{h} mm above the floor ({from})', { h: comp.heightMm.toFixed(0), from: t(comp.heightFrom) }) : ''}</span>
      </span>
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
              {t('mouth above the cabinet bottom')} <Field value={c.portHeightAboveBottom} onCommit={(v) => setC({ portHeightAboveBottom: v })} ariaLabel={t('mouth above the cabinet bottom')} /> mm
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
      <p className="derived">{comp?.proposalNote} · {t('free: gain and delay; fixed: 0° or 180°')}</p>
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
          <button type="button" disabled={!canAccept} onClick={p.onAccept} title={canAccept ? '' : t('needs: the set-up stated, a branch, a stated "valid from", and a reason when there are flags')}>
            {r.flags.length > 0 ? t('Accept anyway, with reason…') : t('Accept merge')}
          </button>{' '}
          <button type="button" onClick={p.onExport}>
            {t('Export session…')}
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Charts(p: { comp: Computed | null; bare: Computed | null; reflectionModel: boolean; setReflectionModel: (v: boolean) => void; sd: number | null; targetFromHz: number | null }) {
  const comp = p.comp;
  const r = comp?.result;
  const inp = comp?.input;
  if (!r || !inp || !comp.fit || !comp.splice) return <div className="nfm-charts" />;
  const grid = r.freq;
  const inBand = (lo: number, hi: number) => grid.map((f) => f >= lo && f <= hi);
  const mask = inBand(20, 3000);
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
    { id: 'far', label: t('far field, gated as in the header'), color: '#7f8c8d', x: grid, y: norm(r.farGatedDb) },
    { id: 'res', label: t('result'), color: '#2c3e50', x: grid, y: norm(r.spl), width: 3 },
  ];
  // phase with the delay removed, relative to the direct arrival
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
  // ETC of the far field
  const x = inp.far.samples;
  const env = envelope(x);
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
            { from: taperLo, to: winHi, color: '#27ae60', opacity: 0.22 },
          ]}
          xMarkers={[
            ...found.map((e) => ({ x: e.afterDirectMs, label: `${e.afterDirectMs.toFixed(2)}`, color: e.modelled ? '#27ae60' : '#c0392b' })),
            ...predicted.map((e) => ({ x: e.ms, label: `▲ ${e.label}`, color: '#8e44ad' })),
          ]}
        />
        <ul className="nfm-echoes">
          {found.map((e) => (
            <li key={e.afterDirectMs}>
              {e.afterDirectMs.toFixed(2)} ms · {e.levelDb.toFixed(1)} dB · {e.insideGate ? t('inside the window') : t('outside the window')}
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

function ExportPanel(p: { session: LoadedSession; accepted: Record<MergeRole, AcceptedSource[]>; rig: RigSetup; measuredObjectNote: string; targetNote: string; onClose: () => void }) {
  const merges = (['low', 'mid', 'high'] as const).flatMap((role) => p.accepted[role].filter((a) => a.session === p.session.name).map((a) => ({ source: a.source, fileName: a.name, text: a.text })));
  const pkg = exportPackage({ session: p.session, merges, rig: p.rig, measuredObjectNote: p.measuredObjectNote, targetNote: p.targetNote, madeOn: new Date().toISOString().slice(0, 10) });
  const download = () => {
    const zip = zipStore(pkg.map((f) => ({ name: `${p.session.name}/${f.name}`, data: f.data })));
    const url = URL.createObjectURL(new Blob([zip.slice().buffer], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.session.name}_merge_v2.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const head = merges[0]?.text.split('\n').filter((l) => l.startsWith('*')).join('\n') ?? '';
  return (
    <div className="nfm-export" role="dialog" aria-label={t('Export session')}>
      <h4>{t('Export session “{s}”', { s: p.session.name })}</h4>
      <p className="nfm-warn">{t('Baffle step and diffraction are in these files (full space): do not also switch on the diffraction tool in VituixCAD. Below the splice point it is the near field plus a model.')}</p>
      <p>
        {t('Phase convention')}{' '}
        <select defaultValue="measured" aria-label={t('Phase convention')}>
          <option value="measured">{t('as measured: t = 0 on the session time base')}</option>
          <option value="ref" disabled>
            {t('at a reference point (fase 4)')}
          </option>
          <option value="minphase" disabled>
            {t('minimum phase, with a warning (fase 4)')}
          </option>
        </select>{' '}
        {t('Grid')}{' '}
        <select defaultValue="orig" aria-label={t('Grid')}>
          <option value="orig">{t('as merged (log, 48/oct)')}</option>
          <option value="48" disabled>
            {t('log 1/48 octave (fase 4)')}
          </option>
        </select>
      </p>
      <ul>
        {pkg.map((f) => (
          <li key={f.name}>{f.name}</li>
        ))}
      </ul>
      {merges.length === 0 && <p className="derived alert">{t('Nothing accepted from this session yet.')}</p>}
      {head && <pre className="nfm-head">{head}</pre>}
      <button type="button" disabled={merges.length === 0} onClick={download}>
        {t('Download package (.zip)')}
      </button>{' '}
      <button type="button" onClick={p.onClose}>
        {t('Close')}
      </button>
    </div>
  );
}
