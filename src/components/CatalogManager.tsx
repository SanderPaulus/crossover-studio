import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import type { CatalogKind, CatalogPart, CatalogSeries, CatalogTier } from '../lib/catalog';
import { customCatalogParts, customSeries } from '../lib/catalog';
import {
  formatSkuValue,
  fromDisplayValue,
  gridShadowNote,
  managedSeries,
  removeSeries,
  removeSku,
  seriesGridError,
  skuError,
  toDisplayValue,
  unitFor,
  upsertSeries,
  upsertSku,
} from '../lib/catalogManager';

interface Props {
  onClose: () => void;
  /** Commit the edited catalog (App persists + activates it). */
  onSave: (series: CatalogSeries[], parts: CatalogPart[]) => void;
}

/** SKU form state: numerics as strings so typing "0." works. */
interface SkuDraft {
  originalId?: string;
  id: string;
  brand: string;
  series: string;
  kind: CatalogKind;
  value: string;
  seriesR: string;
  wireMm: string;
  powerW: string;
  priceEur: string;
  tier: CatalogTier | '';
}

/** Grid-series form state. */
interface SeriesDraft {
  originalId?: string;
  id: string;
  brand: string;
  series: string;
  kind: CatalogKind;
  rangeMin: string;
  rangeMax: string;
  gauges: string;
  esr: string;
  powerW: string;
  eSeries: 'E12' | 'E24' | '';
  tier: CatalogTier | '';
  basePrice: string;
  costFactor: string;
  dcrFactor: string;
}

const emptySkuDraft = (kind: CatalogKind = 'C'): SkuDraft => ({
  id: '',
  brand: '',
  series: '',
  kind,
  value: '',
  seriesR: '',
  wireMm: '',
  powerW: '',
  priceEur: '',
  tier: '',
});

const toSkuDraft = (p: CatalogPart): SkuDraft => ({
  originalId: p.id,
  id: p.id,
  brand: p.brand,
  series: p.series,
  kind: p.kind,
  value: String(toDisplayValue(p.kind, p.value)),
  seriesR: String(p.seriesR),
  wireMm: p.wireMm !== undefined ? String(p.wireMm) : '',
  powerW: p.powerW !== undefined ? String(p.powerW) : '',
  priceEur: p.priceEur !== undefined ? String(p.priceEur) : '',
  tier: p.tier ?? '',
});

const emptySeriesDraft = (kind: CatalogKind = 'C'): SeriesDraft => ({
  id: '',
  brand: '',
  series: '',
  kind,
  rangeMin: '',
  rangeMax: '',
  gauges: '',
  esr: '',
  powerW: '',
  eSeries: '',
  tier: '',
  basePrice: '',
  costFactor: '',
  dcrFactor: '',
});

const toSeriesDraft = (s: CatalogSeries): SeriesDraft => ({
  originalId: s.id,
  id: s.id,
  brand: s.brand,
  series: s.series,
  kind: s.kind,
  rangeMin: String(toDisplayValue(s.kind, s.range[0])),
  rangeMax: String(toDisplayValue(s.kind, s.range[1])),
  gauges: s.gauges?.join(', ') ?? '',
  esr: s.esr !== undefined ? String(s.esr) : '',
  powerW: s.powerW !== undefined ? String(s.powerW) : '',
  eSeries: s.eSeries ?? '',
  tier: s.tier ?? '',
  basePrice: s.basePrice !== undefined ? String(s.basePrice) : '',
  costFactor: s.costFactor !== undefined ? String(s.costFactor) : '',
  dcrFactor: s.dcrFactor !== undefined ? String(s.dcrFactor) : '',
});

const num = (s: string): number | undefined => {
  if (s.trim() === '') return undefined;
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
};

/** Turn the SKU form back into a CatalogPart (NaN survives so skuError names
 *  the offending field instead of a silent drop). */
function fromSkuDraft(d: SkuDraft): CatalogPart {
  const value = num(d.value);
  const seriesR = num(d.seriesR);
  const wireMm = num(d.wireMm);
  const powerW = num(d.powerW);
  const priceEur = num(d.priceEur);
  return {
    id: d.id.trim(),
    brand: d.brand.trim(),
    series: d.series.trim(),
    kind: d.kind,
    value: value === undefined ? NaN : fromDisplayValue(d.kind, value),
    // Blank DCR/ESR falls back like the importer: estimate is better than 0.
    seriesR: seriesR ?? (d.kind === 'C' ? 0.02 : d.kind === 'R' ? 0 : NaN),
    ...(wireMm !== undefined ? { wireMm } : {}),
    ...(powerW !== undefined ? { powerW } : {}),
    ...(priceEur !== undefined ? { priceEur } : {}),
    ...(d.tier !== '' ? { tier: d.tier } : {}),
  };
}

function fromSeriesDraft(d: SeriesDraft): CatalogSeries {
  const lo = num(d.rangeMin);
  const hi = num(d.rangeMax);
  const gauges =
    d.gauges.trim() === ''
      ? undefined
      : d.gauges.split(/[,\s]+/).filter((g) => g !== '').map((g) => {
          const v = Number(g.replace(',', '.'));
          return Number.isFinite(v) ? v : NaN;
        });
  const esr = num(d.esr);
  const powerW = num(d.powerW);
  const basePrice = num(d.basePrice);
  const costFactor = num(d.costFactor);
  const dcrFactor = num(d.dcrFactor);
  return {
    id: d.id.trim(),
    brand: d.brand.trim(),
    series: d.series.trim(),
    kind: d.kind,
    range: [
      lo === undefined ? NaN : fromDisplayValue(d.kind, lo),
      hi === undefined ? NaN : fromDisplayValue(d.kind, hi),
    ],
    ...(gauges !== undefined ? { gauges } : {}),
    ...(esr !== undefined ? { esr } : {}),
    ...(powerW !== undefined ? { powerW } : {}),
    ...(d.eSeries !== '' ? { eSeries: d.eSeries } : {}),
    ...(d.tier !== '' ? { tier: d.tier } : {}),
    ...(basePrice !== undefined ? { basePrice } : {}),
    ...(costFactor !== undefined ? { costFactor } : {}),
    ...(dcrFactor !== undefined ? { dcrFactor } : {}),
  };
}

/**
 * In-app catalog manager: SKUs (exact parts) and grid series, both on a
 * staged draft. Nothing touches the live catalog until "Save" — closing
 * discards, like every other overlay. Editing a built-in series lands as an
 * override (same id, import semantics); removing the override reverts.
 */
export function CatalogManager({ onClose, onSave }: Props) {
  const [parts, setParts] = useState<CatalogPart[]>(() => [...customCatalogParts()]);
  const [custom, setCustom] = useState<CatalogSeries[]>(() => [...customSeries()]);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'skus' | 'series'>('skus');
  const [filterKind, setFilterKind] = useState<'all' | CatalogKind>('all');
  const [query, setQuery] = useState('');
  const [skuForm, setSkuForm] = useState<SkuDraft | null>(null);
  const [seriesForm, setSeriesForm] = useState<SeriesDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Every dismissal route (Esc, backdrop, Cancel) lands here, so the
  // unsaved-changes guard cannot be walked around.
  const close = () => {
    if (dirty && !window.confirm('Discard unsaved catalog changes?')) return;
    onClose();
  };

  const q = query.trim().toLowerCase();

  const skuRows = useMemo(() => {
    return parts
      .filter((p) => filterKind === 'all' || p.kind === filterKind)
      .filter(
        (p) =>
          q === '' ||
          p.id.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.series.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          a.kind.localeCompare(b.kind) ||
          a.brand.localeCompare(b.brand) ||
          a.series.localeCompare(b.series) ||
          a.value - b.value ||
          (a.wireMm ?? 0) - (b.wireMm ?? 0),
      );
  }, [parts, filterKind, q]);

  const seriesRows = useMemo(() => {
    return managedSeries(custom, parts)
      .filter((r) => filterKind === 'all' || r.series.kind === filterKind)
      .filter(
        (r) =>
          q === '' ||
          r.series.id.toLowerCase().includes(q) ||
          r.series.brand.toLowerCase().includes(q) ||
          r.series.series.toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          a.series.kind.localeCompare(b.series.kind) ||
          a.series.brand.localeCompare(b.series.brand) ||
          a.series.series.localeCompare(b.series.series),
      );
  }, [custom, parts, filterKind, q]);

  const priced = parts.filter((p) => p.priceEur !== undefined).length;
  const overrideCount = useMemo(
    () => managedSeries(custom, []).filter((r) => r.source !== 'builtin').length,
    [custom],
  );

  // Live warning while typing a NEW series' first SKU.
  const shadow = useMemo(() => {
    if (!skuForm || skuForm.brand.trim() === '' || skuForm.series.trim() === '') return null;
    return gridShadowNote(parts, {
      id: skuForm.originalId ?? skuForm.id,
      brand: skuForm.brand,
      series: skuForm.series,
    });
  }, [skuForm, parts]);

  function submitSkuForm() {
    if (!skuForm) return;
    const part = fromSkuDraft(skuForm);
    const err = skuError(part, parts, skuForm.originalId);
    if (err) {
      setFormError(err);
      return;
    }
    setParts((d) => upsertSku(d, part, skuForm.originalId));
    setDirty(true);
    setFormError(null);
    // Keep brand/series/kind: entering a series run is the common flow.
    setSkuForm({ ...emptySkuDraft(skuForm.kind), brand: skuForm.brand, series: skuForm.series, tier: skuForm.tier });
  }

  function submitSeriesForm() {
    if (!seriesForm) return;
    const s = fromSeriesDraft(seriesForm);
    const err = seriesGridError(s, custom, seriesForm.originalId);
    if (err) {
      setFormError(err);
      return;
    }
    setCustom((d) => upsertSeries(d, s, seriesForm.originalId));
    setDirty(true);
    setFormError(null);
    setSeriesForm(null);
  }

  function deleteSku(id: string) {
    setParts((d) => removeSku(d, id));
    setDirty(true);
    if (skuForm?.originalId === id) setSkuForm(null);
  }

  function deleteSeries(id: string) {
    setCustom((d) => removeSeries(d, id));
    setDirty(true);
    if (seriesForm?.originalId === id) setSeriesForm(null);
  }

  const openSkuForm = (d: SkuDraft) => {
    setSkuForm(d);
    setSeriesForm(null);
    setFormError(null);
  };
  const openSeriesForm = (d: SeriesDraft) => {
    setSeriesForm(d);
    setSkuForm(null);
    setFormError(null);
  };

  const rangeLabel = (s: CatalogSeries) =>
    `${toDisplayValue(s.kind, s.range[0])}–${toDisplayValue(s.kind, s.range[1])} ${unitFor(s.kind)}`;

  return (
    <Modal open onClose={close} label="Catalog manager" cardClass="targets-card catmgr-card">
      <div className="help-head">
        <div className="busy-title">🗂 Catalog manager</div>
        <div className="catmgr-views">
          <button
            type="button"
            className={view === 'skus' ? 'active' : ''}
            onClick={() => setView('skus')}
            title="Exact purchasable parts (values, DCR/ESR, prices)"
          >
            SKUs
          </button>
          <button
            type="button"
            className={view === 'series' ? 'active' : ''}
            onClick={() => setView('series')}
            title="Product-series definitions: value range, E-grid, gauges, price model — the generated grids"
          >
            Series
          </button>
        </div>
        <input
          type="search"
          className="help-search"
          placeholder={view === 'skus' ? 'Search SKU / brand / series…' : 'Search series / brand…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Esc pressed inside a type=search field never reaches the dialog
          // (verified), and this field holds focus on open — route it through
          // the same guarded close as every other dismissal.
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
          }}
          autoFocus
        />
        <select
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value as 'all' | CatalogKind)}
          title="Filter by component kind"
        >
          <option value="all">All kinds</option>
          <option value="L">L — coils</option>
          <option value="C">C — caps</option>
          <option value="R">R — resistors</option>
        </select>
        <button type="button" onClick={close} title="Close (Esc)" aria-label="Close the catalog manager">
          ✕
        </button>
      </div>

      <p className="sub">
        {view === 'skus' ? (
          <>
            {parts.length} exact SKUs · {priced} priced — edits stay in this panel until you save.
            {parts.length === 0 &&
              ' No imported catalog yet: add SKUs here or import a catalog file first.'}
          </>
        ) : (
          <>
            {seriesRows.length} series shown · {overrideCount} custom/override — a series is a value
            GRID (range × E-steps); editing a built-in saves an override with the same id, removing
            the override brings the built-in back.
          </>
        )}
      </p>

      <div className="catmgr-tablewrap">
        {view === 'skus' ? (
          <table className="scan-table catmgr-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Brand</th>
                <th>Series</th>
                <th>Value</th>
                <th title="Coil DCR / cap ESR (Ω)">DCR/ESR</th>
                <th title="Coil wire gauge (mm)">⌀ mm</th>
                <th>W</th>
                <th>€</th>
                <th>Tier</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {skuRows.map((p) => (
                <tr
                  key={p.id}
                  className={skuForm?.originalId === p.id ? 'editing' : ''}
                  onDoubleClick={() => openSkuForm(toSkuDraft(p))}
                >
                  <td>{p.id}</td>
                  <td>{p.brand}</td>
                  <td>{p.series}</td>
                  <td>{formatSkuValue(p.kind, p.value)}</td>
                  <td>{p.seriesR}</td>
                  <td>{p.wireMm ?? ''}</td>
                  <td>{p.powerW ?? ''}</td>
                  <td>{p.priceEur !== undefined ? p.priceEur.toFixed(2) : '—'}</td>
                  <td>{p.tier ?? ''}</td>
                  <td className="catmgr-actions">
                    <button
                      type="button"
                      onClick={() => openSkuForm(toSkuDraft(p))}
                      title="Edit this SKU (or double-click the row)"
                    >
                      ✎
                    </button>
                    <button type="button" onClick={() => deleteSku(p.id)} title="Remove this SKU">
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {skuRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="sub">
                    {parts.length === 0 ? 'No SKUs yet.' : 'Nothing matches the filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="scan-table catmgr-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Brand</th>
                <th>Series</th>
                <th title="Value range of the generated grid">Range</th>
                <th title="Value grid steps">E</th>
                <th title="Coil gauges (mm) / cap ESR (Ω) / resistor power (W)">Phys</th>
                <th title="Price model: € = base + factor × value (SI)">€ model</th>
                <th>Tier</th>
                <th title="built-in = as shipped · override = your edit of a built-in · custom = your own series">Source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {seriesRows.map((r) => {
                const s = r.series;
                return (
                  <tr
                    key={s.id}
                    className={seriesForm?.originalId === s.id ? 'editing' : ''}
                    onDoubleClick={() => openSeriesForm(toSeriesDraft(s))}
                  >
                    <td>{s.id}</td>
                    <td>{s.brand}</td>
                    <td>{s.series}</td>
                    <td>{rangeLabel(s)}</td>
                    <td>{s.eSeries ?? (s.kind === 'L' ? 'E12' : 'E24')}</td>
                    <td>
                      {s.kind === 'L' && `⌀ ${s.gauges?.join('/') ?? ''}${s.dcrFactor !== undefined ? ` · dcr×${s.dcrFactor}` : ''}`}
                      {s.kind === 'C' && (s.esr !== undefined ? `esr ${s.esr}` : '')}
                      {s.kind === 'R' && (s.powerW !== undefined ? `${s.powerW} W` : '')}
                    </td>
                    <td>
                      {s.basePrice !== undefined ? `${s.basePrice}${s.costFactor ? ` + ${s.costFactor}·v` : ''}` : '—'}
                    </td>
                    <td>{s.tier ?? ''}</td>
                    <td>
                      {r.source}
                      {r.shadowedBy > 0 && (
                        <span title={`${r.shadowedBy} exact SKUs cover this series — they shadow the grid, so grid edits only matter once those SKUs are gone`}>
                          {' '}· ⛱{r.shadowedBy}
                        </span>
                      )}
                    </td>
                    <td className="catmgr-actions">
                      <button
                        type="button"
                        onClick={() => openSeriesForm(toSeriesDraft(s))}
                        title={r.source === 'builtin' ? 'Edit — saves as an override of the built-in' : 'Edit this series'}
                      >
                        ✎
                      </button>
                      {r.source === 'override' && (
                        <button type="button" onClick={() => deleteSeries(s.id)} title="Revert to the built-in definition">
                          ↩
                        </button>
                      )}
                      {r.source === 'custom' && (
                        <button type="button" onClick={() => deleteSeries(s.id)} title="Remove this series">
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {seriesRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="sub">
                    Nothing matches the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {view === 'skus' && skuForm && (
        <form
          className="catmgr-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitSkuForm();
          }}
        >
          <div className="catmgr-grid">
            <label>
              SKU id
              <input
                value={skuForm.id}
                onChange={(e) => setSkuForm({ ...skuForm, id: e.target.value })}
                placeholder="JAZ-CC-100"
              />
            </label>
            <label>
              Brand
              <input value={skuForm.brand} onChange={(e) => setSkuForm({ ...skuForm, brand: e.target.value })} />
            </label>
            <label>
              Series
              <input value={skuForm.series} onChange={(e) => setSkuForm({ ...skuForm, series: e.target.value })} />
            </label>
            <label>
              Kind
              <select
                value={skuForm.kind}
                onChange={(e) => setSkuForm({ ...skuForm, kind: e.target.value as CatalogKind })}
              >
                <option value="L">L — coil</option>
                <option value="C">C — cap</option>
                <option value="R">R — resistor</option>
              </select>
            </label>
            <label>
              Value ({unitFor(skuForm.kind)})
              <input value={skuForm.value} onChange={(e) => setSkuForm({ ...skuForm, value: e.target.value })} />
            </label>
            <label>
              {skuForm.kind === 'L' ? 'DCR (Ω)' : skuForm.kind === 'C' ? 'ESR (Ω)' : 'R note (Ω, 0)'}
              <input
                value={skuForm.seriesR}
                onChange={(e) => setSkuForm({ ...skuForm, seriesR: e.target.value })}
                placeholder={skuForm.kind === 'L' ? 'estimated if blank' : skuForm.kind === 'C' ? '0.02' : '0'}
              />
            </label>
            {skuForm.kind === 'L' && (
              <label>
                Wire ⌀ (mm)
                <input value={skuForm.wireMm} onChange={(e) => setSkuForm({ ...skuForm, wireMm: e.target.value })} />
              </label>
            )}
            {skuForm.kind === 'R' && (
              <label>
                Power (W)
                <input value={skuForm.powerW} onChange={(e) => setSkuForm({ ...skuForm, powerW: e.target.value })} />
              </label>
            )}
            <label>
              Price (€)
              <input
                value={skuForm.priceEur}
                onChange={(e) => setSkuForm({ ...skuForm, priceEur: e.target.value })}
                placeholder="blank = no price"
              />
            </label>
            <label>
              Tier
              <select
                value={skuForm.tier}
                onChange={(e) => setSkuForm({ ...skuForm, tier: e.target.value as CatalogTier | '' })}
              >
                <option value="">—</option>
                <option value="budget">budget</option>
                <option value="standard">standard</option>
                <option value="premium">premium</option>
              </select>
            </label>
          </div>
          {formError && <p className="error">{formError}</p>}
          {shadow && !formError && <p className="sub catmgr-shadow">⚠ {shadow}</p>}
          <div className="catmgr-formbtns">
            <button type="submit">{skuForm.originalId ? 'Apply changes' : 'Add SKU'}</button>
            <button type="button" onClick={() => setSkuForm(null)}>
              Close form
            </button>
          </div>
        </form>
      )}

      {view === 'series' && seriesForm && (
        <form
          className="catmgr-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitSeriesForm();
          }}
        >
          <div className="catmgr-grid">
            <label>
              Series id
              <input
                value={seriesForm.id}
                onChange={(e) => setSeriesForm({ ...seriesForm, id: e.target.value })}
                placeholder="intertechnik-audyn"
              />
            </label>
            <label>
              Brand
              <input value={seriesForm.brand} onChange={(e) => setSeriesForm({ ...seriesForm, brand: e.target.value })} />
            </label>
            <label>
              Series name
              <input value={seriesForm.series} onChange={(e) => setSeriesForm({ ...seriesForm, series: e.target.value })} />
            </label>
            <label>
              Kind
              <select
                value={seriesForm.kind}
                onChange={(e) => setSeriesForm({ ...seriesForm, kind: e.target.value as CatalogKind })}
              >
                <option value="L">L — coil</option>
                <option value="C">C — cap</option>
                <option value="R">R — resistor</option>
              </select>
            </label>
            <label>
              Range min ({unitFor(seriesForm.kind)})
              <input value={seriesForm.rangeMin} onChange={(e) => setSeriesForm({ ...seriesForm, rangeMin: e.target.value })} />
            </label>
            <label>
              Range max ({unitFor(seriesForm.kind)})
              <input value={seriesForm.rangeMax} onChange={(e) => setSeriesForm({ ...seriesForm, rangeMax: e.target.value })} />
            </label>
            <label>
              E-grid
              <select
                value={seriesForm.eSeries}
                onChange={(e) => setSeriesForm({ ...seriesForm, eSeries: e.target.value as 'E12' | 'E24' | '' })}
                title="Value steps the series is stocked in — default E12 for coils, E24 for caps/resistors"
              >
                <option value="">default</option>
                <option value="E12">E12</option>
                <option value="E24">E24</option>
              </select>
            </label>
            {seriesForm.kind === 'L' && (
              <label>
                Gauges (mm, comma)
                <input
                  value={seriesForm.gauges}
                  onChange={(e) => setSeriesForm({ ...seriesForm, gauges: e.target.value })}
                  placeholder="0.7, 1.0, 1.4"
                />
              </label>
            )}
            {seriesForm.kind === 'L' && (
              <label>
                DCR factor
                <input
                  value={seriesForm.dcrFactor}
                  onChange={(e) => setSeriesForm({ ...seriesForm, dcrFactor: e.target.value })}
                  placeholder="1 = air core, ~0.35 iron"
                />
              </label>
            )}
            {seriesForm.kind === 'C' && (
              <label>
                ESR (Ω)
                <input
                  value={seriesForm.esr}
                  onChange={(e) => setSeriesForm({ ...seriesForm, esr: e.target.value })}
                  placeholder="0.02"
                />
              </label>
            )}
            {seriesForm.kind === 'R' && (
              <label>
                Power (W)
                <input value={seriesForm.powerW} onChange={(e) => setSeriesForm({ ...seriesForm, powerW: e.target.value })} />
              </label>
            )}
            <label>
              Base price (€)
              <input
                value={seriesForm.basePrice}
                onChange={(e) => setSeriesForm({ ...seriesForm, basePrice: e.target.value })}
                placeholder="blank = no prices"
              />
            </label>
            <label>
              Cost factor (€/SI)
              <input
                value={seriesForm.costFactor}
                onChange={(e) => setSeriesForm({ ...seriesForm, costFactor: e.target.value })}
                title="Price = base + factor × value in SI units (H / F / Ω)"
              />
            </label>
            <label>
              Tier
              <select
                value={seriesForm.tier}
                onChange={(e) => setSeriesForm({ ...seriesForm, tier: e.target.value as CatalogTier | '' })}
              >
                <option value="">—</option>
                <option value="budget">budget</option>
                <option value="standard">standard</option>
                <option value="premium">premium</option>
              </select>
            </label>
          </div>
          {formError && <p className="error">{formError}</p>}
          <div className="catmgr-formbtns">
            <button type="submit">{seriesForm.originalId ? 'Apply changes' : 'Add series'}</button>
            <button type="button" onClick={() => setSeriesForm(null)}>
              Close form
            </button>
          </div>
        </form>
      )}

      {((view === 'skus' && !skuForm) || (view === 'series' && !seriesForm)) && (
        <div className="catmgr-formbtns">
          <button
            type="button"
            onClick={() =>
              view === 'skus'
                ? openSkuForm(emptySkuDraft(filterKind === 'all' ? 'C' : filterKind))
                : openSeriesForm(emptySeriesDraft(filterKind === 'all' ? 'C' : filterKind))
            }
          >
            {view === 'skus' ? '➕ Add SKU' : '➕ Add series'}
          </button>
        </div>
      )}

      <div className="catmgr-footer">
        <button
          type="button"
          onClick={() => onSave(custom, parts)}
          disabled={!dirty}
          title="Persist the edited catalog — it becomes the active one (snap, BOM, inspector) and survives restarts"
        >
          💾 Save to catalog
        </button>
        <button type="button" onClick={close}>
          Cancel
        </button>
        {dirty && <span className="sub">unsaved changes</span>}
      </div>
    </Modal>
  );
}
