/**
 * U-1 — WHAT AN OLD PROJECT STILL CARRIES, AND WHY IT IS SAID OUT LOUD.
 *
 * Since U-1 the interface offers one engine. The flag survives (the toggle
 * invariant is proved by turning it off programmatically) but nothing in the
 * visible UI reaches it, so every run a designer can start is a v2 run.
 *
 * That leaves a project written before U-1 in an awkward position: it was
 * saved while v1 was reachable, it may carry values on controls the v2 route
 * does not read, and NOTHING is migrated or wiped — the fields stay in the
 * project state exactly as they were written, because a conversion would be
 * this app guessing what the designer meant. The honest alternative is to say
 * it once, on the panel where the project was opened, and name the fields.
 *
 * WHAT COUNTS AS "CARRIED", and both halves are FACTS ABOUT THE FILE rather
 * than guesses about intent:
 *
 *  (a) the file says it was saved on v1 (`engineV2Enabled` absent or false —
 *      absence and false are one thing here, exactly as `selectEngine` reads
 *      them), and
 *  (b) a v1-only control in the file holds something other than the app's own
 *      starting value.
 *
 * Either half alone is enough to be worth a sentence, and the sentence says
 * which half fired. A file saved on v2 with every v1 control at its starting
 * value carries nothing and gets no notice.
 *
 * ONE HOME FOR THE STARTING VALUES. `V1_FIELD_DEFAULTS` is read three times —
 * by the `useState` initialisers in `App.tsx`, by the `??` fallbacks in
 * `applyProject`, and by the comparison below — because a fourth copy typed
 * into this file is how "unchanged" and "carried" come to disagree about the
 * same project. `v1Carryover.test.ts` pins all three call sites.
 *
 * THE LABELS COME FROM THE REGISTER (`v2InputRegister.ts`) and are never
 * re-typed here: I-1 already wrote one sentence per v1 control and this is a
 * second reader of it, not a second author.
 */

import { V2_INPUT_REGISTER, type V2InputRow } from './v2InputRegister.ts';

/**
 * The three v1-only controls a PROJECT FILE carries, with the value the app
 * starts them at. The other two v1-legacy inputs of the register
 * (`errorSmoothOct`, `scan3Mode`, `bomCapEur`) live in `localStorage` and not
 * in the file, so a project cannot carry them and this notice cannot honestly
 * claim it does.
 */
export type V1FieldKey = 'hpLpPref' | 'hpLpPrefLow' | 'excursionSpl';

export const V1_FIELD_DEFAULTS: Readonly<Record<V1FieldKey, string>> = Object.freeze({
  /** Preferred HP/LP alignment, high (mid-tweeter) crossing. 'auto' = free. */
  hpLpPref: 'auto',
  /** Preferred HP/LP alignment, low (woofer-mid) crossing. 'auto' = free. */
  hpLpPrefLow: 'auto',
  /** The SPL the v1 excursion floor is computed for (dB). */
  excursionSpl: '96',
});

/** Which register row explains a carried field. Two keys share one row. */
const ROW_OF: Readonly<Record<V1FieldKey, string>> = Object.freeze({
  hpLpPref: 'hpLpPref',
  hpLpPrefLow: 'hpLpPref',
  excursionSpl: 'excursionSpl',
});

/**
 * Which of the two crossings a key is about — a DISCRIMINATOR and not a second
 * label. `hpLpPref` and `hpLpPrefLow` share one register row whose own label
 * already names both crossings ("low xo / high xo"), so a notice that printed
 * the label twice would read as one field stated twice. Empty where the key is
 * the only one on its row.
 */
const WHICH_OF: Readonly<Record<V1FieldKey, string>> = Object.freeze({
  hpLpPref: 'high crossing',
  hpLpPrefLow: 'low crossing',
  excursionSpl: '',
});

/** One carried field: what the file holds, and the register's own sentence. */
export interface V1CarriedField {
  readonly key: V1FieldKey;
  /** What the file holds for it. */
  readonly value: string;
  /** The register row that explains why v2 does not read it. */
  readonly row: V2InputRow;
}

export interface V1Carryover {
  /** The file says it ran on v1 (`engineV2Enabled` absent or false). */
  readonly savedOnV1: boolean;
  /** v1-only controls the file holds away from their starting value. */
  readonly fields: readonly V1CarriedField[];
}

/** The slice of a project file this reads. Nothing else is touched. */
export interface V1CarryoverInput {
  readonly engineV2Enabled?: boolean;
  readonly hpLpPref?: string;
  readonly hpLpPrefLow?: string;
  readonly excursionSpl?: string;
}

const rowById = (id: string): V2InputRow => {
  const row = V2_INPUT_REGISTER.find((r) => r.id === id);
  /* Not a runtime guard so much as a build-time one: the ids above are the
     register's, and a rename there must surface here rather than silently
     drop a field from the notice. */
  if (!row) throw new Error(`v1Carryover: no register row "${id}"`);
  return row;
};

/**
 * What this project carries that engine v2 does not read, or `null` when it
 * carries nothing. Never mutates and never migrates: it reads.
 */
export function v1CarryoverOf(file: V1CarryoverInput): V1Carryover | null {
  const savedOnV1 = file.engineV2Enabled !== true;
  const fields: V1CarriedField[] = [];
  for (const key of Object.keys(V1_FIELD_DEFAULTS) as V1FieldKey[]) {
    const held = file[key];
    /* Absent is the starting value, not a carried one: a file written before
       the field existed says nothing about it. */
    if (held === undefined || held === V1_FIELD_DEFAULTS[key]) continue;
    fields.push({ key, value: held, row: rowById(ROW_OF[key]) });
  }
  if (!savedOnV1 && fields.length === 0) return null;
  return { savedOnV1, fields };
}

/**
 * The sentence the project panel prints once, after the file is opened.
 *
 * It says what is true and offers nothing: no migration, no "fix this", no
 * button that would convert a v1 setting into a v2 requirement. The fields
 * stay where they are and keep their values.
 */
export function describeV1Carryover(c: V1Carryover): string {
  const head = c.savedOnV1
    ? 'This project was saved on engine v1. The app now runs engine v2 only.'
    : 'This project carries v1 controls that engine v2 does not read.';
  if (c.fields.length === 0) {
    return `${head} Nothing was changed or converted; every setting it holds is still in the project exactly as it was written.`;
  }
  const named = c.fields
    .map((f) => {
      const which = WHICH_OF[f.key];
      return `${f.row.label}${which ? `, ${which},` : ''} set to "${f.value}"`;
    })
    .join('; ');
  return (
    `${head} It still holds ${named} — engine v2 does not read these, and nothing was changed or converted: ` +
    'they stay in the project exactly as they were written.'
  );
}
