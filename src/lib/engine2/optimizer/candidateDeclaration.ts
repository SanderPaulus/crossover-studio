/**
 * F4d — THE CANDIDATE'S DECLARATION OVER ALL TWENTY-FIVE CHOICE KEYS.
 *
 * F4c stated ten of them and wrote the other fifteen into a note beginning
 * "Search choices still inherited from the v1 chain". This module is what
 * removes that sentence, and it removes it by making every key say something
 * rather than by giving every key a value — the difference matters, because
 * seven of the fifteen have no honest value to give:
 *
 *   · `xoRange` names ONE handover, and a design with N of them has no single
 *     one to name. `xoRangePairs` is the same statement made N-way.
 *   · `xoPinHard` belongs to the hold-the-pin repair pass, which runs only
 *     after a pinned axis has escaped. Setting it up front converts every
 *     candidate's soft cage into a wall.
 *   · the solo family (`solo`, `soloSensitivityDb`, `soloTargetLevelDb`)
 *     describes a one-way design. This is not one.
 *   · `branchTargets` is the corridor the DESIGN STEP derives from the
 *     alignment it has just settled. It does not exist before that step runs,
 *     and re-deriving it here would be a second implementation of chain logic —
 *     which is how V21's two descriptions of one hierarchy started to disagree.
 *   · `angleData` and `midBranch` carry measured arrays that are ALREADY in the
 *     payload, as `input.angleData` and `input.m`. Restating them would put a
 *     second copy of the same measurement on the wire, and a second copy is a
 *     second thing that can be wrong.
 *
 * So each of those is DECLARED — absent, or delegated to a named stage, with
 * the reason. `declarationCoverage` asserts the three states cover the key set
 * exactly, and `choiceKeyGuard.test.ts` runs that assertion over what this
 * module produces. "Nothing is inherited any more" is therefore a claim the
 * build checks rather than a sentence someone wrote once.
 *
 * P4 LIVES HERE TOO. A setting the designer never filled in does not become a
 * stated value with an undefined in it — it becomes an ABSENT declaration whose
 * reason is P4. That reads correctly in the run notes ("no amplifier floor was
 * stated, so nothing judges the load") where an omitted key reads as an
 * oversight.
 *
 * NOTHING IS DECIDED HERE. Every value below is one the designer or the
 * generator already settled; this module only files them.
 */

import type { NetOptimizeOptions } from '../../netOptimizer.ts';
import type { ChoiceDeclaration, ChoiceKey } from './choices.ts';

/** The values the designer (or the app) has settled, in the tuner's own names. */
export type StatedByDesigner = Partial<
  Pick<
    NetOptimizeOptions,
    | 'band'
    | 'acousticSlopes'
    | 'staged'
    | 'ampTarget'
    | 'powerMetric'
    | 'phaseMetric'
    | 'catalogSnap'
    | 'snapPrefs'
    | 'breakupGuard'
    | 'safety'
    | 'audit'
    | 'loadFloor'
    | 'ampMinLoadOhm'
    | 'rSourceDisqualifyOhm'
    | 'zFloorStrict'
  >
>;

export interface CandidateDeclarationInput {
  /** The candidate's own cage per adjacent pair, low to high. */
  cages: readonly (readonly [number, number] | null)[];
  /**
   * The A5d.3 window FLOOR per adjacent pair — the floor that steered this
   * candidate.
   *
   * This is the key row of the whole delivery. `xoFloorPairs` used to carry the
   * v1 physics floor (near-field/far-field splice, the lower driver), which is
   * a different question answered on a different measurement (audit §6.3). On
   * the v2 route the candidate states the floor it was generated against, and
   * the v1 floor is reported beside it as a counter-judgement rather than
   * applied silently (`predesign/floorComparison.ts`).
   */
  windowFloorsHz: readonly (number | null)[];
  stated: StatedByDesigner;
  /** True when this design has more than one way — i.e. is not a solo design. */
  multiWay: boolean;
}

/** A key the designer left empty, filed with the P4 reason. */
const p4 = (key: ChoiceKey, what: string) => ({
  key,
  why:
    `the designer stated no ${what}, and absent is absent (P4) — a stated nothing judges nothing, ` +
    'here and in the tuner',
});

export function declareCandidateChoices(input: CandidateDeclarationInput): ChoiceDeclaration {
  const s = input.stated;
  const stated: Partial<NetOptimizeOptions> = {};
  const absent: { key: ChoiceKey; why: string }[] = [];
  const delegated: { key: ChoiceKey; to: string; why: string }[] = [];

  /* ---- what the CANDIDATE decided ------------------------------------- */
  stated.xoRangePairs = input.cages.map((c) => (c ? [c[0], c[1]] : null));
  const floors = input.windowFloorsHz.map((f) => (f !== null && f > 0 ? f : null));
  if (floors.some((f) => f !== null)) {
    stated.xoFloorPairs = floors;
  } else {
    absent.push({
      key: 'xoFloorPairs',
      why:
        'no A5d.3 window floor could be derived for any handover, so the candidate states none. ' +
        'The v1 physics floor is NOT substituted here: it answers a different question and is ' +
        'reported beside this field as a counter-judgement (audit §6.3)',
    });
  }

  /* ---- what the DESIGNER decided, or did not -------------------------- */
  const put = <K extends keyof StatedByDesigner & ChoiceKey>(key: K, what: string) => {
    const v = s[key];
    if (v === undefined) absent.push(p4(key, what));
    else (stated as Record<string, unknown>)[key] = v;
  };
  put('band', 'evaluation band');
  put('acousticSlopes', 'acoustic slope target');
  put('staged', 'ripple/phase target for the staged pass');
  put('ampTarget', 'amplitude target curve (on-axis or listening window)');
  put('powerMetric', 'power-response metric');
  put('phaseMetric', 'phase metric');
  put('catalogSnap', 'catalogue-snap choice');
  put('snapPrefs', 'snap preferences');
  put('breakupGuard', 'breakup-guard choice');
  put('safety', 'full-band safety set');
  put('audit', 'part-audit settings');
  put('loadFloor', 'derived amplifier-load floor');
  put('ampMinLoadOhm', 'amplifier minimum load');
  put('rSourceDisqualifyOhm', 'source-resistance disqualification limit');
  put('zFloorStrict', 'strict impedance-floor setting for the repair pass');

  /* ---- what has no value on a design of this shape -------------------- */
  absent.push({
    key: 'xoRange',
    why:
      'it pins ONE handover, and this design has ' +
      `${input.cages.length}. The same statement is made N-way by xoRangePairs, which the ` +
      'candidate does state; naming one axis here would leave the reader guessing which',
  });
  absent.push({
    key: 'xoPinHard',
    why:
      'the stiff crossing barrier belongs to the hold-the-pin repair pass, which runs only after a ' +
      'pinned axis has escaped its window. Arming it up front turns every candidate\'s cage into a ' +
      'wall, and a cage is bookkeeping rather than a promise',
  });
  if (input.multiWay) {
    for (const key of ['solo', 'soloSensitivityDb', 'soloTargetLevelDb'] as const) {
      absent.push({
        key,
        why: 'the solo family describes a single-way design, and this design has several ways',
      });
    }
  } else {
    for (const key of ['solo', 'soloSensitivityDb', 'soloTargetLevelDb'] as const) {
      absent.push({
        key,
        why:
          'this route does not generate solo candidates yet, so the candidate states nothing about ' +
          'the solo family rather than inventing a level target for it',
      });
    }
  }

  /* ---- what another named stage owns ---------------------------------- */
  delegated.push({
    key: 'branchTargets',
    to: 'the chain\'s design step',
    why:
      'the per-branch corridor is derived from the alignment and the knees that step has just ' +
      'settled, so it does not exist until it has run. Re-deriving it here would be a second ' +
      'implementation of chain logic, which is exactly how two descriptions of one thing start to ' +
      'disagree (V21, one layer up)',
  });
  delegated.push({
    key: 'angleData',
    to: 'the chain input',
    why:
      'the measured angle sets already travel in the payload as `input.angleData`. Restating them ' +
      'would put a second copy of the same measurement on the wire, and the copy is a second thing ' +
      'that can be wrong. Whether they travel at all is the app\'s decision and is visible there',
  });
  delegated.push({
    key: 'midBranch',
    to: 'the chain input',
    why:
      'the mid branch\'s response and adjustment are the payload\'s own `input.m` and `midAdjust`. ' +
      'Same argument as angleData: one copy of a measurement, not two',
  });

  return { stated: stated as ChoiceDeclaration['stated'], absent, delegated };
}
