/**
 * U-9 fase 3 — DE GUIDED-PROFIELEN, ALS DATA.
 *
 * Goedgekeurd door Sander op 25-10-2026 (de B-1-tabel in
 * `docs/U-9_veldinventaris.md`, fase 3). Elk getal hieronder staat daar met
 * dezelfde onderbouwing; dit bestand is de ENIGE plek in de app waar een
 * profielwaarde getypt staat (P6, gepind door `u9Fase3.test.ts`).
 *
 * VIER REGELS, en elk is een faalvorm die dit project al betaald heeft:
 *
 *  1. EEN PROFIEL STELT PAS IETS ALS DE GEBRUIKER HET KIEST. Er is geen
 *     standaardprofiel, geen voorselectie en geen terugval (P4). "Ik weet het
 *     niet" is een profiel zonder waarden: het stelt niets, en de knop zegt wat
 *     dat kost.
 *  2. ELKE WAARDE DRAAGT HAAR HERKOMST IN EEN VELD (`basis`, `tooStrict`,
 *     `tooLoose`), niet in een commentaar: het scherm drukt haar af, en een
 *     herkomst die alleen in de bron staat leest niemand die kiest.
 *  3. EEN PROFIEL SCHRIJFT DEZELFDE STAAT ALS EXPERT, met de profielnaam als
 *     `V2StatedBy` ("stated via profile <naam> on <datum>"). Een eigen
 *     bewerking in Expert wist die naam (de U-3-regel).
 *  4. GENERIEK, NIET KOAN. Casus 1's getallen horen bij Sanders versterker en
 *     kast; zij staan alleen als TEGENPROEF in de B-1-tabel.
 *
 * Geen engine-import, om dezelfde reden als `v2Guided.ts`.
 */
import type { V2StatedKey } from './v2Settings.ts';

/**
 * Wat een profiel kan schrijven. De v2-instellingen bij hun sleutel, plus de
 * twee invoeren die buiten dat blok wonen: de versterkervloer (app-state,
 * ouder dan het v2-blok) en het M-C-getal van de BOVENSTE weg (een per-weg-
 * veld op de driverkaart — B-1: het enkele getal zou ook de mid oordelen,
 * waar de afgeleide excursiegrens van V49 de juiste is).
 */
export type ProfileTarget = V2StatedKey;

/** Een waarde: een getal, of een fractie van een andere (al geschreven) waarde. */
export type ProfileAmount =
  | { kind: 'value'; value: number }
  | { kind: 'fraction'; of: 'amplifierPowerW'; fraction: number };

export interface ProfileValue {
  target: ProfileTarget;
  /** De registerrij die deze waarde vult (`v2InputRegister.ts`). */
  rowId: string;
  amount: ProfileAmount;
  /** Waarom dit getal: literatuur, conventie of norm, met naam. */
  basis: string;
  /** Wat er gebeurt als het te streng is. */
  tooStrict: string;
  /** Wat er gebeurt als het te ruim is. */
  tooLoose: string;
}

export type GuidedProfileQuestion = 'amplifier' | 'load' | 'ambition';

export interface GuidedProfile {
  id: string;
  question: GuidedProfileQuestion;
  /** De naam in "stated via profile <naam>". */
  name: string;
  /** Eén zin over voor wie dit profiel is, in begrippen. */
  who: string;
  values: readonly ProfileValue[];
}

const v = (value: number): ProfileAmount => ({ kind: 'value', value });

/* ------------------------------------------------------------------ *
 * Vraag 2 — welke versterker?
 * ------------------------------------------------------------------ */

const FLOOR_BASIS =
  '0.8 × the lowest nominal load the amplifier is specified for: IEC 60268-5 lets a loudspeaker of nominal impedance Z dip to 0.8·Z, so an amplifier made for “4 Ω speakers” is built for 3.2 Ω dips.';
const FLOOR_STRICT = 'The search refuses designs the amplifier would drive happily, and the shortlist can come back empty.';
const FLOOR_LOOSE = 'A design is delivered that makes the amplifier clip or go into protection.';
const POWER_BASIS = 'The continuous power the amplifier class is commonly specified at; the watts of every resistor are reported at this power.';
const PEAK_BASIS =
  'Twice the continuous power: 3 dB of dynamic headroom (the IHF dynamic-headroom convention). With the nominal load it gives the peak voltage the excursion ceiling is computed from (V49: √(2·P·R)).';
const PEAK_STRICT = 'A tighter excursion ceiling than the amplifier can actually deliver, so fewer crossover positions survive.';
const PEAK_LOOSE = 'Cone travel at full drive is under-estimated.';
const NOMINAL_BASIS = 'The load amplifier power is conventionally specified into.';

const amp = (
  id: string,
  name: string,
  who: string,
  floor: number,
  power: number,
): GuidedProfile => ({
  id,
  question: 'amplifier',
  name,
  who,
  values: [
    { target: 'ampMinLoadOhm', rowId: 'ampMinLoadOhm', amount: v(floor), basis: FLOOR_BASIS, tooStrict: FLOOR_STRICT, tooLoose: FLOOR_LOOSE },
    { target: 'amplifierPowerW', rowId: 'amplifierPowerW', amount: v(power), basis: POWER_BASIS, tooStrict: 'Resistor watts reported higher than they will run.', tooLoose: 'Resistor watts reported lower than they will run.' },
    { target: 'amplifierPeakPowerW', rowId: 'amplifierPeakPowerW', amount: v(2 * power), basis: PEAK_BASIS, tooStrict: PEAK_STRICT, tooLoose: PEAK_LOOSE },
    { target: 'amplifierNominalLoadOhm', rowId: 'amplifierNominalLoadOhm', amount: v(8), basis: NOMINAL_BASIS, tooStrict: PEAK_STRICT, tooLoose: PEAK_LOOSE },
  ],
});

/* ------------------------------------------------------------------ *
 * Vraag 3 — hoe zwaar wordt hij belast?
 * ------------------------------------------------------------------ */

const MC_STRICT = 'Smaller crossover windows and more designs refused for tweeter protection.';
const MC_LOOSE = 'At high volume the tweeter is driven harder at its own resonance than the rule allows.';
const XMAX_BASIS =
  'The share of the datasheet X_max that full drive may use. X_max is already the linearity limit; the reserve covers how differently manufacturers define it. A convention, not a norm. It only counts together with the amplifier answer and the driver card.';
const XMAX_STRICT = 'Excursion ceilings tighter than the driver needs.';
const XMAX_LOOSE = 'Cones run into their non-linear travel at full drive.';
const THERMAL_BASIS =
  'The music average, as a share of the continuous power: with peak = 2 × continuous the average is 2·P/10^(crest/10).';
const THERMAL_STRICT = 'Resistors judged hotter than they will run, so more designs fail the resistor allowance.';
const THERMAL_LOOSE = 'A resistor that overheats at the volume you actually play.';

const load = (
  id: string,
  name: string,
  who: string,
  mcDb: number,
  mcBasis: string,
  xmax: number,
  thermal: number,
  crestNote: string,
): GuidedProfile => ({
  id,
  question: 'load',
  name,
  who,
  values: [
    { target: 'driveOnFsMaxDb:high', rowId: 'driveOnFsMaxDb-per-way', amount: v(mcDb), basis: `${mcBasis} Stated on the TOP way only: the lower ways are judged by the excursion ceiling derived from their own driver card (V49).`, tooStrict: MC_STRICT, tooLoose: MC_LOOSE },
    { target: 'xmaxMarginFraction', rowId: 'xmaxMarginFraction', amount: v(xmax), basis: XMAX_BASIS, tooStrict: XMAX_STRICT, tooLoose: XMAX_LOOSE },
    { target: 'resistorThermalPowerW', rowId: 'resistorThermalPowerW', amount: { kind: 'fraction', of: 'amplifierPowerW', fraction: thermal }, basis: `${THERMAL_BASIS} ${crestNote}`, tooStrict: THERMAL_STRICT, tooLoose: THERMAL_LOOSE },
  ],
});

/* ------------------------------------------------------------------ *
 * Vraag 4 — wat wil je bouwen?
 * ------------------------------------------------------------------ */

const RCLASS_BASIS_10 =
  '10 W is the common cement/MOX class: 100 of the 108 resistors in the v8 catalogue (Jantzen MOX 53, Superes 40, Duelund CAST 7).';
const RCLASS_BASIS_20 = '20 W is the only other class in the v8 catalogue (Mundorf MResist Supreme, 8 parts).';
const RCLASS_STRICT = 'Designs with a working resistor refused for heat.';
const RCLASS_LOOSE = 'A resistor that runs too hot in a closed box.';
const MARGIN_BASIS = 'A convention — half load for a resistor inside a closed box — not a norm.';
const SPL_STRICT = 'An empty shortlist; the relaxation ladder then widens the window and says so on the row.';
const SPL_LOOSE = 'Flatness no longer separates one design from the next.';
const PHASE_BASIS = 'The literature guideline for phase tracking through a handover (vuistregels §6c).';
const PHASE_STRICT = 'Designs refused whose drivers hand over cleanly enough; the ladder may widen it.';
const PHASE_LOOSE = 'Handovers where the two drivers are far out of phase pass.';

const build = (
  id: string,
  name: string,
  who: string,
  rclass: number,
  splPm: number,
  splBasis: string,
  phaseDeg: number | null,
): GuidedProfile => ({
  id,
  question: 'ambition',
  name,
  who,
  values: [
    { target: 'resistorClassW', rowId: 'resistorClassW', amount: v(rclass), basis: rclass === 10 ? RCLASS_BASIS_10 : RCLASS_BASIS_20, tooStrict: RCLASS_STRICT, tooLoose: RCLASS_LOOSE },
    { target: 'resistorPowerMargin', rowId: 'resistorPowerMargin', amount: v(0.5), basis: MARGIN_BASIS, tooStrict: RCLASS_STRICT, tooLoose: RCLASS_LOOSE },
    { target: 'splWindowPlusMinusDb', rowId: 'splWindowPlusMinusDb', amount: v(splPm), basis: splBasis, tooStrict: SPL_STRICT, tooLoose: SPL_LOOSE },
    ...(phaseDeg === null
      ? []
      : [{ target: 'maxPhaseTrackingDeg' as const, rowId: 'maxPhaseTrackingDeg', amount: v(phaseDeg), basis: PHASE_BASIS, tooStrict: PHASE_STRICT, tooLoose: PHASE_LOOSE }]),
  ],
});

const SPL_CONVENTION = 'A manufacturer convention, not a norm. It is a REQUIREMENT (A5e.1): the relaxation ladder may widen it, and says so.';

export const GUIDED_PROFILES: readonly GuidedProfile[] = Object.freeze([
  amp('amp-8ohm', '8 Ω only', 'Many valve and vintage amplifiers: the label says 8 Ω and nothing lower.', 6.4, 30),
  amp('amp-4-8ohm', '4–8 Ω', 'Most receivers and integrated amplifiers: the label says 4–8 Ω.', 3.2, 100),
  amp('amp-2ohm', '2 Ω stable', 'Power amplifiers specified down to 2 Ω.', 1.6, 200),
  load(
    'load-calm', 'Calm listening', 'Background to normal volume, rarely near the amplifier’s limit.',
    -18, 'The conservative rule of thumb “18 dB down at resonance” (vuistregels §2).', 1.0, 0.02,
    'A crest factor of about 20 dB (dynamic music, never near clipping) gives 2 %.',
  ),
  load(
    'load-firm', 'Played loud', 'Regularly loud, occasionally into the amplifier’s headroom.',
    -20, 'The 18 dB rule plus 2 dB for drift of f_s (the V47b reasoning).', 0.8, 0.1,
    'A crest factor of about 13 dB gives 10 %.',
  ),
  load(
    'load-party', 'Parties', 'Compressed music at the amplifier’s limit for long stretches.',
    -24, 'A 2nd-order flank at 4·f_s (12 dB/oct × log₂4): the “3–4 × f_s” rule (Dickason) at its strict end.', 0.7, 0.25,
    'A crest factor of about 9 dB (compressed, against clipping) gives 25 %.',
  ),
  build('build-simple', 'As simple as possible', 'Few parts; flatness within a loose hifi tolerance.', 10, 3, `±3 dB — ${SPL_CONVENTION}`, null),
  build('build-balanced', 'Balanced', 'A good tolerance on flatness and on phase through the handover.', 10, 2, `±2 dB — ${SPL_CONVENTION}`, 30),
  build('build-whatever', 'Whatever it takes', 'A monitor-grade tolerance; parts and cost follow from it.', 20, 1.5, `±1.5 dB — ${SPL_CONVENTION}`, 30),
]);

/* ------------------------------------------------------------------ *
 * Vraag 5 — hoe moet hij klinken? (een KEUZE van de gebruiker, geen profiel)
 * ------------------------------------------------------------------ */

/**
 * De voicing is een keuze en geen profiel: wie "3 dB plateau" kiest heeft die
 * diepte zelf gesteld, en het scherm attribueert haar zo ("stated by you").
 * Flat is de neutrale referentie en wordt gesteld door hem te kiezen (I-3).
 */
export interface VoicingChoice {
  id: string;
  label: string;
  /** null = vlak. */
  plateauDepthDb: number | null;
  basis: string;
}

export const VOICING_CHOICES: readonly VoicingChoice[] = Object.freeze([
  { id: 'flat', label: 'Flat — the neutral reference', plateauDepthDb: null, basis: 'Flat is the neutral reference (A5e.2).' },
  { id: 'plateau-light', label: 'Light bass plateau', plateauDepthDb: 1.5, basis: '¼ of the theoretical 6 dB baffle step.' },
  { id: 'plateau', label: 'Bass plateau', plateauDepthDb: 3, basis: '½ of the theoretical 6 dB baffle step.' },
  { id: 'plateau-full', label: 'Full bass plateau', plateauDepthDb: 4.5, basis: '¾ of the theoretical 6 dB baffle step. How much the room gives back depends on placement.' },
]);

/* ------------------------------------------------------------------ *
 * Wat een keuze schrijft
 * ------------------------------------------------------------------ */

/** De naam die een profiel in `V2StatedBy` zet. */
export const profileStatedBy = (p: GuidedProfile): string => `profile ${p.name}`;

export interface ProfileWrite {
  target: ProfileTarget;
  rowId: string;
  /** Als string, zoals de formulieren hun waarden houden. */
  value: string;
}

export interface ProfileSkip {
  target: ProfileTarget;
  rowId: string;
  /** Het percentage dat niet geschreven kon worden; de zin is `PROFILE_SKIP_REASON`. */
  pct: number;
}

/** Waarom een fractie niet geschreven wordt — een sjabloon, zodat het scherm hem vertaalt. */
export const PROFILE_SKIP_REASON =
  'not written: it is {pct} % of the amplifier’s continuous power, and that is not stated — answer “Which amplifier will drive it?” first.';

/** Een getal zoals een formulier het houdt: geen staart van drijvende komma. */
const fmt = (x: number): string => String(Number(x.toPrecision(6)));

/**
 * Wat het kiezen van dit profiel schrijft, gegeven wat het project al houdt.
 * `amplifierPowerW` is de waarde van het continu vermogen ZOALS ZIJ NA DE
 * KEUZE ZOU STAAN ('' = niet gesteld). Een fractie zonder grootheid wordt
 * niet geschreven en zegt waarom (P4: geen waarde verzinnen).
 */
export function profileWrites(
  p: GuidedProfile,
  amplifierPowerW: string,
): { writes: readonly ProfileWrite[]; skipped: readonly ProfileSkip[] } {
  const writes: ProfileWrite[] = [];
  const skipped: ProfileSkip[] = [];
  for (const val of p.values) {
    if (val.amount.kind === 'value') {
      writes.push({ target: val.target, rowId: val.rowId, value: fmt(val.amount.value) });
      continue;
    }
    const base = Number(amplifierPowerW.trim());
    if (amplifierPowerW.trim() === '' || !Number.isFinite(base) || base <= 0) {
      skipped.push({ target: val.target, rowId: val.rowId, pct: Math.round(val.amount.fraction * 100) });
      continue;
    }
    writes.push({ target: val.target, rowId: val.rowId, value: fmt(base * val.amount.fraction) });
  }
  return { writes, skipped };
}

/** De profielen van één vraag, in hun volgorde. */
export const profilesOf = (q: GuidedProfileQuestion): readonly GuidedProfile[] =>
  GUIDED_PROFILES.filter((p) => p.question === q);

/** Alle doelen die een vraag via haar profielen kan schrijven. */
export const targetsOf = (q: GuidedProfileQuestion): readonly ProfileTarget[] => {
  const out: ProfileTarget[] = [];
  for (const p of profilesOf(q)) for (const val of p.values) if (!out.includes(val.target)) out.push(val.target);
  return out;
};

/**
 * Welk profiel van een vraag het project nu draagt: het profiel waarvan ELKE
 * waarde met zijn naam als herkomst in de staat staat. Eén eigen bewerking
 * wist die naam, en dan is het geen profiel meer maar een mengsel — null.
 */
export function selectedProfile(
  q: GuidedProfileQuestion,
  statedBy: Readonly<Partial<Record<ProfileTarget, string>>>,
): GuidedProfile | null {
  for (const p of profilesOf(q)) {
    const by = profileStatedBy(p);
    const own = p.values.filter((val) => statedBy[val.target] === by);
    if (own.length > 0 && own.length === p.values.length) return p;
    /* Een fractie die niet geschreven kon worden telt niet mee als ontbrekend. */
    if (own.length > 0 && p.values.every((val) => statedBy[val.target] === by || val.amount.kind === 'fraction'))
      return p;
  }
  return null;
}
