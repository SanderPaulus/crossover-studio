/**
 * A4's register, as data.
 *
 * The declarations below are the single source of truth for two things that
 * used to be maintained separately and therefore drifted: what a metric NEEDS,
 * and what the UI says when it is off. The capability matrix is generated from
 * these declarations (see `../capability.ts`), so "M-G off: no off-axis
 * measurement for the tweeter" is not a sentence anyone wrote twice.
 *
 * `met()` is the only place a data need becomes a boolean, and it is written
 * as a POSITIVE test of what is present. A5.3 wants the reason with the
 * verdict, so `describe` is phrased as the thing that is missing and the
 * matrix pairs the two.
 */

import type { DataNeed, MetricContext, MetricDeclaration, MetricId } from './types.ts';
import { ctcKey, driverOf } from './types.ts';

const hasFilter: DataNeed = {
  key: 'filter',
  describe: 'no filter is loaded, so there is no network to solve',
  met: (ctx) => ctx.analysis !== null,
};

const hasImpedance = (): DataNeed => ({
  key: 'impedance',
  describe: 'no impedance measurement is tagged for this driver',
  met: (ctx, subject) => !!(subject && driverOf(ctx, subject)?.impedance),
});

const hasResonance = (): DataNeed => ({
  key: 'resonance',
  describe:
    'the impedance sweep shows no motional resonance (no phase zero crossing), so there is no f_s to read',
  met: (ctx, subject) =>
    !!(subject && driverOf(ctx, subject)?.impedance?.fundamentalHz !== null &&
      driverOf(ctx, subject)?.impedance?.fundamentalHz !== undefined),
});

const hasNearField = (): DataNeed => ({
  key: 'nearField',
  describe: 'no near-field measurement is tagged for this driver',
  met: (ctx, subject) => !!(subject && driverOf(ctx, subject)?.nearField),
});

const hasOffAxis = (which: 'lower' | 'upper'): DataNeed => ({
  key: `offAxis-${which}`,
  describe: `no off-axis measurement for the ${which} driver of this pair`,
  met: (ctx, subject) => {
    if (!subject) return false;
    const [lower, upper] = subject.split('|');
    const d = driverOf(ctx, which === 'lower' ? lower : upper);
    return !!d && d.directivity.length > 0;
  },
});

/**
 * V20: positions FIRST, spacing as the fallback.
 *
 * The fractions are built from where each radiator sits, because that is the
 * only input from which "nearest", "centroid" and "farthest" are three
 * different numbers. A project that entered just a centre-to-centre distance
 * still gets a row — one distance standing for all three, said out loud — so
 * the need is met by either.
 */
const hasLobingGeometry: DataNeed = {
  key: 'spacing',
  describe:
    'no vertical source positions and no centre-to-centre spacing entered for this driver pair',
  met: (ctx, subject) => {
    if (!subject) return false;
    const g = ctx.geometry;
    const placed = (way: string): boolean =>
      (g.waySources?.[way]?.length ?? 0) > 0 || g.zOffsetMm?.[way] !== undefined;
    const [lower, upper] = subject.split('|');
    return (placed(lower) && placed(upper)) || g.ctcMm?.[subject] !== undefined;
  },
};

const hasCrossing: DataNeed = {
  key: 'crossing',
  describe: 'the filtered responses do not cross, so there is no handover frequency to derive from',
  met: (ctx, subject) => {
    if (!subject) return ctx.crossings.some((c) => Number.isFinite(c.fHz));
    const [lower, upper] = subject.split('|');
    return ctx.crossings.some((c) => c.lower === lower && c.upper === upper && Number.isFinite(c.fHz));
  },
};

const hasCrossingForDriver: DataNeed = {
  key: 'crossing',
  describe: 'no acoustic crossing could be derived, so this driver has no passband to average over',
  met: (ctx, subject) =>
    !!subject && (ctx.crossings.length === 0
      ? false
      : ctx.crossings.some((c) => (c.lower === subject || c.upper === subject) && Number.isFinite(c.fHz))),
};

const hasBreakup = (): DataNeed => ({
  key: 'breakup',
  describe: 'no breakup peak found for the lower driver inside its valid band',
  met: (ctx, subject) => {
    if (!subject) return false;
    const [lower] = subject.split('|');
    const d = driverOf(ctx, lower);
    return !!d?.breakups && d.breakups.peaks.length > 0;
  },
});

const hasZOffsets: DataNeed = {
  key: 'zOffsets',
  describe: 'acoustic-centre offsets are missing for one or more drivers',
  met: (ctx) => {
    const z = ctx.geometry.zOffsetMm;
    if (!z) return false;
    return ctx.driversLowToHigh.every((d) => z[d] !== undefined);
  },
};

const hasVerticalWindow: DataNeed = {
  key: 'verticalWindow',
  describe: 'no vertical observation window is set, so there are no angles to synthesise',
  met: (ctx) => (ctx.settings.verticalWindowDeg?.length ?? 0) > 0,
};

const hasOnAxisEverywhere: DataNeed = {
  key: 'onAxis',
  describe: 'at least one driver has no on-axis far-field measurement',
  met: (ctx) => ctx.driversLowToHigh.every((d) => !!driverOf(ctx, d)?.onAxis),
};

export const METRIC_DECLARATIONS: readonly MetricDeclaration[] = [
  {
    id: 'M-A',
    title: 'Dissipation per resistor',
    quantity: 'Power burnt in each filter resistance, as a share of the amplifier power',
    formula: 'P_R = INT S(f)*|I_R(f)/E_g|^2*R df, S = IEC 60268-1 programme noise',
    role: 'gate',
    scope: 'system',
    needs: [hasFilter],
    specRef: 'A4 M-A',
  },
  {
    id: 'M-B',
    title: 'EPDR',
    quantity: 'Equivalent peak dissipation resistance of the amplifier load',
    formula: 'EPDR(f) = |Z_in| / (2*cos^2 phi)',
    role: 'gate',
    scope: 'system',
    needs: [hasFilter],
    specRef: 'A4 M-B',
  },
  {
    id: 'M-C',
    title: 'Drive voltage on the driver resonance',
    quantity: 'How far the voltage on f_s sits below the passband average',
    formula: '20*log10(|V_drv(f_s)| / mean |V| over the passband)',
    role: 'gate',
    scope: 'driver',
    needs: [hasFilter, hasImpedance(), hasResonance(), hasCrossingForDriver],
    specRef: 'A4 M-C',
  },
  {
    id: 'M-D',
    title: 'Low-frequency lift on the resonance',
    quantity: 'Extra response bump the filter and source impedance add over the bare box',
    formula: 'max_B[NF*H_el] - max_B[NF], normalised at f_ref; B and f_ref derived from f_p',
    role: 'soft',
    scope: 'driver',
    needs: [hasFilter, hasNearField(), hasImpedance(), hasResonance()],
    specRef: 'A4 M-D',
  },
  {
    id: 'M-E',
    title: 'Thevenin source resistance / Q multiplication',
    quantity: 'Source resistance the driver sees, and what it does to Q_es',
    formula: 'Z_s = (V2-V1)/(V1/Z1 - V2/Z2); reported as (R_e+R_s)/R_e',
    role: 'soft',
    scope: 'driver',
    needs: [hasFilter, hasImpedance(), hasResonance()],
    specRef: 'A4 M-E',
  },
  {
    id: 'M-F-interim',
    title: 'Vertical lobing (geometry only)',
    quantity:
      'Source separation in wavelengths at the crossing, as FOUR fractions: nearest source, ' +
      'amplitude-weighted centroid and farthest source between the ways, plus the widest ' +
      'separation inside a way',
    formula: 'lambda = d*f_x/c for each of the four d; no score and no threshold (V20)',
    /* REPORT, not soft, since V20. A soft target is something a candidate can
     * be ranked on; V20a puts every lobing judgement on the vertical synthesis
     * and leaves these fractions as reading matter. */
    role: 'report',
    scope: 'pair',
    needs: [hasLobingGeometry, hasCrossing],
    specRef: 'A4 M-F interim / Deel B V20',
  },
  {
    id: 'M-F-final',
    title: 'Vertical lobing (synthesised)',
    quantity: 'How the summed response collapses off the reference axis',
    formula: 'P(theta,f) = SUM P_i(f)*H_i(f)*exp(+j*k*z_i*sin theta)',
    role: 'soft',
    scope: 'system',
    needs: [hasFilter, hasZOffsets, hasOnAxisEverywhere, hasVerticalWindow],
    specRef: 'A4 M-F final',
    uncalibrated: undefined,
  },
  {
    id: 'M-G',
    title: 'Directivity match',
    quantity: 'Margin between the crossing and the lower driver -6 dB@theta point',
    formula: 'crossings of the theta-minus-axis difference through -3 and -6 dB',
    role: 'soft',
    scope: 'pair',
    needs: [hasOffAxis('lower'), hasCrossing],
    specRef: 'A4 M-G',
  },
  {
    id: 'M-H',
    title: 'Breakup distance',
    quantity: 'Distance of the crossing below a severity-weighted breakup ceiling',
    formula: 'ceiling = f_break / divisor(peak dB); divisor 3 severe .. 2 mild',
    role: 'soft',
    scope: 'pair',
    needs: [hasBreakup(), hasCrossing],
    specRef: 'A4 M-H',
    uncalibrated:
      'Severity weighting is uncalibrated; only its endpoints are published (spec V6/V9).',
  },
  {
    id: 'M-J',
    title: 'Group delay vs audibility threshold',
    quantity: 'System group delay against the published audibility band',
    formula: 'tau(f) = -d phi/d omega of the summed response, against the threshold curve',
    role: 'report',
    scope: 'system',
    needs: [hasFilter, hasOnAxisEverywhere],
    specRef: 'A4 M-J',
  },
];

export function declarationOf(id: MetricId): MetricDeclaration {
  const d = METRIC_DECLARATIONS.find((m) => m.id === id);
  if (!d) throw new Error(`No declaration for metric ${id}`);
  return d;
}

/** Every subject a metric applies to, given the context (N-way agnostic). */
export function subjectsFor(decl: MetricDeclaration, ctx: MetricContext): string[] {
  if (decl.scope === 'system') return ['system'];
  if (decl.scope === 'driver') return [...ctx.driversLowToHigh];
  const out: string[] = [];
  for (let i = 0; i + 1 < ctx.driversLowToHigh.length; i++) {
    out.push(ctcKey(ctx.driversLowToHigh[i], ctx.driversLowToHigh[i + 1]));
  }
  return out;
}
