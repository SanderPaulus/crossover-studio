import type {
  DriverFilterSpec,
  HpLpSpec,
  EqBandSpec,
  EqBandType,
  FilterKind,
} from '../lib/filters.ts';

/**
 * Live controls for one driver's virtual filter chain: gain, HP, LP and
 * parametric EQ bands. Every change re-solves the sim instantly — this is the
 * "turn the knobs, watch the result" surface of the tool.
 */

interface Props {
  title: string;
  accentVar: string; // CSS var for the driver's series color
  spec: DriverFilterSpec;
  onChange: (next: DriverFilterSpec) => void;
}

const FREQ_MIN = Math.log10(100);
const FREQ_MAX = Math.log10(20000);

function FreqSlider({
  value,
  onChange,
  help,
}: {
  value: number;
  onChange: (f: number) => void;
  help?: string;
}) {
  return (
    <span className="freq-slider">
      <input
        type="range"
        min={FREQ_MIN}
        max={FREQ_MAX}
        step={0.005}
        value={Math.log10(Math.min(Math.max(value, 100), 20000))}
        onChange={(e) => onChange(Math.round(10 ** Number(e.target.value)))}
        title={help}
      />
      <input
        type="number"
        value={value}
        min={20}
        max={40000}
        onChange={(e) => onChange(Number(e.target.value) || value)}
        title={help}
      />
      <span className="unit-suffix">Hz</span>
    </span>
  );
}

function HpLpRow({
  label,
  spec,
  onChange,
}: {
  label: string;
  spec: HpLpSpec;
  onChange: (next: HpLpSpec) => void;
}) {
  const orders = spec.kind === 'LR' ? [2, 4] : spec.kind === 'BS' ? [2, 3, 4] : [1, 2, 3, 4];
  const what = label === 'High-pass' ? 'passes everything above' : 'passes everything below';
  return (
    <div className="vf-row">
      <label
        className="check vf-enable"
        title={`Enable the ${label.toLowerCase()} — ${what} the corner frequency`}
      >
        <input
          type="checkbox"
          checked={spec.enabled}
          onChange={(e) => onChange({ ...spec, enabled: e.target.checked })}
        />
        {label}
      </label>
      <select
        value={spec.kind}
        onChange={(e) => {
          const kind = e.target.value as FilterKind;
          // LR only exists in even orders, Bessel starts at 2 — snap when switching.
          const order =
            kind === 'LR' && spec.order % 2 !== 0
              ? ((spec.order + 1) as 2 | 4)
              : kind === 'BS' && spec.order < 2
                ? 2
                : spec.order;
          onChange({ ...spec, kind, order });
        }}
        title="Alignment: Linkwitz-Riley (−6 dB at the knee, sums flat with its mirror), Butterworth (−3 dB at the knee) or Bessel (−3 dB, maximally flat group delay — the gentle-phase choice)"
      >
        <option value="LR">Linkwitz-Riley</option>
        <option value="BW">Butterworth</option>
        <option value="BS">Bessel</option>
      </select>
      <select
        value={spec.order}
        onChange={(e) => onChange({ ...spec, order: Number(e.target.value) as 1 | 2 | 3 | 4 })}
        title="Steepness of the slope beyond the knee (order × 6 dB per octave)"
      >
        {orders.map((o) => (
          <option key={o} value={o}>
            {o * 6} dB/oct
          </option>
        ))}
      </select>
      <FreqSlider
        value={spec.freq}
        onChange={(freq) => onChange({ ...spec, freq })}
        help="Corner (knee) frequency — also draggable as the hollow dot on the SPL chart"
      />
    </div>
  );
}

function EqRow({
  index,
  band,
  onChange,
  onRemove,
}: {
  index: number;
  band: EqBandSpec;
  onChange: (next: EqBandSpec) => void;
  onRemove: () => void;
}) {
  return (
    <div className="vf-row">
      <label
        className="check vf-enable"
        title="Enable this EQ band — note: passive synthesis cannot boost, positive gains fall away when building"
      >
        <input
          type="checkbox"
          checked={band.enabled}
          onChange={(e) => onChange({ ...band, enabled: e.target.checked })}
        />
        EQ {index + 1}
      </label>
      <select
        value={band.type ?? 'peak'}
        onChange={(e) => onChange({ ...band, type: e.target.value as EqBandType })}
        title="Peak cuts/boosts around the frequency; shelves apply the gain below (low) or above (high) it"
      >
        <option value="peak">Peak</option>
        <option value="lowShelf">Low shelf</option>
        <option value="highShelf">High shelf</option>
      </select>
      <FreqSlider
        value={band.freq}
        onChange={(freq) => onChange({ ...band, freq })}
        help="Centre frequency of this band — also draggable as the solid dot on the SPL chart"
      />
      <label className="inline-num" title="Gain: − cuts, + boosts (passive builds can only cut)">
        <input
          type="number"
          step={0.5}
          min={-20}
          max={12}
          value={band.gainDb}
          onChange={(e) => onChange({ ...band, gainDb: Number(e.target.value) })}
        />
        <span className="unit-suffix">dB</span>
      </label>
      <label
        className="inline-num"
        title="Q = width: higher is narrower (1 ≈ 1.4 octave, 5 ≈ 0.3 octave) — scroll on the chart dot also adjusts this"
      >
        Q
        <input
          type="number"
          step={0.1}
          min={0.1}
          max={10}
          value={band.q}
          onChange={(e) => onChange({ ...band, q: Number(e.target.value) || band.q })}
        />
      </label>
      <button
        type="button"
        className="vf-remove"
        onClick={onRemove}
        title="Remove this EQ band"
        aria-label={`Remove EQ band ${index + 1}`}
      >
        ×
      </button>
    </div>
  );
}

export default function DriverFilterControls({ title, accentVar, spec, onChange }: Props) {
  return (
    <fieldset className="vf-driver">
      <legend>
        <span className="legend-key" style={{ background: `var(${accentVar})` }} />
        {title}
      </legend>
      <HpLpRow label="High-pass" spec={spec.hp} onChange={(hp) => onChange({ ...spec, hp })} />
      <HpLpRow label="Low-pass" spec={spec.lp} onChange={(lp) => onChange({ ...spec, lp })} />
      {spec.eq.map((band, i) => (
        <EqRow
          key={i}
          index={i}
          band={band}
          onChange={(next) =>
            onChange({ ...spec, eq: spec.eq.map((b, j) => (j === i ? next : b)) })
          }
          onRemove={() => onChange({ ...spec, eq: spec.eq.filter((_, j) => j !== i) })}
        />
      ))}
      <div className="vf-row">
        <button
          type="button"
          className="vf-add"
          onClick={() =>
            onChange({
              ...spec,
              eq: [...spec.eq, { enabled: true, freq: 2000, gainDb: 0, q: 1 }],
            })
          }
          title="Add another parametric EQ band for this driver"
        >
          + Add EQ band
        </button>
        <label
          className="inline-num"
          title="Overall gain of this driver branch — the synthesis turns level differences into attenuation of the loudest branch"
        >
          Gain
          <input
            type="number"
            step={0.5}
            min={-30}
            max={12}
            value={spec.gainDb}
            onChange={(e) => onChange({ ...spec, gainDb: Number(e.target.value) })}
          />
          <span className="unit-suffix">dB</span>
        </label>
      </div>
    </fieldset>
  );
}
