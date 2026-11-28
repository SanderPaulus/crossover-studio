/**
 * UI-12 — ONE NEAR FIELD FOR A PAIR (26-11-2026).
 *
 * Sander's friend: two woofers, one far field at 0° with both playing, one near field of ONE of
 * them. The merge was already right for that set and said so nowhere: the splice fits the LEVEL
 * in the splice band, so the ~20·log N dB between one cone and the pair sits in that gain; on the
 * 0° axis N identical cones add equally at every frequency, and the near-field SHAPE is that of
 * every cone in the same box. What the tool did not ask is the one thing the fit cannot repair:
 * whether the OTHER woofers were driven during that near-field measurement. One cone driven with
 * the others passive in the same box loads the box differently — M-2 measured 15.8 dB at f_b
 * between the two states on the Koan pair (12-09-2026). That is a fact about the measurement, so
 * it is STATED (P4: unanswered is "not stated", never a guess) and reported — never corrected
 * (A3h: a model factor on top of a measurement in the wrong state is a plausible wrong layer).
 *
 * Pure: the tool and the file header read one function. No engine import.
 */

export const PAIR_NEAR_FIELD_VERSION = 'pair-near-field/1.0';

/** Whether the other members of the pair were driven while the near field was measured. */
export type PairDriven = '' | 'all' | 'one';

export interface PairNearFieldInput {
  /** How many drivers this way has (from "Your cabinet"); null = not stated. */
  count: number | null;
  /** How many files of this session are this way (each with its own near field). */
  files: number;
  driven: PairDriven;
  /** The splice gain the merge found (dB), when it has run. */
  gainDb: number | null;
}

export interface PairNearFieldFact {
  /** The one sentence: what the near field stands for and what carries the pair. */
  statement: string;
  /** The driving state, as stated. */
  driven: PairDriven;
  /** True when the stated state is the one the fit cannot repair. */
  warning: string | null;
  /** The header value (`Merge near field stands for = …`). */
  header: string;
}

/**
 * Only a pair with FEWER files than drivers has a near field standing for more than one cone:
 * a pair with one file per member (casus 1: woofer up and woofer down) is two ordinary merges and
 * this says nothing. Below two drivers there is no pair.
 */
export function pairNearFieldFact(x: PairNearFieldInput): PairNearFieldFact | null {
  const n = x.count;
  if (n === null || !Number.isFinite(n) || n < 2) return null;
  if (x.files >= n) return null;
  const gain = x.gainDb !== null && Number.isFinite(x.gainDb) ? ` (${x.gainDb >= 0 ? '+' : ''}${x.gainDb.toFixed(1)} dB on this merge)` : '';
  const statement =
    `the near field is one of ${n} identical drivers; the far field is the whole way's. The splice fits the level, so that gain${gain} carries the pair — the shape is every cone's in the same box.`;
  const drivenText = x.driven === 'all' ? `all ${n} driven during the near field: yes` : x.driven === 'one' ? `all ${n} driven during the near field: NO — one driven, the others passive` : 'driven state during the near field: not stated';
  const warning =
    x.driven === 'one'
      ? `the other ${n - 1 === 1 ? 'driver was' : `${n - 1} drivers were`} passive while this near field was measured: a passive cone in the same box loads it differently, and below the splice the shape is then not the pair's. M-2 measured 15.8 dB at f_b between the two states (Koan, 12-09-2026). Not corrected — measure again with all driven.`
      : null;
  return { statement, driven: x.driven, warning, header: `${statement} ${drivenText}` };
}
