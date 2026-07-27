import { useEffect, useMemo, useState } from 'react';
import type { CatalogKind, CatalogPart, CatalogTier } from '../lib/catalog';
import { customCatalogParts } from '../lib/catalog';
import {
  formatSkuValue,
  fromDisplayValue,
  gridShadowNote,
  removeSku,
  skuError,
  toDisplayValue,
  unitFor,
  upsertSku,
} from '../lib/catalogManager';

interface Props {
  onClose: () => void;
  /** Commit the edited SKU list (App persists + activates it). */
  onSave: (parts: CatalogPart[]) => void;
}

/** Form state: numerics as strings so typing "0." works. */
interface Draft {
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

const emptyDraft = (kind: CatalogKind = 'C'): Draft => ({
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

const toDraft = (p: CatalogPart): Draft => ({
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

const num = (s: string): number | undefined => {
  if (s.trim() === '') return undefined;
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
};

/** Turn the form back into a CatalogPart (NaN survives so skuError names
 *  the offending field instead of a silent drop). */
function fromDraft(d: Draft): CatalogPart {
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

/**
 * In-app catalog manager: add / edit / remove exact SKUs on a staged draft.
 * Nothing touches the live catalog until "Save" — closing discards, like
 * every other overlay. Uses the shared busy-overlay backdrop (help/wizard).
 */
export function CatalogManager({ onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CatalogPart[]>(() => [...customCatalogParts()]);
  const [dirty, setDirty] = useState(false);
  const [filterKind, setFilterKind] = useState<'all' | CatalogKind>('all');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const close = () => {
    if (dirty && !window.confirm('Discard unsaved catalog changes?')) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, onClose]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return draft
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
  }, [draft, filterKind, query]);

  const priced = draft.filter((p) => p.priceEur !== undefined).length;

  // Live warning while typing a NEW series' first SKU.
  const shadow = useMemo(() => {
    if (!form || form.brand.trim() === '' || form.series.trim() === '') return null;
    return gridShadowNote(draft, {
      id: form.originalId ?? form.id,
      brand: form.brand,
      series: form.series,
    });
  }, [form, draft]);

  function submitForm() {
    if (!form) return;
    const part = fromDraft(form);
    const err = skuError(part, draft, form.originalId);
    if (err) {
      setFormError(err);
      return;
    }
    setDraft((d) => upsertSku(d, part, form.originalId));
    setDirty(true);
    setFormError(null);
    // Keep brand/series/kind: entering a series run is the common flow.
    setForm({ ...emptyDraft(form.kind), brand: form.brand, series: form.series, tier: form.tier });
  }

  function deleteRow(id: string) {
    setDraft((d) => removeSku(d, id));
    setDirty(true);
    if (form?.originalId === id) setForm(null);
  }

  return (
    <div className="busy-overlay" onClick={close}>
      <div className="busy-card targets-card catmgr-card" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <div className="busy-title">🗂 Catalog manager</div>
          <input
            type="search"
            className="help-search"
            placeholder="Search SKU / brand / series…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
          <button type="button" onClick={close} title="Close (Esc)">
            ✕
          </button>
        </div>

        <p className="sub">
          {draft.length} exact SKUs · {priced} priced — edits stay in this panel until you save.
          {draft.length === 0 &&
            ' No imported catalog yet: add SKUs here or import a catalog file first.'}
        </p>

        <div className="catmgr-tablewrap">
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
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className={form?.originalId === p.id ? 'editing' : ''}
                  onDoubleClick={() => {
                    setForm(toDraft(p));
                    setFormError(null);
                  }}
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
                      onClick={() => {
                        setForm(toDraft(p));
                        setFormError(null);
                      }}
                      title="Edit this SKU (or double-click the row)"
                    >
                      ✎
                    </button>
                    <button type="button" onClick={() => deleteRow(p.id)} title="Remove this SKU">
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="sub">
                    {draft.length === 0 ? 'No SKUs yet.' : 'Nothing matches the filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {form ? (
          <form
            className="catmgr-form"
            onSubmit={(e) => {
              e.preventDefault();
              submitForm();
            }}
          >
            <div className="catmgr-grid">
              <label>
                SKU id
                <input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="JAZ-CC-100"
                />
              </label>
              <label>
                Brand
                <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </label>
              <label>
                Series
                <input value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} />
              </label>
              <label>
                Kind
                <select
                  value={form.kind}
                  onChange={(e) => setForm({ ...form, kind: e.target.value as CatalogKind })}
                >
                  <option value="L">L — coil</option>
                  <option value="C">C — cap</option>
                  <option value="R">R — resistor</option>
                </select>
              </label>
              <label>
                Value ({unitFor(form.kind)})
                <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </label>
              <label>
                {form.kind === 'L' ? 'DCR (Ω)' : form.kind === 'C' ? 'ESR (Ω)' : 'R note (Ω, 0)'}
                <input
                  value={form.seriesR}
                  onChange={(e) => setForm({ ...form, seriesR: e.target.value })}
                  placeholder={form.kind === 'L' ? 'estimated if blank' : form.kind === 'C' ? '0.02' : '0'}
                />
              </label>
              {form.kind === 'L' && (
                <label>
                  Wire ⌀ (mm)
                  <input value={form.wireMm} onChange={(e) => setForm({ ...form, wireMm: e.target.value })} />
                </label>
              )}
              {form.kind === 'R' && (
                <label>
                  Power (W)
                  <input value={form.powerW} onChange={(e) => setForm({ ...form, powerW: e.target.value })} />
                </label>
              )}
              <label>
                Price (€)
                <input
                  value={form.priceEur}
                  onChange={(e) => setForm({ ...form, priceEur: e.target.value })}
                  placeholder="blank = no price"
                />
              </label>
              <label>
                Tier
                <select
                  value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value as CatalogTier | '' })}
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
              <button type="submit">{form.originalId ? 'Apply changes' : 'Add SKU'}</button>
              <button type="button" onClick={() => setForm(null)}>
                Close form
              </button>
            </div>
          </form>
        ) : (
          <div className="catmgr-formbtns">
            <button
              type="button"
              onClick={() => {
                setForm(emptyDraft(filterKind === 'all' ? 'C' : filterKind));
                setFormError(null);
              }}
            >
              ➕ Add SKU
            </button>
          </div>
        )}

        <div className="catmgr-footer">
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!dirty}
            title="Persist the edited SKU list — it becomes the active catalog (snap, BOM, inspector) and survives restarts"
          >
            💾 Save to catalog
          </button>
          <button type="button" onClick={close}>
            Cancel
          </button>
          {dirty && <span className="sub">unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}
