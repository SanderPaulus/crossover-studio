/**
 * UI-11 — "Your cabinet" as ONE form (22-11-2026).
 *
 * The cabinet fields were drawn three times: cards in guided, a ledger in expert (both in
 * `App.tsx`), and a third copy inside the merge tool's step 2 ("Your cabinet — what the merge
 * needs"). The third copy knew less than the other two — it showed a pair's spacing and
 * upper/lower member for every pair, while the driver card already knew that a pair in the
 * side walls does not stack — and that is how three renderings of one fact drift (A3g).
 *
 * Every field below is now ONE implementation. `App.tsx` composes them into its cards and
 * its ledger; `NfMergeTool.tsx` composes the ones the merge reads into its step 2. The
 * layout is the caller's (a row renderer, a label span); the control and what it writes is
 * not. No field has state of its own except the reference-point draft, which commits on
 * blur so that a half-typed height does not move every driver per keystroke.
 *
 * This file imports nothing from `engine2/` (the motor-boundary invariant) and reads no
 * measurement: it is the FORM, and the data lives in `CabinetState` (`src/lib/cabinetState.ts`).
 */
import { useState, type ReactNode } from 'react';
import { t } from '../lib/i18n.ts';
import type { BranchRole } from '../lib/driverSlots.ts';
import type { DriverFacing } from '../lib/cabinet.ts';
import type { CabinetDriver, CabinetState } from '../lib/cabinetState.ts';

export const CABINET_FORM_VERSION = 'cabinet-form/1.0';

export type SetCabinet = (f: (c: CabinetState) => CabinetState) => void;
/** How the caller lays out one row: a label, the fields, and an optional note beside or under them. */
export type CabinetRow = (label: string, fields: ReactNode, note?: ReactNode) => ReactNode;

/** Distance from the top of the front panel down to the reference point, or null while unknown. */
export const refFromTopBase = (cabinet: CabinetState): number | null => (Number(cabinet.refFromTopMm) > 0 ? Number(cabinet.refFromTopMm) : null);

/** The one impossibility the box fields can see: a reference point deeper than the baffle is tall. */
export const refDeeperThanBaffle = (cabinet: CabinetState): boolean =>
  Number(cabinet.baffleHeightMm) > 0 && Number(cabinet.refFromTopMm) > Number(cabinet.baffleHeightMm);

/**
 * The reference-point height: a DRAFT while focused, committed on blur or Enter (Esc discards).
 * Writing through per keystroke would move every driver on each digit typed — `applyRefFromTop`
 * shifts the stored positions so the below-top readings stay what the designer typed.
 */
export function RefTopField(p: { cabinet: CabinetState; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      step={5}
      value={draft ?? p.cabinet.refFromTopMm}
      aria-label={t('Reference point, below top')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const v = draft;
        setDraft(null);
        p.onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      title={t('How far below the top of the front panel the reference point sits. Correcting this moves the REFERENCE MARKER only — drivers keep the below-top positions you typed.')}
    />
  );
}

/**
 * THE BOX: which driver the mic was aimed at, the front panel, the reference point. Three
 * rows, laid out by the caller. `showAboveFloor` is off in the merge tool, whose rig states
 * the cabinet bottom above the floor itself; `showMicAimed` is off where the caller has no
 * use for the origin.
 */
export function CabinetBoxFields(p: {
  cabinet: CabinetState;
  setCabinet: SetCabinet;
  onCommitRefTop: (v: string) => void;
  row: CabinetRow;
  showMicAimed?: boolean;
  showAboveFloor?: boolean;
  /** 'narrow' — one field per row (the expert ledger, a 15 rem column); 'wide' (default) — width × height and
   *  below-top · above-floor on one row each (the cards, the merge tool). Layout only: the same controls. */
  layout?: 'wide' | 'narrow';
  /** What the baffle width implies, as the app derives it (the baffle step) — a note on the front-panel row. */
  frontNote?: ReactNode;
}) {
  const { cabinet, setCabinet } = p;
  /* Each control carries its own token (`value={cabinet.…}`): the two drift guards file them by it. */
  const cab = (k: 'baffleWidthMm' | 'baffleHeightMm' | 'refHeightMm') => (e: { target: { value: string } }) => setCabinet((c) => ({ ...c, [k]: e.target.value }));
  const mis = refDeeperThanBaffle(cabinet);
  const narrow = p.layout === 'narrow';
  // THE CONTROLS, once each; the two layouts below only place them.
  const width = <input type="number" min={0} step={10} value={cabinet.baffleWidthMm} aria-label={t('front panel width')} onChange={cab('baffleWidthMm')} />;
  const height = <input type="number" min={0} step={10} value={cabinet.baffleHeightMm} aria-label={t('front panel height')} onChange={cab('baffleHeightMm')} />;
  const refTop = <RefTopField cabinet={cabinet} onCommit={p.onCommitRefTop} />;
  const refFloor = <input type="number" min={0} step={10} value={cabinet.refHeightMm} aria-label={t('Reference point, above floor')} onChange={cab('refHeightMm')} />;
  const misNote = mis ? (
    <strong className="alert">
      {t('the reference point cannot sit {ref} mm below the top of a {h} mm front panel — one of the two is the other field', { ref: cabinet.refFromTopMm, h: cabinet.baffleHeightMm })}
    </strong>
  ) : undefined;
  return (
    <>
      {(p.showMicAimed ?? true) &&
        p.row(
          t('Mic aimed at'),
          <select
            value={cabinet.refDriver}
            aria-label={t('Mic aimed at')}
            onChange={(e) => setCabinet((c) => ({ ...c, refDriver: e.target.value as '' | BranchRole }))}
          >
            <option value="">{t('another spot on the baffle')}</option>
            <option value="high">{t('the tweeter')}</option>
            <option value="mid">{t('the midrange')}</option>
            <option value="low">{t('the woofer')}</option>
          </select>,
          cabinet.refDriver ? t('that driver is 0,0 — you do not type its offset') : '',
        )}
      {narrow ? (
        <>
          {p.row(t('Front panel width'), <>{width} mm</>, p.frontNote)}
          {p.row(t('Front panel height'), <>{height} mm</>)}
          {p.row(t('Reference point, below top'), <>{refTop} mm</>, misNote)}
          {(p.showAboveFloor ?? true) && p.row(t('Reference point, above floor'), <>{refFloor} mm</>)}
        </>
      ) : (
        <>
          {p.row(
            t('Front panel'),
            <>
              {t('width') + ' '}
              {width}
              {' × ' + t('height') + ' '}
              {height} mm
            </>,
            p.frontNote,
          )}
          {p.row(
            t('Reference point'),
            <>
              {refTop} {t('mm below the top')}
              {(p.showAboveFloor ?? true) && (
                <>
                  {' · '}
                  {refFloor} {t('mm above the floor')}
                </>
              )}
            </>,
            misNote,
          )}
        </>
      )}
    </>
  );
}

/** One driver's patch, the way the driver card writes it. */
export type SetDriver = (patch: Partial<CabinetDriver>) => void;

/** HOW MANY identical drivers make up this way, and — with more than one — how far apart. */
export function DriverCountFields(p: { d: CabinetDriver; set: SetDriver }) {
  const { d, set } = p;
  return (
    <>
      {'× '}
      <input type="number" min={1} step={1} placeholder="1" value={d.count} aria-label={t('how many')} onChange={(e) => set({ count: e.target.value })} />
      {Number(d.count) > 1 ? ' ' + t('drivers, spaced') + ' ' : ' ' + t('driver')}
      {Number(d.count) > 1 && (
        <>
          <input type="number" min={0} step={1} value={d.spacingMm} aria-label={t('spacing of the pair')} onChange={(e) => set({ spacingMm: e.target.value })} />
          {' ' + t('mm apart')}
        </>
      )}
    </>
  );
}

/**
 * WHERE the driver's centre sits on the front panel, as a ruler measures it: across from the
 * centre line, and DOWN from the top. Storage keeps the reference-point origin (every
 * geometry function, the project format and the tests are written in it), so this is a pure
 * input conversion: down-from-top = refFromTop − y. Without a reference height there is
 * nothing to convert with, and the field falls back to the raw y with the unit saying so.
 * The reference driver IS the point: 0,0 is a consequence, not an input, and is said.
 */
export function DriverPositionFields(p: { cabinet: CabinetState; role: BranchRole; set: SetDriver }) {
  const { cabinet, role, set } = p;
  const d = cabinet.drivers[role];
  const fromTopBase = refFromTopBase(cabinet);
  if (cabinet.refDriver === role) {
    const top = Number(cabinet.refFromTopMm);
    const floor = Number(cabinet.refHeightMm);
    const bits = [top > 0 ? t('{mm} mm below the top', { mm: Math.round(top) }) : '', floor > 0 ? t('{mm} mm above the floor', { mm: Math.round(floor) }) : ''].filter(Boolean);
    return (
      <em>
        {t('0, 0 — the mic was aimed here, so this driver defines the origin')}
        {bits.length > 0 ? ` (${bits.join(', ')})` : ''}
      </em>
    );
  }
  return (
    <>
      <span className="cd-pre">x</span>
      <input type="number" step={5} placeholder="0" value={d.xMm} aria-label={t('x from the centre line')} onChange={(e) => set({ xMm: e.target.value })} />
      {fromTopBase !== null ? ' ' + t('mm from the centre line') + ' · ' : ' mm · y '}
      <input
        type="number"
        step={5}
        placeholder="0"
        aria-label={t('below the top')}
        value={fromTopBase !== null ? (d.yMm.trim() === '' ? '' : String(Math.round((fromTopBase - Number(d.yMm)) * 10) / 10)) : d.yMm}
        onChange={(e) => {
          if (fromTopBase === null) {
            set({ yMm: e.target.value });
            return;
          }
          const v = e.target.value;
          if (v.trim() === '' || !Number.isFinite(Number(v))) {
            set({ yMm: v.trim() === '' ? '' : d.yMm });
            return;
          }
          set({ yMm: String(Math.round((fromTopBase - Number(v)) * 10) / 10) });
        }}
      />
      {fromTopBase !== null ? ' ' + t('mm below the top') : ' mm'}
      <span className="cd-hint">
        {fromTopBase !== null
          ? t('as a ruler measures it — across from the centre line, down from the top of the front panel')
          : t('from the reference point · y up — add the reference height on the cabinet step to measure from the top instead')}
      </span>
    </>
  );
}

/**
 * WHICH PANEL the driver radiates from, how far its acoustic centre sits behind it, its tilt,
 * and — for a pair that does not fire forward — whether the two sit on opposing panels. Side-
 * firing woofers are an ordinary design; without this the app judges the driver against a
 * front baffle it is not on, and the merge tool asks a pair in the side walls which of the two
 * is the UPPER one.
 */
export function DriverMountingFields(p: { d: CabinetDriver; set: SetDriver }) {
  const { d, set } = p;
  return (
    <>
      <span className="cd-pre" />
      <select value={d.facing} aria-label={t('Mounting')} onChange={(e) => set({ facing: e.target.value as DriverFacing })}>
        <option value="front">{t('fires forward')}</option>
        <option value="rear">{t('fires backward')}</option>
        <option value="left">{t('fires left')}</option>
        <option value="right">{t('fires right')}</option>
        <option value="up">{t('fires up')}</option>
        <option value="down">{t('fires down')}</option>
      </select>
      {' · ' + t('depth') + ' '}
      <input type="number" min={0} step={5} placeholder="0" value={d.depthMm} aria-label={t('depth')} onChange={(e) => set({ depthMm: e.target.value })} />
      {' mm · ' + t('tilt') + ' '}
      <input type="number" step={1} placeholder="0" value={d.tiltDeg} aria-label={t('tilt')} onChange={(e) => set({ tiltDeg: e.target.value })} />
      {'°'}
      {Number(d.count) > 1 && d.facing !== 'front' && (
        <label
          className="cd-inline-check"
          title={t('These drivers sit on BOTH opposing panels, firing away from each other — the force-cancelling arrangement side-mounted woofers are normally built in. They then have two different true angles, and a sweep measures their sum.')}
        >
          <input type="checkbox" checked={d.opposed} onChange={(e) => set({ opposed: e.target.checked })} /> {t('opposed pair')}
        </label>
      )}
      <span className="cd-hint">
        {d.facing === 'front'
          ? t('acoustic centre behind the baffle — a flush-mounted cone still sits its cone depth back · tilt + = aimed up')
          : t('acoustic centre from the front, along the cabinet · tilt + = aimed up')}
      </span>
    </>
  );
}

/** S_d of ONE driver, cm² (the datasheet number; a pair still beams as one cone each). */
export function DriverSdField(p: { value: string; onChange: (v: string) => void; ariaLabel?: string }) {
  const sd = p.value;
  return <input type="number" min={0} step={1} value={sd} aria-label={p.ariaLabel ?? 'Sd'} onChange={(e) => p.onChange(e.target.value)} />;
}
