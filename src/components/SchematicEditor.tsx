import { useMemo, useRef, useState } from 'react';
import type { VxpPart } from '../lib/parsers/vxp.ts';
import {
  addPart,
  addWire,
  deletePart,
  movePart,
  partParam,
  rotatePart,
  setAllLocks,
  setPartParam,
  setPartProps,
  type PlaceableType,
  type Pt,
} from '../lib/schematicEdit.ts';
import { estimateCoilDcr } from '../lib/netlistEdit.ts';
import {
  catalogSeries,
  formatCatalogPart,
  nearestParts,
  type CatalogKind,
  type CatalogPart,
} from '../lib/catalog.ts';

/** Display-unit ↔ SI mapping per catalog kind (part params store display units). */
const CAT_UNIT: Record<CatalogKind, { unit: string; toSi: number }> = {
  L: { unit: 'mH', toSi: 1e-3 },
  C: { unit: 'uF', toSi: 1e-6 },
  R: { unit: 'Ω', toSi: 1 },
};
import { junctionsOf, PartGlyph, PADDING, px, S } from './Schematic.tsx';

/**
 * Drag & drop schematic editor (step 6, phase 2). The schematic IS the
 * network: parts connect where their grid points coincide (VituixCAD
 * semantics), and the parent derives the solvable netlist from it. Dragging
 * previews locally and commits on drop, so the solver runs once per edit.
 */

type Tool = { kind: 'select' } | { kind: 'wire' } | { kind: 'place'; type: PlaceableType };

interface Props {
  parts: readonly VxpPart[];
  models: readonly string[];
  onChange: (parts: VxpPart[]) => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
}

const MIN_W = 46; // grid units the canvas at least shows
const MIN_H = 24;

export default function SchematicEditor({ parts, models, onChange, onUndo, canUndo, onRedo, canRedo }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [sel, setSel] = useState<number | null>(null);
  const [wireStart, setWireStart] = useState<Pt | null>(null);
  const [hoverPt, setHoverPt] = useState<Pt | null>(null);
  const [drag, setDrag] = useState<{ index: number; from: Pt; dx: number; dy: number } | null>(null);
  /** Preferred catalog series per component kind ('all' = whole catalog). */
  const [prefSeries, setPrefSeries] = useState<Record<CatalogKind, string>>({
    L: 'all',
    C: 'all',
    R: 'all',
  });

  // Live view: during a drag, preview the move without committing upstream.
  const view = useMemo(
    () => (drag ? movePart(parts, drag.index, drag.dx, drag.dy) : [...parts]),
    [parts, drag],
  );

  const { width, height } = useMemo(() => {
    const pts = view.flatMap((p) => p.wires);
    const maxX = Math.max(MIN_W, ...pts.map((p) => p.x)) + 6;
    const maxY = Math.max(MIN_H, ...pts.map((p) => p.y)) + 4;
    return { width: maxX * S + PADDING * 2, height: maxY * S + PADDING * 2 };
  }, [view]);

  const MIN0: Pt = { x: 0, y: 0 };

  const gridPt = (e: React.PointerEvent): Pt => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round((e.clientX - rect.left - PADDING) / S)),
      y: Math.max(0, Math.round((e.clientY - rect.top - PADDING) / S)),
    };
  };

  function onBackgroundDown(e: React.PointerEvent) {
    const g = gridPt(e);
    if (tool.kind === 'wire') {
      if (!wireStart) {
        setWireStart(g);
      } else {
        onChange(addWire(parts, wireStart, g));
        setWireStart(null);
      }
      return;
    }
    if (tool.kind === 'place') {
      const next = addPart(parts, tool.type, g, models[0]);
      onChange(next);
      setSel(next.length - 1);
      setTool({ kind: 'select' });
      return;
    }
    setSel(null);
  }

  function onPartDown(e: React.PointerEvent, index: number) {
    if (tool.kind !== 'select') return; // background handler covers wire/place
    e.stopPropagation();
    setSel(index);
    setDrag({ index, from: gridPt(e), dx: 0, dy: 0 });
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    if (tool.kind !== 'select') setHoverPt(gridPt(e));
    if (drag) {
      const g = gridPt(e);
      setDrag({ ...drag, dx: g.x - drag.from.x, dy: g.y - drag.from.y });
    }
  }

  function onUp() {
    if (drag && (drag.dx !== 0 || drag.dy !== 0)) {
      onChange(movePart(parts, drag.index, drag.dx, drag.dy));
    }
    setDrag(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Standard undo/redo chords: Cmd/Ctrl+Z, Shift for redo (Ctrl+Y too).
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) {
      e.preventDefault();
      if (e.key === 'y' || e.shiftKey) {
        if (canRedo) onRedo();
      } else if (canUndo) {
        onUndo();
      }
      return;
    }
    if (e.key === 'Escape') {
      setTool({ kind: 'select' });
      setWireStart(null);
      setSel(null);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null) {
      e.preventDefault();
      onChange(deletePart(parts, sel));
      setSel(null);
    }
    if (e.key === 'r' && sel !== null && canRotate(parts[sel])) {
      onChange(rotatePart(parts, sel));
    }
  }

  const selPart = sel !== null ? parts[sel] : null;
  const catKind: CatalogKind | null =
    selPart?.type === 'Inductor' ? 'L'
    : selPart?.type === 'Capacitor' ? 'C'
    : selPart?.type === 'Resistor' ? 'R'
    : null;
  const junctions = useMemo(() => junctionsOf(view), [view]);

  const toolBtn = (label: string, t: Tool, title: string) => (
    <button
      type="button"
      className={sameTool(tool, t) ? 'active' : ''}
      onClick={() => {
        setTool(sameTool(tool, t) ? { kind: 'select' } : t);
        setWireStart(null);
      }}
      title={title}
    >
      {label}
    </button>
  );

  return (
    <div className="sch-editor" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="row sch-toolbar">
        {toolBtn('Select / drag', { kind: 'select' }, 'Click to select, drag to move (wires follow)')}
        {toolBtn('Draw wire', { kind: 'wire' }, 'Click two points; wires connect at their points')}
        <span className="sch-toolbar-sep" />
        {toolBtn('+ L', { kind: 'place', type: 'Inductor' }, 'Place an inductor (with DCR)')}
        {toolBtn('+ C', { kind: 'place', type: 'Capacitor' }, 'Place a capacitor (with ESR)')}
        {toolBtn('+ R', { kind: 'place', type: 'Resistor' }, 'Place a resistor')}
        {toolBtn('+ Driver', { kind: 'place', type: 'Driver' }, 'Place a driver (measured Z)')}
        {toolBtn('+ Gen', { kind: 'place', type: 'Generator' }, 'Place a generator')}
        {toolBtn('+ Gnd', { kind: 'place', type: 'Ground' }, 'Place a ground symbol')}
        <span className="sch-toolbar-sep" />
        <button
          type="button"
          onClick={() => onChange(setAllLocks(parts, true))}
          title="Lock every component — the component optimizer may change none of them"
        >
          🔒 all
        </button>
        <button
          type="button"
          onClick={() => onChange(setAllLocks(parts, false))}
          title="Unlock every component — the component optimizer may change all of them"
        >
          🔓 all
        </button>
        <span className="sch-toolbar-sep" />
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo the last edit (Cmd/Ctrl+Z)">
          Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo the undone edit (Cmd/Ctrl+Shift+Z)">
          Redo
        </button>
        <span className="derived">
          {tool.kind === 'wire'
            ? wireStart
              ? 'click the end point'
              : 'click the start point'
            : tool.kind === 'place'
              ? 'click to place'
              : 'Esc = cancel · Del = remove · R = rotate'}
        </span>
      </div>
      <div className="schematic-scroll">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className={`sch-canvas sch-tool-${tool.kind}`}
          onPointerDown={onBackgroundDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          role="application"
          aria-label="Schematic editor"
        >
          <defs>
            <pattern id="sch-grid" width={S} height={S} patternUnits="userSpaceOnUse" x={PADDING} y={PADDING}>
              <circle cx={0} cy={0} r={1} className="sch-grid-dot" />
            </pattern>
          </defs>
          <rect x={0} y={0} width={width} height={height} fill="url(#sch-grid)" />
          {view.map((p, i) => (
            <g key={i} className={i === sel ? 'sch-selected' : undefined}>
              <PartGlyph part={p} min={MIN0} />
            </g>
          ))}
          {junctions.map((j, i) => {
            const c = px(j, MIN0);
            return <circle key={i} cx={c.x} cy={c.y} r={3} className="sch-junction" />;
          })}
          {/* hit targets on top */}
          {view.map((p, i) => {
            if (p.wires.length === 0) return null;
            if (p.wires.length === 1) {
              const c = px(p.wires[0], MIN0);
              return (
                <circle
                  key={i}
                  cx={c.x}
                  cy={c.y}
                  r={10}
                  className="sch-hit"
                  onPointerDown={(e) => onPartDown(e, i)}
                />
              );
            }
            const d = p.wires
              .map((w, k) => `${k === 0 ? 'M' : 'L'}${px(w, MIN0).x},${px(w, MIN0).y}`)
              .join('');
            return (
              <path key={i} d={d} className="sch-hit" onPointerDown={(e) => onPartDown(e, i)} />
            );
          })}
          {/* wire-drawing feedback */}
          {wireStart && hoverPt && tool.kind === 'wire' && (
            <path
              d={`M${px(wireStart, MIN0).x},${px(wireStart, MIN0).y}L${px({ x: hoverPt.x, y: wireStart.y }, MIN0).x},${px({ x: hoverPt.x, y: wireStart.y }, MIN0).y}L${px(hoverPt, MIN0).x},${px(hoverPt, MIN0).y}`}
              className="sch-wire-preview"
            />
          )}
          {hoverPt && tool.kind !== 'select' && (
            <circle cx={px(hoverPt, MIN0).x} cy={px(hoverPt, MIN0).y} r={4} className="sch-cursor" />
          )}
        </svg>
      </div>
      {selPart && (
        <div className="row sch-inspector">
          <strong>
            {selPart.partId ?? selPart.type}
            {selPart.type === 'Wire' ? 'Wire' : ''}
          </strong>
          {selPart.type === 'Inductor' && (
            <>
              <ParamField parts={parts} index={sel!} name="L" unit="mH" label="L (mH)" onChange={onChange} />
              <ParamField parts={parts} index={sel!} name="DCR" unit="Ω" label="DCR (Ω)" onChange={onChange} />
              <button
                type="button"
                title="Estimate DCR for a 1.4 mm air-core coil of this value"
                onClick={() =>
                  onChange(
                    setPartParam(
                      parts,
                      sel!,
                      'DCR',
                      Number(estimateCoilDcr((partParam(selPart, 'L') ?? 0) * 1e-3).toPrecision(4)),
                      'Ω',
                    ),
                  )
                }
              >
                auto DCR
              </button>
            </>
          )}
          {selPart.type === 'Capacitor' && (
            <>
              <ParamField parts={parts} index={sel!} name="C" unit="uF" label="C (µF)" onChange={onChange} />
              <ParamField parts={parts} index={sel!} name="ESR" unit="Ω" label="ESR (Ω)" onChange={onChange} />
            </>
          )}
          {selPart.type === 'Resistor' && (
            <ParamField parts={parts} index={sel!} name="R" unit="Ω" label="R (Ω)" onChange={onChange} />
          )}
          {selPart.type === 'Generator' && (
            <>
              <ParamField parts={parts} index={sel!} name="Eg" unit="V" label="Eg (V)" onChange={onChange} />
              <ParamField parts={parts} index={sel!} name="Rg" unit="Ω" label="Rg (Ω)" onChange={onChange} />
            </>
          )}
          {selPart.type === 'Driver' && (
            <>
              <label>
                model{' '}
                <select
                  value={selPart.model ?? ''}
                  onChange={(e) => onChange(setPartProps(parts, sel!, { model: e.target.value }))}
                >
                  {[...new Set([selPart.model ?? '', ...models])].filter(Boolean).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={selPart.inverted ?? false}
                  onChange={(e) => onChange(setPartProps(parts, sel!, { inverted: e.target.checked }))}
                />{' '}
                invert
              </label>
            </>
          )}
          {catKind && (
            <span className="cat-suggest">
              <select
                value={prefSeries[catKind]}
                onChange={(e) =>
                  setPrefSeries((prev) => ({ ...prev, [catKind]: e.target.value }))
                }
                title="Product series (brand choice) — suggestions come from this series"
              >
                <option value="all">All series</option>
                {catalogSeries(catKind).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.brand} {s.series}
                  </option>
                ))}
              </select>
              {(() => {
                const si = (partParam(selPart, catKind) ?? 0) * CAT_UNIT[catKind].toSi;
                const scope = prefSeries[catKind] === 'all' ? undefined : prefSeries[catKind];
                const applyCatalogPart = (p: CatalogPart) => {
                  const u = CAT_UNIT[p.kind];
                  const withVal = setPartParam(
                    parts,
                    sel!,
                    p.kind,
                    Number((p.value / u.toSi).toPrecision(6)),
                    u.unit,
                  );
                  const withRes =
                    p.kind === 'R'
                      ? withVal
                      : setPartParam(withVal, sel!, p.kind === 'L' ? 'DCR' : 'ESR', p.seriesR, 'Ω');
                  // Stamp the chosen SKU so the BOM attributes THIS part —
                  // otherwise it falls back to value/ESR and a same-value
                  // series swap (or any resistor swap) stays invisible.
                  onChange(setPartProps(withRes, sel!, { catalog: p.id }));
                };
                const candidates = nearestParts(catKind, si, 8, scope);
                // Quick-pick buttons: one per DISTINCT value (first = best
                // variant), max 3 — the full variant list (gauges, brands,
                // prices) lives in the dropdown so the row never grows wide
                // (Sanders zijwaarts-scrollen-klacht + dropdown-idee).
                // Dedupe on the DISPLAY precision: catalog parts of the same
                // nominal value can differ in float dust across series.
                const seen = new Set<number>();
                const quick: CatalogPart[] = [];
                for (const p of candidates) {
                  const key = Number(p.value.toPrecision(3));
                  if (seen.has(key)) continue;
                  seen.add(key);
                  quick.push(p);
                  if (quick.length === 3) break;
                }
                return (
                  <>
                    <select
                      className="cat-parts"
                      value=""
                      onChange={(e) => {
                        const p = candidates.find((c) => c.id === e.target.value);
                        if (p) applyCatalogPart(p);
                      }}
                      title="Every nearby catalog part in this scope — all values, gauge variants and prices; picking one applies it"
                    >
                      <option value="" disabled>
                        all {candidates.length} parts…
                      </option>
                      {candidates.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.brand} · {formatCatalogPart(p)}
                        </option>
                      ))}
                    </select>
                    {quick.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        title={`${p.brand} ${p.series}${p.kind === 'R' ? '' : ` — apply value + ${p.kind === 'L' ? 'DCR' : 'ESR'}`}`}
                        onClick={() => applyCatalogPart(p)}
                      >
                        {formatCatalogPart(p)}
                      </button>
                    ))}
                  </>
                );
              })()}
            </span>
          )}
          {catKind && (
            <label title="Locked: the component optimizer keeps this value (e.g. a part you already own)">
              <input
                type="checkbox"
                checked={selPart.locked ?? false}
                onChange={(e) => onChange(setPartProps(parts, sel!, { locked: e.target.checked }))}
              />{' '}
              🔒 lock
            </label>
          )}
          {canRotate(selPart) && (
            <button
              type="button"
              onClick={() => onChange(rotatePart(parts, sel!))}
              title="Rotate 90° (shortcut: R) — terminals get stub wires, connections never break"
            >
              Rotate
            </button>
          )}
          <button
            type="button"
            className="nl-remove"
            onClick={() => {
              onChange(deletePart(parts, sel!));
              setSel(null);
            }}
            title="Remove this part (shortcut: Del) — its wires stay"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function canRotate(p: VxpPart): boolean {
  return p.type !== 'Wire' && p.type !== 'Ground' && p.wires.length >= 2;
}

function sameTool(a: Tool, b: Tool): boolean {
  return a.kind === b.kind && (a.kind !== 'place' || a.type === (b as { type: PlaceableType }).type);
}

function ParamField({
  parts,
  index,
  name,
  unit,
  label,
  onChange,
}: {
  parts: readonly VxpPart[];
  index: number;
  name: string;
  unit: string;
  label: string;
  onChange: (parts: VxpPart[]) => void;
}) {
  const value = partParam(parts[index], name) ?? 0;
  return (
    <label className="inline-num">
      {label}
      <input
        type="number"
        min={0}
        step={name === 'DCR' || name === 'ESR' || name === 'Rg' ? 0.01 : 0.1}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v >= 0) onChange(setPartParam(parts, index, name, v, unit));
        }}
      />
    </label>
  );
}
