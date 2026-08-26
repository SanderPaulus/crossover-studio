/**
 * P6 WHITELIST — the ONLY place in `engine2/` where a bare number may appear.
 *
 * P6 (spec A2) says: no literal frequency, component bound or other project
 * number in engine or metric code; everything is derived from project data or
 * is an explicit project setting. The permitted exceptions are unit
 * conversions and physical constants.
 *
 * Enforcing that by review alone has never worked anywhere, so it is enforced
 * by `p6Lint.test.ts`, which refuses ANY numeric literal with |value| ≥
 * `P6_LITERAL_THRESHOLD` inside `src/lib/engine2/` unless it is declared here
 * or its line carries an explicit `P6-OK` marker. This file is the whitelist,
 * and the price of putting something in it is that you must say WHICH KIND of
 * number it is: every export below carries a `@p6` tag, and the lint fails on
 * an export without one.
 *
 * The tags, and what they promise:
 *   @p6 unit        — a unit conversion. Carries no physics and no opinion.
 *   @p6 physical    — a constant of nature (c). Same for every project.
 *   @p6 norm        — fixed by a published standard (IEC 60268-1). Cited.
 *   @p6 literature  — a published measurement/threshold, cited, and
 *                     OVERRIDABLE: every consumer takes it as a parameter
 *                     whose default is this value, never reads it directly.
 *   @p6 rule        — a DIMENSIONLESS rule factor from the specification
 *                     (Deel A). Never a frequency, never a component value:
 *                     a ratio that multiplies something derived. If you catch
 *                     yourself wanting to add a frequency here, the answer is
 *                     that it has to be derived instead.
 *
 * What is NOT allowed here, in any disguise: a crossover point, a driver f_s,
 * a band edge, a component limit, or anything else that came out of one
 * project. Those are all derivable, and A5 exists to derive them.
 */

/* ------------------------------------------------------------------ *
 * Unit conversions
 * ------------------------------------------------------------------ */

/** Milliseconds per second. @p6 unit */
export const MS_PER_S = 1000;

/** Millimetres per metre. @p6 unit */
export const MM_PER_M = 1000;

/** Microseconds per second. @p6 unit */
export const US_PER_S = 1e6;

/** Percent per unit fraction. @p6 unit */
export const PERCENT = 100;

/** Degrees per half turn — the rad↔deg conversion. @p6 unit */
export const DEG_PER_HALF_TURN = 180;

/** dB per decade of a VOLTAGE/pressure ratio: 20·log10(·). @p6 unit */
export const DB_PER_DECADE_AMPLITUDE = 20;

/** dB per decade of a POWER ratio: 10·log10(·). @p6 unit */
export const DB_PER_DECADE_POWER = 10;

/** Metres per inch. @p6 unit */
export const M_PER_INCH = 0.0254;

/** Henry per millihenry. @p6 unit */
export const H_PER_MH = 1e-3;

/** Farad per microfarad. @p6 unit */
export const F_PER_UF = 1e-6;

/* ------------------------------------------------------------------ *
 * Physical constants
 * ------------------------------------------------------------------ */

/**
 * Speed of sound in air, m/s at ~20 °C. Explicitly whitelisted by P6.
 * Same value the rest of the app uses (`timing.SPEED_OF_SOUND`); engine2
 * keeps its own named copy so that a P6 reader can see the whitelist is
 * complete without following an import. @p6 physical
 */
export const SPEED_OF_SOUND_M_S = 343;

/* ------------------------------------------------------------------ *
 * Standards
 * ------------------------------------------------------------------ */

/**
 * IEC 60268-1 simulated programme noise: pink, with a first-order high-pass
 * and a first-order low-pass at the standard's band edges (Hz).
 *
 * These ARE frequencies, and they are in this file for one reason: they are
 * fixed by the standard that DEFINES metric M-A (spec A4: "IEC 60268-1: roze
 * met 1e-orde HP/LP op de normranden"). They did not come out of a project and
 * they do not move when the measurement set changes. Every consumer takes the
 * weighting as a parameter — see `iecProgrammeWeight` — so a project that
 * wants a different spectrum supplies one instead of editing this.
 * @p6 norm
 */
export const IEC_60268_1_HP_HZ = 40;
/** Upper norm edge of the IEC 60268-1 programme-noise weighting, Hz. @p6 norm */
export const IEC_60268_1_LP_HZ = 5000;

/**
 * Keele's near-field validity constant: f_max = KEELE / D_inch (Hz·inch).
 * A property of the piston model, not of any driver — the driver contributes
 * only its diameter. Cross-checks against Klippel's 5475/a[cm]:
 * 4311/(2/2.54) = 5475.0. @p6 physical
 */
export const KEELE_NEARFIELD_HZ_INCH = 4311;

/**
 * Keele's companion rule for the microphone: the near-field mic must sit
 * within this fraction of the radiator's RADIUS from the dust cap.
 * Dimensionless. @p6 norm
 */
export const KEELE_MIC_DISTANCE_FRACTION_OF_RADIUS = 0.11;

/* ------------------------------------------------------------------ *
 * Literature values (all overridable at the call site)
 * ------------------------------------------------------------------ */

/**
 * M-J's audibility threshold for group delay: the published band is roughly
 * 1–3 ms through the midrange and considerably looser at the extremes. Encoded
 * as a piecewise-log curve of (Hz, ms) knots.
 *
 * This is the one place engine2 holds frequencies that were not derived, and
 * it is deliberate and bounded: M-J is REPORTING ONLY (spec A4, "geen poort,
 * geen smaakoordeel"), the curve is a citation rather than a project number,
 * and `groupDelayVsThreshold` takes the curve as a parameter — this value is
 * only its default. Nothing in the engine may read it directly.
 *
 * Source: the Blauert & Laws / Liski et al. line of listening tests as
 * summarised in the spec (A4, M-J). The knots are the published envelope, not
 * a fit to any measurement in this repo. @p6 literature
 */
export const GROUP_DELAY_THRESHOLD_MS_KNOTS: readonly (readonly [number, number])[] = [
  [100, 10],
  [500, 3.2],
  [1000, 2],
  [2000, 1],
  [4000, 1.5],
  [8000, 2],
];

/* ------------------------------------------------------------------ *
 * Dimensionless rule factors from Deel A
 * ------------------------------------------------------------------ */

/**
 * A5b.1 — the header floor. The effective window length T gives an absolute
 * minimum at 1/T, and fine structure is only trusted from 2/T. Both are pure
 * multiples of 1/T; neither is a frequency. @p6 rule
 */
export const HEADER_FLOOR_ABSOLUTE_OVER_T = 1;
/** A5b.1 — fine structure trusted from this multiple of 1/T. @p6 rule */
export const HEADER_FLOOR_TRUSTED_OVER_T = 2;

/**
 * A5d.3 — floor of a crossover window is k·f_s of the upper driver, with k
 * falling as the flank steepens (a steeper slope may sit closer to the
 * resonance). Indexed by electrical/acoustic order 1..4. @p6 rule
 */
export const XO_FS_FACTOR_BY_ORDER: Readonly<Record<number, number>> = {
  1: 3.0,
  2: 2.0,
  3: 1.6,
  4: 1.4,
};

/**
 * A4 M-H / A5d.3 — the breakup ceiling divisor: the classic rule is f_break/3
 * for a severe peak and f_break/2 for a mild one, interpolated by severity.
 *
 * ⚠ THE SEVERITY WEIGHTING IS UNCALIBRATED (spec V6/V9: it needs HD data).
 * These are the two ENDPOINTS of the published rule; the curve between them
 * is a placeholder that every consumer is required to mark as such. @p6 rule
 */
export const BREAKUP_DIV_SEVERE = 3.0;
/** A4 M-H — divisor for a mild breakup peak. @p6 rule */
export const BREAKUP_DIV_MILD = 2.0;
/**
 * A4 M-H — peak height (dB above the local trend) at which the full f/3 rule
 * applies; below it the required margin falls off linearly. UNCALIBRATED, per
 * the spec's own note. @p6 rule
 */
export const BREAKUP_FULL_SEVERITY_DB = 6.0;

/**
 * A4 M-F-interim — the non-monotone lobing score's knots, in wavelengths of
 * centre-to-centre spacing at the crossover: favourable when small, worst
 * around half a wavelength, favourable again around one to one-and-a-half.
 * Dimensionless (λ), never Hz. @p6 rule
 */
export const LOBING_LAMBDA_KNOTS: readonly (readonly [number, number])[] = [
  [0.0, 0.0],
  [0.25, 0.15],
  [0.6, 1.0],
  [1.0, 0.25],
  [1.4, 0.35],
  [2.0, 1.0],
];

/**
 * A5b.2 / A5c.4 — default width of the fractional-octave trend a ripple or
 * breakup scan is measured against, in fractions of an octave (1/N). @p6 rule
 */
export const DEFAULT_TREND_OCTAVE_FRACTION = 2;

/**
 * A5c.1 — R_e is the MEDIAN of Re(Z) over the lowest this fraction of the
 * measured points.
 *
 * A fraction of the point count rather than a frequency, because a frequency
 * would be a P6 violation and because the right number of points to average is
 * a property of the sweep, not of the driver. Median rather than mean: one
 * bin of mains hum at the bottom of an impedance sweep is common and must not
 * drag the estimate. Reproduces the reference analysis of casus 1 on all three
 * drivers (see the golden-reference test). @p6 rule
 */
export const RE_LOW_FRACTION_OF_POINTS = 0.025;
/** A5c.1 / V8d — motional-proximity warning distance, in octaves. @p6 rule */
export const RE_MOTIONAL_PROXIMITY_OCTAVES = 1.0;

/**
 * A5c.5 — the semi-inductance fit |Z−R_e| = K·ω^n runs from this many DECADES
 * above the highest motional resonance up to the top of the sweep. Derived
 * from the driver's own resonance, never a frequency. @p6 rule
 */
export const SEMI_INDUCTANCE_DECADES_ABOVE_RESONANCE = 1;
/**
 * A5c.5 / V8e — the fit is only believed when the exponent lands in the
 * physically meaningful range (n≈1 a pure coil, n→0.5 strong eddy-current
 * suppression) AND the log-residual stays small. Outside that the extractor
 * REPORTS THAT IT CANNOT DETERMINE the model — which is exactly what the
 * tweeter of casus 1 needs it to do. @p6 rule
 */
export const SEMI_INDUCTANCE_N_MIN = 0.4;
/** A5c.5 / V8e — upper bound of a believable semi-inductance exponent. @p6 rule */
export const SEMI_INDUCTANCE_N_MAX = 1.1;
/** A5c.5 / V8e — largest RMS residual (natural log units) of a believable fit. @p6 rule */
export const SEMI_INDUCTANCE_MAX_LN_RESIDUAL = 0.25;

/**
 * A5c.2 / bandfree.py — a motional resonance is a local |Z| maximum that rises
 * at least this factor above R_e AND whose impedance phase crosses through
 * zero (|φ| below `RESONANCE_PHASE_ZERO_DEG`). The phase test is what
 * separates a resonance from the rising voice-coil inductance (V8b). @p6 rule
 */
export const RESONANCE_MIN_Z_OVER_RE = 1.6;
/** A5c.2 — |impedance phase| at the peak, in degrees, below which the peak
 *  counts as motional rather than a flank. @p6 rule */
export const RESONANCE_PHASE_ZERO_DEG = 25;
/** A5c.3 — reflex: the dip between two motional peaks must fall below this
 *  fraction of the smaller peak. @p6 rule */
export const REFLEX_DIP_FRACTION = 0.6;

/**
 * A5b.2 — a trend deviation counts as a peak from this height in dB. Low
 * enough to see the mild peaks the severity weighting exists for. @p6 rule
 */
export const PEAK_MIN_DB_OVER_TREND = 0.7;

/**
 * A5b.1(ii) — the FF/NF baffle-step model test: a physical step is a shelf of
 * at most this depth in dB. Beyond it the fit is rejected as "not a baffle
 * step" rather than believed (V8g). @p6 rule
 */
export const BAFFLE_STEP_MAX_DEPTH_DB = 7;

/**
 * A4 M-A — dissipation is reported as a fraction of the amplifier power the
 * loudspeaker actually accepts. The reference generator voltage is a project
 * setting; this is only the fallback used when a netlist's generator carries
 * no Eg at all, and it is the standard 1 W @ 8 Ω sine level. @p6 norm
 */
export const DEFAULT_GENERATOR_VOLTS = 2.83;

/**
 * Numerical guard: the smallest magnitude treated as non-zero when taking a
 * logarithm, so an empty bin yields −∞-ish rather than NaN. @p6 unit
 */
export const LOG_FLOOR = 1e-30;

/**
 * The P6 lint's own threshold: numeric literals with |value| below this are
 * structural (indices, halves, small ratios) and are not policed. Anything at
 * or above it must be here or marked. @p6 rule
 */
export const P6_LITERAL_THRESHOLD = 20;

/* ------------------------------------------------------------------ *
 * Analysis grid sizes (resolution, not physics)
 * ------------------------------------------------------------------ */

/**
 * Points on the log grid an SPL extractor resamples onto before scanning.
 * A RESOLUTION choice, not a band: the band always comes from the validity
 * limits. Enough that a 1/2-octave trend window holds ~20 samples across the
 * audio range, few enough that the O(n²) trend stays instant. @p6 rule
 */
export const SPL_SCAN_GRID_POINTS = 500;

/**
 * Points on the LINEAR-frequency grid the diffraction scan transforms, and
 * therefore the quefrency resolution of the dominant-path estimate. Linear
 * because a diffraction ripple is periodic in frequency, not in log frequency.
 * Power of two out of habit rather than necessity — the transform here is a
 * direct DFT over a few hundred bins. @p6 rule
 */
export const DIFFRACTION_DFT_POINTS = 1024;

/* ------------------------------------------------------------------ *
 * F2 — gates, bounds and the determinism policy
 * ------------------------------------------------------------------ */

/**
 * THE RUN SEED a v2 optimisation uses when the project states none.
 *
 * Note carefully that this is NOT a P4 violation, and the distinction is the
 * whole reason it is written down here. P4 forbids a LIMIT or a WEIGHT with a
 * silent default, because such a default takes part in the answer without the
 * designer having asked for it. A seed takes part in nothing: it selects which
 * of several equally valid starting points the search visits, and the
 * alternative to a default is not "off" but "not reproducible" — which is
 * exactly the failure A5e.4 exists to prevent. So the seed always has a value,
 * it is always reported, and the designer may replace it.
 *
 * The number itself carries no meaning at all; any fixed value would do.
 * @p6 rule
 */
export const DEFAULT_RUN_SEED = 20260826;

/**
 * How many independent starting points a v2 run explores when the project
 * states no number. A SEARCH-DEPTH choice, not a limit: it changes how much
 * of the landscape is visited, never what counts as acceptable. @p6 rule
 */
export const DEFAULT_RUN_STARTS = 3;

/**
 * How far a seeded start may be jittered from the network it starts at, in
 * DECADES of component value. Dimensionless (a log-space radius), and clipped
 * to the search box in every case, so it can never place a start outside the
 * bounds the budgets and the app agree on. @p6 rule
 */
export const RUN_START_JITTER_DECADES = 0.35;

/**
 * A branch counts as HIGH-PASS PROTECTED (A4 M-C's scope) when its own
 * electrical transfer sits at least this many dB LOWER half an octave below
 * its passband floor than inside the passband.
 *
 * Any rise at all is in principle a high pass; a measured curve ripples, so
 * the test asks for a rise that is not ripple. Derived from the network in
 * every case — never "the driver is not the lowest way", which would count
 * ways, and never a driver name. @p6 rule
 */
export const HP_PROTECTION_MIN_RISE_DB = 1.0;

/** How far below the passband floor that rise is measured, in octaves. @p6 rule */
export const HP_PROTECTION_PROBE_OCTAVES = 0.5;

/**
 * Bisection steps for the 1-D budget inversions of A5d.6.
 *
 * A resolution choice on a monotone scalar solve, not a physical number: 60
 * halvings take any bracket this app can pose to far below the precision of
 * the measurement it is solving on. @p6 rule
 */
export const BOUND_INVERSION_STEPS = 60;

/**
 * How many times a budget inversion may DOUBLE its bracket before giving up.
 *
 * A search-procedure bound, not a component limit: it only says how far the
 * solve is willing to look for the point where the budget is first exceeded,
 * and 20 doublings span every physically buildable value many times over.
 * @p6 rule
 */
export const BOUND_BRACKET_DOUBLINGS = 20;

/**
 * A5d.6 — the SLACK on a topology-aware pre-bound, per filter order above the
 * first.
 *
 * The spec is explicit that a pre-bound distributed over several sections is
 * exact only for a single section and "verruimt per extra filterorde —
 * toepassen als zoekdoos-vormgeving met speling; de poort blijft de
 * autoriteit". V12 is the reason the wording is that careful: a single-section
 * series-C pre-bound of 5–10 µF collides with a realised fourth-order mid
 * branch carrying 42 µF in series.
 *
 * ⚠ UNCALIBRATED, like the breakup severity weighting. It shapes a search box
 * and decides nothing: every consumer must mark it as slack, and the gate
 * stays the authority. @p6 rule
 */
export const PREBOUND_SLACK_PER_ORDER = 2.0;

/* ------------------------------------------------------------------ *
 * F3 — requirements, the target curve and the shortlist
 * ------------------------------------------------------------------ */

/**
 * A5e.1 — the smoothing the SPL WINDOW requirement is judged on, in octaves.
 *
 * The window asks "is this acceptable", and that question is about the shape a
 * listener hears rather than about every sample the measurement holds. A sixth
 * of an octave is the width at which a feature stops being a resonance the ear
 * tracks and starts being ripple; narrower features fall out of this judgement
 * ON PURPOSE and are reported separately (peaks) or forgiven (dips).
 *
 * A resolution choice about a JUDGEMENT, not a band and not a project number:
 * it moves with no measurement and it is the same for every design. @p6 rule
 */
export const WINDOW_SMOOTHING_OCTAVES = 1 / 6;

/**
 * A5e.1 — how tall a NARROW feature has to be over the smoothed trend before
 * it is reported as a peak, in dB.
 *
 * Deliberately the same convention the breakup scan uses on a driver
 * (`PEAK_MIN_DB_OVER_TREND`), applied to the system sum: a feature is narrow
 * when the window smoothing removes it, and it is a peak when what the
 * smoothing removed points UP. There is no matching constant for dips, and
 * that absence is the taste principle rather than an oversight — see A5e.1.
 * @p6 rule
 */
export const NARROW_PEAK_MIN_DB = 0.7;

/**
 * A5e.1 — how many designs the shortlist holds when the project states no
 * number. A PRESENTATION choice: it changes how many of the feasible designs
 * are shown, never which ones are feasible. @p6 rule
 */
export const DEFAULT_SHORTLIST_SIZE = 10;

/**
 * A5e.1 — the relaxation ladder's step, as a FRACTION of the stated
 * requirement per rung.
 *
 * Visible steps, and visible means countable: each rung widens a failing taste
 * requirement by this much of its original value, so the label can say exactly
 * what the delivered design meets ("±2.25 dB — you asked for ±1.5"). A ratio,
 * never an absolute dB or degree, because the ladder has to mean the same
 * thing to a 1 dB window and to a 15° phase requirement. @p6 rule
 */
export const RELAXATION_STEP_FRACTION = 0.25;

/**
 * A5e.1 — how many rungs the ladder may climb before it gives up and reports
 * that the requirement is out of reach on the scanned field.
 *
 * A bound on an admission of failure, not on a search: at this point the
 * honest answer is "not within what was scanned", and climbing further would
 * turn a stated requirement into a formality. @p6 rule
 */
export const RELAXATION_MAX_RUNGS = 8;

/**
 * Points on the log grid the NETWORK is solved on for the report.
 *
 * A resolution choice, not a band: the grid's ENDS come from the impedance
 * measurements. Dense enough that M-A's weighted integral and M-J's group-delay
 * derivative are smooth, and that a narrow impedance dip cannot fall between
 * two samples. @p6 rule
 */
export const ANALYSIS_GRID_POINTS = 1600;
